import { describe, expect, it } from 'vitest';
import {
  addDays, canSubmitPrediction, istanbulDate, istanbulInstant, resolveRoundOpening,
  roundSchedule, weekStart,
} from '../src/index.ts';

describe('saat dilimi', () => {
  it('İstanbul 18:00 = 15:00 UTC', () => {
    expect(istanbulInstant('2026-11-12', 18).toISOString()).toBe('2026-11-12T15:00:00.000Z');
  });

  it('UTC gece yarısından önceki an İstanbul\'da ertesi gündür', () => {
    expect(istanbulDate(new Date('2026-11-12T21:30:00Z'))).toBe('2026-11-13');
    expect(istanbulDate(new Date('2026-11-12T20:59:59Z'))).toBe('2026-11-12');
  });

  it('sabit ofset varsaymaz: 2015 yazında İstanbul UTC+3, kışında UTC+2 idi', () => {
    expect(istanbulInstant('2015-07-01', 18).toISOString()).toBe('2015-07-01T15:00:00.000Z');
    expect(istanbulInstant('2015-01-15', 18).toISOString()).toBe('2015-01-15T16:00:00.000Z');
  });

  it('ay ve yıl sınırında gün ekler', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('lig haftası pazartesi 00:00 İstanbul\'da döner', () => {
    // 2026-11-16 pazartesi. Pazar 23:59 İstanbul = 20:59 UTC.
    expect(weekStart(new Date('2026-11-15T20:59:00Z'))).toBe('2026-11-09');
    expect(weekStart(new Date('2026-11-15T21:00:00Z'))).toBe('2026-11-16');
    expect(weekStart(new Date('2026-11-18T10:00:00Z'))).toBe('2026-11-16');
  });
});

describe('tur takvimi', () => {
  const s = roundSchedule('2026-11-13');

  it('kilit 12:00, sonuç 18:00, giriş 18:01, son giriş ertesi gün 12:00', () => {
    expect(s.nominalOpensAt.toISOString()).toBe('2026-11-12T15:00:00.000Z');
    expect(s.locksAt.toISOString()).toBe('2026-11-13T09:00:00.000Z');
    expect(s.resultAt.toISOString()).toBe('2026-11-13T15:00:00.000Z');
    expect(s.entryOpensAt.toISOString()).toBe('2026-11-13T15:01:00.000Z');
    expect(s.entryDeadline.toISOString()).toBe('2026-11-14T09:00:00.000Z');
  });

  it('hafta sonu ve hafta içi aynı takvimi izler', () => {
    const sat = roundSchedule('2026-11-14');
    const mon = roundSchedule('2026-11-16');
    for (const r of [sat, mon]) {
      expect(r.resultAt.getTime() - r.locksAt.getTime()).toBe(6 * 3600_000);
      expect(r.entryDeadline.getTime() - r.resultAt.getTime()).toBe(18 * 3600_000);
    }
  });

  it('tahmin yalnızca açılış ile kilit arasında kabul edilir', () => {
    const round = { opensAt: new Date('2026-11-12T15:20:00Z'), locksAt: s.locksAt };
    expect(canSubmitPrediction(round, new Date('2026-11-12T15:19:59Z'))).toBe(false);
    expect(canSubmitPrediction(round, new Date('2026-11-12T15:20:00Z'))).toBe(true);
    expect(canSubmitPrediction(round, new Date('2026-11-13T08:59:59.999Z'))).toBe(true);
    expect(canSubmitPrediction(round, new Date('2026-11-13T09:00:00Z'))).toBe(false);
    expect(canSubmitPrediction({ ...round, opensAt: null }, new Date('2026-11-13T08:00:00Z'))).toBe(false);
    expect(canSubmitPrediction({ ...round, cancelled: true }, new Date('2026-11-13T08:00:00Z'))).toBe(false);
  });

  it('yeni tur önceki tur kesinleşince açılır', () => {
    const o = resolveRoundOpening(new Date('2026-11-12T15:20:00Z'), s);
    expect(o.void).toBe(false);
    expect(o.opensAt.toISOString()).toBe('2026-11-12T15:20:00.000Z');
  });

  it('önceki tur kilit saatinde veya sonra kapanırsa tur yok sayılır', () => {
    expect(resolveRoundOpening(s.locksAt, s).void).toBe(true);
    expect(resolveRoundOpening(new Date(s.locksAt.getTime() - 1), s).void).toBe(false);
  });
});
