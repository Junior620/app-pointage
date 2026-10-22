import { NextRequest, NextResponse } from "next/server";
import { findEmployeeByWhatsappPhone } from "@/lib/employee-whatsapp";
import { verifyGeolocLink } from "@/lib/geoloc-link";
import { orgForEmployeeRequest, WRONG_ORG_LINK_MESSAGE } from "@/lib/tenant";

/**
 * Contexte de la page /geoloc, lu avant de demander la position :
 * vérifie le lien signé et renvoie prénom + structure (logo affiché à l'employé).
 * Aucune donnée n'est renvoyée sans signature valide.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const phone = sp.get("phone") ?? "";
  const action = sp.get("action") ?? "";

  const link = verifyGeolocLink({ phone, action, exp: sp.get("exp"), sig: sp.get("sig") });
  if (!phone || !link.ok) {
    return NextResponse.json(
      { error: link.ok ? "Lien de pointage invalide." : link.message },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const employee = await findEmployeeByWhatsappPhone(phone);
  if (!employee || !employee.active) {
    return NextResponse.json(
      { error: "Ce numéro n'est rattaché à aucun employé actif. Contactez les RH." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const org = await orgForEmployeeRequest(employee.organizationId, request);
  if (!org) {
    return NextResponse.json(
      { error: WRONG_ORG_LINK_MESSAGE },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      firstName: employee.firstName,
      structure: employee.structure,
      whatsappNumber: process.env.WHATSAPP_BUSINESS_PHONE?.trim() || null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
