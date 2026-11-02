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
        if (cached && !cancelled) setData((current = JSON.parse(cached) as Cached));
      } catch {
        // Corrupt cache: ignore, seed is already shown.
      }
      const [osm, local] = await Promise.allSettled([fetchOsmAeds(), api<{ aeds: Aed[] }>('/api/aeds')]);
      if (osm.status === 'fulfilled') update({ osm: osm.value });
      if (local.status === 'fulfilled') update({ local: local.value.aeds });
      if (!cancelled) setOffline(osm.status === 'rejected' && local.status === 'rejected');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const aeds = useMemo(() => mergeAeds(data.osm, data.local.length ? data.local : SEED_AEDS), [data]);
  return { aeds, updatedAt: data.at, offline };
}
