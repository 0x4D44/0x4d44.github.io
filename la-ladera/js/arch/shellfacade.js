// Facade language (T2.3): everything on the OUTSIDE of the shell that is not wall, window or door. String courses and cornices, pilasters,
// awnings and door canopies, lettered shop fascias and blade signs, balconies with railings / planters / laundry, split AC units, drainpipes, meter
// boxes, painted ghost signs and posters, and the roof kit (water tanks, dishes, antennas, pigeon lofts, laundry lines, rebar stubs). Chapel,
// school and clinic get their identity pieces (bell gable, cross, flag). The back and the free side walls get the plainer fittings of `elevations` (units, pipes, extractors, zinc hoods,
// the cable round the corner). Every choice is a hash of the building id, so no two neighbours repeat.
// Draw-call diet: only materials the shell already uses, plus `sign_atlas` (one canvas for all lettering, see signs.js).
import { lin, mulc, mixc, qd, hash01, triFacing, bar, roomSeed } from './mb.js';
import { CASETA_H } from './roof.js';
import { buildingClutter } from '../world/clutter.js';
import { signText, signColours, hexToLin, GHOST_COUNT, posterSetOf, handPainted, HAND_BG } from './signs.js';
import { weatherFacade } from './weather.js';
import { beachSide } from './layouthelp.js';

const UP = [0, 1, 0];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const clamp = (v, a, c) => (v < a ? a : v > c ? c : v);
const SIDES = ['front', 'back', 'left', 'right'];
const AWNING = [[0xb8201c, 0xf4ead0], [0x1f5fa8, 0xf4efe0], [0x2e8b57, 0xf4efe0], [0xf2c200, 0xb8201c], [0x7a2f8c, 0xf2e8d0], [0xe8702a, 0xf4efe0], [0x0e7c86, 0xf4efe0]];
const CLOTH = [0xe8e2d0, 0xc8281e, 0x2f6fbf, 0xf2c200, 0xe07ab0, 0x3aa89a, 0xf4f4f0, 0x8a5a34, 0x7a2f8c, 0xe8702a];
const hx = (n) => lin(n);
/** Shop type -> what its owner hangs on a rail beside the shutter: [colours, item width, item height]. Types not listed hang nothing. */
const GOODS = {
  tienda: [[0xe8702a, 0xf2c200, 0xc8281e, 0x2f6fbf, 0x2e8b57], 0.11, 0.26],        // bags of snacks
  zapateria: [[0x3a2a1e, 0x6b4426, 0xb8201c, 0xe8e2d0], 0.12, 0.2],               // pairs of shoes
  modista: [[0xe07ab0, 0x3aa89a, 0xf4f4f0, 0x7a2f8c, 0xf2c200], 0.2, 0.5],         // garments
  fruver: [[0xe8702a, 0xc8281e, 0x8fbf3a, 0xf2c200], 0.14, 0.2],                   // nets of fruit
  carniceria: [[0x9a2a24, 0xc65a4a, 0xe0b8a8], 0.1, 0.34],                         // sausages and cuts
  ferreteria: [[0x45494c, 0x8a5a34, 0xb8201c, 0x9aa0a4], 0.1, 0.32],              // tools and rope
  papeleria: [[0xf2c200, 0x2f6fbf, 0xc8281e, 0x2e8b57], 0.12, 0.2],               // notebooks and balloons
};

/** Frames of the four exterior planes: outward normal, plane offset, span, and (u, y, off) -> local point. u runs along x (front/back) or z (left/right). */
function frames(S) {
  const W = S.W, D = S.D;
  return {
    front: { n: [0, 0, 1], span: W, at: (u, y, o) => [u, y, D / 2 + o] }, back: { n: [0, 0, -1], span: W, at: (u, y, o) => [u, y, -D / 2 - o] },
    left: { n: [-1, 0, 0], span: D, at: (u, y, o) => [-W / 2 - o, y, u] }, right: { n: [1, 0, 0], span: D, at: (u, y, o) => [W / 2 + o, y, u] },
  };
}

/** Box on a facade: centre `uc` along the wall, `yc` high, `off` m out from the outer plane; du along x height dy dd across. */
function fbox(G, side, uc, yc, off, du, dy, dd, mat, col, skip) {
  const p = G.FR[side].at(uc, yc, off), alongX = side === 'front' || side === 'back';
  G.b.box(mat, p[0], p[1], p[2], alongX ? du : dd, dy, alongX ? dd : du, { col, skip });
}

/** A flat plate looking along horizontal normal `n` (centre c, width w, height h); `rect` = atlas [u0,v0,u1,v1] or null. Read left-to-right from the front. */
function plate(G, mat, c, n, w, h, col, rect) {
  const r = crs(UP, n), hw = w / 2, hh = h / 2;
  const P = (sx, sy) => [c[0] + r[0] * hw * sx, c[1] + hh * sy, c[2] + r[2] * hw * sx];
  const uv = rect ? [rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3]] : undefined;
  G.b.quad(mat, P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), { uv, col });
}
const cloth = (G, c, n, w, h, col) => { plate(G, 'plaster_a', c, n, w, h, col); plate(G, 'plaster_a', [c[0] - n[0] * 0.004, c[1], c[2] - n[2] * 0.004], [-n[0], 0, -n[2]], w, h, mulc(col, 0.85)); };

function bush(G, x, y, z, r, h, col) { G.b.cyl('plaster_rough', x, y, z, r, h, 6, { r1: r * 0.45, col, caps: true }); }

// ---- the per-building kit -----------------------------------------------------------------------------------------------------------------
function makeKit(G) {
  const { bp, S } = G, kind = S.kind, lot = bp.lot, h = (n) => hash01(bp.id, 400 + n);
  const door = (f) => bp.doors.find((d) => d.ext && d.floor === 0 && d.side === 'front' && f(d));
  const shopDoor = door((d) => d.kind === 'shutter'), mainDoor = door((d) => d.entrance === 'main' && d.kind !== 'shutter');
  const finished = kind !== 'unfinished' && kind !== 'kiosk';
  const shops = !!shopDoor, flats = kind === 'apartments' || kind === 'tenement', inst = ['school', 'clinic', 'hall', 'chapel'].includes(kind);
  const terrace = S.roofStyle === 'terrace';
  const trimCol = mixc(G.fs.trim, hx(0xe8e4da), 0.45);
  const nb = lot.style?.balconies ?? 0;
  return {
    shopDoor, mainDoor, kind, finished, shops, flats, inst, terrace, trimCol,
    courses: !finished || inst ? 'none' : h(1) < 0.5 ? 'slab' : h(1) < 0.8 ? 'cornice' : 'none',
    pilasters: finished && terrace && h(2) < 0.32,
    awning: shops && h(3) < 0.62, awnTin: h(33) < 0.3, awnPair: AWNING[Math.floor(h(4) * AWNING.length) % AWNING.length],
    canopy: !shops && !!mainDoor && finished && h(5) < 0.35,
    blade: shops && h(6) < 0.55, bladeEnd: h(7) < 0.5 ? -1 : 1,
    balconies: finished ? (flats ? Math.max(nb, S.F > 2 ? 2 * (S.F - 1) : 2) : nb) : 0, railStyle: h(8) < 0.5 ? 'bars' : h(8) < 0.78 ? 'mixed' : 'solid',
    planters: h(9) < 0.6, laundry: h(10) < 0.4, ac: kind === 'chapel' ? 0 : finished && (flats || inst || shops) ? (h(11) < 0.8 ? 1 + Math.floor(h(12) * 3) : 0) : (h(11) < 0.4 ? 1 : 0),
    goods: shops && !!GOODS[lot.shop] && h(30) < 0.55,
    pipe: finished && h(13) < 0.5, pipeSide: h(14) < 0.5 ? -1 : 1, meter: finished && !!mainDoor && h(15) < 0.85, cable: finished && !inst && h(36) < 0.85, meterN: flats ? 2 + Math.floor(h(16) * 3) : h(16) < 0.25 ? 2 : 1,
    posters: finished ? posterSetOf(G.ctx, lot) : [], ghost: finished && h(17) < 0.38, ghostIdx: Math.floor(h(18) * GHOST_COUNT),
    tank: terrace && (kind === 'apartments' ? h(20) < 0.95 : h(20) < 0.6), tankBlue: h(21) < 0.4, dish: h(22) < 0.5, antenna: h(23) < 0.35, loft: h(24) < 0.14,
    line: terrace && h(25) < 0.55, rebar: finished && terrace && !inst && h(26) < 0.36,
    mirador: finished && !inst && h(27) < 0.4,                                                            // this building closes some of its balconies in glass
    cuarto: finished && terrace && !inst && kind !== 'apartments' && h(28) < 0.6 && !S.roofLayer?.caseta && !S.roofWalkable && !S.patios.length,   // a room on the unreachable roof, set back from the street (not over a patio)
  };
}

/** Everything the dressing adds is recorded on `bp.facade` (kind, side, span u0..u1 along the wall, y0..y1, out = how far it stands off the wall), for tests and for other modules. */
function recorder(G) {
  const recs = G.recs = [];
  return (kind, side, u0, u1, y0, y1, out = 0, extra) => { recs.push({ kind, side, u0: +u0.toFixed(3), u1: +u1.toFixed(3), y0: +y0.toFixed(3), y1: +y1.toFixed(3), out: +out.toFixed(3), ...extra }); };
}

/**
 * A lean-to of zinc sheet on a wall (no new material): one grey slope from the top edge `ya` between `ua` and `ub` along the wall, `tp` out from it and `td` down, a lip along its low
 * edge and two thin arms under it. The shop awning of tin and the hoods over side windows are this one piece.
 */
function tinHood(G, side, ua, ub, ya, tp, td) {
  const { b } = G, fr = G.FR[side], zinc = mixc(hx(0x9aa0a4), G.fs.trim, 0.12), steel = hx(0x2b2e31), along = side === 'front' || side === 'back';
  const A = fr.at(ua, ya, 0.01), B = fr.at(ub, ya, 0.01), C = fr.at(ub, ya - td, tp), E = fr.at(ua, ya - td, tp), up = [fr.n[0] * td, tp, fr.n[2] * td];
  qd(b, 'door_metal', A, B, C, E, up, { col: zinc }); qd(b, 'door_metal', A, B, C, E, [-up[0], -up[1], -up[2]], { col: mulc(zinc, 0.55) });
  const lip = fr.at((ua + ub) / 2, ya - td - 0.03, tp);
  b.box('rail_metal', lip[0], lip[1], lip[2], along ? ub - ua : 0.04, 0.06, along ? 0.04 : ub - ua, { col: steel });
  for (const u of [ua + 0.04, ub - 0.04]) { const a = fr.at(u, ya - td * 0.5 - 0.1, tp * 0.5); b.box('rail_metal', a[0], a[1], a[2], along ? 0.025 : tp, 0.025, along ? tp : 0.025, { col: steel }); }
}

// ---- courses, pilasters ----------------------------------------------------------------------------------------------------------------------
function courses(G, kit) {
  const { S } = G, yF = S.F * S.fh;
  if (kit.courses === 'none') return;
  // brick houses carry a bare concrete beam at each slab; rendered ones a painted moulding in the trim colour (concrete_bare is mid grey and would read as a dark stripe)
  const cm = G.fs.brick ? 'concrete_bare' : 'plaster_a', cc = G.fs.brick ? mulc(kit.trimCol, 1.25) : kit.trimCol;
  const wrap = (side, y, hgt, proj) => {
    if (S.party[side]) return;
    const half = G.FR[side].span / 2; let a = -half, c = half;
    if (side === 'front' || side === 'back') { if (!S.party.left) a -= proj; if (!S.party.right) c += proj; }
    fbox(G, side, (a + c) / 2, y, proj / 2, c - a, hgt, proj, cm, cc);
  };
  for (const side of SIDES) {
    if (kit.courses === 'slab') for (let k = 1; k < S.F; k++) wrap(side, k * S.fh - S.slab / 2, S.slab + 0.03, 0.05);
    if (kit.terrace) wrap(side, yF - 0.02, 0.2, 0.09);
  }
}

function pilasters(G, kit) {
  const { S } = G;
  if (!kit.pilasters) return;
  const top = S.F * S.fh + (S.roofLayer?.parapetH ?? 0.7);
  for (const side of ['front', 'back']) for (const sg of [-1, 1]) {
    if (S.party[side] || (sg < 0 ? S.party.left : S.party.right)) continue;
    fbox(G, side, sg * (S.W / 2 - 0.15), top / 2, 0.02, 0.3, top, 0.04, 'plaster_a', kit.trimCol);
  }
}

// ---- awnings and canopies ------------------------------------------------------------------------------------------------------------------
function awning(G, kit) {
  const { S, b } = G, d = kit.shopDoor, D2 = S.D / 2;
  if (d && kit.awning && kit.limit >= d.h + 0.4) {
    const hh = (n) => hash01(G.bp.id, 430 + n), ya = d.h + 0.42, drop = 0.34 + 0.06 * hh(1), proj = 0.62 + 0.28 * hh(2);
    const w = Math.min(d.w + 0.9, S.W - 0.3), ua = clamp(d.x - w / 2, -S.W / 2 + 0.12, S.W / 2 - 0.12 - w), ub = ua + w;
    if (kit.awnTin) {                                                           // a lean-to of zinc sheet instead of striped cloth: one grey slope, a lip, two arms (no new material)
      const tp = proj + 0.3, td = drop + 0.14;
      tinHood(G, 'front', ua, ub, ya, tp, td);
      G.rec('awning', 'front', ua, ub, ya - td - 0.06, ya, tp, { style: 'tin' });
      return;
    }
    const n = Math.max(4, Math.round(w / 0.2) & ~1), [c0, c1] = kit.awnPair.map(hx), want = [0, proj, drop], under = [0, -proj, -drop];
    for (let i = 0; i < n; i++) {
      const u0 = ua + (w * i) / n, u1 = ua + (w * (i + 1)) / n, col = i % 2 ? c1 : c0;
      const A = [u0, ya, D2 + 0.01], B = [u1, ya, D2 + 0.01], C = [u1, ya - drop, D2 + proj], E = [u0, ya - drop, D2 + proj];
      qd(b, 'frame_paint', A, B, C, E, want, { col });
      qd(b, 'frame_paint', A, B, C, E, under, { col: mulc(col, 0.55) });
      qd(b, 'frame_paint', [u0, ya - drop - 0.13, D2 + proj], [u1, ya - drop - 0.13, D2 + proj], [u1, ya - drop, D2 + proj], [u0, ya - drop, D2 + proj], [0, 0, 1], { col: mulc(col, 0.92) });
    }
    for (const u of [ua + 0.03, ub - 0.03]) b.box('rail_metal', u, ya - 0.2, D2 + proj * 0.5, 0.025, 0.025, Math.hypot(proj, drop) + 0.04, { col: hx(0x2b2e31), ry: 0 });
    G.rec('awning', 'front', ua, ub, ya - drop - 0.13, ya, proj);
  } else if (kit.canopy && kit.mainDoor) {                                         // a flat concrete alero over the house door
    const m = kit.mainDoor, w = m.w + 0.7, y = m.h + 0.22, u = clamp(m.x, -S.W / 2 + 0.1 + w / 2, S.W / 2 - 0.1 - w / 2);
    fbox(G, 'front', u, y, 0.3, w, 0.12, 0.6, 'concrete_bare', kit.trimCol);
    for (const sg of [-1, 1]) fbox(G, 'front', u + sg * (w / 2 - 0.08), y - 0.17, 0.12, 0.05, 0.22, 0.2, 'concrete_bare', kit.trimCol);
    G.rec('canopy', 'front', u - w / 2, u + w / 2, y - 0.28, y + 0.06, 0.6);
  }
}

// ---- lettered signs ----------------------------------------------------------------------------------------------------------------------------
/** Where the lettered fascia goes (over the shop shutter, else the main door); balconies keep clear of its span. */
function signGeo(G, kit) {
  const { S, lot } = G, t = signText(lot), d = kit.shopDoor ?? kit.mainDoor;
  if (!t || !d || kit.kind === 'chapel') return null;                              // (a chapel has its name painted on the wall instead of a shop board: `chapel`)
  const shop = d.kind === 'shutter', y0 = d.h + (shop ? 0.42 : 0.4);
  // 4:1 boards; under a low roof (a one-storey shop, the gable end of a kiosk) the board shrinks to fit between the shutter cassette and the top of the wall
  let bh = clamp(shop ? d.w + 1.1 : 2.8, 1.8, Math.min(3.9, S.W - 0.4)) / 4, bw = bh * 4, u = d.x;
  for (; bh >= 0.42; bh -= 0.03) {                                              // the biggest board that fits: a narrower one reaches a higher stretch of a gable end
    bw = bh * 4; u = clamp(d.x, -S.W / 2 + 0.2 + bw / 2, S.W / 2 - 0.2 - bw / 2);
    if (kit.limitAt(u - bw / 2 - 0.05, u + bw / 2 + 0.05) - 0.05 - y0 >= bh - 1e-3) break;
  }
  if (bh < 0.42) return null;
  const y = y0 + bh / 2;
  return { t, d, shop, bw, bh, u, y, top: y + bh / 2 + 0.05, u0: u - bw / 2 - 0.05, u1: u + bw / 2 + 0.05 };
}

function signs(G, kit) {
  const { S, lot } = G, A = G.ctx.signAtlas, sg = kit.sign;
  if (!sg) return;
  const { t, d, bw, bh, u, y } = sg, c = signColours(lot), D2 = S.D / 2, hand = handPainted(lot), flat = hexToLin(hand ? HAND_BG : c.bg);
  // a hand-painted name is on a whitewashed render panel, not in a metal frame: a thin plaster slab (proud of the string course) with the lettering on it
  if (hand) fbox(G, 'front', u, y, 0.025, bw + 0.08, bh + 0.08, 0.05, 'plaster_a', hexToLin(HAND_BG)); else fbox(G, 'front', u, y, 0.03, bw + 0.1, bh + 0.1, 0.06, 'frame_paint', mulc(G.fs.metal, 1.3));
  const rect = A?.uv?.[`board:${lot.id}`] ?? null;
  plate(G, 'sign_atlas', [u, y, D2 + (hand ? 0.056 : 0.065)], [0, 0, 1], bw, bh, rect ? [1, 1, 1] : flat, rect);
  G.rec('sign', 'front', sg.u0, sg.u1, y - bh / 2 - 0.05, sg.top, hand ? 0.06 : 0.07, hand ? { hand: true } : undefined);
  const ubl = kit.bladeEnd * (S.W / 2 - 0.22), ybl = Math.min(d.h + 0.95, kit.limitAt(ubl - 0.05, ubl + 0.05) - 0.42);   // a blade sign must clear the shutter cassette and stay under the wall top
  if (kit.blade && t.blade && !S.party[kit.bladeEnd < 0 ? 'left' : 'right'] && ybl - 0.3 >= d.h + 0.33) {                  // blade sign sticking out of the facade at one end
    const ub = ubl, yb = ybl, bz = 0.62, br = A?.uv?.[`blade:${lot.id}`] ?? null, col = br ? [1, 1, 1] : flat;
    G.b.box('rail_metal', ub, yb + 0.33, D2 + bz / 2, 0.03, 0.03, bz + 0.04, { col: hx(0x2b2e31) });
    for (const s2 of [-1, 1]) plate(G, 'sign_atlas', [ub + s2 * 0.02, yb, D2 + bz * 0.62], [s2, 0, 0], bz * 0.8, 0.5, col, br);
    G.b.box('rail_metal', ub, yb - 0.27, D2 + bz * 0.62, 0.02, 0.06, bz * 0.8, { col: hx(0x2b2e31) });
    G.rec('blade', 'front', ub - 0.04, ub + 0.04, yb - 0.3, yb + 0.36, bz);
  }
}

// ---- balconies ---------------------------------------------------------------------------------------------------------------------------------
/** Enclosed balcony (mirador): a glazed box on a cantilevered slab with a solid breast, solid cheeks and a flat roof slab. Returns its height above the floor line. */
function mirador(G, w, u, len, yk, dep) {
  const { S, b } = G, hv = (n) => hash01(w.id, 40 + n);
  const hgt = Math.min(2.2, S.fh - S.slab - 0.4), sill = 0.8 + 0.12 * hv(1), pz = dep - 0.03, concrete = [0.9, 0.9, 0.88];
  const frameCol = hv(2) < 0.5 ? mulc(G.fs.trim, 1) : hx(0xf2efe6), lit = hv(3) < 0.55;
  fbox(G, 'front', u, yk - 0.075, dep / 2, len, 0.15, dep, 'concrete_bare', concrete);                                      // floor slab
  fbox(G, 'front', u, yk + hgt + 0.06, dep / 2 + 0.02, len + 0.1, 0.12, dep + 0.08, 'concrete_bare', concrete);              // roof slab
  fbox(G, 'front', u, yk + sill / 2, pz, len - 0.04, sill, 0.05, 'plaster_a', G.fs.wall);                                    // solid breast under the glass
  for (const sg of [-1, 1]) fbox(G, 'front', u + sg * (len / 2 - 0.03), yk + hgt / 2, dep / 2, 0.05, hgt, dep - 0.06, 'plaster_a', G.fs.wall);   // solid cheeks
  const gu0 = u - len / 2 + 0.06, gu1 = u + len / 2 - 0.06, gy0 = yk + sill, gy1 = yk + hgt, P = (uu, y) => G.FR.front.at(uu, y, pz + 0.005);
  // a lit mirador shows a room behind its glass at night, with its own evening (arch/shellwin.js, engine/windowroom.js; R1-104): the quad faces the street (+z) and u runs left to right as seen from it
  const rw = gu1 - gu0, rh = gy1 - gy0, ruv = (uu, y) => [(uu - gu0) / rw, (y - gy0) / rh];
  b.quad(lit ? 'window_lit' : 'glass', P(gu0, gy0), P(gu1, gy0), P(gu1, gy1), P(gu0, gy1),
    lit ? { col: [roomSeed(hv(11), hv(12), hv(13)), rw, rh], uv: [...ruv(gu0, gy0), ...ruv(gu1, gy0), ...ruv(gu1, gy1), ...ruv(gu0, gy1)] } : { col: [1, 1, 1] });
  const n = Math.max(2, Math.round(len / 0.7));
  for (let i = 0; i <= n; i++) fbox(G, 'front', gu0 + ((gu1 - gu0) * i) / n, (gy0 + gy1) / 2, pz + 0.015, 0.045, gy1 - gy0, 0.05, 'frame_paint', frameCol);      // mullions
  for (const y of [gy0, gy1]) fbox(G, 'front', u, y, pz + 0.015, len - 0.1, 0.05, 0.05, 'frame_paint', frameCol);
  return hgt;
}

function balconies(G, kit) {
  const { S, b, bp } = G;
  if (!kit.balconies) return;
  // a slab cantilevered from the first floor would hide the lower half of a fascia that reaches above the slab soffit: no balcony over the lettering
  const sg = kit.sign, clearOfSign = (w) => !(sg && w.floor === 1 && sg.top > S.fh - S.slab - 0.02 && w.x + Math.min(w.w + 0.55, S.W - 0.3) / 2 > sg.u0 - 0.1 && w.x - Math.min(w.w + 0.55, S.W - 0.3) / 2 < sg.u1 + 0.1);
  const cand = bp.windows.filter((w) => w.side === 'front' && w.floor >= 1 && w.w >= 0.95 && ['casement', 'sliding', 'fixed'].includes(w.kind) && !['bathroom', 'backroom', 'entry', 'landing', 'stairwell'].includes(G.byId.get(w.room)?.type) && clearOfSign(w));
  const order = cand.map((w) => ({ w, k: hash01(w.id, 5) })).sort((p, q) => p.k - q.k).map((q) => q.w);
  const dep = kit.flats ? 0.95 : 0.6 + 0.2 * hash01(bp.id, 440), railCol = G.fs.metal, rail = mulc(railCol, 1.2), concrete = [0.9, 0.9, 0.88];
  const taken = new Set(), made = [];
  for (const w of order) {
    if (made.length >= kit.balconies) break;
    if (taken.has(`${w.floor}:${Math.round(w.x)}`)) continue;
    taken.add(`${w.floor}:${Math.round(w.x)}`);
    const yk = w.floor * S.fh, hv = (n) => hash01(w.id, 20 + n), len = Math.min(w.w + 0.55, S.W - 0.3), u = clamp(w.x, -S.W / 2 + 0.1 + len / 2, S.W / 2 - 0.1 - len / 2);
    if (kit.mirador && hv(4) < 0.65) {                                                                                          // closed in glass: a projecting box instead of an open rail
      const md = Math.max(dep, 0.7), mh = mirador(G, w, u, len, yk, md);
      made.push({ w, u, len, yk, dep: md, top: yk + mh });
      G.rec('mirador', 'front', u - len / 2 - 0.05, u + len / 2 + 0.05, yk - 0.15, yk + mh + 0.12, md + 0.04, { window: w.id });
      continue;
    }
    fbox(G, 'front', u, yk - 0.075, dep / 2, len, 0.15, dep, 'concrete_bare', concrete);                                    // the cantilevered slab
    const top = yk + 1.0, solid = kit.railStyle === 'solid' || (kit.railStyle === 'mixed' && hv(1) < 0.4);
    if (solid) {                                                                                                                // painted half-wall with a coping
      fbox(G, 'front', u, yk + 0.48, dep - 0.05, len - 0.02, 0.96, 0.09, 'plaster_a', G.fs.wall);
      fbox(G, 'front', u, yk + 0.99, dep - 0.05, len + 0.06, 0.05, 0.15, 'concrete_bare', concrete);
      for (const sg of [-1, 1]) { fbox(G, 'front', u + sg * (len / 2 - 0.045), yk + 0.48, dep / 2, 0.09, 0.96, dep - 0.1, 'plaster_a', G.fs.wall); fbox(G, 'front', u + sg * (len / 2 - 0.045), yk + 0.99, dep / 2, 0.15, 0.05, dep, 'concrete_bare', concrete); }
    } else {                                                                                                                    // iron railing: posts, rails, pickets
      const n = Math.max(4, Math.round(len / 0.115));
      for (let i = 0; i <= n; i++) fbox(G, 'front', u - len / 2 + 0.03 + ((len - 0.06) * i) / n, yk + 0.5, dep - 0.04, 0.014, 0.98, 0.014, 'rail_metal', rail, ['py', 'ny']);
      fbox(G, 'front', u, top, dep - 0.04, len, 0.04, 0.05, 'rail_metal', rail); fbox(G, 'front', u, yk + 0.12, dep - 0.04, len, 0.025, 0.03, 'rail_metal', rail);
      for (const sg of [-1, 1]) {
        fbox(G, 'front', u + sg * (len / 2 - 0.03), yk + 0.5, dep / 2, 0.035, 1.0, 0.035, 'rail_metal', rail);
        fbox(G, 'front', u + sg * (len / 2 - 0.03), top, dep / 2, 0.04, 0.04, dep, 'rail_metal', rail);
        const m = Math.max(2, Math.round(dep / 0.13));
        for (let i = 1; i < m; i++) fbox(G, 'front', u + sg * (len / 2 - 0.03), yk + 0.5, (dep * i) / m, 0.012, 0.95, 0.012, 'rail_metal', rail, ['py', 'ny']);
      }
    }
    made.push({ w, u, len, yk, dep, top });
    const planter = kit.planters && hv(2) < 0.7, laundry = kit.laundry && hv(13) < 0.55;
    G.rec('balcony', 'front', u - len / 2, u + len / 2, yk - 0.15, top + 0.05, dep + 0.05, { window: w.id, planter, laundry });
    if (planter) {                                                                                           // flower box hung outside the rail, with its plants
      const pw = Math.min(len - 0.2, 0.7 + 0.5 * hv(3)), pc = hx([0xa8553a, 0x6f8f4f, 0xd9d2c0, 0x8a5a34][Math.floor(hv(4) * 4) % 4]);
      fbox(G, 'front', u + (hv(5) - 0.5) * (len - pw - 0.1), top - 0.09, dep + 0.1, pw, 0.17, 0.2, 'plaster_rough', pc);
      const p0 = G.FR.front.at(u + (hv(5) - 0.5) * (len - pw - 0.1), top, dep + 0.1);
      for (let i = 0; i < 3; i++) bush(G, p0[0] + (i - 1) * pw * 0.3, top - 0.0, p0[2], 0.13 + 0.05 * hv(6 + i), 0.26 + 0.14 * hv(9 + i), mulc(hx([0x3f8a3f, 0x4f9a48, 0x2f7a4a][i]), 0.9 + 0.2 * hv(12 + i)));
    }
    if (laundry) {                                                                                          // clothes over the rail
      const n = 2 + Math.floor(hv(14) * 3);
      for (let i = 0; i < n; i++) cloth(G, G.FR.front.at(u - len / 2 + 0.25 + ((len - 0.5) * (i + 0.5)) / n, top - 0.2, dep + 0.025), [0, 0, 1], 0.28 + 0.2 * hv(15 + i), 0.42 + 0.3 * hv(18 + i), hx(CLOTH[Math.floor(hv(21 + i) * CLOTH.length) % CLOTH.length]));
    }
  }
  G.balc = made;
}

// ---- things stuck to the wall ----------------------------------------------------------------------------------------------------------------
/** The paint of an air-conditioner: a white that has seen some years (twice as likely), cream, grey, yellowed, brown. */
const AC_COL = [[0.86, 0.87, 0.86], [0.86, 0.87, 0.86], [0.84, 0.8, 0.7], [0.66, 0.68, 0.7], [0.78, 0.74, 0.58], [0.58, 0.5, 0.42]];
/** The look of one air-conditioner, a hash of its window's id: a split condenser, a compact one or a boxed window unit; its colour; and whether a line-set runs up the wall from it. */
export function acLook(id) {
  const t = hash01(String(id), 33);
  return { type: t < 0.5 ? 'split' : t < 0.78 ? 'mini' : 'window', col: AC_COL[Math.floor(hash01(String(id), 34) * AC_COL.length) % AC_COL.length], lineSet: hash01(String(id), 35) < 0.6 };
}
/** How far a unit's body reaches below its mounting height (`acUnit`'s `y0`), by kind. */
const AC_FOOT = { split: 0.37, mini: 0.32, window: 0.4 };
/** The bare wall a unit keeps between its foot and a shop board under it, and how far up the wall it may climb to find that room. */
const AC_CLEAR = 0.45, AC_LIFT = 0.8;
/** A round fan opening on a wall: a dark eight-sided disc of radius r at depth `o` from the wall, and a lighter hub 4 mm in front of it. */
function fan(G, side, u, y, o, r, dark, hub) {
  const fr = G.FR[side], e = crs(UP, fr.n);                                         // e: along the wall, the way `plate` reads it
  for (const [rr, off, col] of [[r, o, dark], [r * 0.26, o + 0.004, hub]]) {
    const c = fr.at(u, y, off), p = (i) => [c[0] + e[0] * Math.cos((i / 8) * Math.PI * 2) * rr, c[1] + Math.sin((i / 8) * Math.PI * 2) * rr, c[2] + e[2] * Math.cos((i / 8) * Math.PI * 2) * rr];
    for (let i = 0; i < 8; i++) triFacing(G.b, 'rail_metal', c, p(i), p(i + 1), fr.n, { col });
  }
}
/** The face of a box that lies against each wall (nothing shows of it, so a fitting leaves it out). */
const AGAINST = { front: 'nz', back: 'pz', left: 'px', right: 'nx' };
/** Draw one unit on `side`, centred `u` along it at height `y`; returns its half width. `toward` (+1 / -1) is the way to the window it serves (the line-set climbs on that side). */
function acUnit(G, side, u, y, look, toward, busy) {
  const { type, col } = look, dark = hx(0x303336), brk = hx(0x2b2e31), hub = hx(0x8a8f94), fr = G.FR[side];
  let hw = 0.4, y0 = y - 0.37;
  if (type === 'split') {                                                           // the condenser: a box with a round fan behind a dark guard, a louvred vent strip, two brackets under it
    fbox(G, side, u, y, 0.19, 0.8, 0.56, 0.3, 'door_metal', col);
    fan(G, side, u - 0.13, y, 0.345, 0.19, dark, hub);
    fbox(G, side, u + 0.27, y, 0.345, 0.18, 0.4, 0.01, 'rail_metal', hx(0x45494c));
    for (let i = 0; i < 4; i++) plate(G, 'door_metal', fr.at(u + 0.27, y - 0.15 + i * 0.1, 0.353), fr.n, 0.16, 0.03, mulc(col, 0.92));          // slats of the casing's colour over the dark vent
    for (const sg of [-1, 1]) fbox(G, side, u + sg * 0.3, y - 0.34, 0.14, 0.04, 0.04, 0.28, 'rail_metal', brk);
  } else if (type === 'mini') {                                                     // a compact condenser: a small box with a round fan (an eight-sided disc and its hub), two brackets
    hw = 0.34; y0 = y - 0.32;
    fbox(G, side, u, y, 0.14, 0.58, 0.46, 0.22, 'door_metal', col);
    fan(G, side, u - 0.04, y, 0.255, 0.17, dark, hub);
    for (const sg of [-1, 1]) fbox(G, side, u + sg * 0.22, y - 0.28, 0.12, 0.04, 0.04, 0.24, 'rail_metal', brk);
  } else {                                                                          // a window unit built into the wall: a box with louvres and a panel, a rendered band round the hole, a drip tube
    hw = 0.36; y0 = y - 0.4;
    fbox(G, side, u, y, 0.17, 0.66, 0.42, 0.34, 'door_metal', col);
    const P = (dx, dy, w, h, c, o) => plate(G, 'rail_metal', fr.at(u + dx, y + dy, o), fr.n, w, h, c);
    P(-0.05, 0, 0.5, 0.3, dark, 0.345);
    for (let i = 0; i < 4; i++) plate(G, 'door_metal', fr.at(u - 0.05, y - 0.105 + i * 0.07, 0.348), fr.n, 0.5, 0.04, mulc(col, 0.95));          // 4 cm slats of the casing's own colour over the dark opening: they still read as slats from the street
    P(0.26, 0.1, 0.1, 0.07, hx(0x4a4e52), 0.345);
    for (const [dx, dy, w, h] of [[0, 0.255, 0.74, 0.05], [0, -0.255, 0.74, 0.05], [-0.345, 0, 0.05, 0.46], [0.345, 0, 0.05, 0.46]]) plate(G, 'plaster_a', fr.at(u + dx, y + dy, 0.012), fr.n, w, h, [0.72, 0.7, 0.66]);
    const t = fr.at(u + 0.26, y - 0.4, 0.05); G.b.cyl('tank_plastic', t[0], t[1], t[2], 0.012, 0.19, 5, { col: hx(0xdcdad0), caps: false });
  }
  let y1 = y + 0.28;
  if (type === 'split' && look.lineSet) {                                           // the refrigerant line-set: a white duct up the wall toward the window, ending in a hole
    const up = u + toward * 0.28;
    if (!busy(side, up - 0.08, up + 0.08, y + 0.28, y + 0.72)) {
      fbox(G, side, up, y + 0.5, 0.03, 0.055, 0.44, 0.03, 'door_metal', mulc(col, 1.04), [AGAINST[side]]);
      plate(G, 'rail_metal', fr.at(up, y + 0.69, 0.047), fr.n, 0.07, 0.07, hx(0x1a1b1c));
      y1 = y + 0.72;
    }
  }
  return { hw, y0, y1 };
}

/** The coordinate of an opening along the wall it is in. */
const alongOf = (side, o) => (side === 'front' || side === 'back' ? o.x : o.z);
/** A black service bundle with a thinner TV cable under it, held by white clips every 0.7 m, along `side` from `ua` to `ub` at height `yE`; recorded as `kind` (`cable` on the front, `drop` round the corner). */
function cableRun(G, side, ua, ub, yE, kind) {
  const len = ub - ua, x0 = (ua + ub) / 2, nClip = Math.max(2, Math.floor(len / 0.7)), along = side === 'front' || side === 'back', skip = [AGAINST[side], ...(along ? ['nx', 'px'] : ['nz', 'pz'])];
  fbox(G, side, x0, yE, 0.014, len, 0.03, 0.026, 'rail_metal', hx(0x1b1c1e), skip);
  fbox(G, side, x0, yE - 0.055, 0.01, len, 0.016, 0.018, 'rail_metal', hx(0x6a6d70), skip);
  for (let i = 0; i < nClip; i++) fbox(G, side, ua + (len * (i + 0.5)) / nClip, yE - 0.025, 0.017, 0.034, 0.1, 0.032, 'door_metal', [0.88, 0.88, 0.85], [AGAINST[side]]);
  G.rec(kind, side, ua, ub, yE - 0.1, yE + 0.02, 0.04, { clips: nClip });
}
/** A drainpipe up a wall from the ground to `top`, at `u` along it, clipped to the wall by a bracket every 1.3 m; recorded as a `pipe`. */
function drainPipe(G, side, u, top) {
  const p = G.FR[side].at(u, 0.12, 0.06);
  G.b.cyl('tank_plastic', p[0], p[1], p[2], 0.032, top - 0.12, 6, { col: [0.78, 0.8, 0.78], caps: false });
  for (let y = 0.5; y < top; y += 1.3) fbox(G, side, u, y, 0.03, 0.09, 0.03, 0.04, 'rail_metal', hx(0x2b2e31));
  G.rec('pipe', side, u - 0.05, u + 0.05, 0.12, top, 0.1);
}
/** The fittings that keep each other apart without being asked (`busyAt`'s `every` widens that to whatever is on the wall). */
const FITTINGS = ['ac', 'meter', 'pipe', 'poster', 'goods', 'vent', 'hood', 'drop'];
/**
 * Is any of the span u0..u1 x y0..y1 of a wall taken: by a window or an outside door of it (0.2 m margin round each; `except`: the one window a piece hangs from), or by a fitting
 * this module already put up (`every`: by whatever is recorded on the wall)?
 */
function busyAt(G, side, u0, u1, y0, y1, every, except) {
  const { S, bp } = G;
  return bp.windows.some((w) => w !== except && w.side === side && (w.z !== undefined) && alongOf(side, w) + w.w / 2 + 0.2 > u0 && alongOf(side, w) - w.w / 2 - 0.2 < u1 && w.floor * S.fh + w.y + w.h + 0.2 > y0 && w.floor * S.fh + w.y - 0.2 < y1)
    || bp.doors.some((d) => d.ext && d.side === side && alongOf(side, d) + d.w / 2 + 0.2 > u0 && alongOf(side, d) - d.w / 2 - 0.2 < u1 && d.floor * S.fh + d.h + 0.2 > y0 && d.floor * S.fh - 0.2 < y1)
    || G.recs.some((r) => r.side === side && (every || FITTINGS.includes(r.kind)) && r.u1 + 0.05 > u0 && r.u0 - 0.05 < u1 && r.y1 > y0 && r.y0 < y1);
}

function wallFurniture(G, kit) {
  const { S, b, bp, ctx } = G, D2 = S.D / 2, A = ctx.signAtlas, hh = (n) => hash01(bp.id, 450 + n);
  const busy = (side, u0, u1, y0, y1, every) => busyAt(G, side, u0, u1, y0, y1, every);
  // split air-conditioner condensers under upper (or institution ground-floor) windows
  let nac = 0;
  const wins = bp.windows.filter((w) => w.side === 'front' && (w.floor >= 1 || kit.inst) && w.w >= 0.9 && !(G.balc ?? []).some((q) => q.w === w)).sort((p, q) => hash01(p.id, 31) - hash01(q.id, 31));
  /** The top of the shop board (or blade) that hangs under a unit centred `uu` whose foot is at `yb`, or -Infinity. A unit keeps AC_CLEAR of bare wall above it: a box never sits on a board, and the drip has room to run. */
  const boardUnder = (uu, yb) => G.recs.reduce((m, r) => (r.side === 'front' && (r.kind === 'sign' || r.kind === 'blade') && r.u1 + 0.05 > uu - 0.45 && r.u0 - 0.05 < uu + 0.45 && r.y0 < yb ? Math.max(m, r.y1) : m), -Infinity);
  for (const w of wins) {
    if (nac >= kit.ac) break;
    const yk = w.floor * S.fh, sgn = hash01(w.id, 32) < 0.5 ? -1 : 1, look = acLook(w.id), foot = AC_FOOT[look.type];
    // beside the window (clear of its 0.2 m margin and of every other opening), on whichever side is free, at sill height or as far up the wall as the board under it makes it
    let at = null;
    for (let lift = 0; lift < AC_LIFT + 1e-9 && !at; lift += 0.1) {
      const y = yk + 0.95 + lift;
      const u = [sgn, -sgn].map((s) => clamp(w.x + s * (w.w / 2 + 0.67), -S.W / 2 + 0.55, S.W / 2 - 0.55)).find((uu) => !busy('front', uu - 0.45, uu + 0.45, y - 0.4, y + 0.4) && boardUnder(uu, y - foot) + AC_CLEAR <= y - foot + 1e-9);
      if (u !== undefined) at = { u, y };
    }
    if (!at) continue;
    const { u, y } = at, { hw, y0, y1 } = acUnit(G, 'front', u, y, look, w.x > u ? 1 : -1, busy);
    G.rec('ac', 'front', u - hw, u + hw, y0, y1, 0.35, { look: look.type, col: look.col.map((c) => +c.toFixed(2)) });
    nac++;
  }
  // drainpipe at one end of the front (and its brackets)
  if (kit.pipe) {
    const top = S.F * S.fh - 0.05, u = kit.pipeSide * (S.W / 2 - 0.1);
    if (!S.party[kit.pipeSide < 0 ? 'left' : 'right'] && !busy('front', u - 0.1, u + 0.1, 0.1, top)) drainPipe(G, 'front', u, top);
  }
  // the shop's stock hung out beside the shutter: a rail on the wall and bags / shoes / garments / nets on it, on the side with more wall
  if (kit.goods && kit.shopDoor) {
    const d = kit.shopDoor, [cols, iw, ih] = GOODS[G.lot.shop], yR = 1.95, n0 = 4 + Math.floor(hh(40) * 3);
    const side = [-1, 1].map((sg) => ({ sg, room: sg < 0 ? d.x - d.w / 2 + S.W / 2 : S.W / 2 - d.x - d.w / 2 })).sort((p, q) => q.room - p.room || p.sg - q.sg);
    for (const { sg, room } of side) {
      const railW = Math.min(0.7, room - 0.22 - 0.12);                           // from the shutter surround (0.22 m) to the corner (0.12 m)
      if (railW < 0.4) continue;
      const u = d.x + sg * (d.w / 2 + 0.22 + railW / 2), n = Math.max(3, Math.round((n0 * railW) / 0.7));
      if (busy('front', u - railW / 2, u + railW / 2, yR - ih - 0.1, yR + 0.08)) continue;
      b.box('rail_metal', ...G.FR.front.at(u, yR, 0.07), railW, 0.02, 0.03, { col: hx(0x2b2e31) });
      for (const x of [-railW / 2 + 0.03, railW / 2 - 0.03]) fbox(G, 'front', u + x, yR - 0.02, 0.035, 0.03, 0.05, 0.05, 'rail_metal', hx(0x2b2e31));
      for (let i = 0; i < n; i++) {
        const c = hx(cols[Math.floor(hh(41 + i) * cols.length) % cols.length]), w = iw * (0.85 + 0.3 * hh(50 + i)), hgt = ih * (0.8 + 0.4 * hh(60 + i)), x = -railW / 2 + 0.07 + ((railW - 0.14) * (i + 0.5)) / n;
        fbox(G, 'front', u + x, yR - 0.05 - hgt / 2, 0.1, Math.min(w, (railW - 0.14) / n), hgt, 0.05, 'plaster_a', c);
      }
      G.rec('goods', 'front', u - railW / 2, u + railW / 2, yR - ih * 1.2 - 0.05, yR + 0.04, 0.14, { shop: G.lot.shop });
      break;
    }
  }
  // electricity meter box and its conduit beside the door: one box on a house (a pair now and then), a bank of 2-4 on a block of flats, one per household
  if (kit.meter && kit.mainDoor) {
    const m = kit.mainDoor, gap = 0.34, uAt = (sg) => m.x + sg * (m.w / 2 + 0.42);
    const hold = (sg) => { let k = kit.meterN; while (k > 1 && Math.abs(uAt(sg) + sg * (k - 1) * gap) >= S.W / 2 - 0.3) k--; return k; };      // as many as the wall beside the door holds
    const pref = hash01(bp.id, 460) < 0.5 ? -1 : 1, sg = hold(-pref) > hold(pref) ? -pref : pref, u = uAt(sg), n = hold(sg);                // the hashed side, unless the other holds the whole bank
    const uEnd = u + sg * (n - 1) * gap, lo = Math.min(u, uEnd) - 0.2, hi = Math.max(u, uEnd) + 0.2;
    const cTop = Math.min(2.75, kit.limitAt(lo + 0.05, hi - 0.05)), cLen = cTop - 1.7;  // the conduit runs up to the eaves and ends under the wall top
    if (Math.abs(u) < S.W / 2 - 0.3 && !busy('front', lo, hi, 1.0, 2.0)) {
      for (let i = 0; i < n; i++) {
        const ui = u + sg * i * gap;
        fbox(G, 'front', ui, 1.5, 0.07, 0.3, 0.4, 0.14, 'door_metal', [0.78, 0.8, 0.8]); fbox(G, 'front', ui, 1.5, 0.15, 0.2, 0.28, 0.02, 'rail_metal', hx(0x3a3d40));
      }
      if (n > 1) fbox(G, 'front', (u + uEnd) / 2, 1.74, 0.03, Math.abs(uEnd - u) + 0.1, 0.03, 0.03, 'rail_metal', hx(0x25272a));      // the bus conduit over the bank
      fbox(G, 'front', u, 1.7 + cLen / 2, 0.03, 0.03, cLen, 0.03, 'rail_metal', hx(0x25272a));
      G.rec('meter', 'front', lo + 0.05, hi - 0.05, 1.3, cTop, 0.15, { boxes: n });
      kit.meterAt = { u, sg, cTop };
    }
  }
  // bills beside the door (which ones: signs.js `assignPosters`, so that no street wears one set), and a painted ghost sign on a blank upper wall
  if (kit.posters.length && (kit.shopDoor || kit.mainDoor)) {                     // pasted toward the middle of the facade first, else the other side, else on a bare side wall near the street
    const d = kit.shopDoor ?? kit.mainDoor, toward = d.x > 0 ? -1 : 1, set = kit.posters;
    let nposter = 0;
    const paste = (side, u) => {
      const pi = set[nposter], r = A?.uv?.[`poster:${pi}`] ?? null, py = 1.4 + 0.3 * hash01(bp.id, 470 + nposter), pw = 0.3 + 0.08 * hash01(bp.id, 474 + nposter), ph = pw * 1.4;
      plate(G, 'sign_atlas', G.FR[side].at(u, py, 0.012), G.FR[side].n, pw, ph, r ? [1, 1, 1] : hx([0xe8702a, 0xf2c200, 0x2f6fbf][pi % 3]), r);
      G.rec('poster', side, u - pw / 2, u + pw / 2, py - ph / 2, py + ph / 2, 0.012, { index: pi });
      nposter++;
    };
    for (const side of [toward, -toward]) for (let i = 0; i < 3 && nposter < set.length; i++) {
      const u = d.x + side * (d.w / 2 + 0.45 + i * 0.5);
      if (Math.abs(u) <= S.W / 2 - 0.3 && !busy('front', u - 0.2, u + 0.2, 1.1, 2.0)) paste('front', u);
    }
    for (const side of ['left', 'right']) {                                       // a narrow shopfront is all door and shutter: the rest go on a side wall that is not a party wall (u is the depth along it, + toward the street)
      if (S.party[side]) continue;
      for (let i = 0; i < 3 && nposter < set.length; i++) {
        const u = G.FR[side].span / 2 - 0.8 - i * 0.55;
        if (!busy(side, u - 0.2, u + 0.2, 1.1, 2.0)) paste(side, u);
      }
    }
  }
  if (kit.ghost) {                                                                // a faded painted advert on a blank upper stretch of wall (side walls first: they are the blank ones)
    let placed = false;
    for (const side of ['left', 'right', 'front']) {
      if (placed || (S.party[side] && side !== 'front')) continue;
      const span = G.FR[side].span, pw = 2.4, ph = 1.5, yc = S.F * S.fh - 0.2 - ph / 2 - (S.F > 1 ? 0.15 : 0);
      if (yc - ph / 2 < (S.F > 1 ? S.fh * 1.0 : 1.9) || span < pw + 0.8) continue;
      for (let i = 0; i < 6 && !placed; i++) {
        const u = (hash01(bp.id, 480 + i) - 0.5) * (span - pw - 0.6);
        if (busy(side, u - pw / 2, u + pw / 2, yc - ph / 2, yc + ph / 2)) continue;
        const r = A?.uv?.[`ghost:${kit.ghostIdx}`] ?? null;
        plate(G, 'sign_atlas', G.FR[side].at(u, yc, 0.012), G.FR[side].n, pw, ph, r ? [1, 1, 1] : hx([0xe8e2d0, 0xb8201c, 0xf2c200, 0x1f4f8c][kit.ghostIdx % 4]), r);
        G.rec('ghost', side, u - pw / 2, u + pw / 2, yc - ph / 2, yc + ph / 2, 0.012);
        placed = true;
      }
    }
  }
  // the overhead service, on the wall: from a corner of the front to the meter's conduit (the far corner if the wall is clear, else the near one), a black bundle held by white clips
  // every 0.7 m and a thinner TV cable under it, at the top of the ground floor or just under the first slab; it never crosses an opening, a board, an awning or a balcony
  if (kit.cable && kit.meterAt) {
    const uM = kit.meterAt.u, corner = (sgn) => sgn * (S.W / 2 - (kit.pilasters ? 0.36 : 0.08)), yTop = Math.min(kit.limit, S.fh) - S.slab - 0.2;          // (under the string course or the cornice, which are 0.2 m deep and not recorded)
    const clear = (u0, u1, y0, y1) => !bp.windows.some((w) => w.side === 'front' && Math.abs(w.x - (u0 + u1) / 2) < w.w / 2 + 0.12 + (u1 - u0) / 2 && w.floor * S.fh + w.y + w.h + 0.12 > y0 && w.floor * S.fh + w.y - 0.12 < y1)
      && !bp.doors.some((d) => d.ext && d.side === 'front' && Math.abs(d.x - (u0 + u1) / 2) < d.w / 2 + 0.14 + (u1 - u0) / 2 && d.floor * S.fh + d.h + 0.14 > y0 && d.floor * S.fh - 0.1 < y1)
      && !G.recs.some((r) => r.side === 'front' && r.kind !== 'meter' && r.u1 + 0.03 > u0 && r.u0 - 0.03 < u1 && r.y1 + 0.03 > y0 && r.y0 - 0.03 < y1);        // (the meter's own conduit is where it ends)
    let run = null;
    for (const uEnd of [corner(uM > 0 ? -1 : 1), corner(uM > 0 ? 1 : -1)]) for (const yE of [yTop, yTop - 0.12]) {
      if (run) break;
      const ua = Math.min(uEnd, uM), ub = Math.max(uEnd, uM);
      if (ub - ua >= 0.7 && yE > 2.15 && clear(ua, ub, yE - 0.1, yE + 0.03)) run = { ua, ub, yE, uEnd };
    }
    if (run) {
      cableRun(G, 'front', run.ua, run.ub, run.yE, 'cable');
      kit.cableEnd = { sg: Math.sign(run.uEnd), yE: run.yE };                         // the corner it ends at: the side wall there may carry it on (`elevations`)
    }
  }
}

// ---- the back and the side walls ----------------------------------------------------------------------------------------------------------------
/** The rooms that vent outward: what a window of one of them stands beside an extractor or an air brick for. */
const VENT_ROOMS = ['kitchen', 'bathroom', 'laundry', 'backroom'];
/** The side of an extractor or air brick (m): a casing and its opening. */
const VENT_SIZE = 0.32;
/** An extractor (a grey casing with a round dark fan in it) or an air brick (a dark opening under four slats) in a wall, VENT_SIZE across, centred `u` along it at height `y`. */
function vent(G, side, u, y, look) {
  const fr = G.FR[side], dark = hx(0x303336), casing = [0.8, 0.81, 0.8];
  if (look === 'extractor') {
    fbox(G, side, u, y, 0.05, VENT_SIZE, VENT_SIZE, 0.1, 'door_metal', casing, [AGAINST[side]]);
    fan(G, side, u, y, 0.105, 0.11, dark, hx(0x8a8f94));
  } else {
    fbox(G, side, u, y, 0.015, VENT_SIZE, VENT_SIZE, 0.03, 'door_metal', casing, [AGAINST[side]]);
    plate(G, 'rail_metal', fr.at(u, y, 0.032), fr.n, VENT_SIZE - 0.06, VENT_SIZE - 0.06, dark);
    for (let i = 0; i < 4; i++) plate(G, 'door_metal', fr.at(u, y - 0.09 + i * 0.06, 0.036), fr.n, VENT_SIZE - 0.06, 0.03, casing);
  }
}

/**
 * The back wall and the free side walls (R1-102, R4-311: "bare coloured boxes on lawn"). The front is dressed for the street; here it is plainer and more practical, and all of it comes
 * from the pieces the front already has: an air-conditioner beside an upper window (`acUnit`, the same three looks), a drainpipe at a corner (`drainPipe`), an extractor or an air brick
 * beside the kitchen's and the bathroom's windows, a zinc hood over a window that takes the sun (`tinHood`, the shop awning of tin), and the service cable going round the corner from
 * the front (`cableRun`). A finished building only (an unfinished one is bare brick and rebar); a chapel gets the pipe and the cable only. Every choice is a hash of the building id and
 * the wall (`h`), a stream of its own, so nothing on the front moves; every piece keeps clear of whatever is already on the wall (`busyAt`, `every`) and is recorded on `bp.facade`
 * like the rest (`ac`, `pipe`, `vent`, `hood`, `drop`). Weather (`weather.js`) comes after and keeps clear of all of it.
 */
function elevations(G, kit) {
  if (!kit.finished) return;
  const { S, bp } = G, fh = S.fh, yF = S.F * fh, roomType = new Map((bp.rooms ?? []).map((r) => [r.id, r.type])), chapel = kit.kind === 'chapel';
  const busy = (side, u0, u1, y0, y1, except) => busyAt(G, side, u0, u1, y0, y1, true, except);
  for (const side of ['back', 'left', 'right']) {
    if (S.party[side]) continue;
    const span = G.FR[side].span, h = (n) => hash01(`${bp.id}|${side}`, 1100 + n), wins = bp.windows.filter((w) => w.side === side);
    const byHash = (list, salt) => [...list].sort((p, q) => hash01(p.id, salt) - hash01(q.id, salt));
    const half = VENT_SIZE / 2 + 0.03;
    /** The three pieces a wall may take beside the air-conditioners: each returns whether it found room. */
    const pipeAt = () => {                                                         // a drainpipe at a corner: the back wall's (the roof sheds to the back) at an end that is not a party wall, a side wall's at its back end
      const ends = side === 'back' ? (h(11) < 0.5 ? [-1, 1] : [1, -1]).filter((sg) => !S.party[sg < 0 ? 'left' : 'right']).map((sg) => sg * (span / 2 - 0.1)) : S.party.back ? [] : [-span / 2 + 0.1];
      const top = yF - 0.05, u = ends.find((e) => !busy(side, e - 0.1, e + 0.1, 0.1, top));
      if (u === undefined) return false;
      drainPipe(G, side, u, top);
      return true;
    };
    const ventBy = (w, sg, look) => {                                              // an extractor or an air brick beside a window
      const wu = alongOf(side, w), y = w.floor * fh + Math.min(w.y + w.h / 2, 2.0);
      const u = [sg, -sg].map((s) => wu + s * (w.w / 2 + 0.45)).find((uu) => Math.abs(uu) < span / 2 - 0.3 && !busy(side, uu - half, uu + half, y - half, y + half));
      if (u === undefined) return false;
      vent(G, side, u, y, look);
      G.rec('vent', side, u - VENT_SIZE / 2, u + VENT_SIZE / 2, y - VENT_SIZE / 2, y + VENT_SIZE / 2, 0.11, { look });
      return true;
    };
    const hoodOver = (w) => {                                                      // a zinc hood over a window: the lean-to a household puts up over the one room that takes the sun
      const wu = alongOf(side, w), ua = wu - w.w / 2 - 0.12, ub = wu + w.w / 2 + 0.12, ya = w.floor * fh + w.y + w.h + 0.26, tp = 0.5, td = 0.2;
      if (w.arch || w.w < 0.7 || ua < -span / 2 + 0.1 || ub > span / 2 - 0.1 || ya > yF - 0.1 || busy(side, ua - 0.1, ub + 0.1, ya - td - 0.06, ya, w)) return false;
      tinHood(G, side, ua, ub, ya, tp, td);
      G.rec('hood', side, ua, ub, ya - td - 0.06, ya, tp, { window: w.id });
      return true;
    };
    if (h(10) < (side === 'back' ? 0.65 : 0.35)) pipeAt();
    // the service cable the front ended at a corner goes on round it, as far along this wall as it runs clear of the openings (the margins the front's run keeps: a thin cable passes close)
    if (kit.cableEnd && !kit.pilasters && side === (kit.cableEnd.sg < 0 ? 'left' : 'right')) {
      const { yE } = kit.cableEnd, uB = span / 2 - 0.08;
      const clear = (u0, u1, y0, y1) => !wins.some((w) => alongOf(side, w) + w.w / 2 + 0.12 > u0 && alongOf(side, w) - w.w / 2 - 0.12 < u1 && w.floor * fh + w.y + w.h + 0.12 > y0 && w.floor * fh + w.y - 0.12 < y1)
        && !bp.doors.some((d) => d.ext && d.side === side && alongOf(side, d) + d.w / 2 + 0.14 > u0 && alongOf(side, d) - d.w / 2 - 0.14 < u1 && d.floor * fh + d.h + 0.14 > y0 && d.floor * fh - 0.1 < y1)
        && !G.recs.some((r) => r.side === side && r.u1 + 0.03 > u0 && r.u0 - 0.03 < u1 && r.y1 + 0.03 > y0 && r.y0 - 0.03 < y1);
      let len = Math.min(span - 0.6, 2.4 + 3 * h(50));
      while (len >= 0.7 && !clear(uB - len, uB, yE - 0.1, yE + 0.03)) len -= 0.1;
      if (len >= 0.7) cableRun(G, side, uB - len, uB, yE, 'drop');
    }
    if (chapel) { if (!G.recs.some((r) => r.side === side)) pipeAt(); continue; }
    // an air-conditioner beside an upper window (never on the ground floor: a side lane is walked, and the unit stands 0.35 m out at the height of a shoulder), where the building has them at the front; one in five of the others has one
    const wantAC = kit.ac ? (h(0) < 0.55 ? 1 + Math.floor(h(1) * 2) : 0) : h(0) < 0.2 ? 1 : 0;
    let nac = 0;
    for (const w of byHash(wins.filter((q) => q.floor >= 1 && q.w >= 0.9), 31)) {
      if (nac >= wantAC) break;
      const wu = alongOf(side, w), y = w.floor * fh + 0.95, look = acLook(w.id), sgn = hash01(w.id, 32) < 0.5 ? -1 : 1;
      const u = [sgn, -sgn].map((s) => clamp(wu + s * (w.w / 2 + 0.67), -span / 2 + 0.55, span / 2 - 0.55)).find((uu) => !busy(side, uu - 0.45, uu + 0.45, y - 0.4, y + 0.4));
      if (u === undefined) continue;
      const { hw, y0, y1 } = acUnit(G, side, u, y, look, wu > u ? 1 : -1, busy);
      G.rec('ac', side, u - hw, u + hw, y0, y1, 0.35, { look: look.type, col: look.col.map((c) => +c.toFixed(2)) });
      nac++;
    }
    // an extractor or an air brick beside the window of a kitchen, a bathroom, a laundry or a back room
    const wantVent = h(20) < 0.6 ? 1 + (h(21) < 0.25 ? 1 : 0) : 0;
    let nv = 0;
    for (const w of byHash(wins.filter((q) => VENT_ROOMS.includes(roomType.get(q.room))), 22)) {
      if (nv >= wantVent) break;
      if (ventBy(w, h(25 + nv) < 0.5 ? -1 : 1, h(23 + nv) < 0.5 ? 'extractor' : 'airbrick')) nv++;
    }
    // a zinc hood over a window
    const wantHood = h(40) < 0.4 ? 1 + (h(41) < 0.3 ? 1 : 0) : 0;
    let nh = 0;
    for (const w of byHash(wins, 42)) {
      if (nh >= wantHood) break;
      if (hoodOver(w)) nh++;
    }
    // no wall is left with nothing on it: a hood over a window, else an extractor beside one, else a pipe at a corner, whichever finds room first
    if (!G.recs.some((r) => r.side === side)) {
      const any = byHash(wins, 60);
      if (!any.some(hoodOver) && !any.some((w) => ventBy(w, h(60) < 0.5 ? -1 : 1, h(61) < 0.5 ? 'extractor' : 'airbrick'))) pipeAt();
    }
  }
}

// ---- the promenade side of the south row (round 7, the beach; layouthelp.js `beachSide`) -------------------------------------------------------------------------------------------------
/** A canvas cover on a wall: stripes of the pair `pair` from the top edge `ya`, `proj` out and `drop` down, a valance on its lip and two thin arms under it (the shop awning of cloth, on any side). */
function canvasCover(G, side, ua, ub, ya, proj, drop, pair) {
  const { b } = G, fr = G.FR[side], w = ub - ua, n = Math.max(4, Math.round(w / 0.2) & ~1), [c0, c1] = pair.map(hx), up = [fr.n[0] * drop, proj, fr.n[2] * drop], under = [-up[0], -up[1], -up[2]];
  for (let i = 0; i < n; i++) {
    const u0 = ua + (w * i) / n, u1 = ua + (w * (i + 1)) / n, col = i % 2 ? c1 : c0;
    const A = fr.at(u0, ya, 0.01), B = fr.at(u1, ya, 0.01), C = fr.at(u1, ya - drop, proj), E = fr.at(u0, ya - drop, proj);
    qd(b, 'frame_paint', A, B, C, E, up, { col });
    qd(b, 'frame_paint', A, B, C, E, under, { col: mulc(col, 0.55) });
    qd(b, 'frame_paint', fr.at(u0, ya - drop - 0.13, proj), fr.at(u1, ya - drop - 0.13, proj), C, E, fr.n, { col: mulc(col, 0.92) });
  }
  for (const u of [ua + 0.03, ub - 0.03]) fbox(G, side, u, ya - 0.2, proj * 0.5, 0.025, 0.025, Math.hypot(proj, drop) + 0.04, 'rail_metal', hx(0x2b2e31));
}

/**
 * The backs of the south row (L11-L15, L50, L51) face the promenade. A cafe's or a restaurant's storeroom door (layouthelp.js `beachDoor`, an `alley` entrance) gets a terrace: a canvas cover over it on two arms (the
 * building's own awning colours), its name on a board above, and a planter with its shrubs either side of the steps. The others get what their wall can take: the shop's board on the sea side, a planter at each end of the
 * wall, and for a house a faded advert. Everything keeps clear of every opening and of whatever `elevations` put up before it (`busyAt`), is recorded on `bp.facade` (`terrace`, `sign`, `planter`, `ghost`, each with `rear: true`) and is a
 * hash of the building id (no stream). Visual only: a planter is 0.4 m tall (a walker steps over it; the plan's steps stand between the two) and the cover is over a walker's head. Every other lot: untouched.
 */
function beachRear(G, kit) {
  const { S, bp, ctx } = G, mode = beachSide(bp.lot, ctx);
  if (!mode || !kit.finished) return;
  const fr = G.FR.back, fl = bp.frame, ph = ctx.plan?.heightAt, lot = bp.lot, h = (n) => hash01(bp.id, 520 + n), W = S.W;
  const door = bp.doors.find((d) => d.ext && d.side === 'back' && d.floor === 0 && d.entrance === 'alley');
  const busy = (u0, u1, y0, y1) => busyAt(G, 'back', u0, u1, y0, y1, true);
  const clear = (u0, u1, y0, y1) => !bp.windows.some((w) => w.side === 'back' && w.x + w.w / 2 + 0.15 > u0 && w.x - w.w / 2 - 0.15 < u1 && w.floor * S.fh + w.y + w.h + 0.15 > y0 && w.floor * S.fh + w.y - 0.15 < y1)
    && !G.recs.some((r) => r.side === 'back' && r.u1 + 0.05 > u0 && r.u0 - 0.05 < u1 && r.y1 > y0 && r.y0 < y1);                       // (like `busy`, but the door itself is not in the way: the cover is meant to hang over it)
  const ground = (u, a) => { const p = fl.toWorld(u, 0, -S.D / 2 - a), g = ph ? ph(p[0], p[2]) : NaN; return Number.isFinite(g) ? g - fl.y : -0.3; };      // the ground `a` m out from the wall, from the floor line
  /** A planter of 0.55 x 0.4 m and 0.4 m tall with three shrubs, standing on the ground `u` along the wall; false when the wall there is taken. */
  const planter = (u, k) => {
    const pw = 0.55, dp = 0.4, hg = 0.4, off = dp / 2 + 0.05, low = Math.min(...[-pw / 2, pw / 2].flatMap((du) => [off - dp / 2, off + dp / 2].map((a) => ground(u + du, a)))) - 0.03;
    if (Math.abs(u) > W / 2 - 0.4 || busy(u - pw / 2 - 0.05, u + pw / 2 + 0.05, Math.max(0, low), low + hg + 0.3)) return false;
    fbox(G, 'back', u, low + hg / 2, off, pw, hg, dp, 'plaster_rough', hx([0xa8553a, 0x6f8f4f, 0xd9d2c0, 0x8a5a34][Math.floor(h(k) * 4) % 4]));
    const p0 = fr.at(u, low + hg, off);
    for (let i = 0; i < 3; i++) bush(G, p0[0] + (i - 1) * pw * 0.3, p0[1], p0[2], 0.13 + 0.05 * h(k + 1 + i), 0.28 + 0.16 * h(k + 4 + i), mulc(hx([0x3f8a3f, 0x4f9a48, 0x2f7a4a][i]), 0.9 + 0.2 * h(k + 7 + i)));
    G.rec('planter', 'back', u - pw / 2, u + pw / 2, Math.max(0, low), low + hg + 0.3, off + dp / 2, { rear: true });
    return true;
  };
  /** The shop's board on the sea side, `bw` x `bw / 4` with its foot at `y0`, as near `uPref` along the wall as a free stretch allows (the atlas rect of the front's board: the same lettering). */
  const board = (uPref, y0, bw) => {
    const t = signText(lot), bh = bw / 4;
    if (!t) return false;
    const c = signColours(lot), hand = handPainted(lot), flat = hexToLin(hand ? HAND_BG : c.bg), A = ctx.signAtlas;
    const u = [0, 0.5, -0.5, 1, -1, 1.5, -1.5].map((d) => clamp(uPref + d, -W / 2 + 0.2 + bw / 2, W / 2 - 0.2 - bw / 2)).find((uu) => !busy(uu - bw / 2 - 0.05, uu + bw / 2 + 0.05, y0 - 0.06, y0 + bh + 0.06));
    if (u === undefined || y0 + bh + 0.1 > S.F * S.fh) return false;
    const y = y0 + bh / 2, rect = A?.uv?.[`board:${lot.id}`] ?? null;
    if (hand) fbox(G, 'back', u, y, 0.025, bw + 0.08, bh + 0.08, 0.05, 'plaster_a', hexToLin(HAND_BG)); else fbox(G, 'back', u, y, 0.03, bw + 0.1, bh + 0.1, 0.06, 'frame_paint', mulc(G.fs.metal, 1.3));
    plate(G, 'sign_atlas', fr.at(u, y, hand ? 0.056 : 0.065), fr.n, bw, bh, rect ? [1, 1, 1] : flat, rect);
    G.rec('sign', 'back', u - bw / 2 - 0.05, u + bw / 2 + 0.05, y0 - 0.05, y0 + bh + 0.05, hand ? 0.06 : 0.07, { rear: true, ...(hand ? { hand: true } : {}) });
    return true;
  };
  if (door) {
    const w = Math.min(door.w + 1.3, W - 0.4), ya = door.h + 0.45, drop = 0.4, proj = 1.15, ua = clamp(door.x - w / 2, -W / 2 + 0.12, W / 2 - 0.12 - w), ub = ua + w;
    if (clear(ua, ub, ya - drop - 0.1, ya + 0.02)) {
      canvasCover(G, 'back', ua, ub, ya, proj, drop, kit.awnPair);
      G.rec('terrace', 'back', ua, ub, ya - drop - 0.13, ya, proj, { rear: true });                                // (not an 'awning': weather.js looks for the shop door's awning among the records of EVERY side)
    }
    board(door.x, ya + 0.12, 2.0);
    for (const sg of [-1, 1]) planter(door.x + sg * (door.w / 2 + 0.2 + 0.45), 10 + 10 * (sg > 0));
  } else {
    if (!board(0, 2.5, 1.9) && !signText(lot)) {                                                  // a house: a faded advert on the blank stretch of the wall, as the side walls have
      const pw = 2.4, ph2 = 1.5, yc = S.F * S.fh - 0.35 - ph2 / 2, A = ctx.signAtlas, idx = (kit.ghostIdx + 3) % GHOST_COUNT;
      for (let i = 0; i < 6; i++) {
        const u = (hash01(bp.id, 540 + i) - 0.5) * (W - pw - 0.6);
        if (yc - ph2 / 2 < S.fh || busy(u - pw / 2, u + pw / 2, yc - ph2 / 2, yc + ph2 / 2)) continue;
        const r = A?.uv?.[`ghost:${idx}`] ?? null;
        plate(G, 'sign_atlas', fr.at(u, yc, 0.012), fr.n, pw, ph2, r ? [1, 1, 1] : hx([0xe8e2d0, 0xb8201c, 0xf2c200, 0x1f4f8c][idx % 4]), r);
        G.rec('ghost', 'back', u - pw / 2, u + pw / 2, yc - ph2 / 2, yc + ph2 / 2, 0.012, { rear: true });
        break;
      }
    }
    for (const sg of [-1, 1]) planter(sg * (W / 2 - 0.7), 10 + 10 * (sg > 0));
  }
}

// ---- the roof kit -------------------------------------------------------------------------------------------------------------------------------
function dish(G, x, y, z, yaw, tint) {
  if (buildingClutter(G, 'clutter_dish', x, y, z, yaw, { size: [0.72, 0.96, 0.72] })) return;
  const { b } = G, dir = [Math.sin(yaw), 0, Math.cos(yaw)], n = nrm([dir[0] * 0.75, 0.66, dir[2] * 0.75]);
  b.cyl('rail_metal', x, y, z, 0.03, 0.5, 6, { col: hx(0x6b6e70), caps: false });
  const c = [x, y + 0.56, z], e1 = nrm(crs(n, UP)), e2 = crs(n, e1), r = 0.3, N = 10, ring = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; ring.push([c[0] + (Math.cos(a) * e1[0] + Math.sin(a) * e2[0]) * r, c[1] + (Math.cos(a) * e1[1] + Math.sin(a) * e2[1]) * r, c[2] + (Math.cos(a) * e1[2] + Math.sin(a) * e2[2]) * r]); }
  const hub = [c[0] - n[0] * 0.07, c[1] - n[1] * 0.07, c[2] - n[2] * 0.07];
  for (let i = 0; i < N; i++) { const p = ring[i], q = ring[(i + 1) % N]; const t = crs([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [hub[0] - p[0], hub[1] - p[1], hub[2] - p[2]]); const fl = t[0] * n[0] + t[1] * n[1] + t[2] * n[2] < 0; b.tri('door_metal', fl ? q : p, fl ? p : q, hub, { col: tint }); b.tri('door_metal', fl ? p : q, fl ? q : p, hub, { col: mulc(tint, 0.6) }); }
  const feed = [c[0] + n[0] * 0.3, c[1] + n[1] * 0.3, c[2] + n[2] * 0.3];
  b.box('rail_metal', feed[0], feed[1], feed[2], 0.05, 0.05, 0.05, { col: hx(0x2b2e31) });
  b.cyl('rail_metal', (hub[0] + feed[0]) / 2, Math.min(hub[1], feed[1]), (hub[2] + feed[2]) / 2, 0.008, Math.abs(feed[1] - hub[1]) + 0.01, 4, { col: hx(0x2b2e31), caps: false });
}

function antenna(G, x, y, z) {
  const { b } = G, c = hx(0x8a8d90);
  b.cyl('rail_metal', x, y, z, 0.014, 1.9, 5, { col: c, caps: false });
  for (let i = 0; i < 5; i++) b.box('rail_metal', x, y + 0.95 + i * 0.2, z, 0.74 - i * 0.12, 0.012, 0.012, { col: c });
  b.box('rail_metal', x, y + 0.95, z, 0.012, 0.012, 0.5, { col: c });
}

function tank(G, x, y, z, blue, stand) {
  const { b } = G, col = blue ? hx(0x2c5f8f) : hx(0x1d2024), r = 0.47;
  let y0 = y;
  if (stand === 'tower') {                                                          // a steel tower 1.9 m high: four legs, cross bracing on the two faces that look out, a ladder up the back
    const steel = hx(0x2f3235), hgt = 1.9;
    for (const [dx, dz] of [[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48]]) b.box('rail_metal', x + dx, y + hgt / 2 + 0.05, z + dz, 0.07, hgt, 0.07, { col: steel, skip: ['ny'] });
    for (const [p0, p1] of [[[-0.48, 0.3, 0.48], [0.48, 1.6, 0.48]], [[0.48, 0.3, 0.48], [-0.48, 1.6, 0.48]], [[0.48, 0.3, -0.48], [0.48, 1.6, 0.48]], [[0.48, 0.3, 0.48], [0.48, 1.6, -0.48]]]) {
      bar(b, 'rail_metal', [x + p0[0], y + p0[1], z + p0[2]], [x + p1[0], y + p1[1], z + p1[2]], 0.03, 0.03, { col: steel });
    }
    b.box('rail_metal', x, y + 1.97, z, 1.06, 0.06, 1.06, { col: steel });
    for (const dx of [-0.15, 0.15]) b.box('rail_metal', x + dx, y + hgt / 2 + 0.05, z - 0.53, 0.03, hgt, 0.03, { col: steel, skip: ['ny'] });
    for (let i = 0; i < 6; i++) b.box('rail_metal', x, y + 0.25 + i * 0.3, z - 0.53, 0.3, 0.025, 0.025, { col: steel });
    b.box('concrete_bare', x, y + 0.04, z, 1.1, 0.08, 1.1, { col: [0.88, 0.88, 0.86] });
    y0 = y + 2.0;
  } else if (stand === 'plinth') {                                                  // a rendered block plinth with a cap slab: the tank sits at the height of a first-floor sill
    b.box('concrete_bare', x, y + 0.45, z, 1.1, 0.9, 1.1, { col: [0.84, 0.82, 0.78] });
    b.box('concrete_bare', x, y + 0.93, z, 1.2, 0.06, 1.2, { col: [0.9, 0.9, 0.88] });
    y0 = y + 0.96;
  } else if (stand) {
    b.box('concrete_bare', x, y + 0.05, z, 1.1, 0.1, 1.1, { col: [0.88, 0.88, 0.86] });
    for (const [dx, dz] of [[-0.48, -0.48], [0.48, -0.48], [0.48, 0.48], [-0.48, 0.48]]) b.box('rail_metal', x + dx, y + 0.55, z + dz, 0.07, 0.9, 0.07, { col: hx(0x2f3235) });
    b.box('rail_metal', x, y + 1.02, z, 1.06, 0.06, 1.06, { col: hx(0x2f3235) });
    y0 = y + 1.05;
  } else b.box('concrete_bare', x, y + 0.04, z, 1.0, 0.08, 1.0, { col: [0.88, 0.88, 0.86] }), y0 = y + 0.08;
  if (buildingClutter(G, blue ? 'clutter_tank_blue' : 'clutter_tank_black', x, y0, z, 0, { size: [1.02, 1.14, 1.02] })) return;
  b.cyl('tank_plastic', x, y0, z, r, 0.92, 14, { r1: r * 0.94, col });
  b.cyl('tank_plastic', x, y0 + 0.92, z, r * 0.94, 0.16, 14, { r1: r * 0.3, col, caps: false });
  b.cyl('tank_plastic', x, y0 + 1.07, z, 0.15, 0.07, 8, { col: mulc(col, 1.5) });
  for (const hy of [0.28, 0.68]) b.cyl('tank_plastic', x, y0 + hy, z, r * 1.015, 0.035, 14, { col: mulc(col, 0.6), caps: false });
  b.cyl('tank_plastic', x + r * 0.9, y0 + 0.02, z, 0.025, 0.55, 5, { col: hx(0x1d2024), caps: false });
}

function loft(G, x, y, z, ry) {
  const { b } = G, cs = Math.cos(ry), sn = Math.sin(ry), P = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
  for (const [dx, dz] of [[-0.45, -0.35], [0.45, -0.35], [0.45, 0.35], [-0.45, 0.35]]) { const p = P(dx, dz); b.box('rail_metal', p[0], y + 0.18, p[1], 0.06, 0.36, 0.06, { col: hx(0x4a3a2a) }); }
  b.box('door_wood', x, y + 0.7, z, 1.0, 0.7, 0.8, { col: hx(0xa8754a), ry });
  const fp = P(0, 0.405);
  b.box('grille_iron', fp[0], y + 0.7, fp[1], 0.8, 0.5, 0.012, { col: hx(0x1e2023), ry });
  const rp = P(0, 0); b.box('corrugated_zinc', rp[0], y + 1.13, rp[1], 1.14, 0.04, 0.96, { col: [0.78, 0.8, 0.8], ry });
  const pp = P(0, 0.52); b.box('rail_metal', pp[0], y + 0.42, pp[1], 0.8, 0.025, 0.04, { col: hx(0x4a3a2a), ry });
}

/** Runs of free parapet along `side` (inside faces), avoiding the caseta; [lo, hi] along u. */
function freeRuns(G, side) {
  const { S } = G, te = S.te, cas = S.roofLayer?.caseta, span = G.FR[side].span, lo = -span / 2 + te + 0.35, hi = span / 2 - te - 0.35;
  if (!cas) return [[lo, hi]];
  const q = cas.outer, pad = 0.35, front = side === 'front' || side === 'back', ua = front ? q.x0 - pad : q.z0 - pad, ub = front ? q.x1 + pad : q.z1 + pad;
  const wallC = side === 'front' ? S.D / 2 - te : side === 'back' ? -S.D / 2 + te : side === 'left' ? -S.W / 2 + te : S.W / 2 - te;
  const qa = side === 'front' ? q.z1 : side === 'back' ? q.z0 : side === 'left' ? q.x0 : q.x1;
  const touches = Math.abs(qa - wallC) < 0.9;
  if (!touches) return [[lo, hi]];
  return [[lo, Math.min(hi, ua)], [Math.max(lo, ub), hi]].filter((r) => r[1] - r[0] > 0.5);
}

function launderLine(G, kit) {
  const { S, b, bp } = G, yF = S.F * S.fh, hv = (n) => hash01(bp.id, 520 + n);
  const order = ['front', 'back', 'left', 'right'].sort((a, c) => hash01(bp.id + a, 521) - hash01(bp.id + c, 521) + (a === 'front' ? -0.4 : 0));
  for (const side of order) {
    const runs = freeRuns(G, side).sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
    const run = runs[0]; if (!run || run[1] - run[0] < 2.0) continue;
    const len = Math.min(run[1] - run[0], 3.2 + 1.8 * hv(1)), u0 = run[0] + (run[1] - run[0] - len) * hv(2), fr = G.FR[side], inset = S.te + 0.05, yl = yF + 1.92;
    const at = (u, y, o) => fr.at(u, y, -inset - o);
    const alongX = side === 'front' || side === 'back';
    const mid = at(u0 + len / 2, yF, 0);
    if (buildingClutter(G, 'clutter_washing_line', mid[0], yF, mid[2], alongX ? 0 : Math.PI / 2, { size: [len, 1.96, 0.3] })) return;
    for (const u of [u0, u0 + len]) { const p = at(u, yF + 1.0, 0); b.box('rail_metal', p[0], p[1], p[2], 0.045, 2.0, 0.045, { col: hx(0x6b6e70) }); }
    const m = at(u0 + len / 2, yl, 0); b.box('rail_metal', m[0], m[1], m[2], alongX ? len : 0.008, 0.008, alongX ? 0.008 : len, { col: hx(0x9a9c9e) });
    const n = 3 + Math.floor(hv(3) * 4);
    for (let i = 0; i < n; i++) {
      const u = u0 + 0.3 + ((len - 0.6) * (i + 0.5)) / n, w = 0.3 + 0.35 * hv(4 + i), hgt = 0.45 + 0.4 * hv(12 + i), col = hx(CLOTH[Math.floor(hv(20 + i) * CLOTH.length) % CLOTH.length]);
      const c = at(u, yl - hgt / 2 - 0.02, 0.05), nn = [-fr.n[0], 0, -fr.n[2]];
      cloth(G, c, nn, w, hgt, col);
    }
    return;
  }
}

/**
 * A room built on the unreachable roof (cuarto de azotea): exposed brick or rendered, a steel door and a small window on the street-facing wall,
 * a flat slab or a zinc sheet for a roof. It stands at the back of the roof, set back from the front parapet, so the skyline steps up behind the street wall.
 */
function cuarto(G, kit) {
  const { S, b, bp } = G, hv = (n) => hash01(bp.id, 640 + n), yF = S.F * S.fh, I = S.inner, W = I.x1 - I.x0, D = I.z1 - I.z0;
  const w = clamp(2.4 + 1.0 * hv(1), 2.4, Math.min(3.6, W - 0.8)), d = 2.3 + 0.4 * hv(2), h = 2.3;
  if (W < 3.2 || D - d - 0.35 < 1.6) return null;
  const cx = I.x0 + 0.3 + w / 2 + (W - w - 0.6) * hv(3), z0 = I.z0 + 0.3, z1 = z0 + d, cz = (z0 + z1) / 2;
  const brick = hv(4) < 0.55, flat = hv(5) < 0.5;
  b.box(brick ? 'brick_clay_hollow' : 'plaster_rough', cx, yF + h / 2, cz, w, h, d, { col: brick ? [0.9 + 0.2 * hv(6), 0.9 + 0.2 * hv(6), 0.9 + 0.2 * hv(6)] : mulc(G.fs.wall, 0.95), skip: ['ny'] });
  let top;
  if (flat) { top = yF + h + 0.14; b.box('concrete_bare', cx, yF + h + 0.07, cz, w + 0.24, 0.14, d + 0.24, { col: [0.92, 0.92, 0.9] }); }
  else {                                                                           // a zinc sheet falling toward the street
    const yb = yF + h + 0.2, yf = yF + h + 0.05, x0 = cx - w / 2 - 0.15, x1 = cx + w / 2 + 0.15, za = z0 - 0.12, zb = z1 + 0.22, col = [0.82, 0.84, 0.84];
    const A = [x0, yf, zb], B = [x1, yf, zb], C = [x1, yb, za], E = [x0, yb, za];
    qd(b, 'corrugated_zinc', A, B, C, E, [0, 1, 0], { col }); qd(b, 'corrugated_zinc', A, B, C, E, [0, -1, 0], { col: mulc(col, 0.5) });
    top = yb;
  }
  const side = hv(7) < 0.5 ? -1 : 1, dx = cx + side * (w / 2 - 0.75), wx = cx - side * (w / 2 - 0.6), zf = z1 + 0.012, fc = mulc(G.fs.trim, 1);
  b.quad('door_metal', [dx - 0.4, yF, zf], [dx + 0.4, yF, zf], [dx + 0.4, yF + 1.95, zf], [dx - 0.4, yF + 1.95, zf], { col: G.fs.door });
  for (const sg of [-1, 1]) b.box('frame_paint', dx + sg * 0.44, yF + 0.99, zf + 0.012, 0.07, 1.98, 0.03, { col: fc });
  b.box('frame_paint', dx, yF + 2.0, zf + 0.012, 0.95, 0.07, 0.03, { col: fc });
  b.quad('glass', [wx - 0.3, yF + 1.1, zf], [wx + 0.3, yF + 1.1, zf], [wx + 0.3, yF + 1.7, zf], [wx - 0.3, yF + 1.7, zf], { col: [1, 1, 1] });
  for (const [ux, uy, sx, sy] of [[wx, yF + 1.1, 0.7, 0.05], [wx, yF + 1.7, 0.7, 0.05], [wx - 0.3, yF + 1.4, 0.05, 0.65], [wx + 0.3, yF + 1.4, 0.05, 0.65]]) b.box('frame_paint', ux, uy, zf + 0.012, sx, sy, 0.03, { col: fc });
  G.rec('roofroom', 'roof', cx - w / 2, cx + w / 2, yF, top, 0, { z0, z1, flat });
  return { cx, cz, w, d, flat, top };
}

function terraceKit(G, kit) {
  const { S, b, bp } = G, yF = S.F * S.fh, ph = S.roofLayer?.parapetH ?? 0.7, cas = S.roofLayer?.caseta, hv = (n) => hash01(bp.id, 600 + n);
  const tankBlue = kit.tankBlue;
  if (cas) {
    const q = cas.outer, yc = yF + CASETA_H + 0.14, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, lx = q.x1 - q.x0 + 0.2, lz = q.z1 - q.z0 + 0.2;
    const alongX = lx >= lz, L = alongX ? lx : lz, slots = [0.22, 0.5, 0.78].map((f) => (f - 0.5) * (L - 0.5)).sort((p, c) => hash01(bp.id + p, 6) - hash01(bp.id + c, 6));
    const spot = (s) => (alongX ? [cx + s, cz] : [cx, cz + s]);
    let i = 0;
    if (kit.tank) { const [x, z] = spot(slots[i++]); tank(G, x, yc, z, tankBlue, false); }
    if (kit.loft && i < 3) { const [x, z] = spot(slots[i++]); loft(G, x, yc, z, alongX ? 0 : Math.PI / 2); }
    if (kit.dish && i < 3) { const [x, z] = spot(slots[i++]); dish(G, x, yc, z, hv(1) * Math.PI * 2, hx([0xd8d8d4, 0xbfc4c4, 0xe8e4da][Math.floor(hv(2) * 3)])); }
    if (kit.antenna) { const [x, z] = spot(slots[Math.min(2, i)] + 0.5); antenna(G, x, yc, z); }
  } else {                                                                         // unreachable roof: seen from the uphill streets and across the valley, never walked on
    const I = S.inner, cu = kit.cuarto ? cuarto(G, kit) : null;
    if (kit.tank) {
      if (cu?.flat) tank(G, cu.cx + (hv(3) - 0.5) * (cu.w - 1.6), cu.top, cu.cz, tankBlue, false);                 // on the slab of the room
      else if (!cu) {                                                                // on its stand against the back parapet: legs, a steel tower or a block plinth, and now and then two tanks side by side
        const style = hv(7) < 0.45 ? 'frame' : hv(7) < 0.75 ? 'tower' : 'plinth', pair = I.x1 - I.x0 >= 4.6 && hv(8) < 0.3, x = pair ? I.x0 + 1.8 + (I.x1 - I.x0 - 3.6) * hv(3) : I.x0 + 1.0 + (I.x1 - I.x0 - 2.0) * hv(3);
        for (const dx of pair ? [-0.65, 0.65] : [0]) tank(G, x + dx, yF, I.z0 + 0.95, tankBlue, style);
        G.bp.roofKit = { tank: style, tanks: pair ? 2 : 1 };
      }
    }
    if (kit.dish) dish(G, I.x1 - 0.6, yF + ph + 0.05, S.D / 2 - S.te / 2, hv(4) * 6.28, hx(0xd8d8d4));            // on the coping of the front parapet
  }
  if (kit.line) launderLine(G, kit);
  if (kit.rebar) {                                                                 // columns waiting for the next floor, rebar sprouting
    const top = yF + ph + 0.05, xs = [-S.W / 2 + 0.2, S.W / 2 - 0.2], zs = [-S.D / 2 + 0.2, S.D / 2 - 0.2];
    const pts = []; for (const x of xs) for (const z of zs) pts.push([x, z]);
    if (S.W > 5.5 && hv(5) < 0.5) pts.push([0, zs[1]]);
    for (const [x, z] of pts) {
      b.box('concrete_formwork', x, top + 0.2, z, 0.24, 0.4, 0.24, { col: [0.93, 0.93, 0.9] });
      for (const [dx, dz] of [[-0.075, -0.075], [0.075, -0.075], [0.075, 0.075], [-0.075, 0.075]]) { const hg = 0.55 + 0.55 * hash01(bp.id + x.toFixed(1) + z.toFixed(1), Math.round(dx * 100 + dz * 10)); b.box('rebar_rust', x + dx, top + 0.4 + hg / 2, z + dz, 0.013, hg, 0.013, { skip: ['ny'] }); }
    }
  }
}

function tileKit(G, kit) {
  const { S, b, bp, rm } = G, g = rm.gable, hv = (n) => hash01(bp.id, 620 + n);
  if (!g) return;
  const ridgeY = g.h(0) + 0.12, along = (g.ridgeZ ? S.D : S.W) / 2;
  const at = (a, y) => (g.ridgeZ ? [0, y, a] : [a, y, 0]);
  if (hv(1) < 0.5) {                                                                // chimney / vent stack
    const a = (hv(2) - 0.5) * along * 1.2, p = at(a, ridgeY);
    b.box('concrete_bare', p[0], ridgeY + 0.35, p[2], 0.42, 1.0, 0.42, { col: [0.82, 0.78, 0.72] }); b.box('concrete_bare', p[0], ridgeY + 0.9, p[2], 0.54, 0.08, 0.54, { col: [0.9, 0.9, 0.88] });
  }
  if (kit.antenna || kit.dish) { const a = (hv(3) - 0.5) * along * 1.0, p = at(a, ridgeY); if (kit.dish) dish(G, p[0], ridgeY - 0.05, p[2], hv(4) * 6.28, hx(0xd8d8d4)); else antenna(G, p[0], ridgeY - 0.1, p[2]); }
}

// ---- identity of the special buildings --------------------------------------------------------------------------------------------------
/**
 * The front of the chapel around its double door: a round arch of voussoirs in the trim colour over the leaves with a dark fanlight inside it (spokes, impost blocks, a
 * keystone), a statue in an arched niche on each side of the door, and the parish name painted straight on the wall above (decal atlas `parish:<lot>`, signs.js).
 * Everything is recorded on `bp.facade` (`portal`, `niche`, `name`) so that nothing else is hung on it.
 */
function chapelPortal(G, kit, d, trim) {
  const { S, b, lot, bp } = G, D2 = S.D / 2, cx = d.x, cy = d.h + 0.06, ri = d.w / 2 + 0.02, ro = ri + 0.2, N = 12;
  const P = (x, y, o) => [x, y, D2 + o], arc = (r, a, c = [cx, cy]) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r], ink = hx(0x1f2a54), dark = [0.03, 0.04, 0.07];
  // the arch: alternate voussoirs a shade apart, a dark fanlight in the ring, spokes, springers, a keystone
  for (let i = 0; i < N; i++) {
    const a0 = (Math.PI * i) / N, a1 = (Math.PI * (i + 1)) / N, A = arc(ri, a0), B = arc(ro, a0), C = arc(ro, a1), E = arc(ri, a1);
    qd(b, 'frame_paint', P(A[0], A[1], 0.025), P(B[0], B[1], 0.025), P(C[0], C[1], 0.025), P(E[0], E[1], 0.025), [0, 0, 1], { col: mulc(trim, i % 2 ? 0.92 : 1) });
    b.tri('frame_paint', P(cx, cy, 0.012), P(A[0], A[1], 0.012), P(E[0], E[1], 0.012), { col: dark });
  }
  for (let i = 1; i < 6; i++) { const a = (Math.PI * i) / 6, A = arc(0.04, a), B = arc(ri, a), t = [Math.cos(a + 1.5708) * 0.012, Math.sin(a + 1.5708) * 0.012]; qd(b, 'frame_paint', P(A[0] - t[0], A[1] - t[1], 0.02), P(B[0] - t[0], B[1] - t[1], 0.02), P(B[0] + t[0], B[1] + t[1], 0.02), P(A[0] + t[0], A[1] + t[1], 0.02), [0, 0, 1], { col: trim }); }
  for (const sg of [-1, 1]) fbox(G, 'front', cx + sg * (ri + 0.1), cy, 0.045, 0.26, 0.1, 0.07, 'plaster_a', trim);
  fbox(G, 'front', cx, cy + ro + 0.05, 0.045, 0.2, 0.22, 0.07, 'concrete_bare', [0.9, 0.9, 0.88]);
  G.rec('portal', 'front', cx - ro - 0.15, cx + ro + 0.15, 0, cy + ro + 0.2, 0.07);
  // a statue in an arched niche beside the door (not where a window already is)
  const nw = 0.7, y0 = 1.05, nh = 1.5, ya = y0 + nh - nw / 2;
  for (const sg of [-1, 1]) {
    const u = cx + sg * (d.w / 2 + 1.35);
    if (Math.abs(u) > S.W / 2 - 0.9 || bp.windows.some((w) => w.side === 'front' && w.floor === 0 && Math.abs(w.x - u) < w.w / 2 + nw / 2 + 0.3)) continue;
    const hw = nw / 2, c = [u, ya];
    qd(b, 'frame_paint', P(u - hw, y0, 0.02), P(u + hw, y0, 0.02), P(u + hw, ya, 0.02), P(u - hw, ya, 0.02), [0, 0, 1], { col: dark });             // the recess
    for (let i = 0; i < 8; i++) { const a0 = (Math.PI * i) / 8, a1 = (Math.PI * (i + 1)) / 8, A = arc(hw, a0, c), E = arc(hw, a1, c), B = arc(hw + 0.07, a0, c), C = arc(hw + 0.07, a1, c);
      b.tri('frame_paint', P(u, ya, 0.02), P(A[0], A[1], 0.02), P(E[0], E[1], 0.02), { col: dark });
      qd(b, 'frame_paint', P(A[0], A[1], 0.03), P(B[0], B[1], 0.03), P(C[0], C[1], 0.03), P(E[0], E[1], 0.03), [0, 0, 1], { col: mulc(trim, i % 2 ? 0.92 : 1) }); }
    for (const s2 of [-1, 1]) fbox(G, 'front', u + s2 * (hw + 0.035), (y0 + ya) / 2, 0.035, 0.07, ya - y0, 0.06, 'plaster_a', trim);
    fbox(G, 'front', u, y0 - 0.03, 0.05, nw + 0.18, 0.06, 0.12, 'concrete_bare', [0.9, 0.9, 0.88]);                                                    // the sill
    const f = G.FR.front.at(u, y0 + 0.04, 0.09), mantle = hash01(lot.id, 701 + (sg > 0 ? 1 : 0)) < 0.5 ? [0.05, 0.12, 0.45] : [0.32, 0.05, 0.05];
    b.cyl('plaster_a', f[0], f[1], f[2], 0.14, 0.06, 8, { col: [0.62, 0.6, 0.56], caps: true });                                                        // plinth
    b.cyl('plaster_a', f[0], f[1] + 0.06, f[2] - 0.012, 0.16, 0.62, 8, { r1: 0.06, col: mantle, caps: false });                                         // the cloak, a coloured edge round the robe
    b.cyl('plaster_a', f[0], f[1] + 0.06, f[2] + 0.014, 0.115, 0.58, 8, { r1: 0.04, col: [0.95, 0.94, 0.9], caps: true });                              // the robe
    b.cyl('plaster_a', f[0], f[1] + 0.62, f[2] + 0.01, 0.05, 0.11, 8, { r1: 0.042, col: [0.93, 0.8, 0.68], caps: true });                               // the head
    for (let i = 0; i < 10; i++) { const a0 = (Math.PI * 2 * i) / 10, a1 = (Math.PI * 2 * (i + 1)) / 10, h0 = [f[0], f[1] + 0.69, f[2] - 0.03];          // a gold halo behind the head
      b.tri('frame_paint', h0, [h0[0] + Math.cos(a0) * 0.1, h0[1] + Math.sin(a0) * 0.1, h0[2]], [h0[0] + Math.cos(a1) * 0.1, h0[1] + Math.sin(a1) * 0.1, h0[2]], { col: [0.9, 0.62, 0.12] }); }
    G.rec('niche', 'front', u - hw - 0.1, u + hw + 0.1, y0 - 0.06, ya + hw + 0.1, 0.1);
  }
  // the parish name, painted on the wall between the arch and the round window
  const pw = 4.2, ph = pw * (112 / 512), py = cy + ro + 0.2 + ph / 2, rect = G.ctx.decalAtlas?.uv?.[`parish:${lot.id}`] ?? null;
  if (rect) {
    const c = G.FR.front.at(cx, py, 0.008);
    G.b.quad('wall_decal', [c[0] - pw / 2, c[1] - ph / 2, c[2]], [c[0] + pw / 2, c[1] - ph / 2, c[2]], [c[0] + pw / 2, c[1] + ph / 2, c[2]], [c[0] - pw / 2, c[1] + ph / 2, c[2]],
      { uv: [rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3]], col: ink });
  }
  G.rec('name', 'front', cx - pw / 2, cx + pw / 2, py - ph / 2, py + ph / 2, 0.008);
}

function chapel(G, kit) {
  const { S, b, rm, bp } = G, g = rm.gable, D2 = S.D / 2, yF = S.F * S.fh, trim = hx(0xf2efe6);
  if (!g) return;
  const apex = g.h(0), d = kit.mainDoor;
  const cz = g.ridgeZ ? D2 : 0;                                                    // bell gable on the front gable when the ridge runs front to back
  if (g.ridgeZ) {
    b.box('plaster_a', 0, apex + 0.55, cz + 0.02, 1.7, 2.1, 0.34, { col: trim });
    b.box('concrete_bare', 0, apex + 1.65, cz + 0.02, 2.0, 0.12, 0.5, { col: [0.9, 0.9, 0.88] });
    const pt = (x, y) => [x, y, cz + 0.2];
    qd(b, 'rail_metal', pt(-0.26, apex + 0.45), pt(0.26, apex + 0.45), pt(0.26, apex + 1.0), pt(-0.26, apex + 1.0), [0, 0, 1], { col: hx(0x1d1d1f) });
    for (let i = 0; i < 8; i++) { const a0 = Math.PI * i / 8, a1 = Math.PI * (i + 1) / 8; b.tri('rail_metal', pt(0, apex + 1.0), pt(Math.cos(a0) * 0.26, apex + 1.0 + Math.sin(a0) * 0.26), pt(Math.cos(a1) * 0.26, apex + 1.0 + Math.sin(a1) * 0.26), { col: hx(0x1d1d1f) }); }
    b.cyl('rail_metal', 0, apex + 0.55, cz + 0.27, 0.15, 0.3, 8, { r1: 0.06, col: hx(0xa07a3a) });                  // the bell hangs in front of the dark opening
    b.box('plaster_a', 0, apex + 2.05, cz + 0.02, 0.09, 0.8, 0.09, { col: trim }); b.box('plaster_a', 0, apex + 2.25, cz + 0.02, 0.4, 0.09, 0.09, { col: trim });
    // rose window in the gable above the door
    const ry = yF + 1.3, rp = (x, y, o) => [x, y, D2 + o], N = 14;
    for (const [r, m, c, o] of [[0.62, 'frame_paint', trim, 0.018], [0.44, 'window_lit', [1, 1, 1], 0.03]]) for (let i = 0; i < N; i++) { const a0 = (i / N) * 6.2832, a1 = ((i + 1) / N) * 6.2832; b.tri(m, rp(0, ry, o), rp(Math.cos(a0) * r, ry + Math.sin(a0) * r, o), rp(Math.cos(a1) * r, ry + Math.sin(a1) * r, o), { col: c }); }
    b.box('frame_paint', 0, ry, D2 + 0.04, 0.88, 0.035, 0.02, { col: trim }); b.box('frame_paint', 0, ry, D2 + 0.04, 0.035, 0.88, 0.02, { col: trim });
    G.rec('rose', 'front', -0.7, 0.7, ry - 0.7, ry + 0.7, 0.05);
  }
  if (d) chapelPortal(G, kit, d, trim);
  for (const side of ['left', 'right']) if (!S.party[side]) {                      // buttresses along the nave
    const n = Math.max(2, Math.round(S.D / 3.6));
    for (let i = 0; i <= n; i++) fbox(G, side, -S.D / 2 + 0.3 + ((S.D - 0.6) * i) / n, yF / 2 + 0.15, 0.1, 0.46, yF + 0.3, 0.2, 'plaster_a', trim);
  }
  for (const sg of [-1, 1]) fbox(G, 'front', sg * (S.W / 2 - 0.25), yF / 2 + 0.15, 0.12, 0.5, yF + 0.3, 0.24, 'plaster_a', trim);
}

function school(G, kit) {                                                          // the national flag on a pole at the front corner of the roof
  const { S, b, rm } = G, D2 = S.D / 2;
  const sg = S.party.left ? 1 : S.party.right ? -1 : hash01(G.bp.id, 700) < 0.5 ? -1 : 1;
  const x = sg * (S.W / 2 - 0.4), z = D2 - 0.4, y0 = rm.wallTop({ dir: 'x', at: z }, x), H = 3.0;
  b.cyl('rail_metal', x, y0, z, 0.03, H, 6, { col: hx(0x9a9c9e), caps: true });
  b.cyl('rail_metal', x, y0 + H, z, 0.05, 0.08, 6, { col: hx(0xd9b13a) });
  const fl = 1.35, fh2 = 0.9, top = y0 + H - 0.1, x1 = x - sg * fl, zf = z + 0.01;          // hangs from the pole toward the middle of the roof, facing the street
  let yy = top;
  for (const [c, f] of [[0xf2c200, 0.5], [0x1f4f8c, 0.25], [0xc8281e, 0.25]]) {
    const A = [x - sg * 0.03, yy - fh2 * f, zf], B = [x1, yy - fh2 * f, zf], C = [x1, yy, zf], E = [x - sg * 0.03, yy, zf];
    qd(b, 'plaster_a', A, B, C, E, [0, 0, 1], { col: hx(c) }); qd(b, 'plaster_a', A, B, C, E, [0, 0, -1], { col: mulc(hx(c), 0.8) });
    yy -= fh2 * f;
  }
}

function clinic(G, kit) {                                                          // the green cross over the door
  const { S } = G, d = kit.mainDoor; if (!d) return;
  const y = d.h + 1.45, c = hx(0x1e9a4b);
  fbox(G, 'front', clamp(d.x, -S.W / 2 + 0.6, S.W / 2 - 0.6), y, 0.05, 0.62, 0.2, 0.06, 'door_metal', c);
  fbox(G, 'front', clamp(d.x, -S.W / 2 + 0.6, S.W / 2 - 0.6), y, 0.05, 0.2, 0.62, 0.06, 'door_metal', c);
}

export function buildFacade(G) {
  G.FR = frames(G.S);
  G.rec = recorder(G);
  G.bp.facade = G.recs;
  const kit = G.kit = makeKit(G);
  // the lowest point of the front wall's top edge (terrace: the parapet line; gable and mono-pitch roofs: their eave side): nothing on the wall rises past it
  const wt = (u) => G.rm.wallTop({ dir: 'x', at: G.S.D / 2 }, u);
  kit.limitAt = (u0, u1) => Math.min(wt(u0), wt((u0 + u1) / 2), wt(u1)) - 0.08;           // (the top edge is straight or peaked: its lowest point over a span is at an end)
  kit.limit = kit.limitAt(-G.S.W / 2 + 0.3, G.S.W / 2 - 0.3);
  kit.sign = signGeo(G, kit);
  courses(G, kit); pilasters(G, kit); awning(G, kit); signs(G, kit);
  balconies(G, kit); wallFurniture(G, kit); elevations(G, kit); beachRear(G, kit);
  if (G.S.roofStyle === 'terrace') terraceKit(G, kit); else if (G.S.roofStyle === 'tile') tileKit(G, kit);
  if (kit.kind === 'chapel') chapel(G, kit); else if (kit.kind === 'school') school(G, kit); else if (kit.kind === 'clinic') clinic(G, kit);
  weatherFacade(G, kit);                                                                   // last: every mark keeps clear of what is already on the wall (weather.js)
}
