import { DEFAULT_DISPATCH, SEED_AEDS, STARA_ZAGORA_CENTER, type Aed, type AssignmentRole, type AssignmentStatus, type IncidentState, type LatLon } from '@defikarta/core';

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
}

export interface ServerAed extends Aed {
  status: 'verified' | 'unverified' | 'retired';
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

/** Fake devices so the drill environment has something to dispatch and cover. Never shown as real data. */
const DEMO_AEDS: Omit<ServerAed, 'status' | 'source'>[] = [
  { id: 'demo:mall', name: 'ДЕМО · търговски център', lat: 42.4301, lon: 25.6412, openingHours: 'Mo-Su 09:00-21:00', locationHint: 'до информацията, вход Север', indoor: true, access: 'customers' },
  { id: 'demo:hospital', name: 'ДЕМО · болница, приемно', lat: 42.4189, lon: 25.6291, openingHours: '24/7', locationHint: 'приемно отделение', indoor: true, access: 'yes' },
  { id: 'demo:gym', name: 'ДЕМО · фитнес зала', lat: 42.4233, lon: 25.6471, openingHours: 'Mo-Fr 06:00-22:00; Sa-Su 09:00-20:00', locationHint: 'на рецепцията', indoor: true, access: 'customers' },
  { id: 'demo:town-hall', name: 'ДЕМО · общинска сграда', lat: 42.4262, lon: 25.6343, openingHours: 'Mo-Fr 08:30-17:30', locationHint: 'до охраната, вход Б', indoor: true, access: 'yes' },
  { id: 'demo:park', name: 'ДЕМО · парк, външен шкаф', lat: 42.4327, lon: 25.6269, openingHours: '24/7', locationHint: 'външен шкаф до кафенето', indoor: false, access: 'yes' },
  { id: 'demo:station', name: 'ДЕМО · гара', lat: 42.4097, lon: 25.6186, openingHours: '24/7', locationHint: 'в залата за пътници', indoor: true, access: 'yes' },
  { id: 'demo:sports-hall', name: 'ДЕМО · спортна зала', lat: 42.4388, lon: 25.6475, openingHours: 'Mo-Fr 07:00-21:00', locationHint: 'при входа за състезатели', indoor: true, access: 'customers' },
  { id: 'demo:pharmacy', name: 'ДЕМО · аптека', lat: 42.4204, lon: 25.6405, locationHint: 'на щанда', indoor: true, access: 'customers' },
];

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

const TEST_ACCOUNTS: { id: string; name: string; roles: Role[] }[] = [
  { id: 'u-responder', name: 'Тест Доброволец', roles: ['public', 'responder'] },
  { id: 'u-owner', name: 'Тест Собственик на AED', roles: ['public', 'aed_owner'] },
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
    this.aeds = [
      ...SEED_AEDS.map<ServerAed>((a) => ({ ...a, status: 'unverified' })),
      ...DEMO_AEDS.map<ServerAed>((a) => ({ ...a, source: 'demo', status: 'verified', verifiedAt: '2026-10-30', note: 'ДЕМО данни за учебната среда. Не е реално устройство.' })),
    ];
    for (const t of TEST_ACCOUNTS) this.users.set(t.id, { id: t.id, email: `${t.id.replace('u-', '')}@drill.defikarta.bg`, name: t.name, roles: t.roles });
    this.responders.set('u-responder', {
      userId: 'u-responder',
      scope: 'street',
      status: 'verified',
      verifiedUntil: '2027-12-31',
      availability: 'off',
      acceptCount: 0,
      offerCount: 0,
      bot: false,
      certificate: { issuer: 'БЧК Стара Загора (тест)', issuedOn: '2026-09-01', status: 'approved' },
    });
    for (const b of botResponders()) {
      this.users.set(b.user.id, b.user);
      this.responders.set(b.user.id, b.responder);
    }
  }
}
