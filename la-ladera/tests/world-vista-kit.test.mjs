// The vista kit (Codex's GLB terraces: vista-plan.js + vista-kit.js) beside A5's procedural far city (vista.js): the two never build the same ground twice.
// What it guards: the kit's terraces stay off the church and towers; the far rows keep off the kit's terraces (and would not without `taken`); both sets of lit
// windows reach ctx.glow; a headless build, where the kit is absent, still builds every row. Each check that can go vacuous has a TEETH next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-vista-kit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { planVista } from '../js/world/vista-plan.js';
import { buildVistaKit, clearLandmarks, kitLights, kitMaterialKey } from '../js/world/vista-kit.js';
import { vistaSites, farHouses, kitZones } from '../js/world/vista.js';
import { gapBetween } from '../js/world/geom.js';
import { SEED } from './world-lib.mjs';

const base = new URL('../assets/models/', import.meta.url);
const data = JSON.parse(await readFile(new URL('vista/placement.json', base), 'utf8'));
async function registerAssets(c) { await c.assets.init(async (p) => p === 'manifest.json' ? { files: ['manifest.vista.json'] } : JSON.parse(await readFile(new URL(p, base), 'utf8'))); }
async function load(c, file) {
  const bytes = await readFile(new URL(file, base));
  const gltf = await new Promise((resolve, reject) => c.assets.loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  gltf.scene.updateMatrixWorld(true); c.assets.loaded.set(file, gltf);
  return gltf;
}
const glowLog = { list: [], add(g) { this.list.push(g); return g; } };

// One world with the real kit built first (as props.js does in the browser), then every prop module.
const ctx = createContext({ seed: SEED, headless: true });
ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt); ctx.glow = glowLog;
ctx.camera = new ctx.THREE.PerspectiveCamera(); ctx.camera.position.set(ctx.plan.spawn.x, ctx.plan.spawn.y + 1.64, ctx.plan.spawn.z);
await registerAssets(ctx);
await buildWorld(ctx);
const kit = await buildVistaKit(ctx, { placement: data, load: (f) => load(ctx, f) });
await buildProps(ctx);
ctx.batch.flushAll();
const plan = ctx.plan, W = ctx.world, planned = W.vistaKitPlan, sites = vistaSites(plan), landmarks = [sites.church, ...sites.towers];
const footprint = (h) => { const c = Math.cos(h.ry), s = Math.sin(h.ry); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [h.x + (u * h.w / 2) * c + (v * h.d / 2) * s, h.z - (u * h.w / 2) * s + (v * h.d / 2) * c]); };

test('the kit is built before the far houses, owns world.vistaKit*, and leaves world.vista to the far city', () => {
  assert.equal(kit.enabled, true, kit.reason);
  assert.ok(W.vistaKit === kit && W.vistaKitPlan && W.vistaKitController, 'the kit publishes its stats, plan and controller');
  assert.ok(W.vista && W.vista.houses >= 400 && W.vista.towers === 4 && W.vista.church === 1 && W.vista.lights > 0, 'the far city is still built, with its landmarks and lights');
  assert.ok(W.vista !== W.vistaKit && W.vista.enabled === undefined, 'the two stat objects are different things');
  assert.equal(W.vista.keptOffKit, planned.houses.length, 'every kit house reserved its ground in the far rows');
});

test('no kit terrace stands on the church or a tower (TEETH: the planner alone puts pieces there)', () => {
  const raw = planVista(plan, data);
  assert.ok(raw.pieces.some((p) => landmarks.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < s.r)), 'planVista on its own does reach a landmark, so the check below can fail');
  for (const s of landmarks) assert.equal(planned.pieces.filter((p) => Math.hypot(s.x - p.x, s.z - p.z) < s.r).length, 0, `the landmark at ${s.x.toFixed(0)},${s.z.toFixed(0)} keeps its ground`);
  const cleared = clearLandmarks(raw, landmarks);
  assert.ok(cleared.dropped.length >= 1 && cleared.houses.length < raw.houses.length, 'whole terraces are dropped');
  assert.ok(cleared.pieces.every((p) => !cleared.dropped.includes(p.cluster)) && cleared.houses.every((h) => !cleared.dropped.includes(h.cluster)));
  const triangles = cleared.pieces.reduce((n, p) => n + (p.detail ? 0 : p.farTriangles), 0);
  assert.equal(cleared.farTriangles, triangles, 'the far-triangle account follows the pieces that are left');
  assert.equal(Object.values(cleared.regionCost).reduce((a, b) => a + b, 0), triangles);
  assert.equal(clearLandmarks(raw, []).dropped.length, 0, 'with no landmarks nothing is dropped');
});

test('no far house overlaps a kit terrace, and without `taken` many would (TEETH)', () => {
  const zones = kitZones(planned), houses = farHouses(plan, { taken: zones });
  assert.equal(zones.length, planned.houses.length);
  assert.equal(W.vista.houses, houses.length, 'the built far city is the one farHouses lays out around the kit');
  const hit = (list) => list.filter((h) => { const f = footprint(h); return zones.some((q) => gapBetween(f, q) <= 0); });
  assert.deepEqual(hit(houses).map((h) => `${h.x.toFixed(0)},${h.z.toFixed(0)}`), [], 'no row touches a terrace');
  const free = farHouses(plan), crowded = hit(free);
  assert.ok(crowded.length >= 20, `${crowded.length} of the ${free.length} far houses would stand on kit terraces if the rows ignored them`);
  assert.ok(houses.length < free.length && houses.length > free.length - 3 * planned.houses.length, `${free.length - houses.length} far houses give way to ${planned.houses.length} kit houses`);
  assert.equal(farHouses(plan, { taken: [] }).length, free.length, 'an empty `taken` is the old behaviour');
  // the density-free map: a house on every site, so a zone must really push rows away rather than the rows missing it by luck
  const flat = { density: () => 1, max: 1e6 }, every = farHouses(plan, flat), pushed = farHouses(plan, { ...flat, taken: zones });
  assert.ok(hit(every).length > 0 && hit(pushed).length === 0, 'on a map that is built up everywhere the zones still hold');
});

test('the lit windows of both the far houses and the kit houses reach the glow registry', () => {
  const lights = kitLights(plan, planned);
  assert.equal(W.vistaKit.lights, lights.length);
  assert.equal(glowLog.list.filter((g) => g.src !== 'edgewall').length, W.vista.lights + W.vistaKit.lights, 'every vista light and every kit light is in ctx.glow');      // the lit windows of the rim's houses (edgewall.js) are not theirs
  assert.ok(lights.length >= planned.houses.length * 0.5 && lights.length <= planned.houses.length * 2, `${lights.length} lit windows for ${planned.houses.length} kit houses`);
  const byHouse = new Map(planned.houses.map((h) => [h.id, h]));
  for (const l of lights) {
    assert.ok([l.x, l.y, l.z, l.size, l.intensity].every(Number.isFinite) && l.on >= 0 && l.on <= 1, 'a finite point with a dusk order');
    const near = planned.houses.some((h) => Math.hypot(h.x - l.x, h.z - l.z) < Math.hypot(h.width, h.depth) / 2 + 1 && l.y > h.y && l.y < h.y + 3 * 3.2);
    assert.ok(near, `the light at ${l.x.toFixed(1)},${l.z.toFixed(1)} belongs to a house`);
  }
  assert.deepEqual(kitLights(plan, planned), lights, 'deterministic');
  assert.ok(byHouse.size === planned.houses.length);
});

test('the kit fills ground the far city does not use: instanced meshes in the scene, the far houses merged, no shadows from either', () => {
  let instanced = 0, kitMeshes = 0, vistaMeshes = 0;
  ctx.scene.traverse((o) => {
    if (o.isInstancedMesh && o.name.startsWith('vista:')) { instanced++; assert.equal(o.castShadow, false); }
    if (o.isMesh && o.name.startsWith('world.vista:')) { vistaMeshes++; assert.equal(o.castShadow, false); }
    if (o.name === 'props.vista') kitMeshes++;
  });
  assert.equal(kitMeshes, 1);
  assert.equal(instanced, W.vistaKitController.buckets.size);
  assert.ok(vistaMeshes >= 5 && vistaMeshes <= 14, `${vistaMeshes} merged far-city meshes`);
});

test('the kit is drawn with a neutral vertex-colour material, not the trunks\' bark swatch (TEETH: bark_trunk is textured now)', () => {
  const defs = ctx.matlib.defs;
  assert.equal(typeof defs.bark_trunk.tex, 'string', 'bark_trunk wears a swatch today: a kit that shared it would be multiplied into dark brown');
  assert.equal(kitMaterialKey('bark_trunk'), 'vista_matte');
  assert.equal(kitMaterialKey('plaster_a'), 'plaster_a', 'only the GLBs\' historical name is remapped');
  assert.deepEqual([defs.vista_matte.tex, defs.vista_matte.color, defs.vista_matte.vertexColors === false], [false, 0xffffff, false], 'neutral white, no swatch, colours from the vertices');
  let meshes = 0;
  ctx.scene.traverse((o) => {
    if (!(o.isInstancedMesh && o.name.startsWith('vista:'))) return;
    meshes++;
    assert.equal(o.material.name, 'vista_matte', `${o.name} is drawn with the neutral twin`);
    assert.equal(o.material.map, null); assert.equal(o.material.vertexColors, true);
  });
  assert.ok(meshes > 0 && meshes === W.vistaKitController.buckets.size);
});

test('a headless build without the kit (no placement data, ?vista=0) builds every far row, exactly as before', async () => {
  const c = createContext({ seed: SEED, headless: true });
  c.plan = generatePlan(c); c.physics.setTerrain(c.plan.heightAt);
  await buildWorld(c); await buildProps(c); c.batch.flushAll();
  const order = Object.keys(c.world.propTimes);
  assert.ok(order.includes('vistakit') && order.indexOf('vistakit') < order.indexOf('vista'), `props.js builds the kit before the far houses (${order.join(' ')})`);
  assert.equal(c.world.vistaKit.fallback, true);
  assert.match(c.world.vistaKit.reason, /headless/);
  assert.equal(c.world.vista.keptOffKit, 0);
  assert.equal(c.world.vista.houses, farHouses(c.plan).length, 'every row is built when there is no kit');
  assert.ok(c.world.vista.houses > W.vista.houses, 'and more of them than beside a real kit');
  const off = createContext({ seed: SEED, headless: true, vista: false });
  assert.equal((await buildVistaKit(off, { placement: data })).fallback, true);
});
