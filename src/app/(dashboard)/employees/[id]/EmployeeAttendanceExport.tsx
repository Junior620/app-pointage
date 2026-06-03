"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

type Preset = "week" | "month" | "custom";

export default function EmployeeAttendanceExport({
  employeeId,
}: {
  employeeId: string;
}) {
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  const download = async () => {
    if (preset === "custom" && (!from || !to)) {
      alert("Indiquez les dates de début et de fin.");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ preset });
      if (preset === "custom") {
        params.set("from", from);
        params.set("to", to);
      }
      const res = await fetch(
        `/api/employees/${employeeId}/attendance-export?${params}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(typeof json.error === "string" ? json.error : "Export impossible");
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <p className="text-sm font-medium text-slate-700">Exporter l&apos;historique (Excel)</p>
      <div className="flex flex-wrap gap-2">
        {(["week", "month", "custom"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              preset === p
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            {p === "week" ? "Semaine" : p === "month" ? "Mois" : "Personnalisé"}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex flex-wrap gap-3">
          <label className="text-sm text-slate-600 flex flex-col gap-1">
            Du
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
            />
          </label>
          <label className="text-sm text-slate-600 flex flex-col gap-1">
            Au
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white"
            />
          </label>
        </div>
      )}
      <button
        type="button"
        onClick={download}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {loading ? "Export…" : "Télécharger Excel"}
      </button>
    </div>
  );
}
