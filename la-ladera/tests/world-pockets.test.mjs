// The pockets (R1-D23, round 5: "a sand-faced wedge mound with a grass top between houses at the street edge", at (8, 64) and (-35, -25), unchanged since round 2): the gaps in a street's
// frontage where the ground climbs behind the pavement, found from the plan and planted. The plan (pockets.js planPockets: pure) is walked here, then the world that plants it. Each check that
// can go vacuous has a TEETH next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-pockets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { buildOccupancy, OCC } from '../js/world/occupancy.js';
import { planPockets, POCKET } from '../js/world/pockets.js';
import { makePlan, SEED } from './world-lib.mjs';

const { plan } = makePlan(), occ = buildOccupancy(plan, new Map()), P = planPockets(plan, occ);
const R1 = [[8, 64], [-35, -25]];                                              // where R1 stood when it saw the wedge

test('the plan has its pockets, among them the two R1 saw', () => {
  assert.ok(P.length >= 10 && P.length <= 20, `${P.length} pockets`);
  for (const [x, z] of R1) assert.ok(P.some((p) => Math.hypot(p.x - x, p.z - z) < 12), `a pocket within 12 m of (${x}, ${z}): ${P.map((p) => `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).join(' ')}`);
  for (const p of P) {
    assert.ok(Math.abs(Math.hypot(p.nx, p.nz) - 1) < 1e-9, 'a unit normal');
    assert.ok(p.len >= POCKET.minLen && p.len <= 25, `${p.street}: ${p.len} m of frontage`);
    assert.ok(p.rise >= POCKET.rise && p.rise < 4, `${p.street}: climbs ${p.rise.toFixed(2)} m`);
    assert.ok(occ.clear(p.x, p.z, 0.65, POCKET.mask), `${p.street} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) is on a street, stair, plaza or building`);
  }
  assert.deepEqual(planPockets(plan, occ), P, 'the same plan twice');
});

test('a pocket is a climb behind open ground (TEETH: a plan with level ground has none, and so has one with every cell taken)', () => {
  assert.equal(planPockets({ ...plan, heightAt: () => 5 }, occ).length, 0, 'level ground, no wedge');
  assert.equal(planPockets(plan, { ...occ, clear: () => false }).length, 0, 'no open ground, no pocket');
  const steep = planPockets({ ...plan, heightAt: (x, z) => plan.heightAt(x, z) + 0.4 * ((x * 7 + z * 3) % 1) }, occ);
  assert.ok(steep.length !== P.length || steep.some((p, i) => p.rise !== P[i]?.rise), 'a different ground, a different plan');
});

// ------------------------------------------------------------------------------------------------------------------------------ the world
const ctx = createContext({ seed: SEED, headless: true });
ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
await buildWorld(ctx); await buildProps(ctx); ctx.batch.flushAll();
const W = ctx.world, S = W.pockets;

test('the world plants them: after the flora, before the planters, every pocket with flowers, grass, bushes and rocks, and no error', () => {
  assert.deepEqual(ctx.errors, []);
  const order = Object.keys(W.propTimes);
  assert.ok(order.indexOf('flora') < order.indexOf('pockets') && order.indexOf('pockets') < order.indexOf('planters'), order.join(' '));
  assert.equal(S.pockets, P.length, 'the plan the world planted is the plan of the pure planner');
  assert.ok(S.tufts >= 150 && S.shrubs >= 30 && S.agaves >= 10 && S.rocks >= 8 && S.flowers >= 20 && S.trees >= 2, JSON.stringify({ ...S, spots: undefined, placed: undefined }));
  assert.equal(S.placed.length, S.tufts + S.shrubs + S.agaves + S.rocks + S.flowers + S.trees, 'every one is recorded');
  for (let i = 0; i < P.length; i++) {
    const mine = S.placed.filter((q) => q[3] === i);
    const kinds = new Set(mine.map((q) => q[0]));
    assert.ok(mine.length >= 12, `pocket ${i} (${P[i].x.toFixed(0)}, ${P[i].z.toFixed(0)}) has ${mine.length} plants`);
    assert.ok(kinds.has('tufts') && (kinds.has('shrubs') || kinds.has('agaves') || kinds.has('flowers')), `pocket ${i}: ${[...kinds].join(' ')}`);
  }
});

test('nothing is planted on a street, a stair, a plaza, a building, a walking route or a doorstep (TEETH: the check does see a plant on a street)', () => {
  const bad = S.placed.filter(([, x, z]) => !occ.clear(x, z, 0, POCKET.keep));
  assert.equal(bad.length, 0, `${bad.length} on ground that is kept clear: ${bad.slice(0, 4).map((q) => `${q[0]}@(${q[1]}, ${q[2]})`).join(' ')}`);
  const street = plan.streets.find((s) => s.kind === 'road'), mid = street._d.pts[Math.floor(street._d.pts.length / 2)];
  assert.ok(!occ.clear(mid[0], mid[1], 0, POCKET.keep), 'the middle of a road is not clear');
  assert.ok((occ.at(mid[0], mid[1]) & OCC.ROAD) !== 0);
});

/** (x, z) lies in pocket p's garden: within its frontage (a little over) and from 3.3 m before its middle to 2.8 m behind it */
const inPocket = (p, x, z) => {
  const dx = x - p.x, dz = z - p.z, along = Math.abs(dx * -p.nz + dz * p.nx), deep = dx * p.nx + dz * p.nz;
  return along <= p.len / 2 + 1.0 && deep >= -3.7 && deep <= 3.2;
};

test('each plant stands in its pocket: within the frontage and a few metres behind the pavement (TEETH: a plant moved 40 m is out)', () => {
  const out = S.placed.filter(([, x, z, i]) => !inPocket(P[i], x, z));
  assert.equal(out.length, 0, `${out.length} plants outside their pocket: ${out.slice(0, 3).map((q) => `${q[0]}@(${q[1]}, ${q[2]})`).join(' ')}`);
  const [, x, z, i] = S.placed[0];
  assert.equal(inPocket(P[i], x, z), true);
  assert.equal(inPocket(P[i], x + 40, z), false);
});

test('the trees keep out of the mirador\'s view, as the flora\'s do', () => {
  const view = W.view;
  assert.ok(view, 'the mirador has a view');
  const inView = (x, z) => { const vx = x - view.x, vz = z - view.z, d = vx * view.dx + vz * view.dz; return d > -3 && d < view.reach && Math.abs(vx * view.dz - vz * view.dx) < view.apex + Math.max(0, d) * Math.tan(view.half); };
  const trees = S.placed.filter((q) => q[0] === 'trees');
  assert.ok(trees.length >= 2, `${trees.length} trees`);
  for (const [, x, z] of trees) assert.ok(!inView(x, z), `a tree in the view at (${x}, ${z})`);
  assert.equal(inView(view.x + view.dx * 20, view.z + view.dz * 20), true, 'TEETH: the fan is where it says');
});
