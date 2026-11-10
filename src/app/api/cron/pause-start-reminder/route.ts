import { NextRequest, NextResponse } from "next/server";
import { forEachOrg, sum } from "@/lib/tenant";
import { sendWhatsAppToEmployee } from "@/lib/employee-whatsapp";
import { todayDate, isWeekend } from "@/lib/utils";
import { inCronHour } from "@/lib/cron-window";

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

  // Cron « 0 11 » UTC : part entre 12 h 00 et 12 h 59 à Douala (plan Hobby).
  if (!inCronHour(new Date(), today, "12:00")) {
    return NextResponse.json({
      success: true,
      message: "Hors fenêtre rappel pause début (12 h)",
      count: 0,
    });
  }

  const count = sum(
    await forEachOrg(async ({ db }) => {
      const holiday = await db.holiday.findFirst({ where: { date: today } });
      if (holiday) return 0;

      const records = await db.attendanceRecord.findMany({
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
        // Envoyé entre 12 h 00 et 12 h 59 : le texte ne suppose pas que la pause a déjà commencé.
        const text =
          `☕ *Rappel pause déjeuner*\n\n` +
          `Bonjour ${record.employee.firstName}, pensez à pointer votre pause déjeuner (vers 12h30).\n\n` +
          `Au moment de partir, tapez *début pause* ou *13*.`;
        try {
          await sendWhatsAppToEmployee(record.employee.id, text);
          count++;
        } catch (e) {
          console.error("[pause-start-reminder]", record.employee.id, e);
        }
      }
      return count;
    })
  );

  return NextResponse.json({ success: true, message: `Rappel pause début envoyé à ${count} employé(s)`, count });
}

export const POST = GET;
