import type { Structure } from "@prisma/client";
import type { Db, OrgInfo } from "./tenant";

/** Donnée envoyée par le client qui n'appartient pas à l'entreprise courante (→ 400). */
export class OrgValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrgValidationError";
  }
}

/** Structure demandée si elle fait partie de l'entreprise, sa première structure si rien n'est demandé. */
export function assertOrgStructure(org: Pick<OrgInfo, "structures">, requested: Structure | null | undefined): Structure {
  if (!requested) {
    const first = org.structures[0];
    if (!first) throw new OrgValidationError("Aucune structure n'est configurée pour cette entreprise.");
    return first;
  }
  if (!org.structures.includes(requested)) {
    throw new OrgValidationError("Cette structure n'appartient pas à votre entreprise.");
  }
  return requested;
}

/** Les sites référencés doivent appartenir à l'entreprise (db cloisonné : un site d'une autre entreprise est introuvable). */
export async function assertOrgSites(db: Db, siteIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(siteIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const found = await db.site.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new OrgValidationError("Zone de travail inconnue.");
}
