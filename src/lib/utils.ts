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

export function todayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
