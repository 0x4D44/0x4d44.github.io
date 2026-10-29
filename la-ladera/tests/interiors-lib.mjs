// Shared helpers for the INTERIORS tests (tests/interiors-*.test.mjs): build + furnish a batch of buildings under Node,
// OBB geometry from the public furniture records, and a physics-kernel reachability walker.
//   A3_PLANS=real   also run against A2's real plans when they have rooms (default: synthetic only)
//   A3_SABOTAGE=<kind> corrupt the data on purpose so a test must FAIL (kinds: see sabotage())
import { createContext } from '../js/core/ctx.js';
import { Physics } from '../js/core/physics.js';
import { furnishBuilding } from '../js/interiors/index.js';
import { genBatch } from './interiors-plans.mjs';
import { readAssetJson } from './headless.mjs';
import { CATALOG } from '../js/interiors/catalog.js';

export const PI = Math.PI;

export async function newCtx(seed = 7) {
  const ctx = createContext({ seed, headless: true });
  await ctx.assets.init(readAssetJson);
  ctx.physics.setTerrain(() => 0);
  return ctx;
}

/** Furnish `n` synthetic buildings (or the given plans). Returns { ctx, bps }. */
export async function furnishedBatch(o = {}) {
  if ((o.real ?? process.env.A3_PLANS === 'real') && !o.bps) {          // A2's real plans for the generated world
    const { buildData } = await import('./headless.mjs');
    const { ctx, buildings } = await buildData({ seed: o.seed, furnish: true, colliders: false });
    return { ctx, bps: o.n ? buildings.slice(0, o.n) : buildings };
  }
  const ctx = await newCtx(o.seed ?? 7);
  const bps = o.bps ?? genBatch(o.n ?? 40, o.planSeed ?? 3);
  for (const bp of bps) { ctx.buildings.set(bp.id, bp); furnishBuilding(ctx, bp); }
  return { ctx, bps };
}

// ---------------------------------------------------------------- geometry from public records
export function obbOf(rec) {
  const c = Math.cos(rec.ry), s = Math.sin(rec.ry);
  return { cx: rec.x, cz: rec.z, hx: rec.w / 2, hz: rec.d / 2, ux: [c, -s], uz: [s, c] };
}
export function corners(o) {
  const out = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push([o.cx + o.ux[0] * a * o.hx + o.uz[0] * b * o.hz, o.cz + o.ux[1] * a * o.hx + o.uz[1] * b * o.hz]);
  return out;
}
/** Penetration depth of two OBBs (SAT): > 0 overlapping by that much, <= 0 separated. */
export function penetration(a, b) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  let pen = Infinity;
  for (const ax of [a.ux, a.uz, b.ux, b.uz]) {
    const dist = Math.abs(dx * ax[0] + dz * ax[1]);
    const ra = a.hx * Math.abs(ax[0] * a.ux[0] + ax[1] * a.ux[1]) + a.hz * Math.abs(ax[0] * a.uz[0] + ax[1] * a.uz[1]);
    const rb = b.hx * Math.abs(ax[0] * b.ux[0] + ax[1] * b.ux[1]) + b.hz * Math.abs(ax[0] * b.uz[0] + ax[1] * b.uz[1]);
    pen = Math.min(pen, ra + rb - dist);
  }
  return pen;
}
export const rectOb = (x0, z0, x1, z1) => ({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, ux: [1, 0], uz: [0, 1] });
export const catalogOf = (rec) => CATALOG[rec.name] ?? null;
export const roomOf = (bp, id) => bp.rooms.find((r) => r.id === id);

// ---------------------------------------------------------------- sabotage (to prove each test can fail)
export function sabotage(bps, kind = process.env.A3_SABOTAGE) {
  if (!kind) return;
  const bp = bps.find((b) => b.furniture.some((f) => f.kind === 'floor' && f.block)) ?? bps[0];
  const floorBlock = (b) => b.furniture.filter((f) => f.kind === 'floor' && f.block);
  switch (kind) {
    case 'overlap': { const f = floorBlock(bp)[0]; bp.furniture.push({ ...f, id: f.id + 'dup', x: f.x + 0.05 }); break; }
    case 'outside': { const f = floorBlock(bp)[0]; f.x += 20; break; }
    case 'doorclear': {                                         // drop a sofa-sized blocker in front of a door
      const d = bp.doors.find((x) => x.rooms.every(Boolean)) ?? bp.doors[0], rid = d.rooms.find(Boolean), r = roomOf(bp, rid);
      bp.furniture.push({ id: 'sab', name: 'sofa_3_vinyl', room: rid, kind: 'floor', block: true, x: d.x - d.nx * 0.5, z: d.z - d.nz * 0.5, ry: 0, w: 1.9, d: 0.9, h: 0.85, y: r.y });
      break;
    }
    case 'entrance': {                                          // a sofa 1.5 m inside the first street door
      const b = bps.find((x) => x.entrances?.length) ?? bp, e = b.entrances[0], d = b.doors.find((x) => x.id === e.doorId), r = roomOf(b, d.rooms.find(Boolean));
      const [ox, , oz] = b.frame.toLocal(...e.outside), [ix, , iz] = b.frame.toLocal(...e.inside), l = Math.hypot(ix - ox, iz - oz) || 1;
      b.furniture.push({ id: 'sab3', name: 'sofa_3_vinyl', room: r.id, kind: 'floor', block: true, x: d.x + (ix - ox) / l * 1.5, z: d.z + (iz - oz) / l * 1.5, ry: 0, w: 1.9, d: 0.9, h: 0.85, y: r.y });
      break;
    }
    case 'stairclear': {                                        // park a sofa on the foot of a flight
      const b = bps.find((x) => x.stairs.length) ?? bp, st = b.stairs[0], r = b.rooms.find((x) => x.floor === st.floors[0]);
      const [px, pz] = st.landing ? [(st.landing.x0 + st.landing.x1) / 2, (st.landing.z0 + st.landing.z1) / 2] : st.from;
      b.furniture.push({ id: 'sab2', name: 'sofa_3_vinyl', room: r.id, kind: 'floor', block: true, x: px, z: pz, ry: 0, w: 1.9, d: 0.9, h: 0.85, y: r.y });
      break;
    }
    case 'unreach': {                                           // wall off the entrance door inside
      const e = bp.entrances[0];
      for (let i = -1; i <= 1; i++) bp.colliders.walls.push({ x1: e.inside[0] - 3, z1: e.inside[2] + i * 0.02, x2: e.inside[0] + 3, z2: e.inside[2] + i * 0.02, t: 0.5, y0: bp.lot.y, y1: bp.lot.y + 2.5, furniture: true });
      break;
    }
    case 'count': { const r = bp.rooms.find((x) => !['hall', 'corridor', 'stairwell', 'landing', 'entry'].includes(x.type)); bp.furniture = bp.furniture.filter((f) => f.room !== r.id); break; }
    case 'anchors': { bp.anchors = bp.anchors.filter((a) => a.kind !== 'sleep' && a.kind !== 'sit' && a.kind !== 'tv'); break; }
    case 'material': { const f = bp.furniture[0]; f.name = 'no_such_item'; break; }
    case 'random': break;                                       // handled by the determinism test itself
    default: throw new Error('unknown sabotage ' + kind);
  }
}

// ---------------------------------------------------------------- physics walker
export const BODY_R = +(process.env.A3_BODY_R || 0.3), BODY_H = 1.78;      // the player's radius (A3_BODY_R=0.35 asks for 0.7 m passages)

export function physicsFor(bp, { furniture = true, open = true } = {}) {
  const ph = new Physics();
  ph.setTerrain(() => bp.lot.y);
  ph.add({ walls: furniture ? bp.colliders.walls : bp.colliders.walls.filter((w) => !w.furniture), floors: bp.colliders.floors });
  if (open) for (const d of bp.doors) ph.setDoor(d.id, true);
  return ph;
}

/** Walk a stair flight with the real kernel; returns { ok, end:[x,y,z], start:[x,y,z] }. */
export function walkStair(ph, bp, st) {
  const fl0 = bp.lot.y + bp.floors[st.floors[0]].y, fl1 = bp.lot.y + bp.floors[st.floors[1]].y;
  let local;                                               // waypoints in the building frame
  if (st.path?.length > 1) local = st.path.map((p) => [p[0], p[1]]);        // A2's dogleg: landing -> lane A -> half landing -> lane B -> landing
  else {                                                   // straight flight (synthetic plans): a little run-up and run-out
    const dx = st.to[0] - st.from[0], dz = st.to[1] - st.from[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    local = [[st.from[0] - ux * 0.55, st.from[1] - uz * 0.55], [st.to[0] + ux * 0.6, st.to[1] + uz * 0.6]];
  }
  const W = local.map(([x, z]) => bp.frame.toWorld(x, 0, z));
  const a = W[0], b = W[W.length - 1];
  const s = { x: a[0], y: fl0, z: a[2], vy: 0, onGround: true };
  let stuck = null;
  for (let k = 1; k < W.length && !stuck; k++) {
    let lastD = Infinity, noProg = 0;
    for (let g = 0; g < 600; g++) {
      const dx = W[k][0] - s.x, dz = W[k][2] - s.z, d = Math.hypot(dx, dz);
      if (d < 0.03) break;
      const stp = Math.min(0.05, d);
      ph.move(s, dx / d * stp, dz / d * stp, 1 / 60, { radius: BODY_R, height: BODY_H });
      const d2 = Math.hypot(W[k][0] - s.x, W[k][2] - s.z);
      noProg = d2 < lastD - 1e-4 ? 0 : noProg + 1; lastD = d2;
      if (noProg >= 4) { stuck = { waypoint: k, at: [s.x, s.y, s.z] }; break; }
    }
  }
  return { ok: !stuck && Math.abs(s.y - fl1) < 0.06 && Math.hypot(s.x - b[0], s.z - b[2]) < 0.2, end: [s.x, s.y, s.z], start: a, goal: b, blocked: stuck };
}

/**
 * Flood fill (BFS) over free floor cells with the kernel's own wall predicate, starting outside the main entrance.
 * Returns { has(fl,wx,wz), rooms:Set, n, path(fl,wx,wz) }. Stairs are walked with ph.move().
 */
export function reach(bp, ph, o = {}) {
  const cell = o.cell ?? 0.1, m = 2.5, b = bp.bounds;
  const x0 = b.x0 - m, z0 = b.z0 - m, nx = Math.ceil((b.x1 - b.x0 + 2 * m) / cell), nz = Math.ceil((b.z1 - b.z0 + 2 * m) / cell);
  const FY = bp.floors.map((f) => bp.lot.y + f.y);
  const key = (fl, ix, iz) => (fl * nz + iz) * nx + ix;
  const cx = (ix) => x0 + (ix + 0.5) * cell, cz = (iz) => z0 + (iz + 0.5) * cell;
  const ixOf = (x) => Math.floor((x - x0) / cell), izOf = (z) => Math.floor((z - z0) / cell);
  const memo = new Map();
  const free = (fl, ix, iz) => {
    if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return false;
    const k = key(fl, ix, iz); let v = memo.get(k);
    if (v === undefined) {
      const x = cx(ix), z = cz(iz), y = FY[fl];
      let ok = !ph._overlaps(x, z, y, BODY_R + 0.025, BODY_H);
      if (ok) { const f = ph._surf(x, z, y, 0.5, BODY_H); ok = !f.blocked && Math.abs(f.best - y) < 0.03; }      // standing on this floor, no flight or soffit in the way
      v = ok;
      memo.set(k, v);
    }
    return v;
  };
  const nearestFree = (fl, wx, wz, radM = 0.6) => {
    const ix = ixOf(wx), iz = izOf(wz), rad = Math.ceil(radM / cell);
    for (let r = 0; r <= rad; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (free(fl, ix + dx, iz + dz)) return [ix + dx, iz + dz];
    }
    return null;
  };
  // stair links: foot cell on the lower floor <-> arrival cell on the upper floor
  const links = new Map();
  const stairReports = [];
  for (const st of bp.stairs) {
    const w = walkStair(ph, bp, st);
    stairReports.push({ id: st.id, ...w });
    if (!w.ok) continue;
    const a = nearestFree(st.floors[0], w.start[0], w.start[2], 0.45), c = nearestFree(st.floors[1], w.end[0], w.end[2], 0.45);
    if (!a || !c) continue;
    links.set(key(st.floors[0], a[0], a[1]), [st.floors[1], c[0], c[1]]);
    links.set(key(st.floors[1], c[0], c[1]), [st.floors[0], a[0], a[1]]);
  }
  const e = bp.entrances[0];
  const start = nearestFree(0, e.outside[0], e.outside[2], 0.9);
  const par = new Map();
  const queue = [];
  if (start) { queue.push([0, start[0], start[1]]); par.set(key(0, start[0], start[1]), -1); }
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [fl, ix, iz] = queue[qi], k0 = key(fl, ix, iz);
    const lk = links.get(k0);
    if (lk) { const k = key(...lk); if (!par.has(k)) { par.set(k, k0); queue.push(lk); } }
    for (const [dx, dz] of N8) {
      const X = ix + dx, Z = iz + dz;
      if (!free(fl, X, Z)) continue;
      if (dx && dz && (!free(fl, ix + dx, iz) || !free(fl, ix, iz + dz))) continue;      // no corner cutting
      const k = key(fl, X, Z);
      if (par.has(k)) continue;
      par.set(k, k0); queue.push([fl, X, Z]);
    }
  }
  const rooms = new Set();
  for (const [fl, ix, iz] of queue) {
    const [lx, , lz] = bp.frame.toLocal(cx(ix), FY[fl], cz(iz));
    for (const r of bp.rooms) if (r.floor === fl && lx >= r.rect.x0 && lx <= r.rect.x1 && lz >= r.rect.z0 && lz <= r.rect.z1) rooms.add(r.id);
  }
  const visited = (fl, wx, wz, radM = 0.45) => {                 // nearest visited cell within radM metres (or null)
    const ix = ixOf(wx), iz = izOf(wz), rad = Math.ceil(radM / cell);
    let best = null, bd = Infinity;
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) { const d = dx * dx + dz * dz; if (d < bd && par.has(key(fl, ix + dx, iz + dz))) { bd = d; best = [fl, ix + dx, iz + dz]; } }
    return best;
  };
  /** World-space polyline from the start to a visited cell. */
  const path = (cellRef) => {
    const out = []; let k = key(...cellRef);
    for (let g = 0; g < 1e5 && k !== -1 && k !== undefined; g++) {
      const fl = Math.floor(k / (nx * nz)), rem = k % (nx * nz), iz = Math.floor(rem / nx), ix = rem % nx;
      out.push([fl, cx(ix), cz(iz)]); k = par.get(k);
    }
    return out.reverse();
  };
  return { n: queue.length, rooms, visited, path, stairReports, start: !!start, FY, _dbg: { links, par, key, free, nearestFree } };
}

/** Re-walk a BFS path with the real kernel. Returns { ok, at }. Hops across floors are skipped (stairs are verified apart). */
export function replay(ph, bp, pathPts) {
  if (!pathPts.length) return { ok: true };
  const [fl0, sx, sz] = pathPts[0];
  const s = { x: sx, y: bp.lot.y + bp.floors[fl0].y, z: sz, vy: 0, onGround: true };
  let fl = fl0;
  for (let i = 1; i < pathPts.length; i++) {
    const [f, x, z] = pathPts[i];
    if (f !== fl) { fl = f; s.x = x; s.z = z; s.y = bp.lot.y + bp.floors[f].y; continue; }
    if (Math.hypot(x - s.x, z - s.z) > 0.6) { s.x = x; s.z = z; continue; }        // stair teleport segments
    ph.move(s, x - s.x, z - s.z, 1 / 60, { radius: BODY_R, height: BODY_H });
    if (s.blocked || Math.hypot(s.x - x, s.z - z) > 0.12) return { ok: false, at: [x, z, f], got: [s.x, s.z] };
  }
  return { ok: true };
}

/** World point 0.6 m inside `room` in front of `door` (null if the door is not on that room). */
export function landing(bp, door, roomId, d = 0.6) {
  const r = roomOf(bp, roomId); if (!r) return null;
  for (const sg of [1, -1]) {
    const lx = door.x + door.nx * sg * d, lz = door.z + door.nz * sg * d;
    if (lx > r.rect.x0 && lx < r.rect.x1 && lz > r.rect.z0 && lz < r.rect.z1) return { local: [lx, lz], world: bp.frame.toWorld(lx, 0, lz), fl: r.floor };
  }
  return null;
}
