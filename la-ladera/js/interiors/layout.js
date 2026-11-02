// Placement engine for one room: rect + openings + stairs -> keep-outs, then constraint-checked placement of catalogue items
// (against walls, free-standing, on top of furniture, hung on walls), and a door-to-door connectivity self-heal.
// PURE DATA (no THREE, no DOM). All coordinates are the building-local frame (+x width axis, +z street side, +y up).
import { CATALOG, PAL } from './catalog.js';
import { stairWalls } from './stairwall.js';

export const WALLS = ['-z', '+z', '-x', '+x'];
const PI = Math.PI;
const r2 = (v) => Math.round(v * 1000) / 1000;
/** How far from a roof door's landing point (`entrance.outside`) the deck stays free of furniture: the disc a person steps onto when the door opens. */
export const ROOF_CLEAR = 0.9;

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
export function mkObb(cx, cz, w, d, ry) { return mkObbSC(cx, cz, w, d, ry, Math.cos(ry), Math.sin(ry)); }
/** `mkObb` with the cosine and sine of `ry` already in hand (`_make` needs the sine for its own test). */
function mkObbSC(cx, cz, w, d, ry, c, s) { return { cx, cz, hx: w / 2, hz: d / 2, ry, ux: [c, -s], uz: [s, c] }; }
// The corners of a box, in the order (-1,-1), (1,-1), (1,1), (-1,1) of its (width, depth) half-extents. Every caller takes the corner from these two expressions, so none of them allocates one.
const CORNER_A = [-1, 1, 1, -1], CORNER_B = [-1, -1, 1, 1];
function cornerX(o, a, b) { return o.cx + o.ux[0] * a * o.hx + o.uz[0] * b * o.hz; }
function cornerZ(o, a, b) { return o.cz + o.ux[1] * a * o.hx + o.uz[1] * b * o.hz; }
export function obbCorners(o) {
  const out = [];
  for (let i = 0; i < 4; i++) out.push([cornerX(o, CORNER_A[i], CORNER_B[i]), cornerZ(o, CORNER_A[i], CORNER_B[i])]);
  return out;
}
const _ext = new Float64Array(4);
/** [x0, x1, z0, z1]: the axis-aligned extent of a box's corners (the min and max `obbCorners` gives, taken in its order). The array is a shared scratch: read it before the next call. */
function obbExtent(o) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = cornerX(o, CORNER_A[i], CORNER_B[i]), z = cornerZ(o, CORNER_A[i], CORNER_B[i]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  _ext[0] = x0; _ext[1] = x1; _ext[2] = z0; _ext[3] = z1;
  return _ext;
}
/** SAT overlap. m > 0 requires m metres of separation; m < 0 tolerates |m| of penetration (touching items). The four axes are the two of each box, tried in that order, with the
 *  same arithmetic as the loop this unrolls. The dot products that two axes share (a.ux . b.ux is also b.ux . a.ux) are taken once: the same two products added in the same order,
 *  so the same bits. */
export function obbOverlap(a, b, m = 0) {
  const dx = b.cx - a.cx, dz = b.cz - a.cz;
  const au = a.ux, av = a.uz, bu = b.ux, bv = b.uz;
  const au0 = au[0], au1 = au[1], av0 = av[0], av1 = av[1], bu0 = bu[0], bu1 = bu[1], bv0 = bv[0], bv1 = bv[1];
  const ahx = a.hx, ahz = a.hz, bhx = b.hx, bhz = b.hz;
  const aXZ = Math.abs(au0 * av0 + au1 * av1), cXX = Math.abs(au0 * bu0 + au1 * bu1), cXZ = Math.abs(au0 * bv0 + au1 * bv1);
  // axis a.ux
  let ra = ahx * Math.abs(au0 * au0 + au1 * au1) + ahz * aXZ, rb = bhx * cXX + bhz * cXZ;
  if (Math.abs(dx * au0 + dz * au1) >= ra + rb + m) return false;
  // axis a.uz
  const cZX = Math.abs(av0 * bu0 + av1 * bu1), cZZ = Math.abs(av0 * bv0 + av1 * bv1);
  ra = ahx * aXZ + ahz * Math.abs(av0 * av0 + av1 * av1); rb = bhx * cZX + bhz * cZZ;
  if (Math.abs(dx * av0 + dz * av1) >= ra + rb + m) return false;
  // axis b.ux
  const bXZ = Math.abs(bu0 * bv0 + bu1 * bv1);
  ra = ahx * cXX + ahz * cZX; rb = bhx * Math.abs(bu0 * bu0 + bu1 * bu1) + bhz * bXZ;
  if (Math.abs(dx * bu0 + dz * bu1) >= ra + rb + m) return false;
  // axis b.uz
  ra = ahx * cXZ + ahz * cZZ; rb = bhx * bXZ + bhz * Math.abs(bv0 * bv0 + bv1 * bv1);
  if (Math.abs(dx * bv0 + dz * bv1) >= ra + rb + m) return false;
  return true;
}
/** Distance from a point to an OBB (0 inside). `Math.hypot(e, 0)` is `e` exactly, so a point level with a face skips the call. */
export function obbDist(o, x, z) {
  const dx = x - o.cx, dz = z - o.cz;
  const lx = Math.abs(dx * o.ux[0] + dz * o.ux[1]), lz = Math.abs(dx * o.uz[0] + dz * o.uz[1]);
  const ex = Math.max(0, lx - o.hx), ez = Math.max(0, lz - o.hz);
  return ez === 0 ? ex : ex === 0 ? ez : Math.hypot(ex, ez);
}
/** Does the segment (ax, az) -> (bx, bz) cross the box (or come within `m` m of it)? A slab test in the box's own frame. */
export function segObb(o, ax, az, bx, bz, m = 0) {
  const pax = ax - o.cx, paz = az - o.cz, pbx = bx - o.cx, pbz = bz - o.cz;
  const x0 = pax * o.ux[0] + paz * o.ux[1], z0 = pax * o.uz[0] + paz * o.uz[1], x1 = pbx * o.ux[0] + pbz * o.ux[1], z1 = pbx * o.uz[0] + pbz * o.uz[1];
  let t0 = 0, t1 = 1;
  for (const [p, d, h] of [[x0, x1 - x0, o.hx + m], [z0, z1 - z0, o.hz + m]]) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return false; continue; }
    let ta = (-h - p) / d, tb = (h - p) / d; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
const rectObb = (r) => mkObb((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, 0);
/** `rectObb` of the rect (x0, x1, z0, z1) that stands for the keep-out `k`, cached on `k` and rebuilt whenever one of the four sides differs from the cached one (relaxKeeps and laneEntrance
 *  move a keep-out's sides in place). The box is a pure function of the four sides, so a hit is exactly what a rebuild would return; nothing ever writes to a cached box. */
const _rectObbs = new WeakMap();
function cachedRectObb(k, x0, x1, z0, z1) {
  const e = _rectObbs.get(k);
  if (e !== undefined && e.x0 === x0 && e.x1 === x1 && e.z0 === z0 && e.z1 === z1) return e.obb;
  const obb = rectObb({ x0, x1, z0, z1 });
  if (e === undefined) _rectObbs.set(k, { x0, x1, z0, z1, obb }); else { e.x0 = x0; e.x1 = x1; e.z0 = z0; e.z1 = z1; e.obb = obb; }
  return obb;
}
const _winZones = new WeakMap();
let _stack = new Int32Array(4096);                    // the flood fill's stack, shared by every `connectivity()` call (grown when a room needs more)
/** How many different values `new Set(ids.map((id, i) => (id >= 0 ? id : -100 - i))).size` holds: the pieces the landings fall into, each landing buried in furniture counted as a piece of its own. */
function distinctComps(ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i++) {
    const v = ids[i] >= 0 ? ids[i] : -100 - i;
    let seen = false;
    for (let j = 0; j < i && !seen; j++) seen = (ids[j] >= 0 ? ids[j] : -100 - j) === v;
    if (!seen) n++;
  }
  return n;
}

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

/** What a room is DEFINED by survives healing longest. heal() takes the clutter out first (prio), then, among pieces of the same priority, plain furniture, then the fridge,
 *  the basin and the shower, and the stove, the sink, the toilet and the beds last: a kitchen that lost its stove to open a lane (A2's 1.9 m wide L25 kitchen) is not a kitchen. */
const FIXTURE_RANK = [[/^(stove_|sink_|lavadero$|toilet$|bed_|mattress_(leaning|floor)$)/, 3], [/^(shower_|basin_)/, 2], [/^fridge/, 1]];
export const fixtureRank = (it) => { for (const [re, k] of FIXTURE_RANK) if (re.test(it.name)) return k; return 0; };

const COOK_REACH = 1.2;                    // the farthest from a stove's middle a cook is placed (a stove is 0.6 m deep and the cook stands 0.5 m off its face)

/** What `curePockets` may slide (never the plumbing, the cooker, a counter or anything else fixed to a wall) and what it may drop (clutter only: no seat, table or storage). */
const SHIFTABLE = new Set(['bed', 'bunk', 'cot', 'mattress', 'cabinet', 'sofa', 'armchair', 'chair', 'stool', 'table', 'tableRound', 'desk', 'dresser', 'shelf', 'chest', 'plant', 'cylinder', 'sacks', 'cans', 'tires', 'wheelbarrow', 'crates', 'rack', 'bench', 'vitrine', 'wallunit']);
const DROPPABLE = new Set(['plant', 'cylinder', 'sacks', 'cans', 'tires', 'wheelbarrow', 'crates', 'rack']);
/** The dead-end pockets (`Layout.pockets`) the layout must not leave: deeper than 0.9 m, or deeper than 0.3 m behind a mouth under ~0.62 m (the measured `gap` runs a few cm high, so 0.66). */
export const POCKET = { deep: 0.9, shallow: 0.3, squeeze: 0.66 };
export const seriousPocket = (p) => p.depth >= POCKET.deep || (p.depth >= POCKET.shallow && p.gap <= POCKET.squeeze);

let _uid = 0;
export const resetUid = () => { _uid = 0; };
/** The id counter belongs to the building being furnished: a resumable furnish job (index.js `furnishSteps`, driven by lazy.js) saves it when it yields and puts it back when it resumes. */
export const getUid = () => _uid;
export const setUid = (v) => { _uid = v; };

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
        if (ix >= r.x0 - 0.15 && ix <= r.x1 + 0.15 && iz >= r.z0 - 0.15 && iz <= r.z1 + 0.15) this.keep.push({ why: 'entrance', wall: s.wall, uc: s.u, ...this._wallRect(s.wall, s.u - w / 2 - 0.1, s.u + w / 2 + 0.1, 3.0) });
      }
      // a roof door (the caseta onto the deck): its landing, the point `outside` 1.3 m out on the deck, stays free of everything a person would walk into; a chair or a pot
      // there is a chair or a pot underfoot (A5's R2a sweep found 55 of the 64 decks with something on it). The keep is the square round the 0.9 m disc, doorway to its far side.
      if (ent?.kind === 'roof' && ent.outside && bp.frame?.toLocal) {
        const [ox, , oz] = bp.frame.toLocal(...ent.outside);
        if (ox >= r.x0 - 0.05 && ox <= r.x1 + 0.05 && oz >= r.z0 - 0.05 && oz <= r.z1 + 0.05) {
          this.keep.push({ why: 'roof', wall: s.wall, ...this._wallRect(s.wall, s.u - ROOF_CLEAR, s.u + ROOF_CLEAR, Math.hypot(ox - d.x, oz - d.z) + ROOF_CLEAR) });
        }
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
    this.sw = stairWalls(bp, room, r);                 // a stair core: which stretches of wall take nothing, and how high the step in front of the rest is (hang())
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
    const k = { why: kind, wall, u0: u0 - 0.05, u1: u1 + 0.05, depth, door: extra.door, ...this._wallRect(wall, u0 - 0.05, u1 + 0.05, depth) };
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
  /** The street door's 3 m entrance narrowed to a lane `width` m wide, straight in from the middle of the doorway (a 1.8 m shutter in a 2.4 m wide shop would keep 2.0 m of its
   *  width bare, and the counter, the tables or the barber's chair then have no wall). A lane that wide is a path the visitor and the tour walk in along. Returns how many shrank. */
  laneEntrance(width = 1.1) {
    let n = 0;
    for (const k of this.keep) {
      if (k.why !== 'entrance' || k.uc == null) continue;
      Object.assign(k, this._wallRect(k.wall, k.uc - width / 2, k.uc + width / 2, 3.0)); n++;
    }
    return n;
  }
  /** The door keep-outs as the leaf really sweeps (A2's `swingClear`: a quarter disc of the opening's width + 5 cm around the hinge post), plus a lane `lane` m deep in front
   *  of the opening where a body steps in, in place of the whole door-wide rectangle of width + 0.08 m. The rectangle's far corner, away from the hinge, is where a 2.0 x 1.4 m
   *  bathroom finds the wall for its basin; the leaf still never touches anything. Rects of doors that swing away from the room (0.75 m) and those already relaxed are left as
   *  they are. Replaces `this.keep` with a new array (keep the old one to put it back) and returns how many doors' rects it replaced. */
  sweepKeeps(lane = 0.7) {
    const doors = new Map((this.bp.doors ?? []).map((d) => [d.id, d]));
    const out = []; let n = 0;
    for (const k of this.keep) {
      const d = k.why === 'door' && k.depth != null && k.depth > 0.76 ? doors.get(k.door) : null;
      if (!d || d.kind === 'shutter' || (!d.double && d.hinge !== 'left' && d.hinge !== 'right')) { out.push(k); continue; }       // no hinge on record: keep the whole rectangle
      n++;
      const w = d.w ?? 0.9, reach = w + 0.05;
      out.push({ ...k, ...this._wallRect(k.wall, k.u0, k.u1, lane), depth: lane });
      const posts = d.double ? [[k.u0 + 0.05, 1, w / 2 + 0.05], [k.u1 - 0.05, -1, w / 2 + 0.05]] : d.hinge === 'left' ? [[k.u0 + 0.05, 1, reach]] : [[k.u1 - 0.05, -1, reach]];
      for (const [uh, sg, rad] of posts) {
        const bands = 8;
        for (let i = 0; i < bands; i++) {
          const t0 = Math.max(rad * i / bands, lane), t1 = rad * (i + 1) / bands;
          if (t1 <= lane + 1e-6) continue;
          const ext = Math.sqrt(Math.max(0, rad * rad - (rad * i / bands) ** 2));        // the band's widest reach (the disc narrows with depth)
          const a = Math.min(uh, uh + sg * ext) - 0.02, b = Math.max(uh, uh + sg * ext) + 0.02;
          out.push({ why: 'door', wall: k.wall, door: k.door, sweep: true, ...this._wallBand(k.wall, a, b, t0, t1) });
        }
      }
    }
    this.keep = out;
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
  /** The part of a wall's rect between `t0` and `t1` metres from the wall. */
  _wallBand(wall, u0, u1, t0, t1) {
    const r = this.r;
    switch (wall) {
      case '-z': return { x0: u0, x1: u1, z0: r.z0 + t0, z1: r.z0 + t1 };
      case '+z': return { x0: u0, x1: u1, z0: r.z1 - t1, z1: r.z1 - t0 };
      case '-x': return { x0: r.x0 + t0, x1: r.x0 + t1, z0: u0, z1: u1 };
      default: return { x0: r.x1 - t1, x1: r.x1 - t0, z0: u0, z1: u1 };
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
    const r = this.r, x0 = r.x0 - tol, x1 = r.x1 + tol, z0 = r.z0 - tol, z1 = r.z1 + tol;
    for (let i = 0; i < 4; i++) {                                    // the four corners of `obbCorners`, in its order, without building them
      const a = CORNER_A[i], b = CORNER_B[i], x = cornerX(ob, a, b), z = cornerZ(ob, a, b);
      if (x < x0 || x > x1 || z < z0 || z > z1) return false;
    }
    return true;
  }
  /** Window zones in front of windows: tall items (top > sill) may not stand there. */
  _windowHit(ob, topH) {
    for (const wall of WALLS) for (const o of this.obs[wall]) {
      if (o.kind !== 'window' || topH <= o.sill - 0.02) continue;
      if (obbOverlap(ob, this._windowZone(wall, o), -0.01)) return true;
    }
    return false;
  }
  /** The 0.45 m deep zone in front of a window, as a box: made once per window, and again if the window or the room's rect has changed since (it is a function of exactly those). */
  _windowZone(wall, o) {
    const r = this.r, e = _winZones.get(o);
    if (e !== undefined && e.wall === wall && e.u0 === o.u0 && e.u1 === o.u1 && e.x0 === r.x0 && e.x1 === r.x1 && e.z0 === r.z0 && e.z1 === r.z1) return e.obb;
    const obb = rectObb(this._wallRect(wall, o.u0 - 0.05, o.u1 + 0.05, 0.45));
    _winZones.set(o, { wall, u0: o.u0, u1: o.u1, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, obb });
    return obb;
  }
  /** First keep-out the footprint overlaps. `lateral` trims that much off each side of a door's keep-out (its 5 cm margin), never the depth in front of the door. */
  _keepHit(ob, lateral = 0) {
    for (const k of this.keep) {
      const ko = k.obb;
      let r;
      if (ko) r = ko;
      else if (lateral && k.u0 != null) r = k.wall === '-z' || k.wall === '+z' ? cachedRectObb(k, k.x0 + lateral, k.x1 - lateral, k.z0, k.z1) : cachedRectObb(k, k.x0, k.x1, k.z0 + lateral, k.z1 - lateral);
      else r = ko ?? cachedRectObb(k, k.x0, k.x1, k.z0, k.z1);
      if (obbOverlap(ob, r, -0.01)) return k;
    }
    return null;
  }
  _frontZone(it) {          // free space needed in front of / behind an item
    const c = it.c, zs = [];
    if (c.clear?.[0] > 0.05) zs.push(mkObb(it.x + Math.sin(it.ry) * (it.d / 2 + c.clear[0] / 2), it.z + Math.cos(it.ry) * (it.d / 2 + c.clear[0] / 2), it.w, c.clear[0], it.ry));
    if (c.clear?.[1] > 0.05) zs.push(mkObb(it.x - Math.sin(it.ry) * (it.d / 2 + c.clear[1] / 2), it.z - Math.cos(it.ry) * (it.d / 2 + c.clear[1] / 2), it.w, c.clear[1], it.ry));
    return zs;
  }
  /** Can a floor item with this footprint sit here? `o.tuck` = the piece (a desk, a sewing table) this seat belongs to: its own front zone is where the chair goes, so only that zone is waived. */
  valid(it, o = {}) {
    this.checks = (this.checks ?? 0) + 1;                // a solver's budget counts the poses it tried
    if (!this.inside(it.ob)) return false;
    for (const k of o.clearOf ?? []) if (k.floor && obbOverlap(it.ob, k.ob, o.clearBy ?? 0.9)) return false;      // keeps `clearBy` m (0.9) off these pieces: two chairs 0.65 m apart make a niche a walker wedges in
    const flat = it.c.size[1] < 0.05;                    // rugs and mats: only avoid each other
    if (!flat) {
      if (this._keepHit(it.ob, o.keepLateral ?? 0) && !o.ignoreKeep) return false;
      if (it.block && it.h > 0.5 && !o.winOk && this._windowHit(it.ob, it.h)) return false;
    }
    const zones = it.block && !o.noClear ? this._frontZone(it) : [];
    for (const b of this.items) {
      if (!b.floor) continue;
      const bflat = b.c.size[1] < 0.05;
      if (flat || bflat) { if (flat && bflat && obbOverlap(it.ob, b.ob, -0.01)) return false; continue; }
      if (obbOverlap(it.ob, b.ob, -0.005)) return false;
      if (it.block && b !== o.tuck) for (const z of b.zones ?? []) if (obbOverlap(it.ob, z, -0.01)) return false;
      if (b.block) for (const z of zones) if (obbOverlap(z, b.ob, -0.01)) return false;
    }
    let flood = null;                                    // the room with `it` in it, flooded once: a seat or a bed asks both questions below of the same flood
    if (it.block && !flat && !o.noConn && it.h >= (o.connAll ? 0.2 : 0.35) && !this._connOk(it, flood = this._floodWith(it))) return false;    // never cut the room in two (>= 0.7 m passages)
    if (!o.noConn && this._needsAccess(it) && !this._accessOk(it, false, flood)) return false;             // a seat or bed someone cannot walk up to is useless
    return true;
  }

  // ---------------------------------------------------------------- item construction
  _make(name, cx, cz, ry, o = {}) {
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const sin = Math.sin(ry), swap = Math.abs(sin) > 0.7071;           // quarter turns swap the footprint extents for AABB purposes
    const w = c.size[0], d = c.size[2];
    const it = {
      id: o.id ?? `${this.room.id}.i${(_uid++).toString(36)}`, name, c, room: this.room.id, floor: true,        // (`o.id`: a pass that runs after the clothes names its pieces itself, so the ids of the clothes' pass and of its own never depend on each other: shelves.js)
      x: r2(cx), z: r2(cz), y: this.room.y ?? 0, ry: r2(ry), w, d, h: c.size[1],
      block: c.block !== false && !c.wall && !c.ceil && c.top !== true && c.size[1] >= 0.2,           // (`top: true` = stands on a surface; a table's `top: 'oilcloth_floral'` is its cloth, and the table blocks)
      prio: o.prio ?? 1, tint: o.tint ?? null, tags: c.tags, ob: mkObbSC(cx, cz, w, d, ry, Math.cos(ry), sin), swap,
    };
    if (c.bh != null) it.bh = c.bh;
    if (o.tuck) it.tuckTo = o.tuck;                         // (a chair pulled up to its desk: it goes where the desk goes)
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
  /** `fn()` with `it` out of the room, as a trial (heal asks whether one piece's going is enough); the room is put back as it was. */
  _without(it, fn) {
    const i = this.items.indexOf(it); if (i < 0) return fn();
    this.items.splice(i, 1);
    try { return fn(); } finally { this.items.splice(i, 0, it); }
  }
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

  /** The wall poses `wall()` tries, best first ([{ wall, u, s }]), and the geometry they share. `o.jitter: 0` draws nothing from the room's stream. */
  _wallCands(name, walls, o) {
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
        cands.push({ wall, u, s: this._scoreAlong(o, u, wi.lo, wi.hi, wall, w) + (o.jitter === 0 ? 0 : this.rng.next() * (o.jitter ?? 0.25)) });
      }
    }
    cands.sort((a, b) => b.s - a.s);
    return { cands, along, off };
  }
  /** Place a floor item against a wall (back to the wall). walls: '-z' | ['-z','+x'] | 'any'. o: { at, gap, near, far, prio, tint, flip } */
  wall(name, walls = 'any', o = {}) {
    const { cands, along, off } = this._wallCands(name, walls, o);
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
  /** Every valid wall pose for an item, best first and lazily (nothing is placed: the caller commits what it takes and removes it again to try the next). The search
   *  space of a fixture solver: `wall()` takes the first of these and stops, which is how a toilet in the first corner leaves a shower no wall. Draws nothing from the stream. */
  *wallPoses(name, walls = 'any', o = {}) {
    const { cands, along, off } = this._wallCands(name, walls, { jitter: 0, ...o });
    for (const cd of cands) {
      const wi = wallInfo(this.r, cd.wall);
      const [cx, cz] = wallPoint(this.r, cd.wall, cd.u, off);
      const ry = wi.ry + (along ? (o.flip ? -PI / 2 : PI / 2) : (o.flip ? PI : 0));
      const it = this._make(name, cx, cz, ry, o);
      if (o.sideNeed && !this._sideFree(it, o.sideNeed)) continue;
      if (this.valid(it, o)) { it.wallSide = cd.wall; it.u = cd.u; yield it; }
    }
  }
  /** Every valid free-standing pose for an item, the one nearest `near` first and lazily (nothing is placed: the caller commits what it takes and removes it again to try the next,
   *  like `wallPoses`). `o.rys` the facings tried at each spot (default one: 0), `o.step` the grid (0.15 m). Draws nothing from the stream. */
  *freePoses(name, near, o = {}) {
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const [tx, tz] = this._pt(near), r = this.r, step = o.step ?? 0.15, hw = c.size[0] / 2, hd = c.size[2] / 2, rys = o.rys ?? [0], cands = [];
    for (let x = r.x0 + hw; x <= r.x1 - hw + 1e-6; x += step) for (let z = r.z0 + hd; z <= r.z1 - hd + 1e-6; z += step) cands.push([x, z, Math.hypot(x - tx, z - tz)]);
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, z] of cands) for (const ry of rys) {
      const it = this._make(name, x, z, ry, o);
      if (this.valid(it, o)) yield it;
    }
  }
  /** What a repack puts back if it finds nothing better. */
  snapshot() { return { items: this.items, decor: Object.fromEntries(WALLS.map((w) => [w, this.decor[w]])), keep: this.keep, fixture: this.fixture, extra: this.extra }; }
  restore(s) { this.items = s.items; for (const w of WALLS) this.decor[w] = s.decor[w]; this.keep = s.keep; this.fixture = s.fixture; this.extra = s.extra; }
  /** Take every placed item off the room again (doors, windows and keep-outs stay): the start of a repack. The arrays are replaced, so a snapshot still holds the old ones. */
  clear() { this.items = []; for (const w of WALLS) this.decor[w] = []; this.fixture = undefined; this.extra = undefined; }
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

  /** Free-standing: search around a target, optionally facing a point/item. o: { near:[x,z]|item, rad, ry, face, step, prio, tint, clearOf: [item], clearBy: m } */
  free(name, o = {}) {
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const [tx, tz] = o.near ? this._pt(o.near) : [(this.r.x0 + this.r.x1) / 2, (this.r.z0 + this.r.z1) / 2];
    const rad = o.rad ?? 1.6, step = o.step ?? 0.1;
    const cands = [], jitter = o.jitter ?? 0.15;
    for (let dx = -rad; dx <= rad + 1e-6; dx += step) for (let dz = -rad; dz <= rad + 1e-6; dz += step) {
      const x = tx + dx, z = tz + dz, h = Math.hypot(dx, dz); if (h > rad) continue;
      cands.push({ x, z, s: -h + this.rng.next() * jitter });
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

  /** Put a small item on top of a surface item. o: { at:'center'|'left'|'right'|number(-1..1), px: metres from the middle of the surface (exactly there or nowhere: a shelf's brackets are in the way), depth: -1..1, ry, tint, id }.
   *  The surface is as wide as the record says (a hung shelf can be cut to a wall: `w`), not as the catalogue's piece. */
  top(parent, name, o = {}) {
    if (!parent) return null;
    const c = o.def ?? CATALOG[name]; if (!c) throw new Error('unknown catalogue item ' + name);
    const pw = parent.w ?? parent.c.size[0], pd = parent.d ?? parent.c.size[2];
    const w = c.size[0], d = c.size[2];
    if (w > pw + 0.02 || d > pd + 0.02) return null;
    parent.tops ??= [];
    const at = o.at ?? 'center';
    const span = Math.max(0, pw - w - 0.06);
    const cands = [];
    const lx = typeof at === 'number' ? at * span / 2 : at === 'left' ? -span / 2 : at === 'right' ? span / 2 : 0;
    if (o.px != null) cands.push(o.px);
    else {
      cands.push(lx);
      for (let k = -4; k <= 4; k++) cands.push(k * span / 8);
    }
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
        const dy = this.sw ? this.sw.lift(wall, u - w / 2, u + w / 2) : 0;       // a stair core: the step in front of this stretch of wall (null: the open side of a landing, the nook under a flight)
        if (dy === null) continue;
        let s = this._scoreAlong(o, u, wi.lo, wi.hi, wall, w) + this.rng.next() * (o.jitter ?? 0.4);
        if (o.over) { const [px, pz] = wallPoint(this.r, wall, u, 0.2); s -= Math.hypot(px - o.over.x, pz - o.over.z) * 3; }
        cands.push({ wall, u, s, dy });
      }
    }
    cands.sort((a, b) => b.s - a.s);
    for (const cd of cands) {
      const ys = y0 + cd.dy;                                                       // the height above the room's floor: the usual height above the step in front of it
      if (cd.dy && ys + h > this.h - 0.05) continue;
      if (!this._wallFree(cd.wall, cd.u - w / 2, cd.u + w / 2, ys, ys + h, depth, o)) continue;
      const wi = wallInfo(this.r, cd.wall);
      const [cx, cz] = wallPoint(this.r, cd.wall, cd.u, depth / 2 + 0.003);
      const it = this._make(name, cx, cz, wi.ry, o);
      it.floor = false; it.wall = true; it.block = false; it.y = (this.room.y ?? 0) + ys; it.h = h; it.w = w; it.zones = [];
      it.wallSide = cd.wall; it.u = cd.u;
      if (o.over) it.overOf = o.over;                                              // (a picture over a bed: it goes where the bed goes)
      it.wallSlot = { wall: cd.wall, u0: cd.u - w / 2, u1: cd.u + w / 2, y0: ys, y1: ys + h, d: depth };
      this.decor[cd.wall].push(it.wallSlot);
      return this._commit(it, o);
    }
    return null;
  }
  /** The floor plan of a hung piece `depth` deep on `wall` between `u0` and `u1`: the slab of room it takes. */
  _slab(wall, u0, u1, depth) {
    const wi = wallInfo(this.r, wall);
    return wi.ax === 'x'
      ? mkObb((u0 + u1) / 2, wi.base + wi.nz * depth / 2, u1 - u0, depth, 0)
      : mkObb(wi.base + wi.nx * depth / 2, (u0 + u1) / 2, depth, u1 - u0, 0);
  }
  _wallFree(wall, u0, u1, y0, y1, depth, o = {}) {
    for (const ob of this.obs[wall]) {
      if (u1 <= ob.u0 - 0.05 || u0 >= ob.u1 + 0.05) continue;
      if (ob.kind === 'door') { if (y0 < (ob.h ?? 2.1) + 0.1) return false; }
      else if (y1 > ob.sill - 0.08 && y0 < ob.top + 0.08) return false;
    }
    for (const s of this.decor[wall]) if (u1 > s.u0 - 0.04 && u0 < s.u1 + 0.04 && y1 > s.y0 - 0.04 && y0 < s.y1 + 0.04) return false;
    const slab = this._slab(wall, u0, u1, depth);
    for (const b of this.items) {
      if (!b.floor || !b.block || b === o.inside) continue;                // (`inside`: the piece this thing belongs in - the shower head in the shower's own cubicle)
      if (b.h <= y0 + (o.lap ?? 0.04)) continue;         // the decor hangs above this piece of furniture (`lap`: how far its top may reach up into the decor; a garment's hem must clear it)
      if (obbOverlap(slab, b.ob, 0.01)) return false;    // furniture flush against the wall would swallow the decor
    }
    // a piece hung on the next wall reaches out over this corner (a kitchen cabinet is 0.34 m deep): a shelf hung beside it would pass through its side (13 of the barrio's 444 wall shelves did)
    for (const w2 of WALLS) {
      if (w2 === wall) continue;
      for (const s of this.decor[w2]) {
        if (!(s.d > 0) || y1 <= s.y0 + 0.01 || y0 >= s.y1 - 0.01) continue;
        if (obbOverlap(slab, this._slab(w2, s.u0, s.u1, s.d), 0.01)) return false;
      }
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
    const blk = this._edgeBand(nx, nz, cw, ch).slice();            // a copy of the empty room's mask: the caller keeps `blk`, and reads it
    const items = this.items;
    for (let n = 0; n < items.length; n++) {            // stamp only the neighbourhood of each blocker
      const it = items[n];
      if (!(it.floor && it.block)) continue;            // (`blockers()`)
      const ob = it.ob, e = obbExtent(ob), x0 = e[0], x1 = e[1], z0 = e[2], z1 = e[3];
      const i0 = Math.max(0, Math.floor((x0 - inflate - r.x0) / cw)), i1 = Math.min(nx - 1, Math.floor((x1 + inflate - r.x0) / cw));
      const j0 = Math.max(0, Math.floor((z0 - inflate - r.z0) / ch)), j1 = Math.min(nz - 1, Math.floor((z1 + inflate - r.z0) / ch));
      const ocx = ob.cx, ocz = ob.cz, ux0 = ob.ux[0], ux1 = ob.ux[1], uz0 = ob.uz[0], uz1 = ob.uz[1], hx = ob.hx, hz = ob.hz;
      for (let iz = j0; iz <= j1; iz++) {
        const dz = (r.z0 + (iz + 0.5) * ch) - ocz;
        for (let ix = i0; ix <= i1; ix++) {
          const k = iz * nx + ix; if (blk[k]) continue;
          const dx = (r.x0 + (ix + 0.5) * cw) - ocx;        // `obbDist(ob, x, z) < inflate`, cell by cell
          const ex = Math.max(0, Math.abs(dx * ux0 + dz * ux1) - hx), ez = Math.max(0, Math.abs(dx * uz0 + dz * uz1) - hz);
          if (ez === 0 ? ex < inflate : ex === 0 ? ez < inflate : Math.hypot(ex, ez) < inflate) blk[k] = 1;      // (`Math.hypot(e, 0)` is `e`, as in `obbDist`)
        }
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
    if (_stack.length < nx * nz) _stack = new Int32Array(nx * nz);
    const stack = _stack;                               // (scratch for the flood: each cell is pushed once, and only what the flood itself pushed is read, so nothing stale is seen)
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
  /** The mask `connectivity` starts from: the band of floor along the walls that no body may stand on. It is a function of the room's rect and the grid alone, so it is built once
   *  (and again if the rect or the grid ever differs) and each call copies it. */
  _edgeBand(nx, nz, cw, ch) {
    const r = this.r, c = this._edge;
    if (c !== undefined && c.nx === nx && c.nz === nz && c.cw === cw && c.ch === ch && c.x0 === r.x0 && c.x1 === r.x1 && c.z0 === r.z0 && c.z1 === r.z1) return c.mask;
    const mask = new Uint8Array(nx * nz);
    const edge = 0.38;                                  // the kernel keeps a 0.3 m body (+ margin) off every wall
    for (let iz = 0; iz < nz; iz++) {
      const z = r.z0 + (iz + 0.5) * ch, zb = z < r.z0 + edge || z > r.z1 - edge;
      for (let ix = 0; ix < nx; ix++) { const x = r.x0 + (ix + 0.5) * cw; if (zb || x < r.x0 + edge || x > r.x1 - edge) mask[iz * nx + ix] = 1; }
    }
    this._edge = { nx, nz, cw, ch, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, mask };
    return mask;
  }
  /** How split the room is: pieces the landings fall into, landings buried in furniture, and free cells no landing reaches (0.01 m2 each). */
  _connScore() { return this._scoreOf(this.connectivity()); }
  _scoreOf(c) { return { comps: distinctComps(c.ids), orphan: c.orphan, lost: c.lost }; }
  /** The flood (`connectivity()`) of the room with `it` (a candidate, not placed) standing in it. */
  _floodWith(it, inflate) {
    this.items.push(it);
    try { return this.connectivity(inflate); } finally { this.items.pop(); }
  }
  /** Would the room stay as connected as it started if `it` (a blocker candidate) stood here? Pockets up to ~0.4 m2 are tolerated. `c`: the flood of the room with `it` in it, when the caller has it. */
  _connOk(it, c = this._floodWith(it)) {
    const a = this._scoreOf(c), b = this._base ?? { comps: 1, orphan: 0, lost: 0 };
    return a.comps <= b.comps && a.lost <= b.lost && a.orphan <= Math.max(b.orphan, 40);
  }
  _needsAccess(it) { return !!it.c.seat || ['bed', 'cot', 'bunk', 'mattress', 'stove'].includes(it.c.arch); }       // (a stove too: the cook stands in front of it)
  /** Can a person walk up to `it` from the doors (a free main-region cell within reach of its centre)? A stove: can the cook stand at it? That is the question index.js `emitAnchors` asks for the
   *  cook anchor (a standing spot within 0.9 m of the point 0.5 m in front of it, found with the 0.34 m body), so it is asked here the same way, and the spot must be one a cook can work from
   *  (within `COOK_REACH` of the stove's middle: interiors-data.test.mjs 'anchors' takes no cook further off), so a stove never ends without a cook. `flood`: the flood of the room with `it` in it (a
   *  candidate's: `valid()` has it from the connection test), which every piece but a stove reads; the stove's is another flood (a 0.34 m body). */
  _accessOk(it, present = false, flood = null) {
    if (flood && it.c.arch !== 'stove') return this.inMainRegion(it.x, it.z, flood, Math.ceil((Math.hypot(it.w, it.d) / 2 + 0.8) / 0.1));
    if (!present) this.items.push(it);
    try {
      if (it.c.arch === 'stove') {
        const [x, z] = this.rel(it, 0, it.d / 2 + 0.5), s = this.snapStand(x, z, this.connectivity(0.34));
        return !!s && Math.hypot(s[0] - it.x, s[1] - it.z) <= COOK_REACH;
      }
      const c = this.connectivity();
      return this.inMainRegion(it.x, it.z, c, Math.ceil((Math.hypot(it.w, it.d) / 2 + 0.8) / 0.1));
    } finally { if (!present) this.items.pop(); }
  }
  /** Is (x,z) a place a person can stand: inside the room (0.3 m off the walls), clear of furniture and stair openings, and connected to a door (no walled-off pocket)? */
  standable(x, z, conn = this.connectivity(), clear = 0.27) {
    const r = this.r;
    if (x < r.x0 + 0.3 || x > r.x1 - 0.3 || z < r.z0 + 0.3 || z > r.z1 - 0.3) return false;
    for (const k of this.keep) if (k.why?.startsWith('stair') && x > k.x0 - 0.15 && x < k.x1 + 0.15 && z > k.z0 - 0.15 && z < k.z1 + 0.15) return false;
    const items = this.items;
    for (let i = 0; i < items.length; i++) { const it = items[i]; if (it.floor && it.block && obbDist(it.ob, x, z) < clear) return false; }      // (`blockers()` without the filtered copy)
    return this.inMainRegion(x, z, conn, 4);
  }
  /** The standable point nearest (x,z) within `rad` metres, or null. */
  snapStand(x, z, conn = this.connectivity(), rad = 0.9) {
    if (this.standable(x, z, conn)) return [x, z];
    let best = null, bd = Infinity;
    for (let dx = -rad; dx <= rad + 1e-6; dx += 0.1) for (let dz = -rad; dz <= rad + 1e-6; dz += 0.1) {
      const d = Math.hypot(dx, dz);
      if (d >= bd || d > rad || !this.standable(x + dx, z + dz, conn)) continue;
      best = [x + dx, z + dz]; bd = d;
    }
    return best;
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
  // ---------------------------------------------------------------- pockets (lanes a body can squeeze into and cannot use)
  /** The dead ends of the furnished floor: lanes and niches a 0.6 m walker can squeeze into (every gap on the way >= 0.55 m) that are no part of the comfortable floor (gaps >= 0.85 m)
   *  the doors open on, and that have one way in and no way on. `connectivity()` cannot see them: it blocks every gap under 0.8 m, so a 0.6 m lane between a bed and a wardrobe is not
   *  free floor to it (not even an orphan pocket), and the kernel's walker walks into it all the same and cannot be got out again (the stuck probe's trap clusters; kernel: a gap under
   *  ~0.62 m squeezes the body and the escape lands it inside a furniture outline). The rule: a dead-end gap is closed flush or opened to 0.9 m. Lanes the EMPTY room has (a 0.8 m
   *  corridor) are not counted, only what the furniture makes; a lane with two ends is a short cut, not a pocket.
   *  -> [{ area, cells, x0, x1, z0, z1, cx, cz, mouth: [x, z], by: [item] }], the biggest first. `by`: the blockers within reach of it. */
  pockets(o = {}) {
    const cs = o.cell ?? 0.05, lo = (o.squeeze ?? 0.275) - 1e-6, hi = (o.comfort ?? 0.425) - 1e-6, rimR = o.rim ?? 0.16, minLen = o.minLen ?? 0.3;
    const r = this.r, nx = Math.max(1, Math.round(this.W / cs)), nz = Math.max(1, Math.round(this.D / cs)), cw = this.W / nx, ch = this.D / nz, N = nx * nz;
    const px = (ix) => r.x0 + (ix + 0.5) * cw, pz = (iz) => r.z0 + (iz + 0.5) * ch;
    const PX = new Float64Array(nx), PZ = new Float64Array(nz);       // the cell centres, each made by the expression above
    for (let ix = 0; ix < nx; ix++) PX[ix] = px(ix);
    for (let iz = 0; iz < nz; iz++) PZ[iz] = pz(iz);
    const field = (items) => {                            // distance from each cell centre to the nearest wall or blocker (capped a little over `comfort`)
      const cap = hi + 0.06, f = new Float32Array(N);
      for (let iz = 0; iz < nz; iz++) {
        const z = PZ[iz], dz = Math.min(z - r.z0, r.z1 - z);
        for (let ix = 0; ix < nx; ix++) { const x = PX[ix]; f[iz * nx + ix] = Math.min(cap, dz, x - r.x0, r.x1 - x); }
      }
      for (const it of items) {
        const ob = it.ob, e = obbExtent(ob), x0 = e[0], x1 = e[1], z0 = e[2], z1 = e[3];
        const i0 = Math.max(0, Math.floor((x0 - cap - r.x0) / cw)), i1 = Math.min(nx - 1, Math.floor((x1 + cap - r.x0) / cw));
        const j0 = Math.max(0, Math.floor((z0 - cap - r.z0) / ch)), j1 = Math.min(nz - 1, Math.floor((z1 + cap - r.z0) / ch));
        const ocx = ob.cx, ocz = ob.cz, ux0 = ob.ux[0], ux1 = ob.ux[1], uz0 = ob.uz[0], uz1 = ob.uz[1], hx = ob.hx, hz = ob.hz;
        for (let iz = j0; iz <= j1; iz++) {
          const dz = PZ[iz] - ocz;
          for (let ix = i0; ix <= i1; ix++) {              // `d = obbDist(ob, x, z); if (d < f[k]) f[k] = d`, with the box's fields in hand
            const k = iz * nx + ix, dx = PX[ix] - ocx;
            const ex = Math.max(0, Math.abs(dx * ux0 + dz * ux1) - hx), ez = Math.max(0, Math.abs(dx * uz0 + dz * uz1) - hz);
            const d = ez === 0 ? ex : ex === 0 ? ez : Math.hypot(ex, ez);
            if (d < f[k]) f[k] = d;
          }
        }
      }
      return f;
    };
    const seeds = (mask) => {                             // each landing's nearest cell of the mask within 0.3 m
      const out = [];
      for (const l of this.landings) {
        const ix0 = Math.min(nx - 1, Math.max(0, Math.floor((l.x - r.x0) / cw))), iz0 = Math.min(nz - 1, Math.max(0, Math.floor((l.z - r.z0) / ch)));
        let best = -1, bd = Infinity;
        for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
          const X = ix0 + dx, Z = iz0 + dz;
          if (X < 0 || Z < 0 || X >= nx || Z >= nz || !mask[Z * nx + X]) continue;
          const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = Z * nx + X; }
        }
        if (best >= 0) out.push(best);
      }
      return out;
    };
    const stack = new Int32Array(N);
    const flood = (mask, from) => {                       // the part of the mask the seeds reach (8-neighbour: a gap between two corners is crossed on the diagonal)
      const m = new Uint8Array(N); let sp = 0;
      for (const k of from) if (!m[k]) { m[k] = 1; stack[sp++] = k; }
      while (sp) {                                        // (the eight neighbours written out: which of them exist is the same test as the bounds of the loop it replaces; the mask reached does not depend on the order)
        const k = stack[--sp], x = k % nx, hasL = x > 0, hasR = x + 1 < nx;
        let j;
        if (k >= nx) {
          j = k - nx - 1; if (hasL && mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
          j = k - nx; if (mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
          j = k - nx + 1; if (hasR && mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
        }
        j = k - 1; if (hasL && mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
        j = k + 1; if (hasR && mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
        if (k + nx < N) {
          j = k + nx - 1; if (hasL && mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
          j = k + nx; if (mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
          j = k + nx + 1; if (hasR && mask[j] && !m[j]) { m[j] = 1; stack[sp++] = j; }
        }
      }
      return m;
    };
    const R = Math.ceil(rimR / cs), disc = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if ((dx * dx + dz * dz) * cs * cs <= rimR * rimR) disc.push([dx, dz]);
    const discX = Int32Array.from(disc, (p) => p[0]), discZ = Int32Array.from(disc, (p) => p[1]), discN = disc.length;
    const zone = (items) => {                             // { A: reachable at the squeeze clearance, NZ: of that, what lies beyond the rim of the comfortable floor }
      const f = field(items), A = new Uint8Array(N), B = new Uint8Array(N);
      for (let k = 0; k < N; k++) { if (f[k] >= lo) A[k] = 1; if (f[k] >= hi) B[k] = 1; }
      const Am = flood(A, seeds(A)), Bm = flood(B, seeds(B)), near = new Uint8Array(N);
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
        const k = iz * nx + ix; if (!Bm[k]) continue;
        if (!((ix > 0 && Bm[k - 1]) && (ix + 1 < nx && Bm[k + 1]) && (iz > 0 && Bm[k - nx]) && (iz + 1 < nz && Bm[k + nx]))) {           // an edge cell of the comfortable floor: its rim is near
          for (let q = 0; q < discN; q++) { const X = ix + discX[q], Z = iz + discZ[q]; if (X >= 0 && Z >= 0 && X < nx && Z < nz) near[Z * nx + X] = 1; }
        }
      }
      const NZ = new Uint8Array(N);
      for (let k = 0; k < N; k++) if (Am[k] && !Bm[k] && !near[k]) NZ[k] = 1;
      return { A: Am, NZ, f };
    };
    const key = `${cs}|${lo}|${hi}|${rimR}`;
    if (this._pockKey !== key) { this._pockBase = zone([]).NZ; this._pockKey = key; }       // what the empty room's own shape makes narrow
    const blockers = this.blockers();
    const { A, NZ: nz0, f } = zone(blockers), NZ = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (nz0[k] && !this._pockBase[k]) NZ[k] = 1;
    const lab = new Int32Array(N).fill(-1), found = [];
    const nb8 = (k) => { const x = k % nx, out = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dz) continue; const X = x + dx, j = k + dz * nx + dx; if (X < 0 || X >= nx || j < 0 || j >= N) continue; out.push(j); } return out; };
    for (let k0 = 0; k0 < N; k0++) {
      if (!NZ[k0] || lab[k0] >= 0) continue;
      const cells = [k0]; lab[k0] = k0;
      for (let i = 0; i < cells.length; i++) for (const j of nb8(cells[i])) if (NZ[j] && lab[j] < 0) { lab[j] = k0; cells.push(j); }
      const area = cells.length * cw * ch;
      const touch = cells.filter((k) => nb8(k).some((j) => A[j] && !NZ[j]));        // the cells that meet the rest of the reachable floor: its mouths
      const seen = new Set(), groups = [];
      for (const t of touch) {
        if (seen.has(t)) continue;
        const grp = [t]; seen.add(t);
        for (let i = 0; i < grp.length; i++) { const gx = grp[i] % nx, gz = (grp[i] - gx) / nx; for (const u of touch) { if (seen.has(u)) continue; const ux = u % nx, uz = (u - ux) / nx; if (Math.abs(ux - gx) <= 2 && Math.abs(uz - gz) <= 2) { seen.add(u); grp.push(u); } } }
        groups.push(grp);
      }
      if (groups.length >= 2) continue;
      let sx = 0, sz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const k of cells) { const ix = k % nx, iz = (k - ix) / nx, x = px(ix), z = pz(iz); sx += x; sz += z; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      if (Math.max(x1 - x0, z1 - z0) + cw < minLen) continue;                  // (a lane just over 0.55 m wide is one cell wide: its length is what tells)
      const mo = groups[0] ?? [], mx = mo.length ? mo.reduce((s, k) => s + px(k % nx), 0) / mo.length : sx / cells.length, mz = mo.length ? mo.reduce((s, k) => s + pz(Math.floor(k / nx)), 0) / mo.length : sz / cells.length;
      const samp = cells.filter((_, i) => i % 3 === 0), by = blockers.filter((b) => samp.some((k) => obbDist(b.ob, px(k % nx), pz(Math.floor(k / nx))) < hi + 0.05));
      let depth = 0; for (const k of cells) depth = Math.max(depth, Math.hypot(px(k % nx) - mx, pz(Math.floor(k / nx)) - mz));
      let gap = 0; for (const k of mo) gap = Math.max(gap, f[k] * 2);               // the widest crossing of the mouth
      let fmax = 0; for (const k of cells) fmax = Math.max(fmax, f[k] * 2);
      found.push({ area: +area.toFixed(3), cells: cells.length, depth: +depth.toFixed(2), gap: +gap.toFixed(2), wide: +fmax.toFixed(2), x0, x1, z0, z1, cx: sx / cells.length, cz: sz / cells.length, mouth: [mx, mz], by });
    }
    return found.sort((a, b) => b.area - a.area);
  }
  /** The pockets worth curing (`seriousPocket`): `pockets()` filtered. */
  seriousPockets() { return this.pockets().filter(seriousPocket); }
  /** What goes with a piece when it moves: what stands on it, what is tucked to it or set beside it (a bed's nightstands), what hangs over it. */
  _group(it) {
    const g = [it];
    for (let i = 0; i < g.length; i++) for (const x of this.items) if (!g.includes(x) && (x.parent === g[i] || x.attach === g[i] || x.tuckTo === g[i] || x.overOf === g[i])) g.push(x);
    return g;
  }
  /** Can the group stand `(dx, dz)` further on? Floor pieces are tried as new placements with the group out of the room (inside, keep-outs, windows, overlaps, front zones; the
   *  connectivity of the whole room is judged after the move), and a tall one may not swallow a picture on the wall. */
  _fits(group, dx, dz) {
    const set = new Set(group), all = this.items;
    this.items = all.filter((i) => !set.has(i));
    try {
      for (const m of group) {
        if (!m.floor) continue;
        const ob = { ...m.ob, cx: m.ob.cx + dx, cz: m.ob.cz + dz }, cand = { ...m, x: r2(m.x + dx), z: r2(m.z + dz), ob };
        if (!this.valid(cand, { noConn: true, tuck: m.tuckTo })) return false;
        if (m.block && this.items.some((w) => w.wall && w.wallSlot && m.h > w.wallSlot.y0 + 0.04 && obbOverlap(w.ob, ob, 0.01))) return false;
      }
      return true;
    } finally { this.items = all; }
  }
  /** Move the group by (dx, dz) as one (rigid). A wall piece (the picture over a bed) rides along only if the move is parallel to its wall and the stretch it moves to is free; else it stays.
   *  Returns the undo. */
  _shift(group, dx, dz) {
    const undo = [];
    for (const it of group) {
      let along = 0;
      if (it.wallSide) {                                            // against a wall (a bed's head, a wardrobe, a picture): only a move along it keeps it there
        const wi = wallInfo(this.r, it.wallSide); along = wi.ax === 'x' ? dx : dz;
        if (Math.abs(wi.ax === 'x' ? dz : dx) > 1e-9) { if (it.wall) continue; }
      }
      if (it.wall) {
        const s = it.wallSlot, list = this.decor[it.wallSide], k = list.indexOf(s);
        if (!s) continue;
        if (k >= 0) list.splice(k, 1);
        const free = this._wallFree(it.wallSide, s.u0 + along, s.u1 + along, s.y0, s.y1, it.c.size[2], {});
        if (k >= 0) list.splice(k, 0, s);
        if (!free) continue;
        undo.push({ it, x: it.x, z: it.z, u: it.u, ob: it.ob, zones: it.zones, u0: s.u0, u1: s.u1 });
        s.u0 += along; s.u1 += along;
      } else undo.push({ it, x: it.x, z: it.z, u: it.u, ob: it.ob, zones: it.zones });
      it.x = r2(it.x + dx); it.z = r2(it.z + dz); if (it.u != null && it.wallSide) it.u += along;
      it.ob = { ...it.ob, cx: it.ob.cx + dx, cz: it.ob.cz + dz };
      if (it.zones?.length) it.zones = it.zones.map((z) => ({ ...z, cx: z.cx + dx, cz: z.cz + dz }));
    }
    return () => { for (const o of undo) { const { it } = o; it.x = o.x; it.z = o.z; it.u = o.u; it.ob = o.ob; it.zones = o.zones; if (o.u0 != null) { it.wallSlot.u0 = o.u0; it.wallSlot.u1 = o.u1; } } };
  }
  /** Directions a piece may slide: along its wall if it stands against one, else the four axes. */
  _slides(it) {
    if (it.wallSide) return wallInfo(this.r, it.wallSide).ax === 'x' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    return [[1, 0], [-1, 0], [0, 1], [0, -1]];
  }
  /** Is the room as walkable as `before` says after a move or a drop: no more split, no more beds and seats shut in? */
  _asWalkable(before) {
    const a = this._connScore(), b = before.conn;
    if (!(a.comps <= b.comps && a.lost <= b.lost && a.orphan <= Math.max(b.orphan, 40))) return false;
    let shut = 0; for (const i of this.items) if (i.floor && this._needsAccess(i) && !this._accessOk(i, true)) shut++;
    return shut <= before.shut;
  }
  /** Cure the serious pockets (`seriousPocket`), the biggest first: slide a piece that bounds one (with what goes with it) by the least that closes the pocket flush or opens it to 0.9 m,
   *  else drop a bit of clutter bounding it. A step must take the pocket away from where it was, leave the room with no more pockets than before, and leave it as walkable as before.
   *  -> the clutter it dropped. `o.protect`: pieces it never drops. */
  curePockets(o = {}) {
    const keep = new Set(o.protect ?? []), dropped = [], gave = new Set(), tag = (p) => p.by.map((b) => b.id).join();
    for (let guard = 0; guard < 12; guard++) {
      const all = this.pockets();
      let done = false;
      for (const target of all.filter((p) => seriousPocket(p) && !gave.has(tag(p)))) {
        if (this._easePocket(target, all, keep, dropped)) { done = true; break; }
        gave.add(tag(target));                                       // (this one cannot be cured: do not try it again, go on to the next)
      }
      if (!done) break;
    }
    return dropped;
  }
  /** One pocket: the smallest slide of a bounding piece that cures it, else the first clutter whose going does. True once it is cured. */
  _easePocket(target, all, keep, dropped) {
    const near = (q) => q.x0 - 0.25 <= target.x1 && q.x1 + 0.25 >= target.x0 && q.z0 - 0.25 <= target.z1 && q.z1 + 0.25 >= target.z0;
    const nSerious = all.filter(seriousPocket).length;
    const better = () => { const now = this.pockets(); return !now.some(near) && now.filter(seriousPocket).length < nSerious && now.length < all.length; };
    const state = { conn: this._connScore(), shut: this.items.filter((i) => i.floor && this._needsAccess(i) && !this._accessOk(i, true)).length };
    const movable = target.by.filter((it) => SHIFTABLE.has(it.c.arch)), dead = new Set();
    for (let step = 1; step <= 10; step++) {
      const d = step * 0.05;
      for (const it of movable) for (const [ux, uz] of this._slides(it)) {
        const key = `${it.id}|${ux}|${uz}`; if (dead.has(key)) continue;
        const group = this._group(it);
        if (!this._fits(group, ux * d, uz * d)) { dead.add(key); continue; }
        const undo = this._shift(group, ux * d, uz * d);
        if (better() && this._asWalkable(state)) return true;
        undo();
      }
    }
    for (const it of target.by.filter((i) => i.prio >= 2 && !keep.has(i) && DROPPABLE.has(i.c.arch)).sort((a, b) => b.prio - a.prio)) {       // nothing slides far enough: clutter may go (its tops with it)
      if (this._without(it, () => better() && this._asWalkable(state))) { this.remove(it); dropped.push(it); return true; }
    }
    return false;
  }
  /** Remove the least valuable items until every landing is connected. Returns removed items. `protect`: items that are never removed (the last bed of a bedroom). */
  heal(protect = []) {
    const removed = [], keep = new Set(protect);
    // seats and beds that later furniture walled in: drop the seat (or, for an essential bed, its lowest-priority neighbour)
    for (let guard = 0; guard < 24; guard++) {
      const bad = this.items.filter((i) => i.floor && this._needsAccess(i) && !this._accessOk(i, true));
      if (!bad.length) break;
      const b = bad[0];
      let victim = b.prio > 0 && !keep.has(b) ? b : null;
      for (const reach of [2.2, 3.4]) {                  // the pieces that wall a bed in are not always within 2.2 m of its middle (a 1.9 m bed across a 2.3 m room: a bucket and a cot at 2.7 m)
        if (victim) break;
        const cands = this.blockers().filter((o) => o !== b && o.prio > 0 && !keep.has(o) && Math.hypot(o.x - b.x, o.z - b.z) < reach).sort((p, q) => q.prio - p.prio);
        victim = cands.find((o) => this._without(o, () => this._accessOk(b, true))) ?? cands[0] ?? null;      // the least valuable piece whose going frees it (the gas bottle beside a stove is not what shuts the cook in)
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
      let cands = this.blockers().filter((it) => it.prio > 0 && !keep.has(it));
      if (!cands.length) cands = this.blockers().filter((it) => !keep.has(it));
      if (!cands.length) break;
      const segD = (it) => {              // distance of the item to the segment a-b
        const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((it.x - a.x) * vx + (it.z - a.z) * vz) / l2));
        return Math.hypot(it.x - (a.x + vx * t), it.z - (a.z + vz * t));
      };
      cands.sort((p, q) => (q.prio - p.prio) || (fixtureRank(p) - fixtureRank(q)) || (segD(p) - segD(q)));      // among equals: a counter before a fridge before the stove
      const victim = cands[0];
      this.remove(victim); removed.push(victim);
    }
    return removed;
  }
}
