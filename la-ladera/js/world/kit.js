// Shared toolkit for the props modules: 50 m chunked builders (so frustum culling works), colliders, placement and rng helpers.
import { wallsRect } from '../core/physics.js';
import { HALF } from './field.js';
import { OCC } from './occupancy.js';

const CH = 50;
/** the usual "do not build here" mask: street, plaza, stairs, a building, steep ground, where people walk, a doorstep */
export const BLOCK = OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.STEEP | OCC.NAV | OCC.DOOR;

export function makeKit(ctx, plan, occ) {
  const used = new Set();
  const H = plan.heightAt;
  const kit = {
    ctx, plan, occ, H, atlas: null,
    rng: (label) => ctx.rng.fork('props:' + label),
    /** MeshBuilder of group `props.<kind>.<i>.<j>` for the 50 m cell containing (x,z). o = { cast:false } for small clutter. */
    b(kind, x, z, o) {
      const i = Math.max(0, Math.min(3, Math.floor((x + HALF) / CH))), j = Math.max(0, Math.min(3, Math.floor((z + HALF) / CH)));
      const id = `props.${kind}.${i}.${j}`;
      used.add(id);
      return ctx.batch.builder(id, o);
    },
    /** one builder for a whole kind (few, small things: lamps, signs) */
    one(kind, o) { const id = `props.${kind}`; used.add(id); return ctx.batch.builder(id, o); },
    flush() { for (const id of used) ctx.batch.flush(id); used.clear(); },
    /** round post collider (trees, poles, bollards) */
    post(x, z, r, h = 3, y = H(x, z)) {
      ctx.physics.addWall({ x1: x, z1: z, x2: x, z2: z, t: r, y0: y - 0.4, y1: y + h, id: 'prop' });
    },
    /** rectangular collider (carts, benches, cars) */
    rect(x, z, w, d, ry, h = 1.2, y = H(x, z), t = 0.05) {
      for (const w2 of wallsRect(x, z, w, d, ry, y - 0.4, y + h, t, { id: 'prop' })) ctx.physics.addWall(w2);
    },
    /** a segment collider (fences, rails) */
    seg(x1, z1, x2, z2, h = 1.1, t = 0.06, y = Math.min(H(x1, z1), H(x2, z2))) {
      ctx.physics.addWall({ x1, z1, x2, z2, t, y0: y - 0.4, y1: y + h, id: 'prop' });
    },
    /**
     * A free spot near (cx,cz): rings of 0.5 m steps, nearest first. Returns [x, z] or null.
     * o: { r: clear radius (0.5), maxR (12), mask: occupancy bits that must be clear (BLOCK), slope: max gradient (0.45),
     *      nav: min distance to a nav edge (0 = ignore), gap: min distance to a taken disc (= r), ok: (x, z) => bool }
     */
    spot(cx, cz, o = {}) {
      const r = o.r ?? 0.5, maxR = o.maxR ?? 12, mask = o.mask ?? BLOCK, gap = o.gap ?? r, smax = o.slope ?? 0.45;
      for (let rad = 0; rad <= maxR + 1e-6; rad += 0.5) {
        const n = rad === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * rad) / 0.5));
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + rad * 0.37, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
          if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
          if (!occ.clear(x, z, r, mask) || occ.overlaps(x, z, gap) || occ.slope(x, z) > smax) continue;
          if (o.nav && occ.navDist(x, z) < o.nav) continue;
          if (o.ok && !o.ok(x, z)) continue;
          return [x, z];
        }
      }
      return null;
    },
    /** true when a w x d rectangle (centre x,z, rotated ry about Y) is free: every 0.5 m sample passes `mask` and the slope limit */
    rectFree(x, z, w, d, ry, o = {}) {
      const mask = o.mask ?? BLOCK, smax = o.slope ?? 0.5, c = Math.cos(ry), s = Math.sin(ry);
      for (let u = -w / 2; u <= w / 2 + 1e-6; u += 0.5) for (let v = -d / 2; v <= d / 2 + 1e-6; v += 0.5) {
        const px = x + u * c + v * s, pz = z - u * s + v * c;
        if (!occ.clear(px, pz, 0, mask) || occ.slope(px, pz) > smax) return false;
      }
      return !occ.overlaps(x, z, Math.hypot(w, d) / 2 * (o.gapK ?? 0.7));
    },
  };
  return kit;
}

/** x east, z south: local frame of an object at (x,z) rotated ry (front = +z local). */
export function localToWorld(x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
}
