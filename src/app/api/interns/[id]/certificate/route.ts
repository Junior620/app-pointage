import { NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { dayKey } from "@/lib/interns";
import { attendanceSummaries } from "@/lib/internship-stats";
import { internshipCertificateContent, type CertificateData } from "@/lib/documents/internship-certificate";
import { renderDocumentDocx } from "@/lib/documents/render-docx";
import { loadDocxLogo } from "@/lib/documents/docx-logo-server";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Attestation de stage d'un employé (id) : `?format=json` pour le PDF généré dans le navigateur,
 * sinon le document Word.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const employee = await db.employee.findUnique({
      where: { id },
      include: { internship: { include: { supervisor: { select: { firstName: true, lastName: true } } } } },
    });
    if (!employee?.internship) return NextResponse.json({ error: "Stage introuvable" }, { status: 404 });
    const i = employee.internship;

    const summary = (
      await attendanceSummaries(db, [{ employeeId: id, from: dayKey(i.startDate), to: dayKey(i.endDate) }])
    ).get(id);

    const data: CertificateData = {
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        matricule: employee.matricule,
        service: employee.service,
        structure: employee.structure,
      },
      internship: {
        startDate: i.startDate,
        endDate: i.endDate,
        school: i.school,
        fieldOfStudy: i.fieldOfStudy,
        level: i.level,
        supervisorName: i.supervisor ? `${i.supervisor.firstName} ${i.supervisor.lastName}` : null,
      },
      attendance: summary ? { workingDays: summary.workingDays, presentDays: summary.present + summary.missions } : null,
    };

    if (request.nextUrl.searchParams.get("format") === "json") return NextResponse.json({ data });

    const content = internshipCertificateContent(data);
    const buffer = await Packer.toBuffer(renderDocumentDocx(content, await loadDocxLogo(content.structure)));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${content.fileBase}.docx"`,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
