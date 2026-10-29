// Frostpeak scenery: aurora twilight sky and curtains, glacier valley terrain (dark rock strata with an aurora fill light and glowing ice veins, snow,
// alpenglow), faceted ice spires, snow pines,
// aurora-lit crystal clusters, wall lanterns, ice arches strung with lights, the ice-cave ribs, melt pools with floes, the frozen waterfall behind the
// loop and drifting snow squalls. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../../util.js';
import { createSkyDome, createCloudPuffs } from '../sky.js';
import { createTerrainMaterial } from '../terrain.js';
import { patchTerrain, buildTerrainTiles, terrainCellScale } from '../terrain-fx.js';
import { createAurora, createSteam, createPools, createGlowPoints, createAltitudeFog } from '../atmos.js';
import { makeRockGeometry } from '../props.js';
import {
  makeCrystalCluster, makeIceSpire, makeIceArch, makeSnowPine, makeIceFloe, makeSnowDrift, makeIcicle, makeMast, instancedQ, surfaceNormal, scatterWall, scatterFloor, wallPoint,
} from '../props-ice.js';
import { buildFrozenFall } from './frost-fall.js';

const SNOW_VS = `
uniform vec3 uCenter; uniform float uTime, uSize, uBox;
attribute vec4 aSeed;
varying float vA;
void main(){
  vec3 wind = vec3(-14.0, -9.0, 6.0);
  vec3 p = aSeed.xyz * uBox + wind * uTime;
  p = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5;           // wrap around the camera
  p.x += sin(uTime * 0.7 + aSeed.w * 40.0) * 1.8;
  vec3 world = uCenter + p;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  float d = -mv.z;
  float squall = 0.5 + 0.5 * sin(world.x * 0.0031 + world.z * 0.0023 + uTime * 0.05) * sin(world.z * 0.0041 - uTime * 0.04 + 1.3);
  vA = smoothstep(4.0, 22.0, d) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(p))) * (0.25 + 0.75 * squall) * step(0.0, d);
  gl_PointSize = clamp(uSize * (0.6 + aSeed.w) / max(d, 1.0) * 300.0, 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}`;
const SNOW_FS = `
varying float vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0;
  float a = (1.0 - smoothstep(0.35, 1.0, r)) * vA * 0.75;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.86, 0.92, 1.0), a);
}`;

function createSnow(count = 2600, box = 150) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count * 4), rnd = mulberry32(77);
  for (let i = 0; i < count; i++) { seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd(); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  const u = { uCenter: { value: new THREE.Vector3() }, uTime: { value: 0 }, uSize: { value: 0.25 }, uBox: { value: box } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false, fog: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = 'snow'; pts.renderOrder = 5;
  return { group: pts, update(dt, g, course, cam) { u.uTime.value += dt; u.uCenter.value.copy(cam.position); }, dispose() { geo.dispose(); mat.dispose(); } };
}

// aurora palette: cyan, green, magenta, amber, violet - the lap drifts through it so no two valleys share one colour identity
const PAL = [[0.12, 0.95, 1.0], [0.22, 1.0, 0.45], [1.0, 0.2, 0.8], [1.0, 0.55, 0.14], [0.5, 0.38, 1.0]].map(([r, g, b]) => new THREE.Color(r, g, b));
function tint(s, L, r, gain = 1.4) {
  const n = PAL.length, t = ((s / L) * n * 1.6 + (r - 0.5) * 2.2 + 100 * n) % n, i = Math.floor(t), k = t - i, w = k * k * (3 - 2 * k), a = PAL[i], b = PAL[(i + 1) % n];
  return new THREE.Color(a.r + (b.r - a.r) * w, a.g + (b.g - a.g) * w, a.b + (b.b - a.b) * w).multiplyScalar(gain * (0.75 + 0.9 * ((r * 7.31) % 1)));
}
const AMBER = new THREE.Color(1.8, 0.8, 0.22), PINK = new THREE.Color(1.5, 0.42, 1.1), TEAL = new THREE.Color(0.25, 1.2, 1.4), ORANGE = new THREE.Color(2.4, 0.85, 0.2), MAGENTA = new THREE.Color(1.7, 0.45, 1.5);
const UP = new THREE.Vector3(0, 1, 0);

/** Emissive crystals: the vertex colour (times the per-instance aurora tint) also drives the glow. */
function glowCrystalMaterial(k = 0.85) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uK = { value: k };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uK;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * uK;');
  };
  m.customProgramCacheKey = () => 'frostglow';
  return m;
}

export async function buildScenery(course, game, progress, yieldFrame) {
  const env = course.environment, q = game.q, H = course.heightFn, S = q.scenery, L = course.length;
  const sky = createSkyDome(env, game, { cloudDeck: 0.25, aurora: 0.55, sunSize: 0.0012, cloudLit: env.cloudLit, cloudShade: env.cloudShade });
  course.addPart(sky);
  try { const rt = sky.makeEnvMap(game.renderer); course.owned.push(rt); sky.envMap = rt.texture; } catch (e) { console.warn('[course] env map failed', e); }
  course.addPart(createAurora({ radius: 5200, curtains: 3, arc: 1.4, baseY: 1050, height: 1700, seed: 4, intensity: 0.85 }));
  progress(0.1, 'Carving the glaciers'); await yieldFrame();

  const mb = course.minimap.bounds, M = 650;
  const bounds = { minX: mb.minX - M, maxX: mb.maxX + M, minZ: mb.minZ - M, maxZ: mb.maxZ + M };

  // ---- terrain: dark lichen rock cliffs banded with blue / blush / violet strata, snow shoulders, teal ice floor, pink alpenglow on the high ground
  const mat = createTerrainMaterial(game, {
    low: 'ice', mid: 'snow', high: 'snow', cliff: 'rock_grey', h: [92, 128, 200, 290], slope: [0.2, 0.46], roughness: 0.78,
    tintLow: 0xb4dcf4, tintMid: 0xd4dcf6, tintHigh: 0xe6e8fa, tintCliff: 0xc8c8f4, scaleLow: 46, scaleMid: 70, scaleHigh: 70, scaleCliff: 85,
  });
  patchTerrain(mat, {
    sun: env.sunDir,
    tone: { a: 0xb8f4dc, b: 0xecc8ff, scaleA: 900, scaleB: 260 },
    bands: { scale: 0.04, warp: 3, strength: 0.8, colors: [new THREE.Color(0.55, 0.7, 1.4), new THREE.Color(1.7, 1.4, 1.6), new THREE.Color(2.3, 2.3, 2.5)] },
    rim: { color: new THREE.Color(0.3, 0.14, 0.24), power: 3 },
    twilight: { color: new THREE.Color(0.4, 0.18, 0.3), y0: 230, y1: 480 },
    fill: { color: new THREE.Color(0.5, 0.7, 1.25), dir: new THREE.Vector3(-0.5, 0.5, -0.6) },        // the aurora's cold wash on the walls turned away from the sun
    veins: { color: new THREE.Color(0.08, 0.44, 0.68), scale: 1, cover: 0.972, y0: 200, y1: 270 },    // cracks of glowing ice in the cliffs, fading out toward the snow
  });
  const tiles = await buildTerrainTiles({
    course, H, mat, bounds, T: 360, cellFor: (d) => (d < 120 ? 11 : d < 300 ? 18 : d < 600 ? 30 : d < 900 ? 55 : 110), cellScale: terrainCellScale(q), castNear: 200, nearD: 300, block: 3, farR: 7000,
    progress: (fr, t) => progress(0.1 + fr, t), yieldFrame,
  });
  course.group.add(tiles.group);
  course.addPart({ dispose() { tiles.geos.forEach((g) => g.dispose()); mat.dispose(); } });
  progress(0.65, 'Growing ice'); await yieldFrame();

  // ---- helpers
  const props = new THREE.Group(); props.name = 'props'; course.group.add(props);
  const disposables = [], rnd = mulberry32(41), f = {};
  const br = course.branches[0];
  const brPts = []; if (br) for (let u = 0; u <= br.length; u += 30) { br.frameAt(u, f); brPts.push(f.pos.x, f.pos.z); }
  const nearCave = (x, z, pad) => { for (let i = 0; i < brPts.length; i += 2) if (Math.hypot(brPts[i] - x, brPts[i + 1] - z) < pad) return true; return false; };
  const flat = (x, z, min = 0.8) => surfaceNormal(H, x, z, 6).y > min;
  const glows = [];
  const iceMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.05, emissive: new THREE.Color(0x2a5fa0), emissiveIntensity: 0.18, envMapIntensity: 0.55 });
  const glowMat = glowCrystalMaterial(0.85);
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, emissive: new THREE.Color(0x203858), emissiveIntensity: 0.22 });
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const snowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: new THREE.Color(0x4a60a8), emissiveIntensity: 0.26 });
  const mastMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 });
  disposables.push(iceMat, glowMat, pineMat, rockMat, snowMat, mastMat);
  const add = (geo, m, items, o) => { if (items.length) props.add(instancedQ(geo, m, items, o)); disposables.push(geo); };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- snow pines in groves on the shoulders (kept out of the flight corridor), snow drifts, dark rock outcrops
  {
    const geoA = makeSnowPine({ seed: 2, tiers: 5 }), geoB = makeSnowPine({ seed: 5, tiers: 4, needles: 0x23585c, needles2: 0x3c7a62 });
    const spots = scatterFloor(course, H, {
      count: Math.round(640 * S), seed: 3, latMax: 3.1, groves: 54, groveR: 70,
      accept: (o, fr) => Math.abs(o.lat) > fr.halfWidth * 1.02 + 6 && o.pos.y < fr.pos.y - 24 && flat(o.pos.x, o.pos.z, 0.78) && !nearCave(o.pos.x, o.pos.z, 70),
    });
    const a = [], b = [], n = V3(0, 1, 0);
    for (const o of spots) {
      surfaceNormal(H, o.pos.x, o.pos.z, 6, n); const up = V3(n.x * 0.45, 1, n.z * 0.45).normalize();
      const sc = 0.65 + o.r * o.r * 1.5;
      (o.r < 0.5 ? a : b).push({ pos: V3(o.pos.x, o.pos.y - 0.6, o.pos.z), up, yaw: o.r * 40, scale: V3(sc, sc * (0.9 + 0.5 * ((o.r * 9.7) % 1)), sc) });
    }
    add(geoA, pineMat, a, { receive: false }); add(geoB, pineMat, b, { receive: false });
  }
  {
    const drift = makeSnowDrift({ seed: 7 });
    const spots = scatterFloor(course, H, { count: Math.round(300 * S), seed: 17, latMax: 2.6, accept: (o) => flat(o.pos.x, o.pos.z, 0.85) && !nearCave(o.pos.x, o.pos.z, 55) });
    add(drift, snowMat, spots.map((o) => { const r = 9 + o.r * 22; return { pos: V3(o.pos.x, o.pos.y - 0.4, o.pos.z), yaw: o.r * 30, scale: V3(r, 2.5 + o.r * 5, r * (0.7 + 0.4 * ((o.r * 5.3) % 1))) }; }), { receive: true });
    const rock = makeRockGeometry({ seed: 9, detail: 1, rough: 0.42, stretch: [1, 0.8, 1], color: 0x8a8aae, color2: 0x25233a }).toNonIndexed();      // faceted, frost-dusted on top
    rock.computeVertexNormals();
    const rs = scatterFloor(course, H, { count: Math.round(170 * S), seed: 21, latMax: 2.8, accept: (o, fr) => Math.abs(o.lat) > fr.halfWidth * 0.8 && flat(o.pos.x, o.pos.z, 0.74) && !nearCave(o.pos.x, o.pos.z, 55) });
    add(rock, rockMat, rs.map((o) => { const s = 5 + o.r * o.r * 16; return { pos: V3(o.pos.x, o.pos.y + s * 0.15, o.pos.z), yaw: o.r * 33, scale: V3(s * (0.8 + o.r * 0.6), s * (0.6 + 0.5 * ((o.r * 7.7) % 1)), s * (1.0 + 0.4 * ((o.r * 3.1) % 1))) }; }), { cast: false });
  }

  // ---- ice: hazard columns become faceted spires; decorative spires stand clear of the corridor; crystal clusters on floor and walls
  {
    const spire = makeIceSpire({ seed: 3, taper: 0.84, sides: 7, rings: 8, shards: 3, low: 0x1c3f8a, high: 0x6fb4ee, snow: 0xdce6ff });
    const stacks = course.hazards.filter((h) => h.kind === 'stack').map((h) => {
      const base = H(h.pos.x, h.pos.z) - 8, r = h.radius * 1.2, top = h.top + 4;
      return { pos: V3(h.pos.x, base, h.pos.z), yaw: h.s, scale: V3(r, top - base, r) };
    });
    add(spire, iceMat, stacks, { cast: true });
    const deco = makeIceSpire({ seed: 11, taper: 0.5, sides: 7, rings: 8, shards: 4, low: 0x1c3f8a, high: 0x6fb4ee, snow: 0xdce6ff });
    const spots = scatterFloor(course, H, {
      count: Math.round(70 * S), seed: 29, latMax: 2.6,
      accept: (o, fr) => Math.abs(o.lat) > fr.halfWidth * 1.0 + 30 && o.pos.y < fr.pos.y - 18 && flat(o.pos.x, o.pos.z, 0.7) && !nearCave(o.pos.x, o.pos.z, 90),
    });
    add(deco, iceMat, spots.map((o) => { const h = 38 + o.r * o.r * 120, r = 6 + o.r * 10; return { pos: V3(o.pos.x, o.pos.y - 4, o.pos.z), yaw: o.r * 50, scale: V3(r, h, r) }; }), { cast: true });
  }
  {
    const geoA = makeCrystalCluster({ seed: 11, n: 7, height: 1, spread: 0.5, tilt: 0.6 }), geoB = makeCrystalCluster({ seed: 12, n: 4, height: 1, spread: 0.3, tilt: 0.35 });
    const wall = scatterWall(course, H, { count: Math.round(380 * S), dyMin: -50, dyMax: 140, seed: 8, clear: 26 });
    const a = [], b = [];
    for (const o of wall) {
      const h = 7 + o.r * o.r * 22, col = tint(o.s, L, o.r), it = { pos: o.pos.clone().addScaledVector(o.n, -1.4), up: o.n, yaw: o.r * 60, scale: h, color: col };
      (o.r < 0.55 ? a : b).push(it);
      if (o.r > 0.82 && glows.length < 90) glows.push({ pos: o.pos.clone().addScaledVector(o.n, h * 0.55), color: col.clone().multiplyScalar(0.5), size: 7 + h * 0.5 });
    }
    const floor = scatterFloor(course, H, { count: Math.round(220 * S), seed: 12, latMax: 2.2, groves: 24, groveR: 40, accept: (o) => flat(o.pos.x, o.pos.z, 0.8) && !nearCave(o.pos.x, o.pos.z, 60) });
    for (const o of floor) {
      const outside = Math.abs(o.lat) > 90 ? 1 : 0, h = (outside ? 8 : 4) + o.r * o.r * (outside ? 24 : 7);
      (o.r < 0.5 ? a : b).push({ pos: V3(o.pos.x, o.pos.y - 0.8, o.pos.z), yaw: o.r * 70, scale: h, color: tint(o.s, L, o.r, 1.2) });
    }
    add(geoA, glowMat, a, { receive: false }); add(geoB, glowMat, b, { receive: false });
  }

  // ---- wall lanterns: amber to the left, pink to the right (a course-wide handedness cue), on short brackets angled out of the rock
  {
    const mast = makeMast({ height: 18 }), items = [];
    let side = 1;
    for (let s = 45; s < L - 45; s += 62 + rnd() * 30) {
      side = -side; course.frameAt(s, f);
      const wp = wallPoint(H, f, side, f.pos.y - 6 + rnd() * 16, { from: 1.0 });
      if (!wp || Math.abs(wp.lat) > 300) continue;
      const tip = wp.pos.clone().addScaledVector(wp.n, 18 * 0.9 + 1.8);
      items.push({ pos: wp.pos.clone().addScaledVector(wp.n, -1), up: wp.n, yaw: rnd() * 6, scale: 1 });
      glows.push({ pos: tip, color: side < 0 ? AMBER : PINK, size: 22 });
    }
    add(mast, mastMat, items, { receive: false });
  }

  // ---- ice arches: the two big gates, strung with a ring of lights and a beacon on the crown
  {
    const arch = makeIceArch({ radius: 92, tube: 19, seed: 2, segs: 36, sides: 8, low: 0x183c8c, high: 0x78c4f6 }), items = [], icicle = makeIcicle({ seed: 4 }), ic = [];
    for (const k of ['arch', 'arch2']) {
      const fr = course.frameAt(course.marks[k], {}), rh = V3(fr.right.x, 0, fr.right.z).normalize(), fw = new THREE.Vector3().crossVectors(rh, UP);
      const foot = Math.min(H(fr.pos.x - rh.x * 92, fr.pos.z - rh.z * 92), H(fr.pos.x + rh.x * 92, fr.pos.z + rh.z * 92)) - 8;
      const base = THREE.MathUtils.clamp(foot, fr.pos.y - 26, fr.pos.y - 6), quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rh, UP, fw));
      const c = V3(fr.pos.x, base, fr.pos.z);
      items.push({ pos: c, quat, scale: 1 });
      const at = (th, rad, z = 0) => c.clone().addScaledVector(rh, Math.cos(th) * rad).addScaledVector(UP, Math.sin(th) * rad).addScaledVector(fw, z);
      for (let i = 0; i < 11; i++) { const th = Math.PI * (0.12 + 0.76 * i / 10); glows.push({ pos: at(th, 92 - 19 * 1.05), color: i % 2 ? AMBER : ORANGE, size: 15 }); }
      glows.push({ pos: at(Math.PI / 2, 92 + 19 + 10), color: ORANGE, size: 70 });
      for (let i = 0; i < 16; i++) { const th = Math.PI * (0.16 + 0.68 * rnd()); ic.push({ pos: at(th, 92 - 19 * 0.8, (rnd() - 0.5) * 14), yaw: rnd() * 6, scale: V3(1 + rnd() * 1.6, 5 + rnd() * 16, 1 + rnd() * 1.6) }); }
    }
    add(arch, iceMat, items, { cast: true }); add(icicle, iceMat, ic, { receive: false });
  }

  // ---- the ice cave: a run of faceted ribs overhead strung with magenta light, icicles, glowing wall crystals and cold lanterns along both banks
  if (br) {
    const RIB_R = 84, TUBE = 12, rib = makeIceArch({ radius: RIB_R, tube: TUBE, seed: 5, segs: 28, sides: 7, low: 0x183c8c, high: 0x78c4f6 }), items = [], icicle = makeIcicle({ seed: 9 }), ic = [];
    for (let u = 100; u < br.length - 60; u += 100) {
      br.frameAt(u, f);
      const rh = V3(f.right.x, 0, f.right.z).normalize(), fw = new THREE.Vector3().crossVectors(rh, UP);
      const foot = Math.min(H(f.pos.x - rh.x * RIB_R, f.pos.z - rh.z * RIB_R), H(f.pos.x + rh.x * RIB_R, f.pos.z + rh.z * RIB_R)) - 6;
      const base = THREE.MathUtils.clamp(foot, f.pos.y - 24, f.pos.y - 4), quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rh, UP, fw));
      const c = V3(f.pos.x, base, f.pos.z);
      items.push({ pos: c, quat, scale: 1 });
      const at = (th, rad, z = 0) => c.clone().addScaledVector(rh, Math.cos(th) * rad).addScaledVector(UP, Math.sin(th) * rad).addScaledVector(fw, z);
      for (let i = 0; i < 5; i++) glows.push({ pos: at(Math.PI * (0.2 + 0.6 * i / 4), RIB_R - TUBE * 1.1), color: i === 2 ? AMBER : MAGENTA, size: i === 2 ? 24 : 14 });
      for (let i = 0; i < 12; i++) { const th = Math.PI * (0.18 + 0.64 * rnd()); ic.push({ pos: at(th, RIB_R - TUBE * 0.8, (rnd() - 0.5) * 12), yaw: rnd() * 6, scale: V3(0.8 + rnd() * 1.4, 4 + rnd() * 11, 0.8 + rnd() * 1.4) }); }
    }
    add(rib, iceMat, items, { cast: false }); add(icicle, iceMat, ic, { receive: false });
    const cgeo = makeCrystalCluster({ seed: 31, n: 6, height: 1, spread: 0.4, tilt: 0.5 }), cci = [], proxy = { length: br.length, frameAt: (s, o) => br.frameAt(s, o) };
    for (const o of scatterWall(proxy, H, { count: Math.round(120 * S), dyMin: -40, dyMax: 70, seed: 44, clear: 14, maxLat: 200 })) {
      const h = 6 + o.r * o.r * 16, col = (o.r < 0.5 ? TEAL : tint(o.s * 3.1, L, o.r)).clone().multiplyScalar(0.9 + o.r * 0.6);
      cci.push({ pos: o.pos.clone().addScaledVector(o.n, -1.2), up: o.n, yaw: o.r * 70, scale: h, color: col });
      if (o.r > 0.6) glows.push({ pos: o.pos.clone().addScaledVector(o.n, h * 0.5), color: col.clone().multiplyScalar(0.45), size: 6 + h * 0.5 });
    }
    add(cgeo, glowMat, cci, { receive: false });
    const mast = makeMast({ height: 14 }), li = [];
    for (let u = 40, sd = 1; u < br.length - 20; u += 52, sd = -sd) {
      br.frameAt(u, f);
      const wp = wallPoint(H, f, sd, f.pos.y - 26 + rnd() * 10, { from: 0.95, maxLat: 220 });
      if (!wp) continue;
      li.push({ pos: wp.pos.clone().addScaledVector(wp.n, -1), up: wp.n, yaw: rnd() * 6, scale: 1 });
      glows.push({ pos: wp.pos.clone().addScaledVector(wp.n, 14 * 0.9 + 1.8), color: TEAL, size: 18 });
    }
    add(mast, mastMat, li, { receive: false });
    // junction beacons: the shortcut announces itself from afar
    for (const k of ['caveA', 'caveB']) { const fr = course.frameAt(course.marks[k], {}); glows.push({ pos: V3(fr.pos.x, fr.pos.y + 70, fr.pos.z), color: MAGENTA, size: 80 }); }
  }
  // loop beacon: pink-white above the top of the loop
  { const lt = course.frameAt(course.marks.loopTop, {}); glows.push({ pos: V3(lt.pos.x, lt.pos.y + 60, lt.pos.z), color: new THREE.Color(1.2, 0.6, 1.0), size: 60 }); }
  course.addPart(createGlowPoints(glows));

  // ---- meltwater pools with floes, and a few hot springs breathing steam
  {
    const spots = scatterFloor(course, H, { count: 30, seed: 61, latMax: 2.0, accept: (o) => flat(o.pos.x, o.pos.z, 0.97) && !nearCave(o.pos.x, o.pos.z, 80) });
    const pools = [], steam = [], floeGeo = makeIceFloe({ seed: 8 }), floeItems = [];
    for (const o of spots) {
      if (pools.length >= 6) break;
      if (pools.some((p) => Math.hypot(p.x - o.pos.x, p.z - o.pos.z) < 260)) continue;
      const rx = 28 + o.r * 40, rz = rx * (0.55 + 0.35 * ((o.r * 13.7) % 1));
      let lo = 1e9; for (let k = 0; k < 8; k++) lo = Math.min(lo, H(o.pos.x + Math.cos(k) * rx * 0.7, o.pos.z + Math.sin(k) * rz * 0.7));
      const y = Math.max(lo, H(o.pos.x, o.pos.z) - 2) + 1.6;
      pools.push({ x: o.pos.x, y, z: o.pos.z, rx, rz, yaw: o.r * 6 });
      for (let k = 0; k < 4; k++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 0.5; floeItems.push({ pos: V3(o.pos.x + Math.cos(a) * rx * d, y + 0.3, o.pos.z + Math.sin(a) * rz * d), yaw: rnd() * 6, scale: 3 + rnd() * 6 }); }
      if (pools.length % 2 === 0) steam.push({ x: o.pos.x, y: y + 1, z: o.pos.z, radius: rx * 0.45, count: Math.max(4, Math.round(10 * q.particles)), size: 46, rise: 90, rate: 0.07, wind: [-8, 6] });
    }
    if (pools.length) course.addPart(createPools(pools, env));
    add(floeGeo, snowMat, floeItems, { receive: false });
    if (steam.length) course.addPart(createSteam(steam, { color: 0xffe6f2, opacity: 0.34, grow: 1.2, seed: 77 }));
  }

  // ---- the frozen fall behind the loop
  progress(0.82, 'Freezing the waterfall'); await yieldFrame();
  const fall = buildFrozenFall(course, game, H, { iceMat, q });
  fall.parts.forEach((p) => course.addPart(p));
  course.addPart({ dispose() { disposables.forEach((d) => d.dispose()); } });

  // ---- snow squalls + cold mist banks (which thin out when the camera climbs for an overview)
  progress(0.9, 'Whipping up the squalls'); await yieldFrame();
  course.addPart(createSnow(Math.round(2600 * Math.min(1, (q.clouds || 1) + 0.25))));
  const list = [], r2 = mulberry32(0x5a0f), nd = Math.round(70 * (q.clouds || 1));
  for (let i = 0; i < nd; i++) {
    const s = r2() * course.length; course.frameAt(s, f);
    const side = r2() < 0.5 ? -1 : 1, lat = side * (f.halfWidth + 80 + r2() * 260);
    const x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat;
    list.push({ x, y: Math.max(H(x, z), f.pos.y - 110) + 30 + r2() * 70, z, size: 240 + r2() * 300, aspect: 0.42, opacity: 0.22 + r2() * 0.16, cell: Math.floor(r2() * 16) });
  }
  const puffs = createCloudPuffs(env, game, list);
  course.addPart(puffs);
  course.addPart(createAltitudeFog({ puffs: [puffs], refY: course.frameAt(0, {}).pos.y, from: 300, to: 1500, fogKeep: 0.35, puffKeep: 0 }));
}
