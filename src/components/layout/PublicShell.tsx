import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { APP_NAME, structureBrand } from "@/lib/brand";
import BrandMark from "@/components/brand/BrandMark";
import CoBrand from "@/components/brand/CoBrand";
import StructureLogo from "@/components/brand/StructureLogo";

const WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

/**
 * Habillage commun des pages publiques (pointage GPS, formulaires WhatsApp, confidentialité…).
 * Avec `structure`, affiche le logo de la structure de l'employé ; sinon les deux structures du groupe.
 */
export default function PublicShell({
  structure,
  width = "md",
  footer = true,
  className,
  children,
}: {
  structure?: string | null;
  width?: keyof typeof WIDTHS;
  footer?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const brand = structureBrand(structure);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-br from-ink-900 via-brand-950 to-ink-900" aria-hidden="true" />
        <header className={cn("relative mx-auto flex w-full items-center justify-between gap-3 px-4 pb-6 pt-6", WIDTHS[width])}>
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <span className="text-sm font-semibold text-white">{APP_NAME}</span>
          </div>
          {brand ? <StructureLogo code={brand.code} size="sm" onDark /> : <CoBrand onDark size="sm" />}
        </header>
      </div>

      <main className={cn("relative mx-auto w-full flex-1 px-4 pb-8", WIDTHS[width], className)}>{children}</main>

      {footer && (
        <footer className="px-4 pb-6 text-center text-xs text-slate-500">
          {APP_NAME} · SCPB · AFREXIA ·{" "}
          <Link href="/privacy" className="underline-offset-2 hover:text-slate-700 hover:underline">
            Confidentialité
          </Link>
        </footer>
      )}
    </div>
  );
}

/** Carte blanche principale des pages publiques. */
export function PublicCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-ink-900/5 sm:p-8", className)}>{children}</div>;
}
