// Sunrise Archipelago scenery: sky dome + cloud puffs, sea, island terrain patches. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../../util.js';
import { createSkyDome, createCloudPuffs } from '../sky.js';
import { createWater } from '../water.js';
import { buildPatch, createTerrainMaterial } from '../terrain.js';
import { makePalmGeometry, makeRockGeometry, makeBalloonGeometry, makeLighthouse, makeRockArch, instanced, scatterAlongPath } from '../props.js';

export async function buildScenery(course, game, progress, yieldFrame) {
  const def = course.def, env = course.environment, q = game.q;
  // ---- sky
  const sky = createSkyDome(env, game, { cloudDeck: 0.55, sunSize: 0.0011 });
  course.addPart(sky);
  try { const rt = sky.makeEnvMap(game.renderer); course.owned.push(rt); sky.envMap = rt.texture; } catch (e) { console.warn('[course] env map failed', e); }
  progress(0.15, 'Raising the islands'); await yieldFrame();

  // ---- bounds of the playable area (islands + path)
  const mb = course.minimap.bounds;
  let minX = mb.minX - 600, maxX = mb.maxX + 600, minZ = mb.minZ - 600, maxZ = mb.maxZ + 600;
  for (const I of def.islands) { minX = Math.min(minX, I.x - I.r * 1.6); maxX = Math.max(maxX, I.x + I.r * 1.6); minZ = Math.min(minZ, I.z - I.r * 1.6); maxZ = Math.max(maxZ, I.z + I.r * 1.6); }
  const bounds = { minX, maxX, minZ, maxZ };

  // ---- water
  course.addPart(createWater(env, game, { height: course.heightFn, bounds, deep: 0x0a4f85, shallow: 0x46dccb }));
  progress(0.35, 'Shaping terrain'); await yieldFrame();

  // ---- terrain patches around each island
  const mat = createTerrainMaterial(game, {
    low: 'sand', mid: 'grass', high: 'rock_grey', cliff: 'rock_grey', h: [1.5, 8, 150, 215],
    tintLow: 0xfff0d0, tintMid: 0xd8f0a8, tintHigh: 0xd0c8c0, tintCliff: 0xcdb8a8, scaleLow: 30, scaleMid: 52, scaleHigh: 70, scaleCliff: 80,
  });
  const group = new THREE.Group(); group.name = 'terrain';
  const geos = [];
  for (const I of def.islands) {
    const ext = I.r * 1.55, cell = Math.max(8, Math.round(I.r / 36));
    const g = buildPatch(course.heightFn, { x0: I.x - ext, z0: I.z - ext, x1: I.x + ext, z1: I.z + ext, cell });
    if (!g.index.count) { g.dispose(); continue; }
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = true; group.add(m); geos.push(g);
  }
  course.group.add(group);
  course.addPart({ dispose() { geos.forEach((g) => g.dispose()); mat.dispose(); } });
  progress(0.7, 'Gathering clouds'); await yieldFrame();

  // ---- billboard clouds around the route
  const rnd = mulberry32(0x5eed);
  const list = []; const f = {};
  const n = Math.round(130 * (q.clouds || 1));
  for (let i = 0; i < n; i++) {
    const s = rnd() * course.length; course.frameAt(s, f);
    const side = rnd() < 0.5 ? -1 : 1, lat = side * (f.halfWidth + 220 + rnd() * 900);
    const alt = f.pos.y + 90 + rnd() * 330;
    list.push({ x: f.pos.x + f.right.x * lat + (rnd() - 0.5) * 100, y: alt, z: f.pos.z + f.right.z * lat + (rnd() - 0.5) * 100, size: 160 + rnd() * 360, aspect: 0.62 + rnd() * 0.25, opacity: 0.55 + rnd() * 0.4, rot: (rnd() - 0.5) * 0.1, cell: Math.floor(rnd() * 16) });
  }
  // a few far, huge banks on the horizon
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, r = 4500 + rnd() * 2500; list.push({ x: Math.cos(a) * r + 600, y: 120 + rnd() * 400, z: Math.sin(a) * r, size: 900 + rnd() * 900, aspect: 0.5, opacity: 0.8, cell: Math.floor(rnd() * 16) }); }
  course.addPart(createCloudPuffs(env, game, list));
  progress(0.85, 'Planting palms'); await yieldFrame();
  buildProps(course, game);
}

function buildProps(course, game) {
  const q = game.q, def = course.def, H = course.heightFn;
  const group = new THREE.Group(); group.name = 'props'; course.group.add(group);
  const disposables = [];
  const sc = q.scenery;
  // ---- palms and boulders concentrated near the route
  const slope = (x, z) => Math.hypot(H(x + 6, z) - H(x - 6, z), H(x, z + 6) - H(x, z - 6)) / 12;
  const palmSpots = scatterAlongPath(course, { count: Math.round(520 * sc), minLat: 4, maxLat: 520, seed: 11, accept: (x, z, h) => h > 3 && h < 46 && slope(x, z) < 0.55 });
  const palmGeo = makePalmGeometry(), palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const rnd = mulberry32(99);
  const palms = palmSpots.map((o) => ({ pos: new THREE.Vector3(o.x, o.y - 0.5, o.z), yaw: rnd() * 6.28, scale: 0.8 + rnd() * 0.8, tx: (rnd() - 0.5) * 0.18, tz: (rnd() - 0.5) * 0.18 }));
  if (palms.length) group.add(instanced(palmGeo, palmMat, palms, { cast: false }));
  disposables.push(palmGeo, palmMat);
  const rockSpots = scatterAlongPath(course, { count: Math.round(170 * sc), minLat: 0, maxLat: 520, seed: 21, accept: (x, z, h) => h > -1 && h < 160 });
  const rockGeo = makeRockGeometry({ seed: 4, rough: 0.35, stretch: [1, 0.8, 1], color: 0x7a6e64, color2: 0x453d38 }), rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const rocks = rockSpots.map((o) => { const s = 3 + rnd() * 9; return { pos: new THREE.Vector3(o.x, o.y + s * 0.1, o.z), yaw: rnd() * 6.28, scale: new THREE.Vector3(s * (0.8 + rnd() * 0.6), s * (0.6 + rnd() * 0.6), s * (0.8 + rnd() * 0.6)) }; });
  if (rocks.length) group.add(instanced(rockGeo, rockMat, rocks, { cast: false }));
  disposables.push(rockGeo, rockMat);

  // ---- sea stacks for the slalom hazards (columns, collision-matched)
  const stackGeo = makeRockGeometry({ seed: 9, detail: 2, rough: 0.28, color: 0xa39a90, color2: 0x5f5750 }), stackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const stacks = course.hazards.filter((h) => h.kind === 'stack').map((h) => { const r = h.radius * 1.25, base = -4; return { pos: new THREE.Vector3(h.pos.x, base, h.pos.z), yaw: h.s, scale: new THREE.Vector3(r, h.top - base, r) }; });
  if (stacks.length) group.add(instanced(stackGeo, stackMat, stacks, { cast: true }));
  disposables.push(stackGeo, stackMat);

  // ---- hot-air balloons (sway)
  const balGeo = makeBalloonGeometry(), balMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }); disposables.push(balGeo, balMat);
  const balloons = course.hazards.filter((h) => h.kind === 'balloon').map((h) => { const m = new THREE.Mesh(balGeo, balMat); m.scale.setScalar(1.25); m.castShadow = true; group.add(m); return { h, m }; });

  // ---- sea arch: lintel spans the route between the two terrain pillars
  const af = course.frameAt(course.marks.arch, {});
  const rightH = new THREE.Vector3(af.right.x, 0, af.right.z).normalize(), up = new THREE.Vector3(0, 1, 0), fwdH = new THREE.Vector3().crossVectors(rightH, up);
  const archGeo = makeRockArch({ radius: 100, tube: 21 }), archMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }); disposables.push(archGeo, archMat);
  const arch = new THREE.Mesh(archGeo, archMat); arch.position.set(af.pos.x, af.pos.y - 35, af.pos.z);
  arch.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rightH, up, fwdH)); arch.castShadow = true; arch.receiveShadow = true; group.add(arch);

  // ---- lighthouse beside the loop
  const lf = course.frameAt(course.marks.loopEntry, {}), lt = course.frameAt(course.marks.loopTop, {});
  const lr = new THREE.Vector3(lf.right.x, 0, lf.right.z).normalize();
  const bx = lf.pos.x - lr.x * 72, bz = lf.pos.z - lr.z * 72, by = H(bx, bz);
  const lh = makeLighthouse(Math.max(120, lt.pos.y - by - 12)); lh.group.position.set(bx, by - 2, bz); group.add(lh.group);
  disposables.push({ dispose: lh.dispose });

  let tm = 0;
  course.addPart({
    update(dt) {
      tm += dt; lh.beams.rotation.y += dt * 0.9;
      for (const b of balloons) { const h = b.h; h.pos.x = h.home.x + Math.sin(tm * 0.5 + h.phase) * h.sway; h.pos.y = h.home.y + Math.sin(tm * 0.7 + h.phase * 2) * h.sway * 0.4; b.m.position.set(h.pos.x, h.pos.y - 13 * 1.25, h.pos.z); b.m.rotation.y = tm * 0.1; }
    },
    dispose() { disposables.forEach((d) => d.dispose?.()); },
  });
}
