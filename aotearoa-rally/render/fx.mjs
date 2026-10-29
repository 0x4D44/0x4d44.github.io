// FX: pooled instanced-quad particle systems (soft sun-lit dust/spray/smoke, hard chips/debris/drops,
// additive sparks/flames) plus a rain-on-glass overlay with a wiper. No per-frame allocation.
// The Pool class and the emission helpers are THREE-free so they can be unit-tested in Node.
import { clamp, clamp01, lerp, smoothstep } from "../core/mathx.mjs";
import { makeRng } from "../core/rng.mjs";
import { SURFACE, SURFACE_INFO } from "../core/surfaces.mjs";

export const KIND = { STONE: 0, CLOD: 1, SHARD: 2, LEAF: 3, DROP: 4, FLAKE: 5, SPARK: 0, FLAME: 1, EMBER: 2 };

/** Struct-of-arrays particle pool with a ring-buffer allocator. */
export class Pool {
  constructor(n, type = "soft") {
    this.n = n; this.type = type;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.data = new Float32Array(n * 4); // age01, size, rot, seed
    this.misc = new Float32Array(n * 2); // kind, stretch
    this.life = new Float32Array(n);
    this.age = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.rotV = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.wind = new Float32Array(n);
    this.peak = new Float32Array(n);
    this.bounce = new Float32Array(n);
    this.alive = new Uint8Array(n);
    this.next = 0; this.high = 0; this.live = 0;
  }
  /** Allocate one slot (overwrites the oldest when full). Returns its index. */
  spawn() {
    const i = this.next;
    this.next = (i + 1) % this.n;
    if (!this.alive[i]) this.live++;
    this.alive[i] = 1;
    this.age[i] = 0;
    if (i + 1 > this.high) this.high = i + 1;
    return i;
  }
  /** Fill one particle. Returns index. */
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, peak, o = null) {
    const i = this.spawn(), p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.life[i] = Math.max(0.02, life);
    this.size0[i] = s0; this.size1[i] = s1;
    const c = i * 4;
    this.col[c] = r; this.col[c + 1] = g; this.col[c + 2] = b; this.col[c + 3] = 0;
    this.peak[i] = peak;
    this.data[c] = 0; this.data[c + 1] = s0;
    this.data[c + 2] = o && o.rot !== undefined ? o.rot : 0;
    this.data[c + 3] = o && o.seed !== undefined ? o.seed : (i * 0.6180339) % 1;
    this.rotV[i] = o && o.rotV || 0;
    this.drag[i] = o && o.drag !== undefined ? o.drag : 1;
    this.grav[i] = o && o.grav || 0;
    this.wind[i] = o && o.wind || 0;
    this.bounce[i] = o && o.bounce || 0;
    this.misc[i * 2] = o && o.kind || 0;
    this.misc[i * 2 + 1] = o && o.stretch || 0;
    return i;
  }
  clear() { this.alive.fill(0); this.data.fill(0); this.col.fill(0); this.next = 0; this.high = 0; this.live = 0; }
  /**
   * Advance every live particle. wind = [wx,wz]; heightAt optional (hard pools bounce on it).
   * cam = { rx, ry, rz, ux, uy, uz } used to orient spark streaks.
   */
  update(dt, wx, wz, heightAt, cam) {
    let high = 0, live = 0;
    const { pos, vel, col, data, life, age, size0, size1, rotV, drag, grav, wind, peak, bounce, alive, misc } = this;
    const type = this.type;
    for (let i = 0; i < this.high; i++) {
      if (!alive[i]) continue;
      const a = age[i] + dt;
      const L = life[i];
      const c = i * 4, p = i * 3;
      if (a >= L) { alive[i] = 0; data[c + 1] = 0; col[c + 3] = 0; continue; }
      age[i] = a;
      const t = a / L;
      const k = Math.exp(-drag[i] * dt);
      let vx = vel[p], vy = vel[p + 1], vz = vel[p + 2];
      vy -= grav[i] * dt;
      const wc = wind[i];
      if (wc > 0) { const f = 1 - Math.exp(-wc * dt); vx += (wx - vx) * f; vz += (wz - vz) * f; vy += (0.0 - vy * 0.0) * f; }
      vx *= k; vz *= k; vy *= type === "soft" ? Math.exp(-drag[i] * 0.6 * dt) : k;
      let px = pos[p] + vx * dt, py = pos[p + 1] + vy * dt, pz = pos[p + 2] + vz * dt;
      if (heightAt && bounce[i] > 0) {
        const h = heightAt(px, pz);
        if (py < h + 0.02) {
          py = h + 0.02;
          if (vy < 0) { vy = -vy * bounce[i]; vx *= 0.7; vz *= 0.7; if (vy < 0.8) { vy = 0; vx *= 0.3; vz *= 0.3; } }
        }
      }
      vel[p] = vx; vel[p + 1] = vy; vel[p + 2] = vz;
      pos[p] = px; pos[p + 1] = py; pos[p + 2] = pz;
      data[c] = t;
      const e = 1 - (1 - t) * (1 - t);
      data[c + 1] = size0[i] + (size1[i] - size0[i]) * e;
      if (type === "glow" && misc[i * 2] === 0 && cam) {
        const sx = vx * cam.rx + vy * cam.ry + vz * cam.rz, sy = vx * cam.ux + vy * cam.uy + vz * cam.uz;
        data[c + 2] = Math.atan2(sy, sx);
        misc[i * 2 + 1] = clamp(Math.hypot(sx, sy) * 0.035, 0, 1.6);
      } else data[c + 2] += rotV[i] * dt;
      let al;
      if (type === "soft") al = peak[i] * smoothstep(0, 0.07, t) * Math.pow(1 - t, 1.4);
      else if (type === "hard") al = peak[i] * (t < 0.8 ? 1 : (1 - t) / 0.2);
      else al = peak[i] * (1 - t);
      col[c + 3] = al;
      live++;
      high = i + 1;
    }
    this.high = high; this.live = live;
    return live;
  }
}

/** Emission amount for one wheel (0..1.5). Pure. */
export function wheelSlipAmount(w) {
  return clamp(Math.max(Math.abs(w.slipRatio || 0) * 0.9, Math.abs(w.slipAngle || 0) * 3.0, w.skid || 0), 0, 1.5);
}
/** Dust emission rate (particles / second) for a wheel on a surface. Pure. */
export function dustRate(info, slip, speed, wetness, base = 95) {
  if (!info) return 0;
  const gate = Math.max(smoothstep(1.2, 9, Math.abs(speed)), clamp01(slip * 0.8));
  const wet = info.spray ? 1 : 1 - 0.85 * clamp01(wetness);
  return base * info.dust * wet * gate * clamp(0.16 + 0.95 * slip, 0, 1.4);
}

const _c = [0, 0, 0];
/** Convert hex number / THREE.Color / {r,g,b} / '#rrggbb' to [r,g,b] 0..1 in `out`. */
export function toRGB(v, out = _c) {
  if (typeof v === "number") { out[0] = ((v >> 16) & 255) / 255; out[1] = ((v >> 8) & 255) / 255; out[2] = (v & 255) / 255; }
  else if (typeof v === "string") { const n = parseInt(v.replace("#", ""), 16) || 0; return toRGB(n, out); }
  else if (v && typeof v.r === "number") { out[0] = v.r; out[1] = v.g; out[2] = v.b; }
  else if (Array.isArray(v)) { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; }
  else { out[0] = out[1] = out[2] = 0.7; }
  return out;
}

const VERT = /* glsl */ `
attribute vec2 corner;
attribute vec3 aPos; attribute vec4 aData; attribute vec4 aCol; attribute vec2 aMisc;
uniform vec3 uRight; uniform vec3 uUp;
varying vec2 vUv; varying vec4 vCol; varying vec4 vData; varying vec2 vMisc; varying vec3 vWorld;
void main(){
  float rot = aData.z; float cr = cos(rot), sr = sin(rot);
  vec2 c = corner;
  vec2 q = c;
  #ifdef GLOW
    if (aMisc.x < 0.5) q = vec2(c.x * (1.0 + aMisc.y * 3.0), c.y * 0.35);
  #endif
  #ifdef HARD
    float k = aMisc.x;
    if (k > 1.5 && k < 2.5) q = vec2(c.x * 1.5, c.y * 0.7);
    if (k > 2.5 && k < 3.5) q = vec2(c.x * 1.6, c.y * 0.7);
  #endif
  vec2 r = vec2(q.x*cr - q.y*sr, q.x*sr + q.y*cr);
  vec3 w = aPos + (uRight * r.x + uUp * r.y) * aData.y;
  #ifdef SOFT
    w.y += aData.y * 0.5;
  #endif
  vUv = c; vCol = aCol; vData = aData; vMisc = aMisc; vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (aData.y <= 0.0001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const COMMON_FRAG = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uCamPos;
uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uBack;
uniform vec3 uFogCol; uniform float uFogDens; uniform float uFogNear; uniform float uFogFar; uniform float uFogMode;
uniform vec3 uCarPos; uniform vec3 uCarFwd; uniform float uHead;
varying vec2 vUv; varying vec4 vCol; varying vec4 vData; varying vec2 vMisc; varying vec3 vWorld;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
vec3 headLight(vec3 wp){
  if (uHead < 0.01) return vec3(0.0);
  vec3 d = wp - uCarPos; float L = length(d); if (L < 0.5) return vec3(0.0);
  float c = dot(d / L, uCarFwd);
  return vec3(1.0, 0.9, 0.7) * uHead * smoothstep(0.78, 0.97, c) * (1.0 / (1.0 + L*L*0.004)) * 2.2;
}
vec3 applyFog(vec3 c, vec3 wp){
  float d = length(wp - uCamPos); float f;
  if (uFogMode > 1.5) f = 1.0 - exp(-uFogDens*uFogDens*d*d);
  else if (uFogMode > 0.5) f = smoothstep(uFogNear, uFogFar, d);
  else f = 0.0;
  return mix(c, uFogCol, clamp(f, 0.0, 1.0));
}`;

const FRAG_SOFT = /* glsl */ `
${COMMON_FRAG}
void main(){
  float r = length(vUv); if (r > 1.0) discard;
  float seed = vData.w;
  float n = vn(vUv*2.3 + seed*31.0), n2 = vn(vUv*5.5 - seed*17.0 + vData.x*1.7);
  float shape = smoothstep(1.0, 0.18 + 0.28*n, r);
  float a = shape * (0.62 + 0.38*n2) * vCol.a * smoothstep(-1.0, -0.2, vUv.y);
  if (a < 0.003) discard;
  vec3 nrm = normalize(uRight*vUv.x + uUp*vUv.y + uBack*sqrt(max(0.0, 1.0 - r*r)));
  float ndl = dot(nrm, uSunDir)*0.5 + 0.5;
  float cs = max(dot(normalize(vWorld - uCamPos), uSunDir), 0.0);
  float scatter = pow(cs, 5.0) * (1.0 - 0.5*shape);
  vec3 lit = uAmb + uSunCol * (ndl*ndl*0.85 + scatter*1.3) + headLight(vWorld);
  vec3 col = vCol.rgb * lit * (0.85 + 0.3*n2);
  gl_FragColor = vec4(applyFog(col, vWorld), a);
}`;

const FRAG_HARD = /* glsl */ `
${COMMON_FRAG}
void main(){
  float k = vMisc.x; vec2 p = vUv; float r = length(p);
  float seed = vData.w; float alpha = 1.0; float hl = 0.0;
  if (k < 0.5) { if (r > 1.0) discard; }
  else if (k < 1.5) { float wob = 0.75 + 0.25*vn(p*3.0 + seed*20.0); if (r > wob) discard; }
  else if (k < 2.5) { if (abs(p.x) + abs(p.y)*1.6 > 1.0) discard; hl = pow(abs(sin(vData.z*3.0 + seed*9.0)), 6.0); }
  else if (k < 3.5) { if (p.x*p.x + p.y*p.y*3.2 > 1.0) discard; }
  else if (k < 4.5) { if (r > 1.0) discard; alpha = 0.55; hl = smoothstep(0.55, 0.25, length(p - vec2(-0.3, 0.3)))*0.9; }
  else { if (r > 1.0) discard; hl = 0.3; }
  vec3 nrm = normalize(uRight*p.x + uUp*p.y + uBack*sqrt(max(0.0, 1.0 - min(r,1.0)*min(r,1.0))));
  float ndl = max(dot(nrm, uSunDir), 0.0);
  vec3 lit = uAmb + uSunCol * ndl * 0.9 + headLight(vWorld);
  vec3 col = vCol.rgb * lit + hl * uSunCol;
  gl_FragColor = vec4(applyFog(col, vWorld), alpha * clamp(vCol.a * 4.0, 0.0, 1.0));
}`;

const FRAG_GLOW = /* glsl */ `
${COMMON_FRAG}
void main(){
  float k = vMisc.x; float r = length(vUv); if (r > 1.0) discard;
  float t = vData.x; vec3 c; float a;
  if (k < 0.5) { float core = smoothstep(1.0, 0.0, abs(vUv.y)*2.2) * smoothstep(1.0, 0.2, abs(vUv.x)); c = mix(vec3(1.0,0.45,0.1), vec3(1.0,0.9,0.6), core*(1.0-t)); a = core; }
  else if (k < 1.5) { float g = smoothstep(1.0, 0.0, r); c = mix(vec3(0.25,0.45,1.0), vec3(1.0,0.5,0.12), smoothstep(0.0, 0.5, t)); c = mix(vec3(1.0,0.9,0.7), c, smoothstep(0.0, 0.35, r + t*0.6)); a = g*g; }
  else { float g = smoothstep(1.0, 0.0, r); c = vec3(1.0,0.55,0.15); a = g*g*g; }
  gl_FragColor = vec4(c * a * vCol.a * 1.6, 1.0) ;
  gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vWorld) * 1.0;
}`;

const LENS_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime; uniform float uRain; uniform float uAspect; uniform float uWipe; uniform float uWiperOn;
uniform vec3 uTint;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 uv = vUv; vec2 p = vec2((uv.x-0.5)*uAspect, uv.y - 0.5);
  // wiper
  vec2 piv = vec2(0.0, -0.62); vec2 d = p - piv; float ang = atan(d.x, d.y); float rad = length(d);
  float A = 1.05; float P = 2.4; float tt = uTime * uWiperOn;
  float tu = (ang + A)/(2.0*A) * P*0.5; float td = P*0.5 + (A - ang)/(2.0*A) * P*0.5;
  float wipeAge = min(mod(tt - tu, P), mod(tt - td, P));
  if (uWiperOn < 0.5) wipeAge = 1e5;
  float cur = abs(P*0.5*(1.0 - abs(mod(tt, P)/(P*0.5) - 1.0))*0.0);
  float angNow; { float ph = mod(tt, P)/(P*0.5); angNow = (ph < 1.0 ? ph : 2.0 - ph)*2.0*A - A; }
  float blade = smoothstep(0.012, 0.0, abs(ang - angNow)*rad) * step(rad, 1.25) * step(0.12, rad) * uWiperOn;
  // droplets
  float acc = 0.0; vec2 refr = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float sc = layer == 0 ? 9.0 : 23.0;
    vec2 g = vec2(uv.x*sc*uAspect, uv.y*sc); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float h = h21(id + float(layer)*17.0);
    float period = 5.0 + h*9.0; float ageDrop = mod(uTime + h*period, period);
    float appear = h21(id + 3.1);
    float on = step(appear, uRain * (layer == 0 ? 0.55 : 0.8));
    vec2 off = (vec2(h21(id+7.7), h21(id+9.9)) - 0.5) * 0.5;
    float slide = smoothstep(2.0, period, ageDrop) * 0.35 * h;
    vec2 q = f - off + vec2(0.0, slide);
    float rr = (0.05 + 0.13*h*h) * smoothstep(0.0, 0.6, ageDrop) * (layer == 0 ? 1.0 : 0.55);
    float dist = length(q * vec2(1.0, 0.9));
    float drop = smoothstep(rr, rr*0.55, dist);
    float vis = step(ageDrop, wipeAge);
    float m = drop * on * vis;
    acc = max(acc, m);
    refr += normalize(q + 1e-4) * m * 0.02;
    // trail
    float trail = step(abs(q.x), rr*0.25) * step(0.0, -q.y + slide) * step(-q.y + slide, slide*1.6) * on * vis * 0.25;
    acc = max(acc, trail*0.5);
  }
  vec3 col = uTint * (0.35 + 0.65*acc);
  float a = acc * 0.38 + blade * 0.85;
  col = mix(col, vec3(0.03), blade);
  gl_FragColor = vec4(col + acc*0.25, clamp(a, 0.0, 0.9));
}`;

// -------------------------------------------------------------------------------------------------
export function createFX(THREE, world) {
  const rng = makeRng("fx-emit");
  const root = new THREE.Group();
  root.name = "fx";
  root.frustumCulled = false;
  const parent = world.dynamicRoot || world.scene;
  parent.add(root);
  const camera = world.camera;
  if (camera && !camera.parent && world.scene) world.scene.add(camera);

  const uni = {
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    uSunCol: { value: new THREE.Vector3(1, 0.95, 0.85) },
    uAmb: { value: new THREE.Vector3(0.35, 0.38, 0.42) },
    uCamPos: { value: new THREE.Vector3() },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uBack: { value: new THREE.Vector3(0, 0, 1) },
    uFogCol: { value: new THREE.Vector3(0.7, 0.75, 0.8) },
    uFogDens: { value: 0.0 }, uFogNear: { value: 50 }, uFogFar: { value: 500 }, uFogMode: { value: 0 },
    uCarPos: { value: new THREE.Vector3() }, uCarFwd: { value: new THREE.Vector3(0, 0, -1) }, uHead: { value: 0 },
  };

  function makeSystem(n, type, frag, defines, blending) {
    const pool = new Pool(n, type);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("corner", new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const aPos = new THREE.InstancedBufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const aData = new THREE.InstancedBufferAttribute(pool.data, 4).setUsage(THREE.DynamicDrawUsage);
    const aCol = new THREE.InstancedBufferAttribute(pool.col, 4).setUsage(THREE.DynamicDrawUsage);
    const aMisc = new THREE.InstancedBufferAttribute(pool.misc, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aPos", aPos); g.setAttribute("aData", aData); g.setAttribute("aCol", aCol); g.setAttribute("aMisc", aMisc);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, vertexShader: VERT, fragmentShader: frag, defines,
      transparent: true, depthWrite: type === "hard", depthTest: true, blending,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = type === "soft" ? 20 : type === "glow" ? 22 : 21;
    root.add(mesh);
    return { pool, geo: g, mat, mesh, attrs: [aPos, aData, aCol, aMisc] };
  }
  const soft = makeSystem(3200, "soft", FRAG_SOFT, { SOFT: 1 }, THREE.NormalBlending);
  const hard = makeSystem(900, "hard", FRAG_HARD, { HARD: 1 }, THREE.NormalBlending);
  const glow = makeSystem(700, "glow", FRAG_GLOW, { GLOW: 1 }, THREE.AdditiveBlending);
  const systems = [soft, hard, glow];

  // ---- rain on glass overlay (child of camera)
  const lensUni = { uTime: { value: 0 }, uRain: { value: 0 }, uAspect: { value: 1.7 }, uWipe: { value: 0 }, uWiperOn: { value: 0 }, uTint: { value: new THREE.Vector3(0.7, 0.8, 0.9) } };
  const lensGeo = new THREE.PlaneGeometry(2, 2);
  const lensMat = new THREE.ShaderMaterial({
    uniforms: lensUni, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: LENS_FRAG,
  });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.frustumCulled = false; lens.renderOrder = 999; lens.visible = false;
  if (camera) camera.add(lens);

  const mat4 = new THREE.Matrix4();
  const camBasis = { rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
  const rgb = [0, 0, 0], rgb2 = [0, 0, 0];
  const acc = new Float32Array(16); // fractional emission accumulators
  const A = { dust: 0, stone: 4, clod: 8, spray: 12 };
  let time = 0, camMode = null, windX = 0, windZ = 0, exhaustX = 0.36, exhaustY = 0.36, exhaustZ = 2.3, noseZ = -1.8;
  let gy = 0, lastPopT = -9, lastThrottle = 0, lastBoost = 0;
  let wetCache = 0;

  const api = {
    root, pools: { soft: soft.pool, hard: hard.pool, glow: glow.pool },
    setCameraMode(m) { camMode = m; },
    setCarSpec(spec) {
      if (!spec) return;
      const a = spec.wheelbase * (1 - (spec.weightFront ?? 0.5)), b = spec.wheelbase - a;
      exhaustZ = b + 0.78; noseZ = -(a + 0.8);
      exhaustX = spec.id === "piwakawaka" ? 0.3 : 0.38;
    },
    get stats() { return { soft: soft.pool.live, hard: hard.pool.live, glow: glow.pool.live }; },

    update(dt, st, env, stage) {
      dt = clamp(dt, 0, 0.08);
      time += dt;
      env = env || world.environment || {};
      readEnv(env);
      updateCamUniforms(st);
      if (st) emitAll(dt, st, env, stage);
      const hAt = stage && stage.heightAt ? (x, z) => stage.heightAt(x, z) : null;
      soft.pool.update(dt, windX, windZ, null, camBasis);
      hard.pool.update(dt, windX, windZ, hAt, camBasis);
      glow.pool.update(dt, windX, windZ, null, camBasis);
      for (const s of systems) {
        s.geo.instanceCount = s.pool.high;
        for (const a of s.attrs) a.needsUpdate = true;
      }
      updateLens(dt, st, env);
    },

    burst(kind, p, o = {}) {
      const n = o.count || 24, str = clamp(o.strength ?? 0.6, 0.1, 1);
      const dx = o.dir ? o.dir.x : 0, dy = o.dir ? o.dir.y : 1, dz = o.dir ? o.dir.z : 0;
      const sp = o.speed || 6;
      switch (kind) {
        case "impact_sparks":
          for (let i = 0; i < n; i++) {
            const a = rng.next() * 6.283, e = rng.range(0.1, 1.2), v = sp * rng.range(0.5, 1.6);
            glow.pool.emit(p.x, p.y, p.z, Math.cos(a) * v * 0.7 + dx * v * 0.5, e * v + dy * v * 0.3, Math.sin(a) * v * 0.7 + dz * v * 0.5, rng.range(0.25, 0.7), 0.05, 0.03, 1, 0.6, 0.2, 1, { kind: KIND.SPARK, grav: 9.8, drag: 0.6 });
          }
          break;
        case "debris":
          for (let i = 0; i < n; i++) {
            const a = rng.next() * 6.283, v = sp * rng.range(0.3, 1.4);
            const shard = rng.chance(0.45);
            const g = shard ? rgbAdd(0.8, 0.9, 1.0, 0.1) : rgbAdd(0.07, 0.07, 0.08, 0.1);
            hard.pool.emit(p.x, p.y + 0.2, p.z, Math.cos(a) * v + dx * v * 0.4, rng.range(1, 4) * str + dy * 2, Math.sin(a) * v + dz * v * 0.4, rng.range(1, 2.2), rng.range(0.03, 0.08), rng.range(0.03, 0.08), g[0], g[1], g[2], 1,
              { kind: shard ? KIND.SHARD : KIND.CLOD, grav: 9.8, drag: 0.3, bounce: 0.35, rotV: rng.range(-12, 12), rot: rng.next() * 6 });
          }
          puff(p.x, p.y + 0.3, p.z, 0.75, 0.72, 0.68, 6, 0.4 * str);
          break;
        case "leaves":
          for (let i = 0; i < n; i++) {
            const a = rng.next() * 6.283, v = sp * rng.range(0.2, 0.9);
            const gr = rng.chance(0.6);
            hard.pool.emit(p.x, p.y + rng.range(0.2, 1.5), p.z, Math.cos(a) * v, rng.range(1.5, 5), Math.sin(a) * v, rng.range(1.5, 3.2), rng.range(0.05, 0.09), rng.range(0.05, 0.09), gr ? 0.25 : 0.5, gr ? 0.4 : 0.32, gr ? 0.1 : 0.1, 1,
              { kind: KIND.LEAF, grav: 1.8, drag: 1.6, wind: 0.4, bounce: 0.1, rotV: rng.range(-9, 9), rot: rng.next() * 6 });
          }
          break;
        case "splash":
          for (let i = 0; i < n; i++) {
            const a = rng.next() * 6.283, v = sp * rng.range(0.3, 1.2);
            hard.pool.emit(p.x, p.y + 0.1, p.z, Math.cos(a) * v * 0.6 + dx * v * 0.4, rng.range(2, 6) * str, Math.sin(a) * v * 0.6 + dz * v * 0.4, rng.range(0.6, 1.3), rng.range(0.02, 0.05), 0.02, 0.75, 0.85, 0.92, 0.9, { kind: KIND.DROP, grav: 9.8, drag: 0.2 });
          }
          puff(p.x, p.y + 0.4, p.z, 0.85, 0.92, 0.97, 5, 0.35 * str);
          break;
        case "dust_puff": puff(p.x, p.y, p.z, 0.72, 0.65, 0.52, o.size || 6, 0.45 * str); break;
        default: break;
      }
    },
    clear() { for (const s of systems) { s.pool.clear(); s.geo.instanceCount = 0; } },
    dispose() {
      parent.remove(root);
      if (camera) camera.remove(lens);
      for (const s of systems) { s.geo.dispose(); s.mat.dispose(); }
      lensGeo.dispose(); lensMat.dispose();
    },
  };

  const _rgb4 = [0, 0, 0];
  function rgbAdd(r, g, b, v) { const k = 1 + (rng.next() - 0.5) * 2 * v; _rgb4[0] = r * k; _rgb4[1] = g * k; _rgb4[2] = b * k; return _rgb4; }

  function puff(x, y, z, r, g, b, size, peak) {
    for (let i = 0; i < 8; i++) {
      soft.pool.emit(x + rng.range(-0.4, 0.4), y + rng.range(0, 0.4), z + rng.range(-0.4, 0.4), rng.range(-1.5, 1.5), rng.range(0.3, 1.6), rng.range(-1.5, 1.5), rng.range(1.2, 2.4), size * 0.12, size * rng.range(0.35, 0.6), r, g, b, peak, { drag: 1.6, wind: 0.6, rotV: rng.range(-0.8, 0.8), rot: rng.next() * 6 });
    }
  }

  function readEnv(env) {
    if (env.sunDir) {
      let sx = env.sunDir.x, sy = env.sunDir.y, sz = env.sunDir.z;
      if (sy < 0) { sx = -sx; sy = -sy; sz = -sz; }
      const l = Math.hypot(sx, sy, sz) || 1;
      uni.uSunDir.value.set(sx / l, sy / l, sz / l);
    }
    toRGB(env.sunColor, rgb);
    const night = clamp01(uni.uSunDir.value.y * 4 + 0.1);
    uni.uSunCol.value.set(rgb[0] * night, rgb[1] * night, rgb[2] * night);
    toRGB(env.ambient, rgb2);
    uni.uAmb.value.set(0.12 + rgb2[0] * 0.75, 0.12 + rgb2[1] * 0.75, 0.12 + rgb2[2] * 0.75);
    uni.uHead.value = env.headlights ? 1 : 0;
    const fog = world.scene && world.scene.fog;
    if (fog) {
      uni.uFogCol.value.set(fog.color.r, fog.color.g, fog.color.b);
      if (fog.isFogExp2) { uni.uFogMode.value = 2; uni.uFogDens.value = fog.density; }
      else { uni.uFogMode.value = 1; uni.uFogNear.value = fog.near; uni.uFogFar.value = fog.far; }
    } else if (env.fogColor !== undefined) {
      toRGB(env.fogColor, rgb); uni.uFogCol.value.set(rgb[0], rgb[1], rgb[2]);
    }
    const wv = env.windVec;
    if (wv) { windX = clamp(wv.x, -12, 12); windZ = clamp(wv.z, -12, 12); } else { windX = 0; windZ = 0; }
    wetCache = env.wetness || 0;
  }

  function updateCamUniforms(st) {
    if (!camera) return;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    camBasis.rx = e[0]; camBasis.ry = e[1]; camBasis.rz = e[2];
    camBasis.ux = e[4]; camBasis.uy = e[5]; camBasis.uz = e[6];
    uni.uRight.value.set(e[0], e[1], e[2]);
    uni.uUp.value.set(e[4], e[5], e[6]);
    uni.uBack.value.set(e[8], e[9], e[10]);
    uni.uCamPos.value.set(e[12], e[13], e[14]);
    if (st) {
      uni.uCarPos.value.set(st.x, st.y + 0.6, st.z);
      uni.uCarFwd.value.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw));
    }
  }

  function emitAll(dt, st, env, stage) {
    const speed = st.speed || 0, aspd = Math.abs(speed);
    const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw);
    const w = st.wheels;
    let sumY = 0, ng = 0;
    for (let i = 0; i < 4; i++) {
      const wi = w[i];
      if (!wi) continue;
      sumY += wi.contactY; ng++;
      if (!wi.grounded) continue;
      const info = SURFACE_INFO[wi.surf] || SURFACE_INFO[0];
      const slip = wheelSlipAmount(wi);
      const rate = dustRate(info, slip, speed, wetCache);
      toRGB(info.dustColor, rgb);
      const wetDark = 1 - 0.2 * clamp01(wetCache);
      const rear = i >= 2 ? 1.15 : 0.85;
      const cx = wi.contactX, cy = wi.contactY, cz = wi.contactZ;
      // ---- billowing dust / spray / snow / smoke plume
      if (info.id === SURFACE.TARMAC) {
        const sk = clamp01(Math.max(wi.skid || 0, Math.abs(wi.slipRatio || 0) - 0.15) * 1.2);
        if (sk > 0.25 && aspd > 2) {
          acc[A.dust + i] += dt * 70 * sk;
          while (acc[A.dust + i] >= 1) {
            acc[A.dust + i] -= 1;
            soft.pool.emit(cx + rng.range(-0.1, 0.1), cy + 0.08, cz + rng.range(-0.1, 0.1), st.vx * 0.06 + rng.range(-0.4, 0.4), rng.range(0.4, 1.2), st.vz * 0.06 + rng.range(-0.4, 0.4), rng.range(1.0, 2.0), 0.35, 1.4 + sk, 0.85, 0.85, 0.87, 0.2 + 0.2 * sk, { drag: 1.8, wind: 0.8, rotV: rng.range(-0.6, 0.6), rot: rng.next() * 6 });
          }
        }
        // wet-road rooster tail
        if (wetCache > 0.45 && aspd > 14) {
          acc[A.spray + i] += dt * 40 * wetCache * smoothstep(14, 40, aspd);
          while (acc[A.spray + i] >= 1) {
            acc[A.spray + i] -= 1;
            soft.pool.emit(cx + rng.range(-0.1, 0.1), cy + 0.1, cz, st.vx * 0.05 - fx * 1.2, rng.range(0.6, 1.6), st.vz * 0.05 - fz * 1.2, rng.range(0.8, 1.6), 0.3, 1.2, 0.78, 0.82, 0.86, 0.14, { drag: 2.0, wind: 1.0 });
          }
        }
      } else if (rate > 0) {
        acc[A.dust + i] += dt * rate * rear;
        const cr = rgb[0] * wetDark, cg = rgb[1] * wetDark, cb = rgb[2] * wetDark;
        const k = info.spray ? 1.25 : 1;
        while (acc[A.dust + i] >= 1) {
          acc[A.dust + i] -= 1;
          const sb = 0.4 + slip;
          const vv = rng.range(0.8, 1.4);
          const lift = rng.range(0.5, 1.8) * (0.5 + slip * 0.9) * (info.id === SURFACE.SNOW || info.id === SURFACE.SNOW_DEEP ? 1.4 : 1);
          const shade = 0.88 + rng.next() * 0.2;
          soft.pool.emit(cx + rng.range(-0.15, 0.15), cy + 0.1, cz + rng.range(-0.15, 0.15),
            st.vx * 0.1 - fx * aspd * 0.05 + rng.range(-1.1, 1.1) * sb, lift, st.vz * 0.1 - fz * aspd * 0.05 + rng.range(-1.1, 1.1) * sb,
            rng.range(1.6, 3.2) + slip * 1.4, 0.35 + 0.4 * slip, (1.4 + 2.6 * slip) * k, cr * shade, cg * shade, cb * shade,
            (info.spray ? 0.2 : 0.17 + 0.17 * Math.min(1, info.dust)) * (0.6 + 0.6 * clamp01(slip + 0.3)),
            { drag: info.spray ? 2.4 : 1.35, wind: 0.9, rotV: rng.range(-0.7, 0.7), rot: rng.next() * 6 });
        }
      }
      // ---- hard particles: gravel chips, mud clods, water drops, snow flakes
      const loose = info.id === SURFACE.GRAVEL || info.id === SURFACE.PACKED_DIRT || info.id === SURFACE.PUMICE || info.id === SURFACE.SCREE || info.id === SURFACE.SAND;
      const gate = Math.max(smoothstep(2, 10, aspd), clamp01(slip * 0.8));
      if (loose && slip > 0.18) {
        acc[A.stone + i] += dt * 70 * slip * gate;
        while (acc[A.stone + i] >= 1) {
          acc[A.stone + i] -= 1;
          const v = 2.5 + aspd * 0.18;
          hard.pool.emit(cx, cy + 0.06, cz, st.vx * 0.2 - fx * v * rng.range(0.3, 1) + rng.range(-1.5, 1.5), rng.range(1.5, 5.5) * (0.5 + slip * 0.6), st.vz * 0.2 - fz * v * rng.range(0.3, 1) + rng.range(-1.5, 1.5),
            rng.range(0.7, 1.5), rng.range(0.012, 0.026), 0.012, rgb[0] * 0.7, rgb[1] * 0.68, rgb[2] * 0.66, 1, { kind: KIND.STONE, grav: 9.8, drag: 0.15, bounce: 0.4, rot: 0 });
        }
      }
      if ((info.id === SURFACE.MUD || (wetCache > 0.6 && info.id !== SURFACE.TARMAC && info.id !== SURFACE.SNOW)) && slip > 0.1) {
        acc[A.clod + i] += dt * 32 * slip * gate;
        while (acc[A.clod + i] >= 1) {
          acc[A.clod + i] -= 1;
          const v = 3 + aspd * 0.15;
          hard.pool.emit(cx, cy + 0.1, cz, st.vx * 0.15 - fx * v * rng.range(0.2, 1) + rng.range(-2, 2), rng.range(2, 6) * (0.5 + slip * 0.5), st.vz * 0.15 - fz * v * rng.range(0.2, 1) + rng.range(-2, 2),
            rng.range(0.9, 1.8), rng.range(0.03, 0.07), 0.03, 0.26, 0.18, 0.11, 1, { kind: KIND.CLOD, grav: 9.8, drag: 0.1, bounce: 0.15, rotV: rng.range(-8, 8) });
        }
      }
      if (info.spray && aspd > 3) {
        acc[A.spray + i] += dt * 110 * gate * (info.id === SURFACE.WATER ? 1.4 : 0.5);
        while (acc[A.spray + i] >= 1) {
          acc[A.spray + i] -= 1;
          hard.pool.emit(cx + rng.range(-0.2, 0.2), cy + 0.08, cz, st.vx * 0.3 + rng.range(-2.5, 2.5), rng.range(1.5, 5.5), st.vz * 0.3 + rng.range(-2.5, 2.5), rng.range(0.5, 1.1), rng.range(0.015, 0.04), 0.015, 0.8, 0.88, 0.95, 0.9, { kind: KIND.DROP, grav: 9.8, drag: 0.4, bounce: 0.0 });
        }
      }
      if ((info.id === SURFACE.SNOW || info.id === SURFACE.SNOW_DEEP) && gate > 0.2) {
        acc[A.stone + i] += dt * 40 * gate * (0.3 + slip);
        while (acc[A.stone + i] >= 1) {
          acc[A.stone + i] -= 1;
          hard.pool.emit(cx, cy + 0.1, cz, st.vx * 0.2 + rng.range(-1.5, 1.5), rng.range(1.2, 3.5), st.vz * 0.2 + rng.range(-1.5, 1.5), rng.range(0.8, 1.6), 0.03, 0.02, 0.95, 0.97, 1, 0.9, { kind: KIND.FLAKE, grav: 2.5, drag: 1.2, wind: 0.5, bounce: 0.1 });
        }
      }
      // ---- sparks from a rim on the road
      if (wi.punctured && aspd > 3) {
        acc[A.clod + i] += dt * 60;
        while (acc[A.clod + i] >= 1) {
          acc[A.clod + i] -= 1;
          glow.pool.emit(cx, cy + 0.05, cz, st.vx * 0.3 - fx * rng.range(2, 6) + rng.range(-2, 2), rng.range(0.5, 3), st.vz * 0.3 - fz * rng.range(2, 6) + rng.range(-2, 2), rng.range(0.2, 0.5), 0.05, 0.03, 1, 0.6, 0.2, 1, { kind: KIND.SPARK, grav: 9.8, drag: 0.5 });
        }
      }
    }
    gy = ng ? sumY / ng : st.y;

    // ---- events -> bursts
    const ev = st.events;
    if (ev) for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.t === "impact") {
        const px = e.x !== undefined ? e.x : st.x, pz = e.z !== undefined ? e.z : st.z;
        const py = gy + 0.5;
        const kind = String(e.kind || "");
        const tree = /pine|macro|redwood|beech|pohutukawa|kauri|fern|cabbage|flax|toetoe|shrub|tussock|grass/.test(kind);
        const s = clamp01(e.strength);
        if (tree) api.burst("leaves", { x: px, y: py, z: pz }, { count: 10 + Math.floor(s * 26), speed: 3 + s * 5 });
        if (!tree || s > 0.5) api.burst("impact_sparks", { x: px, y: py, z: pz }, { count: Math.floor(6 + s * 30), speed: 4 + s * 8, strength: s });
        if (s > 0.25) api.burst("debris", { x: px, y: py, z: pz }, { count: Math.floor(4 + s * 18), speed: 3 + s * 6, strength: s });
        api.burst("dust_puff", { x: px, y: gy + 0.2, z: pz }, { size: 3 + s * 5, strength: s });
      } else if (e.t === "bottomout") {
        const s = clamp01(e.strength);
        api.burst("impact_sparks", { x: st.x + fx * -0.2, y: gy + 0.12, z: st.z + fz * -0.2 }, { count: Math.floor(8 + s * 26), speed: 3 + s * 5, dir: { x: -fx, y: 0.4, z: -fz }, strength: s });
      } else if (e.t === "splash") {
        const s = clamp01(e.strength ?? 0.6);
        api.burst("splash", { x: st.x, y: gy, z: st.z }, { count: Math.floor(20 + s * 50), speed: 4 + s * 6, dir: { x: fx, y: 0.5, z: fz }, strength: s });
      } else if (e.t === "landing") {
        api.burst("dust_puff", { x: st.x, y: gy + 0.15, z: st.z }, { size: 4 + 4 * clamp01(e.strength), strength: clamp01(e.strength) });
      } else if (e.t === "wastegate" || e.t === "limiter") exhaustFlame(st, fx, fz, e.t === "limiter" ? 0.5 : 0.8);
    }
    // ---- anti-lag pops on lift at high rpm
    const redl = 1; // rpm gating is expressed through throttle lift + boost residue
    if (st.throttle < 0.12 && lastThrottle > 0.5 && st.rpm > 4000 && time - lastPopT > 0.12) { exhaustFlame(st, fx, fz, 0.9); lastPopT = time; }
    else if (st.throttle < 0.1 && st.rpm > 5000 && (st.boost || 0) > 0.15 && rng.next() < dt * 6 && time - lastPopT > 0.08) { exhaustFlame(st, fx, fz, 0.55); lastPopT = time; }
    lastThrottle = st.throttle; lastBoost = st.boost || 0;

    // ---- exhaust haze
    if (st.rpm > 100) {
      acc[A.spray + 3] += dt * (3 + 10 * st.throttle);
      while (acc[A.spray + 3] >= 1) {
        acc[A.spray + 3] -= 1;
        const cs = Math.cos(st.yaw), sn = Math.sin(st.yaw);
        const lx = exhaustX, lz = exhaustZ;
        const ex = st.x + lx * cs + lz * sn, ez = st.z - lx * sn + lz * cs;
        soft.pool.emit(ex, gy + exhaustY, ez, -fx * (1 + st.throttle * 3) + st.vx * 0.2, 0.2 + rng.next() * 0.3, -fz * (1 + st.throttle * 3) + st.vz * 0.2, rng.range(0.8, 1.4), 0.1, 0.5, 0.7, 0.72, 0.75, 0.05 + 0.07 * st.throttle, { drag: 2, wind: 0.8 });
      }
    }
    // ---- engine damage smoke / steam
    const dmg = st.damage;
    if (dmg) {
      const sev = Math.max(dmg.engine || 0, dmg.radiator || 0, (dmg.body && dmg.body.front) || 0 - 0.2);
      if (sev > 0.45) {
        const black = (dmg.engine || 0) > (dmg.radiator || 0);
        acc[A.dust + 3] += dt * (8 + 45 * (sev - 0.4));
        while (acc[A.dust + 3] >= 1) {
          acc[A.dust + 3] -= 1;
          const cs = Math.cos(st.yaw), sn = Math.sin(st.yaw);
          const lx = rng.range(-0.3, 0.3), lz = noseZ + 0.9;
          const ex = st.x + lx * cs + lz * sn, ez = st.z - lx * sn + lz * cs;
          const c = black ? 0.12 : 0.9;
          soft.pool.emit(ex, gy + 1.0, ez, st.vx * 0.3 + rng.range(-0.3, 0.3), rng.range(1, 2.2), st.vz * 0.3 + rng.range(-0.3, 0.3), rng.range(1.5, 3), 0.25, 1.6, c, c, c, black ? 0.4 : 0.3, { drag: 1.3, wind: 0.9 });
        }
      }
    }
    // ---- dust motes attached to the camera region
    if (aspd > 8 && camera) {
      acc[A.spray + 2] += dt * 14 * smoothstep(8, 40, aspd);
      while (acc[A.spray + 2] >= 1) {
        acc[A.spray + 2] -= 1;
        const e = camera.matrixWorld.elements;
        const d = rng.range(2, 10);
        const x = e[12] - e[8] * d + e[0] * rng.range(-4, 4) * (d * 0.35 + 1), y = e[13] + rng.range(-1.5, 3), z = e[14] - e[10] * d + e[2] * rng.range(-4, 4) * (d * 0.35 + 1);
        soft.pool.emit(x, y, z, windX * 0.5, rng.range(-0.05, 0.1), windZ * 0.5, rng.range(1.5, 3), 0.025, 0.04, 1, 0.97, 0.88, 0.5, { drag: 1, wind: 0.5 });
      }
    }
  }

  function exhaustFlame(st, fx, fz, s) {
    const cs = Math.cos(st.yaw), sn = Math.sin(st.yaw);
    for (const side of [-1, 1]) {
      if (side < 0 && rng.chance(0.6)) continue;
      const lx = exhaustX * side, lz = exhaustZ;
      const ex = st.x + lx * cs + lz * sn, ez = st.z - lx * sn + lz * cs;
      const ey = gy + exhaustY;
      for (let i = 0; i < 4; i++) {
        glow.pool.emit(ex, ey, ez, -fx * rng.range(3, 9) * s + st.vx * 0.5, rng.range(-0.2, 0.7), -fz * rng.range(3, 9) * s + st.vz * 0.5, rng.range(0.07, 0.17), 0.12, 0.4 * s + 0.15, 1, 1, 1, 0.9, { kind: KIND.FLAME, drag: 4, rot: rng.next() * 6 });
      }
      for (let i = 0; i < 6; i++) {
        glow.pool.emit(ex, ey, ez, -fx * rng.range(4, 12) + rng.range(-2, 2), rng.range(0, 2.5), -fz * rng.range(4, 12) + rng.range(-2, 2), rng.range(0.15, 0.4), 0.04, 0.02, 1, 0.7, 0.3, 1, { kind: KIND.SPARK, grav: 9.8, drag: 1.2 });
      }
    }
  }

  function updateLens(dt, st, env) {
    const rain = clamp01(env.rain || 0), snow = clamp01(env.snow || 0);
    let first = camMode === "bonnet" || camMode === "bumper";
    if (camMode === null && camera && st) {
      const e = camera.matrixWorld.elements;
      first = Math.hypot(e[12] - st.x, e[13] - st.y, e[14] - st.z) < 3.2;
    }
    const amount = Math.max(rain, snow * 0.5);
    lens.visible = first && amount > 0.02;
    if (lens.visible) {
      lensUni.uTime.value = time;
      lensUni.uRain.value = amount;
      lensUni.uWiperOn.value = camMode === "bonnet" && rain > 0.1 ? 1 : 0;
      lensUni.uAspect.value = camera && camera.aspect ? camera.aspect : 1.7;
      const t = env.fogColor !== undefined ? toRGB(env.fogColor, rgb) : null;
      if (t) lensUni.uTint.value.set(0.4 + t[0] * 0.5, 0.45 + t[1] * 0.5, 0.5 + t[2] * 0.5);
    }
  }
  return api;
}
