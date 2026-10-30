import type { LatLon } from '@defikarta/core';
import { useState } from 'react';
import { api } from '../api';
import { PickMap } from './PickMap';

export function AddAed() {
  const [pos, setPos] = useState<LatLon | null>(null);
  const [f, setF] = useState({ name: '', locationHint: '', openingHours: '', access: 'yes', indoor: true });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }), () => setErr('Няма достъп до местоположение. Докосни картата.'));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!pos) return setErr('Докосни картата, за да сложиш точка.');
    try {
      await api('/api/rpc/submit_aed', { ...pos, ...f });
      setDone(f.name);
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  if (done)
    return (
      <main className="page">
        <h1>Благодаря!</h1>
        <p className="lead">„{done}“ чака проверка от верификатор. Преди да се покаже публично, се сверява със снимка/обаждане, а после се добавя ръчно в OpenStreetMap.</p>
        <button className="next" onClick={() => { setDone(null); setPos(null); setF({ ...f, name: '', locationHint: '', openingHours: '' }); }}>
          Добави още едно
        </button>
      </main>
    );

  return (
    <main className="page">
      <h1>Добави дефибрилатор</h1>
      <p className="lead">Всяко устройство в картата може да спаси живот. Предложението минава през проверка.</p>
      <form className="form" onSubmit={submit}>
        <label>
          Къде е? Докосни картата
          <PickMap value={pos} onPick={setPos} />
        </label>
        <button type="button" className="ghost" onClick={locate}>📍 Използвай местоположението ми</button>
        <label>
          Име на мястото
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="напр. Читалище „…“" required />
        </label>
        <label>
          Къде точно вътре
          <input value={f.locationHint} onChange={(e) => setF({ ...f, locationHint: e.target.value })} placeholder="до охраната, вход Б" />
        </label>
        <label>
          Работно време (OSM формат)
          <input value={f.openingHours} onChange={(e) => setF({ ...f, openingHours: e.target.value })} placeholder="24/7  или  Mo-Fr 08:00-18:00" />
          <small>Не знаеш? Остави празно — ще пише „Часове неизвестни“, не „отворено“.</small>
        </label>
        <label>
          Достъп
          <select value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })}>
            <option value="yes">Свободен</option>
            <option value="customers">Само за клиенти/посетители</option>
            <option value="private">Частен</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={f.indoor} onChange={(e) => setF({ ...f, indoor: e.target.checked })} /> Вътре в сграда
        </label>
        {err && <p className="error">{err}</p>}
        <button className="primary">Изпрати за проверка</button>
      </form>
    </main>
  );
}
