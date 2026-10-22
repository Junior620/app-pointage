"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { STRUCTURE_BRANDS, type StructureCode } from "@/lib/brand";

const SIZES = {
  sm: { img: "h-6", mono: "h-6 px-1.5 text-[10px]", name: "text-xs" },
  md: { img: "h-8", mono: "h-8 px-2 text-xs", name: "text-sm" },
  lg: { img: "h-12", mono: "h-11 px-3 text-sm", name: "text-base" },
} as const;

/**
 * Logo d'une structure. Sans fichier (ou si l'image ne charge pas), affiche un monogramme
 * aux couleurs de la structure. Si le logo n'inclut pas le nom, celui-ci est écrit à côté.
 */
export default function StructureLogo({
  code,
  size = "md",
  onDark = false,
  className,
}: {
  code: StructureCode;
  size?: keyof typeof SIZES;
  onDark?: boolean;
  className?: string;
}) {
  const brand = STRUCTURE_BRANDS[code];
  const [failed, setFailed] = useState(false);
  const src = onDark ? brand.logoOnDark ?? brand.logo : brand.logo;
  const needsChip = onDark && !brand.logoOnDark;

  if (src && !failed) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <span className={cn("inline-flex items-center", needsChip && "rounded-md bg-white px-1.5 py-0.5")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={brand.wordmark ? brand.name : ""}
            className={cn("w-auto object-contain", SIZES[size].img)}
            onError={() => setFailed(true)}
          />
        </span>
        {!brand.wordmark && (
          <span className={cn("font-bold tracking-wide", SIZES[size].name, onDark ? "text-white" : "text-slate-800")}>
            {brand.name}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md font-bold tracking-wider",
        SIZES[size].mono,
        brand.monogramClass,
        className
      )}
      role="img"
      aria-label={brand.name}
    >
      {brand.name}
    </span>
  );
}
