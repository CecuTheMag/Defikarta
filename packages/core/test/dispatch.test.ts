import { describe, expect, it } from 'vitest';
import {
  coverageGrid,
  DEFAULT_DISPATCH,
  nextAssignmentStatus,
  nextIncidentState,
  planWave,
  recommendPlacements,
  replayIncident,
  type Aed,
  type Candidate,
  type DispatchAed,
  type IncidentEvent,
} from '../src';

const P = { lat: 42.4258, lon: 25.6345 };
/** Offset in metres north/east of P. */
const at = (n: number, e = 0) => ({ lat: P.lat + n / 111_320, lon: P.lon + e / (111_320 * Math.cos((P.lat * Math.PI) / 180)) });
const cand = (id: string, n: number, e = 0): Candidate => ({ id, pos: at(n, e), acceptCount: 0, offerCount: 0 });
const base = { patient: P, wave: 0, emsEtaS: 12 * 60, acceptedCpr: 0, acceptedRunners: 0 };

describe('planWave', () => {
  it('sends one runner to the AED and CPR responders straight to the patient', () => {
    const aed: DispatchAed = { id: 'a1', ...at(150, 100) };
    const offers = planWave({ ...base, candidates: [cand('r1', 120, 80), cand('r2', 200), cand('r3', 300), cand('r4', 350)], aeds: [aed] });
    const runners = offers.filter((o) => o.role === 'aed_runner');
    expect(runners.length).toBeGreaterThanOrEqual(1);
    expect(runners.length).toBeLessThanOrEqual(DEFAULT_DISPATCH.maxRunnerOffers);
    expect(runners[0]!.aedId).toBe('a1');
    expect(offers.filter((o) => o.role === 'cpr').length).toBeGreaterThanOrEqual(2);
  });

  it('never offers the same responder twice and respects the per-wave cap', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => cand(`r${i}`, 50 + i * 10));
    const offers = planWave({ ...base, candidates, aeds: [{ id: 'a1', ...at(100) }] });
    expect(new Set(offers.map((o) => o.responderId)).size).toBe(offers.length);
    expect(offers.length).toBeLessThanOrEqual(DEFAULT_DISPATCH.maxOffersPerWave);
  });

  it('skips the AED runner when the trip would not beat the ambulance with margin', () => {
    const far: DispatchAed = { id: 'far', ...at(1400) };
    const offers = planWave({ ...base, wave: 2, emsEtaS: 300, candidates: [cand('r1', 400)], aeds: [far] });
    expect(offers.some((o) => o.role === 'aed_runner')).toBe(false);
  });

  it('does not offer a claimed AED and keeps candidates outside the wave radius out', () => {
    const offers = planWave({ ...base, candidates: [cand('far', 900)], aeds: [{ id: 'a1', ...at(100), claimed: true }] });
    expect(offers).toHaveLength(0);
  });

  it('widens the radius with each wave', () => {
    const input = { ...base, candidates: [cand('r1', 800)], aeds: [] };
    expect(planWave(input)).toHaveLength(0);
    expect(planWave({ ...input, wave: 1 })).toHaveLength(1);
  });

  it('asks for fewer CPR offers once enough have accepted', () => {
    const candidates = [cand('r1', 100), cand('r2', 150), cand('r3', 200)];
    expect(planWave({ ...base, candidates, aeds: [], acceptedCpr: 2 })).toHaveLength(0);
  });

  it('is deterministic', () => {
    const input = { ...base, candidates: [cand('r1', 100), cand('r2', 100, 20)], aeds: [{ id: 'a1', ...at(60) }] };
    expect(planWave(input)).toEqual(planWave(input));
  });
});

describe('incident state machine', () => {
  it('walks the happy path', () => {
    let s = nextIncidentState('DISPATCHING', 'offer_accepted');
    expect(s).toBe('RESPONDING');
    s = nextIncidentState(s!, 'on_scene');
    expect(s).toBe('ON_SCENE');
    expect(nextIncidentState(s!, 'aed_on_scene')).toBe('AED_ON_SCENE');
  });
  it('never leaves CLOSED', () => {
    const events: IncidentEvent[] = ['wave_timeout_next', 'wave_timeout_failed', 'offer_accepted', 'on_scene', 'aed_on_scene', 'ems_on_scene', 'cancel', 'close'];
    for (const e of events) expect(nextIncidentState('CLOSED', e)).toBeNull();
  });
  it('replay is stable', () => {
    expect(replayIncident(['offer_accepted', 'on_scene', 'aed_on_scene', 'ems_on_scene', 'close'])).toBe('CLOSED');
    expect(replayIncident(['wave_timeout_next', 'wave_timeout_failed'])).toBe('DISPATCH_FAILED');
  });
  it('only lets an AED runner collect then deliver, in order', () => {
    expect(nextAssignmentStatus('aed_runner', 'en_route', 'aed_on_scene')).toBeNull();
    expect(nextAssignmentStatus('aed_runner', 'en_route', 'aed_collected')).toBe('aed_collected');
    expect(nextAssignmentStatus('aed_runner', 'aed_collected', 'aed_on_scene')).toBe('aed_on_scene');
    expect(nextAssignmentStatus('cpr', 'en_route', 'aed_collected')).toBeNull();
  });
});

describe('coverage', () => {
  const aeds: Aed[] = [{ id: 'x', source: 'seed', name: 'x', ...P, openingHours: 'Mo-Fr 08:00-18:00' }];
  const bbox: [number, number, number, number] = [P.lat - 0.02, P.lon - 0.03, P.lat + 0.02, P.lon + 0.03];
  it('counts a device with limited hours out at night and for the 24/7 scenario', () => {
    expect(coverageGrid(bbox, aeds, 'weekday').within5).toBeGreaterThan(0);
    expect(coverageGrid(bbox, aeds, 'night').within5).toBe(0);
    expect(coverageGrid(bbox, aeds, 'always').within5).toBe(0);
  });
  it('recommends the site covering the most uncovered area first', () => {
    const { cells } = coverageGrid(bbox, [], 'now', 250);
    const picks = recommendPlacements(cells, [{ name: 'outside', ...at(2600, 3000) }, { name: 'middle', ...P }], 2);
    expect(picks[0]!.name).toBe('middle');
    expect(picks[0]!.gainCells).toBeGreaterThan(0);
    expect(picks).toHaveLength(1); // the outside site covers nothing, so it is never recommended
  });
});
