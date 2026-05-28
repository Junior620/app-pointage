"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MissionPrefill } from "./mission-types";

export default function MissionRequestNewForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<MissionPrefill | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [hostStructure, setHostStructure] = useState("");
  const [transport, setTransport] = useState("");
  const [reason, setReason] = useState("");
  const [certify, setCertify] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loadPrefill = useCallback(async () => {
    if (!token) {
      setPrefillError("Lien incomplet (paramètre t manquant). Ouvrez le lien reçu sur WhatsApp.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setPrefillError(null);
    try {
      const res = await fetch(`/api/mission-request/prefill?t=${encodeURIComponent(token)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefillError(typeof json.error === "string" ? json.error : "Impossible de charger le formulaire.");
        setPrefill(null);
        return;
      }
      setPrefill(json.employee as MissionPrefill);
      setExpiresIn(typeof json.expiresInMinutes === "number" ? json.expiresInMinutes : null);
    } catch {
      setPrefillError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPrefill();
  }, [loadPrefill]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !prefill) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/mission-request/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          t: token,
          startDate,
          endDate,
          reason: reason.trim(),
          location: location.trim() || null,
          hostStructure: hostStructure || null,
          transport: transport.trim() || null,
          certify,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof json.error === "string"
            ? json.error
            : "Envoi impossible. Vérifiez les champs ou redemandez un lien.";
        setSubmitError(msg);
        return;
      }
      setDone(true);
    } catch {
      setSubmitError("Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm">Chargement du formulaire…</p>
      </div>
    );
  }

  if (prefillError || !prefill) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-900">
        <p className="font-semibold">Formulaire indisponible</p>
        <p className="mt-2 text-sm">{prefillError}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <p className="mt-4 text-lg font-semibold text-emerald-900">Demande mission envoyée</p>
        <p className="mt-2 text-sm text-emerald-800">
          Votre demande a été transmise à la RH/administration. Vous serez notifié après validation ou refus.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Demande d&apos;ordre de mission</h1>
        <p className="mt-1 text-xs text-slate-500">
          Renseignez les champs ci-dessous. Les informations employé proviennent de votre fiche.
          {expiresIn != null && (
            <span className="block mt-1 text-amber-700">
              Ce lien expire dans environ {expiresIn} minutes.
            </span>
          )}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {submitError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date départ mission</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date retour mission</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Lieu de mission</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={255} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Ex. Douala, Bonanjo" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Structure d&apos;accueil</label>
            <select value={hostStructure} onChange={(e) => setHostStructure(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
              <option value="">Aucune (mission externe)</option>
              <option value="SCPB">SCPB</option>
              <option value="AFREXIA">AFREXIA</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Moyen de transport</label>
            <input type="text" value={transport} onChange={(e) => setTransport(e.target.value)} maxLength={500} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Véhicule, avion, transport commun..." />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Objet de la mission</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} required minLength={5} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm resize-y min-h-[100px]" placeholder="Décrivez l'objet de la mission." />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="checkbox" checked={certify} onChange={(e) => setCertify(e.target.checked)} className="mt-1 rounded border-slate-300 text-blue-600" />
          <span className="text-sm text-slate-700 leading-snug">
            Je certifie sur l&apos;honneur l&apos;exactitude des informations transmises.
          </span>
        </label>

        <button type="submit" disabled={submitting || !certify} className={cn("w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white", certify && !submitting ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-300 cursor-not-allowed")}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Envoi…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Envoyer la demande de mission
            </>
          )}
        </button>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-slate-400">
          <CalendarDays className="h-3.5 w-3.5" />
          Après validation, la RH pourra télécharger l&apos;ordre de mission à imprimer et signer.
        </p>
      </form>
    </div>
  );
}
