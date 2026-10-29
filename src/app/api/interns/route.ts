import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { INTERNSHIP_INCLUDE } from "@/lib/internship-input";
import { INTERN_END_REMINDER_DAYS, daysUntilEnd, internshipPhase, type InternStatus } from "@/lib/interns";
import { todayDate } from "@/lib/utils";

/** Tous les stages de l'entreprise (en cours, à venir, terminés, stagiaires embauchés) et les indicateurs. */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const q = request.nextUrl.searchParams.get("q")?.trim();

    const internships = await db.internship.findMany({
      where: q
        ? {
            employee: {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { matricule: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : undefined,
      include: {
        ...INTERNSHIP_INCLUDE,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            matricule: true,
            service: true,
            structure: true,
            kind: true,
            active: true,
            departureDate: true,
            departureReason: true,
          },
        },
      },
      orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
    });

    const today = todayDate();
    const year = today.getUTCFullYear();
    const data = internships.map((i) => {
      const phase = internshipPhase(i, today);
      const status: InternStatus =
        i.employee.kind === "EMPLOYEE" ? "hired" : !i.employee.active || phase === "ended" ? "ended" : phase;
      return { ...i, status, daysLeft: daysUntilEnd(i, today) };
    });

    const ongoing = data.filter((i) => i.status === "ongoing");
    const stats = {
      ongoing: ongoing.length,
      upcoming: data.filter((i) => i.status === "upcoming").length,
      endingSoon: ongoing.filter((i) => i.daysLeft <= INTERN_END_REMINDER_DAYS).length,
      endedThisYear: data.filter((i) => i.status === "ended" && i.endDate.getUTCFullYear() === year).length,
      monthlyAllowance: ongoing.reduce((sum, i) => sum + (i.monthlyAllowance ?? 0), 0),
    };

    return NextResponse.json({ data, stats });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
