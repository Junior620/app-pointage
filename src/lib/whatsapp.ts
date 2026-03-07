import crypto from "crypto";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

/** Numéro au format attendu par l'API WhatsApp : chiffres uniquement, sans + */
function toWhatsAppPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error("[WhatsApp] Envoi impossible : WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquant");
    return;
  }

  const toNumber = toWhatsAppPhone(to);
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toNumber,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[WhatsApp] Erreur envoi message vers", toNumber, ":", response.status, error);
  }
}

/** Envoie un message avec boutons (Arrivé, Départ, Statut). Max 3 boutons. */
export async function sendWhatsAppButtons(to: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) return;

  const toNumber = toWhatsAppPhone(to);
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toNumber,
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
    console.error("[WhatsApp] Erreur envoi boutons vers", toNumber, ":", response.status, error);
  }
}

export async function sendWhatsAppLocationRequest(
  to: string,
  action: "CHECK_IN" | "CHECK_OUT"
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const baseUrl = process.env.APP_BASE_URL;

  if (!phoneNumberId || !accessToken) return;

  const toNumber = toWhatsAppPhone(to);
  const base = baseUrl?.startsWith("http://") || baseUrl?.startsWith("https://") ? baseUrl : `http://${baseUrl || "localhost:3000"}`;
  const geolocUrl = `${base.replace(/\/$/, "")}/geoloc?phone=${encodeURIComponent(toNumber)}&action=${action}`;
  const apiUrl = `${WHATSAPP_API_URL}/${phoneNumberId}/messages`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toNumber,
      type: "text",
      text: {
        body:
          `📍 Pour valider votre pointage, *cliquez sur le lien* ci-dessous.\n\n` +
          `Votre position sera enregistrée *à l’instant* (GPS en direct).\n\n` +
          `${geolocUrl}\n\n` +
          `Ouvrez le lien puis appuyez sur « Récupérer ma position maintenant ».`,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[WhatsApp] Erreur envoi localisation vers", toNumber, ":", response.status, error);
  }
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
