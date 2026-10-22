"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { Clock, Check, XCircle, UserCheck, UserX, Hourglass, FileSpreadsheet, RotateCcw, CheckCheck } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { statusLabel } from "@/lib/status-labels";
import { downloadBlob } from "@/lib/documents/download";
import { EXCEL_DATE_FORMAT, EXCEL_DURATION_FORMAT, excelDay, excelDuration, finishSheet, setColumnFormats } from "@/lib/excel-format";
import { fileDateStamp } from "@/lib/export-format";
import { useUrlFilters } from "@/lib/use-url-filters";
import { refreshNavCounts } from "@/lib/use-nav-counts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
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
import StructureOptions, { useHasSeveralStructures } from "@/components/org/StructureOptions";

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

function formatOvertime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

const dayLabel = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

export default function OvertimePage() {
  return (
    <Suspense fallback={null}>
      <OvertimeContent />
    </Suspense>
  );
}

function OvertimeContent() {
  const toast = useToast();
  const confirm = useConfirm();
  const severalStructures = useHasSeveralStructures();
  const [filters, setFilters] = useUrlFilters({ status: "", from: "", to: "", structure: "", page: "1" });
  const statusFilter = filters.status;
  const dateFrom = filters.from;
  const dateTo = filters.to;
  const structureFilter = filters.structure;
  const page = Math.max(1, parseInt(filters.page, 10) || 1);

  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [total, setTotal] = useState(0);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<OvertimeRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const perPage = 25;

  const listParams = useCallback(
    (): Record<string, string> => ({
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(structureFilter && { structure: structureFilter }),
    }),
    [statusFilter, dateFrom, dateTo, structureFilter]
  );

  const fetchOvertime = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(perPage), ...listParams() });
    try {
      const res = await fetch(`/api/overtime?${params}`);
      const json = await res.json();
      setRecords(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
      if (json.stats) setStats(json.stats);
      setSelected([]);
    } catch (e) {
      console.error(e);
      toast.error("Impossible de charger les heures supplémentaires.");
    } finally {
      setLoading(false);
    }
  }, [page, listParams, toast]);

  useEffect(() => {
    fetchOvertime();
  }, [fetchOvertime]);

  /** Envoie une décision ; renvoie un message d'erreur ou null. */
  const sendDecision = async (id: string, status: "APPROVED" | "REJECTED", reason?: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/overtime/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(status === "REJECTED" && reason ? { reason } : {}) }),
      });
      if (res.ok) return null;
      const json = await res.json().catch(() => ({}));
      return typeof json.error === "string" ? json.error : "Impossible d'enregistrer la validation.";
    } catch {
      return "Erreur réseau. Vérifiez votre connexion.";
    }
  };

  const approve = async (r: OvertimeRecord) => {
    setActioningId(r.id);
    const err = await sendDecision(r.id, "APPROVED");
    setActioningId(null);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(`${formatOvertime(r.overtimeMinutes)} validées pour ${r.employee.firstName} ${r.employee.lastName}.`);
    fetchOvertime();
    refreshNavCounts();
  };

  const submitReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    setActioningId(rejecting.id);
    const err = await sendDecision(rejecting.id, "REJECTED", rejectReason.trim());
    setActioningId(null);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(`Heures sup refusées pour ${rejecting.employee.firstName} ${rejecting.employee.lastName}.`);
    setRejecting(null);
    setRejectReason("");
    fetchOvertime();
    refreshNavCounts();
  };

  const approveSelected = async () => {
    const rows = records.filter((r) => selected.includes(r.id));
    const minutes = rows.reduce((n, r) => n + r.overtimeMinutes, 0);
    const ok = await confirm({
      title: "Valider la sélection",
      message: `Valider ${rows.length} ligne${rows.length > 1 ? "s" : ""} d'heures sup (${formatOvertime(minutes)} au total) ?`,
      confirmLabel: "Tout valider",
      tone: "primary",
    });
    if (!ok) return;
    setBulkRunning(true);
    let failed = 0;
    for (const r of rows) {
      if (await sendDecision(r.id, "APPROVED")) failed++;
    }
    setBulkRunning(false);
    if (failed === 0) toast.success(`${rows.length} ligne${rows.length > 1 ? "s" : ""} validée${rows.length > 1 ? "s" : ""}.`);
    else toast.warning(`${rows.length - failed} validée(s), ${failed} en échec : réessayez pour celles-ci.`);
    fetchOvertime();
    refreshNavCounts();
  };

  const totalPages = Math.ceil(total / perPage);
  const pendingOnPage = records.filter((r) => r.overtimeStatus === "PENDING");
  const allPendingSelected = pendingOnPage.length > 0 && pendingOnPage.every((r) => selected.includes(r.id));

  /** L'API plafonne `limit` à 100 : on enchaîne les pages pour exporter toute la sélection. */
  const fetchAllForExport = async (): Promise<OvertimeRecord[]> => {
    const pageSize = 100;
    const out: OvertimeRecord[] = [];
    for (let p = 1; p <= 100; p++) {
      const params = new URLSearchParams({ ...listParams(), page: String(p), limit: String(pageSize) });
      const res = await fetch(`/api/overtime?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Export impossible");
      const batch: OvertimeRecord[] = json.data ?? [];
      out.push(...batch);
      if (batch.length < pageSize) break;
    }
    return out;
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
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

      all.forEach((r) => {
        ws.addRow({
          employee: `${r.employee.lastName} ${r.employee.firstName}`,
          matricule: r.employee.matricule,
          service: r.employee.service,
          structure: r.employee.structure,
          date: excelDay(r.date),
          in: formatTime(r.checkInTime),
          out: formatTime(r.checkOutTime),
          ot: excelDuration(r.overtimeMinutes),
          reason: r.overtimeReason ?? "—",
          status: statusLabel("overtime", r.overtimeStatus),
          validatedBy: r.overtimeValidatedBy ?? "—",
        });
      });

      setColumnFormats(ws, { date: EXCEL_DATE_FORMAT, ot: EXCEL_DURATION_FORMAT });
      finishSheet(ws);
      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `heures_supplementaires_${fileDateStamp()}.xlsx`
      );
      toast.success(`${all.length} ligne${all.length > 1 ? "s" : ""} exportée${all.length > 1 ? "s" : ""}.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setExporting(false);
    }
  };

  const toggleStatus = (value: string) => setFilters({ status: statusFilter === value ? "" : value, page: "1" });
  const hasActiveFilters = Boolean(statusFilter || dateFrom || dateTo || structureFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Heures supplémentaires"
        description="Seules les heures validées par la RH sont prises en compte pour la paie."
        actions={
          <Button variant="secondary" onClick={() => void exportExcel()} loading={exporting} icon={<FileSpreadsheet className="h-4 w-4 text-emerald-600" />}>
            Exporter Excel
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile icon={Hourglass} label="En attente" value={stats.pending} tone="warning" onClick={() => toggleStatus("PENDING")} active={statusFilter === "PENDING"} />
        <StatTile icon={UserCheck} label="Validées" value={stats.approved} tone="success" onClick={() => toggleStatus("APPROVED")} active={statusFilter === "APPROVED"} />
        <StatTile icon={UserX} label="Refusées" value={stats.rejected} tone="danger" onClick={() => toggleStatus("REJECTED")} active={statusFilter === "REJECTED"} />
        <StatTile icon={Clock} label="Lignes affichées" value={total} tone="neutral" />
      </div>

      <FilterBar
        actions={
          hasActiveFilters ? (
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setFilters({ status: "", from: "", to: "", structure: "", page: "1" })}>
              Réinitialiser
            </Button>
          ) : undefined
        }
      >
        <FilterField label="Statut">
          <Select value={statusFilter} onChange={(e) => setFilters({ status: e.target.value, page: "1" })}>
            <option value="">Tous les statuts</option>
            <option value="PENDING">En attente</option>
            <option value="APPROVED">Validées</option>
            <option value="REJECTED">Refusées</option>
          </Select>
        </FilterField>
        <FilterField label="Du">
          <Input type="date" value={dateFrom} onChange={(e) => setFilters({ from: e.target.value, page: "1" })} />
        </FilterField>
        <FilterField label="Au">
          <Input type="date" value={dateTo} onChange={(e) => setFilters({ to: e.target.value, page: "1" })} />
        </FilterField>
        {severalStructures && (
          <FilterField label="Structure">
            <Select value={structureFilter} onChange={(e) => setFilters({ structure: e.target.value, page: "1" })}>
              <option value="">Toutes structures</option>
              <StructureOptions />
            </Select>
          </FilterField>
        )}
      </FilterBar>

      <Card className="overflow-hidden">
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-100 bg-brand-50/60 px-5 py-2.5 text-sm sm:px-6">
            <span className="font-medium text-brand-800">
              {selected.length} ligne{selected.length > 1 ? "s" : ""} sélectionnée{selected.length > 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="success" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => void approveSelected()} loading={bulkRunning}>
                Valider la sélection
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])} disabled={bulkRunning}>
                Désélectionner
              </Button>
            </div>
          </div>
        )}
        <Table>
          <THead>
            <tr>
              <Th className="w-10 pr-0">
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  disabled={pendingOnPage.length === 0}
                  onChange={() => setSelected(allPendingSelected ? [] : pendingOnPage.map((r) => r.id))}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
                  aria-label="Sélectionner toutes les lignes en attente"
                />
              </Th>
              <Th>Employé</Th>
              <Th>Jour</Th>
              <Th>Heures sup</Th>
              <Th>Motif</Th>
              <Th>Statut</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <TableSkeletonRows cols={7} />
            ) : records.length === 0 ? (
              <TableMessageRow cols={7}>
                <EmptyState icon={Clock} title="Aucune heure supplémentaire" description="Modifiez les filtres ou attendez de nouveaux pointages." />
              </TableMessageRow>
            ) : (
              records.map((r) => {
                const pending = r.overtimeStatus === "PENDING";
                return (
                  <Tr key={r.id} className={cn(selected.includes(r.id) && "bg-brand-50/40")}>
                    <Td className="w-10 pr-0">
                      {pending && (
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={() => setSelected((prev) => (prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id]))}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          aria-label={`Sélectionner ${r.employee.firstName} ${r.employee.lastName}`}
                        />
                      )}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <p className="font-medium text-slate-800">
                        {r.employee.lastName} {r.employee.firstName}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-slate-500">
                        {r.employee.matricule} · {r.employee.service}
                        <StructureBadge value={r.employee.structure} className="px-1.5 py-0 text-[10px]" />
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="block">{dayLabel(r.date)}</span>
                      <span className="block text-xs tabular-nums text-slate-500">
                        {formatTime(r.checkInTime)} → {formatTime(r.checkOutTime)}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-semibold tabular-nums text-violet-600">{formatOvertime(r.overtimeMinutes)}</span>
                    </Td>
                    <Td className="min-w-[140px] max-w-[200px]">
                      {r.overtimeReason ? (
                        <span className="block truncate" title={r.overtimeReason}>
                          {r.overtimeReason}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">Non renseigné</span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge kind="overtime" value={r.overtimeStatus ?? "PENDING"} />
                      {r.overtimeValidatedBy && <p className="mt-0.5 text-xs text-slate-500">Par {r.overtimeValidatedBy}</p>}
                    </Td>
                    <Td align="right">
                      {pending && (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="success"
                            onClick={() => void approve(r)}
                            loading={actioningId === r.id}
                            disabled={bulkRunning}
                            icon={<Check className="h-3.5 w-3.5" />}
                            className="px-2 2xl:px-3"
                            title="Valider"
                            aria-label={`Valider les heures sup de ${r.employee.firstName} ${r.employee.lastName}`}
                          >
                            <span className="hidden 2xl:inline">Valider</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setRejecting(r);
                              setRejectReason("");
                            }}
                            disabled={actioningId === r.id || bulkRunning}
                            className="px-2 hover:border-red-200 hover:bg-red-50 hover:text-red-700 2xl:px-3"
                            icon={<XCircle className="h-3.5 w-3.5" />}
                            title="Refuser"
                            aria-label={`Refuser les heures sup de ${r.employee.firstName} ${r.employee.lastName}`}
                          >
                            <span className="hidden 2xl:inline">Refuser</span>
                          </Button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
        {!loading && (
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={perPage} itemLabel={["ligne", "lignes"]} onPageChange={(p) => setFilters({ page: String(p) })} />
        )}
      </Card>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        dismissible={actioningId === null}
        size="sm"
        title="Refuser les heures sup"
        description={
          rejecting
            ? `${rejecting.employee.firstName} ${rejecting.employee.lastName} · ${dayLabel(rejecting.date)} · ${formatOvertime(rejecting.overtimeMinutes)}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={actioningId !== null}>
              Annuler
            </Button>
            <Button variant="danger" onClick={() => void submitReject()} loading={actioningId !== null} disabled={!rejectReason.trim()}>
              Refuser
            </Button>
          </>
        }
      >
        <Field label="Motif du refus" required hint="Visible dans l'historique et l'export.">
          {(id) => (
            <Textarea id={id} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="Ex. : travail non demandé par le responsable" data-autofocus />
          )}
        </Field>
      </Modal>
    </div>
  );
}
