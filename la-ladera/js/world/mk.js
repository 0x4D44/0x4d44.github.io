// Small mesh helpers shared by the world builders (pure functions over a core/mesh.js MeshBuilder).
// Conventions: x east, y up, z south. "Right of travel" along a polyline = (-tz, tx).
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Tangents (unit, [tx,tz]) at every vertex of a polyline: averaged over the two neighbouring segments. */
export function tangents(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    out.push([dx / l, dz / l]);
  }
  return out;
}

/** Arc length at every vertex. */
export function arcs(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

/**
 * A horizontal strip along a polyline, facing up. offL < offR are signed distances to the RIGHT of travel (so the left edge has
 * the smaller number). ys = height per vertex (+dy). UVs are metres: u = offset, v = arc length (+v0).
 * o: { dy, col, v0, uScale }.
 */
export function ribbon(b, mat, pts, ys, offL, offR, o = {}) {
  const T = tangents(pts), S = arcs(pts), dy = o.dy ?? 0, v0 = o.v0 ?? 0;
  const P = (k, off) => [pts[k][0] - T[k][1] * off, ys[k] + dy, pts[k][1] + T[k][0] * off];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = P(k, offL), c = P(k, offR), d = P(k + 1, offR), e = P(k + 1, offL);
    b.quad(mat, a, c, d, e, { uv: [offL, S[k] + v0, offR, S[k] + v0, offR, S[k + 1] + v0, offL, S[k + 1] + v0], col: o.col });
  }
}

/**
 * A vertical face along a polyline at lateral offset `off` (right of travel), from yBot[k] to yTop[k].
 * face = 'right' (default) | 'left': which way the visible side looks, relative to the travel direction.
 */
export function faceStrip(b, mat, pts, yBot, yTop, off, face = 'right', o = {}) {
  const T = tangents(pts), S = arcs(pts);
  const P = (k, y) => [pts[k][0] - T[k][1] * off, y, pts[k][1] + T[k][0] * off];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = P(k, yBot[k]), c = P(k + 1, yBot[k + 1]), d = P(k + 1, yTop[k + 1]), e = P(k, yTop[k]);
    const uv = [S[k], yBot[k], S[k + 1], yBot[k + 1], S[k + 1], yTop[k + 1], S[k], yTop[k]];
    if (face === 'right') b.quad(mat, a, c, d, e, { uv, col: o.col });
    else b.quad(mat, c, a, e, d, { uv: [uv[2], uv[3], uv[0], uv[1], uv[6], uv[7], uv[4], uv[5]], col: o.col });
  }
}

/** A quad whose front face points away from `centre` (order of corners is fixed up automatically). */
export function quadOut(b, mat, p0, p1, p2, p3, centre, o = {}) {
  const n = cross(sub(p2, p0), sub(p3, p1)), m = mul(add(add(p0, p1), add(p2, p3)), 0.25);
  if (dot(n, sub(m, centre)) >= 0) b.quad(mat, p0, p1, p2, p3, o); else b.quad(mat, p3, p2, p1, p0, o);
}

/** Rectangular prism between two 3D points (rails, beams, posts): cross-section w (sideways) x h (up-ish). */
export function beam(b, mat, a, c, w, h, o = {}) {
  const d = sub(c, a);
  let s = cross([0, 1, 0], d);
  s = len(s) < 1e-5 ? [1, 0, 0] : nrm(s);
  const u = nrm(cross(d, s)), hs = mul(s, w / 2), hu = mul(u, h / 2);
  const corner = (p, i, j) => add(add(p, mul(hs, i)), mul(hu, j));
  const A = [corner(a, -1, -1), corner(a, 1, -1), corner(a, 1, 1), corner(a, -1, 1)];
  const C = [corner(c, -1, -1), corner(c, 1, -1), corner(c, 1, 1), corner(c, -1, 1)];
  const ctr = mul(add(a, c), 0.5);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quadOut(b, mat, A[i], A[j], C[j], C[i], ctr, o); }
  quadOut(b, mat, A[0], A[1], A[2], A[3], ctr, o);
  quadOut(b, mat, C[0], C[1], C[2], C[3], ctr, o);
}

/**
 * Round tube between two points with smooth normals (poles, trunks, wheels, pipes). r0 at a, r1 at c.
 * o: { col | colFn(ringIndex) -> [r,g,b], caps:true, uvTurns (u repeats per metre of circumference) }
 */
export function tube(b, mat, a, c, r0, r1 = r0, seg = 8, o = {}) {
  const acc = b._acc(mat), d = sub(c, a), L = len(d) || 1e-6, t = mul(d, 1 / L);
  let s = cross(t, [0, 1, 0]); s = len(s) < 1e-4 ? [1, 0, 0] : nrm(s);
  const u = cross(s, t), base = acc.pos.length / 3, slope = (r0 - r1) / L, circ = Math.PI * 2 * Math.max(r0, r1);
  const colAt = (i) => (o.colFn ? o.colFn(i) : o.col ?? [1, 1, 1]);
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2, radial = add(mul(s, Math.cos(th)), mul(u, Math.sin(th)));
    const n = nrm(add(radial, mul(t, slope))), col = colAt(i % seg);
    b.vert(acc, add(a, mul(radial, r0)), n, (i / seg) * circ, 0, col);
    b.vert(acc, add(c, mul(radial, r1)), n, (i / seg) * circ, L, col);
  }
  for (let i = 0; i < seg; i++) { const k = base + i * 2; acc.idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  b.tris += seg * 2;
  if (o.caps !== false) {
    for (const [p, r, sgn] of [[c, r1, 1], [a, r0, -1]]) {
      if (r <= 1e-4) continue;
      const n = mul(t, sgn), c0 = b.vert(acc, p, n, 0, 0, colAt(0));
      for (let i = 0; i <= seg; i++) { const th = (i / seg) * Math.PI * 2; b.vert(acc, add(p, mul(add(mul(s, Math.cos(th)), mul(u, Math.sin(th))), r)), n, Math.cos(th) * r, Math.sin(th) * r, colAt(i % seg)); }
      for (let i = 0; i < seg; i++) { if (sgn > 0) acc.idx.push(c0, c0 + i + 2, c0 + i + 1); else acc.idx.push(c0, c0 + i + 1, c0 + i + 2); }
      b.tris += seg;
    }
  }
}

/** A flat double-sided card (foliage, leaves): bottom-centre p, unit right/up vectors, size w x h, atlas rect uv=[u0,v0,u1,v1], one normal. */
export function card(b, mat, p, right, up, w, h, uv, col, n) {
  const acc = b._acc(mat), hw = w / 2;
  const bl = sub(p, mul(right, hw)), br = add(p, mul(right, hw)), tl = add(bl, mul(up, h)), tr = add(br, mul(up, h));
  const i0 = b.vert(acc, bl, n, uv[0], uv[1], col);
  b.vert(acc, br, n, uv[2], uv[1], col); b.vert(acc, tr, n, uv[2], uv[3], col); b.vert(acc, tl, n, uv[0], uv[3], col);
  acc.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  b.tris += 2;
}

export const V = { sub, add, mul, cross, dot, len, nrm };

/** Deterministic colour jitter: returns [r,g,b] around base (0xRRGGBB number or [r,g,b]) by +-amt (fraction). */
export function jitter(base, amt, r) {
  const c = Array.isArray(base) ? base : [((base >> 16) & 255) / 255, ((base >> 8) & 255) / 255, (base & 255) / 255];
  const k = 1 + (r * 2 - 1) * amt;
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}
