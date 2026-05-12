import type { LeaveAbsenceCategory, LeaveSubmissionSource } from "@prisma/client";

/** Ordre d’affichage dans les formulaires. */
export const ORDERED_LEAVE_ABSENCE_CATEGORIES: LeaveAbsenceCategory[] = [
  "AUTORISATION_COURTE",
  "CONGES_ANNUELS",
  "RTT_RECUPERATION",
  "CONGES_EXCEPTIONNEL",
  "EVENEMENT_FAMILIAL",
  "MALADIE",
  "FORMATION",
  "MATERNITE_PATERNITE",
  "AUTRE",
];

export const LEAVE_ABSENCE_CATEGORY_LABELS: Record<LeaveAbsenceCategory, string> = {
  AUTORISATION_COURTE: "Autorisation de courte durée",
  CONGES_ANNUELS: "Congés annuels",
  CONGES_EXCEPTIONNEL: "Congés exceptionnels",
  EVENEMENT_FAMILIAL: "Événement familial",
  MALADIE: "Maladie / incapacité",
  FORMATION: "Formation",
  RTT_RECUPERATION: "RTT / récupération",
  MATERNITE_PATERNITE: "Maternité / paternité",
  AUTRE: "Autre",
};

export function leaveAbsenceCategoryLabel(
  cat: LeaveAbsenceCategory | null | undefined
): string {
  if (!cat) return "—";
  return LEAVE_ABSENCE_CATEGORY_LABELS[cat] ?? cat;
}

export const LEAVE_SUBMISSION_SOURCE_LABELS: Record<LeaveSubmissionSource, string> = {
  HR_DASHBOARD: "Créée par RH (tableau)",
  EMPLOYEE_WHATSAPP_FORM: "Formulaire (lien WhatsApp)",
};

export function leaveSubmissionSourceLabel(
  src: LeaveSubmissionSource | null | undefined
): string {
  if (!src) return "—";
  return LEAVE_SUBMISSION_SOURCE_LABELS[src] ?? src;
}
