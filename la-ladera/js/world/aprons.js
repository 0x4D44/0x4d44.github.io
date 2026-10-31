// Frontage aprons (R1-D11: "a gravel strip between the sidewalk and the facades"): the planner stands every facade 0.60 m (up to 1.07 m on the bends of the road) beyond the
// back edge of the pavement, and the bare earth of the lot pad showed in that gap along every shopfront. An apron is the paving that closes it: one strip per lot that fronts
// a street, from the back edge of the pavement to the lot's front line, with the same height and the same texture coordinates as the sidewalk, so the slab pattern runs on
// without a seam. Pure data (no THREE): the cells are drawn by surfaces.js, and the tests read them straight from the plan.
import { project, pointAt } from './geom.js';
import { tangents } from './mk.js';

/** tuck: how far the apron runs under the facade (the wall hides it), step: longest cell along the street, skirt: how deep the side faces go (below the earth next to them). */
export const APRON = { tuck: 0.04, step: 2.5, skirt: 0.4 };

/**
 * One apron per lot that fronts a street with a surface of its own (not a stair, not bare earth):
 *   { lot, street, side: +1 right of travel | -1, hw: half width of the street, cells: [{ s0, s1, a0, a1, b0, b1, o0, o1 }] }
 * a = the cell's corners on the street's back edge of pavement (offset hw from the axis), b = on the lot's front line, o = the lateral distance of b from the axis, s = arc length.
 * A cell whose stretch of street is a mouth, where a side street opens and the sidewalk is dropped, is left out with it.
 */
export function frontageAprons(plan) {
  const byId = new Map(plan.streets.map((s) => [s.id, s])), tan = new Map(), out = [];
  for (const lot of plan.lots) {
    const st = byId.get(lot.front);
    if (!st || st.kind === 'stair' || st.surface === 'dirt') continue;
    const d = st._d, hw = st.width / 2, c = Math.cos(lot.rotY), sn = Math.sin(lot.rotY), lz = lot.d / 2 - APRON.tuck;
    const at = (lx) => [lot.x + lx * c + lz * sn, lot.z - lx * sn + lz * c];
    const A = at(-lot.w / 2), B = at(lot.w / 2), pa = project(d.pts, d.cum, A[0], A[1]), pb = project(d.pts, d.cum, B[0], B[1]);
    if (pa.side !== pb.side || Math.abs(pb.s - pa.s) < 0.5) continue;
    const side = pa.side, sa = pa.s, sb = pb.s, lo = Math.min(sa, sb), hi = Math.max(sa, sb);
    if (!tan.has(st.id)) tan.set(st.id, tangents(d.pts));
    const T = tan.get(st.id), joiners = plan._joiners?.get(st.id) ?? [];
    // stations: both ends of the lot's front, every vertex of the street between them, and enough more that no cell is longer than APRON.step
    const stops = [lo];
    for (let k = 1; k < d.cum.length - 1; k++) if (d.cum[k] > lo + 0.2 && d.cum[k] < hi - 0.2) stops.push(d.cum[k]);
    stops.push(hi);
    const ss = [stops[0]];
    for (let i = 1; i < stops.length; i++) {
      const n = Math.ceil((stops[i] - stops[i - 1]) / APRON.step);
      for (let j = 1; j <= n; j++) ss.push(stops[i - 1] + ((stops[i] - stops[i - 1]) * j) / n);
    }
    const station = (s) => {
      const k = d.cum.indexOf(s), p = pointAt(d.pts, d.cum, s), tx = k > 0 && k < d.cum.length - 1 ? T[k][0] : p.tx, tz = k > 0 && k < d.cum.length - 1 ? T[k][1] : p.tz;
      const u = (s - sa) / (sb - sa), f = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u];
      return { s, a: [p.x - tz * side * hw, p.z + tx * side * hw], b: f, o: project(d.pts, d.cum, f[0], f[1]).d };
    };
    const cells = [];
    for (let i = 0; i + 1 < ss.length; i++) {
      const p = station(ss[i]), q = station(ss[i + 1]);
      if (p.o < hw + 0.05 || q.o < hw + 0.05) continue;                                   // a facade on the pavement itself: nothing to close
      const m = pointAt(d.pts, d.cum, (p.s + q.s) / 2);                                    // the sidewalk is dropped where a side street opens (surfaces.js inMouth): its apron goes with it
      if (joiners.some((j) => project(j._d.pts, j._d.cum, m.x, m.z).d <= j.width / 2 + 0.5)) continue;
      cells.push({ s0: p.s, s1: q.s, a0: p.a, a1: q.a, b0: p.b, b1: q.b, o0: p.o, o1: q.o });
    }
    if (cells.length) out.push({ lot: lot.id, street: st.id, side, hw, cells });
  }
  return out;
}
