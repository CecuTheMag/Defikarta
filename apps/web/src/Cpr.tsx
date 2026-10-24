import { BEAT_INTERVAL_MS, BEFORE_CPR, CPR_BPM, cueFor, DURING_CPR_TIPS } from '@defikarta/core';
import { useEffect, useRef, useState } from 'react';

function say(text: string) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'bg-BG';
  speechSynthesis.speak(u);
}

/**
 * Web Audio metronome scheduled on the audio clock (sample-accurate, unaffected
 * by React renders or busy main thread).
 */
function useWebMetronome(running: boolean, onBeat: (n: number) => void) {
  const cb = useRef(onBeat);
  cb.current = onBeat;
  useEffect(() => {
    if (!running) return;
    const ctx = new AudioContext();
    const period = BEAT_INTERVAL_MS / 1000;
    let next = ctx.currentTime + 0.05;
    let n = 0;
    const timers: number[] = [];
    const schedule = () => {
      while (next < ctx.currentTime + 0.2) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 1800;
        gain.gain.setValueAtTime(0.8, next);
        gain.gain.exponentialRampToValueAtTime(0.001, next + 0.03);
        osc.connect(gain).connect(ctx.destination);
        osc.start(next);
        osc.stop(next + 0.035);
        const beat = ++n;
        timers.push(window.setTimeout(() => cb.current(beat), Math.max(0, (next - ctx.currentTime) * 1000)));
        next += period;
      }
    };
    const id = window.setInterval(schedule, 50);
    schedule();
    return () => {
      clearInterval(id);
      timers.forEach(clearTimeout);
      ctx.close();
    };
  }, [running]);
}

export function Cpr() {
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [voice, setVoice] = useState(true);
  const circle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Keep the screen on during CPR where supported.
    let lock: WakeLockSentinel | undefined;
    if (running) navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release();
  }, [running]);

  useEffect(() => () => speechSynthesis?.cancel(), []);

  useWebMetronome(running, (n) => {
    setCount(n);
    circle.current?.animate([{ transform: 'scale(0.88)' }, { transform: 'scale(1)' }], { duration: BEAT_INTERVAL_MS * 0.8, easing: 'ease-out' });
    navigator.vibrate?.(60);
    const cue = cueFor(n);
    if (cue && voice) say(cue);
  });

  const toggle = () => {
    speechSynthesis?.cancel();
    if (!running) {
      setCount(0);
      if (voice) say('Натискай силно и бързо, в ритъма на сигнала.');
    }
    setRunning(!running);
  };

  return (
    <div className="cpr">
      {!running && (
        <ol className="steps">
          {BEFORE_CPR.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>
              <span>{s.body}</span>
            </li>
          ))}
        </ol>
      )}
      <button ref={circle} className={`circle ${running ? 'on' : ''}`} onClick={toggle} aria-label={running ? 'Спри метронома' : 'Започни масаж'}>
        {running ? (
          <>
            <span className="count">{count}</span>
            <span className="sub">натискания · {CPR_BPM}/мин</span>
          </>
        ) : (
          <span className="start">Започни масаж</span>
        )}
      </button>
      <label className="voice">
        <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Гласови указания
      </label>
      {running && (
        <ul className="tips">
          {DURING_CPR_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
