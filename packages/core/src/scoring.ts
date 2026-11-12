import { toUnits } from './assets.ts';
import { daysBetween, type DateStr } from './time.ts';

export const MAX_POINTS = 100;
export const SIGMA_WINDOW = 30;
export const BADGE_COUNT = 3;

/** Yüzde sapma (oran): |tahmin − sonuç| ÷ sonuç. */
export function deviation(prediction: number, result: number): number {
  return Math.abs(prediction - result) / result;
}

/** 100 × 2^(−sapma ÷ σ): tam isabet 100, bir tipik günlük hareket kadar sapma 50. */
export function points(dev: number, sigma: number): number {
  if (!(sigma > 0)) throw new Error('sigma pozitif olmalı');
  return Math.round(MAX_POINTS * 2 ** (-dev / sigma));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface PricePoint {
  date: DateStr;
  price: number;
}

/**
 * Tipik günlük oynaklık: son 30 günlük mutlak yüzde değişimin medyanı.
 * Yalnızca ardışık günler arasındaki değişimler sayılır (iptal edilen gün
 * iki günlük hareketi tek güne yazmasın). 30 değişim birikene kadar
 * admin'in girdiği başlangıç değeri kullanılır.
 */
export function computeSigma(
  history: PricePoint[],
  opts: { initialSigma: number; sigmaFloor: number; window?: number },
): number {
  const window = opts.window ?? SIGMA_WINDOW;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const changes: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (daysBetween(prev.date, cur.date) === 1 && prev.price > 0) {
      changes.push(Math.abs(cur.price / prev.price - 1));
    }
  }
  const recent = changes.slice(-window);
  const sigma = recent.length < window ? opts.initialSigma : median(recent);
  return Math.max(sigma, opts.sigmaFloor);
}

/** Seri çarpanı yalnızca lig puanına uygulanır. */
export function streakMultiplier(streak: number): number {
  if (streak >= 30) return 2;
  if (streak >= 7) return 1.5;
  return 1;
}

export function leaguePoints(rawPoints: number, streak: number): number {
  return Math.round(rawPoints * streakMultiplier(streak));
}

export interface RankInput {
  userId: string;
  value: number;
  /** Tahminin son değiştirildiği an (sunucu saati). */
  submittedAt: Date;
  /** Yalnızca Apple/Google bağlı hesaplar sıralamaya ve rozete girer. */
  eligible: boolean;
}

export interface RankOutput {
  userId: string;
  rank: number | null;
  /** 1, 2, 3 = günün en yakın tahminleri. */
  badge: 1 | 2 | 3 | null;
}

/**
 * En küçük sapma önce; eşitlikte tahminini daha erken gönderen öne geçer.
 * Sapma, varlığın gösterim hassasiyetinde tam sayı olarak karşılaştırılır.
 */
export function rankPredictions(preds: RankInput[], result: number, decimals: number): RankOutput[] {
  const target = toUnits(result, decimals);
  const dist = (p: RankInput) => Math.abs(toUnits(p.value, decimals) - target);
  const ordered = preds
    .filter((p) => p.eligible)
    .sort(
      (a, b) =>
        dist(a) - dist(b) ||
        a.submittedAt.getTime() - b.submittedAt.getTime() ||
        a.userId.localeCompare(b.userId),
    );
  const rankOf = new Map(ordered.map((p, i) => [p.userId, i + 1]));
  return preds.map((p) => {
    const rank = rankOf.get(p.userId) ?? null;
    const badge = rank !== null && rank <= BADGE_COUNT ? (rank as 1 | 2 | 3) : null;
    return { userId: p.userId, rank, badge };
  });
}
