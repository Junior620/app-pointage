"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Coffee, RefreshCw, Timer, CheckCircle2, AlertTriangle, ListChecks } from "lucide-react";
import { cn, formatTime, todayDate } from "@/lib/utils";
import { useUrlFilters } from "@/lib/use-url-filters";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { Table, THead, Th, Tr, Td, TableSkeletonRows, TableMessageRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toaster";

type BreakRow = {
  id: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    service: string;
    structure: string;
  };
  breakStartTime: string | null;
  breakEndTime: string | null;
  breakMinutes: number;
  checkInTime: string | null;
  checkOutTime: string | null;
  onBreak: boolean;
  missingReturn: boolean;
};

type BreakPayload = {
  date: string;
  data: BreakRow[];
  stats: {
    totalBreaks: number;
    onBreak: number;
    completed: number;
    missingReturn: number;
    avgMinutes: number;
  };
  services: string[];
};

type RowState = "onBreak" | "missing" | "done";

function rowState(r: BreakRow): RowState {
  return r.onBreak ? "onBreak" : r.missingReturn ? "missing" : "done";
}

const formatMinutes = (min: number) => `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, "0")}`;

/** Jour civil au fuseau Douala (et non UTC, qui donnait la veille entre minuit et 1 h). */
function todayInput(): string {
  const d = todayDate();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function BreaksPage() {
  return (
    <Suspense fallback={null}>
      <BreaksContent />
    </Suspense>
  );
}

function BreaksContent() {
  const toast = useToast();
  const today = todayInput();
  const [filters, setFilters] = useUrlFilters({ date: today, service: "", over: "", state: "" });
  const date = filters.date;
  const serviceFilter = filters.service;
  const onlyOverExpected = filters.over === "1";
  const stateFilter = filters.state as RowState | "";

  const [payload, setPayload] = useState<BreakPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBreaks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (serviceFilter) params.set("service", serviceFilter);
    if (onlyOverExpected) params.set("overExpected", "1");
    try {
      const res = await fetch(`/api/breaks?${params}`);
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.data)) throw new Error();
      setPayload(json);
    } catch {
      toast.error("Impossible de charger les pauses.");
    } finally {
      setLoading(false);
    }
  }, [date, serviceFilter, onlyOverExpected, toast]);

  useEffect(() => {
    fetchBreaks();
  }, [fetchBreaks]);

  const stats = payload?.stats ?? { totalBreaks: 0, onBreak: 0, completed: 0, missingReturn: 0, avgMinutes: 0 };
  const rows = (payload?.data ?? []).filter((r) => !stateFilter || rowState(r) === stateFilter);
  const toggleState = (s: RowState) => setFilters({ state: stateFilter === s ? "" : s });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suivi des pauses"
        description="Départs et retours de pause pointés, oublis de retour et pauses trop longues."
        actions={
          <Button variant="secondary" size="icon" onClick={fetchBreaks} aria-label="Actualiser" title="Actualiser">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatTile icon={ListChecks} label="Pauses pointées" value={stats.totalBreaks} tone="neutral" onClick={() => setFilters({ state: "" })} active={stateFilter === ""} />
        <StatTile icon={Coffee} label="En pause" value={stats.onBreak} tone="warning" onClick={() => toggleState("onBreak")} active={stateFilter === "onBreak"} />
        <StatTile icon={CheckCircle2} label="Retours pointés" value={stats.completed} tone="success" onClick={() => toggleState("done")} active={stateFilter === "done"} />
        <StatTile icon={AlertTriangle} label="Retours manquants" value={stats.missingReturn} tone="danger" onClick={() => toggleState("missing")} active={stateFilter === "missing"} />
        <StatTile icon={Timer} label="Pause moyenne" value={formatMinutes(stats.avgMinutes)} tone="brand" />
      </div>

      <FilterBar>
        <FilterField label="Jour">
          <Input type="date" value={date} max={today} onChange={(e) => setFilters({ date: e.target.value || today })} />
        </FilterField>
        <FilterField label="Service">
          <Select value={serviceFilter} onChange={(e) => setFilters({ service: e.target.value })}>
            <option value="">Tous les services</option>
            {(payload?.services ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FilterField>
        <label className="flex h-10 items-center gap-2 self-end rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={onlyOverExpected}
            onChange={(e) => setFilters({ over: e.target.checked ? "1" : "" })}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Pauses de plus de 60 min
        </label>
      </FilterBar>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Employé</Th>
              <Th>Service</Th>
              <Th>Début</Th>
              <Th>Retour</Th>
              <Th>Durée</Th>
              <Th>Statut</Th>
            </tr>
          </THead>
          <tbody>
            {loading && !payload ? (
              <TableSkeletonRows cols={6} />
            ) : rows.length === 0 ? (
              <TableMessageRow cols={6}>
                <EmptyState icon={Coffee} title={stateFilter ? "Aucune pause dans cette catégorie" : "Aucune pause enregistrée pour ce jour"} />
              </TableMessageRow>
            ) : (
              rows.map((r) => {
                const s = rowState(r);
                const long = (r.breakMinutes ?? 0) > 60;
                return (
                  <Tr key={r.id}>
                    <Td className="font-medium text-slate-800">
                      {r.employee.firstName} {r.employee.lastName}
                      <span className="block text-xs font-normal text-slate-500">{r.employee.matricule}</span>
                    </Td>
                    <Td>{r.employee.service}</Td>
                    <Td className="tabular-nums">{formatTime(r.breakStartTime)}</Td>
                    <Td className="tabular-nums">{formatTime(r.breakEndTime)}</Td>
                    <Td className={cn("tabular-nums", long && "font-semibold text-amber-700")}>
                      {formatMinutes(r.breakMinutes ?? 0)}
                      {long && <span className="ml-1 text-xs font-normal">(&gt; 60 min)</span>}
                    </Td>
                    <Td>
                      <Badge tone={s === "onBreak" ? "warning" : s === "missing" ? "danger" : "success"} dot>
                        {s === "onBreak" ? "En pause" : s === "missing" ? "Retour manquant" : "Pause clôturée"}
                      </Badge>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
