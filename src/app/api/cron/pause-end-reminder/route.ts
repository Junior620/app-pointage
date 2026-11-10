import { NextRequest, NextResponse } from "next/server";
import { forEachOrg, sum } from "@/lib/tenant";
import { sendWhatsAppToEmployee } from "@/lib/employee-whatsapp";
import { todayDate, isWeekend } from "@/lib/utils";
import { BREAK_EXPECTED_DURATION_MIN } from "@/lib/attendance-engine";
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

  // Cron « 0 12 » UTC : part entre 13 h 00 et 13 h 59 à Douala (plan Hobby). Premier rappel ;
  // pause-return-reminder relance à 14 h ceux qui n'ont toujours pas pointé leur retour.
  const now = new Date();
  if (!inCronHour(now, today, "13:00")) {
    return NextResponse.json({
      success: true,
      message: "Hors fenêtre rappel fin de pause (13 h)",
      count: 0,
    });
  }

  const count = sum(
    await forEachOrg(async ({ db }) => {
      const holiday = await db.holiday.findFirst({
        where: { date: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
      });
      if (holiday) return 0;

      const records = await db.attendanceRecord.findMany({
        where: {
          date: today,
          checkInTime: { not: null },
          checkOutTime: null,
          breakStartTime: { not: null },
          breakEndTime: null,
        },
        include: {
          employee: { select: { id: true, firstName: true, active: true } },
        },
      });

      let count = 0;
      for (const record of records) {
        if (!record.employee.active) continue;

        // Pause de BREAK_EXPECTED_DURATION_MIN minutes écoulée (l'ancien plancher de 13 h 30 faisait
        // sauter le rappel dès que le cron partait avant 13 h 30).
        const expectedReturn = new Date(
          record.breakStartTime!.getTime() + BREAK_EXPECTED_DURATION_MIN * 60 * 1000
        );
        if (now < expectedReturn) continue;

        try {
          await sendWhatsAppToEmployee(
            record.employee.id,
            `🔔 *Fin de pause (${BREAK_EXPECTED_DURATION_MIN} min)*\n\nBonjour ${record.employee.firstName}, votre pause est terminée.\n\nTapez *retour pause* ou *14* pour pointer votre reprise.`
          );
          count++;
        } catch (e) {
          console.error("[pause-end-reminder]", record.employee.id, e);
        }
      }
      return count;
    })
  );

  return NextResponse.json({
    success: true,
    message: `Rappel fin de pause envoyé à ${count} employé(s)`,
    count,
  });
}

export const POST = GET;
