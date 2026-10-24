import { useEffect, useRef } from 'react';

/**
 * Calls onBeat every intervalMs while running, correcting for timer drift
 * (schedules against the start time, not the previous tick), so the rhythm
 * holds at 110/min even over minutes of CPR.
 */
export function useMetronome(running: boolean, intervalMs: number, onBeat: (n: number) => void) {
  const cb = useRef(onBeat);
  cb.current = onBeat;

  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    let n = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      n += 1;
      cb.current(n);
      t = setTimeout(tick, Math.max(0, start + n * intervalMs - Date.now()));
    };
    t = setTimeout(tick, 0);
    return () => clearTimeout(t);
  }, [running, intervalMs]);
}
