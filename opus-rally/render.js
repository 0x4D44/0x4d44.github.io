// Everything the player sees. This module owns the scene graph, the camera
// rigs, the lighting rig's shadow fitting, the particle systems, the hand-written
// post chain and the level-of-detail budget. It reads the car, the stage and the
// weather; it never writes to any of them.
//
// Two rules shape the whole file.
//
// Nothing allocates on the per-frame path. Every vector, matrix, colour and
// typed array update() touches is a module-scope scratch or a pool slot, because
// a Vector3 per particle per frame is a stutter you can see and cannot profile
// away afterwards.
//
// Everything a stage creates goes into a resource bin, so clearStage() hands all
// of it back — geometries, materials, textures and render targets — and is safe
// to call twice.
//
// The maths that decides where a camera sits, which LOD a tree gets, how much
// dust a wheel throws, how big a shadow frustum has to be and when to give up a
// quality level lives in pure exported functions at the top, above any THREE
// code. That part is testable under Node, and it is also the part that decides
// whether the game feels like a rally car or like a boom arm bolted to a brick.

import * as THREE_DEFAULT from "./three.module.min.js";
import {
  clamp, saturate, lerp, damp, smoothstep, angleDelta, wrapAngle,
} from "./mathx.js";
import { makeRng, hash3 } from "./rng.js";
import { SURFACE, surfaceProps } from "./surfaces.js";

const PHYSICS_DT = 1 / 200;

// Headlamps. `useLegacyLights` is off, so a spot light's intensity is a real
// photometric quantity on the same scale as weather.js's sun, and these are it —
// at the 42 the lamps shipped at, the road under the beam came out no brighter
// than the road beside it.
//
// The beam pattern is the spot cone itself: aimed at the road `reach` metres out
// with a full penumbra, the angular falloff runs from the axis (the far road) to
// the rim (the ground under the nose), which is what puts the hot spot down the
// stage instead of on the bumper. `decay` is 1 rather than 2 on purpose. A real
// reflector concentrates its output towards the axis by roughly the square of
// the distance it is compensating for, and a smoothstep cone cannot; under the
// true square law from a lamp 0.74 m up, the road at 6 m clips white while the
// road at 30 m is already black. Decay 1 stands in for the missing pattern and
// `distance` closes the beam off rather than letting it wash the hillside.
//
// Every number here is sized against the tone curve, not against how it looks in
// linear. The composite multiplies by the preset's exposure — 1.5 on night-clear
// — and then runs ACES, so a road radiance much over 0.45 lands within a couple
// of 8-bit codes of white. The first version aimed a 0.15 rad pod at 60 m, which
// put the cone's own rim on the road 4.5 m out: a 4–13 m plateau where a light
// gravel grain and a dark one came out 251 and 254, one white hole with no
// surface in it.
//
// Narrowing the pod moves its rim past 8 m so the near ground is left to the
// dipped pair, and the pair is toed far enough apart to read as two pools with
// the crown darker between them rather than as one merged blob. `mainToe` is a
// distance at `mainReach`, so the two only stay apart if it moves with it: at
// the 3.0 first tried against a reach of 36 the splay fell from 0.108 rad to
// 0.083 and the pair merged into one blob by 6.5 m. Do not widen the
// pod to soften its edge: because a spot's attenuation is 1 on the axis whatever
// the angle, widening only lets the near ground into the beam, where 1/d^2 is
// largest. At 0.14 rad the peak walked from 12.5 m in to 9 m and the hot spot
// went 184 to 219.
//
// What moved after that was the level, not the shape. The pod at 620 put 3.9 lx
// of peak on the road, gravel's own albedo tone mapped that to 218/255, and the
// bright end of the road texture — around 0.6 against the surface's 0.35 mean —
// photographed at 233–247 across the whole 6–20 m core: white, with the grain
// gone. It is not the bloom; forcing u.uBloom.value to 0 moved the same road
// strips by under two levels (183.7 to 185.4 at 20 m) and the frame mean not at
// all. The rig runs at about seven tenths of that now, which costs nothing in
// contrast because the night grade's black point came down with it, and the
// reach it loses is bought back by aiming the pod at 70 m and opening `distance`
// — the 80 m cutoff was squaring away four fifths of what reached 70 m.
export const HEADLIGHT = Object.freeze({
  decay: 1,
  distance: 110,
  mainAngle: 0.24,
  mainReach: 30,
  mainIntensity: 75,
  mainToe: 4.2,
  podAngle: 0.085,
  podReach: 70,
  podIntensity: 420,
  spillAngle: 0.50,
  spillReach: 10,
  spillIntensity: 14,
});

// The visible light cone in the air. Baked into the geometry rather than applied
// as a scale — see buildHeadlights(). It is scattered light, so it only exists
// when there is something to scatter off; BEAM_FOG_FLOOR is that threshold.
const BEAM_LENGTH = 26;
const BEAM_RADIUS = BEAM_LENGTH * Math.tan(HEADLIGHT.mainAngle * 0.62);
const BEAM_FOG_FLOOR = 0.18;

// The texture slots worth filtering anisotropically: the ones sampled across a
// surface the camera sees edge-on.
const ANISO_MAPS = Object.freeze(["map", "normalMap", "roughnessMap", "aoMap"]);

// Used only when a sample arrives without one — every car in physics.js carries
// its own, and they span 0.445 to 0.52 m.
const DEFAULT_COM_HEIGHT = 0.49;

// The other two chassis dimensions an in-car mount has to be measured against.
// The front axle is the datum for everything forward of the driver, and the cars
// put it between 0.92 and 1.42 m ahead of the centre of mass: half a metre of
// spread, which is more than the length of the cabin the eye has to sit inside.
const DEFAULT_FRONT_AXLE = 1.05;
const DEFAULT_HALF_WIDTH = 0.70;

// ---- the cabin -----------------------------------------------------------
//
// The interior sits inside the car's own shadow with its albedos held under the
// 0.20 linear cap the material band puts on trim, so in daylight nothing in the
// cockpit reaches luminance 25/255: the instrument face, its ticks and its needle
// all land inside one three-level band. That is a lighting fault rather than an
// albedo one — a real cabin is lit by sky through the glasshouse, and at night by
// its own instruments.
//
// `fillDecay: 0` is the whole of the trick. Three's point falloff is
// `1/pow(d, decay)` windowed by `(1 - (d/distance)^4)^2`, so at decay 0 the light
// is a CONSTANT irradiance inside its cutoff that goes smoothly to nothing at the
// rim: an ambient term that still has a direction, which is what a cabin fill is.
// An inverse-square lamp inside a 1.5 m box burns whatever sits 0.2 m from it and
// leaves the far end of the fascia at a twentieth of the same number. The cutoff
// is what keeps it off the road under the car and off the wheels, and every
// exterior panel is turned away from it and takes nothing from it anyway.
export const CABIN = Object.freeze({
  // Under the headliner, which is what puts the road just outside the cutoff on
  // every car in the book: the shortest roof is the heritage class at 1.325 m,
  // so the light hangs 1.105 m over the surface and the fill's own window has
  // already taken 94% out of it by the time it gets there.
  fillDrop: 0.22,          // metres below the roof line
  fillAxle: -1.02,         // metres from the front axle, the datum meshes.js hangs
                           // the whole cabin off — see CAMERA_PARAMS
  fillDistance: 1.10,
  fillDecay: 0,
  // Per unit of what the sky and the beam are actually giving the scene, so the
  // cabin darkens under cloud and goes out at dusk with no curve of its own.
  //
  // fillSky is a FORM FACTOR and so must stay under one: the cabin cannot see
  // more sky than the outside of the car does. At 0.90 of (hemisphere + ambient),
  // times the 0.86 the dial faces get out of N.L and the 0.93 the window leaves,
  // a dial takes about three quarters of the sky the roof takes — which is about
  // what a glasshouse this size is worth. Measured on the instrument pod at the
  // start of kloft-bjornhalt in golden hour, 1280x720, quality medium, the car
  // stopped on the brake: mean luminance 16.5 -> 36.6, and the 5th-to-95th
  // spread 9-26 -> 20-60.
  fillSky: 0.90,
  fillKey: 0.055,
  // The instrument backlight: warm, and short enough that it reaches the dials,
  // the wheel rim and the driver's hands and nothing else. It comes up with the
  // headlights, because that is the switch a driver actually turns.
  glowRise: 0.06,          // metres above the belt line, where the fascia top is
  glowAxle: -0.74,
  glowDistance: 0.62,
  glowDecay: 2,
  glowIntensity: 0.030,
  glowColour: 0xffb45a,
  // Full scale on the two dials that are not the tachometer.
  speedoFullScale: 69.4,   // m/s, i.e. 250 km/h
  // Fallbacks for a car with no modelled body, in metres above the centre of
  // mass. fitCabinRig replaces both from carDimensions when there is one.
  fallbackFillY: 0.66,
  fallbackGlowY: 0.47,
});

// The in-cabin shift bar lights over the same rpm band hud.js lights its twelve
// LEDs over, so the two can never disagree about when to change gear.
const SHIFT_BEGIN = 0.62;
const SHIFT_FULL = 0.985;

// How far outside the view a scenery cell is still worth drawing: enough that a
// caster at the edge of the picture keeps the shadow it throws into it.
const SCENERY_CULL_PAD = 28;

// ---- quality -------------------------------------------------------------

export const QUALITY_LEVELS = Object.freeze(["low", "medium", "high", "ultra"]);

// Resolution steps the autoscaler walks *before* it gives up a quality level: a
// slightly soft image at the full effect reads better than a sharp one with the
// shadows and the dust switched off.
export const SCALE_STEPS = Object.freeze([1.0, 0.86, 0.74, 0.62]);

const QUALITY = Object.freeze({
  low: Object.freeze({
    name: "low",
    shadows: false,
    shadowMapSize: 1024,
    shadowDistance: 45,
    particleBudget: 600,
    particleRateScale: 0.45,
    trailCount: 180,
    bloom: false,
    bloomIterations: 1,
    chroma: 0,
    vignette: 0.22,
    radialBlur: false,
    grade: true,
    dither: true,
    post: false,
    sceneryDistance: 240,
    sceneryBudget: 260,
    lodBands: Object.freeze([32, 90, 200]),
    pixelRatioCap: 1.0,
    anisotropy: 1,
    msaa: 0,
    beams: false,
    headlightShadows: false,
    terrainSkip: 3,
  }),
  medium: Object.freeze({
    name: "medium",
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 65,
    particleBudget: 1600,
    particleRateScale: 0.75,
    trailCount: 360,
    bloom: true,
    bloomIterations: 1,
    chroma: 0.4,
    vignette: 0.3,
    radialBlur: false,
    grade: true,
    dither: true,
    post: true,
    sceneryDistance: 420,
    sceneryBudget: 620,
    lodBands: Object.freeze([45, 130, 330]),
    pixelRatioCap: 1.35,
    anisotropy: 4,
    msaa: 2,
    beams: true,
    headlightShadows: false,
    terrainSkip: 2,
  }),
  high: Object.freeze({
    name: "high",
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 90,
    particleBudget: 3200,
    particleRateScale: 1.0,
    trailCount: 700,
    bloom: true,
    bloomIterations: 2,
    chroma: 0.7,
    vignette: 0.34,
    radialBlur: true,
    grade: true,
    dither: true,
    post: true,
    sceneryDistance: 700,
    sceneryBudget: 1100,
    lodBands: Object.freeze([55, 160, 460]),
    pixelRatioCap: 1.75,
    anisotropy: 8,
    msaa: 4,
    beams: true,
    headlightShadows: false,
    terrainSkip: 1,
  }),
  ultra: Object.freeze({
    name: "ultra",
    shadows: true,
    shadowMapSize: 3072,
    shadowDistance: 120,
    particleBudget: 4400,
    particleRateScale: 1.3,
    trailCount: 1100,
    bloom: true,
    bloomIterations: 3,
    chroma: 1.0,
    vignette: 0.36,
    radialBlur: true,
    grade: true,
    dither: true,
    post: true,
    sceneryDistance: 1100,
    sceneryBudget: 1900,
    lodBands: Object.freeze([70, 210, 600]),
    pixelRatioCap: 2.0,
    anisotropy: 16,
    msaa: 4,
    beams: true,
    headlightShadows: true,
    terrainSkip: 1,
  }),
});

export function qualitySettings(level) {
  return QUALITY[level] || QUALITY.high;
}

// ---- camera rigs ---------------------------------------------------------

export const CAMERA_MODES = Object.freeze([
  "chase", "chaseClose", "bonnet", "cockpit", "bumper", "tv", "finish",
]);

// What the camera key steps through. "finish" is entered by the state machine,
// not by the player, so it is deliberately not in the cycle.
export const CAMERA_CYCLE = Object.freeze([
  "chase", "chaseClose", "bonnet", "cockpit", "bumper", "tv",
]);

// kind:
//   boom   — a spring behind the car, aimed down the velocity
//   mount  — rigidly attached to the chassis, with head inertia
//   fixed  — a roadside anchor the director cuts between
//   orbit  — the finish flourish
//
// fovBase === fovMax means the camera never pumps, which is what the in-car
// views want: a field of view that breathes on a bonnet cam reads as a zoom
// lens wobble, not as speed.
//
// A mount is authored in the frame each of its three axes actually means
// something in, because none of the three is the centre of mass:
//   mountY     — height above the *road*. mountPosition() takes the car's COM
//                height back out. Mixing the frames put every in-car camera half
//                a metre too high.
//   localZAxle — metres from the *front axle*, because meshes.js hangs the whole
//                cabin off it: the screen base is frontAxle - 0.30, the roof's
//                leading edge frontAxle - 1.10, the seat frontAxle - 1.15. The
//                axle sits 0.92 m ahead of the COM on one car and 1.42 on
//                another, so a constant COM offset that seats the driver in one
//                car puts him through the screen of the next.
//   localXFrac — a fraction of the body's half width, which is where meshes.js
//                puts the seats (±0.46) and the wheel (−0.44).
//
// The in-car mounts are therefore anchored on the modelled cabin and verified
// against it by raycast, not eyeballed. Their roll and pitch gains are
// deliberately small — a head bolted to the chassis rolls with the body, three
// or four degrees, not with lateral g. At the old 0.92 the horizon tilted
// seventeen degrees in a corner and the bodywork swung up over the road.
//
// `lookIntoCorner` and `slipLook` are radians of aim rotation at full signal:
// negative yaw rate is a left-hand corner (world forward is `(sin yaw, cos yaw)`,
// so yaw *decreases* turning left), and a positive slip angle is the car sliding
// to its right, which puts the apex further left still. Both therefore rotate the
// aim the same way, and both were signed the other way round — every in-car
// camera looked out of the corner rather than into it.
const CAMERA_PARAMS = Object.freeze({
  chase: Object.freeze({
    mode: "chase", kind: "boom",
    distance: 6.9, height: 2.40, riseWithSpeed: 0.010,
    lookAhead: 13.5, lookHeight: 1.15, lookVertGain: 0.16,
    posRate: 4.6, posRateSpeed: 0.075, aimRate: 6.4, dirRate: 3.2,
    velocityBlend: 0.78, velRefSpeed: 14,
    // THREE.PerspectiveCamera.fov is VERTICAL. These were authored as though
    // it were horizontal: 62 vertical is 94 horizontal at 16:9, and 90 is 121 —
    // a fisheye that drags the horizon to the middle of the frame and flattens
    // every corner. Worse, fovRefSpeed is a SPEED and the old name fovRef was
    // handed the same number as fovBase: 62 m/s is 223 km/h, so the widening
    // effect was dead across the whole band anyone actually drives.
    fovBase: 40, fovMax: 46, fovStart: 8, fovRefSpeed: 32, fovRate: 2.4,
    rollGain: 0.055, pitchGain: 0.030, attRate: 5.0,
    shake: 0.20, shakeSpeed: 34, clearance: 1.25,
    airLift: 1.1, airRate: 1.6,
    headInertia: 0, lookIntoCorner: 0.30, slipLook: 0.34,
    near: 0.35, far: 6000,
  }),
  chaseClose: Object.freeze({
    mode: "chaseClose", kind: "boom",
    distance: 4.35, height: 1.82, riseWithSpeed: 0.006,
    lookAhead: 10.0, lookHeight: 0.95, lookVertGain: 0.12,
    posRate: 6.2, posRateSpeed: 0.09, aimRate: 7.6, dirRate: 4.0,
    velocityBlend: 0.86, velRefSpeed: 12,
    fovBase: 44, fovMax: 50, fovStart: 8, fovRefSpeed: 30, fovRate: 2.8,
    rollGain: 0.072, pitchGain: 0.038, attRate: 5.6,
    shake: 0.26, shakeSpeed: 34, clearance: 0.95,
    airLift: 0.8, airRate: 1.9,
    headInertia: 0, lookIntoCorner: 0.38, slipLook: 0.42,
    near: 0.3, far: 6000,
  }),
  // On the scuttle, 0.06 m clear of the bodywork and 0.18 m ahead of the screen
  // base, so the bonnet fills the bottom fifth of the frame. At the old 1.20 m
  // ahead of the centre of mass it hung past the nose of half the cars: a bonnet
  // camera with no bonnet in it, and the ground four metres ahead filling the
  // lower half of the picture instead.
  bonnet: Object.freeze({
    mode: "bonnet", kind: "mount",
    localXFrac: 0, mountY: 1.06, localZAxle: -0.12,
    lookAhead: 22, lookHeight: 0.25, lookVertGain: 0,
    posRate: 30, posRateSpeed: 0, aimRate: 12, dirRate: 8,
    velocityBlend: 0, velRefSpeed: 14,
    fovBase: 52, fovMax: 52, fovStart: 8, fovRefSpeed: 32, fovRate: 3,
    rollGain: 0.11, pitchGain: 0.10, attRate: 9,
    shake: 0.055, shakeSpeed: 46, clearance: 0.05,
    airLift: 0, airRate: 2,
    headInertia: 3.4, headGain: 0.020, lookIntoCorner: 0.10, slipLook: 0.22,
    near: 0.12, far: 6000,
  }),
  // Over the driver's seat and under the headliner: frontAxle − 1.24 is 0.09 m
  // behind the seat's own datum and 0.14 m behind the roof's leading edge. At the
  // old COM-relative −0.02 the eye sat *forward* of that leading edge, in the
  // windscreen aperture — 84 mm under the glass, with the whole length of the
  // bonnet below it and nothing of the cabin in frame.
  cockpit: Object.freeze({
    mode: "cockpit", kind: "mount",
    localXFrac: -0.46, mountY: 1.16, localZAxle: -1.24,
    lookAhead: 20, lookHeight: 0.30, lookVertGain: 0,
    posRate: 26, posRateSpeed: 0, aimRate: 9.5, dirRate: 8,
    velocityBlend: 0, velRefSpeed: 14,
    fovBase: 48, fovMax: 48, fovStart: 8, fovRefSpeed: 32, fovRate: 3,
    rollGain: 0.10, pitchGain: 0.10, attRate: 7.5,
    shake: 0.038, shakeSpeed: 42, clearance: 0.05,
    airLift: 0, airRate: 2,
    headInertia: 2.6, headGain: 0.028, lookIntoCorner: 0.16, slipLook: 0.34,
    near: 0.08, far: 6000,
  }),
  bumper: Object.freeze({
    mode: "bumper", kind: "mount",
    localXFrac: 0, mountY: 0.42, localZAxle: 0.55,
    lookAhead: 26, lookHeight: 0.10, lookVertGain: 0,
    posRate: 34, posRateSpeed: 0, aimRate: 13, dirRate: 8,
    velocityBlend: 0, velRefSpeed: 14,
    fovBase: 54, fovMax: 54, fovStart: 8, fovRefSpeed: 32, fovRate: 3,
    rollGain: 0.12, pitchGain: 0.10, attRate: 10,
    shake: 0.070, shakeSpeed: 50, clearance: 0.05,
    airLift: 0, airRate: 2,
    headInertia: 5.0, headGain: 0.012, lookIntoCorner: 0.06, slipLook: 0.14,
    near: 0.08, far: 6000,
  }),
  tv: Object.freeze({
    mode: "tv", kind: "fixed",
    distance: 0, height: 0,
    lookAhead: 2.5, lookHeight: 0.55, lookVertGain: 0,
    posRate: 9, posRateSpeed: 0, aimRate: 3.4, dirRate: 4,
    velocityBlend: 0, velRefSpeed: 14,
    fovBase: 26, fovMax: 36, fovStart: 6, fovRefSpeed: 30, fovRate: 1.1,
    rollGain: 0, pitchGain: 0, attRate: 4,
    shake: 0.010, shakeSpeed: 12, clearance: 0.4,
    airLift: 0, airRate: 2,
    headInertia: 0, lookIntoCorner: 0, slipLook: 0,
    near: 0.5, far: 8000,
  }),
  finish: Object.freeze({
    mode: "finish", kind: "orbit",
    distance: 9.5, height: 2.8,
    lookAhead: 0.5, lookHeight: 0.85, lookVertGain: 0,
    posRate: 2.2, posRateSpeed: 0, aimRate: 3.0, dirRate: 2,
    velocityBlend: 0, velRefSpeed: 14,
    fovBase: 36, fovMax: 36, fovStart: 8, fovRefSpeed: 32, fovRate: 1.5,
    rollGain: 0, pitchGain: 0, attRate: 3,
    shake: 0, shakeSpeed: 10, clearance: 1.0,
    airLift: 0, airRate: 2,
    orbitRate: 0.34, orbitRise: 1.6,
    headInertia: 0, lookIntoCorner: 0, slipLook: 0,
    near: 0.3, far: 8000,
  }),
});

export function cameraParams(mode) {
  return CAMERA_PARAMS[mode] || CAMERA_PARAMS.chase;
}

// ---- framing for a frame that is not 16:9 --------------------------------
//
// Every number above was authored against a landscape window, and a phone held
// upright is not that window with the sides cropped off. THREE's fov is
// vertical, so a portrait frame keeps the whole vertical field and throws the
// horizontal away: at 390x844 the chase camera's 40 degrees vertical is 19
// horizontal, a 2.3 m slot at the boom's own length. The road does not fit
// through it, and what the player gets is the terrain bank beside it, close and
// filling three quarters of a tall picture.
//
// Widening alone cannot fix it — a true horizontal-preserving widen wants 109
// degrees vertical, which is a fisheye. So the fov opens as far as it usefully
// can and the *rig* takes the rest: the boom rises, comes in, and aims further
// down the road, which is the framing a tall window actually wants — the car low
// in the frame with the stage running away up it, rather than the same eye level
// with more sky above and more verge below.
export const CAMERA_DESIGN_ASPECT = 16 / 9;
const PORTRAIT_ASPECT = 0.75;
const DEG = Math.PI / 180;

// 0 at the design aspect and wider, 1 at 3:4 and taller.
export function portraitBlend(aspect) {
  if (!(aspect > 0)) return 0;
  return saturate((CAMERA_DESIGN_ASPECT - aspect) / (CAMERA_DESIGN_ASPECT - PORTRAIT_ASPECT));
}

// The vertical fov that holds the design horizontal field at this aspect, capped
// so the widening stops before the picture bends.
export function fovForAspect(fovDeg, aspect, capDeg) {
  if (!(aspect > 0) || aspect >= CAMERA_DESIGN_ASPECT) return fovDeg;
  const tanH = Math.tan(fovDeg * 0.5 * DEG) * CAMERA_DESIGN_ASPECT;
  const want = Math.atan(tanH / aspect) * 2 / DEG;
  return Math.min(want, capDeg);
}

// A rig authored for 16:9, re-framed for `aspect`. `out` must already carry every
// field of `p`; only the ones that move are written, so this is allocation-free
// and safe to call on every resize.
export function adaptCameraParams(out, p, aspect) {
  const t = portraitBlend(aspect);
  const cap = p.kind === "mount" ? 58 : 66;
  out.fovBase = fovForAspect(p.fovBase, aspect, cap);
  out.fovMax = Math.max(out.fovBase, fovForAspect(p.fovMax, aspect, cap));
  if (t <= 0) {
    out.height = p.height;
    out.distance = p.distance;
    out.lookAhead = p.lookAhead;
    out.lookHeight = p.lookHeight;
    return out;
  }
  if (p.kind === "boom") {
    out.height = p.height * (1 + 0.62 * t);
    out.distance = p.distance * (1 - 0.20 * t);
    out.lookAhead = p.lookAhead * (1 + 0.16 * t);
    out.lookHeight = p.lookHeight * (1 - 0.65 * t);
  } else {
    out.height = p.height;
    out.distance = p.distance;
    // A mount cannot move — it is bolted to the car — so all it can do is stop
    // the extra vertical field being spent on sky.
    out.lookAhead = p.lookAhead;
    out.lookHeight = p.lookHeight * (1 - 0.5 * t);
  }
  return out;
}

// The slice of CarState the rigs actually read, flattened so the rig maths has
// no dependency on physics.js and can be driven from a literal in a test.
export function makeCarSample() {
  return {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: 0, roll: 0,
    speed: 0, forwardSpeed: 0, slipAngle: 0, yawRate: 0,
    lateralG: 0, longitudinalG: 0, verticalG: 1,
    steer: 0, airTime: 0, onGround: 4,
    roughness: 0.2, wheelSpeed: 0,
    // The three chassis dimensions a rig is authored against, so a mount can be
    // placed on a car it was not tuned on. See CAMERA_PARAMS.
    comHeight: DEFAULT_COM_HEIGHT,
    frontAxle: DEFAULT_FRONT_AXLE,
    halfWidth: DEFAULT_HALF_WIDTH,
  };
}

export function sampleCar(out, car, surface) {
  out.x = car.pos.x; out.y = car.pos.y; out.z = car.pos.z;
  out.vx = car.vel.x; out.vy = car.vel.y; out.vz = car.vel.z;
  out.yaw = car.yaw; out.pitch = car.pitch; out.roll = car.roll;
  out.speed = car.speed;
  out.forwardSpeed = car.forwardSpeed;
  out.slipAngle = car.slipAngle;
  out.yawRate = car.yawRate || 0;
  out.lateralG = car.lateralG;
  out.longitudinalG = car.longitudinalG;
  out.verticalG = car.verticalG;
  out.steer = car.input ? car.input.steer : 0;
  out.airTime = car.airTime;
  out.onGround = car.onGround;
  out.roughness = surface ? surface.roughness : 0.2;
  // physics.js tunes `setup` from `spec`, so a tuned ride height is in setup.
  const geom = car.setup || car.spec;
  out.comHeight = geom && geom.comHeight > 0 ? geom.comHeight : DEFAULT_COM_HEIGHT;
  // The same two expressions meshes.js builds the body from, so the rigs and the
  // model cannot drift apart: the axle datum and the body's half width.
  out.frontAxle = geom && geom.wheelbase > 0 && geom.weightDistFront > 0
    ? geom.wheelbase * (1 - geom.weightDistFront)
    : DEFAULT_FRONT_AXLE;
  out.halfWidth = geom && geom.trackFront > 0 && geom.trackRear > 0
    ? Math.max(geom.trackFront, geom.trackRear) * 0.5 - 0.085
    : DEFAULT_HALF_WIDTH;
  return out;
}

export function makeCameraRig(mode = "chase") {
  const p = cameraParams(mode);
  return {
    mode,
    kind: p.kind,
    // Damped state. Every field here moves under damp() alone, so two half-steps
    // land where one whole step does.
    bx: 0, by: 0, bz: 0,
    ax: 0, ay: 0, az: 0,
    dirAngle: 0,
    fov: p.fovBase,
    roll: 0,
    pitchTrim: 0,
    lift: 0,
    shake: 0,
    headX: 0, headY: 0, headZ: 0,
    lookYaw: 0,
    orbit: 0,
    // Output, written every update: base state plus shake plus the ground push.
    px: 0, py: 0, pz: 0,
    tx: 0, ty: 0, tz: 0,
    upX: 0, upY: 1, upZ: 0,
    time: 0,
    anchorX: 0, anchorY: 0, anchorZ: 0, hasAnchor: false,
    ready: false,
  };
}

// Where a boom camera wants to be, ignoring damping. Split out because both the
// update and the reset need it and because it is the thing a test can check
// against "behind and above by the intended amount".
export function boomTarget(out, s, p, dirAngle, lift) {
  const dx = Math.sin(dirAngle);
  const dz = Math.cos(dirAngle);
  const back = p.distance;
  out.x = s.x - dx * back;
  out.z = s.z - dz * back;
  out.y = s.y + p.height + p.riseWithSpeed * s.speed * s.speed * 0.02 + (lift || 0);
  return out;
}

// The direction the boom should sit behind. At a standstill that is the nose; as
// speed builds it rotates onto the velocity, which is what puts the road you are
// sliding towards in frame instead of the ditch you are pointing at.
export function boomDirectionTarget(s, p) {
  const vh = Math.hypot(s.vx, s.vz);
  const heading = s.yaw;
  if (vh < 0.75 || s.forwardSpeed < -0.5) return heading;
  const velAngle = Math.atan2(s.vx, s.vz);
  const blend = p.velocityBlend * saturate((vh - 0.75) / Math.max(1, p.velRefSpeed));
  return heading + angleDelta(heading, velAngle) * blend;
}

// Rotation of the aim, in radians, toward the inside of the corner. Steering
// input leads it — a driver looks at the apex before the car has started to
// rotate — and the yaw rate sustains it once the car is round. The slip term
// swings the aim back off the velocity toward the nose and past it, which is
// what a driver does in a slide: the apex is further into the corner than either.
//
// Both terms are negative for a left-hand corner. See the sign note on
// CAMERA_PARAMS; getting this backwards points the camera at the outside of the
// corner, which is the one place a driver never needs to see.
const CORNER_YAW_REF = 0.85;
const CORNER_LOOK_LIMIT = 0.42;

export function cornerLook(s, p) {
  if (!(p.lookIntoCorner > 0) && !(p.slipLook > 0)) return 0;
  const turn = clamp((s.yawRate || 0) / CORNER_YAW_REF * 0.75 - (s.steer || 0) * 0.35, -1, 1);
  const want = p.lookIntoCorner * turn - p.slipLook * (s.slipAngle || 0);
  // Below walking pace the yaw rate is noise and a slip angle is meaningless.
  return clamp(want, -CORNER_LOOK_LIMIT, CORNER_LOOK_LIMIT) * saturate(s.speed / 4);
}

// The aim point. It leads the *velocity*, not the nose: sideways into a hairpin
// the car should be off-centre in frame with the exit visible, which is the
// single thing that separates a rally chase camera from a driving-school one.
// `cornerYaw` then swings it further into the corner still.
export function lookTarget(out, s, p, cornerYaw) {
  const vh = Math.hypot(s.vx, s.vz);
  const base = vh > 0.6 && s.forwardSpeed > -0.5 ? Math.atan2(s.vx, s.vz) : s.yaw;
  const ang = base + (cornerYaw || 0);
  const dx = Math.sin(ang);
  const dz = Math.cos(ang);
  const lead = p.lookAhead * (0.38 + 0.62 * saturate(s.speed / Math.max(1, p.velRefSpeed * 2.2)));
  out.x = s.x + dx * lead;
  out.z = s.z + dz * lead;
  out.y = s.y + p.lookHeight + s.vy * p.lookVertGain;
  return out;
}

// Monotonic non-decreasing in speed and clamped to [fovBase, fovMax] by
// construction — smoothstep saturates at both ends.
export function chaseFov(speed, p) {
  const t = smoothstep(p.fovStart, Math.max(p.fovStart + 1e-3, p.fovRefSpeed), speed);
  return p.fovBase + (p.fovMax - p.fovBase) * t;
}

// Deterministic, allocation-free camera shake. Three incommensurable sines per
// axis so it never finds a beat, and a pure function of accumulated time so it
// cannot make the damped state framerate-dependent.
function shakeAxis(t, k) {
  return Math.sin(t * (17.3 + k * 4.1)) * 0.55
    + Math.sin(t * (29.7 + k * 6.7)) * 0.32
    + Math.sin(t * (47.1 + k * 9.3)) * 0.18;
}

const _bt = { x: 0, y: 0, z: 0 };
const _lt = { x: 0, y: 0, z: 0 };

export function resetCameraRig(rig, s, p, ground) {
  rig.mode = p.mode;
  rig.kind = p.kind;
  rig.dirAngle = boomDirectionTarget(s, p);
  rig.lift = 0;
  rig.headX = 0; rig.headY = 0; rig.headZ = 0;
  rig.lookYaw = 0;
  rig.orbit = 0;
  rig.shake = 0;
  rig.roll = 0;
  rig.pitchTrim = 0;
  rig.fov = chaseFov(s.speed, p);
  if (p.kind === "mount") {
    mountPosition(_bt, s, p, 0, 0, 0);
  } else if (p.kind === "fixed" && rig.hasAnchor) {
    _bt.x = rig.anchorX; _bt.y = rig.anchorY; _bt.z = rig.anchorZ;
  } else if (p.kind === "orbit") {
    orbitPosition(_bt, s, p, 0);
  } else {
    boomTarget(_bt, s, p, rig.dirAngle, 0);
    if (ground) {
      const g = ground(_bt.x, _bt.z) + p.clearance;
      if (_bt.y < g) _bt.y = g;
    }
  }
  rig.bx = _bt.x; rig.by = _bt.y; rig.bz = _bt.z;
  rig.px = _bt.x; rig.py = _bt.y; rig.pz = _bt.z;
  if (p.kind === "fixed") {
    _lt.x = s.x; _lt.y = s.y + p.lookHeight; _lt.z = s.z;
  } else {
    lookTarget(_lt, s, p, 0);
  }
  rig.ax = _lt.x; rig.ay = _lt.y; rig.az = _lt.z;
  rig.tx = _lt.x; rig.ty = _lt.y; rig.tz = _lt.z;
  rig.time = 0;
  rig.ready = true;
  return rig;
}

export function mountLocalX(s, p) {
  const hw = s.halfWidth > 0 ? s.halfWidth : DEFAULT_HALF_WIDTH;
  return p.localXFrac * hw;
}

export function mountLocalZ(s, p) {
  const axle = s.frontAxle > 0 ? s.frontAxle : DEFAULT_FRONT_AXLE;
  return axle + p.localZAxle;
}

function mountPosition(out, s, p, hx, hy, hz) {
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  const lx = mountLocalX(s, p) + hx;
  // s.y is the centre of mass; mountY is measured from the road, so the COM
  // height comes back out before the offset is applied in the chassis frame.
  const com = s.comHeight > 0 ? s.comHeight : DEFAULT_COM_HEIGHT;
  const ly = (p.mountY - com) + hy;
  const lz = mountLocalZ(s, p) + hz;
  // Roll and pitch are small at a camera mount, so the small-angle rotation is
  // both exact enough and cheaper than a quaternion here.
  const rl = s.roll;
  const pt = s.pitch;
  const ex = lx;
  const ey = ly + lx * rl + lz * pt;
  const ez = lz - ly * pt;
  out.x = s.x + ex * cy + ez * sy;
  out.y = s.y + ey;
  out.z = s.z - ex * sy + ez * cy;
  return out;
}

function orbitPosition(out, s, p, orbit) {
  const a = s.yaw + Math.PI + orbit;
  out.x = s.x + Math.sin(a) * p.distance;
  out.z = s.z + Math.cos(a) * p.distance;
  out.y = s.y + p.height + p.orbitRise * (1 - Math.cos(orbit * 0.7)) * 0.5;
  return out;
}

// The one update every camera goes through. `ground(x, z) -> y` is optional; when
// it is supplied no camera is ever left under the terrain.
export function updateCameraRig(rig, s, p, dt, ground) {
  if (!rig.ready) resetCameraRig(rig, s, p, ground);
  const step = clamp(dt, 0, 0.25);
  rig.time += step;

  if (p.kind === "boom") {
    const dirT = boomDirectionTarget(s, p);
    rig.dirAngle = wrapAngle(rig.dirAngle
      + angleDelta(rig.dirAngle, dirT) * (1 - Math.exp(-p.dirRate * step)));
    // Over a crest the car falls away from the camera; letting the boom keep its
    // height for a moment is what makes a jump read as a jump.
    const liftT = p.airLift * saturate(s.airTime * 3);
    rig.lift = damp(rig.lift, liftT, p.airRate, step);
    boomTarget(_bt, s, p, rig.dirAngle, rig.lift);
    if (ground) {
      const g = ground(_bt.x, _bt.z) + p.clearance;
      if (_bt.y < g) _bt.y = g;
    }
    const rate = p.posRate + p.posRateSpeed * s.speed;
    rig.bx = damp(rig.bx, _bt.x, rate, step);
    rig.by = damp(rig.by, _bt.y, rate * 1.25, step);
    rig.bz = damp(rig.bz, _bt.z, rate, step);
    // A boom that always sits square behind the nose hides the exit of every
    // corner behind the car it is following. This is the aim swinging inside.
    rig.lookYaw = damp(rig.lookYaw, cornerLook(s, p), 4.2, step);
    lookTarget(_lt, s, p, rig.lookYaw);
  } else if (p.kind === "mount") {
    // Head inertia: the driver's head lags the chassis under g, and looks a
    // little way into the corner rather than straight down the bonnet.
    rig.headX = damp(rig.headX, -s.lateralG * p.headGain, p.headInertia, step);
    rig.headY = damp(rig.headY, -saturate(s.verticalG - 1) * p.headGain * 0.6, p.headInertia, step);
    rig.headZ = damp(rig.headZ, -s.longitudinalG * p.headGain, p.headInertia, step);
    rig.lookYaw = damp(rig.lookYaw, cornerLook(s, p), 6, step);
    mountPosition(_bt, s, p, rig.headX, rig.headY, rig.headZ);
    rig.bx = damp(rig.bx, _bt.x, p.posRate, step);
    rig.by = damp(rig.by, _bt.y, p.posRate, step);
    rig.bz = damp(rig.bz, _bt.z, p.posRate, step);
    const a = s.yaw + rig.lookYaw;
    _lt.x = _bt.x + Math.sin(a) * p.lookAhead;
    _lt.z = _bt.z + Math.cos(a) * p.lookAhead;
    _lt.y = _bt.y + p.lookHeight + Math.sin(s.pitch) * p.lookAhead;
  } else if (p.kind === "fixed") {
    _bt.x = rig.hasAnchor ? rig.anchorX : s.x;
    _bt.y = rig.hasAnchor ? rig.anchorY : s.y + 4;
    _bt.z = rig.hasAnchor ? rig.anchorZ : s.z;
    rig.bx = damp(rig.bx, _bt.x, p.posRate, step);
    rig.by = damp(rig.by, _bt.y, p.posRate, step);
    rig.bz = damp(rig.bz, _bt.z, p.posRate, step);
    // A television camera tracks the car itself, slightly led, and it is the one
    // camera allowed to zoom.
    _lt.x = s.x + s.vx * 0.12;
    _lt.y = s.y + p.lookHeight;
    _lt.z = s.z + s.vz * 0.12;
  } else {
    rig.orbit += step * p.orbitRate;
    orbitPosition(_bt, s, p, rig.orbit);
    if (ground) {
      const g = ground(_bt.x, _bt.z) + p.clearance;
      if (_bt.y < g) _bt.y = g;
    }
    rig.bx = damp(rig.bx, _bt.x, p.posRate, step);
    rig.by = damp(rig.by, _bt.y, p.posRate, step);
    rig.bz = damp(rig.bz, _bt.z, p.posRate, step);
    _lt.x = s.x;
    _lt.y = s.y + p.lookHeight;
    _lt.z = s.z;
  }

  rig.ax = damp(rig.ax, _lt.x, p.aimRate, step);
  rig.ay = damp(rig.ay, _lt.y, p.aimRate, step);
  rig.az = damp(rig.az, _lt.z, p.aimRate, step);

  rig.roll = damp(rig.roll, clamp(-s.lateralG * p.rollGain, -0.30, 0.30), p.attRate, step);
  rig.pitchTrim = damp(rig.pitchTrim, clamp(s.longitudinalG * p.pitchGain, -0.22, 0.22),
    p.attRate, step);
  rig.fov = damp(rig.fov, chaseFov(s.speed, p), p.fovRate, step);

  // Shake is scaled down hard with speed already in it: a camera that hides the
  // road on a rough section is a camera the player turns off.
  const shakeT = p.shake * s.roughness * saturate(s.speed / p.shakeSpeed)
    * (s.onGround > 0 ? 1 : 0.25);
  rig.shake = damp(rig.shake, shakeT, 7, step);

  const k = rig.shake;
  rig.px = rig.bx + shakeAxis(rig.time, 0) * k * 0.7;
  rig.py = rig.by + shakeAxis(rig.time, 1) * k;
  rig.pz = rig.bz + shakeAxis(rig.time, 2) * k * 0.7;
  rig.tx = rig.ax + shakeAxis(rig.time, 3) * k * 1.4;
  rig.ty = rig.ay + shakeAxis(rig.time, 4) * k * 1.1;
  rig.tz = rig.az + shakeAxis(rig.time, 5) * k * 1.4;

  if (ground) {
    const g = ground(rig.px, rig.pz) + p.clearance;
    if (rig.py < g) rig.py = g;
  }

  const cr = Math.cos(rig.roll);
  const sr = Math.sin(rig.roll);
  rig.upX = -sr * Math.cos(s.yaw);
  rig.upY = cr;
  rig.upZ = sr * Math.sin(s.yaw);
  return rig;
}

// ---- particle pools ------------------------------------------------------

export const PARTICLE_KIND = Object.freeze({
  DUST: 0, SPRAY: 1, SNOW: 2, STONE: 3, CLOD: 4, SPARK: 5,
  SPLINTER: 6, HAY: 7, GLASS: 8, SMOKE: 9, FLAME: 10, VAPOUR: 11,
});

// Structure of arrays over a fixed capacity, with a free list. Overflow recycles
// the oldest slot rather than growing: a pool that grows under load is a pool
// that stutters at exactly the moment the game is busiest.
export function createParticlePool(capacity, opts = {}) {
  const cap = Math.max(1, capacity | 0);
  const pool = {
    capacity: cap,
    alive: 0,
    spawned: 0,
    recycled: 0,
    dropped: 0,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    z: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    vz: new Float32Array(cap),
    age: new Float32Array(cap),
    life: new Float32Array(cap),
    size0: new Float32Array(cap),
    size1: new Float32Array(cap),
    r: new Float32Array(cap),
    g: new Float32Array(cap),
    b: new Float32Array(cap),
    drag: new Float32Array(cap),
    grav: new Float32Array(cap),
    kind: new Uint8Array(cap),
    spin: new Float32Array(cap),
    free: new Int32Array(cap),
    freeCount: cap,
    cursor: 0,
    gravity: opts.gravity ?? -9.81,
    // Compaction targets: filled by packParticles(), consumed by the GPU buffers.
    outPos: new Float32Array(cap * 3),
    outCol: new Float32Array(cap * 3),
    outSize: new Float32Array(cap),
    outFade: new Float32Array(cap),
    outCount: 0,
  };
  for (let i = 0; i < cap; i += 1) pool.free[i] = cap - 1 - i;
  return pool;
}

export function resetParticlePool(pool) {
  const cap = pool.capacity;
  for (let i = 0; i < cap; i += 1) {
    pool.life[i] = 0;
    pool.free[i] = cap - 1 - i;
  }
  pool.freeCount = cap;
  pool.alive = 0;
  pool.cursor = 0;
  pool.outCount = 0;
  return pool;
}

function claimSlot(pool) {
  if (pool.freeCount > 0) {
    pool.freeCount -= 1;
    return pool.free[pool.freeCount];
  }
  // Round-robin steal. The cursor walks the whole pool before it returns, so the
  // slot it takes is approximately the oldest without a scan.
  const i = pool.cursor;
  pool.cursor = (i + 1) % pool.capacity;
  pool.recycled += 1;
  pool.alive -= 1;
  return i;
}

export function spawnParticle(pool, x, y, z, vx, vy, vz, life, size0, size1, r, g, b, kind, drag, grav, spin) {
  if (life <= 0) { pool.dropped += 1; return -1; }
  const i = claimSlot(pool);
  pool.x[i] = x; pool.y[i] = y; pool.z[i] = z;
  pool.vx[i] = vx; pool.vy[i] = vy; pool.vz[i] = vz;
  pool.age[i] = 0;
  pool.life[i] = life;
  pool.size0[i] = size0;
  pool.size1[i] = size1 === undefined ? size0 : size1;
  pool.r[i] = r; pool.g[i] = g; pool.b[i] = b;
  pool.kind[i] = kind | 0;
  pool.drag[i] = drag === undefined ? 1.4 : drag;
  pool.grav[i] = grav === undefined ? 1 : grav;
  pool.spin[i] = spin === undefined ? 0 : spin;
  pool.alive += 1;
  pool.spawned += 1;
  return i;
}

export function stepParticlePool(pool, dt, windX, windY, windZ) {
  const step = clamp(dt, 0, 0.1);
  const wx = windX || 0;
  const wy = windY || 0;
  const wz = windZ || 0;
  const cap = pool.capacity;
  for (let i = 0; i < cap; i += 1) {
    const life = pool.life[i];
    if (life <= 0) continue;
    const age = pool.age[i] + step;
    if (age >= life) {
      pool.life[i] = 0;
      pool.alive -= 1;
      if (pool.freeCount < cap) {
        pool.free[pool.freeCount] = i;
        pool.freeCount += 1;
      }
      continue;
    }
    pool.age[i] = age;
    const d = pool.drag[i] * step;
    const k = d > 1 ? 1 : d;
    pool.vx[i] += (wx - pool.vx[i]) * k;
    pool.vy[i] += (wy - pool.vy[i]) * k + pool.gravity * pool.grav[i] * step;
    pool.vz[i] += (wz - pool.vz[i]) * k;
    pool.x[i] += pool.vx[i] * step;
    pool.y[i] += pool.vy[i] * step;
    pool.z[i] += pool.vz[i] * step;
  }
  return pool.alive;
}

// Writes the live particles into the front of the output buffers, which is what
// lets one draw call with a moving draw range stand in for a per-particle sort.
export function packParticles(pool, sunX, sunY, sunZ) {
  let n = 0;
  const cap = pool.capacity;
  for (let i = 0; i < cap; i += 1) {
    const life = pool.life[i];
    if (life <= 0) continue;
    const t = pool.age[i] / life;
    const o = n * 3;
    pool.outPos[o] = pool.x[i];
    pool.outPos[o + 1] = pool.y[i];
    pool.outPos[o + 2] = pool.z[i];
    // Lit from the sun side: a plume with a bright edge and a dark core is the
    // difference between smoke and a photograph of smoke.
    const vlen = Math.hypot(pool.vx[i], pool.vy[i], pool.vz[i]) || 1;
    const facing = (pool.vx[i] * sunX + pool.vy[i] * sunY + pool.vz[i] * sunZ) / vlen;
    const litK = 0.62 + 0.38 * (0.5 + 0.5 * facing);
    pool.outCol[o] = pool.r[i] * litK;
    pool.outCol[o + 1] = pool.g[i] * litK;
    pool.outCol[o + 2] = pool.b[i] * litK;
    pool.outSize[n] = lerp(pool.size0[i], pool.size1[i], t);
    // Rise, hold, fall: a dust plume is opaque almost immediately and dies slowly.
    // "Almost immediately" has to mean it: at 100 km/h a puff spends about a
    // quarter of a second between the car and the chase camera, and the old 12%
    // ramp was longer than that on its own — every particle the player could
    // have seen was still fading in when it went past the lens.
    pool.outFade[n] = smoothstep(0, 0.04, t) * (1 - t) * (1 - t);
    n += 1;
  }
  pool.outCount = n;
  return n;
}

// Particles per second for one wheel. Every term is something the player can see
// a reason for: a wheel off the ground throws nothing, a locked wheel throws more
// than a rolling one, a loaded wheel more than an unloaded one, and rain kills it.
//
// Two of those terms held the plume down at exactly the speed it should have been
// at its biggest. The speed term saturated at 20 m/s — 72 km/h — so a hundred and
// forty on gravel threw no more than a brisk trundle; and a straight-running
// wheel kept only 22% of the surface's rate, when what makes the tail is the tyre
// displacing loose material at thirty metres a second whether or not it is
// sliding. The speed term now keeps climbing past its reference and the
// no-slip floor is more than half.
export function dustSpawnRate(props, wheel, speed, wetness, scale) {
  if (!props || !wheel || !wheel.contact) return 0;
  const base = props.dustRate;
  if (!(base > 0)) return 0;
  const v = saturate(speed / 14) * (1 + saturate((speed - 14) / 24));
  if (v <= 0) return 0;
  const slip = saturate(Math.abs(wheel.slipRatio) * 0.85 + Math.abs(wheel.slipAngle) * 1.7);
  const load = saturate((wheel.load || 0) / 4200);
  const wet = 1 - 0.72 * saturate(wetness || 0);
  return base * v * (0.55 + 1.15 * slip) * (0.30 + 0.90 * load) * wet * (scale === undefined ? 1 : scale);
}

// A driven rear wheel with slip under power throws its plume *backwards and up*:
// the rooster tail. Front wheels only ever spit sideways.
export function roosterStrength(wheel, throttle) {
  if (!wheel || !wheel.contact || wheel.isFront) return 0;
  const spin = saturate((wheel.slipRatio || 0) * 0.9);
  return spin * saturate(throttle || 0);
}

// How hard the car's own wake throws the plume up and back, independent of wheel
// slip. A puff dropped at the contact patch with 0.6 m/s of lift settles inside a
// car length whatever the speed; the column behind a gravel car is the wake
// carrying it. 1 at motorway speed.
export function wakeLift(speed) {
  return saturate((speed - 8) / 22);
}

// ---- quality autoscaler --------------------------------------------------

export function createAutoScaler(opts = {}) {
  const win = Math.max(4, (opts.window | 0) || 45);
  return {
    window: win,
    times: new Float64Array(win),
    n: 0,
    head: 0,
    sum: 0,
    downMs: opts.downMs === undefined ? 21.5 : opts.downMs,
    // The metric is the interval between frames, and on a vsync-locked display
    // that interval is quantised: a comfortable 60 Hz frame and a marginal one
    // both arrive 16.7 ms apart. An up-threshold below that quantum can never be
    // satisfied on the commonest display there is, so the scaler becomes a
    // one-way ratchet and one transient hitch costs the player its shadows for
    // the rest of the session. It has to sit *above* one refresh period.
    upMs: opts.upMs === undefined ? 18.0 : opts.upMs,
    // Nobody should lose their shadows over a 2% overshoot, and a bare `>` on a
    // float average turns rounding noise into a quality change.
    tolerance: opts.tolerance === undefined ? 0.02 : opts.tolerance,
    hold: opts.hold === undefined ? 1.2 : opts.hold,
    cooldown: 0,
    // An up-threshold that a vsync-locked frame can reach is also one a level
    // that cannot hold the frame rate will reach, so without a penalty the
    // scaler would step up, fail, step down and blink the shadows on a cycle.
    // Each down-step lengthens the quiet stretch the next up-step must sit
    // through; one that sticks halves the debt again.
    upDelayBase: opts.upDelayBase === undefined ? 1.5 : opts.upDelayBase,
    upDelayMax: opts.upDelayMax === undefined ? 8 : opts.upDelayMax,
    upDelay: opts.upDelayBase === undefined ? 1.5 : opts.upDelayBase,
    quiet: 0,
    levels: QUALITY_LEVELS,
    index: clamp(opts.index === undefined ? 2 : opts.index, 0, QUALITY_LEVELS.length - 1),
    scaleSteps: opts.scaleSteps || SCALE_STEPS,
    scaleIndex: 0,
    changes: 0,
    ups: 0,
    downs: 0,
    enabled: opts.enabled !== false,
    lastAvg: 0,
  };
}

export function autoScalerScale(as) {
  return as.scaleSteps[as.scaleIndex];
}

export function autoScalerLevel(as) {
  return as.levels[as.index];
}

// Returns -1 when it gave something up, +1 when it took something back, 0 when it
// left well alone. The two thresholds are far apart and every change starts a
// cooldown with a cleared window, which together are why a frame time sitting on
// the boundary cannot make it flap.
export function autoScalerSample(as, frameMs, dt) {
  if (!as.enabled) return 0;
  const step = dt === undefined ? frameMs / 1000 : dt;
  if (as.cooldown > 0) as.cooldown = Math.max(0, as.cooldown - step);
  as.quiet += step;

  as.times[as.head] = frameMs;
  if (as.n < as.window) as.n += 1;
  as.head = (as.head + 1) % as.window;
  if (as.n < as.window || as.cooldown > 0) return 0;

  // Summed fresh rather than carried incrementally: a running sum drifts, and a
  // drifting mean against a fixed threshold is an autoscaler that eventually
  // steps down for no reason at all.
  let total = 0;
  for (let i = 0; i < as.n; i += 1) total += as.times[i];
  as.sum = total;
  const avg = total / as.n;
  as.lastAvg = avg;
  const quietEnough = avg < as.upMs * (1 - as.tolerance);
  if (!quietEnough) as.quiet = 0;
  let action = 0;
  if (avg > as.downMs * (1 + as.tolerance)) {
    if (as.scaleIndex < as.scaleSteps.length - 1) { as.scaleIndex += 1; action = -1; }
    else if (as.index > 0) { as.index -= 1; action = -1; }
  } else if (quietEnough && as.quiet >= as.upDelay) {
    if (as.scaleIndex > 0) { as.scaleIndex -= 1; action = 1; }
    else if (as.index < as.levels.length - 1) { as.index += 1; action = 1; }
  }
  if (action !== 0) {
    as.changes += 1;
    if (action > 0) {
      as.ups += 1;
      as.upDelay = Math.max(as.upDelayBase, as.upDelay * 0.5);
    } else {
      as.downs += 1;
      as.upDelay = Math.min(as.upDelayMax, as.upDelay * 2 + as.upDelayBase);
    }
    as.quiet = 0;
    as.cooldown = as.hold;
    as.n = 0;
    as.sum = 0;
    as.head = 0;
  }
  return action;
}

// ---- contact shadow ------------------------------------------------------

// The car's cast shadow cannot be relied on to say "this thing is touching the
// ground". At noon it falls almost entirely under the sill, on an overcast the
// key light is a few per cent of the lighting, and at the quality levels a phone
// picks there is no shadow map at all. So the car also carries an ellipse of
// darkening pinned to the ground beneath it, always, at every sun angle.
//
// It is a multiply, not a lit surface, so it survives exposure and ACES
// unchanged: it takes a fixed fraction out of whatever the ground was.
export const CONTACT_SHADOW = Object.freeze({
  // Footprint when the car is at its nominal ride height, as a multiple of the
  // body it sits under. Wider than the shell, because a real occlusion pool
  // reaches past the sills.
  lengthScale: 1.18,
  widthScale: 1.34,
  opacity: 0.62,
  // Extra footprint per metre the body rises. A penumbra widens with the gap.
  spreadPerMetre: 0.95,
  spreadMin: 0.72,
  spreadMax: 3.2,
  // Seconds of air time over which the last of it goes. The spread term alone
  // handles a launch, but a car flying level off a crest keeps its height and
  // needs this.
  airFade: 0.55,
  // Metres of clearance over the ground, enough that polygon offset never has to
  // fight terrain at a grazing view angle.
  lift: 0.04,
});

export function makeContactShadowFit() {
  return { spread: 1, alpha: 0, visible: false };
}

// `height` is the body's height over the ground, `nominal` the same at rest.
// Compression tightens and darkens the pool; extension and flight spread and
// lighten it, losing darkness as the square of the footprint because the same
// occlusion is smeared over that much more ground.
export function contactShadowFit(fit, height, nominal, airTime) {
  const nom = nominal > 0.05 ? nominal : DEFAULT_COM_HEIGHT;
  const gap = (height > 0 ? height : 0) - nom;
  const spread = clamp(1 + gap * CONTACT_SHADOW.spreadPerMetre,
    CONTACT_SHADOW.spreadMin, CONTACT_SHADOW.spreadMax);
  const air = 1 - smoothstep(0.1, 0.1 + CONTACT_SHADOW.airFade, airTime || 0);
  fit.spread = spread;
  fit.alpha = clamp(CONTACT_SHADOW.opacity / (spread * spread), 0, 0.92) * air;
  fit.visible = fit.alpha > 0.004;
  return fit;
}

// ---- shadow frustum fitting ---------------------------------------------

// The tallest thing beside a road that has to land in the shadow map: a mature
// conifer, a telegraph pole, the start gantry. The fit is given the ground the
// shadow falls on, so this is how far above that ground it has to reach.
export const SHADOW_CASTER_HEIGHT = 30;

// How far either side of the carriageway the shadow box reaches. This is a
// resolution trade, not a free parameter: the box is square and texel size is
// its width over the map size, so every metre of padding costs sharpness. At 26 m
// a 1024 map still resolves about 12 cm, which is finer than the shadow of a
// tree trunk needs to be.
// Airborne dust scatters the sun forward, so a plume between the car and a chase
// camera is brighter than the ground it was lifted off. 1.6 is that boost; it
// multiplies a lit quantity, so it cannot on its own drive the plume to white
// the way a bare tint could.
export const DUST_FORWARD_SCATTER = 1.6;

export const SHADOW_SIDE_PAD = 26;

export function makeShadowFit() {
  return {
    fx: 0, fy: -1, fz: 0,
    rx: 1, ry: 0, rz: 0,
    ux: 0, uy: 0, uz: 1,
    cx: 0, cy: 0, cz: 0,
    lightX: 0, lightY: 0, lightZ: 0,
    left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 100,
    radius: 1, texel: 1, ok: false,
  };
}

// The whole staircase problem in one function. A directional shadow camera fitted
// to the *visible* span — the car plus the road it can see — instead of the whole
// stage keeps the texel size in centimetres rather than metres. Snapping the
// centre to a whole texel is what stops the edges crawling as the car moves.
export function fitShadowFrustum(fit, points, count, sunX, sunY, sunZ, mapSize, margin,
  casterHeight) {
  if (!count) { fit.ok = false; return fit; }
  const sl = Math.hypot(sunX, sunY, sunZ) || 1;
  // Light travels from the sun towards the ground, so forward is -sunDir.
  let fx = -sunX / sl;
  let fy = -sunY / sl;
  let fz = -sunZ / sl;
  if (fy > -0.08) {
    // A sun on the horizon would give a frustum kilometres deep for no gain; the
    // shadows are meaningless at that elevation anyway.
    fy = -0.08;
    const l2 = Math.hypot(fx, fy, fz) || 1;
    fx /= l2; fy /= l2; fz /= l2;
  }
  // Right = up x forward, with a fallback basis for a sun straight overhead.
  let rx = fz;
  let ry = 0;
  let rz = -fx;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-4) { rx = 1; ry = 0; rz = 0; rl = 1; }
  rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  let minR = Infinity; let maxR = -Infinity;
  let minU = Infinity; let maxU = -Infinity;
  let minF = Infinity; let maxF = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const o = i * 3;
    const px = points[o];
    const py = points[o + 1];
    const pz = points[o + 2];
    const r = px * rx + py * ry + pz * rz;
    const u = px * ux + py * uy + pz * uz;
    const f = px * fx + py * fy + pz * fz;
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (u < minU) minU = u; if (u > maxU) maxU = u;
    if (f < minF) minF = f; if (f > maxF) maxF = f;
  }
  // The points describe the ground the shadow lands on. What casts it stands up
  // to `casterHeight` above them, and raising a point by h moves it by
  // h*(ry, uy, fy) in this basis — down in depth for any sun off the vertical.
  // Fitting to the ground alone therefore leaves every canopy, pole and gantry
  // behind the near plane, which is why the forest cast nothing on the road.
  const h = casterHeight === undefined ? SHADOW_CASTER_HEIGHT : casterHeight;
  if (h > 0) {
    const dr = h * ry;
    const du = h * uy;
    const df = h * fy;
    if (dr < 0) minR += dr; else maxR += dr;
    if (du < 0) minU += du; else maxU += du;
    if (df < 0) minF += df; else maxF += df;
  }
  const m = margin === undefined ? 3 : margin;
  const size = Math.max(maxR - minR, maxU - minU) + m * 2;
  const ms = Math.max(16, mapSize || 2048);
  const texel = size / ms;
  let cR = (minR + maxR) * 0.5;
  let cU = (minU + maxU) * 0.5;
  cR = Math.round(cR / texel) * texel;
  cU = Math.round(cU / texel) * texel;
  const half = size * 0.5;
  const depth = (maxF - minF) + m * 2;
  const pull = m + 1;
  const cF = minF - pull;

  fit.fx = fx; fit.fy = fy; fit.fz = fz;
  fit.rx = rx; fit.ry = ry; fit.rz = rz;
  fit.ux = ux; fit.uy = uy; fit.uz = uz;
  fit.cx = rx * cR + ux * cU + fx * ((minF + maxF) * 0.5);
  fit.cy = ry * cR + uy * cU + fy * ((minF + maxF) * 0.5);
  fit.cz = rz * cR + uz * cU + fz * ((minF + maxF) * 0.5);
  fit.lightX = rx * cR + ux * cU + fx * cF;
  fit.lightY = ry * cR + uy * cU + fy * cF;
  fit.lightZ = rz * cR + uz * cU + fz * cF;
  fit.left = -half;
  fit.right = half;
  fit.top = half;
  fit.bottom = -half;
  fit.near = 0.5;
  fit.far = depth + pull + 1;
  fit.radius = half;
  fit.texel = texel;
  fit.ok = true;
  return fit;
}

// Projects a world point into the fitted light basis, relative to the box centre.
// Exported because it is how a test asks "is this actually inside?".
export function shadowLightSpace(fit, x, y, z, out) {
  const dx = x - fit.lightX;
  const dy = y - fit.lightY;
  const dz = z - fit.lightZ;
  out.r = dx * fit.rx + dy * fit.ry + dz * fit.rz;
  out.u = dx * fit.ux + dy * fit.uy + dz * fit.uz;
  out.f = dx * fit.fx + dy * fit.fy + dz * fit.fz;
  return out;
}

// The span a shadow has to cover: the car, plus the road surface for as far ahead
// as it is worth casting. Both road edges, because a one-sided fit clips the
// verge shadow on every left-hander.
export function roadSpanPoints(out, stage, sIndex, aheadSamples, behindSamples, stride, pad) {
  const count = stage.count;
  const st = Math.max(1, stride | 0);
  const i0 = clamp(sIndex - behindSamples, 0, count - 1);
  const i1 = clamp(sIndex + aheadSamples, 0, count - 1);
  const padding = pad === undefined ? 1.5 : pad;
  let n = 0;
  const capacity = (out.length / 3) | 0;
  for (let i = i0; i <= i1 && n + 2 <= capacity; i += st) {
    const hw = stage.halfWidth[i] + padding;
    const tx = stage.tx[i];
    const tz = stage.tz[i];
    const inv = 1 / (Math.hypot(tx, tz) || 1);
    const rxv = tz * inv;
    const rzv = -tx * inv;
    const x = stage.x[i];
    const y = stage.y[i];
    const z = stage.z[i];
    let o = n * 3;
    out[o] = x + rxv * hw; out[o + 1] = y; out[o + 2] = z + rzv * hw;
    n += 1;
    o = n * 3;
    out[o] = x - rxv * hw; out[o + 1] = y; out[o + 2] = z - rzv * hw;
    n += 1;
  }
  return n;
}

// ---- level of detail -----------------------------------------------------

export const LOD_BANDS = Object.freeze([55, 160, 460]);

// Monotonic in distance for a fixed current level, and with a dead band around
// every threshold so a tree on a boundary does not flicker between two meshes.
export function selectLod(distance, current, bands, hysteresis) {
  const b = bands || LOD_BANDS;
  const h = hysteresis === undefined ? 12 : hysteresis;
  const cur = current === undefined ? 0 : current;
  let lod = 0;
  for (let i = 0; i < b.length; i += 1) {
    const edge = cur > i ? b[i] - h : b[i] + h;
    if (distance > edge) lod = i + 1;
    else break;
  }
  return lod;
}

// Fade rather than pop: the last few metres of the draw distance dissolve an
// instance out, which is invisible where a hard cutoff is not.
export function lodFade(distance, cutoff, width) {
  const w = width === undefined ? 40 : width;
  if (distance <= cutoff - w) return 1;
  if (distance >= cutoff) return 0;
  return saturate((cutoff - distance) / w);
}

// ---- resource bookkeeping ------------------------------------------------

// Every geometry, material, texture and render target a stage creates goes in
// here. dispose() is idempotent per object and the bin empties itself, so a
// double clearStage() is a no-op rather than a crash.
export function createResourceBin(label) {
  const items = [];
  const seen = new Set();
  return {
    label: label || "bin",
    items,
    get size() { return items.length; },
    track(obj) {
      if (obj && typeof obj.dispose === "function" && !seen.has(obj)) {
        seen.add(obj);
        items.push(obj);
      }
      return obj;
    },
    trackMaterial(mat) {
      if (!mat) return mat;
      if (Array.isArray(mat)) {
        for (let i = 0; i < mat.length; i += 1) this.trackMaterial(mat[i]);
        return mat;
      }
      this.track(mat);
      for (const key in mat) {
        const v = mat[key];
        if (v && v.isTexture) this.track(v);
      }
      if (mat.uniforms) {
        for (const key in mat.uniforms) {
          const u = mat.uniforms[key];
          if (u && u.value && u.value.isTexture) this.track(u.value);
        }
      }
      return mat;
    },
    // Walks an Object3D and takes ownership of everything hanging off it. Used
    // for whatever meshes.js hands back, whose internals we do not own.
    trackTree(root) {
      if (!root || typeof root.traverse !== "function") return root;
      root.traverse((o) => {
        if (o.geometry) this.track(o.geometry);
        if (o.material) this.trackMaterial(o.material);
      });
      return root;
    },
    disposeAll() {
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const o = items[i];
        try {
          o.dispose();
        } catch {
          // A half-built resource must not be able to strand the rest of the bin.
        }
      }
      items.length = 0;
      seen.clear();
    },
  };
}

// ---- shaders -------------------------------------------------------------

const FULLSCREEN_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COMMON_FRAG = `
vec3 acesFilmic(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const BRIGHT_FRAG = `
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
${COMMON_FRAG}

// Karis average over a WIDE footprint, and the width is the whole point.
//
// The blur cannot tell a real light source from a sampling accident: it spread
// one 251x9 px sliver of road, a kilometre away and edge-on to the sun, into a
// 56 px disc whose every pixel clipped white. That disc is the "white flash"
// the player sees. So does a lone aliased fragment, at 46 px.
//
// Weighting each tap by 1/(1+luma) bounds what an outlier contributes: dark
// neighbours and one arbitrarily bright tap converge on a bounded average
// however bright that tap is, while a uniformly bright neighbourhood keeps its
// weights equal and comes through untouched. That is the discriminator — extent,
// not magnitude. A flat ceiling on brightness cannot make the distinction: the
// sun's bloom source is orders of magnitude hotter than the road sliver, so
// every ceiling low enough to kill the sliver also erased the low sun's glare
// (clear-dawn's near ring fell 129 -> 76 at every value tried between 6 and 30).
//
// Hence KARIS_SPREAD. The taps have to straddle the artefact to see that it is
// thin, so at 3 texels the ring spans 6 px against that 9 px sliver — narrow
// features get pulled down, and the sun, a hundred pixels across, does not
// notice. Sampling on the diagonal ring rather than a full 3x3 buys that for
// eight taps instead of nine.
const float KARIS_SPREAD = 3.0;

vec3 brightSample(vec2 uv) {
  vec2 o = uTexel * KARIS_SPREAD;
  vec3 c0 = texture2D(tScene, uv).rgb;
  vec3 c1 = texture2D(tScene, uv + vec2(-o.x, -o.y)).rgb;
  vec3 c2 = texture2D(tScene, uv + vec2( o.x, -o.y)).rgb;
  vec3 c3 = texture2D(tScene, uv + vec2(-o.x,  o.y)).rgb;
  vec3 c4 = texture2D(tScene, uv + vec2( o.x,  o.y)).rgb;
  vec3 c5 = texture2D(tScene, uv + vec2(-o.x,  0.0)).rgb;
  vec3 c6 = texture2D(tScene, uv + vec2( o.x,  0.0)).rgb;
  vec3 c7 = texture2D(tScene, uv + vec2( 0.0, -o.y)).rgb;
  vec3 c8 = texture2D(tScene, uv + vec2( 0.0,  o.y)).rgb;
  float w0 = 1.0 / (1.0 + luma(c0));
  float w1 = 1.0 / (1.0 + luma(c1));
  float w2 = 1.0 / (1.0 + luma(c2));
  float w3 = 1.0 / (1.0 + luma(c3));
  float w4 = 1.0 / (1.0 + luma(c4));
  float w5 = 1.0 / (1.0 + luma(c5));
  float w6 = 1.0 / (1.0 + luma(c6));
  float w7 = 1.0 / (1.0 + luma(c7));
  float w8 = 1.0 / (1.0 + luma(c8));
  return (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3 + c4 * w4
        + c5 * w5 + c6 * w6 + c7 * w7 + c8 * w8)
    / max(1e-4, w0 + w1 + w2 + w3 + w4 + w5 + w6 + w7 + w8);
}

void main() {
  vec3 c = brightSample(vUv);
  float l = luma(c);
  // Soft knee, so a headlight does not pop into bloom the instant it crosses.
  float s = max(0.0, l - uThreshold + uKnee);
  s = min(s * s / max(1e-4, 4.0 * uKnee), l - uThreshold + 1e-4);
  s = max(s, 0.0);
  gl_FragColor = vec4(c * (s / max(l, 1e-4)), 1.0);
}
`;

const BLUR_FRAG = `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uDirection;
  vec3 sum = texture2D(tSource, vUv).rgb * 0.2270270;
  sum += texture2D(tSource, vUv + o * 1.3846153).rgb * 0.3162162;
  sum += texture2D(tSource, vUv - o * 1.3846153).rgb * 0.3162162;
  sum += texture2D(tSource, vUv + o * 3.2307692).rgb * 0.0702702;
  sum += texture2D(tSource, vUv - o * 3.2307692).rgb * 0.0702702;
  gl_FragColor = vec4(sum, 1.0);
}
`;

// The one pass that touches the final image: radial blur, chromatic aberration,
// bloom, tone map, grade, vignette and dither, in that order, because every one
// of them assumes the previous is already done.
const COMPOSITE_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uBloom;
uniform float uChroma;
uniform float uVignette;
uniform float uRadial;
uniform float uDither;
uniform float uTime;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uSaturation;
varying vec2 vUv;
${COMMON_FRAG}

vec3 sampleScene(vec2 uv, vec2 dir, float amount) {
  // Chromatic aberration grows towards the edge only: a uniform split reads as a
  // broken lens, an edge-weighted one reads as a wide angle.
  vec2 r = uv + dir * amount * 1.00;
  vec2 b = uv - dir * amount * 1.00;
  return vec3(
    texture2D(tScene, r).r,
    texture2D(tScene, uv).g,
    texture2D(tScene, b).b
  );
}

void main() {
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;
  float rad = length(centred);
  vec2 dir = rad > 1e-5 ? centred / rad : vec2(0.0);

  // Six texels of split at the very corner, and only at full speed: real lens
  // dispersion is a pixel or two. This multiplier is in TEXELS, so a value
  // sized as though it were a UV offset smears the whole frame into rainbows.
  vec3 col = sampleScene(uv, dir * uTexel * 6.0, uChroma * rad * rad);

  if (uRadial > 0.001) {
    // Streaks towards the edges only; the middle of the screen, where the road
    // is, stays sharp.
    float w = uRadial * smoothstep(0.12, 0.75, rad);
    vec3 acc = col;
    acc += texture2D(tScene, uv - centred * w * 0.020).rgb;
    acc += texture2D(tScene, uv - centred * w * 0.045).rgb;
    acc += texture2D(tScene, uv - centred * w * 0.075).rgb;
    acc += texture2D(tScene, uv - centred * w * 0.110).rgb;
    col = mix(col, acc * 0.2, smoothstep(0.0, 0.35, w));
  }

  col += texture2D(tBloom, uv).rgb * uBloom;
  col *= uExposure;
  col = acesFilmic(col);

  vec3 graded = uGain * (col + uLift * (1.0 - col));
  graded = pow(max(graded, vec3(0.0)), uGamma);
  float l = luma(graded);
  graded = mix(vec3(l), graded, uSaturation);

  float vig = 1.0 - uVignette * smoothstep(0.28, 0.86, rad);
  graded *= vig;

  vec3 srgb = linearToSRGB(max(graded, vec3(0.0)));

  // Ordered dither before quantisation. Without it a clean sky gradient bands
  // into visible steps on every 8-bit display, and no amount of bloom hides it.
  float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  srgb += (n - 0.5) * uDither;

  gl_FragColor = vec4(srgb, 1.0);
}
`;

const PARTICLE_VERT = `
attribute float aSize;
attribute float aFade;
attribute vec3 aColour;
uniform float uScale;
varying vec3 vColour;
varying float vFade;
varying float vFog;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = max(1.0, aSize * uScale / max(0.25, dist));
  vColour = aColour;
  vFade = aFade;
  vFog = smoothstep(uFogNear, uFogFar, dist);
}
`;

const PARTICLE_FRAG = `
uniform float uOpacity;
uniform vec3 uFogColour;
varying vec3 vColour;
varying float vFade;
varying float vFog;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float a = smoothstep(0.25, 0.015, r2) * vFade * uOpacity;
  if (a <= 0.003) discard;
  vec3 c = mix(vColour, uFogColour, vFog * 0.85);
  gl_FragColor = vec4(c, a);
}
`;

const DECAL_VERT = `
attribute float aAlpha;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vAlpha = aAlpha;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const DECAL_FRAG = `
uniform vec3 uColour;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  // Soft along the width, hard along the length, so overlapping stamps read as
  // one continuous mark instead of a row of dots.
  float a = (1.0 - smoothstep(0.24, 0.5, abs(d.x))) * (1.0 - smoothstep(0.35, 0.5, abs(d.y)));
  a *= vAlpha;
  if (a <= 0.004) discard;
  gl_FragColor = vec4(uColour, a);
}
`;

// The contact pool. Output is the multiplier the ground keeps, so 1.0 is
// untouched: the darkening never depends on how bright the scene happens to be.
const CONTACT_FRAG = `
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r2 = dot(d, d);
  // Squared falloff off a squared radius, so the core is broad and flat and the
  // rim reaches zero smoothly rather than ending on a visible ellipse.
  float a = 1.0 - clamp(r2, 0.0, 1.0);
  gl_FragColor = vec4(vec3(1.0 - a * a * uAlpha), 1.0);
}
`;

const CONTACT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BEAM_VERT = `
varying float vAlong;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  // The cone is baked apex-first, and a cone's v runs 1 at the apex: flip it so
  // vAlong is 0 at the lamp and 1 at the far end of the throw.
  vAlong = 1.0 - clamp(uv.y, 0.0, 1.0);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const BEAM_FRAG = `
uniform vec3 uColour;
uniform float uStrength;
varying float vAlong;
varying vec3 vNormalW;
varying vec3 vViewDir;

// How much of the cone's length the throat ramp spends, and how fast the shaft
// runs out past it. tests/render.test.mjs reads both out of this source rather
// than carrying its own copy, so slack given here shows up there as the pixels
// it costs.
const float BEAM_THROAT = 0.28;
const float BEAM_FALL = 1.3;

void main() {
  // A cone stands in for the lit volume, so the shell is brightest where a ray
  // crosses the most of that volume: side-on to the wall. The old rim term did
  // the opposite and lit the silhouette, which from directly behind the car —
  // where the whole cone is silhouette — drew a white balloon over the bonnet.
  // The small constant is the rest of the volume, so looking straight down the
  // beam in fog still shows a haze rather than nothing at all.
  //
  // The throat is the other half of that argument and it was missing. One shell
  // crossing carries a whole chord of lit air in a single fragment, and near
  // the apex the cone is thin — a metre out the chord is centimetres — so
  // giving that fragment the profile's peak paints the brightest thing in the
  // shader straight onto the near road, where the tone curve has the least
  // slope left to render it with. That is why no single level worked. Measured
  // on a night-rain frame with the car stopped: at the 0.5 this shipped with,
  // the road at 12 m read 217/255 while the air three metres above it reached
  // 74.9, against 68.8 for air beside the beam; at 0.12 the road came back and
  // that same air read 58 against the same 68.8-to-70. Read once as the lit fog
  // being DARKER than the haze, which it cannot be: the shell is additively
  // blended, so at any one pixel beam-on is never below beam-off, and those two
  // samples are two different places in the frame. What 0.12 really cost is how
  // little the cone was worth over the SAME air — modelled two thirds down the
  // cone on night-rain it is 42 levels, against 82 at the coefficient that now
  // ships. The fix is a throat ramped in over the first quarter of the cone and
  // a slower far taper, which moves the light to where the chord is long: on the
  // same frame the air three metres up reads 88, the road peaks at 195, and one
  // pixel in a thousand of the road half passes 240 with the brightest at 241.
  //
  // And "a slower far taper" undersells what that costs per pixel. The
  // along-axis term was (1.0 - vAlong) * (1.0 - vAlong), two multiplies. It is
  // now a smoothstep throat times pow(max(1.0 - vAlong, 0.0), BEAM_FALL) — a
  // SECOND pow per fragment, on shells that cover a large part of a night frame.
  // The shader already carried pow(face, 0.9), so this is not its first
  // transcendental, but it is one more than the taper used to cost.
  float face = abs(dot(normalize(vNormalW), normalize(vViewDir)));
  float t = clamp(vAlong / BEAM_THROAT, 0.0, 1.0);
  float body = t * t * (3.0 - 2.0 * t) * pow(max(1.0 - vAlong, 0.0), BEAM_FALL);
  float a = (0.22 + 0.78 * pow(face, 0.9)) * body * uStrength;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uColour, a);
}
`;

const GHOST_VERT = `
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const GHOST_FRAG = `
uniform vec3 uColour;
uniform float uOpacity;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  float rim = 1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir)));
  float a = uOpacity * (0.20 + 0.80 * pow(rim, 1.6));
  gl_FragColor = vec4(uColour * (0.6 + 0.8 * rim), a);
}
`;

// ---- procedural textures -------------------------------------------------

// Canvas is not available under Node and a data URI is an external asset by
// another name, so every texture here is generated straight into a DataTexture.
function makeNoiseTexture(three, size, seed, bin) {
  const n = size * size;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const x = i % size;
    const y = (i / size) | 0;
    const a = hash3(x, y, 0, seed);
    const b = hash3(x * 2, y * 2, 1, seed);
    const c = hash3(x * 4, y * 4, 2, seed);
    const v = a * 0.5 + b * 0.32 + c * 0.18;
    const o = i * 4;
    data[o] = (v * 255) | 0;
    data[o + 1] = (b * 255) | 0;
    data[o + 2] = (c * 255) | 0;
    data[o + 3] = 255;
  }
  const tex = new three.DataTexture(data, size, size, three.RGBAFormat);
  tex.wrapS = three.RepeatWrapping;
  tex.wrapT = three.RepeatWrapping;
  tex.needsUpdate = true;
  if (bin) bin.track(tex);
  return tex;
}

// ---- the renderer --------------------------------------------------------

const _sample = makeCarSample();

function defaultRendererFactory(three, canvas, opts) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new Error("OpusRally: createRenderer needs a canvas with getContext()");
  }
  const attrs = {
    alpha: false,
    antialias: opts.antialias !== false,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
    failIfMajorPerformanceCaveat: false,
  };
  let context = canvas.getContext("webgl2", attrs);
  let webgl2 = true;
  if (!context) {
    webgl2 = false;
    context = canvas.getContext("webgl", attrs) || canvas.getContext("experimental-webgl", attrs);
  }
  if (!context) {
    throw new Error("OpusRally: this browser has no WebGL — the game cannot start");
  }
  const renderer = new three.WebGLRenderer({ canvas, context, ...attrs });
  renderer.opusWebGL2 = webgl2;
  return renderer;
}

export function createRenderer(canvas, opts = {}) {
  const three = opts.THREE || THREE_DEFAULT;
  const factory = opts.rendererFactory || defaultRendererFactory;
  const gl = factory(three, canvas, opts);
  const meshLib = opts.meshes || null;
  // Optional on purpose: render.js runs against a fallback mesh library in the
  // tests, and a stage with no snow uniform simply never gets one written.
  const setGroundSnowFn = meshLib && typeof meshLib.setGroundSnow === "function"
    ? meshLib.setGroundSnow
    : null;
  const updateWheelFn = meshLib && typeof meshLib.updateWheel === "function"
    ? meshLib.updateWheel
    : null;
  const rng = makeRng(opts.seed === undefined ? "opus-render" : opts.seed);

  const permBin = createResourceBin("renderer");
  let stageBin = createResourceBin("stage");

  const scene = new three.Scene();
  scene.name = "opus.world";
  const camera = new three.PerspectiveCamera(62, 16 / 9, 0.3, 6000);
  camera.name = "opus.camera";
  scene.add(camera);

  // Scratch. Nothing below this line may allocate on the update path.
  const vTmp = new three.Vector3();
  const vTmp2 = new three.Vector3();
  const vUp = new three.Vector3(0, 1, 0);
  const qTmp = new three.Quaternion();
  const mTmp = new three.Matrix4();
  const eTmp = new three.Euler();
  const proj = { s: 0, lateral: 0, signedLateral: 0, index: 0, frac: 0 };

  const state = {
    qualityRequest: opts.quality || "auto",
    quality: qualitySettings("high"),
    auto: createAutoScaler({ index: 2 }),
    autoEnabled: (opts.quality || "auto") === "auto",
    resolutionScale: 1,
    pixelRatio: 1,
    width: 1280,
    height: 720,
    lastFrameStamp: 0,
    frameMs: 16.7,
    cameraMode: opts.camera || "chase",
    prevMode: "chase",
    headlightsForced: null,
    headlightsOn: false,
    stage: null,
    world: null,
    ground: null,
    weather: null,
    car: null,
    carMesh: null,
    wheelMeshes: [],
    brakeMaterial: null,
    lampMaterial: null,
    ghostMesh: null,
    instruments: null,
    built: false,
    time: 0,
    tvTimer: 0,
    tvIndex: 0,
    finishTimer: 0,
    sunX: 0, sunY: 1, sunZ: 0,
    wetness: 0,
    groundSnow: 0,
    dustLit: 0.5,
    exposure: 1,
    drawsIssued: 0,
    lastS: 0,
    speedCue: 0,
  };

  const rigs = {};
  // One mutable copy of each rig per renderer, re-framed for the canvas's aspect
  // on every resize. The frozen originals stay the authored 16:9 reference.
  const framed = {};
  for (let i = 0; i < CAMERA_MODES.length; i += 1) {
    const mode = CAMERA_MODES[i];
    rigs[mode] = makeCameraRig(mode);
    framed[mode] = Object.assign({}, cameraParams(mode));
  }
  function reframeCameras(aspect) {
    for (let i = 0; i < CAMERA_MODES.length; i += 1) {
      const mode = CAMERA_MODES[i];
      adaptCameraParams(framed[mode], cameraParams(mode), aspect);
    }
  }
  const framedParams = (mode) => framed[mode] || framed.chase;

  const noiseTex = makeNoiseTexture(three, 64, rng.fork("noise").seed, permBin);

  // ---- lighting fallback
  //
  // weather.js owns the key, fill, bounce and ambient lights and adds them to
  // this scene when a stage is built. Until then — the menu backdrop, or a stage
  // built without weather — the renderer needs its own, or the first frame is
  // black.
  const fallbackKey = new three.DirectionalLight(0xfff2e0, 2.2);
  fallbackKey.position.set(120, 180, 90);
  fallbackKey.name = "render.fallbackKey";
  const fallbackFill = new three.HemisphereLight(0x9fc4ff, 0x39352c, 0.9);
  fallbackFill.name = "render.fallbackFill";
  scene.add(fallbackKey, fallbackKey.target, fallbackFill);

  const shadowFit = makeShadowFit();
  // Two edge points per sample over the fitted span; 512 is more than the fit
  // ever needs and costs one allocation, here, once.
  const shadowPoints = new Float32Array(512 * 3);
  let shadowLight = null;

  // ---- particles

  const dustPool = createParticlePool(4608);
  const debrisPool = createParticlePool(1024);

  const dustGeo = new three.BufferGeometry();
  dustGeo.setAttribute("position", new three.BufferAttribute(dustPool.outPos, 3));
  dustGeo.setAttribute("aColour", new three.BufferAttribute(dustPool.outCol, 3));
  dustGeo.setAttribute("aSize", new three.BufferAttribute(dustPool.outSize, 1));
  dustGeo.setAttribute("aFade", new three.BufferAttribute(dustPool.outFade, 1));
  dustGeo.boundingSphere = new three.Sphere(new three.Vector3(), 1e6);
  permBin.track(dustGeo);

  const debrisGeo = new three.BufferGeometry();
  debrisGeo.setAttribute("position", new three.BufferAttribute(debrisPool.outPos, 3));
  debrisGeo.setAttribute("aColour", new three.BufferAttribute(debrisPool.outCol, 3));
  debrisGeo.setAttribute("aSize", new three.BufferAttribute(debrisPool.outSize, 1));
  debrisGeo.setAttribute("aFade", new three.BufferAttribute(debrisPool.outFade, 1));
  debrisGeo.boundingSphere = new three.Sphere(new three.Vector3(), 1e6);
  permBin.track(debrisGeo);

  function particleMaterial(blending) {
    const mat = new three.ShaderMaterial({
      uniforms: {
        uScale: { value: 620 },
        uOpacity: { value: 1 },
        uFogColour: { value: new three.Color(0x8899aa) },
        uFogNear: { value: 200 },
        uFogFar: { value: 3000 },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending,
    });
    permBin.trackMaterial(mat);
    return mat;
  }

  const dustMat = particleMaterial(three.NormalBlending);
  const debrisMat = particleMaterial(three.AdditiveBlending);

  const dustPoints = new three.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = 6;
  dustPoints.name = "opus.dust";
  const debrisPoints = new three.Points(debrisGeo, debrisMat);
  debrisPoints.frustumCulled = false;
  debrisPoints.renderOrder = 7;
  debrisPoints.name = "opus.debris";
  scene.add(dustPoints, debrisPoints);

  // ---- tyre marks
  //
  // A ring of flat quads stamped along the contact patch. A ribbon would need a
  // growing geometry; a recycled decal pool has a hard ceiling and reads the same.

  const MARK_CAP = 1400;
  const markGeo = new three.PlaneGeometry(1, 1);
  markGeo.rotateX(-Math.PI / 2);
  permBin.track(markGeo);
  const markAlpha = new Float32Array(MARK_CAP);
  const markBase = new Float32Array(MARK_CAP);
  const markAge = new Float32Array(MARK_CAP);
  const markLife = new Float32Array(MARK_CAP);
  markGeo.setAttribute("aAlpha", new three.InstancedBufferAttribute(markAlpha, 1));
  const markMat = new three.ShaderMaterial({
    uniforms: { uColour: { value: new three.Color(0x120f0c) } },
    vertexShader: DECAL_VERT,
    fragmentShader: DECAL_FRAG,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  permBin.trackMaterial(markMat);
  const markMesh = new three.InstancedMesh(markGeo, markMat, MARK_CAP);
  markMesh.frustumCulled = false;
  markMesh.instanceMatrix.setUsage(three.DynamicDrawUsage);
  markMesh.count = MARK_CAP;
  markMesh.renderOrder = 2;
  markMesh.name = "opus.marks";
  scene.add(markMesh);
  let markCursor = 0;
  const markZero = new three.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MARK_CAP; i += 1) markMesh.setMatrixAt(i, markZero);
  markMesh.instanceMatrix.needsUpdate = true;

  // ---- contact shadow
  //
  // One unit quad, one draw call, never culled, scaled and dropped onto the
  // ground under the car every frame.

  const contactGeo = new three.PlaneGeometry(1, 1);
  contactGeo.rotateX(-Math.PI / 2);
  permBin.track(contactGeo);
  const contactMat = new three.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: CONTACT_VERT,
    fragmentShader: CONTACT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: three.MultiplyBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  permBin.trackMaterial(contactMat);
  const contactMesh = new three.Mesh(contactGeo, contactMat);
  contactMesh.frustumCulled = false;
  contactMesh.renderOrder = 1;
  contactMesh.visible = false;
  contactMesh.name = "opus.contactShadow";
  scene.add(contactMesh);
  const contactFit = makeContactShadowFit();
  const contactSize = { length: 4.4, width: 2.4, nominal: DEFAULT_COM_HEIGHT };
  const contactNormal = { x: 0, y: 1, z: 0 };
  const qTilt = new three.Quaternion();
  const qYaw = new three.Quaternion();
  const vNormal = new three.Vector3();

  // ---- car lighting pod

  const headlights = {
    left: null,
    right: null,
    pod: null,
    spill: null,
    beams: null,
    brake: null,
    on: false,
    level: 0,
    // Where the lamps sit on this car, in metres above the road and along the
    // chassis. Refitted from the model when a stage is built.
    y: 0.74,
    x: 0.33,
    z: 1.85,
    com: DEFAULT_COM_HEIGHT,
  };

  // Take the lamp anchors off the body the artist actually built, so a beam
  // leaves the car at the height of its own headlamps on every class.
  function fitLampRig(spec) {
    headlights.com = spec && spec.comHeight > 0 ? spec.comHeight : DEFAULT_COM_HEIGHT;
    headlights.y = 0.74;
    headlights.x = 0.33;
    headlights.z = 1.85;
    if (!meshLib || typeof meshLib.carDimensions !== "function" || !spec) return;
    const d = safeCall(() => meshLib.carDimensions(spec));
    if (!d || !Number.isFinite(d.ground)) return;
    if (Number.isFinite(d.beltY)) headlights.y = d.beltY - 0.155 - d.ground;
    if (Number.isFinite(d.bodyHalfWidth)) headlights.x = d.bodyHalfWidth * 0.48;
    if (Number.isFinite(d.noseZ)) headlights.z = d.noseZ - 0.06;
    const beams = headlights.beams;
    if (beams) {
      beams.children[0].position.x = -headlights.x;
      beams.children[1].position.x = headlights.x;
    }
  }

  // The pool is sized off the shell it sits under, so a long four-wheel-drive and
  // a short heritage car do not share a footprint.
  function fitContactRig(spec) {
    contactSize.length = 4.4;
    contactSize.width = 2.4;
    contactSize.nominal = spec && spec.comHeight > 0 ? spec.comHeight : DEFAULT_COM_HEIGHT;
    if (!meshLib || typeof meshLib.carDimensions !== "function" || !spec) return;
    const d = safeCall(() => meshLib.carDimensions(spec));
    if (!d) return;
    if (Number.isFinite(d.noseZ) && Number.isFinite(d.tailZ)) {
      contactSize.length = (d.noseZ - d.tailZ) * CONTACT_SHADOW.lengthScale;
    }
    if (Number.isFinite(d.halfWidth)) {
      contactSize.width = d.halfWidth * 2 * CONTACT_SHADOW.widthScale;
    }
  }

  function buildHeadlights() {
    // Full penumbra on every lamp: the smoothstep from the axis to the rim is
    // the only beam pattern a three.js spot light has.
    const h = HEADLIGHT;
    const left = new three.SpotLight(0xfff2dc, 0, h.distance, h.mainAngle, 1, h.decay);
    const right = new three.SpotLight(0xfff2dc, 0, h.distance, h.mainAngle, 1, h.decay);
    left.name = "opus.headlight.l";
    right.name = "opus.headlight.r";
    left.castShadow = false;
    right.castShadow = false;
    // The lamp bar: narrower and far brighter than the dipped beams, thrown most
    // of a stage ahead.
    const pod = new three.SpotLight(0xfffaf0, 0, h.distance, h.podAngle, 1, h.decay);
    pod.name = "opus.lightpod";
    pod.castShadow = false;
    // A wide, weak flood over the few metres in front of the bumper that a beam
    // aimed down the road necessarily misses. Without it the car drives out of a
    // black hole.
    const spill = new three.SpotLight(0xfff6e8, 0, h.distance, h.spillAngle, 1, h.decay);
    spill.name = "opus.headlight.spill";
    spill.castShadow = false;
    headlights.left = left;
    headlights.right = right;
    headlights.pod = pod;
    headlights.spill = spill;
    scene.add(left, left.target, right, right.target,
      pod, pod.target, spill, spill.target);

    // Baked at its final proportions and used at scale 1, because a scaled cone
    // gives skewed normals and the facing term is the whole effect. Apex at the
    // lamp, opening forwards along +Z, at the spread of the beam it stands for.
    const beamGeo = new three.ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 20, 1, true);
    beamGeo.translate(0, -BEAM_LENGTH * 0.5, 0);
    beamGeo.rotateX(-Math.PI / 2);
    permBin.track(beamGeo);
    const beamMat = new three.ShaderMaterial({
      uniforms: {
        uColour: { value: new three.Color(0xfff0d6) },
        uStrength: { value: 0 },
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: three.DoubleSide,
      blending: three.AdditiveBlending,
    });
    permBin.trackMaterial(beamMat);
    const beams = new three.Group();
    beams.name = "opus.beams";
    for (let i = 0; i < 2; i += 1) {
      const m = new three.Mesh(beamGeo, beamMat);
      m.position.set(i === 0 ? -0.62 : 0.62, 0, 0);
      m.frustumCulled = false;
      beams.add(m);
    }
    beams.visible = false;
    headlights.beams = beams;
    scene.add(beams);
  }
  buildHeadlights();

  // ---- cabin lighting

  const cabin = {
    fill: null,
    glow: null,
    fillY: CABIN.fallbackFillY,
    fillZ: DEFAULT_FRONT_AXLE + CABIN.fillAxle,
    glowY: CABIN.fallbackGlowY,
    glowZ: DEFAULT_FRONT_AXLE + CABIN.glowAxle,
  };

  function buildCabinLights() {
    const fill = new three.PointLight(0xffffff, 0, CABIN.fillDistance, CABIN.fillDecay);
    fill.name = "opus.cabin.fill";
    fill.castShadow = false;
    const glow = new three.PointLight(CABIN.glowColour, 0, CABIN.glowDistance, CABIN.glowDecay);
    glow.name = "opus.cabin.glow";
    glow.castShadow = false;
    cabin.fill = fill;
    cabin.glow = glow;
    // Permanent and dark until a stage is built, exactly like the headlights: a
    // light added and removed with the stage changes the scene's light count and
    // costs every material in it a recompile.
    scene.add(fill, glow);
  }
  buildCabinLights();

  // Where the two lights hang in the chassis frame, taken off the modelled body
  // the way fitLampRig takes the lamps: from carDimensions, by eye, rather than by
  // copying the builder's own layout arithmetic.
  function fitCabinRig(spec) {
    cabin.fillY = CABIN.fallbackFillY;
    cabin.glowY = CABIN.fallbackGlowY;
    cabin.fillZ = DEFAULT_FRONT_AXLE + CABIN.fillAxle;
    cabin.glowZ = DEFAULT_FRONT_AXLE + CABIN.glowAxle;
    if (!meshLib || typeof meshLib.carDimensions !== "function" || !spec) return;
    const d = safeCall(() => meshLib.carDimensions(spec));
    if (!d) return;
    if (Number.isFinite(d.roofY)) cabin.fillY = d.roofY - CABIN.fillDrop;
    if (Number.isFinite(d.beltY)) cabin.glowY = d.beltY + CABIN.glowRise;
    if (Number.isFinite(d.frontAxle)) {
      cabin.fillZ = d.frontAxle + CABIN.fillAxle;
      cabin.glowZ = d.frontAxle + CABIN.glowAxle;
    }
  }

  // ---- post chain

  const post = {
    enabled: false,
    sceneRT: null,
    brightRT: null,
    blurA: null,
    blurB: null,
    quad: null,
    bright: null,
    blur: null,
    composite: null,
    camera: new three.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    geo: null,
    width: 0,
    height: 0,
    samples: 0,
  };

  function buildPost() {
    const geo = new three.BufferGeometry();
    geo.setAttribute("position", new three.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3,
    ));
    geo.setAttribute("uv", new three.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    permBin.track(geo);
    post.geo = geo;

    post.bright = new three.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uTexel: { value: new three.Vector2(1 / 1280, 1 / 720) },
        uThreshold: { value: 1.0 },
        uKnee: { value: 0.55 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    post.blur = new three.ShaderMaterial({
      uniforms: {
        tSource: { value: null },
        uTexel: { value: new three.Vector2(1 / 512, 1 / 512) },
        uDirection: { value: new three.Vector2(1, 0) },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    post.composite = new three.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uTexel: { value: new three.Vector2(1 / 1280, 1 / 720) },
        uExposure: { value: 1 },
        uBloom: { value: 0.55 },
        uChroma: { value: 0.6 },
        uVignette: { value: 0.34 },
        uRadial: { value: 0 },
        uDither: { value: 1 / 255 },
        uTime: { value: 0 },
        uLift: { value: new three.Vector3(0, 0, 0) },
        uGamma: { value: new three.Vector3(1, 1, 1) },
        uGain: { value: new three.Vector3(1, 1, 1) },
        uSaturation: { value: 1.04 },
      },
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    permBin.trackMaterial(post.bright);
    permBin.trackMaterial(post.blur);
    permBin.trackMaterial(post.composite);

    post.quad = new three.Mesh(geo, post.composite);
    post.quad.frustumCulled = false;
    post.scene = new three.Scene();
    post.scene.add(post.quad);
  }
  buildPost();

  // Every texture the stage put on screen, so a quality change can re-filter
  // them without walking the scene graph. A gravel road seen at a grazing angle
  // through trilinear-only filtering is a featureless grey band from about 30 m
  // out — anisotropy is most of what makes a surface read as a surface at
  // distance, and the quality knob for it was declared at all four levels and
  // read by nobody.
  const anisoTextures = [];

  function collectAnisotropy(root) {
    if (!root || typeof root.traverse !== "function") return;
    root.traverse((o) => {
      const m = o.material;
      if (!m) return;
      const list = Array.isArray(m) ? m : [m];
      for (let i = 0; i < list.length; i += 1) {
        const mat = list[i];
        if (!mat) continue;
        for (let k = 0; k < ANISO_MAPS.length; k += 1) {
          const tex = mat[ANISO_MAPS[k]];
          if (tex && tex.isTexture && anisoTextures.indexOf(tex) < 0) anisoTextures.push(tex);
        }
      }
    });
    applyAnisotropy();
  }

  function applyAnisotropy() {
    const caps = gl.capabilities;
    const max = caps && typeof caps.getMaxAnisotropy === "function"
      ? (caps.getMaxAnisotropy() || 1) : 1;
    const want = Math.max(1, Math.min(state.quality.anisotropy || 1, max));
    for (let i = 0; i < anisoTextures.length; i += 1) {
      const t = anisoTextures[i];
      if (t.anisotropy === want) continue;
      t.anisotropy = want;
      t.needsUpdate = true;
    }
  }

  function isWebGL2() {
    if (gl.opusWebGL2) return true;
    const caps = gl.capabilities;
    return !!(caps && caps.isWebGL2);
  }

  // A half-float target is what lets a headlight sit at 4.0 in the scene pass and
  // bloom properly. WebGL1 without EXT_color_buffer_half_float cannot give us
  // one, and an incomplete framebuffer is a black screen, so fall back to 8-bit
  // and drop the bright threshold under 1.0 — clamped values never cross it.
  function supportsHdrTargets() {
    if (isWebGL2()) return true;
    const ext = gl.extensions;
    if (ext && typeof ext.has === "function") return !!ext.has("EXT_color_buffer_half_float");
    return false;
  }

  // The default framebuffer's `antialias` attribute buys nothing once the post
  // chain owns the image: the scene is drawn into an offscreen target and the
  // back buffer only ever receives a full-screen quad. A WebGL2 multisampled
  // target is the one place the resolve can still happen, and without it every
  // pole, roof line and horizon in the game is a staircase.
  function targetSamples() {
    if (!isWebGL2()) return 0;
    return state.quality.msaa | 0;
  }

  function sizePost(w, h) {
    const width = Math.max(2, w | 0);
    const height = Math.max(2, h | 0);
    const samples = targetSamples();
    // A device that turned the post chain off should not be paying for its
    // render targets; on a phone that is 18 MB of VRAM nothing ever samples.
    if (!post.enabled) {
      disposeTargets();
      post.width = 0;
      post.height = 0;
      post.samples = 0;
      return;
    }
    if (post.width === width && post.height === height
      && post.samples === samples && post.sceneRT) return;
    post.width = width;
    post.height = height;
    post.samples = samples;
    const hdr = supportsHdrTargets();
    post.hdr = hdr;
    post.bright.uniforms.uThreshold.value = hdr ? 1.0 : 0.68;
    post.bright.uniforms.uKnee.value = hdr ? 0.55 : 0.22;
    const half = { minFilter: three.LinearFilter, magFilter: three.LinearFilter,
      format: three.RGBAFormat,
      type: hdr ? three.HalfFloatType : three.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false };
    const bw = Math.max(2, width >> 1);
    const bh = Math.max(2, height >> 1);
    disposeTargets();
    // Only the scene pass is multisampled: the bloom chain is a blur of a blur
    // at half resolution and has no edges left to resolve.
    post.sceneRT = new three.WebGLRenderTarget(width, height,
      samples > 0 ? { ...half, samples } : half);
    post.sceneRT.texture.colorSpace = three.LinearSRGBColorSpace;
    post.brightRT = new three.WebGLRenderTarget(bw, bh, { ...half, depthBuffer: false });
    post.blurA = new three.WebGLRenderTarget(bw, bh, { ...half, depthBuffer: false });
    post.blurB = new three.WebGLRenderTarget(bw, bh, { ...half, depthBuffer: false });
    post.composite.uniforms.uTexel.value.set(1 / width, 1 / height);
    post.blur.uniforms.uTexel.value.set(1 / bw, 1 / bh);
    // The bright pass reads the full-resolution scene while drawing into the
    // half-resolution bloom target, so its taps are spaced in SCENE texels.
    post.bright.uniforms.uTexel.value.set(1 / width, 1 / height);
  }

  function disposeTargets() {
    const list = [post.sceneRT, post.brightRT, post.blurA, post.blurB];
    for (let i = 0; i < list.length; i += 1) {
      if (list[i] && typeof list[i].dispose === "function") list[i].dispose();
    }
    post.sceneRT = null;
    post.brightRT = null;
    post.blurA = null;
    post.blurB = null;
  }

  // ---- renderer configuration

  function configureRenderer() {
    if (typeof gl.setPixelRatio === "function") gl.setPixelRatio(state.pixelRatio);
    if ("outputColorSpace" in gl) gl.outputColorSpace = three.SRGBColorSpace;
    // Lights are irradiance, not irradiance x PI: weather.js's intensities are
    // authored on that scale. `physicallyCorrectLights` is the r155 spelling of
    // the same switch and setting it only logs a removal warning on every
    // quality change.
    if ("useLegacyLights" in gl) gl.useLegacyLights = false;
    if (gl.shadowMap) {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = three.PCFSoftShadowMap;
      gl.shadowMap.autoUpdate = true;
    }
    applyToneMapping();
  }

  function applyToneMapping() {
    // When the post chain runs, the tone map lives in the composite shader — the
    // bloom has to see linear values above 1.0 or bright things stop blooming.
    if (post.enabled) {
      gl.toneMapping = three.NoToneMapping;
      gl.toneMappingExposure = 1;
    } else {
      gl.toneMapping = three.ACESFilmicToneMapping;
      gl.toneMappingExposure = state.exposure;
    }
  }
  configureRenderer();

  function resolveQuality() {
    const req = state.qualityRequest;
    state.autoEnabled = req === "auto";
    state.auto.enabled = state.autoEnabled;
    const level = state.autoEnabled ? autoScalerLevel(state.auto) : req;
    const q = qualitySettings(level);
    const changed = state.quality !== q;
    state.quality = q;
    // Without a floating-point target the intermediate pass would clamp the
    // highlights and then dither an already-quantised image, which is worse than
    // no post at all. Such a device gets the renderer's own ACES path instead.
    post.enabled = q.post && (opts.post !== false) && supportsHdrTargets();
    state.resolutionScale = state.autoEnabled ? autoScalerScale(state.auto) : 1;
    if (changed) applyQuality();
    applyToneMapping();
    return q;
  }

  function applyQuality() {
    const q = state.quality;
    if (gl.shadowMap) gl.shadowMap.enabled = q.shadows;
    if (shadowLight) {
      if (state.weather) state.weather.shadowGate = q.shadows;
      shadowLight.castShadow = q.shadows
        && shadowLight.userData.weatherWantsShadow !== false;
      if (shadowLight.shadow.mapSize.x !== q.shadowMapSize) {
        shadowLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
        if (shadowLight.shadow.map && typeof shadowLight.shadow.map.dispose === "function") {
          shadowLight.shadow.map.dispose();
          shadowLight.shadow.map = null;
        }
      }
    }
    applyAnisotropy();
    // updateHeadlights owns whether the cone is showing — it also needs the
    // weather, and a quality change must not switch it on in clear air.
    if (headlights.beams && !q.beams) headlights.beams.visible = false;
    // A dust puff is a metre across and nearly transparent; the plume comes
    // from hundreds of them overlapping. At full opacity each one is a solid
    // white disc and the rooster tail reads as a bag of golf balls.
    dustMat.uniforms.uOpacity.value = q.name === "low" ? 0.20 : 0.26;
    resize();
  }

  function resize() {
    const w = Math.max(2, (canvas && (canvas.clientWidth || canvas.width)) || 1280);
    const h = Math.max(2, (canvas && (canvas.clientHeight || canvas.height)) || 720);
    state.width = w;
    state.height = h;
    const dpr = (typeof globalThis !== "undefined" && globalThis.devicePixelRatio) || 1;
    state.pixelRatio = Math.min(dpr, state.quality.pixelRatioCap) * state.resolutionScale;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    reframeCameras(camera.aspect);
    if (typeof gl.setPixelRatio === "function") gl.setPixelRatio(state.pixelRatio);
    if (typeof gl.setSize === "function") gl.setSize(w, h, false);
    sizePost(Math.max(2, Math.round(w * state.pixelRatio)), Math.max(2, Math.round(h * state.pixelRatio)));
  }
  resolveQuality();
  resize();

  // ---- stage geometry

  const stageGroup = new three.Group();
  stageGroup.name = "opus.stage";
  scene.add(stageGroup);

  const scenery = {
    entries: [],       // { kind, lods: [{mesh, cap}], items: [...] }
    cells: null,
    cellSize: 96,
    nx: 0, nz: 0,
    minX: 0, minZ: 0,
    lodState: null,
    // Vertical extent of the tallest thing standing in each cell, so a cell can
    // be tested against the view frustum as a box rather than as a flat tile.
    cellLoY: null,
    cellHiY: null,
  };

  // Scratch for that test. One frustum per renderer, rebuilt in place each frame.
  const viewFrustum = new three.Frustum();
  const viewClip = new three.Matrix4();
  const cellBox = new three.Box3();

  // A wet road is not a dark road, it is a *glossy* one: the reflected sky streak
  // down the crown is most of what sells rain. The noise roughness map is what
  // breaks that streak up so it reads as a road and not as a mirror.
  function fallbackRoadMaterial(bin) {
    const mat = new three.MeshStandardMaterial({
      vertexColors: true,
      roughness: lerp(0.94, 0.22, saturate(state.wetness)),
      metalness: lerp(0.0, 0.12, saturate(state.wetness)),
      roughnessMap: noiseTex,
    });
    bin.trackMaterial(mat);
    return mat;
  }

  // Chunked so the frustum cull has something to cull: one mesh per 120 m of road
  // is enough granularity to throw away most of a stage every frame and few
  // enough draws to stay cheap.
  function buildFallbackRoad(stage, bin) {
    const group = new three.Group();
    group.name = "opus.road";
    const chunkSamples = Math.max(8, Math.round(120 / stage.step));
    const mat = fallbackRoadMaterial(bin);
    const wet = state.wetness;
    for (let c0 = 0; c0 < stage.count - 1; c0 += chunkSamples) {
      const c1 = Math.min(stage.count - 1, c0 + chunkSamples);
      const n = c1 - c0 + 1;
      if (n < 2) break;
      const verts = new Float32Array(n * 4 * 3);
      const norms = new Float32Array(n * 4 * 3);
      const cols = new Float32Array(n * 4 * 3);
      const uvs = new Float32Array(n * 4 * 2);
      const idx = new Uint32Array((n - 1) * 6 * 3);
      let vi = 0;
      let ii = 0;
      for (let i = c0; i <= c1; i += 1) {
        const tx = stage.tx[i];
        const tz = stage.tz[i];
        const inv = 1 / (Math.hypot(tx, tz) || 1);
        const rxv = tz * inv;
        const rzv = -tx * inv;
        const hw = stage.halfWidth[i];
        const camber = stage.camber ? stage.camber[i] : 0;
        const props = surfaceOf(stage, i);
        const shoulder = hw + 2.4;
        const drop = 0.35;
        const lane = [-shoulder, -hw, hw, shoulder];
        for (let k = 0; k < 4; k += 1) {
          const d = lane[k];
          const edge = k === 0 || k === 3;
          const y = stage.y[i] + d * Math.sin(camber) - (edge ? drop : 0);
          const o = vi * 3;
          verts[o] = stage.x[i] + rxv * d;
          verts[o + 1] = y;
          verts[o + 2] = stage.z[i] + rzv * d;
          norms[o] = stage.nx ? stage.nx[i] : 0;
          norms[o + 1] = stage.ny ? stage.ny[i] : 1;
          norms[o + 2] = stage.nz ? stage.nz[i] : 0;
          const tint = edge ? 0.55 : 1;
          const darken = 1 - props.wetDarken * wet;
          cols[o] = props.albedo[0] * tint * darken;
          cols[o + 1] = props.albedo[1] * tint * darken;
          cols[o + 2] = props.albedo[2] * tint * darken;
          const uo = vi * 2;
          uvs[uo] = d * 0.22;
          uvs[uo + 1] = i * stage.step * 0.11;
          vi += 1;
        }
      }
      for (let s = 0; s < n - 1; s += 1) {
        const a = s * 4;
        const b = (s + 1) * 4;
        for (let k = 0; k < 3; k += 1) {
          idx[ii] = a + k; idx[ii + 1] = b + k; idx[ii + 2] = a + k + 1;
          idx[ii + 3] = a + k + 1; idx[ii + 4] = b + k; idx[ii + 5] = b + k + 1;
          ii += 6;
        }
      }
      const geo = new three.BufferGeometry();
      geo.setAttribute("position", new three.BufferAttribute(verts, 3));
      geo.setAttribute("normal", new three.BufferAttribute(norms, 3));
      geo.setAttribute("color", new three.BufferAttribute(cols, 3));
      geo.setAttribute("uv", new three.BufferAttribute(uvs, 2));
      geo.setIndex(new three.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      bin.track(geo);
      const mesh = new three.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = `road.${c0}`;
      group.add(mesh);
    }
    return group;
  }

  function surfaceOf(stage, i) {
    return surfaceProps(stage.surface ? stage.surface[i] : SURFACE.GRAVEL);
  }

  function buildFallbackTerrain(stage, bin) {
    const group = new three.Group();
    group.name = "opus.terrain";
    const world = stage.world || state.world;
    if (!world || typeof world.heightAt !== "function") return group;
    const skip = Math.max(1, state.quality.terrainSkip * 3);
    const lateral = [-260, -170, -110, -70, -44, -26, -14, -6.5,
      6.5, 14, 26, 44, 70, 110, 170, 260];
    const chunkSamples = Math.max(8, Math.round(240 / stage.step));
    const mat = new three.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    bin.trackMaterial(mat);
    const cols3 = lateral.length;
    for (let c0 = 0; c0 < stage.count - 1; c0 += chunkSamples) {
      const c1 = Math.min(stage.count - 1, c0 + chunkSamples);
      const rows = [];
      for (let i = c0; i <= c1; i += skip) rows.push(i);
      if (rows[rows.length - 1] !== c1) rows.push(c1);
      if (rows.length < 2) continue;
      const nrows = rows.length;
      const verts = new Float32Array(nrows * cols3 * 3);
      const cols = new Float32Array(nrows * cols3 * 3);
      const idx = new Uint32Array((nrows - 1) * (cols3 - 1) * 6);
      let vi = 0;
      let ii = 0;
      for (let ri = 0; ri < nrows; ri += 1) {
        const i = rows[ri];
        const tx = stage.tx[i];
        const tz = stage.tz[i];
        const inv = 1 / (Math.hypot(tx, tz) || 1);
        const rxv = tz * inv;
        const rzv = -tx * inv;
        for (let k = 0; k < cols3; k += 1) {
          const d = lateral[k];
          const x = stage.x[i] + rxv * d;
          const z = stage.z[i] + rzv * d;
          const y = world.heightAt(x, z);
          const o = vi * 3;
          verts[o] = x; verts[o + 1] = y - 0.04; verts[o + 2] = z;
          const alt = saturate((y - stage.y[i]) / 60);
          const g = 0.16 + 0.10 * Math.abs(Math.sin(i * 0.11 + k));
          cols[o] = lerp(0.12, 0.30, alt) + g * 0.25;
          cols[o + 1] = lerp(0.19, 0.28, alt) + g * 0.4;
          cols[o + 2] = lerp(0.09, 0.24, alt) + g * 0.18;
          vi += 1;
        }
      }
      for (let ri = 0; ri < nrows - 1; ri += 1) {
        for (let k = 0; k < cols3 - 1; k += 1) {
          const a = ri * cols3 + k;
          const b = (ri + 1) * cols3 + k;
          idx[ii] = a; idx[ii + 1] = b; idx[ii + 2] = a + 1;
          idx[ii + 3] = a + 1; idx[ii + 4] = b; idx[ii + 5] = b + 1;
          ii += 6;
        }
      }
      const geo = new three.BufferGeometry();
      geo.setAttribute("position", new three.BufferAttribute(verts, 3));
      geo.setAttribute("color", new three.BufferAttribute(cols, 3));
      geo.setIndex(new three.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      bin.track(geo);
      const mesh = new three.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.name = `terrain.${c0}`;
      group.add(mesh);
    }
    return group;
  }

  // Three levels for every scenery kind: the real thing, a cheap solid, and a
  // two-triangle impostor. Original shapes, generated here — no assets.
  function buildFallbackSceneryLibrary(bin) {
    const lib = {};
    const trunkMat = new three.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.95 });
    const leafMat = new three.MeshStandardMaterial({ color: 0x2c4a22, roughness: 0.85 });
    const rockMat = new three.MeshStandardMaterial({ color: 0x565049, roughness: 0.95 });
    const bushMat = new three.MeshStandardMaterial({ color: 0x33401f, roughness: 0.9 });
    const wallMat = new three.MeshStandardMaterial({ color: 0x8b8378, roughness: 0.85 });
    const poleMat = new three.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.6, metalness: 0.4 });
    [trunkMat, leafMat, rockMat, bushMat, wallMat, poleMat].forEach((m) => bin.trackMaterial(m));

    function merge(parts) {
      // A tiny hand-rolled merge: three.js r158's BufferGeometryUtils is an addon
      // and is not vendored, and this only ever runs at build time.
      let vcount = 0;
      let icount = 0;
      for (const p of parts) {
        vcount += p.geo.attributes.position.count;
        icount += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
      }
      const pos = new Float32Array(vcount * 3);
      const nor = new Float32Array(vcount * 3);
      const idx = new Uint32Array(icount);
      let vo = 0;
      let io = 0;
      for (const p of parts) {
        const g = p.geo;
        const gp = g.attributes.position.array;
        const gn = g.attributes.normal ? g.attributes.normal.array : null;
        const n = g.attributes.position.count;
        for (let i = 0; i < n; i += 1) {
          pos[(vo + i) * 3] = gp[i * 3] * p.sx + p.tx;
          pos[(vo + i) * 3 + 1] = gp[i * 3 + 1] * p.sy + p.ty;
          pos[(vo + i) * 3 + 2] = gp[i * 3 + 2] * p.sz + p.tz;
          if (gn) {
            nor[(vo + i) * 3] = gn[i * 3];
            nor[(vo + i) * 3 + 1] = gn[i * 3 + 1];
            nor[(vo + i) * 3 + 2] = gn[i * 3 + 2];
          }
        }
        if (g.index) {
          const gi = g.index.array;
          for (let i = 0; i < gi.length; i += 1) idx[io + i] = gi[i] + vo;
          io += gi.length;
        } else {
          for (let i = 0; i < n; i += 1) idx[io + i] = i + vo;
          io += n;
        }
        vo += n;
        g.dispose();
      }
      const out = new three.BufferGeometry();
      out.setAttribute("position", new three.BufferAttribute(pos, 3));
      out.setAttribute("normal", new three.BufferAttribute(nor, 3));
      out.setIndex(new three.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      return out;
    }

    function part(geo, sx, sy, sz, tx, ty, tz) {
      return { geo, sx, sy, sz, tx, ty, tz };
    }

    const treeHi = merge([
      part(new three.CylinderGeometry(0.16, 0.26, 3.4, 7), 1, 1, 1, 0, 1.7, 0),
      part(new three.ConeGeometry(1.9, 5.4, 9), 1, 1, 1, 0, 5.4, 0),
      part(new three.ConeGeometry(1.35, 3.6, 8), 1, 1, 1, 0, 7.6, 0),
    ]);
    const treeMid = merge([
      part(new three.CylinderGeometry(0.2, 0.28, 3.4, 5), 1, 1, 1, 0, 1.7, 0),
      part(new three.ConeGeometry(1.9, 7.2, 6), 1, 1, 1, 0, 6.2, 0),
    ]);
    const treeLo = new three.PlaneGeometry(3.4, 8.4);
    treeLo.translate(0, 4.2, 0);
    [treeHi, treeMid, treeLo].forEach((g) => bin.track(g));

    const rockHi = new three.IcosahedronGeometry(1, 1);
    const rockLo = new three.IcosahedronGeometry(1, 0);
    [rockHi, rockLo].forEach((g) => bin.track(g));

    const bushHi = new three.IcosahedronGeometry(0.9, 1);
    bushHi.scale(1, 0.7, 1);
    bushHi.translate(0, 0.6, 0);
    bin.track(bushHi);

    const buildingHi = new three.BoxGeometry(7, 5, 9);
    buildingHi.translate(0, 2.5, 0);
    bin.track(buildingHi);

    const poleHi = new three.CylinderGeometry(0.11, 0.14, 7.5, 6);
    poleHi.translate(0, 3.75, 0);
    bin.track(poleHi);

    lib.tree = { lods: [
      { geometry: treeHi, material: leafMat },
      { geometry: treeMid, material: leafMat },
      { geometry: treeLo, material: leafMat },
    ], trunk: trunkMat };
    lib.rock = { lods: [
      { geometry: rockHi, material: rockMat },
      { geometry: rockLo, material: rockMat },
      { geometry: rockLo, material: rockMat },
    ] };
    lib.bush = { lods: [
      { geometry: bushHi, material: bushMat },
      { geometry: bushHi, material: bushMat },
      { geometry: bushHi, material: bushMat },
    ] };
    lib.building = { lods: [
      { geometry: buildingHi, material: wallMat },
      { geometry: buildingHi, material: wallMat },
      { geometry: buildingHi, material: wallMat },
    ] };
    lib.pole = { lods: [
      { geometry: poleHi, material: poleMat },
      { geometry: poleHi, material: poleMat },
      { geometry: poleHi, material: poleMat },
    ] };
    return lib;
  }

  function normaliseSceneryLibrary(raw, bin) {
    if (!raw || typeof raw !== "object") return null;
    const out = {};
    let any = false;
    for (const key in raw) {
      const entry = raw[key];
      if (!entry) continue;
      const lods = Array.isArray(entry) ? entry : entry.lods;
      if (!Array.isArray(lods) || !lods.length) continue;
      const clean = [];
      for (let i = 0; i < lods.length; i += 1) {
        const l = lods[i];
        if (!l || !l.geometry || !l.material) continue;
        bin.track(l.geometry);
        bin.trackMaterial(l.material);
        clean.push({ geometry: l.geometry, material: l.material });
      }
      if (clean.length) { out[key] = { lods: clean }; any = true; }
    }
    return any ? out : null;
  }

  // A library that hands back a finished group has already placed and instanced
  // everything itself, and its trees are better than four cones in a trenchcoat.
  // But its InstancedMeshes carry one bounding sphere spanning the whole stage,
  // so the frustum test is all-or-nothing and every tree in a 9 km stage is
  // submitted every frame, in the colour pass and again in the shadow pass. So
  // take the placement over rather than the group: copy the instance matrices
  // out once, and from then on write back only the ones inside the draw
  // distance, nearest first, up to the frame's budget. Same geometry, same
  // materials, same one draw per kind — with the distance culling that group was
  // never going to do for itself.
  function adoptInstanced(mesh) {
    const attr = mesh.instanceMatrix;
    // `count` is ours to shrink from here on, so remember what the library
    // placed: adopting the same mesh twice must not inherit our own culling.
    const placed = Math.max(mesh.count, mesh.userData ? (mesh.userData.opusInstances | 0) : 0);
    const n = Math.min(placed, attr.count);
    if (!n) return null;
    if (mesh.userData) mesh.userData.opusInstances = n;
    const src = new Float32Array(n * 16);
    src.set(attr.array.subarray(0, n * 16));
    const px = new Float32Array(n);
    const pz = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      px[i] = src[i * 16 + 12];
      pz[i] = src[i * 16 + 14];
    }
    let srcCol = null;
    if (mesh.instanceColor && mesh.instanceColor.array) {
      srcCol = new Float32Array(n * 3);
      srcCol.set(mesh.instanceColor.array.subarray(0, n * 3));
    }
    attr.setUsage(three.DynamicDrawUsage);
    // We cull by distance now, so a sphere that always intersects is dead work.
    mesh.frustumCulled = false;
    return {
      kind: mesh.name || "scenery",
      count: n, px, pz, src, srcCol,
      lods: [{ mesh, cap: n }],
      counts: new Int32Array(1),
      lodState: new Uint8Array(n),
      cells: null,
    };
  }

  function buildScenery(stage, bin) {
    scenery.entries.length = 0;
    const raw = meshLib && typeof meshLib.buildSceneryLibrary === "function"
      ? safeCall(() => meshLib.buildSceneryLibrary(three, stage))
      : null;
    let lib = normaliseSceneryLibrary(raw, bin);
    if (!lib) {
      const placed = adopt(raw, bin);
      if (placed) {
        placed.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          if (!o.isInstancedMesh) return;
          const entry = adoptInstanced(o);
          if (entry) scenery.entries.push(entry);
        });
        buildSceneryGrid(stage);
        return placed;
      }
      lib = buildFallbackSceneryLibrary(bin);
    }
    const items = stage.scenery || [];
    const byKind = new Map();
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const kind = lib[it.kind] ? it.kind : (lib.tree ? "tree" : Object.keys(lib)[0]);
      let bucket = byKind.get(kind);
      if (!bucket) { bucket = []; byKind.set(kind, bucket); }
      bucket.push(it);
    }
    scenery.entries.length = 0;
    const group = new three.Group();
    group.name = "opus.scenery";
    byKind.forEach((list, kind) => {
      const def = lib[kind];
      const lodMeshes = [];
      for (let l = 0; l < def.lods.length; l += 1) {
        const cap = Math.min(list.length, l === 0 ? 420 : 1400);
        const im = new three.InstancedMesh(def.lods[l].geometry, def.lods[l].material, cap);
        im.instanceMatrix.setUsage(three.DynamicDrawUsage);
        im.castShadow = l === 0;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.count = 0;
        im.name = `scenery.${kind}.lod${l}`;
        group.add(im);
        lodMeshes.push({ mesh: im, cap });
      }
      // Composed once here rather than per frame: the pose of a tree never
      // changes, only whether and at what size it is drawn.
      const n = list.length;
      const src = new Float32Array(n * 16);
      const px = new Float32Array(n);
      const pz = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        const it = list[i];
        const s = it.scale || 1;
        eTmp.set(0, it.yaw || 0, 0);
        qTmp.setFromEuler(eTmp);
        vTmp.set(it.x, it.y || 0, it.z);
        vTmp2.set(s, s, s);
        mTmp.compose(vTmp, qTmp, vTmp2);
        src.set(mTmp.elements, i * 16);
        px[i] = it.x;
        pz[i] = it.z;
      }
      scenery.entries.push({
        kind, count: n, px, pz, src, srcCol: null,
        lods: lodMeshes,
        counts: new Int32Array(lodMeshes.length),
        lodState: new Uint8Array(n),
        cells: null,
      });
    });
    buildSceneryGrid(stage);
    return group;
  }

  // A flat uniform grid over the stage bounds. Per frame the renderer only visits
  // the cells inside the draw distance, which is the difference between iterating
  // 30 scenery items and iterating 30,000.
  function buildSceneryGrid(stage) {
    const b = stage.bounds || { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 };
    const cs = scenery.cellSize;
    scenery.minX = b.minX - cs;
    scenery.minZ = b.minZ - cs;
    scenery.nx = Math.max(1, Math.ceil((b.maxX - b.minX) / cs) + 2);
    scenery.nz = Math.max(1, Math.ceil((b.maxZ - b.minZ) / cs) + 2);
    const total = scenery.nx * scenery.nz;
    const loY = new Float32Array(total).fill(Infinity);
    const hiY = new Float32Array(total).fill(-Infinity);
    for (let e = 0; e < scenery.entries.length; e += 1) {
      const entry = scenery.entries[e];
      const cells = new Array(total);
      // The tallest point of this kind in its own units, from the LOD 0 geometry.
      const geo = entry.lods[0] && entry.lods[0].mesh.geometry;
      if (geo && !geo.boundingSphere) geo.computeBoundingSphere();
      const bs = geo && geo.boundingSphere;
      const top = bs ? bs.center.y + bs.radius : 12;
      for (let i = 0; i < entry.count; i += 1) {
        const cx = clamp(Math.floor((entry.px[i] - scenery.minX) / cs), 0, scenery.nx - 1);
        const cz = clamp(Math.floor((entry.pz[i] - scenery.minZ) / cs), 0, scenery.nz - 1);
        const k = cz * scenery.nx + cx;
        if (!cells[k]) cells[k] = [];
        cells[k].push(i);
        const o = i * 16;
        const y = entry.src[o + 13];
        const sc = Math.hypot(entry.src[o], entry.src[o + 1], entry.src[o + 2]) || 1;
        if (y < loY[k]) loY[k] = y;
        const t = y + top * sc;
        if (t > hiY[k]) hiY[k] = t;
      }
      entry.cells = cells;
    }
    scenery.cellLoY = loY;
    scenery.cellHiY = hiY;
  }

  // meshes.js hands back descriptors — `{ group, …, dispose() }` — rather than
  // bare Object3Ds, and its dispose() is authoritative: it owns the geometries,
  // the materials and a shared texture cache this module cannot see. So take the
  // descriptor into the bin and never walk its internals. A plain Object3D is
  // still accepted, because the fallbacks below produce one.
  function adopt(result, bin) {
    if (!result) return null;
    if (typeof result.traverse === "function") { bin.trackTree(result); return result; }
    const group = result.group;
    if (!group || typeof group.traverse !== "function") return null;
    if (typeof result.dispose === "function") bin.track(result);
    else bin.trackTree(group);
    return group;
  }

  // Finds the material behind a named part, so the brake lights work whether the
  // car came from meshes.js or from the fallback below.
  function findEmissive(root, re) {
    let found = null;
    root.traverse((o) => {
      if (found || !o.isMesh || !o.material || !o.name) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat && mat.emissive && re.test(o.name)) found = mat;
    });
    return found;
  }

  // weather.js fills `wet` on its first step, so a stage built and rendered in
  // the same frame can reach this before it exists.
  function wetFilm(w) {
    return (w && w.wet && w.wet.film) || 0;
  }

  function safeCall(fn) {
    try {
      return fn();
    } catch (err) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("OpusRally render: optional mesh builder failed", err && err.message);
      }
      return null;
    }
  }

  function buildCar(spec, livery, bin) {
    let mesh = null;
    if (meshLib && typeof meshLib.buildCarMesh === "function") {
      mesh = adopt(safeCall(() => meshLib.buildCarMesh(three, spec, livery)), bin);
    }
    if (!mesh) mesh = bin.trackTree(buildFallbackCar(spec, bin));
    mesh.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    state.brakeMaterial = (mesh.userData && mesh.userData.brakeMaterial)
      || findEmissive(mesh, /brake|tail-?light|taillight|rear-?light/i);
    state.lampMaterial = (mesh.userData && mesh.userData.lampMaterial)
      || findEmissive(mesh, /lamp|headlight|pod|spot/i);
    if (!state.brakeMaterial) ensureBrakeLights(mesh, spec, bin);
    state.instruments = (mesh.userData && mesh.userData.instruments) || null;
    return mesh;
  }

  // Not every car model carries a brake light as a named part, and a rally car
  // seen from behind at night is mostly brake lights. When the model has none,
  // this module supplies its own pair rather than going without.
  function ensureBrakeLights(carGroup, spec, bin) {
    let tailZ = -2.05;
    let y = 0.72;
    let halfWidth = 0.62;
    if (meshLib && typeof meshLib.carDimensions === "function" && spec) {
      const d = safeCall(() => meshLib.carDimensions(spec));
      if (d) {
        if (Number.isFinite(d.tailZ)) tailZ = d.tailZ + 0.02;
        if (Number.isFinite(d.beltY) && Number.isFinite(d.sillY)) y = (d.beltY + d.sillY) * 0.5 + 0.08;
        if (Number.isFinite(d.bodyHalfWidth)) halfWidth = d.bodyHalfWidth * 0.72;
      }
    }
    const geo = new three.PlaneGeometry(0.30, 0.11);
    geo.rotateY(Math.PI);
    bin.track(geo);
    const mat = new three.MeshStandardMaterial({
      color: 0x2a0605, emissive: 0x120202, roughness: 0.35,
    });
    bin.trackMaterial(mat);
    for (let i = 0; i < 2; i += 1) {
      const m = new three.Mesh(geo, mat);
      m.name = `opus.brake${i}`;
      m.position.set(i === 0 ? -halfWidth : halfWidth, y, tailZ);
      carGroup.add(m);
    }
    state.brakeMaterial = mat;
  }

  function buildFallbackCar(spec, bin) {
    const g = new three.Group();
    g.name = "opus.car";
    const bodyCol = new three.Color(0.72, 0.14, 0.10);
    const body = new three.MeshStandardMaterial({ color: bodyCol, roughness: 0.42, metalness: 0.28 });
    const glass = new three.MeshStandardMaterial({
      color: 0x131820, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.72,
    });
    const trim = new three.MeshStandardMaterial({ color: 0x14161a, roughness: 0.75 });
    const lamp = new three.MeshStandardMaterial({
      color: 0xfff3d8, emissive: 0x000000, roughness: 0.25,
    });
    const brake = new three.MeshStandardMaterial({
      color: 0x3a0808, emissive: 0x220202, roughness: 0.35,
    });
    [body, glass, trim, lamp, brake].forEach((m) => bin.trackMaterial(m));

    const shell = new three.BoxGeometry(1.78, 0.62, 4.18);
    shell.translate(0, 0.55, 0);
    const cabin = new three.BoxGeometry(1.62, 0.56, 2.05);
    cabin.translate(0, 1.12, -0.18);
    const scoop = new three.BoxGeometry(0.62, 0.14, 0.5);
    scoop.translate(0, 0.92, 0.72);
    const wing = new three.BoxGeometry(1.7, 0.08, 0.36);
    wing.translate(0, 1.44, -1.96);
    const wingPostL = new three.BoxGeometry(0.09, 0.34, 0.2);
    wingPostL.translate(-0.62, 1.26, -1.94);
    const wingPostR = new three.BoxGeometry(0.09, 0.34, 0.2);
    wingPostR.translate(0.62, 1.26, -1.94);
    const podBar = new three.BoxGeometry(1.1, 0.16, 0.16);
    podBar.translate(0, 0.92, 2.05);
    [shell, cabin, scoop, wing, wingPostL, wingPostR, podBar].forEach((geo) => bin.track(geo));

    g.add(new three.Mesh(shell, body));
    g.add(new three.Mesh(cabin, glass));
    g.add(new three.Mesh(scoop, trim));
    g.add(new three.Mesh(wing, trim));
    g.add(new three.Mesh(wingPostL, trim));
    g.add(new three.Mesh(wingPostR, trim));
    const bar = new three.Mesh(podBar, trim);
    bar.name = "lightpod";
    g.add(bar);

    const lampGeo = new three.SphereGeometry(0.12, 10, 8);
    bin.track(lampGeo);
    for (let i = 0; i < 4; i += 1) {
      const m = new three.Mesh(lampGeo, lamp);
      m.position.set(-0.42 + i * 0.28, 0.98, 2.11);
      m.name = `pod${i}`;
      g.add(m);
    }
    const headGeo = new three.BoxGeometry(0.42, 0.18, 0.08);
    bin.track(headGeo);
    for (let i = 0; i < 2; i += 1) {
      const m = new three.Mesh(headGeo, lamp);
      m.position.set(i === 0 ? -0.6 : 0.6, 0.66, 2.09);
      m.name = `head${i}`;
      g.add(m);
    }
    const brakeGeo = new three.BoxGeometry(0.34, 0.12, 0.06);
    bin.track(brakeGeo);
    for (let i = 0; i < 2; i += 1) {
      const m = new three.Mesh(brakeGeo, brake);
      m.position.set(i === 0 ? -0.62 : 0.62, 0.72, -2.09);
      m.name = `brake${i}`;
      g.add(m);
    }
    g.userData.brakeMaterial = brake;
    g.userData.lampMaterial = lamp;
    return g;
  }

  // Each wheel is an outer group carrying the hub's world transform, with the
  // wheel itself inside it. Steer is a rotation of the inner object and spin is a
  // rotation of the part below that, which is the split meshes.js's updateWheel()
  // expects and the only one that stays right at full lock.
  function buildWheels(spec, bin) {
    let descriptor = null;
    if (meshLib && typeof meshLib.buildWheelMesh === "function") {
      descriptor = safeCall(() => meshLib.buildWheelMesh(three, spec));
    }
    let make = null;
    if (descriptor && typeof descriptor.instance === "function") {
      if (typeof descriptor.dispose === "function") bin.track(descriptor);
      make = () => descriptor.instance();
    } else if (descriptor && typeof descriptor.traverse === "function") {
      bin.trackTree(descriptor);
      make = (() => {
        let first = true;
        return () => {
          if (first) { first = false; return descriptor; }
          return descriptor.clone();
        };
      })();
    } else {
      const proto = buildFallbackWheel(bin);
      make = (() => {
        let first = true;
        return () => {
          if (first) { first = false; return proto; }
          return proto.clone();
        };
      })();
    }
    const out = [];
    for (let i = 0; i < 4; i += 1) {
      const inner = make();
      inner.name = `wheel${i}.hub`;
      inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const outer = new three.Group();
      outer.name = `wheel${i}`;
      outer.add(inner);
      // Resolved by name, never from userData: Object3D.clone() round-trips
      // userData through JSON, so a reference stored there comes back as a dead
      // plain object with no .rotation on it.
      out.push({ outer, inner, spin: inner.getObjectByName("spin") });
    }
    return out;
  }

  function buildFallbackWheel(bin) {
    const geo = new three.CylinderGeometry(0.33, 0.33, 0.25, 18, 1);
    geo.rotateZ(Math.PI / 2);
    bin.track(geo);
    const mat = new three.MeshStandardMaterial({ color: 0x15161a, roughness: 0.95 });
    bin.trackMaterial(mat);
    const rimGeo = new three.CylinderGeometry(0.20, 0.20, 0.27, 10, 1);
    rimGeo.rotateZ(Math.PI / 2);
    bin.track(rimGeo);
    const rimMat = new three.MeshStandardMaterial({ color: 0xb8a24a, roughness: 0.35, metalness: 0.7 });
    bin.trackMaterial(rimMat);
    const root = new three.Group();
    const spin = new three.Group();
    spin.name = "spin";
    spin.add(new three.Mesh(geo, mat));
    spin.add(new three.Mesh(rimGeo, rimMat));
    root.add(spin);
    return root;
  }

  function buildGhost(bin) {
    const geo = new three.BoxGeometry(1.78, 1.1, 4.2);
    geo.translate(0, 0.75, 0);
    bin.track(geo);
    const mat = new three.ShaderMaterial({
      uniforms: {
        uColour: { value: new three.Color(0.35, 0.75, 1.0) },
        uOpacity: { value: 0.34 },
      },
      vertexShader: GHOST_VERT,
      fragmentShader: GHOST_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: three.DoubleSide,
    });
    bin.trackMaterial(mat);
    const mesh = new three.Mesh(geo, mat);
    mesh.renderOrder = 5;
    mesh.name = "opus.ghost";
    mesh.visible = false;
    return mesh;
  }

  // ---- TV camera anchors

  const tvAnchors = [];
  function buildTvAnchors(stage) {
    tvAnchors.length = 0;
    const r = rng.fork("tv");
    const step = Math.max(1, Math.round(stage.length / 14 / stage.step));
    for (let i = step; i < stage.count - 4; i += step) {
      const tx = stage.tx[i];
      const tz = stage.tz[i];
      const inv = 1 / (Math.hypot(tx, tz) || 1);
      const rxv = tz * inv;
      const rzv = -tx * inv;
      const side = r.chance(0.5) ? 1 : -1;
      const off = (stage.halfWidth[i] + r.range(7, 20)) * side;
      const lift = r.range(2.2, 8.5);
      tvAnchors.push({
        s: i * stage.step,
        x: stage.x[i] + rxv * off,
        y: stage.y[i] + lift,
        z: stage.z[i] + rzv * off,
      });
    }
  }

  // ---- build / clear

  // weather.js builds its rig into *this* scene and game.js builds a fresh one
  // per stage, so whoever ends a stage has to hand the old one back or the
  // scene accumulates a key light, a moon, a hemisphere, a bounce, an ambient
  // and a sky dome every race — measured at 10, 15, 20, 25 lights over four
  // stages, each one relighting the whole image and forcing three to recompile
  // every material as the light count changes. The rig is not ours to dispose;
  // detaching it is, and it is the only hook there is.
  function releaseWeather() {
    const w = state.weather;
    state.weather = null;
    if (!w) return;
    if (w.root && w.root.parent === scene) scene.remove(w.root);
    if (w.fog && scene.fog === w.fog) scene.fog = null;
  }

  function clearStage() {
    if (!state.built) {
      // Still safe to call: everything below is idempotent.
      releaseWeather();
      stageBin.disposeAll();
      return;
    }
    while (stageGroup.children.length) stageGroup.remove(stageGroup.children[0]);
    // The new stage's materials come back bare, so the cached level has to go
    // with the old ones or the gate above suppresses the first write.
    state.groundSnow = 0;
    if (state.ghostMesh) { scene.remove(state.ghostMesh); state.ghostMesh = null; }
    if (state.carMesh) { scene.remove(state.carMesh); state.carMesh = null; }
    for (let i = 0; i < state.wheelMeshes.length; i += 1) scene.remove(state.wheelMeshes[i].outer);
    state.wheelMeshes.length = 0;
    state.brakeMaterial = null;
    state.lampMaterial = null;
    scenery.entries.length = 0;
    anisoTextures.length = 0;
    state.drawsIssued = 0;
    // Four spotlights and a pair of additive beam cones parked where the car was
    // would otherwise light the menu backdrop for the rest of the session:
    // idleFrame() never calls updateHeadlights().
    headlights.level = 0;
    headlights.on = false;
    if (headlights.left) headlights.left.intensity = 0;
    if (headlights.right) headlights.right.intensity = 0;
    if (headlights.pod) headlights.pod.intensity = 0;
    if (headlights.spill) headlights.spill.intensity = 0;
    if (headlights.beams) headlights.beams.visible = false;
    // Same reason as the headlights above: a cabin fill left burning where the
    // car was would light whatever the menu backdrop puts in that metre.
    if (cabin.fill) cabin.fill.intensity = 0;
    if (cabin.glow) cabin.glow.intensity = 0;
    state.instruments = null;
    // Same reason: a pool of darkening parked on the menu backdrop.
    contactMesh.visible = false;
    tvAnchors.length = 0;
    stageBin.disposeAll();
    resetParticlePool(dustPool);
    resetParticlePool(debrisPool);
    for (let i = 0; i < MARK_CAP; i += 1) {
      markLife[i] = 0;
      markAlpha[i] = 0;
      markBase[i] = 0;
      markMesh.setMatrixAt(i, markZero);
    }
    markMesh.instanceMatrix.needsUpdate = true;
    markMesh.geometry.attributes.aAlpha.needsUpdate = true;
    markCursor = 0;
    if (shadowLight) { shadowLight.castShadow = false; shadowLight = null; }
    releaseWeather();
    state.stage = null;
    state.world = null;
    state.ground = null;
    state.car = null;
    state.built = false;
    for (const key in rigs) rigs[key].ready = false;
    fallbackKey.visible = true;
    fallbackFill.visible = true;
  }

  function buildStage(stage, ctx = {}) {
    if (state.built) clearStage();
    stageBin = createResourceBin("stage");
    state.stage = stage;
    state.world = stage.world || (ctx.world || null);
    state.weather = ctx.weather || null;
    state.car = ctx.car || null;
    state.lastS = 0;
    applyWeatherOnce();

    const world = state.world;
    state.ground = world && typeof world.heightAt === "function"
      ? (x, z) => world.heightAt(x, z)
      : null;

    let road = null;
    if (meshLib && typeof meshLib.buildRoadMesh === "function") {
      road = adopt(safeCall(() => meshLib.buildRoadMesh(three, stage, {
        wetness: state.wetness, quality: state.quality.name,
      })), stageBin);
    }
    if (!road) road = buildFallbackRoad(stage, stageBin);
    road.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    collectAnisotropy(road);
    stageGroup.add(road);

    let terrain = null;
    if (meshLib && typeof meshLib.buildTerrainMesh === "function") {
      terrain = adopt(safeCall(() => meshLib.buildTerrainMesh(three, stage, {
        quality: state.quality.name,
      })), stageBin);
    }
    if (!terrain) terrain = buildFallbackTerrain(stage, stageBin);
    terrain.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    collectAnisotropy(terrain);
    stageGroup.add(terrain);

    const sceneryRoot = buildScenery(stage, stageBin);
    collectAnisotropy(sceneryRoot);
    stageGroup.add(sceneryRoot);

    if (meshLib && typeof meshLib.buildPropLibrary === "function") {
      const lib = safeCall(() => meshLib.buildPropLibrary(three, { stage }));
      // The prop library is a *library*: prototypes plus a build() that places a
      // list. Both halves need disposing, and the placement has to go in the bin
      // first so it is torn down before the prototypes it points at.
      let props = null;
      if (lib && typeof lib.build === "function") {
        props = adopt(safeCall(() => lib.build(stage.props || [], { stage })), stageBin);
        if (typeof lib.dispose === "function") stageBin.track(lib);
      } else {
        props = adopt(lib, stageBin);
      }
      if (props) {
        props.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        collectAnisotropy(props);
        stageGroup.add(props);
      }
    }

    const spec = state.car ? state.car.spec : (ctx.spec || null);
    fitLampRig(spec);
    fitContactRig(spec);
    fitCabinRig(spec);
    state.carMesh = buildCar(spec, ctx.livery, stageBin);
    scene.add(state.carMesh);
    state.wheelMeshes = buildWheels(spec, stageBin);
    for (let i = 0; i < 4; i += 1) scene.add(state.wheelMeshes[i].outer);

    state.ghostMesh = buildGhost(stageBin);
    scene.add(state.ghostMesh);

    buildTvAnchors(stage);

    // The weather's key light gets the shadow rig; when there is no weather the
    // fallback key carries it, so a stage always has one shadow caster and never
    // two fighting over the same map.
    if (state.weather && state.weather.lights && state.weather.lights.key) {
      shadowLight = state.weather.lights.key;
      fallbackKey.visible = false;
      fallbackFill.visible = false;
    } else {
      shadowLight = fallbackKey;
      fallbackKey.visible = true;
      fallbackFill.visible = true;
    }
    // weather.js re-evaluates this every frame from its own criteria, so tell it
    // the budget rather than fighting it: it ANDs its own wish with this gate.
    if (state.weather) state.weather.shadowGate = state.quality.shadows;
    shadowLight.castShadow = state.quality.shadows
      && shadowLight.userData.weatherWantsShadow !== false;
    shadowLight.shadow.mapSize.set(state.quality.shadowMapSize, state.quality.shadowMapSize);
    shadowLight.shadow.bias = -0.0004;
    shadowLight.shadow.normalBias = 0.045;

    state.built = true;
    // Snap every rig to the start line so the first frame is not a fly-in.
    if (state.car) {
      sampleCar(_sample, state.car, ctx.surface || null);
      for (const key in rigs) resetCameraRig(rigs[key], _sample, framedParams(key), state.ground);
    }
    return api;
  }

  function applyWeatherOnce() {
    const w = state.weather;
    if (!w) { state.wetness = 0; state.exposure = 1; return; }
    const cur = w.current || {};
    state.wetness = (w.wet && w.wet.film) || cur.roadWetness || 0;
    state.exposure = cur.exposure || 1;
  }

  // ---- per-frame

  const wheelSpin = [0, 0, 0, 0];
  const spawnCarry = [0, 0, 0, 0];

  function spawnWheelParticles(car, surface, dt) {
    const q = state.quality;
    const props = surface && surface.props ? surface.props : null;
    if (!props) return;
    const throttle = car.input ? car.input.throttle : 0;
    const budget = q.particleBudget;
    for (let i = 0; i < 4; i += 1) {
      const w = car.wheels[i];
      if (!w) continue;
      const rate = dustSpawnRate(props, w, car.speed, state.wetness, q.particleRateScale);
      if (rate <= 0) { spawnCarry[i] = 0; continue; }
      spawnCarry[i] += rate * dt;
      let n = spawnCarry[i] | 0;
      if (n <= 0) continue;
      spawnCarry[i] -= n;
      // Spend the headroom the budget leaves, not a fixed count per frame. The
      // old `min(n, 2)` brake was per *frame*, so the size of the plume rode on
      // the frame rate: the same car on the same gravel threw a third as much at
      // 20 fps as at 60, and under the software rasteriser the screenshots were
      // taking pictures of the brake rather than of the dust.
      const room = budget - dustPool.alive;
      if (room <= 0) continue;
      if (n > room) n = room;
      if (n > 64) n = 64;
      const rooster = roosterStrength(w, throttle);
      const wake = wakeLift(car.speed);
      const wet = state.wetness;
      const snow = props.id === SURFACE.SNOW;
      const water = props.id === SURFACE.WATER || wet > 0.7;
      const cx = w.contactPoint ? w.contactPoint.x : w.worldPos.x;
      const cy = (w.contactPoint ? w.contactPoint.y : w.worldPos.y) + 0.06;
      const cz = w.contactPoint ? w.contactPoint.z : w.worldPos.z;
      // A frame's worth of spawns is laid along the track the wheel actually
      // covered, not all at the contact patch. At 100 km/h that track is half a
      // metre at 60 fps and eleven metres at five, so dropping the whole frame's
      // dust on one point turns a plume into a row of clumps the moment the
      // frame rate dips — and it is exactly at speed that both things happen.
      const runX = car.vel.x * dt;
      const runZ = car.vel.z * dt;
      for (let k = 0; k < n; k += 1) {
        const u = k / n;
        const jx = (rng.next() - 0.5) * 0.5;
        const jz = (rng.next() - 0.5) * 0.5;
        const px = cx - runX * u;
        const py = cy;
        const pz = cz - runZ * u;
        // Backwards along the car's travel, up, and out. `back` is the fraction
        // of the car's own velocity the material leaves with — it used to
        // multiply an already-scaled velocity *and* the sideways jitter, so the
        // whole spawn came out at a fortieth of what it reads as: a puff dropped
        // in the road rather than a plume thrown out of it.
        const back = 0.16 + 0.34 * rooster + 0.22 * wake;
        const spit = (0.9 + 1.6 * rooster) * (1 + wake);
        const vx = -car.vel.x * back + (rng.next() - 0.5) * spit;
        const vz = -car.vel.z * back + (rng.next() - 0.5) * spit;
        const vy = 0.6 + rng.next() * (1.4 + 5.0 * rooster) + wake * (2.2 + rng.next() * 3.0);
        // Life is spent, not free: whichever of the rate and the budget binds
        // first, a long life spreads the same particles thinly over eighty
        // metres of road while a shorter one packs them into the twenty behind
        // the car — the only part of the plume a chase camera ever sees. Birth
        // size matters more than final size for the same reason: at 100 km/h a
        // puff is between the car and the camera for about a quarter of a
        // second, so one that takes two seconds to grow has gone past first.
        const life = water ? 0.8 + rng.next() * 0.7
          : snow ? 2.2 + rng.next() * 1.8
            : 1.4 + rng.next() * 1.3 + rooster * 0.8;
        const s0 = water ? 0.28 : 0.42 + rng.next() * 0.34;
        const s1 = s0 * (water ? 2.8 : snow ? 4.4 : 4.6);
        const c = props.dustColour;
        // Dust is a LIT SURFACE, not a light. The numbers in surfaces.js are
        // albedos, and this wrote them into the frame as though they were
        // radiance and then multiplied by up to 1.5 on top — so a gravel plume
        // left the shader at 0.95 linear, went through exposure and ACES, and
        // landed at (222,216,207) against a road at about 130. That is the white
        // blob a player sees, and being untethered from the light it was exactly
        // as bright at midnight and in fog.
        //
        // dustLit is what is actually falling on it, so the plume is bright in
        // sun, dull under cloud, and keeps the surface's own hue either way. The
        // small random spread stays: a plume of identical particles reads as a
        // decal rather than as airborne material.
        const tint = state.dustLit * (0.88 + rng.next() * 0.24);
        spawnParticle(dustPool,
          px + jx, py, pz + jz,
          vx, vy, vz,
          life, s0, s1,
          c[0] * tint, c[1] * tint, c[2] * tint,
          water ? PARTICLE_KIND.SPRAY : snow ? PARTICLE_KIND.SNOW : PARTICLE_KIND.DUST,
          water ? 3.2 : 1.5, water ? 0.55 : 0.10, 0);
      }
      // Stones and clods: rare, heavy, and they arc. One in ten spawns is enough
      // to read as "this surface is loose".
      if (props.looseDepth > 0.25 && rng.chance(0.12 * saturate(rate / 60))) {
        const px = w.contactPoint ? w.contactPoint.x : w.worldPos.x;
        const py = (w.contactPoint ? w.contactPoint.y : w.worldPos.y) + 0.1;
        const pz = w.contactPoint ? w.contactPoint.z : w.worldPos.z;
        const c = props.albedo;
        spawnParticle(debrisPool, px, py, pz,
          -car.vel.x * 0.35 + (rng.next() - 0.5) * 5,
          2.5 + rng.next() * 5.5,
          -car.vel.z * 0.35 + (rng.next() - 0.5) * 5,
          0.9 + rng.next() * 0.8, 0.07, 0.05,
          c[0] * 1.6, c[1] * 1.6, c[2] * 1.6,
          props.looseDepth > 0.6 ? PARTICLE_KIND.CLOD : PARTICLE_KIND.STONE,
          0.25, 1, 0);
      }
    }
  }

  function stampMark(x, y, z, headingX, headingZ, width, alpha, life) {
    const i = markCursor;
    markCursor = (markCursor + 1) % state.quality.trailCount;
    const ang = Math.atan2(headingX, headingZ);
    eTmp.set(0, ang, 0);
    qTmp.setFromEuler(eTmp);
    vTmp.set(x, y + 0.02, z);
    vTmp2.set(width, 1, 0.55);
    mTmp.compose(vTmp, qTmp, vTmp2);
    markMesh.setMatrixAt(i, mTmp);
    markMesh.instanceMatrix.needsUpdate = true;
    markAlpha[i] = alpha;
    markBase[i] = alpha;
    markAge[i] = 0;
    markLife[i] = life;
  }

  const markStride = [0, 0, 0, 0];
  function updateMarks(car, surface, dt) {
    const props = surface && surface.props ? surface.props : null;
    for (let i = 0; i < 4; i += 1) {
      const w = car.wheels[i];
      if (!w || !w.contact) continue;
      const skid = saturate(Math.abs(w.slipRatio) * 0.8 + Math.abs(w.slipAngle) * 1.4);
      const rut = props ? saturate(props.looseDepth * 0.7 + skid * 0.5) : skid;
      if (rut < 0.08 || car.speed < 1.5) continue;
      markStride[i] += car.speed * dt;
      if (markStride[i] < 0.32) continue;
      markStride[i] = 0;
      const alpha = saturate(rut) * (props && props.looseDepth > 0.3 ? 0.35 : 0.7);
      stampMark(w.contactPoint.x, w.contactPoint.y, w.contactPoint.z,
        car.vel.x, car.vel.z, 0.26, alpha, 26 + rut * 30);
    }
  }

  // Marks persist for most of their life and then fade over the last quarter of
  // it, so a stage keeps its racing line rather than dissolving behind the car.
  function ageMarks(dt) {
    const attr = markMesh.geometry.attributes.aAlpha;
    let dirty = false;
    for (let i = 0; i < MARK_CAP; i += 1) {
      const life = markLife[i];
      if (life <= 0) continue;
      const age = markAge[i] + dt;
      markAge[i] = age;
      if (age >= life) {
        markLife[i] = 0;
        markAlpha[i] = 0;
        markBase[i] = 0;
        markMesh.setMatrixAt(i, markZero);
        markMesh.instanceMatrix.needsUpdate = true;
        dirty = true;
        continue;
      }
      markAlpha[i] = markBase[i] * saturate((life - age) / (life * 0.25));
      dirty = true;
    }
    if (dirty) attr.needsUpdate = true;
  }

  function updateHeadlights(car, dt) {
    const w = state.weather;
    const wantAuto = w && w.metrics ? w.metrics.headlights : false;
    const on = state.headlightsForced === null ? wantAuto : state.headlightsForced;
    headlights.on = on;
    headlights.level = damp(headlights.level, on ? 1 : 0, 8, dt);
    const level = headlights.level;
    const q = state.quality;
    if (!state.carMesh) return;
    const cy = Math.cos(car.yaw);
    const sy = Math.sin(car.yaw);
    const fx = sy;
    const fz = cy;
    const rx = cy;
    const rz = -sy;
    const bx = car.pos.x;
    const by = car.pos.y;
    const bz = car.pos.z;
    const pitch = car.pitch;

    // The road plane under the car. Lamp heights and beam aims are both measured
    // from it: aiming from the centre of mass put the pool a car's ride height
    // out of place and the beam in the air above the road.
    const roadY = by - headlights.com;
    const sp = Math.sin(pitch);

    // `toe` splays the pair outwards so the pair lights the verges as well as the
    // crown; `reach` is where the axis meets the road, which is what decides
    // where the hot spot lands.
    function aim(light, ox, oz, reach, toe) {
      const px = bx + rx * ox + fx * oz;
      const py = roadY + headlights.y;
      const pz = bz + rz * ox + fz * oz;
      light.position.set(px, py, pz);
      light.target.position.set(
        px + fx * reach + rx * toe,
        py - headlights.y + sp * reach,
        pz + fz * reach + rz * toe,
      );
      light.target.updateMatrixWorld();
    }

    const h = HEADLIGHT;
    aim(headlights.left, -headlights.x, headlights.z, h.mainReach, -h.mainToe);
    aim(headlights.right, headlights.x, headlights.z, h.mainReach, h.mainToe);
    aim(headlights.pod, 0, headlights.z, h.podReach, 0);
    aim(headlights.spill, 0, headlights.z, h.spillReach, 0);
    const gain = level * (q.name === "low" ? 0.7 : 1);
    headlights.left.intensity = h.mainIntensity * gain;
    headlights.right.intensity = h.mainIntensity * gain;
    headlights.pod.intensity = h.podIntensity * gain;
    headlights.spill.intensity = h.spillIntensity * gain;

    if (headlights.beams) {
      // A beam is only visible where there is something in the air to scatter
      // off it. In clear night air there is nothing, and drawing it anyway is
      // what turned the headlights into a balloon hanging over the bonnet.
      const fogK = w && w.current
        ? saturate(w.current.fogDensity * 60 + wetFilm(w) * 0.15 + w.current.precipRate / 60)
        : 0.15;
      const show = q.beams && level > 0.02 && fogK > BEAM_FOG_FLOOR;
      headlights.beams.visible = show;
      if (show) {
        headlights.beams.position.set(
          bx + fx * headlights.z, roadY + headlights.y, bz + fz * headlights.z,
        );
        // Dip the cone onto the same line the lamps are aimed along, so it lies
        // down the road instead of floating level over it.
        eTmp.set(Math.atan2(headlights.y, h.mainReach) - pitch, car.yaw, 0, "YXZ");
        headlights.beams.quaternion.setFromEuler(eTmp);
        const beamMat = headlights.beams.children[0].material;
        if (beamMat && beamMat.uniforms) {
          // The coefficient is small because the cone is drawn four times over:
          // each shell is DoubleSide so a ray crosses both its walls, and there
          // are two cones. It is chosen against the air, not the road. Swept on
          // one stopped night-rain frame with the throat profile above, the air
          // three metres over the road ran 83, 88 and 92 at 0.26, 0.30 and 0.34
          // against 70 for the air beside the beam, with the road under it
          // peaking at 188, 192 and 196. Below about 0.2 there is barely a
          // beam: 0.12 puts the lit air at 68 against 70 for air elsewhere in
          // the frame — two places, not one place lit and unlit, because an
          // additive shell cannot subtract light. Over the SAME air it models
          // 42 levels at two thirds down the cone against 82 here, where
          // tests/render.test.mjs asks a night beam for 55.
          // Past about 0.34 the cone's own
          // wall starts to draw as a straight edge across the road pool —
          // plainly visible at 0.45 — because a shell only stands in for a
          // volume while it is faint. 0.30 puts the shaft a fifth above the air
          // beside it with the road short of 200 and its grain still in it.
          beamMat.uniforms.uStrength.value = level * 0.30 * (fogK - BEAM_FOG_FLOOR);
        }
      }
    }

    // Brake lights and the marker lamps on the pod bar: cheap emissive, but they
    // are what makes the car read at night from behind.
    const brakeMat = state.brakeMaterial;
    if (brakeMat && brakeMat.emissive) {
      const b = car.input ? car.input.brake : 0;
      const hb = car.input ? car.input.handbrake : 0;
      const k = saturate(Math.max(b, hb * 0.9)) * 0.9 + level * 0.12;
      brakeMat.emissive.setRGB(k * 1.4, k * 0.09, k * 0.05);
    }
    const lampMat = state.lampMaterial;
    if (lampMat && lampMat.emissive) {
      lampMat.emissive.setRGB(level * 1.6, level * 1.45, level * 1.15);
    }
  }

  // Called every frame, so nothing here may allocate.
  function updateCabinLights(car) {
    const fill = cabin.fill;
    const glow = cabin.glow;
    if (!fill || !glow) return;
    if (!state.carMesh) { fill.intensity = 0; glow.intensity = 0; return; }
    qTmp.set(car.quat.x, car.quat.y, car.quat.z, car.quat.w);
    vTmp.set(0, cabin.fillY, cabin.fillZ).applyQuaternion(qTmp);
    fill.position.set(car.pos.x + vTmp.x, car.pos.y + vTmp.y, car.pos.z + vTmp.z);
    vTmp.set(0, cabin.glowY, cabin.glowZ).applyQuaternion(qTmp);
    glow.position.set(car.pos.x + vTmp.x, car.pos.y + vTmp.y, car.pos.z + vTmp.z);

    // The same two quantities syncWeather lights the dust by — what the sky is
    // giving and what the beam is giving — so the cabin follows the weather
    // rather than carrying a curve of its own.
    const w = state.weather;
    const cur = w ? w.current : null;
    const sky = cur ? (cur.hemiIntensity || 0) + (cur.ambientIntensity || 0) : 0.9;
    const key = w && w.metrics
      ? (w.metrics.keyIntensity || 0) * Math.max(state.sunY, 0) : 0;
    fill.intensity = CABIN.fillSky * sky + CABIN.fillKey * key;
    // Tinted by the same sky stop weather.js gives its hemisphere light, because
    // it is standing in for the same sky.
    if (cur && cur.hemiSky) fill.color.setRGB(cur.hemiSky[0], cur.hemiSky[1], cur.hemiSky[2]);
    glow.intensity = CABIN.glowIntensity * headlights.level;
  }

  // ---- live instruments
  //
  // meshes.js bakes the three needles at a fixed sweep and the six shift lights at
  // one colour, and it is the only module that can move them: they are triangles
  // inside the single merged interior geometry, which publishes no vertex ranges.
  // So this drives a handle IF the car group carries one — hung off userData the
  // way `brakeMaterial` and `lampMaterial` already are — and does nothing at all
  // if it does not:
  //
  //   group.userData.instruments = {
  //     setNeedles(tacho, speedo, boost),  // each 0..1 along its own dial sweep
  //     setShiftLights(t),                 // 0..1 of the bar; 1 is every light lit
  //   }
  //
  // Both are called once a frame with plain numbers, and neither may allocate.
  function updateInstruments(car) {
    const inst = state.instruments;
    if (!inst) return;
    const eng = car.spec && car.spec.engine;
    // physics.js spells this `limiterRpm`. game.js's HUD frame reads `limitRpm`,
    // which is on no spec in the book, so every car's HUD dial falls back to a
    // flat 8000 — not this module's to fix, and not this module's to copy either.
    const limit = eng && eng.limiterRpm > 0 ? eng.limiterRpm : 8000;
    const frac = saturate(car.engineRpm / limit);
    if (typeof inst.setNeedles === "function") {
      // The tachometer keeps hud.js's 6% of headroom past the limiter, so the
      // needle has somewhere to go when the limiter is cutting.
      inst.setNeedles(saturate(car.engineRpm / (limit * 1.06)),
        saturate(car.speed / CABIN.speedoFullScale), saturate(car.turboSpool));
    }
    if (typeof inst.setShiftLights === "function") {
      inst.setShiftLights(saturate((frac - SHIFT_BEGIN) / (SHIFT_FULL - SHIFT_BEGIN)));
    }
  }

  function updateCarMesh(car, alpha) {
    const mesh = state.carMesh;
    if (!mesh) return;
    // A touch of extrapolation across the physics/render rate gap. It is bounded
    // by one physics step, so it can never run ahead of a collision.
    const ex = car.vel.x * alpha * PHYSICS_DT;
    const ey = car.vel.y * alpha * PHYSICS_DT;
    const ez = car.vel.z * alpha * PHYSICS_DT;
    mesh.position.set(car.pos.x + ex, car.pos.y + ey, car.pos.z + ez);
    qTmp.set(car.quat.x, car.quat.y, car.quat.z, car.quat.w);
    mesh.quaternion.copy(qTmp);
    for (let i = 0; i < 4; i += 1) {
      const wm = state.wheelMeshes[i];
      const w = car.wheels[i];
      if (!wm || !w) continue;
      wheelSpin[i] = wrapAngle(wheelSpin[i] + w.spinRate * (1 / 60));
      // The outer group is the hub in the chassis frame; steer and spin are
      // rotations inside it, so a steered wheel still spins about its own axle.
      wm.outer.position.set(w.worldPos.x + ex, w.worldPos.y + ey, w.worldPos.z + ez);
      wm.outer.quaternion.copy(qTmp);
      // physics.js measures a positive steer angle to the LEFT, and a positive
      // rotation about +Y turns the nose towards +X, which is right.
      const steer = -w.steerAngle;
      if (updateWheelFn) {
        updateWheelFn(wm.inner, steer, wheelSpin[i], 0);
      } else {
        wm.inner.rotation.set(0, steer, 0);
        if (wm.spin) wm.spin.rotation.x = wheelSpin[i];
      }
      wm.outer.visible = w.detached !== true;
    }
  }

  // The one thing that makes the car read as standing on the ground rather than
  // hovering over it, at every sun angle and at every quality level.
  function updateContactShadow(car) {
    const ground = state.ground;
    if (!ground || !state.carMesh) { contactMesh.visible = false; return; }
    const gy = ground(car.pos.x, car.pos.z);
    if (!Number.isFinite(gy)) { contactMesh.visible = false; return; }
    contactShadowFit(contactFit, car.pos.y - gy, contactSize.nominal, car.airTime || 0);
    contactMesh.visible = contactFit.visible;
    if (!contactFit.visible) return;
    contactMat.uniforms.uAlpha.value = contactFit.alpha;
    contactMesh.scale.set(
      contactSize.width * contactFit.spread, 1, contactSize.length * contactFit.spread,
    );
    // Lie along the ground, not along the chassis: the pool must not pitch when
    // the car dives under braking.
    const world = state.world;
    if (world && typeof world.normalAt === "function") {
      world.normalAt(car.pos.x, car.pos.z, contactNormal);
      vNormal.set(contactNormal.x, contactNormal.y, contactNormal.z);
      if (vNormal.lengthSq() > 1e-6) vNormal.normalize(); else vNormal.set(0, 1, 0);
    } else {
      vNormal.set(0, 1, 0);
    }
    qTilt.setFromUnitVectors(vUp, vNormal);
    qYaw.setFromAxisAngle(vUp, car.yaw);
    contactMesh.quaternion.copy(qTilt).multiply(qYaw);
    contactMesh.position.set(
      car.pos.x + vNormal.x * CONTACT_SHADOW.lift,
      gy + vNormal.y * CONTACT_SHADOW.lift,
      car.pos.z + vNormal.z * CONTACT_SHADOW.lift,
    );
  }

  function updateShadow(car) {
    if (!shadowLight || !state.quality.shadows || !state.stage) return;
    const stage = state.stage;
    const q = state.quality;
    const aheadSamples = Math.max(4, Math.round(q.shadowDistance / stage.step));
    const behind = Math.max(2, Math.round(12 / stage.step));
    const idx = clamp(Math.round(state.lastS / stage.step), 0, stage.count - 1);
    const stride = Math.max(1, Math.round((aheadSamples + behind) / 100));
    // Padded well beyond the road, because the shadow map only renders what is
    // inside this box and the things that shade a rally road stand beside it, not
    // on it. Fitted to the carriageway plus 2.5 m, a treeline twenty metres off
    // the verge was never drawn into the map at all — so at a low sun, where a
    // 30 m conifer throws a shadow over a hundred metres, the road stayed bare
    // and the "golden hour, long shadows" preset produced neither.
    let n = roadSpanPoints(shadowPoints, stage, idx, aheadSamples, behind, stride,
      SHADOW_SIDE_PAD);
    // The car itself, so a stopped car off the road still casts.
    if ((n + 2) * 3 <= shadowPoints.length) {
      let o = n * 3;
      shadowPoints[o] = car.pos.x - 2.5;
      shadowPoints[o + 1] = car.pos.y;
      shadowPoints[o + 2] = car.pos.z - 2.5;
      n += 1;
      o = n * 3;
      shadowPoints[o] = car.pos.x + 2.5;
      shadowPoints[o + 1] = car.pos.y + 2.0;
      shadowPoints[o + 2] = car.pos.z + 2.5;
      n += 1;
    }
    fitShadowFrustum(shadowFit, shadowPoints, n,
      state.sunX, state.sunY, state.sunZ, q.shadowMapSize, 3.5);
    if (!shadowFit.ok) return;
    const cam = shadowLight.shadow.camera;
    cam.left = shadowFit.left;
    cam.right = shadowFit.right;
    cam.top = shadowFit.top;
    cam.bottom = shadowFit.bottom;
    cam.near = shadowFit.near;
    cam.far = shadowFit.far;
    shadowLight.position.set(shadowFit.lightX, shadowFit.lightY, shadowFit.lightZ);
    shadowLight.target.position.set(
      shadowFit.lightX + shadowFit.fx * 10,
      shadowFit.lightY + shadowFit.fy * 10,
      shadowFit.lightZ + shadowFit.fz * 10,
    );
    shadowLight.target.updateMatrixWorld();
    cam.updateProjectionMatrix();
  }

  // Writes one instance into its LOD mesh, scaled by the fade. The source matrix
  // is affine, so fading is nine multiplies on the basis columns — cheaper and
  // exact next to decomposing and recomposing it.
  function placeInstance(entry, ii, lod, fade) {
    const slot = entry.lods[lod];
    const at = entry.counts[lod];
    if (at >= slot.cap) return false;
    const dst = slot.mesh.instanceMatrix.array;
    const s = entry.src;
    const so = ii * 16;
    const dof = at * 16;
    for (let k = 0; k < 16; k += 1) dst[dof + k] = s[so + k];
    if (fade < 1) {
      dst[dof] *= fade; dst[dof + 1] *= fade; dst[dof + 2] *= fade;
      dst[dof + 4] *= fade; dst[dof + 5] *= fade; dst[dof + 6] *= fade;
      dst[dof + 8] *= fade; dst[dof + 9] *= fade; dst[dof + 10] *= fade;
    }
    if (entry.srcCol && slot.mesh.instanceColor) {
      const cd = slot.mesh.instanceColor.array;
      cd[at * 3] = entry.srcCol[ii * 3];
      cd[at * 3 + 1] = entry.srcCol[ii * 3 + 1];
      cd[at * 3 + 2] = entry.srcCol[ii * 3 + 2];
    }
    entry.counts[lod] = at + 1;
    return true;
  }

  function sceneryCell(k, camX, camZ, dist, budget, issued) {
    const q = state.quality;
    let n = issued;
    for (let e = 0; e < scenery.entries.length && n < budget; e += 1) {
      const entry = scenery.entries[e];
      const cell = entry.cells && entry.cells[k];
      if (!cell) continue;
      const lodMax = entry.lods.length - 1;
      for (let c = 0; c < cell.length && n < budget; c += 1) {
        const ii = cell[c];
        const dx = entry.px[ii] - camX;
        const dz = entry.pz[ii] - camZ;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > dist) continue;
        const lod = Math.min(lodMax, selectLod(d, entry.lodState[ii], q.lodBands, 14));
        entry.lodState[ii] = lod;
        const fade = lod === lodMax ? lodFade(d, dist, 55) : 1;
        if (fade <= 0.01) continue;
        if (placeInstance(entry, ii, lod, fade)) n += 1;
      }
    }
    return n;
  }

  // Every scenery InstancedMesh has frustumCulled off — one sphere over a whole
  // kind is all-or-nothing, and on a 9 km stage it always intersects. So the
  // frustum test happens here instead, per grid cell, before a single instance
  // is written: a cell the camera cannot see costs nothing and frees its share
  // of the budget for one that is on screen. The box is padded because a tree
  // just off the edge of the picture still throws a shadow onto road that is on
  // it.
  function cellInView(i, j, k) {
    const lo = scenery.cellLoY ? scenery.cellLoY[k] : Infinity;
    if (!(lo < Infinity)) return false;
    const cs = scenery.cellSize;
    const x0 = scenery.minX + i * cs;
    const z0 = scenery.minZ + j * cs;
    cellBox.min.set(x0 - SCENERY_CULL_PAD, lo - 2, z0 - SCENERY_CULL_PAD);
    cellBox.max.set(x0 + cs + SCENERY_CULL_PAD, scenery.cellHiY[k] + 2,
      z0 + cs + SCENERY_CULL_PAD);
    return viewFrustum.intersectsBox(cellBox);
  }

  // Cells are visited in square rings outward from the camera, so the budget
  // always buys the nearest scenery. Walking the grid from its minimum corner —
  // which is what a plain nested loop does — spends it on whatever happens to
  // lie north-west of the car and drops the trees directly ahead.
  function updateScenery(camX, camZ) {
    if (!scenery.entries.length) { state.drawsIssued = 0; return; }
    const q = state.quality;
    const dist = q.sceneryDistance;
    const cs = scenery.cellSize;
    const budget = q.sceneryBudget;
    // The renderer refreshes these itself at draw time, which is after this runs.
    camera.updateMatrixWorld();
    viewClip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    viewFrustum.setFromProjectionMatrix(viewClip);
    for (let e = 0; e < scenery.entries.length; e += 1) scenery.entries[e].counts.fill(0);
    const ci = Math.floor((camX - scenery.minX) / cs);
    const cj = Math.floor((camZ - scenery.minZ) / cs);
    const rings = Math.ceil(dist / cs);
    let issued = 0;
    for (let r = 0; r <= rings && issued < budget; r += 1) {
      const i0 = ci - r;
      const i1 = ci + r;
      const j0 = cj - r;
      const j1 = cj + r;
      for (let j = j0; j <= j1 && issued < budget; j += 1) {
        if (j < 0 || j >= scenery.nz) continue;
        const edge = j === j0 || j === j1;
        const stride = edge ? 1 : Math.max(1, i1 - i0);
        for (let i = i0; i <= i1 && issued < budget; i += stride) {
          if (i < 0 || i >= scenery.nx) continue;
          const k = j * scenery.nx + i;
          if (!cellInView(i, j, k)) continue;
          issued = sceneryCell(k, camX, camZ, dist, budget, issued);
        }
      }
    }
    for (let e = 0; e < scenery.entries.length; e += 1) {
      const entry = scenery.entries[e];
      for (let l = 0; l < entry.lods.length; l += 1) {
        const slot = entry.lods[l];
        const n = entry.counts[l];
        slot.mesh.count = n;
        if (n > 0) {
          const attr = slot.mesh.instanceMatrix;
          // Only the slots we wrote go up the bus, not the whole stage's worth.
          if (attr.updateRange) { attr.updateRange.offset = 0; attr.updateRange.count = n * 16; }
          attr.needsUpdate = true;
          if (entry.srcCol && slot.mesh.instanceColor) {
            slot.mesh.instanceColor.needsUpdate = true;
          }
        }
      }
    }
    state.drawsIssued = issued;
  }

  function pickTvAnchor(car) {
    if (!tvAnchors.length) return;
    const rig = rigs.tv;
    const s = state.lastS;
    // Always a camera the car is driving towards, cut when it is passed.
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < tvAnchors.length; i += 1) {
      const d = tvAnchors[i].s - s;
      if (d > 25 && d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) best = tvAnchors.length - 1;
    if (best !== state.tvIndex) {
      state.tvIndex = best;
      rig.ready = false;
    }
    const a = tvAnchors[best];
    rig.anchorX = a.x;
    rig.anchorY = a.y;
    rig.anchorZ = a.z;
    rig.hasAnchor = true;
  }

  function syncWeather(dt) {
    const w = state.weather;
    if (!w) return;
    if (w._sunDir) {
      state.sunX = w._sunDir.x;
      state.sunY = w._sunDir.y;
      state.sunZ = w._sunDir.z;
    }
    const cur = w.current;
    if (!cur) return;
    state.wetness = (w.wet && w.wet.film) || cur.roadWetness || 0;
    state.exposure = damp(state.exposure, cur.exposure || 1, 1.5, dt);

    // What a dust particle is lit by, as a plain Lambert sum: the beam it
    // actually receives plus the sky and the flat ambient, divided by pi the way
    // three does for every other surface in the scene. The forward-scatter boost
    // is the one liberty — airborne dust really is brighter than the ground it
    // came off, because it scatters the sun towards a camera behind it — but it
    // multiplies a lit quantity now, not a number standing in for one.
    const keyLit = (w.metrics ? w.metrics.keyIntensity : 0) * Math.max(state.sunY, 0);
    const skyLit = (cur.hemiIntensity || 0) + (cur.ambientIntensity || 0);
    state.dustLit = clamp((keyLit + skyLit) * (DUST_FORWARD_SCATTER / Math.PI), 0.06, 1.0);

    // Lying snow. weather.js has computed and damped snowCover since the day it
    // was written and NOTHING has ever read it, so a blizzard fell through green
    // ground and the ice stage photographed as summer gravel with weather over
    // it. It is already damped there, so it is passed straight through — but
    // setGroundSnow walks the stage's materials, so it is gated on a change
    // worth seeing rather than run on every one of sixty frames a second.
    const cover = (w.metrics && w.metrics.snowCover) || (w.wet && w.wet.snowCover) || 0;
    if (setGroundSnowFn && Math.abs(cover - state.groundSnow) > 0.004) {
      state.groundSnow = cover;
      setGroundSnowFn(stageGroup, cover);
    }
    if (scene.fog) {
      dustMat.uniforms.uFogNear.value = scene.fog.near;
      dustMat.uniforms.uFogFar.value = scene.fog.far;
      dustMat.uniforms.uFogColour.value.copy(scene.fog.color);
      debrisMat.uniforms.uFogNear.value = scene.fog.near;
      debrisMat.uniforms.uFogFar.value = scene.fog.far;
      debrisMat.uniforms.uFogColour.value.copy(scene.fog.color);
    }
    // Grade per preset. A cold storm should not be the same picture as a golden
    // hour with the saturation turned down; lift/gamma/gain is enough to make the
    // difference without a lookup texture.
    const u = post.composite.uniforms;
    const night = nightFraction(cur);
    // Almost no lift in daylight. A film lift of 0.012 puts the black point at
    // roughly 30/255 after the grade, so nothing in the frame can ever be dark —
    // measured across fifteen frames, not one pixel fell below luminance 26, and
    // a shadow that should have been a hole in the picture was a 14% dip. The
    // lift is a night look; it belongs to the night.
    //
    // It is also worth a fifth of what it shipped at. The night term ran at
    // 0.034/0.036/0.058, which puts the black point at (54,57,74) — luminance
    // 58 — and on a night stage almost nothing else is that bright: with every
    // light in the scene forced to zero inside the render call the ground still
    // measured a flat 58 at every distance across the frame, and with the rig
    // back on the verge only reached 60-77. The lift WAS the picture. That is
    // why night-clear photographed as dusk, and why the lamps had to be run hot
    // enough to blow out before they read as a beam against it.
    u.uLift.value.set(0.001 + 0.007 * night, 0.0015 + 0.0075 * night, 0.003 + 0.013 * night);
    u.uGamma.value.set(1.0, 0.995 - 0.02 * night, 0.985 - 0.035 * night);
    u.uGain.value.set(
      1.02 + 0.04 * saturate(cur.turbidity / 12),
      1.0,
      0.98 + 0.10 * night + 0.06 * saturate(wetFilm(w)),
    );
    u.uSaturation.value = 1.06 - 0.24 * night - 0.12 * saturate(wetFilm(w));
  }

// How much of the night grade to apply. This used to read weather.metrics
  // lightLevel, which is not a daylight fraction at all: it is the input to the
  // headlight Schmitt trigger, scaled for thresholds at 0.18 and 0.30. Measured on
  // the shipped presets it reads 0.478 for OVERCAST NOON and 0.669 for golden
  // hour, so the renderer was running a half-strength night grade — lifted blacks,
  // blue gain, desaturation — over broad daylight. That was a large part of why
  // the daylight scenes looked murky. The sun's elevation is the physical quantity
  // that actually decides this, so ask it instead.
  function nightFraction(preset) {
    const elevation = preset && Number.isFinite(preset.sunElevation)
      ? preset.sunElevation
      : 0.6;
    // Full grade once the sun is a little below the horizon; none of it once the
    // sun is properly up. -12 degrees is nautical twilight, +3 is sunrise proper.
    return 1 - smoothstep(-0.21, 0.05, elevation);
  }

  function updateGhost(ghost, dt) {
    const mesh = state.ghostMesh;
    if (!mesh) return;
    const has = ghost && typeof ghost.sample === "function";
    const pose = has ? ghost.sample() : (ghost && ghost.pose) || null;
    if (!pose) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.position.set(pose.x, pose.y, pose.z);
    if (pose.quat) {
      mesh.quaternion.set(pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w);
    } else {
      eTmp.set(0, pose.yaw || 0, 0);
      mesh.quaternion.setFromEuler(eTmp);
    }
    if (mesh.material && mesh.material.uniforms) {
      mesh.material.uniforms.uOpacity.value = damp(
        mesh.material.uniforms.uOpacity.value, 0.34, 3, dt,
      );
    }
  }

  function applyRigToCamera(rig, p) {
    camera.position.set(rig.px, rig.py, rig.pz);
    vTmp.set(rig.tx, rig.ty, rig.tz);
    vUp.set(rig.upX, rig.upY, rig.upZ);
    camera.up.copy(vUp);
    camera.lookAt(vTmp);
    if (rig.pitchTrim !== 0) camera.rotateX(rig.pitchTrim);
    if (camera.fov !== rig.fov) {
      camera.fov = rig.fov;
      camera.near = p.near;
      camera.far = p.far;
      camera.updateProjectionMatrix();
    }
  }

  function renderFrame() {
    if (!post.enabled || !post.sceneRT || typeof gl.setRenderTarget !== "function") {
      applyToneMapping();
      gl.render(scene, camera);
      return;
    }
    const q = state.quality;
    const u = post.composite.uniforms;
    gl.setRenderTarget(post.sceneRT);
    if (typeof gl.clear === "function") gl.clear(true, true, true);
    gl.render(scene, camera);

    if (q.bloom && post.brightRT) {
      post.quad.material = post.bright;
      post.bright.uniforms.tScene.value = post.sceneRT.texture;
      gl.setRenderTarget(post.brightRT);
      gl.render(post.scene, post.camera);

      post.quad.material = post.blur;
      let src = post.brightRT;
      for (let i = 0; i < q.bloomIterations; i += 1) {
        post.blur.uniforms.tSource.value = src.texture;
        post.blur.uniforms.uDirection.value.set(1 + i * 1.7, 0);
        gl.setRenderTarget(post.blurA);
        gl.render(post.scene, post.camera);
        post.blur.uniforms.tSource.value = post.blurA.texture;
        post.blur.uniforms.uDirection.value.set(0, 1 + i * 1.7);
        gl.setRenderTarget(post.blurB);
        gl.render(post.scene, post.camera);
        src = post.blurB;
      }
      u.tBloom.value = post.blurB.texture;
      u.uBloom.value = 0.62;
    } else {
      u.tBloom.value = post.brightRT ? post.brightRT.texture : null;
      u.uBloom.value = 0;
    }

    u.tScene.value = post.sceneRT.texture;
    u.uExposure.value = state.exposure;
    u.uChroma.value = q.chroma * (0.4 + 0.6 * saturate(state.speedCue || 0));
    u.uVignette.value = q.vignette * (0.75 + 0.45 * saturate(state.speedCue || 0));
    u.uRadial.value = q.radialBlur ? saturate((state.speedCue || 0) - 0.42) * 1.7 : 0;
    u.uDither.value = q.dither ? 1.6 / 255 : 0;
    u.uTime.value = state.time;
    post.quad.material = post.composite;
    gl.setRenderTarget(null);
    gl.render(post.scene, post.camera);
  }

  function measureFrame(dt) {
    const now = typeof performance !== "undefined" && performance.now
      ? performance.now() : Date.now();
    if (state.lastFrameStamp > 0) {
      state.frameMs = now - state.lastFrameStamp;
    } else {
      state.frameMs = dt * 1000;
    }
    state.lastFrameStamp = now;
    if (state.autoEnabled) {
      const before = state.auto.index;
      const beforeScale = state.auto.scaleIndex;
      const action = autoScalerSample(state.auto, state.frameMs, dt);
      if (action !== 0) {
        if (state.auto.index !== before) resolveQuality();
        if (state.auto.scaleIndex !== beforeScale) {
          state.resolutionScale = autoScalerScale(state.auto);
          resize();
        }
      }
    }
  }

  function update(frame, dt) {
    const step = clamp(dt || 0, 0, 0.25);
    state.time += step;
    measureFrame(step);

    // toMenu() clears the stage but leaves game.js holding the old one, so this
    // guard is load-bearing rather than defensive: without it the first menu
    // frame walks a scene graph that has already been disposed.
    if (!state.built || !frame || !frame.car || !frame.stage || frame.stage !== state.stage) {
      idleFrame(step);
      return;
    }

    const car = frame.car;
    const surface = frame.surface || null;
    syncWeather(step);

    sampleCar(_sample, car, surface);
    state.speedCue = saturate(car.speed / 58);

    if (state.world && typeof state.world.project === "function") {
      state.lastS = state.world.project(car.pos.x, car.pos.z, state.lastS, proj).s;
    }

    // The finish flourish takes the camera over, then hands it back when the
    // player restarts.
    let mode = state.cameraMode;
    if (frame.state === "finished") {
      state.finishTimer += step;
      mode = "finish";
    } else {
      state.finishTimer = 0;
    }
    if (mode === "tv") pickTvAnchor(car);
    const p = framedParams(mode);
    const rig = rigs[mode];
    updateCameraRig(rig, _sample, p, step, state.ground);
    applyRigToCamera(rig, p);

    updateCarMesh(car, frame.alpha || 0);
    updateContactShadow(car);
    updateHeadlights(car, step);
    updateCabinLights(car);
    updateInstruments(car);
    spawnWheelParticles(car, surface, step);
    updateMarks(car, surface, step);
    ageMarks(step);

    const w = state.weather;
    const windSpeed = w && w.current ? w.current.windSpeed : 0;
    const windDir = w && w.current ? w.current.windDirection : 0;
    const wx = Math.sin(windDir) * windSpeed * 0.4;
    const wz = Math.cos(windDir) * windSpeed * 0.4;
    stepParticlePool(dustPool, step, wx, 0.15, wz);
    stepParticlePool(debrisPool, step, wx * 0.2, 0, wz * 0.2);
    packParticles(dustPool, state.sunX, state.sunY, state.sunZ);
    packParticles(debrisPool, state.sunX, state.sunY, state.sunZ);
    dustGeo.setDrawRange(0, dustPool.outCount);
    debrisGeo.setDrawRange(0, debrisPool.outCount);
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.aColour.needsUpdate = true;
    dustGeo.attributes.aSize.needsUpdate = true;
    dustGeo.attributes.aFade.needsUpdate = true;
    debrisGeo.attributes.position.needsUpdate = true;
    debrisGeo.attributes.aColour.needsUpdate = true;
    debrisGeo.attributes.aSize.needsUpdate = true;
    debrisGeo.attributes.aFade.needsUpdate = true;
    dustMat.uniforms.uScale.value = state.height * 0.9;
    debrisMat.uniforms.uScale.value = state.height * 0.55;

    updateShadow(car);
    updateScenery(camera.position.x, camera.position.z);
    updateGhost(frame.ghost, step);

    renderFrame();
  }

  // A slow drift over whatever is in the scene, for the menu. It must never touch
  // the stage systems, because the menu is exactly when there is no stage.
  function updateIdle(dt) {
    const step = clamp(dt || 0, 0, 0.25);
    state.time += step;
    idleFrame(step);
  }

  function idleFrame(step) {
    const r = 46;
    const a = state.time * 0.06;
    camera.position.set(Math.sin(a) * r, 14 + Math.sin(a * 0.7) * 3, Math.cos(a) * r);
    vTmp.set(0, 4, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(vTmp);
    if (camera.fov !== 48) {
      camera.fov = 48;
      camera.updateProjectionMatrix();
    }
    stepParticlePool(dustPool, step, 0, 0, 0);
    packParticles(dustPool, state.sunX, state.sunY, state.sunZ);
    dustGeo.setDrawRange(0, dustPool.outCount);
    dustGeo.attributes.position.needsUpdate = true;
    renderFrame();
  }

  // ---- impacts

  function impactEffect(hit) {
    if (!hit) return;
    const x = hit.point ? hit.point.x : (state.car ? state.car.pos.x : 0);
    const y = hit.point ? hit.point.y : (state.car ? state.car.pos.y : 0);
    const z = hit.point ? hit.point.z : (state.car ? state.car.pos.z : 0);
    const nx = hit.normal ? hit.normal.x : 0;
    const ny = hit.normal ? hit.normal.y : 1;
    const nz = hit.normal ? hit.normal.z : 0;
    const e = saturate((hit.speed || 0) / 28);
    const kind = hit.kind || "hit";
    const count = Math.round(6 + e * 34);
    for (let i = 0; i < count; i += 1) {
      const sx = (rng.next() - 0.5) * 2;
      const sy = rng.next();
      const sz = (rng.next() - 0.5) * 2;
      const spd = 2 + rng.next() * (6 + e * 22);
      const vx = (nx * 1.4 + sx) * spd;
      const vy = (ny * 0.7 + sy * 1.6) * spd;
      const vz = (nz * 1.4 + sz) * spd;
      if (kind === "tree") {
        spawnParticle(debrisPool, x, y, z, vx, vy, vz,
          0.8 + rng.next() * 1.1, 0.06, 0.03,
          0.34, 0.24, 0.14, PARTICLE_KIND.SPLINTER, 0.5, 1, 0);
      } else if (kind === "bale") {
        spawnParticle(dustPool, x, y, z, vx * 0.5, vy * 0.6, vz * 0.5,
          1.4 + rng.next() * 1.6, 0.09, 0.18,
          0.78, 0.68, 0.32, PARTICLE_KIND.HAY, 1.1, 0.35, 0);
      } else if (kind === "rock" || kind === "kerb" || kind === "scrape") {
        spawnParticle(debrisPool, x, y, z, vx, vy * 0.6, vz,
          0.22 + rng.next() * 0.35, 0.05, 0.01,
          2.4, 1.15, 0.28, PARTICLE_KIND.SPARK, 0.9, 1, 0);
      } else if (kind === "water") {
        spawnParticle(dustPool, x, y, z, vx * 0.8, vy * 1.3, vz * 0.8,
          0.5 + rng.next() * 0.6, 0.10, 0.44,
          0.78, 0.85, 0.92, PARTICLE_KIND.SPRAY, 3.0, 0.6, 0);
      } else if (kind === "landing") {
        spawnParticle(dustPool, x, y, z, vx * 0.5, vy * 0.4 + 1.5, vz * 0.5,
          0.9 + rng.next() * 1.0, 0.20, 0.95,
          0.52, 0.45, 0.34, PARTICLE_KIND.DUST, 1.6, 0.12, 0);
      } else {
        spawnParticle(debrisPool, x, y, z, vx, vy, vz,
          0.5 + rng.next() * 0.7, 0.045, 0.02,
          0.82, 0.86, 0.95, PARTICLE_KIND.GLASS, 0.6, 1, 0);
        if (rng.chance(0.5)) {
          spawnParticle(dustPool, x, y, z, vx * 0.3, vy * 0.3, vz * 0.3,
            0.8 + rng.next() * 0.8, 0.16, 0.7,
            0.42, 0.36, 0.28, PARTICLE_KIND.DUST, 1.8, 0.15, 0);
        }
      }
    }
  }

  // ---- public surface

  function setCamera(mode) {
    if (!CAMERA_MODES.includes(mode)) return api;
    state.prevMode = state.cameraMode;
    state.cameraMode = mode;
    const rig = rigs[mode];
    if (rig) rig.ready = false;
    return api;
  }

  function cycleCamera() {
    const i = CAMERA_CYCLE.indexOf(state.cameraMode);
    const next = CAMERA_CYCLE[(i + 1) % CAMERA_CYCLE.length];
    return setCamera(next);
  }

  function toggleHeadlights() {
    const cur = state.headlightsForced === null ? headlights.on : state.headlightsForced;
    state.headlightsForced = !cur;
    return state.headlightsForced;
  }

  function setQuality(q) {
    state.qualityRequest = q || "auto";
    if (state.qualityRequest !== "auto") {
      const idx = QUALITY_LEVELS.indexOf(state.qualityRequest);
      if (idx >= 0) state.auto.index = idx;
      state.auto.scaleIndex = 0;
      state.resolutionScale = 1;
    }
    resolveQuality();
    applyQuality();
    return api;
  }

  function dispose() {
    clearStage();
    scene.remove(dustPoints, debrisPoints, markMesh, stageGroup);
    if (headlights.left) {
      scene.remove(headlights.left, headlights.left.target,
        headlights.right, headlights.right.target,
        headlights.pod, headlights.pod.target,
        headlights.spill, headlights.spill.target);
    }
    if (headlights.beams) scene.remove(headlights.beams);
    scene.remove(fallbackKey, fallbackKey.target, fallbackFill, camera);
    disposeTargets();
    permBin.disposeAll();
    if (typeof gl.dispose === "function") gl.dispose();
  }

  const api = {
    scene,
    camera,
    version: 1,
    renderer: gl,
    get cameraMode() { return state.cameraMode; },
    get quality() { return state.quality.name; },
    get resolutionScale() { return state.resolutionScale; },
    get frameMs() { return state.frameMs; },
    get stats() {
      return {
        dust: dustPool.alive,
        debris: debrisPool.alive,
        draws: state.drawsIssued,
        quality: state.quality.name,
        scale: state.resolutionScale,
        frameMs: state.frameMs,
        shadowRadius: shadowFit.radius,
        post: post.enabled,
        hdr: !!post.hdr,
        samples: post.samples | 0,
        anisotropy: anisoTextures.length
          ? anisoTextures[0].anisotropy : 0,
      };
    },
    rigs,
    autoScaler: state.auto,
    shadowFit,
    dustPool,
    debrisPool,
    buildStage,
    update,
    updateIdle,
    setCamera,
    cycleCamera,
    impactEffect,
    toggleHeadlights,
    setQuality,
    resize,
    clearStage,
    dispose,
  };
  return api;
}
