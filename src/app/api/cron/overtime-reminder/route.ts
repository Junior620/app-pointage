import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ORG_SLUG, forEachOrg, sum } from "@/lib/tenant";
import { notifyRhAdminsWhatsApp } from "@/lib/rh-whatsapp-notify";
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

    const count = sum(
      await forEachOrg(async ({ org, db }) => {
        const pending = await db.attendanceRecord.findMany({
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

        if (pending.length === 0) return 0;

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

        // Groupe : numéro RH historique (WHATSAPP_HR_PHONE). Autres entreprises : leurs comptes RH / Admin / DG.
        const hrPhone = process.env.WHATSAPP_HR_PHONE;
        if (org.slug !== DEFAULT_ORG_SLUG) {
          await notifyRhAdminsWhatsApp(org, msg);
        } else if (hrPhone) {
          await sendWhatsAppMessage(hrPhone, msg);
        } else {
          console.warn("[overtime-reminder] Heures sup en attente, mais WHATSAPP_HR_PHONE n'est pas configuré.");
        }
        return pending.length;
      })
    );

    return NextResponse.json({
      success: true,
      message: count > 0 ? "Rappel envoyé aux RH pour les heures sup en attente." : "Aucune heure supplémentaire en attente de plus de 48h.",
      count,
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

