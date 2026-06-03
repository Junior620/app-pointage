import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { todayDate, isWeekend, parseTimeString } from "@/lib/utils";

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
  const sendAt = parseTimeString("12:30", today, APP_TIMEZONE);
  const sendUntil = new Date(sendAt.getTime() + 30 * 60 * 1000);
  if (now < sendAt || now >= sendUntil) {
    return NextResponse.json({
      success: true,
      message: "Hors fenêtre rappel pause début (12h30)",
      count: 0,
    });
  }

  const records = await prisma.attendanceRecord.findMany({
    where: {
      date: today,
      checkInTime: { not: null },
      checkOutTime: null,
    },
    include: {
      employee: { select: { firstName: true, whatsappPhone: true, active: true } },
    },
  });

  let count = 0;
  for (const record of records) {
    if (!record.employee.active || !record.employee.whatsappPhone) continue;
    await sendWhatsAppMessage(
      record.employee.whatsappPhone,
      `☕ *Rappel pause (12h30)*\n\nBonjour ${record.employee.firstName}, c'est l'heure de la pause.\n\nTapez *début pause* ou *13* pour pointer votre départ en pause.`
    );
    count++;
  }

  return NextResponse.json({ success: true, message: `Rappel pause début envoyé à ${count} employé(s)`, count });
}

export const POST = GET;
