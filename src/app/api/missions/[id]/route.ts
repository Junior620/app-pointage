import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const updateMissionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]).optional(),
  daysCompleted: z.number().int().min(0).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const mission = await prisma.mission.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!mission) {
      return NextResponse.json({ error: "Mission non trouvée" }, { status: 404 });
    }

    return NextResponse.json({ data: mission });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();

    const parsed = updateMissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const before = await prisma.mission.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Mission non trouvée" }, { status: 404 });
    }

    if (before.cancelledAt) {
      return NextResponse.json(
        { error: "Cette mission a été annulée et ne peut plus être modifiée." },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (parsed.data.status) {
      if (before.status !== "PENDING") {
        return NextResponse.json({ error: "Cette mission a déjà été traitée" }, { status: 400 });
      }
      updateData.status = parsed.data.status;
      updateData.approvedBy = session.name;
    }

    if (parsed.data.daysCompleted !== undefined) {
      updateData.daysCompleted = parsed.data.daysCompleted;
    }

    const mission = await prisma.mission.update({
      where: { id },
      data: updateData,
      include: { employee: true },
    });

    const action = parsed.data.status === "APPROVED"
      ? "APPROVE"
      : parsed.data.status === "REJECTED"
        ? "REJECT"
        : "UPDATE";

    await createAuditLog({
      actorId: session.id,
      action,
      entity: "Mission",
      entityId: id,
      before,
      after: mission,
    });

    if (
      parsed.data.status &&
      mission.employee.active &&
      mission.employee.whatsappPhone?.trim()
    ) {
      try {
        const opts: Intl.DateTimeFormatOptions = {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        };
        const startStr = mission.startDate.toLocaleDateString("fr-FR", opts);
        const endStr = mission.endDate.toLocaleDateString("fr-FR", opts);
        let msg: string;
        if (parsed.data.status === "APPROVED") {
          msg =
            `✅ *Mission approuvée*\n\n` +
            `Bonjour ${mission.employee.firstName},\n\n` +
            `Votre mission a été *validée* par la RH.\n\n` +
            `📅 *Période*\nDu ${startStr}\nau ${endStr}\n`;
          if (mission.location?.trim()) {
            msg += `\n📍 *Lieu*\n${mission.location.trim()}\n`;
          }
          if (mission.hostStructure) {
            msg += `\n🏢 *Structure d'accueil*\n${mission.hostStructure}\n`;
          }
          msg +=
            `\n📝 *Motif*\n${mission.reason}\n\n` +
            `💡 Répondez *7* pour *Mes missions* (historique récent).`;
        } else {
          msg =
            `❌ *Mission non approuvée*\n\n` +
            `Bonjour ${mission.employee.firstName},\n\n` +
            `Votre demande de mission du ${startStr} au ${endStr} n'a *pas été approuvée*.\n\n` +
            `📝 *Motif indiqué*\n${mission.reason}\n\n` +
            `Pour plus d'informations, contactez les RH.`;
        }
        await sendWhatsAppMessage(mission.employee.whatsappPhone.trim(), msg);
      } catch (e) {
        console.error("[Missions] Notification WhatsApp (validation) échouée:", e);
      }
    }

    return NextResponse.json({ data: mission });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const before = await prisma.mission.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Mission non trouvée" }, { status: 404 });
    }

    if (before.cancelledAt) {
      return NextResponse.json({ error: "Cette mission est déjà annulée." }, { status: 400 });
    }

    const mission = await prisma.mission.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        cancelledBy: session.name,
      },
      include: { employee: true },
    });

    await createAuditLog({
      actorId: session.id,
      action: "CANCEL",
      entity: "Mission",
      entityId: id,
      before,
      after: mission,
    });

    return NextResponse.json({ ok: true, data: mission });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
