// Synthetic BuildingPlans (CONTRACT 5.2) for testing the INTERIORS module before / beside A2's real plans.
// Rooms tile each floor (BSP split), doors link neighbours (spanning tree + loops), exterior walls get windows, an optional stair strip
// links floors. Wall colliders (with closed doors) and floor slabs are generated so reachability can be walked with ctx.physics.
//   import { genBuilding, genBatch, asciiRoom } from './interiors-plans.mjs';
import { makeFrame } from '../js/core/frame.js';
import { wallsRect, floorRect, floorRamp } from '../js/core/physics.js';
import { makeRng } from '../js/core/rng.js';

const G = 0.2;                    // wall thickness between rooms
const FH = 2.8;
const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);

const PROGRAMS = {
  house: { f0: { max: 5, front: 'living', back: 'patio', small: 'bathroom', rest: ['kitchen', 'bedroom', 'dining'] }, up: { max: 5, front: 'bedroom', back: 'bedroom', small: 'bathroom', rest: ['bedroom', 'living'] }, roof: 'terrace' },
  rowhouse: { f0: { max: 4, front: 'living', back: 'kitchen', small: 'bathroom', rest: ['bedroom', 'dining'] }, up: { max: 4, front: 'bedroom', back: 'bedroom', small: 'bathroom', rest: ['bedroom'] }, roof: 'terrace' },
  apartments: { f0: { max: 6, front: 'living', back: 'bedroom', small: 'bathroom', rest: ['kitchen', 'bedroom', 'dining', 'balcony'] }, up: { max: 6, front: 'living', back: 'bedroom', small: 'bathroom', rest: ['kitchen', 'bedroom', 'dining', 'balcony'] }, roof: 'terrace' },
  shophouse: { f0: { max: 4, front: 'shop', back: 'patio', small: 'bathroom', rest: ['backroom', 'kitchen'] }, up: { max: 5, front: 'living', back: 'bedroom', small: 'bathroom', rest: ['bedroom', 'kitchen', 'dining'] }, roof: 'terrace' },
  cornerstore: { f0: { max: 3, front: 'shop', back: 'backroom', small: 'bathroom', rest: ['kitchen'] }, up: { max: 5, front: 'living', back: 'bedroom', small: 'bathroom', rest: ['bedroom', 'kitchen'] }, roof: 'terrace' },
  courtyard: { f0: { max: 7, front: 'living', back: 'patio', small: 'bathroom', rest: ['bedroom', 'kitchen', 'dining', 'bedroom'] }, up: { max: 5, front: 'bedroom', back: 'bedroom', small: 'bathroom', rest: ['bedroom', 'balcony'] }, roof: 'terrace' },
  tenement: { f0: { max: 8, front: 'bedroom', back: 'patio', small: 'bathroom', rest: ['bedroom', 'bedroom', 'laundry', 'kitchen', 'bedroom', 'living'] }, up: { max: 8, front: 'bedroom', back: 'bedroom', small: 'bathroom', rest: ['bedroom', 'living', 'bedroom'] }, roof: 'terrace' },
  unfinished: { f0: { max: 4, front: 'living', back: 'patio', small: 'bathroom', rest: ['kitchen', 'bedroom'] }, up: { max: 3, front: 'bedroom', back: 'terrace', small: 'bathroom', rest: ['bedroom'] }, roof: 'terrace' },
  chapel: { f0: { max: 3, front: 'entry', back: 'backroom', rest: ['chapel'], big: 'chapel' }, up: { max: 1, front: 'bedroom', back: 'bedroom', rest: ['bedroom'] }, roof: 'terrace' },
  school: { f0: { max: 6, front: 'hall', back: 'patio', small: 'bathroom', rest: ['classroom', 'classroom', 'office', 'classroom'] }, up: { max: 5, front: 'classroom', back: 'classroom', small: 'bathroom', rest: ['classroom', 'office'] }, roof: 'terrace' },
  clinic: { f0: { max: 5, front: 'hall', back: 'backroom', small: 'bathroom', rest: ['office', 'office', 'bedroom'] }, up: { max: 4, front: 'office', back: 'office', small: 'bathroom', rest: ['bedroom'] }, roof: 'terrace' },
  hall: { f0: { max: 3, front: 'hall', back: 'kitchen', small: 'bathroom', rest: ['hall'], big: 'hall' }, up: { max: 2, front: 'office', back: 'bedroom', small: 'bathroom', rest: ['office'] }, roof: 'terrace' },
  workshop: { f0: { max: 3, front: 'workshop', back: 'backroom', small: 'bathroom', rest: ['office'], big: 'workshop' }, up: { max: 4, front: 'living', back: 'bedroom', small: 'bathroom', rest: ['bedroom', 'kitchen'] }, roof: 'terrace' },
  kiosk: { f0: { max: 1, front: 'shop', back: 'shop', rest: ['shop'] }, up: { max: 1, front: 'shop', back: 'shop', rest: ['shop'] }, roof: 'terrace' },
};
export const KINDS = Object.keys(PROGRAMS);

function split(region, rng, max, minDim) {
  const leaves = [region];
  for (let guard = 0; guard < 60 && leaves.length < max; guard++) {
    leaves.sort((a, b) => area(b) - area(a));
    const r = leaves[0], w = r.x1 - r.x0, d = r.z1 - r.z0;
    const canX = w >= 2 * minDim + G, canZ = d >= 2 * minDim + G;
    if (!canX && !canZ) break;
    const alongX = canX && (!canZ || w * rng.range(0.85, 1.2) >= d);
    const t = rng.range(0.4, 0.6);
    leaves.shift();
    if (alongX) { const s = r.x0 + (w - G) * t; leaves.push({ x0: r.x0, z0: r.z0, x1: s, z1: r.z1 }, { x0: s + G, z0: r.z0, x1: r.x1, z1: r.z1 }); }
    else { const s = r.z0 + (d - G) * t; leaves.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: s }, { x0: r.x0, z0: s + G, x1: r.x1, z1: r.z1 }); }
  }
  return leaves;
}
const cz = (r) => (r.z0 + r.z1) / 2;

function assign(leaves, prog) {
  const sorted = [...leaves].sort((a, b) => cz(b) - cz(a) || area(b) - area(a));
  const types = new Map();
  let pool = [...sorted];
  if (prog.big) { const b = pool.reduce((x, y) => (area(y) > area(x) ? y : x)); types.set(b, prog.big); pool = pool.filter((l) => l !== b); }
  if (pool.length) { types.set(pool[0], prog.front); pool.shift(); }
  if (pool.length) { types.set(pool[pool.length - 1], prog.back); pool.pop(); }
  if (prog.small && pool.length) { const s = pool.reduce((a, b) => (area(b) < area(a) ? b : a)); types.set(s, prog.small); pool = pool.filter((l) => l !== s); }
  pool.forEach((l, i) => types.set(l, prog.rest[i % prog.rest.length]));
  return types;
}

/** Generate one building. o: { id, kind, shop, w, d, floors, seed, x,y,z,rotY } */
export function genBuilding(o) {
  const rng = makeRng(o.seed ?? 1);
  const kind = o.kind ?? 'house', prog = PROGRAMS[kind] ?? PROGRAMS.house;
  const W = o.w ?? 8, D = o.d ?? 10, floors = o.floors ?? 2, rotY = o.rotY ?? 0;
  const lot = { id: o.id ?? 'T00', name: o.id, kind, shop: o.shop, x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0, rotY, w: W, d: D, floors, fh: FH, seed: o.seed ?? 1, entrance: { side: 'front', u: 0 }, party: {}, roofAccess: true, style: {} };
  const frame = makeFrame(lot.x, lot.y, lot.z, rotY);
  const IN = { x0: -W / 2 + G, z0: -D / 2 + G, x1: W / 2 - G, z1: D / 2 - G };
  const corners = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([x, z]) => { const p = frame.toWorld(x, 0, z); return [p[0], p[2]]; });
  const bp = { id: lot.id, lot, frame, footprint: corners, bounds: { x0: Math.min(...corners.map((p) => p[0])), x1: Math.max(...corners.map((p) => p[0])), z0: Math.min(...corners.map((p) => p[1])), z1: Math.max(...corners.map((p) => p[1])), y0: lot.y, y1: lot.y + floors * FH }, floors: [], rooms: [], doors: [], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, anchors: [], furniture: [], lights: [], roof: { walkable: true } };
  let dn = 0, wn = 0;
  const stairStrip = floors > 1 && W >= 5.6 ? (floors > 2 ? 2.4 : 1.6) : 0;
  const strip = stairStrip ? { x0: IN.x1 - stairStrip, z0: IN.z0, x1: IN.x1, z1: IN.z1 } : null;
  const region = strip ? { x0: IN.x0, z0: IN.z0, x1: strip.x0 - G, z1: IN.z1 } : IN;
  const stairRun = strip ? Math.min(4.0, strip.z1 - strip.z0 - 3.9) : 0, zFromStair = strip ? strip.z1 - 2.0 : 0, zTopStair = strip ? zFromStair - stairRun : 0;
  const byFloor = [];
  for (let f = 0; f < floors; f++) {
    const p = f === 0 ? prog.f0 : prog.up;
    const leaves = split(region, rng.fork('split' + f), p.max, kind === 'tenement' || kind === 'kiosk' ? 1.9 : 2.1);
    const types = assign(leaves, { ...p, back: f === floors - 1 && f > 0 && prog.roof ? prog.roof : p.back });
    const rooms = [];
    leaves.forEach((r, i) => {
      const type = types.get(r);
      const outdoor = type === 'patio' || type === 'terrace' || type === 'balcony';
      rooms.push({ id: `${lot.id}.f${f}.r${i}`, floor: f, type, rect: { ...r }, y: f * FH, h: outdoor ? 3.2 : 2.7, outdoor, doors: [], windows: [], openings: [], zone: 'public', occupant: undefined, finish: {} });
    });
    if (strip) rooms.push({ id: `${lot.id}.f${f}.st`, floor: f, type: 'stairwell', rect: { ...strip }, y: f * FH, h: 2.7, outdoor: false, doors: [], windows: [], openings: [], zone: 'service', finish: {} });
    byFloor.push(rooms); bp.rooms.push(...rooms);
    bp.floors.push({ index: f, y: f * FH, h: 2.7, rooms: rooms.map((r) => r.id) });
  }
  const sameEdge = (a, b) => {
    const A = a.rect, B = b.rect;
    if (Math.abs(A.x1 + G - B.x0) < 0.02 || Math.abs(B.x1 + G - A.x0) < 0.02) {
      const lo = Math.max(A.z0, B.z0), hi = Math.min(A.z1, B.z1);
      if (hi - lo >= 1.2) return { axis: 'v', pos: Math.abs(A.x1 + G - B.x0) < 0.02 ? A.x1 + G / 2 : B.x1 + G / 2, lo, hi, aFirst: Math.abs(A.x1 + G - B.x0) < 0.02 };
    }
    if (Math.abs(A.z1 + G - B.z0) < 0.02 || Math.abs(B.z1 + G - A.z0) < 0.02) {
      const lo = Math.max(A.x0, B.x0), hi = Math.min(A.x1, B.x1);
      if (hi - lo >= 1.2) return { axis: 'h', pos: Math.abs(A.z1 + G - B.z0) < 0.02 ? A.z1 + G / 2 : B.z1 + G / 2, lo, hi, aFirst: Math.abs(A.z1 + G - B.z0) < 0.02 };
    }
    return null;
  };
  const addDoor = (a, b, x, z, nx, nz, kind2 = 'interior', w = 0.9) => {
    const id = `${lot.id}.d${dn++}`;
    const d = { id, kind: kind2, x, z, y: a?.y ?? b.y, nx, nz, w, h: 2.1, rooms: [a?.id ?? null, b?.id ?? null], hinge: rng.chance(0.5) ? 'left' : 'right', swing: rng.chance(0.5) ? 0 : 1, mat: 'door_wood' };
    bp.doors.push(d); a?.doors.push(id); b?.doors.push(id); return d;
  };
  for (let f = 0; f < floors; f++) {
    const rooms = byFloor[f];
    const front = [...rooms].filter((r) => r.type !== 'stairwell').sort((a, b) => cz(b.rect) - cz(a.rect))[0];
    // adjacency graph (stair edges clipped to the landing) + spanning tree rooted at the stair landing (upper floors) or the front room
    const edges = [];
    const north = (f - 1) % 2 === 0;                                    // the flight from below arrives at the north end when its index is even
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      const e = sameEdge(rooms[i], rooms[j]); if (!e) continue;
      if (rooms[i].type === 'stairwell' || rooms[j].type === 'stairwell') { if (f > 0 && north) e.hi = Math.min(e.hi, zTopStair - 0.15); else e.lo = Math.max(e.lo, zFromStair + 0.15); }   // doors only on a landing, never beside a flight
      if (e.hi - e.lo < 1.45) continue;                                  // too short for a door with 0.55 m of wall each side
      edges.push({ a: rooms[i], b: rooms[j], e });
    }
    const root = f > 0 ? rooms.find((r) => r.type === 'stairwell') ?? front : front;
    const seen = new Set([root.id]), queue = [root], used = new Set();
    while (queue.length) {
      const cur = queue.shift();
      for (const ed of edges) {
        const other = ed.a === cur ? ed.b : ed.b === cur ? ed.a : null;
        if (!other || seen.has(other.id)) continue;
        seen.add(other.id); queue.push(other); used.add(ed);
      }
    }
    for (const ed of edges) if (!used.has(ed) && rng.chance(0.3)) used.add(ed);
    for (const ed of used) {
      const { e } = ed, w = 0.9;
      const lo = e.lo, hi = e.hi;
      const u = rng.range(lo + 0.55 + w / 2, Math.max(lo + 0.56 + w / 2, hi - 0.55 - w / 2));
      if (e.axis === 'v') addDoor(ed.a, ed.b, e.pos, u, e.aFirst ? 1 : -1, 0, 'interior', w);
      else addDoor(ed.a, ed.b, u, e.pos, 0, e.aFirst ? 1 : -1, 'interior', w);
    }
    // exterior door on the front wall of the front room (shutter for shops)
    const fr = front.rect, shop = front.type === 'shop', dw = shop ? 2.2 : 0.95;
    const fx = Math.min(fr.x1 - 0.7 - dw / 2, Math.max(fr.x0 + 0.7 + dw / 2, (fr.x0 + fr.x1) / 2 + rng.range(-0.8, 0.8)));
    if (f === 0) {
      const d = addDoor(null, front, fx, fr.z1 + G / 2, 0, -1, shop ? 'shutter' : 'exterior', dw);
      d.rooms = [null, front.id];
      const [ox, oy, oz] = frame.toWorld(fx, 0, fr.z1 + 1.4), [ix, , iz] = frame.toWorld(fx, 0, fr.z1 - 1.0);
      bp.entrances.push({ id: `${lot.id}.e0`, doorId: d.id, kind: shop ? 'shop' : 'main', outside: [ox, oy, oz], inside: [ix, oy, iz], yawIn: Math.PI + rotY, ry: rotY });
    }
    // windows on exterior-facing room edges
    for (const r of rooms) {
      if (r.type === 'stairwell') continue;
      const R = r.rect, walls = [];
      if (Math.abs(R.z0 - IN.z0) < 0.01) walls.push({ side: '-z', len: R.x1 - R.x0, at: (u) => [u, R.z0 - G / 2], n: [0, -1], lo: R.x0 });
      if (Math.abs(R.z1 - IN.z1) < 0.01 && !(f === 0 && r === front && shop)) walls.push({ side: '+z', len: R.x1 - R.x0, at: (u) => [u, R.z1 + G / 2], n: [0, 1], lo: R.x0 });
      if (Math.abs(R.x0 - IN.x0) < 0.01) walls.push({ side: '-x', len: R.z1 - R.z0, at: (u) => [R.x0 - G / 2, u], n: [-1, 0], lo: R.z0 });
      for (const w of walls) {
        const n = Math.max(1, Math.floor(w.len / 2.8));
        for (let k = 0; k < n; k++) {
          const u = w.lo + w.len * (k + 0.5) / n;
          const [x, z] = w.at(u);
          if (bp.doors.some((d) => Math.hypot(d.x - x, d.z - z) < 1.3)) continue;
          const bath = r.type === 'bathroom', ww = bath ? 0.5 : w.len > 3.5 ? 1.2 : 0.9;
          bp.windows.push({ id: `${lot.id}.w${wn++}`, room: r.id, x, z, y: bath ? 1.5 : 0.95, floor: r.floor, w: ww, h: bath ? 0.5 : 1.2, nx: w.n[0], nz: w.n[1], kind: 'casement', grille: rng.chance(0.4) });
          r.windows.push(bp.windows[bp.windows.length - 1].id);
        }
      }
    }
  }
  // stairs through the strip
  if (strip) {
    const xs = (strip.x0 + strip.x1) / 2, run = stairRun;
    for (let f = 0; f < floors - 1; f++) {
      const lx = floors > 2 ? xs + (f % 2 === 0 ? -0.55 : 0.55) : xs;                                         // two lanes side by side (no stacked flights)
      const up = f % 2 === 0 ? [[lx, zFromStair], [lx, zTopStair]] : [[lx, zTopStair], [lx, zFromStair]];      // switchback: alternate direction
      const from = up[0], to = up[1];
      bp.stairs.push({ id: `${lot.id}.s${f}`, floors: [f, f + 1], from, to, width: 1.0, steps: 16, rise: FH / 16, run: run / 15, hole: [[lx - 0.55, zTopStair - 0.1], [lx + 0.55, zTopStair - 0.1], [lx + 0.55, zFromStair], [lx - 0.55, zFromStair]] });
    }
  }
  // colliders: walls around every room (door gaps closed by door slabs) + floor slabs
  const doorById = new Map(bp.doors.map((d) => [d.id, d]));
  const added = new Set();
  const W2 = (x1, z1, x2, z2, y0, y1, extra = {}) => { const [a, , b] = frame.toWorld(x1, 0, z1), [c, , dd] = frame.toWorld(x2, 0, z2); bp.colliders.walls.push({ x1: a, z1: b, x2: c, z2: dd, t: 0.1, y0, y1, ...extra }); };
  for (const r of bp.rooms) {
    const R = r.rect, y0 = lot.y + r.y, y1 = y0 + 2.7;
    const edges = [['h', R.z0 - G / 2, R.x0 - G / 2, R.x1 + G / 2], ['h', R.z1 + G / 2, R.x0 - G / 2, R.x1 + G / 2], ['v', R.x0 - G / 2, R.z0 - G / 2, R.z1 + G / 2], ['v', R.x1 + G / 2, R.z0 - G / 2, R.z1 + G / 2]];
    for (const [ax, pos, lo, hi] of edges) {
      const gaps = r.doors.map((id) => doorById.get(id)).filter((d) => d && (ax === 'h' ? Math.abs(d.z - pos) < 0.05 && d.x > lo && d.x < hi : Math.abs(d.x - pos) < 0.05 && d.z > lo && d.z < hi))
        .map((d) => ({ d, a: (ax === 'h' ? d.x : d.z) - d.w / 2, b: (ax === 'h' ? d.x : d.z) + d.w / 2 })).sort((p, q) => p.a - q.a);
      let cur = lo;
      const JAMB = 0.15;                        // wall ends are capsules of radius t: pull them back so the clear opening is the door width
      for (const g of gaps) {
        if (g.a - JAMB > cur) ax === 'h' ? W2(cur, pos, g.a - JAMB, pos, y0, y1) : W2(pos, cur, pos, g.a - JAMB, y0, y1);
        cur = g.b + JAMB;
        if (!added.has(g.d.id)) { added.add(g.d.id); ax === 'h' ? W2(g.a, pos, g.b, pos, y0, y0 + 2.1, { door: g.d.id, t: 0.04 }) : W2(pos, g.a, pos, g.b, y0, y0 + 2.1, { door: g.d.id, t: 0.04 }); }
      }
      if (cur < hi) ax === 'h' ? W2(cur, pos, hi, pos, y0, y1) : W2(pos, cur, pos, hi, y0, y1);
    }
    const slab = (x0, z0, x1, z1) => bp.colliders.floors.push({ pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => { const p = frame.toWorld(x, 0, z); return [p[0], p[2]]; }), y: lot.y + r.y });
    if (r.type !== 'stairwell' || r.floor === 0 || !bp.stairs.length) slab(R.x0 - G / 2, R.z0 - G / 2, R.x1 + G / 2, R.z1 + G / 2);
    else {                                       // upper stairwell: landing beyond the flight's top, leave the shaft open
      if ((r.floor - 1) % 2 === 0) slab(R.x0 - G / 2, R.z0 - G / 2, R.x1 + G / 2, zTopStair + 0.05);        // arrival at the north end
      else slab(R.x0 - G / 2, zFromStair - 0.05, R.x1 + G / 2, R.z1 + G / 2);                                  // arrival at the south end
    }
  }
  for (const st of bp.stairs) {
    const [fx, , fz] = frame.toWorld(st.from[0], 0, st.from[1]), [tx, , tz] = frame.toWorld(st.to[0], 0, st.to[1]);
    const hw = 0.5, dx = tx - fx, dz = tz - fz, l = Math.hypot(dx, dz), px = -dz / l * hw, pz = dx / l * hw;
    bp.colliders.floors.push(floorRamp([[fx + px, fz + pz], [tx + px, tz + pz], [tx - px, tz - pz], [fx - px, fz - pz]], [fx, fz], [tx, tz], lot.y + st.floors[0] * FH, lot.y + st.floors[1] * FH));
  }
  return bp;
}

/** A batch of varied buildings at separate positions for stress tests. */
export function genBatch(n = 40, seed = 1) {
  const rng = makeRng(seed), out = [];
  const shops = ['tienda', 'panaderia', 'fruver', 'carniceria', 'peluqueria', 'ferreteria', 'drogueria', 'cafe', 'restaurante', 'papeleria', 'minutos', 'modista', 'zapateria', 'taller'];
  for (let i = 0; i < n; i++) {
    const kind = KINDS[i % KINDS.length];
    const floors = kind === 'apartments' ? rng.int(3, 4) : kind === 'kiosk' || kind === 'chapel' || kind === 'hall' ? 1 : kind === 'school' || kind === 'clinic' ? rng.int(1, 2) : rng.int(1, 3);
    const w = kind === 'kiosk' ? rng.range(3, 4.5) : kind === 'chapel' ? rng.range(6.5, 9) : kind === 'school' ? rng.range(11, 16) : rng.range(5.8, 11), d = kind === 'kiosk' ? rng.range(3, 4) : rng.range(7.5, 14);
    out.push(genBuilding({ id: 'T' + String(i).padStart(2, '0'), kind, shop: ['shophouse', 'cornerstore', 'kiosk', 'workshop'].includes(kind) ? shops[(i * 3 + rng.int(0, 3)) % shops.length] : undefined, w, d, floors, seed: 1000 + i * 7, x: (i % 8) * 20 - 70, z: Math.floor(i / 8) * 20 - 40, y: 0, rotY: [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.4][i % 5] }));
  }
  return out;
}

/** ASCII dump of a furnished room (debug): items drawn as letters, '.' free, '#' keep-out. */
export function asciiRoom(bp, roomId, cell = 0.15) {
  const L = bp.interior?.layouts?.get(roomId); if (!L) return '(no layout)';
  const r = L.r, nx = Math.ceil((r.x1 - r.x0) / cell), nz = Math.ceil((r.z1 - r.z0) / cell);
  const rows = [];
  const letters = new Map();
  const ch = (name) => { if (!letters.has(name)) letters.set(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[letters.size % 62]); return letters.get(name); };
  for (let iz = 0; iz < nz; iz++) {
    let row = '';
    for (let ix = 0; ix < nx; ix++) {
      const x = r.x0 + (ix + 0.5) * cell, z = r.z0 + (iz + 0.5) * cell;
      let c = '.';
      if (L.keep.some((k) => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1)) c = '+';
      for (const it of L.items) {
        if (!it.floor) continue;
        const dx = x - it.x, dz = z - it.z, cs = Math.cos(it.ry), sn = Math.sin(it.ry);
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        if (Math.abs(lx) <= it.w / 2 && Math.abs(lz) <= it.d / 2) c = ch(it.name);
      }
      row += c;
    }
    rows.push(row);
  }
  return `${roomId} ${L.room.type} ${(r.x1 - r.x0).toFixed(1)}x${(r.z1 - r.z0).toFixed(1)}\n` + rows.join('\n') + '\n' + [...letters].map(([k, v]) => `${v}=${k}`).join(' ');
}
