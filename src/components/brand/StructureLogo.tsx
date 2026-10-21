"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { STRUCTURE_BRANDS, type StructureCode } from "@/lib/brand";

const SIZES = {
  sm: { img: "h-6", mono: "h-6 px-1.5 text-[10px]" },
  md: { img: "h-8", mono: "h-8 px-2 text-xs" },
  lg: { img: "h-12", mono: "h-11 px-3 text-sm" },
} as const;

/**
 * Logo d'une structure. Sans fichier fourni (ou si l'image ne charge pas),
 * affiche un monogramme aux couleurs de la structure.
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
      <span
        className={cn(
          "inline-flex items-center",
          needsChip && "rounded-lg bg-white px-1.5 py-1",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={brand.name}
          className={cn("w-auto object-contain", SIZES[size].img)}
          onError={() => setFailed(true)}
        />
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
      {brand.code}
    </span>
  );
}
