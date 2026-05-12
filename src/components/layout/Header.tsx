"use client";

import { usePathname } from "next/navigation";
import { CalendarDays } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/": "Tableau de bord",
  "/employees": "Employés",
  "/attendance": "Pointages",
  "/leaves": "Autorisations d'absence",
  "/missions": "Missions",
  "/settings": "Paramètres",
  "/reports": "Rapports",
};

interface HeaderProps {
  userName: string;
  userRole: string;
}

export default function Header({ userName, userRole }: HeaderProps) {
  const pathname = usePathname();

  const getTitle = () => {
    if (pageTitles[pathname]) return pageTitles[pathname];
    for (const [path, title] of Object.entries(pageTitles)) {
      if (path !== "/" && pathname.startsWith(path)) return title;
    }
    return "Pointage RH";
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8">
      <div className="lg:pl-0 pl-12">
        <h2 className="text-lg font-semibold text-slate-900">{getTitle()}</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays className="h-4 w-4" />
          {capitalizedDate}
        </div>
        <div className="h-8 w-px bg-slate-200 hidden md:block" />
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-700">{userName}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{userRole}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
