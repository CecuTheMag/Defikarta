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
  const org: Org = { id: 'org-demo', name: 'ДЕМО Тракия Метал ООД', ownerIds: ['u-owner'] };
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
];

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
    this.orgs = [demo.org];
    this.sites = demo.sites;
    this.equipment = demo.equipment;
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
    // Bots are pre-onboarded; the human test volunteer goes through terms, consent and the knowledge check in the UI.
    for (const b of botResponders()) {
      this.users.set(b.user.id, b.user);
      this.responders.set(b.user.id, { ...b.responder, termsVersion: 'bot', termsAt: 0, locationConsentAt: 0, quizPassedAt: Date.now() });
    }
  }
}
