import type { GeoPoint } from "@/types";

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function isWithinZone(
  point: GeoPoint,
  center: GeoPoint,
  radiusM: number
): boolean {
  return haversineDistance(point, center) <= radiusM;
}

export function distanceToZone(
  point: GeoPoint,
  center: GeoPoint,
  radiusM: number
): { distance: number; withinZone: boolean } {
  const distance = haversineDistance(point, center);
  return { distance: Math.round(distance), withinZone: distance <= radiusM };
}
