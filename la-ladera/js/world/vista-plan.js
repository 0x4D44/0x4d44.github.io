// Deterministic far-neighbourhood placement. Pure data: no renderer, DOM or asset fetch.
// The source kit supplies dimensions and legal mounting planes; every rendered stack uses these records.
import { makeRng } from '../core/rng.js';
import { makeFarHeight, makeFarTerrainSampler, urbanDensity } from './periphery.js';
import { project } from './geom.js';
import { HALF } from './field.js';

export const VISTA_LIMITS = Object.freeze({
  tileSize: 160, farTriangles: 42000, triangles: 60000,
  nearDistance: 180, detailDistance: 245, hysteresis: 12, maxBuildings: 900,
});
export const VISTA_CATEGORIES = Object.freeze(['facade', 'roof', 'tank', 'rebar', 'stair', 'retaining', 'balcony', 'washing']);
const DETAIL = new Set(['rebar', 'balcony', 'washing']);
const finite3 = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** A malformed kit must never partly replace the working background. */
export function placementErrors(data) {
  const errors = [];
  if (data?.version !== 1) errors.push('unsupported placement version');
  if (data?.units !== 'metres' || data?.origin !== 'floor-centre') errors.push('unsupported placement frame');
  if (!Array.isArray(data?.pieces) || data.pieces.length < 40 || data.pieces.length > 60) return [...errors, 'expected 40–60 placement pieces'];
  const ids = new Set(), names = new Set(), categories = new Set();
  for (const p of data.pieces) {
    if (!p || typeof p.id !== 'string' || !/^[a-z0-9_]+$/.test(p.id) || ids.has(p.id)) { errors.push('invalid/duplicate piece id'); continue; }
    ids.add(p.id); categories.add(p.category);
    if (!VISTA_CATEGORIES.includes(p.category)) errors.push(`${p.id}: unknown category`);
    for (const n of [p.near, p.far]) {
      if (typeof n !== 'string' || !/^vista_[a-z0-9_]+$/.test(n) || names.has(n)) errors.push(`${p.id}: invalid/duplicate asset name`);
      names.add(n);
    }
    if (!finite3(p.size) || !p.size.every((x) => x > 0 && x < 30)) errors.push(`${p.id}: invalid dimensions`);
    if (!Number.isInteger(p.nearTriangles) || p.nearTriangles <= 0 || p.nearTriangles >= 600) errors.push(`${p.id}: near triangle budget`);
    if (!Number.isInteger(p.farTriangles) || p.farTriangles <= 0 || p.farTriangles > 60) errors.push(`${p.id}: far triangle budget`);
    const s = p.stack;
    if (!s || !Array.isArray(s.on) || !Array.isArray(s.supports) || !s.on.every((x) => x === 'ground' || VISTA_CATEGORIES.includes(x)) || !s.supports.every((x) => VISTA_CATEGORIES.includes(x)) || !Number.isFinite(s.height) || s.height < 0 || s.height > (p.size?.[1] ?? 0) + 0.01 || !Number.isInteger(s.maxLevels) || s.maxLevels < 0 || s.maxLevels > 12) errors.push(`${p.id}: invalid stack rules`);
    if (p.category === 'facade') {
      const m = p.mounts?.front;
      if (!m || !Number.isFinite(m.y) || !Number.isFinite(m.z) || m.y < 0 || m.y > (p.size?.[1] ?? 0) || m.z < 0 || m.z > (p.size?.[2] ?? 0) / 2) errors.push(`${p.id}: invalid facade front mount`);
    }
  }
  for (const c of VISTA_CATEGORIES) if (!categories.has(c)) errors.push(`missing category ${c}`);
  return errors;
}

/** World-space footprint AABB; conservative for rotated pieces, including overhangs. */
export function vistaBounds(p) {
  const c = Math.abs(Math.cos(p.ry)), s = Math.abs(Math.sin(p.ry));
  const hx = (p.size[0] * c + p.size[2] * s) / 2, hz = (p.size[0] * s + p.size[2] * c) / 2;
  return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz };
}
export function outsideVistaPlot(p, margin = 8) {
  const b = vistaBounds(p), edge = HALF + margin;
  return b.x1 < -edge || b.x0 > edge || b.z1 < -edge || b.z0 > edge;
}
const offset = (x, z, ry, u, v) => [x + u * Math.cos(ry) + v * Math.sin(ry), z - u * Math.sin(ry) + v * Math.cos(ry)];
const round = (n) => +n.toFixed(5);

/**
 * Build contiguous runs of 4–7 narrow houses, with staggered floors and incremental roof additions.
 * A developed run is selected as a unit: a budget cap never leaves a lone half-stack on a lawn.
 * First storeys extend below both the smooth relief and the rendered terrain triangles.
 */
export function planVista(plan, data, limits = VISTA_LIMITS) {
  const errors = placementErrors(data);
  if (errors.length) throw new Error('vista placement: ' + errors.join('; '));
  const far = plan._far ?? makeFarHeight(plan), rng = makeRng(plan.seed).fork('vista:terraces:v1');
  const byCategory = Object.fromEntries(VISTA_CATEGORIES.map((c) => [c, data.pieces.filter((p) => p.category === c)]));
  const facades = byCategory.facade;
  const ground = facades.filter((p) => p.tags?.includes('ground') && p.stack.on.includes('ground'));
  const upper = facades.filter((p) => p.tags?.includes('upper'));
  // Neighbours share a small vocabulary of local construction details. Besides looking coherent,
  // this lets each spatial tile instance a handful of variants instead of paying for all 48 draws.
  const styles = new Map();
  const styleAt = (x, z) => {
    const key = `${Math.floor(x / limits.tileSize)}:${Math.floor(z / limits.tileSize)}`;
    if (styles.has(key)) return styles.get(key);
    const s = rng.fork('materials:' + key), take = (items, n) => s.shuffle([...items]).slice(0, n);
    const flat = byCategory.roof.filter((p) => p.stack.supports.length), tin = byCategory.roof.filter((p) => p.id.includes('tin'));
    const irregular = byCategory.roof.filter((p) => !p.stack.supports.length && !p.id.includes('tin'));
    const style = { ground: take(ground.length ? ground : facades, 2), upper: take(upper.length ? upper : facades, 3),
      roof: [...take(flat, 1), ...take(tin, 1), ...take(irregular, 1)], retaining: take(byCategory.retaining, 2),
      stair: take(byCategory.stair, 1), tank: take(byCategory.tank, 2), rebar: take(byCategory.rebar, 2),
      balcony: take(byCategory.balcony, 2), washing: take(byCategory.washing, 2) };
    if (!style.roof.length) style.roof = take(byCategory.roof, 3);
    styles.set(key, style); return style;
  };
  const houses = [], pieces = [], clusters = [], regionCost = { south: 0, east: 0, west: 0, north: 0 };
  const quota = { south: 0.62, east: 0.145, west: 0.145, north: 0.09 };
  const candidates = [];
  const allowed = (p) => {
    if (!outsideVistaPlot(p)) return false;
    const b = vistaBounds(p);
    if (b.z0 < 282 && b.z1 > 204) return false; // leave the river corridor open, including the entire footprint
    if (far.road && project(far.road.pts, far.road.cum, p.x, p.z).d < Math.hypot(p.size[0], p.size[2]) / 2 + 9) return false;
    return true;
  };
  const addCandidate = (region, x, z, ry, score) => {
    const density = urbanDensity(plan, x, z);
    if (density < 0.12) return;
    const r = rng.fork(`${region}:${x}:${z}`);
    candidates.push({ region, x: x + r.range(-1.5, 1.5), z: z + r.range(-0.7, 0.7), ry, score: score + density * 1.7 + r.range(0, 0.15), r });
  };
  // Shared contour-like rows; side districts turn their fronts downhill toward the playable barrio.
  for (let z = 332; z <= 640; z += 12) for (let x = -300; x <= 300; x += 38) {
    const centers = [[-155, 465], [35, 425], [180, 525]];
    const d = Math.min(...centers.map(([cx, cz]) => Math.hypot((x - cx) / 135, (z - cz) / 140)));
    addCandidate('south', x, z, Math.PI, -d);
  }
  for (const sign of [-1, 1]) for (let x = 128; x <= 260; x += 12) for (let z = -165; z <= 148; z += 38) {
    const d = Math.hypot((x - 170) / 95, (z + 15) / 180);
    addCandidate(sign < 0 ? 'west' : 'east', x * sign, z, -sign * Math.PI / 2, -d);
  }
  for (let z = -142; z >= -226; z -= 12) for (let x = -95; x <= 95; x += 38) addCandidate('north', x, z, 0, -Math.hypot(x / 140, (z + 166) / 65));
  candidates.sort((a, b) => b.score - a.score || a.z - b.z || a.x - b.x);
  let farTriangles = 0;
  for (const c of candidates) {
    if (houses.length >= limits.maxBuildings || regionCost[c.region] >= limits.farTriangles * quota[c.region]) continue;
    const r = c.r, style = styleAt(c.x, c.z), clusterId = `terrace-${clusters.length}`, count = r.int(4, 6), gap = 0.12;
    const width = r.range(4.7, 5.45), depth = r.range(5.1, 6.05), span = count * (width + gap);
    const out = [], hs = [];
    const put = (meta, id, x, y, z, ry, size, support = null, extra = {}) => {
      const rec = { id, key: meta.id, near: meta.near, far: meta.far, category: meta.category,
        x: round(x), y: round(y), z: round(z), ry, size: size.map(round), scale: size.map((n, k) => round(n / meta.size[k])),
        nearTriangles: meta.nearTriangles, farTriangles: meta.farTriangles, detail: DETAIL.has(meta.category),
        shade: round(r.range(0.9, 1.0)), cluster: clusterId, support, ...extra };
      if (allowed(rec)) { out.push(rec); return rec; }
      return null;
    };
    for (let k = 0; k < count; k++) {
      const [x, z] = offset(c.x, c.z, c.ry, (k - (count - 1) / 2) * (width + gap), r.range(-0.25, 0.25));
      const corners = [[-1,-1],[-1,1],[1,-1],[1,1]].map(([u,v]) => offset(x, z, c.ry, u * width / 2, v * depth / 2));
      const ys = corners.map(([px, pz]) => far(px, pz));
      const lo = Math.min(...ys), hi = Math.max(...ys), fh = r.range(2.6, 2.85);
      if (!Number.isFinite(lo) || hi - lo > 3.2) continue;
      const base = lo - 0.18, wantedLevels = Math.max(hi - base > fh - 0.7 ? 2 : 1, r.chance(0.63) ? 2 : r.chance(0.3) ? 3 : 1);
      const houseId = `${clusterId}-h${k}`, before = out.length;
      let parent = null, topMeta = null;
      const body = r.pick(style.ground), up = r.pick(style.upper);
      if (!body.stack.on.includes('ground')) continue;
      const levels = Math.min(wantedLevels, body.stack.maxLevels, up.stack.maxLevels);
      let topY = base;
      for (let level = 0; level < levels; level++) {
        const meta = level ? up : body;
        if (parent && (!topMeta.stack.supports.includes(meta.category) || !meta.stack.on.includes(topMeta.category))) break;
        // The same footprint supports every storey; roof silhouettes provide the offsets without unsupported walls.
        const p = put(meta, `${houseId}-floor${level}`, x, topY, z, c.ry, [width, fh, depth], parent?.id ?? null, { house: houseId, level });
        if (!p) break;
        parent = p; topMeta = meta; topY += meta.stack.height * p.scale[1];
      }
      if (!parent) continue;
      const compatibleRoofs = style.roof.filter((p) => p.stack.on.includes('facade') && topMeta.stack.supports.includes('roof'));
      if (!compatibleRoofs.length) { out.splice(before); continue; }
      const roof = r.pick(compatibleRoofs);
      const cap = put(roof, `${houseId}-roof`, x, topY, z, c.ry, [width + 0.3, roof.size[1], depth + 0.3], parent.id, { house: houseId });
      if (!cap) { out.splice(before); continue; }
      const roofY = cap.y + roof.stack.height * cap.scale[1];
      const deco = r.next();
      const kind = deco < 0.19 ? 'tank' : deco < 0.29 ? 'rebar' : deco < 0.43 ? 'washing' : null;
      if (kind && roof.stack.supports.includes(kind)) {
        const opts = style[kind].filter((p) => p.stack.on.includes('roof'));
        if (opts.length) {
          const meta = r.pick(opts), dw = Math.min(meta.size[0], width - 0.6), dd = Math.min(meta.size[2], depth - 0.6);
          const [dx, dz] = offset(x, z, c.ry, r.range(-1, 1) * Math.max(0, (width - dw) / 2 - 0.2), r.range(-1, 1) * Math.max(0, (depth - dd) / 2 - 0.2));
          put(meta, `${houseId}-${kind}`, dx, roofY, dz, c.ry, [dw, meta.size[1], dd], cap.id, { house: houseId });
        }
      }
      if (levels > 1 && r.chance(0.26) && topMeta.stack.supports.includes('balcony')) {
        const meta = r.pick(style.balcony), dw = Math.min(meta.size[0], width * 0.85);
        const front = topMeta.mounts.front;
        const [bx, bz] = offset(parent.x, parent.z, parent.ry, 0, front.z * parent.scale[2] + meta.size[2] / 2 - 0.1);
        put(meta, `${houseId}-balcony`, bx, parent.y + front.y * parent.scale[1] - 0.04, bz, c.ry, [dw, meta.size[1], meta.size[2]], parent.id, { house: houseId, mount: 'front' });
      }
      if (k % 2 === 0) {
        const meta = r.pick(style.retaining), exposure = r.range(0.6, 1.1), ww = width + gap, wd = 0.5;
        const [wx, wz] = offset(x, z, c.ry, 0, depth / 2 + 0.12);
        // Cross-slopes and shallow interior dips both matter: sample the full strip at <=0.25 m,
        // including both ends/faces. Its bottom lies below the lowest sample and its cap clears the highest.
        const steps = Math.ceil(ww / 0.25), along = Array.from({ length: steps + 1 }, (_, i) => i / steps - 0.5);
        const samples = along.flatMap((u) => [-0.5, 0, 0.5].map((v) => {
          const [px, pz] = offset(wx, wz, c.ry, u * ww, v * wd); return far(px, pz);
        }));
        const wallBase = Math.min(...samples) - 0.12, wallTop = Math.max(...samples) + exposure;
        put(meta, `${houseId}-retaining`, wx, wallBase, wz, c.ry, [ww, wallTop - wallBase, wd], null, { house: houseId });
      }
      hs.push({ id: houseId, x: round(x), z: round(z), y: round(base), levels, width, depth, ry: c.ry, terrainRange: [round(lo), round(hi)], cluster: clusterId, region: c.region });
    }
    if (hs.length < 3) continue; // a terrace, never a scattering of isolated boxes
    const stair = r.pick(style.stair);
    const [sx, sz] = offset(c.x, c.z, c.ry, span / 2 + 0.55, -2);
    const stairDepth = Math.min(5.5, stair.size[2]), [lx, lz] = offset(sx, sz, c.ry, 0, stairDepth / 2), [hx, hz] = offset(sx, sz, c.ry, 0, -stairDepth / 2);
    const low = far(lx, lz), rise = far(hx, hz) - low;
    if (rise > 0.55 && rise < 3.6) put(stair, `${clusterId}-stair`, sx, low - 0.12, sz, c.ry, [1.25, rise + 0.1, stairDepth]);
    const cost = out.reduce((a, p) => a + (p.detail ? 0 : p.farTriangles), 0);
    if (cost + farTriangles > limits.farTriangles || regionCost[c.region] + cost > limits.farTriangles * quota[c.region] + 500) continue;
    pieces.push(...out); houses.push(...hs); clusters.push({ id: clusterId, region: c.region, houses: hs.map((h) => h.id), x: c.x, z: c.z });
    farTriangles += cost; regionCost[c.region] += cost;
  }
  // The 15 m outer mesh can sit below the continuous height field between vertices.
  // Correct only accepted foundations after planning: the random choices, horizontal layout,
  // number of storeys and every existing storey/roof top remain exactly as planned.
  const surface = makeFarTerrainSampler(plan, far), metadata = new Map(data.pieces.map((p) => [p.id, p]));
  const houseById = new Map(houses.map((h) => [h.id, h]));
  for (const p of pieces) {
    if (!(p.category === 'facade' && p.level === 0) && p.category !== 'retaining') continue;
    const meta = metadata.get(p.key), burial = p.category === 'facade' ? 0.18 : 0.12;
    // Cover the declared envelope and rounding in its actual instance scale. This also
    // covers both LOD bodies, whose walls sit slightly inside that envelope.
    const w = Math.max(p.size[0], meta.size[0] * p.scale[0]), d = Math.max(p.size[2], meta.size[2] * p.scale[2]);
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u, v]) => offset(p.x, p.z, p.ry, u * w / 2, v * d / 2));
    const y = round(Math.min(p.y, surface.minimum(corners) - burial)), extension = round(p.y - y);
    if (extension <= 0) continue;
    p.y = y; p.size[1] = round(p.size[1] + extension); p.scale[1] += extension / meta.size[1];
    if (p.category === 'facade') houseById.get(p.house).y = y;
  }
  return { version: 1, seed: plan.seed, houses, pieces, clusters, farTriangles, regionCost, limits: { ...limits } };
}
