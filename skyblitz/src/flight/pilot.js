// STUB steering helper used by AI pilots, the player autopilot and attract mode. The flight agent REPLACES the internals
// (PD control with lookahead, bank-to-turn coordination, loop/inverted handling) but keeps this signature.
// pilotSteer(fs, worldTarget, out, opts) writes pitch/roll/yaw into out (a Controls object) and returns the angular error (rad).
import * as THREE from 'three';
import { clamp } from '../util.js';

const _d = new THREE.Vector3(), _inv = new THREE.Quaternion();

export function pilotSteer(fs, worldTarget, out, { aggressiveness = 1 } = {}) {
  _d.copy(worldTarget).sub(fs.pos).normalize();
  _inv.copy(fs.quat).invert(); _d.applyQuaternion(_inv);        // local frame: +x right, +y up, forward = -z
  out.roll = clamp(_d.x * 3 * aggressiveness, -1, 1);
  out.pitch = clamp(_d.y * 3 * aggressiveness, -1, 1);
  out.yaw = 0;
  return Math.acos(clamp(-_d.z, -1, 1));
}
