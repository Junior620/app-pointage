import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { activeRequestFilter } from "@/lib/request-active";
import { prismaPeriodOverlapAnd } from "@/lib/utils";

const createLeaveSchema = z.object({
  employeeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().min(1, "Le motif est requis"),
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
    const dateOverlap = prismaPeriodOverlapAnd(startDate, endDate, "startDate", "endDate");
    if (dateOverlap.length) {
      where.AND = dateOverlap;
    }
    if (service) where.employee = { service };

    const activeWhere = { ...where, ...activeRequestFilter };

    const [leaves, total, pending, approved, rejected, cancelled, services] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: { employee: true },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.count({ where: { ...activeWhere, status: "PENDING" } }),
      prisma.leaveRequest.count({ where: { ...activeWhere, status: "APPROVED" } }),
      prisma.leaveRequest.count({ where: { ...activeWhere, status: "REJECTED" } }),
      prisma.leaveRequest.count({ where: { ...where, cancelledAt: { not: null } } }),
      prisma.employee.findMany({
        select: { service: true },
        distinct: ["service"],
        orderBy: { service: "asc" },
      }),
    ]);

    const servicesList = services.map((s) => s.service).filter(Boolean);

    return NextResponse.json({
      data: leaves,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: { total, pending, approved, rejected, cancelled },
      services: servicesList,
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
    const session = await requireRole(["HR", "ADMIN", "DG"]);
    const body = await request.json();

    const parsed = createLeaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: parsed.data.employeeId,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        reason: parsed.data.reason,
      },
      include: { employee: true },
    });

    await createAuditLog({
      actorId: session.id,
      action: "CREATE",
      entity: "LeaveRequest",
      entityId: leave.id,
      after: leave,
    });

    if (employee.active && employee.whatsappPhone?.trim()) {
      try {
        const rawPhone = employee.whatsappPhone.trim();
        const opts: Intl.DateTimeFormatOptions = {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        };
        const startStr = leave.startDate.toLocaleDateString("fr-FR", opts);
        const endStr = leave.endDate.toLocaleDateString("fr-FR", opts);
        let msg = `📋 *Nouvelle demande d'autorisation d'absence*\n\n`;
        msg += `Bonjour ${employee.firstName},\n\n`;
        msg += `Une demande d'autorisation d'absence a été enregistrée à votre nom.\n\n`;
        msg += `📅 *Période*\nDu ${startStr}\nau ${endStr}\n`;
        msg += `\n📝 *Motif*\n${leave.reason}\n`;
        msg += `\n⏳ Statut : *en attente* de validation par la RH / la hiérarchie. Vous recevrez une confirmation une fois la demande traitée.`;
        console.log("[Autorisations absence] Envoi WhatsApp vers:", rawPhone);
        await sendWhatsAppMessage(rawPhone, msg);
      } catch (e) {
        console.error("[Autorisations absence] Notification WhatsApp (création) échouée:", e);
      }
    }

    return NextResponse.json({ data: leave }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
