// The court's spectators' benches (poi282 behind the north bank, poi283 and poi284 beyond the end lines) and its two fence leans (poi285, poi286) stand OUTSIDE the chain-link fence of the Cancha El Cerro.
// The graph had no node out there (the court nodes n454..n471 stand inside the fence, which has gaps only where an edge of the graph crosses it), so the people sim cut all five places (people/spots.js `screen`):
// nobody sat on a court bench. world/courtside.js `linkCourtSide` gives them a strip of 'path' nodes round the outside of the fence, joined to the street (never through the fence: a gate beside the court's corner
// nodes sent walkers who left the strip into the fence's end, n69 in A4's soak): a node 1.125 m in front of each end bench, 1.5 m behind the north bench (it stands 1.05 m from the fence), 1.5 m behind each lean.
// The page's world (guard walls, every prop collider) and the real `Npc` walker over it prove the way, to the places and back from them: the people tests build without them.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-court.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim, standClear } from '../js/people/sim.js';
import { Npc } from '../js/people/npc.js';
import { walkable } from '../js/world/nav.js';
import { navComponents } from './world-lib.mjs';

// ---------------------------------------------------------------------------------------------------- the page's world, built once
let built = null;
const page = () => (built ??= (async () => {
  const { ctx, plan } = await buildData({ furnish: true, colliders: true, world: true });
  ctx.hour = 12;
  const meta = await readAssetJson('people/people_meta.json');
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(new Map(meta.people.map((p) => [p.id, p]))), 'the people are built');
  return { ctx, plan, sim };
})());

const LANES = Array.from({ length: 15 }, (_, i) => +(0.55 + i * 0.05).toFixed(2));              // npc.lane runs 0.55 .. 1.25 m to the right of the leg
/** The places outside the fence: the three spectators' benches and the two leans on the north bank. */
const placesOf = (plan) => plan.pois.filter((p) => (p.kind === 'bench' && p.tags.includes('court-side')) || (p.kind === 'lean' && p.tags.includes('fence')));
const spotOf = (sim, p) => sim.spots.all.find((s) => s.id === p.id);
const courtOf = (plan) => plan.plazas.find((p) => p.kind === 'court');

/** Where a person comes from: the middle of the court, the street below it, and the arrival point of the player (the far end of the graph). */
function starts({ plan, sim }) {
  const court = courtOf(plan), sp = plan.spawn, nodes = sim.nav.nodes;
  const near = (x, z, kind) => nodes.reduce((b, n) => ((!kind || n.kind === kind) && (!b || Math.hypot(n.x - x, n.z - z) < Math.hypot(b.x - x, b.z - z)) ? n : b), null);
  return { 'the middle of the court': near(court.cx, court.cz, 'court'), 'the street below the court': near(court.cx, court.cz + court.d / 2 + 6, 'street'), 'the arrival point': near(sp.x, sp.z) };
}

/**
 * Send a person to a place as the brain does (brain.js toSpot: the graph to the node nearest it, then straight on) and walk the real Npc over the page's physics, from `start`, on `lane`. A walk fails on an
 * unstick (4 s without progress), when it does not arrive within 240 s, or when it ends more than 0.35 m from the place.
 */
function goTo(W, place, start, lane, arrive = null) {
  const { ctx, sim } = W, spot = spotOf(sim, place);
  const npc = new Npc({ id: 'c' + lane, rng: ctx.rng.fork(`court:${place.id}:${start.id}:${lane}`), lane, speedBase: 1.3 });
  npc.place(start.x, start.y, start.z, 0);
  let done = false;
  const sent = sim.brain.toSpot(npc, spot, (n, ww) => { done = true; arrive?.(n, ww); }, {});
  const { unstick, t } = walkOut(W, npc, sent);
  const off = Math.hypot(npc.st.x - place.x, npc.st.z - place.z);
  sim.spots.release(npc);
  return { sent, done, unstick, t, off, npc, stuck: npc.maxStuck };
}

/** Step `npc` over the page's physics until it stops walking. A walk fails on an unstick (4 s without progress) or when it has not arrived after 240 s: a walker who wriggles against a wall never reaches the first. */
function walkOut({ ctx, sim }, npc, sent) {
  let unstick = 0, t = 0;
  const w = { t: 0, physics: ctx.physics, near: () => [], doors: null, brain: { unstick: (n) => { unstick++; n.stuckT = 0; } } };
  while (sent && npc.mode === 'walk' && !unstick && t < 240) { w.t = t; sim.t = t; npc.step(0.05, w); t += 0.05; }
  return { unstick, t };
}

/** The walk back: a person who has been sitting at the place goes to `target` (a node), as the brain does (brain.js goPoint: the graph to the node nearest it, then straight on), on `lane`. */
function goFrom(W, place, target, lane) {
  const { ctx, sim } = W, spot = spotOf(sim, place);
  const npc = new Npc({ id: 'b' + lane, rng: ctx.rng.fork(`court:from:${place.id}:${target.id}:${lane}`), lane, speedBase: 1.3 });
  npc.place(spot.x, spot.y, spot.z, 0);
  let done = false;
  const sent = sim.brain.goPoint(npc, { x: target.x, y: target.y, z: target.z }, () => { done = true; }, {});
  const { unstick, t } = walkOut(W, npc, sent);
  return { sent, done, unstick, t, off: Math.hypot(npc.st.x - target.x, npc.st.z - target.z), npc, stuck: npc.maxStuck };
}

/** The nodes of the graph's main component within `r` m of the court's middle that a person can walk from or to (not a door, not a stair). */
function nodesNear({ plan, sim }, r) {
  const court = courtOf(plan);
  return sim.nav.nodes.filter((n, i) => n.kind !== 'door' && n.kind !== 'stair' && sim.inMain(i) && Math.hypot(n.x - court.cx, n.z - court.cz) <= r);
}

// ---------------------------------------------------------------------------------------------------- the page's world
test('the page\'s world: every place outside the court fence has a node beside it with no wall across the last leg, and the people sim offers it', async () => {
  const { ctx, plan, sim } = await page(), ph = ctx.physics, nav = sim.nav, places = placesOf(plan), bad = [];
  assert.equal(places.filter((p) => p.kind === 'bench').length, 3, 'the three spectators\' benches survive the dressing of the court');
  assert.equal(places.filter((p) => p.kind === 'lean').length, 2, 'and the two fence leans');
  for (const p of places) {
    const i = nav.nearest(p.x, p.z, 16, p.y), N = nav.nodes[i], d = Math.hypot(N.x - p.x, N.z - p.z);
    if (d > 2.0) bad.push(`${p.id} ${p.kind}: the nearest node ${N.id} is ${d.toFixed(1)} m away`);
    if (ph.segmentBlocked(N.x, N.z, p.x, p.z, Math.min(N.y, p.y), 1.6, null, 2.0)) bad.push(`${p.id} ${p.kind}: a wall as tall as a fence across the last leg from ${N.id}`);
    if (!sim.inMain(i)) bad.push(`${p.id} ${p.kind}: ${N.id} is not in the main component of the graph`);
    if (spotOf(sim, p).cut) bad.push(`${p.id} ${p.kind}: the people sim cut it (no way in)`);
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(sim.spotsCut.map((s) => s.id).filter((id) => places.some((p) => p.id === id)), [], 'none of the five is in the list the people sim cut');
});

test('the page\'s world: a person walks to every place outside the fence from the court, the street and the arrival point, at every lane, without one stall', async () => {
  const W = await page(), bad = []; let walks = 0;
  for (const place of placesOf(W.plan)) for (const [from, start] of Object.entries(starts(W))) for (const lane of LANES) {
    const r = goTo(W, place, start, lane); walks++;
    if (!r.sent) bad.push(`${place.id} from ${from} lane ${lane}: no way (toSpot refused)`);
    else if (r.unstick) bad.push(`${place.id} from ${from} lane ${lane}: stuck at (${r.npc.st.x.toFixed(2)}, ${r.npc.st.z.toFixed(2)}) after ${r.t.toFixed(1)} s`);
    else if (!r.done || r.off > 0.35) bad.push(`${place.id} from ${from} lane ${lane}: ${r.done ? 'ended' : 'did not arrive,'} ${r.off.toFixed(2)} m from the place after ${r.t.toFixed(1)} s`);
    else if (r.stuck >= 2) bad.push(`${place.id} from ${from} lane ${lane}: arrived but stood still for ${r.stuck.toFixed(1)} s on the way`);
  }
  assert.ok(walks >= 200, `${walks} walks: the check would be vacuous with a handful`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} of ${walks} walks failed`);
});

test('the page\'s world: a person walks from every node within 45 m of the court to every place outside the fence and back from it, at five lanes, and nobody stands against the fence', async () => {
  const W = await page(), places = placesOf(W.plan), X = nodesNear(W, 45), lanes = [0.55, 0.725, 0.9, 1.075, 1.25], bad = []; let walks = 0;
  assert.ok(X.length >= 50, `${X.length} nodes within 45 m: the sweep would be thin`);
  for (const place of places) for (const n of X) for (const lane of lanes) {
    let r = goTo(W, place, n, lane); walks++;
    if (!r.sent) bad.push(`${n.id} -> ${place.id} lane ${lane}: no way (toSpot refused)`);
    else if (r.unstick) bad.push(`${n.id} -> ${place.id} lane ${lane}: stuck at (${r.npc.st.x.toFixed(2)}, ${r.npc.st.z.toFixed(2)})`);
    else if (!r.done || r.off > 0.35) bad.push(`${n.id} -> ${place.id} lane ${lane}: ${r.done ? 'ended' : 'did not arrive,'} ${r.off.toFixed(2)} m from the place after ${r.t.toFixed(0)} s, at (${r.npc.st.x.toFixed(2)}, ${r.npc.st.z.toFixed(2)})`);
    r = goFrom(W, place, n, lane); walks++;
    if (!r.sent) bad.push(`${place.id} -> ${n.id} lane ${lane}: no way (goPoint refused)`);
    else if (r.unstick) bad.push(`${place.id} -> ${n.id} lane ${lane}: stuck at (${r.npc.st.x.toFixed(2)}, ${r.npc.st.z.toFixed(2)})`);
    else if (!r.done || r.off > 0.35) bad.push(`${place.id} -> ${n.id} lane ${lane}: ${r.done ? 'ended' : 'did not arrive,'} ${r.off.toFixed(2)} m from ${n.id} after ${r.t.toFixed(0)} s, at (${r.npc.st.x.toFixed(2)}, ${r.npc.st.z.toFixed(2)})`);
  }
  assert.ok(walks >= 3000, `${walks} walks`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} of ${walks} walks failed`);
});

test('the page\'s world: the strip stays outside the fence: no edge of it comes within 0.85 m of the chain-link, none joins a court node, and the fence has no gate that it made', async () => {
  const { ctx, plan } = await page(), { courtFence, GAP } = await import('../js/world/courtside.js'), { PLAZA_BAND } = await import('../js/world/plan.js');
  const pl = courtOf(plan), f = courtFence(plan, pl, PLAZA_BAND), c = Math.cos(pl.ry), s = Math.sin(pl.ry), byId = new Map(plan.nav.nodes.map((n) => [n.id, n]));
  const L = (x, z) => [(x - pl.cx) * c - (z - pl.cz) * s, (x - pl.cx) * s + (z - pl.cz) * c];
  const outline = (x, z) => { const [lx, lz] = L(x, z); return Math.hypot(Math.max(f.xw - lx, 0, lx - f.xe), Math.max(f.zn - lz, 0, lz - f.zs)); };      // 0 inside the outline, else the distance to it
  const mine = plan.nav.edges.filter(([a, b]) => byId.get(a).side === 'court' || byId.get(b).side === 'court'), bad = [];
  assert.ok(mine.length >= 12, `${mine.length} edges of the strip`);
  for (const [a, b] of mine) {
    const A = byId.get(a), B = byId.get(b);
    if (A.kind === 'court' || B.kind === 'court') bad.push(`${a}-${b} joins a court node`);
    for (let k = 0; k <= 40; k++) { const x = A.x + ((B.x - A.x) * k) / 40, z = A.z + ((B.z - A.z) * k) / 40; if (outline(x, z) < GAP - 0.05) { bad.push(`${a}-${b} passes ${outline(x, z).toFixed(2)} m from the fence at (${x.toFixed(2)}, ${z.toFixed(2)})`); break; } }
  }
  assert.deepEqual(bad, []);
  // dress.js opens the fence only where an edge of the graph crosses it: the strip made no gate, so the west and the east run are whole
  const runs = ctx.physics.walls.filter((w) => w.id === 'prop' && Math.abs(w.x1 - w.x2) < 1e-6 && w.z1 !== w.z2 && Math.abs(Math.abs(w.x1 - pl.cx) - (pl.w / 2 - 0.3)) < 0.05 && w.y1 - w.y0 > 3);
  const len = (xs) => runs.filter((w) => Math.sign(w.x1 - pl.cx) === xs).reduce((m, w) => m + Math.abs(w.z2 - w.z1), 0);
  assert.ok(len(-1) > f.zs - f.zn - 0.1, `the west run of the fence is whole: ${len(-1).toFixed(2)} m of ${(f.zs - f.zn).toFixed(2)}`);
});

test('the page\'s world: do_bench sits a person on each court bench, hips on the middle of the seat, from the middle of the court', async () => {
  const W = await page(), { sim } = W, st = starts(W)['the middle of the court'], brain = sim.brain, pick = brain.pickSpot, bad = [];
  try {
    for (const place of placesOf(W.plan).filter((p) => p.kind === 'bench')) {
      const spot = spotOf(sim, place), f = [Math.sin(spot.ry), Math.cos(spot.ry)];
      brain.pickSpot = () => spot;                                                       // the brain's own choice of bench is random: ask for this one
      const npc = new Npc({ id: 'sit', rng: W.ctx.rng.fork('court:sit:' + place.id), lane: 0.9, speedBase: 1.3 });
      npc.place(st.x, st.y, st.z, 0);
      let unstick = 0, t = 0;
      const w = { t: 0, physics: W.ctx.physics, near: () => [], doors: null, brain: { unstick: (n) => { unstick++; n.stuckT = 0; } } };
      const ok = brain.do_bench(npc, {});
      while (ok && npc.mode === 'walk' && !unstick && t < 240) { w.t = t; sim.t = t; npc.step(0.05, w); t += 0.05; }
      const hips = Math.hypot(npc.st.x - (spot.x - f[0] * 0.1), npc.st.z - (spot.z - f[1] * 0.1));
      if (!ok) bad.push(`${place.id}: do_bench found no way`);
      else if (unstick || npc.act !== 'sit' || npc.sitH == null || hips > 1e-6) bad.push(`${place.id}: unstick ${unstick}, act ${npc.act}, sitH ${npc.sitH}, hips ${hips.toFixed(3)} m off the seat`);
      else if (sim.spots.claimOf(npc) !== spot) bad.push(`${place.id}: the bench is not claimed by the person who sits on it`);
      sim.spots.release(npc);
    }
  } finally { brain.pickSpot = pick; }
  assert.deepEqual(bad, []);
});

test('the page\'s world: the strip keeps the graph whole: in the main component, nothing stranded by the props, every strip node on free ground, every strip edge walks both ways in the page\'s physics', async () => {
  const { ctx, plan } = await page(), ph = ctx.physics, byId = new Map(plan.nav.nodes.map((n) => [n.id, n])), side = plan.nav.nodes.filter((n) => n.side === 'court'), bad = [];
  assert.ok(side.length >= 12, `${side.length} court-side nodes in the plan`);
  const comps = navComponents(plan);
  assert.deepEqual(side.filter((n) => !comps[0].includes(n.id)).map((n) => n.id), [], 'every strip node is in the main component');
  assert.deepEqual(comps.slice(1).map((c) => c.join()), ['n0'], 'the one node off it is the end of the entry road beyond the perimeter wall (fitNav drops its edge), as without the strip');
  assert.equal(ctx.world.navFit.stranded.length, 0, 'fitNav stranded no edge');
  for (const n of side) if (!standClear(ph, n.x, n.z, n.y, 0.3)) bad.push(`${n.id} (${n.x}, ${n.z}) is not free ground for a walker 0.3 m wide`);
  const mine = plan.nav.edges.filter(([a, b]) => byId.get(a).side === 'court' || byId.get(b).side === 'court');
  assert.ok(mine.length >= side.length, `${mine.length} edges for ${side.length} nodes`);
  for (const [a, b] of mine) for (const [p, q] of [[byId.get(a), byId.get(b)], [byId.get(b), byId.get(a)]]) if (!walkable(ph, p, q)) bad.push(`${p.id} -> ${q.id} does not walk`);
  assert.deepEqual(bad, []);
});

test('the page\'s world: the north run of the fence lies where courtFence says it does (dress.js and courtside.js share it, so the strip stays outside)', async () => {
  const { ctx, plan } = await page(), { courtFence } = await import('../js/world/courtside.js'), { PLAZA_BAND } = await import('../js/world/plan.js');
  const pl = courtOf(plan), f = courtFence(plan, pl, PLAZA_BAND), P = (lx, lz) => [pl.cx + lx * Math.cos(pl.ry) + lz * Math.sin(pl.ry), pl.cz - lx * Math.sin(pl.ry) + lz * Math.cos(pl.ry)];
  const [x1, z1] = P(f.xw, f.zn), [x2, z2] = P(f.xe, f.zn), near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
  assert.ok(f.cutN, 'the court has its cut bank on the north');
  assert.ok(ctx.physics.walls.some((w) => w.id === 'prop' && ((near([w.x1, w.z1], [x1, z1]) && near([w.x2, w.z2], [x2, z2])) || (near([w.x1, w.z1], [x2, z2]) && near([w.x2, w.z2], [x1, z1])))), 'a fence collider runs from corner to corner along the north line');
});

test('TEETH: take the strip out of the graph and the people sim cuts all five places again', async () => {
  const W = await page(), { ctx, plan } = W, meta = await readAssetJson('people/people_meta.json'), keep = plan.nav, places = placesOf(plan);
  const gone = new Set(keep.nodes.filter((n) => n.side === 'court').map((n) => n.id));
  assert.ok(gone.size >= 12, 'there is a strip to take out');
  plan.nav = { nodes: keep.nodes.filter((n) => !gone.has(n.id)), edges: keep.edges.filter(([a, b]) => !gone.has(a) && !gone.has(b)) };
  try {
    const sim = new PeopleSim(ctx); sim.build(new Map(meta.people.map((p) => [p.id, p])));
    assert.equal(places.filter((p) => spotOf(sim, p).cut).length, 5, 'with no strip each of the five places is cut');
  } finally { plan.nav = keep; }
});

// ---------------------------------------------------------------------------------------------------- linkCourtSide on a small plan
/**
 * A court at (100, 200), 28 x 14.5, turned by `ry`, with its three benches and two leans placed as places.js places them, three nodes inside the fence (n0 and n1 stand nearer the strip's two south
 * stubs than the street does), a street of 'street' nodes 4.5 m apart 4.5 m south of the court (`street: false` leaves it out) and a cut bank rising to the north.
 */
function mini({ ry = 0, lots = [], cut = true, street = true } = {}) {
  const cx = 100, cz = 200, w = 28, d = 14.5, hw = w / 2, hd = d / 2, c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c], L = (x, z) => [(x - cx) * c - (z - cz) * s, (x - cx) * s + (z - cz) * c];
  const heightAt = (x, z) => (cut ? 0.25 + Math.min(0.75, Math.max(0, (-(hd - 0.3) - L(x, z)[1]) * 0.5)) : 0.25);
  const poly = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => P(lx, lz));
  const poi = (id, kind, lx, lz, fy, tags) => { const [x, z] = P(lx, lz); return { id, kind, x: +x.toFixed(2), y: +heightAt(x, z).toFixed(2), z: +z.toFixed(2), ry: ry + fy, tags }; };
  const node = (id, lx, lz, kind = 'court', area = 'P3') => { const [x, z] = P(lx, lz); return { id, x: +x.toFixed(2), y: +heightAt(x, z).toFixed(2), z: +z.toFixed(2), kind, ...(area ? { area } : {}) }; };
  const nodes = [node('n0', -12.8, 6.05), node('n1', 12.8, 6.05), node('n2', 0, 0)], edges = [['n0', 'n2'], ['n1', 'n2']];
  if (street) {
    for (let i = 0; i < 9; i++) { nodes.push(node('s' + i, -18 + 4.5 * i, hd + 4.5, 'street', null)); if (i) edges.push(['s' + (i - 1), 's' + i]); }
    edges.push(['n0', 's2'], ['n1', 's6']);                                                          // the court's ways out (the fence has gaps there)
  }
  const plan = {
    plazas: [{ id: 'P3', kind: 'court', cx, cz, w, d, ry, y: 0.25, poly }], lots, warnings: [], heightAt,
    pois: [poi('b0', 'bench', 0, -hd - 1.8, 0, ['court-side']), poi('b1', 'bench', -hw - 1.8, 0, Math.PI / 2, ['court-side']), poi('b2', 'bench', hw + 1.8, 0, -Math.PI / 2, ['court-side']),
      poi('l0', 'lean', -8, -hd - 1.2, 0, ['fence']), poi('l1', 'lean', 8, -hd - 1.2, 0, ['fence'])],
    nav: { nodes, edges },
  };
  return { plan, P, L, node };
}
const reach = (plan, from) => { const adj = new Map(plan.nav.nodes.map((n) => [n.id, []])); for (const [a, b] of plan.nav.edges) { adj.get(a).push(b); adj.get(b).push(a); } const seen = new Set([from]), q = [from]; while (q.length) for (const o of adj.get(q.pop())) if (!seen.has(o)) { seen.add(o); q.push(o); } return seen; };

test('linkCourtSide: a node in front of each end bench, behind the north bench and each lean, all outside the fence, joined to the street (never through the fence), on a court of any heading', async () => {
  const { linkCourtSide, courtFence, FRONT, BACK } = await import('../js/world/courtside.js');
  for (const ry of [0, 0.35, -1.1]) {
    const { plan, L } = mini({ ry }), pl = plan.plazas[0], f = courtFence(plan, pl, 0.6), before = plan.nav.nodes.length;
    assert.equal(f.cutN, true, 'the cut bank is seen');
    const res = linkCourtSide(plan, 0.6), byId = new Map(plan.nav.nodes.map((n) => [n.id, n])), at = (id) => L(byId.get(id).x, byId.get(id).z);
    assert.ok(res.nodes.length >= 14 && plan.nav.nodes.length === before + res.nodes.length, `${res.nodes.length} nodes added`);
    assert.deepEqual(res.nodes.map((n) => n.id), res.nodes.map((_, i) => 'n' + (before + i)), 'ids go on from the last node');
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.03;
    for (const [id, dx, dz] of [['b1', FRONT, 0], ['b2', -FRONT, 0], ['b0', 0, -BACK], ['l0', 0, -BACK], ['l1', 0, -BACK]]) {
      const p = plan.pois.find((q) => q.id === id), [lx, lz] = L(p.x, p.z);
      assert.ok(res.by[id], `${id} has a node`);
      assert.ok(near(at(res.by[id]), [lx + dx, lz + dz]), `${id} (${lx.toFixed(2)}, ${lz.toFixed(2)}): its node is at ${at(res.by[id]).map((v) => v.toFixed(2))}, wanted ${(lx + dx).toFixed(2)}, ${(lz + dz).toFixed(2)}`);
    }
    const outline = (lx, lz) => Math.hypot(Math.max(f.xw - lx, 0, lx - f.xe), Math.max(f.zn - lz, 0, lz - f.zs));
    for (const n of res.nodes) {
      assert.equal(n.kind, 'path'); assert.equal(n.side, 'court'); assert.ok(n.w <= 0.7, 'a narrow node: waypoints keeps a walker to the line of the graph (no lane offset)');
      assert.ok(outline(...L(n.x, n.z)) >= 0.9, `${n.id} (${L(n.x, n.z).map((v) => v.toFixed(2))}) is ${outline(...L(n.x, n.z)).toFixed(2)} m from the fence outline`);
    }
    const added = new Set(res.nodes.map((n) => n.id)), newEdges = plan.nav.edges.filter(([a, b]) => added.has(a) || added.has(b));
    for (const [a, b] of newEdges) {
      const A = byId.get(a), B = byId.get(b), len = Math.hypot(A.x - B.x, A.z - B.z);
      if (A.kind === 'path' && B.kind === 'path') assert.ok(len <= 5.0, `${a}-${b} is ${len.toFixed(2)} m long (a path-path edge may not pass 5.2)`);
      assert.ok(Math.abs(A.y - B.y) / len <= 0.9, `${a}-${b} climbs too steeply`);
    }
    const crossing = newEdges.filter(([a, b]) => { const A = byId.get(a), B = byId.get(b); for (let k = 0; k <= 40; k++) { const [lx, lz] = L(A.x + ((B.x - A.x) * k) / 40, A.z + ((B.z - A.z) * k) / 40); if (lx > f.xw - 0.05 && lx < f.xe + 0.05 && lz > f.zn - 0.05 && lz < f.zs + 0.05) return true; } return false; });
    assert.deepEqual(crossing, [], 'no edge of the strip touches the fence outline or runs inside it: the strip makes no gate');
    const links = newEdges.filter(([a, b]) => !added.has(a) || !added.has(b)).map(([a, b]) => (added.has(a) ? b : a)).sort();
    assert.deepEqual(links, ['s1', 's7'], 'the strip joins the graph at the street node nearest each end, once each (s1 by the west stub, s7 by the east one), and at no court node');
    const seen = reach(plan, 'n2');
    assert.ok(plan.nav.nodes.every((n) => seen.has(n.id)), 'every node of the strip can be reached from the court (by the street)');
    assert.deepEqual(plan.warnings, [], 'no warning');
  }
});

test('linkCourtSide: a court with no cut bank puts the north strip behind the bench all the same; a plan with no court or no benches is left alone', async () => {
  const { linkCourtSide, courtFence } = await import('../js/world/courtside.js');
  const { plan, L } = mini({ cut: false }), f = courtFence(plan, plan.plazas[0], 0.6);
  assert.equal(f.cutN, false); assert.ok(Math.abs(f.zn + (14.5 / 2 - 0.3)) < 1e-9, 'the north fence stands inside the court\'s edge when there is no bank');
  const res = linkCourtSide(plan, 0.6);
  assert.ok(res.by.b0 && res.by.b1 && res.by.b2, 'all three benches have a node');
  const [, lz] = L(plan.nav.nodes.find((n) => n.id === res.by.b0).x, plan.nav.nodes.find((n) => n.id === res.by.b0).z);
  assert.ok(Math.abs(lz - (-(14.5 / 2) - 1.8 - 1.5)) < 0.03, 'behind the north bench, 1.5 m');
  const none = { plazas: [], pois: [], lots: [], warnings: [], heightAt: () => 0, nav: { nodes: [{ id: 'n0', x: 0, y: 0, z: 0, kind: 'street' }], edges: [] } }, snap = JSON.stringify(none);
  assert.deepEqual(linkCourtSide(none, 0.6).nodes, []); assert.equal(JSON.stringify(none), snap, 'a plan with no court is not touched');
  const bare = mini().plan; bare.pois = []; const nb = bare.nav.nodes.length;
  assert.deepEqual(linkCourtSide(bare, 0.6).nodes, []); assert.equal(bare.nav.nodes.length, nb, 'a court with no benches gets no strip');
});

test('linkCourtSide: a building across the strip stops it there: what is built is joined to the graph and clear of the building, the benches beyond are left without a node, and the plan says so', async () => {
  const { linkCourtSide } = await import('../js/world/courtside.js');
  const probe = mini(), [bx, bz] = probe.P(-14.675, -4.5);
  const lot = { id: 'LX', x: bx, z: bz, w: 5, d: 3, rotY: 0, y: 0.5 };                  // a block across the west line, north of the west bench
  const { plan, L } = mini({ lots: [lot] }), res = linkCourtSide(plan, 0.6), byId = new Map(plan.nav.nodes.map((n) => [n.id, n]));
  assert.ok(res.by.b1, 'the west bench, south of the building, still has its node');
  assert.equal(res.by.b0, undefined, 'the north bench, beyond it, has none'); assert.equal(res.by.l0, undefined); assert.equal(res.by.l1, undefined);
  assert.ok(res.by.b2, 'the east bench has its own strip');
  assert.ok(plan.warnings.some((w) => /^court-side/.test(w) && /b0/.test(w) && /l0/.test(w) && /l1/.test(w) && !/b1|b2/.test(w)), `the plan names the places left without a node: ${JSON.stringify(plan.warnings)}`);
  const seen = reach(plan, 'n2');
  assert.ok(plan.nav.nodes.every((n) => seen.has(n.id)), 'nothing is left hanging');
  for (const n of res.nodes) { const [lx, lz] = [n.x - lot.x, n.z - lot.z]; assert.ok(Math.abs(lx) > lot.w / 2 + 0.4 || Math.abs(lz) > lot.d / 2 + 0.4, `${n.id} (${n.x}, ${n.z}) stands in the building`); }
  void byId; void L;
});

test('linkCourtSide: a route leaves the nearest node of the street that a line fits to; when a building shuts the way to it, what was laid towards it is taken back and the next one is tried', async () => {
  const { linkCourtSide } = await import('../js/world/courtside.js');
  const { plan, P, node } = mini({ street: false });
  // the west stub stands at (-14.675, 8.45) in the court's frame. sa: due south of it, 6.55 m, two legs, a building across the second; sb: 7.5 m to the west-south-west, a clear line; se: the east stub's street node.
  const sa = node('sa', -14.675, 15, 'street', null), sb = node('sb', -22, 10, 'street', null), se = node('se', 13.5, 11.25, 'street', null);
  plan.nav.nodes.push(sa, sb, se); plan.nav.edges.push(['sa', 'sb'], ['sa', 'se']);
  const [bx, bz] = P(-14.675, 10.5);
  plan.lots.push({ id: 'LB', x: bx, z: bz, w: 2, d: 1, rotY: 0, y: 0.5 });
  const before = plan.nav.nodes.length, res = linkCourtSide(plan, 0.6), added = new Set(res.nodes.map((n) => n.id)), byId = new Map(plan.nav.nodes.map((n) => [n.id, n]));
  assert.deepEqual(plan.warnings, [], 'no warning: sb serves');
  assert.ok(res.by.b1 && res.by.b0 && res.by.b2, 'every bench has its node');
  const links = res.edges.filter(([a, b]) => !added.has(a) || !added.has(b)).map(([a, b]) => (added.has(a) ? b : a)).sort();
  assert.deepEqual(links, ['sb', 'se'], 'the west route left sb, the east route se, and sa was not used');
  const [rx, rz] = P(-14.675, 11.725);
  assert.equal(plan.nav.nodes.filter((n) => Math.hypot(n.x - rx, n.z - rz) < 0.5).length, 0, 'the node laid towards sa (the first leg, before the building) is gone');
  assert.equal(plan.nav.nodes.length, before + res.nodes.length, 'the nodes of the plan and the list of what was laid agree');
  for (const [a, b] of plan.nav.edges) assert.ok(byId.has(a) && byId.has(b), `${a}-${b} joins nodes that exist`);
  assert.ok(!plan.nav.edges.some(([a, b]) => (a === 'sa' || b === 'sa') && (added.has(a) || added.has(b))), 'no edge of the strip touches sa');
});

test('linkCourtSide: with no node of the plan to leave from within reach, nothing is laid and the plan says so', async () => {
  const { linkCourtSide } = await import('../js/world/courtside.js');
  const { plan } = mini({ street: false }), snap = JSON.stringify(plan.nav), res = linkCourtSide(plan, 0.6);
  assert.deepEqual(res.nodes, []); assert.deepEqual(res.edges, []); assert.equal(JSON.stringify(plan.nav), snap, 'the graph is as it was: no stray node');
  assert.equal(plan.warnings.length, 1, JSON.stringify(plan.warnings));
  assert.ok(/^court-side/.test(plan.warnings[0]) && /no node of the plan within 14 m/.test(plan.warnings[0]), plan.warnings[0]);
  for (const id of ['b0', 'b1', 'b2', 'l0', 'l1']) assert.ok(plan.warnings[0].includes(id), `${id} is named`);
});
