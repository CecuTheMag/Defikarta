import type { LatLon, SceneSafety } from '@defikarta/core';
import { useState } from 'react';
import { api, deviceId, fmtDur, useLive } from '../api';

/**
 * Bystander alert (flag `public_alerts`). Always secondary to 112: the CPR guide above it never waits for this.
 * Mentor's question 4: it is only shown after the caller confirmed 112 (`called112`), and that is sent with the alert.
 * Question 5: one tap on whether the scene is safe; 'unsafe' sends nobody.
 */
export function AlertPeople({ coords, demoCenter, called112 }: { coords: LatLon | null; demoCenter: LatLon; called112: boolean }) {
  const [id, setId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('defikarta:incident');
    } catch {
      return null;
    }
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scene, setScene] = useState<SceneSafety | null>(null);
  const status = useLive(() => (id ? api<any>(`/api/public/incident/${id}`) : Promise.resolve(null)), 3000);

  const start = async (pos: LatLon) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string }>('/api/rpc/create_incident', { source: 'bystander', ...pos, deviceId: deviceId(), key: crypto.randomUUID(), called112, scene });
      setId(r.id);
      try {
        sessionStorage.setItem('defikarta:incident', r.id);
      } catch {
        // fine: the banner just won't survive a reload
      }
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const forget = () => {
    setId(null);
    try {
      sessionStorage.removeItem('defikarta:incident');
    } catch {
      // ignore
    }
  };

  const s = status.data;
  if (id && s) {
    const finished = s.state === 'CLOSED' || s.state === 'EMS_ON_SCENE';
    return (
      <section className="alert-box">
        <p className="drill">УЧЕНИЕ</p>
        <h2>{s.state === 'DISPATCH_FAILED' ? 'Няма свободни доброволци наблизо. Продължавай масажа.' : s.state === 'EMS_ON_SCENE' ? 'Линейката е на място' : s.state === 'CLOSED' ? 'Сигналът е затворен' : 'Доброволци са известени'}</h2>
        <div className="stats">
          <span><b>{s.notified}</b> известени</span>
          <span><b>{s.enRoute}</b> тръгнали</span>
          <span><b>{s.aedEtaS === null ? '—' : s.aedEtaS === 0 ? 'тук е' : `~${fmtDur(s.aedEtaS)}`}</b> AED идва</span>
        </div>
        <p className="small">Не спирай масажа. Обаждането на 112 остава най-важното.</p>
        <div className="row">
          {!finished && <button className="ghost" onClick={() => api('/api/rpc/report_event', { incidentId: id, type: 'ems_on_scene', deviceId: deviceId() }).then(status.reload)}>Линейката дойде</button>}
          {!finished && <button className="ghost" onClick={() => api('/api/rpc/close_incident', { incidentId: id, cancel: true, deviceId: deviceId() }).then(status.reload)}>Отмени сигнала</button>}
          {finished && <button className="next" onClick={forget}>Готово</button>}
        </div>
      </section>
    );
  }
  return (
    <section className="alert-box">
      <div className="qa">
        <p>Безопасно ли е да се приближат хора?</p>
        <div className="seg">
          <button className={scene === 'safe' ? 'on' : ''} onClick={() => setScene('safe')}>Да</button>
          <button className={scene === 'unknown' ? 'on' : ''} onClick={() => setScene('unknown')}>Не знам</button>
          <button className={`warn ${scene === 'unsafe' ? 'on' : ''}`} onClick={() => setScene('unsafe')}>Не (ток, огън, движение…)</button>
        </div>
      </div>
      {scene === 'unsafe' && <p className="danger">Не изпращаме доброволци на опасно място. Пази се и кажи на 112 какво виждаш.</p>}
      <button className="alert-btn" disabled={busy || !called112 || !scene || scene === 'unsafe'} onClick={() => start(coords ?? demoCenter)}>
        📣 Извикай обучени хора наблизо
        <small>{coords ? 'ще споделим мястото ти само за този случай' : 'без GPS: демо местоположение (центъра)'}</small>
      </button>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
