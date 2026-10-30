import { distanceM, ROUTE_FACTOR, WALK_M_PER_MIN } from './geo';
import type { AssignmentRole } from './incident';
import type { LatLon } from './types';

/** Tunable constants (BLUEPRINT §6). Feature flags `dispatch.*` override these per region. */
export interface DispatchConfig {
  radiusM: number[];
  waveTimeoutS: number;
  maxWaves: number;
  targetCpr: number;
  targetAed: number;
  pAcceptDefault: number;
  maxOffersPerWave: number;
  /** Over-alerting runners must not starve the CPR role; a runner who loses the AED is downgraded to CPR on accept. */
  maxRunnerOffers: number;
  pickupS: number;
}

export const DEFAULT_DISPATCH: DispatchConfig = {
  radiusM: [500, 1000, 1500],
  waveTimeoutS: 30,
  maxWaves: 3,
  targetCpr: 2,
  targetAed: 1,
  pAcceptDefault: 0.3,
  maxOffersPerWave: 8,
  maxRunnerOffers: 2,
  pickupS: 60,
};

export interface Candidate {
  id: string;
  pos: LatLon;
  acceptCount: number;
  offerCount: number;
}

/** Closed devices must be filtered out by the caller; only reachable (open or unknown) ones are passed in. */
export interface DispatchAed extends LatLon {
  id: string;
  /** Indoors or not at street level: adds pickup time. */
  indoorOrLevel?: boolean;
  /** Already claimed by an en-route runner. */
  claimed?: boolean;
  /** Unknown opening hours are allowed but ranked lower. */
  unknownHours?: boolean;
}

export interface WaveInput {
  patient: LatLon;
  wave: number;
  emsEtaS: number;
  candidates: Candidate[];
  aeds: DispatchAed[];
  acceptedCpr: number;
  acceptedRunners: number;
  /** Seconds until the best accepted runner brings an AED; Infinity if none. */
  bestAedArrivalS?: number;
  config?: DispatchConfig;
  /** Walking seconds between two points. Phase 1 straight-line estimate; Phase 2 swaps in OSRM. */
  walk?: (a: LatLon, b: LatLon) => number;
}

export interface PlannedOffer {
  responderId: string;
  role: AssignmentRole;
  aedId?: string;
  tDirectS: number;
  tViaAedS?: number;
}

export function estimateWalkS(a: LatLon, b: LatLon): number {
  return Math.ceil((distanceM(a, b) * ROUTE_FACTOR) / (WALK_M_PER_MIN / 60));
}

/** Smoothed acceptance probability: starts at pAcceptDefault and learns from history. */
export function pAccept(c: Pick<Candidate, 'acceptCount' | 'offerCount'>, pDefault = DEFAULT_DISPATCH.pAcceptDefault): number {
  return (c.acceptCount + 1) / (c.offerCount + 1 / pDefault);
}

/**
 * Plan one dispatch wave. Deterministic for a given input, so it is unit- and property-tested without a database.
 * Candidates are assumed to already be eligible (verified, available, not busy, not already offered).
 */
export function planWave(input: WaveInput): PlannedOffer[] {
  const cfg = input.config ?? DEFAULT_DISPATCH;
  const walk = input.walk ?? estimateWalkS;
  const radius = cfg.radiusM[Math.min(input.wave, cfg.radiusM.length - 1)]!;

  const near = input.candidates.filter((c) => distanceM(c.pos, input.patient) <= radius);
  const needCpr = Math.max(0, cfg.targetCpr - input.acceptedCpr);
  const needAed = Math.max(0, cfg.targetAed - input.acceptedRunners);
  const bestAed = input.bestAedArrivalS ?? Infinity;
  const aeds = input.aeds.filter((a) => !a.claimed);

  const offers: PlannedOffer[] = [];
  const used = new Set<string>();

  // AED runner: the (responder, AED) pair that brings a device soonest, only if it beats the ambulance with margin.
  if (needAed > 0 && aeds.length > 0) {
    const pairs = near
      .flatMap((r) =>
        aeds.map((a) => {
          const pickup = cfg.pickupS + (a.indoorOrLevel ? 60 : 0) + (a.unknownHours ? 60 : 0);
          return { r, a, t: walk(r.pos, a) + pickup + walk(a, input.patient), direct: walk(r.pos, input.patient) };
        }),
      )
      .filter((p) => p.t < input.emsEtaS - 120 && p.t < bestAed - 60)
      .sort((x, y) => x.t - y.t);
    const want = Math.min(cfg.maxRunnerOffers, Math.ceil(needAed / pAccept(pairs[0]?.r ?? { acceptCount: 0, offerCount: 0 }, cfg.pAcceptDefault)));
    for (const p of pairs) {
      if (offers.length >= want) break;
      if (used.has(p.r.id)) continue;
      used.add(p.r.id);
      offers.push({ responderId: p.r.id, role: 'aed_runner', aedId: p.a.id, tDirectS: p.direct, tViaAedS: p.t });
    }
  }

  // CPR: the closest remaining candidates, over-alerted by the expected decline rate.
  if (needCpr > 0) {
    const rest = near
      .filter((r) => !used.has(r.id))
      .map((r) => ({ r, t: walk(r.pos, input.patient) }))
      .sort((x, y) => x.t - y.t);
    let expected = 0;
    for (const { r, t } of rest) {
      if (expected >= needCpr) break;
      expected += pAccept(r, cfg.pAcceptDefault);
      used.add(r.id);
      offers.push({ responderId: r.id, role: 'cpr', tDirectS: t });
    }
  }

  return offers.slice(0, cfg.maxOffersPerWave);
}
