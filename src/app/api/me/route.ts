import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requireRole } from "@/lib/auth";
import { normalizeUserWhatsappPhone } from "@/lib/rh-whatsapp-notify";

const patchSchema = z.object({
  whatsappPhone: z.union([z.string(), z.null()]).optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        whatsappPhone: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      whatsappPhone: user.whatsappPhone,
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole(["HR", "ADMIN", "DG"]);
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.whatsappPhone === undefined) {
      return NextResponse.json({ error: "Aucune modification" }, { status: 400 });
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
        select: { id: true, matricule: true },
      });
      if (conflictEmployee) {
        return NextResponse.json(
          {
            error:
              "Ce numéro WhatsApp est déjà utilisé par un employé. Utilisez un autre numéro ou contactez l'administrateur.",
          },
          { status: 409 }
        );
      }

      const conflictUser = await prisma.user.findFirst({
        where: {
          whatsappPhone,
          NOT: { id: session.id },
        },
        select: { email: true },
      });
      if (conflictUser) {
        return NextResponse.json(
          { error: "Ce numéro WhatsApp est déjà utilisé par un autre compte RH." },
          { status: 409 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: session.id },
      data: { whatsappPhone },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        whatsappPhone: true,
      },
    });

    return NextResponse.json(user);
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
