import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage, sendWhatsAppLocationRequest, sendWhatsAppButtons, normalizePhone } from "@/lib/whatsapp";
import { processCheckIn, processCheckOut } from "@/lib/attendance-engine";
import { parseIntent, getWelcomeMessage } from "@/lib/intent-parser";
import {
  buildWeeklySummaryWhatsAppMessage,
  getCurrentWeekRangeUtc,
} from "@/lib/weekly-summary-text";
import type { WhatsAppWebhookPayload, GeoPoint } from "@/types";

// Stockage temporaire des intents en attente de localisation
const pendingActions = new Map<
  string,
  { intent: "CHECK_IN" | "CHECK_OUT"; comment?: string; timestamp: number }
>();

// Nettoyage des intents expirés (> 10 min)
function cleanPending() {
  const now = Date.now();
  for (const [key, val] of pendingActions.entries()) {
    if (now - val.timestamp > 10 * 60 * 1000) pendingActions.delete(key);
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body: WhatsAppWebhookPayload = await request.json();

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" });
    }

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const messages = change.value.messages;
        if (!messages) continue;

        for (const message of messages) {
          console.log("[WhatsApp] Message reçu de", message.from, "type:", message.type);
          await handleMessage(message.from, message);
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[WhatsApp] Webhook error:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

async function handleMessage(
  phone: string,
  message: {
    type: string;
    text?: { body: string };
    location?: { latitude: number; longitude: number };
    interactive?: { type: string; button_reply?: { id: string; title: string } };
  }
) {
  cleanPending();
  const normalizedPhone = normalizePhone(phone);
  const digitsOnly = normalizedPhone.replace(/\D/g, "");

  const employee = await prisma.employee.findFirst({
    where: {
      OR: [
        { whatsappPhone: normalizedPhone },
        { whatsappPhone: digitsOnly },
        { whatsappPhone: `+${digitsOnly}` },
      ],
    },
  });

    if (!employee) {
      console.log("[WhatsApp] Numéro non lié:", digitsOnly || normalizedPhone);
      await sendWhatsAppMessage(
        phone,
        "Votre numéro n'est pas encore lié au système de pointage. Veuillez contacter le service RH pour qu'il vous ajoute et renseigne votre numéro WhatsApp."
      );
      return;
    }

  if (!employee.active) {
    await sendWhatsAppMessage(phone, "Votre compte est désactivé. Contactez les RH.");
    return;
  }

  // Localisation envoyée via WhatsApp : refusée (anti-fraude). On n'accepte que la position à l'instant via le lien.
  if (message.type === "location" && message.location) {
    const pending = pendingActions.get(normalizedPhone);
    if (!pending) {
      await sendWhatsAppMessage(
        phone,
        "Envoyez d'abord ARRIVÉ ou DÉPART pour recevoir le lien de pointage."
      );
      return;
    }
    await sendWhatsAppMessage(
      phone,
      "Pour des raisons de vérification, le pointage doit se faire via le *lien* envoyé (position enregistrée à l'instant). Veuillez cliquer sur le lien reçu et appuyer sur « Récupérer ma position maintenant »."
    );
    return;
  }

  // Clic sur un bouton (Arrivé, Départ, Mon statut)
  if (message.type === "interactive" && message.interactive?.button_reply) {
    const id = message.interactive.button_reply.id;
    if (id === "BTN_ARRIVE") {
      pendingActions.set(normalizedPhone, { intent: "CHECK_IN", timestamp: Date.now() });
      await sendWhatsAppLocationRequest(phone, "CHECK_IN");
    } else if (id === "BTN_DEPART") {
      pendingActions.set(normalizedPhone, { intent: "CHECK_OUT", timestamp: Date.now() });
      await sendWhatsAppLocationRequest(phone, "CHECK_OUT");
    } else if (id === "BTN_STATUT") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const record = await prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: today } },
      });
      if (!record) {
        await sendWhatsAppMessage(phone, "Aucun pointage aujourd'hui.");
      } else {
        let statusMsg = `📊 *Pointage du jour*\n`;
        if (record.checkInTime) {
          const inTime = record.checkInTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          statusMsg += `\n✅ Arrivée: ${inTime} (${record.checkInStatus === "LATE" ? "En retard" : "À l'heure"})`;
        }
        if (record.checkOutTime) {
          const outTime = record.checkOutTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
          statusMsg += `\n🚪 Départ: ${outTime} (${record.checkOutStatus === "AUTO" ? "Auto" : "Manuel"})`;
        } else {
          statusMsg += `\n⏳ Départ: Non encore pointé`;
        }
        statusMsg += `\nStatut: ${record.finalStatus}`;
        await sendWhatsAppMessage(phone, statusMsg);
      }
    }
    return;
  }

  // Message texte
  if (message.type === "text" && message.text) {
    const { intent, comment } = parseIntent(message.text.body);
    console.log("[WhatsApp] Intent:", intent, "employé:", employee.id);

    // Si le message ne correspond à aucune commande connue, on l'interprète
    // éventuellement comme un *motif* pour le pointage du jour (retard à l'arrivée
    // ou départ anticipé).
    if (intent === "UNKNOWN") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const record = await prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: today } },
      });

      const rawComment = message.text.body.trim();
      if (!record || !rawComment) {
        // Pas de pointage aujourd'hui ou message vide : on retombera sur les
        // commandes par défaut plus bas.
      } else if (
        record.checkOutTime &&
        (record.overtimeMinutes ?? 0) > 0 &&
        !record.overtimeReason
      ) {
        await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { overtimeReason: rawComment },
        });
        await sendWhatsAppMessage(
          phone,
          `Motif des heures sup enregistré : "${rawComment}". Merci. La RH validera vos heures.`
        );
        return;
      } else if (record.checkOutTime && !record.checkOutComment) {
        await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { checkOutComment: rawComment },
        });
        await sendWhatsAppMessage(
          phone,
          `Motif enregistré pour votre départ : "${rawComment}". Merci.`
        );
        return;
      } else if (record.checkInStatus === "LATE" && !record.checkInComment) {
        await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { checkInComment: rawComment },
        });
        await sendWhatsAppMessage(
          phone,
          `Motif enregistré pour votre retard : "${rawComment}". Merci.`
        );
        return;
      }
    }

    switch (intent) {
      case "CHECK_IN":
        pendingActions.set(normalizedPhone, {
          intent: "CHECK_IN",
          comment,
          timestamp: Date.now(),
        });
        await sendWhatsAppLocationRequest(phone, "CHECK_IN");
        break;

      case "CHECK_OUT":
        pendingActions.set(normalizedPhone, {
          intent: "CHECK_OUT",
          comment,
          timestamp: Date.now(),
        });
        await sendWhatsAppLocationRequest(phone, "CHECK_OUT");
        break;

      case "STATUS": {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const record = await prisma.attendanceRecord.findUnique({
          where: {
            employeeId_date: { employeeId: employee.id, date: today },
          },
        });

        if (!record) {
          await sendWhatsAppMessage(phone, "Aucun pointage aujourd'hui.");
        } else {
          let statusMsg = `📊 *Pointage du jour*\n`;
          if (record.checkInTime) {
            const inTime = record.checkInTime.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            });
            statusMsg += `\n✅ Arrivée: ${inTime} (${record.checkInStatus === "LATE" ? "En retard" : "À l'heure"})`;
          }
          if (record.checkOutTime) {
            const outTime = record.checkOutTime.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            });
            statusMsg += `\n🚪 Départ: ${outTime} (${record.checkOutStatus === "AUTO" ? "Auto" : "Manuel"})`;
          } else {
            statusMsg += `\n⏳ Départ: Non encore pointé`;
          }
          statusMsg += `\nStatut: ${record.finalStatus}`;
          await sendWhatsAppMessage(phone, statusMsg);
        }
        break;
      }

      case "MY_ATTENDANCE":
        await handleMyAttendance(phone, employee.id, employee.firstName);
        break;

      case "MY_ABSENCES":
        await handleMyAbsences(phone, employee.id, employee.firstName);
        break;

      case "MY_OVERTIME":
        await handleMyOvertime(phone, employee.id, employee.firstName);
        break;

      case "MY_OVERTIME_PENDING":
        await handleMyOvertimePending(phone, employee.id, employee.firstName);
        break;

      case "DAY_DETAIL":
        await handleDayDetail(
          phone,
          employee.id,
          employee.firstName,
          comment || ""
        );
        break;

      case "MY_MISSIONS":
        await handleMyMissions(phone, employee.id, employee.firstName);
        break;

      case "MY_PERMISSIONS":
        await handleMyPermissions(phone, employee.id, employee.firstName);
        break;

      case "MY_WEEK_SUMMARY":
        await handleMyWeekSummary(phone, employee.id, employee.firstName);
        break;

      case "GREETING":
      case "HELP":
        await sendWhatsAppMessage(phone, getWelcomeMessage(employee.firstName));
        break;

      default:
        await sendWhatsAppButtons(phone);
    }
  }
}

async function handleMyAttendance(
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const records = await prisma.attendanceRecord.findMany({
    where: { employeeId, date: { gte: startOfMonth } },
    orderBy: { date: "desc" },
  });

  if (records.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `📋 *${firstName}*, aucun pointage ce mois-ci.`
    );
    return;
  }

  const present = records.filter((r) => r.finalStatus === "PRESENT").length;
  const absent = records.filter((r) => r.finalStatus === "ABSENT").length;
  const late = records.filter((r) => r.checkInStatus === "LATE").length;
  const onTime = records.filter((r) => r.checkInStatus === "ON_TIME").length;
  const totalOT = records.reduce(
    (s, r) =>
      s +
      (["APPROVED", null].includes(r.overtimeStatus as string | null)
        ? r.overtimeMinutes ?? 0
        : 0),
    0
  );

  const monthName = now.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  let msg = `📋 *Pointages de ${monthName}*\n\n`;
  msg += `✅ Présent : ${present} jour(s)\n`;
  msg += `❌ Absent : ${absent} jour(s)\n`;
  msg += `⏰ À l'heure : ${onTime} | En retard : ${late}\n`;
  if (totalOT > 0) {
    msg += `💪 Heures sup : ${Math.floor(totalOT / 60)}h${(totalOT % 60).toString().padStart(2, "0")}\n`;
  }

  msg += `\n📊 *5 derniers jours :*\n`;
  for (const r of records.slice(0, 5)) {
    const dateStr = r.date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
    const inTime = r.checkInTime
      ? r.checkInTime.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    const outTime = r.checkOutTime
      ? r.checkOutTime.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    const status =
      r.finalStatus === "PRESENT"
        ? "✅"
        : r.finalStatus === "ABSENT"
          ? "❌"
          : "📌";
    msg += `${status} ${dateStr} : ${inTime} → ${outTime}\n`;
  }

  await sendWhatsAppMessage(phone, msg);
}

async function handleMyAbsences(
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const absences = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      finalStatus: "ABSENT",
      date: { gte: threeMonthsAgo },
    },
    orderBy: { date: "desc" },
  });

  if (absences.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `📅 *${firstName}*, aucune absence ces 3 derniers mois. Excellent !`
    );
    return;
  }

  let msg = `📅 *Absences (3 derniers mois) — ${firstName}*\n\n`;
  msg += `Total : ${absences.length} jour(s) d'absence\n\n`;

  for (const a of absences.slice(0, 10)) {
    const dateStr = a.date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "long",
    });
    msg += `❌ ${dateStr}\n`;
  }

  if (absences.length > 10) {
    msg += `\n... et ${absences.length - 10} autres jour(s)`;
  }

  await sendWhatsAppMessage(phone, msg);
}

async function handleMyOvertime(
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      date: { gte: startOfMonth },
      overtimeMinutes: { gt: 0 },
      OR: [
        { overtimeStatus: "APPROVED" },
        { overtimeStatus: null },
      ],
    },
    orderBy: { date: "desc" },
  });

  const totalOT = records.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0);
  const monthName = now.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  if (records.length === 0 || totalOT === 0) {
    await sendWhatsAppMessage(
      phone,
      `⏰ *${firstName}*, aucune heure supplémentaire validée en ${monthName}.`
    );
    return;
  }

  let msg = `⏰ *Heures supplémentaires validées — ${monthName}*\n\n`;
  msg += `Total : *${Math.floor(totalOT / 60)}h${(totalOT % 60).toString().padStart(2, "0")}*\n`;
  msg += `Jours : ${records.length}\n\n`;

  for (const r of records.slice(0, 8)) {
    const dateStr = r.date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
    const ot = r.overtimeMinutes ?? 0;
    msg += `💪 ${dateStr} : +${Math.floor(ot / 60)}h${(ot % 60).toString().padStart(2, "0")}\n`;
  }

  await sendWhatsAppMessage(phone, msg);
}

async function handleMyOvertimePending(
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId,
      date: { gte: threeMonthsAgo },
      overtimeMinutes: { gt: 0 },
      overtimeStatus: "PENDING",
    },
    orderBy: { date: "desc" },
  });

  if (records.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `⏳ *${firstName}*, aucune heure supplémentaire en attente de validation sur les 3 derniers mois.`
    );
    return;
  }

  let msg = `⏳ *Heures sup en attente (3 derniers mois)*\n\n`;
  msg += `Total : ${records.length} jour(s)\n\n`;

  for (const r of records.slice(0, 10)) {
    const dateStr = r.date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const ot = r.overtimeMinutes ?? 0;
    msg += `• ${dateStr} : +${Math.floor(ot / 60)}h${(ot % 60)
      .toString()
      .padStart(2, "0")}\n`;
  }

  if (records.length > 10) {
    msg += `\n… et ${records.length - 10} autre(s) jour(s) en attente.`;
  }

  await sendWhatsAppMessage(phone, msg);
}

async function handleMyWeekSummary(
  phone: string,
  employeeId: string,
  firstName: string
) {
  const { monday, saturday } = getCurrentWeekRangeUtc();
  const [records, pendingLeaveRequests] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        date: { gte: monday, lte: saturday },
      },
    }),
    prisma.leaveRequest.count({
      where: { employeeId, status: "PENDING", cancelledAt: null },
    }),
  ]);
  const msg = buildWeeklySummaryWhatsAppMessage(
    firstName,
    monday,
    saturday,
    records,
    { pendingLeaveRequests }
  );
  await sendWhatsAppMessage(phone, msg);
}

async function handleMyPermissions(
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
  );

  const [pending, approvedActive] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employeeId, status: "PENDING", cancelledAt: null },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        cancelledAt: null,
        startDate: { lte: today },
        endDate: { gte: today },
      },
      orderBy: { endDate: "asc" },
      take: 12,
    }),
  ]);

  const seen = new Set<string>();
  const rows: typeof pending = [];
  for (const l of pending) {
    if (!seen.has(l.id)) {
      seen.add(l.id);
      rows.push(l);
    }
  }
  for (const l of approvedActive) {
    if (!seen.has(l.id)) {
      seen.add(l.id);
      rows.push(l);
    }
  }

  if (rows.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `📋 *${firstName}*, aucune permission en cours : ni demande en attente de la RH, ni période approuvée couvrant aujourd'hui.\n\nPour l'historique récent (missions + permissions), répondez *7*.`
    );
    return;
  }

  let msg = `📋 *Mes permissions en cours — ${firstName}*\n\n`;
  msg += `⏳ = en attente de validation • ✅ = approuvée (période en cours)\n\n`;

  for (const l of rows.slice(0, 10)) {
    const from = l.startDate.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const to = l.endDate.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const icon = l.status === "PENDING" ? "⏳" : "✅";
    const label = l.status === "PENDING" ? "En attente" : "Approuvée";
    msg += `${icon} *${label}* ${from} → ${to}\n${l.reason}\n\n`;
  }

  if (rows.length > 10) {
    msg += `… et ${rows.length - 10} autre(s) demande(s). Consultez l'app RH pour le détail.`;
  }

  await sendWhatsAppMessage(phone, msg.trimEnd());
}

async function handleDayDetail(
  phone: string,
  employeeId: string,
  firstName: string,
  rawDate: string
) {
  const cleaned = rawDate.trim();
  if (!cleaned) {
    await sendWhatsAppMessage(
      phone,
      `📅 *${firstName}*, merci de préciser une date au format JJ/MM.\n\nExemple :\n_détail jour 15/03_`
    );
    return;
  }

  const match = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})([\/\-](\d{2,4}))?/);
  if (!match) {
    await sendWhatsAppMessage(
      phone,
      `📅 Format invalide. Utilisez : JJ/MM ou JJ/MM/AAAA.\nExemple : _détail jour 15/03_`
    );
    return;
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const year =
    match[4] != null ? parseInt(match[4], 10) : new Date().getFullYear();

  const target = new Date(year, month, day);
  target.setHours(0, 0, 0, 0);

  const record = await prisma.attendanceRecord.findUnique({
    where: {
      employeeId_date: { employeeId, date: target },
    },
  });

  if (!record) {
    await sendWhatsAppMessage(
      phone,
      `📅 Aucun pointage trouvé pour le ${target.toLocaleDateString(
        "fr-FR"
      )}.`
    );
    return;
  }

  let msg = `📅 *Détail du ${target.toLocaleDateString("fr-FR")}* — ${firstName}\n\n`;

  if (record.checkInTime) {
    const inStr = record.checkInTime.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    msg += `✅ Arrivée : ${inStr} ${
      record.checkInStatus === "LATE" ? "(en retard)" : ""
    }\n`;
  } else {
    msg += `✅ Arrivée : —\n`;
  }

  if (record.checkOutTime) {
    const outStr = record.checkOutTime.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    msg += `🚪 Départ : ${outStr} ${
      record.checkOutStatus === "AUTO" ? "(auto)" : "(manuel)"
    }\n`;
  } else {
    msg += `🚪 Départ : —\n`;
  }

  if (record.totalMinutes != null) {
    const h = Math.floor(record.totalMinutes / 60);
    const m = record.totalMinutes % 60;
    msg += `⏱️ Durée : ${h}h${m.toString().padStart(2, "0")}\n`;
  }

  const ot = record.overtimeMinutes ?? 0;
  if (ot > 0) {
    const h = Math.floor(ot / 60);
    const m = ot % 60;
    const statusIcon =
      record.overtimeStatus === "APPROVED"
        ? "✅"
        : record.overtimeStatus === "PENDING"
        ? "⏳"
        : record.overtimeStatus === "REJECTED"
        ? "❌"
        : "•";
    const statusLabel =
      record.overtimeStatus === "APPROVED"
        ? "Validée"
        : record.overtimeStatus === "PENDING"
        ? "En attente"
        : record.overtimeStatus === "REJECTED"
        ? "Refusée"
        : "—";
    msg += `\n💪 Heures sup : ${h}h${m
      .toString()
      .padStart(2, "0")} ${statusIcon} (${statusLabel})\n`;
  } else {
    msg += `\n💪 Heures sup : 0\n`;
  }

  if (record.overtimeReason) {
    msg += `📝 Motif OT : ${record.overtimeReason}\n`;
  }

  // Mission / permission liée (via finalStatus)
  if (record.finalStatus === "MISSION") {
    msg += `🌍 Statut journée : Mission\n`;
  } else if (record.finalStatus === "PERMISSION") {
    msg += `📋 Statut journée : Permission\n`;
  } else {
    msg += `📋 Statut journée : ${record.finalStatus}\n`;
  }

  await sendWhatsAppMessage(phone, msg);
}

async function handleMyMissions(
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const missions = await prisma.mission.findMany({
    where: {
      employeeId,
      startDate: { gte: threeMonthsAgo },
    },
    orderBy: { startDate: "desc" },
  });

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      employeeId,
      startDate: { gte: threeMonthsAgo },
    },
    orderBy: { startDate: "desc" },
  });

  if (missions.length === 0 && leaves.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `🌍 *${firstName}*, aucune mission ni permission ces 3 derniers mois.`
    );
    return;
  }

  let msg = `🌍 *Missions & Permissions — ${firstName}*\n\n`;

  if (missions.length > 0) {
    msg += `*Missions (${missions.length}) :*\n`;
    for (const m of missions.slice(0, 5)) {
      const from = m.startDate.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      });
      const to = m.endDate.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      });
      const statusIcon =
        m.status === "APPROVED" ? "✅" : m.status === "PENDING" ? "⏳" : "❌";
      const ann = m.cancelledAt ? " 🚫 *annulée*" : "";
      msg += `${statusIcon} ${from} → ${to} : ${m.reason}${m.location ? ` (${m.location})` : ""}${ann}\n`;
    }
  }

  if (leaves.length > 0) {
    msg += `\n*Permissions (${leaves.length}) :*\n`;
    for (const l of leaves.slice(0, 5)) {
      const from = l.startDate.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      });
      const to = l.endDate.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      });
      const statusIcon =
        l.status === "APPROVED" ? "✅" : l.status === "PENDING" ? "⏳" : "❌";
      const ann = l.cancelledAt ? " 🚫 *annulée*" : "";
      msg += `${statusIcon} ${from} → ${to} : ${l.reason}${ann}\n`;
    }
  }

  await sendWhatsAppMessage(phone, msg);
}
