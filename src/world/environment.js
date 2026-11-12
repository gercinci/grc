// Hava durumu + saat -> gökyüzü, ışık, sis, ıslak yol, kar ve deniz parametreleri.
// Buradaki uniform nesneleri zemin, deniz ve gökyüzü shader'ları arasında paylaşılır.
import * as THREE from 'three';
import { SEA_ELLIPSOID_HEIGHT } from '../config.js';
import { KINDS, sunPosition } from './weather.js';

const seaParam = parseFloat(new URLSearchParams(location.search).get('sea'));

export const U = {
  uTime: { value: 0 },
  uLight: { value: new THREE.Color(1, 1, 1) },
  uFogColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uFogDensity: { value: 0.00012 },
  uSkyColor: { value: new THREE.Color(0.2, 0.45, 0.85) },
  uHorizonColor: { value: new THREE.Color(0.7, 0.8, 0.9) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uSunVis: { value: 1 },
  uNight: { value: 0 },
  uCloud: { value: 0.2 },
  uWind: { value: new THREE.Vector2(1, 0) },
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uSeaColor: { value: new THREE.Color(0.02, 0.16, 0.25) },
  uWave: { value: 0.4 },
  uFoam: { value: 0 },
  uSeaY: { value: Number.isFinite(seaParam) ? seaParam : SEA_ELLIPSOID_HEIGHT },
  uFlat: { value: 0 },
  uWaterKey: { value: new THREE.Vector3(170 / 255, 211 / 255, 223 / 255) },
  uHeadPos: { value: new THREE.Vector3() },
  uHeadDir: { value: new THREE.Vector3(0, 0, 1) },
  uHeadOn: { value: 0 },
};

const C = (r, g, b) => new THREE.Color(r, g, b);
const PAL = {
  dayZenith: C(0.16, 0.4, 0.82), dayHorizon: C(0.62, 0.78, 0.93),
  duskZenith: C(0.16, 0.2, 0.42), duskHorizon: C(0.95, 0.52, 0.28),
  nightZenith: C(0.006, 0.01, 0.03), nightHorizon: C(0.03, 0.045, 0.09),
  overcast: C(0.52, 0.55, 0.58),
};
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Oyunun fizik tarafının okuduğu anlık durum (yol tutuşu vb.)
export const envState = {
  kind: 'clear', wet: 0, snow: 0, rain: 0, snowfall: 0, night: 0, grip: 1, storm: false, target: null,
};

// weather: weather.js'deki nesne; timeMode: 'live' | 'day' | 'sunset' | 'night'
export function setEnvironmentTarget(weather, timeMode = 'live') {
  envState.target = { weather, timeMode };
  envState.kind = weather.kind;
  envState.storm = weather.kind === 'storm';
}

const baseLight = new THREE.Color(1, 1, 1);
let flash = 0;
let nextFlash = 4;

export function updateEnvironment(dt, time) {
  U.uTime.value = time;
  const t = envState.target;
  if (!t) return;
  const k = KINDS[t.weather.kind] || KINDS.clear;
  const ease = 1 - Math.exp(-dt * 0.8);

  // Güneş
  let sun;
  if (t.timeMode === 'live') sun = sunPosition(new Date());
  else if (t.timeMode === 'day') sun = { elevation: 0.95, azimuth: 2.6 };
  else if (t.timeMode === 'sunset') sun = { elevation: 0.05, azimuth: 4.5 };
  else sun = { elevation: -0.6, azimuth: 0.3 };
  const ce = Math.cos(sun.elevation);
  U.uSunDir.value.set(-Math.sin(sun.azimuth) * ce, Math.sin(sun.elevation), Math.cos(sun.azimuth) * ce);

  const day = smooth(-0.1, 0.16, sun.elevation);      // 0 gece, 1 gündüz
  const dusk = 1 - Math.min(1, Math.abs(sun.elevation - 0.02) / 0.22); // gün batımı/doğumu
  const cloud = Math.max(k.cloud, t.weather.cloud ?? 0);
  const gloom = Math.max(cloud * 0.75, k.fog * 0.8);

  // Gökyüzü renkleri
  tmpA.copy(PAL.nightZenith).lerp(PAL.dayZenith, day).lerp(PAL.duskZenith, Math.max(0, dusk) * 0.6);
  tmpB.copy(PAL.overcast).multiplyScalar(0.06 + 0.94 * day);
  tmpA.lerp(tmpB, gloom);
  U.uSkyColor.value.lerp(tmpA, ease);

  tmpA.copy(PAL.nightHorizon).lerp(PAL.dayHorizon, day).lerp(PAL.duskHorizon, Math.max(0, dusk) * 0.75);
  tmpA.lerp(tmpB, gloom);
  U.uHorizonColor.value.lerp(tmpA, ease);
  U.uFogColor.value.copy(U.uHorizonColor.value);

  // Fotogrametri dokusu zaten güneşli çekildiği için ışığı çarpan olarak uyguluyoruz.
  const bright = (0.3 + 0.7 * day) * (1 - 0.3 * gloom);
  tmpA.setRGB(bright, bright, bright);
  tmpA.lerp(C(0.14, 0.17, 0.3), (1 - day) * 0.85);
  tmpA.lerp(C(1.0, 0.78, 0.6).multiplyScalar(bright), Math.max(0, dusk) * 0.45 * (1 - gloom));
  if (envState.storm) {
    nextFlash -= dt;
    if (nextFlash <= 0) { flash = 1; nextFlash = 3 + Math.random() * 9; }
  }
  flash = Math.max(0, flash - dt * 3.5);
  baseLight.lerp(tmpA, ease);
  // şimşek parlaması
  U.uLight.value.copy(baseLight).addScalar(flash * flash * 1.6);

  U.uSunColor.value.setRGB(1, 0.72 + 0.23 * day, 0.5 + 0.38 * day);
  U.uSunVis.value += ((1 - gloom) * smooth(-0.08, 0.02, sun.elevation) - U.uSunVis.value) * ease;
  U.uNight.value = 1 - day;
  U.uCloud.value += (cloud - U.uCloud.value) * ease;

  let fogTarget = 0.00009 + k.fog * 0.0035 + k.rain * 0.00035 + k.snow * 0.0006;
  // demo (düz harita) modunda harita kenarı sisle gizlenir
  const fogMin = U.uFlat.value > 0.5 ? 0.0017 : 0;
  U.uFogDensity.value += (Math.max(fogTarget, fogMin) - U.uFogDensity.value) * ease;

  // Yol ve deniz
  const wetTarget = Math.min(1, k.rain * 1.6);
  const snowTarget = k.snow;
  // yağmur dinince yollar yavaşça kurur
  U.uWet.value += (wetTarget - U.uWet.value) * (wetTarget > U.uWet.value ? ease : ease * 0.15);
  U.uSnow.value += (snowTarget - U.uSnow.value) * ease * 0.5;

  const wind = t.weather.windSpeed ?? k.wind; // km/sa
  const wr = ((t.weather.windDir ?? 30) + 180) * Math.PI / 180; // rüzgarın estiği yön
  U.uWind.value.set(-Math.sin(wr), Math.cos(wr));
  U.uWave.value += (0.12 + Math.min(1.5, wind / 28) - U.uWave.value) * ease;
  U.uFoam.value += (smooth(22, 55, wind) - U.uFoam.value) * ease;
  tmpA.setRGB(0.015, 0.17, 0.27).lerp(C(0.07, 0.13, 0.13), gloom).multiplyScalar(0.25 + 0.75 * day);
  U.uSeaColor.value.lerp(tmpA, ease);

  envState.wet = U.uWet.value;
  envState.snow = U.uSnow.value;
  envState.rain = k.rain;
  envState.snowfall = k.snow;
  envState.night = 1 - day;
  // Islak/karlı zeminde lastik tutuşu düşer.
  envState.grip = 1 - 0.3 * envState.wet - 0.5 * envState.snow;
}
