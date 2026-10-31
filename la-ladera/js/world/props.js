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
import { buildDiscoveries } from './discover.js';
import { buildBoundary } from './periphery.js';
import { makeSignAtlas, buildSigns } from './signs.js';
import { buildHill } from './hill.js';
import { buildLife } from './life.js';
import { fitNav } from './navfit.js';
import { buildClutterDress } from './clutter-dress.js';

export async function buildProps(ctx) {
  const plan = ctx.plan;
  if (!plan) return;
  const yieldNow = typeof requestAnimationFrame === 'function' && ctx.yield ? () => ctx.yield() : async () => {};
  const times = {};
  ctx.world = ctx.world ?? {};
  const t0 = performance.now();
  const occ = buildOccupancy(plan, ctx.buildings);
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
    if (K.atlas) { for (const k of ['foliage', 'foliage_low']) { const m = ctx.mat(k); m.map = K.atlas.texture; m.needsUpdate = true; } ctx.world.atlas = K.atlas; }
    // low plants: light every card with an upward normal (three flips the normal of a back face, which turned tufts black under the moon)
    const low = ctx.mat('foliage_low');
    low.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );'); };
    low.customProgramCacheKey = () => 'foliage_low_up';
    low.needsUpdate = true;
    const ft = makeFenceTexture(ctx.THREE);
    if (ft) { const m = ctx.mat('fence_mesh'); m.map = ft; m.transparent = true; m.alphaTest = 0.12; m.needsUpdate = true; }
    K.signs = makeSignAtlas(plan);                    // murals, gate boards, plaques, hand signs, chalk (browser only; null under Node: flat boards)
    if (K.signs) { const m = ctx.mat('world_sign'); m.map = K.signs.texture; m.needsUpdate = true; ctx.world.signAtlas = true; }
    if (makeSignAtlas.errors?.length) ctx.errors?.push({ stage: 'props', item: 'signs.paint', message: makeSignAtlas.errors.join(' | ') });
  });
  await step('boundary', () => buildBoundary(K));    // the rim: walls, the welcome arch, the road that leaves the plot
  await step('poles', () => buildPoles(K));          // before the flora: poles and lamps claim their ground first
  await step('vehicles', () => buildVehicles(K));
  await step('dress', () => buildDress(K));          // before the flora too: benches, the shrine and the shelter keep their ground
  await step('signs', () => buildSigns(K));          // murals, arch boards, street plaques, hopscotch: they claim their spots before the trees do
  await step('hill', () => buildHill(K));            // the huerta, the roadside cross, boulders, a yard clothes line
  await step('flora', () => buildFlora(K));
  await step('planters', () => buildPlanters(K));    // after the flora: stone rings round the plaza trees, flower boxes
  await step('life', () => buildLife(K));            // pigeons, dogs, hens, crows, the swing (hangs from a plaza tree), kite, ball, welding sparks
  await step('clutter', () => buildClutterDress(K));  // after the old features claim their spots; leave every door and nav route clear
  await step('navfit', () => { ctx.world.navFit = fitNav(ctx); });   // every collider exists now: drop the nav edges a prop blocks (people read plan.nav after this)
  await step('discoveries', () => buildDiscoveries(K));

  ctx.world.propTimes = times;
  ctx.timings && (ctx.timings.propParts = times);
}
