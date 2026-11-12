# Tahmintor

Günlük fiyat tahmin oyunu. Gerçek para yok; puan, seri ve lig var.
Bu bir tahmin oyunudur, yatırım tavsiyesi değildir.

## Kurallar (özet)

- Her gün aynı varlıklar sorulur: Dolar/TL, Gram altın (spot), Bitcoin. Hafta sonu / tatil ayrımı yoktur.
- Tur, önceki sonuç kesinleşince açılır; tahminler **12:00**'de kilitlenir; sonuç **18:00** (Europe/Istanbul)
  Binance spot 1 dakikalık mum kapanışıdır.
- Sonucu admin 18:01'den itibaren girer. Giriş 15 dakika düzeltilebilir (her düzeltme süreyi yeniden başlatır),
  sonra puanlar dağıtılır. Ertesi gün 12:00'ye kadar giriş yoksa tur iptal olur, kimsenin serisi bozulmaz.
- Puan: `100 × 2^(−sapma ÷ σ)`. σ, varlığın son 30 günlük mutlak yüzde değişiminin medyanıdır.
- Seri katılıma bağlıdır. Ayda 1 otomatik dondurma. Çarpan (7+ gün ×1,5, 30+ gün ×2) yalnızca lig puanına uygulanır.
- En yakın 3 tahmin rozet alır; eşitlikte erken gönderen öndedir. Sıralama ve rozet için Apple/Google bağlı hesap gerekir.
- Başkalarının tahminleri ancak sonuç kesinleşince görünür.

## Depo yapısı

| Yol | İçerik |
|---|---|
| `packages/core` | Saf TypeScript oyun mantığı (tur takvimi, puan, seri, sonuçlandırma) ve birim testleri |
| `supabase/migrations` | Veritabanı şeması, kilit tetikleyicisi, satır güvenliği kuralları |
| `supabase/tests` | Veritabanı kurallarının testleri |

## Testler

```bash
npm install
npm test            # hepsi
npm run test:core   # oyun mantığı (Node 20+)
npm run test:db     # veritabanı kuralları (yerelde PostgreSQL 16+ gerekir)
```

Yerelde PostgreSQL yoksa boş bir test veritabanı adresi verilebilir:
`TEST_DATABASE_URL=postgres://... npm run test:db`. Canlı veritabanına karşı çalıştırmayın.

## Aşamalar

- [x] (a) Veri modeli, oyun mantığı, testler
- [ ] (b) Tahmin ve sonuç ekranları (mock veri)
- [ ] (c) Admin sayfası ve zamanlanmış görevler
- [ ] (d) Ligler, günün tablosu, profiller, şikâyet, paylaşım kartı
- [ ] (e) Bildirimler
- [ ] (f) Mağaza hazırlığı
