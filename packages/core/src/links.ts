import type { LatLon } from './types';

/** Walking directions in OpenStreetMap (OSRM foot profile). No API key, works on web and mobile. */
export function osmWalkingUrl(from: LatLon | null, to: LatLon): string {
  const route = `${from ? `${from.lat},${from.lon}` : ''};${to.lat},${to.lon}`;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${encodeURIComponent(route)}`;
}

/** Hand off to the platform's maps app (Apple/Google), which gives turn-by-turn walking. */
export function nativeWalkingUrl(platform: 'ios' | 'android' | 'web', to: LatLon): string {
  if (platform === 'ios') return `http://maps.apple.com/?daddr=${to.lat},${to.lon}&dirflg=w`;
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lon}&travelmode=walking`;
}
