"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import {
  Plus,
  Check,
  XCircle,
  CalendarDays,
  ClipboardList,
  Clock,
  UserCheck,
  UserX,
  CalendarOff,
  Download,
  Eye,
  Trash2,
  Archive,
  FileText,
  RotateCcw,
} from "lucide-react";
import { LeaveAbsenceCategory } from "@prisma/client";
import {
  ORDERED_LEAVE_ABSENCE_CATEGORIES,
  LEAVE_ABSENCE_CATEGORY_LABELS,
  leaveAbsenceCategoryLabel,
  leaveSubmissionSourceLabel,
} from "@/lib/leave-absence-labels";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/status-labels";
import { fetchAllEmployees } from "@/lib/fetch-all-employees";
import { downloadBlob, downloadLeaveRequestPdf } from "@/lib/documents/download";
import { calendarDays } from "@/lib/documents/leave-request";
import { EXCEL_DATE_FORMAT, excelDay, finishSheet, setColumnFormats } from "@/lib/excel-format";
import { fileDateStamp } from "@/lib/export-format";
import { useUrlFilters } from "@/lib/use-url-filters";
import { refreshNavCounts } from "@/lib/use-nav-counts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { Table, THead, Th, Tr, Td, TableSkeletonRows, TableMessageRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { StatTile } from "@/components/ui/StatTile";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toaster";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { z } from "zod";

interface LeaveRequest {
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
  absenceCategory: LeaveAbsenceCategory | null;
  notifyOrReplace: string | null;
  submissionSource: "HR_DASHBOARD" | "EMPLOYEE_WHATSAPP_FORM";
  status: "PENDING" | "APPROVED" | "REJECTED";
  document: string | null;
  approvedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type EmployeeOption = { id: string; firstName: string; lastName: string; service?: string };

const leaveSchema = z
  .object({
    employeeId: z.string().min(1, "L'employé est requis"),
    startDate: z.string().min(1, "La date de début est requise"),
    endDate: z.string().min(1, "La date de fin est requise"),
    reason: z.string().min(1, "Le motif est requis"),
    absenceCategory: z.nativeEnum(LeaveAbsenceCategory).optional(),
    notifyOrReplace: z.string().max(500).optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: "La date de fin doit être après la date de début",
    path: ["endDate"],
  });

const MOTIF_SUGGESTIONS = ["Rendez-vous médical", "Démarche administrative", "Urgence familiale", "Autre"];

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

const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

const EMPTY_FORM = {
  employeeId: "",
  startDate: "",
  endDate: "",
  reason: "",
  absenceCategory: "" as "" | LeaveAbsenceCategory,
  notifyOrReplace: "",
};

export default function LeavesPage() {
  return (
    <Suspense fallback={null}>
      <LeavesContent />
    </Suspense>
  );
}

function LeavesContent() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useUrlFilters({ status: "", from: "", to: "", service: "", employee: "", page: "1" });
  const statusFilter = filters.status;
  const dateFrom = filters.from;
  const dateTo = filters.to;
  const serviceFilter = filters.service;
  const employeeFilter = filters.employee;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailLeave, setDetailLeave] = useState<LeaveRequest | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
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
      toast.error("Impossible de charger les demandes.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo, serviceFilter, employeeFilter, toast]);

  const fetchEmployees = useCallback(async () => {
    try {
      setEmployees(await fetchAllEmployees<EmployeeOption>({ active: "true" }));
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
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = leaveSchema.safeParse({
      employeeId: form.employeeId,
      startDate: form.startDate,
      endDate: form.endDate,
      reason: form.reason,
      absenceCategory: form.absenceCategory || undefined,
      notifyOrReplace: form.notifyOrReplace?.trim() || undefined,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[String(i.path[0])] = i.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        ...result.data,
        ...(result.data.absenceCategory ? { absenceCategory: result.data.absenceCategory } : {}),
        ...(result.data.notifyOrReplace?.trim() ? { notifyOrReplace: result.data.notifyOrReplace.trim() } : {}),
      };
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setModalOpen(false);
        toast.success("Demande enregistrée.");
        fetchLeaves();
        refreshNavCounts();
      } else {
        setSubmitError(typeof json.error === "string" ? json.error : "Impossible d'enregistrer la demande.");
      }
    } catch (e) {
      console.error(e);
      setSubmitError("Erreur réseau. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteLeave = async (leave: LeaveRequest) => {
    const ok = await confirm({
      title: "Annuler cette demande ?",
      message: `Demande de ${leave.employee.firstName} ${leave.employee.lastName} (${shortDate(leave.startDate)} → ${shortDate(leave.endDate)}).\n\nElle reste visible dans l'historique, marquée « annulée », mais n'est plus prise en compte pour le pointage.`,
      confirmLabel: "Annuler la demande",
      cancelLabel: "Garder",
    });
    if (!ok) return;
    setDeletingId(leave.id);
    try {
      const res = await fetch(`/api/leaves/${leave.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetailLeave(null);
        toast.success("Demande annulée.");
        fetchLeaves();
        refreshNavCounts();
      } else {
        toast.error(typeof json.error === "string" ? json.error : "Annulation impossible.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau.");
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
      const ws = workbook.addWorksheet("Autorisations d'absence");
      ws.columns = [
        { header: "Employé", key: "employee", width: 24 },
        { header: "Matricule", key: "matricule", width: 18 },
        { header: "Service", key: "service", width: 14 },
        { header: "Début", key: "start", width: 12 },
        { header: "Fin", key: "end", width: 12 },
        { header: "Durée (j)", key: "duration", width: 10 },
        { header: "Motif", key: "reason", width: 36 },
        { header: "Catégorie", key: "category", width: 22 },
        { header: "Origine", key: "source", width: 18 },
        { header: "Statut", key: "status", width: 22 },
        { header: "Créée le", key: "created", width: 14 },
      ];
      all.forEach((leave) => {
        const cancelled = Boolean(leave.cancelledAt);
        ws.addRow({
          employee: `${leave.employee.lastName} ${leave.employee.firstName}`,
          matricule: leave.employee.matricule,
          service: leave.employee.service ?? "—",
          start: excelDay(leave.startDate),
          end: excelDay(leave.endDate),
          duration: calendarDays(leave.startDate, leave.endDate),
          reason: leave.reason,
          category: leaveAbsenceCategoryLabel(leave.absenceCategory ?? undefined),
          source: leaveSubmissionSourceLabel(leave.submissionSource),
          status: `${statusLabel("request", leave.status)}${cancelled ? " — annulée" : ""}`,
          created: excelDay(leave.createdAt, { local: true }),
        });
      });
      setColumnFormats(ws, { start: EXCEL_DATE_FORMAT, end: EXCEL_DATE_FORMAT, created: EXCEL_DATE_FORMAT });
      finishSheet(ws);
      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `autorisations_absence_${fileDateStamp()}.xlsx`
      );
      toast.success(`${all.length} demande${all.length > 1 ? "s" : ""} exportée${all.length > 1 ? "s" : ""}.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setExporting(false);
    }
  };

  const updateStatus = async (leave: LeaveRequest, status: "APPROVED" | "REJECTED") => {
    setActioningId(leave.id);
    try {
      const res = await fetch(`/api/leaves/${leave.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(typeof json.error === "string" ? json.error : "La décision n'a pas été enregistrée.");
        return;
      }
      toast.success(
        `Demande de ${leave.employee.firstName} ${leave.employee.lastName} ${status === "APPROVED" ? "approuvée" : "refusée"}.`
      );
      fetchLeaves();
      refreshNavCounts();
      setDetailLeave(null);
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau : la décision n'a pas été enregistrée.");
    } finally {
      setActioningId(null);
    }
  };

  const downloadWord = async (id: string) => {
    const msg = await downloadLeaveRequestWord(id);
    if (msg) toast.error(msg);
  };

  const totalPages = Math.ceil(total / perPage);
  const durationPreview =
    form.startDate && form.endDate && new Date(form.endDate) >= new Date(form.startDate)
      ? formatDuration(form.startDate, form.endDate)
      : null;

  const toggleStatus = (value: string) => setFilters({ status: statusFilter === value ? "" : value, page: "1" });
  const hasActiveFilters = Boolean(statusFilter || dateFrom || dateTo || serviceFilter || employeeFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Autorisations d'absence"
        description="Courtes absences et sorties autorisées, saisies par les RH ou envoyées par les employés depuis WhatsApp."
        actions={
          <>
            <Button variant="secondary" onClick={() => void exportExcel()} loading={exporting} icon={<Download className="h-4 w-4" />}>
              Exporter
            </Button>
            <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
              Nouvelle demande
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatTile icon={ClipboardList} label="Demandes" value={stats.total} tone="neutral" />
        <StatTile icon={Clock} label="En attente" value={stats.pending} tone="warning" onClick={() => toggleStatus("PENDING")} active={statusFilter === "PENDING"} />
        <StatTile icon={UserCheck} label="Approuvées" value={stats.approved} tone="success" onClick={() => toggleStatus("APPROVED")} active={statusFilter === "APPROVED"} />
        <StatTile icon={UserX} label="Refusées" value={stats.rejected} tone="danger" onClick={() => toggleStatus("REJECTED")} active={statusFilter === "REJECTED"} />
        <StatTile icon={Archive} label="Annulées" value={stats.cancelled ?? 0} tone="neutral" />
      </div>

      <FilterBar
        actions={
          hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              onClick={() => setFilters({ status: "", from: "", to: "", service: "", employee: "", page: "1" })}
            >
              Réinitialiser
            </Button>
          ) : undefined
        }
      >
        <FilterField label="Statut">
          <Select value={statusFilter} onChange={(e) => setFilters({ status: e.target.value, page: "1" })}>
            <option value="">Tous les statuts</option>
            <option value="PENDING">En attente</option>
            <option value="APPROVED">Approuvée</option>
            <option value="REJECTED">Refusée</option>
          </Select>
        </FilterField>
        <FilterField label="Du">
          <Input type="date" value={dateFrom} onChange={(e) => setFilters({ from: e.target.value, page: "1" })} />
        </FilterField>
        <FilterField label="Au">
          <Input type="date" value={dateTo} onChange={(e) => setFilters({ to: e.target.value, page: "1" })} />
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
        <FilterField label="Employé" className="lg:min-w-[220px]">
          <Select value={employeeFilter} onChange={(e) => setFilters({ employee: e.target.value, page: "1" })}>
            <option value="">Tous les employés</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.lastName} {emp.firstName}
                {emp.service ? ` — ${emp.service}` : ""}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Employé</Th>
              <Th>Période</Th>
              <Th>Durée</Th>
              <Th>Motif</Th>
              <Th>Origine</Th>
              <Th>Statut</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <TableSkeletonRows cols={7} rows={4} />
            ) : leaves.length === 0 ? (
              <TableMessageRow cols={7}>
                <EmptyState
                  icon={CalendarOff}
                  title="Aucune demande d'autorisation d'absence"
                  description={hasActiveFilters ? "Modifiez les filtres pour élargir la recherche." : "Les demandes saisies ou envoyées depuis WhatsApp apparaîtront ici."}
                  action={
                    <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                      Nouvelle demande
                    </Button>
                  }
                />
              </TableMessageRow>
            ) : (
              leaves.map((leave) => {
                const isOff = Boolean(leave.cancelledAt);
                const busy = actioningId === leave.id || deletingId === leave.id;
                return (
                  <Tr key={leave.id} onClick={() => setDetailLeave(leave)} className={cn("cursor-pointer", isOff && "opacity-60")}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            leave.status === "PENDING"
                              ? "bg-amber-100 text-amber-700"
                              : leave.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                          )}
                        >
                          {leave.employee.firstName[0]}
                          {leave.employee.lastName[0]}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">
                            {leave.employee.firstName} {leave.employee.lastName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {[leave.employee.matricule, leave.employee.service].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {shortDate(leave.startDate)}
                      {leave.endDate !== leave.startDate && <> → {shortDate(leave.endDate)}</>}
                    </Td>
                    <Td>
                      <Badge>{formatDuration(leave.startDate, leave.endDate)}</Badge>
                    </Td>
                    <Td className="max-w-[220px]">
                      <span className="block truncate" title={leave.reason}>
                        {leave.reason}
                      </span>
                      {leave.absenceCategory && (
                        <span className="block truncate text-xs text-slate-500">{leaveAbsenceCategoryLabel(leave.absenceCategory)}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={leave.submissionSource === "EMPLOYEE_WHATSAPP_FORM" ? "brand" : "neutral"}>
                        {leaveSubmissionSourceLabel(leave.submissionSource)}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge kind="request" value={leave.status} />
                        {isOff && <Badge>Annulée</Badge>}
                      </div>
                    </Td>
                    <Td align="right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        {leave.status === "PENDING" && !isOff && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => updateStatus(leave, "APPROVED")}
                              disabled={busy}
                              className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                              title="Approuver"
                              aria-label={`Approuver la demande de ${leave.employee.firstName} ${leave.employee.lastName}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => updateStatus(leave, "REJECTED")}
                              disabled={busy}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Refuser"
                              aria-label={`Refuser la demande de ${leave.employee.firstName} ${leave.employee.lastName}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => setDetailLeave(leave)} title="Voir le détail" aria-label="Voir le détail">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!isOff && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteLeave(leave)}
                            disabled={busy}
                            className="hover:bg-red-50 hover:text-red-600"
                            title="Annuler (conserver l’historique)"
                            aria-label="Annuler la demande"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
        {!loading && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={perPage}
            itemLabel={["demande", "demandes"]}
            onPageChange={(p) => setFilters({ page: String(p) })}
          />
        )}
      </Card>

      {/* Nouvelle demande */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dismissible={!submitting}
        title="Nouvelle autorisation d'absence"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" form="leave-form" loading={submitting}>
              Enregistrer la demande
            </Button>
          </>
        }
      >
        <form id="leave-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</div>
          )}
          <Field label="Employé" required error={errors.employeeId}>
            {(id) => (
              <Select id={id} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} aria-invalid={Boolean(errors.employeeId)}>
                <option value="">Sélectionner un employé</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.lastName} {emp.firstName}
                    {emp.service ? ` — ${emp.service}` : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Date de début" required error={errors.startDate}>
              {(id) => (
                <Input id={id} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate || e.target.value })} aria-invalid={Boolean(errors.startDate)} />
              )}
            </Field>
            <Field label="Date de fin" required error={errors.endDate}>
              {(id) => (
                <Input id={id} type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, endDate: e.target.value })} aria-invalid={Boolean(errors.endDate)} />
              )}
            </Field>
          </div>
          {durationPreview && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              Durée : <span className="font-medium">{durationPreview}</span>
            </p>
          )}
          <Field label="Type / catégorie (optionnel)">
            {(id) => (
              <Select id={id} value={form.absenceCategory || ""} onChange={(e) => setForm({ ...form, absenceCategory: e.target.value as LeaveAbsenceCategory | "" })}>
                <option value="">Non précisée</option>
                {ORDERED_LEAVE_ABSENCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {LEAVE_ABSENCE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Motif" required error={errors.reason}>
            {(id) => (
              <>
                <div className="mb-2 flex flex-wrap gap-2">
                  {MOTIF_SUGGESTIONS.map((motif) => (
                    <button
                      key={motif}
                      type="button"
                      onClick={() => setForm({ ...form, reason: motif })}
                      aria-pressed={form.reason === motif}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                        form.reason === motif ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {motif}
                    </button>
                  ))}
                </div>
                <Textarea id={id} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} placeholder="Détail du motif si besoin" aria-invalid={Boolean(errors.reason)} />
              </>
            )}
          </Field>
          <Field label="Personne ou service à prévenir (optionnel)">
            {(id) => (
              <Input id={id} value={form.notifyOrReplace} onChange={(e) => setForm({ ...form, notifyOrReplace: e.target.value })} placeholder="Joignabilité pendant l'absence…" maxLength={500} />
            )}
          </Field>
        </form>
      </Modal>

      {/* Détail */}
      <Modal
        open={detailLeave !== null}
        onClose={() => setDetailLeave(null)}
        variant="drawer"
        className="max-w-md"
        title="Détail de la demande"
        footer={
          detailLeave && !detailLeave.cancelledAt ? (
            <div className="flex w-full flex-col gap-2">
              {detailLeave.status === "PENDING" && (
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    className="flex-1"
                    onClick={() => updateStatus(detailLeave, "APPROVED")}
                    loading={actioningId === detailLeave.id}
                    disabled={deletingId === detailLeave.id}
                    icon={<Check className="h-4 w-4" />}
                  >
                    Approuver
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={() => updateStatus(detailLeave, "REJECTED")}
                    disabled={actioningId === detailLeave.id || deletingId === detailLeave.id}
                    icon={<XCircle className="h-4 w-4" />}
                  >
                    Refuser
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                onClick={() => deleteLeave(detailLeave)}
                loading={deletingId === detailLeave.id}
                disabled={actioningId === detailLeave.id}
                icon={<Trash2 className="h-4 w-4" />}
                className="hover:bg-red-50 hover:text-red-700"
              >
                Annuler la demande (historique conservé)
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailLeave && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  detailLeave.status === "PENDING"
                    ? "bg-amber-100 text-amber-700"
                    : detailLeave.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                )}
              >
                {detailLeave.employee.firstName[0]}
                {detailLeave.employee.lastName[0]}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {detailLeave.employee.firstName} {detailLeave.employee.lastName}
                </p>
                <p className="text-sm text-slate-500">{detailLeave.employee.service ?? detailLeave.employee.matricule}</p>
              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
                <StatusBadge kind="request" value={detailLeave.status} />
                {detailLeave.cancelledAt && <Badge>Annulée</Badge>}
              </div>
            </div>

            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              <DetailLine label="Du" value={new Date(detailLeave.startDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} />
              <DetailLine label="Au" value={new Date(detailLeave.endDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
              <DetailLine label="Durée" value={formatDuration(detailLeave.startDate, detailLeave.endDate)} />
              <DetailLine label="Catégorie" value={leaveAbsenceCategoryLabel(detailLeave.absenceCategory ?? undefined)} />
              <DetailLine label="À prévenir" value={detailLeave.notifyOrReplace?.trim() || "—"} />
              <DetailLine label="Origine" value={leaveSubmissionSourceLabel(detailLeave.submissionSource)} />
            </dl>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Motif</p>
              <p className="whitespace-pre-line text-sm text-slate-700">{detailLeave.reason}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => void downloadLeaveRequestPdf(detailLeave).catch(() => toast.error("Le PDF n'a pas pu être généré."))} icon={<Download className="h-4 w-4" />}>
                PDF
              </Button>
              <Button variant="secondary" onClick={() => void downloadWord(detailLeave.id)} icon={<FileText className="h-4 w-4" />}>
                Word (.docx)
              </Button>
            </div>

            {detailLeave.approvedBy && (
              <div className="rounded-xl border border-slate-200 p-4 text-sm">
                <p className="mb-1 text-xs font-medium text-slate-500">Décision</p>
                <p className="text-slate-700">
                  {detailLeave.status === "REJECTED" ? "Refusée" : "Validée"} par <span className="font-medium">{detailLeave.approvedBy}</span>
                  {detailLeave.updatedAt && <span className="text-slate-500"> le {new Date(detailLeave.updatedAt).toLocaleDateString("fr-FR")}</span>}
                </p>
              </div>
            )}
            {detailLeave.cancelledAt && (
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm">
                <p className="mb-1 text-xs font-medium text-slate-600">Annulation (historique conservé)</p>
                <p className="text-slate-700">
                  Le {new Date(detailLeave.cancelledAt).toLocaleString("fr-FR")}
                  {detailLeave.cancelledBy ? (
                    <>
                      {" "}
                      par <span className="font-medium">{detailLeave.cancelledBy}</span>
                    </>
                  ) : null}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

/** Télécharge le .docx ; renvoie un message d'erreur, ou null si tout s'est bien passé. */
async function downloadLeaveRequestWord(id: string): Promise<string | null> {
  const res = await fetch(`/api/leaves/${id}/document`, { credentials: "include" });
  if (!res.ok) {
    let msg = "Export Word impossible.";
    try {
      const j = (await res.json()) as { error?: string };
      if (typeof j?.error === "string") msg = j.error;
    } catch {
      /* ignore */
    }
    return msg;
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  const match = cd?.match(/filename="([^"]+)"/);
  downloadBlob(blob, match?.[1] ?? `demande_autorisation_${id.slice(0, 8)}.docx`);
  return null;
}
