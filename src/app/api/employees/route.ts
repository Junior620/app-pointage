import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import {
  EmployeeWhatsappError,
  getEmployeeWhatsappPhones,
  syncEmployeeWhatsappPhones,
} from "@/lib/employee-whatsapp";
import { sendEmployeeWelcomeWhatsAppToPhones } from "@/lib/employee-welcome";
import { STRUCTURE_CODES, structureBrand } from "@/lib/brand";
import { orgBaseUrl, type Db } from "@/lib/tenant";
import { assertOrgSites, assertOrgStructure, OrgValidationError } from "@/lib/org-validation";

const createEmployeeSchema = z.object({
  matricule: z.string().optional(),
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  service: z.string().min(1, "Le service est requis"),
  structure: z.enum(STRUCTURE_CODES).optional(),
  siteId: z.string().optional(),
  checkoutSiteId: z.string().optional(),
  whatsappPhone: z.string().optional(),
  whatsappPhone2: z.string().optional(),
});

/** Préfixe : STRUCTURE-SERVICE-. Suffixe numérique aléatoire, vérifié unique dans l'entreprise. */
async function generateUniqueMatricule(db: Db, service: string, structure: string): Promise<string> {
  const raw = service.trim().toUpperCase();
  const DEPT_MAP: Record<string, string> = {
    IT: "IT",
    QHSE: "QHSE",
    RH: "RH",
    DAF: "DAF",
    RAF: "RAF",
    ST: "ST",
  };
  const derived = raw.replace(/[^A-Z]/g, "").slice(0, 4);
  const dept = DEPT_MAP[raw] || derived || "GEN";
  const struct = structureBrand(structure)?.matriculePrefix ?? structure.trim().toUpperCase();
  const prefix = `${struct}-${dept}-`;

  const maxAttempts = 80;
  for (let i = 0; i < maxAttempts; i++) {
    const suffix = String(randomInt(0, 10_000)).padStart(4, "0");
    const candidate = `${prefix}${suffix}`;
    const taken = await db.employee.findFirst({ where: { matricule: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }

  for (let i = 0; i < 40; i++) {
    const suffix = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const candidate = `${prefix}${suffix}`;
    const taken = await db.employee.findFirst({ where: { matricule: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }

  throw new Error("Impossible de générer un matricule unique");
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await requireTenant(["HR", "ADMIN"]);
    const { searchParams } = request.nextUrl;

    const q = searchParams.get("q") || "";
    const service = searchParams.get("service");
    const active = searchParams.get("active");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { matricule: { contains: q, mode: "insensitive" } },
      ];
    }
    if (service) where.service = service;
    const structure = searchParams.get("structure");
    if (structure) where.structure = structure;
    if (active !== null && active !== undefined) {
      where.active = active === "true";
    }

    // Compteurs sur l'ensemble des employés correspondant à la recherche (hors filtre actif/inactif),
    // et non sur la seule page affichée.
    const statsWhere: Record<string, unknown> = { ...where };
    delete statsWhere.active;
    const hasWhatsapp = { OR: [{ whatsappPhone: { not: null } }, { whatsappPhones: { some: {} } }] };

    const [employees, total, activeCount, inactiveCount, whatsappCount] = await Promise.all([
      db.employee.findMany({
        where,
        include: {
          site: true,
          checkoutSite: true,
          whatsappPhones: { orderBy: { sortOrder: "asc" } },
        },
        skip,
        take: limit,
        orderBy: { lastName: "asc" },
      }),
      db.employee.count({ where }),
      db.employee.count({ where: { ...statsWhere, active: true } }),
      db.employee.count({ where: { ...statsWhere, active: false } }),
      db.employee.count({ where: { AND: [statsWhere, { active: true }, hasWhatsapp] } }),
    ]);

    return NextResponse.json({
      data: employees,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: { active: activeCount, inactive: inactiveCount, whatsapp: whatsappCount },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, org, db, scope } = await requireTenant(["HR", "ADMIN"]);
    const body = await request.json();

    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { matricule, whatsappPhone, whatsappPhone2, structure: requestedStructure, ...rest } = parsed.data;
    const structure = assertOrgStructure(org, requestedStructure);
    await assertOrgSites(db, [rest.siteId, rest.checkoutSiteId]);
    let finalMatricule = (matricule ?? "").trim();
    if (!finalMatricule) {
      finalMatricule = await generateUniqueMatricule(db, rest.service, structure);
    }

    const existing = await db.employee.findFirst({ where: { matricule: finalMatricule } });
    if (existing) {
      return NextResponse.json({ error: "Ce matricule existe déjà" }, { status: 409 });
    }

    const employee = await db.employee.create({
      data: {
        ...rest,
        organizationId: org.id,
        structure,
        matricule: finalMatricule,
        siteId: rest.siteId?.trim() || undefined,
        checkoutSiteId: rest.checkoutSiteId?.trim() || undefined,
      },
      include: {
        site: true,
        checkoutSite: true,
        whatsappPhones: { orderBy: { sortOrder: "asc" } },
      },
    });

    try {
      await syncEmployeeWhatsappPhones(org.id, employee.id, [whatsappPhone, whatsappPhone2]);
    } catch (e) {
      await db.employee.delete({ where: { id: employee.id } });
      if (e instanceof EmployeeWhatsappError) {
        return NextResponse.json({ error: e.message }, { status: 409 });
      }
      throw e;
    }

    const refreshed = await db.employee.findUnique({
      where: { id: employee.id },
      include: {
        site: true,
        checkoutSite: true,
        whatsappPhones: { orderBy: { sortOrder: "asc" } },
      },
    });

    await createAuditLog(scope, {
      actorId: session.id,
      action: "CREATE",
      entity: "Employee",
      entityId: employee.id,
      after: refreshed,
    });

    let welcomeSent = false;
    if (refreshed?.active) {
      const phones = await getEmployeeWhatsappPhones(refreshed.id);
      if (phones.length > 0) {
        welcomeSent = await sendEmployeeWelcomeWhatsAppToPhones(phones, {
          firstName: refreshed.firstName,
          lastName: refreshed.lastName,
          matricule: refreshed.matricule,
          service: refreshed.service,
          structure: refreshed.structure,
          appUrl: orgBaseUrl(org),
        });
      }
    }

    return NextResponse.json({ data: refreshed, welcomeSent }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error instanceof AuthUnavailableError) return authUnavailableResponse();
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
      if (error instanceof OrgValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
      if (error.message === "Impossible de générer un matricule unique") {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
