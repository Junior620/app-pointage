import type { Db } from "./tenant";

/**
 * Services des employés. La liste proposée = services par défaut + services déjà utilisés dans l'entreprise :
 * un service ajouté à la main est donc enregistré avec l'employé et proposé ensuite à toute l'entreprise.
 */
export const DEFAULT_SERVICES = ["IT", "QHSE", "RH", "DAF", "RAF", "ST"];

const sameService = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" }) === 0;

/** Espaces superflus retirés ; reprend l'écriture d'un service connu (« rh » → « RH », accents ignorés). */
export function normalizeService(input: string, known: readonly string[] = []): string {
  const name = input.trim().replace(/\s+/g, " ");
  return known.find((s) => sameService(s, name)) ?? name;
}

// Majuscules d'abord : entre « Logistique » et « logistique », c'est « Logistique » qui est gardé.
const byName = new Intl.Collator("fr", { caseFirst: "upper" }).compare;

/** Services par défaut d'abord, puis ceux de l'entreprise par ordre alphabétique, sans doublon. */
export function mergeServices(used: readonly string[]): string[] {
  const out = [...DEFAULT_SERVICES];
  const names = used.map((s) => normalizeService(s)).filter(Boolean).sort(byName);
  for (const name of names) {
    if (!out.some((o) => sameService(o, name))) out.push(name);
  }
  return out;
}

/** Liste proposée pour l'entreprise de `db` (employés actifs et inactifs). */
export async function listOrgServices(db: Db): Promise<string[]> {
  const rows = await db.employee.findMany({ select: { service: true }, distinct: ["service"] });
  return mergeServices(rows.map((r) => r.service));
}

/** Partie service du matricule : « QHSE », « LOGI » pour Logistique, « GEN » à défaut de lettres. */
export function matriculeServiceCode(service: string): string {
  const letters = service
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z]/g, "");
  return letters.slice(0, 4) || "GEN";
}
