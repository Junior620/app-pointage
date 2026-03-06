import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const onboardingSchema = z.object({
  code: z.string().min(1, "Le code est requis"),
  matricule: z.string().min(1, "Le matricule est requis"),
  dateOfBirth: z.string().min(1, "La date de naissance est requise"),
  whatsappPhone: z.string().min(1, "Le numéro WhatsApp est requis"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides", details: parsed.error.flatten() }, { status: 400 });
    }

    const { code, matricule, whatsappPhone } = parsed.data;

    const employee = await prisma.employee.findUnique({
      where: { matricule },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employé non trouvé" }, { status: 404 });
    }

    if (!employee.onboardingCode || employee.onboardingCode !== code) {
      return NextResponse.json({ error: "Code d'activation invalide" }, { status: 400 });
    }

    if (employee.onboardingExpiry && new Date() > employee.onboardingExpiry) {
      return NextResponse.json({ error: "Le code d'activation a expiré" }, { status: 400 });
    }

    if (employee.whatsappPhone) {
      return NextResponse.json({ error: "Ce compte est déjà lié à un numéro WhatsApp" }, { status: 409 });
    }

    const existingPhone = await prisma.employee.findUnique({
      where: { whatsappPhone },
    });
    if (existingPhone) {
      return NextResponse.json({ error: "Ce numéro WhatsApp est déjà utilisé" }, { status: 409 });
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        whatsappPhone,
        whatsappLinkedAt: new Date(),
        onboardingCode: null,
        onboardingExpiry: null,
      },
    });

    return NextResponse.json({
      data: {
        success: true,
        message: `Numéro WhatsApp lié avec succès pour ${employee.firstName} ${employee.lastName}.`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
