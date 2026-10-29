// Shared toolkit for the props modules: 50 m chunked builders (so frustum culling works), colliders, placement and rng helpers.
import { wallsRect } from '../core/physics.js';
import { HALF } from './field.js';

const CH = 50;

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
  };
  return kit;
}

/** x east, z south: local frame of an object at (x,z) rotated ry (front = +z local). */
export function localToWorld(x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
}
