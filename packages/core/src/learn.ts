/**
 * „Научи“: a vertical feed of short first-aid reels (one idea per screen, swipe for the next).
 * Content follows ERC 2021 (BLS + First Aid). MUST be reviewed by a certified instructor
 * (БЧК / „3 минути“) before public release, same as cpr.ts.
 *
 * Icons and artwork are named here and drawn by each app, so the core stays UI-free.
 */

export type LearnIcon =
  | 'phone'
  | 'hands'
  | 'zap'
  | 'clock'
  | 'brain'
  | 'droplet'
  | 'smile'
  | 'arm'
  | 'speech'
  | 'pad'
  | 'handsOff'
  | 'repeat'
  | 'wind'
  | 'bed'
  | 'head'
  | 'eye'
  | 'users'
  | 'heart';

/** Each mood is a background the app draws; all of them carry white text at ≥ 4.5:1. */
export type LearnMood = 'red' | 'crimson' | 'violet' | 'indigo' | 'teal' | 'amber' | 'ink';
export type LearnArt = 'ecg' | 'chest' | 'aed' | 'water' | 'press' | 'fivefive' | 'side';

export interface LearnBeat {
  text: string;
  icon?: LearnIcon;
}

interface ReelBase {
  id: string;
  /** Short topic chip above the title. */
  topic: string;
  mood: LearnMood;
  art?: LearnArt;
  title: string;
  /** Read aloud when the voice is on. Plain words, no symbols. */
  say: string;
}

/** A title, an optional big number, and lines that appear one after another. */
export interface StoryReel extends ReelBase {
  kind: 'story';
  stat?: { prefix?: string; value: number; suffix: string; label: string };
  beats: LearnBeat[];
}

/** Myth or fact / a quick question: the viewer picks, then the answer and the reason appear. */
export interface ChoiceReel extends ReelBase {
  kind: 'choice';
  options: [string, string];
  answer: 0 | 1;
  verdict: string;
  why: string;
}

/** Tap along: the viewer's own tempo is measured against the 100–120/min target. */
export interface RhythmReel extends ReelBase {
  kind: 'rhythm';
  hint: string;
  min: number;
  max: number;
}

export interface CompareSide {
  title: string;
  icon: LearnIcon;
  points: string[];
}

export interface CompareReel extends ReelBase {
  kind: 'compare';
  left: CompareSide;
  right: CompareSide;
  note: string;
}

export interface FinaleReel extends ReelBase {
  kind: 'finale';
  body: string;
}

export type LearnReel = StoryReel | ChoiceReel | RhythmReel | CompareReel | FinaleReel;

export const LEARN_SOURCE = 'По насоки на ERC 2021';

export const LEARN_REELS: LearnReel[] = [
  {
    id: 'minutes',
    kind: 'story',
    topic: 'Спиране на сърцето',
    mood: 'red',
    art: 'ecg',
    title: 'Имаш минути, не часове',
    stat: { prefix: 'до ', value: 10, suffix: ' %', label: 'по-малък шанс за оцеляване с всяка минута без помощ' },
    beats: [
      { icon: 'brain', text: 'Без кислород мозъкът издържа само няколко минути.' },
      { icon: 'clock', text: 'Линейката често идва след 10 и повече минути.' },
      { icon: 'hands', text: 'Ти си там сега. Това, което направиш, е най-важното.' },
    ],
    say: 'Когато сърцето спре, всяка минута без помощ намалява шанса за оцеляване с до десет процента. Линейката често идва след десет минути. Ти си там сега.',
  },
  {
    id: 'three',
    kind: 'story',
    topic: 'Запомни три неща',
    mood: 'ink',
    title: 'Обади се. Натискай. Дефибрилатор.',
    beats: [
      { icon: 'phone', text: '112 — винаги първо. Включи високоговорителя.' },
      { icon: 'hands', text: 'Натискай в центъра на гърдите. Силно и бързо.' },
      { icon: 'zap', text: 'Донесат ли дефибрилатор — включи го и го слушай.' },
    ],
    say: 'Запомни три неща. Обади се на сто и дванайсет. Натискай в центъра на гърдите. И щом има дефибрилатор, включи го и го слушай.',
  },
  {
    id: 'hurt',
    kind: 'choice',
    topic: 'Мит или факт?',
    mood: 'violet',
    title: '„По-добре да не пипам. Ще го нараня.“',
    options: ['Мит', 'Факт'],
    answer: 0,
    verdict: 'Мит',
    why: 'Човек със спряло сърце вече умира. Счупено ребро зараства, спряло сърце — не. Всеки опит е по-добър от нищо.',
    say: 'Мит или факт? По-добре да не пипам, ще го нараня.',
  },
  {
    id: 'rhythm',
    kind: 'rhythm',
    topic: 'Ритъмът',
    mood: 'red',
    title: '100–120 натискания в минута',
    hint: 'Почукай по кръга в ритъма на „Stayin’ Alive“ на Bee Gees.',
    min: 100,
    max: 120,
    say: 'Масажът е в ритъм от сто до сто и двайсет натискания в минута. Почукай по кръга и виж дали улучваш.',
  },
  {
    id: 'where',
    kind: 'story',
    topic: 'Къде и как',
    mood: 'crimson',
    art: 'chest',
    title: 'Центърът на гърдите. 5–6 см надолу.',
    beats: [
      { icon: 'hands', text: 'Основата на дланта — в центъра на гърдите. Другата ръка отгоре.' },
      { icon: 'arm', text: 'Ръцете изпънати, раменете точно над тях. Натискай с тежестта си.' },
      { icon: 'repeat', text: 'Пускай гърдите да се изправят след всяко натискане.' },
    ],
    say: 'Основата на дланта е в центъра на гърдите, другата ръка отгоре. Ръцете са изпънати. Натискай пет до шест сантиметра и пускай гърдите да се изправят.',
  },
  {
    id: 'gasping',
    kind: 'choice',
    topic: 'Мит или факт?',
    mood: 'indigo',
    title: '„Хърка и си поема въздух на пресекулки — значи диша.“',
    options: ['Мит', 'Факт'],
    answer: 0,
    verdict: 'Мит',
    why: 'Рядкото хъркащо дишане е знак, че сърцето е спряло. Не диша нормално — 112 и започни масаж.',
    say: 'Мит или факт? Хърка и си поема въздух на пресекулки, значи диша.',
  },
  {
    id: 'aed',
    kind: 'story',
    topic: 'Дефибрилатор',
    mood: 'teal',
    art: 'aed',
    title: 'Той говори. Ти само слушаш.',
    beats: [
      { icon: 'zap', text: 'Отвори капака или натисни зеления бутон.' },
      { icon: 'pad', text: 'Залепи лепенките точно както е нарисувано на тях.' },
      { icon: 'handsOff', text: 'Никой не докосва човека, докато уредът анализира.' },
      { icon: 'hands', text: 'След това веднага продължи масажа.' },
    ],
    say: 'Дефибрилаторът говори и казва всичко. Включи го, залепи лепенките, не докосвай човека, докато анализира, и продължи масажа.',
  },
  {
    id: 'aedsafe',
    kind: 'choice',
    topic: 'Бърз въпрос',
    mood: 'teal',
    title: 'Може ли дефибрилаторът да даде ток на човек, на когото не трябва?',
    options: ['Може', 'Не може'],
    answer: 1,
    verdict: 'Не може',
    why: 'Уредът сам проверява ритъма на сърцето и дава ток само ако е нужен. С него не можеш да сбъркаш.',
    say: 'Бърз въпрос. Може ли дефибрилаторът да даде ток на човек, на когото не трябва?',
  },
  {
    id: 'attack',
    kind: 'compare',
    topic: 'Не е едно и също',
    mood: 'indigo',
    title: 'Инфаркт или спиране на сърцето?',
    left: {
      title: 'Инфаркт',
      icon: 'droplet',
      points: ['Запушена „тръба“ — кръвта не стига до сърцето.', 'В съзнание е. Боли го в гърдите.', '112. Нека седне и не ходи.'],
    },
    right: {
      title: 'Спиране',
      icon: 'zap',
      points: ['Спрял „ток“ — сърцето не помпа.', 'Пада. Не отговаря, не диша нормално.', '112, масаж, дефибрилатор.'],
    },
    note: 'Инфарктът може да премине в спиране на сърцето. Затова 112 и в двата случая.',
    say: 'Инфарктът е запушена тръба. Човекът е в съзнание и го боли. Спирането на сърцето е спрял ток. Човекът пада и не диша. И в двата случая — сто и дванайсет.',
  },
  {
    id: 'choking',
    kind: 'story',
    topic: 'Задавяне',
    mood: 'amber',
    art: 'fivefive',
    title: 'Не може да диша? 5 + 5.',
    beats: [
      { icon: 'wind', text: 'Може да кашля? Кажи му да кашля силно.' },
      { icon: 'hands', text: 'Не може? 5 силни удара между лопатките.' },
      { icon: 'arm', text: 'Пак не? 5 притискания над пъпа — навътре и нагоре.' },
      { icon: 'phone', text: 'Редувай 5 + 5. Загуби съзнание — 112 и масаж.' },
    ],
    say: 'При задавяне първо го накарай да кашля. Ако не може, пет удара между лопатките, после пет притискания над пъпа. Редувай.',
  },
  {
    id: 'side',
    kind: 'story',
    topic: 'Диша, но не отговаря',
    mood: 'teal',
    art: 'side',
    title: 'Обърни го на една страна',
    beats: [
      { icon: 'bed', text: 'Диша нормално, но не реагира? Не го оставяй по гръб.' },
      { icon: 'head', text: 'Обърни го настрани, главата леко назад, горният крак свит.' },
      { icon: 'eye', text: 'Обади се на 112 и следи дишането му до идването им.' },
    ],
    say: 'Ако диша нормално, но не отговаря, обърни го на една страна, главата леко назад. Обади се на сто и дванайсет и следи дишането.',
  },
  {
    id: 'stroke',
    kind: 'story',
    topic: 'Инсулт',
    mood: 'violet',
    title: 'Лице. Ръце. Говор. Време.',
    beats: [
      { icon: 'smile', text: 'Лице: увисва от едната страна, когато се усмихне.' },
      { icon: 'arm', text: 'Ръце: едната пада, когато вдигне двете.' },
      { icon: 'speech', text: 'Говор: завален или странен.' },
      { icon: 'clock', text: 'Време: 112 веднага. Запомни кога започна.' },
    ],
    say: 'Инсулт. Лице, ръце, говор, време. Видиш ли един от тези знаци, обади се на сто и дванайсет веднага и запомни кога е започнало.',
  },
  {
    id: 'bleeding',
    kind: 'story',
    topic: 'Силно кървене',
    mood: 'crimson',
    art: 'press',
    title: 'Натисни силно. Не пускай.',
    beats: [
      { icon: 'phone', text: 'Обади се на 112 или накарай някой друг да звънне.' },
      { icon: 'hands', text: 'Натисни раната директно — с ръка, кърпа или дреха.' },
      { icon: 'repeat', text: 'Прокърви? Добави още плат отгоре. Не махай първия.' },
    ],
    say: 'При силно кървене натисни раната силно и директно и не пускай. Ако прокърви, добави още плат отгоре.',
  },
  {
    id: 'burn',
    kind: 'choice',
    topic: 'Мит или факт?',
    mood: 'amber',
    art: 'water',
    title: '„На изгаряне се слага кисело мляко.“',
    options: ['Мит', 'Факт'],
    answer: 0,
    verdict: 'Мит',
    why: 'Хладка течаща вода, поне 20 минути. Без лед, мляко, олио и паста за зъби. После покрий с чисто фолио.',
    say: 'Мит или факт? На изгаряне се слага кисело мляко.',
  },
  {
    id: 'you',
    kind: 'story',
    topic: 'Можеш',
    mood: 'ink',
    title: 'Не е нужно да си лекар',
    beats: [
      { icon: 'phone', text: 'Диспечерът на 112 ще ти казва какво да правиш.' },
      { icon: 'hands', text: 'Само масаж, без дишане уста в уста — пак спасява.' },
      { icon: 'users', text: 'Единствената грешка е да не направиш нищо.' },
    ],
    say: 'Не е нужно да си лекар. Диспечерът ще ти казва какво да правиш. Единствената грешка е да не направиш нищо.',
  },
  {
    id: 'finale',
    kind: 'finale',
    topic: 'Готово',
    mood: 'red',
    title: 'Вече знаеш повече от повечето хора',
    body: 'Сподели с някой, когото обичаш. Курс по първа помощ при БЧК те учи и с ръцете — това тук не го замества.',
    say: 'Браво. Вече знаеш повече от повечето хора. Сподели с някой, когото обичаш.',
  },
];

/** Beats per minute from tap timestamps (ms), using the last few intervals; null until there are enough. */
export function tempoFromTaps(taps: number[], window = 4): number | null {
  if (taps.length < 3) return null;
  const recent = taps.slice(-(window + 1));
  const gaps = recent.slice(1).map((t, i) => t - recent[i]);
  // A pause longer than 1.5 s means the viewer stopped; start over rather than average it in.
  if (gaps.some((g) => g > 1500 || g <= 0)) return null;
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Math.round(60_000 / avg);
}
