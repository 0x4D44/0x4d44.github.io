// How a floater rides the swell (A5, js/world/beachfloat.js, dev/FEATURE-BEACH.md phase 2b): the pose of every floating piece of the sea's plan from the sea's own height around it, checked on tilted planes
// where the right answer is plain, on the real swell (core/sea.js) for a whole afternoon, and through the instance matrix the page draws with. Pure Node: no renderer.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachfloat.test.mjs
// Every check has a deliberately broken input selected by BFT_SABOTAGE=<id>|all, and each must then FAIL:
//   flip     the pitch has the wrong sign        swap     pitch and roll are swapped         sink     the heave is a metre off          wild     nothing limits a tilt
//   stiff    the raft rides the swell like a boat  deaf     the floater ignores the sea         mirror   the starboard side is the port
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { SEA } from '../js/world/coast.js';
import { planSea } from '../js/world/beachsea.js';
import { floatPose as realPose, poseMatrix, REACH } from '../js/world/beachfloat.js';
import { SIZE, FLOAT } from '../js/world/waterlib.js';
import { level as swell, seaState, PEAK } from '../js/core/sea.js';

const SAB = process.env.BFT_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const ctx = createContext({ seed: 20261029, headless: true });
const S = planSea(generatePlan(ctx).coast);
const FLOATERS = S.items.filter((i) => i.float);
const DEG = Math.PI / 180;

/** The pose function the checks look at: the real one, or a broken copy when BFT_SABOTAGE asks. */
function floatPose(it, level, t) {
  const item = on('stiff') && it.float.rig === 'rigid' ? { ...it, float: { ...it.float, rig: 'free' } } : it;
  const p = realPose(item, on('deaf') ? () => 0 : level, t);
  if (on('flip')) p.pitch = -p.pitch;
  if (on('swap')) [p.pitch, p.roll] = [p.roll, p.pitch];
  if (on('mirror')) p.roll = -p.roll;
  if (on('sink')) p.y -= 1;
  if (on('wild')) { p.pitch *= 30; p.roll *= 30; }
  return p;
}
const world = (it, pose, [x, y, z]) => new THREE.Vector3(x, y, z).applyMatrix4(poseMatrix(it, pose));

test('on a tilted sea the bow goes up where the sea goes up, and so does the starboard side, whatever way the piece faces', () => {
  const lancha = FLOATERS.find((i) => i.name === 'lancha'), [w, , d] = SIZE.lancha;
  for (const yaw of [0, 0.7, Math.PI / 2, Math.PI, -2.1]) for (const [a, b] of [[0.03, 0], [0, 0.03], [0.02, -0.02]]) {
    const it = { ...lancha, yaw }, level = (x, z) => a * x + b * z, pose = floatPose(it, level, 0);
    const bow = world(it, pose, [0, 0, d / 2 * 0.5]), stern = world(it, pose, [0, 0, -d / 2 * 0.5]), star = world(it, pose, [w / 2 * 0.8, 0, 0]), port = world(it, pose, [-w / 2 * 0.8, 0, 0]);
    // the model's points sit on the plane (the library's waterline is the origin): each is within 3 cm of the surface under it
    for (const [name, p] of [['bow', bow], ['stern', stern], ['starboard', star], ['port', port]]) {
      assert.ok(Math.abs(p.y - (SEA + level(p.x, p.z))) < 0.03, `yaw ${yaw}, plane (${a}, ${b}): the ${name} is ${(p.y - SEA - level(p.x, p.z)).toFixed(3)} m off the surface`);
    }
  }
});

test('a flat sea is a flat pose at its height; the heave is the surface\'s, not a table\'s', () => {
  for (const it of FLOATERS) {
    if (it.float.rig === 'rigid') continue;
    for (const c of [-0.3, 0, 0.42]) {
      const p = floatPose(it, () => c, 3.7);
      assert.ok(Math.abs(p.y - (SEA + c)) < 1e-9 && Math.abs(p.pitch) < 1e-9 && Math.abs(p.roll) < 1e-9, `${it.id} on a sea ${c} m over the still: y ${p.y.toFixed(3)}, pitch ${p.pitch.toFixed(3)}, roll ${p.roll.toFixed(3)}`);
    }
  }
});

test('a tilt is clamped to twice the library\'s rock (a buoy 12 degrees, a lancha 6, a rope of floats 4); a steep sea does not stand a piece on its end', () => {
  const steep = (x, z) => 1.5 * x + 1.5 * z;
  for (const it of FLOATERS) {
    if (it.float.rig === 'rigid') continue;
    const lim = Math.max(FLOAT[it.name].rock * 2, 4) * DEG, p = floatPose({ ...it, yaw: 0.4 }, steep, 0);
    assert.ok(Math.abs(p.pitch) <= lim + 1e-9 && Math.abs(p.roll) <= lim + 1e-9, `${it.id}: pitch ${(p.pitch / DEG).toFixed(1)}, roll ${(p.roll / DEG).toFixed(1)} degrees, the limit ${(lim / DEG).toFixed(0)}`);
    assert.ok(Math.abs(p.pitch) >= lim - 1e-9 || Math.abs(p.roll) >= lim - 1e-9, `${it.id} reaches its limit on a steep sea`);
  }
});

test('the raft is rigid: its floor is one patch of the physics world, so it breathes by the library\'s bob and never tilts, however the sea runs', () => {
  const raft = FLOATERS.find((i) => i.name === 'diving_raft');
  assert.equal(raft.float.rig, 'rigid');
  for (let t = 0; t < 40; t += 0.37) {
    const p = floatPose(raft, (x, z) => 0.5 * Math.sin(x + z + t), t);
    assert.ok(Math.abs(p.y - SEA) <= FLOAT.diving_raft.bob + 1e-9, `t ${t.toFixed(1)}: ${(p.y - SEA).toFixed(3)} m from its rest height`);
    assert.equal(p.pitch, 0); assert.equal(p.roll, 0);
  }
});

test('on the real swell, from calm to the afternoon breeze, every floater stays inside the swell\'s envelope and its tilt inside its limit', () => {
  for (const hour of [4, 9, 12, 15, 21]) {
    const state = seaState(hour), level = (x, z, t) => swell(x, z, t, state);
    for (const it of FLOATERS) for (let t = 0; t < 30; t += 1.3) {
      const p = floatPose(it, level, t);
      if (it.float.rig === 'rigid') { assert.ok(Math.abs(p.y - SEA) <= FLOAT.diving_raft.bob + 1e-9); continue; }
      assert.ok(Math.abs(p.y - SEA) <= PEAK + 1e-9, `${it.id} at ${hour}:00: ${(p.y - SEA).toFixed(3)} m from the still sea (the swell cannot go beyond ${PEAK.toFixed(2)})`);
      const lim = Math.max(FLOAT[it.name].rock * 2, 4) * DEG;
      assert.ok(Math.abs(p.pitch) <= lim + 1e-9 && Math.abs(p.roll) <= lim + 1e-9, `${it.id}: tilt ${(p.pitch / DEG).toFixed(1)}/${(p.roll / DEG).toFixed(1)} degrees`);
    }
  }
  // and the afternoon's swell really moves the lancha: its heave spans more than 30 cm over a minute
  const state = seaState(15), lancha = FLOATERS.find((i) => i.name === 'lancha'), ys = [];
  for (let t = 0; t < 60; t += 0.5) ys.push(floatPose(lancha, (x, z, tt) => swell(x, z, tt, state), t).y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.3, `the lancha rises and falls by ${(Math.max(...ys) - Math.min(...ys)).toFixed(2)} m`);
});

test('the surface is read where the piece is, at most a metre and a bit out from its centre, so a long boat rides the swell and a buoy follows the ripples', () => {
  const lancha = FLOATERS.find((i) => i.name === 'lancha'), buoy = FLOATERS.find((i) => i.name === 'buoy'), seen = [];
  floatPose({ ...lancha, yaw: 0 }, (x, z) => { seen.push([x - lancha.x, z - lancha.z]); return 0; }, 0);
  assert.ok(seen.every(([dx, dz]) => Math.hypot(dx, dz) <= REACH + 1e-9), 'no sample of the lancha is farther than REACH');
  assert.ok(seen.some(([, dz]) => Math.abs(dz) > 0.9), 'but the long boat is read nearly to REACH along its length');
  seen.length = 0;
  floatPose({ ...buoy, yaw: 0 }, (x, z) => { seen.push([x - buoy.x, z - buoy.z]); return 0; }, 0);
  assert.ok(seen.every(([dx, dz]) => Math.hypot(dx, dz) < 0.25), 'a 0.5 m buoy is read within its own radius');
});
