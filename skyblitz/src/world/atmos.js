// Atmosphere pieces for the valley courses. Each factory returns a course part { group, update, dispose }. Owner: world agent.
//   createAurora(opts)          animated aurora curtains in the sky (additive ribbons with moving rays), follows the camera
//   createSteam(emitters, opts) one Points draw call of rising soft mist / spray puffs (waterfall base, hot springs, dust)
//   createShafts(list, opts)    god-ray shafts: axial billboards with a soft edge and drifting dust (arches, slot canyon, cave mouths)
//   createDustDevils(list, o)   twisting dust columns
//   createGlowPoints(list)      one draw of additive glow sprites (lanterns, beacons); createPools(list, env): frozen / still pools
//   createBirds(flocks, opts)   circling bird silhouettes, animated on the GPU
//   createAltitudeFog(opts)     thins the scene fog and fades cloud puffs as the camera climbs far above the route (clear overview shots)
import * as THREE from 'three';
import { mulberry32 } from '../util.js';

const TAIL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const HASH = `
float h11(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

// ------------------------------------------------------------------------------------------------------------------ aurora
const AUR_VS = `
attribute float aSeed;
varying vec2 vUv; varying float vSeed;
void main(){ vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const AUR_FS = HASH + `
uniform float uTime, uInt; uniform vec3 uA, uB, uC;
varying vec2 vUv; varying float vSeed;
void main(){
  float x = vUv.x * 70.0 + vSeed * 31.0, t = uTime;
  float ray = n1(x * 0.55 + t * 0.20) * 0.5 + n1(x * 1.9 - t * 0.31) * 0.3 + n1(x * 5.3 + t * 0.7) * 0.2;
  float rays = smoothstep(0.30, 0.86, ray);
  float fold = n1(vUv.x * 7.0 + vSeed * 5.0 + t * 0.05);
  float y = vUv.y;
  float vert = smoothstep(0.0, 0.05, y) * pow(max(1.0 - y, 0.0), 1.55);
  vec3 c = mix(uA, uB, smoothstep(0.08, 0.5, y));
  c = mix(c, uC, smoothstep(0.42, 0.95, y) * (0.45 + 0.55 * fold));
  c += uC * smoothstep(0.12, 0.0, y) * 0.5;
  float ends = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
  float a = rays * vert * (0.3 + 0.95 * fold) * ends * uInt;
  if (a < 0.004) discard;
  gl_FragColor = vec4(c * a, 1.0);` + TAIL + `}`;

/** Aurora curtains: `curtains` ribbons of azimuth width ~`arc` rad around the sky at `radius` m. Colours A (low) -> B (mid) -> C (high fringe). */
export function createAurora({ radius = 5000, curtains = 3, arc = 1.35, baseY = 1250, height = 1900, seed = 4, intensity = 1, a = 0x25ff8a, b = 0x20d6e8, c = 0xff3ea8 } = {}) {
  const rnd = mulberry32(seed), N = 72, pos = [], uv = [], sd = [], idx = [];
  for (let k = 0; k < curtains; k++) {
    const az0 = (k / curtains) * Math.PI * 2 + rnd() * 0.5, R = radius * (0.85 + 0.3 * rnd()), hb = baseY * (0.8 + 0.5 * rnd()), hh = height * (0.75 + 0.5 * rnd()), s = rnd(), ph = rnd() * 6;
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = i / N, az = az0 + (u - 0.5) * arc, wob = Math.sin(u * 5 + ph) * 0.12 + Math.sin(u * 13 + ph * 2) * 0.04;
      const rr = R * (1 + 0.12 * Math.sin(u * 3 + ph));
      for (let j = 0; j < 2; j++) {
        pos.push(Math.cos(az) * rr, hb * (1 + wob) + j * hh, Math.sin(az) * rr); uv.push(u, j); sd.push(s);
      }
      if (i < N) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1)); geo.setIndex(idx);
  const u = { uTime: { value: 0 }, uInt: { value: intensity }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uC: { value: new THREE.Color(c) } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: AUR_VS, fragmentShader: AUR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -500; mesh.name = 'aurora';
  return { group: mesh, uniforms: u, update(dt, g, course, cam) { u.uTime.value += dt; mesh.position.set(cam.position.x, 0, cam.position.z); }, dispose() { geo.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------------------------------------------------------ steam / mist / spray
const STEAM_VS = `
attribute vec3 aBase; attribute vec4 aP; attribute vec3 aW;     // size m, rise m, cycles per s, phase | wind x/z + spin
uniform float uTime, uPx, uGrow;
varying float vA; varying float vLife;
void main(){
  float life = fract(uTime * aP.z + aP.w);
  vec3 p = aBase + vec3(aW.x * life * aP.y * 0.5 + sin(life * 6.0 + aP.w * 20.0) * aP.x * 0.12, aP.y * life, aW.y * life * aP.y * 0.5);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  float size = aP.x * (0.55 + uGrow * life);
  gl_PointSize = clamp(size * uPx / max(d, 1.0), 1.0, 900.0);
  vLife = life;
  vA = sin(life * 3.14159) * smoothstep(10.0, 70.0, d) * (1.0 - smoothstep(1800.0, 3400.0, d)) * step(0.0, d);
  gl_Position = projectionMatrix * mv;
}`;
const STEAM_FS = `
uniform vec3 uColor; uniform float uOpacity;
varying float vA; varying float vLife;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0;
  float a = pow(max(1.0 - r, 0.0), 1.6) * vA * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 - 0.25 * vLife), a);
}`;

/**
 * Rising puffs. emitters: [{ x, y, z, radius (spawn spread), count, size, rise, rate (cycles/s), wind: [x, z] }]. One Points draw call.
 * color / opacity / grow are per system (make a second system for spray).
 */
export function createSteam(emitters, { color = 0xdfeeff, opacity = 0.5, grow = 1.3, seed = 7, additive = false } = {}) {
  const rnd = mulberry32(seed);
  let n = 0; for (const e of emitters) n += e.count;
  const base = new Float32Array(n * 3), P = new Float32Array(n * 4), W = new Float32Array(n * 3);
  let k = 0;
  for (const e of emitters) {
    for (let i = 0; i < e.count; i++, k++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * (e.radius ?? 20);
      base[k * 3] = e.x + Math.cos(a) * r; base[k * 3 + 1] = e.y + (rnd() - 0.5) * 2; base[k * 3 + 2] = e.z + Math.sin(a) * r * (e.squash ?? 1);
      P[k * 4] = (e.size ?? 20) * (0.6 + 0.8 * rnd()); P[k * 4 + 1] = (e.rise ?? 60) * (0.7 + 0.5 * rnd()); P[k * 4 + 2] = (e.rate ?? 0.12) * (0.7 + 0.6 * rnd()); P[k * 4 + 3] = rnd();
      W[k * 3] = (e.wind?.[0] ?? 0) * (0.6 + 0.8 * rnd()); W[k * 3 + 1] = (e.wind?.[1] ?? 0) * (0.6 + 0.8 * rnd()); W[k * 3 + 2] = rnd();
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3)); geo.setAttribute('aP', new THREE.BufferAttribute(P, 4)); geo.setAttribute('aW', new THREE.BufferAttribute(W, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  const u = { uTime: { value: 0 }, uPx: { value: 700 }, uGrow: { value: grow }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: STEAM_VS, fragmentShader: STEAM_FS, transparent: true, depthWrite: false, fog: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4; pts.name = 'steam';
  const sz = new THREE.Vector2();
  return {
    group: pts,
    update(dt, g, course, cam) {
      u.uTime.value += dt;
      g.renderer.getDrawingBufferSize(sz);
      u.uPx.value = sz.y * 0.5 * cam.projectionMatrix.elements[5];
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------------------------ light shafts
const SHAFT_VS = `
attribute vec4 aData;                    // length, width, intensity, phase
varying vec2 vUv; varying float vI; varying float vPh;
void main(){
  mat4 im = modelMatrix * instanceMatrix;
  vec3 c = im[3].xyz, axis = normalize(-im[1].xyz);
  vec3 toCam = cameraPosition - c;
  vec3 side = normalize(cross(axis, toCam) + vec3(1e-5));
  vec3 p = c + axis * (position.y * aData.x) + side * (position.x * aData.y * (0.35 + 0.65 * position.y));
  vUv = vec2(position.x + 0.5, position.y); vI = aData.z; vPh = aData.w;
  float d = length(toCam);
  vI *= smoothstep(14.0, 70.0, d) * (1.0 - smoothstep(2200.0, 3600.0, d));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const SHAFT_FS = HASH + `
uniform float uTime; uniform vec3 uColor;
varying vec2 vUv; varying float vI; varying float vPh;
void main(){
  float edge = pow(max(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0), 1.4);
  float along = smoothstep(0.0, 0.1, vUv.y) * pow(max(1.0 - vUv.y, 0.0), 0.8);
  float dust = 0.65 + 0.35 * n2(vec2(vUv.x * 9.0 + vPh, vUv.y * 5.0 - uTime * 0.35));
  float a = edge * along * dust * vI;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, 1.0);` + TAIL + `}`;

/** Light shafts: list [{ pos: Vector3 (top of the shaft), dir: Vector3 (unit, pointing down the beam), length, width, intensity }]. */
export function createShafts(list, { color = new THREE.Color(1.0, 0.78, 0.5) } = {}) {
  const quad = new THREE.PlaneGeometry(1, 1, 1, 1); quad.translate(0, 0.5, 0);      // x -.5..+.5, y 0..1
  const n = list.length, d = new Float32Array(n * 4), rnd = mulberry32(11);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), down = new THREE.Vector3(0, -1, 0);
  const u = { uTime: { value: 0 }, uColor: { value: color } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const im = new THREE.InstancedMesh(quad, mat, n);
  list.forEach((o, i) => {
    q.setFromUnitVectors(down, o.dir); im.setMatrixAt(i, m.compose(o.pos, q, s));
    d.set([o.length, o.width, o.intensity ?? 1, rnd() * 20], i * 4);
  });
  quad.setAttribute('aData', new THREE.InstancedBufferAttribute(d, 4));
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = 4; im.name = 'shafts';
  return { group: im, update(dt) { u.uTime.value += dt; }, dispose() { quad.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------------------------------------------------------ dust devils
const DEV_VS = `
attribute vec4 aD;                       // phase, speed, sway, unused
uniform float uTime;
varying vec2 vUv; varying float vA; varying vec3 vN;
void main(){
  vec3 p = position;                      // unit cone: y 0..1, radius grows with y
  float h = p.y;
  float sw = sin(uTime * aD.y + aD.x + h * 3.0) * aD.z * h * h, sw2 = cos(uTime * aD.y * 0.8 + aD.x * 1.7 + h * 2.3) * aD.z * h * h;
  p.x += sw; p.z += sw2;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vUv = vec2(atan(position.z, position.x) / 6.2831853 + 0.5, h);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normalize(vec3(position.x, 0.2, position.z)));
  vec4 mv = viewMatrix * w;
  float d = -mv.z;
  vA = smoothstep(20.0, 120.0, d) * (1.0 - smoothstep(2600.0, 4200.0, d)) * smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(0.75, 1.0, h));
  vA *= 0.55 + 0.45 * aD.w;
  gl_Position = projectionMatrix * mv;
}`;
const DEV_FS = HASH + `
uniform float uTime; uniform vec3 uColor, uSun;
varying vec2 vUv; varying float vA; varying vec3 vN;
void main(){
  float sp = vUv.x * 5.0 + vUv.y * 9.0 - uTime * 1.8;
  float n = n2(vec2(sp, vUv.y * 6.0 - uTime * 0.9)) * 0.6 + n2(vec2(sp * 2.3, vUv.y * 13.0)) * 0.4;
  float a = smoothstep(0.32, 0.8, n) * vA * 0.55;
  if (a < 0.004) discard;
  vec3 col = uColor * (0.55 + 0.6 * clamp(dot(normalize(vN), uSun) * 0.5 + 0.5, 0.0, 1.0));
  gl_FragColor = vec4(col, a);` + TAIL + `}`;

/** Dust devils: list [{ pos: Vector3 (ground), height, radius (at the top), sway }]. */
export function createDustDevils(list, { color = new THREE.Color(0.95, 0.66, 0.42), sun = new THREE.Vector3(0, 1, 0) } = {}) {
  const geo = new THREE.CylinderGeometry(1, 0.16, 1, 18, 12, true); geo.translate(0, 0.5, 0);
  const n = list.length, d = new Float32Array(n * 4), rnd = mulberry32(23);
  const u = { uTime: { value: 0 }, uColor: { value: color }, uSun: { value: sun.clone().normalize() } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: DEV_VS, fragmentShader: DEV_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const im = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  list.forEach((o, i) => { im.setMatrixAt(i, m.compose(o.pos, q, sc.set(o.radius, o.height, o.radius))); d.set([rnd() * 20, 0.6 + rnd() * 0.8, o.sway ?? o.radius * 0.5, rnd()], i * 4); });
  geo.setAttribute('aD', new THREE.InstancedBufferAttribute(d, 4));
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = 4; im.name = 'dustdevils';
  return { group: im, update(dt) { u.uTime.value += dt; }, dispose() { geo.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------------------------------------------------------ glow sprites (lanterns, beacons)
const GLOW_VS = `
attribute vec3 aCol; attribute vec2 aP;          // aP: size m, phase
uniform float uTime, uPx;
varying vec3 vC; varying float vA;
void main(){
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  float d = -mv.z;
  float fl = 0.9 + 0.1 * sin(uTime * (2.5 + aP.y * 4.0) + aP.y * 40.0);
  gl_PointSize = clamp(aP.x * uPx / (max(d, 1.0) + 150.0), 2.0, 150.0);      // soft attenuation: readable from far, never a lens-filling blob up close
  vC = aCol * fl;
  vA = step(0.0, d) * smoothstep(5.0, 40.0, d);
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FS = `
varying vec3 vC; varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = (exp(-r * r * 16.0) * 1.1 + pow(max(1.0 - r, 0.0), 2.6) * 0.5) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vC * a, 1.0);
}`;

/** One Points draw call of additive glow sprites: list [{ pos: Vector3, color: Color (HDR ok), size (m, halo diameter) }]. */
export function createGlowPoints(list, { renderOrder = 6 } = {}) {
  const n = list.length, col = new Float32Array(n * 3), P = new Float32Array(n * 2), rnd = mulberry32(51);
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
  list.forEach((o, i) => { pos.set([o.pos.x, o.pos.y, o.pos.z], i * 3); col.set([o.color.r, o.color.g, o.color.b], i * 3); P.set([o.size, rnd()], i * 2); });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aP', new THREE.BufferAttribute(P, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  const u = { uTime: { value: 0 }, uPx: { value: 700 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = renderOrder; pts.name = 'glows';
  const sz = new THREE.Vector2();
  return {
    group: pts,
    update(dt, g, course, cam) { u.uTime.value += dt; g.renderer.getDrawingBufferSize(sz); u.uPx.value = sz.y * 0.5 * cam.projectionMatrix.elements[5]; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------------------------ meltwater pools
const FOG_V = '#include <common>\n#include <fog_pars_vertex>\n';
const FOG_F = '#include <common>\n#include <fog_pars_fragment>\n';
const POOL_VS = FOG_V + `
varying vec3 vW; varying vec2 vL;
void main(){
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vL = position.xz;
  vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const POOL_FS = FOG_F + HASH + `
uniform float uTime; uniform vec3 uTop, uHor, uDeep, uSun, uIce;
varying vec3 vW; varying vec2 vL;
void main(){
  vec2 q = vW.xz * 0.05;
  float r1 = n2(q + vec2(uTime * 0.04, 0.0)), r2 = n2(q * 2.3 - vec2(0.0, uTime * 0.06));
  vec3 N = normalize(vec3((r1 - 0.5) * 0.35, 1.0, (r2 - 0.5) * 0.35));
  vec3 V = normalize(cameraPosition - vW);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 R = reflect(-V, N); float up = clamp(R.y, 0.0, 1.0);
  vec3 sky = mix(uHor, uTop, smoothstep(0.0, 0.6, up));
  vec3 col = mix(uDeep, sky, clamp(fres * 1.4 + 0.1, 0.0, 1.0));
  col += pow(max(dot(R, uSun), 0.0), 50.0) * vec3(1.0, 0.55, 0.7) * 1.6;
  float rad = length(vL);
  float crust = smoothstep(0.82, 0.98, rad + n2(vW.xz * 0.11) * 0.22 - 0.06);
  float skin = smoothstep(0.6, 0.76, n2(vW.xz * 0.035 + 4.0));
  vec3 ice = mix(uIce * 0.7, uIce, n2(vW.xz * 0.35));
  col = mix(col, ice, max(crust, skin * 0.6));
  gl_FragColor = vec4(col, 0.96 * (1.0 - smoothstep(0.9, 1.0, rad)));` + TAIL + `
  #include <fog_fragment>
}`;

/** Instanced meltwater ponds (unit discs scaled to rx/rz) with a frozen crust and drifting sky reflections. list: [{ x, y, z, rx, rz }]. */
export function createPools(list, env, { deep = new THREE.Color(0.012, 0.05, 0.11), ice = new THREE.Color(0.78, 0.9, 1.0) } = {}) {
  const geo = new THREE.CircleGeometry(1, 36); geo.rotateX(-Math.PI / 2);
  const u = { uTime: { value: 0 }, uTop: { value: env.skyTop.clone() }, uHor: { value: env.skyHorizon.clone() }, uDeep: { value: deep }, uSun: { value: env.sunDir.clone() }, uIce: { value: ice } };
  const mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, u]), vertexShader: POOL_VS, fragmentShader: POOL_FS, transparent: true, depthWrite: false, fog: true });
  Object.assign(mat.uniforms, u);
  const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  list.forEach((o, i) => { q.setFromAxisAngle(ax, o.yaw ?? 0); im.setMatrixAt(i, m.compose(p.set(o.x, o.y, o.z), q, s.set(o.rx, 1, o.rz ?? o.rx))); });
  im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = -1; im.name = 'pools';
  return { group: im, update(dt) { u.uTime.value += dt; }, dispose() { geo.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------------------------------------------------------ birds
const BIRD_VS = `
attribute vec3 aC;            // flock centre
attribute vec4 aB;            // phase, orbit radius, height above the centre, angular speed (rad/s)
uniform float uTime, uSize;
varying float vW;
void main(){
  float a = aB.x + uTime * aB.w;
  vec3 rad = vec3(cos(a), 0.0, sin(a)), tang = vec3(-sin(a), 0.0, cos(a)) * sign(aB.w);
  vec3 c = aC + rad * aB.y + vec3(0.0, aB.z + sin(a * 1.7 + aB.x * 5.0) * 7.0, 0.0);
  float flap = sin(uTime * 6.5 + aB.x * 17.0) * 0.5;
  vec3 p = position * uSize;
  float ax = abs(position.x);
  p.y += (ax * ax * 0.9 + ax * 0.15) * flap * uSize - position.x * 0.14 * uSize;      // wing beat (tips swing most), inner wing low in the bank
  vec3 world = c - rad * p.x * sign(aB.w) + vec3(0.0, p.y, 0.0) - tang * p.z;
  vW = abs(position.x);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;
const BIRD_FS = `
uniform vec3 uColor, uTip;
varying float vW;
void main(){ gl_FragColor = vec4(mix(uColor, uTip, vW), 1.0);` + TAIL + `}`;

/** Circling birds (one draw call): flocks [{ center: Vector3, radius: [min, max], height: [min, max], count, speed (m/s) }]. Silhouettes at golden hour. */
export function createBirds(flocks, { size = 3.2, color = new THREE.Color(0.06, 0.035, 0.03), tip = new THREE.Color(0.2, 0.1, 0.07), seed = 5 } = {}) {
  const rnd = mulberry32(seed), g = new THREE.InstancedBufferGeometry(), n = flocks.reduce((a, f) => a + f.count, 0);
  // body + two bent wings (root, elbow, tip): nose at -z, wings along x
  const N = [0, 0, -0.5], T = [0, 0, 0.32], Lr = [-0.14, 0, -0.12], Lm = [-0.62, 0, -0.04], Lt = [-1.1, 0, 0.26], Rr = [0.14, 0, -0.12], Rm = [0.62, 0, -0.04], Rt = [1.1, 0, 0.26];
  const P = new Float32Array([...N, ...Lr, ...T, ...N, ...T, ...Rr, ...Lr, ...Lm, ...T, ...Lm, ...Lt, ...T, ...Rr, ...T, ...Rm, ...Rm, ...T, ...Rt]);
  const C = new Float32Array(n * 3), B = new Float32Array(n * 4);
  let k = 0;
  for (const f of flocks) for (let i = 0; i < f.count; i++, k++) {
    const r = f.radius[0] + rnd() * (f.radius[1] - f.radius[0]), dir = f.dir ?? 1;
    C.set([f.center.x, f.center.y, f.center.z], k * 3);
    B.set([rnd() * 6.2832, r, f.height[0] + rnd() * (f.height[1] - f.height[0]), dir * (f.speed * (0.85 + 0.3 * rnd())) / r], k * 4);
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 3)); g.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  g.instanceCount = n;
  const u = { uTime: { value: 0 }, uSize: { value: size }, uColor: { value: color }, uTip: { value: tip } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: BIRD_VS, fragmentShader: BIRD_FS, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.name = 'birds';
  return { group: mesh, update(dt) { u.uTime.value += dt; }, dispose() { g.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------------------------------------------------------ overview clarity
/**
 * Camera far above the route (overview / replay shots): the scene fog thins and the cloud puffs fade, so the whole course reads.
 * puffs: the createCloudPuffs() result (needs .fade); refY: route height; from/to: metres above refY where the effect starts / is full.
 */
export function createAltitudeFog({ puffs = [], refY = 100, from = 260, to = 1100, fogKeep = 0.3, puffKeep = 0.0 } = {}) {
  return {
    update(dt, g, course, cam) {
      const f = g.scene.fog; if (!f || !f.isFogExp2) return;
      if (f.__base == null) f.__base = f.density;
      const t = THREE.MathUtils.smoothstep(cam.position.y - refY, from, to);
      f.density = f.__base * (1 - (1 - fogKeep) * t);
      for (const p of puffs) if (p?.fade) p.fade.value = 1 - (1 - puffKeep) * t;
    },
    dispose() { },
  };
}
