import { describe, expect, it } from 'vitest';
import {
  addDays, computeSigma, deviation, leaguePoints, points, rankPredictions, streakMultiplier,
  type PricePoint,
} from '../src/index.ts';

describe('puan formülü', () => {
  it('tam isabet 100, 1σ sapma 50, 2σ sapma 25', () => {
    expect(points(0, 0.02)).toBe(100);
    expect(points(0.02, 0.02)).toBe(50);
    expect(points(0.04, 0.02)).toBe(25);
    expect(points(0.2, 0.02)).toBe(0);
  });

  it('sapma yön bağımsızdır', () => {
    expect(deviation(102, 100)).toBeCloseTo(0.02);
    expect(deviation(98, 100)).toBeCloseTo(0.02);
  });

  it('aynı yüzde sapma, oynak varlıkta daha çok puan getirir', () => {
    expect(points(0.005, 0.02)).toBeGreaterThan(points(0.005, 0.0015));
  });

  it('sigma sıfır veya negatif olamaz', () => {
    expect(() => points(0.01, 0)).toThrow();
  });
});

describe('oynaklık (σ)', () => {
  const opts = { initialSigma: 0.02, sigmaFloor: 0.002 };

  function series(changes: number[], start = '2026-01-01'): PricePoint[] {
    let price = 100;
    const out: PricePoint[] = [{ date: start, price }];
    changes.forEach((c, i) => {
      price *= 1 + c;
      out.push({ date: addDays(start, i + 1), price });
    });
    return out;
  }

  it('30 değişim birikene kadar başlangıç değeri kullanılır', () => {
    expect(computeSigma([], opts)).toBe(0.02);
    expect(computeSigma(series(Array(29).fill(0.05)), opts)).toBe(0.02);
  });

  it('30 değişim olunca mutlak değişimlerin medyanıdır', () => {
    const changes = Array.from({ length: 30 }, (_, i) => (i % 2 ? -0.01 : 0.03));
    expect(computeSigma(series(changes), opts)).toBeCloseTo(0.02, 10);
    // tek bir uç değer medyanı oynatmaz
    const withSpike = [...Array(29).fill(0.01), 0.5];
    expect(computeSigma(series(withSpike), opts)).toBeCloseTo(0.01, 10);
  });

  it('yalnızca son 30 değişime bakar', () => {
    const changes = [...Array(30).fill(0.05), ...Array(30).fill(0.01)];
    expect(computeSigma(series(changes), opts)).toBeCloseTo(0.01, 10);
  });

  it('alt sınırın altına inmez', () => {
    expect(computeSigma(series(Array(30).fill(0.0001)), opts)).toBe(0.002);
    expect(computeSigma([], { initialSigma: 0.0001, sigmaFloor: 0.002 })).toBe(0.002);
  });

  it('iptal edilen günün iki yanındaki değişim sayılmaz', () => {
    const s = series(Array(31).fill(0.01));
    s.splice(10, 1); // bir gün eksik: 31 değişimden 2'si düşer, 29 kalır
    expect(computeSigma(s, opts)).toBe(0.02);
  });
});

describe('seri çarpanı', () => {
  it('7+ gün ×1,5 ve 30+ gün ×2', () => {
    expect([0, 6, 7, 29, 30, 365].map(streakMultiplier)).toEqual([1, 1, 1.5, 1.5, 2, 2]);
  });

  it('yalnızca lig puanına uygulanır ve yuvarlanır', () => {
    expect(leaguePoints(50, 3)).toBe(50);
    expect(leaguePoints(51, 7)).toBe(77); // 76,5 → 77
    expect(leaguePoints(50, 30)).toBe(100);
  });
});

describe('sıralama ve rozet', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 10, 12, 16, min));
  const p = (userId: string, value: number, min: number, eligible = true) =>
    ({ userId, value, submittedAt: t(min), eligible });
  const byUser = (rs: ReturnType<typeof rankPredictions>) =>
    Object.fromEntries(rs.map((r) => [r.userId, r]));

  it('en yakın 3 tahmin rozet alır', () => {
    const r = byUser(rankPredictions(
      [p('a', 105, 1), p('b', 100.5, 2), p('c', 99, 3), p('d', 102, 4)], 100, 2));
    expect(r.b).toEqual({ userId: 'b', rank: 1, badge: 1 });
    expect(r.c!.badge).toBe(2);
    expect(r.d!.badge).toBe(3);
    expect(r.a).toEqual({ userId: 'a', rank: 4, badge: null });
  });

  it('eşit sapmada (üstten ve alttan) erken gönderen öne geçer', () => {
    const r = byUser(rankPredictions([p('gec', 101, 30), p('erken', 99, 5)], 100, 2));
    expect(r.erken!.rank).toBe(1);
    expect(r.gec!.rank).toBe(2);
  });

  it('eşitlik gösterim hassasiyetinde ölçülür', () => {
    // 2 hanede ikisi de 34,26 → eşit; erken gönderen kazanır
    const r = byUser(rankPredictions([p('a', 34.2649, 9), p('b', 34.26, 1)], 34.25, 2));
    expect(r.b!.rank).toBe(1);
  });

  it('bağlı olmayan hesap sıralamaya ve rozete girmez, sırayı da kaydırmaz', () => {
    const r = byUser(rankPredictions(
      [p('anonim', 100, 1, false), p('a', 101, 2), p('b', 103, 3)], 100, 2));
    expect(r.anonim).toEqual({ userId: 'anonim', rank: null, badge: null });
    expect(r.a!.badge).toBe(1);
    expect(r.b!.badge).toBe(2);
  });

  it('üçten az tahminde yalnızca olanlar rozet alır', () => {
    const r = rankPredictions([p('a', 100, 1)], 100, 2);
    expect(r).toEqual([{ userId: 'a', rank: 1, badge: 1 }]);
    expect(rankPredictions([], 100, 2)).toEqual([]);
  });
});
