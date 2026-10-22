import { readFile } from "node:fs/promises";
import path from "node:path";
import { logoMeta, type DocxLogo } from "./logo";

/**
 * Logo d'une structure pour un document Word généré côté serveur, lu dans public/brand/.
 * Les fichiers sont inclus dans les fonctions Vercel via `outputFileTracingIncludes` (next.config.ts).
 * Sans fichier lisible, le document est produit sans logo.
 */
export async function loadDocxLogo(structure: string | null | undefined): Promise<DocxLogo | null> {
  const meta = logoMeta(structure);
  if (!meta) return null;
  try {
    const data = await readFile(path.join(process.cwd(), "public", meta.path));
    return { data, aspect: meta.aspect, name: meta.name, color: meta.color };
  } catch (error) {
    console.warn("[docx] logo introuvable", meta.path, error);
    return null;
  }
}
