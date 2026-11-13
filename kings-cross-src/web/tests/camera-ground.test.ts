// ALM-BUG-FLU-00020: the reader's orbit moves never carry the camera under the ground.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_CLEARANCE, bindGroundClamp, clampToGround } from '../src/camera-ground.ts';
import type { GroundAt } from '../src/camera-ground.ts';

// Synthetic ground: flat at 0 west of x = 50, a ramp up to a 60 m plateau from x = 100 (a hill beside low ground, as at Perth).
const hill: GroundAt = (x) => Math.max(0, Math.min(60, (x - 50) * 1.2));

function rig(eye: [number, number, number], target: [number, number, number]) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  camera.position.set(...eye);
  const controls = new OrbitControls(camera); // not connected: the moves are driven below, as its pointer handlers drive them
  (controls as unknown as { domElement: object }).domElement = { clientWidth: 800, clientHeight: 600 }; // _pan's screen scale
  controls.target.set(...target);
  controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 8; controls.maxDistance = 3000; // main.ts's limits
  controls.update();
  const unbind = bindGroundClamp(controls, () => hill);
  const lowest = { margin: Infinity, target: Infinity };
  const watch = () => {
    lowest.margin = Math.min(lowest.margin, camera.position.y - hill(camera.position.x, camera.position.z));
    lowest.target = Math.min(lowest.target, controls.target.y - hill(controls.target.x, controls.target.z));
  };
  // One reader gesture: 'start', `steps` moves each followed by update() (as onMouseMove does), 'end'.
  const gesture = (steps: number, move: (c: typeof controls) => void) => {
    controls.dispatchEvent({ type: 'start' });
    for (let i = 0; i < steps; i++) { camera.updateMatrixWorld(); move(controls); controls.update(); watch(); }
    controls.dispatchEvent({ type: 'end' });
  };
  return { camera, controls, gesture, lowest, unbind };
}
type Driven = OrbitControls & { _pan(dx: number, dy: number): void; _rotateUp(a: number): void; _rotateLeft(a: number): void; _dollyIn(s: number): void; _dollyOut(s: number): void };

test('panning from low ground into a hill keeps the target on the ground and the camera above it', () => {
  const r = rig([0, 20, 40], [0, 1, 0]);
  r.gesture(200, c => (c as Driven)._pan(-12, 0)); // screen-left drag: the view slides east, into the hill
  assert.ok(r.camera.position.x > 120, `the pan reached the plateau (x ${r.camera.position.x.toFixed(1)})`);
  assert.ok(r.lowest.margin >= CAMERA_CLEARANCE - 1e-9, `camera margin over ground ${r.lowest.margin.toFixed(2)} m`);
  assert.ok(r.lowest.target >= -1e-9, `target margin over ground ${r.lowest.target.toFixed(2)} m`);
});

test('rotating down toward the horizon over a hill behind the target stops the camera above the hill', () => {
  const r = rig([150, 90, 0], [0, 0, 0]); // the target on the low ground, the camera out over the plateau
  r.gesture(120, c => (c as Driven)._rotateUp(-0.02));
  r.gesture(60, c => (c as Driven)._rotateLeft(0.01)); // and swing round the target along the slope
  assert.ok(r.lowest.margin >= CAMERA_CLEARANCE - 1e-9, `camera margin over ground ${r.lowest.margin.toFixed(2)} m`);
  assert.ok(r.camera.position.y >= r.controls.target.y, 'the camera never ends below its target');
});

test('zooming in and out across the hill keeps the clearance', () => {
  const r = rig([120, 64, 10], [40, 0, 0]);
  r.gesture(40, c => (c as Driven)._dollyOut(1.1));
  r.gesture(80, c => (c as Driven)._dollyIn(1.1));
  r.gesture(80, c => (c as Driven)._rotateUp(-0.02));
  assert.ok(r.lowest.margin >= CAMERA_CLEARANCE - 1e-9, `camera margin over ground ${r.lowest.margin.toFixed(2)} m`);
});

test('a programmatic pose (no start event: landing views, station flights, evidence close-ups) is left exactly where it was put', () => {
  const r = rig([0, 20, 40], [0, 1, 0]);
  r.camera.position.set(110, 1.5, 12); r.controls.target.set(112, 0.4, 0); // under the plateau, as a tool's bogie close-up might sit
  r.controls.update();
  assert.ok(r.camera.position.distanceTo(new THREE.Vector3(110, 1.5, 12)) < 1e-9, `camera stays at ${r.camera.position.toArray()}`);
  assert.ok(r.controls.target.distanceTo(new THREE.Vector3(112, 0.4, 0)) < 1e-9, `target stays at ${r.controls.target.toArray()}`);
});

test('after unbinding, the reader can again drive under the ground (the clamp is the only guard)', () => {
  const r = rig([0, 20, 40], [0, 1, 0]);
  r.unbind();
  r.gesture(200, c => (c as Driven)._pan(-12, 0));
  assert.ok(r.lowest.margin < 0, 'without the clamp the pan goes under the hill');
});

test('clampToGround lifts the target with the camera, so the view angle holds', () => {
  const eye = new THREE.Vector3(120, 70, 0), target = new THREE.Vector3(110, 50, 0);
  assert.equal(clampToGround(eye, target, hill), true);
  assert.deepEqual(target.toArray(), [110, 60, 0]);
  assert.deepEqual(eye.toArray(), [120, 80, 0]);
  assert.equal(clampToGround(eye, target, hill), false, 'already clear: nothing moves');
});
