"use client";

import { useCallback, useState, type ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

/** Cadre du dashboard : menu latéral (panneau sur mobile) + en-tête + contenu. */
export default function DashboardShell({
  userName,
  userEmail,
  userRole,
  children,
}: {
  userName: string;
  userEmail: string;
  userRole: string;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Aller au contenu
      </a>
      <Sidebar userRole={userRole} mobileOpen={mobileOpen} onMobileClose={closeMobile} />
      <div className="lg:pl-64">
        <Header
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          onMenuClick={() => setMobileOpen(true)}
          menuOpen={mobileOpen}
        />
        <main id="contenu" className="mx-auto max-w-[1600px] p-4 text-slate-900 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
