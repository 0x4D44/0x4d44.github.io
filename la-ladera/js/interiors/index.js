// INTERIORS (A3): entry points used by main.js.
//   loadInteriorAssets(ctx)   preload the furniture GLBs, the clothes' and the close-inspection things' (stand-in boxes, cloth patches and flat shapes are used for anything not loaded)
//   furnishBuilding(ctx, bp)  PURE DATA: finishes, furniture list, blocker walls, anchors, lights, interactables, discoveries
//   buildInterior(ctx, bp)    meshes into group `${bp.id}.int`
import { Layout, resetUid, SLEEP_REACH } from './layout.js';
import { freePoint, snapStand, customerFloor } from './reach.js';
import { CATALOG, seatOffsets, seatZoff } from './catalog.js';
import { finishRoom, householdForRoom, householdKey, furnishRng, roomsInOrder } from './household.js';
import * as R from './rooms.js';
import { shopRoom } from './shops.js';
import * as S from './special.js';
import { wallsRect } from '../core/physics.js';
import { collectStories, collectInteractableStories, collectDiscoveryStories } from './stories.js';
import { dressRooms, PAGE_GARMENT_SIZES } from './garments.js';
import { dressShelves } from './shelves.js';
import { buildInterior as buildMeshes, buildInteriorSteps as buildMeshSteps, loadInteriorAssets as preload, loadGarmentAssets as loadClothes, prepareAtlas } from './build.js';
import { loadInspectAssets } from './inspect.js';
import { planShopGoods } from './goods.js';
import { loadGoodsAssets } from './goods-render.js';

/** The page's clothes: the adult, child and teen libraries (garments.js PAGE_GARMENT_SIZES; build.js asks for the first two unless told otherwise): the loose clothes of a house are drawn from all three. */
export const loadGarmentAssets = (ctx, options = {}) => loadClothes(ctx, { sizeTags: PAGE_GARMENT_SIZES, ...options });
/** The page's entry: the furniture's models, the clothes', the close-inspection things' and the shop stock's come down together (four sets, build.js, inspect.js and goods-render.js: the furniture tests call `preload` alone and see only the furniture). */
export const loadInteriorAssets = async (ctx) => { await Promise.all([preload(ctx), loadGarmentAssets(ctx), loadInspectAssets(ctx), loadGoodsAssets(ctx)]); };
/** The same four sets one by one, for a boot that asks for them in stages (js/main.js `?lazy=1`: the meshes need the first three, the drawers the fourth). */
export const loadFurnitureAssets = (ctx) => preload(ctx);
export { loadInspectAssets, loadGoodsAssets, prepareAtlas };
export const buildInterior = (ctx, bp) => buildMeshes(ctx, bp);
export const buildInteriorSteps = (ctx, bp) => buildMeshSteps(ctx, bp);

const PI = Math.PI;
export const BLOCK_MIN_H = 1.1;

/** Which furnisher handles this room? */
function pickFurnisher(bp, room, L) {
  const t = room.type, k = bp.lot?.kind, area = L.W * L.D;
  if (t === 'chapel' || (k === 'chapel' && (t === 'hall' || t === 'living'))) return S.chapel;
  if (t === 'classroom') return S.classroom;
  if (k === 'school') {                                                                       // classrooms, lavatories, the staff room, halls and galleries, the yard: furnished by what they are (special.js)
    const f = S.schoolFurnisher(room, area); if (f) return f;
    if (t === 'bedroom') return R.office;
  }
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
    householdFor(room) { return householdForRoom(rng, bp, room, this.hhs, ctx); },
    /** How many bedrooms the household has (who sleeps where depends on it: a flat has one, and everybody sleeps in it). Asked of the plan's rooms and keys alone: no household is made out of order. */
    bedroomCount(hh) {
      const c = (this.bedrooms ??= new Map());
      if (!c.has(hh.id)) c.set(hh.id, (bp.rooms ?? []).filter((r) => r.type === 'bedroom' && !(lot.kind === 'unfinished' && (r.outdoor || r.floor > 0)) && householdKey(bp, r) === hh.id).length);
      return c.get(hh.id);
    },
  };
  return E;
}

// ------------------------------------------------------------------ anchors
export { SLEEP_REACH };
/** Where on a bed the sleeper lies, in the bed's frame (layout.js `sleeperSpot`, which the layout's own judgement of a bed's reach asks too): the middle, unless the nearest floor a body can stand on is
 *  farther than `SLEEP_REACH` from it; then the least slide on the mattress toward that floor that brings it in range. */
export const sleepSpot = (L, it, conn) => { const s = L.sleeperSpot(it, conn); return [s.lx, s.lz]; };

function emitAnchors(E, room, L, hh) {
  const { bp, ctx } = E, fr = bp.frame, rotY = bp.lot.rotY ?? 0;
  const fy = bp.lot.y + (room.y ?? 0);
  const conn = L.connectivity(0.34);                       // the body's own width (0.3 m radius) plus a hand: a 0.75 m gap between a sink and a fridge is a way through for a cook
  let at = null;                                           // (the room-frame point the last standing anchor was put at)
  const A = (kind, lx0, lz0, lry, extra = {}) => {
    let lx = lx0, lz = lz0;
    if (extra.raw) { if (!L.inMainRegion(...(extra.chk ?? [lx0, lz0]), conn, Math.ceil((extra.rad ?? 1) / 0.1))) return null; }            // seats and beds must be reachable from a door (a bed: from the middle of it, not from where the sleeper lies)
    else {
      const p = snapStand(L, lx0, lz0, conn); if (!p) return null; [lx, lz] = p;           // standing spots must be free floor
      if (extra.floor && !extra.floor.has(lx, lz)) return null;                            // ... and a customer's, floor the street reaches without passing the keeper (reach.js `customerFloor`)
      at = [lx, lz];
    }
    const [wx, , wz] = fr.toWorld(lx, 0, lz);
    const a = ctx.addAnchor({ kind, x: +wx.toFixed(3), y: +(fy + (extra.dy ?? 0)).toFixed(3), z: +wz.toFixed(3), ry: +(rotY + lry).toFixed(4), building: bp.id, room: room.id, tags: extra.tags ?? [], capacity: 1, seatH: extra.seatH, owner: extra.owner, item: extra.item });
    bp.anchors.push(a); return a;
  };
  const tvs = L.items.filter((i) => i.name === 'tv_flat' || i.name === 'tv_crt' || i.name === 'tv_wall');
  const lampNear = (it) => L.items.some((l) => l.name === 'lamp_floor' && Math.hypot(l.x - it.x, l.z - it.z) < 1.6);
  for (const it of L.items) {
    const c = it.c;
    if (c.seat && it.floor) {
      const zoff = seatZoff(c);
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
        A(kind, sx, sz, it.ry, { seatH: c.seat[0], tags, raw: true, rad: Math.hypot(it.w, it.d) / 2 + 0.8, item: it.id });
      }
    }
    if (c.arch === 'bed' || c.arch === 'cot' || c.arch === 'mattress' || c.arch === 'bunk' || c.arch === 'crib') {
      if (room.type === 'bedroom') {                       // a sleeper lies in a BEDROOM (people/homelife.js: the sleep scene); a child's bunk or single in the living room (R4-705) is there for the eye, with no sleeper to lie in it
        const [sx, sz] = L.rel(it, ...sleepSpot(L, it, conn)), chk = [it.x, it.z];
        A('sleep', sx, sz, it.ry, { seatH: c.arch === 'bunk' ? 0.55 : Math.min(c.bh ?? 0.5, 0.62), tags: ['bed', it.name], owner: hh.id, raw: true, rad: Math.hypot(it.w, it.d) / 2 + 0.8, chk });
        if (c.arch === 'bunk') A('sleep', sx, sz, it.ry, { seatH: 1.35, tags: ['bed', 'upper', it.name], owner: hh.id, raw: true, rad: Math.hypot(it.w, it.d) / 2 + 0.8, chk });
      }
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
      const [kx, kz] = L.rel(it, 0, -(it.d / 2 + 0.5)), keeper = A('counter', kx, kz, it.ry, { tags: ['shopkeeper', E.shopType ?? 'shop'], owner: hh.id });
      const floor = keeper ? customerFloor(L, at, (l) => l.kind === 'door' && ['exterior', 'shutter', 'gate'].includes((bp.doors ?? []).find((d) => d.id === l.door)?.kind)) : null;       // (what the street reaches with the keeper at his post: no customer spot is past him)
      for (const s of it.w > 1.5 ? [-0.5, 0.5] : [0]) { const [x, z] = L.rel(it, s, it.d / 2 + 0.55); A('customer', x, z, it.ry + PI, { tags: ['customer', E.shopType ?? 'shop'], floor }); }
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
    for (const g of L.extra ?? []) g.light = add('ceiling', g.x, (room.y ?? 0) + (room.h ?? 2.7) - (g.kind === 'tube' ? 0.12 : 0.3), g.z, g.color, g.i, g.d);
  }
  for (const it of L.items) {
    if (it.name === 'lamp_floor') it.light = add('lamp', it.x, it.y + 1.4, it.z, 0xffcf90, 2.2, 3.8);
    else if (it.name === 'lamp_table') it.light = add('lamp', it.x, it.y + 0.35, it.z, 0xffcf90, 1.6, 3.2);
    else if (it.name === 'candles_set') it.light = add('candle', it.x, it.y + 0.15, it.z, 0xffa850, 0.9, 2.4, { flicker: 0.5 });
    else if (it.name === 'candle_rack') it.light = add('candle', it.x, it.y + 1.0, it.z, 0xffa850, 1.6, 3.2, { flicker: 0.6 });
    else if ((it.name === 'tv_flat' || it.name === 'tv_crt' || it.name === 'tv_wall')) { it.light = add('tv', it.x, it.y + 0.3, it.z, 0x9db8ff, 1.0, 3.5, { flicker: 0.8 }); }
  }
  void recs;
}

// ------------------------------------------------------------------ main
/**
 * Furnish one building as a RESUMABLE job: a generator that yields at the seams of the work (after each room's furnisher, its healing and its pocket cure, after the garments, after each
 * room's records), so that a caller with a frame budget (js/interiors/lazy.js) can spread it over frames. `furnishBuilding` is this generator run to its end: the same code in the same
 * order, so a full boot makes the same world byte for byte (tests/interiors-lazy.test.mjs holds it to that). The module's id counter (layout.js `getUid`) belongs to the job: the runner saves
 * it at every yield and puts it back at every resume.
 * `o.lazy`: the last step differs. Only the objects' prompts are registered here; the discoveries wait for the runner (`collectDiscoveryStories`), which runs them in the order of a full boot.
 */
export function* furnishSteps(ctx, bp, o = {}) {
  if (bp.interior) return;
  const lot = bp.lot ?? {};
  // own stream: independent of how much the other modules drew from ctx.rng (stable per world seed + lot); it is only ever forked, so contents.js can replay the households
  const rng = furnishRng(ctx, bp);
  resetUid();
  bp.furniture ??= []; bp.anchors ??= []; bp.lights ??= [];
  bp.colliders ??= { walls: [], floors: [] }; bp.colliders.walls ??= [];
  const E = makeEnv(ctx, bp, rng);
  const interior = bp.interior = { hh: [], rooms: {}, inter: [], layouts: new Map(), shopType: null };
  if (o.lazy) interior.walls0 = bp.colliders.walls.length;                                     // the walls from here on are the furniture's: the runner adds just those to the physics world
  const rooms = roomsInOrder(bp), built = [];
  for (const room of rooms) {
    const hh = E.householdFor(room);
    finishRoom(room, hh, rng, bp);
    const L = new Layout({ bp, room, rng: rng.fork('room:' + room.id), hh });
    const strip = L.W < 0.9 || L.D < 0.9;
    E.shopType = null;
    if (L.W < 0.35 || L.D < 0.35) { interior.rooms[room.id] = { items: 0, skipped: true }; continue; }
    // noFurnish: A2 keeps stair cores empty -> bulb + notice only; strips under 0.9 m get wall-hung things only
    try {
      const furnisher = room.noFurnish ? R.lightOnly : strip ? R.thin : pickFurnisher(bp, room, L);
      if (furnisher.steps) yield* furnisher.steps(L, E, hh); else furnisher(L, E, hh);        // (a furnisher with a long search is a job of its own that yields in it: rooms.js `bedroom.steps`)
      yield 'furnisher';
      yield* R.ensureFixturesSteps(L, E, hh, furnisher);       // the toilet, sink, stove, fridge or bed this room is defined by, however small the plan made it
    } catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', room: room.id, message: String(e?.message ?? e), stack: e?.stack }); console.error('[furnish]', room.id, e); }
    yield 'fixtures';
    let removed = L.heal(), bedroll = null;
    try { bedroll = R.ensureSleep(L, E, hh); if (bedroll) removed = removed.concat(L.heal([bedroll])); }       // a bedroom whose bed healing took out still gets somewhere to sleep
    catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', room: room.id, message: String(e?.message ?? e), stack: e?.stack }); console.error('[furnish]', room.id, e); }
    try { R.ensureStorage(L, E, hh); }                                                                         // a bedroom whose wardrobe, dresser or trunk healing took out keeps its clothes somewhere again (rooms.js)
    catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', room: room.id, message: 'storage ' + String(e?.message ?? e), stack: e?.stack }); console.error('[furnish]', room.id, e); }
    yield 'heal';
    try { removed = removed.concat(L.curePockets({ protect: bedroll ? [bedroll] : [] })); }                    // no dead-end lane or niche between 0.55 and 0.85 m is left for a walker to wedge in (layout.js `pockets`)
    catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', room: room.id, message: 'pockets ' + String(e?.message ?? e), stack: e?.stack }); console.error('[furnish]', room.id, e); }
    try { removed = removed.concat(R.ensureSeats(L)); }                                                        // a table whose chairs healing took out (a seat later furniture walled in) gets them back, or goes (rooms.js)
    catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', room: room.id, message: 'seats ' + String(e?.message ?? e), stack: e?.stack }); console.error('[furnish]', room.id, e); }
    interior.layouts.set(room.id, L);
    interior.rooms[room.id] = { type: room.type, shopType: E.shopType, hh: hh.id, role: L.role ?? null, removed: removed.map((r) => r.name) };         // shopType: set by shopRoom() for the rooms it fitted, null for the rest (goods.js stocks only those)
    built.push({ room, hh, L });
    yield 'pockets';
  }
  // a home whose kitchens are all too small for a fridge keeps it in the dining or living room (every room is furnished by now, so the lanes it must keep are known)
  if (bp.lot?.kind && !['chapel', 'school', 'clinic', 'hall'].includes(bp.lot.kind) && !(E.shopType ?? lot.shop)) R.ensureHomeFridge(built);
  // a home with children whose bedrooms took only the parents' double: the children's bed, in a bedroom or the living room (rooms.js)
  try { yield* R.ensureKidsBedsSteps(built, E); }
  catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', building: bp.id, message: 'kids beds ' + String(e?.message ?? e), stack: e?.stack }); console.error('[kids beds]', bp.id, e); }
  // every room is furnished: which of them are untidy, and the clothes that lie about (garments.js: the beds are made or unmade to match, nothing else moves)
  try { interior.garments = dressRooms(E, built); }
  catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', building: bp.id, message: 'garments ' + String(e?.message ?? e), stack: e?.stack }); console.error('[garments]', bp.id, e); }
  try { interior.shelves = dressShelves(E, built); }                                                           // what stands on the wall shelves (shelves.js): after the garments, from its own streams, so nothing placed before moves
  catch (e) { (ctx.errors ??= []).push({ stage: 'furnish', building: bp.id, message: 'shelves ' + String(e?.message ?? e), stack: e?.stack }); console.error('[shelves]', bp.id, e); }
  yield 'garments';
  for (const { room, hh, L } of built) {
    // records
    for (const it of L.items) {
      const rec = {
        id: it.id, name: it.name, room: room.id, kind: it.ceil ? 'ceil' : it.top ? 'top' : it.wall ? 'wall' : 'floor',
        x: it.x, y: +((it.y ?? 0).toFixed(3)), z: it.z, ry: it.ry, w: it.w, d: it.d, h: it.h, tint: it.tint, flags: it.flags ?? null,
        parent: it.parent?.id ?? null, decal: it.c.decal ?? null, tags: it.tags, block: !!it.block, prio: it.prio,
        wallSide: it.wallSide ?? null,                                                    // the wall its back is against (the stand-in leaves that face out: standins.js Pen.hide)
      };
      it.rec = rec; bp.furniture.push(rec);
    }
    // blockers
    const cy = bp.lot.y + (room.y ?? 0), rotY = bp.lot.rotY ?? 0;
    for (const it of L.blockers()) {
      const [wx, , wz] = bp.frame.toWorld(it.x, 0, it.z);
      // never lower than 1.1 m: the player's jump (0.66 m apex) clears any wall whose top is under feet + 0.4, so a 0.6 m bed, a toilet or a chair outline
      // could be hopped INTO and the player ended up in a pocket between two outlines (R2-001/002). The wall is invisible; the furniture mesh is what is drawn.
      const hh1 = Math.min(Math.max(it.bh ?? it.h, BLOCK_MIN_H), 1.9);
      bp.colliders.walls.push(...wallsRect(wx, wz, Math.max(it.w, 0.1), Math.max(it.d, 0.1), rotY + it.ry, cy, cy + hh1, 0.01, { id: it.id, furniture: true }));
    }
    emitAnchors(E, room, L, hh);
    emitLights(E, room, L, hh);
    yield 'records';
  }
  interior.hh = [...E.hhs.values()];
  interior.shopType = E.shopType ?? lot.shop ?? null;
  planShopGoods(bp);                                                                           // the stock of the shelves and counters: its own list (bp.goods), nothing in the layout, no collider
  if (o.lazy) collectInteractableStories(ctx, bp, E); else collectStories(ctx, bp, E);
  return E;                                                                                    // (lazy.js hands it to the discovery cursor)
}

/** Furnish one building, all of it, now (a full boot, the tests and the probes). */
export function furnishBuilding(ctx, bp, o) { for (const _ of furnishSteps(ctx, bp, o)); }        // eslint-disable-line no-unused-vars
export { collectDiscoveryStories };

/**
 * The finishes of a building's rooms (`room.finish`: floor, wall, ceiling, trim) WITHOUT furnishing it. The shell (arch/finish.js) and the footstep sounds read them, and a lazy boot builds every
 * shell before any building is furnished. The same call furnishSteps makes first for each room, from the same forked streams: the same finishes, and furnishing sets them again, unchanged.
 */
export function finishBuilding(ctx, bp) {
  const rng = furnishRng(ctx, bp), E = makeEnv(ctx, bp, rng);
  for (const room of roomsInOrder(bp)) finishRoom(room, E.householdFor(room), rng, bp);
}
