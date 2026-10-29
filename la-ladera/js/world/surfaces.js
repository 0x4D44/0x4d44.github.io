// Street, sidewalk, kerb, road marking and plaza surfaces (group world.streets / world.plazas).
// Everything sits a few millimetres above plan.heightAt (the terrain mesh is carved 7 cm below) so nothing z-fights; a street that
// joins a higher-ranked one conforms to that street's surface where the two overlap.
import { project, clamp } from './geom.js';
import { ribbon, faceStrip, tangents, arcs } from './mk.js';
import { SIDEWALK } from './plan.js';

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
    } else {
      strip(-hw, hw, mat, 0, false);
    }
  }
  ctx.batch.flush('world.streets');
  buildPlazaFloors(ctx, plan);
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

// ---------------------------------------------------------------------------------------------------- plazas, court, mirador
function buildPlazaFloors(ctx, plan) {
  const b = ctx.batch.builder('world.plazas', { cast: false });
  for (const pl of plan.plazas) {
    const top = pl.y + 0.02;
    const mat = pl.kind === 'court' ? 'court_floor' : pl.kind === 'mirador' ? 'cobble_stone' : 'paving_plaza';
    b.slab({ top: mat, side: 'concrete_bare', bottom: null }, pl.poly, null, pl.y - 0.4, top);
    if (pl.kind === 'court') courtLines(b, pl, top + 0.012);
    if (pl.kind === 'plaza') plazaBorder(b, pl, top + 0.008);
  }
  ctx.batch.flush('world.plazas');
}

/** A flat quad on the ground between two points with line width w (local helper). */
function lineQuad(b, mat, x0, z0, x1, z1, w, y) {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
  b.quad(mat, [x0 + nx, y, z0 + nz], [x0 - nx, y, z0 - nz], [x1 - nx, y, z1 - nz], [x1 + nx, y, z1 + nz], { uv: [0, 0, 1, 0, 1, 1, 0, 1] });
}

function courtLines(b, pl, y) {
  const c = Math.cos(pl.ry), s = Math.sin(pl.ry);
  const P = (lx, lz) => [pl.cx + lx * c + lz * s, pl.cz - lx * s + lz * c];
  const hw = pl.w / 2 - 1.2, hd = pl.d / 2 - 1.2, W = 'road_line_white', lw = 0.1;
  const L = (a, bb) => { const p = P(...a), q = P(...bb); lineQuad(b, W, p[0], p[1], q[0], q[1], lw, y); };
  L([-hw, -hd], [hw, -hd]); L([hw, -hd], [hw, hd]); L([hw, hd], [-hw, hd]); L([-hw, hd], [-hw, -hd]); L([0, -hd], [0, hd]);
  const arc = (cx, cz, r, a0, a1, n = 18) => { let prev = null; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, q = [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; if (prev) L(prev, q); prev = q; } };
  arc(0, 0, 2.6, 0, Math.PI * 2, 28);
  arc(-hw, 0, 4.0, -Math.PI / 2, Math.PI / 2); arc(hw, 0, 4.0, Math.PI / 2, (3 * Math.PI) / 2);
}

function plazaBorder(b, pl, y) {
  // a darker paving band 0.5 m inside the edge, the way plazas are edged with a kerb course
  const c = Math.cos(pl.ry), s = Math.sin(pl.ry), hw = pl.w / 2 - 0.45, hd = pl.d / 2 - 0.45;
  const P = (lx, lz) => [pl.cx + lx * c + lz * s, pl.cz - lx * s + lz * c];
  for (const [a, e] of [[[-hw, -hd], [hw, -hd]], [[hw, -hd], [hw, hd]], [[hw, hd], [-hw, hd]], [[-hw, hd], [-hw, -hd]]]) {
    const p = P(...a), q = P(...e); lineQuad(b, 'concrete_bare', p[0], p[1], q[0], q[1], 0.32, y);
  }
}
