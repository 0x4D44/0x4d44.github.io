// Instanced night facades: every building tier is one instance of a unit box, drawn by a single draw call. The fragment shader tiles the
// 4x4 facade_atlas / facade_emissive cells by world metres (no UV streaming), lights a random subset of windows, trims roofs with neon and
// fades to the fog. Owner: craft agent (role C).
import * as THREE from 'three';

export const KIND = { lot: 0, antenna: 1, tower: 2, podium: 3, atrium: 4, far: 5 };

const VS = `
attribute vec3 aPos; attribute vec3 aSize; attribute vec4 aStyle;     // (cx, y0, cz) (w, h, d) (cell, seed, lit, yaw)  ; kind comes from aKind
attribute float aKind;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLN; varying vec3 vM; flat varying vec3 vSz; flat varying vec4 vS; flat varying float vH; flat varying float vKind;
#include <common>
#include <fog_pars_vertex>
void main(){
  vec3 m = vec3(position.x * aSize.x, position.y * aSize.y, position.z * aSize.z);
  float c = cos(aStyle.w), s = sin(aStyle.w);
  vec3 r = vec3(m.x * c + m.z * s, m.y, -m.x * s + m.z * c);
  vec3 w = aPos + r;
  vN = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c);
  vLN = normal; vM = m; vSz = aSize; vS = aStyle; vH = aSize.y; vKind = aKind; vWorld = w;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FS = `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tAlb, tEmi;
uniform vec3 uMoonDir, uMoonCol;
uniform float uTime, uEmi;
varying vec3 vWorld; varying vec3 vN; varying vec3 vLN; varying vec3 vM; flat varying vec3 vSz; flat varying vec4 vS; flat varying float vH; flat varying float vKind;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 neonPal(float k){
  k = fract(k);
  return k < 0.33 ? vec3(0.1, 0.9, 1.0) : (k < 0.62 ? vec3(1.0, 0.18, 0.75) : (k < 0.82 ? vec3(1.0, 0.62, 0.16) : vec3(0.65, 0.4, 1.0)));
}
void main(){
  vec3 N = normalize(vN);
  float cell = vS.x, seed = vS.y, lit = vS.z;
  float kind = vKind;
  vec3 col = vec3(0.0), emi = vec3(0.0);
  float topD = vH - vM.y;
  if (kind > 0.5 && kind < 1.5) {                              // antenna mast
    col = vec3(0.05, 0.05, 0.07);
  } else if (vLN.y > 0.5) {                                    // roofs
    float g = step(0.5, fract(vM.x * 0.09 + seed)) * step(0.5, fract(vM.z * 0.09 + seed * 0.7));
    float rf = max(length(vec2(dFdx(vM.x), dFdy(vM.x))), length(vec2(dFdx(vM.z), dFdy(vM.z)))) * 0.09;
    g = mix(g, 0.25, smoothstep(0.08, 0.3, rf));                                  // roof checker fades to its mean with distance
    col = vec3(0.02, 0.022, 0.034) + g * vec3(0.012, 0.012, 0.02);
    col += uMoonCol * 0.05 * max(N.y, 0.0);
  } else {
    float u = abs(vLN.x) > 0.5 ? vM.z : vM.x;
    vec2 uvc = vec2(u / 32.0 + floor(seed * 8.0) / 8.0, vWorld.y / 30.0 + floor(fract(seed * 3.7) * 8.0) / 8.0);
    vec2 cellO = vec2(mod(cell, 4.0), 3.0 - floor(cell / 4.0)) / 4.0;
    vec2 g = (fract(uvc) * 0.96 + 0.02) / 4.0;
    vec2 dx = dFdx(uvc) * 0.96 * 2.2 / 4.0, dy = dFdy(uvc) * 0.96 * 2.2 / 4.0;   // x2.2: blur a little earlier so window edges lose contrast before they crawl
    vec3 alb = textureGrad(tAlb, cellO + g, dx, dy).rgb;
    vec3 em = textureGrad(tEmi, cellO + g, dx, dy).rgb;
    vec3 glow = mix(vec3(1.0, 0.3, 0.55), vec3(1.0, 0.62, 0.22), fract(seed * 3.7));
    float gl = exp(-vWorld.y / 80.0);
    float moon = max(dot(N, uMoonDir), 0.0);
    vec3 light = uMoonCol * (0.14 + 0.45 * moon) + glow * gl * 0.5 + vec3(0.03, 0.035, 0.08);
    if (kind > 1.5 && kind < 2.5) light += vec3(0.0, 0.12, 0.2);                  // tower: cool glass
    if (kind > 3.5 && kind < 4.5) light = light * 0.7 + vec3(0.16, 0.08, 0.03);      // atrium mass: warm
    col = alb * light * 0.38;
    vec2 win = floor(uvc * 8.0);
    float fw = max(length(dFdx(uvc * 8.0)), length(dFdy(uvc * 8.0)));
    float aa = smoothstep(0.07, 0.26, fw);
    float on = mix(step(h21(win + seed * 13.1), lit), lit, aa);
    emi = em * on * uEmi;
    // far away the texture's own window pattern is below a pixel: replace it by its mip average so nothing crawls
    emi = mix(emi, textureLod(tEmi, cellO + vec2(0.125, 0.125), 5.0).rgb * lit * uEmi * 1.6 + vec3(0.04, 0.03, 0.05) * lit, smoothstep(0.2, 0.6, fw));
    float fl = step(0.985, h21(win * 1.7 + floor(uTime * 0.4 + seed))) * (1.0 - aa);
    emi *= 1.0 - 0.85 * fl;
    // neon roof trim on a share of the buildings
    float tr = h21(vec2(seed, 9.1));
    if (kind < 0.5 && tr > 0.45 && topD < 1.1) emi += neonPal(tr * 3.0) * 1.5;
    if (kind > 1.5 && kind < 2.5) {                                              // landmark tower: vertical edge strips and a banded crown
      float hc = abs(vLN.x) > 0.5 ? vM.z : vM.x, hwf = 0.5 * (abs(vLN.x) > 0.5 ? vSz.z : vSz.x);
      if (abs(hc) > hwf - 1.8) emi += vec3(0.15, 0.85, 1.0) * 1.8;
      if (topD < 1.4) emi += vec3(1.0, 0.25, 0.8) * 2.0;
    }
    if (kind > 2.5 && kind < 3.5) {                                              // podium: horizontal light bands
      float band = step(0.82, fract(vWorld.y / 9.0));
      emi += vec3(1.0, 0.7, 0.35) * 0.9 * band;
    }
  }
  gl_FragColor = vec4(col + emi, 1.0);
  #include <fog_fragment>
}`;

export function createFacades(game, instances, env) {
  const n = instances.length;
  const base = new THREE.BoxGeometry(1, 1, 1); base.translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.normal = base.attributes.normal;
  const aPos = new Float32Array(n * 3), aSize = new Float32Array(n * 3), aStyle = new Float32Array(n * 4), aKind = new Float32Array(n);
  instances.forEach((b, i) => {
    aPos.set([b.cx, b.y0, b.cz], i * 3); aSize.set([b.w, Math.max(0.5, b.y1 - b.y0), b.d], i * 3);
    aStyle.set([b.cell ?? 0, b.seed ?? 0, b.lit ?? 0.7, b.yaw ?? 0], i * 4); aKind[i] = KIND[b.kind] ?? 0;
  });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 3));
  geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(aStyle, 4));
  geo.setAttribute('aKind', new THREE.InstancedBufferAttribute(aKind, 1));
  geo.instanceCount = n;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tAlb: { value: game.assets.tex('facade_atlas') }, tEmi: { value: game.assets.tex('facade_emissive') },
    uMoonDir: { value: env.sunDir.clone() }, uMoonCol: { value: new THREE.Color(0.24, 0.3, 0.6) }, uTime: { value: 0 }, uEmi: { value: 1.0 },
  }]);
  for (const k of ['tAlb', 'tEmi']) { const tx = uniforms[k].value; tx.anisotropy = Math.max(tx.anisotropy || 1, 8); tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; }
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, fog: true });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'facades';
  return { mesh, uniforms, update(dt) { uniforms.uTime.value += dt; }, dispose() { geo.dispose(); base.dispose(); mat.dispose(); } };
}
