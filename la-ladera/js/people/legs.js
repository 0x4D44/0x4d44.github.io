// Seated legs (R1-D13: the elder on the bench floated). The sit clips are rotation-only (people_build.py): whoever sits, the thigh goes to ~86 degrees with the shin
// upright and the root is lowered so the hip joint is SEAT_HIP above the floor of a SEAT_TOP seat. So a person with short legs (a child, an elder, a small woman) and
// anyone on a taller seat (the bench is 0.49 m) has the soles in the air, by up to 0.25 m.
//
// plantFeet tilts each thigh down, and the shin back by the same angle so it stays upright and the foot flat, just far enough for the sole to meet the floor, as far
// as a person can without sliding off the seat (a child slides further than an adult). The pelvis stays exactly where the seat height put it; a seat too high for the
// legs to reach (a child on an adult bench) leaves the remainder dangling, which is what a child's legs do.
//
// seatFloatM / plantedFloatM are the same arithmetic without a skeleton, for the Node tests and the sim (every character is one body scaled: thigh = LEG.thigh x hip
// height, and the clips put it at acos(LEG.cosThigh) from straight down; tests/people-seats.mjs measures the skinned meshes and holds these numbers to the rig).
import * as THREE from 'three';

export const SEAT_TOP = 0.445;            // seat height the sit clips were authored for (people_build.py SEAT_TOP); sim.js re-exports the same number
export const SEAT_HIP = 0.53;             // the seated hip joint above the floor (people_build.py SEAT_HIP)
export const LEG = { thigh: 0.4453, cosThigh: 0.0506 };
export const CHILD_M = 1.40;              // below this standing height a person slides forward on the seat further to reach the floor
export const SLOPE_ADULT = 0.45, SLOPE_CHILD = 0.80;   // radians the thigh may tilt below where the sit clips put it (26 and 46 degrees)
export const FLOAT_OK = 0.002;            // under this many metres of float nothing is done
export const SIT_THIGH = Math.acos(LEG.cosThigh);      // the thigh of the sit clips, radians from straight down (1.52 = 87 degrees)

export const maxSlope = (heightM) => (heightM < CHILD_M ? SLOPE_CHILD : SLOPE_ADULT);
/** The smallest angle from straight down a thigh may be tilted to, radians: an absolute bound, so planting twice never tilts it further. */
export const minThigh = (heightM) => SIT_THIGH - maxSlope(heightM);

/** How far the soles are above the floor (m; negative = in it) of a person with `meta` (hipHeightM) sat on a seat `sitH` high, before planting. */
export function seatFloatM(meta, sitH) {
  const hip = meta.hipHeightM, T = LEG.thigh * hip;
  return (SEAT_HIP - hip) + T * (1 - LEG.cosThigh) + (sitH - SEAT_TOP);
}

/** The same after planting the feet: what is left of the float once the thigh has tilted as far as `maxSlope(meta.heightM)` lets it. */
export function plantedFloatM(meta, sitH) {
  const f = seatFloatM(meta, sitH); if (f <= FLOAT_OK) return f;
  const T = LEG.thigh * meta.hipHeightM;
  const A2 = Math.max(minThigh(meta.heightM), Math.acos(Math.min(1, LEG.cosThigh + f / T)));
  return f - T * (Math.cos(A2) - LEG.cosThigh);
}

/** The most float a person of `meta` is allowed on a seat they can reach: an adult's feet are on the floor (5 cm), a child's legs may dangle (10 cm). */
export const floatBudget = (meta) => (meta.heightM < CHILD_M ? 0.10 : 0.05);

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
