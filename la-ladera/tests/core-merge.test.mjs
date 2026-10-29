// Static mesh merging (js/core/merge.js, owner: A1): same-material meshes of nearby groups become one mesh with identical triangles; flags,
// `.int` groups, animated parts and the span / vertex limits are respected; nothing is duplicated or leaked.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-merge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Batcher } from '../js/core/mesh.js';
import { planChunks, mergeStatic, MERGED_GROUP } from '../js/core/merge.js';

function world() {
  const mats = new Map();
  const ctx = { scene: new THREE.Scene(), mat: (k) => { let m = mats.get(k); if (!m) mats.set(k, m = new THREE.MeshBasicMaterial({ name: k })); return m; } };
  return { ctx, batch: new Batcher(ctx) };
}
let colour = 1;
/** One 2 m box with its own vertex colour, so every box is distinguishable after a merge. */
const box = (batch, id, mat, x, z, grp) => batch.builder(id, grp).box(mat, x, 1, z, 2, 2, 2, { col: 0x010203 * (colour++ % 80) });
const meshCount = (scene) => { let n = 0; scene.traverse((o) => { if (o.isMesh) n++; }); return n; };

/** Every triangle as one string (position, normal, uv, colour of its 3 vertices): the multiset must survive a merge exactly. */
function triSigs(geo) {
  const a = geo.attributes, p = a.position.array, n = a.normal.array, u = a.uv.array, c = a.color.array, ix = geo.index.array;
  const v = (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2], n[3 * i], n[3 * i + 1], n[3 * i + 2], u[2 * i], u[2 * i + 1], c[3 * i], c[3 * i + 1], c[3 * i + 2]].map((x) => x.toFixed(4)).join(',');
  const out = [];
  for (let t = 0; t < ix.length; t += 3) out.push(`${v(ix[t])}|${v(ix[t + 1])}|${v(ix[t + 2])}`);
  return out;
}
/** Triangle signatures of every mesh in the scene, bucketed by material name + shadow flags. */
function buckets(scene, only) {
  const out = {};
  scene.traverse((o) => {
    if (!o.isMesh || (only && !only(o))) return;
    (out[`${o.material.name}|${+o.castShadow}${+o.receiveShadow}`] ??= []).push(...triSigs(o.geometry));
  });
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

// ---- planChunks (pure) ------------------------------------------------------------------------------------------------------------
function randomItems(n, seed = 7, world = 200, maxV = 3000) {
  let s = seed; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, i) => {
    const x = r() * world, z = r() * world, w = 1 + r() * 14, d = 1 + r() * 14;
    return { id: i, x0: x, x1: x + w, z0: z, z1: z + d, cx: x + w / 2, cz: z + d / 2, v: 24 + Math.floor(r() * maxV) };
  });
}

test('planChunks: every item lands in exactly one chunk, and every multi-item chunk obeys the span and vertex limits', () => {
  const items = randomItems(400), lim = { maxSpan: 64, maxVerts: 20000 };
  const leaves = planChunks(items, lim);
  const ids = leaves.flat().map((it) => it.id).sort((a, b) => a - b);
  assert.deepEqual(ids, items.map((it) => it.id), 'a partition: nothing lost, nothing twice');
  assert.ok(leaves.length > 8, `a 200 m world must split (${leaves.length} chunks)`);
  for (const leaf of leaves) {
    if (leaf.length < 2) continue;
    const x0 = Math.min(...leaf.map((i) => i.x0)), x1 = Math.max(...leaf.map((i) => i.x1)), z0 = Math.min(...leaf.map((i) => i.z0)), z1 = Math.max(...leaf.map((i) => i.z1));
    assert.ok(x1 - x0 <= lim.maxSpan && z1 - z0 <= lim.maxSpan, `chunk spans ${(x1 - x0).toFixed(1)} x ${(z1 - z0).toFixed(1)} m`);
    assert.ok(leaf.reduce((a, i) => a + i.v, 0) <= lim.maxVerts, 'chunk vertex count');
  }
});

test('planChunks: deterministic, and an item larger than the limits stays alone without blocking the rest', () => {
  const items = randomItems(120);
  assert.deepEqual(planChunks(items).map((l) => l.map((i) => i.id)), planChunks(items.slice()).map((l) => l.map((i) => i.id)));
  const big = { id: 999, x0: 0, x1: 190, z0: 0, z1: 190, cx: 95, cz: 95, v: 90000 };
  const leaves = planChunks([...items, big], { maxSpan: 64, maxVerts: 60000 });
  const home = leaves.find((l) => l.includes(big));
  assert.deepEqual(home.map((i) => i.id), [999], 'the oversize item is its own chunk');
  assert.equal(leaves.flat().length, items.length + 1);
  // a world-sized mesh overlaps everything: it must not stop a tight cluster next to it from staying one chunk
  const at = (id, x) => ({ id, x0: x - 1, x1: x + 1, z0: 0, z1: 2, cx: x, cz: 1, v: 24 });
  const wide = { id: 'street', x0: -50, x1: 150, z0: 0, z1: 2, cx: 50, cz: 1, v: 24 };
  const cluster = planChunks([wide, at(1, 10), at(2, 14), at(3, 18), at(4, 22), at(5, 26)], { maxSpan: 64 });
  assert.equal(cluster.length, 2, cluster.map((l) => l.map((i) => i.id).join('+')).join(' | '));
});

test('planChunks: a wide span is cut at the widest empty gap, so near neighbours stay together and only the far outlier splits off', () => {
  const at = (id, x) => ({ id, x0: x - 1, x1: x + 1, z0: -1, z1: 1, cx: x, cz: 0, v: 24 });
  const leaves = planChunks([at('b1', 0), at('b2', 30), at('b3', 150)], { maxSpan: 64 }).map((l) => l.map((i) => i.id).sort());
  assert.deepEqual(leaves.sort(), [['b1', 'b2'], ['b3']]);
  const rows = [at('a', 0), at('b', 10), at('c', 20), at('d', 100), at('e', 110), at('f', 120)];
  assert.deepEqual(planChunks(rows, { maxSpan: 64 }).map((l) => l.map((i) => i.id).sort()).sort(), [['a', 'b', 'c'], ['d', 'e', 'f']], 'two villages 80 m apart');
  // a median cut would split the five-house village 3 | 2 + outlier; the gap cut keeps it whole
  const village5 = [at('a', 0), at('b', 10), at('c', 20), at('d', 30), at('e', 40), at('far', 150)];
  assert.deepEqual(planChunks(village5, { maxSpan: 64 }).map((l) => l.map((i) => i.id).sort()).sort(), [['a', 'b', 'c', 'd', 'e'], ['far']]);
});

test('planChunks: only the vertex budget exceeded splits by vertices, not by gaps', () => {
  const at = (id, x, v) => ({ id, x0: x - 1, x1: x + 1, z0: -1, z1: 1, cx: x, cz: 0, v });
  const leaves = planChunks([at(1, 0, 40000), at(2, 3, 40000), at(3, 6, 40000), at(4, 9, 40000)], { maxSpan: 1000, maxVerts: 90000 });
  assert.deepEqual(leaves.map((l) => l.map((i) => i.id)), [[1, 2], [3, 4]], 'each chunk holds 80000 vertices');
});

// ---- mergeStatic on a real Batcher ------------------------------------------------------------------------------------------------
function village() {
  const { ctx, batch } = world();
  for (const [id, x] of [['b1.ext', 0], ['b2.ext', 30], ['b3.ext', 150]]) { box(batch, id, 'wall', x, 0); box(batch, id, 'roof', x, 0); }
  box(batch, 'b1.int', 'wall', 5, 0);                                   // interior: visibility-managed, never merged
  box(batch, 'world.streets', 'wall', 10, 0, { cast: false });          // same material, different shadow flag: never fused with the walls
  batch.flushAll();
  return { ctx, batch };
}

test('mergeStatic fuses same-material meshes of nearby groups; a far group and other materials stay apart', () => {
  const { ctx, batch } = village();
  assert.equal(meshCount(ctx.scene), 8, '3 buildings x 2 materials + 1 interior + 1 street');
  const r = batch.mergeStatic({ maxSpan: 64 });
  const merged = batch.groups.get(MERGED_GROUP).meshes;
  assert.deepEqual(merged.map((m) => [m.userData.matKey, m.userData.mergedFrom]).sort(), [['roof', 2], ['wall', 2]], 'wall and roof of b1 + b2 only');
  assert.equal(r.fused, 4); assert.equal(r.chunks, 2);
  assert.equal(meshCount(ctx.scene), 6, '8 - 4 fused + 2 merged');
  assert.equal(batch.stats().meshes, 6, 'Batcher bookkeeping matches the scene');
  assert.equal(batch.groups.get('b3.ext').meshes.length, 2, 'b3 is 150 m away: untouched');
  assert.equal(batch.groups.get('world.streets').meshes.length, 1, 'cast:false wall must not join the cast:true walls');
});

test('mergeStatic leaves `.int` groups and their meshes exactly as they were', () => {
  const { batch } = world();
  box(batch, 'b1.ext', 'wall', 0, 0); box(batch, 'b2.ext', 'wall', 10, 0); box(batch, 'b1.int', 'wall', 5, 0); box(batch, 'b2.int', 'wall', 12, 0);
  batch.flushAll();
  const ints = [...batch.groups.get('b1.int').meshes, ...batch.groups.get('b2.int').meshes];
  batch.mergeStatic();
  assert.deepEqual([...batch.groups.get('b1.int').meshes, ...batch.groups.get('b2.int').meshes], ints);
  for (const m of ints) assert.equal(m.parent, batch.groups.get(m.userData.groupId).obj, 'still parented to its own group');
});

test('mergeStatic keeps every triangle: position, normal, uv and colour per vertex, per material and flag bucket', () => {
  const { ctx, batch } = village();
  const before = buckets(ctx.scene);
  batch.mergeStatic({ maxSpan: 64 });
  assert.deepEqual(buckets(ctx.scene), before);
});

test('mergeStatic respects maxVerts and switches to 32-bit indices only when a chunk really needs them', () => {
  const { ctx, batch } = world();
  for (let i = 0; i < 10; i++) box(batch, `b${i}.ext`, 'wall', i, 0);          // 24 vertices each
  batch.flushAll();
  batch.mergeStatic({ maxVerts: 50 });
  const ms = batch.groups.get(MERGED_GROUP).meshes;
  assert.ok(ms.length >= 4 && ms.every((m) => m.geometry.attributes.position.count <= 50), ms.map((m) => m.geometry.attributes.position.count).join(','));
  let tris = 0; ctx.scene.traverse((o) => { if (o.isMesh) tris += o.geometry.index.count / 3; });
  assert.equal(tris, 10 * 12, 'every box survives, fused or alone');

  const big = world();
  for (let i = 0; i < 3000; i++) box(big.batch, `b${i % 7}.ext`, 'wall', (i % 50) * 0.01, 0);
  big.batch.flushAll();
  big.batch.mergeStatic({ maxVerts: 1e9, maxSpan: 1e9 });
  const m = big.batch.groups.get(MERGED_GROUP).meshes[0];
  assert.equal(big.batch.groups.get(MERGED_GROUP).meshes.length, 1);
  assert.ok(m.geometry.attributes.position.count > 65535, 'over the 16-bit limit');
  assert.ok(m.geometry.index.array instanceof Uint32Array, '32-bit indices');
  let max = 0; for (const i of m.geometry.index.array) if (i > max) max = i;
  assert.equal(max, m.geometry.attributes.position.count - 1, 'indices cover exactly the vertex range');
});

test('mergeStatic leaves animated or special meshes alone: moved matrix, noMerge, hidden, transform on the parent', () => {
  const { ctx, batch } = world();
  for (const id of ['a.ext', 'b.ext', 'c.ext', 'd.ext', 'e.ext', 'f.ext']) box(batch, id, 'wall', 0, 0);
  batch.flushAll();
  const [a, b, c, d, e, f] = ['a.ext', 'b.ext', 'c.ext', 'd.ext', 'e.ext', 'f.ext'].map((id) => batch.groups.get(id).meshes[0]);
  a.position.x = 3; a.updateMatrix();                                   // a leaf swinging on a hinge would look like this
  b.userData.noMerge = true;
  c.visible = false;
  batch.groups.get('d.ext').obj.position.set(5, 0, 0); batch.groups.get('d.ext').obj.updateMatrixWorld(true);
  const r = batch.mergeStatic();
  assert.equal(r.fused, 2, 'only e and f are plain');
  for (const m of [a, b, c, d]) assert.ok(m.parent, 'untouched mesh is still in the scene');
  assert.equal(batch.groups.get(MERGED_GROUP).meshes.length, 1);
  assert.equal(meshCount(ctx.scene), 5);
  assert.equal(e.parent, null); assert.equal(f.parent, null);
});

test('mergeStatic is idempotent and disposes the geometry it replaced, only that', () => {
  const { ctx, batch } = village();
  const disposed = new Set();
  const watch = (m) => m.geometry.addEventListener('dispose', () => disposed.add(m));
  for (const g of batch.groups.values()) g.meshes.forEach(watch);
  const first = batch.mergeStatic({ maxSpan: 64 });
  assert.equal(disposed.size, first.removed);
  const n = meshCount(ctx.scene), sigs = buckets(ctx.scene);
  const second = batch.mergeStatic({ maxSpan: 64 });
  assert.equal(second.fused, 0, 'nothing left to fuse');
  assert.equal(meshCount(ctx.scene), n);
  assert.deepEqual(buckets(ctx.scene), sigs);
  assert.equal(disposed.size, first.removed, 'the second pass disposes nothing');
});
