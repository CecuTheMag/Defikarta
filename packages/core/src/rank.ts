import { distanceM, walkMinutes } from './geo';
import { openState } from './hours';
import type { Aed, LatLon, RankedAed } from './types';

/**
 * Sort AEDs for an emergency: reachable (open or unknown) devices first, then by distance.
 * A closed device 100 m away is worth less than an open one 300 m away.
 */
export function rankAeds(aeds: Aed[], from: LatLon, at: Date = new Date()): RankedAed[] {
  return aeds
    .map((a) => {
      const d = distanceM(from, a);
      return { ...a, distanceM: d, walkMin: walkMinutes(d), open: openState(a.openingHours, at) };
    })
    .sort((x, y) => Number(x.open === 'closed') - Number(y.open === 'closed') || x.distanceM - y.distanceM);
}
