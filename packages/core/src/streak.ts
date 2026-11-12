import { monthKey, type DateStr } from './time.ts';

/** Bir turun kullanıcı açısından ham sonucu. */
export type RoundOutcome = 'participated' | 'missed' | 'void';
/** Seri dondurma uygulandıktan sonra kayda geçen durum. */
export type Participation = 'participated' | 'frozen' | 'missed' | 'void';

export interface StreakState {
  current: number;
  longest: number;
  /** Dondurma hakkının kullanıldığı son ay (`YYYY-MM`). Ayda 1 hak, birikmez. */
  freezeUsedMonth: string | null;
}

export const INITIAL_STREAK: StreakState = { current: 0, longest: 0, freezeUsedMonth: null };

/**
 * Seri katılıma bağlıdır: turda en az bir tahmin yeter, isabet aranmaz.
 * Tüm soruları iptal olan tur `void`'dir ve hiçbir şeyi değiştirmez.
 */
export function roundOutcome(predictionCount: number, allQuestionsCancelled: boolean): RoundOutcome {
  if (allQuestionsCancelled) return 'void';
  return predictionCount > 0 ? 'participated' : 'missed';
}

export function applyRound(
  state: StreakState,
  date: DateStr,
  outcome: RoundOutcome,
): { state: StreakState; participation: Participation } {
  if (outcome === 'void') return { state, participation: 'void' };
  if (outcome === 'participated') {
    const current = state.current + 1;
    return {
      state: { ...state, current, longest: Math.max(state.longest, current) },
      participation: 'participated',
    };
  }
  const month = monthKey(date);
  if (state.current > 0 && state.freezeUsedMonth !== month) {
    // Otomatik dondurma: seri korunur ama artmaz.
    return { state: { ...state, freezeUsedMonth: month }, participation: 'frozen' };
  }
  return { state: { ...state, current: 0 }, participation: 'missed' };
}

/** Geçmişten baştan hesaplama (ör. admin sonuçlanmış bir turu iptal ettiğinde). */
export function computeStreak(history: { date: DateStr; outcome: RoundOutcome }[]): StreakState {
  return [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .reduce((s, r) => applyRound(s, r.date, r.outcome).state, INITIAL_STREAK);
}
