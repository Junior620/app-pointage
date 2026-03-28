import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const createMissionSchema = z.object({
  employeeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().min(1, "Le motif est requis"),
  location: z.string().optional(),
  hostStructure: z.enum(["SCPB", "AFREXIA"]).optional(),
  transport: z.string().optional(),
  lodging: z.string().optional(),
  expenses: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);
    const { searchParams } = request.nextUrl;

    const status = searchParams.get("status");
    const employeeId = searchParams.get("employeeId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const service = searchParams.get("service");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (startDate) where.startDate = { gte: new Date(startDate) };
    if (endDate) where.endDate = { lte: new Date(endDate) };
    if (service) where.employee = { service };
    const structure = searchParams.get("structure");
    if (structure) where.originStructure = structure;

    const [missions, total, pending, approved, rejected, serviceRows] = await Promise.all([
      prisma.mission.findMany({
        where,
        include: { employee: true },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.mission.count({ where }),
      prisma.mission.count({ where: { ...where, status: "PENDING" } }),
      prisma.mission.count({ where: { ...where, status: "APPROVED" } }),
      prisma.mission.count({ where: { ...where, status: "REJECTED" } }),
      prisma.employee.findMany({
        select: { service: true },
        distinct: ["service"],
        orderBy: { service: "asc" },
      }),
    ]);

    return NextResponse.json({
      data: missions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: { total, pending, approved, rejected },
      services: serviceRows.map((s) => s.service).filter(Boolean),
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

    const parsed = createMissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    const mission = await prisma.mission.create({
      // Cast en any pour rester compatible tant que le client Prisma
      // généré n'a pas encore les nouveaux champs (transport/lodging/expenses).
      data: {
        employeeId: parsed.data.employeeId,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        reason: parsed.data.reason,
        location: parsed.data.location || null,
        transport: parsed.data.transport || null,
        lodging: parsed.data.lodging || null,
        expenses: parsed.data.expenses || null,
        originStructure: employee.structure,
        hostStructure: parsed.data.hostStructure || null,
      } as any,
      include: { employee: true },
    });

    await createAuditLog({
      actorId: session.id,
      action: "CREATE",
      entity: "Mission",
      entityId: mission.id,
      after: mission,
    });

    if (employee.active && employee.whatsappPhone?.trim()) {
      try {
        const opts: Intl.DateTimeFormatOptions = {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        };
        const startStr = mission.startDate.toLocaleDateString("fr-FR", opts);
        const endStr = mission.endDate.toLocaleDateString("fr-FR", opts);
        let msg = `📋 *Nouvelle mission*\n\n`;
        msg += `Bonjour ${employee.firstName},\n\n`;
        msg += `Une mission a été enregistrée à votre nom.\n\n`;
        msg += `📅 *Période*\nDu ${startStr}\nau ${endStr}\n`;
        if (mission.location?.trim()) {
          msg += `\n📍 *Lieu*\n${mission.location.trim()}\n`;
        }
        if (mission.hostStructure) {
          msg += `\n🏢 *Structure d'accueil*\n${mission.hostStructure}\n`;
        }
        msg += `\n📝 *Motif*\n${mission.reason}\n`;
        msg += `\n⏳ Statut : *en attente* de validation par la RH / la hiérarchie. Vous recevrez une confirmation une fois la demande traitée.`;
        await sendWhatsAppMessage(employee.whatsappPhone.trim(), msg);
      } catch (e) {
        console.error("[Missions] Notification WhatsApp (création mission) échouée:", e);
      }
    }

    return NextResponse.json({ data: mission }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
