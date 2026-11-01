// The rim walk (R1-D21, round 5: "the plot edge is a blank stepped boundary wall with nothing beyond; any rim walk ends at it"): a footpath along the foot of the wall with treads where it
// climbs, weeds along the foot, vines up the face, rebar, chain-link and rubble on the crest. The plan (rimwalk.js planRimWalk: pure) is walked here, then the world that builds it. Each
// check that can go vacuous has a TEETH next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-rimwalk.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { planRimWalk, RIM, crestKind, pathLookup, panelOf, along } from '../js/world/rimwalk.js';
import { segDist } from '../js/world/geom.js';
import { HALF } from '../js/world/field.js';
import { makePlan, SEED } from './world-lib.mjs';

const { plan } = makePlan(), E = HALF - 0.45, GATE = { x: 20, half: 5.4 };
const flat = () => 5, ramp = (x, z) => 0.35 * z;
const free = () => true;
const reach = (side, x, z) => (side === 'e' ? E - x : side === 'w' ? x + E : side === 'n' ? z + E : E - z);          // how far in from the wall's axis a point is
const A = planRimWalk(plan, free, flat, GATE);

test('a path along each side of the wall, a metre and a half in, wandering a little, never in the plot\'s corner or the gate', () => {
  for (const side of ['e', 'w', 'n', 's']) {
    const runs = A.paths.filter((p) => p.side === side);
    assert.ok(runs.length >= 1, `${side}: a path`);
    const m = runs.reduce((n, p) => n + (p.pts.length - 1) * RIM.step, 0);
    assert.ok(m >= (side === 's' ? 120 : 170), `${side}: ${m} m of path`);
    for (const p of runs) for (const [x, z] of p.pts) {
      const d = reach(side, x, z);
      assert.ok(d >= RIM.inset - RIM.wander - RIM.noise - 0.02 && d <= RIM.inset + RIM.wander + RIM.noise + 0.02, `${side} (${x.toFixed(1)}, ${z.toFixed(1)}) is ${d.toFixed(2)} m in`);
      assert.ok(Math.abs(along(side, x, z)) <= HALF - 7 + 1e-6, `${side}: ${along(side, x, z)} is in the corner`);
    }
  }
  const south = A.paths.filter((p) => p.side === 's');
  assert.equal(south.length, 2, 'the gate splits the south path in two');
  for (const p of south) for (const [x] of p.pts) assert.ok(Math.abs(x - GATE.x) >= GATE.half + 10 - 1e-6, `south path at x ${x.toFixed(1)} is under the gate`);
  assert.ok(A.paths.every((p) => p.pts.length >= 5), 'a run is five points or more');
  assert.deepEqual(planRimWalk(plan, free, flat, GATE), A, 'the same plan twice');
  const free2 = (x, z) => !(x > 90 && Math.abs(z) < 20);                                          // TEETH: ground that is taken cuts the path
  const cut = planRimWalk(plan, free2, flat, GATE), east = cut.paths.filter((p) => p.side === 'e');
  assert.equal(east.length, A.paths.filter((p) => p.side === 'e').length + 1, 'the east path breaks where the ground is taken');
  for (const p of east) for (const [x, z] of p.pts) assert.ok(free2(x, z), 'no point on taken ground');
  assert.equal(planRimWalk(plan, () => false, flat, GATE).paths.length, 0, 'and nothing at all where nothing is free');
});

test('treads where the path climbs: one every 0.9 m on a stretch steeper than 0.2, none on flat ground', () => {
  assert.equal(A.steps.length, 0, 'flat ground, no treads');
  const R = planRimWalk(plan, free, ramp, GATE);
  assert.ok(R.steps.length >= 150, `${R.steps.length} treads on a hill`);
  const sides = new Set(R.steps.map((s) => s.side));
  assert.ok(sides.has('e') && sides.has('w'), 'on the east and west paths, which climb along the wall');
  assert.ok(!sides.has('n') && !sides.has('s'), 'not on the north and south paths, which are level along the wall');
  for (const s of R.steps) {
    assert.ok(Number.isFinite(s.ry) && s.w > RIM.width, 'a tread is as wide as the path and a little more');
    assert.ok(reach(s.side, s.x, s.z) > 1 && reach(s.side, s.x, s.z) < 2, 'on the path');
  }
  const gentle = planRimWalk(plan, free, (x, z) => 0.15 * z, GATE);
  assert.equal(gentle.steps.length, 0, 'a gradient of 0.15 is walked, not stepped');
});

test('vines up the face and weeds along the foot, off the gate', () => {
  assert.ok(A.climbers.length >= 30, `${A.climbers.length} vines`);
  assert.ok(A.weeds.length >= 300, `${A.weeds.length} weeds`);
  for (const c of A.climbers) {
    assert.ok(Math.abs(Math.hypot(c.nx, c.nz) - 1) < 1e-9, 'a unit normal');
    assert.ok(Math.abs(reach(c.side, c.x, c.z) - 0.28) < 1e-9, 'on the wall\'s face');
    assert.ok(c.h >= 2 && c.h <= 3.2 && c.w >= 1.5 && c.w <= 2.5, 'a vine as high as the wall and as wide as a panel');
    if (c.side === 's') assert.ok(Math.abs(c.x - GATE.x) >= GATE.half + 6, 'not over the gate');
  }
  for (const w of A.weeds) { const d = reach(w.side, w.x, w.z); assert.ok(d >= 0.42 - 1e-9 && d <= 0.77 + 1e-9, `a weed ${d.toFixed(2)} m in`); }
  assert.ok(planRimWalk(plan, free2off, flat, GATE).weeds.length < A.weeds.length, 'TEETH: taken ground has no weeds');
  function free2off(x, z) { return Math.abs(x) < 90 || Math.abs(z) < 90; }
});

test('the crest: rebar, chain-link, rubble, nothing; panels and where a point falls', () => {
  assert.equal(crestKind(0.05), 'rebar'); assert.equal(crestKind(0.15), 'mesh'); assert.equal(crestKind(0.2), 'rubble'); assert.equal(crestKind(0.5), null);
  let n = 0; const seen = { rebar: 0, mesh: 0, rubble: 0, none: 0 };
  for (let i = 0; i < 1000; i++) { seen[crestKind(i / 1000) ?? 'none']++; n++; }
  assert.deepEqual(seen, { rebar: 100, mesh: 90, rubble: 80, none: 730 }, `${n} panels`);
  assert.equal(panelOf('e', 99, -100), 0); assert.equal(panelOf('e', 99, -98.1), 0); assert.equal(panelOf('e', 99, -97.9), 1); assert.equal(panelOf('n', 0, -99), 50);
  assert.equal(along('e', 3, 4), 4); assert.equal(along('w', 3, 4), 4); assert.equal(along('n', 3, 4), 3); assert.equal(along('s', 3, 4), 3);
});

test('the path as a lookup: near a point on it, not far from it', () => {
  const near = pathLookup([{ side: 'e', pts: [[98, 0], [98, 1.5], [98, 3], [98, 4.5], [98, 6]] }]);
  assert.equal(near(98, 3, 0), true);
  assert.equal(near(98.5, 3, 0), true, 'within the width of the path');
  assert.equal(near(99.5, 3, 0), false, 'beside it');
  assert.equal(near(99.5, 3, 1), true, 'beside it, with a plant\'s radius');
  assert.equal(near(98, 40, 0), false, 'far along');
  assert.equal(near(98, 6.5, 0), true, 'a little past the end, within its width');
});

// ------------------------------------------------------------------------------------------------------------------------------ the world
const ctx = createContext({ seed: SEED, headless: true });
ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
await buildWorld(ctx); await buildProps(ctx); ctx.batch.flushAll();
const W = ctx.world, S = W.rimwalk;

test('the world builds it: before the flora, after the boundary, with a path on every side, treads, vines, crest dressing and no error', () => {
  assert.deepEqual(ctx.errors, []);
  const order = Object.keys(W.propTimes);
  assert.ok(order.indexOf('boundary') < order.indexOf('rimwalk') && order.indexOf('rimwalk') < order.indexOf('flora') && order.indexOf('hill') < order.indexOf('rimwalk'), order.join(' '));
  assert.ok(S.paths >= 4 && S.pathM >= 450, `${S.paths} paths, ${S.pathM} m`);
  assert.ok(S.steps >= 100, `${S.steps} treads on the real hill`);
  assert.ok(S.climbers >= 20 && S.weeds >= 200, `${S.climbers} vines, ${S.weeds} weeds`);
  assert.ok(S.rebar >= 15 && S.mesh >= 30 && S.rubble >= 10 && S.drapes >= 4, `rebar ${S.rebar}, chain-link ${S.mesh}, rubble ${S.rubble}, creepers ${S.drapes}`);
  const crests = W.crests;
  assert.deepEqual(Object.keys(crests).sort(), ['e', 'n', 's', 'w'], 'the boundary reports the top of every side');
  assert.equal(crests.s.length, 2, 'the gate breaks the south crest in two');
  assert.equal(crests.n.length, 1, 'one run on the north side');
  assert.equal(crests.n[0].length, 100, 'a panel every 2 m');
  // the east and west walls: one run of 100 panels, unless A2's edge walls raised some of them (edgewall.js takes those out of the runs: the dressing goes on the plain panels only)
  const raised = { e: W.edge?.raised.e ?? 0, w: W.edge?.raised.w ?? 0 };
  for (const side of ['e', 'w']) {
    assert.equal(crests[side].reduce((n, r) => n + r.length, 0), 100 - raised[side], `side ${side}: every panel that was not raised is on a run`);
    if (!raised[side]) assert.equal(crests[side].length, 1, `side ${side}: one run of 100 panels`);
    else assert.ok(crests[side].length > 1 && crests[side].every((r) => r.length > 0), `side ${side}: the raised stretches split the crest into ${crests[side].length} runs`);
  }
  const names = new Set(); ctx.scene.traverse((o) => { if (o.isMesh && /^props\.rim(top)?[.:]/.test(o.name)) names.add(o.name.split(':')[1]); });
  for (const m of ['dirt_path', 'concrete_bare', 'rusty_iron', 'fence_mesh', 'iron_black']) assert.ok(names.has(m), `the rim has ${m}`);
});

test('the path\'s ground is taken, and nothing solid stands on it (the flora, the props and the rocks keep off it)', () => {
  const pts = S.plan.paths.flatMap((p) => p.pts);
  assert.ok(pts.length > 400);
  const taken = pts.filter(([x, z]) => W.occ.overlaps(x, z, 0.1)).length;
  assert.ok(taken >= 0.95 * pts.length, `${taken} of ${pts.length} points are on a taken disc`);
  const solid = ctx.physics.walls.filter((w) => w.id === 'prop' && Math.hypot(w.x2 - w.x1, w.z2 - w.z1) < 1.2);
  const onPath = (w) => S.plan.paths.some((p) => p.pts.some(([x, z], k) => k && segDist(w.x1, w.z1, p.pts[k - 1], [x, z]) < w.t + 0.35));
  const bad = solid.filter(onPath);
  assert.equal(bad.length, 0, `${bad.length} props stand on the path: ${bad.slice(0, 3).map((w) => `(${w.x1.toFixed(1)}, ${w.z1.toFixed(1)})`).join(' ')}`);
  assert.ok(solid.length > 150, `${solid.length} solid props to test against`);
  assert.ok(onPath({ x1: pts[10][0], z1: pts[10][1], x2: pts[10][0], z2: pts[10][1], t: 0.2 }), 'TEETH: a post put on the path is found');
});

test('every path point stands on ground the walker can reach: clear of the wall\'s collider and not inside a building', () => {
  const ph = ctx.physics, lots = W.occ;
  for (const [x, z] of S.plan.paths.flatMap((p) => p.pts)) {
    assert.ok(Math.max(Math.abs(x), Math.abs(z)) < HALF - 0.55 - 0.3, `(${x.toFixed(1)}, ${z.toFixed(1)}) is beside the perimeter collider`);
    assert.equal(lots.at(x, z) & 16, 0, `(${x.toFixed(1)}, ${z.toFixed(1)}) is in a building`);
  }
  assert.ok(ph.walls.length > 100);
});
