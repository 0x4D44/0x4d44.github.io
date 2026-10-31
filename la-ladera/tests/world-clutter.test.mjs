// Exercise the real GLBs and the runtime consumer together: fallback, LOD switching, batching and footprint clearance.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-clutter.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { buildData, readAssetJson, ROOT } from './headless.mjs';
import { Clutter, loadClutter, buildingClutter, clutterMatrix } from '../js/world/clutter.js';
import { buildClutterDress, clutterFacadePanels, clutterDecalUV } from '../js/world/clutter-dress.js';
import { buildOccupancy, OCC } from '../js/world/occupancy.js';
import { makeKit } from '../js/world/kit.js';
import { bin, moto } from '../js/world/vehicles.js';

async function loaded(ctx = createContext({ headless: true })) {
  await ctx.assets.init(readAssetJson);
  const paths = new Set(ctx.assets.names('clutter').map((key) => ctx.assets.meta(key).glb));
  assert.ok(paths.size, 'the generated clutter manifest is registered and nonempty');
  for (const path of paths) {
    const b = await readFile(resolve(ROOT, 'assets/models', path));
    const gl = await ctx.assets.loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    gl.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, gl);
  }
  ctx.clutter = new Clutter(ctx);
  return ctx;
}

test('a manifest without its loaded GLB preserves the procedural bin; disabled clutter makes no load request', async () => {
  const ctx = createContext({ headless: true });
  await ctx.assets.init(readAssetJson);
  ctx.clutter = new Clutter(ctx);
  assert.equal(ctx.clutter.has('clutter_bin_wheelie'), false);
  assert.equal(ctx.clutter.place('clutter_bin_wheelie', 0, 0, 0), false);
  const b = ctx.batch.builder('fallback');
  bin({ ctx, H: () => 0 }, b, 0, 0, 0);
  assert.ok(b.tris >= 100, 'working procedural geometry remains, rather than a missing-asset box');
  let requested = false;
  ctx.assets.load = () => { requested = true; throw new Error('should not load'); };
  ctx.opts = { clutter: false };
  assert.equal(await loadClutter(ctx), null);
  assert.equal(requested, false);
  assert.equal(ctx.assets.missing.size, 0);
});

test('an absent LOD node prevents replacement even when the near node and manifest entry are present', async () => {
  const ctx = await loaded(), key = 'clutter_bin_wheelie', low = ctx.assets.meta(key).lod1;
  const gl = ctx.assets.loaded.get(ctx.assets.meta(key).glb), node = gl.scene.getObjectByName(low);
  assert.ok(node, 'real generated low-detail node exists');
  node.removeFromParent();
  const C = new Clutter(ctx);
  assert.equal(C.has(key), false, 'two actual nodes are required; metadata alone is insufficient');
  assert.ok(C.has('clutter_chair'), 'unrelated assets remain usable');
});

test('real clutter switches near -> low -> hidden; instance slots never draw both LODs and distant teleports refresh immediately', async () => {
  const ctx = await loaded(), C = ctx.clutter, key = 'clutter_chair';
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(0, 1.6, 3);
  for (let i = 0; i < 6; i++) assert.ok(C.place(key, i * 0.4, 0, 0));
  C.finalize();
  const type = C.types.get(key), nearCost = C.stats.triangles;
  assert.equal(C.stats.near, 6); assert.equal(C.stats.far, 0);
  assert.ok(type.meshes[0].every((m) => m.isInstancedMesh && m.count === 6 && m.visible));
  assert.ok(type.meshes[1].every((m) => m.count === 0 && !m.visible));
  assert.equal(C.batches.length, type.parts[0].length + type.parts[1].length, 'six chairs share a batch per material/LOD');
  ctx.camera.position.set(0, 1.6, 45); ctx.events.emit('player:teleport', {});
  assert.equal(C.stats.near, 0); assert.equal(C.stats.far, 6);
  assert.ok(C.stats.triangles < nearCost * 0.65, 'the low mesh saves meaningful triangles');
  assert.ok(type.meshes[0].every((m) => m.count === 0 && !m.visible));
  assert.ok(type.meshes[1].every((m) => m.count === 6 && m.visible));
  ctx.camera.position.set(0, 1.6, 200); ctx.events.emit('player:teleport', {});
  assert.equal(C.stats.culled, 6); assert.equal(C.stats.triangles, 0);
  assert.ok(C.batches.every((m) => m.count === 0 && !m.visible && !m.castShadow));
  ctx.camera.position.set(0, 1.6, 3); ctx.events.emit('player:teleport', {});
  assert.equal(C.stats.near, 6, 'a close teleport brings them back without a later animation frame');
});

test('building fixtures retain their world location and support height after replacing procedural meshes', async () => {
  const ctx = await loaded();
  const frame = { rotY: Math.PI / 2, toWorld: (x, y, z) => [10 + z, 6 + y, 20 - x] };
  const G = { ctx, bp: { id: 'roof-test', frame } };
  assert.ok(buildingClutter(G, 'clutter_tank_black', -2, 3, 1, 0, { size: [1.02, 1.14, 1.02] }));
  const r = ctx.clutter.records[0];
  assert.deepEqual([r.x, r.y, r.z], [11, 9, 22]); assert.equal(r.yaw, Math.PI / 2);
  const b = new THREE.Box3();
  for (const p of ctx.clutter.types.get(r.key).parts[0]) { p.geometry.computeBoundingBox(); b.union(p.geometry.boundingBox.clone().applyMatrix4(r.matrix)); }
  assert.ok(Math.abs(b.min.y - 9) < 0.03, 'asset rests on the original support pad');
  assert.ok(b.max.y <= 10.17 && b.max.y > 10, 'new tank fits the old roof fixture envelope');
});

test('parked helmets use the actual seat surface for both level shop-front bikes and sloping kerb bikes', () => {
  for (const pitch of [0, 0.25, -0.25]) {
    const ctx = createContext({ headless: true }), b = ctx.batch.builder('moto-support'), yaw = 0.7;
    moto({ ctx }, b, 11, 4, 23, yaw, pitch, { hex: 0x3a6a8a });
    const anchor = ctx.world.motoSeats[0];
    assert.equal(anchor.pitch, pitch);
    const helmet = clutterMatrix(anchor.x, anchor.y, anchor.z, anchor.yaw, [1, 1, 1], anchor.pitch);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(helmet), seat = b.accs.get('seat');
    // Read the REAL baked seat face, not a second prediction of the road gradient. Its upward face has four corners;
    // the recorded anchor must be at the face centre, and the helmet's support normal must agree with that face.
    const corners = [];
    const support = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
    for (let i = 0; i < seat.pos.length; i += 3) {
      const p = new THREE.Vector3(...seat.pos.slice(i, i + 3)), n = new THREE.Vector3(...seat.nor.slice(i, i + 3));
      if (n.dot(normal) > 0.999 && Math.abs(p.clone().sub(support).dot(normal)) < 1e-7 && p.distanceTo(support) < 0.34) corners.push(p);
    }
    assert.equal(corners.length, 4, 'the front seat top is present in the generated bike geometry');
    const centre = corners.reduce((v, p) => v.add(p), new THREE.Vector3()).multiplyScalar(0.25);
    assert.ok(centre.distanceTo(new THREE.Vector3(anchor.x, anchor.y, anchor.z)) < 1e-7, 'helmet sits on the real transformed seat');
  }
});

test('new ground clutter keeps full footprints clear of doors and nav lanes, and blank wall panels exclude all openings', async () => {
  const { ctx, plan } = await buildData({ furnish: false });
  await loaded(ctx);
  ctx.world = {};
  const occ = buildOccupancy(plan, ctx.buildings), K = makeKit(ctx, plan, occ);
  const stats = buildClutterDress(K), records = ctx.world.clutterPlacements;
  assert.ok(stats.ground >= 15, `${stats.ground} real placements exercise the clearance rule`);
  assert.ok(stats.ground <= 64, 'the generator has a fixed density ceiling');
  assert.ok(stats.plaza >= 2, 'a plaza actually receives props');
  const required = ['clutter_crate_wood', 'clutter_crate_plastic', 'clutter_bin_metal', 'clutter_tyre', 'clutter_cone', 'clutter_chair', 'clutter_sign', 'clutter_gas_cylinder'];
  assert.deepEqual(required.filter((key) => !records.some((r) => r.key === key)), []);
  for (const r of records.filter((p) => p.radius != null)) {
    assert.ok(r.navDistance >= r.radius + 0.62, `${r.key} at ${r.x},${r.z} keeps an NPC-sized clearance`);
    assert.ok(occ.clear(r.x, r.z, r.radius, OCC.LOT | OCC.CORE | OCC.STAIR | OCC.DOOR | OCC.STEEP));
  }
  for (const bp of ctx.buildings.values()) for (const panel of clutterFacadePanels(bp)) {
    const holes = bp.shell.walls.filter((w) => w.floor === 0 && w.side === 'front').flatMap((w) => w.openings);
    assert.ok(holes.every((h) => h.u1 <= panel.a || h.u0 >= panel.b), `${bp.id} panel does not cover a door/window`);
  }
  assert.equal(stats.decals, 24);
  assert.deepEqual(ctx.errors, []); assert.equal(ctx.matlib.missing.size, 0);
});

test('poster and graffiti UVs all stay inside separate atlas gutters', () => {
  const rects = Array.from({ length: 8 }, (_, i) => clutterDecalUV(i));
  assert.equal(new Set(rects.map((r) => r.join(','))).size, 8);
  for (const [u0, v0, u1, v1] of rects) assert.ok(u0 > 0 && v0 > 0 && u1 < 1 && v1 < 1 && u1 > u0 && v1 > v0);
  assert.throws(() => clutterDecalUV('not-a-tile'));
});
