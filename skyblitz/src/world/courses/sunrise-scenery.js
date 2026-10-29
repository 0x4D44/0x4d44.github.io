// Sunrise Archipelago scenery: sky dome + cloud puffs, sea, island terrain patches. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../../util.js';
import { createSkyDome, createCloudPuffs } from '../sky.js';
import { createWater } from '../water.js';
import { buildPatch, createTerrainMaterial } from '../terrain.js';
import { makeHutGeometry, makeJettyGeometry, makeBoatGeometry, makeFlowerGeometry, makeCoralGeometry, makeCrystalGeometry, makeStalactiteGeometry, makeBuoyGeometry } from '../props-isle.js';
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
  course.addPart(createWater(env, game, { height: course.heightFn, bounds, deep: 0x083a78, shallow: 0x4ae6d2, reef: 1, maskRes: 1024 }));
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
  const up = new THREE.Vector3(0, 1, 0);
  const disposables = [];
  const sc = q.scenery;
  // ---- palms and boulders concentrated near the route
  const slope = (x, z) => Math.hypot(H(x + 6, z) - H(x - 6, z), H(x, z + 6) - H(x, z - 6)) / 12;
  const palmSpots = scatterAlongPath(course, { count: Math.round(900 * sc), minLat: 4, maxLat: 620, seed: 11, accept: (x, z, h) => h > 3 && h < 46 && slope(x, z) < 0.55 });
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

  // ---- jungle canopy clumps, tall bushes and cliff boulders breaking up the smooth slopes
  {
    const r4 = mulberry32(555);
    const bushGeo = makeRockGeometry({ seed: 13, detail: 1, rough: 0.5, stretch: [1, 0.8, 1], color: 0x5fb04a, color2: 0x1f5a2a }), bushGeo2 = makeRockGeometry({ seed: 17, detail: 1, rough: 0.5, stretch: [1, 0.9, 1], color: 0x8acb4a, color2: 0x2f7a32 });
    const bushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }); disposables.push(bushGeo, bushGeo2, bushMat);
    const spots2 = scatterAlongPath(course, { count: Math.round(650 * sc), minLat: 4, maxLat: 650, seed: 71, accept: (x, z, h) => h > 5 && h < 150 && slope(x, z) < 0.9 });
    const mk = (o) => { const s = 5 + r4() * 11; return { pos: new THREE.Vector3(o.x, o.y + s * 0.15, o.z), yaw: r4() * 6.28, scale: new THREE.Vector3(s * (1 + r4() * 0.6), s * (0.7 + r4() * 0.5), s * (1 + r4() * 0.6)) }; };
    group.add(instanced(bushGeo, bushMat, spots2.filter((_, i) => i % 2 === 0).map(mk)), instanced(bushGeo2, bushMat, spots2.filter((_, i) => i % 2 === 1).map(mk)));
    const cl = scatterAlongPath(course, { count: Math.round(160 * sc), minLat: 0, maxLat: 650, seed: 81, accept: (x, z, h) => h > 20 && h < 190 && slope(x, z) > 0.5 });
    const bigRock = makeRockGeometry({ seed: 23, detail: 2, rough: 0.3, stretch: [1, 1.6, 1], color: 0x9a8f84, color2: 0x4a423c }), bigMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }); disposables.push(bigRock, bigMat);
    group.add(instanced(bigRock, bigMat, cl.map((o) => { const s = 10 + r4() * 22; return { pos: new THREE.Vector3(o.x, o.y, o.z), yaw: r4() * 6.28, tx: (r4() - 0.5) * 0.3, scale: new THREE.Vector3(s, s * (0.9 + r4()), s) }; }), { cast: true }));
  }

  // ---- sea stacks for the slalom hazards (columns, collision-matched)
  const stackGeo = makeRockGeometry({ seed: 9, detail: 2, rough: 0.28, color: 0xa39a90, color2: 0x5f5750 }), stackMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const stacks = course.hazards.filter((h) => h.kind === 'stack').map((h) => { const r = h.radius * 1.25, base = -4; return { pos: new THREE.Vector3(h.pos.x, base, h.pos.z), yaw: h.s, scale: new THREE.Vector3(r, h.top - base, r) }; });
  if (stacks.length) group.add(instanced(stackGeo, stackMat, stacks, { cast: true }));
  disposables.push(stackGeo, stackMat);

  // ---- island dressing: huts + jetties on the beaches, boats and buoys in the lagoons, flowers, coral under the surface
  {
    const r2 = mulberry32(2024), place = (geo, mat, list, cast = false) => { if (list.length) group.add(instanced(geo, mat, list, { cast })); disposables.push(geo); };
    const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); disposables.push(vcMat);
    const beach = scatterAlongPath(course, { count: 30, minLat: 0, maxLat: 700, seed: 31, accept: (x, z, h) => h > 1.6 && h < 4.2 && slope(x, z) < 0.12 });
    const seaDir = (x, z) => { let best = 0, bh = 1e9; for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, hh = H(x + Math.cos(a) * 45, z + Math.sin(a) * 45); if (hh < bh) { bh = hh; best = a; } } return best; };
    const huts = [], jetties = [];
    beach.forEach((o, i) => {
      const a = seaDir(o.x, o.z);
      if (i % 3 === 0 && jetties.length < 5) jetties.push({ pos: new THREE.Vector3(o.x, 0.2, o.z), yaw: Math.PI / 2 - a, scale: 1.2 });
      else if (huts.length < 14) huts.push({ pos: new THREE.Vector3(o.x - Math.cos(a) * 8, o.y + 0.2, o.z - Math.sin(a) * 8), yaw: Math.PI / 2 - a, scale: 0.9 + r2() * 0.4 });
    });
    place(makeHutGeometry(), vcMat, huts, true); place(makeJettyGeometry(), vcMat, jetties);
    const lagoon = scatterAlongPath(course, { count: 26, minLat: 0, maxLat: 900, seed: 41, accept: (x, z, h) => h < -6 && h > -30 });
    place(makeBoatGeometry(), vcMat, lagoon.slice(0, 12).map((o) => ({ pos: new THREE.Vector3(o.x, 0.15, o.z), yaw: r2() * 6.28, scale: 0.9 + r2() * 0.6 })));
    place(makeBuoyGeometry(), vcMat, lagoon.slice(12).map((o) => ({ pos: new THREE.Vector3(o.x, 0, o.z), yaw: 0, scale: 1.3 })));
    const flowers = scatterAlongPath(course, { count: Math.round(420 * sc), minLat: 2, maxLat: 520, seed: 51, accept: (x, z, h) => h > 4 && h < 50 && slope(x, z) < 0.5 });
    place(makeFlowerGeometry(), vcMat, flowers.map((o) => ({ pos: new THREE.Vector3(o.x, o.y, o.z), yaw: r2() * 6.28, scale: 1.2 + r2() * 1.8 })));
    const coral = scatterAlongPath(course, { count: Math.round(320 * sc), minLat: 0, maxLat: 900, seed: 61, accept: (x, z, h) => h < -2.5 && h > -15 });
    place(makeCoralGeometry(), vcMat, coral.map((o) => ({ pos: new THREE.Vector3(o.x, o.y - 0.4, o.z), yaw: r2() * 6.28, scale: 0.9 + r2() * 1.3 })));
  }

  // ---- sea-cave gorge dressing: glowing crystals on the walls, rock bridges with stalactites hanging beneath
  {
    const br = course.branches[0], r3 = mulberry32(77), f2 = {};
    if (br) {
      const crys = [], stal = [], bridges = [];
      for (let u = 40; u < br.length - 40; u += 38) {
        br.frameAt(u, f2);
        for (const side of [-1, 1]) {
          const lat = side * f2.halfWidth * (0.92 + r3() * 0.25), x = f2.pos.x + f2.right.x * lat, z = f2.pos.z + f2.right.z * lat;
          const y = Math.max(-5, H(x, z)) - 1;
          if (y < f2.pos.y + 10) crys.push({ pos: new THREE.Vector3(x, y, z), yaw: r3() * 6.28, tx: (r3() - 0.5) * 0.3, scale: 1.6 + r3() * 2.4 });
        }
      }
      const archGeo = makeRockArch({ radius: 84, tube: 13, seed: 5, color: 0x8a7766, color2: 0x4a3c34 }), archMat2 = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
      disposables.push(archGeo, archMat2);
      for (let u = 150; u < br.length - 140; u += 230) {
        br.frameAt(u, f2);
        const rh = new THREE.Vector3(f2.right.x, 0, f2.right.z).normalize(), fw = new THREE.Vector3().crossVectors(rh, up);
        const m = new THREE.Mesh(archGeo, archMat2); m.position.set(f2.pos.x, f2.pos.y + f2.halfHeight - 4, f2.pos.z);
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rh, up, fw)); m.castShadow = true; group.add(m); bridges.push(m);
        const top = f2.pos.y + f2.halfHeight - 4 + 84 - 13;
        for (let k = 0; k < 6; k++) { const a = (k / 5 - 0.5) * 1.5, lat = Math.sin(a) * 84, hy = Math.cos(a) * 84 - 13 * 0.8; stal.push({ pos: new THREE.Vector3(f2.pos.x + rh.x * lat, f2.pos.y + f2.halfHeight - 4 + hy - 2, f2.pos.z + rh.z * lat), yaw: r3() * 6, scale: new THREE.Vector3(2.4 + r3() * 2, 10 + r3() * 12, 2.4 + r3() * 2) }); }
      }
      const crystalMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); crystalMat.color.setScalar(1.25); disposables.push(crystalMat);
      const cg = makeCrystalGeometry(), sg = makeStalactiteGeometry(), stalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
      disposables.push(cg, sg, stalMat);
      if (crys.length) group.add(instanced(cg, crystalMat, crys, { receive: false }));
      if (stal.length) group.add(instanced(sg, stalMat, stal, { cast: true }));
    }
  }

  // ---- hot-air balloons (sway)
  const balGeo = makeBalloonGeometry(), balMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }); disposables.push(balGeo, balMat);
  const balloons = course.hazards.filter((h) => h.kind === 'balloon').map((h) => { const m = new THREE.Mesh(balGeo, balMat); m.scale.setScalar(1.25); m.castShadow = true; group.add(m); return { h, m }; });

  // ---- sea arch: lintel spans the route between the two terrain pillars

  const af = course.frameAt(course.marks.arch, {});
  const rightH = new THREE.Vector3(af.right.x, 0, af.right.z).normalize(), fwdH = new THREE.Vector3().crossVectors(rightH, up);
  const archGeo = makeRockArch({ radius: 100, tube: 21, color: 0x9a8a78, color2: 0x56483f }), archMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }); disposables.push(archGeo, archMat);
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
