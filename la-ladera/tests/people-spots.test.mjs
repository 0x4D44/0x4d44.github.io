// Nobody stands inside a tree: the outdoor corners of the plan where people talk, stand or wait are moved off whatever solid the world put on them (people/spots.js `fit`, people/sim.js `standClear`).
// Found by a six-hour soak in the page's world (guard walls and prop colliders; the people tests build without them): 1,697 of the 1,701 person-seconds spent inside a collider were two people at ONE chat
// corner of the Plazoleta de los Almendros, 0.23 m from the trunk of an almond tree (the plan places its corners before the props do).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-spots.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Spots, FIT, FIT_REACH } from '../js/people/spots.js';
import { PeopleSim, standClear } from '../js/people/sim.js';
import { buildData, readAssetJson } from './headless.mjs';

const poi = (id, kind, x, z, y = 0) => ({ id, kind, x, y, z, ry: 0 });
const spotsOf = (pois, anchors = []) => new Spots({ plan: { pois, lots: [] }, anchors });
// a world of round solids [x, z, radius]: a point is clear when it is more than the solid's radius plus the body away from all of them
const solids = (list) => (x, z, s, r) => !list.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br + r);
const at = (spots, id) => spots.all.find((s) => s.id === id);

test('Spots.fit: a corner under a solid goes to the nearest free ground; a free corner, a bench, an indoor spot and a corner with no free ground within reach stay', () => {
  const spots = spotsOf([poi('A', 'chat', 0, 0), poi('B', 'chat', 10, 0), poi('C', 'bench', 0.1, 0), poi('D', 'stand', 20, 0), poi('E', 'phone', 30, 0)], [{ id: 'F', kind: 'chat', x: 40, y: 0, z: 0 }]);
  const clear = solids([[0.2, 0, 0.25], [0.1, 0, 0.25], [20, 0, 3], [40, 0, 0.3]]);     // a trunk on A (and on the bench C), a wide planter round D, a piece of furniture on the indoor spot F
  const moved = spots.fit(clear);
  assert.deepEqual(moved.map((s) => s.id), ['A'], 'only the chat corner under the trunk moved');
  const A = at(spots, 'A'), d = Math.hypot(A.x - A.x0, A.z - A.z0);
  assert.ok(clear(A.x, A.z, A, FIT.chat), 'it stands on free ground now');
  assert.ok(d > 0.6 && d <= 0.9 + 1e-9, `by the shortest step that clears the trunk, not by a leap (${d.toFixed(2)} m)`);
  assert.deepEqual([A.x0, A.z0], [0, 0], 'the old place is kept');
  for (const [id, x] of [['B', 10], ['C', 0.1], ['D', 20], ['E', 30], ['F', 40]]) assert.equal(at(spots, id).x, x, `${id} stays`);
  assert.equal(at(spots, 'D').x0, undefined, 'D is blocked all round within reach and was not touched');
});

test('Spots.fit: only the outdoor corners people stand on in the open (chat, stand, greet, phone) move, and never farther than the reach', () => {
  assert.deepEqual(Object.keys(FIT).sort(), ['chat', 'greet', 'phone', 'stand'], 'the kinds');
  assert.ok(FIT_REACH >= 1.2 && FIT_REACH <= 2, `a reach of ${FIT_REACH} m: far enough to clear a trunk, near enough to stay where the plan meant`);
  const kinds = ['chat', 'stand', 'greet', 'phone', 'bench', 'lean', 'vend', 'play', 'sweep'];
  const make = () => spotsOf(kinds.map((k, i) => poi('s' + i, k, i * 10, 0)));
  const round = (radius) => solids(kinds.map((k, i) => [i * 10, 0, radius]));           // a solid of this radius on every corner
  const moved = make().fit(round(0.5));
  assert.deepEqual(moved.map((s) => s.kind).sort(), ['chat', 'greet', 'phone', 'stand'], 'a bench, a lean-to, a vendor, a court patch and a sweep stay where the plan put them, whatever stands on them');
  for (const s of moved) assert.ok(Math.hypot(s.x - s.x0, s.z - s.z0) <= FIT_REACH + 1e-9, `${s.kind} moved ${Math.hypot(s.x - s.x0, s.z - s.z0).toFixed(2)} m`);
  assert.deepEqual(make().fit(round(FIT_REACH + 0.5)), [], 'free ground only beyond the reach: every corner stays');
});

test('standClear: a wall within the body, another level and a drop beside it each refuse a place', () => {
  const ph = (o = {}) => ({
    _overlaps: o.wall ? () => true : () => false,
    groundAt: () => (o.level ?? 0),
    heightsAt: (x) => (o.drop && x > 0.2 ? [-2] : [0]),
  });
  assert.equal(standClear(ph(), 0, 0, 0, 0.26), true, 'free ground');
  assert.equal(standClear(ph({ wall: true }), 0, 0, 0, 0.26), false, 'a wall within the body');
  assert.equal(standClear(ph({ level: 0.6 }), 0, 0, 0, 0.26), false, 'the ground there is a step higher: another place');
  assert.equal(standClear(ph({ level: -0.6 }), 0, 0, 0, 0.26), false, 'or a step lower');
  assert.equal(standClear(ph({ level: 0.2 }), 0, 0, 0, 0.26), true, 'a slope of a hand\'s width is the same place');
  assert.equal(standClear(ph({ drop: true }), 0, 0, 0, 0.26), false, 'a drop beside it (the lane of a walker would put them over it)');
  assert.equal(standClear({}, 3, 4, 5), true, 'a physics that knows nothing refuses nothing');
});

test('Spots.screen: an outdoor place with no way in is cut and pick and nearest skip it; a place with a way, a verdict of nothing and every indoor anchor stay', () => {
  const spots = spotsOf([poi('A', 'bench', 0, 0), poi('B', 'bench', 5, 0), poi('C', 'bench', 10, 0)], [{ id: 'F', kind: 'bench', x: 1, y: 0, z: 0 }]);
  const asked = [];
  const cut = spots.screen((s) => { asked.push(s.id); return s.id !== 'B'; });
  assert.deepEqual(cut.map((s) => s.id), ['B'], 'only the place with no way in is cut');
  assert.deepEqual(asked.sort(), ['A', 'B', 'C'], 'the outdoor places are asked, the indoor anchor is not');
  const offered = new Set();
  for (let i = 0; i < 60; i++) offered.add(spots.pick('bench', 5, 0, { next: () => (i + 0.5) / 60 }, { indoor: false })?.id);
  assert.deepEqual([...offered].sort(), ['A', 'C'], 'pick never offers the cut place, though it is the one nearest the caller');
  assert.equal(spots.nearest('bench', 5, 0, { indoor: false }).id, 'A', 'nearest skips it too (A and C are as far: the first wins)');
  assert.deepEqual(spots.screen(() => false).map((s) => s.id), ['A', 'C'], 'a place already cut is not cut twice; the others go when the way is shut');
  assert.equal(spots.nearest('bench', 5, 0, {}).id, 'F', 'the indoor anchor is never cut');
  assert.deepEqual(spotsOf([poi('A', 'bench', 0, 0)]).screen(() => undefined), [], 'a verdict of nothing is not a no');
});

test('the page\'s world: no place a person can pick lies behind a fence from the node they walk to (the court-side benches and fence leans stand outside the chain-link)', async (t) => {
  const { ctx } = await buildData({ furnish: true, colliders: true, world: true });
  ctx.hour = 12;
  const meta = await readAssetJson('people/people_meta.json');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  const ph = ctx.physics, nav = sim.nav, court = ctx.plan.plazas.find((p) => p.kind === 'court');
  // a person walks the street graph to the node nearest the place and then straight on (brain.goPoint): is a wall as tall as a fence across that last leg?
  const shut = (s) => { const i = nav.nearest(s.x, s.z, 16, s.y); if (i < 0) return false; const N = nav.nodes[i]; return ph.segmentBlocked(N.x, N.z, s.x, s.z, Math.min(N.y, s.y), 1.6, null, 2.0); };
  const outdoor = sim.spots.all.filter((s) => s.src === 'poi'), behind = outdoor.filter(shut);
  t.diagnostic(`${sim.spotsCut.length} of ${outdoor.length} outdoor places cut: ${sim.spotsCut.map((s) => s.id + ' ' + s.kind).join(', ')}`);
  if (!behind.length) t.diagnostic('the world has no place behind a fence now; the checks below hold trivially');
  assert.deepEqual(behind.filter((s) => !s.cut).map((s) => s.id + ' ' + s.kind), [], 'places behind a fence are still on offer');
  assert.deepEqual(sim.spotsCut.filter((s) => !shut(s)).map((s) => s.id + ' ' + s.kind), [], 'places cut for a wall that is no fence (a small prop, which the walker slides round)');
  assert.deepEqual(sim.spotsCut.map((s) => s.id).sort(), outdoor.filter((s) => s.cut).map((s) => s.id).sort(), 'spotsCut lists exactly the places cut');
  assert.ok(sim.spotsCut.length <= Math.ceil(outdoor.length * 0.05), `${sim.spotsCut.length} of ${outdoor.length} outdoor places cut: a test that cuts so many is cutting places people can walk to`);
  for (const kind of ['bench', 'lean', 'play', 'chat']) {
    assert.ok(sim.spots.list(kind).some((s) => s.src === 'poi' && !s.cut), `there are still ${kind} places to go to`);
    for (let i = 0; i < 200; i++) {
      const s = sim.spots.pick(kind, court.cx, court.cz, { next: () => (i + 0.5) / 200 }, { indoor: false, maxD: 60 });
      assert.ok(!s || (!s.cut && !shut(s)), `${kind} ${s?.id} was offered to somebody on the court, with a fence across the way`);
    }
  }
});

test('a three-hour soak in the page\'s world (dawn to the mid-morning): nobody is stopped by the fence of the court', async () => {
  const { ctx, plan } = await buildData({ furnish: true, colliders: true, world: true });
  ctx.hour = 5;
  const meta = await readAssetJson('people/people_meta.json');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0);
  const court = plan.plazas.find((p) => p.kind === 'court'), snags = [], orig = sim.brain.unstick.bind(sim.brain);
  sim.brain.unstick = (npc, W) => { snags.push({ id: npc.id, x: npc.x, z: npc.z, h: ctx.hour }); return orig(npc, W); };
  for (let t = 0; t < 3 * 3600; t += 0.1) { ctx.hour = (5 + t / 3600) % 24; sim.step(0.1); }
  const near = snags.filter((e) => Math.abs(e.x - court.cx) < court.w / 2 + 6 && Math.abs(e.z - court.cz) < court.d / 2 + 6);
  assert.equal(near.length, 0, `${near.length} of ${snags.length} snags of the soak were at the court (${[...new Set(near.map((e) => e.id))].join(', ')}): somebody was sent to a bench outside its fence`);
  assert.deepEqual(sim.faults, [], 'no exception in the frame loop');
});

// ---- the lane a walker keeps to ----------------------------------------------------------------------------------------------------------------------------------------------------
// `waypoints` (people/sim.js) turns a path over the graph into the points a walker steers to, each moved 0.55 to 1.25 m to one side of its node (keep to your right).
const lane = (nodes, ph) => {                                   // a bare PeopleSim with this graph (nodes along +x) and this physics
  const sim = Object.create(PeopleSim.prototype); sim.nav = { nodes: nodes.map((n, i) => ({ i, y: 0, kind: 'street', ...n })) }; sim.physics = ph; return sim;
};
const row = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 8, z: 0 }];
const walker = { x: 0, y: 0, z: 0, lane: 1.0 };
const hits = (sx, sz, ex, ez, x1, z1, x2, z2) => {              // do the segments (s -> e) and (1 -> 2) cross?
  const d1x = ex - sx, d1z = ez - sz, d2x = x2 - x1, d2z = z2 - z1, den = d1x * d2z - d1z * d2x; if (Math.abs(den) < 1e-9) return false;
  const s = ((x1 - sx) * d2z - (z1 - sz) * d2x) / den, u = ((x1 - sx) * d1z - (z1 - sz) * d1x) / den; return s >= 0 && s <= 1 && u >= 0 && u <= 1;
};

test('waypoints: a lane offset that would put the walker inside a solid (a vendor\'s cart on the plaza) goes back towards the node, and an open lane is kept', () => {
  const cart = { x: 4, z: 1.0 };                                // a cart standing in the lane at the middle node
  const ph = { _overlaps: (x, z) => Math.hypot(x - cart.x, z - cart.z) < 0.45 };
  const w = lane(row, ph).waypoints(walker, [0, 1, 2]);
  assert.deepEqual(w.map((p) => p.x), [0, 4, 8], 'along the graph');
  assert.equal(w[0].z, 1.0, 'an open lane is kept'); assert.equal(w[2].z, 1.0, 'at the far node too');
  assert.ok(w[1].z < 1.0 && w[1].z >= 0 && !ph._overlaps(w[1].x, w[1].z), `the middle point stands clear of the cart (z ${w[1].z.toFixed(2)})`);
  assert.ok(w[1].z > 0, `it keeps the part of the lane that is free (z ${w[1].z.toFixed(2)}): back by a step or two, not all the way to the middle of the street`);
});

test('waypoints: a leg across a wall (a bench\'s end support standing in the lane) goes back to the graph at both of its ends; the other legs keep their lane', () => {
  const wall = [2, 0.2, 2, 1.5];                                // x1 z1 x2 z2: stands between the first two lane points, not across the graph itself (z = 0)
  const ph = { _overlaps: () => false, segmentBlocked: (x1, z1, x2, z2) => hits(x1, z1, x2, z2, ...wall) };
  const w = lane(row, ph).waypoints(walker, [0, 1, 2]);
  assert.deepEqual(w.map((p) => [p.x, p.z]), [[0, 0], [4, 0], [8, 1.0]], 'the two ends of the blocked leg are on their nodes, the last keeps its lane');
  for (let k = 1; k < w.length; k++) assert.ok(!ph.segmentBlocked(w[k - 1].x, w[k - 1].z, w[k].x, w[k].z), `leg ${k} is clear`);
  const post = { _overlaps: () => false, segmentBlocked: (x1, z1, x2, z2) => hits(x1, z1, x2, z2, 0.5, 0.3, 0.5, 1.5) };       // a post at x = 0.5 beside the way, across the line from the walker at (1, 0) to the first lane point (0, 1)
  const first = lane(row, post).waypoints({ ...walker, x: 1 }, [0, 1]);
  assert.deepEqual(first.map((p) => [p.x, p.z]), [[0, 0], [4, 1.0]], 'the first leg, from where the walker stands, is repaired too (the first point goes to its node); the next leg is clear and keeps its lane');
  // one repair makes the next: the first post stands in the lane between the last two points; once those are back on their nodes the leg from the first lane point slants down to the
  // middle node, and the second post (not across the lane itself, only across that slant) is in its way
  const posts = [[6, 0.6, 6, 1.4], [2, 0.2, 2, 0.7]];
  const two = { _overlaps: () => false, segmentBlocked: (x1, z1, x2, z2) => posts.some((p) => hits(x1, z1, x2, z2, ...p)) };
  const chain = lane(row, two).waypoints(walker, [0, 1, 2]);
  assert.deepEqual(chain.map((p) => [p.x, p.z]), [[0, 0], [4, 0], [8, 0]], 'one repair leads to another: every leg ends up clear');
  for (let k = 0, prev = walker; k < chain.length; prev = chain[k++]) assert.ok(!two.segmentBlocked(prev.x, prev.z, chain[k].x, chain[k].z), `leg ${k} is clear`);
});

test('the page\'s world: no lane offset puts a waypoint in a solid or a leg across a wall, on any edge of the graph at the narrowest and the widest lane', async (t) => {
  const { ctx, plan } = await buildData({ furnish: true, colliders: true, world: true });
  ctx.hour = 9;
  const meta = await readAssetJson('people/people_meta.json');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  const ph = ctx.physics, N = sim.nav.nodes, crosses = (a, b) => ph.segmentBlocked(a.x, a.z, b.x, b.z, Math.min(a.y ?? b.y, b.y) + 0.2, 1.4);        // the wall filter of physics.move
  let edges = 0, bad = [];
  for (const [a, b] of plan.nav.edges.map(([p, q]) => [N.findIndex((n) => n.id === p), N.findIndex((n) => n.id === q)])) {
    if (a < 0 || b < 0 || crosses(N[a], N[b])) continue;                                                                  // (an edge of the graph itself across a wall is the world's to fix, not the lane's)
    edges++;
    for (const l of [0.55, 1.25]) for (const path of [[a, b], [b, a]]) {
      const from = N[path[0]], w = sim.waypoints({ x: from.x, y: from.y, z: from.z, lane: l }, path);
      let prev = { x: from.x, y: from.y, z: from.z };
      for (const p of w) {
        if (crosses(prev, p)) bad.push(`${N[path[0]].id}->${N[path[1]].id} lane ${l}: a leg to (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) crosses a wall`);
        prev = p;
      }
      for (const [k, p] of w.entries()) if (ph._overlaps(p.x, p.z, p.y, 0.3, 1.5) && !ph._overlaps(N[path[k]].x, N[path[k]].z, p.y, 0.3, 1.5)) bad.push(`${N[path[0]].id}->${N[path[1]].id} lane ${l}: point ${k} (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) is inside a solid`);
    }
  }
  t.diagnostic(`${edges} clear edges checked at two lanes, both ways round`);
  assert.ok(edges > 400, `${edges} edges`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} lane offsets lead into a solid or across a wall`);
});

test('the page\'s world: no chat corner, standing place, greeting step or phone corner is under a tree, a lamp post or a planter once the people are built', async (t) => {
  const { ctx } = await buildData({ furnish: true, colliders: true, world: true });
  ctx.hour = 9;
  const meta = await readAssetJson('people/people_meta.json');
  const NEED = { chat: 0.6, stand: 0.45, greet: 0.26, phone: 0.26 };                    // metres of free ground: a chat pair stands 0.4 m either side of the corner (brain.js chatHere) and a body is 0.2 m across
  const raw = new Spots({ plan: ctx.plan, anchors: ctx.anchors ?? [], buildings: ctx.buildings });
  const needed = raw.all.filter((s) => NEED[s.kind] && s.src === 'poi' && ctx.physics._overlaps(s.x, s.z, s.y, NEED[s.kind], 1.5));
  if (!needed.length) t.diagnostic('the world no longer puts a solid on a corner; the check below holds trivially');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  for (const s of sim.spots.all) {
    if (!NEED[s.kind] || s.src !== 'poi') continue;
    assert.ok(!ctx.physics._overlaps(s.x, s.z, s.y, NEED[s.kind], 1.5), `${s.kind} corner ${s.id} at (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) is inside a solid`);
  }
  for (const s of needed) { const m = at(sim.spots, s.id); assert.ok(Math.hypot(m.x - s.x, m.z - s.z) <= FIT_REACH + 1e-9, `${s.id} moved ${Math.hypot(m.x - s.x, m.z - s.z).toFixed(2)} m`); }
});

// ---- the keeper's post --------------------------------------------------------------------------------------------------------------------------------------------------
// A shop's keeper walks to `shop.post`. The seamstress of L31 has no counter: her post was the `work` anchor of her sewing chair, and the walker was pushed off the chair's outline for ever (a six-hour
// soak: 20 `unstick` events a morning at one chair). A post inside a piece of furniture is no post: sim.js `_makeShops` moves it to the nearest floor the door reaches.
test('the page\'s world: every shop\'s post and every customer spot is floor a body can stand on, not the inside of a chair or a counter', async (t) => {
  const { ctx } = await buildData({ furnish: true, colliders: true, world: true });
  const meta = await readAssetJson('people/people_meta.json');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  t.diagnostic(`${sim.shops.size} shops`);
  const inside = [];
  for (const [lot, s] of sim.shops) {
    for (const [tag, p] of [['post', s.post], ['cpoint', s.cpoint], ...(s.cust ?? []).map((c) => ['customer', c])]) if (p && ctx.physics._overlaps(p.x, p.z, p.y, 0.25, 1.5)) inside.push(`${lot} ${tag} (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
  assert.deepEqual(inside, [], 'spots inside a collider');
});

test('_makeShops: a post that lies inside a piece of furniture moves to free floor that the door reaches, and a post on free floor stays', async () => {
  const { ctx, plan } = await buildData({ furnish: true, colliders: true });
  const meta = await readAssetJson('people/people_meta.json');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  const keys = [...sim.shops.keys()], was = new Map(keys.map((k) => [k, { ...sim.shops.get(k).post }]));
  const lot = keys.find((k) => sim.shops.get(k).ent?.inside && !sim.shops.get(k).sealed), at0 = was.get(lot), ph = ctx.physics, real = ph._overlaps.bind(ph);
  assert.ok(lot, 'a shop with a door and an open post');
  try {
    ph._overlaps = (x, z, y, r, h) => Math.hypot(x - at0.x, z - at0.z) < 0.7 || real(x, z, y, r, h);          // a chair 1.4 m across on the post
    sim._makeShops(plan);
  } finally { ph._overlaps = real; }
  const now = sim.shops.get(lot).post;
  assert.ok(Math.hypot(now.x - at0.x, now.z - at0.z) >= 0.7, `the keeper's post left the furniture (${Math.hypot(now.x - at0.x, now.z - at0.z).toFixed(2)} m from where it was)`);
  assert.ok(!real(now.x, now.z, now.y, 0.25, 1.5), 'and it is free floor');
  assert.ok(sim.canReach(sim.shops.get(lot).ent, now), 'that the door reaches');
  for (const k of keys) if (k !== lot) assert.deepEqual([sim.shops.get(k).post.x, sim.shops.get(k).post.z], [was.get(k).x, was.get(k).z], `${k}'s post stays`);
});

test('an indoor anchor keeps the piece of furniture it was made for (homelife.slideOf finds the sofa by it); a spot of the plan has none', () => {
  const spots = spotsOf([poi('P', 'bench', 0, 0)], [{ id: 'A', kind: 'tv', x: 1, y: 0, z: 1, ry: 0, building: 'L1', seatH: 0.45, item: 'f12' }, { id: 'B', kind: 'stand', x: 2, y: 0, z: 2, building: 'L1' }]);
  assert.equal(at(spots, 'A').item, 'f12', 'the sofa of the television anchor');
  assert.equal(at(spots, 'B').item, null, 'an anchor of nothing in particular');
  assert.equal(at(spots, 'P').item, undefined, 'a corner of the plan is not furniture');
});
