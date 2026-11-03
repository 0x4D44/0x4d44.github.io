// INTERIORS (A3, round 7): the thin shops (R4-706, R4-707).
//  - A row of units placed along a wall (`Layout.run`) that was refused its first slot by a door's keep-out on the next wall placed nothing at all: the two minutes shops (L15, L76) stood without a cabin,
//    and the hardware store of L41 had no counter (its 2 m counter found no wall between four shelf units, a street lane and three doors).
//  - The butchers (4 to 5 pieces), the barbers (6 to 8), the hardware store, the welder's and the minutes shops are given what their trade has in the library: a basin, a cold store, a second block, a stool and a fan
//    for the butcher, towels and a bin for the barber, the bottles, a box and a short counter for the hardware store, the grinder, the steel, the lockers and the assembly table for the welder, the drinks and the
//    sweets of a minutes shop.
//  - The two minutes shops without a counter (L15, L76) keep what the counter said: the shop's story is told at a cabin and a cabin answers "Mirar las cabinas" (stories.js).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-shops.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layout } from '../js/interiors/layout.js';
import { shopRoom } from '../js/interiors/shops.js';
import { SHOP_STORY } from '../js/interiors/stories_text.js';
import { collectInteractables } from '../js/interiors/stories.js';
import { makeRng, hashStr } from '../js/core/rng.js';
import { furnishedBatch } from './interiors-lib.mjs';

const w = await furnishedBatch({ real: true });

/** Every room of the barrio that was fitted as a shop of this trade: { bp, rid, L }. */
const trade = (type) => w.bps.flatMap((bp) => Object.entries(bp.interior?.rooms ?? {}).filter(([, r]) => r.shopType === type).map(([rid]) => ({ bp, rid, L: bp.interior.layouts.get(rid) })));
const named = (L, name) => L.items.filter((i) => i.name === name);
const kinds = (L) => new Set(L.items.filter((i) => !i.c.decal && !i.top && !i.ceil).map((i) => i.name));

/** A 4 x 3 m room whose only door is in the -z wall, near the -x corner: the door's keep-out (0.77 m deep, 1.0 m wide) lies across the first 1.1 m of the -x wall's corner. */
function cornerDoorRoom(seed = 1) {
  const r = { id: 'S.f0.r1', type: 'shop', floor: 0, rect: { x0: 0, z0: 0, x1: 4, z1: 3 }, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [r], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'S.d1', kind: 'interior', w: 0.9, rooms: ['S.r0', r.id], swing: 1, hinge: 'left', x: 0.6, z: -0.05 }] };
  return new Layout({ bp, room: r, rng: makeRng(seed), hh: { tints: {} } });
}

test('Layout.run: a unit the pose refuses at the corner places nothing, unless `slide` carries it on along the wall (L15, L76: a door of the next wall kept the corner, and the whole row of cabins with it)', () => {
  const cab = { prio: 1, skipMissing: true, winOk: true };
  const near = cornerDoorRoom();
  assert.ok(near.obs['-z'].some((o) => o.kind === 'door' && o.u0 < 0.5), 'the room has its door near the -x corner of the -z wall');
  assert.equal(near.run('-x', Array(3).fill('cabin_pc'), cab).length, 0, 'without `slide` the row stops before its first cabin (the behaviour every other row keeps)');
  assert.equal(cornerDoorRoom().run('-x', Array(3).fill('cabin_pc'), { ...cab, slide: 0 }).length, 0, '`slide: 0` is no slide');
  const L = cornerDoorRoom(), placed = L.run('-x', Array(3).fill('cabin_pc'), { ...cab, slide: 0.25 });
  assert.equal(placed.length, 2, 'with `slide` the cabins stand along the wall beyond the keep-out: two of the three fit between it and the far corner');
  const zEnd = Math.max(...L.keep.filter((k) => k.why === 'door').map((k) => k.z1));
  for (const it of placed) assert.ok(it.z - it.w / 2 >= zEnd - 1e-6, `the cabin at z ${it.z.toFixed(2)} (from ${(it.z - it.w / 2).toFixed(2)}) is clear of the door's keep-out (to z ${zEnd.toFixed(2)})`);
  assert.ok(placed[1].z - placed[0].z >= placed[0].w - 1e-6, 'the cabins do not overlap');
  // a refusal that is not at the corner (a unit that fits nowhere on the wall) still ends the row of a caller without `skipMissing`
  const strict = cornerDoorRoom().run('-x', Array(3).fill('cabin_pc'), { prio: 1, winOk: true, slide: 0.25 });
  assert.equal(strict.length, 2, 'slide carries a row without skipMissing past the keep-out too, and it stops at the far corner');
});

test('Layout.run: without `slide` the row is what it was: `skipMissing` goes on past a unit that does not fit, and its absence ends the row there', () => {
  const names = ['shop_counter_wood', 'shop_counter_wood', 'cabin_pc'];            // 2.0 m, 2.0 m and 0.95 m along a 3 m wall: the second counter does not fit, the cabin does
  const skip = cornerDoorRoom().run('+x', names, { prio: 1, skipMissing: true, winOk: true });
  assert.deepEqual(skip.map((i) => i.name), ['shop_counter_wood', 'cabin_pc'], 'skipMissing: the cabin stands after the counter that did not fit');
  const strict = cornerDoorRoom().run('+x', names, { prio: 1, winOk: true });
  assert.deepEqual(strict.map((i) => i.name), ['shop_counter_wood'], 'without skipMissing the row ends at the counter that did not fit');
  const slid = cornerDoorRoom().run('+x', names, { prio: 1, skipMissing: true, winOk: true, slide: 0.25 });
  assert.deepEqual(slid.map((i) => i.name), ['shop_counter_wood', 'cabin_pc'], 'a row with nothing to slide past is the same row with `slide`');
});

test('census: every minutes shop of the barrio has cabins (L15 and L76 had none: the row stopped at the corner a door keeps free), a stool tucked to a cabin, and the sweets on a rack', () => {
  const shops = trade('minutos');
  assert.ok(shops.length >= 2, `the real plans have minutes shops (${shops.length})`);
  const bad = shops.filter(({ L }) => named(L, 'cabin_pc').length < 2).map(({ bp, rid, L }) => `${bp.id}.${rid} ${L.W.toFixed(2)}x${L.D.toFixed(2)}: ${named(L, 'cabin_pc').length} cabin(s)`);
  assert.deepEqual(bad, [], 'minutes shops with fewer than two cabins');
  const stools = shops.flatMap(({ L }) => L.items.filter((i) => i.flags?.cabinSeat));
  assert.ok(stools.length >= 1, `a cabin has its stool, set in the cabin's own front zone (\`tuck\`): ${stools.length}`);
  for (const { bp, rid, L } of shops) {
    const racks = named(L, 'chips_rack');
    assert.ok(racks.length >= 1, `${bp.id}.${rid}: no rack of sweets`);
    for (const rack of racks) assert.ok((bp.goods ?? []).filter((g) => g.parent === rack.id).length >= 2, `${bp.id}.${rid}: the rack carries ${(bp.goods ?? []).filter((g) => g.parent === rack.id).length} article(s)`);
  }
});

test('minutos(): any shop room of the barrio fitted as one gets two cabins or more, and a counter wherever the room is 3 m across or more (the cabins came first and took every wall: the counter went in only after a row of six)', () => {
  const bad = []; let runs = 0;
  for (const bp of w.bps) for (const room of bp.rooms.filter((r) => r.type === 'shop')) {
    for (let seed = 1; seed <= 2; seed++) {
      runs++;
      const hh = { tints: {}, income: 0, kind: 'shopkeeper', kids: 0, pets: [], tidy: 0.5, religious: 0, hobby: null }, L = new Layout({ bp, room, rng: makeRng(seed), hh });
      shopRoom(L, { bp, used: new Set(), forceShop: 'minutos' }, hh);
      const cabins = named(L, 'cabin_pc').length, counter = L.items.some((i) => i.floor && i.flags?.counter);
      if (cabins < 2) bad.push(`${room.id} seed ${seed} ${L.W.toFixed(2)}x${L.D.toFixed(2)}: ${cabins} cabin(s)`);
      else if (Math.min(L.W, L.D) >= 3 && !counter) bad.push(`${room.id} seed ${seed} ${L.W.toFixed(2)}x${L.D.toFixed(2)}: no counter`);
    }
  }
  assert.ok(runs >= 40, `the barrio has shop rooms to try (${runs} runs)`);
  assert.deepEqual(bad, [], `${bad.length} of ${runs} runs`);
});

test('minutos(): the two minutes shops of the barrio, both under 3 m across (L15: 2.43 m, L76: 1.93 m), are fitted cabins first and keep no counter: a keeper beside a lane that a cabin and its stool leave 1 m wide stood 0.3 m from the way customers walk in (people-spots.test.mjs holds the post 0.8 m off it)', () => {
  const narrow = trade('minutos').filter(({ L }) => Math.min(L.W, L.D) < 3);
  assert.deepEqual(narrow.map(({ bp }) => bp.id).sort(), ['L15', 'L76'], 'the narrow minutes shops of the real plans');
  for (const { bp, rid, L } of narrow) {
    assert.ok(named(L, 'cabin_pc').length >= 2, `${bp.id}.${rid}: ${named(L, 'cabin_pc').length} cabin(s)`);
    assert.equal(L.items.some((i) => i.floor && i.flags?.counter), false, `${bp.id}.${rid} has a counter, and with it a keeper's post inside the customers' way`);
  }
  // the rule is the room's width: a 4 x 3.4 m room is a wide one and gets its counter and its cabins
  const room = { id: 'S.f0.r1', type: 'shop', floor: 0, rect: { x0: 0, z0: 0, x1: 4, z1: 3.4 }, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'S.d1', kind: 'interior', w: 0.9, rooms: ['S.r0', room.id], swing: 1, hinge: 'left', x: 2.0, z: 3.45 }] };
  const hh = { tints: {}, income: 0, kind: 'shopkeeper', kids: 0, pets: [], tidy: 0.5, religious: 0, hobby: null }, L = new Layout({ bp, room, rng: makeRng(1), hh });
  shopRoom(L, { bp, used: new Set(), forceShop: 'minutos' }, hh);
  assert.ok(L.items.some((i) => i.floor && i.flags?.counter) && named(L, 'cabin_pc').length >= 2, `a 3.4 m wide minutes shop has its counter and its cabins (${L.items.map((i) => i.name)})`);
});

test('census: every hardware store has a counter, with the hardware on it (L41 had none: its 2 m counter found no wall)', () => {
  const shops = trade('ferreteria');
  assert.ok(shops.length >= 1, `the real plans have a hardware store (${shops.length})`);
  for (const { bp, rid, L } of shops) {
    const counter = L.items.find((i) => i.floor && i.flags?.counter);
    assert.ok(counter, `${bp.id}.${rid} has no counter`);
    const stock = (bp.goods ?? []).filter((g) => g.parent === counter.id);
    assert.ok(stock.length >= 3, `${bp.id}.${rid}: the ${counter.name} carries ${stock.length} article(s) of stock (hammers, pliers, rope, paint)`);
  }
});

test('census: no shop of the thin trades is a handful of pieces (the butchers had 4 and 5, the barbers 6 to 8, the hardware store and the welder\'s a dozen)', () => {
  const MIN = { carniceria: 8, peluqueria: 8, ferreteria: 11, taller: 13 };            // distinct kinds of floor and wall pieces, decals and what stands on a surface not counted
  const bad = []; let seen = 0;
  for (const [type, min] of Object.entries(MIN)) for (const { bp, rid, L } of trade(type)) {
    if (type === 'taller' && !/solda/i.test(bp.lot?.name ?? '')) continue;               // the motorbike mechanic's has its own pieces: only the welder's was thin
    seen++;
    const k = kinds(L);
    if (k.size < min) bad.push(`${bp.id}.${rid} ${type} ${L.W.toFixed(2)}x${L.D.toFixed(2)}: ${k.size} kinds (${[...k].join(' ')})`);
  }
  assert.ok(seen >= 6, `the census has shops to look at (${seen})`);
  assert.deepEqual(bad, [], 'shops with fewer kinds of piece than their trade has in the library');
});

test('census: the welder\'s shop has its equipment: the bench and an assembly table, the two gas bottles, two bundles of bar stock, a grinder and the pegboard (R4-707: the library has no welding set, mask or steel rack; these are what it has)', () => {
  const shops = trade('taller').filter(({ bp }) => /solda/i.test(bp.lot?.name ?? ''));
  assert.ok(shops.length >= 1, `the real plans have a welder's (${shops.length})`);
  for (const { bp, rid, L } of shops) {
    const have = (name) => named(L, name).length, where = `${bp.id}.${rid}`;
    assert.ok(have('workbench_metal') >= 2, `${where}: ${have('workbench_metal')} metal bench(es)`);
    assert.ok(named(L, 'workbench_metal').some((i) => !i.wallSide), `${where}: no assembly table stands free in the room (the benches are all against a wall)`);
    assert.ok(have('gas_cylinder') >= 2, `${where}: ${have('gas_cylinder')} gas bottle(s)`);
    assert.ok(have('pipes_bundle') >= 2, `${where}: ${have('pipes_bundle')} bundle(s) of bar stock`);
    assert.ok(have('shoe_grinder') >= 1, `${where}: no grinder`);
    assert.ok(have('tool_pegboard') >= 1, `${where}: no pegboard`);
  }
});

test('minutos(): a room 3 m across whose two doors leave the counter-first fitting under two cabins is fitted again, the cabins first and the counter after (3 x 3 m, a door in the -z wall and one in the -x wall: 58 of 3960 rooms tried needed it)', () => {
  for (const seed of [1, 2]) {
    const room = { id: 'S.f0.r1', type: 'shop', floor: 0, rect: { x0: 0, z0: 0, x1: 3, z1: 3 }, y: 0, h: 2.6 };
    const door = (id, x, z) => ({ id, kind: 'interior', w: 0.9, rooms: ['S.r0', room.id], swing: 1, hinge: 'left', x, z });
    const bp = { id: 'S', rooms: [room], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [door('S.d0', 0.835, -0.05), door('S.d1', -0.05, 2.165)] };
    const hh = { tints: {}, income: 0, kind: 'shopkeeper', kids: 0, pets: [], tidy: 0.5, religious: 0, hobby: null }, L = new Layout({ bp, room, rng: makeRng(seed), hh });
    let removed = 0; const remove = L.remove.bind(L); L.remove = (it) => { removed++; return remove(it); };
    shopRoom(L, { bp, used: new Set(), forceShop: 'minutos' }, hh);
    assert.ok(removed > 0, `seed ${seed}: the first fitting stood the counter first and left under two cabins, so the shop was fitted again (this room is that scenario)`);
    assert.ok(named(L, 'cabin_pc').length >= 2, `seed ${seed}: ${named(L, 'cabin_pc').length} cabin(s) after the second fitting (${L.items.filter((i) => i.floor).map((i) => i.name)})`);
  }
});

test('the minutes shops without a counter (L15, L76) keep what the counter gave them: the shop story is told at a cabin on the shop floor and the cabin answers "Mirar las cabinas" (the story hung on a cooking stove upstairs, and "Mirar el mostrador" was gone)', () => {
  const D = [...w.ctx.discover.items.values()], I = [...w.ctx.interact.items.values()].filter((i) => i.id.startsWith('int:'));
  const bare = trade('minutos').filter(({ L }) => !L.items.some((i) => i.floor && i.flags?.counter));
  assert.deepEqual(bare.map(({ bp }) => bp.id).sort(), ['L15', 'L76'], 'the minutes shops of the real plans without a counter');
  for (const { bp, rid, L } of bare) {
    const room = bp.rooms.find((r) => r.id === rid), where = `${bp.id}.${rid}`;
    const story = D.filter((d) => d.building === bp.id && d.name.startsWith(SHOP_STORY.minutos.name));
    assert.equal(story.length, 1, `${where}: ${story.length} shop stories`);
    const [lx, , lz] = bp.frame.toLocal(story[0].x, story[0].y, story[0].z), floorY = bp.lot.y + bp.floors[room.floor].y;
    assert.ok(lx >= room.rect.x0 && lx <= room.rect.x1 && lz >= room.rect.z0 && lz <= room.rect.z1 && Math.abs(story[0].y - floorY) < 0.5,
      `${where}: the shop's story is told at (${lx.toFixed(2)}, ${lz.toFixed(2)}) y ${story[0].y}, not in the shop room (x ${room.rect.x0}..${room.rect.x1}, z ${room.rect.z0}..${room.rect.z1}, floor y ${floorY})`);
    const look = I.filter((i) => i.building === bp.id && i.prompt === 'Mirar las cabinas');
    assert.equal(look.length, 1, `${where}: ${look.length} "Mirar las cabinas"`);
    assert.equal(L.items.find((it) => `int:${it.id}` === look[0].id)?.name, 'cabin_pc', `${where}: the prompt is on a cabin`);
  }
});

test('a minutes shop that has a counter keeps "Mirar el mostrador" on it: the cabins answer for the counter only where the room has none (L15 with its last cabin made the counter)', () => {
  const { bp, L } = trade('minutos').find(({ bp: b }) => b.id === 'L15');
  const cabins = named(L, 'cabin_pc'), last = cabins[cabins.length - 1];
  const rngFor = () => makeRng((hashStr('stories:' + bp.id) ^ ((w.ctx.seed ?? 0) >>> 0)) >>> 0).fork('act');
  const mine = () => [...w.ctx.interact.items.values()].filter((i) => i.id.startsWith('int:') && i.building === bp.id);
  const redo = () => { for (const i of mine()) w.ctx.interact.unregister(i.id); return collectInteractables(w.ctx, bp, rngFor()); };
  const promptOn = (it) => mine().find((i) => i.id === `int:${it.id}`)?.prompt;
  const answering = () => cabins.filter((c) => promptOn(c) === 'Mirar las cabinas').length;
  assert.ok(cabins.length >= 2 && !last.flags?.counter, `L15 has cabins to play with (${cabins.length})`);
  try {
    last.flags = { ...last.flags, counter: true };
    redo();
    assert.equal(promptOn(last), 'Mirar el mostrador', 'the counter answers as the counter');
    assert.equal(answering(), 0, 'no cabin answers for a counter that is there');
  } finally { delete last.flags.counter; redo(); }
  assert.equal(answering(), 1, 'control: with no counter the first cabin answers, once');
});
