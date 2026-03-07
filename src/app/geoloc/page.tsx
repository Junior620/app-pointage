"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MapPin, CheckCircle, XCircle, Loader2, Navigation } from "lucide-react";

function GeolocForm() {
  const searchParams = useSearchParams();
  const phone = searchParams.get("phone") ?? "";
  const action = searchParams.get("action") ?? "";

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoError, setGeoError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const requestGeolocation = useCallback(() => {
    setGeoLoading(true);
    setGeoError("");
    setLat(null);
    setLng(null);

    if (!navigator.geolocation) {
      setGeoError("La géolocalisation n'est pas supportée par votre navigateur.");
      setGeoLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setGeoLoading(false);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeoError("Vous avez refusé l'accès à votre position. Veuillez l'autoriser dans les paramètres.");
            break;
          case error.POSITION_UNAVAILABLE:
            setGeoError("Position indisponible. Vérifiez que le GPS est activé.");
            break;
          case error.TIMEOUT:
            setGeoError("Délai d'attente dépassé. Réessayez.");
            break;
          default:
            setGeoError("Erreur inconnue lors de la géolocalisation.");
        }
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  const handleConfirm = async () => {
    if (lat === null || lng === null) return;
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
        message: data.message ?? (res.ok ? "Position enregistrée" : "Erreur"),
      });
    } catch {
      setResult({ success: false, message: "Erreur de connexion au serveur" });
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${result.success ? "bg-emerald-100" : "bg-red-100"}`}>
            {result.success ? (
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            ) : (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
          </div>
          <h2 className={`text-xl font-bold mb-2 ${result.success ? "text-emerald-700" : "text-red-700"}`}>
            {result.success ? "Pointage enregistré" : "Erreur"}
          </h2>
          <p className="text-slate-600 text-sm">{result.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-4">
            <MapPin className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Pointage géolocalisé</h1>
          <p className="text-slate-500 text-sm mt-1">
            {action === "CHECK_OUT" ? "Enregistrement du départ" : "Enregistrement de l'arrivée"}
          </p>
        </div>

        {!lat && !lng && !geoLoading && !geoError && (
          <div className="text-center py-4">
            <p className="text-slate-600 text-sm mb-6">
              Appuyez sur le bouton pour enregistrer votre position <strong>à l&apos;instant</strong> (GPS en direct).
            </p>
            <button
              type="button"
              onClick={requestGeolocation}
              className="w-full py-4 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-3 shadow-lg"
            >
              <Navigation className="w-6 h-6" />
              Récupérer ma position maintenant
            </button>
          </div>
        )}

        {geoLoading && (
          <div className="text-center py-8">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-600 text-sm">Obtention de votre position...</p>
            <p className="text-slate-400 text-xs mt-1">Veuillez autoriser l&apos;accès à la localisation</p>
          </div>
        )}

        {geoError && (
          <div className="text-center py-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-red-700 text-sm">{geoError}</p>
            </div>
            <button
              onClick={requestGeolocation}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Navigation className="w-4 h-4" />
              Réessayer
            </button>
          </div>
        )}

        {lat !== null && lng !== null && !geoLoading && (
          <div className="space-y-5">
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Latitude</span>
                <span className="font-mono text-slate-800">{lat.toFixed(6)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Longitude</span>
                <span className="font-mono text-slate-800">{lng.toFixed(6)}</span>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Envoi...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Confirmer la position
                </>
              )}
            </button>
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
