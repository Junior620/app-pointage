import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isWorkingDay } from "@/lib/utils";

function parseDateOnlyUTC(dateStr: string): Date {
  const base = dateStr.split("T")[0];
  const [y, m, d] = base.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return new Date(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

function toDateInputValueUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatShortFR(date: Date): string {
  // date au format UTC+12:00 => pas de décalage
  return date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;

    const service = searchParams.get("service")?.trim() || undefined;
    const dateStrFromQuery = searchParams.get("date")?.trim();
    const days = Math.min(30, Math.max(1, parseInt(searchParams.get("days") || "7")));

    const now = new Date();
    const today = parseDateOnlyUTC(
      toDateInputValueUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)))
    );

    const baseDayStr = dateStrFromQuery || toDateInputValueUTC(today);
    const baseDay = parseDateOnlyUTC(baseDayStr);

    const employeeWhere: Record<string, unknown> = { active: true };
    if (service) employeeWhere.service = service;

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        matricule: true,
        firstName: true,
        lastName: true,
        service: true,
        structure: true,
      },
    });
    const employeeIds = employees.map((e) => e.id);

    const results: {
      date: string;
      label: string;
      isNonWorkingDay: boolean;
      counts: { present: number; absent: number; late: number; missionPerm: number };
    }[] = [];

    // Jours précédents: baseDay - 1 ... baseDay - days
    for (let i = 1; i <= days; i++) {
      const d = new Date(baseDay);
      d.setUTCDate(d.getUTCDate() - i);

      const isWorking = isWorkingDay(d);

      const [attendanceRecords, leaveRequests, missions] = await Promise.all([
        prisma.attendanceRecord.findMany({
          where: { date: d, employeeId: { in: employeeIds } },
          select: { employeeId: true, finalStatus: true, checkInStatus: true, checkInTime: true },
        }),
        prisma.leaveRequest.findMany({
          where: {
            employeeId: { in: employeeIds },
            status: "APPROVED",
            cancelledAt: null,
            startDate: { lte: d },
            endDate: { gte: d },
          },
          select: { employeeId: true },
        }),
        prisma.mission.findMany({
          where: {
            employeeId: { in: employeeIds },
            status: "APPROVED",
            cancelledAt: null,
            startDate: { lte: d },
            endDate: { gte: d },
          },
          select: { employeeId: true },
        }),
      ]);

      const attendanceByEmployee = new Map(attendanceRecords.map((r) => [r.employeeId, r] as const));
      const permissionSet = new Set(leaveRequests.map((l) => l.employeeId));
      const missionSet = new Set(missions.map((m) => m.employeeId));

      let present = 0;
      let absent = 0;
      let late = 0;
      let missionPerm = 0;

      for (const emp of employees) {
        const rec = attendanceByEmployee.get(emp.id);

        let finalStatus: string;
        let isLate = false;

        if (rec) {
          finalStatus = rec.finalStatus;
          isLate = rec.checkInStatus === "LATE";
          if (!isWorking && rec.finalStatus === "ABSENT" && !rec.checkInTime) {
            finalStatus = "NON_WORKING";
          }
        } else if (missionSet.has(emp.id)) {
          finalStatus = "MISSION";
        } else if (permissionSet.has(emp.id)) {
          finalStatus = "PERMISSION";
        } else if (isWorking) {
          finalStatus = "ABSENT";
        } else {
          finalStatus = "NON_WORKING";
        }

        if (isLate) late++;

        if (finalStatus === "PRESENT") present++;
        else if (finalStatus === "ABSENT") absent++;
        else if (finalStatus === "MISSION" || finalStatus === "PERMISSION") missionPerm++;
      }

      const date = toDateInputValueUTC(d);
      results.push({
        date,
        label: formatShortFR(d),
        isNonWorkingDay: !isWorking,
        counts: { present, absent, late, missionPerm },
      });
    }

    return NextResponse.json({ data: results });
  } catch (error) {
    console.error("[API attendance history]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

