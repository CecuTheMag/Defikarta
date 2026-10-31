import type { LatLon } from '@defikarta/core';
import { useState } from 'react';
import { CircleMarker, Marker, Polyline, Popup } from 'react-leaflet';
import { api, fmtDur, useLive, type Me } from '../api';
import { Coverage } from './Coverage';
import { PickMap, pinIcon } from './PickMap';

type Tab = 'live' | 'verify' | 'coverage' | 'admin';
const STATE_BG: Record<string, string> = { DISPATCHING: 'Търсим доброволци', RESPONDING: 'Доброволци на път', ON_SCENE: 'Масаж започнат', AED_ON_SCENE: 'AED на място', DISPATCH_FAILED: 'Няма откликнали', EMS_ON_SCENE: 'Линейката е на място', CLOSED: 'Затворен' };
const OFFER_BG: Record<string, string> = { sent: 'изпратена', accepted: 'приета', declined: 'отказана', expired: 'изтекла', withdrawn: 'оттеглена' };
const ROLE_BG = { cpr: 'масаж', aed_runner: 'AED' } as const;

export function Console({ me, goLogin }: { me: Me | null; goLogin: () => void }) {
  const [tab, setTab] = useState<Tab>('live');
  const roles = me?.user.roles ?? [];
  if (!me)
    return (
      <main className="page">
        <h1>Конзола</h1>
        <p className="lead">За диспечери, верификатори и администратори.</p>
        <button className="primary" onClick={goLogin}>Вход</button>
      </main>
    );
  const can = (r: string) => roles.includes(r as never) || roles.includes('admin');
  if (!can('dispatcher') && !can('verifier'))
    return (
      <main className="page">
        <h1>Конзола</h1>
        <p className="lead">Профилът ти ({me.user.email}) няма достъп. Влез като диспечер или верификатор.</p>
        <button className="next" onClick={goLogin}>Смени профил</button>
      </main>
    );
  return (
    <div className="console">
      <nav className="tabs">
        {can('dispatcher') && <button className={tab === 'live' ? 'on' : ''} onClick={() => setTab('live')}>Живо</button>}
        {can('verifier') && <button className={tab === 'verify' ? 'on' : ''} onClick={() => setTab('verify')}>Проверка</button>}
        <button className={tab === 'coverage' ? 'on' : ''} onClick={() => setTab('coverage')}>Покритие</button>
        {roles.includes('admin') && <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>Админ</button>}
      </nav>
      {tab === 'live' && can('dispatcher') && <Live />}
      {tab === 'verify' && can('verifier') && <Verify />}
      {tab === 'coverage' && <Coverage />}
      {tab === 'admin' && roles.includes('admin') && <Admin />}
    </div>
  );
}

// ---------------- live map ----------------
function Live() {
  const { data, error, reload } = useLive(() => api<any>('/api/console/state'), 1500);
  const [point, setPoint] = useState<LatLon | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const incidents: any[] = data?.incidents ?? [];
  const sel = incidents.find((i) => i.id === selected) ?? incidents.find((i) => !['CLOSED'].includes(i.state)) ?? incidents[0];
  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  if (!data) return <main className="page"><p>{error ?? 'Зареждане…'}</p></main>;
  const live = (i: any) => !['CLOSED', 'EMS_ON_SCENE'].includes(i.state);

  return (
    <div className="live">
      <div className="live-map">
        <PickMap value={point} onPick={setPoint} className="map" icon={pinIcon('✚', '#C8102E', 34)}>
          {data.aeds.map((a: any) => (
            <CircleMarker key={a.id} center={[a.lat, a.lon]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: a.open === 'open' ? '#1E7B34' : a.open === 'closed' ? '#C8102E' : '#C77700', fillOpacity: 1 }}>
              <Popup>{a.name}<br />{a.locationHint}</Popup>
            </CircleMarker>
          ))}
          {data.responders.filter((r: any) => !r.busy).map((r: any) => (
            <CircleMarker key={r.id} center={[r.pos.lat, r.pos.lon]} radius={5} pathOptions={{ color: '#fff', weight: 1.5, fillColor: r.availability === 'around' ? '#1A73E8' : '#9aa0a6', fillOpacity: 0.9 }}>
              <Popup>{r.name}{r.bot ? ' (бот)' : ''}</Popup>
            </CircleMarker>
          ))}
          {incidents.filter((i) => i.state !== 'CLOSED').map((i) => (
            <Marker key={i.id} position={[i.pos.lat, i.pos.lon]} icon={pinIcon('✚', i.id === sel?.id ? '#C8102E' : '#7a1020', 36)} eventHandlers={{ click: () => setSelected(i.id) }} />
          ))}
          {sel?.assignments.filter((a: any) => a.status !== 'released' && a.pos).map((a: any) => (
            <span key={a.id}>
              <Polyline positions={a.track.map((t: LatLon) => [t.lat, t.lon])} pathOptions={{ color: a.role === 'cpr' ? '#1A73E8' : '#1E7B34', weight: 3, opacity: 0.6 }} />
              <Marker position={[a.pos.lat, a.pos.lon]} icon={pinIcon(a.role === 'cpr' ? '🏃' : '⚡', a.role === 'cpr' ? '#1A73E8' : '#1E7B34', 28)}>
                <Popup>{a.name} · {ROLE_BG[a.role as keyof typeof ROLE_BG]} · {a.status}</Popup>
              </Marker>
            </span>
          ))}
        </PickMap>
      </div>

      <aside className="live-side">
        <div className="card">
          <h3>Ново учение</h3>
          <p className="small">{point ? `Точка: ${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}` : 'Докосни картата, за да сложиш пациента.'} Ботовете се движат ×{data.simSpeed} по-бързо, за да се побере учението в демо.</p>
          <button className="primary" disabled={!point} onClick={() => act(async () => { const r = await api('/api/rpc/create_incident', { source: 'drill', ...point, label: 'Учение' }); setSelected(r.id); setPoint(null); })}>Стартирай учение</button>
          {err && <p className="error">{err}</p>}
        </div>

        {sel && (
          <div className="card">
            <div className="card-row">
              <h3>{STATE_BG[sel.state]}</h3>
              <span className="badge badge-unknown">{sel.source === 'bystander' ? 'сигнал от минувач' : 'учение'}</span>
            </div>
            <div className="stats">
              <span><b>{sel.offers.length}</b> известени</span>
              <span><b>{sel.offers.filter((o: any) => o.status === 'accepted').length}</b> приели</span>
              <span><b>{fmtDur(sel.public.aedEtaS)}</b> до AED</span>
              <span><b>{fmtDur(sel.public.emsEtaS)}</b> до линейка</span>
            </div>
            <p className="small">Вълна {sel.wave + 1}/3 · старт {new Date(sel.createdAt).toLocaleTimeString('bg-BG')} · {sel.public.called112 ? '112 ✓' : '112 не е потвърден'}</p>
            {sel.public.scene === 'unsafe' && <p className="danger">Мястото е опасно: известяването е спряно.</p>}
            {live(sel) && (
              <div className="seg">
                <span className="small">Място:</span>
                {(['safe', 'unknown', 'unsafe'] as const).map((sc) => (
                  <button key={sc} className={`${sc === 'unsafe' ? 'warn ' : ''}${sel.public.scene === sc ? 'on' : ''}`} onClick={() => act(() => api('/api/rpc/set_scene', { incidentId: sel.id, scene: sc }))}>{{ safe: 'безопасно', unknown: 'неизвестно', unsafe: 'опасно — спри' }[sc]}</button>
                ))}
              </div>
            )}
            <div className="row">
              {live(sel) && <button className="ghost" onClick={() => act(() => api('/api/rpc/close_incident', { incidentId: sel.id, cancel: true }))}>Отмени (фалшив сигнал)</button>}
              {sel.state !== 'CLOSED' && <button className="next" onClick={() => act(() => api('/api/rpc/close_incident', { incidentId: sel.id }))}>Затвори</button>}
              <button className="ghost" onClick={() => act(async () => setReport(await api(`/api/incidents/${sel.id}/report`)))}>Доклад</button>
            </div>
            <table className="offers">
              <tbody>
                {sel.offers.map((o: any) => (
                  <tr key={o.id} className={`o-${o.status}`}>
                    <td>{o.name}</td>
                    <td>{ROLE_BG[o.role as keyof typeof ROLE_BG]}</td>
                    <td>{OFFER_BG[o.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {incidents.length > 1 && (
          <div className="card">
            <h3>Случаи</h3>
            {incidents.map((i) => (
              <button key={i.id} className={`inc ${i.id === sel?.id ? 'on' : ''}`} onClick={() => setSelected(i.id)}>
                {new Date(i.createdAt).toLocaleTimeString('bg-BG')} · {STATE_BG[i.state]} · {i.source === 'bystander' ? 'минувач' : 'учение'}
              </button>
            ))}
          </div>
        )}

        {report && (
          <div className="card">
            <div className="card-row"><h3>Доклад от учението</h3><button className="ghost" onClick={() => setReport(null)}>×</button></div>
            <table className="offers">
              <tbody>
                <tr><td>Първи прие</td><td>{fmtDur(report.times.firstAcceptS)}</td></tr>
                <tr><td>Масаж на място</td><td>{fmtDur(report.times.cprOnSceneS)}</td></tr>
                <tr><td>AED на място</td><td>{fmtDur(report.times.aedOnSceneS)}</td></tr>
                <tr><td>Линейка (симулирана)</td><td>{fmtDur(report.times.emsOnSceneS)}</td></tr>
              </tbody>
            </table>
            <p className="small">Времената са реални секунди при ботове ×{report.simSpeed}. За реално сравнение „с/без приложение“ — измерения от учение с хора.</p>
            <ol className="timeline">
              {report.timeline.map((e: any, i: number) => (
                <li key={i}><code>{e.tS}s</code> {e.actor} · {e.type}{e.data?.role ? ` (${e.data.role})` : ''}</li>
              ))}
            </ol>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------- verifier queue ----------------
function Verify() {
  const subs = useLive(() => api<{ submissions: any[] }>('/api/submissions'), 3000);
  const certs = useLive(() => api<{ certificates: any[] }>('/api/certificates'), 3000);
  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    subs.reload();
    certs.reload();
  };
  const pending = subs.data?.submissions.filter((s) => s.status === 'pending') ?? [];
  const done = subs.data?.submissions.filter((s) => s.status !== 'pending') ?? [];
  return (
    <main className="page wide">
      <h1>Проверка</h1>
      <h2>Предложени дефибрилатори ({pending.length})</h2>
      {pending.length === 0 && <p className="small">Няма чакащи. Добави от „Добави AED“ в менюто.</p>}
      {pending.map((s) => (
        <section key={s.id} className="card">
          <strong>{s.payload.name}</strong>
          <div className="small">{s.payload.locationHint} · часове: {s.payload.openingHours || 'неизвестни'} · {s.payload.lat.toFixed(5)}, {s.payload.lon.toFixed(5)}</div>
          <div className="row">
            <button className="primary" onClick={() => act(() => api('/api/rpc/review_submission', { id: s.id, decision: 'approve' }))}>Одобри</button>
            <button className="ghost" onClick={() => act(() => api('/api/rpc/review_submission', { id: s.id, decision: 'reject', note: 'не се потвърждава' }))}>Откажи</button>
          </div>
          <p className="small">След одобрение екипът добавя възела ръчно в OpenStreetMap (без автоматични редакции).</p>
        </section>
      ))}
      {done.length > 0 && <p className="small">Прегледани: {done.map((s) => `${s.payload.name} (${s.status})`).join(' · ')}</p>}

      <h2>Удостоверения на доброволци</h2>
      {(certs.data?.certificates ?? []).length === 0 && <p className="small">Няма заявки.</p>}
      {(certs.data?.certificates ?? []).map((c) => (
        <section key={c.userId} className="card">
          <strong>{c.name}</strong> <span className="small">{c.email} · {c.scope === 'street' ? 'улични известия (18+)' : 'само училищни учения'}</span>
          <div className="small">{c.certificate.issuer} · издадено {c.certificate.issuedOn} · {c.certificate.status}{c.verifiedUntil ? ` · валидно до ${c.verifiedUntil}` : ''}</div>
          {!c.recognizedIssuer && <p className="caution">Непознат издател — провери удостоверението ръчно (или при издателя).</p>}
          {c.certificate.status === 'pending' && (
            <div className="row">
              <button className="primary" disabled={!c.validUntil || c.validUntil < new Date().toISOString().slice(0, 10)} onClick={() => act(() => api('/api/rpc/review_certificate', { userId: c.userId, decision: 'approve' }))}>{c.validUntil ? `Одобри до ${c.validUntil}` : 'Няма дата'}</button>
              <button className="ghost" onClick={() => act(() => api('/api/rpc/review_certificate', { userId: c.userId, decision: 'reject', note: 'нечетимо' }))}>Откажи</button>
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

// ---------------- admin ----------------
function Admin() {
  const cfg = useLive(() => api<any>('/api/config'), 5000);
  const audit = useLive(() => api<{ audit: any[] }>('/api/admin/audit'), 4000);
  const flags: Record<string, boolean | number> = cfg.data?.flags ?? {};
  const set = async (key: string, value: boolean | number) => {
    await api('/api/admin/flags', { key, value });
    cfg.reload();
    audit.reload();
  };
  return (
    <main className="page wide">
      <h1>Админ</h1>
      <h2>Флагове</h2>
      <div className="card">
        {Object.entries(flags).map(([k, v]) => (
          <label key={k} className="flag">
            <code>{k}</code>
            {typeof v === 'boolean' ? <input type="checkbox" checked={v} onChange={(e) => set(k, e.target.checked)} /> : <input type="number" value={v} min={0} max={600} onChange={(e) => set(k, +e.target.value)} />}
          </label>
        ))}
        <p className="small"><code>public_alerts</code> изключен = бутонът „Извикай обучени хора“ изчезва за минувачите. Пилотът започва с него изключен.</p>
      </div>
      <h2>Одит</h2>
      <div className="card audit">
        {(audit.data?.audit ?? []).slice(0, 25).map((a, i) => (
          <div key={i}><code>{new Date(a.at).toLocaleTimeString('bg-BG')}</code> {a.actor} · {a.action} {a.subject ?? ''}</div>
        ))}
      </div>
      <button className="ghost" onClick={async () => { if (confirm('Нулиране на учебната среда (профилите се изчистват)?')) { await api('/api/admin/reset', {}); location.hash = '#/login'; location.reload(); } }}>Нулирай учебната среда</button>
    </main>
  );
}
