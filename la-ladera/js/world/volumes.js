// The volume each building takes up, for whatever is strung through the air (poles.js cables, washing lines, hill.js): the shell's outline from its foundation up to the roof, with the roof's own shape
// (the parapet of a terrace and the stair-head box on it, the mono-pitch of a corrugated sheet, the gable of a tile roof, the open top floor of an unfinished house). Pure reading of the building plans
// (ctx.buildings): it builds nothing.
//   const vol = volumesOf(ctx);  vol.through(a, c, sag)  ->  [{ id, depth, at }]  the buildings the cable a -> c (a parabola with `sag` m of droop) goes through
import { pointInPoly, segDist } from './geom.js';
import { makeRoofModel } from '../arch/shellroof.js';
import { CASETA_H } from '../arch/roof.js';

export const CLEAR = 0.02;      // a cable may stand this close to a wall: its ends are fixed 0.05 m off a facade (poles.js)
export const OPEN_TOP = 2.6;    // an open top floor stands this high over its deck: the brick pretil is 1.2 m, the columns and the beam across the front 2.55 m (arch/shellroof.js unfinishedTop); rebar is not counted
const STEP = 0.2;               // m along a cable between the points it is tested at

/** How far inside the outline (m; 0 outside it). */
function depthIn(poly, x, z) {
  if (!pointInPoly(poly, x, z)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Height (world y) of the roof over a point of a building's plan. */
function roofTop(v, x, z) {
  const { bp, rm } = v, fr = bp.frame, S = bp.shell, [lx, , lz] = fr.toLocal(x, 0, z);
  if (rm.style === 'terrace') {
    const cas = S.roofLayer?.caseta, q = cas?.outer;
    const onCaseta = q && lx >= q.x0 - 0.1 && lx <= q.x1 + 0.1 && lz >= q.z0 - 0.1 && lz <= q.z1 + 0.1;
    return bp.roof.y + (onCaseta ? CASETA_H + 0.21 : rm.ph);
  }
  if (rm.mono) return fr.toWorld(lx, rm.mono.y(rm.mono.axis === 'z' ? lz : lx), lz)[1] + 0.07;
  if (rm.gable) return fr.toWorld(lx, rm.gable.h(rm.gable.ridgeZ ? lx : lz), lz)[1];
  return bp.roof.y + (S.openTop ? OPEN_TOP : 0.3);                                  // unfinished: a closed slab, or the open top floor (its pretil, columns and beam)
}

export function buildingVolumes(ctx) {
  const list = [];
  for (const bp of ctx.buildings?.values?.() ?? []) {
    const poly = bp.footprint;
    if (!poly?.length || !bp.shell) continue;
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    list.push({ id: bp.id, bp, poly, x0: Math.min(...xs) - CLEAR, x1: Math.max(...xs) + CLEAR, z0: Math.min(...zs) - CLEAR, z1: Math.max(...zs) + CLEAR, rm: makeRoofModel({ S: bp.shell, bp }) });
  }
  const point = (a, c, sag, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (c[2] - a[2]) * t];     // poles.js wire(): the parabola it draws

  /** The buildings a cable goes through, with how deep (m inside the outline) and where. A cable that ends 0.05 m off a facade is outside; one that clips a corner or runs under a roof is not. */
  function through(a, c, sag = 0) {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), n = Math.max(2, Math.ceil(len / STEP));
    const x0 = Math.min(a[0], c[0]), x1 = Math.max(a[0], c[0]), z0 = Math.min(a[2], c[2]), z1 = Math.max(a[2], c[2]), hits = [];
    for (const v of list) {
      if (v.x1 < x0 || v.x0 > x1 || v.z1 < z0 || v.z0 > z1) continue;
      let best = null;
      for (let i = 0; i <= n; i++) {
        const [x, y, z] = point(a, c, sag, i / n);
        if (x < v.x0 || x > v.x1 || z < v.z0 || z > v.z1 || y < v.bp.bounds.y0) continue;
        const d = depthIn(v.poly, x, z) || (Math.min(...v.poly.map((p, k) => segDist(x, z, p, v.poly[(k + 1) % v.poly.length]))) < CLEAR ? CLEAR : 0);
        if (d > 0 && y < roofTop(v, x, z) && (!best || d > best.depth)) best = { id: v.id, depth: +d.toFixed(2), at: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)] };
      }
      if (best) hits.push(best);
    }
    return hits;
  }
  return { list, through, roofTop: (id, x, z) => roofTop(list.find((v) => v.id === id), x, z) };
}

const cache = new WeakMap();
/** The volumes of ctx's buildings, built once for the buildings there are (poles.js asks for every cable it strings). A ctx without buildings has none: everything is in the clear. */
export function volumesOf(ctx) {
  const map = ctx.buildings ?? null, n = map?.size ?? 0, hit = cache.get(ctx);
  if (hit && hit.map === map && hit.n === n) return hit.vol;
  const vol = buildingVolumes(ctx);
  cache.set(ctx, { map, n, vol });
  return vol;
}
