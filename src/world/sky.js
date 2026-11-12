// Gökyüzü kubbesi (bulut, güneş, yıldız) ve yağmur / kar parçacıkları.
import * as THREE from 'three';
import { U, envState } from './environment.js';
import { NOISE_GLSL, SKY_GLSL } from './shaders.js';

export function createSky(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: U,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        ${NOISE_GLSL}
        ${SKY_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = skyGradient(d);
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(sd, 2500.0) * 4.0 + pow(sd, 60.0) * 0.3 + pow(sd, 6.0) * 0.08) * uSunVis;
          // yıldızlar
          vec3 g = floor(d * 190.0);
          float star = step(0.9975, hash21(g.xy + g.z * 13.7));
          col += vec3(star) * uNight * (1.0 - uCloud) * smoothstep(0.02, 0.3, d.y) * 0.8;
          // bulutlar
          if (d.y > 0.01) {
            vec2 p = d.xz / (d.y + 0.12) * 1.3 + uWind * uTime * 0.006;
            float c = fbm(p * 1.4 + fbm(p * 3.0) * 0.5);
            float cover = smoothstep(1.0 - uCloud * 0.95, 1.25 - uCloud * 0.75, c + 0.32);
            float dayL = 1.0 - uNight;
            vec3 cc = mix(vec3(0.95), vec3(0.42, 0.44, 0.48), uCloud * 0.8) * (0.05 + 0.95 * dayL);
            cc = mix(cc, uHorizonColor * 1.1, 0.35);
            col = mix(col, cc, cover * smoothstep(0.01, 0.18, d.y));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);
  return sky;
}

// Kamerayı çevreleyen bir kutu içinde GPU üzerinde sarmalanan yağış parçacıkları.
function makePrecip(count, isSnow) {
  const BOX = isSnow ? 40 : 34;
  const pos = new Float32Array(count * (isSnow ? 3 : 6));
  const tip = new Float32Array(count * (isSnow ? 1 : 2));
  for (let i = 0; i < count; i++) {
    const x = Math.random() * BOX, y = Math.random() * BOX, z = Math.random() * BOX;
    if (isSnow) { pos.set([x, y, z], i * 3); tip[i] = Math.random(); }
    else { pos.set([x, y, z, x, y, z], i * 6); tip[i * 2] = 0; tip[i * 2 + 1] = 1; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  const uniforms = {
    uTime: U.uTime, uWind: U.uWind, uLight: U.uLight,
    uCam: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uBox: { value: BOX },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform vec2 uWind; uniform vec3 uCam; uniform float uBox; uniform float uAmount;
      attribute float aTip; varying float vA;
      void main(){
        vec3 vel = ${isSnow ? 'vec3(uWind.x * 1.2, -1.4, uWind.y * 1.2)' : 'vec3(uWind.x * 3.0, -22.0, uWind.y * 3.0)'};
        vec3 p = position + vel * uTime;
        ${isSnow ? 'p.xz += vec2(sin(uTime * 0.9 + aTip * 40.0), cos(uTime * 0.7 + aTip * 31.0)) * 0.6;' : ''}
        p = mod(p - uCam, uBox) - uBox * 0.5 + uCam;
        ${isSnow ? '' : 'p += normalize(vel) * aTip * 0.55;'}
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        ${isSnow ? 'gl_PointSize = clamp((1.5 + aTip * 2.0) * 22.0 / max(-mv.z, 1.0), 1.5, 9.0);' : ''}
        vA = uAmount * smoothstep(uBox * 0.5, uBox * 0.3, length(p - uCam));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; varying float vA;
      void main(){
        ${isSnow ? 'float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.25, d) * 0.9;' : 'float a = 0.32;'}
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * (0.35 + 0.65 * uLight), a * vA);
      }`,
  });
  const obj = isSnow ? new THREE.Points(geo, mat) : new THREE.LineSegments(geo, mat);
  obj.frustumCulled = false;
  obj.renderOrder = 10;
  obj.visible = false;
  return obj;
}

export function createPrecipitation(scene, lowPower) {
  const rain = makePrecip(lowPower ? 2500 : 6000, false);
  const snow = makePrecip(lowPower ? 2500 : 5000, true);
  scene.add(rain, snow);
  let rainAmt = 0, snowAmt = 0;
  return {
    update(dt, camera) {
      const e = 1 - Math.exp(-dt * 1.2);
      rainAmt += (envState.rain - rainAmt) * e;
      snowAmt += (envState.snowfall - snowAmt) * e;
      rain.visible = rainAmt > 0.02;
      snow.visible = snowAmt > 0.02;
      rain.material.uniforms.uAmount.value = rainAmt;
      snow.material.uniforms.uAmount.value = snowAmt;
      rain.material.uniforms.uCam.value.copy(camera.position);
      snow.material.uniforms.uCam.value.copy(camera.position);
    },
  };
}
