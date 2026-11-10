import { NextRequest, NextResponse } from "next/server";
import { forEachOrg, sum } from "@/lib/tenant";
import { sendWhatsAppToEmployee } from "@/lib/employee-whatsapp";
import { formatTime, todayDate, isWeekend, parseTimeString } from "@/lib/utils";
import { APP_TIMEZONE } from "@/lib/timezone";
import { inCronHour } from "@/lib/cron-window";
const CHECKOUT_REMIND_AFTER_MIN = 15;

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

    // Cron « 0 17 » UTC : part entre 18 h 00 et 18 h 59 à Douala (plan Hobby), donc toujours après
    // fin de journée (17 h 30) + 15 min.
    if (!inCronHour(now, today, "18:00")) {
      return NextResponse.json({ success: true, message: "Hors fenêtre rappel départ (18 h)", count: 0 });
    }

    const count = sum(
      await forEachOrg(async ({ db }) => {
        const holiday = await db.holiday.findFirst({
          where: {
            date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
          },
        });
        if (holiday) return 0;

        const records = await db.attendanceRecord.findMany({
          where: {
            date: today,
            checkInTime: { not: null },
            checkOutTime: null,
          },
          include: {
            employee: {
              include: {
                site: { include: { schedules: true } },
              },
            },
          },
        });

        let count = 0;
        for (const record of records) {
          const { employee } = record;
          if (!employee.active) continue;

          // Une seule exécution par jour : plus de fenêtre de 30 min par employé, qui faisait sauter
          // le rappel quand le cron partait avant fin de journée + 15 min.
          const endAt = getScheduleEndForRecord(record);
          const remindAt = new Date(
            endAt.getTime() + CHECKOUT_REMIND_AFTER_MIN * 60 * 1000
          );
          if (now < remindAt) continue;

          const endLabel = formatTime(endAt);
          const inTime = formatTime(record.checkInTime);

          try {
            await sendWhatsAppToEmployee(
              employee.id,
              `⚠️ *Rappel de pointage*\n\n` +
                `Bonjour ${employee.firstName}, vous avez pointé votre arrivée à ${inTime} mais votre départ (prévu vers ${endLabel}) n'a pas encore été enregistré.\n\n` +
                `Tapez *DÉPART* ou *2* pour pointer votre sortie maintenant.\n\n` +
                `Si vous ne pointez pas, un départ automatique sera enregistré à la clôture.`
            );
            count++;
          } catch (e) {
            console.error("[checkout-reminder]", employee.id, e);
          }
        }
        return count;
      })
    );

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
