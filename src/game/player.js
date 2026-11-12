// Yaya karakter: basit prosedürel model + zemini ışınla izleyen yürüme fiziği.
import * as THREE from 'three';
import { blobShadow } from '../vehicles/builder.js';
import { clamp, dampAngle, groundY, surfaceY } from './physics.js';

const WALK = 2.6, RUN = 7.2, STEP = 0.6, GRAVITY = 22;

function buildCharacter() {
  const g = new THREE.Group();
  const mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const skin = mat(0xd9a57e), jacket = mat(0x1d2430), jeans = mat(0x2d4a73), shoe = mat(0xf0f0f0), hair = mat(0x18120e);
  const part = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  part(new THREE.BoxGeometry(0.44, 0.58, 0.24), jacket, 0, 1.2, 0);
  part(new THREE.BoxGeometry(0.4, 0.14, 0.23), jeans, 0, 0.86, 0);
  part(new THREE.BoxGeometry(0.21, 0.24, 0.22), skin, 0, 1.64, 0);
  part(new THREE.BoxGeometry(0.23, 0.09, 0.24), hair, 0, 1.78, -0.01);
  const limb = (m, x, y, len, w, foot) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); g.add(pivot);
    part(new THREE.BoxGeometry(w, len, w), m, 0, -len / 2, 0, pivot);
    if (foot) part(new THREE.BoxGeometry(w + 0.02, 0.08, 0.27), shoe, 0, -len + 0.02, 0.05, pivot);
    else part(new THREE.BoxGeometry(w, 0.1, w), skin, 0, -len - 0.03, 0, pivot);
    return pivot;
  };
  const parts = {
    armL: limb(jacket, 0.29, 1.47, 0.56, 0.13, false), armR: limb(jacket, -0.29, 1.47, 0.56, 0.13, false),
    legL: limb(jeans, 0.11, 0.82, 0.78, 0.16, true), legR: limb(jeans, -0.11, 0.82, 0.78, 0.16, true),
  };
  g.add(blobShadow(0.9, 0.9));
  return { group: g, parts };
}

export class Player {
  constructor(scene) {
    const { group, parts } = buildCharacter();
    this.mesh = group; this.parts = parts;
    scene.add(group);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.vy = 0;
    this.onGround = true;
    this.speed = 0;
    this.phase = 0;
    this.rescueTimer = 0;
    this._dir = new THREE.Vector3();
    this._from = new THREE.Vector3();
    this._n = new THREE.Vector3();
  }

  setVisible(v) { this.mesh.visible = v; }

  teleport(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vy = 0; this.onGround = true;
    if (yaw !== undefined) this.yaw = yaw;
    this.sync();
  }

  // move: {x, y, run, jump}; camYaw: kameranın baktığı yön
  update(dt, move, camYaw, world) {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let dx = fx * move.y - fz * move.x;
    let dz = fz * move.y + fx * move.x;
    const mag = Math.hypot(dx, dz);
    const target = mag > 0.05 ? (move.run ? RUN : WALK) * Math.min(1, mag) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);

    if (mag > 0.05) {
      dx /= mag; dz /= mag;
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
      let sx = dx * this.speed * dt, sz = dz * this.speed * dt;

      // Duvar kontrolü: diz üstü hizadan ileri ışın; çarparsa duvar boyunca kay.
      this._from.set(this.pos.x, this.pos.y + 0.75, this.pos.z);
      this._dir.set(dx, 0, dz);
      const hit = world.raycast(this._from, this._dir, Math.hypot(sx, sz) + 0.4);
      if (hit && hit.normal.y < 0.6) {
        const nx = hit.normal.x, nz = hit.normal.z, nl = Math.hypot(nx, nz) || 1;
        const dot = (sx * nx + sz * nz) / nl;
        if (dot < 0) { sx -= (nx / nl) * dot; sz -= (nz / nl) * dot; }
        if (hit.distance < 0.3) { sx += (nx / nl) * (0.3 - hit.distance); sz += (nz / nl) * (0.3 - hit.distance); }
      }
      // Basamak kontrolü: yeni konumdaki zemin çok yüksekse girilmez.
      const gy = groundY(world, this.pos.x + sx, this.pos.y + 1.4, this.pos.z + sz, 1.4 + 60);
      if (gy === null || gy - this.pos.y <= STEP) { this.pos.x += sx; this.pos.z += sz; }
      else this.speed *= 0.5;
    }

    // Dikey hareket
    const gy = groundY(world, this.pos.x, this.pos.y + 1.4, this.pos.z, 1.4 + 80, this._n);
    if (this.onGround && move.jump) { this.vy = 6.2; this.onGround = false; }
    if (gy === null) {
      // Altımızda yüzey yok (karo henüz yüklenmemiş ya da zeminin altındayız): bekle, gerekirse kurtar.
      this.vy = 0;
      this.rescueTimer += dt;
      if (this.rescueTimer > 0.4) { this.rescueTimer = 0; const top = surfaceY(world, this.pos.x, this.pos.z); if (top !== null) this.pos.y = top; }
    } else {
      this.rescueTimer = 0;
      if (this.onGround && gy >= this.pos.y - STEP) { this.pos.y = gy; this.vy = 0; }
      else {
        this.onGround = false;
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= gy) { this.pos.y = gy; this.vy = 0; this.onGround = true; }
      }
    }
    this.sync(dt);
  }

  sync(dt = 0) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.phase += dt * (4 + this.speed * 1.5);
    const amp = clamp(this.speed / RUN, 0, 1) * 0.9 + (this.speed > 0.2 ? 0.25 : 0);
    const s = Math.sin(this.phase) * amp;
    const p = this.parts;
    p.legL.rotation.x = s; p.legR.rotation.x = -s;
    p.armL.rotation.x = -s * 0.8; p.armR.rotation.x = s * 0.8;
    if (!this.onGround) { p.armL.rotation.x = -2.2; p.armR.rotation.x = -2.2; }
  }
}
