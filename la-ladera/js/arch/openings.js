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
  stairwell: { w: [0.7, 0.8], sill: [1.0, 1.1], head: 2.1, max: 1, kinds: ['fixed'] },
  classroom: { w: [1.5, 1.9], sill: [0.95, 1.05], head: 2.2, max: 3, kinds: ['sliding', 'casement'] },
  office: { w: [1.2, 1.5], sill: [0.95, 1.05], head: 2.15, max: 2, kinds: ['casement', 'sliding'] },
  workshop: { w: [1.2, 1.6], sill: [1.3, 1.5], head: 2.3, max: 2, kinds: ['fixed', 'louvre'] },
  chapel: { w: [0.8, 1.0], sill: [1.5, 1.7], head: 2.5, max: 3, kinds: ['fixed'] },
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
  S.windows.push(win); room.windows.push(id);
  return win;
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
          taken.push(c); placed++;
          const sill = round2(rng.range(spec.sill[0], spec.sill[1]));
          const h = round2(spec.head - sill);
          const kind = rng.pick(spec.kinds);
          const grille = (k === 0 ? (side === 'front' ? rng.chance(0.65) : rng.chance(0.4)) : rng.chance(0.12)) && room.type !== 'shop' && kind !== 'louvre';
          addWindow(S, room, side, c, w, h, sill, kind, grille);
        }
        // nothing fitted a bay but the span is wide: one centred window
        if (!placed && a1 - a0 >= spec.w[1] + 0.2) {
          const c = (a0 + a1) / 2, w = round2(clamp(spec.w[0] + 0.1, spec.w[0], a1 - a0 - 0.1));
          if (!blocked.some((b) => c + w / 2 > b[0] && c - w / 2 < b[1])) {
            const sill = round2(rng.range(spec.sill[0], spec.sill[1]));
            addWindow(S, room, side, c, w, round2(spec.head - sill), sill, rng.pick(spec.kinds), k === 0 && side === 'front' && room.type !== 'shop' && rng.chance(0.5));
          }
        }
      }
    }
  }
}
