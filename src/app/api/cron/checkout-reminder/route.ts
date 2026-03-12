import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
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
        message: "Dimanche — pas de rappel",
        count: 0,
      });
    }

    const holiday = await prisma.holiday.findFirst({
      where: {
        date: new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        ),
      },
    });
    if (holiday) {
      return NextResponse.json({
        success: true,
        message: "Jour férié — pas de rappel",
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
            id: true,
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
      if (!employee.active || !employee.whatsappPhone) continue;

      const inTime = record.checkInTime!.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: process.env.APP_TIMEZONE || "Africa/Douala",
      });

      await sendWhatsAppMessage(
        employee.whatsappPhone,
        `⚠️ *Rappel de pointage*\n\n` +
          `Bonjour ${employee.firstName}, vous avez pointé votre arrivée à ${inTime} mais votre départ n'a pas encore été enregistré.\n\n` +
          `Tapez *DÉPART* ou *2* pour pointer votre sortie maintenant.\n\n` +
          `Si vous ne pointez pas, un départ automatique sera enregistré à la clôture.`
      );
      count++;
    }

    return NextResponse.json({
      success: true,
      message: `Rappel envoyé à ${count} employé(s)`,
      count,
    });
  } catch (error) {
    console.error("Checkout reminder error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des rappels" },
      { status: 500 }
    );
  }
}

export const POST = GET;
