import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth";
import DashboardShell from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = await getSessionState();

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
