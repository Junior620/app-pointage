import { Suspense } from "react";
import MissionRequestNewForm from "./MissionRequestNewForm";

export default function MissionRequestNewPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto mb-6 max-w-lg text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pointage RH</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Demande d&apos;ordre de mission</h1>
        <p className="mt-2 text-sm text-slate-600">
          Formulaire sécurisé transmis depuis WhatsApp.
        </p>
      </div>
      <Suspense fallback={<div className="text-center text-sm text-slate-500">Chargement…</div>}>
        <MissionRequestNewForm />
      </Suspense>
    </main>
  );
}
