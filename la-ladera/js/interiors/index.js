// INTERIORS (A3): entry points used by main.js.
//   loadInteriorAssets(ctx)   preload the furniture GLBs (stand-in boxes are used for anything not loaded)
//   furnishBuilding(ctx, bp)  PURE DATA: finishes, furniture list, blocker walls, anchors, lights, interactables, discoveries
//   buildInterior(ctx, bp)    meshes into group `${bp.id}.int`
import { Layout, resetUid, obbDist } from './layout.js';
import { CATALOG, seatOffsets } from './catalog.js';
import { makeHousehold, finishRoom } from './household.js';
import * as R from './rooms.js';
import { shopRoom } from './shops.js';
import * as S from './special.js';
import { wallsRect } from '../core/physics.js';
import { makeRng, hashStr } from '../core/rng.js';
import { collectStories } from './stories.js';
import { buildInterior as buildMeshes, loadInteriorAssets as preload } from './build.js';

export const loadInteriorAssets = (ctx) => preload(ctx);
export const buildInterior = (ctx, bp) => buildMeshes(ctx, bp);

const PI = Math.PI;
const OCC = { family: 'family', elder: 'elder', shopkeeper: 'shopkeeper' };

/** Which furnisher handles this room? */
function pickFurnisher(bp, room, L) {
  const t = room.type, k = bp.lot?.kind, area = L.W * L.D;
  if (t === 'chapel' || (k === 'chapel' && (t === 'hall' || t === 'living'))) return S.chapel;
  if (t === 'classroom' || (k === 'school' && (t === 'living' || t === 'dining' || t === 'shop'))) return S.classroom;
  if (k === 'school' && t === 'bedroom') return R.office;
  if (k === 'school' && t === 'patio') return S.schoolyard;
  if (k === 'clinic') {
    if (t === 'hall' || t === 'living' || t === 'dining' || t === 'entry' || t === 'shop') return area >= 6 ? S.clinicWaiting : R.circulation;
    if (t === 'bedroom' || t === 'office') return S.clinicExam;
  }
  if (k === 'hall' && (t === 'hall' || t === 'living' || t === 'dining' || t === 'shop')) return S.hall;
  if (t === 'workshop' || (k === 'workshop' && (t === 'shop' || t === 'garage'))) return (L2, E, hh) => { E.forceShop = 'taller'; shopRoom(L2, E, hh); E.forceShop = null; };
  if (k === 'tenement' && (t === 'bedroom' || t === 'living')) return S.studio;
  if (k === 'unfinished' && (room.outdoor || room.floor > 0)) return S.construction;
  switch (t) {
    case 'living': return R.living;
    case 'dining': return R.dining;
    case 'kitchen': return R.kitchen;
    case 'bedroom': return R.bedroom;
    case 'bathroom': return R.bathroom;
    case 'hall': case 'corridor': case 'stairwell': case 'landing': case 'entry': return R.circulation;
    case 'patio': case 'terrace': case 'balcony': return R.outdoor;
    case 'laundry': return R.laundry;
    case 'office': return R.office;
    case 'garage': return R.garage;
    case 'backroom': return R.backroom;
    case 'shop': return shopRoom;
    default: return area > 7 ? R.living : R.circulation;
  }
}

function makeEnv(ctx, bp, rng) {
  const lot = bp.lot ?? {};
  const E = {
    ctx, bp, rng, lot, hhs: new Map(), states: new Map(), notes: [],
    state(hh) { let s = this.states.get(hh.id); if (!s) this.states.set(hh.id, s = { beds: 0 }); return s; },
    householdFor(room) {
      let flat = 'all';
      if (lot.kind === 'apartments') flat = `f${room.floor}${room.flat ?? room.unit ?? ''}`;
      else if (lot.kind === 'tenement') flat = room.type === 'bedroom' || room.type === 'living' ? room.id : 'shared';
      const key = `${bp.id}.${flat}.${room.occupant ?? ''}`;
      let hh = this.hhs.get(key);
      if (!hh) {
        const kind = OCC[room.occupant] ?? (room.occupant === 'young' ? (rng.fork(key).chance(0.5) ? 'couple' : 'students') : undefined);
        hh = makeHousehold(rng, lot, key, { kind });
        this.hhs.set(key, hh);
      }
      return hh;
    },
  };
  return E;
}

// ------------------------------------------------------------------ anchors
function freePoint(L, clear = 0.55, conn = L.connectivity()) {
  const r = L.r, bl = L.blockers(), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  let best = null, bs = Infinity;
  for (let x = r.x0 + 0.5; x <= r.x1 - 0.5 + 1e-6; x += 0.15) for (let z = r.z0 + 0.5; z <= r.z1 - 0.5 + 1e-6; z += 0.15) {
    if (L.keep.some((k) => x > k.x0 - 0.2 && x < k.x1 + 0.2 && z > k.z0 - 0.2 && z < k.z1 + 0.2)) continue;
    if (bl.some((it) => obbDist(it.ob, x, z) < clear)) continue;
    if (!L.inMainRegion(x, z, conn, 1)) continue;
    const s = Math.hypot(x - cx, z - cz);
    if (s < bs) { bs = s; best = [x, z]; }
  }
  return best;
}

/** Is (x,z) a place a person can stand: inside the room (0.3 m off the walls), clear of furniture and stair openings? */
function standable(L, x, z, conn, clear = 0.27) {
  const r = L.r;
  if (x < r.x0 + 0.3 || x > r.x1 - 0.3 || z < r.z0 + 0.3 || z > r.z1 - 0.3) return false;
  for (const k of L.keep) if (k.why?.startsWith('stair') && x > k.x0 - 0.15 && x < k.x1 + 0.15 && z > k.z0 - 0.15 && z < k.z1 + 0.15) return false;
  for (const it of L.blockers()) if (obbDist(it.ob, x, z) < clear) return false;
  return L.inMainRegion(x, z, conn, 4);                 // and connected to the doors (no walled-off pockets)
}
/** Nearest standable point to (x,z) within `rad` metres, or null. */
function snapStand(L, x, z, conn, rad = 0.9) {
  if (standable(L, x, z, conn)) return [x, z];
  let best = null, bd = Infinity;
  for (let dx = -rad; dx <= rad + 1e-6; dx += 0.1) for (let dz = -rad; dz <= rad + 1e-6; dz += 0.1) {
    const d = Math.hypot(dx, dz);
    if (d >= bd || d > rad || !standable(L, x + dx, z + dz, conn)) continue;
    best = [x + dx, z + dz]; bd = d;
  }
  return best;
}

function emitAnchors(E, room, L, hh) {
  const { bp, ctx } = E, fr = bp.frame, rotY = bp.lot.rotY ?? 0;
  const fy = bp.lot.y + (room.y ?? 0);
  const conn = L.connectivity();
  const A = (kind, lx0, lz0, lry, extra = {}) => {
    let lx = lx0, lz = lz0;
    if (extra.raw) { if (!L.inMainRegion(lx0, lz0, conn, Math.ceil((extra.rad ?? 1) / 0.1))) return null; }            // seats and beds must be reachable from a door
    else { const p = snapStand(L, lx0, lz0, conn); if (!p) return null; [lx, lz] = p; }   // standing spots must be free floor
    const [wx, , wz] = fr.toWorld(lx, 0, lz);
    const a = ctx.addAnchor({ kind, x: +wx.toFixed(3), y: +(fy + (extra.dy ?? 0)).toFixed(3), z: +wz.toFixed(3), ry: +(rotY + lry).toFixed(4), building: bp.id, room: room.id, tags: extra.tags ?? [], capacity: 1, seatH: extra.seatH, owner: extra.owner });
    bp.anchors.push(a); return a;
  };
  const tvs = L.items.filter((i) => i.name === 'tv_flat' || i.name === 'tv_crt' || i.name === 'tv_wall');
  const lampNear = (it) => L.items.some((l) => l.name === 'lamp_floor' && Math.hypot(l.x - it.x, l.z - it.z) < 1.6);
  for (const it of L.items) {
    const c = it.c;
    if (c.seat && it.floor) {
      const zoff = c.arch === 'sofa' || c.arch === 'armchair' ? -0.12 : c.arch === 'pupitre' ? -0.1 : 0;
      for (const ox of seatOffsets(c)) {
        const [sx, sz] = L.rel(it, ox, zoff);
        let kind = 'sit'; const tags = ['seat', it.name];
        const tv = tvs.find((t) => { const dx = t.x - sx, dz = t.z - sz, dist = Math.hypot(dx, dz); if (dist < 1.0 || dist > 6.5) return false; const f = L.face(it); return (f[0] * dx + f[1] * dz) / dist > 0.5; });
        if (tv && (c.arch === 'sofa' || c.arch === 'armchair' || c.arch === 'chair' || c.arch === 'stool')) { kind = 'tv'; tags.push('sit', 'tv'); }
        else if (c.arch === 'pupitre' || it.flags?.work || it.flags?.cabinSeat || it.flags?.pulled) { kind = 'work'; if (c.arch === 'pupitre') tags.push('school'); }
        else if (c.arch === 'armchair' && lampNear(it)) kind = 'read';
        else if (c.arch === 'barber') tags.push('barber');
        else if (c.arch === 'pew') tags.push('chapel', 'pray');
        else if (c.arch === 'waiting') tags.push('waiting');
        A(kind, sx, sz, it.ry, { seatH: c.seat[0], tags, raw: true, rad: Math.hypot(it.w, it.d) / 2 + 0.8 });
      }
    }
    if (c.arch === 'bed' || c.arch === 'cot' || c.arch === 'mattress' || c.arch === 'bunk' || c.arch === 'crib') {
      const [sx, sz] = L.rel(it, 0, 0.0);
      A('sleep', sx, sz, it.ry, { seatH: c.arch === 'bunk' ? 0.55 : Math.min(c.bh ?? 0.5, 0.62), tags: ['bed', it.name], owner: hh.id, raw: true, rad: Math.hypot(it.w, it.d) / 2 + 0.8 });
      if (c.arch === 'bunk') A('sleep', sx, sz, it.ry, { seatH: 1.35, tags: ['bed', 'upper', it.name], owner: hh.id, raw: true, rad: Math.hypot(it.w, it.d) / 2 + 0.8 });
      const [bx, bz] = L.rel(it, it.w / 2 + 0.4, it.d / 4);
      if (c.arch !== 'crib') A('stand', bx, bz, it.ry - PI / 2, { tags: ['bedside'] });
    }
    if (c.arch === 'stove') { const [x, z] = L.rel(it, 0, it.d / 2 + 0.5); A('cook', x, z, it.ry + PI, { tags: ['stove'] }); }
    if (c.arch === 'sinkunit') { const [x, z] = L.rel(it, 0, it.d / 2 + 0.45); A('wash', x, z, it.ry + PI, { tags: ['sink'] }); }
    if (c.arch === 'lavadero') { const [x, z] = L.rel(it, 0, it.d / 2 + 0.45); A('laundry', x, z, it.ry + PI, { tags: ['lavadero'] }); }
    if (c.arch === 'line') { const [x, z] = L.rel(it, 0, 0.6); A('laundry', x, z, it.ry + PI, { tags: ['line'] }); }
    if (c.arch === 'rack' && c.tags.includes('laundry')) { const [x, z] = L.rel(it, 0, it.d / 2 + 0.45); A('laundry', x, z, it.ry + PI, { tags: ['rack'] }); }
    if (it.flags?.altar) { const [x, z] = L.rel(it, 0, it.d / 2 + 0.6); A('pray', x, z, it.ry + PI, { tags: ['altar', it.flags.chapel ? 'chapel' : 'home'] }); }
    if (it.flags?.counter) {
      const [kx, kz] = L.rel(it, 0, -(it.d / 2 + 0.5)); A('counter', kx, kz, it.ry, { tags: ['shopkeeper', E.shopType ?? 'shop'], owner: hh.id });
      for (const s of it.w > 1.5 ? [-0.5, 0.5] : [0]) { const [x, z] = L.rel(it, s, it.d / 2 + 0.55); A('customer', x, z, it.ry + PI, { tags: ['customer', E.shopType ?? 'shop'] }); }
      const [lx, lz] = L.rel(it, it.w / 2 + 0.2, it.d / 2 + 0.35); A('lean', lx, lz, it.ry + PI, { tags: ['counter'] });
    }
    if (c.arch === 'fruitstand' || c.arch === 'chopblock' || c.arch === 'oven') { const [x, z] = L.rel(it, 0, -(it.d / 2 + 0.4)); A('vend', x, z, it.ry, { tags: [it.name] }); }
    if (c.arch === 'mannequin' || it.name === 'toy_pile') { const [x, z] = L.rel(it, 0, it.d / 2 + 0.5); A(it.name === 'toy_pile' ? 'play' : 'stand', x, z, it.ry + PI, { tags: [it.name] }); }
    if (it.flags?.loft) { const [x, z] = L.rel(it, 0, it.d / 2 + 0.55); A('work', x, z, it.ry + PI, { tags: ['pigeons'] }); }
    if (c.arch === 'bench2') { const [x, z] = L.rel(it, 0, it.d / 2 + 0.5); A('work', x, z, it.ry + PI, { tags: ['bench', it.name] }); }
    if (it.name === 'motorbike') { const [x, z] = L.rel(it, 0.7, 0); A('work', x, z, it.ry - PI / 2, { tags: ['repair'] }); }
    if (it.name === 'exam_bed') { const [x, z] = L.rel(it, 0.65, 0); A('stand', x, z, it.ry - PI / 2, { tags: ['doctor'] }); }
    if (it.name === 'cage_canary') { const [x, z] = L.rel(it, 0, 0.55); A('stand', x, z, it.ry + PI, { tags: ['canary'] }); }
  }
  // room-level spots
  const area = L.W * L.D;
  if (!L.circulation && area >= 5 && !['bathroom'].includes(room.type)) {
    const p = freePoint(L, 0.5, conn);
    if (p) { A('sweep', p[0], p[1], PI * 0.25, { tags: ['sweep'] }); const q = freePoint(L, 0.5, conn); if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.1) void q; }
  }
  if (!L.circulation && area >= 9 && ['living', 'patio', 'terrace', 'shop', 'dining', 'hall'].includes(room.type)) {
    const p = freePoint(L, 0.7, conn);
    if (p) { A('chat', p[0] - 0.45, p[1], PI / 2, { tags: ['chat', 'pair'] }); A('chat', p[0] + 0.45, p[1], -PI / 2, { tags: ['chat', 'pair'] }); }
  }
  for (const l of L.landings) if (l.kind === 'door') {
    const d = (bp.doors ?? []).find((x) => x.id === l.door);
    if (d?.kind === 'exterior' || d?.kind === 'shutter') {
      const dir = { '-z': 0, '+z': PI, '-x': PI / 2, '+x': -PI / 2 }[l.wall]; // face the door from inside
      A('greet', l.x, l.z, dir + PI, { tags: ['door', 'greet'] });
    }
  }
}

// ------------------------------------------------------------------ lights
function emitLights(E, room, L, hh, recs) {
  const { bp, ctx } = E, fr = bp.frame;
  const add = (kind, lx, ly, lz, color, intensity, distance, extra = {}) => {
    const [wx, wy, wz] = fr.toWorld(lx, ly, lz);
    const l = ctx.lights.add({ x: +wx.toFixed(3), y: +wy.toFixed(3), z: +wz.toFixed(3), color, intensity, distance, kind, building: bp.id, room: room.id, ...extra });
    bp.lights.push(l); return l;
  };
  if (L.fixture) {
    const f = L.fixture, y = (room.y ?? 0) + (room.h ?? 2.7) - (f.kind === 'fan' ? 0.38 : f.kind === 'tube' ? 0.12 : 0.3);
    f.light = add('ceiling', f.x, y, f.z, f.color, f.i, f.d);
  }
  for (const it of L.items) {
    if (it.name === 'lamp_floor') add('lamp', it.x, it.y + 1.4, it.z, 0xffcf90, 2.2, 3.8);
    else if (it.name === 'lamp_table') add('lamp', it.x, it.y + 0.35, it.z, 0xffcf90, 1.6, 3.2);
    else if (it.name === 'candles_set') add('candle', it.x, it.y + 0.15, it.z, 0xffa850, 0.9, 2.4, { flicker: 0.5 });
    else if (it.name === 'candle_rack') add('candle', it.x, it.y + 1.0, it.z, 0xffa850, 1.6, 3.2, { flicker: 0.6 });
    else if ((it.name === 'tv_flat' || it.name === 'tv_crt' || it.name === 'tv_wall')) { it.light = add('tv', it.x, it.y + 0.3, it.z, 0x9db8ff, 1.0, 3.5, { flicker: 0.8 }); }
  }
  void recs;
}

// ------------------------------------------------------------------ main
export function furnishBuilding(ctx, bp) {
  if (bp.interior) return;
  const lot = bp.lot ?? {};
  // own stream: independent of how much the other modules drew from ctx.rng (stable per world seed + lot)
  const rng = makeRng((hashStr('furnish:' + bp.id) ^ (ctx.seed >>> 0) ^ ((lot.seed ?? 0) >>> 0)) >>> 0);
  resetUid();
  bp.furniture ??= []; bp.anchors ??= []; bp.lights ??= [];
  bp.colliders ??= { walls: [], floors: [] }; bp.colliders.walls ??= [];
  const E = makeEnv(ctx, bp, rng);
  const interior = bp.interior = { hh: [], rooms: {}, inter: [], layouts: new Map(), shopType: null };
  const rooms = [...(bp.rooms ?? [])].sort((a, b) => (a.floor - b.floor) || (a.id < b.id ? -1 : 1));
  for (const room of rooms) {
    const hh = E.householdFor(room);
    finishRoom(room, hh, rng, bp);
    const L = new Layout({ bp, room, rng: rng.fork('room:' + room.id), hh });
    const strip = L.W < 0.9 || L.D < 0.9;
    E.shopType = null;
    if (L.W < 0.35 || L.D < 0.35) { interior.rooms[room.id] = { items: 0, skipped: true }; continue; }
    // noFurnish: A2 keeps stair cores empty -> bulb + notice only; strips under 0.9 m get wall-hung things only
    try { (room.noFurnish ? R.lightOnly : strip ? R.thin : pickFurnisher(bp, room, L))(L, E, hh); } catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', room: room.id, message: String(e?.message ?? e), stack: e?.stack }); console.error('[furnish]', room.id, e); }
    const removed = L.heal();
    interior.layouts.set(room.id, L);
    interior.rooms[room.id] = { type: room.type, hh: hh.id, role: L.role ?? null, removed: removed.map((r) => r.name) };
    // records
    for (const it of L.items) {
      const rec = {
        id: it.id, name: it.name, room: room.id, kind: it.ceil ? 'ceil' : it.top ? 'top' : it.wall ? 'wall' : 'floor',
        x: it.x, y: +((it.y ?? 0).toFixed(3)), z: it.z, ry: it.ry, w: it.w, d: it.d, h: it.h, tint: it.tint, flags: it.flags ?? null,
        parent: it.parent?.id ?? null, decal: it.c.decal ?? null, tags: it.tags, block: !!it.block, prio: it.prio,
      };
      it.rec = rec; bp.furniture.push(rec);
    }
    // blockers
    const cy = bp.lot.y + (room.y ?? 0), rotY = bp.lot.rotY ?? 0;
    for (const it of L.blockers()) {
      const [wx, , wz] = bp.frame.toWorld(it.x, 0, it.z);
      const hh1 = Math.min(Math.max(it.bh ?? it.h, 0.6), 1.9);
      bp.colliders.walls.push(...wallsRect(wx, wz, Math.max(it.w, 0.1), Math.max(it.d, 0.1), rotY + it.ry, cy, cy + hh1, 0.01, { id: it.id, furniture: true }));
    }
    emitAnchors(E, room, L, hh);
    emitLights(E, room, L, hh);
  }
  interior.hh = [...E.hhs.values()];
  interior.shopType = E.shopType ?? lot.shop ?? null;
  collectStories(ctx, bp, E);
}
