import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { parseDateInputForDbDate } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;

    const status = searchParams.get("status"); // PENDING | APPROVED | REJECTED
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const employeeId = searchParams.get("employeeId");
    const structure = searchParams.get("structure");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      overtimeMinutes: { gt: 0 },
    };

    if (status) where.overtimeStatus = status;
    if (employeeId) where.employeeId = employeeId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Record<string, Date>).gte = parseDateInputForDbDate(dateFrom);
      if (dateTo) (where.date as Record<string, Date>).lte = parseDateInputForDbDate(dateTo);
    }
    if (structure) where.employee = { structure };

    const [records, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      db.attendanceRecord.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              matricule: true,
              service: true,
              structure: true,
            },
          },
        },
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      db.attendanceRecord.count({ where }),
      db.attendanceRecord.count({
        where: { ...where, overtimeStatus: "PENDING" },
      }),
      db.attendanceRecord.count({
        where: { ...where, overtimeStatus: "APPROVED" },
      }),
      db.attendanceRecord.count({
        where: { ...where, overtimeStatus: "REJECTED" },
      }),
    ]);

    return NextResponse.json({
      data: records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié")
        return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit")
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
