import { NextRequest, NextResponse } from "next/server";
import { sendMenuAnnouncement } from "@/lib/menu-announcement";

/** Une vingtaine d'envois WhatsApp à la suite : au-delà des 10 s par défaut. */
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

/** Annonce unique du nouveau menu WhatsApp (voir src/lib/menu-announcement.ts). */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendMenuAnnouncement();
  if (result.skipped) {
    return NextResponse.json({ success: true, message: result.skipped, count: 0 });
  }
  console.log("[menu-announcement]", result);
  return NextResponse.json({
    success: true,
    message: `Nouveau menu envoyé : ${result.sent} message(s), ${result.failed} échec(s), ${result.noPhone} employé(s) sans numéro`,
    count: result.sent,
    ...result,
  });
}

export const POST = GET;
