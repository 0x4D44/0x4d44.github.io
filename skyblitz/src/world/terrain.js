// Height-field terrain patches with texture splatting by height and slope (4 layers: low / mid / high / cliff). Owner: world agent.
// Patches are built from the same height function the course uses for groundHeight() so visuals and collision agree.
import * as THREE from 'three';

/** sinkFrom (m, optional): below this height the mesh is steepened (y = sinkFrom + (h - sinkFrom) * sinkK) so the rim where cells are dropped (minH) lies
 *  far under the water instead of showing through the shallows as a cell-aligned sawtooth (R2-V-14). Heights used for normals stay the real ones. */
export function buildPatch(height, rect, { minH = -48, skirt = false, skirtDrop = 40, sinkFrom = null, sinkK = 4 } = {}) {
  const { x0, z0, x1, z1, cell } = rect;
  const nx = Math.max(2, Math.round((x1 - x0) / cell)), nz = Math.max(2, Math.round((z1 - z0) / cell));
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  const vx = nx + 1, vz = nz + 1;
  const H = new Float32Array(vx * vz);
  for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) H[j * vx + i] = height(x0 + i * dx, z0 + j * dz);
  const pos = new Float32Array(vx * vz * 3), nor = new Float32Array(vx * vz * 3);
  for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
    const k = j * vx + i, x = x0 + i * dx, z = z0 + j * dz;
    pos[k * 3] = x; pos[k * 3 + 1] = sinkFrom != null && H[k] < sinkFrom ? sinkFrom + (H[k] - sinkFrom) * sinkK : H[k]; pos[k * 3 + 2] = z;
    const hl = height(x - dx, z), hr = height(x + dx, z), hd = height(x, z - dz), hu = height(x, z + dz);
    const ax = hl - hr, az = hd - hu, ay = 2 * dx, l = Math.hypot(ax, ay, az * (dx / dz)) || 1;
    nor[k * 3] = ax / l; nor[k * 3 + 1] = ay / l; nor[k * 3 + 2] = az * (dx / dz) / l;
  }
  const idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
    if (H[a] < minH && H[b] < minH && H[c] < minH && H[d] < minH) continue;
    idx.push(a, c, b, b, c, d);
  }
  let P = pos, N = nor;
  if (skirt) {
    // vertical skirts hide cracks between neighbouring patches of different resolution
    const edge = [];
    for (let i = 0; i < vx; i++) { edge.push(i); edge.push((vz - 1) * vx + i); }
    for (let j = 1; j < vz - 1; j++) { edge.push(j * vx); edge.push(j * vx + vx - 1); }
    const base = vx * vz; P = new Float32Array((base + edge.length) * 3); N = new Float32Array((base + edge.length) * 3);
    P.set(pos); N.set(nor);
    edge.forEach((k, n) => { const o = (base + n) * 3; P[o] = pos[k * 3]; P[o + 1] = pos[k * 3 + 1] - skirtDrop; P[o + 2] = pos[k * 3 + 2]; N[o] = nor[k * 3]; N[o + 1] = nor[k * 3 + 1]; N[o + 2] = nor[k * 3 + 2]; });
    const hash = new Map(); edge.forEach((k, n) => hash.set(k, base + n));
    const sk = (a, b) => { if (hash.has(a) && hash.has(b)) { idx.push(a, hash.get(a), b, b, hash.get(a), hash.get(b)); idx.push(a, b, hash.get(a), b, hash.get(b), hash.get(a)); } };
    for (let i = 0; i < nx; i++) { sk(i, i + 1); sk((vz - 1) * vx + i, (vz - 1) * vx + i + 1); }
    for (let j = 0; j < nz; j++) { sk(j * vx, (j + 1) * vx); sk(j * vx + vx - 1, (j + 1) * vx + vx - 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setIndex(new THREE.BufferAttribute(P.length / 3 > 65000 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/** layers: { low, mid, high, cliff } texture names; h: [beachLo, beachHi, highLo, highHi]; tint colours. */
export function createTerrainMaterial(game, cfg) {
  const tex = (n) => game.assets.tex(n);
  const u = {
    tLow: { value: tex(cfg.low) }, tMid: { value: tex(cfg.mid) }, tHigh: { value: tex(cfg.high) }, tCliff: { value: tex(cfg.cliff) },
    uScale: { value: new THREE.Vector4(cfg.scaleLow ?? 38, cfg.scaleMid ?? 46, cfg.scaleHigh ?? 52, cfg.scaleCliff ?? 60) },
    uH: { value: new THREE.Vector4(...(cfg.h || [2, 9, 120, 190])) },
    uTintLow: { value: new THREE.Color(cfg.tintLow ?? 0xffffff) }, uTintMid: { value: new THREE.Color(cfg.tintMid ?? 0xffffff) },
    uTintHigh: { value: new THREE.Color(cfg.tintHigh ?? 0xffffff) }, uTintCliff: { value: new THREE.Color(cfg.tintCliff ?? 0xffffff) },
    uSlope: { value: new THREE.Vector2(...(cfg.slope || [0.3, 0.55])) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: cfg.roughness ?? 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm;
uniform sampler2D tLow, tMid, tHigh, tCliff; uniform vec4 uScale, uH; uniform vec3 uTintLow, uTintMid, uTintHigh, uTintCliff; uniform vec2 uSlope;
vec3 splat2(sampler2D t, vec2 p, float sc){ return mix(texture2D(t, p / sc).rgb, texture2D(t, p / (sc * 4.7) + 0.37).rgb, 0.45); }
vec3 tri(sampler2D t, vec3 p, vec3 n, float sc){
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture2D(t, p.zy / sc).rgb * w.x + texture2D(t, p.xz / sc).rgb * w.y + texture2D(t, p.xy / sc).rgb * w.z;
}`)
      .replace('#include <map_fragment>', `
{
  vec3 wn = normalize(vWNrm);
  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  float hh = vWPos.y;
  vec3 cLow = splat2(tLow, vWPos.xz, uScale.x) * uTintLow;
  vec3 cMid = splat2(tMid, vWPos.xz, uScale.y) * uTintMid;
  vec3 cHigh = splat2(tHigh, vWPos.xz, uScale.z) * uTintHigh;
  vec3 cCliff = tri(tCliff, vWPos, wn, uScale.w) * uTintCliff;
  float wLow = 1.0 - smoothstep(uH.x, uH.y, hh + (texture2D(tMid, vWPos.xz / 210.0).g - 0.5) * 3.0);
  float wHigh = smoothstep(uH.z, uH.w, hh + (texture2D(tMid, vWPos.xz / 310.0).r - 0.5) * 30.0);
  float wCliff = smoothstep(uSlope.x, uSlope.y, slope);
  vec3 c = mix(cMid, cLow, wLow);
  c *= mix(0.7, 1.0, smoothstep(0.0, 2.2, hh)) * 1.0;                       // wet sand strip at the waterline
  c = mix(c, cHigh, wHigh);
  c = mix(c, cCliff, wCliff);
  diffuseColor.rgb *= c;
}`);
  };
  mat.customProgramCacheKey = () => 'sbterrain';
  return mat;
}
