import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Phone, MapPin, Hash, Building2 } from "lucide-react";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      site: true,
      attendances: {
        orderBy: { date: "desc" },
        take: 30,
      },
    },
  });

  if (!employee) notFound();

  const totalDays = employee.attendances.length;
  const onTimeDays = employee.attendances.filter((a) => a.checkInStatus === "ON_TIME").length;
  const lateDays = employee.attendances.filter((a) => a.checkInStatus === "LATE").length;
  const absentDays = employee.attendances.filter((a) => a.finalStatus === "ABSENT").length;
  const punctualityRate = totalDays > 0 ? Math.round((onTimeDays / totalDays) * 100) : 0;

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

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
              {employee.attendances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Aucun pointage
                  </td>
                </tr>
              ) : (
                employee.attendances.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 text-slate-700">
                      {new Date(a.date).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {a.checkInTime
                        ? new Date(a.checkInTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className="py-2.5">
                      {a.checkInStatus && (
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
                      )}
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
