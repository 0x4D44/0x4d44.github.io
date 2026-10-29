// The Frozen Fall: a half-frozen, three-tier waterfall that pours down the north cliff behind the loop. Layered cascades with a flowing-water
// shader (frozen ribs and foaming lips), ice shelves and an icicle fringe, ice-pillar buttresses, a plunge pool with drifting floes, rising mist and
// spray, and a warm amber cave glow at the foot. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../../util.js';
import { makeSnowDrift, makeIceFloe, makeIceSpire, makeIcicle, instancedQ } from '../props-ice.js';
import { createSteam, createPools, createGlowPoints } from '../atmos.js';

const FOG_V = '#include <common>\n#include <fog_pars_vertex>\n';
const FOG_F = '#include <common>\n#include <fog_pars_fragment>\n';
const NOISE = `
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const FALL_VS = FOG_V + `
attribute float aTier;
varying vec2 vUv; varying vec3 vN, vW; varying float vTier;
void main(){
  vUv = uv; vTier = aTier;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * w; gl_Position = projectionMatrix * mv; vec4 mvPosition = mv;
  #include <fog_vertex>
}`;
const FALL_FS = FOG_F + NOISE + `
uniform float uTime, uGlow; uniform vec3 uSun, uSunCol, uDeep, uFoam;
varying vec2 vUv; varying vec3 vN, vW; varying float vTier;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float x = vUv.x * 52.0 + vTier * 17.0, t = uTime * (0.8 + 0.22 * vTier);
  float flow = vUv.y * 10.0 + t;
  float streak = n2(vec2(x, flow)) * 0.6 + n2(vec2(x * 2.1, flow * 1.7 + 4.0)) * 0.4;
  float rib = n2(vec2(x * 0.28 + vTier * 5.0, vUv.y * 3.0));
  float frozen = smoothstep(0.56, 0.8, rib);
  float core = smoothstep(0.26, 0.85, streak);
  float stream = smoothstep(0.1, 0.34, n2(vec2(vUv.x * 9.0 + vTier * 5.3, vUv.y * 1.3 + 2.0)));      // braided streams: bare rock shows between them
  vec3 water = mix(uDeep, uFoam, core);
  vec3 ice = mix(vec3(0.58, 0.80, 1.0), vec3(0.95, 0.98, 1.0), n2(vec2(x * 1.3, vUv.y * 8.0)));
  vec3 col = mix(water, ice, frozen);
  float ndl = clamp(dot(N, uSun) * 0.5 + 0.5, 0.0, 1.0);
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
  col = col * (0.6 + 0.8 * ndl) + uSunCol * ndl * 0.1 + fres * vec3(0.25, 0.4, 0.8);
  col += smoothstep(0.84, 1.0, vUv.y) * (1.0 - frozen) * vec3(0.55, 0.72, 0.95);
  float wob = n2(vec2(vUv.y * 7.0 + vTier * 3.0, 1.7 + vTier)) * 0.16;
  float edge = smoothstep(wob, wob + 0.1, vUv.x) * smoothstep(1.0 - wob, 0.9 - wob, vUv.x);
  gl_FragColor = vec4(col * uGlow, edge * max(stream, frozen) * 0.95);` + '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n' + `}`;

/** Builds the fall. Returns { parts, center } - parts are course parts ({ group?, update?, dispose? }). */
export function buildFrozenFall(course, game, H, { iceMat, q }) {
  const env = course.environment, parts = [], rnd = mulberry32(0xfa11);
  const lt = course.frameAt(course.marks.loopTop, {});
  const X0 = lt.pos.x - 8, zStart = lt.pos.z - 70, floorH = H(X0, zStart);
  const group = new THREE.Group(); group.name = 'frozenfall';
  const zAt = (x, y) => { let z = zStart; for (let i = 0; i < 120 && z > zStart - 480; i++, z -= 4) if (H(x, z) >= y) return z; return NaN; };
  const zFoot = zAt(X0, floorH + 6);

  // ---- cascade sheets: three tiers, fan-shaped, hugging the cliff
  const tiers = [{ ya: floorH + 2, yb: floorH + 125, w: 300, dx: 0 }, { ya: floorH + 125, yb: floorH + 245, w: 230, dx: -45 }, { ya: floorH + 245, yb: floorH + 395, w: 170, dx: 30 }];
  const pos = [], uv = [], tr = [], idx = [];
  const NX = 30, NY = 9;
  tiers.forEach((T, ti) => {
    const base = pos.length / 3, ok = [];
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, x = X0 + T.dx + (u - 0.5) * T.w * (1 + 0.04 * Math.sin(u * 9 + ti * 2));
      for (let j = 0; j <= NY; j++) {
        const v = j / NY, y = T.ya + (T.yb - T.ya) * v + (ti > 0 ? -4 : 0);
        const z = zAt(x, y);
        const pull = 6 + 2.5 * Math.sin(i * 1.3 + j * 0.9 + ti) + 4 * Math.sin(u * 3 + ti) * Math.sin(v * 4);          // bulge toward the viewer: layered, not flat
        pos.push(x, y, (Number.isNaN(z) ? zStart : z) + pull); uv.push(u, v); tr.push(ti); ok.push(!Number.isNaN(z));
      }
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const a = base + i * (NY + 1) + j, b = base + (i + 1) * (NY + 1) + j;
      if (!ok[i * (NY + 1) + j] || !ok[(i + 1) * (NY + 1) + j] || !ok[i * (NY + 1) + j + 1] || !ok[(i + 1) * (NY + 1) + j + 1]) continue;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('aTier', new THREE.Float32BufferAttribute(tr, 1));
  geo.setIndex(idx); geo.computeVertexNormals();
  const u = {
    uTime: { value: 0 }, uGlow: { value: 0.78 }, uSun: { value: env.sunDir.clone() }, uSunCol: { value: env.sunColor.clone() }, uDeep: { value: new THREE.Color(0.06, 0.26, 0.62) }, uFoam: { value: new THREE.Color(0.72, 0.88, 1.0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, u]), vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  Object.assign(mat.uniforms, u);
  const fall = new THREE.Mesh(geo, mat); fall.renderOrder = 2; fall.name = 'cascade'; fall.frustumCulled = false; group.add(fall);

  // ---- ice shelves at the ledges + icicle fringes under them + ice-pillar buttresses at the foot
  const drift = makeSnowDrift({ seed: 9 }), icicle = makeIcicle({ seed: 2 });
  const shelves = [], icicles = [];
  [tiers[0].yb, tiers[1].yb, tiers[2].yb + 6].forEach((y, k) => {
    const T2 = tiers[Math.min(k + 1, 2)], w = T2.w * 0.9, cx = X0 + T2.dx;
    for (let i = 0; i < 7 - k; i++) {
      const x = cx + ((i + 0.5) / (7 - k) - 0.5) * w * 1.05 + (rnd() - 0.5) * 12, z = zAt(x, y);
      if (Number.isNaN(z)) continue;
      shelves.push({ pos: new THREE.Vector3(x, y - 3, z + 6), yaw: rnd() * 6, scale: new THREE.Vector3(16 + rnd() * 14, 5 + rnd() * 5, 12 + rnd() * 10) });
    }
    for (let i = 0; i < 46; i++) {
      const x = cx + (rnd() - 0.5) * w * 1.08, z = zAt(x, y);
      if (Number.isNaN(z)) continue;
      const len = 9 + rnd() * 30;
      icicles.push({ pos: new THREE.Vector3(x, y - 2 - rnd() * 3, z + 9 + rnd() * 4), yaw: rnd() * 6, scale: new THREE.Vector3(1.2 + rnd() * 2.2, len, 1.2 + rnd() * 2.2) });
    }
  });
  const snowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: new THREE.Color(0x4a60a8), emissiveIntensity: 0.28 });
  if (shelves.length) group.add(instancedQ(drift, snowMat, shelves, { cast: false }));
  if (icicles.length) group.add(instancedQ(icicle, iceMat, icicles, { cast: false }));
  const pillarGeo = makeIceSpire({ seed: 21, taper: 0.62, sides: 8, rings: 9, shards: 4 }), pillars = [];
  if (!Number.isNaN(zFoot)) for (let i = 0; i < 11; i++) {
    const x = X0 + (i / 10 - 0.5) * 300 + (rnd() - 0.5) * 18, z = zAt(x, floorH + 12);
    if (Number.isNaN(z)) continue;
    const h = 40 + rnd() * 70, r = 6 + rnd() * 8;
    pillars.push({ pos: new THREE.Vector3(x, H(x, z + 10) - 4, z + 8 + rnd() * 10), yaw: rnd() * 6, scale: new THREE.Vector3(r, h, r) });
  }
  if (pillars.length) group.add(instancedQ(pillarGeo, iceMat, pillars, { cast: false }));

  // ---- plunge pool with drifting floes
  const px = X0, pz = (Number.isNaN(zFoot) ? zStart - 60 : zFoot) + 55, poolY = floorH + 1.4;
  const pools = createPools([{ x: px, y: poolY, z: pz, rx: 205, rz: 105 }], env);
  const floeGeo = makeIceFloe({ seed: 4 }), floeCount = Math.max(6, Math.round(26 * q.scenery)), floeData = [];
  for (let i = 0; i < floeCount; i++) { const a = rnd() * 6.283, r = 0.12 + Math.sqrt(rnd()) * 0.8; floeData.push({ a, r, sp: (rnd() - 0.5) * 0.05, size: 5 + rnd() * 13, rot: rnd() * 6, spin: (rnd() - 0.5) * 0.12, ph: rnd() * 6 }); }
  const floes = instancedQ(floeGeo, snowMat, floeData.map((d) => ({ pos: new THREE.Vector3(), scale: d.size })), { receive: false });
  group.add(floes);
  const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fp = new THREE.Vector3(), fs = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  const moveFloes = (t) => {
    floeData.forEach((d, i) => {
      const a = d.a + d.sp * t, x = px + Math.cos(a) * d.r * 205 + Math.sin(t * 0.3 + d.ph) * 3, z = pz + Math.sin(a) * d.r * 105 + Math.cos(t * 0.27 + d.ph) * 3;
      fp.set(x, poolY + 0.4 + 0.25 * Math.sin(t * 0.8 + d.ph), z); fq.setFromAxisAngle(ax, d.rot + d.spin * t); fs.set(d.size, d.size * 0.9, d.size);
      floes.setMatrixAt(i, fm.compose(fp, fq, fs));
    });
    floes.instanceMatrix.needsUpdate = true;
  };
  moveFloes(0);

  // ---- warm amber glow of an ice cave behind the fall (emissive half discs at the cliff foot) + halos
  const glowGeo = new THREE.CircleGeometry(30, 28, 0, Math.PI);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.15, 0.32), toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const glows = [];
  for (const [dx, sc] of [[38, 1.1], [-70, 0.75], [118, 0.6]]) {
    const gz = zAt(X0 + dx, floorH + 22 * sc);
    if (Number.isNaN(gz)) continue;
    const g = new THREE.Mesh(glowGeo, glowMat); g.position.set(X0 + dx, floorH, gz + 2.5); g.scale.set(sc, sc * 0.9, 1); g.renderOrder = 1; group.add(g);
    glows.push({ pos: new THREE.Vector3(X0 + dx, floorH + 12 * sc, gz + 12), color: new THREE.Color(1.9, 0.8, 0.22), size: 40 * sc });
  }
  parts.push({
    group, update(dt) { u.uTime.value += dt; moveFloes(u.uTime.value); },
    dispose() { geo.dispose(); mat.dispose(); drift.dispose(); icicle.dispose(); snowMat.dispose(); pillarGeo.dispose(); floeGeo.dispose(); glowGeo.dispose(); glowMat.dispose(); },
  });
  parts.push(pools);
  if (glows.length) parts.push(createGlowPoints(glows));

  // ---- mist banks hugging the base, spray rising from the plunge line, and wisps at the tier ledges
  const mistE = [], sprayE = [];
  for (let i = 0; i < 7; i++) {
    const x = X0 + (i / 6 - 0.5) * 250, z = zAt(x, floorH + 18); if (Number.isNaN(z)) continue;
    mistE.push({ x, y: floorH + 6, z: z + 30, radius: 34, count: Math.round(14 * q.particles), size: 85, rise: 130, rate: 0.045, wind: [-8, 10] });
    sprayE.push({ x, y: floorH + 3, z: z + 18, radius: 22, count: Math.round(42 * q.particles), size: 11, rise: 70, rate: 0.16, wind: [-5, 8] });
  }
  for (const y of [tiers[1].ya, tiers[2].ya]) for (let i = 0; i < 3; i++) {
    const x = X0 + (i - 1) * 70, z = zAt(x, y); if (Number.isNaN(z)) continue;
    mistE.push({ x, y: y - 8, z: z + 16, radius: 20, count: Math.round(8 * q.particles), size: 60, rise: 90, rate: 0.05, wind: [-6, 8] });
  }
  parts.push(createSteam(mistE, { color: 0xcfdcf6, opacity: 0.3, grow: 1.1, seed: 31 }));
  parts.push(createSteam(sprayE, { color: 0xb8d0ff, opacity: 0.35, grow: 0.5, seed: 32, additive: true }));
  return { parts, center: new THREE.Vector3(X0, floorH, zStart) };
}
