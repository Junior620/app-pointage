import type { BadgeTone } from "@/components/ui/Badge";

export type StatusMeta = { label: string; tone: BadgeTone };

/** Statut final d'une journée (AttendanceRecord.finalStatus). */
export const FINAL_STATUS: Record<string, StatusMeta> = {
  PRESENT: { label: "Présent", tone: "success" },
  ABSENT: { label: "Absent", tone: "danger" },
  PERMISSION: { label: "Autorisation d'absence", tone: "info" },
  MISSION: { label: "Mission", tone: "violet" },
};

export const CHECK_IN_STATUS: Record<string, StatusMeta> = {
  ON_TIME: { label: "À l'heure", tone: "success" },
  LATE: { label: "Retard", tone: "warning" },
};

export const CHECK_OUT_STATUS: Record<string, StatusMeta> = {
  MANUAL: { label: "Manuel", tone: "neutral" },
  AUTO: { label: "Auto", tone: "warning" },
};

/** Autorisations d'absence et missions (féminin : « la demande »). */
export const REQUEST_STATUS: Record<string, StatusMeta> = {
  PENDING: { label: "En attente", tone: "warning" },
  APPROVED: { label: "Approuvée", tone: "success" },
  REJECTED: { label: "Refusée", tone: "danger" },
};

export const OVERTIME_STATUS: Record<string, StatusMeta> = {
  PENDING: { label: "En attente", tone: "warning" },
  APPROVED: { label: "Validée", tone: "success" },
  REJECTED: { label: "Refusée", tone: "danger" },
};

export const STRUCTURE_TONE: Record<string, BadgeTone> = {
  SCPB: "scpb",
  AFREXIA: "afrexia",
};

export type StatusKind = "final" | "checkIn" | "checkOut" | "request" | "overtime";

const MAPS: Record<StatusKind, Record<string, StatusMeta>> = {
  final: FINAL_STATUS,
  checkIn: CHECK_IN_STATUS,
  checkOut: CHECK_OUT_STATUS,
  request: REQUEST_STATUS,
  overtime: OVERTIME_STATUS,
};

export function statusMeta(kind: StatusKind, value: string | null | undefined): StatusMeta | null {
  if (!value) return null;
  return MAPS[kind][value] ?? { label: value, tone: "neutral" };
}

export function statusLabel(kind: StatusKind, value: string | null | undefined, fallback = "—"): string {
  return statusMeta(kind, value)?.label ?? fallback;
}
