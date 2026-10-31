import { STARA_ZAGORA_CENTER, type LatLon, type RankedAed } from '@defikarta/core';
import { StyleSheet } from 'react-native';
import { colors } from '@/theme';
import { LeafletMap, type Pin } from './LeafletMap';

const ring = { open: colors.green, closed: colors.red, unknown: '#F79009' } as const;

export function AedMap({ aeds, coords, selected, onSelect, focus, padBottom }: { aeds: RankedAed[]; coords: LatLon | null; selected?: string; onSelect?: (id: string) => void; focus?: (LatLon & { zoom?: number }) | null; padBottom?: number }) {
  const pins: Pin[] = aeds.map((a) => ({ id: a.id, kind: 'aed', lat: a.lat, lon: a.lon, color: ring[a.open], selected: a.id === selected }));
  if (coords) pins.push({ id: 'me', kind: 'me', ...coords });
  return <LeafletMap style={StyleSheet.absoluteFill} center={coords ?? STARA_ZAGORA_CENTER} pins={pins} focus={focus} padBottom={padBottom} onPinPress={(id) => id !== 'me' && onSelect?.(id)} />;
}
