import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { createSupabaseAdminClient } from "./supabase/admin";
import { normalizeUserWhatsappPhone } from "./rh-whatsapp-notify";

export class DashboardUserError extends Error {
  constructor(
    message: string,
    public code: "EMAIL_EXISTS" | "WEAK_PASSWORD" | "CONFIG" | "UNKNOWN"
  ) {
    super(message);
    this.name = "DashboardUserError";
  }
}

export async function createDashboardUser(params: {
  email: string;
  password: string;
  name: string;
  role: Role;
  whatsappPhone?: string | null;
}) {
  const email = params.email.trim().toLowerCase();
  const name = params.name.trim();

  if (params.password.length < 8) {
    throw new DashboardUserError(
      "Le mot de passe doit contenir au moins 8 caractères.",
      "WEAK_PASSWORD"
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new DashboardUserError("Un compte existe déjà avec cet email.", "EMAIL_EXISTS");
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    throw new DashboardUserError(
      e instanceof Error ? e.message : "Configuration Supabase manquante.",
      "CONFIG"
    );
  }

  const whatsappPhone = normalizeUserWhatsappPhone(params.whatsappPhone ?? null);
  if (whatsappPhone) {
    const conflictEmployee = await prisma.employee.findFirst({
      where: {
        OR: [
          { whatsappPhone },
          { whatsappPhone: whatsappPhone.replace(/\D/g, "") },
        ],
      },
    });
    if (conflictEmployee) {
      throw new DashboardUserError(
        "Ce numéro WhatsApp est déjà utilisé par un employé.",
        "UNKNOWN"
      );
    }
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
    user_metadata: { name, role: params.role },
  });

  if (authError) {
    const msg = authError.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered")) {
      throw new DashboardUserError("Cet email est déjà enregistré dans Supabase Auth.", "EMAIL_EXISTS");
    }
    throw new DashboardUserError(authError.message, "UNKNOWN");
  }

  const supabaseAuthId = authData.user?.id;
  if (!supabaseAuthId) {
    throw new DashboardUserError("Création Auth Supabase sans identifiant.", "UNKNOWN");
  }

  try {
    return await prisma.user.create({
      data: {
        supabaseAuthId,
        email,
        name,
        role: params.role,
        whatsappPhone,
        active: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        whatsappPhone: true,
        createdAt: true,
      },
    });
  } catch (e) {
    await supabase.auth.admin.deleteUser(supabaseAuthId).catch(() => {});
    throw e;
  }
}
