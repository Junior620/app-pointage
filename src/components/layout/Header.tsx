"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { findNavLink, roleLabel } from "@/lib/navigation";
import { APP_TIMEZONE } from "@/lib/timezone";

interface HeaderProps {
  userName: string;
  userRole: string;
}

function formatToday(): string {
  const s = new Date().toLocaleDateString("fr-FR", {
    timeZone: APP_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const noopSubscribe = () => () => {};

/** Date du jour au fuseau métier, calculée seulement côté navigateur (évite l'écart serveur UTC / client). */
function useTodayLabel(): string {
  return useSyncExternalStore(noopSubscribe, formatToday, () => "");
}

export default function Header({ userName, userRole }: HeaderProps) {
  const pathname = usePathname();
  const today = useTodayLabel();

  const link = findNavLink(pathname);
  const title = link && !(link.adminOnly && userRole !== "ADMIN") ? link.label : "Pointage RH";

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8">
      <div className="lg:pl-0 pl-12">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 text-sm text-slate-500">
          <CalendarDays className="h-4 w-4" />
          {today}
        </div>
        <div className="h-8 w-px bg-slate-200 hidden md:block" />
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-700">{userName}</p>
            <p className="text-xs text-slate-500">{roleLabel(userRole)}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
