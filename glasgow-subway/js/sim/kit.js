// Helpers to reuse models/station_kit.glb and models/people.glb: instancing of kit items, merged person geometries.
export function kitParts(THREE, tpl, name) {
  if (!tpl) return null;
  tpl.updateMatrixWorld(true);
  const node = tpl.getObjectByName(name); if (!node) return null;
  const parts = [];
  node.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.material, mtx: o.matrixWorld.clone() }); });
  return parts.length ? parts : null;
}

/** one InstancedMesh per material part; matrices: array of THREE.Matrix4 (item placement) */
export function instanceKit(THREE, parts, matrices, parent, opts = {}) {
  if (!parts || !matrices.length) return [];
  const out = [], tmp = new THREE.Matrix4();
  for (const p of parts) {
    const mat = opts.material ? opts.material(p.mat) || p.mat : p.mat;
    const im = new THREE.InstancedMesh(p.geo, mat, matrices.length);
    matrices.forEach((m, i) => { tmp.multiplyMatrices(m, p.mtx); im.setMatrixAt(i, tmp); });
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; parent.add(im); out.push(im);
  }
  return out;
}

export function placeMatrix(THREE, x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0));
  return m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

/** Merge each person_N into one vertex-coloured geometry (flat colours baked from materials). */
export function peopleVariants(THREE, tpl) {
  if (!tpl) return null;
  tpl.updateMatrixWorld(true);
  const out = [];
  for (let i = 0; i < 5; i++) {
    const node = tpl.getObjectByName('person_' + i); if (!node) continue;
    const P = [], N = [], C = [], I = [];
    const v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3(), col = new THREE.Color();
    node.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal; nm.getNormalMatrix(o.matrixWorld);
      const base = P.length / 3; col.copy(o.material.color || col.set(0x888888));
      for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z); if (nor) nv.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize(); else nv.set(0, 1, 0); N.push(nv.x, nv.y, nv.z); C.push(col.r, col.g, col.b); }
      if (g.index) for (let k = 0; k < g.index.count; k++) I.push(base + g.index.getX(k)); else for (let k = 0; k < pos.count; k++) I.push(base + k);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
    out.push(g);
  }
  return out.length ? out : null;
}
