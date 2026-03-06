import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  supabaseId: string;
  email: string;
  name: string;
  role: Role;
};

export async function getSession(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

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
