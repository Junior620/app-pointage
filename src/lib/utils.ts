import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Parse "HH:MM" into a Date for the given calendar day.
 * When timezone is provided, the time is interpreted in that timezone
 * (critical for Vercel which runs in UTC).
 */
export function parseTimeString(
  timeStr: string,
  date: Date,
  timezone?: string
): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);

  if (!timezone) {
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  const h = hours.toString().padStart(2, "0");
  const min = minutes.toString().padStart(2, "0");

  const tentative = new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(tentative);

  const tzHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
  const tzMin = parseInt(parts.find((p) => p.type === "minute")?.value || "0");

  const utcTotalMin = tentative.getUTCHours() * 60 + tentative.getUTCMinutes();
  const tzTotalMin = tzHour * 60 + tzMin;
  let offsetMin = tzTotalMin - utcTotalMin;

  if (offsetMin < -720) offsetMin += 1440;
  if (offsetMin > 720) offsetMin -= 1440;

  return new Date(tentative.getTime() - offsetMin * 60 * 1000);
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

/** Dimanche uniquement (samedi autorisé pour le pointage). */
export function isWeekend(date: Date): boolean {
  return date.getDay() === 0;
}

/** Samedi ou dimanche : travail volontaire, hors horaires « lundi–vendredi » (pas de retard à l’arrivée, heures sup. au départ). */
export function isSaturdayOrSunday(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

/** Lundi à vendredi uniquement (samedi/dimanche = pas un jour ouvré pour les absences). */
export function isWorkingDay(date: Date): boolean {
  const d = date.getDay();
  return d >= 1 && d <= 5;
}

export function todayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Pour champs Prisma `@db.Date` (minuit UTC par jour civil) : une période
 * [startDate, endDate] inclusive intersecte ce jour civil UTC ssi
 * `startDate <= dayEnd` et `endDate >= dayStart`.
 * (Comparer avec « midi UTC » faisait disparaître le dernier jour et les autorisations d'absence d'un jour.)
 */
export function utcCalendarDayBounds(ref: Date): { dayStart: Date; dayEnd: Date } {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const d = ref.getUTCDate();
  return {
    dayStart: new Date(Date.UTC(y, m, d, 0, 0, 0, 0)),
    dayEnd: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
  };
}

/** Même idée que utcCalendarDayBounds mais jour civil selon le fuseau du processus (ex. todayDate()). */
export function localCalendarDayBounds(ref: Date): { dayStart: Date; dayEnd: Date } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();
  return {
    dayStart: new Date(y, m, d, 0, 0, 0, 0),
    dayEnd: new Date(y, m, d, 23, 59, 59, 999),
  };
}

/**
 * Paramètre `YYYY-MM-DD` (input date HTML) → Date pour colonnes Prisma `@db.Date`.
 * Midi UTC évite les décalages de jour selon le fuseau du serveur.
 */
export function parseDateInputForDbDate(dateStr: string): Date {
  const base = dateStr.split("T")[0];
  const [y, m, d] = base.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

/**
 * Filtre « période affichée » : garde les enregistrements dont l’intervalle
 * [startDate, endDate] **chevauche** [filterFrom, filterTo] (bornes inclusives).
 * - les deux dates : start <= finFiltre ET end >= débutFiltre
 * - seulement début : fin de période >= débutFiltre (encore pertinentes après cette date)
 * - seulement fin : début de période <= finFiltre
 */
export function prismaPeriodOverlapAnd(
  filterFromStr: string | null | undefined,
  filterToStr: string | null | undefined,
  fieldStart: "startDate" | "date",
  fieldEnd: "endDate" | "date"
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const from = filterFromStr ? parseDateInputForDbDate(filterFromStr) : undefined;
  const to = filterToStr ? parseDateInputForDbDate(filterToStr) : undefined;
  if (from && to) {
    out.push({ [fieldStart]: { lte: to } }, { [fieldEnd]: { gte: from } });
  } else if (from) {
    out.push({ [fieldEnd]: { gte: from } });
  } else if (to) {
    out.push({ [fieldStart]: { lte: to } });
  }
  return out;
}
