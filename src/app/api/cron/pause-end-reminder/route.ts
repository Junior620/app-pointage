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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayDate();
  if (isWeekend(today)) {
    return NextResponse.json({ success: true, message: "Week-end — pas de rappel pause", count: 0 });
  }

  const holiday = await prisma.holiday.findFirst({
    where: { date: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
  });
  if (holiday) {
    return NextResponse.json({ success: true, message: "Jour férié — pas de rappel pause", count: 0 });
  }

  const now = new Date();
  const sendAt = parseTimeString("13:30", today, APP_TIMEZONE);
  const sendUntil = new Date(sendAt.getTime() + 30 * 60 * 1000);
  if (now < sendAt || now >= sendUntil) {
    return NextResponse.json({
      success: true,
      message: "Hors fenêtre rappel fin de pause (13h30)",
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

    const expectedEnd = new Date(
      record.breakStartTime!.getTime() + BREAK_EXPECTED_DURATION_MIN * 60 * 1000
    );
    if (now < expectedEnd) continue;

    await sendWhatsAppMessage(
      record.employee.whatsappPhone,
      `🔔 *Fin de pause (${BREAK_EXPECTED_DURATION_MIN} min)*\n\nBonjour ${record.employee.firstName}, votre pause est terminée.\n\nTapez *retour pause* ou *14* pour pointer votre reprise.`
    );
    count++;
  }

  return NextResponse.json({
    success: true,
    message: `Rappel fin de pause envoyé à ${count} employé(s)`,
    count,
  });
}

export const POST = GET;
