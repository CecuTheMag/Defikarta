import { useCallback, useEffect, useRef, useState } from 'react';

export type Role = 'public' | 'responder' | 'aed_owner' | 'verifier' | 'dispatcher' | 'admin';
export interface Me {
  user: { id: string; email: string; name: string; roles: Role[] };
  responder: any | null;
}
export interface Config {
  env: string;
  region: { name: string; emsEtaMin: number; center: { lat: number; lon: number } };
  flags: Record<string, boolean | number>;
  simSpeed: number;
}

const TOKEN_KEY = 'defikarta:token';
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the session just won't survive a reload
  }
};

/** Random per-browser id so a bystander can cancel their own alert and the server can rate-limit them. */
export const deviceId = (): string => {
  try {
    let id = localStorage.getItem('defikarta:device');
    if (!id) localStorage.setItem('defikarta:device', (id = crypto.randomUUID()));
    return id;
  } catch {
    return 'anon';
  }
};

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

/** The server pings "changed" over SSE; the callback refetches whatever the screen needs. EventSource reconnects on its own. */
export function useStream(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = () => cb.current();
    return () => es.close();
  }, []);
}

/** Load once, reload on every server ping and every `everyMs`. */
export function useLive<T>(load: () => Promise<T>, everyMs = 4000): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => {
    loadRef.current().then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, everyMs);
    return () => clearInterval(t);
  }, [reload, everyMs]);
  useStream(reload);
  return { data, error, reload };
}

export function useConfig(): Config | null {
  const [c, setC] = useState<Config | null>(null);
  useEffect(() => {
    api<Config>('/api/config').then(setC, () => setC(null));
  }, []);
  return c;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(() => {
    if (!getToken()) {
      setMe(null);
      setReady(true);
      return;
    }
    api<Me>('/api/me').then(setMe, () => setToken(null)).finally(() => setReady(true));
  }, []);
  useEffect(refresh, [refresh]);
  return { me, ready, refresh };
}

export const fmtDur = (s: number | null | undefined) => (s == null ? '—' : s < 60 ? `${Math.round(s)} с` : `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`);
