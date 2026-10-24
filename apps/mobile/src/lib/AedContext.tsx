import { rankAeds, type RankedAed } from '@defikarta/core';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAeds } from './useAeds';
import { useLocation, type LocationStatus } from './useLocation';
import type { LatLon } from '@defikarta/core';

interface AedState {
  ranked: RankedAed[];
  coords: LatLon | null;
  locationStatus: LocationStatus;
  offline: boolean;
  updatedAt: string | null;
}

const Ctx = createContext<AedState | null>(null);

/** One location watcher and one AED download for the whole app, shared by every screen. */
export function AedProvider({ children }: { children: ReactNode }) {
  const { aeds, offline, updatedAt } = useAeds();
  const { coords, status } = useLocation();
  const ranked = useMemo(() => (coords ? rankAeds(aeds, coords) : aeds.map((a) => ({ ...a, distanceM: NaN, walkMin: NaN, open: 'unknown' as const }))), [aeds, coords]);
  return <Ctx.Provider value={{ ranked, coords, locationStatus: status, offline, updatedAt }}>{children}</Ctx.Provider>;
}

export function useAedState(): AedState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAedState outside AedProvider');
  return v;
}
