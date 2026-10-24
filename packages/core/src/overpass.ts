import type { Aed } from './types';

/** Stara Zagora city + surroundings: south, west, north, east. */
export const STARA_ZAGORA_BBOX: [number, number, number, number] = [42.37, 25.55, 42.47, 25.72];
export const STARA_ZAGORA_CENTER = { lat: 42.4258, lon: 25.6345 };

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export function overpassQuery(bbox = STARA_ZAGORA_BBOX): string {
  return `[out:json][timeout:25];nwr["emergency"="defibrillator"](${bbox.join(',')});out center tags;`;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function parseOverpass(json: { elements?: OverpassElement[] }): Aed[] {
  const out: Aed[] = [];
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const t = el.tags ?? {};
    out.push({
      id: `osm:${el.type}/${el.id}`,
      source: 'osm',
      lat,
      lon,
      name: t['name:bg'] ?? t.name ?? t.operator ?? 'Дефибрилатор',
      locationHint: t['defibrillator:location:bg'] ?? t['defibrillator:location'] ?? t.description,
      openingHours: t.opening_hours,
      access: t.access,
      indoor: t.indoor ? t.indoor !== 'no' : undefined,
      verifiedAt: t.check_date ?? t['survey:date'],
    });
  }
  return out;
}

/** Fetch AEDs from OpenStreetMap. Throws on network/HTTP errors so callers can fall back to cache. */
export async function fetchOsmAeds(bbox = STARA_ZAGORA_BBOX, fetchImpl: typeof fetch = fetch): Promise<Aed[]> {
  const res = await fetchImpl(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(overpassQuery(bbox)),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return parseOverpass(await res.json());
}

/** OSM wins over seed when both describe a device at (nearly) the same spot. */
export function mergeAeds(osm: Aed[], seed: Aed[], dedupeM = 40): Aed[] {
  const close = (a: Aed, b: Aed) =>
    Math.abs(a.lat - b.lat) * 111_000 < dedupeM && Math.abs(a.lon - b.lon) * 82_000 < dedupeM;
  return [...osm, ...seed.filter((s) => !osm.some((o) => close(o, s)))];
}
