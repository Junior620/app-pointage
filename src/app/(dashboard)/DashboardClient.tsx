"use client";

import { useEffect, useState, useCallback } from "react";
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
import { cn } from "@/lib/utils";

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
}

const PIE_COLORS = ["#10b981", "#ef4444", "#f59e0b", "#8b5cf6", "#3b82f6"];

export default function DashboardClient({ userName }: { userName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [structureFilter, setStructureFilter] = useState("");

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    const params = structureFilter ? `?structure=${structureFilter}` : "";
    fetch(`/api/dashboard${params}`)
      .then((r) => r.json())
      .then((json) => setData(json))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [structureFilter]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const onFocus = () => fetchDashboard();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboard]);

  const today = data?.today ?? { totalEmployees: 0, present: 0, absent: 0, late: 0, mission: 0, permission: 0, missionOngoing: 0, permissionOngoing: 0, isNonWorkingDay: false };
  const hasData = today.totalEmployees > 0;
  const isNonWorkingDay = today.isNonWorkingDay ?? false;

  const pieData = isNonWorkingDay
    ? []
    : [
        { name: "Présents", value: today.present },
        { name: "Absents", value: today.absent },
        { name: "Retards", value: today.late },
        { name: "Missions (en cours)", value: today.missionOngoing ?? today.mission },
        { name: "Permissions (en cours)", value: today.permissionOngoing ?? today.permission },
      ].filter((d) => d.value > 0);

  const structureBarData = data?.byStructure
    ? Object.entries(data.byStructure).map(([struct, stats]) => ({
        name: struct,
        Présents: stats.present,
        Absents: stats.absent,
        Retards: stats.late,
      }))
    : [];

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[120px] bg-white rounded-2xl border border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Bonjour, {userName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Apercu des presences et anomalies du jour.
            {today.totalEmployees > 0 && (
              <span className="ml-1 font-medium text-slate-700">
                {today.totalEmployees} employe{today.totalEmployees > 1 ? "s" : ""} actif{today.totalEmployees > 1 ? "s" : ""}.
              </span>
            )}
            {hasData && isNonWorkingDay && (
              <span className="ml-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Samedi / Dimanche — pas de pointage
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={structureFilter}
            onChange={(e) => setStructureFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Toutes structures</option>
            <option value="SCPB">SCPB</option>
            <option value="AFREXIA">AFREXIA</option>
          </select>
          <button
            onClick={fetchDashboard}
            className="h-10 w-10 rounded-xl border border-slate-300 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
            title="Actualiser"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 h-10 rounded-xl px-4 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Rapports</span>
          </Link>
        </div>
      </div>

      {/* Jour non ouvré : message clair */}
      {hasData && isNonWorkingDay && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
          <p className="text-sm font-medium text-slate-700">
            Jour non ouvré (samedi ou dimanche) — pas de planning « jour de semaine ». Le pointage reste possible pour un travail volontaire (heures sup. au départ) ; les indicateurs ci-dessous ne comptent pas d&apos;absences pour cette journée.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard icon={UserCheck} label="Presents" value={today.present} color="emerald"
          sub={!isNonWorkingDay && today.totalEmployees > 0 ? `${Math.round((today.present / today.totalEmployees) * 100)}%` : undefined} />
        <KpiCard icon={UserX} label="Absents" value={today.absent} color="red"
          sub={today.absent > 0 ? `${today.absent} non justifie${today.absent > 1 ? "s" : ""}` : undefined} />
        <KpiCard icon={Clock} label="Retards" value={today.late} color="amber"
          sub={today.present > 0 ? `${Math.round((today.late / today.present) * 100)}% des presents` : undefined} />
        <KpiCard icon={Briefcase} label="Missions" value={today.missionOngoing ?? today.mission} color="purple" sub={(today.missionOngoing ?? today.mission) > 0 ? "en cours" : undefined} />
        <KpiCard icon={Shield} label="Permissions" value={today.permissionOngoing ?? today.permission} color="blue" sub={(today.permissionOngoing ?? today.permission) > 0 ? "en cours" : undefined} />
      </div>

      {/* Alerts */}
      {hasData && (today.late > 0 || today.absent > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            A surveiller aujourd&apos;hui
          </h3>
          <div className="flex flex-wrap gap-2">
            {today.late > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50">
                <Clock className="h-3.5 w-3.5" /> {today.late} retard{today.late > 1 ? "s" : ""}
              </span>
            )}
            {today.absent > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50">
                <UserX className="h-3.5 w-3.5" /> {today.absent} absence{today.absent > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {!hasData && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
          <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">Aucune donnee disponible</p>
          <p className="mt-2 text-sm text-slate-500">Les statistiques s&apos;afficheront apres les premiers pointages.</p>
          <Link href="/employees" className="mt-4 inline-flex items-center gap-2 h-9 rounded-xl px-4 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" /> Ajouter un employe
          </Link>
        </div>
      )}

      {/* Charts: Trend line + Pie */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4">
              Tendance de presence — 30 jours
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data?.trend30 ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="present" stroke="#10b981" strokeWidth={2} name="Presents" dot={false} />
                <Line type="monotone" dataKey="absent" stroke="#ef4444" strokeWidth={2} name="Absents" dot={false} />
                <Line type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={2} name="Retards" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4">
              Repartition du jour
            </h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 text-center py-16">
                {isNonWorkingDay ? "Pas de pointage (jour non ouvré)" : "Aucune donnee"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Structure comparison */}
      {hasData && structureBarData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Landmark className="h-4 w-4 text-slate-500" />
              Comparaison par structure
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={structureBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Présents" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Absents" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Retards" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Structure KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(data?.byStructure ?? {}).map(([struct, stats]) => (
              <div key={struct} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                    struct === "AFREXIA" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"
                  )}>
                    {struct}
                  </span>
                  <span className="text-xs text-slate-400">{stats.total} employes</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Presents</span>
                    <span className="font-semibold text-emerald-600">{stats.present}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Absents</span>
                    <span className="font-semibold text-red-600">{stats.absent}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Retards</span>
                    <span className="font-semibold text-amber-600">{stats.late}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: `${stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-right">
                    {stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}% de presence
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Retards / Absences */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopList
            title="Top retards (30 jours)"
            icon={Clock}
            iconColor="text-amber-500"
            items={(data?.alerts?.topLate ?? []).map((e) => ({
              name: `${e.firstName ?? ""} ${e.lastName ?? ""}`,
              initials: `${(e.firstName ?? "?")[0]}${(e.lastName ?? "?")[0]}`,
              service: e.service ?? "",
              structure: e.structure ?? "",
              count: e.count,
              label: `${e.count} retard${e.count > 1 ? "s" : ""}`,
              badgeColor: "bg-amber-50 text-amber-700",
              avatarColor: "bg-amber-100 text-amber-700",
            }))}
            emptyText="Aucun retard ce mois"
          />
          <TopList
            title="Top absences (30 jours)"
            icon={UserX}
            iconColor="text-red-500"
            items={(data?.alerts?.topAbsent ?? []).map((e) => ({
              name: `${e.firstName ?? ""} ${e.lastName ?? ""}`,
              initials: `${(e.firstName ?? "?")[0]}${(e.lastName ?? "?")[0]}`,
              service: e.service ?? "",
              structure: e.structure ?? "",
              count: e.count,
              label: `${e.count} absence${e.count > 1 ? "s" : ""}`,
              badgeColor: "bg-red-50 text-red-700",
              avatarColor: "bg-red-100 text-red-700",
            }))}
            emptyText="Aucune absence ce mois"
          />
        </div>
      )}

      {/* Recent check-ins */}
      {hasData && (data?.recentCheckIns ?? []).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-6 pb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Derniers pointages du jour</h3>
            <Link href="/attendance" className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Voir tout <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-slate-100">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Employe</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Structure</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Arrivee</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Statut</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recentCheckIns ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                          {r.employee.firstName[0]}{r.employee.lastName[0]}
                        </div>
                        <span className="font-medium text-slate-800">{r.employee.firstName} {r.employee.lastName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        r.employee.structure === "AFREXIA" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"
                      )}>
                        {r.employee.structure}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        r.checkInStatus === "ON_TIME" ? "bg-emerald-50 text-emerald-700" : r.checkInStatus === "LATE" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {r.checkInStatus === "ON_TIME" ? "A l'heure" : r.checkInStatus === "LATE" ? "Retard" : r.finalStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "emerald" | "red" | "amber" | "purple" | "blue";
  sub?: string;
}) {
  const colorMap = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", value: "text-emerald-700" },
    red: { bg: "bg-red-50", text: "text-red-600", value: "text-red-700" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", value: "text-amber-700" },
    purple: { bg: "bg-violet-50", text: "text-violet-600", value: "text-violet-700" },
    blue: { bg: "bg-blue-50", text: "text-blue-600", value: "text-blue-700" },
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
          {sub && <p className="text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function TopList({
  title,
  icon: Icon,
  iconColor,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  items: {
    name: string;
    initials: string;
    service: string;
    structure: string;
    count: number;
    label: string;
    badgeColor: string;
    avatarColor: string;
  }[];
  emptyText: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-6 pb-3 flex items-center gap-2">
        <Icon className={cn("h-5 w-5", iconColor)} />
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-6 pb-6 pt-2 text-center">
          <p className="text-sm text-slate-400 py-4">{emptyText}</p>
        </div>
      ) : (
        <div className="px-6 pb-4 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-5 text-center">{i + 1}</span>
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold", item.avatarColor)}>
                  {item.initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.service} — {item.structure}</p>
                </div>
              </div>
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", item.badgeColor)}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
