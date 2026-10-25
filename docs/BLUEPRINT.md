# ДефиКарта: system blueprint

How the whole system is built and how every part behaves. Read [IDEA.md](IDEA.md) first for the what and the why.

**Status (25 Oct 2026):** the bystander side works with no backend: map, 112 → CPR flow, nearest AED (`apps/web`, `apps/mobile`, `packages/core`). Everything below that needs a server is **designed but not built**.

Contents: [0 Principles](#0-design-principles) · [1 Overview](#1-system-overview) · [2 Roles](#2-roles-and-permissions) · [3 Flows](#3-user-flows) · [4 Data model](#4-data-model) · [5 State machines](#5-state-machines) · [6 Dispatch](#6-dispatch-algorithm) · [7 Location](#7-location-and-privacy) · [8 Notifications](#8-notifications) · [9 Walking times](#9-walking-times-and-routing) · [10 Coverage](#10-coverage-and-placement) · [11 AED data](#11-aed-data-lifecycle) · [12 API](#12-api-surface) · [13 Offline](#13-offline-and-degraded-behaviour) · [14 Security](#14-security) · [15 Flags](#15-feature-flags) · [16 Repo](#16-repository-layout) · [17 Environments](#17-environments-deploy-and-test-accounts) · [18 Testing](#18-testing) · [19 Observability](#19-observability) · [20 Build order](#20-build-order) · [21 Open decisions](#21-open-decisions)

---

## 0. Design principles

1. **112 first.** No code path can show anything before the 112 screen in the emergency flow.
2. **The bystander needs no server.** 112, CPR and the cached AED list work offline. The backend only *adds* responders.
3. **Domain logic lives in `packages/core`, as pure TypeScript.** Ranking, opening hours, dispatch selection, state-machine transitions, geohash and coverage are pure functions. The same code runs in the apps, in Phase 1 edge functions (Deno) and in Phase 2 Node services. This is what lets Phase 1 grow into Phase 2 without a rewrite.
4. **Never promise what we can't back up.** Unknown hours are not "open". An unverified AED is labelled as unverified. A drill is labelled „УЧЕНИЕ".
5. **Privacy by design.** No live tracking when idle, precise location only during an accepted incident, and no patient data at all.
6. **The database enforces the rules that must never break** (one runner per AED, valid transitions, row-level security), not only the application code.
7. **Every incident is replayable** from an append-only event log.

## 1. System overview

### Phase 1: Идейник MVP (now → 2 Dec 2026)

Hosted on free tiers. Two people can build it in five weeks.

```
 ┌─────────── apps/mobile (Expo) ───────────┐  ┌──── apps/web (Vite PWA) ────┐  ┌── apps/console (Vite) ──┐
 │ public: map · 112 · CPR · nearest AED    │  │ same public flow, offline   │  │ dispatcher · verifier   │
 │ responder: availability · alerts · nav   │  │ drill responder (jury QR)   │  │ AED owner · admin       │
 └───────────────┬──────────────────────────┘  └──────────────┬──────────────┘  └───────────┬─────────────┘
                 │ HTTPS (PostgREST + RPC) · Realtime (WebSocket) · Auth (JWT)            │
                 ▼                                                                         ▼
 ┌──────────────────────────────── Supabase (EU region) ──────────────────────────────────────────────┐
 │ Postgres 16 + PostGIS · Row-Level Security per role · Auth (email OTP / magic link) · Storage       │
 │ RPCs (security definer): create_incident, respond_offer, report_event, push_location, ...          │
 │ pg_cron: dispatch tick (wave timeouts), retention jobs, maintenance reminders, osm-sync            │
 │ Edge Functions (Deno, import packages/core): dispatch · notify · osm-sync · coverage                │
 │ Realtime: incident channels for the console and responders                                         │
 └───────────┬───────────────────────────────┬────────────────────────────────┬───────────────────────┘
             ▼                               ▼                                ▼
   Overpass API (read OSM)      Expo Push (→ FCM / APNs) · Web Push (VAPID)     OSM editing by hand
                                                                               (JOSM / iD, team accounts)
```

### Phase 2: НОИТ distributed system (Dec 2026 → May 2027)

The same database schema and the same `packages/core`. Dispatch, location and notifications move into containerized services because they need timers, fan-out and horizontal scaling.

```
  apps/mobile · apps/web · apps/console
          │ REST (OpenAPI 3.1)   ▲ WebSocket (live incident)   ▲ push / SMS
          ▼                      │                             │
  ┌──────────── gateway (Fastify) ────────────┐
  │ JWT check (Supabase Auth JWKS) · roles     │
  │ rate limits · Idempotency-Key · flags      │
  └──┬────────┬──────────┬───────────┬─────────┘
     ▼        ▼          ▼           ▼
  registry  people    incident    coverage/simulation
  (AEDs,    (respon-  (state       (heatmap, placement,
  submis-   ders,     machine,     Monte Carlo)
  sions)    certs)    audit log)
                         │ events
                         ▼
        ┌──────── NATS JetStream (event bus) ────────┐
        │ incident.created · offer.created · offer.answered · assignment.updated · incident.closed │
        └────┬───────────────────┬────────────────────┬──────────────────────────┘
             ▼                   ▼                    ▼
        dispatch worker      notify service       location service
        (waves, timers,      (Expo/FCM/APNs,      (Redis GEO, TTL keys,
        assignment)          Web Push, SMS)       precise only in incidents)
             │
             ▼
        routing: OSRM (foot profile, OSM Bulgaria extract)

  Postgres + PostGIS (one schema per service) · Redis (GEO, locks, rate limits)
  Unleash (feature flags) · OpenTelemetry → Prometheus + Grafana + Tempo/Loki
  Docker Compose on one VPS (k3s optional) · GitHub Actions CI/CD · GHCR images
```

**Why split exactly these services:** each one owns a different consistency or scaling need. The incident service is the single writer of incident state. Dispatch needs timers. Notify needs fan-out and retries. Location data is high-churn and ephemeral. Registry and people are plain CRUD. We don't split further; two students must be able to operate it.

**Migration path, Phase 1 → 2:** keep Supabase Auth (it is the OIDC/JWT issuer) and Postgres. Replace the RPCs one at a time with REST endpoints behind the gateway, keeping the RPC names as endpoint names. The apps switch per feature through a flag (`api_v2`).

## 2. Roles and permissions

A user can hold several roles (a teacher can be a responder and an AED owner). Roles are stored in `user_roles` and copied into the JWT as a custom claim, so RLS and the gateway read them without a lookup.

| Action | public | responder | AED owner | verifier | dispatcher | admin |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| See the map, CPR guide, nearest AED | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit an AED | ✅¹ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own AEDs (hours, location hint, maintenance) | | | ✅ own | | | ✅ |
| Approve/reject AED submissions | | | | ✅ | | ✅ |
| Approve/reject CPR certificates | | | | ✅ | | ✅ |
| Set own availability, receive offers | | ✅ verified | | | | |
| Create a bystander incident | ✅² | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create a drill / dispatcher incident, cancel, close | | | | | ✅ | ✅ |
| See live incident map (all responders' positions) | | | | | ✅ | ✅ |
| See own incident (patient location, own route) | | ✅ when offered | | | | |
| Feature flags, regions, coverage admin | | | | | | ✅ |

¹ With rate limits, and the submission is never public until approved. ² Only with the `public_alerts` flag on.

## 3. User flows

### 3.1 Bystander emergency (no account)
```
[Някой припадна] → [Обади се на 112] ──tel:112──▶ (phone call)
                        │ "Обадих се"
                        ▼
               [CPR: metronome + voice] ◀── works offline
                  │            │
                  │            └─ nearest reachable AED card ("Пратете някой", route)
                  │
                  └─ (flag public_alerts) [Извикай обучени хора наблизо]
                        → create_incident(source=bystander, lat/lon, idempotency key)
                        → banner: "Известени: 4 · Тръгнали: 1 · AED идва: ~3 мин"
```
- The bystander's precise location is used only for this incident.
- With no network, the "Извикай" button is hidden and the rest works.
- After 20 minutes, or when the bystander taps "Линейката дойде", the incident is reported `EMS_ON_SCENE`.

### 3.2 Responder lifecycle
1. **Sign up** (native app recommended, web for drills): email OTP → profile (name, phone, year of birth) → upload a CPR certificate photo.
2. **Verification:** a verifier sees the certificate in the console → approve with an expiry date (`verified_until`) or reject with a reason. Certificate photos are deleted 30 days after the decision.
3. **Scope:** `street` (18+ and verified) or `school:<site_id>` (any verified age, alerts only for that site's drills/incidents).
4. **Availability:** off · zones (up to 3 points with a radius ≤ 300 m and a weekly schedule) · "около мен" (the app reports a coarse geohash-6 cell on significant movement; expires after 30 min). Quiet hours default to 23:00–07:00 (opt-in to night alerts).
5. **Offer arrives** (push, full-screen on Android): "Сърдечен арест на ~250 м. Можеш ли да помогнеш?" with **„Тръгвам"** / **„Нося AED"** (if suggested) / **„Не мога"**. The offer expires after 30 s.
6. **Accepted:** the server confirms the role (it may change: "AED-то вече е поето, отиди директно"). The app shows the exact location, a route (the platform's maps app), the AED's location hint and a "112 обадено ли е?" reminder. It shares precise GPS every 5 s / 10 m.
7. **Progress:** „На място" · „Взех AED-то" · „AED на място" · „Линейката дойде".
8. **Close:** location sharing stops and the precise track is deleted. **Debrief** 2 h later: "Как си?" + support contacts + optional feedback.

### 3.3 Add an AED → OSM
```
anyone: photo + pin + hours + where inside + access ─▶ aed_submissions (pending)
verifier: compare photo/pin, call the owner if needed ─▶ approve → aeds (status=verified, source=local)
team (by hand, JOSM/iD): add node to OSM with tags ─▶ nightly osm-sync matches it → aeds.osm_id set, source=osm
```
OSM tags we write: `emergency=defibrillator`, `defibrillator:location:bg`, `opening_hours`, `access`, `indoor`, `level`, `phone`, `check_date`, `survey:date`. **No automated edits to OSM.** The OSM Automated Edits code of conduct needs community discussion first, so every edit is made by a person who checked it.

### 3.4 Dispatcher drill (and the НОИТ jury demo)
1. The dispatcher opens the console in the `drill` environment and selects the site ("Зала 1", a pin).
2. The judges scan a QR code → the web app → "Влез като тест-доброволец" → they become drill responders in a zone around the hall. Web Push if allowed; otherwise an in-page realtime alert with sound while the page is open.
3. The dispatcher clicks **„Стартирай учение"** → `create_incident(source=drill)` → the first wave → phones ring, labelled „УЧЕНИЕ".
4. The console shows a live map: offers sent / accepted / declined / expired, responders moving, the AED runner's route, and timers (time to first accept, to CPR, to AED).
5. Closing generates a **drill report** (timeline + times), stored in `docs/data/drills/`.

### 3.5 AED owner
Claim a device (verifier approves the claim) → edit hours, location hint and contact → set pad/battery expiry → get reminders 30 days before expiry and a "still there?" re-check every 6 months.

### 3.6 Admin
Regions (Stara Zagora first: bbox, ambulance ETA estimate, timezone), feature flags, the coverage heatmap and the placement recommender, user role management, retention-job status.

## 4. Data model

Postgres + PostGIS. All `geom` columns are `geography(Point, 4326)`. All tables have `created_at`/`updated_at`. Phase 2 moves each group into its own schema (`registry`, `people`, `incident`) without changing columns.

```sql
-- identity (Supabase auth.users holds email/phone)
profiles        (id uuid pk → auth.users, display_name, phone, birth_year, locale default 'bg')
user_roles      (user_id, role enum[public,responder,aed_owner,verifier,dispatcher,admin], region_id, pk(user_id, role, region_id))
regions         (id, name, bbox geography(Polygon), ambulance_eta_min int default 12, timezone default 'Europe/Sofia')
sites           (id, region_id, name, geom, kind enum[school,campus,venue])   -- for school-scoped responders and drills

-- registry
aeds            (id uuid pk, region_id, osm_type, osm_id, source enum[osm,local,seed],
                 status enum[verified,unverified,retired], name, geom, location_hint, opening_hours,
                 access, indoor bool, level text, photo_path, owner_id → profiles null,
                 owner_contact_private text, pads_expiry date, battery_expiry date,
                 verified_at timestamptz, verified_by, version int)
aed_submissions (id, submitted_by null, device_id, geom, payload jsonb, photo_path,
                 status enum[pending,approved,rejected,duplicate], reviewed_by, review_note, aed_id null)
aed_checks      (id, aed_id, checked_by, result enum[present,missing,moved,locked], note, at)

-- people
responders      (user_id pk, scope enum[street,school], site_id null, status enum[pending,verified,suspended],
                 verified_until date, quiet_from time, quiet_to time, night_opt_in bool,
                 accept_count int, offer_count int)          -- for the acceptance-probability estimate
certificates    (id, user_id, photo_path, issuer, issued_on, status enum[pending,approved,rejected], reviewed_by, decided_at)
responder_zones (id, user_id, label, geom, radius_m int check (radius_m <= 300), schedule jsonb)
push_tokens     (id, user_id, kind enum[expo,webpush], token text, last_seen_at)

-- incidents (the hot path)
incidents       (id uuid pk, region_id, source enum[bystander,drill,dispatcher,api], geom,
                 address_hint text, state enum (see §5.1), wave int, created_by null, device_id null,
                 idempotency_key text unique, ems_eta_min int, closed_reason text, version int)
offers          (id, incident_id, responder_id, wave int, suggested_role enum[cpr,aed_runner],
                 suggested_aed_id null, t_direct_s int, t_via_aed_s int null,
                 status enum[sent,accepted,declined,expired,withdrawn], sent_at, answered_at,
                 unique(incident_id, responder_id))
assignments     (id, incident_id, responder_id, role enum[cpr,aed_runner], aed_id null,
                 status enum[en_route,on_scene,aed_collected,aed_on_scene,released], updated_at)
incident_events (id bigserial, incident_id, at, actor, type, data jsonb)   -- append-only, no UPDATE/DELETE grants

-- ephemeral (Phase 1 tables with TTL jobs; Phase 2 moves these to Redis)
responder_presence (user_id pk, geohash6 text, geom geography, expires_at)       -- coarse, "около мен"
assignment_tracks  (assignment_id, at, geom)                                      -- precise, deleted on close

-- ops
feature_flags   (key, region_id null, enabled bool, rollout_pct int)
audit_log       (id, at, actor, action, subject, data)     -- every read of precise location, every role change
```

**Constraints that carry the safety rules:**
```sql
-- One AED runner per AED across all active incidents (an AED can't be "on the way" to two places).
create unique index one_runner_per_aed on assignments (aed_id)
  where role = 'aed_runner' and status in ('en_route', 'aed_collected');
-- A responder works one incident at a time.
create unique index one_active_assignment on assignments (responder_id)
  where status in ('en_route', 'on_scene', 'aed_collected', 'aed_on_scene');
-- State changes only through the transition function (§5); direct UPDATE of incidents.state is revoked.
```

**Spatial indexes:** GiST on `aeds.geom`, `responder_zones.geom`, `responder_presence.geom` and `incidents.geom`. Candidate search is `ST_DWithin(geom, :patient, :radius_m)`.

## 5. State machines

The transition tables live in `packages/core/src/incident.ts` (pure, property-tested). Postgres has a matching `transition_incident(id, event, expected_version)` function, which is the only way to change state. It checks the same table, bumps `version` (optimistic locking) and appends to `incident_events` in the same transaction.

### 5.1 Incident
```
           create
             │
             ▼
         DISPATCHING ──(≥1 offer accepted)──▶ RESPONDING ──(responder on scene)──▶ ON_SCENE
           │   ▲                                 │                                    │
 wave timeout│   │ next wave                     │                                    │ AED on scene
 & waves left└───┘                               │                                    ▼
           │                                     │                              AED_ON_SCENE
           │ max waves, nobody accepted          │                                    │
           ▼                                     │          EMS on scene (from any active state)
     DISPATCH_FAILED ───────────────────────────────────────────────────────▶ EMS_ON_SCENE
           │                                                                          │
           └──────────────▶ CLOSED ◀──── cancel (false alarm; dispatcher/creator) ────┘
                                         close (dispatcher, creator, or 60 min auto)
```

| From | Event | To | Who |
|---|---|---|---|
| — | `create` | DISPATCHING | bystander, dispatcher, drill, api |
| DISPATCHING | `wave_timeout` (waves left) | DISPATCHING (wave+1) | dispatch tick |
| DISPATCHING | `wave_timeout` (no waves left, no accepts) | DISPATCH_FAILED | dispatch tick |
| DISPATCHING | `offer_accepted` | RESPONDING | responder |
| RESPONDING | `on_scene` | ON_SCENE | responder |
| RESPONDING, ON_SCENE | `aed_on_scene` | AED_ON_SCENE | AED runner / bystander |
| any active, DISPATCH_FAILED | `ems_on_scene` | EMS_ON_SCENE | anyone on the incident |
| any | `cancel` | CLOSED (reason=cancelled) | dispatcher, creator |
| any not CLOSED | `close` / 60-min auto | CLOSED | dispatcher, creator, cron |

Dispatch keeps running in RESPONDING until the targets are met (§6). Late accepts after EMS_ON_SCENE are thanked and released.

### 5.2 Offer and assignment
```
offer:      sent ──accept──▶ accepted ──▶ (assignment created)
              ├──decline──▶ declined
              ├──30 s─────▶ expired
              └──targets met / incident closed──▶ withdrawn  ("Благодарим, вече има достатъчно хора")

assignment: en_route ──▶ on_scene                                   (CPR)
            en_route ──▶ aed_collected ──▶ aed_on_scene             (AED runner)
            any ──incident closed / responder cancels──▶ released
```
`accept` is **idempotent**: accepting twice returns the same assignment. If the suggested AED was claimed in the meantime, the unique index rejects the runner role and the server downgrades the accept to `cpr` (the client shows why).

## 6. Dispatch algorithm

Pure function in `packages/core/src/dispatch.ts`: `planWave(input) → offers[]`. The server calls it at incident creation and on every dispatch tick. It is deterministic for a given input, so it is unit- and property-tested without a database.

```
Inputs: patient P, wave w, region (ems_eta), candidates (eligible, not yet offered),
        AEDs near P (reachable: open or 24/7; 'unknown' allowed but ranked lower; not claimed),
        current assignments, walk(a, b) → seconds

Constants (feature-flag tunable):
  RADIUS_M     = [500, 1000, 1500]   per wave
  WAVE_TIMEOUT = 30 s, MAX_WAVES = 3
  TARGET_CPR   = 2, TARGET_AED = 1 (0 if an AED is already on scene)
  P_ACCEPT_DEFAULT = 0.3, MAX_OFFERS_PER_WAVE = 8
  PICKUP_S     = 60 (+60 if indoor or level ≠ 0)

eligible(r) = verified ∧ certificate not expired ∧ scope matches (street, or school site = incident site)
            ∧ inside availability (zone + schedule, or fresh presence cell) ∧ not in quiet hours (unless opted in)
            ∧ no active assignment ∧ distance(r, P) ≤ RADIUS_M[w]

for each candidate r:  t_direct(r) = walk(r, P)
for each r, AED a:     t_via(r, a) = walk(r, a) + PICKUP_S(a) + walk(a, P)

need_cpr = TARGET_CPR − accepted CPR;  need_aed = TARGET_AED − accepted runners

AED runner (if need_aed > 0):
  best AED arrival so far T_aed = min over accepted runners, else ∞
  pick (r, a) minimizing t_via(r, a) such that
       t_via(r, a) < ems_eta − 120 s          -- worth it only if it beats the ambulance with margin
   and t_via(r, a) < T_aed − 60 s             -- and clearly beats the AED already coming
  over-alert: offer runner roles to the best ceil(need_aed / p_accept) (r, a) pairs, distinct r

CPR (if need_cpr > 0):
  remaining candidates sorted by t_direct
  offer to the first ceil(need_cpr / p_accept(r)) of them

p_accept(r) = (accept_count + 1) / (offer_count + 1/P_ACCEPT_DEFAULT)   -- smoothed, starts at 0.3
cap total offers this wave at MAX_OFFERS_PER_WAVE
```
- **Greedy is enough** for Phase 1 (a few candidates per incident). Phase 2 can replace the runner/CPR split with an assignment solve (Hungarian algorithm over responders × {CPR, runner-via-AED-a}). It keeps the same function signature, and the tests compare the two.
- **Concurrency:** offers are optimistic. Correctness is enforced at **accept** time by the unique indexes (§4) and `select … for update` on the incident row. Two dispatch workers can never double-assign an AED because the database refuses it. Phase 2 also takes a Redis lock per incident for each wave, so that two workers don't plan the same wave (an efficiency concern, not a correctness one).
- **Dispatch tick:** Phase 1 runs `pg_cron` every 5 s (*verify sub-minute schedules on Supabase*), which calls `dispatch_tick()`. That function expires overdue offers, decides whether a new wave is needed, and calls the `dispatch` edge function through `pg_net`. Phase 2 uses a per-incident timer in the dispatch worker, driven by JetStream with ack deadlines. If the worker dies, another worker picks up the message (this is the chaos test).

## 7. Location and privacy

| Situation | What the server knows | Stored where | Lifetime |
|---|---|---|---|
| Responder idle, "zones" mode | The zone points they chose | `responder_zones` | Until they delete them |
| Responder idle, "около мен" mode | A geohash-6 cell (~1.2 × 0.6 km), updated on significant movement only | `responder_presence` / Redis key with TTL | 30 min |
| Responder offered | Distance band only ("~250 м") | — | — |
| Responder accepted | Precise GPS every 5 s / 10 m | `assignment_tracks` / Redis | **Deleted when the incident closes**; only the arrival time is kept |
| Bystander incident | The incident point | `incidents.geom` | Rounded to 100 m after 30 days |
| Dispatcher views a live position | — | `audit_log` entry per view | 1 year |

- **For candidate search in zone mode**, the responder's position is taken as the zone centre with an error of up to the zone radius; `t_direct` adds that radius.
- **No patient data**: no name, no health information, and incident free text is never required.
- GDPR: explicit consent at sign-up for each processing purpose, with export and delete in the profile. The data stays in an EU region.

## 8. Notifications

| Channel | Who | Notes |
|---|---|---|
| **Expo Push → FCM / APNs** | Responders on the native app (the main channel) | Android: a high-priority FCM message + a dedicated `alerts` notification channel with an alarm sound, full-screen intent. iOS: time-sensitive interruption level. (Critical Alerts need an Apple entitlement that is rarely granted. Don't plan on it.) |
| **Web Push (VAPID)** | Drill responders on the web, jury devices | iOS only for home-screen PWAs (16.4+) |
| **In-app realtime** | Anyone with the page/app open | Supabase Realtime / WebSocket; the fallback for the jury demo |
| **SMS** (Phase 2, flag `sms_fallback`) | Responders who didn't acknowledge the push within 10 s | Paid per SMS; drills only at first |

- **The push payload is minimal:** `{incident_id, offer_id, distance_band, drill}`. The exact location is fetched after the responder opens the offer, through an authenticated call. A leaked push therefore reveals nothing.
- **Fan-out target:** incident created → all first-wave pushes accepted by the provider, **p95 < 2 s**. This is measured (§19).
- Invalid tokens reported by the provider are deleted. Each responder gets one offer per incident (`unique(incident_id, responder_id)`).

## 9. Walking times and routing

| Phase | Method | Where |
|---|---|---|
| 1 (now) | Straight-line distance × 1.3 route factor ÷ 75 m/min (~4.5 km/h, carrying a device) | `packages/core/src/geo.ts` (already in use) |
| 1 | Turn-by-turn by handing off to the platform's maps app / OSM directions | `packages/core/src/links.ts` (already in use) |
| 2 | **OSRM** foot profile, self-hosted with the Geofabrik Bulgaria extract; `/table` gives the many-to-many times for responders × AEDs × patient in one call | `infra/osrm/`; results cached per 100 m grid cell for 24 h |

If OSRM is slow (> 300 ms) or down, the dispatcher falls back to the Phase 1 estimate. A slow router must never delay an alert.

## 10. Coverage and placement

- **Grid:** 100 m cells over the region bbox (Stara Zagora ≈ 15,000 cells). For each cell: walking time to the nearest *reachable* AED under a scenario: **сега**, **делник 10:00**, **нощ 03:00**, **само 24/7**.
- **Bands:** < 3 min · 3–5 · 5–8 · > 8 · none. Output is GeoJSON, rendered on the admin map and (flag `coverage_public`) on the public site.
- **Population weighting:** a 100 m population grid (WorldPop, CC BY 4.0) or Eurostat GEOSTAT 1 km. Headline KPI: **% of residents within a 5-min walk of a 24/7 AED**.
- **Placement recommender:** greedy maximal coverage. Repeatedly add the candidate site (public buildings from OSM: schools, pharmacies, municipal buildings, stops) that covers the most uncovered people within 5 min. Output: "the next 5 AEDs" with the gain from each.
- **Phase 2 Monte Carlo:** sample incidents ∝ population and time of day, sample responder availability and acceptance with `p_accept`, then run the real `planWave`. Output: distributions of time-to-CPR and time-to-AED, and the responder density needed per district.
- It runs as an edge function or the `simulation` service, on demand and nightly, and is cached. It never runs on the incident path.

## 11. AED data lifecycle

```
Overpass (OSM) ──nightly osm-sync──▶ aeds (source=osm, matched by osm_id; tags → columns)
seed.ts (known, unverified) ───────▶ aeds (source=seed) until the mapping walk confirms them
submissions ──verifier approves────▶ aeds (source=local, status=verified) ──team adds to OSM──▶ source=osm
aed_checks / owner edits ──────────▶ verified_at, status (missing → retired after a second check)
```
- **The apps read from our API** once it exists (one request; includes verified local records not yet in OSM). They fall back to Overpass, then to the local cache. This keeps today's offline behaviour (`useAeds`: seed → cache → fresh).
- **Merge rule** (already in `mergeAeds`): a record within 40 m of an OSM record is treated as the same device, and OSM wins.
- **Private fields** (owner contact, expiry dates) never leave the database for the public API.

## 12. API surface

### Phase 1 (Supabase)
Reads go through PostgREST, protected by RLS. **Every state change goes through an RPC** (security definer, validates input, writes `incident_events`).

| RPC / function | Caller | Does |
|---|---|---|
| `nearest_aeds(lat, lon, limit)` | public | Ranked, with open-state computed for "now" |
| `submit_aed(payload, photo_path)` | public / users | Rate-limited insert into `aed_submissions` |
| `review_submission(id, decision, note)` | verifier | Approve → upsert `aeds` |
| `review_certificate(id, decision, verified_until)` | verifier | Responder → verified |
| `set_availability(mode, zones?, presence?)` | responder | Updates zones/presence |
| `create_incident(lat, lon, source, idempotency_key)` | public (flag) / dispatcher | Creates the incident, plans wave 1 |
| `respond_offer(offer_id, answer, role?)` | responder | Accept/decline; returns the assignment and the exact location |
| `report_event(incident_id, type)` | assignment holder / creator | on_scene, aed_collected, aed_on_scene, ems_on_scene |
| `push_location(assignment_id, lat, lon)` | assignment holder | Precise track while active |
| `cancel_incident` / `close_incident` | dispatcher / creator | Withdraws open offers, releases assignments, deletes tracks |
| edge `dispatch` | pg_net (from `dispatch_tick`) | `planWave` → insert offers → call `notify` |
| edge `notify` | dispatch | Expo + Web Push fan-out, token cleanup |
| edge `osm-sync` | pg_cron nightly | Overpass → upsert `aeds` |
| edge `coverage` | admin / nightly | Grid → GeoJSON in Storage |

### Phase 2 (REST, OpenAPI 3.1 in `docs/openapi.yaml`)
```
GET    /v1/aeds?bbox=&open_at=            GET  /v1/aeds/nearest?lat=&lon=     GET /v1/aeds/{id}
POST   /v1/aed-submissions                PATCH /v1/aed-submissions/{id}       POST /v1/aeds/{id}/checks
PUT    /v1/me/responder                   PUT  /v1/me/availability             POST /v1/me/certificates
PATCH  /v1/certificates/{id}              PUT  /v1/me/push-tokens/{kind}
POST   /v1/incidents          (Idempotency-Key header required)
GET    /v1/incidents/{id}                 POST /v1/incidents/{id}/events       POST /v1/incidents/{id}/cancel
POST   /v1/offers/{id}/accept             POST /v1/offers/{id}/decline
PUT    /v1/assignments/{id}/location      GET  /v1/coverage?scenario=
GET    /v1/admin/flags  PUT /v1/admin/flags/{key}      GET /v1/admin/regions
GET    /healthz  /readyz  /metrics
WS     /v1/stream?incident={id}           -- server → client: offer/assignment/state events
```
Errors use RFC 9457 `application/problem+json`. Typed clients are generated from the spec into `packages/api-client`.

### Realtime channels
- `incident:{id}`: state changes, offer counters, and (dispatcher only) responder positions.
- `responder:{user_id}`: new offers, withdrawals and role changes.
- Phase 1 uses Supabase Realtime with RLS-authorized channels. Phase 2 uses the gateway's WebSocket, fed from NATS.

## 13. Offline and degraded behaviour

| Failure | What still works | What the user sees |
|---|---|---|
| No network (bystander) | 112, CPR guide (precached), cached AED list + distances, cached map tiles | "Няма връзка — показваме запазените данни." The "Извикай хора" button is hidden |
| No location permission | 112, CPR, the list of all AEDs | "Няма достъп до местоположение" (already implemented) |
| Backend down | Everything a bystander needs | Responder app: "Известията временно не работят" |
| Push provider slow / down | Realtime in-app alerts; SMS (Phase 2) | — |
| Router (OSRM) down | Dispatch with straight-line estimates | — |
| Dispatch worker crash (Phase 2) | Another worker takes over the incident from JetStream | Delay ≤ one tick |
| No responders accept | → DISPATCH_FAILED, the dispatcher is notified | Bystander: "Няма свободни доброволци наблизо. Продължавай масажа." |

No device TTS voice for Bulgarian: ship pre-recorded MP3 prompts (our own recordings, so no license issues), and fall back to on-screen text.

## 14. Security

- **Auth:** Supabase Auth, email OTP/magic link (no passwords to leak), short-lived JWTs (1 h) with refresh rotation, and roles in a custom claim. Dispatcher/verifier/admin accounts need TOTP 2FA.
- **Row-Level Security on every table**, deny by default. Examples: a responder can read only their own offers and assignments, and an incident's precise location only through an accepted assignment; `aeds.owner_contact_private` is readable only by the owner, verifiers and admins; `incident_events` has no UPDATE/DELETE grants for anyone. RLS is tested with pgTAP (§18).
- **Input validation:** zod schemas in `packages/core` shared by clients, edge functions and services. Coordinates are checked to be inside the region bbox.
- **Abuse:** rate limits per device id + IP (submissions 5/h; bystander incidents 1/10 min). Bystander incidents are shown to responders as „непотвърден сигнал". Dispatchers can cancel and block a device. Uploads are images only, ≤ 5 MB, with EXIF stripped (it contains GPS and device data).
- **Secrets:** never in git. Supabase/GitHub encrypted secrets; VAPID and FCM/APNs keys only in the server environment.
- **Supply chain:** `npm audit` + Dependabot, CodeQL, pinned GitHub Actions; OWASP ZAP baseline against the drill environment in CI (Phase 2).
- **Audit:** every role change, verification decision, precise-location view, flag change and cancel goes to `audit_log`.

**Retention jobs** (pg_cron, daily):

| Data | Kept for |
|---|---|
| `assignment_tracks` | Until the incident closes (deleted in the same transaction as the close) |
| `responder_presence` | 30 min TTL |
| Incident location precision | Rounded to 100 m after 30 days |
| Certificate photos | 30 days after the decision |
| Push tokens | Until logout or invalidation |
| `audit_log` | 1 year |

## 15. Feature flags

Per region, admin-editable. Phase 1: the `feature_flags` table, read by clients at start-up. Phase 2: Unleash.

| Flag | Default (pilot) | Controls |
|---|---|---|
| `public_alerts` | **off** | The bystander "Извикай хора" button |
| `street_alerts` | off | Alerts outside school sites (needs 18+ verified responders and partner sign-off) |
| `aed_runner_role` | on | Two-role dispatch |
| `sms_fallback` | off | SMS after an unacknowledged push |
| `osrm_routing` | off | Real walking times instead of estimates |
| `coverage_public` | off | The heatmap on the public site |
| `api_v2` | off | Apps call the Phase 2 REST API instead of the RPCs |
| `dispatch.*` | see §6 | Radii, timeouts, targets |

## 16. Repository layout

Target layout. Existing parts are marked ✅.

```
apps/
  mobile/        ✅ Expo: public flow; + responder mode (availability, offers, navigation)
  web/           ✅ Vite PWA: public flow; + drill responder page (jury QR), + add-AED form
  console/          Vite + React: dispatcher (live map), verifier queues, AED owner, admin
packages/
  core/          ✅ pure logic: types, geo, hours, rank, overpass, cpr, links
                    + incident.ts (state machine), dispatch.ts (planWave), geohash.ts,
                    + coverage.ts, schemas.ts (zod)
  api-client/       Phase 1: generated Supabase types · Phase 2: generated from OpenAPI
supabase/
  migrations/       SQL: schema, RLS, functions, cron jobs
  functions/        dispatch/ notify/ osm-sync/ coverage/   (Deno, import packages/core)
  tests/            pgTAP: RLS, transitions, constraints
  seed.sql          regions, sites, test accounts for the drill environment
services/           Phase 2: gateway/ registry/ people/ incident/ dispatch/ notify/ location/ simulation/
infra/
  docker-compose.yml  osrm/  observability/ (Prometheus, Grafana, Tempo, Loki)  k6/  chaos/
docs/
  IDEA.md  BLUEPRINT.md  openapi.yaml  manual/ (user manual, BG)
  data/ mapping/ survey/ drills/          -- the proof: raw measurements, kept in git
.github/workflows/  ci.yml (typecheck, test, build, pgTAP) · deploy.yml · security.yml
```

## 17. Environments, deploy and test accounts

| Env | Purpose | Data |
|---|---|---|
| `local` | Development: `supabase start` (Phase 1) / `docker compose up` (Phase 2) | Seeded fake data |
| `drill` | **Public demo for juries**, always labelled „УЧЕНИЕ"; test accounts for all 6 roles; simulated responder bots | Real AED data, fake people |
| `prod` | The real pilot in Stara Zagora | Real |

- **CI** (every push and PR): typecheck → unit/property tests → pgTAP → build web/console → (Phase 2) build images, integration tests with Testcontainers, contract tests.
- **CD:** `main` → `drill` automatically; tags `v*` → `prod` after a manual approval. Web/console on a static host; the mobile app through EAS (internal channel for drills).
- **Test accounts** (НОИТ disqualifies a project without them): `public` (no login), `responder@`, `owner@`, `verifier@`, `dispatcher@`, `admin@`, all on the drill domain. They are created by `seed.sql`, the credentials are published in the user manual for the jury, and **they exist only in `drill`**.
- **Responder bots** (drill only): simulated responders that move along OSRM routes and accept with probability `p_accept`. They make a drill look real with 3 people in the room, and the k6 load test reuses them.
- **Uptime window:** НОИТ requires the system to be online from ≥ 1 week before the regional round to ≥ 1 month after the national round (≈ late Feb → June 2027). Supabase free projects pause when inactive (*check the current policy*), so `drill` gets a keep-alive check or moves to the Phase 2 VPS before February.

## 18. Testing

| Level | What | Tool | Gate |
|---|---|---|---|
| Unit | core: geo, hours, rank, overpass ✅ (14 tests); + dispatch, incident, coverage | Vitest | CI |
| Property | State machine: no transition out of CLOSED, versions strictly increase, a replay of events gives the same state; dispatch: no responder offered twice, offers ≤ cap, a runner only if it beats the EMS ETA | fast-check | CI |
| Database | RLS per role (each test account can and can't do exactly what §2 says), unique indexes, `transition_incident` | pgTAP | CI |
| Integration | Services + Postgres + Redis + NATS | Testcontainers | CI (Phase 2) |
| Contract | Gateway responses match `openapi.yaml`; clients match the spec | Schemathesis / openapi validator | CI (Phase 2) |
| E2E | Console flows, web emergency flow, drill flow | Playwright; Maestro for the Expo app | CI (web), nightly (mobile) |
| Load | 10,000 simulated responders, 50 concurrent incidents: **alert fan-out p95 < 2 s** | k6 + responder bots | Before each defense |
| Chaos | Kill the dispatch worker / a gateway replica / Redis mid-incident → the incident still completes | Scripted `docker kill` in `infra/chaos/` | Before each defense |
| Security | ZAP baseline, npm audit, CodeQL | GitHub Actions | CI (weekly for ZAP) |
| Field | ≥ 3 drills with vs without the app on campus, with a mannequin | Stopwatch + drill report | Results in `docs/data/drills/` |

## 19. Observability

- **Metrics:** `dispatch_fanout_seconds` (incident created → provider accepted, histogram), `time_to_first_accept_seconds`, `offers_total{status}`, `incidents_total{source,final_state}`, `dispatch_failed_total`, `push_errors_total{provider}`, `osrm_latency_seconds`.
- **SLOs:** fan-out p95 < 2 s; incident API availability 99.9% during drill windows; zero lost incidents under the chaos test.
- **Tracing:** one OpenTelemetry trace per incident, spanning gateway → incident → bus → dispatch → notify. The defense shows a real trace.
- **Logs:** structured JSON; precise coordinates are never logged (geohash-6 only).
- **Dashboards:** Grafana "Live incidents", "Dispatch health", "Push delivery". Alerting on `dispatch_failed_total` and push error rate.
- Phase 1 equivalent: rows in `incident_events` with timestamps, and a SQL view in the console that computes the same numbers.

## 20. Build order

Each milestone ends with something demoable and tested. Dates line up with [IDEA.md §9](IDEA.md#9-timeline).

| # | Dates | Build | Done when |
|---|---|---|---|
| M0 | 25 Oct | This blueprint | ✅ |
| M1 | 26 Oct – 1 Nov | Supabase project (EU); migrations: regions, profiles, roles, aeds, submissions; RLS; `osm-sync`; `nearest_aeds`; apps read the API with the current fallbacks; map filters (open now, 24/7); location hint on the card; CI with pgTAP | Public apps run on the API; RLS tests green |
| M2 | 2 – 8 Nov | „Добави AED" (web + mobile) with photo upload + EXIF strip; `apps/console` with the verifier queue; OSM export list. **Mapping weekend 7–9 Nov** | Every AED found is in the DB, and the verified ones are in OSM |
| M3 | 9 – 15 Nov | Responder sign-up, certificates, verification, zones/presence, push tokens (Expo + Web Push); `packages/core` incident + dispatch with property tests | A verified test responder receives a test push |
| M4 | 16 – 22 Nov | `create_incident`, `dispatch_tick`, offers, accept/decline, assignments, realtime; console live map + „Стартирай учение"; drill responder web page (QR) | **First school drill** with a drill report |
| M5 | 23 – 29 Nov | Coverage grid + heatmap + "next 5 AEDs"; drills ×3; survey analysis in `docs/data/` | The numbers for the video exist |
| M6 | 30 Nov – 2 Dec | Video + presentation | **Submitted by 2 Dec 14:00** |
| M7 | ≤ mid-Dec | НОИТ registration; OpenAPI spec written; school committee defense with a live dispatch | Registered |
| M8 | Dec – Jan | Phase 2: gateway + incident + dispatch + notify + location services, NATS, Redis GEO, OSRM, Unleash, OTel; `api_v2` flag | Apps run fully on `api_v2` in `drill` |
| M9 | Feb | k6 + chaos + ZAP; responder bots; SMS fallback; test accounts; user manual (BG); Appendix 1 documentation PDF | p95 < 2 s and the chaos test pass in CI |
| M10 | Mar – Apr | Monte Carlo simulator; more drills; partner letters | Regional defense done, national prep |

## 21. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | Supabase Cloud vs self-hosted for Phase 1 | Cloud (Frankfurt) for speed; self-host on the Phase 2 VPS by February for the uptime window |
| 2 | Responders on the web too, or native only? | Native for real alerts (reliable push); web only for drills and the jury |
| 3 | Partner for CPR review + certificate verification | БЧК Стара Загора first, „3 минути" second. **Contact them this week**: M3 depends on a verifier |
| 4 | `public_alerts` in the pilot | Off until the partner agrees; drills and the dispatcher console only |
| 5 | How far to split services in Phase 2 | The 8 in §1. Already a lot for two people to operate; don't split further |
| 6 | Who records the Bulgarian voice prompts | A team member (own recordings, no license issues); the instructor reviews the script first |
| 7 | One project for both competitions | Yes. Confirm in the 2026–27 НОИТ regulation that an Идейник entry doesn't count as "previously presented" (it is not a НОИТ national round) |
