import { fetchOsmAeds, mergeAeds, openState, rankAeds, SEED_AEDS, type Aed, type LatLon, type RankedAed } from '@defikarta/core';
import { useEffect, useMemo, useState } from 'react';

const CACHE_KEY = 'aeds:v2';

interface Cached {
  osm: Aed[];
  local: Aed[];
}

function readCache(): Cached {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : { osm: [], local: [] };
  } catch {
    return { osm: [], local: [] };
  }
}

function writeCache(c: Cached) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...c, at: new Date().toISOString() }));
  } catch {
    // Storage blocked (private mode): fine, we just won't work offline.
  }
}

/**
 * Strategy (BLUEPRINT §11): seed → cache → fresh, from two sources.
 * OSM is the source of truth; our API adds verified local records not in OSM yet. Every point is a real device; see README → AED data.
 * If the API is unreachable, the bundled seed keeps the map useful offline.
 */
export function useAeds(coords: LatLon | null): { ranked: RankedAed[]; offline: boolean } {
  const [data, setData] = useState<Cached>(readCache);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let osmOk = true;
    let apiOk = true;
    const update = (patch: Partial<Cached>) =>
      setData((d) => {
        const next = { ...d, ...patch };
        writeCache(next);
        return next;
      });
    const finish = () => !cancelled && setOffline(!osmOk && !apiOk);
    fetchOsmAeds()
      .then((osm) => !cancelled && update({ osm }))
      .catch(() => (osmOk = false))
      .finally(finish);
    fetch('/api/aeds')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { aeds?: Aed[] }) => (Array.isArray(j?.aeds) ? !cancelled && update({ local: j.aeds }) : Promise.reject(new Error('bad /api/aeds'))))
      .catch(() => (apiOk = false))
      .finally(finish);
    return () => {
      cancelled = true;
    };
  }, []);

  const aeds = useMemo(() => mergeAeds(data.osm, data.local.length ? data.local : SEED_AEDS), [data]);
  const ranked = useMemo(
    () => (coords ? rankAeds(aeds, coords) : aeds.map((a) => ({ ...a, distanceM: NaN, walkMin: NaN, open: openState(a.openingHours) }))),
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
