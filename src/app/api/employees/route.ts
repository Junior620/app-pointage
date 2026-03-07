import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

const createEmployeeSchema = z.object({
  matricule: z.string().min(1, "Le matricule est requis"),
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  service: z.string().min(1, "Le service est requis"),
  siteId: z.string().optional(),
});

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

    const existing = await prisma.employee.findUnique({ where: { matricule: parsed.data.matricule } });
    if (existing) {
      return NextResponse.json({ error: "Ce matricule existe déjà" }, { status: 409 });
    }

    const data = {
      ...parsed.data,
      siteId: parsed.data.siteId?.trim() || undefined,
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
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
