import { createHmac, timingSafeEqual } from "crypto";

const LINK_TTL_SEC = 15 * 60;

function geolocSecret(): string {
  return (
    process.env.GEOLOC_LINK_SECRET ||
    process.env.WHATSAPP_APP_SECRET ||
    process.env.CRON_SECRET ||
    ""
  );
}

function sign(payload: string): string {
  const secret = geolocSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 24);
}

export function buildGeolocUrl(
  baseUrl: string,
  phone: string,
  action: string
): string {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
  const payload = `${phone}|${action}|${exp}`;
  const sig = sign(payload);
  const base = baseUrl.replace(/\/$/, "");
  const q = new URLSearchParams({
    phone,
    action,
    exp: String(exp),
    sig,
  });
  return `${base}/geoloc?${q.toString()}`;
}

export function verifyGeolocLink(input: {
  phone: string;
  action: string;
  exp?: string | number | null;
  sig?: string | null;
}): { ok: true } | { ok: false; message: string } {
  if (!geolocSecret()) {
    return { ok: false, message: "Lien de pointage non configuré. Contactez les RH." };
  }
  const expNum = typeof input.exp === "number" ? input.exp : parseInt(String(input.exp ?? ""), 10);
  const sig = (input.sig ?? "").trim();
  if (!expNum || !sig) {
    return {
      ok: false,
      message:
        "Ce lien n'est plus valide (ancien lien). Renvoyez *1* (arrivée) ou *2* (départ) sur WhatsApp pour en recevoir un nouveau.",
    };
  }
  const now = Math.floor(Date.now() / 1000);
  if (now > expNum) {
    return {
      ok: false,
      message:
        "Ce lien a expiré. Renvoyez *1* (arrivée) ou *2* (départ) sur WhatsApp pour un nouveau lien.",
    };
  }
  const payload = `${input.phone}|${input.action}|${expNum}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return {
      ok: false,
      message:
        "Lien invalide. Renvoyez *1* ou *2* sur WhatsApp pour un nouveau lien de pointage.",
    };
  }
  return { ok: true };
}
