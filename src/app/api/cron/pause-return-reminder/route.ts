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

/** Rappel si pause commencée mais retour non pointé après 60 min. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayDate();
  if (isWeekend(today)) {
    return NextResponse.json({ success: true, message: "Week-end — pas de rappel pause", count: 0 });
  }

  // Cron « 0 13 » UTC : part entre 14 h 00 et 14 h 59 à Douala (plan Hobby), après le premier
  // rappel de 13 h (pause-end-reminder).
  const now = new Date();
  if (!inCronHour(now, today, "14:00")) {
    return NextResponse.json({
      success: true,
      message: "Hors fenêtre rappel retour pause (14 h)",
      count: 0,
    });
  }

  const count = sum(
    await forEachOrg(async ({ db }) => {
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

        const overdueAt = new Date(
          record.breakStartTime!.getTime() + BREAK_EXPECTED_DURATION_MIN * 60 * 1000
        );
        if (now < overdueAt) continue;

        try {
          await sendWhatsAppToEmployee(
            record.employee.id,
            `⚠️ *Retour de pause non pointé*\n\nBonjour ${record.employee.firstName}, vous avez marqué votre départ en pause mais pas le retour (pause de ${BREAK_EXPECTED_DURATION_MIN} min dépassée).\n\nMerci de taper *retour pause* ou *14* pour enregistrer votre reprise.`
          );
          count++;
        } catch (e) {
          console.error("[pause-return-reminder]", record.employee.id, e);
        }
      }
      return count;
    })
  );

  return NextResponse.json({
    success: true,
    message: `Rappel retour de pause envoyé à ${count} employé(s)`,
    count,
  });
}

export const POST = GET;
