export const TROY_OUNCE_GRAMS = 31.1035;

/** Sonuç fiyatının admin girdilerinden nasıl türetildiği. */
export type PriceFormula =
  | { kind: 'direct'; symbol: string }
  | { kind: 'gramGold'; ounceSymbol: string; fxSymbol: string };

export interface AssetConfig {
  code: string;
  name: string;
  unit: string;
  /** Fiyatın gösterim ve karşılaştırma hassasiyeti. */
  decimals: number;
  /** ± butonlarının adımı. */
  step: number;
  /** Yeterli geçmiş oluşana kadar kullanılan tipik günlük oynaklık (oran, 0.01 = %1). */
  initialSigma: number;
  /** Oynaklık bu değerin altına inemez. */
  sigmaFloor: number;
  /** Sonuç ekranında gösterilen kaynak adı; tur açılırken soruya kopyalanır. */
  sourceLabel: string;
  formula: PriceFormula;
  active: boolean;
  sortOrder: number;
}

export type PriceInputs = Record<string, number | null | undefined>;

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Fiyatı tam sayı "en küçük birim"e çevirir; eşitlik karşılaştırmaları bununla yapılır. */
export function toUnits(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals);
}

function valid(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** Admin girdilerinden varlığın sonuç fiyatı; girdi eksikse `null` (soru iptal olur). */
export function deriveAssetPrice(asset: AssetConfig, inputs: PriceInputs): number | null {
  const f = asset.formula;
  if (f.kind === 'direct') {
    const p = inputs[f.symbol];
    return valid(p) ? roundTo(p, asset.decimals) : null;
  }
  const ounce = inputs[f.ounceSymbol];
  const fx = inputs[f.fxSymbol];
  if (!valid(ounce) || !valid(fx)) return null;
  return roundTo((ounce * fx) / TROY_OUNCE_GRAMS, asset.decimals);
}

/** Admin'in girmesi gereken parite listesi (tekrarsız, varlık sırasıyla). */
export function requiredSymbols(assets: AssetConfig[]): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  for (const a of [...assets].sort((x, y) => x.sortOrder - y.sortOrder)) {
    if (!a.active) continue;
    if (a.formula.kind === 'direct') add(a.formula.symbol);
    else {
      add(a.formula.fxSymbol);
      add(a.formula.ounceSymbol);
    }
  }
  return out;
}

const SOURCE = 'Binance spot, 18:00 1 dk mum kapanışı';

/** Veritabanı tohum verisiyle aynı varsayılanlar (supabase/migrations). */
export const DEFAULT_ASSETS: AssetConfig[] = [
  {
    code: 'USDTRY', name: 'Dolar/TL', unit: 'TL', decimals: 2, step: 0.01,
    initialSigma: 0.0015, sigmaFloor: 0.0005, sourceLabel: `${SOURCE} (USDT/TRY)`,
    formula: { kind: 'direct', symbol: 'USDTTRY' }, active: true, sortOrder: 1,
  },
  {
    code: 'GOLD', name: 'Gram altın (spot)', unit: 'TL', decimals: 2, step: 1,
    initialSigma: 0.009, sigmaFloor: 0.002, sourceLabel: `${SOURCE} (PAXG/USDT × USDT/TRY ÷ 31,1035)`,
    formula: { kind: 'gramGold', ounceSymbol: 'PAXGUSDT', fxSymbol: 'USDTTRY' }, active: true, sortOrder: 2,
  },
  {
    code: 'BTC', name: 'Bitcoin', unit: 'USDT', decimals: 2, step: 10,
    initialSigma: 0.02, sigmaFloor: 0.002, sourceLabel: `${SOURCE} (BTC/USDT)`,
    formula: { kind: 'direct', symbol: 'BTCUSDT' }, active: true, sortOrder: 3,
  },
  {
    code: 'ETH', name: 'Ethereum', unit: 'USDT', decimals: 2, step: 1,
    initialSigma: 0.028, sigmaFloor: 0.002, sourceLabel: `${SOURCE} (ETH/USDT)`,
    formula: { kind: 'direct', symbol: 'ETHUSDT' }, active: false, sortOrder: 4,
  },
];
