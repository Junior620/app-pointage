import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { parseDateInputForDbDate } from "@/lib/utils";
import {
  applyAttendanceCorrection,
  buildAttendanceCorrectionData,
} from "@/lib/attendance-correction";
import {
  correctionCreateSchema,
  correctionPutSchema,
} from "@/lib/attendance-correction-schema";

export async function GET(request: NextRequest) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const employeeId = searchParams.get("employeeId");
    const service = searchParams.get("service");
    const finalStatus = searchParams.get("finalStatus");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as Record<string, unknown>).gte = parseDateInputForDbDate(startDate);
      if (endDate) (where.date as Record<string, unknown>).lte = parseDateInputForDbDate(endDate);
    }
    if (employeeId) where.employeeId = employeeId;
    if (finalStatus) where.finalStatus = finalStatus;

    const employeeFilters: Record<string, unknown>[] = [];
    if (service) employeeFilters.push({ service });
    if (search) {
      employeeFilters.push({
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { matricule: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (employeeFilters.length > 0) {
      where.employee =
        employeeFilters.length === 1
          ? employeeFilters[0]
          : { AND: employeeFilters };
    }

    const [records, total, services] = await Promise.all([
      db.attendanceRecord.findMany({
        where,
        include: { employee: true },
        skip,
        take: limit,
        orderBy: { date: "desc" },
      }),
      db.attendanceRecord.count({ where }),
      db.employee.findMany({
        select: { service: true },
        distinct: ["service"],
        orderBy: { service: "asc" },
      }),
    ]);

    const servicesList = services.map((s) => s.service).filter(Boolean);

    return NextResponse.json({
      data: records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      services: servicesList,
    });
  } catch (error) {
    console.error("[API attendance GET]", error);
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { session, db, scope } = await requireTenant(["HR", "ADMIN"]);
    const body = await request.json();

    const parsed = correctionPutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, ...updates } = parsed.data;

    const before = await db.attendanceRecord.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Enregistrement non trouvé" }, { status: 404 });
    }

    const record = await applyAttendanceCorrection({
      db,
      record: before,
      updates,
      actorId: session.id,
    });

    await createAuditLog(scope, {
      actorId: session.id,
      action: "CORRECTION",
      entity: "AttendanceRecord",
      entityId: id,
      before,
      after: record,
    });

    return NextResponse.json({ data: record });
  } catch (error) {
    console.error("[API attendance PUT]", error);
    if (error instanceof Error && error.message === "PRESENT_NEEDS_CHECKIN") {
      return NextResponse.json(
        { error: "Indiquez une heure d'arrivée pour le statut Présent" },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, db, scope } = await requireTenant(["HR", "ADMIN"]);
    const body = await request.json();
    const parsed = correctionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { employeeId, date: dateStr, ...updates } = parsed.data;
    const date = parseDateInputForDbDate(dateStr);

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    const existing = await db.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date } },
    });

    if (existing) {
      const record = await applyAttendanceCorrection({
        db,
        record: existing,
        updates,
        actorId: session.id,
      });
      await createAuditLog(scope, {
        actorId: session.id,
        action: "CORRECTION",
        entity: "AttendanceRecord",
        entityId: existing.id,
        before: existing,
        after: record,
      });
      return NextResponse.json({ data: record });
    }

    const stub = await db.attendanceRecord.create({
      data: {
        organizationId: session.organizationId,
        employeeId,
        date,
        finalStatus: updates.finalStatus ?? "PRESENT",
      },
    });

    try {
      const data = await buildAttendanceCorrectionData(db, stub, updates, session.id);
      const record = await db.attendanceRecord.update({
        where: { id: stub.id },
        data,
        include: { employee: true },
      });
      await createAuditLog(scope, {
        actorId: session.id,
        action: "CORRECTION",
        entity: "AttendanceRecord",
        entityId: stub.id,
        before: null,
        after: record,
      });
      return NextResponse.json({ data: record }, { status: 201 });
    } catch (e) {
      await db.attendanceRecord.delete({ where: { id: stub.id } }).catch(() => {});
      throw e;
    }
  } catch (error) {
    console.error("[API attendance POST]", error);
    if (error instanceof Error && error.message === "PRESENT_NEEDS_CHECKIN") {
      return NextResponse.json(
        { error: "Indiquez une heure d'arrivée pour le statut Présent" },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
