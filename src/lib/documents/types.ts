/**
 * Contenu d'un document RH (demande d'absence, ordre de mission), indépendant du format :
 * le même contenu est rendu en PDF (navigateur) et en Word (navigateur ou serveur).
 */
export type DocSection = {
  title: string;
  rows: [label: string, value: string][];
};

export type DocContent = {
  /** Structure dont le logo figure en en-tête (SCPB, AFREXIA). */
  structure: string | null;
  title: string;
  subtitle: string[];
  /** Bandeau d'alerte sous le titre (ex. demande annulée). */
  notice?: string;
  /** Paragraphes de texte avant les sections (ex. corps d'une attestation). */
  intro?: string[];
  sections: DocSection[];
  /** Paragraphes avant les signatures. */
  closing?: string[];
  signatures: string[];
  /** Nom de fichier sans extension. */
  fileBase: string;
};

export type DateLike = string | Date;
