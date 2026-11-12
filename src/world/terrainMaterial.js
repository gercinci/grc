// Google fotogerçekçi karolarının (ve yedek 2B harita zemininin) malzemesi.
// Dokuyu olduğu gibi gösterir; üzerine hava durumuna göre ıslak yol, kar, deniz dalgası,
// gece karartması, far ışığı ve sis ekler.
import * as THREE from 'three';
import { U } from './environment.js';
import { NOISE_GLSL, SEA_GLSL, SKY_GLSL } from './shaders.js';

const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.colorSpace = THREE.SRGBColorSpace;
white.needsUpdate = true;

const vertexShader = /* glsl */ `
uniform mat3 uUvTransform;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vView;
void main(){
  vUv = (uUvTransform * vec3(uv, 1.0)).xy;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D map; uniform vec3 uTint;
uniform vec3 uLight; uniform vec3 uFogColor; uniform float uFogDensity;
uniform float uWet; uniform float uSnow; uniform float uSeaY; uniform float uFlat; uniform vec3 uWaterKey;
uniform vec3 uHeadPos; uniform vec3 uHeadDir; uniform float uHeadOn;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vView;
${NOISE_GLSL}
${SKY_GLSL}
${SEA_GLSL}
void main(){
  vec3 tex = texture2D(map, vUv).rgb * uTint;
  // Karolarda normal verisi yok; yüzey normalini ekran türevlerinden çıkarıyoruz.
  vec3 nv = normalize(cross(dFdx(vView), dFdy(vView)));
  if (nv.z < 0.0) nv = -nv;
  vec3 N = normalize(transpose(mat3(viewMatrix)) * nv);
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 0.001);
  float up = smoothstep(0.72, 0.95, N.y);

  // Deniz maskesi
  float water;
  if (uFlat > 0.5) {
    vec3 s = pow(tex, vec3(1.0 / 2.2));
    water = 1.0 - smoothstep(0.05, 0.12, distance(s, uWaterKey));
  } else {
    float h = vWorld.y + dot(vWorld.xz, vWorld.xz) / (2.0 * 6371000.0) - uSeaY;
    float blue = (tex.g + tex.b) * 0.5 - tex.r;
    water = up * smoothstep(2.5, 1.0, h) * smoothstep(-0.004, 0.02, blue);
  }
  float land = 1.0 - water;
  vec3 col = tex;

  // Islak yol: koyulaşma + su birikintilerinde gökyüzü yansıması
  float w = uWet * up * land;
  if (w > 0.002) {
    float pud = smoothstep(0.42, 0.68, fbm(vWorld.xz * 0.22));
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    vec3 R = reflect(-V, N); R.y = abs(R.y);
    // yağmur damlası halkaları
    vec2 cell = floor(vWorld.xz * 1.6); vec2 fc = fract(vWorld.xz * 1.6) - 0.5;
    float ph = fract(hash21(cell) + uTime * 1.3);
    float ring = smoothstep(0.05, 0.0, abs(length(fc) - ph * 0.45)) * (1.0 - ph) * step(dist, 60.0);
    col *= mix(1.0, 0.58, w);
    col = mix(col, skyGradient(R), w * (0.06 + 0.55 * fres) * (0.35 + 0.65 * pud));
    col += uSunColor * pow(max(dot(R, uSunDir), 0.0), 90.0) * w * uSunVis * (0.3 + pud);
    col += vec3(0.12) * ring * pud * w;
  }

  // Kar örtüsü
  float sn = uSnow * up * land * smoothstep(0.25, 0.6, fbm(vWorld.xz * 0.35) + uSnow * 0.45);
  col = mix(col, vec3(0.9, 0.93, 0.98), sn);

  // Deniz
  if (water > 0.002) col = mix(col, seaShade(vWorld.xz, V, dist) / max(uLight, vec3(0.05)), water * 0.92);

  col *= uLight;

  // Araç farı
  if (uHeadOn > 0.01) {
    vec3 L = vWorld - uHeadPos; float d = length(L); L /= max(d, 0.001);
    float cone = smoothstep(0.86, 0.985, dot(L, uHeadDir)) * smoothstep(0.0, 2.5, d);
    col += (tex + 0.03) * vec3(1.0, 0.94, 0.8) * cone * uHeadOn * 1.5 / (1.0 + 0.006 * d * d);
  }

  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const shared = [
  'uTime', 'uLight', 'uFogColor', 'uFogDensity', 'uSkyColor', 'uHorizonColor', 'uSunDir', 'uSunColor', 'uSunVis',
  'uNight', 'uCloud', 'uWind', 'uWet', 'uSnow', 'uSeaColor', 'uWave', 'uFoam', 'uSeaY', 'uFlat', 'uWaterKey',
  'uHeadPos', 'uHeadDir', 'uHeadOn',
];

export function makeTerrainMaterial(map, tint) {
  const uniforms = {
    map: { value: map || white },
    uTint: { value: tint ? tint.clone() : new THREE.Color(1, 1, 1) },
    uUvTransform: { value: new THREE.Matrix3() },
  };
  if (map) {
    map.updateMatrix();
    uniforms.uUvTransform.value.copy(map.matrix);
  }
  for (const k of shared) uniforms[k] = U[k];
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  mat.map = map || null; // karo silinirken dokunun da serbest bırakılabilmesi için
  return mat;
}

// Yüklenen bir karo sahnesindeki tüm malzemeleri oyunun zemin malzemesiyle değiştirir.
export function applyTerrainMaterial(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    o.material = makeTerrainMaterial(old.map, old.map ? null : old.color);
    o.material.side = old.side;
    old.dispose();
  });
}
