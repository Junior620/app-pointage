export const CORRECTION_REASON_CODES = [
  "OLD_GPS_LINK",
  "NO_NETWORK",
  "FORGOT",
  "EMPLOYEE_ERROR",
  "EARLY_LEAVE",
  "OTHER",
] as const;

export type CorrectionReasonCode = (typeof CORRECTION_REASON_CODES)[number];

export const CORRECTION_REASON_LABELS: Record<CorrectionReasonCode, string> = {
  OLD_GPS_LINK: "Ancien lien GPS",
  NO_NETWORK: "Pas de réseau",
  FORGOT: "Oubli",
  EMPLOYEE_ERROR: "Erreur employé",
  EARLY_LEAVE: "Départ anticipé",
  OTHER: "Autre",
};

export function correctionReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return CORRECTION_REASON_LABELS[code as CorrectionReasonCode] ?? code;
}

export function parseOvertimeHm(hm: string): number {
  const [h, m] = hm.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return Math.max(0, h * 60 + m);
}

export function overtimeToHm(min: number | null | undefined): string {
  if (min == null || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
