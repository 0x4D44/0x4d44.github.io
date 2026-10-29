// Static mesh merging (owner: A1). The procedural world leaves ONE mesh per (group, material): a building alone is ~20 of them, so the
// scene held ~1300 meshes and a frame paid ~1900 draw calls (every mesh again in the shadow pass). A browser frame pays for calls, not
// triangles, so once every module has flushed, this pass fuses all meshes that share a material (and shadow / sort flags) into a few
// spatially compact chunks. A recursive split on the longer axis (at the widest empty gap) keeps each chunk within `maxSpan` metres and
// `maxVerts` vertices (so 16-bit indices stay valid), which means frustum and shadow-frustum culling still reject whole neighbourhoods.
//
// Not merged (they stay exactly as their module made them):
//  * groups matching `skip` (default: `<id>.int`, which Visibility shows / hides per building and never lets cast),
//  * anything animated or parented elsewhere: door leaves are never in `Batcher.groups[].meshes`, and a mesh whose own matrix or whose
//    parent's world matrix is not the identity is left alone (batched geometry is authored in world space),
//  * skinned / instanced meshes, material arrays, indexless or multi-group geometry, extra attributes, `userData.noMerge`, hidden meshes.
// Pure planning (`planChunks`) is separate from the geometry work so it can be tested without a renderer.
import * as THREE from 'three';

export const MERGED_GROUP = 'merged';
// Measured on the 200 m barrio (RTX 5070 Ti, 1280x720, spawn view; chunks / calls incl. shadow pass / triangles / ms per frame):
//   none 1300 / 1932 / 1.02 M / ~13   48 m: 618 / 977 / 1.08 M / 10.9   64 m: 441 / 725 / 1.14 M / 8.0   96 m: 292 / 518 / 1.16 M / 6.9
//   128 m: 208 / 399 / 1.25 M / 6.9   200 m: 108 / 270 / 1.36 M / 5.4. Calls dominate the frame, triangles barely move: 96 m is the knee.
export const DEFAULT_SPAN = 96;
const ATTRS = ['position', 'normal', 'uv', 'color'];
const SIZE = { position: 3, normal: 3, uv: 2, color: 3 };
const IDENTITY = new THREE.Matrix4();
const now = () => (globalThis.performance?.now?.() ?? Date.now());

/**
 * Split `items` ({ x0, x1, z0, z1, cx, cz, v }) into chunks of at most `maxSpan` metres (both axes) and `maxVerts` vertices. Returns an array of
 * arrays covering every item exactly once. An item that already breaks a limit on its own (a world-sized street mesh) is its own chunk and does not
 * drag its neighbours into extra splits. The rest is split recursively on the longer axis: when the span is too wide, at the widest EMPTY gap between
 * items (so b1 and b2, 30 m apart, stay together and only the far b3 is cut off); when only the vertex budget is exceeded, at half the vertices.
 * Deterministic: ties fall back to the input order.
 */
export function planChunks(items, { maxSpan = DEFAULT_SPAN, maxVerts = 60000 } = {}) {
  const leaves = [], rest = [];
  items.forEach((it, i) => {
    if (it.x1 - it.x0 > maxSpan || it.z1 - it.z0 > maxSpan || it.v > maxVerts) leaves.push([it]); else rest.push([it, i]);
  });
  const rec = (list) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, v = 0;
    for (const [it] of list) {
      if (it.x0 < x0) x0 = it.x0; if (it.x1 > x1) x1 = it.x1;
      if (it.z0 < z0) z0 = it.z0; if (it.z1 > z1) z1 = it.z1;
      v += it.v;
    }
    const spanBad = x1 - x0 > maxSpan || z1 - z0 > maxSpan;
    if (list.length < 2 || (!spanBad && v <= maxVerts)) { leaves.push(list.map((e) => e[0])); return; }
    const alongX = (x1 - x0) >= (z1 - z0), c = alongX ? 'cx' : 'cz', lo = alongX ? 'x0' : 'z0', hi = alongX ? 'x1' : 'z1', n = list.length;
    list.sort((a, b) => (a[0][c] - b[0][c]) || (a[1] - b[1]));
    let cut = n >> 1;
    if (spanBad) {
      // gap before item i = (lowest lower edge from i on) - (highest upper edge before i): positive when the two sides do not overlap on the axis
      const suf = new Array(n); suf[n - 1] = list[n - 1][0][lo];
      for (let i = n - 2; i >= 0; i--) suf[i] = Math.min(list[i][0][lo], suf[i + 1]);
      let pre = list[0][0][hi], best = 0;
      for (let i = 1; i < n; i++) {
        const gap = suf[i] - pre;
        if (gap > best + 1e-9 || (gap > 0 && Math.abs(gap - best) <= 1e-9 && Math.abs(i - n / 2) < Math.abs(cut - n / 2))) { best = gap; cut = i; }
        if (list[i][0][hi] > pre) pre = list[i][0][hi];
      }
    } else {
      let acc = 0; cut = 1;
      for (let i = 0; i < n - 1; i++) { acc += list[i][0].v; if (acc >= v / 2) { cut = i + 1; break; } cut = i + 1; }
    }
    rec(list.slice(0, cut)); rec(list.slice(cut));
  };
  if (rest.length) rec(rest);
  return leaves;
}

/** A Batcher mesh that may be fused, as a planning item; null when it must stay as it is. */
function candidate(m, o) {
  if (!m?.isMesh || m.isSkinnedMesh || m.isInstancedMesh || m.visible === false || m.userData?.noMerge) return null;
  const mat = m.material, g = m.geometry;
  if (!mat || Array.isArray(mat) || !g?.index || g.groups?.length) return null;
  const names = Object.keys(g.attributes);
  if (names.length !== ATTRS.length) return null;                       // an extra attribute (skin weights, tangents) would be lost
  for (const a of ATTRS) {
    const at = g.attributes[a];
    if (!at || at.isInterleavedBufferAttribute || at.itemSize !== SIZE[a] || !(at.array instanceof Float32Array)) return null;
  }
  if (!m.matrix.equals(IDENTITY)) return null;
  if (m.parent) { m.parent.updateWorldMatrix(true, false); if (!m.parent.matrixWorld.equals(IDENTITY)) return null; }
  if (o.maxMeshVerts != null && g.attributes.position.count > o.maxMeshVerts) return null;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  if (b.isEmpty()) return null;
  return {
    m, x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z, cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2,
    v: g.attributes.position.count, key: `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.frustumCulled ? 1 : 0}`,
  };
}

/** Concatenate the geometries of `list` (planning items) into one indexed BufferGeometry. */
function fuse(list) {
  let nv = 0, ni = 0;
  for (const it of list) { const g = it.m.geometry; nv += g.attributes.position.count; ni += g.index.count; }
  const arrays = {};
  for (const a of ATTRS) arrays[a] = new Float32Array(nv * SIZE[a]);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const it of list) {
    const src = it.m.geometry, n = src.attributes.position.count;
    for (const a of ATTRS) {
      const arr = src.attributes[a].array, len = n * SIZE[a];
      arrays[a].set(arr.length === len ? arr : arr.subarray(0, len), vo * SIZE[a]);
    }
    const si = src.index.array, c = src.index.count;
    for (let k = 0; k < c; k++) idx[io + k] = si[k] + vo;
    vo += n; io += c;
  }
  const g = new THREE.BufferGeometry();
  for (const a of ATTRS) g.setAttribute(a, new THREE.BufferAttribute(arrays[a], SIZE[a]));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/**
 * Fuse the static meshes of every Batcher group (except `o.skip`) per material into spatial chunks, under the group `MERGED_GROUP`.
 * o: { maxSpan = DEFAULT_SPAN (m), maxVerts = 60000, skip = /\.int$/ }. Safe to call again: new meshes merge among themselves.
 * Returns { before, after, candidates, fused, removed, chunks, tris, ms }.
 */
export function mergeStatic(batch, o = {}) {
  const t0 = now(), skip = o.skip ?? /\.int$/, lim = { maxSpan: o.maxSpan ?? DEFAULT_SPAN, maxVerts: o.maxVerts ?? 60000 };
  const count = () => { let n = 0; for (const g of batch.groups.values()) n += g.meshes.length; return n; };
  const before = count();
  const buckets = new Map();
  let candidates = 0;
  for (const [id, g] of batch.groups) {
    if (id === MERGED_GROUP || skip.test(id)) continue;
    for (const m of g.meshes) {
      const it = candidate(m, lim);
      if (!it) continue;
      candidates++;
      let b = buckets.get(it.key); if (!b) buckets.set(it.key, b = []);
      b.push(it);
    }
  }
  const out = batch.group(MERGED_GROUP);
  const gone = new Set();
  let chunks = 0, fused = 0, tris = 0;
  for (const items of buckets.values()) {
    for (const leaf of planChunks(items, lim)) {
      if (leaf.length < 2) continue;
      const first = leaf[0].m, geo = fuse(leaf);
      const mesh = new THREE.Mesh(geo, first.material);
      mesh.name = `${MERGED_GROUP}:${first.userData.matKey ?? first.material.name ?? 'mat'}#${++chunks}`;
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.renderOrder = first.renderOrder; mesh.frustumCulled = first.frustumCulled;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.userData.matKey = first.userData.matKey; mesh.userData.groupId = MERGED_GROUP; mesh.userData.mergedFrom = leaf.length;
      out.obj.add(mesh); out.meshes.push(mesh);
      tris += geo.index.count / 3;
      for (const it of leaf) gone.add(it.m);
      fused += leaf.length;
    }
  }
  if (gone.size) {
    for (const [id, g] of batch.groups) {
      if (id === MERGED_GROUP) continue;
      g.meshes = g.meshes.filter((m) => !gone.has(m));
    }
    for (const m of gone) { m.removeFromParent(); m.geometry.dispose(); }
  }
  return { before, after: count(), candidates, fused, removed: gone.size, chunks, tris, ms: +(now() - t0).toFixed(1) };
}
