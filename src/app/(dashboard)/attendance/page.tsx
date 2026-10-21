"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import {
  Search,
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
  FileText,
  ArrowLeft,
} from "lucide-react";
import { cn, formatTime, formatTimeHm, todayDate } from "@/lib/utils";
import {
  CORRECTION_REASON_CODES,
  CORRECTION_REASON_LABELS,
  overtimeToHm,
} from "@/lib/correction-reasons";
import { statusMeta, type StatusKind } from "@/lib/status-labels";
import { useDebouncedCommit, useUrlFilters } from "@/lib/use-url-filters";
import { refreshNavCounts } from "@/lib/use-nav-counts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, Label } from "@/components/ui/Field";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { Table, THead, Th, Tr, Td, TableSkeletonRows, TableMessageRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { StatTile } from "@/components/ui/StatTile";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ui/ConfirmDialog";

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
  breakStartTime: string | null;
  breakEndTime: string | null;
  breakMinutes: number | null;
  totalMinutes: number | null;
  overtimeMinutes: number | null;
  overtimeStatus: string | null;
  overtimeReason?: string | null;
  breakComment?: string | null;
  correctionReason?: string | null;
  correctionDocument?: string | null;
  finalStatus: string;
}

interface DayAttendanceRow {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  service: string;
  structure: string;
}

interface DayAttendancePayload {
  date: string;
  isNonWorkingDay: boolean;
  counts: {
    present: number;
    absent: number;
    late: number;
    missionPerm: number;
  };
  absents: DayAttendanceRow[];
}

interface AttendanceHistoryRow {
  date: string;
  label: string;
  isNonWorkingDay: boolean;
  counts: {
    present: number;
    absent: number;
    late: number;
    missionPerm: number;
  };
}

function isSaturday(dateStr: string): boolean {
  const d = parseDateOnly(dateStr);
  return d.getDay() === 6;
}

function parseDateOnly(dateStr: string): Date {
  // Prisma renvoie souvent les dates @db.Date sous forme "YYYY-MM-DD".
  // En JS, `new Date("YYYY-MM-DD")` est interprété en UTC et peut décaler le jour selon le fuseau.
  // On force donc la création en "date locale" (midday) pour stabiliser l'affichage (weekday/KPI).
  try {
    const base = dateStr.split("T")[0];
    const [y, m, d] = base.split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return new Date(dateStr);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  } catch {
    return new Date(dateStr);
  }
}

function displayStatus(record: AttendanceRecord): { label: string; tone: BadgeTone } {
  const saturdayAbsent = isSaturday(record.date) && record.finalStatus === "ABSENT" && !record.checkInTime;
  if (saturdayAbsent) {
    return { label: "Non travaillé", tone: "neutral" };
  }
  return statusMeta("final", record.finalStatus) ?? { label: record.finalStatus, tone: "neutral" };
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Décale une date AAAA-MM-JJ de n jours (calcul à midi UTC pour éviter les sauts de fuseau). */
function shiftDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function countInclusiveDays(from: string, to: string, workingDaysOnly: boolean): number {
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  let n = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getUTCDay();
    if (!workingDaysOnly || (dow >= 1 && dow <= 5)) n += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return n;
}

const formatDuration = (min: number | null) => {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
};

const formatDateLabel = (d: string) =>
  parseDateOnly(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function AttendancePage() {
  return (
    <Suspense fallback={null}>
      <AttendanceContent />
    </Suspense>
  );
}

function AttendanceContent() {
  const toast = useToast();
  const confirm = useConfirm();
  const todayStr = toDateInputValue(todayDate());
  const [filters, setFilters] = useUrlFilters({
    from: todayStr,
    to: todayStr,
    q: "",
    service: "",
    status: "",
    page: "1",
  });
  const dateFrom = filters.from;
  const dateTo = filters.to;
  const search = filters.q;
  const serviceFilter = filters.service;
  const statusFilter = filters.status;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const setPage = (p: number) => setFilters({ page: String(p) });

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(search);
  const [services, setServices] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null);
  const [userRole, setUserRole] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editComment, setEditComment] = useState("");
  const [editFinalStatus, setEditFinalStatus] = useState("");
  const [editCheckInStatus, setEditCheckInStatus] = useState("");
  const [editCheckInHm, setEditCheckInHm] = useState("");
  const [editCheckOutHm, setEditCheckOutHm] = useState("");
  const [editCheckOutStatus, setEditCheckOutStatus] = useState("");
  const [editBreakStartHm, setEditBreakStartHm] = useState("");
  const [editBreakEndHm, setEditBreakEndHm] = useState("");
  const [editCheckOutComment, setEditCheckOutComment] = useState("");
  const [editBreakComment, setEditBreakComment] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editOvertimeHm, setEditOvertimeHm] = useState("");
  const [editOvertimeStatus, setEditOvertimeStatus] = useState("");
  const [editOvertimeReason, setEditOvertimeReason] = useState("");
  const [editCheckInHmInitial, setEditCheckInHmInitial] = useState("");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkWorkingDays, setBulkWorkingDays] = useState(true);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canCorrect = userRole === "HR" || userRole === "ADMIN";
  const perPage = 20;
  const isSingleDay = !!dateFrom && !!dateTo && dateFrom === dateTo;

  const [dayPayload, setDayPayload] = useState<DayAttendancePayload | null>(null);
  const [historyRows, setHistoryRows] = useState<AttendanceHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [returnToRange, setReturnToRange] = useState<{ dateFrom: string; dateTo: string } | null>(null);

  // Recherche : saisie locale, reportée dans l'adresse après une courte pause de frappe
  const commitSearch = useDebouncedCommit((q) => setFilters({ q, page: "1" }));

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
      toast.error("Impossible de charger les pointages.");
    } finally {
      setLoading(false);
    }
  }, [page, search, dateFrom, dateTo, serviceFilter, statusFilter, toast]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((json) => setUserRole(json.role ?? ""))
      .catch(() => setUserRole(""));
  }, []);

  const fetchDayPayload = useCallback(async () => {
    if (!isSingleDay) return;
    try {
      const params = new URLSearchParams({ date: dateFrom });
      if (serviceFilter) params.set("service", serviceFilter);
      const res = await fetch(`/api/attendance/day?${params}`);
      const json = await res.json();
      if (
        res.ok &&
        json &&
        typeof json === "object" &&
        json.counts &&
        typeof json.counts === "object" &&
        typeof json.counts.present === "number"
      ) {
        setDayPayload(json as DayAttendancePayload);
      } else {
        setDayPayload(null);
      }
    } catch (e) {
      console.error(e);
      setDayPayload(null);
    }
  }, [isSingleDay, dateFrom, serviceFilter]);

  useEffect(() => {
    if (!isSingleDay) {
      setDayPayload(null);
      return;
    }
    fetchDayPayload();
  }, [isSingleDay, fetchDayPayload]);

  const fetchHistory = useCallback(async () => {
    if (!isSingleDay) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const params = new URLSearchParams({ date: dateFrom, days: "7" });
      if (serviceFilter) params.set("service", serviceFilter);
      const res = await fetch(`/api/attendance/history?${params}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setHistoryRows(json.data);
      } else {
        setHistoryRows([]);
        setHistoryError(true);
      }
    } catch (e) {
      console.error(e);
      setHistoryRows([]);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [isSingleDay, dateFrom, serviceFilter]);

  useEffect(() => {
    if (!isSingleDay) {
      setHistoryRows([]);
      setHistoryLoading(false);
      setHistoryError(false);
      return;
    }
    fetchHistory();
  }, [isSingleDay, fetchHistory]);

  const totalPages = Math.ceil(total / perPage);

  const dayCounts = dayPayload?.counts;
  const presentCount = dayCounts
    ? dayCounts.present
    : records.filter((r) => r.finalStatus === "PRESENT").length;
  const absentCount = dayCounts
    ? dayCounts.absent
    : records.filter(
        (r) => r.finalStatus === "ABSENT" && !(isSaturday(r.date) && !r.checkInTime)
      ).length;
  const lateCount = dayCounts
    ? dayCounts.late
    : records.filter((r) => r.checkInStatus === "LATE").length;
  const missionPermCount = dayCounts
    ? dayCounts.missionPerm
    : records.filter(
        (r) => r.finalStatus === "MISSION" || r.finalStatus === "PERMISSION"
      ).length;

  const fillEditForm = (record: AttendanceRecord, startInEdit = false) => {
    setDetailRecord(record);
    setEditMode(startInEdit);
    setEditComment((record.checkInComment ?? "").replace(/^\[[^\]]+\]\s*/, ""));
    setEditFinalStatus(record.finalStatus);
    setEditCheckInStatus(record.checkInStatus ?? "");
    const inHm = formatTimeHm(record.checkInTime);
    setEditCheckInHm(inHm);
    setEditCheckInHmInitial(inHm);
    setEditCheckOutHm(formatTimeHm(record.checkOutTime));
    setEditCheckOutStatus(record.checkOutStatus ?? "");
    setEditBreakStartHm(formatTimeHm(record.breakStartTime));
    setEditBreakEndHm(formatTimeHm(record.breakEndTime));
    setEditCheckOutComment(record.checkOutComment ?? "");
    setEditBreakComment(record.breakComment ?? "");
    setEditReason(record.correctionReason ?? "");
    setEditOvertimeHm(overtimeToHm(record.overtimeMinutes));
    setEditOvertimeStatus(record.overtimeStatus ?? "");
    setEditOvertimeReason(record.overtimeReason ?? "");
    setBulkFrom(record.date.split("T")[0]);
    setBulkTo(record.date.split("T")[0]);
    setBulkWorkingDays(true);
    setDocFile(null);
  };

  const openDetail = (record: AttendanceRecord) => fillEditForm(record, false);

  const openCreateForEmployee = (emp: DayAttendanceRow) => {
    fillEditForm(
      {
        id: "",
        date: dateFrom,
        employee: {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          matricule: emp.matricule,
          service: emp.service,
        },
        checkInTime: null,
        checkInStatus: null,
        checkInComment: null,
        checkOutTime: null,
        checkOutStatus: null,
        checkOutComment: null,
        breakStartTime: null,
        breakEndTime: null,
        breakMinutes: null,
        totalMinutes: null,
        overtimeMinutes: null,
        overtimeStatus: null,
        overtimeReason: null,
        breakComment: null,
        correctionReason: null,
        correctionDocument: null,
        finalStatus: "PRESENT",
      },
      true
    );
  };

  const buildCorrectionPayload = () => {
    const arrivalChanged = editCheckInHm !== editCheckInHmInitial;
    const payload: Record<string, unknown> = {
      comment: editComment,
      finalStatus: editFinalStatus,
      checkInTimeHm: editCheckInHm || undefined,
      checkOutTimeHm: editCheckOutHm || undefined,
      clearCheckIn: !editCheckInHm && Boolean(detailRecord?.checkInTime),
      clearCheckOut: !editCheckOutHm && Boolean(detailRecord?.checkOutTime),
      clearBreak:
        !editBreakStartHm &&
        !editBreakEndHm &&
        Boolean(detailRecord?.breakStartTime || detailRecord?.breakEndTime),
      checkOutComment: editCheckOutComment || null,
      breakComment: editBreakComment || null,
      correctionReason: editReason || null,
      overtimeHm: editOvertimeHm || (detailRecord?.overtimeMinutes ? "00:00" : undefined),
      overtimeStatus: editOvertimeHm ? editOvertimeStatus || null : null,
      overtimeReason: editOvertimeReason || null,
    };
    if (arrivalChanged) {
      payload.recalculateCheckInStatus = true;
      if (editCheckInStatus) payload.checkInStatus = editCheckInStatus;
    } else if (editCheckInStatus) {
      payload.checkInStatus = editCheckInStatus;
    }
    if (editCheckOutHm && editCheckOutStatus) {
      payload.checkOutStatus = editCheckOutStatus;
    }
    if (editBreakStartHm) payload.breakStartTimeHm = editBreakStartHm;
    else if (detailRecord?.breakStartTime) payload.breakStartTimeHm = null;
    if (editBreakEndHm) payload.breakEndTimeHm = editBreakEndHm;
    else if (detailRecord?.breakEndTime) payload.breakEndTimeHm = null;
    return payload;
  };

  const handleEditSave = async () => {
    if (!detailRecord) return;
    setSubmitting(true);
    try {
      const payload = buildCorrectionPayload();
      const isNew = !detailRecord.id;
      const applyBulk = bulkFrom && bulkTo && bulkFrom !== bulkTo;

      if (applyBulk) {
        const dayCount = countInclusiveDays(bulkFrom, bulkTo, bulkWorkingDays);
        const ok = await confirm({
          title: "Correction sur une période",
          message: `Appliquer cette correction sur ${dayCount} jour${dayCount > 1 ? "s" : ""}, du ${formatDateLabel(bulkFrom)} au ${formatDateLabel(bulkTo)}, pour ${detailRecord.employee.firstName} ${detailRecord.employee.lastName} ?${docFile ? "\n\nLe justificatif n'est pas joint en correction groupée : ajoutez-le ensuite jour par jour." : ""}`,
          confirmLabel: `Corriger ${dayCount} jour${dayCount > 1 ? "s" : ""}`,
          tone: "primary",
        });
        if (!ok) {
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/attendance/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            employeeId: detailRecord.employee.id,
            from: bulkFrom,
            to: bulkTo,
            workingDaysOnly: bulkWorkingDays,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(typeof json.error === "string" ? json.error : "Correction groupée impossible");
          return;
        }
        toast.success(`Correction appliquée sur ${dayCount} jour${dayCount > 1 ? "s" : ""}.`);
      } else {
        const res = await fetch("/api/attendance", {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isNew
              ? { ...payload, employeeId: detailRecord.employee.id, date: detailRecord.date.split("T")[0] }
              : { ...payload, id: detailRecord.id }
          ),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(typeof json.error === "string" ? json.error : "Correction impossible");
          return;
        }
        const savedId = json.data?.id as string | undefined;
        if (docFile && savedId) {
          const fd = new FormData();
          fd.append("file", docFile);
          const up = await fetch(`/api/attendance/${savedId}/document`, { method: "POST", body: fd });
          if (!up.ok) {
            const uj = await up.json().catch(() => ({}));
            toast.warning(typeof uj.error === "string" ? uj.error : "Justificatif non envoyé (correction enregistrée).");
          }
        }
        toast.success(isNew ? "Journée créée." : "Pointage corrigé.");
      }

      setDetailRecord(null);
      fetchRecords();
      fetchDayPayload();
      refreshNavCounts();
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau : la correction n'a pas pu être envoyée.");
    } finally {
      setSubmitting(false);
    }
  };

  const dateRangeLabel = () => {
    if (dateFrom === todayStr && dateTo === todayStr) return "Aujourd'hui";
    if (dateFrom && dateTo && dateFrom === dateTo) return formatDateLabel(dateFrom);
    if (dateFrom && dateTo) return `${formatDateLabel(dateFrom)} → ${formatDateLabel(dateTo)}`;
    if (dateFrom) return `Depuis le ${formatDateLabel(dateFrom)}`;
    if (dateTo) return `Jusqu'au ${formatDateLabel(dateTo)}`;
    return "Toutes les dates";
  };

  const setRange = (from: string, to: string) => {
    setReturnToRange(null);
    setFilters({ from, to, page: "1" });
  };

  const periodShortcuts = [
    { label: "Aujourd'hui", from: todayStr, to: todayStr },
    { label: "Hier", from: shiftDays(todayStr, -1), to: shiftDays(todayStr, -1) },
    { label: "7 jours", from: shiftDays(todayStr, -6), to: todayStr },
    { label: "Ce mois", from: `${todayStr.slice(0, 8)}01`, to: todayStr },
  ];

  const toggleStatus = (value: string) => setFilters({ status: statusFilter === value ? "" : value, page: "1" });
  const hasActiveFilters = Boolean(search || serviceFilter || statusFilter || dateFrom !== todayStr || dateTo !== todayStr);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pointages"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <CalendarDays className="h-4 w-4" />
            {dateRangeLabel()}
            {total > 0 && (
              <span>
                · <span className="font-medium text-slate-700">{total}</span> enregistrement{total > 1 ? "s" : ""}
              </span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Période">
            {periodShortcuts.map((p) => {
              const active = dateFrom === p.from && dateTo === p.to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setRange(p.from, p.to)}
                  aria-pressed={active}
                  className={cn(
                    "h-8 rounded-lg px-3 text-xs font-medium transition-colors",
                    active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        }
      />

      {/* Indicateurs : un clic filtre la liste */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile icon={UserCheck} label="Présents" value={presentCount} tone="success" onClick={() => toggleStatus("PRESENT")} active={statusFilter === "PRESENT"} />
        <StatTile icon={UserX} label="Absents" value={absentCount} tone="danger" onClick={() => toggleStatus("ABSENT")} active={statusFilter === "ABSENT"} />
        <StatTile icon={Clock} label="Retards" value={lateCount} tone="warning" />
        <StatTile icon={Briefcase} label="Mission / autorisation" value={missionPermCount} tone="violet" />
      </div>

      {/* Absents de la journée */}
      {dayPayload && dayCounts != null && (
        <Card>
          <CardHeader
            title={dayPayload.isNonWorkingDay ? "Jour non ouvré" : "Absents de la journée"}
            description={
              dayPayload.isNonWorkingDay
                ? "Aucune absence n'est comptée sur ce jour."
                : dayCounts.absent === 0
                  ? "Personne n'est absent ce jour-là."
                  : `${dayCounts.absent} absent${dayCounts.absent > 1 ? "s" : ""}${canCorrect ? " — vous pouvez créer ou corriger leur journée." : "."}`
            }
          />
          {!dayPayload.isNonWorkingDay && dayCounts.absent > 0 ? (
            <ul className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {(dayPayload.absents ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {e.firstName} {e.lastName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[e.matricule, e.service, e.structure].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {canCorrect ? (
                    <Button size="sm" variant="secondary" onClick={() => openCreateForEmployee(e)}>
                      Corriger
                    </Button>
                  ) : (
                    <Badge tone="danger">Absent</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="h-5" />
          )}
        </Card>
      )}

      {/* Filtres */}
      <FilterBar
        actions={
          hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                setReturnToRange(null);
                setFilters({ from: todayStr, to: todayStr, q: "", service: "", status: "", page: "1" });
              }}
            >
              Réinitialiser
            </Button>
          ) : undefined
        }
      >
        <FilterField label="Recherche" className="sm:col-span-2 lg:min-w-[260px] lg:flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="search"
              placeholder="Nom ou matricule…"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                commitSearch(e.target.value);
              }}
              className="pl-9"
            />
          </div>
        </FilterField>
        <FilterField label="Du">
          <Input type="date" value={dateFrom} onChange={(e) => setRange(e.target.value, dateTo)} />
        </FilterField>
        <FilterField label="Au">
          <Input type="date" value={dateTo} onChange={(e) => setRange(dateFrom, e.target.value)} />
        </FilterField>
        <FilterField label="Service">
          <Select value={serviceFilter} onChange={(e) => setFilters({ service: e.target.value, page: "1" })}>
            <option value="">Tous les services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Statut">
          <Select value={statusFilter} onChange={(e) => setFilters({ status: e.target.value, page: "1" })}>
            <option value="">Tous les statuts</option>
            <option value="PRESENT">Présent</option>
            <option value="ABSENT">Absent</option>
            <option value="PERMISSION">Autorisation d&apos;absence</option>
            <option value="MISSION">Mission</option>
          </Select>
        </FilterField>
      </FilterBar>

      {/* Liste */}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Date</Th>
              <Th>Employé</Th>
              <Th>Arrivée</Th>
              <Th>Départ</Th>
              <Th>Pause</Th>
              <Th>Durée</Th>
              <Th>Statut</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <TableSkeletonRows cols={8} />
            ) : records.length === 0 ? (
              <TableMessageRow cols={8}>
                <EmptyState
                  icon={ClipboardCheck}
                  title="Aucun pointage trouvé"
                  description="Modifiez les filtres ou vérifiez la période sélectionnée."
                />
              </TableMessageRow>
            ) : (
              records.map((r) => {
                const status = displayStatus(r);
                return (
                  <Tr key={r.id} onClick={() => openDetail(r)} className="cursor-pointer">
                    <Td className="whitespace-nowrap font-medium text-slate-700">
                      {parseDateOnly(r.date).toLocaleDateString("fr-FR", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            r.finalStatus === "ABSENT"
                              ? "bg-red-100 text-red-700"
                              : r.checkInStatus === "LATE"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-brand-50 text-brand-700"
                          )}
                        >
                          {r.employee.firstName[0]}
                          {r.employee.lastName[0]}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">
                            {r.employee.firstName} {r.employee.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{r.employee.matricule}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-medium tabular-nums">{formatTime(r.checkInTime)}</span>
                        {r.checkInStatus && <StatusBadge kind="checkIn" value={r.checkInStatus} />}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="tabular-nums">{formatTime(r.checkOutTime)}</span>
                        {r.checkOutStatus && <StatusBadge kind="checkOut" value={r.checkOutStatus} />}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.breakStartTime || r.breakEndTime ? (
                        <>
                          <span className="tabular-nums">
                            {formatTime(r.breakStartTime)} → {formatTime(r.breakEndTime)}
                          </span>
                          {(r.breakMinutes ?? 0) > 0 && (
                            <span className="ml-1 text-xs text-amber-700">({formatDuration(r.breakMinutes)})</span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="font-medium tabular-nums">{formatDuration(r.totalMinutes)}</span>
                      {r.overtimeMinutes && r.overtimeMinutes > 0 ? (
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="text-xs font-medium text-brand-600">+{formatDuration(r.overtimeMinutes)} sup</span>
                          {r.overtimeStatus && <StatusBadge kind="overtime" value={r.overtimeStatus} className="px-1.5 text-[10px]" />}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={status.tone} dot>
                        {status.label}
                      </Badge>
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        {(r.checkInComment || r.checkOutComment) && (
                          <span
                            className="p-1.5 text-slate-400"
                            title={[
                              r.checkInComment && `Arrivée : ${r.checkInComment}`,
                              r.checkOutComment && `Départ : ${r.checkOutComment}`,
                            ]
                              .filter(Boolean)
                              .join(" | ")}
                          >
                            <MessageSquare className="h-4 w-4" aria-label="Commentaire" />
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(r);
                          }}
                          aria-label={`Détail du pointage de ${r.employee.firstName} ${r.employee.lastName}`}
                          title="Détail / Corriger"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={perPage}
          itemLabel={["pointage", "pointages"]}
          onPageChange={setPage}
        />
      </Card>

      {/* Historique des journées précédentes (un seul jour sélectionné) */}
      {isSingleDay && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Les 7 journées précédentes"
            actions={
              returnToRange ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<ArrowLeft className="h-4 w-4" />}
                  onClick={() => {
                    setFilters({ from: returnToRange.dateFrom, to: returnToRange.dateTo, page: "1" });
                    setReturnToRange(null);
                  }}
                >
                  Retour au {formatDateLabel(returnToRange.dateFrom)}
                </Button>
              ) : undefined
            }
          />
          <div className="pt-3">
            {historyLoading && <p className="px-6 pb-5 text-sm text-slate-500">Chargement de l&apos;historique…</p>}
            {historyError && !historyLoading && (
              <p className="px-6 pb-5 text-sm text-red-600">
                Impossible de charger l&apos;historique (session expirée, droits insuffisants ou erreur serveur).
                Rechargez la page ou reconnectez-vous.
              </p>
            )}
            {!historyLoading && !historyError && historyRows.length === 0 && (
              <p className="px-6 pb-5 text-sm text-slate-500">Aucune ligne d&apos;historique pour cette période.</p>
            )}
            {!historyLoading && !historyError && historyRows.length > 0 && (
              <Table>
                <THead>
                  <tr>
                    <Th>Jour</Th>
                    <Th align="right">Présents</Th>
                    <Th align="right">Absents</Th>
                    <Th align="right">Retards</Th>
                    <Th align="right">Mission / autor.</Th>
                    <Th align="right">
                      <span className="sr-only">Action</span>
                    </Th>
                  </tr>
                </THead>
                <tbody>
                  {historyRows.map((h) => (
                    <Tr key={h.date}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700">{h.label}</span>
                          {h.isNonWorkingDay && <Badge tone="neutral">Non ouvré</Badge>}
                        </div>
                      </Td>
                      <Td align="right" className="font-medium tabular-nums text-emerald-600">{h.counts.present}</Td>
                      <Td align="right" className="font-medium tabular-nums text-red-600">{h.counts.absent}</Td>
                      <Td align="right" className="font-medium tabular-nums text-amber-600">{h.counts.late}</Td>
                      <Td align="right" className="font-medium tabular-nums text-violet-600">{h.counts.missionPerm}</Td>
                      <Td align="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReturnToRange({ dateFrom, dateTo });
                            setFilters({ from: h.date, to: h.date, page: "1" });
                          }}
                        >
                          Voir
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {/* Détail / correction */}
      <Modal
        open={detailRecord !== null}
        onClose={() => setDetailRecord(null)}
        variant="drawer"
        className="max-w-lg"
        dismissible={!submitting}
        title={editMode ? (detailRecord?.id ? "Correction manuelle" : "Créer la journée") : "Détail du pointage"}
        footer={
          detailRecord && editMode ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!detailRecord.id) setDetailRecord(null);
                  else setEditMode(false);
                }}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button onClick={handleEditSave} loading={submitting}>
                {detailRecord.id ? "Enregistrer" : "Créer ce jour"}
              </Button>
            </>
          ) : detailRecord && canCorrect ? (
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditMode(true)} className="w-full">
              Corriger ce pointage
            </Button>
          ) : undefined
        }
      >
        {detailRecord && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  displayStatus(detailRecord).tone === "neutral"
                    ? "bg-slate-100 text-slate-600"
                    : detailRecord.finalStatus === "ABSENT"
                      ? "bg-red-100 text-red-700"
                      : "bg-brand-50 text-brand-700"
                )}
              >
                {detailRecord.employee.firstName[0]}
                {detailRecord.employee.lastName[0]}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {detailRecord.employee.firstName} {detailRecord.employee.lastName}
                </p>
                <p className="text-sm text-slate-500">{detailRecord.employee.matricule}</p>
              </div>
              <Badge tone={displayStatus(detailRecord).tone} dot className="ml-auto">
                {displayStatus(detailRecord).label}
              </Badge>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
              <CalendarDays className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">
                {parseDateOnly(detailRecord.date).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>

            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              <DetailRow icon={Clock} label="Arrivée" value={formatTime(detailRecord.checkInTime)} kind="checkIn" badge={detailRecord.checkInStatus} />
              <DetailRow icon={MapPin} label="Départ" value={formatTime(detailRecord.checkOutTime)} kind="checkOut" badge={detailRecord.checkOutStatus} />
              <DetailRow icon={Timer} label="Départ pause" value={formatTime(detailRecord.breakStartTime)} />
              <DetailRow icon={Timer} label="Retour pause" value={formatTime(detailRecord.breakEndTime)} />
              <DetailRow icon={Timer} label="Durée pause" value={formatDuration(detailRecord.breakMinutes)} />
              <DetailRow icon={Timer} label="Durée totale" value={formatDuration(detailRecord.totalMinutes)} />
              {detailRecord.overtimeMinutes && detailRecord.overtimeMinutes > 0 ? (
                <DetailRow
                  icon={Timer}
                  label="Heures sup."
                  value={formatDuration(detailRecord.overtimeMinutes)}
                  kind="overtime"
                  badge={detailRecord.overtimeStatus}
                  highlight
                />
              ) : null}
            </dl>

            {!editMode && (
              <div className="space-y-3">
                {detailRecord.checkInComment && (
                  <NoteBlock icon label="Commentaire arrivée" text={detailRecord.checkInComment} />
                )}
                {detailRecord.checkOutComment && (
                  <NoteBlock icon label="Commentaire départ" text={detailRecord.checkOutComment} />
                )}
                {detailRecord.correctionReason && (
                  <NoteBlock
                    label="Motif type"
                    text={
                      CORRECTION_REASON_LABELS[detailRecord.correctionReason as keyof typeof CORRECTION_REASON_LABELS] ??
                      detailRecord.correctionReason
                    }
                  />
                )}
                {detailRecord.breakComment && <NoteBlock label="Motif pause" text={detailRecord.breakComment} />}
                {detailRecord.correctionDocument && detailRecord.id && (
                  <a
                    href={`/api/attendance/${detailRecord.id}/document`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    Voir le justificatif
                  </a>
                )}
              </div>
            )}

            {editMode && (
              <div className="space-y-5 border-t border-slate-100 pt-5">
                <div>
                  <Label htmlFor="att-final">Statut final</Label>
                  <Select id="att-final" value={editFinalStatus} onChange={(e) => setEditFinalStatus(e.target.value)}>
                    <option value="PRESENT">Présent</option>
                    <option value="ABSENT">Absent</option>
                    <option value="PERMISSION">Autorisation d&apos;absence</option>
                    <option value="MISSION">Mission</option>
                  </Select>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Arrivée et départ</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="att-in">Heure d&apos;arrivée</Label>
                      <Input
                        id="att-in"
                        type="time"
                        value={editCheckInHm}
                        onChange={(e) => {
                          setEditCheckInHm(e.target.value);
                          setEditCheckInStatus("");
                        }}
                      />
                      {editCheckInHm && (
                        <button
                          type="button"
                          onClick={() => setEditCheckInHm("")}
                          className="mt-1.5 text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          Supprimer l&apos;arrivée
                        </button>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="att-in-status">Statut arrivée</Label>
                      <Select id="att-in-status" value={editCheckInStatus} onChange={(e) => setEditCheckInStatus(e.target.value)}>
                        <option value="">Auto (selon horaire)</option>
                        <option value="ON_TIME">À l&apos;heure</option>
                        <option value="LATE">Retard</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="att-out">Heure de départ</Label>
                      <Input id="att-out" type="time" value={editCheckOutHm} onChange={(e) => setEditCheckOutHm(e.target.value)} />
                      {editCheckOutHm && (
                        <button
                          type="button"
                          onClick={() => setEditCheckOutHm("")}
                          className="mt-1.5 text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          Supprimer le départ
                        </button>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="att-out-status">Type de départ</Label>
                      <Select id="att-out-status" value={editCheckOutStatus} onChange={(e) => setEditCheckOutStatus(e.target.value)}>
                        <option value="">—</option>
                        <option value="MANUAL">Manuel</option>
                        <option value="AUTO">Auto</option>
                      </Select>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pause</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="att-bs">Début de pause</Label>
                      <Input id="att-bs" type="time" value={editBreakStartHm} onChange={(e) => setEditBreakStartHm(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="att-be">Fin de pause</Label>
                      <Input id="att-be" type="time" value={editBreakEndHm} onChange={(e) => setEditBreakEndHm(e.target.value)} />
                    </div>
                  </div>
                  {(editBreakStartHm || editBreakEndHm) && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditBreakStartHm("");
                        setEditBreakEndHm("");
                        setEditBreakComment("");
                      }}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Supprimer la pause
                    </button>
                  )}
                  <div>
                    <Label htmlFor="att-bc">Motif pause (si &gt; 60 min)</Label>
                    <Input id="att-bc" value={editBreakComment} onChange={(e) => setEditBreakComment(e.target.value)} />
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motifs</legend>
                  <div>
                    <Label htmlFor="att-reason">Motif type</Label>
                    <Select id="att-reason" value={editReason} onChange={(e) => setEditReason(e.target.value)}>
                      <option value="">—</option>
                      {CORRECTION_REASON_CODES.map((code) => (
                        <option key={code} value={code}>
                          {CORRECTION_REASON_LABELS[code]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="att-c-in">Commentaire arrivée</Label>
                    <Textarea
                      id="att-c-in"
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                      rows={2}
                      placeholder="Détail de la correction…"
                      className="min-h-0 resize-none"
                    />
                  </div>
                  <div>
                    <Label htmlFor="att-c-out">Commentaire départ</Label>
                    <Textarea
                      id="att-c-out"
                      value={editCheckOutComment}
                      onChange={(e) => setEditCheckOutComment(e.target.value)}
                      rows={2}
                      placeholder="Départ anticipé, panne réseau…"
                      className="min-h-0 resize-none"
                    />
                  </div>
                </fieldset>

                <fieldset className="space-y-3">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Heures supplémentaires</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="att-ot">Durée (HH:MM)</Label>
                      <Input id="att-ot" type="time" value={editOvertimeHm} onChange={(e) => setEditOvertimeHm(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="att-ot-status">Statut</Label>
                      <Select id="att-ot-status" value={editOvertimeStatus} onChange={(e) => setEditOvertimeStatus(e.target.value)}>
                        <option value="">—</option>
                        <option value="PENDING">En attente</option>
                        <option value="APPROVED">Validée</option>
                        <option value="REJECTED">Refusée</option>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="att-ot-reason">Motif heures sup.</Label>
                    <Input id="att-ot-reason" value={editOvertimeReason} onChange={(e) => setEditOvertimeReason(e.target.value)} />
                  </div>
                </fieldset>

                <div>
                  <Label htmlFor="att-doc">Justificatif (PDF, JPEG, PNG — 5 Mo max.)</Label>
                  <input
                    id="att-doc"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {detailRecord.correctionDocument && detailRecord.id && (
                    <a
                      href={`/api/attendance/${detailRecord.id}/document`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline"
                    >
                      Voir le justificatif actuel
                    </a>
                  )}
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-700">Appliquer aussi sur une période</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} aria-label="Début de la période" />
                    <Input type="date" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} aria-label="Fin de la période" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={bulkWorkingDays}
                      onChange={(e) => setBulkWorkingDays(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Jours ouvrés seulement
                  </label>
                  <p className="text-xs text-slate-500">Laissez les deux dates identiques pour ne corriger que ce jour.</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  kind,
  badge,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  kind?: StatusKind;
  badge?: string | null;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="flex items-center gap-3 text-sm text-slate-500">
        <Icon className="h-4 w-4 text-slate-400" />
        {label}
      </dt>
      <dd className="flex items-center gap-2">
        <span className={cn("text-sm font-medium tabular-nums", highlight ? "text-brand-600" : "text-slate-800")}>{value}</span>
        {kind && badge && <StatusBadge kind={kind} value={badge} />}
      </dd>
    </div>
  );
}

function NoteBlock({ label, text, icon = false }: { label: string; text: string; icon?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
        {icon && <MessageSquare className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="whitespace-pre-line text-sm text-slate-700">{text}</p>
    </div>
  );
}
