"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, MapPin, Send } from "lucide-react";
import PublicShell, { PublicCard } from "@/components/layout/PublicShell";
import { EmployeeRecap, PublicFormDone, PublicFormLoading, PublicFormUnavailable } from "@/components/layout/PublicFormStates";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { MissionPrefill } from "./mission-types";
import StructureOptions from "@/components/org/StructureOptions";

function dayCount(start: string, end: string): number {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

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
      setPrefillError("Lien incomplet : ouvrez directement le lien reçu sur WhatsApp.");
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

  const datesInvalid = Boolean(startDate && endDate && endDate < startDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !prefill || datesInvalid) return;
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
      <PublicFormDone structure={prefill.structure} title="Demande de mission envoyée">
        Votre demande a été transmise aux RH. Vous serez prévenu sur WhatsApp après validation ou refus.
      </PublicFormDone>
    );
  }

  const days = startDate && endDate && !datesInvalid ? dayCount(startDate, endDate) : null;

  return (
    <PublicShell structure={prefill.structure}>
      <PublicCard>
        <EmployeeRecap title="Demande d'ordre de mission" employee={prefill} expiresIn={expiresIn} />

        <form onSubmit={handleSubmit} className="space-y-5">
          {submitError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date de départ" required>
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
            <Field label="Date de retour" required error={datesInvalid ? "La date de retour doit être après le départ." : undefined}>
              {(id) => <Input id={id} type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} required aria-invalid={datesInvalid} />}
            </Field>
          </div>
          {days != null && (
            <p className="-mt-2 flex items-center gap-1.5 text-sm text-slate-600">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              {days} jour{days > 1 ? "s" : ""} de mission
            </p>
          )}

          <Field label="Lieu de mission">
            {(id) => (
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input id={id} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={255} placeholder="Ex. : Douala, Bonanjo" className="pl-9" />
              </div>
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Structure d'accueil">
              {(id) => (
                <Select id={id} value={hostStructure} onChange={(e) => setHostStructure(e.target.value)}>
                  <option value="">Aucune (mission externe)</option>
                  <StructureOptions />
                </Select>
              )}
            </Field>
            <Field label="Moyen de transport">
              {(id) => <Input id={id} value={transport} onChange={(e) => setTransport(e.target.value)} maxLength={500} placeholder="Véhicule, avion, car…" />}
            </Field>
          </div>

          <Field label="Objet de la mission" required hint="5 caractères minimum.">
            {(id) => (
              <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={4} required minLength={5} placeholder="Décrivez l'objet de la mission." />
            )}
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={certify}
              onChange={(e) => setCertify(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm leading-snug text-slate-700">Je certifie sur l&apos;honneur l&apos;exactitude des informations transmises.</span>
          </label>

          <Button type="submit" size="lg" className="w-full" loading={submitting} disabled={!certify || datesInvalid} icon={<Send className="h-4 w-4" />}>
            Envoyer la demande de mission
          </Button>
          {!certify && <p className="-mt-2 text-center text-xs text-slate-500">Cochez la case de certification pour envoyer.</p>}
        </form>
      </PublicCard>
      <p className="mt-4 px-2 text-center text-xs text-slate-500">
        Après validation, les RH éditent l&apos;ordre de mission à imprimer et signer.
      </p>
    </PublicShell>
  );
}
