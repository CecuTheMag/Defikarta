# ДефиКарта

Най-близкият дефибрилатор (AED) и указания за сърдечен масаж — Стара Загора.
Find the nearest AED, call 112 and get guided through hands-only CPR.

## The plan

- [docs/IDEA.md](docs/IDEA.md): the idea, merging ДефиКарта (Идейник 2026) and СърцеНаблизо (НОИТ 2026–27) into one project: problem, users, product, KPIs, budget, timeline, registration texts
- [docs/BLUEPRINT.md](docs/BLUEPRINT.md): how the whole system works: architecture (Phase 1 Supabase → Phase 2 distributed services), data model, incident state machine, dispatch algorithm, privacy, API, security, testing, build order

## Structure

```
apps/mobile     Native iOS + Android app (Expo / React Native, Expo Router)
apps/web        Website + installable PWA (Vite, React, Leaflet)
packages/core   Shared logic: AED data, OSM/Overpass import, distance,
                "open now" (opening_hours), ranking, CPR timing and texts
```

Both apps import `@defikarta/core`, so the ranking rules and CPR content are identical everywhere.

## Run

```bash
npm install          # once, from the repo root
npm run web          # website at http://127.0.0.1:5180
npm run mobile       # Expo dev server: scan the QR with Expo Go, or press i / a
npm test             # core unit tests
```

Store builds go through EAS (no Mac needed for the iOS build):

```bash
cd apps/mobile && npx eas-cli@latest build --platform all
```

Android store builds need a Google Maps key in `GOOGLE_MAPS_ANDROID_KEY` (Expo Go works without one).

## Data

- **OpenStreetMap** (`emergency=defibrillator`) is the source of truth. As of 24 Oct 2026 Stara Zagora has **0** AEDs in OSM, and all of Bulgaria has 15.
- `packages/core/src/seed.ts` holds devices found in public sources (two schools) until they are verified and added to OSM.
- Missing or unparseable `opening_hours` show as "Часове неизвестни", never as open.

## Safety

- 112 is always the first screen of the emergency flow.
- CPR texts follow ERC 2021 hands-only CPR and **must be reviewed by a certified instructor (БЧК / „3 минути") before public release.**

## Next

Full milestone list with dates: [BLUEPRINT.md §20](docs/BLUEPRINT.md#20-build-order).

- [ ] M1: Supabase backend (schema, RLS, AED API, OSM sync), map filters, location hint
- [ ] M2: "Add an AED" form + moderation console; mapping walk 7–9 Nov → every AED into OSM
- [ ] M3: Responder sign-up, certificate verification, push
- [ ] M4: Incidents, dispatch engine, dispatcher console, first school drill
- [ ] M5: Coverage heatmap, drills ×3; M6: video due 2 Dec
- [ ] Pre-recorded Bulgarian voice (device TTS may lack bg-BG); app icons and splash
