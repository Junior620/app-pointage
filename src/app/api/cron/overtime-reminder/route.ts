import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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
    const threshold = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48h

    const pending = await prisma.attendanceRecord.findMany({
      where: {
        overtimeMinutes: { gt: 0 },
        overtimeStatus: "PENDING",
        createdAt: { lt: threshold },
      },
      include: {
        employee: true,
      },
      orderBy: { date: "asc" },
    });

    if (pending.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Aucune heure supplémentaire en attente de plus de 48h.",
        count: 0,
      });
    }

    const hrPhone = process.env.WHATSAPP_HR_PHONE;
    if (!hrPhone) {
      return NextResponse.json({
        success: true,
        message:
          "Heures supplémentaires en attente détectées mais aucun numéro RH (WHATSAPP_HR_PHONE) n'est configuré.",
        count: pending.length,
      });
    }

    let msg = "⏰ *Rappel validation heures supplémentaires*\n\n";
    msg += `(${pending.length} en attente depuis plus de 48h)\n\n`;

    for (const r of pending.slice(0, 20)) {
      const dateStr = r.date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const ot = r.overtimeMinutes ?? 0;
      const h = Math.floor(ot / 60);
      const m = ot % 60;
      msg += `• ${r.employee.lastName} ${r.employee.firstName} (${r.employee.matricule}) — ${dateStr} : ${h}h${m
        .toString()
        .padStart(2, "0")}\n`;
    }

    if (pending.length > 20) {
      msg += `\n… et ${pending.length - 20} autres enregistrements.`;
    }

    await sendWhatsAppMessage(hrPhone, msg);

    return NextResponse.json({
      success: true,
      message: "Rappel envoyé aux RH pour les heures sup en attente.",
      count: pending.length,
    });
  } catch (error) {
    console.error("Overtime reminder error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des rappels d'heures supplémentaires" },
      { status: 500 }
    );
  }
}

export const POST = GET;

