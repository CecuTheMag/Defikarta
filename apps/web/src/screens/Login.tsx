import { useState } from 'react';
import { api, setToken, type Role } from '../api';

type Acc = readonly [id: string, name: string, what: string];

/** Every drill account, grouped. The list is also in README → Test accounts; the accounts themselves are seeded in apps/server/src/db.ts. */
const GROUPS: readonly (readonly [string, readonly Acc[]])[] = [
  ['Доброволци: стъпка по стъпка', [
    ['pending', 'Доброволец, чака проверка', 'удостоверението чака верификатор'],
    ['rejected', 'Доброволец, отхвърлено удостоверение', 'вижда причината и качва ново'],
    ['responder', 'Доброволец, нов', 'минава условията, съгласието и проверката на знанията'],
    ['consent', 'Доброволец, чака съгласие', 'условията са приети; остава съгласие за местоположение и проверка на знанията'],
    ['quiz', 'Доброволец, чака проверка на знанията', 'остава само проверката на знанията'],
    ['ready', 'Доброволец, готов', 'всичко попълнено: включва „Достъпен съм“ и получава известия'],
  ]],
  ['Доброволци: специални случаи', [
    ['expired', 'Доброволец, изтекло удостоверение', 'не получава известия, докато не го поднови'],
    ['suspended', 'Доброволец, спрян', 'не получава известия'],
    ['minor', 'Доброволец под 18', 'само учения в училище, не и случаи на улицата'],
    ['quiet', 'Доброволец, тихи часове', 'всичко е готово, но тихите часове са цял ден: не получава известия'],
    ['multi', 'Доброволец и отговорник', 'готов доброволец и втори собственик на „Мол Галерия“'],
  ]],
  ['Потребители', [
    ['public', 'Потребител', 'обикновен профил, още не е доброволец'],
    ['public2', 'Потребител 2', 'втори обикновен профил: един предлага AED, другият го гледа'],
  ]],
  ['Организации (по един отговорник на ситуация)', [
    ['owner', 'ДЕМО Тракия Метал', '3 обекта, 10 уреда: има в срок, наближаващи, просрочени и липсващи'],
    ['owner2', 'ДЕМО Тракия Метал, втори отговорник', 'вижда същата организация'],
    ['owner-ok', 'ДЕМО Мол Галерия: в срок', 'нищо просрочено'],
    ['owner-late', 'ДЕМО Склад Север: просрочено', 'всичко е просрочено, AED с изтекла батерия не се праща на никого'],
    ['owner-new', 'ДЕМО Нова Фирма: празно', 'един обект, още нищо въведено'],
    ['school', 'ДЕМО училище', '2 сгради, AED с електроди, които изтичат скоро'],
    ['municipality', 'ДЕМО Община', '5 вида обекти: училище, градина, зала, басейн, читалище'],
  ]],
  ['Екип и партньори', [
    ['dispatcher', 'Диспечер', 'конзола, жива карта, „Стартирай учение“'],
    ['dispatcher2', 'Диспечер ЦСМП', 'същото като диспечер, за проба на роля от спешна помощ'],
    ['verifier', 'Верификатор (БЧК)', 'одобрява AED предложения и удостоверения'],
    ['verifier2', 'Верификатор (Първите три минути)', 'същото, от друга организация'],
    ['trainer', 'Инструктор', 'диспечер и верификатор: води учение и одобрява на място'],
    ['admin', 'Администратор', 'всичко + флагове, одит, нулиране'],
  ]],
];

export function Login({ onDone }: { onDone: (roles: Role[]) => void }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function login(e: string) {
    try {
      const r = await api<{ token: string; user: { roles: Role[] } }>('/api/login', { email: e });
      setToken(r.token);
      onDone(r.user.roles);
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <main className="page">
      <h1>Вход</h1>
      <p className="lead">Учебна среда: тестовите профили са отворени. В реална среда входът е с имейл код (без пароли).</p>
      {GROUPS.map(([group, list]) => (
        <section key={group}>
          <h2 className="acc-group">{group}</h2>
          <div className="accounts">
            {list.map(([id, name, what]) => (
              <button key={id} className="account" onClick={() => login(`${id}@drill.defikarta.bg`)}>
                <strong>{name}</strong>
                <span>{what}</span>
                <code>{id}@drill.defikarta.bg</code>
              </button>
            ))}
          </div>
        </section>
      ))}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (email) login(email);
        }}
      >
        <label>
          Нов потребител (имейл)
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ime@example.com" type="email" />
        </label>
        <button className="primary">Влез / регистрирай се</button>
      </form>
      {err && <p className="error">{err}</p>}
      <p className="small">Публичният поток (112, масаж, най-близък AED) не изисква профил.</p>
    </main>
  );
}
