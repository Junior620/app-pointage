import { APP_TIMEZONE } from "./timezone";
import { parseTimeString } from "./utils";

/**
 * Plan Vercel Hobby : un cron programmé à H h 00 (UTC) part une fois par jour, à une minute quelconque
 * entre H h 00 et H h 59. Un rappel vérifie donc toute l'heure (heure de Douala), plus une marge si
 * l'appel arrive en retard, au lieu d'une fenêtre de 30 min qui le fait sauter un jour sur deux.
 */
export const CRON_LATE_MARGIN_MIN = 30;

/** Vrai si `now` tombe dans l'heure locale `hour` (« 12:00 ») du jour `day`, marge de retard comprise. */
export function inCronHour(now: Date, day: Date, hour: string): boolean {
  const start = parseTimeString(hour, day, APP_TIMEZONE);
  const end = new Date(start.getTime() + (60 + CRON_LATE_MARGIN_MIN) * 60 * 1000);
  return now >= start && now < end;
}
