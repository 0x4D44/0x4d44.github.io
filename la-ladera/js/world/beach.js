// THE BEACH (A5): what the south edge of the plot is made of once the coast exists (dev/FEATURE-BEACH.md). One entry point for the page and the headless build:
//   buildBeach(K)   the ground (coastmesh.js: promenade deck, sand, seabed, sea wall, rail, stairs, ramp), the rail's colliders, the gate opened, and the sea (engine/water.js)
// The pure data is coast.js (plan.coast); the far land around the bay is periphery.js, the far village and the lighthouse vista.js. Under Node (`headless`) the gate stays shut and the rail
// is not added unless the build asks for the coast (`opts.coast`, tests/headless.mjs buildData({ coast: true })): the plot's own sweeps are the plot's, as they always were.
//
// The ground is part of the playable world (a few tens of milliseconds, and the player may turn round at once). The SEA is the second sector of dev/FEATURE-BEACH.md ("loads after the playable
// milestone, so it does not add to boot"): with `?lazy=1` it is one unit of the staged queue (core/staged.js), registered once `__ladera.ready` has resolved (the seam dev/FEATURE-LAZY.md
// section 4 gives a later sector: nothing in main.js changes), built hidden, its three programs compiled off the frame (LateWarm, as the crowd's are), and shown once they are; eager, it is built
// here, in front of the boot's own warm-up. `?skip=coast` leaves the beach as it was (a shut gate, no sea).
import { buildCoastMesh } from './coastmesh.js';
import { coastColliders, setGate } from './coast.js';

/** The water (engine/water.js, A1's module over core/sea.js), imported only when a renderer wants it: a headless build never loads the shader. */
async function raiseSea(ctx) {
  const { buildWater } = await import('../engine/water.js');
  const water = buildWater(ctx);
  (ctx.world ??= {}).sea = water;
  return water;
}

/** The staged unit: the sea comes up hidden, its three programs are built off the frame (LateWarm), and it is shown once they are. */
async function lateSea(ctx) {
  const water = await raiseSea(ctx), lw = ctx.lateWarm;
  if (lw) { water.group.visible = false; try { await lw.warm(water.group); } finally { water.group.visible = true; } }
  await water.ready;
}

/** Joins the staged queue once the milestone has passed (`__ladera.ready`: the boot returns after it has begun the queue). Without a queue the sea is simply built, as an eager boot does. */
function joinQueue(ctx) {
  const unit = { id: 'sea', label: 'El mar', weight: 2, start: () => lateSea(ctx) };
  const join = () => {
    if (ctx.staged) { ctx.staged.register(unit); return; }
    lateSea(ctx).catch((e) => (ctx.errors ??= []).push({ stage: 'stream:sea', message: String(e?.message ?? e), stack: e?.stack }));
  };
  const ready = globalThis.__ladera?.ready;
  if (typeof ready?.then === 'function') ready.then(join, () => {}); else join();
}

export async function buildBeach(K) {
  const { ctx } = K, plan = ctx.plan, opts = ctx.opts ?? {};
  const shut = opts.skip?.has?.('coast') === true, live = !shut && (!opts.headless || opts.coast === true);
  const stats = buildCoastMesh(ctx);
  if (live) { coastColliders(ctx.physics, plan.coast); setGate(ctx.physics, true); }       // the deck's rail stands and the plot's south edge is open (the gate is the shut wall of terrain.js buildPerimeter)
  const sea = live && ctx.renderer ? (opts.lazy ? 'staged' : 'inline') : 'none';
  (ctx.world ??= {}).beach = { ...stats, live, sea };
  if (sea === 'inline') await raiseSea(ctx);
  else if (sea === 'staged') joinQueue(ctx);
  return ctx.world.beach;
}
