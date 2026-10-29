// ENVIRONMENT (A5) props: flora, utility poles + cables, lamps, street furniture, vehicles, signage, plaza dressing, the vista
// beyond the plot, outdoor discoveries. Runs after the buildings exist (stage 'props'), before the batcher flush.
// Groups: props.<kind>.<i>.<j> (50 m chunks) or props.<kind>. Every module is isolated: one failing step is logged, the rest still run.
import { buildOccupancy } from './occupancy.js';
import { makeKit } from './kit.js';
import { makeFoliageAtlas, makeFenceTexture } from './sprites.js';
import { buildFlora } from './flora.js';
import { buildPoles } from './poles.js';
import { buildVehicles } from './vehicles.js';
import { buildDress, buildPlanters } from './dress.js';

export async function buildProps(ctx) {
  const plan = ctx.plan;
  if (!plan) return;
  const yieldNow = typeof requestAnimationFrame === 'function' && ctx.yield ? () => ctx.yield() : async () => {};
  const times = {};
  ctx.world = ctx.world ?? {};
  const t0 = performance.now();
  const occ = buildOccupancy(plan);
  ctx.world.occ = occ;
  times.occupancy = Math.round(performance.now() - t0);
  const K = makeKit(ctx, plan, occ);
  const step = async (name, fn) => {
    const t = performance.now();
    try { await fn(); } catch (e) {
      console.error(`[props.${name}]`, e);
      ctx.errors?.push({ stage: 'props', item: name, message: String(e?.message ?? e), stack: e?.stack });
    }
    times[name] = Math.round(performance.now() - t);
    await yieldNow();
  };

  await step('atlas', () => {
    K.atlas = makeFoliageAtlas(ctx.THREE, ctx.rng.fork('world:sprites'));
    if (K.atlas) { const m = ctx.mat('foliage'); m.map = K.atlas.texture; m.needsUpdate = true; ctx.world.atlas = K.atlas; }
    const ft = makeFenceTexture(ctx.THREE);
    if (ft) { const m = ctx.mat('fence_mesh'); m.map = ft; m.transparent = true; m.alphaTest = 0.12; m.needsUpdate = true; }
  });
  await step('poles', () => buildPoles(K));          // before the flora: poles and lamps claim their ground first
  await step('vehicles', () => buildVehicles(K));
  await step('dress', () => buildDress(K));          // before the flora too: benches, the shrine and the shelter keep their ground
  await step('flora', () => buildFlora(K));
  await step('planters', () => buildPlanters(K));    // after the flora: stone rings round the plaza trees, flower boxes

  ctx.world.propTimes = times;
  ctx.timings && (ctx.timings.propParts = times);
}
