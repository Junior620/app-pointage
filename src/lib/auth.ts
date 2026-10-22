import { createClient } from "@/lib/supabase/server";
import { AUTH_UNAVAILABLE_MESSAGE, checkUser } from "@/lib/supabase/check-user";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

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
};

/** `null` si aucune session valide ; lève `AuthUnavailableError` si Supabase Auth ne répond pas. */
export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const auth = await checkUser(supabase);

  if (auth.status === "unavailable") throw new AuthUnavailableError();
  if (auth.status === "anonymous") return null;
  const supabaseUser = auth.user;

  const user = await prisma.user.findUnique({
    where: { supabaseAuthId: supabaseUser.id },
  });

  if (!user || !user.active) return null;

  return {
    id: user.id,
    supabaseId: supabaseUser.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
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
