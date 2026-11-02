// PlanState: the mutable scratchpad a layout function writes into (rooms, doors, cores); plan.js turns it into a BuildingPlan.
import { makeFrame } from '../core/frame.js';
import { CONFIG } from '../core/config.js';
import { T_EXT, T_INT, SLAB, R, rcopy, sharedWall, clamp, round2, rw, rd } from './geom.js';
import { makeCore, coreDims } from './stairs.js';

export const KIND_ALIAS = { 'shop-house': 'shophouse', 'courtyard-house': 'courtyard', 'row-house': 'rowhouse', 'corner-store': 'cornerstore', 'shop_house': 'shophouse' };

const NAMES = {
  living: 'Sala', dining: 'Comedor', kitchen: 'Cocina', bedroom: 'Dormitorio', bathroom: 'Baño', hall: 'Pasillo', corridor: 'Corredor', stairwell: 'Escalera',
  landing: 'Descanso', shop: 'Tienda', backroom: 'Depósito', patio: 'Patio', terrace: 'Terraza', balcony: 'Balcón', laundry: 'Lavadero', workshop: 'Taller',
  chapel: 'Capilla', classroom: 'Aula', office: 'Oficina', garage: 'Garaje', entry: 'Zaguán',
};
const ZONE = {
  living: 'public', dining: 'public', shop: 'public', entry: 'public', hall: 'public', corridor: 'public', chapel: 'public', classroom: 'public', office: 'public',
  stairwell: 'public', landing: 'public', bedroom: 'private', bathroom: 'private', kitchen: 'service', laundry: 'service', backroom: 'service', patio: 'service',
  workshop: 'service', garage: 'service', terrace: 'public', balcony: 'public',
};
export const CIRCULATION = new Set(['stairwell', 'landing', 'hall', 'corridor', 'entry']);

export class PlanState {
  constructor(ctx, lot) {
    this.ctx = ctx; this.lot = lot;
    this.kind = KIND_ALIAS[lot.kind] ?? lot.kind;
    this.rng = ctx.rng.fork('arch:' + lot.id + ':' + (lot.seed ?? 0));
    this.W = lot.w; this.D = lot.d;
    this.F = clamp(Math.round(lot.floors || 1), 1, 6);
    this.fh = lot.fh ?? CONFIG.FLOOR_H;
    this.h = clamp(this.fh - SLAB, 2.4, 2.9);            // clear ceiling height
    this.slab = this.fh - this.h;                          // slab thickness (>= 0.1)
    this.te = T_EXT; this.ti = T_INT;
    this.party = { left: !!lot.party?.left, right: !!lot.party?.right, back: !!lot.party?.back, front: false };
    this.outer = R(-this.W / 2, -this.D / 2, this.W / 2, this.D / 2);
    this.inner = R(-this.W / 2 + this.te, -this.D / 2 + this.te, this.W / 2 - this.te, this.D / 2 - this.te);
    this.frame = makeFrame(lot.x, lot.y, lot.z, lot.rotY ?? 0);
    this.rooms = []; this.doors = []; this.windows = [];
    this.floorsData = [];
    this.core = null; this.nUp = 0;
    this.roofStyle = 'terrace'; this.roofWalkable = false; this.roofAccess = !!lot.roofAccess;
    this.openTop = false;               // unfinished: the top floor is an open skeleton
    this.notes = []; this.guards = []; this.walls = []; this.coreRooms = []; this.foundY = -0.5; this.roofLayer = null;
    this.patios = [];                   // open-air courts: [{ id (the ground-floor patio room), rect }] with a void through every storey above
    this.arcades = [];                  // openings in interior walls that are not doors: grilled windows and arcade bays onto a patio
    this.platforms = [];                // raised floors inside a room (a stage): [{ room, floor, rect, h }], walkable on top, climbed like a step
    this.loops = null;                  // why the plan has a ring of circulation on purpose (a school's cloister), or null: budgetDoors keeps every door between two circulation rooms then
    this.seq = { door: 0, win: 0 };
    for (let i = 0; i <= this.F; i++) this.floorsData.push({ index: i, y: i * this.fh, h: this.h, rooms: [], voids: [], extWalls: [] });
  }

  floorY(i) { return i * this.fh; }

  /** The layout could not fit stairs: fall back to a single storey (keeps the plan valid). */
  degrade(why) {
    this.notes.push('degraded: ' + why);
    this.F = 1; this.nUp = 0; this.roofAccess = false; this.core = null; this.coreRooms = []; this.stairStyle = undefined;
    this.rooms.length = 0; this.doors.length = 0; this.windows.length = 0; this.patios.length = 0; this.arcades.length = 0; this.platforms.length = 0; this.seq = { door: 0, win: 0 };
    this.floorsData = [0, 1].map((i) => ({ index: i, y: i * this.fh, h: this.h, rooms: [], voids: [], extWalls: [] }));
  }

  /**
   * Create the stair core so its whole clear rect equals `rect` (the layout allots exactly coreDims().across x along).
   * A layout that wants a stair other than the house one (the school's, 1.4 m wide) sets `this.stairStyle` before it calls this, and sizes `rect` from coreDims(fh, style).
   */
  placeCore(rect, orient = 'z', flip = false) {
    const style = this.stairStyle, cd = coreDims(this.fh, style), ld = cd.ldg;
    // orient 'z': across = x, flights run along z; landing at the south (z1) end, flights go north.
    let origin, U, Sdir;
    if (orient === 'z') {
      origin = flip ? [rect.x0, rect.z0 + ld] : [rect.x0, rect.z1 - ld];
      U = [1, 0]; Sdir = flip ? [0, 1] : [0, -1];
    } else {
      origin = flip ? [rect.x0 + ld, rect.z0] : [rect.x1 - ld, rect.z0];
      U = [0, 1]; Sdir = flip ? [1, 0] : [-1, 0];
    }
    const floors = this.F;
    this.core = makeCore({ origin, U, S: Sdir, fh: this.fh, nUp: this.nUp, floors, roof: this.roofAccess && !this.openTop, style });
    // sanity: the produced rect must equal the allotted rect
    const c = this.core.rect;
    if (Math.abs(c.x0 - rect.x0) > 1e-3 || Math.abs(c.x1 - rect.x1) > 1e-3 || Math.abs(c.z0 - rect.z0) > 1e-3 || Math.abs(c.z1 - rect.z1) > 1e-3) {
      throw new Error(`core rect mismatch ${JSON.stringify(c)} vs ${JSON.stringify(rect)} (${this.lot.id})`);
    }
    return this.core;
  }

  /** Add the core's rooms to every floor: 'stairwell' at ground, 'landing' above; voids on floors 1..nUp. */
  addCoreRooms() {
    const c = this.core; if (!c) return [];
    const out = [];
    const top = Math.min(this.F - 1, this.nUp);
    for (let k = 0; k <= top; k++) {
      const r = k === 0 ? this.addRoom(0, 'stairwell', c.rect, { core: true, noFurnish: true }) : this.addRoom(k, 'landing', c.landing, { core: true, noFurnish: true });
      r.stair = this.lot.id + '.s0';
      out.push(r);
      if (k >= 1 && c.holeAt(k)) this.floorsData[k].voids.push({ rect: rcopy(c.voidRect), owner: r.id, core: true });
    }
    // the roof level hole (caseta) is handled in plan.js
    this.coreRooms = out;
    return out;
  }

  addRoom(floor, type, rect, o = {}) {
    const f = this.floorsData[floor];
    const room = {
      id: `${this.lot.id}.f${floor}.r${f.rooms.length}`, floor, type, name: o.name ?? NAMES[type] ?? type, rect: rcopy(rect),
      y: this.floorY(floor), h: this.h, outdoor: !!o.outdoor, doors: [], windows: [], openings: [],
      zone: o.zone ?? ZONE[type] ?? 'public', finish: {}, ...(o.occupant ? { occupant: o.occupant } : {}),
    };
    if (o.noFurnish) room.noFurnish = true;
    if (o.core) room.core = true;
    if (o.tag) room.tag = o.tag;
    if (o.unit) room.unit = o.unit;                         // the flat of a block this room belongs to ('a', 'b'): interiors/household.js keys a household by floor + unit + occupant
    this.rooms.push(room); f.rooms.push(room.id);
    return room;
  }

  roomById(id) { return this.rooms.find((r) => r.id === id); }

  /**
   * An open-air patio: a `patio` room at ground level plus a void through every storey above it, the roof included (floors 1..F). Only a flat roof can
   * take the hole, so the building gets a terrace roof. The walls round it come from the neighbouring rooms like any other partition.
   */
  addPatio(rect, o = {}) {
    const room = this.addRoom(0, 'patio', rect, { outdoor: true, ...o });
    for (let k = 1; k <= this.F; k++) this.floorsData[k].voids.push({ rect: rcopy(rect), owner: room.id, patio: true });
    this.patios.push({ id: room.id, rect: rcopy(rect) });
    this.roofStyle = 'terrace';
    return room;
  }

  /**
   * A window-like opening in the interior wall between `room` and `other` (a rect: the patio, or the void over it). o: { at (coordinate along the wall), w, sill, h, grille }.
   * It never carries a collider (the wall stays solid, so nobody falls into the void) and is not a door (no leaf, no graph edge): it only lets the eye through.
   * Returns the record, or null when the shared wall is too short for the opening.
   */
  arcade(room, other, o = {}) {
    const sw = sharedWall(room.rect, other);
    if (!sw) throw new Error(`arcade: ${room.id} does not touch the rect`);
    const w = Math.min(o.w ?? 1.4, sw.a1 - sw.a0 - 0.4);
    if (w < 0.5) return null;
    const lo = sw.a0 + 0.2 + w / 2, hi = sw.a1 - 0.2 - w / 2;
    const u = clamp(o.at ?? (sw.a0 + sw.a1) / 2, lo, hi);
    const sill = o.sill ?? 0.95, h = o.h ?? 1.25;
    const rec = { id: `${this.lot.id}.a${this.arcades.length}`, room: room.id, floor: room.floor, u: round2(u), w: round2(w), y: round2(sill), h: round2(h), grille: !!o.grille, wall: { dir: sw.dir, at: sw.at, t: sw.t } };
    this.arcades.push(rec);
    return rec;
  }

  /**
   * Interior connection between two ADJACENT rooms (a -> b). o: { kind:'door'|'arch', w, at (absolute coord along the wall), hinge, swing, mat, h }
   * Returns the Door record (arches too: kind 'arch', no leaf).
   */
  link(a, b, o = {}) {
    const sw = sharedWall(a.rect, b.rect);
    if (!sw) throw new Error(`link: ${a.id} and ${b.id} are not adjacent`);
    const arch = o.kind === 'arch';
    // 0.9 m leaves a 0.3 m corridor for the R = 0.3 player (see colliders.js); never go below 0.85
    let w = o.w ?? (arch ? 1.3 : 0.9);
    const m = 0.1;
    if (sw.a1 - sw.a0 < w + 2 * m) w = Math.max(arch ? 0.9 : 0.85, sw.a1 - sw.a0 - 2 * m);
    const lo = sw.a0 + m + w / 2, hi = sw.a1 - m - w / 2;
    let u = o.at ?? (sw.dir === 'z' ? o.atZ : o.atX) ?? (sw.a0 + sw.a1) / 2;
    u = lo > hi ? (sw.a0 + sw.a1) / 2 : clamp(u, lo, hi);
    const dirNeg = sw.aLow ? 1 : -1;
    const nx = sw.dir === 'z' ? dirNeg : 0, nz = sw.dir === 'x' ? dirNeg : 0;
    const x = sw.dir === 'z' ? sw.at : u, z = sw.dir === 'x' ? sw.at : u;
    const floor = a.floor;
    const id = `${this.lot.id}.d${this.seq.door++}`;
    const door = {
      id, kind: arch ? 'arch' : (o.kind ?? 'interior'), x: round2(x), z: round2(z), y: this.floorY(floor), nx, nz, w: round2(w), h: o.h ?? (arch ? 2.2 : 2.05),
      rooms: [a.id, b.id], hinge: o.hinge ?? (this.rng.chance(0.5) ? 'left' : 'right'), swing: o.swing ?? 1, mat: o.mat ?? 'door_wood',
      floor, wall: { dir: sw.dir, at: sw.at, t: sw.t },
    };
    if (!arch) door.clear = this.swingClear(door);
    this.doors.push(door);
    a.doors.push(id); b.doors.push(id);
    const side = (n) => (n.nx === 1 ? '+x' : n.nx === -1 ? '-x' : n.nz === 1 ? '+z' : '-z');
    if (arch) {
      const along = sw.dir === 'z' ? [z - w / 2, z + w / 2] : [x - w / 2, x + w / 2];
      a.openings.push({ side: side(door), from: round2(along[0]), to: round2(along[1]), door: id });
      b.openings.push({ side: side({ nx: -nx, nz: -nz }), from: round2(along[0]), to: round2(along[1]), door: id });
    }
    return door;
  }

  /**
   * The door budget. A layout asks for the doors it wants (`link`); this keeps, on every floor, the interior doors that make a TREE over the rooms and drops the rest, so a room is reached one
   * way and a door is never a second way into a room that another door already reaches (L08 had a loop on each of its three floors: a shop with two doors onto the same stair column, a living
   * room and a landing that both opened onto the dining room, bedrooms that opened onto each other as well as onto the landing). A plan with a ring of circulation on purpose (the cloister of a
   * school) says so once, `S.loops = '<why>'`: the doors between two circulation rooms (or the patio) are then kept whole, each marked `loop: '<why>'`, and everything else is still a tree.
   * The rest are taken hubs first: a door weighs the sum of how little of a hub its two rooms are (the patio 0, a hall, corridor, landing or entry 1, any other room 2, a stair column 3), so a room
   * opens onto the hall rather than onto its neighbour, a hall onto the patio before a room does, and a stair is a dead end that hangs off one room (the living room, the entry) and not a way
   * through to the dining room unless nothing else leads there; doors of the same weight go in the order the layout made them.
   * Nothing else about the plan moves: the rooms, the ids of the doors that stay and the draws of the random stream (a dropped door has made its hinge draw already, and the streams of the
   * windows and the facade fork from it) are as the layout left them. Exterior doors are not part of the budget. Returns the doors it dropped.
   */
  budgetDoors() {
    const type = new Map(this.rooms.map((r) => [r.id, r.type]));
    const hub = (id) => { const t = type.get(id); return t === 'patio' ? 0 : t === 'stairwell' ? 3 : CIRCULATION.has(t) ? 1 : 2; };
    const ring = (id) => type.get(id) === 'patio' || CIRCULATION.has(type.get(id));                    // a room the cloister runs through
    const wish = this.doors.map((d, i) => ({ d, i, w: d.rooms[0] && d.rooms[1] ? hub(d.rooms[0]) + hub(d.rooms[1]) : -1 })).filter((q) => q.w >= 0);
    if (this.loops) for (const { d } of wish) if (ring(d.rooms[0]) && ring(d.rooms[1])) d.loop = this.loops;
    wish.sort((p, q) => (!!q.d.loop - !!p.d.loop) || p.w - q.w || p.i - q.i);
    const parent = new Map(this.rooms.map((r) => [r.id, r.id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const drop = new Set();
    for (const { d } of wish) {
      const a = find(d.rooms[0]), b = find(d.rooms[1]);
      if (a !== b) parent.set(a, b); else if (!d.loop) drop.add(d.id);
    }
    if (!drop.size) return [];
    const gone = this.doors.filter((d) => drop.has(d.id));
    this.doors.splice(0, this.doors.length, ...this.doors.filter((d) => !drop.has(d.id)));
    for (const r of this.rooms) {
      if (r.doors.some((id) => drop.has(id))) r.doors = r.doors.filter((id) => !drop.has(id));
      if (r.openings.some((o) => drop.has(o.door))) r.openings = r.openings.filter((o) => !drop.has(o.door));
    }
    return gone;
  }

  /** Rect swept by the door leaf on the side it opens into (quarter disc bounding box), local frame. */
  swingClear(d) {
    const along = d.wall.dir === 'z' ? 'z' : 'x';
    const c = along === 'z' ? d.z : d.x, half = d.w / 2;
    const dirSign = d.swing === 1 ? 1 : -1;                       // swing 1 = opens into rooms[1] (the +normal side)
    const dep = d.w + 0.05, off = (d.wall.t ?? this.ti) / 2;
    if (along === 'z') {
      const sx = (d.nx * dirSign);
      const x0 = sx > 0 ? d.x + off : d.x - off - dep, x1 = sx > 0 ? d.x + off + dep : d.x - off;
      return { x0: round2(x0), x1: round2(x1), z0: round2(c - half), z1: round2(c + half) };
    }
    const sz = (d.nz * dirSign);
    const z0 = sz > 0 ? d.z + off : d.z - off - dep, z1 = sz > 0 ? d.z + off + dep : d.z - off;
    return { x0: round2(c - half), x1: round2(c + half), z0: round2(z0), z1: round2(z1) };
  }

  /** Exterior door on `side` of `room` at coordinate u along that wall (x for front/back, z for left/right). */
  extDoor(room, side, u, o = {}) {
    const te = this.te, W = this.W, D = this.D;
    const w = o.w ?? 1.0;
    const span = side === 'front' || side === 'back' ? [room.rect.x0, room.rect.x1] : [room.rect.z0, room.rect.z1];
    const lo = span[0] + 0.12 + w / 2, hi = span[1] - 0.12 - w / 2;
    u = lo > hi ? (span[0] + span[1]) / 2 : clamp(u, lo, hi);
    let x, z, nx, nz;
    if (side === 'front') { x = u; z = D / 2 - te / 2; nx = 0; nz = -1; }
    else if (side === 'back') { x = u; z = -D / 2 + te / 2; nx = 0; nz = 1; }
    else if (side === 'left') { x = -W / 2 + te / 2; z = u; nx = 1; nz = 0; }
    else { x = W / 2 - te / 2; z = u; nx = -1; nz = 0; }
    const kind = o.kind ?? 'exterior';
    const id = `${this.lot.id}.d${this.seq.door++}`;
    const door = {
      id, kind, x: round2(x), z: round2(z), y: this.floorY(room.floor), nx, nz, w: round2(w), h: o.h ?? 2.1, rooms: [null, room.id],
      hinge: o.hinge ?? (this.rng.chance(0.5) ? 'left' : 'right'), swing: 1, mat: o.mat ?? (kind === 'shutter' ? 'shutter_steel' : 'door_wood'),
      floor: room.floor, wall: { dir: side === 'front' || side === 'back' ? 'x' : 'z', at: side === 'front' ? D / 2 - te / 2 : side === 'back' ? -D / 2 + te / 2 : side === 'left' ? -W / 2 + te / 2 : W / 2 - te / 2, t: te },
      side, ext: true, entrance: o.entrance ?? 'main',
    };
    if (o.double) door.double = true;                                // two leaves, each w / 2 wide, hinged at the two jambs (doors.js)
    this.doors.push(door); room.doors.push(id);
    return door;
  }
}

export { rw, rd };
