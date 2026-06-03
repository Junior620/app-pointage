import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { todayDate, isWeekend, parseTimeString } from "@/lib/utils";
import { BREAK_EXPECTED_DURATION_MIN } from "@/lib/attendance-engine";

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Douala";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

/** Rappel si pause commencée mais retour non pointé après 60 min. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayDate();
  if (isWeekend(today)) {
    return NextResponse.json({ success: true, message: "Week-end — pas de rappel pause", count: 0 });
  }

  const now = new Date();
  const sendAt = parseTimeString("13:45", today, APP_TIMEZONE);
  const sendUntil = new Date(sendAt.getTime() + 30 * 60 * 1000);
  if (now < sendAt || now >= sendUntil) {
    return NextResponse.json({
      success: true,
      message: "Hors fenêtre rappel retour pause (13h45)",
      count: 0,
    });
  }

  const records = await prisma.attendanceRecord.findMany({
    where: {
      date: today,
      checkInTime: { not: null },
      checkOutTime: null,
      breakStartTime: { not: null },
      breakEndTime: null,
    },
    include: {
      employee: { select: { firstName: true, whatsappPhone: true, active: true } },
    },
  });

  let count = 0;
  for (const record of records) {
    if (!record.employee.active || !record.employee.whatsappPhone) continue;

    const overdueAt = new Date(
      record.breakStartTime!.getTime() + BREAK_EXPECTED_DURATION_MIN * 60 * 1000
    );
    if (now < overdueAt) continue;

    await sendWhatsAppMessage(
      record.employee.whatsappPhone,
      `⚠️ *Retour de pause non pointé*\n\nBonjour ${record.employee.firstName}, vous avez marqué votre départ en pause mais pas le retour (pause de ${BREAK_EXPECTED_DURATION_MIN} min dépassée).\n\nMerci de taper *retour pause* ou *14* pour enregistrer votre reprise.`
    );
    count++;
  }

  return NextResponse.json({
    success: true,
    message: `Rappel retour de pause envoyé à ${count} employé(s)`,
    count,
  });
}

export const POST = GET;
