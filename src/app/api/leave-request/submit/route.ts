import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeaveAbsenceCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyLeaveFormToken } from "@/lib/leave-form-token";
import { parseDateInputForDbDate } from "@/lib/utils";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const submitSchema = z.object({
  t: z.string().min(10),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().min(5, "Merci de détailler le motif (au moins 5 caractères).").max(4000),
  absenceCategory: z.nativeEnum(LeaveAbsenceCategory),
  notifyOrReplace: z.string().max(500).optional().nullable(),
  certify: z
    .boolean()
    .refine((v) => v === true, {
      message: "Vous devez certifier l'exactitude des informations.",
    }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const v = verifyLeaveFormToken(parsed.data.t);
    if (!v) {
      return NextResponse.json(
        { error: "Lien invalide ou expiré. Redemandez un lien depuis WhatsApp." },
        { status: 401 }
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { id: v.employeeId },
    });

    if (!employee?.active) {
      return NextResponse.json(
        { error: "Compte inactif ou introuvable." },
        { status: 403 }
      );
    }

    const start = parseDateInputForDbDate(parsed.data.startDate);
    const end = parseDateInputForDbDate(parsed.data.endDate);
    if (end < start) {
      return NextResponse.json(
        { error: "La date de fin doit être après ou égale à la date de début." },
        { status: 400 }
      );
    }

    const notify =
      parsed.data.notifyOrReplace === undefined || parsed.data.notifyOrReplace === null
        ? null
        : parsed.data.notifyOrReplace.trim() || null;

    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        startDate: start,
        endDate: end,
        reason: parsed.data.reason.trim(),
        absenceCategory: parsed.data.absenceCategory,
        notifyOrReplace: notify,
        submissionSource: "EMPLOYEE_WHATSAPP_FORM",
      },
      include: { employee: true },
    });

    if (employee.whatsappPhone?.trim()) {
      try {
        const rawPhone = employee.whatsappPhone.trim();
        const opts: Intl.DateTimeFormatOptions = {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        };
        const startStr = leave.startDate.toLocaleDateString("fr-FR", opts);
        const endStr = leave.endDate.toLocaleDateString("fr-FR", opts);
        await sendWhatsAppMessage(
          rawPhone,
          `✅ *Demande transmise aux RH*\n\nBonjour ${employee.firstName},\n\nVotre demande d'autorisation d'absence (formulaire web) a bien été envoyée.\n\n📅 *Période*\nDu ${startStr}\nau ${endStr}\n\n📝 *Motif*\n${leave.reason.slice(0, 500)}${leave.reason.length > 500 ? "…" : ""}\n\n⏳ Elle sera examinée par la RH ou la hiérarchie ; vous recevrez un message après validation ou refus.\n\n💡 Répondez *5* pour *Mes autorisations d'absence* en cours.`
        );
      } catch (e) {
        console.error("[leave-request/submit] WhatsApp confirmation:", e);
      }
    }

    return NextResponse.json({ ok: true, id: leave.id }, { status: 201 });
  } catch (e) {
    console.error("[leave-request/submit]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
