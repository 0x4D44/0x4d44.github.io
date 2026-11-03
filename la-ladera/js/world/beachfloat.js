// HOW A FLOATER RIDES THE SWELL (A5, round 7, phase 2b): the pure pose of a buoy, a rope of floats, a boat, from the sea's height around it. The sea (core/sea.js, drawn by engine/water.js, ctx.sea.level) is the
// truth: the water mesh is displaced by it, so a floater that took its own bob from a table would sink under the surface or stand over it. The library's draft puts the waterline on its origin; what is left is the
// height of the surface under the piece and the way the surface leans there.
//
//   floatPose(item, level, t[, out])  -> { y, pitch, roll }   metres over the datum, radians; level(x, z, t) is the swell's height over the still sea (ctx.sea.level)
//   poseMatrix(item, pose, out)       -> out (a THREE.Matrix4)   the instance matrix: its position, yaw, pitch, roll and the plan's scale
//
// The surface is read at four points round the piece, as far out along each axis as the piece reaches (at most 1.2 m: a 7 m boat is not a plank across a 7.5 m wave, it rides it), 80 % of the way to its
// ends: the mean of the four is the heave, the difference along the piece is its pitch, across it its roll. Bow-up pitch is positive (the bow is the library's +Z); starboard-up roll is positive (+X).
// A tilt is clamped to twice the library's rock for the piece (a buoy 12 degrees, a lancha 6): the swell of a windy afternoon leans the surface further than any of them leans. The raft is `rigid`: its floor
// is a patch of the physics world at one height, so it only breathes a few centimetres (the library's bob), and a walker's feet and its deck stay together.
import * as THREE from 'three';
import { SEA } from './coast.js';
import { SIZE } from './waterlib.js';

export const REACH = 1.2;                 // metres: the farthest from a piece's centre that the surface is read
const DEG = Math.PI / 180;
const MIN_TILT = 4 * DEG;                 // a rope of floats rocks 2 degrees in the library; it still follows a 4 degree swell
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);

export function floatPose(it, level, t, out = {}) {
  const f = it.float, [w, , d] = SIZE[it.name];
  if (f.rig === 'rigid') { out.y = SEA + f.bob * Math.sin(t * 1.1 + f.phase); out.pitch = 0; out.roll = 0; return out; }
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw), hz = Math.min(d / 2, REACH) * 0.8, hx = Math.min(w / 2, REACH) * 0.8;
  const bow = level(it.x + s * hz, it.z + c * hz, t), stern = level(it.x - s * hz, it.z - c * hz, t);       // (local +Z in the world is (sin yaw, cos yaw); +X is (cos yaw, -sin yaw))
  const right = level(it.x + c * hx, it.z - s * hx, t), left = level(it.x - c * hx, it.z + s * hx, t);
  const lim = Math.max(f.rock * 2 * DEG, MIN_TILT);
  out.y = SEA + (bow + stern + right + left) / 4;
  out.pitch = Math.max(-lim, Math.min(lim, Math.atan2(bow - stern, 2 * hz)));
  out.roll = Math.max(-lim, Math.min(lim, Math.atan2(right - left, 2 * hx)));
  return out;
}

/** The matrix of an instance: Euler order YXZ (yaw, then pitch, then roll in the piece's own frame) and the plan's scale, as clutterMatrix does (its pitch is the same: bow-up positive). */
export function poseMatrix(it, pose, out = new THREE.Matrix4()) {
  tmpE.set(-pose.pitch, it.yaw, pose.roll, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  if (it.scale) tmpS.set(...it.scale); else tmpS.set(1, 1, 1);
  return out.compose(tmpP.set(it.x, pose.y, it.z), tmpQ, tmpS);
}
