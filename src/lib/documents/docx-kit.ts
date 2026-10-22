import {
  AlignmentType,
  BorderStyle,
  Footer,
  HeightRule,
  ImageRun,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IStylesOptions,
} from "docx";
import { APP_NAME, EXPORT_ACCENT_HEX } from "@/lib/brand";
import { generatedAtLabel } from "@/lib/export-format";
import type { DocxLogo } from "./logo";

/**
 * Briques communes des documents Word (bibliothèque `docx`), utilisables côté navigateur et serveur.
 * Les largeurs sont en twips (1 cm = 567) ; la grille des tableaux est fixée pour que Word
 * respecte les colonnes au lieu de les recalculer d'après le contenu.
 */

export const DOCX_FONT = "Arial";
export const DOCX_COLORS = {
  accent: EXPORT_ACCENT_HEX.replace("#", "").toUpperCase(),
  ink: "0F172A",
  body: "334155",
  muted: "64748B",
  faint: "94A3B8",
  line: "CBD5E1",
  lineLight: "E2E8F0",
  shade: "F1F5F9",
  danger: "B91C1C",
  dangerBg: "FEF2F2",
};

/** Marges de 2 cm sur une page A4 (11 906 twips de large). */
export const DOCX_PAGE_MARGIN = 1134;
export const DOCX_CONTENT_WIDTH = 11906 - 2 * DOCX_PAGE_MARGIN;

export const DOCX_STYLES: IStylesOptions = {
  default: {
    document: {
      run: { font: DOCX_FONT, size: 20, color: DOCX_COLORS.ink },
      paragraph: { spacing: { line: 276 } },
    },
  },
};

export const DOCX_SECTION_PROPERTIES = {
  page: { margin: { top: DOCX_PAGE_MARGIN, bottom: DOCX_PAGE_MARGIN, left: DOCX_PAGE_MARGIN, right: DOCX_PAGE_MARGIN } },
};

const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
export const NO_BORDERS = { top: none, bottom: none, left: none, right: none } as const;
export const TABLE_NO_BORDERS = { ...NO_BORDERS, insideHorizontal: none, insideVertical: none } as const;

export function line(color: string = DOCX_COLORS.line, size = 4) {
  return { style: BorderStyle.SINGLE, size, color } as const;
}

export type { DocxLogo };

/** Logo (et nom de la structure s'il n'y figure pas) sur une ligne. Hauteur en pixels. */
export function logoParagraph(
  logo: DocxLogo,
  { height = 44, alignment = AlignmentType.RIGHT }: { height?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
) {
  const children: (ImageRun | TextRun)[] = [
    new ImageRun({
      type: "png",
      data: logo.data,
      transformation: { width: Math.round(height * logo.aspect), height },
    }),
  ];
  if (logo.name) children.push(new TextRun({ text: `  ${logo.name}`, bold: true, size: 24, color: logo.color }));
  return new Paragraph({ alignment, children });
}

/**
 * En-tête : titre et sous-titres à gauche, logo à droite, filet coloré dessous.
 */
export function docxHeader({ title, subtitle = [], logo }: { title: string; subtitle?: string[]; logo: DocxLogo | null }) {
  const left = DOCX_CONTENT_WIDTH - 3000;
  return new Table({
    width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [left, 3000],
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: left, type: WidthType.DXA },
            borders: { ...NO_BORDERS, bottom: line(DOCX_COLORS.accent, 12) },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { bottom: 120 },
            children: [
              new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 30, color: DOCX_COLORS.ink })] }),
              ...subtitle.map(
                (s) => new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: s, size: 18, color: DOCX_COLORS.muted })] })
              ),
            ],
          }),
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            borders: { ...NO_BORDERS, bottom: line(DOCX_COLORS.accent, 12) },
            verticalAlign: VerticalAlign.BOTTOM,
            margins: { bottom: 120 },
            children: [logo ? logoParagraph(logo) : new Paragraph("")],
          }),
        ],
      }),
    ],
  });
}

export function spacer(after = 160) {
  return new Paragraph({ spacing: { after }, children: [] });
}

/** Bandeau d'alerte rouge (demande annulée…). */
export function docxNotice(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: DOCX_COLORS.dangerBg },
    border: { left: line(DOCX_COLORS.danger, 18) },
    indent: { left: 120 },
    children: [new TextRun({ text, bold: true, size: 19, color: DOCX_COLORS.danger })],
  });
}

export function docxSectionTitle(title: string) {
  return new Paragraph({
    spacing: { before: 280, after: 80 },
    border: { bottom: line(DOCX_COLORS.lineLight, 6) },
    children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 17, color: DOCX_COLORS.accent, characterSpacing: 10 })],
  });
}

/** Tableau « libellé / valeur » à filets horizontaux. */
export function docxKeyValues(rows: [string, string][]) {
  const labelWidth = 3200;
  const valueWidth = DOCX_CONTENT_WIDTH - labelWidth;
  const rowBorders = { ...NO_BORDERS, bottom: line(DOCX_COLORS.lineLight, 4) };
  return new Table({
    width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [labelWidth, valueWidth],
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: labelWidth, type: WidthType.DXA },
              borders: rowBorders,
              margins: { top: 70, bottom: 70 },
              children: [new Paragraph({ children: [new TextRun({ text: label, color: DOCX_COLORS.muted })] })],
            }),
            new TableCell({
              width: { size: valueWidth, type: WidthType.DXA },
              borders: rowBorders,
              margins: { top: 70, bottom: 70 },
              children: value.split("\n").map((l) => new Paragraph({ children: [new TextRun({ text: l || " " })] })),
            }),
          ],
        })
    ),
  });
}

export function docxParagraph(text: string, { before = 0, after = 120 } = {}) {
  return new Paragraph({ spacing: { before, after }, children: [new TextRun({ text, color: DOCX_COLORS.body })] });
}

/** Cadres de signature : libellé, espace pour signer, puis « Date : ». */
export function docxSignatures(labels: string[], { space = 1300 } = {}) {
  const width = Math.floor(DOCX_CONTENT_WIDTH / labels.length);
  const borders = { top: line(), bottom: line(), left: line(), right: line() };
  const cell = (children: Paragraph[], opts: { shade?: boolean; bottom?: boolean } = {}) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: DOCX_COLORS.shade } : undefined,
      children,
    });
  return new Table({
    width: { size: width * labels.length, type: WidthType.DXA },
    columnWidths: labels.map(() => width),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        cantSplit: true,
        children: labels.map((l) =>
          cell([new Paragraph({ children: [new TextRun({ text: l, bold: true, size: 18, color: DOCX_COLORS.body })] })], { shade: true })
        ),
      }),
      new TableRow({
        cantSplit: true,
        height: { value: space, rule: HeightRule.ATLEAST },
        children: labels.map(() => cell([new Paragraph("")])),
      }),
      new TableRow({
        cantSplit: true,
        children: labels.map(() =>
          cell([new Paragraph({ children: [new TextRun({ text: "Date :", size: 18, color: DOCX_COLORS.muted })] })])
        ),
      }),
    ],
  });
}

/** Pied de page : application, date de génération, numéro de page. */
export function docxFooter(label: string = APP_NAME) {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: line(DOCX_COLORS.lineLight, 4) },
        spacing: { before: 80 },
        tabStops: [{ type: "right", position: DOCX_CONTENT_WIDTH }],
        children: [
          new TextRun({ text: `${label} · Généré le ${generatedAtLabel()}`, size: 15, color: DOCX_COLORS.faint }),
          new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: 15, color: DOCX_COLORS.faint }),
        ],
      }),
    ],
  });
}
