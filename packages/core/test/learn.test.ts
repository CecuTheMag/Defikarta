import { describe, expect, it } from 'vitest';
import { LEARN_REELS, tempoFromTaps } from '../src';

describe('learn feed', () => {
  it('has unique ids and ends on the finale', () => {
    const ids = LEARN_REELS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LEARN_REELS.at(-1)?.kind).toBe('finale');
  });
  it('gives every reel something to say aloud', () => {
    for (const r of LEARN_REELS) expect(r.say.length).toBeGreaterThan(10);
  });
});

describe('tempoFromTaps', () => {
  const every = (ms: number, n: number) => Array.from({ length: n }, (_, i) => 1000 + i * ms);
  it('needs a few taps first', () => {
    expect(tempoFromTaps([0, 545])).toBeNull();
  });
  it('measures 110/min', () => {
    expect(tempoFromTaps(every(545, 6))).toBe(110);
  });
  it('starts over after a pause', () => {
    expect(tempoFromTaps([...every(545, 4), 5000])).toBeNull();
  });
});
