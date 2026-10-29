// Plan invariants (CONTRACT 5.1): pure Node, ~1 s. Every validator is proven to be able to fail (TEETH tests).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOT_KINDS, SHOP_TYPES } from '../js/core/vocab.js';
import { ANCHOR_KINDS } from '../js/core/registries.js';
import { checkPlan } from './plan-oracle.mjs';
import { footprint, polyDistPoint } from '../js/world/geom.js';
import { SEED, makePlan, checkLots, plinthErrors, gradeErrors, navErrors, spawnErrors, placeErrors } from './world-lib.mjs';

const { plan } = makePlan(SEED);
const strip = (p) => JSON.parse(JSON.stringify({ lots: p.lots, streets: p.streets, plazas: p.plazas, nav: p.nav, pois: p.pois, landmarks: p.landmarks, areas: p.areas, spawn: p.spawn, warnings: p.warnings }));

test('the plan is deterministic per seed and differs in the details for another seed', () => {
  const again = makePlan(SEED).plan, other = makePlan(SEED + 1).plan;
  assert.deepEqual(strip(again), strip(plan));
  for (let i = 0; i < 400; i++) { const x = ((i * 37) % 200) - 100, z = ((i * 91) % 200) - 100; assert.equal(again.heightAt(x, z), plan.heightAt(x, z)); }
  assert.deepEqual(other.lots.map((l) => [l.id, l.kind, l.w, l.d, l.shop ?? null]), plan.lots.map((l) => [l.id, l.kind, l.w, l.d, l.shop ?? null]), 'ids, kinds, sizes, shops are fixed per slot');
  assert.notDeepEqual(other.lots.map((l) => l.name), plan.lots.map((l) => l.name), 'names depend on the seed');
});

test('the lead oracle accepts the plan', () => {
  const r = checkPlan(plan, { seed: SEED });
  assert.deepEqual(r.violations, []);
});

test('lot mix: 42-50 lots, every kind, >= 12 shops over >= 10 shop types, unique names', () => {
  assert.ok(plan.lots.length >= 42 && plan.lots.length <= 50, `${plan.lots.length} lots`);
  for (const k of LOT_KINDS) assert.ok(plan.lots.some((l) => l.kind === k), `no ${k}`);
  const shops = plan.lots.filter((l) => l.shop);
  assert.ok(shops.length >= 12, `${shops.length} shops`);
  assert.ok(new Set(shops.map((l) => l.shop)).size >= 10);
  for (const t of SHOP_TYPES) assert.ok(shops.some((l) => l.shop === t), `no ${t} shop`);
  assert.equal(new Set(plan.lots.map((l) => l.name)).size, plan.lots.length, 'lot names are unique');
});

test('lots do not overlap, intrude into streets or plazas, or leave the plot', () => {
  assert.deepEqual(checkLots(plan), []);
  assert.deepEqual(plan.warnings, []);
});

test('TEETH: a lot dragged into the street, onto a neighbour or off the plot is reported', () => {
  const a = makePlan(SEED).plan; a.lots[20].x += 12;               // L20 into the road / neighbours
  assert.ok(checkLots(a).length > 0);
  const b = makePlan(SEED).plan; b.lots[5].x = 130;                // off the plot
  assert.ok(checkLots(b).some((m) => m.includes('out of the plot')));
  const c = makePlan(SEED).plan; c.lots[7].z = c.lots[6].z; c.lots[7].x = c.lots[6].x + 1; // on top of a neighbour
  assert.ok(checkLots(c).some((m) => m.includes('overlaps')));
});

test('plinth rule and entrance ground heights', () => {
  assert.deepEqual(plinthErrors(plan), []);
});

test('TEETH: a lot whose y no longer matches the height field is reported', () => {
  const p = makePlan(SEED).plan; p.lots[10].y += 1.2;
  assert.ok(plinthErrors(p).length > 0);
});

test('gradients: road/street <= 12 %, alley/path <= 22 %, stairs 50-70 % with ~0.17 risers and landings', () => {
  assert.deepEqual(gradeErrors(plan), []);
});

test('TEETH: a step in the height field is reported as a gradient error', () => {
  const p = makePlan(SEED).plan, h = p.heightAt, s1 = p.streets.find((s) => s.id === 'S1'), q = s1._d.pts[40];
  p.heightAt = (x, z) => h(x, z) + (Math.hypot(x - q[0], z - q[1]) < 3 ? 1.5 : 0);
  assert.ok(gradeErrors(p).length > 0);
});

test('nav graph: one component, a door node on every entrance, bounded edge lengths, plaza interiors', () => {
  assert.deepEqual(navErrors(plan), []);
});

test('TEETH: cutting nav edges or moving a door node is reported', () => {
  const p = makePlan(SEED).plan; p.nav.edges = p.nav.edges.slice(0, Math.floor(p.nav.edges.length / 2));
  assert.ok(navErrors(p).some((m) => m.includes('components')));
  const q = makePlan(SEED).plan; q.nav.nodes.find((n) => n.kind === 'door').x += 3;
  assert.ok(navErrors(q).some((m) => m.includes('door node')));
});

test('spawn is walkable, low on the hill, outside every lot and looks up', () => {
  assert.deepEqual(spawnErrors(plan), []);
});

test('TEETH: a spawn inside a lot or looking downhill is reported', () => {
  const p = makePlan(SEED).plan; p.spawn.x = p.lots[2].x; p.spawn.z = p.lots[2].z; p.spawn.yaw = Math.PI;
  assert.ok(spawnErrors(p).length >= 2);
});

test('pois, landmarks, areas and street names have the shape and Spanish names the contract wants', () => {
  assert.deepEqual(placeErrors(plan, ANCHOR_KINDS), []);
});

test('TEETH: a bad poi kind, an unknown building and an English name are reported', () => {
  const p = makePlan(SEED).plan; p.pois[0].kind = 'dance'; p.pois[1].building = 'L99'; p.lots[0].name = 'The Corner Shop'; p.landmarks[0].en = p.landmarks[0].name;
  assert.ok(placeErrors(p, ANCHOR_KINDS).length >= 4);
});

/** Cells steeper than 0.9 (cliffs) that are not within ~1.4 m of a lot, plaza or street: natural terrain must never be a cliff. */
function unexplainedCliffs(p) {
  const out = [], fps = p.lots.map((l) => footprint(l)), near = (x, z) =>
    fps.some((f) => polyDistPoint(f, x, z) < 1.4) || p.plazas.some((q) => polyDistPoint(q.poly, x, z) < 1.4) ||
    p.streets.some((s) => s._d.pts.some((q) => Math.abs(q[0] - x) < s.width / 2 + 1.6 && Math.abs(q[1] - z) < s.width / 2 + 1.6 && Math.hypot(q[0] - x, q[1] - z) < s.width / 2 + 1.4));
  for (let x = -104; x <= 104; x += 1) for (let z = -104; z <= 104; z += 1) {
    const h = p.heightAt(x, z), g = Math.hypot(p.heightAt(x + 0.5, z) - h, p.heightAt(x, z + 0.5) - h) / 0.5;
    if (g > 0.9 && !near(x, z)) out.push([x, z, +g.toFixed(2)]);
  }
  return out;
}

test('TEETH: a spike in open terrain is reported as an unexplained cliff', () => {
  const p = makePlan(SEED).plan, h = p.heightAt;
  p.heightAt = (x, z) => h(x, z) + (Math.hypot(x + 85, z + 20) < 1 ? 3 : 0);
  assert.ok(unexplainedCliffs(p).length > 0);
});

test('heightAt is finite over the plot, fast, and every cliff is a cut band beside a lot, plaza or street', () => {
  let n = 0;
  const t0 = performance.now();
  for (let x = -104; x <= 104; x += 1) for (let z = -104; z <= 104; z += 1) { assert.ok(Number.isFinite(plan.heightAt(x, z)), `heightAt(${x},${z})`); n++; }
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `${n} heightAt calls took ${ms.toFixed(0)} ms`);
  const un = unexplainedCliffs(plan);
  assert.deepEqual(un.slice(0, 8), [], `${un.length} steep cells are not beside a structure`);
  assert.ok(Math.abs(plan.heightAt(0, 100) - plan.heightAt(0, 99)) < 1, 'the bottom edge is gentle');
  assert.ok(plan.heightAt(0, -100) - plan.heightAt(0, 100) > 24, 'the hill rises about 30 m');
});
