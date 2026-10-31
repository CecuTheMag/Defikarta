import { describe, expect, it } from 'vitest';
import { addDays, aedUsable, certValidUntil, CPR_QUIZ, equipmentChecks, gradeQuiz, inQuietHours, issuerRecognized, publicPlaceGaps, reminderStage, worstStatus } from '../src';

const NOW = new Date('2026-10-31T12:00:00');
const T = '2026-10-31';

describe('equipmentChecks', () => {
  it('reads expiry dates directly and adds the policy interval to "last done" dates', () => {
    const c = equipmentChecks('aed', { batteryExpires: addDays(T, 400), padsExpires: addDays(T, 20), lastInspection: addDays(T, -10), lastService: '2026-01-15' }, NOW);
    const by = Object.fromEntries(c.map((x) => [x.key, x]));
    expect(by.battery!.status).toBe('ok');
    expect(by.pads!.status).toBe('soon');
    expect(by.pads!.daysLeft).toBe(20);
    expect(by.inspection!.due).toBe(addDays(T, 20)); // 30-day visual check
    expect(by.service!.due).toBe('2027-01-15'); // 12 months
  });

  it('marks unrecorded checks as missing and overdue beats everything', () => {
    const c = equipmentChecks('extinguisher', { lastService: '2025-09-01' }, NOW);
    expect(c.find((x) => x.key === 'service')!.status).toBe('overdue');
    expect(c.find((x) => x.key === 'hydro')!.status).toBe('missing');
    expect(worstStatus(c)).toBe('overdue');
    expect(worstStatus([{ status: 'ok' }, { status: 'missing' }])).toBe('missing');
  });

  it('treats an AED with expired battery or pads as unusable, but a late inspection alone does not', () => {
    expect(aedUsable({ batteryExpires: addDays(T, -1), padsExpires: addDays(T, 100) }, NOW)).toBe(false);
    expect(aedUsable({ batteryExpires: addDays(T, 100), padsExpires: addDays(T, -1) }, NOW)).toBe(false);
    expect(aedUsable({ batteryExpires: addDays(T, 100), padsExpires: addDays(T, 100), lastInspection: '2025-01-01' }, NOW)).toBe(true);
  });
});

describe('reminders and the draft ordinance', () => {
  it('fires at 30, 7 and 0 days, then weekly while overdue', () => {
    expect(reminderStage(45)).toBeNull();
    expect(reminderStage(30)).toBe('d30');
    expect(reminderStage(12)).toBe('d30');
    expect(reminderStage(7)).toBe('d7');
    expect(reminderStage(0)).toBe('d0');
    expect(reminderStage(-3)).toBe('overdue-0');
    expect(reminderStage(-8)).toBe('overdue-1');
    expect(reminderStage(null)).toBeNull();
  });

  it('lists what is missing for a public-place AED', () => {
    const ok = { batteryExpires: addDays(T, 300), padsExpires: addDays(T, 300), lastInspection: addDays(T, -5), lastService: addDays(T, -100) };
    expect(publicPlaceGaps({ signage: true, directionSigns: true, instructionsBg: true, accessible: true }, ok, NOW)).toEqual([]);
    expect(publicPlaceGaps({ signage: true, directionSigns: false, instructionsBg: true, accessible: true }, { ...ok, batteryExpires: addDays(T, -1) }, NOW)).toEqual(['directionSigns', 'maintenance']);
  });
});

describe('volunteer safety rules', () => {
  it('recognises known course providers loosely and sets a two-year validity', () => {
    expect(issuerRecognized('БЧК Стара Загора')).toBe(true);
    expect(issuerRecognized('Фондация „Първите три минути“')).toBe(true);
    expect(issuerRecognized('Курс в YouTube')).toBe(false);
    expect(certValidUntil('2026-09-01')).toBe('2028-09-01');
  });

  it('passes the knowledge check only with every answer right', () => {
    const key = CPR_QUIZ.map((q) => q.answer);
    expect(gradeQuiz(key)).toEqual({ passed: true, correct: CPR_QUIZ.length });
    expect(gradeQuiz([...key.slice(0, -1), (key.at(-1)! + 1) % 3]).passed).toBe(false);
  });

  it('handles quiet hours over midnight', () => {
    const at = (h: number) => new Date(2026, 9, 31, h, 30);
    expect(inQuietHours({ from: 23, to: 7 }, at(2))).toBe(true);
    expect(inQuietHours({ from: 23, to: 7 }, at(12))).toBe(false);
    expect(inQuietHours({ from: 9, to: 17 }, at(10))).toBe(true);
    expect(inQuietHours(undefined, at(2))).toBe(false);
  });
});
