import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

const remarkSchema = z.object({
  category: z.enum([
    "retard_repete",
    "absence_injustifiee",
    "avertissement",
    "observation",
  ]),
  content: z.string().min(1, "Le contenu est requis"),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const remarks = await prisma.hrRemark.findMany({
      where: { employeeId: id },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: remarks });
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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();

    const parsed = remarkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      return NextResponse.json(
        { error: "Employé non trouvé" },
        { status: 404 }
      );
    }

    const remark = await prisma.hrRemark.create({
      data: {
        employeeId: id,
        category: parsed.data.category,
        content: parsed.data.content,
        authorId: session.id,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    return NextResponse.json({ data: remark }, { status: 201 });
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await context.params;

    const { searchParams } = request.nextUrl;
    const remarkId = searchParams.get("remarkId");
    if (!remarkId) {
      return NextResponse.json(
        { error: "remarkId requis" },
        { status: 400 }
      );
    }

    const remark = await prisma.hrRemark.findFirst({
      where: { id: remarkId, employeeId: id },
    });
    if (!remark) {
      return NextResponse.json(
        { error: "Remarque non trouvée" },
        { status: 404 }
      );
    }

    await prisma.hrRemark.delete({ where: { id: remarkId } });
    return NextResponse.json({ deleted: true });
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
