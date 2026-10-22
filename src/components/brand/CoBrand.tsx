"use client";

import { cn } from "@/lib/utils";
import { useOrg } from "@/components/org/OrgProvider";
import StructureLogo from "./StructureLogo";

/** Les structures de l'entreprise côte à côte (écrans communs RH). */
export default function CoBrand({
  size = "sm",
  onDark = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  onDark?: boolean;
  className?: string;
}) {
  const { structures } = useOrg();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {structures.map((code, i) => (
        <span key={code} className="flex items-center gap-2">
          {i > 0 && (
            <span
              className={cn("h-4 w-px", onDark ? "bg-white/20" : "bg-slate-200")}
              aria-hidden="true"
            />
          )}
          <StructureLogo code={code} size={size} onDark={onDark} />
        </span>
      ))}
    </div>
  );
}
