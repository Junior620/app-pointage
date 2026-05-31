import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendWhatsAppToEmployee, getEmployeeWhatsappPhones } from "@/lib/employee-whatsapp";
import { todayDate, isWeekend } from "@/lib/utils";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = todayDate();
    if (isWeekend(today)) {
      return NextResponse.json({
        success: true,
        message: "Week-end — pas de rappel départ 18h",
        count: 0,
      });
    }

    const holiday = await prisma.holiday.findFirst({
      where: {
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      },
    });
    if (holiday) {
      return NextResponse.json({
        success: true,
        message: "Jour férié — pas de rappel départ 18h",
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
        employee: {
          select: {
            firstName: true,
            whatsappPhone: true,
            active: true,
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

      await sendWhatsAppToEmployee(record.employeeId,
        `🕕 *Rappel important (18h00)*\n\n` +
          `Bonjour ${employee.firstName}, pensez à pointer votre départ quand vous quittez le bureau.\n\n` +
          `💡 Les heures supplémentaires se calculent à partir de 18h30 uniquement si vous pointez votre départ manuellement.\n` +
          `⚠️ Si le départ automatique se déclenche à 21h, les heures sup seront à 0.`
      );
      count++;
    }

    return NextResponse.json({
      success: true,
      message: `Rappel départ 18h envoyé à ${count} employé(s)`,
      count,
    });
  } catch (error) {
    console.error("Checkout OT reminder error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des rappels 18h" },
      { status: 500 }
    );
  }
}

export const POST = GET;
