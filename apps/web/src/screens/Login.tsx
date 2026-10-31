import { useState } from 'react';
import { api, setToken, type Role } from '../api';

const ACCOUNTS = [
  ['responder', 'Доброволец', 'получава известия, приема „Тръгвам“ / „Нося AED“'],
  ['dispatcher', 'Диспечер', 'конзола, живa карта, „Стартирай учение“'],
  ['verifier', 'Верификатор', 'одобрява AED предложения и удостоверения'],
  ['owner', 'Отговорник безопасност (фирма)', 'AED, пожарогасители и аптечки: срокове, напомняния, отчет'],
  ['admin', 'Администратор', 'всичко + флагове, одит, нулиране'],
] as const;

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
      <div className="accounts">
        {ACCOUNTS.map(([id, name, what]) => (
          <button key={id} className="account" onClick={() => login(`${id}@drill.defikarta.bg`)}>
            <strong>{name}</strong>
            <span>{what}</span>
            <code>{id}@drill.defikarta.bg</code>
          </button>
        ))}
      </div>
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
