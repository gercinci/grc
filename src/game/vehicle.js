// Arcade araç fiziği. Zemini dört tekerlek noktasından ışınla izler; yol tutuşu
// hava durumuna (ıslak / karlı zemin) göre değişir.
import * as THREE from 'three';
import { buildVehicleMesh } from '../vehicles/builder.js';
import { effectivePerf, loadMods } from '../vehicles/mods.js';
import { envState } from '../world/environment.js';
import { clamp, damp, groundY, surfaceY } from './physics.js';

const GRAVITY = 20;
const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class Vehicle {
  constructor(scene, spec, mods = loadMods(spec.id)) {
    this.scene = scene;
    this.spec = spec;
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.roll = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.steer = 0;
    this.forwardSpeed = 0;
    this.airborne = false;
    this.driven = false;
    this.lightsOn = false;
    this.braking = false;
    this.slip = 0;
    this.rescueTimer = 0;
    this.applyMods(mods);
  }

  // Modifiye değiştiğinde modeli ve performansı yeniden kurar (atölye buradan çağıracak).
  applyMods(mods) {
    this.mods = mods;
    this.perf = effectivePerf(this.spec, mods);
    if (this.model) { this.scene.remove(this.model.group); this.model.dispose(); }
    this.model = buildVehicleMesh(this.spec, mods);
    this.model.group.rotation.order = 'YXZ';
    this.scene.add(this.model.group);
    this.sync();
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z); this.yaw = yaw;
    this.vx = this.vz = this.vy = 0; this.pitch = this.roll = 0;
    this.sync();
  }

  get speedKmh() { return Math.abs(this.forwardSpeed) * 3.6; }

  update(dt, c, world) {
    const { length: L, width: W, wheelbase: WB, wheelRadius: WR } = this.spec.dims;
    const p = this.perf;
    const top = p.topSpeed / 3.6;
    const surface = envState.grip;                 // 1 kuru, ~0.7 ıslak, ~0.5 karlı
    const maxLat = p.grip * 10.5 * surface * (c.handbrake ? 0.38 : 1);

    // --- Direksiyon ---
    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let vF = this.vx * fx + this.vz * fz;
    const v = Math.abs(vF);
    // Kuru zemin tutuşuna göre sınırlanır; ıslakta aynı direksiyon aracı kaydırır.
    const steerMax = Math.min(0.62, Math.atan((1.25 * p.grip * 10.5 * WB) / Math.max(v * v, 1)));
    this.steer = damp(this.steer, c.steer * steerMax, c.steer === 0 ? 9 : 6, dt);
    let yawRate = (vF * Math.tan(this.steer)) / WB;
    if (c.handbrake && v > 3) yawRate *= 1.45;
    if (!this.airborne) this.yaw -= yawRate * dt;

    // --- Boyuna / yanal kuvvetler ---
    fx = Math.sin(this.yaw); fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx; // sağ
    vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;
    this.braking = false;
    if (!this.airborne) {
      const traction = Math.min(1, 0.45 + surface * 0.55);
      if (c.throttle > 0) {
        if (vF < -0.5) { vF += p.brake * surface * dt; this.braking = true; }
        else vF += p.power * traction * c.throttle * Math.max(0, 1 - (vF / top) ** 2) * dt;
      }
      if (c.brake > 0) {
        if (vF > 0.5) { vF = Math.max(0, vF - p.brake * surface * dt); this.braking = true; }
        else vF -= p.power * 0.7 * traction * Math.max(0, 1 - (vF / (-top * 0.3)) ** 2) * dt;
      }
      if (c.handbrake) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 5 * surface * dt); this.braking = true; }
      // yuvarlanma + hava direnci
      const dragA = 0.35 + 0.012 * v + 0.00035 * v * v * 9;
      if (!c.throttle && !c.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), dragA * dt);
      else vF -= vF * 0.0006 * v * dt;
      const cut = Math.min(Math.abs(vL), maxLat * dt);
      this.slip = Math.abs(vL) - cut;
      vL -= Math.sign(vL) * cut;
    }
    this.vx = fx * vF + rx * vL;
    this.vz = fz * vF + rz * vL;
    this.forwardSpeed = vF;

    // --- Engeller: hareket yönünde ön köşelere doğru iki ışın ---
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.3) {
      const dx = this.vx / sp, dz = this.vz / sp;
      const reach = L / 2 + 0.25 + sp * dt;
      for (const side of [-1, 1]) {
        const ang = Math.atan2(side * W * 0.42, L / 2);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        _dir.set(dx * ca - dz * sa, 0, dz * ca + dx * sa);
        _from.set(this.pos.x, this.pos.y + 0.62, this.pos.z);
        const hit = world.raycast(_from, _dir, reach / ca);
        if (hit && hit.normal.y < 0.55) {
          const nl = Math.hypot(hit.normal.x, hit.normal.z) || 1;
          const nx = hit.normal.x / nl, nz = hit.normal.z / nl;
          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) {
            this.vx -= nx * vn * 1.25; this.vz -= nz * vn * 1.25;
            this.vx *= 0.92; this.vz *= 0.92;
            this.impact = Math.max(this.impact || 0, -vn);
          }
          const pen = reach / ca - hit.distance;
          if (pen > sp * dt) { this.pos.x += nx * Math.min(0.1, pen - sp * dt); this.pos.z += nz * Math.min(0.1, pen - sp * dt); }
        }
      }
    }
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;

    // --- Zemin: dört tekerlek noktası ---
    const hw = W / 2 - 0.15, hb = WB / 2;
    let sum = 0, n = 0;
    const h = [0, 0, 0, 0]; // öS, öSağ, aS, aSağ
    for (let i = 0; i < 4; i++) {
      const lz = i < 2 ? hb : -hb, lx = i % 2 === 0 ? hw : -hw; // +X sol
      const wx = this.pos.x + fx * lz + fz * lx;
      const wz = this.pos.z + fz * lz - fx * lx;
      const gy = groundY(world, wx, this.pos.y + 1.1, wz, 1.1 + 40);
      h[i] = gy === null ? NaN : Math.min(gy, this.pos.y + 0.75);
      if (gy !== null) { sum += h[i]; n++; }
    }
    if (n === 0) {
      this.vy = 0;
      this.rescueTimer += dt;
      if (this.rescueTimer > 0.4) { this.rescueTimer = 0; const t = surfaceY(world, this.pos.x, this.pos.z); if (t !== null) this.pos.y = t; }
    } else {
      this.rescueTimer = 0;
      const avg = sum / n;
      for (let i = 0; i < 4; i++) if (Number.isNaN(h[i])) h[i] = avg;
      if (this.pos.y - avg > 0.25) {
        this.airborne = true;
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= avg) { this.pos.y = avg; this.vy = 0; this.airborne = false; }
      } else {
        this.airborne = false;
        this.vy = 0;
        this.pos.y = damp(this.pos.y, avg, 22, dt);
      }
      const tp = clamp(Math.atan2((h[0] + h[1]) / 2 - (h[2] + h[3]) / 2, WB), -0.6, 0.6);
      const tr = clamp(Math.atan2((h[0] + h[2]) / 2 - (h[1] + h[3]) / 2, hw * 2), -0.5, 0.5);
      const rate = this.airborne ? 1.5 : 10;
      this.pitch = damp(this.pitch, tp, rate, dt);
      this.roll = damp(this.roll, tr, rate, dt);
    }

    // --- Görsel ---
    const m = this.model;
    const spin = (vF / WR) * dt;
    for (const w of m.wheels) {
      w.spin.rotation.x += spin;
      if (w.front) w.pivot.rotation.y = -this.steer;
    }
    const latAcc = vF * yawRate;
    m.body.rotation.z = damp(m.body.rotation.z, clamp(latAcc * 0.006, -0.07, 0.07), 6, dt);
    const lon = (c.throttle ? -0.012 : 0) + (this.braking ? 0.02 : 0);
    m.body.rotation.x = damp(m.body.rotation.x, vF > 1 ? lon : 0, 5, dt);
    m.setLights(this.lightsOn, this.braking && this.driven);
    this.sync();
  }

  // Park halindeki aracı zeminde tutar (karolar netleştikçe yükseklik değişebilir).
  settle(world) {
    const gy = groundY(world, this.pos.x, this.pos.y + 1.5, this.pos.z, 60);
    if (gy !== null) this.pos.y = gy;
    else { const t = surfaceY(world, this.pos.x, this.pos.z); if (t !== null) this.pos.y = t; }
    this.sync();
  }

  sync() {
    const g = this.model.group;
    g.position.copy(this.pos);
    g.rotation.set(-this.pitch, this.yaw, this.roll);
  }

  dispose() { this.scene.remove(this.model.group); this.model.dispose(); }
}
