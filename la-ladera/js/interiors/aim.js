// INTERIORS (A3): "is the player looking at this box?" for every target the interiors register (stories.js seats and objects, containers.js drawers and
// the things inside them). The kernel (core/interact.js) scores by distance to a stand point, so something behind the player's shoulder used to beat the
// thing in front of them (R4-009); every target here also passes a ray test of the view against its OWN box. Called every frame for every registered
// target of the world: no allocation, and anything beyond 7 m is left to the kernel's radius test. Headless tools have no view (always true).

/** Does the ray (origin o, direction v, in the box's own frame) hit the box of half extents h within 12 m? (slab test) */
export function rayHitsBox(ox, oy, oz, vx, vy, vz, hx, hy, hz) {
  let t0 = 0, t1 = 12;
  for (let k = 0; k < 3; k++) {
    const o = k === 0 ? ox : k === 1 ? oy : oz, v = k === 0 ? vx : k === 1 ? vy : vz, h = k === 0 ? hx : k === 1 ? hy : hz;
    if (Math.abs(v) < 1e-9) { if (Math.abs(o) > h) return false; continue; }
    let s = (-h - o) / v, e = (h - o) / v; if (s > e) { const q = s; s = e; e = q; }
    if (s > t0) t0 = s; if (e < t1) t1 = e; if (t0 > t1) return false;
  }
  return true;
}

/**
 * A view test for the box centred at building-local (lx, ly, lz) whose x axis is the building-local unit vector u = [ux, uz] (its z axis is
 * [uz, -ux] rotated: the item convention x = (cos, -sin), z = (sin, cos)); half extents (hx, hy, hz). `fr` = bp.frame. Returns (ctx) => boolean.
 */
export function boxAim(fr, lx, ly, lz, u, v, hx, hy, hz) {
  const c = fr.toWorld(lx, ly, lz), p = fr.toWorld(lx, 0, lz), a = fr.toWorld(lx + u[0], 0, lz + u[1]), b = fr.toWorld(lx + v[0], 0, lz + v[1]);
  const ax = a[0] - p[0], az = a[2] - p[2], bx = b[0] - p[0], bz = b[2] - p[2], cx = c[0], cy = c[1], cz = c[2];
  return (ctx) => {
    const e = ctx.player?.eye, d = ctx.player?._dir; if (!e || !d) return true;
    const dx = e.x - cx, dz = e.z - cz; if (dx * dx + dz * dz > 49) return true;
    return rayHitsBox(dx * ax + dz * az, e.y - cy, dx * bx + dz * bz, d.x * ax + d.z * az, d.y, d.x * bx + d.z * bz, hx, hy, hz);
  };
}
