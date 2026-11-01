// Clones (R3-006): the library has 30 bodies for 86 people, so some neighbours are drawn from the same character; they must not be neighbours in the street. Three pieces:
// casting spreads a persona over its characters (three mototaxi riders are three bodies), and wherever somebody CHOOSES a place (a bench, a chat corner, a node of the street
// graph at the stand, the site, the plaza) a place beside a twin is far less likely and nobody is put on top of anybody. The end-to-end check (a five-minute soak at 9:00 and 16:00
// with nobody standing within 1.5 m of a twin) is in people-sim.test.mjs. Every check here has a mutant that turns it red (.scratch/a4/mutations_clones.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-clones.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../js/people/brain.js';
import { NavGraph } from '../js/people/nav.js';
import { Spots } from '../js/people/spots.js';
import { planCast, candidates } from '../js/people/cast.js';
import { PERSONAS, COMMUNITY_PERSONAS } from '../js/people/personas.js';
import { TWIN_R, CROWD_R, TWIN_WEIGHT, SLOT_R, TWIN_SLOT_R, TAIL_R, refOf, isTwin, twinWeight, spreadNodes, slotAt, tailsTwin } from '../js/people/twins.js';
import { Npc } from '../js/people/npc.js';
import { makeRng } from '../js/core/rng.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const METAS = new Map(JSON.parse(readFileSync(resolve(ROOT, 'assets/models/people/people_meta.json'), 'utf8')).people.map((m) => [m.id, m]));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---- stubs: just what the brain reaches on its world -----------------------------------------------------------------------------------------------
function person(id, charId, x, z, seed = 1, extra = {}) {
  return { id, charId, persona: 'vecina', x, z, ry: 0, st: { x, z }, mode: 'idle', away: false, path: null, spot: null, lastSpot: null, rng: makeRng(seed), stand() {}, ...extra };
}
function world(npcs, { pois = [], lots = [], nodes = [], landmarks = [] } = {}) {
  const spots = new Spots({ plan: { lots, pois }, anchors: [], buildings: new Map() });
  const w = {
    npcs, byId: new Map(npcs.map((n) => [n.id, n])), spots, landmarks, nav: { nodes }, inMain: () => true,
    lots: { byId: new Map(lots.map((l) => [l.id, l])) },
    placeNpc(n, x, z) { n.x = n.st.x = x; n.z = n.st.z = z; },
  };
  return w;
}
/** Four graph nodes five metres apart round (cx, cz): room for three people four metres from one another. */
const ring = (cx, cz, kind = 'street') => [[0, 0], [5, 0], [-5, 0], [0, 5]].map(([dx, dz], i) => ({ i, x: cx + dx, y: 0, z: cz + dz, kind }));

// ---- Spots.pick: the weight --------------------------------------------------------------------------------------------------------------------------
test('Spots.pick: o.weight makes a place less likely, and without it nothing changes', () => {
  const S = new Spots({ plan: { lots: [], pois: [{ id: 'a', kind: 'bench', x: 10, y: 0, z: 0 }, { id: 'b', kind: 'bench', x: -10, y: 0, z: 0 }] }, anchors: [], buildings: new Map() });
  const rng = makeRng(5), count = (o) => { let a = 0; for (let k = 0; k < 400; k++) if (S.pick('bench', 0, 0, rng, o).id === 'a') a++; return a; };
  const plain = count({}), shy = count({ weight: (s) => (s.id === 'a' ? 0.04 : 1) });
  assert.ok(plain > 140 && plain < 260, `two benches at the same distance are picked about evenly (${plain}/400 for a)`);
  assert.ok(shy < 40, `a bench with weight 0.04 is rarely picked (${shy}/400)`);
  assert.ok(S.pick('bench', 0, 0, rng, { weight: () => 0.04 }), 'a weight never removes the last choices: with every place weighted low one is still found');
});

// ---- twins.js ----------------------------------------------------------------------------------------------------------------------------------------
test('twins: who counts as a twin, where somebody is heading, and what a place beside one is worth', () => {
  const me = person('me', 'w_ama', 0, 0), twin = person('t', 'w_ama', 10, 0), other = person('o', 'm_don', 10, 0);
  assert.equal(isTwin(me, twin), true); assert.equal(isTwin(me, other), false); assert.equal(isTwin(me, me), false, 'nobody is their own twin');
  const all = [me, twin, other], here = { x: 10 + TWIN_R - 0.5, z: 0 }, far = { x: 10 + TWIN_R + 0.5, z: 0 };
  assert.equal(twinWeight(me, here, all), TWIN_WEIGHT, 'a twin within reach of the place');
  assert.equal(twinWeight(me, far, all), 1, 'a twin farther than that');
  assert.equal(twinWeight(me, { x: 10, z: 0 }, [me, other]), 1, 'a stranger on the spot does not count: only the same character');
  twin.away = true; assert.equal(twinWeight(me, { x: 10, z: 0 }, all), 1, 'a twin who is indoors is not there');
  twin.away = false; twin.mode = 'walk'; twin.path = [{ x: 3, z: 3 }, { x: -20, z: 0 }];
  assert.deepEqual({ x: refOf(twin).x, z: refOf(twin).z }, { x: -20, z: 0 }, 'somebody on a walk is where the walk ends');
  assert.equal(twinWeight(me, { x: -20, z: 1 }, all), TWIN_WEIGHT, 'the place a twin is heading to counts');
  assert.equal(twinWeight(me, { x: 10, z: 0 }, all), 1, 'and the place a twin is walking away from does not');
});

test('twins: spreadNodes keeps the nodes clear of twins and of everybody, as far as the list allows', () => {
  const me = person('me', 'm_afro', 100, 100), twin = person('t', 'm_afro', 0, 0), stranger = person('s', 'm_don', 10, 0);
  const A = { x: 3, z: 0 }, B = { x: 10.5, z: 0 }, C = { x: 30, z: 0 }, D = { x: 0, z: 30 };       // A: 3 m from the twin; B: half a metre from the stranger; C and D: free
  const ids = (l) => l.map((n) => n === A ? 'A' : n === B ? 'B' : n === C ? 'C' : 'D').join('');
  assert.equal(ids(spreadNodes(me, [A, B, C, D], [me, twin, stranger])), 'CD', 'A is beside a twin, B is on top of a stranger: C and D are left');
  assert.equal(ids(spreadNodes(me, [A, B], [me, twin, stranger])), 'A', 'no corner is clear of both: the ones nobody stands on (A is 3 m from the twin, which is a clone beside you but not a collision)');
  twin.x = 3.5; assert.equal(ids(spreadNodes(me, [A, B], [me, twin, stranger])), 'AB', 'everything crowded: the whole list, nobody is left without a place');
  assert.ok(CROWD_R >= 1.4 && CROWD_R < TWIN_R, 'nobody on top of anybody is a smaller circle than a clone beside you');
});

test('slotAt: the middle of a shared place first, then a ring round it; nobody on one point, nobody in a wall', () => {
  const spot = { x: 10, z: 20, ry: 0 }, placed = [];
  for (let k = 0; k < 6; k++) placed.push(slotAt(spot, placed));
  assert.deepEqual(placed[0], { x: 10, z: 20 }, 'the first person takes the middle');
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(dist(placed[i], placed[j]) >= SLOT_R - 0.01, `${i} and ${j} are ${dist(placed[i], placed[j]).toFixed(2)} m apart`);
  assert.ok(SLOT_R >= 1.2, 'a step and a bit: well over the half metre the probe asked for');
  const wall = (p) => p.z < 20.5;                                      // everything north of z = 20.5 is a wall: the ring points on that side are out
  const behind = slotAt(spot, [{ x: 10, z: 20 }], wall); assert.ok(behind.z < 20.5 && dist(behind, { x: 10, z: 20 }) >= SLOT_R - 0.01, 'the second person takes a ring point that is not in the wall');
  assert.deepEqual(slotAt(spot, [{ x: 10, z: 20 }], () => false), { x: 10, z: 20 }, 'a place walled in on every side: the middle, not nowhere');
  const near = slotAt(spot, [{ x: 10, z: 20 }, { x: 10 + SLOT_R * Math.sin(0), z: 20 + SLOT_R * Math.cos(0) }]);
  assert.ok(dist(near, { x: 10, z: 20 }) >= SLOT_R - 0.01 && dist(near, { x: 10, z: 20 + SLOT_R }) > 1.2, 'the third goes to a ring point away from the second');
  const ahead = slotAt({ x: 10, z: 20, ry: 1 }, [{ x: 10, z: 20 }]);
  assert.ok(dist(ahead, { x: 10 + SLOT_R * Math.sin(1), z: 20 + SLOT_R * Math.cos(1) }) < 1e-9, 'the first step off the middle is straight ahead of the spot: the ring turns with its facing');
});

// ---- the brain ---------------------------------------------------------------------------------------------------------------------------------------
test('toSpot: children sent to one patch of the court, or two people to one corner, stand a step apart; a bench seats exactly where it is; a chat corner places its own pair', () => {
  const pois = [{ id: 'court', kind: 'play', x: 5, y: 0, z: 5 }, { id: 'corner', kind: 'stand', x: -20, y: 0, z: 0 }, { id: 'bench', kind: 'bench', x: 30, y: 0, z: 0 }, { id: 'chat', kind: 'chat', x: 40, y: 0, z: 0 }];
  const kids = [0, 1, 2, 3, 4, 5].map((k) => person('k' + k, 'b_boy', 100, 100, k + 1));
  const W = world(kids, { pois }), brain = new Brain(W), at = (kind) => W.spots.list(kind)[0];
  W.physics = { _overlaps: (x, z) => z > 5.9 && z < 7 };                  // a hedge on the north side of the court patch: the ring points in it are out
  for (const k of kids) assert.equal(brain.toSpot(k, at('play'), () => {}, { instant: true }), true);
  assert.deepEqual([kids[0].x, kids[0].z], [5, 5], 'the first child is in the middle of the patch');
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(dist(kids[i], kids[j]) >= SLOT_R - 0.01, `children ${i} and ${j} stand ${dist(kids[i], kids[j]).toFixed(2)} m apart`);
  assert.ok(kids.every((k) => !(k.z > 5.9 && k.z < 7)), 'and none of them in the hedge');
  const two = [person('a', 'w_ama', 0, 0, 1), person('b', 'm_don', 0, 0, 2)], W2 = world(two, { pois }), b2 = new Brain(W2);
  for (const n of two) b2.toSpot(n, W2.spots.list('stand')[0], () => {}, { instant: true });
  assert.ok(dist(two[0], two[1]) >= SLOT_R - 0.01, `two people at one corner: ${dist(two[0], two[1]).toFixed(2)} m apart`);
  const walkers = [person('w1', 'b_boy', 100, 100, 7, { mode: 'walk', path: [{ x: 5, z: 5 }] }), person('w2', 'g_girl', 100, 100, 8)], W5 = world(walkers, { pois }), b5 = new Brain(W5), patch = W5.spots.list('play')[0];
  W5.spots.claim(patch, walkers[0]);
  b5.toSpot(walkers[1], patch, () => {}, { instant: true });
  assert.ok(dist(walkers[1], { x: 5, z: 5 + SLOT_R }) < 1e-6, 'a child still walking to the middle of the patch has taken it: the next one stands on the first step of the ring (straight ahead of the patch), not on the far side from wherever the walker is now');
  const seat = [person('s1', 'w_ama', 0, 0, 3), person('s2', 'm_don', 0, 0, 5)], W3 = world(seat, { pois }), b3 = new Brain(W3);
  for (const n of seat) b3.toSpot(n, W3.spots.list('bench')[0], () => {}, { instant: true });
  assert.deepEqual(seat.map((n) => [n.x, n.z]), [[30, 0], [30, 0]], 'a bench seats exactly where it is, whoever is already on it: a seat is never shifted a step to the side');
  const talk = [person('t1', 'w_ama', 0, 0, 4), person('t2', 'm_don', 0, 0, 6)], W4 = world(talk, { pois }), b4 = new Brain(W4);
  for (const n of talk) b4.toSpot(n, W4.spots.list('chat')[0], () => {}, { instant: true });
  assert.deepEqual(talk.map((n) => [n.x, n.z]), [[40, 0], [40, 0]], 'a chat corner: chatHere stands the pair around it, so both come to the corner itself');
});

test('pickSpot: a bench next to a twin is far less likely than a bench next to a stranger', () => {
  const pois = [{ id: 'a', kind: 'bench', x: 10, y: 0, z: 0 }, { id: 'b', kind: 'bench', x: -10, y: 0, z: 0 }];
  const fraction = (otherChar) => {
    const me = person('me', 'w_ama', 0, 0, 3), sitter = person('s', otherChar, 10, 1), W = world([me, sitter], { pois }), brain = new Brain(W); let a = 0;
    for (let k = 0; k < 300; k++) if (brain.pickSpot(me, 'bench', {}, { maxD: 50 }).id === 'a') a++;
    return a / 300;
  };
  assert.ok(fraction('m_don') > 0.3, `beside a stranger the bench is picked about half the time (${fraction('m_don')})`);
  assert.ok(fraction('w_ama') < 0.1, `beside a twin it is picked rarely (${fraction('w_ama')})`);
});

test('chatSpot: nobody joins a twin who is waiting for company; they join a stranger', () => {
  const pois = [{ id: 'near', kind: 'chat', x: 8, y: 0, z: 0 }, { id: 'far', kind: 'chat', x: 25, y: 0, z: 0 }];
  const pick = (waiterChar) => {
    const me = person('me', 'g_girl', 0, 0, 4), waiter = person('w', waiterChar, 8, 0), W = world([me, waiter], { pois }), brain = new Brain(W), near = W.spots.list('chat')[0];
    near.occ.push('w'); near.waiting = 'w'; waiter.spot = near;
    const got = new Set(); for (let k = 0; k < 60; k++) got.add(brain.chatSpot(me, {}).id);
    return [...got].sort().join();
  };
  assert.equal(pick('b_boy'), 'near', 'a stranger waits at the near corner: join them');
  assert.equal(pick('g_girl'), 'far', 'a twin waits there: wait at the free corner instead, to be joined by somebody else');
});

test('excursionSpot: a shopkeeper stepping out of the shop does not pick a corner where a twin waits or a wall a twin leans on', () => {
  const door = { ent: { outside: { x: 0, z: 0 } } };
  const chat = (waiterChar) => {
    const me = person('me', 'w_tendera', 0, 0, 6, { shopLotId: 'L1' }), waiter = person('w', waiterChar, 6, 0);
    const W = world([me, waiter], { pois: [{ id: 'near', kind: 'chat', x: 6, y: 0, z: 0 }, { id: 'far', kind: 'chat', x: 18, y: 0, z: 0 }] }), brain = new Brain(W), near = W.spots.list('chat')[0];
    near.occ.push('w'); near.waiting = 'w'; waiter.spot = near;
    let nearCorner = 0; for (let k = 0; k < 300; k++) if (brain.excursionSpot(me, door, 'chat').id === 'near') nearCorner++;
    return nearCorner / 300;
  };
  assert.ok(chat('m_don') > 0.5, `a neighbour is waiting at the near corner: the shopkeeper goes to talk to them more often than to the far one (${chat('m_don')})`);
  assert.equal(chat('w_tendera'), 0, 'a twin is waiting there: the far corner is the only one left');
  const lean = (leanerChar) => {
    const me = person('me', 'w_tendera', 0, 0, 8, { shopLotId: 'L1' }), leaner = person('l', leanerChar, 3, 0);
    const W = world([me, leaner], { pois: [{ id: 'left', kind: 'lean', x: 3, y: 0, z: 0, building: 'L1' }, { id: 'right', kind: 'lean', x: -3, y: 0, z: 0, building: 'L1' }] }), brain = new Brain(W); let left = 0;
    for (let k = 0; k < 300; k++) if (brain.excursionSpot(me, door, 'lean').id === 'left') left++;
    return left / 300;
  };
  assert.ok(lean('m_don') > 0.3, `with a neighbour on the left wall it is still picked about half the time (${lean('m_don')})`);
  assert.ok(lean('w_tendera') < 0.1, `with a twin there it is rarely picked (${lean('w_tendera')})`);
});

test('three twins sent to the stand, the site and the plaza end on three different corners of it', () => {
  const trials = (name, make, call, where) => {
    for (let seed = 1; seed <= 30; seed++) {
      const npcs = [0, 1, 2].map((k) => person('t' + k, 'm_afro', where.x0, where.z0, seed * 10 + k, { siteLotId: 'S', persona: name })), W = world(npcs, make()), brain = new Brain(W);
      for (const n of npcs) assert.equal(brain[call](n, { instant: true }), true, `${name} placed`);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(dist(npcs[i], npcs[j]) >= 3, `${name}, seed ${seed}: ${npcs[i].id} and ${npcs[j].id} stand ${dist(npcs[i], npcs[j]).toFixed(1)} m apart`);
    }
  };
  trials('mototaxista', () => ({ nodes: ring(0, 0), landmarks: [{ id: 'busstop', x: 0, z: 0 }] }), 'motoWait', { x0: 100, z0: 100 });
  trials('obrero', () => ({ nodes: ring(0, 0), lots: [{ id: 'S', kind: 'unfinished', x: 0, y: 0, z: 0, entrance: { outside: [0, 0, 0] } }] }), 'siteWork', { x0: 100, z0: 100 });
  trials('ambulante', () => ({ nodes: ring(40, 0, 'plaza') }), 'sellRoute', { x0: 0, z0: 0 });
});

// ---- the rest of the places people choose (R3-006: the soak at 9:00 had the drogueria keeper and a neighbour, both m_tendero, 1 m apart) --------------------------
test('do_errand: a customer never walks into a shop whose keeper is the same character while another shop is open', () => {
  const shop = (id, x, open = true) => ({ lot: id, open, ent: { outside: { x, z: -1 } }, cust: [], cpoint: { x, y: 0, z: 1 }, post: { x, y: 0, z: 2.7, ry: 0 } });
  const go = (keeperChar, bOpen, seed) => {
    const keeper = person('k', keeperChar, 0, 2.7), me = person('me', 'm_tendero', 10, 0, seed), W = world([keeper, me]);
    W.shops = new Map([['A', shop('A', 0)], ['B', shop('B', 40, bOpen)]]);
    assert.equal(new Brain(W).do_errand(me, { instant: true }), true, 'an errand was found');
    return me.x;
  };
  const seeds = Array.from({ length: 60 }, (_, k) => k + 1);
  assert.deepEqual([...new Set(seeds.map((s) => go('m_tendero', true, s)))], [40], 'the keeper of the near shop is the same character: every customer goes to the far shop');
  assert.ok(seeds.filter((s) => go('m_don', true, s) === 0).length > 20, 'a keeper of another character: the near shop is still the likelier one');
  assert.deepEqual([...new Set(seeds.map((s) => go('m_tendero', false, s)))], [0], 'the far shop is shut: the only shop open serves them, twin or not');
});

test('toSpot: a child who joins a twin on the court stands out on the wide ring, a child who joins a stranger on the near one', () => {
  const pois = [{ id: 'court', kind: 'play', x: 5, y: 0, z: 5 }];
  const apart = (secondChar) => {
    const first = person('a', 'b_boy', 100, 100, 1), second = person('b', secondChar, 100, 100, 2), W = world([first, second], { pois }), brain = new Brain(W), patch = W.spots.list('play')[0];
    brain.toSpot(first, patch, () => {}, { instant: true }); brain.toSpot(second, patch, () => {}, { instant: true });
    return dist(first, second);
  };
  assert.ok(apart('g_girl') >= SLOT_R - 0.01 && apart('g_girl') < TWIN_SLOT_R - 0.1, `a stranger takes the near ring (${apart('g_girl').toFixed(2)} m)`);
  assert.ok(apart('b_boy') >= TWIN_SLOT_R - 0.01, `a twin is ${apart('b_boy').toFixed(2)} m away, not ${SLOT_R} m`);
  assert.ok(TWIN_SLOT_R > 2.5, 'the wide ring clears the 2.5 m R3 counts a pair by');
});

test('do_wander: the first frame and the next stop of a walk are not beside a twin', () => {
  const nodes = ring(0, 0), twin = (x, z) => person('t', 'm_afro', x, z, 99);
  const nav = { nodes, randomNode: (r, pred) => { const ok = nodes.filter((n) => !pred || pred(n)); return ok[Math.floor(r.next() * ok.length)].i; }, nearest: () => 0, path: (a, b) => [b] };
  const run = (seed, instant) => {
    const me = person('me', 'm_afro', 100, 100, seed, { speedBase: 1.3, age: 'adult', routine: 'neighbour', homeNode: 0, walk(w, pts) { this.heading = pts[pts.length - 1]; return true; } }), t = twin(0, 0), W = world([me, t], { nodes });
    W.nav = nav; W.waypoints = (n, idx) => idx.map((i) => nodes[i]);
    assert.equal(new Brain(W).do_wander(me, instant ? { instant: true } : {}), true, 'a place was found');
    return instant ? me : me.heading;
  };
  for (let seed = 1; seed <= 40; seed++) {
    assert.ok(dist(run(seed, true), { x: 0, z: 0 }) >= 4, `seed ${seed}: placed ${dist(run(seed, true), { x: 0, z: 0 }).toFixed(1)} m from a twin on the first frame`);
    assert.ok(dist(run(seed, false), { x: 0, z: 0 }) >= 4, `seed ${seed}: sent to a stop ${dist(run(seed, false), { x: 0, z: 0 }).toFixed(1)} m from a twin`);
  }
});

// ---- a stair is no place to stop (people/brain.js `stopNode`): a stander on a flight leaves the next walker no way round, the separation steering pushes that walker into the rails and it stays there -----
// (found by a soak in the page's world: the builders of the L40 site dwelt on the nodes of the flight beside it, and three walkers were pinned at its head, (-21.1, 1.42, 16.04), in four hours)
test('where somebody stops: do_wander, the site and the moto stand never choose a node of a stair, on the first frame or on the way', () => {
  const g = new NavGraph();                                     // a street along z, a node every 4 m: ten street nodes, a flight of five stair nodes (z 40 to 56), ten more street nodes
  [...Array(10).fill('street'), ...Array(5).fill('stair'), ...Array(10).fill('street')].forEach((kind, k) => { const i = g.add(0, 0, k * 4, kind); if (k) g.link(i - 1, i); });
  const kindAt = (p) => g.nodes.reduce((b, n) => (dist(n, p) < dist(b, p) ? n : b)).kind;
  const stop = (persona, call, instant, seed, scene) => {
    const me = person('me', 'm_afro', 0, 22, seed, { persona, siteLotId: 'S', speedBase: 1.3, age: 'adult', routine: 'neighbour', homeNode: 0, walk(w, pts) { this.heading = pts[pts.length - 1]; return true; } });
    const W = world([me], scene); W.nav = g; W.waypoints = (n, idx) => idx.map((i) => g.nodes[i]);
    assert.equal(new Brain(W)[call](me, instant ? { instant: true } : {}), true, `${call} seed ${seed}: a place was found`);
    return kindAt(instant ? me : me.heading);
  };
  const site = { lots: [{ id: 'S', kind: 'unfinished', x: 0, y: 0, z: 48, entrance: { outside: [0, 0, 48] } }] }, stand = { landmarks: [{ id: 'busstop', x: 0, z: 38 }] };       // the site is the flight itself (five of its seven nodes within 13 m are stairs), the bus stop two street nodes and two stair nodes
  for (const [persona, call, scene] of [['neighbour', 'do_wander', {}], ['obrero', 'siteWork', site], ['mototaxista', 'motoWait', stand]]) {
    for (const instant of [true, false]) {
      const kinds = Array.from({ length: 60 }, (_, k) => stop(persona, call, instant, k + 1, scene)), on = kinds.filter((k) => k === 'stair').length;
      assert.equal(on, 0, `${call}${instant ? ' on the first frame' : ' on the way'}: ${on} of 60 people stop on a stair`);
      assert.ok(kinds.includes('street'), `${call}${instant ? ' on the first frame' : ' on the way'}: the street is still there to stop on`);
    }
  }
});

// ---- casting -----------------------------------------------------------------------------------------------------------------------------------------
test('casting: a persona uses its characters evenly before it repeats one (the mototaxi stand has three different riders)', () => {
  for (const seed of [1, 7, 21]) {
    const cast = planCast({ plan: { lots: [] }, charMetas: METAS, rng: makeRng(seed).fork('cast') }), of = (p) => cast.filter((c) => c.persona === p);
    assert.equal(new Set(of('mototaxista').map((c) => c.charId)).size, 3, `seed ${seed}: three mototaxistas, three bodies: ${of('mototaxista').map((c) => c.charId)}`);
    assert.ok(new Set(of('obrero').map((c) => c.charId)).size >= 3, `seed ${seed}: four builders are at least three bodies: ${of('obrero').map((c) => c.charId)}`);
    for (const id of COMMUNITY_PERSONAS) for (const g of ['f', 'm']) {
      const people = of(id).filter((c) => c.gender === g), models = candidates(PERSONAS[id], METAS, g); if (people.length < 2 || models.length < 2) continue;
      const use = models.map((m) => people.filter((c) => c.charId === m).length);
      assert.ok(Math.max(...use) - Math.min(...use) <= 1, `seed ${seed}: ${id} (${g}) wears its models unevenly: ${models.map((m, k) => `${m}:${use[k]}`).join(' ')}`);
    }
  }
});

// ---- walking side by side (R3-006: two of one character who set off together walk the whole street within a step of each other) ----------------------------
const walker = (id, charId, x, z, ry, extra = {}) => ({ id, charId, st: { x, y: 0, z }, ry, mode: 'walk', moving: true, ...extra });

test('tailsTwin: the one behind a twin who walks the same way slows; the one in front, head-on and crossing passers, a twin who stands, strangers and other floors are left alone', () => {
  const me = walker('n20', 'b_boy', 0, 0, 0), tail = (o) => tailsTwin(me, o, 0, 1);              // I walk towards +z: heading 0 is (sin 0, cos 0) = (0, 1)
  assert.equal(tail(walker('n10', 'b_boy', 0.8, 1.8, 0)), true, 'a twin 2 m ahead who walks my way: I hold back');
  assert.equal(tail(walker('n10', 'b_boy', 0.8, TAIL_R - 0.5, 0)), true, 'a twin just inside the reach');
  assert.equal(tail(walker('n10', 'b_boy', 0.8, TAIL_R + 0.5, 0)), false, 'a twin beyond the reach');
  assert.equal(tail(walker('n10', 'b_boy', 0.8, -1.8, 0)), false, 'a twin behind me: it is their turn to slow');
  assert.equal(tail(walker('n10', 'b_boy', 0.8, 1.8, Math.PI)), false, 'a twin who comes the other way passes in a moment: no slowing');
  assert.equal(tail(walker('n10', 'b_boy', 0.8, 1.8, Math.PI / 2)), false, 'a twin who crosses my way: no slowing');
  assert.equal(tail(walker('n10', 'b_boy', 0.8, 1.8, 0, { mode: 'idle', moving: false })), false, 'a twin who stands: nobody stops beside one');
  assert.equal(tail(walker('n10', 'g_girl', 0.8, 1.8, 0)), false, 'somebody else');
  assert.equal(tail(walker('n10', 'b_boy', 0.8, 1.8, 0, { st: { x: 0.8, y: 4, z: 1.8 } })), false, 'a twin on another floor');
  assert.equal(tailsTwin(me, me, 0, 1), false, 'nobody is their own twin');
  assert.equal(tailsTwin(me, { st: { x: 0, y: 0, z: 2 }, isPlayer: true, mode: 'walk', moving: true, ry: 0 }, 0, 1), false, 'the player has no character');
  // side by side, exactly one of the two holds back: the higher id
  const low = walker('n10', 'b_boy', 1.0, 0.2, 0), high = walker('n30', 'b_boy', -1.0, 0.1, 0);
  assert.equal(tail(low), true, 'level with n10: n20 holds back'); assert.equal(tailsTwin(low, me, 0, 1), false, 'and n10 does not hold back for n20');
  assert.equal(tail(high), false, 'level with n30: n20 goes on'); assert.equal(tailsTwin(high, me, 0, 1), true, 'and n30 holds back for n20');
});

/** Two walkers of the real Npc class on a stub world (a flat street, no door, nobody else): the same step the barrio takes. */
function street(chars, { gap = 1.0, towards = [1, 1] } = {}) {
  const npcs = [], w = {
    t: 0, player: { x: 1e6, y: 0, z: 1e6, isPlayer: true }, doors: null, brain: { unstick() {}, next() {} }, physics: { move(s, dx, dz) { s.x += dx; s.z += dz; } },
    near: (n, r) => npcs.filter((o) => o !== n && Math.hypot(o.st.x - n.st.x, o.st.z - n.st.z) < r),
  };
  chars.forEach((charId, k) => {
    const dir = towards[k], n = new Npc({ id: 'n' + (10 + 10 * k), charId, speedBase: 1.3 });
    n.place(k * gap, 0, dir > 0 ? 0 : 200, dir > 0 ? 0 : Math.PI); n.walk(w, [{ x: k * gap, z: dir > 0 ? 200 : 0 }], null, 1.3); npcs.push(n);
  });
  const run = (secs, each = () => {}) => { for (let t = 0; t < secs; t += 0.05) { w.t += 0.05; for (const n of npcs) n.step(0.05, w); each(w.t); } };
  return { npcs, w, run };
}

test('two of one character who set off side by side do not walk side by side: the one behind falls back out of the 2.5 m R3 counts, the one in front keeps their pace', () => {
  const s = street(['b_boy', 'b_boy']), [first, second] = s.npcs; let nearest = 9;
  s.run(12, (t) => { if (t > 5) nearest = Math.min(nearest, Math.hypot(first.st.x - second.st.x, first.st.z - second.st.z)); });
  assert.ok(nearest > 2.5, `after five seconds they are never closer than ${nearest.toFixed(2)} m`);
  assert.ok(Math.abs(first.st.z - 1.3 * 12) < 0.5, `the one in front walks at their own pace (${first.st.z.toFixed(1)} m in 12 s)`);
  assert.ok(second.st.z > 5 && second.st.z < first.st.z - 2.5, `the one behind holds back but goes on (${second.st.z.toFixed(1)} m)`);
  // the control: two different characters walk side by side at the pace of each
  const c = street(['b_boy', 'g_girl']); c.run(12);
  assert.ok(Math.abs(c.npcs[1].st.z - 1.3 * 12) < 0.5 && Math.hypot(c.npcs[0].st.x - c.npcs[1].st.x, c.npcs[0].st.z - c.npcs[1].st.z) < 1.2, 'strangers walk together as they like');
  // and two twins who walk towards each other meet and pass without a change of pace
  const h = street(['b_boy', 'b_boy'], { towards: [1, -1] }); h.run(10);
  assert.ok(Math.abs(h.npcs[0].st.z - 13) < 0.6 && Math.abs((200 - h.npcs[1].st.z) - 13) < 0.6, `head-on twins keep their pace (${h.npcs[0].st.z.toFixed(1)} and ${(200 - h.npcs[1].st.z).toFixed(1)} m)`);
});
