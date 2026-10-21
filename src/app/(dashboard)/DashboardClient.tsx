"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserCheck,
  UserX,
  Clock,
  Briefcase,
  AlertTriangle,
  Plus,
  FileText,
  Users,
  Shield,
  ArrowRight,
  RefreshCw,
  Landmark,
  Coffee,
  CalendarOff,
  MapPin,
  CheckCircle2,
  type LucideIcon,
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { cn, formatTime } from "@/lib/utils";
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import { STRUCTURE_BRANDS, isStructureCode } from "@/lib/brand";
import { useNavCounts } from "@/lib/use-nav-counts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, Skeleton } from "@/components/ui/EmptyState";
import { StatusBadge, StructureBadge } from "@/components/ui/StatusBadge";
import { Table, THead, Th, Tr, Td } from "@/components/ui/Table";
import { StatTile } from "@/components/ui/StatTile";
import StructureLogo from "@/components/brand/StructureLogo";

interface DashboardData {
  today: {
    totalEmployees: number;
    present: number;
    absent: number;
    late: number;
    mission: number;
    permission: number;
    missionOngoing?: number;
    permissionOngoing?: number;
    isNonWorkingDay?: boolean;
  };
  byStructure: Record<string, { total: number; present: number; absent: number; late: number }>;
  trend30: { date: string; label: string; present: number; absent: number; late: number; presenceRate: number }[];
  trend7: DashboardData["trend30"];
  alerts: {
    topLate: { firstName?: string; lastName?: string; matricule?: string; service?: string; structure?: string; count: number }[];
    topAbsent: { firstName?: string; lastName?: string; matricule?: string; service?: string; structure?: string; count: number }[];
  };
  recentCheckIns: {
    id: string;
    employee: { firstName: string; lastName: string; matricule: string; service: string; structure: string };
    checkInTime: string | null;
    checkInStatus: string | null;
    checkOutTime: string | null;
    finalStatus: string;
  }[];
  breaks: {
    onBreak: number;
    completed: number;
    missingReturn: number;
    avgMinutes: number;
    records: {
      id: string;
      employee: { firstName: string; lastName: string; matricule: string; service: string; structure: string };
      breakStartTime: string | null;
      breakEndTime: string | null;
      breakMinutes: number;
      checkOutTime: string | null;
      onBreak: boolean;
      missingReturn: boolean;
    }[];
  };
}

/** Rechargement automatique au retour sur l'onglet, au plus une fois par minute. */
const FOCUS_REFRESH_MS = 60 * 1000;

const EMPTY_TODAY: DashboardData["today"] = {
  totalEmployees: 0,
  present: 0,
  absent: 0,
  late: 0,
  mission: 0,
  permission: 0,
  missionOngoing: 0,
  permissionOngoing: 0,
  isNonWorkingDay: false,
};

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return n > 1 ? pluralForm : singular;
}

function formatMinutes(min: number) {
  return `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, "0")}`;
}

function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export default function DashboardClient({ userName }: { userName: string }) {
  const [structureFilter, setStructureFilter] = useState("");
  const [tick, setTick] = useState(0);
  const requestKey = `${structureFilter}|${tick}`;
  const [result, setResult] = useState<{ key: string; data: DashboardData | null; error: boolean } | null>(null);
  const lastLoadRef = useRef(0);
  const counts = useNavCounts();

  useEffect(() => {
    let cancelled = false;
    const params = structureFilter ? `?structure=${structureFilter}` : "";
    lastLoadRef.current = Date.now();
    fetch(`/api/dashboard${params}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as DashboardData;
      })
      .then((json) => {
        if (!cancelled) setResult({ key: requestKey, data: json, error: false });
      })
      .catch(() => {
        if (!cancelled) setResult((prev) => ({ key: requestKey, data: prev?.data ?? null, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, structureFilter]);

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastLoadRef.current > FOCUS_REFRESH_MS) setTick((t) => t + 1);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const data = result?.data ?? null;
  const loading = result?.key !== requestKey;
  const refresh = () => setTick((t) => t + 1);

  const today = data?.today ?? EMPTY_TODAY;
  const hasData = today.totalEmployees > 0;
  const isNonWorkingDay = today.isNonWorkingDay ?? false;
  const missionsNow = today.missionOngoing ?? today.mission;
  const permissionsNow = today.permissionOngoing ?? today.permission;
  const firstName = userName.trim().split(/\s+/)[0] || userName;

  if (!data && loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data && result?.error) {
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="Impossible de charger le tableau de bord"
          description="Le serveur n'a pas répondu. Vérifiez votre connexion puis réessayez."
          action={
            <Button onClick={refresh} icon={<RefreshCw className="h-4 w-4" />}>
              Réessayer
            </Button>
          }
        />
      </Card>
    );
  }

  const pieData = isNonWorkingDay
    ? []
    : [
        { name: "Présents", value: today.present, color: CHART_COLORS.present },
        { name: "Absents", value: today.absent, color: CHART_COLORS.absent },
        { name: "Retards", value: today.late, color: CHART_COLORS.late },
        { name: "Missions", value: missionsNow, color: CHART_COLORS.mission },
        { name: "Autorisations", value: permissionsNow, color: CHART_COLORS.permission },
      ].filter((d) => d.value > 0);

  const structureBarData = Object.entries(data?.byStructure ?? {}).map(([struct, stats]) => ({
    name: struct,
    Présents: stats.present,
    Absents: stats.absent,
    Retards: stats.late,
  }));

  const todo = [
    { key: "overtime", label: "Heures sup à valider", count: counts?.overtime ?? 0, href: "/overtime?status=PENDING", icon: Clock },
    { key: "leaves", label: "Autorisations en attente", count: counts?.leaves ?? 0, href: "/leaves?status=PENDING", icon: CalendarOff },
    { key: "missions", label: "Missions en attente", count: counts?.missions ?? 0, href: "/missions?status=PENDING", icon: MapPin },
    { key: "breaks", label: "Retours de pause manquants", count: data?.breaks?.missingReturn ?? 0, href: "/breaks", icon: Coffee },
  ];
  const todoTotal = todo.reduce((n, t) => n + t.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bonjour, ${firstName}`}
        description={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            Aperçu des présences et anomalies du jour.
            {hasData && (
              <span className="font-medium text-slate-700">
                {today.totalEmployees} {plural(today.totalEmployees, "employé actif", "employés actifs")}.
              </span>
            )}
          </span>
        }
        actions={
          <>
            <Select
              value={structureFilter}
              onChange={(e) => setStructureFilter(e.target.value)}
              className="w-auto min-w-[170px]"
              aria-label="Filtrer par structure"
            >
              <option value="">Toutes structures</option>
              <option value="SCPB">SCPB</option>
              <option value="AFREXIA">AFREXIA</option>
            </Select>
            <Button variant="secondary" size="icon" onClick={refresh} aria-label="Actualiser" title="Actualiser">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <ButtonLink href="/reports" icon={<FileText className="h-4 w-4" />}>
              <span className="hidden sm:inline">Rapports</span>
            </ButtonLink>
          </>
        }
      />

      {result?.error && data && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Actualisation impossible : les chiffres affichés peuvent dater.</span>
          <Button size="sm" variant="secondary" onClick={refresh}>
            Réessayer
          </Button>
        </div>
      )}

      {hasData && isNonWorkingDay && (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
          <span className="font-semibold text-slate-800">Week-end.</span> Le pointage reste possible pour un travail
          volontaire (compté en heures sup au départ). Aucune absence n&apos;est comptée aujourd&apos;hui.
        </div>
      )}

      {/* Indicateurs du jour */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        <StatTile
          icon={UserCheck}
          label="Présents"
          value={today.present}
          tone="success"
          href="/attendance?status=PRESENT"
          sub={!isNonWorkingDay && hasData ? `${pct(today.present, today.totalEmployees)} % de l'effectif` : ""}
        />
        <StatTile
          icon={UserX}
          label="Absents"
          value={today.absent}
          tone="danger"
          href="/attendance?status=ABSENT"
          sub={isNonWorkingDay ? "Non compté le week-end" : ""}
        />
        <StatTile
          icon={Clock}
          label="Retards"
          value={today.late}
          tone="warning"
          href="/attendance"
          sub={!isNonWorkingDay && today.present > 0 ? `${pct(today.late, today.present)} % des présents` : ""}
        />
        <StatTile icon={Briefcase} label="En mission" value={missionsNow} tone="violet" href="/missions" sub="" />
        <StatTile icon={Shield} label="En autorisation" value={permissionsNow} tone="info" href="/leaves" sub="" />
      </div>

      {/* À traiter */}
      <Card>
        <CardHeader
          title="À traiter"
          description={
            todoTotal > 0
              ? `${todoTotal} ${plural(todoTotal, "élément attend", "éléments attendent")} une action de votre part.`
              : "Rien en attente pour le moment."
          }
          icon={todoTotal > 0 ? <AlertTriangle className="h-5 w-5 text-amber-500" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        />
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
          {todo.map((t) => {
            const Icon = t.icon;
            const active = t.count > 0;
            return (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                  active
                    ? "border-amber-200 bg-amber-50/60 hover:bg-amber-50"
                    : "border-slate-200 bg-slate-50/50 hover:bg-slate-50"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    active ? "bg-amber-100 text-amber-700" : "bg-white text-slate-400"
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-xl font-bold tabular-nums", active ? "text-slate-900" : "text-slate-400")}>
                    {counts || t.key === "breaks" ? t.count : "–"}
                  </span>
                  <span className="block text-xs font-medium leading-snug text-slate-600">{t.label}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
              </Link>
            );
          })}
        </div>
      </Card>

      {!hasData && (
        <Card>
          <EmptyState
            icon={Users}
            title="Aucune donnée disponible"
            description="Les statistiques s'afficheront après les premiers pointages."
            action={
              <ButtonLink href="/employees" icon={<Plus className="h-4 w-4" />}>
                Ajouter un employé
              </ButtonLink>
            }
          />
        </Card>
      )}

      {/* Tendance + répartition */}
      {hasData && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Tendance de présence" description="30 derniers jours" />
            <div className="px-2 pb-4 pt-2 sm:px-4">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data?.trend30 ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="present" stroke={CHART_COLORS.present} strokeWidth={2} name="Présents" dot={false} />
                  <Line type="monotone" dataKey="absent" stroke={CHART_COLORS.absent} strokeWidth={2} name="Absents" dot={false} />
                  <Line type="monotone" dataKey="late" stroke={CHART_COLORS.late} strokeWidth={2} name="Retards" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Répartition du jour" />
            {pieData.length > 0 ? (
              <div className="flex flex-col items-center gap-4 px-5 pb-5 pt-2 sm:px-6">
                <div className="relative h-[190px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" innerRadius={58} outerRadius={86} paddingAngle={2} stroke="none">
                        {pieData.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums text-slate-900">
                      {pct(today.present, today.totalEmployees)} %
                    </span>
                    <span className="text-xs text-slate-500">de présence</span>
                  </div>
                </div>
                <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {pieData.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="truncate">{d.name}</span>
                      <span className="ml-auto font-semibold tabular-nums text-slate-900">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState title={isNonWorkingDay ? "Pas de pointage (week-end)" : "Aucune donnée"} />
            )}
          </Card>
        </div>
      )}

      {/* Comparaison des structures */}
      {hasData && structureBarData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Comparaison par structure" icon={<Landmark className="h-5 w-5 text-slate-400" />} />
            <div className="px-2 pb-4 pt-2 sm:px-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={structureBarData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: "#f1f5f9" }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Présents" fill={CHART_COLORS.present} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Absents" fill={CHART_COLORS.absent} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Retards" fill={CHART_COLORS.late} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.entries(data?.byStructure ?? {}).map(([struct, stats]) => {
              const rate = pct(stats.present, stats.total);
              const brand = isStructureCode(struct) ? STRUCTURE_BRANDS[struct] : null;
              return (
                <Card key={struct} className="p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    {brand ? <StructureLogo code={brand.code} size="md" /> : <StructureBadge value={struct} />}
                    <span className="text-xs text-slate-500">
                      {stats.total} {plural(stats.total, "employé")}
                    </span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Présents</dt>
                      <dd className="font-semibold tabular-nums text-emerald-600">{stats.present}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Absents</dt>
                      <dd className="font-semibold tabular-nums text-red-600">{stats.absent}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Retards</dt>
                      <dd className="font-semibold tabular-nums text-amber-600">{stats.late}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={cn("h-full rounded-full", brand?.accentClass ?? "bg-emerald-500")} style={{ width: `${rate}%` }} />
                  </div>
                  <p className="mt-1.5 text-right text-xs text-slate-500">{rate} % de présence</p>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Classements 30 jours */}
      {hasData && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopList
            title="Top retards"
            icon={Clock}
            iconColor="text-amber-500"
            tone="warning"
            unit={["retard", "retards"]}
            items={data?.alerts?.topLate ?? []}
            emptyText="Aucun retard sur 30 jours"
          />
          <TopList
            title="Top absences"
            icon={UserX}
            iconColor="text-red-500"
            tone="danger"
            unit={["absence", "absences"]}
            items={data?.alerts?.topAbsent ?? []}
            emptyText="Aucune absence sur 30 jours"
          />
        </div>
      )}

      {/* Derniers pointages */}
      {hasData && (data?.recentCheckIns ?? []).length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Derniers pointages du jour"
            className="pb-4"
            actions={
              <Link href="/attendance" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                Voir tout <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <Table>
            <THead>
              <tr>
                <Th>Employé</Th>
                <Th>Structure</Th>
                <Th>Arrivée</Th>
                <Th>Statut</Th>
              </tr>
            </THead>
            <tbody>
              {(data?.recentCheckIns ?? []).map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                        {r.employee.firstName[0]}
                        {r.employee.lastName[0]}
                      </span>
                      <span className="font-medium text-slate-800">
                        {r.employee.firstName} {r.employee.lastName}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <StructureBadge value={r.employee.structure} />
                  </Td>
                  <Td className="tabular-nums">{formatTime(r.checkInTime)}</Td>
                  <Td>
                    {r.checkInStatus ? (
                      <StatusBadge kind="checkIn" value={r.checkInStatus} />
                    ) : (
                      <StatusBadge kind="final" value={r.finalStatus} />
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Pauses */}
      {hasData && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Suivi des pauses"
            icon={<Coffee className="h-5 w-5 text-amber-600" />}
            actions={
              <Link href="/breaks" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                Page pauses <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="flex flex-wrap gap-2 px-5 pb-4 pt-3 sm:px-6">
            <Badge tone="warning">En pause : {data?.breaks?.onBreak ?? 0}</Badge>
            <Badge tone="success">Retours pointés : {data?.breaks?.completed ?? 0}</Badge>
            <Badge tone="danger">Retours manquants : {data?.breaks?.missingReturn ?? 0}</Badge>
            <Badge tone="neutral">Pause moyenne : {formatMinutes(data?.breaks?.avgMinutes ?? 0)}</Badge>
          </div>
          {(data?.breaks?.records ?? []).length > 0 ? (
            <Table>
              <THead>
                <tr>
                  <Th>Employé</Th>
                  <Th>Début</Th>
                  <Th>Retour</Th>
                  <Th>Durée</Th>
                  <Th>Statut</Th>
                </tr>
              </THead>
              <tbody>
                {(data?.breaks?.records ?? []).map((row) => (
                  <Tr key={row.id}>
                    <Td className="font-medium text-slate-800">
                      {row.employee.firstName} {row.employee.lastName}
                    </Td>
                    <Td className="tabular-nums">{formatTime(row.breakStartTime)}</Td>
                    <Td className="tabular-nums">{formatTime(row.breakEndTime)}</Td>
                    <Td className="tabular-nums">{formatMinutes(row.breakMinutes ?? 0)}</Td>
                    <Td>
                      <Badge tone={row.onBreak ? "warning" : row.missingReturn ? "danger" : "success"} dot>
                        {row.onBreak ? "En pause" : row.missingReturn ? "Retour manquant" : "Pause clôturée"}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-5 text-sm text-slate-500 sm:px-6">Aucune pause enregistrée aujourd&apos;hui.</p>
          )}
        </Card>
      )}
    </div>
  );
}

function TopList({
  title,
  icon: Icon,
  iconColor,
  tone,
  unit,
  items,
  emptyText,
}: {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  tone: "warning" | "danger";
  unit: [string, string];
  items: DashboardData["alerts"]["topLate"];
  emptyText: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description="30 derniers jours" icon={<Icon className={cn("h-5 w-5", iconColor)} />} />
      {items.length === 0 ? (
        <EmptyState title={emptyText} className="py-8" />
      ) : (
        <ol className="space-y-0.5 px-3 pb-4 pt-3 sm:px-4">
          {items.map((e, i) => (
            <li key={`${e.matricule ?? i}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-5 text-center text-xs font-bold text-slate-400">{i + 1}</span>
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    tone === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                  )}
                >
                  {(e.firstName ?? "?")[0]}
                  {(e.lastName ?? "?")[0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {e.firstName ?? ""} {e.lastName ?? ""}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {[e.service, e.structure].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <Badge tone={tone}>
                {e.count} {e.count > 1 ? unit[1] : unit[0]}
              </Badge>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
