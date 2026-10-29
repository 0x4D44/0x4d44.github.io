// Rapids: white water on a river that floods the canyon floor. A ribbon of drifting foam streaks follows the route wherever the ground lies under the
// water level (streaks quicken and thicken in the narrow reaches and wherever the river wanders), and a collar of ripples and foam rings every pillar and
// boulder that stands in the water. Two draw calls, both flat, transparent and lit by nothing: the foam is a warm white that never reaches the bloom
// threshold. Owner: world agent.
import * as THREE from 'three';

const FOG_V = '#include <common>\n#include <fog_pars_vertex>\n';
const FOG_F = '#include <common>\n#include <fog_pars_fragment>\n';
const TAIL_F = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n';

const RIVER_VS = FOG_V + `
attribute float aMask; attribute float aRapid; attribute vec2 aUV;       // aUV: metres along the flow, metres across (0 on the route)
varying float vMask, vRapid; varying vec2 vUV;
void main(){
  vMask = aMask; vRapid = aRapid; vUV = aUV;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const RIVER_FS = FOG_F + `
uniform float uTime, uHalf, uFull; uniform vec3 uTint;         // uFull: 1 at the full water quality, 0 on the simple one (no warp, no bubbles: half the noise)
varying float vMask, vRapid; varying vec2 vUV;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
// value noise stretched along the flow: len = metres per cell (along, across), spd = metres per second the pattern drifts downstream
float lay(vec2 p, vec2 len, float spd, float seed){ return n2(vec2((p.x - uTime * spd) / len.x, p.y / len.y) + seed); }
void main(){
  float k = 1.0 + 1.5 * vRapid;                                                       // the water drifts at 8 m/s, 20 m/s in the rapids
  vec2 p = vUV; float bubbles = 0.85;
  if (uFull > 0.5) {
    vec2 wq = vec2(vUV.x - uTime * 8.0 * k, vUV.y) / vec2(48.0, 16.0);
    p += (vec2(n2(wq + 3.1), n2(wq + 8.7)) - 0.5) * vec2(22.0, 8.0);                   // warped, so the noise cells lose their grid
  }
  float f = lay(p, vec2(30.0, 9.0), 8.0 * k, 0.0) * 0.5 + lay(p, vec2(12.0, 4.0), 9.5 * k, 7.3) * 0.32 + lay(p, vec2(5.0, 1.9), 11.0 * k, 13.1) * 0.18;
  float clump = smoothstep(0.58 - 0.14 * vRapid, 0.80 - 0.10 * vRapid, f);           // drifts of foam, mostly in the rapids ("patch" is a reserved word in GLSL ES 3)
  if (uFull > 0.5) {
    vec2 pb = vec2(p.x - uTime * 12.0 * k, p.y); pb = vec2(0.80 * pb.x - 0.60 * pb.y, 0.60 * pb.x + 0.80 * pb.y);   // bubbles: round clusters, turned off the grid
    bubbles = 0.40 + 0.60 * smoothstep(0.24, 0.70, n2(pb / 2.1 + 21.7));
  }
  float foam = clump * bubbles * (0.40 + 0.60 * vRapid) * vMask;
  foam *= 1.0 - smoothstep(0.80, 1.0, abs(vUV.y) / uHalf);
  if (foam < 0.012) discard;
  gl_FragColor = vec4(uTint * (0.92 + 0.2 * clump), clamp(foam, 0.0, 1.0) * 0.9);` + TAIL_F + `}`;

const RING_VS = FOG_V + `
attribute float aSeed;
varying vec2 vUv; varying float vSeed;
void main(){
  vUv = uv; vSeed = aSeed;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const RING_FS = FOG_F + `
uniform sampler2D tFoam; uniform float uTime; uniform vec3 uTint;
varying vec2 vUv; varying float vSeed;
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q);
  if (r > 1.0) discard;
  float ang = atan(q.y, q.x);
  float n1 = texture2D(tFoam, vec2(ang * 0.7958 + vSeed * 9.0, r * 2.4 - uTime * 0.30)).r;        // foam torn into streamers that drift outward (5 whole turns of texture: no seam)
  float n2 = texture2D(tFoam, q * 1.7 + vSeed * 5.0 + vec2(uTime * 0.05, 0.0)).r;
  float collar = smoothstep(0.30, 0.42, r) * (1.0 - smoothstep(0.46, 1.0, r));                      // the object stands at r = 0.4
  float ripple = 0.55 + 0.45 * sin(r * 26.0 - uTime * 2.4 + vSeed * 6.0);
  float foam = collar * (0.3 + 1.5 * n1 * n2) * ripple;
  foam *= 1.0 - smoothstep(0.80, 1.0, r);
  if (foam < 0.012) discard;
  gl_FragColor = vec4(uTint, clamp(foam, 0.0, 1.0) * 0.92);` + TAIL_F + `}`;

const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const vnoise = (x) => { const i = Math.floor(x), t = x - i, w = t * t * (3 - 2 * t); return hash(i) * (1 - w) + hash(i + 1) * w; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * createRapids(course, game, H, { level, half, step, across, tint, rings, maxAbove })
 *   level     the water surface height (m);  half  half-width of the foam ribbon (m);  step  metres between route samples;  across  vertices across
 *   rings     [{ x, z, r }] objects standing in the water (r = their radius at the surface)
 *   maxAbove  samples whose route is higher than level + maxAbove (loop tops, the helix) are skipped
 * Returns a course part { group, update, dispose }.
 */
export function createRapids(course, game, H, { level, half = 130, step = 8, across = 27, tint = new THREE.Color(1.0, 0.95, 0.86), rings = [], maxAbove = 135 } = {}) {
  const foam = game.assets.tex('foam');
  const uTime = { value: 0 }, uFull = { value: game.q.water === 'full' ? 1 : 0 }, disposables = [];
  const group = new THREE.Group(); group.name = 'rapids';
  const f = {}, L = course.length, n = Math.ceil(L / step) + 1, K = across;
  // ---- the ribbon: one vertex row per route sample, K vertices across, kept only where the ground is under the water
  const rows = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(L, i * step); course.frameAt(s, f);
    if (f.pos.y - level > maxAbove) { rows.push(null); continue; }
    const px = f.pos.x, pz = f.pos.z;
    const sn = Math.min(L, (i + 1) * step), sp = Math.max(0, (i - 1) * step);
    const a = {}, b = {}; course.frameAt(sp, a); course.frameAt(sn, b);
    let tx = b.pos.x - a.pos.x, tz = b.pos.z - a.pos.z; const tl = Math.hypot(tx, tz);
    if (tl < 1.5) { rows.push(null); continue; }                       // the path climbs straight up here: no ground track to follow
    tx /= tl; tz /= tl;
    const rx = -tz, rz = tx, verts = [];
    let wet = 0, any = false;
    for (let k = 0; k < K; k++) {
      const lat = (k / (K - 1) * 2 - 1) * half, x = px + rx * lat, z = pz + rz * lat, depth = level - H(x, z), m = smooth(0.3, 3.2, depth);
      verts.push({ x, z, lat, m }); wet += m; if (m > 0.02) any = true;
    }
    if (!any) { rows.push(null); continue; }
    const width = wet * (2 * half / (K - 1));
    const rapid = Math.max(smooth(0.40, 0.72, vnoise(s * 0.0048 + 5.3)) * 0.9, (1 - smooth(70, 190, width)) * 0.85);
    rows.push({ s, verts, rapid });
  }
  const pos = [], mask = [], rap = [], uv = [], idx = [];
  const rowBase = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const r = rows[i]; if (!r) continue;
    rowBase[i] = pos.length / 3;
    for (const v of r.verts) { pos.push(v.x, level + 0.22, v.z); mask.push(v.m); rap.push(r.rapid); uv.push(r.s, v.lat); }
  }
  for (let i = 0; i + 1 < n; i++) {
    if (rowBase[i] < 0 || rowBase[i + 1] < 0) continue;
    for (let k = 0; k < K - 1; k++) {
      const a = rowBase[i] + k, b = a + 1, c = rowBase[i + 1] + k, d = c + 1;
      const m = mask[a] + mask[b] + mask[c] + mask[d]; if (m < 0.05) continue;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (idx.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aMask', new THREE.Float32BufferAttribute(mask, 1));
    geo.setAttribute('aRapid', new THREE.Float32BufferAttribute(rap, 1)); geo.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime, uFull, uHalf: { value: half }, uTint: { value: tint.clone() } }]),
      vertexShader: RIVER_VS, fragmentShader: RIVER_FS, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    Object.assign(mat.uniforms, { uTime, uFull });                     // merge() cloned them: hand the live ones back
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.name = 'river-foam'; group.add(mesh); disposables.push(geo, mat);
  }
  // ---- collars of foam around whatever stands in the water
  if (rings.length) {
    const quad = new THREE.PlaneGeometry(1, 1); quad.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tFoam: { value: foam }, uTime, uTint: { value: tint.clone() } }]),
      vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    Object.assign(mat.uniforms, { tFoam: { value: foam }, uTime, uTint: { value: tint.clone() } });
    const seed = new Float32Array(rings.length), im = new THREE.InstancedMesh(quad, mat, rings.length), m4 = new THREE.Matrix4();
    rings.forEach((o, i) => { m4.makeScale(o.r * 5, 1, o.r * 5).setPosition(o.x, level + 0.3, o.z); im.setMatrixAt(i, m4); seed[i] = hash(i * 3.7 + o.x * 0.01); });
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = 2; im.name = 'foam-rings';
    group.add(im); disposables.push(quad, mat);
  }
  return {
    group,
    update(dt, g) { uTime.value += dt; uFull.value = g.q.water === 'full' ? 1 : 0; },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}
