// PERIPHERY (A5): the land around the 200 x 200 m plot and the plot's own rim.
//   makeFarHeight(plan)   the ground outside the plot (mountain wall behind, side ridges, a valley in front, the road that leaves at the
//                         foot of S1), continuous with plan.heightAt at the edge. Pure data: runs under node.
//   buildFarTerrain(ctx)  world.terrain.far.* (100 m tiles at 5 m up to +-300 m) and world.terrain.farB.* (150 m tiles at 15 m up to +-750 m)
//   buildBoundary(K)      the visible perimeter: block / brick / stone walls and zinc fences, pilasters, a welcome arch with a lowered barrier
//                         at the end of the entry road, the road leaving the plot. The physics walls (terrain.js buildPerimeter) stay 0.35 m inside.
import { ss, vnoise, lerp, project, resample, pointAt } from './geom.js';
import { HALF } from './field.js';
import { ribbon } from './mk.js';

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

function roadPath(plan) {
  const s1 = plan.streets.find((s) => s.id === 'S1'), pts = s1?._d?.pts ?? [[46, 100], [46, 90]];
  const a = pts[0], b = pts[pts.length - 1], st = a[1] > b[1] ? a : b, x0 = st[0], z0 = Math.min(st[1], HALF);
  const ctrl = [[x0, z0], [x0, z0 + 30], [x0 + 6, z0 + 62], [x0 - 4, z0 + 98], [x0 - 34, z0 + 130], [x0 - 82, z0 + 154], [x0 - 142, z0 + 170], [x0 - 214, z0 + 194], [x0 - 290, z0 + 230]];
  const { pts: p, cum } = resample(catmull(ctrl), 4);
  return { pts: p, cum, x0, z0 };
}

// ---------------------------------------------------------------------------------------------------- relief
/** How built-up the land outside the plot is, 0..1 (the vista puts houses there, the far terrain turns dusty under them). */
export function urbanDensity(plan, x, z) {
  const ax = Math.abs(x), d = Math.max(ax - HALF, Math.abs(z) - HALF);
  if (d < 7) return 0;
  const seed = plan.seed;
  const south = ss(135, 250, z) * (1 - ss(650, 740, z)) * (1 - 0.55 * ss(205, 235, z) * (1 - ss(262, 300, z)));      // valley district + the opposite hillside, a gap for the river
  const flank = ss(HALF + 5, HALF + 30, ax) * (1 - ss(250, 330, ax)) * ss(-250, -110, z) * (1 - ss(135, 175, z)) * 0.85;
  const north = ss(-HALF - 8, -HALF - 40, z) * (1 - ss(-170, -240, z)) * 0.42 * (1 - ss(120, 190, ax));
  const patch = 0.5 + 0.5 * vnoise(x, z, 55, seed + 61);
  return Math.max(0, Math.min(1, (south + flank + north) * (0.3 + 0.8 * patch) - 0.08));
}

export function makeFarHeight(plan) {
  const H = plan.heightAt, seed = plan.seed, road = roadPath(plan);
  const raw = (x, z) => {
    const ax = Math.abs(x), d = Math.max(ax - HALF, Math.abs(z) - HALF), base = H(x, z);
    if (d <= 0) return base;
    const w = ss(0, 70, d);
    const rid = 1 - Math.min(1, Math.abs(vnoise(x + 70, z, 120, seed + 41)) * 1.5);
    const mountain = 94 * ss(-100, -340, z) * (0.5 + 0.5 * rid) * (0.72 + 0.28 * vnoise(x, z, 200, seed + 43));
    const flank = 48 * ss(HALF, 320, ax) * (0.45 + 0.55 * ss(150, -150, z)) * (0.62 + 0.38 * vnoise(x, z, 150, seed + 45));
    const valley = -14 * ss(100, 200, z);
    const opposite = 70 * ss(300, 580, z) * (0.8 + 0.2 * vnoise(x, z, 180, seed + 51));
    const roll = vnoise(x, z, 75, seed + 47) * 5.5 + vnoise(x, z, 31, seed + 49) * 1.8;
    return base + w * (mountain + flank + valley + opposite + roll);
  };
  // the road's own profile: the terrain along it, smoothed, starting exactly at the height of the street's end
  const n = road.pts.length, ys = road.pts.map((p) => raw(p[0], p[1])), sm = ys.map((_, k) => { let s = 0, c = 0; for (let j = Math.max(0, k - 8); j <= Math.min(n - 1, k + 8); j++) { s += ys[j]; c++; } return s / c; });
  const y0 = H(road.x0, road.z0);
  const prof = sm.map((v, k) => lerp(y0, v, ss(0, 56, road.cum[k])));
  const roadY = (s) => { const q = pointAt(road.pts, road.cum, s), i = Math.min(n - 1, q.i), u = (s - road.cum[i - 1]) / (road.cum[i] - road.cum[i - 1] || 1); return lerp(prof[i - 1], prof[i], Math.max(0, Math.min(1, u))); };
  const far = (x, z) => {
    let h = raw(x, z);
    if (z > HALF - 3) {
      const p = project(road.pts, road.cum, x, z);
      if (p.d < 15 && p.s > 1) h = lerp(h, roadY(p.s) - 0.07, 1 - ss(6, 15, p.d));
    }
    return h;
  };
  far.road = { ...road, roadY, prof };
  return far;
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
  const tile = (id, x0, z0, size, cells) => {
    const b = ctx.batch.builder(id, { cast: false }), acc = b._acc(GRASS), step = size / cells, ix = (i, j) => j * (cells + 1) + i;
    const V = new Int32Array((cells + 1) ** 2), hs = new Float32Array((cells + 1) ** 2);
    for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) {
      const x = x0 + i * step, z = z0 + j * step, h = far(x, z), e = Math.max(1.5, step * 0.6);
      const nx = -(far(x + e, z) - far(x - e, z)) / (2 * e), nz = -(far(x, z + e) - far(x, z - e)) / (2 * e), l = Math.hypot(nx, 1, nz);
      hs[ix(i, j)] = h;
      V[ix(i, j)] = b.vert(acc, [x, h, z], [nx / l, 1 / l, nz / l], x * 0.25, z * 0.25, colour(x, z, h));
    }
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) { const a = V[ix(i, j)], c = V[ix(i, j + 1)], d = V[ix(i + 1, j + 1)], e2 = V[ix(i + 1, j)]; acc.idx.push(a, c, d, a, d, e2); b.tris += 2; }
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
    ctx.batch.flush(id);
  };
  // ring A: 100 m tiles, 5 m cells, +-300 m except the plot itself
  for (let tj = -3; tj < 3; tj++) for (let ti = -3; ti < 3; ti++) {
    if (ti >= -1 && ti < 1 && tj >= -1 && tj < 1) continue;
    tile(`world.terrain.far.${ti + 3}.${tj + 3}`, ti * 100, tj * 100, 100, 20);
  }
  // ring B: 150 m tiles, 15 m cells, +-750 m except ring A
  for (let tj = -5; tj < 5; tj++) for (let ti = -5; ti < 5; ti++) {
    if (ti >= -2 && ti < 2 && tj >= -2 && tj < 2) continue;
    tile(`world.terrain.farB.${ti + 5}.${tj + 5}`, ti * 150, tj * 150, 150, 10);
  }
}

// ---------------------------------------------------------------------------------------------------- boundary
const WALL_TINTS = ['d9c7a0', 'cfd8c4', 'e6c9b4', 'c9d3d8', 'e3d79a', 'd8b8a8'];

/** One run of wall: kind decides material and height. Returns nothing; adds boxes to builder b. */
function wallPanel(b, kind, tint, cx, cz, sx, sz, g0, g1, g2, rnd) {
  const lo = Math.min(g0, g1, g2), hi = Math.max(g0, g1, g2), h = { block: 2.4, brick: 2.2, stone: 1.9, zinc: 2.1 }[kind];
  const yb = lo - 0.4, yt = hi + h, c = rnd ? 0.94 + 0.1 * rnd : 1;
  const mat = { block: `plaster_rough#${tint}`, brick: 'brick_red_solid', stone: 'stone_wall', zinc: 'corrugated_zinc' }[kind];
  b.box(mat, cx, (yb + yt) / 2, cz, sx, yt - yb, sz, { col: [c, c, c], skip: ['ny'] });
  if (kind !== 'zinc') b.box('concrete_bare', cx, yt + 0.045, cz, sx + (sx > sz ? 0 : 0.14), 0.09, sz + (sx > sz ? 0.14 : 0), { skip: ['ny'] });
  return yt;
}

export function buildBoundary(K) {
  const { ctx, plan, H } = K, R = K.rng('boundary'), far = plan._far ?? (plan._far = makeFarHeight(plan));
  const E = HALF - 0.45, T = 0.4, stats = { wallM: 0, gateM: 0, panels: 0, runs: { block: 0, brick: 0, stone: 0, zinc: 0 } };
  const gate = { x: far.road.x0, z: Math.min(HALF - 0.5, far.road.z0 - 0.5), half: 5.4 };
  const sides = [
    { id: 's', axis: 'x', at: E },        // z = +E (the entry road side)
    { id: 'n', axis: 'x', at: -E },
    { id: 'e', axis: 'z', at: E },
    { id: 'w', axis: 'z', at: -E },
  ];
  const kinds = ['block', 'block', 'brick', 'stone', 'zinc', 'block', 'brick'];
  for (const sd of sides) {
    const b = ctx.batch.builder(`props.boundary.${sd.id}`), r = R.fork(sd.id);
    let kind = r.pick(kinds), tint = r.pick(WALL_TINTS), left = 0;
    for (let s = -HALF + 0.2; s < HALF - 0.2; s += 2) {
      const mid = s + 1;
      if (sd.id === 's' && Math.abs(mid - gate.x) < gate.half) continue;
      if (left <= 0) { kind = r.pick(kinds); tint = r.pick(WALL_TINTS); left = r.range(14, 38); }
      left -= 2;
      const p0 = sd.axis === 'x' ? [s, sd.at] : [sd.at, s], p1 = sd.axis === 'x' ? [s + 2, sd.at] : [sd.at, s + 2], pm = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const sx = sd.axis === 'x' ? 2.02 : T, sz = sd.axis === 'x' ? T : 2.02;
      wallPanel(b, kind, tint, pm[0], pm[1], sx, sz, H(p0[0], p0[1]), H(p1[0], p1[1]), H(pm[0], pm[1]), r.next());
      stats.panels++; stats.wallM += 2; stats.runs[kind] += 2;
      // a pilaster every 4 m (thicker, a little taller)
      if (Math.round(s / 2) % 2 === 0) {
        const lo = Math.min(H(p0[0], p0[1]), H(pm[0], pm[1])), yt = Math.max(H(p0[0], p0[1]), H(pm[0], pm[1])) + { block: 2.55, brick: 2.35, stone: 2.05, zinc: 2.3 }[kind];
        const mat = kind === 'zinc' ? 'wood_dark' : kind === 'stone' ? 'stone_wall' : kind === 'brick' ? 'brick_red_solid' : `plaster_rough#${tint}`;
        b.box(mat, p0[0], (lo - 0.4 + yt) / 2, p0[1], sd.axis === 'x' ? 0.34 : T + 0.22, yt - lo + 0.4, sd.axis === 'x' ? T + 0.22 : 0.34, { skip: ['ny'] });
      }
    }
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

  // ---- the road leaves the plot: asphalt ribbon + centre line + shoulders down to the valley
  const rd = ctx.batch.builder('props.boundary.road', { cast: false }), pts = far.road.pts, ys = pts.map((p, k) => far.road.roadY(far.road.cum[k]));
  ribbon(rd, 'asphalt', pts, ys, -4, 4, { dy: 0.012 });
  ribbon(rd, 'road_line_yellow', pts, ys, -0.07, 0.07, { dy: 0.022 });
  ribbon(rd, 'road_line_white', pts, ys, -3.6, -3.52, { dy: 0.022 }); ribbon(rd, 'road_line_white', pts, ys, 3.52, 3.6, { dy: 0.022 });
  stats.roadM = Math.round(far.road.cum[far.road.cum.length - 1]);
  return stats;
}
