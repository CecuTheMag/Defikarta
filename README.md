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

A local Android APK (no EAS account; needs the Android SDK and JDK 17):

```bash
cd apps/mobile && npx expo prebuild --platform android
cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
adb reverse tcp:8791 tcp:8791   # the app reaches the drill server over USB at http://localhost:8791
```

The map is OpenStreetMap drawn by Leaflet inside the app, so no Google Maps key is needed. On Wi-Fi, set the computer's address in Вход → Сървър.

## Try the whole idea (drill environment)

`npm run dev`, open http://127.0.0.1:5180. Every screen carries a yellow „УЧЕНИЕ“ strip: this environment has 18 simulated responders. The AEDs on its map are the real ones listed under [AED data](#aed-data-where-every-point-comes-from); there are no made-up devices.

1. **Dispatcher**: `#/login` → Диспечер → Конзола → tap the map → „Стартирай учение“. Watch offers go out in waves, responders accept, one runs for the AED, and read the drill report.
2. **Responder**: log in as Доброволец in another tab and finish „Готовност“ (terms, location consent, the 5-question knowledge check), set a position, „Достъпен съм“, then start a drill nearby. Accept „Нося AED“ and use „Симулирай придвижване“. „⚠ Опасно е — оттеглям се“ pulls out without counting as a decline.
3. **Bystander**: „Някой припадна“ → 112 → CPR guide → „Безопасно ли е?“ → „Извикай обучени хора наблизо“ (flag `public_alerts`). „Не“ sends nobody.
4. **Add an AED → verify**: „Добави AED“, then Верификатор → Конзола → Проверка.
5. **Coverage**: Покритие shows the walking-time heatmap for now / weekday / night / 24/7-only.
6. **Organisation** (the paid side): log in as Отговорник безопасност → Организация. A demo employer with 3 sites and 10 AEDs, extinguishers and first-aid kits: what is due, reminders (simulated e-mails), the draft-ordinance checklist, a CSV report. The demo employer's AEDs stay in its registry; press „Покажи на картата“ on one to list it during a drill. A listed AED shows „✓ поддръжката се следи“ or „⚠ просрочена“ on the map, and one with an expired battery or pads is never offered to a runner.

Why each piece exists (business model, the law, firstaid.bg, the mentor's five volunteer questions): [docs/SUNDAY.md](docs/SUNDAY.md).

Test accounts (drill only): `responder@`, `dispatcher@`, `verifier@`, `owner@`, `admin@` + `drill.defikarta.bg`, no password. The simulated responders move ×6 faster than real life (`SIM_SPEED`).

**Not built yet** (see [BLUEPRINT](docs/BLUEPRINT.md)): Supabase/Postgres + RLS (the server is in-memory and resets on restart), push notifications, responder zones, photo upload, real e-mail for reminders, per-organisation maintenance intervals, population-weighted coverage, the native app's responder mode, OSRM walking times, SMS fallback.

## AED data: where every point comes from

The map shows **only real devices**. The 8 made-up „ДЕМО“ AEDs and the demo employer's auto-listed devices were removed on 2 Nov 2026. Every point is either in OpenStreetMap or in [`packages/core/src/seed.ts`](packages/core/src/seed.ts), and each seed entry carries a note saying where it came from.

**To be on the map**, a device must be confirmed by a named public source, be in Stara Zagora province, have a known building, and be reachable by the public. Nobody from the team has physically checked any of these yet; the mapping walk will, and then they move into OSM.

### On the map now (6, as of 2 Nov 2026)

| # | Device | Where | Access | Source |
|---|---|---|---|---|
| 1 | ГПЧЕ „Ромен Ролан“ | Стара Загора, school building | school hours, not checked | donated 14 May 2026 by „Спасителен клуб за бъдеще“ („Капачки за бъдеще“): [Община Стара Загора](https://www.starazagora.bg/bg/novini/gpche-romen-rolan-veche-razpolaga-s-defibrilator-daren-po-initsiativata-kapachki-za-badeshte), [Cross.bg](https://www.cross.bg/gimnaziyata-defibrilator-zagora-1797014.html), [dolap.bg](https://dolap.bg/2026/05/14/%D0%B3%D0%BF%D1%87%D0%B5-%D1%80%D0%BE%D0%BC%D0%B5%D0%BD-%D1%80%D0%BE%D0%BB%D0%B0%D0%BD-%D0%B2%D0%B5%D1%87%D0%B5-%D1%80%D0%B0%D0%B7%D0%BF%D0%BE%D0%BB%D0%B0%D0%B3%D0%B0-%D1%81-%D0%B4/) |
| 2 | ПГОХ „Райна Княгиня“ | Стара Загора, school building | school hours, not checked | donated the same day by the same volunteers: [Община Стара Загора](https://www.starazagora.bg/bg/novini/gpche-romen-rolan-veche-razpolaga-s-defibrilator-daren-po-initsiativata-kapachki-za-badeshte), [Focus](https://www.focus-news.net/novini/regioni/Dobrovolci-ot-Spasitelen-klub-za-budeshte-dariha-defibrilator-v-Stara-Zagora-2966210) |
| 3 | ПГ „Иван Хаджиенов“ | Казанлък, school building | school hours, not checked | donated 24 Jun 2026, same campaign: [PressTV Казанлък](https://presstv.bg/regional/pg-ivan-hadzhienov-veche-razpolaga-s-defibrilator-daren-po-inicziativata-kapachki-za-badesthe/) |
| 4 | Decathlon | Стара Загора, бул. „Никола Петков“ 52 | store hours, open to anyone | [firstaid.bg AED map](https://map.firstaid.bg/): installed and checked 20 Aug 2023, signed, trained staff |
| 5 | Metro | Стара Загора, ул. „Хрищян войвода“ 30 | store hours, only with a staff escort | [firstaid.bg AED map](https://map.firstaid.bg/): installed and checked 26 Jan 2024 |
| 6 | OMV Оризово | АМ „Тракия“ km 165, towards Burgas | 24/7, open to anyone | [firstaid.bg AED map](https://map.firstaid.bg/): installed 10 Jan 2023, checked 1 Dec 2023; part of [OMV's 20 stations with an AED](https://auto-press.net/a:OMV-%D0%91%D1%8A%D0%BB%D0%B3%D0%B0%D1%80%D0%B8%D1%8F-%D0%B8%D0%BD%D1%81%D1%82%D0%B0%D0%BB%D0%B8%D1%80%D0%B0-%D0%B0%D0%B2%D1%82%D0%BE%D0%BC%D0%B0%D1%82%D0%B8%D1%87%D0%BD%D0%B8-%D0%B4%D0%B5%D1%84%D0%B8%D0%B1%D1%80%D0%B8%D0%BB%D0%B0%D1%82%D0%BE%D1%80%D0%B8-%D0%BD%D0%B0-20-%D0%B1%D0%B5%D0%BD%D0%B7%D0%B8%D0%BD%D0%BE%D1%81%D1%82%D0%B0%D0%BD%D1%86%D0%B8%D0%B8-%D0%B2-%D1%81%D1%82%D1%80%D0%B0%D0%BD%D0%B0%D1%82%D0%B0) (2023) |

School coordinates are the school building in OSM (checked with Nominatim). Decathlon, Metro and OMV use firstaid.bg's own pin, which lies within about 20 m of the OSM building.

### How we searched (2 Nov 2026)

1. **OpenStreetMap** (`emergency=defibrillator`), via the [OpenAEDMap](https://openaedmap.org/) export for Bulgaria because Overpass was overloaded: **16 AEDs in Bulgaria, 0 in Stara Zagora province.** The app now downloads OSM for the whole province (`STARA_ZAGORA_PROVINCE_BBOX`), not just the city, so new entries in Казанлък, Чирпан, Раднево and elsewhere appear on their own.
2. **[firstaid.bg AED map](https://map.firstaid.bg/)** („Първите три минути“), all 111 public markers read: 3 in the province (rows 4–6). Just outside it: OMV Поповица (Пловдив), OMV Хасково „Орфей“, OMV Рогозиново (АМ „Марица“) and OMV Хаджидимитрово (Ямбол).
3. **The „Великани“ / „Капачки за бъдеще“ school programme** (200 AEDs bought for schools nationwide; one undated report says 130 were handed over by then): 3 schools in the province found in news reports (rows 1–3). There is no published list of all schools; more will appear as donations are reported.
4. **Local and national news** for all 11 municipalities (Стара Загора, Казанлък, Чирпан, Раднево, Гълъбово, Николаево, Мъглиж, Гурково, Павел баня, Опан, Братя Даскалови). Nothing beyond the above.
5. **Other AED programmes**, none with a device in the province: firstaid.bg's 20 mountain huts (the only Balkan one is Вежен, above Тетевен), фондация „Шанс за живот“ (Видин), WINBET foundation (Гоце Делчев), Rotary (Русе), the Ministry of Health's draft ordinance (Apr 2026), and the РЗИ Стара Загора registers (no AED register yet).

### Leads, not on the map

These need a phone call or a visit before they can go on the map.

- **Hospitals and emergency services** (УМБАЛ Стара Загора, МБАЛ Казанлък, ЦСМП, МБАЛ Гълъбово, which got a defibrillator from ТЕЦ „КонтурГлобал Марица Изток 3“): the devices are clinical, not for a passer-by to take.
- **Places with no public evidence either way:** Mall Galleria, стадион „Берое“ and its first-aid room, Kaufland, Lidl, the railway station, Тракийски университет, the municipal sports halls and pool, gyms, Мини „Марица-изток“, Арсенал (Казанлък).
- **Other schools in the „Капачки за бъдеще“ programme**: ask „Спасителен клуб за бъдеще“ for the full list for the province.

### Adding a device

1. Found one in a public source? Add it to `seed.ts` with the building's coordinates and a `note` naming the source and date, then add a row here.
2. Checked it in person? Add it to OpenStreetMap (`emergency=defibrillator`, `defibrillator:location`, `opening_hours`, `access`, `indoor`) and remove the seed entry. The app merges records within 40 m, so nothing shows twice in between.

Missing or unparseable `opening_hours` show as „Часове неизвестни“, never as open.

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
