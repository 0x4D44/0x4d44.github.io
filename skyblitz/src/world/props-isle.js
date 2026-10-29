// Island dressing geometry for the tropical course: huts, jetties, boats, flowers, coral, glow crystals, stalactites.
// Each builder returns one merged, vertex-coloured BufferGeometry (draw with InstancedMesh via props.js `instanced`). Owner: world agent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function part(geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); g.applyMatrix4(_m);
  const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const box = new THREE.BoxGeometry(1, 1, 1), cone = new THREE.ConeGeometry(1, 1, 8, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1), ico = new THREE.IcosahedronGeometry(1, 1), oct = new THREE.OctahedronGeometry(1, 0);
const merge = (list) => { const g = mergeGeometries(list, false); list.forEach((x) => x.dispose()); g.computeVertexNormals(); return g; };

/** Thatched beach hut on stilts, ~7 m wide. */
export function makeHutGeometry() {
  return merge([
    part(box, 0xb98a5a, 0, 2.6, 0, 6, 3.2, 5.2), part(cone, 0xd8b45a, 0, 6.2, 0, 5.4, 3.2, 5.2, 0, Math.PI / 4, 0),
    part(box, 0x6b4a2e, 0, 3.0, 2.64, 1.4, 2.2, 0.3), part(box, 0x8a5a36, 0, 0.9, 0, 6.6, 0.3, 5.8),
    part(cyl, 0x6b4a2e, -2.8, 0.4, -2.3, 0.28, 1.6, 0.28), part(cyl, 0x6b4a2e, 2.8, 0.4, -2.3, 0.28, 1.6, 0.28), part(cyl, 0x6b4a2e, -2.8, 0.4, 2.3, 0.28, 1.6, 0.28), part(cyl, 0x6b4a2e, 2.8, 0.4, 2.3, 0.28, 1.6, 0.28),
  ]);
}
/** Wooden jetty 30 m long along +Z with piles and a small end platform. */
export function makeJettyGeometry() {
  const l = [part(box, 0xa8794a, 0, 1.2, 15, 3.2, 0.35, 30), part(box, 0x9a6c40, 0, 1.2, 31.5, 8, 0.4, 5)];
  for (let i = 0; i <= 5; i++) { l.push(part(cyl, 0x4d3520, -1.5, -1.5, i * 6, 0.22, 4.6, 0.22), part(cyl, 0x4d3520, 1.5, -1.5, i * 6, 0.22, 4.6, 0.22)); }
  return merge(l);
}
/** Little fishing boat ~12 m with a cabin and mast, floating at y=0. */
export function makeBoatGeometry() {
  return merge([
    part(box, 0xf2efe6, 0, 0.7, 0, 3.4, 1.5, 11), part(cone, 0xf2efe6, 0, 0.7, -6.4, 1.7, 3.0, 1.7, -Math.PI / 2, 0, 0),
    part(box, 0xd8453a, 0, 1.5, 0, 3.5, 0.45, 11.1), part(box, 0xf6f1de, 0, 2.7, 0.6, 2.4, 1.8, 3.2), part(box, 0x2b4f7a, 0, 3.0, 2.25, 2.0, 0.7, 0.1),
    part(cyl, 0x6b4a2e, 0, 4.8, -1.2, 0.12, 5.5, 0.12), part(box, 0xffd85a, 0.0, 6.2, -1.2, 0.05, 1.6, 2.2),
  ]);
}
/** Flower clump: stalks with bright heads (random hues via vertex colour, instanced with no per-instance colour). */
export function makeFlowerGeometry() {
  const cols = [0xff5a7a, 0xffd23a, 0xff8a3a, 0xf06aff, 0xffffff, 0x6ad0ff], l = [part(ico, 0x2f8a3a, 0, 0.35, 0, 0.9, 0.35, 0.9)];
  for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 0.5 + (i % 3) * 0.35; l.push(part(ico, cols[(i * 5) % cols.length], Math.cos(a) * r, 0.7 + (i % 2) * 0.25, Math.sin(a) * r, 0.34, 0.34, 0.34)); }
  return merge(l);
}
/** Coral head: lumpy cluster of cones + domes in pink / orange / purple. */
export function makeCoralGeometry() {
  const cols = [0xff6f8a, 0xff9a4a, 0xb06aff, 0xffd06a, 0x4ad8c0], l = [];
  for (let i = 0; i < 9; i++) { const a = i * 2.1, r = 0.4 + (i % 4) * 0.5, h = 0.9 + (i % 3) * 0.7; l.push(part(cone, cols[i % cols.length], Math.cos(a) * r, h * 0.5, Math.sin(a) * r, 0.34 + (i % 2) * 0.15, h, 0.34 + (i % 2) * 0.15, (Math.cos(a) * 0.2), 0, (Math.sin(a) * 0.2))); }
  l.push(part(ico, 0xff7e9a, 0, 0.5, 0, 1.4, 0.8, 1.4));
  return merge(l);
}
/** Glowing crystal cluster (cave): a few long octahedra. Use with an emissive vertex-colour material. */
export function makeCrystalGeometry() {
  const cols = [0x7af0ff, 0x9a8aff, 0xff8aeb, 0x6affc8], l = [];
  for (let i = 0; i < 6; i++) { const a = i * 1.7, r = 0.6 + (i % 3) * 0.7, h = 2.2 + (i % 4) * 1.5; l.push(part(oct, cols[i % cols.length], Math.cos(a) * r, h * 0.45, Math.sin(a) * r, 0.7, h, 0.7, Math.sin(a) * 0.25, a, Math.cos(a) * 0.25)); }
  return merge(l);
}
/** Stalactite / hanging rock spike (tip down at y=0, base up at y=+1 scaled). */
export function makeStalactiteGeometry() {
  return merge([part(cone, 0x8a8078, 0, 0.5, 0, 0.5, 1, 0.5, Math.PI, 0, 0), part(cone, 0x6c635c, 0.35, 0.35, 0.1, 0.3, 0.7, 0.3, Math.PI, 0, 0)]);
}
/** Anchored buoy: red/white float + light, y=0 at the waterline. */
export function makeBuoyGeometry() {
  return merge([part(cyl, 0xe84a3a, 0, 0.6, 0, 0.9, 1.2, 0.9), part(cyl, 0xffffff, 0, 1.5, 0, 0.8, 0.6, 0.8), part(cone, 0xe84a3a, 0, 2.6, 0, 0.5, 1.6, 0.5), part(ico, 0xffe08a, 0, 3.5, 0, 0.35, 0.35, 0.35)]);
}
