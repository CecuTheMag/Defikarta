import type { Aed } from './types';

/**
 * Devices found in public sources before the team's mapping walk.
 * Coordinates are the school building (from OSM), not the exact device spot.
 * Opening hours are unknown until someone checks in person, so they stay empty.
 */
export const SEED_AEDS: Aed[] = [
  {
    id: 'seed:gpche-romain-rolland',
    source: 'seed',
    name: 'ГПЧЕ „Ромен Ролан“',
    lat: 42.4280594,
    lon: 25.6299884,
    indoor: true,
    access: 'customers',
    note: 'Дарен май 2026 („Капачки за бъдеще“). Мястото в сградата и часовете не са проверени.',
  },
  {
    id: 'seed:pgoh-rayna-knyaginya',
    source: 'seed',
    name: 'ПГОХ „Райна Княгиня“',
    lat: 42.4246551,
    lon: 25.6240459,
    indoor: true,
    access: 'customers',
    note: 'Дарен 2026 („Спасителен клуб за бъдеще“). Мястото в сградата и часовете не са проверени.',
  },
];
