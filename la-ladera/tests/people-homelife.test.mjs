// People indoors (round 4, Arthur's playtest: "nobody inside buildings"). Whoever the brain has put inside a building (asleep, a stay at home, a visit to the clinic, the hall or the
// chapel, the nurse on duty, the workman at the bench) is hidden; while the player is in the building or near it they are DRAWN, each on a place of the interiors' anchors that fits
// the room (cooking at the stove, eating at the table, in front of the television, in bed at night, at the bench, on a pew), and hidden again when the player goes away.
// Pure Node: the simulation (js/people/homelife.js, brain.js stays, schedule.js tables), the real barrio and its furnished interiors. Every check here has a mutant that turns it red
// (.scratch/a4/mutations_homelife.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-homelife.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim } from '../js/people/sim.js';
import { Talk } from '../js/people/talk.js';
import { Homelife, MAX_DRAWN, WANT, flatOf } from '../js/people/homelife.js';
import { kneeReachM } from '../js/people/seatmodel.js';
import { isTwin, TWIN_R } from '../js/people/twins.js';
import { awake, blockAt, freeChoices, homeActs, homeWeight, visitWeight, HALL_MEETING } from '../js/people/schedule.js';
import { BANK } from '../js/people/lines/index.js';

const { ctx, plan } = await buildData({ furnish: true, colliders: true });
const META = await readAssetJson('people/people_meta.json');
const METAS = new Map(META.people.map((m) => [m.id, m]));
const ph = ctx.physics;
const lotKind = (id) => plan.lots.find((l) => l.id === id)?.kind;
const roomOf = (s) => ctx.buildings.get(s.building)?.interior?.rooms?.[s.room] ?? {};

function fresh(hour) {
  for (const [id] of ph.doors) ph.setDoor(id, false);
  ctx.hour = hour; ctx.errors = [];
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(METAS), 'the cast is built');
  const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0);
  return sim;
}
const run = (sim, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) sim.step(dt); };
/** The game clock at the game's own pace (120 s of play per game hour) from `from` for `secs` seconds; `each(sim)` every 5 s. */
function play(sim, from, secs, each = null) {
  for (let t = 0; t < secs; t += 0.1) { ctx.hour = from + t / 120; sim.step(0.1); if (each && Math.abs(t % 5) < 0.05) each(sim); }
}
const lookAt = (sim, spot) => sim.setPlayer(spot.x, spot.y, spot.z, 0);          // the player stands where the scene is, on its storey
const elsewhere = (sim) => sim.setPlayer(-400, 0, -400, 0);                       // nobody is near anything
const doorOf = (sim, lot) => sim.spots.entrance(lot, ['main', 'shop']);
/** The player steps in at the door and stands 1.5 m inside it, beside the way in (not on the doorway: whoever comes in or goes out would have to walk round them for ever). */
const enter = (sim, lot) => {
  const e = doorOf(sim, lot), dx = e.inside.x - e.outside.x, dz = e.inside.z - e.outside.z, l = Math.hypot(dx, dz) || 1, x = e.inside.x + (dx / l) * 1.5, z = e.inside.z + (dz / l) * 1.5;
  const ok = sim.lotAt(x, z) === lot; sim.setPlayer(ok ? x : e.inside.x, e.inside.y, ok ? z : e.inside.z, 0); return e;
};
const residents = (sim, lot) => sim.npcs.filter((n) => n.homeLotId === lot);
/** Where somebody stands or sits on scene `sc`: the anchor, and a sitter on a sofa or an armchair a `slide` forward of it along the way it faces (R3-026). */
const atPlace = (n, sc, tol = 0.05) => Math.hypot(n.x - (sc.spot.x + Math.sin(sc.ry) * (sc.slide ?? 0)), n.z - (sc.spot.z + Math.cos(sc.ry) * (sc.slide ?? 0))) < tol;
/** The piece of furniture an anchor was made for, with the anchor's distance `hip` from the middle of it and the front face's `front`, both along the way it faces; `soft`: a sofa or an armchair. */
function pieceOf(spot) {
  const bp = ctx.buildings.get(spot.building), rec = spot.item != null ? bp?.furniture?.find((r) => r.id === spot.item) : null;
  if (!rec) return null;
  const [cx, , cz] = bp.frame.toWorld(rec.x, 0, rec.z);
  return { rec, cx, cz, hip: (spot.x - cx) * Math.sin(spot.ry) + (spot.z - cz) * Math.cos(spot.ry), front: rec.d / 2, soft: rec.tags.includes('sofa') || rec.tags.includes('armchair') };
}

/** What each scene may stand on (anchor kinds) and in (room types): written from the spec, not read from the code. */
const FIT = {
  cook: { on: ['cook'], in: ['kitchen'] },
  wash: { on: ['wash'], in: ['kitchen', 'bathroom'] },
  laundry: { on: ['laundry'], in: ['terrace', 'patio', 'balcony', 'kitchen', 'backroom', 'laundry'] },       // ('laundry': the Lavadero, whose basin, rack and basket are the anchors: interiors/rooms.js `laundry`, index.js A('laundry'))
  sweep: { on: ['sweep'], in: null },
  eat: { on: ['sit'], in: ['dining', 'kitchen'] },
  tv: { on: ['tv'], in: ['living', 'bedroom', 'dining'] },
  read: { on: ['read', 'sit', 'tv'], in: ['living', 'bedroom', 'dining', 'hall'] },
  homework: { on: ['sit', 'work'], in: ['dining', 'kitchen', 'living', 'bedroom', 'hall'] },
  phone: { on: ['sit', 'tv'], in: ['living', 'dining', 'hall'] },
  sit: { on: ['sit', 'tv'], in: ['living', 'dining', 'kitchen', 'bedroom', 'hall'] },
  pray: { on: ['pray'], in: ['living', 'bedroom', 'hall'] },
  play: { on: ['play'], in: null },
  sleep: { on: ['sleep'], in: ['bedroom'] },
  altar: { on: ['pray'], in: ['chapel'] },
  pew: { on: ['sit'], in: ['chapel'] },
  nurse: { on: ['stand'], in: ['office', 'hall', 'shop'] },
  nurse2: { on: ['customer', 'lean', 'counter'], in: ['hall', 'shop', 'office'] },
  wait: { on: ['sit'], in: ['hall', 'shop'] },
  meet: { on: ['sit'], in: ['hall'] },
  bench: { on: ['work'], in: ['workshop'] },
};
const fits = (sc) => {
  const f = FIT[sc.kind]; if (!f) return `no such scene ${sc.kind}`;
  if (!f.on.includes(sc.spot.kind)) return `${sc.kind} on a ${sc.spot.kind} anchor`;
  const rt = roomOf(sc.spot).type;
  const hotplate = sc.kind === 'cook' && rt === 'bedroom' && lotKind(sc.lot) === 'tenement';                                    // (a room of a tenement has its own hotplate)
  const rack = sc.kind === 'laundry' && ['living', 'bedroom'].includes(rt) && (sc.spot.tagSet.has('rack') || sc.spot.tagSet.has('line'));      // (and a drying rack or a line to hang the washing on indoors)
  if (f.in && !f.in.includes(rt) && !hotplate && !rack) return `${sc.kind} in a ${rt}`;
  return null;
};

// ---- the night -----------------------------------------------------------------------------------------------------------------------------------------
test('the night: a sleeper is lying in bed in their own bedroom when the player looks in, one to a bed, and hidden again when the player goes away', (t) => {
  const sim = fresh(2); run(sim, 2);
  const sleepers = sim.npcs.filter((n) => n.away && n.awayWhy === 'sleep' && n.inLot && n.inLot === n.homeLotId);
  assert.ok(sleepers.length >= 80, `${sleepers.length} people are asleep in their homes`);
  let bedded = 0, shared = 0; const noBed = [];
  for (const n of sleepers) {
    const lot = n.inLot, sc = sim.homelife.choose(n, lot, 'sleep', 2);
    if (!sc) { noBed.push(lot); continue; }
    lookAt(sim, sc.spot); run(sim, 0.6);
    if (n.away) {                                                     // two people of one building and one bed: the one who is looked at first lies in it, the other is not drawn (one to a bed)
      const other = sim.npcs.find((m) => m.id === sc.spot.occ[0]);
      assert.ok(other && other !== n && !other.away && other.homeLotId === lot && other.scene?.kind === 'sleep', `${n.id} is not drawn at the bed of ${lot}, so a housemate lies in it (${other?.id})`);
      shared++; elsewhere(sim); run(sim, 0.6); assert.equal(sim.homelife.drawn.size, 0, 'nobody is left drawn'); continue;
    }
    assert.equal(n.away, false, `${n.id} is drawn when the player is at the bed`);
    assert.ok(n.scene?.kind === 'sleep' && n.act === 'sleep' && n.lieH != null, `${n.id} lies in bed (${n.scene?.kind}/${n.act}/lie ${n.lieH})`);
    assert.equal(n.spot.kind, 'sleep'); assert.equal(roomOf(n.spot).type, 'bedroom', `${n.id}'s bed is in a bedroom`);
    const mine = sim.homelife.info(lot).anchors.some((a) => a.kind === 'sleep' && n.household && flatOf(a.hh) === flatOf(n.household.id));
    if (mine) assert.equal(flatOf(roomOf(n.spot).hh), flatOf(n.household.id), `${n.id} sleeps in the bedroom of their own flat (${roomOf(n.spot).hh} vs ${n.household.id})`);
    else assert.ok(!residents(sim, lot).some((m) => m !== n && m.household?.id === roomOf(n.spot).hh), `${n.id} has no bedroom of their own: not in a bed that is somebody else's`);
    assert.ok(Math.hypot(n.x - n.spot.x, n.z - n.spot.z) < 0.05 && sim.lotAt(n.x, n.z) === lot, `${n.id} is at the bed, inside the building`);
    assert.equal(sim.spots.claimOf(n), n.spot); assert.deepEqual(n.spot.occ, [n.id], 'one to a bed');
    bedded++;
    elsewhere(sim); run(sim, 0.6);
    assert.ok(n.away && n.awayWhy === 'sleep', `${n.id} is hidden again`); assert.equal(n.lieH, null); assert.equal(n.scene, null); assert.equal(sim.spots.claimOf(n), null);
    assert.equal(sim.homelife.drawn.size, 0, 'nobody is left drawn');
  }
  t.diagnostic(`${bedded} of ${sleepers.length} sleepers found a bed (${noBed.length} live where there is no bedroom: ${noBed}; ${shared} share the one bed of their building)`);
  // 78 + 6 + 2 = 86 on the 2026-10-31 15:00 tree: since A2 gave the 17 shop homes a bedroom (the 22 people who slept nowhere) only the kiosk's two residents have no bed, and six people share a one-bed building
  assert.ok(bedded >= 76 && shared <= 8 && noBed.length <= 2, `${bedded} of ${sleepers.length} sleepers found a bed (${noBed.length} live where there is no bedroom: ${noBed}; ${shared} share the one bed of their building)`);
  assert.equal(sim.faults.length, 0, 'no faults'); assert.deepEqual(ctx.errors, []);
});

test('the storeys: a sleeper upstairs is not drawn for a player on the ground floor, and is there for a player upstairs', () => {
  const sim = fresh(2); run(sim, 2);
  let pick = null;
  for (const n of sim.npcs) {
    if (!(n.away && n.awayWhy === 'sleep' && n.inLot && n.inLot === n.homeLotId)) continue;
    const sc = sim.homelife.choose(n, n.inLot, 'sleep', 2), e = sc && doorOf(sim, n.inLot);
    if (sc && e?.inside && sc.spot.y - e.inside.y > 2) { pick = { n, sc, e }; break; }
  }
  assert.ok(pick, 'somebody sleeps upstairs');
  enter(sim, pick.n.inLot); run(sim, 1);
  assert.equal(pick.n.away, true, 'the player downstairs sees nobody in bed upstairs');
  assert.equal(sim.homelife.drawn.size, 0);
  lookAt(sim, pick.sc.spot); run(sim, 1);
  assert.equal(pick.n.away, false, 'upstairs they are there'); assert.equal(pick.n.scene.kind, 'sleep');
});

// ---- the day --------------------------------------------------------------------------------------------------------------------------------------------
test('the day at home: everybody who lives in a house has something to do in the right room at breakfast, lunch, supper and bed time, and the evening is not the morning', () => {
  const sim = fresh(12), all = new Set(), byHour = {};
  const lived = sim.npcs.filter((n) => n.homeLotId && lotKind(n.homeLotId) !== 'kiosk');
  assert.ok(lived.length >= 80, `${lived.length} people have a home with rooms`);
  for (const hour of [6.5, 8, 10, 12.5, 15, 17, 19.3, 21, 22.5]) {
    const kinds = (byHour[hour] = new Set());
    for (const n of lived) {
      const sc = sim.homelife.choose(n, n.homeLotId, 'home', hour);
      assert.ok(sc, `${n.id} (${n.persona}, ${n.age}) at home in ${n.homeLotId} (${lotKind(n.homeLotId)}) at ${hour} has a scene`);
      const bad = fits(sc); assert.equal(bad, null, `${n.id} at ${hour}: ${bad}`);
      kinds.add(sc.kind); all.add(sc.kind);
    }
  }
  assert.ok(all.size >= 9, `${all.size} kinds of scene over the day: ${[...all]}`);
  for (const k of ['cook', 'eat']) assert.ok(byHour[8].has(k) && byHour[12.5].has(k), `${k} at breakfast and at lunch`);
  assert.ok(byHour[19.3].has('tv') && byHour[19.3].has('eat') && byHour[19.3].has('cook'), 'supper is cooked, eaten, and followed by the television');
  assert.ok(byHour[10].has('laundry') && byHour[15].has('laundry'), 'the washing is hung in the morning and the afternoon');
  for (const k of byHour[22.5]) assert.ok(['tv', 'read', 'wash', 'pray', 'phone', 'homework', 'play', 'sit'].includes(k), `at night nobody cooks, sweeps or hangs the washing: ${k}`);
  for (const k of ['homework']) assert.ok(!byHour[6.5].has(k) && !byHour[8].has(k), 'no homework at breakfast');
});

test('looking in at a home: the people who are there are drawn on the place the scene chose, with the pose of what they do, one to a place, and hidden again when the player goes', () => {
  const kinds = new Set(); let seen = 0;
  for (const hour of [8, 12.5, 19.3]) {
    const sim = fresh(hour); run(sim, 20);
    const home = sim.npcs.filter((n) => n.away && n.awayWhy === 'home' && n.inLot && !n.emerging && n.stayUntil > sim.t + 4).slice(0, 14);      // (whose stay goes on while the player looks)
    assert.ok(home.length >= 6, `${home.length} are at home at ${hour}`);
    for (const n of home) {
      if (!n.away || n.emerging || n.stayUntil < sim.t + 3) continue;                                                // (the stay is over by the time we come to them)
      const lot = n.inLot, sc = sim.homelife.choose(n, lot, 'home', hour);
      if (!sc) continue;
      lookAt(sim, sc.spot); run(sim, 0.6);
      assert.equal(n.away, false, `${n.id} is drawn at ${hour}`);
      assert.equal(n.scene.kind, sc.kind, 'and does what the scene chose'); assert.equal(fits(n.scene), null);
      assert.ok(atPlace(n, sc) && sim.lotAt(n.x, n.z) === lot, `${n.id} is at the anchor (a sitter on a sofa or an armchair forward of it by ${sc.slide.toFixed(2)} m), inside`);
      assert.equal(n.act, sc.act, `${n.id} acts "${sc.act}"`);
      if (sc.sit != null) assert.ok(n.sitH != null && Math.abs(n.sitH - sc.sit) < 1e-6, `${sc.kind}: seated`); else assert.equal(n.sitH, null, `${sc.kind}: standing`);
      if (sc.kind === 'sweep') assert.equal(n.prop, 'broom', 'sweeping with a broom');
      const taken = [...sim.homelife.drawn].filter((m) => m.spot === n.spot); assert.equal(taken.length, 1, 'one to an anchor');
      kinds.add(sc.kind); seen++;
      elsewhere(sim); run(sim, 0.6);
      assert.ok(n.away && n.awayWhy === 'home' && n.scene == null && n.sitH == null && n.prop == null, `${n.id} is hidden again, home`);
      assert.equal(sim.spots.claimOf(n), null);
    }
    assert.equal(sim.faults.length, 0, 'no faults');
  }
  assert.ok(seen >= 20 && kinds.size >= 6, `${seen} people seen in ${kinds.size} kinds of scene: ${[...kinds]}`);
});

test('an anchor that is taken is not given to somebody else', () => {
  const sim = fresh(19.3), n = sim.npcs.find((m) => m.homeLotId && m.routine !== 'shopkeeper' && lotKind(m.homeLotId) === 'house');
  const a = sim.homelife.choose(n, n.homeLotId, 'home', 19.3); assert.ok(a, 'a scene');
  sim.spots.claim(a.spot, sim.npcs[0]);
  for (let k = 0; k < 6; k++) {
    const b = sim.homelife.choose(n, n.homeLotId, 'home', 19.3 + k * 0.5);
    if (b) assert.notEqual(b.spot, a.spot, 'the claimed anchor is not chosen again');
  }
  const bed = sim.homelife.choose(n, n.homeLotId, 'sleep', 2); sim.spots.claim(bed.spot, sim.npcs[0]);
  const bed2 = sim.homelife.choose(n, n.homeLotId, 'sleep', 2); assert.ok(!bed2 || bed2.spot !== bed.spot, 'nor the bed somebody lies in');
});

test('a bed that somebody lives in is not given to a stranger: a person with no bed of their own is not put in it', () => {
  const sim = fresh(2); let checked = 0;
  for (const owner of sim.npcs) {
    const lot = owner.homeLotId; if (!lot || !owner.household?.id || !sim.homelife.candidates(owner, lot, 'sleep').length) continue;
    const lived = new Set(residents(sim, lot).map((m) => m.household?.id).filter(Boolean));
    const stranger = sim.npcs.find((m) => m.homeLotId !== lot && m.household?.id), own = stranger.household;
    stranger.household = { id: 'Z99.all.nobody' };                                                                    // a household with no room in this building
    const got = sim.homelife.candidates(stranger, lot, 'sleep'); stranger.household = own;
    for (const a of got) assert.ok(!lived.has(a.hh), `${a.id} is the bed of ${a.hh}, whom somebody lives with in ${lot}: not for a stranger`);
    checked++;
  }
  assert.ok(checked >= 40, `${checked} buildings with a bed`);
});

test('a household known only by its flat finds the bed of its own flat, not one in another flat of the block', () => {
  const sim = fresh(2); let checked = 0;
  for (const n of sim.npcs) {
    if (!n.homeLotId || lotKind(n.homeLotId) !== 'apartments' || !/\.f\d+[a-z]\./.test(n.household?.id ?? '')) continue;
    const lot = n.homeLotId, flat = flatOf(n.household.id); sim.homelife.owners(lot);                                  // (the households with a resident are those of the real cast)
    if (!sim.homelife.info(lot).anchors.some((a) => a.kind === 'sleep' && flatOf(a.hh) === flat)) continue;            // (a flat with no bedroom of its own - A3's households may name a floor with none - takes the building's: by design)
    const real = n.household; n.household = { ...real, id: flat + '.' };                                               // 'L71.f2b.' for 'L71.f2b.elder': no room has exactly that
    const got = sim.homelife.candidates(n, lot, 'sleep'); n.household = real;
    assert.ok(got.length >= 1 && got.every((a) => flatOf(a.hh) === flat), `${n.id}: the beds for ${flat}. are ${got.map((a) => a.hh)}`);
    checked++;
  }
  assert.ok(checked >= 5, `${checked} flats tried`);
});

test('indoors, only the people of the building the player is in are drawn, though the next building has somebody in bed on the same level', () => {
  const sim = fresh(2); run(sim, 2);
  const low = sim.npcs.filter((n) => n.away && n.awayWhy === 'sleep' && n.inLot).map((n) => { const sc = sim.homelife.choose(n, n.inLot, 'sleep', 2), e = sc && doorOf(sim, n.inLot); return { n, sc, e }; })
    .filter((x) => x.sc && x.e?.inside && Math.abs(x.sc.spot.y - x.e.inside.y) < 1.2);                                    // in bed on the ground floor (the barrio is on a hill: the floor is the door's level)
  const pair = low.flatMap((a) => low.filter((b) => b.n.inLot !== a.n.inLot && Math.abs(b.sc.spot.y - a.sc.spot.y) < 1.2).map((b) => [a, b]))[0];
  assert.ok(pair, `${low.length} sleepers on a ground floor, and two of them in different buildings on one level`);
  const [a, b] = pair, lotA = a.n.inLot, lotB = b.n.inLot; lookAt(sim, a.sc.spot); run(sim, 1.5);
  assert.equal(a.n.away, false, `${a.n.id} is drawn in ${lotA}, where the player is`);
  const seen = [...sim.homelife.drawn];
  assert.ok(seen.length >= 1 && seen.every((n) => n.scene.lot === lotA) && b.n.away, `drawn: ${seen.map((n) => n.id + '@' + n.scene.lot)} (the player is in ${lotA}; ${b.n.id} in ${lotB} is level with them and stays hidden)`);
});

test('a reviewer can frame a person who is hidden indoors: reveal draws them on their scene wherever the player is, lookPose finds a place in front of them, and they stay drawn while the player stands there', () => {
  const sim = fresh(19.3); run(sim, 3); elsewhere(sim); run(sim, 1);
  const hidden = sim.npcs.filter((n) => n.away && n.inLot && n.awayWhy !== 'school' && sim.homelife.choose(n, n.inLot, n.awayWhy, 19.3));
  assert.ok(hidden.length >= 12, `${hidden.length} people are indoors with a scene at half past seven`);
  let framed = 0;
  for (const n of hidden.slice(0, 24)) {
    assert.equal(sim.homelife.reveal(n), true, `${n.id} is drawn, on whatever floor of a hill the player is not on`);
    assert.ok(!n.away && n.scene && sim.spots.claimOf(n) === n.spot, `${n.id} is on their place`);
    const sc = n.scene, pose = sim.lookPose(n.id, { dist: 1.5 });
    if (pose.ok) {
      sim.setPlayer(pose.feet.x, pose.feet.y, pose.feet.z, pose.yaw); run(sim, 0.6);
      assert.ok(!n.away && n.scene === sc, `${n.id} is still there with the player in front of them`); framed++;
    }
    elsewhere(sim); for (let t = 0; t < 8 && !n.away; t += 0.25) run(sim, 0.25);                                  // (never in the middle of a reaction to the player: a few seconds at most)
    assert.ok(n.away, `${n.id} is hidden again when the player goes`);
  }
  assert.ok(framed >= 18, `${framed} of 24 could be stood in front of`);
  assert.equal(sim.faults.length, 0);
});

test('what stands on what: a school desk is no bench and no place for the homework, a cot is no bed, the altar is the chapel\'s and the prayer corner the home\'s, nobody sits on a terrace', () => {
  const A = (kind, tags = [], rtype = 'living') => ({ kind, rtype, tagSet: new Set(tags) });
  assert.equal(WANT.bench(A('work', [], 'workshop')), true); assert.equal(WANT.bench(A('work', ['school'], 'workshop')), false, 'a school desk is not a bench');
  assert.equal(WANT.homework(A('work', [], 'bedroom')), true); assert.equal(WANT.homework(A('work', ['school'], 'bedroom')), false, 'nor a place for the homework at home');
  assert.equal(WANT.sleep(A('sleep', [], 'bedroom')), true); assert.equal(WANT.sleep(A('sleep', ['crib'], 'bedroom')), false, 'a cot is no bed for a grown person');
  assert.equal(WANT.pray(A('pray', ['home'])), true); assert.equal(WANT.pray(A('pray', ['chapel'], 'chapel')), false, 'the altar is the chapel\'s');
  assert.equal(WANT.altar(A('pray', ['chapel'], 'chapel')), true); assert.equal(WANT.altar(A('pray', ['home'])), false, 'and the prayer corner of a home is not an altar');
  assert.equal(WANT.pew(A('sit', ['pray'], 'chapel')), true); assert.equal(WANT.pew(A('sit', [], 'living')), false, 'a sofa is not a pew');
  assert.equal(WANT.wait(A('sit', ['waiting'], 'hall')), true); assert.equal(WANT.wait(A('sit', [], 'hall')), false, 'a chair that is not in the waiting row');
  for (const rt of ['terrace', 'patio', 'balcony', 'bathroom', 'shop', 'stairwell']) { assert.equal(WANT.tv(A('tv', [], rt)), false, `no television in a ${rt}`); assert.equal(WANT.sit(A('sit', [], rt)), false, `nor a place to sit in a ${rt}`); }
  assert.equal(WANT.eat(A('sit', [], 'dining')), true); assert.equal(WANT.eat(A('sit', [], 'bedroom')), false, 'one eats at the table, not in the bedroom');
  assert.equal(WANT.cook(A('cook', [], 'kitchen')), true); assert.equal(WANT.cook(A('sit', [], 'kitchen')), false, 'one cooks at the stove, not on a chair');
});

test('the meeting of the board is in the hall itself, though the building has other places to sit', () => {
  const sim = fresh(19.3), hall = sim.lots.hall, I = sim.homelife.info(hall);
  assert.ok(I.anchors.some((a) => a.kind === 'sit' && a.rtype !== 'hall'), 'the hall building has seats outside the hall too (the committee room)');
  const n = sim.npcs.find((m) => visitWeight(m, 19.3, 'hall') > 0), list = sim.homelife.candidates(n, hall, 'meet');
  assert.ok(list.length >= 4 && list.every((a) => a.rtype === 'hall'), `the places for the meeting: ${[...new Set(list.map((a) => a.rtype))]} (${list.length})`);
});

test('a household eats and watches together: whoever comes next to a housemate who is drawn takes a place in the housemate\'s room far more often than by chance', () => {
  const sim = fresh(19.3); let trials = 0, together = 0, chance = 0, homes = 0;
  // (the cast has two households of more than one: lend each resident of a house a housemate, the next person of the cast)
  const living = sim.npcs.filter((n) => n.homeLotId && n.household?.id && n.routine !== 'shopkeeper' && ['house', 'rowhouse', 'courtyard', 'shophouse'].includes(lotKind(n.homeLotId)));
  for (const a of living) {
    const b = sim.npcs.find((m) => m !== a && !isTwin(a, m) && m.routine !== 'shopkeeper'), own = b.household; b.household = a.household;
    for (const kind of ['sit', 'read', 'phone', 'eat', 'tv', 'homework']) {
      const lot = a.homeLotId, list = sim.homelife.candidates(b, lot, kind), rooms = [...new Set(list.map((s) => s.room))];
      if (rooms.length < 2) continue;                                                                                  // one room has all the places: nothing to choose
      const here = list.find((s) => s.room === rooms[0]); a.scene = { lot, spot: here, why: 'home', kind }; sim.homelife.drawn.add(a);
      let w = 0, c = 0; for (let k = 0; k < 40; k++) { if (sim.homelife.find(b, lot, kind, `s${k}`).room === here.room) w++; }
      sim.homelife.drawn.delete(a); a.scene = null;
      for (let k = 0; k < 40; k++) { if (sim.homelife.find(b, lot, kind, `s${k}`).room === here.room) c++; }
      together += w; chance += c; trials += 40; homes++;
    }
    b.household = own;
  }
  assert.ok(homes >= 10, `${homes} households with places in two rooms or more`);
  assert.ok(together / trials >= chance / trials + 0.15, `with a housemate in the room ${(100 * together / trials).toFixed(0)} %, without one ${(100 * chance / trials).toFixed(0)} % (${homes} households)`);
  assert.equal(sim.homelife.drawn.size, 0);
});

test('a street with many homes in reach: no more than the cap are drawn at once, and the cap is a small number', () => {
  const sim = fresh(19.3); run(sim, 5);
  assert.equal(MAX_DRAWN, 18, 'the cap is a few people, not the barrio');
  // the barrio has nowhere that many people are indoors at once (sixteen is the most that can be seen from a street), so make a crowd: seventy people in the five homes nearest to the rowhouses' doors
  const e0 = doorOf(sim, 'L25'), P = { x: e0.outside.x, y: e0.outside.y, z: e0.outside.z };
  const homes = plan.lots.filter((l) => ['house', 'rowhouse', 'apartments', 'tenement', 'shophouse'].includes(l.kind) && doorOf(sim, l.id)).sort((a, b) => sim.homelife.gap(a.id, P.x, P.z) - sim.homelife.gap(b.id, P.x, P.z)).slice(0, 5);
  const crowd = sim.npcs.filter((n) => !n.away).slice(0, 70); assert.ok(crowd.length >= 3 * MAX_DRAWN / 2, `${crowd.length} people to make a crowd of`);
  crowd.forEach((n, i) => { sim.brain.hideAway(n, homes[i % homes.length].id, 'home'); n.stayUntil = sim.t + 900; n.sceneRetry = 0; });
  sim.setPlayer(P.x, P.y, P.z, 0);
  let peak = 0; for (let t = 0; t < 20; t += 0.25) { run(sim, 0.25); peak = Math.max(peak, sim.homelife.drawn.size); }
  assert.ok(peak <= MAX_DRAWN, `${peak} drawn at once (cap ${MAX_DRAWN})`); assert.equal(peak, MAX_DRAWN, 'and the crowd fills the cap');
  assert.equal(sim.faults.length, 0);
});

/**
 * Everybody who is on a seat at nine in the evening and in bed by midnight, with a bed on the seat's floor and a way between (from the seat, or from the floor beside it when the seat itself
 * blocks the way): { n, sofa, bed, up (the floor is above the street door's), doors (the inner doors on the way) }.
 */
function bedTimeCases(sim) {
  const out = [];
  for (const n of sim.npcs) {
    if (!n.homeLotId || n.routine === 'shopkeeper' || lotKind(n.homeLotId) === 'kiosk' || !awake(n, 21.2) || awake(n, 23.9)) continue;
    const lot = n.homeLotId, sofa = sim.homelife.choose(n, lot, 'home', 21.2), bed = sim.homelife.choose(n, lot, 'sleep', 23.9), side = bed?.kind === 'sleep' ? sim.homelife.beside(bed.spot) : null, e = doorOf(sim, lot);
    if (!(sofa && side && e?.inside && sofa.kind !== 'sleep' && sofa.sit != null && Math.abs(sofa.spot.y - bed.spot.y) < 0.6)) continue;
    const conn = (p) => sim.indoor.connected(lot, p, side, bed.spot.y);
    let c = conn(sofa.spot); if (!c.ok) { const f = sim.homelife.floorNear(sofa.spot, 0.3, 1.4, (p) => conn(p).ok); if (f) c = conn(f); }
    if (c.ok) out.push({ n, sofa, bed, up: sofa.spot.y - e.inside.y > 2, doors: c.doors });
  }
  return out;
}
/** At home on the seat with the player looking in; bed time comes; they walk to bed. The walk as it was seen: metres, the longest single step, seconds, the inner doors they went to open. */
function bedTime(sim, { n, sofa }) {
  sim.brain.hideAway(n, n.homeLotId, 'home'); n.stayUntil = sim.t + 900;                 // at home for the evening
  lookAt(sim, sofa.spot); run(sim, 1);
  assert.ok(!n.away && n.scene?.kind === sofa.kind && n.scene.arrived, `on the ${sofa.kind} place first (${n.scene?.kind})`);
  assert.equal(sim.spots.claimOf(n), sofa.spot);
  ctx.hour = 23.9; assert.ok(!awake(n, 23.9) && blockAt(n, 23.9) === 'sleep', 'it is bed time for them');
  const doors = new Set(); let walked = 0, jump = 0, last = { x: n.x, z: n.z }, t = 0, start = null;
  for (; t < 60 && !(n.scene?.kind === 'sleep' && n.scene.arrived); t += 0.1) {
    sim.step(0.1); const d = Math.hypot(n.x - last.x, n.z - last.z); jump = Math.max(jump, d); walked += d; last = { x: n.x, z: n.z };
    for (const p of n.path ?? []) if (p.door) doors.add(p.door);
    if (start == null && n.scene?.kind === 'sleep' && n.mode === 'walk') start = { inside: !!ph._overlaps(n.x, n.z, n.y, 0.25, 1.5), x: n.x, z: n.z };       // the first frame of the walk to bed
    if (!n.scene) break;
  }
  return { walked, jump, secs: t, doors: [...doors], start };
}
const inBed = (sim, { n, sofa }, r) => {
  assert.ok(n.scene?.kind === 'sleep' && n.scene.arrived && n.lieH != null && n.act === 'sleep', `${n.id} in bed (${n.scene?.kind}, arrived ${n.scene?.arrived}, lying ${n.lieH}) after ${r.secs.toFixed(1)} s`);
  assert.equal(n.spot.kind, 'sleep', 'on a bed'); assert.equal(sim.spots.claimOf(n), n.spot); assert.deepEqual(n.spot.occ, [n.id]);
  assert.ok(sofa.spot.occ.length === 0, 'the sofa is free again');
  assert.ok(r.walked > 0.8 && r.jump < 2.5, `walked ${r.walked.toFixed(1)} m, and the longest step was ${r.jump.toFixed(2)} m (the lying down onto the bed from the bedside is the one jump)`);
  assert.ok(r.start && !r.start.inside, `the walk to bed starts on the floor, up out of the seat, not inside the outline of the furniture (${r.start ? `(${r.start.x.toFixed(2)}, ${r.start.z.toFixed(2)})` : 'no walk seen'})`);
  assert.equal(sim.faults.length, 0);
};

test('bed time with the player watching: the person on the sofa gets up and walks to bed, lies down, and the sofa is free again', () => {
  const sim = fresh(21.2); run(sim, 5);
  const pick = bedTimeCases(sim)[0]; assert.ok(pick, 'somebody has a sofa and a bed on one floor with a way between');
  inBed(sim, pick, bedTime(sim, pick));
});

test('bed time: the seat itself is never the place to walk from, even where the indoor grid calls its cell free (they get up onto the floor beside it first)', () => {
  const sim = fresh(21.2); run(sim, 5);
  const pick = bedTimeCases(sim)[0]; assert.ok(pick, 'somebody has a sofa and a bed on one floor with a way between');
  const connected = sim.indoor.connected.bind(sim.indoor), seat = pick.sofa.spot;
  sim.indoor.connected = (lot, p, to, y) => (Math.hypot(p.x - seat.x, p.z - seat.z) < 0.05 ? { ok: true, doors: [] } : connected(lot, p, to, y));      // the grid of another plan: the cell of the seat is free (one seat of an older tree was)
  inBed(sim, pick, bedTime(sim, pick));
});

test('bed time upstairs: the way to the bedroom goes through the doors of the floor they are on, and they are in bed in seconds, not stuck at a shut door', () => {
  const sim = fresh(21.2); run(sim, 5);
  const cases = bedTimeCases(sim), pick = cases.find((c) => c.up && c.doors.length);
  assert.ok(pick, `a flat upstairs with a door between the sofa and the bed (${cases.length} cases, ${cases.filter((c) => c.up).length} of them upstairs)`);
  const r = bedTime(sim, pick), y = pick.bed.spot.y;
  assert.ok(r.doors.length >= 1, 'the way leads through an inner door');
  for (const id of r.doors) { const w = ph.doors.get(id)?.[0]; assert.ok(w && w.y1 > y + 0.4 && w.y0 < y + 1.6, `${id} is a door of the floor at ${y.toFixed(1)} (its walls are at ${w?.y0.toFixed(1)}..${w?.y1.toFixed(1)})`); }
  assert.ok(r.secs < 25, `in bed after ${r.secs.toFixed(1)} s`); assert.equal(pick.n.unstuckCount ?? 0, 0, 'no stuck walker on the way');
  inBed(sim, pick, r);
});

test('a block of flats: every resident has a place to be at home, in the flat or in the rooms of the block, and the bed is the bed of their own flat', () => {
  const sim = fresh(12); let flats = 0;
  for (const n of sim.npcs) {
    if (!n.homeLotId || !['apartments', 'tenement'].includes(lotKind(n.homeLotId))) continue;
    flats++;
    for (const hour of [8, 12.5, 19.3]) assert.ok(sim.homelife.choose(n, n.homeLotId, 'home', hour), `${n.id} of ${n.homeLotId} (${n.household?.id}) at ${hour}`);
    const bed = sim.homelife.choose(n, n.homeLotId, 'sleep', 2); assert.ok(bed, `${n.id} has a bed`);
    const mine = sim.homelife.info(n.homeLotId).anchors.some((a) => a.kind === 'sleep' && flatOf(a.hh) === flatOf(n.household.id));
    if (mine) assert.equal(flatOf(roomOf(bed.spot).hh), flatOf(n.household.id), `${n.id} sleeps in their own flat`);
  }
  assert.ok(flats >= 8, `${flats} people live in blocks of flats`);
});

test('a shopkeeper\'s household is up in the evening and in the morning, in bed in the night: once the shop has shut they are up and about upstairs until bed time (R3-028), which is later', () => {
  const sim = fresh(12), keepers = sim.npcs.filter((n) => n.routine === 'shopkeeper' && n.homeLotId && lotKind(n.homeLotId) !== 'kiosk');
  assert.ok(keepers.length >= 15, `${keepers.length} shopkeepers live above the shop`);
  let up = 0, down = 0;
  for (const n of keepers) {
    const lot = n.homeLotId, before = sim.homelife.actsFor(n, lot, 'sleep', n.bedH - 0.4), after = sim.homelife.actsFor(n, lot, 'sleep', n.bedH + 0.4), morning = sim.homelife.actsFor(n, lot, 'sleep', n.riseH + 0.3);
    assert.ok(awake(n, n.bedH - 0.4) && !awake(n, n.bedH + 0.4), 'bed time is bed time');
    assert.equal(blockAt(n, n.bedH - 0.4), 'free', `${n.id} (${n.bank}) is not in the sleep block before bed time, the shop being shut`); assert.equal(blockAt(n, n.bedH + 0.4), 'sleep', `${n.id} is after it`);
    assert.ok(!before.some(([k]) => k === 'sleep'), `${n.id} is up before bed time`); up++;
    assert.deepEqual(after, [['sleep', 1]], `${n.id} sleeps after it`); down++;
    assert.ok(!morning.some(([k]) => k === 'sleep'), `${n.id} is up again when the day starts`);
  }
  assert.ok(up === keepers.length && down === keepers.length);
  // and in the sim: the baker's wife whose shop has shut and who is not yet in bed is on a sofa, not in a bed
  const who = keepers.find((n) => lotKind(n.homeLotId) !== 'kiosk' && sim.homelife.info(n.homeLotId).anchors.some((a) => a.kind === 'tv'));
  const sc = sim.homelife.choose(who, who.homeLotId, 'sleep', who.bedH - 0.4); assert.ok(sc && sc.kind !== 'sleep' && fits(sc) === null, `up and about: ${sc?.kind}`);
});

// ---- walking in and out ---------------------------------------------------------------------------------------------------------------------------------------
test('the clinic with the player inside: somebody who comes in through the door walks on to a seat and sits; when the stay is over they get up and walk out', () => {
  const sim = fresh(10), clinic = sim.lots.clinic, e = enter(sim, clinic); run(sim, 1);
  const who = sim.npcs.find((n) => !n.away && n.age === 'adult' && n.routine !== 'shopkeeper' && !sim.lotAt(n.x, n.z) && sim.homelife.choose(n, clinic, 'visit', 10)?.spot.y < e.inside.y + 0.6);
  assert.ok(who, 'somebody who would sit downstairs');
  const sc = sim.homelife.choose(who, clinic, 'visit', 10), dx = e.outside.x - e.inside.x, dz = e.outside.z - e.inside.z, l = Math.hypot(dx, dz) || 1;
  sim.brain.finish(who); sim.placeNpc(who, e.outside.x + (dx / l) * 3, e.outside.z + (dz / l) * 3, e.outside.y, 0);                  // three steps from the door, in the street
  assert.equal(sim.brain.do_clinic(who), true, 'off to the clinic');
  let first = null, sat = false; const lots = new Set();
  for (let t = 0; t < 60 && !sat; t += 0.1) {
    sim.step(0.1);
    if (who.scene && who.scene.arrived === false) { first ??= { d: Math.hypot(who.x - e.inside.x, who.z - e.inside.z), spot: who.scene.spot }; lots.add(sim.lotAt(who.x, who.z)); }
    sat = !!who.scene?.arrived;
  }
  assert.ok(first, 'they were seen coming in: drawn on the way, not on the chair at once');
  assert.ok(first.d < 1, `at the door (${first.d.toFixed(1)} m)`); assert.deepEqual([...lots], [clinic], 'the walk to the seat is inside the building');
  assert.ok(sat && who.sitH != null && who.scene.kind === 'wait' && who.spot === sc.spot && atPlace(who, who.scene), `sat down on the seat they were going to (${who.scene?.kind}, arrived ${who.scene?.arrived})`);
  run(sim, 5); assert.equal(who.act, 'sit'); assert.equal(sim.spots.claimOf(who), sc.spot);
  who.stayUntil = sim.t - 1;                                                                                       // the doctor has seen them
  run(sim, 4);
  assert.ok(!who.away && who.scene == null && who.sitH == null && who.mode === 'walk', `up out of the chair and walking (${who.mode}, seated ${who.sitH})`);
  assert.equal(sim.spots.claimOf(who), null, 'the seat is free again');
  run(sim, 30); assert.ok(!who.away && sim.lotAt(who.x, who.z) == null, `out of the door and gone (lot ${sim.lotAt(who.x, who.z)})`);
  assert.equal(sim.faults.length, 0, 'no faults');
});

test('the clinic with the player inside for ten minutes: every visitor who sits down gets up when the stay is over; nobody is stuck in a chair', () => {
  const sim = fresh(10), clinic = sim.lots.clinic; enter(sim, clinic); const gone = new Set(), seen = new Map();
  run(sim, 1);
  for (let t = 0; t < 600; t += 0.1) {
    sim.step(0.1);
    for (const n of sim.homelife.drawn) {
      if (!seen.has(n)) seen.set(n, sim.t);
      if (n.scene.why === 'visit') assert.ok(sim.t < n.stayUntil + 20, `${n.id} (${n.scene.kind}) stays in the chair ${(sim.t - n.stayUntil).toFixed(0)} s after the stay is over`);
    }
    for (const [n] of seen) if (!n.scene && !n.away && n.mode === 'walk' && !gone.has(n)) { gone.add(n); assert.equal(n.sitH, null, `${n.id} is up out of the chair when they walk`); }
  }
  assert.ok(seen.size >= 4, `${seen.size} people were in the clinic`);
  assert.ok(gone.size >= 2, `${gone.size} people got up and walked out`);
  assert.equal(sim.faults.length, 0, 'no faults');
});

/** The player in the street, two steps out from the door and two and a half to one side, looking in at the building: nobody who comes out of the door has to walk round them. */
const stoop = (sim, lot) => {
  const e = doorOf(sim, lot), dx = e.outside.x - e.inside.x, dz = e.outside.z - e.inside.z, l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l;
  sim.setPlayer(e.outside.x + nx * 2 - nz * 2.5, e.outside.y, e.outside.z + nz * 2 + nx * 2.5, 0); return e;
};

/** Somebody drawn on seat `spot` of building `lot` as `kind` (the scene homelife.draw makes, on that very anchor); their stay is not over. */
function seatedOn(sim, lot, spot, kind, why, used) {
  const who = sim.npcs.find((n) => !n.away && !used.has(n) && n.age === 'adult' && n.routine !== 'shopkeeper' && !sim.lotAt(n.x, n.z) && !sim.homelife.drawn.has(n));
  assert.ok(who, 'somebody to sit down'); used.add(who);
  sim.brain.finish(who); sim.brain.hideAway(who, lot, why);
  const sc = sim.homelife.sceneOf(who, lot, why, kind, spot, 'seat:' + spot.id);
  sim.homelife.choose = () => sc; who.stayUntil = sim.t + 1e9;
  const drawn = sim.homelife.draw(who, lot, sim.hour, true);
  delete sim.homelife.choose;                                                                                       // (the override is for this one person)
  assert.ok(drawn && sim.homelife.drawn.has(who) && who.sitH != null && atPlace(who, who.scene), `${who.id} sits on ${spot.id} (drawn ${drawn}, seated ${who.sitH})`);
  return who;
}

test('getting up: from each seat of the waiting room, the hall, the chapel and a sample of the homes, the person walks out of the door and is not shut in the outline of the furniture', () => {
  const sim = fresh(10), used = new Set(), cases = [], at = (lot, f) => sim.spots.all.filter((a) => a.src === 'anchor' && a.building === lot && f(a));
  for (const [lot, kind, why, f] of [[sim.lots.clinic, 'wait', 'visit', (a) => a.kind === 'sit' && a.tagSet.has('waiting')], [sim.lots.hall, 'meet', 'visit', (a) => a.kind === 'sit' && !['terrace', 'patio', 'balcony'].includes(roomOf(a).type)], [sim.lots.chapel, 'pew', 'visit', (a) => a.kind === 'sit' && a.tagSet.has('pray')]]) {
    const e = doorOf(sim, lot); if (!e) continue;
    for (const s of at(lot, f).filter((a) => Math.abs(a.y - e.inside.y) < 0.6).slice(0, kind === 'wait' ? 6 : 3)) cases.push({ lot, kind, why, s });
  }
  for (const l of plan.lots.filter((x) => ['house', 'rowhouse'].includes(x.kind)).slice(0, 3)) {
    const e = doorOf(sim, l.id); if (!e) continue;
    for (const [kind, f] of [['tv', (a) => a.kind === 'tv'], ['eat', (a) => a.kind === 'sit' && ['dining', 'kitchen'].includes(roomOf(a).type)]]) for (const s of at(l.id, f).filter((a) => Math.abs(a.y - e.inside.y) < 0.6).slice(0, 1)) cases.push({ lot: l.id, kind, why: 'home', s });
  }
  assert.ok(cases.length >= 10, `${cases.length} seats to get up from`);
  const stuck = [];
  for (const { lot, kind, why, s } of cases) {
    stoop(sim, lot);
    const who = seatedOn(sim, lot, s, kind, why, used), u0 = who.unstuckCount ?? 0, st0 = who.stuckTotal ?? 0;
    run(sim, 1);
    who.stayUntil = sim.t - 1;                                                                                     // the stay is over
    let gone = false;
    for (let t = 0; t < 40 && !gone && !who.away; t += 0.1) { sim.step(0.1); gone = who.scene == null && sim.lotAt(who.x, who.z) == null; }
    if (!gone || (who.unstuckCount ?? 0) > u0 || (who.stuckTotal ?? 0) - st0 > 1) stuck.push(`${who.id} from ${s.id} (${kind}, ${roomOf(s).type} of ${lot}): out ${gone}${who.away ? ' (out of sight)' : ''}, unstuck ${(who.unstuckCount ?? 0) - u0}, stuck ${((who.stuckTotal ?? 0) - st0).toFixed(1)} s`);
    sim.homelife.drawn.delete(who); sim.brain.finish(who);
  }
  assert.deepEqual(stuck, [], 'people shut in the furniture they got up from, or never out');
  assert.equal(sim.faults.length, 0, 'no faults');
});

test('somebody upstairs whose stay is over is not left at the window of a player in the street: out of sight at once, out of the door after the stairs', () => {
  const sim = fresh(10), clinic = sim.lots.clinic; run(sim, 5);
  const up = [...sim.homelife.drawn].find((n) => n.scene.spot.y > 2.5 && n.scene.why === 'visit');
  assert.ok(up, 'somebody sits in the first-floor waiting room, seen from the plaza');
  up.stayUntil = sim.t - 1;                                                                                          // their time is up
  run(sim, 2);
  assert.equal(sim.homelife.drawn.has(up), false, 'they are not left at the window, nor drawn there again');
  assert.ok(up.away && up.inLot === clinic && !up.emerging, 'on the stairs: out of sight, in the building');
  run(sim, 40);
  assert.ok(!up.away && sim.lotAt(up.x, up.z) !== clinic, `down the stairs and out: away=${up.away} lot=${sim.lotAt(up.x, up.z)}`);
  assert.equal(sim.faults.length, 0);
});

test('somebody upstairs whose stay is over, with the player up there too, does not vanish in front of them: they stay as they are until the player goes', () => {
  const sim = fresh(10), clinic = sim.lots.clinic; run(sim, 5);
  const up = [...sim.homelife.drawn].find((n) => n.scene.spot.y > 2.5 && n.scene.why === 'visit');
  assert.ok(up, 'somebody sits in the first-floor waiting room, seen from the plaza');
  const spot = up.scene.spot; lookAt(sim, spot); run(sim, 1);                                                        // the player goes up and stands where they sit
  assert.equal(sim.lotAt(sim.player.x, sim.player.z), clinic, 'the player is in the clinic');
  up.stayUntil = sim.t - 1; run(sim, 6);
  assert.ok(sim.homelife.drawn.has(up) && !up.away && up.scene?.spot === spot, 'their time is up and they are still there with the player');
  assert.ok(atPlace(up, up.scene, 0.1), 'not moved an inch');
  elsewhere(sim); run(sim, 1);
  assert.ok(up.away && up.inLot === clinic && !sim.homelife.drawn.has(up), 'when the player goes they are out of sight');
  run(sim, 40);
  assert.ok(!up.away && sim.lotAt(up.x, up.z) !== clinic, `and out of the door: away=${up.away} lot=${sim.lotAt(up.x, up.z)}`);
  assert.equal(sim.faults.length, 0);
});

test('bed time in the clinic is not bed time: the nurse who is off duty and the visitor at night walk out, they do not wait for a bed that is not there', () => {
  const sim = fresh(10), clinic = sim.lots.clinic; enter(sim, clinic); run(sim, 5);
  const folk = () => sim.npcs.filter((n) => n.homeLotId !== clinic && ((n.scene?.lot === clinic) || (n.away && n.inLot === clinic) || (!n.away && sim.lotAt(n.x, n.z) === clinic)));
  assert.ok(folk().length >= 3 && folk().some((n) => n.persona === 'enfermera') && folk().some((n) => n.scene?.why === 'visit'), `nurses and patients are in the clinic at ten: ${folk().map((n) => n.id)}`);
  ctx.hour = 23.6; run(sim, 200);
  assert.deepEqual(folk().map((n) => `${n.id}:${n.scene?.kind ?? n.awayWhy}`), [], 'at 23:40 the clinic is empty');
  assert.equal(sim.faults.length, 0);
});

// ---- the places of work ------------------------------------------------------------------------------------------------------------------------------------
test('the clinic: the nurses are at their posts in the day, the waiting room has its patients, and the nurses are not two of one character side by side', () => {
  const sim = fresh(10), clinic = sim.lots.clinic, nurses = sim.npcs.filter((n) => n.persona === 'enfermera');
  assert.ok(nurses.length >= 2 && isTwin(nurses[0], nurses[1]), 'two nurses of one character (the case that needs the rule)');
  run(sim, 5);
  const sc = sim.homelife.choose(nurses[0], clinic, 'work', 10); assert.ok(sc && ['nurse', 'nurse2'].includes(sc.kind) && fits(sc) === null, `a nurse's post: ${sc?.kind}`);
  lookAt(sim, sc.spot); run(sim, 1);
  const at = sim.homelife.drawn; const posts = [...at].filter((n) => n.persona === 'enfermera');
  assert.ok(posts.length >= 1 && posts.every((n) => n.scene.why === 'work' && n.act === 'idle'), 'a nurse is at her post');
  if (posts.length > 1) assert.ok(Math.hypot(posts[0].x - posts[1].x, posts[0].z - posts[1].z) >= TWIN_R, 'and the other, if she is drawn, is not beside her');
  const patients = [...at].filter((n) => n.scene.why === 'visit');
  assert.ok(patients.length >= 1 && patients.every((n) => n.scene.kind === 'wait' && n.spot.tagSet.has('waiting') && n.sitH != null), 'patients sit in the waiting rows');
  for (const a of at) for (const b of at) if (a !== b && isTwin(a, b)) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= TWIN_R || Math.abs(a.y - b.y) > 2.5, `${a.id}/${b.id}: two of one character ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)} m apart`);
});

test('the workshop: the workman is at his bench in the working day, repairing, and the bench is not a school desk', () => {
  const sim = fresh(12.5); run(sim, 20);
  const w = sim.npcs.find((n) => n.persona === 'obrero' && n.away && n.awayWhy === 'work' && lotKind(n.inLot) === 'workshop');
  assert.ok(w, 'the workman is at the workshop');
  const sc = sim.homelife.choose(w, w.inLot, 'work', 12.5); assert.ok(sc && sc.kind === 'bench' && fits(sc) === null, 'a bench');
  lookAt(sim, sc.spot); run(sim, 1);
  assert.ok(!w.away && w.act === 'repair' && w.spot.kind === 'work' && !w.spot.tagSet.has('school') && roomOf(w.spot).type === 'workshop', `at the bench: ${w.act} ${w.spot?.kind}`);
});

test('the hall: the neighbourhood board meets in the evening, in the hall itself and seated, and the room is empty again later', () => {
  const sim = fresh(18.4), hall = sim.lots.hall; assert.ok(hall, 'a hall');
  const e = enter(sim, hall); const members = new Map();
  play(sim, 18.4, 300, (s) => { for (const n of s.homelife.drawn) if (n.scene.lot === hall && !members.has(n)) members.set(n, { why: n.scene.why, kind: n.scene.kind, room: roomOf(n.scene.spot).type, fit: fits(n.scene), routine: n.routine }); });
  assert.ok(members.size >= 3, `${members.size} came to the meeting`);
  for (const [n, m] of members) assert.ok(m.why === 'visit' && m.kind === 'meet' && m.room === 'hall' && m.fit === null && m.routine !== 'kid' && m.routine !== 'teen', `${n.id} (${m.routine}) is a member of the board: ${JSON.stringify(m)}`);
  assert.ok(HALL_MEETING[0] > 17 && HALL_MEETING[1] < 22, 'in the evening');
  const sim2 = fresh(21.5); enter(sim2, sim2.lots.hall); run(sim2, 120);
  assert.equal(sim2.homelife.drawn.size, 0, 'nobody is in the hall at 21:30');
  assert.ok(sim2.npcs.every((n) => n.inLot !== hall && sim2.lotAt(n.x, n.z) !== hall), 'nobody at all');
  void e;
});

test('the chapel has people in it through the day: somebody is praying at the altar or sitting on a pew for most of the morning', () => {
  const sim = fresh(6), chapel = sim.lots.chapel; let samples = 0, occupied = 0; const seen = new Set(), kinds = new Set();
  play(sim, 6, 480, (s) => {
    samples++;
    const inside = s.npcs.filter((n) => (n.away && n.inLot === chapel) || (!n.away && s.lotAt(n.x, n.z) === chapel));
    if (inside.length) occupied++;
  });
  assert.ok(occupied / samples >= 0.4, `the chapel has somebody in it ${occupied} of ${samples} times`);
  // and they are drawn on the altar or the pews when the player comes (the visit is staged: six people come to pray, as the devout do at mass time)
  const sim2 = fresh(10), pray = sim2.npcs.filter((m) => m.routine !== 'shopkeeper' && !m.away && blockAt(m, 10) === 'free').slice(0, 6);       // (people with nowhere to be at ten: a visit ends when work or school begins)
  assert.equal(pray.length, 6, 'six people with the morning free');
  for (const n of pray) assert.ok(sim2.brain.do_pray(n, { instant: true }), `${n.id} goes to the chapel`);
  for (const n of pray) {
    assert.ok(n.away && n.inLot === chapel && n.awayWhy === 'visit', `${n.id} is in the chapel`);
    n.stayUntil = sim2.t + 600;
    const sc = sim2.homelife.choose(n, chapel, 'visit', ctx.hour); assert.ok(sc && ['altar', 'pew'].includes(sc.kind) && fits(sc) === null, `${n.id}: ${sc?.kind}`);
    lookAt(sim2, sc.spot); run(sim2, 1); assert.ok(!n.away && (n.act === 'pray' || (n.act === 'sit' && n.sitH != null)), `${n.id} prays or sits on a pew (${n.act})`); kinds.add(sc.kind); seen.add(n.id);
    elsewhere(sim2); run(sim2, 1); assert.ok(n.away && n.inLot === chapel, `${n.id} is hidden in the chapel again`);
  }
  assert.equal(seen.size, 6, `six were drawn in the chapel (${[...kinds]})`);
});

// ---- the shape of the day -----------------------------------------------------------------------------------------------------------------------------------
test('the barrio keeps its street life: at home in the morning, at lunch and at supper a fair share of the residents is indoors, and at every hour the streets are not empty', () => {
  const want = { 8: [6, 14], 12.5: [8, 22], 15: [6, 18], 19.3: [12, 30] };            // residents of a house, hidden at home: [least, most] (cold start + 90 s)
  for (const hour of [8, 12.5, 15, 19.3]) {
    const sim = fresh(hour); run(sim, 90);
    let home = 0, out = 0, drawnIn = 0;
    for (const n of sim.npcs) {
      if (n.routine === 'shopkeeper') continue;
      if (n.away && (n.awayWhy === 'home' || n.awayWhy === 'sleep')) home++;
      else if (!n.away && !sim.lotAt(n.x, n.z)) out++;
      else if (!n.away) drawnIn++;
    }
    assert.ok(home >= want[hour][0] && home <= want[hour][1], `${home} residents are at home at ${hour} (${want[hour]})`);
    assert.ok(out >= 12, `${out} people on the street at ${hour} (and ${drawnIn} drawn indoors)`);
  }
});

test('the tables: who goes home, to the clinic and to the hall, and when; what is done at home at each hour', () => {
  const kid = { routine: 'kid', age: 'kid', gender: 'm', homeLotId: 'L1' }, home = { routine: 'homemaker', age: 'adult', gender: 'f', homeLotId: 'L1' }, keeper = { routine: 'shopkeeper', age: 'adult', gender: 'f', homeLotId: 'L1' };
  const elder = { routine: 'elder', age: 'elder', gender: 'm', homeLotId: 'L1' }, worker = { routine: 'worker', age: 'adult', gender: 'm', homeLotId: 'L1' }, beata = { routine: 'beata', age: 'elder', gender: 'f', homeLotId: 'L1' };
  assert.equal(homeWeight(keeper, 8), 0, 'a shopkeeper lives over the shop; the brain does not send them home');
  assert.equal(homeWeight({ ...home, homeLotId: null }, 8), 0, 'nobody with no home goes home');
  assert.ok(homeWeight(home, 8) > homeWeight(worker, 8) && homeWeight(home, 12.5) > homeWeight(home, 10) && homeWeight(home, 19.3) > homeWeight(home, 15), 'a homemaker is home more than a worker, at lunch and at supper more than between');
  assert.ok(homeWeight(beata, 12.5) < homeWeight(elder, 12.5) / 2, 'the beata is at the chapel, not at home');
  assert.equal(visitWeight(kid, 10, 'clinic'), 0); assert.equal(visitWeight(home, 17, 'clinic'), 0, 'the clinic is shut in the evening');
  assert.ok(visitWeight(elder, 10, 'clinic') > visitWeight(worker, 10, 'clinic'), 'the old go to the doctor');
  assert.ok(visitWeight(elder, (HALL_MEETING[0] + HALL_MEETING[1]) / 2, 'hall') > 0 && visitWeight(elder, 12, 'hall') === 0 && visitWeight(elder, 23, 'hall') === 0 && visitWeight(kid, 19.3, 'hall') === 0, 'the hall is for the meeting, the adults and the old');
  assert.ok(freeChoices(home, 8).some(([a]) => a === 'home') && !freeChoices(keeper, 8).some(([a]) => a === 'home'), 'the free choices carry the stay at home for a homemaker, not for a shopkeeper');
  const kinds = (p, h) => homeActs(p, h).map(([k]) => k);
  assert.ok(kinds(home, 8).includes('cook') && kinds(home, 12.5).includes('eat') && kinds(home, 19.3).includes('tv'), 'cook at breakfast, eat at lunch, television at supper');
  assert.ok(kinds(kid, 16).includes('homework') && !kinds(kid, 23).includes('homework'), 'the child does the homework in the afternoon, not at night');
  assert.ok(homeActs(home, 8).find(([k]) => k === 'cook')[1] > homeActs({ ...worker }, 8).find(([k]) => k === 'cook')[1], 'women cook more');
  assert.ok(kinds(elder, 8).includes('pray'), 'the old pray');
});

// ---- the people themselves ---------------------------------------------------------------------------------------------------------------------------------------
test('a sleeper is left to sleep: no chat, and nobody hears a drawer opened beside them; the same person awake does', () => {
  const sim = fresh(2); run(sim, 2);
  const n = sim.npcs.find((m) => m.away && m.awayWhy === 'sleep' && m.inLot && sim.homelife.choose(m, m.inLot, 'sleep', 2));
  const sc = sim.homelife.choose(n, n.inLot, 'sleep', 2); lookAt(sim, sc.spot); run(sim, 1);
  assert.equal(n.act, 'sleep');
  const subs = [], w = { ctx: { player: { lock() {}, unlock() {}, s: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, eyeY: 1.6 }, hour: 2, settings: null, events: { emit() {} }, ui: { subtitle: (s) => subs.push(s), toast() {} } }, t: 100, svc: { t: 100, doors: null }, player: { x: 0, z: 0 }, landmarks: [], syncPlayer() {}, ui: { show() {}, hide() {}, setChoices() {} }, speech: { speak: () => ({}), cancel() {}, estimate: () => 1000 } };
  const talk = new Talk(w); assert.equal(talk.begin(n), false, 'the sleeper is not spoken to'); assert.equal(subs.length, 0);
  const ev = { x: n.st.x, y: n.st.y + 0.8, z: n.st.z + 0.2, building: n.scene.lot };
  assert.equal(sim.reactions.sees(n, ev, { facing: false }), false, 'and does not see the drawer');
  n.act = 'idle'; assert.equal(talk.begin(n), true, 'awake, they are'); talk.leave();
});

test('the lines of the home: eating, television, homework, washing up and the bench have four lines each, in both languages, and the homework is a child\'s', () => {
  for (const k of ['act_eat', 'act_tv', 'act_homework', 'act_wash', 'act_repair']) {
    const pool = BANK.shared[k]; assert.ok(pool?.length >= 4, `${k} has ${pool?.length} lines`);
    for (const [es, en] of pool) assert.ok(es.length > 8 && en.length > 8 && /[.!?]$/.test(es) && /[.!?]$/.test(en), `${k}: "${es}" | "${en}"`);
  }
  for (const [es, en, w] of BANK.shared.act_homework) assert.ok(w?.age?.includes('kid') && w.age.includes('teen') && !w.age.includes('adult'), `homework lines are for the young only: ${es}`);
  assert.ok(BANK.shared.act_eat.some(([, , w]) => w?.to != null) && BANK.shared.act_eat.some(([, , w]) => w?.from != null), 'meals follow the hour');
});

// ---- nothing breaks --------------------------------------------------------------------------------------------------------------------------------------------
test('soak: a player going in and out of twenty homes for eight minutes - nobody in a wall, nobody drawn without a place, no more than the cap indoors, no fault', () => {
  const sim = fresh(18), homes = new Set(['house', 'rowhouse', 'apartments', 'tenement', 'courtyard']);                // (the keeper of a shop stands at the counter: the homes are the ones with people behind the door)
  const lots = [...new Set(sim.npcs.filter((n) => n.homeLotId && homes.has(lotKind(n.homeLotId))).map((n) => n.homeLotId))].slice(0, 20); let peak = 0, drawnTotal = 0;
  assert.equal(lots.length, 20, 'twenty homes to visit');
  play(sim, 18, 480, (s) => {
    const k = Math.floor(s.t / 5) % (lots.length + 4);
    if (k < lots.length) enter(s, lots[k]); else elsewhere(s);
    peak = Math.max(peak, s.homelife.drawn.size); drawnTotal += s.homelife.drawn.size;
    for (const n of s.homelife.drawn) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z), `${n.id} has a position`);
      assert.ok(n.scene && !n.away, `${n.id} is drawn with a scene`);
      if (n.scene.arrived) assert.ok(s.lotAt(n.x, n.z) === n.scene.lot && Math.abs(n.y - n.scene.spot.y) < 0.5, `${n.id} is inside ${n.scene.lot} on the floor of the scene`);
    }
  });
  assert.ok(peak <= MAX_DRAWN, `${peak} drawn at once (cap ${MAX_DRAWN})`); assert.ok(drawnTotal > 0, 'and somebody was seen');
  assert.equal(sim.faults.length, 0, `faults: ${JSON.stringify(sim.faults.slice(0, 2))}`); assert.deepEqual(ctx.errors, [], 'no console errors');
});

// ---- the seat: sofas and armchairs (R3-026) -------------------------------------------------------------------------------------------------------------------
/** A world of one building with one piece, for the arithmetic of slideOf: the building's frame shifts everything by (100, 50), the piece is a sofa `d` m deep with its middle at (3, 2) in it, and the anchor is `off` m from the middle along `ry`. */
function lone(tags = ['seat', 'sofa', 'vinyl'], d = 0.9) {
  const rec = { id: 'f1', name: 'sofa_3_vinyl', tags, x: 3, z: 2, ry: 0, w: 2, d };
  const H = new Homelife({ ctx: { buildings: new Map([['L1', { frame: { toWorld: (x, y, z) => [x + 100, y, z + 50] }, furniture: [rec] }]]) } });
  return { H, anchor: (ry, off = -0.12, item = 'f1') => ({ id: 'a', kind: 'tv', building: 'L1', item, seatH: 0.45, ry, x: 103 + Math.sin(ry) * off, z: 52 + Math.cos(ry) * off }) };
}

test('slideOf: on a sofa 0.9 m deep with the anchor 0.12 m behind its middle an adult slides until the knee is 5 cm past the front and a child as far as 15 cm short of it, whichever way it faces', () => {
  const { H, anchor } = lone(), woman = METAS.get('w_joven'), girl = METAS.get('g_girl');
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.6]) {
    const a = anchor(ry), sw = H.slideOf({ meta: woman }, a, 0.45), sg = H.slideOf({ meta: girl }, a, 0.45);
    assert.ok(Math.abs(sw - 0.267) < 0.003, `the woman (knee 0.353 m from the hip) slides 0.267 m facing ${ry.toFixed(2)}, not ${sw.toFixed(3)}`);
    assert.ok(Math.abs(sg - 0.42) < 1e-9, `the girl (knee 0.162 m) would need 0.458 m: held at 0.42 m, the hip joint 0.15 m short of the front, not ${sg.toFixed(3)}`);
  }
  const deep = lone(['seat', 'armchair', 'fabric'], 1.2), a = deep.anchor(0);
  assert.ok(Math.abs(deep.H.slideOf({ meta: woman }, a, 0.45) - (0.6 + 0.05 + 0.12 - 0.353)) < 0.003, 'a deeper piece: the front is further, the slide longer');
});

test('slideOf: nothing to slide for on a chair, an anchor of nothing, a piece it does not know, a person without legs, or a seat that already has the knee past the front', () => {
  const { H, anchor } = lone(), woman = METAS.get('w_joven'), girl = METAS.get('g_girl'), a = anchor(0);
  const open = lone(['seat', 'chair', 'wood']);
  assert.equal(open.H.slideOf({ meta: woman }, open.anchor(0), 0.45), 0, 'a chair is open under the seat: the shin hangs in the air');
  assert.equal(H.slideOf({ meta: woman }, anchor(0, -0.12, 'nope'), 0.45), 0, 'a piece the building does not have');
  assert.equal(H.slideOf({ meta: woman }, { ...a, item: null }, 0.45), 0, 'an anchor with no piece');
  assert.equal(H.slideOf({ meta: woman }, { ...a, building: 'L9' }, 0.45), 0, 'a building with no furniture');
  assert.equal(H.slideOf({ meta: null }, a, 0.45), 0, 'a person with no meta'); assert.equal(H.slideOf({}, a, 0.45), 0, 'and none');
  assert.equal(H.slideOf({ meta: woman }, anchor(0, 0.30), 0.45), 0, 'an anchor so far forward that her knee is past the front already (0.65 against 0.5)');
  assert.equal(H.slideOf({ meta: girl }, anchor(0, 0.32), 0.45), 0, 'one so far forward that the cushion is gone: the clamp never slides backwards (needs 0.018 m, has -0.02 m)');
  assert.equal(new Homelife({ ctx: {} }).slideOf({ meta: woman }, a, 0.45), 0, 'a world with no buildings');
});

test('R3-026: on every sofa and armchair of the barrio, whoever sits there has the knee past the front of the piece and the hip joint on the cushion; every other seat is left where it is', () => {
  const sim = fresh(13), H = sim.homelife; let soft = 0, slid = 0, open = 0;
  for (const s of sim.spots.all) {
    if (s.src !== 'anchor' || !['sit', 'tv'].includes(s.kind)) continue;
    const p = pieceOf(s); if (!p) continue;
    for (const m of META.people) {
      const sitH = s.seatH ?? 0.45, slide = H.slideOf({ meta: m }, s, sitH), hip = p.hip + slide, knee = hip + kneeReachM(m, sitH);
      if (!p.soft) { assert.equal(slide, 0, `${m.id} on ${p.rec.name} (${s.id}) is not moved`); open++; continue; }
      soft++; if (slide > 0) slid++;
      assert.ok(slide >= 0 && slide < p.rec.d / 2 + 0.2, `${m.id} on ${p.rec.name} (${s.id}) slides ${slide.toFixed(3)} m`);
      assert.ok(knee >= p.front + 0.01, `${m.id} on ${p.rec.name} (${s.id}): the knee is ${knee.toFixed(3)} m from the middle, the front face ${p.front.toFixed(3)} (anchor ${p.hip.toFixed(3)}, slide ${slide.toFixed(3)}): the shin hangs in the cushion`);
      assert.ok(p.front - hip >= 0.149, `${m.id} on ${p.rec.name} (${s.id}): the hip joint is ${(p.front - hip).toFixed(3)} m short of the front: off the cushion`);
    }
  }
  assert.ok(soft >= 300 * META.people.length && open >= 200 * META.people.length, `${soft} sofa and armchair seatings, ${open} others`);
  assert.ok(slid > 0, 'the seats of the barrio need the slide (the anchor is behind the middle of the piece)');
});

test('R3-026, the report: n40 of L94 in front of the television at one o\'clock sat with her shins in the sofa; drawn on each sofa and armchair of her home she sits forward of the anchor with the knee past the front of the piece', () => {
  const sim = fresh(13), lot = 'L94', who = sim.npcs.find((m) => m.id === 'n40');
  assert.equal(who.homeLotId, lot, 'n40 lives in L94');
  const soft = sim.homelife.info(lot).anchors.filter((a) => (a.kind === 'tv' || a.kind === 'sit') && pieceOf(a)?.soft);
  assert.ok(soft.length >= 1, `a sofa or an armchair in her home (${soft.length})`);
  for (const s of soft) {
    sim.brain.finish(who); sim.brain.hideAway(who, lot, 'home'); who.stayUntil = sim.t + 1e9;
    const sc = sim.homelife.sceneOf(who, lot, 'home', s.kind === 'tv' ? 'tv' : 'sit', s, 'n40:' + s.id);
    sim.homelife.choose = () => sc;
    const drawn = sim.homelife.draw(who, lot, 13, true); delete sim.homelife.choose;
    const p = pieceOf(s), hip = (who.x - p.cx) * Math.sin(s.ry) + (who.z - p.cz) * Math.cos(s.ry), knee = hip + kneeReachM(who.meta, who.sitH);
    assert.ok(drawn && who.sitH === 0.45 && who.spot === s, `she sits on ${s.id} (${p.rec.name})`);
    assert.ok(sc.slide > 0.2 && sc.slide < 0.43 && atPlace(who, sc, 1e-6), `forward of the anchor by the scene's slide, ${sc.slide.toFixed(3)} m (she is ${Math.hypot(who.x - s.x, who.z - s.z).toFixed(3)} m from it)`);
    assert.ok(Math.abs(hip - (p.hip + sc.slide)) < 1e-6 && knee >= p.front + 0.04, `${p.rec.name}: her knee is ${knee.toFixed(3)} m from the middle of the piece, the front face is at ${p.front.toFixed(3)} (hip ${hip.toFixed(3)}; the anchor had it at ${p.hip.toFixed(3)})`);
    assert.equal(sim.lotAt(who.x, who.z), lot, 'still inside her home');
    sim.homelife.drawn.delete(who); sim.brain.finish(who);
  }
  assert.equal(sim.faults.length, 0, 'no faults');
});
