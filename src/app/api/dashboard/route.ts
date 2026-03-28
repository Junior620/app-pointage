import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { Structure } from "@prisma/client";
import { isWorkingDay } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;
    const structureParam = searchParams.get("structure")?.trim() || undefined;

    // `attendance_records.date` est un champ `@db.Date` : on évite le décalage de fuseau
    // en construisant une "date-only" stable à midi UTC.
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const isWorkingDayUTC = (d: Date) => {
      const day = d.getUTCDay(); // 0=dim ... 6=sam
      return day >= 1 && day <= 5;
    };

    const employeeWhere = {
      active: true,
      ...(structureParam && { structure: structureParam as Structure }),
    };

    const allEmployees = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true, structure: true },
    });
    const employeeIds = allEmployees.map((e) => e.id);

    const todayRecords = await prisma.attendanceRecord.findMany({
      where: {
        date: today,
        employeeId: { in: employeeIds },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, matricule: true, service: true, structure: true } },
      },
    });

    const isTodayWorking = isWorkingDayUTC(today);
    const presentToday = todayRecords.filter((r) => r.finalStatus === "PRESENT" || r.finalStatus === "PERMISSION" || r.finalStatus === "MISSION").length;
    const absentToday = isTodayWorking
      ? allEmployees.length - todayRecords.length + todayRecords.filter((r) => r.finalStatus === "ABSENT").length
      : 0;
    const lateToday = todayRecords.filter((r) => r.checkInStatus === "LATE").length;
    const missionToday = todayRecords.filter((r) => r.finalStatus === "MISSION").length;
    const permissionToday = todayRecords.filter((r) => r.finalStatus === "PERMISSION").length;

    // Missions et permissions « en cours » : période inclut aujourd'hui, statut approuvé
    const [missionOngoingCount, permissionOngoingCount] = await Promise.all([
      prisma.mission.count({
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      prisma.leaveRequest.count({
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
    ]);

    const byStructure: Record<string, { total: number; present: number; absent: number; late: number }> = {};
    for (const struct of ["SCPB", "AFREXIA"] as const) {
      const structEmployees = allEmployees.filter((e) => e.structure === struct);
      const structIds = new Set(structEmployees.map((e) => e.id));
      const structRecords = todayRecords.filter((r) => structIds.has(r.employeeId));
      const structPresent = structRecords.filter((r) => r.finalStatus !== "ABSENT").length;
      byStructure[struct] = {
        total: structEmployees.length,
        present: structPresent,
        absent: isTodayWorking ? structEmployees.length - structPresent : 0,
        late: structRecords.filter((r) => r.checkInStatus === "LATE").length,
      };
    }

    const last30Records = await prisma.attendanceRecord.findMany({
      where: {
        date: { gte: thirtyDaysAgo },
        employeeId: { in: employeeIds },
      },
      select: { date: true, finalStatus: true, checkInStatus: true, overtimeMinutes: true },
    });

    const dayNames: Record<number, string> = { 0: "Dim", 1: "Lun", 2: "Mar", 3: "Mer", 4: "Jeu", 5: "Ven", 6: "Sam" };
    const trendMap = new Map<string, { present: number; absent: number; late: number; total: number }>();
    for (const rec of last30Records) {
      const key = rec.date.toISOString().slice(0, 10);
      const entry = trendMap.get(key) || { present: 0, absent: 0, late: 0, total: 0 };
      entry.total++;
      if (rec.finalStatus === "ABSENT") entry.absent++;
      else entry.present++;
      if (rec.checkInStatus === "LATE") entry.late++;
      trendMap.set(key, entry);
    }

    const trend30 = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => {
        const d = new Date(Date.UTC(parseInt(date.slice(0, 4), 10), parseInt(date.slice(5, 7), 10) - 1, parseInt(date.slice(8, 10), 10), 12, 0, 0, 0));
        return {
          date,
          label: `${dayNames[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
          present: stats.present,
          absent: stats.absent,
          late: stats.late,
          presenceRate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
        };
      });

    const parseDateOnlyUTC = (dateStr: string): Date => {
      const y = parseInt(dateStr.slice(0, 4), 10);
      const m = parseInt(dateStr.slice(5, 7), 10);
      const day = parseInt(dateStr.slice(8, 10), 10);
      return new Date(Date.UTC(y, m - 1, day, 12, 0, 0, 0));
    };

    const last7 = trend30.filter((d) => parseDateOnlyUTC(d.date) >= sevenDaysAgo);

    const topLate = await prisma.attendanceRecord.groupBy({
      by: ["employeeId"],
      where: {
        date: { gte: thirtyDaysAgo },
        checkInStatus: "LATE",
        employeeId: { in: employeeIds },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    const topAbsent = await prisma.attendanceRecord.groupBy({
      by: ["employeeId"],
      where: {
        date: { gte: thirtyDaysAgo },
        finalStatus: "ABSENT",
        employeeId: { in: employeeIds },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    const alertEmployeeIds = [...new Set([...topLate.map((t) => t.employeeId), ...topAbsent.map((t) => t.employeeId)])];
    const alertEmployees = alertEmployeeIds.length > 0
      ? await prisma.employee.findMany({
          where: { id: { in: alertEmployeeIds } },
          select: { id: true, firstName: true, lastName: true, matricule: true, service: true, structure: true },
        })
      : [];
    const empMap = new Map(alertEmployees.map((e) => [e.id, e]));

    const topLateWithNames = topLate.map((t) => ({
      ...empMap.get(t.employeeId),
      count: t._count.id,
    }));

    const topAbsentWithNames = topAbsent.map((t) => ({
      ...empMap.get(t.employeeId),
      count: t._count.id,
    }));

    const recentCheckIns = todayRecords
      .filter((r) => r.checkInTime)
      .sort((a, b) => (b.checkInTime?.getTime() ?? 0) - (a.checkInTime?.getTime() ?? 0))
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        employee: r.employee,
        checkInTime: r.checkInTime,
        checkInStatus: r.checkInStatus,
        checkOutTime: r.checkOutTime,
        finalStatus: r.finalStatus,
      }));

    return NextResponse.json({
      today: {
        totalEmployees: allEmployees.length,
        present: presentToday,
        absent: absentToday,
        late: lateToday,
        mission: missionToday,
        permission: permissionToday,
        missionOngoing: missionOngoingCount,
        permissionOngoing: permissionOngoingCount,
        isNonWorkingDay: !isTodayWorking,
      },
      byStructure,
      trend30,
      trend7: last7,
      alerts: {
        topLate: topLateWithNames,
        topAbsent: topAbsentWithNames,
      },
      recentCheckIns,
    });
  } catch (error) {
    console.error("[API dashboard]", error);
    if (error instanceof Error) {
      if (error.message === "Non authentifié")
        return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit")
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
