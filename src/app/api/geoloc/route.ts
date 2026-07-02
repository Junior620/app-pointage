import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  processBreakEnd,
  processBreakStart,
  processCheckIn,
  processCheckOut,
} from "@/lib/attendance-engine";
import {
  findEmployeeByWhatsappPhone,
  getEmployeeWhatsappPhones,
  phonesFromEmployee,
} from "@/lib/employee-whatsapp";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { todayDate } from "@/lib/utils";

const geolocSchema = z.object({
  phone: z.string().min(1, "Le numéro de téléphone est requis"),
  lat: z.number().optional(),
  lng: z.number().optional(),
  action: z.enum(["CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END", "LATE_REASON"]),
  comment: z.string().optional(),
});

async function notifyEmployee(
  employee: { id: string; whatsappPhone?: string | null; whatsappPhones?: { phone: string }[] },
  fallbackPhone: string,
  message: string
) {
  let phones = phonesFromEmployee(employee);
  if (phones.length === 0) {
    phones = await getEmployeeWhatsappPhones(employee.id);
  }
  if (phones.length === 0 && fallbackPhone) {
    phones = [fallbackPhone];
  }
  for (const p of phones) {
    await sendWhatsAppMessage(p, message);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = geolocSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { phone, action, comment } = parsed.data;

    const employee = await findEmployeeByWhatsappPhone(phone);
    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé avec ce numéro" }, { status: 404 });
    }

    if (!employee.active) {
      return NextResponse.json({ error: "Ce compte employé est désactivé" }, { status: 403 });
    }

    if (action === "LATE_REASON") {
      const reason = comment?.trim();
      if (!reason) {
        return NextResponse.json({ error: "Indiquez le motif du retard" }, { status: 400 });
      }

      const today = todayDate();
      const record = await prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: today } },
      });

      if (!record?.checkInTime || record.checkInStatus !== "LATE") {
        return NextResponse.json(
          { error: "Aucun retard à justifier pour aujourd'hui" },
          { status: 400 }
        );
      }
      if (record.checkInComment) {
        return NextResponse.json({
          data: { success: true, message: `Motif déjà enregistré : « ${record.checkInComment} »` },
        });
      }

      await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { checkInComment: reason },
      });

      const msg = `Motif enregistré pour votre retard : « ${reason} ». Merci.`;
      await notifyEmployee(employee, phone, msg);

      return NextResponse.json({ data: { success: true, message: msg } });
    }

    const { lat, lng } = parsed.data;
    if (lat == null || lng == null) {
      return NextResponse.json({ error: "Position GPS requise" }, { status: 400 });
    }

    const point = { lat, lng };

    const result =
      action === "CHECK_IN"
        ? await processCheckIn(employee.id, point, comment)
        : action === "CHECK_OUT"
          ? await processCheckOut(employee.id, point, comment)
          : action === "BREAK_START"
            ? await processBreakStart(employee.id, point)
            : await processBreakEnd(employee.id, point);

    if (result.message) {
      await notifyEmployee(employee, phone, result.message);
    }

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

    const needsLateReason =
      result.success && result.status === "LATE" && action === "CHECK_IN" && !comment?.trim();

    return NextResponse.json(
      {
        data: {
          success: result.success,
          message: result.message,
          status: result.status,
          needsLateReason,
        },
      },
      { status: result.success ? 200 : 400 }
    );
  } catch (error) {
    console.error("[API geoloc]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
