import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ⚠️ Onboarding désactivé : les employés ne peuvent plus lier eux‑mêmes leur numéro WhatsApp.
// Le numéro doit être saisi directement par un ADMIN ou un RH dans la fiche employé.

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(
      { error: "Onboarding désactivé. Veuillez contacter le service RH." },
      { status: 403 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
