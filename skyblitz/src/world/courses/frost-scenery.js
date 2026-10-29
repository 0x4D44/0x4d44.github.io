// Frostpeak scenery: aurora twilight sky, glacier valley terrain tiles (LOD by distance to the route), ice spires/arches/cave bridges,
// the frozen waterfall behind the loop, drifting snow squalls. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../../util.js';
import { createSkyDome, createCloudPuffs } from '../sky.js';
import { buildPatch, createTerrainMaterial } from '../terrain.js';
import { makeRockGeometry, makeRockArch, instanced, scatterAlongPath } from '../props.js';

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

export async function buildScenery(course, game, progress, yieldFrame) {
  const env = course.environment, q = game.q, H = course.heightFn;
  const sky = createSkyDome(env, game, { cloudDeck: 0.25, aurora: 1.0, sunSize: 0.0012, cloudLit: env.cloudLit, cloudShade: env.cloudShade });
  course.addPart(sky);
  try { const rt = sky.makeEnvMap(game.renderer); course.owned.push(rt); sky.envMap = rt.texture; } catch (e) { console.warn('[course] env map failed', e); }
  progress(0.1, 'Carving the glaciers'); await yieldFrame();

  const mb = course.minimap.bounds, M = 650;
  const bounds = { minX: mb.minX - M, maxX: mb.maxX + M, minZ: mb.minZ - M, maxZ: mb.maxZ + M };

  // ---- distance-to-route lookup for tile LOD
  const samples = []; const f = {};
  for (let s = 0; s < course.length; s += 40) { course.frameAt(s, f); samples.push(f.pos.x, f.pos.z); }
  for (const b of course.branches) for (let u = 0; u < b.length; u += 40) { b.frameAt(u, f); samples.push(f.pos.x, f.pos.z); }
  const dMin = (cx, cz) => { let m = 1e9; for (let i = 0; i < samples.length; i += 2) { const d = Math.hypot(samples[i] - cx, samples[i + 1] - cz); if (d < m) m = d; } return m; };

  const mat = createTerrainMaterial(game, {
    low: 'ice', mid: 'snow', high: 'snow', cliff: 'ice', h: [92, 128, 190, 250], slope: [0.34, 0.66], roughness: 0.8,
    tintLow: 0xc8e4ff, tintMid: 0xd2dcf6, tintHigh: 0xf4f8ff, tintCliff: 0xa4b4e2, scaleLow: 46, scaleMid: 70, scaleHigh: 70, scaleCliff: 120,
  });
  const group = new THREE.Group(); group.name = 'terrain'; course.group.add(group);
  const geos = [];
  const T = 360, tilesX = Math.ceil((bounds.maxX - bounds.minX) / T), tilesZ = Math.ceil((bounds.maxZ - bounds.minZ) / T);
  let built = 0;
  for (let j = 0; j < tilesZ; j++) {
    for (let i = 0; i < tilesX; i++) {
      const x0 = bounds.minX + i * T, z0 = bounds.minZ + j * T, d = dMin(x0 + T / 2, z0 + T / 2) - T * 0.7;
      const cell = d < 120 ? 8 : d < 300 ? 13 : d < 600 ? 24 : d < 900 ? 45 : 90;
      const g = buildPatch(H, { x0, z0, x1: x0 + T, z1: z0 + T, cell }, { minH: -1e9, skirt: true, skirtDrop: 60 });
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = d < 200; group.add(m); geos.push(g);
      if (++built % 6 === 0) { progress(0.1 + 0.5 * ((j * tilesX + i) / (tilesX * tilesZ)), 'Carving the glaciers'); await yieldFrame(); }
    }
  }
  {
    const R = 7000, bx0 = bounds.minX, bx1 = bounds.minX + tilesX * T, bz0 = bounds.minZ, bz1 = bounds.minZ + tilesZ * T;
    const strips = [[bx0 - R, bz0 - R, bx1 + R, bz0], [bx0 - R, bz1, bx1 + R, bz1 + R], [bx0 - R, bz0, bx0, bz1], [bx1, bz0, bx1 + R, bz1]];
    for (const [x0, z0, x1, z1] of strips) {
      const g = buildPatch(H, { x0, z0, x1, z1, cell: 200 }, { minH: -1e9, skirt: true, skirtDrop: 100 });
      const m = new THREE.Mesh(g, mat); group.add(m); geos.push(g);
    }
  }
  course.addPart({ dispose() { geos.forEach((g) => g.dispose()); mat.dispose(); } });
  progress(0.7, 'Growing ice'); await yieldFrame();

  // ---- ice: boulders, crystal spires, hazard columns, arches, cave bridges, frozen fall
  const props = new THREE.Group(); props.name = 'props'; course.group.add(props);
  const disposables = [];
  const rnd = mulberry32(41);
  const snowRock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const iceMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.05, emissive: new THREE.Color(0x2a5fa0), emissiveIntensity: 0.35 });
  const boulderGeo = makeRockGeometry({ seed: 6, rough: 0.4, stretch: [1, 0.7, 1], color: 0xe4edf8, color2: 0x7c8aaa });
  const spots = scatterAlongPath(course, { count: Math.round(380 * q.scenery), minLat: -10, maxLat: 240, seed: 5, accept: (x, z, h, fr) => h < fr.pos.y - 25 });
  const boulders = spots.map((o) => { const s = 4 + rnd() * 11; return { pos: new THREE.Vector3(o.x, o.y + s * 0.1, o.z), yaw: rnd() * 6.28, scale: new THREE.Vector3(s * (0.8 + rnd() * 0.7), s * (0.6 + rnd() * 0.6), s * (0.8 + rnd() * 0.7)) }; });
  if (boulders.length) props.add(instanced(boulderGeo, snowRock, boulders));
  const crystalGeo = makeRockGeometry({ seed: 14, detail: 2, rough: 0.16, stretch: [1, 2.8, 1], color: 0xcfeaff, color2: 0x4f7fc4 });
  const cSpots = scatterAlongPath(course, { count: Math.round(140 * q.scenery), minLat: 14, maxLat: 300, seed: 9, accept: (x, z, h, fr) => h < fr.pos.y - 30 });
  const crystals = cSpots.map((o) => { const s = 5 + rnd() * 9; return { pos: new THREE.Vector3(o.x, o.y, o.z), yaw: rnd() * 6.28, tx: (rnd() - 0.5) * 0.18, tz: (rnd() - 0.5) * 0.18, scale: new THREE.Vector3(s, s * (1.6 + rnd() * 2.4), s) }; });
  if (crystals.length) props.add(instanced(crystalGeo, iceMat, crystals, { cast: true }));
  const spireGeo = makeRockGeometry({ seed: 19, detail: 2, rough: 0.2, stretch: [1, 1, 1], color: 0xd8f0ff, color2: 0x3f6fb8 });
  const stacks = course.hazards.filter((h) => h.kind === 'stack').map((h) => { const r = h.radius * 1.25, base = H(h.pos.x, h.pos.z) - 8; return { pos: new THREE.Vector3(h.pos.x, base, h.pos.z), yaw: h.s, scale: new THREE.Vector3(r, h.top - base, r) }; });
  if (stacks.length) props.add(instanced(spireGeo, iceMat, stacks, { cast: true }));
  disposables.push(boulderGeo, crystalGeo, spireGeo, snowRock, iceMat);

  // arches (ice) over the route, and a run of ice bridges through the cave shortcut
  const up = new THREE.Vector3(0, 1, 0);
  const archGeo = makeRockArch({ radius: 88, tube: 20, color: 0xd6efff, color2: 0x5a8ccc }), bridgeGeo = makeRockArch({ radius: 62, tube: 16, seed: 8, color: 0xd6efff, color2: 0x4a7cc0 });
  const archMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, emissive: new THREE.Color(0x2a5fa0), emissiveIntensity: 0.4 });
  const place = (geo, fr, dy) => {
    const rh = new THREE.Vector3(fr.right.x, 0, fr.right.z).normalize(), fw = new THREE.Vector3().crossVectors(rh, up);
    const m = new THREE.Mesh(geo, archMat); m.position.set(fr.pos.x, fr.pos.y + dy, fr.pos.z);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rh, up, fw)); m.castShadow = true; m.receiveShadow = true; props.add(m);
  };
  for (const k of ['arch', 'arch2']) place(archGeo, course.frameAt(course.marks[k], {}), -28);
  const br = course.branches[0];
  if (br) for (let u = 170; u < br.length - 120; u += 210) { br.frameAt(u, f); place(bridgeGeo, f, -10); }
  disposables.push(archGeo, bridgeGeo, archMat);

  // frozen waterfall: ice curtains hanging down the cliff beside the loop
  {
    const lt = course.frameAt(course.marks.loopTop, {}), floorY = course.frameAt(course.marks.loopEntry, {}).pos.y;
    const colGeo = new THREE.CylinderGeometry(0.3, 1, 1, 7, 1); colGeo.translate(0, 0.5, 0);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xcfeaff, roughness: 0.12, metalness: 0.1, emissive: new THREE.Color(0x4a86c8), emissiveIntensity: 0.55 });
    const list = [];
    for (let k = 0; k < 22; k++) {
      const x = lt.pos.x + (k - 11) * 15 + (rnd() - 0.5) * 8; let z = lt.pos.z - 60;
      while (z > lt.pos.z - 800 && H(x, z) < floorY + 20) z -= 6;
      const zb = z, yb = H(x, zb) - 8;
      while (z > lt.pos.z - 900 && H(x, z) < yb + 150 + rnd() * 70) z -= 6;
      const yc = H(x, z), dz = z - zb, dy = Math.max(40, yc - yb), len = Math.hypot(dy, dz), r = 8 + rnd() * 9;
      if (yc < yb + 100 || dz < -260) continue;       // no wall here: skip (a near-horizontal pole would result)
      list.push({ pos: new THREE.Vector3(x, yb, zb + 4), yaw: 0, tx: Math.atan2(dz, dy), scale: new THREE.Vector3(r, len, r * 0.55) });
    }
    props.add(instanced(colGeo, colMat, list, { cast: true }));
    disposables.push(colGeo, colMat);
  }
  course.addPart({ dispose() { disposables.forEach((d) => d.dispose()); } });

  // ---- snow squalls + cold mist banks
  progress(0.9, 'Whipping up the squalls'); await yieldFrame();
  course.addPart(createSnow(Math.round(2600 * Math.min(1, (q.clouds || 1) + 0.25))));
  const list = [], r2 = mulberry32(0x5a0f);
  const nd = Math.round(70 * (q.clouds || 1));
  for (let i = 0; i < nd; i++) {
    const s = r2() * course.length; course.frameAt(s, f);
    const side = r2() < 0.5 ? -1 : 1, lat = side * (f.halfWidth + 80 + r2() * 260);
    const x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat;
    list.push({ x, y: Math.max(H(x, z), f.pos.y - 110) + 30 + r2() * 70, z, size: 240 + r2() * 300, aspect: 0.42, opacity: 0.22 + r2() * 0.16, cell: Math.floor(r2() * 16) });
  }
  course.addPart(createCloudPuffs(env, game, list));
}
