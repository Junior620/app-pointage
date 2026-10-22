"use client";

import type { jsPDF, jsPDFOptions } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import { APP_NAME, EXPORT_ACCENT_HEX } from "@/lib/brand";
import { addPdfLogos } from "@/lib/pdf-branding";
import { generatedAtLabel } from "@/lib/export-format";

/**
 * Briques communes des PDF générés dans le navigateur (jsPDF + jspdf-autotable) :
 * en-tête avec logos, sections « libellé / valeur », cadres de signature et pied de page.
 */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const PDF_COLORS = {
  accent: hexToRgb(EXPORT_ACCENT_HEX),
  ink: [15, 23, 42] as Rgb,
  body: [51, 65, 85] as Rgb,
  muted: [100, 116, 139] as Rgb,
  faint: [148, 163, 184] as Rgb,
  line: [226, 232, 240] as Rgb,
  zebra: [248, 250, 252] as Rgb,
  danger: [185, 28, 28] as Rgb,
  dangerBg: [254, 242, 242] as Rgb,
};

export const PDF_MARGIN = 14;

/** Réglages communs des tableaux de liste (autoTable). */
export const PDF_TABLE: Partial<UserOptions> = {
  theme: "striped",
  styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: PDF_COLORS.body, lineColor: PDF_COLORS.line },
  headStyles: { fillColor: PDF_COLORS.accent, textColor: 255, fontStyle: "bold" },
  alternateRowStyles: { fillColor: PDF_COLORS.zebra },
  margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 18 },
  // `columnStyles` ne s'applique qu'au corps : l'en-tête suit le même alignement.
  didParseCell: (data) => {
    if (data.section !== "head") return;
    const halign = data.table.styles.columnStyles[data.column.index]?.halign;
    if (halign) data.cell.styles.halign = halign;
  },
};

// Helvetica (police standard des PDF) ne connaît que le jeu WinAnsi. Un caractère hors de ce jeu
// fait basculer toute la ligne dans un autre encodage : le texte sort lettres espacées et illisible.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const PDF_REPLACEMENTS: Record<string, string> = {
  "→": "-",
  "←": "-",
  "⇒": "=>",
  "≥": ">=",
  "≤": "<=",
  " ": " ",
  " ": " ",
  " ": " ",
  "‐": "-",
  "‑": "-",
  "−": "-",
};

/** Ramène un texte au jeu de caractères de Helvetica (accents conservés, symboles remplacés). */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || ch === "\n" || WIN_ANSI_EXTRA.includes(ch)) {
      out += ch;
    } else if (ch in PDF_REPLACEMENTS) {
      out += PDF_REPLACEMENTS[ch];
    } else {
      // Lettre accentuée hors jeu (ŏ, ș…) : on garde la lettre de base ; émojis et symboles disparaissent.
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (/^[\x20-\x7e]+$/.test(base)) out += base;
    }
  }
  return out;
}

type TextArg = string | string[];
const clean = (t: TextArg): TextArg =>
  Array.isArray(t) ? t.map((l) => (typeof l === "string" ? pdfSafe(l) : l)) : typeof t === "string" ? pdfSafe(t) : t;

/** Nouveau document jsPDF dont tous les textes (y compris ceux d'autoTable) passent par `pdfSafe`. */
export async function createPdf(options: jsPDFOptions = { unit: "mm", format: "a4" }): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF(options);
  const text = doc.text.bind(doc) as (t: TextArg, ...rest: unknown[]) => jsPDF;
  doc.text = ((t: TextArg, ...rest: unknown[]) => text(clean(t), ...rest)) as jsPDF["text"];
  // autoTable passe ici des chaînes ou des tableaux de lignes.
  const split = doc.splitTextToSize.bind(doc) as (t: TextArg, ...rest: unknown[]) => string[];
  doc.splitTextToSize = ((t: TextArg, ...rest: unknown[]) => split(clean(t), ...rest)) as jsPDF["splitTextToSize"];
  const width = doc.getTextWidth.bind(doc);
  doc.getTextWidth = (t: string) => width(typeof t === "string" ? pdfSafe(t) : t);
  return doc;
}

export function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

export function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

/** Position de fin du dernier tableau autoTable. */
export function lastTableY(doc: jsPDF, fallback: number): number {
  return (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? fallback;
}

/** Passe à la page suivante si `needed` mm ne tiennent plus avant le pied de page. */
export function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= pageHeight(doc) - 20) return y;
  doc.addPage();
  return 20;
}

/**
 * Titre, sous-titres et logos de la page courante. Renvoie l'ordonnée où commencer le contenu.
 */
export async function addPdfHeader(
  doc: jsPDF,
  {
    title,
    subtitle = [],
    structures,
  }: { title: string; subtitle?: string | string[]; structures?: (string | null | undefined)[] }
): Promise<number> {
  await addPdfLogos(doc, structures);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(title, PDF_MARGIN, 18);

  let y = 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...PDF_COLORS.muted);
  for (const line of Array.isArray(subtitle) ? subtitle : [subtitle]) {
    y += 5.5;
    doc.text(line, PDF_MARGIN, y);
  }

  y += 4.5;
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(PDF_MARGIN, y, pageWidth(doc) - PDF_MARGIN, y);
  doc.setDrawColor(...PDF_COLORS.accent);
  doc.setLineWidth(0.8);
  doc.line(PDF_MARGIN, y, PDF_MARGIN + 22, y);
  doc.setTextColor(...PDF_COLORS.body);
  return y + 7;
}

/** Bandeau d'alerte (demande annulée…). */
export function addPdfNotice(doc: jsPDF, text: string, y: number): number {
  const width = pageWidth(doc) - 2 * PDF_MARGIN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(text, width - 8) as string[];
  const height = lines.length * 4.6 + 5;
  doc.setFillColor(...PDF_COLORS.dangerBg);
  doc.setDrawColor(...PDF_COLORS.danger);
  doc.setLineWidth(0.3);
  doc.roundedRect(PDF_MARGIN, y, width, height, 1.5, 1.5, "FD");
  doc.setTextColor(...PDF_COLORS.danger);
  doc.text(lines, PDF_MARGIN + 4, y + 5.6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.body);
  return y + height + 6;
}

/** Titre de section en petites capitales, souligné. */
export function addPdfSectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_COLORS.accent);
  doc.text(title.toUpperCase(), PDF_MARGIN, y, { charSpace: 0.3 });
  doc.setDrawColor(...PDF_COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(PDF_MARGIN, y + 1.8, pageWidth(doc) - PDF_MARGIN, y + 1.8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.body);
  return y + 3;
}

type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;

/** Lignes « libellé / valeur » (le texte long passe à la ligne). Renvoie l'ordonnée de fin. */
export function addPdfKeyValues(doc: jsPDF, autoTable: AutoTableFn, rows: [string, string][], y: number): number {
  autoTable(doc, {
    startY: y,
    body: rows,
    theme: "plain",
    margin: { left: PDF_MARGIN, right: PDF_MARGIN, bottom: 18 },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: { top: 2.4, bottom: 2.4, left: 0, right: 3 },
      textColor: PDF_COLORS.ink,
      lineColor: PDF_COLORS.line,
      lineWidth: { bottom: 0.2 },
      valign: "top",
    },
    columnStyles: {
      0: { cellWidth: 58, textColor: PDF_COLORS.muted },
    },
  });
  return lastTableY(doc, y);
}

/** Paragraphe de texte courant. */
export function addPdfParagraph(doc: jsPDF, text: string, y: number, { gap = 6 } = {}): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.body);
  const lines = doc.splitTextToSize(text, pageWidth(doc) - 2 * PDF_MARGIN) as string[];
  y = ensureSpace(doc, y, lines.length * 5);
  doc.text(lines, PDF_MARGIN, y);
  return y + (lines.length - 1) * 4.6 + gap;
}

/** Cadres de signature côte à côte (libellé en haut, « Date : » en bas). */
export function addPdfSignatures(doc: jsPDF, labels: string[], y: number): number {
  const height = 34;
  y = ensureSpace(doc, y, height + 4);
  const gap = 5;
  const width = (pageWidth(doc) - 2 * PDF_MARGIN - gap * (labels.length - 1)) / labels.length;
  labels.forEach((label, i) => {
    const x = PDF_MARGIN + i * (width + gap);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, width, height, 1.5, 1.5, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.body);
    doc.text(doc.splitTextToSize(label, width - 6) as string[], x + 3, y + 5, { lineHeightFactor: 1.3 });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text("Date :", x + 3, y + height - 4);
  });
  doc.setTextColor(...PDF_COLORS.body);
  return y + height;
}

/** Pied de page sur toutes les pages : application, date de génération, numéro de page. */
export function addPdfFooter(doc: jsPDF, label: string = APP_NAME): void {
  const total = doc.getNumberOfPages();
  const stamp = `${label} · Généré le ${generatedAtLabel()}`;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const w = pageWidth(doc);
    const h = pageHeight(doc);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.setLineWidth(0.3);
    doc.line(PDF_MARGIN, h - 12, w - PDF_MARGIN, h - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.faint);
    doc.text(stamp, PDF_MARGIN, h - 8);
    doc.text(`Page ${i} / ${total}`, w - PDF_MARGIN, h - 8, { align: "right" });
  }
  doc.setTextColor(0);
}

/** Ajoute le pied de page puis déclenche le téléchargement. */
export function savePdf(doc: jsPDF, filename: string): void {
  addPdfFooter(doc);
  doc.save(filename);
}
