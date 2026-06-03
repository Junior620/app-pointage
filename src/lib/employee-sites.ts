import type { Site } from "@prisma/client";

type EmployeeWithSites = {
  site: Site | null;
  checkoutSite: Site | null;
};

function isSiteEligible(site: Site | null): site is Site {
  return Boolean(site && site.active);
}

/** Jusqu'à 2 zones actives : pointage accepté si l'employé est dans l'une ou l'autre. */
export function getEmployeeWorkSites(employee: EmployeeWithSites): Site[] {
  const sites: Site[] = [];
  const seen = new Set<string>();

  for (const site of [employee.site, employee.checkoutSite]) {
    if (!isSiteEligible(site) || seen.has(site.id)) continue;
    seen.add(site.id);
    sites.push(site);
  }
  return sites;
}

export function findMatchingWorkSite(
  employee: EmployeeWithSites,
  point: { lat: number; lng: number },
  isWithinZoneFn: (
    point: { lat: number; lng: number },
    center: { lat: number; lng: number },
    radiusM: number
  ) => boolean,
  haversineDistanceFn: (
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ) => number
): { allowed: boolean; distance: number } {
  const sites = getEmployeeWorkSites(employee);
  if (sites.length === 0) {
    return { allowed: false, distance: -1 };
  }

  let nearestDistance = Infinity;

  for (const site of sites) {
    const center = { lat: site.centerLat, lng: site.centerLng };
    const distance = haversineDistanceFn(point, center);
    if (distance < nearestDistance) nearestDistance = distance;
    if (isWithinZoneFn(point, center, site.radiusM)) {
      return { allowed: true, distance: Math.round(distance) };
    }
  }

  return { allowed: false, distance: Math.round(nearestDistance) };
}
