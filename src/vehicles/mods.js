// MODİFİYE ALTYAPISI
// -------------------------------------------------------------------------------------
// Modifiye atölyesi henüz oyunda açık değil; ancak veri modeli ve araç üreticisi (builder.js)
// aşağıdaki alanları şimdiden okur. Atölye eklenirken yapılacaklar:
//   1) MOD_SLOTS'a yeni bir yuva ekleyin (veya mevcut seçenekleri genişletin).
//   2) Görsel bir yuvaysa builder.js > buildVehicleMesh içinde `mods.<id>` değerini kullanın.
//   3) Performans yuvasıysa aşağıdaki effectivePerf içinde hesaba katın.
// Arayüz, MOD_SLOTS'u okuyarak otomatik üretilebilir (type: 'color' | 'choice' | 'range').
// Seçimler araç başına localStorage'da saklanır (loadMods / saveMods).
import { STORAGE } from '../config.js';

export const MOD_SLOTS = [
  { id: 'paint', label: 'Boya', type: 'color', default: null }, // null => aracın fabrika rengi
  { id: 'rimColor', label: 'Jant rengi', type: 'color', default: '#b9bcc0' },
  { id: 'rimStyle', label: 'Jant', type: 'choice', default: 'stock', options: [
    { id: 'stock', label: 'Orijinal' },
    { id: 'steel', label: 'Sac jant' },
    { id: 'spoke', label: 'Çelik jant' },
  ] },
  { id: 'rideHeight', label: 'Süspansiyon', type: 'range', min: -0.12, max: 0.06, step: 0.01, default: 0 }, // metre; eksi = basık
  { id: 'spoiler', label: 'Spoiler', type: 'choice', default: 'none', options: [
    { id: 'none', label: 'Yok' },
    { id: 'lip', label: 'Bagaj ucu' },
    { id: 'wing', label: 'Kanat' },
  ] },
  { id: 'tint', label: 'Cam filmi', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35 },
  { id: 'neon', label: 'Alt neon', type: 'color', default: null },
  { id: 'plate', label: 'Plaka', type: 'text', default: null },
  // Performans (çarpanlar)
  { id: 'engine', label: 'Motor', type: 'range', min: 1, max: 1.6, step: 0.05, default: 1 },
  { id: 'tires', label: 'Lastik', type: 'range', min: 1, max: 1.3, step: 0.05, default: 1 },
  { id: 'brakes', label: 'Fren', type: 'range', min: 1, max: 1.4, step: 0.05, default: 1 },
];

export function defaultMods() {
  const m = {};
  for (const s of MOD_SLOTS) m[s.id] = s.default;
  return m;
}

function readAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE.mods) || '{}'); } catch { return {}; }
}

export function loadMods(vehicleId) {
  return { ...defaultMods(), ...(readAll()[vehicleId] || {}) };
}

export function saveMods(vehicleId, mods) {
  const all = readAll();
  all[vehicleId] = mods;
  try { localStorage.setItem(STORAGE.mods, JSON.stringify(all)); } catch { /* depolama kapalı olabilir */ }
}

// Fabrika değerleri + modifiye çarpanları = sürüşte kullanılan performans.
export function effectivePerf(spec, mods) {
  const p = spec.perf;
  return {
    ...p,
    power: p.power * (mods.engine || 1),
    topSpeed: p.topSpeed * (1 + ((mods.engine || 1) - 1) * 0.5),
    grip: p.grip * (mods.tires || 1) * (1 + Math.max(0, -(mods.rideHeight || 0)) * 0.6),
    brake: p.brake * (mods.brakes || 1),
  };
}
