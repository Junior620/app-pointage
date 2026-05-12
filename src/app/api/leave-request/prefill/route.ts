import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyLeaveFormToken, leaveFormTokenExpiresInMinutes } from "@/lib/leave-form-token";

export async function GET(request: NextRequest) {
  try {
    const t = request.nextUrl.searchParams.get("t")?.trim();
    if (!t) {
      return NextResponse.json({ error: "Paramètre t manquant" }, { status: 400 });
    }

    const v = verifyLeaveFormToken(t);
    if (!v) {
      return NextResponse.json(
        { error: "Lien invalide ou expiré. Redemandez un lien depuis WhatsApp." },
        { status: 401 }
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { id: v.employeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        matricule: true,
        service: true,
        structure: true,
        active: true,
      },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
    }

    if (!employee.active) {
      return NextResponse.json(
        { error: "Votre compte est inactif. Contactez les RH." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      expiresInMinutes: leaveFormTokenExpiresInMinutes(),
      employee: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        matricule: employee.matricule,
        service: employee.service,
        structure: employee.structure,
      },
    });
  } catch (e) {
    console.error("[leave-request/prefill]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
