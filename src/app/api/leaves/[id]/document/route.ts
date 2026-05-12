import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { LeaveRequest } from "@prisma/client";
import type { Employee } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import {
  leaveAbsenceCategoryLabel,
  leaveSubmissionSourceLabel,
} from "@/lib/leave-absence-labels";

type RouteContext = { params: Promise<{ id: string }> };

function line(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label} : `, bold: true }),
      new TextRun({ text: value || "—" }),
    ],
    spacing: { after: 120 },
  });
}

function buildLeaveDocument(leave: LeaveRequest & { employee: Employee }) {
  const emp = leave.employee;
  const start = leave.startDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const end = leave.endDate.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const created = leave.createdAt.toLocaleDateString("fr-FR");

  const statusLabel =
    leave.status === "PENDING"
      ? "En attente"
      : leave.status === "APPROVED"
        ? "Approuvé"
        : "Refusé";

  return new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Demande d'autorisation d'absence / congés",
            heading: HeadingLevel.TITLE,
            spacing: { after: 320 },
          }),
          line("Structure employé", emp.structure ?? "—"),
          line("Nom", `${emp.lastName} ${emp.firstName}`),
          line("Matricule", emp.matricule ?? "—"),
          line("Service", emp.service ?? "—"),
          line("Origine du dossier", leaveSubmissionSourceLabel(leave.submissionSource)),
          line("Catégorie de demande", leaveAbsenceCategoryLabel(leave.absenceCategory ?? undefined)),
          line("Du", start),
          line("Au", end),
          line("Motif", leave.reason),
          line(
            "Personne / service à prévenir",
            leave.notifyOrReplace ?? "—"
          ),
          line("Statut RH", `${statusLabel}${leave.approvedBy ? ` (${leave.approvedBy})` : ""}`),
          line("Date de création", created),
          new Paragraph({
            children: [
              new TextRun({
                text: "\nCe document est généré à partir du formulaire dans Pointage RH. Signature papier peut être ajoutée sur la copie imprimée.",
                italics: true,
                size: 20,
              }),
            ],
          }),
        ],
      },
    ],
  });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!leave) {
      return new Response("Non trouvé", { status: 404 });
    }

    const doc = buildLeaveDocument(leave);
    const buffer = await Packer.toBuffer(doc);
    const name = `demande_autorisation_${leave.employee.matricule}_${leave.id.slice(0, 8)}.docx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${name}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié")
        return new Response(JSON.stringify({ error: error.message }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      if (error.message === "Accès interdit")
        return new Response(JSON.stringify({ error: error.message }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
