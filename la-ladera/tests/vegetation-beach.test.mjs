// The far-hill groves stay out of the bay (A5, js/world/vegetation.js dressVegetation, dev/FEATURE-BEACH.md round 7). The hill's groves are a 12 m grid of jittered spots with a species and a height, and before the
// beach the south of the plot was bare hill, so the grid ran over it unchallenged. With the bay there (the promenade, the sand and the sea of coast.js) it planted palms and almendros in the water and on the sand.
// The guard skips a grove whose spot is in the bay's footprint, or whose ground is the sea or the strip of sand at its edge, AFTER every draw of that step is made, so no other grove moves.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/vegetation-beach.test.mjs
// Every check has a deliberately broken input selected by VB_SABOTAGE=<id>|all, and each must then FAIL:
//   blind  the plan has no coast when the guard looks (the loop as it was before the guard)      nosea  the sea and the sand strip look dry to the guard      drift  the grove stream is one draw out (a guard that eats a draw)
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildOccupancy } from '../js/world/occupancy.js';
import { makeKit } from '../js/world/kit.js';
import { makeFarHeight } from '../js/world/periphery.js';
import { dressVegetation } from '../js/world/vegetation.js';
import { SEA, Z0, BAY_X } from '../js/world/coast.js';

const SAB = process.env.VB_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);

/**
 * dressVegetation(K) on the page's plan with no buildings (the groves never look at them) and the plant library replaced by a recorder: every far grove it places, with the ground under it.
 * `control` is the loop as it was before the guard. The loop reads plan.coast twice per spot: in urbanDensity (the draw's acceptance, early) and in the guard (after the far ground is asked), so the control
 * blinds the plan to its coast between those two reads: every draw and every accepted spot is then the page's own, and only the guard is out.
 */
function groves({ control = false, drift = false, dry = false } = {}) {
  const ctx = createContext({ headless: true, coast: true });
  ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt); ctx.world ??= {};
  const plan = ctx.plan, coast = plan.coast, real = makeFarHeight(plan), placed = [];
  const K = makeKit(ctx, plan, buildOccupancy(plan, ctx.buildings));
  let blind = false, ground = NaN;
  Object.defineProperty(plan, 'coast', { configurable: true, enumerable: true, get: () => (blind ? undefined : coast) });
  plan._far = Object.assign((x, z) => {
    ground = real(x, z); blind = control;
    return dry && z > Z0 && ground < SEA + 0.6 ? SEA + 3 : ground;                          // (the sabotage: the water and the sand strip are seen as dry land)
  }, { road: real.road });
  if (drift) { const rng = K.rng; K.rng = (label) => { const r = rng(label); if (label === 'vegetation:far') r.next(); return r; }; }
  K.vegetation = { place(species, x, y, z, o = {}) { if (o.far) { placed.push({ species, x, y, z, height: o.height, ground }); blind = false; } return true; }, finalize() {} };
  dressVegetation(K);
  assert.equal(ctx.world.vegetationDressing.farTrees, placed.length, 'the dressing counts the groves it placed');
  return placed;
}

const inBay = (g) => g.z > Z0 && Math.abs(g.x) < BAY_X + 8;
const inSea = (g) => g.z > Z0 && g.ground < SEA + 0.6;                                         // (south of the plot, where the coast's ground is: a dip of the hill north of it is dry land, whatever its height)
const before = groves({ control: true });                                                    // (every grove the stream offers: the hill as it was)
const after = groves({ control: on('blind', 'all'), drift: on('drift', 'all'), dry: on('nosea', 'all') });

test('the hill\'s grove stream does put trees in the bay and in the sea (so the checks below are not vacuous)', () => {
  assert.ok(before.length > 2500, 'a hill of groves: ' + before.length);                                           // (3107 on the page's seed: 352 in the bay's footprint, 4 of them on dry sand, and 596 more beyond it on ground below the sea's edge)
  assert.ok(before.filter(inBay).length > 150, 'groves over the promenade and the sand: ' + before.filter(inBay).length);
  assert.ok(before.filter(inSea).length > 300, 'groves in the sea: ' + before.filter(inSea).length);
});

test('no grove stands in the bay: nothing over the promenade, the deck, the sand and the dunes\' foot', () => {
  const bad = after.filter(inBay);
  assert.equal(bad.length, 0, `${bad.length} groves in the bay, e.g. (${bad[0]?.x.toFixed(1)}, ${bad[0]?.z.toFixed(1)})`);
});

test('no grove stands in the sea or on the strip of sand at its edge, whatever the x', () => {
  const bad = after.filter(inSea);
  assert.equal(bad.length, 0, `${bad.length} groves on ground below ${(SEA + 0.6).toFixed(1)} m, e.g. (${bad[0]?.x.toFixed(1)}, ${bad[0]?.z.toFixed(1)}) at ${bad[0]?.ground.toFixed(1)} m`);
});

test('the rest of the hill is as it was: the same spots, species, heights and grounds, in the same order (no draw is eaten, so no other grove moves)', () => {
  const kept = before.filter((g) => !inBay(g) && !inSea(g));
  assert.ok(kept.length > 1500, 'a hill that keeps most of its groves: ' + kept.length + ' of ' + before.length);     // (2159 of 3107 on the page's seed)
  assert.deepEqual(after, kept);
  assert.deepEqual(after.filter((g) => g.z <= Z0), before.filter((g) => g.z <= Z0), 'the hill north of the coast is untouched, a dip of it below the sea\'s level included');
  // and it is the whole hill that is kept, not one corner of it: the north, the west flank and the east flank (beside the bay) each carry their groves
  assert.ok(after.filter((g) => g.z < -110).length > 700, 'groves on the north slopes: ' + after.filter((g) => g.z < -110).length);
  assert.ok(after.filter((g) => g.x < -112 && g.z > -110).length > 300, 'groves on the west flank');
  assert.ok(after.filter((g) => g.x > 112 && g.z > -110).length > 300, 'groves on the east flank');
  assert.ok(after.filter((g) => g.z > Z0 && Math.abs(g.x) >= BAY_X + 8).length > 300, 'land beside the bay keeps its groves (the guard is the bay and the sea, not the whole south)');
});
