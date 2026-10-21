"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "warning" | "info";

type ToastItem = { id: number; tone: ToastTone; title?: string; message: string };

type ToastApi = {
  show: (tone: ToastTone, message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, { icon: typeof Info; className: string; iconClass: string }> = {
  success: { icon: CheckCircle2, className: "border-emerald-200", iconClass: "text-emerald-600" },
  error: { icon: XCircle, className: "border-red-200", iconClass: "text-red-600" },
  warning: { icon: AlertTriangle, className: "border-amber-200", iconClass: "text-amber-600" },
  info: { icon: Info, className: "border-slate-200", iconClass: "text-brand-600" },
};

/** Notifications non bloquantes (remplace window.alert). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (tone: ToastTone, message: string, title?: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, tone, title, message }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 5000);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, t) => show("success", m, t),
      error: (m, t) => show("error", m, t),
      warning: (m, t) => show("warning", m, t),
      info: (m, t) => show("info", m, t),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => {
          const tone = TONES[t.tone];
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-4 shadow-lg animate-[toast-in_180ms_ease-out]",
                tone.className
              )}
              role={t.tone === "error" ? "alert" : undefined}
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone.iconClass)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {t.title && <p className="text-sm font-semibold text-slate-900">{t.title}</p>}
                <p className="whitespace-pre-line text-sm text-slate-600">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-mr-1 -mt-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fermer la notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé sous <ToastProvider>");
  return ctx;
}
