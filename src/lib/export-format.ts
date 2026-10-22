import { APP_TIMEZONE } from "./timezone";

/**
 * Mise en forme commune aux exports (PDF, Excel, Word), utilisable côté navigateur et serveur.
 * Les dates « jour » (@db.Date) sont lues en UTC ; les horodatages au fuseau de l'application.
 */

/** Espaces fines / insécables de `toLocaleString("fr-FR")` → espace simple (lisible par toutes les polices). */
const plainSpaces = (s: string) => s.replace(/[   ]/g, " ");

/** « 1 234,5 » */
export function fmtNumberFr(n: number, maximumFractionDigits = 1): string {
  return plainSpaces(n.toLocaleString("fr-FR", { maximumFractionDigits }));
}

/** « 468,7 h » */
export function fmtHoursFr(hours: number): string {
  return `${fmtNumberFr(hours)} h`;
}

/** « 62 % », ou « — » quand le taux n'a pas de sens (aucune arrivée, par exemple). */
export function fmtPercentFr(rate: number | null | undefined): string {
  return rate == null ? "—" : `${rate} %`;
}

type DateInput = string | Date;
const asDate = (d: DateInput) => (typeof d === "string" ? new Date(d) : d);

/** Jour calendaire d'une date `@db.Date` : « 04/08/2026 ». */
export function fmtDayFr(d: DateInput): string {
  return asDate(d).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

/** Jour calendaire d'une date `@db.Date` : « mardi 4 août 2026 ». */
export function fmtDayLongFr(d: DateInput): string {
  return asDate(d).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Horodatage (createdAt…) ramené au jour de Douala : « 04/08/2026 ». */
export function fmtTimestampDayFr(d: DateInput): string {
  return asDate(d).toLocaleDateString("fr-FR", { timeZone: APP_TIMEZONE });
}

/** « 22/10/2026 à 15:04 » (fuseau de l'application). */
export function generatedAtLabel(now = new Date()): string {
  const day = now.toLocaleDateString("fr-FR", { timeZone: APP_TIMEZONE });
  const time = now.toLocaleTimeString("fr-FR", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  return `${day} à ${time}`;
}

/** « 2026-10-22 » pour les noms de fichiers (jour de Douala, pas le jour UTC). */
export function fileDateStamp(d: Date = new Date()): string {
  // Le format canadien donne directement AAAA-MM-JJ.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
