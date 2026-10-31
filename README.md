# ДефиКарта

Най-близкият дефибрилатор (AED) и указания за сърдечен масаж — Стара Загора.
Find the nearest AED, call 112 and get guided through hands-only CPR.

## The plan

- [docs/IDEA.md](docs/IDEA.md): the idea, merging ДефиКарта (Идейник 2026) and СърцеНаблизо (НОИТ 2026–27) into one project: problem, users, product, KPIs, budget, timeline, registration texts
- [docs/BLUEPRINT.md](docs/BLUEPRINT.md): how the whole system works: architecture (Phase 1 Supabase → Phase 2 distributed services), data model, incident state machine, dispatch algorithm, privacy, API, security, testing, build order

## Structure

```
apps/mobile     Native iOS + Android app (Expo / React Native, Expo Router)
apps/web        Website + installable PWA (Vite, React, Leaflet): public flow, add-AED,
                responder app, dispatcher console, coverage map
apps/server    Local drill backend (Node, no database or account needed): the BLUEPRINT
                RPCs, dispatch clock, realtime (SSE), simulated responders
packages/core   Shared logic: AED data, OSM/Overpass import, distance,
                "open now" (opening_hours), ranking, CPR timing and texts,
                + incident state machine, dispatch planner, coverage grid
```

The apps, the server and the tests import `@defikarta/core`, so ranking, dispatch and CPR rules are identical everywhere.

## Run

```bash
npm install          # once, from the repo root
npm run dev          # website (http://127.0.0.1:5180) + drill backend (:8791) together
npm run web          # website only: the public flow still works without the backend
npm run mobile       # Expo dev server: scan the QR with Expo Go, or press i / a
npm test             # core unit tests
```

Store builds go through EAS (no Mac needed for the iOS build):

```bash
cd apps/mobile && npx eas-cli@latest build --platform all
```

Android store builds need a Google Maps key in `GOOGLE_MAPS_ANDROID_KEY` (Expo Go works without one).

## Try the whole idea (drill environment)

`npm run dev`, open http://127.0.0.1:5180. Every screen carries a yellow „УЧЕНИЕ“ strip: this environment has 18 simulated responders and 8 **demo** AEDs (labelled „ДЕМО“), never real data.

1. **Dispatcher**: `#/login` → Диспечер → Конзола → tap the map → „Стартирай учение“. Watch offers go out in waves, responders accept, one runs for the AED, and read the drill report.
2. **Responder**: log in as Доброволец in another tab and finish „Готовност“ (terms, location consent, the 5-question knowledge check), set a position, „Достъпен съм“, then start a drill nearby. Accept „Нося AED“ and use „Симулирай придвижване“. „⚠ Опасно е — оттеглям се“ pulls out without counting as a decline.
3. **Bystander**: „Някой припадна“ → 112 → CPR guide → „Безопасно ли е?“ → „Извикай обучени хора наблизо“ (flag `public_alerts`). „Не“ sends nobody.
4. **Add an AED → verify**: „Добави AED“, then Верификатор → Конзола → Проверка.
5. **Coverage**: Покритие shows the walking-time heatmap for now / weekday / night / 24/7-only.
6. **Organisation** (the paid side): log in as Отговорник безопасност → Организация. A demo employer with 3 sites and 10 AEDs, extinguishers and first-aid kits: what is due, reminders (simulated e-mails), the draft-ordinance checklist, a CSV report. Listed AEDs show „✓ поддръжката се следи“ or „⚠ просрочена“ on the public map, and one with an expired battery or pads is never offered to a runner.

Why each piece exists (business model, the law, firstaid.bg, the mentor's five volunteer questions): [docs/SUNDAY.md](docs/SUNDAY.md).

Test accounts (drill only): `responder@`, `dispatcher@`, `verifier@`, `owner@`, `admin@` + `drill.defikarta.bg`, no password. The simulated responders move ×6 faster than real life (`SIM_SPEED`).

**Not built yet** (see [BLUEPRINT](docs/BLUEPRINT.md)): Supabase/Postgres + RLS (the server is in-memory and resets on restart), push notifications, responder zones, photo upload, real e-mail for reminders, per-organisation maintenance intervals, population-weighted coverage, the native app's responder mode, OSRM walking times, SMS fallback.

## Data

- **OpenStreetMap** (`emergency=defibrillator`) is the source of truth. As of 24 Oct 2026 Stara Zagora has **0** AEDs in OSM, and all of Bulgaria has 15.
- `packages/core/src/seed.ts` holds devices found in public sources (two schools) until they are verified and added to OSM.
- Missing or unparseable `opening_hours` show as "Часове неизвестни", never as open.

## Safety

- 112 is always the first screen of the emergency flow.
- CPR texts follow ERC 2021 hands-only CPR and **must be reviewed by a certified instructor (БЧК / „Първите три минути“) before public release.**
- Live (non-drill) volunteer alerts stay off until the five questions in [docs/SUNDAY.md §5](docs/SUNDAY.md#5-доброволците-петте-въпроса) have signed-off answers. The volunteer terms in `packages/core/src/safety.ts` are a draft for legal review.

## Next

Full milestone list with dates: [BLUEPRINT.md §20](docs/BLUEPRINT.md#20-build-order).

- [ ] M1: Supabase backend (schema, RLS, AED API, OSM sync), map filters, location hint
- [ ] M2: "Add an AED" form + moderation console; mapping walk 7–9 Nov → every AED into OSM
- [ ] M3: Responder sign-up, certificate verification, push
- [ ] M4: Incidents, dispatch engine, dispatcher console, first school drill
- [ ] M5: Coverage heatmap, drills ×3; M6: video due 2 Dec
- [ ] Pre-recorded Bulgarian voice (device TTS may lack bg-BG); app icons and splash
