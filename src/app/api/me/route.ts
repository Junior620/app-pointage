import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionState, requireTenant } from "@/lib/auth";
import { normalizeUserWhatsappPhone, userWhatsappPhoneConflict } from "@/lib/rh-whatsapp-notify";
import { tenantDb } from "@/lib/tenant";

const patchSchema = z.object({
  whatsappPhone: z.union([z.string(), z.null()]).optional(),
});

export async function GET() {
  try {
    const state = await getSessionState();
    if (state.status === "wrong-org") {
      // Compte valide, mais d'une autre entreprise que celle de l'adresse ouverte.
      return NextResponse.json(
        { error: "Ce compte n'appartient pas à cette entreprise.", code: "WRONG_ORG" },
        { status: 403 }
      );
    }
    if (state.status !== "ok") {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { session } = state;

    const user = await tenantDb(session.organizationId).user.findUnique({
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
      organization: session.organization,
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { session, org, db } = await requireTenant(["HR", "ADMIN", "DG"]);
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

    const conflict = await userWhatsappPhoneConflict(whatsappPhone, {
      userId: session.id,
      organizationId: org.id,
    });
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 });
    }

    const user = await db.user.update({
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
