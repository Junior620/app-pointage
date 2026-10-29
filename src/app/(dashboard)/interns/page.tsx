"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Eye, GraduationCap, Hourglass, Plus, RotateCcw, Search, Wallet, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDayFr } from "@/lib/export-format";
import {
  INTERN_END_REMINDER_DAYS,
  INTERN_STATUS_LABELS,
  fmtFcfa,
  internshipCountdownLabel,
  internshipProgress,
  schoolLine,
  type InternStatus,
} from "@/lib/interns";
import { useDebouncedCommit, useUrlFilters } from "@/lib/use-url-filters";
import { refreshNavCounts } from "@/lib/use-nav-counts";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { StructureBadge } from "@/components/ui/StatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { Table, THead, Th, Tr, Td, TableSkeletonRows, TableMessageRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toaster";
import { InternActions } from "@/components/interns/InternActions";
import { InternCertificateButtons } from "@/components/interns/InternCertificateButtons";
import AllowanceRecap from "./AllowanceRecap";

type InternRow = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  school: string;
  fieldOfStudy: string | null;
  level: string | null;
  monthlyAllowance: number | null;
  supervisor: { id: string; firstName: string; lastName: string } | null;
  status: InternStatus;
  daysLeft: number;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string;
    service: string;
    structure: string;
    kind: "EMPLOYEE" | "INTERN";
    active: boolean;
    departureReason: string | null;
  };
};

type InternStats = { ongoing: number; upcoming: number; endingSoon: number; endedThisYear: number; monthlyAllowance: number };

const STATUS_TONE: Record<InternStatus, BadgeTone> = { ongoing: "success", upcoming: "info", ended: "neutral", hired: "violet" };
type StatusFilter = "current" | "soon" | InternStatus | "all";
const STATUS_FILTERS: StatusFilter[] = ["current", "soon", "ongoing", "upcoming", "ended", "hired", "all"];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function InternsPage() {
  return (
    <Suspense fallback={null}>
      <InternsContent />
    </Suspense>
  );
}

function InternsContent() {
  const toast = useToast();
  const [filters, setFilters] = useUrlFilters({ q: "", statut: "current" });
  const statusFilter = (STATUS_FILTERS.includes(filters.statut as StatusFilter) ? filters.statut : "current") as StatusFilter;
  const [searchInput, setSearchInput] = useState(filters.q);
  const commitSearch = useDebouncedCommit((q) => setFilters({ q }));

  const [rows, setRows] = useState<InternRow[]>([]);
  const [stats, setStats] = useState<InternStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [today] = useState(todayKey);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters.q ? { q: filters.q } : {});
      const res = await fetch(`/api/interns?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRows(json.data ?? []);
      setStats(json.stats ?? null);
    } catch {
      toast.error("Impossible de charger les stagiaires.");
    } finally {
      setLoading(false);
    }
  }, [filters.q, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterAction = () => {
    void load();
    refreshNavCounts();
  };

  const visible = rows.filter((r) => {
    switch (statusFilter) {
      case "all":
        return true;
      case "current":
        return r.status === "ongoing" || r.status === "upcoming";
      case "soon":
        return r.status === "ongoing" && r.daysLeft <= INTERN_END_REMINDER_DAYS;
      default:
        return r.status === statusFilter;
    }
  });
  const hasActiveFilters = Boolean(filters.q || statusFilter !== "current");
  const toggle = (value: StatusFilter) => setFilters({ statut: statusFilter === value ? "current" : value });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stagiaires"
        description="Stages en cours et à venir, fin automatique, attestations et gratifications."
        actions={
          <>
            <AllowanceRecap />
            <Link href="/employees?nouveau=stagiaire" className={buttonClasses({ variant: "primary" })}>
              <Plus className="h-4 w-4" />
              Nouveau stagiaire
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatTile icon={GraduationCap} label="En cours" value={stats?.ongoing ?? "–"} tone="success" onClick={() => toggle("ongoing")} active={statusFilter === "ongoing"} />
        <StatTile
          icon={Hourglass}
          label={`Fin dans ${INTERN_END_REMINDER_DAYS} jours`}
          value={stats?.endingSoon ?? "–"}
          tone="warning"
          onClick={() => toggle("soon")}
          active={statusFilter === "soon"}
        />
        <StatTile icon={CalendarClock} label="À venir" value={stats?.upcoming ?? "–"} tone="info" onClick={() => toggle("upcoming")} active={statusFilter === "upcoming"} />
        <StatTile icon={CheckCircle2} label="Terminés cette année" value={stats?.endedThisYear ?? "–"} tone="neutral" onClick={() => toggle("ended")} active={statusFilter === "ended"} />
        <StatTile icon={Wallet} label="Gratifications / mois" value={stats ? fmtFcfa(stats.monthlyAllowance) : "–"} tone="violet" sub="Stages en cours" />
      </div>

      <FilterBar
        actions={
          hasActiveFilters ? (
            <button
              type="button"
              className={buttonClasses({ variant: "ghost", size: "sm" })}
              onClick={() => {
                setSearchInput("");
                setFilters({ q: "", statut: "current" });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Réinitialiser
            </button>
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
        <FilterField label="Statut">
          <Select value={statusFilter} onChange={(e) => setFilters({ statut: e.target.value })}>
            <option value="current">En cours et à venir</option>
            <option value="soon">Fin dans {INTERN_END_REMINDER_DAYS} jours</option>
            <option value="ongoing">En cours</option>
            <option value="upcoming">À venir</option>
            <option value="ended">Terminés</option>
            <option value="hired">Embauchés</option>
            <option value="all">Tous</option>
          </Select>
        </FilterField>
      </FilterBar>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th>Stagiaire</Th>
              <Th>École</Th>
              <Th>Service</Th>
              <Th>Encadrant</Th>
              <Th>Période</Th>
              <Th align="right">Gratification</Th>
              <Th>Statut</Th>
              <Th align="right">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </THead>
          <tbody>
            {loading ? (
              <TableSkeletonRows cols={8} />
            ) : visible.length === 0 ? (
              <TableMessageRow cols={8}>
                <EmptyState
                  icon={GraduationCap}
                  title={rows.length === 0 ? "Aucun stagiaire" : "Aucun stage pour ce filtre"}
                  description={
                    rows.length === 0
                      ? "Ajoutez un stagiaire : il pointe sur WhatsApp comme un employé, sans heures sup, et sort automatiquement à la fin du stage."
                      : "Choisissez un autre statut ou effacez la recherche."
                  }
                  action={
                    rows.length === 0 ? (
                      <Link href="/employees?nouveau=stagiaire" className={buttonClasses({ variant: "primary" })}>
                        <Plus className="h-4 w-4" />
                        Nouveau stagiaire
                      </Link>
                    ) : undefined
                  }
                />
              </TableMessageRow>
            ) : (
              visible.map((r) => {
                const progress = Math.round(internshipProgress(r, today) * 100);
                const soon = r.status === "ongoing" && r.daysLeft <= INTERN_END_REMINDER_DAYS;
                return (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/employees/${r.employee.id}`} className="group block min-w-[160px]">
                        <span className="block font-medium text-slate-800 group-hover:text-brand-700">
                          {r.employee.firstName} {r.employee.lastName}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{r.employee.matricule}</span>
                          <StructureBadge value={r.employee.structure} />
                        </span>
                      </Link>
                    </Td>
                    <Td className="max-w-[240px]">
                      <span className="line-clamp-2 text-sm text-slate-700">{schoolLine(r)}</span>
                    </Td>
                    <Td>{r.employee.service}</Td>
                    <Td className="whitespace-nowrap">
                      {r.supervisor ? `${r.supervisor.firstName} ${r.supervisor.lastName}` : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="min-w-[180px]">
                      <span className="block whitespace-nowrap text-sm">
                        {fmtDayFr(r.startDate)} – {fmtDayFr(r.endDate)}
                      </span>
                      {r.status === "ongoing" && (
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                            <span className={cn("block h-full rounded-full", soon ? "bg-amber-500" : "bg-sky-500")} style={{ width: `${progress}%` }} />
                          </span>
                          <span className={cn("text-xs font-medium", soon ? "text-amber-700" : "text-slate-500")}>
                            {internshipCountdownLabel(r, today)}
                          </span>
                        </span>
                      )}
                      {r.status === "upcoming" && <span className="mt-1 block text-xs text-sky-700">{internshipCountdownLabel(r, today)}</span>}
                    </Td>
                    <Td align="right" className="whitespace-nowrap tabular-nums">
                      {r.monthlyAllowance != null ? fmtFcfa(r.monthlyAllowance) : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status]} dot>
                        {INTERN_STATUS_LABELS[r.status]}
                      </Badge>
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Link
                          href={`/employees/${r.employee.id}`}
                          className={buttonClasses({ variant: "ghost", size: "icon-sm" })}
                          title="Voir la fiche"
                          aria-label={`Voir la fiche de ${r.employee.firstName} ${r.employee.lastName}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <InternCertificateButtons employeeId={r.employee.id} compact />
                        <InternActions
                          compact
                          onDone={afterAction}
                          intern={{
                            id: r.employee.id,
                            firstName: r.employee.firstName,
                            lastName: r.employee.lastName,
                            kind: r.employee.kind,
                            active: r.employee.active,
                            departureReason: r.employee.departureReason,
                            internship: { startDate: r.startDate, endDate: r.endDate },
                          }}
                        />
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </Table>
        {!loading && visible.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
            {visible.length} stage{visible.length > 1 ? "s" : ""} affiché{visible.length > 1 ? "s" : ""}. Un stagiaire sort automatiquement le lendemain de la
            fin de son stage ; les RH sont prévenus {INTERN_END_REMINDER_DAYS} jours avant.
          </p>
        )}
      </Card>
    </div>
  );
}
