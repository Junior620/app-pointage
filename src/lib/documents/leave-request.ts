import type { LeaveAbsenceCategory, LeaveSubmissionSource } from "@prisma/client";
import { structureBrand } from "@/lib/brand";
import { fmtDayLongFr, fmtTimestampDayFr } from "@/lib/export-format";
import { leaveAbsenceCategoryLabel, leaveSubmissionSourceLabel } from "@/lib/leave-absence-labels";
import { statusLabel } from "@/lib/status-labels";
import type { DateLike, DocContent } from "./types";

export type LeaveDocInput = {
  id: string;
  employee: {
    firstName: string;
    lastName: string;
    matricule: string;
    service?: string | null;
    structure?: string | null;
  };
  startDate: DateLike;
  endDate: DateLike;
  reason: string;
  absenceCategory?: LeaveAbsenceCategory | null;
  notifyOrReplace?: string | null;
  submissionSource?: LeaveSubmissionSource | null;
  status: string;
  approvedBy?: string | null;
  cancelledAt?: DateLike | null;
  cancelledBy?: string | null;
  createdAt: DateLike;
};

/** Nombre de jours calendaires, bornes incluses (dates `@db.Date`). */
export function calendarDays(start: DateLike, end: DateLike): number {
  const day = (d: DateLike) => {
    const date = typeof d === "string" ? new Date(d) : d;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  };
  return Math.max(1, Math.round((day(end) - day(start)) / 86_400_000) + 1);
}

export const daysLabel = (n: number) => (n <= 1 ? "1 jour" : `${n} jours`);

export function leaveRequestContent(leave: LeaveDocInput): DocContent {
  const emp = leave.employee;
  const structure = emp.structure ?? null;
  const decisionRows: [string, string][] = [["Statut", statusLabel("request", leave.status)]];
  if (leave.approvedBy && leave.status !== "PENDING") {
    decisionRows.push([leave.status === "REJECTED" ? "Refusée par" : "Validée par", leave.approvedBy]);
  }

  return {
    structure,
    title: "Demande d'autorisation d'absence / congés",
    subtitle: [`Réf. ${leave.id.slice(0, 8).toUpperCase()} · créée le ${fmtTimestampDayFr(leave.createdAt)}`],
    notice: leave.cancelledAt
      ? `Demande annulée le ${fmtTimestampDayFr(leave.cancelledAt)}${leave.cancelledBy ? ` par ${leave.cancelledBy}` : ""} : elle n'est plus prise en compte pour le pointage.`
      : undefined,
    sections: [
      {
        title: "Employé",
        rows: [
          ["Nom et prénom", `${emp.lastName} ${emp.firstName}`],
          ["Matricule", emp.matricule],
          ["Service", emp.service || "—"],
          ["Structure", structureBrand(structure)?.name ?? structure ?? "—"],
        ],
      },
      {
        title: "Absence demandée",
        rows: [
          ["Catégorie", leaveAbsenceCategoryLabel(leave.absenceCategory)],
          ["Du", fmtDayLongFr(leave.startDate)],
          ["Au", fmtDayLongFr(leave.endDate)],
          ["Durée", daysLabel(calendarDays(leave.startDate, leave.endDate))],
          ["Motif", leave.reason.trim() || "—"],
          ["Personne / service à prévenir", leave.notifyOrReplace?.trim() || "—"],
          ["Origine de la demande", leaveSubmissionSourceLabel(leave.submissionSource)],
        ],
      },
      { title: "Décision des Ressources humaines", rows: decisionRows },
    ],
    signatures: ["L'employé(e)", "Le responsable hiérarchique", "Les Ressources humaines"],
    fileBase: `demande_autorisation_${emp.matricule}_${leave.id.slice(0, 8)}`,
  };
}
