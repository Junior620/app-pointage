import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/auth";
import { activeRequestFilter } from "@/lib/request-active";
import type { NavCountKey } from "@/lib/navigation";

/** Compteurs « à traiter » affichés dans le menu latéral et sur le tableau de bord. */
export async function GET() {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);

    const [overtime, leaves, missions] = await Promise.all([
      db.attendanceRecord.count({
        where: { overtimeMinutes: { gt: 0 }, overtimeStatus: "PENDING" },
      }),
      db.leaveRequest.count({ where: { status: "PENDING", ...activeRequestFilter } }),
      db.mission.count({ where: { status: "PENDING", ...activeRequestFilter } }),
    ]);

    const counts: Record<NavCountKey, number> = { overtime, leaves, missions };
    return NextResponse.json(counts, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié")
        return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit")
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
