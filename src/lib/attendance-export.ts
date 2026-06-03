import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { startOfLocalDay, toInputDateLocal } from "./period-range";
import { formatTime, isWorkingDay, parseDateInputForDbDate } from "./utils";

/** Clé calendrier alignée sur les dates @db.Date (UTC midi). */
function dateKeyFromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateKeyFromLocalDay(d: Date): string {
  return toInputDateLocal(startOfLocalDay(d));
}

export type AttendanceExportPreset = "week" | "month" | "custom";

export function resolveAttendanceExportRange(
  preset: AttendanceExportPreset,
  fromStr?: string,
  toStr?: string
): { from: Date; to: Date; label: string } {
  const today = startOfLocalDay(new Date());

  if (preset === "week") {
    const from = startOfLocalDay(new Date(today));
    const day = from.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    from.setDate(from.getDate() + diff);
    return {
      from,
      to: today,
      label: `Semaine du ${from.toLocaleDateString("fr-FR")} au ${today.toLocaleDateString("fr-FR")}`,
    };
  }

  if (preset === "month") {
    const from = startOfLocalDay(
      new Date(today.getFullYear(), today.getMonth(), 1)
    );
    return {
      from,
      to: today,
      label: today.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    };
  }

  const from = fromStr
    ? startOfLocalDay(new Date(fromStr + "T12:00:00"))
    : today;
  let to = toStr ? startOfLocalDay(new Date(toStr + "T12:00:00")) : today;
  if (to > today) to = today;
  if (from > to) {
    return { from: to, to, label: toInputDateLocal(to) };
  }
  return {
    from,
    to,
    label: `${toInputDateLocal(from)} — ${toInputDateLocal(to)}`,
  };
}

export type AttendanceExportLine = {
  employeeId: string;
  matricule: string;
  lastName: string;
  firstName: string;
  service: string;
  structure: string;
  date: Date;
  checkInTime: Date | null;
  checkInStatus: string | null;
  checkOutTime: Date | null;
  breakStartTime: Date | null;
  breakEndTime: Date | null;
  breakMinutes: number | null;
  totalMinutes: number | null;
  overtimeMinutes: number | null;
  finalStatus: string;
};

function statusArrivalLabel(s: string | null): string {
  if (s === "ON_TIME") return "À l'heure";
  if (s === "LATE") return "Retard";
  return "—";
}

function statusFinalLabel(s: string): string {
  const map: Record<string, string> = {
    PRESENT: "Présent",
    ABSENT: "Absent",
    PERMISSION: "Autorisation d'absence",
    MISSION: "Mission",
  };
  return map[s] ?? s;
}

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  return `${Math.floor(min / 60)}h${(min % 60).toString().padStart(2, "0")}`;
}

export async function fetchAttendanceExportLines(
  employeeIds: string[],
  from: Date,
  to: Date
): Promise<AttendanceExportLine[]> {
  if (employeeIds.length === 0) return [];

  const rangeFromDb = parseDateInputForDbDate(toInputDateLocal(from));
  const rangeToDb = parseDateInputForDbDate(toInputDateLocal(to));

  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      matricule: true,
      firstName: true,
      lastName: true,
      service: true,
      structure: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: { in: employeeIds },
      date: { gte: rangeFromDb, lte: rangeToDb },
    },
    orderBy: [{ date: "asc" }, { employeeId: "asc" }],
  });

  const recordByKey = new Map<string, (typeof records)[number]>(
    records.map((r) => [`${r.employeeId}:${dateKeyFromDbDate(r.date)}`, r])
  );

  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: rangeFromDb, lte: rangeToDb } },
    select: { date: true },
  });
  const holidaySet = new Set(holidays.map((h) => dateKeyFromDbDate(h.date)));

  const lines: AttendanceExportLine[] = [];

  for (const emp of employees) {
    const cursor = startOfLocalDay(new Date(from));
    const end = startOfLocalDay(new Date(to));
    while (cursor <= end) {
      const dayKey = dateKeyFromLocalDay(cursor);
      const key = `${emp.id}:${dayKey}`;
      const isWork = isWorkingDay(cursor) && !holidaySet.has(dayKey);
      if (!isWork) {
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      const rec = recordByKey.get(key);
      lines.push({
        employeeId: emp.id,
        matricule: emp.matricule,
        lastName: emp.lastName,
        firstName: emp.firstName,
        service: emp.service,
        structure: emp.structure,
        date: new Date(cursor),
        checkInTime: rec?.checkInTime ?? null,
        checkInStatus: rec?.checkInStatus ?? null,
        checkOutTime: rec?.checkOutTime ?? null,
        breakStartTime: rec?.breakStartTime ?? null,
        breakEndTime: rec?.breakEndTime ?? null,
        breakMinutes: rec?.breakMinutes ?? null,
        totalMinutes: rec?.totalMinutes ?? null,
        overtimeMinutes: rec?.overtimeMinutes ?? null,
        finalStatus: rec?.finalStatus ?? "ABSENT",
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return lines;
}

export async function buildAttendanceExportBuffer(
  lines: AttendanceExportLine[],
  sheetTitle = "Pointages"
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetTitle);
  const multi = new Set(lines.map((l) => l.employeeId)).size > 1;

  ws.columns = [
    ...(multi
      ? [
          { header: "Matricule", key: "matricule", width: 14 },
          { header: "Nom", key: "lastName", width: 16 },
          { header: "Prénom", key: "firstName", width: 14 },
          { header: "Service", key: "service", width: 14 },
        ]
      : []),
    { header: "Date", key: "date", width: 14 },
    { header: "Arrivée", key: "checkIn", width: 10 },
    { header: "Statut arrivée", key: "checkInStatus", width: 14 },
    { header: "Départ", key: "checkOut", width: 10 },
    { header: "Début pause", key: "breakStart", width: 12 },
    { header: "Fin pause", key: "breakEnd", width: 12 },
    { header: "Durée pause", key: "breakMin", width: 12 },
    { header: "Durée travail", key: "total", width: 12 },
    { header: "Heures sup", key: "overtime", width: 12 },
    { header: "Statut final", key: "finalStatus", width: 16 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };
  });

  for (const line of lines) {
    ws.addRow({
      ...(multi
        ? {
            matricule: line.matricule,
            lastName: line.lastName,
            firstName: line.firstName,
            service: line.service,
          }
        : {}),
      date: line.date.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      checkIn: formatTime(line.checkInTime),
      checkInStatus: statusArrivalLabel(line.checkInStatus),
      checkOut: formatTime(line.checkOutTime),
      breakStart: formatTime(line.breakStartTime),
      breakEnd: formatTime(line.breakEndTime),
      breakMin: fmtDuration(line.breakMinutes),
      total: fmtDuration(line.totalMinutes),
      overtime: fmtDuration(line.overtimeMinutes),
      finalStatus: statusFinalLabel(line.finalStatus),
    });
  }

  return workbook.xlsx.writeBuffer();
}
