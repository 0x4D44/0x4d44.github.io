// OUTSKIRTS (A5, round 5, R1-D20 and D21): the land the far kit's terraces stand on, and the belt beyond the plot's walls.
// R1 saw the near hills east and north as "clusters of the same box houses sitting on bare grass with no streets, walls, trees or terracing between them". The kit (vista-kit.js, Codex's
// terraces) gives the houses; this file gives them a place: a street in each corridor between the chains of terraces, an alley in front of every row, clumps of eucalyptus, cypress and
// broadleaf trees and scrub along the streets, behind the rows and on the hillsides between them, a belt of tall trees outside the plot's wall (their crowns stand above it from inside:
// "something beyond", D21), and three landmarks: a water tower, a chapel and a radio mast. A PLAN first (planOutskirts: pure data, a function of the plan, the kit's plan and the far rows,
// walked by the node tests), then the drawing (buildOutskirts: 96 m tiles of one merged mesh per material; the trees cast a shadow, the ground and the landmarks do not).
// Nothing here moves a house: the kit's layout and piece ids are exactly the planner's, and the rows of vista.js keep their ground (the streets stop where either would be built on).
import { ss, vnoise, pointInPoly } from './geom.js';
import { HALF } from './field.js';
import { makeFarHeight, makeFarTerrainSampler } from './periphery.js';
import { vistaSites, farHouses, kitZones } from './vista.js';
import { unit as rnd } from './vista-look.js';
import { trunk } from './flora.js';
import { sprig, hasSheet, CELL, MAT as CARDS } from './cards.js';
import { card, ribbon, V } from './mk.js';

export const OUT = Object.freeze({
  reach: 300,                  // the land that is planned: |x| and |z| up to this (the fine ring of the far mesh)
  grid: 2,                     // the block grid, m
  maxTrees: 2400,              // the whole budget of trees (nearest the plot first)
  tile: 96,                    // a builder per tile of this size
  street: 3.6,                 // the width of a street, m
  alley: 2.4,                  // and of the alley in front of a row
  belt: [3.5, 8.5, 14.5],      // the rows of tall trees outside the wall, m beyond its axis
  near: 30,                    // a tree this close to the plot (m beyond its wall) is drawn in full; the farther ones with fewer limbs, sprigs and trunk sides (the world's triangle budget)
});

const farOf = (plan) => plan._far ?? (plan._far = makeFarHeight(plan));
const sample = (plan) => { const far = farOf(plan), surface = plan._farSurface ?? (plan._farSurface = makeFarTerrainSampler(plan, far)); return (x, z) => { const y = surface(x, z); return Number.isFinite(y) ? y : far(x, z); }; };
const slopeOf = (g, x, z) => { const e = 2.5; return Math.hypot((g(x + e, z) - g(x - e, z)) / (2 * e), (g(x, z + e) - g(x, z - e)) / (2 * e)); };
const frame = (ry) => ({ u: [Math.cos(ry), -Math.sin(ry)], v: [Math.sin(ry), Math.cos(ry)] });       // vista-plan.js offset(): u along a row, v out of its front
const at = (x, z, f, u, v) => [x + f.u[0] * u + f.v[0] * v, z + f.u[1] * u + f.v[1] * v];

/** A raster of the ground that is taken: 2 m cells over |x|, |z| <= reach. `mark(poly)` takes a convex polygon, `disc(x, z, r)` a disc; `free(x, z, r)` asks whether a disc of radius r touches nothing. */
export function blockGrid(reach = OUT.reach, cell = OUT.grid) {
  const n = Math.ceil((2 * reach) / cell), g = new Uint8Array(n * n), idx = (x) => Math.floor((x + reach) / cell);
  const set = (i, j) => { if (i >= 0 && j >= 0 && i < n && j < n) g[j * n + i] = 1; };
  return {
    n, cell, reach, g,
    mark(poly) {
      const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
      for (let j = idx(Math.min(...zs)); j <= idx(Math.max(...zs)); j++) for (let i = idx(Math.min(...xs)); i <= idx(Math.max(...xs)); i++) {
        if (pointInPoly(poly, -reach + (i + 0.5) * cell, -reach + (j + 0.5) * cell)) set(i, j);
      }
    },
    disc(x, z, r) { for (let j = idx(z - r); j <= idx(z + r); j++) for (let i = idx(x - r); i <= idx(x + r); i++) { if (Math.hypot(-reach + (i + 0.5) * cell - x, -reach + (j + 0.5) * cell - z) <= r + cell * 0.5) set(i, j); } },
    at(x, z) { const i = idx(x), j = idx(z); return i < 0 || j < 0 || i >= n || j >= n ? 1 : g[j * n + i]; },
    free(x, z, r = 0) {
      if (r <= 0) return !this.at(x, z);
      const steps = Math.max(1, Math.ceil(r / cell));                                  // a lattice of at most one cell between samples, through the centre and out to the radius
      for (let a = -steps; a <= steps; a++) for (let b = -steps; b <= steps; b++) {
        const dx = (a * r) / steps, dz = (b * r) / steps;
        if (dx * dx + dz * dz <= r * r + 1e-9 && this.at(x + dx, z + dz)) return false;
      }
      return true;
    },
  };
}

const rect = (x, z, ry, u0, u1, v0, v1) => { const f = frame(ry); return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => at(x, z, f, u, v)); };

/** The taken ground: the plot and its walls, the entry road, the landmark discs of vista.js, every kit house with its walls and stairs, every far row's house with the lane in front of it. */
export function takenGround(plan, planned, houses) {
  const far = farOf(plan), taken = blockGrid(), sites = vistaSites(plan);
  taken.mark([[-HALF - 2.5, -HALF - 2.5], [HALF + 2.5, -HALF - 2.5], [HALF + 2.5, HALF + 2.5], [-HALF - 2.5, HALF + 2.5]]);
  const road = far.road;
  if (road) for (let k = 0; k < road.pts.length; k++) taken.disc(road.pts[k][0], road.pts[k][1], 9);
  for (const s of [sites.church, ...sites.towers]) taken.disc(s.x, s.z, s.r);
  taken.disc(sites.mast.x, sites.mast.z, 8);
  for (const h of planned?.houses ?? []) taken.mark(rect(h.x, h.z, h.ry, -h.width / 2 - 0.3, h.width / 2 + 0.3, -h.depth / 2 - 0.3, h.depth / 2 + 1.3));
  for (const p of planned?.pieces ?? []) if (p.category === 'stair') taken.mark(rect(p.x, p.z, p.ry, -p.size[0] / 2 - 0.6, p.size[0] / 2 + 0.6, -p.size[2] / 2 - 0.6, p.size[2] / 2 + 0.6));
  for (const h of houses ?? []) taken.mark(rect(h.x, h.z, h.ry, -h.w / 2 - 0.4, h.w / 2 + 0.4, -h.d / 2 - 0.4, h.d / 2 + 3.4));
  return taken;
}

// ------------------------------------------------------------------------------------------------------------------------------ streets and alleys
const SIDE = {                                   // how each side's terraces lie: `row` the axis a row runs along, `out` the unit step away from the plot along the street's own axis
  east: { row: 'z', out: [1, 0] }, west: { row: 'z', out: [-1, 0] }, north: { row: 'x', out: [0, -1] },
};

/**
 * One street in every gap between the chains of terraces. A chain is the terraces whose rows overlap along the row axis; between two chains is a corridor (a street's width and a
 * metre to spare each side at the least); the street runs from the plot's wall, straight along the corridor, to where the terraces end or a house, a landmark or the road is in the way.
 * Returns [{ id, side, pts: [[x, z], ...] every 2 m, width, reach }].
 */
export function planStreets(plan, planned, taken) {
  const out = [], byHouse = new Map((planned?.houses ?? []).map((h) => [h.id, h]));
  for (const [side, S] of Object.entries(SIDE)) {
    const row = S.row === 'z' ? 1 : 0, along = S.row === 'z' ? 0 : 1;                       // index of the row axis and of the street axis in [x, z]
    const bands = [];
    const clusters = (planned?.clusters ?? []).filter((c) => c.region === side).map((c) => {
      const hs = c.houses.map((id) => byHouse.get(id)).filter(Boolean), p = hs.map((h) => (row ? h.z : h.x)), q = hs.map((h) => (along ? h.z : h.x));
      const half = Math.max(...hs.map((h) => h.width)) / 2;
      return { lo: Math.min(...p) - half, hi: Math.max(...p) + half, far: Math.max(...q.map((v) => Math.abs(v))) + 8 };
    }).sort((a, b) => a.lo - b.lo);
    for (const c of clusters) { const b = bands.at(-1); if (b && c.lo < b.hi + 0.5) { b.hi = Math.max(b.hi, c.hi); b.far = Math.max(b.far, c.far); } else bands.push({ ...c }); }
    for (let k = 0; k + 1 < bands.length; k++) {
      const gap = bands[k + 1].lo - bands[k].hi;
      if (gap < OUT.street + 1.0) continue;
      const mid = (bands[k].hi + bands[k + 1].lo) / 2, reach = Math.max(bands[k].far, bands[k + 1].far);
      let pts = [], n = 0;
      const close = () => { if (pts.length >= 9) out.push({ id: `street-${side}-${k}${'abcdefgh'[n++] ?? n}`, side, pts, width: OUT.street, reach }); pts = []; };
      for (let d = HALF + 3; d <= reach; d += 2) {                                    // every run of free ground along the corridor is a street, from the wall out
        const x = S.row === 'z' ? S.out[0] * d : mid, z = S.row === 'z' ? mid : S.out[1] * d;
        const wide = [-1, 0, 1].every((t) => (S.row === 'z' ? taken.free(x, z + t * (OUT.street / 2 + 0.3)) : taken.free(x + t * (OUT.street / 2 + 0.3), z))) && taken.free(x, z, OUT.street / 2 + 0.2);
        if (wide) pts.push([x, z]); else close();
      }
      close();
    }
  }
  return out;
}

/** The alley in front of every row: a centre line 2.3 m beyond the retaining walls, the length of the row and a little over, cut where something stands. */
export function planAlleys(plan, planned, taken) {
  const out = [], byHouse = new Map((planned?.houses ?? []).map((h) => [h.id, h]));
  for (const c of planned?.clusters ?? []) {
    const hs = c.houses.map((id) => byHouse.get(id)).filter(Boolean);
    if (hs.length < 3) continue;
    const ry = hs[0].ry, f = frame(ry), depth = Math.max(...hs.map((h) => h.depth)), us = hs.map((h) => (h.x - c.x) * f.u[0] + (h.z - c.z) * f.u[1]), half = Math.max(...hs.map((h) => h.width)) / 2;
    const u0 = Math.min(...us) - half - 3, u1 = Math.max(...us) + half + 3, v = depth / 2 + 2.6, pts = [];
    let started = false;
    for (let u = u0; u <= u1 + 1e-6; u += 2) {
      const [x, z] = at(c.x, c.z, f, u, v);
      if (!taken.free(x, z, 0.8)) { if (started) break; continue; }
      started = true; pts.push([x, z]);
    }
    if (pts.length >= 5) out.push({ id: `alley-${c.id}`, cluster: c.id, side: c.region, pts, width: OUT.alley });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------------------------ trees
/** [kind, height m, how much of the stock]: what grows on each side (the north is the forested ridge, the east wetter, the west dry). */
const STOCK = {
  north: [['euca', 13, 0.5], ['cypress', 8, 0.32], ['broad', 7, 0.18]],
  east: [['euca', 12, 0.38], ['broad', 7, 0.37], ['cypress', 8, 0.25]],
  west: [['cypress', 8, 0.42], ['broad', 6, 0.3], ['euca', 11, 0.28]],
  south: [['broad', 7, 0.4], ['cypress', 8, 0.35], ['euca', 12, 0.25]],
};
const HEIGHT = { euca: 12, cypress: 8, broad: 7, scrub: 1.6 };              // a tree asked for by kind alone grows to its kind's usual height
const sideOf = (x, z) => (Math.abs(x) >= Math.abs(z) ? (x > 0 ? 'east' : 'west') : (z < 0 ? 'north' : 'south'));
function stockAt(x, z, u) {
  let at = u; for (const [kind, h, w] of STOCK[sideOf(x, z)]) { at -= w; if (at < 0) return { kind, h }; }
  return { kind: 'cypress', h: 8 };
}

/**
 * Where trees stand. `ground(x, z)` is the rendered far surface. Four kinds of spot, nearest the plot first, cut at OUT.maxTrees:
 *  - the belt: three rows of tall trees 3.5, 8.5 and 14.5 m beyond the wall axis on the north, east and west (their crowns clear the wall from inside), open at the entry road and the south;
 *  - the avenue: either side of every street, every 6 to 9 m, one spot in two;
 *  - behind every row: a hedge of trees and scrub on the uphill side, where a terrace ends in a bank;
 *  - the hillside: a jittered 5 m lattice thinned by two noises (a clump and a scale), thicker where the land is less built up, never on a slope over 0.75 or on taken ground.
 */
export function planTrees(plan, planned, taken, streets, ground, houses = []) {
  const seed = plan.seed, trees = [], key = (...a) => `${seed}:out:${a.join(':')}`;
  const add = (x, z, o = {}) => {
    const g = ground(x, z);
    if (!Number.isFinite(g) || Math.abs(x) < HALF + 2 && Math.abs(z) < HALF + 2) return false;
    if (!taken.free(x, z, o.clear ?? 1.4) || slopeOf(ground, x, z) > (o.slope ?? 0.75)) return false;
    const s = o.kind ? { kind: o.kind, h: o.h ?? HEIGHT[o.kind] } : stockAt(x, z, rnd(key('kind', Math.round(x), Math.round(z))));
    const h = (o.h ?? s.h) * (0.78 + 0.44 * rnd(key('h', Math.round(x * 3), Math.round(z * 3))));
    trees.push({ x, z, kind: s.kind, h: o.tall ? h * 1.2 : h, d: Math.max(Math.abs(x), Math.abs(z)) - HALF, k: trees.length });
    taken.disc(x, z, o.gap ?? 1.6);
    return true;
  };
  // the belt
  for (const side of ['north', 'east', 'west']) {
    OUT.belt.forEach((d, row) => {
      for (let s = -HALF + 3; s < HALF - 3; s += 4.6) {
        const j = rnd(key('belt', side, row, Math.round(s))), jj = rnd(key('beltj', side, row, Math.round(s)));
        if (j > [0.78, 0.6, 0.42][row]) continue;
        const along = s + (jj - 0.5) * 3.2, out = HALF + d + (rnd(key('beltd', side, row, Math.round(s))) - 0.5) * 3;
        const [x, z] = side === 'east' ? [out, along] : side === 'west' ? [-out, along] : [along, -out];
        add(x, z, { tall: true, h: 11, gap: 2.4, clear: 1.6 });
      }
    });
  }
  // the avenue
  for (const st of streets) {
    for (let i = 2; i < st.pts.length - 1; i += 3) {
      const p = st.pts[i], q = st.pts[i + 1], tx = q[0] - p[0], tz = q[1] - p[1], l = Math.hypot(tx, tz) || 1;
      for (const side of [-1, 1]) {
        if (rnd(key('ave', st.id, i, side)) > 0.72) continue;
        const off = st.width / 2 + 1.6 + rnd(key('aveo', st.id, i, side)) * 1.2;
        add(p[0] - (tz / l) * off * side, p[1] + (tx / l) * off * side, { kind: rnd(key('avek', st.id, i, side)) < 0.7 ? 'cypress' : 'broad', h: 8, clear: 1.2, gap: 1.8 });
      }
    }
  }
  // behind each row
  const byHouse = new Map((planned?.houses ?? []).map((h) => [h.id, h]));
  for (const c of planned?.clusters ?? []) {
    const hs = c.houses.map((id) => byHouse.get(id)).filter(Boolean);
    if (hs.length < 3) continue;
    const f = frame(hs[0].ry), depth = Math.max(...hs.map((h) => h.depth)), us = hs.map((h) => (h.x - c.x) * f.u[0] + (h.z - c.z) * f.u[1]);
    const u0 = Math.min(...us) - 3, u1 = Math.max(...us) + 3, n = Math.round((u1 - u0) / 4.5);
    for (let i = 0; i <= n; i++) {
      if (rnd(key('back', c.id, i)) > 0.88) continue;
      const u = u0 + ((u1 - u0) * i) / n + (rnd(key('backu', c.id, i)) - 0.5) * 2, v = -depth / 2 - 1.8 - rnd(key('backv', c.id, i)) * 4.5, [x, z] = at(c.x, c.z, f, u, v);
      const r = rnd(key('backk', c.id, i));
      add(x, z, { kind: r < 0.3 ? 'scrub' : r < 0.55 ? 'cypress' : r < 0.8 ? 'broad' : 'euca', h: r < 0.3 ? 1.6 : undefined, clear: 1.0, gap: 1.4 });
    }
  }
  // the yards behind the far rows: a tree or a bush against the back wall of one house in three
  for (const [i, h] of (houses ?? []).entries()) {
    if (Math.max(Math.abs(h.x), Math.abs(h.z)) - HALF > 200 || rnd(key('yard', i)) > 0.34) continue;
    const f = frame(h.ry), [x, z] = at(h.x, h.z, f, (rnd(key('yardu', i)) - 0.5) * h.w, -h.d / 2 - 1.4 - rnd(key('yardv', i)) * 2.4), r = rnd(key('yardk', i));
    add(x, z, r < 0.35 ? { kind: 'scrub', h: 1.7, clear: 0.7, gap: 1.0 } : { clear: 1.0, gap: 1.4 });
  }
  // the hillside
  const R = OUT.reach - 20;
  for (let gz = -R; gz < R; gz += 4) for (let gx = -R; gx < R; gx += 4) {
    const x = gx + rnd(key('gx', gx, gz)) * 4, z = gz + rnd(key('gz', gx, gz)) * 4;
    const d = Math.max(Math.abs(x), Math.abs(z)) - HALF;
    if (d < 6 || d > 200) continue;
    const clump = 0.5 + 0.5 * vnoise(x, z, 38, seed + 311), scale = 0.5 + 0.5 * vnoise(x, z, 130, seed + 313), wild = taken.free(x, z, 7) ? 1 : 0;
    const p = Math.min(0.97, (0.28 + 1.0 * ss(0.34, 0.68, clump)) * (0.55 + 0.9 * scale) * (0.5 + 0.5 * wild) * (1 - 0.4 * ss(80, 200, d)));
    if (rnd(key('hill', gx, gz)) > p) continue;
    const r = rnd(key('hillk', gx, gz));
    add(x, z, r < 0.22 ? { kind: 'scrub', h: 1.6, clear: 0.8, gap: 1.2 } : {});
  }
  trees.sort((a, b) => a.d - b.d || a.k - b.k);
  return trees.slice(0, OUT.maxTrees).map((t, k) => ({ ...t, k }));
}

// ------------------------------------------------------------------------------------------------------------------------------ landmarks
/**
 * Three landmarks on the hills the plot looks at, each on the best of the free, level ground in its own region: a water tower (east), a chapel (north) and a radio mast (west).
 * "Best": the highest ground the tower, chapel or mast would stand on, nearer the plot's axis the better, kept 14 m off every house, street and landmark of vista.js.
 */
export function planLandmarks(plan, taken, ground) {
  const pick = (kind, x0, x1, z0, z1, r, bias) => {
    let best = null;
    for (let z = z0; z <= z1; z += 4) for (let x = x0; x <= x1; x += 4) {
      if (!taken.free(x, z, r + 4) || slopeOf(ground, x, z) > 0.14 || slopeOf(ground, x + r * 0.6, z) > 0.22 || slopeOf(ground, x, z + r * 0.6) > 0.22) continue;
      const score = ground(x, z) - bias(x, z);
      if (!best || score > best.score) best = { kind, x, z, y: ground(x, z), score };
    }
    if (best) taken.disc(best.x, best.z, r + 6);
    return best;
  };
  const out = [
    pick('tower', 150, 235, -100, 100, 6, (x, z) => 0.35 * Math.abs(z) + 0.1 * Math.abs(x - 170)),
    pick('chapel', -70, 90, -220, -150, 9, (x, z) => 0.3 * Math.abs(x - 30) + 0.1 * Math.abs(z + 170)),
    pick('mast', -270, -190, -150, 110, 4, (x, z) => 0.3 * Math.abs(z + 20) + 0.3 * Math.abs(x + 205)),
  ].filter(Boolean);
  out.forEach((l) => { l.ry = Math.atan2(-l.x, -l.z); });                               // facing the middle of the plot
  return out;
}

export function planOutskirts(plan, planned = null, houses = null) {
  const ground = sample(plan), taken = takenGround(plan, planned, houses), streets = planStreets(plan, planned, taken), alleys = planAlleys(plan, planned, taken);
  for (const s of streets) for (const p of s.pts) taken.disc(p[0], p[1], OUT.street / 2 + 0.4);
  for (const a of alleys) for (const p of a.pts) taken.disc(p[0], p[1], OUT.alley / 2);
  const landmarks = planLandmarks(plan, taken, ground), trees = planTrees(plan, planned, taken, streets, ground, houses ?? []);
  return { streets, alleys, trees, landmarks, taken, ground };
}

// ------------------------------------------------------------------------------------------------------------------------------ drawing
const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const shade = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

/** A tree: eucalyptus (a S-curved pale trunk, sprays of leaf hung round the crown), cypress (two crossed plumes), broadleaf (a trunk, boughs round a crown) or scrub (a few boughs close to the ground). */
export function drawTree(b, t, y, r, cards) {
  const { x, z, h, kind } = t, g = 0.82 + 0.26 * r.next(), near = Math.max(Math.abs(x), Math.abs(z)) - HALF < OUT.near;
  /** one card of a crown: a sprig of the leaf sheet or, without the sheet, a card of the painted atlas, the same size in the same place (the same two triangles: the sheet adds none) */
  const leaf = (cell, at, up, right, size, col, nrm, o, paint) => {
    if (cards) return sprig(b, CARDS, cell, at, up, right, size, col, nrm, o);
    const k = rgb(paint);
    card(b, 'foliage', V.sub(at, V.mul(up, size * 0.5)), right, up, size * 0.8, size, [0, 0, 1, 1], [col[0] * k[0], col[1] * k[1], col[2] * k[2]], nrm);
  };
  if (kind === 'cypress') {
    const rot = r.range(0, 3);
    for (let i = 0; i < 2; i++) {
      const yaw = rot + (i * Math.PI) / 2, right = [Math.cos(yaw), 0, -Math.sin(yaw)], nrm = V.nrm([Math.sin(yaw), 0.55, Math.cos(yaw)]);
      if (cards) sprig(b, CARDS, CELL.CYPRESS, [x, y - 0.1, z], [0, 1, 0], right, h, [g, g, g], nrm, { squash: 0.7, mirror: i === 1 });
      else card(b, 'foliage_low', [x, y - 0.1, z], right, [0, 1, 0], h * 0.4, h, [0, 0, 1, 1], shade(rgb(0x6f9a6a), g), nrm);
    }
    return;
  }
  if (kind === 'scrub') {
    for (let i = 0; i < 4; i++) {
      const a = r.range(0, Math.PI * 2), d = r.range(0.1, 0.5), up = V.nrm([Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5]), right = V.nrm(V.cross(up, [0, 1, 0]));
      if (cards) sprig(b, CARDS, CELL.BROADLEAF, [x + Math.cos(a) * d, y + 0.05, z + Math.sin(a) * d], up, right, h * r.range(0.7, 1.1), [g * 0.9, g * 0.95, g * 0.8], V.nrm([Math.cos(a), 0.8, Math.sin(a)]), { mirror: r.chance(0.5) });
      else card(b, 'foliage_low', [x + Math.cos(a) * d, y, z + Math.sin(a) * d], V.nrm([-Math.sin(a), 0, Math.cos(a)]), [0, 1, 0], h, h * 0.8, [0, 0, 1, 1], shade(rgb(0x7ca24d), g), [0, 1, 0]);
    }
    return;
  }
  const lean = r.range(-0.6, 0.6), lz = r.range(-0.6, 0.6), euca = kind === 'euca', top = [x + lean, y + h * (euca ? 0.86 : 0.6), z + lz];
  const tr = euca ? 0.16 + h * 0.004 : 0.12 + h * 0.012, bark = euca ? 'bark_euca' : 'bark_trunk', col = euca ? [0.8, 0.76, 0.7] : [1.5, 2.5, 3.2].map((v) => v * 0.8);
  const n = near ? (euca ? 3 : 2) : 1, sides = near ? 6 : 4;                              // trunk pieces and sides: a far tree is one tapered post
  let v = 0;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n, p0 = [x + (top[0] - x) * t0, y + (top[1] - y) * t0 - (k ? 0 : 0.25), z + (top[2] - z) * t0], p1 = [x + (top[0] - x) * t1, y + (top[1] - y) * t1, z + (top[2] - z) * t1];
    v = trunk(b, bark, p0, p1, tr * (1 - 0.55 * t0), tr * (1 - 0.55 * t1), sides, { col, caps: k === n - 1 }, v, euca ? 2 : 1);
  }
  if (euca) {                                                                        // limbs from the upper trunk, a head of sprays (hung by their twig tips) on each and on the leader
    const heads = [[top, h * 0.15, h * 0.2, near ? 8 : 5]], limbs = near ? 3 : 2, rad0 = tr * 0.6;
    for (let i = 0; i < limbs; i++) {
      const a = (i / limbs) * Math.PI * 2 + r.range(-0.5, 0.5), t0 = r.range(0.5, 0.74), len = h * r.range(0.12, 0.2);
      const p0 = [x + (top[0] - x) * t0, y + (top[1] - y) * t0, z + (top[2] - z) * t0], p1 = [p0[0] + Math.cos(a) * len, p0[1] + h * r.range(0.07, 0.15), p0[2] + Math.sin(a) * len];
      if (near) trunk(b, bark, p0, p1, rad0, 0.04, 4, { col, caps: false }, 0, 2);
      heads.push([p1, h * 0.1, h * 0.17, near ? 5 : 2]);
    }
    for (const [c, rx, size, n] of heads) {
      for (let i = 0; i < n; i++) {
        const u = r.range(-0.25, 1), phi = r.range(0, Math.PI * 2), k = Math.sqrt(1 - u * u), rad = Math.cbrt(r.range(0.3, 1)), dx = k * Math.cos(phi) * rad, dy = u * rad, dz = k * Math.sin(phi) * rad;
        const yaw = r.range(0, Math.PI), swing = r.range(-0.2, 0.3), fwd = [Math.sin(yaw), 0, Math.cos(yaw)], right = [Math.cos(yaw), 0, -Math.sin(yaw)], up = V.nrm([fwd[0] * Math.sin(swing), Math.cos(swing), fwd[2] * Math.sin(swing)]);
        const sh = (0.66 + 0.34 * (dy * 0.5 + 0.5) + r.range(-0.06, 0.06)) * g;
        leaf(CELL.EUCA, [c[0] + dx * rx, c[1] + dy * rx * 0.6, c[2] + dz * rx], up, right, size * r.range(0.85, 1.2), [sh, sh, sh], V.nrm([dx, dy * 0.8 + 0.45, dz]), { mirror: r.chance(0.5) }, 0x9db894);
      }
    }
    return;
  }
  const cr = h * 0.42, c0 = [top[0], y + h * 0.78, top[2]], ryc = cr * 0.62, tint = [g * 0.95, g, g * 0.85];       // broadleaf: boughs growing out from inside the crown
  for (let i = 0, boughs = near ? 12 : 6; i < boughs; i++) {
    const dy = r.range(-0.4, 0.85), k = Math.sqrt(1 - dy * dy), phi = r.range(0, Math.PI * 2), rad = r.range(0.08, 0.4), dx = k * Math.cos(phi), dz = k * Math.sin(phi);
    const foot = [c0[0] + dx * rad * cr, c0[1] + dy * rad * ryc, c0[2] + dz * rad * cr], up = V.nrm([dx, dy + 0.25, dz]), s0 = V.nrm(V.cross(up, [0, 1, 0])), u0 = V.cross(s0, up), roll = r.range(0, Math.PI * 2);
    const right = V.nrm(V.add(V.mul(s0, Math.cos(roll)), V.mul(u0, Math.sin(roll)))), sh = (0.66 + 0.34 * (dy * 0.5 + 0.5) + r.range(-0.06, 0.06));
    leaf(CELL.BROADLEAF, foot, up, right, cr * r.range(0.95, 1.2), [sh * tint[0], sh * tint[1], sh * tint[2]], V.nrm([dx, dy * 0.8 + 0.45, dz]), { mirror: r.chance(0.5) }, 0x6f9a44);
  }
}

/** The water tower: four legs and braces, a drum with a conical floor and a lid, a ladder. 60 m of concrete. */
export function drawTower(b, l) {
  const { x, z, y, ry } = l, f = frame(ry), P = (u, v) => at(x, z, f, u, v), legH = 11, drumY = y + legH, conc = [0.72, 0.7, 0.66], rust = [0.5, 0.3, 0.2];
  for (const [u, v] of [[-2.6, -2.6], [2.6, -2.6], [2.6, 2.6], [-2.6, 2.6]]) { const [px, pz] = P(u, v); b.box('concrete_bare', px, y + legH / 2 - 0.5, pz, 0.7, legH + 1, 0.7, { ry, col: conc, skip: ['ny'] }); }
  for (const lv of [0.35, 0.7]) for (const [a, c] of [[[-2.6, -2.6], [2.6, -2.6]], [[2.6, -2.6], [2.6, 2.6]], [[2.6, 2.6], [-2.6, 2.6]], [[-2.6, 2.6], [-2.6, -2.6]]]) {
    const m = P((a[0] + c[0]) / 2, (a[1] + c[1]) / 2); b.box('concrete_bare', m[0], y + legH * lv, m[1], Math.abs(a[0] - c[0]) < 1e-6 ? 0.34 : 5.2, 0.4, Math.abs(a[1] - c[1]) < 1e-6 ? 0.34 : 5.2, { ry, col: conc });
  }
  b.box('concrete_bare', x, drumY + 0.15, z, 7.0, 0.5, 7.0, { ry, col: conc });
  b.cyl('plaster_rough', x, drumY + 0.4, z, 3.2, 4.4, 14, { col: [0.7, 0.78, 0.82], caps: false });
  b.cyl('plaster_rough', x, drumY - 0.9, z, 1.2, 1.35, 14, { r1: 3.2, col: [0.7, 0.78, 0.82], caps: false });
  b.cyl('concrete_bare', x, drumY + 4.8, z, 3.3, 0.4, 14, { r1: 0.5, col: [0.6, 0.6, 0.58] });
  const [lx, lz] = P(3.1, 0); b.box('iron_black', lx, y + legH / 2 + 2.2, lz, 0.1, legH + 4.4, 0.5, { ry, col: rust });
}

/** The chapel: a nave under a gable roof of tile, a bell tower with a pyramid roof and a cross, a porch step. */
export function drawChapel(b, l) {
  const { x, z, y, ry } = l, f = frame(ry), P = (u, v) => at(x, z, f, u, v), wall = [0.93, 0.9, 0.82], tile = [0.72, 0.34, 0.2], nave = { w: 7, d: 13, h: 5.2 };
  b.box('plaster_rough', x, y + (nave.h - 1) / 2 - 0.5 + 0.5, z, nave.w, nave.h + 1, nave.d, { ry, col: wall, skip: ['ny', 'py'] });
  const roof = (sgn) => { const a = P(sgn * (nave.w / 2 + 0.5), nave.d / 2 + 0.5), c = P(sgn * (nave.w / 2 + 0.5), -nave.d / 2 - 0.5), d = P(0, -nave.d / 2 - 0.5), e = P(0, nave.d / 2 + 0.5), yb = y + nave.h, yt = y + nave.h + 2.6; return [[a[0], yb, a[1]], [c[0], yb, c[1]], [d[0], yt, d[1]], [e[0], yt, e[1]]]; };
  const r0 = roof(-1), r1 = roof(1);
  b.quad('roof_tile_clay', r0[0], r0[1], r0[2], r0[3], { col: tile }); b.quad('roof_tile_clay', r1[1], r1[0], r1[3], r1[2], { col: tile });
  for (const s of [-1, 1]) { const a = P(-nave.w / 2, s * nave.d / 2), c = P(nave.w / 2, s * nave.d / 2), m = P(0, s * nave.d / 2); const A = [a[0], y + nave.h, a[1]], C = [c[0], y + nave.h, c[1]], M = [m[0], y + nave.h + 2.6, m[1]]; if (s > 0) b.tri('plaster_rough', A, C, M, { col: wall }); else b.tri('plaster_rough', C, A, M, { col: wall }); }
  const [tx, tz] = P(0, nave.d / 2 + 1.6);
  b.box('plaster_rough', tx, y + 4.8, tz, 3.2, 10.6, 3.2, { ry, col: wall, skip: ['ny'] });
  b.box('plaster_rough', tx, y + 9.4, tz, 3.5, 0.3, 3.5, { ry, col: [0.8, 0.77, 0.7] });
  b.cyl('roof_tile_clay', tx, y + 9.55, tz, 2.4, 3.2, 4, { r1: 0.08, caps: false, col: tile });
  b.box('iron_black', tx, y + 13.6, tz, 0.14, 1.6, 0.14); b.box('iron_black', tx, y + 13.9, tz, 0.8, 0.14, 0.14, { ry });
  const [dx, dz] = P(0, nave.d / 2 + 3.4); b.box('stone_wall', dx, y + 0.12, dz, 4.2, 0.3, 1.6, { ry, col: [0.8, 0.78, 0.74] });
  const [px, pz] = P(0, nave.d / 2 + 3.18); b.box('wood_dark', px, y + 1.2, pz, 1.1, 2.1, 0.08, { ry });
}

/** The radio mast: a red and white tapering mast on a concrete foot with a platform, three dishes and an aerial. */
export function drawMast(b, l) {
  const { x, z, y } = l, H = 30, bands = 6, rAt = (t) => 0.55 - 0.32 * t;
  b.cyl('concrete_bare', x, y - 0.4, z, 1.8, 0.9, 8, { col: [0.62, 0.6, 0.57] });
  for (let k = 0; k < bands; k++) b.cyl('concrete_bare', x, y + 0.4 + (k * H) / bands, z, rAt(k / bands), H / bands + 0.04, 6, { r1: rAt((k + 1) / bands), caps: false, col: k % 2 ? [0.95, 0.95, 0.95] : [0.88, 0.14, 0.1] });
  b.box('iron_black', x, y + H * 0.72, z, 3.2, 0.3, 3.2);
  for (const [a, tilt] of [[0.3, 0], [2.4, 0], [4.4, 0]]) b.cyl('concrete_bare', x + Math.cos(a) * 1.7, y + H * 0.72 + 0.9, z + Math.sin(a) * 1.7, 0.1, 0.5, 8, { r1: 0.7 + tilt, col: [0.9, 0.9, 0.9] });
  b.cyl('iron_black', x, y + H + 0.4, z, 0.12, 9, 6, { r1: 0.04 });
}

/** A street or an alley, laid on the rendered ground: a ribbon in 12-point runs, each into the builder of the tile it is in. */
function laid(builderAt, mat, pts, ground, offL, offR, o) {
  for (let i = 0; i + 1 < pts.length; i += 11) {
    const run = pts.slice(i, i + 12);
    if (run.length < 2) continue;
    const m = run[run.length >> 1];
    ribbon(builderAt(m[0], m[1]), mat, run, run.map((p) => ground(p[0], p[1])), offL, offR, o);
  }
}

export function buildOutskirts(K) {
  const { ctx, plan } = K, planned = ctx.world?.vistaKitPlan ?? null, cards = hasSheet(ctx), R = K.rng('outskirts');
  const ground = sample(plan), houses = farHouses(plan, { taken: kitZones(planned) }), P = planOutskirts(plan, planned, houses);
  // A tile is two builders: the ground it lays (streets, alleys) and the landmarks never cast; the trees do (every mesh that wears the canopy sheet casts, world-canopy-page.test.mjs, and a
  // tree belt outside the wall throws its shade over the plot at the low sun). The shadow pass skips a tile that is out of its window, so the far ones cost nothing.
  const builders = new Map(), tileIds = new Set(), builderAt = (x, z, cast = false) => {
    const i = Math.floor(x / OUT.tile), j = Math.floor(z / OUT.tile), id = `props.outskirts.${i}.${j}${cast ? '.trees' : ''}`;
    tileIds.add(`${i}.${j}`);
    if (!builders.has(id)) builders.set(id, ctx.batch.builder(id, { cast }));
    return builders.get(id);
  };
  const stats = { streets: P.streets.length, streetM: 0, alleys: P.alleys.length, alleyM: 0, trees: P.trees.length, kinds: {}, landmarks: P.landmarks.map((l) => l.kind), tiles: 0 };
  for (const s of P.streets) {
    stats.streetM += (s.pts.length - 1) * 2;
    laid(builderAt, 'street_concrete', s.pts, ground, -s.width / 2, s.width / 2, { dy: 0.09, col: [0.82, 0.8, 0.76] });
    laid(builderAt, 'concrete_bare', s.pts, ground, -s.width / 2 - 0.32, -s.width / 2, { dy: 0.13, col: [0.9, 0.88, 0.84] });
    laid(builderAt, 'concrete_bare', s.pts, ground, s.width / 2, s.width / 2 + 0.32, { dy: 0.13, col: [0.9, 0.88, 0.84] });
    laid(builderAt, 'dirt_path', s.pts, ground, -s.width / 2 - 0.9, -s.width / 2 - 0.3, { dy: 0.07, col: [0.55, 0.5, 0.42] });
    laid(builderAt, 'dirt_path', s.pts, ground, s.width / 2 + 0.3, s.width / 2 + 0.9, { dy: 0.07, col: [0.55, 0.5, 0.42] });
  }
  for (const a of P.alleys) {
    stats.alleyM += (a.pts.length - 1) * 2;
    laid(builderAt, 'dirt_path', a.pts, ground, -a.width / 2 - 0.5, a.width / 2 + 0.5, { dy: 0.07, col: [0.5, 0.45, 0.38] });
    laid(builderAt, 'street_concrete', a.pts, ground, -a.width / 2, a.width / 2, { dy: 0.1, col: [0.78, 0.76, 0.72] });
  }
  for (const t of P.trees) {
    stats.kinds[t.kind] = (stats.kinds[t.kind] ?? 0) + 1;
    drawTree(builderAt(t.x, t.z, true), t, ground(t.x, t.z), R.fork(`t${t.k}`), cards);
  }
  for (const l of P.landmarks) {
    const b = builderAt(l.x, l.z);
    if (l.kind === 'tower') drawTower(b, l); else if (l.kind === 'chapel') drawChapel(b, l); else drawMast(b, l);
  }
  stats.tiles = tileIds.size;
  if (ctx.world) ctx.world.outskirts = { ...stats, plan: P };
  return stats;
}
