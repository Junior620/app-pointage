"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmployeePeriodResolution } from "@/lib/period-range";

function btnClass(active: boolean) {
  return cn(
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-blue-600 text-white shadow-sm"
      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  );
}

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500 mr-1">Période :</span>
        <Link href={base} className={btnClass(period === "30d")}>
          30 jours
        </Link>
        <Link href={`${base}?period=month`} className={btnClass(period === "month")}>
          Mois
        </Link>
        <Link href={`${base}?period=quarter`} className={btnClass(period === "quarter")}>
          Trimestre
        </Link>
        <Link href={`${base}?period=year`} className={btnClass(period === "year")}>
          Année
        </Link>
        <span className="text-sm text-slate-600 ml-2 font-medium">{resolution.label}</span>
      </div>
      {prevHref && (
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={prevHref}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Link>
          {nextHref && (
            <Link
              href={nextHref}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
