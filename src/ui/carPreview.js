// Başlangıç ekranındaki dönen araç önizlemesi (ayrı küçük bir WebGL sahnesi).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildVehicleMesh } from '../vehicles/builder.js';

export function createCarPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.DirectionalLight(0xffffff, 1.5).translateX(3).translateY(5).translateZ(4));
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  let model = null, angle = 0.7, last = 0;

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    show(spec, mods) {
      if (model) { scene.remove(model.group); model.dispose(); }
      model = buildVehicleMesh(spec, mods);
      model.setLights(true, false);
      scene.add(model.group);
      const d = Math.max(spec.dims.length * 1.75, spec.dims.height * 3.4);
      camera.position.set(0, spec.dims.height * 0.95, d);
      camera.lookAt(0, spec.dims.height * 0.42, 0);
    },
    render(time) {
      if (!model || !canvas.offsetParent) return;
      const dt = Math.min(0.05, time - last); last = time;
      angle += dt * 0.5;
      model.group.rotation.y = angle;
      resize();
      renderer.render(scene, camera);
    },
  };
}
