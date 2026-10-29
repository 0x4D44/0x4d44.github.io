// Neon Skyline scenery parts (signs, beacons, elevated highway, atrium interior, tower ring, giant screens, search lights, moon, traffic).
// Each factory returns { group?, update?, dispose } for course.addPart. Owner: craft agent (role C).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Bake a flat Group of static Meshes (same attribute layout) into one mesh per material: one draw call each instead of one per box.
// The merged geometries are returned in `geos` so the owner can dispose them.
export function bakeByMaterial(src) {
  src.updateMatrixWorld(true);
  const by = new Map(), out = new THREE.Group(), geos = [];
  for (const o of src.children) { if (!o.isMesh) continue; const g = o.geometry.clone(); g.applyMatrix4(o.matrix); if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(g); }
  for (const [mat, list] of by) { const g = list.length > 1 ? mergeGeometries(list) : list[0]; geos.push(g); const m = new THREE.Mesh(g, mat); out.add(m); if (g !== list[0]) list.forEach((x) => x.dispose()); }
  return { group: out, geos };
}

const PAL = `
vec3 neonPal(float k){
  k = fract(k);
  return k < 0.33 ? vec3(0.1, 0.9, 1.0) : (k < 0.62 ? vec3(1.0, 0.18, 0.75) : (k < 0.82 ? vec3(1.0, 0.62, 0.16) : vec3(0.65, 0.4, 1.0)));
}
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
const mkShader = (uniforms, vs, fs, opts = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, fog: true, ...opts });
const FOG_V = '#include <common>\n#include <fog_pars_vertex>\n';
const FOG_F = '#include <common>\n#include <fog_pars_fragment>\n';

// ------------------------------------------------------------------------------------------------ neon signs (instanced quads)
export function createSigns(game, signs) {
  const n = signs.length;
  const geo = new THREE.InstancedBufferGeometry(); const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  const aPos = new Float32Array(n * 4), aUv = new Float32Array(n * 4), aMisc = new Float32Array(n * 3), tmp = new THREE.Vector4();
  signs.forEach((s, i) => {
    aPos.set([s.x, s.y, s.z, s.size], i * 4); game.assets.uv('neon_signs', s.cell, tmp); aUv.set([tmp.x, tmp.y, tmp.z, tmp.w], i * 4);
    aMisc.set([s.nx, s.nz, s.phase + s.hue * 3.0], i * 3);
  });
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 4)); geo.setAttribute('aUv', new THREE.InstancedBufferAttribute(aUv, 4)); geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(aMisc, 3));
  geo.instanceCount = n;
  const u = { ...fogUniforms(), tSigns: { value: game.assets.tex('neon_signs') }, uTime: { value: 0 } };
  const mat = mkShader(u, `${FOG_V}attribute vec4 aPos; attribute vec4 aUv; attribute vec3 aMisc; varying vec2 vUv; varying vec2 vP; varying float vPh;
void main(){
  vec3 nrm = vec3(aMisc.x, 0.0, aMisc.y), right = vec3(nrm.z, 0.0, -nrm.x);
  vec3 w = aPos.xyz + right * position.x * aPos.w + vec3(0.0, 1.0, 0.0) * position.y * aPos.w;
  vUv = aUv.xy + uv * aUv.zw; vP = uv; vPh = aMisc.z;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`, `${FOG_F}${PAL}uniform sampler2D tSigns; uniform float uTime; varying vec2 vUv; varying vec2 vP; varying float vPh;
void main(){
  vec3 c = texture2D(tSigns, vUv).rgb;
  float e = min(min(vP.x, 1.0 - vP.x), min(vP.y, 1.0 - vP.y));
  float flick = 0.82 + 0.18 * sin(uTime * (1.5 + fract(vPh) * 2.0) + vPh * 6.0);
  flick *= 1.0 - 0.7 * step(0.992, h21(vec2(floor(uTime * 3.0 + vPh * 9.0), vPh)));
  vec3 frame = neonPal(vPh) * (1.0 - smoothstep(0.012, 0.03, e)) * 2.4;
  gl_FragColor = vec4(c * 2.1 * flick + frame * flick, 1.0);
  #include <fog_fragment>
}`);
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'signs';
  return { group: mesh, update(dt) { u.uTime.value += dt; }, dispose() { geo.dispose(); base.dispose(); mat.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ aviation beacons + decorative air traffic (points)
function pointsMaterial(extra = '') {
  const u = { uTime: { value: 0 }, uScale: { value: 520 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec4 aData; attribute vec3 aCol; uniform float uTime, uScale; varying vec3 vC; varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  float blink = ${extra || '1.0'};
  gl_PointSize = clamp(aData.x * uScale / max(d, 1.0), 2.0, 30.0);
  vC = aCol * blink; vA = (1.0 - smoothstep(1500.0, 4200.0, d)) * smoothstep(8.0, 30.0, d);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `varying vec3 vC; varying float vA;
void main(){
  vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, r)); a = a * a;
  gl_FragColor = vec4(vC * a * vA, 1.0);
}`,
  });
  return { m, u };
}

export function createBeacons(list) {
  const n = list.length, geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), data = new Float32Array(n * 4), col = new Float32Array(n * 3);
  list.forEach((b, i) => { pos.set([b.x, b.y, b.z], i * 3); data.set([b.size, b.phase, 0, 0], i * 4); col.set([4.0, 0.25, 0.18], i * 3); });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aData', new THREE.BufferAttribute(data, 4)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const { m, u } = pointsMaterial('0.08 + pow(max(sin(uTime * 4.2 + aData.y), 0.0), 6.0)');
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.name = 'beacons';
  return { group: pts, update(dt, g) { u.uTime.value += dt; u.uScale.value = (g.renderer.domElement.height || 720) * 0.9; }, dispose() { geo.dispose(); m.dispose(); } };
}

/** Distant flying traffic on straight air lanes (decorative, no collision): a white head light and a red tail light per craft. */
export function createAirTraffic(rnd, centre, count) {
  const lanes = [];
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, r = 200 + rnd() * 1300, y = 210 + rnd() * 170, dir = rnd() * Math.PI * 2;
    lanes.push({ x: centre.x + Math.cos(a) * r, z: centre.z + Math.sin(a) * r, y, dx: Math.cos(dir), dz: Math.sin(dir), len: 2600 });
  }
  const craft = []; for (let i = 0; i < count; i++) craft.push({ lane: lanes[i % lanes.length], off: rnd() * 2600, speed: 26 + rnd() * 30, side: (rnd() - 0.5) * 60, dy: (rnd() - 0.5) * 24 });
  const n = craft.length * 2, geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), data = new Float32Array(n * 4), col = new Float32Array(n * 3);
  craft.forEach((c, i) => { data.set([1.5, 0, 0, 0], i * 8); data.set([1.2, 0, 0, 0], i * 8 + 4); col.set([3.2, 3.0, 2.6], i * 6); col.set([3.2, 0.2, 0.15], i * 6 + 3); });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aData', new THREE.BufferAttribute(data, 4)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const { m, u } = pointsMaterial('1.0');
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.name = 'airTraffic';
  let tm = 0;
  return {
    group: pts,
    update(dt, g) {
      tm += dt; u.uScale.value = (g.renderer.domElement.height || 720) * 0.9;
      craft.forEach((c, i) => {
        const L = c.lane, d = (c.off + c.speed * tm) % L.len - L.len / 2, px = L.x + L.dx * d - L.dz * c.side, pz = L.z + L.dz * d + L.dx * c.side;
        pos.set([px, L.y + c.dy, pz], i * 6); pos.set([px - L.dx * 7, L.y + c.dy, pz - L.dz * 7], i * 6 + 3);
      });
      geo.attributes.position.needsUpdate = true;
    },
    dispose() { geo.dispose(); m.dispose(); },
  };
}

// ------------------------------------------------------------------------------------------------ elevated highway
export function createHighway(city, game) {
  const H = city.highway, pts = H.pts, n = pts.length, half = H.half, th = H.deckThick;
  const pos = [], uvv = [], part = [], hgt = [], idx = [];
  const add = (x, y, z, u, v, p, hh = 0) => { pos.push(x, y, z); uvv.push(u, v); part.push(p); hgt.push(hh); return pos.length / 3 - 1; };
  let s = 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const rx = tz, rz = -tx;
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const p = pts[i], L = { x: p.x - rx * half, z: p.z - rz * half }, R = { x: p.x + rx * half, z: p.z + rz * half };
    rows.push({
      topL: add(L.x, p.y, L.z, -half, s, 0), topR: add(R.x, p.y, R.z, half, s, 0),
      sL0: add(L.x, p.y, L.z, -half, s, 1, 1), sL1: add(L.x, p.y - th, L.z, -half, s, 1, 0),
      sR0: add(R.x, p.y, R.z, half, s, 1, 1), sR1: add(R.x, p.y - th, R.z, half, s, 1, 0),
      bL: add(L.x - rx * 0.0, p.y - th, L.z, -half, s, 2), bR: add(R.x, p.y - th, R.z, half, s, 2),
    });
  }
  for (let i = 0; i < n - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    idx.push(a.topL, b.topL, a.topR, a.topR, b.topL, b.topR);
    idx.push(a.sL0, a.sL1, b.sL0, b.sL0, a.sL1, b.sL1);
    idx.push(a.sR0, b.sR0, a.sR1, a.sR1, b.sR0, b.sR1);
    idx.push(a.bL, a.bR, b.bL, b.bL, a.bR, b.bR);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aUv', new THREE.Float32BufferAttribute(uvv, 2)); geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); geo.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
  geo.setIndex(idx);
  const u = { ...fogUniforms(), uTime: { value: 0 } };
  const mat = mkShader(u, `${FOG_V}attribute vec2 aUv; attribute float aPart, aH; varying vec2 vUv; varying float vPart, vH;
void main(){ vUv = aUv; vPart = aPart; vH = aH; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`, `${FOG_F}${PAL}uniform float uTime; varying vec2 vUv; varying float vPart, vH;
vec3 laneLights(float v, float l, float lc, float dir, float seedv){
  float cellLen = 16.0 + 4.0 * abs(lc) * 0.3;
  float vv = v - dir * uTime * (34.0 + abs(lc) * 1.6);
  float cc = floor(vv / cellLen), r = h21(vec2(cc, seedv));
  if (r < 0.4) return vec3(0.0);
  float f = fract(vv / cellLen) * cellLen, head = cellLen * (0.45 + 0.35 * h21(vec2(cc, seedv + 3.0)));
  float dl = (f - head) * dir;
  float body = smoothstep(0.0, 1.0, 1.0 - abs(dl - 2.0) / 2.4);
  float trail = exp(-max(dl, 0.0) / 9.0) * step(0.0, dl) * 0.65;
  float across = 1.0 - smoothstep(0.55, 1.1, abs(l - lc));
  vec3 c = dir > 0.0 ? vec3(1.0, 0.9, 0.68) * 3.4 : vec3(1.0, 0.1, 0.08) * 2.8;
  return c * (body + trail) * across;
}
void main(){
  vec3 col = vec3(0.01, 0.011, 0.02);
  if (vPart < 0.5) {
    float l = vUv.x, v = vUv.y, el = abs(l);
    col = vec3(0.018, 0.02, 0.032);
    col += laneLights(v, l, -13.5, -1.0, 1.0) + laneLights(v, l, -8.5, -1.0, 2.0) + laneLights(v, l, -3.5, -1.0, 3.0);
    col += laneLights(v, l, 3.5, 1.0, 4.0) + laneLights(v, l, 8.5, 1.0, 5.0) + laneLights(v, l, 13.5, 1.0, 6.0);
    col += vec3(0.1, 0.9, 1.0) * 1.8 * (1.0 - smoothstep(0.12, 0.3, abs(l))) * step(0.5, fract(v / 6.0));   // dashed median
    col += vec3(1.0, 0.45, 0.12) * 2.2 * (1.0 - smoothstep(0.15, 0.4, abs(el - 17.6)));                      // edge lines
    col += vec3(1.0, 0.2, 0.7) * 2.6 * smoothstep(18.2, 18.7, el);                                           // rail glow strip
  } else if (vPart < 1.5) {
    col = vec3(0.03, 0.03, 0.05) + vec3(1.0, 0.2, 0.7) * 2.4 * smoothstep(0.62, 0.95, vH);                       // glowing top edge of the side face
  } else if (vPart < 2.5) {
    col = vec3(0.015, 0.015, 0.025);
  } else {
    col = vec3(0.02, 0.022, 0.034);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`, { side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'highway';
  // pylons
  const pg = new THREE.BoxGeometry(1, 1, 1); pg.translate(0, 0.5, 0);
  const pm = new THREE.MeshBasicMaterial({ color: 0x0c0c18 }); const list = [];
  for (let i = 4; i < n - 4; i += 9) { const p = pts[i], q = pts[Math.min(n - 1, i + 1)]; let tx = q.x - p.x, tz = q.z - p.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; for (const sd of [-1, 1]) list.push({ x: p.x + tz * 11 * sd, z: p.z - tx * 11 * sd, h: p.y - th, yaw: Math.atan2(tx, tz) }); }
  const inst = new THREE.InstancedMesh(pg, pm, list.length), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  list.forEach((b, i) => { qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw); m4.compose(ps.set(b.x, -2, b.z), qq, sc.set(5, b.h + 2, 5)); inst.setMatrixAt(i, m4); });
  inst.frustumCulled = false;
  const grp = new THREE.Group(); grp.add(mesh, inst);
  return { group: grp, update(dt) { u.uTime.value += dt; }, dispose() { geo.dispose(); mat.dispose(); pg.dispose(); pm.dispose(); inst.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ atrium interior + portals
export function createAtriumInterior(city, N) {
  const A = city.atrium, x0 = A.cx - A.hl, x1 = A.cx + A.hl, z = A.cz, wi = 44, yf = A.floor, yc = 135;
  const pos = [], uvs = [], mode = [], idx = [];
  const quad = (a, b, c, d, uA, uB, uC, uD, m) => { const o = pos.length / 3; pos.push(...a, ...b, ...c, ...d); uvs.push(...uA, ...uB, ...uC, ...uD); mode.push(m, m, m, m); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  // walls (u = x along the tunnel, v = height), ceiling and floor (u = x, v = lateral)
  quad([x0, yf, z - wi], [x1, yf, z - wi], [x1, yc, z - wi], [x0, yc, z - wi], [x0, 0], [x1, 0], [x1, yc - yf], [x0, yc - yf], 0);
  quad([x1, yf, z + wi], [x0, yf, z + wi], [x0, yc, z + wi], [x1, yc, z + wi], [x1, 0], [x0, 0], [x0, yc - yf], [x1, yc - yf], 0);
  quad([x0, yc, z - wi], [x1, yc, z - wi], [x1, yc, z + wi], [x0, yc, z + wi], [x0, -wi], [x1, -wi], [x1, wi], [x0, wi], 1);
  quad([x0, yf, z + wi], [x1, yf, z + wi], [x1, yf, z - wi], [x0, yf, z - wi], [x0, wi], [x1, wi], [x1, -wi], [x0, -wi], 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aUv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setAttribute('aMode', new THREE.Float32BufferAttribute(mode, 1)); geo.setIndex(idx);
  const u = { ...fogUniforms(), uTime: { value: 0 } };
  const mat = mkShader(u, `${FOG_V}attribute vec2 aUv; attribute float aMode; varying vec2 vUv; varying float vMode;
void main(){ vUv = aUv; vMode = aMode; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`, `${FOG_F}${PAL}uniform float uTime; varying vec2 vUv; varying float vMode;
void main(){
  float x = vUv.x, v = vUv.y;
  vec3 warm = vec3(1.0, 0.55, 0.22), pink = vec3(1.0, 0.2, 0.65), cyan = vec3(0.1, 0.9, 1.0);
  vec3 col = vec3(0.05, 0.03, 0.035);
  if (vMode < 0.5) {                                            // walls: pilasters every 24 m, light bands, panels
    float pil = 1.0 - smoothstep(0.5, 1.2, abs(mod(x + 12.0, 24.0) - 12.0));
    float band = 1.0 - smoothstep(0.1, 0.5, abs(v - 12.0));
    float band2 = 1.0 - smoothstep(0.1, 0.5, abs(v - 40.0));
    float panel = step(0.5, fract(x / 6.0)) * step(0.5, fract(v / 9.0)) * 0.12;
    col += warm * (0.1 + panel * 0.6) + warm * 1.3 * pil + pink * 1.1 * band + cyan * 0.8 * band2;
    col *= 0.55 + 0.45 * smoothstep(0.0, 14.0, v);
  } else if (vMode < 1.5) {                                      // ceiling: three long light strips and cross ribs
    float st = 1.0 - smoothstep(0.5, 1.3, abs(abs(v) - 14.0));
    float st0 = 1.0 - smoothstep(0.4, 1.0, abs(v));
    float rib = 1.0 - smoothstep(0.3, 0.9, abs(mod(x + 6.0, 12.0) - 6.0));
    col += warm * 0.1 + vec3(1.0, 0.85, 0.65) * 1.5 * st + vec3(1.0, 0.8, 0.6) * 1.8 * st0 + pink * 0.7 * rib * 0.5;
  } else {                                                       // floor: polished dark, amber centre line, chasing lane lights
    float line = (1.0 - smoothstep(0.2, 0.6, abs(abs(v) - 17.0))) * step(0.5, fract((x - uTime * 22.0) / 10.0));
    float c0 = (1.0 - smoothstep(0.2, 0.5, abs(v))) * step(0.5, fract(x / 8.0));
    col = vec3(0.025, 0.02, 0.03) + warm * 0.06 + warm * 1.5 * line + cyan * 1.2 * c0;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`, { side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'atriumInterior';
  // portal frames at both ends
  const frame = new THREE.Group(), fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.25, 0.7).multiplyScalar(1.7), toneMapped: false }), fm2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.95, 1.0).multiplyScalar(1.6), toneMapped: false });
  const bar = new THREE.BoxGeometry(1, 1, 1);
  for (const [x, m] of [[x0 - 0.6, fm], [x1 + 0.6, fm2]]) {
    const parts = [[0, yc + 2.2, 0, 3, 4, 2 * wi + 8], [0, yf - 2.2, 0, 3, 4, 2 * wi + 8], [0, (yc + yf) / 2, -(wi + 2), 3, yc - yf + 4, 4], [0, (yc + yf) / 2, wi + 2, 3, yc - yf + 4, 4]];
    for (const [dx, y, dz, w, h, d] of parts) { const b = new THREE.Mesh(bar, m); b.position.set(x + dx, y, z + dz); b.scale.set(w, h, d); frame.add(b); }
  }
  const baked = bakeByMaterial(frame);
  const grp = new THREE.Group(); grp.add(mesh, baked.group);
  return { group: grp, update(dt) { u.uTime.value += dt; }, dispose() { geo.dispose(); mat.dispose(); bar.dispose(); baked.geos.forEach((g) => g.dispose()); fm.dispose(); fm2.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ tower ring
export function createTowerRing(city, N, towerFaceDist) {
  const T = N.towerLoop, R = T.R + 22, c = city.loopCentre;
  const rightX = -T.heading[1], rightZ = T.heading[0];
  const grp = new THREE.Group();
  const geo = new THREE.TorusGeometry(R, 3.4, 10, 120);
  const u = { ...fogUniforms(), uTime: { value: 0 } };
  const mat = mkShader(u, `${FOG_V}varying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`, `${FOG_F}${PAL}uniform float uTime; varying vec2 vUv;
void main(){
  float a = vUv.x * 48.0;
  float chase = 0.5 + 0.5 * sin(a * 3.14159 * 0.5 - uTime * 3.0);
  vec3 c = mix(vec3(1.0, 0.2, 0.75), vec3(0.1, 0.92, 1.0), step(0.5, fract(a * 0.5 - uTime * 0.25)));
  float tube = 0.6 + 0.4 * cos((vUv.y - 0.5) * 6.2832);
  gl_FragColor = vec4(c * (0.8 + 2.8 * chase) * tube, 1.0);
  #include <fog_fragment>
}`);
  const ring = new THREE.Mesh(geo, mat); ring.position.set(c.x, c.y, c.z);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(rightX, 0, rightZ)); grp.add(ring);
  // two beams tie the ring to the tower (top and bottom), plus a thin bright rim
  const bg = new THREE.BoxGeometry(1, 1, 1), bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.75, 0.9).multiplyScalar(1.4), toneMapped: false }), bm2 = new THREE.MeshStandardMaterial({ color: 0x1a1c2a, metalness: 0.7, roughness: 0.4 });
  const beams = new THREE.Group();
  for (const sy of [1, -1]) {
    const y = c.y + sy * R, len = towerFaceDist;
    const b = new THREE.Mesh(bg, bm2); b.scale.set(len, 5, 5); b.position.set(c.x - rightX * len / 2, y, c.z - rightZ * len / 2); b.rotation.y = Math.atan2(-rightZ, rightX) * 0 + (rightX ? 0 : Math.PI / 2); beams.add(b);
    const g2 = new THREE.Mesh(bg, bm); g2.scale.set(len, 0.8, 0.8); g2.position.set(b.position.x, y + 2.8, b.position.z); g2.rotation.y = b.rotation.y; beams.add(g2);
  }
  const baked = bakeByMaterial(beams); grp.add(baked.group);
  return { group: grp, update(dt) { u.uTime.value += dt; }, dispose() { geo.dispose(); mat.dispose(); bg.dispose(); baked.geos.forEach((g) => g.dispose()); bm.dispose(); bm2.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ giant screens at the shortcut slot
export function createScreens(city, game, N) {
  const g = city.screens.gap, grp = new THREE.Group(), S = N.screens;
  const u = { ...fogUniforms(), tSigns: { value: game.assets.tex('neon_signs') }, uTime: { value: 0 } };
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x06060d }), bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.42, 0.08).multiplyScalar(3.4), toneMapped: false });
  const planeGeo = new THREE.PlaneGeometry(1, 1), tmp = new THREE.Vector4(), mats = [];
  const yaw = Math.atan2(g.tx, g.tz);                                     // slab local z axis -> flight tangent
  let k = 0;
  const solid = new THREE.Group();                                         // slab bodies + glowing edges, baked into 2 draw calls
  for (const r of city.screens) {
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.scale.set(S.w, S.top, S.d); body.position.set(r.cx, S.top / 2 - 2, r.cz); body.rotation.y = yaw; solid.add(body);
    // glowing inner edge (facing the slot) and top edge
    const sd = -r.side, ex = r.cx + g.rx * sd * (S.w / 2 + 0.2), ez = r.cz + g.rz * sd * (S.w / 2 + 0.2);
    const e = new THREE.Mesh(bodyGeo, edgeMat); e.scale.set(1.6, S.top, S.d + 0.8); e.position.set(ex, S.top / 2 - 2, ez); e.rotation.y = yaw; solid.add(e);
    const e2 = new THREE.Mesh(bodyGeo, edgeMat); e2.scale.set(S.w, 1.6, S.d + 0.8); e2.position.set(r.cx, S.top - 1, r.cz); e2.rotation.y = yaw; solid.add(e2);
    for (const face of [1, -1]) {
      game.assets.uv('neon_signs', k % 8 === 0 ? 3 : (k * 3 + 1) % 8, tmp);
      const m = mkShader({ ...fogUniforms(), tSigns: u.tSigns, uTime: u.uTime, uUv: { value: tmp.clone() } }, `${FOG_V}varying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`, `${FOG_F}${PAL}uniform sampler2D tSigns; uniform vec4 uUv; uniform float uTime; varying vec2 vUv;
void main(){
  vec2 p = vUv;
  vec3 col = vec3(0.01, 0.012, 0.03);
  float sq = 0.62;                                                      // big square sign on the upper part
  if (p.y > 1.0 - sq * 0.455) { vec2 q = vec2(p.x, (p.y - (1.0 - sq * 0.455)) / (sq * 0.455)); col = texture2D(tSigns, uUv.xy + q * uUv.zw).rgb * (2.2 + 0.4 * sin(uTime * 2.0)); }
  else {                                                                 // lower: scrolling colour bands
    float y = p.y / (1.0 - sq * 0.455);
    float b = floor((p.x * 14.0 + uTime * 1.3 + y * 3.0));
    col = neonPal(h21(vec2(b, floor(y * 9.0))) * 3.0) * step(0.55, h21(vec2(b, floor(y * 9.0) + 4.0))) * 1.8 * (0.5 + 0.5 * sin(uTime * 3.0 + b));
  }
  float e = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
  col += vec3(1.0, 0.2, 0.75) * (1.0 - smoothstep(0.008, 0.02, e)) * 3.0;
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`); mats.push(m);
      const pl = new THREE.Mesh(planeGeo, m); pl.scale.set(S.w - 4, S.top - 8, 1);
      pl.position.set(r.cx + g.tx * face * (S.d / 2 + 0.15), (S.top - 4) / 2 + 2, r.cz + g.tz * face * (S.d / 2 + 0.15));
      pl.rotation.y = yaw + (face > 0 ? 0 : Math.PI); grp.add(pl);
    }
    k++;
  }
  const baked = bakeByMaterial(solid); grp.add(baked.group);
  return { group: grp, update(dt) { u.uTime.value += dt; }, dispose() { baked.geos.forEach((g) => g.dispose()); bodyMat.dispose(); bodyGeo.dispose(); edgeMat.dispose(); planeGeo.dispose(); mats.forEach((m) => m.dispose()); } };
}

// ------------------------------------------------------------------------------------------------ search lights
export function createSearchLights(list) {
  const geo = new THREE.CylinderGeometry(34, 1.6, 1100, 14, 1, true); geo.translate(0, 550, 0);
  const u = { ...fogUniforms(), uTime: { value: 0 } };
  const mat = mkShader(u, `${FOG_V}varying float vY; varying vec3 vNn; varying vec3 vV;
void main(){ vY = position.y / 1100.0; vNn = normalize(normalMatrix * mat3(instanceMatrix) * normal); vec4 mvPosition = modelViewMatrix * (instanceMatrix * vec4(position, 1.0)); vV = normalize(-mvPosition.xyz); gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`, `${FOG_F}varying float vY; varying vec3 vNn; varying vec3 vV;
void main(){
  float edge = pow(abs(dot(normalize(vNn), normalize(vV))), 1.4);
  float a = edge * (1.0 - vY) * (0.35 + 0.65 * (1.0 - vY));
  gl_FragColor = vec4(vec3(0.55, 0.8, 1.0) * a * 0.9, a);
  #include <fog_fragment>
}`, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  // one InstancedMesh for every beam (one draw call): each instance is T(pos) * Ry(spin) * Rz(tilt), spin advanced per frame
  const grp = new THREE.Group(), beams = [];
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); inst.frustumCulled = false; inst.count = list.length;
  list.forEach((p, i) => beams.push({ x: p.x, y: p.y + 2, z: p.z, tilt: 0.28 + (i % 3) * 0.08, yaw: 0, spd: (i % 2 ? 1 : -1) * (0.12 + (i % 4) * 0.03) }));
  const eu = new THREE.Euler(0, 0, 0, 'YXZ'), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3(), mm = new THREE.Matrix4();
  const place = () => { beams.forEach((b, i) => { eu.set(0, b.yaw, 0); q.setFromEuler(eu); const qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), b.tilt); q.multiply(qt); mm.compose(ps.set(b.x, b.y, b.z), q, one); inst.setMatrixAt(i, mm); }); inst.instanceMatrix.needsUpdate = true; };
  place(); grp.add(inst);
  return { group: grp, update(dt) { u.uTime.value += dt; for (const b of beams) b.yaw += dt * b.spd; place(); }, dispose() { geo.dispose(); mat.dispose(); inst.dispose(); } };
}

// ------------------------------------------------------------------------------------------------ moon
export function createMoon(game, env) {
  const grp = new THREE.Group(), d = env.sunDir.clone().normalize();
  const geo = new THREE.SphereGeometry(1, 24, 16), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 3.2), fog: false, toneMapped: false, depthWrite: false });
  const moon = new THREE.Mesh(geo, mat); moon.scale.setScalar(150); moon.renderOrder = -900; grp.add(moon);
  const gm = new THREE.SpriteMaterial({ map: game.assets.tex('sun_glow'), color: new THREE.Color(0.45, 0.6, 1.0), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true });
  const glow = new THREE.Sprite(gm); glow.scale.setScalar(2300); glow.renderOrder = -899; grp.add(glow);
  return { group: grp, update(dt, g, course, cam) { grp.position.copy(cam.position).addScaledVector(d, 6000); }, dispose() { geo.dispose(); mat.dispose(); gm.dispose(); } };
}
