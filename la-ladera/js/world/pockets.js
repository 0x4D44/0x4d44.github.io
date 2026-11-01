// POCKETS (A5, round 5, R1-D23): "a sand-faced wedge mound with a grass top between houses at the street edge; the same artefact at (-35, -25)" (round 2 D10, unchanged).
// A pocket is a gap in a street's frontage, as deep as a small garden, where the ground climbs behind the pavement: no house stands there, the earth is too steep for the flora (its
// scatter and its tufts keep off steep and bare ground) and so what is left is the terrain's bare dirt texture on a wedge of slope. The plan makes thirteen of them. Each now carries what
// such a plot carries when nobody builds on it: a border of flowers at the foot, tall grass, bushes and agaves, boulders half sunk in the slope, and a small tree against the back. The
// ground itself (plan.heightAt, the colliders, the walking routes) is untouched: this is planting. Pure planning first (planPockets: a function of the plan and the occupancy grid, which the
// node tests walk), then the planting, after the flora (so it fills what the trees left) and before the planters and the life.
import { OCC } from './occupancy.js';
import { TILE } from './sprites.js';
import { tuft, shrub, agave, broadTree } from './flora.js';
import { rock } from './hill.js';
import { card } from './mk.js';

export const POCKET = Object.freeze({
  near: 1.2, far: 7, rise: 0.9, minLen: 5,                              // the garden's depth behind the pavement edge: 1.2 to 7 m; it must climb 0.9 m over that; and be 5 m of frontage at least
  mask: OCC.ROAD | OCC.STAIR | OCC.PLAZA | OCC.LOT,                    // what the frontage must be clear of for the whole depth
  keep: OCC.ROAD | OCC.STAIR | OCC.PLAZA | OCC.LOT | OCC.NAV | OCC.DOOR, // what a plant keeps clear of (steep ground is exactly what these are for)
});
const scale = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

/**
 * Every pocket of the plan as { street, side, x, z (the middle, 4 m behind the pavement), nx, nz (away from the street), len (frontage, m), rise (m over the garden's depth), hw (the street's half width) }.
 * A street sample (every metre of its centre line, each side) belongs to a pocket when five points 1.2 to 7 m behind the pavement are all clear of street, stairs, plaza and building and the
 * ground there climbs `rise` or more; a run of five samples or more is one pocket.
 */
export function planPockets(plan, occ) {
  const H = plan.heightAt, out = [];
  for (const st of plan.streets) {
    if (st.kind === 'stair') continue;
    const hw = st.width / 2, pts = st._d.pts;
    for (const side of [-1, 1]) {
      let run = null;
      const flush = () => { if (run && run.n >= POCKET.minLen) out.push({ street: st.id, side, x: run.x / run.n, z: run.z / run.n, nx: run.nx, nz: run.nz, len: run.n, rise: run.rise / run.n, hw }); run = null; };
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-6) continue;
        const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L, nx = -tz * side, nz = tx * side;
        for (let s = 0; s < L; s += 1) {
          const cx = a[0] + tx * s, cz = a[1] + tz * s, at = (o) => [cx + nx * (hw + o), cz + nz * (hw + o)];
          let open = true;
          for (const o of [1.2, 2.5, 4, 5.5, 7]) { const [x, z] = at(o); if (Math.abs(x) > 97 || Math.abs(z) > 97 || !occ.clear(x, z, 0.65, POCKET.mask)) { open = false; break; } }
          const [x0, z0] = at(POCKET.near), [x1, z1] = at(POCKET.far), rise = H(x1, z1) - H(x0, z0);
          if (open && rise >= POCKET.rise) {
            if (!run) run = { n: 0, x: 0, z: 0, rise: 0, nx, nz };
            const [mx, mz] = at(4); run.n++; run.x += mx; run.z += mz; run.rise += rise;
          } else flush();
        }
      }
      flush();
    }
  }
  return out;
}

export function buildPockets(K) {
  const { ctx, occ, H } = K, R = K.rng('pockets'), P = planPockets(K.plan, occ), view = ctx.world?.view;
  const stats = { pockets: P.length, tufts: 0, shrubs: 0, agaves: 0, rocks: 0, flowers: 0, trees: 0, spots: [], placed: [] };      // placed: [kind, x, z, pocket] for every plant, rock and tree
  const inView = (x, z) => {                                          // the mirador's fan keeps only plants lower than a person's eye (as flora.js)
    if (!view) return false;
    const vx = x - view.x, vz = z - view.z, d = vx * view.dx + vz * view.dz;
    return d > -3 && d < view.reach && Math.abs(vx * view.dz - vz * view.dx) < view.apex + Math.max(0, d) * Math.tan(view.half);
  };
  const uvF = K.atlas ? K.atlas.uv(TILE.FLOWERS) : [0, 0, 1, 1];
  P.forEach((p, i) => {
    const r = R.fork('p' + i), tx = -p.nz, tz = p.nx, at = (u, v) => [p.x + tx * u + p.nx * v, p.z + tz * u + p.nz * v];
    const free = (x, z, rad) => occ.clear(x, z, rad * 0.6, POCKET.keep) && !occ.overlaps(x, z, rad);
    stats.spots.push([+p.x.toFixed(1), +p.z.toFixed(1)]);
    const put = (kind, x, z) => { stats[kind]++; stats.placed.push([kind, x, z, i]); };
    for (let t = 0; t < 12 && !inView(p.x, p.z); t++) {                   // first, one small tree against the back of the plot (not in the mirador's view): the rest is planted round it
      const [x, z] = at(r.range(-p.len / 2 + 0.8, p.len / 2 - 0.8), r.range(0.8, 2.6));
      if (!free(x, z, 1.4) || inView(x, z)) continue;
      broadTree(K, x, z, { rng: r.fork('tree'), h: r.range(2.9, 4.1), crown: r.range(1.35, 1.85), cards: 18 });    // a garden tree, a lemon or a fig: its crown stays under the street's eye line, so the far hillside's lights show over it
      put('trees', x, z);
      break;
    }
    let n = 0;
    for (let v = -3.3; v <= 2.8; v += 0.9) {
      for (let u = -p.len / 2 - 0.6; u <= p.len / 2 + 0.6; u += 0.9) {
        const [x, z] = at(u + r.range(-0.3, 0.3), v + r.range(-0.3, 0.3)), k = r.next();
        n++;
        if (!occ.clear(x, z, 0.3, POCKET.keep)) continue;
        if (v < -1.5 && k < 0.5) {                                        // a border of flowers at the foot of the bank, against the pavement
          if (occ.overlaps(x, z, 0.35)) continue;
          const b = K.b('floralow', x, z, { cast: false }), tint = r.pick([[1, 1, 1], [1, 0.82, 0.95], [1, 0.95, 0.6], [0.8, 0.85, 1]]);
          for (let q = 0; q < 3; q++) {
            const px = x + r.range(-0.5, 0.5), pz = z + r.range(-0.5, 0.5), yaw = r.range(0, 3.14), s = r.range(0.5, 0.85);
            card(b, 'foliage_low', [px, H(px, pz) - 0.03 - s * 0.17, pz], [Math.cos(yaw), 0, -Math.sin(yaw)], [0, 1, 0], s, s * 0.85, uvF, scale(tint, r.range(0.85, 1.05)), [0, 1, 0]);
          }
          put('flowers', x, z);
        } else if (k < 0.58) { tuft(K, x, z, r, 1.2 + r.next() * 0.7); put('tufts', x, z); }
        else if (k < 0.76) { if (free(x, z, 0.8)) { shrub(K, x, z, { rng: r.fork('s' + n), size: r.range(0.9, 1.5), flowers: r.chance(0.55) }); occ.take(x, z, 0.5); put('shrubs', x, z); } }
        else if (k < 0.85) { if (free(x, z, 1.0)) { agave(K, x, z, { rng: r.fork('a' + n) }); occ.take(x, z, 0.7); put('agaves', x, z); } }
        else if (k < 0.93) { const rad = r.range(0.3, 0.6); if (free(x, z, rad + 0.3)) { rock(K, x, z, rad, r.fork('k' + n), r.range(0.9, 1.1)); occ.take(x, z, rad); put('rocks', x, z); } }
        else { tuft(K, x, z, r, 1.0); put('tufts', x, z); }
      }
    }
  });
  if (ctx.world) ctx.world.pockets = stats;
  return stats;
}
