// tools/station-scene.mjs: the ray-based clearance guard for fixed evidence cameras. A synthetic scene pins the rules; the real
// station then proves that no fixed camera stands inside geometry or looks at the back of a wall.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { shedLayout, shedToWorld } from '../../core/station.ts';
import { TOWER_SIZE } from '../../web/src/shed.ts';
import { camerasToCheck, clearanceOptions, main as clearanceMain } from '../camera-clearance.mjs';
import { ELEMENT_VIEWS, stationCameras } from '../evidence.mjs';
import { buildStationScene, clearanceFaults, lensFor, stationData, viewClearance } from '../station-scene.mjs';

const flat = { heightAt: () => 0 };
const eye = { pos: [0, 1.7, 0], target: [0, 1.7, -10], fov: 50 };
/** A 20 x 10 m wall across the line of sight, `distance` metres ahead of the eye. */
const wall = (distance, material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 10, .2), material);
  mesh.position.set(0, 1.7, -distance);
  mesh.updateMatrixWorld(true);
  return mesh;
};
const faultsOf = (camera, occluders, ground = flat) => clearanceFaults('probe', viewClearance(camera, occluders, ground));

test('the capture lens is the pack\'s 1280 x 800 frame with the camera\'s own field of view', () => {
  const lens = lensFor(eye);
  assert.equal(lens.fov, 50);
  assert.equal(lens.aspect, 1.6);
  assert.equal(lensFor({ ...eye, fov: undefined }).fov, 50, 'a camera with no fov takes the page default');
  const ahead = new THREE.Vector3(0, 1.7, -10).project(lens);
  assert.ok(Math.abs(ahead.x) < 1e-9 && Math.abs(ahead.y) < 1e-9, 'the target is at the centre of the frame');
});

test('an open view has no faults and reports the sky', () => {
  const clear = viewClearance(eye, [], flat);
  assert.equal(clear.nearBlocked, 0);
  assert.equal(clear.openToSky, 1);
  assert.equal(clear.contactM, Infinity);
  assert.equal(clear.medianHitM, null);
  assert.equal(clear.eyeAboveGround, 1.7);
  assert.deepEqual(clearanceFaults('open', clear), []);
});

test('a wall pressed to the lens is a fault, and a wall a few metres off is not', () => {
  const near = viewClearance(eye, [wall(1.5)], flat);
  assert.equal(near.nearBlocked, 1);
  assert.ok(Math.abs(near.contactM - 1.4) < 1e-6, `contact ${near.contactM}`);
  assert.deepEqual(faultsOf(eye, [wall(1.5)]).map(f => f.replace(/\d+%/, 'N%')), ['probe: N% of the frame is blocked within 2 m (more than half occluded)']);
  assert.deepEqual(faultsOf(eye, [wall(6)]), [], 'a wall 6 m ahead is a view of a wall, not a blocked lens');
  const inside = faultsOf(eye, [wall(.3)]);
  assert.equal(inside.length, 2, 'touching the wall also fills the frame');
  assert.match(inside[0], /from solid geometry \(inside or touching it\)/);
  assert.match(inside[1], /more than half occluded/);
});

test('the eye must stand above the ground, not in it', () => {
  assert.deepEqual(faultsOf({ ...eye, pos: [0, .6, 0], target: [0, .6, -10] }, []), []);
  const low = faultsOf({ ...eye, pos: [0, .2, 0], target: [0, .2, -10] }, []);
  assert.equal(low.length, 1);
  assert.match(low[0], /eye 0\.20 m above the ground \(needs at least 0\.5 m, or it is under the terrain\)/);
  const buried = faultsOf(eye, [], { heightAt: () => 3 });
  assert.match(buried[0], /eye -1\.30 m above the ground/);
  assert.deepEqual(clearanceFaults('hill', { eyeAboveGround: .4, contactM: 5, nearBlocked: 0, subject: null }, { minEye: .3 }), [], 'the minimum is a parameter');
});

test('a subject hidden behind something solid is a fault, one with a wall just in front of it is not', () => {
  const looking = { ...eye, subject: [0, 1.7, -10] };
  const hidden = viewClearance(looking, [wall(5)], flat);
  assert.equal(hidden.subject.blocked, 1);
  assert.ok(Math.abs(hidden.subject.distanceM - 10) < 1e-9);
  assert.ok(Math.abs(hidden.subject.nearestHitM - 4.9) < 1e-6);
  assert.match(clearanceFaults('probe', hidden).join(), /its subject is hidden for 100% of sight lines \(something solid stands 4\.9 m out of 10\.0 m\)/);
  assert.deepEqual(faultsOf(looking, [wall(9.5)]), [], 'a hit within 3 m of the subject is the subject\'s own surface');
  assert.equal(viewClearance(eye, [wall(5)], flat).subject, null, 'a camera that names no subject has none');
});

test('only solid triangles count: glass, hidden meshes and invisible materials are looked through', () => {
  const glass = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: .4 });
  assert.deepEqual(faultsOf(eye, [wall(1.5, glass)]), [], 'see-through glass');
  const faint = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: .95 });
  assert.equal(faultsOf(eye, [wall(1.5, faint)]).length, 1, 'a nearly opaque transparent material still blocks');
  const hiddenMesh = wall(1.5); hiddenMesh.visible = false;
  assert.deepEqual(faultsOf(eye, [hiddenMesh]), [], 'an invisible helper');
  const invisibleMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false });
  assert.deepEqual(faultsOf(eye, [wall(1.5, invisibleMaterial)]), [], 'a material that is not drawn');
  const group = new THREE.Group(); group.add(wall(1.5)); group.updateMatrixWorld(true);
  assert.equal(faultsOf(eye, [group]).length, 1, 'meshes inside groups are found');
});

test('the real station scene: the clock tower view is clear, and the same aim one metre off the tower\'s south face is a wall in the lens', () => {
  const { data } = stationData();
  const cameras = stationCameras(data);
  const { occluders, ground } = buildStationScene();
  assert.ok(occluders.length >= 10, 'the track, platforms, terrain, city, shed and concourse are all in the scene');
  const tower = cameras['tower-close'];
  assert.deepEqual(clearanceFaults('tower-close', viewClearance(tower, occluders, ground, { grid: 4 })), []);
  const s = shedLayout(data), [x, z] = shedToWorld(s, s.width / 2, -(TOWER_SIZE + .15) - 1);
  const pressed = clearanceFaults('tower-close-moved', viewClearance({ ...tower, pos: [x, tower.pos[1], z] }, occluders, ground, { grid: 4 }));
  assert.ok(pressed.some(f => /more than half occluded|inside or touching/.test(f)), `pressed against the tower: ${pressed.join(' | ')}`);
});

test('camera-clearance takes the same view names as the evidence pack and refuses the rest', () => {
  assert.deepEqual(clearanceOptions([]), { views: 'station', grid: 7, help: false });
  assert.deepEqual(clearanceOptions(['--views', 'kx-front', '--grid', '4']), { views: 'kx-front', grid: 4, help: false });
  for (const args of [['--views'], ['--views', 'a', '--views', 'b'], ['--grid', '1'], ['--grid', '16'], ['--grid', '3.5'], ['--grid', 'x'], ['--wat']]) assert.throws(() => clearanceOptions(args), /grid|views|unknown/, args.join(' '));
  const { data } = stationData();
  const cameras = stationCameras(data);
  assert.deepEqual(camerasToCheck('tower-close', cameras).map(([name]) => name), ['tower-close']);
  assert.deepEqual(camerasToCheck('kx-front', cameras).map(([name]) => name), ELEMENT_VIEWS['kx-front'].filter(name => cameras[name]));
  const everything = camerasToCheck('station', cameras).map(([name]) => name);
  assert.ok(everything.includes('canal-lock') && everything.includes('overview'));
  assert.ok(!everything.includes('top') && !everything.includes('side'), 'the 10 m grid cameras are 3 km out and are not checked');
  assert.deepEqual(camerasToCheck(undefined, cameras).map(([name]) => name), everything.sort((a, b) => Object.keys(cameras).indexOf(a) - Object.keys(cameras).indexOf(b)));
  assert.throws(() => camerasToCheck('no-such-view', cameras), /unknown view or element: no-such-view/);
});

test('camera-clearance exits 0 for a clear camera and 2 for a bad view, saying why', async () => {
  const lines = [];
  assert.equal(await clearanceMain(['--views', 'tower-close', '--grid', '4'], line => lines.push(line)), 0);
  assert.match(lines[0], /^clear  tower-close\s+eye 2\d\.\d m above ground/);
  assert.equal(lines.at(-1), '1 cameras checked, 0 faults');
  await assert.rejects(clearanceMain(['--views', 'no-such-view'], () => {}), /unknown view or element: no-such-view/);
  const help = []; assert.equal(await clearanceMain(['--help'], line => help.push(line)), 0); assert.match(help[0], /camera-clearance/);
});
