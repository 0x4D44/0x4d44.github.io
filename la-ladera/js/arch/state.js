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
    this.seq = { door: 0, win: 0 };
    for (let i = 0; i <= this.F; i++) this.floorsData.push({ index: i, y: i * this.fh, h: this.h, rooms: [], voids: [], extWalls: [] });
  }

  floorY(i) { return i * this.fh; }

  /** The layout could not fit stairs: fall back to a single storey (keeps the plan valid). */
  degrade(why) {
    this.notes.push('degraded: ' + why);
    this.F = 1; this.nUp = 0; this.roofAccess = false; this.core = null; this.coreRooms = [];
    this.rooms.length = 0; this.doors.length = 0; this.windows.length = 0; this.seq = { door: 0, win: 0 };
    this.floorsData = [0, 1].map((i) => ({ index: i, y: i * this.fh, h: this.h, rooms: [], voids: [], extWalls: [] }));
  }

  /** Create the stair core so its whole clear rect equals `rect` (the layout allots exactly coreDims().across x along). */
  placeCore(rect, orient = 'z', flip = false) {
    const cd = coreDims(this.fh);
    // orient 'z': across = x, flights run along z; landing at the south (z1) end, flights go north.
    let origin, U, Sdir;
    if (orient === 'z') {
      origin = flip ? [rect.x0, rect.z0 + 1.0] : [rect.x0, rect.z1 - 1.0];
      U = [1, 0]; Sdir = flip ? [0, 1] : [0, -1];
    } else {
      origin = flip ? [rect.x0 + 1.0, rect.z0] : [rect.x1 - 1.0, rect.z0];
      U = [0, 1]; Sdir = flip ? [1, 0] : [-1, 0];
    }
    const floors = this.F;
    this.core = makeCore({ origin, U, S: Sdir, fh: this.fh, nUp: this.nUp, floors, roof: this.roofAccess && !this.openTop });
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
    this.rooms.push(room); f.rooms.push(room.id);
    return room;
  }

  roomById(id) { return this.rooms.find((r) => r.id === id); }

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
    this.doors.push(door); room.doors.push(id);
    return door;
  }
}

export { rw, rd };
