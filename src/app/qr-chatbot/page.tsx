"use client";

import { useState } from "react";
import { Download, MessageCircle, AlertCircle, Printer } from "lucide-react";
import PublicShell, { PublicCard } from "@/components/layout/PublicShell";
import { Button } from "@/components/ui/Button";

const QR_URL = "/api/qr-chatbot";

export default function QrChatbotPage() {
  const [error, setError] = useState(false);

  const handleDownload = () => {
    window.open(QR_URL + "?download=1", "_blank", "noopener");
  };

  return (
    <PublicShell>
      <PublicCard className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
          <MessageCircle className="h-7 w-7" />
        </span>
        <h1 className="mb-1 text-xl font-bold text-slate-900">Pointage par WhatsApp</h1>
        <p className="mb-6 text-sm text-slate-500">
          Scannez le QR code : la conversation s&apos;ouvre avec <strong>Bonjour</strong> déjà écrit. Appuyez sur Envoyer pour
          recevoir les instructions et les boutons Arrivée, Départ et Mon statut.
        </p>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">QR code non disponible</p>
              <p className="mt-1 text-xs text-amber-700">
                Configurez <code className="rounded bg-amber-100 px-1">WHATSAPP_BUSINESS_PHONE</code> dans les variables
                d&apos;environnement (format international sans +, ex. 237690000000).
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 inline-block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={QR_URL} alt="QR code de la conversation WhatsApp de pointage" width={260} height={260} className="rounded-xl" onError={() => setError(true)} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center print:hidden">
              <Button variant="success" onClick={handleDownload} icon={<Download className="h-4 w-4" />}>
                Télécharger le QR code
              </Button>
              <Button variant="secondary" onClick={() => window.print()} icon={<Printer className="h-4 w-4" />}>
                Imprimer l&apos;affiche
              </Button>
            </div>
          </>
        )}

        <div className="mt-8 border-t border-slate-100 pt-6">
          <p className="text-xs text-slate-500">
            Ensuite : touchez les boutons ou écrivez <strong>Arrivé</strong> · <strong>Départ</strong> · <strong>Statut</strong> ·{" "}
            <strong>/</strong> pour le menu.
          </p>
        </div>
      </PublicCard>
    </PublicShell>
  );
}
