// Zemin (3D karolar), deniz ve gökyüzü için ortak GLSL parçaları.
export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyColor; uniform vec3 uHorizonColor; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uSunVis; uniform float uNight; uniform float uCloud; uniform vec2 uWind; uniform float uTime;
vec3 skyGradient(vec3 d){
  float t = clamp(d.y, 0.0, 1.0);
  return mix(uHorizonColor, uSkyColor, pow(t, 0.45));
}
`;

// Hava durumuna duyarlı deniz yüzeyi: rüzgârla büyüyen dalgalar, gökyüzü yansıması, köpük.
export const SEA_GLSL = /* glsl */ `
uniform vec3 uSeaColor; uniform float uWave; uniform float uFoam;
vec3 seaShade(vec2 p, vec3 V, float dist){
  vec2 w = normalize(uWind + vec2(0.0001));
  vec2 side = vec2(-w.y, w.x);
  vec2 g = vec2(0.0);
  float t = uTime;
  g += w * 0.9 * cos(dot(w, p) * 0.09 + t * 0.9);
  g += normalize(w + side * 0.6) * 0.7 * cos(dot(normalize(w + side * 0.6), p) * 0.23 + t * 1.5);
  g += normalize(w - side * 0.8) * 0.5 * cos(dot(normalize(w - side * 0.8), p) * 0.61 + t * 2.3);
  g += side * 0.35 * cos(dot(side, p) * 1.7 + t * 3.1);
  g += (vec2(vnoise(p * 2.3 + t * 0.7), vnoise(p * 2.3 - t * 0.6 + 9.0)) - 0.5) * 0.9;
  float detail = 1.0 - smoothstep(60.0, 1400.0, dist);
  vec3 n = normalize(vec3(-g.x * uWave * 0.35 * detail, 1.0, -g.y * uWave * 0.35 * detail));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n); R.y = abs(R.y);
  vec3 col = mix(uSeaColor, skyGradient(R), fres * 0.85);
  col += uSunColor * pow(max(dot(R, uSunDir), 0.0), 220.0) * 2.5 * uSunVis;
  col += uSunColor * pow(max(dot(R, uSunDir), 0.0), 18.0) * 0.12 * uSunVis;
  float foam = smoothstep(0.62, 0.8, fbm(p * 0.18 + w * t * 0.5) + uFoam * 0.3) * uFoam * detail;
  return mix(col, vec3(0.85, 0.9, 0.92), foam * 0.7);
}
`;
