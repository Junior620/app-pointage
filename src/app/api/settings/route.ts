import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

const siteSchema = z.object({
  name: z.string().min(1),
  centerLat: z.number(),
  centerLng: z.number(),
  radiusM: z.number().int().positive(),
});

const scheduleSchema = z.object({
  siteId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  closureTime: z.string().min(1),
  lateGraceMin: z.number().int().min(0).optional(),
});

const holidaySchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  recurring: z.boolean().optional(),
});

const updateBody = z.object({
  type: z.enum(["site", "schedule", "holiday"]),
  data: z.record(z.unknown()),
});

export async function GET() {
  try {
    await requireRole(["HR", "ADMIN", "DG"]);

    const [sites, schedules, holidays] = await Promise.all([
      prisma.site.findMany({
        include: { schedules: true },
        orderBy: { name: "asc" },
      }),
      prisma.schedule.findMany({
        include: { site: true },
        orderBy: { startTime: "asc" },
      }),
      prisma.holiday.findMany({ orderBy: { date: "asc" } }),
    ]);

    return NextResponse.json({ data: { sites, schedules, holidays } });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const body = await request.json();

    const parsed = updateBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { type, data } = parsed.data;

    if (type === "site") {
      const { id, ...rest } = data as { id: string; [key: string]: unknown };
      if (!id) return NextResponse.json({ error: "ID du site requis" }, { status: 400 });

      const before = await prisma.site.findUnique({ where: { id } });
      if (!before) return NextResponse.json({ error: "Site non trouvé" }, { status: 404 });

      const site = await prisma.site.update({
        where: { id },
        data: rest,
        include: { schedules: true },
      });

      await createAuditLog({ actorId: session.id, action: "UPDATE", entity: "Site", entityId: id, before, after: site });
      return NextResponse.json({ data: site });
    }

    if (type === "schedule") {
      const { id, ...rest } = data as { id: string; [key: string]: unknown };
      if (!id) return NextResponse.json({ error: "ID du planning requis" }, { status: 400 });

      const before = await prisma.schedule.findUnique({ where: { id } });
      if (!before) return NextResponse.json({ error: "Planning non trouvé" }, { status: 404 });

      const schedule = await prisma.schedule.update({ where: { id }, data: rest });

      await createAuditLog({ actorId: session.id, action: "UPDATE", entity: "Schedule", entityId: id, before, after: schedule });
      return NextResponse.json({ data: schedule });
    }

    if (type === "holiday") {
      const { id, ...rest } = data as { id: string; [key: string]: unknown };
      if (!id) return NextResponse.json({ error: "ID du jour férié requis" }, { status: 400 });

      const before = await prisma.holiday.findUnique({ where: { id } });
      if (!before) return NextResponse.json({ error: "Jour férié non trouvé" }, { status: 404 });

      const holiday = await prisma.holiday.update({
        where: { id },
        data: {
          ...rest,
          ...(rest.date && typeof rest.date === "string" ? { date: new Date(rest.date as string) } : {}),
        },
      });

      await createAuditLog({ actorId: session.id, action: "UPDATE", entity: "Holiday", entityId: id, before, after: holiday });
      return NextResponse.json({ data: holiday });
    }

    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
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

    const parsed = updateBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { type, data } = parsed.data;

    if (type === "site") {
      const validated = siteSchema.safeParse(data);
      if (!validated.success) {
        return NextResponse.json({ error: "Données du site invalides", details: validated.error.flatten() }, { status: 400 });
      }

      const site = await prisma.site.create({ data: validated.data, include: { schedules: true } });
      await createAuditLog({ actorId: session.id, action: "CREATE", entity: "Site", entityId: site.id, after: site });
      return NextResponse.json({ data: site }, { status: 201 });
    }

    if (type === "schedule") {
      const validated = scheduleSchema.safeParse(data);
      if (!validated.success) {
        return NextResponse.json({ error: "Données du planning invalides", details: validated.error.flatten() }, { status: 400 });
      }

      const site = await prisma.site.findUnique({ where: { id: validated.data.siteId } });
      if (!site) return NextResponse.json({ error: "Site non trouvé" }, { status: 404 });

      const schedule = await prisma.schedule.create({ data: validated.data });
      await createAuditLog({ actorId: session.id, action: "CREATE", entity: "Schedule", entityId: schedule.id, after: schedule });
      return NextResponse.json({ data: schedule }, { status: 201 });
    }

    if (type === "holiday") {
      const validated = holidaySchema.safeParse(data);
      if (!validated.success) {
        return NextResponse.json({ error: "Données du jour férié invalides", details: validated.error.flatten() }, { status: 400 });
      }

      const holiday = await prisma.holiday.create({
        data: {
          name: validated.data.name,
          date: new Date(validated.data.date),
          recurring: validated.data.recurring ?? false,
        },
      });
      await createAuditLog({ actorId: session.id, action: "CREATE", entity: "Holiday", entityId: holiday.id, after: holiday });
      return NextResponse.json({ data: holiday }, { status: 201 });
    }

    return NextResponse.json({ error: "Type invalide" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireRole(["HR", "ADMIN"]);
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json({ error: "type et id requis" }, { status: 400 });
    }

    if (type === "holiday") {
      const before = await prisma.holiday.findUnique({ where: { id } });
      if (!before) return NextResponse.json({ error: "Jour férié non trouvé" }, { status: 404 });
      await prisma.holiday.delete({ where: { id } });
      await createAuditLog({ actorId: session.id, action: "DELETE", entity: "Holiday", entityId: id, before });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Suppression non supportée pour ce type" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Non authentifié") return NextResponse.json({ error: error.message }, { status: 401 });
      if (error.message === "Accès interdit") return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
