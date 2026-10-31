import { CHECK_LABEL, KIND_LABEL, type CheckKey, type EquipmentKind } from '@defikarta/core';
import { useState } from 'react';
import { api, getToken, useLive, type Me } from '../api';

const STATUS_BG = { ok: 'наред', soon: 'скоро', overdue: 'просрочено', missing: 'няма запис' } as const;
const KIND_ICON: Record<EquipmentKind, string> = { aed: '⚡', extinguisher: '🧯', first_aid_kit: '✚' };
/** Replacing a part asks for its new printed expiry; everything else records the day the work was done. */
const ACTIONS: Record<EquipmentKind, [CheckKey, string][]> = {
  aed: [['inspection', 'Оглед (индикатор, електроди, шкаф)'], ['battery', 'Нова батерия'], ['pads', 'Нови електроди'], ['service', 'Сервиз']],
  extinguisher: [['inspection', 'Оглед (налягане, пломба)'], ['service', 'Техническо обслужване'], ['hydro', 'Изпитване под налягане']],
  first_aid_kit: [['inspection', 'Проверка'], ['contents', 'Подновено съдържание']],
};
const EXPIRY: CheckKey[] = ['battery', 'pads', 'contents'];
const fmt = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('bg-BG') : '—');
const left = (d: number | null) => (d === null ? 'няма запис' : d < 0 ? `просрочено ${-d} дни` : d === 0 ? 'днес' : `след ${d} дни`);

/** Organisation view (role aed_owner): every AED, extinguisher and first-aid kit across sites, what is due, reminders and an export. */
export function Org({ me, goLogin }: { me: Me | null; goLogin: () => void }) {
  const roles = me?.user.roles ?? [];
  if (!me || !(roles.includes('aed_owner') || roles.includes('admin')))
    return (
      <main className="page">
        <h1>Организация</h1>
        <p className="lead">Регистър на дефибрилатори, пожарогасители и аптечки за фирми, училища и общини: срокове, напомняния и отчет.</p>
        <button className="primary" onClick={goLogin}>Вход като отговорник</button>
      </main>
    );
  return <OrgBody />;
}

function OrgBody() {
  const { data, error, reload } = useLive(() => api<any>('/api/org'), 6000);
  const [kind, setKind] = useState<EquipmentKind | 'all'>('all');
  const [site, setSite] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!data) return <main className="page"><p>{error ?? 'Зареждане…'}</p></main>;
  const sites: any[] = data.sites;
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? '';
  const items: any[] = data.equipment.filter((e: any) => (kind === 'all' || e.kind === kind) && (site === 'all' || e.siteId === site));
  const order = { overdue: 0, missing: 1, soon: 2, ok: 3 } as Record<string, number>;
  items.sort((a, b) => order[a.status]! - order[b.status]!);

  const download = async () => {
    const r = await fetch('/api/org/report.csv', { headers: { authorization: `Bearer ${getToken()}` } });
    const url = URL.createObjectURL(await r.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `defikarta-otchet.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="page wide">
      <div className="card-row">
        <h1>{data.org.name}</h1>
        <span className="badge badge-demo">ДЕМО данни</span>
      </div>
      <div className="tiles">
        <span className="tile"><b>{data.summary.total}</b>общо</span>
        <span className="tile t-overdue"><b>{data.summary.overdue}</b>просрочени</span>
        <span className="tile t-missing"><b>{data.summary.missing}</b>без запис</span>
        <span className="tile t-soon"><b>{data.summary.soon}</b>до 30 дни</span>
        <span className="tile t-ok"><b>{data.summary.ok}</b>наред</span>
      </div>

      <div className="seg">
        {(['all', 'aed', 'extinguisher', 'first_aid_kit'] as const).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'all' ? 'Всичко' : `${KIND_ICON[k]} ${KIND_LABEL[k]}`}</button>
        ))}
      </div>
      <div className="seg">
        {[{ id: 'all', name: 'Всички обекти' }, ...sites].map((s) => (
          <button key={s.id} className={site === s.id ? 'on' : ''} onClick={() => setSite(s.id)}>{s.name}</button>
        ))}
      </div>

      {items.map((e) => (
        <section key={e.id} className={`card eq eq-${e.status}`}>
          <div className="card-row">
            <h3>{KIND_ICON[e.kind as EquipmentKind]} {e.model}</h3>
            <span className={`badge st-${e.status}`}>{STATUS_BG[e.status as keyof typeof STATUS_BG]}</span>
          </div>
          <p className="small left">{siteName(e.siteId)} · {e.locationHint}{e.serial ? ` · № ${e.serial}` : ''}{e.listedAedId ? ' · 📍 на публичната карта' : ''}</p>
          <ul className="checks">
            {e.checks.map((c: any) => (
              <li key={c.key} className={`st-${c.status}`}><span>{c.label}</span><span>{fmt(c.due)} · {left(c.daysLeft)}</span></li>
            ))}
          </ul>
          {e.kind === 'aed' && e.gaps.length > 0 && e.listedAedId && (
            <p className="hint warn">По проекта на наредбата на МЗ липсва: {e.gaps.map((g: string) => data.checklistLabels[g]).join('; ')}.</p>
          )}
          <div className="row">
            <button className="ghost" onClick={() => setOpen(open === `log:${e.id}` ? null : `log:${e.id}`)}>Отбележи дейност</button>
            {e.kind === 'aed' && <button className="ghost" onClick={() => setOpen(open === `pub:${e.id}` ? null : `pub:${e.id}`)}>Публична карта</button>}
          </div>
          {open === `log:${e.id}` && <LogForm eq={e} done={() => (setOpen(null), reload())} />}
          {open === `pub:${e.id}` && <ListingForm eq={e} labels={data.checklistLabels} done={() => (setOpen(null), reload())} />}
        </section>
      ))}
      {items.length === 0 && <p className="small">Няма оборудване по този филтър.</p>}

      {adding ? <AddForm sites={sites} done={() => (setAdding(false), reload())} /> : <button className="next" onClick={() => setAdding(true)}>+ Добави оборудване</button>}

      <section className="card">
        <div className="card-row">
          <h3>Напомняния</h3>
          <button className="ghost" onClick={async () => { const r = await api('/api/rpc/run_reminders', {}); setMsg(r.sent ? `Изпратени: ${r.sent}` : 'Няма нови напомняния.'); reload(); }}>Провери сега</button>
        </div>
        <p className="small left">При 30, 7 и 0 дни преди срока и всяка седмица след това. В учебната среда имейлите не излизат — показваме ги тук.{msg ? ` ${msg}` : ''}</p>
        <div className="outbox">
          {data.outbox.length === 0 && <p className="small left">Няма.</p>}
          {data.outbox.map((m: any) => (
            <div key={m.id}><code>{new Date(m.at).toLocaleString('bg-BG')}</code> → {m.to}<br /><strong>{m.subject}</strong><br /><span className="small">{m.body}</span></div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Отчет и дневник</h3>
        <p className="small left">CSV за проверка (по обект, вид, срок и статус) — за ръководството, одитора или пожарната.</p>
        <button className="primary" onClick={download}>Изтегли отчет (CSV)</button>
        {data.log.length > 0 && (
          <ol className="timeline">
            {data.log.map((l: any) => <li key={l.id}><code>{fmt(l.date)}</code> {l.by} · {CHECK_LABEL[l.action as CheckKey]} · {data.equipment.find((x: any) => x.id === l.equipmentId)?.model}{l.note ? ` — ${l.note}` : ''}</li>)}
          </ol>
        )}
      </section>
    </main>
  );
}

function LogForm({ eq, done }: { eq: any; done: () => void }) {
  const actions = ACTIONS[eq.kind as EquipmentKind];
  const [f, setF] = useState({ action: actions[0]![0], date: new Date().toISOString().slice(0, 10), newExpiry: '', note: '' });
  const [err, setErr] = useState<string | null>(null);
  const needsExpiry = EXPIRY.includes(f.action);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/api/rpc/log_maintenance', { equipmentId: eq.id, ...f, newExpiry: needsExpiry ? f.newExpiry : undefined });
          done();
        } catch (x) {
          setErr((x as Error).message);
        }
      }}
    >
      <label>Дейност<select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value as CheckKey })}>{actions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>Дата<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      {needsExpiry && <label>Нов срок на годност (от етикета)<input type="date" value={f.newExpiry} onChange={(e) => setF({ ...f, newExpiry: e.target.value })} required /></label>}
      <label>Бележка<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="напр. фирма, протокол №" /></label>
      {err && <p className="error">{err}</p>}
      <button className="primary">Запиши</button>
    </form>
  );
}

function ListingForm({ eq, labels, done }: { eq: any; labels: Record<string, string>; done: () => void }) {
  const [c, setC] = useState({ signage: false, directionSigns: false, instructionsBg: false, accessible: false, ...eq.publicPlace });
  const [hours, setHours] = useState(eq.openingHours ?? '');
  const [err, setErr] = useState<string | null>(null);
  const save = async (listed: boolean) => {
    try {
      await api('/api/rpc/set_listing', { equipmentId: eq.id, listed, checklist: c, openingHours: hours });
      done();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="form">
      <p className="small left">Проект на наредба на МЗ (април 2026): АВД на обществено място трябва да е видим, леснодостъпен, обозначен, с указателни знаци и инструкции на български, и поддържан по изискванията на производителя.</p>
      {(['signage', 'directionSigns', 'instructionsBg', 'accessible'] as const).map((k) => (
        <label key={k} className="check"><input type="checkbox" checked={!!c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} /> {labels[k]}</label>
      ))}
      <label>Работно време (OSM формат)<input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="24/7 или Mo-Fr 08:00-18:00" /></label>
      <p className="small left">На картата гражданите виждат само „✓ поддръжката се следи“ или „⚠ поддръжката е просрочена“ — без дати и контакти. Устройство с изтекла батерия или електроди не се предлага на доброволци.</p>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button className="primary" onClick={() => save(true)}>{eq.listedAedId ? 'Запази' : 'Покажи на картата'}</button>
        {eq.listedAedId && <button className="ghost" onClick={() => save(false)}>Махни от картата</button>}
      </div>
    </div>
  );
}

function AddForm({ sites, done }: { sites: any[]; done: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ kind: 'aed', siteId: sites[0]?.id ?? '', model: '', serial: '', locationHint: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const date = (k: string, label: string) => <label key={k}>{label}<input type="date" value={f[k] ?? ''} onChange={set(k)} /></label>;
  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/api/rpc/add_equipment', Object.fromEntries(Object.entries(f).filter(([, v]) => v)));
          done();
        } catch (x) {
          setErr((x as Error).message);
        }
      }}
    >
      <h3>Ново оборудване</h3>
      <label>Вид<select value={f.kind} onChange={set('kind')}>{(Object.keys(KIND_LABEL) as EquipmentKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
      <label>Обект<select value={f.siteId} onChange={set('siteId')}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Модел<input value={f.model} onChange={set('model')} required /></label>
      <label>Сериен номер<input value={f.serial} onChange={set('serial')} /></label>
      <label>Къде точно<input value={f.locationHint} onChange={set('locationHint')} placeholder="напр. до охраната, вход Б" /></label>
      {f.kind === 'aed' && [date('batteryExpires', 'Батерия — годна до'), date('padsExpires', 'Електроди — годни до'), date('lastService', 'Последен сервиз')]}
      {f.kind === 'extinguisher' && [date('lastService', 'Последно обслужване'), date('lastHydro', 'Последно изпитване под налягане')]}
      {f.kind === 'first_aid_kit' && date('contentsExpire', 'Най-ранен срок на годност в аптечката')}
      {date('lastInspection', 'Последен оглед')}
      <p className="small left">Интервалите са по подразбиране (оглед на AED — 30 дни, сервиз — 12 месеца, изпитване на пожарогасител — 5 години). Сверете ги с инструкцията на производителя.</p>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button className="primary">Добави</button>
        <button type="button" className="ghost" onClick={done}>Откажи</button>
      </div>
    </form>
  );
}
