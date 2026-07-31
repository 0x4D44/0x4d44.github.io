// ============================================================
// Iron Vertex — geometry plumbing shared by the park and the coaster.
//
// The park is a few thousand objects and the train is a few dozen, and
// on a weak GPU the number of DRAW CALLS matters more than the number of
// triangles. So anything that moves as one thing is merged into one
// geometry, and anything repeated is instanced.
//
// BufferGeometryUtils lives in three's examples, which are not vendored,
// so the merge is done here by hand. Each part carries its own colour,
// baked into a vertex attribute — that way a whole tree (brown trunk,
// green canopy) is a single instanced draw, and the per-instance colour
// is still free to tint the lot.
// ============================================================

import * as THREE from "./three.module.min.js";

export function mergeParts(parts) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const item of parts) {
    if (!item.geo.index) {
      const count = item.geo.attributes.position.count;
      item.geo.setIndex(Array.from({ length: count }, (_, i) => i));
    }
    vertexCount += item.geo.attributes.position.count;
    indexCount += item.geo.index.count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const color = new Float32Array(vertexCount * 3);
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  const normalMatrix = new THREE.Matrix3();
  const vertex = new THREE.Vector3();
  const tint = new THREE.Color();
  let vOffset = 0;
  let iOffset = 0;
  for (const item of parts) {
    const geo = item.geo;
    const matrix = item.matrix ?? new THREE.Matrix4();
    normalMatrix.getNormalMatrix(matrix);
    tint.set(item.color ?? 0xffffff);
    const src = geo.attributes.position;
    const srcNormal = geo.attributes.normal;
    for (let i = 0; i < src.count; i++) {
      const o = (vOffset + i) * 3;
      vertex.fromBufferAttribute(src, i).applyMatrix4(matrix);
      position[o] = vertex.x;
      position[o + 1] = vertex.y;
      position[o + 2] = vertex.z;
      vertex.fromBufferAttribute(srcNormal, i).applyMatrix3(normalMatrix).normalize();
      normal[o] = vertex.x;
      normal[o + 1] = vertex.y;
      normal[o + 2] = vertex.z;
      color[o] = tint.r;
      color[o + 1] = tint.g;
      color[o + 2] = tint.b;
    }
    for (let i = 0; i < geo.index.count; i++) index[iOffset + i] = geo.index.getX(i) + vOffset;
    vOffset += src.count;
    iOffset += geo.index.count;
    geo.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(color, 3));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}

// A positioned, scaled, rotated part for mergeParts.
export function part(geo, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(scale[0], scale[1] ?? scale[0], scale[2] ?? scale[0]),
  );
  return { geo, color, matrix };
}

export const vertexLit = (options) => new THREE.MeshLambertMaterial({ vertexColors: true, ...options });

export function instance(geo, material, placements, { shadows = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, placements.length));
  mesh.count = placements.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tint = new THREE.Color();
  placements.forEach((p, i) => {
    euler.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    quaternion.setFromEuler(euler);
    position.set(p.x, p.y, p.z);
    scale.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    if (p.color !== undefined) mesh.setColorAt(i, tint.set(p.color));
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// A texture painted on a canvas — no file to fetch, no origin to depend on.
export function canvasTexture(width, height, draw, repeat = [1, 1]) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
