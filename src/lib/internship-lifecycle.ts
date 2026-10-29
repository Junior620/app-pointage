import { fmtDayFr } from "./export-format";
import { INTERN_END_REMINDER_DAYS, dayKey } from "./interns";
import { notifyRhAdminsWhatsApp } from "./rh-whatsapp-notify";
import type { OrgInfo, TenantScope } from "./tenant";
import { todayDate } from "./utils";

const DAY_MS = 86_400_000;

const internSelect = { id: true, firstName: true, lastName: true, matricule: true } as const;

/**
 * Tâche quotidienne d'une entreprise :
 * - le lendemain de la date de fin, le stagiaire sort (inactif, motif « Fin de stage ») et ne peut plus pointer ;
 * - 7 jours avant la fin, les RH sont prévenus une seule fois (`endReminderSentAt`, remis à zéro si on prolonge).
 */
export async function runInternshipLifecycle({ db, org }: TenantScope & { org: OrgInfo }) {
  const todayStart = new Date(`${dayKey(todayDate())}T00:00:00.000Z`);
  const reminderLimit = new Date(todayStart.getTime() + INTERN_END_REMINDER_DAYS * DAY_MS);
  const activeIntern = { active: true, kind: "INTERN" as const };

  const ended = await db.internship.findMany({
    where: { endDate: { lt: todayStart }, employee: activeIntern },
    include: { employee: { select: internSelect } },
    orderBy: { endDate: "asc" },
  });
  for (const internship of ended) {
    await db.employee.update({
      where: { id: internship.employee.id },
      data: {
        active: false,
        departureDate: internship.endDate,
        departureReason: "INTERNSHIP_END",
        departureNote: "Fin de stage (sortie automatique)",
      },
    });
  }

  const ending = await db.internship.findMany({
    where: { endDate: { gte: todayStart, lte: reminderLimit }, endReminderSentAt: null, employee: activeIntern },
    include: { employee: { select: internSelect } },
    orderBy: { endDate: "asc" },
  });
  if (ending.length > 0) {
    await db.internship.updateMany({
      where: { id: { in: ending.map((i) => i.id) } },
      data: { endReminderSentAt: new Date() },
    });
  }

  const name = (e: (typeof ended)[number]["employee"]) => `${e.lastName} ${e.firstName} (${e.matricule})`;
  const lines: string[] = [];
  if (ending.length > 0) {
    lines.push(
      "🎓 *Stages qui se terminent bientôt*",
      ...ending.map((i) => `• ${name(i.employee)} — fin le ${fmtDayFr(i.endDate)}`),
      "Prolongez le stage ou préparez l'attestation : Pointage RH → Stagiaires."
    );
  }
  if (ended.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(
      "✅ *Stages terminés*",
      ...ended.map((i) => `• ${name(i.employee)} — terminé le ${fmtDayFr(i.endDate)}`),
      "Ces stagiaires ne peuvent plus pointer. L'attestation reste disponible dans Pointage RH → Stagiaires."
    );
  }
  if (lines.length > 0) await notifyRhAdminsWhatsApp(org, lines.join("\n"));

  return { ended: ended.length, reminded: ending.length };
}
