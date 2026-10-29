import { dayKey } from "./interns";
import type { Db } from "./tenant";
import { todayDate } from "./utils";

/**
 * Présence d'un stagiaire sur une période (jours ouvrés lundi–vendredi hors fériés,
 * arrêtée à aujourd'hui). Sert à l'attestation de stage et au récapitulatif des gratifications.
 */
export type AttendanceSummary = {
  /** Jours ouvrés de la période (passés ou aujourd'hui). */
  workingDays: number;
  present: number;
  missions: number;
  /** Autorisations d'absence approuvées (absences justifiées). */
  permissions: number;
  /** Absences non justifiées, y compris les jours passés sans aucun pointage. */
  absences: number;
};

const DAY_MS = 86_400_000;
const utcDay = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** Jours ouvrés (clés AAAA-MM-JJ) entre deux jours inclus, hors week-ends et jours fériés. */
function workingDayKeys(fromKey: string, toKey: string, holidays: Set<string>): string[] {
  const keys: string[] = [];
  for (let t = utcDay(fromKey).getTime(); t <= utcDay(toKey).getTime(); t += DAY_MS) {
    const d = new Date(t);
    const weekday = d.getUTCDay();
    const key = dayKey(d);
    if (weekday !== 0 && weekday !== 6 && !holidays.has(key)) keys.push(key);
  }
  return keys;
}

/** Récapitulatif de présence de plusieurs employés sur [from, to] (jours calendaires, bornes incluses). */
export async function attendanceSummaries(
  db: Db,
  periods: { employeeId: string; from: string; to: string }[]
): Promise<Map<string, AttendanceSummary>> {
  const out = new Map<string, AttendanceSummary>();
  const todayKey = dayKey(todayDate());
  const bounded = periods
    .map((p) => ({ ...p, to: p.to < todayKey ? p.to : todayKey }))
    .filter((p) => p.from <= p.to);
  for (const p of periods) out.set(p.employeeId, { workingDays: 0, present: 0, missions: 0, permissions: 0, absences: 0 });
  if (bounded.length === 0) return out;

  const minKey = bounded.reduce((m, p) => (p.from < m ? p.from : m), bounded[0].from);
  const maxKey = bounded.reduce((m, p) => (p.to > m ? p.to : m), bounded[0].to);
  const range = { gte: utcDay(minKey), lte: new Date(utcDay(maxKey).getTime() + DAY_MS - 1) };

  const [holidays, records] = await Promise.all([
    db.holiday.findMany({ where: { date: range }, select: { date: true } }),
    db.attendanceRecord.findMany({
      where: { employeeId: { in: bounded.map((p) => p.employeeId) }, date: range },
      select: { employeeId: true, date: true, finalStatus: true },
    }),
  ]);
  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));
  const statusByDay = new Map(records.map((r) => [`${r.employeeId}:${dayKey(r.date)}`, r.finalStatus]));

  for (const p of bounded) {
    const s = out.get(p.employeeId)!;
    for (const key of workingDayKeys(p.from, p.to, holidaySet)) {
      const status = statusByDay.get(`${p.employeeId}:${key}`);
      // Aujourd'hui sans pointage : la journée n'est pas finie, on ne la compte pas.
      if (!status && key === todayKey) continue;
      s.workingDays++;
      if (status === "PRESENT") s.present++;
      else if (status === "MISSION") s.missions++;
      else if (status === "PERMISSION") s.permissions++;
      else s.absences++;
    }
  }
  return out;
}
