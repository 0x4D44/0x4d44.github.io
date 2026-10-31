// The first frame has people in the middle distance (A5's hero-shot order): at the arrival point, looking along plan.spawn.yaw, the fan 10-30 m ahead and 35 degrees either side of the
// view holds somebody walking away up the street, somebody standing, and two people talking, from the first frame to the thirtieth second. The arrival ring of 9-34 m was five people
// of whom the first five of the cast are the shopkeepers (at their posts, indoors), so the middle distance was empty. Every check here has a mutant that turns it red
// (.scratch/a4/mutations_arrival.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-arrival.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildData } from './headless.mjs';
import { PeopleSim } from '../js/people/sim.js';
import { Brain } from '../js/people/brain.js';
import { blockAt } from '../js/people/schedule.js';
import { ARRIVAL, PARTS, ahead, arrivalNear, pickArrivals, viewDir } from '../js/people/arrival.js';
import { inSpawnFan } from '../js/world/kit.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { ctx, plan } = await buildData({ furnish: true, colliders: true });
const METAS = new Map(JSON.parse(readFileSync(resolve(ROOT, 'assets/models/people/people_meta.json'), 'utf8')).people.map((m) => [m.id, m]));
const sp = plan.spawn, view = viewDir(sp), near = arrivalNear(sp);
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angle = (p) => Math.acos(Math.max(-1, Math.min(1, ((p.x - sp.x) * view.x + (p.z - sp.z) * view.z) / dist2(p, sp))));
const fresh = (hour) => {
  for (const [id] of ctx.physics.doors) ctx.physics.setDoor(id, false);
  ctx.hour = hour; ctx.errors = [];
  const sim = new PeopleSim(ctx); assert.ok(sim.build(METAS), 'the cast is built'); sim.setPlayer(sp.x, sp.y ?? 0, sp.z, sp.yaw ?? 0);
  return sim;
};
const outdoors = (sim) => sim.npcs.filter((n) => !n.away && ahead(near, n) && sim.lotAt(n.x, n.z) == null);

// ---- the fan ----------------------------------------------------------------------------------------------------------------------------------------
test('ahead: 10 to 30 m from the spawn, 35 degrees either side of the way the player looks; the same fan js/world/kit.js inSpawnFan draws', () => {
  const at = (d, deg) => ({ x: sp.x + (view.x * Math.cos(deg) - view.z * Math.sin(deg)) * d, z: sp.z + (view.x * Math.sin(deg) + view.z * Math.cos(deg)) * d });
  const rad = (d) => (d * Math.PI) / 180;
  assert.equal(ahead(near, at(20, 0)), true, 'straight ahead, 20 m');
  assert.equal(ahead(near, at(9, 0)), false, 'too near'); assert.equal(ahead(near, at(31, 0)), false, 'too far');
  assert.equal(ahead(near, at(20, rad(34))), true, '34 degrees to one side'); assert.equal(ahead(near, at(20, rad(-34))), true, 'and to the other');
  assert.equal(ahead(near, at(20, rad(36))), false, '36 degrees'); assert.equal(ahead(near, at(20, rad(180))), false, 'behind the camera');
  assert.equal(ahead({ x: 0, z: 0, min: 5, max: 9 }, { x: 0, z: 7 }), true, 'without a fan only the distances count (the plain ring)');
  for (let d = 10.5; d <= 29.5; d += 2) for (let deg = -80; deg <= 80; deg += 5) {
    const p = at(d, rad(deg));
    assert.equal(ahead(near, p), inSpawnFan(plan, p.x, p.z, 0, { depth: ARRIVAL.max, half: ARRIVAL.half }), `${d} m, ${deg} degrees: the same answer as the kit's fan`);
  }
});

test('pickArrivals: four parts, four different bodies, grown-ups who are out; the fifth keeps the plain ring; at night nobody', () => {
  const mk = (id, gender, age, charId, extra = {}) => ({ id, gender, age, charId, routine: 'neighbour', ...extra });
  const npcs = [mk('s', 'f', 'adult', 'w_shop', { routine: 'shopkeeper' }), mk('k', 'm', 'kid', 'b_boy'), mk('a', 'f', 'adult', 'w_vecina'), mk('a2', 'f', 'adult', 'w_vecina'), mk('e', 'f', 'elder', 'w_elder'), mk('b', 'm', 'adult', 'm_joven'),
    mk('b2', 'm', 'adult', 'm_joven'), mk('c', 'f', 'adult', 'w_cocinera'), mk('d', 'm', 'adult', 'm_afro'), mk('z', 'm', 'teen', 't_boy'), mk('sl', 'f', 'adult', 'w_asleep')];
  const block = (n, h) => (n.id === 'sl' || h < 6 ? 'sleep' : 'free');
  const out = pickArrivals(npcs, 12, block, sp), part = (id) => out.get(npcs.find((n) => n.id === id))?.role ?? (out.has(npcs.find((n) => n.id === id)) ? 'ring' : null);
  assert.deepEqual(['s', 'k', 'sl', 'a2'].map(part), [null, null, null, null], 'no shopkeeper (at the post), no child, nobody asleep, and no second w_vecina');
  assert.equal(out.size, 5, 'four parts and the fifth');
  assert.deepEqual(PARTS.map(([p]) => p), ['walk', 'stand', 'chat', 'chat'], 'a walker, a stander and two talkers');
  const roles = [...out.values()].map((v) => v.role ?? 'ring'); assert.deepEqual(roles.sort(), ['chat', 'chat', 'ring', 'stand', 'walk']);
  assert.equal(new Set([...out.keys()].map((n) => n.charId)).size, 5, 'five different bodies');
  assert.notEqual(part('e'), 'walk', 'an elder does not walk the long way up the street');
  for (const v of out.values()) if (v.role) assert.deepEqual({ min: v.min, max: v.max }, { min: 10, max: 30 }, `${v.role} stands in the fan`);
  assert.equal(pickArrivals(npcs, 3, block, sp).size, 0, 'at night nobody is out');
});

// ---- the barrio -------------------------------------------------------------------------------------------------------------------------------------
test('the first frame at the game hour (17:12): a walker, a stander and a pair in conversation are in the fan, outdoors, from the first frame', () => {
  const sim = fresh(17.2), people = outdoors(sim);
  assert.ok(people.length >= 4, `${people.length} people outdoors in the fan: ${people.map((n) => `${n.id} ${n.persona} ${n.act}/${n.mode}`)}`);
  const walkers = people.filter((n) => n.mode === 'walk'), talkers = people.filter((n) => n.convo);
  assert.ok(walkers.length >= 1, 'one is walking');
  for (const w of walkers) {
    const end = w.path[w.path.length - 1];
    assert.ok(dist2(end, sp) >= dist2(w, sp) + 20 && angle(end) <= ARRIVAL.half, `${w.id} walks away from the player (${dist2(w, sp).toFixed(0)} m now, ${dist2(end, sp).toFixed(0)} m at the end) along the street the player looks down (${(angle(end) * 57.3).toFixed(0)} degrees)`);
  }
  assert.ok(talkers.length >= 2 && new Set(talkers.map((n) => n.convo)).size >= 1, 'two are talking to each other');
  const [a, b] = talkers; assert.equal(a.convo, b.convo, 'with each other'); assert.ok(dist2(a, b) < 1.4, `side by side (${dist2(a, b).toFixed(2)} m)`);
  const segDist = (p, s, t) => { const dx = t.x - s.x, dz = t.z - s.z, l2 = dx * dx + dz * dz, k = l2 ? Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.z - s.z) * dz) / l2)) : 0; return Math.hypot(p.x - (s.x + dx * k), p.z - (s.z + dz * k)); };
  for (const w of walkers) for (const p of people.filter((m) => m.mode !== 'walk')) {
    const route = [{ x: w.x, z: w.z }, ...w.path.slice(w.pi ?? 0)], gap = Math.min(...route.slice(1).map((t, i) => segDist(p, route[i], t)));
    assert.ok(gap >= 1.1, `${w.id} would walk ${gap.toFixed(2)} m from ${p.id}, who stands in the street: nobody walks through the others in the first frame`);
  }
  assert.ok(people.some((n) => n.mode === 'idle' && !n.convo), 'and one is standing');
  assert.equal(new Set(people.map((n) => n.charId)).size, people.length, 'no two of the same character in the one view');
  assert.deepEqual(sim.faults, [], 'no fault');
});

test('and for the first 25 seconds: the standers stay, the talkers talk, the walker is on the street ahead, nobody is in a wall', () => {
  const sim = fresh(17.2), start = new Map(outdoors(sim).map((n) => [n.id, { x: n.x, z: n.z, mode: n.mode, convo: !!n.convo }]));
  assert.ok(start.size >= 4);
  for (let t = 0; t < 25; t += 0.05) sim.step(0.05);
  for (const [id, s] of start) {
    const n = sim.byId.get(id), here = `${id} (${n.persona}, ${s.mode}${s.convo ? ', talking' : ''})`;
    assert.equal(n.away, false, `${here} is still out`);
    if (s.mode === 'idle') assert.ok(dist2(n, s) < 0.6 && ahead(near, n), `${here} is where it was (${dist2(n, s).toFixed(2)} m away)`);
    if (s.convo) assert.ok(n.convo, `${here} is still talking`);
    if (s.mode === 'walk') assert.ok(dist2(n, sp) > Math.hypot(s.x - sp.x, s.z - sp.z) + 8 && angle(n) <= ARRIVAL.half + 0.05, `${here} has walked ${(dist2(n, sp) - Math.hypot(s.x - sp.x, s.z - sp.z)).toFixed(0)} m up the street`);
  }
  assert.deepEqual(sim.faults, [], 'no fault');
  for (const id of start.keys()) { const n = sim.byId.get(id); assert.ok(!ctx.physics._overlaps?.(n.x, n.z, n.y, 0.2, 1.5), `${id} stands in a wall at ${n.x.toFixed(1)}, ${n.z.toFixed(1)}`); }
});

test('at other hours the same: 10:00 and 14:00 have at least two people in the fan (the barrio is awake)', () => {
  for (const hour of [10, 14, 19.5]) {
    const sim = fresh(hour), people = outdoors(sim);
    assert.ok(people.length >= 2, `${hour}: ${people.length} in the fan (${people.map((n) => `${n.id} ${n.persona}`)})`);
  }
});

test('fanNodes: the two who talk get the near part of the fan, the walker the middle, the one who stands the far part; a node with somebody on it is not offered; no node in the band: any in the fan', () => {
  const node = (i, d) => ({ i, x: sp.x + view.x * d, y: 0, z: sp.z + view.z * d, kind: 'path' }), nodes = [node(0, 12.5), node(1, 15), node(2, 21), node(3, 26.5), node(4, 28.5), { ...node(5, 20), x: sp.x + 60 }];       // the last is 60 m off to the side: not in the fan
  const me = { id: 'm', charId: 'b', x: 0, z: 0, away: false, mode: 'idle' }, W = { npcs: [me], nav: { nodes }, inMain: () => true }, brain = new Brain(W);
  const ids = (part, others = []) => { W.npcs = [me, ...others]; return brain.fanNodes(me, near, part).map((n) => n.i).join(','); };
  assert.equal(ids('chat'), '0,1', 'the two who talk: 10 to 16 m'); assert.equal(ids('walk'), '2', 'the walker: 16 to 24 m'); assert.equal(ids('stand'), '3,4', 'the one who stands: 24 to 30 m');
  const there = (i, extra = {}) => ({ id: 'o' + i, charId: 'c', x: nodes[i].x, z: nodes[i].z, away: false, mode: 'idle', ...extra });
  assert.equal(ids('chat', [there(0)]), '1', 'somebody stands on node 0: it is not offered'); assert.equal(ids('chat', [there(0, { away: true })]), '0,1', 'somebody who is indoors does not stand there');
  assert.equal(ids('chat', [there(0, { mode: 'walk', path: [{ x: 0, z: 0 }] })]), '1', 'somebody who has just been put on the node and is walking off is still there');
  assert.equal(ids('walk', [there(2)]), '0,1,3,4', 'the walker\'s band is taken: any other node of the fan, not the one with somebody on it');
});

test('the five who start in view are not the shopkeepers (the first five of the cast): the hero shot does not depend on who is posted at a shop', () => {
  const sim = fresh(17.2), cohort = pickArrivals(sim.npcs, 17.2, blockAt, sp);
  assert.ok(cohort.size >= 4 && [...cohort.keys()].every((n) => n.routine !== 'shopkeeper' && n.age !== 'kid'), 'grown-ups out of doors');
  assert.ok(cohort.size <= 5, 'at most five');
});
