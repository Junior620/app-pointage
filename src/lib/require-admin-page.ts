import { redirect } from "next/navigation";
import { getSession } from "./auth";

/** Redirige vers l’accueil si l’utilisateur n’est pas administrateur. */
export async function requireAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/");
  return session;
}
