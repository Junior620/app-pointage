import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage, sendWhatsAppLocationRequest, sendWhatsAppButtons, normalizePhone } from "@/lib/whatsapp";
import { processCheckIn, processCheckOut } from "@/lib/attendance-engine";
import { parseIntent, getWelcomeMessage } from "@/lib/intent-parser";
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

      case "GREETING":
      case "HELP":
        await sendWhatsAppMessage(phone, getWelcomeMessage(employee.firstName));
        break;

      default:
        await sendWhatsAppButtons(phone);
    }
  }
}
