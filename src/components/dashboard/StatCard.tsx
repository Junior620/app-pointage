"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: "blue" | "green" | "red" | "orange" | "purple";
  subtitle?: string;
  trend?: { value: number; label: string };
}

const iconBgMap = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-600",
  orange: "bg-amber-50 text-amber-600",
  purple: "bg-violet-50 text-violet-600",
};

const valueColorMap = {
  blue: "text-blue-700",
  green: "text-emerald-700",
  red: "text-red-700",
  orange: "text-amber-700",
  purple: "text-violet-700",
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
  trend,
}: StatCardProps) {
  const trendIcon =
    trend && trend.value > 0
      ? TrendingUp
      : trend && trend.value < 0
        ? TrendingDown
        : Minus;
  const TrendIcon = trendIcon;
  const trendColor =
    trend && trend.value > 0
      ? "text-emerald-600"
      : trend && trend.value < 0
        ? "text-red-600"
        : "text-slate-400";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p
            className={cn(
              "mt-3 text-4xl font-bold tracking-tight",
              valueColorMap[color]
            )}
          >
            {value}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  trendColor
                )}
              >
                <TrendIcon className="h-3.5 w-3.5" />
                {trend.value > 0 ? "+" : ""}
                {trend.value} {trend.label}
              </span>
            ) : subtitle ? (
              <span className="text-xs text-slate-400">{subtitle}</span>
            ) : (
              <span className="text-xs text-slate-400">Aujourd&apos;hui</span>
            )}
          </div>
        </div>
        <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", iconBgMap[color])}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}
