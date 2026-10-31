// Street, sidewalk, kerb, road marking and plaza surfaces (group world.streets / world.plazas).
// Everything sits a few millimetres above plan.heightAt (the terrain mesh is carved 7 cm below) so nothing z-fights; a street that
// joins a higher-ranked one conforms to that street's surface where the two overlap.
import { project, clamp, pointAt } from './geom.js';
import { ribbon, faceStrip, tangents, arcs, quadOut } from './mk.js';
import { SIDEWALK } from './plan.js';
import { frontageAprons, APRON } from './aprons.js';

const RANK = { path: 0, alley: 1, street: 2, road: 3 };
const DY = { path: 0.008, alley: 0.012, street: 0.016, road: 0.020 };
const SURF = { asphalt: 'asphalt', concrete: 'street_concrete', cobble: 'cobble_stone', dirt: 'dirt_path', stairs: 'street_concrete' };

export function yDense(d, s) {
  const { cum, y } = d, L = cum[cum.length - 1];
  s = clamp(s, 0, L);
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  const seg = cum[lo] - cum[lo - 1] || 1, u = (s - cum[lo - 1]) / seg;
  return y[lo - 1] + (y[lo] - y[lo - 1]) * u;
}

/** Height of the visible surface of street `st` at (x,z): follows a higher-ranked street where it overlaps its carriageway. */
function surfaceY(plan, st, x, z, base) {
  for (const o of plan.streets) {
    if (o === st || o.kind === 'stair' || RANK[o.kind] <= RANK[st.kind] || x < o._bb[0] - 1 || x > o._bb[2] + 1 || z < o._bb[1] - 1 || z > o._bb[3] + 1) continue;
    const pr = project(o._d.pts, o._d.cum, x, z);
    if (pr.d <= o.width / 2) return yDense(o._d, pr.s) + DY[o.kind] - 0.004;
  }
  return base;
}

export function buildSurfaces(ctx, plan) {
  const b = ctx.batch.builder('world.streets', { cast: false });
  for (const st of plan.streets) {
    if (st.kind === 'stair') continue;
    const d = st._d, mat = SURF[st.surface] ?? 'street_concrete', hw = st.width / 2, dy = DY[st.kind];
    const T = tangents(d.pts), joiners = plan._joiners.get(st.id) ?? [];
    const inMouth = (x, z, m = 0.5) => joiners.some((j) => project(j._d.pts, j._d.cum, x, z).d <= j.width / 2 + m);
    // per-edge heights so the ribbon can conform at junctions: one y per (vertex, lateral offset)
    const strip = (offL, offR, material, lift, skipMouth) => {
      const S = arcs(d.pts), n = d.pts.length;
      const P = (k, off) => {
        const x = d.pts[k][0] - T[k][1] * off, z = d.pts[k][1] + T[k][0] * off;
        return [x, surfaceY(plan, st, x, z, d.y[k] + dy + lift), z];
      };
      for (let k = 0; k + 1 < n; k++) {
        if (skipMouth) { const mx = (d.pts[k][0] + d.pts[k + 1][0]) / 2, mz = (d.pts[k][1] + d.pts[k + 1][1]) / 2; if (inMouth(mx, mz, 0.5)) continue; }
        const a = P(k, offL), c = P(k, offR), e = P(k + 1, offR), f = P(k + 1, offL);
        b.quad(material, a, c, e, f, { uv: [offL, S[k], offR, S[k], offR, S[k + 1], offL, S[k + 1]] });
      }
    };
    if (st.sidewalk) {
      const c = hw - SIDEWALK.w;
      strip(-c, c, mat, 0, false);
      strip(-hw, -c, 'sidewalk_slab', SIDEWALK.lift, true);
      strip(c, hw, 'sidewalk_slab', SIDEWALK.lift, true);
      // kerb faces (look at the carriageway)
      const S = arcs(d.pts);
      for (const side of [-1, 1]) {
        const off = side * c;
        for (let k = 0; k + 1 < d.pts.length; k++) {
          const mx = (d.pts[k][0] + d.pts[k + 1][0]) / 2, mz = (d.pts[k][1] + d.pts[k + 1][1]) / 2;
          if (inMouth(mx, mz, 0.5)) continue;
          const q = (kk, y) => [d.pts[kk][0] - T[kk][1] * off, y, d.pts[kk][1] + T[kk][0] * off];
          const y0 = d.y[k] + dy, y1 = d.y[k + 1] + dy, h = SIDEWALK.lift;
          const a = q(k, y0), e = q(k + 1, y1), f = q(k + 1, y1 + h), g = q(k, y0 + h);
          // outward normal toward the centre line: right edge (side +1) faces left of travel
          if (side > 0) b.quad('concrete_bare', e, a, g, f, { uv: [S[k + 1], 0, S[k], 0, S[k], h, S[k + 1], h] });
          else b.quad('concrete_bare', a, e, f, g, { uv: [S[k], 0, S[k + 1], 0, S[k + 1], h, S[k], h] });
        }
      }
      if (st.kind === 'road') roadMarkings(b, st, T, c, inMouth);
      streetDetails(b, ctx, plan, st, c, inMouth);
    } else {
      strip(-hw, hw, mat, 0, false);
    }
  }
  buildAprons(ctx, b, plan);
  ctx.batch.flush('world.streets');
  buildPlazaFloors(ctx, plan);
}

/** The paving between the back edge of the pavement and the facade, for every lot that fronts a street (aprons.js; R1-D11: bare earth showed in that gap along every
 *  shopfront). Same height as the pavement (a sidewalk's lift, or the street's own level where there is none) and the same texture coordinates, so the slabs run on. A cell
 *  hangs over the earth beside it, so each loose end gets a skirt that reaches below the ground. */
function buildAprons(ctx, b, plan) {
  const byId = new Map(plan.streets.map((s) => [s.id, s])), stats = { lots: 0, cells: 0, metres: 0 };
  for (const ap of frontageAprons(plan)) {
    const st = byId.get(ap.street), d = st._d, side = ap.side, hw = ap.hw;
    const mat = st.sidewalk ? 'sidewalk_slab' : SURF[st.surface] ?? 'street_concrete', dy = DY[st.kind] + (st.sidewalk ? SIDEWALK.lift : 0);
    const V = (p, s, lower = 0) => [p[0], yDense(d, s) + dy - lower, p[1]];
    stats.lots++;
    ap.cells.forEach((q, i) => {
      const a0 = V(q.a0, q.s0), a1 = V(q.a1, q.s1), b0 = V(q.b0, q.s0), b1 = V(q.b1, q.s1);
      if (side > 0) b.quad(mat, a0, b0, b1, a1, { uv: [hw, q.s0, q.o0, q.s0, q.o1, q.s1, hw, q.s1] });          // inner to outer along the street faces up on the right of travel, as the sidewalk's strips do
      else b.quad(mat, b0, a0, a1, b1, { uv: [-q.o0, q.s0, -hw, q.s0, -hw, q.s1, -q.o1, q.s1] });               // and the other way round on the left
      const mid = [(a0[0] + a1[0] + b0[0] + b1[0]) / 4, (a0[1] + a1[1] + b0[1] + b1[1]) / 4 - APRON.skirt / 2, (a0[2] + a1[2] + b0[2] + b1[2]) / 4];
      const skirt = (pa, pb, sa) => quadOut(b, 'concrete_bare', pa, pb, V([pb[0], pb[2]], sa, APRON.skirt), V([pa[0], pa[2]], sa, APRON.skirt), mid);
      if (i === 0 || ap.cells[i - 1].s1 !== q.s0) skirt(a0, b0, q.s0);
      if (i === ap.cells.length - 1 || ap.cells[i + 1].s0 !== q.s1) skirt(a1, b1, q.s1);
      stats.cells++; stats.metres += Math.abs(q.s1 - q.s0);
    });
  }
  stats.metres = +stats.metres.toFixed(1);
  if (ctx.world) ctx.world.aprons = stats;
}

// ---------------------------------------------------------------------------------------------------- road markings
function roadMarkings(b, st, T, c, inMouth) {
  const d = st._d, dy = DY[st.kind] + 0.012;
  const P = (k, off) => [d.pts[k][0] - T[k][1] * off, d.y[k] + dy, d.pts[k][1] + T[k][0] * off];
  const seg = (k, off, w, mat) => {
    const mx = (d.pts[k][0] + d.pts[k + 1][0]) / 2, mz = (d.pts[k][1] + d.pts[k + 1][1]) / 2;
    if (inMouth(mx, mz, 1.8)) return;
    const a = P(k, off - w / 2), e = P(k, off + w / 2), f = P(k + 1, off + w / 2), g = P(k + 1, off - w / 2);
    b.quad(mat, a, e, f, g, { uv: [0, 0, 1, 0, 1, 1, 0, 1] });
  };
  for (let k = 3; k + 4 < d.pts.length; k++) {
    if (k % 5 < 2) seg(k, 0, 0.13, 'road_line_yellow');                      // dashed centre line: 2 m on, 3 m off
    seg(k, -(c - 0.28), 0.10, 'road_line_white');                            // continuous edge lines
    seg(k, c - 0.28, 0.10, 'road_line_white');
  }
}

// ---------------------------------------------------------------------------------------------------- street detail
/**
 * What a worked street has on it: trench patches of darker asphalt, manhole covers and kerb gratings (the first frame looked up a carriageway of flat grey with
 * nothing on it). Flat decals a centimetre above the surface; never across a mouth where a path or a side street opens.
 */
function streetDetails(b, ctx, plan, st, c, inMouth) {
  const d = st._d, dy = DY[st.kind] + 0.01, r = ctx.rng.fork('world:street-detail:' + st.id), L = d.cum[d.cum.length - 1];
  const rec = (kind, p) => ((ctx.world ??= {}).streetDetail ??= { patches: [], manholes: [], gratings: [] })[kind].push({ st: st.id, x: +p[0].toFixed(2), z: +p[2].toFixed(2) });
  const at = (s, off, lift = 0) => { const p = pointAt(d.pts, d.cum, s); return [p.x - p.tz * off, yDense(d, s) + dy + lift, p.z + p.tx * off]; };
  const clear = (s, off, m) => { const q = at(s, off); return !inMouth(q[0], q[2], m); };
  const rect = (mat, s, off, hl, hw, col, lift = 0) => b.quad(mat, at(s - hl, off - hw, lift), at(s - hl, off + hw, lift), at(s + hl, off + hw, lift), at(s + hl, off - hw, lift), { col, uv: [0, 0, 1, 0, 1, 1, 0, 1] });
  const patch = (s, off, hl, hw, k, force = false) => {
    if (!force && ![-hl, 0, hl].every((u) => clear(s + u, off - hw, 1.2) && clear(s + u, off + hw, 1.2))) return false;
    rect('asphalt', s, off, hl, hw, [k, k, k * 1.03]); rec('patches', at(s, off)); return true;
  };
  const manhole = (s, off, a, force = false) => {                                           // a dark disc, a rim, two cross bars
    if (!force && !clear(s, off, 1.6)) return false;
    const [x, y, z] = at(s, off); rec('manholes', [x, y, z]);
    b.cyl('iron_black', x, y, z, 0.37, 0.012, 14, { col: [0.2, 0.2, 0.21] });
    b.cyl('galvanised', x, y + 0.006, z, 0.31, 0.012, 14, { col: [0.3, 0.3, 0.31] });
    for (const q of [0, Math.PI / 2]) b.box('iron_black', x, y + 0.02, z, 0.6, 0.014, 0.05, { ry: a + q, col: [0.16, 0.16, 0.17] });
    return true;
  };
  const grating = (s, off, force = false) => {                                              // in the gutter, long side along the kerb
    if (!force && ![-0.5, 0, 0.5].every((u) => clear(s + u, off, 1.4))) return false;
    rect('iron_black', s, off, 0.45, 0.16, [0.16, 0.16, 0.18], 0.004); rec('gratings', at(s, off));
    for (const o of [-0.09, 0, 0.09]) rect('galvanised', s, off + o, 0.4, 0.014, [0.34, 0.34, 0.36], 0.008);
    return true;
  };
  for (let s = 5 + r.range(0, 8); s < L - 5; s += r.range(15, 30)) { const hl = r.range(0.7, 1.9), hw = r.range(0.4, Math.min(1.0, c - 0.45)); patch(s, r.range(-(c - hw - 0.25), c - hw - 0.25), hl, hw, r.range(0.5, 0.78)); }
  for (let s = 9 + r.range(0, 12); s < L - 6; s += r.range(24, 42)) manhole(s, (r.chance(0.5) ? 1 : -1) * r.range(0.25 * c, 0.65 * c), r.range(0, Math.PI));
  for (let s = 12 + r.range(0, 16); s < L - 6; s += r.range(30, 48)) grating(s, (r.chance(0.5) ? 1 : -1) * (c - 0.2));
  // the carriageway in the arrival view (the first frame): a trench patch, a cover and a grating a few metres up the street, left and right of the axis
  const sp = plan.spawn, fx = -Math.sin(sp.yaw ?? 0), fz = -Math.cos(sp.yaw ?? 0), rx = -fz, rz = fx;
  const onStreet = (f, u, within = c - 0.45) => { const x = sp.x + fx * f + rx * u, z = sp.z + fz * f + rz * u, pr = project(d.pts, d.cum, x, z); return pr.d <= within ? { s: pr.s, off: pr.side * pr.d } : null; };
  let q;
  if ((q = onStreet(3.9, -2.8))) patch(q.s, q.off, 1.4, 0.6, 0.6, true);
  if ((q = onStreet(3.7, 2.6))) manhole(q.s, q.off, 0.5, true);
  if ((q = onStreet(3.2, -4.3, c + 0.5))) grating(q.s, q.off >= 0 ? c - 0.2 : -(c - 0.2), true);
}

// ---------------------------------------------------------------------------------------------------- plazas, court, mirador
function buildPlazaFloors(ctx, plan) {
  const b = ctx.batch.builder('world.plazas', { cast: false });
  for (const pl of plan.plazas) {
    const top = pl.y + 0.02;
    // court_floor's texture is a neutral pale grey made to be tinted (manifest "tint": true): untinted, the cancha read as a white slab with invisible lines
    const mat = pl.kind === 'court' ? 'court_floor#4f8a5c' : pl.kind === 'mirador' ? 'cobble_stone' : 'paving_plaza';
    b.slab({ top: mat, side: 'concrete_bare', bottom: null }, pl.poly, null, pl.y - 0.4, top);
    if (pl.kind === 'court') courtLines(b, pl, top + 0.012);
    if (pl.kind === 'plaza') plazaBorder(b, pl, top + 0.008);
  }
  ctx.batch.flush('world.plazas');
}

/**
 * A flat quad on the ground between two points with line width w. `quad` wants the corners counter-clockwise as seen from the front, so these run
 * a(-n) -> a(+n) -> b(+n) -> b(-n): the face looks UP. (The first version wound them the other way: the court lines, the centre circle and the plaza
 * borders all faced the ground, were culled, and the court read as a bare slab.)
 */
export function lineQuad(b, mat, x0, z0, x1, z1, w, y) {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
  b.quad(mat, [x0 - nx, y, z0 - nz], [x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz], [x1 - nx, y, z1 - nz], { uv: [0, 0, 1, 0, 1, 1, 0, 1] });
}

/** Futsal court markings: the boundary through the goal posts (dress.js court puts them 1.5 m in from each end), halfway line, centre circle and spot, penalty arcs and spots. */
function courtLines(b, pl, y) {
  const c = Math.cos(pl.ry), s = Math.sin(pl.ry);
  const P = (lx, lz) => [pl.cx + lx * c + lz * s, pl.cz - lx * s + lz * c];
  const hw = pl.w / 2 - 1.5, hd = pl.d / 2 - 1.2, W = 'road_line_white', lw = 0.1;
  const L = (a, bb, w = lw) => { const p = P(...a), q = P(...bb); lineQuad(b, W, p[0], p[1], q[0], q[1], w, y); };
  L([-hw, -hd], [hw, -hd]); L([hw, -hd], [hw, hd]); L([hw, hd], [-hw, hd]); L([-hw, hd], [-hw, -hd]); L([0, -hd], [0, hd]);
  const arc = (cx, cz, r, a0, a1, n = 18) => { let prev = null; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, q = [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; if (prev) L(prev, q); prev = q; } };
  arc(0, 0, 2.6, 0, Math.PI * 2, 32);
  arc(-hw, 0, 4.0, -Math.PI / 2, Math.PI / 2); arc(hw, 0, 4.0, Math.PI / 2, (3 * Math.PI) / 2);
  for (const [sx, sz] of [[0, 0], [-hw + 4, 0], [hw - 4, 0]]) L([sx - 0.09, sz], [sx + 0.09, sz], 0.18);          // centre spot and the two penalty spots (on the apex of each arc)
}

function plazaBorder(b, pl, y) {
  // a darker paving band 0.5 m inside the edge, the way plazas are edged with a kerb course
  const c = Math.cos(pl.ry), s = Math.sin(pl.ry), hw = pl.w / 2 - 0.45, hd = pl.d / 2 - 0.45;
  const P = (lx, lz) => [pl.cx + lx * c + lz * s, pl.cz - lx * s + lz * c];
  for (const [a, e] of [[[-hw, -hd], [hw, -hd]], [[hw, -hd], [hw, hd]], [[hw, hd], [-hw, hd]], [[-hw, hd], [-hw, -hd]]]) {
    const p = P(...a), q = P(...e); lineQuad(b, 'concrete_bare', p[0], p[1], q[0], q[1], 0.32, y);
  }
}
