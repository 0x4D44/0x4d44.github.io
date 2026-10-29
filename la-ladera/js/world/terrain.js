// ENVIRONMENT (A5): buildWorld builds the ground and everything that is part of the public space shell:
// terrain tiles (25 m, 0.5 m grid), street surfaces, kerbs, stairs + rails, retaining walls, plazas/court/mirador floors,
// perimeter colliders. Props, flora, poles, vehicles, signage and the periphery live in props.js.
// Groups: world.terrain.<i>.<j>, world.terrain.far.<i>.<j>, world.streets, world.stairs, world.walls, world.plazas.
import { ss, vnoise, segDist, pointInPoly, polyDistPoint, footprint } from './geom.js';
import { HALF, CELL, N } from './field.js';
import { BAND, PAD_BAND } from './plan.js';
import { buildSurfaces } from './surfaces.js';
import { buildStairs } from './stairs.js';
import { buildRetaining } from './walls.js';

const TILE = 25, CPT = TILE / CELL;          // 8 x 8 tiles of 50 x 50 cells
const CARVE = 0.07, CARVE_STAIR = 0.13;       // terrain sits this far under paved surfaces (no z-fighting, no poke-through)

export async function buildWorld(ctx) {
  const plan = ctx.plan;
  const yieldNow = typeof requestAnimationFrame === 'function' && ctx.yield ? () => ctx.yield() : async () => {};
  const times = {};
  const step = async (name, fn) => {
    const t0 = performance.now();
    try { await fn(); } catch (e) {
      console.error(`[world.${name}]`, e);
      ctx.errors?.push({ stage: 'world', item: name, message: String(e?.message ?? e), stack: e?.stack });
    }
    times[name] = Math.round(performance.now() - t0);
    await yieldNow();
  };
  const masks = makeMasks(plan);
  ctx.world = { masks, times };
  await step('terrain', () => buildTerrain(ctx, plan, masks));
  await step('surfaces', () => buildSurfaces(ctx, plan));
  await step('stairs', () => buildStairs(ctx, plan));
  await step('retaining', () => buildRetaining(ctx, plan));
  await step('perimeter', () => buildPerimeter(ctx));
  ctx.timings && (ctx.timings.worldParts = times);
}

/** carve: 1 = under a street/plaza surface, 2 = under stairs; near: within reach of a structure (cut/fill ground = bare earth). */
function makeMasks(plan) {
  const f = plan._field, carve = new Uint8Array(N * N), near = new Uint8Array(N * N);
  for (const st of plan.streets) {
    const hw = st.width / 2, B = BAND[st.kind] ?? 0.5, d = st._d, reach = hw + B + 0.9, c = st.kind === 'stair' ? 2 : 1;
    for (let k = 1; k < d.pts.length; k++) {
      const a = d.pts[k - 1], b = d.pts[k];
      f.nodes(Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach, Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach, (i, x, z) => {
        const dd = segDist(x, z, a, b);
        if (dd < reach) near[i] = 1;
        if (dd <= hw + 0.02 && carve[i] < c) carve[i] = c;
      });
    }
  }
  for (const pl of plan.plazas) {
    const xs = pl.poly.map((p) => p[0]), zs = pl.poly.map((p) => p[1]);
    f.nodes(Math.min(...xs) - 2.2, Math.min(...zs) - 2.2, Math.max(...xs) + 2.2, Math.max(...zs) + 2.2, (i, x, z) => {
      const dd = pointInPoly(pl.poly, x, z) ? 0 : polyDistPoint(pl.poly, x, z);
      if (dd < 2.0) near[i] = 1;
      if (dd <= 0.02 && carve[i] < 1) carve[i] = 1;
    });
  }
  for (const l of plan.lots) {
    const poly = footprint(l, 0.3), xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]), reach = PAD_BAND + 0.8;
    f.nodes(Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach, (i, x, z) => { if (polyDistPoint(poly, x, z) < reach) near[i] = 1; });
  }
  return { carve, near };
}

// ---------------------------------------------------------------------------------------------------- terrain tiles
function buildTerrain(ctx, plan, masks) {
  const H = plan.heightAt, seed = plan.seed, { carve, near } = masks;
  const G0 = new Float32Array(N * N), G = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, h = H(-HALF + i * CELL, -HALF + j * CELL);
    G0[k] = h; G[k] = h - (carve[k] === 2 ? CARVE_STAIR : carve[k] === 1 ? CARVE : 0);
  }
  const at = (i, j) => G0[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  const slope = new Float32Array(N * N), dirt = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL), s = Math.hypot(gx, gz), k = j * N + i;
    const x = -HALF + i * CELL, z = -HALF + j * CELL;
    // bare earth: beside every structure (cut / fill ground), on steep slopes, and in worn patches of the open hillside
    const patch = 0.95 * ss(0.5, 0.72, vnoise(x, z, 6.5, seed + 11) * 0.7 + vnoise(x, z, 17, seed + 13) * 0.45);
    slope[k] = s;
    dirt[k] = near[k] ? 1 : Math.max(ss(0.42, 0.72, s), patch);
  }
  masks.dirt = dirt; masks.slope = slope;          // read by the flora (tufts only on grass)
  const GRASS = 'grass_patchy', DIRT = 'ground_dirt';
  const colour = (i, j, isDirt) => {
    const x = -HALF + i * CELL, z = -HALF + j * CELL, y = G0[j * N + i];
    const n = vnoise(x, z, 11, seed) * 0.5 + vnoise(x, z, 3.1, seed + 3) * 0.3 + 0.2 * vnoise(x, z, 0.9, seed + 9);
    const dry = ss(10, 28, y), k = 1 + 0.13 * n;
    if (isDirt) return [Math.min(1, (0.88 + 0.05 * dry) * k), Math.min(1, 0.86 * k), Math.min(1, 0.82 * k)];
    return [Math.min(1, (0.92 + 0.12 * dry) * k), Math.min(1, (1.0 - 0.02 * dry) * k), Math.min(1, (0.8 - 0.1 * dry) * k)];
  };
  const normal = (i, j) => {
    const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL), l = Math.hypot(gx, 1, gz);
    return [-gx / l, 1 / l, -gz / l];
  };
  const T = N - 1;
  for (let tj = 0; tj < 8; tj++) for (let ti = 0; ti < 8; ti++) {
    const id = `world.terrain.${ti}.${tj}`, b = ctx.batch.builder(id), maps = { [GRASS]: new Int32Array((CPT + 1) ** 2).fill(-1), [DIRT]: new Int32Array((CPT + 1) ** 2).fill(-1) };
    const vtx = (mat, ci, cj, gi, gj) => {
      const m = maps[mat], key = cj * (CPT + 1) + ci;
      if (m[key] >= 0) return m[key];
      const acc = b._acc(mat), k = gj * N + gi, x = -HALF + gi * CELL, z = -HALF + gj * CELL;
      return (m[key] = b.vert(acc, [x, G[k], z], normal(gi, gj), x, z, colour(gi, gj, mat === DIRT)));
    };
    for (let cj = 0; cj < CPT; cj++) for (let ci = 0; ci < CPT; ci++) {
      const gi = ti * CPT + ci, gj = tj * CPT + cj;
      if (gi >= T || gj >= T) continue;
      const k00 = gj * N + gi, w = (dirt[k00] + dirt[k00 + 1] + dirt[k00 + N] + dirt[k00 + N + 1]) / 4;
      const mat = w >= 0.5 ? DIRT : GRASS, acc = b._acc(mat);
      const a = vtx(mat, ci, cj, gi, gj), bb = vtx(mat, ci, cj + 1, gi, gj + 1), c = vtx(mat, ci + 1, cj + 1, gi + 1, gj + 1), d = vtx(mat, ci + 1, cj, gi + 1, gj);
      acc.idx.push(a, bb, c, a, c, d); b.tris += 2;
    }
    ctx.batch.flush(id);
  }
  // ---- the far skirt: 100 m tiles at 5 m up to +-300 m, so the plot does not float in a void (the periphery hills sit on top)
  const FT = 100, FC = 20;
  for (let tj = -3; tj < 3; tj++) for (let ti = -3; ti < 3; ti++) {
    if (ti >= -1 && ti < 1 && tj >= -1 && tj < 1) continue;
    const id = `world.terrain.far.${ti + 3}.${tj + 3}`, b = ctx.batch.builder(id, { cast: false }), acc = b._acc(GRASS), idx = new Int32Array((FC + 1) ** 2);
    for (let cj = 0; cj <= FC; cj++) for (let ci = 0; ci <= FC; ci++) {
      const x = ti * FT + (ci * FT) / FC, z = tj * FT + (cj * FT) / FC, h = H(x, z), e = 1.5;
      const nx = -(H(x + e, z) - H(x - e, z)) / (2 * e), nz = -(H(x, z + e) - H(x, z - e)) / (2 * e), l = Math.hypot(nx, 1, nz);
      const n = vnoise(x, z, 23, seed + 5);
      idx[cj * (FC + 1) + ci] = b.vert(acc, [x, h, z], [nx / l, 1 / l, nz / l], x, z, [0.86 + 0.08 * n, 0.9 + 0.05 * n, 0.74 + 0.05 * n]);
    }
    for (let cj = 0; cj < FC; cj++) for (let ci = 0; ci < FC; ci++) {
      const a = idx[cj * (FC + 1) + ci], bb = idx[(cj + 1) * (FC + 1) + ci], c = idx[(cj + 1) * (FC + 1) + ci + 1], d = idx[cj * (FC + 1) + ci + 1];
      acc.idx.push(a, bb, c, a, c, d); b.tris += 2;
    }
    ctx.batch.flush(id);
  }
}

// ---------------------------------------------------------------------------------------------------- perimeter
/** Invisible walls just inside the plot edge: nobody walks off the map. (Visible fences / hedges are props.) */
function buildPerimeter(ctx) {
  const e = HALF - 0.6, t = 0.4;
  for (const [x1, z1, x2, z2] of [[-e, -e, e, -e], [e, -e, e, e], [e, e, -e, e], [-e, e, -e, -e]]) ctx.physics.addWall({ x1, z1, x2, z2, t, id: 'perimeter' });
}
