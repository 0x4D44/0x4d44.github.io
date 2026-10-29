// SKYBLITZ arcade flight model. Pure logic (no DOM / WebGL): runs under node:test. Owner: flight agent.
//
// Axes: local forward = -Z, up = +Y, right = +X. Units: metres, seconds, radians. Attitude is a quaternion rotated about the
// aircraft's LOCAL axes, so loops and rolls past 90 degrees need no special cases. The model is kinematic-with-energy:
//   * speed is a scalar along the nose; thrust, drag and gravity-along-the-path (dive/climb) act on it,
//   * roll input commands a BANK ANGLE (rate-limited); bank turns the nose about world-up (bank-to-turn),
//   * pitch rotates the nose about the aircraft's own right axis, i.e. along its OWN up axis: wings level = loop,
//     90 degrees of bank = horizontal knife-edge turn,
//   * low speed -> authority fades -> stall (nose drops) -> recover by diving.
// stepFlight is deterministic, allocation-free, and finite for any dt in [0, 0.1] and any inputs.
import * as THREE from 'three';
import { clamp, damp, smoothstep } from '../util.js';

/** Global tuning constants (see the handoff for what each does). */
export const FLIGHT = {
  minSpeedFrac: 0.55,        // minimum flying speed as a fraction of cruise
  stallFrac: 0.85,           // stall below this fraction of minSpeed
  boostSpeedMul: 1.5,        // cruise multiplier while boosting at power 1.6
  barrelTime: 0.65,          // s, scripted 360 degree roll
  barrelCooldown: 1.15,      // s from the START of a barrel roll until the next may begin
  barrelShift: 12,           // m lateral displacement over a barrel roll
  gravity: 16,               // m/s^2 along the flight path (scaled gravity)
  maxBank: 1.4,              // rad (80 deg): stick-commanded bank limit
  boostDrain: 25,            // meter units per second while boosting from the meter
  meterBoostPower: 1.6,
  loopThreshold: 330 * Math.PI / 180,
  rollThreshold: 330 * Math.PI / 180,
};

/** Physical parameters derived from an AIRCRAFT spec (stats 1..10). */
export function flightParams(spec) {
  const s = spec?.stats || { speed: 6, accel: 6, handling: 6, stability: 6, boost: 6 };
  const cruise = 70 + s.speed * 6;                       // 94..124 m/s for speed 4..9
  const minSpeed = cruise * FLIGHT.minSpeedFrac;
  return {
    cruise, minSpeed, stallSpeed: minSpeed * FLIGHT.stallFrac,
    boostSpeedMul: 1.38 + 0.02 * s.boost,
    accel: 22 + 3 * s.accel,                              // boost acceleration cap (m/s^2)
    thrust: 0.4 * (22 + 3 * s.accel),                     // normal thrust cap (m/s^2)
    pitchRate: 1.45 + 0.1 * s.handling,                   // rad/s at full pull
    rollRate: 2.0 + 0.2 * s.handling,                     // rad/s
    turnRate: 0.55 + 0.085 * s.handling,                  // rad/s of heading change at 90 degrees of bank, at cruise
    levelRate: 1.0 + 0.22 * s.stability,                  // 1/s auto-level strength
    tumbleRecover: 0.35 + 0.05 * s.stability,             // s of extra levelling after a tumble
    gravity: FLIGHT.gravity,
    maxBank: FLIGHT.maxBank,
  };
}
export const topSpeed = (spec) => { const p = flightParams(spec); return p.cruise * p.boostSpeedMul; };

export function createFlightState(spec) {
  return {
    spec, params: flightParams(spec),
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), speed: 0,
    forward: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0),
    bank: 0, pitch: 0, heading: 0, angVel: new THREE.Vector3(), gLoad: 1, throttle: 0.6, airbrake: 0,
    boost: { meter: 0, timer: 0, power: 1.6, active: false },         // meter 0..100 (stunt-charged); timer > 0 = timed boost running
    barrel: { t: 0, dir: 0, cooldown: 0 },                              // t > 0 while a barrel roll is in progress (missile-evasive)
    stall: { active: false, t: 0 }, tumble: { t: 0, dir: 1 },
    events: [],                                                         // {type:'stunt'|'stall'|'recover', kind, reward} drained by the Race each step
    // --- additions (internal, but readable) ---
    t: 0, phi: 0,                                                       // flight clock; full roll angle (+ right wing down, +-PI inverted)
    kick: new THREE.Vector3(),                                          // decaying world-space velocity from impulses (bumps)
    ctl: { q: 0, p: 0, r: 0, hold: 0, recover: 0, barrelAngle: 0, shiftAxis: new THREE.Vector3(), shiftDone: 0, push: false },
    stunt: { loop: 0, roll: 0, rollIdle: 0, inv: 0, loopCool: 0, rollCool: 0 },
  };
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qp = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0), _c = new THREE.Vector3();

function derive(fs) {
  fs.forward.set(0, 0, -1).applyQuaternion(fs.quat); fs.up.set(0, 1, 0).applyQuaternion(fs.quat); fs.right.set(1, 0, 0).applyQuaternion(fs.quat);
  fs.bank = Math.asin(clamp(-fs.right.y, -1, 1)); fs.pitch = Math.asin(clamp(fs.forward.y, -1, 1)); fs.heading = Math.atan2(-fs.forward.x, -fs.forward.z);
  fs.phi = Math.atan2(-fs.right.y, fs.up.y);
}

/** Roll angle relative to the nearest flat attitude (upright or inverted): in (-PI/2, PI/2]. Pilots and the flight model share it. */
export function rollRel(fs) { const a = fs.phi; return Math.abs(a) > Math.PI / 2 ? a - Math.sign(a) * Math.PI : a; }

export function resetFlightState(fs, pos, quat, speed = 0) {
  fs.pos.copy(pos); fs.quat.copy(quat); derive(fs);
  fs.speed = speed; fs.vel.copy(fs.forward).multiplyScalar(speed); fs.kick.set(0, 0, 0); fs.angVel.set(0, 0, 0);
  fs.boost.meter = 0; fs.boost.timer = 0; fs.boost.active = false;
  fs.barrel.t = 0; fs.barrel.cooldown = 0; fs.tumble.t = 0; fs.stall.active = false; fs.stall.t = 0; fs.events.length = 0;
  const c = fs.ctl; c.q = c.p = c.r = c.hold = c.recover = c.barrelAngle = c.shiftDone = 0; c.push = false;
  const s = fs.stunt; s.loop = s.roll = s.rollIdle = s.inv = s.loopCool = s.rollCool = 0;
  fs.gLoad = 1; fs.airbrake = 0;
  return fs;
}

function pushEvent(fs, e) { if (fs.events.length > 48) fs.events.shift(); fs.events.push(e); }

/** Advance one fixed step. controls: see controls.js. ctx: { speedMul?: number (rubber-band), assist?: 'standard'|'pro', gravityScale?: number } */
export function stepFlight(fs, c, dt, ctx) {
  if (!(dt > 0)) return;
  if (dt > 0.1) dt = 0.1;
  const n = dt > 0.0201 ? Math.ceil(dt / 0.0167) : 1, h = dt / n;
  for (let i = 0; i < n; i++) stepOnce(fs, c, h, ctx);
  c.barrel = 0;                                         // edge consumed (started or dropped by cooldown)
}

function stepOnce(fs, c, h, ctx) {
  const p = fs.params, k = fs.ctl, st = fs.stunt, pro = ctx?.assist === 'pro';
  const speedMul = ctx?.speedMul ?? 1, gs = p.gravity * (ctx?.gravityScale ?? 1);
  const tumbling = fs.tumble.t > 0;
  fs.t += h;
  let v = fs.speed;
  if (!(v >= 0)) v = 0;

  // ---- stall state (hysteresis) ----
  if (!fs.stall.active && v < p.stallSpeed && !tumbling) { fs.stall.active = true; fs.stall.t = 0; pushEvent(fs, { type: 'stall' }); }
  else if (fs.stall.active && v > p.minSpeed) { fs.stall.active = false; pushEvent(fs, { type: 'recover' }); }
  if (fs.stall.active) fs.stall.t += h;
  const stalled = fs.stall.active;
  const auth = clamp(0.3 + 0.7 * (v - p.stallSpeed) / Math.max(1, p.minSpeed - p.stallSpeed), 0.3, 1);   // control authority 0.3..1

  // ---- barrel roll start ----
  if (fs.barrel.cooldown > 0) fs.barrel.cooldown -= h;
  if (c.barrel && !tumbling && !stalled && fs.barrel.t <= 0 && fs.barrel.cooldown <= 0) {
    fs.barrel.t = FLIGHT.barrelTime; fs.barrel.dir = c.barrel > 0 ? 1 : -1; fs.barrel.cooldown = FLIGHT.barrelCooldown;
    k.barrelAngle = 0; k.shiftDone = 0; k.shiftAxis.copy(fs.right);
    pushEvent(fs, { type: 'stunt', kind: 'barrel', reward: 6 });
    c.barrel = 0;
  }
  const barreling = fs.barrel.t > 0;
  const ab = clamp(c.airbrake || 0, 0, 1);
  fs.airbrake = damp(fs.airbrake, ab, 12, h);

  // ---- desired body rates (local): q pitch (+ nose up), r yaw (+ nose left, local +Y), p roll (+ right wing down) ----
  const pitchIn = tumbling ? 0 : clamp(c.pitch || 0, -1, 1), rollIn = tumbling ? 0 : clamp(c.roll || 0, -1, 1), yawIn = tumbling ? 0 : clamp(c.yaw || 0, -1, 1);
  const el = fs.pitch, upY = fs.up.y;
  const cosP = Math.sqrt(fs.up.y * fs.up.y + fs.right.y * fs.right.y);          // 1 level, 0 pointing straight up/down
  const flat = smoothstep(0.25, 0.6, cosP);                                      // roll angle is meaningful only when flat enough
  const agil = clamp(Math.pow(p.cruise / Math.max(v, p.minSpeed), 0.3), 0.78, 1.12);
  const abTight = 1 + 0.3 * fs.airbrake;

  let qT = (pitchIn > 0 ? pitchIn : pitchIn * 0.75) * p.pitchRate * auth * agil * abTight;
  const levelOn = !tumbling && !barreling;
  const pitchFree = 1 - smoothstep(0.02, 0.25, Math.abs(pitchIn));
  const lvl = (pro ? 0.18 : 1) * p.levelRate;
  if (levelOn && !stalled) {
    const sgn = clamp(upY * 3, -1, 1);                                           // inverted: pitch levelling reverses
    qT += pitchFree * clamp(-0.32 * lvl * el * sgn, -0.85, 0.85) * smoothstep(0.03, 0.3, cosP);
  }
  if (stalled) qT = qT * 0.35 + clamp((-0.9 - el) * 2.2, -1.5, 0.3) * (upY >= 0 ? 1 : -1);
  if (k.recover > 0) { k.recover -= h; qT += clamp(-1.2 * p.levelRate * el * clamp(upY * 3, -1, 1), -1.2, 1.2) * flat; }

  // roll: stick = bank-angle command (+ rate limited); released = auto-level (standard) or hold (pro)
  const phiR = rollRel(fs), cap = p.maxBank;
  let pT = 0;
  const rollRate = p.rollRate * (0.5 + 0.5 * auth);
  if (Math.abs(rollIn) > 0.015) {
    pT = clamp(7 * (rollIn * cap - phiR), -rollRate, rollRate);
    if (pro && Math.abs(rollIn) > 0.99) { k.hold += h; if (k.hold > 0.3) pT = Math.sign(rollIn) * rollRate; } else k.hold = 0;
  } else {
    k.hold = 0;
    const lw = (pro ? 0.03 : 1) * (1 - smoothstep(0.02, 0.3, Math.abs(pitchIn))) * flat * (levelOn ? 1 : 0);
    pT = clamp(-p.levelRate * 2.2 * fs.phi, -rollRate, rollRate) * lw;
    if (k.recover > 0) pT += clamp(-p.levelRate * 3 * fs.phi, -rollRate, rollRate) * flat * (1 - lw);
  }
  let rT = -yawIn * 0.7 * auth;                    // yaw +1 = nose right = rotation about local +Y is negative

  // tumble: uncontrollable spin with visible angular rates, fading out over its last 0.5 s
  if (tumbling) {
    const s = clamp(fs.tumble.t / 0.5, 0, 1);
    pT = fs.tumble.dir * 8.5 * s; qT = 2.4 * Math.sin(fs.t * 9) * s; rT = 1.6 * Math.cos(fs.t * 7) * s;
    k.q = qT; k.r = rT; k.p = pT;                       // no smoothing lag: starts and stops cleanly
    fs.tumble.t -= h;
    if (fs.tumble.t <= 0) { fs.tumble.t = 0; k.recover = p.tumbleRecover + 0.45; }
  } else {
    const a = 1 - Math.exp(-13 * h);
    k.q += (qT - k.q) * a; k.p += (pT - k.p) * (1 - Math.exp(-15 * h)); k.r += (rT - k.r) * a;
  }

  // barrel roll override: eased 360 degrees with an exact total
  let pTot = k.p, shiftV = 0;
  if (barreling) {
    const T = FLIGHT.barrelTime, u = clamp(1 - fs.barrel.t / T, 0, 1);
    let dAng = (2 * Math.PI / T) * (1 - Math.cos(2 * Math.PI * u)) * h;
    fs.barrel.t -= h;
    if (fs.barrel.t <= 0) { dAng = 2 * Math.PI - k.barrelAngle; fs.barrel.t = 0; }
    k.barrelAngle += dAng; pTot = fs.barrel.dir * dAng / h;
    const D = FLIGHT.barrelShift, tgt = 0.5 * (1 - Math.cos(Math.PI * clamp(k.barrelAngle / (2 * Math.PI), 0, 1))) * D;
    shiftV = fs.barrel.dir * (tgt - k.shiftDone) / h; k.shiftDone = tgt;
  }

  // ---- integrate attitude ----
  const bx = k.q * h, by = k.r * h, bz = -pTot * h;
  const ang = Math.sqrt(bx * bx + by * by + bz * bz);
  _qp.copy(fs.quat);
  if (ang > 1e-9) { const s = Math.sin(ang / 2) / ang; _q1.set(bx * s, by * s, bz * s, Math.cos(ang / 2)); fs.quat.multiply(_q1); }
  // bank-to-turn: the nose follows the horizontal component of lift, rotating about WORLD up
  _c.copy(fs.forward).cross(Y);
  const lat = fs.up.dot(_c);
  const sf = clamp(Math.pow(p.cruise / Math.max(v, p.minSpeed), 0.8), 0.7, 1.25);
  const turn = p.turnRate * sf * abTight * (0.35 + 0.65 * auth) * (stalled ? 0.5 : 1) * (tumbling || barreling ? 0 : 1);
  const rotY = -turn * lat;
  if (rotY !== 0) { _q2.setFromAxisAngle(Y, rotY * h); fs.quat.premultiply(_q2); }
  fs.quat.normalize();
  if (!(fs.quat.lengthSq() > 0.5)) fs.quat.copy(_qp);          // paranoia: never let NaN in
  derive(fs);

  // local angular velocity from the actual step delta (rad/s): x pitch (+up), y yaw, z roll (right wing down is -z)
  _q1.copy(_qp).invert().multiply(fs.quat);
  const sw = _q1.w < 0 ? -2 / h : 2 / h;
  fs.angVel.set(_q1.x * sw, _q1.y * sw, _q1.z * sw);

  // ---- speed: thrust, drag, gravity along the path ----
  const boostMeter = !!c.boost && fs.boost.meter > 0 && !tumbling;
  if (fs.boost.timer > 0) fs.boost.timer -= h;
  if (boostMeter && fs.boost.timer <= 0) fs.boost.meter = Math.max(0, fs.boost.meter - FLIGHT.boostDrain * h);
  const timed = fs.boost.timer > 0 && !tumbling;
  const boosting = boostMeter || timed;
  fs.boost.active = boosting;
  const power = timed ? fs.boost.power : FLIGHT.meterBoostPower;
  const capMul = boosting ? clamp(1 + (p.boostSpeedMul - 1) * power / FLIGHT.meterBoostPower, 1.2, 1.75) : 1;
  const vt = p.cruise * speedMul * capMul;
  let acc;
  if (v < vt) {
    const lim = boosting ? p.accel * power / FLIGHT.meterBoostPower : p.thrust * speedMul;
    acc = clamp((boosting ? 1.4 : 0.45) * (vt - v), 0, lim);
  } else acc = -0.4 * (v - vt) - 0.0006 * (v - vt) * (v - vt);
  acc -= gs * fs.forward.y * (fs.forward.y > 0 ? 1 + 0.6 * fs.forward.y : 1 - 0.3 * fs.forward.y);   // dives gain speed, climbs lose it (steep climbs bleed hardest)
  acc -= (0.02 * Math.abs(k.q) + 0.012 * Math.abs(rotY)) * v;                    // induced drag from pulling / turning
  acc -= 28 * fs.airbrake * smoothstep(p.minSpeed, p.minSpeed * 1.15, v);        // airbrake never takes you below minSpeed
  if (tumbling) acc -= 2.5 * Math.max(0, v - 0.62 * p.minSpeed);
  v += acc * h;
  fs.speed = clamp(v, 0.3 * p.minSpeed, p.cruise * 1.95);
  fs.throttle = damp(fs.throttle, clamp(0.55 + 0.45 * (boosting ? 1 : 0) - 0.4 * fs.airbrake + 0.6 * fs.forward.y, 0.1, 1), 6, h);

  // ---- position ----
  fs.kick.multiplyScalar(Math.exp(-2.5 * h));
  fs.vel.copy(fs.forward).multiplyScalar(fs.speed).add(fs.kick);
  if (shiftV !== 0) fs.vel.addScaledVector(k.shiftAxis, shiftV);
  fs.pos.addScaledVector(fs.vel, h);

  // ---- G-load (display / camera / audio) ----
  const gTarget = clamp(upY + 0.27 * (k.q * fs.speed + Math.abs(rotY) * fs.speed * Math.abs(lat)) / 9.81, -4, 9);
  fs.gLoad = damp(fs.gLoad, gTarget, 10, h);

  detectStunts(fs, h, tumbling);
}

function detectStunts(fs, h, tumbling) {
  const st = fs.stunt, w = fs.angVel;
  if (st.loopCool > 0) st.loopCool -= h;
  if (st.rollCool > 0) st.rollCool -= h;
  // loop: accumulated pitch rotation while the wings stay roughly level (or inverted), i.e. not a knife-edge turn
  if (tumbling) { st.loop = 0; st.roll = 0; st.inv = 0; return; }
  const wingY = Math.abs(fs.right.y);
  if (wingY > 0.75) st.loop = 0;
  else if (wingY < 0.5) st.loop += w.x * h;
  st.loop -= st.loop * 0.12 * h;
  if (Math.abs(st.loop) >= FLIGHT.loopThreshold) {
    st.loop = 0;
    if (st.loopCool <= 0) { st.loopCool = 1.0; pushEvent(fs, { type: 'stunt', kind: 'loop', reward: 25 }); }
  }
  // manual roll: accumulated roll rate outside a scripted barrel
  if (fs.barrel.t > 0 || fs.barrel.cooldown > FLIGHT.barrelCooldown - FLIGHT.barrelTime - 0.05) { st.roll = 0; }
  else {
    const rr = -w.z;
    if (Math.abs(rr) > 0.8) { st.roll += rr * h; st.rollIdle = 0; } else { st.rollIdle += h; if (st.rollIdle > 0.35) st.roll = 0; }
    if (Math.abs(st.roll) >= FLIGHT.rollThreshold) {
      st.roll = 0;
      if (st.rollCool <= 0) { st.rollCool = 1.0; pushEvent(fs, { type: 'stunt', kind: 'roll', reward: 12 }); }
    }
  }
  // inverted flight: first reward after 1.2 s inverted, then every 0.6 s
  if (fs.up.y < -0.6 && Math.abs(fs.forward.y) < 0.6) { st.inv += h; if (st.inv >= 1.2) { st.inv = 0.6; pushEvent(fs, { type: 'stunt', kind: 'inverted', reward: 4 }); } }
  else st.inv = 0;
}

/** Uncontrollable spin for `seconds` with heavy speed loss. dir = spin direction (+1 right / -1 left). */
export function applyTumble(fs, seconds, dir = 1) {
  if (!(seconds > 0)) return;
  if (!(fs.tumble.t > 0)) fs.speed = Math.max(fs.params.minSpeed * 0.7, fs.speed * 0.78);
  fs.tumble.t = Math.max(fs.tumble.t, seconds); fs.tumble.dir = dir < 0 ? -1 : 1;
  fs.barrel.t = 0; fs.ctl.hold = 0;
}
/** World-space velocity impulse: the forward part changes speed, the rest becomes a decaying lateral kick (bumps). */
export function applyImpulse(fs, v) {
  const f = v.dot(fs.forward);
  fs.speed = clamp(fs.speed + f, fs.params.minSpeed * 0.6, fs.params.cruise * 1.95);
  fs.kick.addScaledVector(v, 1).addScaledVector(fs.forward, -f);
  if (fs.kick.length() > 40) fs.kick.setLength(40);
}
export function startBoost(fs, seconds, power = 1.6) { fs.boost.timer = Math.max(fs.boost.timer, seconds); fs.boost.power = Math.max(1.1, power); }
export function addBoostMeter(fs, amount) { fs.boost.meter = clamp(fs.boost.meter + amount, 0, 100); }
