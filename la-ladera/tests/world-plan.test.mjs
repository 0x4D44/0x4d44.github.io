// Plan invariants (CONTRACT 5.1): pure Node, ~1 s. Every validator is proven to be able to fail (TEETH tests).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOT_KINDS, SHOP_TYPES } from '../js/core/vocab.js';
import { ANCHOR_KINDS } from '../js/core/registries.js';
import { checkPlan } from './plan-oracle.mjs';
import { footprint, gapBetween, polyDistPoint } from '../js/world/geom.js';
import { SEED, HAND_LOTS, makePlan, checkLots, plinthErrors, gradeErrors, navErrors, spawnErrors, placeErrors, ledgeSides, infillErrors } from './world-lib.mjs';

const { plan } = makePlan(SEED);
const strip = (p) => JSON.parse(JSON.stringify({ lots: p.lots, streets: p.streets, plazas: p.plazas, nav: p.nav, pois: p.pois, landmarks: p.landmarks, areas: p.areas, spawn: p.spawn, warnings: p.warnings }));

test('the plan is deterministic per seed and differs in the details for another seed', () => {
  const again = makePlan(SEED).plan, other = makePlan(SEED + 1).plan;
  assert.deepEqual(strip(again), strip(plan));
  for (let i = 0; i < 400; i++) { const x = ((i * 37) % 200) - 100, z = ((i * 91) % 200) - 100; assert.equal(again.heightAt(x, z), plan.heightAt(x, z)); }
  const slot = (l) => [l.id, l.kind, l.w, l.d, l.shop ?? null];
  assert.deepEqual(other.lots.slice(0, HAND_LOTS).map(slot), plan.lots.slice(0, HAND_LOTS).map(slot), 'ids, kinds, sizes, shops of the hand-authored lots are fixed per slot');
  assert.notDeepEqual(other.lots.slice(HAND_LOTS).map(slot), plan.lots.slice(HAND_LOTS).map(slot), 'the infill is drawn from the seed');
  assert.notDeepEqual(other.lots.map((l) => l.name), plan.lots.map((l) => l.name), 'names depend on the seed');
});

test('the lead oracle accepts the plan', () => {
  const r = checkPlan(plan, { seed: SEED });
  assert.deepEqual(r.violations, []);
});

test('lot mix: 90-160 lots, every kind, >= 12 shops over >= 10 shop types, unique names', () => {
  assert.ok(plan.lots.length >= 90 && plan.lots.length <= 160, `${plan.lots.length} lots`);
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
  for (const seed of [SEED + 1, SEED + 2, SEED + 7]) {              // the infill is drawn from the seed: other seeds must be just as clean (SEED + 2 and + 7 once left a 5.4-5.6 m nav edge)
    const q = makePlan(seed).plan;
    assert.deepEqual(checkLots(q), [], `seed ${seed}`);
    assert.deepEqual(q.warnings, [], `seed ${seed}`);
    assert.deepEqual(infillErrors(q, { digest: false }), [], `seed ${seed}`);
    assert.deepEqual(navErrors(q), [], `seed ${seed}`);
  }
});

test('TEETH: a lot dragged into the street, onto a neighbour or off the plot is reported', () => {
  const a = makePlan(SEED).plan; a.lots[20].x += 12;               // L20 into the road / neighbours
  assert.ok(checkLots(a).length > 0);
  const b = makePlan(SEED).plan; b.lots[5].x = 130;                // off the plot
  assert.ok(checkLots(b).some((m) => m.includes('out of the plot')));
  const c = makePlan(SEED).plan; c.lots[7].z = c.lots[6].z; c.lots[7].x = c.lots[6].x + 1; // on top of a neighbour
  assert.ok(checkLots(c).some((m) => m.includes('overlaps')));
});

test('density: L00-L48 come first and unchanged, the infill follows on real streets, and lots share a party wall or leave a walkable passage', () => {
  assert.deepEqual(infillErrors(plan), []);
  const fill = plan.lots.slice(HAND_LOTS), kinds = new Set(fill.map((l) => l.kind));
  assert.ok(kinds.size >= 6, `the infill has only ${kinds.size} kinds`);
  assert.ok(fill.filter((l) => l.shop).length >= 10, 'the infill carries shops');
  const fps = plan.lots.map((l) => footprint(l)); let passages = 0;
  for (let i = HAND_LOTS; i < plan.lots.length; i++) if (fps.some((f, j) => { if (j === i) return false; const g = gapBetween(fps[i], f); return g >= 1.15 && g <= 2.6; })) passages++;
  assert.ok(passages >= 20, `${passages} infill lots stand beside a 1.15-2.6 m passage`);
});

test('TEETH: a thinned plan, a moved hand-authored lot, a slit between lots or lots out of order are reported', () => {
  const thin = makePlan(SEED).plan; thin.lots.length = HAND_LOTS;
  assert.ok(infillErrors(thin).some((m) => m.includes('only')));
  const moved = makePlan(SEED).plan; moved.lots[7].x += 0.5;
  assert.ok(infillErrors(moved).some((m) => m.includes('hand-authored lots changed')));
  const swapped = makePlan(SEED).plan; [swapped.lots[60], swapped.lots[61]] = [swapped.lots[61], swapped.lots[60]];
  assert.ok(infillErrors(swapped).some((m) => m.includes('has id')));
  const slit = makePlan(SEED).plan, fp = slit.lots.map((l) => footprint(l));   // pull one lot of a touching pair 0.6 m away from its neighbour
  let pair = null;
  for (let i = HAND_LOTS; i < slit.lots.length && !pair; i++) for (let j = i + 1; j < slit.lots.length && !pair; j++) if (gapBetween(fp[i], fp[j]) <= 0.08) pair = [i, j];
  assert.ok(pair, 'the infill has party walls');
  const [a, b] = [slit.lots[pair[0]], slit.lots[pair[1]]], len = Math.hypot(b.x - a.x, b.z - a.z);
  b.x += (b.x - a.x) / len * 0.6; b.z += (b.z - a.z) / len * 0.6;
  assert.ok(infillErrors(slit).some((m) => m.includes('slit')));
  const lone = makePlan(SEED).plan; lone.lots[70].row = 'S1:3r';
  assert.ok(infillErrors(lone).some((m) => m.includes('not in an infill row')));
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
  const p = makePlan(SEED).plan; p.pois[0].kind = 'dance'; p.pois[1].building = 'L999'; p.lots[0].name = 'The Corner Shop'; p.landmarks[0].en = p.landmarks[0].name;
  assert.ok(placeErrors(p, ANCHOR_KINDS).length >= 4);
});

test('no poi stands at a drop: plaza benches stand back from a fill rim, and a lean spot beside a wall is withdrawn (A4, round 1)', () => {
  const benches = plan.pois.filter((q) => q.kind === 'bench' && (q.tags ?? []).includes('plaza')), leans = plan.pois.filter((q) => q.kind === 'lean');
  assert.ok(benches.length >= 6 && leans.length >= 60, `${benches.length} plaza benches, ${leans.length} lean spots`);
  assert.deepEqual(plan.pois.filter((q) => ledgeSides(plan, q)).map((q) => q.id), []);
});

test('TEETH: a plaza bench pushed back against a fill rim is reported as standing at a drop', () => {
  const p = makePlan(SEED).plan, back = (q, d) => { q.x += -Math.sin(q.ry) * d; q.z += -Math.cos(q.ry) * d; q.y = p.heightAt(q.x, q.z); };      // the bench's back is local -z
  const benches = p.pois.filter((q) => q.kind === 'bench' && (q.tags ?? []).includes('plaza'));
  assert.deepEqual(placeErrors(p, ANCHOR_KINDS), []);
  for (const q of benches) back(q, 0.4);
  const bad = placeErrors(p, ANCHOR_KINDS).filter((m) => /falls 0\.5 m/.test(m));
  assert.ok(bad.length >= 1, 'a bench back at the old 0.6 m inset on the P2 south rim has a drop beside it');
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
