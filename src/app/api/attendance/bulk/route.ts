import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { isWorkingDay, parseDateInputForDbDate } from "@/lib/utils";
import {
  applyAttendanceCorrection,
  buildAttendanceCorrectionData,
} from "@/lib/attendance-correction";
import { correctionBulkSchema } from "@/lib/attendance-correction-schema";

function eachDateInclusive(fromStr: string, toStr: string): string[] {
  const from = parseDateInputForDbDate(fromStr);
  const to = parseDateInputForDbDate(toStr);
  const out: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const body = await request.json();
    const parsed = correctionBulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { employeeId, from, to, workingDaysOnly, ...updates } = parsed.data;
    if (from > to) {
      return NextResponse.json({ error: "La date de début doit précéder la date de fin" }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    let days = eachDateInclusive(from, to);
    if (days.length > 31) {
      return NextResponse.json({ error: "Maximum 31 jours par correction groupée" }, { status: 400 });
    }
    if (workingDaysOnly) {
      days = days.filter((d) => isWorkingDay(parseDateInputForDbDate(d)));
    }
    if (days.length === 0) {
      return NextResponse.json(
        { error: "Aucun jour à corriger sur cette période" },
        { status: 400 }
      );
    }

    const results: { date: string; id: string }[] = [];
    for (const dateStr of days) {
      const date = parseDateInputForDbDate(dateStr);
      const existing = await prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId, date } },
      });

      if (existing) {
        const record = await applyAttendanceCorrection({
          record: existing,
          updates,
          actorId: session.id,
        });
        await createAuditLog({
          actorId: session.id,
          action: "CORRECTION",
          entity: "AttendanceRecord",
          entityId: existing.id,
          before: existing,
          after: record,
        });
        results.push({ date: dateStr, id: record.id });
        continue;
      }

      const stub = await prisma.attendanceRecord.create({
        data: {
          employeeId,
          date,
          finalStatus: updates.finalStatus ?? "PRESENT",
        },
      });
      try {
        const data = await buildAttendanceCorrectionData(stub, updates, session.id);
        const record = await prisma.attendanceRecord.update({
          where: { id: stub.id },
          data,
          include: { employee: true },
        });
        await createAuditLog({
          actorId: session.id,
          action: "CORRECTION",
          entity: "AttendanceRecord",
          entityId: stub.id,
          before: null,
          after: record,
        });
        results.push({ date: dateStr, id: record.id });
      } catch (e) {
        await prisma.attendanceRecord.delete({ where: { id: stub.id } }).catch(() => {});
        throw e;
      }
    }

    return NextResponse.json({
      data: results,
      count: results.length,
      message: `${results.length} jour(s) mis à jour`,
    });
  } catch (error) {
    console.error("[API attendance bulk]", error);
    if (error instanceof Error && error.message === "PRESENT_NEEDS_CHECKIN") {
      return NextResponse.json(
        { error: "Indiquez une heure d'arrivée pour le statut Présent" },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
