import { z } from "zod";
import { CORRECTION_REASON_CODES } from "./correction-reasons";

export const timeHm = z.string().regex(/^\d{2}:\d{2}$/);

export const attendanceFieldsSchema = z.object({
  checkInTime: z.string().datetime().optional(),
  checkOutTime: z.string().datetime().optional(),
  checkInTimeHm: timeHm.optional(),
  checkOutTimeHm: timeHm.optional(),
  checkInStatus: z.enum(["ON_TIME", "LATE"]).optional(),
  checkOutStatus: z.enum(["MANUAL", "AUTO"]).optional(),
  finalStatus: z.enum(["PRESENT", "ABSENT", "PERMISSION", "MISSION"]).optional(),
  comment: z.string().max(500).optional(),
  checkOutComment: z.string().max(500).nullable().optional(),
  breakStartTimeHm: timeHm.optional().nullable(),
  breakEndTimeHm: timeHm.optional().nullable(),
  breakComment: z.string().max(500).nullable().optional(),
  clearCheckIn: z.boolean().optional(),
  clearCheckOut: z.boolean().optional(),
  clearBreak: z.boolean().optional(),
  overtimeHm: timeHm.optional(),
  overtimeMinutes: z.number().int().min(0).optional(),
  overtimeStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).nullable().optional(),
  overtimeReason: z.string().max(500).nullable().optional(),
  correctionReason: z.enum(CORRECTION_REASON_CODES).nullable().optional(),
  recalculateCheckInStatus: z.boolean().optional(),
});

export const correctionPutSchema = attendanceFieldsSchema.extend({
  id: z.string().min(1),
});

export const correctionCreateSchema = attendanceFieldsSchema.extend({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const correctionBulkSchema = attendanceFieldsSchema.extend({
  employeeId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workingDaysOnly: z.boolean().optional(),
});
