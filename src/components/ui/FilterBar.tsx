import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Bandeau de filtres d'une liste : les contrôles passent à la ligne sur mobile. */
export function FilterBar({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end",
        className
      )}
    >
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Libellé compact au-dessus d'un filtre. */
export function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 lg:min-w-[160px]", className)}>
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
