// Neon Skyline city generator (pure: no THREE meshes, runs under node:test). Owner: craft agent (role C).
// makeNeonCity(layout, N) builds the building lots, the special structures (helipad podium, landmark tower, atrium shell, giant screens,
// elevated highway, river) and returns the course HEIGHT FUNCTION (buildings are solid, the atrium has a floor, the highway has a deck).
// The function carries `.city` with everything the scenery needs (boxes, signs, beacons, highway samples, river polyline ...).
import { mulberry32 } from '../../util.js';

const P = 80, LOT = 64, CELL = 40;            // lot pitch, lot size, spatial hash cell
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash2(xi, yi) * (1 - u) + hash2(xi + 1, yi) * u) * (1 - v) + (hash2(xi, yi + 1) * (1 - u) + hash2(xi + 1, yi + 1) * u) * v;
}
const key = (i, j) => (i + 4000) * 8192 + (j + 4000);

/** Distance from (x,z) to polyline pts [[x,z]...]. */
export function polyDist(pts, x, z) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export function makeNeonCity(lay, N) {
  const rnd = mulberry32(0x4e30c17);
  const L = lay.length, f = {};
  // ---------------------------------------------------------------- path samples (main + branches) and the spatial hash used by the lot rule
  const samples = [];                                       // x, y, z, halfWidth
  for (let s = 0; s < L; s += 9) { lay.path.frameAt(s, f); samples.push({ x: f.pos.x, y: f.pos.y, z: f.pos.z, hw: f.halfWidth }); }
  for (const br of lay.branches) for (let u = 0; u <= br.length; u += 9) { br.frameAt(u, f); samples.push({ x: f.pos.x, y: f.pos.y, z: f.pos.z, hw: f.halfWidth }); }
  const sh = new Map();
  samples.forEach((p, i) => { const k = key(Math.floor(p.x / P), Math.floor(p.z / P)); (sh.get(k) || sh.set(k, []).get(k)).push(i); });
  const nearSamples = (x0, x1, z0, z1, pad, fn) => {
    const i0 = Math.floor((x0 - pad) / P), i1 = Math.floor((x1 + pad) / P), j0 = Math.floor((z0 - pad) / P), j1 = Math.floor((z1 + pad) / P);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = sh.get(key(i, j)); if (a) for (const k of a) fn(samples[k]); }
  };
  /** Highest a building may be on this footprint so that it never reaches the corridor: every path sample within (halfWidth + 14) of the
   *  rectangle (horizontally) must stay >= 38 m above the roof. */
  const capFor = (x0, x1, z0, z1) => {
    let cap = Infinity;
    nearSamples(x0, x1, z0, z1, 140, (p) => {
      const dx = Math.max(x0 - p.x, 0, p.x - x1), dz = Math.max(z0 - p.z, 0, p.z - z1);
      if (Math.hypot(dx, dz) < p.hw + 14) cap = Math.min(cap, p.y - 38);
    });
    for (const p of highway.pts) {
      const dx = Math.max(x0 - p.x, 0, p.x - x1), dz = Math.max(z0 - p.z, 0, p.z - z1);
      if (Math.hypot(dx, dz) < highway.half + 10) cap = Math.min(cap, p.y - 8);
    }
    return cap;
  };

  // ---------------------------------------------------------------- special rects: { cx, cz, hl, hw, ax:[x,z], top, floor?, kind }
  const rects = [];
  const addRect = (r) => { r.ax = r.ax || [1, 0]; r.yaw = Math.atan2(-r.ax[1], r.ax[0]); rects.push(r); return r; };
  // launch podium under the helipad deck
  {
    lay.path.frameAt(0, f);
    const th = Math.hypot(f.tangent.x, f.tangent.z), tx = f.tangent.x / th, tz = f.tangent.z / th, c = lay.startCfg;
    const mid = (c.fwd - c.back) / 2;
    addRect({ kind: 'podium', cx: f.pos.x + tx * mid, cz: f.pos.z + tz * mid, hl: (c.back + c.fwd) / 2, hw: c.halfW + 6, ax: [tx, tz], top: lay.deckY - 0.7, cell: 9 });
  }
  // landmark tower beside the loop
  const T = N.towerLoop, th0 = T.heading, rightX = -th0[1], rightZ = th0[0];
  const tower = addRect({ kind: 'tower', cx: T.entry[0] - rightX * (T.gapToTower + T.towerW / 2), cz: T.entry[2] - rightZ * (T.gapToTower + T.towerW / 2), hl: T.towerW / 2, hw: T.towerW / 2, top: T.towerTop, cell: 0 });
  const loopCentre = { x: T.entry[0] + rightX * T.drift / 2, y: T.entry[1] + T.R, z: T.entry[2] + rightZ * T.drift / 2 };
  // atrium shell: hollow, has a floor
  const A = N.atrium;
  const atrium = addRect({ kind: 'atrium', cx: (A.x0 + A.x1) / 2, cz: A.z, hl: (A.x1 - A.x0) / 2, hw: A.halfD, top: A.top, floor: 70 });
  // giant screens at the shortcut slot
  const br0 = lay.branches[0], screens = [];
  if (br0 && br0.marks.gap != null) {
    br0.frameAt(br0.marks.gap, f);
    const th = Math.hypot(f.tangent.x, f.tangent.z), tx = f.tangent.x / th, tz = f.tangent.z / th, rx = -tz, rz = tx, Sg = N.screens;
    const off = Sg.gap / 2 + Sg.w / 2;
    for (const sd of [-1, 1]) screens.push(addRect({ kind: 'screen', cx: f.pos.x + rx * off * sd, cz: f.pos.z + rz * off * sd, hl: Sg.w / 2, hw: Sg.d / 2, ax: [rx, rz], top: Sg.top, side: sd }));
    screens.gap = { x: f.pos.x, y: f.pos.y, z: f.pos.z, tx, tz, rx, rz, halfGap: Sg.gap / 2 };
  }
  // elevated highway deck along the main path
  const highway = { pts: [], half: 19, deckThick: 3.2 };
  {
    const a = lay.marks.hwyA, b = lay.marks.hwyB;
    for (let s = a - 60; s <= b + 60; s += 6) { lay.path.frameAt(s, f); highway.pts.push({ x: f.pos.x, z: f.pos.z, y: f.pos.y - 42, s }); }
    // smooth the deck height so it does not follow the path's small wiggles
    for (let pass = 0; pass < 3; pass++) for (let i = 1; i < highway.pts.length - 1; i++) highway.pts[i].y = (highway.pts[i - 1].y + highway.pts[i].y * 2 + highway.pts[i + 1].y) / 4;
  }
  const hwSegs = [];                                            // for the height query
  for (let i = 0; i < highway.pts.length - 1; i++) { const p = highway.pts[i], q = highway.pts[i + 1]; hwSegs.push([p.x, p.z, q.x, q.z, (p.y + q.y) / 2]); }

  // ---------------------------------------------------------------- river
  const river = N.river;
  const inRiver = (x, z, pad = 0) => polyDist(river.pts, x, z) < river.width / 2 + pad;

  // ---------------------------------------------------------------- the lots
  const mb = lay.minimap.bounds, M = 1000;
  const lotX0 = Math.floor((mb.minX - M) / P), lotX1 = Math.ceil((mb.maxX + M) / P), lotZ0 = Math.floor((mb.minZ - M) / P), lotZ1 = Math.ceil((mb.maxZ + M) / P);
  const centre = { x: (mb.minX + mb.maxX) / 2 + 80, z: (mb.minZ + mb.maxZ) / 2 + 220 };
  const boxes = [], beacons = [], signs = [], lights = [];
  const addBox = (b) => { boxes.push(b); return b; };
  // special boxes that render through the facade shader
  const pod = rects[0];
  addBox({ cx: pod.cx, cz: pod.cz, w: pod.hl * 2, d: pod.hw * 2, y0: -2, y1: pod.top, cell: 9, seed: 3, yaw: pod.yaw, kind: 'podium', lit: 0.5 });
  addBox({ cx: tower.cx, cz: tower.cz, w: T.towerW, d: T.towerW, y0: -2, y1: T.towerTop * 0.82, cell: 0, seed: 7, yaw: 0, kind: 'tower', lit: 0.9 });
  addBox({ cx: tower.cx, cz: tower.cz, w: T.towerW * 0.72, d: T.towerW * 0.72, y0: T.towerTop * 0.82 - 1, y1: T.towerTop * 0.95, cell: 0, seed: 8, yaw: 0, kind: 'tower', lit: 0.9 });
  addBox({ cx: tower.cx, cz: tower.cz, w: T.towerW * 0.4, d: T.towerW * 0.4, y0: T.towerTop * 0.95 - 1, y1: T.towerTop, cell: 12, seed: 9, yaw: 0, kind: 'tower', lit: 0.9 });
  beacons.push({ x: tower.cx, y: T.towerTop + 30, z: tower.cz, phase: 0, size: 2.2 });
  const specialAABBs = rects.map((r) => { const c = Math.abs(r.ax[0]), s = Math.abs(r.ax[1]); const ex = r.hl * c + r.hw * s, ez = r.hl * s + r.hw * c; return [r.cx - ex, r.cx + ex, r.cz - ez, r.cz + ez]; });
  let nLots = 0, nSkipped = 0;
  for (let i = lotX0; i < lotX1; i++) for (let j = lotZ0; j < lotZ1; j++) {
    const cx = i * P + P / 2, cz = j * P + P / 2, x0 = cx - LOT / 2, x1 = cx + LOT / 2, z0 = cz - LOT / 2, z1 = cz + LOT / 2;
    if (inRiver(cx, cz, LOT * 0.7 + 12)) continue;
    let blocked = false;
    for (const a of specialAABBs) if (x1 > a[0] - 10 && x0 < a[1] + 10 && z1 > a[2] - 10 && z0 < a[3] + 10) { blocked = true; break; }
    if (blocked) continue;
    const r = rnd(), n1 = vnoise(i * 0.35 + 3.1, j * 0.35 - 1.7), n2 = vnoise(i * 1.3 - 9.4, j * 1.3 + 4.2);
    const dc = Math.hypot(cx - centre.x, cz - centre.z);
    let H = 36 + 330 * Math.exp(-((dc / 1900) ** 2)) * (0.35 + 0.95 * n1) + 70 * n2 + r * 40;
    if (r > 0.93) H *= 1.35;
    if (r < 0.05) continue;                                 // plaza / park
    H = Math.min(H, 395);
    const cap = capFor(x0, x1, z0, z1);
    if (cap < 18) { nSkipped++; continue; }
    const free = cap === Infinity;
    H = Math.min(H, cap);
    // main block + optional setbacks
    const cell = Math.floor(rnd() * 16), seed = rnd() * 100, tall = H > 120;
    const t0 = tall ? 0.6 + rnd() * 0.22 : 1;
    const y1a = H * t0;
    let top = y1a;
    addBox({ cx, cz, w: LOT * (0.92 + rnd() * 0.08), d: LOT * (0.92 + rnd() * 0.08), y0: -2, y1: y1a, cell, seed, yaw: 0, kind: 'lot', lit: rnd() < 0.18 ? 0.08 : 0.22 + rnd() * 0.5 });
    const tiers = [];
    if (tall) {
      let inset = 6 + rnd() * 8, y0 = y1a, w = LOT - inset * 2, d = LOT - inset * 2;
      const nt = H > 220 ? 2 : 1;
      for (let t = 0; t < nt; t++) {
        const y1 = t === nt - 1 ? H : y0 + (H - y0) * (0.5 + rnd() * 0.15);
        addBox({ cx: cx + (rnd() - 0.5) * 6, cz: cz + (rnd() - 0.5) * 6, w, d, y0: y0 - 1, y1, cell: rnd() < 0.5 ? cell : Math.floor(rnd() * 16), seed: seed + 11 * (t + 1), yaw: 0, kind: 'lot', lit: 0.25 + rnd() * 0.55 });
        tiers.push([w, d, y1]);
        y0 = y1; w -= 10 + rnd() * 8; d -= 10 + rnd() * 8; inset += 10; top = y1;
      }
    }
    // crown: antenna or lit crest with beacons
    if (top > 140 && free && rnd() < 0.7) {
      const ah = 24 + rnd() * 40;
      addBox({ cx, cz, w: 2.4, d: 2.4, y0: top - 1, y1: top + ah, cell: 7, seed, yaw: 0, kind: 'antenna', lit: 0 });
      beacons.push({ x: cx, y: top + ah + 1.5, z: cz, phase: rnd() * 6.28, size: 1.6 });
    } else if (top > 110) {
      const w = tiers.length ? tiers[tiers.length - 1][0] : LOT, d = tiers.length ? tiers[tiers.length - 1][1] : LOT;
      for (const [sx, sz] of [[-1, -1], [1, 1]]) beacons.push({ x: cx + sx * (w / 2 - 3), y: top + 1.5, z: cz + sz * (d / 2 - 3), phase: rnd() * 6.28, size: 1.1 });
    }
    // neon sign facing the nearest piece of path
    let bestD = 1e9, bp = null;
    nearSamples(x0, x1, z0, z1, 260, (p) => { const d = Math.hypot(p.x - cx, p.z - cz); if (d < bestD) { bestD = d; bp = p; } });
    if (bp && bestD < 300 && y1a > 30 && rnd() < 0.85) {
      const ddx = bp.x - cx, ddz = bp.z - cz;
      const face = Math.abs(ddx) > Math.abs(ddz) ? [Math.sign(ddx), 0] : [0, Math.sign(ddz)];
      const size = 16 + rnd() * 22, hFace = y1a, y = Math.min(hFace - size * 0.6, 28 + rnd() * (hFace - 40));
      if (y > size * 0.5 + 6) {
        signs.push({ x: cx + face[0] * (LOT / 2 + 0.6), y, z: cz + face[1] * (LOT / 2 + 0.6), nx: face[0], nz: face[1], size, cell: Math.floor(rnd() * 8), hue: rnd(), flip: rnd() < 0.5, phase: rnd() * 6.28 });
      }
    }
    if (tall && free && dc > 500 && rnd() < 0.05) lights.push({ x: cx, y: top, z: cz });
    nLots++;
  }

  // ---------------------------------------------------------------- spatial hash for the height query
  const grid = new Map();
  rects.forEach((r, idx) => { const a = specialAABBs[idx]; for (let i = Math.floor(a[0] / CELL); i <= Math.floor(a[1] / CELL); i++) for (let j = Math.floor(a[2] / CELL); j <= Math.floor(a[3] / CELL); j++) { const k = key(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(idx); } });
  // lots are axis-aligned boxes at known grid positions: store their top directly (no yaw)
  const lotTop = new Map();
  for (const b of boxes) {
    if (b.kind !== 'lot') continue;
    const k = key(Math.floor(b.cx / P), Math.floor(b.cz / P));
    // record each tier as {w,d,y1}; the roof the player can hit is the max over tiers containing the point
    (lotTop.get(k) || lotTop.set(k, []).get(k)).push(b);
  }
  const hwGrid = new Map();
  hwSegs.forEach((sg, idx) => {
    const x0 = Math.min(sg[0], sg[2]) - highway.half, x1 = Math.max(sg[0], sg[2]) + highway.half, z0 = Math.min(sg[1], sg[3]) - highway.half, z1 = Math.max(sg[1], sg[3]) + highway.half;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) { const k = key(i, j); (hwGrid.get(k) || hwGrid.set(k, []).get(k)).push(idx); }
  });
  const rb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const [x, z] of river.pts) { rb.x0 = Math.min(rb.x0, x); rb.x1 = Math.max(rb.x1, x); rb.z0 = Math.min(rb.z0, z); rb.z1 = Math.max(rb.z1, z); }
  const pad = river.width;

  function heightFn(x, z) {
    let h = 0;
    const ck = key(Math.floor(x / CELL), Math.floor(z / CELL));
    const rl = grid.get(ck);
    if (rl) for (let n = 0; n < rl.length; n++) {
      const r = rects[rl[n]], dx = x - r.cx, dz = z - r.cz, a = dx * r.ax[0] + dz * r.ax[1], b = -dx * r.ax[1] + dz * r.ax[0];
      if (Math.abs(a) <= r.hl && Math.abs(b) <= r.hw) { if (r.floor !== undefined) return r.floor; if (r.top > h) h = r.top; }
    }
    const lk = lotTop.get(key(Math.floor(x / P), Math.floor(z / P)));
    if (lk) for (let n = 0; n < lk.length; n++) { const b = lk[n]; if (Math.abs(x - b.cx) <= b.w / 2 && Math.abs(z - b.cz) <= b.d / 2 && b.y1 > h) h = b.y1; }
    const hl = hwGrid.get(ck);
    if (hl) for (let n = 0; n < hl.length; n++) {
      const sg = hwSegs[hl[n]], dx = sg[2] - sg[0], dz = sg[3] - sg[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - sg[0]) * dx + (z - sg[1]) * dz) / l2));
      if (Math.hypot(x - sg[0] - dx * t, z - sg[1] - dz * t) <= highway.half && sg[4] > h) h = sg[4];
    }
    if (h === 0 && x > rb.x0 - pad && x < rb.x1 + pad && z > rb.z0 - pad && z < rb.z1 + pad && polyDist(river.pts, x, z) < river.width / 2) return -14;
    return h;
  }
  heightFn.city = { boxes, beacons, signs, lights, rects, highway, river, screens, tower, atrium, loopCentre, centre, P, LOT, counts: { lots: nLots, skipped: nSkipped, boxes: boxes.length, signs: signs.length, beacons: beacons.length }, polyDist, inRiver };
  return heightFn;
}
