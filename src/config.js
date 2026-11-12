// Genel oyun ayarları ve İstanbul konumları.
export const GAME_TITLE = 'Piyasa İstanbul';
export const EARTH_RADIUS = 6371000;

// Hava durumu sorgusu için şehir merkezi.
export const CITY = { lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' };

// İstanbul'da deniz yüzeyinin WGS84 elipsoidine göre yaklaşık yüksekliği (jeoit ondülasyonu, m).
// Gerekirse adres çubuğundan ?sea=36.5 gibi bir değerle ince ayar yapılabilir.
export const SEA_ELLIPSOID_HEIGHT = 37.0;

// Başlangıç / ışınlanma noktaları. heading: derece, kuzeyden saat yönünde.
export const LOCATIONS = [
  { id: 'taksim', name: 'Taksim Meydanı', lat: 41.03687, lon: 28.9851, heading: 200 },
  { id: 'eminonu', name: 'Eminönü · Galata Köprüsü', lat: 41.0176, lon: 28.9713, heading: 20 },
  { id: 'sultanahmet', name: 'Sultanahmet Meydanı', lat: 41.0064, lon: 28.9766, heading: 40 },
  { id: 'ortakoy', name: 'Ortaköy Sahil', lat: 41.0476, lon: 29.0262, heading: 60 },
  { id: 'bebek', name: 'Bebek Sahil Yolu', lat: 41.077, lon: 29.0436, heading: 10 },
  { id: 'kopru', name: '15 Temmuz Şehitler Köprüsü', lat: 41.0453, lon: 29.0342, heading: 115 },
  { id: 'kadikoy', name: 'Kadıköy İskele', lat: 40.9913, lon: 29.0233, heading: 90 },
  { id: 'bagdat', name: 'Bağdat Caddesi', lat: 40.9633, lon: 29.065, heading: 110 },
];

export const QUALITY = {
  low: { label: 'Düşük', errorTarget: 28, pixelRatio: 1 },
  medium: { label: 'Dengeli', errorTarget: 16, pixelRatio: 1.5 },
  high: { label: 'Yüksek', errorTarget: 8, pixelRatio: 2 },
};

export const STORAGE = {
  apiKey: 'piyasa.googleKey',
  car: 'piyasa.car',
  location: 'piyasa.location',
  quality: 'piyasa.quality',
  mods: 'piyasa.mods',
};

export function envApiKey() {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

export const isTouchDevice = () =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Yerel koordinat sistemi: +Y yukarı, +Z kuzey, +X batı (3d-tiles-renderer OBJECT_FRAME ile aynı).
// heading (derece, kuzeyden saat yönünde) -> yerel yatay birim vektör
export function headingToDir(deg, target) {
  const r = (deg * Math.PI) / 180;
  return target.set(-Math.sin(r), 0, Math.cos(r));
}
