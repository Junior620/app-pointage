import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const STAT_TONES = {
  neutral: { icon: "bg-slate-100 text-slate-600", value: "text-slate-900" },
  brand: { icon: "bg-brand-50 text-brand-600", value: "text-brand-700" },
  success: { icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-700" },
  danger: { icon: "bg-red-50 text-red-600", value: "text-red-700" },
  warning: { icon: "bg-amber-50 text-amber-600", value: "text-amber-700" },
  violet: { icon: "bg-violet-50 text-violet-600", value: "text-violet-700" },
  info: { icon: "bg-sky-50 text-sky-600", value: "text-sky-700" },
} as const;

export type StatTone = keyof typeof STAT_TONES;

/** Indicateur chiffré (carte). Cliquable si `href` ou `onClick` est fourni. */
export function StatTile({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  sub,
  href,
  onClick,
  active = false,
  className,
}: {
  icon?: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
  sub?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Mise en évidence (ex. filtre actif) */
  active?: boolean;
  className?: string;
}) {
  const t = STAT_TONES[tone];
  const interactive = Boolean(href || onClick);
  const classes = cn(
    "block rounded-2xl border bg-white p-4 text-left shadow-sm transition-all",
    active ? "border-brand-400 ring-2 ring-brand-500/20" : "border-slate-200",
    interactive &&
      "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
    className
  );
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl", t.value)}>{value}</p>
      {sub !== undefined && <p className="mt-0.5 min-h-4 truncate text-xs text-slate-500">{sub}</p>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "w-full")} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
