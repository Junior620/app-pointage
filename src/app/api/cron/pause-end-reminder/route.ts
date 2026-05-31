import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendWhatsAppToEmployee, getEmployeeWhatsappPhones } from "@/lib/employee-whatsapp";
import { todayDate, isWeekend } from "@/lib/utils";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = todayDate();
  if (isWeekend(today)) {
    return NextResponse.json({ success: true, message: "Week-end — pas de rappel pause", count: 0 });
  }

  const holiday = await prisma.holiday.findFirst({
    where: { date: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
  });
  if (holiday) {
    return NextResponse.json({ success: true, message: "Jour férié — pas de rappel pause", count: 0 });
  }

  const records = await prisma.attendanceRecord.findMany({
    where: {
      date: today,
      checkInTime: { not: null },
      checkOutTime: null,
    },
    include: {
      employee: { select: { firstName: true, whatsappPhone: true, active: true } },
    },
  });

  let count = 0;
  for (const record of records) {
    if (!record.employee.active) continue;
    const phones = await getEmployeeWhatsappPhones(record.employeeId);
    if (phones.length === 0) continue;
    await sendWhatsAppToEmployee(record.employeeId,
      `🔔 *Fin de pause (13h30)*\n\nBonjour ${record.employee.firstName}, la pause est terminée.\n\nTapez *retour pause* ou *14* pour pointer votre reprise.`
    );
    count++;
  }

  return NextResponse.json({ success: true, message: `Rappel fin de pause envoyé à ${count} employé(s)`, count });
}

export const POST = GET;
