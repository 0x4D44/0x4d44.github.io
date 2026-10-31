// Window placement on exterior walls (pure data). Windows follow vertical "bays" shared by all floors so facades read as designed.
import { clamp, round2 } from './geom.js';

/** Per room type window recipe: w range, sill, head (top), max count, kind, grille bias. */
const SPEC = {
  living: { w: [1.3, 1.7], sill: [0.9, 1.05], head: 2.15, max: 2, kinds: ['casement', 'sliding', 'casement'] },
  dining: { w: [1.1, 1.4], sill: [0.95, 1.05], head: 2.1, max: 1, kinds: ['casement', 'sliding'] },
  bedroom: { w: [1.1, 1.5], sill: [0.9, 1.05], head: 2.1, max: 2, kinds: ['casement', 'sliding'] },
  kitchen: { w: [1.0, 1.3], sill: [1.0, 1.1], head: 2.1, max: 1, kinds: ['casement', 'louvre'] },
  bathroom: { w: [0.55, 0.65], sill: [1.55, 1.6], head: 2.1, max: 1, kinds: ['louvre'] },
  shop: { w: [1.5, 2.3], sill: [0.45, 0.55], head: 2.15, max: 1, kinds: ['fixed'] },
  backroom: { w: [0.8, 1.0], sill: [1.3, 1.4], head: 2.1, max: 1, kinds: ['louvre', 'casement'] },
  entry: { w: [0.6, 0.7], sill: [1.0, 1.1], head: 2.1, max: 1, kinds: ['fixed'] },
  hall: { w: [0.7, 0.8], sill: [1.0, 1.1], head: 2.1, max: 1, kinds: ['fixed'] },
  landing: { w: [0.7, 0.8], sill: [1.0, 1.1], head: 2.1, max: 1, kinds: ['fixed'] },
  corridor: { w: [0.6, 0.8], sill: [1.0, 1.1], head: 2.1, max: 1, kinds: ['fixed'] },
  stairwell: { w: [0.7, 0.8], sill: [1.0, 1.1], head: 2.1, max: 1, kinds: ['fixed'] },
  classroom: { w: [1.5, 1.9], sill: [0.95, 1.05], head: 2.2, max: 3, kinds: ['sliding', 'casement'] },
  office: { w: [1.2, 1.5], sill: [0.95, 1.05], head: 2.15, max: 2, kinds: ['casement', 'sliding'] },
  workshop: { w: [1.2, 1.6], sill: [1.3, 1.5], head: 2.3, max: 2, kinds: ['fixed', 'louvre'] },
  chapel: { w: [0.9, 1.1], sill: [2.2, 2.3], head: 3.9, max: 3, kinds: ['fixed'] },          // tall round-headed lights high in a 4.9 m nave (the Stations hang below them)
  garage: { w: [0.8, 1.0], sill: [1.4, 1.5], head: 2.1, max: 1, kinds: ['louvre'] },
  laundry: { w: [0.9, 1.1], sill: [1.1, 1.2], head: 2.1, max: 1, kinds: ['louvre'] },
};

const OUT = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] };

export function addWindow(S, room, side, u, w, h, sill, kind, grille) {
  const te = S.te, W = S.W, D = S.D;
  const x = side === 'front' || side === 'back' ? u : (side === 'left' ? -W / 2 + te / 2 : W / 2 - te / 2);
  const z = side === 'left' || side === 'right' ? u : (side === 'front' ? D / 2 - te / 2 : -D / 2 + te / 2);
  const id = `${S.lot.id}.w${S.seq.win++}`;
  const [nx, nz] = OUT[side];
  const win = { id, room: room.id, x: round2(x), z: round2(z), y: round2(sill), w: round2(w), h: round2(h), nx, nz, kind, grille: !!grille, side, floor: room.floor };
  if (room.type === 'chapel' && kind === 'fixed') win.arch = true;                          // a church window has a round head, like the arch over the door (shell.js `reveals`, shellwin.js `archRise`)
  S.windows.push(win); room.windows.push(id);
  return win;
}

/** From a stair surface to the sill of a window above it: just above the waist, a little under a window from a floor (1.0 m) because it is read over a handrail. */
const STAIR_SILL = 0.8;
/** The lowest a stair sill may hang over the surface when 0.8 m would squeeze the glass under the ceiling (a half landing 1.4 m up in a 2.6 m room): a low sill over the rail. */
const STAIR_SILL_MIN = 0.6;
/** Shortest window worth cutting; a stair window squeezed under the ceiling into less than this is left out. */
const MIN_WIN_H = 0.45;
const ceil2 = (v) => Math.ceil(v * 100 - 1e-6) / 100, floor2 = (v) => Math.floor(v * 100 + 1e-6) / 100;

/**
 * A window of a stair room hangs from the stair, not from the storey: the sill is lifted to STAIR_SILL above the highest tread, landing or half landing that runs past the glass
 * (the half landing of a dogleg is mid-storey, 1.4 - 1.6 m up, so the usual 1.0 m sill would start under its floor; where that leaves too little glass under the ceiling the sill
 * drops to STAIR_SILL_MIN), and the head stays 0.15 m under the ceiling (`S.h`, the clear height: a window never cuts into the slab).
 * A stair that passes above the glass (the flight to the next floor along the wall) does not count: that window lights the nook under it. Returns { sill, head } on the 0.01 m grid
 * (the sill rounded up and the head down, so adding the two rounded numbers never reaches past the ceiling), or null when what is left is lower than MIN_WIN_H and the window should go.
 */
export function stairClear(S, room, side, c, w, sill, head) {
  const core = S.core;
  if (!core || !room.core) return { sill, head };
  const base = room.floor * S.fh, cap = floor2(S.h - 0.15 - 1e-6), { inner } = S, n = Math.max(2, Math.ceil(w / 0.1));
  const at = (u) => (side === 'front' ? [u, inner.z1 - 0.3] : side === 'back' ? [u, inner.z0 + 0.3] : side === 'left' ? [inner.x0 + 0.3, u] : [inner.x1 - 0.3, u]);
  const high = [];
  for (let i = 0; i <= n; i++) for (const y of core.surfacesAt(...at(c - w / 2 + (w * i) / n))) high.push(y - base);
  for (const clear of [STAIR_SILL, STAIR_SILL_MIN]) {
    let s = sill, h = head;
    for (let i = 0; i < 4; i++) {
      const s2 = Math.max(sill, ...high.filter((y) => y - core.rise < h - 0.2).map((y) => y + clear));       // (the ramp through the tread tops is up to a rise above the tread: judge "above the glass" by the lower bound)
      if (s2 <= s + 1e-9) break;
      s = s2; h = Math.min(cap, Math.max(head, s + (head - sill)));
    }
    if (s === sill) return { sill, head: Math.min(head, cap) };                                               // nothing runs past the glass: the usual window
    const sc = ceil2(s), hc = floor2(h);
    if (hc - sc >= MIN_WIN_H - 1e-9) return { sill: sc, head: hc };
  }
  return null;
}

/** Fill every exterior side of every storey with windows. */
export function genWindows(S) {
  const { inner } = S, rng = S.rng.fork('windows');
  const sides = ['front', 'back', 'left', 'right'];
  const bayCache = {};
  const bays = (side, lo, len) => {
    if (bayCache[side]) return bayCache[side];
    const n = Math.max(1, Math.round(len / (side === 'front' ? 2.5 : 3.0)));
    return (bayCache[side] = Array.from({ length: n }, (_, i) => lo + ((i + 0.5) * len) / n));
  };
  for (let k = 0; k < S.F; k++) {
    const fd = S.floorsData[k];
    if (fd.open) continue;                               // open deck: no windows
    for (const side of sides) {
      if (S.party[side]) continue;
      const horiz = side === 'front' || side === 'back';
      const lo = horiz ? inner.x0 : inner.z0, hi = horiz ? inner.x1 : inner.z1;
      const centres = bays(side, lo, hi - lo);
      const blocked = S.doors.filter((d) => d.ext && d.side === side && d.floor === k).map((d) => { const c = horiz ? d.x : d.z; return [c - d.w / 2 - 0.3, c + d.w / 2 + 0.3]; });
      for (const id of fd.rooms) {
        const room = S.roomById(id), spec = SPEC[room.type];
        if (!spec || room.outdoor) continue;
        const r = room.rect;
        const touches = side === 'front' ? Math.abs(r.z1 - inner.z1) < 1e-3 : side === 'back' ? Math.abs(r.z0 - inner.z0) < 1e-3 : side === 'left' ? Math.abs(r.x0 - inner.x0) < 1e-3 : Math.abs(r.x1 - inner.x1) < 1e-3;
        if (!touches) continue;
        // stair rooms: only the landing zone has room for a window (it is the part against a plain wall)
        const a0 = (horiz ? r.x0 : r.z0) + 0.32, a1 = (horiz ? r.x1 : r.z1) - 0.32;
        if (a1 - a0 < spec.w[0]) continue;
        // shop windows only on the front; bathrooms and back rooms prefer not to face the street
        if (room.type === 'shop' && side !== 'front') continue;
        if ((room.type === 'bathroom' || room.type === 'backroom') && side === 'front') continue;
        let placed = 0;
        const order = centres.map((c, i) => ({ c, i })).sort((p, q) => Math.abs(p.c - (a0 + a1) / 2) - Math.abs(q.c - (a0 + a1) / 2));
        const taken = [];
        for (const { c } of order) {
          if (placed >= spec.max) break;
          const w = round2(rng.range(spec.w[0], spec.w[1]));
          if (c - w / 2 < a0 || c + w / 2 > a1) continue;
          if (blocked.some((b) => c + w / 2 > b[0] && c - w / 2 < b[1])) continue;
          if (taken.some((t) => Math.abs(t - c) < w + 0.4)) continue;
          // draw everything the window needs before testing the stair, so a window that is dropped leaves the random stream exactly where a placed one would
          const sill0 = round2(rng.range(spec.sill[0], spec.sill[1])), kind = rng.pick(spec.kinds);
          const grille = (k === 0 ? (side === 'front' ? rng.chance(0.65) : rng.chance(0.4)) : rng.chance(0.12)) && room.type !== 'shop' && kind !== 'louvre';
          const fit = stairClear(S, room, side, c, w, sill0, spec.head);                   // a stair window hangs from the stair running past it, not from the storey
          if (!fit) continue;
          taken.push(c); placed++;
          addWindow(S, room, side, c, w, round2(fit.head - fit.sill), fit.sill, kind, grille);
        }
        // nothing fitted a bay but the span is wide: one centred window
        if (!placed && a1 - a0 >= spec.w[1] + 0.2) {
          const c = (a0 + a1) / 2, w = round2(clamp(spec.w[0] + 0.1, spec.w[0], a1 - a0 - 0.1));
          if (!blocked.some((b) => c + w / 2 > b[0] && c - w / 2 < b[1])) {
            const sill0 = round2(rng.range(spec.sill[0], spec.sill[1])), kind = rng.pick(spec.kinds), grille = k === 0 && side === 'front' && room.type !== 'shop' && rng.chance(0.5);
            const fit = stairClear(S, room, side, c, w, sill0, spec.head);
            if (fit) addWindow(S, room, side, c, w, round2(fit.head - fit.sill), fit.sill, kind, grille);
          }
        }
      }
    }
  }
  lightFlagged(S);
}

/** The narrowest glass worth cutting into a room that has none (a bedroom with a 0.6 m slit is not lit). */
const NEED_MIN_W = 0.9;

/**
 * A room the layout flagged `needsWindow` (a flat's bedroom and living room: a room to live in is lit) that the bays left without glass gets one on its widest free piece of exterior wall,
 * as wide as its type's recipe and the piece allow, centred in it. It runs after every other window and draws from a stream of its own, so no other window moves; a room with no free
 * exterior wall (party walls all round) or no piece of at least NEED_MIN_W stays dark.
 */
function lightFlagged(S) {
  for (const room of S.rooms) {
    if (!room.needsWindow || room.outdoor || room.windows.length) continue;
    const spec = SPEC[room.type], r = room.rect, nr = S.rng.fork('light:' + room.id);
    if (!spec) continue;
    let best = null;
    for (const side of ['front', 'back', 'left', 'right']) {
      if (S.party[side]) continue;
      const horiz = side === 'front' || side === 'back', { inner } = S;
      const touches = side === 'front' ? Math.abs(r.z1 - inner.z1) < 1e-3 : side === 'back' ? Math.abs(r.z0 - inner.z0) < 1e-3 : side === 'left' ? Math.abs(r.x0 - inner.x0) < 1e-3 : Math.abs(r.x1 - inner.x1) < 1e-3;
      if (!touches) continue;
      const lo = (horiz ? r.x0 : r.z0) + 0.32, hi = (horiz ? r.x1 : r.z1) - 0.32;
      let free = [[lo, hi]];                                                               // the span minus every outside door of this wall on this floor (0.3 m clear of its jambs)
      for (const d of S.doors) {
        if (!d.ext || d.side !== side || d.floor !== room.floor) continue;
        const c = horiz ? d.x : d.z, b0 = c - d.w / 2 - 0.3, b1 = c + d.w / 2 + 0.3;
        free = free.flatMap(([a, b]) => (b1 <= a || b0 >= b ? [[a, b]] : [[a, Math.min(b, b0)], [Math.max(a, b1), b]].filter(([p, q]) => q > p)));
      }
      for (const [a, b] of free) if (b - a >= NEED_MIN_W && (!best || b - a > best.len)) best = { side, c: (a + b) / 2, len: b - a };
    }
    if (!best) continue;
    const w = round2(Math.min(spec.w[1], best.len - 0.1)), sill = round2(nr.range(spec.sill[0], spec.sill[1])), kind = nr.pick(spec.kinds);
    addWindow(S, room, best.side, best.c, w, round2(spec.head - sill), sill, kind, false);
  }
}
