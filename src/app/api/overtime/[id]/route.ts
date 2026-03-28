import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

const validateSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();

    const parsed = validateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Motif obligatoire en cas de refus
    if (parsed.data.status === "REJECTED") {
      const reason = (parsed.data.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json(
          { error: "Un motif est obligatoire pour refuser des heures supplémentaires." },
          { status: 400 }
        );
      }
    }

    const record = await prisma.attendanceRecord.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!record) {
      return NextResponse.json({ error: "Pointage non trouvé" }, { status: 404 });
    }

    if (!record.overtimeMinutes || record.overtimeMinutes <= 0) {
      return NextResponse.json(
        { error: "Ce pointage n'a pas d'heures supplémentaires" },
        { status: 400 }
      );
    }

    if (record.overtimeStatus !== "PENDING") {
      return NextResponse.json(
        { error: "Ces heures supplémentaires ont déjà été traitées" },
        { status: 400 }
      );
    }

    // Optionnel : exiger une mission approuvée sur la date (stricte RH).
    // Par défaut désactivé — activer avec REQUIRE_MISSION_FOR_OVERTIME_APPROVAL=true
    if (process.env.REQUIRE_MISSION_FOR_OVERTIME_APPROVAL === "true") {
      const hasApprovedMission = await prisma.mission.findFirst({
        where: {
          employeeId: record.employeeId,
          status: "APPROVED",
          startDate: { lte: record.date },
          endDate: { gte: record.date },
        },
      });

      if (!hasApprovedMission && parsed.data.status === "APPROVED") {
        return NextResponse.json(
          {
            error:
              "Impossible d'approuver ces heures supplémentaires : aucune mission/projet approuvé ne couvre cette date.",
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.attendanceRecord.update({
      where: { id },
      data: {
        overtimeStatus: parsed.data.status,
        overtimeValidatedBy: session.name,
        overtimeValidatedAt: new Date(),
        ...(parsed.data.reason && { overtimeReason: parsed.data.reason.trim() }),
      },
      include: { employee: true },
    });

    await createAuditLog({
      actorId: session.id,
      action: parsed.data.status === "APPROVED" ? "OVERTIME_APPROVE" : "OVERTIME_REJECT",
      entity: "AttendanceRecord",
      entityId: id,
      before: record,
      after: updated,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié")
        return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit")
        return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
