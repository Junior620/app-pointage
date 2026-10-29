import { structureBrand } from "@/lib/brand";
import { fmtDayLongFr, fmtTimestampDayFr } from "@/lib/export-format";
import { calendarDays, daysLabel } from "./leave-request";
import type { DateLike, DocContent } from "./types";

/** Données de l'attestation de stage (renvoyées par GET /api/interns/[id]/certificate?format=json). */
export type CertificateData = {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    service: string;
    structure: string | null;
  };
  internship: {
    startDate: DateLike;
    endDate: DateLike;
    school: string;
    fieldOfStudy: string | null;
    level: string | null;
    supervisorName: string | null;
  };
  /** Jours ouvrés et jours de présence (présent ou en mission) pendant le stage. */
  attendance: { workingDays: number; presentDays: number } | null;
};

export function internshipCertificateContent(data: CertificateData, issuedAt: Date = new Date()): DocContent {
  const { employee: e, internship: i } = data;
  const structureName = structureBrand(e.structure)?.name ?? e.structure ?? "l'entreprise";
  const fullName = `${e.firstName} ${e.lastName.toUpperCase()}`;
  const studies = [i.fieldOfStudy?.trim(), i.level?.trim() ? `(${i.level.trim()})` : null].filter(Boolean).join(" ");
  const student = studies ? `étudiant(e) en ${studies} à ${i.school}` : `étudiant(e) à ${i.school}`;
  const period = `du ${fmtDayLongFr(i.startDate)} au ${fmtDayLongFr(i.endDate)}`;
  const issued = fmtTimestampDayFr(issuedAt);

  const rows: [string, string][] = [
    ["Stagiaire", `${fullName} (matricule ${e.matricule})`],
    ["Établissement", [i.school, i.fieldOfStudy, i.level].map((s) => s?.trim()).filter(Boolean).join(" · ")],
    ["Service d'accueil", e.service],
    ["Période", period],
    ["Durée", daysLabel(calendarDays(i.startDate, i.endDate))],
    ["Encadrant", i.supervisorName ?? "—"],
  ];
  if (data.attendance && data.attendance.workingDays > 0) {
    const { presentDays, workingDays } = data.attendance;
    rows.push(["Présence", `${presentDays} jour${presentDays > 1 ? "s" : ""} sur ${workingDays} jour${workingDays > 1 ? "s" : ""} ouvré${workingDays > 1 ? "s" : ""}`]);
  }

  return {
    structure: e.structure,
    title: "Attestation de stage",
    subtitle: [`Matricule ${e.matricule} · délivrée le ${issued}`],
    intro: [
      `Je soussigné(e), ______________________________, Responsable des Ressources humaines de ${structureName}, atteste que ${fullName}, ${student}, a effectué un stage au sein de notre service ${e.service}, ${period}.`,
    ],
    sections: [{ title: "Récapitulatif du stage", rows }],
    closing: [
      "La présente attestation lui est délivrée pour servir et valoir ce que de droit.",
      `Fait à ______________________, le ${issued}`,
    ],
    signatures: ["Le responsable des Ressources humaines", "L'encadrant de stage"],
    fileBase: `attestation_stage_${e.matricule}`,
  };
}
