import { distanceM, formatDistance, osmWalkingUrl, type LatLon } from '@defikarta/core';
import { useEffect, useRef, useState } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import { api, useLive, type Me } from '../api';
import { PickMap, pinIcon } from './PickMap';

const beep = () => {
  try {
    navigator.vibrate?.([300, 150, 300]);
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    // audio blocked until the first tap: the visual alert still shows
  }
};

export function Responder({ me, refreshMe, goLogin }: { me: Me | null; refreshMe: () => void; goLogin: () => void }) {
  if (!me) {
    return (
      <main className="page">
        <h1>Доброволец</h1>
        <p className="lead">Влез, за да получаваш известия за сърдечен арест наблизо. Можеш да откажеш по всяко време.</p>
        <button className="primary" onClick={goLogin}>Вход</button>
      </main>
    );
  }
  if (!me.responder) return <Register refreshMe={refreshMe} />;
  if (me.responder.status !== 'verified')
    return (
      <main className="page">
        <h1>Чакаме проверка</h1>
        <p className="lead">Удостоверението ти ({me.responder.certificate?.issuer}) е при верификатор. Щом бъде одобрено, ще можеш да получаваш известия.</p>
        <p className="small">Влез като <code>verifier@drill.defikarta.bg</code> в Конзола → Проверка, за да го одобриш в демото.</p>
        <button className="next" onClick={refreshMe}>Обнови</button>
      </main>
    );
  return <Console />;
}

function Register({ refreshMe }: { refreshMe: () => void }) {
  const [f, setF] = useState({ birthYear: 2000, issuer: '', issuedOn: '' });
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="page">
      <h1>Стани доброволец</h1>
      <p className="lead">Нужно е валидно удостоверение за курс по първа помощ. Верификатор (БЧК / „3 минути“) го одобрява. Улични известия — само за пълнолетни; под 18 г. — само ученията в твоето училище.</p>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/api/rpc/register_responder', f);
            refreshMe();
          } catch (x) {
            setErr((x as Error).message);
          }
        }}
      >
        <label>Година на раждане<input type="number" value={f.birthYear} min={1930} max={2015} onChange={(e) => setF({ ...f, birthYear: +e.target.value })} /></label>
        <label>Издател на удостоверението<input value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} placeholder="БЧК Стара Загора" required /></label>
        <label>Дата на издаване<input type="date" value={f.issuedOn} onChange={(e) => setF({ ...f, issuedOn: e.target.value })} required /></label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Изпрати за проверка</button>
      </form>
    </main>
  );
}

function Console() {
  const { data, reload } = useLive(() => api<any>('/api/responder/state'), 2500);
  const [pos, setPos] = useState<LatLon | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const seen = useRef(new Set<string>());
  const [, force] = useState(0);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (data?.responder?.pos && !pos) setPos(data.responder.pos);
  }, [data, pos]);
  useEffect(() => {
    for (const o of data?.offers ?? []) if (!seen.current.has(o.id)) (seen.current.add(o.id), beep());
  }, [data]);

  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  const r = data?.responder;
  const active = data?.active;
  const target: LatLon | null = active ? (active.assignment.role === 'aed_runner' && active.assignment.status === 'en_route' && active.aed ? active.aed : active.incident.pos) : null;

  // Move toward the target at ~10 m/s and report precise location every second (it is deleted when the incident closes).
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    if (!sim || !active || !target || !posRef.current) return;
    const t = setInterval(() => {
      const p = posRef.current!;
      const d = distanceM(p, target);
      const f = d < 10 ? 0 : Math.min(1, 10 / d);
      const next = { lat: p.lat + (target.lat - p.lat) * f, lon: p.lon + (target.lon - p.lon) * f };
      setPos(next);
      api('/api/rpc/push_location', { assignmentId: active.assignment.id, ...next }).catch(() => undefined);
    }, 1000);
    return () => clearInterval(t);
  }, [sim, active?.assignment.id, target?.lat, target?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <main className="page"><p>Зареждане…</p></main>;

  if (active) {
    const a = active.assignment;
    const stage = a.role === 'cpr' ? ['on_scene'] : ['aed_collected', 'aed_on_scene'];
    const steps: Record<string, string> = { on_scene: 'На място съм', aed_collected: 'Взех AED-то', aed_on_scene: 'AED-то е на място' };
    const nextStep = stage.find((s) => (s === 'on_scene' && a.status === 'en_route') || (s === 'aed_collected' && a.status === 'en_route') || (s === 'aed_on_scene' && a.status === 'aed_collected'));
    const dTarget = pos && target ? formatDistance(distanceM(pos, target)) : '';
    return (
      <main className="page">
        <p className="drill">УЧЕНИЕ</p>
        <h1>{a.role === 'cpr' ? 'Към пациента — масаж' : a.status === 'en_route' ? 'Вземи AED-то' : 'Занеси AED-то'}</h1>
        {a.role === 'aed_runner' && active.aed && (
          <p className="lead">AED: <strong>{active.aed.name}</strong>{active.aed.locationHint ? ` · ${active.aed.locationHint}` : ''}</p>
        )}
        <p className="lead">Пациентът е на отбелязаната точка. {dTarget && <>До целта: <strong>{dTarget}</strong>.</>} Обади се на 112, ако още никой не е.</p>
        <PickMap value={pos} onPick={() => undefined} className="pickmap tall" icon={pinIcon('🏃', '#1A73E8', 30)}>
          <Marker position={[active.incident.pos.lat, active.incident.pos.lon]} icon={pinIcon('✚', '#C8102E', 34)} />
          {active.aed && <Marker position={[active.aed.lat, active.aed.lon]} icon={pinIcon('⚡', '#1E7B34')} />}
          {pos && target && <Polyline positions={[[pos.lat, pos.lon], [target.lat, target.lon]]} pathOptions={{ color: '#1A73E8', dashArray: '6 8' }} />}
        </PickMap>
        <a className="route" href={osmWalkingUrl(pos, target!)} target="_blank" rel="noreferrer">Маршрут пеша →</a>
        {nextStep && <button className="primary big" onClick={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: nextStep }))}>{steps[nextStep]}</button>}
        <label className="check"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> Симулирай придвижване (демо, споделя позицията ми)</label>
        <button className="ghost" onClick={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: 'ems_on_scene' }))}>Линейката дойде</button>
        <p className="small">Състояние: {active.incident.state} · ролята ти: {a.role === 'cpr' ? 'масаж' : 'AED'} · {a.status}</p>
        {err && <p className="error">{err}</p>}
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Здравей, доброволец</h1>
      {data.offers.map((o: any) => {
        const left = Math.max(0, Math.ceil((o.expiresAt - Date.now()) / 1000));
        return (
          <section key={o.id} className="offer">
            <p className="drill">УЧЕНИЕ</p>
            <h2>Сърдечен арест на {o.band}</h2>
            <p className="lead">Можеш ли да помогнеш? Остават {left} с.</p>
            {o.role === 'aed_runner' && <p className="hint">📍 Предлагаме ти да вземеш: <strong>{o.suggestedAed?.name}</strong></p>}
            <div className="row">
              {o.role === 'aed_runner' ? (
                <>
                  <button className="primary" onClick={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'accept' }))}>Нося AED</button>
                  <button className="next" onClick={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'accept', role: 'cpr' }))}>Тръгвам</button>
                </>
              ) : (
                <button className="primary" onClick={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'accept' }))}>Тръгвам</button>
              )}
              <button className="ghost" onClick={() => act(() => api('/api/rpc/respond_offer', { offerId: o.id, answer: 'decline' }))}>Не мога</button>
            </div>
          </section>
        );
      })}
      <section className="card">
        <h3>Наличност</h3>
        <p className="small">Известия получаваш само когато си „около мен“. Без следене на живо — позицията се споделя точно само в приет случай и се трие при затваряне.</p>
        <PickMap value={pos} onPick={setPos} icon={pinIcon('🏃', '#1A73E8')} />
        <div className="row">
          <button className="ghost" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }), () => setErr('Няма достъп до местоположение — докосни картата.'))}>📍 Моята позиция</button>
          {r.availability === 'around' ? (
            <button className="next" onClick={() => act(() => api('/api/rpc/set_availability', { mode: 'off' }))}>Изключи известията</button>
          ) : (
            <button className="primary" disabled={!pos} onClick={() => act(() => api('/api/rpc/set_availability', { mode: 'around', ...pos }))}>Достъпен съм около мен</button>
          )}
        </div>
        {r.availability === 'around' && pos && (
          <button className="ghost" onClick={() => act(() => api('/api/rpc/set_availability', { mode: 'around', ...pos }))}>Обнови позицията</button>
        )}
        <p className="small">Сега: <strong>{r.availability === 'around' ? 'включени' : 'изключени'}</strong> · приети {r.acceptCount} от {r.offerCount} оферти</p>
        {err && <p className="error">{err}</p>}
      </section>
    </main>
  );
}
