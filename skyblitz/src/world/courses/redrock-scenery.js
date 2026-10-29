// Redrock Rapids scenery: golden-hour sky, canyon terrain tiles (LOD by distance to the route), river, boulders/hoodoos, natural arch, dust. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../../util.js';
import { createSkyDome, createCloudPuffs } from '../sky.js';
import { createWater } from '../water.js';
import { buildPatch, createTerrainMaterial } from '../terrain.js';
import { makeRockGeometry, makeRockArch, instanced, scatterAlongPath } from '../props.js';
import { WATER_Y } from './redrock.js';

export async function buildScenery(course, game, progress, yieldFrame) {
  const env = course.environment, q = game.q, H = course.heightFn;
  const sky = createSkyDome(env, game, { cloudDeck: 0.5, sunSize: 0.0016, cloudLit: new THREE.Color(1, 0.8, 0.58), cloudShade: new THREE.Color(0.5, 0.38, 0.45) });
  course.addPart(sky);
  try { const rt = sky.makeEnvMap(game.renderer); course.owned.push(rt); sky.envMap = rt.texture; } catch (e) { console.warn('[course] env map failed', e); }
  progress(0.1, 'Carving the canyon'); await yieldFrame();

  const mb = course.minimap.bounds, M = 650;
  const bounds = { minX: mb.minX - M, maxX: mb.maxX + M, minZ: mb.minZ - M, maxZ: mb.maxZ + M };
  course.addPart(createWater(env, game, { height: (x, z) => H(x, z) - WATER_Y, bounds, deep: 0x2a4a50, shallow: 0x86a98a, level: WATER_Y, maskRes: 384 }));

  // ---- distance-to-route lookup for tile LOD
  const samples = []; const f = {};
  for (let s = 0; s < course.length; s += 40) { course.frameAt(s, f); samples.push(f.pos.x, f.pos.z); }
  for (const b of course.branches) for (let u = 0; u < b.length; u += 40) { b.frameAt(u, f); samples.push(f.pos.x, f.pos.z); }
  const dMin = (cx, cz) => { let m = 1e9; for (let i = 0; i < samples.length; i += 2) { const d = Math.hypot(samples[i] - cx, samples[i + 1] - cz); if (d < m) m = d; } return m; };

  const mat = createTerrainMaterial(game, {
    low: 'sand', mid: 'rock_red', high: 'sand', cliff: 'rock_red', h: [34, 52, 215, 250], slope: [0.32, 0.6],
    tintLow: 0xffe2b8, tintMid: 0xffb890, tintHigh: 0xffd8a8, tintCliff: 0xe89a70, scaleLow: 40, scaleMid: 70, scaleHigh: 50, scaleCliff: 85,
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
      if (++built % 6 === 0) { progress(0.1 + 0.5 * ((j * tilesX + i) / (tilesX * tilesZ)), 'Carving the canyon'); await yieldFrame(); }
    }
  }
  // far backdrop: coarse strips around the carved area so the horizon is not empty
  {
    const R = 7000, bx0 = bounds.minX, bx1 = bounds.minX + tilesX * T, bz0 = bounds.minZ, bz1 = bounds.minZ + tilesZ * T;
    const strips = [[bx0 - R, bz0 - R, bx1 + R, bz0], [bx0 - R, bz1, bx1 + R, bz1 + R], [bx0 - R, bz0, bx0, bz1], [bx1, bz0, bx1 + R, bz1]];
    for (const [x0, z0, x1, z1] of strips) {
      const g = buildPatch(H, { x0, z0, x1, z1, cell: 200 }, { minH: -1e9, skirt: true, skirtDrop: 100 });
      const m = new THREE.Mesh(g, mat); group.add(m); geos.push(g);
    }
  }
  course.addPart({ dispose() { geos.forEach((g) => g.dispose()); mat.dispose(); } });
  progress(0.7, 'Scattering boulders'); await yieldFrame();

  // ---- rocks, hoodoos, spires
  const props = new THREE.Group(); props.name = 'props'; course.group.add(props);
  const disposables = [];
  const rnd = mulberry32(31);
  const boulderGeo = makeRockGeometry({ seed: 5, rough: 0.4, stretch: [1, 0.75, 1], color: 0xb4623a, color2: 0x6c3320 }), rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const spots = scatterAlongPath(course, { count: Math.round(420 * q.scenery), minLat: -10, maxLat: 260, seed: 3, accept: (x, z, h, fr) => h < fr.pos.y - 25 });
  const boulders = spots.map((o) => { const s = 4 + rnd() * 12; return { pos: new THREE.Vector3(o.x, o.y + s * 0.1, o.z), yaw: rnd() * 6.28, scale: new THREE.Vector3(s * (0.8 + rnd() * 0.7), s * (0.6 + rnd() * 0.7), s * (0.8 + rnd() * 0.7)) }; });
  if (boulders.length) props.add(instanced(boulderGeo, rockMat, boulders));
  const hoodooGeo = makeRockGeometry({ seed: 12, detail: 2, rough: 0.22, stretch: [1, 2.6, 1], color: 0xd08050, color2: 0x7c3a22 });
  const hSpots = scatterAlongPath(course, { count: Math.round(110 * q.scenery), minLat: 12, maxLat: 300, seed: 8, accept: (x, z, h, fr) => h < fr.pos.y - 30 });
  const hoodoos = hSpots.map((o) => { const s = 5 + rnd() * 9; return { pos: new THREE.Vector3(o.x, o.y, o.z), yaw: rnd() * 6.28, scale: new THREE.Vector3(s, s * (1.5 + rnd() * 2.2), s) }; });
  if (hoodoos.length) props.add(instanced(hoodooGeo, rockMat, hoodoos, { cast: true }));
  const stackGeo = makeRockGeometry({ seed: 9, detail: 2, rough: 0.25, color: 0xc77446, color2: 0x6a321f });
  const stacks = course.hazards.filter((h) => h.kind === 'stack').map((h) => { const r = h.radius * 1.3, base = H(h.pos.x, h.pos.z) - 8; return { pos: new THREE.Vector3(h.pos.x, base, h.pos.z), yaw: h.s, scale: new THREE.Vector3(r, h.top - base, r) }; });
  if (stacks.length) props.add(instanced(stackGeo, rockMat, stacks, { cast: true }));
  disposables.push(boulderGeo, hoodooGeo, stackGeo, rockMat);

  // ---- natural arch over the canyon
  const af = course.frameAt(course.marks.arch, {});
  const rightH = new THREE.Vector3(af.right.x, 0, af.right.z).normalize(), up = new THREE.Vector3(0, 1, 0), fwdH = new THREE.Vector3().crossVectors(rightH, up);
  const archGeo = makeRockArch({ radius: 104, tube: 24, color: 0xc7774a, color2: 0x7a3d24 }), archMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const arch = new THREE.Mesh(archGeo, archMat); arch.position.set(af.pos.x, af.pos.y - 38, af.pos.z);
  arch.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rightH, up, fwdH)); arch.castShadow = true; arch.receiveShadow = true; props.add(arch);
  disposables.push(archGeo, archMat);
  course.addPart({ dispose() { disposables.forEach((d) => d.dispose()); } });

  // ---- sky puffs + low dust banks
  progress(0.9, 'Raising dust'); await yieldFrame();
  const list = [], r2 = mulberry32(0xd057);
  const n = Math.round(90 * (q.clouds || 1));
  for (let i = 0; i < n; i++) {
    const s = r2() * course.length; course.frameAt(s, f);
    const side = r2() < 0.5 ? -1 : 1, lat = side * (f.halfWidth + 260 + r2() * 900);
    list.push({ x: f.pos.x + f.right.x * lat, y: f.pos.y + 160 + r2() * 360, z: f.pos.z + f.right.z * lat, size: 200 + r2() * 380, aspect: 0.6 + r2() * 0.2, opacity: 0.5 + r2() * 0.35, cell: Math.floor(r2() * 16) });
  }
  const nd = Math.round(60 * (q.clouds || 1));
  for (let i = 0; i < nd; i++) {
    const s = r2() * course.length; course.frameAt(s, f);
    const side = r2() < 0.5 ? -1 : 1, lat = side * (f.halfWidth + 70 + r2() * 220);
    const x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat;
    list.push({ x, y: Math.max(H(x, z), f.pos.y - 120) + 40 + r2() * 60, z, size: 260 + r2() * 320, aspect: 0.45, opacity: 0.28 + r2() * 0.18, cell: Math.floor(r2() * 16) });
  }
  course.addPart(createCloudPuffs(env, game, list));
}
