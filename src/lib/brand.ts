export type StructureCode = "SCPB" | "AFREXIA";

export const STRUCTURE_CODES: StructureCode[] = ["SCPB", "AFREXIA"];

export type StructureBrand = {
  code: StructureCode;
  /** Nom affiché à côté du logo */
  name: string;
  /**
   * Logo pour fond clair (chemin dans public/, ex. "/brand/scpb.svg").
   * null tant que le fichier officiel n'est pas fourni : un monogramme s'affiche à la place.
   */
  logo: string | null;
  /** Variante pour fond sombre (menu latéral). Si absente, le logo clair est posé sur une pastille blanche. */
  logoOnDark: string | null;
  /** Classes Tailwind (couleurs définies dans globals.css) */
  badgeClass: string;
  monogramClass: string;
  accentClass: string;
};

export const APP_NAME = "Pointage RH";
export const APP_TAGLINE = "Gestion des présences";

export const STRUCTURE_BRANDS: Record<StructureCode, StructureBrand> = {
  SCPB: {
    code: "SCPB",
    name: "SCPB",
    logo: null,
    logoOnDark: null,
    badgeClass: "bg-scpb-50 text-scpb-700 ring-scpb-100",
    monogramClass: "bg-scpb-600 text-white",
    accentClass: "bg-scpb-600",
  },
  AFREXIA: {
    code: "AFREXIA",
    name: "AFREXIA",
    logo: null,
    logoOnDark: null,
    badgeClass: "bg-afrexia-50 text-afrexia-700 ring-afrexia-100",
    monogramClass: "bg-afrexia-600 text-white",
    accentClass: "bg-afrexia-600",
  },
};

export function isStructureCode(value: unknown): value is StructureCode {
  return value === "SCPB" || value === "AFREXIA";
}

export function structureBrand(code: string | null | undefined): StructureBrand | null {
  return isStructureCode(code) ? STRUCTURE_BRANDS[code] : null;
}
