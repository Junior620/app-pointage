"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  X,
  Check,
  XCircle,
  MapPin,
  Download,
  Eye,
  CalendarDays,
  Briefcase,
  Clock,
  UserCheck,
  UserX,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

interface Mission {
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
  location: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const missionSchema = z.object({
  employeeId: z.string().min(1, "L'employé est requis"),
  startDate: z.string().min(1, "La date de début est requise"),
  endDate: z.string().min(1, "La date de fin est requise"),
  reason: z.string().min(1, "Le motif est requis"),
  location: z.string().optional(),
});

const statusBadge: Record<string, { bg: string; label: string }> = {
  PENDING: { bg: "bg-amber-50 text-amber-700", label: "En attente" },
  APPROVED: { bg: "bg-emerald-50 text-emerald-700", label: "Approuvée" },
  REJECTED: { bg: "bg-red-50 text-red-700", label: "Refusée" },
};

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

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{ id: string; firstName: string; lastName: string; service?: string }[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailMission, setDetailMission] = useState<Mission | null>(null);
  const [form, setForm] = useState({ employeeId: "", startDate: "", endDate: "", reason: "", location: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const perPage = 20;

  const fetchMissions = useCallback(async () => {
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
      const res = await fetch(`/api/missions?${params}`);
      const json = await res.json();
      setMissions(json.data ?? []);
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
    fetchMissions();
  }, [fetchMissions]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const openCreate = () => {
    fetchEmployees();
    setForm({ employeeId: "", startDate: "", endDate: "", reason: "", location: "" });
    setErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = missionSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[String(i.path[0])] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      if (res.ok) {
        setModalOpen(false);
        fetchMissions();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: "APPROVED" | "REJECTED") => {
    setActioningId(id);
    try {
      await fetch(`/api/missions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchMissions();
      setDetailMission(null);
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
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Missions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestion des missions et déplacements professionnels
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open("/api/reports?type=missions&format=excel", "_blank")}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle mission
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Briefcase} label="Missions totales" value={stats.total} color="slate" />
        <KpiCard icon={Clock} label="En attente" value={stats.pending} color="amber" />
        <KpiCard icon={UserCheck} label="Approuvées" value={stats.approved} color="green" />
        <KpiCard icon={UserX} label="Refusées" value={stats.rejected} color="red" />
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
              <option value="APPROVED">Approuvée</option>
              <option value="REJECTED">Refusée</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
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
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Lieu</th>
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
              ) : missions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <AlertCircle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-base font-semibold text-slate-700">Aucune mission</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Essayez de modifier les filtres ou créez une nouvelle mission.
                    </p>
                    <button
                      onClick={openCreate}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Nouvelle mission
                    </button>
                  </td>
                </tr>
              ) : (
                missions.map((mission) => {
                  const badge = statusBadge[mission.status];
                  return (
                    <tr
                      key={mission.id}
                      onClick={() => setDetailMission(mission)}
                      className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors"
                    >
                      {/* Employé */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                              mission.status === "PENDING"
                                ? "bg-amber-100 text-amber-700"
                                : mission.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                            )}
                          >
                            {mission.employee.firstName[0]}
                            {mission.employee.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">
                              {mission.employee.firstName} {mission.employee.lastName}
                            </p>
                            <p className="text-xs text-slate-400">{mission.employee.matricule}</p>
                          </div>
                        </div>
                      </td>
                      {/* Service */}
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {mission.employee.service ?? "—"}
                      </td>
                      {/* Début */}
                      <td className="px-6 py-4 text-slate-700">
                        {new Date(mission.startDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </td>
                      {/* Fin */}
                      <td className="px-6 py-4 text-slate-700">
                        {new Date(mission.endDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </td>
                      {/* Durée */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {formatDuration(mission.startDate, mission.endDate)}
                        </span>
                      </td>
                      {/* Lieu */}
                      <td className="px-6 py-4 text-slate-600">
                        {mission.location ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {mission.location}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      {/* Statut */}
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                            badge.bg
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDetailMission(mission)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                            title="Voir détail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {mission.status === "PENDING" && (
                            <>
                              <button
                                onClick={() => updateStatus(mission.id, "APPROVED")}
                                disabled={actioningId === mission.id}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors disabled:opacity-50"
                                title="Approuver"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => updateStatus(mission.id, "REJECTED")}
                                disabled={actioningId === mission.id}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                                title="Refuser"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">
                {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}
              </span>{" "}
              sur <span className="font-medium text-slate-700">{total}</span> missions
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

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 z-10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Nouvelle mission</h2>
                <p className="text-sm text-slate-500">Créer un ordre de mission pour un employé</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Lieu de mission</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Ex : Douala, Abidjan, Bouaké..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motif</label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  rows={3}
                  placeholder="Décrivez l'objet de la mission"
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
      {detailMission && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDetailMission(null)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl z-10 overflow-y-auto animate-[slide-in-from-right_0.3s_ease-out]">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Détail de la mission</h2>
              <button onClick={() => setDetailMission(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Employee */}
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold",
                    detailMission.status === "PENDING"
                      ? "bg-amber-100 text-amber-700"
                      : detailMission.status === "APPROVED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                  )}
                >
                  {detailMission.employee.firstName[0]}
                  {detailMission.employee.lastName[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {detailMission.employee.firstName} {detailMission.employee.lastName}
                  </p>
                  <p className="text-sm text-slate-500">
                    {detailMission.employee.service ?? detailMission.employee.matricule}
                  </p>
                </div>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                    statusBadge[detailMission.status].bg
                  )}
                >
                  {statusBadge[detailMission.status].label}
                </span>
              </div>

              {/* Info */}
              <div className="rounded-xl bg-slate-50 p-4 space-y-3">
                <DetailRow label="Date début" value={new Date(detailMission.startDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
                <DetailRow label="Date fin" value={new Date(detailMission.endDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
                <DetailRow label="Durée" value={formatDuration(detailMission.startDate, detailMission.endDate)} />
                {detailMission.location && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      Lieu
                    </span>
                    <span className="font-medium text-slate-800">{detailMission.location}</span>
                  </div>
                )}
              </div>

              {/* Motif */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Motif</p>
                <p className="text-sm text-slate-700">{detailMission.reason}</p>
              </div>

              {/* Historique */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                <p className="text-xs font-medium text-slate-500 mb-1">Historique</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Créée le</span>
                  <span className="text-slate-700">{new Date(detailMission.createdAt).toLocaleDateString("fr-FR")}</span>
                </div>
                {detailMission.approvedBy && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Validée par</span>
                    <span className="font-medium text-slate-700">{detailMission.approvedBy}</span>
                  </div>
                )}
                {detailMission.updatedAt && detailMission.approvedBy && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Date validation</span>
                    <span className="text-slate-700">{new Date(detailMission.updatedAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {detailMission.status === "PENDING" && (
                <div className="flex gap-3 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => updateStatus(detailMission.id, "APPROVED")}
                    disabled={actioningId === detailMission.id}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    Approuver
                  </button>
                  <button
                    onClick={() => updateStatus(detailMission.id, "REJECTED")}
                    disabled={actioningId === detailMission.id}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Refuser
                  </button>
                </div>
              )}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
