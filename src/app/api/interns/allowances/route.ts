import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { dayKey, schoolLine } from "@/lib/interns";
import { attendanceSummaries, countWorkingDays } from "@/lib/internship-stats";
import { todayDate } from "@/lib/utils";

/**
 * Récapitulatif des gratifications d'un mois (`?month=AAAA-MM`), une ligne par stage actif ce mois-là.
 * Montant au prorata (indicatif) = gratification × (jours ouvrés du stage dans le mois − absences non justifiées)
 * / jours ouvrés du mois. Les autorisations d'absence approuvées ne sont pas retirées.
 */
export async function GET(request: NextRequest) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const month = request.nextUrl.searchParams.get("month") ?? "";
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
      return NextResponse.json({ error: "Mois invalide (AAAA-MM)" }, { status: 400 });
    }
    const [y, m] = [Number(match[1]), Number(match[2])];
    const monthStart = `${month}-01`;
    const monthEnd = dayKey(new Date(Date.UTC(y, m, 0)));
    const todayKey = dayKey(todayDate());

    const internships = await db.internship.findMany({
      where: {
        startDate: { lte: new Date(`${monthEnd}T00:00:00.000Z`) },
        endDate: { gte: new Date(`${monthStart}T00:00:00.000Z`) },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, matricule: true, service: true, structure: true } },
        supervisor: { select: { firstName: true, lastName: true } },
      },
      orderBy: { employee: { lastName: "asc" } },
    });

    const periods = internships.map((i) => {
      const start = dayKey(i.startDate);
      const end = dayKey(i.endDate);
      return { employeeId: i.employeeId, from: start > monthStart ? start : monthStart, to: end < monthEnd ? end : monthEnd };
    });
    const [summaries, monthWorkingDays] = await Promise.all([
      attendanceSummaries(db, periods),
      countWorkingDays(db, monthStart, monthEnd),
    ]);

    const rows = internships.map((i, idx) => {
      const s = summaries.get(i.employeeId)!;
      const dueDays = Math.max(0, s.workingDays - s.absences);
      const prorata =
        i.monthlyAllowance != null && monthWorkingDays > 0 ? Math.round((i.monthlyAllowance * dueDays) / monthWorkingDays) : null;
      return {
        employeeId: i.employeeId,
        name: `${i.employee.lastName} ${i.employee.firstName}`,
        matricule: i.employee.matricule,
        service: i.employee.service,
        structure: i.employee.structure,
        school: schoolLine(i),
        supervisor: i.supervisor ? `${i.supervisor.firstName} ${i.supervisor.lastName}` : null,
        from: periods[idx].from,
        to: periods[idx].to,
        ...s,
        monthlyAllowance: i.monthlyAllowance,
        prorata,
      };
    });

    return NextResponse.json({
      month,
      monthWorkingDays,
      // Mois en cours : chiffres arrêtés à aujourd'hui, montants provisoires.
      asOf: todayKey <= monthEnd && todayKey >= monthStart ? todayKey : null,
      rows,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
