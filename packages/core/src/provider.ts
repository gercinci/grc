import type { DateStr } from './time.ts';

/**
 * Sonuç fiyatlarının kaynağı. MVP'de fiyatları admin elle girer
 * (ManualPriceProvider, aşama c); arayüz ileride otomasyon için ayrılmıştır.
 */
export interface PriceProvider {
  /** `date` günü 18:00:00 (İstanbul) 1 dakikalık mumun kapanışı; yoksa `null`. */
  getClose(symbol: string, date: DateStr): Promise<number | null>;
}

/** Geliştirme ve testler için sabit fiyat tablosu. */
export class MockPriceProvider implements PriceProvider {
  constructor(private readonly prices: Record<string, Record<DateStr, number>> = {}) {}

  set(symbol: string, date: DateStr, price: number): void {
    (this.prices[symbol] ??= {})[date] = price;
  }

  async getClose(symbol: string, date: DateStr): Promise<number | null> {
    return this.prices[symbol]?.[date] ?? null;
  }
}
