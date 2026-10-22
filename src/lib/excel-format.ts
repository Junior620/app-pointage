import type { Worksheet } from "exceljs";
import { EXPORT_ACCENT_HEX } from "./brand";

/** Mise en forme commune des classeurs Excel (navigateur et serveur). */

const ACCENT_ARGB = `FF${EXPORT_ACCENT_HEX.slice(1).toUpperCase()}`;

export const EXCEL_DATE_FORMAT = "dd/mm/yyyy";
export const EXCEL_WEEKDAY_DATE_FORMAT = "ddd dd/mm/yyyy";
/** Durée en heures:minutes, au-delà de 24 h (cellule = fraction de jour, donc additionnable). */
export const EXCEL_DURATION_FORMAT = "[h]:mm";
export const EXCEL_DECIMAL_FORMAT = "0.0";

/**
 * Jour calendaire en cellule date Excel. Accepte une date `@db.Date` (ISO, lue en UTC)
 * ou une date locale (`{ local: true }`, ex. jour itéré côté serveur).
 */
export function excelDay(d: string | Date | null | undefined, { local = false } = {}): Date | null {
  if (d == null) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return local
    ? new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Minutes → fraction de jour, à afficher avec EXCEL_DURATION_FORMAT. */
export function excelDuration(minutes: number | null | undefined): number | null {
  return minutes == null ? null : minutes / 1440;
}

/** Applique un format numérique à des colonnes (par clé) sur les lignes de données. */
export function setColumnFormats(ws: Worksheet, formats: Record<string, string>): void {
  for (const [key, numFmt] of Object.entries(formats)) {
    const col = ws.getColumn(key);
    col.numFmt = numFmt;
  }
}

/**
 * À appeler une fois les lignes ajoutées : en-tête aux couleurs de la marque,
 * première ligne figée et filtre automatique sur toutes les données.
 */
export function finishSheet(ws: Worksheet, { headerRow = 1, filter = true } = {}): void {
  const header = ws.getRow(headerRow);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_ARGB } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.numFmt = "General";
  });
  ws.views = [{ state: "frozen", ySplit: headerRow }];
  if (!filter) return;
  const lastRow = Math.max(headerRow, ws.actualRowCount);
  const lastCol = Math.max(1, ws.columnCount);
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: lastRow, column: lastCol },
  };
}
