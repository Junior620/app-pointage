"use client";

import type { jsPDF } from "jspdf";
import { STRUCTURE_BRANDS, STRUCTURE_CODES, type StructureCode } from "@/lib/brand";

const cache = new Map<string, Promise<string | null>>();

function loadDataUrl(path: string): Promise<string | null> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(path)
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (blob) =>
          blob &&
          new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          })
      )
      .catch(() => null);
    cache.set(path, p);
  }
  return p;
}

/**
 * Ajoute les logos des structures en haut à droite de la page courante d'un PDF jsPDF.
 * Sans fichier de logo (ou en cas d'échec de chargement), rien n'est ajouté : l'export reste valide.
 * `structures` : celle(s) concernée(s) par le document (par défaut les deux).
 */
export async function addPdfLogos(
  doc: jsPDF,
  structures: (StructureCode | string | null | undefined)[] = STRUCTURE_CODES,
  { top = 8, height = 11, right = 14 }: { top?: number; height?: number; right?: number } = {}
): Promise<void> {
  const requested = new Set(structures.filter((c): c is StructureCode => c === "SCPB" || c === "AFREXIA"));
  // Toujours dans l'ordre de STRUCTURE_CODES, quel que soit l'ordre des lignes du rapport.
  const unique = requested.size ? STRUCTURE_CODES.filter((c) => requested.has(c)) : STRUCTURE_CODES;
  const images = await Promise.all(
    unique.map(async (code) => {
      const path = STRUCTURE_BRANDS[code].logo;
      return { code, data: path ? await loadDataUrl(path) : null };
    })
  );

  const pageWidth = doc.internal.pageSize.getWidth();
  let x = pageWidth - right;
  const gap = 4;
  // De droite à gauche, pour garder l'ordre SCPB · AFREXIA à la lecture.
  for (const { code, data } of [...images].reverse()) {
    if (!data) continue;
    const brand = STRUCTURE_BRANDS[code];
    const w = height * brand.logoAspect;
    if (!brand.wordmark) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const label = brand.name;
      const tw = doc.getTextWidth(label);
      const previous = doc.getTextColor();
      doc.setTextColor(brand.hex);
      doc.text(label, x - tw, top + height / 2 + 1.2);
      doc.setTextColor(previous);
      doc.setFont("helvetica", "normal");
      x -= tw + 1.5;
    }
    try {
      // Alias : l'image n'est intégrée qu'une fois même si elle figure sur plusieurs pages.
      doc.addImage(data, "PNG", x - w, top, w, height, `logo-${code}`, "FAST");
      x -= w + gap;
    } catch {
      // Image illisible : on n'interrompt pas l'export.
    }
  }
}
