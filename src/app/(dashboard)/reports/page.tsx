"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getReportPresetRange, getLast30DaysRange, toInputDateLocal } from "@/lib/period-range";
import {
  FileSpreadsheet,
  FileText,
  Search,
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  AlertTriangle,
  UserX,
  Trophy,
  ChevronDown,
  ChevronUp,
  CalendarDays,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ReportRow {
  id: string;
  matricule: string;
  name: string;
  service: string;
  structure: string;
  totalDays: number;
  presents: number;
  absents: number;
  retards: number;
  missions: number;
  permissions: number;
  totalHours: number;
  overtimeHours: number;
  punctualityRate: number;
}

interface DayData {
  date: string;
  label: string;
  presenceRate: number;
  absences: number;
  retards: number;
  total: number;
}

interface ServiceData {
  service: string;
  presents: number;
  absences: number;
  retards: number;
  heures: number;
}

interface OvertimeByServiceData {
  service: string;
  overtimeHours: number;
}

interface OvertimeIssueRow {
  id: string;
  matricule: string;
  name: string;
  service: string;
  structure: string;
  requests: number;
  overtimeHours: number;
}

interface Summary {
  totalEmployees: number;
  presenceRate: number;
  totalRetards: number;
  totalAbsences: number;
  totalHours: number;
  totalOvertimeHours: number;
  avgPunctuality: number;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    blue: "bg-blue-50 text-blue-600",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const SERVICE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [service, setService] = useState("");
  const [structure, setStructure] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byDay, setByDay] = useState<DayData[]>([]);
  const [byService, setByService] = useState<ServiceData[]>([]);
  const [topPresents, setTopPresents] = useState<ReportRow[]>([]);
  const [topRetards, setTopRetards] = useState<ReportRow[]>([]);
  const [topOvertime, setTopOvertime] = useState<ReportRow[]>([]);
  const [topOvertimeIssues, setTopOvertimeIssues] = useState<OvertimeIssueRow[]>([]);
  const [overtimeByService, setOvertimeByService] = useState<OvertimeByServiceData[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);
  const [sortField, setSortField] = useState<keyof ReportRow>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [employeeSuggestions, setEmployeeSuggestions] = useState<{ id: string; firstName: string; lastName: string; matricule: string; service: string; label: string }[]>([]);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const employeeInputRef = useRef<HTMLDivElement>(null);

  // Charger la liste des services au montage pour le filtre
  useEffect(() => {
    fetch("/api/reports/services")
      .then((res) => res.json())
      .then((json) => setServices(json.services ?? []))
      .catch(() => {});
  }, []);

  // Suggestions employés (autocomplete) avec debounce
  useEffect(() => {
    const q = employeeSearch.trim();
    if (q.length < 2) {
      setEmployeeSuggestions([]);
      setShowEmployeeDropdown(false);
      return;
    }
    const t = setTimeout(() => {
      setLoadingSuggestions(true);
      const params = new URLSearchParams({ q, limit: "15", ...(service.trim() && { service: service.trim() }) });
      fetch(`/api/reports/employees?${params}`)
        .then((res) => res.json())
        .then((json) => {
          setEmployeeSuggestions(json.data ?? []);
          setShowEmployeeDropdown(true);
        })
        .catch(() => setEmployeeSuggestions([]))
        .finally(() => setLoadingSuggestions(false));
    }, 300);
    return () => clearTimeout(t);
  }, [employeeSearch, service]);

  // Clic extérieur pour fermer le dropdown employé
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (employeeInputRef.current && !employeeInputRef.current.contains(e.target as Node)) {
        setShowEmployeeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const applyPeriodPreset = useCallback((kind: "30d" | "month" | "quarter" | "year") => {
    if (kind === "30d") {
      const { from, to } = getLast30DaysRange();
      setDateFrom(toInputDateLocal(from));
      setDateTo(toInputDateLocal(to));
      return;
    }
    const { from, to } = getReportPresetRange(kind);
    setDateFrom(toInputDateLocal(from));
    setDateTo(toInputDateLocal(to));
  }, []);

  const generate = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const searchTrimmed = employeeSearch.trim();
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        ...(service.trim() && { service: service.trim() }),
        ...(structure && { structure }),
        ...(searchTrimmed && { search: searchTrimmed }),
      });
      const res = await fetch(`/api/reports?${params}`);
      const json = await res.json();
      setRows(json.data ?? []);
      setSummary(json.summary ?? null);
      setByDay(json.charts?.byDay ?? []);
      setByService(json.charts?.byService ?? []);
      setTopPresents(json.rankings?.topPresents ?? []);
      setTopRetards(json.rankings?.topRetards ?? []);
      setTopOvertime(json.rankings?.topOvertime ?? []);
      setTopOvertimeIssues(json.rankings?.topOvertimeIssues ?? []);
      setOvertimeByService(json.overtimeByService ?? []);
      setServices(json.services ?? []);
      setGenerated(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, service, structure, employeeSearch]);

  const handleSort = (field: keyof ReportRow) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };

  const sortedRows = [...rows].sort((a, b) => {
    const va = a[sortField];
    const vb = b[sortField];
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const exportExcel = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    const cols = [
      { header: "Matricule", key: "matricule", width: 18 },
      { header: "Nom", key: "name", width: 25 },
      { header: "Structure", key: "structure", width: 12 },
      { header: "Service", key: "service", width: 12 },
      { header: "Jours", key: "totalDays", width: 10 },
      { header: "Présents", key: "presents", width: 12 },
      { header: "Absents", key: "absents", width: 12 },
      { header: "Retards", key: "retards", width: 12 },
      { header: "Missions", key: "missions", width: 12 },
      { header: "Autorisations d'absence", key: "permissions", width: 18 },
      { header: "Heures", key: "totalHours", width: 12 },
      { header: "Heures sup", key: "overtimeHours", width: 12 },
      { header: "Ponctualité (%)", key: "punctualityRate", width: 16 },
    ];

    const styleHeader = (sheet: import("exceljs").Worksheet) => {
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    };

    const allSheet = workbook.addWorksheet("Tous");
    allSheet.columns = cols;
    styleHeader(allSheet);
    rows.forEach((row) => allSheet.addRow(row));
    if (summary) {
      allSheet.addRow({});
      allSheet.addRow({ matricule: "RÉSUMÉ" });
      allSheet.addRow({ matricule: "Taux présence", name: `${summary.presenceRate}%` });
      allSheet.addRow({ matricule: "Retards totaux", name: String(summary.totalRetards) });
      allSheet.addRow({ matricule: "Absences totales", name: String(summary.totalAbsences) });
      allSheet.addRow({ matricule: "Heures totales", name: `${summary.totalHours}h` });
      allSheet.addRow({ matricule: "Heures sup totales", name: `${summary.totalOvertimeHours}h` });
    }

    for (const struct of ["SCPB", "AFREXIA"] as const) {
      const structRows = rows.filter((r) => r.structure === struct);
      if (structRows.length === 0) continue;
      const sheet = workbook.addWorksheet(struct);
      sheet.columns = cols;
      styleHeader(sheet);
      structRows.forEach((row) => sheet.addRow(row));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_${dateFrom}_${dateTo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`Rapport de pointage`, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Période : ${dateFrom} → ${dateTo}`, 14, 26);

    if (summary) {
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text(
        `Présence : ${summary.presenceRate}%  |  Retards : ${summary.totalRetards}  |  Absences : ${summary.totalAbsences}  |  Heures : ${summary.totalHours}h`,
        14,
        34
      );
    }

    autoTable(doc, {
      startY: 42,
      head: [["Matricule", "Nom", "Structure", "Service", "Jours", "Présents", "Absents", "Retards", "Missions", "Heures", "H. sup", "Ponctualité"]],
      body: rows.map((r) => [
        r.matricule,
        r.name,
        r.structure,
        r.service,
        r.totalDays,
        r.presents,
        r.absents,
        r.retards,
        r.missions,
        `${r.totalHours}h`,
        `${r.overtimeHours}h`,
        `${r.punctualityRate}%`,
      ]),
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8 },
    });

    const scpbRows = rows.filter((r) => r.structure === "SCPB");
    const afrexiaRows = rows.filter((r) => r.structure === "AFREXIA");
    for (const [label, structRows] of [["SCPB", scpbRows], ["AFREXIA", afrexiaRows]] as const) {
      if (structRows.length === 0) continue;
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(`Récapitulatif — ${label}`, 14, 18);
      doc.setFontSize(10);
      const totalH = structRows.reduce((s, r) => s + r.totalHours, 0);
      const totalOt = structRows.reduce((s, r) => s + r.overtimeHours, 0);
      const totalAbs = structRows.reduce((s, r) => s + r.absents, 0);
      const totalRet = structRows.reduce((s, r) => s + r.retards, 0);
      doc.text(`Employés: ${structRows.length} | Heures: ${totalH}h | H. sup: ${totalOt}h | Absences: ${totalAbs} | Retards: ${totalRet}`, 14, 26);
      autoTable(doc, {
        startY: 34,
        head: [["Matricule", "Nom", "Service", "Présents", "Absents", "Retards", "Heures", "H. sup", "Ponctualité"]],
        body: structRows.map((r) => [r.matricule, r.name, r.service, r.presents, r.absents, r.retards, `${r.totalHours}h`, `${r.overtimeHours}h`, `${r.punctualityRate}%`]),
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 },
      });
    }

    doc.save(`rapport_${dateFrom}_${dateTo}.pdf`);
  };

  const SortIcon = ({ field }: { field: keyof ReportRow }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 text-slate-300 ml-1 inline" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-blue-600 ml-1 inline" />
      : <ChevronDown className="w-3 h-3 text-blue-600 ml-1 inline" />;
  };

  const periodLabel = dateFrom && dateTo
    ? `${new Date(dateFrom).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} → ${new Date(dateTo).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
    : "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rapports</h1>
          <p className="text-sm text-slate-500 mt-1">Analyses et indicateurs de pointage</p>
        </div>
        {generated && (
          <div className="flex items-center gap-2">
            <button
              onClick={exportExcel}
              className="inline-flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </button>
            <button
              onClick={exportPdf}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-700 bg-red-50 rounded-xl hover:bg-red-100 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date début</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date fin</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Service</label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Tous les services</option>
                {services.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Structure</label>
              <select
                value={structure}
                onChange={(e) => setStructure(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Toutes</option>
                <option value="SCPB">SCPB</option>
                <option value="AFREXIA">AFREXIA</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employé</label>
              <div className="relative" ref={employeeInputRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  onFocus={() => employeeSearch.trim().length >= 2 && employeeSuggestions.length > 0 && setShowEmployeeDropdown(true)}
                  placeholder="Rechercher (nom, prénom, matricule)…"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white placeholder:text-slate-400"
                />
                {loadingSuggestions && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>
                )}
                {showEmployeeDropdown && employeeSuggestions.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 mt-1 py-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-auto">
                    {employeeSuggestions.map((emp) => (
                      <li key={emp.id}>
                        <button
                          type="button"
                          className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          onClick={() => {
                            setEmployeeSearch(`${emp.lastName} ${emp.firstName}`);
                            setShowEmployeeDropdown(false);
                            setEmployeeSuggestions([]);
                          }}
                        >
                          <span className="font-medium">{emp.lastName} {emp.firstName}</span>
                          {emp.service && <span className="text-slate-400 text-xs">— {emp.service}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={generate}
            disabled={loading || !dateFrom || !dateTo}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium whitespace-nowrap shadow-sm"
          >
            <BarChart3 className="w-4 h-4" />
            {loading ? "Génération…" : "Générer"}
          </button>
        </div>
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600 shrink-0">Période rapide</span>
          <button
            type="button"
            onClick={() => applyPeriodPreset("30d")}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            30 derniers jours
          </button>
          <button
            type="button"
            onClick={() => applyPeriodPreset("month")}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Mois en cours
          </button>
          <button
            type="button"
            onClick={() => applyPeriodPreset("quarter")}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Trimestre en cours
          </button>
          <button
            type="button"
            onClick={() => applyPeriodPreset("year")}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
          >
            Année en cours
          </button>
          <span className="text-xs text-slate-400 ml-1">
            Remplit les dates ; filtrez un employé puis <strong>Générer</strong>.
          </span>
        </div>
      </div>

      {/* État initial */}
      {!generated && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Sélectionnez une période</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Choisissez une date de début et de fin puis cliquez sur <strong>Générer</strong> pour afficher les rapports et analyses.
          </p>
        </div>
      )}

      {/* Résultats */}
      {generated && (
        <>
          {/* Période */}
          {periodLabel && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CalendarDays className="w-4 h-4" />
              Période analysée : <span className="font-medium text-slate-700">{periodLabel}</span>
              {summary && <span className="text-slate-400">— {summary.totalEmployees} employé{summary.totalEmployees > 1 ? "s" : ""}</span>}
            </div>
          )}

          {/* KPI */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={TrendingUp} label="Taux de présence" value={`${summary.presenceRate}%`} color="emerald" />
              <KpiCard icon={AlertTriangle} label="Retards" value={summary.totalRetards} sub="sur la période" color="amber" />
              <KpiCard icon={UserX} label="Absences" value={summary.totalAbsences} sub="sur la période" color="red" />
              <KpiCard icon={Clock} label="Heures travaillées" value={`${summary.totalHours}h`} color="blue" />
            </div>
          )}

          {/* Graphiques */}
          {(byDay.length > 0 || byService.length > 0 || overtimeByService.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Présence par jour */}
              {byDay.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Taux de présence par jour
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        formatter={(value: number) => [`${value}%`, "Présence"]}
                      />
                      <Line type="monotone" dataKey="presenceRate" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Retards par jour */}
              {byDay.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Retards par jour
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <Tooltip
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        formatter={(value: number) => [value, "Retards"]}
                      />
                      <Bar dataKey="retards" radius={[6, 6, 0, 0]} fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Absences par service */}
              {byService.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <UserX className="w-4 h-4 text-red-500" />
                    Absences par service
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byService} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: "#94a3b8" }} width={100} />
                      <Tooltip
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        formatter={(value: number) => [value, "Absences"]}
                      />
                      <Bar dataKey="absences" radius={[0, 6, 6, 0]}>
                        {byService.map((_, i) => (
                          <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Heures par service */}
              {byService.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    Heures travaillées par service
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byService} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${v}h`} />
                      <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: "#94a3b8" }} width={100} />
                      <Tooltip
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                        formatter={(value: number) => [`${value}h`, "Heures"]}
                      />
                      <Bar dataKey="heures" radius={[0, 6, 6, 0]}>
                        {byService.map((_, i) => (
                          <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Heures sup par service */}
              {overtimeByService.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-violet-500" />
                    Heures supplémentaires par service
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={overtimeByService} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        tickFormatter={(v) => `${v}h`}
                      />
                      <YAxis
                        type="category"
                        dataKey="service"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        width={100}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                        formatter={(value: number) => [`${value}h`, "H. sup"]}
                      />
                      <Bar dataKey="overtimeHours" radius={[0, 6, 6, 0]}>
                        {overtimeByService.map((_, i) => (
                          <Cell key={i} fill={SERVICE_COLORS[i % SERVICE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Classements */}
          {(topPresents.length > 0 || topRetards.length > 0 || topOvertime.length > 0 || topOvertimeIssues.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Présents */}
              {topPresents.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-emerald-500" />
                    Top présences
                  </h3>
                  <div className="space-y-3">
                    {topPresents.map((emp, i) => (
                      <div key={emp.id} className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {i + 1}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                          {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{emp.name}</p>
                          <p className="text-xs text-slate-400">{emp.service}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-600">{emp.presents} j</p>
                          <p className="text-xs text-slate-400">{emp.totalHours}h</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Retards */}
              {topRetards.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Top retards
                  </h3>
                  <div className="space-y-3">
                    {topRetards.map((emp, i) => (
                      <div key={emp.id} className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? "bg-red-100 text-red-700" : i === 1 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {i + 1}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                          {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{emp.name}</p>
                          <p className="text-xs text-slate-400">{emp.service}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-amber-600">{emp.retards} retard{emp.retards > 1 ? "s" : ""}</p>
                          <p className="text-xs text-slate-400">Ponctualité {emp.punctualityRate}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top Heures sup (validées) */}
              {topOvertime.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-violet-500" />
                    Top heures supplémentaires (validées)
                  </h3>
                  <div className="space-y-3">
                    {topOvertime.map((emp, i) => (
                      <div key={emp.id} className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            i === 0
                              ? "bg-violet-100 text-violet-700"
                              : i === 1
                                ? "bg-slate-200 text-slate-600"
                                : i === 2
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">
                          {emp.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {emp.name}
                          </p>
                          <p className="text-xs text-slate-400">{emp.service}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-violet-600">
                            {emp.overtimeHours}h
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Heures sup à problème (non validées / refusées) */}
              {topOvertimeIssues.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    Heures sup non validées / refusées
                  </h3>
                  <div className="space-y-3">
                    {topOvertimeIssues.map((emp, i) => (
                      <div key={emp.id} className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            i === 0
                              ? "bg-red-100 text-red-700"
                              : i === 1
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                          {emp.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {emp.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {emp.service} — {emp.requests} demande
                            {emp.requests > 1 ? "s" : ""} problématique(s)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-red-600">
                            {emp.overtimeHours}h
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Table détaillée */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Détail par employé
                <span className="text-xs font-normal text-slate-400 ml-1">({rows.length})</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="pb-3 font-medium cursor-pointer select-none" onClick={() => handleSort("matricule")}>
                      Matricule <SortIcon field="matricule" />
                    </th>
                    <th className="pb-3 font-medium cursor-pointer select-none" onClick={() => handleSort("name")}>
                      Nom <SortIcon field="name" />
                    </th>
                    <th className="pb-3 font-medium cursor-pointer select-none" onClick={() => handleSort("structure")}>
                      Structure <SortIcon field="structure" />
                    </th>
                    <th className="pb-3 font-medium cursor-pointer select-none" onClick={() => handleSort("service")}>
                      Service <SortIcon field="service" />
                    </th>
                    <th className="pb-3 font-medium text-center cursor-pointer select-none" onClick={() => handleSort("presents")}>
                      Présents <SortIcon field="presents" />
                    </th>
                    <th className="pb-3 font-medium text-center cursor-pointer select-none" onClick={() => handleSort("absents")}>
                      Absents <SortIcon field="absents" />
                    </th>
                    <th className="pb-3 font-medium text-center cursor-pointer select-none" onClick={() => handleSort("retards")}>
                      Retards <SortIcon field="retards" />
                    </th>
                    <th className="pb-3 font-medium text-center">Missions</th>
                    <th className="pb-3 font-medium text-center">Perm.</th>
                    <th className="pb-3 font-medium text-center cursor-pointer select-none" onClick={() => handleSort("totalHours")}>
                      Heures <SortIcon field="totalHours" />
                    </th>
                    <th className="pb-3 font-medium text-center cursor-pointer select-none" onClick={() => handleSort("overtimeHours")}>
                      H. sup <SortIcon field="overtimeHours" />
                    </th>
                    <th className="pb-3 font-medium text-center cursor-pointer select-none" onClick={() => handleSort("punctualityRate")}>
                      Ponctualité <SortIcon field="punctualityRate" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center">
                        <UserX className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-400">Aucun pointage trouvé pour cette période.</p>
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 font-mono text-xs text-slate-500">{r.matricule}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {r.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <span className="font-medium text-slate-800">{r.name}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${r.structure === "AFREXIA" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}`}>
                            {r.structure}
                          </span>
                        </td>
                        <td className="py-3 text-slate-500">{r.service}</td>
                        <td className="py-3 text-center font-medium text-emerald-600">{r.presents}</td>
                        <td className="py-3 text-center">
                          {r.absents > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">{r.absents}</span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="py-3 text-center">
                          {r.retards > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">{r.retards}</span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className="py-3 text-center text-purple-600 font-medium">{r.missions || <span className="text-slate-300">0</span>}</td>
                        <td className="py-3 text-center text-blue-600 font-medium">{r.permissions || <span className="text-slate-300">0</span>}</td>
                        <td className="py-3 text-center font-medium text-slate-700">{r.totalHours}h</td>
                        <td className="py-3 text-center font-medium text-violet-600">
                          {r.overtimeHours > 0 ? `${r.overtimeHours}h` : <span className="text-slate-300">0</span>}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            r.punctualityRate >= 90 ? "bg-emerald-50 text-emerald-700" :
                            r.punctualityRate >= 70 ? "bg-amber-50 text-amber-700" :
                            "bg-red-50 text-red-700"
                          }`}>
                            {r.punctualityRate}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
