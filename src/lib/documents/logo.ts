import { structureBrand } from "@/lib/brand";

/**
 * Logo d'une structure pour les documents Word (données lues sur disque ou téléchargées).
 * Module volontairement léger : il ne charge pas la bibliothèque `docx`.
 */
export type DocxLogo = {
  data: Uint8Array | ArrayBuffer;
  aspect: number;
  /** Nom à écrire à côté quand le logo ne le contient pas. */
  name: string | null;
  color: string;
};

export function logoMeta(structure: string | null | undefined) {
  const brand = structureBrand(structure);
  if (!brand?.logo) return null;
  return {
    path: brand.logo,
    aspect: brand.logoAspect,
    name: brand.wordmark ? null : brand.name,
    color: brand.hex.replace("#", "").toUpperCase(),
  };
}
