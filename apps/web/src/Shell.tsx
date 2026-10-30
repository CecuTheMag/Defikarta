import { useEffect, useState } from 'react';
import { App } from './App';
import { setToken, useConfig, useMe } from './api';
import { AddAed } from './screens/AddAed';
import { Console } from './screens/Console';
import { Coverage } from './screens/Coverage';
import { Login } from './screens/Login';
import { Responder } from './screens/Responder';

const ROUTES = ['', 'add', 'responder', 'console', 'coverage', 'login'] as const;
type RouteName = (typeof ROUTES)[number];

const routeOf = (): RouteName => {
  const h = location.hash.replace(/^#\/?/, '') as RouteName;
  return ROUTES.includes(h) ? h : '';
};

/** Drill-environment shell: every screen carries the „УЧЕНИЕ“ strip (BLUEPRINT principle 4 / safety rule 6). */
export function Shell() {
  const [route, setRoute] = useState<RouteName>(routeOf);
  const cfg = useConfig();
  const { me, refresh } = useMe();
  useEffect(() => {
    const on = () => setRoute(routeOf());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: RouteName) => (location.hash = r ? `#/${r}` : '#/');
  const link = (r: RouteName, label: string) => (
    <a key={r} href={r ? `#/${r}` : '#/'} className={route === r ? 'on' : ''}>
      {label}
    </a>
  );

  return (
    <div className="shell">
      {cfg?.env === 'drill' && (
        <nav className="strip">
          <span className="drill">УЧЕНИЕ</span>
          <span className="strip-links">
            {link('', 'Карта')}
            {link('add', 'Добави AED')}
            {link('responder', 'Доброволец')}
            {link('console', 'Конзола')}
            {link('coverage', 'Покритие')}
            {me ? (
              <a
                href="#/login"
                onClick={(e) => {
                  e.preventDefault();
                  setToken(null);
                  refresh();
                  go('login');
                }}
                title="Изход"
              >
                {me.user.name} ✕
              </a>
            ) : (
              link('login', 'Вход')
            )}
          </span>
        </nav>
      )}
      <div className="shell-body">
        {route === '' && <App config={cfg} />}
        {route === 'add' && <AddAed />}
        {route === 'login' && <Login onDone={() => { refresh(); go('responder'); }} />}
        {route === 'responder' && <Responder me={me} refreshMe={refresh} goLogin={() => go('login')} />}
        {route === 'console' && <Console me={me} goLogin={() => go('login')} />}
        {route === 'coverage' && <Coverage />}
      </div>
    </div>
  );
}
