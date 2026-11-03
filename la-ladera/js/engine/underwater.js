// THE VIEW FROM UNDER THE SEA (A1, round 8, engine patch 3; dev/FEATURE-BEACH.md 2.2): the numbers and the pure rules. No THREE, no DOM: engine/look.js applies them to the fog, the lights, the sky and the grade,
// engine/water.js draws the surface from below with them, engine/post.js reads the grade, and tests/engine-underwater.test.mjs holds the curves.
//
//   depth = how far the CAMERA is under the surface at its own place (core/sea.js `under`: still sea + swell - y), negative above it
//   blend(depth)           0 above 2 cm, 1 from 14 cm, a smoothstep between: the one number everything below follows (`look.state.uw`)
//   fogDensity(depth)      FogExp2: 0.06 at the surface to 0.10 at 3 m (90 % fogged at about 25 m and 15 m)
//   fogColor(day, out)     the water's colour, linear, by the daylight (the night view is nearly black)
//   lightScale(uw, depth)  what is left of the sun and the sky light: a fifth gone at the surface, more with depth
//   grade(uw, breath, out) { sat, vig, cool, warm } for the post chain's LaderaGrade: bluer, 0.85 saturation, a 0.38 vignette that closes when the breath is going
//   causticAt(depth)       how much of the caustic term shows on the seabed at a depth of still water (engine/shaderpatch.js)
// The land's values are the defaults of engine/post.js and engine/look.js (LAND), so that `uw` = 0 gives them back exactly.

import { SUBMERGED } from '../core/sea.js';

/** Linear light. */
export const UW = Object.freeze({
  DETECT: SUBMERGED,                              // under the surface by more than this is under (2 cm; core/sea.js `submerged` and the water's own test are the same number)
  BLEND: 0.12,                                    // the blend takes this much more depth
  NORTH: 100,                                     // no sea north of the plot's wall: `uw` is never asked for there (the land's frames cost nothing)
  FOG: Object.freeze([0.02, 0.30, 0.36]),         // the water's colour in full daylight
  NIGHT: 0.10,                                    // the share of it left in the dark
  DENSITY: Object.freeze({ surface: 0.06, deep: 0.10, at: 3.0 }),
  LIGHT: Object.freeze({ surface: 0.80, deep: 0.40, at: 6.0 }),   // the light that is left at the surface, and at 6 m or more
  TINT: 0.55,                                     // how far the sun and the sky light are tinted toward the water's colour
  BLOOM: 0.5,                                     // the bloom's strength is halved under the sea (and its threshold lifted)
  SAT: 0.85, VIG: 0.38, BREATH_VIG: 0.34,         // the grade, and how much vignette the last 15 s of breath add
  COOL: Object.freeze([0.74, 0.97, 1.12]), WARM: Object.freeze([0.90, 1.0, 1.08]),
  SKY_OFF: 0.5,                                   // the dome is hidden from this blend on (the surface seen from below covers it, and the fog is its colour)
  FAR: 60,                                        // camera.far under the sea (engine/visibility.js)
});
/** What the land has: the grade's defaults (engine/post.js GradeShader) and the dome's: UW.* blends from these. */
export const LAND = Object.freeze({ vig: 0.30, cool: Object.freeze([0.93, 0.99, 1.07]), warm: Object.freeze([1.045, 1.0, 0.93]) });

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

/** 0 when the camera is not under the surface (less than 2 cm), 1 from 14 cm, a smoothstep between. `depth` is metres under, negative above. */
export const blend = (depth) => smooth((depth - UW.DETECT) / UW.BLEND);

/** The sea's fog density at a depth (the deeper the denser): 0.06 at the surface, 0.10 from 3 m. Land: whatever the sky's palette says (the caller blends). */
export const fogDensity = (depth) => lerp(UW.DENSITY.surface, UW.DENSITY.deep, clamp01(depth / UW.DENSITY.at));

/** The water's colour by the daylight (`day` 0 night .. 1 day: look.state.day), written into `out` ([r, g, b], linear). */
export function fogColor(day, out = [0, 0, 0]) {
  const k = UW.NIGHT + (1 - UW.NIGHT) * clamp01(day);
  out[0] = UW.FOG[0] * k; out[1] = UW.FOG[1] * k; out[2] = UW.FOG[2] * k;
  return out;
}

/** The share of the sun and the sky light that is left: the land's light times this (1 at uw = 0). */
export const lightScale = (uw, depth) => 1 - uw * (1 - lerp(UW.LIGHT.surface, UW.LIGHT.deep, smooth(depth / UW.LIGHT.at)));

/**
 * The grade for the post chain at a blend: saturation (`sat0` is the palette's, 0.95 to 1.08), the vignette (closing with `breath`, 0..1, the last stretch of the breath: engine/swim.js breathSoft) and the
 * two colour multipliers of LaderaGrade (cool shadows, warm highlights). Written into `out` ({ sat, vig, cool: [r, g, b], warm: [r, g, b] }).
 */
export function grade(uw, breath = 0, sat0 = 1.0, out = { sat: 0, vig: 0, cool: [0, 0, 0], warm: [0, 0, 0] }) {
  out.sat = lerp(sat0, UW.SAT, uw);
  out.vig = lerp(LAND.vig, UW.VIG, uw) + UW.BREATH_VIG * clamp01(breath) * uw;
  for (let i = 0; i < 3; i++) { out.cool[i] = lerp(LAND.cool[i], UW.COOL[i], uw); out.warm[i] = lerp(LAND.warm[i], UW.WARM[i], uw); }
  return out;
}

/** How much of the caustic term shows on the seabed at `depth` metres of still water: none in the swash, full from 0.4 m, fading out toward 5 m (the same ramp as the sea layer's own, engine/water.js, but to 5 m). */
export const causticAt = (depth) => smooth((depth - 0.1) / 0.3) * (1 - smooth((depth - 3.0) / 2.0));
