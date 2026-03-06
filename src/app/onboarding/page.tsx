"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle, Loader2, Smartphone } from "lucide-react";
import { z } from "zod";

const onboardingSchema = z.object({
  matricule: z.string().min(1, "Le matricule est requis"),
  dateNaissance: z.string().min(1, "La date de naissance est requise"),
  whatsappPhone: z.string().min(10, "Numéro WhatsApp invalide"),
});

function OnboardingForm() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";

  const [form, setForm] = useState({ matricule: "", dateNaissance: "", whatsappPhone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError("");
    const result = onboardingSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[String(i.path[0])] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.data, code }),
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        const json = await res.json();
        setApiError(json.error ?? "Une erreur est survenue");
      }
    } catch {
      setApiError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Inscription réussie !</h1>
          <p className="text-slate-600 mb-6">
            Votre numéro WhatsApp a été lié à votre compte. Vous recevrez désormais
            les notifications de pointage par WhatsApp.
          </p>
          <div className="bg-blue-50 rounded-xl p-4 text-left">
            <h3 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Instructions WhatsApp
            </h3>
            <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
              <li>Vous recevrez un message de confirmation</li>
              <li>Envoyez &quot;bonjour&quot; pour démarrer le pointage</li>
              <li>Partagez votre position quand demandé</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-4">
            <Smartphone className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Pointage RH</h1>
          <p className="text-slate-500 mt-1">Inscription au système de pointage</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {apiError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {apiError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Matricule</label>
            <input
              value={form.matricule}
              onChange={(e) => setForm({ ...form, matricule: e.target.value })}
              placeholder="Votre matricule employé"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.matricule && <p className="text-xs text-red-500 mt-1">{errors.matricule}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Date de naissance</label>
            <input
              type="date"
              value={form.dateNaissance}
              onChange={(e) => setForm({ ...form, dateNaissance: e.target.value })}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.dateNaissance && <p className="text-xs text-red-500 mt-1">{errors.dateNaissance}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Numéro WhatsApp</label>
            <input
              type="tel"
              value={form.whatsappPhone}
              onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })}
              placeholder="+225XXXXXXXXXX"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.whatsappPhone && <p className="text-xs text-red-500 mt-1">{errors.whatsappPhone}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Vérification...
              </>
            ) : (
              "S'inscrire"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      }
    >
      <OnboardingForm />
    </Suspense>
  );
}
