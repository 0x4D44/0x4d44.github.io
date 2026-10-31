// Sea: one big plane that follows the camera; animated normal maps, fresnel sky reflection, sun glitter, shore foam and depth tint driven by a
// low-res shore mask baked from the course height function. Owner: world agent.
import * as THREE from 'three';
import { SUN_GLOW } from './sky.js';

/** The sun on the water, tameable per course (R2-V-15: Sunrise's sun-facing stretches washed the frame white). `environment.sunGlow` is the sky's glow the sea reflects (see sky.js),
 *  `sunGlint` = [glint exponent, glint amplitude, wide glint exponent, wide glint amplitude], `sunGlitter` = [sparkle lobe exponent, sparkle amplitude, broad sparkle amplitude]. */
const SUN_GLINT = [220, 5.0, 18, 0.18], SUN_GLITTER = [7, 2.4, 0.12];

/** Bake a depth mask: R = clamp((h + 45) / 55, 0, 1) over bounds. Land and shallow = high. */
export function bakeShoreMask(height, b, res = 512) {
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = b.minX + ((i + 0.5) / res) * (b.maxX - b.minX), z = b.minZ + ((j + 0.5) / res) * (b.maxZ - b.minZ);
    const v = Math.min(1, Math.max(0, (height(x, z) + 45) / 55));
    const k = (j * res + i) * 4; data[k] = Math.round(v * 255); data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

const VS = `
#include <common>
#include <fog_pars_vertex>
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const FS = `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tN, tFoam, tShore;
uniform vec4 uBounds;     // minX, minZ, 1/sizeX, 1/sizeZ
uniform float uTime, uFull, uReef, uGlit;
uniform vec3 uDeep, uShallow, uTop, uMid, uHorizon, uSunDir, uSunColor;
uniform vec4 uGlow, uGlint;
uniform vec3 uGlitter;
varying vec3 vW;
// R2-V-14: the sea floor is the baked height mask. Marching the sight line down through it (4 taps, High water on the reef only) finds how deep the floor is where it is really
// SEEN, so the far wall of a shelf (a hard pale sawtooth through a pixel whose own surface point is shallow) stays hidden behind opaque water.
float floorY(vec2 xz){ vec2 s = (xz - uBounds.xy) * uBounds.zw; return (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) ? -45.0 : texture2D(tShore, s).r * 55.0 - 45.0; }
float seenDepth(vec3 rd){                       // metres under the surface where the straight sight line rd (pointing down) meets the floor; 26 when it does not within that
  float k = 1.0 / max(-rd.y, 0.02), prevS = 0.0, prevG = -floorY(vW.xz), hit = 26.0; bool found = false;
  for (int i = 0; i < 4; i++) {
    float s = i == 0 ? 3.0 : (i == 1 ? 8.0 : (i == 2 ? 15.0 : 26.0));
    float g = -s - floorY(vW.xz + rd.xz * (s * k));
    if (!found && g <= 0.0) { hit = mix(prevS, s, prevG / max(prevG - g, 1e-4)); found = true; }
    prevS = s; prevG = g;
  }
  return hit;
}
vec3 skyCol(vec3 d){
  float up = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, up));
  c = mix(c, uTop, smoothstep(0.12, 0.85, up));
  float sd = max(dot(d, uSunDir), 0.0);
  return c + uSunColor * (pow(sd, uGlow.y) * uGlow.x + pow(sd, uGlow.w) * uGlow.z);
}
void main(){
  vec2 p = vW.xz;
  vec3 n1 = texture2D(tN, p * 0.0042 + vec2(uTime * 0.012, uTime * 0.007)).rgb * 2.0 - 1.0;
  vec3 n2 = texture2D(tN, p * 0.0113 + vec2(-uTime * 0.017, uTime * 0.011)).rgb * 2.0 - 1.0;
  vec3 n3 = texture2D(tN, p * 0.031 + vec2(uTime * 0.03, -uTime * 0.02)).rgb * 2.0 - 1.0;
  vec3 N = normalize(vec3((n1.x + n2.x * 0.7 + n3.x * 0.4) * 0.55, 1.0, (n1.y + n2.y * 0.7 + n3.y * 0.4) * 0.55));
  vec3 V = normalize(cameraPosition - vW);
  float dist = length(cameraPosition - vW);
  N = normalize(mix(N, vec3(0.0, 1.0, 0.0), clamp(dist / 9000.0, 0.0, 0.85)));   // flatten at range (no shimmer)
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  vec3 refl = skyCol(normalize(R));
  vec2 su = (vW.xz - uBounds.xy) * uBounds.zw;
  float depthV = (su.x < 0.0 || su.y < 0.0 || su.x > 1.0 || su.y > 1.0) ? 0.0 : texture2D(tShore, su).r;
  float shallow = smoothstep(0.05, 0.85, depthV);
  vec3 body = mix(uDeep, uShallow, shallow);
  if (uReef > 0.0) {
    body = mix(uDeep, mix(uDeep * 1.9 + vec3(0.0, 0.05, 0.08), uShallow, smoothstep(0.35, 0.75, depthV)), smoothstep(0.08, 0.5, depthV));
    body = mix(body, uShallow * 0.95 + vec3(0.03, 0.04, 0.02), smoothstep(0.72, 0.9, depthV) * 0.4);        // pale lagoon over the sand shelf
    float rn = texture2D(tFoam, p * 0.011 + 0.37).r * 0.6 + texture2D(tFoam, p * 0.027).r * 0.4;
    float reef = smoothstep(0.52, 0.7, rn) * smoothstep(0.3, 0.62, depthV) * (1.0 - smoothstep(0.84, 0.92, depthV));
    body = mix(body, vec3(0.1, 0.3, 0.26) + 0.1 * n2.x, reef * 0.7 * uReef);                               // coral heads showing through
  }
  body *= 0.85 + 0.15 * n1.x;
  vec3 col = mix(body, refl, clamp(fres * (1.0 - 0.5 * shallow), 0.0, 1.0));
  float sd = max(dot(R, uSunDir), 0.0);
  col += uSunColor * pow(sd, uGlint.x) * uGlint.y + uSunColor * pow(sd, uGlint.z) * uGlint.w;
  float gw = uReef > 0.0 ? 1.0 : uGlit;                                                                     // glitter weight: the reef always, other waters only when asked for
  if (gw > 0.0) {                                                                                           // sun glitter: sparkling facets inside the glare lobe
    float spk = smoothstep(0.62, 0.9, texture2D(tFoam, p * 0.35 + vec2(uTime * 0.05, uTime * 0.03)).r * (0.6 + 0.8 * n3.x));
    col += uSunColor * spk * (pow(sd, uGlitter.x) * uGlitter.y + pow(sd, 2.0) * uGlitter.z) * (1.0 - clamp(dist / 6000.0, 0.0, 1.0)) * gw;
  }
  // shore foam
  float shoreBand = smoothstep(0.78, 0.84, depthV) * (1.0 - smoothstep(0.86, 0.93, depthV));
  float f = texture2D(tFoam, p * 0.02 + vec2(uTime * 0.01, 0.0)).r;
  float f2 = texture2D(tFoam, p * 0.05 - vec2(0.0, uTime * 0.02)).r;
  float foam = clamp(shoreBand * (0.35 + 1.4 * f * f2 * (0.6 + 0.4 * sin(uTime * 1.2 + depthV * 40.0))), 0.0, 1.0);
  col = mix(col, vec3(1.0), foam * 0.9 * uFull);
  if (uReef > 0.0) {                                                                                        // surf: wave fronts rolling up the beach + wet edge
    float ph = depthV * 70.0 - uTime * 1.4 + n1.y * 2.0;
    float front = smoothstep(0.55, 0.95, sin(ph)) * smoothstep(0.76, 0.82, depthV) * (1.0 - smoothstep(0.86, 0.9, depthV));
    col = mix(col, vec3(1.0), front * 0.55 * (0.5 + f));
    col = mix(col, uShallow * 1.3, smoothstep(0.88, 0.93, depthV) * 0.5);
  }
  float alpha = mix(0.82, 1.0, 1.0 - shallow);
  if (uReef > 0.0 && uFull > 0.5) alpha = max(alpha, mix(0.82, 1.0, smoothstep(5.0, 22.0, seenDepth(-V))));   // clear only over a shallow floor, as seen along the line
  gl_FragColor = vec4(col, mix(1.0, alpha, uFull));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createWater(env, game, { height, bounds, deep = 0x0a4f85, shallow = 0x3fd8c8, level = 0, maskRes = 1024, reef = 0, glitter = 0 }) {
  const mask = bakeShoreMask(height, bounds, maskRes), texN = game.assets.tex('water_n'), texFoam = game.assets.tex('foam');
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tN: { value: texN }, tFoam: { value: texFoam }, tShore: { value: mask },
    uBounds: { value: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ)) },
    uTime: { value: 0 }, uReef: { value: reef }, uGlit: { value: glitter }, uFull: { value: game.q.water === 'full' ? 1 : 0 },
    uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) },
    uTop: { value: env.skyTop }, uMid: { value: env.skyMid ?? env.skyTop.clone().lerp(env.skyHorizon, 0.55) }, uHorizon: { value: env.skyHorizon },
    uSunDir: { value: env.sunDir }, uSunColor: { value: env.sunColor },
    uGlow: { value: new THREE.Vector4(...(env.sunGlow ?? SUN_GLOW)) }, uGlint: { value: new THREE.Vector4(...(env.sunGlint ?? SUN_GLINT)) }, uGlitter: { value: new THREE.Vector3(...(env.sunGlitter ?? SUN_GLITTER)) },
  }]);
  // merge() CLONES texture values. The cloned shore mask owns a GL upload that mask.dispose() never freed (one 640-1024 px texture leaked per race, E-06),
  // and cloned asset textures are never disposed at all: hand the originals back so dispose() below frees what the material really samples.
  uniforms.tN.value = texN; uniforms.tFoam.value = texFoam; uniforms.tShore.value = mask;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, fog: true, transparent: true, depthWrite: true });
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat); mesh.scale.set(60000, 1, 60000); mesh.position.y = level; mesh.frustumCulled = false; mesh.name = 'sea'; mesh.renderOrder = -1;
  return {
    group: mesh,
    update(dt, g, course, cam) {
      uniforms.uTime.value += dt; mesh.position.x = Math.round(cam.position.x / 64) * 64; mesh.position.z = Math.round(cam.position.z / 64) * 64;
      uniforms.uFull.value = g.q.water === 'full' ? 1 : 0;
    },
    dispose() { geo.dispose(); mat.dispose(); mask.dispose(); },
  };
}
