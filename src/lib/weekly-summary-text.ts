/** Données pointage nécessaires au message résumé hebdo (WhatsApp / cron). */
export type WeeklySummaryRecord = {
  finalStatus: string | null;
  checkInStatus: string | null;
  checkOutStatus: string | null;
  overtimeMinutes: number | null;
  overtimeStatus: string | null;
  totalMinutes: number | null;
};

/** Même logique que le cron : semaine lundi → samedi, dates @db.Date en UTC. */
export function getCurrentWeekRangeUtc(now: Date = new Date()): {
  monday: Date;
  saturday: Date;
} {
  const saturday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
  );
  const monday = new Date(saturday);
  const dayOfWeek = saturday.getUTCDay();
  const daysBack = dayOfWeek === 6 ? 5 : dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  monday.setUTCDate(saturday.getUTCDate() - daysBack);
  return { monday, saturday };
}

export type WeeklySummaryExtras = {
  /** Demandes LeaveRequest encore PENDING (RH pas encore traité). */
  pendingLeaveRequests?: number;
};

export function buildWeeklySummaryWhatsAppMessage(
  firstName: string,
  monday: Date,
  saturday: Date,
  records: WeeklySummaryRecord[],
  extras?: WeeklySummaryExtras
): string {
  const present = records.filter((r) => r.finalStatus === "PRESENT").length;
  const absent = records.filter((r) => r.finalStatus === "ABSENT").length;
  const permission = records.filter((r) => r.finalStatus === "PERMISSION").length;
  const mission = records.filter((r) => r.finalStatus === "MISSION").length;
  const late = records.filter((r) => r.checkInStatus === "LATE").length;
  const onTime = records.filter((r) => r.checkInStatus === "ON_TIME").length;
  const autoCheckouts = records.filter((r) => r.checkOutStatus === "AUTO").length;
  const totalOT = records.reduce(
    (s, r) =>
      s +
      (["APPROVED", null].includes(r.overtimeStatus as string | null)
        ? r.overtimeMinutes ?? 0
        : 0),
    0
  );
  const totalMinutes = records.reduce((s, r) => s + (r.totalMinutes ?? 0), 0);

  const mondayStr = monday.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
  const saturdayStr = saturday.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });

  let msg = `📊 *Résumé de la semaine*\n`;
  msg += `${mondayStr} → ${saturdayStr}\n\n`;
  msg += `Bonjour ${firstName},\n\n`;

  msg += `✅ Présent : ${present} jour(s)`;
  if (onTime > 0) msg += ` (${onTime} à l'heure)`;
  msg += `\n`;

  if (late > 0) msg += `⏰ Retards : ${late}\n`;
  if (absent > 0) msg += `❌ Absences : ${absent}\n`;
  if (permission > 0) {
    msg += `📋 ${permission} jour${permission > 1 ? "s" : ""} avec autorisation d'absence\n`;
  }
  if (mission > 0) {
    msg += `🌍 ${mission} jour${mission > 1 ? "s" : ""} en mission\n`;
  }

  if (totalMinutes > 0) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    msg += `\n⏱️ Temps total travaillé : ${h}h${m.toString().padStart(2, "0")}\n`;
  }

  if (totalOT > 0) {
    const otH = Math.floor(totalOT / 60);
    const otM = totalOT % 60;
    msg += `💪 Heures supplémentaires : ${otH}h${otM.toString().padStart(2, "0")}\n`;
  }

  if (autoCheckouts > 0) {
    msg += `\n⚠️ ${autoCheckouts} départ(s) automatique(s) — pensez à pointer votre sortie.\n`;
  }

  const pendingLeaves = extras?.pendingLeaveRequests ?? 0;
  if (pendingLeaves > 0) {
    msg += `\n📬 *Demandes d'autorisation d'absence* : ${pendingLeaves} en attente de validation par la RH.\n`;
  }

  msg += `\n💡 Répondez *11* pour *Mes autorisations d'absence* (en attente ou période en cours).\n`;

  if (late === 0 && absent === 0) {
    msg += `\n🎉 Semaine parfaite ! Continuez comme ça.`;
  } else if (late >= 3) {
    msg += `\n⚠️ Attention : ${late} retards cette semaine. Merci d'être vigilant.`;
  }

  return msg;
}
