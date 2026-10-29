import type { EmployeeKind } from "@prisma/client";

/**
 * Stagiaires : un employé de type INTERN avec une fiche de stage (table internships).
 * Fonctions communes au navigateur et au serveur (aucun accès à la base ici).
 */

/** Rappel aux RH avant la fin du stage. */
export const INTERN_END_REMINDER_DAYS = 7;

/** Code « service » des matricules de stagiaires : GB-STG-4821. */
export const INTERN_MATRICULE_CODE = "STG";

export const EMPLOYEE_KIND_LABELS: Record<EmployeeKind, string> = {
  EMPLOYEE: "Employé",
  INTERN: "Stagiaire",
};

export function employeeKindLabel(kind: EmployeeKind | string | null | undefined): string {
  return EMPLOYEE_KIND_LABELS[kind as EmployeeKind] ?? "Employé";
}

type DateLike = Date | string;
const asDate = (d: DateLike) => (typeof d === "string" ? new Date(d) : d);

/**
 * « 2026-10-29 » : jour calendaire d'une date `@db.Date` (minuit UTC) ou de `todayDate()` (midi UTC).
 */
export function dayKey(d: DateLike): string {
  return asDate(d).toISOString().slice(0, 10);
}

export type InternshipPeriod = { startDate: DateLike; endDate: DateLike };
export type InternshipPhase = "upcoming" | "ongoing" | "ended";

export function internshipPhase(period: InternshipPeriod, day: DateLike): InternshipPhase {
  const k = dayKey(day);
  if (k < dayKey(period.startDate)) return "upcoming";
  if (k > dayKey(period.endDate)) return "ended";
  return "ongoing";
}

const dayIndex = (d: DateLike) => Math.round(Date.parse(dayKey(d)) / 86_400_000);

/** Jours avant la fin du stage : 0 = dernier jour, négatif une fois terminé. */
export function daysUntilEnd(period: InternshipPeriod, day: DateLike): number {
  return dayIndex(period.endDate) - dayIndex(day);
}

/** Avancement du stage entre 0 et 1 (jours calendaires, bornes incluses). */
export function internshipProgress(period: InternshipPeriod, day: DateLike): number {
  const total = dayIndex(period.endDate) - dayIndex(period.startDate) + 1;
  const done = dayIndex(day) - dayIndex(period.startDate) + 1;
  return Math.min(1, Math.max(0, done / Math.max(1, total)));
}

/** « J-5 », « Dernier jour », « Terminé », « Commence dans 3 j ». */
export function internshipCountdownLabel(period: InternshipPeriod, day: DateLike): string {
  const phase = internshipPhase(period, day);
  if (phase === "ended") return "Terminé";
  if (phase === "upcoming") {
    const n = dayIndex(period.startDate) - dayIndex(day);
    return n === 1 ? "Commence demain" : `Commence dans ${n} j`;
  }
  const left = daysUntilEnd(period, day);
  return left === 0 ? "Dernier jour" : `J-${left}`;
}

/** École, filière et niveau sur une ligne : « Université de Douala · Comptabilité · Master 1 ». */
export function schoolLine(i: { school: string; fieldOfStudy?: string | null; level?: string | null }): string {
  return [i.school, i.fieldOfStudy, i.level].map((s) => s?.trim()).filter(Boolean).join(" · ");
}

/** Montant FCFA : « 50 000 FCFA ». */
export function fmtFcfa(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${Math.round(amount).toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;
}
