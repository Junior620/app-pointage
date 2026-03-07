import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage, sendWhatsAppLocationRequest, sendWhatsAppButtons, normalizePhone } from "@/lib/whatsapp";
import { processCheckIn, processCheckOut } from "@/lib/attendance-engine";
import { parseIntent, HELP_MESSAGE } from "@/lib/intent-parser";
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
          await handleMessage(message.from, message);
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
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

  const employee = await prisma.employee.findUnique({
    where: { whatsappPhone: normalizedPhone },
  });

  if (!employee) {
    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    await sendWhatsAppMessage(
      phone,
      `Votre numéro n'est pas encore lié. Veuillez vous enregistrer ici : ${baseUrl}/onboarding`
    );
    return;
  }

  if (!employee.active) {
    await sendWhatsAppMessage(phone, "Votre compte est désactivé. Contactez les RH.");
    return;
  }

  // Localisation reçue → traiter l'action en attente
  if (message.type === "location" && message.location) {
    const point: GeoPoint = {
      lat: message.location.latitude,
      lng: message.location.longitude,
    };

    const pending = pendingActions.get(normalizedPhone);
    if (!pending) {
      await sendWhatsAppMessage(
        phone,
        "Localisation reçue. Envoyez d'abord ARRIVÉ ou DÉPART, puis votre position."
      );
      return;
    }

    pendingActions.delete(normalizedPhone);

    if (pending.intent === "CHECK_IN") {
      const result = await processCheckIn(employee.id, point, pending.comment);
      await sendWhatsAppMessage(phone, result.message);
    } else {
      const result = await processCheckOut(employee.id, point, pending.comment);
      await sendWhatsAppMessage(phone, result.message);
    }
    return;
  }

  // Clic sur un bouton (Arrivé, Départ, Mon statut)
  if (message.type === "interactive" && message.interactive?.button_reply) {
    const id = message.interactive.button_reply.id;
    if (id === "BTN_ARRIVE") {
      pendingActions.set(normalizedPhone, { intent: "CHECK_IN", timestamp: Date.now() });
      await sendWhatsAppLocationRequest(phone);
    } else if (id === "BTN_DEPART") {
      pendingActions.set(normalizedPhone, { intent: "CHECK_OUT", timestamp: Date.now() });
      await sendWhatsAppLocationRequest(phone);
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

    switch (intent) {
      case "CHECK_IN":
        pendingActions.set(normalizedPhone, {
          intent: "CHECK_IN",
          comment,
          timestamp: Date.now(),
        });
        await sendWhatsAppLocationRequest(phone);
        break;

      case "CHECK_OUT":
        pendingActions.set(normalizedPhone, {
          intent: "CHECK_OUT",
          comment,
          timestamp: Date.now(),
        });
        await sendWhatsAppLocationRequest(phone);
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

      case "HELP":
        await sendWhatsAppMessage(phone, HELP_MESSAGE);
        await sendWhatsAppButtons(phone);
        break;

      default:
        await sendWhatsAppButtons(phone);
    }
  }
}
