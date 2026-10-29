// Retaining walls, derived from the height field itself: along the edge of every street, stair, plaza and lot pad the ground
// beside the structure is compared with the structure's own level; where they differ by more than ~0.3 m the transition band
// (a steep ramp in plan.heightAt) is hidden inside a wall "box" of the band's thickness: its face looks at the lower ground,
// its cap sits at the upper level. Fill edges (a drop beside the structure) also get an invisible guard collider.
// Group world.walls. Pure function of plan.heightAt, so it follows the plan whatever the layout does.
import { footprint, pointInPoly } from './geom.js';
import { tangents, quadOut } from './mk.js';
import { BAND, PAD_BAND, PLAZA_BAND } from './plan.js';

const THRESH = 0.3;       // below this the band is just a gentle ramp
const GUARD_DROP = 0.7;   // drops above this get a collider along the edge

export function buildRetaining(ctx, plan) {
  const H = plan.heightAt, b = ctx.batch.builder('world.walls'), phys = ctx.physics, rnd = ctx.rng.fork('world:walls');
  const lotFps = plan.lots.map((l) => footprint(l, 0.05));
  const stats = { runs: 0, metres: 0, guards: 0 }, runsOut = [];
  let src = 'street';                                                    // which kind of edge the current scan walks: street | stair | plaza:<id> | pad

  const MATS_TALL = ['stone_wall', 'stone_wall', 'concrete_formwork'];
  const MATS = ['stone_wall', 'concrete_formwork', 'brick_clay_hollow', 'concrete_formwork', 'stone_wall', 'plaster_rough#c9b79a'];

  const run = (S, sign, B) => {
    const tall = S.reduce((m, s) => Math.max(m, Math.abs(s.outer - s.inner)), 0);
    const mat = rnd.pick(tall > 2.2 ? MATS_TALL : MATS), k = 0.9 + rnd.next() * 0.2, col = [k, k, k];
    runsOut.push({ S, sign, B, tall, src });
    for (let i = 0; i + 1 < S.length; i++) {
      const p = S[i], q = S[i + 1];
      const f = sign > 0 ? 0 : B;                                   // face line offset from the edge
      const top = (s) => (sign > 0 ? s.outer : s.inner) + 0.02, bot = (s) => (sign > 0 ? s.inner : s.outer) - 0.25;
      const F = (s, y) => [s.x + s.nx * f, y, s.z + s.nz * f], E = (s, y) => [s.x, y, s.z], G = (s, y) => [s.x + s.nx * B, y, s.z + s.nz * B];
      const ctr = [(p.x + q.x) / 2 + (p.nx + q.nx) * B / 4, (top(p) + top(q) + bot(p) + bot(q)) / 4, (p.z + q.z) / 2 + (p.nz + q.nz) * B / 4];
      quadOut(b, mat, F(p, bot(p)), F(q, bot(q)), F(q, top(q)), F(p, top(p)), ctr, { col });
      quadOut(b, 'concrete_bare', E(p, top(p)), E(q, top(q)), G(q, top(q)), G(p, top(p)), [ctr[0], ctr[1] - 5, ctr[2]], { col });
      if (sign < 0 && p.inner - p.outer > GUARD_DROP && q.inner - q.outer > GUARD_DROP) {
        phys.addWall({ x1: p.x + p.nx * 0.1, z1: p.z + p.nz * 0.1, x2: q.x + q.nx * 0.1, z2: q.z + q.nz * 0.1, t: 0.1, y0: Math.min(p.outer, q.outer) - 1, y1: Math.max(p.inner, q.inner) + 1.4, id: 'guard' });
        stats.guards++;
      }
      stats.metres += Math.hypot(q.x - p.x, q.z - p.z);
    }
    stats.runs++;
  };

  /** pts = [[x,z,nx,nz],...] along one boundary (n = outward unit normal). */
  const scan = (pts, B, skipFn) => {
    const S = pts.map(([x, z, nx, nz]) => ({ x, z, nx, nz, inner: H(x - nx * 0.12, z - nz * 0.12), outer: H(x + nx * (B + 0.18), z + nz * (B + 0.18)) }));
    const act = S.map((s) => Math.abs(s.outer - s.inner) >= THRESH && !(skipFn && skipFn(s)));
    const sg = (s) => (s.outer > s.inner ? 1 : -1);
    for (let i = 0; i < S.length;) {
      if (!act[i]) { i++; continue; }
      const sign = sg(S[i]); let j = i;
      while (j + 1 < S.length && act[j + 1] && sg(S[j + 1]) === sign) j++;
      run(S.slice(Math.max(0, i - 1), Math.min(S.length, j + 2)), sign, B);
      i = j + 1;
    }
  };

  // ---- street and stair sides, and open ends
  for (const st of plan.streets) {
    const d = st._d, hw = st.width / 2, B = BAND[st.kind] ?? 0.5, T = tangents(d.pts);
    src = st.kind === 'stair' ? 'stair' : 'street';
    for (const side of [-1, 1]) {
      scan(d.pts.map((p, k) => { const nx = -T[k][1] * side, nz = T[k][0] * side; return [p[0] + nx * hw, p[1] + nz * hw, nx, nz]; }), B);
    }
    for (const end of [0, 1]) {
      const k = end === 0 ? 0 : d.pts.length - 1, p = d.pts[k], sgn = end === 0 ? -1 : 1, tx = T[k][0] * sgn, tz = T[k][1] * sgn;
      if (plan.streets.some((o) => o !== st && o.kind !== 'stair' && st.kind !== 'stair' && distToStreet(o, p) <= o.width / 2 + 0.6)) continue;
      if (plan.plazas.some((pl) => pointInPoly(pl.poly, p[0] + tx * 0.5, p[1] + tz * 0.5))) continue;
      const pts = []; for (let u = -hw; u <= hw + 1e-6; u += 0.5) pts.push([p[0] - T[k][1] * u, p[1] + T[k][0] * u, tx, tz]);
      scan(pts, B);
    }
  }
  // ---- plazas
  for (const pl of plan.plazas) { src = 'plaza:' + pl.id; scan_poly(pl.poly, PLAZA_BAND, scan); }
  // ---- lot pads (the +0.3 m margin of the plinth rule); no wall where another lot is
  src = 'pad';
  plan.lots.forEach((l, i) => {
    scan_poly(footprint(l, 0.3), PAD_BAND, scan, (s) => lotFps.some((f, j) => j !== i && (pointInPoly(f, s.x, s.z) || pointInPoly(f, s.x + s.nx * 0.8, s.z + s.nz * 0.8))));
  });
  ctx.batch.flush('world.walls');
  if (ctx.world) { ctx.world.walls = stats; ctx.world.wallRuns = runsOut; }
}

function distToStreet(o, p) {
  let m = Infinity;
  for (const q of o._d.pts) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < m) m = d; }
  return m;
}

/** Sample the edges of a convex polygon (outward normals), one scan per edge. */
function scan_poly(poly, B, scan, skipFn) {
  let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } cx /= poly.length; cz /= poly.length;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(l / 0.7));
    let nx = -(c[1] - a[1]) / l, nz = (c[0] - a[0]) / l;
    if (nx * ((a[0] + c[0]) / 2 - cx) + nz * ((a[1] + c[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    const pts = []; for (let k = 0; k <= n; k++) pts.push([a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n, nx, nz]);
    scan(pts, B, skipFn);
  }
}
