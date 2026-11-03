// THE BEACH (A5): what the south edge of the plot is made of once the coast exists (dev/FEATURE-BEACH.md). One entry point for the page and the headless build:
//   buildBeach(K)   the ground (coastmesh.js: promenade deck, sand, seabed, sea wall, rail, stairs, ramp), the rail's colliders, the gate opened, the promenade's fixtures and their colliders
//                   (beachfront.js plans them, beachfixtures.js makes them), the sea's set pieces' colliders (beachsea.js: the pier, its piles and rails, the raft, the moored and the beached boats),
//                   and the sea (engine/water.js), the library's props (beachprops.js) and the watersports library's pieces (waterprops.js)
// The pure data is coast.js (plan.coast), beachfront.js and beachsea.js (what stands where); the far land around the bay is periphery.js, the far village and the lighthouse vista.js. Under Node
// (`headless`) the gate stays shut and neither the rail nor a fixture is added unless the build asks for the coast (`opts.coast`, tests/headless.mjs buildData({ coast: true })): the plot's own sweeps are
// the plot's, as they always were.
//
// The ground, the fixtures and every collider are part of the playable world (a few tens of milliseconds, and the player may turn round at once). The SEA, the library's PROPS and the watersports
// library's pieces are the later sectors of dev/FEATURE-BEACH.md ("loads after the playable milestone, so it does not add to boot"): with `?lazy=1` each is one unit of the staged queue
// (core/staged.js), registered once `__ladera.ready` has resolved (the seam dev/FEATURE-LAZY.md section 4 gives a later sector: nothing in main.js changes), built hidden, its programs compiled
// off the frame (LateWarm, as the crowd's are), and shown once they are; eager, they are built here, in front of the boot's own warm-up. The pier's colliders do not wait for its drawing: a player who
// turns round at once walks a pier that is not drawn yet, and it is the pier. `?skip=coast` leaves the beach as it was (a shut gate, no sea, no fixtures, no pier).
import { buildCoastMesh } from './coastmesh.js';
import { coastColliders, setGate } from './coast.js';
import { planFront } from './beachfront.js';
import { addColliders, buildFixtures } from './beachfixtures.js';
import { loadBeachProps } from './beachprops.js';
import { planSea, seaColliders } from './beachsea.js';
import { loadWaterProps } from './waterprops.js';

/** The water (engine/water.js, A1's module over core/sea.js), imported only when a renderer wants it: a headless build never loads the shader. */
async function raiseSea(ctx) {
  const { buildWater } = await import('../engine/water.js');
  const water = buildWater(ctx);
  (ctx.world ??= {}).sea = water;
  return water;
}

/** The sea's unit: it comes up hidden, its three programs are built off the frame (LateWarm), and it is shown once they are. */
async function lateSea(ctx) {
  const water = await raiseSea(ctx), lw = ctx.lateWarm;
  if (lw) { water.group.visible = false; try { await lw.warm(water.group); } finally { water.group.visible = true; } }
  await water.ready;
}

/** The props' unit: the library comes down, the plan's props are placed hidden, their two programs (the atlas, and its cut-out twin) are built off the frame, and they are shown once they are. */
async function lateProps(ctx) {
  const lw = ctx.lateWarm, clutter = await loadBeachProps(ctx, ctx.world.beachFront, { hidden: !!lw });
  if (clutter && lw) { try { await lw.warm(clutter.group); } finally { clutter.group.visible = true; } }
}

/**
 * The sea's set pieces' unit (the pier's kit and lamps, the boats, the buoys, the raft, the mooring lines): the two library files come down, the plan's pieces are placed hidden in three groups, their
 * programs are built off the frame (LateWarm) and the groups are shown once they are. The lamps' lights and halos are added by the loader. The sea has risen first (`needs`), so the first pose of a
 * floater is read from the real surface.
 */
async function lateWaterProps(ctx) {
  const lw = ctx.lateWarm, w = await loadWaterProps(ctx, ctx.world.beachSea, { hidden: !!lw });
  if (w && lw) { try { await Promise.all(w.groups.map((g) => lw.warm(g))); } finally { for (const g of w.groups) g.visible = true; } }
}

/** `needs`: the props' files wait for the furniture, the clothes and the shop goods (the packs the interiors are waiting for); a name that is not in the queue (`?skip=furnish`) is met at once. */
const UNITS = [
  { id: 'sea', label: 'El mar', weight: 2, run: lateSea },
  { id: 'beachprops', label: 'La playa', weight: 3, needs: ['interior-packs'], run: lateProps },
  { id: 'waterprops', label: 'El muelle', weight: 2, needs: ['sea'], run: lateWaterProps },
];

/** Joins the staged queue once the milestone has passed (`__ladera.ready`: the boot returns after it has begun the queue). Without a queue each unit is simply run, as an eager boot builds it. */
function joinQueue(ctx, ids) {
  const join = () => {
    for (const u of UNITS.filter((x) => ids.includes(x.id))) {
      if (ctx.staged) ctx.staged.register({ id: u.id, label: u.label, weight: u.weight, needs: u.needs ?? [], start: () => u.run(ctx) });
      else u.run(ctx).catch((e) => (ctx.errors ??= []).push({ stage: 'stream:' + u.id, message: String(e?.message ?? e), stack: e?.stack }));
    }
  };
  const ready = globalThis.__ladera?.ready;
  if (typeof ready?.then === 'function') ready.then(join, () => {}); else join();
}

export async function buildBeach(K) {
  const { ctx } = K, plan = ctx.plan, opts = ctx.opts ?? {};
  const shut = opts.skip?.has?.('coast') === true, live = !shut && (!opts.headless || opts.coast === true);
  const stats = buildCoastMesh(ctx);
  const front = planFront(plan.coast), sea = live ? planSea(plan.coast) : null;
  let fixtures = null, pier = null;
  if (live) {                                                                                                    // the deck's rail stands, the plot's south edge is open (the gate is the shut wall of terrain.js buildPerimeter), and every fixture is solid from the first frame
    coastColliders(ctx.physics, plan.coast); setGate(ctx.physics, true); fixtures = { colliders: addColliders(K, front), ...buildFixtures(K, front) };
    pier = { colliders: seaColliders(ctx.physics, sea), ...sea.stats };                                          // the pier, its piles and rails, the raft's deck and skirt, the boats' hulls: solid whether or not they are drawn yet
  }
  const draws = live && ctx.renderer, mode = draws ? (opts.lazy ? 'staged' : 'inline') : 'none';
  (ctx.world ??= {}).beach = { ...stats, live, sea: mode, props: mode, waterprops: mode, front: front.stats, fixtures, pier };
  ctx.world.beachFront = front; ctx.world.beachSea = sea;
  if (mode === 'inline') { await raiseSea(ctx); await loadBeachProps(ctx, front); await loadWaterProps(ctx, sea); }
  else if (mode === 'staged') joinQueue(ctx, UNITS.map((u) => u.id));
  return ctx.world.beach;
}
