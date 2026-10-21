"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toaster";

type Preset = "week" | "month" | "custom";

const PRESET_LABELS: Record<Preset, string> = {
  week: "Semaine",
  month: "Mois",
  custom: "Personnalisé",
};

/** Bouton « Exporter » de la fiche employé, avec choix de la période dans une fenêtre. */
export default function EmployeeAttendanceExport({ employeeId }: { employeeId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const download = async () => {
    if (preset === "custom" && (!from || !to)) {
      toast.warning("Indiquez les dates de début et de fin.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ preset });
      if (preset === "custom") {
        params.set("from", from);
        params.set("to", to);
      }
      const res = await fetch(`/api/employees/${employeeId}/attendance-export?${params}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(typeof json.error === "string" ? json.error : "Export impossible");
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = disp.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `pointages_${employeeId}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Historique téléchargé.");
      setOpen(false);
    } catch {
      toast.error("Erreur réseau : export impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Exporter
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!loading}
        title="Exporter l'historique"
        description="Fichier Excel des pointages de l'employé."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Annuler
            </Button>
            <Button onClick={download} loading={loading} icon={<Download className="h-4 w-4" />}>
              Télécharger Excel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Période">
            {(["week", "month", "custom"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                aria-pressed={preset === p}
                className={cn(
                  "h-8 flex-1 rounded-lg px-3 text-sm font-medium transition-colors",
                  preset === p ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Du">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="Au">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {preset === "week" ? "Semaine en cours (du lundi à aujourd'hui)." : "Mois en cours (du 1er à aujourd'hui)."}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
