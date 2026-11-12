import { addDays, istanbulInstant, type DateStr } from './time.ts';

export const LOCK_HOUR = 12;
export const RESULT_HOUR = 18;

export interface RoundSchedule {
  /** Turun kimliği: sonucun ait olduğu İstanbul günü. */
  resultDate: DateStr;
  /** Önceki tur gecikmesiz kesinleşirse beklenen açılış (bilgi amaçlı). */
  nominalOpensAt: Date;
  /** Tahminler bu anda kilitlenir (12:00). */
  locksAt: Date;
  /** Sonuç fiyatının ait olduğu an (18:00:00 mumu). */
  resultAt: Date;
  /** Admin en erken bu anda sonuç girebilir (18:00 mumu 18:01'de kapanır). */
  entryOpensAt: Date;
  /** Bu ana kadar sonuç girilmezse tur otomatik iptal edilir (ertesi gün 12:00). */
  entryDeadline: Date;
}

/**
 * Her gün aynı kural: hafta sonu / tatil ayrımı yoktur (pariteler 7/24 işlem görür).
 */
export function roundSchedule(resultDate: DateStr): RoundSchedule {
  const resultAt = istanbulInstant(resultDate, RESULT_HOUR);
  return {
    resultDate,
    nominalOpensAt: istanbulInstant(addDays(resultDate, -1), RESULT_HOUR),
    locksAt: istanbulInstant(resultDate, LOCK_HOUR),
    resultAt,
    entryOpensAt: new Date(resultAt.getTime() + 60_000),
    entryDeadline: istanbulInstant(addDays(resultDate, 1), LOCK_HOUR),
  };
}

export function nextRoundDate(resultDate: DateStr): DateStr {
  return addDays(resultDate, 1);
}

export interface RoundOpening {
  opensAt: Date;
  /**
   * Önceki tur o kadar geç kapandı ki bu turun tahmin penceresi kalmadı.
   * Tur yok sayılır (kimsenin serisi etkilenmez) ve sıradaki tur hemen açılır.
   */
  void: boolean;
}

/** Yeni tur, önceki turun kesinleştiği (veya iptal edildiği) anda açılır. */
export function resolveRoundOpening(previousClosedAt: Date, next: RoundSchedule): RoundOpening {
  return {
    opensAt: previousClosedAt,
    void: previousClosedAt.getTime() >= next.locksAt.getTime(),
  };
}

/** Sunucu saatine göre tahmin gönderilebilir / değiştirilebilir mi? */
export function canSubmitPrediction(
  round: { opensAt: Date | null; locksAt: Date; cancelled?: boolean },
  now: Date,
): boolean {
  if (round.cancelled || !round.opensAt) return false;
  const t = now.getTime();
  return t >= round.opensAt.getTime() && t < round.locksAt.getTime();
}
