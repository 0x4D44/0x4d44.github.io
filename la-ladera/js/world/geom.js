// Small 2D geometry helpers for the world plan (pure data, no THREE, runs under node).
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** smoothstep; works with a > b (reverse ramp). */
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

/** Cumulative arc length of a polyline [[x,z],...]. */
export function cumLen(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

/** Point and unit tangent at arc position s (clamped). */
export function pointAt(pts, cum, s) {
  const L = cum[cum.length - 1]; s = clamp(s, 0, L);
  let lo = 1, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  const i = lo, a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, u = (s - cum[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, tx: (b[0] - a[0]) / seg, tz: (b[1] - a[1]) / seg, i, s };
}

/** Nearest point on a polyline. Returns { s, d, x, z, tx, tz, i, side } (side = +1 when (x,z) is to the right of travel). */
export function project(pts, cum, x, z) {
  let best = null, bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1e-12;
    let u = ((x - a[0]) * vx + (z - a[1]) * vz) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = a[0] + vx * u, pz = a[1] + vz * u, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < bd) { bd = d2; best = { i, u, px, pz, vx, vz }; }
  }
  const seg = Math.sqrt(best.vx * best.vx + best.vz * best.vz) || 1;
  const cr = best.vx * (z - best.pz) - best.vz * (x - best.px);   // >0 => point is to the right of travel (x east, z south)
  return { s: cum[best.i - 1] + (cum[best.i] - cum[best.i - 1]) * best.u, d: Math.sqrt(bd), x: best.px, z: best.pz, tx: best.vx / seg, tz: best.vz / seg, i: best.i, side: cr >= 0 ? 1 : -1 };
}

/** Round the corners of a polyline with circular arcs. radii[i] applies to corner i. Returns [[x,z],...]. */
export function fillet(corners, radii, step = 2) {
  const out = [corners[0].slice()];
  for (let i = 1; i < corners.length - 1; i++) {
    const p0 = corners[i - 1], p1 = corners[i], p2 = corners[i + 1];
    const a = unit(p1[0] - p0[0], p1[1] - p0[1]), b = unit(p2[0] - p1[0], p2[1] - p1[1]);
    const l0 = dist(p0, p1), l1 = dist(p1, p2);
    const th = Math.acos(clamp(a[0] * b[0] + a[1] * b[1], -1, 1));
    const r0 = radii[i] ?? 0;
    if (th < 1e-3 || r0 <= 0) { out.push(p1.slice()); continue; }
    const t = Math.tan(th / 2);
    const avail0 = i === 1 ? l0 : l0 / 2, avail1 = i === corners.length - 2 ? l1 : l1 / 2;
    const tl = Math.min(r0 * t, avail0, avail1), r = tl / t;
    const s0 = [p1[0] - a[0] * tl, p1[1] - a[1] * tl], s1 = [p1[0] + b[0] * tl, p1[1] + b[1] * tl];
    const cross = a[0] * b[1] - a[1] * b[0];
    const nrm = cross > 0 ? [-a[1], a[0]] : [a[1], -a[0]];
    const c = [s0[0] + nrm[0] * r, s0[1] + nrm[1] * r];
    const ph0 = Math.atan2(s0[1] - c[1], s0[0] - c[0]), sweep = cross > 0 ? th : -th;
    const n = Math.max(2, Math.ceil((r * th) / step));
    out.push(s0);
    for (let k = 1; k < n; k++) { const ph = ph0 + (sweep * k) / n; out.push([c[0] + Math.cos(ph) * r, c[1] + Math.sin(ph) * r]); }
    out.push(s1);
  }
  out.push(corners[corners.length - 1].slice());
  return out;
}

/** Resample a polyline at uniform spacing ~ds (always keeps both ends). Returns { pts, cum }. */
export function resample(pts, ds) {
  const cum = cumLen(pts), L = cum[cum.length - 1], n = Math.max(1, Math.round(L / ds));
  const out = [];
  for (let k = 0; k <= n; k++) { const p = pointAt(pts, cum, (L * k) / n); out.push([p.x, p.z]); }
  return { pts: out, cum: cumLen(out) };
}

export function pointInPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Distance from a point to a segment. */
export function segDist(px, pz, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1e-12;
  let u = ((px - a[0]) * vx + (pz - a[1]) * vz) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - (a[0] + vx * u), pz - (a[1] + vz * u));
}

/** Distance from a point to a polygon outline (0 when inside). */
export function polyDistPoint(poly, x, z) {
  if (pointInPoly(poly, x, z)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Signed separation between two convex polygons: > 0 = gap (exact distance), <= 0 = overlap depth (negative). */
export function gapBetween(A, B) {
  let sep = -Infinity;
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      let nx = b[1] - a[1], nz = -(b[0] - a[0]); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const p of A) { const v = p[0] * nx + p[1] * nz; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
      for (const p of B) { const v = p[0] * nx + p[1] * nz; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
      sep = Math.max(sep, Math.max(b0 - a1, a0 - b1));
    }
  }
  if (sep <= 0) return sep;
  let d = Infinity;
  for (const [P, Q] of [[A, B], [B, A]]) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segDist(p[0], p[1], Q[i], Q[(i + 1) % Q.length]));
  return d;
}

/** Footprint corners (world) of a lot-like { x,z,rotY,w,d }. grow expands every side. */
export function footprint(l, grow = 0) {
  const c = Math.cos(l.rotY), s = Math.sin(l.rotY), hw = l.w / 2 + grow, hd = l.d / 2 + grow;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [l.x + x * c + z * s, l.z - x * s + z * c]);
}

/** Deterministic hash noise in [-1,1] on a lattice. */
export function hash2(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
/** Smooth value noise in [-1,1], feature size `scale` metres. */
export function vnoise(x, z, scale, seed) {
  const fx = x / scale, fz = z / scale, ix = Math.floor(fx), iz = Math.floor(fz);
  let tx = fx - ix, tz = fz - iz; tx = tx * tx * (3 - 2 * tx); tz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}
