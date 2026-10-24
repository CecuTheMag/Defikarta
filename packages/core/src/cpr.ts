/**
 * Hands-only CPR for untrained bystanders, following ERC 2021 guidelines
 * (100-120 compressions/min, 5-6 cm deep). MUST be reviewed by a certified
 * instructor (БЧК / „3 минути") before public release.
 */
export const CPR_BPM = 110;
export const BEAT_INTERVAL_MS = Math.round(60_000 / CPR_BPM);

export const EMERGENCY_NUMBER = '112';

export interface CprStep {
  title: string;
  body: string;
  /** Spoken version (shorter, no symbols). */
  say: string;
}

export const BEFORE_CPR: CprStep[] = [
  {
    title: 'Безопасно ли е?',
    body: 'Огледай се за ток, трафик, огън. Не ставай втора жертва.',
    say: 'Огледай се. Безопасно ли е да приближиш?',
  },
  {
    title: 'Отговаря ли? Диша ли нормално?',
    body: 'Разтърси го за раменете и попитай силно „Добре ли сте?“. Гледай гърдите до 10 секунди. Рядко хъркащо дишане НЕ е нормално.',
    say: 'Разтърси го за раменете и попитай силно, добре ли сте. Гледай дали диша нормално.',
  },
  {
    title: 'Не диша нормално → започни масаж',
    body: 'Легни го по гръб на твърда повърхност. Основата на дланта в центъра на гърдите, другата ръка отгоре, ръцете изпънати.',
    say: 'Сложи основата на дланта в центъра на гърдите. Другата ръка отгоре. Ръцете изпънати.',
  },
];

export const DURING_CPR_TIPS = [
  'Натискай 5–6 см надолу, в ритъма на сигнала.',
  'Пускай гърдите да се изправят напълно между натисканията.',
  'Не спирай, докато не дойде помощ или дефибрилатор.',
  'Ако има друг човек — сменяйте се на всеки 2 минути.',
  'Пристигна ли дефибрилатор: включи го и прави каквото казва.',
];

/** Spoken every N compressions to keep the rescuer going. */
export const CUE_EVERY = 30;
export const CUES = ['Продължавай. Силно и бързо.', 'Не спирай.', 'Пусни гърдите да се изправят.', 'Помощта идва. Продължавай.'];

export function cueFor(compressions: number): string | null {
  if (compressions === 0 || compressions % CUE_EVERY !== 0) return null;
  return CUES[(compressions / CUE_EVERY - 1) % CUES.length];
}
