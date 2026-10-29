import { after, NextRequest, NextResponse } from "next/server";
import {
  sendWhatsAppMessage,
  sendWhatsAppLocationRequest,
  sendWhatsAppReplyButtons,
  sendWhatsAppList,
  normalizePhone,
} from "@/lib/whatsapp";
import { INTERN_OVERTIME_REPLY, dayMenu, fullMenu, intentsFor, menuChoice } from "@/lib/whatsapp-menu";
import { parseIntent, getWelcomeMessage, HELP_MESSAGE, withoutOvertimeLines } from "@/lib/intent-parser";
import { issueLeaveFormToken } from "@/lib/leave-form-token";
import { issueMissionFormToken } from "@/lib/mission-form-token";
import {
  buildWeeklySummaryWhatsAppMessage,
  getCurrentWeekRangeUtc,
} from "@/lib/weekly-summary-text";
import { formatTime, todayDate, utcCalendarDayBounds } from "@/lib/utils";
import { findEmployeeByWhatsappPhone } from "@/lib/employee-whatsapp";
import { findOrgById, orgBaseUrl, tenantDb, type Db } from "@/lib/tenant";
import type { Intent, WhatsAppWebhookPayload, GeoPoint } from "@/types";

// Stockage temporaire des intents en attente de localisation
const pendingActions = new Map<
  string,
  { intent: "CHECK_IN" | "CHECK_OUT" | "BREAK_START" | "BREAK_END"; comment?: string; timestamp: number }
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

/** Meta exige un 200 en quelques secondes ; sinon il réessaie (délai de plusieurs minutes). */
export const maxDuration = 30;

/** wamid déjà traités (réessais Meta du même message). */
const processedWamids = new Map<string, number>();
const WAMID_TTL_MS = 24 * 60 * 60 * 1000;

function alreadyProcessedWamid(id: string | undefined): boolean {
  if (!id) return false;
  const now = Date.now();
  for (const [key, ts] of processedWamids) {
    if (now - ts > WAMID_TTL_MS) processedWamids.delete(key);
  }
  if (processedWamids.has(id)) return true;
  processedWamids.set(id, now);
  return false;
}

async function processWhatsAppPayload(body: WhatsAppWebhookPayload) {
  if (body.object !== "whatsapp_business_account") return;

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      const messages = change.value.messages;
      if (!messages) continue;

      for (const message of messages) {
        if (alreadyProcessedWamid(message.id)) {
          console.log("[WhatsApp] Message déjà traité (réessai Meta), ignore", message.id);
          continue;
        }
        console.log("[WhatsApp] Message reçu de", message.from, "type:", message.type);
        try {
          await handleMessage(message.from, message);
        } catch (err) {
          console.error("[WhatsApp] handleMessage", message.from, err);
          await sendWhatsAppMessage(
            message.from,
            "Le service a rencontré une erreur. Renvoyez *1* (arrivée) ou *2* (départ) pour recevoir le lien de pointage."
          ).catch(() => {});
        }
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: WhatsAppWebhookPayload = await request.json();
    after(() => processWhatsAppPayload(body));
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("[WhatsApp] Webhook error:", error);
    // Toujours 200 : un 500 fait réessayer Meta pendant ~10 min.
    return NextResponse.json({ status: "ok" });
  }
}

async function sendCheckInLink(
  db: Db,
  appUrl: string | null,
  phone: string,
  employeeId: string,
  normalizedPhone: string,
  comment?: string
) {
  const today = todayDate();
  const record = await db.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });
  if (record?.checkInTime) {
    await sendWhatsAppMessage(
      phone,
      `Votre arrivée est déjà enregistrée aujourd'hui à ${formatTime(record.checkInTime)}. Aucun nouveau lien n'est nécessaire.`
    );
    return;
  }
  pendingActions.set(normalizedPhone, {
    intent: "CHECK_IN",
    comment,
    timestamp: Date.now(),
  });
  await sendWhatsAppLocationRequest(phone, "CHECK_IN", appUrl);
}

async function sendCheckOutLink(
  db: Db,
  appUrl: string | null,
  phone: string,
  employeeId: string,
  normalizedPhone: string,
  comment?: string
) {
  const today = todayDate();
  const record = await db.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });
  if (record?.checkOutTime) {
    await sendWhatsAppMessage(
      phone,
      `Votre départ est déjà enregistré aujourd'hui à ${formatTime(record.checkOutTime)}. Aucun nouveau lien n'est nécessaire.`
    );
    return;
  }
  if (!record?.checkInTime) {
    await sendWhatsAppMessage(
      phone,
      "Aucune arrivée enregistrée aujourd'hui. Envoyez *1* pour pointer votre arrivée d'abord."
    );
    return;
  }
  pendingActions.set(normalizedPhone, {
    intent: "CHECK_OUT",
    comment,
    timestamp: Date.now(),
  });
  await sendWhatsAppLocationRequest(phone, "CHECK_OUT", appUrl);
}

async function handleMessage(
  phone: string,
  message: {
    type: string;
    text?: { body: string };
    location?: { latitude: number; longitude: number };
    interactive?: {
      type: string;
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string };
    };
  }
) {
  cleanPending();
  const normalizedPhone = normalizePhone(phone);
  const digitsOnly = normalizedPhone.replace(/\D/g, "");

  const employee = await findEmployeeByWhatsappPhone(phone);

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

  // Tout le traitement se fait dans l'entreprise de l'employé (données, liens, alertes).
  const org = await findOrgById(employee.organizationId);
  if (!org) {
    await sendWhatsAppMessage(phone, "Le pointage n'est pas disponible pour votre entreprise. Contactez les RH.");
    return;
  }
  const db = tenantDb(org.id);
  const appUrl = orgBaseUrl(org);

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

  const ctx: IntentContext = { db, appUrl, phone, normalizedPhone, employee };

  // Bouton ou ligne de liste du menu (y compris les anciens boutons Arrivé / Départ / Mon statut)
  if (message.type === "interactive" && message.interactive) {
    const id = message.interactive.button_reply?.id ?? message.interactive.list_reply?.id ?? "";
    const choice = menuChoice(id);
    console.log("[WhatsApp] Menu:", id, "employé:", employee.id);
    if (choice === "LIST") {
      await sendFullMenu(ctx);
    } else if (choice) {
      for (const intent of intentsFor(choice, isIntern(ctx))) await runIntent(ctx, intent);
    } else {
      await sendDayMenu(ctx, "Cette option n'est plus disponible.");
    }
    return;
  }

  // Message texte
  if (message.type === "text" && message.text) {
    const today = todayDate();
    const todayRecord = await db.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: today } },
    });
    const rawTrimmed = message.text.body.trim();
    const awaitingOvertimeReason =
      todayRecord &&
      todayRecord.checkOutTime &&
      (todayRecord.overtimeMinutes ?? 0) > 0 &&
      !todayRecord.overtimeReason;

    const { intent, comment } = parseIntent(message.text.body, {
      skipNumericMenuShortcuts: Boolean(awaitingOvertimeReason && rawTrimmed),
    });
    console.log("[WhatsApp] Intent:", intent, "employé:", employee.id);

    // Si le message ne correspond à aucune commande connue, on l'interprète
    // éventuellement comme un *motif* pour le pointage du jour (retard à l'arrivée
    // ou départ anticipé).
    if (intent === "UNKNOWN") {
      const record = todayRecord;

      const rawComment = rawTrimmed;
      if (!record || !rawComment) {
        // Pas de pointage aujourd'hui ou message vide : on retombera sur les
        // commandes par défaut plus bas.
      } else if (
        record.checkOutTime &&
        (record.overtimeMinutes ?? 0) > 0 &&
        !record.overtimeReason
      ) {
        await db.attendanceRecord.update({
          where: { id: record.id },
          data: { overtimeReason: rawComment },
        });
        await sendWhatsAppMessage(
          phone,
          `Motif des heures sup enregistré : "${rawComment}". Merci. La RH validera vos heures.`
        );
        return;
      } else if (record.checkOutTime && !record.checkOutComment) {
        await db.attendanceRecord.update({
          where: { id: record.id },
          data: { checkOutComment: rawComment },
        });
        await sendWhatsAppMessage(
          phone,
          `Motif enregistré pour votre départ : "${rawComment}". Merci.`
        );
        return;
      } else if (record.checkInStatus === "LATE" && !record.checkInComment) {
        await db.attendanceRecord.update({
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

    await runIntent(ctx, intent, comment);
  }
}

type IntentContext = {
  db: Db;
  appUrl: string | null;
  phone: string;
  normalizedPhone: string;
  employee: { id: string; firstName: string; active: boolean; kind: string };
};

/** Stagiaire : pas d'heures sup, ni dans les menus ni dans les réponses. */
function isIntern(ctx: IntentContext): boolean {
  return ctx.employee.kind === "INTERN";
}

/** Traite une intention, qu'elle vienne d'un message texte (numéro, mot-clé) ou du menu (bouton, liste). */
async function runIntent(ctx: IntentContext, intent: Intent, comment?: string) {
  const { db, appUrl, phone, normalizedPhone, employee } = ctx;
  switch (intent) {
    case "CHECK_IN":
      await sendCheckInLink(db, appUrl, phone, employee.id, normalizedPhone, comment);
      break;

    case "CHECK_OUT":
      await sendCheckOutLink(db, appUrl, phone, employee.id, normalizedPhone, comment);
      break;

    case "BREAK_START":
      pendingActions.set(normalizedPhone, {
        intent: "BREAK_START",
        timestamp: Date.now(),
      });
      await sendWhatsAppLocationRequest(phone, "BREAK_START", appUrl);
      break;

    case "BREAK_END":
      pendingActions.set(normalizedPhone, {
        intent: "BREAK_END",
        timestamp: Date.now(),
      });
      await sendWhatsAppLocationRequest(phone, "BREAK_END", appUrl);
      break;

    case "STATUS":
      await sendTodayStatus(db, phone, employee.id);
      break;

    case "MY_ATTENDANCE":
      await handleMyAttendance(db, phone, employee.id, employee.firstName);
      break;

    case "MY_ABSENCES":
      await handleMyAbsences(db, phone, employee.id, employee.firstName);
      break;

    case "MY_OVERTIME":
      if (isIntern(ctx)) await sendWhatsAppMessage(phone, INTERN_OVERTIME_REPLY);
      else await handleMyOvertime(db, phone, employee.id, employee.firstName);
      break;

    case "MY_OVERTIME_PENDING":
      if (isIntern(ctx)) await sendWhatsAppMessage(phone, INTERN_OVERTIME_REPLY);
      else await handleMyOvertimePending(db, phone, employee.id, employee.firstName);
      break;

    case "DAY_DETAIL":
      await handleDayDetail(
        db,
        phone,
        employee.id,
        employee.firstName,
        comment || ""
      );
      break;

    case "MY_MISSIONS":
      await handleMyMissions(db, phone, employee.id, employee.firstName);
      break;

    case "MY_PERMISSIONS":
      await handleMyPermissions(db, phone, employee.id, employee.firstName);
      break;

    case "MY_WEEK_SUMMARY":
      await handleMyWeekSummary(db, phone, employee.id, employee.firstName);
      break;

    case "DEMAND_LEAVE_FORM":
      await handleDemandLeaveFormLink(phone, employee, appUrl);
      break;

    case "DEMAND_MISSION_FORM":
      await handleDemandMissionFormLink(phone, employee, appUrl);
      break;

    case "GREETING":
      await sendDayMenu(ctx, `👋 Bonjour ${employee.firstName}`);
      break;

    case "HELP":
      await sendFullMenu(ctx);
      break;

    default:
      await sendDayMenu(ctx, "Je n'ai pas compris votre message.");
  }
}

function findTodayRecord(db: Db, employeeId: string) {
  return db.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date: todayDate() } },
  });
}

/** Boutons adaptés à l'état du jour ; menu texte si l'envoi interactif échoue. */
async function sendDayMenu(ctx: IntentContext, intro: string) {
  const { body, buttons } = dayMenu(intro, await findTodayRecord(ctx.db, ctx.employee.id));
  if (!(await sendWhatsAppReplyButtons(ctx.phone, body, buttons))) {
    const text = getWelcomeMessage(ctx.employee.firstName);
    await sendWhatsAppMessage(ctx.phone, isIntern(ctx) ? withoutOvertimeLines(text) : text);
  }
}

/** Liste regroupée (« Plus d'options », « menu ») ; liste texte des commandes si l'envoi échoue. */
async function sendFullMenu(ctx: IntentContext) {
  const intern = isIntern(ctx);
  const { body, buttonText, sections } = fullMenu(await findTodayRecord(ctx.db, ctx.employee.id), { intern });
  if (!(await sendWhatsAppList(ctx.phone, body, buttonText, sections))) {
    await sendWhatsAppMessage(ctx.phone, intern ? withoutOvertimeLines(HELP_MESSAGE) : HELP_MESSAGE);
  }
}

async function sendTodayStatus(db: Db, phone: string, employeeId: string) {
  const record = await findTodayRecord(db, employeeId);
  if (!record) {
    await sendWhatsAppMessage(phone, "Aucun pointage aujourd'hui.");
    return;
  }
  let statusMsg = `📊 *Pointage du jour*\n`;
  if (record.checkInTime) {
    const inTime = formatTime(record.checkInTime);
    statusMsg += `\n✅ Arrivée: ${inTime} (${record.checkInStatus === "LATE" ? "En retard" : "À l'heure"})`;
  }
  if (record.checkOutTime) {
    const outTime = formatTime(record.checkOutTime);
    statusMsg += `\n🚪 Départ: ${outTime} (${record.checkOutStatus === "AUTO" ? "Auto" : "Manuel"})`;
  } else {
    statusMsg += `\n⏳ Départ: Non encore pointé`;
  }
  if (record.breakStartTime) {
    const breakStartTime = formatTime(record.breakStartTime);
    statusMsg += `\n☕ Départ pause: ${breakStartTime}`;
    if (record.breakEndTime) {
      const breakEndTime = formatTime(record.breakEndTime);
      statusMsg += `\n🔁 Retour pause: ${breakEndTime}`;
    } else {
      statusMsg += `\n⚠️ Retour pause: non pointé`;
    }
  }
  statusMsg += `\nStatut: ${record.finalStatus}`;
  await sendWhatsAppMessage(phone, statusMsg);
}

async function handleDemandLeaveFormLink(
  phone: string,
  employee: { id: string; firstName: string; active: boolean },
  appUrl: string | null
) {
  if (!employee.active) {
    await sendWhatsAppMessage(
      phone,
      "Votre compte est inactif. Pour toute demande, contactez les RH."
    );
    return;
  }

  const base = appUrl;
  if (!base) {
    await sendWhatsAppMessage(
      phone,
      "Le service de formulaire n'est pas configuré (URL de l'application). Contactez les RH."
    );
    return;
  }

  let token: string;
  try {
    token = issueLeaveFormToken(employee.id);
  } catch (e) {
    console.error("[WhatsApp] leave form token:", e);
    await sendWhatsAppMessage(
      phone,
      "Service temporairement indisponible. Réessayez plus tard ou contactez les RH."
    );
    return;
  }

  const url = `${base}/leave-request/new?t=${encodeURIComponent(token)}`;
  await sendWhatsAppMessage(
    phone,
    `📝 *Demande d'autorisation d'absence*\n\nBonjour ${employee.firstName},\n\nOuvrez ce lien sur votre téléphone pour remplir le formulaire officiel (valide environ 20 minutes) :\n\n${url}\n\nAprès envoi, les RH recevront la demande pour validation. Vous serez notifié sur WhatsApp après décision.\n\n💡 Tapez aussi *« demander une autorisation »* pour recevoir ce lien à tout moment.`
  );
}

async function handleDemandMissionFormLink(
  phone: string,
  employee: { id: string; firstName: string; active: boolean },
  appUrl: string | null
) {
  if (!employee.active) {
    await sendWhatsAppMessage(
      phone,
      "Votre compte est inactif. Pour toute demande, contactez les RH."
    );
    return;
  }

  const base = appUrl;
  if (!base) {
    await sendWhatsAppMessage(
      phone,
      "Le service de formulaire mission n'est pas configuré (URL de l'application). Contactez les RH."
    );
    return;
  }

  let token: string;
  try {
    token = issueMissionFormToken(employee.id);
  } catch (e) {
    console.error("[WhatsApp] mission form token:", e);
    await sendWhatsAppMessage(
      phone,
      "Service temporairement indisponible. Réessayez plus tard ou contactez les RH."
    );
    return;
  }

  const url = `${base}/mission-request/new?t=${encodeURIComponent(token)}`;
  await sendWhatsAppMessage(
    phone,
    `🌍 *Demande d'ordre de mission*\n\nBonjour ${employee.firstName},\n\nOuvrez ce lien sur votre téléphone pour remplir votre demande de mission (valide environ 20 minutes) :\n\n${url}\n\nAprès envoi, la RH/l'administrateur pourra valider puis télécharger votre ordre de mission pour impression et signatures.\n\n💡 Tapez aussi *« demander une mission »* pour recevoir ce lien à tout moment.`
  );
}

async function handleMyAttendance(
  db: Db,
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const records = await db.attendanceRecord.findMany({
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
    const inTime = formatTime(r.checkInTime);
    const outTime = formatTime(r.checkOutTime);
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
  db: Db,
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const absences = await db.attendanceRecord.findMany({
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

  let msg = `📅 *Absences au pointage (3 derniers mois) — ${firstName}*\n\n`;
  msg += `Total : ${absences.length} jour(s) marqué(s) absent sans pointage valide\n\n`;

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
  db: Db,
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const records = await db.attendanceRecord.findMany({
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
  db: Db,
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const records = await db.attendanceRecord.findMany({
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
  db: Db,
  phone: string,
  employeeId: string,
  firstName: string
) {
  const { monday, saturday } = getCurrentWeekRangeUtc();
  const [records, pendingLeaveRequests] = await Promise.all([
    db.attendanceRecord.findMany({
      where: {
        employeeId,
        date: { gte: monday, lte: saturday },
      },
    }),
    db.leaveRequest.count({
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
  db: Db,
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const { dayStart, dayEnd } = utcCalendarDayBounds(now);

  const [pending, approvedActive] = await Promise.all([
    db.leaveRequest.findMany({
      where: { employeeId, status: "PENDING", cancelledAt: null },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        cancelledAt: null,
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
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
      `📋 *${firstName}*, aucune autorisation d'absence en cours : ni demande en attente de la RH, ni période approuvée couvrant aujourd'hui.\n\nPour l'historique récent (missions + autorisations d'absence), répondez *7*. Pour les jours marqués *absent* au pointage, répondez *11*.`
    );
    return;
  }

  let msg = `📋 *Mes autorisations d'absence en cours — ${firstName}*\n\n`;
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
  db: Db,
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

  const record = await db.attendanceRecord.findUnique({
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
    const inStr = formatTime(record.checkInTime);
    msg += `✅ Arrivée : ${inStr} ${
      record.checkInStatus === "LATE" ? "(en retard)" : ""
    }\n`;
  } else {
    msg += `✅ Arrivée : —\n`;
  }

  if (record.checkOutTime) {
    const outStr = formatTime(record.checkOutTime);
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

  // Mission / autorisation d'absence liée (via finalStatus)
  if (record.finalStatus === "MISSION") {
    msg += `🌍 Statut journée : Mission\n`;
  } else if (record.finalStatus === "PERMISSION") {
    msg += `📋 Statut journée : Autorisation d'absence\n`;
  } else {
    msg += `📋 Statut journée : ${record.finalStatus}\n`;
  }

  await sendWhatsAppMessage(phone, msg);
}

async function handleMyMissions(
  db: Db,
  phone: string,
  employeeId: string,
  firstName: string
) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  const missions = await db.mission.findMany({
    where: {
      employeeId,
      startDate: { gte: threeMonthsAgo },
    },
    orderBy: { startDate: "desc" },
  });

  const leaves = await db.leaveRequest.findMany({
    where: {
      employeeId,
      startDate: { gte: threeMonthsAgo },
    },
    orderBy: { startDate: "desc" },
  });

  if (missions.length === 0 && leaves.length === 0) {
    await sendWhatsAppMessage(
      phone,
      `🌍 *${firstName}*, aucune mission ni autorisation d'absence ces 3 derniers mois.`
    );
    return;
  }

  let msg = `🌍 *Missions & autorisations d'absence — ${firstName}*\n\n`;

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
    msg += `\n*Autorisations d'absence (${leaves.length}) :*\n`;
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
