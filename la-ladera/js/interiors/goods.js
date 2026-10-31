// Shelf stock is planned separately from floor furniture: it never changes walkability, seats, or room furnishing RNG.
// The two imported modules are DATA. Change an assortment there to restock a shop; no fit-out/render branch is needed.
import { CATALOG } from './catalog.js';
import { GOODS_CATALOG } from './goods-catalog.js';
import { GOODS_ASSORTMENTS, GOODS_FIXTURES } from './goods-assortments.js';
import { hashStr } from '../core/rng.js';

export const GOODS_LOD = Object.freeze({ near: 8, cull: 22 });
const EPS = 1e-7;
const round = (v) => +v.toFixed(6);

/** Actual supporting planes inside a fixture, in its local coordinates (metres, +z = customer side). */
export function resolveGoodsSurfaces(fixture, spec = GOODS_FIXTURES[fixture.name]) {
  if (!spec) return [];
  const c = CATALOG[fixture.name] ?? fixture.c;
  if (!c) return [];
  const [W, H, D] = c.size;
  if (spec.surfaces) return spec.surfaces.map((s) => ({ x: 0, z: 0, ...s }));
  const plane = (y, w, d, h, z = 0) => ({ x: 0, z, y, w, d, h });
  switch (spec.layout) {
    case 'shelf': {
      const rows = Math.max(3, Math.round(H / 0.4)), step = (H - 0.09) / rows;
      return Array.from({ length: rows }, (_, k) => plane(0.09 + step * k, W - 0.14, D - 0.07, step - 0.045, 0.008));
    }
    case 'rack': {
      const rows = Math.max(3, Math.round(H / 0.4)), step = (H - 0.12) / rows;
      return Array.from({ length: rows }, (_, k) => plane(0.105 + step * k, W - 0.12, D - 0.08, step - 0.04));
    }
    case 'chips': return Array.from({ length: 6 }, (_, k) => plane(0.25 + k * 0.24, W - 0.1, 0.12, 0.225, -D / 2 + 0.09));
    case 'case': return [plane(0.636, W - 0.14, D - 0.34, H - 0.666, 0.1)];
    case 'crate': return [plane(H > 0.5 ? H - 0.02 : H - 0.1, W - 0.06, D - 0.06, 0.32)];
    case 'fruitstand': return [plane(0.54, W - 0.16, D - 0.22, 0.21, -0.06), plane(0.82, W - 0.16, D - 0.5, 0.26, -0.15)];
    case 'round': return [{ ...plane(H, W - 0.1, D - 0.1, 0.32), radius: Math.min(W, D) / 2 - 0.04 }];
    case 'top': return [plane(H + (c.topAdd ?? 0) + (spec.topOffset ?? (c.arch === 'counter' ? 0.02 : 0)), W - 0.1, D - 0.1, spec.headroom ?? 0.45)];
    default: return [];
  }
}

function localObstacle(fixture, item) {
  const a = fixture.ry ?? 0, cs = Math.cos(a), sn = Math.sin(a), dx = item.x - fixture.x, dz = item.z - fixture.z;
  const def = CATALOG[item.name], w = item.w ?? def?.size[0] ?? 0, d = item.d ?? def?.size[2] ?? 0;
  const rel = (item.ry ?? 0) - a, ca = Math.abs(Math.cos(rel)), sa = Math.abs(Math.sin(rel));
  return { x: dx * cs - dz * sn, z: dx * sn + dz * cs, y: (item.y ?? 0) - (fixture.y ?? 0),
    w: w * ca + d * sa, d: w * sa + d * ca, h: item.h ?? def?.size[1] ?? 0 };
}

function blocked(x, y, z, w, h, d, obstacles, gap) {
  return obstacles.some((q) => y < q.y + q.h - EPS && y + h > q.y + EPS &&
    Math.abs(x - q.x) < (w + q.w) / 2 + gap - EPS && Math.abs(z - q.z) < (d + q.d) / 2 + gap - EPS);
}

/**
 * Deterministic shelf packing, with no dependency on GLB load timing. Goods stand at their declared metre scale; an item which
 * does not fit is omitted rather than stretched. Existing top props (till, telephone, bread basket...) reserve their full volume.
 * `catalog` and `assortments` are injectable data for tools/tests. The fixture itself stays in bp.furniture; returned records
 * live in bp.goods and have no colliders. Rendering decides atomically whether this fixture can replace its procedural stock.
 */
export function planGoodsForFixture(fixture, shopType, obstacles = [], catalog = GOODS_CATALOG, assortments = GOODS_ASSORTMENTS) {
  const pool = assortments[shopType]?.[fixture.name], spec = GOODS_FIXTURES[fixture.name];
  if (!Array.isArray(pool) || !pool.length || !spec) return [];
  const surfaces = resolveGoodsSurfaces(fixture, spec), out = [];
  const obstaclesLocal = [...(spec.obstacles ?? []).map((q) => ({ ...q })),
    ...obstacles.filter((o) => o.parent === fixture.id).map((o) => localObstacle(fixture, o))];
  const seed = hashStr(String(fixture.id) + ':' + shopType) >>> 0, gap = spec.gap ?? 0.014;
  const limit = spec.maxItems ?? 36, angle = fixture.ry ?? 0, cs = Math.cos(angle), sn = Math.sin(angle);
  for (let si = 0; si < surfaces.length && out.length < limit; si++) {
    const s = surfaces[si];
    if (!(s.w > 0 && s.d > 0 && s.h > 0)) continue;
    const rows = spec.rows ?? 1, rowDepth = s.d / rows, usableDepth = rowDepth - (rows > 1 ? gap : 0);
    const fits = pool.flatMap((key) => {
      const c = catalog[key], size = c?.size, fp = c?.footprint;
      if (!(size?.length === 3 && fp?.length === 2 && [...size, ...fp].every((v) => Number.isFinite(v) && v > 0) && size[1] <= s.h + EPS)) return [];
      if (fp[0] <= s.w + EPS && fp[1] <= usableDepth + EPS) return [{ key, w: fp[0], d: fp[1], h: size[1], turn: 0 }];
      // Deep articles (shoes, folded newspapers, baguettes) can be displayed side-on on a shallow shelf.
      if (fp[1] <= s.w + EPS && fp[0] <= usableDepth + EPS) return [{ key, w: fp[1], d: fp[0], h: size[1], turn: Math.PI / 2 }];
      return [];
    });
    if (!fits.length) continue;
    let serial = 0;
    for (let row = 0; row < rows && out.length < limit; row++) {
      let left = s.x - s.w / 2;
      const z = s.z + s.d / 2 - rowDepth * (row + 0.5);
      for (let tries = 0; tries < 240 && left < s.x + s.w / 2 && out.length < limit; tries++) {
        let placed = false;
        const start = (seed + si * 7 + row * 3 + serial) % fits.length;
        for (let ki = 0; ki < fits.length; ki++) {
          const { key, w, d, h, turn } = fits[(start + ki) % fits.length];
          const x = left + w / 2;
          if (d > rowDepth - (rows > 1 ? gap : 0) + EPS || x + w / 2 > s.x + s.w / 2 + EPS) continue;
          if (s.radius && Math.hypot(Math.abs(x - s.x) + w / 2, Math.abs(z - s.z) + d / 2) > s.radius + EPS) continue;
          if (blocked(x, s.y, z, w, h, d, obstaclesLocal, gap)) continue;
          const record = {
            id: fixture.id + '.goods.' + out.length, name: key, parent: fixture.id, room: fixture.room, kind: 'stock',
            x: round((fixture.x ?? 0) + x * cs + z * sn), y: round((fixture.y ?? 0) + s.y), z: round((fixture.z ?? 0) - x * sn + z * cs),
            ry: angle + turn, w, h, d, block: false, surface: si, local: [round(x), round(s.y), round(z)], localRotation: turn,
          };
          out.push(record); obstaclesLocal.push({ x, y: s.y, z, w, h, d });
          left += w + gap; serial++; placed = true; break;
        }
        if (!placed) left += 0.025; // scan past a till/basket without squeezing or moving it
      }
    }
  }
  return out;
}

/** Rebuild bp.goods from the finished furniture plan, after layout healing removed any unreachable fixtures. */
export function planShopGoods(bp) {
  const records = bp.furniture ?? [], goods = [];
  for (const fixture of records) {
    const info = bp.interior?.rooms?.[fixture.room];
    const type = info ? info.shopType : bp.interior?.shopType ?? bp.lot?.shop;
    if (type) goods.push(...planGoodsForFixture(fixture, type, records));
  }
  bp.goods = goods;
  return goods;
}

/** True only when both nodes contain usable meshes; a manifest entry alone is never evidence of an integrated asset. */
export function goodsAssetReady(ctx, key) {
  const entry = ctx.assets?.meta?.(key), scene = entry && ctx.assets?.loaded?.get(entry.glb)?.scene;
  if (!entry?.lodNode || !scene) return false;
  const usable = (name) => {
    const node = scene.getObjectByName(name);
    if (!node) return false;
    let count = 0, valid = true;
    node.traverse((m) => {
      if (!m.isMesh) return;
      const position = m.geometry?.attributes?.position, index = m.geometry?.index;
      const material = Array.isArray(m.material) ? m.material[0] : m.material;
      const length = index ? index.count : position?.count;
      if (!position?.count || position.itemSize !== 3 || !Number.isInteger(length) || length < 3 || length % 3 ||
          !['goods_surface', 'goods_label'].includes(material?.name)) { valid = false; return; }
      for (let i = 0; i < position.count; i++) {
        if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) { valid = false; return; }
      }
      if (index) for (let i = 0; i < index.count; i++) {
        const v = index.getX(i);
        if (!Number.isInteger(v) || v < 0 || v >= position.count) { valid = false; return; }
      }
      count++;
    });
    return valid && count > 0;
  };
  return usable(entry.node ?? key) && usable(entry.lodNode);
}

/** A fixture is replaced as a whole. Partial/failed loads leave its original procedural contents visible. */
export function stockedFixtureIds(ctx, goods) {
  const byFixture = new Map(), ready = new Map();
  if (ctx.goodsAssets?.atlasReady === false) return new Set();
  for (const record of goods) {
    if (!ready.has(record.name)) ready.set(record.name, goodsAssetReady(ctx, record.name));
    byFixture.set(record.parent, (byFixture.get(record.parent) ?? true) && ready.get(record.name));
  }
  return new Set([...byFixture].filter(([, ok]) => ok).map(([id]) => id));
}
