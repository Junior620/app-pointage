"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Clock,
  Briefcase,
  ClipboardCheck,
  Pencil,
  CalendarDays,
  MessageSquare,
  MapPin,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AttendanceRecord {
  id: string;
  date: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    service?: string;
  };
  checkInTime: string | null;
  checkInStatus: string | null;
  checkInComment: string | null;
  checkOutTime: string | null;
  checkOutStatus: string | null;
  checkOutComment: string | null;
  totalMinutes: number | null;
  overtimeMinutes: number | null;
  finalStatus: string;
}

const statusColors: Record<string, string> = {
  ON_TIME: "bg-emerald-50 text-emerald-700",
  LATE: "bg-amber-50 text-amber-700",
  ABSENT: "bg-red-50 text-red-700",
  PRESENT: "bg-emerald-50 text-emerald-700",
  PERMISSION: "bg-blue-50 text-blue-700",
  MISSION: "bg-violet-50 text-violet-700",
  AUTO: "bg-slate-100 text-slate-600",
  MANUAL: "bg-slate-100 text-slate-600",
};

const statusLabels: Record<string, string> = {
  ON_TIME: "À l'heure",
  LATE: "Retard",
  ABSENT: "Absent",
  PRESENT: "Présent",
  PERMISSION: "Permission",
  MISSION: "Mission",
  AUTO: "Auto",
  MANUAL: "Manuel",
};

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editComment, setEditComment] = useState("");
  const [editFinalStatus, setEditFinalStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const perPage = 20;

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(perPage),
      ...(search && { search }),
      ...(dateFrom && { startDate: dateFrom }),
      ...(dateTo && { endDate: dateTo }),
      ...(serviceFilter && { service: serviceFilter }),
      ...(statusFilter && { finalStatus: statusFilter }),
    });
    try {
      const res = await fetch(`/api/attendance?${params}`);
      const json = await res.json();
      setRecords(json.data ?? []);
      setTotal(json.pagination?.total ?? json.total ?? 0);
      if (json.services) setServices(json.services);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, dateFrom, dateTo, serviceFilter, statusFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const totalPages = Math.ceil(total / perPage);

  // KPI from current page
  const presentCount = records.filter((r) => r.finalStatus === "PRESENT").length;
  const absentCount = records.filter((r) => r.finalStatus === "ABSENT").length;
  const lateCount = records.filter((r) => r.checkInStatus === "LATE").length;
  const missionPermCount = records.filter(
    (r) => r.finalStatus === "MISSION" || r.finalStatus === "PERMISSION"
  ).length;

  const openDetail = (record: AttendanceRecord) => {
    setDetailRecord(record);
    setEditMode(false);
    setEditComment(record.checkInComment ?? "");
    setEditFinalStatus(record.finalStatus);
  };

  const handleEditSave = async () => {
    if (!detailRecord) return;
    setSubmitting(true);
    try {
      await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detailRecord.id,
          comment: editComment,
          finalStatus: editFinalStatus,
        }),
      });
      setDetailRecord(null);
      fetchRecords();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (min: number | null) => {
    if (min == null) return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h${m.toString().padStart(2, "0")}`;
  };

  const dateRangeLabel = () => {
    if (dateFrom && dateTo) return `${formatDateLabel(dateFrom)} → ${formatDateLabel(dateTo)}`;
    if (dateFrom) return `Depuis ${formatDateLabel(dateFrom)}`;
    if (dateTo) return `Jusqu'au ${formatDateLabel(dateTo)}`;
    return "Aujourd'hui";
  };

  const formatDateLabel = (d: string) => {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Pointages
        </h1>
        <p className="mt-1 text-sm text-slate-500 flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {dateRangeLabel()}
          {total > 0 && (
            <span className="ml-1">
              — <span className="font-medium text-slate-700">{total}</span>{" "}
              enregistrement{total > 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={UserCheck} label="Présents" value={presentCount} color="green" />
        <KpiCard icon={UserX} label="Absents" value={absentCount} color="red" />
        <KpiCard icon={Clock} label="Retards" value={lateCount} color="orange" />
        <KpiCard icon={Briefcase} label="Mission / Perm." value={missionPermCount} color="purple" />
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un employé (nom, matricule)..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-50 placeholder:text-slate-400"
              />
            </div>
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
              value={serviceFilter}
              onChange={(e) => {
                setServiceFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="">Tous les services</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
            >
              <option value="">Tous les statuts</option>
              <option value="PRESENT">Présent</option>
              <option value="ABSENT">Absent</option>
              <option value="PERMISSION">Permission</option>
              <option value="MISSION">Mission</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employé
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Arrivée
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Départ
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Durée
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
                    <ClipboardCheck className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-base font-semibold text-slate-700">
                      Aucun pointage trouvé
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Essayez de modifier les filtres ou vérifiez la période sélectionnée.
                    </p>
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openDetail(r)}
                    className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors"
                  >
                    {/* Date */}
                    <td className="px-6 py-4">
                      <span className="text-slate-700 font-medium">
                        {new Date(r.date).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </td>
                    {/* Employé */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                            r.finalStatus === "ABSENT"
                              ? "bg-red-100 text-red-700"
                              : r.checkInStatus === "LATE"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-blue-100 text-blue-700"
                          )}
                        >
                          {r.employee.firstName[0]}
                          {r.employee.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {r.employee.firstName} {r.employee.lastName}
                          </p>
                          <p className="text-xs text-slate-400">
                            {r.employee.matricule}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Arrivée */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700 font-medium">
                          {formatTime(r.checkInTime)}
                        </span>
                        {r.checkInStatus && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              statusColors[r.checkInStatus]
                            )}
                          >
                            {statusLabels[r.checkInStatus]}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Départ */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-700">
                          {formatTime(r.checkOutTime)}
                        </span>
                        {r.checkOutStatus && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              statusColors[r.checkOutStatus]
                            )}
                          >
                            {statusLabels[r.checkOutStatus]}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Durée */}
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-700">
                        {formatDuration(r.totalMinutes)}
                      </span>
                      {r.overtimeMinutes && r.overtimeMinutes > 0 ? (
                        <span className="ml-1 text-xs text-blue-600">
                          +{formatDuration(r.overtimeMinutes)}
                        </span>
                      ) : null}
                    </td>
                    {/* Statut final */}
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                          statusColors[r.finalStatus] ?? "bg-slate-100 text-slate-500"
                        )}
                      >
                        {statusLabels[r.finalStatus] ?? r.finalStatus}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.checkInComment && (
                          <span
                            className="p-1.5 text-slate-400"
                            title={r.checkInComment}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </span>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(r);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                          title="Détail / Corriger"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              {records.length > 0 ? (
                <>
                  <span className="font-medium text-slate-700">
                    {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}
                  </span>{" "}
                  sur <span className="font-medium text-slate-700">{total}</span>{" "}
                  pointage{total > 1 ? "s" : ""}
                </>
              ) : (
                "Aucun résultat"
              )}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Précédent
                </button>
                <div className="flex items-center gap-0.5 mx-2">
                  {(() => {
                    const delta = 2;
                    const start = Math.max(1, page - delta);
                    const end = Math.min(totalPages, page + delta);
                    return Array.from({ length: end - start + 1 }, (_, i) => start + i).map(
                      (p) => (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                            page === p
                              ? "bg-blue-600 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          )}
                        >
                          {p}
                        </button>
                      )
                    );
                  })()}
                </div>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  Suivant
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Drawer / Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDetailRecord(null)}
          />
          <div className="relative w-full max-w-md bg-white shadow-2xl z-10 overflow-y-auto animate-[slide-in-from-right_0.3s_ease-out]">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editMode ? "Correction manuelle" : "Détail du pointage"}
              </h2>
              <button
                onClick={() => setDetailRecord(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Employee info */}
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold",
                    detailRecord.finalStatus === "ABSENT"
                      ? "bg-red-100 text-red-700"
                      : "bg-blue-100 text-blue-700"
                  )}
                >
                  {detailRecord.employee.firstName[0]}
                  {detailRecord.employee.lastName[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {detailRecord.employee.firstName}{" "}
                    {detailRecord.employee.lastName}
                  </p>
                  <p className="text-sm text-slate-500">
                    {detailRecord.employee.matricule}
                  </p>
                </div>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                    statusColors[detailRecord.finalStatus]
                  )}
                >
                  {statusLabels[detailRecord.finalStatus]}
                </span>
              </div>

              {/* Date */}
              <div className="rounded-xl bg-slate-50 p-4 flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">
                  {new Date(detailRecord.date).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>

              {/* Timeline */}
              <div className="space-y-4">
                <DetailRow
                  icon={Clock}
                  label="Arrivée"
                  value={formatTime(detailRecord.checkInTime)}
                  badge={detailRecord.checkInStatus}
                />
                <DetailRow
                  icon={MapPin}
                  label="Départ"
                  value={formatTime(detailRecord.checkOutTime)}
                  badge={detailRecord.checkOutStatus}
                />
                <DetailRow
                  icon={Timer}
                  label="Durée totale"
                  value={formatDuration(detailRecord.totalMinutes)}
                />
                {detailRecord.overtimeMinutes && detailRecord.overtimeMinutes > 0 && (
                  <DetailRow
                    icon={Timer}
                    label="Heures sup."
                    value={formatDuration(detailRecord.overtimeMinutes)}
                    highlight
                  />
                )}
              </div>

              {/* Comment */}
              {detailRecord.checkInComment && !editMode && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Commentaire
                  </p>
                  <p className="text-sm text-slate-700">
                    {detailRecord.checkInComment}
                  </p>
                </div>
              )}

              {/* Edit form */}
              {editMode ? (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Statut final
                    </label>
                    <select
                      value={editFinalStatus}
                      onChange={(e) => setEditFinalStatus(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                    >
                      <option value="PRESENT">Présent</option>
                      <option value="ABSENT">Absent</option>
                      <option value="PERMISSION">Permission</option>
                      <option value="MISSION">Mission</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Commentaire
                    </label>
                    <textarea
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                      rows={3}
                      placeholder="Motif de la correction..."
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 resize-none placeholder:text-slate-400"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditMode(false)}
                      className="flex-1 h-10 text-sm font-medium text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleEditSave}
                      disabled={submitting}
                      className="flex-1 h-10 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {submitting ? "Enregistrement..." : "Enregistrer"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="w-full h-10 inline-flex items-center justify-center gap-2 text-sm font-medium border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Corriger ce pointage
                </button>
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
  color: "green" | "red" | "orange" | "purple";
}) {
  const colorMap = {
    green: { bg: "bg-emerald-50", text: "text-emerald-600", value: "text-emerald-700" },
    red: { bg: "bg-red-50", text: "text-red-600", value: "text-red-700" },
    orange: { bg: "bg-amber-50", text: "text-amber-600", value: "text-amber-700" },
    purple: { bg: "bg-violet-50", text: "text-violet-600", value: "text-violet-700" },
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
          <p className={cn("text-2xl font-bold tracking-tight", c.value)}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  badge,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  badge?: string | null;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-sm font-medium",
            highlight ? "text-blue-600" : "text-slate-800"
          )}
        >
          {value}
        </span>
        {badge && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              statusColors[badge] ?? "bg-slate-100 text-slate-500"
            )}
          >
            {statusLabels[badge] ?? badge}
          </span>
        )}
      </div>
    </div>
  );
}
