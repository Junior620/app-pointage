import { statusMeta, STRUCTURE_TONE, type StatusKind } from "@/lib/status-labels";
import { structureBrand } from "@/lib/brand";
import { Badge } from "./Badge";

export function StatusBadge({
  kind,
  value,
  fallback = "—",
  className,
}: {
  kind: StatusKind;
  value: string | null | undefined;
  fallback?: string;
  className?: string;
}) {
  const meta = statusMeta(kind, value);
  if (!meta) return <span className="text-sm text-slate-400">{fallback}</span>;
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}

export function StructureBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-sm text-slate-400">—</span>;
  return (
    <Badge tone={STRUCTURE_TONE[value] ?? "neutral"} className={className}>
      {structureBrand(value)?.name ?? value}
    </Badge>
  );
}
