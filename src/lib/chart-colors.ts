/**
 * Couleurs des graphiques (recharts attend des valeurs hexadécimales).
 * Alignées sur les tons des badges de statut (src/lib/status-labels.ts).
 */
export const CHART_COLORS = {
  present: "#10b981",
  absent: "#ef4444",
  late: "#f59e0b",
  mission: "#8b5cf6",
  permission: "#0ea5e9",
  brand: "#2563eb",
  grid: "#e2e8f0",
  axis: "#94a3b8",
} as const;

/** Suite de couleurs pour les séries sans signification propre (services, etc.). */
export const CHART_SERIES = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export const CHART_TOOLTIP_STYLE = {
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  boxShadow: "0 4px 12px -2px rgb(15 23 42 / 0.12)",
  fontSize: "12px",
} as const;
