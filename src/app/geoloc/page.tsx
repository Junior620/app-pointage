"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, CheckCircle, XCircle, Loader2, Navigation, MessageSquare } from "lucide-react";

const VALID_ACTIONS = ["CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END"] as const;
type GeolocAction = (typeof VALID_ACTIONS)[number];

type ResultState = {
  success: boolean;
  message: string;
  status?: string;
  needsLateReason?: boolean;
};

function actionLabel(action: string): string {
  if (action === "CHECK_OUT") return "Enregistrement du départ";
  if (action === "BREAK_START") return "Enregistrement du départ en pause";
  if (action === "BREAK_END") return "Enregistrement du retour de pause";
  return "Enregistrement de l'arrivée";
}

function GeolocForm() {
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";
  const action = searchParams.get("action") ?? "";

  const [geoError, setGeoError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [lateReason, setLateReason] = useState("");
  const [lateSubmitting, setLateSubmitting] = useState(false);
  const [lateSent, setLateSent] = useState(false);

  const hasStartedRef = useRef(false);
  const hasSubmittedRef = useRef(false);

  const isValidAction = VALID_ACTIONS.includes(action as GeolocAction);

  const submitPointage = useCallback(
    async (lat: number, lng: number) => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;
      setSubmitting(true);
      try {
        const res = await fetch("/api/geoloc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, lat, lng, action }),
        });
        const json = await res.json();
        const data = json.data ?? json;
        setResult({
          success: res.ok,
          message: data.message ?? (res.ok ? "Pointage enregistré" : "Erreur"),
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
    [phone, action]
  );

  const requestGeolocation = useCallback(() => {
    setGeoLoading(true);
    setGeoError("");
    setResult(null);
    hasSubmittedRef.current = false;

    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur.");
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void submitPointage(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError(
              "Autorisez l'accès à votre position (paramètres du navigateur), puis réessayez."
            );
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError("Position indisponible. Activez le GPS et réessayez.");
            break;
          case error.TIMEOUT:
            setGeoError("Délai dépassé. Réessayez.");
            break;
          default:
            setGeoError("Impossible d'obtenir votre position.");
        }
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [submitPointage]);

  useEffect(() => {
    if (!phone || !isValidAction) {
      setGeoError("Lien de pointage invalide. Rouvrez le lien reçu sur WhatsApp.");
      return;
    }
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    requestGeolocation();
  }, [phone, isValidAction, requestGeolocation]);

  const submitLateReason = async () => {
    const trimmed = lateReason.trim();
    if (!trimmed) return;
    setLateSubmitting(true);
    try {
      const res = await fetch("/api/geoloc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, action: "LATE_REASON", comment: trimmed }),
      });
      const json = await res.json();
      const data = json.data ?? json;
      if (res.ok) {
        setLateSent(true);
        setResult((prev) =>
          prev
            ? { ...prev, message: data.message ?? `Motif enregistré : « ${trimmed} »` }
            : prev
        );
      } else {
        alert(data.message ?? data.error ?? "Erreur");
      }
    } catch {
      alert("Erreur de connexion");
    } finally {
      setLateSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
          <div className="text-center mb-4">
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                result.success ? "bg-emerald-100" : "bg-red-100"
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              ) : (
                <XCircle className="w-8 h-8 text-red-600" />
              )}
            </div>
            <h2
              className={`text-xl font-bold mb-2 ${
                result.success ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {result.success ? "Pointage enregistré" : "Pointage refusé"}
            </h2>
            <p className="text-slate-600 text-sm whitespace-pre-line">{result.message}</p>
          </div>

          {result.success && result.needsLateReason && !lateSent && (
            <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
              <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                <MessageSquare className="w-5 h-5 shrink-0 mt-0.5" />
                <p>
                  Vous êtes en <strong>retard</strong>. Indiquez le motif ci-dessous ou
                  répondez sur WhatsApp.
                </p>
              </div>
              <textarea
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
                placeholder="Ex. : embouteillage, panne, rendez-vous médical…"
                rows={3}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none"
              />
              <button
                type="button"
                onClick={() => void submitLateReason()}
                disabled={lateSubmitting || !lateReason.trim()}
                className="w-full py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium rounded-xl text-sm"
              >
                {lateSubmitting ? "Envoi…" : "Envoyer le motif du retard"}
              </button>
            </div>
          )}

          {lateSent && (
            <p className="mt-4 text-center text-sm text-emerald-700 font-medium">
              Motif enregistré. Merci.
            </p>
          )}

          {!result.success && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                hasStartedRef.current = false;
                requestGeolocation();
              }}
              className="mt-6 w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium"
            >
              Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }

  const busy = geoLoading || submitting;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-4">
            <MapPin className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Pointage géolocalisé</h1>
          {isValidAction && (
            <p className="text-slate-500 text-sm mt-1">{actionLabel(action)}</p>
          )}
        </div>

        {busy && (
          <div className="text-center py-8">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-600 text-sm font-medium">
              {submitting ? "Enregistrement du pointage…" : "Récupération de votre position…"}
            </p>
            <p className="text-slate-400 text-xs mt-2">
              Autorisez la localisation si le navigateur le demande
            </p>
          </div>
        )}

        {geoError && !busy && (
          <div className="text-center py-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-red-700 text-sm">{geoError}</p>
            </div>
            {phone && isValidAction && (
              <button
                type="button"
                onClick={() => {
                  hasStartedRef.current = true;
                  requestGeolocation();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium"
              >
                <Navigation className="w-4 h-4" />
                Réessayer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GeolocPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      }
    >
      <GeolocForm />
    </Suspense>
  );
}
