import { describe, expect, it } from 'vitest';
import {
  BEAT_INTERVAL_MS,
  cueFor,
  distanceM,
  formatDistance,
  mergeAeds,
  openState,
  osmWalkingUrl,
  parseOverpass,
  rankAeds,
  SEED_AEDS,
  walkMinutes,
  type Aed,
} from '../src';

const here = { lat: 42.4258, lon: 25.6345 };

describe('geo', () => {
  it('measures a known distance (~1 km north)', () => {
    expect(distanceM(here, { lat: here.lat + 0.009, lon: here.lon })).toBeGreaterThan(990);
    expect(distanceM(here, { lat: here.lat + 0.009, lon: here.lon })).toBeLessThan(1010);
  });
  it('estimates walking time with a floor of 1 minute', () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(750)).toBe(13);
  });
  it('formats in Bulgarian units', () => {
    expect(formatDistance(234)).toBe('230 м');
    expect(formatDistance(1530)).toBe('1,5 км');
  });
});

describe('openState', () => {
  const wedNoon = new Date('2026-10-21T12:00:00');
  const wedNight = new Date('2026-10-21T23:00:00');
  it('treats 24/7 as open', () => expect(openState('24/7', wedNight)).toBe('open'));
  it('parses weekday hours', () => {
    expect(openState('Mo-Fr 08:00-18:00', wedNoon)).toBe('open');
    expect(openState('Mo-Fr 08:00-18:00', wedNight)).toBe('closed');
  });
  it('never claims open for missing or broken data', () => {
    expect(openState(undefined)).toBe('unknown');
    expect(openState('when the guard is in')).toBe('unknown');
  });
  it('knows Bulgarian public holidays (3 March)', () => {
    expect(openState('Mo-Fr 08:00-18:00; PH off', new Date('2026-03-03T12:00:00'))).toBe('closed');
  });
});

describe('rankAeds', () => {
  const near: Aed = { id: 'a', source: 'seed', name: 'near', lat: here.lat + 0.001, lon: here.lon, openingHours: 'Mo-Fr 08:00-18:00' };
  const far: Aed = { id: 'b', source: 'seed', name: 'far', lat: here.lat + 0.004, lon: here.lon, openingHours: '24/7' };
  it('puts closed devices behind reachable ones', () => {
    const night = new Date('2026-10-21T23:00:00');
    expect(rankAeds([near, far], here, night).map((a) => a.name)).toEqual(['far', 'near']);
  });
  it('otherwise sorts by distance', () => {
    const noon = new Date('2026-10-21T12:00:00');
    expect(rankAeds([far, near], here, noon).map((a) => a.name)).toEqual(['near', 'far']);
  });
});

describe('overpass', () => {
  it('parses nodes and ways with tags', () => {
    const aeds = parseOverpass({
      elements: [
        { type: 'node', id: 1, lat: 42.4, lon: 25.6, tags: { name: 'Мол', 'defibrillator:location': 'до охраната', opening_hours: '24/7', indoor: 'yes' } },
        { type: 'way', id: 2, center: { lat: 42.41, lon: 25.61 }, tags: {} },
        { type: 'node', id: 3 },
      ],
    });
    expect(aeds).toHaveLength(2);
    expect(aeds[0]).toMatchObject({ id: 'osm:node/1', name: 'Мол', locationHint: 'до охраната', openingHours: '24/7', indoor: true });
    expect(aeds[1]).toMatchObject({ id: 'osm:way/2', name: 'Дефибрилатор' });
  });
  it('drops seed entries that OSM already covers', () => {
    const s = SEED_AEDS[0];
    const osm: Aed = { ...s, id: 'osm:node/9', source: 'osm', lat: s.lat + 0.0001 };
    const merged = mergeAeds([osm], SEED_AEDS);
    expect(merged.map((a) => a.id)).toEqual(['osm:node/9', SEED_AEDS[1].id]);
  });
});

describe('cpr', () => {
  it('beats at 110/min', () => expect(BEAT_INTERVAL_MS).toBe(545));
  it('cues every 30 compressions', () => {
    expect(cueFor(29)).toBeNull();
    expect(cueFor(30)).toBeTruthy();
    expect(cueFor(0)).toBeNull();
  });
});

it('builds a walking link', () => {
  expect(osmWalkingUrl(here, { lat: 1, lon: 2 })).toContain('fossgis_osrm_foot');
});
