// Wheel spray for fords and puddles: GPU-animated droplets, mist sheets and wake rings around the car's four wheels.
// Fed by the renderer's car position/velocity and the stage's water spans; no per-frame allocation.

/** Pure: how much spray (0..1) the car throws. inWater = on a declared water span; wet = road wetness 0..1. */
export function sprayAmount(inWater, wet, speed) {
  const sp = Math.min(1, Math.max(0, (speed - 1.5) / 14));
  if (inWater) return sp;
  return wet > 0.7 ? Math.min(0.28, sp * 0.3 * (wet - 0.7) / 0.3) : 0;
}

/** Pure: is (x, z) inside any water span {x, z, halfLen, reach}? */
export function inWaterSpan(water, x, z) {
  for (const w of water ?? []) {
    const r = (w.halfLen ?? 10) + 2.5;
    const dx = x - w.x, dz = z - w.z;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

const VERT = /* glsl */ `
attribute vec3 aSeed; attribute vec2 aCorner;
uniform vec3 uCar; uniform vec2 uFwd; uniform float uTime; uniform float uSpeed; uniform float uGround;
varying vec2 vC; varying float vA;
void main(){
  float w = floor(aSeed.y * 3.999);               // wheel 0..3
  float side = mod(w, 2.0) < 0.5 ? -1.0 : 1.0;
  float axle = w < 1.5 ? 1.25 : -1.25;
  vec2 right = vec2(-uFwd.y, uFwd.x);
  vec2 wp = uCar.xz + right * side * 0.95 + uFwd * axle;
  #ifdef RING
    float ph = fract(uTime * 0.9 + aSeed.x);
    float s = 0.15 + ph * 1.5;
    vC = aCorner; vA = (1.0 - ph) * (1.0 - ph);
    vec3 c = vec3(wp.x, uGround, wp.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(c + vec3(aCorner.x * s, 0.0, aCorner.y * s), 1.0);
  #else
    float life = 0.75;
    float ph = fract(uTime * 1.7 + aSeed.x);
    float t = ph * life;
    float sp = clamp(uSpeed / 25.0, 0.2, 1.4);
    vec2 out2 = right * side * (1.2 + 3.0 * aSeed.z) * sp;
    vec2 back = -uFwd * uSpeed * 0.25 * (0.4 + aSeed.x);
    float up = (2.2 + 3.5 * aSeed.z) * sp;
    vec3 p = vec3(wp.x + (out2.x + back.x) * t, uGround + 0.1 + up * t - 4.9 * t * t, wp.y + (out2.y + back.y) * t);
    p.y = max(p.y, uGround);
    #ifdef SHEET
      float s = 0.18 + ph * 0.6 * sp + aSeed.z * 0.2;
      vA = (1.0 - ph) * 0.2;
    #else
      float s = 0.035 + 0.04 * aSeed.z;
      vA = (1.0 - ph * ph) * 0.95;
    #endif
    vC = aCorner;
    vec3 toCam = normalize(cameraPosition - p);
    vec3 r2 = normalize(cross(vec3(0.0, 1.0, 0.0), toCam)); vec3 u2 = cross(toCam, r2);
    gl_Position = projectionMatrix * viewMatrix * vec4(p + (r2 * aCorner.x + u2 * aCorner.y) * s, 1.0);
  #endif
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uAmt; uniform vec3 uColor;
varying vec2 vC; varying float vA;
void main(){
  float r = length(vC);
  #ifdef RING
    float a = smoothstep(1.0, 0.8, r) * smoothstep(0.55, 0.85, r) * vA * 0.55;
  #else
    float a = smoothstep(1.0, 0.2, r) * vA;
  #endif
  a *= uAmt;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function quads(THREE, count, seeds) {
  const aSeed = new Float32Array(count * 12), aCorner = new Float32Array(count * 8), idx = new Uint32Array(count * 6), pos = new Float32Array(count * 12);
  const cr = [-1, -1, 1, -1, -1, 1, 1, 1];
  for (let i = 0; i < count; i++) {
    const s = seeds(i);
    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      aSeed.set(s, v * 3); aCorner[v * 2] = cr[c * 2]; aCorner[v * 2 + 1] = cr[c * 2 + 1];
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 3));
  g.setAttribute("aCorner", new THREE.BufferAttribute(aCorner, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

export function createSplash(THREE) {
  const group = new THREE.Group();
  group.name = "splash";
  const hash = (i, k) => { let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 5, 0x85ebca6b); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const U = {
    uCar: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector2(0, -1) }, uTime: { value: 0 }, uSpeed: { value: 0 },
    uGround: { value: 0 }, uAmt: { value: 0 }, uColor: { value: new THREE.Color(0.85, 0.9, 0.95) },
  };
  const mk = (n, defs) => {
    const m = new THREE.Mesh(quads(THREE, n, (i) => [hash(i, 1), (hash(i, 2) * 0.999 + (i % 4)) / 4, hash(i, 3)]),
      new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false, defines: defs, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 11; m.visible = false; group.add(m);
    return m;
  };
  const drops = mk(360, {}), sheets = mk(72, { SHEET: 1 }), rings = mk(16, { RING: 1 });
  const api = {
    group,
    /** carPos/carVel in world space; amount from sprayAmount(). */
    update(time, carPos, carVel, groundY, amount, lightLevel) {
      const sp = Math.hypot(carVel.x, carVel.z);
      const on = amount > 0.02;
      drops.visible = sheets.visible = rings.visible = on;
      if (!on) return;
      U.uCar.value.copy(carPos);
      if (sp > 1) U.uFwd.value.set(carVel.x / sp, carVel.z / sp);
      U.uTime.value = time; U.uSpeed.value = sp; U.uGround.value = groundY; U.uAmt.value = amount;
      const l = Math.max(0.35, Math.min(1.1, lightLevel));
      U.uColor.value.setRGB(0.85 * l, 0.9 * l, 0.95 * l);
    },
    dispose() { for (const m of [drops, sheets, rings]) { m.geometry.dispose(); m.material.dispose(); } group.clear(); },
  };
  return api;
}
