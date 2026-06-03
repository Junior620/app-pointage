import { prisma } from "./prisma";
import { BREAK_EXPECTED_DURATION_MIN } from "./attendance-engine";
import { minutesBetween, parseTimeString, isSaturdayOrSunday } from "./utils";
import type { CheckInStatus } from "@prisma/client";

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Douala";

export function computeBreakMinutesFromTimes(
  breakStartTime: Date | null,
  breakEndTime: Date | null,
  checkoutRef: Date
): number {
  if (!breakStartTime) return 0;
  const effectiveEnd = breakEndTime ?? checkoutRef;
  if (effectiveEnd <= breakStartTime) return 0;
  return Math.max(0, minutesBetween(breakStartTime, effectiveEnd));
}

export function computeBreakDeductedMinutes(measuredMinutes: number): number {
  return Math.max(0, Math.min(measuredMinutes, BREAK_EXPECTED_DURATION_MIN));
}

export async function deriveCheckInStatus(
  employeeId: string,
  date: Date,
  checkInTime: Date
): Promise<CheckInStatus> {
  if (isSaturdayOrSunday(date)) return "ON_TIME";

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { site: { include: { schedules: true } } },
  });
  const schedule = employee?.site?.schedules?.[0];
  if (!schedule) return "ON_TIME";

  const scheduleStart = parseTimeString(schedule.startTime, date, APP_TIMEZONE);
  const graceEnd = new Date(
    scheduleStart.getTime() + schedule.lateGraceMin * 60 * 1000
  );
  return checkInTime > graceEnd ? "LATE" : "ON_TIME";
}

export function recalculateAttendanceFields(input: {
  checkInTime: Date | null;
  checkOutTime: Date | null;
  breakStartTime: Date | null;
  breakEndTime: Date | null;
}): {
  breakMinutes: number;
  breakDeductedMinutes: number;
  totalMinutes: number | null;
} {
  const checkoutRef = input.checkOutTime ?? new Date();
  const breakMinutes = computeBreakMinutesFromTimes(
    input.breakStartTime,
    input.breakEndTime,
    checkoutRef
  );
  const breakDeductedMinutes = computeBreakDeductedMinutes(breakMinutes);

  let totalMinutes: number | null = null;
  if (input.checkInTime && input.checkOutTime) {
    const gross = minutesBetween(input.checkInTime, input.checkOutTime);
    totalMinutes = Math.max(0, gross - breakDeductedMinutes);
  }

  return { breakMinutes, breakDeductedMinutes, totalMinutes };
}

/** Combine une date @db.Date et une heure « HH:MM » (fuseau app). */
export function combineDateAndTime(
  recordDate: Date,
  timeStr: string,
  timezone = APP_TIMEZONE
): Date {
  const y = recordDate.getUTCFullYear();
  const m = recordDate.getUTCMonth();
  const d = recordDate.getUTCDate();
  const localDay = new Date(y, m, d, 12, 0, 0, 0);
  return parseTimeString(timeStr, localDay, timezone);
}
