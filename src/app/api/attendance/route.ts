import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { parseDateInputForDbDate } from "@/lib/utils";

const correctionSchema = z.object({
  id: z.string().min(1),
  checkInTime: z.string().datetime().optional(),
  checkOutTime: z.string().datetime().optional(),
  checkInStatus: z.enum(["ON_TIME", "LATE"]).optional(),
  checkOutStatus: z.enum(["MANUAL", "AUTO"]).optional(),
  finalStatus: z.enum(["PRESENT", "ABSENT", "PERMISSION", "MISSION"]).optional(),
  comment: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
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
      prisma.attendanceRecord.findMany({
        where,
        include: { employee: true },
        skip,
        take: limit,
        orderBy: { date: "desc" },
      }),
      prisma.attendanceRecord.count({ where }),
      prisma.employee.findMany({
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
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const body = await request.json();

    const parsed = correctionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, ...updates } = parsed.data;

    const before = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Enregistrement non trouvé" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (updates.checkInTime) data.checkInTime = new Date(updates.checkInTime);
    if (updates.checkOutTime) data.checkOutTime = new Date(updates.checkOutTime);
    if (updates.checkInStatus) data.checkInStatus = updates.checkInStatus;
    if (updates.checkOutStatus) data.checkOutStatus = updates.checkOutStatus;
    if (updates.finalStatus) data.finalStatus = updates.finalStatus;
    if (updates.comment) data.checkInComment = updates.comment;

    const record = await prisma.attendanceRecord.update({
      where: { id },
      data,
      include: { employee: true },
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
    console.error("[API attendance PUT]", error);
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
