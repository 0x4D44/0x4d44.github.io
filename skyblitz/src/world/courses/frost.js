// FROSTPEAK AURORA: pure definition. Glacier valleys at twilight under the aurora (clockwise lap, start heading east, ice-shelf launch deck).
// Set pieces: east valley -> ICE ARCH -> glacier switchbacks (column spires) -> FROZEN FALL (loop against an ice cliff) -> long west bulge
// (second ice arch) that the ICE CAVE shortcut cuts off -> shelf straight. Hardest course: tight corridors, many spires.
import * as THREE from 'three';
import { PathBuilder } from '../path.js';

function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1 + 7, y * 2.1 - 3) * 0.28 + vnoise(x * 4.3 - 5, y * 4.3 + 9) * 0.14 + vnoise(x * 8.7, y * 8.7 + 2) * 0.08; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const FROST_FLOOR = 62;      // valley floor sits this far below the route centre line

export const frostDef = (() => {
  const b = new PathBuilder();
  const S = 0.9;                                                  // plan-view scale (keeps the lap near 7 km)
  const add = (x, y, z, o) => b.add(x * S, y, z * S, o);
  add(0, 150, 0, { mark: 'start', hw: 80, hh: 58 });
  add(300, 150, 0, { hw: 82, hh: 60 });
  add(620, 144, -35, { hw: 84, hh: 60 });
  add(920, 134, -120, { hw: 82, hh: 58 });
  add(1180, 124, -280, { hw: 80, hh: 56 });
  add(1330, 116, -520, { mark: 'bend', hw: 74, hh: 54 });
  add(1320, 108, -760, { hw: 70, hh: 52 });
  add(1235, 102, -960, { mark: 'arch', hw: 52, hh: 42, bank: -8 });   // ICE ARCH
  add(1305, 98, -1180, { hw: 72, hh: 52 });
  add(1265, 94, -1390, { mark: 'switch', hw: 72, hh: 52 });           // glacier switchbacks
  add(1305, 92, -1580, { hw: 72, hh: 52 });
  add(1275, 90, -1720, { hw: 76, hh: 54 });
  add(1120, 92, -1790, { hw: 82, hh: 62 });
  add(990, 92, -1790, { hw: 84, hh: 66 });
  add(880, 92, -1780, { mark: 'fallLead', hw: 88, hh: 70 });
  b.loop([-1, 0], { R: 95, drift: 44, n: 12, tail: 120, hw: 90, hh: 72, mark: 'loop' });   // FROZEN FALL loop
  add(560, 100, -1800, { hw: 78, hh: 58 });
  add(300, 110, -1740, { hw: 76, hh: 56 });
  add(60, 118, -1690, { hw: 74, hh: 54 });
  add(-300, 124, -1760, { mark: 'caveA', hw: 80, hh: 58 });           // ice-cave junction
  add(-700, 128, -1620, { hw: 78, hh: 56 });
  add(-1000, 124, -1330, { mark: 'bulge', hw: 72, hh: 54 });
  add(-980, 118, -1030, { mark: 'arch2', hw: 54, hh: 42, bank: 8 });  // second ice arch
  add(-850, 114, -780, { hw: 72, hh: 54 });
  add(-560, 112, -560, { mark: 'caveB', hw: 78, hh: 56 });            // ice-cave rejoin
  add(-470, 126, -320, { hw: 80, hh: 58 });
  add(-430, 138, -170, { hw: 82, hh: 60 });
  add(-360, 146, -60, { hw: 82, hh: 60 });
  add(-300, 150, -12, { hw: 82, hh: 60 });
  add(-250, 150, 0, { mark: 'deckBack', hw: 82, hh: 60 });
  add(-120, 150, 0, { mark: 'deckMid', hw: 80, hh: 58 });
  return {
    id: 'frost', laps: 3,
    points: b.pts, marks: b.marks, hw: 80, hh: 58,
    makeHeight: makeGlacier,
    start: { back: 250, fwd: 70, halfW: 44 },
    items: ['bend', 'switch', 'bulge', 'caveB', 'deckBack'],
    sectors: ['arch', 'loopExit', 'caveB'],
    gateSpacing: 250,
    branches: [{
      id: 'cave', name: 'Ice Cave Shortcut', from: 'caveA', to: 'caveB', hw: 42, hh: 44, risk: 0.55, taper: 120,
      points: [[-330, 118, -1560], [-380, 112, -1340], [-450, 108, -1100], [-480, 106, -880], [-530, 108, -700]].map(([x, y, z]) => [x * S, y, z * S]),
      marks: { cave: 1 },
    }],
    boost: [
      { branch: 0, u: 140, count: 9, gap: 120, radius: 18, weave: 5, power: 1.8, duration: 2.3 },   // ice cave: rewarded line
      { mark: 'fallLead', offset: -230, count: 3, gap: 45, radius: 20, power: 1.4, duration: 1.6 },
      { mark: 'switch', offset: -90, count: 2, gap: 70, weave: 18, radius: 19, power: 1.35, duration: 1.5 },
      { mark: 'arch', offset: 120, count: 2, gap: 60, weave: 16, radius: 19 },
      { mark: 'bulge', offset: 140, count: 2, gap: 60, weave: 20, radius: 19 },
      { mark: 'deckMid', offset: -30, count: 1, radius: 21 },
    ],
    hazards: [
      { kind: 'stack', column: true, mark: 'bend', offset: -150, lateral: 36, radius: 13, above: 30 },
      { kind: 'stack', column: true, mark: 'bend', offset: 60, lateral: -36, radius: 13, above: 30 },
      { kind: 'stack', column: true, mark: 'switch', offset: -120, lateral: 28, radius: 13, above: 30 },
      { kind: 'stack', column: true, mark: 'switch', offset: 20, lateral: -30, radius: 13, above: 30 },
      { kind: 'stack', column: true, mark: 'switch', offset: 150, lateral: 28, radius: 13, above: 30 },
      { kind: 'stack', column: true, mark: 'bulge', offset: -140, lateral: -38, radius: 14, above: 30 },
      { kind: 'stack', column: true, mark: 'bulge', offset: 40, lateral: 40, radius: 14, above: 30 },
      { kind: 'stack', column: true, mark: 'caveB', offset: -120, lateral: -34, radius: 14, above: 30 },
    ],
    environment() {
      return {
        sunDir: new THREE.Vector3(0.62, 0.1, 0.55).normalize(), sunColor: new THREE.Color(0xffa8c0), sunIntensity: 2.4,
        skyTop: new THREE.Color(0x07123a), skyMid: new THREE.Color(0x2a3f86), skyHorizon: new THREE.Color(0xe39ac0), fogColor: new THREE.Color(0x7d82b8),
        fogDensity: 0.00042, exposure: 1.05, night: true, ambientGround: new THREE.Color(0x3a4a7a), hemiIntensity: 1.7,
        ringColor: 0x7af0ff, boostColor: 0xfff06a, shortcutColor: 0xff5ae0, guideColor: 0xd8f4ff, warnColor: 0xff4a2a,
        cloudLit: new THREE.Color(0.85, 0.78, 1.0), cloudShade: new THREE.Color(0.3, 0.35, 0.6),
        bloom: { strength: 0.65, threshold: 0.85, radius: 0.6 }, grade: { saturation: 1.1, contrast: 1.1, vignette: 0.35, tint: new THREE.Color(0.95, 0.98, 1.08) },
      };
    },
  };
})();

/** Glacier height field: ridged alpine peaks carved by a distance field along the route (main + cave), a flat glacier floor beneath it. */
function makeGlacier(lay) {
  const cell = 16, L = lay.length;
  const mb = lay.minimap.bounds, M = 700;
  const x0 = mb.minX - M, z0 = mb.minZ - M, nx = Math.ceil((mb.maxX - mb.minX + 2 * M) / cell) + 1, nz = Math.ceil((mb.maxZ - mb.minZ + 2 * M) / cell) + 1;
  const E = new Float32Array(nx * nz).fill(1e4), Y = new Float32Array(nx * nz);
  const f = {};
  const splat = (frame) => {
    const reach = frame.halfWidth * 1.1 + 170, ci = Math.round((frame.pos.x - x0) / cell), cj = Math.round((frame.pos.z - z0) / cell), rc = Math.ceil(reach / cell);
    const open = frame.halfWidth * 1.05 + 6;
    for (let j = Math.max(0, cj - rc); j <= Math.min(nz - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(nx - 1, ci + rc); i++) {
      const e = Math.hypot(x0 + i * cell - frame.pos.x, z0 + j * cell - frame.pos.z) - open;
      const k = j * nx + i; if (e < E[k]) { E[k] = e; Y[k] = frame.pos.y; }
    }
  };
  const loopR = [lay.marks.loopEntry, lay.marks.loopExit];
  const floorY = lay.path.frameAt(lay.marks.loopEntry, {}).pos.y;
  for (let s = 0; s < L; s += 7) {
    const fr = lay.path.frameAt(s, f);
    if (s >= loopR[0] - 20 && s <= loopR[1] + 20) fr.pos.y = floorY;
    splat(fr);
  }
  for (const br of lay.branches) for (let u = 0; u <= br.length; u += 7) splat(br.frameAt(u, f));
  const look = (arr, x, z) => {
    const fx = (x - x0) / cell, fz = (z - z0) / cell, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return arr === E ? 1e4 : 0;
    const tx = fx - i, tz = fz - j, a = arr[j * nx + i], bb = arr[j * nx + i + 1], c = arr[(j + 1) * nx + i], d = arr[(j + 1) * nx + i + 1];
    return (a * (1 - tx) + bb * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
  return (x, z) => {
    // alpine massif: ridged fbm gives knife ridges and peaks
    const r1 = 1 - Math.abs(2 * fbm(x * 0.0016 + 11.3, z * 0.0016 - 4.1) - 1), r2 = 1 - Math.abs(2 * fbm(x * 0.0044 - 2.7, z * 0.0044 + 8.9) - 1);
    const P = 190 + r1 * r1 * 330 + r2 * r2 * 70 + (fbm(x * 0.012, z * 0.012) - 0.5) * 18;
    const e = look(E, x, z), yp = look(Y, x, z);
    const c = Math.min(1, Math.max(0, e / 120)), wall = c * c * (3 - 2 * c);
    const F = yp - FROST_FLOOR + (fbm(x * 0.008, z * 0.008) - 0.5) * 10;
    return e >= 1e3 ? P : F + (Math.max(P, F + 50) - F) * Math.pow(wall, 0.8);
  };
}
