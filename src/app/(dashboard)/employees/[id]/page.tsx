import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { cn, formatTime, isWorkingDay } from "@/lib/utils";
import { Phone, MapPin, Hash, Building2, CalendarClock, Clock, UserX, Timer, CalendarDays, Gauge } from "lucide-react";
import { resolveEmployeeStatsPeriod } from "@/lib/period-range";
import { departureReasonLabel } from "@/lib/departure-labels";
import { isStructureCode } from "@/lib/brand";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge, StructureBadge } from "@/components/ui/StatusBadge";
import { StatTile } from "@/components/ui/StatTile";
import { Table, THead, Th, Tr, Td, TableMessageRow } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import StructureLogo from "@/components/brand/StructureLogo";
import HrRemarks from "./HrRemarks";
import EmployeePeriodNav from "./EmployeePeriodNav";
import EmployeeAttendanceExport from "./EmployeeAttendanceExport";

/** Jours de la période, du plus ancien au plus récent (dates locales). */
function getCalendarDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(from);
  while (d <= to) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Date civile locale (jours ouvrés affichés) — évite le décalage UTC de toISOString(). */
function dateKeyLocalCalendar(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date stockée @db.Date (minuit UTC) → même YYYY-MM-DD que le calendrier. */
function dateKeyFromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Jour civil local → valeur d'une colonne `@db.Date` (minuit UTC du même jour).
 * Comparer directement une date « minuit local » à ces colonnes excluait le jour même
 * sur un serveur à l'est de UTC (le pointage du jour apparaissait « Absent »).
 */
function toDbDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function formatMinutes(min: number): string {
  return `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, "0")}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  const employee = session
    ? await tenantDb(session.organizationId).employee.findUnique({
        where: { id },
        select: { firstName: true, lastName: true },
      })
    : null;
  // Titre complet : le modèle « %s · Pointage RH » n'est pas transmis à travers le layout Employés.
  return { title: { absolute: `${employee ? `${employee.firstName} ${employee.lastName}` : "Employé"} · Pointage RH` } };
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = tenantDb(session.organizationId);

  const { id } = await params;
  const sp = await searchParams;
  const periodRes = resolveEmployeeStatsPeriod(sp);
  const { rangeFrom, rangeTo } = periodRes;
  const dbRange = { gte: toDbDate(rangeFrom), lte: toDbDate(rangeTo) };

  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      site: true,
      checkoutSite: true,
      whatsappPhones: { orderBy: { sortOrder: "asc" } },
      attendances: {
        where: { date: dbRange },
        orderBy: { date: "desc" },
      },
    },
  });

  if (!employee) notFound();

  const holidays = await db.holiday.findMany({
    where: { date: dbRange },
  });
  const holidaySet = new Set(holidays.map((h) => dateKeyFromDbDate(h.date)));

  const recordMap = new Map(employee.attendances.map((a) => [dateKeyFromDbDate(a.date), a]));

  // Bornes du contrat : pas d'absence comptée avant l'embauche ni après le départ.
  const hiredKey = dateKeyLocalCalendar(employee.createdAt);
  const leftKey = employee.departureDate ? dateKeyFromDbDate(employee.departureDate) : null;

  type DayRow = {
    date: Date;
    checkInTime: Date | null;
    checkInStatus: string | null;
    checkOutTime: Date | null;
    checkOutStatus: string | null;
    totalMinutes: number | null;
    overtimeMinutes: number | null;
    overtimeStatus: string | null;
    finalStatus: string;
    weekend: boolean;
  };

  // Lundi–vendredi (hors fériés) + tout jour de week-end réellement pointé (travail volontaire),
  // comme le marquage automatique des absences (runMarkAbsent).
  const rows: DayRow[] = getCalendarDays(rangeFrom, rangeTo)
    .flatMap((d): DayRow[] => {
      const key = dateKeyLocalCalendar(d);
      const rec = recordMap.get(key);
      const weekend = !isWorkingDay(d);
      if (rec) {
        return [
          {
            date: d,
            checkInTime: rec.checkInTime,
            checkInStatus: rec.checkInStatus,
            checkOutTime: rec.checkOutTime,
            checkOutStatus: rec.checkOutStatus,
            totalMinutes: rec.totalMinutes,
            overtimeMinutes: rec.overtimeMinutes,
            overtimeStatus: rec.overtimeStatus ?? null,
            finalStatus: weekend && rec.finalStatus === "ABSENT" && !rec.checkInTime ? "NOT_WORKED" : rec.finalStatus,
            weekend,
          },
        ];
      }
      if (weekend || holidaySet.has(key) || key < hiredKey || (leftKey && key > leftKey)) return [];
      return [
        {
          date: d,
          checkInTime: null,
          checkInStatus: null,
          checkOutTime: null,
          checkOutStatus: null,
          totalMinutes: null,
          overtimeMinutes: null,
          overtimeStatus: null,
          finalStatus: "ABSENT",
          weekend,
        },
      ];
    })
    .filter((r) => r.finalStatus !== "NOT_WORKED")
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalWorkDays = rows.filter((r) => !r.weekend).length;
  const onTimeDays = rows.filter((r) => r.checkInStatus === "ON_TIME").length;
  const lateDays = rows.filter((r) => r.checkInStatus === "LATE").length;
  const absentDays = rows.filter((r) => r.finalStatus === "ABSENT").length;
  const totalOvertimeMin = rows.reduce(
    (sum, r) => sum + (["APPROVED", null].includes(r.overtimeStatus ?? null) ? r.overtimeMinutes ?? 0 : 0),
    0
  );
  // Sans arrivée pointée sur la période, le taux est sans objet (et non 100 %).
  const punctualityRate =
    onTimeDays + lateDays > 0 ? Math.round((onTimeDays / (onTimeDays + lateDays)) * 100) : null;

  const phones = employee.whatsappPhones.length > 0
    ? employee.whatsappPhones.map((p) => p.phone)
    : employee.whatsappPhone
      ? [employee.whatsappPhone]
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/employees"
        backLabel="Employés"
        title={`${employee.firstName} ${employee.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={employee.active ? "success" : "danger"} dot>
              {employee.active ? "Actif" : employee.departureReason ? "Parti" : "Inactif"}
            </Badge>
            <StructureBadge value={employee.structure} />
            <span className="text-slate-500">{employee.service}</span>
          </span>
        }
        actions={<EmployeeAttendanceExport employeeId={id} />}
      />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl font-bold text-brand-700">
            {employee.firstName.charAt(0)}
            {employee.lastName.charAt(0)}
          </span>
          <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <InfoItem icon={Hash} label="Matricule" value={<span className="font-mono">{employee.matricule}</span>} />
            <InfoItem icon={Building2} label="Service" value={employee.service} />
            <InfoItem
              icon={Phone}
              label={phones.length > 1 ? "WhatsApp (2 numéros)" : "WhatsApp"}
              value={phones.length > 0 ? phones.join(" · ") : <span className="text-amber-700">Non connecté</span>}
            />
            <InfoItem icon={MapPin} label="Zone 1" value={employee.site?.name ?? <span className="text-amber-700">Non assignée</span>} />
            {employee.checkoutSite && employee.checkoutSite.id !== employee.site?.id && (
              <InfoItem icon={MapPin} label="Zone 2" value={employee.checkoutSite.name} />
            )}
            <InfoItem
              icon={CalendarClock}
              label="Dans l'application depuis"
              value={employee.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            />
          </dl>
          {isStructureCode(employee.structure) && (
            <div className="hidden shrink-0 lg:block">
              <StructureLogo code={employee.structure} size="lg" />
            </div>
          )}
        </div>
      </Card>

      {!employee.active && (
        <div
          className={cn(
            "rounded-2xl border px-5 py-4 text-sm",
            employee.departureReason ? "border-amber-200 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-700"
          )}
        >
          <p className="font-semibold">{employee.departureReason ? "Employé parti" : "Employé inactif"}</p>
          {employee.departureDate && (
            <p className="mt-1">
              Date de départ :{" "}
              <span className="font-medium">
                {new Date(employee.departureDate).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </p>
          )}
          {employee.departureReason ? (
            <p className="mt-1">
              Motif : <span className="font-medium">{departureReasonLabel(employee.departureReason)}</span>
            </p>
          ) : (
            <p className="mt-1 text-slate-600">
              Motif de départ non renseigné : complétez-le depuis la liste des employés.
            </p>
          )}
          {employee.departureNote && (
            <p
              className={cn(
                "mt-2 whitespace-pre-wrap border-t pt-2 text-slate-700",
                employee.departureReason ? "border-amber-200/60" : "border-slate-200"
              )}
            >
              {employee.departureNote}
            </p>
          )}
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <EmployeePeriodNav employeeId={id} resolution={periodRes} />
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <StatTile icon={Gauge} label="Ponctualité" value={punctualityRate == null ? "—" : `${punctualityRate} %`} tone="brand" />
        <StatTile icon={Clock} label="À l'heure" value={onTimeDays} tone="success" />
        <StatTile icon={Clock} label="Retards" value={lateDays} tone="warning" />
        <StatTile icon={UserX} label="Absences" value={absentDays} tone="danger" />
        <StatTile icon={Timer} label="Heures sup" value={totalOvertimeMin > 0 ? formatMinutes(totalOvertimeMin) : "0"} tone="violet" />
        <StatTile icon={CalendarDays} label="Jours ouvrés" value={totalWorkDays} tone="neutral" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Historique de pointage" description={`${periodRes.label} · jours ouvrés et week-ends travaillés`} className="pb-4" />
        <Table>
          <THead>
            <tr>
              <Th>Date</Th>
              <Th>Arrivée</Th>
              <Th>Départ</Th>
              <Th>Durée</Th>
              <Th>Heures sup</Th>
              <Th>Statut</Th>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <TableMessageRow cols={6}>
                <EmptyState icon={CalendarDays} title="Aucun jour ouvré sur cette période" />
              </TableMessageRow>
            ) : (
              rows.map((a) => (
                <Tr
                  key={dateKeyLocalCalendar(a.date)}
                  className={cn(a.finalStatus === "ABSENT" && !a.checkInTime && "bg-red-50/40")}
                >
                  <Td className="whitespace-nowrap font-medium text-slate-700">
                    {a.date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}
                    {a.weekend && <Badge className="ml-2">Week-end</Badge>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="tabular-nums">{formatTime(a.checkInTime)}</span>
                      {a.checkInStatus && <StatusBadge kind="checkIn" value={a.checkInStatus} />}
                    </div>
                  </Td>
                  <Td className="tabular-nums">{a.checkOutTime ? formatTime(a.checkOutTime) : "—"}</Td>
                  <Td className="tabular-nums">{a.totalMinutes != null ? formatMinutes(a.totalMinutes) : "—"}</Td>
                  <Td>
                    {a.overtimeMinutes && a.overtimeMinutes > 0 ? (
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="font-medium tabular-nums text-violet-600">{formatMinutes(a.overtimeMinutes)}</span>
                        {a.overtimeStatus && <StatusBadge kind="overtime" value={a.overtimeStatus} />}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <StatusBadge kind="final" value={a.finalStatus} />
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <HrRemarks employeeId={id} userRole={session.role} />
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="truncate font-medium text-slate-800">{value}</dd>
      </div>
    </div>
  );
}
