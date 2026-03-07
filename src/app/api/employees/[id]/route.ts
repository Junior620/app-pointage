import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { normalizePhone } from "@/lib/whatsapp";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        site: true,
        attendances: {
          where: { date: { gte: thirtyDaysAgo } },
          orderBy: { date: "desc" },
        },
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    return NextResponse.json({ data: employee });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const { id } = await context.params;
    const body = await request.json();

    const before = await prisma.employee.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    const { matricule, firstName, lastName, service, siteId, whatsappPhone, active } = body;

    const siteIdValue = siteId !== undefined ? (siteId?.trim() || null) : undefined;
    const rawPhone = whatsappPhone?.trim() || "";
    const whatsappPhoneValue =
      whatsappPhone !== undefined ? (rawPhone ? normalizePhone(rawPhone) : null) : undefined;

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(matricule !== undefined && { matricule }),
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(service !== undefined && { service }),
        ...(siteId !== undefined && { siteId: siteIdValue }),
        ...(whatsappPhone !== undefined && { whatsappPhone: whatsappPhoneValue }),
        ...(active !== undefined && { active }),
      },
      include: { site: true },
    });

    await createAuditLog({
      actorId: session.id,
      action: "UPDATE",
      entity: "Employee",
      entityId: id,
      before,
      after: employee,
    });

    return NextResponse.json({ data: employee });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole(["ADMIN"]);
    const { id } = await context.params;

    const before = await prisma.employee.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: { active: false },
    });

    await createAuditLog({
      actorId: session.id,
      action: "SOFT_DELETE",
      entity: "Employee",
      entityId: id,
      before,
      after: employee,
    });

    return NextResponse.json({ data: employee });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
