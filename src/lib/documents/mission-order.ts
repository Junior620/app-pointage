import { structureBrand } from "@/lib/brand";
import { fmtDayFr, fmtDayLongFr, fmtTimestampDayFr } from "@/lib/export-format";
import { calendarDays, daysLabel } from "./leave-request";
import type { DateLike, DocContent } from "./types";

export type MissionDocInput = {
  id: string;
  orderNumber?: string | null;
  employee: {
    firstName: string;
    lastName: string;
    matricule: string;
    service?: string | null;
    structure?: string | null;
  };
  startDate: DateLike;
  endDate: DateLike;
  reason: string;
  location?: string | null;
  transport?: string | null;
  lodging?: string | null;
  expenses?: string | null;
  originStructure?: string | null;
  hostStructure?: string | null;
  cancelledAt?: DateLike | null;
  cancelledBy?: string | null;
};

const structureName = (code: string | null | undefined) => structureBrand(code)?.name ?? code ?? "—";

export function missionOrderContent(m: MissionDocInput, issuedAt: Date = new Date()): DocContent {
  const origin = m.originStructure ?? m.employee.structure ?? null;
  const issued = fmtTimestampDayFr(issuedAt);

  return {
    structure: origin,
    title: "Ordre de mission",
    subtitle: [`${m.orderNumber ? `N° ${m.orderNumber}` : "N° non attribué"} · émis le ${issued}`],
    notice: m.cancelledAt
      ? `Mission annulée le ${fmtTimestampDayFr(m.cancelledAt)}${m.cancelledBy ? ` par ${m.cancelledBy}` : ""} : cet ordre n'est plus valable.`
      : undefined,
    sections: [
      {
        title: "Missionnaire",
        rows: [
          ["Nom et prénom", `${m.employee.lastName} ${m.employee.firstName}`],
          ["Matricule", m.employee.matricule],
          ["Service", m.employee.service || "—"],
          ["Structure d'origine", structureName(origin)],
        ],
      },
      {
        title: "Mission",
        rows: [
          ["Objet", m.reason.trim() || "—"],
          ["Lieu", m.location?.trim() || "—"],
          ["Structure d'accueil", structureName(m.hostStructure)],
          ["Du", fmtDayLongFr(m.startDate)],
          ["Au", fmtDayLongFr(m.endDate)],
          ["Durée prévue", daysLabel(calendarDays(m.startDate, m.endDate))],
        ],
      },
      {
        title: "Moyens",
        rows: [
          ["Transport", m.transport?.trim() || "—"],
          ["Hébergement", m.lodging?.trim() || "—"],
          ["Frais", m.expenses?.trim() || "—"],
        ],
      },
    ],
    closing: [
      "Le présent ordre de mission est délivré pour servir et valoir ce que de droit.",
      `Fait à ______________________, le ${issued}`,
    ],
    signatures: ["Le responsable des Ressources humaines", "Le responsable hiérarchique", "L'employé(e)"],
    fileBase: `ordre_mission_${m.employee.matricule}_${m.id.slice(0, 8)}`,
  };
}

/** Case du modèle officiel à cocher selon le transport saisi (texte libre). */
export type TransportOption = "VEHICLE" | "PUBLIC" | "PLANE" | "OTHER";

export function transportOption(transport: string | null | undefined): TransportOption | null {
  const t = transport?.trim().toLowerCase();
  if (!t) return null;
  if (/personnel|perso\b|propre/.test(t)) return "OTHER";
  if (/v[ée]hicule|voiture|entreprise|soci[ée]t[ée]|service/.test(t)) return "VEHICLE";
  if (/commun|bus|car\b|cars\b|taxi|moto|train|agence/.test(t)) return "PUBLIC";
  if (/avion|a[ée]rien|vol\b/.test(t)) return "PLANE";
  return "OTHER";
}

/** « 03/06/2026 » pour les champs date du modèle officiel. */
export const missionDay = (d: DateLike) => fmtDayFr(d);
