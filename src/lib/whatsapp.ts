import crypto from "crypto";
import { buildGeolocUrl } from "./geoloc-link";

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

/** Numéro au format attendu par l'API WhatsApp : chiffres uniquement, sans + */
function toWhatsAppPhone(phone: string): string {
  // Meta attend un numéro en chiffres, généralement avec code pays (sans +).
  // Beaucoup de numéros sont stockés en format "international prefix" : 00XXXXXXXX.
  // On normalise donc :
  // - on supprime tout sauf les chiffres
  // - si le numéro commence par "00", on enlève ces 2 zéros
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    if (process.env.NODE_ENV === "development") console.info("[WhatsApp] (dev, non envoyé) →", to, text);
    else console.error("[WhatsApp] Envoi impossible : WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquant");
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

export type WhatsAppReplyButton = { id: string; title: string };

export type WhatsAppListSection = {
  title: string;
  rows: { id: string; title: string; description?: string }[];
};

/** Message interactif (boutons ou liste). Renvoie false si l'envoi a échoué : l'appelant envoie alors du texte. */
async function sendWhatsAppInteractive(to: string, interactive: object, label: string): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) return false;

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
      interactive,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[WhatsApp] Erreur envoi ${label} vers`, toNumber, ":", response.status, error);
    return false;
  }
  return true;
}

/** Message avec 1 à 3 boutons de réponse (titre ≤ 20 caractères). */
export function sendWhatsAppReplyButtons(to: string, body: string, buttons: WhatsAppReplyButton[]): Promise<boolean> {
  return sendWhatsAppInteractive(
    to,
    {
      type: "button",
      body: { text: body },
      action: { buttons: buttons.map((reply) => ({ type: "reply", reply })) },
    },
    "boutons"
  );
}

/** Message « liste » : un bouton qui ouvre jusqu'à 10 lignes réparties en sections. */
export function sendWhatsAppList(
  to: string,
  body: string,
  buttonText: string,
  sections: WhatsAppListSection[]
): Promise<boolean> {
  return sendWhatsAppInteractive(
    to,
    { type: "list", body: { text: body }, action: { button: buttonText, sections } },
    "liste"
  );
}

/** `appUrl` : adresse de l'espace de l'entreprise de l'employé (orgBaseUrl), APP_BASE_URL par défaut. */
export async function sendWhatsAppLocationRequest(
  to: string,
  action: "CHECK_IN" | "CHECK_OUT" | "BREAK_START" | "BREAK_END",
  appUrl?: string | null
): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const baseUrl = appUrl || process.env.APP_BASE_URL;

  const toNumber = toWhatsAppPhone(to);
  const base = baseUrl?.startsWith("http://") || baseUrl?.startsWith("https://") ? baseUrl : `http://${baseUrl || "localhost:3000"}`;
  const geolocUrl = buildGeolocUrl(base, toNumber, action);

  if (!phoneNumberId || !accessToken) {
    if (process.env.NODE_ENV === "development") console.info("[WhatsApp] (dev, non envoyé) lien GPS →", toNumber, geolocUrl);
    return;
  }
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
          `📍 *Pointage GPS*\n\nCliquez sur le *lien d'aujourd'hui* ci-dessous (valable 15 min).\nNe réutilisez pas un ancien lien.\n\n` +
          `${geolocUrl}`,
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
