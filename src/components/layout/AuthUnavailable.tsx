"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

/** Affiché quand la session n'a pas pu être vérifiée (Supabase injoignable), au lieu d'un renvoi vers /login. */
export default function AuthUnavailable() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm">
        <EmptyState
          icon={WifiOff}
          title="Connexion au serveur interrompue"
          description="Le service de connexion ne répond pas pour le moment. Votre session n'a pas été fermée : réessayez dans quelques secondes."
          action={
            <Button
              icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => window.location.reload()}
            >
              Réessayer
            </Button>
          }
        />
      </div>
    </div>
  );
}
