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

/** Triangle a,b,c wound so that the face looks along `want` (a direction vector), whatever order the points came in. */
export function triFacing(b, key, a, bb, c, want, o = {}) {
  const n = cross(sub(bb, a), sub(c, a));
  if (dot(n, want) < 0) b.tri(key, a, c, bb, o.uv ? { ...o, uv: [o.uv[0], o.uv[1], o.uv[4], o.uv[5], o.uv[2], o.uv[3]] } : o);       // explicit uv follow their vertices when the pair swaps
  else b.tri(key, a, bb, c, o);
}

/** The points of an arched head over an opening u0..u1 whose top is at yb: [u, y] from the springing on the left over the apex to the springing on the right (a half circle when the rise is half the width, else a half ellipse). */
export function archPts(u0, u1, yb, rise, n = 12) {
  const hw = (u1 - u0) / 2, uc = (u0 + u1) / 2, ys = yb - rise;
  return Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI - (Math.PI * i) / n; return [uc + hw * Math.cos(a), ys + rise * Math.sin(a)]; });
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

// ---- the evening of a lit window (engine/windowroom.js reads it in the shader; R1-104) --------------------------------------------------------------------------------------------------------------
/** When the lights of a lived-in room come on (clock hours) and go off (hours past midnight are 24+; 99 = on all night). A room draws one of each, so a street does not switch as one. */
export const ROOM_ON = [17.5, 17.9, 18.3, 18.7, 19.1, 19.6, 20.1, 20.7];
export const ROOM_OFF = [21.75, 22.25, 22.75, 23.5, 24, 24.5, 25.5, 99];
/** The first colour channel of a pane that shows a room: 2 + (8 x the slot it comes on in + the slot it goes off in) + 0.999 x its look. a, b, c in 0..1 (hashes): the two slots, the look. */
export function roomSeed(a, b, c) { return 2 + 8 * Math.min(7, Math.floor(a * 8)) + Math.min(7, Math.floor(b * 8)) + 0.999 * c; }
/** The room-look table (engine/windowroom.js `syncRoomLooks`): each (building, room) with a lit window gets a slot 1..ROOM_SLOTS-1, in the order the shells are built (0 = none, or full).
 *  The pane carries it in its third colour channel, `roomSize(height, slot)` = height + 8 x slot (a pane is never 8 m tall), so the card can paint the REAL room's walls and lamp
 *  once the interiors have chosen them (R1-211: the card was a made-up grey room that did not match the room seen through the same glass at dusk). */
export const ROOM_SLOTS = 2048;
export function roomSlot(ctx, bpId, roomId) {
  if (!ctx || roomId == null) return 0;
  const T = (ctx.roomSlots ??= { map: new Map(), list: [] }), k = `${bpId}:${roomId}`;
  let s = T.map.get(k);
  if (s == null) { if (T.list.length + 1 >= ROOM_SLOTS) return 0; T.list.push({ bp: bpId, room: roomId, ok: false }); s = T.list.length; T.map.set(k, s); }
  return s;
}
export const roomSize = (h, slot) => h + 8 * slot;
/** The pane's height and slot back from its third colour channel. */
export const roomSizeOf = (z) => { const slot = Math.floor(z / 8); return { h: z - 8 * slot, slot }; };
/** Is the room of a pane whose first colour channel is `code` lit at clock hour `h`? (The shader's rule, in JS: hours before noon count as the end of the evening before.) */
export function roomLitAt(code, h) {
  const k = Math.floor(code - 2 + 0.0005), e = h < 12 ? h + 24 : h;
  return e >= ROOM_ON[Math.floor(k / 8)] && e < ROOM_OFF[k % 8];
}
