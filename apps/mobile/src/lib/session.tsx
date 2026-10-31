import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, apiReady, hasToken, setToken } from './api';

export type Role = 'public' | 'responder' | 'aed_owner' | 'verifier' | 'dispatcher' | 'admin';
export interface Me {
  user: { id: string; email: string; name: string; roles: Role[] };
  responder: any | null;
}
export interface Config {
  env: string;
  region: { name: string; center: { lat: number; lon: number } };
  flags: Record<string, boolean | number>;
}

/** Where each role lands. Dispatching and verification stay on the computer (Конзола on the website). */
export const homeFor = (roles: Role[]) => (roles.includes('aed_owner') ? ('/org' as const) : ('/volunteer' as const));

interface Session {
  ready: boolean;
  me: Me | null;
  config: Config | null;
  refresh: () => Promise<void>;
  login: (email: string) => Promise<Me>;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

/** Who is logged in and the server's config (env, flags). The public emergency flow never waits for this. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<Config | null>(null);

  const refresh = useCallback(async () => {
    await apiReady;
    api<Config>('/api/config').then(setConfig, () => setConfig(null));
    if (!hasToken()) {
      setMe(null);
      setReady(true);
      return;
    }
    try {
      setMe(await api<Me>('/api/me'));
    } catch (e) {
      if (/влезеш|401/.test((e as Error).message)) await setToken(null);
      setMe(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string) => {
    const r = await api<{ token: string }>('/api/login', { email });
    await setToken(r.token);
    const m = await api<Me>('/api/me');
    setMe(m);
    api<Config>('/api/config').then(setConfig, () => undefined);
    return m;
  };
  const logout = async () => {
    await setToken(null);
    setMe(null);
  };

  return <Ctx.Provider value={{ ready, me, config, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
