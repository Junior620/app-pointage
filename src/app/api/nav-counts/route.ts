import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { activeRequestFilter } from "@/lib/request-active";
import type { NavCountKey } from "@/lib/navigation";

/** Compteurs « à traiter » affichés dans le menu latéral et sur le tableau de bord. */
export async function GET() {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);

    const [overtime, leaves, missions] = await Promise.all([
      prisma.attendanceRecord.count({
        where: { overtimeMinutes: { gt: 0 }, overtimeStatus: "PENDING" },
      }),
      prisma.leaveRequest.count({ where: { status: "PENDING", ...activeRequestFilter } }),
      prisma.mission.count({ where: { status: "PENDING", ...activeRequestFilter } }),
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
