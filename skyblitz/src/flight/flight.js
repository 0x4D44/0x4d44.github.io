// STUB flight model (kinematic). The flight agent REPLACES the internals; keep every export name and the FlightState field names.
// Axes: local forward = -Z, up = +Y, right = +X. Units: metres, seconds, radians.
import * as THREE from 'three';
import { clamp, damp } from '../util.js';

export const FLIGHT = { minSpeedFrac: 0.55, boostSpeedMul: 1.5, barrelTime: 0.6 };

/** Physical parameters derived from an AIRCRAFT spec (stats 1..10). The real implementation owns the mapping. */
export function flightParams(spec) {
  const s = spec?.stats || { speed: 6, accel: 6, handling: 6, stability: 6, boost: 6 };
  const cruise = 70 + s.speed * 5;
  return { cruise, minSpeed: cruise * FLIGHT.minSpeedFrac, boostSpeedMul: FLIGHT.boostSpeedMul, pitchRate: 0.8 + s.handling * 0.1, rollRate: 2.2 + s.handling * 0.2, turnGain: 0.9, accel: 20 + s.accel * 3 };
}
export const topSpeed = (spec) => { const p = flightParams(spec); return p.cruise * p.boostSpeedMul; };

export function createFlightState(spec) {
  return {
    spec, params: flightParams(spec),
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), speed: 0,
    forward: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0),
    bank: 0, pitch: 0, heading: 0, angVel: new THREE.Vector3(), gLoad: 1, throttle: 0.7, airbrake: 0,
    boost: { meter: 0, timer: 0, power: 1.6, active: false },         // meter 0..100 (stunt-charged); timer > 0 = timed boost running
    barrel: { t: 0, dir: 0, cooldown: 0 },                              // t > 0 while a barrel roll is in progress
    stall: { active: false, t: 0 }, tumble: { t: 0, dir: 1 },
    events: [],                                                         // {type:'stunt'|'stall'|'recover'|..., kind, reward} drained by the Race each step
  };
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function derive(fs) {
  fs.forward.set(0, 0, -1).applyQuaternion(fs.quat); fs.up.set(0, 1, 0).applyQuaternion(fs.quat); fs.right.set(1, 0, 0).applyQuaternion(fs.quat);
  fs.bank = Math.asin(clamp(-fs.right.y, -1, 1)); fs.pitch = Math.asin(clamp(fs.forward.y, -1, 1)); fs.heading = Math.atan2(-fs.forward.x, -fs.forward.z);
}

export function resetFlightState(fs, pos, quat, speed = 0) {
  fs.pos.copy(pos); fs.quat.copy(quat); derive(fs);
  fs.speed = speed; fs.vel.copy(fs.forward).multiplyScalar(speed);
  fs.boost.meter = 0; fs.boost.timer = 0; fs.boost.active = false; fs.barrel.t = 0; fs.tumble.t = 0; fs.stall.active = false; fs.events.length = 0;
  return fs;
}

/** Advance one fixed step. controls: see controls.js. ctx: { speedMul?: number (rubber-band), assist?: 'standard'|'pro', gravityScale?: number } */
export function stepFlight(fs, c, dt, ctx) {
  const p = fs.params, tumbling = fs.tumble.t > 0;
  let pitchIn = tumbling ? 0 : c.pitch, rollIn = tumbling ? fs.tumble.dir * 1.5 : c.roll;
  if (c.barrel && fs.barrel.t <= 0 && fs.barrel.cooldown <= 0 && !tumbling) { fs.barrel.t = FLIGHT.barrelTime; fs.barrel.dir = c.barrel; fs.barrel.cooldown = 1.2; fs.events.push({ type: 'stunt', kind: 'barrel', reward: 6 }); }
  if (fs.barrel.cooldown > 0) fs.barrel.cooldown -= dt;
  _qa.setFromAxisAngle(X, pitchIn * p.pitchRate * dt);
  _qb.setFromAxisAngle(Z, -rollIn * p.rollRate * dt);
  fs.quat.multiply(_qa).multiply(_qb);
  if (fs.barrel.t > 0) { fs.barrel.t -= dt; _qa.setFromAxisAngle(Z, -fs.barrel.dir * (Math.PI * 2 / FLIGHT.barrelTime) * dt); fs.quat.multiply(_qa); }
  _qa.setFromAxisAngle(Y, fs.right.y * p.turnGain * dt);       // coordinated turn: bank turns the nose
  fs.quat.premultiply(_qa).normalize();
  if (fs.tumble.t > 0) fs.tumble.t -= dt;
  const wantBoost = c.boost && fs.boost.meter > 0;
  if (wantBoost) fs.boost.meter = Math.max(0, fs.boost.meter - 25 * dt);
  if (fs.boost.timer > 0) fs.boost.timer -= dt;
  fs.boost.active = wantBoost || fs.boost.timer > 0;
  const target = p.cruise * (ctx?.speedMul ?? 1) * (fs.boost.active ? p.boostSpeedMul : 1) * (tumbling ? 0.5 : 1);
  fs.speed = damp(fs.speed, target, 1.2, dt);
  fs.airbrake = c.airbrake;
  derive(fs);
  fs.vel.copy(fs.forward).multiplyScalar(fs.speed);
  fs.pos.addScaledVector(fs.vel, dt);
}

export function applyTumble(fs, seconds, dir = 1) { fs.tumble.t = Math.max(fs.tumble.t, seconds); fs.tumble.dir = dir; }
export function applyImpulse(fs, v) { fs.speed = Math.max(fs.params.minSpeed * 0.6, fs.speed + v.dot(fs.forward)); }
export function startBoost(fs, seconds, power = 1.6) { fs.boost.timer = Math.max(fs.boost.timer, seconds); fs.boost.power = power; }
export function addBoostMeter(fs, amount) { fs.boost.meter = clamp(fs.boost.meter + amount, 0, 100); }
