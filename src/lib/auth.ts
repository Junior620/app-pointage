import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { AUTH_UNAVAILABLE_MESSAGE, checkUser } from "@/lib/supabase/check-user";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg, tenantDb, type OrgInfo, type TenantDb, type TenantScope } from "@/lib/tenant";
import type { Role } from "@prisma/client";

/** Routes API : `if (error instanceof AuthUnavailableError) return authUnavailableResponse();` → 503. */
export { authUnavailableResponse } from "@/lib/supabase/check-user";

/** Supabase Auth injoignable : la session n'a pas pu être vérifiée, ce qui ne veut pas dire « non connecté ». */
export class AuthUnavailableError extends Error {
  constructor() {
    super(AUTH_UNAVAILABLE_MESSAGE);
    this.name = "AuthUnavailableError";
  }
}

export type SessionUser = {
  id: string;
  supabaseId: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organization: OrgInfo;
};

/**
 * État de la connexion pour l'adresse ouverte :
 * - "anonymous" : pas de session Supabase ;
 * - "unknown" : session sans compte actif dans l'application ;
 * - "wrong-org" : compte d'une autre entreprise que celle de l'adresse (sous-domaine).
 * Lève `AuthUnavailableError` si Supabase Auth ne répond pas : aucun de ces états n'est alors établi.
 */
export type SessionState =
  | { status: "ok"; session: SessionUser }
  | { status: "anonymous" | "unknown" | "wrong-org" };

export const getSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();
  const auth = await checkUser(supabase);

  if (auth.status === "unavailable") throw new AuthUnavailableError();
  if (auth.status === "anonymous") return { status: "anonymous" };
  const supabaseUser = auth.user;

  const user = await prisma.user.findUnique({
    where: { supabaseAuthId: supabaseUser.id },
  });

  if (!user || !user.active) return { status: "unknown" };

  const org = await getCurrentOrg();
  if (!org || org.id !== user.organizationId) return { status: "wrong-org" };

  return {
    status: "ok",
    session: {
      id: user.id,
      supabaseId: supabaseUser.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organization: org,
    },
  };
});

/** Session valide pour l'entreprise de l'adresse ouverte, sinon null ; lève `AuthUnavailableError` si Supabase Auth ne répond pas. */
export async function getSession(): Promise<SessionUser | null> {
  const state = await getSessionState();
  return state.status === "ok" ? state.session : null;
}

export function checkRole(userRole: Role, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(userRole);
}

export async function requireRole(requiredRoles: Role[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new Error("Non authentifié");
  }
  if (!checkRole(session.role, requiredRoles)) {
    throw new Error("Accès interdit");
  }
  return session;
}

/** Session + entreprise + accès aux données limité à cette entreprise. */
export async function requireTenant(
  requiredRoles: Role[]
): Promise<{ session: SessionUser; org: OrgInfo; db: TenantDb; scope: TenantScope }> {
  const session = await requireRole(requiredRoles);
  const db = tenantDb(session.organizationId);
  return { session, org: session.organization, db, scope: { organizationId: session.organizationId, db } };
}
