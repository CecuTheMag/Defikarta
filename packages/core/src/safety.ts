/**
 * Rules for the volunteer network, one block per question the mentor asked (docs/SUNDAY.md §4).
 * Everything here is a working draft: the texts and thresholds need sign-off from БЧК, the Bulgarian
 * Resuscitation Council and a health-law lawyer before any live (non-drill) alert is sent.
 */

// ---------- 1. Competence: who certifies the volunteer is trained and keeps it up ----------

/** Course providers we can check. Anything else goes to a verifier as "непознат издател". */
export const RECOGNIZED_ISSUERS = ['БЧК', 'Български червен кръст', 'Първите три минути', 'ERC', 'Европейски съвет по ресусцитация', 'Български съвет по ресусцитация'];

export function issuerRecognized(issuer: string): boolean {
  const s = issuer.toLowerCase();
  return RECOGNIZED_ISSUERS.some((r) => s.includes(r.toLowerCase()));
}

/** BLS courses are usually refreshed every two years; the verifier can set an earlier date. */
export const CERT_VALID_YEARS = 2;

export function certValidUntil(issuedOn: string): string {
  const d = new Date(`${issuedOn}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + CERT_VALID_YEARS);
  return d.toISOString().slice(0, 10);
}

/** A short in-app knowledge check, repeated every QUIZ_VALID_DAYS. It does not replace a course. */
export const QUIZ_VALID_DAYS = 180;

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
}

export const CPR_QUIZ: QuizQuestion[] = [
  {
    q: 'Човек не реагира и не диша нормално. Какво правиш първо?',
    options: ['Търся AED и чакам с масажа', 'Обаждам се на 112 (на високоговорител) и започвам масаж', 'Давам му вода и го слагам да седне'],
    answer: 1,
  },
  { q: 'С какво темпо натискаш гръдния кош?', options: ['60–80 в минута', '100–120 в минута', '150–180 в минута'], answer: 1 },
  { q: 'Колко дълбоко натискаш при възрастен?', options: ['1–2 см', '5–6 см', '10 см'], answer: 1 },
  {
    q: 'Пристига AED. Какво правиш?',
    options: ['Включвам го и следвам гласовите указания; спираме масажа само когато AED каже', 'Спираме масажа, докато чета инструкцията', 'Ползвам го само ако съм медик'],
    answer: 0,
  },
  {
    q: 'Стигаш до мястото, но има движещи се коли, ток или огън. Какво правиш?',
    options: ['Влизам бързо — всяка секунда е важна', 'Не се приближавам, казвам на 112 и чакам указания', 'Местя човека сам'],
    answer: 1,
  },
];

/** Safety-critical: every answer must be right. Retries are allowed. */
export function gradeQuiz(answers: number[]): { passed: boolean; correct: number } {
  const correct = CPR_QUIZ.filter((q, i) => answers[i] === q.answer).length;
  return { passed: correct === CPR_QUIZ.length, correct };
}

// ---------- 2. Responsibility: what each side commits to ----------

export const TERMS_VERSION = '2026-10-draft-1';

/** Draft volunteer terms. Shown in full and accepted explicitly; the version and time are stored. */
export const VOLUNTEER_TERMS: string[] = [
  'Участието е доброволно. Можеш да откажеш всяко известие, без да обясняваш защо и без последствия.',
  'Приложението не е спешна служба и не замества 112. Спешната помощ се ръководи от 112 и ЦСМП; следвай указанията им.',
  'Действаш в рамките на обучението си: масаж и AED. Не поставяш диагнози и не даваш лекарства.',
  'Не влизаш на опасно място (движение, ток, огън, вода, агресия). Твоята безопасност е първа.',
  'Поддържаш удостоверението си валидно и минаваш кратката проверка на знанията на всеки 6 месеца.',
  'Точната ти позиция се вижда само в случай, който си приел, и се изтрива при затварянето му. Можеш да изтриеш профила си по всяко време.',
  'Операторът на приложението: проверява удостоверенията, пази данните само колкото е нужно, води запис на всяко известие и не продава данни.',
  'Чернова за юридическа проверка: въпросите за отговорност и застраховка на доброволците са отворени (виж docs/SUNDAY.md).',
];

// ---------- 3. Personal data ----------

/** Closed incidents keep a precise location this long, then it is rounded to ~100 m and device ids are dropped. */
export const RETAIN_PRECISE_DAYS = 30;

export const coarsen = (v: number) => Math.round(v * 1000) / 1000;

// ---------- 4. Coordination with 112 ----------
// Since February 2026 the Health Act obliges anyone at the scene to inform 112. The bystander alert is only offered
// after the user confirms 112 has been called, and every offer tells the volunteer whether that happened.

// ---------- 5. Safety: who decides a volunteer can be sent ----------

/** Bystander's answer to "is the scene safe?". 'unsafe' sends nobody; 'unknown' warns every volunteer. */
export type SceneSafety = 'safe' | 'unknown' | 'unsafe';

/** Quiet hours as whole hours [from, to), possibly over midnight, e.g. 23 → 7. */
export interface QuietHours {
  from: number;
  to: number;
}

export function inQuietHours(q: QuietHours | undefined, now = new Date()): boolean {
  if (!q || q.from === q.to) return false;
  const h = now.getHours();
  return q.from < q.to ? h >= q.from && h < q.to : h >= q.from || h < q.to;
}
