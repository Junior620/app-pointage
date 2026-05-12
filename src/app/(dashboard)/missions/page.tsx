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
  Trash2,
  Archive,
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
    structure?: string;
  };
  startDate: string;
  endDate: string;
  reason: string;
  location: string | null;
  transport: string | null;
  lodging: string | null;
  expenses: string | null;
  originStructure: string | null;
  hostStructure: string | null;
  daysCompleted: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const missionSchema = z.object({
  employeeId: z.string().min(1, "L'employé est requis"),
  startDate: z.string().min(1, "La date de début est requise"),
  endDate: z.string().min(1, "La date de fin est requise"),
  reason: z.string().min(1, "Le motif est requis"),
  location: z.string().optional(),
  hostStructure: z.enum(["SCPB", "AFREXIA"]).optional(),
  transport: z.string().optional(),
  lodging: z.string().optional(),
  expenses: z.string().optional(),
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
  const [detailMission, setDetailMission] = useState<Mission | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    startDate: "",
    endDate: "",
    reason: "",
    location: "",
    hostStructure: "",
    transport: "",
    lodging: "",
    expenses: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingDays, setEditingDays] = useState<number | null>(null);
  const [savingDays, setSavingDays] = useState(false);
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
    setForm({
      employeeId: "",
      startDate: "",
      endDate: "",
      reason: "",
      location: "",
      hostStructure: "",
      transport: "",
      lodging: "",
      expenses: "",
    });
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

  const deleteMission = async (id: string) => {
    if (
      !window.confirm(
        "Annuler cette mission ? Elle restera visible dans l’historique (marquée « annulée ») mais ne sera plus prise en compte pour le pointage."
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/missions/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetailMission(null);
        fetchMissions();
      } else {
        window.alert(typeof json.error === "string" ? json.error : "Annulation impossible.");
      }
    } catch (e) {
      console.error(e);
      window.alert("Erreur réseau.");
    } finally {
      setDeletingId(null);
    }
  };

  const updateDaysCompleted = async (id: string, days: number) => {
    setSavingDays(true);
    try {
      const res = await fetch(`/api/missions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysCompleted: days }),
      });
      if (res.ok) {
        const json = await res.json();
        setMissions((prev) => prev.map((m) => (m.id === id ? { ...m, daysCompleted: days } : m)));
        if (detailMission?.id === id) {
          setDetailMission({ ...detailMission, daysCompleted: days });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingDays(false);
      setEditingDays(null);
    }
  };

  const fetchAllMissions = async (): Promise<Mission[]> => {
    const params = new URLSearchParams({
      page: "1",
      limit: "10000",
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { startDate: dateFrom }),
      ...(dateTo && { endDate: dateTo }),
      ...(serviceFilter && { service: serviceFilter }),
      ...(employeeFilter && { employeeId: employeeFilter }),
    });
    const res = await fetch(`/api/missions?${params}`);
    const json = await res.json();
    return json.data ?? [];
  };

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const all = await fetchAllMissions();
    const workbook = new ExcelJS.Workbook();

    const addSheet = (name: string, data: Mission[]) => {
      const ws = workbook.addWorksheet(name);
      ws.columns = [
        { header: "Employé", key: "employee", width: 22 },
        { header: "Matricule", key: "matricule", width: 16 },
        { header: "Service", key: "service", width: 12 },
        { header: "Origine", key: "origin", width: 10 },
        { header: "Accueil", key: "host", width: 10 },
        { header: "Début", key: "start", width: 12 },
        { header: "Fin", key: "end", width: 12 },
        { header: "Durée (j)", key: "duration", width: 10 },
        { header: "Jours effectués", key: "completed", width: 14 },
        { header: "Lieu", key: "location", width: 18 },
        { header: "Motif", key: "reason", width: 30 },
        { header: "Statut", key: "status", width: 12 },
      ];

      ws.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "2563EB" } };
        cell.alignment = { horizontal: "center" };
      });

      data.forEach((m) => {
        ws.addRow({
          employee: `${m.employee.lastName} ${m.employee.firstName}`,
          matricule: m.employee.matricule,
          service: m.employee.service ?? "—",
          origin: m.originStructure ?? "—",
          host: m.hostStructure ?? "—",
          start: new Date(m.startDate).toLocaleDateString("fr-FR"),
          end: new Date(m.endDate).toLocaleDateString("fr-FR"),
          duration: getDurationDays(m.startDate, m.endDate),
          completed: m.daysCompleted,
          location: m.location ?? "—",
          reason: m.reason,
          status: `${statusBadge[m.status]?.label ?? m.status}${m.cancelledAt ? " — annulée" : ""}`,
        });
      });
    };

    addSheet("Toutes les missions", all);

    const approved = all.filter((m) => m.status === "APPROVED" && !m.cancelledAt);
    if (approved.length > 0) {
      const wsPaie = workbook.addWorksheet("Récapitulatif paie");
      wsPaie.columns = [
        { header: "Employé", key: "employee", width: 22 },
        { header: "Matricule", key: "matricule", width: 16 },
        { header: "Structure origine", key: "origin", width: 16 },
        { header: "Structure accueil", key: "host", width: 16 },
        { header: "Durée totale (j)", key: "duration", width: 14 },
        { header: "Jours effectués", key: "completed", width: 14 },
        { header: "Nb missions", key: "count", width: 12 },
      ];

      wsPaie.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "059669" } };
        cell.alignment = { horizontal: "center" };
      });

      const byEmployee = new Map<string, { emp: Mission["employee"]; origin: string; host: string; duration: number; completed: number; count: number }>();
      approved.forEach((m) => {
        const key = `${m.employee.id}-${m.originStructure ?? ""}-${m.hostStructure ?? ""}`;
        const existing = byEmployee.get(key);
        if (existing) {
          existing.duration += getDurationDays(m.startDate, m.endDate);
          existing.completed += m.daysCompleted;
          existing.count++;
        } else {
          byEmployee.set(key, {
            emp: m.employee,
            origin: m.originStructure ?? "—",
            host: m.hostStructure ?? "—",
            duration: getDurationDays(m.startDate, m.endDate),
            completed: m.daysCompleted,
            count: 1,
          });
        }
      });

      byEmployee.forEach((v) => {
        wsPaie.addRow({
          employee: `${v.emp.lastName} ${v.emp.firstName}`,
          matricule: v.emp.matricule,
          origin: v.origin,
          host: v.host,
          duration: v.duration,
          completed: v.completed,
          count: v.count,
        });
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `missions_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const all = await fetchAllMissions();
    const doc = new jsPDF({ orientation: "landscape" });
    const now = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    doc.setFontSize(16);
    doc.text("Rapport des missions", 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Généré le ${now} — ${all.length} mission(s)`, 14, 25);
    doc.setTextColor(0);

    const pending = all.filter((m) => m.status === "PENDING" && !m.cancelledAt).length;
    const approved = all.filter((m) => m.status === "APPROVED" && !m.cancelledAt).length;
    const rejected = all.filter((m) => m.status === "REJECTED" && !m.cancelledAt).length;
    doc.setFontSize(8);
    doc.text(`En attente: ${pending}  |  Approuvées: ${approved}  |  Refusées: ${rejected}`, 14, 31);

    autoTable(doc, {
      startY: 35,
      head: [["Employé", "Origine", "Accueil", "Début", "Fin", "Durée", "Eff.", "Lieu", "Statut"]],
      body: all.map((m) => [
        `${m.employee.lastName} ${m.employee.firstName}`,
        m.originStructure ?? "—",
        m.hostStructure ?? "—",
        new Date(m.startDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        new Date(m.endDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
        `${getDurationDays(m.startDate, m.endDate)}j`,
        `${m.daysCompleted}j`,
        m.location ?? "—",
        `${statusBadge[m.status]?.label ?? m.status}${m.cancelledAt ? " (annulée)" : ""}`,
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    const approvedMissions = all.filter((m) => m.status === "APPROVED" && !m.cancelledAt);
    if (approvedMissions.length > 0) {
      doc.addPage("a4", "landscape");
      doc.setFontSize(14);
      doc.text("Récapitulatif paie — Missions approuvées", 14, 18);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`${approvedMissions.length} mission(s) approuvée(s)`, 14, 25);
      doc.setTextColor(0);

      const byEmp = new Map<string, { name: string; matricule: string; origin: string; host: string; duration: number; completed: number; count: number }>();
      approvedMissions.forEach((m) => {
        const key = `${m.employee.id}-${m.originStructure ?? ""}-${m.hostStructure ?? ""}`;
        const ex = byEmp.get(key);
        if (ex) {
          ex.duration += getDurationDays(m.startDate, m.endDate);
          ex.completed += m.daysCompleted;
          ex.count++;
        } else {
          byEmp.set(key, {
            name: `${m.employee.lastName} ${m.employee.firstName}`,
            matricule: m.employee.matricule,
            origin: m.originStructure ?? "—",
            host: m.hostStructure ?? "—",
            duration: getDurationDays(m.startDate, m.endDate),
            completed: m.daysCompleted,
            count: 1,
          });
        }
      });

      autoTable(doc, {
        startY: 30,
        head: [["Employé", "Matricule", "Origine", "Accueil", "Durée totale", "Jours eff.", "Nb missions"]],
        body: Array.from(byEmp.values()).map((v) => [
          v.name, v.matricule, v.origin, v.host, `${v.duration}j`, `${v.completed}j`, v.count,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
    }

    doc.save(`missions_${new Date().toISOString().slice(0, 10)}.pdf`);
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
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={exportPdf}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            PDF
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Briefcase} label="Missions totales" value={stats.total} color="slate" />
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
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Origine</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Accueil</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Début</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Fin</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Durée</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Jours eff.</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Lieu</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={11} className="px-6 py-4">
                      <div className="h-5 bg-slate-100 rounded-lg animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : missions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-16 text-center">
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
                  const isOff = Boolean(mission.cancelledAt);
                  return (
                    <tr
                      key={mission.id}
                      onClick={() => setDetailMission(mission)}
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
                      {/* Origine */}
                      <td className="px-6 py-4">
                        {mission.originStructure ? (
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", mission.originStructure === "AFREXIA" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700")}>
                            {mission.originStructure}
                          </span>
                        ) : "—"}
                      </td>
                      {/* Accueil */}
                      <td className="px-6 py-4">
                        {mission.hostStructure ? (
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", mission.hostStructure === "AFREXIA" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700")}>
                            {mission.hostStructure}
                          </span>
                        ) : "—"}
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
                      {/* Jours effectués */}
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium",
                          mission.daysCompleted > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        )}>
                          {mission.daysCompleted} / {getDurationDays(mission.startDate, mission.endDate)}
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
                            onClick={() => setDetailMission(mission)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                            title="Voir détail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {mission.status === "PENDING" && !isOff && (
                            <>
                              <button
                                onClick={() => updateStatus(mission.id, "APPROVED")}
                                disabled={actioningId === mission.id || deletingId === mission.id}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors disabled:opacity-50"
                                title="Approuver"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => updateStatus(mission.id, "REJECTED")}
                                disabled={actioningId === mission.id || deletingId === mission.id}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                                title="Refuser"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {!isOff && (
                            <button
                              onClick={() => deleteMission(mission.id)}
                              disabled={deletingId === mission.id || actioningId === mission.id}
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
                  sur <span className="font-medium text-slate-700">{total}</span> mission
                  {total > 1 ? "s" : ""}
                  {totalPages > 1 && (
                    <span className="text-slate-400"> — page {page} / {totalPages}</span>
                  )}
                </>
              ) : (
                "Aucune mission sur cette sélection"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Structure d&apos;accueil</label>
                <select
                  value={form.hostStructure}
                  onChange={(e) => setForm({ ...form, hostStructure: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                >
                  <option value="">Aucune (mission externe)</option>
                  <option value="SCPB">SCPB</option>
                  <option value="AFREXIA">AFREXIA</option>
                </select>
                <p className="text-xs text-slate-400 mt-1">Structure dans laquelle l&apos;employé effectuera la mission.</p>
              </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Transport</label>
                  <input
                    value={form.transport}
                    onChange={(e) => setForm({ ...form, transport: e.target.value })}
                    placeholder="Ex : Véhicule société, avion..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hébergement</label>
                  <input
                    value={form.lodging}
                    onChange={(e) => setForm({ ...form, lodging: e.target.value })}
                    placeholder="Ex : Hôtel à charge SCPB..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Frais</label>
                  <input
                    value={form.expenses}
                    onChange={(e) => setForm({ ...form, expenses: e.target.value })}
                    placeholder="Ex : Per diem selon barème..."
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 placeholder:text-slate-400"
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
                <DetailRow label="Durée prévue" value={formatDuration(detailMission.startDate, detailMission.endDate)} />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Jours effectués</span>
                  {detailMission.cancelledAt ? (
                    <span className="font-medium text-slate-600">
                      {detailMission.daysCompleted} / {getDurationDays(detailMission.startDate, detailMission.endDate)} jours
                    </span>
                  ) : editingDays !== null ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={getDurationDays(detailMission.startDate, detailMission.endDate)}
                        value={editingDays}
                        onChange={(e) => setEditingDays(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-sm text-center bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => updateDaysCompleted(detailMission.id, editingDays)}
                        disabled={savingDays}
                        className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingDays ? "…" : "OK"}
                      </button>
                      <button
                        onClick={() => setEditingDays(null)}
                        className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDays(detailMission.daysCompleted)}
                      className="font-medium text-slate-800 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      {detailMission.daysCompleted} / {getDurationDays(detailMission.startDate, detailMission.endDate)} jours
                    </button>
                  )}
                </div>
                {detailMission.daysCompleted > 0 && (
                  <div className="mt-1">
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (detailMission.daysCompleted / getDurationDays(detailMission.startDate, detailMission.endDate)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {detailMission.originStructure && (
                  <DetailRow label="Structure d'origine" value={detailMission.originStructure} />
                )}
                {detailMission.hostStructure && (
                  <DetailRow label="Structure d'accueil" value={detailMission.hostStructure} />
                )}
                {detailMission.transport && (
                  <DetailRow label="Transport" value={detailMission.transport} />
                )}
                {detailMission.lodging && (
                  <DetailRow label="Hébergement" value={detailMission.lodging} />
                )}
                {detailMission.expenses && (
                  <DetailRow label="Frais" value={detailMission.expenses} />
                )}
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
                {detailMission.cancelledAt && (
                  <div className="flex justify-between text-sm border-t border-slate-100 pt-2 mt-2">
                    <span className="text-slate-600 font-medium">Annulation</span>
                    <span className="text-slate-700 text-right">
                      {new Date(detailMission.cancelledAt).toLocaleString("fr-FR")}
                      {detailMission.cancelledBy ? (
                        <span className="block text-xs text-slate-500">par {detailMission.cancelledBy}</span>
                      ) : null}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                {detailMission.status === "PENDING" && !detailMission.cancelledAt && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => updateStatus(detailMission.id, "APPROVED")}
                      disabled={actioningId === detailMission.id || deletingId === detailMission.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      Approuver
                    </button>
                    <button
                      onClick={() => updateStatus(detailMission.id, "REJECTED")}
                      disabled={actioningId === detailMission.id || deletingId === detailMission.id}
                      className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Refuser
                    </button>
                  </div>
                )}
                {detailMission.status === "APPROVED" && !detailMission.cancelledAt && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={async () => {
                        const docxMod = (await import("docx")) as any;
                        const {
                          Document,
                          Packer,
                          Paragraph,
                          TextRun,
                          AlignmentType,
                          Table,
                          TableRow,
                          TableCell,
                          WidthType,
                          BorderStyle,
                        } = docxMod;

                        const m = detailMission;
                        const today = new Date();
                        const fmt = (d: string) =>
                          new Date(d).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          });

                        const todayStr = today.toLocaleDateString("fr-FR");

                        const clampText = (text: string | null | undefined, maxLines = 5) => {
                          const safe = (text ?? "-").toString();
                          const charsPerLine = 92; // approximation pour 10pt en A4
                          const maxChars = maxLines * charsPerLine;
                          if (safe.length <= maxChars) return safe;
                          return safe.slice(0, Math.max(0, maxChars - 3)).trimEnd() + "...";
                        };

                        const missionnaireTable = new Table({
                          width: { size: 100, type: WidthType.PERCENTAGE },
                          rows: [
                            new TableRow({
                              children: [
                                new TableCell({
                                  width: { size: 50, type: WidthType.PERCENTAGE },
                                  children: [
                                    new Paragraph({
                                      children: [
                                        new TextRun({
                                          bold: true,
                                          text: "Nom et prénom : ",
                                        }),
                                        new TextRun({
                                          text: `${m.employee.lastName} ${m.employee.firstName}`,
                                        }),
                                      ],
                                    }),
                                  ],
                                }),
                                new TableCell({
                                  width: { size: 50, type: WidthType.PERCENTAGE },
                                  children: [
                                    new Paragraph({
                                      children: [
                                        new TextRun({ bold: true, text: "Matricule : " }),
                                        new TextRun({ text: m.employee.matricule }),
                                      ],
                                    }),
                                  ],
                                }),
                              ],
                            }),
                            new TableRow({
                              children: [
                                new TableCell({
                                  width: { size: 50, type: WidthType.PERCENTAGE },
                                  children: [
                                    new Paragraph({
                                      children: [
                                        new TextRun({ bold: true, text: "Service : " }),
                                        new TextRun({ text: m.employee.service ?? "-" }),
                                      ],
                                    }),
                                  ],
                                }),
                                new TableCell({
                                  width: { size: 50, type: WidthType.PERCENTAGE },
                                  children: [
                                    new Paragraph({
                                      children: [
                                        new TextRun({ bold: true, text: "Structure d'origine : " }),
                                        new TextRun({ text: m.originStructure ?? "-" }),
                                      ],
                                    }),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        });

                        const doc = new Document({
                          sections: [
                            {
                              properties: {
                                page: {
                                  margin: { top: 720, bottom: 720, left: 720, right: 720 },
                                },
                              },
                              children: [
                                new Paragraph({
                                  alignment: AlignmentType.CENTER,
                                  text: "ORDRE DE MISSION",
                                  heading: docxMod.HeadingLevel.HEADING_1,
                                }),
                                new Paragraph({
                                  text: `Date d'émission : ${todayStr}`,
                                  alignment: AlignmentType.LEFT,
                                }),

                                new Paragraph({ text: "MISSIONNAIRE", heading: docxMod.HeadingLevel.HEADING_2 }),
                                missionnaireTable,

                                new Paragraph({ text: "MISSION", heading: docxMod.HeadingLevel.HEADING_2 }),
                                new Paragraph({
                                  children: [
                                    new TextRun({ bold: true, text: "Objet : " }),
                                    new TextRun({ text: clampText(m.reason, 5) }),
                                  ],
                                }),
                                new Paragraph({ text: `Lieu : ${m.location ?? "-"}` }),
                                new Paragraph({ text: `Structure d'accueil : ${m.hostStructure ?? "-"}` }),
                                new Paragraph({
                                  text: `Période : du ${fmt(m.startDate)} au ${fmt(m.endDate)}`,
                                }),
                                new Paragraph({
                                  text: `Durée prévue : ${formatDuration(m.startDate, m.endDate)}`,
                                }),
                                new Paragraph({
                                  text: `Jours effectués (suivi) : ${m.daysCompleted} jour(s)`,
                                }),

                                new Paragraph({ text: "MOYENS", heading: docxMod.HeadingLevel.HEADING_2 }),
                                new Paragraph({ text: `Transport : ${m.transport ?? "-"}` }),
                                new Paragraph({
                                  text: `Hébergement : ${clampText(m.lodging, 5)}`,
                                }),
                                new Paragraph({
                                  text: `Frais : ${clampText(m.expenses, 5)}`,
                                }),

                                new Paragraph({ text: "VALIDATION", heading: docxMod.HeadingLevel.HEADING_2 }),
                                new Paragraph({
                                  text: "Le présent ordre de mission est délivré pour servir et valoir ce que de droit.",
                                }),
                                new Paragraph({
                                  text: `Fait à ____________________, le ${todayStr}`,
                                  spacing: { before: 240 },
                                }),
                                new Paragraph({ text: "Signature et cachet", alignment: AlignmentType.RIGHT }),
                              ],
                            },
                          ],
                        });

                        const blob = await Packer.toBlob(doc);
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `ordre_mission_${m.employee.matricule}_${m.id.slice(0, 8)}.docx`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1500);
                      }}
                      className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Télécharger l'ordre de mission (Word)
                    </button>

                    <button
                      onClick={async () => {
                        const { jsPDF } = await import("jspdf");
                        const doc = new jsPDF();
                        const m = detailMission;
                        const today = new Date();
                        const fmt = (d: string) =>
                          new Date(d).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                          });

                        doc.setFontSize(14);
                        doc.text("ORDRE DE MISSION", 105, 15, { align: "center" });

                        doc.setFontSize(10);
                        doc.text(
                          `Date d'émission : ${today.toLocaleDateString("fr-FR")}`,
                          14,
                          25
                        );

                        doc.setFontSize(11);
                        doc.text("MISSIONNAIRE", 14, 35);
                        doc.setFontSize(10);
                        doc.text(
                          `Nom et prénom : ${m.employee.lastName} ${m.employee.firstName}`,
                          14,
                          42
                        );
                        doc.text(`Matricule : ${m.employee.matricule}`, 14, 48);
                        doc.text(`Service : ${m.employee.service ?? "-"}`, 14, 54);
                        doc.text(
                          `Structure d'origine : ${m.originStructure ?? "-"}`,
                          14,
                          60
                        );

                        const maxWidth = 180;
                        const maxLines = 5;
                        const lineHeight = 4;

                        const splitClamped = (text: string) => {
                          const lines = doc.splitTextToSize(text, maxWidth) as string[];
                          if (lines.length <= maxLines) return lines;
                          const sliced = lines.slice(0, maxLines);
                          sliced[maxLines - 1] =
                            (sliced[maxLines - 1] || "").replace(/\.\.\.$/, "") + "...";
                          return sliced;
                        };

                        let y = 72;
                        doc.text("MISSION", 14, y);
                        y += 7;
                        doc.setFontSize(10);

                        doc.text(splitClamped(`Objet : ${m.reason}`), 14, y);
                        y += maxLines * lineHeight;
                        doc.text(`Lieu : ${m.location ?? "-"}`, 14, y);
                        y += lineHeight;
                        doc.text(
                          `Structure d'accueil : ${m.hostStructure ?? "-"}`,
                          14,
                          y
                        );
                        y += lineHeight;
                        doc.text(
                          `Période : du ${fmt(m.startDate)} au ${fmt(m.endDate)}`,
                          14,
                          y
                        );
                        y += lineHeight;
                        doc.text(
                          `Durée prévue : ${formatDuration(m.startDate, m.endDate)}`,
                          14,
                          y
                        );
                        y += lineHeight;
                        doc.text(
                          `Jours effectués (suivi) : ${m.daysCompleted} jour(s)`,
                          14,
                          y
                        );
                        y += lineHeight + 2;

                        doc.setFontSize(11);
                        doc.text("MOYENS", 14, y);
                        y += 7;
                        doc.setFontSize(10);

                        doc.text(`Transport : ${m.transport ?? "-"}`, 14, y);
                        y += lineHeight;

                        doc.text(splitClamped(`Hébergement : ${m.lodging ?? "-"}`), 14, y);
                        y += maxLines * lineHeight;
                        doc.text(splitClamped(`Frais : ${m.expenses ?? "-"}`), 14, y);
                        y += maxLines * lineHeight;

                        doc.setFontSize(11);
                        doc.text("VALIDATION", 14, y);
                        y += 7;
                        doc.setFontSize(10);
                        doc.text(
                          "Le présent ordre de mission est délivré pour servir et valoir ce que de droit.",
                          14,
                          y,
                          { maxWidth: 180 }
                        );
                        y += 12;
                        doc.text(
                          `Fait à ____________________, le ${today.toLocaleDateString("fr-FR")}`,
                          14,
                          y
                        );
                        y += 20;
                        doc.text("Signature et cachet", 150, y);

                        doc.save(
                          `ordre_mission_${m.employee.matricule}_${m.id.slice(0, 8)}.pdf`
                        );
                      }}
                      className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Télécharger l'ordre de mission (PDF)
                    </button>
                  </div>
                )}
                {!detailMission.cancelledAt && (
                  <button
                    type="button"
                    onClick={() => deleteMission(detailMission.id)}
                    disabled={deletingId === detailMission.id || actioningId === detailMission.id}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-slate-700 bg-slate-100 hover:bg-red-50 hover:text-red-700 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {deletingId === detailMission.id ? "Annulation…" : "Annuler (conserver l’historique)"}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
