import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { BREAK_EXPECTED_DURATION_MIN } from "@/lib/attendance-engine";
import {
  combineDateAndTime,
  recalculateAttendanceFields,
} from "@/lib/attendance-recalc";

const timeHm = z.string().regex(/^\d{2}:\d{2}$/);

const patchSchema = z.object({
  breakComment: z.string().max(500).nullable().optional(),
  breakStartTimeHm: timeHm.optional().nullable(),
  breakEndTimeHm: timeHm.optional().nullable(),
  clearBreak: z.boolean().optional(),
});

/** Correction pause / motif (RH, Admin). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const before = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Pointage introuvable" }, { status: 404 });
    }

    let breakStartTime = before.breakStartTime;
    let breakEndTime = before.breakEndTime;

    if (parsed.data.clearBreak) {
      breakStartTime = null;
      breakEndTime = null;
    } else {
      if (parsed.data.breakStartTimeHm === null) breakStartTime = null;
      else if (parsed.data.breakStartTimeHm) {
        breakStartTime = combineDateAndTime(before.date, parsed.data.breakStartTimeHm);
      }
      if (parsed.data.breakEndTimeHm === null) breakEndTime = null;
      else if (parsed.data.breakEndTimeHm) {
        breakEndTime = combineDateAndTime(before.date, parsed.data.breakEndTimeHm);
      }
    }

    const hasBreakFields =
      parsed.data.breakStartTimeHm !== undefined ||
      parsed.data.breakEndTimeHm !== undefined ||
      parsed.data.clearBreak;

    if (hasBreakFields && breakStartTime && !breakEndTime && !before.checkOutTime) {
      return NextResponse.json(
        { error: "Renseignez l'heure de retour de pause ou le départ" },
        { status: 400 }
      );
    }

    const recalc = recalculateAttendanceFields({
      checkInTime: before.checkInTime,
      checkOutTime: before.checkOutTime,
      breakStartTime,
      breakEndTime,
    });

    const data: Record<string, unknown> = {
      breakStartTime,
      breakEndTime,
      breakMinutes: recalc.breakMinutes,
      breakDeductedMinutes: recalc.breakDeductedMinutes,
      totalMinutes: recalc.totalMinutes ?? before.totalMinutes,
    };

    if (parsed.data.breakComment !== undefined) {
      const comment = parsed.data.breakComment?.trim() || null;
      if (
        comment &&
        recalc.breakMinutes <= BREAK_EXPECTED_DURATION_MIN &&
        !hasBreakFields
      ) {
        return NextResponse.json(
          {
            error: `Motif réservé aux pauses de plus de ${BREAK_EXPECTED_DURATION_MIN} minutes`,
          },
          { status: 400 }
        );
      }
      data.breakComment = comment;
    }

    const record = await prisma.attendanceRecord.update({
      where: { id },
      data,
      include: { employee: { select: { firstName: true, lastName: true, matricule: true } } },
    });

    await createAuditLog({
      actorId: session.id,
      action: "CORRECTION",
      entity: "AttendanceRecord",
      entityId: id,
      before,
      after: record,
    });

    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("[API breaks PATCH]", error);
    if (error instanceof Error) {
      if (error.message === "Non authentifié") {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message === "Accès interdit") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
