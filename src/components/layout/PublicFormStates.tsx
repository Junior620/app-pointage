import type { ReactNode } from "react";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { StructureBadge } from "@/components/ui/StatusBadge";
import PublicShell, { PublicCard } from "./PublicShell";

/** États communs des formulaires ouverts depuis WhatsApp (chargement, lien invalide, envoyé). */
export function PublicFormLoading() {
  return (
    <PublicShell>
      <PublicCard className="flex flex-col items-center gap-3 py-12 text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <p className="text-sm">Chargement du formulaire…</p>
      </PublicCard>
    </PublicShell>
  );
}

export function PublicFormUnavailable({ message }: { message: string | null }) {
  return (
    <PublicShell>
      <PublicCard className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <XCircle className="h-7 w-7 text-red-600" />
        </span>
        <h1 className="text-lg font-bold text-slate-900">Formulaire indisponible</h1>
        <p className="mt-2 text-sm text-slate-600">{message ?? "Ce lien n'est plus valide."}</p>
        <p className="mt-4 text-xs text-slate-500">Redemandez un lien depuis le menu du bot WhatsApp.</p>
      </PublicCard>
    </PublicShell>
  );
}

export function PublicFormDone({ structure, title, children }: { structure?: string | null; title: string; children: ReactNode }) {
  return (
    <PublicShell structure={structure}>
      <PublicCard className="text-center">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </span>
        <h1 className="text-xl font-bold text-emerald-800">{title}</h1>
        <div className="mt-2 text-sm text-slate-600">{children}</div>
        <p className="mt-6 text-xs text-slate-500">Vous pouvez fermer cette page.</p>
      </PublicCard>
    </PublicShell>
  );
}

/** En-tête du formulaire : titre, récapitulatif de la fiche employé et durée de validité du lien. */
export function EmployeeRecap({
  title,
  employee,
  expiresIn,
}: {
  title: string;
  employee: { firstName: string; lastName: string; matricule: string; service: string; structure: string };
  expiresIn: number | null;
}) {
  return (
    <div className="mb-6 border-b border-slate-100 pb-5">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <div className="mt-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
          {employee.firstName[0]}
          {employee.lastName[0]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-800">
            {employee.lastName} {employee.firstName}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <span className="font-mono">{employee.matricule}</span>·<span>{employee.service}</span>
            <StructureBadge value={employee.structure} className="px-1.5 py-0 text-[10px]" />
          </p>
        </div>
      </div>
      {expiresIn != null && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
          <Clock className="h-3.5 w-3.5" />
          Ce lien expire dans environ {expiresIn} minute{expiresIn > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
