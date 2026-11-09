import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  certValidUntil,
  CHECKLIST_LABEL,
  coverageGrid,
  CPR_QUIZ,
  distanceM,
  equipmentChecks,
  gradeQuiz,
  isoDate,
  issuerRecognized,
  KIND_LABEL,
  openState,
  publicPlaceGaps,
  recommendPlacements,
  RETAIN_PRECISE_DAYS,
  STARA_ZAGORA_CENTER,
  TERMS_VERSION,
  VOLUNTEER_TERMS,
  worstStatus,
  type CheckKey,
  type CoverageScenario,
  type EquipmentKind,
  type LatLon,
} from '@defikarta/core';
import { REGION, Store, type Equipment, type Role, type Submission, type User } from './db';
import { HttpError, Service, SIM_SPEED } from './service';

const PORT = Number(process.env.PORT ?? 8791);
const HOST = process.env.HOST ?? '127.0.0.1';
const store = new Store();
const streams = new Set<ServerResponse>();

/** Realtime: clients get a tiny "something changed" ping and refetch what their role may see. */
const svc = new Service(store, (incidentId) => {
  const msg = `data: ${JSON.stringify({ t: 'changed', incident: incidentId ?? null })}\n\n`;
  for (const r of streams) r.write(msg);
});
setInterval(() => svc.tick(), 1000);

/** Urban area only: coverage over fields and hills is noise (and has no population to weigh it). */
const CITY_BBOX: [number, number, number, number] = [42.405, 25.595, 42.445, 25.67];

// ---------- plumbing ----------
/** A non-JSON response (CSV export). */
class Raw {
  constructor(
    public type: string,
    public body: string,
    public filename?: string,
  ) {}
}

function send(res: ServerResponse, status: number, body: unknown) {
  if (body instanceof Raw) {
    res.writeHead(status, { 'content-type': body.type, 'cache-control': 'no-store', ...(body.filename ? { 'content-disposition': `attachment; filename="${body.filename}"` } : {}) });
    return res.end(body.body);
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64_000) throw new HttpError(413, 'Твърде голяма заявка.');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Невалиден JSON.');
  }
}

function userOf(req: IncomingMessage): User | null {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const id = token && store.tokens.get(token);
  return id ? (store.users.get(id) ?? null) : null;
}

function need(req: IncomingMessage, ...roles: Role[]): User {
  const u = userOf(req);
  if (!u) throw new HttpError(401, 'Трябва да влезеш.');
  if (roles.length && !roles.some((r) => u.roles.includes(r)) && !u.roles.includes('admin')) throw new HttpError(403, 'Нямаш право за това действие.');
  return u;
}

const num = (v: unknown, name: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new HttpError(400, `Невалидно поле: ${name}`);
  return v;
};
const pos = (b: Record<string, any>): LatLon => ({ lat: num(b.lat, 'lat'), lon: num(b.lon, 'lon') });
const text = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

function publicAed(a: (typeof store.aeds)[number]) {
  // Private fields (owner contact, expiry dates) never leave the server: only "tracked" or "overdue" for org devices.
  const { equipmentId, ...rest } = a;
  const eq = equipmentId ? store.equipment.find((e) => e.id === equipmentId) : undefined;
  const s = eq && worstStatus(equipmentChecks('aed', eq.dates));
  return { ...rest, open: openState(a.openingHours), ...(eq ? { maintenance: s === 'overdue' || s === 'missing' ? 'overdue' : 'tracked' } : {}) };
}

const dateStr = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Невалидна дата: ${name}`);
  return v;
};

/**
 * Public buildings from OSM (schools, pharmacies, ...) as candidate spots for the "next AEDs" recommender, cached.
 * No fallback grid: a recommendation on empty land would be worse than none, so when Overpass is unreachable
 * the coverage map still works and the placements list is empty (retried after a minute).
 */
let siteCache: (LatLon & { name: string })[] | null = null;
let siteRetryAt = 0;
async function candidateSites(): Promise<(LatLon & { name: string })[]> {
  if (siteCache) return siteCache;
  if (Date.now() < siteRetryAt) return [];
  try {
    const q = `[out:json][timeout:15];nwr["amenity"~"^(school|pharmacy|hospital|townhall|library|community_centre)$"](${CITY_BBOX.join(',')});out center tags;`;
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'DefiKarta/0.1 (drill backend; https://github.com/CecuTheMag/Defikarta)' },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const j = (await r.json()) as { elements: { lat?: number; lon?: number; center?: LatLon; tags?: Record<string, string> }[] };
    const sites = j.elements
      .map((e) => ({ lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, name: e.tags?.name ?? e.tags?.amenity ?? 'обект' }))
      .filter((s): s is LatLon & { name: string } => s.lat != null && s.lon != null);
    if (sites.length) return (siteCache = sites);
  } catch {
    // unreachable: handled below
  }
  siteRetryAt = Date.now() + 60_000;
  return [];
}

// ---------- routes ----------
type Handler = (ctx: { req: IncomingMessage; res: ServerResponse; url: URL; body: Record<string, any>; params: string[] }) => unknown | Promise<unknown>;
const routes: { method: string; re: RegExp; fn: Handler }[] = [];
const route = (method: string, path: string, fn: Handler) => routes.push({ method, re: new RegExp(`^${path.replace(/:\w+/g, '([^/]+)')}$`), fn });

route('GET', '/api/config', () => ({ env: 'drill', region: REGION, flags: store.flags, simSpeed: SIM_SPEED }));

route('POST', '/api/login', ({ body }) => {
  // Drill environment: no password, the test accounts (TEST_ACCOUNTS in db.ts) are public. Production uses email OTP (BLUEPRINT §14).
  const email = text(body.email, 120)?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, 'Невалиден имейл.');
  let user = [...store.users.values()].find((u) => u.email === email);
  if (!user) {
    user = { id: store.id('u'), email, name: email.split('@')[0]!, roles: ['public'] };
    store.users.set(user.id, user);
  }
  const token = store.id('tok') + Math.random().toString(36).slice(2);
  store.tokens.set(token, user.id);
  return { token, user };
});

route('GET', '/api/me', ({ req }) => {
  const u = need(req);
  const r = store.responders.get(u.id);
  return { user: u, responder: r ? { ...r, readiness: svc.readiness(r), recognizedIssuer: r.certificate ? issuerRecognized(r.certificate.issuer) : false } : null };
});

// --- personal data (mentor's question 3): see and delete what we hold about you
route('GET', '/api/me/data', ({ req }) => {
  const u = need(req);
  return {
    exportedAt: new Date().toISOString(),
    user: u,
    responder: store.responders.get(u.id) ?? null,
    offers: store.offers.filter((o) => o.responderId === u.id).map(({ botAt, botAccepts, ...o }) => o),
    assignments: store.assignments.filter((a) => a.responderId === u.id),
    preciseTracks: store.assignments.filter((a) => a.responderId === u.id && store.tracks.has(a.id)).map((a) => ({ assignmentId: a.id, points: store.tracks.get(a.id)!.length })),
    audit: store.audit.filter((a) => a.actor === u.id),
    retention: { preciseIncidentLocationDays: RETAIN_PRECISE_DAYS, tracks: 'изтриват се при затваряне на случая' },
  };
});

route('POST', '/api/rpc/delete_me', ({ req }) => {
  const u = need(req);
  if (svc.activeAssignment(u.id)) throw new HttpError(409, 'Имаш активен случай. Изтрий профила след като приключи.');
  if (u.email.endsWith('@drill.defikarta.bg')) throw new HttpError(403, 'Тестовите профили не се изтриват (ползвай „Нулирай учебната среда“).');
  store.responders.delete(u.id);
  store.users.delete(u.id);
  for (const [t, id] of store.tokens) if (id === u.id) store.tokens.delete(t);
  for (const o of store.offers) if (o.responderId === u.id) o.responderId = 'deleted';
  for (const a of store.assignments) if (a.responderId === u.id) a.responderId = 'deleted';
  for (const a of store.audit) if (a.actor === u.id) a.actor = 'deleted';
  svc.audit('deleted', 'delete_me');
  svc.changed();
  return { ok: true };
});

route('GET', '/api/aeds', () => ({ aeds: store.aeds.filter((a) => a.status !== 'retired').map(publicAed) }));

// --- registry
route('POST', '/api/rpc/submit_aed', ({ req, body }) => {
  const u = userOf(req);
  const p = pos(body);
  const name = text(body.name, 120);
  if (!name) throw new HttpError(400, 'Добави име на мястото.');
  const by = u?.id ?? 'anon';
  const recent = store.submissions.filter((s) => s.by === by && Date.now() - Date.parse(s.submittedAt) < 3_600_000).length;
  if (recent >= 5) throw new HttpError(429, 'Най-много 5 предложения на час.');
  const sub: Submission = {
    id: store.id('sub'),
    submittedAt: new Date().toISOString(),
    status: 'pending',
    by,
    payload: { name, ...p, locationHint: text(body.locationHint), openingHours: text(body.openingHours, 120), access: text(body.access, 30), indoor: typeof body.indoor === 'boolean' ? body.indoor : undefined },
  };
  store.submissions.push(sub);
  svc.audit(u?.id ?? 'anon', 'submit_aed', sub.id);
  return { id: sub.id, status: sub.status };
});

route('GET', '/api/submissions', ({ req }) => {
  need(req, 'verifier');
  return { submissions: store.submissions.slice().reverse() };
});

route('POST', '/api/rpc/review_submission', ({ req, body }) => {
  const u = need(req, 'verifier');
  const sub = store.submissions.find((s) => s.id === body.id);
  if (!sub) throw new HttpError(404, 'Няма такова предложение.');
  if (sub.status !== 'pending') throw new HttpError(409, 'Вече е прегледано.');
  const decision = body.decision as 'approve' | 'reject';
  sub.reviewNote = text(body.note);
  if (decision === 'reject') sub.status = 'rejected';
  else {
    const near = store.aeds.find((a) => distanceM(a, sub.payload) < 40); // same merge rule as the apps: within 40 m = same device
    if (near) {
      sub.status = 'duplicate';
      sub.aedId = near.id;
    } else {
      const aed = { id: `local:${sub.id}`, source: 'local' as const, status: 'verified' as const, verifiedAt: new Date().toISOString().slice(0, 10), ...sub.payload };
      store.aeds.push(aed);
      sub.status = 'approved';
      sub.aedId = aed.id;
    }
  }
  svc.audit(u.id, `review_submission:${sub.status}`, sub.id);
  svc.changed();
  return { submission: sub };
});

// --- responders
route('POST', '/api/rpc/register_responder', ({ req, body }) => {
  const u = need(req);
  if (store.responders.has(u.id)) throw new HttpError(409, 'Вече си подал заявка.');
  const year = num(body.birthYear, 'birthYear');
  const scope = new Date().getFullYear() - year >= 18 ? 'street' : 'school';
  store.responders.set(u.id, {
    userId: u.id,
    scope,
    status: 'pending',
    availability: 'off',
    acceptCount: 0,
    offerCount: 0,
    bot: false,
    certificate: { issuer: text(body.issuer, 120) ?? '—', issuedOn: text(body.issuedOn, 10) ?? '—', status: 'pending' },
  });
  svc.audit(u.id, 'register_responder');
  svc.changed();
  return { scope, status: 'pending' };
});

route('GET', '/api/certificates', ({ req }) => {
  need(req, 'verifier');
  const list = [...store.responders.values()]
    .filter((r) => !r.bot && r.certificate)
    .map((r) => ({ userId: r.userId, name: store.users.get(r.userId)?.name, email: store.users.get(r.userId)?.email, scope: r.scope, status: r.status, verifiedUntil: r.verifiedUntil, certificate: r.certificate, recognizedIssuer: issuerRecognized(r.certificate!.issuer), validUntil: /^\d{4}-\d{2}-\d{2}$/.test(r.certificate!.issuedOn) ? certValidUntil(r.certificate!.issuedOn) : null }));
  return { certificates: list };
});

route('POST', '/api/rpc/review_certificate', ({ req, body }) => {
  const u = need(req, 'verifier');
  const r = store.responders.get(String(body.userId));
  if (!r?.certificate) throw new HttpError(404, 'Няма такава заявка.');
  if (body.decision === 'approve') {
    // Question 1: validity follows the course date (CERT_VALID_YEARS); a verifier may only shorten it.
    const max = /^\d{4}-\d{2}-\d{2}$/.test(r.certificate.issuedOn) ? certValidUntil(r.certificate.issuedOn) : null;
    if (!max) throw new HttpError(400, 'Удостоверението няма валидна дата на издаване.');
    if (max < isoDate(new Date())) throw new HttpError(409, `Удостоверението е изтекло на ${max}. Нужен е опреснителен курс.`);
    const asked = text(body.verifiedUntil, 10);
    r.status = 'verified';
    r.certificate.status = 'approved';
    r.verifiedUntil = asked && asked < max ? asked : max;
    const user = store.users.get(r.userId)!;
    if (!user.roles.includes('responder')) user.roles.push('responder');
  } else {
    r.certificate.status = 'rejected';
    r.certificate.note = text(body.note);
  }
  svc.audit(u.id, `review_certificate:${r.certificate.status}`, r.userId);
  svc.changed();
  return { status: r.status };
});

route('POST', '/api/rpc/set_availability', ({ req, body }) => {
  const u = need(req, 'responder');
  const r = store.responders.get(u.id);
  if (!r || r.status !== 'verified') throw new HttpError(403, 'Още не си потвърден доброволец.');
  if (r.certificate?.status !== 'approved' && !r.bot) throw new HttpError(403, 'Удостоверението не е одобрено.');
  const missing = svc.readiness(r).missing;
  if (body.mode === 'around' && missing.length && !r.bot) throw new HttpError(403, `Първо довърши: ${missing.map((m) => ({ certificate: 'валидно удостоверение', terms: 'условия', consent: 'съгласие за местоположение', quiz: 'проверка на знанията' })[m]).join(', ')}.`);
  r.availability = body.mode === 'around' ? 'around' : 'off';
  if (body.lat != null) {
    r.pos = pos(body);
    r.posAt = Date.now();
  }
  if (r.availability === 'around' && !r.pos) throw new HttpError(400, 'Задай позиция.');
  svc.changed();
  return { availability: r.availability, pos: r.pos };
});

// --- volunteer onboarding (mentor's questions 1–2, 5)
route('GET', '/api/responder/terms', () => ({ version: TERMS_VERSION, terms: VOLUNTEER_TERMS }));

route('POST', '/api/rpc/accept_terms', ({ req, body }) => {
  const u = need(req, 'responder');
  const r = store.responders.get(u.id);
  if (!r) throw new HttpError(404, 'Не си доброволец.');
  if (body.version !== TERMS_VERSION) throw new HttpError(409, 'Условията са променени. Прочети новата версия.');
  if (body.locationConsent !== true) throw new HttpError(400, 'Без съгласие за местоположение не можем да те известяваме.');
  r.termsVersion = TERMS_VERSION;
  r.termsAt = Date.now();
  r.locationConsentAt = Date.now();
  svc.audit(u.id, `accept_terms:${TERMS_VERSION}`);
  return { ok: true };
});

route('POST', '/api/rpc/withdraw_consent', ({ req }) => {
  const u = need(req, 'responder');
  const r = store.responders.get(u.id);
  if (!r) throw new HttpError(404, 'Не си доброволец.');
  r.locationConsentAt = undefined;
  r.availability = 'off';
  r.pos = undefined;
  svc.audit(u.id, 'withdraw_consent');
  svc.changed();
  return { ok: true };
});

route('GET', '/api/responder/quiz', () => ({ questions: CPR_QUIZ.map(({ q, options }) => ({ q, options })) }));

route('POST', '/api/rpc/pass_quiz', ({ req, body }) => {
  const u = need(req, 'responder');
  const r = store.responders.get(u.id);
  if (!r) throw new HttpError(404, 'Не си доброволец.');
  const answers = Array.isArray(body.answers) ? body.answers.map(Number) : [];
  const g = gradeQuiz(answers);
  if (g.passed) r.quizPassedAt = Date.now();
  svc.audit(u.id, `quiz:${g.correct}/${CPR_QUIZ.length}`);
  return { ...g, total: CPR_QUIZ.length, wrong: CPR_QUIZ.flatMap((q, i) => (answers[i] === q.answer ? [] : [i])) };
});

route('POST', '/api/rpc/set_quiet_hours', ({ req, body }) => {
  const u = need(req, 'responder');
  const r = store.responders.get(u.id);
  if (!r) throw new HttpError(404, 'Не си доброволец.');
  if (body.from == null) r.quiet = undefined;
  else {
    const from = num(body.from, 'from');
    const to = num(body.to, 'to');
    if (from < 0 || from > 23 || to < 0 || to > 23) throw new HttpError(400, 'Часовете са от 0 до 23.');
    r.quiet = { from, to };
  }
  return { quiet: r.quiet ?? null };
});

route('POST', '/api/rpc/withdraw_unsafe', ({ req, body }) => {
  const u = need(req, 'responder');
  return svc.withdrawUnsafe(u.id, String(body.assignmentId));
});

route('GET', '/api/responder/state', ({ req }) => {
  const u = need(req, 'responder');
  const r = store.responders.get(u.id)!;
  const offers = store.offers
    .filter((o) => o.responderId === u.id && o.status === 'sent' && Date.now() <= o.expiresAt)
    .map((o) => {
      const inc = store.incidents.get(o.incidentId)!;
      const aed = o.aedId ? store.aeds.find((a) => a.id === o.aedId) : undefined;
      const d = r.pos ? distanceM(r.pos, inc.pos) : 0;
      // Push-like payload: only a distance band until the offer is accepted.
      return { id: o.id, role: o.role, drill: true, band: `~${Math.max(50, Math.round(d / 50) * 50)} м`, expiresAt: o.expiresAt, suggestedAed: aed ? { name: aed.name } : null, called112: inc.called112, caution: inc.scene !== 'safe' };
    });
  const a = store.assignments.find((x) => x.responderId === u.id && x.status !== 'released');
  let active = null;
  if (a) {
    const inc = store.incidents.get(a.incidentId)!;
    const aed = a.aedId ? store.aeds.find((x) => x.id === a.aedId) : undefined;
    active = { assignment: a, incident: { id: inc.id, state: inc.state, pos: inc.pos, source: inc.source, scene: inc.scene, called112: inc.called112 }, aed: aed ? { name: aed.name, lat: aed.lat, lon: aed.lon, locationHint: aed.locationHint } : null };
    svc.audit(u.id, 'view_precise_location', inc.id);
  }
  // After a case: a short debrief card for 30 minutes (support contact to be agreed with БЧК).
  const last = active ? undefined : store.assignments.filter((x) => x.responderId === u.id && x.status === 'released' && Date.now() - x.updatedAt < 30 * 60_000).at(-1);
  return { responder: { ...r, readiness: svc.readiness(r) }, offers, active, debrief: last ? { at: last.updatedAt, unsafe: !!last.unsafeWithdraw } : null };
});

route('POST', '/api/rpc/respond_offer', ({ req, body }) => {
  const u = need(req, 'responder');
  return svc.respondOffer(u.id, String(body.offerId), body.answer === 'decline' ? 'decline' : 'accept', body.role === 'cpr' ? 'cpr' : undefined);
});

route('POST', '/api/rpc/report_event', ({ req, body }) => {
  const u = userOf(req);
  const type = body.type as 'on_scene' | 'aed_collected' | 'aed_on_scene' | 'ems_on_scene';
  if (!['on_scene', 'aed_collected', 'aed_on_scene', 'ems_on_scene'].includes(type)) throw new HttpError(400, 'Невалидно събитие.');
  return svc.reportEvent(u?.id ?? null, String(body.incidentId), type, text(body.deviceId, 60));
});

route('POST', '/api/rpc/push_location', ({ req, body }) => {
  const u = need(req, 'responder');
  svc.pushLocation(u.id, String(body.assignmentId), pos(body));
  return { ok: true };
});

// --- incidents
route('POST', '/api/rpc/create_incident', ({ req, body }) => {
  const u = userOf(req);
  const source = body.source === 'drill' ? 'drill' : 'bystander';
  if (source === 'drill') need(req, 'dispatcher');
  const scene = (['safe', 'unknown', 'unsafe'] as const).find((x) => x === body.scene);
  const inc = svc.createIncident({ source, pos: pos(body), label: text(body.label, 80), createdBy: u?.id ?? null, deviceId: text(body.deviceId, 60), key: text(body.key, 80), called112: body.called112 === true, scene });
  svc.audit(u?.id ?? 'anon', `create_incident:${source}`, inc.id);
  return { id: inc.id, state: inc.state };
});

route('GET', '/api/public/incident/:id', ({ params }) => {
  const inc = store.incidents.get(params[0]!);
  if (!inc) throw new HttpError(404, 'Няма такъв случай.');
  return svc.publicIncident(inc);
});

route('POST', '/api/rpc/close_incident', ({ req, body }) => {
  const inc = store.incidents.get(String(body.incidentId));
  if (!inc) throw new HttpError(404, 'Няма такъв случай.');
  const u = userOf(req);
  const creator = !!body.deviceId && inc.deviceId === body.deviceId;
  if (!creator) need(req, 'dispatcher');
  svc.closeIncident(inc, u?.id ?? 'bystander', body.cancel ? 'cancelled' : 'closed');
  return { state: inc.state };
});

route('POST', '/api/rpc/set_scene', ({ req, body }) => {
  const u = need(req, 'dispatcher');
  const inc = store.incidents.get(String(body.incidentId));
  if (!inc) throw new HttpError(404, 'Няма такъв случай.');
  const scene = (['safe', 'unknown', 'unsafe'] as const).find((x) => x === body.scene);
  if (!scene) throw new HttpError(400, 'Невалидна стойност.');
  svc.setScene(inc, scene, u.id);
  svc.audit(u.id, `set_scene:${scene}`, inc.id);
  return { scene };
});

route('GET', '/api/console/state', ({ req }) => {
  need(req, 'dispatcher');
  const name = (id: string) => store.users.get(id)?.name ?? id;
  const incidents = [...store.incidents.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12)
    .map((inc) => ({
      id: inc.id,
      source: inc.source,
      state: inc.state,
      wave: inc.wave,
      pos: inc.pos,
      label: inc.label,
      createdAt: inc.createdAt,
      public: svc.publicIncident(inc),
      offers: store.offers.filter((o) => o.incidentId === inc.id).map((o) => ({ ...o, name: name(o.responderId), pos: store.responders.get(o.responderId)?.pos })),
      assignments: svc.incidentAssignments(inc.id, true).map((a) => ({ ...a, name: name(a.responderId), pos: store.responders.get(a.responderId)?.pos, track: store.tracks.get(a.id)?.slice(-60).map((t) => t.pos) ?? [] })),
      events: inc.events.slice(-40),
      aeds: svc.incidentAssignments(inc.id).flatMap((a) => (a.aedId ? [store.aeds.find((x) => x.id === a.aedId)].filter(Boolean) : [])),
    }));
  const responders = [...store.responders.values()].filter((r) => r.pos).map((r) => ({ id: r.userId, name: name(r.userId), pos: r.pos, bot: r.bot, availability: r.availability, busy: !!svc.activeAssignment(r.userId) }));
  svc.audit(need(req).id, 'view_live_map');
  return { incidents, responders, aeds: store.aeds.map(publicAed), simSpeed: SIM_SPEED };
});

route('GET', '/api/incidents/:id/report', ({ req, params }) => {
  need(req, 'dispatcher');
  const inc = store.incidents.get(params[0]!);
  if (!inc) throw new HttpError(404, 'Няма такъв случай.');
  return svc.report(inc);
});

// --- coverage
route('GET', '/api/coverage', async ({ req, url }) => {
  if (!store.flags.coverage_public) need(req, 'admin');
  const scenario = (['now', 'weekday', 'night', 'always'].includes(url.searchParams.get('scenario') ?? '') ? url.searchParams.get('scenario') : 'now') as CoverageScenario;
  const usable = store.aeds.filter((a) => a.status !== 'retired');
  const result = coverageGrid(CITY_BBOX, usable, scenario, 250);
  const sites = await candidateSites();
  const picks = recommendPlacements(result.cells, sites, 5);
  return { scenario, stepM: result.stepM, within5: result.within5, cells: result.cells.map((c) => [Number(c.lat.toFixed(5)), Number(c.lon.toFixed(5)), c.min]), placements: picks, placementsAvailable: sites.length > 0, aedCount: usable.length, center: STARA_ZAGORA_CENTER };
});

// --- organisations: equipment registry, maintenance, reminders, reports
function orgOf(u: User) {
  const org = store.orgs.find((o) => o.ownerIds.includes(u.id)) ?? (u.roles.includes('admin') ? store.orgs[0] : undefined);
  if (!org) throw new HttpError(404, 'Профилът не е свързан с организация.');
  return org;
}

function equipmentView(eq: Equipment) {
  const checks = equipmentChecks(eq.kind, eq.dates);
  return { ...eq, checks, status: worstStatus(checks), gaps: eq.kind === 'aed' ? publicPlaceGaps(eq.publicPlace, eq.dates) : [] };
}

function ownEquipment(u: User, id: unknown): Equipment {
  const org = orgOf(u);
  const eq = store.equipment.find((e) => e.id === id && e.orgId === org.id);
  if (!eq) throw new HttpError(404, 'Няма такова оборудване.');
  return eq;
}

route('GET', '/api/org', ({ req }) => {
  const u = need(req, 'aed_owner');
  const org = orgOf(u);
  const items = store.equipment.filter((e) => e.orgId === org.id).map(equipmentView);
  const count = (s: string) => items.filter((i) => i.status === s).length;
  return {
    org,
    sites: store.sites.filter((s) => s.orgId === org.id),
    equipment: items,
    summary: { total: items.length, ok: count('ok'), soon: count('soon'), overdue: count('overdue'), missing: count('missing') },
    outbox: store.outbox.filter((m) => org.ownerIds.some((id) => store.users.get(id)?.email === m.to)).slice(-25).reverse(),
    log: store.maintenance.filter((m) => items.some((i) => i.id === m.equipmentId)).slice(-25).reverse(),
    checklistLabels: CHECKLIST_LABEL,
  };
});

route('POST', '/api/rpc/log_maintenance', ({ req, body }) => {
  const u = need(req, 'aed_owner');
  const eq = ownEquipment(u, body.equipmentId);
  const action = body.action as CheckKey;
  const date = body.date ? dateStr(body.date, 'date') : isoDate(new Date());
  if (date > isoDate(new Date())) throw new HttpError(400, 'Датата на дейността не може да е в бъдещето.');
  // Replacing a part records its new printed expiry; inspections and services record when they were done.
  const expiryField = { battery: 'batteryExpires', pads: 'padsExpires', contents: 'contentsExpire' } as const;
  const doneField = { inspection: 'lastInspection', service: 'lastService', hydro: 'lastHydro' } as const;
  if (action in expiryField) eq.dates[expiryField[action as keyof typeof expiryField]] = dateStr(body.newExpiry, 'newExpiry');
  else if (action in doneField) eq.dates[doneField[action as keyof typeof doneField]] = date;
  else throw new HttpError(400, 'Невалидно действие.');
  store.maintenance.push({ id: store.id('mnt'), equipmentId: eq.id, date, by: u.name, action, note: text(body.note) });
  svc.audit(u.id, `maintenance:${action}`, eq.id);
  svc.changed();
  return { equipment: equipmentView(eq) };
});

route('POST', '/api/rpc/add_equipment', ({ req, body }) => {
  const u = need(req, 'aed_owner');
  const org = orgOf(u);
  const site = store.sites.find((s) => s.id === body.siteId && s.orgId === org.id);
  if (!site) throw new HttpError(400, 'Избери обект.');
  const kind = body.kind as EquipmentKind;
  if (!(kind in KIND_LABEL)) throw new HttpError(400, 'Невалиден вид.');
  const model = text(body.model, 80);
  if (!model) throw new HttpError(400, 'Добави модел.');
  const d = (k: string) => (body[k] ? dateStr(body[k], k) : undefined);
  const eq: Equipment = { id: store.id('eq'), orgId: org.id, siteId: site.id, kind, model, serial: text(body.serial, 40), locationHint: text(body.locationHint, 120), dates: { batteryExpires: d('batteryExpires'), padsExpires: d('padsExpires'), contentsExpire: d('contentsExpire'), lastInspection: d('lastInspection'), lastService: d('lastService'), lastHydro: d('lastHydro') } };
  store.equipment.push(eq);
  svc.audit(u.id, 'add_equipment', eq.id);
  svc.changed();
  return { equipment: equipmentView(eq) };
});

route('POST', '/api/rpc/set_listing', ({ req, body }) => {
  const u = need(req, 'aed_owner');
  const eq = ownEquipment(u, body.equipmentId);
  if (eq.kind !== 'aed') throw new HttpError(400, 'Само дефибрилатори се показват на картата.');
  const c = body.checklist ?? {};
  eq.publicPlace = { signage: !!c.signage, directionSigns: !!c.directionSigns, instructionsBg: !!c.instructionsBg, accessible: !!c.accessible };
  eq.openingHours = text(body.openingHours, 120) ?? eq.openingHours;
  const listed = store.aeds.find((a) => a.id === eq.listedAedId);
  if (body.listed) {
    const site = store.sites.find((s) => s.id === eq.siteId)!;
    const org = orgOf(u);
    const rec = { id: eq.listedAedId ?? `org:${eq.id}`, source: 'org' as const, status: 'verified' as const, equipmentId: eq.id, name: `${org.name}, ${site.name}`, lat: site.lat, lon: site.lon, openingHours: eq.openingHours, locationHint: eq.locationHint, access: 'yes' };
    if (listed) Object.assign(listed, rec);
    else store.aeds.push(rec);
    eq.listedAedId = rec.id;
  } else if (listed) listed.status = 'retired';
  svc.audit(u.id, `set_listing:${!!body.listed}`, eq.id);
  svc.changed();
  return { equipment: equipmentView(eq) };
});

route('POST', '/api/rpc/run_reminders', ({ req }) => {
  need(req, 'aed_owner');
  return { sent: svc.runReminders() };
});

route('GET', '/api/org/report.csv', ({ req }) => {
  const u = need(req, 'aed_owner');
  const org = orgOf(u);
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const STATUS = { ok: 'наред', soon: 'скоро', overdue: 'просрочено', missing: 'няма запис' };
  const rows = [['Обект', 'Вид', 'Модел', 'Сериен №', 'Място', 'Проверка', 'Срок', 'Статус', 'На картата', 'Липси по наредбата'].map(q).join(',')];
  for (const eq of store.equipment.filter((e) => e.orgId === org.id)) {
    const v = equipmentView(eq);
    const site = store.sites.find((s) => s.id === eq.siteId)?.name;
    const listed = store.aeds.some((a) => a.id === eq.listedAedId && a.status !== 'retired');
    for (const c of v.checks) rows.push([site, KIND_LABEL[eq.kind], eq.model, eq.serial, eq.locationHint, c.label, c.due ?? '', STATUS[c.status], eq.kind === 'aed' ? (listed ? 'да' : 'не') : '', v.gaps.map((g) => CHECKLIST_LABEL[g]).join('; ')].map(q).join(','));
  }
  svc.audit(u.id, 'export_report');
  return new Raw('text/csv; charset=utf-8', '\ufeff' + rows.join('\r\n'), `defikarta-${isoDate(new Date())}.csv`);
});

// --- admin
route('POST', '/api/admin/flags', ({ req, body }) => {
  const u = need(req, 'admin');
  const key = String(body.key) as keyof typeof store.flags;
  if (!(key in store.flags) || typeof body.value !== typeof store.flags[key]) throw new HttpError(400, 'Невалиден флаг.');
  (store.flags as unknown as Record<string, unknown>)[key] = body.value;
  svc.audit(u.id, `flag:${key}=${body.value}`);
  svc.changed();
  return { flags: store.flags };
});

route('GET', '/api/admin/audit', ({ req }) => {
  need(req, 'admin');
  return { audit: store.audit.slice(-100).reverse() };
});

route('POST', '/api/admin/reset', ({ req }) => {
  const u = need(req, 'admin');
  store.reset();
  store.tokens.clear();
  svc.runReminders();
  svc.changed();
  return { ok: true, note: `reset by ${u.id}` };
});

// ---------- server ----------
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': hi\n\n');
      streams.add(res);
      const ka = setInterval(() => res.write(': ka\n\n'), 20_000);
      req.on('close', () => {
        clearInterval(ka);
        streams.delete(res);
      });
      return;
    }
    for (const r of routes) {
      const m = r.method === req.method && r.re.exec(url.pathname);
      if (!m) continue;
      const body = req.method === 'POST' ? await readJson(req) : {};
      return send(res, 200, await r.fn({ req, res, url, body, params: m.slice(1) }));
    }
    send(res, 404, { error: 'Не е намерено.' });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Вътрешна грешка.' });
  }
}).listen(PORT, HOST, () => console.log(`ДефиКарта server (drill env) on http://${HOST}:${PORT}  sim speed x${SIM_SPEED}`));
