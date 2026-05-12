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

    const { matricule, firstName, lastName, service, structure, siteId, whatsappPhone, active } = body;

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
        ...(structure !== undefined && { structure }),
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

    // Timeouts : (1) Prisma transaction interactive ~5 s par défaut ; (2) Postgres/Supabase
    // impose souvent ~8–10 s par requête (statement_timeout). On élève les deux.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '120s'`;
        await tx.hrRemark.deleteMany({ where: { employeeId: id } });
        await tx.fraudAttempt.deleteMany({ where: { employeeId: id } });
        await tx.attendanceRecord.deleteMany({ where: { employeeId: id } });
        await tx.leaveRequest.deleteMany({ where: { employeeId: id } });
        await tx.mission.deleteMany({ where: { employeeId: id } });
        await tx.employee.delete({ where: { id } });
      },
      { maxWait: 20000, timeout: 120000 }
    );

    try {
      await createAuditLog({
        actorId: session.id,
        action: "DELETE",
        entity: "Employee",
        entityId: id,
        before,
        after: null,
      });
    } catch (auditErr) {
      console.error("[DELETE employee] Audit log error:", auditErr);
    }

    return NextResponse.json({ data: { id }, deleted: true });
  } catch (error) {
    console.error("[DELETE employee]", error);
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const details =
      process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined;
    return NextResponse.json({ error: "Erreur serveur", ...(details && { details }) }, { status: 500 });
  }
}
