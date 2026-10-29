// Procedural prop geometry + instancing helpers shared by the courses (palms, boulders, spires, balloons, lighthouse, rock arch, birds).
// Everything is built from code (no model files), merged per prop and drawn with InstancedMesh. Owner: world agent.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../util.js';

function colorize(geo, c) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  const col = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
function strip(geo) { geo.deleteAttribute('uv'); return geo; }

/** Palm tree ~16 m tall: curved tapered trunk + drooping fronds. ~200 triangles. */
export function makePalmGeometry() {
  const parts = [];
  const trunkPts = []; const H = 15, bend = 3.2;
  for (let i = 0; i <= 7; i++) { const t = i / 7; trunkPts.push(new THREE.Vector3(bend * t * t, H * t, 0)); }
  // trunk as stacked rings
  const rings = 8, sides = 6, pos = [], idx = [], col = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, c = trunkPts[i], r = 0.55 - 0.22 * t;
    for (let s = 0; s < sides; s++) { const a = (s / sides) * Math.PI * 2; pos.push(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r); const k = 0.5 + 0.1 * ((i + s) % 2); col.push(0.42 * k * 1.6, 0.30 * k * 1.6, 0.2 * k * 1.6); }
  }
  for (let i = 0; i < 7; i++) for (let s = 0; s < sides; s++) { const a = i * sides + s, b = i * sides + ((s + 1) % sides), c = a + sides, d = b + sides; idx.push(a, c, b, b, c, d); }
  void rings;
  const trunk = new THREE.BufferGeometry(); trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); trunk.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); trunk.setIndex(idx);
  parts.push(trunk.toNonIndexed());
  // fronds
  const top = trunkPts[7];
  for (let f = 0; f < 8; f++) {
    const yaw = (f / 8) * Math.PI * 2 + (f % 2) * 0.2, len = 7.5 + (f % 3) * 0.8, seg = 5;
    const fp = [], fi = [], fc = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, w = 1.25 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)) * (1 - 0.4 * t);
      const x = t * len, y = 1.6 * Math.sin(t * 2.1) - 3.6 * t * t;
      fp.push(x, y, -w, x, y + 0.15, w);
      const g = 0.55 + 0.35 * (1 - t); fc.push(0.22 * g, 0.6 * g, 0.18 * g, 0.22 * g, 0.6 * g, 0.18 * g);
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3)); g.setIndex(fi);
    g.rotateY(yaw); g.translate(top.x, top.y, top.z); parts.push(g.toNonIndexed());
  }
  const m = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }), false);
  parts.forEach((p) => p.dispose());
  m.computeVertexNormals();
  return m;
}

const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
/** Boulder / spire: displaced icosphere. sx,sy,sz stretch it; flat underside. Vertex-coloured. */
export function makeRockGeometry({ seed = 1, detail = 2, stretch = [1, 1, 1], rough = 0.3, color = 0x8a8078, color2 = 0x6c635c } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail); strip(g); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, c1 = new THREE.Color(color), c2 = new THREE.Color(color2), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = hash3(Math.round(x * 3) + seed, Math.round(y * 3), Math.round(z * 3)) * 0.5 + hash3(Math.round(x * 6) + seed, Math.round(y * 6), Math.round(z * 6)) * 0.25 + Math.sin(x * 3 + seed) * Math.cos(z * 2.3 + seed * 1.7) * 0.25;
    const r = 1 + (n - 0.5) * rough * 2;
    x *= r * stretch[0]; y *= r * stretch[1]; z *= r * stretch[2];
    if (y < -0.2 * stretch[1]) y = -0.2 * stretch[1] + (y + 0.2 * stretch[1]) * 0.3;
    p.setXYZ(i, x, y, z);
    const k = Math.min(1, Math.max(0, 0.5 + y / (2 * stretch[1]) + (n - 0.5) * 0.6));
    const c = c2.clone().lerp(c1, k); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

/** Instance helper: list of {pos, yaw, scale (number|Vector3), tilt?} */
export function instanced(geo, mat, list, { cast = false, receive = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  list.forEach((o, i) => {
    e.set(o.tx ?? 0, o.yaw ?? 0, o.tz ?? 0); q.setFromEuler(e);
    if (typeof o.scale === 'number') s.setScalar(o.scale); else s.copy(o.scale);
    im.setMatrixAt(i, m.compose(o.pos, q, s));
  });
  im.instanceMatrix.needsUpdate = true; im.castShadow = cast; im.receiveShadow = receive; im.frustumCulled = false;
  return im;
}

/** Scatter points near the route: returns [{x,z,s,lat}] with lateral offset in [minLat, maxLat] beyond the corridor, deterministic. */
export function scatterAlongPath(course, { count, minLat = 10, maxLat = 400, seed = 7, accept }) {
  const rnd = mulberry32(seed), f = {}, out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 25) {
    const s = rnd() * course.length; course.frameAt(s, f);
    const side = rnd() < 0.5 ? -1 : 1, lat = side * (f.halfWidth + minLat + Math.pow(rnd(), 1.6) * (maxLat - minLat));
    const x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat;
    const h = course.groundHeight(x, z);
    if (accept && !accept(x, z, h, f, rnd)) continue;
    out.push({ x, z, y: h, s, lat, r: rnd() });
  }
  return out;
}

/** Hot-air balloon: envelope (striped), basket, ropes. Returns a merged vertex-coloured geometry, ~20 m tall. */
export function makeBalloonGeometry() {
  const env = new THREE.SphereGeometry(1, 20, 14); strip(env); env.scale(1, 1.25, 1);
  const p = env.attributes.position, col = new Float32Array(p.count * 3), stripes = [new THREE.Color(0xff4b3a), new THREE.Color(0xfff2c4), new THREE.Color(0x2fb7ff), new THREE.Color(0xffc233)];
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const c = stripes[Math.floor(((a / Math.PI + 1) * 6)) % 4]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  env.setAttribute('color', new THREE.BufferAttribute(col, 3));
  env.scale(7, 7, 7); env.translate(0, 13, 0);
  const basket = colorize(strip(new THREE.BoxGeometry(2.4, 1.8, 2.4)), 0x8a5a2b); basket.translate(0, 1, 0);
  const rope = colorize(strip(new THREE.CylinderGeometry(0.05, 3.2, 6, 6, 1, true)), 0x4a3a2a); rope.translate(0, 5, 0);
  const g = mergeGeometries([env, basket, rope].map((x) => (x.index ? x.toNonIndexed() : x)), false);
  [env, basket, rope].forEach((x) => x.dispose());
  return g;
}

/** Lighthouse: white tower with red bands, gallery, lantern (emissive material separate) and a conical roof. */
export function makeLighthouse(height = 190) {
  const g = new THREE.Group(); const disposables = [];
  const bands = 7, parts = [];
  for (let i = 0; i < bands; i++) {
    const h0 = (i / bands) * height, h1 = ((i + 1) / bands) * height;
    const r0 = 11 - 5 * (h0 / height), r1 = 11 - 5 * (h1 / height);
    const geo = colorize(strip(new THREE.CylinderGeometry(r1, r0, h1 - h0, 20, 1, true)), i % 2 ? 0xd8362a : 0xf6f2ea); geo.translate(0, (h0 + h1) / 2, 0); parts.push(geo.toNonIndexed());
  }
  const gal = colorize(strip(new THREE.CylinderGeometry(9.5, 9.5, 2, 20)), 0x2f3640); gal.translate(0, height + 1, 0); parts.push(gal.toNonIndexed());
  const roof = colorize(strip(new THREE.ConeGeometry(7, 7, 20)), 0xd8362a); roof.translate(0, height + 11, 0); parts.push(roof.toNonIndexed());
  const body = mergeGeometries(parts, false); parts.forEach((p) => p.dispose()); disposables.push(body);
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }); disposables.push(bodyMat);
  const mesh = new THREE.Mesh(body, bodyMat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  const lanternGeo = new THREE.CylinderGeometry(5, 5, 7, 16); const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 2.5), toneMapped: false }); disposables.push(lanternGeo, lanternMat);
  const lantern = new THREE.Mesh(lanternGeo, lanternMat); lantern.position.y = height + 5.5; g.add(lantern);
  // rotating beam: two additive cones
  const beamGeo = new THREE.ConeGeometry(14, 260, 20, 1, true); beamGeo.rotateZ(-Math.PI / 2); beamGeo.translate(130, 0, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.2, 0.6), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  disposables.push(beamGeo, beamMat);
  const beams = new THREE.Group(); beams.position.y = height + 5.5;
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI; beams.add(b1, b2); g.add(beams);
  return { group: g, beams, dispose() { disposables.forEach((d) => d.dispose()); } };
}

/** A natural rock arch as an arc of displaced torus: spans the route between two pillars. */
export function makeRockArch({ radius = 100, tube = 22, seed = 3, color = 0x9a8f86, color2 = 0x6f655d } = {}) {
  let g = new THREE.TorusGeometry(radius, tube, 14, 40, Math.PI); strip(g); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c1 = new THREE.Color(color), c2 = new THREE.Color(color2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = hash3(Math.round(x / 9) + seed, Math.round(y / 9), Math.round(z / 9)) * 0.6 + hash3(Math.round(x / 4) + seed, Math.round(y / 4), Math.round(z / 4)) * 0.4;
    const k = 1 + (n - 0.5) * 0.35; p.setXYZ(i, x * (1 + (n - 0.5) * 0.06), y * (1 + (n - 0.5) * 0.06), z * k * 1.5);
    const c = c2.clone().lerp(c1, Math.min(1, Math.max(0, n + y / (radius * 3)))); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
