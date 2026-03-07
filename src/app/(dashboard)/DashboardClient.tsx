"use client";

import { useEffect, useState } from "react";
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
  MapPin,
  RefreshCw,
} from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import PunctualityChart from "@/components/dashboard/PunctualityChart";
import ServiceChart from "@/components/dashboard/ServiceChart";

interface TodaySummary {
  present: number;
  absent: number;
  late: number;
  onTime: number;
  permission: number;
  mission: number;
  total: number;
}

interface EmployeeInfo {
  id: string;
  firstName: string;
  lastName: string;
  service: string;
  matricule: string;
}

interface DashboardAPIData {
  data: {
    todaySummary: TodaySummary;
    punctualityTrend: { date: string; rate: number; onTime: number; late: number }[];
    topLate: { employee: EmployeeInfo; lateDays: number }[];
    topPresent: { employee: EmployeeInfo; presentDays: number }[];
    recentFraud: {
      id: string;
      timestamp: string;
      type: string;
      distanceM: number;
      employee: EmployeeInfo;
    }[];
    byService: {
      service: string;
      present: number;
      absent: number;
      late: number;
    }[];
  };
}

export default function DashboardClient({ userName }: { userName: string }) {
  const [data, setData] = useState<DashboardAPIData["data"] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = () => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((json) => setData(json.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    const onFocus = () => fetchDashboard();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-[130px] bg-white rounded-2xl border border-slate-200 animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-[340px] bg-white rounded-2xl border border-slate-200 animate-pulse" />
          <div className="h-[340px] bg-white rounded-2xl border border-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  const summary = data?.todaySummary ?? {
    present: 0,
    absent: 0,
    late: 0,
    onTime: 0,
    permission: 0,
    mission: 0,
    total: 0,
  };

  const hasData = summary.total > 0;

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Bonjour, {userName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Voici un aperçu des présences et anomalies du jour.
            {summary.total > 0 && (
              <span className="ml-1 font-medium text-slate-700">
                {summary.total} employé{summary.total > 1 ? "s" : ""} actif
                {summary.total > 1 ? "s" : ""}.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/employees"
            className="inline-flex items-center gap-2 h-10 rounded-xl px-4 border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Ajouter employé</span>
          </Link>
          <Link
            href="/missions"
            className="inline-flex items-center gap-2 h-10 rounded-xl px-4 border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Briefcase className="h-4 w-4" />
            <span className="hidden sm:inline">Mission</span>
          </Link>
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 h-10 rounded-xl px-4 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Exporter</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Présents"
          value={summary.present}
          icon={UserCheck}
          color="green"
          subtitle={
            summary.total > 0
              ? `${Math.round((summary.present / summary.total) * 100)}% des employés`
              : "Aujourd'hui"
          }
        />
        <StatCard
          label="Absents"
          value={summary.absent}
          icon={UserX}
          color="red"
          subtitle={
            summary.absent > 0
              ? `${summary.absent} non justifié${summary.absent > 1 ? "s" : ""}`
              : "Aucun absent"
          }
        />
        <StatCard
          label="En retard"
          value={summary.late}
          icon={Clock}
          color="orange"
          subtitle={
            summary.present > 0
              ? `${Math.round((summary.late / (summary.present || 1)) * 100)}% des présents`
              : "Aujourd'hui"
          }
        />
        <StatCard
          label="Mission / Permission"
          value={summary.mission + summary.permission}
          icon={Briefcase}
          color="purple"
          subtitle={`${summary.mission} mission${summary.mission > 1 ? "s" : ""}, ${summary.permission} permission${summary.permission > 1 ? "s" : ""}`}
        />
      </div>

      {/* Alerts Section */}
      <AlertsSection
        late={summary.late}
        absent={summary.absent}
        fraud={(data?.recentFraud ?? []).length}
        hasData={hasData}
      />

      {/* Charts Section: Tendance + Mini Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Tendance de ponctualité — 30 jours
          </h3>
          <PunctualityChart data={data?.punctualityTrend ?? []} />
        </div>
        <div className="flex flex-col gap-4">
          <MiniStat
            label="Taux de présence moyen"
            value={
              summary.total > 0
                ? `${Math.round((summary.present / summary.total) * 100)}%`
                : "—"
            }
            color="emerald"
          />
          <MiniStat
            label="Taux de retard moyen"
            value={
              summary.present > 0
                ? `${Math.round((summary.late / (summary.present || 1)) * 100)}%`
                : "—"
            }
            color="amber"
          />
          <MiniStat
            label="Départs auto ce mois"
            value="—"
            color="slate"
          />
        </div>
      </div>

      {/* Top Retards / Présents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopList
          title="Top retards"
          icon={Clock}
          iconColor="text-amber-500"
          items={(data?.topLate ?? []).map((e) => ({
            name: `${e.employee?.firstName ?? ""} ${e.employee?.lastName ?? ""}`,
            initials: `${(e.employee?.firstName ?? "?")[0]}${(e.employee?.lastName ?? "?")[0]}`,
            service: e.employee?.service ?? "",
            value: e.lateDays,
            valueLabel: `${e.lateDays} retard${e.lateDays > 1 ? "s" : ""}`,
            badgeColor: "bg-amber-50 text-amber-700",
            avatarColor: "bg-amber-100 text-amber-700",
          }))}
          emptyText="Aucun retard enregistré ce mois"
          emptyAction={{ label: "Voir les pointages", href: "/attendance" }}
        />
        <TopList
          title="Top présents"
          icon={UserCheck}
          iconColor="text-emerald-500"
          items={(data?.topPresent ?? []).map((e) => ({
            name: `${e.employee?.firstName ?? ""} ${e.employee?.lastName ?? ""}`,
            initials: `${(e.employee?.firstName ?? "?")[0]}${(e.employee?.lastName ?? "?")[0]}`,
            service: e.employee?.service ?? "",
            value: e.presentDays,
            valueLabel: `${e.presentDays} jour${e.presentDays > 1 ? "s" : ""}`,
            badgeColor: "bg-emerald-50 text-emerald-700",
            avatarColor: "bg-emerald-100 text-emerald-700",
          }))}
          emptyText="Aucune présence consolidée sur cette période"
          emptyAction={{ label: "Voir les employés", href: "/employees" }}
        />
      </div>

      {/* Fraud Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-6 pb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            Tentatives suspectes
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setLoading(true); fetchDashboard(); }}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title="Actualiser"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <Link
              href="/attendance"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Voir tout <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-slate-100">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Employé
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Distance
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentFraud ?? []).map((f) => (
                <tr
                  key={f.id}
                  className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors"
                >
                  <td className="px-6 py-4 text-slate-700 font-medium">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-semibold">
                        {f.employee?.firstName?.[0]}
                        {f.employee?.lastName?.[0]}
                      </div>
                      {f.employee?.firstName} {f.employee?.lastName}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(f.timestamp).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                      <MapPin className="h-3 w-3" />
                      {f.type === "CHECK_IN" ? "Arrivée" : "Départ"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-semibold text-red-600">
                      {f.distanceM >= 0 ? `${Math.round(f.distanceM)} m` : "—"}
                    </span>
                  </td>
                </tr>
              ))}
              {(data?.recentFraud ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-10 text-center text-slate-400"
                  >
                    <Shield className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    Aucune tentative suspecte détectée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Service Stats */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Statistiques par service
        </h3>
        <ServiceChart data={data?.byService ?? []} />
      </div>
    </div>
  );
}

/* =========== Sub-components =========== */

function AlertsSection({
  late,
  absent,
  fraud,
  hasData,
}: {
  late: number;
  absent: number;
  fraud: number;
  hasData: boolean;
}) {
  if (!hasData) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center">
        <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
        <p className="text-base font-semibold text-slate-700">
          Aucune donnée disponible pour le moment
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Les statistiques s&apos;afficheront après les premiers pointages.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Link
            href="/employees"
            className="inline-flex items-center gap-2 h-9 rounded-xl px-4 bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Ajouter un employé
          </Link>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 h-9 rounded-xl px-4 border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Configurer les horaires
          </Link>
        </div>
      </div>
    );
  }

  const alerts = [];
  if (late > 0)
    alerts.push({
      label: `${late} employé${late > 1 ? "s" : ""} en retard`,
      color: "text-amber-700 bg-amber-50",
      icon: Clock,
    });
  if (absent > 0)
    alerts.push({
      label: `${absent} absence${absent > 1 ? "s" : ""} non justifiée${absent > 1 ? "s" : ""}`,
      color: "text-red-700 bg-red-50",
      icon: UserX,
    });
  if (fraud > 0)
    alerts.push({
      label: `${fraud} tentative${fraud > 1 ? "s" : ""} suspecte${fraud > 1 ? "s" : ""}`,
      color: "text-red-700 bg-red-50",
      icon: AlertTriangle,
    });

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <UserCheck className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            Tout est en ordre aujourd&apos;hui
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Aucune alerte, aucun retard, aucune anomalie.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        À surveiller aujourd&apos;hui
      </h3>
      <div className="flex flex-wrap gap-2">
        {alerts.map((alert, i) => {
          const Icon = alert.icon;
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${alert.color}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {alert.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "emerald" | "amber" | "slate";
}) {
  const colorMap = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    slate: "text-slate-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex-1 flex flex-col justify-center">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${colorMap[color]}`}>
        {value}
      </p>
    </div>
  );
}

function TopList({
  title,
  icon: Icon,
  iconColor,
  items,
  emptyText,
  emptyAction,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  items: {
    name: string;
    initials: string;
    service: string;
    value: number;
    valueLabel: string;
    badgeColor: string;
    avatarColor: string;
  }[];
  emptyText: string;
  emptyAction: { label: string; href: string };
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-6 pb-3 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconColor}`} />
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-6 pb-6 pt-2 text-center">
          <p className="text-sm text-slate-400 py-4">{emptyText}</p>
          <Link
            href={emptyAction.href}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {emptyAction.label} →
          </Link>
        </div>
      ) : (
        <div className="px-6 pb-4 space-y-1">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center text-xs font-bold text-slate-400 w-5">
                  {i + 1}
                </div>
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold ${item.avatarColor}`}
                >
                  {item.initials}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {item.name}
                  </p>
                  <p className="text-xs text-slate-400">{item.service}</p>
                </div>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${item.badgeColor}`}
              >
                {item.valueLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
