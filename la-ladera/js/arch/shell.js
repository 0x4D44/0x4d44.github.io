// buildBuilding: the architectural shell as real meshes (walls with reveals, floors, ceilings, thresholds, slab edges, foundations),
// composed from the plan's wall records. Stairs, windows, roofs and door leaves live in their own modules. Everything is authored in
// building-local coordinates and placed by MeshBuilder.setBasePose. Tints are vertex colours so each material is ONE mesh per building.
import { rectMinusRects } from './geom.js';
import { roomFinish, facadeStyle } from './finish.js';
import { lin, mulc, mixc, prod, faceQuad, flat, qd, hash01, OUT } from './mb.js';
import { CASETA_H, CASETA_T, PRETIL_H } from './roof.js';
import { makeRoofModel, buildRoof } from './shellroof.js';
import { buildWindows, buildDoorFrames, buildEntrySteps } from './shellwin.js';
import { buildStairs } from './shellstair.js';
import { buildDoorLeaves } from './doors.js';
import { buildFacade } from './shellfacade.js';
import { ensureSignAtlas } from './signs.js';

const FOUND_COL = lin(0xb9b5ab);

/** Cut [fa,fb] into columns at opening edges and extra breakpoints; each column is inside one opening or none. */
export function columns(fa, fb, holes, extra = []) {
  const pts = new Set([fa, fb]);
  for (const h of holes) { if (h.u0 > fa && h.u0 < fb) pts.add(h.u0); if (h.u1 > fa && h.u1 < fb) pts.add(h.u1); }
  for (const e of extra) if (e > fa + 1e-4 && e < fb - 1e-4) pts.add(e);
  const us = [...pts].sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < us.length; i++) {
    const ua = us[i], ub = us[i + 1];
    if (ub - ua < 1e-4) continue;
    const mid = (ua + ub) / 2;
    out.push({ ua, ub, hole: holes.find((h) => mid > h.u0 && mid < h.u1) ?? null });
  }
  return out;
}

/** Split [lo, hiA..hiB] at the (ascending) constant heights `cuts`; calls emit(y0, y1a, y1b). Cuts above the lower top are ignored. */
function bands(lo, hiA, hiB, cuts, emit) {
  const mn = Math.min(hiA, hiB);
  let cur = lo;
  for (const c of cuts) { if (c <= cur + 1e-3 || c >= mn - 1e-3) continue; emit(cur, c, c); cur = c; }
  if (Math.max(hiA, hiB) - cur > 1e-3) emit(cur, hiA, hiB);
}

export function makeG(ctx, bp) {
  const S = bp.shell, lot = bp.lot;
  const b = ctx.batch.builder(bp.id + '.ext');
  b.setBasePose(lot.x, lot.y, lot.z, lot.rotY);
  b.uvOff = [hash01(bp.id, 1) * 7, hash01(bp.id, 2) * 7];
  const byId = new Map(bp.rooms.map((r) => [r.id, r]));
  const G = { ctx, bp, S, b, lot, byId, fs: facadeStyle(bp), fins: new Map(), cells: [], winById: new Map(bp.windows.map((w) => [w.id, w])), doorById: new Map(bp.doors.map((d) => [d.id, d])) };
  G.fin = (room) => { if (!room) return G.defFin ??= roomFinish({ id: 'none', type: 'hall', finish: {} }, bp); let f = G.fins.get(room.id); if (!f) G.fins.set(room.id, f = roomFinish(room, bp)); return f; };
  for (let k = 0; k <= S.F; k++) {
    const fd = S.floorsData[k], cells = [];
    for (const id of fd.rooms) { const r = byId.get(id); cells.push({ rect: r.rect, room: r, void: false }); }
    for (const v of fd.voids) cells.push({ rect: v.rect, room: byId.get(v.owner) ?? null, void: true });
    G.cells.push(cells);
  }
  G.y = (k) => k * S.fh;
  return G;
}

// ---- exterior face --------------------------------------------------------------------------------------------------------------
function outerFace(G, wl) {
  const { S, b, fs } = G, k = wl.floor, yk = k * S.fh, s = OUT[wl.side], t = wl.t, plane = wl.at + s * t / 2, caseta = !!wl.caseta;
  const top = (u) => (caseta ? yk + CASETA_H : wl.open ? yk + PRETIL_H : k === S.F - 1 ? G.rm.wallTop(wl, u) : yk + S.fh);
  const yBot = caseta ? yk : k === 0 ? S.foundY : yk;
  const holes = wl.openings.map((o) => ({ u0: o.u0, u1: o.u1, y0: yk + o.y0, y1: yk + o.y1 }));
  const wallCol = caseta ? mulc(fs.wall, 0.96) : fs.wall;
  const m = caseta ? 'plaster_rough' : fs.m;
  const cuts = k === 0 && !caseta ? [0.0, 0.5, 0.95] : [];
  const damp = (y) => { if (caseta || k > 0) return 1; const h = y; return h <= 0 ? 1 : 0.55 + 0.45 * Math.min(1, h / 0.95); };
  // a "peeling" facade peels where paint really fails first, at the foot of the wall; above 0.95 m it is plain rough-cast (the full-height texture reads as camouflage)
  const mAt = (y0) => (m === 'paint_peeling' && (k > 0 || y0 >= 0.95 - 1e-3) ? 'plaster_rough' : m);
  columns(wl.a0, wl.a1, holes, G.rm.breaks(wl)).forEach((c, ci) => {
    const jit = 0.94 + 0.06 * hash01(wl.id, ci);
    const solids = [];
    if (!c.hole) solids.push([yBot, top(c.ua), top(c.ub)]);
    else {
      if (c.hole.y0 > yBot + 1e-3) solids.push([yBot, c.hole.y0, c.hole.y0]);
      solids.push([c.hole.y1, top(c.ua), top(c.ub)]);
    }
    for (const [lo0, hiA, hiB] of solids) {
      bands(lo0, hiA, hiB, cuts, (y0, y1a, y1b) => {
        if (k === 0 && !caseta && y1a <= 1e-3 && y1b <= 1e-3) {      // below the ground-floor level: raw concrete foundation
          faceQuad(b, 'concrete_bare', wl.dir, plane, s, c.ua, c.ub, y0, y0, y1a, y1b, { col: mulc(FOUND_COL, jit) });
          return;
        }
        const f0 = damp(y0) * jit, f1 = damp(Math.min(y1a, y1b)) * jit;
        faceQuad(b, mAt(y0), wl.dir, plane, s, c.ua, c.ub, y0, y0, y1a, y1b, { cols: [mulc(wallCol, f0), mulc(wallCol, f0), mulc(wallCol, f1), mulc(wallCol, f1)] });
      });
    }
  });
}

// ---- interior faces -------------------------------------------------------------------------------------------------------------
function faceCells(G, k, wl, plane, side) {
  const out = [];
  for (const c of G.cells[k]) {
    const r = c.rect;
    const adj = wl.dir === 'x' ? (side > 0 ? Math.abs(r.z0 - plane) < 0.03 : Math.abs(r.z1 - plane) < 0.03) : (side > 0 ? Math.abs(r.x0 - plane) < 0.03 : Math.abs(r.x1 - plane) < 0.03);
    if (adj) out.push({ c, lo: wl.dir === 'x' ? r.x0 : r.z0, hi: wl.dir === 'x' ? r.x1 : r.z1 });
  }
  return out;
}

function innerFace(G, wl, side) {
  const { S, b, fs } = G, k = wl.floor, yk = k * S.fh, t = wl.t, plane = wl.at + side * t / 2, caseta = !!wl.caseta;
  let fa = wl.a0, fb = wl.a1;
  if (wl.ext) { const inset = caseta && (wl.side === 'west' || wl.side === 'east') ? 0 : t; fa += inset; fb -= inset; }
  if (fb - fa < 1e-3) return;
  const cells = faceCells(G, k, wl, plane, side);
  const holes = wl.openings.map((o) => ({ u0: o.u0, u1: o.u1, y0: yk + o.y0, y1: yk + o.y1 }));
  const cuts = []; for (const q of cells) { cuts.push(q.lo, q.hi); }
  columns(fa, fb, holes, cuts).forEach((c, ci) => {
    const mid = (c.ua + c.ub) / 2, q = cells.find((e) => mid >= e.lo && mid <= e.hi);
    const room = q?.c.room ?? null;
    const hh = caseta ? CASETA_H : wl.open ? PRETIL_H : (room?.h ?? S.h);
    const jit = 0.97 + 0.03 * hash01(wl.id, ci + 50 * (side > 0 ? 1 : 2));
    const solids = [];
    if (!c.hole) solids.push([yk, yk + hh]);
    else {
      if (c.hole.y0 > yk + 1e-3) solids.push([yk, c.hole.y0]);
      if (c.hole.y1 < yk + hh - 1e-3) solids.push([c.hole.y1, yk + hh]);
    }
    if (room?.outdoor || (wl.open && !room)) {                            // faces onto open air are painted like the facade
      for (const [lo, hi] of solids) faceQuad(b, fs.m, wl.dir, plane, side, c.ua, c.ub, lo, lo, hi, hi, { col: mulc(fs.wall, 0.97 * jit) });
      return;
    }
    const fin = G.fin(room);
    for (const [lo, hi] of solids) {
      const layers = [];
      const yb = yk + fin.base.h, yd = fin.dado ? yk + fin.dado.h : yb;
      layers.push({ y0: yk, y1: yb, m: fin.base.m, c: fin.base.c });
      if (fin.dado && yd > yb) layers.push({ y0: yb, y1: yd, m: fin.dado.m, c: fin.dado.c });
      layers.push({ y0: Math.max(yd, yb), y1: yk + hh, m: fin.wall.m, c: fin.wall.c });
      for (const L of layers) {
        const a = Math.max(L.y0, lo), z = Math.min(L.y1, hi);
        if (z - a < 1e-3) continue;
        faceQuad(b, L.m, wl.dir, plane, side, c.ua, c.ub, a, a, z, z, { col: mulc(L.c, jit) });
      }
    }
  });
}

// ---- reveals (the thickness of the wall around doors, arches and windows) --------------------------------------------------------
function reveals(G, wl) {
  const { S, b, fs } = G, k = wl.floor, yk = k * S.fh, t = wl.t, caseta = !!wl.caseta;
  const dv = wl.dir === 'x' ? [1, 0, 0] : [0, 0, 1];
  const P = (u, w, y) => (wl.dir === 'x' ? [u, y, wl.at + w] : [wl.at + w, y, u]);
  const s = wl.ext ? OUT[wl.side] : 1;
  for (const o of wl.openings) {
    const ya = yk + o.y0, yb = yk + o.y1, u0 = o.u0, u1 = o.u1;
    const quad = (m, c, w0, w1, nrm, uA, uB, yA, yB) => {
      // generic reveal quad spanning (uA..uB) x (yA..yB) x (w0..w1) with one of u / y collapsed to a constant plane
      if (uA === uB) qd(b, m, P(uA, w0, yA), P(uA, w1, yA), P(uA, w1, yB), P(uA, w0, yB), nrm, { col: c });
      else qd(b, m, P(uA, w0, yA), P(uB, w0, yA), P(uB, w1, yA), P(uA, w1, yA), nrm, { col: c });
    };
    const piece = (m, c, w0, w1) => {
      quad(m, c, w0, w1, dv, u0, u0, ya, yb);                                        // jamb at u0 looks along +u
      quad(m, c, w0, w1, [-dv[0], 0, -dv[2]], u1, u1, ya, yb);                       // jamb at u1 looks along -u
      quad(m, c, w0, w1, [0, -1, 0], u0, u1, yb, yb);                                // head looks down
      if (o.kind === 'window') quad(m, c, w0, w1, [0, 1, 0], u0, u1, ya, ya);        // sill (doors have thresholds instead)
    };
    if (o.kind === 'window') {
      const win = G.winById.get(o.ref), room = win ? G.byId.get(win.room) : null, fin = G.fin(room);
      const wf = s * (t / 2 - 0.1);                                                  // frame plane, 0.10 m in from the outer face
      piece(caseta ? 'plaster_rough' : fs.m, mulc(fs.wall, 0.92), s * t / 2, wf);
      piece(fin.wall.m, mulc(fin.wall.c, 0.97), wf, -s * t / 2);
    } else {
      const d = G.doorById.get(o.ref);
      const r1 = d?.rooms?.[1] ? G.byId.get(d.rooms[1]) : null, fin = G.fin(r1 ?? G.byId.get(d?.rooms?.[0]));
      const ext = !!d?.ext;
      piece(ext ? fs.m : fin.wall.m, ext ? mulc(fs.wall, 0.9) : mulc(fin.wall.c, 0.93), -t / 2, t / 2);
      // threshold: the floor continues through the doorway
      const tm = ext ? 'concrete_bare' : fin.floor.m, tc = ext ? [0.92, 0.92, 0.9] : fin.floor.c;
      flat(b, tm, wl.dir === 'x' ? u0 : wl.at - t / 2, wl.dir === 'x' ? wl.at - t / 2 : u0, wl.dir === 'x' ? u1 : wl.at + t / 2, wl.dir === 'x' ? wl.at + t / 2 : u1, yk + 0.003, true, { col: tc });
    }
  }
}

// ---- floors, ceilings, slab edges --------------------------------------------------------------------------------------------------
function floorsAndCeilings(G) {
  const { S, b, bp } = G;
  for (let k = 0; k <= S.F; k++) {
    const yk = k * S.fh, fd = S.floorsData[k];
    if (k === S.F && !S.roofWalkable) continue;                            // closed roofs are drawn by shellroof
    for (const id of fd.rooms) {
      const r = G.byId.get(id), fin = G.fin(r), q = r.rect;
      flat(b, fin.floor.m, q.x0, q.z0, q.x1, q.z1, yk + (r.outdoor ? 0 : 0), true, { col: fin.floor.c });
    }
    // ceilings: room rects (and void cells) minus the stair voids of the storey above; none on open decks and outdoor rooms
    if (k === S.F || (S.openTop && k === S.F - 1)) {
      if (k === S.F) for (const id of fd.rooms) { const r = G.byId.get(id); if (!r.outdoor) { const fin = G.fin(r), q = r.rect; flat(b, fin.ceiling.m, q.x0, q.z0, q.x1, q.z1, yk + (r.h ?? CASETA_H), false, { col: fin.ceiling.c }); } }
      continue;
    }
    const above = S.floorsData[k + 1]?.voids.map((v) => v.rect) ?? [];
    for (const c of G.cells[k]) {
      if (c.room?.outdoor) continue;
      const fin = G.fin(c.room), h = c.room?.h ?? S.h;
      for (const p of rectMinusRects(c.rect, above)) flat(b, fin.ceiling.m, p.x0, p.z0, p.x1, p.z1, yk + h, false, { col: fin.ceiling.c });
    }
    // under every partition footprint: the ceiling plane continues (the walls above may not sit on walls below)
    for (const wl of S.walls) {
      if (wl.floor !== k || wl.ext) continue;
      const q = wl.dir === 'x' ? { x0: wl.a0, x1: wl.a1, z0: wl.at - wl.t / 2, z1: wl.at + wl.t / 2 } : { x0: wl.at - wl.t / 2, x1: wl.at + wl.t / 2, z0: wl.a0, z1: wl.a1 };
      const fin = G.fin(null);
      for (const p of rectMinusRects(q, above)) flat(b, fin.ceiling.m, p.x0, p.z0, p.x1, p.z1, yk + S.h, false, { col: fin.ceiling.c });
    }
  }
}

/** Slab edge around every stair void: the shaft wall continues through the slab thickness. */
function voidEdges(G) {
  const { S, b } = G;
  for (let k = 1; k <= S.F; k++) {
    if (k === S.F && !S.roofWalkable) continue;
    const yk = k * S.fh;
    for (const v of S.floorsData[k].voids) {
      const q = v.rect, fin = G.fin(G.byId.get(v.owner)), y0 = yk - S.slab, c = fin.wall.c, m = fin.wall.m;
      const e = [[q.x0, q.z0, q.x1, q.z0, [0, 0, 1]], [q.x1, q.z0, q.x1, q.z1, [-1, 0, 0]], [q.x1, q.z1, q.x0, q.z1, [0, 0, -1]], [q.x0, q.z1, q.x0, q.z0, [1, 0, 0]]];
      for (const [xa, za, xb, zb, n] of e) qd(b, m, [xa, y0, za], [xb, y0, zb], [xb, yk, zb], [xa, yk, za], n, { col: c });
    }
  }
}

export function buildBuilding(ctx, bp) {
  const G = makeG(ctx, bp), { S } = G;
  G.rm = makeRoofModel(G);
  for (const wl of S.walls) {
    if (wl.ext) outerFace(G, wl);
    if (wl.ext) innerFace(G, wl, -OUT[wl.side]); else { innerFace(G, wl, 1); innerFace(G, wl, -1); }
    reveals(G, wl);
  }
  const cas = S.roofLayer?.caseta;
  if (cas) for (const w of cas.walls) {
    const wl = { ...w, caseta: true };
    outerFace(G, wl); innerFace(G, wl, -OUT[wl.side]); reveals(G, wl);
  }
  floorsAndCeilings(G);
  voidEdges(G);
  buildStairs(G);
  buildWindows(G);
  buildDoorFrames(G);
  buildEntrySteps(G);
  buildRoof(G);
  dressFacade(G);
  ctx.batch.flush(bp.id + '.ext');
  buildDoorLeaves(G);
}

/** Facade language (shellfacade.js): decoration only. A fault in it is reported and the bare shell still ships. `ctx.noFacade = true` skips it (A/B measurements). */
function dressFacade(G) {
  const { ctx, bp, b } = G, t0 = b.tris;
  if (ctx.noFacade) { bp.shell.facadeTris = 0; return; }
  try { ensureSignAtlas(ctx); buildFacade(G); } catch (e) {
    (ctx.errors ??= []).push({ stage: 'arch', building: bp.id, message: 'facade ' + String(e?.message ?? e), stack: e?.stack });
  }
  bp.shell.facadeTris = b.tris - t0;
}

export { OUT, CASETA_T };
