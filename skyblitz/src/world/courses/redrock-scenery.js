// Redrock Rapids scenery: golden-hour sky, a banded sandstone canyon (cream / rust / maroon strata, rim light), a turquoise river with sun glitter,
// saguaros, agaves, scrub and cottonwoods, hoodoos and banded buttes, wooden trestles and a steel truss, the natural arch and the slot-canyon rock
// bridges with light shafts, the spire's caprock and its circling birds, dust devils and golden haze, and white-water rapids (rapids.js) that run down the
// flooded reaches with foam rings round every pillar standing in the river. Owner: world agent.
import * as THREE from 'three';
import { mulberry32 } from '../../util.js';
import { createSkyDome, createCloudPuffs } from '../sky.js';
import { createWater } from '../water.js';
import { createRapids } from '../rapids.js';
import { createTerrainMaterial } from '../terrain.js';
import { patchTerrain, buildTerrainTiles } from '../terrain-fx.js';
import { createShafts, createDustDevils, createGlowPoints, createBirds, createAltitudeFog } from '../atmos.js';
import { makeMast, instancedQ, surfaceNormal, scatterFloor, scatterWall, wallPoint } from '../props-ice.js';
import { makeRockGeometry } from '../props.js';
import { createStrataMaterial, makeSaguaro, makeAgave, makeScrub, makeTuft, makeCottonwood, makeHoodoo, makeSandstoneArch, makeTrestle, makeTruss } from '../props-desert.js';
import { WATER_Y, SPIRE } from './redrock.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);
const AMBER = new THREE.Color(2.4, 1.3, 0.45), MAGENTA = new THREE.Color(1.8, 0.45, 1.55), WARM = new THREE.Color(2.6, 1.7, 0.8);

export async function buildScenery(course, game, progress, yieldFrame) {
  const env = course.environment, q = game.q, H = course.heightFn, S = q.scenery, L = course.length, f = {};
  const sky = createSkyDome(env, game, { cloudDeck: 0.42, sunSize: 0.0016, cloudLit: new THREE.Color(1, 0.8, 0.58), cloudShade: new THREE.Color(0.5, 0.38, 0.45) });
  course.addPart(sky);
  try { const rt = sky.makeEnvMap(game.renderer); course.owned.push(rt); sky.envMap = rt.texture; } catch (e) { console.warn('[course] env map failed', e); }
  progress(0.1, 'Carving the canyon'); await yieldFrame();

  const mb = course.minimap.bounds, M = 650;
  const bounds = { minX: mb.minX - M, maxX: mb.maxX + M, minZ: mb.minZ - M, maxZ: mb.maxZ + M };
  course.addPart(createWater(env, game, { height: (x, z) => H(x, z) - WATER_Y, bounds, deep: 0x0b4658, shallow: 0x3db8a6, level: WATER_Y, maskRes: 640, glitter: 1 }));

  // ---- the flight corridor as a spatial index: nothing is ever planted inside it (inCorridor), bridges and arches are sized against it
  const corr = [], grid = new Map(), CELL = 200, gk = (ix, iz) => ix * 8192 + iz;
  const index = (len, frameAt) => {
    for (let s = 0; s <= len; s += 12) {
      frameAt(s, f);
      const o = { x: f.pos.x, y: f.pos.y, z: f.pos.z, tx: f.tangent.x, ty: f.tangent.y, tz: f.tangent.z, rx: f.right.x, ry: f.right.y, rz: f.right.z, ux: f.up.x, uy: f.up.y, uz: f.up.z, hw: f.halfWidth, hh: f.halfHeight };
      corr.push(o); const k = gk(Math.floor(o.x / CELL), Math.floor(o.z / CELL));
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(o);
    }
  };
  index(L, (s, o) => course.frameAt(s, o));
  for (const b of course.branches) index(b.length, (u, o) => b.frameAt(u, o));
  const inCorridor = (x, y, z, pad = 0) => {
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = grid.get(gk(ix + a, iz + b)); if (!list) continue;
      for (const o of list) {
        const dx = x - o.x, dy = y - o.y, dz = z - o.z, al = dx * o.tx + dy * o.ty + dz * o.tz;
        if (al > 9 || al < -9) continue;
        const la = (dx * o.rx + dy * o.ry + dz * o.rz) / (o.hw + pad), ve = (dx * o.ux + dy * o.uy + dz * o.uz) / (o.hh + pad);
        if (la * la + ve * ve < 1) return true;
      }
    }
    return false;
  };

  // ---- terrain: sandstone strata (cream / rust / maroon bands that wander with the rock), warm and mauve blotches, golden rim light, scrubby valley floor
  const mat = createTerrainMaterial(game, {
    low: 'sand', mid: 'rock_red', high: 'sand', cliff: 'rock_red', h: [46, 68, 215, 250], slope: [0.3, 0.58], roughness: 0.93,
    tintLow: 0xffe2b8, tintMid: 0xf6b48c, tintHigh: 0xffd8a8, tintCliff: 0xeaa078, scaleLow: 40, scaleMid: 70, scaleHigh: 50, scaleCliff: 85,
  });
  patchTerrain(mat, {
    sun: env.sunDir,
    tone: { a: 0xffeab8, b: 0xdcb0d8, scaleA: 800, scaleB: 240 },
    bands: { scale: 0.055, warp: 2.6, strength: 0.8, abs: true, lumBase: 0.12, lumGain: 3.2, relief: 2.6, colors: [0xb8532c, 0xd99a5c, 0xf2d8a4, 0x6e2f3a] },      // rust, ochre, cream (a third of the bands), maroon (rare); ledges 2.6 m
    rim: { color: new THREE.Color(0.55, 0.2, 0.05), power: 3 },
    twilight: { color: new THREE.Color(0.5, 0.2, 0.05), y0: 150, y1: 300 },
    floor: { color: new THREE.Color(0.5, 0.78, 0.3), scale: 70, cover: 0.5, strength: 0.9 },
    shore: { color: new THREE.Color(0.62, 0.52, 0.46), y0: WATER_Y + 1.5, y1: WATER_Y + 7 },                    // wet, dark banks along the river
  });
  const tiles = await buildTerrainTiles({
    course, H, mat, bounds, T: 360, cellFor: (d) => (d < 120 ? 9 : d < 300 ? 15 : d < 600 ? 26 : d < 900 ? 48 : 96), castNear: 200, nearD: 300, block: 3, farR: 7000,
    progress: (fr, t) => progress(0.1 + fr, t), yieldFrame,
  });
  course.group.add(tiles.group);
  course.addPart({ dispose() { tiles.geos.forEach((g) => g.dispose()); mat.dispose(); } });
  progress(0.65, 'Planting the desert'); await yieldFrame();

  // ---- props
  const props = new THREE.Group(); props.name = 'props'; course.group.add(props);
  const disposables = [], rnd = mulberry32(31);
  const rockMat = createStrataMaterial(game, { scale: 0.085, lumBase: 0.2, lumGain: 1.4 });
  const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, emissive: new THREE.Color(0x1d2a10), emissiveIntensity: 0.18, side: THREE.DoubleSide });
  const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, emissive: new THREE.Color(0x2a1408), emissiveIntensity: 0.2 });
  const ironMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, emissive: new THREE.Color(0x2a1208), emissiveIntensity: 0.16 });
  const mastMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
  disposables.push(rockMat, plantMat, woodMat, ironMat, mastMat);
  const add = (geo, m, items, o) => { if (items.length) props.add(instancedQ(geo, m, items, o)); disposables.push(geo); };
  const flat = (x, z, min = 0.8) => surfaceNormal(H, x, z, 6).y > min;
  const dry = (y) => y > WATER_Y + 4.5;
  const glows = [];
  const tintOf = (r, k = 0.25) => new THREE.Color(1 - k + r * 2 * k, 1 - k * 0.5 + ((r * 7.7) % 1) * k, 1 - k + ((r * 3.3) % 1) * k);

  // valley floor: saguaros, agaves, scrub, riverside cottonwoods, boulders, hoodoo gardens (all kept out of the corridor)
  {
    const sag = [makeSaguaro({ seed: 3 }), makeSaguaro({ seed: 8 })], sa = [[], []];
    for (const o of scatterFloor(course, H, { count: Math.round(200 * S), seed: 5, latMax: 2.6, groves: 34, groveR: 55, accept: (o) => dry(o.pos.y) && flat(o.pos.x, o.pos.z, 0.84) && !inCorridor(o.pos.x, o.pos.y + 14, o.pos.z, 4) })) {
      const sc = 0.75 + o.r * 0.85; sa[o.r < 0.5 ? 0 : 1].push({ pos: V3(o.pos.x, o.pos.y - 0.3, o.pos.z), yaw: o.r * 40, scale: V3(sc, sc * (0.9 + 0.3 * ((o.r * 9.1) % 1)), sc), color: tintOf(o.r, 0.18) });
    }
    add(sag[0], plantMat, sa[0], { receive: false }); add(sag[1], plantMat, sa[1], { receive: false });
    const ag = makeAgave({ seed: 4 }), agi = [];
    for (const o of scatterFloor(course, H, { count: Math.round(260 * S), seed: 6, latMax: 2.8, groves: 40, groveR: 40, accept: (o) => dry(o.pos.y) && flat(o.pos.x, o.pos.z, 0.78) && !inCorridor(o.pos.x, o.pos.y + 2, o.pos.z, 2) })) {
      const sc = 1.4 + o.r * 2.0; agi.push({ pos: V3(o.pos.x, o.pos.y - 0.1, o.pos.z), yaw: o.r * 50, scale: sc, color: tintOf(o.r, 0.22) });
    }
    add(ag, plantMat, agi, { receive: false });
    const sc1 = makeScrub({ seed: 5 }), sc2 = makeScrub({ seed: 9, lumps: 8 }), sci = [[], []];
    for (const o of scatterFloor(course, H, { count: Math.round(520 * S), seed: 7, latMax: 3.0, groves: 60, groveR: 45, accept: (o) => o.pos.y > WATER_Y + 1.6 && flat(o.pos.x, o.pos.z, 0.7) && !inCorridor(o.pos.x, o.pos.y + 2.4, o.pos.z, 2) })) {
      const sc = 1.6 + o.r * o.r * 3.8; sci[o.r < 0.5 ? 0 : 1].push({ pos: V3(o.pos.x, o.pos.y - 0.2, o.pos.z), yaw: o.r * 60, scale: V3(sc, sc * (0.7 + 0.5 * ((o.r * 5.3) % 1)), sc), color: tintOf(o.r, 0.2) });
    }
    add(sc1, plantMat, sci[0], { receive: false }); add(sc2, plantMat, sci[1], { receive: false });
    // dry-grass tufts in drifts over the floor and banks: the fine texture that makes the ground read from 60 m up
    const tuft = [makeTuft({ seed: 3 }), makeTuft({ seed: 8, blades: 6 })], tu = [[], []];
    for (const o of scatterFloor(course, H, { count: Math.round(3600 * S), seed: 15, latMax: 2.6, groves: 130, groveR: 34, accept: (o) => o.pos.y > WATER_Y + 1.2 && flat(o.pos.x, o.pos.z, 0.74) && !inCorridor(o.pos.x, o.pos.y + 2.2, o.pos.z, 1) })) {
      const sc = 1.5 + o.r * 2.6; tu[o.r < 0.5 ? 0 : 1].push({ pos: V3(o.pos.x, o.pos.y - 0.15, o.pos.z), yaw: o.r * 90, scale: V3(sc, sc * (0.8 + 0.6 * ((o.r * 5.9) % 1)), sc), color: tintOf(o.r, 0.3) });
    }
    add(tuft[0], plantMat, tu[0], { receive: false }); add(tuft[1], plantMat, tu[1], { receive: false });
    const cw = [makeCottonwood({ seed: 2 }), makeCottonwood({ seed: 6 })], cwi = [[], []];
    for (const o of scatterFloor(course, H, { count: Math.round(70 * S), seed: 9, latMax: 2.2, groves: 18, groveR: 42, accept: (o) => o.pos.y > WATER_Y + 0.8 && o.pos.y < WATER_Y + 9 && flat(o.pos.x, o.pos.z, 0.88) && !inCorridor(o.pos.x, o.pos.y + 18, o.pos.z, 3) })) {
      const sc = 0.85 + o.r * 0.6; cwi[o.r < 0.5 ? 0 : 1].push({ pos: V3(o.pos.x, o.pos.y - 0.4, o.pos.z), yaw: o.r * 30, scale: V3(sc, sc * (0.9 + 0.3 * ((o.r * 6.1) % 1)), sc), color: tintOf(o.r, 0.14) });
    }
    add(cw[0], plantMat, cwi[0], { receive: false }); add(cw[1], plantMat, cwi[1], { receive: false });
  }
  const boulderItems = [];
  {
    for (const o of scatterFloor(course, H, { count: Math.round(260 * S), seed: 3, latMax: 3.0, groves: 30, groveR: 60, accept: (o) => o.pos.y > WATER_Y - 4 && flat(o.pos.x, o.pos.z, 0.62) })) {
      const s = 2 + o.r * o.r * 11;
      if (inCorridor(o.pos.x, o.pos.y + s * 0.9, o.pos.z, 2)) continue;
      boulderItems.push({ pos: V3(o.pos.x, o.pos.y + s * 0.1, o.pos.z), yaw: o.r * 33, scale: V3(s * (0.8 + o.r * 0.6), s * (0.6 + 0.6 * ((o.r * 7.7) % 1)), s * (1.0 + 0.4 * ((o.r * 3.1) % 1))), color: tintOf(o.r, 0.2) });
    }
    // boulders and slabs embedded in the canyon walls: relief and colour changes in the near field
    for (const o of scatterWall(course, H, { count: Math.round(150 * S), dyMin: -52, dyMax: 130, seed: 12, clear: 18 })) {
      const s = 7 + o.r * o.r * 22;
      boulderItems.push({ pos: o.pos.clone().addScaledVector(o.n, -s * 0.5), up: o.n, yaw: o.r * 50, scale: V3(s * (0.9 + o.r * 0.4), s * (0.5 + 0.4 * ((o.r * 7.3) % 1)), s), color: new THREE.Color(0.72 + o.r * 0.3, 0.62 + o.r * 0.2, 0.6 + o.r * 0.15) });
    }
  }
  {
    const mush = [makeHoodoo({ seed: 2, sides: 10 }), makeHoodoo({ seed: 5, sides: 10 })], mi = [[], []], pil = makeHoodoo({ seed: 4, sides: 12, cap: false }), pi = [];
    for (const o of scatterFloor(course, H, { count: Math.round(60 * S), seed: 8, latMax: 2.4, groves: 12, groveR: 36, accept: (o, fr) => dry(o.pos.y) && flat(o.pos.x, o.pos.z, 0.8) && Math.abs(o.lat) > fr.halfWidth * 0.9 })) {
      const r = 4 + o.r * 6, h = r * (3.4 + 2.2 * ((o.r * 7.1) % 1));
      if (inCorridor(o.pos.x, o.pos.y + h, o.pos.z, 8)) continue;
      mi[o.r < 0.5 ? 0 : 1].push({ pos: V3(o.pos.x, o.pos.y - 1.5, o.pos.z), yaw: o.r * 50, scale: V3(r, h, r), color: tintOf(o.r, 0.16) });
    }
    add(mush[0], rockMat, mi[0], { cast: true }); add(mush[1], rockMat, mi[1], { cast: true });
    for (const o of scatterFloor(course, H, { count: Math.round(22 * S), seed: 14, latMax: 2.6, accept: (o, fr) => flat(o.pos.x, o.pos.z, 0.82) && Math.abs(o.lat) > fr.halfWidth * 1.05 + 20 && o.pos.y < fr.pos.y - 20 })) {
      const r = 9 + o.r * 12, h = 50 + o.r * o.r * 110;
      if (inCorridor(o.pos.x, o.pos.y + h, o.pos.z, 12)) continue;
      pi.push({ pos: V3(o.pos.x, o.pos.y - 6, o.pos.z), yaw: o.r * 70, scale: V3(r, h, r), color: tintOf(o.r, 0.12) });
    }
    // hazard stacks: banded sandstone buttes capped with dark rock, boulders heaped around the foot
    const stacks = course.hazards.filter((h) => h.kind === 'stack');
    for (const h of stacks) {
      const base = H(h.pos.x, h.pos.z) - 8, r = h.radius * 1.08;
      pi.push({ pos: V3(h.pos.x, base, h.pos.z), yaw: h.s, scale: V3(r, h.top - base + 3, r) });
      for (let k = 0; k < 6; k++) { const a = rnd() * 6.283, d = r * (0.9 + rnd() * 0.5), s = 4 + rnd() * 6, x = h.pos.x + Math.cos(a) * d, z = h.pos.z + Math.sin(a) * d; boulderItems.push({ pos: V3(x, H(x, z) + s * 0.1, z), yaw: rnd() * 6, scale: s, color: tintOf(rnd(), 0.2) }); }
    }
    add(pil, rockMat, pi, { cast: true });
  }

  // ---- the mesa tops, seen when the helix climbs and from the overview: cacti, scrub, boulders and mushroom hoodoos along the rims
  {
    const pick = (count, seed, accept) => {
      const r = mulberry32(seed), out = []; let guard = 0;
      while (out.length < count && guard++ < count * 40) {
        const s = r() * L; course.frameAt(s, f);
        const side = r() < 0.5 ? -1 : 1, lat = side * (f.halfWidth + 160 + r() * 800), x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat, y = H(x, z);
        if (y < f.pos.y + 50 || !flat(x, z, 0.9) || (accept && !accept(x, y, z))) continue;
        out.push({ pos: V3(x, y, z), r: r() });
      }
      return out;
    };
    const sag = makeSaguaro({ seed: 11 }), si = pick(Math.round(110 * S), 41).map((o) => { const sc = 1.1 + o.r * 1.1; return { pos: o.pos, yaw: o.r * 50, scale: sc, color: tintOf(o.r, 0.16) }; });
    add(sag, plantMat, si, { receive: false });
    const scr = makeScrub({ seed: 13, lumps: 7 }), sci = pick(Math.round(180 * S), 42).map((o) => { const sc = 3 + o.r * 5; return { pos: o.pos, yaw: o.r * 60, scale: V3(sc, sc * 0.7, sc), color: tintOf(o.r, 0.2) }; });
    add(scr, plantMat, sci, { receive: false });
    const mush = makeHoodoo({ seed: 7, sides: 10 }), mi = pick(Math.round(36 * S), 43).map((o) => { const r = 6 + o.r * 8; return { pos: V3(o.pos.x, o.pos.y - 2, o.pos.z), yaw: o.r * 40, scale: V3(r, r * (3.2 + 2 * ((o.r * 5.7) % 1)), r), color: tintOf(o.r, 0.14) }; });
    add(mush, rockMat, mi, { cast: false });
  }

  // ---- bridge sites: how far the walls stand from the route at a given height
  const rightH = (fr) => V3(fr.right.x, 0, fr.right.z).normalize();
  const reach = (fr, rh, side, y, max = 420) => {
    for (let d = fr.halfWidth * 0.5; d < max; d += 4) if (H(fr.pos.x + rh.x * side * d, fr.pos.z + rh.z * side * d) >= y) return d;
    return -1;
  };
  const framed = (s, br) => { const o = {}; (br ? br.frameAt(s, o) : course.frameAt(s, o)); return o; };
  const placeSpan = (fr, y, sink = 0) => {
    const rh = rightH(fr), lw = reach(fr, rh, -1, y), rw = reach(fr, rh, 1, y);
    if (lw < 0 || rw < 0) return null;
    const mid = (rw - lw) / 2, span = lw + rw + sink * 2;
    return { rh, span, c: V3(fr.pos.x + rh.x * mid, y, fr.pos.z + rh.z * mid), quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rh, UP, new THREE.Vector3().crossVectors(rh, UP))) };
  };

  // the natural arch over the canyon: banded sandstone, golden shafts through its opening, a beacon on the crown
  const shafts = [], shaftDir = V3(-env.sunDir.x, -0.62, -env.sunDir.z).normalize();
  {
    const af = course.frameAt(course.marks.arch, {}), rh = rightH(af), fw = new THREE.Vector3().crossVectors(rh, UP);
    const R = 104, TUBE = 22, geo = makeSandstoneArch({ radius: R, tube: TUBE, seed: 3, segs: 110, sides: 24, period: 8 });
    const base = af.pos.y - 38, quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rh, UP, fw));
    add(geo, rockMat, [{ pos: V3(af.pos.x, base, af.pos.z), quat, scale: 1 }], { cast: true });
    const at = (th, rad, z = 0) => V3(af.pos.x, base, af.pos.z).addScaledVector(rh, Math.cos(th) * rad).addScaledVector(UP, Math.sin(th) * rad).addScaledVector(fw, z);
    for (const sg of [-1, 1]) boulderItems.push({ pos: at(sg > 0 ? 0 : Math.PI, R + 2, 0).add(V3(0, -TUBE * 0.5, 0)), yaw: sg, scale: V3(TUBE * 2.0, TUBE * 1.7, TUBE * 2.3) });      // buttresses under the feet
    glows.push({ pos: at(Math.PI / 2, R + TUBE + 14), color: WARM, size: 70 });
    for (let i = 0; i < 4; i++) shafts.push({ pos: at(Math.PI * (0.38 + 0.08 * i), R + TUBE * 0.6, -30 + i * 12), dir: shaftDir, length: 190, width: 15 + 5 * (i % 2), intensity: 0.85 });
  }

  // a steel truss high over the first esses: its deck sits well above the corridor, so the field flies under it
  {
    const e0 = course.marks.esses;
    for (let s = e0 + 40; s < e0 + 360; s += 14) {
      const fr = framed(s), deckY = fr.pos.y + fr.halfHeight + 26, sp = placeSpan(fr, deckY, 10);
      if (!sp || sp.span > 340) continue;
      const geo = makeTruss({ span: sp.span, depth: 26, width: 12, panels: Math.round(sp.span / 14) });
      add(geo, ironMat, [{ pos: sp.c.clone().setY(deckY), quat: sp.quat, scale: 1 }], { cast: true });
      glows.push({ pos: V3(sp.c.x, deckY + 36, sp.c.z), color: AMBER, size: 26 });
      break;
    }
  }

  // slot canyon: wooden trestles across the dry wash (the corridor floats 18 m above it), rock bridges overhead, light shafts, magenta lanterns, beacons
  const br = course.branches[0];
  if (br) {
    for (const u of [330, 640]) {
      const fr = framed(u, br), floor = H(fr.pos.x, fr.pos.z), deckY = floor + 6.5;
      if (deckY + 3.5 > fr.pos.y - fr.halfHeight - 3) continue;
      const sp = placeSpan(fr, deckY + 1, 6); if (!sp || sp.span > 330) continue;
      add(makeTrestle({ span: sp.span, height: deckY - floor + 10, width: 9, bayLen: 20 }), woodMat, [{ pos: sp.c.clone().setY(deckY), quat: sp.quat, scale: 1 }], { cast: true });
      for (const sg of [-1, 1]) glows.push({ pos: V3(fr.pos.x + sp.rh.x * sg * (sp.span / 2 - 12), deckY + 4, fr.pos.z + sp.rh.z * sg * (sp.span / 2 - 12)), color: AMBER, size: 16 });
    }
    for (const u of [200, 470, 740]) {
      const fr = framed(u, br), rh = rightH(fr);
      for (let yf = fr.pos.y + fr.halfHeight + 6; yf < fr.pos.y + fr.halfHeight + 90; yf += 8) {
        const lw = reach(fr, rh, -1, yf + 10), rw = reach(fr, rh, 1, yf + 10); if (lw < 0 || rw < 0) continue;
        const R = (lw + rw) / 2 + 8, tube = Math.max(10, R * 0.2), top = yf + R - tube * 0.85;
        if (yf + R - tube * 0.9 < fr.pos.y + fr.halfHeight + 12 || R > 130) continue;
        const geo = makeSandstoneArch({ radius: R, tube, seed: 20 + u, segs: 70, sides: 16, period: 6 }), fw = new THREE.Vector3().crossVectors(rh, UP), mid = (rw - lw) / 2;
        const c = V3(fr.pos.x + rh.x * mid, yf, fr.pos.z + rh.z * mid);
        add(geo, rockMat, [{ pos: c, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(rh, UP, fw)), scale: 1 }], { cast: true });
        for (let i = 0; i < 3; i++) shafts.push({ pos: V3(c.x + rh.x * (i - 1) * R * 0.35, top + 8, c.z + rh.z * (i - 1) * R * 0.35), dir: shaftDir, length: 170, width: 12 + 4 * i, intensity: 0.9 });
        for (const sg of [-1, 1]) boulderItems.push({ pos: V3(c.x + rh.x * sg * R, yf - tube * 0.2, c.z + rh.z * sg * R), yaw: u + sg, scale: V3(tube * 1.7, tube * 1.5, tube * 1.9) });
        break;
      }
    }
    const mast = makeMast({ height: 14 }), mi = [];
    for (let u = 40, sd = 1; u < br.length - 20; u += 56, sd = -sd) {
      const fr = framed(u, br), wp = wallPoint(H, fr, sd, fr.pos.y - 14 + rnd() * 24, { from: 0.95, maxLat: 220 });
      if (!wp) continue;
      mi.push({ pos: wp.pos.clone().addScaledVector(wp.n, -1), up: wp.n, yaw: rnd() * 6, scale: 1 });
      glows.push({ pos: wp.pos.clone().addScaledVector(wp.n, 14 * 0.9 + 1.8), color: MAGENTA, size: 18 });
    }
    add(mast, mastMat, mi, { receive: false });
    for (const k of ['slotA', 'slotB']) { const fr = course.frameAt(course.marks[k], {}); glows.push({ pos: V3(fr.pos.x, fr.pos.y + 74, fr.pos.z), color: MAGENTA, size: 84 }); }
  }

  // ---- the spire: a mushroom of caprock on its crown, a beacon you can see from the whole canyon, birds circling it
  {
    const top = H(SPIRE.x, SPIRE.z), hat = makeHoodoo({ seed: 7, sides: 14, cap: true });
    add(hat, rockMat, [{ pos: V3(SPIRE.x, top - 7, SPIRE.z), yaw: 0.6, scale: V3(25, 72, 25) }], { cast: true });
    glows.push({ pos: V3(SPIRE.x, top + 64, SPIRE.z), color: WARM, size: 90 });
    course.addPart(createBirds([
      { center: V3(SPIRE.x, top - 40, SPIRE.z), radius: [170, 240], height: [-150, 40], count: Math.round(26 * Math.max(0.5, S)), speed: 22 },
      { center: V3(SPIRE.x, top - 90, SPIRE.z), radius: [260, 340], height: [-120, 30], count: Math.round(14 * Math.max(0.5, S)), speed: 26, dir: -1 },
    ], { size: 4 }));
    const lt = course.frameAt(course.marks.loopTop, {}); glows.push({ pos: V3(lt.pos.x, lt.pos.y + 64, lt.pos.z), color: new THREE.Color(1.8, 1.3, 0.8), size: 60 });
  }
  add(makeRockGeometry({ seed: 5, detail: 2, rough: 0.38, stretch: [1, 0.8, 1], color: 0xd08a5a, color2: 0x94563a }), rockMat, boulderItems, { receive: true });
  {                                                                          // white water: foam streaks drifting down the flooded reaches, collars round everything that stands in the river
    const rings = [];
    for (const h of course.hazards) if (h.kind === 'stack' && H(h.pos.x, h.pos.z) < WATER_Y - 0.5) rings.push({ x: h.pos.x, z: h.pos.z, r: h.radius * 1.08 });
    for (const b of boulderItems) if (!b.up && H(b.pos.x, b.pos.z) < WATER_Y - 0.3) rings.push({ x: b.pos.x, z: b.pos.z, r: (typeof b.scale === 'number' ? b.scale : b.scale.x) * 0.95 });
    course.addPart(createRapids(course, game, H, { level: WATER_Y, rings }));
  }
  course.addPart(createGlowPoints(glows));
  course.addPart({ dispose() { disposables.forEach((d) => d.dispose()); } });

  // ---- golden shafts at the esses and over the Eye, dust devils on the flats
  {
    for (const [k, off, n] of [['esses', 80, 3], ['esses', 260, 2], ['eyeLead', 0, 3], ['bend', 0, 2]]) {
      const fr = course.frameAt(course.marks[k] + off, {}), rh = rightH(fr);
      for (let i = 0; i < n; i++) shafts.push({ pos: V3(fr.pos.x + rh.x * (i - (n - 1) / 2) * 70, fr.pos.y + fr.halfHeight + 90, fr.pos.z + rh.z * (i - (n - 1) / 2) * 70), dir: shaftDir, length: 230, width: 16 + 4 * (i % 2), intensity: 0.75 });
    }
    if (shafts.length) course.addPart(createShafts(shafts, { color: new THREE.Color(1.0, 0.74, 0.42) }));
    const dd = [], r3 = mulberry32(0xd37);
    for (let tries = 0; tries < 400 && dd.length < Math.max(3, Math.round(7 * S)); tries++) {
      const s = r3() * L; course.frameAt(s, f);
      const lat = (r3() < 0.5 ? -1 : 1) * f.halfWidth * (0.5 + r3() * 0.9), x = f.pos.x + f.right.x * lat, z = f.pos.z + f.right.z * lat, y = H(x, z);
      if (!dry(y) || !flat(x, z, 0.93) || dd.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 500)) continue;
      dd.push({ pos: V3(x, y, z), height: 70 + r3() * 60, radius: 18 + r3() * 14, sway: 8 + r3() * 8 });
    }
    if (dd.length) course.addPart(createDustDevils(dd, { color: new THREE.Color(0.96, 0.62, 0.38), sun: env.sunDir }));
  }

  // ---- sky puffs + low dust banks (which thin out when the camera climbs for an overview)
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
  const puffs = createCloudPuffs(env, game, list);
  course.addPart(puffs);
  course.addPart(createAltitudeFog({ puffs: [puffs], refY: course.frameAt(0, {}).pos.y, from: 300, to: 1500, fogKeep: 0.3, puffKeep: 0 }));
}
