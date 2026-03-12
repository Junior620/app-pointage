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
    const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monday = new Date(saturday);
    const dayOfWeek = saturday.getDay();
    const daysBack = dayOfWeek === 6 ? 5 : dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(saturday.getDate() - daysBack);

    const employees = await prisma.employee.findMany({
      where: { active: true, whatsappPhone: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        whatsappPhone: true,
      },
    });

    let count = 0;
    for (const emp of employees) {
      const records = await prisma.attendanceRecord.findMany({
        where: {
          employeeId: emp.id,
          date: { gte: monday, lte: saturday },
        },
      });

      const present = records.filter((r) => r.finalStatus === "PRESENT").length;
      const absent = records.filter((r) => r.finalStatus === "ABSENT").length;
      const permission = records.filter((r) => r.finalStatus === "PERMISSION").length;
      const mission = records.filter((r) => r.finalStatus === "MISSION").length;
      const late = records.filter((r) => r.checkInStatus === "LATE").length;
      const onTime = records.filter((r) => r.checkInStatus === "ON_TIME").length;
      const autoCheckouts = records.filter((r) => r.checkOutStatus === "AUTO").length;
      const totalOT = records.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0);
      const totalMinutes = records.reduce((s, r) => s + (r.totalMinutes ?? 0), 0);

      const mondayStr = monday.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      });
      const saturdayStr = saturday.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
      });

      let msg = `📊 *Résumé de la semaine*\n`;
      msg += `${mondayStr} → ${saturdayStr}\n\n`;
      msg += `Bonjour ${emp.firstName},\n\n`;

      msg += `✅ Présent : ${present} jour(s)`;
      if (onTime > 0) msg += ` (${onTime} à l'heure)`;
      msg += `\n`;

      if (late > 0) msg += `⏰ Retards : ${late}\n`;
      if (absent > 0) msg += `❌ Absences : ${absent}\n`;
      if (permission > 0) msg += `📋 Permissions : ${permission}\n`;
      if (mission > 0) msg += `🌍 Missions : ${mission}\n`;

      if (totalMinutes > 0) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        msg += `\n⏱️ Temps total travaillé : ${h}h${m.toString().padStart(2, "0")}\n`;
      }

      if (totalOT > 0) {
        const otH = Math.floor(totalOT / 60);
        const otM = totalOT % 60;
        msg += `💪 Heures supplémentaires : ${otH}h${otM.toString().padStart(2, "0")}\n`;
      }

      if (autoCheckouts > 0) {
        msg += `\n⚠️ ${autoCheckouts} départ(s) automatique(s) — pensez à pointer votre sortie.\n`;
      }

      if (late === 0 && absent === 0) {
        msg += `\n🎉 Semaine parfaite ! Continuez comme ça.`;
      } else if (late >= 3) {
        msg += `\n⚠️ Attention : ${late} retards cette semaine. Merci d'être vigilant.`;
      }

      await sendWhatsAppMessage(emp.whatsappPhone!, msg);
      count++;
    }

    return NextResponse.json({
      success: true,
      message: `Résumé hebdomadaire envoyé à ${count} employé(s)`,
      count,
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
