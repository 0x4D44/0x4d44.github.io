// Optional wardrobe pose corrections. Nothing runs until WearLibrary installs an
// outfit. Original templates, bones, clips and resident buffers are never edited.
import * as THREE from 'three';
import {ClosedSurface, skinPositions, usedVertices, pushOutPose} from './wear_geometry.js';
import {preparePoseTarget} from './wear_pose.js';

const need = (ok, message) => { if (!ok) throw new Error('people wear correction: ' + message); };
const channels = ['getX', 'getY', 'getZ', 'getW'];

function attributeValues(attribute, width, ArrayType = Float64Array) {
  need(attribute && attribute.itemSize === width, `missing ${width}-component attribute`);
  const values = new ArrayType(attribute.count * width);
  for (let i = 0; i < attribute.count; i++) for (let k = 0; k < width; k++) {
    const value = attribute[channels[k]](i);
    need(Number.isFinite(value), 'non-finite decoded attribute');
    values[i * width + k] = value;
  }
  return values;
}

/** Creates private position/normal streams, retaining the original index, UV and
 * skin streams. Templates are never rendered, so these streams replace their GPU
 * allocation instead of adding another complete garment geometry. */
export function createWearCorrection(inst, fit, entries) {
  need(inst?.mesh?.isSkinnedMesh && fit?.body && fit.bodyLod, 'complete body and existing skeleton required');
  const attributes = new Map(), decoded = new Map(), surfaces = [], bodyPools = new Map(), garmentPools = new Map(), wrappers = new Set(), byEntry = new Map(), preparedTargets = new Map();
  // Derive the activation frame from immutable inverse binds, never from a live
  // bone matrix. Moving the resident or loading an outfit mid-animation cannot
  // change what the source rig considers forward thigh flexion.
  const sourceSkeleton = fit.body.skeleton;
  need(sourceSkeleton?.bones?.length === 21 && sourceSkeleton?.boneInverses?.length === 21, 'source rest skeleton required');
  const jointNames = sourceSkeleton.bones.map(bone => bone.name.replace(/_\d+$/, ''));
  const restWorldMatrices = sourceSkeleton.boneInverses.map(inverse => inverse.clone().invert());
  const prepareTarget = descriptor => {
    if (!descriptor) return undefined;
    if (!preparedTargets.has(descriptor)) preparedTargets.set(descriptor, preparePoseTarget(descriptor, jointNames, restWorldMatrices));
    return preparedTargets.get(descriptor);
  };
  const readGeometry = geometry => {
    if (decoded.has(geometry)) return decoded.get(geometry);
    const p = geometry.getAttribute('position'), j = geometry.getAttribute('skinIndex'), w = geometry.getAttribute('skinWeight');
    need(p && j && w && geometry.index, 'indexed, skinned geometry required');
    let rows = attributes.get(p); if (!rows) attributes.set(p, rows = []);
    let shared = rows.find(row => row.j === j && row.w === w);
    if (!shared) {
      shared = {j, w, attrs: {POSITION: attributeValues(p, 3, Float32Array), JOINTS_0: attributeValues(j, 4, Uint16Array), WEIGHTS_0: attributeValues(w, 4)}};
      rows.push(shared);
    }
    const d = {vertices: p.count, attrs: shared.attrs, indices: attributeValues(geometry.index, 1, Uint32Array), poseTarget: prepareTarget(geometry.userData?.poseTarget)};
    decoded.set(geometry, d); return d;
  };
  const proxy = fit.gltf.scene.getObjectByName(fit.info.proxyNode);
  need(proxy?.isSkinnedMesh, 'closed retained-head proxy required');
  for (const [mesh, componentKey] of [[fit.body, 'bodyComponents'], [fit.bodyLod, 'bodyFarComponents'], [proxy, 'proxyComponents']]) {
    const d = readGeometry(mesh.geometry), ranges = fit.info[componentKey] ?? mesh.userData.components ?? null;
    const surface = new ClosedSurface(d, ranges, mesh.name);
    let pool = bodyPools.get(d.attrs);
    if (!pool) bodyPools.set(d.attrs, pool = {d, used: new Set(), positions: new Float64Array(d.attrs.POSITION.length), surfaces: []});
    for (const vertex of usedVertices(d)) pool.used.add(vertex);
    pool.surfaces.push(surface); surfaces.push(surface);
  }
  for (const pool of bodyPools.values()) pool.used = Uint32Array.from(pool.used);

  const getPool = geometry => {
    const d = readGeometry(geometry);
    let pool = garmentPools.get(d.attrs);
    if (pool) {
      need(Boolean(pool.d.poseTarget) === Boolean(d.poseTarget) && (!d.poseTarget || pool.d.poseTarget.delta === d.poseTarget.delta), 'shared garment streams have conflicting CPU pose targets');
      return pool;
    }
    const bindPositions = new Float32Array(d.attrs.POSITION), normal = geometry.getAttribute('normal');
    need(normal && normal.count === d.vertices, 'garment normals required');
    const normalBytes = new Int8Array(d.vertices * 3), originalNormals = attributeValues(normal, 3, Float32Array);
    for (let i = 0; i < normalBytes.length; i++) normalBytes[i] = Math.max(-127, Math.min(127, Math.round(originalNormals[i] * 127)));
    pool = {d, used: new Set(), triangles: new Set(), triangleIndices: [], normalSums: new Float64Array(normalBytes.length),
      originalNormals, position: new THREE.BufferAttribute(bindPositions, 3).setUsage(THREE.DynamicDrawUsage),
      normal: new THREE.BufferAttribute(normalBytes, 3, true).setUsage(THREE.DynamicDrawUsage),
      out: {bindPositions, posedPositions: new Float64Array(bindPositions.length)}};
    garmentPools.set(d.attrs, pool); return pool;
  };
  const wrapGeometry = source => {
    const pool = getPool(source), d = readGeometry(source), geometry = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(source.attributes)) geometry.setAttribute(name, name === 'position' ? pool.position : name === 'normal' ? pool.normal : attr);
    geometry.setIndex(source.index);
    for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
    geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
    geometry.boundingBox = source.boundingBox?.clone() ?? null;
    geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
    for (const vertex of usedVertices(d)) pool.used.add(vertex);
    for (let i = 0; i < d.indices.length; i += 3) {
      const key = `${d.indices[i]},${d.indices[i + 1]},${d.indices[i + 2]}`;
      if (!pool.triangles.has(key)) { pool.triangles.add(key); pool.triangleIndices.push(d.indices[i], d.indices[i + 1], d.indices[i + 2]); }
    }
    wrappers.add(geometry); return geometry;
  };
  for (const entry of entries) byEntry.set(entry, {near: wrapGeometry(entry.source.near.geometry), far: wrapGeometry(entry.source.far.geometry)});
  for (const pool of garmentPools.values()) { pool.used = Uint32Array.from(pool.used); pool.triangleIndices = Uint32Array.from(pool.triangleIndices); delete pool.triangles; }

  // Effective matrices match SkinnedMesh.applyBoneTransform, including a moved or
  // rotated NPC root. Translation of the whole resident cannot change clearance.
  const matrices = inst.mesh.skeleton.bones.map(() => new Float64Array(16));
  const previous = new Float64Array(matrices.length * 16).fill(NaN), scratch = new THREE.Matrix4();
  let disposed = false, serial = 0, lastReport = null;
  const updateNormals = (pool, corrected) => {
    const normal = pool.normal.array;
    if (!corrected) {
      for (let i = 0; i < normal.length; i++) normal[i] = Math.max(-127, Math.min(127, Math.round(pool.originalNormals[i] * 127)));
    } else {
      const p = pool.position.array, sums = pool.normalSums, ix = pool.triangleIndices; sums.fill(0);
      for (let t = 0; t < ix.length; t += 3) {
        const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (let corner = 0; corner < 3; corner++) { const i = ix[t + corner] * 3; sums[i] += nx; sums[i + 1] += ny; sums[i + 2] += nz; }
      }
      for (let i = 0; i < normal.length; i += 3) {
        const length = Math.hypot(sums[i], sums[i + 1], sums[i + 2]);
        for (let k = 0; k < 3; k++) normal[i + k] = Math.max(-127, Math.min(127, Math.round((length > 1e-12 ? sums[i + k] / length : pool.originalNormals[i + k]) * 127)));
      }
    }
    pool.normal.needsUpdate = true;
  };
  return {
    geometry(entry, lod) { need(!disposed && byEntry.has(entry) && (lod === 0 || lod === 1), 'invalid live garment/LOD'); return byEntry.get(entry)[lod ? 'far' : 'near']; },
    get lastReport() { return lastReport; },
    update({force = false} = {}) {
      need(!disposed, 'correction has been disposed');
      // SkinnedMesh updates bindMatrixInverse in updateMatrixWorld(), not the
      // similarly named Object3D.updateWorldMatrix() path.
      inst.root.updateWorldMatrix(true, false); inst.root.updateMatrixWorld(true);
      const mesh = inst.mesh, skeleton = mesh.skeleton;
      let changed = force;
      for (let i = 0; i < matrices.length; i++) {
        scratch.multiplyMatrices(skeleton.bones[i].matrixWorld, skeleton.boneInverses[i]);
        scratch.premultiply(mesh.bindMatrixInverse); scratch.multiply(mesh.bindMatrix);
        const values = scratch.elements;
        for (let k = 0; k < 16; k++) {
          need(Number.isFinite(values[k]), 'invalid posed bone matrix');
          if (!Number.isFinite(previous[i * 16 + k]) || Math.abs(previous[i * 16 + k] - values[k]) > 1e-10) changed = true;
          matrices[i][k] = values[k];
        }
      }
      if (!changed) return lastReport;
      for (const pool of bodyPools.values()) {
        skinPositions(pool.d, matrices, pool.positions, pool.used);
        for (const surface of pool.surfaces) surface.pose(pool.positions);
      }
      const report = {serial: ++serial, correctedVertices: 0, checkedVertices: 0, maxPush: 0, maxBindPush: 0, targetWeight: 0, targetCount: 0, pushCount: 0};
      for (const pool of garmentPools.values()) {
        const result = pushOutPose(pool.d, matrices, surfaces, {used: pool.used, padding: 0.002, maxDistance: 0.18, out: pool.out});
        need(result.bindPositions === pool.position.array, 'correction replaced the live output stream');
        pool.position.needsUpdate = true; updateNormals(pool, result.count);
        report.correctedVertices += result.count; report.checkedVertices += pool.used.length;
        report.maxPush = Math.max(report.maxPush, result.maxPush); report.maxBindPush = Math.max(report.maxBindPush, result.maxBindPush);
        report.targetWeight = Math.max(report.targetWeight, result.targetWeight ?? 0);
        report.targetCount += result.targetCount ?? 0; report.pushCount += result.pushCount ?? result.count;
      }
      for (let i = 0; i < matrices.length; i++) previous.set(matrices[i], i * 16);
      lastReport = report; return report;
    },
    dispose() {
      if (disposed) return;
      for (const geometry of wrappers) {
        // WebGLGeometries deletes every attached attribute during disposal. Only
        // the position and normal streams belong to this live wardrobe instance.
        for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
        geometry.setIndex(null); geometry.dispose();
      }
      wrappers.clear(); byEntry.clear(); garmentPools.clear(); bodyPools.clear();
      attributes.clear(); decoded.clear(); preparedTargets.clear(); surfaces.length = 0; disposed = true;
    },
  };
}
