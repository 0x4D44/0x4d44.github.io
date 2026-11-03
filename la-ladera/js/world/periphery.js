// PERIPHERY (A5): the land around the 200 x 200 m plot and the plot's own rim.
//   makeFarHeight(plan)   the ground outside the plot (mountain wall behind, side ridges, and in front the BAY: the beach, the sea and the headlands that frame it, coast.js;
//                         the road that leaves at the foot of S1 and runs along the promenade to the east flank), continuous with plan.heightAt at the edge. Pure data: runs under node.
//   buildFarTerrain(ctx)  group world.terrain.far, ONE mesh per material (grass, sand, seabed, rock): 100 m tiles at 5 m up to +-300 m and 150 m tiles at 15 m up to +-750 m;
//                         the strip in front of the plot (coastmesh.js draws it) and the tiles far under the sea are left out
//   buildBoundary(K)      the visible perimeter: block / brick / stone walls and zinc fences, pilasters, a welcome arch with a lowered barrier
//                         at the end of the entry road, the road leaving the plot. The physics walls (terrain.js buildPerimeter) stay 0.35 m inside. The south wall is gone
//                         (the promenade is the plot's south edge): two returns at the corners and the arch stay.
import { ss, vnoise, lerp, project, resample, pointAt } from './geom.js';
import { HALF } from './field.js';
import { tangents, arcs } from './mk.js';
import { panel, PAPERS, TAGS } from './signs.js';
import { drape } from './flora.js';
import { dressEdge } from './edgewall.js';
import { SEA, Z0 as COAST_Z0, BAY_X } from './coast.js';
import { sandTone, bedTone } from './coastmesh.js';

// Both the mesh builder and placement sampler use these exact cell grids.
const FAR_TERRAIN_GRIDS = Object.freeze([
  { name: 'far', inner: HALF, outer: 300, tile: 100, cells: 20 },
  { name: 'farB', inner: 300, outer: 750, tile: 150, cells: 10 },
]);

// ---------------------------------------------------------------------------------------------------- the road that leaves the plot
function catmull(ctrl, per = 8) {
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], out = [];
  for (let i = 1; i + 2 < P.length; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1].slice());
  return out;
}

const LANE_Z = 102;                    // the road's lane along the promenade's back edge (coast.js: the deck lies z 100 to 108)
const LANE_HALF = 2.1;                 // half its width on the promenade; on the flank it is 3.2 (buildBoundary)

function roadPath(plan) {
  const s1 = plan.streets.find((s) => s.id === 'S1'), pts = s1?._d?.pts ?? [[46, 100], [46, 90]];
  const a = pts[0], b = pts[pts.length - 1], st = a[1] > b[1] ? a : b, x0 = st[0], z0 = Math.min(st[1], HALF);
  // out of the arch, onto the promenade, east along its back edge (a shared lane), out at the plot's east side and up the east flank (the valley it used to cross is the bay now)
  const ctrl = [[x0, z0], [x0, z0 + 1.5], [x0 + 3.5, LANE_Z], [x0 + 12, LANE_Z], [74, LANE_Z], [97, LANE_Z], [113, LANE_Z - 3], [140, LANE_Z - 18], [172, LANE_Z - 46], [208, LANE_Z - 86],
    [244, LANE_Z - 132], [280, LANE_Z - 184], [316, LANE_Z - 240], [350, LANE_Z - 300]];
  const { pts: p, cum } = resample(catmull(ctrl), 4);
  return { pts: p, cum, x0, z0 };
}

// ---------------------------------------------------------------------------------------------------- relief
/** How built-up the land outside the plot is, 0..1 (the vista puts houses there, the far terrain turns dusty under them, the far lights follow). The valley city of the south is gone (the bay is there):
 * what is left is the flanks (kept 28 to 60 m back from the waterline), the north and the headland village on the west horn of the bay. */
export function urbanDensity(plan, x, z) {
  const ax = Math.abs(x), d = Math.max(ax - HALF, Math.abs(z) - HALF);
  if (d < 7) return 0;
  const seed = plan.seed, C = plan.coast, inland = C ? C.shoreZ(x) - z : 1e3;
  const flank = ss(HALF + 5, HALF + 30, ax) * (1 - ss(250, 330, ax)) * ss(-250, -110, z) * ss(28, 60, inland) * 0.85;
  const north = ss(-HALF - 8, -HALF - 40, z) * (1 - ss(-170, -240, z)) * 0.42 * (1 - ss(120, 190, ax));
  const village = C && x < 0 ? 0.95 * ss(5, 11, C.headland(x, z)) : 0;                                                // the west headland: its crown and shoulders, 5 to 11 m above the sea floor of the foot (the dry rule of the houses keeps the rest off the water)
  const patch = 0.5 + 0.5 * vnoise(x, z, 55, seed + 61);
  return Math.max(0, Math.min(1, (flank + north + village) * (0.3 + 0.8 * patch) - 0.08));
}

export function makeFarHeight(plan) {
  const Hin = plan._inner ?? plan.heightAt, C = plan.coast, seed = plan.seed, road = roadPath(plan);
  /** The old far land (mountain wall behind, side ridges, roll), without its valley and the hillside across it: south of the plot's edge the coast takes the place of both, and the roll calms down towards the sea. */
  const land = (x, z) => {
    const ax = Math.abs(x), d = Math.max(ax - HALF, Math.abs(z) - HALF), base = Hin(x, z), w = ss(0, 70, d);
    const rid = 1 - Math.min(1, Math.abs(vnoise(x + 70, z, 120, seed + 41)) * 1.5);
    const mountain = 94 * ss(-100, -340, z) * (0.5 + 0.5 * rid) * (0.72 + 0.28 * vnoise(x, z, 200, seed + 43));
    const flank = 48 * ss(HALF, 320, ax) * (0.45 + 0.55 * ss(150, -150, z)) * (0.62 + 0.38 * vnoise(x, z, 150, seed + 45));
    const roll = (vnoise(x, z, 75, seed + 47) * 5.5 + vnoise(x, z, 31, seed + 49) * 1.8) * (1 - 0.85 * ss(COAST_Z0, COAST_Z0 + 25, z));
    return base + w * (mountain + flank + roll);
  };
  const raw = (x, z) => {
    const d = Math.max(Math.abs(x) - HALF, Math.abs(z) - HALF);
    if (d <= 0) return plan.heightAt(x, z);
    return z > COAST_Z0 && C ? C.ground(x, z, land) : land(x, z);
  };
  // the road's own profile: the terrain along it, smoothed, starting exactly at the height of the street's end. On the promenade it IS the ground (the deck is flat: no smoothing), and it
  // takes the smoothed profile of the flank over the 28 m outside the plot's east edge
  const n = road.pts.length, ys = road.pts.map((p) => raw(p[0], p[1])), sm = ys.map((_, k) => { let s = 0, c = 0; for (let j = Math.max(0, k - 8); j <= Math.min(n - 1, k + 8); j++) { s += ys[j]; c++; } return s / c; });
  const y0 = Hin(road.x0, road.z0);
  const prof = sm.map((v, k) => lerp(lerp(y0, v, ss(0, 56, road.cum[k])), ys[k], 1 - ss(BAY_X - 4, BAY_X + 24, road.pts[k][0])));
  const roadY = (s) => { const q = pointAt(road.pts, road.cum, s), i = Math.min(n - 1, q.i), u = (s - road.cum[i - 1]) / (road.cum[i] - road.cum[i - 1] || 1); return lerp(prof[i - 1], prof[i], Math.max(0, Math.min(1, u))); };
  const bx0 = Math.min(...road.pts.map((p) => p[0])) - 16, bx1 = Math.max(...road.pts.map((p) => p[0])) + 16, bz0 = Math.min(...road.pts.map((p) => p[1])) - 16, bz1 = Math.max(...road.pts.map((p) => p[1])) + 16;
  const far = (x, z) => {
    let h = raw(x, z);
    const k = ss(BAY_X, BAY_X + 12, Math.abs(x));          // the strip in front of the plot is the coast's: the road lies on its deck, and the ground is not cut for it there
    if (k > 0 && x > bx0 && x < bx1 && z > bz0 && z < bz1) {
      const p = project(road.pts, road.cum, x, z);
      if (p.d < 15 && p.s > 1) h = lerp(h, lerp(h, roadY(p.s) - 0.07, k), 1 - ss(6, 15, p.d));
    }
    return h;
  };
  far.road = { ...road, roadY, prof };
  return far;
}

/** The rendered, piecewise-linear ground, including its Float32 vertex heights.
 * `minimum(corners)` clips a convex footprint against the actual terrain triangles:
 * it includes interior grid vertices and every perimeter/triangle intersection.
 * At a ring seam it considers both meshes, rather than assuming their edges agree.
 */
export function makeFarTerrainSampler(plan, far = plan._far ?? makeFarHeight(plan)) {
  const heights = new Map();
  const vertex = (x, z) => {
    const key = `${x}:${z}`;
    if (!heights.has(key)) heights.set(key, Math.fround(far(x, z)));
    return heights.get(key);
  };
  const inCell = (x, z, x0, z0, step) => {
    const u = (x - x0) / step, v = (z - z0) / step;
    // buildFarTerrain's a,c,d / a,d,e2 diagonal, not bilinear interpolation.
    return v >= u
      ? (1 - v) * vertex(x0, z0) + (v - u) * vertex(x0, z0 + step) + u * vertex(x0 + step, z0 + step)
      : (1 - u) * vertex(x0, z0) + v * vertex(x0 + step, z0 + step) + (u - v) * vertex(x0 + step, z0);
  };
  const sample = (x, z) => {
    const d = Math.max(Math.abs(x), Math.abs(z));
    const g = FAR_TERRAIN_GRIDS.find((q) => d >= q.inner && d <= q.outer);
    if (!g) return NaN; // the playable plot and land outside the far mesh are not this surface
    const step = g.tile / g.cells;
    let x0 = Math.min(g.outer - step, Math.floor(x / step) * step), z0 = Math.min(g.outer - step, Math.floor(z / step) * step);
    if (x0 >= -g.inner && x0 < g.inner && z0 >= -g.inner && z0 < g.inner) {
      if (x === -g.inner) x0 -= step;
      else if (z === -g.inner) z0 -= step;
    }
    return inCell(x, z, x0, z0, step);
  };
  const clip = (polygon, triangle) => {
    let out = polygon;
    for (let i = 0; i < 3 && out.length; i++) {
      const a = triangle[i], b = triangle[(i + 1) % 3];
      const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const input = out; out = [];
      let previous = input[input.length - 1], pd = side(previous);
      for (const p of input) {
        const d = side(p), inside = d <= 1e-9, previousInside = pd <= 1e-9;
        if (inside !== previousInside) {
          const t = pd / (pd - d);
          out.push([previous[0] + t * (p[0] - previous[0]), previous[1] + t * (p[1] - previous[1])]);
        }
        if (inside) out.push(p);
        previous = p; pd = d;
      }
    }
    return out;
  };
  sample.minimum = (corners) => {
    const xs = corners.map((p) => p[0]), zs = corners.map((p) => p[1]);
    let minimum = Infinity;
    for (const g of FAR_TERRAIN_GRIDS) {
      const step = g.tile / g.cells, n = g.outer / step, inner = g.inner / step;
      const i0 = Math.max(-n, Math.ceil(Math.min(...xs) / step) - 1), i1 = Math.min(n - 1, Math.floor(Math.max(...xs) / step));
      const j0 = Math.max(-n, Math.ceil(Math.min(...zs) / step) - 1), j1 = Math.min(n - 1, Math.floor(Math.max(...zs) / step));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (i >= -inner && i < inner && j >= -inner && j < inner) continue;
        const x = i * step, z = j * step, a = [x, z], c = [x, z + step], d = [x + step, z + step], e = [x + step, z];
        for (const triangle of [[a, c, d], [a, d, e]]) for (const p of clip(corners, triangle)) {
          minimum = Math.min(minimum, inCell(p[0], p[1], x, z, step));
        }
      }
    }
    return minimum;
  };
  return sample;
}

// ---------------------------------------------------------------------------------------------------- far terrain
export function buildFarTerrain(ctx, plan, GRASS = 'grass_patchy') {
  const far = plan._far ?? (plan._far = makeFarHeight(plan)), seed = plan.seed;
  const colour = (x, z, h) => {
    const n = vnoise(x, z, 37, seed + 5), m = vnoise(x, z, 9, seed + 7), ax = Math.abs(x);
    let r = 0.86 + 0.08 * n, g = 0.9 + 0.05 * n, b = 0.74 + 0.05 * n;
    const forest = ss(-120, -280, z) * 0.7 + ss(130, 260, ax) * 0.35;
    r = lerp(r, 0.5, forest); g = lerp(g, 0.68, forest); b = lerp(b, 0.5, forest);
    const u = urbanDensity(plan, x, z) * 0.8;
    r = lerp(r, 0.86, u); g = lerp(g, 0.78, u); b = lerp(b, 0.64, u);
    const dry = ss(40, 90, h) * 0.45;
    r = lerp(r, 0.93, dry); g = lerp(g, 0.87, dry); b = lerp(b, 0.62, dry);
    const k = 1 + 0.07 * m;
    return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
  };
  // ONE mesh for the whole far land (about 48 k vertices, 42 k triangles, no shadows): as 116 tiles of 100-150 m each was a draw call (the merge pass leaves
  // anything wider than its 96 m span alone), 54 of them in the spawn view, for a few triangles each. One mesh PER MATERIAL since the bay: grass inland, sand along the waterline,
  // the seabed under water and rock where a headland falls steeply into it (a handful of calls, and the strip in front of the plot and the deep sea are left out, below)
  const b = ctx.batch.builder('world.terrain.far', { cast: false }), acc = b._acc(GRASS), C = plan.coast;
  const rockTone = (x, z) => { const k = 1 + 0.12 * vnoise(x, z, 14, seed + 81); return [0.66 * k, 0.63 * k, 0.58 * k]; };
  /** What a cell of the far land is made of (heights are the four corners'): grass inland, sand along the waterline (a wavy dune line), seabed under water, rock where the ground is steep by the sea. */
  const pick = (x, z, hm, slope) => {
    if (!C || z < COAST_Z0) return GRASS;
    const inl = C.shoreZ(x) - z, hd = C.headland(x, z);
    if (hm < SEA - 0.04) return hd > 1.5 ? 'seabed_rock' : 'seabed_sand';
    if (slope > 0.5 && (hd > 3 || inl < 60)) return 'rock_sea';
    return inl < 28 + 10 * vnoise(x, z, 17, seed + 91) ? 'sand_dry' : GRASS;
  };
  const tint = (mat, x, z, h) => (mat === 'sand_dry' ? sandTone(h, x, z, seed) : mat === 'seabed_sand' || mat === 'seabed_rock' ? bedTone(h, x, z, seed) : mat === 'rock_sea' ? rockTone(x, z) : colour(x, z, h));
  const tile = (x0, z0, size, cells) => {
    const step = size / cells, n1 = cells + 1, ix = (i, j) => j * n1 + i, hs = new Float32Array(n1 * n1);
    let top = -Infinity;
    for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) { const h = far(x0 + i * step, z0 + j * step); hs[ix(i, j)] = h; if (h > top) top = h; }
    if (C && (top < SEA - 6 || (x0 >= -BAY_X && x0 + size <= BAY_X && z0 >= COAST_Z0 && z0 + size <= 300))) return;     // far under the sea (it hides the ground), or the strip coastmesh.js draws
    const maps = new Map();
    const vtx = (mat, i, j) => {
      let m = maps.get(mat); if (!m) maps.set(mat, m = new Int32Array(n1 * n1).fill(-1));
      const k = ix(i, j); if (m[k] >= 0) return m[k];
      const x = x0 + i * step, z = z0 + j * step, e = Math.max(1.5, step * 0.6);
      const nx = -(far(x + e, z) - far(x - e, z)) / (2 * e), nz = -(far(x, z + e) - far(x, z - e)) / (2 * e), l = Math.hypot(nx, 1, nz), s = mat === GRASS ? 0.25 : 1;
      return (m[k] = b.vert(b._acc(mat), [x, hs[k], z], [nx / l, 1 / l, nz / l], x * s, z * s, tint(mat, x, z, hs[k])));
    };
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const h00 = hs[ix(i, j)], h01 = hs[ix(i, j + 1)], h11 = hs[ix(i + 1, j + 1)], h10 = hs[ix(i + 1, j)];
      const mat = pick(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step, (h00 + h01 + h11 + h10) / 4, Math.max(Math.abs(h00 - h11), Math.abs(h01 - h10), Math.abs(h00 - h01), Math.abs(h10 - h11)) / step), ac = b._acc(mat);
      const a = vtx(mat, i, j), c = vtx(mat, i, j + 1), d = vtx(mat, i + 1, j + 1), e2 = vtx(mat, i + 1, j);
      ac.idx.push(a, c, d, a, d, e2); b.tris += 2;
    }
    // skirts: a 4 m apron hanging off every border, so two tiles that disagree by a few cm (or a finer and a coarser one) never show the sky between them
    const skirt = (list, nrm) => {
      for (let k = 0; k + 1 < list.length; k++) {
        const [i0, j0] = list[k], [i1, j1] = list[k + 1], p0 = [x0 + i0 * step, hs[ix(i0, j0)], z0 + j0 * step], p1 = [x0 + i1 * step, hs[ix(i1, j1)], z0 + j1 * step];
        const q0 = b.vert(acc, p0, nrm, p0[0] * 0.25, p0[2] * 0.25, [0.5, 0.55, 0.42]), q1 = b.vert(acc, p1, nrm, p1[0] * 0.25, p1[2] * 0.25, [0.5, 0.55, 0.42]);
        const q2 = b.vert(acc, [p1[0], p1[1] - 4, p1[2]], nrm, p1[0] * 0.25, p1[2] * 0.25, [0.4, 0.45, 0.34]), q3 = b.vert(acc, [p0[0], p0[1] - 4, p0[2]], nrm, p0[0] * 0.25, p0[2] * 0.25, [0.4, 0.45, 0.34]);
        acc.idx.push(q0, q3, q2, q0, q2, q1, q0, q1, q2, q0, q2, q3);          // both windings: the apron is seen from either side
        b.tris += 4;
      }
    };
    const line = (f) => Array.from({ length: cells + 1 }, (_, k) => f(k));
    skirt(line((k) => [k, 0]), [0, 0, -1]); skirt(line((k) => [k, cells]), [0, 0, 1]); skirt(line((k) => [0, k]), [-1, 0, 0]); skirt(line((k) => [cells, k]), [1, 0, 0]);
  };
  // ring A: 100 m tiles, 5 m cells, +-300 m except the plot itself; ring B: 150 m tiles, 15 m cells, +-750 m except ring A
  // (FAR_TERRAIN_GRIDS: the same cell grids makeFarTerrainSampler reads, so the vista kit's foundations meet the triangles that are drawn)
  for (const g of FAR_TERRAIN_GRIDS) {
    const n = g.outer / g.tile, inner = g.inner / g.tile;
    for (let tj = -n; tj < n; tj++) for (let ti = -n; ti < n; ti++) {
      if (ti >= -inner && ti < inner && tj >= -inner && tj < inner) continue;
      tile(ti * g.tile, tj * g.tile, g.tile, g.cells);
    }
  }
  ctx.batch.flush('world.terrain.far');
}

// ---------------------------------------------------------------------------------------------------- boundary
const WALL_TINTS = ['d9c7a0', 'cfd8c4', 'e6c9b4', 'c9d3d8', 'e3d79a', 'd8b8a8'];

const IN = { s: [0, -1], n: [0, 1], e: [-1, 0], w: [1, 0] };            // the way the middle of the plot lies from each side of the wall: the normal of its inside face
const INSIDE_FACE = { s: 'nz', n: 'pz', e: 'nx', w: 'px' };            // which face of the panel's box that is
const FACE_IN = 0.2;                                                    // the inside face lies this far off a panel's axis (the wall is 0.4 m thick)
const SOUTH_RETURN = 4.5;                                               // the south wall (coast.js: the promenade replaces it) keeps this much at each corner, m
const wallMat = (kind, tint) => ({ block: `plaster_rough#${tint}`, brick: 'brick_red_solid', stone: 'stone_wall', zinc: 'corrugated_zinc' }[kind]);

/** One run of wall: kind decides material and height. Returns { yt: its top, c: its own tone }; adds boxes to builder b, all but the face on the plot's side (`inside`, drawn by insideFace). */
function wallPanel(b, kind, tint, cx, cz, sx, sz, g0, g1, g2, rnd, inside) {
  const lo = Math.min(g0, g1, g2), hi = Math.max(g0, g1, g2), h = { block: 2.4, brick: 2.2, stone: 1.9, zinc: 2.1 }[kind];
  const yb = lo - 0.4, yt = hi + h, c = rnd ? 0.94 + 0.1 * rnd : 1;
  b.box(wallMat(kind, tint), cx, (yb + yt) / 2, cz, sx, yt - yb, sz, { col: [c, c, c], skip: inside ? ['ny', inside] : ['ny'] });
  if (kind !== 'zinc') b.box('concrete_bare', cx, yt + 0.045, cz, sx + (sx > sz ? 0 : 0.14), 0.09, sz + (sx > sz ? 0.14 : 0), { skip: ['ny'] });
  return { yt, c };
}

/**
 * R1-D02: the face of a 2 m panel that looks into the plot, as a grid of quads whose corners are toned: a damp, dark foot that fades by a metre, blotches of dirt above (a plain
 * flat colour a panel, wall after wall, read as a blank screen). `p0` -> `p1` the panel's line on the wall's axis, `n` the inside normal, `c` the panel's own tone, yt its top, H the ground.
 */
function insideFace(b, mat, kind, c, p0, p1, n, yt, H, seed) {
  const COLS = 2, OFF = [-0.3, 0.35, 1.0], DAMP = [0.55, 0.68, 0.94, 1.0];
  const d = [(p1[0] - p0[0]) / 2, (p1[1] - p0[1]) / 2], fwd = d[0] * n[1] - d[1] * n[0] > 0;                    // does along-the-wall run to the viewer's right (right = (nz, -nx))
  const at = (j) => [p0[0] + (p1[0] - p0[0]) * (j / COLS) + n[0] * FACE_IN, p0[1] + (p1[1] - p0[1]) * (j / COLS) + n[1] * FACE_IN];
  const ys = (j) => { const [x, z] = at(j), g = H(x, z); return [g + OFF[0], g + OFF[1], g + OFF[2], yt]; };
  const tone = (j, i, y) => {
    const [x, z] = at(j), t = c * DAMP[i] * (1 + 0.08 * vnoise(x + z * 1.7, y, 1.7, seed));
    return kind === 'zinc' ? [t, t * 0.94, t * 0.88] : [t, t * 0.985, t * 0.955];                               // dirt is a little warm; rust on the zinc
  };
  for (let j = 0; j < COLS; j++) {
    const l = fwd ? j : j + 1, r = fwd ? j + 1 : j, L = at(l), Rt = at(r), yl = ys(l), yr = ys(r);               // the corners on the viewer's left and right
    for (let i = 0; i < 3; i++) {
      b.quad(mat, [L[0], yl[i], L[1]], [Rt[0], yr[i], Rt[1]], [Rt[0], yr[i + 1], Rt[1]], [L[0], yl[i + 1], L[1]], { cols: [tone(l, i, yl[i]), tone(r, i, yr[i]), tone(r, i + 1, yr[i + 1]), tone(l, i + 1, yl[i + 1])] });
    }
  }
}

export function buildBoundary(K) {
  const { ctx, plan, H } = K, R = K.rng('boundary'), far = plan._far ?? (plan._far = makeFarHeight(plan));
  const E = HALF - 0.45, T = 0.4, stats = { wallM: 0, gateM: 0, panels: 0, runs: { block: 0, brick: 0, stone: 0, zinc: 0 }, posters: 0, tags: 0, papers: [] };
  const gate = { x: far.road.x0, z: Math.min(HALF - 0.5, far.road.z0 - 0.5), half: 5.4 };
  const sides = [
    { id: 's', axis: 'x', at: E },        // z = +E (the entry road side)
    { id: 'n', axis: 'x', at: -E },
    { id: 'e', axis: 'z', at: E },
    { id: 'w', axis: 'z', at: -E },
  ];
  const kinds = ['block', 'block', 'brick', 'stone', 'zinc', 'block', 'brick'];
  const dress = ctx.batch.builder('props.boundary.dress', { cast: false }), D = K.rng('boundary.dress');             // what is pasted, sprayed and hung on the inside (its own random stream: the walls stay as they were)
  for (const sd of sides) {
    const b = ctx.batch.builder(`props.boundary.${sd.id}`), r = R.fork(sd.id), dr = D.fork(sd.id), n = IN[sd.id], crests = [[]];            // crests: the top of each unbroken run of wall (the gate breaks the south side in two)
    let kind = r.pick(kinds), tint = r.pick(WALL_TINTS), left = 0;
    for (let s = -HALF + 0.2; s < HALF - 0.2; s += 2) {
      const mid = s + 1, crest = crests.at(-1);
      if (sd.id === 's' && Math.abs(mid) < HALF - SOUTH_RETURN) { if (crest.length) crests.push([]); continue; }          // the south wall is gone: the promenade is the plot's edge (two returns at the corners stay)
      if (sd.id === 's' && Math.abs(mid - gate.x) < gate.half) { if (crest.length) crests.push([]); continue; }
      if (left <= 0) { kind = r.pick(kinds); tint = r.pick(WALL_TINTS); left = r.range(14, 38); }
      left -= 2;
      const p0 = sd.axis === 'x' ? [s, sd.at] : [sd.at, s], p1 = sd.axis === 'x' ? [s + 2, sd.at] : [sd.at, s + 2], pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const sx = sd.axis === 'x' ? 2.02 : T, sz = sd.axis === 'x' ? T : 2.02;
      const { yt, c } = wallPanel(b, kind, tint, pm[0], pm[1], sx, sz, H(p0[0], p0[1]), H(p1[0], p1[1]), H(pm[0], pm[1]), r.next(), INSIDE_FACE[sd.id]);
      stats.panels++; stats.wallM += 2; stats.runs[kind] += 2;
      insideFace(b, wallMat(kind, tint), kind, c, p0, p1, n, yt, H, plan.seed + 41);
      crest.push({ x: pm[0] + n[0] * 0.2, z: pm[1] + n[1] * 0.2, nx: n[0], nz: n[1], y: yt });
      if (dr.chance(0.2)) {                                                                                       // a poster or a tag, a metre or so along the panel, at hand height, a little crooked
        const tag = dr.chance(0.4), key = tag ? `tag.${Math.floor(dr.next() * TAGS)}` : `poster.${Math.floor(dr.next() * PAPERS)}`, pw = tag ? 0.9 : 0.34, ph = tag ? 0.45 : 0.49, u = 0.5 + dr.next();
        const x = p0[0] + (p1[0] - p0[0]) * (u / 2) + n[0] * (FACE_IN + 0.012), z = p0[1] + (p1[1] - p0[1]) * (u / 2) + n[1] * (FACE_IN + 0.012);
        const yb = Math.min(H(x, z) + (tag ? 0.7 : 1.05) + dr.next() * 0.35, yt - ph - 0.2), tilt = (dr.next() - 0.5) * (tag ? 0.1 : 0.05);
        if (Math.abs(sd.axis === 'x' ? x : z) + pw / 2 < E - FACE_IN) {                                          // not at the corner, where the next wall's box would bury it
          panel(K, dress, key, x, z, n[0], n[1], pw, yb, yb + tilt, ph);
          stats[tag ? 'tags' : 'posters']++; stats.papers.push(key);
        }
      }
      // a pilaster every 4 m (thicker, a little taller)
      if (Math.round(s / 2) % 2 === 0) {
        const lo = Math.min(H(p0[0], p0[1]), H(pm[0], pm[1])), yt = Math.max(H(p0[0], p0[1]), H(pm[0], pm[1])) + { block: 2.55, brick: 2.35, stone: 2.05, zinc: 2.3 }[kind];
        const mat = kind === 'zinc' ? 'wood_dark' : kind === 'stone' ? 'stone_wall' : kind === 'brick' ? 'brick_red_solid' : `plaster_rough#${tint}`;
        b.box(mat, p0[0], (lo - 0.4 + yt) / 2, p0[1], sd.axis === 'x' ? 0.34 : T + 0.22, yt - lo + 0.4, sd.axis === 'x' ? T + 0.22 : 0.34, { skip: ['ny'] });
      }
    }
    dressEdge(K, sd, crests);                                                                                       // R1-D21: the east and west walls become the back of the barrio (edgewall.js); it takes the raised panels out of `crests`
    crests.forEach((cr, i) => drape(K, cr, dr.fork('vine' + i), { step: 4.5 }));                                  // bougainvillea hung over the crest on the plot's side, every few panels
    (ctx.world.crests ??= {})[sd.id] = crests;                                                                    // and what rimwalk.js dresses the top with: the panels' tops, run by run
  }
  // ---- the welcome arch over the entry road, with the barrier lowered across it
  const g = ctx.batch.builder('props.boundary.gate'), gx = gate.x, gz = gate.z, y0 = H(gx, gz);
  for (const sx of [-1, 1]) {
    const px = gx + sx * (gate.half - 0.55);
    const yb = Math.min(H(px, gz), y0) - 0.4;
    g.box('plaster_rough#e8dcc0', px, yb + 2.7, gz, 1.0, 5.4 + 0.0, 0.9, { skip: ['ny'] });
    g.box('concrete_bare', px, yb + 5.45, gz, 1.22, 0.14, 1.12);
    g.box('concrete_bare', px, yb + 0.35, gz, 1.18, 0.7, 1.1);
    stats.gateM += 1;
  }
  const bx = gx, beamY = y0 + 4.55;
  g.box('plaster_rough#e8dcc0', bx, beamY + 0.4, gz, gate.half * 2 - 0.1, 0.9, 0.7, { skip: ['ny'] });
  g.box('concrete_bare', bx, beamY + 0.9, gz, gate.half * 2 + 0.3, 0.12, 0.9);
  ctx.world.gate = { x: gx, z: gz, y: y0, half: gate.half, beamY, signY: beamY + 0.4 };
  // barrier arm (red / white, lowered), pivot box on the east pillar side
  const armY = y0 + 1.02, ax0 = gx - gate.half + 1.2, ax1 = gx + gate.half - 1.2, az = gz - 0.9, segs = 10;
  for (let i = 0; i < segs; i++) {
    const t0 = ax0 + ((ax1 - ax0) * i) / segs, t1 = ax0 + ((ax1 - ax0) * (i + 1)) / segs;
    g.box('car_paint', (t0 + t1) / 2, armY, az, t1 - t0 + 0.01, 0.12, 0.1, { col: i % 2 ? [0.95, 0.95, 0.92] : [0.8, 0.12, 0.1] });
  }
  g.box('iron_black', ax1 + 0.55, y0 + 0.55, az, 0.5, 1.1, 0.45, { col: [0.2, 0.22, 0.26] });
  g.box('light_tail', ax1 + 0.55, y0 + 1.1, az - 0.24, 0.12, 0.12, 0.03);
  K.seg(ax0, az, ax1, az, 1.15, 0.12, y0 - 0.2);
  for (const k of [-3.2, 0, 3.2]) K.occ.take(gx + k, az, 0.6);        // the barrier arm: no vehicle or prop under it
  ctx.world.boundary = stats;

  // ---- the road leaves the plot: out of the arch, east along the promenade's back edge as a shared lane (4.2 m), then, past the plot's east side, a country road (6.4 m) up the east flank:
  // asphalt ribbon + centre line (on the flank) + edge lines. The lane's width follows the point's distance east (`hw`)
  const rd = ctx.batch.builder('props.boundary.road', { cast: false }), pts = far.road.pts, ys = pts.map((p, k) => far.road.roadY(far.road.cum[k]));
  const tan = tangents(pts), S = arcs(pts), hw = (k) => lerp(LANE_HALF, 3.2, ss(BAY_X, BAY_X + 24, pts[k][0]));
  const P = (k, off, dy) => [pts[k][0] - tan[k][1] * off, ys[k] + dy, pts[k][1] + tan[k][0] * off];
  const strip = (mat, fa, fb, dy, keep = () => true) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      if (!keep(k)) continue;
      rd.quad(mat, P(k, fa(k), dy), P(k, fb(k), dy), P(k + 1, fb(k + 1), dy), P(k + 1, fa(k + 1), dy), { uv: [fa(k), S[k], fb(k), S[k], fb(k + 1), S[k + 1], fa(k + 1), S[k + 1]] });
    }
  };
  strip('asphalt', (k) => -hw(k), (k) => hw(k), 0.012);
  strip('road_line_yellow', () => -0.07, () => 0.07, 0.022, (k) => pts[k][0] > BAY_X + 6);
  strip('road_line_white', (k) => -hw(k) + 0.4, (k) => -hw(k) + 0.48, 0.022); strip('road_line_white', (k) => hw(k) - 0.48, (k) => hw(k) - 0.4, 0.022);
  stats.roadM = Math.round(far.road.cum[far.road.cum.length - 1]);
  return stats;
}
