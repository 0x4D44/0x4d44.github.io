// Data-layer smoke test: the plan, building plans and furnishing run in Node and the colliders form a walkable world.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/smoke.data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from './headless.mjs';

test('data layers build under Node', async () => {
  const { ctx, plan, buildings } = await buildData();
  assert.ok(plan.lots.length > 0, 'plan has lots');
  assert.equal(buildings.length, plan.lots.length);
  assert.ok(ctx.physics.stats().walls > 0);
  const s = plan.spawn;
  assert.ok(Number.isFinite(ctx.physics.groundAt(s.x, s.z, 1e3)), 'spawn has ground');
  assert.ok(ctx.mat('plaster_a'), 'materials construct without a browser');
});
