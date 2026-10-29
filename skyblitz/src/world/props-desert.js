// Desert props for Redrock: plants are faceted and vertex-coloured; rock (hoodoos, buttes, arches) is smooth, with the canyon's own strata bands and a
// triplanar rock texture added in the shader (createStrataMaterial). Each maker returns ONE merged geometry (one InstancedMesh = one draw call).
// Sizes are metres unless noted. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { Soup } from './props-ice.js';
import { NOISE_GLSL, STRATA_GLSL, STRATA_NORMAL_GLSL } from './terrain-fx.js';

const C = (c) => new THREE.Color(c);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hf = (a) => { const v = Math.sin(a) * 43758.5453; return v - Math.floor(v); };

/** Sweeps an n-gon along a polyline. radii[i] per point; col(i, k) gives the colour of ring i, vertex k; flute < 1 pinches every other vertex (ribbed trunks). */
function tube(soup, pts, radii, sides, col, { cap = true, jitter = 0, seed = 0, flute = 0 } = {}) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], T = b.clone().sub(a).normalize();
    const ref = Math.abs(T.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0);
    const N1 = new THREE.Vector3().crossVectors(T, ref).normalize(), N2 = new THREE.Vector3().crossVectors(T, N1);
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2, j = 1 + jitter * (hf(k * 12.9 + i * 78.2 + seed) - 0.5) * 2, fl = flute && k % 2 ? 1 - flute : 1;
      ring.push(pts[i].clone().addScaledVector(N1, Math.cos(ang) * radii[i] * j * fl).addScaledVector(N2, Math.sin(ang) * radii[i] * j * fl));
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    soup.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k], col(i, k), col(i, k2), col(i + 1, k2), col(i + 1, k));
  }
  if (cap) {
    const last = rings[rings.length - 1], n = pts.length, tip = pts[n - 1].clone().addScaledVector(pts[n - 1].clone().sub(pts[n - 2]).normalize(), radii[n - 1] * 0.8);
    for (let k = 0; k < sides; k++) soup.tri(last[k], last[(k + 1) % sides], tip, col(n - 1, k), col(n - 1, (k + 1) % sides), col(n - 1, k));
  }
}

/** Square prism from a to b (thickness w), flat-coloured: used for timbers and truss members. */
function beam(s, a, b, w, ca, cb = ca) {
  const T = b.clone().sub(a), len = T.length(); T.normalize();
  const ref = Math.abs(T.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0);
  const N1 = new THREE.Vector3().crossVectors(T, ref).normalize().multiplyScalar(w * 0.5), N2 = new THREE.Vector3().crossVectors(T, N1).normalize().multiplyScalar(w * 0.5);
  const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, y]) => a.clone().addScaledVector(N1, x).addScaledVector(N2, y)), d = c.map((p) => p.clone().addScaledVector(T, len));
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; s.quad(c[i], c[j], d[j], d[i], ca, ca, cb, cb); }
  s.quad(c[3], c[2], c[1], c[0], ca); s.quad(d[0], d[1], d[2], d[3], cb);
}

/** Axis-aligned slab centred on (cx, cy, cz). */
function slab(s, cx, cy, cz, sx, sy, sz, cTop, cSide) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  s.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), cTop);              // top
  s.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), cSide);             // bottom
  s.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), cSide);             // +z
  s.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), cSide);             // -z
  s.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), cSide);             // +x
  s.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), cSide);             // -x
}

/** Saguaro: ribbed trunk ~8 m with two or three upturned arms. Root at the origin. */
export function makeSaguaro({ seed = 1 } = {}) {
  const rnd = mulberry32(seed), s = new Soup();
  const dark = C(0x2c5a34), mid = C(0x477a43), light = C(0x73a05a);
  const H = 7.2 + rnd() * 1.8, R = 0.62, N = 8, pts = [], rad = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(V(0, H * t, 0)); rad.push(R * (1 - 0.12 * t) * (i === N ? 0.6 : 1)); }
  tube(s, pts, rad, 8, (i, k) => (k % 2 ? dark : mid).clone().lerp(light, (i / N) * 0.55), { flute: 0.14 });
  const arms = 2 + (rnd() < 0.5 ? 1 : 0);
  for (let a = 0; a < arms; a++) {
    const side = a % 2 ? -1 : 1, y0 = 2.0 + rnd() * 2.6, out = 1.6 + rnd() * 1.0, up = 1.8 + rnd() * 2.4, rot = a * 2.1 + rnd();
    const ap = [V(side * R * 0.4, y0, 0), V(side * (R + out * 0.5), y0 + 0.15, 0), V(side * (R + out), y0 + 0.85, 0), V(side * (R + out), y0 + 0.85 + up * 0.55, 0), V(side * (R + out), y0 + 0.85 + up, 0)];
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (const p of ap) { const x = p.x * cr, z = -p.x * sr; p.x = x; p.z = z; }
    tube(s, ap, [0.34, 0.34, 0.33, 0.31, 0.24], 6, (i, k) => (k % 2 ? dark : mid).clone().lerp(light, (i / 4) * 0.55));
  }
  return s.geometry();
}

/** Agave rosette: radial blue-green blades with rust tips and a seed stalk on some. Radius ~1 (blade length), root at the origin. */
export function makeAgave({ seed = 1, blades = 12 } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), base = C(0x3c6a5a), mid = C(0x6f9a86), tip = C(0xb0b89a), spine = C(0xa5563a);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.3, pitch = 0.25 + 0.75 * (b % 3) / 3 + rnd() * 0.12, L = 0.8 + rnd() * 0.35;
    const dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
    const at = (t, w, lift) => V(0, 0.08, 0).addScaledVector(dir, Math.cos(pitch * (1 - 0.4 * t)) * L * t).addScaledVector(V(0, 1, 0), Math.sin(pitch) * L * t * (1 - 0.35 * t) + lift).addScaledVector(side, w);
    const w0 = 0.13, p0 = at(0, 0, 0), p1l = at(0.4, -w0, 0.02), p1r = at(0.4, w0, 0.02), p2l = at(0.75, -w0 * 0.6, 0.0), p2r = at(0.75, w0 * 0.6, 0.0), p3 = at(1, 0, 0), r1 = at(0.4, 0, 0.05), r2 = at(0.75, 0, 0.04);
    s.tri(p0, p1r, r1, base, mid, mid); s.tri(p0, r1, p1l, base, mid, mid);
    s.tri(p1l, r1, r2, mid, mid, tip); s.tri(p1l, r2, p2l, mid, tip, tip); s.tri(r1, p1r, p2r, mid, mid, tip); s.tri(r1, p2r, r2, mid, tip, tip);
    s.tri(p2l, r2, p3, tip, tip, spine); s.tri(r2, p2r, p3, tip, tip, spine);
  }
  return s.geometry();
}

/** Dry scrub: a squat clump of olive and straw lumps. Radius ~1, height ~0.8, root at the origin. */
export function makeScrub({ seed = 1, lumps = 6 } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), pal = [0x6e7438, 0x8b8a46, 0xa59a58, 0x7a8240, 0xb4a463].map(C);
  const ico = new THREE.IcosahedronGeometry(1, 0), p = ico.attributes.position;           // already non-indexed
  for (let l = 0; l < lumps; l++) {
    const a = rnd() * 6.283, d = l === 0 ? 0 : 0.35 + rnd() * 0.45, r = (l === 0 ? 0.62 : 0.28 + rnd() * 0.32), cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = r * 0.45;
    const c = pal[Math.floor(rnd() * pal.length)], lo = c.clone().multiplyScalar(0.62);
    for (let i = 0; i < p.count; i += 3) {
      const v = [0, 1, 2].map((k) => { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k), j = 0.82 + 0.36 * hf(x * 9.1 + y * 5.3 + z * 7.7 + l * 3.3); return V(cx + x * r * j, Math.max(0, cy + y * r * 0.8 * j), cz + z * r * j); });
      s.tri(v[0], v[1], v[2], ...[0, 1, 2].map((k) => (p.getY(i + k) > 0 ? c : lo)));
    }
  }
  ico.dispose();
  return s.geometry();
}

/** Grass tuft: a handful of tapered blades fanning out of one point (5-7 triangles), olive at the root, straw at the tips. Radius ~1, height ~1; use a double-sided material. */
export function makeTuft({ seed = 1, blades = 7 } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), root = C(0x4f5a2a), tip = C(0xc9b668), tip2 = C(0x9fae52);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.8, lean = 0.25 + rnd() * 0.55, h = 0.65 + rnd() * 0.5, w = 0.1 + rnd() * 0.07;
    const dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
    const base = dir.clone().multiplyScalar(0.08 + rnd() * 0.1), top = base.clone().addScaledVector(dir, lean * h).add(V(0, h, 0));
    s.tri(base.clone().addScaledVector(side, -w), base.clone().addScaledVector(side, w), top, root, root, rnd() < 0.5 ? tip : tip2);
  }
  return s.geometry();
}

/** Cottonwood: pale trunk, a few lumpy canopy domes in greens turning golden at the sun side. ~13 m tall, root at the origin. */
export function makeCottonwood({ seed = 1 } = {}) {
  const rnd = mulberry32(seed), s = new Soup(), bark = C(0xb7ab92), bark2 = C(0x8a7a62);
  const lean = (rnd() - 0.5) * 1.2;
  tube(s, [V(0, 0, 0), V(lean * 0.4, 3, 0.2), V(lean, 6.2, 0), V(lean * 1.2, 8, 0.1)], [0.62, 0.5, 0.38, 0.28], 6, (i, k) => (k % 2 ? bark : bark2), { cap: false });
  const greens = [0x5f9234, 0x7aa83a, 0x9fb843, 0xc6bd48].map(C), ico = new THREE.IcosahedronGeometry(1, 1), p = ico.attributes.position;
  const lumps = 5 + Math.floor(rnd() * 3);
  for (let l = 0; l < lumps; l++) {
    const a = rnd() * 6.283, d = l === 0 ? 0 : 1.6 + rnd() * 2.4, r = 2.2 + rnd() * 1.6, cx = lean * 1.1 + Math.cos(a) * d, cz = Math.sin(a) * d, cy = 8.4 + rnd() * 3.4 - d * 0.25;
    const g = greens[Math.min(3, Math.floor(rnd() * 3.5))], hi = g.clone().lerp(greens[3], 0.5), lo = g.clone().multiplyScalar(0.55);
    for (let i = 0; i < p.count; i += 3) {
      const v = [0, 1, 2].map((k) => { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k), j = 0.8 + 0.4 * hf(x * 7.1 + y * 3.3 + z * 9.7 + l * 5.9); return V(cx + x * r * j, cy + y * r * 0.78 * j, cz + z * r * j); });
      s.tri(v[0], v[1], v[2], ...[0, 1, 2].map((k) => (p.getY(i + k) > 0.25 ? hi : p.getY(i + k) < -0.25 ? lo : g)));
    }
  }
  ico.dispose();
  return s.geometry();
}

const mix = (a, b, t) => a.clone().lerp(b, t);
const SAND = C(0xc88a62);

/** Fine rock / foliage relief for createStrataMaterial: three octaves of world-space value noise, faded out by pixel footprint so far rocks do not shimmer.
 *  uRk = (features per metre of the first octave, relief height in metres, albedo blotch strength). gRKH is the grain height (0..1), gRKFP the metres per pixel. */
const RELIEF_GLSL = `
uniform vec3 uRk; float gRKH = 0.0, gRKFP = 1.0;
float rkH3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float rkN3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkH3(i), rkH3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(rkH3(i + vec3(0.0, 1.0, 0.0)), rkH3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(rkH3(i + vec3(0.0, 0.0, 1.0)), rkH3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(rkH3(i + vec3(0.0, 1.0, 1.0)), rkH3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
float rkHeight(vec3 wp){
  gRKFP = max(length(fwidth(wp)), 1e-3);
  float f1 = uRk.x, f2 = f1 * 2.7, f3 = f1 * 7.3;
  float w1 = 1.0 - smoothstep(0.15, 0.45, gRKFP * f1), w2 = 1.0 - smoothstep(0.15, 0.45, gRKFP * f2), w3 = 1.0 - smoothstep(0.15, 0.45, gRKFP * f3);
  return 0.55 * mix(0.5, rkN3(wp * f1), w1) + 0.3 * mix(0.5, rkN3(wp * f2 + 7.3), w2) + 0.15 * mix(0.5, rkN3(wp * f3 + 3.1), w3);
}
vec3 rkBump(vec3 sp, vec3 sn, vec2 dh, float fd){
  dh *= min(1.0, 1.2 / max(length(dh), 1e-4));                                  // never steeper than ~50 degrees
  vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp)), r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  return normalize(abs(det) * sn - sign(det) * (dh.x * r1 + dh.y * r2));
}`;

/**
 * Standard material with world-space sandstone strata (the same bands the canyon walls carry, so props and walls agree): vertex colours give the base
 * rock, dark vertex colours (caprock) stay unbanded. Works on plain and instanced meshes.
 * bump (metres of relief) + bumpScale (features per metre) + blotch (albedo mottling) add grain to a smooth low-poly blob: a rocky crag or a leafy canopy
 * instead of a pebble (V-16). Off by default, so the canyon material is unchanged.
 */
export function createStrataMaterial(game, { scale = 0.055, warp = 2.6, strength = 0.9, colors = [0xb8532c, 0xd99a5c, 0xecd2a6, 0x6e2f3a], lumBase = 0.3, lumGain = 1.7, relief = 2.2, detail = 'rock_red', detailScale = 45, detailMix = 0.8, emissive = 0x3a160a, emissiveIntensity = 0.22, roughness = 0.94, bump = 0, bumpScale = 0.5, blotch = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, emissive: new THREE.Color(emissive), emissiveIntensity });
  const grain = bump > 0 || blotch > 0;
  const u = { uBand: { value: new THREE.Vector3(scale, warp, strength) }, uBA: { value: C(colors[0]) }, uBB: { value: C(colors[1]) }, uBC: { value: C(colors[2]) }, uBD: { value: C(colors[3]) }, tDetail: { value: detail ? game.assets.tex(detail) : null }, uDetail: { value: new THREE.Vector2(detailScale, detailMix) }, uRk: { value: new THREE.Vector3(bumpScale, bump, blotch) } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW, vSN;').replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec4 sw = vec4(transformed, 1.0); vec3 on = objectNormal;
#ifdef USE_INSTANCING
  mat3 im = mat3(instanceMatrix); on /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])); on = im * on;      // inverse transpose: right for non-uniform scale
  sw = instanceMatrix * sw;
#endif
  vSW = (modelMatrix * sw).xyz; vSN = normalize(mat3(modelMatrix) * on); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSW, vSN; uniform vec3 uBand, uBA, uBB, uBC, uBD; uniform vec2 uDetail; uniform sampler2D tDetail;
${NOISE_GLSL}${STRATA_GLSL}${grain ? RELIEF_GLSL : ''}
vec3 tfTri(sampler2D t, vec3 p, vec3 n, float sc){
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(t, p.zy / sc).rgb * w.x + texture2D(t, p.xz / sc).rgb * w.y + texture2D(t, p.xy / sc).rgb * w.z;
}`).replace('#include <color_fragment>', `#include <color_fragment>
{
  float bk; vec3 bc = tfStrata(vSW, uBand, uBA, uBB, uBC, uBD, bk);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, bc * (${lumBase.toFixed(2)} + ${lumGain.toFixed(2)} * lum), bk * smoothstep(0.07, 0.2, lum));
  ${detail ? 'float dl = dot(tfTri(tDetail, vSW, normalize(vSN), uDetail.x), vec3(0.3, 0.59, 0.11)); diffuseColor.rgb *= mix(1.0, clamp(0.55 + 1.9 * dl, 0.45, 1.6), uDetail.y);' : ''}
  ${grain ? 'gRKH = rkHeight(vSW); diffuseColor.rgb *= 1.0 + (gRKH - 0.5) * uRk.z;' : ''}
}`).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + STRATA_NORMAL_GLSL(relief, 'smoothstep(0.1, 0.6, 1.0 - abs((normal * mat3(viewMatrix)).y))')
      + (bump > 0 ? '\n  normal = rkBump(-vViewPosition, normal, vec2(dFdx(gRKH), dFdy(gRKH)) * (uRk.y / gRKFP), faceDirection);' : ''));
  };
  m.customProgramCacheKey = () => 'sbstrata' + lumBase + '/' + lumGain + '/' + relief + (detail ? 'd' : '') + (blotch > 0 ? 'k' : '') + (bump > 0 ? 'b' : '');
  return m;
}

/** Indexed, smooth-shaded sweep of closed rings (outward winding for rings that run up the shape with k going anticlockwise seen from +Y / around the tube). */
function sweep(rings, cols, apex = null, apexCol = null) {
  const R = rings.length, S = rings[0].length, n = R * S + (apex ? 1 : 0), P = new Float32Array(n * 3), Cc = new Float32Array(n * 3), idx = [];
  for (let i = 0; i < R; i++) for (let k = 0; k < S; k++) { const p = rings[i][k], c = cols[i][k], o = (i * S + k) * 3; P[o] = p.x; P[o + 1] = p.y; P[o + 2] = p.z; Cc[o] = c.r; Cc[o + 1] = c.g; Cc[o + 2] = c.b; }
  for (let i = 0; i < R - 1; i++) for (let k = 0; k < S; k++) { const k2 = (k + 1) % S, a = i * S + k, b = i * S + k2, c = (i + 1) * S + k2, d = (i + 1) * S + k; idx.push(a, d, c, a, c, b); }
  if (apex) {
    const o = R * S * 3; P[o] = apex.x; P[o + 1] = apex.y; P[o + 2] = apex.z; Cc[o] = apexCol.r; Cc[o + 1] = apexCol.g; Cc[o + 2] = apexCol.b;
    for (let k = 0; k < S; k++) idx.push((R - 1) * S + ((k + 1) % S), (R - 1) * S + k, R * S);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/**
 * Hoodoo: smooth, eroded and fluted, flared at the foot, sandstone colour (the strata material bands it). cap = true: a mushroom with an overhanging dark
 * caprock dome; cap = false: a butte pillar with a rounded dark top. Height 1, base radius ~1 (scale it).
 */
export function makeHoodoo({ seed = 1, sides = 18, cap = true } = {}) {
  const ts = [];
  for (let i = 0; i <= 44; i++) ts.push(i / 44);
  if (cap) for (const t of [0.735, 0.75, 0.765, 0.78, 0.795, 0.81]) ts.push(t);
  ts.sort((a, b) => a - b);
  const capLo = C(0x3e1c12), capHi = C(0x7a4228), flare = (t, k) => 1 + k * Math.pow(1 - t, 4);
  const prof = (t) => {
    if (cap) {
      const stem = (0.6 + 0.1 * Math.sin(t * 9.5 + seed) + 0.06 * Math.sin(t * 23 + seed * 2)) * flare(t, 0.7);
      if (t < 0.74) return stem;
      const u = (t - 0.74) / 0.26, w = Math.min(1, u / 0.12), sw = w * w * (3 - 2 * w), dome = 1.38 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, u - 0.05) / 0.95, 3.2) * 0.94));
      return stem + (dome - stem) * sw;
    }
    const body = (1 + 0.06 * Math.sin(t * 11 + seed) + 0.04 * Math.sin(t * 27 + seed * 2)) * (1 - 0.12 * t) * flare(t, 0.32);
    return body * (t > 0.9 ? Math.max(0.12, Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.9) / 0.1, 2.2)))) : 1);
  };
  const rings = [], cols = [];
  for (const t of ts) {
    const row = [], crow = [], rr = prof(t), capZone = cap ? t >= 0.745 : t >= 0.9, u = cap ? (t - 0.745) / 0.255 : (t - 0.9) / 0.1;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2, r = rr * (1 + 0.07 * Math.sin(a * 3 + t * 5 + seed) + 0.045 * Math.sin(a * 7 - t * 8 + seed * 2.3));
      row.push(V(Math.cos(a) * r, t, Math.sin(a) * r));
      const n = 0.9 + 0.2 * hf(k * 3.1 + Math.floor(t * 60) * 5.7 + seed);
      crow.push((capZone ? mix(capLo, capHi, Math.min(1, Math.max(0, cap ? u * 0.9 : 0.2 + u * 0.5))) : SAND).clone().multiplyScalar(n));
    }
    rings.push(row); cols.push(crow);
  }
  return sweep(rings, cols, V(0, 1, 0), cap ? capHi : mix(capLo, capHi, 0.5));
}

/**
 * Sandstone arch in the x-y plane (thickness along z): a half ring of centreline `radius` with a lumpy, eroded tube - thick feet, slim crown.
 * The feet are at y = 0 (the caller sinks them into the walls). The inner opening's apex is at about radius - 0.85 * tube.
 */
export function makeSandstoneArch({ radius = 100, tube = 22, depth = 1.4, seed = 3, segs = 90, sides = 20 } = {}) {
  const sn = (x, y, z, f) => Math.sin(x * f + seed) * Math.sin(y * f * 1.3 + seed * 2.1) + Math.sin(z * f * 0.9 + x * f * 0.5 + seed * 0.7) * Math.cos(y * f * 0.8);
  const rings = [], cols = [], fs = 0.045 * 100 / Math.max(40, radius);
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * Math.PI, cx = Math.cos(phi), cy = Math.sin(phi), foot = Math.pow(Math.abs(cx), 3), row = [], crow = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2, x0 = (radius + Math.cos(a) * tube) * cx, y0 = (radius + Math.cos(a) * tube) * cy, z0 = Math.sin(a) * tube * depth;
      const n = 0.5 + 0.28 * sn(x0, y0, z0, fs) + 0.2 * sn(x0, y0, z0, fs * 2.4) + 0.13 * sn(x0, y0, z0, fs * 6) + 0.07 * sn(x0, y0, z0, fs * 14);
      const k = (1 + 0.6 * foot - 0.16 * cy) * (1 + (n - 0.5) * (0.12 + 0.55 * foot)), rr = radius + Math.cos(a) * tube * k;
      row.push(V(rr * cx, rr * cy, Math.sin(a) * tube * k * depth));
      crow.push(SAND.clone().multiplyScalar(0.86 + 0.28 * n));
    }
    rings.push(row); cols.push(crow);
  }
  return sweep(rings, cols);
}

/** Wooden trestle bridge along +X: deck top at y=0, `bents` A-frame piers down to y=-height, X-bracing, handrails. Width along Z. */
export function makeTrestle({ span = 180, height = 40, width = 9, bayLen = 20, seed = 1 } = {}) {
  const s = new Soup(), wood = C(0x6a4630), wood2 = C(0x8a6444), dark = C(0x3e2a1e), top = C(0x9a7550);
  const n = Math.max(2, Math.round(span / bayLen)), x0 = -span / 2;
  slab(s, 0, -0.7, 0, span, 1.4, width, top, dark);
  for (const z of [-1, 1]) {
    beam(s, V(x0, 1.9, z * (width / 2 - 0.3)), V(-x0, 1.9, z * (width / 2 - 0.3)), 0.35, wood2);
    for (let i = 0; i <= n * 4; i++) { const x = x0 + (i / (n * 4)) * span; beam(s, V(x, 0, z * (width / 2 - 0.3)), V(x, 1.9, z * (width / 2 - 0.3)), 0.28, wood); }
  }
  for (let i = 0; i <= n; i++) {
    const x = x0 + (i / n) * span, edge = i === 0 || i === n;
    if (edge) continue;
    const bat = 2.4;
    for (const z of [-1, 1]) beam(s, V(x, -1.2, z * (width / 2 - 0.9)), V(x, -height, z * (width / 2 - 0.9 + bat)), 1.1, wood, dark);
    for (const f of [0.3, 0.62, 1]) {
      const y = -1.2 - (height - 1.2) * f, hw = width / 2 - 0.9 + bat * f;
      beam(s, V(x, y, -hw), V(x, y, hw), 0.8, wood2);
      if (f < 1) { const y2 = -1.2 - (height - 1.2) * (f + (f < 0.5 ? 0.32 : 0.38)), hw2 = width / 2 - 0.9 + bat * (f + (f < 0.5 ? 0.32 : 0.38)); beam(s, V(x, y, -hw), V(x, y2, hw2), 0.5, dark); beam(s, V(x, y, hw), V(x, y2, -hw2), 0.5, dark); }
    }
    if (i < n) for (const z of [-1, 1]) { const xn = x0 + ((i + 1) / n) * span; beam(s, V(x, -height * 0.3, z * (width / 2 - 0.9 + bat * 0.3)), V(xn, -height * 0.62, z * (width / 2 - 0.9 + bat * 0.62)), 0.45, dark); beam(s, V(xn, -height * 0.3, z * (width / 2 - 0.9 + bat * 0.3)), V(x, -height * 0.62, z * (width / 2 - 0.9 + bat * 0.62)), 0.45, dark); }
  }
  void seed;
  return s.geometry();
}

/** Parabolic through-truss bridge along +X: deck top at y=0, trusses rising `depth` m at midspan. Width along Z. Rust-brown iron on a plank deck. */
export function makeTruss({ span = 260, depth = 30, width = 12, panels = 22, seed = 1 } = {}) {
  const s = new Soup(), iron = C(0x59403a), rust = C(0xa5583a), dark = C(0x2e2420), top = C(0x8a6a4c);
  const x0 = -span / 2, topY = (x) => depth * (0.3 + 0.7 * (1 - Math.pow((2 * x) / span, 2)));
  slab(s, 0, -1.1, 0, span + 8, 2.2, width, top, dark);
  for (const z of [-1, 1]) {
    const zz = z * (width / 2 - 0.4);
    beam(s, V(x0, 0.6, zz), V(-x0, 0.6, zz), 1.1, iron);
    for (let i = 0; i < panels; i++) {
      const xa = x0 + (i / panels) * span, xb = x0 + ((i + 1) / panels) * span;
      beam(s, V(xa, topY(xa), zz), V(xb, topY(xb), zz), 1.2, rust);
      beam(s, V(xa, 0.6, zz), V(xa, topY(xa), zz), 0.7, iron);
      if (i % 2) beam(s, V(xa, 0.6, zz), V(xb, topY(xb), zz), 0.55, dark); else beam(s, V(xb, 0.6, zz), V(xa, topY(xa), zz), 0.55, dark);
    }
    beam(s, V(-x0, 0.6, zz), V(-x0, topY(-x0), zz), 0.7, iron);
  }
  for (let i = 0; i <= panels; i += 2) { const x = x0 + (i / panels) * span; beam(s, V(x, topY(x), -width / 2 + 0.4), V(x, topY(x), width / 2 - 0.4), 0.6, iron); }
  void seed;
  return s.geometry();
}
