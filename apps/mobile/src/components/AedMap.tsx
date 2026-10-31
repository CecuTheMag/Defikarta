import { STARA_ZAGORA_CENTER, type LatLon, type RankedAed } from '@defikarta/core';
import { StyleSheet } from 'react-native';
import { LeafletMap, type Pin } from './LeafletMap';

const color = { open: '#1E7B34', closed: '#C8102E', unknown: '#C77700' } as const;

export function AedMap({ aeds, coords }: { aeds: RankedAed[]; coords: LatLon | null }) {
  const pins: Pin[] = aeds.map((a) => ({ id: a.id, lat: a.lat, lon: a.lon, color: color[a.open], text: '⚡', label: [a.name, a.locationHint].filter(Boolean).join('\n') }));
  if (coords) pins.push({ id: 'me', ...coords, color: '#1A73E8', size: 20 });
  return <LeafletMap style={StyleSheet.absoluteFill} center={coords ?? STARA_ZAGORA_CENTER} pins={pins} />;
}
