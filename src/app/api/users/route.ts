import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { createDashboardUser, DashboardUserError } from "@/lib/create-dashboard-user";
import { normalizeUserWhatsappPhone } from "@/lib/rh-whatsapp-notify";

const createUserSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
  name: z.string().min(1, "Le nom est requis"),
  role: z.enum(["HR", "ADMIN", "DG"]),
  whatsappPhone: z.string().optional().nullable(),
});

/** Liste des comptes dashboard (ADMIN). */
export async function GET() {
  try {
    await requireRole(["ADMIN"]);

    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
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

    return NextResponse.json({ data: users });
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

/** Créer un compte RH / Admin / DG (ADMIN). */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await createDashboardUser({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
      role: parsed.data.role,
      whatsappPhone: parsed.data.whatsappPhone,
    });

    await createAuditLog({
      actorId: session.id,
      action: "CREATE",
      entity: "User",
      entityId: user.id,
      after: user,
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof DashboardUserError) {
      const status = error.code === "EMAIL_EXISTS" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof Error) {
      if (error.message === "Non authentifié") {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.message === "Accès interdit") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    console.error("[POST /api/users]", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
