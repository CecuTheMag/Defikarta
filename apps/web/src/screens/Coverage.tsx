import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Popup, Rectangle } from 'react-leaflet';
import { api } from '../api';
import { pinIcon, Tiles } from './PickMap';

type Scenario = 'now' | 'weekday' | 'night' | 'always';
const LABEL: Record<Scenario, string> = { now: 'Сега', weekday: 'Делник 10:00', night: 'Нощ 03:00', always: 'Само 24/7' };
const BAND = (m: number | null) => (m === null ? '#7a1020' : m < 3 ? '#1e7b34' : m <= 5 ? '#8fbf3a' : m <= 8 ? '#e0a800' : '#c8102e');

interface Cov {
  stepM: number;
  within5: number;
  aedCount: number;
  cells: [number, number, number | null][];
  placements: { lat: number; lon: number; name: string; gainCells: number }[];
  placementsAvailable: boolean;
}

export function Coverage() {
  const [scenario, setScenario] = useState<Scenario>('now');
  const [cov, setCov] = useState<Cov | null>(null);
  const [aeds, setAeds] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Cov>(`/api/coverage?scenario=${scenario}`).then(setCov, (e: Error) => setErr(e.message));
  }, [scenario]);
  useEffect(() => {
    api<{ aeds: any[] }>('/api/aeds').then((r) => setAeds(r.aeds), () => undefined);
  }, []);

  const half = cov ? cov.stepM / 2 : 0;
  return (
    <main className="cov">
      <div className="cov-bar">
        <div className="seg">
          {(Object.keys(LABEL) as Scenario[]).map((s) => (
            <button key={s} className={s === scenario ? 'on' : ''} onClick={() => setScenario(s)}>
              {LABEL[s]}
            </button>
          ))}
        </div>
        {cov && (
          <p>
            <strong>{Math.round(cov.within5 * 100)}%</strong> от площта на града е на ≤ 5 мин пеша от достъпен AED ({cov.aedCount} устройства в картата, част от тях ДЕМО).
          </p>
        )}
        {cov && !cov.placementsAvailable && <p className="small">„Следващите 5 AED“ изискват обекти от OpenStreetMap (училища, аптеки…); в момента Overpass е недостъпен.</p>}
        <p className="legend">
          <i style={{ background: '#1e7b34' }} />&lt;3 <i style={{ background: '#8fbf3a' }} />3–5 <i style={{ background: '#e0a800' }} />5–8 <i style={{ background: '#c8102e' }} />&gt;8 <i style={{ background: '#7a1020' }} />няма
        </p>
      </div>
      {err && <p className="error">{err}</p>}
      <MapContainer center={[42.4258, 25.6345]} zoom={13} className="map" scrollWheelZoom>
        <Tiles />
        {cov?.cells.map(([lat, lon, min], i) => (
          <Rectangle key={i} bounds={[[lat - half / 111320, lon - half / 82500], [lat + half / 111320, lon + half / 82500]]} pathOptions={{ stroke: false, fillColor: BAND(min), fillOpacity: 0.38 }} />
        ))}
        {aeds.map((a) => (
          <CircleMarker key={a.id} center={[a.lat, a.lon]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1 }}>
            <Popup>{a.name}</Popup>
          </CircleMarker>
        ))}
        {cov?.placements.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lon]} icon={pinIcon(String(i + 1), '#1A73E8', 28)}>
            <Popup>
              <strong>Следващ AED №{i + 1}</strong>
              <div>{p.name}</div>
              <div>покрива още ~{p.gainCells} клетки ({Math.round((p.gainCells * (cov?.stepM ?? 0) ** 2) / 10000)} дка)</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </main>
  );
}
