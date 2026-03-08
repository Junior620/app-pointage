import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/** Liste d’employés pour l’autocomplete de la page Rapports (HR, ADMIN, DG). */
export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;
    const q = searchParams.get("q")?.trim() || "";
    const service = searchParams.get("service")?.trim() || undefined;
    const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "15")));

    const where = {
      active: true,
      ...(service && { service }),
      ...(q.length >= 1 && {
        OR: [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
          { matricule: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    };

    const employees = await prisma.employee.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, matricule: true, service: true },
      take: limit,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return NextResponse.json({
      data: employees.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        matricule: e.matricule,
        service: e.service,
        label: `${e.lastName} ${e.firstName}${e.service ? ` — ${e.service}` : ""}`,
      })),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
