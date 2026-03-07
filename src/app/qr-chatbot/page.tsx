"use client";

import { useState } from "react";
import { Download, MessageCircle, AlertCircle } from "lucide-react";

const QR_URL = "/api/qr-chatbot";

export default function QrChatbotPage() {
  const [error, setError] = useState(false);

  const handleDownload = () => {
    window.open(QR_URL + "?download=1", "_blank", "noopener");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 mb-4">
          <MessageCircle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">Pointage par WhatsApp</h1>
        <p className="text-sm text-slate-500 mb-6">
          Scannez le QR code pour ouvrir le chat, puis envoyez <strong>Bonjour</strong> pour afficher le menu de pointage (boutons Arrivé / Départ / Statut).
        </p>

        {error ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3 text-left">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">QR code non disponible</p>
              <p className="text-xs text-amber-700 mt-1">
                Configurez <code className="bg-amber-100 px-1 rounded">WHATSAPP_BUSINESS_PHONE</code> dans les variables d&apos;environnement (format international sans +, ex. 237690000000).
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="inline-block p-4 bg-white rounded-2xl border border-slate-200 shadow-sm mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={QR_URL}
                alt="QR Code WhatsApp Pointage"
                width={280}
                height={280}
                className="rounded-xl"
                onError={() => setError(true)}
              />
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Ou enregistrez l&apos;image ci-dessus pour l&apos;afficher en affiche.
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Télécharger le QR code
            </button>
          </>
        )}

        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Après &quot;Bonjour&quot;, utilisez les boutons ou tapez : <strong>Arrivé</strong> · <strong>Départ</strong> · <strong>Statut</strong> · <strong>Aide</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
