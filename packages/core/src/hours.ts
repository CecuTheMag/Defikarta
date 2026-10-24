import OpeningHours from 'opening_hours';
import type { OpenState } from './types';

const ALWAYS = /^\s*24\/7\s*$/;

/**
 * Is a device reachable right now according to its OSM opening_hours?
 * Unparseable or missing values are 'unknown', never 'open': in an emergency
 * we must not promise access we cannot back up.
 */
export function openState(openingHours: string | undefined, at: Date = new Date()): OpenState {
  if (!openingHours) return 'unknown';
  if (ALWAYS.test(openingHours)) return 'open';
  try {
    // Bulgaria for public holidays.
    const oh = new OpeningHours(openingHours, { lat: 42.42, lon: 25.63, address: { country_code: 'bg', state: '' } });
    if (oh.getUnknown(at)) return 'unknown';
    return oh.getState(at) ? 'open' : 'closed';
  } catch {
    return 'unknown';
  }
}

export function openLabel(state: OpenState): string {
  return { open: 'Отворено сега', closed: 'Затворено сега', unknown: 'Часове неизвестни' }[state];
}
