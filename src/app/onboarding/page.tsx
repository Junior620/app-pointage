import { Smartphone } from "lucide-react";
import PublicShell, { PublicCard } from "@/components/layout/PublicShell";

export default function OnboardingPage() {
  return (
    <PublicShell>
      <PublicCard className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Smartphone className="h-7 w-7 text-brand-600" />
        </span>
        <h1 className="mb-2 text-xl font-bold text-slate-900">Inscription autonome désactivée</h1>
        <p className="mb-4 text-sm text-slate-600">
          Votre numéro WhatsApp est enregistré directement par le service RH ou un administrateur dans votre fiche employé.
        </p>
        <p className="text-xs text-slate-500">Contactez votre service RH pour toute mise à jour de vos informations.</p>
      </PublicCard>
    </PublicShell>
  );
}
