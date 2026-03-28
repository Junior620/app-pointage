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
    // On calcule une "date-only" stable en UTC (champ `@db.Date`).
    const now = new Date();
    const saturday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0)
    );

    const monday = new Date(saturday);
    const dayOfWeek = saturday.getUTCDay(); // 0=dim ... 6=sam
    const daysBack = dayOfWeek === 6 ? 5 : dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setUTCDate(saturday.getUTCDate() - daysBack);

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
      const totalOT = records.reduce(
        (s, r) =>
          s +
          (["APPROVED", null].includes(r.overtimeStatus as string | null)
            ? r.overtimeMinutes ?? 0
            : 0),
        0
      );
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
      if (permission > 0) {
        msg += `📋 ${permission} jour${permission > 1 ? "s" : ""} en permission\n`;
      }
      if (mission > 0) {
        msg += `🌍 ${mission} jour${mission > 1 ? "s" : ""} en mission\n`;
      }

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
