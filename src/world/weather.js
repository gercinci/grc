// Güncel İstanbul hava durumu (Open-Meteo, anahtar gerektirmez) ve güneş konumu.
import { CITY } from '../config.js';

const URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${CITY.lat}&longitude=${CITY.lon}` +
  '&current=temperature_2m,is_day,precipitation,rain,snowfall,weather_code,cloud_cover,' +
  'wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=Europe%2FIstanbul';

// WMO hava kodu -> oyun içi hava türü
export function kindFromCode(code) {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return code === 65 || code === 82 ? 'heavyrain' : 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'partly';
}

export const KINDS = {
  clear: { label: 'Açık', icon: '☀️', cloud: 0.05, rain: 0, snow: 0, fog: 0, wind: 8 },
  partly: { label: 'Parçalı bulutlu', icon: '⛅', cloud: 0.4, rain: 0, snow: 0, fog: 0, wind: 12 },
  cloudy: { label: 'Kapalı', icon: '☁️', cloud: 0.95, rain: 0, snow: 0, fog: 0.1, wind: 15 },
  fog: { label: 'Sisli', icon: '🌫️', cloud: 0.8, rain: 0, snow: 0, fog: 1, wind: 4 },
  drizzle: { label: 'Çisenti', icon: '🌦️', cloud: 0.85, rain: 0.3, snow: 0, fog: 0.2, wind: 12 },
  rain: { label: 'Yağmurlu', icon: '🌧️', cloud: 0.95, rain: 0.65, snow: 0, fog: 0.25, wind: 20 },
  heavyrain: { label: 'Sağanak', icon: '🌧️', cloud: 1, rain: 1, snow: 0, fog: 0.35, wind: 30 },
  snow: { label: 'Karlı', icon: '🌨️', cloud: 0.95, rain: 0, snow: 0.8, fog: 0.3, wind: 14 },
  storm: { label: 'Fırtına', icon: '⛈️', cloud: 1, rain: 1, snow: 0, fog: 0.3, wind: 45 },
};

export function presetWeather(kind) {
  const k = KINDS[kind] || KINDS.clear;
  return {
    kind,
    live: false,
    temperature: kind === 'snow' ? -1 : 18,
    cloud: k.cloud,
    windSpeed: k.wind,
    windDir: 30, // poyraz
  };
}

export async function fetchLiveWeather() {
  const res = await fetch(URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Hava durumu alınamadı: ' + res.status);
  const c = (await res.json()).current;
  return {
    kind: kindFromCode(c.weather_code),
    live: true,
    temperature: c.temperature_2m,
    cloud: (c.cloud_cover ?? 50) / 100,
    windSpeed: c.wind_speed_10m ?? 10,
    windDir: c.wind_direction_10m ?? 30,
    isDay: c.is_day === 1,
  };
}

// Güneşin yükseklik/azimut açısı (radyan). Azimut kuzeyden saat yönünde.
export function sunPosition(date, latDeg = CITY.lat, lonDeg = CITY.lon) {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5; // J2000'den beri gün
  const L = (280.46 + 0.9856474 * d) % 360;
  const g = ((357.528 + 0.9856003 * d) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * d) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = (gmst * 15 + lonDeg) * rad - ra;
  const lat = latDeg * rad;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
  return { elevation, azimuth };
}

export function istanbulTimeString(date = new Date()) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: CITY.tz }).format(date);
}
