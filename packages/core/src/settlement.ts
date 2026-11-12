import { deriveAssetPrice, type AssetConfig, type PriceInputs } from './assets.ts';
import type { RoundSchedule } from './rounds.ts';
import { deviation, leaguePoints, points, rankPredictions } from './scoring.ts';

export const CORRECTION_WINDOW_MS = 15 * 60 * 1000;
/** Referansa göre bu kadar σ'dan büyük hareket, girişte ek uyarı üretir. */
export const WARNING_SIGMAS = 5;

export interface ResultEntry {
  inputs: PriceInputs;
  enteredAt: Date;
  /** Puanlar bu anda dağıtılır; o ana kadar admin düzeltebilir. */
  finalizesAt: Date;
}

export type EntryError = 'too_early' | 'deadline_passed' | 'already_final';

export class EntryRejected extends Error {
  constructor(public readonly code: EntryError) {
    super(code);
  }
}

/**
 * Sonuç girişi veya düzeltmesi. Her düzeltme 15 dakikalık süreyi yeniden başlatır;
 * süre dolduktan sonra giriş değiştirilemez (yalnızca iptal mümkündür).
 */
export function submitEntry(
  schedule: RoundSchedule,
  existing: ResultEntry | null,
  inputs: PriceInputs,
  now: Date,
): ResultEntry {
  const t = now.getTime();
  if (t < schedule.entryOpensAt.getTime()) throw new EntryRejected('too_early');
  if (existing) {
    if (t >= existing.finalizesAt.getTime()) throw new EntryRejected('already_final');
  } else if (t >= schedule.entryDeadline.getTime()) {
    throw new EntryRejected('deadline_passed');
  }
  return { inputs, enteredAt: now, finalizesAt: new Date(t + CORRECTION_WINDOW_MS) };
}

export function isFinalizable(entry: ResultEntry | null, now: Date): boolean {
  return entry !== null && now.getTime() >= entry.finalizesAt.getTime();
}

/** Admin ertesi gün 12:00'ye kadar hiç sonuç girmediyse tur iptal edilir. */
export function shouldAutoCancel(schedule: RoundSchedule, entry: ResultEntry | null, now: Date): boolean {
  return entry === null && now.getTime() >= schedule.entryDeadline.getTime();
}

export interface SettlementQuestion {
  asset: AssetConfig;
  referencePrice: number | null;
  /** Tur açılırken dondurulmuş oynaklık. */
  sigma: number;
  /** Admin tarafından önceden iptal edilmişse. */
  cancelled?: boolean;
}

export interface EntryWarning {
  assetCode: string;
  kind: 'missing_input' | 'large_move';
  /** Referansa göre değişim (oran), `large_move` için. */
  change?: number;
}

/** "Emin misin" onayında gösterilecek uyarılar: eksik girdi ve olağan dışı hareket. */
export function entryWarnings(questions: SettlementQuestion[], inputs: PriceInputs): EntryWarning[] {
  const out: EntryWarning[] = [];
  for (const q of questions) {
    if (q.cancelled) continue;
    const price = deriveAssetPrice(q.asset, inputs);
    if (price === null) {
      out.push({ assetCode: q.asset.code, kind: 'missing_input' });
    } else if (q.referencePrice) {
      const change = price / q.referencePrice - 1;
      if (Math.abs(change) > WARNING_SIGMAS * q.sigma) {
        out.push({ assetCode: q.asset.code, kind: 'large_move', change });
      }
    }
  }
  return out;
}

export interface SettlementPrediction {
  userId: string;
  assetCode: string;
  value: number;
  submittedAt: Date;
}

export interface SettlementUser {
  /** Bu tur dahil seri uzunluğu (çarpan buna göre). */
  streak: number;
  /** Apple/Google bağlı hesap mı (sıralama ve rozet şartı). */
  isLinked: boolean;
}

export interface QuestionResult {
  assetCode: string;
  status: 'finalized' | 'cancelled';
  resultPrice: number | null;
}

export interface PredictionResult {
  userId: string;
  assetCode: string;
  deviation: number;
  points: number;
  leaguePoints: number;
  rank: number | null;
  badge: 1 | 2 | 3 | null;
}

export interface Settlement {
  questions: QuestionResult[];
  predictions: PredictionResult[];
  /** Kullanıcı başına bu turdan kazanılan toplamlar. */
  totals: Map<string, { points: number; leaguePoints: number }>;
  /** Tüm sorular iptal: tur seri açısından yok sayılır. */
  allCancelled: boolean;
}

/**
 * Kesinleşen girişten turun tüm sonuçlarını üretir. Saf fonksiyondur;
 * veritabanına yazma işini çağıran taraf (Edge Function) yapar.
 */
export function settleRound(args: {
  questions: SettlementQuestion[];
  inputs: PriceInputs;
  predictions: SettlementPrediction[];
  users: Map<string, SettlementUser>;
}): Settlement {
  const questions: QuestionResult[] = [];
  const predictions: PredictionResult[] = [];
  const totals = new Map<string, { points: number; leaguePoints: number }>();

  for (const q of args.questions) {
    const code = q.asset.code;
    const resultPrice = q.cancelled ? null : deriveAssetPrice(q.asset, args.inputs);
    if (resultPrice === null) {
      questions.push({ assetCode: code, status: 'cancelled', resultPrice: null });
      continue;
    }
    questions.push({ assetCode: code, status: 'finalized', resultPrice });

    const preds = args.predictions.filter((p) => p.assetCode === code);
    const ranks = new Map(
      rankPredictions(
        preds.map((p) => ({
          userId: p.userId,
          value: p.value,
          submittedAt: p.submittedAt,
          eligible: args.users.get(p.userId)?.isLinked ?? false,
        })),
        resultPrice,
        q.asset.decimals,
      ).map((r) => [r.userId, r]),
    );

    for (const p of preds) {
      const dev = deviation(p.value, resultPrice);
      const raw = points(dev, q.sigma);
      const lp = leaguePoints(raw, args.users.get(p.userId)?.streak ?? 0);
      const r = ranks.get(p.userId)!;
      predictions.push({
        userId: p.userId, assetCode: code, deviation: dev, points: raw,
        leaguePoints: lp, rank: r.rank, badge: r.badge,
      });
      const t = totals.get(p.userId) ?? { points: 0, leaguePoints: 0 };
      t.points += raw;
      t.leaguePoints += lp;
      totals.set(p.userId, t);
    }
  }

  return {
    questions,
    predictions,
    totals,
    allCancelled: questions.every((q) => q.status === 'cancelled'),
  };
}
