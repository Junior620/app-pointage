import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CalendarOff,
  MapPin,
  Settings,
  FileBarChart,
  Clock,
  Coffee,
  UserCog,
} from "lucide-react";

/** Clé des compteurs « à traiter » renvoyés par GET /api/nav-counts. */
export type NavCountKey = "overtime" | "leaves" | "missions";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  countKey?: NavCountKey;
};

export type NavGroup = {
  label: string;
  links: NavLink[];
};

/** Source unique du menu latéral, du fil d'Ariane et des titres de page. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Pilotage",
    links: [
      { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/reports", label: "Rapports", icon: FileBarChart },
    ],
  },
  {
    label: "Présences",
    links: [
      { href: "/attendance", label: "Pointages", icon: ClipboardCheck },
      { href: "/breaks", label: "Pauses", icon: Coffee },
      { href: "/overtime", label: "Heures sup", icon: Clock, countKey: "overtime" },
    ],
  },
  {
    label: "Demandes",
    links: [
      { href: "/leaves", label: "Autorisations d'absence", icon: CalendarOff, countKey: "leaves" },
      { href: "/missions", label: "Missions", icon: MapPin, countKey: "missions" },
    ],
  },
  {
    label: "Administration",
    links: [
      { href: "/employees", label: "Employés", icon: Users },
      { href: "/users", label: "Utilisateurs", icon: UserCog, adminOnly: true },
      { href: "/settings", label: "Paramètres", icon: Settings },
    ],
  },
];

export const NAV_LINKS: NavLink[] = NAV_GROUPS.flatMap((g) => g.links);

export function isNavLinkActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Lien de menu correspondant à la page courante (le plus spécifique). */
export function findNavLink(pathname: string): NavLink | undefined {
  return NAV_LINKS.filter((l) => isNavLinkActive(pathname, l.href)).sort(
    (a, b) => b.href.length - a.href.length
  )[0];
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  HR: "Ressources humaines",
  DG: "Direction générale",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
