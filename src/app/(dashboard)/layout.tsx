import { redirect } from "next/navigation";
import { AuthUnavailableError, getSessionState, type SessionState } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";
import AuthUnavailable from "@/components/layout/AuthUnavailable";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let state: SessionState;
  try {
    state = await getSessionState();
  } catch (error) {
    // Supabase injoignable : la session est peut-être valide, on ne renvoie pas vers /login.
    if (error instanceof AuthUnavailableError) return <AuthUnavailable />;
    throw error;
  }

  if (state.status !== "ok") {
    redirect(state.status === "wrong-org" ? "/login?erreur=entreprise" : "/login");
  }
  const { session } = state;

  return (
    <DashboardShell userName={session.name} userEmail={session.email} userRole={session.role}>
      {children}
    </DashboardShell>
  );
}
