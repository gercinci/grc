import { describe, expect, it } from 'vitest';
import {
  addDays, applyRound, computeStreak, INITIAL_STREAK, roundOutcome, type RoundOutcome,
} from '../src/index.ts';

function run(start: string, outcomes: RoundOutcome[]) {
  return computeStreak(outcomes.map((outcome, i) => ({ date: addDays(start, i), outcome })));
}
const P = 'participated', M = 'missed', V = 'void';

describe('seri', () => {
  it('isabete değil katılıma bağlıdır', () => {
    expect(roundOutcome(1, false)).toBe('participated');
    expect(roundOutcome(0, false)).toBe('missed');
    expect(roundOutcome(3, true)).toBe('void');
    expect(roundOutcome(0, true)).toBe('void');
  });

  it('her katılımda artar, en uzun seri korunur', () => {
    const s = run('2026-11-01', [P, P, P, M, M, P]);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(3);
  });

  it('kaçırılan ilk gün otomatik dondurulur: seri korunur ama artmaz', () => {
    const r = applyRound({ current: 5, longest: 5, freezeUsedMonth: null }, '2026-11-10', 'missed');
    expect(r.participation).toBe('frozen');
    expect(r.state).toEqual({ current: 5, longest: 5, freezeUsedMonth: '2026-11' });
  });

  it('aynı ay ikinci kaçırma seriyi sıfırlar', () => {
    const s = run('2026-11-01', [P, P, M, P, M]);
    expect(s.current).toBe(0);
    expect(s.longest).toBe(3);
  });

  it('hak takvim ayı başında yenilenir', () => {
    // 29 Kasım kaçırıldı (dondurma), 1 Aralık kaçırıldı (yeni ayın hakkı)
    const s = run('2026-11-27', [P, P, M, P, M, P]);
    expect(s.current).toBe(4);
    expect(s.freezeUsedMonth).toBe('2026-12');
  });

  it('hak birikmez: kullanılmayan ayın hakkı sonraki aya devretmez', () => {
    // Kasım'da hiç kullanılmadı; Aralık'ta iki kaçırma → ikincisi seriyi bozar
    const s = run('2026-11-29', [P, P, M, P, M]);
    expect(s.current).toBe(0);
  });

  it('seri yokken kaçırmak dondurma hakkını harcamaz', () => {
    const r = applyRound(INITIAL_STREAK, '2026-11-10', 'missed');
    expect(r.participation).toBe('missed');
    expect(r.state.freezeUsedMonth).toBeNull();
  });

  it('iptal edilen tur seriyi ne bozar ne artırır, hakkı da harcamaz', () => {
    const s = run('2026-11-01', [P, P, V, V, P]);
    expect(s).toEqual({ current: 3, longest: 3, freezeUsedMonth: null });
  });

  it('hafta sonu da hafta içi gibi sayılır', () => {
    // 2026-11-13 cuma → 16 pazartesi; cumartesi kaçırılır, pazar kaçırılır
    const s = run('2026-11-13', [P, M, M, P]);
    expect(s.current).toBe(1);
  });

  it('sonradan iptal edilen tur geçmişten yeniden hesaplanınca seriyi geri getirir', () => {
    const before = run('2026-11-01', [P, P, M, M, P]);
    const after = run('2026-11-01', [P, P, M, V, P]);
    expect(before.current).toBe(1);
    expect(after.current).toBe(3);
  });
});
