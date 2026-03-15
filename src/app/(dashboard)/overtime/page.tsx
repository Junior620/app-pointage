"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Clock,
  Check,
  XCircle,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  UserCheck,
  UserX,
  Hourglass,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OvertimeRecord {
  id: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  overtimeMinutes: number;
  overtimeStatus: string | null;
  overtimeReason: string | null;
  overtimeValidatedBy: string | null;
  overtimeValidatedAt: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    service: string;
    structure: string;
  };
}

const statusBadge: Record<string, { bg: string; label: string }> = {
  PENDING: { bg: "bg-amber-50 text-amber-700", label: "En attente" },
  APPROVED: { bg: "bg-emerald-50 text-emerald-700", label: "Validée" },
  REJECTED: { bg: "bg-red-50 text-red-700", label: "Refusée" },
};

function formatOvertime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export default function OvertimePage() {
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [structureFilter, setStructureFilter] = useState("");
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const perPage = 25;

  const fetchOvertime = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(perPage),
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(structureFilter && { structure: structureFilter }),
    });
    try {
      const res = await fetch(`/api/overtime?${params}`);
      const json = await res.json();
      setRecords(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
      if (json.stats) setStats(json.stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo, structureFilter]);

  useEffect(() => {
    fetchOvertime();
  }, [fetchOvertime]);

  const validate = async (id: string, status: "APPROVED" | "REJECTED") => {
    setActioningId(id);
    try {
      const res = await fetch(`/api/overtime/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(status === "REJECTED" && rejectReason[id] && {
            reason: rejectReason[id],
          }),
        }),
      });
      if (res.ok) {
        fetchOvertime();
        setRejectReason((prev) => ({ ...prev, [id]: "" }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActioningId(null);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  const fetchAllForExport = async (): Promise<OvertimeRecord[]> => {
    const params = new URLSearchParams({
      page: "1",
      limit: "10000",
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(structureFilter && { structure: structureFilter }),
    });
    const res = await fetch(`/api/overtime?${params}`);
    const json = await res.json();
    return json.data ?? [];
  };

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const all = await fetchAllForExport();
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Heures supplémentaires");

    ws.columns = [
      { header: "Employé", key: "employee", width: 22 },
      { header: "Matricule", key: "matricule", width: 16 },
      { header: "Service", key: "service", width: 12 },
      { header: "Structure", key: "structure", width: 12 },
      { header: "Date", key: "date", width: 12 },
      { header: "Arrivée", key: "in", width: 10 },
      { header: "Départ", key: "out", width: 10 },
      { header: "Heures sup", key: "ot", width: 12 },
      { header: "Motif", key: "reason", width: 30 },
      { header: "Statut", key: "status", width: 12 },
      { header: "Validé par", key: "validatedBy", width: 18 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "2563EB" } };
      cell.alignment = { horizontal: "center" };
    });

    all.forEach((r) => {
      ws.addRow({
        employee: `${r.employee.lastName} ${r.employee.firstName}`,
        matricule: r.employee.matricule,
        service: r.employee.service,
        structure: r.employee.structure,
        date: new Date(r.date).toLocaleDateString("fr-FR"),
        in: r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—",
        out: r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—",
        ot: formatOvertime(r.overtimeMinutes),
        reason: r.overtimeReason ?? "—",
        status: statusBadge[r.overtimeStatus ?? ""]?.label ?? r.overtimeStatus ?? "—",
        validatedBy: r.overtimeValidatedBy ?? "—",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `heures_supplementaires_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Heures supplémentaires
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Validation des heures sup par la RH — seules les heures validées sont prises en compte pour la paie.
          </p>
        </div>
        <button
          onClick={exportExcel}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors text-sm font-medium"
        >
          <Download className="w-4 h-4" />
          Exporter Excel
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
              <Hourglass className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">En attente</p>
              <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Validées</p>
              <p className="text-2xl font-bold text-emerald-700">{stats.approved}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-red-50 text-red-600">
              <UserX className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Refusées</p>
              <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-slate-50 text-slate-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Total</p>
              <p className="text-2xl font-bold text-slate-700">{total}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="">Tous les statuts</option>
              <option value="PENDING">En attente</option>
              <option value="APPROVED">Validées</option>
              <option value="REJECTED">Refusées</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            />
            <select
              value={structureFilter}
              onChange={(e) => {
                setStructureFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="">Toutes structures</option>
              <option value="SCPB">SCPB</option>
              <option value="AFREXIA">AFREXIA</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employé
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Arrivée / Départ
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Heures sup
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Motif
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Statut
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="h-5 bg-slate-100 rounded-lg animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <AlertCircle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-base font-semibold text-slate-700">
                      Aucune heure supplémentaire
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Modifiez les filtres ou attendez de nouveaux pointages.
                    </p>
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const badge = statusBadge[r.overtimeStatus ?? ""] || statusBadge.PENDING;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-800">
                            {r.employee.lastName} {r.employee.firstName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {r.employee.matricule} — {r.employee.service} ({r.employee.structure})
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {new Date(r.date).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {r.checkInTime
                          ? new Date(r.checkInTime).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}{" "}
                        →{" "}
                        {r.checkOutTime
                          ? new Date(r.checkOutTime).toLocaleTimeString("fr-FR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-violet-600">
                          {formatOvertime(r.overtimeMinutes)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate">
                        {r.overtimeReason || (
                          <span className="text-slate-400 italic">Non renseigné</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                            badge.bg
                          )}
                        >
                          {badge.label}
                        </span>
                        {r.overtimeValidatedBy && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            Par {r.overtimeValidatedBy}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.overtimeStatus === "PENDING" && (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              type="text"
                              placeholder="Motif refus (obligatoire)"
                              value={rejectReason[r.id] ?? ""}
                              onChange={(e) =>
                                setRejectReason((prev) => ({
                                  ...prev,
                                  [r.id]: e.target.value,
                                }))
                              }
                              className="w-32 px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => validate(r.id, "APPROVED")}
                              disabled={actioningId === r.id}
                              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors disabled:opacity-50"
                              title="Valider"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => validate(r.id, "REJECTED")}
                              disabled={
                                actioningId === r.id ||
                                !(rejectReason[r.id] && rejectReason[r.id].trim())
                              }
                              className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                              title="Refuser"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">
                {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}
              </span>{" "}
              sur <span className="font-medium text-slate-700">{total}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
