// EDGE WALL (A2, R1-D21): the inside face of the east and west boundary walls, dressed as the BACK of the barrio.
// The plain wall (periphery.js buildBoundary) is a 2.4 to 2.7 m stepped screen with nothing beyond it; "a rim walk ends at a blank wall". Here the wall is left exactly as it was
// (its colliders, its face, its posters) and, in front of and above it, 40 to 55 % of its length becomes the rear wall of the houses that stand just outside the plot:
//   a STRETCH (3 to 7 panels, 6 to 14 m) is raised to a two-storey wall 4.2 to 5.0 m over the inside ground, its top stepping with the slope as the plain wall does, with a
//   concrete pretil on top, painted in a barrio stucco colour per house (bay), small high windows (grilles, shutters, a few lit at night), a drainpipe and gutter, a mural or a
//   big tag on every third one, a creeper climbing a strip of it, and a roofline above: water tanks on stands, an antenna or a dish, a zinc lean-to, rebar sprouting from
//   an unfinished column. The plain stretches between get a service door with a padlock, an electricity meter board with its cables, or a stepped concrete footing.
// Nothing here is solid: no collider is added, and nothing on the plot's side stands more than REACH (0.15 m) off the plain face (the physics wall stands 0.35 m inside the
// visible one, so the camera never gets near it). Everything is deterministic from plan.seed and the panel it sits on.
//   planEdge({ seed, H, occ, avoid })   PURE (runs under node, tested): which panels are raised, their bays, hues, tops, windows, pipes, art, creepers, roof items, gap details
//   dressEdge(K, sd, crests)            called by buildBoundary for each side after its panel loop: builds the stretches of side e / w from the plan; raises the crest
//                                       points (so the bougainvillea of periphery.js hangs from the new top) and takes the raised panels out of them
// Geometry goes into two cast:false builders (props.boundary.edge, props.boundary.edgeart), every part of it vertex-coloured plaster_rough (but the dark panes and the two
// atlases): one mesh a material for the whole rim (it is wider than the merge span, so it is one draw call however much is in it). The creeper cards join the floralow chunks.
import { makeRng } from '../core/rng.js';
import { HALF } from './field.js';
import { vnoise } from './geom.js';
import { card, beam, tube, V } from './mk.js';
import { TILE } from './sprites.js';
import { OCC } from './occupancy.js';
import { drape } from './flora.js';
import { panel as signPanel, wallPanel as muralPanel, edgeMuralKeys, EDGE_MURAL_ASPECT } from './signs.js';

// ---------------------------------------------------------------------------------------------------- constants
export const EDGE = Object.freeze({
  PANELS: 100,                        // buildBoundary walks s = -HALF + 0.2 in 2 m steps: 100 panels on each of the east and west walls
  S0: -HALF + 0.2,                    // z where panel 0 starts
  AT: HALF - 0.45,                    // the panels' axis (99.55); the wall is 0.4 m thick
  FACE: HALF - 0.65,                  // the plain face that looks into the plot (99.35)
  VEN: 0.08,                          // the stucco skin stands this far in front of it (just past the 0.07 m the plain wall's cap overhangs, so the old cap is buried)
  REACH: 0.15,                        // the most anything on the plot's side stands off the plain face
  PIER: 0.22,                         // half width of a pier (it covers the 0.34 m pilaster of periphery.js)
  MARGIN: 3,                          // panels at each corner that stay plain
  HS: [4.2, 4.4, 4.6, 4.8, 5.0],      // height of a bay over the highest ground on its panel
  UPPER_HS: 4.6,                      // a bay this tall has an upper row of windows
  SILL: [2.3, 2.6],                   // first-floor sill over the highest ground under the window
  LIFT: 0.5,                          // a painting's lower edge over the ground
  WIN_GAP: 0.5,                       // clear space round a window (to piers and to every other feature)
  SOFT_GAP: 0.3,                      // the creeper's: it is leaves, and goes round a window rather than over it
  SHARE: [0.38, 0.52],                // the raised share of a wall's length the planner aims for (the test holds it to 30 to 60 %)
});
const P = EDGE.PANELS;
export const zOf = (k) => EDGE.S0 + 2 * k;
const kOf = (z) => Math.min(P - 1, Math.max(0, Math.floor((z - EDGE.S0) / 2)));
const isPilaster = (k) => Math.round(zOf(k) / 2) % 2 === 0;          // periphery.js: a pilaster every 4 m at a panel's start

/** barrio stucco, sRGB: what the bays are painted (a hue per house, no neighbour alike) */
export const HUES = Object.freeze([
  { name: 'ochre', hex: 0xd9a24a }, { name: 'terracotta', hex: 0xc4673f }, { name: 'sky', hex: 0x86b4da }, { name: 'mint', hex: 0xa5d4b8 },
  { name: 'pink', hex: 0xe5a6b4 }, { name: 'white', hex: 0xeeeadf }, { name: 'yellow', hex: 0xe9d067 }, { name: 'brick', hex: 0xc0594b },
]);
const FRAMES = [0xf1ede2, 0xf1ede2, 0x2b4d86, 0x2d5b46, 0x5b3b25];       // window frames: white (most), blue, green, brown
const DOORS = [0x2c4f86, 0x2d5b46, 0x7a2f26, 0x555a5e, 0x3a3228];
const ROOFS = ['tanks', 'tank', 'dish', 'leanto', 'mast', 'rebar'];
export const MURALS = edgeMuralKeys();       // R1-106: the wall's own four paintings (signs.js EDGE_ART). The three discovery murals hang once, on their street walls, and are not hung again here as filler
export const BLOCKING = OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.DOOR | OCC.NAV;      // what a panel's ground may not hold for a stretch (or a door) to stand against it

// ---------------------------------------------------------------------------------------------------- the plan (pure)
function blockedPanel(occ, avoid, sg, k) {
  const z0 = zOf(k);
  if (occ) for (const dd of [0.6, 1.6, 3.0]) for (const t of [0, 1, 2]) if (!occ.clear(sg * (EDGE.FACE - dd), z0 + t, 0.3, BLOCKING)) return true;
  return avoid.some((a) => Math.abs(a.x - sg * EDGE.FACE) < (a.r ?? 3) + 4 && a.z > z0 - (a.r ?? 3) - 1 && a.z < z0 + 3 + (a.r ?? 3));
}

/**
 * Where the stretches go on one wall, as [k0, n] (first panel, panels): 3 to 7 panels each, 3 to 8 panels of plain wall between, the corners (MARGIN panels) left alone,
 * never on a panel that a street, stair, plaza, building, door or a point of interest touches; then nudged to the share in EDGE.SHARE.
 */
function planRuns(r, blocked) {
  const runs = [], hi = P - EDGE.MARGIN;
  let k = EDGE.MARGIN + r.int(0, 3);
  while (true) {
    const n = r.int(3, 7);
    if (k + n > hi) break;
    let bad = false; for (let j = 0; j < n; j++) if (blocked(k + j)) bad = true;
    if (bad) { k += 2; continue; }
    runs.push([k, n]); k += n + r.int(3, 8);
  }
  const share = () => runs.reduce((s, [, n]) => s + n, 0) / P;
  for (let guard = 0; share() < EDGE.SHARE[0] && guard < 20; guard++) {                       // too little raised: a short stretch in the widest gap
    let best = null, from = EDGE.MARGIN;
    for (let i = 0; i <= runs.length; i++) {
      const to = i < runs.length ? runs[i][0] : hi, gap = to - from;
      if (gap >= 8 && (!best || gap > best.gap)) best = { i, gap, from };
      if (i < runs.length) from = runs[i][0] + runs[i][1];
    }
    if (!best) break;
    const at = best.from + Math.floor((best.gap - 3) / 2);
    let bad = false; for (let j = 0; j < 3; j++) if (blocked(at + j)) bad = true;
    if (bad) break;
    runs.splice(best.i, 0, [at, 3]);
  }
  for (let guard = 0; share() > EDGE.SHARE[1] && runs.length > 2 && guard < 20; guard++) {    // too much: the shortest one goes
    let m = 0; runs.forEach((q, i) => { if (q[1] < runs[m][1]) m = i; });
    runs.splice(m, 1);
  }
  return runs;
}

/** distance between two (z, y) rectangles; a pier is a rectangle as tall as the wall */
const gapOf = (a, b) => Math.hypot(Math.max(0, a.z0 - b.z1, b.z0 - a.z1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));

function planStretch(side, i, k0, n, r, ctx) {
  const { sg, H, hi, prev } = ctx, k1 = k0 + n - 1, zA = zOf(k0), zB = zOf(k1) + 2, gnd = (z) => H(sg * (EDGE.FACE - EDGE.VEN), z);
  // ---- bays: a house each, between two pilasters (4 m, a one-panel end cell joins its neighbour, now and then two cells make an 8 m house), its own hue and height; the top of each
  // panel is the bay's height over the highest ground on that panel, so the slope steps it as it steps the plain wall
  const cuts = []; for (let k = k0 + 1; k <= k1; k++) if (isPilaster(k)) cuts.push(k);
  const pieces = []; { let a = k0; for (const c of cuts) { pieces.push([a, c - 1]); a = c; } pieces.push([a, k1]); }
  const spans = [];
  for (const p of pieces) {
    const last = spans[spans.length - 1], w = p[1] - p[0] + 1;
    if (last && (last[1] === last[0] || w === 1 || (last[1] - last[0] + 1 + w <= 4 && r.chance(0.3)))) last[1] = p[1]; else spans.push([...p]);
  }
  const bays = []; let lastHue = prev.hue, lastHs = 0;
  for (const [a, c] of spans) {
    let h; do h = r.int(0, HUES.length - 1); while (h === lastHue);
    let hs; do hs = r.pick(EDGE.HS); while (hs === lastHs && r.chance(0.7));
    lastHue = h; lastHs = hs;
    bays.push({ k0: a, k1: c, hue: h, hex: HUES[h].hex, hs });
  }
  const bayOf = (k) => bays.find((b) => k >= b.k0 && k <= b.k1);
  const tops = []; for (let k = k0; k <= k1; k++) tops.push(hi[k] + bayOf(k).hs);
  const topAt = (z) => tops[Math.max(0, Math.min(n - 1, kOf(z) - k0))];
  // ---- piers: over the pilasters (every 4 m, so at every bay wall), and at an end that meets one
  const pierZ = []; for (let k = k0; k <= k1 + 1; k++) if (isPilaster(k)) pierZ.push(zOf(k));
  const PIERS = pierZ.map((zp) => ({ z0: zp - EDGE.PIER, z1: zp + EDGE.PIER, y0: -1e9, y1: 1e9 }));
  // ---- what goes where along the wall: every feature is a (z, y) rectangle; a window keeps WIN_GAP from a pier and from any other feature
  const rects = [], lo = zA + 0.3, up = zB - 0.3, feats = [];
  const s = { side, id: `${side}${i}`, i, k0, k1, n, z0: zA, z1: zB, len: zB - zA, bays, tops, piers: pierZ, windows: [], pipe: null, gutter: null, art: null, creeper: null, roof: null, feats };
  const place = (w, mk, gap, pierGap, range = null) => {
    const [rl, ru] = range ?? [lo, up];
    if (ru - rl < w) return null;
    for (let t = 0; t < 140; t++) {
      const a = Math.round((rl + r.next() * (ru - rl - w)) * 20) / 20, b = a + w, R = mk(a, b);
      if (!R || rects.some((q) => gapOf(R, q) < (q.soft ? Math.min(gap, EDGE.SOFT_GAP) : gap)) || (pierGap != null && PIERS.some((q) => gapOf(R, q) < pierGap))) continue;
      return { a, b, R };
    }
    return null;
  };
  const keep = (kind, R, extra = {}) => { rects.push(R); feats.push({ kind, z0: R.z0, z1: R.z1, y0: R.y0, y1: R.y1, ...extra }); };
  const gmax = (a, b) => { let m = -Infinity; for (let z = a; z <= b + 1e-6; z += 0.25) m = Math.max(m, gnd(z)); return m; };
  const win = (floor) => {
    const w = r.range(0.6, 0.9), h = r.range(0.62, 0.84), sillRel = r.range(EDGE.SILL[0], EDGE.SILL[1]);
    const pos = place(w, (a, b) => {
      const top = Math.min(topAt(a), topAt(b)), sill = floor === 1 ? gmax(a, b) + sillRel : top - 0.45 - h;
      if (floor === 2 && (bayOf(kOf(a)).hs < EDGE.UPPER_HS || bayOf(kOf(b)).hs < EDGE.UPPER_HS)) return null;
      if (sill + h > top - 0.3) return null;
      return { z0: a - 0.1, z1: b + 0.1, y0: sill - 0.14, y1: sill + h + 0.07, sill };
    }, EDGE.WIN_GAP, EDGE.WIN_GAP);
    if (!pos) return false;
    const v = r.next(), variant = v < 0.28 ? 'plain' : v < 0.58 ? 'grille' : v < 0.74 ? 'shutter' : 'half', frame = r.pick(FRAMES), lit = r.chance(0.3);
    const glow = lit ? { color: r.chance(0.6) ? 0xffc27a : 0xffe0a8, size: r.range(0.9, 1.4), intensity: r.range(1.2, 2.2) } : null;      // planned, so a build with a glow registry and one without draw the same walls
    s.windows.push({ z0: pos.a, z1: pos.b, sill: pos.R.sill, h, floor, variant, frame, lit, glow, on: 0.1 + 0.8 * r.next(), k: kOf((pos.a + pos.b) / 2) });
    keep('window', pos.R, { floor });
    return true;
  };
  const nWin = Math.min(1 + r.int(0, Math.min(2, Math.floor(s.len / 4) - 1 + 1)), 3), nUp = bays.some((b) => b.hs >= EDGE.UPPER_HS) ? 1 + r.int(0, 1) : 0;
  win(1);                                                                                              // the first window is always there
  // ---- a mural (two in three of the stretches with art) or a big tag, on every third stretch
  if (ctx.art) {
    if (ctx.art.kind === 'tag') {
      const pos = place(2.4, (a, b) => ({ z0: a, z1: b, y0: gmax(a, b) + 0.7, y1: gmax(a, b) + 1.9 }), 0.5, 0.3);
      if (pos) { s.art = { kind: 'tag', key: ctx.art.key, z0: pos.a, z1: pos.b, w: 2.4, h: 1.2 }; keep('tag', pos.R); }
    } else {
      // a painting stays on one wall of one house: between two piers (the widest cell first), as wide as its shape allows (3 m and more), clear of the piers either side
      const asp = ctx.aspect(ctx.art.key), pad = 0.2, L = EDGE.LIFT;
      const rooms = pieces.map(([ka, kb]) => ({ a: Math.max(lo, zOf(ka) + (isPilaster(ka) ? EDGE.PIER : 0) + pad), c: Math.min(up, zOf(kb) + 2 - (isPilaster(kb + 1) ? EDGE.PIER : 0) - pad) }))
        .filter((q) => q.c - q.a >= 3.0).sort((p, q) => (q.c - q.a) - (p.c - p.a));
      for (const rm of rooms) {
        const w = Math.min(Math.floor((rm.c - rm.a) * 10) / 10, Math.round(1.9 * asp * 10) / 10), h = Math.round((w / asp) * 20) / 20;
        const pos = place(w, (a, b) => ({ z0: a, z1: b, y0: gmax(a, b) + L, y1: gmax(a, b) + L + h }), 0.5, null, [rm.a, rm.c]);
        if (pos) { s.art = { kind: 'mural', key: ctx.art.key, z0: pos.a, z1: pos.b, w, h }; keep('mural', pos.R); break; }
      }
    }
  }
  // ---- a creeper: ivy and bougainvillea over a 2 to 3 m strip, from the foot over the crest, in the widest run of wall that the first window and the painting leave free (a window
  // placed after it goes round it, so the creeper is not starved by the windows)
  if (r.chance(0.6)) {
    const cuts = rects.map((q) => [q.z0 - EDGE.SOFT_GAP, q.z1 + EDGE.SOFT_GAP]).sort((p, q) => p[0] - q[0]);
    let best = null, from = lo;
    const consider = (a, c) => { if (c - a >= 2.0 && (!best || c - a > best[1] - best[0])) best = [a, c]; };
    for (const [a, c] of cuts) { if (a > from) consider(from, a); from = Math.max(from, c); }
    consider(from, up);
    if (best) {
      const w = Math.min(r.range(2.0, 3.0), best[1] - best[0]), a = Math.round((best[0] + r.next() * (best[1] - best[0] - w)) * 20) / 20;
      s.creeper = { z0: a, z1: a + w, tile: r.chance(0.5) ? TILE.VINE : TILE.BOUGAIN };
      keep('creeper', { z0: a, z1: a + w, y0: gnd(a), y1: Math.min(topAt(a), topAt(a + w)), soft: true });
    }
  }
  // ---- the drainpipe: beside a pier, on the panel the gutter runs along
  const cands = []; for (const zp of pierZ) for (const sd of [1, -1]) cands.push([zp, sd]);
  for (let t = cands.length - 1; t > 0; t--) { const j = Math.floor(r.next() * (t + 1)); [cands[t], cands[j]] = [cands[j], cands[t]]; }
  if (r.chance(0.85)) for (const [zp, sd] of cands) {
    const z = zp + sd * (EDGE.PIER + 0.17), k = sd > 0 ? kOf(zp + 0.5) : kOf(zp - 0.5);
    if (z < lo || z > up || k < k0 || k > k1) continue;
    const R = { z0: z - 0.06, z1: z + 0.06, y0: gnd(z), y1: tops[k - k0] - 0.2 };
    if (rects.some((q) => gapOf(R, q) < EDGE.WIN_GAP)) continue;
    const ga = sd > 0 ? zp + EDGE.PIER : zp - 1.9, gb = sd > 0 ? zp + 1.9 : zp - EDGE.PIER;
    s.pipe = { z, k, side: sd, top: tops[k - k0] - 0.3 };
    s.gutter = { z0: Math.max(ga, zOf(k)), z1: Math.min(gb, zOf(k) + 2), k, y: tops[k - k0] };
    keep('pipe', R, { k });
    break;
  }
  // ---- windows: 1 to 3 small high ones on the first floor, 1 or 2 more above on the tall bays
  for (let j = 1; j < nWin; j++) win(1);
  for (let j = 0; j < nUp; j++) win(2);
  // ---- the roofline: one package a stretch, never the neighbour's
  let pk; do pk = r.pick(ROOFS); while (pk === prev.roof);
  const roofItems = [], at = (a, b) => a + r.next() * Math.max(0, b - a);
  if (pk === 'tanks' && s.len >= 8) roofItems.push({ kind: 'tank', z: at(zA + 1, zA + s.len * 0.45), tone: 'blue' }, { kind: 'tank', z: at(zA + s.len * 0.55, zB - 1), tone: 'black' });
  else if (pk === 'tanks' || pk === 'tank') roofItems.push({ kind: 'tank', z: at(zA + 1, zB - 1), tone: r.pick(['blue', 'black', 'beige']) });
  if (pk === 'dish') roofItems.push({ kind: 'dish', z: at(zA + 1, zA + s.len * 0.5) }, { kind: 'antenna', z: at(zA + s.len * 0.6, zB - 1) });
  if (pk === 'mast') roofItems.push({ kind: 'antenna', z: at(zA + 1, zA + s.len * 0.5), tall: true }, { kind: 'tank', z: at(zA + s.len * 0.6, zB - 1), tone: 'black' });
  if (pk === 'leanto') roofItems.push({ kind: 'leanto', z: at(zA + 0.4, zB - 3.4), w: r.range(2.4, 3.0) }, { kind: 'antenna', z: at(zA + 1, zB - 1) });
  if (pk === 'rebar') for (const zp of pierZ) if (zp > zA - 0.1 && zp < zB + 0.1) roofItems.push({ kind: 'column', z: zp });
  s.roof = { pkg: pk, items: roofItems };
  return s;
}

/**
 * What the plain stretches between get: a service door, a meter board, a stepped footing (rotating, so no two in a row alike); only on panels `blocked` does not claim
 * (a door where a path or a stair meets the wall, or a point of interest stands, would be in the way). A gap with no free panel is left plain.
 */
function planGaps(r, runs, blocked) {
  const gaps = []; let from = 0, j = 0;
  const order = r.shuffle(['door', 'meters', 'footing']);
  const pushGap = (a, b) => {
    const n = b - a + 1;
    if (n < 3) return;
    const ok = (k) => k >= a && k <= b && !blocked(k), kind = order[j++ % order.length], g = { k0: a, k1: b, n, kind: 'none' };
    const free = []; for (let k = a; k <= b; k++) if (ok(k)) free.push(k);
    const doors = free.filter((k) => k >= 1 && k <= P - 2);                                          // not in the corner panel, where the next wall's face cuts it
    if (kind === 'door' && doors.length) { g.kind = 'door'; g.k = r.pick(doors); g.color = r.pick(DOORS); }
    else if (kind === 'meters') { const ks = free.filter((k) => isPilaster(k) && ok(k - 1)); if (ks.length) { g.kind = 'meters'; g.k = r.pick(ks); g.dir = r.chance(0.5) ? 1 : -1; } }
    if (g.kind === 'none') {                                                                          // a stepped footing along the longest free run (up to 5 panels)
      let best = null, cur = null;
      for (let k = a; k <= b + 1; k++) {
        if (k <= b && ok(k)) cur = cur ? [cur[0], k] : [k, k];
        else { if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur; cur = null; }
      }
      if (best && best[1] > best[0]) { g.kind = 'footing'; g.ka = best[0] + (best[1] - best[0] > 4 ? r.int(0, best[1] - best[0] - 4) : 0); g.kb = Math.min(best[1], g.ka + 4); }
    }
    if (g.kind !== 'none') gaps.push(g);
  };
  for (const [k0, n] of runs) { pushGap(from, k0 - 1); from = k0 + n; }
  pushGap(from, P - 1);
  return gaps;
}

/**
 * The whole plan of both walls. `H` = heightAt; `occ` (optional) = the occupancy grid; `avoid` = [{ x, z, r }] points a stretch keeps away from (points of interest, landmarks).
 * Returns { seed, sides: { e, w } } with, per side, `stretches` (see planStretch) and `gaps`. Same seed, same plan; another seed another.
 */
export function planEdge({ seed, H, occ = null, avoid = [] }) {
  const R = makeRng(seed).fork('edgewall'), out = { seed, sides: {} };
  const aspect = () => EDGE_MURAL_ASPECT;                                                               // every painting of the wall is 2:1 (they are not cropped to a wall's shape, as the discoveries are)
  for (const id of ['e', 'w']) {
    const sg = id === 'e' ? 1 : -1, r = R.fork(id), ax = sg * EDGE.AT;
    const hi = Array.from({ length: P }, (_, k) => { const s = zOf(k); return Math.max(H(ax, s), H(ax, s + 1), H(ax, s + 2)); });     // the highest of the three samples periphery.js takes
    const blocked = (k) => blockedPanel(occ, avoid, sg, k), runs = planRuns(r.fork('runs'), blocked);
    // art: every third of the stretches that are long enough (8 m and more), a mural, a mural, a tag, ...; the paintings and tags rotate so neighbours differ. The paintings are dealt from
    // their own count (not the count of paintings and tags, which brought the first one back after a single tag), and the west wall starts half a deck on: no painting twice on a wall
    // while there are fewer than four of them, and the two walls do not show the same one at the same place in their order (R1-106)
    const arts = new Map(); let eligible = 0, shown = 0, painted = 0;
    runs.forEach(([, n], i) => {
      if (n < 4) return;
      if ((eligible++ + (id === 'e' ? 1 : 0)) % 3 === 0) { const tag = shown % 3 === 2; arts.set(i, tag ? { kind: 'tag', key: `tag.${shown % 2}` } : { kind: 'mural', key: MURALS[(painted++ + (id === 'e' ? 0 : MURALS.length >> 1)) % MURALS.length] }); shown++; }
    });
    const stretches = [], prev = { hue: -1, roof: null };
    runs.forEach(([k0, n], i) => {
      const s = planStretch(id, i, k0, n, r.fork('s' + i), { sg, H, hi, prev, art: arts.get(i) ?? null, aspect });
      prev.hue = s.bays[s.bays.length - 1].hue; prev.roof = s.roof.pkg;
      stretches.push(s);
    });
    out.sides[id] = { id, sg, stretches, gaps: planGaps(r.fork('gaps'), runs, blocked), hi };
  }
  return out;
}


// ---------------------------------------------------------------------------------------------------- colour and geometry helpers
const lin = (h) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return [f((h >> 16) & 255), f((h >> 8) & 255), f(h & 255)]; };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
const CONCRETE = lin(0xa4a29a), IRON = lin(0x1d1e22), RUST = lin(0x7a3b1e), GALV = lin(0x8d9498), WOOD = lin(0x3d2616), BRASS = lin(0xb08d32);
const MAT = { wall: 'plaster_rough', trim: 'plaster_rough', cap: 'plaster_rough', iron: 'plaster_rough', pane: 'glass_dark', zinc: 'plaster_rough', tank: 'plaster_rough' };

export const edgewallOff = (ctx) => ctx?.opts?.edgewall === false || !!globalThis.__noEdgeWall || (typeof location !== 'undefined' && /[?&]edgewall=0(&|$)/.test(location.search ?? ''));

/** The wall-frame helpers of one side: d = distance toward the plot off the plain face (negative: into the wall), z = world z. */
function frameOf(sg, b) {
  const X = (d) => sg * (EDGE.FACE - d), face = { front: sg > 0 ? 'nx' : 'px', back: sg > 0 ? 'px' : 'nx', zlo: 'nz', zhi: 'pz', top: 'py', bot: 'ny' };
  return {
    X,
    /** a box over z in [za, zb], y in [y0, y1], d in [d0, d1] (d1 nearer the plot); `skip` names faces: front back zlo zhi top bot */
    box(mat, za, zb, y0, y1, d0, d1, col, skip = []) {
      if (!(y1 > y0 + 1e-4) || !(zb > za + 1e-4)) return;
      const xa = X(d1), xb = X(d0);
      b.box(mat, (xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2, Math.abs(xb - xa), y1 - y0, zb - za, { col, skip: skip.map((s) => face[s]) });
    },
    /** a quad facing the plot at distance d; zl / zr = the z of its left / right edge as the viewer sees it (the viewer's right is +z on the east wall, -z on the west); heights bl br tr tl */
    quad(mat, d, zl, zr, yBL, yBR, yTR, yTL, o) { b.quad(mat, [X(d), yBL, zl], [X(d), yBR, zr], [X(d), yTR, zr], [X(d), yTL, zl], o); },
    left: (za, zb) => (sg > 0 ? za : zb), right: (za, zb) => (sg > 0 ? zb : za),
  };
}

// ---------------------------------------------------------------------------------------------------- the build
/**
 * Dress one side. `sd` = { id, axis, at } of buildBoundary, `crests` = its crest points (one per panel, in order). Only the east and west walls are dressed. Returns that side's record.
 * Never throws: a failure is logged in ctx.errors and the wall stays plain.
 */
export function dressEdge(K, sd, crests) {
  const { ctx } = K;
  if (sd.axis !== 'z' || edgewallOff(ctx)) return null;
  try { return buildSide(K, sd, crests); } catch (e) {
    console.error('[props.edgewall]', e);
    ctx.errors?.push({ stage: 'props', item: 'edgewall', message: String(e?.message ?? e), stack: e?.stack });
    return null;
  }
}

function worldRecord(K) {
  const W = (K.ctx.world ??= {});
  if (!W.edge) {
    const plan = K.plan, avoid = [...(plan.pois ?? []), ...(plan.landmarks ?? [])].filter((p) => Math.abs(p.x) > 70).map((p) => ({ x: p.x, z: p.z, r: p.radius ?? 3 }));
    W.edge = { plan: planEdge({ seed: plan.seed, H: K.H, occ: K.occ, avoid }), features: [], lit: 0, glows: 0, leafTris: 0, tops: { e: [], w: [] }, raised: { e: 0, w: 0 }, doors: 0, meters: 0, footings: 0, murals: 0, tags: 0 };
  }
  return W.edge;
}

function buildSide(K, sd, crests) {
  const { ctx, H } = K, rec = worldRecord(K), side = rec.plan.sides[sd.id];
  if (!side) return null;
  const sg = side.sg, b = ctx.batch.builder('props.boundary.edge', { cast: false }), art = ctx.batch.builder('props.boundary.edgeart', { cast: false });
  const F = frameOf(sg, b), X = F.X, rng = K.rng('edgewall.' + sd.id), seed = K.plan.seed + 211;
  const gnd = (z, d = EDGE.VEN) => H(X(d), z);
  const gmaxOver = (a, c, d = EDGE.VEN) => { let m = -Infinity; for (let z = a; z <= c + 1e-6; z += 0.25) m = Math.max(m, gnd(z, d)); return m; };
  const gminOver = (a, c, d = EDGE.VEN) => { let m = Infinity; for (let z = a; z <= c + 1e-6; z += 0.25) m = Math.min(m, gnd(z, d)); return m; };
  const plainTop = (k) => crests[0]?.[k]?.y ?? side.hi[k] + 2.4;
  const raised = new Set(), stats = { stretches: 0, panels: 0, windows: 0, lit: 0 };
  const DAMP = [0.52, 0.7, 0.95, 1.0, 0.9];
  const push = (kind, o) => rec.features.push({ side: sd.id, kind, ...o });
  const tt = (rec.tops[sd.id].length = 0, rec.tops[sd.id]);

  for (const s of side.stretches) {
    stats.stretches++;
    const topOf = (k) => s.tops[k - s.k0], bayOf = (k) => s.bays.find((q) => k >= q.k0 && k <= q.k1), hueOf = (k) => lin(bayOf(k).hex);
    // ---- the body: stucco skin (toned corners: a damp foot, blotches), the block above the plain wall, the pretil, the piers
    for (let k = s.k0; k <= s.k1; k++) {
      const zs = zOf(k), ze = zs + 2, T = topOf(k), col = hueOf(k), Tp = T - 0.1;
      raised.add(k); stats.panels++; tt[k] = { top: T, plain: plainTop(k) }; rec.raised[sd.id]++;
      for (let j = 0; j < 2; j++) {
        const za = zs + j, zb = za + 1, gA = gnd(za), gB = gnd(zb), zl = F.left(za, zb), zr = F.right(za, zb), gL = zl === za ? gA : gB, gR = zl === za ? gB : gA;
        const ys = (g) => [g - 0.35, g + 0.25, g + 1.1, g + 2.6, Tp];
        const yl = ys(gL), yr = ys(gR), tone = (z, i, y) => mul(col, DAMP[i] * (1 + 0.07 * vnoise(z * 0.9 + y * 0.35, y * 0.9, 1.9, seed)));
        for (let i = 0; i < 4; i++) {
          if (yl[i + 1] <= yl[i] + 1e-3 || yr[i + 1] <= yr[i] + 1e-3) continue;
          F.quad(MAT.wall, EDGE.VEN, zl, zr, yl[i], yr[i], yr[i + 1], yl[i + 1], { cols: [tone(zl, i, yl[i]), tone(zr, i, yr[i]), tone(zr, i + 1, yr[i + 1]), tone(zl, i + 1, yl[i + 1])] });
        }
      }
      // the block over the plain wall: only the ends that show (a neighbour lower than this panel)
      const lowNb = (k2) => (k2 < s.k0 || k2 > s.k1 ? plainTop(Math.max(0, Math.min(P - 1, k2))) : topOf(k2) - 0.1);
      const sk = ['front', 'back', 'bot', 'top']; if (lowNb(k - 1) >= Tp - 0.05) sk.push('zlo'); if (lowNb(k + 1) >= Tp - 0.05) sk.push('zhi');
      F.box(MAT.wall, zs, ze, Math.max(side.hi[k] + 1.5, plainTop(k) - 0.6), Tp, -0.4, EDGE.VEN, mul(col, 0.8), sk);
      F.box(MAT.cap, zs, ze, Tp, T, -0.45, 0.1, mul(CONCRETE, 0.95 + 0.1 * vnoise(zs, T, 3, seed + 1)), ['back', 'bot']);
      // the skin is a skin: where it ends against plain wall its edge shows from the side as a strip as thick as the skin
      if (k === s.k0) F.box(MAT.wall, zs, zs + 0.004, gnd(zs) - 0.35, Tp, 0.0, EDGE.VEN, mul(col, 0.8), ['front', 'back', 'top', 'bot', 'zhi']);
      if (k === s.k1) F.box(MAT.wall, ze - 0.004, ze, gnd(ze) - 0.35, Tp, 0.0, EDGE.VEN, mul(col, 0.8), ['front', 'back', 'top', 'bot', 'zlo']);
    }
    for (const zp of s.piers) {
      const kL = Math.round((zp - EDGE.S0) / 2) - 1, kR = kL + 1, tl = kL >= s.k0 ? topOf(kL) : -Infinity, tr = kR <= s.k1 ? topOf(kR) : -Infinity, top = Math.max(tl, tr) + 0.12;
      const bay = bayOf(kR <= s.k1 ? kR : kL), foot = gminOver(zp - EDGE.PIER, zp + EDGE.PIER, 0.0) - 0.3;
      F.box(MAT.wall, zp - EDGE.PIER, zp + EDGE.PIER, foot, top, 0.0, 0.13, mul(lin(bay.hex), 1.07), ['back', 'bot']);
      F.box(MAT.cap, zp - EDGE.PIER - 0.02, zp + EDGE.PIER + 0.02, top - 0.06, top, -0.05, 0.145, CONCRETE, ['back', 'bot']);
    }
    // ---- windows
    for (const w of s.windows) {
      const zc = (w.z0 + w.z1) / 2, y0 = w.sill, y1 = w.sill + w.h, fr = lin(w.frame), dark = mul(IRON, 0.8);
      F.box(MAT.trim, w.z0 - 0.07, w.z1 + 0.07, y0 - 0.07, y1 + 0.07, EDGE.VEN, 0.122, fr, ['back']);                      // the frame: a plate round the pane
      F.box(MAT.trim, w.z0 - 0.1, w.z1 + 0.1, y0 - 0.14, y0 - 0.07, EDGE.VEN, 0.14, mul(CONCRETE, 1.1), ['back']);           // the sill
      F.quad(MAT.pane, 0.128, F.left(w.z0, w.z1), F.right(w.z0, w.z1), y0, y0, y1, y1, { col: [1, 1, 1] });
      const bar = (za, zb, ya, yb, d0 = 0.128, d1 = 0.142) => F.box(MAT.iron, za, zb, ya, yb, d0, d1, dark, ['back', 'bot']);
      if (w.variant === 'grille') {
        const n = Math.max(4, Math.round((w.z1 - w.z0) / 0.11));
        for (let q = 0; q <= n; q++) { const zq = w.z0 + ((w.z1 - w.z0) * q) / n; bar(zq - 0.009, zq + 0.009, y0, y1); }
        bar(w.z0, w.z1, y0 + 0.02, y0 + 0.045); bar(w.z0, w.z1, y1 - 0.065, y1 - 0.04); bar(w.z0, w.z1, (y0 + y1) / 2 - 0.012, (y0 + y1) / 2 + 0.012);
      } else if (w.variant === 'shutter' || w.variant === 'half') {
        const wood = mul(WOOD, 0.85 + 0.3 * rng.next()), L = F.left(w.z0 - 0.07, w.z1 + 0.07), Rr = F.right(w.z0 - 0.07, w.z1 + 0.07), mid = zc;
        const leaf = (za, zb) => F.box(MAT.iron, Math.min(za, zb), Math.max(za, zb), y0 - 0.07, y1 + 0.07, 0.122, 0.142, wood, ['back', 'bot']);
        leaf(L, mid);                                                                                                         // the viewer's left leaf: closed
        if (w.variant === 'shutter') leaf(mid, Rr);
        else { const open = sg > 0 ? [w.z1 + 0.1, w.z1 + 0.5] : [w.z0 - 0.5, w.z0 - 0.1]; F.box(MAT.iron, open[0], open[1], y0 - 0.07, y1 + 0.07, EDGE.VEN, 0.108, wood, ['back', 'bot']); }   // the other folded back on the wall
      }
      if (w.lit && ctx.glow) { ctx.glow.add({ x: X(0.22), y: (y0 + y1) / 2, z: zc, color: w.glow.color, size: w.glow.size, intensity: w.glow.intensity, on: w.on, src: 'edgewall' }); rec.glows++; }      // src: who asked, so a test can count the vista's lights apart from these
      if (w.lit) { rec.lit++; stats.lit++; }
      stats.windows++;
      push('window', { z0: w.z0, z1: w.z1, sill: w.sill, h: w.h, floor: w.floor, variant: w.variant, lit: w.lit, k: w.k });
    }
    // ---- the drainpipe, its brackets, a gutter under the pretil and the rust the joints leave
    if (s.pipe) {
      const p = s.pipe, g = gnd(p.z), dp = EDGE.VEN + 0.034, r = 0.032, top = p.top, foot = g + 0.12;
      b.cyl(MAT.iron, X(dp), foot, p.z, r, top - foot, 8, { col: mul(IRON, 1.1), caps: false });
      for (let y = top - 0.25; y > foot + 0.2; y -= 1.15) {
        F.box(MAT.iron, p.z - 0.045, p.z + 0.045, y - 0.015, y + 0.015, EDGE.VEN, dp + 0.02, IRON, ['back', 'bot']);
        const wall = hueOf(p.k), n = 0.5 + 0.4 * rng.next();                                                                  // a rusty tongue under each bracket
        F.quad(MAT.wall, EDGE.VEN + 0.007, p.z - 0.05, p.z + 0.05, y - n, y - n, y, y, { cols: [mul(wall, 0.7), mul(wall, 0.7), mix(mul(wall, 0.6), RUST, 0.7), mix(mul(wall, 0.6), RUST, 0.7)] });
      }
      F.box(MAT.iron, p.z - 0.065, p.z + 0.065, g - 0.04, g + 0.2, EDGE.VEN, EDGE.VEN + 0.06, IRON, ['back', 'bot']);          // the boot at the foot
      const gu = s.gutter;
      F.box(MAT.iron, gu.z0, gu.z1, gu.y - 0.3, gu.y - 0.18, EDGE.VEN, EDGE.VEN + 0.06, mul(GALV, 0.8), ['back']);
      push('pipe', { z0: p.z - 0.05, z1: p.z + 0.05, y0: g, y1: top, k: p.k });
    }
    // ---- a mural or a big tag, hung a hair off the skin (a bump over every pier it crosses)
    if (s.art) {
      const a = s.art, dArt = EDGE.VEN + 0.014, bump = EDGE.REACH - 0.015;
      if (a.kind === 'tag') {
        const zc = (a.z0 + a.z1) / 2, zl = F.left(a.z0, a.z1), zr = F.right(a.z0, a.z1), gl = gnd(zl), gr = gnd(zr);
        signPanel(K, art, a.key, X(dArt), zc, sg > 0 ? -1 : 1, 0, a.w, gl + 0.7, gr + 0.7, a.h);
        rec.tags++;
      } else {
        const zs = []; for (let z = a.z0; z < a.z1 - 1e-6; z += 0.5) zs.push([z, dArt]);
        zs.push([a.z1, dArt]);
        for (const zp of s.piers) if (zp + EDGE.PIER + 0.05 > a.z0 && zp - EDGE.PIER - 0.05 < a.z1) zs.push([zp - EDGE.PIER - 0.04, dArt], [zp - EDGE.PIER, bump], [zp + EDGE.PIER, bump], [zp + EDGE.PIER + 0.04, dArt]);
        zs.sort((p, q) => p[0] - q[0]);
        const pts = zs.filter(([z]) => z >= a.z0 - 1e-6 && z <= a.z1 + 1e-6).map(([z, d]) => ({ x: X(d), y: gnd(z, d) + EDGE.LIFT, z }));
        if (sg < 0) pts.reverse();
        muralPanel(K, art, a.key, pts, a.h);
        rec.murals++;
      }
      push(a.kind, { z0: a.z0, z1: a.z1, key: a.key });
    }
    // ---- the creeper: cards stacked up the strip from the foot, and a drape of bougainvillea over the pretil
    if (s.creeper) {
      const c = s.creeper, cw = c.z1 - c.z0, uv = K.atlas ? K.atlas.uv(c.tile) : [0, 0, 1, 1], r2 = rng.fork('creeper' + s.id), vines = K.atlas ? K.atlas.uv(TILE.VINE) : uv;
      const cols = Math.max(2, Math.round(cw / 1.1));
      for (let ci = 0; ci < cols; ci++) {
        const zc = c.z0 + ((ci + 0.5) * cw) / cols, g0 = gmaxOver(zc - 0.5, zc + 0.5), top = topOf(kOf(zc)) - 0.15;
        for (let y = g0 - 0.15; y < top; y += r2.range(0.5, 0.85)) {                                                           // each card a little askew, so the straight top edge of one does not line up with the next
          const w = r2.range(1.0, 1.6), h = Math.min(1.45, top - y + 0.2), d = 0.135 + 0.012 * r2.next(), zz = zc + r2.range(-0.3, 0.3), a = r2.range(-0.3, 0.3);
          const bg = c.tile === TILE.BOUGAIN && y > top - 2.2 && r2.chance(0.6), tint = bg ? [1, 1, 1] : [0.62 + 0.3 * r2.next(), 0.82 + 0.18 * r2.next(), 0.5 + 0.2 * r2.next()];
          card(K.b('floralow', X(d), zz, { cast: false }), 'foliage_low', [X(d), y, zz], [0, Math.sin(a), Math.cos(a)], [0, Math.cos(a), -Math.sin(a)], w, h, bg ? K.atlas ? K.atlas.uv(TILE.BOUGAIN) : uv : vines, tint, V.nrm([sg > 0 ? -1 : 1, 0.3, 0]));
          rec.leafTris += 2;
        }
      }
      const pts = []; for (let k = kOf(c.z0 + 0.01); k <= kOf(c.z1 - 0.01); k++) pts.push({ x: X(0), z: zOf(k) + 1, nx: sg > 0 ? -1 : 1, nz: 0, y: topOf(k) });
      if (sg < 0) pts.reverse();
      if (pts.length > 1) drape(K, pts, rng.fork('drape' + s.id), { tile: c.tile, step: 0.8, hang: 1.2 });
      push('creeper', { z0: c.z0, z1: c.z1 });
    }
    // ---- the roofline beyond: tanks on stands, antennas, a dish, a zinc lean-to, columns with rebar
    roofline(K, F, s, topOf, rng.fork('roof' + s.id));
    stats.stretches += 0;
  }

  // ---- the plain stretches between: a service door, a meter board and its cables, a stepped footing
  for (const g of side.gaps) gapDetail(K, F, g, side, rec, rng.fork('gap' + g.k0), { gnd, gmaxOver, gminOver, plainTop, push });

  // ---- the crest points: a raised panel hangs its bougainvillea from the new top (the creeper strip does that itself), so it leaves the plain run
  if (crests[0]?.length) {
    const runs = []; let cur = [];
    crests[0].forEach((c, k) => { if (raised.has(k)) { if (cur.length) runs.push(cur); cur = []; } else cur.push(c); });
    if (cur.length) runs.push(cur);
    crests.length = 0; crests.push(...runs);
  }
  ctx.world.edge.stats ??= {}; ctx.world.edge.stats[sd.id] = stats;
  return stats;
}

// ---------------------------------------------------------------------------------------------------- the roofline
function roofline(K, F, s, topOf, r) {
  const { X } = F, out = K.ctx.batch.builder('props.boundary.edge', { cast: false });
  const sg = X(0) > 0 ? 1 : -1, T = (z) => topOf(Math.max(s.k0, Math.min(s.k1, Math.floor((z - EDGE.S0) / 2))));
  const BLUE = lin(0x2c5aa0), BLACK = lin(0x1a1b1f), BEIGE = lin(0xcdbf9c), LEG = lin(0x4a4d52);
  for (const it of s.roof.items) {
    const y0 = T(it.z) - 0.1;
    if (it.kind === 'tank') {
      const rad = 0.42 + 0.06 * r.next(), col = it.tone === 'blue' ? BLUE : it.tone === 'beige' ? BEIGE : BLACK, d = -0.95, leg = 0.55, yb = y0 + leg, hh = 0.95;
      for (const [dz, dd] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) F.box(MAT.iron, it.z + dz * rad * 0.7 - 0.025, it.z + dz * rad * 0.7 + 0.025, y0 - 0.2, yb + 0.05, d + dd * rad * 0.7 - 0.025, d + dd * rad * 0.7 + 0.025, LEG, ['bot']);
      out.cyl(MAT.tank, X(d), yb, it.z, rad, hh, 10, { r1: rad * 0.94, col: mul(col, 0.9 + 0.2 * r.next()) });
      out.cyl(MAT.tank, X(d), yb + hh, it.z, rad * 0.94, 0.14, 10, { r1: rad * 0.3, col, caps: false });
      out.cyl(MAT.tank, X(d), yb + hh * 0.55, it.z, rad * 1.015, 0.05, 10, { col: mul(col, 0.7), caps: false });
    } else if (it.kind === 'antenna') {
      const h = it.tall ? 3.4 : 2.3, d = -0.85;
      F.box(MAT.iron, it.z - 0.02, it.z + 0.02, y0 - 0.2, y0 + h, d - 0.02, d + 0.02, IRON, ['bot']);
      for (let q = 0; q < (it.tall ? 6 : 4); q++) { const y = y0 + h * (0.45 + 0.1 * q), len = 0.95 - 0.12 * q; F.box(MAT.iron, it.z - len / 2, it.z + len / 2, y - 0.008, y + 0.008, d - 0.008, d + 0.008, IRON, ['bot']); }
    } else if (it.kind === 'dish') {
      const d = -0.7, a = [X(d), y0 + 0.62, it.z], dir = V.nrm([-sg * 0.65, 0.55, r.range(-0.5, 0.5)]);
      F.box(MAT.iron, it.z - 0.02, it.z + 0.02, y0 - 0.2, y0 + 0.6, d - 0.02, d + 0.02, IRON, ['bot']);
      tube(out, MAT.iron, a, V.add(a, V.mul(dir, 0.3)), 0.03, 0.36, 10, { col: mix(GALV, [1, 1, 1], 0.25), caps: true });
    } else if (it.kind === 'leanto') {
      const za = it.z, zb = it.z + it.w, ya = y0 + 0.05, yb = y0 + 0.95, da = -0.45, db = -1.8, col = mix(GALV, lin(0x5f7585), 0.5);
      const q = (flip) => (flip ? [[za, db, yb], [zb, db, yb], [zb, da, ya], [za, da, ya]] : [[za, da, ya], [zb, da, ya], [zb, db, yb], [za, db, yb]]);
      for (const flip of [false, true]) { const c = q(flip).map(([z, d, y]) => [X(d), y, z]); out.quad(MAT.zinc, c[0], c[1], c[2], c[3], { cols: [mul(col, 0.8), mul(col, 0.8), mul(col, 1.1), mul(col, 1.1)] }); }
      for (const z of [za + 0.1, zb - 0.1]) F.box(MAT.iron, z - 0.03, z + 0.03, y0 - 0.3, yb, db - 0.03, db + 0.03, LEG, ['bot']);
      F.box(MAT.iron, za, zb, yb - 0.04, yb, db - 0.03, db + 0.01, mix(col, RUST, 0.5), ['bot']);
    } else if (it.kind === 'column') {
      const d = -0.2, h = 0.5 + 0.35 * r.next(), y = T(it.z);
      F.box(MAT.cap, it.z - 0.14, it.z + 0.14, y, y + h, d - 0.14, d + 0.14, mul(CONCRETE, 0.9), ['bot']);
      for (const [dz, dd] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const rh = 0.5 + 0.5 * r.next(); F.box(MAT.iron, it.z + dz * 0.09 - 0.009, it.z + dz * 0.09 + 0.009, y + h, y + h + rh, d + dd * 0.09 - 0.009, d + dd * 0.09 + 0.009, RUST, ['bot']); }
    }
  }
}

// ---------------------------------------------------------------------------------------------------- the plain stretches
function gapDetail(K, F, g, side, rec, r, { gnd, gmaxOver, gminOver, plainTop, push }) {
  const b = K.ctx.batch.builder('props.boundary.edge', { cast: false }), { X } = F, sg = side.sg;
  if (g.kind === 'footing') {
    for (let k = g.ka; k <= g.kb; k++) {
      const zs = zOf(k), ze = zs + 2, hi = gmaxOver(zs, ze, 0.06), lo = gminOver(zs, ze, 0.06);
      F.box(MAT.cap, zs, ze, lo - 0.3, hi + 0.05, 0.0, 0.12, mul(CONCRETE, 0.92 + 0.1 * r.next()), ['back', 'bot']);
    }
    rec.footings++; push('footing', { z0: zOf(g.ka), z1: zOf(g.kb) + 2 });
  } else if (g.kind === 'door') {
    const zs = zOf(g.k), zc = zs + 1, hw = 0.5, hh = 1.95, base = gmaxOver(zc - hw - 0.1, zc + hw + 0.1, 0.06), room = plainTop(g.k) - base;
    if (room < hh + 0.3) return;
    const col = lin(g.color), y0 = base - 0.02;
    F.box(MAT.trim, zc - hw - 0.1, zc + hw + 0.1, y0, y0 + hh + 0.1, 0.0, 0.05, mul(CONCRETE, 1.05), ['back', 'bot']);                 // the surround
    F.box(MAT.iron, zc - hw, zc + hw, y0, y0 + hh, 0.05, 0.085, col, ['back', 'bot']);                                              // the leaf
    for (const f of [0.33, 0.66]) F.box(MAT.iron, zc - hw, zc + hw, y0 + hh * f - 0.03, y0 + hh * f + 0.03, 0.085, 0.1, mul(col, 0.75), ['back', 'bot']);   // two ribs
    const hz = sg > 0 ? zc + hw - 0.14 : zc - hw + 0.14;
    F.box(MAT.iron, hz - 0.02, hz + 0.02, y0 + 0.95, y0 + 1.1, 0.085, 0.12, IRON, ['back', 'bot']);                                  // handle
    F.box(MAT.iron, hz - 0.1, hz - 0.03, y0 + 0.96, y0 + 1.06, 0.085, 0.105, IRON, ['back', 'bot']);                                 // hasp
    F.box(MAT.iron, hz - 0.055, hz - 0.015, y0 + 0.86, y0 + 0.95, 0.105, 0.13, BRASS, ['back', 'bot']);                                // the padlock
    F.box(MAT.trim, zc - hw - 0.12, zc + hw + 0.12, base - 0.3, base + 0.05, 0.0, 0.13, mul(CONCRETE, 0.95), ['back', 'bot']);          // a step
    rec.doors++; push('door', { z0: zc - hw - 0.12, z1: zc + hw + 0.12, y0: base - 0.3, y1: y0 + hh + 0.1 });
  } else if (g.kind === 'meters') {
    const zp = zOf(g.k), base = gmaxOver(zp - 0.2, zp + 0.2, 0.11), y = base + 1.25, front = 0.1;
    F.box(MAT.iron, zp - 0.15, zp + 0.15, y + 0.5, y + 0.74, front, front + 0.04, mul(GALV, 0.9), ['back', 'bot']);                  // the junction box
    for (const dz of [-0.075, 0.075]) F.box(MAT.trim, zp + dz - 0.065, zp + dz + 0.065, y, y + 0.3, front, front + 0.039, lin(0xe9e7de), ['back', 'bot']);      // two meters
    for (const dz of [-0.075, 0.075]) F.box(MAT.iron, zp + dz - 0.04, zp + dz + 0.04, y + 0.1, y + 0.2, front + 0.039, front + 0.04, IRON, ['back', 'bot']);   // their dials
    F.box(MAT.iron, zp - 0.015, zp + 0.015, y + 0.74, plainTop(g.k) + 0.1, front, front + 0.03, GALV, ['back', 'bot']);               // the conduit up
    const zEnd = zp + g.dir * 3.6;                                                                                                   // cables drooping along the face to the next pilaster
    for (let c = 0; c < 3; c++) {
      let prev = [X(0.04 + 0.02 * c), y + 0.74 + 0.02 * c, zp];
      for (let q = 1; q <= 5; q++) {
        const t = q / 5, zz = zp + (zEnd - zp) * t, yy = y + 0.7 + 0.1 * c - Math.sin(t * Math.PI) * (0.5 + 0.1 * c) - t * 0.25, p = [X(0.035 + 0.02 * c + 0.01 * Math.sin(t * 6)), yy, zz];
        beam(b, MAT.iron, prev, p, 0.015, 0.015, { col: IRON }); prev = p;
      }
    }
    rec.meters++; push('meters', { z0: Math.min(zp - 0.2, zEnd), z1: Math.max(zp + 0.2, zEnd), y0: y, y1: y + 0.8 });
  }
}
