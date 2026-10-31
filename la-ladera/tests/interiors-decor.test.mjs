// INTERIORS decor: no two homes of the barrio read as copies of one another (the lead's R4 list, 'decor sameness'). On A2's real plans: no building hangs the same picture twice, no kind of
// wall decoration (a clock, a mirror, a family photo, a calendar, the rent notice) hangs in more than a third of the rooms of a type, no bathroom has a clock, and the 'se arrienda' sign
// is in a few stairwells, not all of them. Unit tests pin the two helpers behind it (decor.js `art`, `ration`).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-decor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { DECALS, decalIds } from '../js/interiors/decals.js';
import { POOLS, art, clock, mirror, notice } from '../js/interiors/decor.js';
import { paintedIds } from '../js/interiors/atlas.js';
import { makeRng } from '../js/core/rng.js';

const { bps } = await furnishedBatch({ real: true });
// what a wall of a home shows to be looked at: pictures, photos, drawings, posters, calendars, notices and the diploma; not the chapel's Stations, nor a school's or a shop's own charts and boards
const HOME_ART = new Set(['art', 'photo', 'kids', 'poster', 'calendar', 'religion', 'notice', 'document']);
const isArt = (id) => HOME_ART.has(DECALS[id]?.kind) && id !== 'stations';
const rooms = [];
for (const bp of bps) {
  for (const [rid, L] of bp.interior?.layouts ?? []) {
    const names = new Map();
    for (const it of L.items) { const n = it.name.startsWith('decal:') ? it.name.slice(6) : it.name; if (n === 'clock_wall' || n === 'mirror_wall' || (it.name.startsWith('decal:') && isArt(n))) names.set(n, (names.get(n) ?? 0) + 1); }
    rooms.push({ bp, rid, type: L.room.type, names });
  }
}

test('census: no building hangs the same picture, photo, calendar, poster, drawing, notice or blessing twice', () => {
  const bad = [];
  for (const bp of bps) {
    const count = new Map();
    for (const r of rooms) if (r.bp === bp) for (const [n, k] of r.names) if (n !== 'clock_wall' && n !== 'mirror_wall') count.set(n, (count.get(n) ?? 0) + k);
    for (const [n, k] of count) if (k > 1) bad.push(`${bp.id} ${n} x${k}`);
  }
  assert.equal(bad.length, 0, `${bad.length} repeats in one building:\n  ${bad.slice(0, 12).join('\n  ')}`);
});

test('census: no wall decoration hangs in more than 35% of the rooms of a kind of room (types of 40 rooms or more)', () => {
  const byType = new Map();
  for (const r of rooms) { const t = byType.get(r.type) ?? { n: 0, names: new Map() }; byType.set(r.type, t); t.n++; for (const n of r.names.keys()) t.names.set(n, (t.names.get(n) ?? 0) + 1); }
  const big = [...byType].filter(([, t]) => t.n >= 40);
  assert.ok(big.length >= 5, `the barrio has ${big.length} room types of 40 rooms or more (bedroom, living, kitchen, ...)`);
  const bad = [];
  for (const [type, t] of big) for (const [n, k] of t.names) if (k / t.n > 0.35) bad.push(`${type} (${t.n} rooms): ${n} in ${k} = ${(100 * k / t.n).toFixed(0)}%`);
  assert.equal(bad.length, 0, `${bad.length} decorations in more than a third of the rooms of a type:\n  ${bad.join('\n  ')}`);
});

test('census: no bathroom has a clock on its wall', () => {
  const bad = rooms.filter((r) => r.type === 'bathroom' && r.names.has('clock_wall')).map((r) => r.rid);
  assert.ok(rooms.filter((r) => r.type === 'bathroom').length >= 100, 'the barrio has its bathrooms');
  assert.equal(bad.length, 0, `${bad.length} bathrooms with a clock: ${bad.slice(0, 8).join(' ')}`);
});

test('census: a room hangs one calendar (the kitchens of shop families hung two side by side: R4-109)', () => {
  const cal = (r) => [...r.names].filter(([n]) => DECALS[n]?.kind === 'calendar').reduce((a, [, k]) => a + k, 0);
  const many = rooms.filter((r) => cal(r) > 1).map((r) => `${r.bp.id}:${r.rid} ${r.type} x${cal(r)}`);
  assert.ok(rooms.filter((r) => cal(r) === 1).length >= 200, 'the barrio hangs calendars');
  assert.equal(many.length, 0, `${many.length} rooms with more than one calendar: ${many.slice(0, 8).join(', ')}`);
});

test('census: a clinic hangs at most two posters of a kind and keeps no wheelbarrow; outdoor tools stand indoors only where they work (R4-114)', () => {
  const bad = [], clinics = bps.filter((bp) => bp.lot?.kind === 'clinic');
  assert.ok(clinics.length >= 1, 'the barrio has a clinic');
  for (const bp of clinics) {
    const count = new Map();
    for (const L of bp.interior.layouts.values()) for (const it of L.items) count.set(it.name, (count.get(it.name) ?? 0) + 1);
    for (const id of ['health_poster', 'eye_chart', 'vaccines']) if ((count.get('decal:' + id) ?? 0) > 2) bad.push(`${bp.id}: ${count.get('decal:' + id)} x ${id}`);
  }
  let barrows = 0;
  for (const bp of bps) for (const L of bp.interior.layouts.values()) for (const it of L.items) {
    if (it.name !== 'wheelbarrow') continue;
    barrows++;
    if (!(L.room.outdoor || bp.lot?.kind === 'unfinished' || bp.lot?.kind === 'workshop' || bp.interior.shopType === 'ferreteria')) bad.push(`${bp.id}.${L.room.id}: a wheelbarrow in a ${L.room.type} of a ${bp.lot?.kind}`);
  }
  assert.ok(barrows >= 5, `the barrio has wheelbarrows where they work (${barrows})`);
  assert.equal(bad.length, 0, `${bad.length} clinic or outdoor-tool problems: ${bad.slice(0, 8).join('; ')}`);
});

test('census: the rent notice hangs in a few stairwells and landings, and the stairs carry other notices as well', () => {
  const stairs = rooms.filter((r) => r.type === 'stairwell' || r.type === 'landing');
  const rent = stairs.filter((r) => r.names.has('notice_rent')).length, kinds = new Set();
  for (const r of stairs) for (const n of r.names.keys()) if (DECALS[n]?.kind === 'notice') kinds.add(n);
  assert.ok(stairs.length >= 100, `${stairs.length} stair rooms`);
  assert.ok(rent >= 3, `the rent notice hangs in ${rent} stair rooms: a few`);
  assert.ok(rent / stairs.length <= 0.2, `the rent notice hangs in ${rent} of ${stairs.length} stair rooms: a few, not every stair`);
  assert.ok(kinds.size >= 4, `${kinds.size} kinds of notice on the stairs: ${[...kinds].join(' ')}`);
});

test('pools: every picture of a pool exists, has a painter in the atlas, and the pools are wide enough that a house need not repeat itself', () => {
  const painted = new Set(paintedIds());
  const missing = decalIds.filter((id) => !painted.has(id));
  assert.deepEqual(missing, [], `decals without a painter (the atlas would leave them blank): ${missing.join(' ')}`);
  for (const [name, list] of Object.entries(POOLS)) for (const id of list) assert.ok(DECALS[id], `${name}: ${id} is not a decal`);
  for (const [name, min] of Object.entries({ art: 12, family: 12, cal: 10, kids: 8, sport: 5, faithPic: 5, blessing: 4, notice: 4 })) assert.ok(POOLS[name].length >= min, `${name}: ${POOLS[name].length} pictures, wanted ${min}`);
});

/** A room reduced to what decor.js reads: its type and id, its items, its random stream, and a `hang` that always finds a wall. */
const fakeRoom = (type = 'bedroom', n = 5) => ({ room: { id: `T.f0.r${n}`, type }, items: [], rng: makeRng(n), hang(name) { const it = { name }; this.items.push(it); return it; } });
const fakeBuilding = (n) => ({ bp: { id: `T${n}` } });

test('art(): one decal of a pool per call, none twice in a building, and nothing once the pool is used up', () => {
  const E = fakeBuilding(1), L = fakeRoom('living'), got = [];
  for (let i = 0; i < 6; i++) { const it = art(L, E, 'notice', 'any'); got.push(it ? it.name : null); }
  const real = got.filter(Boolean);
  assert.equal(real.length, POOLS.notice.length, 'as many as the pool holds');
  assert.equal(new Set(real).size, real.length, 'all different');
  assert.deepEqual(got.slice(POOLS.notice.length), [null, null], 'then nothing');
  const other = art(fakeRoom('living', 6), fakeBuilding(2), 'notice', 'any');
  assert.ok(other, 'another building starts again');
});

test('art(): a room that hangs a calendar takes no second one, from the calendar pool or from any list that holds calendars', () => {
  const E = fakeBuilding(1), L = fakeRoom('kitchen', 3), first = art(L, E, 'cal', 'any');
  assert.ok(first && first.name.startsWith('decal:calendar_'), 'the first calendar hangs');
  assert.equal(art(L, E, 'cal', 'any'), null, 'no second from the pool');
  assert.equal(art(L, E, POOLS.cal.slice(), 'any'), null, 'nor from a list of calendars');
  assert.ok(art(L, E, 'family', 'any'), 'other pictures still hang');
  assert.ok(art(fakeRoom('kitchen', 4), E, 'cal', 'any'), 'another room takes its own');
});

test('art(): a decal with a cap (the chore chart, the diploma) hangs in about that share of the rooms, and without a cap in every room that has the wall', () => {
  let capped = 0, free = 0;
  for (let i = 0; i < 400; i++) if (art(fakeRoom('kitchen', i + 1), fakeBuilding(i), ['chores'], 'any', { cap: 0.25 })) capped++;
  for (let i = 0; i < 100; i++) if (art(fakeRoom('kitchen', i + 1), fakeBuilding(i), ['chores'], 'any')) free++;
  assert.ok(capped >= 70 && capped <= 130, `${capped} chore charts in 400 kitchens (a quarter: 100)`);
  assert.equal(free, 100, 'no cap: every kitchen with a wall takes it');
});

test('clock() and mirror(): about a quarter of the rooms of a type, the same answer for a room whoever was furnished before it, and never a clock in a bathroom', () => {
  let clocks = 0, mirrors = 0;
  const answers = [];
  for (let i = 0; i < 400; i++) {
    const L = fakeRoom('bedroom', i + 1), E = fakeBuilding(i);
    const c = !!clock(L, E), m = !!mirror(L, E);
    if (c) clocks++; if (m) mirrors++;
    answers.push(c);
  }
  assert.ok(clocks >= 70 && clocks <= 130, `${clocks} clocks in 400 rooms (a quarter: 100)`);
  assert.ok(mirrors >= 70 && mirrors <= 130, `${mirrors} mirrors in 400 rooms (a quarter: 100)`);
  const again = [];
  for (let i = 399; i >= 0; i--) again.unshift(!!clock(fakeRoom('bedroom', i + 1), fakeBuilding(i)));
  assert.deepEqual(again, answers, 'the same rooms answer the same in another order');
  for (let i = 0; i < 100; i++) assert.equal(clock(fakeRoom('bathroom', i + 1), fakeBuilding(i)), null, 'a bathroom takes no clock');
  let tested = false;
  for (let i = 0; i < 40 && !tested; i++) { const L = fakeRoom('living', i + 1), E = fakeBuilding(i); if (clock(L, E)) { assert.equal(clock(L, E), null, 'one clock to a room'); tested = true; } }
  assert.ok(tested, 'some room took a clock');
});

test('notice(): the rent sign goes to about one stair room in ten, the other notices to the rest', () => {
  let rent = 0, other = 0;
  for (let i = 0; i < 400; i++) {
    const L = fakeRoom('landing', i + 1), E = fakeBuilding(i);
    const it = notice(L, E, 'any'); if (!it) continue;
    if (it.name === 'decal:notice_rent') rent++; else other++;
  }
  assert.ok(rent >= 20 && rent <= 60, `${rent} rent notices in 400 rooms (about one in ten)`);
  assert.ok(other >= 300, `${other} other notices`);
});
