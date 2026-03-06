import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const totalEmployees = await prisma.employee.count({ where: { active: true } });

    const todayRecords = await prisma.attendanceRecord.findMany({
      where: { date: todayStart },
      include: { employee: { select: { id: true, firstName: true, lastName: true, service: true } } },
    });

    const todaySummary = {
      present: 0,
      absent: 0,
      late: 0,
      onTime: 0,
      permission: 0,
      mission: 0,
      total: totalEmployees,
    };

    for (const r of todayRecords) {
      switch (r.finalStatus) {
        case "PRESENT": todaySummary.present++; break;
        case "ABSENT": todaySummary.absent++; break;
        case "PERMISSION": todaySummary.permission++; break;
        case "MISSION": todaySummary.mission++; break;
      }
      if (r.checkInStatus === "LATE") todaySummary.late++;
      if (r.checkInStatus === "ON_TIME") todaySummary.onTime++;
    }

    const recentFraud = await prisma.fraudAttempt.findMany({
      take: 5,
      orderBy: { timestamp: "desc" },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, matricule: true } },
      },
    });

    const last30Records = await prisma.attendanceRecord.findMany({
      where: { date: { gte: thirtyDaysAgo, lte: todayStart } },
      select: { date: true, checkInStatus: true },
    });

    const trendMap = new Map<string, { onTime: number; late: number }>();
    for (const r of last30Records) {
      const key = r.date.toISOString().slice(0, 10);
      const entry = trendMap.get(key) || { onTime: 0, late: 0 };
      if (r.checkInStatus === "ON_TIME") entry.onTime++;
      if (r.checkInStatus === "LATE") entry.late++;
      trendMap.set(key, entry);
    }

    const punctualityTrend = Array.from(trendMap.entries())
      .map(([date, { onTime, late }]) => ({
        date,
        rate: onTime + late > 0 ? Math.round((onTime / (onTime + late)) * 10000) / 100 : 0,
        onTime,
        late,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const monthRecords = await prisma.attendanceRecord.findMany({
      where: { date: { gte: monthStart, lte: todayStart } },
      select: { employeeId: true, checkInStatus: true, finalStatus: true },
    });

    const lateCountMap = new Map<string, number>();
    const presentCountMap = new Map<string, number>();

    for (const r of monthRecords) {
      if (r.checkInStatus === "LATE") {
        lateCountMap.set(r.employeeId, (lateCountMap.get(r.employeeId) || 0) + 1);
      }
      if (r.finalStatus === "PRESENT") {
        presentCountMap.set(r.employeeId, (presentCountMap.get(r.employeeId) || 0) + 1);
      }
    }

    const topLateIds = Array.from(lateCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const topPresentIds = Array.from(presentCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    const [topLateEmployees, topPresentEmployees] = await Promise.all([
      prisma.employee.findMany({
        where: { id: { in: topLateIds } },
        select: { id: true, firstName: true, lastName: true, service: true, matricule: true },
      }),
      prisma.employee.findMany({
        where: { id: { in: topPresentIds } },
        select: { id: true, firstName: true, lastName: true, service: true, matricule: true },
      }),
    ]);

    const topLate = topLateIds.map((id) => {
      const emp = topLateEmployees.find((e) => e.id === id);
      return { employee: emp, lateDays: lateCountMap.get(id) || 0 };
    });

    const topPresent = topPresentIds.map((id) => {
      const emp = topPresentEmployees.find((e) => e.id === id);
      return { employee: emp, presentDays: presentCountMap.get(id) || 0 };
    });

    const serviceStatsMap = new Map<string, {
      present: number; absent: number; late: number; onTime: number; permission: number; mission: number;
    }>();

    for (const r of todayRecords) {
      const svc = r.employee.service;
      const entry = serviceStatsMap.get(svc) || {
        present: 0, absent: 0, late: 0, onTime: 0, permission: 0, mission: 0,
      };
      switch (r.finalStatus) {
        case "PRESENT": entry.present++; break;
        case "ABSENT": entry.absent++; break;
        case "PERMISSION": entry.permission++; break;
        case "MISSION": entry.mission++; break;
      }
      if (r.checkInStatus === "ON_TIME") entry.onTime++;
      if (r.checkInStatus === "LATE") entry.late++;
      serviceStatsMap.set(svc, entry);
    }

    const byService = Array.from(serviceStatsMap.entries()).map(([service, stats]) => ({
      service,
      ...stats,
    }));

    return NextResponse.json({
      data: {
        todaySummary,
        recentFraud,
        punctualityTrend,
        topLate,
        topPresent,
        byService,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
