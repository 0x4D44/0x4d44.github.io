// RIM WALK (A5, round 5, R1-D21): "the plot edge is a blank stepped boundary wall with nothing beyond; any rim walk ends at it".
// What a walker finds now, going round the inside of the wall: a worn footpath along its foot (a metre and a bit off its axis, wandering a little, stone treads where it climbs), weeds along the
// foot, vines climbing the face, and on the crest what a barrio leaves there: bundles of rebar for a floor not yet cast, a run of chain-link, a heap of broken blocks; at the foot, a pile of
// rubble now and then. The hedge and the belt of trees (flora.js) stand on the path's other side, and beyond the wall rise the tall trees of outskirts.js, their crowns above it. The wall itself
// and the dressing of its face (periphery.js: posters, tags, bougainvillea) are as they were: this file only adds. Pure planning first (planRimWalk: a function of the plan and two ground tests,
// walked by the node tests), then the drawing. It runs BEFORE the flora: the path takes its ground (and `K.rimNear` keeps grass tufts off it), so no tree, hedge or planter stands on it.
import { HALF } from './field.js';
import { OCC } from './occupancy.js';
import { vnoise, segDist } from './geom.js';
import { tangents, arcs, card, V } from './mk.js';
import { TILE } from './sprites.js';
import { tuft, drape } from './flora.js';
import { unit as rnd } from './vista-look.js';

const E = HALF - 0.45;                                                   // the wall's axis (periphery.js)
export const RIM = Object.freeze({ inset: 1.5, wander: 0.22, noise: 0.12, step: 1.5, width: 1.1, disc: 0.74, mask: OCC.ROAD | OCC.PLAZA | OCC.LOT | OCC.STAIR | OCC.DOOR });
// each side: where (s, d) is (s along the wall, d in from its axis), and the unit normal into the plot
const SIDE = {
  e: { at: (s, d) => [E - d, s], n: [-1, 0] }, w: { at: (s, d) => [-E + d, s], n: [1, 0] },
  n: { at: (s, d) => [s, -E + d], n: [0, 1] }, s: { at: (s, d) => [s, E - d], n: [0, -1] },
};
/** The position of a point along its wall (z for the east and west walls, x for the north and south ones), and the index of the 2 m panel it falls in. */
export const along = (side, x, z) => (side === 'e' || side === 'w' ? z : x);
export const panelOf = (side, x, z) => Math.floor((along(side, x, z) + HALF) / 2);

/**
 * The footpath of each side as runs of points every 1.5 m (a run ends where a building, street, plaza, stair, doorstep or a prop takes the ground, and a run of fewer than five points is dropped),
 * the stone treads on its climbs (a stretch of three points or more steeper than 0.2: a tread every 0.9 m), the vines on the wall's face (every 5 to 9 m, one spot in two) and the weeds along its foot.
 * `ok(x, z)` is the occupancy test (true = a person may walk and a plant may stand there); `ground(x, z)` the height; `gate` = { x, half } keeps the entry road's stretch of the south wall clear.
 */
export function planRimWalk(plan, ok, ground, gate = null) {
  const seed = plan.seed, key = (...a) => `${seed}:rim:${a.join(':')}`, out = { paths: [], steps: [], climbers: [], weeds: [] };
  const atGate = (side, x, pad) => side === 's' && gate && Math.abs(x - gate.x) < gate.half + pad;
  for (const side of Object.keys(SIDE)) {
    const S = SIDE[side], phase = rnd(key('phase', side)) * 6.28;
    let run = [];
    const close = () => { if (run.length >= 5) out.paths.push({ side, pts: run }); run = []; };
    for (let s = -HALF + 7; s <= HALF - 7; s += RIM.step) {
      const d = RIM.inset + RIM.wander * Math.sin(s * 0.13 + phase) + RIM.noise * vnoise(s, side.charCodeAt(0), 11, seed + 331), [x, z] = S.at(s, d);
      if (atGate(side, x, 10) || !ok(x, z)) { close(); continue; }
      run.push([x, z]);
    }
    close();
    for (let s = -HALF + 9, k = 0; s < HALF - 9; s += 5 + rnd(key('vs', side, k++)) * 4) {
      if (rnd(key('vine', side, k)) > 0.5) continue;
      const [fx, fz] = S.at(s, 0.28), [px, pz] = S.at(s, 1.0);
      if (atGate(side, fx, 6) || !ok(px, pz)) continue;
      out.climbers.push({ side, x: fx, z: fz, nx: S.n[0], nz: S.n[1], w: 1.5 + rnd(key('vw', side, k)) * 1.0, h: 2.0 + rnd(key('vh', side, k)) * 1.2, y: ground(fx, fz) });
    }
    for (let s = -HALF + 4, k = 0; s < HALF - 4; s += 1.1 + rnd(key('ws', side, k++)) * 0.5) {
      if (rnd(key('wp', side, k)) > 0.72) continue;
      const [x, z] = S.at(s, 0.42 + 0.35 * rnd(key('wd', side, k)));
      if (atGate(side, x, 6) || !ok(x, z)) continue;
      out.weeds.push({ side, x, z, big: 1.1 + 0.7 * rnd(key('wb', side, k)) });
    }
  }
  for (const p of out.paths) {
    const g = p.pts.map((q, i) => (i ? Math.abs(ground(q[0], q[1]) - ground(p.pts[i - 1][0], p.pts[i - 1][1])) / RIM.step : 0));
    for (let i = 1; i < p.pts.length; ) {
      if (g[i] <= 0.2) { i++; continue; }
      let j = i; while (j < p.pts.length && g[j] > 0.2) j++;
      if (j - i >= 3) {
        const a = p.pts[i - 1], c = p.pts[j - 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]), ry = Math.atan2(c[0] - a[0], c[1] - a[1]);
        for (let t = 0.45; t < len; t += 0.9) out.steps.push({ side: p.side, x: a[0] + ((c[0] - a[0]) * t) / len, z: a[1] + ((c[1] - a[1]) * t) / len, ry, w: RIM.width + 0.3 });
      }
      i = j;
    }
  }
  return out;
}

/** What goes on a crest panel (a 2 m piece of the wall's top, `u` in [0, 1) from a hash): rebar, a stretch of chain-link, rubble, or nothing. Pure: the node tests count it. */
export function crestKind(u) { return u < 0.1 ? 'rebar' : u < 0.19 ? 'mesh' : u < 0.27 ? 'rubble' : null; }

/** The path as a lookup: near(x, z, r) is true when (x, z) lies within r of the path's centre line plus its half width. */
export function pathLookup(paths) {
  const C = 4, cells = new Map(), hk = (i, j) => i * 4096 + j;
  for (const p of paths) for (let k = 1; k < p.pts.length; k++) {
    const a = p.pts[k - 1], b = p.pts[k];
    for (let i = Math.floor((Math.min(a[0], b[0]) - 3) / C); i <= Math.floor((Math.max(a[0], b[0]) + 3) / C); i++) for (let j = Math.floor((Math.min(a[1], b[1]) - 3) / C); j <= Math.floor((Math.max(a[1], b[1]) + 3) / C); j++) {
      const id = hk(i, j); let l = cells.get(id); if (!l) cells.set(id, l = []); l.push([a, b]);
    }
  }
  return (x, z, r = 0) => (cells.get(hk(Math.floor(x / C), Math.floor(z / C))) ?? []).some(([a, b]) => segDist(x, z, a, b) <= r + RIM.width / 2 + 0.2);
}

const iron = [0.62, 0.36, 0.2], block = [0.6, 0.58, 0.54], brick = [0.62, 0.3, 0.22], wire = [0.2, 0.2, 0.22];
const OFF = [-0.8, -0.5, 0, 0.5, 0.8], DY = [0.03, 0.05, 0.055, 0.05, 0.03];
const TONE = [[0.42, 0.4, 0.3], [0.7, 0.62, 0.48], [0.82, 0.72, 0.56], [0.7, 0.62, 0.48], [0.42, 0.4, 0.3]];

/** One run of path as a strip five points wide, every corner at the ground's own height (a flat ribbon sank into a cross slope): dark worn earth at the edges, pale in the middle. */
function lane(b, pts, ground) {
  const T = tangents(pts), S = arcs(pts);
  const P = (k, j) => { const x = pts[k][0] - T[k][1] * OFF[j], z = pts[k][1] + T[k][0] * OFF[j]; return [x, ground(x, z) + DY[j], z]; };
  for (let k = 0; k + 1 < pts.length; k++) {
    for (let j = 0; j < 4; j++) {
      b.quad('dirt_path', P(k, j), P(k, j + 1), P(k + 1, j + 1), P(k + 1, j), { uv: [OFF[j], S[k], OFF[j + 1], S[k], OFF[j + 1], S[k + 1], OFF[j], S[k + 1]], cols: [TONE[j], TONE[j + 1], TONE[j + 1], TONE[j]] });
    }
  }
}

export function buildRimWalk(K) {
  const { ctx, plan, occ, H } = K, seed = plan.seed, key = (...a) => `${seed}:rimtop:${a.join(':')}`, R = K.rng('rimwalk');
  const gate = ctx.world?.gate ?? null, ok = (x, z) => occ.clear(x, z, 0.6, RIM.mask) && !occ.overlaps(x, z, 0.45) && occ.slope(x, z) < 0.45;
  const P = planRimWalk(plan, ok, H, gate), stats = { paths: P.paths.length, pathM: 0, steps: P.steps.length, climbers: P.climbers.length, weeds: 0, rebar: 0, mesh: 0, rubble: 0, heaps: 0, drapes: 0 };
  K.rimNear = pathLookup(P.paths);
  const walked = new Set();
  // the footpath, and the ground it takes: nothing is parked, planted or stood on it afterwards
  for (const p of P.paths) {
    stats.pathM += (p.pts.length - 1) * RIM.step;
    for (let i = 0; i + 1 < p.pts.length; i += 24) {
      const run = p.pts.slice(i, i + 25), m = run[run.length >> 1];
      if (run.length > 1) lane(K.b('rim', m[0], m[1], { cast: false }), run, H);
    }
    for (const q of p.pts) { occ.take(q[0], q[1], RIM.disc); walked.add(`${p.side}:${panelOf(p.side, q[0], q[1])}`); }
  }
  for (const s of P.steps) {
    const b = K.b('rim', s.x, s.z, { cast: false });
    b.box('concrete_bare', s.x, H(s.x, s.z) + 0.04, s.z, s.w, 0.16, 0.46, { ry: s.ry, col: [0.72, 0.7, 0.66], skip: ['ny'] });
  }
  // weeds along the foot of the wall, taller than the grass of the open ground
  const wr = R.fork('weeds');
  for (const w of P.weeds) { tuft(K, w.x, w.z, wr, w.big); stats.weeds++; }
  // vines on the face, from the ground up
  const uv = K.atlas ? K.atlas.uv(TILE.VINE) : [0, 0, 1, 1];
  P.climbers.forEach((c, i) => {
    const b = K.b('floralow', c.x, c.z, { cast: false }), g = 0.78 + 0.22 * rnd(key('vg', i));
    card(b, 'foliage_low', [c.x + c.nx * 0.05, c.y - 0.1, c.z + c.nz * 0.05], [-c.nz, 0, c.nx], [0, 1, 0], c.w, c.h, uv, [0.7 * g, 0.95 * g, 0.6 * g], V.nrm([c.nx, 0.35, c.nz]));
  });
  // the crest: only where the boundary reported its panels (periphery.js: ctx.world.crests)
  // `crests` is what the boundary left of the tops: A2's edge walls (edgewall.js) take the panels they raise out of it, so this dressing goes on the plain panels only, as the bougainvillea does. It is ONE builder
  // (props.rimtop, a mesh a material for the whole rim, like A2's dressing): its draw calls then do not depend on which panels are plain, and a test that compares the world with and without the edge walls can say so.
  const crests = ctx.world?.crests ?? {}, topB = K.one('rimtop', { cast: false });
  for (const [side, runs] of Object.entries(crests)) {
    runs.forEach((run, ri) => {
      let fence = 0;
      run.forEach((c, i) => {
        const tx = -c.nz, tz = c.nx, x = c.x - c.nx * 0.2, z = c.z - c.nz * 0.2, top = c.y + 0.1, b = topB;       // c is on the inside edge of the panel; the panel's own axis is 0.2 m out
        const kind = fence > 0 ? 'mesh' : crestKind(rnd(key(side, ri, i)));
        if (fence > 0) fence--; else if (kind === 'mesh') fence = 2;
        if (kind === 'rebar') {
          for (const o of [-0.6, -0.3, 0, 0.3, 0.6]) { const hgt = 0.45 + 0.65 * rnd(key('rb', side, ri, i, o)); b.box('rusty_iron', x + tx * o, top + hgt / 2, z + tz * o, 0.045, hgt, 0.045, { col: iron }); }
          b.box('concrete_bare', x, top + 0.06, z, 0.28, 0.12, 0.28, { col: block });
          stats.rebar++;
        } else if (kind === 'mesh') {
          const x1 = x - tx, z1 = z - tz, x2 = x + tx, z2 = z + tz, fh = 0.9, l = 2;
          b.quad('fence_mesh', [x1, top, z1], [x2, top, z2], [x2, top + fh, z2], [x1, top + fh, z1], { uv: [0, 0, l / 0.4, 0, l / 0.4, fh / 0.4, 0, fh / 0.4], col: [1, 1, 1] });
          for (const e of [-1, 1]) b.box('iron_black', x + tx * e, top + fh / 2, z + tz * e, 0.06, fh, 0.06, { col: wire });
          b.box('iron_black', x, top + fh, z, Math.abs(tx) > 0.5 ? 2.0 : 0.05, 0.05, Math.abs(tz) > 0.5 ? 2.0 : 0.05, { col: wire });
          stats.mesh++;
        } else if (kind === 'rubble') {
          for (let k = 0; k < 4; k++) {
            const o = (rnd(key('ru', side, ri, i, k)) - 0.5) * 1.6, q = (rnd(key('rn', side, ri, i, k)) - 0.5) * 0.15, sz = 0.16 + 0.2 * rnd(key('rs', side, ri, i, k));
            b.box(k % 2 ? 'brick_red_solid' : 'concrete_bare', x + tx * o + c.nx * q, top + sz / 2, z + tz * o + c.nz * q, sz * 1.5, sz, sz, { ry: rnd(key('ry', side, ri, i, k)) * 3, col: k % 2 ? brick : block });
          }
          stats.rubble++;
        }
        // and a heap of the blocks that came down, at the foot where nobody walks
        if (rnd(key('heap', side, ri, i)) < 0.09 && ![-1, 0, 1].some((k) => walked.has(`${side}:${panelOf(side, c.x, c.z) + k}`))) {
          const hx = x + c.nx * 0.7, hz = z + c.nz * 0.7, gy = H(hx, hz);
          for (let k = 0; k < 5; k++) {
            const sz = 0.2 + 0.22 * rnd(key('hs', side, ri, i, k)), ox = (rnd(key('hx', side, ri, i, k)) - 0.5) * 1.2, oz = (rnd(key('hz', side, ri, i, k)) - 0.5) * 0.5;
            b.box(k % 3 === 0 ? 'brick_red_solid' : 'concrete_bare', hx + tx * ox + c.nx * oz, gy + sz * 0.4 + (k > 2 ? 0.2 : 0), hz + tz * ox + c.nz * oz, sz * 1.4, sz, sz, { ry: rnd(key('hy', side, ri, i, k)) * 3, col: k % 3 === 0 ? brick : block });
          }
          stats.heaps++;
        }
      });
      drape(K, run.map((c) => ({ ...c, y: c.y - 0.1 })), R.fork(`vine${side}${ri}`), { tile: TILE.VINE, step: 3.4, hang: 1.2 });                                                // a green creeper over the crest, between the bougainvillea
      stats.drapes++;
    });
  }
  if (ctx.world) ctx.world.rimwalk = { ...stats, plan: P };
  return stats;
}
