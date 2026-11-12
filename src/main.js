// Piyasa İstanbul — ana oyun döngüsü ve arayüz bağlantıları.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GAME_TITLE, LOCATIONS, QUALITY, STORAGE, envApiKey, isTouchDevice } from './config.js';
import { createAudio } from './game/audio.js';
import { FollowCamera } from './game/camera.js';
import { createInput } from './game/input.js';
import { groundY, surfaceY } from './game/physics.js';
import { Player } from './game/player.js';
import { Vehicle } from './game/vehicle.js';
import { createCarPreview } from './ui/carPreview.js';
import { VEHICLES, getVehicle } from './vehicles/catalog.js';
import { loadMods, saveMods } from './vehicles/mods.js';
import { U, envState, setEnvironmentTarget, updateEnvironment } from './world/environment.js';
import { createFlatWorld } from './world/flatWorld.js';
import { createGoogleWorld } from './world/googleWorld.js';
import { createPrecipitation, createSky } from './world/sky.js';
import { KINDS, fetchLiveWeather, istanbulTimeString, presetWeather } from './world/weather.js';

const $ = (id) => document.getElementById(id);
const store = {
  get: (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok say */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* yok say */ } },
};
const params = new URLSearchParams(location.search);
const touch = isTouchDevice();
document.body.classList.toggle('touch', touch);
document.title = GAME_TITLE;

// ---------------------------------------------------------------- Sahne
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 30000);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const hemi = new THREE.HemisphereLight(0xffffff, 0x554433, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2);
scene.add(hemi, sun, sun.target);
createSky(scene);
const precip = createPrecipitation(scene, touch);
const input = createInput(canvas);
const audio = createAudio();
const follow = new FollowCamera(camera);
const player = new Player(scene);
player.setVisible(false);

const settings = {
  location: LOCATIONS.find((l) => l.id === (params.get('loc') || store.get(STORAGE.location))) || LOCATIONS[0],
  car: getVehicle(params.get('car') || store.get(STORAGE.car)),
  startMode: params.get('mode') === 'foot' ? 'foot' : 'car',
  quality: QUALITY[store.get(STORAGE.quality)] ? store.get(STORAGE.quality) : touch ? 'medium' : 'high',
  weather: params.get('weather') || 'live',
  time: params.get('time') || 'live',
};

const game = {
  mode: 'menu',          // menu | loading | play | paused
  world: null,
  vehicles: [],
  driving: null,
  liveWeather: null,
  time: 0,
};
window.__game = { game, player, settings, U, envState, camera }; // hata ayıklama için

function resize() {
  const q = QUALITY[settings.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------------------------------------------------------------- Dünya
function storedKey() { return envApiKey() || store.get(STORAGE.apiKey, ''); }

function setWorld(kind, apiKey) {
  game.world?.dispose();
  const opts = { renderer, camera, scene, origin: settings.location, errorTarget: QUALITY[settings.quality].errorTarget };
  game.world = kind === 'google' ? createGoogleWorld({ ...opts, apiKey }) : createFlatWorld(opts);
  $('start').classList.remove('no-world');
  $('key-panel').hidden = kind === 'google' || !!envApiKey();
  $('mode-note').textContent = kind === 'google'
    ? 'Harita: Google Photorealistic 3D Tiles · Hava: Open-Meteo (canlı)'
    : 'Demo modu: 2B harita zemini. Gerçek 3B İstanbul için Google API anahtarı ekleyin.';
}

function showKeyError(msg) {
  $('key-error').textContent = msg;
  $('key-error').hidden = false;
  $('key-panel').hidden = false;
}

// ---------------------------------------------------------------- Hava
async function refreshWeather() {
  try { game.liveWeather = await fetchLiveWeather(); }
  catch (e) { console.warn('[Piyasa İstanbul]', e.message); game.liveWeather ||= { ...presetWeather('partly'), offline: true }; }
  applyWeather();
}
function currentWeather() {
  return settings.weather === 'live' ? (game.liveWeather || presetWeather('partly')) : presetWeather(settings.weather);
}
function applyWeather() {
  setEnvironmentTarget(currentWeather(), settings.time);
  updateWeatherChip();
}
function updateWeatherChip() {
  const w = currentWeather();
  const k = KINDS[w.kind] || KINDS.clear;
  $('w-icon').textContent = k.icon;
  const live = w.live ? ' · canlı' : w.offline ? ' · çevrimdışı' : '';
  $('w-text').textContent = `${Math.round(w.temperature)}° ${k.label} · ${istanbulTimeString()}${live}`;
}
refreshWeather();
setInterval(refreshWeather, 10 * 60 * 1000);
setInterval(updateWeatherChip, 30 * 1000);

// ---------------------------------------------------------------- Araçlar
function carMods(spec) { return loadMods(spec.id); }

function spawnVehicle(spec, x, y, z, yaw) {
  const v = new Vehicle(scene, spec, carMods(spec));
  v.place(x, y, z, yaw);
  game.vehicles.push(v);
  // sahnede en fazla 5 araç kalsın
  while (game.vehicles.length > 5) {
    const idx = game.vehicles.findIndex((o) => o !== game.driving && o !== v);
    if (idx < 0) break;
    game.vehicles.splice(idx, 1)[0].dispose();
  }
  return v;
}

function enterVehicle(v) {
  game.driving = v;
  v.driven = true;
  player.setVisible(false);
  follow.snap(v.yaw);
  $('car-name').textContent = v.spec.name;
}

function exitVehicle() {
  const v = game.driving;
  if (!v) return;
  v.driven = false;
  game.driving = null;
  // sürücü kapısı (sol) tarafına in
  const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
  const d = v.spec.dims.width / 2 + 0.9;
  const px = v.pos.x + lx * d, pz = v.pos.z + lz * d;
  const gy = groundY(game.world, px, v.pos.y + 1.6, pz, 30) ?? v.pos.y;
  player.teleport(px, gy, pz, v.yaw);
  player.setVisible(true);
  audio.horn(false);
}

function nearestVehicle(maxDist) {
  let best = null, bd = maxDist;
  for (const v of game.vehicles) {
    const d = Math.hypot(v.pos.x - player.pos.x, v.pos.z - player.pos.z);
    if (d < bd && Math.abs(v.pos.y - player.pos.y) < 3) { bd = d; best = v; }
  }
  return best;
}

// Oyuncunun önüne yeni araç getirir.
function summonVehicle(spec) {
  const ref = game.driving || player;
  const yaw = ref.yaw;
  const dist = game.driving ? game.driving.spec.dims.length + 3 : 5;
  const x = ref.pos.x + Math.sin(yaw) * dist, z = ref.pos.z + Math.cos(yaw) * dist;
  const y = groundY(game.world, x, ref.pos.y + 3, z, 40) ?? surfaceY(game.world, x, z) ?? ref.pos.y;
  return spawnVehicle(spec, x, y, z, yaw);
}

// ---------------------------------------------------------------- Başlat / ışınlan
let loadToken = 0;
async function goTo(loc, { asStart = false } = {}) {
  const token = ++loadToken;
  game.mode = 'loading';
  input.setEnabled(false);
  $('hud').hidden = true; $('start').hidden = true; $('pause').hidden = true; $('loading').hidden = false;
  $('load-text').textContent = `${loc.name} yükleniyor…`;
  settings.location = loc;
  store.set(STORAGE.location, loc.id);
  for (const v of game.vehicles.splice(0)) v.dispose();
  game.driving = null;
  game.world.setOrigin(loc.lat, loc.lon);
  menuCam.reset();

  // Zemin görünene ve yakın karolar netleşene kadar bekle.
  const t0 = performance.now();
  let y = null, stableSince = 0;
  while (token === loadToken) {
    await new Promise((r) => setTimeout(r, 150));
    const el = (performance.now() - t0) / 1000;
    if (game.world.error) { backToStart(); showKeyError(game.world.error); return; }
    const p = game.world.progress();
    $('load-bar').style.width = Math.round(Math.max(8, Math.min(1, p) * 100)) + '%';
    y = surfaceY(game.world, 0, 0);
    menuCam.groundY = y ?? menuCam.groundY;
    if (y !== null) {
      stableSince ||= el;
      if ((p > 0.96 && el - stableSince > 1.2) || el - stableSince > 9) break;
    }
    if (y === null && el > 40) { backToStart(); showKeyError('Harita bu konumda yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.'); return; }
  }
  if (token !== loadToken) return;

  const yaw = -(loc.heading * Math.PI) / 180;
  player.teleport(0, y, 0, yaw);
  follow.snap(yaw);
  if (asStart ? settings.startMode === 'car' : false) enterVehicle(spawnVehicle(settings.car, 0, y, 0, yaw));
  else player.setVisible(true);
  $('loading').hidden = true; $('hud').hidden = false;
  game.mode = 'play';
  input.clearActions();
  input.setEnabled(true);
}

function backToStart() {
  loadToken++;
  game.mode = 'menu';
  input.setEnabled(false);
  audio.engine(false, 0, 0);
  $('loading').hidden = true; $('hud').hidden = true; $('pause').hidden = true; $('start').hidden = false;
  player.setVisible(false);
}

function setPaused(p) {
  if (game.mode !== 'play' && game.mode !== 'paused') return;
  game.mode = p ? 'paused' : 'play';
  $('pause').hidden = !p;
  input.setEnabled(!p);
  input.clearActions();
  if (p) { audio.engine(false, 0, 0); audio.horn(false); }
}
document.addEventListener('pointerlockchange', () => {
  // Esc ile işaretçi kilidi bırakılınca menüyü aç
  if (!document.pointerLockElement && game.mode === 'play' && !touch) setPaused(true);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'play') setPaused(true); });

// Menü arka planında şehrin üzerinde dönen kamera
const menuCam = {
  angle: 0, groundY: null, timer: 0,
  reset() { this.groundY = null; this.timer = 1; },
  update(dt) {
    this.angle += dt * 0.05;
    this.timer += dt;
    if (this.timer > 0.5 && game.world) { this.timer = 0; const y = surfaceY(game.world, 0, 0); if (y !== null) this.groundY = y; }
    const gy = this.groundY ?? (game.world?.type === 'flat' ? 0 : 60);
    camera.position.set(Math.sin(this.angle) * 260, gy + 150, Math.cos(this.angle) * 260);
    camera.lookAt(0, gy + 10, 0);
  },
};

// ---------------------------------------------------------------- Oyun döngüsü
let lastFrame = performance.now();
const tmpV = new THREE.Vector3();
let hudTimer = 0, settleTimer = 0, lightsOverride = null;
const preview = createCarPreview($('car-preview'));

function updatePlay(dt) {
  const world = game.world;
  if (input.take('menu')) { setPaused(true); return; }
  if (input.take('garage')) { setPaused(true); $('p-car').focus(); return; }
  if (input.take('camera')) follow.near = !follow.near;
  if (input.take('lights')) lightsOverride = !(lightsOverride ?? envState.night > 0.5);
  const wantLights = lightsOverride ?? (envState.night > 0.5 || envState.rain > 0.5);
  const look = input.consumeLook();

  if (game.driving) {
    const v = game.driving;
    const c = input.drive();
    if (input.take('reset')) { const t = surfaceY(world, v.pos.x, v.pos.z); if (t !== null) v.place(v.pos.x, t, v.pos.z, v.yaw); }
    v.lightsOn = wantLights;
    v.update(dt, c, world);
    audio.engine(true, Math.min(1, v.speedKmh / v.perf.topSpeed), c.throttle, v.spec.perf.electric);
    audio.horn(c.horn);
    follow.update(dt, look, v.pos, { height: v.spec.dims.height + 0.35, distance: v.spec.dims.length * 1.25 + 1.6 + v.speedKmh * 0.012, followYaw: v.forwardSpeed < -1 ? v.yaw + Math.PI : v.yaw, speed: Math.abs(v.forwardSpeed) }, world);
    camera.fov += ((62 + Math.min(14, v.speedKmh * 0.09)) - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
    U.uHeadOn.value = v.lightsOn ? 0.25 + 0.75 * envState.night : 0;
    tmpV.set(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    U.uHeadPos.value.copy(v.pos).addScaledVector(tmpV, v.spec.dims.length / 2).setY(v.pos.y + 0.7);
    U.uHeadDir.value.copy(tmpV).setY(-0.09).normalize();
    if (input.take('interact') && v.speedKmh < 12) exitVehicle();
  } else {
    if (input.take('reset')) { const t = surfaceY(world, player.pos.x, player.pos.z); if (t !== null) player.teleport(player.pos.x, t, player.pos.z); }
    player.update(dt, input.move(), follow.yaw, world);
    follow.update(dt, look, player.pos, { height: 1.55, distance: 4.2 }, world);
    U.uHeadOn.value = 0;
    audio.engine(false, 0, 0);
    if (input.take('interact')) { const v = nearestVehicle(4); if (v) enterVehicle(v); }
  }

  // Sürülmeyen araçlar: hâlâ hareket ediyorsa fiziği sürdür, değilse ara sıra zemine oturt.
  settleTimer += dt;
  const idle = { steer: 0, throttle: 0, brake: 0, handbrake: true };
  for (const v of game.vehicles) {
    if (v === game.driving) continue;
    v.lightsOn = false;
    if (Math.hypot(v.vx, v.vz) > 0.3 || v.airborne) v.update(dt, idle, world);
    else if (settleTimer > 0.7) { v.vx = v.vz = 0; v.settle(world); }
  }
  if (settleTimer > 0.7) settleTimer = 0;

  hudTimer += dt;
  if (hudTimer > 0.1) {
    hudTimer = 0;
    const v = game.driving;
    $('speedo').hidden = !v;
    $('car-btns').hidden = !v;
    $('foot-btns').hidden = !!v;
    let hint = '';
    const near = v ? null : nearestVehicle(4);
    if (v) { $('speed').textContent = Math.round(v.speedKmh); if (v.speedKmh < 12 && !touch) hint = 'F · Araçtan in'; }
    else if (near) hint = touch ? '' : `F · ${near.spec.name} — bin`;
    $('btn-interact').hidden = !(v ? v.speedKmh < 12 : near);
    $('btn-interact').textContent = v ? 'İn' : 'Bin';
    if ($('hint').textContent !== hint) $('hint').textContent = hint;
  }
}

let attrTimer = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  game.time += dt;
  updateEnvironment(dt, game.time);

  // Düşük kare hızında fizik iki alt adımda işlenir (yavaş cihazlarda ağır çekim olmasın).
  if (game.mode === 'play') { const n = dt > 0.04 ? 2 : 1; for (let i = 0; i < n && game.mode === 'play'; i++) updatePlay(dt / n); }
  else if (game.mode !== 'paused') menuCam.update(dt);
  if (game.mode === 'menu') preview.render(game.time);

  // Araç/karakter ışıkları hava durumunu izlesin
  const l = U.uLight.value;
  hemi.intensity = 0.25 + 0.9 * Math.max(l.r, l.g, l.b);
  hemi.color.copy(U.uSkyColor.value).lerp(new THREE.Color(1, 1, 1), 0.6);
  sun.intensity = 2.4 * U.uSunVis.value * (1 - U.uNight.value);
  sun.color.copy(U.uSunColor.value);
  sun.position.copy(camera.position).addScaledVector(U.uSunDir.value, 100);
  sun.target.position.copy(camera.position);
  scene.environmentIntensity = 0.12 + 0.75 * Math.max(l.r, l.g, l.b);

  if (game.world) {
    game.world.update();
    attrTimer += dt;
    if (attrTimer > 1) { attrTimer = 0; const a = game.world.attribution(); if ($('attribution').textContent !== a) $('attribution').textContent = a; }
    if (game.mode === 'menu' && game.world.error) { const e = game.world.error; game.world.dispose(); game.world = null; $('start').classList.add('no-world'); store.del(STORAGE.apiKey); showKeyError(e); }
  }
  precip.update(dt, camera);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- Arayüz
function fillSelect(el, items, value) {
  el.innerHTML = '';
  for (const [v, label] of items) { const o = document.createElement('option'); o.value = v; o.textContent = label; el.append(o); }
  if (value !== undefined) el.value = value;
}

function renderLocations() {
  const box = $('locations');
  box.innerHTML = '';
  for (const loc of LOCATIONS) {
    const b = document.createElement('button');
    b.textContent = loc.name;
    b.classList.toggle('on', loc === settings.location);
    b.onclick = () => { settings.location = loc; store.set(STORAGE.location, loc.id); game.world?.setOrigin(loc.lat, loc.lon); menuCam.reset(); renderLocations(); };
    box.append(b);
  }
}

function renderCar() {
  const spec = settings.car;
  const mods = carMods(spec);
  store.set(STORAGE.car, spec.id);
  $('car-title').textContent = spec.name;
  $('car-year').textContent = `${spec.year} · ${{ rwd: 'arkadan itiş', fwd: 'önden çekiş', awd: '4 çeker' }[spec.perf.drive]}${spec.perf.electric ? ' · elektrikli' : ''}`;
  $('car-tag').textContent = spec.tagline;
  const stat = (label, v) => `<span>${label}</span><div class="meter"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`;
  $('car-stats').innerHTML = stat('Hız', spec.perf.topSpeed / 200) + stat('İvme', spec.perf.power / 9) + stat('Yol tutuş', spec.perf.grip) + stat('Fren', spec.perf.brake / 11.5);
  const paints = $('car-paints');
  paints.innerHTML = '';
  for (const color of spec.paints) {
    const b = document.createElement('button');
    b.style.background = color;
    b.setAttribute('aria-label', 'Renk ' + color);
    b.classList.toggle('on', (mods.paint || spec.paint) === color);
    b.onclick = () => { saveMods(spec.id, { ...carMods(spec), paint: color }); renderCar(); };
    paints.append(b);
  }
  preview.show(spec, mods);
}

function initUI() {
  renderLocations();
  renderCar();
  const step = (d) => { const i = VEHICLES.indexOf(settings.car); settings.car = VEHICLES[(i + d + VEHICLES.length) % VEHICLES.length]; renderCar(); };
  $('car-prev').onclick = () => step(-1);
  $('car-next').onclick = () => step(1);
  for (const b of $('mode').children) b.onclick = () => {
    settings.startMode = b.dataset.mode;
    for (const o of $('mode').children) o.classList.toggle('on', o === b);
    $('car-field').hidden = settings.startMode !== 'car';
  };
  if (settings.startMode === 'foot') $('mode').children[1].click();

  $('key-save').onclick = () => {
    const key = $('key-input').value.trim();
    if (!key) return;
    store.set(STORAGE.apiKey, key);
    $('key-error').hidden = true;
    setWorld('google', key);
  };
  $('demo-btn').onclick = () => { setWorld('flat'); $('key-panel').hidden = true; };
  $('start-btn').onclick = () => {
    if (!game.world) { showKeyError('Önce bir Google API anahtarı girin ya da demo modunu seçin.'); $('key-panel').scrollIntoView({ behavior: 'smooth' }); return; }
    audio.start();
    if (touch) document.documentElement.requestFullscreen?.().catch(() => {});
    goTo(settings.location, { asStart: true });
  };

  // Duraklatma menüsü
  fillSelect($('p-location'), [['', 'Konum seç…'], ...LOCATIONS.map((l) => [l.id, l.name])], '');
  fillSelect($('p-car'), [['', 'Araç seç…'], ...VEHICLES.map((v) => [v.id, v.name])], '');
  fillSelect($('p-weather'), [['live', 'Canlı (İstanbul)'], ...Object.entries(KINDS).map(([k, v]) => [k, `${v.icon} ${v.label}`])], settings.weather);
  fillSelect($('p-quality'), Object.entries(QUALITY).map(([k, v]) => [k, v.label]), settings.quality);
  $('p-time').value = settings.time;
  $('resume').onclick = () => setPaused(false);
  $('p-location').onchange = (e) => { const loc = LOCATIONS.find((l) => l.id === e.target.value); e.target.value = ''; if (loc) goTo(loc); };
  $('p-car').onchange = (e) => {
    const spec = VEHICLES.find((v) => v.id === e.target.value); e.target.value = '';
    if (!spec) return;
    if (game.driving) exitVehicle();
    summonVehicle(spec);
    setPaused(false);
  };
  $('p-weather').onchange = (e) => { settings.weather = e.target.value; applyWeather(); };
  $('p-time').onchange = (e) => { settings.time = e.target.value; applyWeather(); };
  $('p-quality').onchange = (e) => { settings.quality = e.target.value; store.set(STORAGE.quality, settings.quality); game.world?.setQuality(QUALITY[settings.quality].errorTarget); resize(); };
  $('p-sound').onchange = (e) => audio.setMuted(!e.target.checked);
  $('to-start').onclick = () => { for (const v of game.vehicles.splice(0)) v.dispose(); game.driving = null; backToStart(); };
}

// ---------------------------------------------------------------- Açılış
initUI();
applyWeather();
const key = storedKey();
if (params.has('demo')) setWorld('flat');
else if (key) setWorld('google', key);
else { $('start').classList.add('no-world'); $('key-panel').hidden = false; $('mode-note').textContent = ''; }
frame();
if (params.has('autostart') && game.world) goTo(settings.location, { asStart: true });
