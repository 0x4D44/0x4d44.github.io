// Shop shutters (A2; review R1-003 "the same flat grey shutter with one dot" and R4-010 "from inside it is one flat grey panel").
// Six looks, picked per lot so that neighbours differ (`assignShopfronts`), each with real geometry on BOTH faces (slat relief outside and in),
// its own way of opening (`makeShutterRig`), and the frame that goes with it (`shutterFrame`). Plain MeshBuilder + three Groups: runs under Node.
//   steel    galvanised roll-up curtain, interlocking slats (pale / mid / dirty), rust at the foot
//   painted  the same curtain painted green, blue, yellow, rust red, red or cream, with a bolted repair patch
//   ajar     a roll-up pulled up about 0.4 m: a glazed door shows underneath (it glows at night)
//   glazed   a storefront: kick panel, glass in mullions, an iron grille outside; folds to the jamb like an accordion door
//   fold     a scissor (lazy-tongs) gate over glass; folds to one jamb
//   wood     double plank doors with battens and strap hinges; swing outward
// The collider is untouched: one wall `door:<id>` the full width, switched by physics.setDoor like every other door.
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { lin, mulc, qd, hash01, wbox } from './mb.js';

/** noun = the word in the E prompt ("Abrir persiana" / "Abrir puerta"). */
export const SHUTTER_STYLES = {
  steel: { roll: true, noun: 'persiana', weight: 2.4, tones: 3 },
  painted: { roll: true, noun: 'persiana', weight: 3.0, tones: 6 },
  ajar: { roll: true, noun: 'persiana', weight: 1.4, tones: 9 },
  glazed: { roll: false, noun: 'puerta', weight: 1.4, tones: 4 },
  fold: { roll: false, noun: 'puerta', weight: 1.2, tones: 3 },
  wood: { roll: false, noun: 'puerta', weight: 1.4, tones: 5 },
};
const GALV = [[0.80, 0.82, 0.83], [0.66, 0.68, 0.70], [0.76, 0.70, 0.64]];                           // pale, mid, dirty-warm (linear multipliers)
const PAINT = [0x2f7a52, 0x2a5d9a, 0xdcae1e, 0x9a4a2a, 0xa8322a, 0xe2d6b6];                           // green, blue, yellow, rust red, red, cream
const FRAMES = [0xeeeeea, 0x6b4a32, 0x23272b, 0x2f5f8f];                                              // white aluminium, bronze, black, blue
const GATES = [0x1f2326, 0x1f5f46, 0xe8e6dc];                                                         // black, green, white
const WOODS = [[1.3, 1.15, 1.0], [1.9, 1.5, 1.0], [0.85, 1.35, 0.95], [0.8, 1.0, 1.7], [1.7, 0.85, 0.7]];   // over the dark plank texture: natural, honey, green, blue, red
const NEAR_GAP = 6;                                                                                   // m between two footprints that still count as neighbours

/** Does this lot have a shop door that wears one of the looks? (the plans with a roll-up door: shop houses, corner stores, workshops, kiosks; or a lot that pins one) */
export const isShopLot = (lot) => ['shophouse', 'cornerstore', 'workshop', 'kiosk'].includes(lot.kind) || !!SHUTTER_STYLES[lot.style?.shutter];

const makeLook = (lot, style, tone) => ({ style, tone, key: `${style}:${tone}`, hinge: hash01(lot.id, 92) < 0.5 ? -1 : 1, gap: 0.34 + 0.14 * hash01(lot.id, 93) });

/** A lot may pin its own shutter in the plan: `lot.style.shutter` = a style name, `lot.style.shutterTone` = the colour index (else a hash picks it). */
function pinnedLook(lot) {
  const style = lot.style?.shutter, def = SHUTTER_STYLES[style];
  if (!def) return null;
  const n = def.tones, i = lot.style.shutterTone;
  return makeLook(lot, style, Number.isInteger(i) ? ((i % n) + n) % n : Math.floor(hash01(lot.id, 94) * n));
}

/**
 * A look for every shop lot, the same for the same plan: a greedy colouring over the neighbours (footprints within NEAR_GAP m of each other), so that no two
 * adjacent shopfronts share a look (style + tone), and as few as possible share a style. Pinned lots keep their look and are avoided by the rest; the others
 * are taken in id order, the weighted hash deciding among ties. Returns Map(lot.id -> { style, tone, key, hinge, gap }).
 */
export function assignShopfronts(lots) {
  const shops = lots.filter(isShopLot).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cands = [];
  for (const [style, def] of Object.entries(SHUTTER_STYLES)) for (let t = 0; t < def.tones; t++) cands.push({ style, tone: t, key: `${style}:${t}`, w: def.weight / def.tones });
  const out = new Map(), used = {};
  for (const lot of shops) { const p = pinnedLook(lot); if (p) { out.set(lot.id, p); used[p.style] = (used[p.style] ?? 0) + 1; } }
  for (const lot of shops) {
    if (out.has(lot.id)) continue;
    const near = shops.filter((o) => out.has(o.id) && Math.hypot(o.x - lot.x, o.z - lot.z) < (o.w + lot.w) / 2 + NEAR_GAP).map((o) => out.get(o.id));
    let best = null, bs = -Infinity;
    for (const c of cands) {
      const u = Math.max(1e-6, hash01(lot.id + '|' + c.key, 91)), pref = Math.pow(u, 1 / c.w);        // weighted random key: a bigger weight tends to win
      const score = pref - 10 * near.filter((n) => n.key === c.key).length - 2 * near.filter((n) => n.style === c.style).length - 0.04 * (used[c.style] ?? 0);
      if (score > bs) { bs = score; best = c; }
    }
    used[best.style] = (used[best.style] ?? 0) + 1;
    out.set(lot.id, makeLook(lot, best.style, best.tone));
  }
  return out;
}

/** The look of one lot (computed for every lot of the plan once per ctx). Falls back to a hash-only pick when the lot is not in the plan. */
export function shopfrontOf(ctx, lot) {
  const lots = ctx.plan?.lots ?? [];
  if (!ctx.archShops || ctx.archShops.n !== lots.length) ctx.archShops = { n: lots.length, map: assignShopfronts(lots) };
  return ctx.archShops.map.get(lot.id) ?? assignShopfronts([{ ...lot, kind: 'shophouse' }]).get(lot.id);       // a lot outside the plan's list (a test, a one-off): its own hash pick
}

/** The main colour of a look (linear rgb): the curtain, the frame or the gate. */
export function lookColour(look) {
  switch (look.style) {
    case 'steel': return GALV[look.tone % GALV.length];
    case 'painted': return lin(PAINT[look.tone % PAINT.length]);
    case 'ajar': return look.tone < 3 ? GALV[look.tone] : lin(PAINT[(look.tone - 3) % PAINT.length]);
    case 'glazed': return lin(FRAMES[look.tone % FRAMES.length]);
    case 'fold': return lin(GATES[look.tone % GATES.length]);
    default: return WOODS[look.tone % WOODS.length];
  }
}
const isPainted = (look) => look.style === 'painted' || (look.style === 'ajar' && look.tone >= 3);

// ---- leaf geometry -----------------------------------------------------------------------------------------------------------------------------
// Everything below is authored in the door's own frame: x across the opening (-w/2..w/2), y from the sill up (0..h), z across the wall with +z toward the
// street side `o` (o = +1 or -1 in the leaf's z). The caller shifts the builder so that the group origin is the pivot.

/**
 * Horizontal slat relief on one face between heights ybot and ytop: every slat is a sloping top lip, a flat crown and a sloping bottom lip, 3 quads a slat.
 * base = linear colour, jit(i) a per-slat multiplier, shade(y) an [r,g,b] multiplier by height (dirt and rust at the foot). `o` = which way the face looks.
 */
function slatFace(mb, mat, w, ytop, ybot, zf, o, dep, pitch, base, jit, shade) {
  const n = Math.max(4, Math.round((ytop - ybot) / pitch)), p = (ytop - ybot) / n, x0 = -w / 2, x1 = w / 2, zc = zf + o * dep;
  for (let i = 0; i < n; i++) {
    const ya = ytop - i * p, yb = ya - 0.3 * p, yc = ya - 0.7 * p, yd = ya - p, f = jit(i), sh = shade(yc);
    const cl = (m) => [base[0] * f * m * sh[0], base[1] * f * m * sh[1], base[2] * f * m * sh[2]];
    qd(mb, mat, [x0, ya, zf], [x1, ya, zf], [x1, yb, zc], [x0, yb, zc], [0, 0.5, o], { col: cl(1.1) });
    qd(mb, mat, [x0, yb, zc], [x1, yb, zc], [x1, yc, zc], [x0, yc, zc], [0, 0, o], { col: cl(1) });
    qd(mb, mat, [x0, yc, zc], [x1, yc, zc], [x1, yd, zf], [x0, yd, zf], [0, -0.5, o], { col: cl(0.78) });
  }
}

/** The roll-up curtain (steel, painted, and the leaf of `ajar`): relief outside, shallower relief of bare galvanised steel inside, a heavy bottom bar. */
function rollLeaf(mb, d, look, o, hv) {
  const w = d.w, h = d.h, th = 0.04, base = lookColour(look), painted = isPainted(look), M = 'shutter_slats';
  const foot = (y) => { const k = 0.62 + 0.38 * Math.min(1, y / 0.8), r = !painted && y < 0.3 ? [1.0, 0.72, 0.55] : [1, 1, 1]; return [k * r[0], k * r[1], k * r[2]]; };   // dirt, and rust on bare steel
  slatFace(mb, M, w, h, 0.09, o * th / 2, o, 0.013, 0.08, base, (i) => 0.96 + 0.08 * hv(100 + i), foot);
  slatFace(mb, M, w, h, 0.09, -o * th / 2, -o, 0.009, 0.08, [0.62, 0.64, 0.66], (i) => 0.97 + 0.06 * hv(200 + i), (y) => { const k = 0.8 + 0.2 * Math.min(1, y / 0.8); return [k, k, k]; });
  // bottom bar, finger pulls, lock
  mb.box(M, 0, 0.045, 0, w, 0.09, th + 0.035, { col: mulc(painted ? base : [0.5, 0.5, 0.5], 0.62) });
  for (const x of [-w * 0.3, w * 0.3]) mb.box(M, x, 0.05, o * (th / 2 + 0.024), 0.16, 0.035, 0.02, { col: [0.05, 0.05, 0.05] });
  mb.box(M, hv(7) < 0.5 ? -w * 0.08 : w * 0.08, 0.12, o * (th / 2 + 0.03), 0.09, 0.07, 0.04, { col: [0.04, 0.04, 0.045] });
  // a bolted repair patch of another sheet, on about half of the painted curtains
  if (painted && hv(8) < 0.55) {
    const pw = 0.4 + 0.5 * hv(9), ph = 0.25 + 0.3 * hv(10), px = (hv(11) - 0.5) * (w - pw - 0.3), py = 0.5 + hv(12) * (h - 1.3), z = o * (th / 2 + 0.0145);
    const alt = lin(PAINT[Math.floor(hv(13) * PAINT.length) % PAINT.length]);
    qd(mb, M, [px - pw / 2, py - ph / 2, z], [px + pw / 2, py - ph / 2, z], [px + pw / 2, py + ph / 2, z], [px - pw / 2, py + ph / 2, z], [0, 0, o], { col: mulc(alt, 0.95) });
  }
}

/** A pane of glass (window_lit: see-through by day, warm at night) in the door's plane, both faces. */
function glass(mb, x0, y0, x1, y1, z, col = [1, 1, 1]) {
  mb.quad('window_lit', [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], { col });
}

/** The glazed door behind a half-raised curtain: glass in a thin frame, a mullion in the middle and a lit-up look at night. */
function backingLeaf(mb, d, look, o, hv) {
  const w = d.w, h = d.h, z = -o * 0.13, fc = [0.18, 0.19, 0.2];
  glass(mb, -w / 2 + 0.03, 0.05, w / 2 - 0.03, h - 0.03, z);
  for (const x of [-w / 2 + 0.03, 0, w / 2 - 0.03]) mb.box('grille_iron', x, h / 2, z, 0.05, h - 0.06, 0.03, { col: fc });
  for (const y of [0.05, h * 0.5, h - 0.03]) mb.box('grille_iron', 0, y, z, w - 0.04, 0.045, 0.03, { col: fc });
  mb.box('rail_metal', -0.07, 1.05, z + o * 0.03, 0.025, 0.5, 0.03, { col: [0.75, 0.76, 0.78] });
  mb.box('rail_metal', 0.07, 1.05, z + o * 0.03, 0.025, 0.5, 0.03, { col: [0.75, 0.76, 0.78] });
}

/** Glazed accordion storefront: a painted kick panel, glass in mullions, an iron grille on the street side. */
function glazedLeaf(mb, d, look, o, hv) {
  const w = d.w, h = d.h, fc = lookColour(look), kick = 0.86, z = 0, M = 'door_metal';
  // kick panel: a sheet with two raised panels each side of the middle
  mb.box(M, 0, kick / 2, z, w, kick, 0.045, { col: fc });
  const np = Math.max(2, Math.round(w / 0.9)), pw = (w - 0.1) / np - 0.1;
  for (let i = 0; i < np; i++) {
    const cx = -w / 2 + 0.05 + 0.1 + pw / 2 + i * (pw + 0.1);
    mb.box(M, cx, kick / 2, o * 0.026, pw, kick - 0.2, 0.012, { col: mulc(fc, 0.86) });
  }
  // glass between mullions, a transom bar at two thirds
  glass(mb, -w / 2 + 0.04, kick + 0.02, w / 2 - 0.04, h - 0.04, 0);
  for (let i = 0; i <= np; i++) mb.box(M, -w / 2 + 0.025 + ((w - 0.05) * i) / np, (kick + h) / 2, 0, 0.05, h - kick, 0.05, { col: fc });
  mb.box(M, 0, kick, 0, w, 0.05, 0.05, { col: fc }); mb.box(M, 0, h - 0.025, 0, w, 0.05, 0.05, { col: fc }); mb.box(M, 0, kick + (h - kick) * 0.62, 0, w, 0.035, 0.045, { col: fc });
  // pull handles at the meeting stile
  for (const x of [-0.06, 0.06]) mb.box('rail_metal', x, 1.05, o * 0.05, 0.025, 0.55, 0.03, { col: [0.78, 0.79, 0.8] });
  // the iron grille: pickets and three rails just outside the glass
  const zg = o * 0.075, n = Math.max(6, Math.round(w / 0.115)), gc = [0.07, 0.075, 0.08];
  for (let i = 0; i <= n; i++) mb.box('grille_iron', -w / 2 + 0.02 + ((w - 0.04) * i) / n, kick + (h - kick) / 2, zg, 0.014, h - kick - 0.04, 0.014, { col: gc, skip: ['py', 'ny'] });
  for (const y of [kick + 0.03, kick + (h - kick) * 0.5, h - 0.05]) mb.box('grille_iron', 0, y, zg, w - 0.02, 0.025, 0.025, { col: gc });
  if (hv(5) < 0.7) mb.box('rail_metal', w * 0.12, 1.1, o * 0.092, 0.07, 0.05, 0.03, { col: [0.05, 0.05, 0.05] });          // padlock
}

/** Scissor (lazy-tongs) gate over glass: crossed diagonals in a frame; folds to a jamb. */
function foldLeaf(mb, d, look, o, hv) {
  const w = d.w, h = d.h, col = lookColour(look), z = o * 0.04, M = 'grille_iron';
  glass(mb, -w / 2 + 0.02, 0.04, w / 2 - 0.02, h - 0.03, -o * 0.02);
  const N = Math.max(6, Math.round(w / 0.24)), R = Math.max(4, Math.round(h / 0.36)), hw = 0.011;
  const strip = (x0, y0, x1, y1) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = (-dy / l) * hw, ny = (dx / l) * hw;
    for (const zz of [z, z - o * 0.004]) {
      const want = zz === z ? [0, 0, o] : [0, 0, -o];
      qd(mb, M, [x0 - nx, y0 - ny, zz], [x1 - nx, y1 - ny, zz], [x1 + nx, y1 + ny, zz], [x0 + nx, y0 + ny, zz], want, { col });
    }
  };
  const x0 = -w / 2 + 0.04, x1 = w / 2 - 0.04, y0 = 0.07, y1 = h - 0.07;
  for (let j = 0; j < N; j++) for (let k = 0; k < R; k++) {
    const ax = x0 + ((x1 - x0) * j) / N, bx = x0 + ((x1 - x0) * (j + 1)) / N, ay = y0 + ((y1 - y0) * k) / R, by = y0 + ((y1 - y0) * (k + 1)) / R;
    strip(ax, ay, bx, by); strip(bx, ay, ax, by);
  }
  mb.box(M, 0, 0.03, z, w, 0.05, 0.05, { col }); mb.box(M, 0, h - 0.03, z, w, 0.05, 0.05, { col });
  for (const x of [-w / 2 + 0.025, w / 2 - 0.025]) mb.box(M, x, h / 2, z, 0.05, h, 0.06, { col });
  mb.box('rail_metal', hv(6) < 0.5 ? -w * 0.3 : w * 0.3, 1.0, z + o * 0.04, 0.07, 0.05, 0.03, { col: [0.05, 0.05, 0.05] });
}

/** One half of a pair of plank doors: hinge at x = 0, free end at x = dir * lw. */
function woodHalf(mb, d, look, o, dir, lw, hv) {
  const h = d.h, col = lookColour(look), th = 0.05, cx = dir * lw / 2;
  mb.box('wood_dark_door', cx, h / 2, 0, lw, h, th, { col });
  for (const y of [0.28, h * 0.5, h - 0.28]) for (const sd of [1, -1]) mb.box('wood_dark_door', cx, y, sd * o * (th / 2 + 0.013), lw - 0.08, 0.12, 0.026, { col: mulc(col, sd > 0 ? 0.8 : 0.7) });   // battens, both faces
  for (const y of [0.3, h - 0.3]) mb.box('grille_iron', dir * 0.22, y, o * (th / 2 + 0.034), 0.44, 0.07, 0.012, { col: [0.06, 0.06, 0.065] });            // strap hinges
  for (const y of [0.3, h - 0.3]) mb.box('grille_iron', dir * 0.02, y, o * (th / 2 + 0.034), 0.05, 0.1, 0.02, { col: [0.06, 0.06, 0.065] });
  mb.box('grille_iron', dir * (lw - 0.05), h * 0.5, o * (th / 2 + 0.034), 0.03, h - 0.5, 0.012, { col: [0.07, 0.07, 0.075] });                              // cover strip at the meeting edge
  if (dir > 0) { mb.box('grille_iron', dir * (lw - 0.1), 1.0, o * (th / 2 + 0.044), 0.14, 0.05, 0.02, { col: [0.05, 0.05, 0.055] }); }                      // hasp
  else mb.box('grille_iron', dir * (lw - 0.12), 1.0, o * (th / 2 + 0.05), 0.05, 0.06, 0.035, { col: [0.05, 0.05, 0.055] });                                  // padlock
}

// ---- the live rig -------------------------------------------------------------------------------------------------------------------------------
/**
 * Build the leaf (or leaves) of a shop door and say how it opens. Returns { pivots, apply(e), noun, anim } where e = 0 (closed) .. 1 (open). `pivots` are
 * positioned and rotated in the building's frame and go under the building's pose group; `apply` moves them.
 */
export function makeShutterRig(ctx, G, d, look) {
  const S = G.S, dir = d.wall.dir, at = d.wall.at, t = d.wall.t, yk = d.floor * S.fh, c = dir === 'x' ? d.x : d.z;
  const s = d.side === 'front' || d.side === 'right' ? 1 : -1, o = dir === 'x' ? s : -s;          // which way the street lies in the leaf's own z
  const pl = at + s * (t / 2 - 0.07), phi0 = dir === 'x' ? 0 : -Math.PI / 2;
  const hv = (n) => hash01(d.id, n), w = d.w, h = d.h, def = SHUTTER_STYLES[look.style] ?? SHUTTER_STYLES.painted;
  const pivotAt = (name, u, y) => { const g = new THREE.Group(); g.name = name; g.position.set(dir === 'x' ? u : pl, y, dir === 'x' ? pl : u); g.rotation.y = phi0; return g; };
  const part = (name, y0, build) => { const mb = new MeshBuilder().setBasePose(0, -y0, 0, 0); build(mb); const g = new THREE.Group(); g.name = name; mb.flush(g, ctx, { name, cast: false }); return g; };
  const base = { noun: def.noun, anim: look.style, look };
  switch (look.style) {
    case 'steel': case 'painted': {
      const pv = pivotAt('door:' + d.id, c, yk + h);
      pv.add(part('leaf:' + d.id, h, (mb) => rollLeaf(mb, d, look, o, hv)));
      return { ...base, anim: 'roll', pivots: [pv], apply: (e) => { pv.scale.y = 1 - 0.88 * e; } };
    }
    case 'ajar': {                                                                             // the curtain stops `gap` m above the floor; the glazed door behind it shows below. Both roll up together
      const hl = h - look.gap, pv = pivotAt('door:' + d.id, c, yk + h);
      pv.add(part('back:' + d.id, h, (mb) => backingLeaf(mb, d, look, o, hv)));
      pv.add(part('leaf:' + d.id, hl, (mb) => rollLeaf(mb, { ...d, h: hl }, look, o, hv)));
      return { ...base, anim: 'roll', pivots: [pv], apply: (e) => { pv.scale.y = 1 - 0.88 * e; } };
    }
    case 'glazed': case 'fold': {
      const hs = look.hinge, pv = pivotAt('door:' + d.id, c + hs * w / 2, yk), leaf = part('leaf:' + d.id, 0, (mb) => (look.style === 'glazed' ? glazedLeaf : foldLeaf)(mb, d, look, o, hv));
      leaf.position.x = -hs * w / 2; pv.add(leaf);
      return { ...base, pivots: [pv], apply: (e) => { pv.scale.x = 1 - 0.88 * e; } };
    }
    default: {                                                                                 // wood: two leaves hinged at the jambs, swinging out to the street
      const lw = w / 2, ang = 1.75;                                                           // the two leaves meet in the middle: no daylight between them
      const L = pivotAt('door:' + d.id, c - w / 2, yk), R = pivotAt('door:' + d.id + '.b', c + w / 2, yk);
      L.add(part('leaf:' + d.id, 0, (mb) => woodHalf(mb, d, look, o, 1, lw, hv)));
      R.add(part('leaf:' + d.id + '.b', 0, (mb) => woodHalf(mb, d, look, o, -1, lw, hv)));
      return { ...base, pivots: [L, R], apply: (e) => { L.rotation.y = phi0 - o * ang * e; R.rotation.y = phi0 + o * ang * e; } };
    }
  }
}

// ---- the frame ----------------------------------------------------------------------------------------------------------------------------------
/** The static part of a shop door: guide rails and roll cassette (curtains), a lintel board (the others), a heavy surround (plank doors). */
export function shutterFrame(G, d, look) {
  const { S, b, fs } = G, dir = d.wall.dir, at = d.wall.at, t = d.wall.t, uc = dir === 'x' ? d.x : d.z, yk = d.floor * S.fh, s = d.side === 'front' || d.side === 'right' ? 1 : -1;
  const pc = at + s * (t / 2 + 0.09), col = look.style === 'steel' || look.style === 'ajar' ? lookColour(look) : look.style === 'painted' ? lookColour(look) : mulc(fs.metal, 1.1);
  const def = SHUTTER_STYLES[look.style];
  if (def?.roll) {
    const cc = mulc(col, 0.95), M = 'shutter_slats';
    wbox(b, M, dir, uc, yk + d.h + 0.16, pc, d.w + 0.2, 0.3, 0.2, cc);                                                                // the cassette
    for (const sg of [-1, 1]) wbox(b, M, dir, uc + sg * (d.w / 2 - 0.03), yk + d.h / 2, at + s * (t / 2 - 0.02), 0.06, d.h, 0.1, mulc(col, 0.7));   // guide rails
  } else if (look.style === 'wood') {
    const tc = mulc(fs.trim, 1.05), pcw = at + s * (t / 2 + 0.035);
    for (const sg of [-1, 1]) wbox(b, 'plaster_a', dir, uc + sg * (d.w / 2 + 0.11), yk + d.h / 2 + 0.1, pcw, 0.16, d.h + 0.2, 0.07, tc);   // a plastered surround, wider than the casing
    wbox(b, 'plaster_a', dir, uc, yk + d.h + 0.1, pcw, d.w + 0.5, 0.18, 0.08, tc);
  } else {
    wbox(b, 'door_metal', dir, uc, yk + d.h + 0.1, at + s * (t / 2 + 0.05), d.w + 0.2, 0.2, 0.12, mulc(col, 0.9));                       // a lintel box over the storefront
  }
}
