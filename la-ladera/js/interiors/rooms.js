// Per-room-type furnishers for homes. Each takes (L: Layout, E: env, hh: household) and places items through the Layout API.
// Real-world logic: bed head to the wall with access on a side, sofa facing the TV, counter run on the longest free wall,
// stove beside a gas cylinder, toilet/shower/basin with front clearance, chairs tucked around tables, decor hung clear of doors/windows.
import { CATALOG, seatOffsets, seatZoff } from './catalog.js';
import { KNEEHOLE, layoutOf } from './carcass.js';
import { spotsAt } from './reach.js';
import { opposite, wallInfo, wallPoint, WALLS, getUid, setUid } from './layout.js';
import { decalDef } from './decals.js';
import { art, clock, mirror, notice } from './decor.js';

const PI = Math.PI;
/** Hang a decal by id. */
export const D = (L, id, walls, o = {}) => L.hang('decal:' + id, walls ?? 'any', { def: decalDef(id), ...o });

// ---------------------------------------------------------------- wall galleries and household clutter (density)
/** What a room's walls may carry, in the order they are tried: '#pool' is one decal of a decor.js pool that no wall of the building shows yet, '@name' a catalogue wall item (the clock and the
 *  mirror are rationed over the barrio, decor.js), anything else a decal by id. */
function gallerySeq(L, hh, type) {
  const rng = L.rng, s = [];
  const add = (pool, n = 1) => { for (let i = 0; i < n; i++) s.push('#' + pool); };
  const faith = (n = 1) => { for (let i = 0; i < n; i++) s.push(rng.chance(0.65) ? '#faithPic' : '#blessing'); };
  switch (type) {
    case 'bedroom':
      add('art'); add('family', 2); if (hh.religious > 0.35) faith(); if (hh.kids) add('kids', 2); if (hh.teen || hh.kind === 'students') add('sport');
      s.push('@mirror_wall', '@clock_wall'); add('cal'); break;
    case 'kitchen':
      add('cal', 2); s.push('chores', '@clock_wall', '@shelf_wall'); if (hh.religious > 0.4) faith(); break;
    case 'dining':
      add('art', 2); add('family'); if (hh.religious > 0.3) faith(); add('cal'); s.push('@clock_wall', '@mirror_wall'); break;
    case 'office':
      s.push('diploma', '@clock_wall'); add('cal', 2); add('art'); break;
    default:                                                                        // living, entry, hall, corridor
      add('art', 2); add('family', 2); if (hh.religious > 0.3) faith(2); add('cal'); s.push('@clock_wall', '@mirror_wall');
      if (hh.hobby === 'football') add('sport'); if (hh.kids) add('kids'); s.push('@shelf_wall');
  }
  return s;
}
/** One entry of a gallery sequence on wall `w` (null when it does not fit or is not allowed here). */
function hangEntry(L, E, name, w, o) {
  if (name[0] === '#') return art(L, E, name.slice(1), w, o);
  if (name === '@clock_wall') return clock(L, E, w, o);
  if (name === '@mirror_wall') return mirror(L, E, w, o);
  if (name === 'chores') return art(L, E, ['chores'], w, { ...o, cap: 0.25 });
  if (name === 'diploma') return art(L, E, ['diploma'], w, { ...o, cap: 0.5 });
  return name[0] === '@' ? L.hang(name.slice(1), w, o) : D(L, name, w, o);
}
/**
 * A wall with nothing on it reads as bare paint. Give every wall with a usable stretch (>= 1 m between doors and windows) a share of pictures,
 * photos, a calendar, a clock, a mirror or a small shelf: ~1 per 1.1 m of free wall, spread along it (a gallery, not a scatter).
 */
export function dressWalls(L, E, hh, o = {}) {
  const rng = L.rng, seq = gallerySeq(L, hh, o.type ?? L.room.type), more = o.more ?? 0;
  let ix = 0, placed = 0;
  const walls = WALLS.map((w) => {
    const wi = wallInfo(L.r, w); let free = wi.hi - wi.lo;
    for (const ob of L.obs[w]) free -= (ob.u1 - ob.u0) + (ob.kind === 'door' ? 0.35 : 0.2);
    return { w, free };
  }).filter((x) => x.free >= 1.0).sort((a, b) => b.free - a.free);
  for (const { w, free } of walls) {
    const target = Math.min(o.max ?? 4, Math.floor(free / 1.1) + more);
    const have = L.decor[w].length + L.items.filter((i) => i.floor && i.block && i.wallSide === w && i.h > 1.05).length;
    const fr = rng.shuffle([0.5, 0.2, 0.8, 0.35, 0.65]);
    for (let k = have, tries = 0; k < target && tries < 8; tries++) {
      const name = seq[ix++ % seq.length], at = fr[k % fr.length];
      const it = hangEntry(L, E, name, w, { at, jitter: 0.15 });
      if (it) { k++; placed++; }
    }
  }
  return placed;
}
/** Household mess: untidy homes (hh.tidy low) leave shoes, bags, baskets, boxes and toys lying around, never in a doorway (the layout checks). */
export function clutter(L, E, hh, o = {}) {
  const rng = L.rng, n = Math.round((1 - hh.tidy) * (o.k ?? 4) + (rng.chance(0.5) ? 1 : 0)), bed = L.room.type === 'bedroom';
  // small things lie on the floor near the middle; bulky ones (boxes, baskets) stand against a wall like anyone would put them
  const floor = ['shoes_pair', 'shoes_pair', hh.kids ? 'school_bag' : 'shoes_pair', hh.kids ? 'toy_pile' : 'shoes_pair'];
  const bulky = bed ? ['laundry_basket', 'box_cardboard_s', 'chest_trunk'] : ['box_cardboard_s', 'box_cardboard_m'];
  let k = 0;
  for (let i = 0; i < n + 6 && k < n; i++) {
    const it = rng.chance(0.65) ? L.free(rng.pick(floor), { rad: Math.max(L.W, L.D) / 2, prio: 2 }) : L.wall(rng.pick(bulky), 'any', { prio: 2, at: 'corner' });
    if (it) k++;
  }
  return k;
}
const any = (...fns) => { for (const f of fns) { const r = f(); if (r) return r; } return null; };
const floorArea = (L) => L.W * L.D;
const nm = (arr, rng) => arr[Math.floor(rng.next() * arr.length)];

// ---------------------------------------------------------------- the fixtures a room is defined by
/** Placement rungs for what a room cannot be without (the toilet of a bathroom, the sink of a kitchen, the bed of a bedroom): the strict layout first, then
 *  the window zones, the clearance in front of things, the walking-lane test and the margin of the door sweep give way, one at a time. A2's plans have 1.6 x 1.7 m
 *  bathrooms and 1.9 x 2.1 m kitchens with a door that sweeps a metre into the room: the strict rules leave no wall for a shower or a sink there. */
const RUNGS = [
  {},
  { winOk: true },
  { winOk: true, noClear: true },
  { winOk: true, noClear: true, noConn: true },
  { winOk: true, noClear: true, noConn: true, keepLateral: 0.05 },      // the door's own width always stays clear (layout.js DOOR_LANE deep: data test 0.7 m, interiors-doorlane the walk)
];
const HOLD = new Set(['stove', 'bed', 'cot', 'bunk', 'mattress', 'mattress_up']);   // the space in front of a stove and beside a bed is what makes them usable: it never gives way
export function placeEssential(L, names, o = {}) {
  const { walls = 'any', alongToo = false, maxRung = RUNGS.length, ...opts } = o;
  for (const along of alongToo ? [false, true] : [false]) for (const [k, r] of RUNGS.entries()) {
    if (k >= maxRung) break;                                                                                  // rungs 0..maxRung-1 only: the ones that cut a room's lanes are dear
    if (k === 2 && !along)for (const b of L.items) if (b.floor && b.zones?.length && !HOLD.has(b.c.arch)) b.zones = [];        // the clearance in front of what is already there gives way too
    for (const name of names) {
      const it = L.wall(name, walls, { prio: 0, ...opts, ...r, along });
      if (it) { if (r.noClear) it.zones = []; return it; }
    }
  }
  return null;
}
/** placeEssential, and when even the last rung fails, the household's clutter (prio >= 2: a bucket, a drying rack, a stool, the bin in the corner of a 3 m2 bathroom)
 *  makes room one piece at a time. Standing things that nobody collides with (`block: false`: a bin, a pair of shoes) are clutter too: they still take the floor
 *  the next piece needs, and `valid()` refuses an overlap with them. Rugs and mats (under 5 cm) never get in the way. */
export function placeEvicting(L, names, o = {}) {
  let it = placeEssential(L, names, o);
  for (let k = 0; !it && k < 8; k++) {
    const victim = L.items.filter((i) => i.floor && i.prio >= 2 && (i.block || i.c.size[1] >= 0.05)).sort((a, b) => (b.prio - a.prio) || (b.w * b.d - a.w * a.d))[0];
    if (!victim) break;
    L.remove(victim);
    it = placeEssential(L, names, o);
  }
  return it;
}

// ---------------------------------------------------------------- the fixture solver
/** One fixture a room is defined by: the catalogue names that will do (best first) and the wall() options to place it with. */
export const slot = (names, o = {}) => ({ names, o });
/** Relaxations for the solver, gentlest first. `sweep`: the door keep-outs shrink to the leaf's real sweep (Layout.sweepKeeps) and, with `keepLateral`, to the door's own
 *  width: a cupboard may stand against the jamb, nothing stands in the opening or under the leaf. */
const SOLVE_RUNGS = [
  { o: {} },
  { o: { winOk: true } },
  { o: { winOk: true, keepLateral: 0.05 }, sweep: true },
  { o: { winOk: true, keepLateral: 0.05, noClear: true }, sweep: true },
  { o: { winOk: true, keepLateral: 0.05, noClear: true, noConn: true }, sweep: true },
];
const permutations = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
/**
 * Place every slot at once, depth first over the wall poses of each. A greedy order (the shower in the corner, then the toilet in the best spot, then whatever wall is left
 * for the basin) leaves the last piece nothing in a 2.0 x 1.4 m bathroom whose door takes most of one wall; a search finds the arrangement that holds all of them. The gentlest
 * rung that works wins; `o.maxRung` stops short of the rungs that cut a room's lanes (a kitchen or a bedroom with two doors). The room should hold nothing else (call
 * L.clear() first). Returns the placed items in slot order, or null with the room as it was. `o.budget` caps the poses tried per rung, `o.fan` the poses tried per piece
 * (the tests turn both down to see which rooms need the search).
 * The search is a resumable job too (`solveFixturesSteps`): a bedroom of 6 m2 with four beds to find is 100 000 poses and more, 300 to 800 ms, and a frame has 4 ms for the interiors (lazy.js).
 * It yields every `SOLVE_SLICE` poses tried and never changes what it finds (the same poses in the same order: the room is only left alone between two of them); `solveFixtures` is it run to its end.
 */
export function solveFixtures(L, slots, o = {}) { return drain(solveFixturesSteps(L, slots, o)); }
/** A resumable job run to its end: the sync form of the generators below (`solveFixtures`, `fillBeds`, `bedroom`, `ensureFixtures`). */
const drain = (g) => { for (let r = g.next(); ; r = g.next()) if (r.done) return r.value; };
/** Poses the solver tries between two yields: about 2 ms (a pose costs 2 microseconds when it fails early and 30 to 60 when it reaches the floods). */
export const SOLVE_SLICE = 1000;
/**
 * The key of each slot (its pieces and its options): two orders of the same pieces in the same options are one search, and an order that found nothing leaves the room as it was, so the second of them
 * would find nothing again. The solver runs only the first (a list of four beds, two of them alike, has 12 searches to make and not 24) and takes the ids the second would have taken, so
 * that the world is the same. A Map slot -> key; null (every order is run) when a piece could draw a tint from the room's stream (`Layout._commit` does when the household has none for its colours: the
 * stream would not be the one it was) or an option is not a plain value.
 */
function slotKeys(L, slots) {
  const fns = new Map(), keys = new Map();
  try {
    for (const s of slots) {
      if (s.o.jitter) return null;
      for (const n of s.names) { const c = CATALOG[n]; if (c.cols && c.cols !== 'none' && L.hh?.tints?.[c.cols] == null) return null; }
      const parts = [];
      for (const k of Object.keys(s.o).sort()) {
        const v = s.o[k];
        if (typeof v === 'function') { if (!fns.has(v)) fns.set(v, fns.size); parts.push(`${k}=#${fns.get(v)}`); }
        else if (v !== null && typeof v === 'object' && !Array.isArray(v)) return null;
        else parts.push(`${k}=${JSON.stringify(v)}`);
      }
      keys.set(s, `${s.names.join(',')}|${parts.join(',')}`);
    }
  } catch { return null; }
  return keys;
}
export function* solveFixturesSteps(L, slots, o = {}) {
  const top = Math.min(o.maxRung ?? SOLVE_RUNGS.length - 1, SOLVE_RUNGS.length - 1), maxNodes = o.budget ?? 120, fan = o.fan ?? 6;
  const keeps = L.keep, size = (s) => Math.max(...s.names.map((n) => CATALOG[n].size[0] * CATALOG[n].size[2]));
  const biggestFirst = slots.slice().sort((a, b) => size(b) - size(a)), keys = o.dedupe === false ? null : slotKeys(L, slots);        // (`o.dedupe: false`: every order is run, as the tests do to see what the shortcut saves)
  let mark = L.checks ?? 0;                                                                            // the poses tried when the job last yielded
  try {
    for (let k = 0; k <= top; k++) {
      const rung = SOLVE_RUNGS[k], failed = new Map();                                                 // (failed: the orders of this rung that found nothing -> the ids they took)
      L.keep = keeps;
      if (rung.sweep) L.sweepKeeps();
      let nodes = 0, start = L.checks ?? 0;
      const spent = () => nodes > maxNodes || (L.checks ?? 0) - start > 40 * maxNodes;      // poses committed, and poses merely tried (a rejected pose is cheap: 40 per node)
      const dfs = function* (order, i) {
        if (i === order.length) return [];
        const { names, o: so } = order[i];
        for (const name of names) for (const along of so.alongToo ? [false, true] : [false]) {
          let n = 0;
          for (const it of L.wallPoses(name, 'any', { prio: 0, ...so, ...rung.o, along })) {
            if (so.accept && !so.accept(it)) continue;                                                   // (a slot may take only some of the valid poses: the extra beds of a bedroom keep off its windows)
            nodes++;
            L._commit(it, {}); if (rung.o.noClear) it.zones = [];
            const rest = yield* dfs(order, i + 1);
            if (rest) return [it, ...rest];
            L.remove(it);
            if (++n >= fan || spent()) break;
            if ((L.checks ?? 0) - mark >= SOLVE_SLICE) { mark = L.checks ?? 0; yield 'solve'; }           // (between two poses, with only the pieces above this one placed: nothing else reads the room)
          }
          if (spent()) return null;
        }
        return null;
      };
      for (const order of permutations(biggestFirst)) {
        const key = keys ? order.map((s) => keys.get(s)).join('/') : null, took = key === null ? undefined : failed.get(key);
        if (took !== undefined) { setUid(getUid() + took); continue; }                                  // (the same search as one that found nothing: it takes the ids it took)
        const uid0 = getUid();
        const got = yield* dfs(order, 0);
        if (got) return slots.map((s) => got[order.indexOf(s)]);
        if (key !== null) failed.set(key, getUid() - uid0);
        nodes = 0; start = L.checks ?? 0;                  // each order gets its own budget; the rungs that cut lanes try the biggest piece first only
        if (k >= 4) break;
      }
    }
    return null;
  } finally { L.keep = keeps; }
}
const hasItem = (L, re) => L.items.some((i) => re.test(i.name));
export const REAL_BED = /^bed_(single|single_metal|double|double_wood|bunk|cot)$/;
export const SHOWER = /^shower_(tray|small)$/;
const BASIN = /^basin_/;
const SINK = /^sink_|^lavadero$/;
const bathFixtures = (L) => hasItem(L, SHOWER) && hasItem(L, /^toilet$/) && hasItem(L, BASIN);
/** The three pieces a bathroom is defined by, as solver slots (shower, toilet, basin). */
export const bathSlots = (hh) => [slot(['shower_tray', 'shower_small'], { at: 'corner' }), slot(['toilet'], { at: 'center' }), slot(hh.income ? ['basin_vanity', 'basin_pedestal'] : ['basin_pedestal'])];
/** The three pieces a kitchen is defined by, as solver slots (stove, sink, fridge; the small ones under 5.5 m2). */
export const kitchenSlots = (L) => { const small = floorArea(L) < 5.5; return [slot(['stove_gas']), slot(small ? ['sink_small', 'sink_kitchen'] : ['sink_kitchen', 'sink_small']), slot(small ? ['fridge_small'] : ['fridge', 'fridge_small'])]; };
/** A bathroom the furnisher could not complete: clear it and let the solver find the arrangement of shower, toilet and basin the plan's room really holds, then dress it. */
function* repackBathroomSteps(L, E, hh) {
  const snap = L.snapshot();
  L.clear();
  const got = yield* solveFixturesSteps(L, bathSlots(hh));
  if (!got) { L.restore(snap); return false; }
  bathroomDress(L, E, hh, got[0], got[2]);
  return true;
}
/** Bathroom: a toilet, a basin and a shower (tray + the electric head on the wall), whatever the plan gave. */
function* ensureBathroomSteps(L, E, hh) {
  if (!bathFixtures(L) && (yield* repackBathroomSteps(L, E, hh))) { ensureShowerHead(L); return; }
  if (!hasItem(L, SHOWER)) placeEvicting(L, ['shower_tray', 'shower_small'], { at: 'corner' });
  if (!hasItem(L, /^toilet$/)) placeEvicting(L, ['toilet'], {});
  if (!hasItem(L, BASIN)) placeEvicting(L, hh.income ? ['basin_vanity', 'basin_pedestal'] : ['basin_pedestal'], {});
  ensureShowerHead(L);
}
/** The electric head on the wall by the tray: beside it on the tray's wall; else up over the tray itself (a corner whose two walls the windows and the door take, or a tray flush to a wall
 *  too short to pass it); else on any wall, then lower. */
function ensureShowerHead(L) {
  const sh = L.items.find((i) => SHOWER.test(i.name));
  if (!sh || hasItem(L, /^shower_head_electric$/)) return;
  const o = { near: [sh.x, sh.z], nearW: 8, y: 1.9, w: 0.2, h: 0.25 };
  any(() => L.hang('shower_head_electric', sh.wallSide, o), () => L.hang('shower_head_electric', sh.wallSide, { ...o, inside: sh }),
    () => L.hang('shower_head_electric', 'any', o), () => L.hang('shower_head_electric', 'any', { ...o, y: 1.75 }));
}
/** A kitchen without its stove or sink: clear it, let the solver put both on the walls the plan's room has (the run of counters is dressed around them afterwards). */
function* repackKitchenSteps(L, E, hh) {
  const snap = L.snapshot(), needBoth = !hasItem(L, /^stove_/) || !hasItem(L, SINK), slots = kitchenSlots(L);
  L.clear();
  let got = yield* solveFixturesSteps(L, slots, { maxRung: 3 });
  if (!got && needBoth) got = yield* solveFixturesSteps(L, slots.slice(0, 2), { maxRung: 3 });
  if (!got) { L.restore(snap); return false; }
  const f = got[2]; if (f) f.flags = { magnets: true };
  kitchenDress(L, E, hh, [got[0]]);
  return true;
}
/** Kitchen: a stove, a sink and a fridge. */
function* ensureKitchenSteps(L, E, hh) {
  const small = floorArea(L) < 5.5;
  if (!hasItem(L, /^stove_/) || !hasItem(L, SINK) || !hasItem(L, /^fridge/)) yield* repackKitchenSteps(L, E, hh);
  if (!hasItem(L, /^stove_/)) placeEvicting(L, ['stove_gas'], {});
  if (!hasItem(L, SINK)) placeEvicting(L, small ? ['sink_small', 'sink_kitchen'] : ['sink_kitchen', 'sink_small'], {});
  if (!hasItem(L, /^fridge/)) { const f = placeEvicting(L, small ? ['fridge_small'] : ['fridge', 'fridge_small'], {}); if (f) f.flags = { magnets: true }; }
}
/** A bedroom without a real bed: clear it and let the solver find one pose that leaves every door its lane, then dress the room around it. Null when none does. */
function* repackBedroomSteps(L, E, hh) {
  const snap = L.snapshot();
  L.clear();
  const got = yield* solveFixturesSteps(L, [slot(L.role === 'kids' ? ['bed_bunk', 'bed_single', 'bed_single_metal', 'bed_cot'] : ['bed_single', 'bed_single_metal', 'bed_cot'], { awayDoors: true, alongToo: true })], { maxRung: 3 });
  if (!got) { L.restore(snap); return null; }
  got[0].flags = { unmade: L.rng.chance(1 - hh.tidy) };
  bedroomDress(L, E, hh, L.role, got[0]);
  return got[0];
}
/** Bedroom: a real bed (a frame, not a mattress leaned on the wall) when the plan left room for one. */
function* ensureBedroomSteps(L, E, hh) {
  if (hasItem(L, REAL_BED)) return;
  if (yield* repackBedroomSteps(L, E, hh)) return;
  if (L.role === 'study') return;                                                                                    // a study keeps whatever its furnisher gave it
  const lean = L.items.filter((i) => i.name === 'mattress_leaning' || i.name === 'mattress_floor');
  for (const m of lean) L.remove(m);
  const names = L.role === 'kids' ? ['bed_bunk', 'bed_single', 'bed_single_metal', 'bed_cot'] : ['bed_single', 'bed_single_metal', 'bed_cot'];
  const b = placeEvicting(L, names, { awayDoors: true, alongToo: true });
  if (b) { b.flags = { unmade: L.rng.chance(1 - hh.tidy) }; return; }
  for (const m of lean) L.items.push(m);                                                                             // nothing fits: the mattress stays exactly where it was
}
const SLEEPS = new Set(['bed', 'cot', 'bunk', 'mattress', 'mattress_up']);
/** After heal(): a bedroom (not a study) whose bed the healing took out, or that never had room for one, gets a mattress stood on its edge: somewhere to sleep that
 *  a three-door cell of 4 m2 can hold. Returns the mattress (so the caller heals again without it) or null. */
export function ensureSleep(L, E, hh) {
  if (L.room.type !== 'bedroom' || !L.role || L.role === 'study' || L.W < 0.9 || L.D < 0.9) return null;
  if (L.items.some((i) => i.floor && SLEEPS.has(i.c.arch))) return null;
  const m = placeEvicting(L, ['mattress_leaning'], {});
  if (m) m.flags = { unmade: false };
  return m;
}
/** Called after a home furnisher: the defining fixtures of the room are there or the plan really has no wall for them. */
export function ensureFixtures(L, E, hh, furnisher) { drain(ensureFixturesSteps(L, E, hh, furnisher)); }
/** `ensureFixtures` as a resumable job (index.js `furnishSteps`): the searches of a kitchen's stove, sink and fridge or a bathroom's three fixtures yield every `SOLVE_SLICE` poses. */
export function* ensureFixturesSteps(L, E, hh, furnisher) {
  if (L.W < 0.9 || L.D < 0.9) return;
  if (furnisher === bathroom) yield* ensureBathroomSteps(L, E, hh);
  else if (furnisher === kitchen) yield* ensureKitchenSteps(L, E, hh);
  else if (furnisher === bedroom) yield* ensureBedroomSteps(L, E, hh);
}
/**
 * Every home has a fridge. When no kitchen could hold one (a 1.6 m wide rowhouse kitchen with the stove and the sink along its only free wall) it stands in the dining room,
 * the living room or the hall, as it does in a house that size. Strict placement only (the walking lanes stay, so the heal pass of the room has no reason to take it out).
 * `built`: [{ room, L }] of the whole building, after every room is furnished. Returns the room that took it, or null.
 */
export function ensureHomeFridge(built) {
  if (built.some((b) => hasItem(b.L, /^fridge/))) return null;
  for (const type of ['kitchen', 'dining', 'living', 'hall', 'entry']) {
    for (const b of built.filter((x) => x.room.type === type && x.L.W >= 0.9 && x.L.D >= 0.9 && !x.L.room.outdoor)) {
      const f = placeEssential(b.L, ['fridge', 'fridge_small'], { maxRung: 2 });
      if (f) { f.flags = { magnets: true }; return b; }
    }
  }
  return null;
}

/** Chairs tucked around a table (n of them, as many as fit). `o.dense`: a chair to every 0.55 m of a side and no hand's breadth to spare (a 1 m table seats two on a side, not one). `o.small`: the catalogue
 *  name of a stool to try where the chair does not fit (it stands a hand's breadth shallower: R4-704, a 1 m table in the 1.9 m passage of a rowhouse dining room seats two stools, not two chairs).
 *  With either, a seat that a later one walled in is taken out again (a plastic table on a 2 m terrace: the stool west of it, and the one south of it that shut it in). `o.calm()`: false while the
 *  seats set so far take a front from a piece that opens (`reachKept`): the last of them go until it is true. */
export function chairsAround(L, table, n, names, o = {}) {
  if (!table) return [];
  const rng = L.rng, out = [];
  const hw = table.c.size[0] / 2, hd = table.c.size[2] / 2;
  const sides = [];
  const longX = hw >= hd;
  const cnt = (len) => Math.max(1, Math.min(3, Math.floor((o.dense ? len + 0.1 : len) / 0.55 + 1e-6)));
  const mk = (lx0, lz0, dx, dz, k, dry, gapAxis) => {
    for (let i = 0; i < k; i++) {
      const t = k === 1 ? 0 : (i / (k - 1) - 0.5) * (k - 1) * 0.55;
      sides.push({ lx: lx0 + dx * t, lz: lz0 + dz * t, dry, axis: gapAxis, sgn: Math.sign(gapAxis === 'z' ? lz0 : lx0) });
    }
  };
  const c0 = CATALOG[names[0]], cd = c0.size[2] / 2 + (o.gap ?? 0.03);
  mk(0, hd + cd, 1, 0, cnt(hw * 2), PI, 'z');      // +z side faces -z
  mk(0, -hd - cd, 1, 0, cnt(hw * 2), 0, 'z');
  mk(hw + cd, 0, 0, 1, longX ? 1 : cnt(hd * 2), -PI / 2, 'x');
  mk(-hw - cd, 0, 0, 1, longX ? 1 : cnt(hd * 2), PI / 2, 'x');
  // balance: interleave long sides first
  const order = sides.map((s, i) => ({ s, k: (longX ? (s.axis === 'z' ? 0 : 1) : (s.axis === 'x' ? 0 : 1)) * 10 + (i % 3) + rng.next() * 0.3 })).sort((a, b) => a.k - b.k).map((x) => x.s);
  for (const s of order) {
    if (out.length >= n) break;
    const pick = nm(names, rng);
    let it = L.atRel(pick, table, s.lx, s.lz, s.dry, { prio: 2 });
    if (!it && o.small && pick !== o.small && CATALOG[o.small]) {
      const back = cd - (CATALOG[o.small].size[2] / 2 + (o.gap ?? 0.03));                                        // (the stool's own edge distance: it is drawn in to the table by what it is shallower)
      it = L.atRel(o.small, table, s.axis === 'x' ? s.lx - s.sgn * back : s.lx, s.axis === 'z' ? s.lz - s.sgn * back : s.lz, s.dry, { prio: 2 });
    }
    if (it) out.push(it);
  }
  if (o.dense || o.small) for (let bad = shutAmong(L, out); bad.length; bad = shutAmong(L, out)) { L.remove(bad[0]); out.splice(out.indexOf(bad[0]), 1); }       // (a seat that one set later walled in is no seat: no sit anchor could stand at it)
  if (o.calm) while (out.length && !o.calm()) L.remove(out.pop());
  return out;
}
/** The poses to try a table at, best first: free in the room round `near`, then against a wall (the long side along it, the chairs on the open side); `wallFirst` the other way round (a small kitchen). */
export function* tablePoses(L, name, near, rys, wallFirst = false) {
  const free = function* () { let k = 0; for (const it of L.freePoses(name, near, { rys, prio: 0 })) { yield it; if (++k >= 24) return; } };
  const wall = function* () { let k = 0; for (const it of L.wallPoses(name, 'any', { prio: 0, awayDoors: true })) { yield it; if (++k >= 24) return; } };
  yield* wallFirst ? wall() : free();
  yield* wallFirst ? free() : wall();
}
/**
 * A table where no chair can be pulled up seats nobody (R4-304: 41 of the barrio's 119 tables had no chair or stool: in the passage of a 1.93 m dining room, between a door and a wall, beside a toy pile).
 * With fewer than `need` chairs, the table and what stands round it come out and its other poses (`poses()`, started once the table is out) are tried, the chairs a little denser; the first that
 * seats `need` stays, else the one that seats most (the first, when none seats more). `calm()`: a pose that takes a front from a piece that opens (a table across the pantry) is not one (R4-118). Returns { table, chairs }.
 */
function reseat(L, table, chairs, names, n, poses, need = 2, calm = () => true) {
  if (chairs.length >= need) return { table, chairs };
  const drop = (t, cs) => { for (const c of cs) L.remove(c); L.remove(t); };
  const put = (t, cs) => { L._commit(t, {}); for (const c of cs) L._commit(c, {}); };
  drop(table, chairs);
  let best = { table, chairs }, tried = 0;
  for (const it of poses()) {
    tried++;
    L._commit(it, {});
    const cs = calm() ? chairsAround(L, it, n, names, { dense: true, small: STOOL, calm }) : [];
    if (cs.length >= need) return { table: it, chairs: cs };
    if (cs.length > best.chairs.length) best = { table: it, chairs: cs };
    drop(it, cs);
  }
  put(best.table, best.chairs);
  return best;
}
/** `fn()` with the room's decoration out of it (what has priority 2 or less and stands on the floor: plants, toys, shoes, a side table; and what `also` names; never what `keep` lists), then put back, each
 *  piece where it still fits: whatever the new arrangement stands on goes, and so does what would shut in a seat or a bed (a stool drawn up to a table must stay a place to walk up to: the 'anchors'
 *  census holds every seat to a sit anchor). Returns what `fn` returns. */
function softened(L, keep, fn, also = null) {
  const soft = L.items.filter((i) => i.floor && !i.parent && (i.prio >= 2 || also?.test(i.name)) && i.c.size[1] >= 0.05 && !keep.includes(i));
  const kids = soft.map((s) => L.items.filter((x) => x.parent === s));
  for (const s of soft) L.remove(s);
  try { return fn(); } finally {
    const shut = shutIn(L);
    soft.forEach((s, k) => {
      if (!L.valid(s, {})) return;
      L._commit(s, {});
      if (shutIn(L) > shut) { L.remove(s); return; }
      for (const c of kids[k]) L._commit(c, {});
    });
  }
}
/**
 * A table with its chairs, or no table: `reseat`, and where that still leaves fewer than `need` chairs the room's decoration (plants, toys, shoes, a side table, a pantry: whatever has priority 2
 * or less) comes out for a second try and goes back where it still fits; a table nobody can sit at (a 1.6 m passage between two doors, a galley) is taken out rather than left bare. Returns the table (null: taken out).
 */
export function seatTable(L, first, names, n, poses, need = 2, have = []) {
  const was = reachOf(L), calm = () => reachKept(L, was), opens = L.items.filter((i) => was.has(i));            // (what opens stays, and keeps every front a person could stand at: a stool before the fridge makes it decoration, R4-118)
  let r = reseat(L, first, [...have, ...chairsAround(L, first, n - have.length, names, { small: STOOL, dense: have.length > 0, calm })], names, n, poses, need, calm);       // (round the seats it has: they were set as close as the table allows)
  const soften = (fn) => softened(L, [r.table, ...r.chairs, ...opens], fn);
  if (r.chairs.length < need) soften(() => { r = reseat(L, r.table, r.chairs, names, n, poses, need, calm); });
  for (let name = SMALLER[r.table.name]; name && r.chairs.length < need; name = SMALLER[name]) {            // a smaller table, where the one there is too big for two chairs (R4-704: the 1 m table of a 1.9 m passage)
    const old = r, at = old.table;
    for (const c of old.chairs) L.remove(c);
    L.remove(at);
    const small = L._make(name, at.x, at.z, at.ry, { prio: 0 });                                                 // (inside the old one's footprint, so valid where it stood)
    r = reseat(L, small, [], names, n, () => tablePoses(L, name, [at.x, at.z], [0, PI / 2], true), need, calm);
    if (r.chairs.length < need) soften(() => { r = reseat(L, r.table, r.chairs, names, n, () => tablePoses(L, name, [at.x, at.z], [0, PI / 2], true), need, calm); });
    if (r.chairs.length < old.chairs.length) {                                                                     // (fewer seats: the first table and its chairs stay; as many, and the smaller table is the one that fits the nook)
      for (const c of r.chairs) L.remove(c);
      L.remove(r.table);
      L._commit(old.table, {}); for (const c of old.chairs) L._commit(c, {});
      r = old;
    }
  }
  if (r.chairs.length) return r.table;
  L.remove(r.table);
  return null;
}

const EATING_TABLE = /^table_(formica_4|formica_6|wood_6|round_small|plastic)$/, SITS = new Set(['chair', 'stool', 'bench']), TV_SET = /^tv_(flat|crt)$/;
const STOOL = 'stool_wood', SMALLER = { table_wood_6: 'table_formica_4', table_formica_6: 'table_formica_4', table_formica_4: 'table_round_small', table_plastic: 'table_round_small' };     // (the next table down: each stands inside the footprint of the one before)
/** The chairs, stools and benches drawn up to a table: those within a hand's breadth beyond its edge, in its own frame. */
export function seatsAt(L, t) {
  const c = Math.cos(t.ry), s = Math.sin(t.ry), hw = t.c.size[0] / 2 + 0.55, hd = t.c.size[2] / 2 + 0.55;
  return L.items.filter((x) => x !== t && x.floor && !x.parent && SITS.has(x.c.arch) && Math.abs((x.x - t.x) * c - (x.z - t.z) * s) <= hw && Math.abs((x.x - t.x) * s + (x.z - t.z) * c) <= hd);
}
/** After healing: a table whose chairs were taken out (healing drops a seat that later furniture walled in) gets seats somewhere they fit, or goes itself, since a table nobody can sit at is a prop
 *  (R4-304: tenement rooms with a table and no chair); and a living room's TV with nothing left to sit on gets a seat, or goes (its stand stays), for the same reason (R4-702). Returns what was taken out. */
export function ensureSeats(L) {
  const gone = [];
  for (const t of L.items.filter((i) => i.floor && !i.parent && EATING_TABLE.test(i.name))) {
    const have = seatsAt(L, t);
    if (have.length >= 2) continue;                                                                          // (a table with the one chair healing left it has half a set: R4-704)
    if (!seatTable(L, t, ['chair_plastic', 'stool_wood'], t.c.size[0] > 1.2 ? 4 : 2, () => tablePoses(L, t.name, [t.x, t.z], [0, PI / 2], true), 2, have)) gone.push(t);
  }
  if (L.room.type === 'living') for (const tv of L.items.filter((i) => i.parent && TV_SET.test(i.name))) {
    if (L.items.some((i) => i.floor && i.c.seat) || tvSeat(L, L.hh ?? {}, tv, tv.parent)) continue;
    L.remove(tv); gone.push(tv);
  }
  return gone;
}

/** Ceiling fixture of a room (bulb / tube / fan). Records L.fixture for the light + mesh stage. */
export function ceilingFixture(L, E, hh, kind) {
  if (L.room.outdoor) return;
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  const area = floorArea(L), t = L.room.type;
  const wantFan = !L.circulation && area >= 7 && (t === 'living' || t === 'bedroom' || t === 'dining' || t === 'classroom' || t === 'shop' || t === 'office')
    && L.rng.chance(hh && hh.income ? 0.8 : 0.5);
  const tube = kind === 'tube';
  if (wantFan) {
    L.ceil('fan_ceiling', cx, cz, { ry: L.rng.range(0, PI) });
    L.fixture = { x: cx, z: cz, kind: 'fan', color: 0xffe2b0, i: 6.5, d: 6.5 };
  } else if (tube) {
    L.ceil('light_tube', cx, cz, { ry: L.W > L.D ? 0 : PI / 2 });
    L.fixture = { x: cx, z: cz, kind: 'tube', color: TUBE_WARM, i: 9, d: 7.5 };
  } else {
    L.ceil('bulb_bare', cx, cz);
    L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffd9a0, i: 6, d: 6.5 };
  }
  moreLights(L, tube ? 'tube' : 'bulb');
}
/** The tint of a ceiling tube (a shop's, a clinic's, a classroom's, a living room's): a warm-white tube of about 3200 K. It was a 7400 K blue-white (0xeaf2ff) and a shop lit by it read cold from
 *  the street at night, bluer and flatter than the warm window glow over it (R1-D19). */
export const TUBE_WARM = 0xffba80;
/** Big rooms (> 30 m2) get a grid of ceiling lights, one per ~4.5 m, instead of one in the middle (a dark hall with a bright patch). Extra fixtures are in L.extra. */
export function moreLights(L, kind) {
  const area = floorArea(L); if (area <= 30 || L.room.outdoor) return;
  const cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2, nx = Math.max(1, Math.round(L.W / 4.5)), nz = Math.max(1, Math.round(L.D / 4.5)), tube = kind === 'tube';
  L.extra = L.extra ?? [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = L.r.x0 + L.W * (i + 0.5) / nx, z = L.r.z0 + L.D * (j + 0.5) / nz;
    if (Math.hypot(x - cx, z - cz) < 1.4 || L.extra.length >= 8) continue;
    if (L.items.some((c) => c.ceil && Math.hypot(c.x - x, c.z - z) < 1.0)) continue;        // not on top of a fan or another fixture
    if (!L.ceil(tube ? 'light_tube' : 'bulb_bare', x, z, { ry: L.W > L.D ? 0 : PI / 2 })) continue;
    L.extra.push({ x, z, kind: tube ? 'tube' : 'bulb', color: tube ? TUBE_WARM : 0xffd9a0, i: tube ? 8 : 5.5, d: 6.5 });
  }
}

// ---------------------------------------------------------------- decoration helpers
function frames(L, E, hh, n, pool) {
  let k = 0;
  for (let i = 0; i < n + 2 && k < n; i++) if (art(L, E, pool, 'any')) k++;
  return k;
}
function religiousWall(L, E, hh, over) {
  const p = art(L, E, 'faithPic', over ? over.wallSide : 'any', over ? { over, y: Math.max(1.5, over.h + 0.1) } : {});
  if (!p) return null;
  if (L.rng.chance(0.55)) L.hang('crucifix_wall', p.wallSide, { near: [p.x, p.z], nearW: 4, y: 1.9 });
  return p;
}
/** Extra things so that no room is bare: tops, plants, clutter, wall decor (until `min` items). */
export function fillMin(L, E, hh, min = 4) {
  const rng = L.rng, deco = () => L.items.filter((i) => !i.ceil || i.name === 'fan_ceiling' || i.name === 'plant_hanging').length;
  const tries = [
    () => art(L, E, 'art', 'any'),
    () => clock(L, E, 'any', {}),
    () => art(L, E, 'family', 'any'),
    () => art(L, E, 'cal', 'any'),
    () => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }),
    () => L.wall('box_cardboard_m', 'any', { at: 'corner', prio: 2 }),
    () => mirror(L, E, 'any', {}),
    () => L.wall('plant_bucket', 'any', { at: 'corner', prio: 2 }),
    () => L.free('shoes_pair', { rad: 3, prio: 2 }),
    () => L.hang('shelf_wall', 'any', {}),
  ];
  for (let g = 0; g < 14 && deco() < min; g++) tries[g % tries.length]();
}

// ---------------------------------------------------------------- LIVING
/** A set is watched from somewhere (R4-702: 31 of the barrio's 195 living rooms had a TV and nowhere to sit, every living room of the flats of L06, L16 and L71 among them: three doors in 3 m leave no wall for a
 *  sofa). The sofa did not fit, so what does, seen from the set (a seat of index.js `emitAnchors`' 'tv' kind: an armchair, chair or stool facing it, a metre or more off): an armchair against a wall, a chair
 *  or a stool drawn up in front of it, the bench along a wall; failing those, the armchair or the bench facing wherever the wall allows. Returns the seat, or null. */
export function tvSeat(L, hh, tv, stand) {
  const set = stand ?? tv, front = stand ? L.rel(stand, 0, stand.d / 2 + 1.7) : [(L.r.x0 + L.r.x1) / 2, (L.r.z0 + L.r.z1) / 2];
  const arm = hh.vinyl ? 'armchair_vinyl' : 'armchair_fabric', chair = hh.plastic ? 'chair_plastic' : hh.income ? 'chair_wood_padded' : 'chair_wood';
  const sees = (it) => { const dx = tv.x - it.x, dz = tv.z - it.z, d = Math.hypot(dx, dz), f = L.face(it); return d >= 1 && (f[0] * dx + f[1] * dz) / d > 0.5; };
  const wallSeat = (name, facing) => { for (const it of L.wallPoses(name, 'any', { far: set, prio: 0 })) if (!facing || sees(it)) return L._commit(it, {}); return null; };
  return any(() => wallSeat(arm, true),
    () => L.free(chair, { near: front, rad: 1.5, face: set, prio: 0 }), () => L.free('stool_wood', { near: front, rad: 1.8, face: set, prio: 0 }),
    () => wallSeat('bench_wood', true), () => wallSeat(arm, false), () => wallSeat('bench_wood', false));
}
export function living(L, E, hh) {
  const rng = L.rng, area = floorArea(L), small = area < 9.5;
  const walls = L.wallsByFree();
  const tvWall = walls[0].wall;
  const stand = any(() => L.wall('tv_stand', tvWall, { at: 'center', prio: 0 }), () => L.wall('tv_stand', 'any', { at: 'center', prio: 0 }), () => L.wall('dresser_low', 'any', { prio: 0 }));
  let tv = null;
  if (stand) tv = L.top(stand, hh.tvBig ? 'tv_flat' : hh.income ? 'tv_flat' : 'tv_crt', { at: 'center' });
  const sofaNames = (small ? ['sofa_2_', 'sofa_3_'] : ['sofa_3_', 'sofa_2_']).flatMap((p) => [p + (hh.vinyl ? 'vinyl' : 'fabric')]);
  const sofaWall = stand ? opposite(stand.wallSide) : 'any';
  const sofa = any(...sofaNames.map((n) => () => L.wall(n, sofaWall, { at: 'center', prio: 0 })), ...sofaNames.map((n) => () => L.wall(n, 'any', { far: stand ?? [L.r.x0, L.r.z0], prio: 0 })));
  const seat = sofa ?? (tv ? tvSeat(L, hh, tv, stand) : null);                                    // (no sofa: the set still has a seat in front of it, or goes: R4-702)
  let coffee = null;
  if (sofa && area >= 8) coffee = L.at('coffee_table', ...L.rel(sofa, 0, sofa.d / 2 + 0.45 + 0.275), sofa.ry, { prio: 2 }) ?? L.at('side_table', ...L.rel(sofa, sofa.w / 2 + 0.3, 0.1), sofa.ry, { prio: 2 });
  if (sofa && area >= 12) {
    const an = hh.vinyl ? 'armchair_vinyl' : 'armchair_fabric';
    const side = rng.chance(0.5) ? 1 : -1;
    const adj = ['-z', '+z', '-x', '+x'].filter((w) => w !== sofa.wallSide && w !== opposite(sofa.wallSide));
    any(() => L.wall(an, adj, { near: L.rel(sofa, side * (sofa.w / 2 + 0.5), sofa.d / 2 + 0.3), nearW: 3, prio: 2 }),
      () => L.free(an, { near: coffee ?? sofa, rad: 1.8, face: coffee ?? tv ?? sofa, prio: 2 }));
  }
  if (area >= 10) {
    const unit = hh.income ? any(() => L.wall('wall_unit_big', 'any', { awayDoors: true, prio: 1 }), () => L.wall('wall_unit_small', 'any', { awayDoors: true, prio: 1 })) : any(() => L.wall('display_cabinet', 'any', { prio: 1 }), () => L.wall('dresser_low', 'any', { prio: 1 }));
    if (unit && unit.c.tags.includes('wallunit')) unit.flags = { knick: true };
  } else if (area >= 7) {
    any(() => L.wall('dresser_low', 'any', { prio: 1, awayDoors: true }), () => L.wall('bookshelf_low', 'any', { prio: 1, awayDoors: true }));
  }
  // altar in the corner of a religious home
  let altar = null;
  if (hh.altar && !small) {
    altar = L.wall('altar_home', 'any', { at: 'corner', prio: 1, awayDoors: true });
    if (altar) {
      L.top(altar, 'statue_virgin', { at: 'center' });
      L.top(altar, 'candles_set', { at: 'left' });
      L.top(altar, 'vase_flowers', { at: 'right' });
      altar.flags = { altar: true };
      religiousWall(L, E, hh, altar);
    }
  }
  if (area >= 9) any(() => L.wall('lamp_floor', 'any', { at: 'corner', near: sofa ?? undefined, prio: 2 }));
  // side table with a lamp or photos beside the sofa, a rug under the seating, plants, shoes at the street door
  if (sofa && area >= 8.5) {
    const st = any(() => L.atRel('side_table', sofa, -(sofa.w / 2 + 0.32), -0.05, 0, { prio: 2 }), () => L.atRel('side_table', sofa, sofa.w / 2 + 0.32, -0.05, 0, { prio: 2 }));
    if (st) L.top(st, rng.chance(0.6) ? 'lamp_table' : 'photo_frames', { at: 'center' });
  }
  if (sofa && area >= 8 && rng.chance(0.85)) L.free(area >= 11 && rng.chance(0.6) ? 'rug_big' : 'rug_small', { near: coffee ?? L.rel(sofa, 0, sofa.d / 2 + 0.6), rad: 0.5, ry: sofa.ry, prio: 2 });
  if (area >= 7) any(() => L.wall(rng.chance(0.5) ? 'plant_big' : 'plant_pot_clay', 'any', { at: 'corner', prio: 2 }));
  if (area >= 10 && rng.chance(0.6)) any(() => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }));
  if (rng.chance(0.5)) any(() => L.wall('plant_bucket', 'any', { at: 'corner', prio: 2 }));
  const ext = L.landings.find((l) => l.kind === 'door' && (E.bp.doors ?? []).find((d) => d.id === l.door)?.kind === 'exterior');
  if (ext) any(() => L.free('shoes_pair', { near: [ext.x, ext.z], rad: 1.8, prio: 2 }), () => L.wall('shoe_rack', 'any', { prio: 2 }));
  if (!hh.income && area >= 9 && rng.chance(0.3)) any(() => L.wall('drying_rack', 'any', { prio: 2, awayDoors: true }));
  if (hh.kids && rng.chance(0.7)) L.free('school_bag', { near: sofa ?? undefined, rad: 2.6, prio: 2 });
  if (hh.pets.includes('dog') && rng.chance(0.7)) L.free('dog_sleeping', { near: sofa ?? undefined, rad: 2.4, prio: 2 });
  if (hh.pets.includes('cat') && rng.chance(0.7)) L.free('cat_sitting', { near: sofa ?? undefined, rad: 2.4, prio: 2 });
  if (hh.pets.includes('canary')) L.hang('cage_canary', 'any', { y: 1.5 });
  // tops: radio / frames
  if (stand) { L.top(stand, 'photo_frames', { at: 'left' }); if (rng.chance(0.5)) L.top(stand, 'radio_old', { at: 'right' }); }
  if (hh.hobby === 'football') L.free('football', { rad: 3, prio: 2 });
  if (hh.hobby === 'music') L.wall('guitar_lean', 'any', { at: 'corner', prio: 2 });
  if (hh.kids) L.free('toy_pile', { rad: 3, near: coffee ?? undefined, prio: 2 });
  // wall decor
  frames(L, E, hh, 2, 'family');
  art(L, E, 'art', 'any');
  clock(L, E, 'any', {});
  if (!altar && hh.religious > 0.3) religiousWall(L, E, hh, null);
  art(L, E, 'cal', 'any');
  if (hh.hobby === 'football' && rng.chance(0.7)) art(L, E, 'sport', 'any');
  if (rng.chance(0.4)) art(L, E, 'blessing', 'any');
  if (rng.chance(0.5)) mirror(L, E, 'any', {});
  ceilingFixture(L, E, hh, 'bulb');
  if (area > 17) diningSet(L, E, hh, true);
  E.living = { sofa, seat, tv, stand, altar, coffee };
  dressWalls(L, E, hh, { type: 'living' });
  clutter(L, E, hh);
  fillMin(L, E, hh, 7);
}

// ---------------------------------------------------------------- DINING
export function diningSet(L, E, hh, annex) {
  const rng = L.rng, area = floorArea(L), longX = L.W >= L.D;
  const tname = area > 15 || annex ? rng.pick(['table_formica_6', 'table_wood_6']) : area > 9 ? 'table_formica_6' : 'table_formica_4';
  const rys = longX ? [0, PI / 2] : [PI / 2, 0];
  const cx = annex ? (longX ? L.r.x1 - L.W * 0.25 : (L.r.x0 + L.r.x1) / 2) : (L.r.x0 + L.r.x1) / 2, cz = annex ? (longX ? (L.r.z0 + L.r.z1) / 2 : L.r.z1 - L.D * 0.25) : (L.r.z0 + L.r.z1) / 2;
  const first = any(() => L.free(tname, { near: [cx, cz], rad: annex ? 2.0 : 0.9, rys, prio: 0 }), () => L.free('table_formica_4', { near: [cx, cz], rad: 1.4, rys, prio: 0 }), () => L.free('table_round_small', { near: [cx, cz], rad: 1.6, prio: 0 }));
  if (!first) return null;
  const names = hh.plastic ? ['chair_plastic'] : hh.income ? ['chair_wood_padded', 'chair_wood'] : ['chair_wood'], n = first.w > 1.2 ? 6 : 4;
  const table = seatTable(L, first, names, n, () => tablePoses(L, first.name, [cx, cz], first.name === 'table_round_small' ? [0] : rys));       // (a table whose chairs do not fit goes elsewhere, or goes: R4-304)
  if (!table) return null;
  if (rng.chance(0.6)) L.top(table, 'fruit_bowl', { at: 'center' });
  else L.top(table, 'vase_flowers', { at: 'center' });
  return table;
}
export function dining(L, E, hh) {
  const rng = L.rng;
  const table = diningSet(L, E, hh, false);
  any(() => L.wall(rng.chance(0.5) ? 'display_cabinet' : 'dresser_low', 'any', { prio: 1, awayDoors: true }));
  const side = L.find('dresser_low') ?? L.find('display_cabinet');
  if (side && side.c.size[1] < 1.2) { L.top(side, 'knickknacks', { at: 'center' }); L.top(side, 'photo_frames', { at: 'left' }); }
  art(L, E, 'art', 'any');
  clock(L, E, 'any', {});
  art(L, E, 'cal', 'any');
  if (hh.religious > 0.4) art(L, E, 'blessing', 'any');
  any(() => L.wall('plant_pot_clay', 'any', { at: 'corner', prio: 2 }));
  if (L.W * L.D > 9) any(() => L.wall('fridge_small', 'any', { prio: 2 }));
  ceilingFixture(L, E, hh, 'bulb');
  void table;
  dressWalls(L, E, hh, { type: 'dining' });
  clutter(L, E, hh, { k: 3 });
  fillMin(L, E, hh, 6);
}

// ---------------------------------------------------------------- KITCHEN
export function kitchen(L, E, hh) {
  const rng = L.rng, area = floorArea(L);
  const walls = L.wallsByFree();
  let run = [];
  for (const w of walls.slice(0, 2)) {
    const st = L.freeStretches(w.wall, 0.5)[0]; const len = st ? st.hi - st.lo : 0;
    let seq;
    if (len >= 4.4) seq = rng.pick([['fridge', 'counter_base', 'stove_gas', 'counter_base', 'sink_kitchen', 'counter_base'], ['counter_base', 'sink_kitchen', 'counter_base', 'stove_gas', 'counter_base', 'fridge']]);
    else if (len >= 3.4) seq = rng.pick([['fridge', 'counter_base', 'stove_gas', 'sink_kitchen'], ['sink_kitchen', 'counter_base', 'stove_gas', 'fridge']]);
    else if (len >= 2.5) seq = rng.pick([['stove_gas', 'counter_base', 'sink_kitchen'], ['sink_kitchen', 'stove_gas', 'counter_base']]);
    else if (len >= 1.75) seq = ['stove_gas', 'sink_kitchen'];
    else if (len >= 1.25) seq = ['stove_gas', 'sink_small'];
    else if (len >= 0.8) seq = ['stove_gas'];
    else continue;
    run = L.run(w.wall, seq, { fromEnd: rng.chance(0.5), prio: 0, skipMissing: true });
    if (run.length >= 2) break;
    for (const it of run) L.remove(it);
    run = [];
  }
  if (!run.length) {
    const st = any(() => L.wall('stove_gas', 'any', { prio: 0 }), () => null); run = st ? [st] : [];
    any(() => L.wall('sink_kitchen', 'any', { prio: 0 }), () => L.wall('counter_base', 'any', { prio: 0 }));
  }
  if (!L.find('stove_gas')) {                      // a kitchen with three doors in four square metres: let the door sweeps overlap, keep the lanes
    L.relaxKeeps();
    for (const w of L.wallsByFree()) {
      const got = L.run(w.wall, ['stove_gas', 'counter_base', 'sink_kitchen'], { fromEnd: rng.chance(0.5), prio: 0, skipMissing: true });
      if (got.some((i) => i.name === 'stove_gas')) { run = got; break; }
      for (const it of got) L.remove(it);
    }
    if (!L.find('stove_gas')) { const st = L.wall('stove_gas', 'any', { prio: 0 }); if (st) run = [st]; }
    if (!L.find('sink_kitchen')) any(() => L.wall('sink_kitchen', 'any', { prio: 0 }), () => L.wall('counter_base', 'any', { prio: 0 }));
    if (!L.find('fridge') && area >= 3.2) L.wall('fridge', 'any', { prio: 1 });
  }
  kitchenDress(L, E, hh, run);
}
/** Everything a kitchen has besides the run of stove and sink: the L-shaped second run, cylinder, things on the counters, uppers, table, bin and walls. `run`: what stands on the main wall. */
function kitchenDress(L, E, hh, run) {
  const rng = L.rng, area = floorArea(L);
  const stove = L.find('stove_gas'), sink = L.find('sink_kitchen') ?? L.find('sink_small');
  // second run (L-shape) on a free adjacent wall when there is room
  if (area >= 7) {
    const used = run[0]?.wallSide;
    const adj = used ? ['-z', '+z', '-x', '+x'].filter((w) => w !== used && w !== opposite(used)) : [];
    for (const w of adj) {
      const extra = L.run(w, [!L.find('fridge') && area >= 8 ? 'fridge' : 'counter_base', 'counter_base', 'counter_base'], { fromEnd: rng.chance(0.5), prio: 1, skipMissing: true });
      if (extra.length) break;
    }
  }
  // a tall cupboard for the dry goods in the kitchens that have the wall for it (the 'pantry' pool and the papers kept in a pantry)
  if (area >= 7.5) any(() => L.wall('pantry_cabinet', 'any', { prio: 2, awayDoors: true }));
  // gas cylinder beside the stove
  if (stove) any(() => L.wall('gas_cylinder', stove.wallSide ?? 'any', { near: stove, nearW: 6, at: 'corner', prio: 1 }), () => L.wall('gas_cylinder', 'any', { near: stove, nearW: 6, prio: 1 }));
  // things on the stove / counters
  if (stove) { L.top(stove, 'pot_stack', { at: 'left' }); if (rng.chance(0.6)) L.top(stove, 'kettle', { at: 'right' }); }
  const counters = L.items.filter((i) => i.name === 'counter_base' || i.name === 'counter_base_long');
  if (sink) L.top(sink, 'dish_rack', { at: 'left' });
  if (counters[0]) L.top(counters[0], rng.chance(0.75) ? 'thermos_set' : 'fruit_bowl', { at: 'center' });
  if (counters[1]) L.top(counters[1], rng.chance(0.5) ? 'bread_basket' : 'fruit_bowl', { at: 'center' });
  if (counters[2] && rng.chance(0.6)) L.top(counters[2], 'pot_stack', { at: 'center' });
  const fr = L.find('fridge'); if (fr) { /* magnets live on the stand-in */ fr.flags = { magnets: true }; }
  // upper cabinets over the counters, pot rack over the stove
  for (const it of [...counters, sink].filter(Boolean)) L.hang('kitchen_upper', it.wallSide ?? 'any', { over: it, y: 1.45, deepOver: false });
  if (stove && rng.chance(0.7)) L.hang('pot_rack_wall', stove.wallSide ?? 'any', { over: stove, y: 1.5 });
  // table with seats
  if (area >= 9) {
    const mid = [(L.r.x0 + L.r.x1) / 2, (L.r.z0 + L.r.z1) / 2], rys = L.W >= L.D ? [0, PI / 2] : [PI / 2, 0], names = hh.plastic ? ['chair_plastic'] : ['chair_wood', 'stool_wood'];
    const first = any(() => L.free('table_formica_4', { near: mid, rad: 1.3, rys, prio: 1 }));
    const t = first && seatTable(L, first, names, 4, () => tablePoses(L, first.name, mid, rys));
    if (t) L.top(t, rng.chance(0.5) ? 'fruit_bowl' : 'thermos_set', { at: 'center' });
  } else if (area >= 5.5) {
    const first = any(() => L.wall('table_formica_4', 'any', { prio: 2, awayDoors: true }), () => L.wall('side_table', 'any', { prio: 2 })), names = ['stool_wood', 'chair_plastic'];
    if (first) seatTable(L, first, names, 2, () => tablePoses(L, first.name, [(L.r.x0 + L.r.x1) / 2, (L.r.z0 + L.r.z1) / 2], [0, PI / 2], true));
  }
  any(() => L.wall('water_stand', 'any', { at: 'corner', prio: 2 }), () => L.wall('bucket_big', 'any', { at: 'corner', prio: 2 }));
  if (hh.income) any(() => L.wall('washing_machine', 'any', { at: 'corner', prio: 2 }));
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  if (hh.pets.includes('cat') && rng.chance(0.6)) L.free('cat_sitting', { rad: 3, prio: 2 });
  if (!(rng.chance(0.3) && art(L, E, ['chores'], 'any', { cap: 0.25 }))) art(L, E, 'cal', 'any');
  clock(L, E, 'any', {});
  if (rng.chance(0.5)) L.hang('shelf_wall', 'any', { y: 1.55 });
  if (rng.chance(0.5)) art(L, E, 'blessing', 'any');
  ceilingFixture(L, E, hh, 'tube');
  dressWalls(L, E, hh, { type: 'kitchen', max: 2 });
  fillMin(L, E, hh, 6);
}

// ---------------------------------------------------------------- BEDROOM
function bedroomRole(E, hh) {
  const st = E.state(hh), i = st.beds++;
  switch (hh.kind) {
    case 'elder': return i === 0 ? 'elder' : 'guest';
    case 'couple': return i === 0 ? 'master' : i === 1 ? 'study' : 'guest';
    case 'students': return 'student';
    default:
      if (i === 0) return 'master';
      if (hh.kids >= 1 && i === 1) return hh.kids >= 2 ? 'kids' : 'child';
      if (hh.teen && i === 2) return 'teen';
      return i % 2 ? 'guest' : 'kids';
  }
}
function placeBed(L, E, hh, names, o = {}) {
  const rng = L.rng;
  for (const n of names) {
    const b = any(
      () => L.wall(n, 'any', { at: o.at ?? 'center', sideNeed: o.sideNeed ?? 0.45, awayDoors: true, prio: 0, connAll: true }),
      () => L.wall(n, 'any', { sideNeed: 0.3, awayDoors: true, prio: 0, connAll: true }),
      () => L.wall(n, 'any', { prio: 0, connAll: true }));
    if (b) { b.flags = { unmade: rng.chance(1 - hh.tidy) }; return b; }
  }
  // a room too narrow for the bed's length: lay it along a wall (head in a corner) rather than leave the bedroom without a bed
  for (const n of names) {
    const b = any(() => L.wall(n, 'any', { along: true, sideNeed: 0.3, awayDoors: true, prio: 0, connAll: true }), () => L.wall(n, 'any', { along: true, prio: 0, connAll: true }));
    if (b) { b.flags = { unmade: rng.chance(1 - hh.tidy) }; return b; }
  }
  return null;
}
/** The sleeping places each bed gives (a crib is the baby's and comes with the master room's dressing; a mattress leaned on the wall is stood away by day). */
const PLACES = { bed_double: 2, bed_double_wood: 2, bed_bunk: 2, bed_single: 1, bed_single_metal: 1, bed_cot: 1, mattress_floor: 1 };
const placesOf = (b) => PLACES[b?.name] ?? 0;
/** The sleeping places a household needs in all: both grown-ups (one for an old man or woman alone), every child, a grandparent (the baby has a crib besides). */
export const householdPlaces = (hh) => (hh.kind === 'elder' ? 1 : 2) + (hh.kind === 'students' || hh.kind === 'couple' ? 0 : (hh.kids ?? 0)) + (hh.kind === 'family' && hh.elder ? 1 : 0);
/**
 * The sleeping places bedroom number `i` owes its household, by who lives there and how many bedrooms there are (`E.bedroomCount`): the parents (or a couple) share a double in the first, the little children
 * are together in the next (a bunk holds two), a teenager has a room of his own, a grandparent the last, and the one bedroom of a flat holds everybody. Students have a bed each. 0: the room is nobody's
 * (a study, a guest room, an old man's room) and keeps the one bed its role gives it.
 */
export function bedsOwed(E, hh, i) {
  const n = Math.max(1, E.bedroomCount ? E.bedroomCount(hh) : 1), last = n - 1;
  if (hh.kind === 'couple') return i === 0 ? 2 : 0;
  if (hh.kind === 'students') return n === 1 ? (i === 0 ? 2 : 0) : (i < 2 ? 1 : 0);
  if (hh.kind === 'elder') return 0;
  const teen = hh.teen ? 1 : 0, little = Math.max(0, (hh.kids ?? 0) - teen), grand = hh.kind === 'family' && hh.elder ? 1 : 0;
  const at = { little: Math.min(1, last), teen: Math.min(2, last), grand: n >= 4 ? 3 : n === 3 ? (teen ? 1 : 2) : last };
  return (i === 0 ? 2 : 0) + (at.little === i ? little : 0) + (at.teen === i ? teen : 0) + (at.grand === i ? grand : 0);
}
/** One more bed for a room that owes more sleeping places than its first bed gave: a bunk when two are owed (the compact way), else a single; the room's lanes stay (never the rungs that cut them), and a mattress on the floor is the last resort. Null: the room cannot hold more.
 *  `o.accept`: one more thing a pose must satisfy; `o.rng`: the stream the bed's made-or-not is drawn from (the room's own by default). */
function extraBed(L, E, hh, left, o2 = {}) {
  const names = left >= 2 ? ['bed_bunk', 'bed_single', 'bed_single_metal'] : ['bed_single', 'bed_single_metal'], windows = awayFromWindows(L), accept = o2.accept ? (it) => windows(it) && o2.accept(it) : windows;
  for (const ns of [names, ['mattress_floor']]) for (const o of [{ sideNeed: 0.3, awayDoors: true }, { awayDoors: true }, {}, { noClear: true }]) for (const along of [false, true]) for (const n of ns) {
    const b = wallWhere(L, n, { prio: 0, connAll: true, ...o, along }, accept);
    if (b) { if (o.noClear) b.zones = []; b.flags = { unmade: (o2.rng ?? L.rng).chance(1 - hh.tidy) }; return b; }
  }
  return null;
}
/** The first valid wall pose of `name` that `accept` takes, placed (`L.wall` takes the first valid one, whatever it stands in front of). */
function wallWhere(L, name, o, accept) {
  for (const it of L.wallPoses(name, 'any', o)) { if (!accept(it)) continue; L._commit(it, o); return it; }
  return null;
}
/** A bed that stood under a window would shorten its curtain (the barrio's cloth must stay floor-length on at least half of its folds: interiors-curtains.test.mjs): the extra beds keep off the windows. */
const awayFromWindows = (L) => (it) => !L._windowHit(it.ob, 99);
/**
 * The greedy order (the first bed on the best wall, the next on what is left) can shut out a bed that the room does hold: the first bed across the middle of a 9 m2 room with a door in each of two
 * facing walls leaves neither half a second bed, and no double fits in a half at all, but two singles along the walls do. Search the beds all at once instead (solveFixtures, as `repackBedroom` does
 * for one): a double for the parents (two singles when no double fits), a bunk for every pair of children, a single for the odd one; the richest list first, each shorter than the last, and the first
 * that places every bed and gives more places than the greedy answer wins. The room holds only the greedy beds now. Returns the beds placed (null, the room as it was, when no list gives more than `have`).
 */
function* repackBedsSteps(L, hh, owed, parents, have) {
  const o = { awayDoors: true, alongToo: true, connAll: true }, accept = awayFromWindows(L);
  const NAMES = { double: hh.income ? ['bed_double_wood', 'bed_double'] : ['bed_double', 'bed_double_wood'], bunk: ['bed_bunk'], single: hh.income ? ['bed_single'] : ['bed_single_metal', 'bed_single'] };
  const rest = owed - (parents ? 2 : 0), tail = [...Array(Math.floor(rest / 2)).fill('bunk'), ...(rest % 2 ? ['single'] : [])], lists = [];
  if (parents) {
    for (let n = tail.length; n >= 0; n--) lists.push(['double', ...tail.slice(0, n)]);
    for (let n = tail.length; n >= 0; n--) lists.push(['single', 'single', ...tail.slice(0, n)]);
  } else {
    for (let n = tail.length; n >= 1; n--) lists.push(tail.slice(0, n));
    if (rest === 2) lists.push(['single', 'single']);                                                  // two sleepers: a bunk, or a bed each
  }
  const places = (l) => l.reduce((s, k) => s + (k === 'single' ? 1 : 2), 0);
  const twin = (l) => (l.filter((k) => k === 'single').length >= 2 ? 1 : 0);                             // (two singles in the place of a double, or beside the children's)
  lists.sort((x, y) => places(y) - places(x) || twin(x) - twin(y));                                         // (a stable sort: the double before two singles, a bunk before two singles: it is the compact way)
  const snap = L.snapshot();
  for (const list of lists) {
    if (places(list) <= have) continue;
    L.clear();
    const got = yield* solveFixturesSteps(L, list.map((k, n) => slot(NAMES[k], n || k === 'bunk' ? { ...o, accept } : o)), { maxRung: 3, budget: 60, fan: 5 });      // (the first bed stands where it always stood; the others, and any bunk, keep off the windows: a bunk is 1.75 m high and would hide one)
    if (got) { for (const b of got) b.flags = { unmade: L.rng.chance(1 - hh.tidy) }; return got; }
  }
  L.restore(snap);
  return null;
}
export function bedroom(L, E, hh) { drain(bedroomSteps(L, E, hh)); }
bedroom.steps = bedroomSteps;                                  // (index.js `furnishSteps` runs the furnisher as a resumable job when it has one)
/** The furnisher of a bedroom as a resumable job: it yields between its phases and every `SOLVE_SLICE` poses of the bed search (the 4 beds a 6 m2 room is owed are a search of 100 000 poses and more); `bedroom` is it run to its end. */
function* bedroomSteps(L, E, hh) {
  const rng = L.rng, area = floorArea(L), i = E.state(hh).beds, role = E.roleOverride ?? bedroomRole(E, hh);
  E.lastRole = role; L.role = role;
  const owed = bedsOwed(E, hh, i);
  let beds = [];
  const single = hh.income ? ['bed_single'] : ['bed_single_metal', 'bed_single'];
  switch (role) {
    case 'master': beds = [placeBed(L, E, hh, hh.income ? ['bed_double_wood', 'bed_double'] : ['bed_double', 'bed_double_wood'])]; break;     // (a couple's bed is a double, however small the room: no double that fits gives the single of the fallback below, and the second single comes with the extra beds)
    case 'elder': beds = [placeBed(L, E, hh, rng.chance(0.5) ? ['bed_single_metal', 'bed_single'] : ['bed_double', 'bed_single'])]; break;
    case 'kids': beds = [placeBed(L, E, hh, owed === 1 ? single : ['bed_bunk', 'bed_single'])]; break;
    case 'student': {
      if (owed >= 2) { beds = [placeBed(L, E, hh, ['bed_bunk', 'bed_single_metal', 'bed_single'])]; break; }      // two students in one room: a bunk (it leaves the walls the desk and the wardrobe want)
      const a = placeBed(L, E, hh, ['bed_single_metal', 'bed_single']); beds = [a];
      if (!owed && area >= 8 && rng.chance(0.7)) beds.push(placeBed(L, E, hh, ['bed_single', 'mattress_floor'], { sideNeed: 0.2 }));
      break;
    }
    case 'study': beds = [placeBed(L, E, hh, ['bed_single', 'bed_cot'], { sideNeed: 0.3 })]; break;        // a study with a guest bed: every bedroom has a real one
    case 'storage': beds = [placeBed(L, E, hh, ['bed_single_metal', 'bed_single'], { sideNeed: 0.2 })]; break;
    default: beds = [placeBed(L, E, hh, single)];
  }
  beds = beds.filter(Boolean);
  if (!beds.length) {                                           // the plan left no room for the bed this role wants: any bed beats an empty bedroom
    const small = ['bed_single', 'bed_single_metal', 'mattress_floor'];
    let b = placeBed(L, E, hh, small, { sideNeed: 0.2 });
    if (!b && L.relaxKeeps()) b = placeBed(L, E, hh, small, { sideNeed: 0.2 });
    if (!b) b = any(() => L.wall('mattress_leaning', 'any', { prio: 1 }), () => L.wall('mattress_leaning', 'any', { prio: 1, noClear: true }), () => L.wall('mattress_leaning', 'any', { prio: 1, noClear: true, keepLateral: 0.05 }));
    if (b) beds = [b];
  }
  const first = beds.slice(), have = first.reduce((s, x) => s + placesOf(x), 0), parents = i === 0 && hh.kind !== 'students' && hh.kind !== 'elder';
  if (owed <= have || first[0]?.name === 'mattress_leaning') { L.sleeps = have; L.owed = owed; bedroomDress(L, E, hh, role, first[0]); return; }
  // The household owes more places than the first bed gives. Dress the room as it is first (the one to beat), then try one bed more, two more ... as many as the household owes, the most first:
  // a bed set stays only if the room still keeps its clothes (and a study room its desk) as well as it did, after the healing it will get (a wardrobe walled in a bed and healing took it out
  // again: 4 bedrooms of the barrio were left with no storage, 2 pegs-only that had a wall for a trunk, 4 study rooms with no desk, 20 wardrobes - and a tenth of the hung clothes - gone).
  const base = grab(L);
  bedroomDress(L, E, hh, role, first[0]);
  const lean = bedroomKeeps(L, role), leanState = grab(L);
  yield 'bed';
  for (let target = owed; target > have; target--) {
    put(L, base);
    const bs = first.slice();
    yield* fillBedsSteps(L, E, hh, bs, target, parents);
    if (bs.length === first.length && bs.every((x, k) => x === first[k])) break;                  // nothing more fits at this size, so nothing more fits at a smaller one
    yield 'bed';
    bedroomDress(L, E, hh, role, bs[0]);
    yield 'bed';
    const keeps = bedroomKeeps(L, role);
    if (keeps >= lean) { L.owed = owed; return; }                                                  // (fillBeds left L.sleeps: the places the room holds)
    yield 'bed';
  }
  put(L, leanState); L.sleeps = have; L.owed = owed;
}
const STUDY_ROLES = new Set(['teen', 'student', 'study', 'child']);
/** A copy of the room's state that `restore` can put back after more than `snapshot` holds: healing and dressing edit the item list and the wall slots in place. */
function grab(L) {
  const s = L.snapshot();
  return { ...s, items: [...s.items], decor: Object.fromEntries(WALLS.map((w) => [w, [...s.decor[w]]])) };
}
/** The room put back as `grab` saw it (a copy of the copy, so the same state can be put back again). */
function put(L, s) { L.restore({ ...s, items: [...s.items], decor: Object.fromEntries(WALLS.map((w) => [w, [...s.decor[w]]])) }); }
/** The beds and seats of `list` that nobody can walk up to (layout.js `_accessOk`, asked with the one flood of the room that every piece but a stove reads) and the seats that would get no sit anchor:
 *  index.js `emitAnchors` looks for floor of the doors' region within the piece's radius of each seat point (`seatOffsets`, `seatZoff` back from the middle), with the 0.34 m body's flood, which
 *  `_accessOk`'s look from the middle of the piece misses by the width of a cushion (the sofa of L39.f1.r5 had a bed at one end of its front strip, a toy pile at the other, and no sitter). */
function shutAmong(L, list) {
  const c = L.connectivity();
  let c34 = null;
  const f34 = () => (c34 ??= L.connectivity(0.34)), fl = { f40: () => c, f34 };
  const noAnchor = (i) => { const cells = Math.ceil((Math.hypot(i.w, i.d) / 2 + 0.8) / 0.1), zoff = seatZoff(i.c); return !seatOffsets(i.c).some((ox) => { const [sx, sz] = L.rel(i, ox, zoff); return L.inMainRegion(sx, sz, f34(), cells); }); };
  return list.filter((i) => i.floor && L._needsAccess(i) && (!L._accessOk(i, true, c, fl) || (i.c.seat && noAnchor(i))));
}
const shutIn = (L) => shutAmong(L, L.items).length;
/** What healing would take out of the room as it stands (the room is put back exactly as it was). */
function healTrial(L) {
  const saved = grab(L), removed = L.heal();
  put(L, saved);
  return removed;
}
/** How well a dressed bedroom keeps what the census tests hold every bedroom to, once healing has had its say: somewhere to keep clothes (a wardrobe, whose rail carries the household's hung
 *  clothes: 3; a dresser or trunk: 2; pegs only: 1) and, in a study room of 8 m2 or more, its desk (1). 4 is the whole of it. */
function bedroomKeeps(L, role) {
  const gone = new Set(healTrial(L)), has = (re) => L.items.some((i) => !gone.has(i) && re.test(i.name));
  return (has(/^wardrobe/) ? 3 : has(/^(dresser|chest_trunk)/) ? 2 : has(/^coat_rack/) ? 1 : 0) + (!STUDY_ROLES.has(role) || floorArea(L) < 8 || has(/^desk_/) ? 1 : 0);
}
/**
 * The household sleeps here: after the room's first bed (or beds) is down, a bed for each person owed one as the room's free walls allow, one by one and then the whole-room search. `beds` is
 * the list of beds the room has (extended or replaced in place); `parents`: the first two places are a couple's. Returns the places the room holds now (a mattress leaned on the wall
 * means the room is too tight for more); `L.owed` and `L.sleeps` keep what the household owed it and what it holds (the bed census reads both).
 */
export function fillBeds(L, E, hh, beds, owed, parents) { return drain(fillBedsSteps(L, E, hh, beds, owed, parents)); }
/** `fillBeds` as a resumable job: it yields after each bed laid one by one and, in the whole-room search, every `SOLVE_SLICE` poses. */
function* fillBedsSteps(L, E, hh, beds, owed, parents) {
  let places = beds.reduce((s, b) => s + placesOf(b), 0);
  if (beds[0]?.name !== 'mattress_leaning') {
    for (let k = 0; places < owed && k < 4; k++) {
      const b = extraBed(L, E, hh, owed - places);
      yield 'bed';
      if (!b) break;
      beds.push(b); places += placesOf(b);
    }
    if (places < owed && owed >= 2) {
      const got = yield* repackBedsSteps(L, hh, owed, parents, places);
      if (got) { beds.splice(0, beds.length, ...got); places = beds.reduce((s, b) => s + placesOf(b), 0); }
    }
  }
  L.sleeps = places; L.owed = owed;
  return places;
}

// ---------------------------------------------------------------- A CHILD'S PLACE IN EVERY HOME WITH CHILDREN (R4-705)
/** What a child sleeps on: a bunk, a single, a mattress laid down or stood on its edge (a cot is a camp bed of adult length, a guest's: garments.js; a crib is the baby's, so it is enough for a home whose one child is the baby). */
const CHILD_BED = /^(bed_(bunk|single|single_metal)|mattress_)/;
const NOT_HOMES = new Set(['chapel', 'school', 'clinic', 'hall', 'unfinished']);                  // (a house still in concrete is its own story: R4-709)
/** A pose that leaves no dead-end lane behind it that the room did not have (layout.js `seriousPockets`: the pockets were cured when the room was done, and a bed set down since must not make a new one). */
function noNewPocket(L) {
  const before = L.seriousPockets().length;
  return (it) => { L.items.push(it); try { return L.seriousPockets().length <= before; } finally { L.items.pop(); } };
}
const hasChildBed = (rooms, hh) => rooms.some((b) => b.L.items.some((i) => i.floor && (CHILD_BED.test(i.name) || (i.name === 'bed_crib' && hh.kids === 1))));
/** For each piece of the room that opens (carcass.js `layoutOf`), how many of its fronts a person can stand in front of: the rule containers.js `registerFronts` holds every front to (R4-118: a front
 *  nobody can stand at is decoration, with no prompt and no contents), asked of the room as it stands (reach.js `spotsAt`). */
function reachOf(L) {
  const out = new Map();
  if (!L.items.some((it) => layoutOf(it.c))) return out;
  const conn = L.connectivity();
  for (const it of L.items) {
    const lay = layoutOf(it.c); if (!lay) continue;
    const rec = { id: it.id, kind: it.ceil ? 'ceil' : it.top ? 'top' : it.wall ? 'wall' : 'floor', x: it.x, y: it.y ?? 0, z: it.z, ry: it.ry, h: it.h };
    out.set(it, lay.slots.filter((s) => spotsAt(L, rec, s, conn).length).length);
  }
  return out;
}
/** Does every piece in `before` (`reachOf`) keep as many reachable fronts as it had? A piece that is gone has not, unless `gone` names its kind (a show cabinet given up for a bed on purpose): one of
 *  those that is still there with a front nobody can stand at (the bed stands before it) is taken out too, not left as decoration. */
function reachKept(L, before, gone = null) {
  const now = reachOf(L);
  for (const [it, n] of before) {
    if (!n) continue;
    const m = now.get(it);
    if (m !== undefined && m >= n) continue;
    if (!gone?.test(it.name)) return false;
    if (m !== undefined) L.remove(it);
  }
  return true;
}
/** What the room seats as it stands: each table people eat at, with the seats it has up to two (R4-704). A bed set down late takes none away: a chair that comes back into the lane the bed left it
 *  no longer fits there (`softened` drops it), and a table with one chair is half a set. (A TV's seat is not asked after: `living` and `tvSeat` set it at priority 0, and `softened` takes only 2 or more.) */
const seatingOf = (L) => L.items.filter((i) => i.floor && !i.parent && EATING_TABLE.test(i.name)).map((t) => [t, Math.min(2, seatsAt(L, t).length)]);
const seatingKept = (L, was) => was.every(([t, n]) => L.items.includes(t) && seatsAt(L, t).length >= n);
const LIVING_UNIT = /^(display_cabinet|bookshelf_low|dresser_low|wall_unit_(big|small))$/;       // (what a living room keeps against a wall for show: a child's bed is worth more)
/**
 * `place(accept, rng)` sets one bed down late: on the floor the room has, else with its decoration out of the way (`softened`: what stood where the bed does is gone, the rest goes back; what opens
 * stays: a wardrobe, a dresser, a nightstand is somewhere to keep things), and in a living room (`unit`) else with its cabinet or shelf out too. It stays only if the room is as walkable as it was
 * (no new dead-end lane, no bed or seat shut in, not cut in two), every piece that opens can be opened from as many fronts as before (a bed across a dresser's front makes its drawers decoration), and
 * every table keeps its two seats (`seatingOf`). Null, and the room exactly as it was, when no way gives such a pose.
 */
function settle(L, place, unit = false) {
  const was = { pockets: L.seriousPockets().length, shut: shutIn(L), whole: L.connectivity().ok, reach: reachOf(L), seats: seatingOf(L) }, snap = grab(L);
  const opens = L.items.filter((i) => was.reach.has(i));
  for (const level of unit ? [0, 1, 2] : [0, 1]) {
    const run = () => place(noNewPocket(L), L.rng.fork('kidsbed'));
    const it = level === 0 ? run() : softened(L, level === 2 ? opens.filter((i) => !LIVING_UNIT.test(i.name)) : opens, run, level === 2 ? LIVING_UNIT : null);
    if (it && reachKept(L, was.reach, level === 2 ? LIVING_UNIT : null) && seatingKept(L, was.seats) && L.seriousPockets().length <= was.pockets && shutIn(L) <= was.shut && (!was.whole || L.connectivity().ok)) return it;
    put(L, snap);
  }
  return null;
}
/**
 * Every home with children has a place for them to sleep. A bedroom of 5 m2 holds the parents' double and nothing else once its chest or wardrobe is in (round 6 kept the clothes before a second bed:
 * `bedroomSteps`), so 123 of the barrio's 193 households with children had no child's bed: 89 owned a bedroom with only the parents' double in it, 34 owned none (R4-705: the toy piles and school bags
 * stood beside a double bed; 41 of the 173 buildings with beds or such signs had two of them and no child's bed). After every room is furnished (the lanes it must keep are known) such a household gets a
 * bunk when two children are owed, else a single, one more of each while a child is still without: in a bedroom of its own if one has the room, else in its living room (one bed there: the kids of a
 * one-bedroom home sleep in the sala). The beds take only floor that `valid` gives: the door lanes, the beds-reach rule (73aa137: a bed somebody can walk up to, nothing shutting one in), the window rule
 * and no new dead-end lane. Where no bed fits, a mattress stood on its edge is the child's (the same one `ensureSleep` leans in a bedroom the plan left no bed for: it is put away by day), and a baby
 * who is the home's one child gets its crib first. 132 of the 193 now have a child's place: 82 a bunk, a single or a crib, 50 a mattress on its edge (the 2.0 m bedroom of a rowhouse's tenant holds
 * nothing else beside the double). 61 are still without: 19 live in a chapel, school, clinic, hall or a house still in concrete (`NOT_HOMES`, R4-709), 13 own a shop, kiosk or landing and no room to
 * sleep in, and 29 are homes where no pose passes the rules (a bed that takes a front from a piece that opens, a seat from a table or a lane from a sofa is no pose): 16 with the 2.0 m bedroom of a
 * rowhouse's tenant, 13 with another single room of 2.0 to 4.2 m or a living room of 2.3 to 3.3 m. `built`: [{ room, hh, L }] of the whole building. Returns the beds set down.
 */
export function ensureKidsBeds(built, E) { return drain(ensureKidsBedsSteps(built, E)); }
/** `ensureKidsBeds` as a resumable job: it yields after each bed it tries to set (a `settle` is three searches of a room: 12 758 poses for the household of L40 in one step, over the 12 000 that
 *  interiors-stepcost.test.mjs holds a step to), index.js `furnishSteps`. */
export function* ensureKidsBedsSteps(built, E) {
  const out = [];
  if (NOT_HOMES.has(E.bp?.lot?.kind ?? E.lot?.kind)) return out;
  const homes = new Map();
  for (const b of built) if (!b.L.room.outdoor) { const l = homes.get(b.hh); if (l) l.push(b); else homes.set(b.hh, [b]); }
  for (const [hh, rooms] of homes) {
    if (!(hh.kids >= 1) || hasChildBed(rooms, hh)) continue;
    const roomy = (type) => rooms.filter((b) => b.room.type === type && b.L.W >= 0.9 && b.L.D >= 0.9);
    const bedrooms = roomy('bedroom'), livings = roomy('living').sort((a, b) => b.L.W * b.L.D - a.L.W * a.L.D);
    if (!bedrooms.length && !livings.length) continue;                                        // not a home: the shop of an occupant who lives elsewhere
    const has = () => out.some((o) => o.hh === hh.id), rest = [...bedrooms, ...livings];
    /** One small piece (the baby's crib, a mattress stood away by day) in the first room that takes it. */
    const little = function* (name) {
      for (const b of rest) {
        const m = settle(b.L, (accept) => wallWhere(b.L, name, { prio: 1, awayDoors: name === 'bed_crib' }, accept) ?? wallWhere(b.L, name, { prio: 1, noClear: true }, accept), livings.includes(b));
        yield 'kidsbed';
        if (m) { m.flags = { unmade: false }; out.push({ hh: hh.id, room: b.room.id, bed: m }); return; }
      }
    };
    if (hh.kids === 1 && hh.babies) yield* little('bed_crib');                                // (a home whose one child is the baby: its crib needs the least floor)
    let need = Math.min(hh.kids, 3);
    if (!has()) for (const pool of [bedrooms, livings]) for (const b of pool) {
      for (let k = 0; need > 0 && k < (pool === bedrooms ? 3 : 1); k++) {
        const bed = settle(b.L, (accept, rng) => extraBed(b.L, E, hh, need, { accept, rng }), pool === livings);
        yield 'kidsbed';
        if (!bed) break;
        out.push({ hh: hh.id, room: b.room.id, bed });
        if (b.room.type === 'bedroom') b.L.sleeps = (b.L.sleeps ?? 0) + placesOf(bed);
        need -= placesOf(bed);
      }
    }
    if (!has()) yield* little('mattress_leaning');                                            // (nothing larger fits anywhere)
  }
  return out;
}
/** A dresser's drawers are used standing 0.55 m from the front with a body's 0.3 m of free floor round the feet: 0.85 m, not the 0.6 m the catalogue keeps clear. The zone also stops other pieces
 *  from taking that floor afterwards. The bedroom of a flat (3.16 x 2.87 m) with a double bed along its long wall left 0.69 m to a dresser whose four drawers then had no place to stand
 *  (R4-118: a front nobody can stand in front of is decoration; 44 of the barrio's drawers were). */
const DRESSER_FRONT = { ...CATALOG.dresser_4, clear: [0.9, 0, 0] };
/** Can a person stand at the front of this piece, in the part of the room a door leads to? The test of reach.js `standSpots` (the same spots, the same `standable`) without the sight line: the
 *  floor in front of a piece can be free and still be a closed pocket between the piece, a bed and a door's sweep. */
export function frontStand(L, it, conn = L.connectivity()) {
  const zf = it.d / 2;
  for (const d of [1.0, 0.85, 0.7, 0.55]) for (const s of [0, -0.25, 0.25]) {
    const [x, z] = L.rel(it, s, zf + d);
    if (L.standable(x, z, conn, 0.3)) return true;
  }
  return false;
}
/** A dresser (a wall pose with 0.9 m of floor in front of it) whose drawers a person can stand at: the first pose the wall gives, else the next that does (null when no pose does). */
export function dresserAt(L) {
  const o = { prio: 2, awayDoors: true, def: DRESSER_FRONT };
  const d = L.wall('dresser_4', 'any', o);
  if (!d || frontStand(L, d)) return d;
  L.remove(d);
  for (const p of L.wallPoses('dresser_4', 'any', o)) {
    L._commit(p, o);
    if (frontStand(L, p)) return p;
    L.remove(p);
  }
  return null;
}
const KEEPS = /^(wardrobe|dresser|chest_trunk|coat_rack)/;
/** A bedroom too small or too crowded for a wardrobe still has somewhere to keep clothes: a trunk, else a metal wardrobe, else a trunk with its 0.5 m front zone waived (a lid opens upward, and the
 *  room is still never cut in two: a 6 to 9 m2 room with a bed and two doors often has a free wall for it and no 0.5 m in front), else pegs and a shelf on the wall (no bedroom of the barrio is
 *  bare of storage). Does nothing in a room that keeps clothes already. */
function storageFallback(L) {
  const keeps = () => L.items.some((i) => KEEPS.test(i.name));
  if (!keeps()) any(() => L.wall('chest_trunk', 'any', { prio: 1, awayDoors: true }), () => L.wall('chest_trunk', 'any', { prio: 1 }), () => L.wall('wardrobe_metal', 'any', { prio: 1 }),
    () => L.wall('chest_trunk', 'any', { prio: 1, noClear: true, awayDoors: true }));
  if (!keeps()) { L.hang('coat_rack_wall', 'any', { y: 1.6 }); L.hang('shelf_wall', 'any', { y: 1.5 }); }
  return keeps();
}
/** After heal(): a bedroom whose wardrobe, dresser or trunk the healing took out (a piece that cut the room, or walled a bed in) is left with nowhere to keep clothes: the fallback of the dressing
 *  runs again on the room as it is now. A furnished bedroom only; true when the room keeps clothes (before or after). */
export function ensureStorage(L, E, hh) {
  if (L.room.type !== 'bedroom' || !L.role || L.W < 0.9 || L.D < 0.9) return true;
  return storageFallback(L);
}
/** Everything a bedroom has besides its bed: nightstands and lamps, storage, the study corner, a rug, wall decor, clutter. */
function bedroomDress(L, E, hh, role, bed) {
  const rng = L.rng, area = floorArea(L);
  // nightstands, lamp, crib
  if (bed && area >= 6) {
    const ns = hh.income ? 'nightstand_b' : 'nightstand_a';
    const ln = L.atRel(ns, bed, -(bed.w / 2 + 0.22), -(bed.d / 2) + 0.2, 0, { prio: 2 });
    const rn = bed.w > 1.2 ? L.atRel(ns, bed, bed.w / 2 + 0.22, -(bed.d / 2) + 0.2, 0, { prio: 2 }) : null;
    for (const n of [ln, rn].filter(Boolean)) { n.attach = bed; if (rng.chance(0.7)) L.top(n, 'lamp_table', { at: 'center' }); else L.top(n, 'photo_frames', { at: 'center' }); }
    if (ln && !L.items.some((i) => i.parent === ln)) L.top(ln, 'radio_old', { at: 'center' });
  }
  if ((role === 'master') && hh.babies) any(() => L.wall('bed_crib', 'any', { prio: 1, awayDoors: true }));
  // study corner: the desk comes before the storage (the wardrobe and the dresser take the walls that are left: a student's room without its desk is no student's room)
  const study = role === 'teen' || role === 'student' || role === 'study' || role === 'child';
  if (study) {
    const desk = any(() => L.wall(role === 'study' ? 'desk_wood' : 'desk_student', 'any', { at: 'window', prio: 1, awayDoors: true }), () => L.wall('desk_student', 'any', { prio: 1 }));
    if (desk) {
      const ch = L.at(hh.plastic ? 'chair_plastic' : 'chair_wood', ...L.rel(desk, KNEEHOLE, desk.d / 2 + 0.3), desk.ry + PI, { prio: 2, tuck: desk }) ?? L.free('chair_wood', { near: L.rel(desk, KNEEHOLE, desk.d / 2 + 0.3), rad: 0.5, prio: 2, tuck: desk });
      if (ch) ch.flags = { pulled: true };
      L.top(desk, role === 'student' ? 'pc_set' : 'books_stack', { at: 'left' });
      if (role !== 'student') L.top(desk, 'lamp_table', { at: 'right' });
      D(L, 'exam_notes', desk.wallSide, { near: [desk.x, desk.z], nearW: 3, y: 1.15, jitter: 0.1 });
      desk.flags = { study: true };
    }
  }
  // storage
  if (area >= 6.5 || role === 'student') {
    const wn = area >= 10 && role === 'master' ? 'wardrobe_3' : 'wardrobe_2';
    any(() => L.wall(wn, 'any', { at: 'corner', prio: 1, awayDoors: true }), () => L.wall('wardrobe_2', 'any', { prio: 1, awayDoors: true }), () => L.wall('wardrobe_metal', 'any', { prio: 1 }));
  }
  if (area >= 8.5) dresserAt(L);
  if (study && area >= 8) L.wall('bookshelf', 'any', { prio: 2 });
  // It comes after the study corner: a child's desk is worth more than a trunk, and a trunk placed first took the desk's wall in the small study rooms (the barrio lost most of its study desks).
  storageFallback(L);
  if (role === 'kids' || role === 'child') { L.free('toy_pile', { rad: 3, prio: 2 }); if (rng.chance(0.7)) L.free('school_bag', { rad: 3, prio: 2 }); art(L, E, 'kids', 'any'); if (rng.chance(0.6)) art(L, E, 'kids', 'any'); }
  if (role === 'teen' || role === 'student') { if (hh.hobby === 'football' || rng.chance(0.4)) art(L, E, 'sport', 'any'); else art(L, E, 'music', 'any'); if (hh.hobby === 'music') L.wall('guitar_lean', 'any', { at: 'corner', prio: 2 }); }
  if (role === 'elder' && hh.altar) {
    const altar = L.wall('altar_home', 'any', { at: 'corner', prio: 1 });
    if (altar) { L.top(altar, 'statue_virgin', { at: 'center' }); L.top(altar, 'candles_set', { at: 'left' }); altar.flags = { altar: true }; religiousWall(L, E, hh, altar); }
    L.free('rocking_chair', { rad: 2.5, prio: 2 });
  }
  // rug beside the bed
  if (bed && area >= 9 && rng.chance(0.6)) L.free('rug_small', { near: L.rel(bed, bed.w / 2 + 0.5, bed.d / 4), rad: 0.4, ry: bed.ry, prio: 2 });
  // wall decor
  if (bed) {
    if (hh.religious > 0.35) L.hang('crucifix_wall', bed.wallSide, { over: bed, y: 1.75 });
    else if (rng.chance(0.6)) art(L, E, 'art', bed.wallSide, { over: bed, y: 1.4 });
  }
  if (rng.chance(0.6)) frames(L, E, hh, 1, 'family');
  if (rng.chance(0.5)) mirror(L, E, 'any', {});
  if (role !== 'storage') clock(L, E, 'any', {});
  L.free('shoes_pair', { rad: 3, prio: 2 });
  if (rng.chance(0.4) && !L.find('chest_trunk')) any(() => L.wall('chest_trunk', 'any', { prio: 2 }));       // (one trunk to a room: the last resort above may have put it already)
  if (area >= 6 && rng.chance(0.7)) any(() => L.wall(rng.chance(0.5) ? 'plant_pot_clay' : 'plant_big', 'any', { at: 'corner', prio: 2 }));
  ceilingFixture(L, E, hh, 'bulb');
  dressWalls(L, E, hh, { type: 'bedroom' });
  clutter(L, E, hh, { k: 3 });
  fillMin(L, E, hh, 6);
}

// ---------------------------------------------------------------- BATHROOM
export function bathroom(L, E, hh) {
  const rng = L.rng;
  const shower = any(() => L.wall('shower_tray', 'any', { at: 'corner', awayDoors: true, prio: 0 }), () => L.wall('shower_small', 'any', { at: 'corner', awayDoors: true, prio: 0 }),
    () => L.wall('shower_tray', 'any', { prio: 0 }), () => L.wall('shower_small', 'any', { prio: 0 }));
  const toilet = any(() => L.wall('toilet', shower ? [opposite(shower.wallSide), ...['-z', '+z', '-x', '+x'].filter((w) => w !== shower.wallSide && w !== opposite(shower.wallSide))] : 'any', { at: 'center', prio: 0, awayDoors: true }), () => L.wall('toilet', 'any', { prio: 0 }));
  const basin = any(() => L.wall(hh.income ? 'basin_vanity' : 'basin_pedestal', 'any', { prio: 0, near: toilet ?? undefined, nearW: 0.6 }), () => L.wall('basin_pedestal', 'any', { prio: 0 }));
  bathroomDress(L, E, hh, shower, basin);
}
/** What a bathroom has besides its three fixtures: the shower head, mirror and towel rail, bin, bucket, shelf and bulb. */
function bathroomDress(L, E, hh, shower, basin) {
  if (shower) L.hang('shower_head_electric', shower.wallSide, { near: [shower.x, shower.z], nearW: 8, y: 1.9, w: 0.2, h: 0.25 });
  if (basin) L.hang('mirror_bath', basin.wallSide, { over: basin, y: 1.25 });
  if (basin) L.hang('towel_rail', 'any', { near: [basin.x, basin.z], nearW: 1, y: 1.15 });
  L.wall('trash_bin', 'any', { at: 'corner', prio: 2 });
  if (!hh.income) any(() => L.wall('bucket_big', 'any', { at: 'corner', prio: 2 }));
  L.hang('shelf_wall', 'any', { y: 1.5, w: 0.5 });
  ceilingFixture(L, E, hh, 'bulb');
  fillMin(L, E, hh, 5);
}

// ---------------------------------------------------------------- CIRCULATION (hall, corridor, entry, stairwell, landing)
/** A strip too narrow to stand furniture in (< 0.9 m): wall-hung things only, so it still reads as a kitchen / stockroom / bath. */
export function thin(L, E, hh) {
  const t = L.room.type, cx = (L.r.x0 + L.r.x1) / 2, cz = (L.r.z0 + L.r.z1) / 2;
  L.circulation = true;
  const long = L.W >= L.D ? ['-z', '+z'] : ['-x', '+x'];
  const hangs = t === 'kitchen' ? ['kitchen_upper', 'kitchen_upper', 'pot_rack_wall', 'shelf_wall', 'clock_wall']
    : t === 'bathroom' ? ['mirror_bath', 'towel_rail', 'shelf_wall']
      : t === 'backroom' || t === 'office' ? ['shelf_wall', 'shelf_wall', 'tool_pegboard', 'clock_wall']
        : ['shelf_wall', 'coat_rack_wall', 'clock_wall', 'mirror_wall'];
  const put = (n, walls, o = {}) => (n === 'clock_wall' ? clock(L, E, walls, o) : n === 'mirror_wall' ? mirror(L, E, walls, o) : L.hang(n, walls, o));
  for (const n of hangs) { put(n, long) || put(n, 'any'); }
  for (const n of hangs.slice(0, 2)) put(n, 'any', { y: (CATALOG[n]?.y ?? 1.4) - 0.5 });          // a second row where the wall is long enough
  if (t !== 'bathroom') {
    art(L, E, t === 'kitchen' ? 'cal' : 'blessing', 'any');
    if (L.rng.chance(0.6)) notice(L, E, 'any'); else art(L, E, 'cal', 'any');
  }
  if (!L.room.outdoor) { L.ceil('bulb_bare', cx, cz); L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffd9a0, i: 5, d: 5 }; }
}

/** Rooms A2 keeps empty (stair cores): a bulb, a notice or two, nothing on the floor. */
export function lightOnly(L, E, hh) {
  L.circulation = true;
  const [cx, cz] = L.sw?.lamp ?? [(L.r.x0 + L.r.x1) / 2, (L.r.z0 + L.r.z1) / 2];           // a stair core's lamp hangs over its landing, not over the divider between the lanes
  if (!L.room.outdoor) { L.ceil('bulb_bare', cx, cz); L.fixture = { x: cx, z: cz, kind: 'bulb', color: 0xffd9a0, i: 5.5, d: 6 }; }
  notice(L, E, 'any'); if (L.rng.chance(0.5)) art(L, E, 'faithPic', 'any'); if (L.rng.chance(0.35)) art(L, E, 'sport', 'any');
}

export function circulation(L, E, hh) {
  L.circulation = true;
  const rng = L.rng, t = L.room.type, area = floorArea(L);
  const exterior = L.landings.some((l) => (E.bp.doors ?? []).find((d) => d.id === l.door)?.kind === 'exterior');
  if (t === 'stairwell' || t === 'landing') {
    if (rng.chance(0.6)) { const k = rng.int(0, 3); if (k === 0) art(L, E, 'faithPic', 'any'); else if (k === 1) art(L, E, 'art', 'any'); else if (k === 2) notice(L, E, 'any'); else art(L, E, 'cal', 'any'); }
    clock(L, E, 'any', {});
    if (area > 3) any(() => L.wall('plant_bucket', 'any', { at: 'corner', prio: 2 }));
    ceilingFixture(L, E, hh, rng.chance(0.5) ? 'tube' : 'bulb');
    return;
  }
  if (area >= 3) {
    any(() => L.wall('shoe_rack', 'any', { at: 'awayDoor', prio: 2 }), () => L.wall('shoe_rack', 'any', { prio: 2 }));
    if (exterior || rng.chance(0.5)) any(() => L.wall('doormat', 'any', { prio: 2 }), () => null);
  }
  L.hang('coat_rack_wall', 'any', { y: 1.55 });
  if (rng.chance(0.7)) mirror(L, E, 'any', {});
  if (hh.religious > 0.3) art(L, E, rng.chance(0.5) ? 'blessing' : 'faithPic', 'any');
  art(L, E, rng.pick(['art', 'family', 'cal']), 'any');
  if (area >= 4) any(() => L.wall(rng.chance(0.5) ? 'plant_pot_clay' : 'side_table', 'any', { at: 'corner', prio: 2 }));
  if (hh.kids && exterior) L.free('school_bag', { rad: 3, prio: 2 });
  L.free('shoes_pair', { rad: 3, prio: 2 });
  ceilingFixture(L, E, hh, 'bulb');
  dressWalls(L, E, hh, { type: 'entry', max: 3 });
  fillMin(L, E, hh, 4);
}

// ---------------------------------------------------------------- OUTDOOR (patio, terrace, balcony)
export function outdoor(L, E, hh) {
  const rng = L.rng, t = L.room.type, area = floorArea(L);
  L.circulation = false;
  if (t === 'patio') {
    any(() => L.wall('lavadero', 'any', { at: 'corner', prio: 1 }));
    if (hh.income) any(() => L.wall('washing_machine', 'any', { prio: 2 }));
    for (let k = 0; k < Math.min(5, 2 + Math.floor(area / 6)); k++) {
      L.wall(rng.pick(['plant_bucket', 'plant_pot_clay', 'plant_big', 'plant_pot_clay']), 'any', { prio: 2, jitter: 1 });
    }
    if (area >= 6) { const tb = any(() => L.free('table_plastic', { rad: Math.max(L.W, L.D) / 2, prio: 2 })); if (tb) chairsAround(L, tb, 3, ['chair_plastic', 'chair_wood']); }
    L.hang('clothesline', 'any', { y: 1.45, w: Math.max(1.4, Math.min(L.W, L.D) - 0.5), def: { ...CATALOG.clothesline, size: [Math.max(1.4, Math.min(L.W, L.D) - 0.5), 0.55, 0.05] } });
    if (hh.pets.includes('canary') || rng.chance(0.3)) L.hang('cage_canary', 'any', { y: 1.6 });
    L.wall('drying_rack', 'any', { prio: 2 });
    L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
    L.wall('broom', 'any', { at: 'corner', prio: 2 });
    if (hh.pets.includes('dog')) L.free('dog_sleeping', { rad: 3, prio: 2 });
    if (hh.pets.includes('cat')) L.free('cat_sitting', { rad: 3, prio: 2 });
  } else if (t === 'terrace') {
    if (hh.hobby === 'pigeons' || rng.chance(0.22)) { const loft = any(() => L.wall('pigeon_loft', 'any', { at: 'corner', prio: 1 })); if (loft) loft.flags = { loft: true }; }
    L.hang('clothesline', 'any', { y: 1.45, w: Math.max(1.6, Math.min(L.W, L.D) - 0.6), def: { ...CATALOG.clothesline, size: [Math.max(1.6, Math.min(L.W, L.D) - 0.6), 0.55, 0.05] } });
    if (area > 12) L.hang('clothesline', 'any', { y: 1.4, w: 2.0, def: { ...CATALOG.clothesline, size: [2.0, 0.55, 0.05] } });
    const tb = any(() => L.free('table_plastic', { rad: 3, prio: 2 })); if (tb) chairsAround(L, tb, 3, ['chair_plastic']);
    for (let k = 0; k < 3; k++) L.wall(rng.pick(['plant_bucket', 'plant_pot_clay', 'plant_tin']), 'any', { prio: 2, jitter: 1 });
    L.wall('drying_rack', 'any', { prio: 2 }); L.wall('bucket_big', 'any', { prio: 2 });
    if (rng.chance(0.4)) L.wall('water_tank_small', 'any', { at: 'corner', prio: 2 });
  } else {                                                // balcony
    const tb = any(() => L.free('side_table', { prio: 2 })); if (tb) chairsAround(L, tb, 2, ['chair_plastic']);
    for (let k = 0; k < 2; k++) L.wall(rng.pick(['plant_bucket', 'plant_pot_clay']), 'any', { prio: 2, jitter: 1 });
    if (rng.chance(0.5)) L.wall('drying_rack', 'any', { prio: 2 });
    if (rng.chance(0.4)) L.hang('cage_canary', 'any', { y: 1.6 });
  }
  fillMin(L, E, hh, 4);
}

// ---------------------------------------------------------------- LAUNDRY / BACKROOM / OFFICE / GARAGE
export function laundry(L, E, hh) {
  any(() => L.wall('washing_machine', 'any', { at: 'corner', prio: 1 }));
  any(() => L.wall('lavadero', 'any', { prio: 1 }));
  L.wall('drying_rack', 'any', { prio: 2 }); L.free('laundry_basket', { rad: 3, prio: 2 });
  L.free('ironing_board', { rad: 3, prio: 2, rys: [0, PI / 2] });
  L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
  L.hang('shelf_wall', 'any', { y: 1.5 });
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 5);
}
export function office(L, E, hh) {
  const d = any(() => L.wall('desk_office', 'any', { at: 'window', prio: 0 }), () => L.wall('desk_wood', 'any', { prio: 0 }));
  let seat = null;
  if (d) { L.top(d, 'pc_set', { at: 'left' }); L.top(d, 'phone_landline', { at: 'right' }); seat = L.at('office_chair', ...L.rel(d, KNEEHOLE, d.d / 2 + 0.4), d.ry + PI, { prio: 2, tuck: d }); }
  L.wall('filing_cabinet', 'any', { at: 'corner', prio: 1 }); L.wall('bookshelf', 'any', { prio: 1 });
  chairsAround(L, d, 0, ['chair_wood']);
  // The visitor's chair keeps 0.9 m off the desk's own chair (the free search puts it beside it, 0.65 m away: a 0.6 m niche against the desk that the stuck sweep's walker jumps into and cannot leave, L48's office at (-0.5, -86)).
  const vis = any(() => L.free('chair_plastic', { rad: 2.6, prio: 2, clearOf: seat ? [seat] : [] }), () => L.free('chair_plastic', { rad: 2.6, prio: 2 })); void vis;
  L.free('trash_bin', { rad: 3, prio: 2 });
  art(L, E, ['diploma'], 'any', { cap: 0.5 }); art(L, E, 'cal', 'any'); clock(L, E, 'any', {});
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 6);
}
export function garage(L, E, hh) {
  const rng = L.rng;
  if (rng.chance(0.7)) L.wall('motorbike', 'any', { prio: 1 });
  L.wall('tire_stack', 'any', { at: 'corner', prio: 2 }); L.wall('workbench', 'any', { prio: 1 });
  L.wall('oil_drum', 'any', { at: 'corner', prio: 2 }); L.wall('parts_shelf', 'any', { prio: 2 }); L.wall('bucket_big', 'any', { prio: 2 });
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 5);
}
export function backroom(L, E, hh) {
  const rng = L.rng;
  L.wall('shelf_tienda', 'any', { prio: 1 }); L.wall('shelf_tienda', 'any', { prio: 2 });
  for (let k = 0; k < 3; k++) L.wall(rng.pick(['box_cardboard_l', 'box_cardboard_m', 'crate_stack_veg']), 'any', { prio: 2, jitter: 1 });
  L.wall('bucket_big', 'any', { at: 'corner', prio: 2 });
  L.wall('broom', 'any', { at: 'corner', prio: 2 });
  if (rng.chance(0.6)) L.wall('chair_plastic', 'any', { prio: 2 });
  if (rng.chance(0.4)) L.wall('fridge', 'any', { prio: 2 });
  art(L, E, 'cal', 'any'); clock(L, E, 'any', {});
  ceilingFixture(L, E, hh, 'tube'); fillMin(L, E, hh, 5);
}
