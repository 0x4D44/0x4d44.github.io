// THE DUNE GRASS (A5, round 7, phase 2c, dev/FEATURE-BEACH.md 1.4: "dunes grass: sea wall toe, both ends, the `tufts` machinery of flora.js"): the tough grass that grows where the sand is left alone, in front of the
// sea wall's stones at the two ends of the beach, where nobody lays a towel: a ragged fringe of clumps from the huts and kiosks to the end walls, and a sparser strip down the inside of each end wall. Pure planning
// first (`planDunes`: the coast plan and the front in, plain records out, so a Node test and the page read the same places), then the planting (`buildDunes`: flora.js `tuft`, the same crossed cards of the plot's
// own grass, in the plot's own `tufts` batch: no new material and no draw call of its own, a card has no collider). It draws from no stream the rest of the beach reads.
//   planDunes(coast, front) -> { tufts: [{ x, z, big }], stats: { tufts, west, east } }
import { makeRng } from '../core/rng.js';
import { SEA, WALL_Z, XW } from './coast.js';
import { onAccess } from './beachfront.js';
import { tuft } from './flora.js';

export const DUNES = Object.freeze({ from: 62, step: 2.1, zMin: WALL_Z + 1.3, solidGap: 0.6, palapaGap: 0.9 });   // the fringe starts 62 m from the middle; a clump every 2.1 m; 1.3 m in front of the wall; the gaps it keeps from a collider and a palapa's footprint
const FLAT = new Set(['riprap', 'seaweed', 'shell', 'driftwood']);                                              // what lies on the ground and stops nothing: grass grows among it

const segDist = (px, pz, x1, z1, x2, z2) => {
  const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2)) : 0;
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
};
/** Whether a collider of the front stands within `m` metres of (x, z) (kit.js rect / post / seg: a rect's frame turns by `ry` as the kit's does). */
const nearSolid = (s, x, z, m) => {
  if (s.kind === 'post') return Math.hypot(x - s.x, z - s.z) <= s.r + m;
  if (s.kind === 'seg') return segDist(x, z, s.x1, s.z1, s.x2, s.z2) <= (s.t ?? 0) + m;
  const c = Math.cos(s.ry), sn = Math.sin(s.ry), dx = x - s.x, dz = z - s.z, u = dx * c - dz * sn, v = dx * sn + dz * c;
  return Math.abs(u) <= s.w / 2 + m && Math.abs(v) <= s.d / 2 + m;
};

export function planDunes(coast, front, o = {}) {
  const rng = makeRng(((o.seed ?? coast.seed ?? 1) * 40503 + 977) >>> 0), H = coast.heightAt, tufts = [];
  const ok = (x, z) => {
    if (Math.abs(x) > XW - 0.5 || z < DUNES.zMin) return false;
    if (z > coast.shoreZ(x) - 10 || H(x, z) < SEA + 0.4) return false;                                         // the dry sand, well up from the waterline
    if (onAccess(coast, x, z, 1.2)) return false;
    if (front.solids.some((s) => nearSolid(s, x, z, DUNES.solidGap))) return false;
    if (front.palapas.some((p) => Math.abs(x - p.x) <= p.w / 2 + DUNES.palapaGap && Math.abs(z - p.z) <= p.d / 2 + DUNES.palapaGap)) return false;
    return !front.items.some((i) => !FLAT.has(i.group) && Math.hypot(i.x - x, i.z - z) < 0.7);                 // (a towel, a bag, a lounger: a clump keeps off them too)
  };
  const add = (x, z, big) => { if (ok(x, z)) tufts.push({ x: +x.toFixed(2), z: +z.toFixed(2), big: +big.toFixed(2) }); };
  for (const side of [-1, 1]) {
    // the toe: a ragged fringe of clumps in front of the stones, from the huts out to the end wall (every draw is taken whether the clump is kept or not, so nothing after a blocked one moves)
    for (let a = DUNES.from; a <= XW - 0.6; a += DUNES.step) {
      const cx = side * (a + rng.range(-0.7, 0.7)), cz = DUNES.zMin + rng.range(0, 1.6), keep = rng.chance(0.78), n = 3 + Math.floor(rng.range(0, 3));
      for (let k = 0; k < n; k++) { const x = cx + rng.range(-0.7, 0.7), z = cz + rng.range(-0.4, 0.4), big = rng.range(0.78, 1.08); if (keep) add(x, z, big); }
    }
    // the end wall: a sparser strip down the inside of the wall, out onto the sand
    for (let z = 111; z <= 131; z += 2.6) {
      const x = side * (XW - 0.5 - rng.range(0, 1.1)), keep = rng.chance(0.55), n = 2 + Math.floor(rng.range(0, 2));
      for (let k = 0; k < n; k++) { const px = x - side * rng.range(0, 0.6), pz = z + rng.range(-0.6, 0.6), big = rng.range(0.78, 1.08); if (keep) add(px, pz, big); }
    }
  }
  return { tufts, stats: { tufts: tufts.length, west: tufts.filter((t) => t.x < 0).length, east: tufts.filter((t) => t.x > 0).length } };
}

/** The step of the props stage: the plan's tufts planted (flora.js `tuft`, each from a stream of its own). A world without a live beach has none. */
export function buildDunes(K) {
  const { ctx } = K, W = ctx.world ?? {};
  if (!W.beach?.live || !W.beachFront) return null;
  const plan = planDunes(ctx.plan.coast, W.beachFront), R = K.rng('dune');
  plan.tufts.forEach((t, i) => tuft(K, t.x, t.z, R.fork('t' + i), t.big));
  W.dunes = plan.stats;
  return plan;
}
