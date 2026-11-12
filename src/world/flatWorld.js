// Yedek (anahtarsız) dünya: düz zemine serilmiş 2B harita karoları.
// Google API anahtarı yokken oyunun denenebilmesi içindir.
import * as THREE from 'three';
import { U } from './environment.js';
import { makeTerrainMaterial } from './terrainMaterial.js';

const TILE_URL = import.meta.env.VITE_FALLBACK_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const Z = 17;
const N = 2 ** Z;
const RADIUS = 4; // oyuncunun çevresinde (2R+1)^2 karo
const DEG = Math.PI / 180;

const lon2x = (lon) => ((lon + 180) / 360) * N;
const lat2y = (lat) => ((1 - Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG)) / Math.PI) / 2) * N;

function placeholderTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e6df'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#cfcbc2'; g.lineWidth = 2; g.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFlatWorld({ scene, camera, origin }) {
  const group = new THREE.Group();
  scene.add(group);
  U.uFlat.value = 1;
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const placeholder = placeholderTexture();
  const tiles = new Map();
  let ox = 0, oy = 0, size = 1; // köken (karo birimi) ve bir karonun metre cinsinden kenarı

  function clear() {
    for (const t of tiles.values()) dropTile(t);
    tiles.clear();
  }
  function dropTile(t) {
    group.remove(t.mesh);
    t.mesh.geometry.dispose();
    if (t.mesh.material.map && t.mesh.material.map !== placeholder) t.mesh.material.map.dispose();
    t.mesh.material.dispose();
    t.dead = true;
  }
  function addTile(tx, ty) {
    // +X batı, +Z kuzey
    const xW = -(tx - ox) * size, xE = -(tx + 1 - ox) * size;
    const zN = -(ty - oy) * size, zS = -(ty + 1 - oy) * size;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([xW, 0, zN, xE, 0, zN, xW, 0, zS, xE, 0, zS], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    const mat = makeTerrainMaterial(placeholder);
    mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    const t = { mesh, dead: false };
    tiles.set(tx + '/' + ty, t);
    const url = TILE_URL.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty);
    loader.load(url, (tex) => {
      if (t.dead) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      mat.uniforms.map.value = tex;
      mat.map = tex;
    }, undefined, () => {});
  }

  const world = { type: 'flat', ready: true, error: null };
  const result = { point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), distance: 0 };

  world.raycast = (from, dir, far) => {
    if (dir.y >= -1e-6 || from.y < 0) return null;
    const d = -from.y / dir.y;
    if (d > far) return null;
    result.point.copy(dir).multiplyScalar(d).add(from);
    result.point.y = 0;
    result.normal.set(0, 1, 0);
    result.distance = d;
    return result;
  };

  world.setOrigin = (lat, lon) => {
    clear();
    ox = lon2x(lon);
    oy = lat2y(lat);
    size = (40075016.686 * Math.cos(lat * DEG)) / N;
  };
  world.setOrigin(origin.lat, origin.lon);

  let lastKey = '';
  world.update = () => {
    const cx = Math.floor(ox - camera.position.x / size);
    const cy = Math.floor(oy - camera.position.z / size);
    const key = cx + '/' + cy;
    if (key === lastKey && tiles.size) return;
    lastKey = key;
    for (const [k, t] of tiles) {
      const [tx, ty] = k.split('/').map(Number);
      if (Math.abs(tx - cx) > RADIUS + 1 || Math.abs(ty - cy) > RADIUS + 1) { dropTile(t); tiles.delete(k); }
    }
    for (let dy = -RADIUS; dy <= RADIUS; dy++)
      for (let dx = -RADIUS; dx <= RADIUS; dx++)
        if (!tiles.has(cx + dx + '/' + (cy + dy))) addTile(cx + dx, cy + dy);
  };

  world.setQuality = () => {};
  world.progress = () => 1;
  world.attribution = () => '© OpenStreetMap katkıcıları · Demo modu (2B harita)';
  world.dispose = () => { clear(); scene.remove(group); placeholder.dispose(); };
  return world;
}
