import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASSETS, deriveAssetPrice, EntryRejected, entryWarnings, isFinalizable, MockPriceProvider,
  requiredSymbols, roundSchedule, settleRound, shouldAutoCancel, submitEntry,
  type AssetConfig, type SettlementQuestion,
} from '../src/index.ts';

const asset = (code: string): AssetConfig => DEFAULT_ASSETS.find((a) => a.code === code)!;
const USD = asset('USDTRY'), GOLD = asset('GOLD'), BTC = asset('BTC');
const INPUTS = { USDTTRY: 42.5, PAXGUSDT: 4100, BTCUSDT: 100000 };

describe('varlık fiyatları', () => {
  it('gram altın = PAXG/USDT × USDT/TRY ÷ 31,1035', () => {
    expect(deriveAssetPrice(GOLD, INPUTS)).toBe(5602.26);
  });

  it('doğrudan pariteler aynen alınır ve hassasiyete yuvarlanır', () => {
    expect(deriveAssetPrice(USD, { USDTTRY: 42.456 })).toBe(42.46);
    expect(deriveAssetPrice(BTC, INPUTS)).toBe(100000);
  });

  it('girdi eksik, sıfır veya geçersizse fiyat yoktur', () => {
    expect(deriveAssetPrice(GOLD, { PAXGUSDT: 4100 })).toBeNull();
    expect(deriveAssetPrice(BTC, { BTCUSDT: 0 })).toBeNull();
    expect(deriveAssetPrice(BTC, { BTCUSDT: Number.NaN })).toBeNull();
    expect(deriveAssetPrice(BTC, { BTCUSDT: null })).toBeNull();
  });

  it('admin yalnızca aktif varlıkların paritelerini girer', () => {
    expect(requiredSymbols(DEFAULT_ASSETS)).toEqual(['USDTTRY', 'PAXGUSDT', 'BTCUSDT']);
    const withEth = DEFAULT_ASSETS.map((a) => ({ ...a, active: true }));
    expect(requiredSymbols(withEth)).toEqual(['USDTTRY', 'PAXGUSDT', 'BTCUSDT', 'ETHUSDT']);
  });
});

describe('sonuç girişi ve düzeltme süresi', () => {
  const s = roundSchedule('2026-11-13');
  const at = (iso: string) => new Date(iso);

  it('18:01 İstanbul\'dan önce giriş reddedilir', () => {
    expect(() => submitEntry(s, null, INPUTS, at('2026-11-13T15:00:59Z'))).toThrow(EntryRejected);
    expect(submitEntry(s, null, INPUTS, at('2026-11-13T15:01:00Z')).finalizesAt.toISOString())
      .toBe('2026-11-13T15:16:00.000Z');
  });

  it('puanlar 15 dakika dolmadan dağıtılmaz', () => {
    const e = submitEntry(s, null, INPUTS, at('2026-11-13T15:05:00Z'));
    expect(isFinalizable(e, at('2026-11-13T15:19:59Z'))).toBe(false);
    expect(isFinalizable(e, at('2026-11-13T15:20:00Z'))).toBe(true);
    expect(isFinalizable(null, at('2026-11-13T18:00:00Z'))).toBe(false);
  });

  it('düzeltme süreyi yeniden başlatır', () => {
    const e1 = submitEntry(s, null, INPUTS, at('2026-11-13T15:05:00Z'));
    const e2 = submitEntry(s, e1, { ...INPUTS, BTCUSDT: 100500 }, at('2026-11-13T15:15:00Z'));
    expect(e2.inputs.BTCUSDT).toBe(100500);
    expect(e2.finalizesAt.toISOString()).toBe('2026-11-13T15:30:00.000Z');
  });

  it('süre dolduktan sonra düzeltme reddedilir', () => {
    const e = submitEntry(s, null, INPUTS, at('2026-11-13T15:05:00Z'));
    try {
      submitEntry(s, e, INPUTS, at('2026-11-13T15:20:00Z'));
      expect.unreachable();
    } catch (err) {
      expect((err as EntryRejected).code).toBe('already_final');
    }
  });

  it('ertesi gün 12:00\'ye kadar giriş yoksa tur otomatik iptal olur', () => {
    expect(shouldAutoCancel(s, null, at('2026-11-14T08:59:59Z'))).toBe(false);
    expect(shouldAutoCancel(s, null, at('2026-11-14T09:00:00Z'))).toBe(true);
    expect(() => submitEntry(s, null, INPUTS, at('2026-11-14T09:00:00Z'))).toThrow(EntryRejected);
  });

  it('süre sonuna yakın girilmiş bekleyen giriş iptal edilmez', () => {
    const e = submitEntry(s, null, INPUTS, at('2026-11-14T08:55:00Z'));
    expect(shouldAutoCancel(s, e, at('2026-11-14T09:05:00Z'))).toBe(false);
    expect(isFinalizable(e, at('2026-11-14T09:10:00Z'))).toBe(true);
  });
});

describe('giriş uyarıları', () => {
  const q = (a: AssetConfig, referencePrice: number): SettlementQuestion =>
    ({ asset: a, referencePrice, sigma: a.initialSigma });

  it('olağan hareket uyarı üretmez', () => {
    expect(entryWarnings([q(BTC, 99000), q(USD, 42.45)], INPUTS)).toEqual([]);
  });

  it('5σ üstü hareket ve eksik girdi uyarı üretir (ör. bir sıfır fazla)', () => {
    const w = entryWarnings([q(BTC, 99000), q(GOLD, 5600)], { BTCUSDT: 1000000, USDTTRY: 42.5 });
    expect(w.map((x) => [x.assetCode, x.kind])).toEqual([
      ['BTC', 'large_move'], ['GOLD', 'missing_input'],
    ]);
  });
});

describe('tur sonuçlandırma', () => {
  const t = (min: number) => new Date(Date.UTC(2026, 10, 12, 16, min));
  const questions: SettlementQuestion[] = [
    { asset: USD, referencePrice: 42.4, sigma: 0.0015 },
    { asset: GOLD, referencePrice: 5590, sigma: 0.009 },
    { asset: BTC, referencePrice: 99000, sigma: 0.02 },
  ];
  const users = new Map([
    ['ali', { streak: 1, isLinked: true }],
    ['ece', { streak: 7, isLinked: true }],
    ['can', { streak: 30, isLinked: false }],
  ]);
  const predictions = [
    { userId: 'ali', assetCode: 'BTC', value: 100000, submittedAt: t(1) },
    { userId: 'ece', assetCode: 'BTC', value: 102000, submittedAt: t(2) },
    { userId: 'can', assetCode: 'BTC', value: 98000, submittedAt: t(3) },
    { userId: 'ece', assetCode: 'USDTRY', value: 42.5, submittedAt: t(2) },
  ];

  it('puan, lig puanı, sıra ve rozetleri üretir', () => {
    const s = settleRound({ questions, inputs: INPUTS, predictions, users });
    expect(s.allCancelled).toBe(false);
    expect(s.questions).toEqual([
      { assetCode: 'USDTRY', status: 'finalized', resultPrice: 42.5 },
      { assetCode: 'GOLD', status: 'finalized', resultPrice: 5602.26 },
      { assetCode: 'BTC', status: 'finalized', resultPrice: 100000 },
    ]);
    const btc = Object.fromEntries(
      s.predictions.filter((p) => p.assetCode === 'BTC').map((p) => [p.userId, p]));
    expect(btc.ali).toMatchObject({ points: 100, leaguePoints: 100, rank: 1, badge: 1 });
    expect(btc.ece).toMatchObject({ points: 50, leaguePoints: 75, rank: 2, badge: 2 });
    // bağlı olmayan hesap puan alır ama sıralamaya girmez
    expect(btc.can).toMatchObject({ points: 50, leaguePoints: 100, rank: null, badge: null });
    expect(s.totals.get('ece')).toEqual({ points: 150, leaguePoints: 225 });
  });

  it('girdisi eksik soru iptal olur, diğerleri sonuçlanır', () => {
    const s = settleRound({ questions, inputs: { BTCUSDT: 100000 }, predictions, users });
    expect(s.questions.map((q) => q.status)).toEqual(['cancelled', 'cancelled', 'finalized']);
    expect(s.predictions.every((p) => p.assetCode === 'BTC')).toBe(true);
    expect(s.totals.get('ece')).toEqual({ points: 50, leaguePoints: 75 });
    expect(s.allCancelled).toBe(false);
  });

  it('admin\'in iptal ettiği soru, fiyat girilmiş olsa da puanlanmaz', () => {
    const qs = questions.map((q) => (q.asset.code === 'BTC' ? { ...q, cancelled: true } : q));
    const s = settleRound({ questions: qs, inputs: INPUTS, predictions, users });
    expect(s.questions.find((q) => q.assetCode === 'BTC')).toEqual(
      { assetCode: 'BTC', status: 'cancelled', resultPrice: null });
    expect(s.totals.has('ali')).toBe(false);
  });

  it('hiç fiyat yoksa tüm tur iptaldir', () => {
    const s = settleRound({ questions, inputs: {}, predictions, users });
    expect(s.allCancelled).toBe(true);
    expect(s.predictions).toEqual([]);
    expect(s.totals.size).toBe(0);
  });

  it('referansla aynı çıkan sonuç özel durum değildir', () => {
    const s = settleRound({
      questions: [{ asset: BTC, referencePrice: 100000, sigma: 0.02 }],
      inputs: INPUTS,
      predictions: [predictions[0]!],
      users,
    });
    expect(s.predictions[0]).toMatchObject({ deviation: 0, points: 100 });
  });
});

describe('MockPriceProvider', () => {
  it('tanımlı fiyatı döner, yoksa null', async () => {
    const p = new MockPriceProvider({ BTCUSDT: { '2026-11-13': 100000 } });
    p.set('USDTTRY', '2026-11-13', 42.5);
    expect(await p.getClose('BTCUSDT', '2026-11-13')).toBe(100000);
    expect(await p.getClose('USDTTRY', '2026-11-13')).toBe(42.5);
    expect(await p.getClose('BTCUSDT', '2026-11-14')).toBeNull();
  });
});
