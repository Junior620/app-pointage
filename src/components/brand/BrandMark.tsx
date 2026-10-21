import { cn } from "@/lib/utils";

/** Pictogramme de l'application (horloge de pointage), utilisé avec le nom « Pointage RH ». */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-900/30",
        className ?? "h-10 w-10"
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[60%] w-[60%]">
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18.5" cy="18.5" r="3.25" fill="#22c55e" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </span>
  );
}
