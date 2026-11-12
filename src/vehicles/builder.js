// Katalogdaki ölçülerden ve modifiye ayarlarından prosedürel araç modeli üretir.
// Araç yerel ekseni: +Z ön, +Y yukarı, köken zeminde ve aracın ortasında.
import * as THREE from 'three';
import { defaultMods } from './mods.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function plateTexture(text) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#f5f5f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b3fa0'; g.fillRect(0, 0, 26, h);
    g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText('TR', 13, h - 8);
    g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    g.fillStyle = '#111'; g.font = 'bold 42px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText(text, 26 + (w - 26) / 2, h / 2 + 3, w - 40);
  });
}

function signTexture(text, bg, fg) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 40px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2, w - 16);
  });
}

let shadowTex = null;
export function blobShadow(w, l) {
  shadowTex ||= canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.renderOrder = 2;
  return m;
}

// Yan profil (z ileri, y yukarı) -> genişlik boyunca (x) ekstrüzyon
function extrudeProfile(shape, width, bevel = 0) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: 10,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2 - bevel, 0, 0);
  return geo;
}

function randomPlate(id) {
  let s = 0;
  for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const L = 'ABCDEFGHJKLMNPRSTUVYZ';
  const l = (n) => L[(s >> n) % L.length];
  return `34 ${l(1)}${l(5)}${l(9)} ${String(100 + (s % 900))}`;
}

export function buildVehicleMesh(spec, modsIn) {
  const mods = { ...defaultMods(), ...(modsIn || {}) };
  const { length: L, width: W, height: H, wheelbase: WB, clearance: CLR, wheelRadius: WR } = spec.dims;
  const sh = spec.shape;
  const ex = spec.extras || {};
  const paintColor = new THREE.Color(mods.paint || spec.paint);

  const M = {
    paint: new THREE.MeshStandardMaterial({ color: paintColor, metalness: 0.55, roughness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x9fb4c2).lerp(new THREE.Color(0x05070a), 0.45 + 0.55 * (mods.tint ?? 0.35)), metalness: 0.9, roughness: 0.08,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15161a, metalness: 0.2, roughness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.18 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: new THREE.Color(mods.rimColor || '#b9bcc0'), metalness: 0.9, roughness: 0.3 }),
    head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 0.15 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x8a0d10, emissive: 0xff1a1a, emissiveIntensity: 0.25 }),
  };

  const group = new THREE.Group();
  const body = new THREE.Group(); // süspansiyonla birlikte hareket eden kısım
  body.position.y = mods.rideHeight || 0;
  group.add(body);
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // --- Alt gövde ---
  const yb = CLR + 0.04;
  const zf = L / 2, zr = -L / 2;
  const cabF = zf - sh.hood;        // ön cam tabanı
  const cabR = zr + sh.trunk;       // arka cam tabanı
  const arch = WR + 0.07;
  const belt = sh.belt;
  const s = new THREE.Shape();
  s.moveTo(zr + 0.05, yb);
  s.lineTo(-WB / 2 - arch, yb);
  s.absarc(-WB / 2, yb, arch, Math.PI, 0, true);
  s.lineTo(WB / 2 - arch, yb);
  s.absarc(WB / 2, yb, arch, Math.PI, 0, true);
  s.lineTo(zf - 0.05, yb);
  s.lineTo(zf, yb + 0.16);
  s.lineTo(zf, belt - 0.2);
  s.lineTo(zf - 0.1, belt - 0.08);
  s.lineTo(cabF, belt);
  s.lineTo(cabR, belt);
  if (sh.trunk > 0.2) { s.lineTo(zr + 0.06, belt - 0.03); s.lineTo(zr, belt - 0.14); }
  else s.lineTo(zr, belt - 0.02);
  s.lineTo(zr, yb + 0.16);
  s.closePath();
  add(extrudeProfile(s, W, 0.05), M.paint);
  // tekerlek yuvalarının içi
  add(new THREE.BoxGeometry(W - 0.3, belt - yb - 0.12, L - 0.3), M.dark, 0, (belt + yb) / 2 - 0.02, 0);

  // --- Kabin (cam bloğu + çerçeve + tavan) ---
  const roofY = H;
  const topF = cabF - sh.screenRake;
  const topR = cabR + sh.rearRake;
  const cab = new THREE.Shape();
  cab.moveTo(cabR, belt - 0.02); cab.lineTo(cabF, belt - 0.02); cab.lineTo(topF, roofY - 0.05); cab.lineTo(topR, roofY - 0.05); cab.closePath();
  const cabW = W * 0.88;
  add(extrudeProfile(cab, cabW - 0.03), M.glass);

  // yan çerçeveler: kabin profili, cam delikleriyle
  const frame = new THREE.Shape();
  frame.moveTo(cabR, belt - 0.02); frame.lineTo(cabF, belt - 0.02); frame.lineTo(topF, roofY - 0.02); frame.lineTo(topR, roofY - 0.02); frame.closePath();
  const cabH = roofY - belt;
  const at = (z, t) => { // t: 0 kemer, 1 tavan -> eğimi izleyen z
    const zfEdge = cabF + (topF - cabF) * t, zrEdge = cabR + (topR - cabR) * t;
    return zrEdge + (zfEdge - zrEdge) * z;
  };
  const pillars = spec.body === 'van' ? [0.02, 0.26, 0.5, 0.74, 0.97] : spec.body === 'coupe' ? [0.05, 0.6, 0.95] : [0.04, 0.47, 0.53, 0.96];
  const winCount = spec.body === 'van' ? 4 : 2;
  for (let i = 0; i < winCount; i++) {
    const a = spec.body === 'van' ? pillars[i] + 0.02 : (i === 0 ? pillars[0] : pillars[2]);
    const b = spec.body === 'van' ? pillars[i + 1] - 0.02 : (i === 0 ? pillars[1] : pillars[pillars.length - 1]);
    const hole = new THREE.Path();
    const y0 = belt + cabH * 0.1, y1 = belt + cabH * 0.86;
    hole.moveTo(at(a, 0.1), y0); hole.lineTo(at(b, 0.1), y0); hole.lineTo(at(b, 0.86), y1); hole.lineTo(at(a, 0.86), y1); hole.closePath();
    frame.holes.push(hole);
  }
  for (const side of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(frame, { depth: 0.03, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    g.translate(side * (cabW / 2) + (side > 0 ? 0.03 : 0), 0, 0);
    add(g, M.paint);
  }
  // tavan + ön/arka cam çerçevesi
  add(new THREE.BoxGeometry(cabW, 0.05, topF - topR), M.paint, 0, roofY - 0.025, (topF + topR) / 2);

  // --- Tamponlar, ızgara, farlar ---
  const bumperMat = ex.chromeBumpers ? M.chrome : M.dark;
  add(new THREE.BoxGeometry(W + 0.04, 0.14, 0.16), bumperMat, 0, yb + 0.14, zf - 0.02);
  add(new THREE.BoxGeometry(W + 0.04, 0.14, 0.16), bumperMat, 0, yb + 0.14, zr + 0.02);
  const lightY = belt - 0.3;
  if (ex.lightBar) {
    add(new THREE.BoxGeometry(W * 0.86, 0.045, 0.05), M.head, 0, belt - 0.2, zf - 0.02);
    add(new THREE.BoxGeometry(W * 0.86, 0.045, 0.05), M.tail, 0, belt - 0.12, zr + 0.01);
  } else {
    add(new THREE.BoxGeometry(W * 0.5, 0.15, 0.05), M.dark, 0, lightY, zf + 0.005); // ızgara
    for (const side of [-1, 1]) {
      if (ex.roundLights) {
        const g = new THREE.CylinderGeometry(0.095, 0.095, 0.05, 16); g.rotateX(Math.PI / 2);
        add(g, M.head, side * (W / 2 - 0.22), lightY, zf + 0.01);
      } else add(new THREE.BoxGeometry(0.3, 0.15, 0.05), M.head, side * (W / 2 - 0.22), lightY, zf + 0.01);
      add(new THREE.BoxGeometry(0.32, 0.14, 0.05), M.tail, side * (W / 2 - 0.22), belt - 0.28, zr - 0.005);
    }
  }
  if (ex.sideStripe) for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.05, L * 0.82), M.dark, side * (W / 2 + 0.002), belt - 0.26, 0);

  // --- Plakalar ---
  const plate = new THREE.MeshBasicMaterial({ map: plateTexture(mods.plate || randomPlate(spec.id)) });
  const pf = add(new THREE.PlaneGeometry(0.46, 0.115), plate, 0, yb + 0.15, zf + 0.065);
  const pr = add(new THREE.PlaneGeometry(0.46, 0.115), plate, 0, yb + 0.3, zr - 0.035);
  pr.rotation.y = Math.PI; void pf;

  // --- Araca özel eklentiler ---
  if (ex.taxiSign) {
    const sign = new THREE.MeshBasicMaterial({ map: signTexture('TAKSİ', '#f6c400', '#111') });
    const box = add(new THREE.BoxGeometry(0.5, 0.15, 0.16), [M.dark, M.dark, M.dark, M.dark, sign, sign], 0, roofY + 0.075, (topF + topR) / 2);
    void box;
  }
  if (ex.routeBoard) {
    const board = new THREE.MeshBasicMaterial({ map: signTexture('TAKSİM · BEŞİKTAŞ', '#101010', '#ffd21f') });
    const b = add(new THREE.PlaneGeometry(1.1, 0.2), board, 0, roofY - 0.22, topF + 0.07);
    b.rotation.x = -0.25;
  }
  if (ex.roofRack) {
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.03, (topF - topR) * 0.8), M.chrome, side * (cabW / 2 - 0.08), roofY + 0.07, (topF + topR) / 2);
    for (const k of [-0.3, 0, 0.3]) add(new THREE.BoxGeometry(cabW - 0.16, 0.025, 0.03), M.chrome, 0, roofY + 0.07, (topF + topR) / 2 + k * (topF - topR));
  }
  const spoiler = mods.spoiler !== 'none' ? mods.spoiler : ex.spoilerLip ? 'lip' : 'none';
  if (spoiler === 'lip') add(new THREE.BoxGeometry(W * 0.9, 0.035, 0.14), M.paint, 0, belt + 0.01, zr + 0.1);
  if (spoiler === 'wing') {
    add(new THREE.BoxGeometry(W * 0.95, 0.03, 0.22), M.paint, 0, belt + 0.26, zr + 0.14);
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.26, 0.12), M.dark, side * W * 0.34, belt + 0.12, zr + 0.14);
  }
  if (mods.neon) {
    const neon = add(new THREE.PlaneGeometry(W * 1.25, L * 1.1),
      new THREE.MeshBasicMaterial({ color: mods.neon, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, map: blobShadow(1, 1).material.map }),
      0, 0.05, 0, group);
    neon.rotation.x = -Math.PI / 2;
  }
  if (!spec.perf.electric) { // egzoz
    const g = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10); g.rotateX(Math.PI / 2);
    add(g, M.chrome, -W / 2 + 0.3, yb + 0.03, zr + 0.02);
  }

  // --- Tekerlekler ---
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(WR, WR, 0.2, 20); tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(WR * 0.62, WR * 0.62, 0.21, mods.rimStyle === 'spoke' ? 6 : 14); rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.BoxGeometry(0.215, WR * 1.05, 0.05);
  for (const front of [true, false]) for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (W / 2 - 0.11), WR, (front ? 1 : -1) * WB / 2);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tireGeo, M.tire), new THREE.Mesh(rimGeo, M.rim), new THREE.Mesh(hubGeo, M.dark));
    pivot.add(spin);
    group.add(pivot);
    wheels.push({ pivot, spin, front });
  }

  group.add(blobShadow(W * 1.5, L * 1.25));

  return {
    group, body, wheels, materials: M,
    setLights(on, braking) {
      M.head.emissiveIntensity = on ? 2.2 : 0.15;
      M.tail.emissiveIntensity = braking ? 2.5 : on ? 0.9 : 0.25;
    },
    dispose() {
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of [].concat(o.material)) { if (m.map && m.map !== shadowTex) m.map.dispose(); m.dispose(); }
      });
    },
  };
}
