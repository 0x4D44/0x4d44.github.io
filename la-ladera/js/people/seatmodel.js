// The seated body without a skeleton: the numbers of the sit clips and the sums over them (R1-D13 legs, R3-026 knees). PURE (no THREE): the sim indoors (homelife.js) and the Node tests use them,
// legs.js bends the live skeleton by the same arithmetic and re-exports every name here. Every character is one body scaled: the thigh is LEG.thigh x hip height, and the sit clips
// (people_build.py) put it at acos(LEG.cosThigh) from straight down with the shin upright and the hip joint SEAT_HIP above the floor of a SEAT_TOP seat; tests/people-seats.mjs measures
// the skinned meshes of the built characters and holds these numbers to the rig.

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

/**
 * How far in front of the hip joint the knee is (m) of a person with `meta` (hipHeightM, heightM) sat on a seat `sitH` high once the feet are planted: the thigh's length times the sine of its angle
 * from straight down, where plantedFloatM leaves it. 0.15 m for a six-year-old on a sofa (her thigh is tilted down to the floor), 0.35 to 0.40 m for an adult.
 */
export function kneeReachM(meta, sitH) {
  const T = LEG.thigh * meta.hipHeightM, f = seatFloatM(meta, sitH);
  const A = f <= FLOAT_OK ? SIT_THIGH : Math.max(minThigh(meta.heightM), Math.acos(Math.min(1, LEG.cosThigh + f / T)));
  return T * Math.sin(A);
}

/** The most float a person of `meta` is allowed on a seat they can reach: an adult's feet are on the floor (5 cm), a child's legs may dangle (10 cm). */
export const floatBudget = (meta) => (meta.heightM < CHILD_M ? 0.10 : 0.05);
