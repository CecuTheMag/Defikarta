import { STARA_ZAGORA_CENTER, type LatLon, type RankedAed } from '@defikarta/core';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';

const color = { open: '#1E7B34', closed: '#C8102E', unknown: '#C77700' };

function aedIcon(state: RankedAed['open']) {
  return L.divIcon({
    className: '',
    html: `<div class="pin" style="background:${color[state]}">⚡</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function MapView({ aeds, coords }: { aeds: RankedAed[]; coords: LatLon | null }) {
  const c = coords ?? STARA_ZAGORA_CENTER;
  return (
    <MapContainer center={[c.lat, c.lon]} zoom={14} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {coords && <CircleMarker center={[coords.lat, coords.lon]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1A73E8', fillOpacity: 1 }} />}
      {aeds.map((a) => (
        <Marker key={a.id} position={[a.lat, a.lon]} icon={aedIcon(a.open)}>
          <Popup>
            <strong>{a.name}</strong>
            {a.locationHint && <div>{a.locationHint}</div>}
            {a.note && <div style={{ color: '#5C5C66' }}>{a.note}</div>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
