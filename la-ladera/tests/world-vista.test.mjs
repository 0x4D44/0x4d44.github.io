// The real shipped GLBs, placement/stack contract, distance LOD and atomic fallback.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-vista.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildFarTerrain, makeFarHeight, makeFarTerrainSampler } from '../js/world/periphery.js';
import { planVista, placementErrors, outsideVistaPlot, vistaBounds, VISTA_LIMITS, VISTA_CATEGORIES } from '../js/world/vista-plan.js';
import { buildVista, kitParts, selectVistaLODs } from '../js/world/vista.js';

const base = new URL('../assets/models/', import.meta.url);
const data = JSON.parse(await readFile(new URL('vista/placement.json', base), 'utf8'));
const ctx = createContext({ headless: true }); ctx.plan = generatePlan(ctx);
const planned = planVista(ctx.plan, data);
const meta = new Map(data.pieces.map((p) => [p.id, p]));

test('placement data is complete and every category is used in the deterministic neighbourhood', () => {
  assert.deepEqual(placementErrors(data), []);
  assert.equal(data.pieces.length, 48);
  assert.ok(planned.houses.length >= 400 && planned.houses.length <= VISTA_LIMITS.maxBuildings);
  assert.ok(planned.clusters.length >= 80);
  for (const c of VISTA_CATEGORIES) assert.ok(planned.pieces.some((p) => p.category === c), `${c} is actually placed`);
  for (const t of planned.clusters) assert.ok(t.houses.length >= 3 && t.houses.length <= 7);
  assert.deepEqual(planVista(ctx.plan, data), planned);
  assert.notDeepEqual(planVista({ ...ctx.plan, seed: ctx.plan.seed + 1 }, data).pieces, planned.pieces);
});

test('TEETH: missing LODs, duplicate IDs, unknown categories and over-budget geometry are rejected', () => {
  for (const mutate of [
    (d) => { delete d.pieces[0].far; },
    (d) => { d.pieces[1].id = d.pieces[0].id; },
    (d) => { d.pieces[0].category = 'unknown'; },
    (d) => { d.pieces[0].nearTriangles = 600; },
    (d) => { d.pieces[0].farTriangles = 61; },
    (d) => { d.pieces[0].stack.height = 999; },
    (d) => { delete d.pieces[0].mounts; },
  ]) {
    const broken = structuredClone(data); mutate(broken);
    assert.ok(placementErrors(broken).length);
    assert.throws(() => planVista(ctx.plan, broken), /vista placement/);
  }
});

test('whole footprints stay outside the playable plot and river, and every stack follows its support metadata', () => {
  const byId = new Map(planned.pieces.map((p) => [p.id, p]));
  assert.equal(byId.size, planned.pieces.length);
  for (const p of planned.pieces) {
    assert.ok(outsideVistaPlot(p), p.id);
    const bounds = vistaBounds(p);
    assert.ok(bounds.z1 <= 204 || bounds.z0 >= 282, `${p.id} leaves the river open`);
    assert.ok([p.x, p.y, p.z, p.ry, ...p.size, ...p.scale].every(Number.isFinite));
    if (!p.support) continue;
    const parent = byId.get(p.support), a = meta.get(parent?.key), b = meta.get(p.key);
    assert.ok(parent && a.stack.supports.includes(p.category) && b.stack.on.includes(parent.category), `${p.id}: legal support`);
    if (p.mount === 'front') {
      const front = a.mounts.front;
      const dx = p.x - parent.x, dz = p.z - parent.z;
      const centreZ = dx * Math.sin(parent.ry) + dz * Math.cos(parent.ry);
      const backZ = centreZ - p.size[2] / 2, wallZ = front.z * parent.scale[2];
      assert.ok(Math.abs(backZ - (wallZ - 0.1)) < 0.0001, `${p.id}: balcony back overlaps the real facade wall`);
      assert.ok(Math.abs(p.y - (parent.y + front.y * parent.scale[1] - 0.04)) < 0.0001, `${p.id}: balcony deck crosses the storey floor`);
    } else {
      assert.ok(Math.abs(p.y - (parent.y + a.stack.height * parent.scale[1])) < 0.0001, `${p.id}: mounting plane`);
      if (p.category === 'facade') assert.ok(p.size[0] <= parent.size[0] + 0.001 && p.size[2] <= parent.size[2] + 0.001);
    }
  }
  const far = makeFarHeight(ctx.plan);
  for (const h of planned.houses) {
    assert.ok(h.y < h.terrainRange[0], `${h.id} first storey is anchored below its lowest corner`);
    assert.ok(h.y < far(h.x, h.z), `${h.id} does not float at its centre`);
  }
  for (const p of planned.pieces.filter((p) => p.category === 'retaining')) {
    // Independent end/quarter-point probes, rather than reusing the planner's sampling grid.
    for (const u of [-0.5, -0.25, 0, 0.25, 0.5]) for (const v of [-0.5, 0, 0.5]) {
      const lx = u * p.size[0], lz = v * p.size[2];
      const x = p.x + lx * Math.cos(p.ry) + lz * Math.sin(p.ry), z = p.z - lx * Math.sin(p.ry) + lz * Math.cos(p.ry);
      const ground = far(x, z);
      assert.ok(p.y <= ground - 0.11, `${p.id}: wall base must remain below terrain at ${u},${v}`);
      assert.ok(p.y + p.size[1] >= ground + 0.59, `${p.id}: wall cap must clear the uphill terrain`);
    }
  }
});

test('foundations stay buried in the actual terrain triangles without moving existing storey tops or wall caps', () => {
  // Capture the builder's real vertices/indices, including Float32 storage. This reference
  // neither imports the sampler's grid constants nor repeats its interpolation/clip code.
  const cells = new Map(), steps = new Set(); let current;
  const batch = {
    builder() {
      current = { vertices: [], acc: { idx: [] }, tris: 0 };
      current._acc = () => current.acc;
      current.vert = (_, p) => { current.vertices.push(p.map(Math.fround)); return current.vertices.length - 1; };
      return current;
    },
    flush() {
      const { vertices, acc } = current;
      for (let i = 0; i < acc.idx.length; i += 3) {
        const triangle = acc.idx.slice(i, i + 3).map((n) => vertices[n]);
        const xs = triangle.map((v) => v[0]), zs = triangle.map((v) => v[2]);
        const x0 = Math.min(...xs), z0 = Math.min(...zs), step = Math.max(...xs) - x0;
        if (!step || Math.max(...zs) === z0) continue; // vertical skirts have no ground surface
        const key = `${step}:${x0}:${z0}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(triangle); steps.add(step);
      }
    },
  };
  buildFarTerrain({ batch }, ctx.plan);
  assert.deepEqual([...steps].sort((a, b) => a - b), [5, 15]);
  const barycentric = (p, triangle) => {
    const [a, b, c] = triangle, x = p[0], z = p[1];
    const den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den;
    return [u, v, 1 - u - v];
  };
  const intersection = (a, b, c, d) => {
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = d[0] - c[0], vz = d[1] - c[1];
    const den = ux * vz - uz * vx;
    if (Math.abs(den) < 1e-10) return null;
    const dx = c[0] - a[0], dz = c[1] - a[1], t = (dx * vz - dz * vx) / den, s = (dx * uz - dz * ux) / den;
    return t >= -1e-9 && t <= 1 + 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 ? [a[0] + t * ux, a[1] + t * uz] : null;
  };
  const footprint = (p) => [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u, v]) => [
    p.x + u * p.size[0] / 2 * Math.cos(p.ry) + v * p.size[2] / 2 * Math.sin(p.ry),
    p.z - u * p.size[0] / 2 * Math.sin(p.ry) + v * p.size[2] / 2 * Math.cos(p.ry),
  ]);
  const referenceMinimum = (p) => {
    const corners = footprint(p), bounds = vistaBounds(p); let minimum = Infinity;
    const within = ([x, z]) => Math.abs((x - p.x) * Math.cos(p.ry) - (z - p.z) * Math.sin(p.ry)) <= p.size[0] / 2 + 1e-8
      && Math.abs((x - p.x) * Math.sin(p.ry) + (z - p.z) * Math.cos(p.ry)) <= p.size[2] / 2 + 1e-8;
    for (const step of steps) {
      for (let j = Math.floor(bounds.z0 / step) - 1; j <= Math.floor(bounds.z1 / step); j++) {
        for (let i = Math.floor(bounds.x0 / step) - 1; i <= Math.floor(bounds.x1 / step); i++) {
          for (const triangle of cells.get(`${step}:${i * step}:${j * step}`) ?? []) {
            const t = triangle.map((v) => [v[0], v[2]]);
            const points = [...corners, ...t.filter(within)];
            for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) {
              const q = intersection(corners[a], corners[(a + 1) % 4], t[b], t[(b + 1) % 3]);
              if (q) points.push(q);
            }
            for (const q of points) {
              const weights = barycentric(q, triangle);
              if (weights.every((n) => n >= -1e-8)) minimum = Math.min(minimum, weights.reduce((sum, w, k) => sum + w * triangle[k][1], 0));
            }
          }
        }
      }
    }
    return minimum;
  };
  const sampler = makeFarTerrainSampler(ctx.plan);
  const foundations = planned.pieces.filter((p) => p.category === 'retaining' || p.category === 'facade' && p.level === 0);
  assert.equal(foundations.length, 887);
  for (const p of foundations) {
    const ground = referenceMinimum(p), margin = p.category === 'facade' ? 0.17 : 0.11;
    assert.ok(Number.isFinite(ground));
    assert.ok(p.y <= ground - margin, `${p.id}: base ${p.y} must remain below rendered surface ${ground}`);
    assert.ok(Math.abs(sampler.minimum(footprint(p)) - ground) < 1e-7, `${p.id}: sampler matches the independent triangle intersection`);
  }
  // Also exercise interior extrema, rotated footprints and the 5 m / 15 m seam.
  for (const p of [
    { x: 300, z: 150, ry: 0.37, size: [14, 1, 9] },
    { x: -300, z: -180, ry: -0.21, size: [12, 1, 17] },
    { x: -160, z: -150, ry: 0.17, size: [23, 1, 21] },
  ]) assert.ok(Math.abs(sampler.minimum(footprint(p)) - referenceMinimum(p)) < 1e-7);
  const wall = planned.pieces.find((p) => p.id === 'terrace-61-h2-retaining');
  assert.ok(43.01052 - referenceMinimum(wall) > 0.46, 'TEETH: the previous wall base must expose the reported gap');
  assert.ok(Math.abs(wall.y + meta.get(wall.key).size[1] * wall.scale[1] - 44.091456) < 1e-8, 'previous wall cap stays fixed');
  const floor = planned.pieces.find((p) => p.id === 'terrace-44-h1-floor0');
  assert.ok(Math.abs(floor.y + meta.get(floor.key).size[1] * floor.scale[1] - 47.403661) < 1e-8, 'previous first-storey top stays fixed');
  assert.equal(planned.pieces.find((p) => p.id === 'terrace-44-h1-roof').y, 50.10905, 'previous roof mounting elevation stays fixed');
  assert.deepEqual([planned.houses.length, planned.pieces.length, planned.farTriangles], [578, 2260, 41968]);
});

test('TEETH: a large overhanging piece whose centre clears the plot still fails footprint clearance', () => {
  const p = { x: 112, z: 0, ry: 0, size: [20, 3, 5] };
  assert.equal(outsideVistaPlot(p), false);
  p.x = 130; assert.equal(outsideVistaPlot(p), true);
});

test('placement stack limits are consumed by the planner, rather than being descriptive metadata', () => {
  const low = structuredClone(data);
  for (const p of low.pieces) if (p.category === 'facade') p.stack.maxLevels = 1;
  const oneStorey = planVista(ctx.plan, low);
  assert.ok(oneStorey.houses.length > 100);
  assert.ok(oneStorey.houses.every((h) => h.levels === 1));
  assert.ok(oneStorey.pieces.filter((p) => p.category === 'facade').every((p) => p.level === 0));
});

test('near, far and hidden details are exclusive and keep the whole scene below the triangle ceiling', () => {
  const points = [ctx.plan.spawn, { x: 0, y: 25, z: -90 }, { x: -95, y: 15, z: 0 }, { x: 95, y: 15, z: 0 }, { x: 0, y: 30, z: 475 }];
  for (const at of points) {
    const selected = selectVistaLODs(planned.pieces, at);
    assert.equal(selected.modes.length, planned.pieces.length);
    assert.ok(selected.triangles <= VISTA_LIMITS.triangles);
    const counted = selected.modes.reduce((n, mode, i) => n + (mode === 'off' ? 0 : planned.pieces[i][`${mode}Triangles`]), 0);
    assert.equal(counted, selected.triangles);
    assert.ok(selected.modes.some((m) => m === 'near'));
    assert.ok(selected.modes.some((m) => m === 'far'));
    assert.ok(selected.modes.some((m) => m === 'off'));
  }
  assert.ok(planned.farTriangles <= VISTA_LIMITS.farTriangles);
});

test('LOD hysteresis retains near geometry at the boundary and switches after the outer radius', () => {
  const p = [{ x: 0, y: 0, z: 0, detail: false, nearTriangles: 100, farTriangles: 20 }];
  assert.deepEqual(selectVistaLODs(p, { x: 175, y: 0, z: 0 }).modes, ['near']);
  assert.deepEqual(selectVistaLODs(p, { x: 185, y: 0, z: 0 }, ['near']).modes, ['near']);
  assert.deepEqual(selectVistaLODs(p, { x: 193, y: 0, z: 0 }, ['near']).modes, ['far']);
  assert.deepEqual(selectVistaLODs(p, { x: 185, y: 0, z: 0 }, ['far']).modes, ['far']);
  assert.throws(() => selectVistaLODs([{ ...p[0], farTriangles: 61000 }], { x: 0, y: 0, z: 0 }), /budget/);
});

async function registerAssets(c) {
  await c.assets.init(async (p) => p === 'manifest.json' ? { files: ['manifest.vista.json'] } : JSON.parse(await readFile(new URL(p, base), 'utf8')));
}
async function load(c, file) {
  const bytes = await readFile(new URL(file, base));
  const gltf = await new Promise((resolve, reject) => c.assets.loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '', resolve, reject));
  gltf.scene.updateMatrixWorld(true); c.assets.loaded.set(file, gltf);
  return gltf;
}

test('actual GLBs produce InstancedMeshes, all roots match their declared cost, and moving the camera really swaps LOD', async (t) => {
  await registerAssets(ctx);
  ctx.camera = new ctx.THREE.PerspectiveCamera(); ctx.camera.position.set(ctx.plan.spawn.x, ctx.plan.spawn.y + 1.64, ctx.plan.spawn.z);
  const result = await buildVista(ctx, { placement: data, load: (f) => load(ctx, f) });
  assert.equal(result.enabled, true, result.reason);
  t.diagnostic(JSON.stringify({ houses: result.houses, terraces: result.terraces, instances: result.instances, tiles: result.tiles, buffers: result.buffers, activeDrawCalls: result.activeDrawCalls, activeTriangles: result.activeTriangles, farTriangles: result.farTriangles }));
  assert.equal(kitParts(ctx, data).size, 96);
  const control = ctx.world.vistaController;
  assert.ok(control.root.parent === ctx.scene);
  assert.ok(ctx.systems.some((s) => s.name === 'vista-lod'));
  const actualCost = () => [...control.buckets.values()].reduce((n, b) => n + (b.mesh.visible ? b.mesh.count * b.mesh.geometry.index.count / 3 : 0), 0);
  assert.equal(actualCost(), result.activeTriangles);
  for (const b of control.buckets.values()) {
    assert.ok(b.mesh.isInstancedMesh && b.mesh.frustumCulled);
    assert.equal(b.mesh.castShadow, false); assert.equal(b.mesh.receiveShadow, false);
    assert.ok(b.mesh.boundingSphere.radius > 0 && Number.isFinite(b.mesh.boundingSphere.radius));
  }
  const first = [...control.buckets.values()].map((b) => b.mesh.count);
  ctx.camera.position.set(0, 45, 490); control.update(0, true);
  const second = [...control.buckets.values()].map((b) => b.mesh.count);
  assert.notDeepEqual(second, first);
  assert.equal(actualCost(), result.activeTriangles);
  assert.ok(actualCost() <= VISTA_LIMITS.triangles);
  assert.equal(ctx.matlib.missing.size, 0);
  control.dispose();
});

test('disposing a vista is idempotent, removes only its system and references, and permits rebuilding', async () => {
  const c = createContext({ headless: true }); c.plan = ctx.plan;
  await registerAssets(c);
  const options = { placement: data, load: (f) => load(c, f) };
  const firstStats = await buildVista(c, options), first = c.world.vistaController;
  assert.equal(firstStats.enabled, true, firstStats.reason);
  const otherSystem = () => {}; c.addSystem('vista-lod', otherSystem, 9);
  let disposals = 0;
  for (const b of first.buckets.values()) b.mesh.addEventListener('dispose', () => disposals++);
  const versions = [...first.buckets.values()].map((b) => b.mesh.instanceMatrix.version);
  first.dispose(); first.dispose();
  assert.equal(disposals, first.buckets.size, 'each instance buffer is released once');
  assert.equal(first.root.parent, null);
  assert.equal(c.world.vistaController, undefined); assert.equal(c.world.vistaPlan, undefined); assert.equal(c.world.vista, undefined);
  assert.ok(!c.systems.some((s) => s.fn === first.system));
  assert.ok(c.systems.some((s) => s.fn === otherSystem), 'same-named unrelated system survives');
  first.system(1); first.update(1, true);
  assert.deepEqual([...first.buckets.values()].map((b) => b.mesh.instanceMatrix.version), versions, 'disposed updates never touch released buffers');
  assert.equal(firstStats.enabled, false); assert.equal(firstStats.activeTriangles, 0);
  const secondStats = await buildVista(c, options), second = c.world.vistaController;
  assert.equal(secondStats.enabled, true, secondStats.reason);
  assert.notEqual(second, first); assert.equal(second.root.parent, c.scene);
  assert.equal(c.systems.filter((s) => s.fn === second.system).length, 1);
  first.dispose();
  assert.equal(c.world.vistaController, second); assert.equal(c.world.vista, secondStats);
  second.dispose();
});

test('TEETH: failure after allocating the first instance buffer releases it and publishes no partial vista', async () => {
  const c = createContext({ headless: true }); c.plan = ctx.plan; await registerAssets(c);
  const existing = new c.THREE.Group(); existing.name = 'original-far-terrain'; c.scene.add(existing);
  const originalMat = c.mat, originalDispose = c.THREE.InstancedMesh.prototype.dispose;
  let materials = 0, disposed = 0;
  c.mat = (key) => { if (++materials === 2) throw new Error('injected second material failure'); return originalMat(key); };
  c.THREE.InstancedMesh.prototype.dispose = function () { disposed++; return originalDispose.call(this); };
  try {
    const result = await buildVista(c, { placement: data, load: (f) => load(c, f) });
    assert.equal(materials, 2); assert.equal(disposed, 1, 'the already-created buffer was released');
    assert.equal(result.enabled, false); assert.match(result.reason, /injected second material failure/);
    assert.deepEqual(c.scene.children, [existing]);
    assert.equal(c.world.vistaController, undefined); assert.equal(c.world.vistaPlan, undefined);
    assert.ok(!c.systems.some((s) => s.name === 'vista-lod'));
    assert.ok(c.assets.loaded.size > 0 && c.assets.partCache.size > 0, 'shared source geometry remains reusable');
  } finally {
    c.mat = originalMat; c.THREE.InstancedMesh.prototype.dispose = originalDispose;
  }
});

test('disabled, missing and failed kits leave the existing scene intact without partial geometry or missing-asset meshes', async () => {
  for (const mode of ['disabled', 'missing', 'failed', 'incomplete']) {
    const c = createContext({ headless: true, vista: mode === 'disabled' ? false : undefined }); c.plan = ctx.plan;
    const existing = new c.THREE.Group(); existing.name = 'original-far-terrain'; c.scene.add(existing);
    if (mode !== 'missing') await registerAssets(c);
    if (mode === 'incomplete') c.assets.entries.delete(data.pieces[0].far);
    const r = await buildVista(c, { placement: data, load: () => { throw new Error('offline test'); } });
    assert.equal(r.enabled, false); assert.equal(r.fallback, true);
    assert.deepEqual(c.scene.children, [existing]);
    assert.equal(c.assets.missing.size, 0); assert.deepEqual(c.errors, []);
    assert.ok(!c.systems.some((s) => s.name === 'vista-lod'));
  }
});
