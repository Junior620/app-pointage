import { NextResponse } from "next/server";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { activeRequestFilter } from "@/lib/request-active";
import type { NavCountKey } from "@/lib/navigation";
import { INTERN_END_REMINDER_DAYS, dayKey } from "@/lib/interns";
import { todayDate } from "@/lib/utils";

/** Compteurs « à traiter » affichés dans le menu latéral et sur le tableau de bord. */
export async function GET() {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);

    // Stages en cours qui se terminent dans les 7 prochains jours.
    const todayStart = new Date(`${dayKey(todayDate())}T00:00:00.000Z`);
    const reminderLimit = new Date(todayStart.getTime() + INTERN_END_REMINDER_DAYS * 86_400_000);

    const [overtime, leaves, missions, interns] = await Promise.all([
      db.attendanceRecord.count({
        where: { overtimeMinutes: { gt: 0 }, overtimeStatus: "PENDING" },
      }),
      db.leaveRequest.count({ where: { status: "PENDING", ...activeRequestFilter } }),
      db.mission.count({ where: { status: "PENDING", ...activeRequestFilter } }),
      db.internship.count({
        where: { endDate: { gte: todayStart, lte: reminderLimit }, employee: { active: true, kind: "INTERN" } },
      }),
    ]);

    const counts: Record<NavCountKey, number> = { overtime, leaves, missions, interns };
    return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié")
        return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit")
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
