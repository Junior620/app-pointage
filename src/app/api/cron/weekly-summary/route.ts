import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import {
  buildWeeklySummaryWhatsAppMessage,
  getCurrentWeekRangeUtc,
} from "@/lib/weekly-summary-text";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const { monday, saturday } = getCurrentWeekRangeUtc(now);

    const employees = await prisma.employee.findMany({
      where: { active: true, whatsappPhone: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        whatsappPhone: true,
      },
    });

    console.log("[Weekly summary] run", {
      monday: monday.toISOString().slice(0, 10),
      saturday: saturday.toISOString().slice(0, 10),
      employees: employees.length,
    });

    let count = 0;
    let failed = 0;
    for (const emp of employees) {
      const [records, pendingLeaveRequests] = await Promise.all([
        prisma.attendanceRecord.findMany({
          where: {
            employeeId: emp.id,
            date: { gte: monday, lte: saturday },
          },
        }),
        prisma.leaveRequest.count({
          where: { employeeId: emp.id, status: "PENDING", cancelledAt: null },
        }),
      ]);

      const msg = buildWeeklySummaryWhatsAppMessage(
        emp.firstName,
        monday,
        saturday,
        records,
        { pendingLeaveRequests }
      );

      try {
        await sendWhatsAppMessage(emp.whatsappPhone!, msg);
        count++;
      } catch (e) {
        failed++;
        console.error("[Weekly summary] Envoi échoué pour", {
          phone: emp.whatsappPhone,
          employeeId: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          error: e,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Résumé hebdomadaire envoyé à ${count} employé(s)`,
      count,
      failed,
    });
  } catch (error) {
    console.error("Weekly summary error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des résumés" },
      { status: 500 }
    );
  }
}

export const POST = GET;
