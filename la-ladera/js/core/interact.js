// Interaction targeting: doors, NPCs, switches, anything the player can press E on.
//
//   ctx.interact.register({
//     id?, kind:'door'|'npc'|'object'|'sit'|..., x, y, z,              // world point (eye-height-ish for doors/NPC heads)
//     radius: 2.4,                                                      // max distance from the eye
//     prompt: 'Abrir puerta'  |  (ctx, it) => string,                  // shown as "E  <prompt>"
//     use(ctx, it) {...},                                              // E pressed while targeted
//     enabled?(ctx, it), aim?: 0.72 (min cos to view dir), ignoreDoor?: doorId (see through own leaf), building? })
//   Items can move: mutate it.x/it.y/it.z every frame (NPCs do), unless they are `static` (below).
//
// POINT targets (everything above) are scored `d * (2.2 - cos)`: the nearest, most centred one wins. That is fine for a door or a neighbour, but
// it hands the aimed object to a nearer one beside it when many small things sit close together (drawer fronts, the contents of a drawer: R4-009).
// So an item can also be SHAPED, and then the view ray itself decides:
//     hit(ctx, it, eye, dir) -> t | -1          your own exact test: metres along the ray to where it enters the object, -1 for a miss
//     x, y, z (centre), hx, hy, hz, ry?, pad?   a box (half extents along its local axes, yaw ry as three's rotation.y, pad 0.04 m added to each)
//     x, y, z (centre), r, pad?                 a sphere
//   A shaped item is offered only while the ray enters it within `radius` (default 2.6) and the sight line is clear: blocker walls are tested from the
//   eye to `t - lead` (lead 0.08 m; for something INSIDE furniture use the carcass depth, ~0.5). Among shaped hits the NEAREST wins; `pri` (higher wins)
//   only breaks ties within 3 cm (the front above what is behind it). A shaped hit beats every point target except one that is nearer than the hit and
//   almost dead centre (cos >= `exact`, 0.97: a neighbour standing in front of the wardrobe). With no shaped hit the point targeting runs as always,
//   and shaped items are never offered when missed.
//   static: true   x, y, z and radius never change after register(): the item goes into a 4 m grid and only the eye's own cell is visited, so
//                  thousands of registered slots cost nothing per frame.
//   group: 'key'   ctx.interact.unregisterGroup('key') drops all of them at once (a container closing, a building left behind).
//
// A shaped item's x, y, z is the THING (its centre; a seat's is its cushion), never the spot a person stands on to use it: whoever aims at an item's point must be aiming at the item (R4-205: a
// probe that looked at a seat's old "use point", chest high in front of the chair, found 13 of 59 seats untargetable).
// SEATS (R2a-004/-005) and DOORS. A seat is a shaped item of kind 'sit', and a shaped hit ranks `SEAT_BONUS` (0.3 m) nearer than it is, like a person: the stool
// under a price list, the armchair behind the coffee table's pad, are not lost to the thing in front by the width of a pad. And a POINT target the aim cone
// refuses (cos < aim) is still offered when it is within 0.7 m (a door you stand in front of, whichever way you look): not while the crosshair is ON a shaped
// item (its box is entered within reach, offered or not: a seat across a table is out of reach, yet the door at your elbow is not what you are looking at).
//
// PEOPLE (R3-003) are shaped too, and must not lose to the counter, the till or the door beside them. An item can say
//   bonus: 0.3     its hit ranks as if it were this many metres nearer (among shaped hits): a drawer front 20 cm in front of the baker does not take the aim
//                  from the baker, a bread box 90 cm in front of the baker's face (the ray enters it first) does;
//   firm: true     a point target (a door, a switch) never takes the aim from its hit, however centred and near it is; only another shaped hit can;
//   soft: true     when the ray misses the shape the item is still offered as a plain point target (a person beside the crosshair, as before);
//   tall: 1.5      its sight line is stopped only by a wall at least this tall above the player's knees (a room wall, a shut door, a wardrobe), not by the
//                  counter or the shelf the person is standing behind (physics.segmentBlocked's `tall`).
// `PERSON` bundles all four with `hit: personHit` (a capsule round the item's point: x, y = about the chest, z); the people module registers `...PERSON`.
export const CELL = 4;                       // grid cell (metres) of the static items
export const EXACT = 0.97;                   // a point target this centred and nearer than a shaped hit wins over it
export const TIE = 0.03;                     // shaped hits closer together than this (metres) are decided by `pri`
export const SEAT_BONUS = 0.3;               // a seat's hit ranks as if it were this many metres nearer (among shaped hits), unless the item says `bonus` itself
const KIND_BONUS = Object.freeze({ sit: SEAT_BONUS });
const LEAD = 0.08, PAD = 0.04, MAX_CELLS = 36;

/** Entry distance of the ray (origin o, unit direction v, in the box's own frame) into the box |x| <= hx, |y| <= hy, |z| <= hz within maxT metres; -1 for a miss. */
export function rayBox(ox, oy, oz, vx, vy, vz, hx, hy, hz, maxT = 12) {
  let t0 = 0, t1 = maxT;
  for (let k = 0; k < 3; k++) {
    const o = k === 0 ? ox : k === 1 ? oy : oz, v = k === 0 ? vx : k === 1 ? vy : vz, h = k === 0 ? hx : k === 1 ? hy : hz;
    if (Math.abs(v) < 1e-9) { if (Math.abs(o) > h) return -1; continue; }
    let s = (-h - o) / v, e = (h - o) / v; if (s > e) { const q = s; s = e; e = q; }
    if (s > t0) t0 = s; if (e < t1) t1 = e; if (t0 > t1) return -1;
  }
  return t0;
}
/** Entry distance of the ray (origin o relative to the centre, unit direction v) into a sphere of radius r within maxT metres; 0 when the eye is inside; -1 for a miss. */
export function raySphere(ox, oy, oz, vx, vy, vz, r, maxT = 12) {
  const c = ox * ox + oy * oy + oz * oz - r * r;
  if (c <= 0) return 0;
  const b = ox * vx + oy * vy + oz * vz, disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= maxT ? t : -1;
}

/**
 * Entry distance of the ray (origin o relative to the capsule's axis, unit direction v) into an upright capsule: radius r round the axis x = z = 0 between y0 and y1
 * (the axis ends are the centres of the two caps), within maxT metres; 0 when the eye is inside; -1 for a miss.
 */
export function rayCapsuleY(ox, oy, oz, vx, vy, vz, y0, y1, r, maxT = 12) {
  let best = Infinity;
  const a = vx * vx + vz * vz, c = ox * ox + oz * oz - r * r;
  if (a > 1e-12) {
    const b = ox * vx + oz * vz, disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0) { const y = oy + vy * t; if (y >= y0 && y <= y1) best = t; }
      else if (c <= 0 && oy >= y0 && oy <= y1) return 0;                          // the eye is inside the capsule
    }
  } else if (c <= 0 && oy >= y0 && oy <= y1) return 0;
  for (const cy of [y0, y1]) { const t = raySphere(ox, oy - cy, oz, vx, vy, vz, r, maxT); if (t >= 0 && t < best) best = t; }
  return best <= maxT ? best : -1;
}

/** The body of a person for the aim: an upright capsule round the item's point (x, y = about the chest of a standing person, z): its axis runs from 1.05 m under that point to 0.24 m over it, so with the radius it covers the feet to a hand above the head. */
export const PERSON_R = 0.34, PERSON_BELOW = 1.05, PERSON_ABOVE = 0.24;
export function personHit(ctx, it, eye, dir) {
  return rayCapsuleY(eye.x - it.x, eye.y, eye.z - it.z, dir.x, dir.y, dir.z, it.y - PERSON_BELOW, it.y + PERSON_ABOVE, PERSON_R, it.radius);
}
/** Spread into the item of a person (see PEOPLE above). */
export const PERSON = Object.freeze({ hit: personHit, soft: true, firm: true, bonus: 0.3, tall: 1.5 });

const cellKey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

export class Interact {
  constructor(ctx) {
    this.ctx = ctx; this.items = new Map(); this.target = null; this.seq = 0; this.reach = 2.6;
    this.dyn = new Set(); this.grid = new Map(); this.groups = new Map();
    this.aimed = false; this.targetT = 0; this.visited = 0;
    this._st = { s: null, st: Infinity, sr: Infinity, spri: -Infinity, p: null, ps: Infinity, pn: null, pns: Infinity, hit: false, c: null, cd: Infinity };
  }

  register(it) {
    it.id ??= 'i' + (++this.seq); it.radius ??= this.reach;
    if (this.items.has(it.id)) this._drop(this.items.get(it.id));
    this._shape(it);
    this.items.set(it.id, it);
    if (it.group != null) { let g = this.groups.get(it.group); if (!g) this.groups.set(it.group, g = new Set()); g.add(it.id); }
    if (!it.static || !this._cells(it)) this.dyn.add(it);
    return it;
  }
  unregister(x) { const it = this.items.get(typeof x === 'string' ? x : x?.id); if (it) this._drop(it); }
  /** Drop every item registered with `group`. Returns how many. */
  unregisterGroup(group) {
    const g = this.groups.get(group); if (!g) return 0;
    let n = 0; for (const id of [...g]) { const it = this.items.get(id); if (it) { this._drop(it); n++; } }
    this.groups.delete(group);
    return n;
  }

  _shape(it) {
    it._k = 0; it._b = null;
    if (typeof it.hit === 'function') it._k = 1;
    else if (it.hx > 0 && it.hy > 0 && it.hz > 0) {
      const c = Math.cos(it.ry ?? 0), s = Math.sin(it.ry ?? 0), pad = it.pad ?? PAD;
      it._b = { ax: c, az: -s, bx: s, bz: c, hx: it.hx + pad, hy: it.hy + pad, hz: it.hz + pad }; it._k = 2;
    } else if (it.r > 0) { it._b = { r: it.r + (it.pad ?? PAD) }; it._k = 3; }
  }
  /** Put a static item into every grid cell its reach can touch. False when it would span too many cells (it then stays in the per-frame list). */
  _cells(it) {
    const b = it._b, ext = it._k === 2 ? Math.hypot(b.hx, b.hy, b.hz) : it._k === 3 ? b.r : it._k === 1 ? (it.reach ?? 1.5) : 0, rr = it.radius + ext;
    const x0 = Math.floor((it.x - rr) / CELL), x1 = Math.floor((it.x + rr) / CELL), z0 = Math.floor((it.z - rr) / CELL), z1 = Math.floor((it.z + rr) / CELL);
    if (!(x1 - x0 + 1 > 0) || (x1 - x0 + 1) * (z1 - z0 + 1) > MAX_CELLS) return false;
    const keys = [];
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = cellKey(cx, cz); let s = this.grid.get(k); if (!s) this.grid.set(k, s = new Set()); s.add(it); keys.push(k);
    }
    it._cells = keys;
    return true;
  }
  _drop(it) {
    this.items.delete(it.id); this.dyn.delete(it);
    if (it._cells) { for (const k of it._cells) { const s = this.grid.get(k); if (s) { s.delete(it); if (!s.size) this.grid.delete(k); } } it._cells = null; }
    if (it.group != null) { const g = this.groups.get(it.group); if (g) { g.delete(it.id); if (!g.size) this.groups.delete(it.group); } }
    if (this.target === it) { this.target = null; this.aimed = false; }
  }

  /** Pick the best target for an eye position and unit view direction. Returns the item or null. */
  update(eye, dir) {
    const st = this._st; st.s = null; st.st = Infinity; st.sr = Infinity; st.spri = -Infinity; st.p = null; st.ps = Infinity; st.pn = null; st.pns = Infinity; st.hit = false; st.c = null; st.cd = Infinity;
    this.visited = 0;
    for (const it of this.dyn) this._try(it, eye, dir, st);
    const cell = this.grid.get(cellKey(Math.floor(eye.x / CELL), Math.floor(eye.z / CELL)));
    if (cell) for (const it of cell) this._try(it, eye, dir, st);
    let pick = null, aimed = false, t = 0;
    if (st.s) { aimed = true; pick = st.s; t = st.st; if (st.c && st.cd < st.st && !st.s.firm) { pick = st.c; aimed = false; t = st.cd; } }   // an aimed neighbour in front of the shape wins (not over a person: firm)
    else { const p = st.hit ? st.pn : st.p; if (p) pick = p; }                  // the crosshair is on a shaped item: only a point target inside its own cone may take it
    this.target = pick; this.aimed = aimed; this.targetT = t;
    return pick;
  }

  _try(it, eye, dir, st) {
    this.visited++;
    if (it.enabled && it.enabled(this.ctx, it) === false) return;
    if (it._k && (this._tryShaped(it, eye, dir, st) || !it.soft)) return;      // a hit decides (offered or not); a miss only falls back to the point test when `soft`
    const dx = it.x - eye.x, dy = (it.y ?? eye.y) - eye.y, dz = it.z - eye.z, d = Math.hypot(dx, dy, dz);
    if (d > it.radius) return;
    const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
    if (cos < (it.aim ?? 0.72) && d > 0.7) return;
    const score = d * (2.2 - cos), along = d * cos;
    const inCone = cos >= (it.aim ?? 0.72), centred = cos >= (it.exact ?? EXACT) && along < st.cd;      // not inCone: offered only because it is within 0.7 m
    const best = score < st.ps, bestIn = inCone && score < st.pns;
    if (!best && !bestIn && !centred) return;
    if (this.ctx.physics.segmentBlocked(eye.x, eye.z, it.x, it.z, eye.y - 1.4, 1.2, it.ignoreDoor ?? null, it.tall ?? 0)) return;
    if (best) { st.ps = score; st.p = it; }
    if (bestIn) { st.pns = score; st.pn = it; }
    if (centred) { st.cd = along; st.c = it; }
  }

  /** True when the ray enters the item's shape within reach (whether or not it is then the best, or in view); false for a miss. */
  _tryShaped(it, eye, dir, st) {
    let t;
    if (it._k === 1) t = it.hit(this.ctx, it, eye, dir);
    else {
      const b = it._b, ox = eye.x - it.x, oy = eye.y - it.y, oz = eye.z - it.z;
      t = it._k === 2
        ? rayBox(ox * b.ax + oz * b.az, oy, ox * b.bx + oz * b.bz, dir.x * b.ax + dir.z * b.az, dir.y, dir.x * b.bx + dir.z * b.bz, b.hx, b.hy, b.hz, it.radius)
        : raySphere(ox, oy, oz, dir.x, dir.y, dir.z, b.r, it.radius);
    }
    if (!(t >= 0) || t > it.radius) return false;                              // a miss, NaN, or out of reach
    st.hit = true;                                                             // the crosshair is on a shaped item, whether or not it ends up offered
    const pri = it.pri ?? 0, rank = t - (it.bonus ?? KIND_BONUS[it.kind] ?? 0), br = st.sr, bp = st.spri;
    if (!(rank < br - TIE || (Math.abs(rank - br) <= TIE && (pri > bp || (pri === bp && rank < br))))) return true;     // cannot beat the best shaped hit so far
    const lead = it.lead ?? LEAD, tt = t > lead ? t - lead : 0;
    if (this.ctx.physics.segmentBlocked(eye.x, eye.z, eye.x + dir.x * tt, eye.z + dir.z * tt, eye.y - 1.4, 1.2, it.ignoreDoor ?? null, it.tall ?? 0)) return true;
    st.s = it; st.st = t; st.sr = rank; st.spri = pri;
    return true;
  }

  prompt() {
    const t = this.target; if (!t) return null;
    return typeof t.prompt === 'function' ? t.prompt(this.ctx, t) : t.prompt;
  }

  use() {
    const t = this.target;
    if (t?.kind === 'door' && this.ctx.interiors?.holdDoor?.(t)) return true;         // ?lazy=1: the building's interior is still being made: the door waits for it (interiors/lazy.js)
    if (t?.use) t.use(this.ctx, t);
    return !!t;
  }
}
