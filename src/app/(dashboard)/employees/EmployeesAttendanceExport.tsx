"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Preset = "week" | "month" | "custom";

export default function EmployeesAttendanceExport({
  selectedIds,
  onClose,
}: {
  selectedIds: string[];
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const download = async () => {
    if (selectedIds.length === 0) {
      alert("Sélectionnez au moins un employé.");
      return;
    }
    if (preset === "custom" && (!from || !to)) {
      alert("Indiquez les dates de début et de fin.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        preset,
        ids: selectedIds.join(","),
      });
      if (preset === "custom") {
        params.set("from", from);
        params.set("to", to);
      }
      const res = await fetch(`/api/employees/attendance-export?${params}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(typeof json.error === "string" ? json.error : "Export impossible");
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = disp.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "pointages.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            Exporter les pointages ({selectedIds.length} employé
            {selectedIds.length > 1 ? "s" : ""})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["week", "month", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                preset === p
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              {p === "week" ? "Semaine" : p === "month" ? "Mois" : "Personnalisé"}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex gap-3">
            <label className="text-sm flex-1">
              Du
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm flex-1">
              Au
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}
        <button
          type="button"
          onClick={download}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {loading ? "Export…" : "Télécharger Excel"}
        </button>
      </div>
    </div>
  );
}
