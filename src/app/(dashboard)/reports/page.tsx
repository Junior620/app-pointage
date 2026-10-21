"use client";

import { Suspense, useState, useCallback, useEffect, useRef } from "react";
import { getReportPresetRange, getLast30DaysRange, toInputDateLocal } from "@/lib/period-range";
import {
  FileSpreadsheet,
  FileText,
  Search,
  TrendingUp,
  Clock,
  Users,
  AlertTriangle,
  UserX,
  Trophy,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  RefreshCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { CHART_COLORS, CHART_SERIES, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import { useUrlFilters } from "@/lib/use-url-filters";
import { addPdfLogos } from "@/lib/pdf-branding";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { StructureBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { Table, THead, Th, Tr, Td, TableMessageRow } from "@/components/ui/Table";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toaster";

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

interface ReportData {
  rows: ReportRow[];
  summary: Summary | null;
  byDay: DayData[];
  byService: ServiceData[];
  topPresents: ReportRow[];
  topRetards: ReportRow[];
  topOvertime: ReportRow[];
  topOvertimeIssues: OvertimeIssueRow[];
  overtimeByService: OvertimeByServiceData[];
}

type EmployeeSuggestion = { id: string; firstName: string; lastName: string; matricule: string; service: string; label: string };

const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

const frDate = (d: string, withYear = true) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(withYear && { year: "numeric" }) });

function presetRanges() {
  const last30 = getLast30DaysRange();
  const month = getReportPresetRange("month");
  const quarter = getReportPresetRange("quarter");
  const year = getReportPresetRange("year");
  return [
    { key: "30d", label: "30 derniers jours", from: toInputDateLocal(last30.from), to: toInputDateLocal(last30.to) },
    { key: "month", label: "Mois en cours", from: toInputDateLocal(month.from), to: toInputDateLocal(month.to) },
    { key: "quarter", label: "Trimestre", from: toInputDateLocal(quarter.from), to: toInputDateLocal(quarter.to) },
    { key: "year", label: "Année", from: toInputDateLocal(year.from), to: toInputDateLocal(year.to) },
  ];
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsContent />
    </Suspense>
  );
}

function ReportsContent() {
  const toast = useToast();
  const presets = presetRanges();
  const monthPreset = presets[1];
  const [filters, setFilters] = useUrlFilters({ from: monthPreset.from, to: monthPreset.to, service: "", structure: "" });
  const dateFrom = filters.from;
  const dateTo = filters.to;
  const service = filters.service;
  const structure = filters.structure;

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [sortField, setSortField] = useState<keyof ReportRow>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [employeeSuggestions, setEmployeeSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const employeeInputRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetch("/api/reports/services")
      .then((res) => res.json())
      .then((json) => setServices(json.services ?? []))
      .catch(() => {});
  }, []);

  // Suggestions employés (autocomplete) avec debounce
  useEffect(() => {
    const q = employeeSearch.trim();
    if (q.length < 2 || selectedEmployeeId) {
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
  }, [employeeSearch, service, selectedEmployeeId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (employeeInputRef.current && !employeeInputRef.current.contains(e.target as Node)) {
        setShowEmployeeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const datesValid = Boolean(dateFrom && dateTo && dateFrom <= dateTo);

  const generate = useCallback(async () => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        ...(service.trim() && { service: service.trim() }),
        ...(structure && { structure }),
        ...(selectedEmployeeId && { employeeId: selectedEmployeeId }),
        ...(!selectedEmployeeId && appliedSearch.trim() && { search: appliedSearch.trim() }),
      });
      const res = await fetch(`/api/reports?${params}`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json.error === "string" ? json.error : "Impossible de générer le rapport");
        return;
      }
      setReport({
        rows: json.data ?? [],
        summary: json.summary ?? null,
        byDay: json.charts?.byDay ?? [],
        byService: json.charts?.byService ?? [],
        topPresents: json.rankings?.topPresents ?? [],
        topRetards: json.rankings?.topRetards ?? [],
        topOvertime: json.rankings?.topOvertime ?? [],
        topOvertimeIssues: json.rankings?.topOvertimeIssues ?? [],
        overtimeByService: json.overtimeByService ?? [],
      });
      if (json.services) setServices(json.services);
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau : le rapport n'a pas pu être généré.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, service, structure, appliedSearch, selectedEmployeeId, toast]);

  // Le rapport se recalcule dès qu'un filtre change.
  useEffect(() => {
    void generate();
  }, [generate]);

  const handleSort = (field: keyof ReportRow) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "name" || field === "matricule" || field === "service" || field === "structure" ? "asc" : "desc");
    }
  };

  const rows = report?.rows ?? [];
  const summary = report?.summary ?? null;
  const sortedRows = [...rows].sort((a, b) => {
    const va = a[sortField];
    const vb = b[sortField];
    if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const exportFileSuffix = selectedEmployeeId ? "_employe" : "";
  const periodLabel = datesValid ? `${frDate(dateFrom, false)} → ${frDate(dateTo)}` : "";

  const runExport = async (kind: "excel" | "pdf") => {
    if (rows.length === 0) {
      toast.warning("Aucune donnée à exporter sur cette sélection.");
      return;
    }
    setExporting(kind);
    try {
      if (kind === "excel") await exportExcel(rows, summary, `rapport_${dateFrom}_${dateTo}${exportFileSuffix}.xlsx`);
      else await exportPdf(rows, summary, periodLabel, `rapport_${dateFrom}_${dateTo}${exportFileSuffix}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error(kind === "excel" ? "Erreur lors de l'export Excel." : "Erreur lors de l'export PDF.");
    } finally {
      setExporting(null);
    }
  };

  const clearEmployee = () => {
    setSelectedEmployeeId(null);
    setEmployeeSearch("");
    setAppliedSearch("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapports"
        description={
          periodLabel ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CalendarDays className="h-4 w-4" />
              {periodLabel}
              {summary && (
                <span>
                  · {summary.totalEmployees} employé{summary.totalEmployees > 1 ? "s" : ""}
                </span>
              )}
            </span>
          ) : (
            "Analyses et indicateurs de pointage"
          )
        }
        actions={
          <>
            <Button variant="secondary" size="icon" onClick={() => void generate()} aria-label="Actualiser" title="Actualiser" disabled={!datesValid}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runExport("excel")}
              loading={exporting === "excel"}
              disabled={exporting !== null || rows.length === 0}
              icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
            >
              Excel
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runExport("pdf")}
              loading={exporting === "pdf"}
              disabled={exporting !== null || rows.length === 0}
              icon={<FileText className="h-4 w-4 text-red-600" />}
            >
              PDF
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-fit" role="group" aria-label="Période rapide">
          {presets.map((p) => {
            const active = dateFrom === p.from && dateTo === p.to;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setFilters({ from: p.from, to: p.to })}
                aria-pressed={active}
                className={cn(
                  "h-8 flex-1 rounded-lg px-3 text-xs font-medium transition-colors sm:flex-none",
                  active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <FilterBar>
          <FilterField label="Du">
            <Input type="date" value={dateFrom} onChange={(e) => setFilters({ from: e.target.value })} aria-invalid={!datesValid && Boolean(dateFrom && dateTo)} />
          </FilterField>
          <FilterField label="Au">
            <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setFilters({ to: e.target.value })} aria-invalid={!datesValid && Boolean(dateFrom && dateTo)} />
          </FilterField>
          <FilterField label="Service">
            <Select value={service} onChange={(e) => setFilters({ service: e.target.value })}>
              <option value="">Tous les services</option>
              {services.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Structure">
            <Select value={structure} onChange={(e) => setFilters({ structure: e.target.value })}>
              <option value="">Toutes</option>
              <option value="SCPB">SCPB</option>
              <option value="AFREXIA">AFREXIA</option>
            </Select>
          </FilterField>
          <FilterField label="Employé" className="sm:col-span-2 lg:min-w-[260px] lg:flex-1">
            <div className="relative" ref={employeeInputRef}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={employeeSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setEmployeeSearch(v);
                  setSelectedEmployeeId(null);
                  window.clearTimeout(searchTimer.current);
                  searchTimer.current = window.setTimeout(() => setAppliedSearch(v), 500);
                }}
                onFocus={() => employeeSearch.trim().length >= 2 && employeeSuggestions.length > 0 && setShowEmployeeDropdown(true)}
                placeholder="Nom, prénom ou matricule…"
                className="pl-9 pr-9"
                role="combobox"
                aria-expanded={showEmployeeDropdown && employeeSuggestions.length > 0}
                aria-controls="report-employee-list"
                aria-autocomplete="list"
              />
              {(selectedEmployeeId || employeeSearch) && (
                <button
                  type="button"
                  title="Effacer"
                  aria-label="Effacer l'employé"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  onClick={clearEmployee}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {loadingSuggestions && !employeeSearch && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">…</span>}
              {showEmployeeDropdown && employeeSuggestions.length > 0 && (
                <ul
                  id="report-employee-list"
                  role="listbox"
                  className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {employeeSuggestions.map((emp) => (
                    <li key={emp.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          window.clearTimeout(searchTimer.current);
                          setSelectedEmployeeId(emp.id);
                          setEmployeeSearch(`${emp.lastName} ${emp.firstName} (${emp.matricule})`);
                          setAppliedSearch("");
                          setShowEmployeeDropdown(false);
                          setEmployeeSuggestions([]);
                        }}
                      >
                        <span className="font-medium">
                          {emp.lastName} {emp.firstName}
                        </span>
                        {emp.service && <span className="text-xs text-slate-400">— {emp.service}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FilterField>
        </FilterBar>
        {!datesValid && dateFrom && dateTo && (
          <p className="text-sm text-red-600">La date de fin doit être postérieure à la date de début.</p>
        )}
      </div>

      {!report && loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}

      {!report && !loading && (
        <Card>
          <EmptyState icon={CalendarDays} title="Choisissez une période" description="Sélectionnez un raccourci ou deux dates pour afficher les analyses." />
        </Card>
      )}

      {report && (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          {summary && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatTile icon={TrendingUp} label="Taux de présence" value={`${summary.presenceRate} %`} tone="success" sub={`Ponctualité moyenne ${summary.avgPunctuality} %`} />
              <StatTile icon={AlertTriangle} label="Retards" value={summary.totalRetards} tone="warning" sub="sur la période" />
              <StatTile icon={UserX} label="Absences" value={summary.totalAbsences} tone="danger" sub="sur la période" />
              <StatTile icon={Clock} label="Heures travaillées" value={`${summary.totalHours} h`} tone="brand" sub={`dont ${summary.totalOvertimeHours} h sup`} />
            </div>
          )}

          {(report.byDay.length > 0 || report.byService.length > 0 || report.overtimeByService.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {report.byDay.length > 0 && (
                <ChartCard title="Taux de présence par jour" icon={TrendingUp} iconClass="text-emerald-500">
                  <LineChart data={report.byDay} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value: number) => [`${value} %`, "Présence"]} />
                    <Line type="monotone" dataKey="presenceRate" stroke={CHART_COLORS.present} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS.present }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ChartCard>
              )}
              {report.byDay.length > 0 && (
                <ChartCard title="Retards par jour" icon={AlertTriangle} iconClass="text-amber-500">
                  <BarChart data={report.byDay} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "#f1f5f9" }} formatter={(value: number) => [value, "Retards"]} />
                    <Bar dataKey="retards" radius={[6, 6, 0, 0]} fill={CHART_COLORS.late} />
                  </BarChart>
                </ChartCard>
              )}
              {report.byService.length > 0 && (
                <ChartCard title="Absences par service" icon={UserX} iconClass="text-red-500">
                  <ServiceBars data={report.byService} dataKey="absences" label="Absences" />
                </ChartCard>
              )}
              {report.byService.length > 0 && (
                <ChartCard title="Heures travaillées par service" icon={Clock} iconClass="text-brand-500">
                  <ServiceBars data={report.byService} dataKey="heures" label="Heures" unit="h" />
                </ChartCard>
              )}
              {report.overtimeByService.length > 0 && (
                <ChartCard title="Heures supplémentaires par service" icon={Clock} iconClass="text-violet-500">
                  <ServiceBars data={report.overtimeByService} dataKey="overtimeHours" label="H. sup" unit="h" />
                </ChartCard>
              )}
            </div>
          )}

          {(report.topPresents.length > 0 || report.topRetards.length > 0 || report.topOvertime.length > 0 || report.topOvertimeIssues.length > 0) && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {report.topPresents.length > 0 && (
                <RankingList
                  title="Top présences"
                  icon={Trophy}
                  iconClass="text-emerald-500"
                  tone="success"
                  items={report.topPresents.map((e) => ({ id: e.id, name: e.name, sub: e.service, value: `${e.presents} j`, extra: `${e.totalHours} h` }))}
                />
              )}
              {report.topRetards.length > 0 && (
                <RankingList
                  title="Top retards"
                  icon={AlertTriangle}
                  iconClass="text-amber-500"
                  tone="warning"
                  items={report.topRetards.map((e) => ({
                    id: e.id,
                    name: e.name,
                    sub: e.service,
                    value: `${e.retards} retard${e.retards > 1 ? "s" : ""}`,
                    extra: `Ponctualité ${e.punctualityRate} %`,
                  }))}
                />
              )}
              {report.topOvertime.length > 0 && (
                <RankingList
                  title="Top heures sup (validées)"
                  icon={Clock}
                  iconClass="text-violet-500"
                  tone="violet"
                  items={report.topOvertime.map((e) => ({ id: e.id, name: e.name, sub: e.service, value: `${e.overtimeHours} h` }))}
                />
              )}
              {report.topOvertimeIssues.length > 0 && (
                <RankingList
                  title="Heures sup non validées / refusées"
                  icon={AlertTriangle}
                  iconClass="text-red-500"
                  tone="danger"
                  items={report.topOvertimeIssues.map((e) => ({
                    id: e.id,
                    name: e.name,
                    sub: `${e.service} · ${e.requests} demande${e.requests > 1 ? "s" : ""} en suspens`,
                    value: `${e.overtimeHours} h`,
                  }))}
                />
              )}
            </div>
          )}

          <Card className="overflow-hidden">
            <CardHeader
              title="Détail par employé"
              description={`${rows.length} employé${rows.length > 1 ? "s" : ""} · cliquez sur un en-tête pour trier`}
              icon={<Users className="h-5 w-5 text-slate-400" />}
              className="pb-4"
            />
            <Table>
              <THead>
                <tr>
                  <SortTh field="matricule" label="Matricule" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="name" label="Nom" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="structure" label="Structure" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="service" label="Service" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="presents" label="Présents" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="absents" label="Absents" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="retards" label="Retards" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="missions" label="Missions" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="permissions" label="Autor." align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="totalHours" label="Heures" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="overtimeHours" label="H. sup" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortTh field="punctualityRate" label="Ponctualité" align="center" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                </tr>
              </THead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <TableMessageRow cols={12}>
                    <EmptyState icon={UserX} title="Aucun pointage trouvé pour cette période" />
                  </TableMessageRow>
                ) : (
                  sortedRows.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-mono text-xs text-slate-500">{r.matricule}</Td>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                            {initials(r.name)}
                          </span>
                          <span className="whitespace-nowrap font-medium text-slate-800">{r.name}</span>
                        </div>
                      </Td>
                      <Td>
                        <StructureBadge value={r.structure} />
                      </Td>
                      <Td className="text-slate-500">{r.service}</Td>
                      <Td align="center" className="font-medium tabular-nums text-emerald-600">{r.presents}</Td>
                      <Td align="center">{r.absents > 0 ? <Badge tone="danger">{r.absents}</Badge> : <span className="text-slate-300">0</span>}</Td>
                      <Td align="center">{r.retards > 0 ? <Badge tone="warning">{r.retards}</Badge> : <span className="text-slate-300">0</span>}</Td>
                      <Td align="center" className="font-medium tabular-nums text-violet-600">{r.missions || <span className="text-slate-300">0</span>}</Td>
                      <Td align="center" className="font-medium tabular-nums text-sky-600">{r.permissions || <span className="text-slate-300">0</span>}</Td>
                      <Td align="center" className="font-medium tabular-nums">{r.totalHours} h</Td>
                      <Td align="center" className="font-medium tabular-nums text-violet-600">
                        {r.overtimeHours > 0 ? `${r.overtimeHours} h` : <span className="text-slate-300">0</span>}
                      </Td>
                      <Td align="center">
                        <Badge tone={r.punctualityRate >= 90 ? "success" : r.punctualityRate >= 70 ? "warning" : "danger"}>{r.punctualityRate} %</Badge>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

function SortTh({
  field,
  label,
  align = "left",
  sortField,
  sortDir,
  onSort,
}: {
  field: keyof ReportRow;
  label: string;
  align?: "left" | "center";
  sortField: keyof ReportRow;
  sortDir: "asc" | "desc";
  onSort: (field: keyof ReportRow) => void;
}) {
  const active = sortField === field;
  return (
    <Th align={align} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800", active && "text-slate-800")}
      >
        {label}
        {active && sortDir === "asc" ? (
          <ChevronUp className="h-3 w-3 text-brand-600" />
        ) : (
          <ChevronDown className={cn("h-3 w-3", active ? "text-brand-600" : "text-slate-300")} />
        )}
      </button>
    </Th>
  );
}

function ChartCard({
  title,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string;
  icon: LucideIcon;
  iconClass: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader title={title} icon={<Icon className={cn("h-5 w-5", iconClass)} />} />
      <div className="px-2 pb-4 pt-3 sm:px-4">
        <ResponsiveContainer width="100%" height={260}>
          {children}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ServiceBars<T extends { service: string }>({
  data,
  dataKey,
  label,
  unit = "",
}: {
  data: T[];
  dataKey: keyof T & string;
  label: string;
  unit?: string;
}) {
  return (
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickFormatter={(v) => `${v}${unit}`} tickLine={false} axisLine={false} />
      <YAxis type="category" dataKey="service" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} width={90} tickLine={false} axisLine={false} />
      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "#f1f5f9" }} formatter={(value: number) => [`${value}${unit ? ` ${unit}` : ""}`, label]} />
      <Bar dataKey={dataKey} radius={[0, 6, 6, 0]}>
        {data.map((_, i) => (
          <Cell key={i} fill={CHART_SERIES[i % CHART_SERIES.length]} />
        ))}
      </Bar>
    </BarChart>
  );
}

const RANK_TONES: Record<"success" | "warning" | "violet" | "danger", string> = {
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  violet: "bg-violet-100 text-violet-700",
  danger: "bg-red-100 text-red-700",
};

const VALUE_TONES: Record<"success" | "warning" | "violet" | "danger", string> = {
  success: "text-emerald-600",
  warning: "text-amber-600",
  violet: "text-violet-600",
  danger: "text-red-600",
};

function RankingList({
  title,
  icon: Icon,
  iconClass,
  tone,
  items,
}: {
  title: string;
  icon: LucideIcon;
  iconClass: string;
  tone: Extract<BadgeTone, "success" | "warning" | "violet" | "danger">;
  items: { id: string; name: string; sub: string; value: string; extra?: string }[];
}) {
  return (
    <Card>
      <CardHeader title={title} icon={<Icon className={cn("h-5 w-5", iconClass)} />} />
      <ol className="space-y-1 px-3 pb-4 pt-3 sm:px-4">
        {items.map((emp, i) => (
          <li key={emp.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                i === 0 ? RANK_TONES[tone] : "bg-slate-100 text-slate-500"
              )}
            >
              {i + 1}
            </span>
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", RANK_TONES[tone])}>
              {initials(emp.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{emp.name}</p>
              <p className="truncate text-xs text-slate-500">{emp.sub}</p>
            </div>
            <div className="text-right">
              <p className={cn("text-sm font-bold tabular-nums", VALUE_TONES[tone])}>{emp.value}</p>
              {emp.extra && <p className="text-xs text-slate-500">{emp.extra}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const REPORT_COLUMNS = [
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

async function exportExcel(rows: ReportRow[], summary: Summary | null, filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  const styleHeader = (sheet: import("exceljs").Worksheet) => {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  };

  const toRow = (row: ReportRow) => ({
    matricule: row.matricule,
    name: row.name,
    structure: row.structure,
    service: row.service,
    totalDays: row.totalDays,
    presents: row.presents,
    absents: row.absents,
    retards: row.retards,
    missions: row.missions,
    permissions: row.permissions,
    totalHours: row.totalHours,
    overtimeHours: row.overtimeHours,
    punctualityRate: row.punctualityRate,
  });

  const allSheet = workbook.addWorksheet("Tous");
  allSheet.columns = REPORT_COLUMNS;
  styleHeader(allSheet);
  rows.forEach((row) => allSheet.addRow(toRow(row)));
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
    sheet.columns = REPORT_COLUMNS;
    styleHeader(sheet);
    structRows.forEach((row) => sheet.addRow(toRow(row)));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPdf(rows: ReportRow[], summary: Summary | null, periodLabel: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape" });
  const structuresInReport = [...new Set(rows.map((r) => r.structure))];
  await addPdfLogos(doc, structuresInReport);
  doc.setFontSize(16);
  doc.text("Rapport de pointage", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Période : ${periodLabel}`, 14, 26);

  if (summary) {
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(
      `Présence : ${summary.presenceRate}%  |  Retards : ${summary.totalRetards}  |  Absences : ${summary.totalAbsences}  |  Heures : ${summary.totalHours}h  |  H. sup : ${summary.totalOvertimeHours}h`,
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

  for (const label of ["SCPB", "AFREXIA"] as const) {
    const structRows = rows.filter((r) => r.structure === label);
    if (structRows.length === 0) continue;
    doc.addPage();
    await addPdfLogos(doc, [label]);
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Récapitulatif — ${label}`, 14, 18);
    doc.setFontSize(10);
    const totalH = structRows.reduce((s, r) => s + r.totalHours, 0);
    const totalOt = structRows.reduce((s, r) => s + r.overtimeHours, 0);
    const totalAbs = structRows.reduce((s, r) => s + r.absents, 0);
    const totalRet = structRows.reduce((s, r) => s + r.retards, 0);
    doc.text(`Employés : ${structRows.length} | Heures : ${totalH}h | H. sup : ${totalOt}h | Absences : ${totalAbs} | Retards : ${totalRet}`, 14, 26);
    autoTable(doc, {
      startY: 34,
      head: [["Matricule", "Nom", "Service", "Présents", "Absents", "Retards", "Heures", "H. sup", "Ponctualité"]],
      body: structRows.map((r) => [r.matricule, r.name, r.service, r.presents, r.absents, r.retards, `${r.totalHours}h`, `${r.overtimeHours}h`, `${r.punctualityRate}%`]),
      theme: "striped",
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 8 },
    });
  }

  doc.save(filename);
}
