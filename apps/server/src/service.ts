import {
  aedUsable,
  coarsen,
  DEFAULT_DISPATCH,
  distanceM,
  equipmentChecks,
  estimateWalkS,
  inQuietHours,
  isActive,
  nextAssignmentStatus,
  nextIncidentState,
  openState,
  planWave,
  QUIZ_VALID_DAYS,
  reminderStage,
  RETAIN_PRECISE_DAYS,
  STARA_ZAGORA_BBOX,
  TERMS_VERSION,
  type DispatchAed,
  type DispatchConfig,
  type IncidentEvent,
  type LatLon,
  type SceneSafety,
} from '@defikarta/core';
import { REGION, Store, type Assignment, type Incident, type Offer, type Responder } from './db';

/** Bots walk this many times faster than real life so a drill fits into a demo. Humans are never scaled. */
export const SIM_SPEED = Number(process.env.SIM_SPEED ?? 6);
const BOT_ACCEPT_P = 0.8;
const WALK_M_S = 1.25;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Deterministic 0..1 from a string, so bot behaviour is reproducible between demos. */
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const inBbox = (p: LatLon) => p.lat >= STARA_ZAGORA_BBOX[0] && p.lon >= STARA_ZAGORA_BBOX[1] && p.lat <= STARA_ZAGORA_BBOX[2] && p.lon <= STARA_ZAGORA_BBOX[3];

export class Service {
  constructor(
    public s: Store,
    public changed: (incidentId?: string) => void,
  ) {}

  // ---------- helpers ----------
  config(): DispatchConfig {
    const f = this.s.flags;
    return { ...DEFAULT_DISPATCH, waveTimeoutS: f['dispatch.waveTimeoutS'], targetCpr: f['dispatch.targetCpr'], targetAed: f.aed_runner_role ? f['dispatch.targetAed'] : 0 };
  }

  audit(actor: string, action: string, subject?: string) {
    this.s.audit.push({ at: Date.now(), actor, action, subject });
  }

  log(inc: Incident, actor: string, type: string, data?: Record<string, unknown>) {
    inc.events.push({ at: Date.now(), actor, type, data });
  }

  private apply(inc: Incident, event: IncidentEvent, actor: string, data?: Record<string, unknown>): boolean {
    const next = nextIncidentState(inc.state, event);
    if (!next) return false;
    inc.state = next;
    inc.version++;
    this.log(inc, actor, 'state', { ...data, event, state: next });
    return true;
  }

  activeAssignment(responderId: string): Assignment | undefined {
    return this.s.assignments.find((a) => a.responderId === responderId && a.status !== 'released');
  }

  incidentAssignments(incId: string, includeReleased = false): Assignment[] {
    return this.s.assignments.filter((a) => a.incidentId === incId && (includeReleased || a.status !== 'released'));
  }

  private claimedAedIds(): Set<string> {
    return new Set(this.s.assignments.filter((a) => a.role === 'aed_runner' && a.aedId && (a.status === 'en_route' || a.status === 'aed_collected')).map((a) => a.aedId!));
  }

  private eligible(inc: Incident) {
    const today = new Date().toISOString().slice(0, 10);
    const offered = new Set(this.s.offers.filter((o) => o.incidentId === inc.id).map((o) => o.responderId));
    const busyOffer = new Set(this.s.offers.filter((o) => o.status === 'sent' && o.incidentId !== inc.id).map((o) => o.responderId));
    const out: Responder[] = [];
    for (const r of this.s.responders.values()) {
      if (r.status !== 'verified' || (r.verifiedUntil && r.verifiedUntil < today)) continue;
      if (!r.bot && this.readiness(r).missing.length) continue;
      if (inQuietHours(r.quiet)) continue;
      if (r.availability !== 'around' || !r.pos) continue;
      if (!r.bot && Date.now() - (r.posAt ?? 0) > 30 * 60_000) continue; // presence expires after 30 min
      if (r.scope === 'street' && inc.source !== 'drill' && !this.s.flags.street_alerts) continue;
      if (this.activeAssignment(r.userId) || offered.has(r.userId) || busyOffer.has(r.userId)) continue;
      out.push(r);
    }
    return out;
  }

  /**
   * What a volunteer still has to do before alerts can reach them (mentor's questions 1–3):
   * valid certificate, current terms accepted, location consent, knowledge check within QUIZ_VALID_DAYS.
   */
  readiness(r: Responder) {
    const today = new Date().toISOString().slice(0, 10);
    const missing: ('certificate' | 'terms' | 'consent' | 'quiz')[] = [];
    if (r.status !== 'verified' || r.certificate?.status !== 'approved' || (r.verifiedUntil && r.verifiedUntil < today)) missing.push('certificate');
    if (r.termsVersion !== TERMS_VERSION) missing.push('terms');
    if (!r.locationConsentAt) missing.push('consent');
    if (!r.quizPassedAt || Date.now() - r.quizPassedAt > QUIZ_VALID_DAYS * 86_400_000) missing.push('quiz');
    return { missing, termsVersion: TERMS_VERSION, quizValidUntil: r.quizPassedAt ? r.quizPassedAt + QUIZ_VALID_DAYS * 86_400_000 : null };
  }

  // ---------- incidents ----------
  createIncident(input: { source: Incident['source']; pos: LatLon; label?: string; createdBy: string | null; deviceId?: string; key?: string; called112?: boolean; scene?: SceneSafety }): Incident {
    if (!inBbox(input.pos)) throw new HttpError(400, 'Мястото е извън обхвата на региона.');
    if (input.key) {
      const dup = [...this.s.incidents.values()].find((i) => i.key === input.key);
      if (dup) return dup;
    }
    if (input.source === 'bystander') {
      if (!this.s.flags.public_alerts) throw new HttpError(403, 'Известяването на доброволци е изключено.');
      // Question 4: the alert never replaces 112 (the Health Act obliges anyone at the scene to call it).
      if (!input.called112) throw new HttpError(400, 'Първо се обади на 112.');
      // Question 5: nobody is sent into a scene the caller says is dangerous.
      if (input.scene === 'unsafe') throw new HttpError(409, 'Мястото е опасно: доброволци не се изпращат. Пази се и чакай 112.');
      const gapS = process.env.PROD ? 600 : 20; // BLUEPRINT §14: 1 per 10 min in production; short in the drill environment
      const k = `inc:${input.deviceId ?? 'anon'}`;
      const last = this.s.rate.get(k) ?? 0;
      if (Date.now() - last < gapS * 1000) throw new HttpError(429, 'Вече има сигнал от това устройство. Изчакай малко.');
      this.s.rate.set(k, Date.now());
    }
    const inc: Incident = {
      id: this.s.id('inc'),
      source: input.source,
      pos: input.pos,
      label: input.label,
      state: 'DISPATCHING',
      wave: 0,
      waveStartedAt: 0,
      createdAt: Date.now(),
      createdBy: input.createdBy,
      deviceId: input.deviceId,
      key: input.key,
      called112: input.source !== 'bystander' || !!input.called112,
      scene: input.source === 'bystander' ? (input.scene ?? 'unknown') : 'safe',
      emsEtaS: REGION.emsEtaMin * 60,
      version: 1,
      events: [],
    };
    this.s.incidents.set(inc.id, inc);
    this.log(inc, input.createdBy ?? 'bystander', 'create', { source: input.source });
    this.startWave(inc);
    this.changed(inc.id);
    return inc;
  }

  private startWave(inc: Incident) {
    if (inc.scene === 'unsafe') return;
    const now = Date.now();
    const cfg = this.config();
    const claimed = this.claimedAedIds();
    const aeds: DispatchAed[] = [];
    for (const a of this.s.aeds) {
      if (a.status === 'retired') continue;
      const open = openState(a.openingHours);
      if (open === 'closed') continue;
      const eq = a.equipmentId ? this.s.equipment.find((x) => x.id === a.equipmentId) : undefined;
      if (eq && !aedUsable(eq.dates)) continue; // expired battery or pads: a runner would bring a device that cannot shock
      aeds.push({ id: a.id, lat: a.lat, lon: a.lon, indoorOrLevel: a.indoor, claimed: claimed.has(a.id), unknownHours: open === 'unknown' });
    }
    const mine = this.incidentAssignments(inc.id);
    const runner = mine.find((a) => a.role === 'aed_runner');
    const runnerOffer = runner && this.s.offers.find((o) => o.incidentId === inc.id && o.responderId === runner.responderId && o.status === 'accepted');
    const planned = planWave({
      patient: inc.pos,
      wave: inc.wave,
      emsEtaS: inc.emsEtaS,
      candidates: this.eligible(inc).map((r) => ({ id: r.userId, pos: r.pos!, acceptCount: r.acceptCount, offerCount: r.offerCount })),
      aeds,
      acceptedCpr: mine.filter((a) => a.role === 'cpr').length,
      acceptedRunners: mine.filter((a) => a.role === 'aed_runner').length,
      bestAedArrivalS: runnerOffer?.tViaAedS ? Math.max(0, runnerOffer.tViaAedS - (now - (runnerOffer.answeredAt ?? now)) / 1000) : Infinity,
      config: cfg,
    });
    inc.waveStartedAt = now;
    for (const p of planned) {
      const r = this.s.responders.get(p.responderId)!;
      r.offerCount++;
      const offer: Offer = {
        id: this.s.id('off'),
        incidentId: inc.id,
        responderId: p.responderId,
        wave: inc.wave,
        role: p.role,
        aedId: p.aedId,
        tDirectS: p.tDirectS,
        tViaAedS: p.tViaAedS,
        status: 'sent',
        sentAt: now,
        expiresAt: now + cfg.waveTimeoutS * 1000,
      };
      if (r.bot) {
        offer.botAt = now + (2 + rand(`${inc.id}${r.userId}t`) * 7) * 1000;
        offer.botAccepts = rand(`${inc.id}${r.userId}a`) < BOT_ACCEPT_P;
      }
      this.s.offers.push(offer);
    }
    this.log(inc, 'dispatch', 'wave', { wave: inc.wave, offers: planned.length, cpr: planned.filter((p) => p.role === 'cpr').length, runners: planned.filter((p) => p.role === 'aed_runner').length });
  }

  private targetsMet(inc: Incident): boolean {
    const cfg = this.config();
    const mine = this.incidentAssignments(inc.id);
    return mine.filter((a) => a.role === 'cpr').length >= cfg.targetCpr && mine.filter((a) => a.role === 'aed_runner').length >= cfg.targetAed;
  }

  respondOffer(userId: string, offerId: string, answer: 'accept' | 'decline', role?: 'cpr' | 'aed_runner') {
    const offer = this.s.offers.find((o) => o.id === offerId && o.responderId === userId);
    if (!offer) throw new HttpError(404, 'Няма такава оферта.');
    const inc = this.s.incidents.get(offer.incidentId)!;
    if (offer.status === 'accepted') {
      const a = this.s.assignments.find((x) => x.incidentId === inc.id && x.responderId === userId)!;
      return { assignment: a, downgraded: false, incident: { id: inc.id, pos: inc.pos } }; // idempotent
    }
    if (offer.status !== 'sent') throw new HttpError(409, 'Офертата вече не е валидна.');
    const now = Date.now();
    if (now > offer.expiresAt || !isActive(inc.state)) {
      offer.status = isActive(inc.state) ? 'expired' : 'withdrawn';
      throw new HttpError(409, 'Офертата вече не е валидна.');
    }
    offer.answeredAt = now;
    const resp = this.s.responders.get(userId)!;
    if (answer === 'decline') {
      offer.status = 'declined';
      this.log(inc, userId, 'offer_declined', { offer: offer.id });
      this.changed(inc.id);
      return { declined: true };
    }
    if (this.activeAssignment(userId)) throw new HttpError(409, 'Вече си в друг случай.');
    let assigned = role && role !== offer.role && role === 'cpr' ? 'cpr' : offer.role;
    let downgraded = false;
    // The database refuses two runners for one AED; here the server downgrades the second accept to CPR.
    if (assigned === 'aed_runner' && (!offer.aedId || this.claimedAedIds().has(offer.aedId) || this.config().targetAed === 0)) {
      assigned = 'cpr';
      downgraded = true;
    }
    offer.status = 'accepted';
    resp.acceptCount++;
    const a: Assignment = { id: this.s.id('asg'), incidentId: inc.id, responderId: userId, role: assigned as Assignment['role'], aedId: assigned === 'aed_runner' ? offer.aedId : undefined, status: 'en_route', updatedAt: now };
    this.s.assignments.push(a);
    this.apply(inc, 'offer_accepted', userId, { offer: offer.id, role: a.role, downgraded });
    this.log(inc, userId, 'assignment', { role: a.role, aed: a.aedId });
    if (this.targetsMet(inc)) {
      for (const o of this.s.offers) if (o.incidentId === inc.id && o.status === 'sent') o.status = 'withdrawn';
    }
    this.changed(inc.id);
    return { assignment: a, downgraded, incident: { id: inc.id, pos: inc.pos } };
  }

  reportEvent(userId: string | null, incidentId: string, type: 'on_scene' | 'aed_collected' | 'aed_on_scene' | 'ems_on_scene', deviceId?: string) {
    const inc = this.s.incidents.get(incidentId);
    if (!inc) throw new HttpError(404, 'Няма такъв случай.');
    const mine = userId ? this.s.assignments.find((a) => a.incidentId === incidentId && a.responderId === userId && a.status !== 'released') : undefined;
    if (type === 'ems_on_scene') {
      const creator = deviceId && inc.deviceId === deviceId;
      if (!mine && !creator && !userId) throw new HttpError(403, 'Нямаш достъп до този случай.');
      if (!this.apply(inc, 'ems_on_scene', userId ?? 'bystander')) throw new HttpError(409, 'Невалиден преход.');
      this.releaseAll(inc);
      this.changed(inc.id);
      return { state: inc.state };
    }
    if (!mine) throw new HttpError(403, 'Нямаш активно назначение в този случай.');
    const next = nextAssignmentStatus(mine.role, mine.status, type);
    if (!next) throw new HttpError(409, 'Невалидна стъпка за ролята ти.');
    mine.status = next;
    mine.updatedAt = Date.now();
    this.log(inc, mine.responderId, type, { role: mine.role });
    if (type === 'on_scene') this.apply(inc, 'on_scene', mine.responderId);
    if (type === 'aed_on_scene') this.apply(inc, 'aed_on_scene', mine.responderId);
    this.changed(inc.id);
    return { assignment: mine, state: inc.state };
  }

  /** Dispatcher (or a volunteer on scene) marks the scene. 'unsafe' withdraws open offers and stops new waves. */
  setScene(inc: Incident, scene: SceneSafety, actor: string) {
    if (!isActive(inc.state) && inc.state !== 'DISPATCH_FAILED') throw new HttpError(409, 'Случаят е приключил.');
    inc.scene = scene;
    if (scene === 'unsafe') for (const o of this.s.offers) if (o.incidentId === inc.id && o.status === 'sent') o.status = 'withdrawn';
    this.log(inc, actor, 'scene', { scene });
    this.changed(inc.id);
  }

  /** A volunteer pulls out because it is dangerous. Not a decline: it never lowers their acceptance score. */
  withdrawUnsafe(userId: string, assignmentId: string) {
    const a = this.s.assignments.find((x) => x.id === assignmentId && x.responderId === userId && x.status !== 'released');
    if (!a) throw new HttpError(404, 'Няма активно назначение.');
    const inc = this.s.incidents.get(a.incidentId)!;
    a.status = 'released';
    a.unsafeWithdraw = true;
    a.updatedAt = Date.now();
    this.s.tracks.delete(a.id);
    this.log(inc, userId, 'unsafe_withdraw', { role: a.role });
    this.setScene(inc, 'unsafe', userId);
    return { ok: true };
  }

  pushLocation(userId: string, assignmentId: string, pos: LatLon) {
    const a = this.s.assignments.find((x) => x.id === assignmentId && x.responderId === userId && x.status !== 'released');
    if (!a) throw new HttpError(404, 'Няма активно назначение.');
    const r = this.s.responders.get(userId)!;
    r.pos = pos;
    r.posAt = Date.now();
    const t = this.s.tracks.get(a.id) ?? [];
    t.push({ at: Date.now(), pos });
    this.s.tracks.set(a.id, t);
    this.changed(a.incidentId);
  }

  private releaseAll(inc: Incident) {
    for (const a of this.incidentAssignments(inc.id)) {
      a.status = 'released';
      a.updatedAt = Date.now();
    }
    for (const o of this.s.offers) if (o.incidentId === inc.id && o.status === 'sent') o.status = 'withdrawn';
  }

  closeIncident(inc: Incident, actor: string, reason: string) {
    if (!this.apply(inc, reason === 'cancelled' ? 'cancel' : 'close', actor, { reason })) throw new HttpError(409, 'Случаят вече е затворен.');
    inc.closedReason = reason;
    const ids = this.s.assignments.filter((a) => a.incidentId === inc.id).map((a) => a.id);
    this.releaseAll(inc);
    for (const id of ids) this.s.tracks.delete(id); // precise tracks are deleted when the incident closes (BLUEPRINT §7)
    for (const a of this.s.assignments.filter((x) => x.incidentId === inc.id)) {
      const r = this.s.responders.get(a.responderId);
      if (r?.bot && r.home) r.pos = { ...r.home };
    }
    this.audit(actor, 'close_incident', inc.id);
    this.changed(inc.id);
  }

  // ---------- the clock ----------
  tick() {
    const now = Date.now();
    let dirty = false;
    for (const inc of this.s.incidents.values()) {
      if (!isActive(inc.state) && inc.state !== 'DISPATCH_FAILED' && inc.state !== 'EMS_ON_SCENE') continue;
      let touched = false;

      for (const o of this.s.offers) {
        if (o.incidentId !== inc.id || o.status !== 'sent') continue;
        if (now > o.expiresAt) {
          o.status = 'expired';
          touched = true;
        } else if (o.botAt && now >= o.botAt) {
          try {
            this.respondOffer(o.responderId, o.id, o.botAccepts ? 'accept' : 'decline');
          } catch {
            o.status = 'withdrawn';
          }
          touched = true;
        }
      }

      // Next wave, or fail, once the wave's offers are all answered/expired and its time is up.
      const waveOver = now - inc.waveStartedAt >= this.config().waveTimeoutS * 1000;
      if (isActive(inc.state) && waveOver && !this.targetsMet(inc) && inc.scene !== 'unsafe') {
        if (inc.wave + 1 < this.config().maxWaves) {
          inc.wave++;
          this.apply(inc, 'wave_timeout_next', 'dispatch', { wave: inc.wave });
          this.startWave(inc);
          touched = true;
        } else if (inc.state === 'DISPATCHING') {
          this.apply(inc, 'wave_timeout_failed', 'dispatch');
          touched = true;
        }
      }

      // Simulated ambulance and auto-close (drill environment has no real EMS).
      if (isActive(inc.state) && now - inc.createdAt >= (inc.emsEtaS * 1000) / SIM_SPEED) {
        if (this.apply(inc, 'ems_on_scene', 'ems-sim')) {
          this.releaseAll(inc);
          touched = true;
        }
      }
      if (now - inc.createdAt > 60 * 60_000) {
        this.closeIncident(inc, 'cron', 'auto');
        touched = true;
      }

      if (this.moveBots(inc, now)) touched = true;
      if (touched) {
        dirty = true;
        this.changed(inc.id);
      }
    }
    this.coarsenOld(now);
    if (now - this.lastReminderRun > 60_000) this.runReminders(now);
    return dirty;
  }

  /** Question 3: closed incidents keep a precise location only for RETAIN_PRECISE_DAYS. */
  private coarsenOld(now: number) {
    const keepMs = Number(process.env.RETAIN_PRECISE_MS ?? RETAIN_PRECISE_DAYS * 86_400_000);
    for (const inc of this.s.incidents.values()) {
      if (inc.coarsened || inc.state !== 'CLOSED') continue;
      const closedAt = [...inc.events].reverse().find((e) => e.type === 'state' && e.data?.state === 'CLOSED')?.at ?? inc.createdAt;
      if (now - closedAt < keepMs) continue;
      inc.pos = { lat: coarsen(inc.pos.lat), lon: coarsen(inc.pos.lon) };
      inc.deviceId = undefined;
      inc.coarsened = true;
    }
  }

  // ---------- organisations: maintenance reminders ----------
  private lastReminderRun = 0;

  /** Sends (into the simulated outbox) one mail per check per stage: 30, 7, 0 days before due, then weekly while overdue. */
  runReminders(now = Date.now()): number {
    this.lastReminderRun = now;
    const sent = new Set(this.s.outbox.map((m) => m.key));
    let n = 0;
    for (const eq of this.s.equipment) {
      const org = this.s.orgs.find((o) => o.id === eq.orgId);
      const site = this.s.sites.find((x) => x.id === eq.siteId);
      if (!org || !site) continue;
      for (const c of equipmentChecks(eq.kind, eq.dates, new Date(now))) {
        const stage = reminderStage(c.daysLeft);
        if (!stage) continue;
        const key = `${eq.id}:${c.key}:${c.due}:${stage}`;
        if (sent.has(key)) continue;
        const when = c.daysLeft! < 0 ? `просрочено с ${-c.daysLeft!} дни` : c.daysLeft === 0 ? 'днес' : `след ${c.daysLeft} дни`;
        for (const uid of org.ownerIds) {
          const to = this.s.users.get(uid)?.email;
          if (!to) continue;
          this.s.outbox.push({ id: this.s.id('mail'), at: now, to, key, equipmentId: eq.id, subject: `${c.label}: ${eq.model} (${site.name}) — ${when}`, body: `${site.name}, ${eq.locationHint ?? ''}. Срок: ${c.due}. Отбележете в ДефиКарта, когато е направено.` });
          n++;
        }
        sent.add(key);
      }
    }
    if (n) this.changed();
    return n;
  }

  private moveBots(inc: Incident, now: number): boolean {
    let moved = false;
    const speed = WALK_M_S * SIM_SPEED; // m/s
    for (const a of this.incidentAssignments(inc.id)) {
      const r = this.s.responders.get(a.responderId);
      if (!r?.bot || !r.pos) continue;
      const aed = a.aedId ? this.s.aeds.find((x) => x.id === a.aedId) : undefined;
      const target: LatLon = a.role === 'aed_runner' && a.status === 'en_route' && aed ? aed : inc.pos;
      if (a.pickupUntil && now < a.pickupUntil) continue;
      const d = distanceM(r.pos, target);
      if (d <= 12) {
        if (a.role === 'cpr' && a.status === 'en_route') this.reportEvent(r.userId, inc.id, 'on_scene');
        else if (a.role === 'aed_runner' && a.status === 'en_route') {
          if (!a.pickupUntil) a.pickupUntil = now + (this.config().pickupS * 1000) / SIM_SPEED;
          else this.reportEvent(r.userId, inc.id, 'aed_collected');
        } else if (a.role === 'aed_runner' && a.status === 'aed_collected') this.reportEvent(r.userId, inc.id, 'aed_on_scene');
        moved = true;
        continue;
      }
      const step = Math.min(d, speed); // one tick = 1 s
      const f = step / d;
      r.pos = { lat: r.pos.lat + (target.lat - r.pos.lat) * f, lon: r.pos.lon + (target.lon - r.pos.lon) * f };
      const t = this.s.tracks.get(a.id) ?? [];
      t.push({ at: now, pos: r.pos });
      this.s.tracks.set(a.id, t);
      moved = true;
    }
    return moved;
  }

  // ---------- views ----------
  /** Remaining seconds until the AED arrives at the patient (bots are scaled by SIM_SPEED), or null. */
  aedEtaS(inc: Incident): number | null {
    let best: number | null = null;
    for (const a of this.incidentAssignments(inc.id)) {
      if (a.role !== 'aed_runner') continue;
      if (a.status === 'aed_on_scene') return 0;
      const r = this.s.responders.get(a.responderId);
      if (!r?.pos) continue;
      const aed = this.s.aeds.find((x) => x.id === a.aedId);
      let s = a.status === 'en_route' && aed ? estimateWalkS(r.pos, aed) + this.config().pickupS + estimateWalkS(aed, inc.pos) : estimateWalkS(r.pos, inc.pos);
      if (r.bot) s /= SIM_SPEED;
      best = best === null ? s : Math.min(best, s);
    }
    return best === null ? null : Math.round(best);
  }

  publicIncident(inc: Incident) {
    const offers = this.s.offers.filter((o) => o.incidentId === inc.id);
    const asg = this.incidentAssignments(inc.id, true);
    return {
      id: inc.id,
      state: inc.state,
      drill: true,
      notified: offers.length,
      enRoute: asg.filter((a) => a.status !== 'released').length,
      aedEtaS: this.aedEtaS(inc),
      called112: inc.called112,
      scene: inc.scene,
      emsEtaS: Math.max(0, Math.round(inc.emsEtaS / SIM_SPEED - (Date.now() - inc.createdAt) / 1000)),
    };
  }

  report(inc: Incident) {
    const first = (type: string) => inc.events.find((e) => e.type === type)?.at;
    const t0 = inc.createdAt;
    const sec = (t?: number) => (t ? Math.round((t - t0) / 100) / 10 : null);
    const firstAccept = inc.events.find((e) => e.type === 'assignment')?.at;
    return {
      id: inc.id,
      source: inc.source,
      state: inc.state,
      createdAt: t0,
      simSpeed: SIM_SPEED,
      times: { firstAcceptS: sec(firstAccept), cprOnSceneS: sec(first('on_scene')), aedOnSceneS: sec(first('aed_on_scene')), emsOnSceneS: sec(inc.events.find((e) => e.type === 'state' && e.data?.event === 'ems_on_scene')?.at) },
      offers: this.s.offers.filter((o) => o.incidentId === inc.id).reduce<Record<string, number>>((m, o) => ({ ...m, [o.status]: (m[o.status] ?? 0) + 1 }), {}),
      timeline: inc.events.map((e) => ({ tS: Math.round((e.at - t0) / 100) / 10, actor: e.actor, type: e.type, data: e.data })),
    };
  }
}
