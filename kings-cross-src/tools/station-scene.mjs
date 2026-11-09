// The station's static scene built in Node (no browser, no GPU), and a ray-based look at what a
// fixed evidence camera can see from where it stands. The same builders as web/src/main.ts, minus
// trains, signals, labels and the sky, so a camera can be checked before it is ever captured.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { landmarkPlans, landmarkSeats, REPLACED_BUILDING_IDS, tunnelMouths } from '../core/landmarks.ts';
import { buildingsUnderStation, concourseCanopy, shedLayout, stationBuilding } from '../core/station.ts';
import { railSegments } from '../core/scene.ts';
import { createTerrain } from '../core/terrain.ts';
import { addCity } from '../web/src/city.ts';
import { buildConcourse } from '../web/src/concourse.ts';
import { addKxCentral, KXCENTRAL_OSM_IDS } from '../web/src/kxcentral.ts';
import { landmarkGeometry } from '../web/src/landmarks.ts';
import { addPortals, portalHole } from '../web/src/portals.ts';
import { buildBufferStops, buildTrack } from '../web/src/track.ts';
import { buildFurniture, buildPlatforms } from '../web/src/furniture.ts';
import { buildShed } from '../web/src/shed.ts';
import { addTerrain } from '../web/src/world.ts';

const dataUrl = name => new URL(`../web/src/data/${name}`, import.meta.url);
const readJson = name => JSON.parse(readFileSync(dataUrl(name), 'utf8'));
let cached;
/** The three committed data files the station scene needs, parsed once. */
export function stationData() {
  return cached ??= { data: readJson('kx-track.json'), city: readJson('kx-city.json'), terrain: readJson('kx-terrain.json') };
}

/**
 * Build every static part of the page's scene. Landmarks get a double-sided basic material and
 * keep their part names (`midland-grand-<part>`), as the station evidence tests expect.
 * @returns {{scene: THREE.Scene, occluders: THREE.Object3D[], ground: object}} `ground` is the terrain read off the drawn mesh.
 */
export function buildStationScene({ data, city, terrain: terrainData } = stationData()) {
  const scene = new THREE.Scene();
  const layout = shedLayout(data), canopy = concourseCanopy(data), station = stationBuilding(data);
  scene.add(buildTrack(data, layout), buildPlatforms(data, layout), buildFurniture(data, layout));
  const field = createTerrain(terrainData);
  const terrain = addTerrain(scene, field, { exclude: portalHole(tunnelMouths(data)), rails: railSegments(data) }).ground;
  addPortals(scene, data, { terrain });
  const plans = landmarkPlans(data), seats = landmarkSeats(plans, terrain);
  const landmarks = landmarkGeometry(plans, seats).map((parts, index) => {
    const name = ['great-northern-hotel', 'midland-grand', 'barlow'][index];
    const group = new THREE.Group();
    for (const [part, batch] of Object.entries(parts)) {
      const mesh = new THREE.Mesh(batch.build(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.name = `${name}-${part}`;
      group.add(mesh);
    }
    group.updateMatrixWorld(true);
    return group;
  });
  scene.add(...landmarks);
  addKxCentral(scene, data, { terrain });
  const hidden = new Set([...buildingsUnderStation(data, layout, canopy), ...REPLACED_BUILDING_IDS, ...KXCENTRAL_OSM_IDS]);
  if (station) hidden.add(station.id);
  addCity(scene, data, city, { hidden, terrain });
  scene.add(buildShed(layout));
  if (station) scene.add(buildConcourse(canopy, station.pts, layout, data.buildings.filter(b => b.id === 46821177).map(b => b.pts)));
  scene.add(buildBufferStops(data, layout));
  scene.updateMatrixWorld(true);
  return { scene, occluders: scene.children, ground: terrain };
}

/** The capture lens: 1280 x 800 and the camera's own vertical fov. */
export function lensFor(c, aspect = 1280 / 800) {
  const camera = new THREE.PerspectiveCamera(c.fov ?? 50, aspect, c.near ?? .1, 9000);
  camera.position.set(...c.pos);
  camera.lookAt(new THREE.Vector3(...c.target));
  camera.updateMatrixWorld(true);
  return camera;
}

/** A hit counts as geometry unless it is see-through glass or an invisible helper. */
const solid = hit => {
  if (!hit.object.isMesh || hit.object.visible === false) return false;
  const m = Array.isArray(hit.object.material) ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
  return !(m && m.visible !== false && m.transparent && m.opacity < .9) && m?.visible !== false;
};

/**
 * What a camera can see from where it stands. Casts a `grid` x `grid` fan of rays across the central
 * 80% of the frame, plus six axis probes and, when the camera names a `subject`, a 3 x 3 cluster
 * around the line to it. Only solid triangles count (see-through glass does not).
 *
 *  - `nearBlocked`: share of the fan whose first hit is closer than `nearM`. Above 0.5 the lens is
 *    pressed against something or standing inside it ("more than half occluded").
 *  - `contact`: nearest hit of any probe, metres. Under `contactM` the eye is touching geometry.
 *  - `subject`: share of the cluster that stops short of the subject (a hit more than `slackM`
 *    nearer than the subject is something standing in front of it). Above 0.5 the subject is occluded.
 */
export function viewClearance(c, occluders, ground, { grid = 7, nearM = 2, contactM = .3, slackM = 3 } = {}) {
  const lens = lensFor(c);
  const origin = lens.position.clone();
  const raycaster = new THREE.Raycaster();
  raycaster.camera = lens;
  const firstSolid = direction => {
    raycaster.set(origin, direction);
    return raycaster.intersectObjects(occluders, true).find(solid) ?? null;
  };
  const ndc = (x, y) => new THREE.Vector3(x, y, .5).unproject(lens).sub(origin).normalize();
  const fan = [];
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) fan.push(ndc(.8 * (2 * i / (grid - 1) - 1), .8 * (2 * j / (grid - 1) - 1)));
  const hits = fan.map(firstSolid);
  const distances = hits.map(h => h?.distance ?? Infinity);
  const probes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(d => firstSolid(new THREE.Vector3(...d)));
  const contact = Math.min(...distances, ...probes.map(h => h?.distance ?? Infinity));
  const sorted = distances.filter(Number.isFinite).sort((p, q) => p - q);
  const result = {
    eyeAboveGround: c.pos[1] - ground.heightAt(c.pos[0], c.pos[2]),
    nearBlocked: distances.filter(d => d < nearM).length / distances.length,
    openToSky: distances.filter(d => d === Infinity).length / distances.length,
    medianHitM: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    contactM: contact,
    subject: null,
  };
  if (c.subject) {
    const target = new THREE.Vector3(...c.subject), line = target.clone().sub(origin), dist = line.length();
    const base = line.clone().normalize();
    const right = new THREE.Vector3().crossVectors(base, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, base).normalize();
    const cluster = [];
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) cluster.push(base.clone().addScaledVector(right, a * .01).addScaledVector(up, b * .01).normalize());
    const stops = cluster.map(d => firstSolid(d)).map(h => h?.distance ?? Infinity);
    const blocked = stops.filter(d => d < dist - slackM).length / stops.length;
    result.subject = { distanceM: dist, blocked, nearestHitM: Math.min(...stops) };
  }
  return result;
}

/** Every reason a camera's evidence is void, as short strings; empty when it is clear. */
export function clearanceFaults(name, v, { minEye = 0.5 } = {}) {
  const faults = [];
  if (v.eyeAboveGround < minEye && v.eyeAboveGround > -Infinity) faults.push(`${name}: eye ${v.eyeAboveGround.toFixed(2)} m above the ground (needs at least ${minEye} m, or it is under the terrain)`);
  if (v.contactM < .3) faults.push(`${name}: eye ${v.contactM.toFixed(2)} m from solid geometry (inside or touching it)`);
  if (v.nearBlocked > .5) faults.push(`${name}: ${(v.nearBlocked * 100).toFixed(0)}% of the frame is blocked within 2 m (more than half occluded)`);
  if (v.subject && v.subject.blocked > .5) faults.push(`${name}: its subject is hidden for ${(v.subject.blocked * 100).toFixed(0)}% of sight lines (something solid stands ${v.subject.nearestHitM.toFixed(1)} m out of ${v.subject.distanceM.toFixed(1)} m)`);
  return faults;
}
