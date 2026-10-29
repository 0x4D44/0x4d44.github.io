// Sea: one big plane that follows the camera; animated normal maps, fresnel sky reflection, sun glitter, shore foam and depth tint driven by a
// low-res shore mask baked from the course height function. Owner: world agent.
import * as THREE from 'three';

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
varying vec3 vW;
vec3 skyCol(vec3 d){
  float up = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, up));
  c = mix(c, uTop, smoothstep(0.12, 0.85, up));
  float sd = max(dot(d, uSunDir), 0.0);
  return c + uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 40.0) * 0.45);
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
  col += uSunColor * pow(sd, 220.0) * 5.0 + uSunColor * pow(sd, 18.0) * 0.18;
  float gw = uReef > 0.0 ? 1.0 : uGlit;                                                                     // glitter weight: the reef always, other waters only when asked for
  if (gw > 0.0) {                                                                                           // sun glitter: sparkling facets inside the glare lobe
    float spk = smoothstep(0.62, 0.9, texture2D(tFoam, p * 0.35 + vec2(uTime * 0.05, uTime * 0.03)).r * (0.6 + 0.8 * n3.x));
    col += uSunColor * spk * (pow(sd, 7.0) * 2.4 + pow(sd, 2.0) * 0.12) * (1.0 - clamp(dist / 6000.0, 0.0, 1.0)) * gw;
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
  gl_FragColor = vec4(col, mix(1.0, alpha, uFull));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createWater(env, game, { height, bounds, deep = 0x0a4f85, shallow = 0x3fd8c8, level = 0, maskRes = 1024, reef = 0, glitter = 0 }) {
  const mask = bakeShoreMask(height, bounds, maskRes);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tN: { value: game.assets.tex('water_n') }, tFoam: { value: game.assets.tex('foam') }, tShore: { value: mask },
    uBounds: { value: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ)) },
    uTime: { value: 0 }, uReef: { value: reef }, uGlit: { value: glitter }, uFull: { value: game.q.water === 'full' ? 1 : 0 },
    uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) },
    uTop: { value: env.skyTop }, uMid: { value: env.skyMid ?? env.skyTop.clone().lerp(env.skyHorizon, 0.55) }, uHorizon: { value: env.skyHorizon },
    uSunDir: { value: env.sunDir }, uSunColor: { value: env.sunColor },
  }]);
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
