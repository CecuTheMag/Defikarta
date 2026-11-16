/**
 * Bakes the data the public website (apps/mobile/public/site) shows: the confirmed AEDs from
 * packages/core/src/seed.ts plus display details, and the coverage grid computed with the app's own
 * coverage code. Run it again when the seed changes:
 *
 *   npx tsx scripts/bake-site-data.mts
 *
 * Output: apps/mobile/public/site/data/site-data.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const coreDir = process.env.CORE_DIR ?? resolve(here, '../packages/core/src');
const out = resolve(here, '../apps/mobile/public/site/data/site-data.json');

const { SEED_AEDS } = await import(pathToFileURL(resolve(coreDir, 'seed.ts')).href);
const { coverageGrid } = await import(pathToFileURL(resolve(coreDir, 'coverage.ts')).href);

/** Same rectangle the server's /api/coverage uses: Stara Zagora city. */
const CITY_BBOX: [number, number, number, number] = [42.405, 25.595, 42.445, 25.67];
const STEP_M = 250;

interface Display {
  kind: string;
  city: string;
  address?: string;
  hint?: string;
  hours?: string;
  accessText?: string;
  source: string;
  sourceUrl?: string;
  extra?: string;
}

/** What the sources say, in words for the page. Nothing here is guessed: each line comes from the note in seed.ts or from the venue's own reply. */
const DISPLAY: Record<string, Display> = {
  'seed:gpche-romain-rolland': {
    kind: 'Училище',
    city: 'Стара Загора',
    accessText: 'За посетители на сградата',
    source: 'Дарение на „Спасителен клуб за бъдеще“ („Капачки за бъдеще“), 14.05.2026, по съобщение на Община Стара Загора',
    extra: 'Мястото в сградата и работното време още не са проверени на място.',
  },
  'seed:pgoh-rayna-knyaginya': {
    kind: 'Училище',
    city: 'Стара Загора',
    accessText: 'За посетители на сградата',
    source: 'Дарение на „Спасителен клуб за бъдеще“ („Капачки за бъдеще“), 14.05.2026, по съобщение на Община Стара Загора',
    extra: 'Мястото в сградата и работното време още не са проверени на място.',
  },
  'seed:pg-ivan-hadzhienov-kazanlak': {
    kind: 'Училище',
    city: 'Казанлък',
    hint: 'Корпус 2, втори етаж. Достъпът е през централния вход на корпуса.',
    hours: 'Само в учебно време: извън него сградата е затворена и уредът не може да се вземе.',
    accessText: 'Само в работното време на училището',
    source: 'Дарение на „Спасителен клуб за бъдеще“ („Капачки за бъдеще“), 24.06.2026, по PressTV Казанлък. Мястото и достъпът са по отговор на училището от 16.11.2026.',
    extra: 'Училището е дало съгласие за QR стикер до уреда. За поддръжката отговаря заместник-директорът по учебната дейност.',
  },
  'seed:decathlon-stara-zagora': {
    kind: 'Магазин',
    city: 'Стара Загора',
    address: 'бул. „Никола Петков“ 52',
    hours: 'В работното време на магазина. Точните часове не са проверени.',
    accessText: 'Свободен достъп в работно време',
    source: 'Картата на firstaid.bg („Първите три минути“): видимо обозначен, обучен персонал, поставен и проверен там на 20.08.2023',
    sourceUrl: 'https://firstaid.bg',
    extra: 'Мястото в магазина не е проверено от нашия екип.',
  },
  'seed:metro-stara-zagora': {
    kind: 'Търговски обект',
    city: 'Стара Загора',
    address: 'ул. „Хрищян войвода“ 30',
    hours: 'В работното време на обекта. Точните часове не са проверени.',
    accessText: 'Само с придружител от персонала',
    source: 'Картата на firstaid.bg („Първите три минути“): поставен и проверен там на 26.01.2024',
    sourceUrl: 'https://firstaid.bg',
  },
  'seed:omv-orizovo': {
    kind: 'Бензиностанция',
    city: 'Оризово',
    address: 'OMV, АМ „Тракия“, 165 км, дясно платно към Бургас',
    hours: 'Денонощно',
    accessText: 'Свободен достъп',
    source: 'Картата на firstaid.bg („Първите три минути“): поставен на 10.01.2023, проверен на 01.12.2023',
    sourceUrl: 'https://firstaid.bg',
    extra: 'Точното място в сградата не е известно.',
  },
};

const aeds = (SEED_AEDS as any[]).map((a) => {
  const d = DISPLAY[a.id];
  if (!d) throw new Error(`No display text for ${a.id}: add it to DISPLAY in scripts/bake-site-data.mts`);
  return {
    id: a.id,
    name: a.name,
    lat: a.lat,
    lon: a.lon,
    indoor: a.indoor ?? null,
    access: a.access ?? null,
    openingHours: a.openingHours ?? null,
    verifiedAt: a.verifiedAt ?? null,
    ...d,
  };
});

const scenarios: Record<string, unknown> = {};
for (const [key, scenario] of [['now', 'now'], ['always', 'always']] as const) {
  const r = coverageGrid(CITY_BBOX, SEED_AEDS, scenario, STEP_M);
  const cells = r.cells as { lat: number; lon: number; min: number | null }[];
  const share = (limit: number) => cells.filter((c) => c.min !== null && c.min <= limit).length / cells.length;
  scenarios[key] = {
    within5: Number(share(5).toFixed(4)),
    within10: Number(share(10).toFixed(4)),
    cells: cells.filter((c) => c.min !== null && c.min <= 10).map((c) => [Number(c.lat.toFixed(5)), Number(c.lon.toFixed(5)), c.min]),
  };
}

const data = {
  checkedAt: '2026-11-02',
  coverage: { bbox: CITY_BBOX, stepM: STEP_M, scenarios },
  aeds,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
console.log(`site-data.json: ${aeds.length} AEDs, within5 now ${(scenarios.now as any).within5}, always ${(scenarios.always as any).within5}`);
