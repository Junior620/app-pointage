"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ORDERED_LEAVE_ABSENCE_CATEGORIES, LEAVE_ABSENCE_CATEGORY_LABELS } from "@/lib/leave-absence-labels";
import { CalendarDays, Send } from "lucide-react";
import PublicShell, { PublicCard } from "@/components/layout/PublicShell";
import { EmployeeRecap, PublicFormDone, PublicFormLoading, PublicFormUnavailable } from "@/components/layout/PublicFormStates";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";

type Prefill = {
  firstName: string;
  lastName: string;
  matricule: string;
  service: string;
  structure: string;
};

const PUBLIC_FORM_ABSENCE_CATEGORIES = ORDERED_LEAVE_ABSENCE_CATEGORIES.filter((cat) =>
  ["EVENEMENT_FAMILIAL", "MALADIE", "FORMATION", "AUTRE"].includes(cat)
);

function dayCount(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export default function LeaveRequestNewForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [absenceCategory, setAbsenceCategory] = useState<string>(PUBLIC_FORM_ABSENCE_CATEGORIES[0] ?? "EVENEMENT_FAMILIAL");
  const [reason, setReason] = useState("");
  const [notifyOrReplace, setNotifyOrReplace] = useState("");
  const [certify, setCertify] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loadPrefill = useCallback(async () => {
    if (!token) {
      setPrefillError("Lien incomplet : ouvrez directement le lien reçu sur WhatsApp.");
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

  const datesInvalid = Boolean(startDate && endDate && endDate < startDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !prefill || datesInvalid) return;
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
        const msg = typeof json.error === "string" ? json.error : "Envoi impossible. Vérifiez les champs ou redemandez un lien.";
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

  if (loading) return <PublicFormLoading />;
  if (prefillError || !prefill) return <PublicFormUnavailable message={prefillError} />;

  if (done) {
    return (
      <PublicFormDone structure={prefill.structure} title="Demande envoyée">
        Votre demande a été transmise au service RH. Si votre numéro WhatsApp est enregistré, vous avez reçu une
        confirmation. Vous serez prévenu après validation ou refus.
      </PublicFormDone>
    );
  }

  const days = startDate && endDate && !datesInvalid ? dayCount(startDate, endDate) : null;

  return (
    <PublicShell structure={prefill.structure}>
      <PublicCard>
        <EmployeeRecap title="Demande d'autorisation d'absence" employee={prefill} expiresIn={expiresIn} />

        <form onSubmit={handleSubmit} className="space-y-5">
          {submitError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</div>}

          <Field label="Type de demande" required>
            {(id) => (
              <Select id={id} value={absenceCategory} onChange={(e) => setAbsenceCategory(e.target.value)} required>
                {PUBLIC_FORM_ABSENCE_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {LEAVE_ABSENCE_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date de début" required>
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate) setEndDate(e.target.value);
                  }}
                  required
                />
              )}
            </Field>
            <Field label="Date de fin" required error={datesInvalid ? "La date de fin doit être après la date de début." : undefined}>
              {(id) => <Input id={id} type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} required aria-invalid={datesInvalid} />}
            </Field>
          </div>
          {days != null && (
            <p className="-mt-2 flex items-center gap-1.5 text-sm text-slate-600">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              {days} jour{days > 1 ? "s" : ""} (calendaires)
            </p>
          )}

          <Field label="Motif détaillé" required hint="5 caractères minimum.">
            {(id) => (
              <Textarea
                id={id}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                required
                minLength={5}
                placeholder="Décrivez le motif conformément au règlement interne."
              />
            )}
          </Field>

          <Field label="Personne ou service à prévenir (optionnel)">
            {(id) => (
              <Input
                id={id}
                value={notifyOrReplace}
                onChange={(e) => setNotifyOrReplace(e.target.value)}
                maxLength={500}
                placeholder="Ex. : nom du remplaçant, téléphone joignable…"
              />
            )}
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={certify}
              onChange={(e) => setCertify(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm leading-snug text-slate-700">
              Je certifie sur l&apos;honneur l&apos;exactitude des informations et j&apos;ai pris connaissance que toute fausse
              déclaration peut engager ma responsabilité.
            </span>
          </label>

          <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!certify || datesInvalid} icon={<Send className="h-4 w-4" />}>
            Envoyer la demande
          </Button>
          {!certify && <p className="-mt-2 text-center text-xs text-slate-500">Cochez la case de certification pour envoyer.</p>}
        </form>
      </PublicCard>
      <p className="mt-4 px-2 text-center text-xs text-slate-500">
        Après envoi, le service RH valide ou refuse la demande ; vous êtes prévenu sur WhatsApp.
      </p>
    </PublicShell>
  );
}
