import { z } from "zod";
import type { Db } from "./tenant";
import { parseDateInputForDbDate } from "./utils";

/** Fiche de stage envoyée par le formulaire employé (création ou modification). */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();

export const internshipInputSchema = z
  .object({
    startDate: day,
    endDate: day,
    school: z.string().trim().min(1, "L'école est requise").max(160),
    fieldOfStudy: optionalText(160),
    level: optionalText(80),
    supervisorId: z.union([z.string(), z.null()]).optional(),
    monthlyAllowance: z.union([z.number().int().min(0).max(100_000_000), z.null()]).optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "La fin du stage doit être le même jour que le début ou après.",
    path: ["endDate"],
  });

export type InternshipInput = z.infer<typeof internshipInputSchema>;

export class InternshipInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InternshipInputError";
  }
}

/** Encadrant affiché avec la fiche de stage. */
export const INTERNSHIP_INCLUDE = {
  supervisor: { select: { id: true, firstName: true, lastName: true, matricule: true } },
} as const;

/** Données Prisma de la fiche : jours calendaires, encadrant vérifié dans l'entreprise courante. */
export async function internshipData(db: Db, input: InternshipInput, employeeId?: string) {
  const supervisorId = input.supervisorId?.trim() || null;
  if (supervisorId) {
    if (supervisorId === employeeId) throw new InternshipInputError("Un stagiaire ne peut pas être son propre encadrant.");
    // tenantDb : un employé d'une autre entreprise est introuvable.
    const supervisor = await db.employee.findUnique({ where: { id: supervisorId }, select: { id: true } });
    if (!supervisor) throw new InternshipInputError("Encadrant introuvable.");
  }
  return {
    startDate: parseDateInputForDbDate(input.startDate),
    endDate: parseDateInputForDbDate(input.endDate),
    school: input.school.trim(),
    fieldOfStudy: input.fieldOfStudy?.trim() || null,
    level: input.level?.trim() || null,
    supervisorId,
    monthlyAllowance: input.monthlyAllowance ?? null,
  };
}
