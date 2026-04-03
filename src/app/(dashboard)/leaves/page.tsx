"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  X,
  Check,
  XCircle,
  CalendarDays,
  ClipboardList,
  Clock,
  UserCheck,
  UserX,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Trash2,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

interface LeaveRequest {
  id: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    service?: string;
  };
  startDate: string;
  endDate: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  document: string | null;
  approvedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const leaveSchema = z.object({
  employeeId: z.string().min(1, "L'employé est requis"),
  startDate: z.string().min(1, "La date de début est requise"),
  endDate: z.string().min(1, "La date de fin est requise"),
  reason: z.string().min(1, "Le motif est requis"),
});

const statusBadge: Record<string, { bg: string; label: string }> = {
  PENDING: { bg: "bg-amber-50 text-amber-700", label: "En attente" },
  APPROVED: { bg: "bg-emerald-50 text-emerald-700", label: "Approuvé" },
  REJECTED: { bg: "bg-red-50 text-red-700", label: "Refusé" },
};

const MOTIF_SUGGESTIONS = [
  "Rendez-vous médical",
  "Démarche administrative",
  "Urgence familiale",
  "Autre",
];

function getDurationDays(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  const diff = b.getTime() - a.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24))) + 1;
}

function formatDuration(start: string, end: string): string {
  const days = getDurationDays(start, end);
  if (days <= 1) return "1 jour";
  return `${days} jours`;
}

export default function LeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string; service?: string }[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailLeave, setDetailLeave] = useState<LeaveRequest | null>(null);
  const [form, setForm] = useState({ employeeId: "", startDate: "", endDate: "", reason: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const perPage = 20;

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(perPage),
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { startDate: dateFrom }),
      ...(dateTo && { endDate: dateTo }),
      ...(serviceFilter && { service: serviceFilter }),
      ...(employeeFilter && { employeeId: employeeFilter }),
    });
    try {
      const res = await fetch(`/api/leaves?${params}`);
      const json = await res.json();
      setLeaves(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
      if (json.stats) setStats(json.stats);
      if (json.services) setServices(json.services);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo, serviceFilter, employeeFilter]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/employees?limit=1000&active=true");
      const json = await res.json();
      setEmployees(json.data ?? []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const openCreate = () => {
    fetchEmployees();
    setForm({ employeeId: "", startDate: "", endDate: "", reason: "" });
    setErrors({});
    setSubmitError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = leaveSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[String(i.path[0])] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setModalOpen(false);
        fetchLeaves();
      } else {
        setSubmitError(
          typeof json.error === "string" ? json.error : "Impossible d'enregistrer la demande."
        );
      }
    } catch (e) {
      console.error(e);
      setSubmitError("Erreur réseau. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteLeave = async (id: string) => {
    if (
      !window.confirm(
        "Annuler cette demande ? Elle restera visible dans l’historique (marquée « annulée ») mais ne sera plus prise en compte pour le pointage."
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/leaves/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetailLeave(null);
        fetchLeaves();
      } else {
        window.alert(typeof json.error === "string" ? json.error : "Suppression impossible.");
      }
    } catch (e) {
      console.error(e);
      window.alert("Erreur réseau.");
    } finally {
      setDeletingId(null);
    }
  };

  const fetchAllLeaves = useCallback(async (): Promise<LeaveRequest[]> => {
    const pageSize = 100;
    const out: LeaveRequest[] = [];
    let p = 1;
    const base = new URLSearchParams({
      limit: String(pageSize),
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { startDate: dateFrom }),
      ...(dateTo && { endDate: dateTo }),
      ...(serviceFilter && { service: serviceFilter }),
      ...(employeeFilter && { employeeId: employeeFilter }),
    });
    for (;;) {
      const params = new URLSearchParams(base);
      params.set("page", String(p));
      const res = await fetch(`/api/leaves?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Export impossible");
      const batch: LeaveRequest[] = json.data ?? [];
      out.push(...batch);
      if (batch.length < pageSize) break;
      p++;
    }
    return out;
  }, [statusFilter, dateFrom, dateTo, serviceFilter, employeeFilter]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const all = await fetchAllLeaves();
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Permissions");
      ws.columns = [
        { header: "Employé", key: "employee", width: 24 },
        { header: "Matricule", key: "matricule", width: 18 },
        { header: "Service", key: "service", width: 14 },
        { header: "Début", key: "start", width: 12 },
        { header: "Fin", key: "end", width: 12 },
        { header: "Durée", key: "duration", width: 10 },
        { header: "Motif", key: "reason", width: 36 },
        { header: "Statut", key: "status", width: 22 },
        { header: "Créée le", key: "created", width: 14 },
      ];
      ws.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "2563EB" } };
        cell.alignment = { horizontal: "center" };
      });
      all.forEach((leave) => {
        const badge = statusBadge[leave.status];
        const cancelled = Boolean(leave.cancelledAt);
        ws.addRow({
          employee: `${leave.employee.lastName} ${leave.employee.firstName}`,
          matricule: leave.employee.matricule,
          service: leave.employee.service ?? "—",
          start: new Date(leave.startDate).toLocaleDateString("fr-FR"),
          end: new Date(leave.endDate).toLocaleDateString("fr-FR"),
          duration: formatDuration(leave.startDate, leave.endDate),
          reason: leave.reason,
          status: `${badge?.label ?? leave.status}${cancelled ? " — annulée" : ""}`,
          created: new Date(leave.createdAt).toLocaleDateString("fr-FR"),
        });
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `permissions_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setExporting(false);
    }
  };

  const updateStatus = async (id: string, status: "APPROVED" | "REJECTED") => {
    setActioningId(id);
    try {
      await fetch(`/api/leaves/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchLeaves();
      setDetailLeave(null);
    } catch (e) {
      console.error(e);
    } finally {
      setActioningId(null);
    }
  };

  const totalPages = Math.ceil(total / perPage);
  const durationPreview =
    form.startDate && form.endDate && new Date(form.endDate) >= new Date(form.startDate)
      ? formatDuration(form.startDate, form.endDate)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Permissions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestion des demandes d&apos;absence courte et sorties autorisées
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Export…" : "Exporter"}
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle demande
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={ClipboardList} label="Demandes" value={stats.total} color="slate" />
        <KpiCard icon={Clock} label="En attente" value={stats.pending} color="amber" />
        <KpiCard icon={UserCheck} label="Approuvées" value={stats.approved} color="green" />
        <KpiCard icon={UserX} label="Refusées" value={stats.rejected} color="red" />
        <KpiCard icon={Archive} label="Annulées" value={stats.cancelled ?? 0} color="slate" />
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="">Tous les statuts</option>
              <option value="PENDING">En attente</option>
              <option value="APPROVED">Approuvé</option>
              <option value="REJECTED">Refusé</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
              placeholder="Date début"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
              placeholder="Date fin"
            />
            <select
              value={serviceFilter}
              onChange={(e) => { setServiceFilter(e.target.value); setPage(1); }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="">Tous les services</option>
              {services.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={employeeFilter}
              onChange={(e) => { setEmployeeFilter(e.target.value); setPage(1); }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 min-w-[200px]"
            >
              <option value="">Tous les employés</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.lastName} {emp.firstName} {emp.service ? ` — ${emp.service}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Employé</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Service</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Début</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Fin</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Durée</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Motif</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={8} className="px-6 py-4">
                      <div className="h-5 bg-slate-100 rounded-lg animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : leaves.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <AlertCircle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-base font-semibold text-slate-700">Aucune demande de permission</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Essayez de modifier les filtres ou créez une nouvelle demande.
                    </p>
                    <button
                      onClick={openCreate}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Nouvelle demande
                    </button>
                  </td>
                </tr>
              ) : (
                leaves.map((leave) => {
                  const badge = statusBadge[leave.status];
                  const isOff = Boolean(leave.cancelledAt);
                  return (
                    <tr
                      key={leave.id}
                      onClick={() => setDetailLeave(leave)}
                      className={cn(
                        "border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors",
                        isOff && "opacity-70"
                      )}
                    >
                      {/* Employé */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                              leave.status === "PENDING"
                                ? "bg-amber-100 text-amber-700"
                                : leave.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                            )}
                          >
                            {leave.employee.firstName[0]}
                            {leave.employee.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">
                              {leave.employee.firstName} {leave.employee.lastName}
                            </p>
                            <p className="text-xs text-slate-400">
                              {leave.employee.matricule}
                            </p>
                          </div>
                        </div>
                      </td>
                      {/* Service */}
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {leave.employee.service ?? "—"}
                      </td>
                      {/* Début */}
                      <td className="px-6 py-4 text-slate-700">
                        {new Date(leave.startDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </td>
                      {/* Fin */}
                      <td className="px-6 py-4 text-slate-700">
                        {new Date(leave.endDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </td>
                      {/* Durée */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {formatDuration(leave.startDate, leave.endDate)}
                        </span>
                      </td>
                      {/* Motif */}
                      <td className="px-6 py-4 text-slate-600 max-w-[180px] truncate text-sm">
                        {leave.reason}
                      </td>
                      {/* Statut */}
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                              badge.bg
                            )}
                          >
                            {badge.label}
                          </span>
                          {isOff && (
                            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-slate-200 text-slate-700">
                              Annulée
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailLeave(leave)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                            title="Voir détail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {leave.status === "PENDING" && !isOff && (
                            <>
                              <button
                                onClick={() => updateStatus(leave.id, "APPROVED")}
                                disabled={actioningId === leave.id || deletingId === leave.id}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors disabled:opacity-50"
                                title="Approuver"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => updateStatus(leave.id, "REJECTED")}
                                disabled={actioningId === leave.id || deletingId === leave.id}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                                title="Refuser"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {!isOff && (
                            <button
                              onClick={() => deleteLeave(leave.id)}
                              disabled={deletingId === leave.id || actioningId === leave.id}
                              className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                              title="Annuler (conserver l’historique)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination : toujours visible après chargement (résumé), navigation si > 1 page */}
        {!loading && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              {total > 0 ? (
                <>
                  <span className="font-medium text-slate-700">
                    {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}
                  </span>{" "}
                  sur <span className="font-medium text-slate-700">{total}</span> demande
                  {total > 1 ? "s" : ""}
                  {totalPages > 1 && (
                    <span className="text-slate-400"> — page {page} / {totalPages}</span>
                  )}
                </>
              ) : (
                "Aucune demande sur cette sélection"
              )}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                >
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900">Nouvelle demande de permission</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {submitError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {submitError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employé</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                >
                  <option value="">Rechercher ou sélectionner un employé</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.lastName} {emp.firstName} {emp.service ? ` — ${emp.service}` : ""}
                    </option>
                  ))}
                </select>
                {errors.employeeId && <p className="text-xs text-red-500 mt-1">{errors.employeeId}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date début</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                  />
                  {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date fin</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                  />
                  {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
                </div>
              </div>
              {durationPreview && (
                <p className="text-sm text-slate-600 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  Durée : <span className="font-medium">{durationPreview}</span>
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motif</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {MOTIF_SUGGESTIONS.map((motif) => (
                    <button
                      key={motif}
                      type="button"
                      onClick={() => setForm({ ...form, reason: motif })}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        form.reason === motif
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {motif}
                    </button>
                  ))}
                </div>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  placeholder="Détail du motif si besoin"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 resize-none placeholder:text-slate-400"
                />
                {errors.reason && <p className="text-xs text-red-500 mt-1">{errors.reason}</p>}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Envoi…" : "Soumettre"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {detailLeave && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailLeave(null)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl z-10 overflow-y-auto animate-[slide-in-from-right_0.3s_ease-out]">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Détail de la demande</h2>
              <button onClick={() => setDetailLeave(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold",
                    detailLeave.status === "PENDING"
                      ? "bg-amber-100 text-amber-700"
                      : detailLeave.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                  )}
                >
                  {detailLeave.employee.firstName[0]}
                  {detailLeave.employee.lastName[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {detailLeave.employee.firstName} {detailLeave.employee.lastName}
                  </p>
                  <p className="text-sm text-slate-500">
                    {detailLeave.employee.service ?? detailLeave.employee.matricule}
                  </p>
                </div>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                    statusBadge[detailLeave.status].bg
                  )}
                >
                  {statusBadge[detailLeave.status].label}
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date début</span>
                  <span className="font-medium text-slate-800">
                    {new Date(detailLeave.startDate).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Date fin</span>
                  <span className="font-medium text-slate-800">
                    {new Date(detailLeave.endDate).toLocaleDateString("fr-FR")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Durée</span>
                  <span className="font-medium text-slate-800">
                    {formatDuration(detailLeave.startDate, detailLeave.endDate)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Motif</p>
                <p className="text-sm text-slate-700">{detailLeave.reason}</p>
              </div>
              {detailLeave.approvedBy && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500 mb-1">Validation</p>
                  <p className="text-sm text-slate-700">
                    Validé par <span className="font-medium">{detailLeave.approvedBy}</span>
                    {detailLeave.updatedAt && (
                      <span className="block mt-1 text-slate-500">
                        le {new Date(detailLeave.updatedAt).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </p>
                </div>
              )}
              {detailLeave.cancelledAt && (
                <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-600 mb-1">Annulation (historique conservé)</p>
                  <p className="text-sm text-slate-700">
                    Le {new Date(detailLeave.cancelledAt).toLocaleString("fr-FR")}
                    {detailLeave.cancelledBy ? (
                      <span>
                        {" "}
                        par <span className="font-medium">{detailLeave.cancelledBy}</span>
                      </span>
                    ) : null}
                  </p>
                </div>
              )}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                {detailLeave.status === "PENDING" && !detailLeave.cancelledAt && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => updateStatus(detailLeave.id, "APPROVED")}
                      disabled={actioningId === detailLeave.id || deletingId === detailLeave.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      Approuver
                    </button>
                    <button
                      onClick={() => updateStatus(detailLeave.id, "REJECTED")}
                      disabled={actioningId === detailLeave.id || deletingId === detailLeave.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Refuser
                    </button>
                  </div>
                )}
                {!detailLeave.cancelledAt && (
                  <button
                    type="button"
                    onClick={() => deleteLeave(detailLeave.id)}
                    disabled={deletingId === detailLeave.id || actioningId === detailLeave.id}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-slate-700 bg-slate-100 hover:bg-red-50 hover:text-red-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingId === detailLeave.id ? "Annulation…" : "Annuler (conserver l’historique)"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "slate" | "amber" | "green" | "red";
}) {
  const colorMap = {
    slate: { bg: "bg-slate-50", text: "text-slate-600", value: "text-slate-700" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", value: "text-amber-700" },
    green: { bg: "bg-emerald-50", text: "text-emerald-600", value: "text-emerald-700" },
    red: { bg: "bg-red-50", text: "text-red-600", value: "text-red-700" },
  };
  const c = colorMap[color];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", c.bg, c.text)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={cn("text-2xl font-bold tracking-tight", c.value)}>{value}</p>
        </div>
      </div>
    </div>
  );
}
