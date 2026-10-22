import type { AttendanceRecord, Prisma } from "@prisma/client";
import type { Db } from "./tenant";
import {
  combineDateAndTime,
  deriveCheckInStatus,
  recalculateAttendanceFields,
} from "./attendance-recalc";
import { parseOvertimeHm } from "./correction-reasons";

const timeHmRe = /^\d{2}:\d{2}$/;

export type AttendanceCorrectionInput = {
  checkInTime?: string;
  checkOutTime?: string;
  checkInTimeHm?: string;
  checkOutTimeHm?: string;
  checkInStatus?: "ON_TIME" | "LATE";
  checkOutStatus?: "MANUAL" | "AUTO";
  finalStatus?: "PRESENT" | "ABSENT" | "PERMISSION" | "MISSION";
  comment?: string;
  checkOutComment?: string | null;
  breakStartTimeHm?: string | null;
  breakEndTimeHm?: string | null;
  breakComment?: string | null;
  clearCheckIn?: boolean;
  clearCheckOut?: boolean;
  clearBreak?: boolean;
  overtimeHm?: string;
  overtimeMinutes?: number;
  overtimeStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  overtimeReason?: string | null;
  correctionReason?: string | null;
  recalculateCheckInStatus?: boolean;
};

export async function buildAttendanceCorrectionData(
  db: Db,
  before: AttendanceRecord,
  updates: AttendanceCorrectionInput,
  actorId?: string
): Promise<Prisma.AttendanceRecordUpdateInput> {
  let checkInTime = before.checkInTime;
  let checkOutTime = before.checkOutTime;
  let breakStartTime = before.breakStartTime;
  let breakEndTime = before.breakEndTime;

  if (updates.clearCheckIn) checkInTime = null;
  if (updates.clearCheckOut) checkOutTime = null;
  if (updates.clearBreak) {
    breakStartTime = null;
    breakEndTime = null;
  }

  if (updates.checkInTime) checkInTime = new Date(updates.checkInTime);
  if (updates.checkOutTime) checkOutTime = new Date(updates.checkOutTime);
  if (updates.checkInTimeHm && timeHmRe.test(updates.checkInTimeHm)) {
    checkInTime = combineDateAndTime(before.date, updates.checkInTimeHm);
  }
  if (updates.checkOutTimeHm && timeHmRe.test(updates.checkOutTimeHm)) {
    checkOutTime = combineDateAndTime(before.date, updates.checkOutTimeHm);
  }
  if (updates.breakStartTimeHm === null) breakStartTime = null;
  else if (updates.breakStartTimeHm && timeHmRe.test(updates.breakStartTimeHm)) {
    breakStartTime = combineDateAndTime(before.date, updates.breakStartTimeHm);
  }
  if (updates.breakEndTimeHm === null) breakEndTime = null;
  else if (updates.breakEndTimeHm && timeHmRe.test(updates.breakEndTimeHm)) {
    breakEndTime = combineDateAndTime(before.date, updates.breakEndTimeHm);
  }

  const data: Prisma.AttendanceRecordUpdateInput = {
    checkInTime,
    checkOutTime,
    breakStartTime,
    breakEndTime,
  };

  const checkoutCleared =
    Boolean(updates.clearCheckOut) || Boolean(before.checkOutTime && !checkOutTime);

  if (checkoutCleared) {
    data.checkOutStatus = null;
    data.checkOutLat = null;
    data.checkOutLng = null;
    data.checkOutComment = null;
    data.overtimeMinutes = 0;
    data.overtimeStatus = null;
    data.overtimeReason = null;
    data.overtimeValidatedBy = null;
    data.overtimeValidatedAt = null;
  }

  if (updates.clearCheckIn || !checkInTime) {
    if (updates.clearCheckIn || (before.checkInTime && !checkInTime)) {
      data.checkInStatus = null;
      data.checkInComment = null;
    }
  }

  if (updates.clearBreak) {
    data.breakComment = null;
    data.breakMinutes = 0;
    data.breakDeductedMinutes = 0;
  }

  const arrivalTimeChanged = Boolean(
    updates.checkInTimeHm || updates.checkInTime
  );
  const shouldDerive =
    Boolean(checkInTime) &&
    arrivalTimeChanged &&
    (updates.recalculateCheckInStatus !== false) &&
    !updates.checkInStatus;

  if (updates.checkInStatus) {
    data.checkInStatus = updates.checkInStatus;
  } else if (shouldDerive && checkInTime) {
    data.checkInStatus = await deriveCheckInStatus(
      db,
      before.employeeId,
      before.date,
      checkInTime
    );
  }

  if (updates.checkOutStatus && checkOutTime) {
    data.checkOutStatus = updates.checkOutStatus;
  }

  if (updates.finalStatus) {
    data.finalStatus = updates.finalStatus;
    if (updates.finalStatus === "PRESENT" && checkInTime && !updates.checkInStatus) {
      data.checkInStatus = await deriveCheckInStatus(
        db,
        before.employeeId,
        before.date,
        checkInTime
      );
    }
  }

  if (updates.correctionReason !== undefined) {
    data.correctionReason = updates.correctionReason || null;
  }
  if (updates.comment !== undefined && !updates.clearCheckIn) {
    data.checkInComment = updates.comment.trim() || null;
  }

  if (updates.checkOutComment !== undefined && !checkoutCleared) {
    data.checkOutComment = updates.checkOutComment?.trim() || null;
  }
  if (updates.breakComment !== undefined && !updates.clearBreak) {
    data.breakComment = updates.breakComment?.trim() || null;
  }

  let overtimeMinutes: number | null | undefined;
  if (updates.overtimeHm !== undefined) {
    overtimeMinutes = updates.overtimeHm ? parseOvertimeHm(updates.overtimeHm) : 0;
  } else if (updates.overtimeMinutes !== undefined) {
    overtimeMinutes = Math.max(0, updates.overtimeMinutes);
  }

  if (overtimeMinutes !== undefined) {
    data.overtimeMinutes = overtimeMinutes;
    if (!overtimeMinutes) {
      data.overtimeStatus = null;
      data.overtimeReason = null;
      data.overtimeValidatedBy = null;
      data.overtimeValidatedAt = null;
    }
  }
  if (updates.overtimeStatus !== undefined && (overtimeMinutes ?? before.overtimeMinutes ?? 0) > 0) {
    data.overtimeStatus = updates.overtimeStatus;
    if (updates.overtimeStatus === "APPROVED" && actorId) {
      data.overtimeValidatedBy = actorId;
      data.overtimeValidatedAt = new Date();
    }
    if (updates.overtimeStatus === "PENDING" || updates.overtimeStatus === null) {
      data.overtimeValidatedBy = null;
      data.overtimeValidatedAt = null;
    }
  }
  if (updates.overtimeReason !== undefined) {
    data.overtimeReason = updates.overtimeReason?.trim() || null;
  }

  if (updates.finalStatus === "ABSENT") {
    data.checkInTime = null;
    data.checkOutTime = null;
    data.breakStartTime = null;
    data.breakEndTime = null;
    data.checkInStatus = null;
    data.checkOutStatus = null;
    data.breakMinutes = 0;
    data.breakDeductedMinutes = 0;
    data.totalMinutes = null;
    data.overtimeMinutes = 0;
    data.overtimeStatus = null;
  } else {
    if (updates.finalStatus === "PRESENT" && !checkInTime) {
      throw new Error("PRESENT_NEEDS_CHECKIN");
    }
    const recalc = recalculateAttendanceFields({
      checkInTime,
      checkOutTime,
      breakStartTime,
      breakEndTime,
    });
    data.breakMinutes = recalc.breakMinutes;
    data.breakDeductedMinutes = recalc.breakDeductedMinutes;
    data.totalMinutes = recalc.totalMinutes;
  }

  return data;
}

export async function applyAttendanceCorrection(params: {
  db: Db;
  record: AttendanceRecord;
  updates: AttendanceCorrectionInput;
  actorId: string;
}) {
  const data = await buildAttendanceCorrectionData(
    params.db,
    params.record,
    params.updates,
    params.actorId
  );
  return params.db.attendanceRecord.update({
    where: { id: params.record.id },
    data,
    include: { employee: true },
  });
}
