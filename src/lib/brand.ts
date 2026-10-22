export type StructureCode = "SCPB" | "AFREXIA";

export const STRUCTURE_CODES: StructureCode[] = ["SCPB", "AFREXIA"];

export type StructureBrand = {
  code: StructureCode;
  /** Nom affiché à côté du logo */
  name: string;
  /**
   * Logo pour fond clair (chemin dans public/, ex. "/brand/scpb.png").
   * null si aucun fichier : un monogramme s'affiche à la place.
   */
  logo: string | null;
  /** Variante pour fond sombre (menu latéral). Si absente, le logo clair est posé sur une pastille blanche. */
  logoOnDark: string | null;
  /** Le logo contient déjà le nom écrit (sinon le nom est affiché à côté du pictogramme). */
  wordmark: boolean;
  /** Proportion largeur / hauteur du fichier `logo` (pour les PDF et documents Word). */
  logoAspect: number;
  /** Couleur principale (hexadécimal) pour les exports PDF / Excel. */
  hex: string;
  /** Classes Tailwind (couleurs définies dans globals.css) */
  badgeClass: string;
  monogramClass: string;
  accentClass: string;
};

export const APP_NAME = "Pointage RH";
export const APP_TAGLINE = "Gestion des présences";

/**
 * Couleur des en-têtes de tableaux dans les exports PDF / Excel / Word.
 * Alignée sur `--color-brand-600` (globals.css) : à changer en même temps que la couleur principale.
 */
export const EXPORT_ACCENT_HEX = "#2563eb";

/**
 * Logos : fichiers recadrés et allégés dans public/brand/ (scpb.png, afrexia.png),
 * générés à partir des originaux fournis (logo.png, logo-dark.png).
 */
export const STRUCTURE_BRANDS: Record<StructureCode, StructureBrand> = {
  SCPB: {
    code: "SCPB",
    name: "SCPB",
    logo: "/brand/scpb.png",
    // Lettres noires : sur fond sombre, le logo est posé sur une pastille blanche.
    logoOnDark: null,
    wordmark: true,
    logoAspect: 411 / 240,
    hex: "#7a8a2c",
    badgeClass: "bg-scpb-50 text-scpb-700 ring-scpb-100",
    monogramClass: "bg-scpb-600 text-white",
    accentClass: "bg-scpb-500",
  },
  AFREXIA: {
    code: "AFREXIA",
    name: "AFREXIA",
    logo: "/brand/afrexia.png",
    logoOnDark: "/brand/afrexia.png",
    wordmark: false,
    logoAspect: 255 / 240,
    hex: "#24683c",
    badgeClass: "bg-afrexia-50 text-afrexia-700 ring-afrexia-100",
    monogramClass: "bg-afrexia-600 text-white",
    accentClass: "bg-afrexia-500",
  },
};

export function isStructureCode(value: unknown): value is StructureCode {
  return value === "SCPB" || value === "AFREXIA";
}

export function structureBrand(code: string | null | undefined): StructureBrand | null {
  return isStructureCode(code) ? STRUCTURE_BRANDS[code] : null;
}
