/** Dates locales à minuit (aligné avec les filtres `<input type="date">`). */
export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function toInputDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type StatsPeriodKind = "30d" | "month" | "quarter" | "year";

export type EmployeePeriodResolution = {
  period: StatsPeriodKind;
  rangeFrom: Date;
  rangeTo: Date;
  label: string;
  /** Pour navigation mois / trimestre / année */
  nav: {
    year: number;
    month?: number;
    quarter?: number;
  };
};

function spFirst(
  sp: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const v = sp[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Périodes KPI fiche employé : query `period`, optionnel `y`, `m`, `q`.
 * Sans `period` → 30 derniers jours.
 */
export function resolveEmployeeStatsPeriod(
  sp: Record<string, string | string[] | undefined>
): EmployeePeriodResolution {
  const today = startOfLocalDay(new Date());
  const raw = (spFirst(sp, "period") ?? "30d").toLowerCase();

  const period: StatsPeriodKind =
    raw === "month" || raw === "quarter" || raw === "year" ? raw : "30d";

  if (period === "month") {
    const y = parseInt(spFirst(sp, "y") ?? "", 10) || today.getFullYear();
    const mParsed = parseInt(spFirst(sp, "m") ?? "", 10);
    const monthIndex =
      mParsed >= 1 && mParsed <= 12 ? mParsed - 1 : today.getMonth();
    const from = startOfLocalDay(new Date(y, monthIndex, 1));
    const lastDay = startOfLocalDay(new Date(y, monthIndex + 1, 0));
    let to = lastDay > today ? today : lastDay;
    if (from > today) {
      return {
        period: "month",
        rangeFrom: today,
        rangeTo: today,
        label: new Date(y, monthIndex, 1).toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        }),
        nav: { year: y, month: monthIndex + 1 },
      };
    }
    const label = from.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    return {
      period: "month",
      rangeFrom: from,
      rangeTo: to,
      label,
      nav: { year: y, month: monthIndex + 1 },
    };
  }

  if (period === "quarter") {
    const y = parseInt(spFirst(sp, "y") ?? "", 10) || today.getFullYear();
    let q = parseInt(spFirst(sp, "q") ?? "", 10);
    if (q < 1 || q > 4) {
      q = Math.floor(today.getMonth() / 3) + 1;
    }
    const startMonth = (q - 1) * 3;
    const from = startOfLocalDay(new Date(y, startMonth, 1));
    const endQuarter = startOfLocalDay(new Date(y, startMonth + 3, 0));
    let to = endQuarter > today ? today : endQuarter;
    if (from > today) {
      return {
        period: "quarter",
        rangeFrom: today,
        rangeTo: today,
        label: `T${q} ${y}`,
        nav: { year: y, quarter: q },
      };
    }
    return {
      period: "quarter",
      rangeFrom: from,
      rangeTo: to,
      label: `T${q} ${y}`,
      nav: { year: y, quarter: q },
    };
  }

  if (period === "year") {
    const y = parseInt(spFirst(sp, "y") ?? "", 10) || today.getFullYear();
    const from = startOfLocalDay(new Date(y, 0, 1));
    let to = startOfLocalDay(new Date(y, 11, 31));
    if (to > today) to = today;
    if (from > today) {
      return {
        period: "year",
        rangeFrom: today,
        rangeTo: today,
        label: `Année ${y}`,
        nav: { year: y },
      };
    }
    return {
      period: "year",
      rangeFrom: from,
      rangeTo: to,
      label: `Année ${y}`,
      nav: { year: y },
    };
  }

  const from = startOfLocalDay(new Date(today));
  from.setDate(from.getDate() - 30);
  return {
    period: "30d",
    rangeFrom: from,
    rangeTo: today,
    label: "30 derniers jours",
    nav: { year: today.getFullYear(), month: today.getMonth() + 1 },
  };
}

export function getLast30DaysRange(): { from: Date; to: Date } {
  const today = startOfLocalDay(new Date());
  const from = startOfLocalDay(new Date(today));
  from.setDate(from.getDate() - 30);
  return { from, to: today };
}

/** Raccourcis rapport : début inclus, fin = aujourd’hui si dans la période. */
export function getReportPresetRange(
  preset: "month" | "quarter" | "year"
): { from: Date; to: Date; label: string } {
  const today = startOfLocalDay(new Date());
  let from: Date;
  if (preset === "month") {
    from = startOfLocalDay(new Date(today.getFullYear(), today.getMonth(), 1));
  } else if (preset === "quarter") {
    const sm = Math.floor(today.getMonth() / 3) * 3;
    from = startOfLocalDay(new Date(today.getFullYear(), sm, 1));
  } else {
    from = startOfLocalDay(new Date(today.getFullYear(), 0, 1));
  }
  const label =
    preset === "month"
      ? "Mois en cours"
      : preset === "quarter"
        ? "Trimestre en cours"
        : "Année en cours";
  return { from, to: today, label };
}
