import { redirect } from "next/navigation";
import { AuthUnavailableError, getSession, type SessionUser } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";
import AuthUnavailable from "@/components/layout/AuthUnavailable";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: SessionUser | null;
  try {
    session = await getSession();
  } catch (error) {
    // Supabase injoignable : la session est peut-être valide, on ne renvoie pas vers /login.
    if (error instanceof AuthUnavailableError) return <AuthUnavailable />;
    throw error;
  }

  if (!session) {
    redirect("/login");
  }

  return (
    <DashboardShell userName={session.name} userEmail={session.email} userRole={session.role}>
      {children}
    </DashboardShell>
  );
}
