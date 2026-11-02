import type { Aed } from './types';

/**
 * Every AED in Stara Zagora province that a public source confirms, until the team's mapping walk
 * verifies them and adds them to OSM. The full search (what was checked, what was ruled out) is in
 * README → AED data. Rule for a point to be here: a named public source says the device exists,
 * we know the building, and a passer-by or a member of the public can reach it.
 * Coordinates are the building (OSM) or the source's own pin, not the exact cabinet.
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
    note: 'Дарен на 14.05.2026 от „Спасителен клуб за бъдеще“ („Капачки за бъдеще“), по съобщение на Община Стара Загора. Мястото в сградата и часовете не са проверени.',
  },
  {
    id: 'seed:pgoh-rayna-knyaginya',
    source: 'seed',
    name: 'ПГОХ „Райна Княгиня“',
    lat: 42.4246551,
    lon: 25.6240459,
    indoor: true,
    access: 'customers',
    note: 'Дарен на 14.05.2026 от „Спасителен клуб за бъдеще“ („Капачки за бъдеще“), по съобщение на Община Стара Загора. Мястото в сградата и часовете не са проверени.',
  },
  {
    id: 'seed:pg-ivan-hadzhienov-kazanlak',
    source: 'seed',
    name: 'ПГ „Иван Хаджиенов“, Казанлък',
    lat: 42.6213063,
    lon: 25.4063331,
    indoor: true,
    access: 'customers',
    note: 'Дарен на 24.06.2026 от „Спасителен клуб за бъдеще“ („Капачки за бъдеще“), по PressTV Казанлък. Мястото в сградата и часовете не са проверени.',
  },
  {
    id: 'seed:decathlon-stara-zagora',
    source: 'seed',
    name: 'Decathlon Стара Загора',
    lat: 42.427799,
    lon: 25.662597,
    indoor: true,
    access: 'customers',
    note: 'бул. „Никола Петков“ 52. По картата на firstaid.bg: в работно време, свободен достъп, видимо обозначен, обучен персонал; поставен и проверен там 20.08.2023. Мястото в магазина не е проверено.',
  },
  {
    id: 'seed:metro-stara-zagora',
    source: 'seed',
    name: 'Metro Стара Загора',
    lat: 42.434073,
    lon: 25.690961,
    indoor: true,
    access: 'customers',
    note: 'ул. „Хрищян войвода“ 30. По картата на firstaid.bg: в работно време, достъп само с придружител от персонала; поставен и проверен там 26.01.2024.',
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
    note: 'Бензиностанция OMV, дясно платно към Бургас. По картата на firstaid.bg: 24/7, свободен, поставен 10.01.2023, проверен 01.12.2023. Точното място в сградата не е известно.',
  },
];
