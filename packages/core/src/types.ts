export interface LatLon {
  lat: number;
  lon: number;
}

/** Where an AED record came from. OSM is the long-term source of truth. */
export type AedSource = 'osm' | 'seed';

export interface Aed extends LatLon {
  /** Stable id: "osm:node/123" or "seed:<slug>". */
  id: string;
  source: AedSource;
  name: string;
  /** Where inside the building, e.g. "до охраната, вход Б" (OSM defibrillator:location). */
  locationHint?: string;
  /** Raw OSM opening_hours string, e.g. "Mo-Fr 08:00-18:00" or "24/7". */
  openingHours?: string;
  /** OSM access tag: yes | customers | private | permissive ... */
  access?: string;
  /** Indoor/outdoor if known (OSM indoor=yes/no). */
  indoor?: boolean;
  /** ISO date the team last physically checked this device; undefined = never verified. */
  verifiedAt?: string;
  /** Free-text note about the record itself (provenance, caveats). */
  note?: string;
}

export type OpenState = 'open' | 'closed' | 'unknown';

export interface RankedAed extends Aed {
  distanceM: number;
  walkMin: number;
  open: OpenState;
}
