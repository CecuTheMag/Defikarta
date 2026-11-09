import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchOsmAeds, mergeAeds, SEED_AEDS, type Aed } from '@defikarta/core';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

const CACHE_KEY = 'aeds:v2';

interface Cached {
  osm: Aed[];
  local: Aed[];
  at: string | null;
}

/**
 * Seed data shows immediately, the last good download comes from cache (works offline),
 * and fresh data replaces it when the network allows. Two sources, as on the website:
 * OSM is the source of truth; our server adds verified local records, organisation-listed devices
 * (with their maintenance status). Every point is a real device; see README → AED data.
 */
export function useAeds() {
  const [data, setData] = useState<Cached>({ osm: [], local: [], at: null });
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let current: Cached = { osm: [], local: [], at: null };
    const update = (patch: Partial<Cached>) => {
      current = { ...current, ...patch, at: new Date().toISOString() };
      if (cancelled) return;
      setData(current);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(current)).catch(() => undefined);
    };
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        const c = cached ? (JSON.parse(cached) as Cached) : null;
        if (c && Array.isArray(c.osm) && Array.isArray(c.local) && !cancelled) setData((current = c));
      } catch {
        // Corrupt cache: ignore, seed is already shown.
      }
      const [osm, local] = await Promise.allSettled([fetchOsmAeds(), api<{ aeds: Aed[] }>('/api/aeds')]);
      // Only take what is really a list: a proxy or a wrong server address can answer 200 with something else.
      const osmOk = osm.status === 'fulfilled' && Array.isArray(osm.value);
      const localOk = local.status === 'fulfilled' && Array.isArray(local.value?.aeds);
      if (osmOk) update({ osm: osm.value });
      if (localOk) update({ local: local.value.aeds });
      if (!cancelled) setOffline(!osmOk && !localOk);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const aeds = useMemo(() => mergeAeds(data.osm, data.local.length ? data.local : SEED_AEDS), [data]);
  return { aeds, updatedAt: data.at, offline };
}
