// SUNRISE ARCHIPELAGO: pure definition (no THREE meshes). Tropical dawn, the easy course.
// Layout (north = -Z, clockwise lap): launch carrier -> lagoon sweeper -> volcano ridge -> SEA ARCH -> LIGHTHOUSE LOOP -> stack slalom
// down the east coast -> sea-cave SHORTCUT (or the long way round the bay) -> hairpin back onto the carrier straight.
import * as THREE from 'three';
import { PathBuilder } from '../path.js';

// ---- islands (world metres, sea level y = 0). h = peak height, r = radius at the waterline.
const ISLANDS = [
  { x: 640, z: -520, r: 330, h: 215, name: 'volcano' },        // volcano: the route flies over its north flank
  { x: 1115, z: -985, r: 150, h: 250, name: 'lighthouse' },    // lighthouse isle, north of the loop
  { x: 1180, z: -90, r: 85, h: 95, name: 'stacks' },
  { x: 650, z: 500, r: 250, h: 125, name: 'caveIsle' },         // the shortcut gorge cuts through this one
  { x: -360, z: -470, r: 200, h: 120, name: 'west' },
  { x: -120, z: 880, r: 130, h: 70, name: 'south' },
  { x: 1780, z: -340, r: 190, h: 120, name: 'far' },
  { x: 930, z: -926, r: 62, h: 130, name: 'archN', pillar: true },            // arch pillars flank the route 85 m either side
  { x: 885, z: -732, r: 62, h: 130, name: 'archS', pillar: true },
];
// sea-cave gorge polyline (x,z): carved through the cave isle; the shortcut flies it 40 m above the water.
export const GORGE = [[1042, 510], [930, 526], [784, 504], [627, 504], [470, 538], [330, 570], [186, 571]];
function gorgeDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < GORGE.length - 1; i++) {
    const [ax, az] = GORGE[i], [bx, bz] = GORGE[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.5 + vnoise(x * 2.1 + 7, y * 2.1 - 3) * 0.28 + vnoise(x * 4.3 - 5, y * 4.3 + 9) * 0.14 + vnoise(x * 8.7, y * 8.7 + 2) * 0.08; }

/** Terrain height (m): islands with a steep volcanic core, beaches and a shallow lagoon floor; deep sea elsewhere. */
export function sunriseHeight(x, z) {
  let h = -60;
  for (const I of ISLANDS) {
    const dx = x - I.x, dz = z - I.z;
    // domain-warped radius for irregular coastlines
    const w = fbm(x * 0.0035 + I.x * 0.001, z * 0.0035) - 0.5;
    const d = Math.hypot(dx, dz) * (1 + w * 0.9) / I.r;
    if (d >= 1.45) continue;
    const t = Math.max(0, 1 - d);
    const rid = 1 - Math.abs(2 * fbm(x * 0.0042 + I.z * 0.01, z * 0.0042 + I.x * 0.01) - 1), tt = Math.min(1, t / 0.32);
    let core = Math.min(I.h * 0.2, 26) * tt * tt * (3 - 2 * tt) + Math.pow(t, 1.55) * I.h * (0.3 + 1.05 * rid * rid) + (fbm(x * 0.02, z * 0.02) - 0.5) * 10 * t;
    if (I.pillar) core = I.h * Math.pow(Math.min(1, t / 0.4), 0.5) * (0.88 + 0.25 * fbm(x * 0.03, z * 0.03)) - 6;
    const shelf = -42 + 46 * Math.min(1, Math.max(0, (1.45 - d) / 0.55));     // lagoon shelf rising to the beach
    h = Math.max(h, Math.max(shelf, core + shelf * 0.2 * (1 - t)));
  }
  const gd = gorgeDist(x, z);
  if (gd < 70 && h > -6) { const c = Math.min(1, Math.max(0, (gd - 30) / 38)); const cc = c * c * (3 - 2 * c); h = -6 + (h + 6) * cc; }
  return h;
}

const S = 1.12;
export const sunriseDef = (() => {
  const b = new PathBuilder();
  const add = (x, y, z, o) => b.add(x * S, y, z * S, o);
  add(0, 40, 0, { mark: 'start', hw: 95, hh: 60 });
  add(0, 44, -270, { hw: 105, hh: 70 });
  add(50, 58, -480, { hw: 110, hh: 76 });
  add(185, 72, -635, { hw: 115, hh: 78 });
  add(390, 82, -735, { mark: 'sweepEnd', hw: 115, hh: 80 });
  add(610, 92, -790, { mark: 'ridge', hw: 120, hh: 82 });
  add(715, 72, -768, { hw: 100, hh: 70 });
  add(810, 52, -740, { mark: 'arch', hw: 56, hh: 42, bank: 22 });      // sea arch between the two pillars
  add(905, 54, -724, { hw: 70, hh: 50 });
  add(985, 62, -712, { hw: 95, hh: 70 });                     // loop entry (heading ESE)
  b.loop([0.99, 0.14], { R: 95, drift: 44, n: 12, tail: 130, hw: 90, hh: 80, mark: 'loop' });
  add(1180, 74, -640, { hw: 100, hh: 72 });
  add(1250, 80, -500, { mark: 'eastTurn', hw: 100, hh: 70 });
  add(1235, 70, -330, { hw: 90, hh: 66 });
  add(1275, 62, -200, { mark: 'slalom', hw: 80, hh: 60 });   // stack slalom
  add(1195, 58, -30, { hw: 76, hh: 58 });
  add(1275, 60, 140, { hw: 76, hh: 58 });
  add(1205, 64, 300, { hw: 84, hh: 60 });
  add(1090, 66, 410, { hw: 90, hh: 64 });
  add(930, 62, 455, { mark: 'branchA', hw: 100, hh: 66 });    // shortcut junction (west-bound)
  add(830, 58, 690, { hw: 95, hh: 66 });
  add(610, 54, 910, { mark: 'bay', hw: 95, hh: 66 });
  add(380, 56, 840, { hw: 95, hh: 66 });
  add(240, 62, 560, { hw: 100, hh: 66 });
  add(120, 66, 470, { mark: 'branchB', hw: 95, hh: 66 });    // shortcut rejoin
  add(45, 54, 400, { mark: 'hairpin', hw: 100, hh: 62 });
  add(0, 40, 300, { mark: 'deckBack', hw: 100, hh: 62 });
  add(0, 40, 150, { mark: 'deckMid', hw: 95, hh: 60 });
  return {
    id: 'sunrise', laps: 3,
    points: b.pts, marks: b.marks,
    hw: 100, hh: 70,
    height: sunriseHeight,
    islands: ISLANDS,
    waterLevel: 0,
    start: { back: 250, fwd: 70, halfW: 46 },
    // main-path s at the mark (+offset). 5 item clusters per lap, kept clear of loop/branch
    items: ['ridge', 'eastTurn', 'slalom', 'bay', 'deckBack'].map((m) => m),
    sectors: ['sweepEnd', 'eastTurn', 'slalom', 'bay'],
    branches: [{
      id: 'cave', name: 'Sea-Cave Shortcut', from: 'branchA', to: 'branchB', hw: 46, hh: 36, risk: 0.65,
      points: [[930, 526, 40], [784, 504, 38], [627, 504, 38, null, 38, 30], [470, 538, 40], [330, 570, 46]].map(([x, z, y, ...r]) => [x, y, z, ...r]),
      marks: { cave: 3 },
    }],
    boost: [
      { mark: 'loopEntry', offset: -230, count: 3, gap: 45, radius: 22, power: 1.4, duration: 1.6 },
      { mark: 'ridge', offset: -60, count: 2, gap: 50, weave: 22, radius: 20, power: 1.3, duration: 1.2 },
      { mark: 'eastTurn', offset: 160, count: 2, gap: 60, weave: 24, radius: 20 },
      { mark: 'bay', offset: 40, count: 2, gap: 55, weave: 26, radius: 20 },
      { mark: 'deckMid', offset: -30, count: 1, radius: 22 },
    ],
    hazards: [
      { kind: 'stack', column: true, mark: 'slalom', offset: -30, lateral: 40, radius: 16 },
      { kind: 'stack', column: true, mark: 'slalom', offset: 90, lateral: -38, radius: 16 },
      { kind: 'stack', column: true, mark: 'slalom', offset: 230, lateral: 36, radius: 16 },
      { kind: 'balloon', mark: 'ridge', offset: 160, lateral: -55, vertical: 12, radius: 14, sway: 6 },
      { kind: 'balloon', mark: 'bay', offset: -80, lateral: 50, vertical: 5, radius: 14, sway: 6, phase: 2 },
    ],
    environment() {
      return {
        sunDir: new THREE.Vector3(0.62, 0.2, -0.76).normalize(), sunColor: new THREE.Color(0xffc690), sunIntensity: 3.4,
        skyTop: new THREE.Color(0x2d6ad8), skyHorizon: new THREE.Color(0xffb995), skyMid: new THREE.Color(0x7fb6ee), fogColor: new THREE.Color(0xf2c0a4),
        fogDensity: 0.00022, exposure: 1.0, night: false, ambientGround: new THREE.Color(0x2a6a78),
        bloom: { strength: 0.55, threshold: 0.9, radius: 0.6 }, grade: { saturation: 1.14, contrast: 1.07, vignette: 0.25, tint: new THREE.Color(1.03, 0.99, 0.95) },
      };
    },
  };
})();
