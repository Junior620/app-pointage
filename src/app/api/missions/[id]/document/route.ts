import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { missionOrderTitle } from "@/lib/mission-order-number";

type RouteContext = { params: Promise<{ id: string }> };

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
} as const;

function underlineText(text: string) {
  return new TextRun({
    text: text || " ",
    underline: { type: UnderlineType.SINGLE },
  });
}

function fieldRow(label: string, value?: string) {
  // 2 colonnes : libellé + ligne (soulignée) sur toute la largeur restante
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 28, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: false })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 72, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: [
          new Paragraph({
            children: [underlineText(value?.trim() || " ")],
          }),
        ],
      }),
    ],
  });
}

function twoFieldsRow(
  leftLabel: string,
  leftValue: string | undefined,
  rightLabel: string,
  rightValue: string | undefined
) {
  // 4 colonnes : label + ligne, label + ligne (comme le modèle Date/Heure)
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: [new Paragraph(leftLabel)],
      }),
      new TableCell({
        width: { size: 32, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: [new Paragraph({ children: [underlineText(leftValue?.trim() || " ")] })],
      }),
      new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: [new Paragraph(rightLabel)],
      }),
      new TableCell({
        width: { size: 32, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: [new Paragraph({ children: [underlineText(rightValue?.trim() || " ")] })],
      }),
    ],
  });
}

function buildMissionOrderDoc(mission: {
  orderNumber: string | null;
  startDate: Date;
  endDate: Date;
  reason: string;
  location: string | null;
  employee: { lastName: string; firstName: string; service: string };
}) {
  const emp = mission.employee;
  const title = missionOrderTitle(mission.orderNumber, mission.startDate);
  const startDate = mission.startDate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const endDate = mission.endDate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const formTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      fieldRow("Nom(s) :", emp.lastName || " "),
      fieldRow("Prénom(s) :", emp.firstName || " "),
      fieldRow("Fonction :", emp.service || " "),
      fieldRow("Objet de la mission :", mission.reason || " "),
      fieldRow("Lieu de la mission :", mission.location || " "),
      twoFieldsRow("Date :", startDate, "Heure de départ :", " "),
      twoFieldsRow("Date :", endDate, "Heure de retour :", " "),
    ],
  });

  const transportBlock = [
    new Paragraph({
      children: [new TextRun({ text: "Moyen de transport utilisé :", bold: true })],
      spacing: { before: 120, after: 140 },
    }),
    new Paragraph({
      children: [
        new TextRun("- Véhicule de l’entreprise (Dossier du véhicule) "),
        underlineText(" "),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun("- Transport en commun (Retourner le(s) ticket(s) de voyage) "),
        underlineText(" "),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun("- Avion "), underlineText(" ")],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun("- Autres (à préciser) "), underlineText(" ")],
      spacing: { after: 240 },
    }),
  ];

  const signatures = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 33.33, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                text: "Signature du Responsable\ndes Ressources Humaines",
                spacing: { after: 120 },
              }),
              new Paragraph({ text: "\n\n\n" }),
              new Paragraph({ children: [new TextRun({ text: "Date : " }), underlineText(" ")] }),
            ],
          }),
          new TableCell({
            width: { size: 33.33, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                text: "Signature du Responsable\nHiérarchique",
                spacing: { after: 120 },
              }),
              new Paragraph({ text: "\n\n\n" }),
              new Paragraph({ children: [new TextRun({ text: "Date : " }), underlineText(" ")] }),
            ],
          }),
          new TableCell({
            width: { size: 33.33, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                text: "Signature de l’employé(e)",
                spacing: { after: 120 },
              }),
              new Paragraph({ text: "\n\n\n" }),
              new Paragraph({ children: [new TextRun({ text: "Date : " }), underlineText(" ")] }),
            ],
          }),
        ],
      }),
    ],
  });

  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: title,
                underline: { type: UnderlineType.SINGLE },
                bold: true,
              }),
            ],
          }),
          formTable,
          ...transportBlock,
          signatures,
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

    const doc = buildMissionOrderDoc(mission);
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
