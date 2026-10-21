"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronRight, LogOut, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAV_GROUPS, findNavLink, roleLabel } from "@/lib/navigation";
import { APP_TIMEZONE } from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface HeaderProps {
  userName: string;
  userEmail: string;
  userRole: string;
  onMenuClick: () => void;
  menuOpen: boolean;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function UserMenu({ userName, userEmail, userRole }: Pick<HeaderProps, "userName" | "userEmail" | "userRole">) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
          {initials(userName)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[160px] truncate text-sm font-medium text-slate-800">{userName}</span>
          <span className="block text-xs text-slate-500">{roleLabel(userRole)}</span>
        </span>
        <ChevronDown className={cn("hidden h-4 w-4 text-slate-400 transition-transform sm:block", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg animate-[pop-in_120ms_ease-out]"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
            <p className="truncate text-xs text-slate-500">{userEmail}</p>
            <p className="mt-1 text-xs font-medium text-brand-700">{roleLabel(userRole)}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ userName, userEmail, userRole, onMenuClick, menuOpen }: HeaderProps) {
  const pathname = usePathname();
  const today = useTodayLabel();

  const link = findNavLink(pathname);
  const allowed = link && !(link.adminOnly && userRole !== "ADMIN");
  const group = allowed ? NAV_GROUPS.find((g) => g.links.includes(link)) : undefined;
  const isSubPage = allowed && link.href !== "/" && pathname !== link.href;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          aria-label="Ouvrir le menu"
          aria-controls="mobile-sidebar"
          aria-expanded={menuOpen}
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label="Fil d'Ariane" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            {group && group.label !== "Pilotage" && (
              <li className="hidden items-center gap-1.5 text-slate-400 md:flex">
                {group.label}
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
            )}
            {allowed ? (
              <li className="flex min-w-0 items-center gap-1.5">
                {isSubPage ? (
                  <>
                    <Link href={link.href} className="truncate text-slate-500 hover:text-slate-800">
                      {link.label}
                    </Link>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="font-semibold text-slate-900">Fiche</span>
                  </>
                ) : (
                  <span className="truncate font-semibold text-slate-900">{link.label}</span>
                )}
              </li>
            ) : (
              <li className="font-semibold text-slate-900">Pointage RH</li>
            )}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {today && (
          <div className="hidden items-center gap-2 text-sm text-slate-500 md:flex">
            <CalendarDays className="h-4 w-4" />
            {today}
          </div>
        )}
        <div className="hidden h-8 w-px bg-slate-200 md:block" />
        <UserMenu userName={userName} userEmail={userEmail} userRole={userRole} />
      </div>
    </header>
  );
}
