import { prisma } from "./prisma";
import { isWithinZone, haversineDistance } from "./geofence";
import { parseTimeString, minutesBetween, isWeekend, todayDate } from "./utils";
import type { GeoPoint } from "@/types";
import type { CheckInStatus } from "@prisma/client";

type CheckResult = {
  success: boolean;
  message: string;
  status?: string;
};

async function getScheduleForEmployee(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { site: { include: { schedules: true } } },
  });

  if (!employee?.site?.schedules?.[0]) return null;
  return { employee, schedule: employee.site.schedules[0], site: employee.site };
}

async function isHoliday(date: Date): Promise<boolean> {
  const holiday = await prisma.holiday.findFirst({
    where: {
      date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    },
  });
  return !!holiday;
}

async function hasApprovedLeaveOrMission(
  employeeId: string,
  date: Date
): Promise<{ type: "PERMISSION" | "MISSION" | null }> {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const leave = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  if (leave) return { type: "PERMISSION" };

  const mission = await prisma.mission.findFirst({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { lte: d },
      endDate: { gte: d },
    },
  });
  if (mission) return { type: "MISSION" };

  return { type: null };
}

export async function verifyGeofence(
  employeeId: string,
  point: GeoPoint,
  actionType: string
): Promise<{ allowed: boolean; distance: number }> {
  const data = await getScheduleForEmployee(employeeId);

  if (!data) {
    await prisma.fraudAttempt.create({
      data: {
        employeeId,
        lat: point.lat,
        lng: point.lng,
        distanceM: -1,
        type: actionType,
      },
    });
    return { allowed: false, distance: -1 };
  }

  const center: GeoPoint = {
    lat: data.site.centerLat,
    lng: data.site.centerLng,
  };
  const distance = haversineDistance(point, center);
  const allowed = isWithinZone(point, center, data.site.radiusM);

  if (!allowed) {
    await prisma.fraudAttempt.create({
      data: {
        employeeId,
        lat: point.lat,
        lng: point.lng,
        distanceM: Math.round(distance),
        type: actionType,
      },
    });
  }

  return { allowed, distance: Math.round(distance) };
}

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Douala";

export async function processCheckIn(
  employeeId: string,
  point: GeoPoint,
  comment?: string
): Promise<CheckResult> {
  const now = new Date();
  const today = todayDate();

  if (isWeekend(today)) {
    return { success: false, message: "Pas de pointage le dimanche." };
  }

  if (await isHoliday(today)) {
    return { success: false, message: "Aujourd'hui est un jour férié." };
  }

  const leaveOrMission = await hasApprovedLeaveOrMission(employeeId, today);
  if (leaveOrMission.type) {
    return {
      success: false,
      message: `Vous êtes en ${leaveOrMission.type === "PERMISSION" ? "permission" : "mission"} aujourd'hui.`,
    };
  }

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });

  if (existing?.checkInTime) {
    return { success: false, message: "Vous avez déjà pointé votre arrivée aujourd'hui." };
  }

  const geo = await verifyGeofence(employeeId, point, "CHECK_IN");
  if (!geo.allowed) {
    return {
      success: false,
      message: `Vous n'êtes pas dans la zone de travail (${geo.distance}m). Pointage refusé.`,
    };
  }

  const data = await getScheduleForEmployee(employeeId);
  if (!data) {
    return { success: false, message: "Configuration manquante. Contactez les RH." };
  }

  const scheduleStart = parseTimeString(data.schedule.startTime, today, APP_TIMEZONE);
  const graceEnd = new Date(
    scheduleStart.getTime() + data.schedule.lateGraceMin * 60 * 1000
  );

  let status: CheckInStatus = "ON_TIME";
  if (now > graceEnd) {
    status = "LATE";
  }

  await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId, date: today } },
    create: {
      employeeId,
      date: today,
      checkInTime: now,
      checkInStatus: status,
      checkInComment: comment || null,
      checkInLat: point.lat,
      checkInLng: point.lng,
      finalStatus: "PRESENT",
    },
    update: {
      checkInTime: now,
      checkInStatus: status,
      checkInComment: comment || null,
      checkInLat: point.lat,
      checkInLng: point.lng,
      finalStatus: "PRESENT",
    },
  });

  const timeStr = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  });

  if (status === "LATE") {
    const lateMin = minutesBetween(graceEnd, now);
    const msg = comment
      ? `Arrivée enregistrée à ${timeStr} (en retard de ${lateMin} min). Motif: ${comment}`
      : `Arrivée enregistrée à ${timeStr} (en retard de ${lateMin} min).\n⚠️ Veuillez indiquer le motif de votre retard.`;
    return { success: true, message: msg, status: "LATE" };
  }

  return {
    success: true,
    message: `Arrivée enregistrée à ${timeStr}. Bonne journée ! ✅`,
    status: "ON_TIME",
  };
}

export async function processCheckOut(
  employeeId: string,
  point: GeoPoint,
  comment?: string
): Promise<CheckResult> {
  const now = new Date();
  const today = todayDate();

  const record = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });

  if (!record?.checkInTime) {
    return {
      success: false,
      message: "Aucune arrivée enregistrée aujourd'hui. Pointez d'abord votre arrivée.",
    };
  }

  if (record.checkOutTime && record.checkOutStatus === "MANUAL") {
    return { success: false, message: "Vous avez déjà pointé votre départ aujourd'hui." };
  }

  const geo = await verifyGeofence(employeeId, point, "CHECK_OUT");
  if (!geo.allowed) {
    return {
      success: false,
      message: `Vous n'êtes pas dans la zone de travail (${geo.distance}m). Pointage refusé.`,
    };
  }

  const data = await getScheduleForEmployee(employeeId);
  if (!data) {
    return { success: false, message: "Configuration manquante. Contactez les RH." };
  }

  const scheduleEnd = parseTimeString(data.schedule.endTime, today, APP_TIMEZONE);
  const scheduleStart = parseTimeString(data.schedule.startTime, today, APP_TIMEZONE);
  const total = minutesBetween(record.checkInTime, now);
  const normalMinutes = minutesBetween(scheduleStart, scheduleEnd);
  const overtime = Math.max(0, total - normalMinutes);

  await prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      checkOutTime: now,
      checkOutStatus: "MANUAL",
      checkOutComment: comment || null,
      checkOutLat: point.lat,
      checkOutLng: point.lng,
      totalMinutes: total,
      overtimeMinutes: overtime,
    },
  });

  const timeStr = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: APP_TIMEZONE,
  });
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const leftEarly = now < scheduleEnd;

  let msg: string;
  if (leftEarly) {
    const earlyMin = minutesBetween(now, scheduleEnd);
    msg = comment
      ? `Départ enregistré à ${timeStr} (en avance de ${earlyMin} min). Motif: ${comment}`
      : `Départ enregistré à ${timeStr} (en avance de ${earlyMin} min).\n⚠️ Veuillez indiquer le motif de votre départ anticipé.`;
  } else {
    msg = `Départ enregistré à ${timeStr}. Durée: ${hours}h${mins
      .toString()
      .padStart(2, "0")}. ✅`;
    if (overtime > 0) {
      const otH = Math.floor(overtime / 60);
      const otM = overtime % 60;
      msg += `\nHeures supplémentaires: ${otH}h${otM.toString().padStart(2, "0")}`;
    }
  }

  return {
    success: true,
    message: msg,
    status: "CHECKED_OUT",
  };
}

export type AutoCheckoutResult = {
  employeeId: string;
  firstName: string;
  whatsappPhone: string | null;
  checkOutTime: Date;
  checkInTime: Date;
};

export async function runAutoCheckout(): Promise<AutoCheckoutResult[]> {
  const today = todayDate();

  const records = await prisma.attendanceRecord.findMany({
    where: {
      date: today,
      checkInTime: { not: null },
      checkOutTime: null,
    },
    include: {
      employee: { include: { site: { include: { schedules: true } } } },
    },
  });

  const results: AutoCheckoutResult[] = [];
  for (const record of records) {
    const schedule = record.employee.site?.schedules?.[0];
    if (!schedule) continue;

    const endTime = parseTimeString(schedule.endTime, today, APP_TIMEZONE);
    const checkInTime = record.checkInTime!;
    const total = minutesBetween(checkInTime, endTime);

    await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutTime: endTime,
        checkOutStatus: "AUTO",
        checkOutComment: "Départ auto – non déclaré",
        totalMinutes: Math.max(0, total),
        overtimeMinutes: 0,
      },
    });

    results.push({
      employeeId: record.employee.id,
      firstName: record.employee.firstName,
      whatsappPhone: record.employee.whatsappPhone,
      checkOutTime: endTime,
      checkInTime,
    });
  }

  return results;
}

export async function runMarkAbsent(): Promise<number> {
  const today = todayDate();

  if (isWeekend(today)) return 0;
  if (await isHoliday(today)) return 0;

  const allActive = await prisma.employee.findMany({
    where: { active: true, whatsappPhone: { not: null } },
    select: { id: true },
  });

  let count = 0;
  for (const emp of allActive) {
    const existing = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: emp.id, date: today } },
    });

    if (existing) continue;

    const leaveOrMission = await hasApprovedLeaveOrMission(emp.id, today);

    if (leaveOrMission.type === "PERMISSION") {
      await prisma.attendanceRecord.create({
        data: {
          employeeId: emp.id,
          date: today,
          finalStatus: "PERMISSION",
        },
      });
    } else if (leaveOrMission.type === "MISSION") {
      await prisma.attendanceRecord.create({
        data: {
          employeeId: emp.id,
          date: today,
          finalStatus: "MISSION",
        },
      });
    } else {
      await prisma.attendanceRecord.create({
        data: {
          employeeId: emp.id,
          date: today,
          finalStatus: "ABSENT",
        },
      });
    }
    count++;
  }

  return count;
}
