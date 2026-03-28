import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { isWorkingDay, utcCalendarDayBounds } from "@/lib/utils";

function toDateInputValueUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateOnlyUTC(dateStr: string): Date {
  const base = dateStr.split("T")[0];
  const [y, m, d] = base.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return new Date(dateStr);
  // Date-only: on évite les décalages en fixant l'heure à 12:00 UTC.
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;

    const service = searchParams.get("service")?.trim() || undefined;
    const dateStrFromQuery = searchParams.get("date")?.trim();

    const now = new Date();
    const todayStr = toDateInputValueUTC(
      new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0))
    );
    const dateStr = dateStrFromQuery || todayStr;
    const day = parseDateOnlyUTC(dateStr);
    const { dayStart, dayEnd } = utcCalendarDayBounds(day);
    const isTodayWorking = isWorkingDay(day);

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
        active: true,
      },
    });

    const employeeIds = employees.map((e) => e.id);

    const [attendanceRecords, leaveRequests, missions] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { date: day, employeeId: { in: employeeIds } },
        select: {
          employeeId: true,
          finalStatus: true,
          checkInStatus: true,
          checkInTime: true,
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          cancelledAt: null,
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart },
        },
        select: { employeeId: true },
      }),
      prisma.mission.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: "APPROVED",
          cancelledAt: null,
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart },
        },
        select: { employeeId: true },
      }),
    ]);

    const attendanceByEmployee = new Map(
      attendanceRecords.map((r) => [r.employeeId, r] as const)
    );

    const permissionSet = new Set(leaveRequests.map((l) => l.employeeId));
    const missionSet = new Set(missions.map((m) => m.employeeId));

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let missionPermCount = 0;
    const absents: {
      id: string;
      matricule: string;
      firstName: string;
      lastName: string;
      service: string;
      structure: string;
    }[] = [];

    for (const emp of employees) {
      const rec = attendanceByEmployee.get(emp.id);

      let finalStatus: string;
      let late = false;

      if (rec) {
        finalStatus = rec.finalStatus;
        late = rec.checkInStatus === "LATE";

        // Sur jours non ouvrés, on ne compte pas les ABSENTS comme “absences”.
        if (!isTodayWorking && rec.finalStatus === "ABSENT" && !rec.checkInTime) {
          finalStatus = "NON_WORKING";
        }
      } else if (missionSet.has(emp.id)) {
        finalStatus = "MISSION";
      } else if (permissionSet.has(emp.id)) {
        finalStatus = "PERMISSION";
      } else if (isTodayWorking) {
        finalStatus = "ABSENT";
      } else {
        finalStatus = "NON_WORKING";
      }

      if (late) lateCount++;

      switch (finalStatus) {
        case "PRESENT":
          presentCount++;
          break;
        case "ABSENT":
          absentCount++;
          absents.push({
            id: emp.id,
            matricule: emp.matricule,
            firstName: emp.firstName,
            lastName: emp.lastName,
            service: emp.service,
            structure: emp.structure,
          });
          break;
        case "MISSION":
        case "PERMISSION":
          missionPermCount++;
          break;
      }
    }

    const payload = {
      date: dateStr,
      isNonWorkingDay: !isTodayWorking,
      counts: {
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        missionPerm: missionPermCount,
      },
      absents,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("[API attendance day]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

