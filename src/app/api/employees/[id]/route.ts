import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { DepartureReason, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { normalizePhone } from "@/lib/whatsapp";
import { parseDateInputForDbDate } from "@/lib/utils";

const DEPARTURE_REASONS = ["RESIGNATION", "END_OF_CONTRACT", "DISMISSAL", "ABANDONMENT"] as const;

const updateEmployeeBodySchema = z
  .object({
    matricule: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    service: z.string().optional(),
    structure: z.enum(["SCPB", "AFREXIA"]).optional(),
    siteId: z.union([z.string(), z.null()]).optional(),
    whatsappPhone: z.union([z.string(), z.null()]).optional(),
    active: z.boolean().optional(),
    departureDate: z.union([z.string(), z.null()]).optional(),
    departureReason: z.enum(DEPARTURE_REASONS).nullable().optional(),
    departureNote: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

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
    const rawBody = await request.json();
    const parsed = updateEmployeeBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const before = await prisma.employee.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    const siteIdValue =
      body.siteId !== undefined ? (typeof body.siteId === "string" ? body.siteId.trim() || null : null) : undefined;
    const rawPhone = typeof body.whatsappPhone === "string" ? body.whatsappPhone.trim() : "";
    const whatsappPhoneValue =
      body.whatsappPhone !== undefined
        ? rawPhone
          ? normalizePhone(rawPhone)
          : null
        : undefined;

    const data: Prisma.EmployeeUpdateInput = {};

    if (body.matricule !== undefined) data.matricule = body.matricule;
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.service !== undefined) data.service = body.service;
    if (body.structure !== undefined) data.structure = body.structure;
    if (body.siteId !== undefined) {
      data.site =
        siteIdValue === null ? { disconnect: true } : { connect: { id: siteIdValue } };
    }
    if (body.whatsappPhone !== undefined) data.whatsappPhone = whatsappPhoneValue;

    const becomingInactive = body.active === false && before.active === true;
    const reactivating = body.active === true;

    if (reactivating) {
      data.active = true;
      data.departureDate = null;
      data.departureReason = null;
      data.departureNote = null;
    } else if (becomingInactive) {
      const dateStr = body.departureDate && typeof body.departureDate === "string" ? body.departureDate : null;
      const reason = body.departureReason as DepartureReason | undefined;
      if (!dateStr || !reason) {
        return NextResponse.json(
          {
            error:
              "Pour enregistrer un départ, la date de départ et le motif (démission, fin de contrat, licenciement ou abandon) sont obligatoires.",
          },
          { status: 400 }
        );
      }
      data.active = false;
      data.departureDate = parseDateInputForDbDate(dateStr);
      data.departureReason = reason;
      const note =
        body.departureNote === undefined || body.departureNote === null
          ? null
          : String(body.departureNote).trim() || null;
      data.departureNote = note;
    } else {
      if (body.active !== undefined) data.active = body.active;
      if (body.departureDate !== undefined) {
        data.departureDate =
          body.departureDate === null || body.departureDate === ""
            ? null
            : parseDateInputForDbDate(body.departureDate);
      }
      if (body.departureReason !== undefined) {
        data.departureReason = body.departureReason;
      }
      if (body.departureNote !== undefined) {
        data.departureNote =
          body.departureNote === null ? null : String(body.departureNote).trim() || null;
      }
    }

    const employee = await prisma.employee.update({
      where: { id },
      data,
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
