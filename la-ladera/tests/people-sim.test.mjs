// The day of the barrio under Node (no browser): the schedule, the shopkeepers behind their counters, the children at school and then on the court, the walk through
// every shop and chapel door with the real physics, a person never standing in a wall or stuck, and the guard for the 16:33 console error (the brain reached a member
// the world did not have). Every check here has a seeded fault or a mutant that turns it red.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim, keeperFacing } from '../js/people/sim.js';
import { Brain, EXIT_GAP, POST_PHONE, POST_PHONES } from '../js/people/brain.js';
import { Spots } from '../js/people/spots.js';
import { Indoor } from '../js/people/indoor.js';
import { NavGraph } from '../js/people/nav.js';
import { BODY, Npc } from '../js/people/npc.js';
import { awake, blockAt, curfewH, freeChoices, keeperBedH, SCHOOL, SHOP_HOURS, shopOpen, shopWindow } from '../js/people/schedule.js';
import { makeVariant, slotRatio, skinShade } from '../js/people/look.js';
import { makeRng } from '../js/core/rng.js';
import { Physics, wallsRect } from '../js/core/physics.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (f) => readFileSync(resolve(ROOT, 'js/people', f), 'utf8');
const { ctx, plan } = await buildData({ furnish: true, colliders: true });
const META = await readAssetJson('people/people_meta.json');
const METAS = new Map(META.people.map((m) => [m.id, m]));
const ph = ctx.physics;
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d <= -Math.PI) d += 2 * Math.PI; return d; };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Console watcher: everything the page would show as an error or a warning. */
function spy() {
  const log = [], ce = console.error, cw = console.warn;
  console.error = (...a) => { log.push('error: ' + a.join(' ')); }; console.warn = (...a) => { log.push('warn: ' + a.join(' ')); };
  return { log, stop() { console.error = ce; console.warn = cw; } };
}
/** A fresh barrio at `hour`: every door closed, nobody has been simulated, the player at the arrival point. */
function fresh(hour) {
  for (const [id] of ph.doors) ph.setDoor(id, false);
  ctx.hour = hour; ctx.errors = [];
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(METAS), 'the cast is built');
  const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0);
  return sim;
}
function run(sim, secs, dt = 0.05, each = null) { for (let t = 0; t < secs; t += dt) { sim.step(dt); each?.(sim); } }

// ---- the brain, the walker and the world agree on what the world has ---------------------------------------------------------------------------
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
/** Names `src` reaches on its world through one of `aliases` (W.x, this.w.x ...); `w.x?.y` is guarded and not counted. */
export function usedMembers(src, aliases) {
  const out = new Set(), re = new RegExp(`\\b(?:${aliases.join('|')})\\.([A-Za-z_$][\\w$]*)(?![\\w$])(?!\\s*\\?\\.)`, 'g');
  for (const m of strip(src).matchAll(re)) out.add(m[1]);
  return out;
}
/** Names a class body defines: this.x = ..., methods, getters. */
export function definedMembers(src) {
  const s = strip(src), out = new Set();
  for (const m of s.matchAll(/\bthis\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\+=|\?\?=|\|\|=)/g)) out.add(m[1]);
  for (const m of s.matchAll(/^ {2}(?:async |static |get |set )*([A-Za-z_$][\w$]*)\s*\(/gm)) out.add(m[1]);
  return out;
}

test('contract: everything the brain, the walker, the doors and the indoor router reach on the world, the world has', () => {
  const worldSrc = SRC('world.js'), onSim = /extends\s+PeopleSim/.test(worldSrc);
  const sides = onSim ? [SRC('sim.js'), worldSrc] : [worldSrc];
  const brainFile = (onSim ? SRC('sim.js') : worldSrc).match(/from '\.\/(brain\w*\.js)'/)?.[1];
  assert.ok(brainFile, 'the world (or the sim) imports a brain');
  const have = new Set(sides.flatMap((s) => [...definedMembers(s)]));
  const clients = [[brainFile, ['W', 'this\\.w']], ['npc.js', ['w']]];
  if (onSim) clients.push(['doors.js', ['this\\.w']], ['indoor.js', ['this\\.w']], ['reactions.js', ['this\\.s', 's']], ['classroom.js', ['W', 'this\\.w']]);
  for (const [file, aliases] of clients) {
    const missing = [...usedMembers(SRC(file), aliases)].filter((k) => !have.has(k));
    assert.deepEqual(missing, [], `${file} reaches ${missing.join(', ')} on the world, which has no such member (the 16:33 console error: Brain.finish -> undefined.release)`);
  }
});

test('contract check: it names a member the world lacks (seeded fault)', () => {
  const brain = 'class B { finish(npc) { const W = this.w; W.spots.release(npc); W.doors?.update(); this.w.byId.get(1); } }';
  const world = 'class Wd { constructor() { this.byId = new Map(); } update() {} }';
  const missing = [...usedMembers(brain, ['W', 'this\\.w'])].filter((k) => !definedMembers(world).has(k));
  assert.deepEqual(missing, ['spots'], 'W.spots is missing; the guarded W.doors?. is not counted; byId exists');
});

// ---- the places ----------------------------------------------------------------------------------------------------------------------------------
test('Spots: releasing what is not held does nothing; a claim is released once and a second claim moves the person', () => {
  const S = new Spots({ plan: { lots: [], pois: [{ id: 'b1', kind: 'bench', x: 0, y: 0, z: 0 }, { id: 'b2', kind: 'bench', x: 5, y: 0, z: 0 }] }, anchors: [], buildings: new Map() });
  const [b1, b2] = S.list('bench'), a = { id: 'a' }, ghost = { id: 'ghost' };
  assert.doesNotThrow(() => S.release(ghost), 'releasing a claim nobody holds is a no-op, not a throw in the frame loop');
  S.claim(b1, a); assert.equal(S.free(b1), false); assert.equal(S.claimOf(a), b1);
  S.release(a); assert.equal(S.free(b1), true); assert.equal(S.claimOf(a), null);
  assert.doesNotThrow(() => S.release(a), 'a second release is a no-op');
  S.claim(b1, a); S.claim(b2, a);
  assert.equal(S.free(b1), true, 'claiming another spot frees the first'); assert.equal(S.free(b2), false);
});

test('the day: shops open and shut with their hours, a keeper whose shop has shut is up until bed time and in bed after it, children are at school in the morning and free in the afternoon, everybody sleeps at 3', () => {
  for (const [bank, [open]] of Object.entries(SHOP_HOURS)) {
    for (const jit of [[0, 0, 0], [0.5, 0.5, 0.5], [0.999, 0.999, 0.999]]) for (const u of [0, 0.5, 0.999]) {
      const keeper = { routine: 'shopkeeper', bank, jit, riseH: 6 }; keeper.bedH = keeperBedH(keeper, u);
      const shut = shopWindow(keeper)[1], who = `${bank} (offsets ${jit[0]}, bed ${u})`;
      assert.equal(blockAt(keeper, open + 1), 'work', `${who} works an hour after it opens`);
      assert.equal(blockAt(keeper, shut + 0.2), 'free', `${who}: the shop has shut and the keeper is up and about, not asleep`);
      assert.ok(keeper.bedH >= shut + 0.5, `${who} goes to bed (${keeper.bedH.toFixed(2)}) after the shop has shut (${shut.toFixed(2)})`);
      assert.equal(blockAt(keeper, keeper.bedH + 0.05), 'sleep', `${who} sleeps once it is bed time`);
      assert.equal(blockAt(keeper, 3), 'sleep', `${who} sleeps at 3`);
      if (bank === 'panaderia') assert.ok(keeper.bedH < 21.5, `the baker gets up in the small hours and goes to bed early (${keeper.bedH.toFixed(2)})`);
      else assert.ok(keeper.bedH >= 21.6, `${who}: nobody but the baker is in bed before half past nine (${keeper.bedH.toFixed(2)})`);
    }
  }
  const barber = { routine: 'shopkeeper', bank: 'peluqueria', jit: [0.5, 0.5, 0.5], riseH: 6, bedH: 22 };
  assert.equal(blockAt(barber, 5), 'sleep', 'a keeper is in bed before getting up'); assert.equal(blockAt(barber, 7.5), 'free', 'up before the shop opens at 8:36');
  for (const routine of ['kid', 'teen']) {
    const c = { routine, persona: routine === 'kid' ? 'nino' : 'adolescente', jit: [0.5, 0.5, 0.5], riseH: 6, bedH: 21 };
    assert.equal(blockAt(c, 10), 'school', `${routine} at 10:00`);
    assert.equal(blockAt(c, SCHOOL.end + 1), 'free', `${routine} an hour after school`);
    assert.equal(blockAt(c, 16), 'free', `${routine} at 16:00`);
    assert.equal(blockAt(c, 3), 'sleep', `${routine} at 3:00`);
  }
});

// ---- shopkeepers -----------------------------------------------------------------------------------------------------------------------------------
test('shopkeepers: at noon every shop is open and its keeper stands at the post on flat floor, inside, facing the customers (the door, where they lie behind him) and never with his back to the door; few posts are sealed in', () => {
  const sim = fresh(12); run(sim, 6);
  const shopLots = plan.lots.filter((l) => l.shop);                                    // (counted from the plan: the plan grows, the number of shops with it)
  assert.ok(shopLots.length >= 15, `${shopLots.length} shop lots in the plan`);
  assert.equal(sim.shops.size, shopLots.length, 'every shop lot has a post for its keeper');
  let sealed = 0;
  for (const shop of sim.shops.values()) {
    const k = sim.byId.get(shop.keeper);
    assert.ok(shop.open && k, `${shop.name} (${shop.lot}) is open with a keeper`);
    assert.ok(!k.away, `${shop.lot}: the keeper is visible`);
    assert.ok(dist2(k, shop.post) < 1.3 && Math.abs(k.y - shop.post.y) < 0.4, `${shop.lot}: the keeper (${k.x.toFixed(1)}, ${k.z.toFixed(1)}) is at the post (${shop.post.x.toFixed(1)}, ${shop.post.z.toFixed(1)})`);
    assert.equal(sim.lotAt(k.x, k.z), shop.lot, `${shop.lot}: the keeper is inside his shop`);
    const hs = ph.heightsAt(shop.post.x, shop.post.z), fy = shop.ent.inside.y;       // (measured here, not with the code under test)
    assert.ok(hs.some((h) => Math.abs(h - fy) <= 0.12) && !hs.some((h) => h > fy + 0.12 && h < fy + 1.85), `${shop.lot}: the post is on flat floor, not in a stairwell or under a ramp (surfaces ${hs.map((h) => h.toFixed(2))})`);
    assert.ok(Math.abs(angDiff(k.ry, shop.post.ry)) < 0.7, `${shop.lot}: the keeper faces ${shop.post.ry.toFixed(2)}, not ${k.ry.toFixed(2)}`);
    const c = shop.cust[0], door = shop.ent.inside, toDoor = Math.atan2(door.x - shop.post.x, door.z - shop.post.z);
    if (c) {
      const d = dist2(shop.post, c), toC = Math.atan2(c.x - shop.post.x, c.z - shop.post.z);
      assert.ok(d >= 1.0 && d <= 3.6, `${shop.lot}: the post is ${d.toFixed(1)} m from the first customer spot (across a counter)`);
      // (R3-103) the customers' spot lies behind a keeper who faces the door in 5 shops (the counter stands against the wall, so he waits on its customer side; the stall faces the back wall): there the door wins
      assert.ok(Math.abs(angDiff(toDoor, toC)) > 1.9 || Math.abs(angDiff(toC, shop.post.ry)) < 1.0, `${shop.lot}: the post faces the customers`);
    }
    if (dist2(shop.post, door) >= 0.6) assert.ok(Math.abs(angDiff(toDoor, shop.post.ry)) <= 1.0, `${shop.lot}: the post faces the door within 57 degrees, not away from it or side-on (${Math.abs(angDiff(toDoor, shop.post.ry)).toFixed(2)} rad off): R3-103`);
    if (shop.sealed) sealed++;
  }
  assert.ok(sealed <= Math.ceil(sim.shops.size * 0.4), `${sealed} of ${sim.shops.size} posts are sealed in by furniture (the keeper never leaves them); more means the interiors changed`);
});

// R3-204: the cook of L14 (Corrientazo Doña Lucía) stood in the middle of her counter with only her head above the top. Tables stand up to that counter, so its customer spot is 1.35 m from it and
// "1.7 m beyond the customer" is inside it; the colliders are the OUTLINES of the footprints, the middle of a 0.65 m counter is 0.33 m from both long edges, so the physics called it free and the
// sealed-post rule took it for "a slot behind the counter".
test('shopkeepers (R3-204): no keeper stands inside a piece of furniture: the post and the keeper are outside every footprint on their storey, measured from the colliders', () => {
  const sim = fresh(12); run(sim, 6);
  const inBox = (bp, p) => {                                                           // the footprints as the colliders have them: 4 walls with one id, in the keeper's storey
    const boxes = new Map();
    for (const w of bp.colliders?.walls ?? []) if (w.furniture && w.y0 <= p.y + 0.12 && w.y1 > p.y + 0.1) (boxes.get(w.id) ?? boxes.set(w.id, []).get(w.id)).push([w.x1, w.z1]);
    return [...boxes].filter(([, pts]) => Physics.inside(pts, p.x, p.z)).map(([id]) => id);
  };
  let boxes = 0;
  for (const shop of sim.shops.values()) {
    const bp = ctx.buildings.get(shop.lot), k = sim.byId.get(shop.keeper); boxes += (bp.colliders?.walls ?? []).filter((w) => w.furniture).length;
    assert.deepEqual(inBox(bp, shop.post), [], `${shop.name} (${shop.lot}): the post (${shop.post.x.toFixed(2)}, ${shop.post.z.toFixed(2)}) is inside a piece of furniture`);
    assert.deepEqual(inBox(bp, k), [], `${shop.name} (${shop.lot}): the keeper stands inside a piece of furniture`);
  }
  assert.ok(boxes > 100, `${boxes} furniture colliders seen: the measure has something to measure`);
  const l14 = sim.shops.get('L14');
  if (l14) assert.ok(!l14.sealed && Math.hypot(l14.post.x - 11.53, l14.post.z - 94.97) > 1, `L14: the cook is not sealed in her counter (post ${l14.post.x.toFixed(2)}, ${l14.post.z.toFixed(2)})`);
});

test('PeopleSim._inFurniture (R3-204): a footprint is laid as its collider outline is, at any turn: 5 cm inside each corner is in it, 5 cm outside is not; another room\'s footprint, a thing on a table and a thing that does not block do not count', () => {
  const rotY = 0.3, ry = 0.6, w = 2, d = 0.65, at = [1, 0.5], O = [10, 20];                 // the building turned 0.3 rad, the counter 0.6 more
  const rec = (id, room, o = {}) => ({ id, room, kind: 'floor', block: true, x: at[0], z: at[1], ry, w, d, ...o });
  const bp = {
    id: 'X', lot: { y: 0, rotY }, frame: { toWorld: (x, y, z) => [x + O[0], y, z + O[1]], toLocal: (x, y, z) => [x - O[0], y, z - O[1]] }, floors: [{ index: 0, y: 0 }],
    rooms: [{ id: 'X.f0.r1', floor: 0, rect: { x0: -5, x1: 5, z0: -5, z1: 5 } }],
    furniture: [rec('a', 'X.f0.r1'), rec('b', 'X.f0.r2', { x: -3, z: -3 }), rec('c', 'X.f0.r1', { x: -2, z: 2, kind: 'top' }), rec('e', 'X.f0.r1', { x: -2, z: -2, block: false })],
  };
  const sim = { ctx: { buildings: new Map([['X', bp]]) }, _roomAt: PeopleSim.prototype._roomAt }, inside = (x, z) => PeopleSim.prototype._inFurniture.call(sim, 'X', x, z, 0);
  const cx = at[0] + O[0], cz = at[1] + O[1], corners = wallsRect(cx, cz, w, d, rotY + ry, 0, 1).map((q) => [q.x1, q.z1]);
  const probe = (px, pz, what) => {                                                  // 5 cm in and 5 cm out along the line from the middle through the point
    const l = Math.hypot(px - cx, pz - cz), ux = (px - cx) / l, uz = (pz - cz) / l;
    assert.equal(inside(px - ux * 0.05, pz - uz * 0.05), true, `5 cm inside ${what} (${px.toFixed(2)}, ${pz.toFixed(2)})`);
    assert.equal(inside(px + ux * 0.05, pz + uz * 0.05), false, `5 cm outside ${what} (${px.toFixed(2)}, ${pz.toFixed(2)})`);
  };
  corners.forEach(([px, pz], i) => { const [qx, qz] = corners[(i + 1) % 4]; probe(px, pz, 'the corner'); probe((px + qx) / 2, (pz + qz) / 2, 'the face (an end of the length, a side)'); });      // (the faces alone tell a wrong turn on the length from one on the depth)
  assert.equal(inside(cx, cz), true, 'the middle');
  for (const [x, z] of [[-3 + O[0], -3 + O[1]], [-2 + O[0], 2 + O[1]], [-2 + O[0], -2 + O[1]]]) assert.equal(inside(x, z), false, `(${x}, ${z}): the other room's piece, the thing on a table and the thing that does not block are not footprints`);
  assert.equal(PeopleSim.prototype._inFurniture.call({ ctx: { buildings: new Map() }, _roomAt: PeopleSim.prototype._roomAt }, 'X', cx, cz, 0), false, 'no plan: no judgement');
});

test('keeperFacing (R3-103): a keeper with his back to the door, or side-on to it, is turned toward it, only as far as it takes; one who faces it is left as he stands; one whose customers lie behind him faces the door', () => {
  const post = { x: 0, z: 0 }, door = { x: 0, z: 4 };                                         // the door straight ahead: yaw 0
  const off = (ry, d = door) => Math.abs(angDiff(ry, Math.atan2(d.x - post.x, d.z - post.z)));
  assert.equal(keeperFacing(0.3, post, door), 0.3, 'facing the door within 55 degrees: as authored');
  assert.equal(keeperFacing(-0.9, post, [door]), -0.9, 'a list of doors works the same');
  const side = keeperFacing(Math.PI / 2, post, door);
  assert.ok(off(side) > 0.9 && off(side) <= 0.961, `side-on is turned to the edge of the cone, not to the door (${off(side).toFixed(3)} rad off)`);
  assert.ok(off(keeperFacing(Math.PI, post, door)) <= 0.961, 'his back to the door: turned to within 55 degrees of it');
  assert.ok(off(keeperFacing(Math.PI, post, door, { x: 0, z: -1.7 })) < 1e-9, 'the customers behind him, against the wall: he faces the door');
  const cust = { x: 1.7, z: -0.3 }, toCust = (ry) => off(ry, cust), face = keeperFacing(Math.atan2(cust.x, cust.z), post, door, cust);       // the customers 100 degrees off the door
  assert.ok(off(face) <= 0.961 && toCust(face) < 1.0, `the customers off to the side: turned only as far as the cone, they stay in front of him (door ${off(face).toFixed(2)}, customers ${toCust(face).toFixed(2)} rad off)`);
  const two = [{ x: 0, z: 4 }, { x: 4, z: 4 }];                                              // the shop's door and the main door: within the cone of both
  for (const ry of [Math.PI / 2, -Math.PI / 2, Math.PI, 2.4]) { const r = keeperFacing(ry, post, two); assert.ok(two.every((d) => off(r, d) <= 0.961), `two doors, from ${ry.toFixed(2)}: ${two.map((d) => off(r, d).toFixed(2))} rad off`); }
  assert.equal(keeperFacing(Math.PI, post, { x: 0, z: 0.4 }), Math.PI, 'a door under 0.6 m away has no direction: as authored');
  assert.equal(keeperFacing(Math.PI, post, null), Math.PI, 'no door inside: as authored');
});

test('shopkeepers: they open on the hour, go out to sweep or lean and come back, and the shop shuts at night', () => {
  const sim = fresh(6.2); const seen = new Set(), out = new Set();
  run(sim, 3960, 0.1, (s) => {
    ctx.hour = 6.2 + s.t / 3600;
    for (const n of s.npcs) if (n.routine === 'shopkeeper' && !n.away) { seen.add(n.act); if (n.mode === 'walk') out.add(n.id); }
  });
  const open = [...sim.shops.values()].filter((s) => s.open).length, all = sim.shops.size;
  assert.ok(open >= Math.ceil(all * 0.5) && open <= Math.floor(all * 0.95), `${open} of ${all} shops are open at 7:18 (the late ones open at 8:00 and 8:36)`);
  assert.ok(seen.has('sell'), 'a keeper sells');
  assert.ok(out.size >= 1, 'a keeper walks (a break at the door, back to the post)');
  const night = fresh(23); run(night, 5);
  assert.equal([...night.shops.values()].filter((s) => s.open).length, 0, 'no shop is open at 23:00');
  assert.ok(night.npcs.filter((n) => n.routine === 'shopkeeper').every((n) => ['sleep', 'home'].includes(indoors(n))), 'the keepers are indoors (in bed, or just not yet)');
});

// R3-211: 9 of the 28 keepers were on their phones in open shops at 07:36 and 6 at 10:30 (a chance in eight per stand, the rest of the day's mix as ever), so half of the openers were "estaba mirando el celular".
test('shopkeepers (R3-211): never more than three are on the phone behind their counters at once, whatever the roll says; with room for another the roll still gives the phone', () => {
  const shops = new Map(), keepers = [];
  const add = (id, act) => { const k = { id, act, shopLotId: 'L' + id, away: false, x: 0, y: 0, z: 0, rng: { next: () => 0.78 + POST_PHONE / 2 }, stand(_w, a) { this.act = a; } }; keepers.push(k); shops.set(k.shopLotId, { keeper: id, post: { x: 0, y: 0, z: 0, ry: 0 } }); return k; };
  for (let i = 0; i < POST_PHONES; i++) add('k' + i, 'phone');
  const brain = new Brain({ shops, npcs: keepers }), me = add('me', 'sell');
  brain.atPost(me, true); assert.equal(me.act, 'wait', `${POST_PHONES} keepers are on the phone already: not a fourth (the roll ${me.rng.next().toFixed(2)} is a phone)`);
  keepers[0].act = 'sell'; brain.atPost(me, true); assert.equal(me.act, 'phone', 'with one of them off it there is room, and the roll is a phone');
  me.act = 'phone'; brain.atPost(me, true); assert.equal(me.act, 'phone', 'a keeper who is on the phone is not counted against himself');
  keepers[1].away = true; keepers[0].act = 'phone'; me.act = 'sell'; brain.atPost(me, true); assert.equal(me.act, 'phone', 'one who is out of sight upstairs is not counted');
  keepers[1].away = false; shops.get('Lk1').keeper = null; me.act = 'sell'; brain.atPost(me, true); assert.equal(me.act, 'phone', 'nor is one whose shop has no keeper at the post (on the phone at home)');
  me.rng = { next: () => 0.6 }; me.act = 'phone'; brain.atPost(me, true); assert.equal(me.act, 'idle', 'a roll that is not a phone is not changed');
});

test('shopkeepers (R3-211): a keeper out on a break at a chat corner counts against the cap too: with three others on the phone he waits, whatever the roll says; anybody who keeps no shop is not held to it', () => {
  const shops = new Map(), npcs = [];
  const add = (id, act, shop = true) => { const k = { id, act, shopLotId: shop ? 'L' + id : null, away: false, st: { x: 0, z: 0 }, rng: { next: () => 0.5, chance: () => true }, stand(_w, a) { this.act = a; } }; npcs.push(k); if (shop) shops.set(k.shopLotId, { keeper: id }); return k; };
  for (let i = 0; i < POST_PHONES; i++) add('k' + i, 'phone');
  const brain = new Brain({ shops, npcs, byId: new Map(npcs.map((k) => [k.id, k])), t: 0 }), spot = { x: 0, z: 0, ry: 0, waiting: null }, me = add('me', 'sell'), walker = add('w', 'idle', false);
  brain.chatHere(me, spot); assert.equal(me.act, 'wait', `${POST_PHONES} keepers are on the phone already: the keeper waiting at the corner does not make a fourth (the chance is a phone)`);
  spot.waiting = null; brain.chatHere(walker, spot); assert.equal(walker.act, 'phone', 'a walker who keeps no shop is not held to it');
  npcs[0].act = 'sell'; spot.waiting = null; brain.chatHere(me, spot); assert.equal(me.act, 'phone', 'with one of them off it there is room, and the chance is a phone');
});

test('shopkeepers (R3-211): over ten minutes of a morning and of an afternoon no more than three are on the phone at any moment, at the counter or out on a break, and the phone is still used', () => {
  for (const [hour, secs] of [[10.5, 240], [15.5, 600]]) {
    const sim = fresh(hour); let max = 0, used = 0;
    run(sim, secs, 0.1, () => { const c = sim.npcs.filter((n) => n.routine === 'shopkeeper' && n.act === 'phone' && !n.away && sim.shops.get(n.shopLotId)?.keeper === n.id).length; max = Math.max(max, c); if (c) used++; });
    assert.ok(max <= POST_PHONES, `${hour} h: ${max} keepers on the phone at once`); assert.ok(used > 0, `${hour} h: somebody still looks at the phone`);
  }
});

/** Why somebody is indoors ('sleep' | 'home' | ...): hidden in the building, or (the player is near) drawn in a room of it; null when out of doors. */
const indoors = (n) => (n.away ? n.awayWhy : n.scene && n.scene.lot === n.homeLotId ? n.scene.why : null);

test('shopkeepers at half past eight: a keeper whose shop has shut is upstairs and up, not asleep; only the baker is in bed (R3-028)', () => {
  const sim = fresh(20.5); run(sim, 5);
  const keepers = sim.npcs.filter((n) => n.routine === 'shopkeeper'), shut = keepers.filter((k) => !shopOpen(k, 20.5)), open = keepers.filter((k) => shopOpen(k, 20.5));
  assert.ok(shut.length >= 8 && open.length >= 2, `${shut.length} shops are shut and ${open.length} are open at 20:30`);
  assert.deepEqual(sim.npcs.filter((n) => indoors(n) === 'sleep' && n.bank !== 'panaderia').map((n) => `${n.id}:${n.bank}`), [], 'nobody is asleep at 20:30 but the baker');
  for (const k of shut) assert.equal(indoors(k), k.bank === 'panaderia' && !awake(k, 20.5) ? 'sleep' : 'home', `${k.id} (${k.bank}): in bed only if it is the baker past bed time, else upstairs and up`);
  for (const k of open) { const shop = sim.shops.get(k.shopLotId); assert.ok(shop?.open && !k.away && dist2(k, shop.post) < 1.3, `${k.id} (${k.bank}) is at the counter of the open shop`); }
});

test('shopkeepers: the shops shut one after another in the evening and the keeper goes upstairs, up and about, not to bed (R3-028)', () => {
  const sim = fresh(18.2); run(sim, 5);
  const keepers = sim.npcs.filter((n) => n.routine === 'shopkeeper'), shuts = keepers.filter((k) => shopOpen(k, 18.2) && !shopOpen(k, 19.3));
  assert.ok(shuts.length >= 6 && shuts.every((k) => !k.away), `${shuts.length} shops are open at 18:12 and shut by 19:18`);
  ctx.hour = 19.3;
  sim.brain.closeShop(shuts[0]);                                       // (the shop shuts: the keeper at the counter goes straight up, hidden as up and about at once, before any tick could set the label right)
  assert.ok(shuts[0].away && shuts[0].awayWhy === 'home' && shuts[0].block === 'free', `up and about, not asleep: ${shuts[0].awayWhy}/${shuts[0].block}`);
  run(sim, 3);                                                         // (the others are still at the counter, standing there: the clock sends each up at once)
  assert.deepEqual(shuts.filter((k) => indoors(k) !== 'home').map((k) => `${k.id}:${indoors(k) ?? 'out'}`), [], 'the keepers are upstairs and up three seconds after the shops shut');
  run(sim, 90);                                                        // (and they stay so)
  for (const k of shuts) { assert.equal(indoors(k), 'home', `${k.id} (${k.bank}) is upstairs and up`); assert.ok(!sim.shops.get(k.shopLotId).open, `${k.id}: the shop is shut`); }
  assert.deepEqual(sim.npcs.filter((n) => indoors(n) === 'sleep').map((n) => n.id), [], 'nobody is asleep at 19:18');
});

test('shopkeepers: bed time comes while they are upstairs, the clock put back gets them up again, and the shop opens in the morning (nobody is left indoors for ever)', () => {
  const sim = fresh(19.6); run(sim, 5);
  const keepers = sim.npcs.filter((n) => n.routine === 'shopkeeper');
  assert.ok(keepers.some((k) => indoors(k) === 'home'), 'some keepers are upstairs and up at 19:36');
  ctx.hour = 23.9; run(sim, 90);                                       // (whoever was out on an errand has time to walk home)
  assert.ok(keepers.every((k) => indoors(k) === 'sleep'), `all are in bed at 23:54: ${keepers.filter((k) => indoors(k) !== 'sleep').map((k) => `${k.id}:${indoors(k) ?? 'out'}`)}`);
  ctx.hour = 20.5; run(sim, 40);
  for (const k of keepers) assert.equal(shopOpen(k, 20.5) ? (k.away ? 'away' : 'at the post') : indoors(k), shopOpen(k, 20.5) ? 'at the post' : k.bank === 'panaderia' && !awake(k, 20.5) ? 'sleep' : 'home', `${k.id} (${k.bank}) when the clock is put back to 20:30`);
  for (const [h, label] of [[12, 'noon'], [23.9, 'the night'], [8.8, 'the morning']]) {
    ctx.hour = h; run(sim, 40);                                        // (one drawn upstairs by the player's being near goes down the stairs first)
    assert.deepEqual(keepers.filter((k) => k.away && k.emerging).map((k) => k.id), [], `nobody is left half out of the door at ${label}`);
    if (h === 23.9) continue;
    for (const k of keepers.filter((m) => shopOpen(m, h))) assert.ok(sim.shops.get(k.shopLotId)?.open && !k.away, `${k.id} (${k.bank}) is up and its shop is open at ${label}`);       // (at the counter, or out at the door for a minute)
  }
});

// ---- children ---------------------------------------------------------------------------------------------------------------------------------------
test('children: in school at 10:00, on the street and the court in the afternoon', () => {
  const morning = fresh(10); run(morning, 3);
  const kids = morning.npcs.filter((n) => n.routine === 'kid' || n.routine === 'teen');
  assert.ok(kids.length >= 12, `${kids.length} children and teens`);
  assert.ok(kids.every((n) => n.away && n.awayWhy === 'school'), `at 10:00: ${kids.filter((n) => !(n.away && n.awayWhy === 'school')).map((n) => n.id).join(', ') || 'none'} not in school`);
  const pm = fresh(16);
  const court = pm.spots.list('play').filter((s) => s.src === 'poi'); assert.ok(court.length, 'the plan has a court');
  const cx = court.reduce((a, s) => a + s.x, 0) / court.length, cz = court.reduce((a, s) => a + s.z, 0) / court.length;
  let most = 0, total = 0, samples = 0; const acts = new Set();
  run(pm, 300, 0.1, (s) => {
    if (Math.round(s.t * 10) % 100) return;
    const near = s.npcs.filter((n) => (n.routine === 'kid') && !n.away && Math.hypot(n.x - cx, n.z - cz) < 16);
    most = Math.max(most, near.length); total += near.length; samples++; for (const n of near) acts.add(n.act);
  });
  const kidsNow = pm.npcs.filter((n) => n.routine === 'kid');
  assert.ok(kidsNow.every((n) => !(n.away && n.awayWhy === 'school')), 'nobody is still in school at 16:00');
  assert.ok(most >= 3, `at most ${most} children on the court during five minutes at 16:00`);
  assert.ok(total / samples >= 1.2, `on average ${(total / samples).toFixed(1)} children on the court`);
  assert.ok(acts.size >= 2, `the children on the court do ${acts.size} different things: ${[...acts].join(' ')}`);
});

// ---- the school door and the evening (R3-206) ---------------------------------------------------------------------------------------------------------
test('R3-206: a school the clock empties in one tick lets its class out of the door one after another, and not onto one spot', () => {
  const sim = fresh(7.6); run(sim, 15);
  const pupils = sim.npcs.filter((n) => n.away && n.awayWhy === 'school');
  assert.ok(pupils.length >= 12, `${pupils.length} people are in the school at 7:36`);
  ctx.hour = 17.2;                                                       // the lessons are long over: all of them are due out in the same second
  const out = new Map(); let crowd = 0, closest = Infinity;
  run(sim, 90, 0.05, (s) => {
    for (const n of pupils) if (!n.away && !out.has(n.id)) out.set(n.id, s.t);
    if (Math.round(s.t * 20) % 5) return;                                  // every quarter of a second
    const vis = pupils.filter((n) => !n.away);
    for (const a of vis) { let near = 0; for (const b of vis) { const d = dist2(a, b); if (d <= 3) near++; if (a !== b) closest = Math.min(closest, d); } crowd = Math.max(crowd, near); }
  });
  const times = [...out.values()].sort((a, b) => a - b), gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.equal(out.size, pupils.length, `all ${pupils.length} are let out (${out.size} were)`);
  assert.ok(Math.min(...gaps) >= 0.5, `two of them come out ${Math.min(...gaps).toFixed(2)} s apart`);
  assert.ok(times.at(-1) - times[0] <= pupils.length * EXIT_GAP * 1.6 + 1, `the last of ${pupils.length} waits ${(times.at(-1) - times[0]).toFixed(0)} s at the door: a queue, not a stall`);
  assert.ok(crowd <= 8, `${crowd} of them within 3 m of one another at the most (a line, not a huddle)`);
  assert.ok(closest >= 0.3, `two of them ${closest.toFixed(2)} m apart (walking through each other)`);
});

test('R3-206: the children are in by dusk and the teenagers by nine: after it they have no choice out of doors, only home; everybody else keeps the street', () => {
  for (const u of [0, 0.5, 0.999]) {
    const kid = { routine: 'kid', age: 'kid', homeLotId: 'L1', gender: 'm', jit: [0.5, 0.5, u] }, teen = { routine: 'teen', age: 'teen', homeLotId: 'L1', gender: 'f', jit: [0.5, 0.5, u] };
    assert.ok(curfewH(kid) >= 17.7 && curfewH(kid) < 18.4, `a child is in by dusk (the sun is down at 17:55, it is dark by 18:20): ${curfewH(kid)}`);
    assert.ok(curfewH(teen) >= 20.4 && curfewH(teen) < 21.3, `a teenager is in by about nine: ${curfewH(teen)}`);
    assert.deepEqual(freeChoices(kid, 18.4).map(([a]) => a), ['home'], 'a child at leisure after dusk: home');
    assert.deepEqual(freeChoices(teen, 21.3).map(([a]) => a), ['home'], 'a teenager at leisure after nine: home');
    assert.ok(freeChoices(kid, 17.0).some(([a]) => a === 'court'), 'before dusk a child plays on the court');
    assert.ok(freeChoices(teen, 20.0).some(([a]) => a === 'lean' || a === 'chat' || a === 'phone'), 'at eight a teenager is out on the corner');
  }
  for (const [routine, age] of [['homemaker', 'adult'], ['neighbour', 'adult'], ['worker', 'adult'], ['elder', 'elder'], ['beata', 'elder']]) {
    const p = { routine, age, homeLotId: 'L1', gender: 'f', jit: [0.5, 0.5, 0.5] };
    assert.equal(curfewH(p), Infinity, `${routine} has no curfew`);
    assert.ok(freeChoices(p, 21.5).length > 1, `${routine} still has the street at half past nine`);
  }
});

test('R3-206: a child or a teenager at home after the curfew stays in until bed time; before it, and for a grown-up, the stay ends with its time', () => {
  const sim = fresh(12); run(sim, 3); const brain = sim.brain;
  const of = (routine) => sim.npcs.find((n) => n.routine === routine && n.homeLotId);
  for (const [routine, early, late] of [['kid', 15, 19], ['teen', 19.5, 21.6]]) {
    const n = of(routine); n.jit[2] = 0.5; n.stayUntil = sim.t - 1;           // (the stay is over by the clock)
    ctx.hour = early; assert.equal(brain.stayOver(n, 'free', 'home'), true, `${routine} at ${early}: the stay is over`);
    ctx.hour = late; assert.equal(brain.stayOver(n, 'free', 'home'), false, `${routine} at ${late}: in for the evening`);
    assert.equal(brain.stayOver(n, 'school', 'home'), true, `${routine}: the school bell still calls`);
  }
  const grown = of('homemaker'); grown.stayUntil = sim.t - 1; ctx.hour = 21.6;
  assert.equal(brain.stayOver(grown, 'free', 'home'), true, 'a grown-up at half past nine: out when the stay is over');
});

test('R3-206: after dusk no child is out of doors, after nine no teenager; those out walk home, and once in nobody comes out again before bed time', () => {
  for (const [routine, from, to] of [['kid', 17.0, 18.6], ['teen', 20.0, 21.6]]) {
    const sim = fresh(from); run(sim, 20);
    const ours = sim.npcs.filter((n) => n.routine === routine), before = ours.filter((n) => !n.away).length;
    assert.ok(before >= 3, `${before} of ${ours.length} ${routine}s are out at ${from}`);
    ctx.hour = to;
    const inAt = new Map(), again = [];
    run(sim, 420, 0.1, (s) => {
      for (const n of ours) { if (n.away && n.awayWhy === 'home') inAt.set(n.id, inAt.get(n.id) ?? s.t); else if (!n.away && inAt.has(n.id) && !again.includes(n.id)) again.push(n.id); }
    });
    assert.deepEqual(again, [], `${routine}s who were in at ${to} came out again`);
    assert.deepEqual(ours.filter((n) => !n.away).map((n) => n.id), [], `${routine}s still out of doors ${420} s after the clock reached ${to}`);
  }
  const night = fresh(19.5); run(night, 3);
  assert.equal(night.npcs.filter((n) => n.routine === 'kid' && !n.away).length, 0, 'at 19:30 on the first frame there is no child on the street');
});

// ---- doors and walking inside -------------------------------------------------------------------------------------------------------------------
/** Walk a body with the real physics along `pts` at 1.3 m/s; returns { ok, t, x, z }. Points flagged `door` are held open for the walk like the Npc does. */
function walkBody(sim, from, pts, secs = 40) {
  const s = { x: from.x, y: from.y, z: from.z, vy: 0, onGround: true, blocked: false }; let t = 0, i = 0;
  while (t < secs && i < pts.length) {
    const p = pts[i], dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
    if (p.door) sim.doors.hold(p.door, 'probe');
    if (d < (i === pts.length - 1 ? 0.3 : 0.5)) { i++; continue; }
    ph.move(s, (dx / d) * 1.3 * 0.05, (dz / d) * 1.3 * 0.05, 0.05, BODY); t += 0.05;
  }
  return { ok: i >= pts.length, t, x: s.x, z: s.z, y: s.y };
}

test('doors: from the step outside, through the door (it opens on request) and in to the counter, every customer spot and the keeper post of every shop and to the chapel altar', () => {
  const sim = fresh(3), asked = new Map();
  const off = ctx.events.on('door:request', (e) => { if (e.open) asked.set(e.doorId, (asked.get(e.doorId) ?? 0) + 1); });
  const bad = [], targets = [];
  try {
    for (const shop of sim.shops.values()) {
      targets.push([shop.lot, shop.ent, [...shop.cust, ...(shop.sealed ? [] : [shop.post])]]);
    }
    const chapel = sim.lots.chapel, ent = chapel ? sim.spots.entrance(chapel, ['main']) : null;
    if (ent) targets.push([chapel, ent, sim.spots.inside(chapel, 'pray').filter((s) => sim.canReach(ent, s)).slice(0, 1)]);
    assert.ok(sim.shops.size >= 15 && targets.length > sim.shops.size, `${targets.length} entrances to try (${sim.shops.size} shops and the chapel)`);
    for (const [lot, e, spots] of targets) {
      if (!e?.inside) { bad.push(`${lot}: no inside point`); continue; }
      sim.doors.hold(e.doorId, 'probe');
      let at = { x: e.outside.x, y: e.outside.y, z: e.outside.z };
      const first = walkBody(sim, at, [e.inside], 10);
      if (!first.ok) { bad.push(`${lot}: cannot get in through ${e.doorId} (stopped at ${first.x.toFixed(2)}, ${first.z.toFixed(2)})`); sim.doors.release(e.doorId, 'probe'); continue; }
      at = { x: e.inside.x, y: e.inside.y, z: e.inside.z };
      for (const sp of spots) {
        const route = sim.indoor.route(lot, at, { x: sp.x, y: sp.y ?? e.inside.y, z: sp.z }, e.inside.y);
        const w = walkBody(sim, at, route, 40);
        if (!w.ok) bad.push(`${lot}: cannot walk from (${at.x.toFixed(1)}, ${at.z.toFixed(1)}) to ${sp.id ?? 'post'} (${sp.x.toFixed(1)}, ${sp.z.toFixed(1)}); stopped at (${w.x.toFixed(2)}, ${w.z.toFixed(2)})`);
      }
      sim.doors.release(e.doorId, 'probe');
    }
  } finally { off(); }
  assert.deepEqual(bad, []);
  assert.ok(asked.size >= Math.floor(targets.length * 0.85), `${asked.size} doors were asked to open (door:request) for ${targets.length} entrances`);
});

// A slot behind a rail: west wall x = 0, a rail at x = 0.9 that starts 0.6 m south of the mouth, a wall across the south end (z = 3). A body of 0.25 m has 0.34 m to stand in, and a waypoint on the far side
// of the rail is straight through it. (The L40 stair head, (-21.1, 1.43, y16.04): a passer-by's push shoved a walker in there, and the 16:00 soak of people-spots saw it stand 5 s until `unstick`.)
const slotWorld = (people = []) => {
  const phys = new Physics(); phys.setTerrain(() => 0);
  for (const [x1, z1, x2, z2] of [[0, 0, 0, 3], [0.9, 0.6, 0.9, 3], [0, 3, 0.9, 3]]) phys.addWall({ x1, z1, x2, z2, t: 0.05, y0: 0, y1: 3 });
  const w = { t: 0, unstuck: 0, near: () => people, physics: phys, brain: { next() {}, unstick(n) { w.unstuck++; n.stuckT = 1.5; } } };
  const npc = new Npc({ id: 'u', rng: makeRng(1).fork('u') });
  npc.place(0.45, 0, 2.6, 0);                                                          // at the dead end
  npc.walk(w, [{ x: 1.6, y: 0, z: 0.3 }, { x: 1.6, y: 0, z: 3.6 }], null, 1.3); npc.pi = 1;   // the first point is behind it, the second beyond the rail
  return { npc, w };
};
test('a walker pinned in a slot with nobody about goes back to its last waypoint and on, quickly and without an unstick (the head of the L40 stair)', () => {
  const { npc, w } = slotWorld();
  let t = 0, out = null;
  for (; t < 20 && npc.mode === 'walk'; t += 0.02) { npc.step(0.02, w); w.t += 0.02; if (out == null && npc.z < 1.0) out = t; }
  assert.equal(w.unstuck, 0, `${w.unstuck} calls to unstick`);
  assert.equal(npc.mode, 'idle', 'it got to the end of its walk');
  assert.ok(out != null && out < 4, `it was out of the slot after ${out?.toFixed(1)} s (nothing but unstick got it out before, and a stub unstick leaves it there)`);
  assert.ok(t < 10, `and at the end of the walk after ${t.toFixed(1)} s`);
  assert.equal(npc.backs, 1, 'with one way back');
});
test('a walker held by somebody walking beside it does not go back (a crowd clears by waiting; it is only a wall that needs the way out)', () => {
  const { npc, w } = slotWorld([{ x: 3, z: 2, y: 0, mode: 'walk', moving: true, st: { x: 3, y: 0, z: 2 } }]);
  for (let t = 0; t < 3; t += 0.02) { npc.step(0.02, w); w.t += 0.02; assert.equal(npc.detour, null, `a way back was taken at ${t.toFixed(1)} s with somebody walking beside it`); }
  assert.equal(npc.backs, 0);
});
test('but somebody standing there is no reason to wait: it goes back all the same (a person who chats on the pavement stays; the soak: n75 pinned 8 s beside n52)', () => {
  const { npc, w } = slotWorld([{ x: 3, z: 2, y: 0, mode: 'idle', moving: false, st: { x: 3, y: 0, z: 2 } }]);
  for (let t = 0; t < 4 && npc.backs === 0; t += 0.02) { npc.step(0.02, w); w.t += 0.02; }
  assert.equal(npc.backs, 1, 'a way back was taken');
});
test('a way back that is held up too is given up after a second: somebody stands on the last waypoint, so the walker is held off it (the 12:00 soak, a seller on the stair landing and n51)', () => {
  const { npc, w } = slotWorld([{ x: 1.5, z: 0.5, y: 0, mode: 'idle', moving: false, st: { x: 1.5, y: 0, z: 0.5 } }]);          // 0.22 m from the last waypoint (1.6, 0.3): his push holds the walker 0.5 m off him
  let on = null, off = null, held = 0;
  for (let t = 0; t < 9 && off == null; t += 0.02) {
    npc.step(0.02, w); w.t += 0.02;
    if (on == null && npc.detour) on = t; else if (on != null && !npc.detour) off = t;
    if (npc.detour && Math.hypot(npc.x - 1.5, npc.z - 0.5) < 0.62) held += 0.02;                      // (the walker is up against him)
  }
  assert.ok(on != null, 'it went back');
  assert.ok(off != null && off - on < 4.5, `and gave the way back up after ${(off - on).toFixed(1)} s (2 s and then 2 s a metre was all it was allowed before)`);
  assert.ok(held > 0.8 && held < 1.8, `after ${held.toFixed(1)} s held against him`);
});
test('the sidestep has its chance first: a walker it frees (slow along a wall, 15 degrees off square to it) is not sent back', () => {
  const phys = new Physics(); phys.setTerrain(() => 0);
  phys.addWall({ x1: 2, z1: -50, x2: 2, z2: 50, t: 0.05, y0: 0, y1: 3 });             // a long wall; the waypoint is beyond it: 0.34 m/s along it, 0.17 m a check, under the 0.23 m of "stalled"
  const w = { t: 0, near: () => [], physics: phys, brain: { next() {}, unstick() {} } }, npc = new Npc({ id: 'u', rng: makeRng(1).fork('u') });
  npc.place(1.0, 0, 0, 0); npc.walk(w, [{ x: 0.5, y: 0, z: 0 }, { x: 39.6, y: 0, z: 10.4 }], null, 1.3); npc.pi = 1;
  for (let t = 0; t < 4; t += 0.02) { npc.step(0.02, w); w.t += 0.02; }
  assert.ok(npc.maxStuck >= 1, `it counted as stalled (${npc.maxStuck} s), so the sidestep was tried`);
  assert.equal(npc.backs, 0, 'and it was the sidestep that got it on, not a way back');
  assert.ok(npc.z > 1, `${npc.z.toFixed(1)} m on along the wall`);
});

// The pinch of the 21:00 soak (n29 and the child n44 at (-34.0, 49.9, y3.6)), in the page's own world: the pavement of the hill street runs along two buildings that front one line with a 1.2 m alley between them, the
// child bounces on the lane, and the walker, held off him by his push, stands at the mouth of the alley with the building corner 0.5 m behind it. The sidestep was a coin flip: one side was the corner, and for
// 5 seeds in 12 it stood there until `unstick`.
const PINCH_WAY = [[-32.44, 51.15], [-34.33, 50.68], [-38.14, 49.76], [-40.18, 50.26], [-42.27, 49.75]];
const pinchRun = (seed, child = true) => {
  for (const [id] of ph.doors) ph.setDoor(id, false);
  const gy = (x, z) => ph.groundAt(x, z, 99), kid = { x: -34.13, z: 50.57, y: gy(-34.13, 50.57), mode: 'idle', moving: false };
  kid.st = { x: kid.x, y: kid.y, z: kid.z };
  const w = { t: 0, unstuck: 0, near: () => (child ? [kid] : []), physics: ph, brain: { next() {}, unstick(n) { w.unstuck++; n.stuckT = 1.5; } } };
  const npc = new Npc({ id: 'n29', rng: makeRng(seed).fork('n29') });
  let arrived = false; npc.place(-31.2, gy(-31.2, 51.45), 51.45, 0); npc.walk(w, PINCH_WAY.map(([x, z]) => ({ x, y: gy(x, z), z })), () => { arrived = true; }, 1.3);
  for (let t = 0; t < 40 && !arrived; t += 0.05) { npc.step(0.05, w); w.t += 0.05; }
  return { arrived, t: w.t, unstuck: w.unstuck, x: npc.x, z: npc.z };
};
test('a walker pinched between the corner of a building and somebody standing on the pavement sidesteps away from the wall, whatever the coin says (the 21:00 soak, n29 and the child n44)', () => {
  assert.ok(pinchRun(1, false).arrived, 'with nobody there the way is open (the walls leave a way)');
  const bad = [];
  for (let seed = 1; seed <= 12; seed++) { const r = pinchRun(seed); if (!r.arrived || r.unstuck) bad.push(`seed ${seed}: ${r.arrived ? 'got through' : 'stood at'} (${r.x.toFixed(1)}, ${r.z.toFixed(1)}) after ${r.t.toFixed(0)} s, ${r.unstuck} calls to unstick`); }
  assert.deepEqual(bad, [], 'every seed got past the child without an unstick');
});

// A push must not take a walker over an edge (13.6 h of the 12:00 soak: n39 and n83 met head-on on the flight at (-26, -19.5), both slipped east, which is open, and n39 stepped off it, 0.4 m down onto a bank too steep to climb
// back; it stood there for 12 s and three calls to `unstick`). A platform 0.7 m up with its east edge at x = 0 and nothing to stop a body there; the walker goes along it 0.35 m from the edge, pushed toward it by the
// sidestep, or by somebody who stands close on its west side.
const edgeRun = (how) => {
  const phys = new Physics(); phys.setTerrain(() => 0);
  phys.addFloor({ pts: [[-6, -9], [0, -9], [0, 9], [-6, 9]], y: 0.7 });
  const o = { x: -0.7, z: -2, y: 0.7, mode: 'idle', moving: false, st: { x: -0.7, y: 0.7, z: -2 } };       // 0.35 m west of the walker's line: his push is 1.1 m/s toward the edge as the walker passes
  const w = { t: 0, near: () => (how === 'neighbour' ? [o] : []), physics: phys, brain: { next() {}, unstick() {} } }, npc = new Npc({ id: 'u', rng: makeRng(1).fork('u') });
  npc.place(-0.35, 0.7, -5, 0); npc.walk(w, [{ x: -0.35, y: 0.7, z: -4.5 }, { x: -0.35, y: 0.7, z: 5 }], null, 1.3);
  if (how === 'sidestep') { npc.sidestep = 4; npc.sideDir = -1; }                // the lateral is (-uz, ux) * sideDir and the walker goes south (+z): -1 is east
  let low = Infinity;
  for (let t = 0; t < 9 && npc.mode === 'walk'; t += 0.05) { npc.step(0.05, w); w.t += 0.05; low = Math.min(low, npc.y); }
  return { low, z: npc.z, mode: npc.mode };
};
test('a push (the sidestep, a neighbour close on the other side) never takes a walker over an edge, and the walker goes on along its way', () => {
  const calm = edgeRun('none');
  assert.ok(calm.low > 0.69 && calm.mode === 'idle', `with nothing pushing it the walker keeps to the platform and gets to the end (lowest ${calm.low.toFixed(2)}, ${calm.mode})`);
  for (const how of ['sidestep', 'neighbour']) {
    const r = edgeRun(how);
    assert.ok(r.low > 0.69, `${how}: the walker stepped off the edge (lowest y ${r.low.toFixed(2)}, the platform is at 0.7)`);
    assert.equal(r.mode, 'idle', `${how}: and it got to the end of its way (z ${r.z.toFixed(1)})`);
  }
});

test('a waypoint under somebody who stands there is skipped once the walker has been held off it for a second; a tight point (furniture) and a door are not', () => {
  const stander = { x: 3.0, z: 0, y: 0, mode: 'idle', moving: false, st: { x: 3.0, y: 0, z: 0 } };      // on the phone in the road, 0.6 m short of the first waypoint: his push holds the walker 0.5 m off him, 1.1 m off the point
  const run = (first) => {
    let at = 0;                                                                                          // the furthest waypoint the walker has got to in 3.5 s: held off the first, it is pinned from about 2 s on
    const w = { t: 0, near: () => [stander], physics: { move(s, dx) { s.x += dx; } }, brain: { next() {}, unstick() {} } };      // z is held: no slipping aside
    const npc = new Npc({ id: 'u', rng: makeRng(1).fork('u') });
    npc.place(0, 0, 0, 0); npc.walk(w, [{ x: 3.6, y: 0, z: 0, ...first }, { x: 9, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }], null, 1.3);
    for (let t = 0; t < 3.5; t += 0.02) { npc.step(0.02, w); w.t += 0.02; at = Math.max(at, npc.pi); }
    return at;
  };
  assert.ok(run({}) >= 1, 'an ordinary point is given up');
  assert.equal(run({ tight: true }), 0, 'a tight point is not');
  assert.equal(run({ door: 'D1' }), 0, 'a door is not');
});

test('the walker hugs an indoor route: a `tight` point is reached within 0.32 m (no corner cutting round furniture), an ordinary one within 0.55 m', () => {
  const reachedAt = (tight) => {                                                       // a walker on open floor with a stub world: how far from the first point does it turn to the second?
    const npc = new Npc({ id: 'u', rng: makeRng(1).fork('u') });
    const w = { t: 0, near: () => [], physics: { move(s, dx, dz) { s.x += dx; s.z += dz; } }, brain: { next() {}, unstick() { throw new Error('stuck on open floor'); } } };
    npc.place(-3, 0, 0, 0); npc.walk(w, [{ x: 0, y: 0, z: 0, tight }, { x: 0, y: 0, z: 4 }], null, 1.3);
    for (let i = 0; i < 600 && npc.pi === 0; i++) { npc.step(0.02, w); w.t += 0.02; }
    assert.equal(npc.pi, 1, 'the walker got to the first point');
    return Math.hypot(npc.x, npc.z);
  };
  const t = reachedAt(true), o = reachedAt(false);
  assert.ok(t < 0.33 && t > 0.25, `a tight point is passed at ${t.toFixed(2)} m`);
  assert.ok(o < 0.56 && o > 0.45, `an ordinary point is passed at ${o.toFixed(2)} m`);
});

test('lanes: the keep-to-your-right offset never puts a waypoint over an edge (a plaza node near its rim)', () => {
  // a plaza at y = 7 east of x = 0 (a drop to y = 4 to the west); a path 0.9 m inside the rim, travelling south: the lane of a person who keeps to the right is west of the node
  const rim = { heightsAt: (x) => (x >= 0 ? [7] : [4]) };
  const nodes = [{ i: 0, x: 0.9, y: 7, z: 0, kind: 'plaza' }, { i: 1, x: 0.9, y: 7, z: 6, kind: 'plaza' }];
  const wp = PeopleSim.prototype.waypoints.call({ nav: { nodes }, physics: rim }, { lane: 1.1, x: 0.9, z: 0 }, [0, 1]);
  assert.equal(wp.length, 2);
  for (const p of wp) assert.ok(p.x >= 0.45, `a waypoint at x = ${p.x.toFixed(2)} stands within 0.45 m of the rim (x = 0) or beyond it`);
  const wide = PeopleSim.prototype.waypoints.call({ nav: { nodes: [{ i: 0, x: 4, y: 7, z: 0, kind: 'plaza' }, { i: 1, x: 4, y: 7, z: 6, kind: 'plaza' }] }, physics: rim }, { lane: 1.1, x: 4, z: 0 }, [0, 1]);
  assert.ok(wide.every((p) => Math.abs(p.x - 4) > 0.9), 'well inside the plaza the lane offset is kept (people do walk on their own side)');
  // the real plan: every edge both ways at the widest lane; a waypoint is either a safe place or exactly its node
  const under = (x, z, y) => ph.heightsAt(x, z).length === 0 || ph.heightsAt(x, z).some((h) => h >= y - 0.5);
  const safe = (x, z, y, m) => under(x, z, y) && [0, 1, 2, 3, 4, 5, 6, 7].every((k) => under(x + Math.cos(k * Math.PI / 4) * m, z + Math.sin(k * Math.PI / 4) * m, y));
  const sim = fresh(9); let n = 0, moved = 0;
  for (const a of sim.nav.nodes) for (const j of sim.nav.adj[a.i]) {
    const w = sim.waypoints({ lane: 1.25, x: a.x, z: a.z }, [a.i, j]);
    for (const [k, p] of w.entries()) {
      const nd = sim.nav.nodes[k ? j : a.i]; n++;
      if (Math.hypot(p.x - nd.x, p.z - nd.z) > 1e-6) moved++;
      assert.ok(safe(p.x, p.z, p.y, 0.45) || (p.x === nd.x && p.z === nd.z), `a lane waypoint (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) beside node n${nd.i} is over an edge`);
    }
  }
  assert.ok(n > 1000 && moved > n * 0.3, `${n} waypoints, ${moved} of them moved to a lane`);
});

test('nav: a person on the street below a plaza is given a street node, not the plaza node 3 m above', () => {
  const g = new NavGraph(), plaza = g.add(0, 7, 0, 'plaza'), street = g.add(6, 4, 0, 'street');
  assert.equal(g.nearest(1, 0, 16, 4.05), street, 'on the street: the street node, though the plaza node is closer on the map');
  assert.equal(g.nearest(1, 0, 16, 7), plaza, 'on the plaza: the plaza node');
  assert.equal(g.nearest(1, 0), plaza, 'with no height given: the nearest on the map');
});

test('near: a person on another floor (2.2 m or more up or down) is no neighbour, so the nurse upstairs does not push the patient below her off the way to the seat; the player is judged the same way', () => {
  const sim = Object.create(PeopleSim.prototype); sim._grid = new Map(); sim._near = []; sim._cs = 3;
  const at = (id, x, y, z, extra = {}) => ({ id, away: false, st: { x, y, z }, ...extra });
  const me = at('me', 0, 0.6, 0);
  sim.npcs = [me, at('beside', 1, 0.6, 0), at('step', 0, 1.9, 1), at('above', 0.4, 3.6, 0.3), at('below', -0.5, -2.4, 0), at('far', 9, 0.6, 0), at('away', 0.5, 0.6, 0.5, { away: true })];
  sim.player = { x: 0, y: 0.6, z: -1, isPlayer: true };
  sim._rebuildGrid();
  const ids = () => sim.near(me, 2).map((o) => o.isPlayer ? 'player' : o.id).sort();
  assert.deepEqual(ids(), ['beside', 'player', 'step'], 'the person beside, the one on the stair 1.3 m up and the player; not the floor above (3 m), the floor below (3 m), the far one or the one indoors');
  sim.player.y = 3.6; assert.deepEqual(ids(), ['beside', 'step'], 'the player on the floor above is no neighbour either');
});

test('indoor route: a corridor that runs along a door in its wall is not threaded through the door; a way through the doorway is', () => {
  // a narrow aisle between a long counter (x = -0.13) and the east wall (x = 0.6), z -6..8, one grid column wide (x = 0.2) and so entirely inside the zone of a door in the east wall
  // (the door at z 1.4..2.6 leads to a closet): a shop with a nook, as L58 of the plan. Walls are segments, a body of radius R overlaps a wall within R + t/2.
  const wall = (id, x1, z1, x2, z2, door = null) => ({ id, x1, z1, x2, z2, t: 0.06, y0: 0, y1: 2.4, door, on: true });
  const leaf = wall('L01.d1', 0.6, 1.4, 0.6, 2.6, 'L01.d1');
  const walls = [wall('counter', -0.13, -6, -0.13, 8), wall('w', -1.2, -6, -1.2, 8), wall('e1', 0.6, -6, 0.6, 1.4), leaf, wall('e2', 0.6, 2.6, 0.6, 8), wall('n', -1.2, -6, 0.6, -6), wall('s', -1.2, 8, 0.6, 8),
    wall('c1', 0.6, 0.8, 3.4, 0.8), wall('c2', 0.6, 3.2, 3.4, 3.2), wall('c3', 3.4, 0.8, 3.4, 3.2)];
  const ph0 = {
    walls, doors: new Map([['L01.d1', [leaf]]]), heightsAt: () => [0],
    _overlaps(x, z, y, R) {
      for (const w of this.walls) {
        if (!w.on) continue;
        const dx = w.x2 - w.x1, dz = w.z2 - w.z1, t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(x - (w.x1 + t * dx), z - (w.z1 + t * dz)) < R + w.t / 2) return true;
      }
      return false;
    },
  };
  const world = { ctx: { buildings: new Map([['L01', { footprint: [[-1.4, -6.4], [3.6, -6.4], [3.6, 8.2], [-1.4, 8.2]], entrances: [] }]]) }, physics: ph0, doors: { know() {} } };
  const indoor = new Indoor(world), y = 0, show = (r) => r.map((p) => (p.door ? 'D' : '') + p.x.toFixed(2) + ',' + p.z.toFixed(2)).join(' ');
  const along = indoor.route('L01', { x: 0.2, y, z: -3 }, { x: 0.2, y, z: 5 }, y);              // the whole way down the aisle, 0.4 m from the door leaf
  assert.ok(!along.some((p) => p.door), `the walk down the aisle threads no door (${show(along)})`);
  assert.ok(along.every((p) => p.x < 0.45), `and does not go into the closet behind the door (${show(along)})`);
  assert.deepEqual(indoor.connected('L01', { x: 0.2, z: -3 }, { x: 0.2, z: 5 }, y).doors, [], 'no door is on the way down the aisle');
  const into = indoor.route('L01', { x: 0.2, y, z: -3 }, { x: 2.4, y, z: 2 }, y);                   // into the closet
  assert.deepEqual(into.filter((p) => p.door).map((p) => p.door), ['L01.d1'], `the way into the closet goes through its door (${show(into)})`);
  const di = into.findIndex((p) => p.door);
  assert.ok(into[di - 1]?.x < 0.6 && into[di + 1]?.x > 0.6, `it comes to the door from the aisle side and leaves on the closet side (${show(into)})`);
  assert.deepEqual(indoor.connected('L01', { x: 0.2, z: -3 }, { x: 2.4, z: 2 }, y).doors, ['L01.d1'], 'the closet is behind the door');
});

test('doors inside a building: the walker asks for the inner door, walks through and the door shuts behind it', () => {
  const sim = fresh(3);
  // a shop building with a room behind an inner door: a spot of it whose way to the street door crosses one
  let found = null;
  for (const shop of sim.shops.values()) {
    if (!shop.ent?.inside) continue;
    const spots = [shop.post, shop.cpoint, ...sim.spots.inside(shop.lot, 'sit'), ...sim.spots.inside(shop.lot, 'stand'), ...sim.spots.inside(shop.lot, 'chat')];
    for (const sp of spots) {
      const q = sim.indoor.connected(shop.lot, sp, shop.ent.inside, shop.ent.inside.y);
      if (q.ok && q.doors.length) { found = { shop, door: q.doors[0], from: sp }; break; }
    }
    if (found) break;
  }
  assert.ok(found, 'some shop building has a room behind an inner door');
  const { shop, door, from } = found, npc = sim.npcs.find((n) => n.routine === 'homemaker');
  const asked = []; const off = ctx.events.on('door:request', (e) => { if (e.doorId === door) asked.push(e.open); });
  try {
    sim.revealAt(npc, from.x, from.z, shop.ent.inside.y, 0);
    const route = sim.indoor.route(shop.lot, npc, shop.ent.inside, shop.ent.inside.y);
    assert.ok(route.some((p) => p.door === door), 'the route threads the inner door');
    const di = route.findIndex((p) => p.door === door);
    let arrived = false; npc.walk(sim, route, () => { arrived = true; }, 1.3);
    let openSeen = false, heldPast = 0, past = 0;
    for (let t = 0; t < 40 && !arrived; t += 0.05) {
      sim.step(0.05); if (ph.doorOpen(door)) openSeen = true;
      if (npc.mode === 'walk' && npc.pi > di) { past++; if (npc.gate === door) heldPast++; }        // already through, still walking on
    }
    assert.ok(arrived, `the walker came through (at ${npc.x.toFixed(2)}, ${npc.z.toFixed(2)})`);
    assert.ok(openSeen && asked[0] === true, 'the door opened for the walker');
    assert.ok(past >= 3, `the walk goes on for a while after the door (${past} steps)`);
    assert.equal(heldPast, 0, 'the walker let go of the door the moment it was through, not only when it arrived');
    for (let t = 0; t < 4; t += 0.05) sim.step(0.05);
    assert.equal(ph.doorOpen(door), false, 'and shut again behind it');
    assert.equal(npc.gate, null, 'the walker let go of the door');
  } finally { off(); }
});

// ---- the barrio keeps going -------------------------------------------------------------------------------------------------------------------------
test('soak: five minutes at 9:00 and at 16:00 - nobody in a wall, nobody stuck, no fault, no console output, a varied day', () => {
  const acts = new Set(), s = spy();
  try {
    for (const hour of [9, 16]) {
      const sim = fresh(hour); let inWall = 0, who = new Set(), twins = 0, stacked = 0; const twinPairs = new Set(), stackedPairs = new Set();
      run(sim, 300, 0.05, (m) => {
        if (Math.round(m.t * 20) % 20) return;
        for (const n of m.npcs) { if (n.away) continue; acts.add(n.mode === 'walk' ? 'walk' : n.act); if (n.sitH == null && m.inWall(n)) { inWall++; who.add(n.id); } }
        const still = m.npcs.filter((n) => !n.away && n.mode !== 'walk');                       // neither on the move
        for (let i = 0; i < still.length; i++) for (let j = i + 1; j < still.length; j++) {
          const a = still[i], b = still[j], d = dist2(a, b);
          if (Math.abs(a.st.y - b.st.y) > 1.2) continue;
          if (a.charId === b.charId && d < 1.5) { twins++; twinPairs.add(`${a.id}/${b.id}`); }                      // R3-006: two of the same character, side by side
          if (a.sitH == null && b.sitH == null && d < 0.5) { stacked++; stackedPairs.add(`${a.id}/${b.id}`); }       // two children on one point of the court (A1's R3-003 probe)
        }
      });
      const st = sim.getSimStats();
      assert.equal(sim.faults.length, 0, `faults at ${hour}:00: ${JSON.stringify(sim.faults.slice(0, 2))}`);
      assert.ok(twins <= 2, `${twins} person-seconds of two of the same character standing within 1.5 m of each other at ${hour}:00 (${[...twinPairs].join(', ')})`);
      assert.ok(stacked <= 2, `${stacked} person-seconds of two people standing within 0.5 m of each other at ${hour}:00 (${[...stackedPairs].join(', ')})`);
      assert.ok(inWall <= 2, `${inWall} person-seconds inside a wall at ${hour}:00 (${[...who].join(', ')})`);
      assert.ok(st.maxStuck <= 20, `somebody was stuck for ${st.maxStuck} s at ${hour}:00`);
      assert.ok(st.unstuck <= 3, `${st.unstuck} rescues at ${hour}:00`);
      assert.ok(sim.npcs.length >= 60, `${sim.npcs.length} people`);
    }
    assert.ok(acts.size >= 9, `${acts.size} different activities seen: ${[...acts].join(' ')}`);
    assert.deepEqual(ctx.errors, [], 'ctx.errors is empty');
    assert.deepEqual(s.log, [], 'nothing on the console');
  } finally { s.stop(); }
});

test('the wall check sees a person placed inside a wall (negative control of the soak)', () => {
  const sim = fresh(12); const n = sim.npcs.find((m) => !m.away);
  const w = ph.walls.find((q) => q.on && q.y0 < 0.9 && q.y1 > 1.8 && Math.hypot(q.x2 - q.x1, q.z2 - q.z1) > 1.2 && !q.door);
  assert.ok(w, 'the world has a wall');
  n.place((w.x1 + w.x2) / 2, w.y0, (w.z1 + w.z2) / 2, 0);
  assert.equal(sim.inWall(n), true, 'a person on a wall line is inside it');
  n.place(plan.spawn.x, plan.spawn.y ?? 0, plan.spawn.z, 0);
  assert.equal(sim.inWall(n), false, 'a person in the open is not');
});

test('teleporting the player through twenty buildings while the day changes leaves ctx.errors, the sim faults and the console empty', () => {
  const sim = fresh(7), s = spy(); let visited = 0;
  try {
    const hours = [6.5, 7.5, 10, 12.9, 13.5, 16, 18.2, 19.7, 21.6, 23, 3, 5.8], lots = plan.lots.filter((l) => sim.spots.entrance(l.id, ['shop', 'main'])?.inside);
    assert.ok(lots.length >= 20, `${lots.length} buildings with a door to go through`);
    for (let i = 0; i < 24; i++) {
      const lot = lots[(i * 3) % lots.length], e = sim.spots.entrance(lot.id, ['shop', 'main']);
      ctx.hour = hours[i % hours.length];
      sim.setPlayer(e.inside.x, e.inside.y, e.inside.z, e.yawIn ?? 0); visited++;
      run(sim, 4, 0.05);
      for (const n of sim.npcs) assert.ok(Number.isFinite(n.x + n.y + n.z), `${n.id} has a position after the jump into ${lot.id}`);
    }
    assert.ok(visited >= 20);
    assert.deepEqual(sim.faults, [], 'no exception in the frame loop');
    assert.deepEqual(ctx.errors, [], 'ctx.errors is empty');
    assert.deepEqual(s.log, [], 'nothing on the console');
  } finally { s.stop(); }
});

test('one bad person does not stop the barrio: the fault is caught, reported once, and that person starts over', () => {
  const sim = fresh(12), s = spy();
  try {
    const bad = sim.npcs.find((n) => !n.away && n.mode === 'idle');
    for (let k = 0; k < 2; k++) {
      if (k === 0) { bad.mode = 'idle'; bad.until = 0; bad.then = () => { throw new Error('boom, always the same'); }; }                          // the brain's callback throws
      else { bad.mode = 'walk'; bad.act = 'walk'; bad.moving = true; bad.pi = 0; bad.path = [{ get x() { throw new Error('boom, always the same'); }, z: 0 }]; }   // the walk throws
      bad.accum = 1; sim.step(0.05);
    }
    assert.equal(sim.faults.length, 2, 'both faults are recorded');
    assert.equal(ctx.errors.filter((e) => e.stage === 'people').length, 1, 'but only the first is reported on ctx.errors');
    assert.equal(s.log.filter((l) => l.startsWith('error: [people]')).length, 1, 'and once on the console');
    assert.equal(bad.mode, 'idle', 'the person that was walking is standing again'); assert.equal(bad.act, 'idle'); assert.equal(bad.then, null, 'the person starts over');
    assert.equal(bad.path, null); assert.equal(bad.moving, false); assert.ok(bad.until > sim.t, 'with a pause before the brain gives them something new');
    const t0 = sim.t; run(sim, 5);
    assert.ok(sim.t - t0 >= 4.9 && sim.faults.length === 2, 'the barrio goes on, no new fault');
  } finally { s.stop(); ctx.errors = []; }
});

// ---- reviewers: stand in front of a person and look at the face ------------------------------------------------------------------------------------------
test('lookPose (the reviewers\' lookAtNpc): a clear standing place within 2 m of every visible person, the face inside the view cone, nothing solid between', () => {
  const sim = fresh(12); run(sim, 8);
  const seen = sim.npcs.filter((n) => !n.away); assert.ok(seen.length >= 30, `${seen.length} people about at noon`);
  const bad = []; let ok = 0, behind = 0;
  for (const n of seen) {
    const p = sim.lookPose(n.id);
    if (!p.ok) { bad.push(`${n.id}: ${p.reason}`); continue; }
    ok++;
    const eye = { x: p.feet.x, y: p.eye, z: p.feet.z }, h = sim.headOf(n);                           // (checked here against the person, not against the pose's own numbers)
    const v = { x: h.x - eye.x, y: h.y - eye.y, z: h.z - eye.z }, d3 = Math.hypot(v.x, v.y, v.z);
    const fwd = { x: -Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * Math.cos(p.pitch) };      // the player's convention: yaw 0 looks to -z
    const cos = (fwd.x * v.x + fwd.y * v.y + fwd.z * v.z) / d3;
    if (d3 > 2.0) bad.push(`${n.id}: the face is ${d3.toFixed(2)} m away`);
    if (cos < Math.cos(0.1)) bad.push(`${n.id}: the face is ${(Math.acos(Math.min(1, cos)) * 57.3).toFixed(1)} degrees off the line of sight`);
    if (ph._overlaps(p.feet.x, p.feet.z, p.feet.y, 0.3, 1.78)) bad.push(`${n.id}: the player would stand inside a wall at (${p.feet.x.toFixed(2)}, ${p.feet.z.toFixed(2)})`);
    if (ph.segmentBlocked(p.feet.x, p.feet.z, h.x, h.z, Math.min(p.feet.y, n.y), Math.max(eye.y, h.y) - Math.min(p.feet.y, n.y) + 0.05, null, 1.5)) bad.push(`${n.id}: a wall between the eyes and the face`);
    if (!ph.heightsAt(p.feet.x, p.feet.z).some((y) => Math.abs(y - p.feet.y) < 0.01)) bad.push(`${n.id}: no floor under the player's feet`);
    if (Math.abs(p.feet.y - n.y) > 0.6) bad.push(`${n.id}: on another storey`);
    if (Math.abs(p.bearing) > 1.0) behind++;
  }
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} problems in ${seen.length} poses`);
  assert.ok(ok >= seen.length * 0.9, `${ok} of ${seen.length} people can be framed`);
  assert.ok(behind <= seen.length * 0.3, `${behind} poses had to go round to the side or the back`);
  // a seated person's eyes are lower than a standing person's, by about the seat drop; a person indoors is not drawn and not framed
  const n = seen.find((m) => m.sitH == null), stand = sim.headOf(n).y - n.y; n.sitH = 0.45;
  const sit = sim.headOf(n).y - n.y; n.sitH = null;
  assert.ok(sit < stand - 0.2 && sit > stand - 0.5, `seated eyes ${sit.toFixed(2)} m above the floor, standing ${stand.toFixed(2)} m`);
  const gone = sim.npcs.find((m) => m.away) ?? (() => { const m = sim.npcs[1]; m.away = true; m.awayWhy = 'sleep'; return m; })();
  const g = sim.lookPose(gone.id); assert.equal(g.ok, false); assert.match(g.reason, /indoors/);
  assert.equal(sim.lookPose('no-such-person').ok, false);
  // with no id: the nearest person to the player
  const t = [...seen].reverse().find((m) => !m.away); assert.notEqual(t, sim.npcs[0], 'the person chosen is not simply the first of the cast'); sim.setPlayer(t.x + 1.0, t.y, t.z + 0.4, 0);
  const near = sim.lookPose(); assert.ok(near.ok && near.id === sim.nearestNpc().id, `the nearest person is framed (${near.id} vs ${sim.nearestNpc().id})`);
  assert.notEqual(near.id, sim.npcs[0].id, 'and it is not just the first of the cast');
});

// ---- looks ---------------------------------------------------------------------------------------------------------------------------------------
test('skin: a person can only be a little darker and warmer than the baked tone, never lighter; the variants differ', () => {
  const slot = { id: 8, hex: '#a87a5a', gain: 1 }, rng = makeRng(7).fork('skin');
  const meta = { id: 'x', tags: ['adult'], slots: { top: { id: 2, hex: '#888888', gain: 1.25 }, skin: slot } };
  const seen = new Set(); let withSkin = 0;
  for (let i = 0; i < 60; i++) {
    const v = makeVariant(meta, rng); if (!v.skin) continue;
    withSkin++; seen.add(v.skin);
    const r = slotRatio(slot, v.skin);
    for (const c of r) assert.ok(c <= 1.02 && c >= 0.6, `skin ratio ${r.map((x) => x.toFixed(3))} for ${v.skin}`);
  }
  assert.ok(withSkin >= 45, `${withSkin} of 60 get a skin tone of their own`);
  assert.ok(seen.size >= 30, `${seen.size} distinct tones`);
  const same = slotRatio(slot, skinShade(slot, 0, 0)); assert.ok(same.every((c) => Math.abs(c - 1) < 0.03), 'no darkening and no warming gives back the baked tone');
});

// ---- the prompt guard (A1's find, round 4) ------------------------------------------------------------------------------------------------------------
test('the E prompt of a person: away or asleep or in a talk it is refused, and going indoors and coming out again does not lose the guard (onAway kept the item\'s own enabled)', async () => {
  const { PeopleWorld } = await import('../js/people/world.js');
  const talk = { active: false }, world = { ctx: { interact: { register: (it) => it } }, talk };           // the two members _registerInteract and onAway use
  const n = new Npc({ id: 'n1', name: { display: 'Doña Rosa', full: 'Rosa' }, persona: 'vecina', bank: 'vecina', gender: 'f', shopName: null, rng: makeRng(5).fork('n') });
  n.place(0, 0, 0, 0); n.visible = true; n.view = { root: { visible: true }, propName: null };
  PeopleWorld.prototype._registerInteract.call(world, n);
  const offered = () => n.item.enabled(ctx, n.item);
  assert.equal(typeof n.item.enabled, 'function', 'the item carries its guard');
  assert.equal(offered(), true, 'a person on the street is offered');
  n.away = true; PeopleWorld.prototype.onAway.call(world, n, true);                                         // indoors: hidden
  assert.equal(typeof n.item.enabled, 'function', 'the guard survives going indoors (11 of 86 people were away at boot and lost it)');
  assert.equal(offered(), false, 'an absent person is not offered at the spot they left');
  n.away = false; n.visible = true; PeopleWorld.prototype.onAway.call(world, n, false);                     // and out again
  assert.equal(typeof n.item.enabled, 'function', 'and coming out of the door does not wipe it either');
  assert.equal(offered(), true, 'back on the street they are offered again');
  n.away = true; assert.equal(offered(), false, 'away is enough on its own (the view may not have caught up)'); n.away = false;
  n.act = 'sleep'; assert.equal(offered(), false, 'a sleeper in bed is not woken for a chat');
  n.act = 'idle'; talk.active = true; assert.equal(offered(), false, 'nobody is offered during a conversation'); talk.active = false;
  n.visible = false; assert.equal(offered(), false, 'nor somebody who is not drawn');
});
