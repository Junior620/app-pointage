"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { NAV_GROUPS, isNavLinkActive } from "@/lib/navigation";
import { useNavCounts } from "@/lib/use-nav-counts";
import BrandMark from "@/components/brand/BrandMark";
import CoBrand from "@/components/brand/CoBrand";

interface SidebarProps {
  userRole: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function SidebarContent({ userRole, onNavigate }: { userRole: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const counts = useNavCounts();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark className="h-10 w-10" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold leading-tight text-white">{APP_NAME}</p>
          <p className="truncate text-xs text-slate-400">{APP_TAGLINE}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
        {NAV_GROUPS.map((group) => {
          const links = group.links.filter((l) => !l.adminOnly || userRole === "ADMIN");
          if (links.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {links.map((link) => {
                  const Icon = link.icon;
                  const active = isNavLinkActive(pathname, link.href);
                  const count = link.countKey && counts ? counts[link.countKey] : 0;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                          active
                            ? "bg-brand-600 text-white shadow-sm shadow-brand-950/40"
                            : "text-slate-300 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0",
                            active ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                          )}
                        />
                        <span className="flex-1 truncate" title={link.menuLabel ? link.label : undefined}>
                          {link.menuLabel ?? link.label}
                        </span>
                        {count > 0 && (
                          <span
                            className={cn(
                              "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums",
                              active ? "bg-white/20 text-white" : "bg-amber-400/15 text-amber-300"
                            )}
                            aria-label={`${count} à traiter`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Structures</p>
        <CoBrand onDark size="sm" />
      </div>
    </div>
  );
}

export default function Sidebar({ userRole, mobileOpen, onMobileClose }: SidebarProps) {
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    drawerRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Mobile : panneau coulissant */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-ink-950/60 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        id="mobile-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 transform bg-ink-900 transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Menu"
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        <button
          type="button"
          onClick={onMobileClose}
          className="absolute right-3 top-5 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          aria-label="Fermer le menu"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent userRole={userRole} onNavigate={onMobileClose} />
      </aside>

      {/* Bureau : colonne fixe */}
      <aside className="hidden border-r border-white/5 bg-ink-900 lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <SidebarContent userRole={userRole} />
      </aside>
    </>
  );
}
