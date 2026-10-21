"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger : action destructrice (bouton rouge) */
  tone?: "danger" | "primary";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Boîte de confirmation (remplace window.confirm). `await confirm({...})` renvoie true / false. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const danger = (options?.tone ?? "danger") === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => close(false)}
        title={options?.title ?? ""}
        size="sm"
        footer={
          <>
            {/* Action destructrice : le focus part sur « Annuler » pour qu'Entrée ne supprime pas par erreur */}
            <Button variant="secondary" onClick={() => close(false)} data-autofocus={danger || undefined}>
              {options?.cancelLabel ?? "Annuler"}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={() => close(true)}
              data-autofocus={!danger || undefined}
            >
              {options?.confirmLabel ?? "Confirmer"}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          {danger && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{options?.message}</div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm doit être utilisé sous <ConfirmProvider>");
  return ctx;
}
