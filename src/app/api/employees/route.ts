import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

const STRUCTURES = ["SCPB", "AFREXIA"] as const;

const createEmployeeSchema = z.object({
  matricule: z.string().optional(),
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  service: z.string().min(1, "Le service est requis"),
  structure: z.enum(STRUCTURES).default("SCPB"),
  siteId: z.string().optional(),
});

/** Préfixe : STRUCTURE-SERVICE- (SCPB / AFREXIA). Suffixe numérique aléatoire, vérifié unique en base. */
async function generateUniqueMatricule(service: string, structure: string): Promise<string> {
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
  const struct = structure.trim().toUpperCase() || "SCPB";
  const prefix = `${struct}-${dept}-`;

  const maxAttempts = 80;
  for (let i = 0; i < maxAttempts; i++) {
    const suffix = String(randomInt(0, 10_000)).padStart(4, "0");
    const candidate = `${prefix}${suffix}`;
    const taken = await prisma.employee.findUnique({ where: { matricule: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }

  // Collision improbable : élargir à 6 chiffres une fois
  for (let i = 0; i < 40; i++) {
    const suffix = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const candidate = `${prefix}${suffix}`;
    const taken = await prisma.employee.findUnique({ where: { matricule: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }

  throw new Error("Impossible de générer un matricule unique");
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
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

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: { site: true },
        skip,
        take: limit,
        orderBy: { lastName: "asc" },
      }),
      prisma.employee.count({ where }),
    ]);

    return NextResponse.json({
      data: employees,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const body = await request.json();

    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { matricule, ...rest } = parsed.data;
    let finalMatricule = (matricule ?? "").trim();
    if (!finalMatricule) {
      finalMatricule = await generateUniqueMatricule(rest.service, rest.structure);
    }

    const existing = await prisma.employee.findUnique({ where: { matricule: finalMatricule } });
    if (existing) {
      return NextResponse.json({ error: "Ce matricule existe déjà" }, { status: 409 });
    }

    const data = {
      ...rest,
      matricule: finalMatricule,
      siteId: rest.siteId?.trim() || undefined,
    };

    const employee = await prisma.employee.create({
      data,
      include: { site: true },
    });

    await createAuditLog({
      actorId: session.id,
      action: "CREATE",
      entity: "Employee",
      entityId: employee.id,
      after: employee,
    });

    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
      if (error.message === "Impossible de générer un matricule unique") {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
