// Window dressing (A3): curtains, café curtains and roller blinds on the INSIDE of A2's window openings. Drawn straight from `bp.windows`
// (not furniture records): a rod and folded cloth panels made of a few quads each, tinted with vertex colours, so every dressed window costs
// ~60 triangles and no extra material beyond `curtain_fabric` (double sided, textured in the library) and `metal_dark` (rod).
import { hashStr } from '../core/rng.js';
import { sideOf } from './layout.js';

const u01 = (s, i = 0) => ((hashStr(s + '#' + i) >>> 0) % 100003) / 100003;
const pick = (arr, s, i = 0) => arr[Math.floor(u01(s, i) * arr.length) % arr.length];
const mulc = (hex, k) => ((Math.min(255, ((hex >> 16) & 255) * k) | 0) << 16) | ((Math.min(255, ((hex >> 8) & 255) * k) | 0) << 8) | (Math.min(255, (hex & 255) * k) | 0);

const DRAPES = [0xe6c9b8, 0xd9a0a8, 0xb7c9a0, 0x9db8d0, 0xe8dcc0, 0xc8a878, 0xa9b5d0, 0xd8c0d8, 0xcf9a7a, 0xf0e8d8, 0x8fae9e, 0xd8806a];
const BLINDS = [0xe8e2d0, 0xd6d8d0, 0xe6d8b0, 0xc8d4dc];
const DRESSED = new Set(['living', 'dining', 'bedroom', 'kitchen', 'office']);

/** (u, y, depth) -> building-local point, for a window on `wall` ('-z' | '+z' | '-x' | '+x') of room rect `r`; depth is measured into the room from the inner wall face. */
function wallFrame(wall, r) {
  switch (wall) {
    case '+z': return (u, y, d) => [u, y, r.z1 - d];
    case '-z': return (u, y, d) => [u, y, r.z0 + d];
    case '-x': return (u, y, d) => [r.x0 + d, y, u];
    default: return (u, y, d) => [r.x1 - d, y, u];
  }
}

/** A gathered panel from u0 to u1, hanging y1 -> y0, in `nf` zig-zag folds (alternate strips tilt differently so the light breaks up). */
function panel(b, P, u0, u1, y0, y1, d0, col, nf) {
  const du = (u1 - u0) / nf;
  for (let i = 0; i < nf; i++) {
    const ua = u0 + i * du, ub = ua + du, odd = i % 2 === 1;
    const da = d0 + (odd ? 0.05 : 0), db = d0 + (odd ? 0 : 0.05);
    b.quad('curtain_fabric', P(ua, y0, da), P(ub, y0, db), P(ub, y1, db), P(ua, y1, da), { col: mulc(col, odd ? 0.86 : 1) });
  }
}

/** Dress every window of the building that belongs to a lived-in room. Returns the number of windows dressed. */
export function dressWindows(b, bp) {
  const rooms = new Map((bp.rooms ?? []).map((r) => [r.id, r]));
  let n = 0;
  for (const w of bp.windows ?? []) {
    const room = rooms.get(w.room);
    if (!room || !DRESSED.has(room.type) || room.outdoor) continue;
    const r = room.rect, s = sideOf(r, w.x, w.z, 0.6);                                       // which wall of the room the window is in, and where along it
    if (!s) continue;
    const seed = String(w.id), P = wallFrame(s.wall, r), u = s.u, along = s.wall === '-z' || s.wall === '+z';
    const ww = w.w ?? 1.1, wh = w.h ?? 1.1;
    const fy = room.y ?? 0, sill = fy + (w.y ?? 0.9), head = sill + wh, ceil = fy + (room.h ?? 2.6);
    const style = room.type === 'office' ? 'blind' : room.type === 'kitchen' ? (u01(seed, 1) < 0.6 ? 'cafe' : 'none') : (u01(seed, 1) < 0.9 ? 'drapes' : 'none');
    if (style === 'none') continue;
    if (style === 'blind') {                                                                // roller blind: flat cloth + bottom bar, partly drawn
      const col = pick(BLINDS, seed, 2), y1 = Math.min(head + 0.05, ceil - 0.08), y0 = y1 - (wh + 0.05) * (0.5 + 0.3 * u01(seed, 3));
      b.quad('curtain_fabric', P(u + ww / 2 + 0.04, y0, 0.05), P(u - ww / 2 - 0.04, y0, 0.05), P(u - ww / 2 - 0.04, y1, 0.05), P(u + ww / 2 + 0.04, y1, 0.05), { col });
      const bar = P(u, y0 + 0.01, 0.055);
      b.box('metal_dark', bar[0], bar[1], bar[2], along ? ww + 0.08 : 0.02, 0.02, along ? 0.02 : ww + 0.08, { col: 0x8a8a84 });
      n++; continue;
    }
    const col = pick(DRAPES, bp.id + room.id, 4);                                           // one colour per room, like a bought set
    const span = ww + (style === 'cafe' ? 0.16 : 0.44);
    const yRod = Math.min(head + 0.13, ceil - 0.1);
    const yLow = style === 'cafe' ? sill + 0.04 + wh * 0.18 : fy + 0.04;                    // floor length, or a short curtain in the kitchen
    const yTop = style === 'cafe' ? sill + wh * 0.62 : yRod - 0.03;
    const closed = style === 'drapes' && u01(seed, 5) < 0.28;
    const pw = closed ? span / 2 - 0.01 : Math.max(0.3, span * 0.22);
    const nf = Math.max(4, Math.round(pw / 0.075));
    panel(b, P, u - span / 2, u - span / 2 + pw, yLow, yTop, 0.055, col, nf);
    panel(b, P, u + span / 2 - pw, u + span / 2, yLow, yTop, 0.055, col, nf);
    if (style === 'cafe') panel(b, P, u - span / 2 + pw, u + span / 2 - pw, sill + 0.04, sill + 0.04 + wh * 0.3, 0.05, mulc(col, 1.04), Math.round(nf * 1.4));
    const rc = pick([0x3a2a1c, 0x8a8478, 0x2a2a2c], seed, 6), rl = span + 0.12, rp = P(u, yTop + 0.02, 0.07);   // rod + finials
    b.box('metal_dark', rp[0], rp[1], rp[2], along ? rl : 0.025, 0.025, along ? 0.025 : rl, { col: rc });
    for (const sg of [-1, 1]) { const f = P(u + sg * (rl / 2), yTop + 0.02, 0.07); b.box('metal_dark', f[0], f[1], f[2], 0.045, 0.045, 0.045, { col: rc }); }
    n++;
  }
  return n;
}
