import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { parseDateInputForDbDate } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;
    const service = searchParams.get("service")?.trim() || undefined;
    const overExpected = searchParams.get("overExpected") === "1";
    const dateStr = searchParams.get("date")?.trim();
    const date = dateStr ? parseDateInputForDbDate(dateStr) : parseDateInputForDbDate(new Date().toISOString().slice(0, 10));

    const employeeWhere: Record<string, unknown> = { active: true };
    if (service) employeeWhere.service = service;

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true, service: true },
    });
    const employeeIds = employees.map((e) => e.id);

    const [rows, services] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: {
          date,
          employeeId: { in: employeeIds },
          breakStartTime: { not: null },
          ...(overExpected ? { breakMinutes: { gt: 60 } } : {}),
        },
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
        orderBy: { breakStartTime: "desc" },
      }),
      prisma.employee.findMany({
        where: { active: true },
        select: { service: true },
        distinct: ["service"],
        orderBy: { service: "asc" },
      }),
    ]);

    const data = rows.map((r) => {
      const onBreak = Boolean(r.breakStartTime && !r.breakEndTime && !r.checkOutTime);
      const missingReturn = Boolean(r.breakStartTime && !r.breakEndTime && r.checkOutTime);
      return {
        id: r.id,
        employee: r.employee,
        breakStartTime: r.breakStartTime,
        breakEndTime: r.breakEndTime,
        breakMinutes: r.breakMinutes ?? 0,
        checkInTime: r.checkInTime,
        checkOutTime: r.checkOutTime,
        onBreak,
        missingReturn,
      };
    });

    const stats = {
      totalBreaks: data.length,
      onBreak: data.filter((r) => r.onBreak).length,
      completed: data.filter((r) => r.breakEndTime).length,
      missingReturn: data.filter((r) => r.missingReturn).length,
      avgMinutes: data.length > 0 ? Math.round(data.reduce((s, r) => s + r.breakMinutes, 0) / data.length) : 0,
    };

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      data,
      stats,
      services: services.map((s) => s.service).filter(Boolean),
    });
  } catch (error) {
    console.error("[API breaks GET]", error);
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
