import { getEmployeeWhatsappPhones } from "./employee-whatsapp";
import { forEachOrg } from "./tenant";
import { APP_TIMEZONE } from "./timezone";
import { todayDate } from "./utils";
import { sendWhatsAppReplyButtons } from "./whatsapp";
import { dayMenu } from "./whatsapp-menu";

/**
 * Envoi unique du nouveau menu WhatsApp (boutons Arrivée / Départ / Plus d'options) à chaque employé actif,
 * dans chaque entreprise, le matin du jour indiqué. Déclenché par le cron /api/cron/menu-announcement.
 */
export const MENU_ANNOUNCEMENT_DAY = "2026-10-23";
/** Pas d'envoi à partir de cette heure (Douala) : sur le plan Hobby, Vercel peut déclencher le cron en retard. */
export const MENU_ANNOUNCEMENT_LATEST_HOUR = 10;

export type MenuAnnouncementResult = {
  skipped?: string;
  sent: number;
  failed: number;
  noPhone: number;
};

function localDayAndHour(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: parseInt(get("hour"), 10) };
}

/** Raison de ne pas envoyer à `now`, ou null si c'est le moment. */
export function menuAnnouncementSkipReason(now: Date): string | null {
  const { day, hour } = localDayAndHour(now);
  if (day !== MENU_ANNOUNCEMENT_DAY) return `Annonce prévue le ${MENU_ANNOUNCEMENT_DAY} (aujourd'hui ${day})`;
  if (hour >= MENU_ANNOUNCEMENT_LATEST_HOUR) return `Trop tard pour l'annonce (${hour} h, limite ${MENU_ANNOUNCEMENT_LATEST_HOUR} h)`;
  return null;
}

export function menuAnnouncementIntro(firstName: string): string {
  return (
    `👋 Bonjour ${firstName}\n\n` +
    "🆕 Votre menu WhatsApp change : pointez votre arrivée et votre départ en un geste, avec les boutons ci-dessous."
  );
}

/**
 * Un employé qui n'a pas écrit au bot depuis 24 h ne peut pas recevoir ce message (règle WhatsApp hors modèle
 * approuvé) : l'envoi est alors compté dans `failed`. Il verra le menu à son prochain « Bonjour ».
 */
export async function sendMenuAnnouncement(now = new Date()): Promise<MenuAnnouncementResult> {
  const skipped = menuAnnouncementSkipReason(now);
  if (skipped) return { skipped, sent: 0, failed: 0, noPhone: 0 };

  const today = todayDate();
  const perOrg = await forEachOrg(async ({ db }) => {
    const result = { sent: 0, failed: 0, noPhone: 0 };
    const employees = await db.employee.findMany({
      where: { active: true },
      select: { id: true, firstName: true },
      orderBy: { lastName: "asc" },
    });
    const records = await db.attendanceRecord.findMany({
      where: { date: today, employeeId: { in: employees.map((e) => e.id) } },
      select: { employeeId: true, checkInTime: true, checkOutTime: true, breakStartTime: true, breakEndTime: true },
    });
    const recordOf = new Map(records.map((r) => [r.employeeId, r]));

    for (const employee of employees) {
      const phones = await getEmployeeWhatsappPhones(employee.id);
      if (phones.length === 0) {
        result.noPhone++;
        continue;
      }
      const { body, buttons } = dayMenu(menuAnnouncementIntro(employee.firstName), recordOf.get(employee.id) ?? null);
      for (const phone of phones) {
        if (await sendWhatsAppReplyButtons(phone, body, buttons)) result.sent++;
        else result.failed++;
      }
    }
    return result;
  });

  return perOrg.reduce(
    (total, r) => ({ sent: total.sent + r.sent, failed: total.failed + r.failed, noPhone: total.noPhone + r.noPhone }),
    { sent: 0, failed: 0, noPhone: 0 }
  );
}
