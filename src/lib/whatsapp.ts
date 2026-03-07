import crypto from "crypto";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error("WhatsApp credentials not configured");
    return;
  }

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("WhatsApp send error:", error);
  }
}

/** Envoie un message avec boutons (Arrivé, Départ, Statut). Max 3 boutons. */
export async function sendWhatsAppButtons(to: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error("WhatsApp credentials not configured");
    return;
  }

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "Choisissez une action pour votre pointage :",
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "BTN_ARRIVE", title: "Arrivé" } },
            { type: "reply", reply: { id: "BTN_DEPART", title: "Départ" } },
            { type: "reply", reply: { id: "BTN_STATUT", title: "Mon statut" } },
          ],
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("WhatsApp buttons error:", error);
  }
}

export async function sendWhatsAppLocationRequest(
  to: string
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const baseUrl = process.env.APP_BASE_URL;

  if (!phoneNumberId || !accessToken) return;

  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body:
          `📍 Pour valider votre pointage, veuillez partager votre position.\n\n` +
          `Option 1 : Envoyez votre localisation via WhatsApp (📎 > Localisation)\n` +
          `Option 2 : Cliquez sur ce lien : ${baseUrl}/geoloc?phone=${encodeURIComponent(to)}`,
      },
    }),
  });
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;

  const expectedSig =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}
