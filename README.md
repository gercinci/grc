# Piyasa İstanbul

Gerçek 3B İstanbul'da geçen, tarayıcıda çalışan açık dünya gezinti oyunu. İster yürü, ister
Türkiye sokaklarına özgü bir araca atla. Görev yok; sadece şehir, yol ve hava.

- **Harita:** Google Photorealistic 3D Tiles (Map Tiles API) — İstanbul'un fotogerçekçi 3B modeli
  doğrudan Google sunucularından akar.
- **Canlı hava:** Open-Meteo'dan İstanbul'un anlık hava durumu ve gerçek güneş konumu. Yağmurda
  yollar ıslanır, su birikintileri gökyüzünü yansıtır ve **lastik tutuşu düşer**; karda zemin beyazlar;
  rüzgâr arttıkça deniz dalgalanır ve köpürür; sis, bulut, gece/gündüz ve fırtına şimşekleri vardır.
- **Araçlar:** Şahin, Doğan SLX, Kartal, Toros, Anadol, Sarı Taksi, Dolmuş, Yerli Elektrikli SUV
  (stilize, markasız modeller).
- **Her cihazda:** bilgisayar (klavye + fare), telefon ve tablet (dokunmatik joystick + düğmeler).

## Çalıştırma

```bash
npm install
cp .env.example .env      # içine Google API anahtarını yazın
npm run dev
```

Anahtar `.env` içinde yoksa oyun açılışta sorar (yalnızca o cihazın tarayıcısında saklanır) ya da
"demo" seçeneğiyle 2B harita zemini üzerinde denenebilir.

### Google API anahtarı

1. [Google Cloud Console](https://console.cloud.google.com/)'da bir proje açın, faturalandırmayı etkinleştirin.
2. **Map Tiles API**'yi etkinleştirin ve bir API anahtarı oluşturun.
3. Anahtarı **HTTP referrer** ile sitenizin alan adına (ör. `https://piyasa-istanbul.vercel.app/*`)
   ve yalnızca Map Tiles API'ye kısıtlayın. Anahtar tarayıcıya gönderildiği için bu kısıtlama şarttır.
4. Kullanım ücretlidir (aylık ücretsiz kota vardır); Cloud Console'dan kota/bütçe sınırı koymanız önerilir.

## Yayınlama

### Vercel (önerilen)

1. [vercel.com/new](https://vercel.com/new) → bu GitHub deposunu içe aktarın (Vite otomatik algılanır).
2. *Environment Variables* altına `VITE_GOOGLE_MAPS_API_KEY` ekleyin.
3. **Deploy**. Sonraki her `git push` otomatik yayınlanır.

### GitHub Pages (alternatif)

`.github/workflows/pages.yml` hazırdır: *Settings → Pages → Source: GitHub Actions* seçin,
`VITE_GOOGLE_MAPS_API_KEY` secret'ını ekleyin ve `main` dalına gönderin (ya da iş akışını elle çalıştırın).

## Kontroller

| | Klavye / fare | Dokunmatik |
|---|---|---|
| Yürü / sür | W A S D veya ok tuşları | Sol joystick, Gaz / Fren |
| Kamera | Fare | Ekranın sağ yarısını sürükle |
| Araca bin / in | F | Bin / İn |
| Koş · Zıpla | Shift · Boşluk | Koş · Zıpla |
| El freni · Korna | Boşluk · H | El freni · Korna |
| Far · Kamera mesafesi | L · C | — |
| Kurtar (sıkışınca) | R | — |
| Menü (ışınlan, araç çağır, hava, kalite) | Esc | ☰ |

Adres çubuğu seçenekleri: `?demo=1`, `?autostart=1`, `?loc=ortakoy`, `?car=dogan`, `?mode=foot`,
`?weather=rain`, `?time=night`, `?sea=37` (deniz seviyesi ince ayarı, m).

## Proje yapısı

```
src/
  main.js                 oyun döngüsü, arayüz bağlantıları
  config.js               konumlar, kalite ayarları
  world/
    googleWorld.js        Google 3D karoları (3d-tiles-renderer)
    flatWorld.js          anahtarsız demo zemini
    terrainMaterial.js    ıslak yol / kar / deniz / gece / far shader'ı
    environment.js        hava + saat -> gökyüzü, ışık, sis, tutuş
    weather.js            Open-Meteo, güneş konumu
    sky.js                gökyüzü, bulut, yağmur ve kar
  game/                   oyuncu, araç fiziği, kamera, giriş, ses
  vehicles/
    catalog.js            ARAÇ LİSTESİ — yeni araç = yeni kayıt
    mods.js               MODİFİYE ALTYAPISI (yuvalar, kayıt, performans çarpanları)
    builder.js            katalog + modifiye -> 3B model
```

### Yeni araç eklemek

`src/vehicles/catalog.js` içine ölçüleri, gövde tipi, renkleri ve performansıyla bir kayıt ekleyin;
model otomatik üretilir.

### Modifiye (sıradaki adım)

Atölye arayüzü henüz yok ama altyapı hazır: `mods.js` içindeki `MOD_SLOTS` (boya, jant, süspansiyon
yüksekliği, spoiler, cam filmi, alt neon, plaka, motor/lastik/fren çarpanları) `builder.js` ve araç
fiziği tarafından şimdiden okunuyor. Atölye, `MOD_SLOTS`'tan form üretip `saveMods()` +
`vehicle.applyMods()` çağırarak eklenebilir.

## Bilinen sınırlar

- Fotogrametri karolarında yollar ile üzerlerindeki park hâlindeki araç/ağaç izleri tek yüzeydir;
  çarpışma bu yüzeye ışın atılarak yapılır, bu yüzden yer yer tümsek hissedilir.
- Deniz, karolardaki su yüzeyinin yükseklik + renk ile algılanıp canlandırılmasıyla çizilir; araçlar
  şimdilik suyun üzerinde gidebilir.
- Harita ve atıflar: © Google. Hava verisi: Open-Meteo.
