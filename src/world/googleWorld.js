// Google Photorealistic 3D Tiles (Map Tiles API) ile gerçek 3B İstanbul.
import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import { GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/plugins';
import { U } from './environment.js';
import { applyTerrainMaterial } from './terrainMaterial.js';

const DEG = Math.PI / 180;

export function createGoogleWorld({ apiKey, renderer, camera, scene, errorTarget, origin }) {
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
  const draco = new DRACOLoader().setDecoderPath(new URL('draco/', document.baseURI).href);
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  const reorient = new ReorientationPlugin({ lat: origin.lat * DEG, lon: origin.lon * DEG, height: 0, recenter: true });
  tiles.registerPlugin(reorient);
  // Karo modelleri oluşturulurken malzemelerini hava durumuna duyarlı zemin malzemesiyle değiştir.
  tiles.registerPlugin({ name: 'PIYASA_TERRAIN_MATERIAL', processTileModel: (tileScene) => applyTerrainMaterial(tileScene) });

  tiles.errorTarget = errorTarget;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  scene.add(tiles.group);
  U.uFlat.value = 0;

  const world = {
    type: 'google',
    ready: false,
    error: null,
    tiles,
  };

  tiles.addEventListener('load-root-tileset', () => { world.ready = true; });
  tiles.addEventListener('load-error', (e) => {
    if (!world.ready && !world.error) {
      world.error = 'Google 3D harita yüklenemedi. API anahtarını ve "Map Tiles API" yetkisini kontrol edin.';
      console.error('[Piyasa İstanbul] Karo hatası:', e.error || e);
    }
  });

  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const hits = [];
  const result = { point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0 };

  // origin'den dir yönünde en yakın yüzey. Dönen nesne paylaşımlıdır; hemen kullanın.
  world.raycast = (from, dir, far) => {
    raycaster.set(from, dir);
    raycaster.far = far;
    hits.length = 0;
    tiles.raycast(raycaster, hits);
    if (!hits.length) return null;
    let h = hits[0];
    for (let i = 1; i < hits.length; i++) if (hits[i].distance < h.distance) h = hits[i];
    result.point.copy(h.point);
    result.distance = h.distance;
    if (h.face) result.normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    else result.normal.set(0, 1, 0);
    if (result.normal.dot(dir) > 0) result.normal.negate();
    return result;
  };

  world.setOrigin = (lat, lon) => {
    reorient.lat = lat * DEG;
    reorient.lon = lon * DEG;
    if (tiles.root) reorient.transformLatLonHeightToOrigin(reorient.lat, reorient.lon, 0);
  };

  world.setQuality = (target) => { tiles.errorTarget = target; };

  world.update = () => {
    tiles.setResolutionFromRenderer(camera, renderer);
    camera.updateMatrixWorld();
    tiles.update();
  };

  world.progress = () => (world.ready ? tiles.loadProgress : 0);

  world.attribution = () => {
    const list = tiles.getAttributions();
    const text = list.filter((a) => a.type === 'string').map((a) => a.value).join(' ');
    return 'Google · ' + text;
  };

  world.dispose = () => {
    scene.remove(tiles.group);
    tiles.dispose();
    draco.dispose();
  };

  return world;
}
