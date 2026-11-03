// COAST MESH (A5): the ground of the beach strip between the plot's walls (x -100..100), z 100 to 300, and what stands on it at the sea wall. Pure of the sea itself (js/engine/water.js).
// Groups: world.coast.terrain (deck, sand and seabed, ONE mesh per material, no shadows cast) and world.coast.deck (sea wall face, coping, rail, stairs, ramp).
// The ground comes from coast.meshHeight (the same function the physics ground is made of, minus the wall ramp and the access corridors, which are drawn as parts of their own), at 2 m
// cells up to z 160 and 4 m beyond, with a skirt on every edge, so the strip meets the far terrain (periphery.js) without a seam.
import { vnoise, ss, lerp } from './geom.js';
import { beam } from './mk.js';
import { SEA, Z0, DECK, DECK_Z, TOE, STAIR_FLIGHT, RAMP_END_Z, CHEEK, rampY } from './coast.js';

const X0 = -100, X1 = 100, DX = 2, Z_NEAR = 160, Z_END = 300;
export const COAST_TERRAIN = 'world.coast.terrain', COAST_DECK = 'world.coast.deck';
const range = (a, b, d) => { const o = []; for (let v = a; v <= b + 1e-9; v += d) o.push(+v.toFixed(3)); return o; };

/** Tone of a sand cell: warm, darker and glossier where the swash wets it, and a little mottled. */
export function sandTone(h, x, z, seed) {
  const wet = ss(SEA + 0.5, SEA - 0.02, h), k = (1 - 0.34 * wet) * (1 + 0.05 * vnoise(x, z, 3.1, seed + 5) + 0.03 * vnoise(x, z, 0.9, seed + 9));
  return [Math.min(1.25, 1.02 * k), Math.min(1.25, 0.99 * k), Math.min(1.25, 0.9 * k)];
}
export function bedTone(h, x, z, seed) {
  const d = ss(0, 4.5, SEA - h), k = (1 - 0.42 * d) * (1 + 0.05 * vnoise(x, z, 2.6, seed + 7));
  return [0.86 * k, 0.97 * k, 1.0 * k];
}

export function buildCoastMesh(ctx) {
  const plan = ctx.plan, C = plan.coast, seed = plan.seed;
  const T = ctx.batch.builder(COAST_TERRAIN, { cast: false });
  const XS = range(X0, X1, DX), ZD = [Z0, 101.5, 103, 105.5, DECK_Z], ZS = [DECK_Z, ...range(110, Z_NEAR, 2), ...range(Z_NEAR + 4, Z_END, 4)];
  const H = (x, z) => C.meshHeight(x, z), Hd = (x, z) => H(x, Math.min(z, DECK_Z - 1e-4));                // the deck is flat to its edge: the drop below it is the sea wall's, so the deck's last row (z = DECK_Z) is the deck's height, not the wall foot's
  const normal = (x, z, h = H) => { const e = 1, gx = (h(x + e, z) - h(x - e, z)) / (2 * e), gz = (h(x, z + e) - h(x, z - e)) / (2 * e), l = Math.hypot(gx, 1, gz); return [-gx / l, 1 / l, -gz / l]; };
  const maps = new Map();
  const vtx = (mat, rowKey, i, j, x, z, col, h) => {
    let m = maps.get(mat + rowKey); if (!m) maps.set(mat + rowKey, m = new Map());
    const k = j * 4096 + i; let v = m.get(k);
    if (v === undefined) { const y = h(x, z); v = T.vert(T._acc(mat), [x, y, z], normal(x, z, h), x, z, col(y, x, z, seed)); m.set(k, v); }
    return v;
  };
  const cells = (rows, rowKey, pick, col, h = H) => {
    for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i + 1 < XS.length; i++) {
      const xa = XS[i], xb = XS[i + 1], za = rows[j], zb = rows[j + 1];
      const mat = pick((h(xa, za) + h(xb, za) + h(xa, zb) + h(xb, zb)) / 4), acc = T._acc(mat);
      const a = vtx(mat, rowKey, i, j, xa, za, col, h), c = vtx(mat, rowKey, i, j + 1, xa, zb, col, h), d = vtx(mat, rowKey, i + 1, j + 1, xb, zb, col, h), e = vtx(mat, rowKey, i + 1, j, xb, za, col, h);
      acc.idx.push(a, c, d, a, d, e); T.tris += 2;
    }
  };
  cells(ZD, 'deck', () => 'promenade_pavers', (y, x, z, s) => { const k = 1 + 0.04 * vnoise(x, z, 4.3, s + 3); return [k, k, k * 0.98]; }, Hd);
  cells(ZS, 'sea', (h) => (h > SEA - 0.04 ? 'sand_dry' : 'seabed_sand'), (y, x, z, s) => (y > SEA - 0.04 ? sandTone(y, x, z, s) : bedTone(y, x, z, s)));
  // skirts: 1.5 m aprons down the two sides and the far end (seen from either side), so the finer strip and the far tiles never show the sky between them
  const skirt = (pts, nrm, h = H, fixed = null) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], y0 = h(x0, z0), y1 = h(x1, z1), mat = fixed ?? (y0 > SEA - 0.04 ? 'sand_dry' : 'seabed_sand'), acc = T._acc(mat), col = [0.55, 0.52, 0.45];
      const q0 = T.vert(acc, [x0, y0, z0], nrm, x0, z0, col), q1 = T.vert(acc, [x1, y1, z1], nrm, x1, z1, col), q2 = T.vert(acc, [x1, y1 - 1.5, z1], nrm, x1, z1, col), q3 = T.vert(acc, [x0, y0 - 1.5, z0], nrm, x0, z0, col);
      acc.idx.push(q0, q3, q2, q0, q2, q1, q0, q1, q2, q0, q2, q3); T.tris += 4;
    }
  };
  skirt(ZD.map((z) => [X0, z]), [-1, 0, 0], Hd, 'promenade_pavers'); skirt(ZD.map((z) => [X1, z]), [1, 0, 0], Hd, 'promenade_pavers'); skirt(ZS.map((z) => [X0, z]), [-1, 0, 0]); skirt(ZS.map((z) => [X1, z]), [1, 0, 0]); skirt(XS.map((x) => [x, Z_END]), [0, 0, 1]);
  const terrainTris = T.tris;
  ctx.batch.flush(COAST_TERRAIN);

  // ---- the sea wall (a vertical face from the deck's edge to under the sand), its coping, the rail, the stairs and the ramp
  const D = ctx.batch.builder(COAST_DECK);
  const gaps = C.accesses.map((a) => [a.x - a.w / 2, a.x + a.w / 2]).sort((p, q) => p[0] - q[0]), runs = [];
  { let x = X0; for (const [g0, g1] of gaps) { if (g0 > x) runs.push([x, g0]); x = Math.max(x, g1); } if (x < X1) runs.push([x, X1]); }
  const yb = TOE - 0.25;
  for (const [r0, r1] of runs) {
    const n = Math.max(1, Math.ceil((r1 - r0) / 4));
    for (let i = 0; i < n; i++) { const xa = lerp(r0, r1, i / n), xb = lerp(r0, r1, (i + 1) / n); D.quad('seawall_concrete', [xa, yb, DECK_Z], [xb, yb, DECK_Z], [xb, DECK, DECK_Z], [xa, DECK, DECK_Z], { uv: [xa, yb, xb, yb, xb, DECK, xa, DECK] }); }
    D.box('concrete_bare', (r0 + r1) / 2, DECK + 0.045, DECK_Z - 0.17, r1 - r0, 0.09, 0.34, { skip: ['ny'] });          // the coping
  }
  for (const r of C.rails) {                                                                                      // the rail: a post every 2 m, a top bar and a mid bar between them
    const n = Math.max(1, Math.round((r.x2 - r.x1) / 2));
    for (let i = 0; i <= n; i++) { const x = lerp(r.x1, r.x2, i / n); beam(D, 'iron_black', [x, DECK + 0.09, r.z], [x, DECK + 0.95, r.z], 0.06, 0.06); }
    beam(D, 'iron_black', [r.x1, DECK + 0.95, r.z], [r.x2, DECK + 0.95, r.z], 0.05, 0.05); beam(D, 'iron_black', [r.x1, DECK + 0.5, r.z], [r.x2, DECK + 0.5, r.z], 0.03, 0.03);
  }
  const foot = C.stairFoot, steps = 5, tread = (STAIR_FLIGHT[1] - STAIR_FLIGHT[0]) / steps;
  for (const a of C.stairs) {
    for (let k = 0; k < steps; k++) {                                        // tread tops at the middle of the physics ramp (stairs.js), boxes down to under the sand
      const zc = STAIR_FLIGHT[0] + (k + 0.5) * tread, top = lerp(DECK, foot, (k + 0.5) / steps), bot = top - (DECK - foot) / steps - 0.26;
      D.box({ py: 'stair_tread', all: 'concrete_bare' }, a.x, (top + bot) / 2, zc, a.w, top - bot, tread, { skip: ['ny'] });
    }
  }
  const runRail = (x, y0, y1, z0, z1) => {                                                                     // a rail along x = const from (y0, z0) to (y1, z1): posts every 2 m, a top bar and a mid bar (the deck rail's make)
    const n = Math.max(1, Math.round((z1 - z0) / 2));
    for (let i = 0; i <= n; i++) { const z = lerp(z0, z1, i / n), y = lerp(y0, y1, i / n); beam(D, 'iron_black', [x, y, z], [x, y + 0.95, z], 0.06, 0.06); }
    beam(D, 'iron_black', [x, y0 + 0.95, z0], [x, y1 + 0.95, z1], 0.05, 0.05); beam(D, 'iron_black', [x, y0 + 0.5, z0], [x, y1 + 0.5, z1], 0.03, 0.03);
  };
  for (const c of C.cheeks) {                                                                                  // the cheeks, flush with the deck: the sea wall's concrete, its coping on top, a rail along the top
    D.box({ all: 'seawall_concrete', py: 'concrete_bare' }, c.x, (DECK + yb) / 2, (c.z1 + c.z2) / 2, CHEEK.w, DECK - yb, c.z2 - c.z1, { skip: ['ny', 'nz'] });       // (no north face: it would lie back to back with the sea wall's)
    runRail(c.x, DECK, DECK, c.z1 + 0.1, c.z2 - 0.1);
  }
  { // the ramp: a concrete wedge, 1:12, from the deck's edge to where it meets the sand: the promenade's pavers on top (continuing the deck's), the sea wall's concrete on the sides, a rail along each edge
    const a = C.ramp, x0 = a.x - a.w / 2, x1 = a.x + a.w / 2, yEnd = C.meshHeight(a.x, RAMP_END_Z), yTop = DECK, z0 = DECK_Z, z1 = RAMP_END_Z, ya = TOE - 0.2;
    D.quad('promenade_pavers', [x1, yTop, z0], [x0, yTop, z0], [x0, yEnd, z1], [x1, yEnd, z1], { uv: [x1, z0, x0, z0, x0, z1, x1, z1] });
    D.tri('seawall_concrete', [x0, yTop, z0], [x0, ya, z0], [x0, yEnd, z1]); D.tri('seawall_concrete', [x1, yTop, z0], [x1, yEnd, z1], [x1, ya, z0]);
    for (const r of C.rampRails) runRail(r.x, rampY(r.z1), rampY(r.z2), r.z1, r.z2);
  }
  const stats = { tris: terrainTris, deckTris: D.tris };
  ctx.batch.flush(COAST_DECK);
  return stats;
}
