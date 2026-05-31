import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { normalizeUserWhatsappPhone } from "@/lib/rh-whatsapp-notify";

const patchSchema = z.object({
  whatsappPhone: z.union([z.string(), z.null()]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    const whatsappPhone = normalizeUserWhatsappPhone(parsed.data.whatsappPhone);

    if (whatsappPhone) {
      const conflictEmployee = await prisma.employee.findFirst({
        where: {
          OR: [
            { whatsappPhone },
            { whatsappPhone: whatsappPhone.replace(/\D/g, "") },
          ],
        },
        select: { matricule: true },
      });
      if (conflictEmployee) {
        return NextResponse.json(
          { error: "Ce numéro est déjà lié à un employé (fiche pointage)." },
          { status: 409 }
        );
      }

      const conflictUser = await prisma.user.findFirst({
        where: { whatsappPhone, NOT: { id } },
        select: { email: true },
      });
      if (conflictUser) {
        return NextResponse.json(
          { error: `Ce numéro est déjà utilisé par ${conflictUser.email}.` },
          { status: 409 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: { whatsappPhone },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        whatsappPhone: true,
      },
    });

    return NextResponse.json({ data: user });
  } catch (error) {
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
