// Neon Skyline scenery: night sky + moon, instanced facades, signs, beacons, streets and river, elevated highway with light trails, atrium
// interior, tower ring, giant screens, search lights, hover-car / blimp hazards and distant air traffic. Owner: craft agent (role C).
// Budget: <= 400 draw calls, <= 1.5 M triangles, a handful of shader materials; everything instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../util.js';
import { createSkyDome, createCloudPuffs } from '../sky.js';
import { chunkInstanced } from '../props.js';
import { NEON } from './neon.js';
import { createFacades } from '../neon/facade.js';
import { createGround } from '../neon/ground.js';
import { makeCityEnvironment } from '../neon/env.js';
import { atriumMassBoxes, createSigns, createBeacons, createAirTraffic, createHighway, createAtriumInterior, createTowerRing, createScreens, createSearchLights, createMoon } from '../neon/parts.js';

export async function buildScenery(course, game, progress, yieldFrame) {
  const env = course.environment, q = game.q, sc = q.scenery ?? 1, city = course.heightFn.city, rnd = mulberry32(0x7e0b1);
  const mb = course.minimap.bounds;

  // ---- sky, moon, reflection environment
  const sky = createSkyDome(env, game, { cloudDeck: 0.18, sunSize: 0.0004, cloudLit: new THREE.Color(0.5, 0.28, 0.62), cloudShade: new THREE.Color(0.05, 0.05, 0.16) });
  course.addPart(sky);
  course.addPart(createMoon(game, env));
  try { const rt = makeCityEnvironment(game.renderer, env); course.owned.push(rt); course.addPart({ envMap: rt.texture }); } catch (e) { console.warn('[neon] env map failed', e); }
  progress(0.1, 'Switching on the city'); await yieldFrame();

  // ---- facades: every lot tier + the specials + a distant skyline ring
  const inst = city.boxes.slice();
  const x0 = mb.minX - 1000, x1 = mb.maxX + 1000, z0 = mb.minZ - 1000, z1 = mb.maxZ + 1000, cx0 = city.centre.x, cz0 = city.centre.z;
  const nFar = Math.round(560 * Math.min(1, 0.4 + sc * 0.6));
  for (let i = 0; i < nFar; i++) {
    const a = rnd() * Math.PI * 2, r = 1900 + Math.pow(rnd(), 0.8) * 3400, cx = cx0 + Math.cos(a) * r, cz = cz0 + Math.sin(a) * r * 0.9;
    if (cx > x0 - 60 && cx < x1 + 60 && cz > z0 - 60 && cz < z1 + 60) continue;
    const H = 150 + rnd() * 260 + (r - 1900) * 0.07, w = 80 + rnd() * 110, cell = Math.floor(rnd() * 16), seed = rnd() * 100;
    inst.push({ cx, cz, w, d: w * (0.7 + rnd() * 0.6), y0: -10, y1: H * 0.72, cell, seed, yaw: 0, kind: 'far', lit: 0.55 + rnd() * 0.4 });
    inst.push({ cx, cz, w: w * 0.7, d: w * 0.6, y0: H * 0.72 - 1, y1: H, cell, seed: seed + 5, yaw: 0, kind: 'far', lit: 0.6 + rnd() * 0.4 });
  }
  // atrium mass around the tunnel: left, right, roof and base (the channel itself stays open)
  {
    const A = city.atrium, len = A.hl * 2;
    for (const b of atriumMassBoxes(A)) inst.push({ cx: A.cx, cz: b.cz, w: len, d: b.d, y0: b.y0, y1: b.y1, cell: 14, seed: b.seed, yaw: 0, kind: 'atrium', lit: 0.95 });
  }
  const fac = createFacades(game, inst, env);
  // V-23: one 6500-box draw with frustum culling off cost 78 k triangles every frame, at Low as at High; spatial chunks let the camera cull what is behind it
  const chunks = chunkInstanced(fac.mesh, { cell: 450 });
  course.addPart({ group: chunks.group, update: fac.update, dispose() { chunks.geos.forEach((g) => g.dispose()); fac.dispose(); } });
  progress(0.3, 'Hanging the neon'); await yieldFrame();

  // ---- signs and aviation beacons (scaled by the scenery quality)
  const keepEvery = (arr, f) => (f >= 0.999 ? arr : arr.filter((_, i) => (i * 0.6180339) % 1 < f));
  course.addPart(createSigns(game, keepEvery(city.signs, Math.min(1, 0.35 + sc * 0.65))));
  course.addPart(createBeacons(keepEvery(city.beacons, Math.min(1, 0.3 + sc * 0.7))));
  progress(0.45, 'Wetting the streets'); await yieldFrame();

  // ---- streets and river
  const rb = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [x, z] of city.river.pts) { rb.minX = Math.min(rb.minX, x); rb.maxX = Math.max(rb.maxX, x); rb.minZ = Math.min(rb.minZ, z); rb.maxZ = Math.max(rb.maxZ, z); }
  const m = 340; rb.minX -= m; rb.maxX += m; rb.minZ -= m; rb.maxZ += m;
  course.addPart(createGround(env, game, city, rb));
  progress(0.6, 'Raising the highway'); await yieldFrame();

  // ---- set pieces
  course.addPart(createHighway(city, game));
  course.addPart(createAtriumInterior(city, NEON));
  course.addPart(createTowerRing(city, NEON, NEON.towerLoop.drift / 2 + NEON.towerLoop.gapToTower));
  course.addPart(createScreens(city, game, NEON));
  progress(0.75, 'Launching traffic'); await yieldFrame();

  // ---- search lights on the tallest roofs far from the route, decorative air traffic, clouds
  let sl = city.lights.slice(0, 6);
  if (sl.length < 4) sl = city.boxes.filter((b) => b.kind === 'lot' && b.y1 > 200).slice(0, 6).map((b) => ({ x: b.cx, y: b.y1, z: b.cz }));
  if (sl.length) course.addPart(createSearchLights(sl));
  course.addPart(createAirTraffic(rnd, city.centre, Math.round(46 * Math.min(1, 0.3 + sc * 0.7))));
  const puffs = [], f = {};
  for (let i = 0; i < Math.round(36 * (q.clouds ?? 1)); i++) {
    const s = rnd() * course.length; course.frameAt(s, f);
    const lat = (rnd() < 0.5 ? -1 : 1) * (400 + rnd() * 1400);
    puffs.push({ x: f.pos.x + f.right.x * lat, y: 520 + rnd() * 380, z: f.pos.z + f.right.z * lat, size: 500 + rnd() * 700, aspect: 0.5 + rnd() * 0.2, opacity: 0.22 + rnd() * 0.25, rot: (rnd() - 0.5) * 0.1, cell: Math.floor(rnd() * 16) });
  }
  course.addPart(createCloudPuffs(env, game, puffs));
  progress(0.9, 'Dispatching hover cars'); await yieldFrame();
  course.addPart(createHazardVehicles(course, game));
}

// ------------------------------------------------------------------------------------------------ hazard vehicles (hover cars + blimps)
function createHazardVehicles(course, game) {
  const grp = new THREE.Group(); grp.name = 'traffic';
  const disp = [];
  const own = (o) => { disp.push(o); return o; };
  const glow = (c, k) => own(new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }));
  const amber = glow(0xffa022, 3.6), red = glow(0xff2a20, 3.2);
  const boxG = own(new THREE.BoxGeometry(1, 1, 1)), sphG = own(new THREE.SphereGeometry(1, 20, 12));
  const mk = (g, mat, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(g, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); return o; };
  // Every vehicle is baked into three meshes: lit body+glass, emissive lights (vertex colours) and the blinking strobe.
  // The two baked geometries per vehicle type are built once and shared by every instance of that type.
  const litMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, metalness: 0.8, roughness: 0.26 }));
  const glowMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, toneMapped: false }));
  const C = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
  const bodyC = C(0x20243a), glassC = C(0x0a1020), amberC = C(0xffa022, 3.6), cyanC = C(0x35e8ff, 3.2), whiteC = C(0xfff2dc, 3.4), redC = C(0xff2a20, 3.2), pinkC = C(0xff3fc8, 3.0);
  const bake = (specs) => {
    const lit = [], gl = [];
    for (const [geo, col, glowing, sx, sy, sz, x, y, z] of specs) {
      const g = geo.clone(); g.scale(sx, sy, sz); g.translate(x, y, z);
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); (glowing ? gl : lit).push(g);
    }
    const out = { lit: mergeGeometries(lit), glow: mergeGeometries(gl) }; lit.concat(gl).forEach((g) => g.dispose()); own(out.lit); own(out.glow); return out;
  };
  const hoverGeo = bake([
    [boxG, bodyC, false, 4.8, 1.3, 11, 0, 0, 0], [boxG, glassC, false, 3.4, 1.1, 5.2, 0, 1.0, 0.8], [boxG, cyanC, true, 4.2, 0.28, 9.6, 0, -0.9, 0],
    [boxG, whiteC, true, 1.0, 0.5, 0.4, -1.5, 0.1, -5.6], [boxG, whiteC, true, 1.0, 0.5, 0.4, 1.5, 0.1, -5.6], [boxG, redC, true, 1.0, 0.5, 0.4, -1.5, 0.1, 5.6], [boxG, redC, true, 1.0, 0.5, 0.4, 1.5, 0.1, 5.6]]);
  const blimpGeo = bake([
    [sphG, bodyC, false, 8.4, 8.4, 19, 0, 0, 0], [boxG, glassC, false, 3, 2.4, 8, 0, -9.0, -1], [boxG, pinkC, true, 0.5, 5.6, 14, 8.55, 0.2, 0], [boxG, cyanC, true, 0.5, 5.6, 14, -8.55, 0.2, 0],
    [boxG, bodyC, false, 0.5, 8, 6, 0, 3.5, 17], [boxG, bodyC, false, 8, 0.5, 6, 0, 0, 17], [boxG, redC, true, 1, 1, 1, 0, 9.5, 0], [boxG, whiteC, true, 1, 1, 1, 0, 0.5, -19]]);
  const vehicle = (geos, strobeMat, sx, sy, sz, x, y, z) => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(geos.lit, litMat), new THREE.Mesh(geos.glow, glowMat));
    const st = mk(boxG, strobeMat, sx, sy, sz, x, y, z); g.add(st); g.userData.strobe = st; return g;
  };
  const hover = () => vehicle(hoverGeo, amber, 0.9, 0.9, 0.9, 0, 2.0, 0.5);
  const blimp = () => vehicle(blimpGeo, red, 1.4, 1.4, 1.4, 0, -10.6, -1);
  const fr = {};
  const items = [];
  for (const h of course.hazards) {
    if (h.kind !== 'hovercar' && h.kind !== 'blimp') continue;
    const d = h.data || {}; course.frameAt(h.s, fr);
    const mesh = h.kind === 'blimp' ? blimp() : hover();
    if (h.kind === 'hovercar') mesh.scale.setScalar(1.25);
    grp.add(mesh);
    items.push({ h, mesh, d, right: fr.right.clone(), tan: fr.tangent.clone(), blimp: h.kind === 'blimp' });
  }
  // h.pos is gameplay (collision, AI): Course.stepHazards(race.clock) sets it in the fixed step (E-04). The render loop only places meshes from it;
  // heading, roll and the strobe read the same clock (course.hazardTime), so they flip exactly when the body turns round.
  let tm = 0; const bp = new THREE.Vector3();
  return {
    group: grp,
    update(dt, game) {
      tm += dt;
      const ct = course.hazardTime;
      for (const it of items) {
        const { h, d } = it, w = (Math.PI * 2) / (d.period || 8), cv = Math.cos(ct * w + (h.phase || 0));
        let vx = 0, vz = 0;
        if (d.axis === 'vertical') { vx = it.tan.x; vz = it.tan.z; }
        else { vx = it.right.x * cv; vz = it.right.z * cv; if (it.blimp) { vx = it.tan.x; vz = it.tan.z; } }
        it.mesh.position.copy(course.hazardRenderPos(h, bp, game));
        if (vx || vz) it.mesh.rotation.y = Math.atan2(-vx, -vz);
        it.mesh.rotation.z = it.blimp ? 0 : -cv * 0.18;
        const st = it.mesh.userData.strobe; if (st) st.visible = Math.sin(tm * 9 + (h.phase || 0)) > -0.1;
      }
    },
    dispose() { disp.forEach((o) => o.dispose?.()); },
  };
}
