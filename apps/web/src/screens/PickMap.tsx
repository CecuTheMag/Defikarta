import { STARA_ZAGORA_CENTER, type LatLon } from '@defikarta/core';
import L from 'leaflet';
import type { ReactNode } from 'react';
import { CircleMarker, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';

function Clicks({ onPick }: { onPick: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  return null;
}

export const pinIcon = (emoji: string, bg: string, size = 30) =>
  L.divIcon({ className: '', html: `<div class="pin" style="background:${bg};width:${size}px;height:${size}px">${emoji}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

export const Tiles = () => (
  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
);

/** Map where a tap sets a point (AED location, responder position, drill location). */
export function PickMap({ value, onPick, children, className = 'pickmap', icon }: { value: LatLon | null; onPick: (p: LatLon) => void; children?: ReactNode; className?: string; icon?: L.DivIcon }) {
  const c = value ?? STARA_ZAGORA_CENTER;
  return (
    <MapContainer center={[c.lat, c.lon]} zoom={15} className={className} scrollWheelZoom>
      <Tiles />
      <Clicks onPick={onPick} />
      {children}
      {value && (icon ? <Marker position={[value.lat, value.lon]} icon={icon} /> : <CircleMarker center={[value.lat, value.lon]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#C8102E', fillOpacity: 1 }} />)}
    </MapContainer>
  );
}
