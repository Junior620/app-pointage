"use client";

import { Loader2, Smartphone } from "lucide-react";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-4">
          <Smartphone className="w-7 h-7 text-blue-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Onboarding désactivé</h1>
        <p className="text-slate-600 mb-4 text-sm">
          L&apos;inscription autonome n&apos;est plus disponible. Votre numéro WhatsApp doit être
          saisi directement par le service RH ou un administrateur dans votre fiche employé.
        </p>
        <p className="text-slate-400 text-xs">
          Veuillez contacter votre service RH pour toute mise à jour de vos informations.
        </p>
      </div>
    </div>
  );
}
