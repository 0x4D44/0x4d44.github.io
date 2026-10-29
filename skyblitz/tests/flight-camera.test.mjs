// Camera rig + input unit tests (headless). Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/flight-camera.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getAircraft } from '../src/craft/roster.js';
import { createFlightState, resetFlightState, stepFlight, addBoostMeter } from '../src/flight/flight.js';
import { createCameraRig } from '../src/flight/camera.js';
import { createControls } from '../src/controls.js';

const DT = 1 / 60;
function setup(mode = 'chase', craft = 'falcon') {
  const spec = getAircraft(craft), fs = createFlightState(spec);
  resetFlightState(fs, new THREE.Vector3(0, 300, 0), new THREE.Quaternion(), fs.params.cruise);
  const racer = { spec, flight: fs, controls: createControls(), render: { pos: fs.pos.clone(), quat: fs.quat.clone() }, prev: { pos: fs.pos.clone(), quat: fs.quat.clone() }, place: 1, finished: false };
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.5, 8000);
  const game = { camera, settings: { shake: 1 }, player: racer, race: { state: 'racing', racers: [racer] }, course: { groundHeight: () => 250 }, events: { on() {}, emit() {} }, state: 'race' };
  const rig = createCameraRig(game); rig.reset(racer, mode);
  return { fs, racer, camera, game, rig };
}
function frame(S, c, dtRender = DT) {
  S.racer.prev.pos.copy(S.fs.pos); S.racer.prev.quat.copy(S.fs.quat);
  stepFlight(S.fs, c, DT, { assist: 'standard' });
  S.racer.render.pos.copy(S.fs.pos); S.racer.render.quat.copy(S.fs.quat);
  S.rig.update(dtRender, S.game, 1);
}

test('chase camera sits behind and above, finite through a loop/roll sequence, never below ground + margin', () => {
  const S = setup(); const c = createControls();
  const script = [[1, {}], [2, { roll: 1 }], [3.5, { pitch: 1 }], [1, { barrel: 1 }], [2, { pitch: -1 }], [2, { boost: true }]];
  addBoostMeter(S.fs, 100);
  let minClear = 1e9, maxFov = 0, minFov = 1e9, nan = false;
  for (const [d, k] of script) for (let i = 0; i < d * 60; i++) {
    Object.assign(c, { pitch: 0, roll: 0, boost: false, barrel: 0 }, k); if (i > 0) c.barrel = 0;
    frame(S, c);
    const p = S.camera.position; if (![p.x, p.y, p.z, S.camera.fov].every(Number.isFinite)) nan = true;
    minClear = Math.min(minClear, p.y - 250); maxFov = Math.max(maxFov, S.camera.fov); minFov = Math.min(minFov, S.camera.fov);
  }
  assert.ok(!nan);
  assert.ok(minClear >= 3.5, `camera clearance ${minClear}`);
  assert.ok(minFov >= 70 && maxFov > 85 && maxFov <= 98, `fov range ${minFov}..${maxFov}`);
});

test('level flight: camera is 11-24 m behind the aircraft, a few metres above, looking forward', () => {
  const S = setup(); const c = createControls();
  for (let i = 0; i < 120; i++) frame(S, c);
  const rel = S.camera.position.clone().sub(S.racer.render.pos), back = rel.dot(S.fs.forward) * -1;
  assert.ok(back > 11 && back < 24, `back ${back}`);
  assert.ok(rel.y > 2.5 && rel.y < 9, `height ${rel.y}`);
  const look = new THREE.Vector3(0, 0, -1).applyQuaternion(S.camera.quaternion);
  assert.ok(look.dot(S.fs.forward) > 0.97);
});

test('camera damping is frame-rate independent (30 vs 60 vs 144 Hz settle to the same pose)', () => {
  const poses = [];
  for (const hz of [30, 60, 144]) {
    const S = setup(); const c = createControls(); c.roll = 1;
    const sim = 1 / 720; let t = 0, acc = 0;
    while (t < 3) { stepFlight(S.fs, c, sim, { assist: 'standard' }); t += sim; acc += sim; if (acc >= 1 / hz - 1e-9) { S.racer.render.pos.copy(S.fs.pos); S.racer.render.quat.copy(S.fs.quat); S.rig.update(acc, S.game, 1); acc = 0; } }
    poses.push(S.camera.position.clone().sub(S.racer.render.pos));
  }
  assert.ok(poses[0].distanceTo(poses[1]) < 1.5 && poses[2].distanceTo(poses[1]) < 1.5, poses.map((p) => p.toArray().map((x) => x.toFixed(1))).join(' | '));
});

test('modes: cycle chase -> far -> low -> nose, nose is in front of the centre, shake is bounded and honours settings.shake', () => {
  const S = setup(); const c = createControls();
  for (let i = 0; i < 30; i++) frame(S, c);
  const seen = [S.rig.mode]; for (let i = 0; i < 4; i++) { S.rig.cycle(); seen.push(S.rig.mode); }
  assert.deepEqual(seen, ['chase', 'far', 'low', 'nose', 'chase']);
  S.rig.setMode('nose'); for (let i = 0; i < 5; i++) frame(S, c);
  assert.ok(S.camera.position.clone().sub(S.racer.render.pos).dot(S.fs.forward) > 3, 'nose camera ahead of the centre');
  S.rig.setMode('chase'); S.game.settings.shake = 0; S.rig.shake(1); const a = S.camera.position.clone(); for (let i = 0; i < 3; i++) frame(S, c);
  const noShake = S.camera.position.clone().sub(S.racer.render.pos).length();
  S.game.settings.shake = 1; S.rig.shake(1); let dev = 0; for (let i = 0; i < 20; i++) { frame(S, c); dev = Math.max(dev, Math.abs(S.camera.position.clone().sub(S.racer.render.pos).length() - noShake)); }
  assert.ok(dev > 0.01 && dev < 2.5, `hit shake deviation ${dev}`);
});

test('cinematic and grid and finish modes produce finite cameras that look at the aircraft', () => {
  for (const mode of ['cinematic', 'finish']) {
    const S = setup(mode); const c = createControls(); let worst = 0;
    for (let i = 0; i < 60 * 30; i++) {
      frame(S, c); const to = S.racer.render.pos.clone().sub(S.camera.position).normalize(), look = new THREE.Vector3(0, 0, -1).applyQuaternion(S.camera.quaternion);
      assert.ok(Number.isFinite(S.camera.position.x + S.camera.position.y + S.camera.position.z));
      if (i > 5) worst = Math.max(worst, Math.acos(Math.min(1, to.dot(look))));
      assert.ok(S.camera.position.y >= 250 + 3.9, `${mode} ground clearance`);
    }
    assert.ok(worst < 1.0, `${mode}: aircraft stays in view (worst ${worst})`);
  }
  const S = setup('chase'); S.game.race.state = 'countdown'; S.fs.speed = 0; const c = createControls();
  for (let i = 0; i < 120; i++) { S.racer.render.pos.copy(S.fs.pos); S.rig.update(DT, S.game, 1); }
  assert.ok(S.rig.camMode === 'grid');
  const d0 = S.camera.position.distanceTo(S.racer.render.pos); assert.ok(d0 > 12 && d0 < 40, `grid orbit radius ${d0}`);
  S.game.race.state = 'racing'; for (let i = 0; i < 120; i++) frame(S, c);
  assert.ok(S.rig.camMode === 'chase');
});

test('jump teleports do not smear the camera', () => {
  const S = setup(); const c = createControls();
  for (let i = 0; i < 60; i++) frame(S, c);
  S.fs.pos.add(new THREE.Vector3(3000, 0, 0)); S.racer.prev.pos.copy(S.fs.pos);
  frame(S, c);
  assert.ok(S.camera.position.distanceTo(S.racer.render.pos) < 40);
});

test('interpolated 144 Hz rendering of a 60 Hz sim moves the camera smoothly (no frame-to-frame jitter)', () => {
  const S = setup(); const c = createControls(); c.roll = 1; c.pitch = 0.4;
  let acc = 0, t = 0, prev = null, prevD = null, maxSecond = 0, n = 0;
  while (t < 4) {
    const dt = 1 / 144; acc += dt; t += dt;
    while (acc >= DT) { S.racer.prev.pos.copy(S.fs.pos); S.racer.prev.quat.copy(S.fs.quat); stepFlight(S.fs, c, DT, { assist: 'standard' }); acc -= DT; }
    const a = acc / DT;
    S.racer.render.pos.lerpVectors(S.racer.prev.pos, S.fs.pos, a); S.racer.render.quat.slerpQuaternions(S.racer.prev.quat, S.fs.quat, a);
    S.rig.update(dt, S.game, a);
    const p = S.camera.position.clone();
    if (prev) { const d = p.clone().sub(prev); if (prevD && t > 1) { maxSecond = Math.max(maxSecond, d.clone().sub(prevD).length()); n++; } prevD = d; }
    prev = p;
  }
  assert.ok(n > 300);
  assert.ok(maxSecond < 0.12, `second difference of camera position per frame: ${maxSecond.toFixed(3)} m`);
});

test('P-19: the look-back camera (which sits ahead of the aircraft) never ends up inside terrain: the line to it stays clear', () => {
  const S = setup();
  S.game.course.groundHeight = (x, z) => (z < -7 ? 380 : 250);            // a wall of rock 7 m ahead, higher than the aircraft
  S.racer.controls.lookBack = true;
  S.racer.render.pos.set(0, 300, 0); S.racer.render.quat.identity();
  for (let i = 0; i < 120; i++) S.rig.update(DT, S.game, 1);
  const P = S.racer.render.pos, C = S.camera.position, gh = S.game.course.groundHeight;
  for (let k = 1; k <= 20; k++) { const u = k / 20; assert.ok(P.y + (C.y - P.y) * u >= gh(0, P.z + (C.z - P.z) * u), `the line to the camera runs through rock at ${u}: camera at ${C.toArray().map((x) => x.toFixed(1))}`); }
  assert.ok(C.y >= gh(C.x, C.z) + 3, `camera under the ground: ${C.y}`);
  S.racer.controls.lookBack = false;
  for (let i = 0; i < 240; i++) S.rig.update(DT, S.game, 1);
  assert.ok(S.camera.position.z > 8, `the camera comes back out behind the aircraft once looking forward again: z ${S.camera.position.z}`);
});

test('P-20: in a hard bank the chase camera eases back, rises and looks into the turn', () => {
  const lvl = setup(); const c = createControls();
  for (let i = 0; i < 120; i++) frame(lvl, c);
  const S = setup(); const cb = createControls(); cb.roll = 1;
  for (let i = 0; i < 150; i++) frame(S, cb);
  assert.ok(Math.abs(Math.sin(S.fs.phi)) > 0.85, `banked ${S.fs.phi}`);
  const relL = lvl.camera.position.clone().sub(lvl.racer.render.pos), relB = S.camera.position.clone().sub(S.racer.render.pos);
  const dist = (rel, fs) => -rel.dot(fs.forward);
  assert.ok(dist(relB, S.fs) > dist(relL, lvl.fs) + 1.5, `back ${dist(relB, S.fs)} vs level ${dist(relL, lvl.fs)}`);
  assert.ok(relB.y > relL.y + 1, `rise ${relB.y} vs ${relL.y}`);
  // the view axis leans toward the inside of the turn (+ = right wing down turns right)
  const look = new THREE.Vector3(0, 0, -1).applyQuaternion(S.camera.quaternion), side = new THREE.Vector3().copy(S.fs.right).setY(0).normalize();
  const lead = look.dot(side) * Math.sign(-S.fs.right.y);
  assert.ok(lead > 0.12, `view not led into the turn: ${lead}`);
});
