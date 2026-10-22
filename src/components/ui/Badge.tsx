import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "violet"
  | "scpb"
  | "afrexia"
  | "goldenbeans";

export const BADGE_TONES: Record<BadgeTone, { badge: string; dot: string }> = {
  neutral: { badge: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400" },
  brand: { badge: "bg-brand-50 text-brand-700 ring-brand-100", dot: "bg-brand-500" },
  success: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-100", dot: "bg-emerald-500" },
  danger: { badge: "bg-red-50 text-red-700 ring-red-100", dot: "bg-red-500" },
  warning: { badge: "bg-amber-50 text-amber-800 ring-amber-100", dot: "bg-amber-500" },
  info: { badge: "bg-sky-50 text-sky-700 ring-sky-100", dot: "bg-sky-500" },
  violet: { badge: "bg-violet-50 text-violet-700 ring-violet-100", dot: "bg-violet-500" },
  scpb: { badge: "bg-scpb-50 text-scpb-700 ring-scpb-100", dot: "bg-scpb-500" },
  afrexia: { badge: "bg-afrexia-50 text-afrexia-700 ring-afrexia-100", dot: "bg-afrexia-500" },
  goldenbeans: { badge: "bg-goldenbeans-50 text-goldenbeans-700 ring-goldenbeans-100", dot: "bg-goldenbeans-500" },
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_TONES[tone].badge,
        className
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", BADGE_TONES[tone].dot)} aria-hidden="true" />}
      {children}
    </span>
  );
}
