// The dune grass (A5, js/world/dunegrass.js, dev/FEATURE-BEACH.md 1.4, round 7 phase 2c): the tufts that grow in front of the sea wall's stones at the two ends of the beach. Pure planning (the coast plan and the front in,
// plain records out) and the planting (flora.js `tuft` into a builder of a kit stub), so this runs in Node with no renderer.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-dunegrass.test.mjs
// Every check has a deliberately broken input selected by DUNE_SABOTAGE=<id>|all, and each must then FAIL:
//   stair   a tuft on the stair at x 70            kiosk    a tuft inside a kiosk                 middle   a tuft in the middle of the beach        sea      a tuft at the waterline
//   east    the east end has none                  random   a layout that is not a function of the seed   lost  the first tuft is never planted        deadlive  a world with no beach is planted
//   sand    a tuft stands on a lounger's spot      huge     a tuft three times the size of the plot's own
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { generatePlan } from '../js/world/plan.js';
import { SEA, XW, WALL_Z } from '../js/world/coast.js';
import { planFront, onAccess } from '../js/world/beachfront.js';
import { planDunes, buildDunes, DUNES } from '../js/world/dunegrass.js';
import { shapeOf, overlaps } from './geom2d.mjs';

const SAB = process.env.DUNE_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;

const ctx0 = createContext({ seed: SEED, headless: true });
const plan = generatePlan(ctx0), coast = plan.coast, front = planFront(coast);
let tick = 0;

/** The plan the checks look at: the real one, or a broken copy when DUNE_SABOTAGE asks. */
function dunes() {
  const d = planDunes(coast, front, on('random') ? { seed: 1 + (tick++) } : {});
  let t = d.tufts.map((q) => ({ ...q }));
  if (on('stair')) t.push({ x: 70, z: 110.4, big: 1 });                                                       // (the stair's landing: its foot is at z 109.4, and a walker comes on south from it)
  if (on('kiosk')) { const k = front.items.find((i) => i.group === 'kiosk'); t.push({ x: k.x, z: k.z, big: 1 }); }
  if (on('middle')) t.push({ x: 0, z: 111, big: 1 });
  if (on('sea')) t.push({ x: 80, z: coast.shoreZ(80) - 0.5, big: 1 });
  if (on('east')) t = t.filter((q) => q.x < 0);
  if (on('sand')) { const l = front.items.find((i) => i.group === 'lounger' && Math.abs(i.x) > 62); t.push({ x: l.x, z: l.z, big: 1 }); }
  if (on('huge')) t[0].big = 3;
  return t;
}
const TUFTS = dunes();

test('the dune grass is a function of the coast and the front: the same twice, another with another seed', () => {
  const a = dunes(), b = dunes();
  assert.deepEqual(a, b, 'twice the same');
  const c = planDunes(coast, front, { seed: SEED + 1 }).tufts;
  assert.notDeepEqual(c.map((t) => [t.x, t.z]), a.map((t) => [t.x, t.z]), 'another seed, another fringe');
});

test('a fringe at both ends: tens of tufts on each side, none within 60 m of the middle, all in front of the wall\'s stones and inside the end walls, of the plot\'s own sizes', () => {
  const west = TUFTS.filter((t) => t.x < 0), east = TUFTS.filter((t) => t.x > 0);
  assert.ok(TUFTS.length >= 60 && TUFTS.length <= 200, `${TUFTS.length} tufts`);
  assert.ok(west.length >= 25 && east.length >= 25, `${west.length} in the west, ${east.length} in the east`);
  for (const t of TUFTS) {
    assert.ok(Math.abs(t.x) >= 60 && Math.abs(t.x) <= XW - 0.5, `(${t.x}, ${t.z}) is at an end of the beach, inside the wall`);
    assert.ok(t.z >= DUNES.zMin && t.z <= 132, `(${t.x}, ${t.z}) is in front of the sea wall's stones (${WALL_Z}), not out on the open sand`);
    assert.ok(t.big >= 0.7 && t.big <= 1.2, `(${t.x}, ${t.z}) is ${t.big} times the plot's own grass`);
  }
  assert.equal(new Set(TUFTS.map((t) => t.x + ',' + t.z)).size, TUFTS.length, 'no two on the same spot');
});

test('each stands on dry sand and keeps clear of everything: the stairs and the ramp, every collider, the palapas, the library\'s props', () => {
  for (const t of TUFTS) {
    const at = `(${t.x}, ${t.z})`, ground = coast.heightAt(t.x, t.z);
    assert.ok(t.z < coast.shoreZ(t.x) - 10 && ground > SEA + 0.4, `${at}: dry sand, well up from the water (ground ${ground.toFixed(2)})`);
    assert.ok(!onAccess(coast, t.x, t.z, 1), `${at}: stands in a stair or the ramp`);
    const hit = front.solids.find((s) => overlaps({ c: [t.x, t.z], r: 0.45 }, shapeOf(s)));
    assert.ok(!hit, `${at}: stands inside ${hit?.id}`);
    for (const p of front.palapas) assert.ok(!(Math.abs(t.x - p.x) <= p.w / 2 && Math.abs(t.z - p.z) <= p.d / 2), `${at}: under ${p.id}'s roof`);
    const prop = front.items.find((i) => !/^(riprap|seaweed|shell|driftwood)$/.test(i.group) && Math.hypot(i.x - t.x, i.z - t.z) < 0.6);
    assert.ok(!prop, `${at}: on ${prop?.id}`);
  }
});

/** A kit stub: what flora.js `tuft` needs (K.b, K.H, K.atlas) over real MeshBuilders, one per (kind, end), and the context the step reads. */
function kit(world) {
  const builders = new Map(), ctx = createContext({ seed: SEED, headless: true });
  ctx.plan = plan; ctx.world = world;
  let first = true;
  const K = {
    ctx, plan, H: coast.heightAt, atlas: null, rng: (label) => ctx.rng.fork('props:' + label),
    b(kind, x) {
      if (on('lost') && first) { first = false; return new MeshBuilder(); }                                      // (the first tuft goes into a builder nobody reads)
      first = false;
      const id = kind + (x < 0 ? '.west' : '.east');
      if (!builders.has(id)) builders.set(id, new MeshBuilder());
      return builders.get(id);
    },
  };
  return { K, builders };
}

test('buildDunes plants exactly the plan: four triangles a tuft, each one on its spot at the height of the ground, in the plot\'s own `tufts` batch', () => {
  const { K, builders } = kit({ beach: { live: true }, beachFront: front });
  const got = buildDunes(K), want = planDunes(coast, front).tufts;
  assert.deepEqual(got.tufts, want, 'the plan the page plants is the plan the test reads');
  assert.deepEqual([...builders.keys()].sort(), ['tufts.east', 'tufts.west'], 'the plot\'s `tufts` batch, one per end');
  const tris = [...builders.values()].reduce((n, b) => n + b.tris, 0);
  assert.equal(tris, 4 * want.length, 'two crossed cards of two triangles a tuft');
  assert.deepEqual(K.ctx.world.dunes, got.stats, 'and the world carries its numbers');
  // every tuft's eight corners are centred on its spot, and stand in the ground (a card's foot is 4 cm under it)
  const pos = (id) => builders.get(id).accs.get('foliage_low').pos, seen = { west: 0, east: 0 };
  for (const t of want) {
    const side = t.x < 0 ? 'west' : 'east', p = pos('tufts.' + side), o = seen[side]++ * 24;
    let sx = 0, sz = 0, low = Infinity;
    for (let k = 0; k < 8; k++) { sx += p[o + 3 * k] / 8; sz += p[o + 3 * k + 2] / 8; low = Math.min(low, p[o + 3 * k + 1]); }
    assert.ok(Math.abs(sx - t.x) < 1e-3 && Math.abs(sz - t.z) < 1e-3, `a tuft at (${t.x}, ${t.z}) is planted at (${sx.toFixed(3)}, ${sz.toFixed(3)})`);
    assert.ok(Math.abs(low - (coast.heightAt(t.x, t.z) - 0.04)) < 1e-3, `(${t.x}, ${t.z}): its foot is 4 cm under the sand`);
  }
});

test('buildDunes: a world without a live beach (or without its front) gets none', () => {
  for (const world of [{ beach: { live: on('deadlive') }, beachFront: front }, { beach: { live: true } }, {}]) {
    const { K, builders } = kit(world);
    assert.equal(buildDunes(K), null, 'nothing planned');
    assert.equal(builders.size, 0, 'nothing planted');
    assert.equal(K.ctx.world.dunes, undefined, 'and no numbers kept');
  }
});
