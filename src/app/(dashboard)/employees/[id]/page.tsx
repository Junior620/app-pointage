import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Phone, MapPin, Hash, Building2 } from "lucide-react";

function getWorkingDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(from);
  while (d <= to) {
    if (d.getDay() !== 0) {
      days.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      site: true,
      attendances: {
        where: { date: { gte: thirtyDaysAgo } },
        orderBy: { date: "desc" },
      },
    },
  });

  if (!employee) notFound();

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: thirtyDaysAgo, lte: today } },
  });
  const holidaySet = new Set(holidays.map((h) => dateKey(h.date)));

  const workingDays = getWorkingDays(thirtyDaysAgo, today).filter(
    (d) => !holidaySet.has(dateKey(d))
  );

  const recordMap = new Map(
    employee.attendances.map((a) => [dateKey(a.date), a])
  );

  type DayRow = {
    date: Date;
    checkInTime: Date | null;
    checkInStatus: string | null;
    checkOutTime: Date | null;
    checkOutStatus: string | null;
    totalMinutes: number | null;
    finalStatus: string;
  };

  const rows: DayRow[] = workingDays
    .map((d) => {
      const rec = recordMap.get(dateKey(d));
      if (rec) {
        return {
          date: d,
          checkInTime: rec.checkInTime,
          checkInStatus: rec.checkInStatus,
          checkOutTime: rec.checkOutTime,
          checkOutStatus: rec.checkOutStatus,
          totalMinutes: rec.totalMinutes,
          finalStatus: rec.finalStatus,
        };
      }
      return {
        date: d,
        checkInTime: null,
        checkInStatus: null,
        checkOutTime: null,
        checkOutStatus: null,
        totalMinutes: null,
        finalStatus: "ABSENT",
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalWorkDays = rows.length;
  const onTimeDays = rows.filter((r) => r.checkInStatus === "ON_TIME").length;
  const lateDays = rows.filter((r) => r.checkInStatus === "LATE").length;
  const absentDays = rows.filter((r) => r.finalStatus === "ABSENT").length;
  const punctualityRate =
    onTimeDays + lateDays > 0
      ? Math.round((onTimeDays / (onTimeDays + lateDays)) * 100)
      : 100;

  return (
    <div className="space-y-6">
      <Link
        href="/employees"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour aux employés
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
            {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800">
                {employee.lastName} {employee.firstName}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                  employee.active
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {employee.active ? "Actif" : "Inactif"}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Hash className="w-4 h-4" />
                {employee.matricule}
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4" />
                {employee.service}
              </span>
              {employee.whatsappPhone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />
                  {employee.whatsappPhone}
                </span>
              )}
              {employee.site && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  {employee.site.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-500">Ponctualité</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{punctualityRate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-500">À l&apos;heure</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{onTimeDays}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-500">Retards</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">{lateDays}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-500">Absences</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{absentDays}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 text-center">
          <p className="text-sm text-slate-500">Jours ouvrés</p>
          <p className="text-3xl font-bold text-slate-600 mt-1">{totalWorkDays}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4">
          Historique de pointage (30 derniers jours)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Arrivée</th>
                <th className="pb-3 font-medium">Statut arrivée</th>
                <th className="pb-3 font-medium">Départ</th>
                <th className="pb-3 font-medium">Durée</th>
                <th className="pb-3 font-medium">Statut final</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Aucun jour ouvré sur cette période
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={dateKey(a.date)} className={cn(
                    "border-b border-slate-50 hover:bg-slate-50",
                    a.finalStatus === "ABSENT" && !a.checkInTime && "bg-red-50/40"
                  )}>
                    <td className="py-2.5 text-slate-700">
                      {a.date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {a.checkInTime
                        ? new Date(a.checkInTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className="py-2.5">
                      {a.checkInStatus ? (
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            a.checkInStatus === "ON_TIME"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-orange-100 text-orange-700"
                          )}
                        >
                          {a.checkInStatus === "ON_TIME" ? "À l'heure" : "Retard"}
                        </span>
                      ) : a.finalStatus === "ABSENT" ? (
                        <span className="text-xs text-red-400">—</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {a.checkOutTime
                        ? new Date(a.checkOutTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {a.totalMinutes != null
                        ? `${Math.floor(a.totalMinutes / 60)}h${(a.totalMinutes % 60).toString().padStart(2, "0")}`
                        : "—"}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          {
                            "bg-emerald-100 text-emerald-700": a.finalStatus === "PRESENT",
                            "bg-red-100 text-red-700": a.finalStatus === "ABSENT",
                            "bg-blue-100 text-blue-700": a.finalStatus === "PERMISSION",
                            "bg-purple-100 text-purple-700": a.finalStatus === "MISSION",
                          }
                        )}
                      >
                        {a.finalStatus}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
