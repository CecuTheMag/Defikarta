import { addDays, DEFAULT_DISPATCH, isoDate, SEED_AEDS, STARA_ZAGORA_CENTER, TERMS_VERSION, type Aed, type AssignmentRole, type AssignmentStatus, type CheckKey, type EquipmentDates, type EquipmentKind, type IncidentState, type LatLon, type PublicPlaceChecklist, type QuietHours, type SceneSafety } from '@defikarta/core';

/**
 * In-memory store shaped like the BLUEPRINT §4 tables. Phase 1 swaps this for Postgres/Supabase
 * with the same names; the HTTP routes keep the RPC names (create_incident, respond_offer, ...).
 */

export type Role = 'public' | 'responder' | 'aed_owner' | 'verifier' | 'dispatcher' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: Role[];
}

export interface Responder {
  userId: string;
  scope: 'street' | 'school';
  status: 'pending' | 'verified' | 'suspended';
  verifiedUntil?: string;
  /** off | around (coarse presence). Zones are designed (BLUEPRINT §3.2) but not built in the prototype. */
  availability: 'off' | 'around';
  pos?: LatLon;
  posAt?: number;
  /** Bots return here when an incident closes, so every demo starts the same. */
  home?: LatLon;
  acceptCount: number;
  offerCount: number;
  bot: boolean;
  certificate?: { issuer: string; issuedOn: string; status: 'pending' | 'approved' | 'rejected'; note?: string };
  /** Volunteer terms: version accepted and when (safety.ts TERMS_VERSION). */
  termsVersion?: string;
  termsAt?: number;
  /** Separate, explicit consent to use location for alerts. */
  locationConsentAt?: number;
  /** Last passed in-app knowledge check. */
  quizPassedAt?: number;
  quiet?: QuietHours;
}

export interface ServerAed extends Aed {
  status: 'verified' | 'unverified' | 'retired';
  /** Set when an organisation lists a device it maintains here; maintenance status then shows on the public map. */
  equipmentId?: string;
}

// ---------- organisations (paid side of the hybrid model) ----------
export interface Org {
  id: string;
  name: string;
  ownerIds: string[];
}

export interface Site extends LatLon {
  id: string;
  orgId: string;
  name: string;
  address: string;
}

export interface Equipment {
  id: string;
  orgId: string;
  siteId: string;
  kind: EquipmentKind;
  model: string;
  serial?: string;
  locationHint?: string;
  dates: EquipmentDates;
  /** AEDs only: the draft-ordinance checklist and whether it is listed on the public map. */
  publicPlace?: PublicPlaceChecklist;
  openingHours?: string;
  listedAedId?: string;
}

export interface MaintenanceEntry {
  id: string;
  equipmentId: string;
  date: string;
  by: string;
  action: CheckKey;
  note?: string;
}

/** Simulated e-mail: the drill environment has no mail provider, so reminders land here. */
export interface OutboxMail {
  id: string;
  at: number;
  to: string;
  subject: string;
  body: string;
  equipmentId: string;
  key: string;
}

export interface Submission {
  id: string;
  submittedAt: string;
  by: string;
  payload: { name: string; lat: number; lon: number; locationHint?: string; openingHours?: string; access?: string; indoor?: boolean };
  status: 'pending' | 'approved' | 'rejected' | 'duplicate';
  reviewNote?: string;
  aedId?: string;
}

export interface IncidentEventRow {
  at: number;
  actor: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  source: 'bystander' | 'drill' | 'dispatcher';
  pos: LatLon;
  label?: string;
  state: IncidentState;
  wave: number;
  waveStartedAt: number;
  createdAt: number;
  createdBy: string | null;
  deviceId?: string;
  /** Idempotency key: a retried create returns the same incident. */
  key?: string;
  /** The bystander confirmed 112 was called (drills and dispatcher incidents count as yes). */
  called112: boolean;
  /** 'unknown' warns every volunteer; 'unsafe' (set by a dispatcher or a volunteer on scene) stops dispatch. */
  scene: SceneSafety;
  /** Precise location already rounded (RETAIN_PRECISE_DAYS after close). */
  coarsened?: boolean;
  emsEtaS: number;
  closedReason?: string;
  version: number;
  events: IncidentEventRow[];
}

export interface Offer {
  id: string;
  incidentId: string;
  responderId: string;
  wave: number;
  role: AssignmentRole;
  aedId?: string;
  tDirectS: number;
  tViaAedS?: number;
  status: 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  sentAt: number;
  expiresAt: number;
  answeredAt?: number;
  /** Bots only: when they will answer and whether they accept. */
  botAt?: number;
  botAccepts?: boolean;
}

export interface Assignment {
  id: string;
  incidentId: string;
  responderId: string;
  role: AssignmentRole;
  aedId?: string;
  status: AssignmentStatus;
  updatedAt: number;
  /** Bot-only: when the runner finished picking up the AED. */
  pickupUntil?: number;
  /** Set when the volunteer pulled out because the scene was unsafe (never counted against them). */
  unsafeWithdraw?: boolean;
}

export interface Flags {
  public_alerts: boolean;
  street_alerts: boolean;
  aed_runner_role: boolean;
  coverage_public: boolean;
  'dispatch.waveTimeoutS': number;
  'dispatch.targetCpr': number;
  'dispatch.targetAed': number;
}

export const REGION = { id: 'stara-zagora', name: 'Стара Загора', emsEtaMin: 12, center: STARA_ZAGORA_CENTER };

/** Bot responders are scattered deterministically around the centre, so every demo looks the same. */
function botResponders(): { user: User; responder: Responder }[] {
  const out: { user: User; responder: Responder }[] = [];
  for (let i = 0; i < 18; i++) {
    const ang = (i * 137.5 * Math.PI) / 180;
    const r = 150 + ((i * 97) % 1300);
    const pos = { lat: STARA_ZAGORA_CENTER.lat + (r * Math.cos(ang)) / 111_320, lon: STARA_ZAGORA_CENTER.lon + (r * Math.sin(ang)) / (111_320 * Math.cos((STARA_ZAGORA_CENTER.lat * Math.PI) / 180)) };
    const id = `bot-${i + 1}`;
    out.push({
      user: { id, email: `${id}@drill.defikarta.bg`, name: `Тест-доброволец ${i + 1}`, roles: ['public', 'responder'] },
      responder: { userId: id, scope: 'street', status: 'verified', verifiedUntil: '2027-12-31', availability: 'around', pos, home: pos, posAt: Date.now(), acceptCount: 0, offerCount: 0, bot: true },
    });
  }
  return out;
}

/**
 * A fake employer with three sites, seeded relative to today so every status (ok, soon, overdue, missing) shows up.
 * Positions are inside the city so an AED listed during a drill can take part in it.
 */
function demoOrg(today: string) {
  const d = (n: number) => addDays(today, n);
  const org: Org = { id: 'org-demo', name: 'ДЕМО Тракия Метал ООД', ownerIds: ['u-owner', 'u-owner2'] };
  const sites: Site[] = [
    { id: 'site-1', orgId: org.id, name: 'Завод 1', address: 'Индустриална зона (ДЕМО)', lat: 42.4156, lon: 25.6552 },
    { id: 'site-2', orgId: org.id, name: 'Завод 2', address: 'Северна промишлена зона (ДЕМО)', lat: 42.4371, lon: 25.6168 },
    { id: 'site-3', orgId: org.id, name: 'Офис', address: 'Център (ДЕМО)', lat: 42.4249, lon: 25.6268 },
  ];
  const full = { signage: true, directionSigns: true, instructionsBg: true, accessible: true };
  const e = (x: Omit<Equipment, 'orgId'>): Equipment => ({ orgId: org.id, ...x });
  const equipment: Equipment[] = [
    e({ id: 'eq-1', siteId: 'site-1', kind: 'aed', model: 'ДЕМО AED модел A', serial: 'A-1001', locationHint: 'портал, до охраната', openingHours: '24/7', publicPlace: full, dates: { batteryExpires: d(-4), padsExpires: d(300), lastInspection: d(-41), lastService: d(-200) } }),
    e({ id: 'eq-2', siteId: 'site-1', kind: 'aed', model: 'ДЕМО AED модел A', serial: 'A-1002', locationHint: 'цех 2, до аптечката', dates: { batteryExpires: d(500), padsExpires: d(19), lastInspection: d(-12), lastService: d(-150) } }),
    e({ id: 'eq-3', siteId: 'site-2', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'B-2001', locationHint: 'главен вход, външен шкаф', openingHours: '24/7', publicPlace: full, dates: { batteryExpires: d(700), padsExpires: d(420), lastInspection: d(-6), lastService: d(-90) } }),
    e({ id: 'eq-4', siteId: 'site-3', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'B-2002', locationHint: 'рецепция, ет. 1', openingHours: 'Mo-Fr 08:30-17:30', publicPlace: { ...full, directionSigns: false }, dates: { batteryExpires: d(380), padsExpires: d(210), lastService: d(-30) } }),
    e({ id: 'eq-5', siteId: 'site-1', kind: 'extinguisher', model: 'Прахов 6 кг', serial: 'P6-118', locationHint: 'цех 1, колона 4', dates: { lastInspection: d(-20), lastService: d(-380), lastHydro: d(-900) } }),
    e({ id: 'eq-6', siteId: 'site-1', kind: 'extinguisher', model: 'CO₂ 5 кг', serial: 'C5-022', locationHint: 'ел. табло', dates: { lastInspection: d(-30), lastService: d(-100), lastHydro: d(-1810) } }),
    e({ id: 'eq-7', siteId: 'site-2', kind: 'extinguisher', model: 'Прахов 6 кг', serial: 'P6-240', locationHint: 'склад', dates: { lastInspection: d(-10), lastService: d(-60), lastHydro: d(-400) } }),
    e({ id: 'eq-8', siteId: 'site-3', kind: 'extinguisher', model: 'Воден 9 л', serial: 'W9-007', locationHint: 'коридор', dates: { lastInspection: d(-100), lastService: d(-200), lastHydro: d(-700) } }),
    e({ id: 'eq-9', siteId: 'site-1', kind: 'first_aid_kit', model: 'Аптечка за работно място', locationHint: 'цех 2', dates: { contentsExpire: d(-15), lastInspection: d(-50) } }),
    e({ id: 'eq-10', siteId: 'site-3', kind: 'first_aid_kit', model: 'Аптечка за офис', locationHint: 'кухня', dates: { contentsExpire: d(240), lastInspection: d(-20) } }),
  ];
  return { org, sites, equipment };
}

/**
 * More fake organisations, one per situation: nothing overdue, everything overdue, nothing registered yet,
 * a school and a municipality with several kinds of buildings. Same rule as the first one: dates are relative to
 * today, positions are inside the city, and no device is listed on the public map automatically.
 */
function moreOrgs(today: string) {
  const d = (n: number) => addDays(today, n);
  const full = { signage: true, directionSigns: true, instructionsBg: true, accessible: true };
  const none = { signage: false, directionSigns: false, instructionsBg: false, accessible: false };
  const orgs: Org[] = [
    { id: 'org-ok', name: 'ДЕМО Мол Галерия ЕООД (в срок, нищо просрочено)', ownerIds: ['u-owner-ok', 'u-multi'] },
    { id: 'org-late', name: 'ДЕМО Склад Север ООД (всичко просрочено)', ownerIds: ['u-owner-late'] },
    { id: 'org-new', name: 'ДЕМО Нова Фирма ЕООД (още нищо въведено)', ownerIds: ['u-owner-new'] },
    { id: 'org-school', name: 'ДЕМО ОУ „Тест“ (общинско училище)', ownerIds: ['u-school'] },
    { id: 'org-municipality', name: 'ДЕМО Община (общински обекти)', ownerIds: ['u-municipality'] },
  ];
  const site = (id: string, orgId: string, name: string, lat: number, lon: number): Site => ({ id, orgId, name, address: `${name}, адрес (ДЕМО)`, lat, lon });
  const sites: Site[] = [
    site('site-ok-1', 'org-ok', 'Мол, партер', 42.4338, 25.662),
    site('site-ok-2', 'org-ok', 'Мол, паркинг', 42.4334, 25.6628),
    site('site-late-1', 'org-late', 'Склад', 42.412, 25.648),
    site('site-new-1', 'org-new', 'Нов офис', 42.429, 25.641),
    site('site-sch-1', 'org-school', 'Сграда на училището', 42.422, 25.618),
    site('site-sch-2', 'org-school', 'Физкултурен салон', 42.4224, 25.619),
    site('site-mun-1', 'org-municipality', 'Основно училище', 42.43, 25.625),
    site('site-mun-2', 'org-municipality', 'Детска градина', 42.418, 25.635),
    site('site-mun-3', 'org-municipality', 'Спортна зала', 42.44, 25.65),
    site('site-mun-4', 'org-municipality', 'Басейн', 42.415, 25.66),
    site('site-mun-5', 'org-municipality', 'Читалище', 42.427, 25.633),
  ];
  const e = (orgId: string, x: Omit<Equipment, 'orgId'>): Equipment => ({ orgId, ...x });
  const goodAed = { batteryExpires: d(700), padsExpires: d(420), lastInspection: d(-6), lastService: d(-90) };
  const goodExt = { lastInspection: d(-20), lastService: d(-100), lastHydro: d(-400) };
  const equipment: Equipment[] = [
    // everything in order
    e('org-ok', { id: 'eq-ok-1', siteId: 'site-ok-1', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'OK-1', locationHint: 'главен вход, външен шкаф', openingHours: '24/7', publicPlace: full, dates: goodAed }),
    e('org-ok', { id: 'eq-ok-2', siteId: 'site-ok-1', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'OK-2', locationHint: 'информация, ет. 1', openingHours: 'Mo-Su 09:00-21:00', publicPlace: full, dates: goodAed }),
    e('org-ok', { id: 'eq-ok-3', siteId: 'site-ok-2', kind: 'aed', model: 'ДЕМО AED модел A', serial: 'OK-3', locationHint: 'паркинг, до касата', openingHours: '24/7', publicPlace: full, dates: goodAed }),
    e('org-ok', { id: 'eq-ok-4', siteId: 'site-ok-1', kind: 'extinguisher', model: 'Прахов 6 кг', serial: 'OK-P1', locationHint: 'коридор', dates: goodExt }),
    e('org-ok', { id: 'eq-ok-5', siteId: 'site-ok-2', kind: 'extinguisher', model: 'CO₂ 5 кг', serial: 'OK-C1', locationHint: 'ел. табло', dates: goodExt }),
    e('org-ok', { id: 'eq-ok-6', siteId: 'site-ok-1', kind: 'first_aid_kit', model: 'Аптечка за обект', locationHint: 'охрана', dates: { contentsExpire: d(240), lastInspection: d(-20) } }),
    // everything overdue
    e('org-late', { id: 'eq-late-1', siteId: 'site-late-1', kind: 'aed', model: 'ДЕМО AED модел A', serial: 'L-1', locationHint: 'склад, до рампата', publicPlace: none, dates: { batteryExpires: d(-60), padsExpires: d(-20), lastInspection: d(-400), lastService: d(-700) } }),
    e('org-late', { id: 'eq-late-2', siteId: 'site-late-1', kind: 'extinguisher', model: 'Прахов 6 кг', serial: 'L-P1', locationHint: 'рампа', dates: { lastInspection: d(-300), lastService: d(-800), lastHydro: d(-2000) } }),
    e('org-late', { id: 'eq-late-3', siteId: 'site-late-1', kind: 'first_aid_kit', model: 'Аптечка за работно място', locationHint: 'офис', dates: { contentsExpire: d(-200), lastInspection: d(-500) } }),
    // a school: one AED that needs pads soon, the rest in order
    e('org-school', { id: 'eq-sch-1', siteId: 'site-sch-1', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'S-1', locationHint: 'фоайе, до портиера', openingHours: 'Mo-Fr 07:00-19:00', publicPlace: full, dates: { batteryExpires: d(600), padsExpires: d(19), lastInspection: d(-12), lastService: d(-150) } }),
    e('org-school', { id: 'eq-sch-2', siteId: 'site-sch-2', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'S-2', locationHint: 'вход на салона', openingHours: 'Mo-Fr 07:00-20:00', publicPlace: { ...full, directionSigns: false }, dates: goodAed }),
    e('org-school', { id: 'eq-sch-3', siteId: 'site-sch-1', kind: 'extinguisher', model: 'Прахов 6 кг', serial: 'S-P1', locationHint: 'коридор, ет. 1', dates: goodExt }),
    e('org-school', { id: 'eq-sch-4', siteId: 'site-sch-1', kind: 'first_aid_kit', model: 'Аптечка за училище', locationHint: 'медицински кабинет', dates: { contentsExpire: d(25), lastInspection: d(-30) } }),
    // a municipality: every kind of building, every status
    e('org-municipality', { id: 'eq-mun-1', siteId: 'site-mun-1', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'M-1', locationHint: 'фоайе', openingHours: 'Mo-Fr 07:00-19:00', publicPlace: full, dates: goodAed }),
    e('org-municipality', { id: 'eq-mun-2', siteId: 'site-mun-2', kind: 'aed', model: 'ДЕМО AED модел A', serial: 'M-2', locationHint: 'входна зона', publicPlace: { ...none, signage: true }, dates: { batteryExpires: d(-10), padsExpires: d(200), lastInspection: d(-90), lastService: d(-300) } }),
    e('org-municipality', { id: 'eq-mun-3', siteId: 'site-mun-3', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'M-3', locationHint: 'главен вход, външен шкаф', openingHours: '24/7', publicPlace: full, dates: { batteryExpires: d(25), padsExpires: d(400), lastInspection: d(-15), lastService: d(-120) } }),
    e('org-municipality', { id: 'eq-mun-4', siteId: 'site-mun-4', kind: 'aed', model: 'ДЕМО AED модел B', serial: 'M-4', locationHint: 'рецепция', openingHours: 'Mo-Su 06:30-21:30', publicPlace: full, dates: { batteryExpires: d(500), padsExpires: d(300), lastService: d(-60) } }),
    e('org-municipality', { id: 'eq-mun-5', siteId: 'site-mun-5', kind: 'extinguisher', model: 'Прахов 6 кг', serial: 'M-P1', locationHint: 'салон', dates: goodExt }),
    e('org-municipality', { id: 'eq-mun-6', siteId: 'site-mun-2', kind: 'first_aid_kit', model: 'Аптечка за детска градина', locationHint: 'кабинет', dates: { contentsExpire: d(-30), lastInspection: d(-60) } }),
  ];
  return { orgs, sites, equipment };
}

/** Open drill accounts; the email is the id without „u-“ @drill.defikarta.bg (e.g. ready@drill.defikarta.bg). */
const TEST_ACCOUNTS: { id: string; name: string; roles: Role[] }[] = [
  { id: 'u-ready', name: 'Тест Доброволец (готов)', roles: ['public', 'responder'] },
  { id: 'u-responder', name: 'Тест Доброволец', roles: ['public', 'responder'] },
  { id: 'u-pending', name: 'Тест Доброволец (чака проверка)', roles: ['public', 'responder'] },
  { id: 'u-public', name: 'Тест Потребител', roles: ['public'] },
  { id: 'u-owner', name: 'Тест Отговорник безопасност', roles: ['public', 'aed_owner'] },
  { id: 'u-verifier', name: 'Тест Верификатор (БЧК)', roles: ['public', 'verifier'] },
  { id: 'u-dispatcher', name: 'Тест Диспечер', roles: ['public', 'dispatcher'] },
  { id: 'u-admin', name: 'Тест Администратор', roles: ['public', 'dispatcher', 'verifier', 'admin'] },
  // Volunteers, one for every step and every way it can go wrong
  { id: 'u-consent', name: 'Тест Доброволец (чака съгласие за местоположение)', roles: ['public', 'responder'] },
  { id: 'u-quiz', name: 'Тест Доброволец (чака проверка на знанията)', roles: ['public', 'responder'] },
  { id: 'u-rejected', name: 'Тест Доброволец (отхвърлено удостоверение)', roles: ['public', 'responder'] },
  { id: 'u-expired', name: 'Тест Доброволец (изтекло удостоверение)', roles: ['public', 'responder'] },
  { id: 'u-suspended', name: 'Тест Доброволец (спрян)', roles: ['public', 'responder'] },
  { id: 'u-minor', name: 'Тест Доброволец (под 18, само учения)', roles: ['public', 'responder'] },
  { id: 'u-quiet', name: 'Тест Доброволец (тихи часове)', roles: ['public', 'responder'] },
  { id: 'u-multi', name: 'Тест Доброволец и отговорник', roles: ['public', 'responder', 'aed_owner'] },
  // More ordinary users and staff
  { id: 'u-public2', name: 'Тест Потребител 2', roles: ['public'] },
  { id: 'u-trainer', name: 'Тест Инструктор (учения)', roles: ['public', 'dispatcher', 'verifier'] },
  { id: 'u-verifier2', name: 'Тест Верификатор (Първите три минути)', roles: ['public', 'verifier'] },
  { id: 'u-dispatcher2', name: 'Тест Диспечер (ЦСМП)', roles: ['public', 'dispatcher'] },
  // Organisation owners, one per organisation in demoOrg() and moreOrgs()
  { id: 'u-owner2', name: 'Тест Втори отговорник (ДЕМО Тракия Метал)', roles: ['public', 'aed_owner'] },
  { id: 'u-owner-ok', name: 'Тест Отговорник (в срок)', roles: ['public', 'aed_owner'] },
  { id: 'u-owner-late', name: 'Тест Отговорник (всичко просрочено)', roles: ['public', 'aed_owner'] },
  { id: 'u-owner-new', name: 'Тест Отговорник (нова фирма)', roles: ['public', 'aed_owner'] },
  { id: 'u-school', name: 'Тест Училище (отговорник)', roles: ['public', 'aed_owner'] },
  { id: 'u-municipality', name: 'Тест Община (отговорник)', roles: ['public', 'aed_owner'] },
];

/** Two reviewed AED suggestions so the verifier's history is not empty. None is pending: approving a made-up point would put it on the public map. */
function reviewedSubmissions(): Submission[] {
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  return [
    { id: 'sub-demo-1', submittedAt: ago(52), by: 'u-public', status: 'rejected', reviewNote: 'Не се вижда уред на снимката. Добави нова със снимка на шкафа.', payload: { name: 'Магазин (ДЕМО предложение)', lat: 42.421, lon: 25.642, access: 'customers', indoor: true } },
    { id: 'sub-demo-2', submittedAt: ago(30), by: 'u-public2', status: 'duplicate', aedId: 'seed:gpche-romain-rolland', reviewNote: 'Същият уред вече е на картата.', payload: { name: 'ГПЧЕ (ДЕМО предложение)', lat: 42.42806, lon: 25.62999, access: 'customers', indoor: true } },
  ];
}

export class Store {
  users = new Map<string, User>();
  responders = new Map<string, Responder>();
  aeds: ServerAed[] = [];
  submissions: Submission[] = [];
  incidents = new Map<string, Incident>();
  offers: Offer[] = [];
  assignments: Assignment[] = [];
  /** assignment id → precise track; deleted when the incident closes (BLUEPRINT §7). */
  tracks = new Map<string, { at: number; pos: LatLon }[]>();
  tokens = new Map<string, string>();
  audit: { at: number; actor: string; action: string; subject?: string }[] = [];
  flags!: Flags;
  rate = new Map<string, number>();
  orgs: Org[] = [];
  sites: Site[] = [];
  equipment: Equipment[] = [];
  maintenance: MaintenanceEntry[] = [];
  outbox: OutboxMail[] = [];
  private seq = 0;

  constructor() {
    this.reset();
  }

  id(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}${(++this.seq).toString(36)}`;
  }

  reset(): void {
    this.users.clear();
    this.responders.clear();
    this.incidents.clear();
    this.offers = [];
    this.assignments = [];
    this.tracks.clear();
    this.submissions = [];
    this.audit = [];
    this.rate.clear();
    this.flags = {
      public_alerts: true,
      street_alerts: true,
      aed_runner_role: true,
      coverage_public: true,
      'dispatch.waveTimeoutS': DEFAULT_DISPATCH.waveTimeoutS,
      'dispatch.targetCpr': DEFAULT_DISPATCH.targetCpr,
      'dispatch.targetAed': DEFAULT_DISPATCH.targetAed,
    };
    // Only real devices from public sources (see README → AED data). No made-up points on the map, even in the drill.
    this.aeds = SEED_AEDS.map<ServerAed>((a) => ({ ...a, status: 'unverified' }));
    const demo = demoOrg(isoDate(new Date()));
    const more = moreOrgs(isoDate(new Date()));
    this.orgs = [demo.org, ...more.orgs];
    this.sites = [...demo.sites, ...more.sites];
    this.equipment = [...demo.equipment, ...more.equipment];
    this.submissions = reviewedSubmissions();
    this.maintenance = [];
    this.outbox = [];
    // The demo employer's AEDs stay in its registry only. Listing one („Покажи на картата“) is a manual step in the drill.
    for (const t of TEST_ACCOUNTS) this.users.set(t.id, { id: t.id, email: `${t.id.replace('u-', '')}@drill.defikarta.bg`, name: t.name, roles: t.roles });
    this.responders.set('u-responder', {
      userId: 'u-responder',
      scope: 'street',
      status: 'verified',
      verifiedUntil: '2028-09-01',
      availability: 'off',
      acceptCount: 0,
      offerCount: 0,
      bot: false,
      certificate: { issuer: 'БЧК Стара Загора (тест)', issuedOn: '2026-09-01', status: 'approved' },
    });
    // „ready“ has done everything, so a drill can start straight away: switch on „Достъпен съм“ and wait for an alert.
    this.responders.set('u-ready', {
      userId: 'u-ready',
      scope: 'street',
      status: 'verified',
      verifiedUntil: '2028-09-01',
      availability: 'off',
      acceptCount: 0,
      offerCount: 0,
      bot: false,
      certificate: { issuer: 'БЧК Стара Загора (тест)', issuedOn: '2026-09-01', status: 'approved' },
      termsVersion: TERMS_VERSION,
      termsAt: Date.now(),
      locationConsentAt: Date.now(),
      quizPassedAt: Date.now(),
    });
    // „pending“ has sent a certificate; a verifier approves it in the web console (Конзола → Проверка).
    this.responders.set('u-pending', {
      userId: 'u-pending',
      scope: 'street',
      status: 'pending',
      availability: 'off',
      acceptCount: 0,
      offerCount: 0,
      bot: false,
      certificate: { issuer: 'БЧК Стара Загора (тест)', issuedOn: '2026-10-20', status: 'pending' },
    });
    // One volunteer per step of the onboarding and per way it can fail (see README → Test accounts).
    const approved = (issuedOn: string) => ({ issuer: 'БЧК Стара Загора (тест)', issuedOn, status: 'approved' as const });
    const vol = (userId: string, more: Partial<Responder>): Responder => ({ userId, scope: 'street', status: 'verified', verifiedUntil: '2028-09-01', availability: 'off', acceptCount: 0, offerCount: 0, bot: false, certificate: approved('2026-09-01'), ...more });
    const terms = { termsVersion: TERMS_VERSION, termsAt: Date.now() };
    const consent = { locationConsentAt: Date.now() };
    const quiz = { quizPassedAt: Date.now() };
    this.responders.set('u-consent', vol('u-consent', { ...terms }));
    this.responders.set('u-quiz', vol('u-quiz', { ...terms, ...consent }));
    this.responders.set('u-rejected', vol('u-rejected', { status: 'pending', verifiedUntil: undefined, certificate: { issuer: 'БЧК Стара Загора (тест)', issuedOn: '2026-10-25', status: 'rejected', note: 'Снимката на удостоверението е нечетлива. Качи я отново.' } }));
    this.responders.set('u-expired', vol('u-expired', { verifiedUntil: '2025-12-31', certificate: approved('2023-12-01'), ...terms, ...consent, ...quiz }));
    this.responders.set('u-suspended', vol('u-suspended', { status: 'suspended', ...terms, ...consent, ...quiz }));
    this.responders.set('u-minor', vol('u-minor', { scope: 'school', certificate: { issuer: 'Първите три минути (тест)', issuedOn: '2026-09-15', status: 'approved' }, ...terms, ...consent, ...quiz }));
    this.responders.set('u-quiet', vol('u-quiet', { quiet: { from: 0, to: 24 }, ...terms, ...consent, ...quiz }));
    this.responders.set('u-multi', vol('u-multi', { ...terms, ...consent, ...quiz }));
    // Bots are pre-onboarded; the human test volunteer goes through terms, consent and the knowledge check in the UI.
    for (const b of botResponders()) {
      this.users.set(b.user.id, b.user);
      this.responders.set(b.user.id, { ...b.responder, termsVersion: 'bot', termsAt: 0, locationConsentAt: 0, quizPassedAt: Date.now() });
    }
  }
}
