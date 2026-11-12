// Üçüncü şahıs takip kamerası (yaya ve araç için ortak).
import * as THREE from 'three';
import { clamp, damp, dampAngle } from './physics.js';

export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;          // kameranın baktığı yatay yön
    this.pitch = 0.22;     // aşağı bakış açısı
    this.dist = 5;
    this.idle = 10;
    this.target = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._want = new THREE.Vector3();
    this.near = false;
  }

  snap(yaw) { this.yaw = yaw; this.idle = 10; }

  // focus: takip edilen nokta (zemin), opts: {height, distance, followYaw, speed}
  update(dt, look, focus, opts, world) {
    const sens = 0.0026;
    if (look.x || look.y) {
      this.yaw -= look.x * sens;
      this.pitch = clamp(this.pitch + look.y * sens, -0.35, 1.25);
      this.idle = 0;
    } else this.idle += dt;

    // Araçtayken bir süre dokunulmazsa kamera aracın arkasına döner.
    if (opts.followYaw !== undefined && this.idle > 1.2 && opts.speed > 1.5) {
      this.yaw = dampAngle(this.yaw, opts.followYaw, 2.4, dt);
      this.pitch = damp(this.pitch, 0.2, 1.5, dt);
    }

    const wantDist = opts.distance * (this.near ? 0.62 : 1);
    this.target.set(focus.x, focus.y + opts.height, focus.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._dir.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);

    // Kamera ile hedef arasına bina girerse yaklaş.
    let d = wantDist;
    const hit = world.raycast(this.target, this._dir, wantDist + 0.4);
    if (hit) d = Math.max(0.8, hit.distance - 0.4);
    this.dist = d < this.dist ? d : damp(this.dist, d, 4, dt);

    this._want.copy(this._dir).multiplyScalar(this.dist).add(this.target);
    this.camera.position.copy(this._want);
    this.camera.lookAt(this.target);
  }
}
