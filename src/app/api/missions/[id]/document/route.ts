import {
  AlignmentType,
  Document,
  HeightRule,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
} from "docx";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { missionOrderTitle } from "@/lib/mission-order-number";
import {
  DOCX_COLORS,
  DOCX_CONTENT_WIDTH,
  DOCX_SECTION_PROPERTIES,
  DOCX_STYLES,
  NO_BORDERS,
  TABLE_NO_BORDERS,
  docxFooter,
  docxNotice,
  docxSignatures,
  line,
  logoParagraph,
  spacer,
  type DocxLogo,
} from "@/lib/documents/docx-kit";
import { loadDocxLogo } from "@/lib/documents/docx-logo-server";
import { missionDay, transportOption, type TransportOption } from "@/lib/documents/mission-order";
import { fmtTimestampDayFr } from "@/lib/export-format";

type RouteContext = { params: Promise<{ id: string }> };

// Grille fixe du formulaire : libellé | valeur | libellé | valeur.
// Les lignes à un seul champ fusionnent les trois dernières colonnes ; Word respecte ainsi
// les largeurs (sans grille fixe, « Heure de départ » était écrasé dans une colonne d'un mot).
const COLS = [2550, 2650, 2000, DOCX_CONTENT_WIDTH - 2550 - 2650 - 2000];
const ROW_HEIGHT = { value: 460, rule: HeightRule.ATLEAST };

function labelCell(text: string, width: number, { indent = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.BOTTOM,
    margins: { top: 60, bottom: 40, left: indent ? 200 : 0 },
    children: [new Paragraph({ children: [new TextRun({ text, color: DOCX_COLORS.body })] })],
  });
}

/** Valeur posée sur une ligne à remplir (bordure basse), visible même vide. */
function valueCell(text: string | null | undefined, width: number, columnSpan?: number) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan,
    borders: { ...NO_BORDERS, bottom: line(DOCX_COLORS.faint, 6) },
    verticalAlign: VerticalAlign.BOTTOM,
    margins: { top: 60, bottom: 40, left: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: text?.trim() || " " })] })],
  });
}

function fieldRow(label: string, value: string | null | undefined) {
  return new TableRow({
    height: ROW_HEIGHT,
    cantSplit: true,
    children: [labelCell(label, COLS[0]), valueCell(value, COLS[1] + COLS[2] + COLS[3], 3)],
  });
}

function dateTimeRow(date: string, timeLabel: string) {
  return new TableRow({
    height: ROW_HEIGHT,
    cantSplit: true,
    children: [
      labelCell("Date :", COLS[0]),
      valueCell(date, COLS[1]),
      labelCell(timeLabel, COLS[2], { indent: true }),
      valueCell(null, COLS[3]),
    ],
  });
}

const TRANSPORT_CHOICES: [TransportOption, string][] = [
  ["VEHICLE", "Véhicule de l’entreprise (Dossier du véhicule)"],
  ["PUBLIC", "Transport en commun (Retourner le(s) ticket(s) de voyage)"],
  ["PLANE", "Avion"],
  ["OTHER", "Autres (à préciser)"],
];

function transportBlock(transport: string | null) {
  const selected = transportOption(transport);
  return [
    new Paragraph({
      spacing: { before: 280, after: 120 },
      children: [new TextRun({ text: "Moyen de transport utilisé :", bold: true })],
    }),
    ...TRANSPORT_CHOICES.map(([option, label]) => {
      const checked = option === selected;
      const children = [
        new TextRun({ text: checked ? "☒" : "☐", font: "Segoe UI Symbol", size: 24 }),
        new TextRun({ text: `  ${label}`, bold: checked }),
      ];
      if (option === "OTHER") {
        children.push(
          checked && transport
            ? new TextRun({ text: ` : ${transport.trim()}`, underline: { type: UnderlineType.SINGLE } })
            : new TextRun({ text: " : ______________________________", color: DOCX_COLORS.faint })
        );
      }
      return new Paragraph({ spacing: { after: 80 }, indent: { left: 240 }, children });
    }),
  ];
}

function buildMissionOrderDoc(
  mission: {
    orderNumber: string | null;
    startDate: Date;
    endDate: Date;
    reason: string;
    location: string | null;
    transport: string | null;
    cancelledAt: Date | null;
    cancelledBy: string | null;
    employee: { lastName: string; firstName: string; service: string };
  },
  logo: DocxLogo | null
) {
  const emp = mission.employee;
  const formTable = new Table({
    width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: COLS,
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [
      fieldRow("Nom(s) :", emp.lastName),
      fieldRow("Prénom(s) :", emp.firstName),
      fieldRow("Fonction :", emp.service),
      fieldRow("Objet de la mission :", mission.reason),
      fieldRow("Lieu de la mission :", mission.location),
      dateTimeRow(missionDay(mission.startDate), "Heure de départ :"),
      dateTimeRow(missionDay(mission.endDate), "Heure de retour :"),
    ],
  });

  return new Document({
    creator: "Pointage RH",
    title: missionOrderTitle(mission.orderNumber, mission.startDate),
    styles: DOCX_STYLES,
    sections: [
      {
        properties: DOCX_SECTION_PROPERTIES,
        footers: { default: docxFooter() },
        children: [
          ...(logo ? [logoParagraph(logo, { height: 52, alignment: AlignmentType.LEFT })] : []),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 320 },
            children: [
              new TextRun({
                text: missionOrderTitle(mission.orderNumber, mission.startDate),
                bold: true,
                size: 32,
                underline: { type: UnderlineType.SINGLE },
              }),
            ],
          }),
          ...(mission.cancelledAt
            ? [
                docxNotice(
                  `Mission annulée le ${fmtTimestampDayFr(mission.cancelledAt)}${mission.cancelledBy ? ` par ${mission.cancelledBy}` : ""} : cet ordre n'est plus valable.`
                ),
              ]
            : []),
          formTable,
          ...transportBlock(mission.transport),
          spacer(240),
          docxSignatures([
            "Signature du Responsable des Ressources Humaines",
            "Signature du Responsable Hiérarchique",
            "Signature de l’employé(e)",
          ]),
        ],
      },
    ],
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;
    const mission = await prisma.mission.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!mission) return new Response("Non trouvé", { status: 404 });

    const doc = buildMissionOrderDoc(mission, await loadDocxLogo(mission.originStructure ?? mission.employee.structure));
    const buffer = await Packer.toBuffer(doc);
    const numPart = mission.orderNumber?.replace(/\//g, "-") ?? mission.id.slice(0, 8);
    const name = `ordre_mission_${numPart}_${mission.employee.matricule}.docx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") {
        return new Response(JSON.stringify({ error: error.message }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      if (error.message === "Accès interdit") {
        return new Response(JSON.stringify({ error: error.message }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
