import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyMissionFormToken } from "@/lib/mission-form-token";
import { parseDateInputForDbDate } from "@/lib/utils";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { logPublicSubmission } from "@/lib/public-submission-log";

const submitSchema = z.object({
  t: z.string().min(10),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z
    .string()
    .min(5, "Merci de détailler l'objet de la mission (au moins 5 caractères).")
    .max(4000),
  location: z.string().max(255).optional().nullable(),
  hostStructure: z.enum(["SCPB", "AFREXIA"]).optional().nullable(),
  transport: z.string().max(500).optional().nullable(),
  certify: z.boolean().refine((v) => v === true, {
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

    const v = verifyMissionFormToken(parsed.data.t);
    if (!v) {
      return NextResponse.json(
        { error: "Lien invalide ou expiré. Redemandez un lien depuis WhatsApp." },
        { status: 401 }
      );
    }

    const employee = await prisma.employee.findUnique({ where: { id: v.employeeId } });
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

    const mission = await prisma.mission.create({
      data: {
        employeeId: employee.id,
        startDate: start,
        endDate: end,
        reason: parsed.data.reason.trim(),
        location: parsed.data.location?.trim() || null,
        transport: parsed.data.transport?.trim() || null,
        originStructure: employee.structure,
        hostStructure: parsed.data.hostStructure || null,
        submissionSource: "EMPLOYEE_WHATSAPP_FORM",
      } as any,
      include: { employee: true },
    });

    // Notification RH / admins (configurable)
    const notifyPhones = (process.env.WHATSAPP_MISSION_NOTIFY_PHONES || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (notifyPhones.length > 0) {
      const startStr = mission.startDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const endStr = mission.endDate.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const text =
        `🆕 *Nouvelle demande de mission (employé)*\n\n` +
        `Employé : ${employee.lastName} ${employee.firstName} (${employee.matricule})\n` +
        `Service : ${employee.service}\n` +
        `Période : ${startStr} → ${endStr}\n` +
        (mission.location ? `Lieu : ${mission.location}\n` : "") +
        `Objet : ${mission.reason.slice(0, 600)}${mission.reason.length > 600 ? "…" : ""}\n\n` +
        `➡️ À traiter dans le module *Missions* du dashboard.`;
      await Promise.allSettled(notifyPhones.map((p) => sendWhatsAppMessage(p, text)));
    }

    await logPublicSubmission({
      employeeId: employee.id,
      type: "MISSION_REQUEST",
      entity: "mission",
      entityId: mission.id,
      request,
      payload: {
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        reason: parsed.data.reason.trim().slice(0, 500),
        location: parsed.data.location?.trim() || null,
        hostStructure: parsed.data.hostStructure || null,
        transport: parsed.data.transport?.trim() || null,
        submissionSource: "EMPLOYEE_WHATSAPP_FORM",
      },
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
        const startStr = mission.startDate.toLocaleDateString("fr-FR", opts);
        const endStr = mission.endDate.toLocaleDateString("fr-FR", opts);
        await sendWhatsAppMessage(
          rawPhone,
          `✅ *Demande de mission transmise*\n\nBonjour ${employee.firstName},\n\nVotre demande d'ordre de mission a bien été envoyée.\n\n📅 *Période*\nDu ${startStr}\nau ${endStr}\n\n📝 *Objet*\n${mission.reason.slice(0, 500)}${mission.reason.length > 500 ? "…" : ""}\n\n⏳ Elle sera examinée par la RH / l'administrateur.`
        );
      } catch (e) {
        console.error("[mission-request/submit] WhatsApp confirmation:", e);
      }
    }

    return NextResponse.json({ ok: true, id: mission.id }, { status: 201 });
  } catch (e) {
    console.error("[mission-request/submit]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
