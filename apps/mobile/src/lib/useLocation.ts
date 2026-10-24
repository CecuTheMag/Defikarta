import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import type { LatLon } from '@defikarta/core';

export type LocationStatus = 'locating' | 'ok' | 'denied' | 'error';

/** Foreground location only. We never track in the background. */
export function useLocation() {
  const [coords, setCoords] = useState<LatLon | null>(null);
  const [status, setStatus] = useState<LocationStatus>('locating');

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return setStatus('denied');
      try {
        // Show something instantly, then refine.
        const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
        if (last && !cancelled) {
          setCoords({ lat: last.coords.latitude, lon: last.coords.longitude });
          setStatus('ok');
        }
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 15 },
          (p) => {
            setCoords({ lat: p.coords.latitude, lon: p.coords.longitude });
            setStatus('ok');
          },
        );
        if (cancelled) sub.remove();
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  return { coords, status };
}
