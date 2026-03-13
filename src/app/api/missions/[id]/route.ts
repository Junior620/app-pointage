import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

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

    return NextResponse.json({ data: mission });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
