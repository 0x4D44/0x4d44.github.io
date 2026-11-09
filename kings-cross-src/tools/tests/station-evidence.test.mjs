import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { barlowPlan, barlowSection, landmarkPlans, landmarkSeats, REPLACED_BUILDING_IDS, tunnelMouths } from '../../core/landmarks.ts';
import { buildingsUnderStation, concourseCanopy, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../../core/station.ts';
import { railSegments } from '../../core/scene.ts';
import { createTerrain } from '../../core/terrain.ts';
import { addCity } from '../../web/src/city.ts';
import { buildConcourse } from '../../web/src/concourse.ts';
import { addKxCentral, KXCENTRAL_OSM_IDS } from '../../web/src/kxcentral.ts';
import { landmarkGeometry } from '../../web/src/landmarks.ts';
import { addPortals, portalHole } from '../../web/src/portals.ts';
import { buildBufferStops, buildTrack } from '../../web/src/track.ts';
import { buildFurniture, buildPlatforms } from '../../web/src/furniture.ts';
import { buildShed } from '../../web/src/shed.ts';
import { addTerrain } from '../../web/src/world.ts';
import * as evidence from '../evidence.mjs';

const data = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const cityData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-city.json', import.meta.url), 'utf8'));
const terrainData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-terrain.json', import.meta.url), 'utf8'));

function barlowTargets(plan, seatY = 0) {
  const margin = (plan.width - plan.span) / 2;
  const section = barlowSection(24, plan.span, plan.rise);
  const point = (u, v, y) => {
    const [x, z] = shedToWorld(plan, u, v);
    return new THREE.Vector3(x, y, z);
  };
  const arch = section.filter((_, i) => i % 2 === 0).map(p => point(margin + p.x, .15, p.y + seatY));
  const eastFlank = section[20];
  const length = [.15, plan.barlowLength / 2, plan.barlowLength - .15]
    .map(v => point(margin + eastFlank.x, v, eastFlank.y + seatY));
  return { arch, length };
}

function stationSceneOccluders() {
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
  addCity(scene, data, cityData, { hidden, terrain });
  scene.add(buildShed(layout));
  if (station) scene.add(buildConcourse(canopy, station.pts, layout, data.buildings.filter(b => b.id === 46821177).map(b => b.pts)));
  scene.add(buildBufferStops(data, layout));
  scene.updateMatrixWorld(true);
  return { occluders: scene.children, ground: terrain };
}

function cameraFor(camera) {
  const result = new THREE.PerspectiveCamera(camera.fov ?? 50, 1280 / 800, camera.near ?? .1, 9000);
  result.position.set(...camera.pos);
  result.lookAt(new THREE.Vector3(...camera.target));
  result.updateMatrixWorld(true);
  return result;
}

function visibleTarget(camera, target, occluders) {
  const ndc = target.clone().project(camera);
  const inFrame = Math.abs(ndc.x) < .96 && Math.abs(ndc.y) < .96 && ndc.z > -1 && ndc.z < 1;
  const delta = target.clone().sub(camera.position);
  const hit = new THREE.Raycaster(camera.position, delta.clone().normalize(), 0, delta.length() + .1)
    .intersectObjects(occluders, true)[0];
  return {
    inFrame,
    hit,
    visible: inFrame && hit?.object.name.startsWith('barlow-') === true && Math.abs(hit.distance - delta.length()) < .5,
  };
}

test('Barlow oblique evidence frames the south arch and long slate flank clear of the Midland Grand', () => {
  assert.equal(typeof evidence.stationCameras, 'function');
  const plan = barlowPlan(data), cameras = evidence.stationCameras(data);
  const oldCamera = cameras['st-pancras-shed'];
  const newCamera = cameras['st-pancras-shed-oblique'];
  assert.ok(newCamera, 'keep the original context shot and add a Barlow-specific oblique');
  const { occluders, ground } = stationSceneOccluders();
  const targets = barlowTargets(plan, landmarkSeats(landmarkPlans(data), ground).barlow.y);
  const old = cameraFor(oldCamera), oblique = cameraFor(newCamera);
  const oldArch = targets.arch.map(target => visibleTarget(old, target, occluders));
  assert.ok(oldArch.some(result => result.hit?.object.name.startsWith('midland-grand-')), 'the old context camera records its hotel obstruction');
  const arch = targets.arch.map(target => visibleTarget(oblique, target, occluders));
  assert.ok(arch.every(result => result.inFrame), 'the arch spans the frame');
  assert.ok(arch.filter(result => result.visible).length >= 9, 'most of the actual arch curve is unobstructed');
  assert.ok(arch[Math.floor(arch.length / 2)]?.visible, 'the arch crown is visible');
  const length = targets.length.map(target => visibleTarget(oblique, target, occluders));
  assert.ok(length.every(result => result.visible), 'south end, middle and north end of the historic slate flank are visible');
  assert.deepEqual(evidence.cameraBuildingCollisions({ oblique: newCamera }, evidence.cityBuildings(data)), [], 'camera clears city building footprints');
  assert.match(newCamera.source, /barlowPlan/);
});

test('platform eye evidence keeps the north-facing view and adds a south-facing view on the same platform', () => {
  const cameras = evidence.stationCameras(data);
  const north = cameras['platform-eye'], south = cameras['platform-eye-south'];
  assert.ok(north && south);
  assert.deepEqual(south.pos, north.pos);
  const plan = shedLayout(data);
  const northFrame = worldToShed(plan, [north.target[0], north.target[2]]);
  const southFrame = worldToShed(plan, [south.target[0], south.target[2]]);
  const eyeFrame = worldToShed(plan, [north.pos[0], north.pos[2]]);
  assert.ok(northFrame.v > eyeFrame.v);
  assert.ok(southFrame.v < eyeFrame.v);
});

test('serialized slate evidence keeps the glass callback, forces physical cladding and restores exact state on success or capture error', async () => {
  assert.equal(typeof evidence.withSolidSlateEvidence, 'function');
  const material = { opacity: .42, depthWrite: false, transparent: true };
  const glass = { opacity: .36 };
  const original = function(camera) {
    this.material.opacity = .5;
    this.material.depthWrite = false;
    glass.opacity = camera.glassOpacity;
  };
  const mesh = { name: 'shed-roof-cladding', material, onBeforeRender: original };
  const run = capture => runInNewContext(`(${evidence.withSolidSlateEvidence.toString()})(mesh, capture)`, { mesh, capture });
  await run(() => {
    mesh.onBeforeRender({ glassOpacity: .73 });
    assert.equal(material.opacity, 1);
    assert.equal(material.depthWrite, true);
    assert.equal(glass.opacity, .73, 'the original callback still updates roof glass');
    return 'captured';
  });
  assert.equal(material.opacity, .42);
  assert.equal(material.depthWrite, false);
  assert.equal(material.transparent, true);
  assert.equal(mesh.onBeforeRender, original);
  await assert.rejects(run(() => { throw new Error('synthetic capture failure'); }), /synthetic capture failure/);
  assert.equal(material.opacity, .42);
  assert.equal(material.depthWrite, false);
  assert.equal(mesh.onBeforeRender, original);
});

test('physical slate shots await capture inside the override and restore after capture failure', async () => {
  assert.equal(typeof evidence.captureEvidencePng, 'function');
  const order = [];
  let roof = 'auto';
  const capture = async () => { order.push('capture'); assert.equal(roof, 'solid slate (evidence override)'); await Promise.resolve(); return 'png'; };
  const prepare = async () => { order.push('prepare'); await Promise.resolve(); roof = 'solid slate (evidence override)'; };
  const restore = async () => { order.push('restore'); await Promise.resolve(); roof = 'auto'; };
  assert.equal(await evidence.captureEvidencePng('solid slate (evidence override)', { prepare, capture, restore }), 'png');
  assert.deepEqual(order, ['prepare', 'capture', 'restore']);
  assert.equal(roof, 'auto');
  await assert.rejects(evidence.captureEvidencePng('solid slate (evidence override)', {
    prepare, capture: async () => { order.push('failed capture'); throw new Error('capture failed'); }, restore,
  }), /capture failed/);
  assert.equal(roof, 'auto');
});

test('roof-above and front-oblique slate pairs share their context cameras and label auto versus solid evidence', async () => {
  assert.equal(typeof evidence.runStationEvidenceShots, 'function');
  const cameras = evidence.stationCameras(data);
  const shots = [];
  await evidence.runStationEvidenceShots(cameras,
    async (axis, name, camera, extra) => { shots.push({ axis, name, camera, extra }); },
    async (_axis, _name, capture) => capture());
  for (const cameraName of ['roof-above', 'front-oblique']) {
    const context = shots.find(shot => shot.name === cameraName);
    const solid = shots.find(shot => shot.name === `${cameraName}-solid-slate`);
    assert.equal(context?.camera, cameras[cameraName]);
    assert.equal(solid?.camera, cameras[cameraName]);
    assert.equal(context?.extra.roofMaterialEvidence, 'auto');
    assert.equal(solid?.extra.roofMaterialEvidence, 'solid slate (evidence override)');
  }
  assert.ok(shots.some(shot => shot.name === 'st-pancras-shed-oblique'));
  assert.ok(shots.some(shot => shot.name === 'platform-eye-south'));
});
