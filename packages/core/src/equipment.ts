/**
 * Safety-equipment registry for organisations (the paid side of the hybrid model, docs/SUNDAY.md).
 * Pure date rules so the server, the web app and a future mobile app agree on what is due.
 *
 * Legal hook: the MЗ draft ordinance (April 2026) says an AED may not be placed in a public place when the owner
 * has not ensured accessibility and "гаранция за съответствието им с техническите изисквания на производителя".
 * The intervals below are defaults only — the manufacturer's manual wins, and an organisation can override them.
 */

export type EquipmentKind = 'aed' | 'extinguisher' | 'first_aid_kit';
export type CheckKey = 'battery' | 'pads' | 'inspection' | 'service' | 'hydro' | 'contents';
export type CheckStatus = 'ok' | 'soon' | 'overdue' | 'missing';

/** ISO dates (yyyy-mm-dd). Expiry dates are printed on the part; "last" dates are when the work was done. */
export interface EquipmentDates {
  batteryExpires?: string;
  padsExpires?: string;
  /** First-aid kit: the earliest expiry among its contents. */
  contentsExpire?: string;
  /** Visual check: status indicator green, pads sealed, cabinet intact / extinguisher pressure in the green. */
  lastInspection?: string;
  /** Service by an authorised technician. */
  lastService?: string;
  /** Extinguisher pressure (hydrostatic) test. */
  lastHydro?: string;
}

export interface MaintenancePolicy {
  inspectionDays: Record<EquipmentKind, number>;
  serviceMonths: Partial<Record<EquipmentKind, number>>;
  hydroYears: number;
  /** A check turns "soon" this many days before it is due. */
  soonDays: number;
}

export const DEFAULT_POLICY: MaintenancePolicy = {
  inspectionDays: { aed: 30, extinguisher: 90, first_aid_kit: 90 },
  serviceMonths: { aed: 12, extinguisher: 12 },
  hydroYears: 5,
  soonDays: 30,
};

export const CHECK_LABEL: Record<CheckKey, string> = {
  battery: 'Батерия',
  pads: 'Електроди',
  inspection: 'Оглед',
  service: 'Сервиз',
  hydro: 'Изпитване под налягане',
  contents: 'Съдържание',
};

export const KIND_LABEL: Record<EquipmentKind, string> = { aed: 'Дефибрилатор (AED)', extinguisher: 'Пожарогасител', first_aid_kit: 'Аптечка' };

/** Which checks apply to each kind. Expiry checks use the printed date; the rest add the policy interval to the last date. */
const CHECKS: Record<EquipmentKind, CheckKey[]> = {
  aed: ['battery', 'pads', 'inspection', 'service'],
  extinguisher: ['inspection', 'service', 'hydro'],
  first_aid_kit: ['contents', 'inspection'],
};

export interface Check {
  key: CheckKey;
  label: string;
  /** Due date, or null when nothing is recorded yet. */
  due: string | null;
  daysLeft: number | null;
  status: CheckStatus;
}

const DAY = 86_400_000;
const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const today = (now: Date) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
export const isoDate = (t: number | Date) => new Date(t).toISOString().slice(0, 10);

export function addMonths(iso: string, months: number): string {
  const d = new Date(day(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return isoDate(d);
}

export function addDays(iso: string, days: number): string {
  return isoDate(day(iso) + days * DAY);
}

function dueOf(key: CheckKey, kind: EquipmentKind, d: EquipmentDates, p: MaintenancePolicy): string | undefined {
  switch (key) {
    case 'battery':
      return d.batteryExpires;
    case 'pads':
      return d.padsExpires;
    case 'contents':
      return d.contentsExpire;
    case 'inspection':
      return d.lastInspection && addDays(d.lastInspection, p.inspectionDays[kind]);
    case 'service': {
      const m = p.serviceMonths[kind];
      return m && d.lastService ? addMonths(d.lastService, m) : undefined;
    }
    case 'hydro':
      return d.lastHydro && addMonths(d.lastHydro, p.hydroYears * 12);
  }
}

export function equipmentChecks(kind: EquipmentKind, dates: EquipmentDates, now = new Date(), policy = DEFAULT_POLICY): Check[] {
  return CHECKS[kind].map((key) => {
    const due = dueOf(key, kind, dates, policy) ?? null;
    if (!due) return { key, label: CHECK_LABEL[key], due: null, daysLeft: null, status: 'missing' };
    const daysLeft = Math.round((day(due) - today(now)) / DAY);
    const status: CheckStatus = daysLeft < 0 ? 'overdue' : daysLeft <= policy.soonDays ? 'soon' : 'ok';
    return { key, label: CHECK_LABEL[key], due, daysLeft, status };
  });
}

const RANK: Record<CheckStatus, number> = { ok: 0, soon: 1, missing: 2, overdue: 3 };
export function worstStatus(checks: Pick<Check, 'status'>[]): CheckStatus {
  return checks.reduce<CheckStatus>((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), 'ok');
}

/** An AED with an expired battery or expired pads may not deliver a shock: never send a runner to it. */
export function aedUsable(dates: EquipmentDates, now = new Date()): boolean {
  return equipmentChecks('aed', dates, now).every((c) => !((c.key === 'battery' || c.key === 'pads') && c.status === 'overdue'));
}

/** Reminders go out when a check crosses 30, 7 and 0 days before due; overdue items are re-sent every 7 days. */
export const REMIND_AT_DAYS = [30, 7, 0] as const;
export function reminderStage(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return `overdue-${Math.floor(-daysLeft / 7)}`;
  const hit = [...REMIND_AT_DAYS].reverse().find((t) => daysLeft <= t);
  return hit === undefined ? null : `d${hit}`;
}

/** Conditions from the MЗ draft ordinance (April 2026) for an AED in a public place. */
export interface PublicPlaceChecklist {
  /** Clearly marked spot (AED sign). */
  signage: boolean;
  /** Direction signs leading to it. */
  directionSigns: boolean;
  /** Instructions in Bulgarian: voice prompts, text or pictures. */
  instructionsBg: boolean;
  /** Visible and easy to reach; opening hours known. */
  accessible: boolean;
}

export const CHECKLIST_LABEL: Record<keyof PublicPlaceChecklist | 'maintenance', string> = {
  signage: 'Обозначено място (знак AED)',
  directionSigns: 'Указателни знаци до него',
  instructionsBg: 'Инструкции на български (глас, текст или картинки)',
  accessible: 'Видимо, леснодостъпно, с известни часове',
  maintenance: 'Поддръжка по изискванията на производителя',
};

/** What is still missing for an AED to meet the draft ordinance. Empty = ready. */
export function publicPlaceGaps(c: PublicPlaceChecklist | undefined, dates: EquipmentDates, now = new Date()): (keyof typeof CHECKLIST_LABEL)[] {
  const gaps: (keyof typeof CHECKLIST_LABEL)[] = [];
  for (const k of ['signage', 'directionSigns', 'instructionsBg', 'accessible'] as const) if (!c?.[k]) gaps.push(k);
  const s = worstStatus(equipmentChecks('aed', dates, now));
  if (s === 'overdue' || s === 'missing') gaps.push('maintenance');
  return gaps;
}
