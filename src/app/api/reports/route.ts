import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;

    const startDate = searchParams.get("dateFrom") || searchParams.get("startDate");
    const endDate = searchParams.get("dateTo") || searchParams.get("endDate");
    const service = searchParams.get("service");
    const search = searchParams.get("search");

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "dateFrom et dateTo sont requis" }, { status: 400 });
    }

    const dateFilter = {
      date: { gte: new Date(startDate), lte: new Date(endDate) },
    };

    const employeeWhere: Record<string, unknown> = { active: true };
    if (service) employeeWhere.service = service;
    if (search) {
      employeeWhere.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { matricule: { contains: search, mode: "insensitive" } },
      ];
    }

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      include: {
        attendances: { where: dateFilter },
        fraudAttempts: {
          where: { timestamp: { gte: new Date(startDate), lte: new Date(endDate) } },
        },
      },
    });

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalOnTime = 0;
    let totalPermission = 0;
    let totalMission = 0;
    let totalMinutes = 0;
    let totalOvertime = 0;

    const dayMap = new Map<string, { present: number; absent: number; late: number; total: number }>();
    const serviceMap = new Map<string, { present: number; absent: number; late: number; totalMinutes: number }>();

    const byEmployee: Array<{
      id: string;
      matricule: string;
      name: string;
      service: string;
      presents: number;
      absents: number;
      retards: number;
      missions: number;
      permissions: number;
      totalHours: number;
      totalDays: number;
      punctualityRate: number;
    }> = [];

    for (const emp of employees) {
      let empPresent = 0;
      let empAbsent = 0;
      let empLate = 0;
      let empOnTime = 0;
      let empPermission = 0;
      let empMission = 0;
      let empMinutes = 0;
      let empOvertime = 0;

      for (const att of emp.attendances) {
        const dayKey = att.date.toISOString().slice(0, 10);
        const day = dayMap.get(dayKey) || { present: 0, absent: 0, late: 0, total: 0 };
        day.total++;

        switch (att.finalStatus) {
          case "PRESENT": empPresent++; day.present++; break;
          case "ABSENT": empAbsent++; day.absent++; break;
          case "PERMISSION": empPermission++; day.present++; break;
          case "MISSION": empMission++; day.present++; break;
        }
        if (att.checkInStatus === "LATE") { empLate++; day.late++; }
        if (att.checkInStatus === "ON_TIME") empOnTime++;
        if (att.totalMinutes) empMinutes += att.totalMinutes;
        if (att.overtimeMinutes) empOvertime += att.overtimeMinutes;

        dayMap.set(dayKey, day);
      }

      totalPresent += empPresent;
      totalAbsent += empAbsent;
      totalLate += empLate;
      totalOnTime += empOnTime;
      totalPermission += empPermission;
      totalMission += empMission;
      totalMinutes += empMinutes;
      totalOvertime += empOvertime;

      const empTotal = empPresent + empAbsent + empPermission + empMission;
      const empPunctuality = empOnTime + empLate > 0
        ? Math.round((empOnTime / (empOnTime + empLate)) * 100)
        : 100;

      byEmployee.push({
        id: emp.id,
        matricule: emp.matricule,
        name: `${emp.lastName} ${emp.firstName}`,
        service: emp.service,
        presents: empPresent + empPermission + empMission,
        absents: empAbsent,
        retards: empLate,
        missions: empMission,
        permissions: empPermission,
        totalHours: Math.round((empMinutes / 60) * 10) / 10,
        totalDays: empTotal,
        punctualityRate: empPunctuality,
      });

      const svc = serviceMap.get(emp.service) || { present: 0, absent: 0, late: 0, totalMinutes: 0 };
      svc.present += empPresent + empPermission + empMission;
      svc.absent += empAbsent;
      svc.late += empLate;
      svc.totalMinutes += empMinutes;
      serviceMap.set(emp.service, svc);
    }

    const totalRecords = totalPresent + totalAbsent + totalPermission + totalMission;
    const presenceRate = totalRecords > 0
      ? Math.round(((totalPresent + totalPermission + totalMission) / totalRecords) * 100)
      : 0;
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

    const dayNames: Record<number, string> = { 0: "Dim", 1: "Lun", 2: "Mar", 3: "Mer", 4: "Jeu", 5: "Ven", 6: "Sam" };
    const byDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => {
        const d = new Date(date);
        const presenceRate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
        return {
          date,
          dayName: dayNames[d.getDay()] || "",
          label: `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`,
          presenceRate,
          absences: stats.absent,
          retards: stats.late,
          total: stats.total,
        };
      });

    const byService = Array.from(serviceMap.entries()).map(([svc, stats]) => ({
      service: svc,
      presents: stats.present,
      absences: stats.absent,
      retards: stats.late,
      heures: Math.round((stats.totalMinutes / 60) * 10) / 10,
    }));

    const topPresents = [...byEmployee]
      .sort((a, b) => b.presents - a.presents)
      .slice(0, 5);

    const topRetards = [...byEmployee]
      .filter((e) => e.retards > 0)
      .sort((a, b) => b.retards - a.retards)
      .slice(0, 5);

    const services = await prisma.employee.findMany({
      where: { active: true },
      select: { service: true },
      distinct: ["service"],
    });

    return NextResponse.json({
      summary: {
        totalEmployees: employees.length,
        presenceRate,
        totalRetards: totalLate,
        totalAbsences: totalAbsent,
        totalHours,
        avgPunctuality: totalOnTime + totalLate > 0
          ? Math.round((totalOnTime / (totalOnTime + totalLate)) * 100)
          : 0,
      },
      data: byEmployee,
      charts: { byDay, byService },
      rankings: { topPresents, topRetards },
      services: services.map((s) => s.service).filter(Boolean),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
