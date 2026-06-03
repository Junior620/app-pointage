import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppToEmployee } from "@/lib/employee-whatsapp";
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

  const holiday = await prisma.holiday.findFirst({ where: { date: today } });
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
      breakStartTime: null,
    },
    include: {
      employee: {
        select: { id: true, firstName: true, whatsappPhone: true, active: true },
      },
    },
  });

  let count = 0;
  for (const record of records) {
    if (!record.employee.active) continue;
    const text =
      `☕ *Rappel pause (12h30)*\n\n` +
      `Bonjour ${record.employee.firstName}, c'est l'heure de la pause déjeuner.\n\n` +
      `Tapez *début pause* ou *13* pour pointer votre départ en pause.`;
    try {
      await sendWhatsAppToEmployee(record.employee.id, text);
      count++;
    } catch (e) {
      console.error("[pause-start-reminder]", record.employee.id, e);
    }
  }

  return NextResponse.json({ success: true, message: `Rappel pause début envoyé à ${count} employé(s)`, count });
}

export const POST = GET;
