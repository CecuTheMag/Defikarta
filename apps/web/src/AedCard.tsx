import { formatDistance, openLabel, osmWalkingUrl, type LatLon, type RankedAed } from '@defikarta/core';

export function AedCard({ aed, from }: { aed: RankedAed; from: LatLon | null }) {
  return (
    <article className="card">
      <div className="card-row">
        <h3>{aed.name}</h3>
        {Number.isFinite(aed.distanceM) && (
          <span className="dist">
            {formatDistance(aed.distanceM)} · ~{aed.walkMin} мин
          </span>
        )}
      </div>
      <span className={`badge badge-${aed.open}`}>{openLabel(aed.open)}</span>
      {aed.locationHint && <p className="hint">📍 {aed.locationHint}</p>}
      {aed.note && <p className="note">{aed.note}</p>}
      <a className="route" href={osmWalkingUrl(from, aed)} target="_blank" rel="noreferrer">
        Маршрут пеша →
      </a>
    </article>
  );
}
