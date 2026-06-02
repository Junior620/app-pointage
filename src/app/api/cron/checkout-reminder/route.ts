import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppToEmployee, getEmployeeWhatsappPhones } from "@/lib/employee-whatsapp";
import { todayDate, isWeekend, parseTimeString } from "@/lib/utils";

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Douala";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

function getScheduleEndForRecord(record: {
  employee: { site?: { schedules?: { endTime: string }[] } | null };
  date: Date;
}): Date {
  const end = record.employee.site?.schedules?.[0]?.endTime || "17:30";
  return parseTimeString(end, record.date, APP_TIMEZONE);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = todayDate();

    if (isWeekend(today)) {
      return NextResponse.json({ success: true, message: "Week-end — pas de rappel", count: 0 });
    }

    const holiday = await prisma.holiday.findFirst({
      where: {
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      },
    });
    if (holiday) {
      return NextResponse.json({ success: true, message: "Jour férié — pas de rappel", count: 0 });
    }

    const records = await prisma.attendanceRecord.findMany({
      where: {
        date: today,
        checkInTime: { not: null },
        checkOutTime: null,
      },
      include: {
        employee: {
          include: {
            site: {
              include: {
                schedules: true,
              },
            },
          },
        },
      },
    });

    let count = 0;
    for (const record of records) {
      const { employee } = record;
      if (!employee.active) continue;

      const phones = await getEmployeeWhatsappPhones(record.employeeId);
      if (phones.length === 0) continue;

      // Rappel départ à H+30 après fin de service (ex: fin 17h30 => rappel entre 18h00 et 18h29)
      const endAt = getScheduleEndForRecord(record);
      const remindAt = new Date(endAt.getTime() + 30 * 60 * 1000);
      const remindUntil = new Date(endAt.getTime() + 60 * 60 * 1000);
      if (now < remindAt || now >= remindUntil) continue;

      const inTime = record.checkInTime!.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIMEZONE,
      });

      await sendWhatsAppToEmployee(
        record.employeeId,
        `⚠️ *Rappel de pointage (18h00)*\n\n` +
          `Bonjour ${employee.firstName}, vous avez pointé votre arrivée à ${inTime} mais votre départ n'a pas encore été enregistré.\n\n` +
          `Tapez *DÉPART* ou *2* pour pointer votre sortie maintenant.\n\n` +
          `Si vous ne pointez pas, un départ automatique sera enregistré à la clôture.`
      );
      count++;
    }

    return NextResponse.json({
      success: true,
      message: `Rappel départ envoyé à ${count} employé(s)`,
      count,
    });
  } catch (error) {
    console.error("Checkout reminder error:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi des rappels" }, { status: 500 });
  }
}

export const POST = GET;
