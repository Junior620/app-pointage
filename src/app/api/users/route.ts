import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

/** Liste des comptes dashboard (ADMIN) — pour gérer les numéros WhatsApp de notification. */
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
