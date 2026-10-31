// Facade language (T2.3): everything on the OUTSIDE of the shell that is not wall, window or door. String courses and cornices, pilasters,
// awnings and door canopies, lettered shop fascias and blade signs, balconies with railings / planters / laundry, split AC units, drainpipes, meter
// boxes, painted ghost signs and posters, and the roof kit (water tanks, dishes, antennas, pigeon lofts, laundry lines, rebar stubs). Chapel,
// school and clinic get their identity pieces (bell gable, cross, flag). Every choice is a hash of the building id, so no two neighbours repeat.
// Draw-call diet: only materials the shell already uses, plus `sign_atlas` (one canvas for all lettering, see signs.js).
import { lin, mulc, mixc, qd, hash01 } from './mb.js';
import { CASETA_H } from './roof.js';
import { buildingClutter } from '../world/clutter.js';
import { signText, signColours, hexToLin, GHOST_COUNT, POSTER_COUNT } from './signs.js';

const UP = [0, 1, 0];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const clamp = (v, a, c) => (v < a ? a : v > c ? c : v);
const SIDES = ['front', 'back', 'left', 'right'];
const AWNING = [[0xb8201c, 0xf4ead0], [0x1f5fa8, 0xf4efe0], [0x2e8b57, 0xf4efe0], [0xf2c200, 0xb8201c], [0x7a2f8c, 0xf2e8d0], [0xe8702a, 0xf4efe0], [0x0e7c86, 0xf4efe0]];
const CLOTH = [0xe8e2d0, 0xc8281e, 0x2f6fbf, 0xf2c200, 0xe07ab0, 0x3aa89a, 0xf4f4f0, 0x8a5a34, 0x7a2f8c, 0xe8702a];
const hx = (n) => lin(n);

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
    awning: shops && h(3) < 0.62, awnPair: AWNING[Math.floor(h(4) * AWNING.length) % AWNING.length],
    canopy: !shops && !!mainDoor && finished && h(5) < 0.35,
    blade: shops && h(6) < 0.55, bladeEnd: h(7) < 0.5 ? -1 : 1,
    balconies: finished ? (flats ? Math.max(nb, S.F > 2 ? 2 * (S.F - 1) : 2) : nb) : 0, railStyle: h(8) < 0.5 ? 'bars' : h(8) < 0.78 ? 'mixed' : 'solid',
    planters: h(9) < 0.6, laundry: h(10) < 0.4, ac: finished && (flats || inst || shops) ? (h(11) < 0.55 ? 1 + Math.floor(h(12) * 3) : 0) : (h(11) < 0.15 ? 1 : 0),
    pipe: finished && h(13) < 0.5, pipeSide: h(14) < 0.5 ? -1 : 1, meter: finished && !!mainDoor && h(15) < 0.7,
    poster: finished && shops && h(16) < 0.6, ghost: finished && h(17) < 0.38, ghostIdx: Math.floor(h(18) * GHOST_COUNT), posterIdx: Math.floor(h(19) * POSTER_COUNT),
    tank: terrace && (kind === 'apartments' ? h(20) < 0.95 : h(20) < 0.6), tankBlue: h(21) < 0.4, dish: h(22) < 0.5, antenna: h(23) < 0.35, loft: h(24) < 0.14,
    line: terrace && h(25) < 0.55, rebar: finished && terrace && !inst && h(26) < 0.36,
    mirador: finished && !inst && h(27) < 0.4,                                                            // this building closes some of its balconies in glass
    cuarto: finished && terrace && !inst && kind !== 'apartments' && h(28) < 0.6 && !S.roofLayer?.caseta && !S.roofWalkable,   // a room on the unreachable roof, set back from the street
  };
}

/** Everything the dressing adds is recorded on `bp.facade` (kind, side, span u0..u1 along the wall, y0..y1, out = how far it stands off the wall), for tests and for other modules. */
function recorder(G) {
  const recs = G.recs = [];
  return (kind, side, u0, u1, y0, y1, out = 0, extra) => { recs.push({ kind, side, u0: +u0.toFixed(3), u1: +u1.toFixed(3), y0: +y0.toFixed(3), y1: +y1.toFixed(3), out: +out.toFixed(3), ...extra }); };
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
  if (!t || !d) return null;
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
  const { t, d, bw, bh, u, y } = sg, c = signColours(lot), flat = hexToLin(c.bg), D2 = S.D / 2;
  fbox(G, 'front', u, y, 0.03, bw + 0.1, bh + 0.1, 0.06, 'frame_paint', mulc(G.fs.metal, 1.3));
  const rect = A?.uv?.[`board:${lot.id}`] ?? null;
  plate(G, 'sign_atlas', [u, y, D2 + 0.065], [0, 0, 1], bw, bh, rect ? [1, 1, 1] : flat, rect);
  G.rec('sign', 'front', sg.u0, sg.u1, y - bh / 2 - 0.05, sg.top, 0.07);
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
  const frameCol = hv(2) < 0.5 ? mulc(G.fs.trim, 1) : hx(0xf2efe6), lit = hv(3) < 0.4;
  fbox(G, 'front', u, yk - 0.075, dep / 2, len, 0.15, dep, 'concrete_bare', concrete);                                      // floor slab
  fbox(G, 'front', u, yk + hgt + 0.06, dep / 2 + 0.02, len + 0.1, 0.12, dep + 0.08, 'concrete_bare', concrete);              // roof slab
  fbox(G, 'front', u, yk + sill / 2, pz, len - 0.04, sill, 0.05, 'plaster_a', G.fs.wall);                                    // solid breast under the glass
  for (const sg of [-1, 1]) fbox(G, 'front', u + sg * (len / 2 - 0.03), yk + hgt / 2, dep / 2, 0.05, hgt, dep - 0.06, 'plaster_a', G.fs.wall);   // solid cheeks
  const gu0 = u - len / 2 + 0.06, gu1 = u + len / 2 - 0.06, gy0 = yk + sill, gy1 = yk + hgt, P = (uu, y) => G.FR.front.at(uu, y, pz + 0.005);
  b.quad(lit ? 'window_lit' : 'glass', P(gu0, gy0), P(gu1, gy0), P(gu1, gy1), P(gu0, gy1), { col: [1, 1, 1] });
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
    G.rec('balcony', 'front', u - len / 2, u + len / 2, yk - 0.15, top + 0.05, dep + 0.05, { window: w.id });
    if (kit.planters && hv(2) < 0.7) {                                                                                           // flower box hung outside the rail, with its plants
      const pw = Math.min(len - 0.2, 0.7 + 0.5 * hv(3)), pc = hx([0xa8553a, 0x6f8f4f, 0xd9d2c0, 0x8a5a34][Math.floor(hv(4) * 4) % 4]);
      fbox(G, 'front', u + (hv(5) - 0.5) * (len - pw - 0.1), top - 0.09, dep + 0.1, pw, 0.17, 0.2, 'plaster_rough', pc);
      const p0 = G.FR.front.at(u + (hv(5) - 0.5) * (len - pw - 0.1), top, dep + 0.1);
      for (let i = 0; i < 3; i++) bush(G, p0[0] + (i - 1) * pw * 0.3, top - 0.0, p0[2], 0.13 + 0.05 * hv(6 + i), 0.26 + 0.14 * hv(9 + i), mulc(hx([0x3f8a3f, 0x4f9a48, 0x2f7a4a][i]), 0.9 + 0.2 * hv(12 + i)));
    }
    if (kit.laundry && hv(13) < 0.55) {                                                                                          // clothes over the rail
      const n = 2 + Math.floor(hv(14) * 3);
      for (let i = 0; i < n; i++) cloth(G, G.FR.front.at(u - len / 2 + 0.25 + ((len - 0.5) * (i + 0.5)) / n, top - 0.2, dep + 0.025), [0, 0, 1], 0.28 + 0.2 * hv(15 + i), 0.42 + 0.3 * hv(18 + i), hx(CLOTH[Math.floor(hv(21 + i) * CLOTH.length) % CLOTH.length]));
    }
  }
  G.balc = made;
}

// ---- things stuck to the wall ----------------------------------------------------------------------------------------------------------------
function wallFurniture(G, kit) {
  const { S, b, bp, ctx } = G, D2 = S.D / 2, A = ctx.signAtlas, hh = (n) => hash01(bp.id, 450 + n);
  const busy = (side, u0, u1, y0, y1) => bp.windows.some((w) => w.side === side && (w.z !== undefined) && (side === 'front' || side === 'back' ? w.x : w.z) + w.w / 2 + 0.2 > u0 && (side === 'front' || side === 'back' ? w.x : w.z) - w.w / 2 - 0.2 < u1 && w.floor * S.fh + w.y + w.h + 0.2 > y0 && w.floor * S.fh + w.y - 0.2 < y1)
    || bp.doors.some((d) => d.ext && d.side === side && (side === 'front' || side === 'back' ? d.x : d.z) + d.w / 2 + 0.2 > u0 && (side === 'front' || side === 'back' ? d.x : d.z) - d.w / 2 - 0.2 < u1 && d.floor * S.fh + d.h + 0.2 > y0 && d.floor * S.fh - 0.2 < y1);
  // split air-conditioner condensers under upper (or institution ground-floor) windows
  let nac = 0;
  const wins = bp.windows.filter((w) => w.side === 'front' && (w.floor >= 1 || kit.inst) && w.w >= 0.9 && !(G.balc ?? []).some((q) => q.w === w)).sort((p, q) => hash01(p.id, 31) - hash01(q.id, 31));
  for (const w of wins) {
    if (nac >= kit.ac) break;
    const yk = w.floor * S.fh, y = yk + 0.95, sgn = hash01(w.id, 32) < 0.5 ? -1 : 1;
    // beside the window (clear of its 0.2 m margin and of every other opening), on whichever side is free
    const u = [sgn, -sgn].map((s) => clamp(w.x + s * (w.w / 2 + 0.67), -S.W / 2 + 0.55, S.W / 2 - 0.55)).find((uu) => !busy('front', uu - 0.45, uu + 0.45, y - 0.4, y + 0.4));
    if (u === undefined) continue;
    fbox(G, 'front', u, y, 0.19, 0.8, 0.56, 0.3, 'door_metal', [0.86, 0.87, 0.86]);
    const fp = G.FR.front.at(u - 0.13, y, 0.345); plate(G, 'rail_metal', fp, [0, 0, 1], 0.38, 0.38, hx(0x303336));
    fbox(G, 'front', u + 0.27, y, 0.345, 0.18, 0.4, 0.01, 'rail_metal', hx(0x45494c));
    for (const sg of [-1, 1]) fbox(G, 'front', u + sg * 0.3, y - 0.34, 0.14, 0.04, 0.04, 0.28, 'rail_metal', hx(0x2b2e31));
    G.rec('ac', 'front', u - 0.4, u + 0.4, y - 0.37, y + 0.28, 0.35);
    nac++;
  }
  // drainpipe at one end of the front (and its brackets)
  if (kit.pipe) {
    const top = S.F * S.fh - 0.05, u = kit.pipeSide * (S.W / 2 - 0.1);
    if (!S.party[kit.pipeSide < 0 ? 'left' : 'right'] && !busy('front', u - 0.1, u + 0.1, 0.1, top)) {
      const p = G.FR.front.at(u, 0.12, 0.06); b.cyl('tank_plastic', p[0], p[1], p[2], 0.032, top - 0.12, 6, { col: [0.78, 0.8, 0.78], caps: false });
      for (let y = 0.5; y < top; y += 1.3) fbox(G, 'front', u, y, 0.03, 0.09, 0.03, 0.04, 'rail_metal', hx(0x2b2e31));
      G.rec('pipe', 'front', u - 0.05, u + 0.05, 0.12, top, 0.1);
    }
  }
  // electricity meter box and its conduit beside the door
  if (kit.meter && kit.mainDoor) {
    const m = kit.mainDoor, sg = hash01(bp.id, 460) < 0.5 ? -1 : 1, u = m.x + sg * (m.w / 2 + 0.42);
    if (Math.abs(u) < S.W / 2 - 0.3 && !busy('front', u - 0.2, u + 0.2, 1.0, 2.0)) {
      const cTop = Math.min(2.75, kit.limitAt(u - 0.15, u + 0.15)), cLen = cTop - 1.7;  // the conduit runs up to the eaves and ends under the wall top
      fbox(G, 'front', u, 1.5, 0.07, 0.3, 0.4, 0.14, 'door_metal', [0.78, 0.8, 0.8]); fbox(G, 'front', u, 1.5, 0.15, 0.2, 0.28, 0.02, 'rail_metal', hx(0x3a3d40));
      fbox(G, 'front', u, 1.7 + cLen / 2, 0.03, 0.03, cLen, 0.03, 'rail_metal', hx(0x25272a));
      G.rec('meter', 'front', u - 0.15, u + 0.15, 1.3, cTop, 0.15);
    }
  }
  // posters beside the shop shutter, and a painted ghost sign on a blank upper wall
  if (kit.poster && kit.shopDoor) {                                               // bills pasted beside the shutter: toward the middle of the facade first, else the other side
    const d = kit.shopDoor, toward = d.x > 0 ? -1 : 1;
    let nposter = 0;
    for (const side of [toward, -toward]) for (let i = 0; i < 2 && nposter < 2; i++) {
      const u = d.x + side * (d.w / 2 + 0.45 + i * 0.5), pi = (kit.posterIdx + nposter * 3) % POSTER_COUNT;
      if (Math.abs(u) > S.W / 2 - 0.3 || busy('front', u - 0.2, u + 0.2, 1.1, 2.0)) continue;
      const r = A?.uv?.[`poster:${pi}`] ?? null, py = 1.45 + 0.1 * hash01(bp.id, 470 + nposter);
      plate(G, 'sign_atlas', G.FR.front.at(u, py, 0.012), [0, 0, 1], 0.34, 0.48, r ? [1, 1, 1] : hx([0xe8702a, 0xf2c200, 0x2f6fbf][pi % 3]), r);
      G.rec('poster', 'front', u - 0.17, u + 0.17, py - 0.24, py + 0.24, 0.012);
      nposter++;
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
  if (stand) {
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
      else if (!cu) tank(G, I.x0 + 1.0 + (I.x1 - I.x0 - 2.0) * hv(3), yF, I.z0 + 0.95, tankBlue, true);          // on its stand against the back parapet
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
  }
  if (d) {                                                                         // lunette over the door
    const r = d.w / 2 + 0.1, N = 10, p = (x, y) => [x, y, D2 + 0.02];
    for (let i = 0; i < N; i++) { const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N; b.tri('frame_paint', p(d.x, d.h + 0.075), p(d.x + Math.cos(a0) * r, d.h + 0.075 + Math.sin(a0) * r), p(d.x + Math.cos(a1) * r, d.h + 0.075 + Math.sin(a1) * r), { col: trim }); }
    fbox(G, 'front', d.x, d.h + 0.075 + r + 0.05, 0.03, 0.16, 0.14, 0.05, 'concrete_bare', [0.9, 0.9, 0.88]);
  }
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
  balconies(G, kit); wallFurniture(G, kit);
  if (G.S.roofStyle === 'terrace') terraceKit(G, kit); else if (G.S.roofStyle === 'tile') tileKit(G, kit);
  if (kit.kind === 'chapel') chapel(G, kit); else if (kit.kind === 'school') school(G, kit); else if (kit.kind === 'clinic') clinic(G, kit);
}
