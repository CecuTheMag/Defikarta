import { fetchOsmAeds, mergeAeds, rankAeds, SEED_AEDS, type Aed, type LatLon, type RankedAed } from '@defikarta/core';
import { useEffect, useMemo, useState } from 'react';

const CACHE_KEY = 'aeds:v1';

function readCache(): Aed[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw).osm as Aed[]) : null;
  } catch {
    return null;
  }
}

/** Same strategy as the mobile app: seed → cached OSM → fresh OSM. */
export function useAeds(coords: LatLon | null): { ranked: RankedAed[]; offline: boolean } {
  const [aeds, setAeds] = useState<Aed[]>(() => mergeAeds(readCache() ?? [], SEED_AEDS));
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOsmAeds()
      .then((osm) => {
        if (cancelled) return;
        setAeds(mergeAeds(osm, SEED_AEDS));
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ osm, at: new Date().toISOString() }));
        } catch {
          // Storage blocked (private mode): fine, we just won't work offline.
        }
      })
      .catch(() => !cancelled && setOffline(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const ranked = useMemo(
    () => (coords ? rankAeds(aeds, coords) : aeds.map((a) => ({ ...a, distanceM: NaN, walkMin: NaN, open: 'unknown' as const }))),
    [aeds, coords],
  );
  return { ranked, offline };
}

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unsupported';

export function useGeolocation() {
  const [coords, setCoords] = useState<LatLon | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');

  useEffect(() => {
    if (!('geolocation' in navigator)) return setStatus('unsupported');
    setStatus('locating');
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lon: p.coords.longitude });
        setStatus('ok');
      },
      (e) => setStatus(e.code === e.PERMISSION_DENIED ? 'denied' : 'idle'),
      { enableHighAccuracy: true, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { coords, status };
}
