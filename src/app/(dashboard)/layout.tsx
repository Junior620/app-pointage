import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        userName={session.name}
        userRole={session.role}
        userEmail={session.email}
      />

      <div className="lg:pl-64">
        <Header userName={session.name} userRole={session.role} />
        <main className="p-6 lg:p-8 text-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}
