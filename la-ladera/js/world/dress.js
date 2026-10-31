// Public-space dressing: safety rails and parapets along fill edges, plaza benches, the bus shelter, the Virgin's shrine, the court
// (fence + goals), the viewpoint (parapet, coin telescope, payphone), the lit summit cross, planters around the plaza trees.
// Groups: props.rails / props.benches / props.feature (shadow casters) and props.fence (alpha chain-link).
import { tube } from './mk.js';
import { OCC } from './occupancy.js';
import { pointInPoly, segDist } from './geom.js';
import { localToWorld } from './kit.js';
import { PLAZA_BAND } from './plan.js';
import { shrub } from './flora.js';
import { TILE } from './sprites.js';

const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const W = [1, 1, 1];
const BENCH_WOOD = 'wood_pine#9a7a58';

/** Nav edges that leave a plaza polygon: the fence and the parapet open wherever one of them crosses. */
function exitsOf(K, pl) {
  const byId = new Map(K.plan.nav.nodes.map((n) => [n.id, n]));
  const out = [];
  for (const [a, c] of K.plan.nav.edges) {
    const A = byId.get(a), C = byId.get(c);
    if (!A || !C) continue;
    if (pointInPoly(pl.poly, A.x, A.z) !== pointInPoly(pl.poly, C.x, C.z)) out.push([[A.x, A.z], [C.x, C.z]]);
  }
  return (x, z, r = 1.1) => out.some(([a, c]) => segDist(x, z, a, c) < r);
}

// ---------------------------------------------------------------------------------------------------- rails and parapets
function railings(K, stats) {
  const runs = K.ctx.world?.wallRuns ?? [], R = K.rng('rails');
  let n = 0;
  for (const run of runs) {
    if (run.sign > 0 || !/^(street|plaza)/.test(run.src)) continue;
    const drop = run.S.reduce((m, s) => Math.max(m, s.inner - s.outer), 0);
    if (drop < 0.85) continue;
    const r = R.fork('r' + n++);
    if (drop < 1.6 && r.chance(0.3)) continue;                                    // some low drops stay bare
    const style = r.pick(['pipe', 'pipe', 'pipe', 'parapet', 'parapet', 'brick']);
    const mat = r.pick(['galvanised', 'iron_green', 'iron_blue', 'iron_black']);
    const tint = style === 'brick' ? 'brick_red_solid' : 'plaster_rough#' + r.pick(['d8cdb8', 'cfc3ad', 'e3d9c6', 'c9bfae']);
    // resample the crest every ~1.5 m
    const pts = []; let acc = 1e9;
    for (let i = 0; i < run.S.length; i++) {
      const s = run.S[i];
      if (i) acc += Math.hypot(s.x - run.S[i - 1].x, s.z - run.S[i - 1].z);
      if (acc >= 1.5 || i === run.S.length - 1) { acc = 0; pts.push(s); }
    }
    const P = (s) => [s.x - s.nx * 0.12, s.inner, s.z - s.nz * 0.12];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = P(pts[i]), c = P(pts[i + 1]);
      if (!K.occ.clear(a[0], a[2], 0.2, OCC.DOOR | OCC.STAIR) || !K.occ.clear(c[0], c[2], 0.2, OCC.DOOR | OCC.STAIR)) continue;
      const b = K.b('rails', a[0], a[2], { cast: false });
      if (style === 'pipe') {
        tube(b, mat, a, [a[0], a[1] + 1.0, a[2]], 0.025, 0.025, 5, { col: W, caps: true });
        tube(b, mat, [a[0], a[1] + 1.0, a[2]], [c[0], c[1] + 1.0, c[2]], 0.022, 0.022, 5, { col: W, caps: false });
        tube(b, mat, [a[0], a[1] + 0.5, a[2]], [c[0], c[1] + 0.5, c[2]], 0.016, 0.016, 4, { col: W, caps: false });
        if (i + 2 === pts.length) tube(b, mat, c, [c[0], c[1] + 1.0, c[2]], 0.025, 0.025, 5, { col: W, caps: true });
      } else {
        const L = Math.hypot(c[0] - a[0], c[2] - a[2]), ry = Math.atan2(-(c[2] - a[2]), c[0] - a[0]), mx = (a[0] + c[0]) / 2, mz = (a[2] + c[2]) / 2, my = (a[1] + c[1]) / 2;
        b.box(tint, mx, my + 0.4, mz, L + 0.02, 0.8, 0.2, { ry, col: W });
        b.box('concrete_bare', mx, my + 0.83, mz, L + 0.04, 0.07, 0.3, { ry, col: W });
      }
      stats.rails += Math.hypot(c[0] - a[0], c[2] - a[2]);
    }
  }
}

// ---------------------------------------------------------------------------------------------------- benches
function bench(K, x, z, ry, back) {
  const y = K.H(x, z), at = localToWorld(x, z, ry), b = K.b('benches', x, z, { cast: false }), conc = rgb(0xc4beb2);
  for (const sx of [-0.78, 0.78]) { const [px, pz] = at(sx, 0); b.box('concrete_bare', px, y + 0.22, pz, 0.12, 0.44, 0.46, { ry, col: conc }); }
  for (let i = 0; i < 4; i++) { const [px, pz] = at(0, -0.17 + i * 0.115); b.box(BENCH_WOOD, px, y + 0.465, pz, 1.72, 0.045, 0.1, { ry, col: W }); }
  if (back) {
    for (let i = 0; i < 2; i++) { const [px, pz] = at(0, -0.26); b.box(BENCH_WOOD, px, y + 0.68 + i * 0.15, pz, 1.72, 0.11, 0.04, { ry, col: W }); }
    for (const sx of [-0.78, 0.78]) { const [px, pz] = at(sx, -0.26); b.box('concrete_bare', px, y + 0.6, pz, 0.12, 0.4, 0.06, { ry, col: conc }); }
  }
  // thin end-cap colliders only: the seat stays open so a person can walk up to it and sit
  for (const sx of [-0.8, 0.8]) { const [px, pz] = at(sx, -0.1); K.rect(px, pz, 0.12, 0.5, ry, 0.9, y, 0.02); }
}

function benches(K, stats) {
  const drop = new Set();
  for (const p of K.plan.pois) {
    if (p.kind !== 'bench' || (p.tags ?? []).includes('busstop')) continue;
    if (!K.occ.clear(p.x, p.z, 0.5, OCC.STAIR | OCC.DOOR | OCC.ROAD) || K.occ.overlaps(p.x, p.z, 0.45)) { drop.add(p); continue; }
    bench(K, p.x, p.z, p.ry, true);
    K.occ.take(p.x, p.z, 0.55); stats.benches++;
  }
  // a seat POI with no bench behind it would have people sitting in the air: withdraw it (the people stage reads plan.pois later)
  if (drop.size) { K.plan.pois = K.plan.pois.filter((p) => !drop.has(p)); stats.benchPoisDropped = drop.size; }
}

// ---------------------------------------------------------------------------------------------------- bus shelter
function busShelter(K, stats) {
  const poi = K.plan.pois.find((p) => (p.tags ?? []).includes('busstop') && p.kind === 'bench');
  if (!poi) return;
  const ry = poi.ry, y = K.H(poi.x, poi.z), at = localToWorld(poi.x, poi.z, ry), b = K.b('feature', poi.x, poi.z);
  const posts = [[-1.7, -0.7], [1.7, -0.7], [-1.7, 0.7], [1.7, 0.7]];
  for (const [lx, lz] of posts) { const [x, z] = at(lx, lz); if (!K.occ.clear(x, z, 0.15, OCC.ROAD | OCC.LOT)) return; }
  const BLUE = rgb(0x2c4f86);
  for (const [lx, lz] of posts) {
    const [x, z] = at(lx, lz); tube(b, 'iron_blue', [x, y, z], [x, y + 2.5, z], 0.045, 0.045, 6, { col: W });
    K.post(x, z, 0.06, 2.5, y);
  }
  const [rx, rz] = at(0, 0.0);
  b.box('corrugated_zinc', rx, y + 2.56, rz, 3.9, 0.06, 1.7, { ry, col: [0.82, 0.84, 0.86] });
  b.box('iron_blue', rx, y + 2.46, rz, 3.7, 0.06, 1.5, { ry, col: BLUE });
  const [bx, bz] = at(0, -0.7);                                   // back glass panel + frame
  b.box('glass_dark', bx, y + 1.3, bz, 3.4, 1.7, 0.03, { ry, col: W });
  b.box('iron_blue', bx, y + 0.42, bz, 3.4, 0.07, 0.06, { ry, col: BLUE }); b.box('iron_blue', bx, y + 2.18, bz, 3.4, 0.07, 0.06, { ry, col: BLUE });
  const [lx2, lz2] = at(-1.7, 0.0);                               // side panel on the left
  b.box('glass_dark', lx2, y + 1.3, lz2, 0.03, 1.7, 1.3, { ry, col: W });
  bench(K, poi.x, poi.z, ry, false);
  K.rect(bx, bz, 3.4, 0.06, ry, 2.2, y); K.rect(lx2, lz2, 0.06, 1.3, ry, 2.2, y);
  K.occ.take(rx, rz, 2.2); stats.shelters++;
  K.ctx.world.busShelter = { x: poi.x, y, z: poi.z, ry };
}

// ---------------------------------------------------------------------------------------------------- the Virgin's shrine
function shrine(K, stats) {
  const pl = K.plan.plazas.find((p) => p.id === 'P1') ?? K.plan.plazas.find((p) => p.kind === 'plaza'); if (!pl) return;
  // the plaza edge whose outside ground is highest: the shrine leans against that retaining wall
  let best = null;
  const n = pl.poly.length;
  for (let i = 0; i < n; i++) {
    const a = pl.poly[i], c = pl.poly[(i + 1) % n], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (l < 6) continue;
    let nx = -(c[1] - a[1]) / l, nz = (c[0] - a[0]) / l;
    if (nx * ((a[0] + c[0]) / 2 - pl.cx) + nz * ((a[1] + c[1]) / 2 - pl.cz) < 0) { nx = -nx; nz = -nz; }
    for (const t of [0.5, 0.42, 0.58, 0.34, 0.66]) {
      const ex = a[0] + (c[0] - a[0]) * t, ez = a[1] + (c[1] - a[1]) * t, up = K.H(ex + nx * 1.4, ez + nz * 1.4) - pl.y;
      const px = ex - nx * 0.4, pz = ez - nz * 0.4;
      if (!K.occ.clear(px, pz, 1.0, OCC.STAIR | OCC.DOOR) || K.occ.overlaps(px, pz, 1.1)) continue;
      if (!best || up > best.up + 0.05) best = { x: px, z: pz, nx, nz, up };
      break;
    }
  }
  if (!best) return;
  const ry = Math.atan2(-best.nx, -best.nz), P = localToWorld(best.x, best.z, ry), y = pl.y, b = K.b('feature', best.x, best.z);
  const box = (mat, lx, ly, lz, sx, sy, sz) => { const [x, z] = P(lx, lz); b.box(mat, x, y + ly, z, sx, sy, sz, { ry, col: W }); };
  if (!K.ctx.clutter?.fit('clutter_shrine', best.x, y, best.z, ry, [1.9, 3.5, 0.95], { scene: 'plaza' })) {
    box('stone_wall', 0, 0.275, 0, 1.9, 0.55, 0.8);                                // plinth
    box('plaster_a#f1ece0', 0, 1.7, -0.275, 1.5, 2.3, 0.25);                       // white wall behind
    box('plaster_a#9fc4e8', 0, 1.375, -0.14, 0.95, 1.65, 0.03);                    // blue niche
    { const [x, z] = P(0, -0.14), [x2, z2] = P(0, -0.125); tube(b, 'plaster_a#9fc4e8', [x, y + 2.2, z], [x2, y + 2.2, z2], 0.475, 0.475, 14, { col: W }); }
    box('plaster_a#f1ece0', 0.84, 0.95, -0.02, 0.16, 0.8, 0.5); box('plaster_a#f1ece0', -0.84, 0.95, -0.02, 0.16, 0.8, 0.5);   // low wings
    box('roof_tile_clay', 0, 2.95, -0.1, 2.1, 0.12, 0.95);                          // roof
    box('plaster_a#f1ece0', 0, 3.1, -0.1, 0.1, 0.22, 0.1);
    box('iron_black', 0, 3.38, -0.1, 0.05, 0.4, 0.05); box('iron_black', 0, 3.45, -0.1, 0.26, 0.05, 0.05);   // little iron cross
    // statue on a pedestal: robe, blue mantle, head, gold halo
    box('plaster_a#e8e2d4', 0, 0.68, -0.04, 0.5, 0.26, 0.34);
    {
      const [x, z] = P(0, -0.04), top = y + 0.81;
      b.cyl('plaster_a#f5f2ea', x, top, z, 0.24, 0.8, 10, { r1: 0.085, col: W });
      b.cyl('plaster_a#6f93c9', x, top + 0.04, z, 0.255, 0.62, 10, { r1: 0.11, col: W });
      b.cyl('plaster_a#e8c8a8', x, top + 0.78, z, 0.07, 0.15, 8, { col: W });
      const [h0x, h0z] = P(0, -0.1), [h1x, h1z] = P(0, -0.09);
      tube(b, 'gold', [h0x, top + 0.9, h0z], [h1x, top + 0.9, h1z], 0.19, 0.19, 14, { col: W });
    }
    // iron grille in front of the niche, candles and flowers on the ledge
    for (let i = -6; i <= 6; i++) { const [x, z] = P(i * 0.14, 0.34); tube(b, 'iron_black', [x, y + 0.55, z], [x, y + 1.85, z], 0.011, 0.011, 4, { col: W, caps: false }); }
    box('iron_black', 0, 1.85, 0.34, 1.7, 0.03, 0.03); box('iron_black', 0, 0.6, 0.34, 1.7, 0.03, 0.03); box('iron_black', 0, 1.2, 0.34, 1.7, 0.02, 0.02);
    for (let i = 0; i < 6; i++) {
      const [x, z] = P(-0.62 + i * 0.25, 0.2); b.cyl('candle_wax', x, y + 0.55, z, 0.024, 0.12 + (i % 3) * 0.03, 6, { col: W });
      b.cyl('candle_flame', x, y + 0.67 + (i % 3) * 0.03, z, 0.009, 0.03, 4, { col: W });
    }
    for (const sx of [-0.7, 0.7]) {
      const [x, z] = P(sx, 0.16);
      b.cyl('plaster_a#d8d0c0', x, y + 0.55, z, 0.07, 0.2, 8, { r1: 0.05, col: W });
      shrub(K, x, z, { rng: K.rng('shrine:' + sx), size: 0.4, flowers: true, dy: 0.7, cards: 4, tile: TILE.FLOWERS, leaf: rgb(0xffffff) });
    }
    { const [x, z] = P(0, 0.62); b.box('stone_wall', x, y + 0.04, z, 1.3, 0.08, 0.3, { ry, col: W }); }   // a step to kneel on
  }
  K.rect(...P(0, 0), 1.9, 0.8, ry, 3.0, y); K.occ.take(...P(0, 0.1), 1.3);
  const [lx, lz] = P(0, 0.5);
  K.ctx.lights.add({ x: lx, y: y + 1.0, z: lz, color: 0xffb060, intensity: 3.2, distance: 6, kind: 'candle', flicker: 0.5 });
  K.ctx.world.shrine = { x: best.x, y, z: best.z, ry, front: P(0, 1.3), plaza: pl.id };
  stats.shrine = 1;
}

// ---------------------------------------------------------------------------------------------------- court: chain-link fence + goals
function court(K, stats) {
  const pl = K.plan.plazas.find((p) => p.kind === 'court'); if (!pl) return;
  const P = localToWorld(pl.cx, pl.cz, pl.ry), hw = pl.w / 2, hd = pl.d / 2, y = pl.y, H = 3.2, exits = exitsOf(K, pl);
  // a cut bank on the north side: the fence sits on top of the retaining wall there
  const nx = Math.sin(pl.ry), nz = -Math.cos(pl.ry);                      // local -z in world
  const cutN = K.H(pl.cx + nx * (hd + 2.4), pl.cz + nz * (hd + 2.4)) - K.H(pl.cx + nx * (hd - 0.2), pl.cz + nz * (hd - 0.2)) > 0.4;
  const zn = cutN ? -(hd + PLAZA_BAND + 0.15) : -(hd - 0.3);
  const corners = [[-(hw - 0.3), zn], [hw - 0.3, zn], [hw - 0.3, hd - 0.3], [-(hw - 0.3), hd - 0.3]];
  const fence = K.one('fence', { cast: false });
  const post = K.b('feature', pl.cx, pl.cz);
  for (let e = 0; e < 4; e++) {
    const A = P(...corners[e]), C = P(...corners[(e + 1) % 4]), L = Math.hypot(C[0] - A[0], C[1] - A[1]), steps = Math.max(2, Math.ceil(L / 1.0));
    const pt = (t) => [A[0] + (C[0] - A[0]) * t, A[1] + (C[1] - A[1]) * t];
    let t0 = null, tl = null;
    const closeRun = () => {
      if (t0 == null) return;
      const [x1, z1] = pt(t0), [x2, z2] = pt(tl), l = Math.hypot(x2 - x1, z2 - z1);
      if (l > 0.4) {
        const y1 = K.H(x1, z1), y2 = K.H(x2, z2);
        fence.quad('fence_mesh', [x1, y1, z1], [x2, y2, z2], [x2, y2 + H, z2], [x1, y1 + H, z1], { uv: [0, 0, l / 0.4, 0, l / 0.4, H / 0.4, 0, H / 0.4], col: W });
        const np = Math.max(1, Math.round(l / 3));
        for (let k = 0; k <= np; k++) { const px = x1 + ((x2 - x1) * k) / np, pz = z1 + ((z2 - z1) * k) / np, py = K.H(px, pz); tube(post, 'galvanised', [px, py - 0.1, pz], [px, py + H + 0.18, pz], 0.045, 0.045, 6, { col: W }); }
        tube(post, 'galvanised', [x1, y1 + H + 0.05, z1], [x2, y2 + H + 0.05, z2], 0.025, 0.025, 5, { col: W, caps: false });
        tube(post, 'galvanised', [x1, y1 + 0.12, z1], [x2, y2 + 0.12, z2], 0.02, 0.02, 4, { col: W, caps: false });
        K.seg(x1, z1, x2, z2, H, 0.05, Math.min(y1, y2));
        stats.fenceM += l;
      }
      t0 = null;
    };
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, [x, z] = pt(t);
      if (exits(x, z)) closeRun();
      else { if (t0 == null) t0 = t; tl = t; }
    }
    closeRun();
  }
  // futsal goals at both ends: posts, crossbar, a back net of the same mesh
  const gw = 3.0, gh = 2.0, gd = 0.8, bf = K.b('feature', pl.cx, pl.cz);
  for (const sgn of [-1, 1]) {
    const g = (lz, depth) => P(sgn * (hw - 1.5 + depth), lz);
    const [a1x, a1z] = g(-gw / 2, 0), [a2x, a2z] = g(gw / 2, 0), [b1x, b1z] = g(-gw / 2, gd), [b2x, b2z] = g(gw / 2, gd);
    for (const [px, pz] of [[a1x, a1z], [a2x, a2z]]) tube(bf, 'galvanised', [px, y, pz], [px, y + gh, pz], 0.05, 0.05, 6, { col: W });
    tube(bf, 'galvanised', [a1x, y + gh, a1z], [a2x, y + gh, a2z], 0.05, 0.05, 6, { col: W });
    for (const [ax, az, bx, bz] of [[a1x, a1z, b1x, b1z], [a2x, a2z, b2x, b2z]]) tube(bf, 'galvanised', [ax, y + gh, az], [bx, y + 0.25, bz], 0.02, 0.02, 4, { col: W, caps: false });
    fence.quad('fence_mesh', [a1x, y + gh, a1z], [a2x, y + gh, a2z], [b2x, y + 0.25, b2z], [b1x, y + 0.25, b1z], { uv: [0, 0, 7.5, 0, 7.5, 5, 0, 5], col: W });
    fence.quad('fence_mesh', [b1x, y + 0.25, b1z], [b2x, y + 0.25, b2z], [b2x, y, b2z], [b1x, y, b1z], { uv: [0, 0, 7.5, 0, 7.5, 0.6, 0, 0.6], col: W });
    for (const [px, pz] of [[a1x, a1z], [a2x, a2z]]) K.post(px, pz, 0.06, gh, y);
  }
  K.ctx.world.court = { x: pl.cx, z: pl.cz, y, w: pl.w, d: pl.d };
  stats.court = 1;
}

// ---------------------------------------------------------------------------------------------------- the viewpoint
function mirador(K, stats) {
  const pl = K.plan.plazas.find((p) => p.kind === 'mirador'); if (!pl) return;
  const P = localToWorld(pl.cx, pl.cz, pl.ry), hw = pl.w / 2, hd = pl.d / 2, y = pl.y, exits = exitsOf(K, pl);
  const b = K.b('feature', pl.cx, pl.cz), zS = hd - 0.22;
  // balustrade along the south edge (the view): low parapet, pillars every ~3 m, open where a path crosses
  const x0 = -hw + 0.25, x1 = hw - 0.25, nP = Math.max(2, Math.round((x1 - x0) / 3.2)), step = (x1 - x0) / nP;
  const wallMat = 'plaster_rough#e3d9c6';
  for (let i = 0; i < nP; i++) {
    const xa = x0 + i * step + 0.2, xb = x0 + (i + 1) * step - 0.2, [wxA, wzA] = P(xa, zS), [wxB, wzB] = P(xb, zS);
    if (exits(wxA, wzA, 1.3) || exits(wxB, wzB, 1.3) || exits((wxA + wxB) / 2, (wzA + wzB) / 2, 1.3)) continue;
    const [mx, mz] = P((xa + xb) / 2, zS), L = xb - xa;
    b.box(wallMat, mx, y + 0.45, mz, L, 0.9, 0.22, { ry: pl.ry, col: W });
    b.box('concrete_bare', mx, y + 0.93, mz, L + 0.06, 0.07, 0.34, { ry: pl.ry, col: W });
    K.seg(wxA, wzA, wxB, wzB, 1.1, 0.12, y);
  }
  for (let i = 0; i <= nP; i++) {
    const [px, pz] = P(x0 + i * step, zS);
    if (exits(px, pz, 1.0)) continue;
    b.box(wallMat, px, y + 0.6, pz, 0.38, 1.2, 0.38, { ry: pl.ry, col: W });
    b.box('concrete_bare', px, y + 1.25, pz, 0.5, 0.1, 0.5, { ry: pl.ry, col: W });
    b.cyl('plaster_a#f1ece0', px, y + 1.3, pz, 0.12, 0.1, 8, { col: W });
    K.post(px, pz, 0.2, 1.3, y);
  }
  // coin-operated telescope on a post
  const [tx, tz] = P(hw - 2.2, hd - 1.3);
  if (K.occ.clear(tx, tz, 0.4, OCC.STAIR | OCC.DOOR) && !K.occ.overlaps(tx, tz, 0.5)) {
    tube(b, 'iron_green', [tx, y, tz], [tx, y + 1.2, tz], 0.075, 0.055, 8, { col: W });
    b.cyl('iron_green', tx, y + 1.2, tz, 0.1, 0.08, 8, { col: W });
    const ax = Math.sin(pl.ry), az = Math.cos(pl.ry);             // pointing south, over the barrio
    tube(b, 'iron_green', [tx - ax * 0.3, y + 1.38, tz - az * 0.3], [tx + ax * 0.32, y + 1.34, tz + az * 0.32], 0.07, 0.05, 8, { col: W });
    tube(b, 'chrome', [tx + ax * 0.32, y + 1.34, tz + az * 0.32], [tx + ax * 0.5, y + 1.32, tz + az * 0.5], 0.052, 0.052, 8, { col: W });
    tube(b, 'chrome', [tx - ax * 0.3, y + 1.38, tz - az * 0.3], [tx - ax * 0.42, y + 1.4, tz - az * 0.42], 0.035, 0.035, 8, { col: W });
    K.post(tx, tz, 0.16, 1.6, y); K.occ.take(tx, tz, 0.5);
    K.ctx.world.telescope = { x: tx, y: y + 1.35, z: tz };
  }
  // public payphone on a post, where the phone POI stands in front of it
  const ph = K.plan.pois.find((p) => p.kind === 'phone');
  if (ph) {
    const fx = Math.sin(ph.ry), fz = Math.cos(ph.ry), px = ph.x + fx * 0.7, pz = ph.z + fz * 0.7, gy = K.H(px, pz), pry = ph.ry + Math.PI, at = localToWorld(px, pz, pry);
    tube(b, 'iron_black', [px, gy, pz], [px, gy + 1.5, pz], 0.04, 0.04, 6, { col: W });
    const [bx, bz] = at(0, 0.03);
    b.box('iron_blue', bx, gy + 1.38, bz, 0.34, 0.5, 0.22, { ry: pry, col: W });
    const [sx, sz] = at(0, 0.15);
    b.box('light_head', sx, gy + 1.48, sz, 0.16, 0.12, 0.02, { ry: pry, col: [0.9, 0.95, 0.85] });      // little display
    b.box('iron_black', sx, gy + 1.3, sz, 0.2, 0.14, 0.03, { ry: pry, col: W });                        // keypad
    const [hx, hz] = at(-0.2, 0.06);
    b.box('iron_black', hx, gy + 1.38, hz, 0.06, 0.28, 0.07, { ry: pry, col: W });                      // handset
    const [ox, oz] = at(0, -0.02);
    b.box('iron_blue', ox, gy + 1.7, oz, 0.5, 0.05, 0.38, { ry: pry, col: W });                         // hood
    K.post(px, pz, 0.16, 1.9, gy);
    K.ctx.world.payphone = { x: px, y: gy + 1.4, z: pz };
  }
  stats.mirador = 1;
}

// ---------------------------------------------------------------------------------------------------- the public wash-basin
function pila(K, stats) {
  const pl = K.plan.plazas.find((p) => p.id === 'P2') ?? K.plan.plazas.find((p) => p.kind === 'plaza'); if (!pl) return;
  const P = localToWorld(pl.cx, pl.cz, pl.ry), hd = pl.d / 2;
  for (const lx of [-1.5, 0, -3, 1.5, 3, -4.5, 4.5]) {
    const [x, z] = P(lx, -hd + 0.62);                                  // against the north edge, facing into the plaza
    if (!pointInPoly(pl.poly, x, z) || !K.occ.clear(x, z, 0.7, OCC.STAIR | OCC.DOOR | OCC.ROAD) || K.occ.overlaps(x, z, 1.0) || K.occ.navDist(x, z) < 0.85) continue;
    const y = K.H(x, z), at = localToWorld(x, z, pl.ry), b = K.b('feature', x, z), ry = pl.ry;
    const box = (mat, a, c, d, sx, sy, sz, col = W) => { const [wx, wz] = at(a, d); b.box(mat, wx, y + c, wz, sx, sy, sz, { ry, col }); };
    box('concrete_bare', 0, 0.3, 0, 1.3, 0.6, 0.6);                      // the trough
    box('glass_dark', 0, 0.605, 0.02, 1.0, 0.02, 0.38);                   // dark water
    box('plaster_rough#d5cdbb', 0, 1.1, -0.38, 1.4, 1.0, 0.16);           // back wall
    box('concrete_bare', 0, 1.64, -0.38, 1.5, 0.08, 0.26);                // coping
    { const [x0, z0] = at(0, -0.3), [x1, z1] = at(0, -0.1); tube(b, 'galvanised', [x0, y + 1.1, z0], [x1, y + 1.1, z1], 0.018, 0.018, 6, { col: W });
      tube(b, 'galvanised', [x1, y + 1.1, z1], [x1, y + 0.96, z1], 0.018, 0.018, 6, { col: W });
      b.cyl('iron_blue', x0 + (x1 - x0) * 0.5, y + 1.12, z0 + (z1 - z0) * 0.5, 0.03, 0.07, 6, { col: W }); }
    { const [bx, bz] = at(0.85, 0.5); b.cyl('plastic_bin', bx, y, bz, 0.15, 0.3, 10, { r1: 0.19, col: rgb(0x2e6ab0) }); }
    K.rect(x, z, 1.4, 0.7, ry, 1.6, y); K.occ.take(x, z, 1.0);
    K.ctx.world.pila = { x, y, z };
    stats.pila = 1;
    return;
  }
}

// ---------------------------------------------------------------------------------------------------- the lit summit cross
function cross(K, stats) {
  // a free spot near the crest, west of the viewpoint: visible from every street, lit all night
  let spot = null;
  for (const [dx, dz] of [[0, 0], [-3, 0], [3, 0], [0, 3], [-6, 2], [5, 3], [-9, 3]]) {
    const x = 9 + dx, z = -93.5 + dz;
    if (K.occ.clear(x, z, 2.4, OCC.ROAD | OCC.PLAZA | OCC.LOT | OCC.STAIR | OCC.STEEP) && !K.occ.overlaps(x, z, 2.4)) { spot = [x, z]; break; }
  }
  if (!spot) return;
  const [x, z] = spot, y = K.H(x, z), b = K.b('feature', x, z);
  b.box('concrete_bare', x, y + 0.2, z, 3.2, 0.4, 3.2, { col: W });
  b.box('concrete_bare', x, y + 0.6, z, 2.2, 0.4, 2.2, { col: W });
  b.box('plaster_rough#e9e4d8', x, y + 3.5, z, 0.46, 5.8, 0.34, { col: W });
  b.box('plaster_rough#e9e4d8', x, y + 4.7, z, 2.8, 0.4, 0.34, { col: W });
  for (const s of [-1, 1]) {                                                                         // glowing strips on both faces
    b.box('lamp_glow_cool', x, y + 3.5, z + s * 0.18, 0.14, 5.5, 0.02, { skip: ['nx', 'px', 'py', 'ny', s > 0 ? 'nz' : 'pz'], col: W });
    b.box('lamp_glow_cool', x, y + 4.7, z + s * 0.18, 2.5, 0.14, 0.02, { skip: ['nx', 'px', 'py', 'ny', s > 0 ? 'nz' : 'pz'], col: W });
  }
  K.rect(x, z, 2.2, 2.2, 0, 1.0, y); K.occ.take(x, z, 2.4);
  K.ctx.lights.add({ x, y: y + 4.7, z: z + 1.4, color: 0xeaf2ff, intensity: 18, distance: 20, kind: 'street' });
  K.ctx.world.cross = { x, y, z };
  stats.cross = 1;
}

export function buildDress(K) {
  const stats = { rails: 0, benches: 0, shelters: 0, shrine: 0, fenceM: 0, court: 0, mirador: 0, cross: 0, planters: 0, rings: 0 };
  K.ctx.world.dress = stats;
  for (const f of [railings, benches, busShelter, shrine, court, mirador, pila, cross]) {
    try { f(K, stats); } catch (e) { console.error(`[dress.${f.name}]`, e); K.ctx.errors?.push({ stage: 'props', item: 'dress.' + f.name, message: String(e?.message ?? e), stack: e?.stack }); }
  }
  return stats;
}

// ---------------------------------------------------------------------------------------------------- planters (after the flora)
export function buildPlanters(K) {
  const stats = K.ctx.world.dress ?? {}, R = K.rng('planters');
  for (const [x, z, spec] of K.ctx.world.plazaTrees ?? []) {                  // a raised stone ring around each plaza tree
    const y = K.H(x, z), b = K.b('benches', x, z, { cast: false }), r = spec === 'palm' ? 0.55 : 0.65;
    b.cyl('stone_wall', x, y - 0.05, z, r, 0.42, 10, { col: W });
    b.cyl('ground_dirt', x, y + 0.36, z, r - 0.1, 0.03, 10, { col: [0.55, 0.5, 0.45] });
    stats.rings++;
  }
  for (const pl of K.plan.plazas) {
    if (pl.kind !== 'plaza') continue;
    const P = localToWorld(pl.cx, pl.cz, pl.ry), hw = pl.w / 2 - 0.55, hd = pl.d / 2 - 0.55;
    for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) {
      const [x, z] = P(lx, lz);
      if (!pointInPoly(pl.poly, x, z) || !K.occ.clear(x, z, 0.6, OCC.STAIR | OCC.DOOR | OCC.ROAD) || K.occ.overlaps(x, z, 0.9)) continue;
      const y = K.H(x, z), b = K.b('benches', x, z, { cast: false });
      b.box('plaster_rough#e8dcc4', x, y + 0.23, z, 0.85, 0.46, 0.85, { ry: pl.ry, col: W });
      b.box('ground_dirt', x, y + 0.465, z, 0.7, 0.02, 0.7, { ry: pl.ry, col: [0.5, 0.45, 0.4], skip: ['ny'] });
      shrub(K, x, z, { rng: R.fork('p' + stats.planters), size: 0.8, flowers: true, dy: 0.46, cards: 5 });
      K.rect(x, z, 0.85, 0.85, pl.ry, 0.5, y, 0.02); K.occ.take(x, z, 0.8);
      stats.planters++;
    }
  }
}
