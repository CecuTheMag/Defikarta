import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchOsmAeds, mergeAeds, SEED_AEDS, type Aed } from '@defikarta/core';
import { useEffect, useState } from 'react';

const CACHE_KEY = 'aeds:v1';

/**
 * Seed data shows immediately, the last good OSM download comes from cache (works offline),
 * and a fresh OSM download replaces both when the network allows.
 */
export function useAeds() {
  const [aeds, setAeds] = useState<Aed[]>(SEED_AEDS);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached && !cancelled) {
          const { osm, at } = JSON.parse(cached) as { osm: Aed[]; at: string };
          setAeds(mergeAeds(osm, SEED_AEDS));
          setUpdatedAt(at);
        }
      } catch {
        // Corrupt cache: ignore, seed is already shown.
      }
      try {
        const osm = await fetchOsmAeds();
        const at = new Date().toISOString();
        if (cancelled) return;
        setAeds(mergeAeds(osm, SEED_AEDS));
        setUpdatedAt(at);
        setOffline(false);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ osm, at }));
      } catch {
        if (!cancelled) setOffline(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { aeds, updatedAt, offline };
}
