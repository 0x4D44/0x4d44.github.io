// The way into the Plazoleta de los Almendros from the street (A4's six-hour soak: 61 % of all unstick events, 719 of them, happened at ONE place, the north-west corner of its terrace, cell (12, 42)).
// The street legs run diagonally into the corner node, past the end of the terrace's retaining wall, and a walker keeps to the right of its leg by a lane of 0.55 to 1.25 m: the corner planter and the
// wall's guard lines (a blunt post 0.7 m across at their north end) left no way between them. Three causes, three fixes:
//   dress.js buildPlanters   no corner planter where a way in meets a retaining wall
//   navfit.js giveLaneRoom   the node a way in arrives at keeps lane room (1.8 m) from the wall's guard line
//   navfit.js dropScraped    the way in n247-n424, which passes the post of the wall's end 0.9 m off, is dropped: everyone enters by n246-n424, 1.5 m off the same post, which walks clean
// The people tests build without the walls and props and cannot see this; these build the page's world (buildData({ world: true })) and walk the real Npc._walk over the real legs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-terrace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim, ledgeSafe } from '../js/people/sim.js';
import { Npc } from '../js/people/npc.js';
import { fitNav } from '../js/world/navfit.js';

// ---------------------------------------------------------------------------------------------------- the page's world, built once
let built = null;
const page = () => (built ??= (async () => {
  const { ctx, plan } = await buildData({ furnish: true, colliders: true, world: true });
  ctx.hour = 9;
  const meta = await readAssetJson('people/people_meta.json');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  return { ctx, plan, sim };
})());

const LANES = Array.from({ length: 15 }, (_, i) => +(0.55 + i * 0.05).toFixed(2));              // npc.lane runs 0.55 .. 1.25 m to the right of the leg
const at = (n) => n.from ?? [n.x, n.z];                                                          // where the plan put a node (fitNav keeps it when it moves one)
const pair = (a, b) => [a, b].sort().join('-');

/** The corner node of P2 (the Plazoleta de los Almendros) the street walks into, its neighbours in the plaza, and the street nodes that lead in. */
function terrace({ plan }) {
  const nodes = plan.nav.nodes, idx = new Map(nodes.map((n, i) => [n.id, i])), adj = new Map(nodes.map((n) => [n.id, []]));
  for (const [a, b] of plan.nav.edges) { adj.get(a).push(b); adj.get(b).push(a); }
  const P2 = plan.plazas.find((p) => p.id === 'P2'), x0 = Math.min(...P2.poly.map((p) => p[0])), z0 = Math.min(...P2.poly.map((p) => p[1]));
  const own = nodes.filter((n) => n.area === 'P2'), I = (n) => idx.get(n.id), nb = (n) => adj.get(n.id).map((id) => nodes[idx.get(id)]);
  const nw = own.reduce((best, n) => (Math.hypot(at(n)[0] - x0, at(n)[1] - z0) < Math.hypot(at(best)[0] - x0, at(best)[1] - z0) ? n : best));
  const near = (n, dx, dz) => nb(n).filter((m) => m.area === 'P2').reduce((best, m) => ((!best || Math.hypot(m.x - n.x - dx, m.z - n.z - dz) < Math.hypot(best.x - n.x - dx, best.z - n.z - dz)) ? m : best), null);
  const east = near(nw, 5, 0), south = near(nw, 0, 5), ways = nb(nw).filter((m) => !m.area);        // the street nodes that lead in
  /** Every shape of walk that comes in by the street node `e`: along the street and in, in and along the wall or the north row, and back. Indices into sim.nav.nodes. */
  const via = (e) => {
    const r = [[I(e), I(nw)], [I(nw), I(e)], [I(e), I(nw), I(east)], [I(east), I(nw), I(e)], [I(e), I(nw), I(south)], [I(south), I(nw), I(e)]];
    for (const f of nb(e).filter((m) => m.kind === 'street' && m !== nw)) r.push([I(f), I(e), I(nw)], [I(f), I(e), I(nw), I(east)], [I(nw), I(e), I(f)], [I(east), I(nw), I(e), I(f)]);
    return r;
  };
  const inside = [[I(nw), I(south)], [I(south), I(nw)], [I(east), I(nw), I(south)], [I(south), I(nw), I(east)]];
  return { nw, east, south, ways, via, routes: [...ways.flatMap(via), ...inside], idx };
}

/**
 * Walk every route at every lane with the real Npc._walk over the page's physics. The walker starts on its lane, at the first waypoint and facing the second (a pedestrian who comes along the street is on
 * its lane already; one set down on the node itself would cut the first corner from the wrong side). A walk fails on an unstick (4 s without progress) or when it does not arrive within a metre of its last
 * waypoint in 40 s.
 */
function walkAll({ ctx, sim }, routes, lanes = LANES, legs = (lane, a, r) => sim.waypoints({ lane, x: a.x, z: a.z }, r)) {
  const N = sim.nav.nodes, ph = ctx.physics, bad = []; let walks = 0;
  for (const r of routes) for (const lane of lanes) {
    const a = N[r[0]], npc = new Npc({ id: 't', rng: ctx.rng.fork('terrace:' + lane + r.join()), lane, speedBase: 1.3 });
    const pts = legs(lane, a, r), end = pts[pts.length - 1];
    npc.place(pts[0].x, pts[0].y, pts[0].z, Math.atan2(pts[1].x - pts[0].x, pts[1].z - pts[0].z));      // facing the way it goes: a walker turned round pivots, and that is no stall
    let unstick = 0, t = 0;
    const w = { t: 0, physics: ph, near: () => [], brain: { unstick: (n) => { unstick++; n.stuckT = 0; } }, doors: null };
    npc.walk(w, pts, null, 1.3);
    while (npc.mode === 'walk' && t < 40 && Math.hypot(npc.st.x - end.x, npc.st.z - end.z) > 1.0) { w.t = t; npc.step(0.05, w); t += 0.05; }
    walks++;
    const arrived = Math.hypot(npc.st.x - end.x, npc.st.z - end.z) <= 1.0;
    if (unstick || !arrived) bad.push(`${r.join('>')} lane ${lane}: ${unstick} unstick${arrived ? '' : ', never arrived'}`);
  }
  return { walks, bad };
}

/**
 * The lane legs as PeopleSim.waypoints built them before A4's lane-leg fix: a lane point over a drop goes back toward its node, nothing else, so a leg that clips the end of a wall is walked as drawn. TEETH 3 walks
 * these: the fix since then sends a walker back to the graph whenever a lane leg crosses a wall, and that alone stops the stall, so the node's own place can only be shown to matter without it.
 */
const preFixLegs = ({ sim }) => (lane, a, r) => {
  const N = sim.nav.nodes;
  return r.map((i, k) => {
    const nd = N[i], p = N[r[Math.max(0, k - 1)]], q = N[r[Math.min(r.length - 1, k + 1)]];
    let tx = q.x - p.x, tz = q.z - p.z; const tl = Math.hypot(tx, tz);
    let off = nd.kind === 'stair' || p.kind === 'stair' || q.kind === 'stair' ? 0 : Math.min(lane, Math.max(0, (nd.w ?? 2) - 0.9));
    if (tl < 1e-6) off = 0; else { tx /= tl; tz /= tl; }
    let px = nd.x - tz * off, pz = nd.z + tx * off;
    if (off > 0 && !ledgeSafe(sim.physics, px, pz, nd.y)) for (const f of [0.6, 0.3, 0]) { px = nd.x - tz * off * f; pz = nd.z + tx * off * f; if (f === 0 || ledgeSafe(sim.physics, px, pz, nd.y)) break; }
    return { x: px, z: pz, y: nd.y };
  });
};

const corner = (plan) => { const P2 = plan.plazas.find((p) => p.id === 'P2'); return { P2, sites: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [P2.cx + sx * (P2.w / 2 - 0.55), P2.cz + sz * (P2.d / 2 - 0.55)]) }; };
const planterAt = (ph, x, z) => ph.walls.filter((w) => w.on !== false && w.id === 'prop' && w.x1 === w.x2 && w.z1 === w.z2 && w.t > 0.4 && Math.hypot(w.x1 - x, w.z1 - z) < 0.1);

// ---------------------------------------------------------------------------------------------------- the page's world
test('the page\'s world: the street walks into the north-west corner of the Plazoleta de los Almendros at every lane without one stall', async () => {
  const W = await page(), { nw, routes, ways } = terrace(W);
  assert.deepEqual(ways.map((n) => n.id), ['n246'], 'one street node leads into the corner node: the other diagonal is dropped');
  const { walks, bad } = walkAll(W, routes);
  assert.ok(walks >= 250, `${walks} walks: the check would be vacuous with a handful`);
  assert.deepEqual(bad, [], `${bad.length} of ${walks} walks past ${nw.id} stalled`);
});

test('TEETH: put the corner planter back and the walks stall again', async () => {
  const W = await page(), { routes } = terrace(W), { sites } = corner(W.plan), [x, z] = sites[0];
  assert.equal(planterAt(W.ctx.physics, x, z).length, 0, 'the planter is not there');
  const back = W.ctx.physics.addWall({ x1: x, z1: z, x2: x, z2: z, t: 0.425, y0: 6.55, y1: 7.45, id: 'prop' });      // what buildPlanters put there before
  try {
    const { walks, bad } = walkAll(W, routes);
    assert.ok(bad.length >= 15, `only ${bad.length} of ${walks} walks stall with the planter back`);
  } finally { back.on = false; }
});

test('TEETH: put the corner node back where the plan had it and a walk stalls again', async () => {
  const W = await page(), { nw, routes } = terrace(W), N = W.sim.nav.nodes[W.plan.nav.nodes.indexOf(nw)], moved = [N.x, N.z];
  assert.ok(nw.from && Math.hypot(nw.x - nw.from[0], nw.z - nw.from[1]) > 0.3, 'the node was moved');
  [N.x, N.z] = nw.from;
  try {
    const { walks, bad } = walkAll(W, routes, LANES, preFixLegs(W));
    assert.ok(bad.length >= 1, `none of ${walks} walks stalls with the node back`);
  } finally { [N.x, N.z] = moved; }
});

test('TEETH: the way in that was dropped (n247-n424) is the one that stalled: walk it and the lanes run into the wall\'s end', async () => {
  const W = await page(), { ctx, plan } = W, T = terrace(W), fit = ctx.world.navFit;
  assert.deepEqual(fit.scraped.map(([a, b]) => pair(a, b)), [pair('n247', 'n424')], 'the plan has the one scraping way in, and it is dropped');
  assert.ok(!plan.nav.edges.some(([a, b]) => pair(a, b) === pair('n247', 'n424')), 'and it is gone from plan.nav');
  const e = plan.nav.nodes.find((n) => n.id === 'n247'), { walks, bad } = walkAll(W, T.via(e));
  assert.ok(bad.length >= 5, `only ${bad.length} of ${walks} walks stall on the dropped way in`);
});

test('the dropped way in leaves the graph whole, and the corner planter goes only where a way in meets a retaining wall: the other three corners of the plaza, and every other plaza, keep theirs', async () => {
  const { ctx, plan } = await page(), { sites } = corner(plan), dress = ctx.world.dress, fit = ctx.world.navFit;
  assert.deepEqual(sites.map(([x, z]) => planterAt(ctx.physics, x, z).length), [0, 1, 1, 1], 'north-west, north-east, south-east, south-west');
  assert.equal(dress.pinched, 1, 'one corner in the whole village');
  assert.ok(dress.planters >= 8, `${dress.planters} planters stand`);
  const parts = (edges) => { const p = new Map(plan.nav.nodes.map((n) => [n.id, n.id])), f = (a) => { while (p.get(a) !== a) { p.set(a, p.get(p.get(a))); a = p.get(a); } return a; }; for (const [a, b] of edges) p.set(f(a), f(b)); return new Set(plan.nav.nodes.map((n) => f(n.id))).size; };
  assert.equal(parts(plan.nav.edges), parts([...plan.nav.edges, ...fit.scraped]), 'dropping the scraping ways in splits nothing');
});

test('the node a way in arrives at keeps lane room: 1.8 m from the wall\'s guard line, moved by 0.5 m, and the graph still walks', async () => {
  const { ctx, plan } = await page(), fit = ctx.world.navFit, n = plan.nav.nodes.find((q) => q.id === 'n424');
  assert.ok(fit.moved.length >= 1, 'a node was moved');
  const m = fit.moved.find(([id]) => id === n.id);
  assert.ok(m && Math.abs(m[1] - 0.5) < 0.05 && Math.abs(m[2]) < 0.05, `n424 moved ${JSON.stringify(m)}`);
  const guards = ctx.physics.walls.filter((w) => w.id === 'guard' && w.y1 > n.y + 0.3 && w.y0 < n.y + 1.7);
  const room = Math.min(...guards.map((w) => { const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz || 1e-12, t = Math.max(0, Math.min(1, ((n.x - w.x1) * dx + (n.z - w.z1) * dz) / l2)); return Math.hypot(n.x - w.x1 - t * dx, n.z - w.z1 - t * dz); }));
  assert.ok(room >= 1.75, `${room.toFixed(2)} m from the nearest guard line`);
  assert.equal(fit.stranded.length, 0, 'nothing stranded');
});

// ---------------------------------------------------------------------------------------------------- fitNav: the lane-room rule on a small plaza
/**
 * A plaza Q (0..20 x 0..10); the street runs along z = -3. Way-in node a (1.2, 5) is joined to street node s, interior node b (6, 5) to a. By default the plaza's west edge is behind a guard line at x = -0.1, 1.3 m from a;
 * `guards` replaces that list. Returns what fitNav takes, the nodes, and a guard-line maker.
 */
function mini(o = {}) {
  const guard = (x1, z1, x2, z2, y0 = -1, y1 = 3) => ({ x1, z1, x2, z2, t: 0.1, y0, y1, id: 'guard' });
  const nodes = [
    { id: 's', x: 4, y: 0, z: -3, kind: 'street' }, { id: 'a', x: 1.2, y: 0, z: 5, kind: 'plaza', area: 'Q' }, { id: 'b', x: 6, y: 0, z: 5, kind: 'plaza', area: 'Q' },
    ...(o.nodes ?? []),
  ];
  const edges = [['s', 'a'], ['a', 'b'], ...(o.edges ?? [])];
  const plan = { lots: o.lots ?? [], plazas: [{ id: 'Q', poly: [[0, 0], [20, 0], [20, 10], [0, 10]] }], heightAt: o.heightAt ?? (() => 0), nav: { nodes, edges } };
  return { ctx: { plan, physics: { walls: [...(o.guards ?? [guard(-0.1, -5, -0.1, 15)]), ...(o.walls ?? [])] } }, nodes, guard };
}
const node = (m, id) => m.nodes.find((n) => n.id === id);

test('fitNav: a way-in node 1.3 m from a guard line moves 0.5 m off it, once; an interior node, a node with room and a guard on another level leave it alone', () => {
  const m = mini({
    nodes: [{ id: 't', x: 15, y: 0, z: -3, kind: 'street' }, { id: 'c', x: 15, y: 0, z: 1.5, kind: 'plaza', area: 'Q' }, { id: 'u', x: 12, y: 0, z: -3, kind: 'street' }, { id: 'e', x: 12, y: 0, z: 4, kind: 'plaza', area: 'Q' },
      { id: 'g', x: 8, y: 0, z: 5, kind: 'plaza', area: 'Q' }],
    edges: [['t', 'c'], ['u', 'e'], ['g', 'b']],
  });
  m.ctx.physics.walls.push(m.guard(4, 5.8, 8, 5.8), m.guard(10.6, 4.8, 13.4, 4.8, 20, 30));          // 0.8 m from the interior nodes b and g; 0.8 m from the way-in node e, but on another level
  const fit = fitNav(m.ctx), a = node(m, 'a');
  assert.deepEqual(fit.moved, [['a', 0.5, 0]], 'only a moved');
  assert.ok(Math.abs(a.x - 1.7) < 0.011 && a.z === 5 && a.y === 0, `a is at ${a.x}, ${a.z}`);
  assert.deepEqual(a.from, [1.2, 5], 'the plan\'s own place is kept');
  assert.deepEqual([node(m, 'b').x, node(m, 'b').z, node(m, 'g').x, node(m, 'g').z, node(m, 'c').x, node(m, 'c').z, node(m, 'e').x, node(m, 'e').z], [6, 5, 8, 5, 15, 1.5, 12, 4], 'the others stay');
  assert.deepEqual(fitNav(m.ctx).moved, [], 'a second pass moves nothing more');
  assert.ok(Math.abs(a.x - 1.7) < 0.011, 'and a stays where it is');
});

test('fitNav: a node is moved no farther than 0.6 m, from where the plan put it, whatever the shortfall', () => {
  const m = mini(); m.ctx.physics.walls.length = 0; m.ctx.physics.walls.push(m.guard(0.7, -5, 0.7, 15));      // the line is 0.5 m from a: 1.3 m short of the room
  const fit = fitNav(m.ctx);
  assert.equal(fit.moved.length, 1);
  assert.ok(Math.abs(fit.moved[0][1] - 0.6) < 0.011, `moved ${fit.moved[0][1]} m`);
  assert.deepEqual(fitNav(m.ctx).moved, [], 'and not another 0.6 m on the next pass');
});

test('fitNav: a node stays where a move would leave the plaza\'s edge less than 0.9 m behind it, or put it beside a prop, or on other ground, or shut an edge that walked', () => {
  const side = mini({ guards: [], nodes: [{ id: 'v', x: 10, y: 0, z: -3, kind: 'street' }, { id: 'd', x: 10, y: 0, z: 1.2, kind: 'plaza', area: 'Q' }], edges: [['v', 'd']] });
  side.ctx.physics.walls.push(side.guard(5, 2.2, 15, 2.2));                                           // 1.0 m south of d: the way off it is toward the north edge, 0.6 m from it
  const prop = mini(); prop.ctx.physics.walls.push({ x1: 1.7, z1: 5.45, x2: 1.7, z2: 5.45, t: 0.2, y0: -1, y1: 3, id: 'prop' });     // 0.35 m from where a would stand, off the line of both its edges: they would still walk
  const land = mini({ heightAt: (x) => (x > 1.5 ? 1 : 0) });                                          // the ground there is a metre higher
  const pillar = mini({ lots: [{ id: 'P', x: 1.95, z: 5, w: 0.3, d: 0.3, rotY: 0, y: 0 }] });         // a block 0.1 m from where a would stand: the leg from s no longer reaches it, and no prop or guard line is near
  for (const [what, m, id] of [['the plaza\'s edge', side, 'd'], ['a prop', prop, 'a'], ['other ground', land, 'a'], ['a shut edge', pillar, 'a']]) {
    const before = [node(m, id).x, node(m, id).z], fit = fitNav(m.ctx);
    assert.deepEqual(fit.moved, [], `${what}: nothing moved`);
    assert.deepEqual([node(m, id).x, node(m, id).z], before, `${what}: ${id} stays`);
    assert.equal(node(m, id).from, undefined, `${what}: and has no past`);
  }
});

// ---------------------------------------------------------------------------------------------------- fitNav: a way in that runs into the end of a wall
/**
 * Two ways into the plaza's node p (6, 1.2): s (4, -3) -> p, 4.65 m long, and t (10, -3) -> p, 5.8 m. A guard line comes down from the north and ends beside the middle of s -> p, `d1` m to its east (and, with `d2`,
 * another ends `d2` m to the east of t -> p's middle). The plaza's west edge has no guard, so the lane-room rule has nothing to do.
 */
function ways(o = {}) {
  const L1 = Math.hypot(2, 4.2), L2 = Math.hypot(4, 4.2);
  const end1 = (d) => [5 + (4.2 / L1) * d, -0.9 - (2 / L1) * d], end2 = (d) => [8 + (4.2 / L2) * d, -0.9 + (4 / L2) * d];
  const m = mini({ guards: [], nodes: [{ id: 'p', x: 6, y: 0, z: 1.2, kind: 'plaza', area: 'Q' }, { id: 't', x: 10, y: 0, z: -3, kind: 'street' }], edges: [['s', 'p'], ...(o.only ? [] : [['t', 'p']]), ['s', 't']] });
  const line = ([x, z], y0, y1) => m.ctx.physics.walls.push(m.guard(x, z, x, z - 5, y0, y1));
  if (o.d1 !== undefined) line(end1(o.d1), o.y0, o.y1);
  if (o.d2 !== undefined) line(end2(o.d2));
  return Object.assign(m, { end1 });
}
const edgesOf = (m) => m.ctx.plan.nav.edges.map(([a, b]) => pair(a, b)).sort();
const WHOLE = ['a-b', 'a-s', 'p-s', 'p-t', 's-t'];

test('fitNav: a way in that passes the open end of a guard line 0.7 m off is dropped when another way in keeps the plaza whole, and the worse of two goes first', () => {
  const m = ways({ d1: 0.7 }), fit = fitNav(m.ctx);
  assert.deepEqual(fit.scraped.map(([a, b]) => pair(a, b)), ['p-s'], 'the scraping way in is reported');
  assert.deepEqual(edgesOf(m), ['a-b', 'a-s', 'p-t', 's-t'], 'and gone from the graph; the others stay');
  assert.deepEqual(fit.moved, [], 'no node moved');
  const two = ways({ d1: 0.8, d2: 0.5 }), fit2 = fitNav(two.ctx);                                    // the worse one is the second in the plan's order
  assert.deepEqual(fit2.scraped.map(([a, b]) => pair(a, b)), ['p-t'], 'both scrape, the worse one goes ...');
  assert.deepEqual(edgesOf(two), ['a-b', 'a-s', 'p-s', 's-t'], '... and the other, which would strand p, stays');
});

test('fitNav: a way in that is the plaza\'s only link stays, whatever it scrapes', () => {
  const m = ways({ d1: 0.5, only: true }), fit = fitNav(m.ctx);
  assert.deepEqual(fit.scraped, [], 'nothing dropped');
  assert.ok(edgesOf(m).includes('p-s'), 'p-s stays');
});

test('fitNav: a way in stays when the end is 1.3 m off, on another level, no end but a joint of the line, or when the edge runs inside the plaza', () => {
  const cases = [
    ['1.3 m off', ways({ d1: 1.3 })],
    ['a line on another level', ways({ d1: 0.7, y0: 20, y1: 30 })],
  ];
  const joint = ways(), [jx, jz] = joint.end1(0.7);
  joint.ctx.physics.walls.push(joint.guard(jx - 0.3, jz - 3, jx, jz), joint.guard(jx, jz, jx + 0.3, jz - 3));    // a chain that bends 0.7 m from the edge: its joint is no end, and its two ends are far away
  cases.push(['a joint of a chain', joint]);
  const inside = ways(); inside.ctx.physics.walls.push(inside.guard(3.5, 5.7, 3.5, 9));                     // 0.7 m from the edge a-b, which has both ends in the plaza
  cases.push(['an edge inside the plaza', inside]);
  for (const [what, m] of cases) {
    const fit = fitNav(m.ctx);
    assert.deepEqual(fit.scraped, [], `${what}: nothing dropped`);
    assert.deepEqual(edgesOf(m), WHOLE, `${what}: the graph is as the plan had it`);
  }
});
