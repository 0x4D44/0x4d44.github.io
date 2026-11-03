// The beach's fixtures as the world builds them (A5, js/world/beach.js + beachfixtures.js, dev/FEATURE-BEACH.md phase 2a): every collider the plan (beachfront.js) lays out is in the physics from the
// first frame, the promenade's lamp posts are lit, the huts, palapas and sign posts are batched meshes, and a headless build that did not ask for the coast gets none of it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachfixtures.test.mjs
// Every check has a deliberately broken input selected by BX_SABOTAGE=<id>|all, and each must then FAIL:
//   always   a plot-only build gets the fixtures         nowall  the kit makes no rectangle colliders        nolight  the lamps have no light         nolamp  the lamp posts have no collider
//   lane     a fence stands across the promenade        foot    a post stands at the foot of a stair       nogroup  the huts and palapas are not built         bare  a plan without huts
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildOccupancy } from '../js/world/occupancy.js';
import { makeKit } from '../js/world/kit.js';
import { walkable } from '../js/world/nav.js';
import { buildBeach } from '../js/world/beach.js';
import { planFront } from '../js/world/beachfront.js';
import { DECK_Z, STAIR_FLIGHT } from '../js/world/coast.js';

const SAB = process.env.BX_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;

/** A beach built the page's way (K = the props kit), on its own: `coast` is what a sweep asks for; `hook(K, ctx)` is where a sabotage breaks the kit before the beach is built. */
async function beach(coast, hook = () => {}) {
  const ctx = createContext({ seed: SEED, headless: true, coast });
  ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
  const K = makeKit(ctx, ctx.plan, buildOccupancy(ctx.plan, ctx.buildings));
  hook(K, ctx);
  await buildBeach(K);
  return { ctx, K, plan: ctx.plan, front: ctx.world.beachFront };
}
const props = (ctx) => ctx.physics.walls.filter((w) => w.id === 'prop');
const at = (plan, x, z) => ({ x, z, y: plan.heightAt(x, z) });

const sabotage = (K, ctx) => {
  if (on('nowall')) { const r = K.rect; K.rect = (x, z, w, d, ry, h) => (w >= 1 ? undefined : r.call(K, x, z, w, d, ry, h)); }
  if (on('nolight')) ctx.lights.add = () => {};
  if (on('nolamp')) { const p = K.post; K.post = (x, z, r, h) => (r === 0.11 && h === 3 ? undefined : p.call(K, x, z, r, h)); }
  if (on('lane')) K.seg(-35, 101.6, -35, 106, 1.2);                                    // (a wall across the lane: the deck is not walkable end to end)
  if (on('foot')) K.seg(-58, STAIR_FLIGHT[1] + 0.9, -54, STAIR_FLIGHT[1] + 0.9, 1.5);   // (a wall across the foot of the stair at x -56)
  if (on('nogroup')) { const one = K.one; K.one = (kind, o) => (kind === 'beach' ? { box() {}, cyl() {}, quad() {}, tri() {}, tris: 0 } : one.call(K, kind, o)); }
};

test('a plot-only headless build (no coast asked for) gets no fixture, no collider and no lamp: the plot\'s own sweeps stay the plot\'s', async () => {
  const { ctx } = await beach(on('always'), () => {});
  assert.equal(ctx.world.beach.live, on('always'));
  assert.equal(ctx.world.beach.fixtures, null, 'no fixtures');
  assert.equal(props(ctx).length, 0, 'no prop collider');
  assert.equal(ctx.lights.list.filter((l) => l.z > 100).length, 0, 'no lamp');
  assert.ok(ctx.world.beachFront.items.length > 300, 'the plan itself exists (a Node test and the page read it)');
});

test('asked for the coast: every collider of the plan stands (one per solid, and a post for every lamp), and every lamp is lit', async () => {
  const { ctx, front } = await beach(true, sabotage);
  assert.equal(ctx.world.beach.live, true);
  const f = ctx.world.beach.fixtures;
  assert.equal(f.colliders, front.solids.length, 'the beach said it made a collider for every solid');
  const walls = (s) => (s.kind === 'rect' && Math.min(s.w, s.d) >= 2 ? 4 : 1);        // (a kiosk and the tower are the outline of four thin walls, so no walker clips their corners; everything smaller is one thick wall)
  assert.equal(props(ctx).length, front.solids.reduce((n, s) => n + walls(s), 0) + front.lamps.length, 'the physics holds the walls of every solid and one post per lamp');
  assert.equal(f.lamps, front.lamps.length);
  const lit = ctx.lights.list.filter((l) => l.kind === 'street' && l.z > 100);
  assert.equal(lit.length, front.lamps.length, 'a real light on every promenade lamp');
  assert.ok(lit.every((l) => l.y > 3 && l.y < 5 && Math.abs(l.z - 106.4) < 0.01), 'each at the top of a 4 m post on the lamp line');
  const posts = props(ctx).filter((w) => w.x1 === w.x2 && w.z1 === w.z2 && Math.abs(w.z1 - 106.4) < 0.01);
  assert.equal(posts.length, front.lamps.length, 'a post collider at every lamp');
});

test('the huts, the palapas, the sign posts and the lamps are one batched group of meshes, of a reasonable size', async () => {
  const { ctx, front } = await beach(true, sabotage);
  const g = ctx.batch.groups.get('props.beach');
  assert.ok(g, 'a group for the beach\'s fixtures');
  const tris = ctx.world.beach.fixtures.triangles;
  assert.ok(tris > front.huts.length * 40 + front.palapas.length * 150, `at least what the huts and palapas need: ${tris} triangles`);
  assert.ok(tris < 12000, `and a budget: ${tris} triangles`);
  assert.equal(ctx.world.beach.fixtures.huts, front.huts.length); assert.equal(ctx.world.beach.fixtures.palapas, front.palapas.length); assert.equal(ctx.world.beach.fixtures.posts, front.posts.length);
});

test('walk: the kernel stops a walker at a kiosk, a hut, the lifeguard tower, the net and a palapa\'s post; and takes one the whole length of the deck and down every access to the sand', async () => {
  const { ctx, plan, front } = await beach(true, sabotage);
  const P = ctx.physics, k = front.items.find((i) => i.group === 'kiosk'), hut = front.huts[1], tower = front.items.find((i) => i.group === 'lifeguard_tower'), court = front.items.find((i) => i.group === 'court'), pal = front.palapas[0];
  const blocked = (a, b, what) => assert.ok(!walkable(P, a, b), `a walker went through ${what}`);
  blocked(at(plan, k.x - 4, 111), at(plan, k.x + 4, 111), 'a kiosk');
  blocked(at(plan, hut.x - 3, hut.z), at(plan, hut.x + 3, hut.z), 'a changing hut');
  blocked(at(plan, tower.x - 3, tower.z), at(plan, tower.x + 3, tower.z), 'the lifeguard tower');
  blocked(at(plan, court.x - 3, court.z), at(plan, court.x + 3, court.z), 'the volleyball net');
  blocked(at(plan, pal.x - 3.4, pal.z - 2.4), at(plan, pal.x + 3.4, pal.z - 2.4), 'a palapa\'s posts');
  assert.ok(walkable(P, at(plan, -95, 104), at(plan, 95, 104)), 'the deck\'s lane is clear from end to end');
  for (const a of plan.coast.accesses) {
    const wl = plan.coast.shoreZ(a.x);
    for (const [z0, z1] of [[DECK_Z - 5, 114], [114, 130], [130, wl + 0.3]]) assert.ok(walkable(P, at(plan, a.x, z0), at(plan, a.x, z1)), `${a.id}: the kernel could not walk (${a.x}, ${z0}) -> (${a.x}, ${z1.toFixed(1)})`);
  }
});

test('the plan is the same whether the page or a test builds it: the front a build holds is planFront of the coast', async () => {
  const { plan, front } = await beach(true, sabotage);
  const again = planFront(plan.coast);
  assert.deepEqual(front.solids, again.solids); assert.deepEqual(front.lamps, again.lamps); assert.deepEqual(front.huts, again.huts);
  if (on('bare')) front.huts.length = 0;
  assert.equal(front.huts.length, 8);
});
