// ENVIRONMENT (A5) props: flora, utility poles + cables, lamps, street furniture, vehicles, signage, plaza dressing, the vista
// beyond the plot, outdoor discoveries. Runs after the buildings exist (stage 'props'), before the batcher flush.
// Groups: props.<kind>.<i>.<j> (50 m chunks) or props.<kind>. Every module is isolated: one failing step is logged, the rest still run.
import { buildOccupancy } from './occupancy.js';
import { makeKit, claimSpawnView } from './kit.js';
import { makeFoliageAtlas, makeFenceTexture } from './sprites.js';
import { buildFlora } from './flora.js';
import { buildPoles } from './poles.js';
import { buildVehicles } from './vehicles.js';
import { buildDress, buildPlanters } from './dress.js';
import { buildDiscoveries } from './discover.js';
import { buildBoundary } from './periphery.js';
import { buildVista } from './vista.js';
import { buildVistaKit } from './vista-kit.js';
import { buildOutskirts } from './outskirts.js';
import { buildRimWalk } from './rimwalk.js';
import { buildPockets } from './pockets.js';
import { makeSignAtlas, buildSigns, planMurals, claimMurals } from './signs.js';
import { buildHill } from './hill.js';
import { buildLife } from './life.js';
import { fitNav } from './navfit.js';
import { initVegetation, dressVegetation } from './vegetation.js';
import { buildClutterDress } from './clutter-dress.js';
import { buildBackYards } from './backyards.js';

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
    K.murals = planMurals(K);                         // the wall of each painting (buildSigns hangs them; the atlas crops each picture to its wall's shape)
    K.signs = makeSignAtlas(plan, K.murals);          // gate boards, plaques, hand signs, chalk + the three murals (browser only; null under Node: flat boards)
    if (K.signs) {
      for (const [key, tex] of [['world_sign', K.signs.texture], ['world_mural', K.signs.mural.texture]]) { const m = ctx.mat(key); m.map = tex; m.needsUpdate = true; }
      ctx.world.signAtlas = true;
    }
    if (makeSignAtlas.errors?.length) ctx.errors?.push({ stage: 'props', item: 'signs.paint', message: makeSignAtlas.errors.join(' | ') });
  });
  await step('murals', () => claimMurals(K));        // the ground in front of the three murals, before anything is parked, planted or stood on it
  await step('arrival', () => { ctx.world.arrivalClaims = claimSpawnView(K); });   // the fan ahead of the spawn: no vehicle, bin or planter stands in the first frame
  await step('vegetation-assets', () => initVegetation(K));   // the instanced Blender plant library (a missing or incomplete species falls back to the procedural builders)
  await step('boundary', () => buildBoundary(K));    // the rim: walls, the welcome arch, the road that leaves the plot
  await step('vistakit', () => buildVistaKit(ctx));  // the modelled hillside kit (Codex GLBs, instanced, LOD): terraces on the far land. First, so the far houses below leave its ground alone; an absent or failed kit changes nothing
  await step('vista', () => buildVista(K));          // the city beyond the rim: far houses, a church, towers, the TV mast, and their lit windows (ctx.glow)
  await step('outskirts', () => buildOutskirts(K));  // the streets, alleys, trees and landmarks the kit's terraces and the far rows stand among, and the belt of tall trees beyond the plot's wall (R1-D20, D21)
  await step('poles', () => buildPoles(K));          // before the flora: poles and lamps claim their ground first
  await step('vehicles', () => buildVehicles(K));
  await step('dress', () => buildDress(K));          // before the flora too: benches, the shrine and the shelter keep their ground
  await step('signs', () => buildSigns(K));          // murals, arch boards, street plaques, hopscotch: they claim their spots before the trees do
  await step('hill', () => buildHill(K));            // the huerta, the roadside cross, boulders, a yard clothes line
  await step('rimwalk', () => buildRimWalk(K));      // the footpath along the foot of the wall, its treads, weeds and vines, the rebar and chain-link on the crest (R1-D21): it takes its ground before the flora does
  await step('flora', () => buildFlora(K));
  await step('pockets', () => buildPockets(K));      // the wedges of bare slope between houses at the street edge: flowers, grass, bushes, agaves, boulders and a small tree (R1-D23)
  await step('planters', () => buildPlanters(K));    // after the flora: stone rings round the plaza trees, flower boxes
  await step('vegetation-dressing', () => { dressVegetation(K); K.vegetation?.finalize(); });
  await step('life', () => buildLife(K));            // pigeons, dogs, hens, crows, the swing (hangs from a plaza tree), kite, ball, welding sparks
  await step('clutter', () => buildClutterDress(K));  // after the old features claim their spots; leave every door and nav route clear
  await step('yards', () => { if (ctx.opts?.yards !== false && !ctx.opts?.skip?.has('yards')) return buildBackYards(K); });   // the ground behind the upper rows (R1-102): a worn path, a tank, the washing, tyres with flowers; last, so it only fills what is left
  await step('navfit', () => { ctx.world.navFit = fitNav(ctx); });   // every collider exists now: drop the nav edges a prop blocks (people read plan.nav after this)
  await step('discoveries', () => buildDiscoveries(K));

  ctx.world.propTimes = times;
  ctx.timings && (ctx.timings.propParts = times);
}
