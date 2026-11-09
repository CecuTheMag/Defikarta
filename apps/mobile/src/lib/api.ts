import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Client for the drill server (apps/server). The address is editable on the login screen:
 * http://localhost:8791 works over USB after `adb reverse tcp:8791 tcp:8791`; on Wi-Fi use the computer's LAN address.
 */
// On web the drill server is served from the same origin under /api.
export const DEFAULT_SERVER = Platform.OS === 'web' && typeof location !== 'undefined' ? location.origin : 'http://localhost:8791';
const K = { server: 'defikarta:server', token: 'defikarta:token', device: 'defikarta:device' };

let server = DEFAULT_SERVER;
let token: string | null = null;
let device = 'anon';

export const apiReady: Promise<void> = (async () => {
  try {
    const [s, t, d] = await Promise.all([AsyncStorage.getItem(K.server), AsyncStorage.getItem(K.token), AsyncStorage.getItem(K.device)]);
    server = s ?? DEFAULT_SERVER;
    token = t;
    device = d ?? `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    if (!d) await AsyncStorage.setItem(K.device, device);
  } catch {
    // storage unavailable: defaults are fine for this session
  }
})();

export const getServer = () => server;
export const deviceId = () => device;
export const hasToken = () => !!token;

export async function setServer(url: string) {
  server = url.trim().replace(/\/+$/, '') || DEFAULT_SERVER;
  await AsyncStorage.setItem(K.server, server);
}

// The session listens here, so an expired login (e.g. the drill server restarted) drops back to „Вход“ instead of a dead end.
let onAuthLost: (() => void) | null = null;
export function setAuthLostHandler(fn: (() => void) | null) {
  onAuthLost = fn;
}

export async function setToken(t: string | null) {
  token = t;
  await (t ? AsyncStorage.setItem(K.token, t) : AsyncStorage.removeItem(K.token));
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  await apiReady;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(server + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && token) {
      await setToken(null);
      onAuthLost?.();
    }
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError' || (e as Error).message === 'Network request failed') throw new Error(`Няма връзка със сървъра (${server}).`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** A non-JSON download (the CSV report), with the same auth. */
export async function apiText(path: string): Promise<string> {
  await apiReady;
  const res = await fetch(server + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Load now, every `everyMs`, and whenever the app comes back to the foreground. */
export function usePoll<T>(load: () => Promise<T>, everyMs = 3000): { data: T | null; error: string | null; reload: () => void } {
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
    const sub = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [reload, everyMs]);
  return { data, error, reload };
}

export const fmtDur = (s: number | null | undefined) => (s == null ? '—' : s < 60 ? `${Math.round(s)} с` : `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`);
