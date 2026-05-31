import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { BREAK_EXPECTED_DURATION_MIN } from "@/lib/attendance-engine";

const patchSchema = z.object({
  breakComment: z.string().max(500).nullable(),
});

/** Mise à jour du motif de pause prolongée (RH). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const record = await prisma.attendanceRecord.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: "Pointage introuvable" }, { status: 404 });
    }
    if (!record.breakStartTime) {
      return NextResponse.json({ error: "Aucune pause sur ce pointage" }, { status: 400 });
    }
    if ((record.breakMinutes ?? 0) <= BREAK_EXPECTED_DURATION_MIN) {
      return NextResponse.json(
        {
          error: `Motif réservé aux pauses de plus de ${BREAK_EXPECTED_DURATION_MIN} minutes`,
        },
        { status: 400 }
      );
    }

    const comment = parsed.data.breakComment?.trim() || null;
    const updated = await prisma.attendanceRecord.update({
      where: { id },
      data: { breakComment: comment },
      select: { id: true, breakComment: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API breaks PATCH]", error);
    if (error instanceof Error) {
      if (error.message === "Non authentifié") {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message === "Accès interdit") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
