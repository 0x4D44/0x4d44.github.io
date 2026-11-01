// What makes one kit house look unlike the next (R1-D20, round 5: "clusters of the same red box houses on bare grass").
// vista-plan.js lays the terraces out and picks each tile's few facade, roof and detail pieces; it stays exactly as it was (its layout and piece ids do not move). This file only decides
// how each planned piece is DRAWN: the paint of its house, how tall that house stands, how far it steps forward of the row, which way round its roof turns. Pure data (no renderer), a
// function of the plan alone: the same seed gives the same houses, and the node tests walk the very numbers vista-kit.js's instancing uses.
//   kitLook(planned, baseOf, seed) -> [{ color: [r,g,b], y, sy, dx, dz, dry }] one entry per planned piece, in order
//   color = the instance colour the piece is multiplied by (linear light, the planner's own `shade` included); y the base the piece is drawn at; sy the factor on its scale in y;
//   (dx, dz) a step along the row's front; dry a turn about the piece's own axis.
// `baseOf(piece)` is the piece's own average vertex colour (linear light, from its GLB): a paint is a multiplier, target / base, so the houses keep their windows, trim and brick joints.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 32-bit FNV-1a of a string: the one source of every choice below, so no random stream is shared with (or moved by) another module. */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}
/** a number in [0, 1) from a key */
export const unit = (key) => hash32(key) / 4294967296;
const weighted = (u, list) => {
  let total = 0; for (const e of list) total += e.w;
  let at = u * total;
  for (const e of list) { at -= e.w; if (at < 0) return e; }
  return list[list.length - 1];
};

// Targets in LINEAR light (sRGB 0.5 is 0.21): what a barrio is painted, or left. `c: null` keeps the colours baked into the piece (raw brick, the kit's own beige render).
export const PAINTS = Object.freeze([
  { name: 'lime', c: [0.80, 0.77, 0.66], w: 3 }, { name: 'ochre', c: [0.66, 0.37, 0.10], w: 2 }, { name: 'sky', c: [0.24, 0.45, 0.72], w: 1.6 },
  { name: 'turquoise', c: [0.16, 0.54, 0.38], w: 1.4 }, { name: 'salmon', c: [0.78, 0.31, 0.26], w: 1.6 }, { name: 'terracotta', c: [0.55, 0.14, 0.06], w: 1.4 },
  { name: 'lilac', c: [0.44, 0.31, 0.66], w: 0.8 }, { name: 'yellow', c: [0.86, 0.62, 0.10], w: 1.3 }, { name: 'green', c: [0.25, 0.50, 0.17], w: 0.9 },
  { name: 'block', c: [0.33, 0.33, 0.31], w: 2 }, { name: 'orange', c: [0.80, 0.26, 0.06], w: 0.8 }, { name: 'baked', c: null, w: 5 },
]);
export const ROOF_PAINTS = Object.freeze([
  { name: 'zinc', c: [0.45, 0.47, 0.50], w: 3 }, { name: 'rust', c: [0.33, 0.15, 0.07], w: 2 }, { name: 'clay', c: [0.46, 0.17, 0.09], w: 1.5 }, { name: 'blue', c: [0.10, 0.20, 0.40], w: 1 },
  { name: 'green', c: [0.12, 0.28, 0.16], w: 0.8 }, { name: 'concrete', c: [0.40, 0.39, 0.36], w: 2 }, { name: 'red', c: [0.50, 0.07, 0.05], w: 0.8 }, { name: 'baked', c: null, w: 2 },
]);
export const TANK_PAINTS = Object.freeze([
  { name: 'black', c: [0.05, 0.05, 0.05], w: 2 }, { name: 'blue', c: [0.08, 0.20, 0.50], w: 2 }, { name: 'white', c: [0.78, 0.78, 0.76], w: 1.5 }, { name: 'clay', c: [0.50, 0.20, 0.10], w: 0.5 }, { name: 'baked', c: null, w: 1 },
]);
export const RAIL_PAINTS = Object.freeze([
  { name: 'black', c: [0.04, 0.04, 0.045], w: 2 }, { name: 'white', c: [0.70, 0.70, 0.68], w: 1 }, { name: 'green', c: [0.09, 0.30, 0.15], w: 1 }, { name: 'blue', c: [0.10, 0.20, 0.40], w: 1 }, { name: 'baked', c: null, w: 2 },
]);

/** The multiplier that turns a piece of average colour `base` into `target`, kept inside 0.35..3.2 per channel and 90 % of the way (the rest is the baked colour: a house is never a flat swatch). */
export function paintTint(base, target) {
  return target.map((t, k) => 1 + (clamp(t / Math.max(0.03, base[k]), 0.35, 3.2) - 1) * 0.9);
}

const HEIGHT = [0.88, 1.14];                    // a house stands this fraction of its planned height, about its foot: neighbours differ by a parapet
const FRONT = 0.34;                             // and steps this far (m) forward or back of the row, so a terrace is not a ruler's edge

/** The look of every house of the plan: { paint, roofPaint, tank, rail, height, front, flip }. Keyed by the house id and the plan's seed: nothing else moves it. */
export function houseLooks(planned, seed = 0) {
  const looks = new Map();
  for (const h of planned.houses) {
    const k = `${seed}:${h.id}`;
    looks.set(h.id, {
      paint: weighted(unit(k + ':paint'), PAINTS), roofPaint: weighted(unit(k + ':roof'), ROOF_PAINTS), tank: weighted(unit(k + ':tank'), TANK_PAINTS), rail: weighted(unit(k + ':rail'), RAIL_PAINTS),
      height: HEIGHT[0] + (HEIGHT[1] - HEIGHT[0]) * unit(k + ':height'), front: (unit(k + ':front') * 2 - 1) * FRONT, flip: unit(k + ':flip') < 0.5,
      tone: 0.86 + 0.3 * unit(k + ':tone'), warm: unit(k + ':warm') - 0.5,
    });
  }
  return looks;
}

export function kitLook(planned, baseOf, seed = 0) {
  const looks = houseLooks(planned, seed), houses = new Map(planned.houses.map((h) => [h.id, h]));
  return planned.pieces.map((p) => {
    const L = looks.get(p.house), h = houses.get(p.house), out = { color: [p.shade, p.shade, p.shade], y: p.y, sy: 1, dx: 0, dz: 0, dry: 0 };
    if (!L || !h) {                                                    // a stair belongs to no house: it keeps its place, and only its tone moves
      const t = 0.9 + 0.2 * unit(`${seed}:${p.id}:tone`); out.color = [p.shade * t, p.shade * t, p.shade * t];
      return out;
    }
    const base = baseOf(p);
    const tint = (paint) => {
      if (paint.c) return paintTint(base, paint.c);
      const t = L.tone;                                                // the baked colours, a little lighter or darker, a little warm or cool: brick that was fired in another week
      return [t * (1 + 0.1 * L.warm), t, t * (1 - 0.1 * L.warm)];
    };
    let rgb = [1, 1, 1];
    switch (p.category) {
      case 'facade': rgb = /^brick/.test(p.key) ? tint({ c: null }) : tint(L.paint); break;
      case 'roof': rgb = tint(L.roofPaint); break;
      case 'tank': rgb = tint(L.tank); break;
      case 'balcony': rgb = tint(L.rail); break;
      case 'retaining': { const t = 0.8 + 0.35 * unit(`${seed}:${h.id}:wall`); rgb = [t, t, t]; break; }
      default: rgb = [1, 1, 1];
    }
    out.color = rgb.map((v) => v * p.shade);
    if (p.category !== 'retaining') {                                  // a taller or lower house: everything above the foot moves with it; only the walls of the floors stretch
      out.y = h.y + (p.y - h.y) * L.height;
      if (p.category === 'facade') out.sy = L.height;
    }
    if (p.category === 'roof' && L.flip) out.dry = Math.PI;            // a roof's room, hut or slope the other way round: its footprint is the same either way
    out.dx = Math.sin(p.ry) * L.front; out.dz = Math.cos(p.ry) * L.front;
    return out;
  });
}

/** The average vertex colour (linear light) of a list of GLB parts, memoised by the caller. */
export function averageColour(parts) {
  let r = 0, g = 0, b = 0, n = 0;
  for (const part of parts) {
    const col = part.geometry.getAttribute('color');
    if (!col) continue;
    for (let i = 0; i < col.count; i++) { r += col.getX(i); g += col.getY(i); b += col.getZ(i); n++; }
  }
  return n ? [r / n, g / n, b / n] : [0.3, 0.3, 0.3];
}
