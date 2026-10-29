// MeshBuilder helpers for the architecture shell (colours, oriented quads, bars). Building-local coordinates throughout.
import * as THREE from 'three';

const _c = new THREE.Color();
const UP = [0, 1, 0];

/** sRGB hex (number or 'rrggbb' string) -> linear [r,g,b], the space MeshBuilder vertex colours live in. */
export function lin(hex) {
  if (Array.isArray(hex)) return hex;
  if (hex == null) return [1, 1, 1];
  _c.setHex(typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex);
  return [_c.r, _c.g, _c.b];
}
export const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const prod = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/** 'plaster_a#d9a441' -> { name:'plaster_a', tint:[r,g,b] | null }. The tint becomes a vertex colour so every tint shares ONE mesh. */
export function splitKey(key) {
  const [name, tint] = String(key).split('#');
  return { name, tint: tint ? lin(parseInt(tint, 16)) : null };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Quad a,b,c,d in any winding: flipped when needed so the face looks along `want` (a direction vector). */
export function qd(b, key, a, bb, c, d, want, o = {}) {
  const n = cross(sub(c, a), sub(d, bb));
  if (want && dot(n, want) < 0) {
    const oo = { ...o };
    if (o.cols) oo.cols = [o.cols[0], o.cols[3], o.cols[2], o.cols[1]];
    if (o.uv) oo.uv = [o.uv[0], o.uv[1], o.uv[6], o.uv[7], o.uv[4], o.uv[5], o.uv[2], o.uv[3]];
    b.quad(key, a, d, c, bb, oo);
  } else b.quad(key, a, bb, c, d, o);
}

/**
 * Vertical quad on a wall face. dir 'x': the face runs along x at z=plane; dir 'z': along z at x=plane. side = +1/-1 = which way the
 * face looks (+z/-z for dir x, +x/-x for dir z). The face spans u0..u1 along the wall; y0a/y0b = bottom height at u0/u1, y1a/y1b = top.
 * o.cols = [bottom@u0, bottom@u1, top@u1, top@u0].
 */
export function faceQuad(b, key, dir, plane, side, u0, u1, y0a, y0b, y1a, y1b, o = {}) {
  const flip = dir === 'x' ? side < 0 : side > 0;
  const P = (u) => (dir === 'x' ? [u, plane] : [plane, u]);
  let oo = o;
  if (flip) {
    oo = { ...o };
    if (o.cols) oo.cols = [o.cols[1], o.cols[0], o.cols[3], o.cols[2]];
    if (o.uv) oo.uv = [o.uv[2], o.uv[3], o.uv[0], o.uv[1], o.uv[6], o.uv[7], o.uv[4], o.uv[5]];
    const p = P(u1), q = P(u0);
    b.quad(key, [p[0], y0b, p[1]], [q[0], y0a, q[1]], [q[0], y1a, q[1]], [p[0], y1b, p[1]], oo);
  } else {
    const p = P(u0), q = P(u1);
    b.quad(key, [p[0], y0a, p[1]], [q[0], y0b, q[1]], [q[0], y1b, q[1]], [p[0], y1a, p[1]], oo);
  }
}

/** Horizontal rectangle at height y looking up (up=true) or down. */
export function flat(b, key, x0, z0, x1, z1, y, up = true, o = {}) {
  if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
  if (up) b.quad(key, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], o);
  else b.quad(key, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], o);
}

/** A thin square-section bar from p0 to p1 (any direction), section w x h (h along the "up-ish" normal). Four long faces + end caps. */
export function bar(b, key, p0, p1, w, h = w, o = {}) {
  const d = norm(sub(p1, p0));
  let s = cross(UP, d);
  if (Math.hypot(s[0], s[1], s[2]) < 1e-4) s = [1, 0, 0];
  s = norm(s);
  const u = norm(cross(d, s));              // perpendicular to both
  const hw = w / 2, hh = h / 2;
  const c = (p, a, bb) => [p[0] + s[0] * a + u[0] * bb, p[1] + s[1] * a + u[1] * bb, p[2] + s[2] * a + u[2] * bb];
  const A0 = c(p0, -hw, -hh), B0 = c(p0, hw, -hh), C0 = c(p0, hw, hh), D0 = c(p0, -hw, hh);
  const A1 = c(p1, -hw, -hh), B1 = c(p1, hw, -hh), C1 = c(p1, hw, hh), D1 = c(p1, -hw, hh);
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
  const face = (a, bb, cc, dd) => {
    const cx = (a[0] + bb[0] + cc[0] + dd[0]) / 4 - mid[0], cy = (a[1] + bb[1] + cc[1] + dd[1]) / 4 - mid[1], cz = (a[2] + bb[2] + cc[2] + dd[2]) / 4 - mid[2];
    qd(b, key, a, bb, cc, dd, [cx - d[0] * dot([cx, cy, cz], d), cy - d[1] * dot([cx, cy, cz], d), cz - d[2] * dot([cx, cy, cz], d)], o);
  };
  face(A0, A1, B1, B0); face(B0, B1, C1, C0); face(C0, C1, D1, D0); face(D0, D1, A1, A0);
  if (o.caps) { qd(b, key, A0, B0, C0, D0, [-d[0], -d[1], -d[2]], o); qd(b, key, A1, B1, C1, D1, d, o); }
}

/** Which way the outside of an exterior wall looks: +1 = +z (dir x walls) / +x (dir z walls). */
export const OUT = { front: 1, back: -1, left: -1, right: 1, south: 1, north: -1, west: -1, east: 1 };

/** Axis-aligned box on a wall: uc = centre along the wall, pc = centre across it, du x dy x dp = along x height x across. */
export function wbox(b, mat, dir, uc, yc, pc, du, dy, dp, col, skip) {
  if (dir === 'x') b.box(mat, uc, yc, pc, du, dy, dp, { col, skip });
  else b.box(mat, pc, yc, uc, dp, dy, du, { col, skip });
}

/** Deterministic 0..1 hash of a string and an int (stable per-building variation without touching the RNG stream). */
export function hash01(str, n = 0) {
  let h = 2166136261 ^ n;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
