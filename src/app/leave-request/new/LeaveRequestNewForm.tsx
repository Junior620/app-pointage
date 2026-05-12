"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ORDERED_LEAVE_ABSENCE_CATEGORIES,
  LEAVE_ABSENCE_CATEGORY_LABELS,
} from "@/lib/leave-absence-labels";
import { CalendarDays, CheckCircle2, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Prefill = {
  firstName: string;
  lastName: string;
  matricule: string;
  service: string;
  structure: string;
};

export default function LeaveRequestNewForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [absenceCategory, setAbsenceCategory] = useState<string>("AUTORISATION_COURTE");
  const [reason, setReason] = useState("");
  const [notifyOrReplace, setNotifyOrReplace] = useState("");
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
      const res = await fetch(`/api/leave-request/prefill?t=${encodeURIComponent(token)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefillError(typeof json.error === "string" ? json.error : "Impossible de charger le formulaire.");
        setPrefill(null);
        return;
      }
      setPrefill(json.employee as Prefill);
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
      const res = await fetch("/api/leave-request/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          t: token,
          startDate,
          endDate,
          absenceCategory,
          reason: reason.trim(),
          notifyOrReplace: notifyOrReplace.trim() || null,
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
        <p className="mt-4 text-lg font-semibold text-emerald-900">Demande envoyée</p>
        <p className="mt-2 text-sm text-emerald-800">
          Votre demande a été transmise au service RH. Si votre numéro WhatsApp est enregistré, vous avez reçu une
          confirmation. Vous serez notifié après validation ou refus.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Demande d&apos;autorisation d&apos;absence / congés</h1>
        <p className="mt-1 text-xs text-slate-500">
          Renseignez les champs ci-dessous. Les informations structurelles proviennent de votre fiche employé.
          {expiresIn != null && (
            <span className="block mt-1 text-amber-700">
              Ce lien expire dans environ {expiresIn} minutes.
            </span>
          )}
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-700">
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Nom</dt>
            <dd className="font-medium text-right">
              {prefill.lastName} {prefill.firstName}
            </dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Matricule</dt>
            <dd className="font-mono text-right">{prefill.matricule}</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Structure</dt>
            <dd className="font-medium text-right">{prefill.structure}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Service</dt>
            <dd className="font-medium text-right">{prefill.service}</dd>
          </div>
        </dl>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        {submitError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type de demande</label>
          <select
            value={absenceCategory}
            onChange={(e) => setAbsenceCategory(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            {ORDERED_LEAVE_ABSENCE_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {LEAVE_ABSENCE_CATEGORY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date de début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date de fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Motif détaillé</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            required
            minLength={5}
            placeholder="Décrivez le motif conformément au règlement interne."
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Personne ou service à prévenir / informations de relais (optionnel)
          </label>
          <input
            type="text"
            value={notifyOrReplace}
            onChange={(e) => setNotifyOrReplace(e.target.value)}
            maxLength={500}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ex. Nom du remplaçant, téléphone joignable…"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input
            type="checkbox"
            checked={certify}
            onChange={(e) => setCertify(e.target.checked)}
            className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 leading-snug">
            Je certifie sur l&apos;honneur l&apos;exactitude des informations et j&apos;ai pris connaissance que toute fausse
            déclaration peut engager ma responsabilité.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting || !certify}
          className={cn(
            "w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors shadow-sm",
            certify && !submitting ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-300 cursor-not-allowed"
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Envoi…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Envoyer la demande
            </>
          )}
        </button>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-slate-400">
          <CalendarDays className="h-3.5 w-3.5" />
          Après envoi, la RH peut valider ou refuser depuis le tableau &quot;Autorisations d&apos;absence&quot;.
        </p>
      </form>
    </div>
  );
}
