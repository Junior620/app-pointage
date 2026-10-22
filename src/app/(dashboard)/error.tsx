"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

/** Erreur de rendu d'une page du tableau de bord (ex. session non vérifiable pendant une coupure réseau). */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Cette page n'a pas pu être chargée"
      description="La connexion au serveur a peut-être été interrompue. Réessayez dans quelques secondes."
      action={
        <Button
          icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Réessayer
        </Button>
      }
    />
  );
}
