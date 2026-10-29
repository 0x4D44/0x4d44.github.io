// Wayfinding: scoring rings with scrolling chevrons, boost rings, lane chevrons that heat up into corners, warning boards on the outside of
// sharp bends, and the orange SHORTCUT gate + sign. Everything is instanced; one shader family with fog + HDR emissive. Owner: world agent.
import * as THREE from 'three';

const FOG_V = '#include <common>\n#include <fog_pars_vertex>\n';
const FOG_F = '#include <common>\n#include <fog_pars_fragment>\n';
const TAIL_F = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n';

function mat(uniforms, vs, fs, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]), vertexShader: vs, fragmentShader: fs, fog: true, ...extra,
  });
}

const RING_VS = FOG_V + `
varying vec2 vUv; varying vec3 vCol; varying float vFres;
void main(){
  vUv = uv; vCol = instanceColor;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
  vFres = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 1.5);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const RING_FS = FOG_F + `
uniform float uTime; uniform float uStripes; uniform float uSpeed;
varying vec2 vUv; varying vec3 vCol; varying float vFres;
void main(){
  float a = vUv.x * uStripes - uTime * uSpeed + abs(vUv.y - 0.5) * 1.6;
  float st = smoothstep(0.30, 0.48, abs(fract(a) - 0.5));
  vec3 c = vCol * (1.1 + 2.2 * st) + vec3(0.35) * vFres;
  gl_FragColor = vec4(c, 1.0);` + TAIL_F + `}`;

const LANE_VS = FOG_V + `
attribute float aGlow;
varying vec2 vUv; varying vec3 vCol; varying float vNear;
void main(){
  vUv = uv; vCol = instanceColor * aGlow;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vNear = smoothstep(10.0, 40.0, -mv.z);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const LANE_FS = FOG_F + `
uniform float uTime;
varying vec2 vUv; varying vec3 vCol; varying float vNear;
void main(){
  float xp = abs(vUv.x * 2.0 - 1.0);
  float yc = 0.72 - 0.55 * xp;
  float band = 1.0 - smoothstep(0.07, 0.15, abs(vUv.y - yc));
  float edge = 1.0 - smoothstep(0.85, 1.0, xp);
  float pulse = 0.85 + 0.15 * sin(uTime * 6.0 - vUv.y * 3.0);
  float a = band * edge * vNear;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol * pulse * 2.2, a);` + TAIL_F + `}`;

const BOARD_VS = FOG_V + `
varying vec2 vUv; varying vec3 vCol;
void main(){
  vUv = uv; vCol = instanceColor;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const BOARD_FS = FOG_F + `
uniform float uTime;
varying vec2 vUv; varying vec3 vCol;
void main(){
  vec2 p = vUv * 2.0 - 1.0;                        // x: -1..1 (pointing toward +x), y: -1..1
  float frame = step(0.9, max(abs(p.x), abs(p.y)));
  float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float cx = -0.62 + float(i) * 0.55;
    float d = abs(p.y) * 0.62 - (p.x - cx);        // chevron ">" with apex toward +x
    float band = 1.0 - smoothstep(0.05, 0.13, abs(d));
    float pulse = 0.55 + 0.45 * sin(uTime * 7.0 - float(i) * 1.6);
    acc += band * step(abs(p.y), 0.8) * (0.5 + 0.8 * pulse);
  }
  vec3 base = vec3(0.04, 0.03, 0.05);
  vec3 c = base + vCol * (acc * 2.6 + frame * 1.8);
  gl_FragColor = vec4(c, 0.92);` + TAIL_F + `}`;

/** Make a flat arrow + text sign texture (browser only). */
function signTexture(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,8,6,0.92)'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(8, 8, 496, 144);
  g.fillStyle = color; g.font = '900 78px system-ui, Arial Black, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(text, 30, 84);
  g.beginPath(); g.moveTo(420, 36); g.lineTo(490, 80); g.lineTo(420, 124); g.lineTo(420, 100); g.lineTo(380, 100); g.lineTo(380, 60); g.lineTo(420, 60); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildWayfinding(course, game) {
  const env = course.environment;
  const group = new THREE.Group(); group.name = 'wayfinding';
  const disposables = [];
  const uTime = { value: 0 };
  const ringColor = new THREE.Color(env.ringColor ?? 0xffc233), boostColor = new THREE.Color(env.boostColor ?? 0x2ee6ff);
  const shortColor = new THREE.Color(env.shortcutColor ?? 0xff7a1a), guideColor = new THREE.Color(env.guideColor ?? 0x9ff0ff), warnColor = new THREE.Color(env.warnColor ?? 0xff5a20);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color();

  // ---- rings (scoring gates, branch gates, boost rings)
  const torus = new THREE.TorusGeometry(1, 0.055, 10, 64);
  const ringMat = mat({ uTime, uStripes: { value: 26 }, uSpeed: { value: 0.5 } }, RING_VS, RING_FS);
  const boostMat = mat({ uTime, uStripes: { value: 14 }, uSpeed: { value: -1.4 } }, RING_VS, RING_FS);
  const rings = [], boosts = [];
  for (const g of course.gates) rings.push({ pos: g.pos, quat: g.quat, r: g.radius, col: g.shortcut ? shortColor : ringColor, big: g.big });
  for (const b of course.branches) for (const g of b.gates) rings.push({ pos: g.pos, quat: g.quat, r: g.radius, col: shortColor });
  for (const b of course.boostRings) boosts.push({ pos: b.pos, quat: b.quat, r: b.radius, col: boostColor });
  const mk = (list, geo, material, tube) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((o, i) => {
      _m.compose(o.pos, o.quat, _s.set(o.r, o.r, o.r * (tube ?? 1)));
      im.setMatrixAt(i, _m); im.setColorAt(i, o.col);
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false;
    group.add(im); return im;
  };
  mk(rings, torus, ringMat); mk(boosts, torus, boostMat);
  // boost rings get a second, inner ring for a "double hoop" look
  const inner = boosts.map((b) => ({ ...b, r: b.r * 0.72 }));
  mk(inner, torus, boostMat);
  disposables.push(torus, ringMat, boostMat);

  // ---- lane chevrons: cross-shaped (flat + upright) so they read from above, below and the side
  const L = course.length, spacing = 24, count = Math.floor(L / spacing);
  const laneGeo = (() => {
    const a = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);      // flat in XZ, v increases forward (-z)
    const b = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).rotateZ(Math.PI / 2);   // upright in YZ
    const g = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    [a, b].forEach((geo, k) => {
      const p = geo.attributes.position, u = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
      const ix = geo.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + k * p.count);
      geo.dispose();
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  })();
  const laneMat = mat({ uTime }, LANE_VS, LANE_FS, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const lanes = new THREE.InstancedMesh(laneGeo, laneMat, count);
  const glow = new Float32Array(count), f = {}, h = {};
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) * (L / count);
    course.frameAt(s, f);
    course.aiHints(s, h);
    const heat = Math.min(1, Math.max(0, (118 - h.speedCap) / 48));
    _q.copy(basisQuatLocal(f));
    _m.compose(f.pos, _q, _s.set(8 + heat * 5, 8 + heat * 5, 9 + heat * 3));
    lanes.setMatrixAt(i, _m);
    _c.copy(guideColor).lerp(warnColor, heat); lanes.setColorAt(i, _c);
    glow[i] = 0.4 + heat * 1.0;
  }
  laneGeo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1));
  lanes.instanceMatrix.needsUpdate = true; lanes.instanceColor.needsUpdate = true; lanes.frustumCulled = false;
  group.add(lanes); disposables.push(laneGeo, laneMat);

  // ---- warning boards on the outside of sharp bends
  const boards = [];
  {
    const step = 10, n = Math.floor(L / step); let i = 0;
    const cap = (s) => course.aiHints(s, h).speedCap;
    const inRegion = (s) => cap(s) < 98 && !course.aiHints(s, h).loop;
    // find regions (start s, apex s, direction)
    while (i < n) {
      if (!inRegion(i * step)) { i++; continue; }
      let j = i, minCap = Infinity, apex = i * step; while (j < n && inRegion(j * step)) { const c = cap(j * step); if (c < minCap) { minCap = c; apex = j * step; } j++; }
      let tsum = 0; for (let k = i; k < j; k++) { course.frameAt(k * step, f); tsum += f.turn; }
      const dir = tsum >= 0 ? 1 : -1;
      if (Math.abs(tsum) > 0.02 && minCap < 92) for (const back of [190, 120, 55]) boards.push({ s: apex - back, dir });
      i = j + 1;
    }
  }
  if (boards.length) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const bm = mat({ uTime }, BOARD_VS, BOARD_FS, { transparent: true, side: THREE.DoubleSide, depthWrite: true });
    const im = new THREE.InstancedMesh(quad, bm, boards.length);
    boards.forEach((b, k) => {
      course.frameAt(b.s, f);
      const lat = -b.dir * (f.halfWidth + 10);
      _p.copy(f.pos).addScaledVector(f.right, lat).addScaledVector(f.up, 4);
      _q.copy(basisQuatLocal(f));
      im.setMatrixAt(k, _m.compose(_p, _q, _s.set(b.dir * 17, 13, 1)));
      im.setColorAt(k, warnColor);
    });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.frustumCulled = false;
    group.add(im); disposables.push(quad, bm);
  }

  // ---- shortcut signs (one per branch, a little before the junction, on the side the branch peels toward)
  for (const b of course.branches) {
    const tex = signTexture('SHORTCUT', '#ff8a2a');
    const sm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: true, side: THREE.DoubleSide });
    sm.color.setScalar(1.5);
    const geo = new THREE.PlaneGeometry(40, 12.5);
    const bf = b.frameAt(Math.min(b.length * 0.5, 160), {}), s0 = b.fromS - 95, mf = course.frameAt(s0, {});
    const side = Math.sign(_p.copy(bf.pos).sub(mf.pos).dot(mf.right)) || 1;
    const mesh = new THREE.Mesh(geo, sm);
    mesh.position.copy(mf.pos).addScaledVector(mf.right, side * (mf.halfWidth * 0.55)).addScaledVector(mf.up, 20);
    mesh.quaternion.copy(basisQuatLocal(mf));
    mesh.scale.x = side;                                           // arrow points toward the branch side
    group.add(mesh); disposables.push(tex, sm, geo);
    // two posts so it reads as a roadside sign
    const post = new THREE.CylinderGeometry(0.7, 0.9, 26, 8), pm = new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.6, metalness: 0.5 });
    for (const dx of [-14, 14]) { const p = new THREE.Mesh(post, pm); p.position.copy(mesh.position).addScaledVector(mf.right, dx * side).addScaledVector(mf.up, -19); group.add(p); }
    disposables.push(post, pm);
  }

  return {
    group,
    update(dt) { uTime.value += dt; },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}

function basisQuatLocal(f) {
  const m = new THREE.Matrix4().makeBasis(f.right, f.up, new THREE.Vector3().copy(f.tangent).negate());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
