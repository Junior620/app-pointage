/** Fuseau métier (Douala, Cameroun — UTC+1, pas d'heure d'été). */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Douala";

export function calendarPartsInAppTz(d: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  return {
    year: parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10),
    month: parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10) - 1,
    day: parseInt(parts.find((p) => p.type === "day")?.value ?? "1", 10),
  };
}

/** Jour civil dans le fuseau app, pour itérations / filtres (minuit local « logique »). */
export function startOfAppDay(d: Date): Date {
  const { year, month, day } = calendarPartsInAppTz(d);
  return new Date(year, month, day, 0, 0, 0, 0);
}
