import { distanceM, ROUTE_FACTOR, WALK_M_PER_MIN } from './geo';
import { openState } from './hours';
import type { Aed, LatLon } from './types';

export type CoverageScenario = 'now' | 'weekday' | 'night' | 'always';

/** A fixed moment per scenario so the heatmap is reproducible. 2026-10-21 is a Wednesday. */
export function scenarioDate(s: CoverageScenario, now = new Date()): Date {
  if (s === 'weekday') return new Date('2026-10-21T10:00:00');
  if (s === 'night') return new Date('2026-10-21T03:00:00');
  return now;
}

/** Is the device usable in this scenario? 'always' keeps only verified 24/7 devices. */
export function reachable(a: Aed, s: CoverageScenario, now = new Date()): boolean {
  if (s === 'always') return /^\s*24\/7\s*$/.test(a.openingHours ?? '');
  return openState(a.openingHours, scenarioDate(s, now)) !== 'closed';
}

export interface CoverageCell extends LatLon {
  /** Walking minutes to the nearest reachable AED; null = none. */
  min: number | null;
}

export interface CoverageResult {
  cells: CoverageCell[];
  stepM: number;
  /** Share of cells within 5 walking minutes of an AED, 0..1. */
  within5: number;
}

const M_PER_DEG_LAT = 111_320;

/** Grid of cells over the bbox [south, west, north, east] with the walking minutes to the nearest AED. */
export function coverageGrid(bbox: [number, number, number, number], aeds: Aed[], scenario: CoverageScenario, stepM = 200, now = new Date()): CoverageResult {
  const [s, w, n, e] = bbox;
  const usable = aeds.filter((a) => reachable(a, scenario, now));
  const dLat = stepM / M_PER_DEG_LAT;
  const cells: CoverageCell[] = [];
  let within = 0;
  for (let lat = s + dLat / 2; lat < n; lat += dLat) {
    const dLon = stepM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    for (let lon = w + dLon / 2; lon < e; lon += dLon) {
      let best = Infinity;
      for (const a of usable) best = Math.min(best, distanceM({ lat, lon }, a));
      const min = Number.isFinite(best) ? Math.ceil((best * ROUTE_FACTOR) / WALK_M_PER_MIN) : null;
      if (min !== null && min <= 5) within++;
      cells.push({ lat, lon, min });
    }
  }
  return { cells, stepM, within5: cells.length ? within / cells.length : 0 };
}

export interface Placement extends LatLon {
  name: string;
  /** Extra cells that would fall within 5 minutes. */
  gainCells: number;
}

/** Greedy maximal coverage: repeatedly add the candidate site that covers the most currently uncovered cells. */
export function recommendPlacements(cells: CoverageCell[], candidates: (LatLon & { name: string })[], count = 5): Placement[] {
  const radiusM = (5 * WALK_M_PER_MIN) / ROUTE_FACTOR;
  const uncovered = cells.filter((c) => c.min === null || c.min > 5);
  const covered = new Set<CoverageCell>();
  const out: Placement[] = [];
  const pool = [...candidates];
  for (let i = 0; i < count && pool.length; i++) {
    let best = -1;
    let bestGain = 0;
    pool.forEach((c, idx) => {
      let gain = 0;
      for (const cell of uncovered) if (!covered.has(cell) && distanceM(c, cell) <= radiusM) gain++;
      if (gain > bestGain) {
        bestGain = gain;
        best = idx;
      }
    });
    if (best < 0) break;
    const [pick] = pool.splice(best, 1);
    for (const cell of uncovered) if (distanceM(pick!, cell) <= radiusM) covered.add(cell);
    out.push({ lat: pick!.lat, lon: pick!.lon, name: pick!.name, gainCells: bestGain });
  }
  return out;
}
