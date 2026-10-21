"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, CheckCircle2, XCircle, Loader2, Navigation, MessageSquare, MessageCircle, ShieldCheck, LocateFixed, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import PublicShell, { PublicCard } from "@/components/layout/PublicShell";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toaster";
import { WaText } from "@/components/ui/WaText";

const VALID_ACTIONS = ["CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END"] as const;
type GeolocAction = (typeof VALID_ACTIONS)[number];

type ResultState = {
  success: boolean;
  message: string;
  status?: string;
  needsLateReason?: boolean;
};

type LinkContext = { firstName: string; structure: string; whatsappNumber: string | null };

const ACTION_LABELS: Record<GeolocAction, { label: string; done: string }> = {
  CHECK_IN: { label: "Arrivée", done: "Arrivée enregistrée" },
  CHECK_OUT: { label: "Départ", done: "Départ enregistré" },
  BREAK_START: { label: "Départ en pause", done: "Départ en pause enregistré" },
  BREAK_END: { label: "Retour de pause", done: "Retour de pause enregistré" },
};

function actionMeta(action: string) {
  return ACTION_LABELS[action as GeolocAction] ?? { label: "Pointage", done: "Pointage enregistré" };
}

type Step = 0 | 1 | 2 | 3;

function Steps({ current, failed }: { current: Step; failed?: boolean }) {
  const steps = [
    { icon: ShieldCheck, label: "Lien vérifié" },
    { icon: LocateFixed, label: "Position" },
    { icon: ClipboardCheck, label: "Enregistré" },
  ];
  return (
    <ol className="mb-6 flex items-center justify-center gap-2" aria-label="Étapes du pointage">
      {steps.map((s, i) => {
        const Icon = s.icon;
        const done = current > i;
        const active = current === i;
        return (
          <li key={s.label} className="flex items-center gap-2">
            {i > 0 && <span className={cn("h-px w-5 sm:w-8", done || active ? "bg-brand-300" : "bg-slate-200")} aria-hidden="true" />}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
                done && "bg-emerald-50 text-emerald-700",
                active && !failed && "bg-brand-50 text-brand-700",
                active && failed && "bg-red-50 text-red-700",
                !done && !active && "bg-slate-100 text-slate-400"
              )}
              aria-current={active ? "step" : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden min-[380px]:inline">{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function WhatsAppButton({ number }: { number: string | null }) {
  if (!number) return null;
  return (
    <a
      href={`https://wa.me/${number}`}
      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
    >
      <MessageCircle className="h-4 w-4" />
      Retour à WhatsApp
    </a>
  );
}

function GeolocForm() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";
  const action = searchParams.get("action") ?? "";
  const exp = searchParams.get("exp") ?? "";
  const sig = searchParams.get("sig") ?? "";

  const [context, setContext] = useState<LinkContext | null>(null);
  const [linkError, setLinkError] = useState("");
  const [checkingLink, setCheckingLink] = useState(true);
  const [geoError, setGeoError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [lateReason, setLateReason] = useState("");
  const [lateSubmitting, setLateSubmitting] = useState(false);
  const [lateSent, setLateSent] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [earlyConfirm, setEarlyConfirm] = useState<{ message: string; scheduledEnd?: string } | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const hasStartedRef = useRef(false);
  const hasSubmittedRef = useRef(false);

  const isValidAction = VALID_ACTIONS.includes(action as GeolocAction);
  const meta = actionMeta(action);

  const submitPointage = useCallback(
    async (lat: number, lng: number, confirmEarlyCheckout = false) => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;
      setSubmitting(true);
      setEarlyConfirm(null);
      try {
        const res = await fetch("/api/geoloc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone,
            lat,
            lng,
            action,
            exp,
            sig,
            confirmEarlyCheckout: confirmEarlyCheckout || undefined,
          }),
        });
        const json = await res.json();
        const data = json.data ?? json;
        if (data.needsEarlyConfirm) {
          hasSubmittedRef.current = false;
          setPendingCoords({ lat, lng });
          setEarlyConfirm({
            message: data.message ?? "Vous partez avant la fin de journée prévue.",
            scheduledEnd: data.scheduledEnd,
          });
          return;
        }
        setPendingCoords(null);
        setResult({
          success: res.ok && data.success !== false,
          message: data.message ?? json.error ?? (res.ok ? "Pointage enregistré" : "Erreur"),
          status: data.status,
          needsLateReason: Boolean(res.ok && data.status === "LATE" && data.needsLateReason),
        });
      } catch {
        hasSubmittedRef.current = false;
        setResult({ success: false, message: "Erreur de connexion au serveur" });
      } finally {
        setSubmitting(false);
        setGeoLoading(false);
      }
    },
    [phone, action, exp, sig]
  );

  const requestGeolocation = useCallback(() => {
    setGeoLoading(true);
    setGeoError("");
    setResult(null);
    setPendingCoords(null);
    setEarlyConfirm(null);
    setCancelled(false);
    hasSubmittedRef.current = false;

    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas prise en charge par ce navigateur. Ouvrez le lien avec Chrome ou Safari.");
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setGeoLoading(false);
        void submitPointage(lat, lng);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError("Autorisez l'accès à votre position : touchez l'icône à gauche de l'adresse du site, puis « Autorisations » → « Position », et réessayez.");
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError("Position indisponible. Activez la localisation (GPS) du téléphone et réessayez.");
            break;
          case error.TIMEOUT:
            setGeoError("La position met trop de temps à arriver. Rapprochez-vous d'une fenêtre ou sortez, puis réessayez.");
            break;
          default:
            setGeoError("Impossible d'obtenir votre position.");
        }
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [submitPointage]);

  // Vérifier le lien (et connaître la structure de l'employé) avant de demander la position :
  // un lien expiré n'ouvre plus la demande d'autorisation GPS pour rien.
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    if (!phone || !isValidAction) {
      setLinkError("Lien de pointage invalide. Rouvrez le lien reçu sur WhatsApp.");
      setCheckingLink(false);
      return;
    }
    const params = new URLSearchParams({ phone, action, exp, sig });
    fetch(`/api/geoloc/context?${params}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setLinkError(typeof json.error === "string" ? json.error : "Lien de pointage invalide.");
          return;
        }
        setContext(json as LinkContext);
        requestGeolocation();
      })
      .catch(() => {
        // Réseau capricieux : on tente quand même le pointage, le serveur revérifie le lien.
        requestGeolocation();
      })
      .finally(() => setCheckingLink(false));
  }, [phone, action, exp, sig, isValidAction, requestGeolocation]);

  const submitLateReason = async () => {
    const trimmed = lateReason.trim();
    if (!trimmed) return;
    setLateSubmitting(true);
    try {
      const res = await fetch("/api/geoloc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, action: "LATE_REASON", comment: trimmed, exp, sig }),
      });
      const json = await res.json();
      const data = json.data ?? json;
      if (res.ok) {
        setLateSent(true);
        setResult((prev) => (prev ? { ...prev, message: data.message ?? `Motif enregistré : « ${trimmed} »` } : prev));
      } else {
        toast.error(data.message ?? data.error ?? "Le motif n'a pas pu être enregistré.");
      }
    } catch {
      toast.error("Erreur de connexion : réessayez ou répondez sur WhatsApp.");
    } finally {
      setLateSubmitting(false);
    }
  };

  const busy = checkingLink || geoLoading || submitting;
  const whatsapp = context?.whatsappNumber ?? null;
  const step: Step = linkError || checkingLink ? 0 : result?.success ? 3 : submitting || result ? 2 : 1;
  const failed = Boolean(linkError || geoError || (result && !result.success));

  return (
    <PublicShell structure={context?.structure} width="sm">
      <PublicCard>
        <div className="mb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{isValidAction ? meta.label : "Pointage"}</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{context?.firstName ? `Bonjour ${context.firstName}` : "Pointage géolocalisé"}</h1>
        </div>

        <Steps current={step} failed={failed} />

        {result ? (
          <div>
            <div className="text-center">
              <span className={cn("mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full", result.success ? "bg-emerald-100" : "bg-red-100")}>
                {result.success ? <CheckCircle2 className="h-8 w-8 text-emerald-600" /> : <XCircle className="h-8 w-8 text-red-600" />}
              </span>
              <h2 className={cn("mb-2 text-xl font-bold", result.success ? "text-emerald-700" : "text-red-700")}>
                {result.success ? meta.done : "Pointage refusé"}
              </h2>
              <p className="whitespace-pre-line text-sm text-slate-600">
                <WaText text={result.message} />
              </p>
            </div>

            {result.success && result.needsLateReason && !lateSent && (
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <MessageSquare className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    Vous êtes en <strong>retard</strong>. Indiquez le motif ci-dessous ou répondez sur WhatsApp.
                  </p>
                </div>
                <Textarea
                  value={lateReason}
                  onChange={(e) => setLateReason(e.target.value)}
                  placeholder="Ex. : embouteillage, panne, rendez-vous médical…"
                  rows={3}
                  aria-label="Motif du retard"
                  className="resize-none"
                />
                <Button variant="warning" size="lg" className="w-full" onClick={() => void submitLateReason()} loading={lateSubmitting} disabled={!lateReason.trim()}>
                  Envoyer le motif du retard
                </Button>
              </div>
            )}

            {lateSent && <p className="mt-4 text-center text-sm font-medium text-emerald-700">Motif enregistré. Merci.</p>}

            {!result.success && (
              <Button
                size="lg"
                className="mt-6 w-full"
                icon={<Navigation className="h-4 w-4" />}
                onClick={() => {
                  setResult(null);
                  requestGeolocation();
                }}
              >
                Réessayer
              </Button>
            )}
            <WhatsAppButton number={whatsapp} />
          </div>
        ) : (
          <>
            {busy && (
              <div className="py-6 text-center" role="status">
                <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-brand-600" />
                <p className="text-sm font-medium text-slate-700">
                  {checkingLink ? "Vérification du lien…" : submitting ? "Enregistrement du pointage…" : "Récupération de votre position…"}
                </p>
                {geoLoading && <p className="mt-2 text-xs text-slate-500">Autorisez la localisation si le téléphone le demande.</p>}
              </div>
            )}

            {linkError && !busy && (
              <div className="py-2 text-center">
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-700">
                    <WaText text={linkError} />
                  </p>
                </div>
                {!/renvoyez|envoyez/i.test(linkError) && (
                  <p className="text-xs text-slate-500">
                    Envoyez <strong>1</strong> (arrivée) ou <strong>2</strong> (départ) au numéro WhatsApp de pointage pour recevoir un nouveau lien.
                  </p>
                )}
              </div>
            )}

            {pendingCoords && earlyConfirm && !busy && (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold">
                    <MapPin className="h-4 w-4" /> Position vérifiée
                  </p>
                  <WaText text={earlyConfirm.message} />
                </div>
                <Button size="lg" className="w-full" onClick={() => void submitPointage(pendingCoords.lat, pendingCoords.lng, true)}>
                  Confirmer le départ anticipé
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setPendingCoords(null);
                    setEarlyConfirm(null);
                    setCancelled(true);
                  }}
                >
                  Annuler
                </Button>
              </div>
            )}

            {cancelled && !busy && (
              <div className="space-y-4 py-2 text-center">
                <p className="text-sm text-slate-600">
                  Départ non enregistré. Vous pourrez pointer votre départ plus tard avec ce lien (valable 15 minutes) ou en
                  renvoyant <strong>2</strong> sur WhatsApp.
                </p>
                <Button icon={<Navigation className="h-4 w-4" />} onClick={() => requestGeolocation()}>
                  Relancer le pointage
                </Button>
                <WhatsAppButton number={whatsapp} />
              </div>
            )}

            {geoError && !busy && (
              <div className="py-2 text-center">
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-700">{geoError}</p>
                </div>
                <Button size="lg" className="w-full" icon={<Navigation className="h-4 w-4" />} onClick={() => requestGeolocation()}>
                  Réessayer
                </Button>
                <WhatsAppButton number={whatsapp} />
              </div>
            )}
          </>
        )}
      </PublicCard>
      <p className="mt-4 px-2 text-center text-xs text-slate-500">
        Votre position sert uniquement à vérifier que vous êtes sur votre lieu de travail au moment du pointage.
      </p>
    </PublicShell>
  );
}

export default function GeolocPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-100">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      }
    >
      <GeolocForm />
    </Suspense>
  );
}
