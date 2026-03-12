import { NextRequest, NextResponse } from "next/server";
import { runAutoCheckout } from "@/lib/attendance-engine";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Douala";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runAutoCheckout();

    let notified = 0;
    for (const r of results) {
      if (!r.whatsappPhone) continue;

      const inTime = r.checkInTime.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIMEZONE,
      });
      const outTime = r.checkOutTime.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: APP_TIMEZONE,
      });

      await sendWhatsAppMessage(
        r.whatsappPhone,
        `📌 *Départ automatique enregistré*\n\n` +
          `Bonjour ${r.firstName}, vous n'avez pas pointé votre départ aujourd'hui.\n\n` +
          `✅ Arrivée : ${inTime}\n` +
          `🔒 Départ enregistré : ${outTime} (automatique)\n\n` +
          `⚠️ Pensez à pointer votre sortie chaque jour pour un suivi précis de vos heures.`
      );
      notified++;
    }

    return NextResponse.json({
      success: true,
      message: `Auto-checkout : ${results.length} employé(s), ${notified} notifié(s)`,
      count: results.length,
      notified,
    });
  } catch (error) {
    console.error("Auto-checkout error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'auto-checkout" },
      { status: 500 }
    );
  }
}

export const POST = GET;
