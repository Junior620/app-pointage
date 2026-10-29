import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { DepartureReason, Prisma } from "@prisma/client";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import {
  EmployeeWhatsappError,
  diffNewWhatsappPhones,
  getEmployeeWhatsappPhones,
  syncEmployeeWhatsappPhones,
} from "@/lib/employee-whatsapp";
import { sendEmployeeWelcomeWhatsAppToPhones } from "@/lib/employee-welcome";
import { parseDateInputForDbDate } from "@/lib/utils";
import { STRUCTURE_CODES } from "@/lib/brand";
import { orgBaseUrl } from "@/lib/tenant";
import { assertOrgSites, assertOrgStructure, OrgValidationError } from "@/lib/org-validation";
import { listOrgServices, normalizeService } from "@/lib/services";
import { INTERNSHIP_INCLUDE, InternshipInputError, internshipData, internshipInputSchema } from "@/lib/internship-input";
import { dayKey } from "@/lib/interns";

const DEPARTURE_REASONS = ["RESIGNATION", "END_OF_CONTRACT", "DISMISSAL", "ABANDONMENT", "INTERNSHIP_END"] as const;

const EMPLOYEE_INCLUDE = {
  site: true,
  checkoutSite: true,
  whatsappPhones: { orderBy: { sortOrder: "asc" } },
  internship: { include: INTERNSHIP_INCLUDE },
} as const;

const updateEmployeeBodySchema = z
  .object({
    matricule: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    service: z.string().optional(),
    structure: z.enum(STRUCTURE_CODES).optional(),
    siteId: z.union([z.string(), z.null()]).optional(),
    checkoutSiteId: z.union([z.string(), z.null()]).optional(),
    whatsappPhone: z.union([z.string(), z.null()]).optional(),
    whatsappPhone2: z.union([z.string(), z.null()]).optional(),
    kind: z.enum(["EMPLOYEE", "INTERN"]).optional(),
    internship: internshipInputSchema.optional(),
    active: z.boolean().optional(),
    departureDate: z.union([z.string(), z.null()]).optional(),
    departureReason: z.enum(DEPARTURE_REASONS).nullable().optional(),
    departureNote: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN", "DG"]);
    const { id } = await context.params;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const employee = await db.employee.findUnique({
      where: { id },
      include: {
        site: true,
        checkoutSite: true,
        whatsappPhones: { orderBy: { sortOrder: "asc" } },
        internship: { include: INTERNSHIP_INCLUDE },
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
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { session, org, db, scope } = await requireTenant(["HR", "ADMIN"]);
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

    const before = await db.employee.findUnique({ where: { id }, include: { internship: true } });
    if (!before) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    // Stagiaire : la fiche de stage est obligatoire (créée ou mise à jour avec l'employé).
    const nextKind = body.kind ?? before.kind;
    if (nextKind === "INTERN" && !body.internship && !before.internship) {
      return NextResponse.json({ error: "Les dates et l'école du stage sont requises pour un stagiaire." }, { status: 400 });
    }
    const stage = body.internship ? await internshipData(db, body.internship, id) : null;

    const siteIdValue =
      body.siteId !== undefined ? (typeof body.siteId === "string" ? body.siteId.trim() || null : null) : undefined;
    const checkoutSiteIdValue =
      body.checkoutSiteId !== undefined
        ? typeof body.checkoutSiteId === "string"
          ? body.checkoutSiteId.trim() || null
          : null
        : undefined;

    if (body.structure !== undefined) assertOrgStructure(org, body.structure);
    await assertOrgSites(db, [siteIdValue, checkoutSiteIdValue]);
    if (body.matricule !== undefined && body.matricule !== before.matricule) {
      const taken = await db.employee.findFirst({ where: { matricule: body.matricule, NOT: { id } } });
      if (taken) return NextResponse.json({ error: "Ce matricule existe déjà" }, { status: 409 });
    }

    const data: Prisma.EmployeeUpdateInput = {};

    if (body.matricule !== undefined) data.matricule = body.matricule;
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.service !== undefined) {
      const service = normalizeService(body.service, await listOrgServices(db));
      if (!service) return NextResponse.json({ error: "Le service est requis" }, { status: 400 });
      data.service = service;
    }
    if (body.structure !== undefined) data.structure = body.structure;
    if (body.kind !== undefined) data.kind = body.kind;
    if (stage) {
      // Nouvelle date de fin : le rappel « fin dans 7 jours » repartira.
      const endChanged = !before.internship || dayKey(before.internship.endDate) !== dayKey(stage.endDate);
      const reminder = endChanged ? { endReminderSentAt: null } : {};
      data.internship = {
        upsert: {
          create: { ...stage, organizationId: org.id },
          update: { ...stage, ...reminder },
        },
      };
    }
    if (body.siteId !== undefined) {
      data.site =
        siteIdValue === null ? { disconnect: true } : { connect: { id: siteIdValue } };
    }
    if (body.checkoutSiteId !== undefined) {
      data.checkoutSite =
        checkoutSiteIdValue === null
          ? { disconnect: true }
          : { connect: { id: checkoutSiteIdValue } };
    }

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
              "Pour enregistrer un départ, la date de départ et le motif (démission, fin de contrat, licenciement, abandon ou fin de stage) sont obligatoires.",
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

    const employee = await db.employee.update({
      where: { id },
      data,
      include: EMPLOYEE_INCLUDE,
    });

    await createAuditLog(scope, {
      actorId: session.id,
      action: "UPDATE",
      entity: "Employee",
      entityId: id,
      before,
      after: employee,
    });

    let welcomeSent = false;
    let employeeOut = employee;

    if (body.whatsappPhone !== undefined || body.whatsappPhone2 !== undefined) {
      const beforePhones = await getEmployeeWhatsappPhones(id);
      const phone1 =
        body.whatsappPhone !== undefined ? body.whatsappPhone : beforePhones[0] ?? "";
      const phone2 =
        body.whatsappPhone2 !== undefined ? body.whatsappPhone2 : beforePhones[1] ?? "";
      try {
        const afterPhones = await syncEmployeeWhatsappPhones(org.id, id, [phone1, phone2]);
        const newPhones = diffNewWhatsappPhones(beforePhones, afterPhones);
        employeeOut =
          (await db.employee.findUnique({
            where: { id },
            include: EMPLOYEE_INCLUDE,
          })) ?? employee;
        if (employeeOut.active && newPhones.length > 0) {
          welcomeSent = await sendEmployeeWelcomeWhatsAppToPhones(newPhones, {
            firstName: employeeOut.firstName,
            lastName: employeeOut.lastName,
            matricule: employeeOut.matricule,
            service: employeeOut.service,
            structure: employeeOut.structure,
            appUrl: orgBaseUrl(org),
          });
        }
      } catch (e) {
        if (e instanceof EmployeeWhatsappError) {
          return NextResponse.json({ error: e.message }, { status: 409 });
        }
        throw e;
      }
    }

    return NextResponse.json({ data: employeeOut, welcomeSent });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
      if (error instanceof OrgValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
      if (error instanceof InternshipInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { session, db, scope } = await requireTenant(["ADMIN"]);
    const { id } = await context.params;

    const before = await db.employee.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    await db.$transaction(
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
      await createAuditLog(scope, {
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
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const details =
      process.env.NODE_ENV === "development" && error instanceof Error ? error.message : undefined;
    return NextResponse.json({ error: "Erreur serveur", ...(details && { details }) }, { status: 500 });
  }
}
