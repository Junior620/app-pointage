import type { DepartureReason } from "@prisma/client";

export const DEPARTURE_REASON_LABELS: Record<DepartureReason, string> = {
  RESIGNATION: "Démission",
  END_OF_CONTRACT: "Fin de contrat",
  DISMISSAL: "Licenciement",
  ABANDONMENT: "Abandon de poste",
};

export function departureReasonLabel(reason: DepartureReason | null | undefined): string {
  if (!reason) return "—";
  return DEPARTURE_REASON_LABELS[reason] ?? reason;
}
