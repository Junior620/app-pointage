import "server-only";

import crypto from "node:crypto";

const TTL_SECONDS = 20 * 60;

function getLeaveFormSecret(): string {
  const s = process.env.LEAVE_REQUEST_FORM_SECRET?.trim();
  if (!s) {
    throw new Error(
      "LEAVE_REQUEST_FORM_SECRET manquant (variable prévue dans .env pour signer les liens formulaire)."
    );
  }
  return s;
}

export function issueLeaveFormToken(employeeId: string): string {
  const secret = getLeaveFormSecret();
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payloadBuf = Buffer.from(JSON.stringify({ e: employeeId, exp }), "utf8");
  const payload = payloadBuf.toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyLeaveFormToken(token: string): { employeeId: string } | null {
  let secret: string;
  try {
    secret = getLeaveFormSecret();
  } catch {
    return null;
  }

  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return null;

  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  const sb = Buffer.from(sig, "utf8");
  const eb = Buffer.from(expected, "utf8");
  if (sb.length !== eb.length || !crypto.timingSafeEqual(sb, eb)) {
    return null;
  }

  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      e?: string;
      exp?: number;
    };
    if (!json.e || typeof json.exp !== "number") return null;
    if (json.exp < Math.floor(Date.now() / 1000)) return null;
    return { employeeId: json.e };
  } catch {
    return null;
  }
}

export function leaveFormTokenExpiresInMinutes(): number {
  return TTL_SECONDS / 60;
}
