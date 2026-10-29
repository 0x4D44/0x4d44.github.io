// Pilot: turns "fly at that point" into stick inputs. Used by AI pilots, the player autopilot and attract mode.
// Pure logic (no DOM / WebGL). Owner: flight agent.
//
//   pilotSteer(fs, worldTarget, out, opts) -> angular error (rad)   writes out.pitch / out.roll / out.yaw
//   pilotLevel(fs, out)                                              wings level, nose to the horizon (recovery)
//   pilotAvoid(fs, target, hazards, outTarget, opts) -> bool         bends a target away from hazards ahead
//
// Two regimes, both PD-style, selected from the local geometry of the target:
//   WORLD  (target within ~60 deg of the nose, upright, nose not steep): horizontal heading error -> bank angle (bank-to-turn),
//          elevation error -> pitch. Gentle, altitude-neutral turns: this is how a racer flies a banked sweeper.
//   PULL   (everything else: target above / behind / below, inverted, vertical): roll the lift vector ("up") onto the target
//          and pull (or roll "down" onto it and push, with hysteresis). This is how a pilot flies a loop or turns around.
// The flight model maps roll to a BANK ANGLE command (cap +-80 deg), so the pilot outputs roll = desiredBank / cap.
import * as THREE from 'three';
import { clamp, smoothstep } from '../util.js';
import { rollRel } from './flight.js';

const _d = new THREE.Vector3(), _inv = new THREE.Quaternion(), _t = new THREE.Vector3(), _f = new THREE.Vector3();

export function pilotSteer(fs, worldTarget, out, opts) {
  const aggr = opts?.aggressiveness ?? 1, maxBank = Math.min(opts?.maxBank ?? fs.params.maxBank, fs.params.maxBank);
  _d.copy(worldTarget).sub(fs.pos);
  const dist = _d.length();
  if (!(dist > 1e-3)) { out.pitch = 0; out.roll = 0; out.yaw = 0; return 0; }
  _t.copy(_d).divideScalar(dist);                                  // world unit vector to target
  _inv.copy(fs.quat).invert(); _d.copy(_t).applyQuaternion(_inv);   // local: +x right, +y up, forward = -z
  const alpha = Math.acos(clamp(-_d.z, -1, 1));
  const p = fs.params, cap = p.maxBank;
  const phiR = rollRel(fs);
  const upright = fs.up.y > 0.35, notSteep = Math.abs(fs.forward.y) < 0.7;

  if (upright && notSteep && _d.z < -0.5 && alpha < 1.15) {
    // ---- WORLD regime ----
    _f.set(fs.forward.x, 0, fs.forward.z); const fl = _f.length(); _f.divideScalar(fl || 1);
    const tx = _t.x, tz = _t.z, hl = Math.hypot(tx, tz) || 1;
    // signed heading error, + = target is to the right
    const cr = _f.z * tx / hl - _f.x * tz / hl;                    // (f x t).y : + = target to the LEFT
    const dp = _f.x * tx / hl + _f.z * tz / hl;
    const psiErr = Math.atan2(-cr, dp);
    const tau = 0.55 / aggr;
    const sf = clamp(Math.pow(p.cruise / Math.max(fs.speed, p.minSpeed), 0.8), 0.7, 1.25);
    const wMax = p.turnRate * sf * fl;
    const wWant = psiErr / tau;
    const sinB = clamp(wWant / Math.max(wMax, 0.1), -1, 1);
    const bank = clamp(Math.asin(sinB), -maxBank, maxBank);
    out.roll = clamp(bank / cap, -1, 1);
    // elevation: nose follows the target's elevation angle
    const elT = Math.atan2(_t.y, hl), elErr = elT - fs.pitch;
    const qWant = elErr / (0.5 / aggr);
    const lift = Math.max(fs.up.y, 0.4);
    const qMax = p.pitchRate * (qWant >= 0 ? 1 : 0.75);
    out.pitch = clamp(qWant / lift / p.pitchRate, -1, 1);
    // pull a bit extra when banked hard so the turn does not sag
    out.pitch = clamp(out.pitch + 0.0 * qMax, -1, 1);
    out.yaw = 0;
    fs.ctl.push = false;
    return alpha;
  }

  // ---- PULL regime ----
  const k = fs.ctl;
  if (k.push) { if (_d.y > 0.12) k.push = false; } else if (_d.y < -0.35 && alpha < 2.3) k.push = true;   // hysteresis
  const sideAng = Math.abs(_d.x) + Math.abs(_d.y) < 1e-4 ? 0 : (k.push ? -Math.atan2(_d.x, -_d.y) : Math.atan2(_d.x, _d.y));
  // large errors: roll the lift vector onto the target and pull. Small errors: stay flat, pitch and rudder only (roll alignment is
  // noise there, and rolling 90 degrees to fix a 3 degree lateral error would wreck a loop).
  const w = smoothstep(0.12, 0.45, alpha), small = 1 - w;
  const bank = clamp(phiR * small + (phiR + sideAng) * w, -maxBank, maxBank);
  out.roll = clamp(bank / cap, -1, 1);
  const aligned = Math.max(0, Math.cos(sideAng * 0.9)) * (1 - smoothstep(1.2, 2.2, Math.abs(sideAng)));
  const mag = clamp(alpha * 2.6 * aggr, 0, 1) * aligned;
  const fz = Math.max(-_d.z, 1e-3);
  const pitchSmall = clamp(Math.atan2(_d.y, fz) * 3.2 * aggr, -1, 1);
  out.pitch = small * pitchSmall + w * (k.push ? -mag : mag);
  out.yaw = small * clamp(Math.atan2(_d.x, fz) * 3 * aggr, -1, 1);
  return alpha;
}

/** Recovery helper: wings level, nose to the horizon. Works from any attitude (including inverted); writes into out. */
export function pilotLevel(fs, out) {
  const flat = smoothstep(0.25, 0.6, Math.sqrt(fs.up.y * fs.up.y + fs.right.y * fs.right.y));
  const inverted = fs.up.y < 0;
  const phi = fs.phi;
  // roll to upright via the shortest way; command is relative to the current half (bank angle semantics), so go straight for the
  // far side of the cap and let the flight model's levelling finish it
  out.roll = flat > 0.05 ? clamp(-phi * 1.2, -1, 1) : 0;
  if (Math.abs(out.roll) < 0.02 && !inverted) out.roll = clamp(-phi / fs.params.maxBank, -1, 1);
  const sgn = clamp(fs.up.y * 3, -1, 1);
  out.pitch = clamp(-fs.pitch * 1.6 * sgn, -1, 1) * flat;
  out.yaw = 0;
  return out;
}

const _rel = new THREE.Vector3();
/**
 * Bend `target` away from spherical hazards that lie ahead (hazards: [{pos, radius}]). Writes the adjusted point into outTarget
 * and returns true when a hazard is within the look-ahead corridor. opts: { lookAhead (s, default 1.2), margin (m, default 18) }.
 */
export function pilotAvoid(fs, target, hazards, outTarget, opts) {
  const look = (opts?.lookAhead ?? 1.2) * fs.speed, margin = opts?.margin ?? 18;
  outTarget.copy(target);
  let hit = false, best = 1e9;
  for (let i = 0; i < hazards.length; i++) {
    const hz = hazards[i];
    _rel.copy(hz.pos).sub(fs.pos);
    const ahead = _rel.dot(fs.forward);
    if (ahead < 0 || ahead > look + hz.radius) continue;
    // lateral offset of the hazard centre from our flight line
    const lx = _rel.dot(fs.right), ly = _rel.dot(fs.up), off = Math.hypot(lx, ly), need = hz.radius + margin;
    if (off > need || ahead >= best) continue;
    best = ahead; hit = true;
    // steer to the side the hazard is NOT on (prefer sideways, away from the centre)
    let sx = -lx, sy = -ly; const sl = Math.hypot(sx, sy);
    if (sl < 1) { sx = 1; sy = 0; } else { sx /= sl; sy /= sl; }
    const push = (need - off) + 6;
    outTarget.copy(fs.pos).addScaledVector(fs.forward, Math.max(ahead, 40) + 40).addScaledVector(fs.right, sx * (off + push)).addScaledVector(fs.up, sy * (off + push));
  }
  return hit;
}
