import { cn } from "@/lib/utils";
import { STRUCTURE_CODES } from "@/lib/brand";
import StructureLogo from "./StructureLogo";

/** Les deux structures du groupe côte à côte (écrans communs RH). */
export default function CoBrand({
  size = "sm",
  onDark = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  onDark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {STRUCTURE_CODES.map((code, i) => (
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
