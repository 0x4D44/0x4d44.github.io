// The instanced kit wears its look (R1-D20, round 5): vista-kit.js asks vista-look.js how each planned piece is drawn (paint, height, step off the row, roof turn) and puts that in the
// instance matrix and colour, so the hillsides read as a barrio and not as one box repeated. world-vista-look.test.mjs walks the numbers; this walks what the kit does with them, with the
// real GLBs from disk (as world-vista-kit.test.mjs does). Each check that can go vacuous has a TEETH next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-vista-look-kit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildVistaKit } from '../js/world/vista-kit.js';
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

const ctx = createContext({ seed: SEED, headless: true });
ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
await registerAssets(ctx);
await buildWorld(ctx);
const kit = await buildVistaKit(ctx, { placement: data, load: (f) => load(ctx, f) });
const W = ctx.world, C = W.vistaKitController, planned = W.vistaKitPlan;
const chroma = (r, g, b) => Math.log(Math.max(0.02, b) / Math.max(0.02, r));               // blue over red: 0 for any grey, a spread for a paint box
const spread = (values) => { const m = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length); };

test('the real kit is built, one instance for every planned piece', () => {
  assert.equal(kit.enabled, true, kit.reason);
  assert.ok(C && planned && C.records.length === planned.pieces.length && C.records.length > 1500, `${C?.records.length} instances for ${planned?.pieces.length} pieces`);
});

test('the instances wear the houses\' paint: the plaster facades are many colours (TEETH: the planner\'s own shade is one grey)', () => {
  const facades = C.records.filter((r) => r.category === 'facade' && !/^brick/.test(r.key));
  assert.ok(facades.length > 600, `${facades.length} plaster facades`);
  const painted = spread(facades.map((r) => chroma(r.color.r, r.color.g, r.color.b))), plain = spread(facades.map((r) => chroma(r.shade, r.shade, r.shade)));
  assert.ok(plain < 1e-9, `TEETH: the planner's shade is grey (${plain})`);
  assert.ok(painted > 0.35, `hue spread ${painted.toFixed(2)} over the facades the kit draws`);
  const roofs = C.records.filter((r) => r.category === 'roof'), tones = new Set(roofs.map((r) => [r.color.r, r.color.g, r.color.b].map((v) => v.toFixed(2)).join()));
  assert.ok(tones.size >= 25, `${tones.size} different roof colours over ${roofs.length} roofs`);
});

test('the instances stand at different heights and steps: a floor stretched 0.87 to 1.15, a house moved up to a third of a metre off the row', () => {
  const lim = planned.limits.tileSize, facades = C.records.filter((r) => r.category === 'facade');
  const ratio = facades.map((r) => r.matrix[5] / r.scale[1]);
  assert.ok(Math.min(...ratio) < 0.92 && Math.max(...ratio) > 1.08 && Math.min(...ratio) >= 0.87 - 1e-6 && Math.max(...ratio) <= 1.15 + 1e-6, `facade height factor ${Math.min(...ratio).toFixed(2)}..${Math.max(...ratio).toFixed(2)}`);
  const steps = C.records.map((r) => Math.hypot(r.matrix[12] + Math.floor(r.x / lim) * lim - r.x, r.matrix[14] + Math.floor(r.z / lim) * lim - r.z));
  assert.ok(Math.max(...steps) > 0.2 && Math.max(...steps) <= 0.35 + 1e-4, `the largest step off the row is ${Math.max(...steps).toFixed(2)} m`);
  assert.ok(steps.filter((s) => s > 0.05).length > 0.7 * steps.length, 'most pieces are moved a little (the walls of a terrace keep their row)');
  const turned = C.records.filter((r) => r.category === 'roof').map((r) => Math.atan2(r.matrix[8], r.matrix[10]) - r.ry).map((a) => Math.abs(Math.sin(a / 2)) > 0.9 ? 1 : 0);
  assert.ok(turned.reduce((a, b) => a + b, 0) > 0.3 * turned.length && turned.reduce((a, b) => a + b, 0) < 0.7 * turned.length, 'about half the roofs are turned round');
});

test('the colours reach the instance buffers (what is drawn, not only the records)', () => {
  const seen = new Set(); let meshes = 0, instances = 0;
  C.root.traverse((o) => {
    if (!o.isInstancedMesh || !o.instanceColor || !o.count) return;
    meshes++; instances += o.count;
    for (let i = 0; i < o.count; i++) seen.add([0, 1, 2].map((k) => o.instanceColor.array[3 * i + k].toFixed(2)).join());
  });
  assert.ok(meshes >= 20 && instances >= 800, `${instances} instances in ${meshes} drawn buffers`);
  assert.ok(seen.size >= 150, `${seen.size} different instance colours in the buffers`);
});
