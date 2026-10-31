// Wayfinding: scoring rings with scrolling chevrons, boost rings, lane chevrons that heat up into corners, warning boards on the outside of
// sharp bends, and the orange SHORTCUT gate + sign (a side-aware canvas texture: the arrow and the lettering never mirror). Everything is
// instanced; one shader family with fog + HDR emissive. Far rings are compressed (less glow, thinner) so a line of gates seen end-on does not pile up
// into one bloom blob. mat() re-binds the shared uTime after UniformsUtils.merge, which clones uniforms: without it nothing animated. Owner: world agent.
import * as THREE from 'three';

const FOG_V = '#include <common>\n#include <fog_pars_vertex>\n';
const FOG_F = '#include <common>\n#include <fog_pars_fragment>\n';
const TAIL_F = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n';

function mat(uniforms, vs, fs, extra = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]), vertexShader: vs, fragmentShader: fs, fog: true, ...extra,
  });
  Object.assign(m.uniforms, uniforms);                    // merge() clones the uniform objects: re-bind them so the shared uTime keeps driving every material
  return m;
}

const RING_VS = FOG_V + `
varying vec2 vUv; varying vec3 vCol; varying float vFres; varying float vDist;
void main(){
  vUv = uv; vCol = instanceColor;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
  vFres = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 1.5);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const RING_FS = FOG_F + `
uniform float uTime; uniform float uStripes; uniform float uSpeed;
varying vec2 vUv; varying vec3 vCol; varying float vFres; varying float vDist;
void main(){
  float a = vUv.x * uStripes - uTime * uSpeed + abs(vUv.y - 0.5) * 1.6;
  float st = smoothstep(0.30, 0.48, abs(fract(a) - 0.5));
  float far = smoothstep(30.0, 300.0, vDist);                 // looking down a loop or a straight, a dozen far rings overlap on screen: their stripes must not pile up into one bloom blob
  vec3 c = vCol * (1.1 - 0.15 * far + 2.2 * st * (1.0 - 0.8 * far)) + vec3(0.35) * vFres * (1.0 - 0.7 * far);
  c *= mix(0.12, 1.0, smoothstep(8.0, 120.0, vDist));         // a ring near the lens must not white-out the frame through bloom: at GO the swoop starts 20-60 m from the first gates and, ramped over 6-60 m, they were 5.8 of the 6.9 % white pixels on Frost (R2-V-15)
  gl_FragColor = vec4(c, 1.0);` + TAIL_F + `}`;

// Lane chevrons: flat arrowheads lying in the path plane (they read like guidance painted on an air road) that tilt about the lateral axis
// toward the camera just enough never to go edge-on: the view ray is kept >= asin(SIN_MIN) above the chevron's plane. A dark outline plus an
// HDR core keep them readable against sky, snow and sand alike; a brightness wave runs forward along the chain so the direction is obvious.
const LANE_VS = FOG_V + `
attribute float aGlow; attribute float aPart; attribute float aPhase;
uniform float uTime;
varying vec3 vCol; varying float vNear; varying float vPart; varying float vTip; varying float vPulse;
const float SIN_MIN = 0.62;                                              // PI comes from <common>
void main(){
  mat4 im = modelMatrix * instanceMatrix;                      // columns: right * sx, up * sy, back * sz
  vec3 R = normalize(im[0].xyz), U = normalize(im[1].xyz), B = normalize(im[2].xyz);
  vec3 P = im[3].xyz, c = cameraPosition - P;
  float cn = max(length(c), 1e-3), cy = dot(c, U), cz = dot(c, B), r = length(vec2(cy, cz));
  float beta = atan(cz, cy); beta -= PI * floor(beta / PI + 0.5);        // best tilt (plane normal toward the camera), folded into [-PI/2, PI/2)
  float a0 = acos(clamp(SIN_MIN * cn / max(r, 1e-3), 0.0, 1.0));
  float alpha = abs(beta) > a0 ? beta - sign(beta) * a0 : 0.0;          // tilt only as far as needed
  alpha *= smoothstep(0.03, 0.2, r / cn);                                // looking along the lateral axis: tilting cannot help
  float lx = position.x * length(im[0].xyz), lz = position.z * length(im[2].xyz);
  vec3 world = P + R * lx + U * (-lz * sin(alpha)) + B * (lz * cos(alpha));
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vCol = instanceColor * aGlow; vPart = aPart; vTip = 0.5 - position.z;
  vPulse = 0.5 + 0.5 * sin(aPhase - uTime * 5.0);
  vNear = smoothstep(10.0, 48.0, -mv.z);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const LANE_FS = FOG_F + `
varying vec3 vCol; varying float vNear; varying float vPart; varying float vTip; varying float vPulse;
void main(){
  vec3 core = vCol * (1.0 + 1.0 * vPulse) * (0.75 + 0.45 * vTip);
  vec3 col = mix(vec3(0.015, 0.02, 0.045), core, vPart);
  float a = mix(0.42, 0.97, vPart) * vNear;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);` + TAIL_F + `}`;

// Set-piece guide ribbon: a camera-facing band of light that runs along the OUTSIDE of a loop or helix (offset against the path's up vector), with
// dashes of light flowing along the direction of travel. It makes the circle read from the side and from afar, and it never goes edge-on.
const RIBBON_VS = FOG_V + `
attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aS;
uniform float uWidth;
varying float vS; varying float vSide; varying float vFade;
void main(){
  vec3 T = normalize(aNext - aPrev + vec3(1e-4)), toCam = cameraPosition - position;
  vec3 side = normalize(cross(T, toCam) + vec3(1e-5));
  float d = length(toCam);
  vec3 world = position + side * aSide * uWidth * (1.0 + d * 0.004);        // widens with distance so it never thins out of sight
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vS = aS; vSide = aSide; vFade = smoothstep(16.0, 70.0, d);
  gl_Position = projectionMatrix * mv;
  vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const RIBBON_FS = FOG_F + `
uniform float uTime; uniform vec3 uColor;
varying float vS; varying float vSide; varying float vFade;
void main(){
  float core = pow(max(1.0 - abs(vSide), 0.0), 1.4);
  float dash = smoothstep(0.18, 0.5, abs(fract(vS * 0.04 - uTime * 0.8) - 0.5));
  float a = core * vFade * (0.42 + 0.58 * dash);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (1.1 + 1.5 * dash), a);` + TAIL_F + `}`;

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

/** Make a flat arrow + text sign texture (browser only). side > 0: arrow on the right pointing right; side < 0: arrow on the left pointing left. The text
 *  is never mirrored (flipping the whole quad would read backwards). */
function signTexture(text, color, side = 1) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,8,6,0.92)'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = color; g.lineWidth = 8; g.strokeRect(8, 8, 496, 144);
  g.fillStyle = color; g.font = '900 78px system-ui, Arial Black, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const room = 350, wide = g.measureText(text).width;
  if (wide > room) g.font = `900 ${Math.floor(78 * room / wide)}px system-ui, Arial Black, sans-serif`;
  g.fillText(text, side > 0 ? 26 : 136, 84);
  const ax = (x) => (side > 0 ? x : 512 - x);
  g.beginPath(); g.moveTo(ax(420), 36); g.lineTo(ax(490), 80); g.lineTo(ax(420), 124); g.lineTo(ax(420), 100); g.lineTo(ax(380), 100); g.lineTo(ax(380), 60); g.lineTo(ax(420), 60); g.closePath(); g.fill();
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

  // ---- rings (scoring gates, branch gates, boost rings). They are the single biggest fixed cost in a frame (sunrise: 107 rings x 1280 triangles = 137 k, a third
  // of the whole scene) and the stripes come from the uv, so a coarser torus looks the same: Low 320 triangles a ring, Med 832, High / Ultra 1280 (V-23).
  const sc = game.q?.scenery ?? 1, [tubeSeg, ringSeg] = sc < 0.6 ? [5, 32] : sc < 0.9 ? [8, 52] : [10, 64];
  const torus = new THREE.TorusGeometry(1, 0.055, tubeSeg, ringSeg);
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

  // ---- lane chevrons: flat arrowheads (dark outline + bright core) in the path plane, tilted toward the camera when seen edge-on (LANE_VS)
  const L = course.length, spacing = 24, count = Math.floor(L / spacing);
  const chevGeo = chevronGeometry();
  const laneMat = mat({ uTime }, LANE_VS, LANE_FS, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const laneChain = (n, geo) => {                                                      // one instanced chain; each chain owns its per-instance attributes
    const im = new THREE.InstancedMesh(geo, laneMat, n);
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = 3;
    return im;
  };
  const lanes = laneChain(count, chevGeo);
  const glow = new Float32Array(count), phase = new Float32Array(count), f = {}, h = {};
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) * (L / count);
    course.frameAt(s, f);
    course.aiHints(s, h);
    const heat = Math.min(1, Math.max(0, (118 - h.speedCap) / 48));
    _q.copy(basisQuatLocal(f)); _p.copy(f.pos).addScaledVector(f.up, -2.5);
    _m.compose(_p, _q, _s.set(12.5 + heat * 5, 1, 9.5 + heat * 2.5));
    lanes.setMatrixAt(i, _m);
    _c.copy(guideColor).lerp(warnColor, heat); lanes.setColorAt(i, _c);
    glow[i] = 0.55 + heat * 0.9; phase[i] = i * 0.55;
  }
  chevGeo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1)); chevGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  lanes.instanceColor.needsUpdate = true;
  group.add(lanes); disposables.push(chevGeo, laneMat);
  // shortcut branches get their own chain in the shortcut colour (shares the chevron buffers, owns its instanced attributes)
  for (const b of course.branches) {
    const n = Math.floor((b.length - 160) / 30);
    if (n < 2) continue;
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', chevGeo.attributes.position); g2.setAttribute('aPart', chevGeo.attributes.aPart); g2.setIndex(chevGeo.index);
    const ch = laneChain(n, g2), gl = new Float32Array(n), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      b.frameAt(80 + i * 30, f);
      _q.copy(basisQuatLocal(f)); _p.copy(f.pos).addScaledVector(f.up, -2.5);
      ch.setMatrixAt(i, _m.compose(_p, _q, _s.set(12, 1, 9))); ch.setColorAt(i, shortColor); gl[i] = 0.9; ph[i] = i * 0.6;
    }
    g2.setAttribute('aGlow', new THREE.InstancedBufferAttribute(gl, 1)); g2.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    ch.instanceColor.needsUpdate = true;
    group.add(ch); disposables.push(g2);
  }

  // ---- loop / helix guide ribbons: a band of light along the outside of each set piece, so the circle reads from the side and from afar
  {
    const ribbonMat = mat({ uTime, uWidth: { value: 1.7 }, uColor: { value: guideColor.clone() } }, RIBBON_VS, RIBBON_FS, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
    disposables.push(ribbonMat);
    for (const [a, b, off] of [['loopEntry', 'loopExit', 17], ['spireEntry', 'spireExit', 15]]) {
      const sa = course.marks[a], sb = course.marks[b];
      if (sa == null || sb == null || sb <= sa) continue;
      const step = 3, s0 = Math.max(0, sa - 40), s1 = Math.min(L - 1, sb + 40), n = Math.floor((s1 - s0) / step) + 1;
      const P = [];
      for (let i = 0; i < n; i++) { course.frameAt(s0 + i * step, f); _p.copy(f.pos).addScaledVector(f.up, -off); P.push(_p.x, _p.y, _p.z); }
      const pos = [], prv = [], nxt = [], side = [], arc = [], idx = [];
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 1) * 3, i1 = Math.min(n - 1, i + 1) * 3;
        for (let k = 0; k < 2; k++) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); prv.push(P[i0], P[i0 + 1], P[i0 + 2]); nxt.push(P[i1], P[i1 + 1], P[i1 + 2]); side.push(k ? 1 : -1); arc.push(i * step); }
        if (i < n - 1) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aPrev', new THREE.Float32BufferAttribute(prv, 3)); g.setAttribute('aNext', new THREE.Float32BufferAttribute(nxt, 3));
      g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1)); g.setAttribute('aS', new THREE.Float32BufferAttribute(arc, 1)); g.setIndex(idx);
      const m = new THREE.Mesh(g, ribbonMat); m.frustumCulled = false; m.renderOrder = 3; group.add(m); disposables.push(g);
    }
  }

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
    const bf = b.frameAt(Math.min(b.length * 0.5, 160), {}), s0 = b.fromS - 95, mf = course.frameAt(s0, {});
    const side = Math.sign(_p.copy(bf.pos).sub(mf.pos).dot(mf.right)) || 1;
    const tex = signTexture('SHORTCUT', '#ff8a2a', side);                  // the arrow points toward the branch side; the text always reads forwards
    const sm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, fog: true, side: THREE.DoubleSide });
    sm.color.setScalar(1.5);
    const geo = new THREE.PlaneGeometry(40, 12.5);
    const mesh = new THREE.Mesh(geo, sm);
    mesh.position.copy(mf.pos).addScaledVector(mf.right, side * (mf.halfWidth * 0.55)).addScaledVector(mf.up, 20);
    mesh.quaternion.copy(basisQuatLocal(mf));
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

/** Chevron arrowhead in the XZ plane, width 1 (x in -.5..+.5), tip toward -z: an outline polygon (aPart 0) then the bright core (aPart 1). */
function chevronGeometry() {
  const tau = 0.36, pos = [], part = [], idx = [];
  const poly = (list, kx, kz, p) => {                       // list of triangles given as [x,z] triples, scaled about (0, .08)
    for (const tri of list) { const base = pos.length / 3; for (const [x, z] of tri) { pos.push(x * kx, 0, (z - 0.08) * kz + 0.08); part.push(p); } idx.push(base, base + 1, base + 2); }
  };
  const arms = [
    [[-0.5, 0.5 - tau], [0, -0.5], [0, -0.5 + tau]], [[-0.5, 0.5 - tau], [0, -0.5 + tau], [-0.5, 0.5]],
    [[0, -0.5], [0.5, 0.5 - tau], [0.5, 0.5]], [[0, -0.5], [0.5, 0.5], [0, -0.5 + tau]],
  ];
  poly(arms, 1.12, 1.18, 0); poly(arms, 1, 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); g.setIndex(idx);
  return g;
}
