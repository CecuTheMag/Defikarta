import type { LatLon } from './types';

const EARTH_RADIUS_M = 6_371_008.8;
/** ~4.5 km/h: a brisk walk carrying a device, deliberately not a sprint. */
export const WALK_M_PER_MIN = 75;
/** Rough ratio between real walking route length and straight-line distance in a city grid. */
export const ROUTE_FACTOR = 1.3;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimated walking minutes for a straight-line distance (rounded up, min 1). */
export function walkMinutes(straightLineM: number): number {
  return Math.max(1, Math.ceil((straightLineM * ROUTE_FACTOR) / WALK_M_PER_MIN));
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} м`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',')} км`;
}
