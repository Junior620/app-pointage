import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { normalizeUserWhatsappPhone } from "@/lib/rh-whatsapp-notify";

const patchSchema = z.object({
  whatsappPhone: z.union([z.string(), z.null()]).optional(),
  active: z.boolean().optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["HR", "ADMIN", "DG"]).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function validateWhatsappUnique(
  whatsappPhone: string | null,
  userId: string
): Promise<string | null> {
  if (!whatsappPhone) return null;

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
    return "Ce numéro est déjà lié à un employé (fiche pointage).";
  }

  const conflictUser = await prisma.user.findFirst({
    where: { whatsappPhone, NOT: { id: userId } },
    select: { email: true },
  });
  if (conflictUser) {
    return `Ce numéro est déjà utilisé par ${conflictUser.email}.`;
  }

  return null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    if (id === session.id) {
      if (parsed.data.active === false) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas désactiver votre propre compte." },
          { status: 400 }
        );
      }
      if (parsed.data.role && parsed.data.role !== before.role) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas modifier votre propre rôle." },
          { status: 400 }
        );
      }
    }

    if (parsed.data.active === false && before.role === "ADMIN") {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, NOT: { id } },
      });
      if (otherAdmins === 0) {
        return NextResponse.json(
          { error: "Impossible de désactiver le dernier administrateur actif." },
          { status: 400 }
        );
      }
    }

    const data: {
      whatsappPhone?: string | null;
      active?: boolean;
      name?: string;
      role?: "HR" | "ADMIN" | "DG";
    } = {};

    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.active !== undefined) data.active = parsed.data.active;

    if (parsed.data.whatsappPhone !== undefined) {
      const whatsappPhone = normalizeUserWhatsappPhone(parsed.data.whatsappPhone);
      const conflict = await validateWhatsappUnique(whatsappPhone, id);
      if (conflict) {
        return NextResponse.json({ error: conflict }, { status: 409 });
      }
      data.whatsappPhone = whatsappPhone;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Aucune modification" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        whatsappPhone: true,
        createdAt: true,
      },
    });

    await createAuditLog({
      actorId: session.id,
      action: "UPDATE",
      entity: "User",
      entityId: id,
      before,
      after: user,
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
