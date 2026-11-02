import type { Aed } from './types';

/**
 * Devices found in public sources before the team's mapping walk.
 * Coordinates are the building (from OSM or the source map), not the exact device spot.
 * Opening hours stay empty unless the source states them; nobody from the team has checked these yet.
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
  {
    id: 'seed:decathlon-stara-zagora',
    source: 'seed',
    name: 'Decathlon Стара Загора',
    lat: 42.427799,
    lon: 25.662597,
    indoor: true,
    access: 'customers',
    note: 'бул. „Никола Петков“ 52. По картата на firstaid.bg: в работно време, свободен достъп; последна проверка там 20.08.2023. Мястото в магазина не е проверено.',
  },
  {
    id: 'seed:metro-stara-zagora',
    source: 'seed',
    name: 'Metro Стара Загора',
    lat: 42.434073,
    lon: 25.690961,
    indoor: true,
    access: 'customers',
    note: 'ул. „Хрищян войвода“ 30. По картата на firstaid.bg: в работно време, достъп само с придружител от персонала; последна проверка там 26.01.2024.',
  },
  {
    id: 'seed:omv-orizovo',
    source: 'seed',
    name: 'OMV Оризово (АМ „Тракия“, 165 км)',
    lat: 42.19156,
    lon: 25.19136,
    indoor: true,
    access: 'yes',
    openingHours: '24/7',
    note: 'Бензиностанция OMV, дясно платно към Бургас. В картата на firstaid.bg (24/7, свободен, проверен 01.12.2023) и в списъка на OMV с бензиностанции с АВД. Точното място в сградата не е известно.',
  },
];
