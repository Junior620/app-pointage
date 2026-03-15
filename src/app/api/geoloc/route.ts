import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { processCheckIn, processCheckOut } from "@/lib/attendance-engine";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const geolocSchema = z.object({
  phone: z.string().min(1, "Le numéro de téléphone est requis"),
  lat: z.number(),
  lng: z.number(),
  action: z.enum(["CHECK_IN", "CHECK_OUT"]),
  comment: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = geolocSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { phone, lat, lng, action, comment } = parsed.data;
    const digitsOnly = phone.replace(/\D/g, "");

    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { whatsappPhone: phone },
          { whatsappPhone: digitsOnly },
          { whatsappPhone: `+${digitsOnly}` },
        ],
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé avec ce numéro" }, { status: 404 });
    }

    if (!employee.active) {
      return NextResponse.json({ error: "Ce compte employé est désactivé" }, { status: 403 });
    }

    const point = { lat, lng };

    const result =
      action === "CHECK_IN"
        ? await processCheckIn(employee.id, point, comment)
        : await processCheckOut(employee.id, point, comment);

    if (result.message) {
      const toPhone = employee.whatsappPhone || phone;
      // On envoie toujours un récap sur WhatsApp (succès ou erreur)
      await sendWhatsAppMessage(toPhone, result.message);
    }

    // Notification RH / manager quand des heures sup sont générées
    if (result.success && (result.overtimeMinutes ?? 0) > 0) {
      const hrPhone = process.env.WHATSAPP_HR_PHONE;
      if (hrPhone) {
        const ot = result.overtimeMinutes ?? 0;
        const h = Math.floor(ot / 60);
        const m = ot % 60;
        const todayLabel = new Date().toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        await sendWhatsAppMessage(
          hrPhone,
          `🕒 Nouvelle heure supplémentaire à valider\n\nEmployé : ${employee.lastName} ${employee.firstName} (${employee.matricule})\nDate : ${todayLabel}\nDurée : ${h}h${m
            .toString()
            .padStart(2, "0")}\n\nVous pouvez la traiter dans le module *Heures supplémentaires* du dashboard.`
        );
      }
    }

    return NextResponse.json(
      {
        data: {
          success: result.success,
          message: result.message,
          status: result.status,
        },
      },
      { status: result.success ? 200 : 400 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
