import { prisma } from "./prisma";
import { DEFAULT_ORG_SLUG, tenantDb, type OrgInfo } from "./tenant";
import { sendWhatsAppMessage, normalizePhone } from "./whatsapp";

const NOTIFY_ROLES = ["HR", "ADMIN", "DG"] as const;

function phoneDedupeKey(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "") || phone.trim();
}

function mergePhoneLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = phoneDedupeKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/** Numéros issus des variables d'environnement (rétrocompatibilité, entreprise par défaut uniquement). */
export function getRhAdminNotifyPhonesFromEnv(): string[] {
  const merged = [
    process.env.WHATSAPP_RH_NOTIFY_PHONES,
    process.env.WHATSAPP_MISSION_NOTIFY_PHONES,
    process.env.WHATSAPP_LEAVE_NOTIFY_PHONES,
    process.env.WHATSAPP_HR_PHONE,
  ]
    .filter(Boolean)
    .join(",");

  return merged
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Numéros des comptes RH / Admin / DG actifs de l'entreprise, renseignés en base. */
export async function getRhAdminNotifyPhonesFromDb(organizationId: string): Promise<string[]> {
  const users = await tenantDb(organizationId).user.findMany({
    where: {
      active: true,
      role: { in: [...NOTIFY_ROLES] },
      whatsappPhone: { not: null },
    },
    select: { whatsappPhone: true },
  });
  return users
    .map((u) => u.whatsappPhone?.trim())
    .filter((p): p is string => Boolean(p));
}

/** Fusion env + comptes utilisateurs (sans doublon). */
export async function getRhAdminNotifyPhones(org: Pick<OrgInfo, "id" | "slug">): Promise<string[]> {
  const [fromEnv, fromDb] = await Promise.all([
    Promise.resolve(org.slug === DEFAULT_ORG_SLUG ? getRhAdminNotifyPhonesFromEnv() : []),
    getRhAdminNotifyPhonesFromDb(org.id),
  ]);
  return mergePhoneLists(fromEnv, fromDb);
}

/** Alerte les RH / Admin / DG de l'entreprise concernée (jamais ceux d'une autre entreprise). */
export async function notifyRhAdminsWhatsApp(org: Pick<OrgInfo, "id" | "slug">, text: string): Promise<number> {
  const phones = await getRhAdminNotifyPhones(org);
  if (phones.length === 0) {
    console.warn(
      "[rh-whatsapp-notify] Aucun destinataire (renseignez whatsapp_phone sur les comptes RH/Admin ou WHATSAPP_RH_NOTIFY_PHONES)."
    );
    return 0;
  }
  await Promise.allSettled(phones.map((p) => sendWhatsAppMessage(p, text)));
  return phones.length;
}

/**
 * Numéro WhatsApp déjà pris par un employé ou un autre compte. Vérifié sur toutes les entreprises
 * (unicité en base, routage du webhook), sans rien dévoiler d'une autre entreprise.
 */
export async function userWhatsappPhoneConflict(
  whatsappPhone: string | null,
  { userId, organizationId }: { userId?: string; organizationId: string }
): Promise<string | null> {
  if (!whatsappPhone) return null;

  const conflictEmployee = await prisma.employee.findFirst({
    where: {
      OR: [{ whatsappPhone }, { whatsappPhone: whatsappPhone.replace(/\D/g, "") }],
    },
    select: { id: true },
  });
  if (conflictEmployee) {
    return "Ce numéro WhatsApp est déjà lié à un employé (fiche pointage).";
  }

  const conflictUser = await prisma.user.findFirst({
    where: { whatsappPhone, ...(userId ? { NOT: { id: userId } } : {}) },
    select: { email: true, organizationId: true },
  });
  if (conflictUser) {
    return conflictUser.organizationId === organizationId
      ? `Ce numéro WhatsApp est déjà utilisé par ${conflictUser.email}.`
      : "Ce numéro WhatsApp est déjà utilisé par un autre compte.";
  }

  return null;
}

export function normalizeUserWhatsappPhone(
  raw: string | null | undefined
): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return normalizePhone(trimmed);
}
