// Dünya yüzeyine ışın atan küçük yardımcılar. world.raycast paylaşımlı bir sonuç döndürdüğü
// için değerler burada kopyalanır.
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const from = new THREE.Vector3();

// (x, z) noktasında yTop yüksekliğinden aşağı bakar. Zemin yüksekliğini veya null döndürür.
export function groundY(world, x, yTop, z, maxDist, outNormal) {
  from.set(x, yTop, z);
  const h = world.raycast(from, DOWN, maxDist);
  if (!h) return null;
  if (outNormal) outNormal.copy(h.normal);
  return h.point.y;
}

// Çok yukarıdan bakarak en üst yüzeyi bulur (doğma / kurtarma için).
export function surfaceY(world, x, z) {
  return groundY(world, x, 6000, z, 12000);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export function dampAngle(cur, target, rate, dt) {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-rate * dt));
}
