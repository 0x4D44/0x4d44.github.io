// REDROCK RAPIDS: pure definition. Sandstone canyon at golden hour (counter-clockwise lap, start heading east, canyon-pier launch deck).
// Set pieces: river esses -> NATURAL ARCH -> THE EYE (loop in an open basin) -> SPIRE CORKSCREW (helix around a rock tower) -> big west
// bulge that the SLOT CANYON shortcut cuts off -> carrier straight.
import * as THREE from 'three';
import { PathBuilder } from '../path.js';

function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1 + 7, y * 2.1 - 3) * 0.28 + vnoise(x * 4.3 - 5, y * 4.3 + 9) * 0.14 + vnoise(x * 8.7, y * 8.7 + 2) * 0.08; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const SPIRE = { x: 380, z: -1335, r: 34, h: 330 };       // rock tower the helix winds around
export const WATER_Y = 18;

export const redrockDef = (() => {
  const b = new PathBuilder();
  const ex = (x) => (x > 600 ? 600 + (x - 600) * 0.86 : x);     // squeeze the east side a little
  const add = (x, y, z, o) => b.add(ex(x), y, z, o);
  add(0, 110, 0, { mark: 'start', hw: 95, hh: 62 });
  add(250, 110, 0, { hw: 100, hh: 65 });
  add(560, 104, -22, { hw: 105, hh: 68 });
  add(860, 92, -75, { hw: 105, hh: 70 });
  add(1120, 84, -195, { hw: 100, hh: 66 });
  add(1290, 76, -375, { mark: 'bend', hw: 95, hh: 62 });
  add(1330, 78, -560, { mark: 'esses', hw: 88, hh: 54 });         // river esses
  add(1285, 76, -690, { hw: 90, hh: 54 });
  add(1360, 76, -820, { hw: 92, hh: 54 });
  add(1300, 78, -945, { hw: 90, hh: 54 });
  add(1245, 74, -1040, { mark: 'arch', hw: 58, hh: 44, bank: -10 });
  add(1170, 80, -1125, { hw: 90, hh: 64 });
  add(1030, 82, -1178, { hw: 105, hh: 75 });
  add(880, 82, -1180, { mark: 'eyeLead', hw: 105, hh: 80 });
  b.loop([-1, 0], { R: 95, drift: 44, n: 12, tail: 120, hw: 100, hh: 80, mark: 'loop' });
  add(580, 92, -1250, { hw: 100, hh: 70 });
  // ---- spire corkscrew: clockwise helix around SPIRE, 90 -> 245 m
  {
    const n = 14, R = 96, y0 = 92, y1 = 246;
    for (let k = 0; k <= n; k++) {
      const th = (k / n) * Math.PI * 2;
      add(SPIRE.x - R * Math.sin(th), y0 + (y1 - y0) * (k / n), SPIRE.z + R * Math.cos(th), { hw: 62, hh: 55, mark: k === 0 ? 'spireEntry' : k === n ? 'spireExit' : k === 7 ? 'spireMid' : undefined });
    }
  }
  add(160, 232, -1240, { hw: 90, hh: 66 });
  add(-60, 176, -1232, { hw: 100, hh: 70 });
  add(-300, 124, -1150, { mark: 'slotA', hw: 100, hh: 68 });      // shortcut junction
  add(-520, 108, -1110, { hw: 95, hh: 66 });
  add(-780, 102, -1000, { hw: 95, hh: 66 });
  add(-930, 98, -800, { mark: 'bulge', hw: 90, hh: 64 });
  add(-900, 94, -600, { hw: 90, hh: 64 });
  add(-720, 98, -420, { hw: 95, hh: 66 });
  add(-500, 102, -280, { mark: 'slotB', hw: 100, hh: 68 });       // shortcut rejoin
  add(-420, 106, -140, { hw: 112, hh: 70 });
  add(-340, 110, -30, { hw: 120, hh: 72 });
  add(-250, 110, 0, { mark: 'deckBack', hw: 124, hh: 74 });
  add(-120, 110, 0, { mark: 'deckMid', hw: 120, hh: 72 });
  return {
    id: 'redrock', laps: 3,
    points: b.pts, marks: b.marks, hw: 100, hh: 70,
    makeHeight: makeCanyon,
    waterLevel: WATER_Y,
    start: { back: 250, fwd: 70, halfW: 46 },
    items: ['bend', 'esses', 'spireExit', 'bulge', 'deckBack'],
    sectors: ['bend', 'arch', 'spireEntry', 'bulge'],
    gateSpacing: 255,
    branches: [{
      id: 'slot', name: 'Slot Canyon Shortcut', from: 'slotA', to: 'slotB', hw: 44, hh: 48, risk: 0.55, taper: 120,
      points: [[-335, 114, -1020], [-345, 106, -850], [-365, 102, -670], [-420, 100, -470]],
      marks: { slot: 1 },
    }],
    boost: [
      { branch: 0, u: 130, count: 7, gap: 120, radius: 17, weave: 6, power: 1.6, duration: 2.0 },   // slot canyon: rewarded line
      { mark: 'eyeLead', offset: -230, count: 3, gap: 45, radius: 22, power: 1.4, duration: 1.6 },
      { mark: 'spireEntry', offset: -150, count: 2, gap: 50, weave: 20, radius: 20, power: 1.35, duration: 1.5 },
      { mark: 'esses', offset: -80, count: 2, gap: 70, weave: 18, radius: 20 },
      { mark: 'bulge', offset: 120, count: 2, gap: 60, weave: 22, radius: 20 },
      { mark: 'deckMid', offset: -30, count: 1, radius: 22 },
    ],
    hazards: [
      { kind: 'stack', column: true, mark: 'esses', offset: 75, lateral: 24, radius: 12, above: 30 },
      { kind: 'stack', column: true, mark: 'esses', offset: 215, lateral: -26, radius: 12, above: 30 },
      { kind: 'stack', column: true, mark: 'esses', offset: 355, lateral: 24, radius: 12, above: 30 },
      { kind: 'stack', column: true, mark: 'bulge', offset: -120, lateral: -40, radius: 15, above: 30 },
      { kind: 'stack', column: true, mark: 'bulge', offset: 60, lateral: 42, radius: 15, above: 30 },
      { kind: 'stack', column: true, mark: 'bend', offset: -180, lateral: 45, radius: 16, above: 30 },
    ],
    basins: [{ mark: 'loopTop', r: 300, down: 0 }],
    environment() {
      return {
        sunDir: new THREE.Vector3(-0.55, 0.26, 0.5).normalize(), sunColor: new THREE.Color(0xffb36a), sunIntensity: 3.8,
        skyTop: new THREE.Color(0x1f5fb8), skyMid: new THREE.Color(0x78a9d8), skyHorizon: new THREE.Color(0xffa564), fogColor: new THREE.Color(0xe3a77c),
        fogDensity: 0.00034, exposure: 1.0, night: false, ambientGround: new THREE.Color(0x8a4a2a), hemiIntensity: 1.2,
        ringColor: 0x5ef2ff, boostColor: 0xffe14a, shortcutColor: 0xff4fd8, guideColor: 0xfff0c0, warnColor: 0xff3d1a,
        cloudLit: new THREE.Color(1.0, 0.82, 0.62), cloudShade: new THREE.Color(0.6, 0.45, 0.5),
        bloom: { strength: 0.5, threshold: 0.88, radius: 0.55 }, grade: { saturation: 1.12, contrast: 1.1, vignette: 0.3, tint: new THREE.Color(1.05, 0.98, 0.92) },
      };
    },
  };
})();

/** Canyon height field: mesa plateau carved along the route (main + shortcut) by a distance field, plus the spire and open basins. */
function makeCanyon(lay) {
  const cell = 16, L = lay.length;
  // bounds from the minimap + margin
  const mb = lay.minimap.bounds, M = 700;
  const x0 = mb.minX - M, z0 = mb.minZ - M, nx = Math.ceil((mb.maxX - mb.minX + 2 * M) / cell) + 1, nz = Math.ceil((mb.maxZ - mb.minZ + 2 * M) / cell) + 1;
  const E = new Float32Array(nx * nz).fill(1e4), Y = new Float32Array(nx * nz);
  const f = {};
  const splat = (frame) => {
    const reach = frame.halfWidth * 1.1 + 160, ci = Math.round((frame.pos.x - x0) / cell), cj = Math.round((frame.pos.z - z0) / cell), rc = Math.ceil(reach / cell);
    const open = Math.max(frame.halfWidth * 1.05, 0) + 6;
    for (let j = Math.max(0, cj - rc); j <= Math.min(nz - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(nx - 1, ci + rc); i++) {
      const d = Math.hypot(x0 + i * cell - frame.pos.x, z0 + j * cell - frame.pos.z), e = d - open;
      const k = j * nx + i; if (e < E[k]) { E[k] = e; Y[k] = frame.pos.y; }
    }
  };
  const rng = (a, b) => [lay.marks[a], lay.marks[b]];
  const loopR = rng('loopEntry', 'loopExit'), helixR = rng('spireEntry', 'spireExit');
  const floorY = lay.path.frameAt(lay.marks.loopEntry, {}).pos.y, helixY = lay.path.frameAt(lay.marks.spireEntry, {}).pos.y;
  for (let s = 0; s < L; s += 7) {
    const fr = lay.path.frameAt(s, f);
    if (s >= loopR[0] - 20 && s <= loopR[1] + 20) fr.pos.y = floorY; else if (s >= helixR[0] && s <= helixR[1]) fr.pos.y = helixY;
    else if (s > helixR[1] && s < helixR[1] + 320) { const w = Math.min(1, (s - helixR[1]) / 320), k = w * w * (3 - 2 * w); fr.pos.y = helixY + (fr.pos.y - helixY) * k; }
    splat(fr);
  }
  for (const br of lay.branches) for (let u = 0; u <= br.length; u += 7) splat(br.frameAt(u, f));
  // open basins (flat ground around the loop)
  const basins = [].map((bs) => { const fr = lay.path.frameAt(lay.marks[bs.mark], {}); return { x: fr.pos.x, z: fr.pos.z, r: bs.r, y: fr.pos.y }; });
  const look = (arr, x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell; let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return arr === E ? 1e4 : 0;
    const tx = fx - i, tz = fz - j, a = arr[j * nx + i], b = arr[j * nx + i + 1], c = arr[(j + 1) * nx + i], d = arr[(j + 1) * nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
  return (x, z) => {
    // mesa plateau: stepped terraces
    const n = fbm(x * 0.0021 + 3.1, z * 0.0021 - 1.7), q = n * 4.2, tf = Math.floor(q), fr = q - tf;
    const terr = (tf + sm(0.55, 0.9, fr)) / 4.2;
    let P = 175 + terr * 120 + (fbm(x * 0.012, z * 0.012) - 0.5) * 14;
    let e = look(E, x, z), yp = look(Y, x, z);
    for (const bs of basins) { const d = Math.hypot(x - bs.x, z - bs.z); e = Math.min(e, d - bs.r * 0.7); if (e === d - bs.r * 0.7) yp = Math.max(yp, bs.y); }
    const c = Math.min(1, Math.max(0, e / 78));
    const wall = c * c * (3 - 2 * c);
    const F = yp - 66 + (fbm(x * 0.01, z * 0.01) - 0.5) * 12 + (sm(0, 1, c) * 0);
    let h = e >= 1e3 ? P : F + (Math.max(P, F + 40) - F) * Math.pow(wall, 0.85);
    // rock tower the helix winds around
    const ds = Math.hypot(x - SPIRE.x, z - SPIRE.z);
    if (ds < SPIRE.r * 1.4) { const tt = 1 - ds / (SPIRE.r * 1.4); const sp = SPIRE.h * Math.pow(Math.min(1, tt / 0.5), 0.45) * (0.92 + 0.16 * fbm(x * 0.05, z * 0.05)); if (sp > h) h = sp; }
    return h;
  };
}
