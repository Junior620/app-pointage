import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const updateLeaveSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();

    const parsed = updateLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const before = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Demande d'autorisation d'absence non trouvée" }, { status: 404 });
    }

    if (before.cancelledAt) {
      return NextResponse.json(
        { error: "Cette demande a été annulée et ne peut plus être modifiée." },
        { status: 400 }
      );
    }

    if (before.status !== "PENDING") {
      return NextResponse.json({ error: "Cette demande a déjà été traitée" }, { status: 400 });
    }

    const leave = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: parsed.data.status,
        approvedBy: session.name,
      },
      include: { employee: true },
    });

    await createAuditLog({
      actorId: session.id,
      action: parsed.data.status === "APPROVED" ? "APPROVE" : "REJECT",
      entity: "LeaveRequest",
      entityId: id,
      before,
      after: leave,
    });

    if (leave.employee.active && leave.employee.whatsappPhone?.trim()) {
      try {
        const opts: Intl.DateTimeFormatOptions = {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        };
        const startStr = leave.startDate.toLocaleDateString("fr-FR", opts);
        const endStr = leave.endDate.toLocaleDateString("fr-FR", opts);
        let msg: string;
        if (parsed.data.status === "APPROVED") {
          msg =
            `✅ *Autorisation d'absence approuvée*\n\n` +
            `Bonjour ${leave.employee.firstName},\n\n` +
            `Votre demande d'autorisation d'absence a été *validée* par la RH.\n\n` +
            `📅 *Période*\nDu ${startStr}\nau ${endStr}\n\n` +
            `📝 *Motif*\n${leave.reason}\n\n` +
            `💡 Répondez *5* pour *Mes autorisations d'absence* (en cours).`;
        } else {
          msg =
            `❌ *Autorisation d'absence non approuvée*\n\n` +
            `Bonjour ${leave.employee.firstName},\n\n` +
            `Votre demande d'autorisation d'absence du ${startStr} au ${endStr} n'a *pas été approuvée*.\n\n` +
            `📝 *Motif indiqué*\n${leave.reason}\n\n` +
            `Pour plus d'informations, contactez les RH.`;
        }
        await sendWhatsAppMessage(leave.employee.whatsappPhone.trim(), msg);
      } catch (e) {
        console.error("[Autorisations absence] Notification WhatsApp (validation) échouée:", e);
      }
    }

    return NextResponse.json({ data: leave });
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

    const before = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Demande d'autorisation d'absence non trouvée" }, { status: 404 });
    }

    if (before.cancelledAt) {
      return NextResponse.json({ error: "Cette demande est déjà annulée." }, { status: 400 });
    }

    const leave = await prisma.leaveRequest.update({
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
      entity: "LeaveRequest",
      entityId: id,
      before,
      after: leave,
    });

    return NextResponse.json({ ok: true, data: leave });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
