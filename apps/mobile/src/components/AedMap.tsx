import { STARA_ZAGORA_CENTER, type LatLon, type RankedAed } from '@defikarta/core';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const pin = { open: 'green', closed: 'red', unknown: 'orange' } as const;

export function AedMap({ aeds, coords }: { aeds: RankedAed[]; coords: LatLon | null }) {
  const center = coords ?? STARA_ZAGORA_CENTER;
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={{ latitude: center.lat, longitude: center.lon, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
      showsUserLocation
      showsMyLocationButton
    >
      {aeds.map((a) => (
        <Marker
          key={a.id}
          coordinate={{ latitude: a.lat, longitude: a.lon }}
          title={a.name}
          description={a.locationHint ?? a.note}
          pinColor={pin[a.open]}
        />
      ))}
    </MapView>
  );
}
