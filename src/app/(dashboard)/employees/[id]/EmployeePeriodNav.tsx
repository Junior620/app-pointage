"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmployeePeriodResolution } from "@/lib/period-range";

const navBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50";

export default function EmployeePeriodNav({
  employeeId,
  resolution,
}: {
  employeeId: string;
  resolution: EmployeePeriodResolution;
}) {
  const base = `/employees/${employeeId}`;
  const { period, nav } = resolution;

  const prevHref =
    period === "month" && nav.month != null
      ? (() => {
          const d = new Date(nav.year, nav.month - 2, 1);
          return `${base}?period=month&y=${d.getFullYear()}&m=${d.getMonth() + 1}`;
        })()
      : period === "quarter" && nav.quarter != null
        ? (() => {
            let y = nav.year;
            let q = nav.quarter - 1;
            if (q < 1) {
              q = 4;
              y -= 1;
            }
            return `${base}?period=quarter&y=${y}&q=${q}`;
          })()
        : period === "year"
          ? `${base}?period=year&y=${nav.year - 1}`
          : null;

  const nextHref =
    period === "month" && nav.month != null
      ? (() => {
          const d = new Date(nav.year, nav.month, 1);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (d > today) return null;
          return `${base}?period=month&y=${d.getFullYear()}&m=${d.getMonth() + 1}`;
        })()
      : period === "quarter" && nav.quarter != null
        ? (() => {
            let y = nav.year;
            let q = nav.quarter + 1;
            if (q > 4) {
              q = 1;
              y += 1;
            }
            const startMonth = (q - 1) * 3;
            const from = new Date(y, startMonth, 1);
            from.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (from > today) return null;
            return `${base}?period=quarter&y=${y}&q=${q}`;
          })()
        : period === "year"
          ? (() => {
              const from = new Date(nav.year + 1, 0, 1);
              from.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              if (from > today) return null;
              return `${base}?period=year&y=${nav.year + 1}`;
            })()
          : null;

  const tabs = [
    { href: base, label: "30 jours", active: period === "30d" },
    { href: `${base}?period=month`, label: "Mois", active: period === "month" },
    { href: `${base}?period=quarter`, label: "Trimestre", active: period === "quarter" },
    { href: `${base}?period=year`, label: "Année", active: period === "year" },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="Période">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "h-8 rounded-lg px-3 text-sm font-medium leading-8 transition-colors",
              t.active ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link href={prevHref} className={navBtn} aria-label="Période précédente">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        ) : null}
        <span className="min-w-[140px] text-center text-sm font-semibold text-slate-800">{resolution.label}</span>
        {prevHref ? (
          nextHref ? (
            <Link href={nextHref} className={navBtn} aria-label="Période suivante">
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(navBtn, "pointer-events-none opacity-40")} aria-hidden="true">
              <ChevronRight className="h-4 w-4" />
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}
