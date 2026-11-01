// Seated legs (R1-D13: the elder on the bench floated). The sit clips are rotation-only (people_build.py): whoever sits, the thigh goes to ~86 degrees with the shin
// upright and the root is lowered so the hip joint is SEAT_HIP above the floor of a SEAT_TOP seat. So a person with short legs (a child, an elder, a small woman) and
// anyone on a taller seat (the bench is 0.49 m) has the soles in the air, by up to 0.25 m.
//
// plantFeet tilts each thigh down, and the shin back by the same angle so it stays upright and the foot flat, just far enough for the sole to meet the floor, as far
// as a person can without sliding off the seat (a child slides further than an adult). The pelvis stays exactly where the seat height put it; a seat too high for the
// legs to reach (a child on an adult bench) leaves the remainder dangling, which is what a child's legs do.
//
// seatFloatM / plantedFloatM (and kneeReachM, how far the knee is in front of the hip) are the same arithmetic without a skeleton, for the Node tests and the sim: they live in seatmodel.js
// (pure, no THREE) and are re-exported here, so whoever imported them from legs.js still does (every character is one body scaled: thigh = LEG.thigh x hip height, and the clips put it at
// acos(LEG.cosThigh) from straight down; tests/people-seats.mjs measures the skinned meshes and holds these numbers to the rig).
import * as THREE from 'three';
import { LEG, FLOAT_OK, minThigh } from './seatmodel.js';

export * from './seatmodel.js';

// ---- the live skeleton ------------------------------------------------------------------------------------------------------------------------------
const DOWN = new THREE.Vector3(0, -1, 0);
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _d = new THREE.Vector3(), _ax = new THREE.Vector3();
const _qd = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

/**
 * Plant the soles of the seated rig `inst` on the floor at world height `floorY`. Call it right after the mixer wrote the pose: it works from the pose that is there,
 * so it is idempotent (feet already down: nothing moves) and a crossfade from standing never kicks a leg. `lib` supplies the ankle height above the sole (rest pose).
 * Returns the float left over, m (0 = feet on the floor; the larger of the two legs), or null when the rig has no legs.
 */
export function plantFeet(lib, inst, floorY) {
  const b = inst.bones; if (!b?.thigh_l || !b.shin_l || !b.foot_l || !b.thigh_r || !b.shin_r || !b.foot_r) return null;
  const rest = lib.restQuat(inst.id, 'foot_l'); if (!rest) return null;
  const ankle = rest.p.y, lowest = minThigh(inst.meta?.heightM ?? 1.7);
  inst.root.updateMatrixWorld(true);
  let left = 0;
  for (const s of ['l', 'r']) {
    const thigh = b['thigh_' + s], shin = b['shin_' + s], foot = b['foot_' + s];
    thigh.getWorldPosition(_p0); shin.getWorldPosition(_p1); foot.getWorldPosition(_p2);
    const float = _p2.y - ankle - floorY;
    if (float > FLOAT_OK) {
      _d.subVectors(_p1, _p0); const T = _d.length(), cosA = Math.max(-1, Math.min(1, -_d.y / T)), A = Math.acos(cosA);
      if (T > 1e-4) {
        const A2 = Math.max(lowest, Math.acos(Math.min(1, cosA + float / T)));      // never below `lowest`: a leg that hangs (standing, or crossfading from it) is never tilted
        _ax.crossVectors(DOWN, _d); const len = _ax.length();
        if (A2 < A - 1e-5 && len > 1e-4) {
          _ax.multiplyScalar(1 / len); _qd.setFromAxisAngle(_ax, A2 - A);          // about the axis that opens the thigh from straight down: negative closes it
          const Wp = thigh.parent.getWorldQuaternion(_qa), Wt = thigh.getWorldQuaternion(_qb);
          thigh.quaternion.premultiply(_qi.copy(Wp).invert().multiply(_qd).multiply(Wp));   // the thigh turns by qd in the world
          shin.quaternion.premultiply(_qi.copy(Wt).invert().multiply(_qd.invert()).multiply(Wt));   // and the shin turns back: it keeps its world orientation
          thigh.updateMatrixWorld(true);
          foot.getWorldPosition(_p2);
        }
      }
    }
    left = Math.max(left, _p2.y - ankle - floorY);
  }
  return left;
}
