// The land round the far kit (R1-D20 and D21, round 5): streets in the corridors between the terraces, an alley before every row, trees and scrub, a belt of tall trees beyond the plot's wall, and
// three landmarks. The plan (outskirts.js planOutskirts: pure data) is walked here against the kit's own plan and the far rows; each check that can go vacuous has a TEETH next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-outskirts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { planVista } from '../js/world/vista-plan.js';
import { vistaSites, farHouses, kitZones } from '../js/world/vista.js';
import { clearLandmarks } from '../js/world/vista-kit.js';
import { planOutskirts, drawTree, OUT } from '../js/world/outskirts.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { polyDistPoint, pointInPoly } from '../js/world/geom.js';
import { hash32 } from '../js/world/vista-look.js';
import { HALF } from '../js/world/field.js';
import { makePlan, SEED } from './world-lib.mjs';

const data = JSON.parse(await readFile(new URL('../assets/models/vista/placement.json', import.meta.url), 'utf8'));
const { plan } = makePlan(), sites = vistaSites(plan), planned = clearLandmarks(planVista(plan, data), [sites.church, sites.lighthouse, ...sites.towers]);
const houses = farHouses(plan, { taken: kitZones(planned) }), P = planOutskirts(plan, planned, houses);

/** the footprint of a house standing at (x, z) turned ry (vista-plan.js offset(): u along the row, v out of its front) */
const poly = (x, z, ry, w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [x + u * Math.cos(ry) + v * Math.sin(ry), z - u * Math.sin(ry) + v * Math.cos(ry)]);
const feet = [...planned.houses.map((h) => poly(h.x, h.z, h.ry, h.width, h.depth)), ...houses.map((h) => poly(h.x, h.z, h.ry, h.w, h.d))];
/** the points (x, z) that stand in a house or within `margin` m of one */
const onHouses = (pts, margin) => pts.filter(([x, z]) => feet.some((f) => pointInPoly(f, x, z) || polyDistPoint(f, x, z) < margin));
const digest = (o) => hash32(JSON.stringify([o.streets, o.alleys, o.trees.map((t) => [t.x.toFixed(2), t.z.toFixed(2), t.kind, t.h.toFixed(1)]), o.landmarks.map((l) => [l.kind, l.x, l.z])]));

test('the plan is the same every time and follows the kit (TEETH: without the kit there are no terraces, so no street and no alley)', () => {
  assert.equal(digest(planOutskirts(plan, planned, houses)), digest(P), 'a second run');
  const bare = planOutskirts(plan, null, null);
  assert.equal(bare.streets.length + bare.alleys.length, 0, 'no kit, no corridor and no row');
  assert.ok(digest(bare) !== digest(P));
  assert.ok(feet.length > 600, `${feet.length} house footprints to keep clear of`);
});

test('a street in the corridors between the terraces, none through a house', () => {
  assert.ok(P.streets.length >= 8, `${P.streets.length} streets`);
  const metres = P.streets.reduce((n, s) => n + (s.pts.length - 1) * 2, 0);
  assert.ok(metres >= 400, `${metres} m of street`);
  const bad = onHouses(P.streets.flatMap((s) => s.pts), OUT.street / 2);
  assert.deepEqual(bad, [], `${bad.length} street points within ${OUT.street / 2} m of a house`);
  const through = P.streets.map((s) => s.pts.map(([x, z]) => [x, z]));
  through[0][0] = [planned.houses[0].x, planned.houses[0].z];                                        // TEETH: a point put in a house is found
  assert.equal(onHouses(through.flat(), OUT.street / 2).length >= 1, true);
  for (const s of P.streets) assert.ok(Math.max(...s.pts.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))) > HALF + 20, `${s.id} runs well out of the plot`);
});

test('an alley before the rows, clear of the houses', () => {
  assert.ok(P.alleys.length >= 20, `${P.alleys.length} alleys`);
  assert.ok(P.alleys.every((a) => a.pts.length >= 5), 'each is 10 m or more');
  const bad = onHouses(P.alleys.flatMap((a) => a.pts), 1.0);
  assert.deepEqual(bad, [], `${bad.length} alley points within a metre of a house`);
  assert.equal(onHouses([[planned.houses[3].x, planned.houses[3].z]], 1.0).length, 1, 'TEETH: a point in a house is found');
});

/** the problems of a list of trees: inside the plot, in a house, of a kind the drawing does not know, or a belt that is not there */
const treeProblems = (trees) => {
  const bad = [];
  for (const t of trees) {
    if (Math.abs(t.x) < HALF + 2 && Math.abs(t.z) < HALF + 2) bad.push(`tree at (${t.x.toFixed(0)}, ${t.z.toFixed(0)}) is inside the plot`);
    if (!['euca', 'cypress', 'broad', 'scrub'].includes(t.kind)) bad.push(`tree kind ${t.kind}`);
    if (!(t.h > 0.5 && t.h < 20)) bad.push(`tree height ${t.h}`);
  }
  bad.push(...onHouses(trees.map((t) => [t.x, t.z]), 0.4).map(([x, z]) => `tree at (${x.toFixed(0)}, ${z.toFixed(0)}) is on a house`));
  const belt = trees.filter((t) => t.h > 13 && Math.max(Math.abs(t.x), Math.abs(t.z)) - HALF < 20);
  if (belt.length < 40) bad.push(`only ${belt.length} tall trees beyond the wall`);
  return bad;
};

test('trees: a belt beyond the wall, none in the plot or on a house, within the budget', () => {
  assert.deepEqual(treeProblems(P.trees), []);
  assert.ok(P.trees.length <= OUT.maxTrees && P.trees.length >= 1500, `${P.trees.length} trees`);
  const kinds = new Set(P.trees.map((t) => t.kind));
  assert.deepEqual([...kinds].sort(), ['broad', 'cypress', 'euca', 'scrub']);
  assert.ok(P.trees.filter((t) => t.kind === 'euca').length > 300, 'the eucalyptus is the commonest tree on the hills');
  // TEETH: each problem is seen
  assert.equal(treeProblems([...P.trees, { x: 0, z: 0, kind: 'euca', h: 9 }]).length, 1, 'a tree in the plot');
  assert.equal(treeProblems([...P.trees, { x: planned.houses[1].x, z: planned.houses[1].z, kind: 'cypress', h: 8 }]).length, 1, 'a tree on a house');
  assert.equal(treeProblems([...P.trees, { x: 300, z: 300, kind: 'palm', h: 8 }]).length, 1, 'a kind nobody draws');
  assert.ok(treeProblems(P.trees.filter((t) => t.h <= 13)).some((m) => /tall trees beyond the wall/.test(m)), 'no belt');
  const nearest = P.trees.slice(0, 200).map((t) => Math.max(Math.abs(t.x), Math.abs(t.z)) - HALF);
  assert.ok(nearest.every((d, i) => i === 0 || d >= nearest[i - 1]), 'the budget keeps the trees nearest the plot first');
});

test('a tree costs the same triangles with the leaf sheet as without (the sheet adds none), and a far tree is drawn with fewer than a near one (the world\'s triangle budget)', () => {
  const ctx = createContext({ seed: SEED, headless: true });
  const tris = (t, cards) => { const b = new MeshBuilder(); drawTree(b, t, 0, ctx.rng.fork(`tree-cost:${t.kind}:${t.x}`), cards); let n = 0; for (const a of b.accs.values()) n += a.idx.length / 3; return n; };
  const at = (kind, beyond) => ({ x: HALF + beyond, z: 0, h: 12, kind, k: 1 });
  for (const kind of ['euca', 'broad', 'cypress', 'scrub']) for (const beyond of [6, 25, 80, 160]) {
    const t = at(kind, beyond);
    assert.equal(tris(t, true), tris(t, false), `${kind} ${beyond} m beyond the wall: ${tris(t, true)} triangles with the sheet, ${tris(t, false)} without`);
  }
  for (const kind of ['euca', 'broad']) {
    const near = tris(at(kind, 10), false), far = tris(at(kind, 120), false);
    assert.ok(near >= 50 && far >= 10 && far < near * 0.65, `${kind}: ${near} triangles near, ${far} far`);
  }
  assert.ok(tris(at('euca', 10), true) > tris(at('cypress', 10), true) * 5, 'a eucalyptus is drawn in more detail than a cypress, so the measure sees a change');
  const total = P.trees.reduce((n, t) => n + tris(t, false), 0);
  assert.ok(total > 30000 && total < 80000, `${total} triangles in all ${P.trees.length} trees (the world-mesh budget allows the whole world 900000)`);
});

test('three landmarks, each alone on level ground, off every house', () => {
  assert.deepEqual(P.landmarks.map((l) => l.kind).sort(), ['chapel', 'mast', 'tower']);
  for (const l of P.landmarks) {
    assert.ok(Number.isFinite(l.y) && Number.isFinite(l.ry), `${l.kind} has a height and a turn`);
    assert.deepEqual(onHouses([[l.x, l.z]], 8), [], `${l.kind} stands on or beside a house`);
  }
  assert.ok(P.landmarks.find((l) => l.kind === 'tower').x > 150, 'the water tower is on the east hill');
  assert.ok(P.landmarks.find((l) => l.kind === 'mast').x < -190, 'the mast is on the west hill');
  assert.ok(P.landmarks.find((l) => l.kind === 'chapel').z < -150, 'the chapel is on the north ridge');
  const tower = P.landmarks.find((l) => l.kind === 'tower');
  assert.equal(onHouses([[tower.x, tower.z]], 8).length, 0);
  assert.equal(feet.some((f) => polyDistPoint(f, tower.x, tower.z) < 8 || pointInPoly(f, tower.x, tower.z)), false);
  assert.equal(onHouses([[planned.houses[0].x, planned.houses[0].z]], 8).length, 1, 'TEETH: a landmark put on a house is found');
});

test('the world builds it: the step runs after the vista, before the poles, with its trees, landmarks and no error', async () => {
  const ctx = createContext({ seed: SEED, headless: true });
  ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
  await buildWorld(ctx); await buildProps(ctx); ctx.batch.flushAll();
  assert.deepEqual(ctx.errors, []);
  const order = Object.keys(ctx.world.propTimes), S = ctx.world.outskirts;
  assert.ok(order.indexOf('vista') < order.indexOf('outskirts') && order.indexOf('outskirts') < order.indexOf('poles'), order.join(' '));
  assert.deepEqual([...S.landmarks].sort(), ['chapel', 'mast', 'tower']);
  assert.ok(S.trees >= 1500 && S.tiles >= 6, `${S.trees} trees in ${S.tiles} tiles`);
  let tris = 0, meshes = 0;
  const crowns = [], ground = [];
  ctx.scene.traverse((o) => {
    if (!o.isMesh || !/^props\.outskirts\./.test(o.name)) return;
    meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    (/\.trees\b/.test(o.name) ? crowns : ground).push(o);
  });
  assert.ok(meshes >= 6, `${meshes} meshes`);
  assert.ok(tris > 20000 && tris < 600000, `${Math.round(tris)} triangles`);
  // every mesh that wears the canopy sheet casts and receives a shadow (world-canopy-page.test.mjs, in a browser); the trees are the only ones here that do, so they are the ones that cast
  assert.ok(crowns.length >= 4 && crowns.every((o) => o.castShadow && o.receiveShadow), `${crowns.length} tree meshes, all casting: ${crowns.filter((o) => !o.castShadow).map((o) => o.name).join(', ')}`);
  assert.ok(ground.length >= 1 && ground.every((o) => !o.castShadow), `${ground.length} ground and landmark meshes, none casting: ${ground.filter((o) => o.castShadow).map((o) => o.name).join(', ')}`);
});
