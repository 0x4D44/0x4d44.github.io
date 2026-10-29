// Placement engine for one room: rect + openings + stairs -> keep-outs, then constraint-checked placement of catalogue items
// (against walls, free-standing, on top of furniture, hung on walls), and a door-to-door connectivity self-heal.
// PURE DATA (no THREE, no DOM). All coordinates are the building-local frame (+x width axis, +z street side, +y up).
import { CATALOG, PAL } from './catalog.js';

export const WALLS = ['-z', '+z', '-x', '+x'];
const PI = Math.PI;
const r2 = (v) => Math.round(v * 1000) / 1000;

/** Geometry of one wall of a rect: along axis, extent, the wall coordinate, inward normal and the facing of items against it. */
export function wallInfo(rect, wall) {
  switch (wall) {
    case '-z': return { wall, ax: 'x', lo: rect.x0, hi: rect.x1, base: rect.z0, nx: 0, nz: 1, ry: 0 };
    case '+z': return { wall, ax: 'x', lo: rect.x0, hi: rect.x1, base: rect.z1, nx: 0, nz: -1, ry: PI };
    case '-x': return { wall, ax: 'z', lo: rect.z0, hi: rect.z1, base: rect.x0, nx: 1, nz: 0, ry: PI / 2 };
    default: return { wall, ax: 'z', lo: rect.z0, hi: rect.z1, base: rect.x1, nx: -1, nz: 0, ry: -PI / 2 };
  }
}
/** Point on a wall: along coordinate u, distance t from the wall into the room. */
export function wallPoint(rect, wall, u, t = 0) {
  const wi = wallInfo(rect, wall);
  return wi.ax === 'x' ? [u + wi.nx * t, wi.base + wi.nz * t] : [wi.base + wi.nx * t, u + wi.nz * t];
}
export function opposite(w) { return { '-z': '+z', '+z': '-z', '-x': '+x', '+x': '-x' }[w]; }

// ------------------------------------------------------------------ oriented boxes
export function mkObb(cx, cz, w, d, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return { cx, cz, hx: w / 2, hz: d / 2, ry, ux: [c, -s], uz: [s, c] };
}
export function obbCorners(o) {
  const out = [];
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push([o.cx + o.ux[0] * a * o.hx + o.uz[0] * b * o.hz, o.cz + o.ux[1] * a * o.hx + o.uz[1] * b * o.hz]);
  return out;
}
/** SAT overlap. m > 0 requires m metres of separation; m < 0 tolerates |m| of penetration (touching items). */
export function obbOverlap(a, b, m = 0) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  for (const ax of [a.ux, a.uz, b.ux, b.uz]) {
    const dist = Math.abs(dx * ax[0] + dz * ax[1]);
    const ra = a.hx * Math.abs(ax[0] * a.ux[0] + ax[1] * a.ux[1]) + a.hz * Math.abs(ax[0] * a.uz[0] + ax[1] * a.uz[1]);
    const rb = b.hx * Math.abs(ax[0] * b.ux[0] + ax[1] * b.ux[1]) + b.hz * Math.abs(ax[0] * b.uz[0] + ax[1] * b.uz[1]);
    if (dist >= ra + rb + m) return false;
  }
  return true;
}
/** Distance from a point to an OBB (0 inside). */
export function obbDist(o, x, z) {
  const dx = x - o.cx, dz = z - o.cz;
  const lx = Math.abs(dx * o.ux[0] + dz * o.ux[1]), lz = Math.abs(dx * o.uz[0] + dz * o.uz[1]);
  return Math.hypot(Math.max(0, lx - o.hx), Math.max(0, lz - o.hz));
}
const rectObb = (r) => mkObb((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, 0);

/** The architect's wall colliders in the building frame (our own blockers and closed-door slabs left out), cached per plan. */
const _wallCache = new WeakMap();
function localWalls(bp) {
  let c = _wallCache.get(bp);
  if (c) return c;
  const src = bp.colliders?.walls ?? [], fr = bp.frame;
  if (!src.length || !fr?.toLocal) return [];                          // no colliders yet: do not guess at open sides
  c = [];
  for (const w of src) {
    if (w.furniture || w.door) continue;
    const a = fr.toLocal(w.x1, 0, w.z1), b = fr.toLocal(w.x2, 0, w.z2);
    c.push({ x1: a[0], z1: a[2], x2: b[0], z2: b[2], t: w.t ?? 0.1, y0: w.y0, y1: w.y1 });
  }
  _wallCache.set(bp, c);
  return c;
}

/** Which wall of `rect` is (x,z) on? -> { wall, u, dist } (closest side), or null if farther than `tol`. */
export function sideOf(rect, x, z, tol = 0.7) {
  const c = [['-z', Math.abs(z - rect.z0), x], ['+z', Math.abs(z - rect.z1), x], ['-x', Math.abs(x - rect.x0), z], ['+x', Math.abs(x - rect.x1), z]];
  c.sort((a, b) => a[1] - b[1]);
  const [wall, dist, u] = c[0];
  const wi = wallInfo(rect, wall);
  if (dist > tol || u < wi.lo - tol || u > wi.hi + tol) return null;
  return { wall, u, dist };
}

let _uid = 0;
export const resetUid = () => { _uid = 0; };

export class Layout {
  /** o: { bp, room, rng, hh } */
  constructor(o) {
    this.bp = o.bp; this.room = o.room; this.rng = o.rng; this.hh = o.hh;
    this.r = o.room.rect;
    this.W = this.r.x1 - this.r.x0; this.D = this.r.z1 - this.r.z0;
    this.items = [];                                   // everything placed (floor, top, wall, ceiling)
    this.keep = [];                                    // keep-out rects {x0,z0,x1,z1,why}
    this.obs = { '-z': [], '+z': [], '-x': [], '+x': [] };   // wall obstacles {u0,u1,kind,sill,top,door}
    this.decor = { '-z': [], '+z': [], '-x': [], '+x': [] }; // wall slots taken {u0,u1,y0,y1}
    this.landings = [];                                // [{x,z,kind,door}] points that must stay connected
    this.circulation = false;
    this.h = o.room.h ?? 2.6;
    this._collect();
    this._base = this._connScore();                    // how split the empty room already is (edge bands, odd plans)
  }

  // ---------------------------------------------------------------- openings and stairs
  _collect() {
    const { bp, room, r } = this;
    const doors = (bp.doors ?? []).filter((d) => d.rooms?.includes(room.id) || room.doors?.includes(d.id));
    for (const d of doors) {
      const s = sideOf(r, d.x, d.z); if (!s) continue;
      const w = d.w ?? 0.9, leaf = d.kind !== 'arch' && d.kind !== 'shutter';
      let swingIn = leaf;                                // unknown swing: assume the leaf sweeps into this room (conservative)
      if (leaf && d.swing != null && d.rooms) swingIn = d.rooms[d.swing] === room.id;
      const depth = d.kind === 'shutter' ? 0.9 : (swingIn ? w + 0.08 : 0.75);
      this._opening(s.wall, s.u - w / 2, s.u + w / 2, depth, 'door', { door: d.id, h: d.h ?? 2.1 });
      // the street door: the first 3 m straight in stay free (the tour test and every first-time visitor walk in along it)
      const ent = (bp.entrances ?? []).find((e) => e.doorId === d.id);
      if (ent?.inside && bp.frame?.toLocal) {                   // only the room the visitor steps into
        const [ix, , iz] = bp.frame.toLocal(...ent.inside);
        if (ix >= r.x0 - 0.15 && ix <= r.x1 + 0.15 && iz >= r.z0 - 0.15 && iz <= r.z1 + 0.15) this.keep.push({ why: 'entrance', wall: s.wall, ...this._wallRect(s.wall, s.u - w / 2 - 0.1, s.u + w / 2 + 0.1, 3.0) });
      }
    }
    for (const op of room.openings ?? []) {
      this._opening(op.side, op.from, op.to, 0.8, 'door', { arch: true, h: 2.2 });
    }
    for (const win of (bp.windows ?? []).filter((w) => w.room === room.id)) {
      const s = sideOf(r, win.x, win.z); if (!s) continue;
      const w = win.w ?? 1.0;
      this.obs[s.wall].push({ u0: s.u - w / 2, u1: s.u + w / 2, kind: 'window', sill: win.y ?? 0.9, top: (win.y ?? 0.9) + (win.h ?? 1.1) });
    }
    for (const st of bp.stairs ?? []) this._stair(st);
    this._openEdges();
    // three doors in under nine square metres (a rowhouse kitchen, a bedroom that is half a hall): the sweeps would leave no wall for a bed or a stove
    const nDoors = WALLS.reduce((n, w) => n + this.obs[w].filter((o) => o.kind === 'door').length, 0);
    if (nDoors >= 3 && this.W * this.D < 9) this.relaxKeeps(0.7);
  }
  /** Sides with no wall at all (a terrace open to the next one, a yard): every open run of >= 0.75 m is a way in, like a door. */
  _openEdges() {
    const { bp, room, r } = this;
    const ws = localWalls(bp);
    if (!ws.length) return;
    const fy = (bp.lot?.y ?? 0) + (room.y ?? 0);
    const near = ws.filter((w) => w.y1 > fy + 0.4 && w.y0 < fy + 1.7
      && Math.min(w.x1, w.x2) - w.t < r.x1 + 0.4 && Math.max(w.x1, w.x2) + w.t > r.x0 - 0.4
      && Math.min(w.z1, w.z2) - w.t < r.z1 + 0.4 && Math.max(w.z1, w.z2) + w.t > r.z0 - 0.4);
    const covered = (x, z) => {
      for (const w of near) {
        const vx = w.x2 - w.x1, vz = w.z2 - w.z1, l2 = vx * vx + vz * vz;
        let t = l2 > 1e-9 ? ((x - w.x1) * vx + (z - w.z1) * vz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (w.x1 + vx * t), dz = z - (w.z1 + vz * t), md = w.t + 0.12;
        if (dx * dx + dz * dz < md * md) return true;
      }
      return false;
    };
    for (const wall of WALLS) {
      const wi = wallInfo(r, wall), step = 0.1;
      const runs = [];
      let start = null, last = null;
      for (let u = wi.lo + 0.05; u <= wi.hi - 0.05 + 1e-9; u += step) {
        const [x, z] = wi.ax === 'x' ? [u, wi.base] : [wi.base, u];
        if (!covered(x, z)) { if (start === null) start = u; last = u; }
        else if (start !== null) { runs.push([start - 0.05, last + 0.05]); start = null; }
      }
      if (start !== null) runs.push([start - 0.05, last + 0.05]);
      for (const [u0, u1] of runs) {
        const len = u1 - u0;
        if (len < 0.75) continue;
        const n = Math.ceil(len / 3);
        let added = false;
        for (let i = 0; i < n; i++) {
          const mid = Math.min(wi.hi - 0.3, Math.max(wi.lo + 0.3, u0 + len * (i + 0.5) / n));
          const [lx, lz] = wallPoint(r, wall, mid, 0.44);
          if (this.landings.some((l) => Math.hypot(l.x - lx, l.z - lz) < 0.9)) continue;      // a door or arch is already there
          this.landings.push({ x: lx, z: lz, kind: 'open', wall, u: mid });
          added = true;
        }
        // nothing may stand within 0.55 m of an open boundary: the neighbour keeps the same strip free, so the passage is >= 1.1 m
        if (added) this.keep.push({ why: 'open', wall, ...this._wallRect(wall, u0, u1, 0.55) });
      }
    }
  }
  _opening(wall, a, b, depth, kind, extra = {}) {
    const wi = wallInfo(this.r, wall);
    const u0 = Math.min(a, b), u1 = Math.max(a, b);
    this.obs[wall].push({ u0, u1, kind, ...extra });
    const k = { why: kind, wall, u0: u0 - 0.05, u1: u1 + 0.05, depth, ...this._wallRect(wall, u0 - 0.05, u1 + 0.05, depth) };
    this.keep.push(k);
    const mid = Math.min(wi.hi - 0.3, Math.max(wi.lo + 0.3, (u0 + u1) / 2));
    const [lx, lz] = wallPoint(this.r, wall, mid, 0.44);              // just past the 0.38 m band the body keeps off the wall
    this.landings.push({ x: lx, z: lz, kind: 'door', door: extra.door, wall, u: mid });
  }
  /** A room with three doors in four square metres (a rowhouse kitchen): shrink every door's keep-out to `depth` so it can still hold what it is for.
   *  The leaf then sweeps through the corner of a counter, which nobody sees; the walking lanes stay guarded by the connectivity check. Returns how many shrank. */
  relaxKeeps(depth = 0.7) {
    let n = 0;
    for (const k of this.keep) {
      if (k.why !== 'door' || k.depth == null || k.depth <= depth + 1e-6) continue;
      Object.assign(k, this._wallRect(k.wall, k.u0, k.u1, depth)); k.depth = depth; n++;
    }
    return n;
  }
  _wallRect(wall, u0, u1, depth) {
    const r = this.r;
    switch (wall) {
      case '-z': return { x0: u0, x1: u1, z0: r.z0, z1: r.z0 + depth };
      case '+z': return { x0: u0, x1: u1, z0: r.z1 - depth, z1: r.z1 };
      case '-x': return { x0: r.x0, x1: r.x0 + depth, z0: u0, z1: u1 };
      default: return { x0: r.x1 - depth, x1: r.x1, z0: u0, z1: u1 };
    }
  }
  _stair(st) {
    const r = this.r, f = this.room.floor;
    if (st.landing && st.flights?.length) {                // A2's dogleg core: both flights and the half landing share one footprint
      if (f !== st.floors?.[0] && f !== st.floors?.[1]) return;
      const addRect = (q, why, m) => {
        const k = { x0: q.x0 - m, x1: q.x1 + m, z0: q.z0 - m, z1: q.z1 + m, why };
        if (obbOverlap(rectObb(k), rectObb(r), 0)) this.keep.push(k);
      };
      if (st.hole?.length) {
        const xs = st.hole.map((p) => p[0]), zs = st.hole.map((p) => p[1]);
        addRect({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }, 'stair-hole', 0.1);
      }
      addRect(st.landing, 'stair-landing', 0.05);
      const p = st.path?.[0];
      if (p && p[0] > r.x0 + 0.2 && p[0] < r.x1 - 0.2 && p[1] > r.z0 + 0.2 && p[1] < r.z1 - 0.2) this.landings.push({ x: p[0], z: p[1], kind: 'stair' });
      return;
    }
    const [fx, fz] = st.from, [tx, tz] = st.to;
    const len = Math.hypot(tx - fx, tz - fz) || 1, dx = (tx - fx) / len, dz = (tz - fz) / len;
    const wd = (st.width ?? 1) + 0.2, ry = Math.atan2(dx, dz);
    const hit = (ob) => obbOverlap(ob, rectObb(r), 0);
    const addObb = (ob, why, landing) => {
      if (!hit(ob)) return;
      const cs = obbCorners(ob);
      const xs = cs.map((p) => p[0]), zs = cs.map((p) => p[1]);
      this.keep.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), why, obb: ob });
      if (landing && landing[0] > r.x0 + 0.2 && landing[0] < r.x1 - 0.2 && landing[1] > r.z0 + 0.2 && landing[1] < r.z1 - 0.2) this.landings.push({ x: landing[0], z: landing[1], kind: 'stair' });
    };
    if (f === st.floors?.[0]) {                       // bottom of the flight: the run itself + 0.9 m landing before it
      const cx = (fx + tx) / 2 - dx * 0.45, cz = (fz + tz) / 2 - dz * 0.45;
      addObb(mkObb(cx, cz, wd, len + 0.9, ry), 'stair-run', [fx - dx * 0.55, fz - dz * 0.55]);
    }
    if (f === st.floors?.[1]) {                       // top of the flight: the hole + landing beyond the arrival point
      const cx = (fx + tx) / 2 + dx * 0.45, cz = (fz + tz) / 2 + dz * 0.45;
      addObb(mkObb(cx, cz, wd, len + 0.9, ry), 'stair-hole', [tx + dx * 0.55, tz + dz * 0.55]);
      if (st.hole?.length) {
        const xs = st.hole.map((p) => p[0]), zs = st.hole.map((p) => p[1]);
        this.keep.push({ x0: Math.min(...xs) - 0.1, x1: Math.max(...xs) + 0.1, z0: Math.min(...zs) - 0.1, z1: Math.max(...zs) + 0.1, why: 'stair-hole' });
      }
    }
  }

  // ---------------------------------------------------------------- queries
  get floorItems() { return this.items.filter((i) => i.floor); }
  blockers() { return this.items.filter((i) => i.floor && i.block); }
  /** Is the OBB entirely inside the room rect (small tolerance)? */
  inside(ob, tol = 0.004) {
    const r = this.r;
    for (const [x, z] of obbCorners(ob)) if (x < r.x0 - tol || x > r.x1 + tol || z < r.z0 - tol || z > r.z1 + tol) return false;
    return true;
  }
  /** Window zones in front of windows: tall items (top > sill) may not stand there. */
  _windowHit(ob, topH) {
    for (const wall of WALLS) for (const o of this.obs[wall]) {
      if (o.kind !== 'window' || topH <= o.sill - 0.02) continue;
      const zr = this._wallRect(wall, o.u0 - 0.05, o.u1 + 0.05, 0.45);
      if (obbOverlap(ob, rectObb(zr), -0.01)) return true;
    }
    return false;
  }
  _keepHit(ob) {
    for (const k of this.keep) if (obbOverlap(ob, k.obb ?? rectObb(k), -0.01)) return k;
    return null;
  }
  _frontZone(it) {          // free space needed in front of / behind an item
    const c = it.c, zs = [];
    if (c.clear?.[0] > 0.05) zs.push(mkObb(it.x + Math.sin(it.ry) * (it.d / 2 + c.clear[0] / 2), it.z + Math.cos(it.ry) * (it.d / 2 + c.clear[0] / 2), it.w, c.clear[0], it.ry));
    if (c.clear?.[1] > 0.05) zs.push(mkObb(it.x - Math.sin(it.ry) * (it.d / 2 + c.clear[1] / 2), it.z - Math.cos(it.ry) * (it.d / 2 + c.clear[1] / 2), it.w, c.clear[1], it.ry));
    return zs;
  }
  /** Can a floor item with this footprint sit here? */
  valid(it, o = {}) {
    if (!this.inside(it.ob)) return false;
    const flat = it.c.size[1] < 0.05;                    // rugs and mats: only avoid each other
    if (!flat) {
      if (this._keepHit(it.ob) && !o.ignoreKeep) return false;
      if (it.block && it.h > 0.5 && !o.winOk && this._windowHit(it.ob, it.h)) return false;
    }
    const zones = it.block && !o.noClear ? this._frontZone(it) : [];
    for (const b of this.items) {
      if (!b.floor) continue;
      const bflat = b.c.size[1] < 0.05;
      if (flat || bflat) { if (flat && bflat && obbOverlap(it.ob, b.ob, -0.01)) return false; continue; }
      if (obbOverlap(it.ob, b.ob, -0.005)) return false;
      if (it.block) for (const z of b.zones ?? []) if (obbOverlap(it.ob, z, -0.01)) return false;
      if (b.block) for (const z of zones) if (obbOverlap(z, b.ob, -0.01)) return false;
    }
    if (it.block && !flat && !o.noConn && it.h >= (o.connAll ? 0.2 : 0.35) && !this._connOk(it)) return false;    // never cut the room in two (>= 0.7 m passages)
    if (!o.noConn && this._needsAccess(it) && !this._accessOk(it)) return false;             // a seat or bed someone cannot walk up to is useless
    return true;
  }

  // ---------------------------------------------------------------- item construction
  _make(name, cx, cz, ry, o = {}) {
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const swap = Math.abs(Math.sin(ry)) > 0.7071;           // quarter turns swap the footprint extents for AABB purposes
    const w = c.size[0], d = c.size[2];
    const it = {
      id: `${this.room.id}.i${(_uid++).toString(36)}`, name, c, room: this.room.id, floor: true,
      x: r2(cx), z: r2(cz), y: this.room.y ?? 0, ry: r2(ry), w, d, h: c.size[1],
      block: c.block !== false && !c.wall && !c.ceil && !c.top && c.size[1] >= 0.2,
      prio: o.prio ?? 1, tint: o.tint ?? null, tags: c.tags, ob: mkObb(cx, cz, w, d, ry), swap,
    };
    if (c.bh != null) it.bh = c.bh;
    it.zones = it.block ? this._frontZone(it) : [];
    return it;
  }
  _commit(it, o = {}) {
    if (o.mut) Object.assign(it, o.mut);
    if (it.tint == null && it.c.cols && it.c.cols !== 'none') {
      const t = this.hh?.tints?.[it.c.cols];
      it.tint = t ?? PAL[it.c.cols]?.[Math.floor(this.rng.next() * PAL[it.c.cols].length)] ?? null;
    }
    this.items.push(it);
    return it;
  }
  /** Room-frame point at item-local (lx, lz). */
  rel(it, lx, lz) { const c = Math.cos(it.ry), s = Math.sin(it.ry); return [it.x + lx * c + lz * s, it.z - lx * s + lz * c]; }
  /** Unit facing vector of an item. */
  face(it) { return [Math.sin(it.ry), Math.cos(it.ry)]; }
  /** Place an item at an offset in another item's local frame (checked). dry = extra rotation. */
  atRel(name, base, lx, lz, dry = 0, o = {}) { const [x, z] = this.rel(base, lx, lz); return this.at(name, x, z, base.ry + dry, o); }
  freeLen(wall) {
    const wi = wallInfo(this.r, wall);
    let len = wi.hi - wi.lo;
    for (const o of this.obs[wall]) len -= o.kind === 'door' ? (o.u1 - o.u0) + 0.5 : (o.u1 - o.u0) * 0.5;
    return len;
  }
  /** Walls sorted by free length (best first). */
  wallsByFree() { return WALLS.map((w) => ({ wall: w, len: this.freeLen(w) })).sort((a, b) => b.len - a.len || (a.wall < b.wall ? -1 : 1)); }
  count(pred) { return this.items.filter(pred).length; }
  find(name) { return this.items.find((i) => i.name === name); }
  remove(it) {
    for (const x of this.items.filter((k) => k.parent === it)) this.remove(x);
    const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1);
    if (it.wallSlot) { const a = this.decor[it.wallSlot.wall]; const j = a.indexOf(it.wallSlot); if (j >= 0) a.splice(j, 1); }
  }

  /** Place at an exact pose (checked). */
  at(name, cx, cz, ry, o = {}) {
    const it = this._make(name, cx, cz, ry, o);
    if (!o.force && !this.valid(it, o)) return null;
    return this._commit(it, o);
  }

  _scoreAlong(o, u, lo, hi, wall, w) {
    let s = 0;
    const mid = (lo + hi) / 2;
    const at = o.at ?? 'any';
    if (at === 'center') s -= Math.abs(u - mid) * 2.2;
    else if (at === 'corner') s -= Math.min(Math.abs(u - lo), Math.abs(u - hi)) * 3;
    else if (at === 'start') s -= (u - lo) * 3;
    else if (at === 'end') s -= (hi - u) * 3;
    else if (typeof at === 'number') s -= Math.abs(u - (lo + at * (hi - lo))) * 3;
    else if (at === 'window') {
      let best = 9; for (const ob of this.obs[wall]) if (ob.kind === 'window') best = Math.min(best, Math.abs(u - (ob.u0 + ob.u1) / 2));
      s -= best * 2.5;
    } else if (at === 'awayDoor') {
      let best = 9; for (const ob of this.obs[wall]) if (ob.kind === 'door') best = Math.min(best, Math.abs(u - (ob.u0 + ob.u1) / 2));
      s += Math.min(best, 4) * 1.2;
    }
    if (o.near) { const [nx, nz] = this._pt(o.near); const [px, pz] = wallPoint(this.r, wall, u, 0.3); s -= Math.hypot(px - nx, pz - nz) * (o.nearW ?? 1.5); }
    if (o.far) { const [nx, nz] = this._pt(o.far); const [px, pz] = wallPoint(this.r, wall, u, 0.3); s += Math.hypot(px - nx, pz - nz) * 0.8; }
    if (o.awayDoors) { for (const l of this.landings) if (l.kind === 'door') { const [px, pz] = wallPoint(this.r, wall, u, 0.3); s += Math.min(Math.hypot(px - l.x, pz - l.z), 4) * 0.5; } }
    return s;
  }
  _pt(p) { return Array.isArray(p) ? p : [p.x, p.z]; }

  /** Place a floor item against a wall (back to the wall). walls: '-z' | ['-z','+x'] | 'any'. o: { at, gap, near, far, prio, tint, flip } */
  wall(name, walls = 'any', o = {}) {
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const list = walls === 'any' ? WALLS : Array.isArray(walls) ? walls : [walls];
    const cands = [];
    const along = !!o.along;                              // long side against the wall (a bed or sofa where the room is too narrow for its length)
    const w = o.w ?? c.size[0], d = c.size[2], gap = o.gap ?? 0.01, half = (along ? d : w) / 2, off = (along ? w : d) / 2 + gap;
    for (const wall of list) {
      const wi = wallInfo(this.r, wall);
      const lo = wi.lo + half + (o.inset ?? 0), hi = wi.hi - half - (o.inset ?? 0);
      if (hi < lo - 1e-6) continue;
      const us = new Set([lo, hi, (lo + hi) / 2]);
      for (let u = lo; u <= hi + 1e-6; u += o.step ?? 0.15) us.add(r2(u));
      for (const ob of this.obs[wall]) { us.add(r2(ob.u0 - half - 0.03)); us.add(r2(ob.u1 + half + 0.03)); us.add(r2((ob.u0 + ob.u1) / 2)); }
      if (typeof o.at === 'number') us.add(r2(lo + o.at * (hi - lo)));
      for (const u of us) {
        if (u < lo - 1e-6 || u > hi + 1e-6) continue;
        cands.push({ wall, u, s: this._scoreAlong(o, u, wi.lo, wi.hi, wall, w) + this.rng.next() * (o.jitter ?? 0.25) });
      }
    }
    cands.sort((a, b) => b.s - a.s);
    for (const cd of cands) {
      const wi = wallInfo(this.r, cd.wall);
      const [cx, cz] = wallPoint(this.r, cd.wall, cd.u, off);
      const ry = wi.ry + (along ? (o.flip ? -PI / 2 : PI / 2) : (o.flip ? PI : 0));
      const it = this._make(name, cx, cz, ry, o);
      if (o.sideNeed && !this._sideFree(it, o.sideNeed)) continue;
      if (this.valid(it, o)) { it.wallSide = cd.wall; it.u = cd.u; return this._commit(it, o); }
    }
    return null;
  }
  _sideFree(it, need) {     // at least `need` metres free on one lateral side (bed access)
    const lat = (sgn) => mkObb(it.x + Math.cos(it.ry) * sgn * (it.w / 2 + need / 2), it.z - Math.sin(it.ry) * sgn * (it.w / 2 + need / 2), need, it.d * 0.9, it.ry);
    for (const sg of [1, -1]) {
      const z = lat(sg);
      if (!this.inside(z, 0.02)) continue;
      let ok = true;
      for (const b of this.items) if (b.floor && b.block && obbOverlap(z, b.ob, -0.02)) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  /** Free-standing: search around a target, optionally facing a point/item. o: { near:[x,z]|item, rad, ry, face, step, prio, tint } */
  free(name, o = {}) {
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const [tx, tz] = o.near ? this._pt(o.near) : [(this.r.x0 + this.r.x1) / 2, (this.r.z0 + this.r.z1) / 2];
    const rad = o.rad ?? 1.6, step = o.step ?? 0.1;
    const cands = [];
    for (let dx = -rad; dx <= rad + 1e-6; dx += step) for (let dz = -rad; dz <= rad + 1e-6; dz += step) {
      const x = tx + dx, z = tz + dz; if (Math.hypot(dx, dz) > rad) continue;
      cands.push({ x, z, s: -Math.hypot(dx, dz) + this.rng.next() * (o.jitter ?? 0.15) });
    }
    cands.sort((a, b) => b.s - a.s);
    const rys = o.ry != null ? [o.ry] : o.rys ?? [0, PI / 2, PI, -PI / 2];
    for (const cd of cands) {
      let ry = rys[0];
      if (o.face) { const [fx, fz] = this._pt(o.face); ry = Math.atan2(fx - cd.x, fz - cd.z); if (o.snap !== false) ry = Math.round(ry / (PI / 2)) * (PI / 2); }
      for (const r0 of o.face ? [ry] : rys) {
        const it = this._make(name, cd.x, cd.z, r0, o);
        if (this.valid(it, o)) return this._commit(it, o);
      }
    }
    return null;
  }

  /** Put a small item on top of a surface item. o: { at:'center'|'left'|'right'|number(-1..1), depth: -1..1, ry, tint } */
  top(parent, name, o = {}) {
    if (!parent) return null;
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const pw = parent.c.size[0], pd = parent.c.size[2];
    const w = c.size[0], d = c.size[2];
    if (w > pw + 0.02 || d > pd + 0.02) return null;
    parent.tops ??= [];
    const at = o.at ?? 'center';
    const span = Math.max(0, pw - w - 0.06);
    const cands = [];
    const lx = typeof at === 'number' ? at * span / 2 : at === 'left' ? -span / 2 : at === 'right' ? span / 2 : 0;
    cands.push(lx);
    for (let k = -4; k <= 4; k++) cands.push(k * span / 8);
    const dz = (o.depth ?? 0) * Math.max(0, pd - d - 0.04) / 2;
    for (const px of cands) {
      const ok = parent.tops.every((t) => Math.abs(t.px - px) >= (t.w + w) / 2 + 0.02 || Math.abs(t.pz - dz) >= (t.d + d) / 2 + 0.02);
      if (!ok) continue;
      const cs = Math.cos(parent.ry), sn = Math.sin(parent.ry);
      const cx = parent.x + px * cs + dz * sn, cz = parent.z - px * sn + dz * cs;
      const it = this._make(name, cx, cz, parent.ry + (o.ry ?? 0), o);
      it.floor = false; it.top = true; it.block = false; it.parent = parent; it.px = px; it.pz = dz;
      it.y = parent.y + parent.c.size[1] + (parent.c.topAdd ?? 0); it.zones = [];
      parent.tops.push({ px, pz: dz, w, d });
      return this._commit(it, o);
    }
    return null;
  }

  /** Hang a decal/frame/mirror/etc. on a wall. o: { at, y, w, h, def, tint, decal, over: item (hang above item) } */
  hang(name, walls = 'any', o = {}) {
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const list = walls === 'any' ? WALLS : Array.isArray(walls) ? walls : [walls];
    const w = o.w ?? c.size[0], h = o.h ?? c.size[1], depth = c.size[2];
    const y0 = o.y ?? c.y ?? 1.3;
    if (y0 + h > this.h - 0.05) return null;
    const cands = [];
    for (const wall of list) {
      const wi = wallInfo(this.r, wall);
      const lo = wi.lo + w / 2 + 0.08, hi = wi.hi - w / 2 - 0.08;
      if (hi < lo) continue;
      const mid = (lo + hi) / 2;
      const us = new Set([mid]);
      for (let u = lo; u <= hi + 1e-6; u += 0.1) us.add(r2(u));
      for (const ob of this.obs[wall]) { us.add(r2(ob.u0 - w / 2 - 0.12)); us.add(r2(ob.u1 + w / 2 + 0.12)); }
      if (o.over) us.add(r2(o.over.wallSide === wall ? o.over.u : mid));
      for (const u of us) {
        if (u < lo - 1e-6 || u > hi + 1e-6) continue;
        let s = this._scoreAlong(o, u, wi.lo, wi.hi, wall, w) + this.rng.next() * (o.jitter ?? 0.4);
        if (o.over) { const [px, pz] = wallPoint(this.r, wall, u, 0.2); s -= Math.hypot(px - o.over.x, pz - o.over.z) * 3; }
        cands.push({ wall, u, s });
      }
    }
    cands.sort((a, b) => b.s - a.s);
    for (const cd of cands) {
      if (!this._wallFree(cd.wall, cd.u - w / 2, cd.u + w / 2, y0, y0 + h, depth, o)) continue;
      const wi = wallInfo(this.r, cd.wall);
      const [cx, cz] = wallPoint(this.r, cd.wall, cd.u, depth / 2 + 0.003);
      const it = this._make(name, cx, cz, wi.ry, o);
      it.floor = false; it.wall = true; it.block = false; it.y = (this.room.y ?? 0) + y0; it.h = h; it.w = w; it.zones = [];
      it.wallSide = cd.wall; it.u = cd.u;
      it.wallSlot = { wall: cd.wall, u0: cd.u - w / 2, u1: cd.u + w / 2, y0, y1: y0 + h };
      this.decor[cd.wall].push(it.wallSlot);
      return this._commit(it, o);
    }
    return null;
  }
  _wallFree(wall, u0, u1, y0, y1, depth, o = {}) {
    for (const ob of this.obs[wall]) {
      if (u1 <= ob.u0 - 0.05 || u0 >= ob.u1 + 0.05) continue;
      if (ob.kind === 'door') { if (y0 < (ob.h ?? 2.1) + 0.1) return false; }
      else if (y1 > ob.sill - 0.08 && y0 < ob.top + 0.08) return false;
    }
    for (const s of this.decor[wall]) if (u1 > s.u0 - 0.04 && u0 < s.u1 + 0.04 && y1 > s.y0 - 0.04 && y0 < s.y1 + 0.04) return false;
    const wi = wallInfo(this.r, wall);
    const slab = wi.ax === 'x'
      ? mkObb((u0 + u1) / 2, wi.base + wi.nz * depth / 2, u1 - u0, depth, 0)
      : mkObb(wi.base + wi.nx * depth / 2, (u0 + u1) / 2, depth, u1 - u0, 0);
    for (const b of this.items) {
      if (!b.floor || !b.block) continue;
      if (b.h <= y0 + 0.04) continue;                    // the decor hangs above this piece of furniture
      if (obbOverlap(slab, b.ob, 0.01)) return false;    // furniture flush against the wall would swallow the decor
    }
    return true;
  }

  /** A hanging ceiling item (fan, bulb, cage): hung at the room centre or an explicit point. */
  ceil(name, x, z, o = {}) {
    const c = o.def ?? CATALOG[name];
    const it = this._make(name, x, z, o.ry ?? 0, o);
    it.floor = false; it.block = false; it.ceil = true; it.zones = []; it.y = (this.room.y ?? 0) + this.h; it.h = c.size[1];
    return this._commit(it, o);
  }

  // ---------------------------------------------------------------- runs of units along a wall (kitchen counters, shelves)
  /** Largest free stretch of a wall (between door obstacles): { lo, hi }. */
  freeStretches(wall, minLen = 0.3) {
    const wi = wallInfo(this.r, wall);
    const doors = this.obs[wall].filter((o) => o.kind === 'door').sort((a, b) => a.u0 - b.u0);
    const out = []; let cur = wi.lo;
    for (const d of doors) { if (d.u0 - 0.1 - cur >= minLen) out.push({ lo: cur, hi: d.u0 - 0.1 }); cur = Math.max(cur, d.u1 + 0.1); }
    if (wi.hi - cur >= minLen) out.push({ lo: cur, hi: wi.hi });
    return out.sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
  }
  /** Place named units shoulder to shoulder along one wall, starting from the corner. Returns the placed items. */
  run(wall, names, o = {}) {
    const placed = [];
    const wi = wallInfo(this.r, wall);
    const fs = this.freeStretches(wall, 0.5);
    if (!fs.length) return placed;
    const st = o.stretch ? fs[Math.min(o.stretch, fs.length - 1)] : fs[0];
    let u = o.fromEnd ? st.hi : st.lo;
    const dir = o.fromEnd ? -1 : 1;
    for (const name of names) {
      const c = CATALOG[name]; if (!c) continue;
      const w = c.size[0], d = c.size[2];
      const cu = u + dir * w / 2;
      if (cu - w / 2 < st.lo - 1e-6 || cu + w / 2 > st.hi + 1e-6) {
        if (o.skipMissing) continue; else break;
      }
      const [cx, cz] = wallPoint(this.r, wall, cu, d / 2 + 0.005);
      const it = this._make(name, cx, cz, wi.ry, o);
      if (this.valid(it, { ...o })) { it.wallSide = wall; it.u = cu; this._commit(it, o); placed.push(it); u += dir * w; }
      else if (o.skipMissing) continue; else break;
    }
    return placed;
  }

  // ---------------------------------------------------------------- connectivity (door landings must stay connected at >= 0.7 m)
  /** Grid flood fill over the free floor. inflate = clearance each side of a blocker (0.375 -> 0.75 m passages). */
  connectivity(inflate = 0.4, cell = 0.1) {
    const r = this.r, nx = Math.max(1, Math.round(this.W / cell)), nz = Math.max(1, Math.round(this.D / cell));
    const cw = this.W / nx, ch = this.D / nz;
    const blk = new Uint8Array(nx * nz);
    const edge = 0.38;                                  // the kernel keeps a 0.3 m body (+ margin) off every wall
    for (let iz = 0; iz < nz; iz++) {
      const z = r.z0 + (iz + 0.5) * ch, zb = z < r.z0 + edge || z > r.z1 - edge;
      for (let ix = 0; ix < nx; ix++) { const x = r.x0 + (ix + 0.5) * cw; if (zb || x < r.x0 + edge || x > r.x1 - edge) blk[iz * nx + ix] = 1; }
    }
    for (const it of this.blockers()) {                 // stamp only the neighbourhood of each blocker
      const cs = obbCorners(it.ob);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of cs) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const i0 = Math.max(0, Math.floor((x0 - inflate - r.x0) / cw)), i1 = Math.min(nx - 1, Math.floor((x1 + inflate - r.x0) / cw));
      const j0 = Math.max(0, Math.floor((z0 - inflate - r.z0) / ch)), j1 = Math.min(nz - 1, Math.floor((z1 + inflate - r.z0) / ch));
      for (let iz = j0; iz <= j1; iz++) for (let ix = i0; ix <= i1; ix++) {
        const k = iz * nx + ix; if (blk[k]) continue;
        if (obbDist(it.ob, r.x0 + (ix + 0.5) * cw, r.z0 + (iz + 0.5) * ch) < inflate) blk[k] = 1;
      }
    }
    const cellOf = (x, z) => [Math.min(nx - 1, Math.max(0, Math.floor((x - r.x0) / cw))), Math.min(nz - 1, Math.max(0, Math.floor((z - r.z0) / ch)))];
    const free = (ix, iz) => ix >= 0 && iz >= 0 && ix < nx && iz < nz && !blk[iz * nx + ix];
    // snap each landing to the nearest free cell within 0.2 m (a larger radius could jump a thin barrier)
    const srcs = [];
    for (const l of this.landings) {
      let [ix, iz] = cellOf(l.x, l.z), found = null;
      for (let rad = 0; rad <= 2 && !found; rad++) for (let dz = -rad; dz <= rad && !found; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        if (free(ix + dx, iz + dz)) { found = [ix + dx, iz + dz]; break; }
      }
      srcs.push({ l, cell: found });
    }
    const comp = new Int32Array(nx * nz).fill(-1); let nc = 0;
    const stack = new Int32Array(nx * nz);
    const flood = (sx, sz) => {
      let sp = 0; stack[sp++] = sz * nx + sx; comp[sz * nx + sx] = nc;
      while (sp) {
        const k = stack[--sp], x = k % nx, z = (k - x) / nx;
        if (x + 1 < nx && !blk[k + 1] && comp[k + 1] < 0) { comp[k + 1] = nc; stack[sp++] = k + 1; }
        if (x > 0 && !blk[k - 1] && comp[k - 1] < 0) { comp[k - 1] = nc; stack[sp++] = k - 1; }
        if (z + 1 < nz && !blk[k + nx] && comp[k + nx] < 0) { comp[k + nx] = nc; stack[sp++] = k + nx; }
        if (z > 0 && !blk[k - nx] && comp[k - nx] < 0) { comp[k - nx] = nc; stack[sp++] = k - nx; }
      }
      nc++;
    };
    for (const s of srcs) if (s.cell && comp[s.cell[1] * nx + s.cell[0]] < 0) flood(s.cell[0], s.cell[1]);
    const ids = srcs.map((s) => (s.cell ? comp[s.cell[1] * nx + s.cell[0]] : -2));
    const lost = srcs.filter((s) => !s.cell).length;     // landings that furniture (or the edge band) covers completely
    const ok = srcs.length < 2 ? lost <= (this._base?.lost ?? 0) : ids.every((i) => i === ids[0] && i >= 0);
    let orphan = 0;                                      // free floor that no door can reach (walled-off pockets)
    for (let k = 0; k < comp.length; k++) if (!blk[k] && comp[k] < 0) orphan++;
    return { ok, ids, srcs, comp, nx, nz, blk, cellOf, orphan, lost, main: ids.find((i) => i >= 0) ?? -1 };
  }
  /** How split the room is: pieces the landings fall into, landings buried in furniture, and free cells no landing reaches (0.01 m2 each). */
  _connScore() {
    const c = this.connectivity();
    return { comps: new Set(c.ids.map((id, i) => (id >= 0 ? id : -100 - i))).size, orphan: c.orphan, lost: c.lost };
  }
  /** Would the room stay as connected as it started if `it` (a blocker candidate) stood here? Pockets up to ~0.4 m2 are tolerated. */
  _connOk(it) {
    this.items.push(it);
    try {
      const a = this._connScore(), b = this._base ?? { comps: 1, orphan: 0, lost: 0 };
      return a.comps <= b.comps && a.lost <= b.lost && a.orphan <= Math.max(b.orphan, 40);
    } finally { this.items.pop(); }
  }
  _needsAccess(it) { return !!it.c.seat || ['bed', 'cot', 'bunk', 'mattress'].includes(it.c.arch); }
  /** Can a person walk up to `it` from the doors (a free main-region cell within reach of its centre)? */
  _accessOk(it, present = false) {
    if (!present) this.items.push(it);
    try {
      const c = this.connectivity();
      return this.inMainRegion(it.x, it.z, c, Math.ceil((Math.hypot(it.w, it.d) / 2 + 0.8) / 0.1));
    } finally { if (!present) this.items.pop(); }
  }
  /** Is (x,z) on the walkable floor that connects the doors? (anchors use this so nobody is placed in a walled-off pocket) */
  inMainRegion(x, z, c = this.connectivity(), maxCells = 4) {
    if (c.main < 0) return true;
    const [ix, iz] = c.cellOf(x, z);
    for (let rad = 0; rad <= maxCells; rad++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
      const X = ix + dx, Z = iz + dz;
      if (X >= 0 && Z >= 0 && X < c.nx && Z < c.nz && c.comp[Z * c.nx + X] === c.main) return true;
    }
    return false;
  }
  /** Remove the least valuable items until every landing is connected. Returns removed items. */
  heal() {
    const removed = [];
    // seats and beds that later furniture walled in: drop the seat (or, for an essential bed, its lowest-priority neighbour)
    for (let guard = 0; guard < 24; guard++) {
      const bad = this.items.filter((i) => i.floor && this._needsAccess(i) && !this._accessOk(i, true));
      if (!bad.length) break;
      const b = bad[0];
      let victim = b.prio > 0 ? b : null;
      if (!victim) {
        const near = this.blockers().filter((o) => o !== b && o.prio > 0 && Math.hypot(o.x - b.x, o.z - b.z) < 2.2).sort((p, q) => q.prio - p.prio);
        victim = near[0] ?? null;
      }
      if (!victim) break;
      this.remove(victim); removed.push(victim);
    }
    for (let guard = 0; guard < 40; guard++) {
      const c = this.connectivity();
      if (c.ok) break;
      const main = c.ids.filter((i) => i >= 0);
      const lead = main.length ? main.sort((a, b) => main.filter((x) => x === b).length - main.filter((x) => x === a).length)[0] : -1;
      const bad = c.srcs.find((s, i) => c.ids[i] !== lead);
      const goodS = c.srcs.find((s, i) => c.ids[i] === lead) ?? c.srcs[0];
      const a = bad?.l ?? this.landings[0], b = goodS?.l ?? this.landings[1] ?? a;
      let cands = this.blockers().filter((it) => it.prio > 0);
      if (!cands.length) cands = this.blockers();
      if (!cands.length) break;
      const segD = (it) => {              // distance of the item to the segment a-b
        const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((it.x - a.x) * vx + (it.z - a.z) * vz) / l2));
        return Math.hypot(it.x - (a.x + vx * t), it.z - (a.z + vz * t));
      };
      cands.sort((p, q) => (q.prio - p.prio) || (segD(p) - segD(q)));
      const victim = cands[0];
      this.remove(victim); removed.push(victim);
    }
    return removed;
  }
}
