// The nave of a chapel lot as a place of worship (R1-D06, owner A2): a tall nave with a pine ceiling on beams, a sanctuary one step up with an altar,
// a gilded retablo, a red sanctuary lamp, two niches (the Virgin with a halo of small lights, San José), the fourteen Stations of the Cross each with its own
// numeral and its own little painted relief, clean pew rows facing the altar with a centre aisle, a checker aisle runner, a holy-water stoup, a bell rope
// and hanging lamps. Two halves:
//   * `chapelFurnish(L, E, hh, helpers)` runs inside A3's `chapel()` (interiors/special.js, one hook line) and places the pieces A3's catalogue owns
//     (altar, statues, lectern, kneelers, pews, candle rack) through his own Layout calls, so they are furniture records with blockers like any other;
//   * `buildChapelInterior(ctx, bp)` runs from `buildBuilding` and draws what is architecture or decoration (retablo, Stations, niches, beams, lamps,
//     floor pattern) as ONE group `<id>.chapel.int` (gated like every `.int` group, never casts a shadow, 7 materials, all existing).
// Everything is authored in building-local coordinates; the nave rect is the only input besides the altar record (found by flag).
import { lin, qd, bar, triFacing, hash01 } from './mb.js';

export const NAVE_H = 4.9;          // clear height of the nave; layouts.js raises the storey to NAVE_H + 0.3
export const LOW_H = 2.9;           // sacristy and bathroom ceilings
export const DAIS_H = 0.16;         // the sanctuary step (a plan platform: collider floor patch + the wooden deck of shellwin.js)
export const DAIS_D = 2.7;          // its depth from the back wall
export const DAIS_HALF = 3.4;       // its half width
export const AISLE = 1.2;           // centre aisle (>= 0.9 asked)
export const SIDE_AISLE = 0.85;     // between the pew blocks and the side walls
export const ROW_PITCH = 1.25;
export const MATERIALS = ['wood_dark_door', 'frame_paint', 'plaster_a', 'candle_flame', 'led_red', 'bulb_glow', 'floor_tile_checker'];

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];
const RED = 0xa82a2a, BLUE = 0x2c4a8c, WHITE = 0xe8e4da, OCHRE = 0xb08a40, GREY = 0x8a8a90, PURPLE = 0x6a4a8a, GREEN = 0x3a6a5a, ROSE = 0x8a3a5a;
/** The Stations: sky / ground colour of the painted plate, the figures [h offset, 'stand'|'kneel'|'lie', robe, scale] and one extra (beam, cross, cloth, ladder, tomb...). No two alike. */
export const STATIONS = [
  { sky: 0x7d93a8, gr: 0x6b5a45, f: [[-0.1, 's', WHITE], [0.1, 's', RED, 0.9]], x: 'column' },
  { sky: 0xa89a78, gr: 0x5c4a38, f: [[0, 's', RED]], x: 'carry' },
  { sky: 0x8aa0a0, gr: 0x7a6044, f: [[0, 'k', RED]], x: 'fall' },
  { sky: 0xb0a0b8, gr: 0x5a4a50, f: [[-0.1, 's', RED], [0.1, 's', BLUE]], x: 'carry' },
  { sky: 0x98a888, gr: 0x6a5c40, f: [[-0.08, 's', RED], [0.1, 's', OCHRE]], x: 'carry' },
  { sky: 0xc0b098, gr: 0x66503c, f: [[-0.08, 's', RED], [0.1, 's', WHITE]], x: 'cloth' },
  { sky: 0x889098, gr: 0x7a6a50, f: [[-0.08, 'k', RED], [0.12, 's', PURPLE]], x: 'fall' },
  { sky: 0xa8a090, gr: 0x5a4838, f: [[-0.12, 's', RED], [0.02, 's', GREEN], [0.14, 's', ROSE, 0.85]], x: 'none' },
  { sky: 0x707a88, gr: 0x806a4c, f: [[0, 'l', RED]], x: 'carry' },
  { sky: 0xb89080, gr: 0x6a5240, f: [[-0.1, 's', 0xe0d8c8], [0.1, 's', GREY]], x: 'none' },
  { sky: 0x9a7a70, gr: 0x5a4636, f: [[0, 'l', 0xe0d8c8], [0.16, 's', 0x4a4a52]], x: 'flatcross' },
  { sky: 0x4a5266, gr: 0x4a3c30, f: [[-0.14, 's', BLUE], [0.14, 's', 0xa83a3a]], x: 'cross' },
  { sky: 0x6a7a8c, gr: 0x5c4c3c, f: [[0, 'k', BLUE]], x: 'ladder' },
  { sky: 0x30343c, gr: 0x544432, f: [[-0.14, 's', WHITE], [0.14, 's', OCHRE]], x: 'tomb' },
];

// ------------------------------------------------------------------------------------------------------------------ furnish (A3's Layout API)
/**
 * Place the chapel's furniture records. Returns false (nothing placed that matters) when the nave has no entrance on its +z wall or the altar will not fit:
 * A3's own `chapel()` then runs as before. `H` carries his helpers so this module imports nothing from interiors/.
 */
export function chapelFurnish(L, E, hh, H) {
  const { D, fillMin, moreLights } = H, r = L.r, head = '-z';
  if (!L.obs['+z'].some((o) => o.kind === 'door')) return false;
  const altar = L.wall('altar_main', head, { at: 'center', prio: 0, winOk: true });
  if (!altar) return false;
  altar.flags = { altar: true, chapel: true };
  L.top(altar, 'candles_set', { at: 'left' }); L.top(altar, 'candles_set', { at: 'right' }); L.top(altar, 'vase_flowers', { at: 'center' });
  L.hang('crucifix_large', head, { over: altar, y: 2.0 });
  for (const side of [-1, 1]) {
    const [x, z] = L.rel(altar, side * (altar.w / 2 + 0.75), 0.1);
    const st = L.at('statue_saint_large', x, z, altar.ry, { prio: 1, winOk: true });
    if (st) st.flags = { statue: true };
  }
  L.at('lectern', ...L.rel(altar, altar.w / 2 + 1.6, 0.6), altar.ry + 0.3, { prio: 2, winOk: true });
  L.at('kneeler', ...L.rel(altar, 0, altar.d / 2 + 0.9), altar.ry, { prio: 2 });
  L.at('candle_rack', ...L.rel(altar, -(altar.w / 2 + 1.5), 0.3), altar.ry, { prio: 2, winOk: true });
  // pews: rows facing the altar, a centre aisle, a side aisle against each wall; one long pew and a short one per side where the nave is wide enough
  const W = r.x1 - r.x0, depth = L.D, cx = (r.x0 + r.x1) / 2, aisle = W >= 8 ? AISLE : 0.9, room = (W - aisle) / 2 - SIDE_AISLE;
  const blocks = room >= 3.8 ? [['bench_pew', 2.2], ['bench_pew_short', 1.6]] : room >= 2.2 ? [['bench_pew', 2.2]] : room >= 1.6 ? [['bench_pew_short', 1.6]] : [];
  for (let t = DAIS_D + 1.25; t + 0.3 <= depth - 1.4; t += ROW_PITCH) {
    for (const sg of [-1, 1]) {
      let u = aisle / 2;
      for (const [name, w] of blocks) {
        const p = L.at(name, cx + sg * (u + w / 2), r.z0 + t, Math.PI, { prio: 1, tint: 0x8a5a3a });
        if (p) p.flags = { pew: true };
        u += w;
      }
    }
  }
  // wall decor: the Virgin and the Stations are architecture here (buildChapelInterior); the calendar and the blessing hang by the door
  D(L, 'calendar_church', '+z'); D(L, 'blessing', '+z');
  for (let k = 0; k < 2; k++) L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 });
  const cz = (r.z0 + r.z1) / 2;
  L.ceil('bulb_bare', cx, cz);
  L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffe0b0, i: 9, d: 13 };
  moreLights(L, 'bulb');
  fillMin(L, E, hh, 8);
  return true;
}

// ------------------------------------------------------------------------------------------------------------------ drawing helpers
/** The four walls of the nave as frames: P(along, h, y, t) is a building-local point `t` out of the wall, `along` the coordinate along it and `h` an offset to the reader's right. */
function wallFrame(r, side) {
  switch (side) {
    case 'L': return { nrm: [1, 0, 0], P: (a, h, y, t) => [r.x0 + t, y, a - h] };
    case 'R': return { nrm: [-1, 0, 0], P: (a, h, y, t) => [r.x1 - t, y, a + h] };
    case 'H': return { nrm: [0, 0, 1], P: (a, h, y, t) => [a - h, y, r.z0 + t] };
    default: return { nrm: [0, 0, -1], P: (a, h, y, t) => [a + h, y, r.z1 - t] };
  }
}
const GOLD = lin(0xd9a73a), GOLD_D = lin(0xa87a22), CREAM = lin(0xf2eee4), DARK = lin(0x2a2420), SKIN = lin(0xd8a878), PANEL_BLUE = lin(0x1d3a6b);

/** An axis-aligned box on a wall frame: centre (a, h, y, t), size dh along the wall, dy tall, dt out of the wall. */
function wb(b, F, mat, a, h, y, t, dh, dy, dt, col, skip) {
  const [x, yy, z] = F.P(a, h, y, t), onX = F.nrm[0] === 0;
  b.box(mat, x, yy, z, onX ? dh : dt, dy, onX ? dt : dh, { col, skip });
}
const cone = (b, F, mat, a, h, y, t, r, hgt, r1, col, seg = 8, caps = true) => { const [x, , z] = F.P(a, h, y, t); b.cyl(mat, x, y, z, r, hgt, seg, { r1, col, caps }); };
const flat = (b, F, mat, pts, col) => qd(b, mat, pts[0], pts[1], pts[2], pts[3], F.nrm, { col });

/** A stroke of a Roman numeral: a thin quad between two points of the wall plane, `w` wide. */
function stroke(b, F, a, h0, y0, h1, y1, w, t, col) {
  const dh = h1 - h0, dy = y1 - y0, l = Math.hypot(dh, dy) || 1, ph = (-dy / l) * w / 2, py = (dh / l) * w / 2;
  flat(b, F, 'frame_paint', [F.P(a, h0 + ph, y0 + py, t), F.P(a, h1 + ph, y1 + py, t), F.P(a, h1 - ph, y1 - py, t), F.P(a, h0 - ph, y0 - py, t)], col);
}
const GLYPH_W = { I: 0.3, V: 0.62, X: 0.62 };
/** The strokes of a numeral in a unit-high cell: [[h0, y0, h1, y1]] with h centred on 0 (the caller scales). Exported for the test. */
export function numeralStrokes(rom) {
  const gap = 0.2, total = [...rom].reduce((s, c) => s + GLYPH_W[c], 0) + gap * (rom.length - 1), out = [];
  let x = -total / 2;
  for (const c of rom) {
    const w = GLYPH_W[c], m = x + w / 2;
    if (c === 'I') out.push([m, 0, m, 1]);
    else if (c === 'V') { out.push([m - w / 2, 1, m, 0]); out.push([m + w / 2, 1, m, 0]); }
    else { out.push([m - w / 2, 1, m + w / 2, 0]); out.push([m - w / 2, 0, m + w / 2, 1]); }
    x += w + gap;
  }
  return out;
}

function person(b, F, a, h, y, t, s, robe, kind) {
  const col = lin(robe);
  if (kind === 'l') {                                                                    // lying
    bar(b, 'plaster_a', F.P(a, h - 0.1 * s, y + 0.03 * s, t), F.P(a, h + 0.08 * s, y + 0.03 * s, t), 0.05 * s, 0.05 * s, { col });
    cone(b, F, 'plaster_a', a, h - 0.13 * s, y, t, 0.025 * s, 0.05 * s, 0.025 * s, SKIN, 6, false);
  } else if (kind === 'k') {                                                             // kneeling
    cone(b, F, 'plaster_a', a, h, y, t, 0.055 * s, 0.13 * s, 0.025 * s, col, 8, false);
    cone(b, F, 'plaster_a', a, h, y + 0.13 * s, t, 0.022 * s, 0.045 * s, 0.022 * s, SKIN, 6, false);
  } else {                                                                               // standing
    cone(b, F, 'plaster_a', a, h, y, t, 0.048 * s, 0.2 * s, 0.022 * s, col, 8, false);
    cone(b, F, 'plaster_a', a, h, y + 0.2 * s, t, 0.022 * s, 0.045 * s, 0.022 * s, SKIN, 6, false);
  }
}

/** One Station: gilt-edged dark frame, the painted plate (sky over ground), its figures and extra, and a gold cartouche with the numeral above. */
function station(b, F, a, yc, k) {
  const S = STATIONS[k], yb = yc - 0.35, yg = yb + 0.26;
  for (const sg of [-1, 1]) wb(b, F, 'wood_dark_door', a, sg * 0.24, yc, 0.035, 0.04, 0.7, 0.07, undefined);
  for (const sg of [-1, 1]) wb(b, F, 'wood_dark_door', a, 0, yc + sg * 0.33, 0.035, 0.52, 0.04, 0.07, undefined);
  wb(b, F, 'frame_paint', a, 0, yb + 0.15, 0.02, 0.44, 0.22, 0.03, lin(S.gr));
  wb(b, F, 'frame_paint', a, 0, yb + 0.26 + 0.2, 0.02, 0.44, 0.4, 0.03, lin(S.sky));
  const ty = yg + 0.01;
  for (const [h, kind, robe, sc] of S.f) person(b, F, a, h, ty, 0.06, sc ?? 1, robe, kind);
  const c = lin(0x5a4026);
  switch (S.x) {
    case 'column': wb(b, F, 'plaster_a', a, -0.2, ty + 0.15, 0.06, 0.05, 0.3, 0.05, lin(GREY)); break;
    case 'carry': bar(b, 'wood_dark_door', F.P(a, S.f[0][0] - 0.1, ty + 0.11, 0.075), F.P(a, S.f[0][0] + 0.13, ty + 0.3, 0.075), 0.025, 0.025, { col: lin(0x9a7a50) }); break;
    case 'fall': bar(b, 'wood_dark_door', F.P(a, S.f[0][0] - 0.12, ty + 0.1, 0.075), F.P(a, S.f[0][0] + 0.16, ty + 0.04, 0.075), 0.025, 0.025, { col: lin(0x9a7a50) }); break;
    case 'cloth': wb(b, F, 'plaster_a', a, 0.0, ty + 0.15, 0.07, 0.07, 0.1, 0.012, CREAM); break;
    case 'cross': wb(b, F, 'wood_dark_door', a, 0, ty + 0.22, 0.07, 0.025, 0.42, 0.03, c); wb(b, F, 'wood_dark_door', a, 0, ty + 0.34, 0.07, 0.16, 0.025, 0.03, c); break;
    case 'flatcross': bar(b, 'wood_dark_door', F.P(a, -0.17, ty + 0.03, 0.075), F.P(a, 0.1, ty + 0.03, 0.075), 0.03, 0.03, { col: c }); break;
    case 'ladder': for (const o of [-0.03, 0.03]) bar(b, 'wood_dark_door', F.P(a, 0.1 + o * 0.5, ty, 0.075), F.P(a, 0.2 + o, ty + 0.4, 0.075), 0.015, 0.015, { col: c }); break;
    case 'tomb': wb(b, F, 'plaster_a', a, 0.0, ty + 0.1, 0.06, 0.18, 0.2, 0.04, lin(0x1a1816)); wb(b, F, 'plaster_a', a, 0.0, ty + 0.21, 0.06, 0.24, 0.025, 0.05, lin(GREY)); break;
    default: break;
  }
  wb(b, F, 'frame_paint', a, 0, yc + 0.35 + 0.1, 0.03, 0.3, 0.1, 0.04, GOLD);
  for (const [h0, y0, h1, y1] of numeralStrokes(ROMAN[k])) stroke(b, F, a, h0 * 0.07, yc + 0.35 + 0.1 + (y0 - 0.5) * 0.07, h1 * 0.07, yc + 0.35 + 0.1 + (y1 - 0.5) * 0.07, 0.013, 0.052, DARK);
  return { n: ROMAN[k], sky: S.sky, gr: S.gr, sig: JSON.stringify(S) };
}

/** A niche on a side wall: gilt frame round a blue panel, a shelf and a statue; the Virgin has a halo of small lights, San José a staff with a lily. */
function niche(b, F, a, kind, glow) {
  const virgin = kind === 'virgin';
  wb(b, F, 'frame_paint', a, 0, 2.1, 0.03, 0.98, 2.2, 0.06, PANEL_BLUE);
  for (const sg of [-1, 1]) wb(b, F, 'frame_paint', a, sg * 0.5, 2.1, 0.06, 0.07, 2.3, 0.12, GOLD);
  wb(b, F, 'frame_paint', a, 0, 3.24, 0.06, 1.08, 0.08, 0.12, GOLD);
  const apex = F.P(a, 0, 3.62, 0.06), l = F.P(a, -0.56, 3.28, 0.06), rr = F.P(a, 0.56, 3.28, 0.06);
  triFacing(b, 'frame_paint', l, rr, apex, F.nrm, { col: GOLD_D });
  wb(b, F, 'wood_dark_door', a, 0, 1.02, 0.14, 0.82, 0.06, 0.28, undefined);
  const y0 = 1.05, robe = virgin ? lin(WHITE) : lin(0x7a5230);
  cone(b, F, 'plaster_a', a, 0, y0, 0.14, virgin ? 0.17 : 0.16, 0.95, 0.08, robe, 10, false);
  cone(b, F, 'plaster_a', a, 0, y0 + 0.45, 0.14, 0.15, 0.5, 0.085, virgin ? lin(BLUE) : lin(OCHRE), 10, false);
  cone(b, F, 'plaster_a', a, 0, y0 + 0.95, 0.14, 0.045, 0.08, 0.045, SKIN, 8, true);
  if (virgin) {
    cone(b, F, 'frame_paint', a, 0, y0 + 1.03, 0.14, 0.05, 0.025, 0.05, GOLD, 8, true);
    const hc = [a, 0, y0 + 1.0, 0.2];                                                         // a halo of small lights round her head, on the panel behind her
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2, h = Math.cos(an) * 0.2, y = hc[2] + Math.sin(an) * 0.2, [x, yy, z] = F.P(a, h, y, 0.1);
      b.box('bulb_glow', x, yy, z, 0.03, 0.03, 0.03, {});
      glow(x, yy, z, 0xfff0c0, 0.16, 1.0);
    }
  } else {
    bar(b, 'wood_dark_door', F.P(a, 0.14, y0, 0.2), F.P(a, 0.14, y0 + 1.45, 0.2), 0.025, 0.025, { col: lin(0x6a4a2a) });
    cone(b, F, 'plaster_a', a, 0.14, y0 + 1.45, 0.2, 0.03, 0.1, 0.0, CREAM, 6, false);       // the lily
    for (let i = 0; i < 8; i++) { const an = (i / 8) * Math.PI * 2, [x, yy, z] = F.P(a, Math.cos(an) * 0.17, y0 + 1.0 + Math.sin(an) * 0.17, 0.1); b.box('frame_paint', x, yy, z, 0.03, 0.03, 0.015, { col: GOLD }); }
  }
}

// ------------------------------------------------------------------------------------------------------------------ the build
/** Draw the nave's decoration into one group. Returns stats (also kept on `bp.shell.chapelStats`) or null when the building is not a chapel nave. */
export function buildChapelInterior(ctx, bp) {
  const S = bp.shell, C = S?.chapel;
  if (!C) return null;
  const nave = bp.rooms.find((q) => q.id === C.room);
  if (!nave) return null;
  const r = nave.rect, lot = bp.lot, H = nave.h, cx = (r.x0 + r.x1) / 2, W = r.x1 - r.x0, D = r.z1 - r.z0, z0 = r.z0, id = `${bp.id}.chapel.int`;
  const group = ctx.batch.group(id, { cast: false, receive: true }), b = group.builder;
  b.setBasePose(lot.x, lot.y, lot.z, lot.rotY);
  b.uvOff = [hash01(bp.id, 31) * 7, hash01(bp.id, 32) * 7];
  const glows = [], glow = (x, y, z, color, size, intensity, blink) => glows.push({ x, y, z, color, size, intensity, ...(blink ? { blink } : {}) });
  const stats = { id, stations: [], niches: [], lamps: 0, flames: 0, beams: 0, tris: 0, glows: 0 };
  const FH = wallFrame(r, 'H'), FL = wallFrame(r, 'L'), FR = wallFrame(r, 'R'), FF = wallFrame(r, 'F');
  const altar = (bp.furniture ?? []).find((q) => q.flags?.altar), ax = altar?.x ?? cx, az = altar?.z ?? z0 + 0.36, aw = altar ? (altar.w ?? 2.0) : 2.0, ad = 0.7;
  const dais = C.dais, dy = DAIS_H;

  // --- ceiling beams, corbels
  const bz = []; for (let z = z0 + 0.7; z < r.z1 - 0.4; z += 1.5) bz.push(z);
  for (const z of bz) {
    b.box('wood_dark_door', cx, H - 0.13, z, W, 0.26, 0.22, { skip: ['py'] });
    for (const x of [r.x0 + 0.16, r.x1 - 0.16]) b.box('wood_dark_door', x, H - 0.41, z, 0.32, 0.3, 0.3, { skip: ['py'] });
    stats.beams++;
  }
  for (const x of [cx - W / 3, cx, cx + W / 3]) b.box('wood_dark_door', x, H - 0.07, (z0 + r.z1) / 2, 0.14, 0.14, D - 0.1, { skip: ['py'] });

  // --- floor pattern: a checker aisle runner from the door to the sanctuary step, the sanctuary floor on its dais
  const ck = (x0, z0_, x1, z1, y) => b.quad('floor_tile_checker', [x0, y, z1], [x1, y, z1], [x1, y, z0_], [x0, y, z0_], { col: [1, 1, 1] });
  ck(cx - AISLE / 2, dais.z1, cx + AISLE / 2, r.z1, 0.012);
  ck(dais.x0, dais.z0, dais.x1, dais.z1, dy + 0.008);
  b.box('wood_dark_door', cx, dy / 2, dais.z1 + 0.012, dais.x1 - dais.x0, dy, 0.024, { col: [0.8, 0.7, 0.6] });

  // --- retablo on the back wall: blue panel, gilt columns, pediment, a sunburst round the crucifix
  wb(b, FH, 'frame_paint', ax, 0, 2.75, 0.04, 3.5, 2.7, 0.08, PANEL_BLUE);
  for (const sg of [-1, 1]) { wb(b, FH, 'frame_paint', ax, sg * 1.8, 2.75, 0.06, 0.12, 2.8, 0.12, GOLD); cone(b, FH, 'frame_paint', ax, sg * 1.5, 1.45, 0.2, 0.09, 2.5, 0.08, GOLD, 10, true); wb(b, FH, 'frame_paint', ax, sg * 1.5, 4.02, 0.2, 0.28, 0.1, 0.28, GOLD_D); wb(b, FH, 'frame_paint', ax, sg * 1.5, 1.42, 0.2, 0.3, 0.1, 0.3, GOLD_D); }
  wb(b, FH, 'frame_paint', ax, 0, 4.16, 0.07, 3.72, 0.14, 0.14, GOLD);
  const tp = (h, y, t) => FH.P(ax, h, y, t);
  triFacing(b, 'frame_paint', tp(-1.86, 4.23, 0.1), tp(1.86, 4.23, 0.1), tp(0, 4.78, 0.1), FH.nrm, { col: GOLD });
  triFacing(b, 'frame_paint', tp(-1.5, 4.27, 0.115), tp(1.5, 4.27, 0.115), tp(0, 4.65, 0.115), FH.nrm, { col: PANEL_BLUE });
  for (let i = 0; i < 16; i++) {                                                         // sunburst rays: thin gilt triangles round the crucifix
    const an = (i / 16) * Math.PI * 2, rl = i % 2 ? 0.75 : 1.0, w = 0.07, ca = Math.cos(an), sa = Math.sin(an);
    const p0 = tp(ca * 0.4 - sa * w, 2.5 + sa * 0.4 + ca * w, 0.09), p1 = tp(ca * 0.4 + sa * w, 2.5 + sa * 0.4 - ca * w, 0.09), p2 = tp(ca * rl, 2.5 + sa * rl, 0.09);
    triFacing(b, 'frame_paint', p0, p1, p2, FH.nrm, { col: GOLD });
  }
  // --- altar: a white frontal with a gold fringe and cross, a cloth on the top, the tabernacle at the back, the sanctuary lamp
  b.box('plaster_a', ax, 1.11, az, aw + 0.04, 0.02, ad + 0.04, { col: CREAM });
  const fz = az + ad / 2 + 0.018;
  b.box('plaster_a', ax, (dy + 1.1) / 2, fz, aw + 0.04, 1.1 - dy, 0.03, { col: CREAM, skip: ['nz'] });
  b.box('frame_paint', ax, dy + 0.04, fz + 0.004, aw + 0.05, 0.08, 0.035, { col: GOLD, skip: ['nz'] });
  b.box('frame_paint', ax, 0.65, fz + 0.017, 0.07, 0.42, 0.01, { col: GOLD }); b.box('frame_paint', ax, 0.74, fz + 0.017, 0.26, 0.07, 0.01, { col: GOLD });
  b.box('frame_paint', ax, 1.34, az - 0.2, 0.4, 0.46, 0.26, { col: GOLD });
  b.cyl('frame_paint', ax, 1.57, az - 0.2, 0.2, 0.17, 10, { r1: 0.02, col: GOLD_D });
  b.box('frame_paint', ax, 1.32, az - 0.2 + 0.131, 0.2, 0.28, 0.01, { col: lin(0x4a2e1c) });
  const lamp = { x: ax + 1.15, z: z0 + 1.05 };
  b.box('frame_paint', lamp.x, (H + 3.35) / 2, lamp.z, 0.012, H - 3.35, 0.012, { col: DARK });
  b.cyl('led_red', lamp.x, 3.1, lamp.z, 0.065, 0.2, 8, { r1: 0.075, caps: true });
  b.cyl('frame_paint', lamp.x, 3.3, lamp.z, 0.1, 0.06, 8, { r1: 0.02, col: DARK });
  glow(lamp.x, 3.2, lamp.z, 0xff2a18, 0.7, 1.2, 0.08); stats.lamps++;
  // --- candles: flames on the altar's own candle sets and on two tall candlesticks on the dais
  const flame = (x, y, z, sz = 0.3) => { b.cyl('candle_flame', x, y, z, 0.014, 0.06, 6, { r1: 0.002, caps: false }); glow(x, y + 0.03, z, 0xffb050, sz, 1.4, 0.2); stats.flames++; };
  for (const q of bp.furniture ?? []) if (q.name === 'candles_set') for (const o of [-0.045, 0.045]) { b.cyl('plaster_a', q.x + o, q.y, q.z, 0.014, 0.12, 6, { col: CREAM, caps: false }); flame(q.x + o, q.y + 0.12, q.z, 0.18); }
  for (const sg of [-1, 1]) {
    const x = cx + sg * 2.9, z = z0 + 2.15;
    b.cyl('frame_paint', x, dy, z, 0.13, 0.1, 10, { r1: 0.04, col: GOLD_D });
    b.cyl('frame_paint', x, dy + 0.1, z, 0.022, 1.1, 8, { col: GOLD });
    b.cyl('frame_paint', x, dy + 1.2, z, 0.09, 0.02, 10, { col: GOLD_D });
    b.cyl('plaster_a', x, dy + 1.22, z, 0.04, 0.5, 8, { col: CREAM, caps: false });
    flame(x, dy + 1.72, z, 0.4);
  }
  // --- niches by the sanctuary: the Virgin on the west wall, San José on the east wall
  niche(b, FL, z0 + 1.55, 'virgin', glow); niche(b, FR, z0 + 1.55, 'jose', glow);
  stats.niches.push('virgin', 'jose');
  // --- the Stations: I..VII down the west wall from the altar to the door, VIII..XIV back up the east wall
  const sz = (j) => z0 + 3.2 + 0.95 * j;
  for (let j = 0; j < 7; j++) if (sz(j) + 0.3 < r.z1 - 1.2) { const s = station(b, FL, sz(j), 1.5, j); stats.stations.push({ ...s, wall: 'west', along: sz(j) }); }
  for (let j = 0; j < 7; j++) if (sz(6 - j) + 0.3 < r.z1 - 1.2) { const s = station(b, FR, sz(6 - j), 1.5, 7 + j); stats.stations.push({ ...s, wall: 'east', along: sz(6 - j) }); }
  // --- hanging lamps down the aisle, the bell rope, the holy-water stoup by the door, the sacristy door's pediment
  for (let i = 0; i < 3; i++) {
    const z = z0 + 4.2 + 2.5 * i; if (z > r.z1 - 1.0) continue;
    b.box('frame_paint', cx, (H + 3.7) / 2, z, 0.014, H - 3.7, 0.014, { col: DARK });
    b.cyl('frame_paint', cx, 3.6, z, 0.12, 0.1, 8, { r1: 0.03, col: DARK });
    b.cyl('bulb_glow', cx, 3.33, z, 0.1, 0.27, 8, { r1: 0.12 });
    b.cyl('frame_paint', cx, 3.2, z, 0.02, 0.13, 8, { r1: 0.1, col: DARK });
    glow(cx, 3.45, z, 0xffd89a, 1.0, 1.0); stats.lamps++;
  }
  const rope = { x: r.x0 + 0.22, z: r.z1 - 0.55 };
  b.box('frame_paint', rope.x, (H + 1.9) / 2, rope.z, 0.035, H - 1.9, 0.035, { col: lin(0xd8d0c0) });
  b.cyl('plaster_a', rope.x, 1.62, rope.z, 0.04, 0.3, 6, { r1: 0.05, col: lin(RED), caps: false });
  const sx = r.x1, sz0 = r.z1 - 1.0;
  b.cyl('plaster_a', sx - 0.16, 0.95, sz0, 0.05, 0.14, 8, { r1: 0.12, col: lin(0x9a968a) });
  b.cyl('plaster_a', sx - 0.16, 1.09, sz0, 0.14, 0.05, 10, { r1: 0.15, col: lin(0xb0aca0) });
  b.cyl('plaster_a', sx - 0.16, 1.14, sz0, 0.115, 0.012, 10, { r1: 0.115, col: lin(0x3a5a70) });
  b.box('plaster_a', sx - 0.04, 1.35, sz0, 0.06, 0.35, 0.07, { col: lin(0x9a968a) });
  const door = bp.doors.find((d) => !d.ext && d.rooms?.includes(nave.id) && Math.abs(d.z - z0) < 0.3);
  if (door) {
    const dh = door.h ?? 2.1, hw = door.w / 2 + 0.06, zz = z0 + 0.04;
    b.box('wood_dark_door', door.x, dh + 0.09, zz, door.w + 0.28, 0.12, 0.1, { skip: ['nz'] });
    triFacing(b, 'frame_paint', [door.x - hw - 0.06, dh + 0.15, zz + 0.05], [door.x + hw + 0.06, dh + 0.15, zz + 0.05], [door.x, dh + 0.5, zz + 0.05], [0, 0, 1], { col: GOLD_D });
    b.box('frame_paint', door.x, dh + 0.26, zz + 0.055, 0.04, 0.16, 0.01, { col: GOLD }); b.box('frame_paint', door.x, dh + 0.3, zz + 0.055, 0.12, 0.04, 0.01, { col: GOLD });
  }

  stats.tris = b.tris;
  ctx.batch.flush(id);
  for (const g of glows) {
    const w = bp.frame.toWorld(g.x, g.y, g.z), p = Array.isArray(w) ? w : [w.x, w.y, w.z];
    ctx.glow?.add?.({ ...g, x: p[0], y: p[1], z: p[2] });
  }
  stats.glows = glows.length;
  S.chapelStats = stats;
  return stats;
}
