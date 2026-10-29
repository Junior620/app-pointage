import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireTenant, AuthUnavailableError, authUnavailableResponse } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { INTERNSHIP_INCLUDE } from "@/lib/internship-input";
import { dayKey } from "@/lib/interns";
import { parseDateInputForDbDate, todayDate } from "@/lib/utils";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

/** Actions de la rubrique Stagiaires (l'id est celui de l'employé). */
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend"), endDate: day }),
  z.object({ action: z.literal("end"), date: day, note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("hire") }),
]);

type RouteContext = { params: Promise<{ id: string }> };

const REACTIVATE = { active: true, departureDate: null, departureReason: null, departureNote: null } as const;

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { session, db, scope } = await requireTenant(["HR", "ADMIN"]);
    const { id } = await context.params;
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }
    const body = parsed.data;

    const before = await db.employee.findUnique({ where: { id }, include: { internship: true } });
    if (!before?.internship) {
      return NextResponse.json({ error: "Stage introuvable" }, { status: 404 });
    }
    const internship = before.internship;
    // Sortie due à la fin du stage : prolonger ou embaucher remet la personne en activité.
    const endedByInternship = !before.active && before.departureReason === "INTERNSHIP_END";
    const todayKey = dayKey(todayDate());

    let data: Prisma.EmployeeUpdateInput;
    if (body.action === "extend") {
      if (body.endDate < dayKey(internship.startDate)) {
        return NextResponse.json({ error: "La fin du stage doit être après son début." }, { status: 400 });
      }
      data = {
        internship: { update: { endDate: parseDateInputForDbDate(body.endDate), endReminderSentAt: null } },
        ...(endedByInternship && body.endDate >= todayKey ? REACTIVATE : {}),
      };
    } else if (body.action === "end") {
      if (!before.active) {
        return NextResponse.json({ error: "Ce stagiaire est déjà sorti." }, { status: 400 });
      }
      if (body.date < dayKey(internship.startDate)) {
        return NextResponse.json({ error: "La date de fin doit être après le début du stage." }, { status: 400 });
      }
      const date = parseDateInputForDbDate(body.date);
      data = {
        active: false,
        departureDate: date,
        departureReason: "INTERNSHIP_END",
        departureNote: body.note || "Fin de stage",
        // Sortie anticipée : l'attestation reprend la date réelle de fin.
        ...(body.date < dayKey(internship.endDate) ? { internship: { update: { endDate: date } } } : {}),
      };
    } else {
      if (before.kind === "EMPLOYEE") {
        return NextResponse.json({ error: "Cette personne est déjà employée." }, { status: 400 });
      }
      data = { kind: "EMPLOYEE", ...(endedByInternship ? REACTIVATE : {}) };
    }

    const employee = await db.employee.update({
      where: { id },
      data,
      include: { internship: { include: INTERNSHIP_INCLUDE } },
    });

    await createAuditLog(scope, {
      actorId: session.id,
      action: body.action === "hire" ? "HIRE_INTERN" : body.action === "end" ? "END_INTERNSHIP" : "EXTEND_INTERNSHIP",
      entity: "Employee",
      entityId: id,
      before,
      after: employee,
    });

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
