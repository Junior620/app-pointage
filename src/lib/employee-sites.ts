import type { Site } from "@prisma/client";

type EmployeeWithSites = {
  site: Site | null;
  checkoutSite: Site | null;
};

/** Jusqu'à 2 zones : pointage accepté si l'employé est dans l'une ou l'autre (tous types de pointage). */
export function getEmployeeWorkSites(employee: EmployeeWithSites): Site[] {
  const sites: Site[] = [];
  if (employee.site) sites.push(employee.site);
  if (
    employee.checkoutSite &&
    employee.checkoutSite.id !== employee.site?.id
  ) {
    sites.push(employee.checkoutSite);
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
