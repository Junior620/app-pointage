import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

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
      return NextResponse.json({ error: "Demande de permission non trouvée" }, { status: 404 });
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

    return NextResponse.json({ data: leave });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
