import { distanceM, formatDistance, osmWalkingUrl, type LatLon } from '@defikarta/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import { api, setToken, useLive, type Me } from '../api';
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
      <p className="lead">Нужно е валидно удостоверение за курс по първа помощ (до 2 години). Верификатор (БЧК / „Първите три минути“) го одобрява. Улични известия — само за пълнолетни; под 18 г. — само ученията в твоето училище.</p>
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
        {active.incident.scene === 'unsafe' && <p className="danger">⚠ Мястото е отбелязано като опасно. Не се приближавай — изчакай 112.</p>}
        {active.incident.scene === 'unknown' && <p className="caution">Безопасността не е потвърдена. Огледай се, преди да се приближиш.</p>}
        <p className="lead">Пациентът е на отбелязаната точка. {dTarget && <>До целта: <strong>{dTarget}</strong>.</>} {active.incident.called112 ? '112 е уведомен.' : 'Обади се на 112, ако още никой не е.'}</p>
        <PickMap value={pos} onPick={() => undefined} className="pickmap tall" icon={pinIcon('🏃', '#1A73E8', 30)}>
          <Marker position={[active.incident.pos.lat, active.incident.pos.lon]} icon={pinIcon('✚', '#C8102E', 34)} />
          {active.aed && <Marker position={[active.aed.lat, active.aed.lon]} icon={pinIcon('⚡', '#1E7B34')} />}
          {pos && target && <Polyline positions={[[pos.lat, pos.lon], [target.lat, target.lon]]} pathOptions={{ color: '#1A73E8', dashArray: '6 8' }} />}
        </PickMap>
        <a className="route" href={osmWalkingUrl(pos, target!)} target="_blank" rel="noreferrer">Маршрут пеша →</a>
        {nextStep && <button className="primary big" onClick={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: nextStep }))}>{steps[nextStep]}</button>}
        <label className="check"><input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} /> Симулирай придвижване (демо, споделя позицията ми)</label>
        <button className="ghost" onClick={() => act(() => api('/api/rpc/report_event', { incidentId: active.incident.id, type: 'ems_on_scene' }))}>Линейката дойде</button>
        <button className="ghost" onClick={() => confirm('Опасно ли е мястото? Ще се оттеглиш и диспечерът ще спре известяването на други.') && act(() => api('/api/rpc/withdraw_unsafe', { assignmentId: a.id }))}>⚠ Опасно е — оттеглям се</button>
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
            {o.called112 && <p className="okline">✓ 112 е уведомен</p>}
            {o.caution && <p className="caution">Безопасността на мястото не е потвърдена. Огледай се, преди да се приближиш.</p>}
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
            <p className="small">Отказът е без последствия.</p>
          </section>
        );
      })}
      {data.debrief && (
        <section className="card">
          <h3>{data.debrief.unsafe ? 'Добре, че се пази.' : 'Благодарим ти.'}</h3>
          <p className="small left">Ако случаят те е разтърсил, говори с някого. Свържи се с координатора на доброволците (контакт за подкрепа — уточнява се с БЧК).</p>
        </section>
      )}
      <Readiness r={r} reload={reload} />
      <section className="card">
        <h3>Наличност</h3>
        <p className="small">Известия получаваш само когато си „около мен“. Без следене на живо — позицията се споделя точно само в приет случай и се трие при затваряне.</p>
        <PickMap value={pos} onPick={setPos} icon={pinIcon('🏃', '#1A73E8')} />
        <div className="row">
          <button className="ghost" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }), () => setErr('Няма достъп до местоположение — докосни картата.'))}>📍 Моята позиция</button>
          {r.availability === 'around' ? (
            <button className="next" onClick={() => act(() => api('/api/rpc/set_availability', { mode: 'off' }))}>Изключи известията</button>
          ) : (
            <button className="primary" disabled={!pos || r.readiness.missing.length > 0} onClick={() => act(() => api('/api/rpc/set_availability', { mode: 'around', ...pos }))}>Достъпен съм около мен</button>
          )}
        </div>
        {r.availability === 'around' && pos && (
          <button className="ghost" onClick={() => act(() => api('/api/rpc/set_availability', { mode: 'around', ...pos }))}>Обнови позицията</button>
        )}
        <p className="small">Сега: <strong>{r.availability === 'around' ? 'включени' : 'изключени'}</strong> · приети {r.acceptCount} от {r.offerCount} оферти</p>
        {r.readiness.missing.length > 0 && <p className="small left">Довърши „Готовност“ отгоре, за да включиш известията.</p>}
        {err && <p className="error">{err}</p>}
      </section>
      <MyData />
    </main>
  );
}

const MISSING_BG = { certificate: 'Валидно удостоверение', terms: 'Условия за доброволци', consent: 'Съгласие за местоположение', quiz: 'Проверка на знанията' } as const;

/** Mentor's questions 1–3 and 5 as one checklist: nothing reaches the volunteer until every row is green. */
function Readiness({ r, reload }: { r: any; reload: () => void }) {
  const [open, setOpen] = useState<'terms' | 'quiz' | null>(null);
  const [quiet, setQuiet] = useState({ from: r.quiet?.from ?? 23, to: r.quiet?.to ?? 7 });
  const miss = new Set<string>(r.readiness.missing);
  const row = (k: keyof typeof MISSING_BG, detail: string, action?: ReactNode) => (
    <li>
      <span><strong>{MISSING_BG[k]}</strong><br /><span className="small">{detail}</span></span>
      {miss.has(k) ? action ?? <span className="todo">липсва</span> : <span className="ok">✓</span>}
    </li>
  );
  return (
    <section className="card">
      <h3>Готовност</h3>
      <ul className="ready">
        {row('certificate', `${r.certificate?.issuer ?? '—'} · валидно до ${r.verifiedUntil ?? '—'}`)}
        {row('terms', `версия ${r.readiness.termsVersion}`, <button className="ghost" onClick={() => setOpen('terms')}>Прочети</button>)}
        {row('consent', r.locationConsentAt ? 'позицията се ползва само за известия' : 'отделно съгласие', <button className="ghost" onClick={() => setOpen('terms')}>Дай</button>)}
        {row('quiz', r.readiness.quizValidUntil ? `валидна до ${new Date(r.readiness.quizValidUntil).toLocaleDateString('bg-BG')}` : '5 въпроса, на всеки 6 месеца', <button className="ghost" onClick={() => setOpen('quiz')}>Започни</button>)}
        <li>
          <span><strong>Тихи часове</strong><br /><span className="small">{r.quiet ? `без известия ${r.quiet.from}:00–${r.quiet.to}:00` : 'няма'}</span></span>
          <span className="row">
            <select value={quiet.from} onChange={(e) => setQuiet({ ...quiet, from: +e.target.value })}>{[...Array(24).keys()].map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
            <select value={quiet.to} onChange={(e) => setQuiet({ ...quiet, to: +e.target.value })}>{[...Array(24).keys()].map((h) => <option key={h} value={h}>{h}:00</option>)}</select>
            <button className="ghost" onClick={() => api('/api/rpc/set_quiet_hours', quiet).then(reload)}>Запази</button>
            {r.quiet && <button className="ghost" onClick={() => api('/api/rpc/set_quiet_hours', { from: null }).then(reload)}>Махни</button>}
          </span>
        </li>
      </ul>
      {r.locationConsentAt && !miss.has('consent') && <button className="ghost" onClick={() => confirm('Оттегляш съгласието: известията спират и позицията ти се изтрива.') && api('/api/rpc/withdraw_consent', {}).then(reload)}>Оттегли съгласието за местоположение</button>}
      {open === 'terms' && <Terms done={() => (setOpen(null), reload())} />}
      {open === 'quiz' && <Quiz done={() => (setOpen(null), reload())} />}
    </section>
  );
}

function Terms({ done }: { done: () => void }) {
  const { data } = useLive(() => api<{ version: string; terms: string[] }>('/api/responder/terms'), 60_000);
  const [read, setRead] = useState(false);
  const [loc, setLoc] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <p className="small">Зареждане…</p>;
  return (
    <div className="form">
      <ol className="terms">{data.terms.map((t, i) => <li key={i}>{t}</li>)}</ol>
      <label className="check"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> Прочетох и приемам условията (версия {data.version})</label>
      <label className="check"><input type="checkbox" checked={loc} onChange={(e) => setLoc(e.target.checked)} /> Съгласен съм позицията ми да се ползва за известия, докато съм „достъпен“</label>
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={!read || !loc} onClick={() => api('/api/rpc/accept_terms', { version: data.version, locationConsent: true }).then(done, (x: Error) => setErr(x.message))}>Приемам</button>
    </div>
  );
}

function Quiz({ done }: { done: () => void }) {
  const { data } = useLive(() => api<{ questions: { q: string; options: string[] }[] }>('/api/responder/quiz'), 60_000);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{ passed: boolean; correct: number; total: number; wrong: number[] } | null>(null);
  if (!data) return <p className="small">Зареждане…</p>;
  return (
    <div className="form quiz">
      {data.questions.map((q, i) => (
        <fieldset key={i} className={result?.wrong.includes(i) ? 'wrong' : ''}>
          <legend>{i + 1}. {q.q}</legend>
          {q.options.map((o, j) => (
            <label key={j} className="check"><input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => { const a = [...answers]; a[i] = j; setAnswers(a); setResult(null); }} /> {o}</label>
          ))}
        </fieldset>
      ))}
      {result && !result.passed && <p className="error">{result.correct} от {result.total}. Отбелязаните въпроси са грешни — опитай пак.</p>}
      <button className="primary" disabled={answers.filter((a) => a !== undefined).length < data.questions.length} onClick={async () => { const r = await api('/api/rpc/pass_quiz', { answers }); setResult(r); if (r.passed) done(); }}>Провери</button>
      <p className="small">Проверката не замества курса — тя само напомня основното.</p>
    </div>
  );
}

/** Mentor's question 3: see what we hold and delete it. */
function MyData() {
  const [err, setErr] = useState<string | null>(null);
  const download = async () => {
    const d = await api('/api/me/data');
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: 'defikarta-moite-danni.json' }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="card">
      <h3>Моите данни</h3>
      <p className="small left">Пазим: имейл, година на раждане (само за 18+), удостоверение, приети условия, приблизителна позиция докато си „достъпен“. Точният ти маршрут в случай се трие при затварянето му; мястото на случая се закръгля до ~100 м след 30 дни.</p>
      <div className="row">
        <button className="ghost" onClick={download}>Изтегли моите данни</button>
        <button className="ghost" onClick={() => confirm('Изтриване на профила и всички данни за теб?') && api('/api/rpc/delete_me', {}).then(() => { setToken(null); location.hash = '#/'; location.reload(); }, (x: Error) => setErr(x.message))}>Изтрий профила</button>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}
