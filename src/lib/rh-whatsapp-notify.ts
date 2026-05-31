import { prisma } from "./prisma";
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

/** Numéros issus des variables d'environnement (rétrocompatibilité). */
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

/** Numéros des comptes RH / Admin / DG actifs renseignés en base. */
export async function getRhAdminNotifyPhonesFromDb(): Promise<string[]> {
  const users = await prisma.user.findMany({
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
export async function getRhAdminNotifyPhones(): Promise<string[]> {
  const [fromEnv, fromDb] = await Promise.all([
    Promise.resolve(getRhAdminNotifyPhonesFromEnv()),
    getRhAdminNotifyPhonesFromDb(),
  ]);
  return mergePhoneLists(fromEnv, fromDb);
}

export async function notifyRhAdminsWhatsApp(text: string): Promise<number> {
  const phones = await getRhAdminNotifyPhones();
  if (phones.length === 0) {
    console.warn(
      "[rh-whatsapp-notify] Aucun destinataire (renseignez whatsapp_phone sur les comptes RH/Admin ou WHATSAPP_RH_NOTIFY_PHONES)."
    );
    return 0;
  }
  await Promise.allSettled(phones.map((p) => sendWhatsAppMessage(p, text)));
  return phones.length;
}

export function normalizeUserWhatsappPhone(
  raw: string | null | undefined
): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return normalizePhone(trimmed);
}
