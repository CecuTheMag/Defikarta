import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * What the viewer has done in „Научи“: reels seen, reels marked useful, voice on or off.
 * One small store so Home (the „НОВО“ badge) and the feed agree without a context provider.
 */
export interface LearnState {
  seen: string[];
  liked: string[];
  voice: boolean;
}

const KEY = 'learn.v1';
let state: LearnState = { seen: [], liked: [], voice: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

AsyncStorage.getItem(KEY).then(
  (raw) => {
    if (!raw) return;
    try {
      state = { ...state, ...JSON.parse(raw) };
      emit();
    } catch {
      // A broken cache only costs the badge and the hearts; start clean.
    }
  },
  () => undefined,
);

function set(patch: Partial<LearnState>) {
  state = { ...state, ...patch };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

export const learn = {
  markSeen: (id: string) => !state.seen.includes(id) && set({ seen: [...state.seen, id] }),
  toggleLike: (id: string) => set({ liked: state.liked.includes(id) ? state.liked.filter((x) => x !== id) : [...state.liked, id] }),
  like: (id: string) => !state.liked.includes(id) && set({ liked: [...state.liked, id] }),
  setVoice: (voice: boolean) => set({ voice }),
};

export function useLearn() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}
