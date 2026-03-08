import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const rows = await prisma.employee.findMany({
      where: { active: true },
      select: { service: true },
      distinct: ["service"],
      orderBy: { service: "asc" },
    });
    const services = rows.map((r) => r.service).filter(Boolean) as string[];
    return NextResponse.json({ services });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
