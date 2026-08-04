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
  const glow = new Float32Array(vertexCount);
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
    const partGlow = item.glow ?? 0;
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
      glow[vOffset + i] = partGlow;
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
  merged.setAttribute("glow", new THREE.BufferAttribute(glow, 1));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}

// A positioned, scaled, rotated part for mergeParts.
// `glow` marks a part as a light source at night: 0 for everything that
// merely reflects, and a value in (0, 1] for anything that is lit from
// inside — a window, a lamp, a headlight. The value doubles as a random
// seed, so two windows in the same merged geometry can be on at
// different brightnesses and flicker out of step without needing a
// second attribute to carry it.
export function part(geo, color, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], glow = 0) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(scale[0], scale[1] ?? scale[0], scale[2] ?? scale[0]),
  );
  return { geo, color, matrix, glow };
}

export const vertexLit = (options) => new THREE.MeshLambertMaterial({ vertexColors: true, ...options });

// ------------------------------------------------------------
// Night
//
// One uniform, shared by every material that can light up, so the whole
// world turns on together. Three.js lights are per-fragment and there
// are several hundred lit things in a city — a real light for each would
// be the end of the frame rate. These are emissive surfaces instead:
// they glow, they do not illuminate, and nothing in a low-poly city at
// night looks wrong for the difference.
// ------------------------------------------------------------

export const NIGHT = { value: 0 };     // 0 by day, 1 after dark
export const NIGHT_TIME = { value: 0 };  // seconds, for the flicker

// A vertex-lit material whose `glow` parts come on at night.
//
// The value in the attribute is used twice: as a mask (zero means this
// surface is not a light) and as a hash, so windows in one merged
// building light at different brightnesses and drift out of phase with
// each other rather than pulsing as one.
export function glowLit(options) {
  const material = vertexLit(options);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = NIGHT;
    shader.uniforms.uGlowTime = NIGHT_TIME;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float glow;
        varying float vGlow;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vGlow = glow;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uNight;
        uniform float uGlowTime;
        varying float vGlow;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        if (vGlow > 0.001 && uNight > 0.001) {
          float hash = fract(vGlow * 43.758);
          // Rather less than half are lit. An office block with every
          // window on reads as a rendering; the dark ones are what make
          // the lit ones look like windows.
          float out_ = step(0.55, fract(vGlow * 91.37));
          float breathe = 0.88 + 0.12 * sin(uGlowTime * 0.9 + hash * 39.0);
          vec3 lamp = mix(vec3(1.0, 0.86, 0.62), diffuseColor.rgb * 1.6, 0.35);
          // Kept well under 1. Tone mapping is applied after this, and
          // anything near unit brightness clips to flat white — the
          // first pass at these numbers turned every lit floor into a
          // strip light and every building into a bar of neon.
          totalEmissiveRadiance += lamp * out_ * breathe * uNight * (0.10 + hash * 0.20);
        }`);
  };
  // Two materials that compile to different programs must not be shared,
  // and three keys off this string when it decides.
  material.customProgramCacheKey = () => "glowLit";
  return material;
}

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

// ------------------------------------------------------------
// Cutting a tunnel through a solid.
//
// A tube drawn INSIDE a closed hill is not a tunnel: the bore is hidden
// in solid geometry and riding in punches straight through the green
// skin. There is no CSG here to subtract one from the other, so the hole
// is cut by hand — throw away every triangle whose centroid lies within
// `radius` of the path, and return the shell that is left. Give the
// result a DoubleSide material: it is open at both ends now, and the
// inside face has to be drawn or the hill vanishes from within.
//
// `path` is an array of {x, y, z} in the SAME space as the geometry, so
// build the geometry in world space before calling this.
// ------------------------------------------------------------

const segA = new THREE.Vector3();
const segB = new THREE.Vector3();
const segAB = new THREE.Vector3();
const segAP = new THREE.Vector3();

export function distanceToPath(point, path) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    segA.set(path[i].x, path[i].y, path[i].z);
    segB.set(path[i + 1].x, path[i + 1].y, path[i + 1].z);
    segAB.subVectors(segB, segA);
    segAP.subVectors(point, segA);
    const lengthSq = segAB.lengthSq();
    const t = lengthSq > 1e-9
      ? Math.min(1, Math.max(0, segAP.dot(segAB) / lengthSq))
      : 0;
    const d = segAP.addScaledVector(segAB, -t).length();
    if (d < best) best = d;
  }
  return best;
}

export function carveTube(geometry, path, radius) {
  // Triangle soup, because a shared vertex cannot belong to both a kept
  // and a discarded face.
  const solid = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = solid.attributes.position;
  const kept = [];
  const corner = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  for (let t = 0; t + 2 < position.count; t += 3) {
    centroid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centroid.add(corner.fromBufferAttribute(position, t + k));
    centroid.multiplyScalar(1 / 3);
    if (distanceToPath(centroid, path) <= radius) continue;
    for (let k = 0; k < 3; k++) {
      corner.fromBufferAttribute(position, t + k);
      kept.push(corner.x, corner.y, corner.z);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  shell.computeVertexNormals();
  shell.computeBoundingSphere();
  if (solid !== geometry) solid.dispose();
  return shell;
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
