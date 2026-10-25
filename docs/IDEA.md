# ДефиКарта: the idea

> **Someone collapses on the street in Stara Zagora. Nobody knows where the nearest defibrillator is, because in Bulgaria nobody has ever mapped them. ДефиКарта maps them, guides the bystander through CPR, and sends trained volunteers running: one to start CPR, one to fetch the nearest AED.**

This document merges two earlier write-ups into one project:

| Source | Competition | What it contributed |
|---|---|---|
| STZideas `ideas/01-defikarta.md` (90/100, ranked #1) | **Идейник 2026**: video due 2 Dec 2026, final 16 Jan 2027 | The product: AED map, 112-first emergency flow, offline CPR metronome, responder alerts, coverage heatmap, mapping walk, school drill |
| NoitIdeas `ideas/20-cpr-first-responder-network` (СърцеНаблизо) | **НОИТ 2026–27**, XI–XII, category *Разпределени приложения* | The engineering depth: a real-time dispatch engine, two-role dispatch (CPR vs AED runner), incident state machine, privacy-preserving location, 6 roles, load/chaos tests, CI/CD, feature flags, observability |

**One product, two levels of depth.** Идейник judges (HR and education people) want to see people using it and numbers it changed. НОИТ judges (engineers) want to see a correct, tested, observable distributed system. We build the Идейник product first on a simple stack (Phase 1). We then harden it into the НОИТ system (Phase 2) without rewriting it, because the domain logic lives in `packages/core` from day one. The full technical design is in [BLUEPRINT.md](BLUEPRINT.md).

---

## 1. The problem

| Fact | Source |
|---|---|
| **AEDs in Bulgaria are not mapped**, and nobody is obliged to report them | Bulgarian Red Cross, via the EENA AED legislation report |
| The law was changed so that **non-medics can use an AED** | BTA |
| The Ministry of Health ran a consultation (Apr–May 2026) on an **ordinance defining the public places that must have AEDs**, so more devices are coming | strategy.bg |
| **Sept 2026:** Bulgaria joined **EuReCa**, the European registry of out-of-hospital cardiac arrest | Eurocom, БНР |
| Immediate CPR **doubles to quadruples** survival. Every minute without CPR cuts survival by roughly 10% | firstaid.bg; ERC |
| Brain damage starts within **4–6 minutes** without circulation. Ambulances often need 10–30 min, more outside cities | ERC; ЦСМП response times *(ask ЦСМП Стара Загора for the real number)* |
| On **24 Oct 2026** OpenStreetMap had **0** AEDs in Stara Zagora and **15** in all of Bulgaria | Overpass query, `packages/core/src/overpass.ts` |

**The gap in one sentence:** the country is about to install defibrillators, but nobody can find one in an emergency, and nobody is set up to bring one.

**Proof we collect ourselves** (this is the headline of the video and the defense):
- **The mapping walk:** walk and phone around the city (malls, hospitals, sports halls, the municipality, gyms, pharmacies, big employers, schools) and count every AED: "We found **N** AEDs in a city of ~120,000, and **X** of them are locked after 18:00."
- **Survey** of 150+ students: "Do you know where the nearest AED is?"
- **ЦСМП Стара Загора:** average ambulance response time in the city and the municipality.
- **The drill:** a staged arrest at school, timing how long it takes to bring an AED, with and without the app, at least 3 times each. "Without: 7 min 40 s. With: 2 min 55 s." **This is the killer number.**

## 2. Who uses it

| Role | Account | Needs |
|---|---|---|
| **Public / bystander** | none | Call 112, get guided through CPR, find the nearest open AED. Works offline |
| **Responder** (volunteer) | yes, verified | Alerts only when nearby and available; fast navigation; CPR guide; can always decline; debrief afterwards |
| **AED owner** (mall, gym, school) | yes | Register the device, opening hours and where it is inside the building; battery/pad expiry reminders |
| **Verifier** (CPR trainer, БЧК / „3 минути") | yes | Approve responders' CPR certificates; approve submitted AEDs |
| **Dispatcher** (pilot: the team or a trainer running drills; later 112/ЦСМП) | yes | Create incidents, watch responders accept and move, see AED status |
| **Admin** | yes | Regions, feature flags, coverage map, monitoring |

НОИТ requires **test accounts for every role**. All six exist in the public drill environment (see BLUEPRINT §17).

## 3. What exists and why it is not enough

| Existing | Why it doesn't solve this |
|---|---|
| 112 + ambulance | Essential, and always first. Often too slow for the first minutes |
| Heartrunner (SE/DK), GoodSAM (UK), PulsePoint (US), AED4EU, the Polish "AED map" app | Not operating in Bulgaria, no Bulgarian data, tied to their own national dispatch systems |
| OSM `emergency=defibrillator` | The data format exists, but Bulgaria has almost no data in it. **We fill it** |
| Bulgarian Red Cross / „3 минути" | They train people and advocate, but run no map and no alert network |

The Swedish evidence that volunteer dispatch works: Ringh et al., *NEJM* 2015 (bystander CPR 62% with SMS-dispatched volunteers vs 48% without).

**The claim we make:** this exists abroad, but in Bulgaria there is no AED registry and no responder network. We verify that claim again before each registration (see §11).

## 4. The product

### 4.1 Emergency flow (bystander, no account, offline-capable)
1. Big red button: **„Някой припадна"**.
2. **Screen 1 is always „Обади се на 112"** (one tap → `tel:112`). This screen is never skipped or reordered.
3. **Screen 2 is the CPR guide:** Bulgarian voice, a **110/min metronome**, vibration, a compression counter, and a "swap every 2 minutes" cue. Works offline.
4. In parallel the app shows the **nearest reachable AED**: distance, walking time, open now? (from `opening_hours`), where inside the building ("до охраната, вход Б"), and a walking route. "Пратете някой за този дефибрилатор."
5. **Alert responders nearby** (behind a feature flag in the pilot): the bystander's location becomes an incident, and the dispatch engine alerts trained responders.

### 4.2 Responder network and dispatch
- Sign up, upload a CPR certificate, and a trainer verifies it. **18+ for street alerts.** Under-18 responders are scoped to their school's drills only.
- Choose availability: off, fixed zones (home / school / work with a schedule), or "around me" (coarse location only).
- When an incident starts, the **dispatch engine** picks responders by **walking time**, in waves of growing radius:
  - **CPR responders** go straight to the patient.
  - **One AED runner** goes to the best AED first, then to the patient, but only if that brings the AED sooner than the ambulance would.
- The responder taps **„Тръгвам"** or **„Нося AED"**, navigates, and reports "on scene" / "AED on scene". Precise location is shared **only while the incident is active**.
- Two hours after an incident: a check-in message and contacts for psychological support.

### 4.3 AED registry
- Public map with filters: **open now**, **24/7**, **outdoor**.
- **„Добави AED":** photo, location, opening hours and where inside. It goes to a moderation queue. A verifier checks it, then the team adds it to **OpenStreetMap** by hand, under ODbL. The data outlives the project.
- AED owners get maintenance reminders (pads, battery) and re-verification prompts.
- **QR stickers** next to each AED (with the owner's permission) link to the app, so the map spreads by itself.

### 4.4 Coverage and insight (for the municipality)
- **Coverage heatmap:** which neighbourhoods have no AED within a 5-minute walk, now / at night / 24/7-only.
- **"Where to put the next 5 AEDs"**, ranked by people covered.
- Phase 2: a **Monte Carlo simulator** of time-to-CPR and time-to-AED with the current responders and AEDs.

## 5. Safety principles (not negotiable)

1. **112 first, always.** The app adds help; it never replaces or delays an ambulance.
2. **Never promise access we can't back up.** Unknown opening hours show as „Часове неизвестни", never as open (already implemented).
3. **Responders can always decline**, are never alerted outside their availability, and get a debrief.
4. **Precise location only during an active, accepted incident**, deleted when it closes.
5. **CPR content follows ERC 2021 hands-only CPR** and **must be reviewed by a certified instructor (БЧК / „3 минути") before any public release.**
6. **Drills are always labelled „УЧЕНИЕ"** on every screen and notification.

## 6. How it wins

### Идейник (story and impact)
- The **officially confirmed national gap**, life-or-death stakes, and perfect timing (the new AED ordinance, EuReCa).
- **"We walked the city and mapped every AED"**, published in OSM, and **"the drill cut AED arrival time from X to Y"**.
- The jury is not technical: show people, the drill and the numbers. Architecture gets ≤ 15 seconds of the video.

### НОИТ (engineering)
Score blocks: 20 general · 25 design · 35 implementation · 20 defense.

| Block | How ДефиКарта scores |
|---|---|
| General (20) | Life-saving, proven abroad, missing in Bulgaria; complete for every role |
| Design (25) | Clear service boundaries, OpenAPI, real-time layer, a state machine, privacy by design, native + PWA UX |
| Implementation (35) | Unit, property, contract, integration, E2E, load (k6) and chaos tests; CI/CD; feature flags; containers; observability; security scans; clean git history |
| Defense (20) | **Live drill:** the judges scan a QR code, become test responders, a simulated arrest is triggered in the room, and their phones ring. Plus p95 fan-out latency, drill times and the coverage heatmap |

Category trap to avoid: ❌ "a map of defibrillators" is a CRUD app. ✅ Real-time dispatch, routing, a state machine, and load/chaos tests are the core.

## 7. KPIs we report

- AEDs mapped in Stara Zagora, and how many were pushed to OSM
- % of the city's population within a 5-min walk of an AED (now / at night / 24/7-only)
- Registered and verified responders
- **Drill results:** time to first responder, time to CPR, time to AED, with vs without the app (≥ 3 runs each)
- Engineering (НОИТ): alert fan-out p95 (target < 2 s), offer acceptance rate, incidents completed under the chaos test
- Installs and CPR-guide opens

## 8. Budget (Идейник, ≤ €1,000)

| Item | € |
|---|---|
| CPR training mannequin (demos and drills) | 130 |
| AED trainer (cannot shock, for drills) | 120 |
| CPR certification course for 4–6 team members (if not sponsored) | 250 |
| Domain + hosting for one year (free tiers; a small VPS from Phase 2) | 50 |
| "AED тук → ДефиКарта" QR stickers (with owner permission) | 150 |
| Printing for drill/mapping events, team T-shirts | 150 |
| Contingency (SMS fallback credits for drills, VPS overrun) | 150 |
| **Total** | **~1,000** |

Running cost after the contests: ~€0 on free tiers in Phase 1, and ~€15–25/month for a VPS in Phase 2. НОИТ requires the system to stay online until **≥ 1 month after the national round** (≈ June 2027).

## 9. Timeline

Today is **25 Oct 2026**. The map, the emergency flow and the CPR guide already work (commit `b8bbe6d`), about a week ahead of the original plan.

| When | Milestone | For |
|---|---|---|
| 25 Oct | Merged idea + system blueprint (this doc) | both |
| 26 Oct – 1 Nov | Backend foundation: database, auth, roles, AED API, map filters | Идейник |
| 2 – 8 Nov | „Добави AED" + moderation queue. **Mapping weekend 7–9 Nov** → OSM | Идейник |
| early Nov | **The НОИТ 2026–27 regulation is published: re-check every rule** | НОИТ |
| 9 – 15 Nov | Responder sign-up, certificate verification, availability, push | Идейник |
| 16 – 22 Nov | Incidents + dispatch v1 + dispatcher console + drill mode. **First school drill** | both |
| 23 – 29 Nov | Coverage heatmap; drills ×3; survey results | Идейник |
| 30 Nov – 2 Dec | Video (≤ 3 min, horizontal) + presentation. **Submit by 2 Dec 14:00** | Идейник |
| ≤ mid-Dec | **Register the НОИТ idea** (annotation below) + school committee defense with a live dispatch | НОИТ |
| Dec – Jan | Phase 2: dispatch service, Redis GEO, event bus, OSRM walking times, SMS fallback, feature flags, observability | НОИТ |
| 16 Jan 2027 | **Идейник final** | Идейник |
| Feb | Load + chaos + security tests; Appendix 1 documentation PDF; user manual; test accounts; drill environment frozen | НОИТ |
| ≤ ~1 Mar | Upload code, builds and docs. Online from ≥ 1 week before the regional round | НОИТ |
| early Mar | **Regional defense** | НОИТ |
| Mar – Apr | Monte Carlo coverage simulator; more drills; partner letters | НОИТ |
| ~May | **National round** (IT test + defense) | НОИТ |

## 10. Risks and answers for the jury

| Question / risk | Answer |
|---|---|
| "Is it safe to send people to emergencies?" | Street alerts go only to **18+ certified, verified** responders who opt in. Under-18s are limited to school drills. 112 always comes first. Responders can decline at any time |
| "What if the CPR guide is wrong?" | ERC 2021 hands-only CPR, reviewed by a certified instructor (БЧК / „3 минути") before release |
| "What if the AED data is outdated?" | `verified_at` on every device, re-verification prompts, owner contact, and OSM as the source of truth |
| "Isn't tracking volunteers invasive?" | Idle: fixed zones or a ~1 km coarse cell, never live GPS. Precise location only during an accepted incident, then deleted. Every access is audited |
| "How does an arrest get into the system without 112?" | Today: drills, the dispatcher console, and an optional bystander flow that **also** calls 112. Later: a published integration spec for 112/ЦСМП |
| "What if your server goes down?" | The bystander flow (112 + CPR + cached AEDs) works offline with no server. Replicas, health checks and chaos-test results cover dispatch (Phase 2) |
| "Fake alerts?" | Bystander alerts are behind a flag in the pilot, rate-limited per device, marked „непотвърден сигнал", and cancellable by a dispatcher |
| "Will it die after the contest?" | The map data lives in OSM forever. Running cost is ~€0–25/month. Pitch: the municipality has to place AEDs under the new ordinance and needs a registry |
| iOS push limits | Responders use the native app (APNs). Web Push only works for home-screen PWAs (iOS 16.4+). Fallbacks: in-app realtime alerts and SMS |
| Too few responders | Start with medical/nursing students, БЧК volunteers, teachers and staff; the simulator shows the density needed |
| Legal protection for lay rescuers | Unclear in Bulgaria (verify). Stated as a limitation; responders are briefed |
| **What kills this project** | A pretty app with no data, no drill and no tests. **Show the mapped count, the drill times and p95 fan-out latency** |

## 11. Verify before each registration

- [ ] Bulgarian OHCA survival and ЦСМП response-time data (ЦСМП reports, EuReCa).
- [ ] That no Bulgarian AED registry or responder app has launched since October 2026.
- [ ] Bulgarian legal protection for lay rescuers giving first aid.
- [ ] БЧК Стара Загора / „3 минути": CPR content review, certificate verification, drills.
- [ ] Идейник judging criteria (email `hey@tuk-tam.bg`).
- [ ] НОИТ 2026–27 regulation: categories, deadlines, the disqualification list (GPL-3.0 ✅ already, full source, online window, test accounts for every role, asset licenses, not previously at a national round).

## 12. Registration texts (BG)

### Идейник (application, deadline 21 Oct 2026)

> **Име:** ДефиКарта
>
> **Проблем:** При сърдечен арест всяка минута без помощ намалява шанса за оцеляване, а незабавният сърдечен масаж го удвоява до учетворява. Автоматичните дефибрилатори в България обаче не са картографирани — никой не знае къде се намират, а с новата наредба през 2026 г. ще бъдат поставени още. В Стара Загора няма начин бързо да откриеш най-близкия дефибрилатор или човек, обучен да помогне.
>
> **Решение:** Разработваме безплатно приложение, което при спешен случай първо насочва към 112, после води човека през сърдечния масаж с глас и метроном, показва най-близкия дефибрилатор с маршрут и уведомява регистрирани обучени доброволци наблизо. Ще картографираме всички дефибрилатори в Стара Загора и ще публикуваме данните отворено в OpenStreetMap.
>
> **Резултат до декември:** карта на всички открити дефибрилатори в града, регистрирани обучени доброволци, учебна симулация, показваща колко по-бързо пристига помощта с приложението.

### НОИТ (idea registration, ~mid-Dec 2026)

> **Име на проекта:** ДефиКарта – разпределена система за изпращане на обучени доброволци и най-близкия дефибрилатор при внезапен сърдечен арест
>
> **Направление:** Разпределени приложения
>
> **Анализ на потребностите:** При внезапен сърдечен арест шансът за оцеляване намалява значително с всяка минута без сърдечно-белодробна реанимация и дефибрилация. Линейките често пристигат след повече от 10–15 минути, особено извън големите градове. В България няма публичен регистър на автоматичните външни дефибрилатори (към октомври 2026 г. в OpenStreetMap има 15 за цялата страна и нито един в Стара Загора) и няма система за включване на обучени доброволци, каквито успешно работят в Швеция, Дания и Великобритания.
>
> **Цел:** Да се създаде разпределена система, която поддържа проверен регистър на дефибрилаторите и мрежа от обучени доброволци и при сърдечен арест в реално време изпраща най-подходящите доброволци – един да започне реанимация, друг да донесе най-близкия дефибрилатор.
>
> **Задачи:** (1) регистър на дефибрилаторите с проверка, отворени данни в OpenStreetMap и напомняния за поддръжка; (2) регистрация и проверка на доброволци с удостоверение за обучение; (3) услуга за местоположение със защита на личните данни; (4) алгоритъм за избор на доброволци по време за придвижване пеша, на вълни с нарастващ радиус; (5) мобилно и уеб приложение с указания за реанимация, които работят без интернет; (6) конзола за диспечер; (7) карта на покритието и препоръки за разположение на нови дефибрилатори; (8) тренировъчни учения с измерване на времената.
>
> **Потребители:** граждани, доброволци с обучение по първа помощ, собственици на дефибрилатори, обучители, диспечери, администратори.
>
> **Основни очаквани характеристики:** известяване за под 2 секунди; работа в реално време; точно местоположение само по време на активен случай; винаги първо обаждане на 112; REST интерфейси с OpenAPI, автоматични тестове (вкл. натоварващи и тестове за отказ на компонент), непрекъсната интеграция и доставка, контейнери, превключватели на функционалности и наблюдение на системата; тестови профили за всяка роля.
>
> **Съществуващи решения:** Heartrunner, GoodSAM и PulsePoint работят в чужбина и не обхващат България; списъците с дефибрилатори у нас са разпокъсани и непроверени. Предложеното решение изгражда такава система за България и започва от Стара Загора.
>
> **План за реализация:** октомври–ноември – регистър, приложения, доброволци и първа версия на изпращането, картографиране на града; декември–януари – двуролево изпращане, услуги в контейнери, известия с резервен SMS канал, наблюдение; февруари – натоварващи тестове, сигурност и документация; март–април – симулатор на покритието и учения.

## Sources
- [EENA: AED legislation document](https://eena.org/document/aed-legislation-document)
- [BTA: non-medics may use AEDs](https://www.bta.bg/bg/videos/33901) · [strategy.bg: MoH AED-placement consultation](https://www.strategy.bg/bg/public-consultations/12323/export)
- [Eurocom: Bulgaria joins EuReCa, 23.09.2026](https://eurocom.bg/2026/09/23/balgariya-stava-chast-ot-evropeyskata-mrezha-za-prouchvane-na-sardechniya-arest) · [БНР](https://bnrnews.bg/main/post/532049/balgariya-se-vklyuchi-v-evropeyskoto-prouchvane-na-izvanbolnichniya-sardechen-arest)
- [firstaid.bg: early defibrillation](https://firstaid.bg/mission/%D0%BE%D0%B1%D1%89%D0%B5%D1%81%D1%82%D0%B2%D0%B5%D0%BD%D0%B8-%D0%BF%D1%80%D0%BE%D0%B3%D1%80%D0%B0%D0%BC%D0%B8/)
- Ringh M. et al., "Mobile-Phone Dispatch of Laypersons for CPR in Out-of-Hospital Cardiac Arrest", *NEJM* 2015;372:2316–25
- [OSM wiki: emergency=defibrillator](https://wiki.openstreetmap.org/wiki/Tag:emergency%3Ddefibrillator)
- [PulsePoint (EU data portal use case)](https://data.europa.eu/hr/publications/use-cases/pulsepoint) · [Polish AED map app](https://apps.apple.com/app/id1638495701)
