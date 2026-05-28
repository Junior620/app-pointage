"use client";

import { useCallback, useEffect, useState } from "react";
import { Coffee, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type BreakRow = {
  id: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    service: string;
    structure: string;
  };
  breakStartTime: string | null;
  breakEndTime: string | null;
  breakMinutes: number;
  checkInTime: string | null;
  checkOutTime: string | null;
  onBreak: boolean;
  missingReturn: boolean;
};

type BreakPayload = {
  date: string;
  data: BreakRow[];
  stats: {
    totalBreaks: number;
    onBreak: number;
    completed: number;
    missingReturn: number;
    avgMinutes: number;
  };
  services: string[];
};

export default function BreaksPage() {
  const [payload, setPayload] = useState<BreakPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceFilter, setServiceFilter] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [onlyOverExpected, setOnlyOverExpected] = useState(false);

  const fetchBreaks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (serviceFilter) params.set("service", serviceFilter);
    if (onlyOverExpected) params.set("overExpected", "1");
    try {
      const res = await fetch(`/api/breaks?${params}`);
      const json = await res.json();
      setPayload(json);
    } finally {
      setLoading(false);
    }
  }, [date, serviceFilter, onlyOverExpected]);

  useEffect(() => {
    fetchBreaks();
  }, [fetchBreaks]);

  const stats = payload?.stats ?? {
    totalBreaks: 0,
    onBreak: 0,
    completed: 0,
    missingReturn: 0,
    avgMinutes: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Coffee className="h-7 w-7 text-amber-600" />
            Suivi des pauses
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Suivi des départs/retours pause et oublis de retour.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm"
          />
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm"
          >
            <option value="">Tous les services</option>
            {(payload?.services ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm text-slate-700">
            <input
              type="checkbox"
              checked={onlyOverExpected}
              onChange={(e) => setOnlyOverExpected(e.target.checked)}
              className="rounded border-slate-300"
            />
            Pauses &gt; 60 min
          </label>
          <button
            onClick={fetchBreaks}
            className="h-10 w-10 rounded-xl border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
            title="Actualiser"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Pauses pointées" value={stats.totalBreaks} color="slate" />
        <StatCard label="En pause" value={stats.onBreak} color="amber" />
        <StatCard label="Retours pointés" value={stats.completed} color="emerald" />
        <StatCard label="Retours manquants" value={stats.missingReturn} color="red" />
        <StatCard
          label="Pause moyenne"
          value={`${Math.floor(stats.avgMinutes / 60)}h${(stats.avgMinutes % 60).toString().padStart(2, "0")}`}
          color="blue"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Employé</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Service</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Début pause</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Retour pause</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Durée</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-sm text-slate-500">
                    Chargement...
                  </td>
                </tr>
              ) : (payload?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                    Aucune pause enregistrée pour ce jour.
                  </td>
                </tr>
              ) : (
                (payload?.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-medium text-slate-800">
                      {r.employee.firstName} {r.employee.lastName}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{r.employee.service}</td>
                    <td className="px-6 py-3 text-slate-600">{toTime(r.breakStartTime)}</td>
                    <td className="px-6 py-3 text-slate-600">{toTime(r.breakEndTime)}</td>
                    <td className="px-6 py-3 text-slate-700">
                      {Math.floor((r.breakMinutes ?? 0) / 60)}h{((r.breakMinutes ?? 0) % 60).toString().padStart(2, "0")}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          r.onBreak
                            ? "bg-amber-50 text-amber-700"
                            : r.missingReturn
                              ? "bg-red-50 text-red-700"
                              : "bg-emerald-50 text-emerald-700"
                        )}
                      >
                        {r.onBreak ? "En pause" : r.missingReturn ? "Retour manquant" : "Pause clôturée"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function toTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "slate" | "amber" | "emerald" | "red" | "blue";
}) {
  const colors = {
    slate: "bg-slate-50 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-xl font-bold", colors[color])}>
        {value}
      </p>
    </div>
  );
}
