"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import {
  Plus,
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
  Trash2,
  Archive,
  FileSpreadsheet,
  FileText,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getMissionDurationDays } from "@/lib/mission-days";
import { statusLabel } from "@/lib/status-labels";
import { fetchAllEmployees } from "@/lib/fetch-all-employees";
import { downloadBlob, downloadMissionOrderDocx, downloadMissionOrderPdf } from "@/lib/documents/download";
import { EXCEL_DATE_FORMAT, excelDay, finishSheet, setColumnFormats } from "@/lib/excel-format";
import { fileDateStamp, fmtDayFr, generatedAtLabel } from "@/lib/export-format";
import { PDF_TABLE, addPdfHeader, createPdf, savePdf } from "@/lib/pdf-kit";
import { useUrlFilters } from "@/lib/use-url-filters";
import { refreshNavCounts } from "@/lib/use-nav-counts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge, StructureBadge } from "@/components/ui/StatusBadge";
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

interface Mission {
  id: string;
  orderNumber?: string | null;
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

type EmployeeOption = { id: string; firstName: string; lastName: string; service?: string };

const missionSchema = z
  .object({
    employeeId: z.string().min(1, "L'employé est requis"),
    startDate: z.string().min(1, "La date de début est requise"),
    endDate: z.string().min(1, "La date de fin est requise"),
    reason: z.string().min(1, "Le motif est requis"),
    location: z.string().optional(),
    hostStructure: z.enum(["SCPB", "AFREXIA"]).optional(),
    transport: z.string().optional(),
    lodging: z.string().optional(),
    expenses: z.string().optional(),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, {
    message: "La date de fin doit être après la date de début",
    path: ["endDate"],
  });

function formatDuration(start: string, end: string): string {
  const days = getMissionDurationDays(start, end);
  if (days <= 1) return "1 jour";
  return `${days} jours`;
}

const shortDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const longDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const EMPTY_FORM = {
  employeeId: "",
  startDate: "",
  endDate: "",
  reason: "",
  location: "",
  hostStructure: "",
  transport: "",
  lodging: "",
  expenses: "",
};

export default function MissionsPage() {
  return (
    <Suspense fallback={null}>
      <MissionsContent />
    </Suspense>
  );
}

function MissionsContent() {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useUrlFilters({ status: "", from: "", to: "", service: "", employee: "", page: "1" });
  const statusFilter = filters.status;
  const dateFrom = filters.from;
  const dateTo = filters.to;
  const serviceFilter = filters.service;
  const employeeFilter = filters.employee;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 });
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailMission, setDetailMission] = useState<Mission | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const perPage = 20;

  const listParams = useCallback(
    (): Record<string, string> => ({
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { startDate: dateFrom }),
      ...(dateTo && { endDate: dateTo }),
      ...(serviceFilter && { service: serviceFilter }),
      ...(employeeFilter && { employeeId: employeeFilter }),
    }),
    [statusFilter, dateFrom, dateTo, serviceFilter, employeeFilter]
  );

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(perPage), ...listParams() });
    try {
      const res = await fetch(`/api/missions?${params}`);
      const json = await res.json();
      setMissions(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
      if (json.stats) setStats(json.stats);
      if (json.services) setServices(json.services);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les missions.");
    } finally {
      setLoading(false);
    }
  }, [page, listParams, toast]);

  const fetchEmployees = useCallback(async () => {
    try {
      setEmployees(await fetchAllEmployees<EmployeeOption>({ active: "true" }));
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
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError("");
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = missionSchema.safeParse({ ...form, hostStructure: form.hostStructure || undefined });
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
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });
      if (res.ok) {
        setModalOpen(false);
        toast.success("Mission enregistrée.");
        fetchMissions();
        refreshNavCounts();
      } else {
        const json = await res.json().catch(() => ({}));
        setSubmitError(typeof json.error === "string" ? json.error : "Impossible d'enregistrer la mission.");
      }
    } catch (e) {
      console.error(e);
      setSubmitError("Erreur réseau. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (mission: Mission, status: "APPROVED" | "REJECTED") => {
    setActioningId(mission.id);
    try {
      const res = await fetch(`/api/missions/${mission.id}`, {
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
        `Mission de ${mission.employee.firstName} ${mission.employee.lastName} ${status === "APPROVED" ? "approuvée" : "refusée"}.`
      );
      fetchMissions();
      refreshNavCounts();
      setDetailMission(null);
    } catch (e) {
      console.error(e);
      toast.error("Erreur réseau : la décision n'a pas été enregistrée.");
    } finally {
      setActioningId(null);
    }
  };

  const deleteMission = async (mission: Mission) => {
    const ok = await confirm({
      title: "Annuler cette mission ?",
      message: `Mission de ${mission.employee.firstName} ${mission.employee.lastName} (${shortDate(mission.startDate)} → ${shortDate(mission.endDate)}).\n\nElle reste visible dans l'historique, marquée « annulée », mais n'est plus prise en compte pour le pointage.`,
      confirmLabel: "Annuler la mission",
      cancelLabel: "Garder",
    });
    if (!ok) return;
    setDeletingId(mission.id);
    try {
      const res = await fetch(`/api/missions/${mission.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDetailMission(null);
        toast.success("Mission annulée.");
        fetchMissions();
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

  /** L'API plafonne `limit` à 100 : on enchaîne les pages pour exporter toute la sélection. */
  const fetchAllMissions = async (): Promise<Mission[]> => {
    const pageSize = 100;
    const out: Mission[] = [];
    for (let p = 1; p <= 100; p++) {
      const params = new URLSearchParams({ ...listParams(), page: String(p), limit: String(pageSize) });
      const res = await fetch(`/api/missions?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Export impossible");
      const batch: Mission[] = json.data ?? [];
      out.push(...batch);
      if (batch.length < pageSize) break;
    }
    return out;
  };

  const runExport = async (kind: "excel" | "pdf") => {
    setExporting(kind);
    try {
      const all = await fetchAllMissions();
      if (kind === "excel") await exportExcel(all);
      else await exportPdf(all);
      toast.success(`${all.length} mission${all.length > 1 ? "s" : ""} exportée${all.length > 1 ? "s" : ""}.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setExporting(null);
    }
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
        title="Missions"
        description="Ordres de mission et déplacements professionnels, entre SCPB, AFREXIA ou à l'extérieur."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void runExport("excel")}
              loading={exporting === "excel"}
              disabled={exporting !== null}
              icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}
            >
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runExport("pdf")}
              loading={exporting === "pdf"}
              disabled={exporting !== null}
              icon={<FileText className="h-4 w-4 text-red-600" />}
            >
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
              Nouvelle mission
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatTile icon={Briefcase} label="Missions" value={stats.total} tone="neutral" />
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
              <Th>Origine → accueil</Th>
              <Th>Période</Th>
              <Th>Durée</Th>
              <Th>Lieu</Th>
              <Th>Statut</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <TableSkeletonRows cols={7} rows={4} />
            ) : missions.length === 0 ? (
              <TableMessageRow cols={7}>
                <EmptyState
                  icon={Briefcase}
                  title="Aucune mission"
                  description={hasActiveFilters ? "Modifiez les filtres pour élargir la recherche." : "Créez un ordre de mission, ou attendez une demande envoyée depuis WhatsApp."}
                  action={
                    <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                      Nouvelle mission
                    </Button>
                  }
                />
              </TableMessageRow>
            ) : (
              missions.map((mission) => {
                const isOff = Boolean(mission.cancelledAt);
                const busy = actioningId === mission.id || deletingId === mission.id;
                return (
                  <Tr key={mission.id} onClick={() => setDetailMission(mission)} className={cn("cursor-pointer", isOff && "opacity-60")}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            mission.status === "PENDING"
                              ? "bg-amber-100 text-amber-700"
                              : mission.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                          )}
                        >
                          {mission.employee.firstName[0]}
                          {mission.employee.lastName[0]}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800">
                            {mission.employee.firstName} {mission.employee.lastName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {[mission.orderNumber ? `N° ${mission.orderNumber}` : mission.employee.matricule, mission.employee.service]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {mission.originStructure ? <StructureBadge value={mission.originStructure} /> : <span className="text-slate-400">—</span>}
                        <span className="text-slate-300">→</span>
                        {mission.hostStructure ? <StructureBadge value={mission.hostStructure} /> : <span className="text-xs text-slate-500">Externe</span>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {shortDate(mission.startDate)}
                      {mission.endDate !== mission.startDate && <> → {shortDate(mission.endDate)}</>}
                    </Td>
                    <Td>
                      <Badge>{formatDuration(mission.startDate, mission.endDate)}</Badge>
                    </Td>
                    <Td className="max-w-[180px]">
                      {mission.location ? (
                        <span className="inline-flex max-w-full items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{mission.location}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge kind="request" value={mission.status} />
                        {isOff && <Badge>Annulée</Badge>}
                      </div>
                    </Td>
                    <Td align="right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        {mission.status === "PENDING" && !isOff && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => updateStatus(mission, "APPROVED")}
                              disabled={busy}
                              className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                              title="Approuver"
                              aria-label={`Approuver la mission de ${mission.employee.firstName} ${mission.employee.lastName}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => updateStatus(mission, "REJECTED")}
                              disabled={busy}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              title="Refuser"
                              aria-label={`Refuser la mission de ${mission.employee.firstName} ${mission.employee.lastName}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => setDetailMission(mission)} title="Voir le détail" aria-label="Voir le détail">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!isOff && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteMission(mission)}
                            disabled={busy}
                            className="hover:bg-red-50 hover:text-red-600"
                            title="Annuler (conserver l’historique)"
                            aria-label="Annuler la mission"
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
            itemLabel={["mission", "missions"]}
            onPageChange={(p) => setFilters({ page: String(p) })}
          />
        )}
      </Card>

      {/* Nouvelle mission */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dismissible={!submitting}
        title="Nouvelle mission"
        description="Créer un ordre de mission pour un employé."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
              Annuler
            </Button>
            <Button type="submit" form="mission-form" loading={submitting}>
              Enregistrer la mission
            </Button>
          </>
        }
      >
        <form id="mission-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Structure d'accueil" hint="Structure dans laquelle la mission est effectuée.">
              {(id) => (
                <Select id={id} value={form.hostStructure} onChange={(e) => setForm({ ...form, hostStructure: e.target.value })}>
                  <option value="">Aucune (mission externe)</option>
                  <option value="SCPB">SCPB</option>
                  <option value="AFREXIA">AFREXIA</option>
                </Select>
              )}
            </Field>
            <Field label="Lieu de mission">
              {(id) => (
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input id={id} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex. : Douala, Kribi…" className="pl-9" />
                </div>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Transport">
              {(id) => <Input id={id} value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })} placeholder="Véhicule société, avion…" />}
            </Field>
            <Field label="Hébergement">
              {(id) => <Input id={id} value={form.lodging} onChange={(e) => setForm({ ...form, lodging: e.target.value })} placeholder="Hôtel à charge…" />}
            </Field>
            <Field label="Frais">
              {(id) => <Input id={id} value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} placeholder="Per diem selon barème…" />}
            </Field>
          </div>
          <Field label="Motif" required error={errors.reason}>
            {(id) => (
              <Textarea id={id} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} placeholder="Objet de la mission" aria-invalid={Boolean(errors.reason)} />
            )}
          </Field>
        </form>
      </Modal>

      {/* Détail */}
      <Modal
        open={detailMission !== null}
        onClose={() => setDetailMission(null)}
        variant="drawer"
        className="max-w-md"
        title="Détail de la mission"
        description={detailMission?.orderNumber ? `Ordre de mission n° ${detailMission.orderNumber}` : undefined}
        footer={
          detailMission && !detailMission.cancelledAt ? (
            <div className="flex w-full flex-col gap-2">
              {detailMission.status === "PENDING" && (
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    className="flex-1"
                    onClick={() => updateStatus(detailMission, "APPROVED")}
                    loading={actioningId === detailMission.id}
                    disabled={deletingId === detailMission.id}
                    icon={<Check className="h-4 w-4" />}
                  >
                    Approuver
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={() => updateStatus(detailMission, "REJECTED")}
                    disabled={actioningId === detailMission.id || deletingId === detailMission.id}
                    icon={<XCircle className="h-4 w-4" />}
                  >
                    Refuser
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                onClick={() => deleteMission(detailMission)}
                loading={deletingId === detailMission.id}
                disabled={actioningId === detailMission.id}
                icon={<Trash2 className="h-4 w-4" />}
                className="hover:bg-red-50 hover:text-red-700"
              >
                Annuler la mission (historique conservé)
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailMission && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  detailMission.status === "PENDING"
                    ? "bg-amber-100 text-amber-700"
                    : detailMission.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                )}
              >
                {detailMission.employee.firstName[0]}
                {detailMission.employee.lastName[0]}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">
                  {detailMission.employee.firstName} {detailMission.employee.lastName}
                </p>
                <p className="text-sm text-slate-500">{detailMission.employee.service ?? detailMission.employee.matricule}</p>
              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
                <StatusBadge kind="request" value={detailMission.status} />
                {detailMission.cancelledAt && <Badge>Annulée</Badge>}
              </div>
            </div>

            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              <DetailRow label="Du" value={longDate(detailMission.startDate)} />
              <DetailRow label="Au" value={longDate(detailMission.endDate)} />
              <DetailRow label="Durée prévue" value={formatDuration(detailMission.startDate, detailMission.endDate)} />
              {detailMission.originStructure && <DetailRow label="Structure d'origine" value={detailMission.originStructure} />}
              <DetailRow label="Structure d'accueil" value={detailMission.hostStructure ?? "Mission externe"} />
              {detailMission.location && <DetailRow label="Lieu" value={detailMission.location} />}
              {detailMission.transport && <DetailRow label="Transport" value={detailMission.transport} />}
              {detailMission.lodging && <DetailRow label="Hébergement" value={detailMission.lodging} />}
              {detailMission.expenses && <DetailRow label="Frais" value={detailMission.expenses} />}
            </dl>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-500">Motif</p>
              <p className="whitespace-pre-line text-sm text-slate-700">{detailMission.reason}</p>
            </div>

            {detailMission.status === "APPROVED" && !detailMission.cancelledAt && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ordre de mission</p>
                <Button
                  className="w-full"
                  icon={<Download className="h-4 w-4" />}
                  onClick={() => window.open(`/api/missions/${detailMission.id}/document`, "_blank")}
                >
                  Modèle officiel (Word)
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={<FileText className="h-4 w-4" />} onClick={() => void downloadMissionOrderPdf(detailMission).catch(() => toast.error("Le PDF n'a pas pu être généré."))}>
                    PDF
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Download className="h-4 w-4" />}
                    onClick={() => void downloadMissionOrderDocx(detailMission).catch(() => toast.error("Le document Word n'a pas pu être généré."))}
                  >
                    Word simple
                  </Button>
                </div>
              </div>
            )}

            <dl className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm">
              <dt className="text-xs font-medium text-slate-500">Historique</dt>
              <div className="flex justify-between">
                <span className="text-slate-500">Créée le</span>
                <span className="text-slate-700">{new Date(detailMission.createdAt).toLocaleDateString("fr-FR")}</span>
              </div>
              {detailMission.approvedBy && (
                <div className="flex justify-between">
                  <span className="text-slate-500">{detailMission.status === "REJECTED" ? "Refusée par" : "Validée par"}</span>
                  <span className="font-medium text-slate-700">
                    {detailMission.approvedBy}
                    {detailMission.updatedAt && (
                      <span className="font-normal text-slate-500"> le {new Date(detailMission.updatedAt).toLocaleDateString("fr-FR")}</span>
                    )}
                  </span>
                </div>
              )}
              {detailMission.cancelledAt && (
                <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
                  <span className="font-medium text-slate-600">Annulation</span>
                  <span className="text-right text-slate-700">
                    {new Date(detailMission.cancelledAt).toLocaleString("fr-FR")}
                    {detailMission.cancelledBy ? <span className="block text-xs text-slate-500">par {detailMission.cancelledBy}</span> : null}
                  </span>
                </div>
              )}
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function payrollSummary(approved: Mission[]) {
  const byEmployee = new Map<string, { emp: Mission["employee"]; origin: string; host: string; duration: number; count: number }>();
  approved.forEach((m) => {
    const key = `${m.employee.id}-${m.originStructure ?? ""}-${m.hostStructure ?? ""}`;
    const existing = byEmployee.get(key);
    if (existing) {
      existing.duration += getMissionDurationDays(m.startDate, m.endDate);
      existing.count++;
    } else {
      byEmployee.set(key, {
        emp: m.employee,
        origin: m.originStructure ?? "—",
        host: m.hostStructure ?? "—",
        duration: getMissionDurationDays(m.startDate, m.endDate),
        count: 1,
      });
    }
  });
  return Array.from(byEmployee.values());
}

async function exportExcel(all: Mission[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();

  const ws = workbook.addWorksheet("Toutes les missions");
  ws.columns = [
    { header: "N° ordre", key: "order", width: 14 },
    { header: "Employé", key: "employee", width: 22 },
    { header: "Matricule", key: "matricule", width: 16 },
    { header: "Service", key: "service", width: 12 },
    { header: "Origine", key: "origin", width: 10 },
    { header: "Accueil", key: "host", width: 10 },
    { header: "Début", key: "start", width: 12 },
    { header: "Fin", key: "end", width: 12 },
    { header: "Durée (j)", key: "duration", width: 10 },
    { header: "Lieu", key: "location", width: 18 },
    { header: "Motif", key: "reason", width: 30 },
    { header: "Statut", key: "status", width: 14 },
  ];
  all.forEach((m) => {
    ws.addRow({
      order: m.orderNumber ?? "—",
      employee: `${m.employee.lastName} ${m.employee.firstName}`,
      matricule: m.employee.matricule,
      service: m.employee.service ?? "—",
      origin: m.originStructure ?? "—",
      host: m.hostStructure ?? "—",
      start: excelDay(m.startDate),
      end: excelDay(m.endDate),
      duration: getMissionDurationDays(m.startDate, m.endDate),
      location: m.location ?? "—",
      reason: m.reason,
      status: `${statusLabel("request", m.status)}${m.cancelledAt ? " — annulée" : ""}`,
    });
  });
  setColumnFormats(ws, { start: EXCEL_DATE_FORMAT, end: EXCEL_DATE_FORMAT });
  finishSheet(ws);

  const approved = all.filter((m) => m.status === "APPROVED" && !m.cancelledAt);
  if (approved.length > 0) {
    const wsPaie = workbook.addWorksheet("Récapitulatif paie");
    wsPaie.columns = [
      { header: "Employé", key: "employee", width: 22 },
      { header: "Matricule", key: "matricule", width: 16 },
      { header: "Structure origine", key: "origin", width: 16 },
      { header: "Structure accueil", key: "host", width: 16 },
      { header: "Durée totale (j)", key: "duration", width: 14 },
      { header: "Nb missions", key: "count", width: 12 },
    ];
    payrollSummary(approved).forEach((v) => {
      wsPaie.addRow({
        employee: `${v.emp.lastName} ${v.emp.firstName}`,
        matricule: v.emp.matricule,
        origin: v.origin,
        host: v.host,
        duration: v.duration,
        count: v.count,
      });
    });
    finishSheet(wsPaie);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `missions_${fileDateStamp()}.xlsx`
  );
}

async function exportPdf(all: Mission[]) {
  const { autoTable } = await import("jspdf-autotable");
  const doc = await createPdf({ orientation: "landscape", unit: "mm", format: "a4" });

  const pending = all.filter((m) => m.status === "PENDING" && !m.cancelledAt).length;
  const approvedCount = all.filter((m) => m.status === "APPROVED" && !m.cancelledAt).length;
  const rejected = all.filter((m) => m.status === "REJECTED" && !m.cancelledAt).length;
  const cancelled = all.filter((m) => m.cancelledAt).length;
  const startY = await addPdfHeader(doc, {
    title: "Rapport des missions",
    subtitle: [
      `${all.length} mission${all.length > 1 ? "s" : ""} · généré le ${generatedAtLabel()}`,
      `En attente : ${pending}   ·   Approuvées : ${approvedCount}   ·   Refusées : ${rejected}   ·   Annulées : ${cancelled}`,
    ],
  });

  autoTable(doc, {
    ...PDF_TABLE,
    startY,
    head: [["N° ordre", "Employé", "Origine", "Accueil", "Début", "Fin", "Durée", "Lieu", "Statut"]],
    body: all.map((m) => [
      m.orderNumber ?? "—",
      `${m.employee.lastName} ${m.employee.firstName}`,
      m.originStructure ?? "—",
      m.hostStructure ?? "—",
      fmtDayFr(m.startDate),
      fmtDayFr(m.endDate),
      formatDuration(m.startDate, m.endDate),
      m.location ?? "—",
      `${statusLabel("request", m.status)}${m.cancelledAt ? " (annulée)" : ""}`,
    ]),
    columnStyles: { 6: { halign: "center" } },
  });

  const approved = all.filter((m) => m.status === "APPROVED" && !m.cancelledAt);
  if (approved.length > 0) {
    doc.addPage("a4", "landscape");
    const y = await addPdfHeader(doc, {
      title: "Récapitulatif paie — missions approuvées",
      subtitle: `${approved.length} mission${approved.length > 1 ? "s" : ""} approuvée${approved.length > 1 ? "s" : ""}`,
    });
    autoTable(doc, {
      ...PDF_TABLE,
      startY: y,
      head: [["Employé", "Matricule", "Origine", "Accueil", "Durée totale", "Nb missions"]],
      body: payrollSummary(approved).map((v) => [
        `${v.emp.lastName} ${v.emp.firstName}`,
        v.emp.matricule,
        v.origin,
        v.host,
        `${v.duration} j`,
        v.count,
      ]),
      columnStyles: { 4: { halign: "center" }, 5: { halign: "center" } },
    });
  }

  savePdf(doc, `missions_${fileDateStamp()}.pdf`);
}
