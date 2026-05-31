/** Date-only UTC (champs Prisma @db.Date). */
export function missionDateOnlyUtc(value: string | Date): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0));
}

export function missionTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
}

export function getMissionDurationDays(start: string | Date, end: string | Date): number {
  const a = missionDateOnlyUtc(start);
  const b = missionDateOnlyUtc(end);
  const diffDays = Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays + 1);
}

/** Jours civils écoulés dans la période (0 si la mission n'a pas encore commencé). */
export function getMissionElapsedDays(
  start: string | Date,
  end: string | Date,
  ref: Date = missionTodayUtc()
): number {
  const startD = missionDateOnlyUtc(start);
  const endD = missionDateOnlyUtc(end);
  if (ref < startD) return 0;
  const cap = ref > endD ? endD : ref;
  const diffDays = Math.floor((cap.getTime() - startD.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays + 1);
}

export function isMissionNotStarted(start: string | Date, ref: Date = missionTodayUtc()): boolean {
  return ref < missionDateOnlyUtc(start);
}

export function isMissionFinished(end: string | Date, ref: Date = missionTodayUtc()): boolean {
  return ref > missionDateOnlyUtc(end);
}

/** Valeur affichée : 0 avant le début, plafonnée aux jours réellement écoulés pendant la mission. */
export function getMissionDaysCompletedDisplay(
  start: string | Date,
  end: string | Date,
  daysCompleted: number,
  ref: Date = missionTodayUtc()
): number {
  const elapsed = getMissionElapsedDays(start, end, ref);
  if (elapsed === 0) return 0;
  const total = getMissionDurationDays(start, end);
  return Math.min(Math.max(0, daysCompleted), elapsed, total);
}
