// Weather is a driving system, not a filter. A preset here decides the sun's
// colour and where it is, what the sky looks like at every altitude, how much
// water is lying on the road, how far you can see, and how much grip you have —
// and stepWeather can move continuously from one to another while you drive, so
// rain can arrive over the second half of a stage.
//
// Everything the renderer needs is built once in createWeather and afterwards
// only *updated*: lights are repointed and recoloured, particle pools are drawn
// at a different instance count, uniforms are written in place. Nothing under
// the scene graph is created or destroyed after construction, and the per-frame
// path allocates nothing.

import * as THREE_DEFAULT from "./three.module.min.js";
import {
  TAU, DEG, clamp, saturate, smoothstep, damp, wrapAngle, angleDelta,
} from "./mathx.js";
import { makeRng, hash2 } from "./rng.js";

// ---- colour: linear RGB storage, Oklab interpolation

// Preset colours are stored as *linear* RGB triples, which is also three's
// working colour space, so a Color.setRGB needs no conversion. Blending two
// weathers happens in Oklab instead: a straight linear-RGB fade from a warm
// overcast to a blue night passes through a dead grey, and an sRGB fade darkens
// in the middle. Oklab keeps the hue arc and the perceived lightness ramp.

function srgbLinearToOklab(r, g, b, out) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return out;
}

function oklabToLinear(L, A, B, out) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  // Out-of-gamut mixes can land a hair below zero; negative light is nonsense
  // and would poison every downstream multiply, so clamp at the source.
  out[0] = Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[1] = Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[2] = Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return out;
}

const okA = [0, 0, 0];
const okB = [0, 0, 0];

export function mixColour(a, b, t, out) {
  const u = saturate(t);
  if (u <= 0) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
  if (u >= 1) { out[0] = b[0]; out[1] = b[1]; out[2] = b[2]; return out; }
  srgbLinearToOklab(a[0], a[1], a[2], okA);
  srgbLinearToOklab(b[0], b[1], b[2], okB);
  return oklabToLinear(
    okA[0] + (okB[0] - okA[0]) * u,
    okA[1] + (okB[1] - okA[1]) * u,
    okA[2] + (okB[2] - okA[2]) * u,
    out,
  );
}

export function luminance(c) {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// A tint carries hue only: its luminance is normalised to 1 so that brightness
// is always the separate scalar it multiplies. Sky brightness then stays a
// strictly monotonic function of sun elevation whatever the hue is doing.
function unitTint(r, g, b) {
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const k = y > 1e-6 ? 1 / y : 1;
  return Object.freeze([r * k, g * k, b * k]);
}

// ---- the preset schema
//
// The schema is the single description of a weather: it drives validation, the
// mutable state object, and the interpolator, so a new field cannot be added in
// one place and forgotten in another.

const N = (key, min, max, kind) => Object.freeze({ key, min, max, kind: kind || "num" });

export const WEATHER_NUMERIC_FIELDS = Object.freeze([
  N("sunElevation", -1.25, 1.56, "linear"),
  N("sunAzimuth", -TAU, TAU, "angle"),
  N("sunIntensity", 0, 9),
  N("sunAngularSize", 0.003, 0.06),
  N("haloStrength", 0, 4),
  N("hemiIntensity", 0, 4),
  N("ambientIntensity", 0, 2.5),
  N("bounceIntensity", 0, 1.5),
  N("shadowStrength", 0, 1),
  N("exposure", 0.25, 3.2),
  N("turbidity", 1, 16),
  N("skyBrightness", 0, 3),
  N("skyTintWeight", 0, 1),
  N("fogNear", 2, 8000, "log"),
  N("fogFar", 20, 40000, "log"),
  N("fogDensity", 0, 0.09),
  N("visibility", 12, 45000, "log"),
  N("cloudCover", 0, 1),
  N("cloudOpacity", 0, 1),
  N("cloudAltitude", 100, 12000, "log"),
  N("cloudScale", 0.00002, 0.02, "log"),
  N("cloudSharpness", 0.4, 9),
  N("cloudSpeed", 0, 3),
  N("precipRate", 0, 90),
  N("precipRainMix", 0, 1),
  N("precipSnowMix", 0, 1),
  N("dropSize", 0.15, 4),
  N("fallSpeed", 0.3, 16),
  N("windSpeed", 0, 48),
  N("windDirection", -TAU, TAU, "angle"),
  N("gustiness", 0, 1),
  N("roadWetness", 0, 1),
  N("puddleChance", 0, 1),
  N("temperature", -35, 50, "linear"),
  N("starIntensity", 0, 1),
  N("moonIntensity", 0, 1.6),
  N("moonPhase", 0, 1),
  N("lightningRate", 0, 1.5),
  N("glassFogging", 0, 1),
]);

export const WEATHER_COLOUR_FIELDS = Object.freeze([
  "sunColour", "moonColour", "hemiSky", "hemiGround", "bounceColour",
  "fogColour", "skyZenith", "skyHorizon", "skyGround",
  "cloudLit", "cloudDark", "precipColour",
]);

export const WEATHER_LABEL_FIELDS = Object.freeze(["id", "name", "summary", "cloudType", "precipType"]);

export const CLOUD_TYPES = Object.freeze(["clear", "cirrus", "cumulus", "stratus", "nimbus", "anvil"]);
export const PRECIP_TYPES = Object.freeze(["none", "drizzle", "rain", "downpour", "sleet", "snow", "blizzard"]);

// Weight the four channels of the generated cloud texture per cloud type:
// [billow, sheet, detail, streak]. One texture, six skies.
const CLOUD_WEIGHTS = Object.freeze({
  clear:   Object.freeze([0.25, 0.10, 0.15, 0.50]),
  cirrus:  Object.freeze([0.10, 0.05, 0.25, 0.85]),
  cumulus: Object.freeze([0.85, 0.15, 0.35, 0.10]),
  stratus: Object.freeze([0.25, 0.80, 0.15, 0.20]),
  nimbus:  Object.freeze([0.55, 0.70, 0.30, 0.05]),
  anvil:   Object.freeze([0.75, 0.45, 0.45, 0.15]),
});

function cloudWeights(type) {
  return CLOUD_WEIGHTS[type] || CLOUD_WEIGHTS.cumulus;
}

// ---- the presets
//
// Names are invented. Each one is a different *drive*, not just a different
// look: the wet ones cost grip and sight-lines, the dark ones need lights, the
// snow ones change how the car puts its power down.

function preset(def) {
  const out = { ...def };
  for (const f of WEATHER_COLOUR_FIELDS) {
    if (!out[f]) throw new Error(`preset ${def.id} missing colour ${f}`);
    out[f] = Object.freeze(out[f].slice());
  }
  for (const f of WEATHER_NUMERIC_FIELDS) {
    if (typeof out[f.key] !== "number" || !Number.isFinite(out[f.key])) {
      throw new Error(`preset ${def.id} missing numeric ${f.key}`);
    }
  }
  return Object.freeze(out);
}

export const WEATHER_PRESETS = Object.freeze([
  preset({
    id: "clear-dawn",
    name: "Pale Ember",
    summary: "First light over a cold valley — long shadows, a warm rim on every crest.",
    sunElevation: 6.5 * DEG, sunAzimuth: 84 * DEG,
    sunIntensity: 2.1, sunAngularSize: 0.0125, haloStrength: 1.9,
    sunColour: [1.0, 0.52, 0.20], moonColour: [0.42, 0.48, 0.62],
    hemiSky: [0.30, 0.36, 0.58], hemiGround: [0.16, 0.13, 0.11],
    hemiIntensity: 0.85, ambientIntensity: 0.22,
    bounceColour: [0.36, 0.28, 0.20], bounceIntensity: 0.18,
    shadowStrength: 0.85, exposure: 1.15, turbidity: 2.6,
    skyBrightness: 0.85, skyTintWeight: 0.42,
    skyZenith: [0.055, 0.115, 0.320], skyHorizon: [0.92, 0.46, 0.24], skyGround: [0.10, 0.08, 0.07],
    fogColour: [0.52, 0.40, 0.36], fogNear: 90, fogFar: 2200, fogDensity: 0.0012,
    visibility: 9000,
    // Cirrus reads off the streak channel, whose values cluster hard around a
    // half, so a cover much under 0.4 leaves the ramp above the field and the
    // dawn sky empty — which is what it was: not one cloud anywhere in it.
    cloudCover: 0.44, cloudOpacity: 0.75, cloudType: "cirrus",
    cloudAltitude: 5200, cloudScale: 0.00022, cloudSharpness: 2.1, cloudSpeed: 0.35,
    cloudLit: [1.0, 0.62, 0.38], cloudDark: [0.26, 0.22, 0.30],
    precipType: "none", precipRate: 0, precipRainMix: 0, precipSnowMix: 0,
    precipColour: [0.70, 0.74, 0.80], dropSize: 1.0, fallSpeed: 7.0,
    windSpeed: 2.4, windDirection: 40 * DEG, gustiness: 0.15,
    roadWetness: 0.10, puddleChance: 0.02, temperature: 4.5,
    starIntensity: 0.10, moonIntensity: 0.05, moonPhase: 0.30,
    lightningRate: 0, glassFogging: 0.28,
  }),
  preset({
    id: "midday-hard",
    name: "White Anvil",
    summary: "Sun straight overhead, no shadow to read the road by, heat shimmer off the tarmac.",
    sunElevation: 71 * DEG, sunAzimuth: 186 * DEG,
    sunIntensity: 5.4, sunAngularSize: 0.0093, haloStrength: 0.55,
    sunColour: [1.0, 0.955, 0.885], moonColour: [0.40, 0.45, 0.58],
    hemiSky: [0.40, 0.56, 0.92], hemiGround: [0.30, 0.27, 0.22],
    hemiIntensity: 1.05, ambientIntensity: 0.16,
    bounceColour: [0.48, 0.44, 0.36], bounceIntensity: 0.34,
    shadowStrength: 1.0, exposure: 0.82, turbidity: 2.1,
    skyBrightness: 1.35, skyTintWeight: 0.30,
    // The hard-noon axis: a near-ultramarine zenith over a horizon bleached warm
    // by twenty-six kilometres of dusty air. Both ends matter — a blue that runs
    // all the way down is a painted dome, not a sky.
    skyZenith: [0.030, 0.105, 0.470], skyHorizon: [0.62, 0.56, 0.50], skyGround: [0.24, 0.22, 0.19],
    fogColour: [0.61, 0.575, 0.545], fogNear: 400, fogFar: 9000, fogDensity: 0.00028,
    visibility: 26000,
    // Below about a quarter, the coverage ramp never clears the noise field and
    // the sky comes out with no cloud in it at all — which is what White Anvil
    // photographed as: a clean gradient and nothing else in twenty thousand
    // pixels of sky.
    cloudCover: 0.34, cloudOpacity: 0.9, cloudType: "cumulus",
    cloudAltitude: 2100, cloudScale: 0.00040, cloudSharpness: 3.4, cloudSpeed: 0.5,
    cloudLit: [1.0, 0.99, 0.97], cloudDark: [0.42, 0.46, 0.56],
    precipType: "none", precipRate: 0, precipRainMix: 0, precipSnowMix: 0,
    precipColour: [0.72, 0.76, 0.82], dropSize: 1.0, fallSpeed: 7.0,
    windSpeed: 3.2, windDirection: 210 * DEG, gustiness: 0.22,
    roadWetness: 0.0, puddleChance: 0.0, temperature: 27.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0, glassFogging: 0.02,
  }),
  preset({
    id: "golden-hour",
    name: "Long Amber",
    summary: "Low raking sun down the stage — every crest is a wall of light, every dip a black hole.",
    sunElevation: 11 * DEG, sunAzimuth: 268 * DEG,
    sunIntensity: 3.0, sunAngularSize: 0.0118, haloStrength: 2.4,
    sunColour: [1.0, 0.66, 0.33], moonColour: [0.42, 0.47, 0.60],
    hemiSky: [0.52, 0.48, 0.56], hemiGround: [0.26, 0.19, 0.13],
    hemiIntensity: 0.9, ambientIntensity: 0.2,
    bounceColour: [0.52, 0.36, 0.22], bounceIntensity: 0.3,
    shadowStrength: 0.92, exposure: 1.05, turbidity: 3.4,
    skyBrightness: 1.0, skyTintWeight: 0.5,
    skyZenith: [0.075, 0.130, 0.330], skyHorizon: [1.0, 0.60, 0.28], skyGround: [0.16, 0.11, 0.08],
    fogColour: [0.68, 0.48, 0.33], fogNear: 160, fogFar: 3600, fogDensity: 0.0009,
    visibility: 13000,
    cloudCover: 0.38, cloudOpacity: 0.85, cloudType: "cumulus",
    cloudAltitude: 2600, cloudScale: 0.00034, cloudSharpness: 2.8, cloudSpeed: 0.45,
    cloudLit: [1.0, 0.70, 0.42], cloudDark: [0.30, 0.24, 0.28],
    precipType: "none", precipRate: 0, precipRainMix: 0, precipSnowMix: 0,
    precipColour: [0.74, 0.72, 0.70], dropSize: 1.0, fallSpeed: 7.0,
    windSpeed: 2.0, windDirection: 300 * DEG, gustiness: 0.12,
    roadWetness: 0.04, puddleChance: 0.01, temperature: 16.0,
    starIntensity: 0.05, moonIntensity: 0.04, moonPhase: 0.7,
    lightningRate: 0, glassFogging: 0.06,
  }),
  preset({
    id: "overcast",
    name: "Flat Slate",
    summary: "A lid of grey cloud. No shadows, no contrast, and the road reads flatter than it is.",
    sunElevation: 34 * DEG, sunAzimuth: 200 * DEG,
    sunIntensity: 0.85, sunAngularSize: 0.02, haloStrength: 0.2,
    sunColour: [0.86, 0.88, 0.92], moonColour: [0.38, 0.42, 0.52],
    hemiSky: [0.56, 0.59, 0.64], hemiGround: [0.24, 0.24, 0.23],
    hemiIntensity: 1.55, ambientIntensity: 0.34,
    bounceColour: [0.38, 0.38, 0.38], bounceIntensity: 0.22,
    shadowStrength: 0.28, exposure: 1.12, turbidity: 6.0,
    skyBrightness: 0.62, skyTintWeight: 0.78,
    // Cold slate overhead, warm pale grey along the horizon. The warm/cool axis
    // is what stops a grey sky reading as an absence of colour: the long path to
    // the horizon is where the deck's underside picks up the ground's own light.
    skyZenith: [0.25, 0.31, 0.47], skyHorizon: [0.275, 0.228, 0.185], skyGround: [0.14, 0.135, 0.13],
    fogColour: [0.335, 0.285, 0.238], fogNear: 220, fogFar: 3400, fogDensity: 0.0011,
    visibility: 8000,
    cloudCover: 0.93, cloudOpacity: 0.95, cloudType: "stratus",
    cloudAltitude: 1300, cloudScale: 0.00026, cloudSharpness: 1.3, cloudSpeed: 0.6,
    // A stratus deck's own two ends: a cold blue-grey core and a warm pale base
    // where it thins. The pair used to sit at 0.30 and 0.62, high in the tone
    // curve's shoulder, where a factor of two in radiance is worth sixteen
    // levels of pixel and the whole sky photographs as one wash of near-white.
    cloudLit: [0.345, 0.322, 0.288], cloudDark: [0.060, 0.074, 0.106],
    precipType: "none", precipRate: 0, precipRainMix: 0, precipSnowMix: 0,
    precipColour: [0.70, 0.73, 0.78], dropSize: 1.0, fallSpeed: 7.0,
    windSpeed: 5.5, windDirection: 250 * DEG, gustiness: 0.3,
    roadWetness: 0.14, puddleChance: 0.05, temperature: 11.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0, glassFogging: 0.18,
  }),
  preset({
    id: "light-rain",
    name: "Silver Drizzle",
    summary: "Steady fine rain. The road is dark and slick but the lines are still there if you are gentle.",
    sunElevation: 26 * DEG, sunAzimuth: 214 * DEG,
    sunIntensity: 0.55, sunAngularSize: 0.024, haloStrength: 0.12,
    sunColour: [0.80, 0.84, 0.90], moonColour: [0.36, 0.41, 0.52],
    hemiSky: [0.46, 0.50, 0.57], hemiGround: [0.19, 0.19, 0.19],
    hemiIntensity: 1.35, ambientIntensity: 0.32,
    bounceColour: [0.30, 0.32, 0.34], bounceIntensity: 0.18,
    shadowStrength: 0.16, exposure: 1.22, turbidity: 7.5,
    skyBrightness: 0.48, skyTintWeight: 0.82,
    // Rain runs cool the whole way up — no warm horizon, because the long path
    // is full of water rather than dust. What tells you where the sun is here is
    // the deck thinning, not the hue changing.
    skyZenith: [0.185, 0.215, 0.285], skyHorizon: [0.152, 0.162, 0.190], skyGround: [0.11, 0.115, 0.125],
    fogColour: [0.182, 0.194, 0.220], fogNear: 120, fogFar: 1800, fogDensity: 0.0022,
    visibility: 3200,
    cloudCover: 0.97, cloudOpacity: 0.96, cloudType: "nimbus",
    cloudAltitude: 950, cloudScale: 0.00030, cloudSharpness: 1.5, cloudSpeed: 0.85,
    cloudLit: [0.245, 0.258, 0.285], cloudDark: [0.062, 0.072, 0.094],
    precipType: "drizzle", precipRate: 6.5, precipRainMix: 1, precipSnowMix: 0,
    precipColour: [0.68, 0.73, 0.80], dropSize: 0.55, fallSpeed: 5.2,
    windSpeed: 6.0, windDirection: 235 * DEG, gustiness: 0.34,
    roadWetness: 0.62, puddleChance: 0.16, temperature: 9.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0, glassFogging: 0.45,
  }),
  preset({
    id: "heavy-rain",
    name: "Drum Rain",
    summary: "Rain hard enough to hear over the engine. Standing water on every apex and a wall of spray.",
    sunElevation: 21 * DEG, sunAzimuth: 220 * DEG,
    sunIntensity: 0.3, sunAngularSize: 0.028, haloStrength: 0.06,
    sunColour: [0.70, 0.74, 0.82], moonColour: [0.32, 0.37, 0.48],
    hemiSky: [0.33, 0.36, 0.42], hemiGround: [0.14, 0.14, 0.15],
    hemiIntensity: 1.15, ambientIntensity: 0.3,
    bounceColour: [0.24, 0.26, 0.28], bounceIntensity: 0.14,
    shadowStrength: 0.08, exposure: 1.35, turbidity: 9.5,
    skyBrightness: 0.3, skyTintWeight: 0.88,
    skyZenith: [0.13, 0.15, 0.19], skyHorizon: [0.128, 0.140, 0.165], skyGround: [0.09, 0.095, 0.105],
    fogColour: [0.155, 0.170, 0.200], fogNear: 60, fogFar: 900, fogDensity: 0.0048,
    visibility: 1250,
    cloudCover: 1.0, cloudOpacity: 1.0, cloudType: "nimbus",
    cloudAltitude: 700, cloudScale: 0.00034, cloudSharpness: 1.2, cloudSpeed: 1.15,
    cloudLit: [0.165, 0.175, 0.205], cloudDark: [0.038, 0.042, 0.056],
    precipType: "downpour", precipRate: 42, precipRainMix: 1, precipSnowMix: 0,
    precipColour: [0.66, 0.72, 0.80], dropSize: 1.15, fallSpeed: 8.6,
    windSpeed: 11.0, windDirection: 240 * DEG, gustiness: 0.55,
    roadWetness: 0.97, puddleChance: 0.62, temperature: 12.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0, glassFogging: 0.7,
  }),
  preset({
    id: "thunderstorm",
    name: "Black Ledger",
    summary: "A storm cell sitting on the stage. Near-night at noon, split open every few seconds.",
    sunElevation: 40 * DEG, sunAzimuth: 196 * DEG,
    sunIntensity: 0.16, sunAngularSize: 0.03, haloStrength: 0.04,
    sunColour: [0.62, 0.66, 0.76], moonColour: [0.30, 0.34, 0.46],
    hemiSky: [0.22, 0.24, 0.30], hemiGround: [0.10, 0.10, 0.11],
    hemiIntensity: 0.95, ambientIntensity: 0.26,
    bounceColour: [0.18, 0.19, 0.22], bounceIntensity: 0.1,
    shadowStrength: 0.05, exposure: 1.5, turbidity: 12.0,
    skyBrightness: 0.18, skyTintWeight: 0.92,
    skyZenith: [0.055, 0.062, 0.085], skyHorizon: [0.066, 0.066, 0.082], skyGround: [0.045, 0.045, 0.052],
    fogColour: [0.088, 0.096, 0.115], fogNear: 45, fogFar: 700, fogDensity: 0.0062,
    visibility: 900,
    cloudCover: 1.0, cloudOpacity: 1.0, cloudType: "anvil",
    cloudAltitude: 620, cloudScale: 0.00046, cloudSharpness: 2.2, cloudSpeed: 1.6,
    cloudLit: [0.125, 0.128, 0.155], cloudDark: [0.018, 0.018, 0.026],
    precipType: "downpour", precipRate: 62, precipRainMix: 1, precipSnowMix: 0,
    precipColour: [0.62, 0.70, 0.80], dropSize: 1.35, fallSpeed: 9.4,
    windSpeed: 18.0, windDirection: 205 * DEG, gustiness: 0.85,
    roadWetness: 1.0, puddleChance: 0.8, temperature: 15.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0.42, glassFogging: 0.78,
  }),
  preset({
    id: "hill-fog",
    name: "Cauldron Fog",
    summary: "Cloud sat in the col. Two hundred metres of sight and the pacenotes are all you have.",
    sunElevation: 30 * DEG, sunAzimuth: 178 * DEG,
    sunIntensity: 0.42, sunAngularSize: 0.034, haloStrength: 0.3,
    sunColour: [0.88, 0.90, 0.94], moonColour: [0.40, 0.43, 0.50],
    hemiSky: [0.68, 0.70, 0.73], hemiGround: [0.42, 0.42, 0.42],
    hemiIntensity: 1.7, ambientIntensity: 0.5,
    bounceColour: [0.48, 0.48, 0.49], bounceIntensity: 0.26,
    shadowStrength: 0.04, exposure: 1.1, turbidity: 14.0,
    skyBrightness: 0.55, skyTintWeight: 0.97,
    skyZenith: [0.50, 0.52, 0.55], skyHorizon: [0.62, 0.63, 0.65], skyGround: [0.48, 0.49, 0.50],
    fogColour: [0.66, 0.68, 0.70], fogNear: 12, fogFar: 210, fogDensity: 0.019,
    visibility: 190,
    cloudCover: 1.0, cloudOpacity: 0.6, cloudType: "stratus",
    cloudAltitude: 220, cloudScale: 0.00060, cloudSharpness: 0.9, cloudSpeed: 0.3,
    cloudLit: [0.70, 0.71, 0.73], cloudDark: [0.48, 0.49, 0.51],
    precipType: "drizzle", precipRate: 2.2, precipRainMix: 1, precipSnowMix: 0,
    precipColour: [0.72, 0.75, 0.78], dropSize: 0.35, fallSpeed: 3.4,
    windSpeed: 1.6, windDirection: 160 * DEG, gustiness: 0.1,
    roadWetness: 0.55, puddleChance: 0.1, temperature: 7.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0, glassFogging: 0.92,
  }),
  preset({
    id: "light-snow",
    name: "Quiet Flake",
    summary: "Big slow flakes on a packed white road. It looks gentle. It is not.",
    sunElevation: 17 * DEG, sunAzimuth: 202 * DEG,
    sunIntensity: 0.7, sunAngularSize: 0.026, haloStrength: 0.5,
    sunColour: [0.90, 0.92, 0.98], moonColour: [0.44, 0.50, 0.64],
    hemiSky: [0.62, 0.68, 0.80], hemiGround: [0.58, 0.62, 0.68],
    hemiIntensity: 1.6, ambientIntensity: 0.42,
    bounceColour: [0.66, 0.70, 0.78], bounceIntensity: 0.5,
    shadowStrength: 0.3, exposure: 0.95, turbidity: 6.5,
    skyBrightness: 0.6, skyTintWeight: 0.8,
    // Snow light is the coldest daylight there is, and the ground throws most of
    // it straight back up: the deck stays blue where it is thick and goes almost
    // colourless where the sun is behind it.
    skyZenith: [0.30, 0.355, 0.48], skyHorizon: [0.345, 0.375, 0.455], skyGround: [0.40, 0.43, 0.49],
    fogColour: [0.395, 0.420, 0.480], fogNear: 90, fogFar: 1500, fogDensity: 0.0026,
    visibility: 2400,
    cloudCover: 0.95, cloudOpacity: 0.9, cloudType: "stratus",
    cloudAltitude: 1100, cloudScale: 0.00028, cloudSharpness: 1.1, cloudSpeed: 0.5,
    cloudLit: [0.415, 0.430, 0.470], cloudDark: [0.105, 0.118, 0.155],
    precipType: "snow", precipRate: 9, precipRainMix: 0, precipSnowMix: 1,
    precipColour: [0.94, 0.96, 1.0], dropSize: 2.0, fallSpeed: 1.1,
    windSpeed: 3.0, windDirection: 190 * DEG, gustiness: 0.25,
    roadWetness: 0.3, puddleChance: 0.03, temperature: -3.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0, glassFogging: 0.6,
  }),
  preset({
    id: "blizzard",
    name: "White Silence",
    summary: "Horizontal snow and no horizon at all. White in every direction, including down.",
    sunElevation: 9 * DEG, sunAzimuth: 208 * DEG,
    sunIntensity: 0.22, sunAngularSize: 0.04, haloStrength: 0.1,
    sunColour: [0.84, 0.88, 0.96], moonColour: [0.40, 0.46, 0.60],
    hemiSky: [0.70, 0.74, 0.82], hemiGround: [0.72, 0.75, 0.80],
    hemiIntensity: 1.85, ambientIntensity: 0.6,
    bounceColour: [0.74, 0.77, 0.83], bounceIntensity: 0.62,
    shadowStrength: 0.03, exposure: 1.0, turbidity: 15.0,
    skyBrightness: 0.42, skyTintWeight: 0.98,
    skyZenith: [0.56, 0.59, 0.64], skyHorizon: [0.68, 0.70, 0.74], skyGround: [0.64, 0.66, 0.70],
    fogColour: [0.76, 0.78, 0.82], fogNear: 8, fogFar: 130, fogDensity: 0.028,
    visibility: 110,
    cloudCover: 1.0, cloudOpacity: 0.7, cloudType: "nimbus",
    cloudAltitude: 300, cloudScale: 0.00052, cloudSharpness: 0.8, cloudSpeed: 2.4,
    cloudLit: [0.76, 0.78, 0.82], cloudDark: [0.56, 0.58, 0.63],
    precipType: "blizzard", precipRate: 70, precipRainMix: 0, precipSnowMix: 1,
    precipColour: [0.96, 0.98, 1.0], dropSize: 1.3, fallSpeed: 1.9,
    windSpeed: 24.0, windDirection: 215 * DEG, gustiness: 0.95,
    roadWetness: 0.35, puddleChance: 0.02, temperature: -11.0,
    starIntensity: 0, moonIntensity: 0, moonPhase: 0.5,
    lightningRate: 0, glassFogging: 0.85,
  }),
  preset({
    id: "night-clear",
    name: "Cold Lantern",
    summary: "Hard frost, full stars, a moon bright enough to throw a shadow. Lights are the stage.",
    sunElevation: -32 * DEG, sunAzimuth: 12 * DEG,
    // The sun figure is what this air would give if the clock ran the stage into
    // dawn — the elevation is what keeps it below the horizon, not a zeroed dial.
    // dayGate takes it to nothing at anything under about -3 degrees, so it lights
    // nothing here; every photon on this stage comes from the moon term below.
    sunIntensity: 3.2, sunAngularSize: 0.0093, haloStrength: 0.9,
    sunColour: [0.60, 0.64, 0.80], moonColour: [0.52, 0.60, 0.86],
    hemiSky: [0.05, 0.07, 0.14], hemiGround: [0.02, 0.02, 0.03],
    // The rig, not the exposure, is what makes a night. At a moon of 1.05 into an
    // exposure of 2.3 the gravel came back at pixel 89 under a sky of 72 — the
    // ground brighter than the sky above it, which is a description of dusk. The
    // moon and the flat fill come down and the exposure with them, while the sky
    // stops go up to hold their end: the verge now sits near 73 under a sky near
    // 95, so the beam is the only thing on the stage worth having. Most of the
    // remaining light is the moon rather than the hemisphere on purpose — a
    // directional keeps the shape of a bank, a flat fill only greys it.
    hemiIntensity: 0.26, ambientIntensity: 0.024,
    bounceColour: [0.05, 0.06, 0.09], bounceIntensity: 0.025,
    shadowStrength: 0.55, exposure: 1.5, turbidity: 1.8,
    skyBrightness: 0.02, skyTintWeight: 0.88,
    skyZenith: [0.018, 0.031, 0.084], skyHorizon: [0.041, 0.060, 0.109], skyGround: [0.013, 0.018, 0.028],
    fogColour: [0.036, 0.050, 0.086], fogNear: 200, fogFar: 3000, fogDensity: 0.0009,
    visibility: 6500,
    cloudCover: 0.08, cloudOpacity: 0.6, cloudType: "cirrus",
    cloudAltitude: 5600, cloudScale: 0.00020, cloudSharpness: 2.0, cloudSpeed: 0.3,
    cloudLit: [0.10, 0.12, 0.18], cloudDark: [0.02, 0.025, 0.04],
    precipType: "none", precipRate: 0, precipRainMix: 0, precipSnowMix: 0,
    precipColour: [0.70, 0.76, 0.90], dropSize: 1.0, fallSpeed: 7.0,
    windSpeed: 1.2, windDirection: 20 * DEG, gustiness: 0.08,
    roadWetness: 0.05, puddleChance: 0.01, temperature: -5.0,
    starIntensity: 1.0, moonIntensity: 0.72, moonPhase: 0.92,
    lightningRate: 0, glassFogging: 0.5,
  }),
  preset({
    id: "night-rain",
    name: "Wet Mirror",
    summary: "Rain at night. The beams bounce back off the water and the road stops giving anything away.",
    sunElevation: -22 * DEG, sunAzimuth: 348 * DEG,
    sunIntensity: 0.45, sunAngularSize: 0.012, haloStrength: 0.08,
    sunColour: [0.50, 0.56, 0.72], moonColour: [0.30, 0.35, 0.50],
    // Under a full nimbus deck the moon is gone and the only ambient there is
    // comes off the cloud base, so the fill carries the whole stage. At an
    // exposure of 2.5 that fill still left the road at pixel 4 while the sky sat
    // at 86 — a black cut-out under a dusk sky, and every wet highlight and
    // headlight in between clipped. The fill goes up, the exposure comes down,
    // and the road settles just readable outside the beam.
    hemiSky: [0.16, 0.19, 0.28], hemiGround: [0.05, 0.055, 0.065],
    hemiIntensity: 0.62, ambientIntensity: 0.14,
    bounceColour: [0.06, 0.065, 0.08], bounceIntensity: 0.05,
    shadowStrength: 0.1, exposure: 1.35, turbidity: 9.0,
    skyBrightness: 0.03, skyTintWeight: 0.9,
    skyZenith: [0.011, 0.013, 0.020], skyHorizon: [0.038, 0.042, 0.054], skyGround: [0.013, 0.014, 0.018],
    fogColour: [0.048, 0.053, 0.068], fogNear: 40, fogFar: 620, fogDensity: 0.0068,
    visibility: 700,
    cloudCover: 1.0, cloudOpacity: 0.95, cloudType: "nimbus",
    cloudAltitude: 780, cloudScale: 0.00032, cloudSharpness: 1.2, cloudSpeed: 1.0,
    cloudLit: [0.06, 0.065, 0.085], cloudDark: [0.018, 0.020, 0.028],
    precipType: "rain", precipRate: 30, precipRainMix: 1, precipSnowMix: 0,
    precipColour: [0.74, 0.80, 0.92], dropSize: 1.05, fallSpeed: 8.2,
    windSpeed: 8.5, windDirection: 250 * DEG, gustiness: 0.45,
    roadWetness: 0.94, puddleChance: 0.5, temperature: 6.5,
    starIntensity: 0.02, moonIntensity: 0.04, moonPhase: 0.4,
    lightningRate: 0, glassFogging: 0.88,
  }),
]);

const PRESET_BY_ID = new Map(WEATHER_PRESETS.map((p) => [p.id, p]));

export function presetById(id) {
  const p = PRESET_BY_ID.get(id);
  if (!p) throw new Error(`unknown weather preset: ${id}`);
  return p;
}

// ---- mutable preset-shaped state

export function makePresetState() {
  const s = {};
  for (const f of WEATHER_NUMERIC_FIELDS) s[f.key] = 0;
  for (const c of WEATHER_COLOUR_FIELDS) s[c] = new Float64Array(3);
  s.id = "";
  s.name = "";
  s.summary = "";
  s.cloudType = "cumulus";
  s.precipType = "none";
  return s;
}

export function copyPreset(src, out) {
  for (const f of WEATHER_NUMERIC_FIELDS) out[f.key] = src[f.key];
  for (const c of WEATHER_COLOUR_FIELDS) {
    const a = src[c];
    const b = out[c];
    b[0] = a[0]; b[1] = a[1]; b[2] = a[2];
  }
  for (const l of WEATHER_LABEL_FIELDS) out[l] = src[l];
  return out;
}

function logLerp(a, b, t) {
  // Visibility runs from 110 m to 26 km; a linear fade spends nine tenths of its
  // travel in distances the eye cannot tell apart. Geometric is what "fog
  // lifting" actually looks like.
  const lo = a > 1e-9 ? a : 1e-9;
  const hi = b > 1e-9 ? b : 1e-9;
  return lo * Math.pow(hi / lo, t);
}

export function lerpPreset(a, b, t, out) {
  const u = saturate(t);
  const fields = WEATHER_NUMERIC_FIELDS;
  for (let i = 0; i < fields.length; i += 1) {
    const f = fields[i];
    const va = a[f.key];
    const vb = b[f.key];
    if (f.kind === "angle") out[f.key] = wrapAngle(va + angleDelta(va, vb) * u);
    else if (f.kind === "log") out[f.key] = logLerp(va, vb, u);
    else out[f.key] = va + (vb - va) * u;
  }
  for (let i = 0; i < WEATHER_COLOUR_FIELDS.length; i += 1) {
    const key = WEATHER_COLOUR_FIELDS[i];
    mixColour(a[key], b[key], u, out[key]);
  }
  for (let i = 0; i < WEATHER_LABEL_FIELDS.length; i += 1) {
    const key = WEATHER_LABEL_FIELDS[i];
    out[key] = u < 0.5 ? a[key] : b[key];
  }
  return out;
}

// ---- sun and moon geometry

export function sunDirection(elevation, azimuth, out) {
  const ce = Math.cos(elevation);
  out.x = ce * Math.sin(azimuth);
  out.y = Math.sin(elevation);
  out.z = ce * Math.cos(azimuth);
  return out;
}

// A short, continuous solar-position model. It is not an ephemeris — it just has
// to give a plausible arc that never jumps, so a stage can run from dusk into
// night without the shadows snapping.
export function solarPosition(hours, latitude, dayOfYear, out) {
  const decl = 23.44 * DEG * Math.sin(TAU * (dayOfYear - 80.5) / 365.25);
  const H = (hours - 12) * 15 * DEG;
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinDec = Math.sin(decl);
  const cosDec = Math.cos(decl);
  const sinElev = clamp(sinLat * sinDec + cosLat * cosDec * Math.cos(H), -1, 1);
  out.elevation = Math.asin(sinElev);
  // Azimuth measured from north (+Z) through east (+X), matching sunDirection.
  const y = -Math.sin(H) * cosDec;
  const x = cosDec * Math.cos(H) * sinLat - sinDec * cosLat;
  out.azimuth = wrapAngle(Math.atan2(y, x) + Math.PI);
  return out;
}

// Rayleigh optical depth per unit air mass, roughly lambda^-4 across R/G/B. The
// clamp keeps the path length finite a few degrees below the horizon, which is
// also what makes every derived quantity monotonic in elevation.
const BETA_R = 0.058;
const BETA_G = 0.113;
const BETA_B = 0.253;

function airMass(sinElev) {
  return 1 / Math.max(sinElev + 0.06, 0.008);
}

// Direct sunlight colour after atmospheric extinction: white overhead, deep red
// on the horizon. Every channel is a strictly increasing function of elevation.
export function sunlightColour(elevation, turbidity, out) {
  const m = airMass(Math.sin(elevation)) * (0.8 + 0.06 * turbidity);
  out[0] = Math.exp(-BETA_R * m);
  out[1] = Math.exp(-BETA_G * m);
  out[2] = Math.exp(-BETA_B * m);
  return out;
}

// Fraction of the sun that clears the horizon, smoothed over roughly the width
// of the disc plus refraction.
function dayGate(sinElev) {
  return smoothstep(-0.055, 0.03, sinElev);
}

// Total skylight, driving how bright the dome is at every altitude.
function skyScatter(sinElev) {
  const above = sinElev > 0 ? sinElev : 0;
  return dayGate(sinElev) * (0.08 + 0.92 * Math.pow(above, 0.62));
}

// Metres. The shortest the fog ramp is ever allowed to end, whatever the
// visibility says: a white-out you cannot drive at all is a stage nobody
// finishes, not a hard one.
const FOG_FLOOR = 140;

const ZENITH_TINT = unitTint(0.16, 0.34, 1.00);
const HORIZON_TINT = unitTint(0.68, 0.74, 0.92);
const GROUND_TINT = unitTint(0.34, 0.32, 0.30);

// ---- generated textures
//
// Tileable value-noise FBM. The lattice indices wrap on the octave's period, so
// the finished texture repeats seamlessly under RepeatWrapping — a visible seam
// in a cloud layer is the first thing that gives a procedural sky away.

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// The lattice wraps on a whole number of cells per axis, which is what makes the
// result tile. Separate x and y periods buy anisotropy — cirrus combed into long
// streaks is a different period per axis, not a scaled lookup, because scaling
// the lookup is exactly what breaks the wrap.
function tileNoise(x, y, px, py, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const wx0 = ((xi % px) + px) % px;
  const wy0 = ((yi % py) + py) % py;
  const wx1 = (wx0 + 1) % px;
  const wy1 = (wy0 + 1) % py;
  const a = hash2(wx0, wy0, seed);
  const b = hash2(wx1, wy0, seed);
  const c = hash2(wx0, wy1, seed);
  const d = hash2(wx1, wy1, seed);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return top + (bot - top) * v;
}

// fx, fy are fractions of the texture, so every octave lands on an exact whole
// number of cells across it.
function tileFbm(fx, fy, px, py, octaves, seed, gain) {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * tileNoise(fx * px * f, fy * py * f, px * f, py * f, seed + i * 1319);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

// Never let the finest octave outrun the texel grid: an undersampled octave is
// noise, not detail, and it makes the wrap look like a seam even though it isn't.
function octavesFor(size, period, want) {
  return clamp(Math.floor(Math.log2(size / period)) + 1, 1, want);
}

function buildCloudTexture(THREE, size, seed) {
  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  const oBillow = octavesFor(size, 4, 5);
  const oSheet = octavesFor(size, 3, 3);
  const oDetail = octavesFor(size, 12, 4);
  const oStreak = octavesFor(size, 16, 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fx = x * inv;
      const fy = y * inv;
      // R billow: |noise| ridges give the cauliflower edge of a cumulus.
      const billow = 1 - Math.abs(tileFbm(fx, fy, 4, 4, oBillow, seed, 0.55) * 2 - 1);
      // G sheet: low frequency and stretched — an overcast lid.
      const sheet = tileFbm(fx, fy, 2, 3, oSheet, seed + 77, 0.6);
      // B detail: high frequency erosion mask.
      const detail = tileFbm(fx, fy, 12, 12, oDetail, seed + 313, 0.5);
      // A streak: heavily anisotropic — cirrus combed by the jet.
      const streak = tileFbm(fx, fy, 1, 16, oStreak, seed + 911, 0.5);
      const i = (y * size + x) * 4;
      data[i] = clamp(billow * 255, 0, 255);
      data[i + 1] = clamp(sheet * 255, 0, 255);
      data[i + 2] = clamp(detail * 255, 0, 255);
      data[i + 3] = clamp(streak * 255, 0, 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ---- sky shader

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Exported because tests/weather.test.mjs mirrors the cloud-shading arithmetic
// below in JS to measure the dome, and anchors that mirror on the literal source
// of the lines it reproduces. Change a constant here and the anchor fails, which
// is the point: a mirror that drifts silently is worse than no mirror.
export const SKY_FRAG = `
precision highp float;
varying vec3 vDir;

uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColour;
uniform float uSunIntensity;
uniform float uSunSize;
uniform float uHalo;
uniform vec3 uMoonDir;
uniform vec3 uMoonColour;
uniform float uMoonIntensity;
uniform float uMoonPhase;
uniform float uStars;
uniform sampler2D uCloudTex;
uniform vec4 uCloudMix;
uniform vec3 uCloudLit;
uniform vec3 uCloudDark;
uniform float uCloudCover;
uniform float uCloudOpacity;
uniform float uCloudSharp;
uniform float uCloudGlow;
uniform float uCloudAlt;
uniform float uCloudScale;
uniform vec2 uCloudScroll;
uniform vec3 uCamPos;
uniform float uFlash;
uniform vec3 uFogColour;
uniform float uHaze;

float starHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

// Cell-based star field: one candidate per cell, most of them rejected, so the
// survivors are sparse and unevenly spaced the way a real sky is.
//
// The cell test is a hard clip — a fragment one cell over asks a different cell
// and gets nothing — so the point spread has to have died away before it reaches
// the boundary. STAR_FALLOFF and STAR_JITTER are sized together for that: the
// profile is under a 255th of its peak by 0.0017 rad and a star can be thrown at
// most 0.12 of a cell off centre, which fits inside the finer lattice's half
// cell of 0.0026 rad. Sized apart, the cube's own silhouette shows through and
// the sky fills with hard white squares of every size, which is what it did.
const float STAR_FALLOFF = 1.9e6;
const float STAR_JITTER = 0.24;

float starField(vec3 dir, float scale, float density, float gain) {
  vec3 p = dir * scale;
  vec3 cell = floor(p);
  float h = starHash(cell);
  if (h > density) return 0.0;
  vec3 offset = vec3(starHash(cell + 1.7), starHash(cell + 4.3), starHash(cell + 8.9)) - 0.5;
  vec3 centre = normalize(cell + 0.5 + offset * STAR_JITTER);
  float d = length(centre - dir);
  // Magnitude, not brightness. A fifth power of a uniform is close enough to the
  // naked-eye distribution: almost every star sits far below the post chain's
  // bright threshold and only the rare one flares, instead of the whole field
  // clipping to white and blooming.
  float u = fract(h * 91.7);
  float mag = gain * (0.035 + 0.965 * u * u * u * u * u);
  return mag * exp(-d * d * STAR_FALLOFF);
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;

  float above = smoothstep(0.0, 0.62, h);
  vec3 col = mix(uHorizon, uZenith, pow(above, 0.72));
  col = mix(col, uGround, smoothstep(0.0, -0.22, h));

  // Stars sit behind everything and are killed by any daylight or cloud.
  float nightMask = uStars * smoothstep(-0.02, 0.10, h);
  if (nightMask > 0.001) {
    float s = starField(dir, 190.0, 0.030, 1.0) + starField(dir, 62.0, 0.020, 1.9);
    col += vec3(0.85, 0.90, 1.05) * s * nightMask * (1.0 - uCloudCover * 0.9);
  }

  // Moon: a disc with a phase terminator, plus a soft corona through haze.
  float md = dot(dir, uMoonDir);
  if (uMoonIntensity > 0.001) {
    float moonR = cos(0.0085);
    float disc = smoothstep(moonR - 0.00035, moonR + 0.00012, md);
    vec3 tang = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
    float lit = smoothstep(-0.02, 0.02, dot(dir - uMoonDir * md, tang) * 120.0 + (uMoonPhase * 2.0 - 1.0) * 1.4);
    col += uMoonColour * uMoonIntensity * (disc * (0.25 + 0.75 * lit) * 3.0
      + pow(max(md, 0.0), 900.0) * 0.9
      + pow(max(md, 0.0), 40.0) * 0.06 * uHaze);
  }

  // Sun: hard disc, tight bloom, and a wide Mie forward-scatter that is what
  // actually makes a low sun feel blinding down the length of a stage.
  float sd = dot(dir, uSunDir);
  float sunR = cos(uSunSize);
  float disc = smoothstep(sunR - uSunSize * 0.35, sunR + uSunSize * 0.05, sd);
  float bloom = pow(max(sd, 0.0), 1400.0);
  float mie = pow(max(sd, 0.0), 6.0) * 0.09 + pow(max(sd, 0.0), 60.0) * 0.35;
  col += uSunColour * uSunIntensity * (disc * 26.0 + bloom * 8.0 + mie * uHalo);

  // Cloud deck: the view ray hit against a flat layer at uCloudAlt, so the deck
  // converges at the horizon and opens out overhead — the parallax that makes a
  // flat texture read as a ceiling of cloud.
  if (h > 0.006 && uCloudOpacity > 0.001) {
    float t = uCloudAlt / h;
    vec2 uv = (uCamPos.xz + dir.xz * t) * uCloudScale + uCloudScroll;
    vec4 n = texture2D(uCloudTex, uv);
    vec4 n2 = texture2D(uCloudTex, uv * 2.17 - uCloudScroll * 0.6);
    vec4 n3 = texture2D(uCloudTex, uv * 0.23 + uCloudScroll * 0.31);
    float wsum = max(dot(uCloudMix, vec4(1.0)), 0.001);
    float field = mix(dot(n, uCloudMix) / wsum, dot(n2, uCloudMix) / wsum, 0.35);

    // Coverage and thickness are different questions and need different ramps.
    // Coverage decides whether there is any cloud in this direction; at a cover
    // of 0.93 its ramp sits entirely below the field and clips to one across the
    // whole sky. Shading off that same number therefore paints every texel of an
    // overcast lid the same colour — a grey wall with no structure in it.
    float density = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.42 / uCloudSharp, field);
    density *= uCloudOpacity;
    // Distance fade: the deck dissolves into haze as it approaches the horizon.
    density *= smoothstep(0.006, 0.09, h);

    // Thickness reads the field again on a ramp that does not move with cover,
    // mixed with a far coarser lookup carrying the kilometre-scale swell of the
    // deck — every octave in the field is finer than the deck itself, so alone it
    // gives texture and no form. Both are near-Gaussian about a half and spend
    // their contrast in the middle fifth of 0..1: read straight, four fifths of
    // the shading range is unreachable and the lid comes out one value whatever
    // it is made of, so the ramp reads an expanded copy instead.
    float swell = dot(n3, uCloudMix) / wsum;
    float body = clamp(0.5 + (mix(field, swell, 0.42) - 0.5) * 2.7, 0.0, 1.0);
    float thin = 1.0 - smoothstep(0.16, 0.86, body);

    // Light through the deck rather than past it. A lid does not hide the sun,
    // it diffuses it across tens of degrees: the bright patch where the sun
    // stands, and the sun half of the sky being lighter than the other, are most
    // of what separates a real overcast day from a flat fill. The old lobe was
    // tight enough to hide the whole patch inside the sun's own disc.
    float toward = max(dot(dir, uSunDir), 0.0);
    float through = (0.35 + 0.65 * thin)
      * (pow(toward, 1.3) * 0.30 + pow(toward, 5.0) * 0.42 + pow(toward, 24.0) * 0.52);
    float rim = pow(toward, 3.0) * thin;
    vec3 cloud = mix(uCloudDark, uCloudLit, clamp(0.06 + 0.88 * thin + 0.30 * rim, 0.0, 1.0));
    // A deck is brightest along the horizon, where the eye looks *along* its lit
    // base, and dimmest overhead, where it looks up into the deck's own shadow.
    // That inversion is the opposite of a clear sky's, and it is the one reading
    // that says "cloud" instead of "fill colour".
    cloud *= mix(1.46, 0.58, smoothstep(0.02, 0.66, h));
    cloud += uSunColour * uCloudGlow * through;
    col = mix(col, cloud, clamp(density, 0.0, 1.0));
  }

  // Aerial perspective. The dome has to arrive at exactly the fog colour on the
  // horizon line, because that is the value the terrain fades to; anything else
  // is a seam. Haze decides how far up the band reaches, never whether it closes.
  col = mix(col, uFogColour, 1.0 - smoothstep(0.0, mix(0.05, 0.55, uHaze), h));
  col += uFlash;

  // The dome writes linear radiance and lets the renderer tone map it with
  // everything else. Tone mapping here as well put the sky through the curve
  // twice, so it met the terrain at a different value and drew the very horizon
  // line the haze above exists to remove.
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---- precipitation shaders
//
// Both systems are one instanced draw with a fixed pool. Per frame the CPU
// writes a handful of uniforms and an instance count; no attribute is ever
// rewritten and nothing is allocated.

const RAIN_VERT = `
precision highp float;
attribute vec3 iBase;
attribute vec2 iRand;
uniform vec3 uCamPos;
uniform vec3 uBox;
uniform vec3 uDrift;
uniform vec3 uStreakVel;
uniform float uLength;
uniform float uWidth;
uniform float uOpacity;
uniform float uNearFade;
varying float vAlpha;
varying vec2 vUv;

// The narrowest a streak is allowed to appear, in radians. A drop is millimetres
// across, so past twenty metres its quad is thinner than a pixel: the rasteriser
// then samples it almost nowhere and the heaviest rain in the game drew nothing
// at all. Widening the far ones to a floor and taking the same factor back out
// of their alpha keeps the light they carry unchanged and makes them a veil
// rather than a flicker.
const float RAIN_MIN_ANGLE = 0.0016;

void main() {
  vec3 base = iBase * uBox;
  // Wrap the pool around the camera in world space: a drop leaves the box on one
  // side and re-enters on the other, so a fixed pool covers unbounded travel.
  vec3 rel = mod(base + uDrift - uCamPos + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 world = uCamPos + rel;

  vec4 mv = viewMatrix * vec4(world, 1.0);
  vec3 vel = (viewMatrix * vec4(uStreakVel, 0.0)).xyz;
  vec2 d = vel.xy;
  float dl = length(d);
  d = dl > 1e-4 ? d / dl : vec2(0.0, -1.0);
  vec2 perp = vec2(-d.y, d.x);
  float len = uLength * (0.55 + 0.9 * iRand.x);
  float depth = max(-mv.z, 0.05);
  float width = max(uWidth, depth * RAIN_MIN_ANGLE);
  mv.xy += d * (position.y * len) + perp * (position.x * width);

  float edge = max(max(abs(rel.x) / uBox.x, abs(rel.y) / uBox.y), abs(rel.z) / uBox.z) * 2.0;
  float dist = length(mv.xyz);
  vAlpha = uOpacity * (uWidth / width) * (1.0 - smoothstep(0.72, 1.0, edge))
    * smoothstep(0.0, uNearFade, dist) * (0.55 + 0.45 * iRand.y);
  vUv = position.xy + 0.5;
  gl_Position = projectionMatrix * mv;
}
`;

const RAIN_FRAG = `
precision highp float;
uniform vec3 uColour;
uniform vec3 uGlint;
uniform float uGlintAmount;
varying float vAlpha;
varying vec2 vUv;

void main() {
  // Squaring the cross profile left full alpha on the centre line alone, so a
  // streak already only a few pixels wide covered well under one of them and
  // read as nothing. A soft-shouldered ramp fills the middle of the quad and
  // skirts the edges — the shape water actually makes, and visible.
  float across = smoothstep(0.0, 0.55, 1.0 - abs(vUv.x * 2.0 - 1.0));
  float along = smoothstep(0.0, 0.30, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
  float a = across * along * vAlpha;
  if (a < 0.004) discard;
  vec3 c = uColour + uGlint * uGlintAmount * along;
  gl_FragColor = vec4(c, a);
}
`;

const SNOW_VERT = `
precision highp float;
attribute vec3 iBase;
attribute vec2 iRand;
uniform vec3 uCamPos;
uniform vec3 uBox;
uniform vec3 uDrift;
uniform float uTime;
uniform float uWobble;
uniform float uSize;
uniform float uOpacity;
uniform float uNearFade;
uniform vec3 uWindDir;
varying float vAlpha;
varying vec2 vUv;
varying float vShade;

void main() {
  vec3 base = iBase * uBox;
  vec3 rel = mod(base + uDrift - uCamPos + uBox * 0.5, uBox) - uBox * 0.5;
  // A flake does not fall, it tumbles: the flutter is what separates snow from
  // white rain, and it has to be per-flake or the whole field pulses together.
  // The three periods are deliberately incommensurate, so the path is a drifting
  // Lissajous that never closes rather than a circle every flake walks in step.
  float ph = iRand.x * 6.2831853;
  rel.x += sin(uTime * (0.7 + iRand.y) + ph) * uWobble;
  rel.z += cos(uTime * (0.55 + iRand.x * 0.8) + ph * 1.7) * uWobble;
  rel.y += sin(uTime * (0.41 + iRand.y * 0.6) + ph * 2.3) * uWobble * 0.45;
  rel += uWindDir * sin(uTime * 0.31 + ph * 0.5) * uWobble * 0.6;
  vec3 world = uCamPos + rel;

  vec4 mv = viewMatrix * vec4(world, 1.0);
  // Mostly small, occasionally large. A cubed uniform puts half the field under
  // a third of the mean, which is what snow looks like: a haze of fine flakes
  // with the odd near one crossing the frame. The flat distribution it replaces
  // gave every flake much the same size and the field read as a sprite sheet.
  float grade = iRand.y * iRand.y * iRand.y;
  float size = uSize * (0.22 + 2.1 * grade);
  // Tumble. A flake is a plate, not a bead: it turns edge on and all but
  // disappears, then opens out again. Collapsing one axis on a spin the flake
  // owns is what reads as tumbling.
  float spin = uTime * (0.8 + 2.2 * iRand.x) + ph;
  float face = 0.24 + 0.76 * abs(sin(spin));
  float ca = cos(spin * 0.6);
  float sa = sin(spin * 0.6);
  vec2 q = vec2(position.x * face, position.y) * size;
  mv.xy += vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);

  float edge = max(max(abs(rel.x) / uBox.x, abs(rel.y) / uBox.y), abs(rel.z) / uBox.z) * 2.0;
  float dist = length(mv.xyz);
  vAlpha = uOpacity * (1.0 - smoothstep(0.70, 1.0, edge)) * smoothstep(0.0, uNearFade, dist);
  vShade = 0.55 + 0.45 * iRand.x;
  vUv = position.xy + 0.5;
  gl_Position = projectionMatrix * mv;
}
`;

const SNOW_FRAG = `
precision highp float;
uniform vec3 uColour;
uniform vec3 uSkyColour;
varying float vAlpha;
varying vec2 vUv;
varying float vShade;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  // A Gaussian core, not a polynomial one: at the distances that matter a flake
  // is well outside the focal plane and has no edge to it at all. Subtracting
  // the profile's own value at the rim is what stops the truncation leaving a
  // faint ring, which is the tell that turns a soft flake back into a sprite.
  float a = (exp(-r * 4.2) - 0.0150) * 1.0152 * vAlpha;
  if (a < 0.004) discard;
  // Ice scatters almost everything it catches, so a flake is lit by the whole
  // sky rather than by the key — it stays bright even in the shadow of a bank.
  vec3 c = mix(uSkyColour, uColour, vShade);
  gl_FragColor = vec4(c, a);
}
`;

// ---- construction

const DEFAULTS = Object.freeze({
  seed: "opus-weather",
  // Pool against box, not either alone: what a driver sees is drops per cubic
  // metre near the camera. Nine thousand drops spread through a 46 m box is one
  // every six cubic metres, and a downpour photographed as clear air. The boxes
  // are sized so a full pool is a wall of water and a light shower is a few
  // flakes a second across the screen.
  rainPool: 12000,
  snowPool: 11000,
  rainBox: 30,
  rainBoxHeight: 18,
  snowBox: 38,
  snowBoxHeight: 22,
  skyRadius: 4000,
  cloudTextureSize: 192,
  shadowMapSize: 2048,
  shadowRange: 120,
  headlightOn: 0.18,
  headlightOff: 0.30,
  headlightDwell: 1.2,
  latitude: 46.5 * DEG,
  dayOfYear: 288,
  shutter: 0.022,
});

function makePrecipGeometry(THREE, pool, rng, quadWidth, quadHeight) {
  const geo = new THREE.InstancedBufferGeometry();
  const hw = quadWidth * 0.5;
  const hh = quadHeight * 0.5;
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array([
    -hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0,
  ]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const base = new Float32Array(pool * 3);
  const rand = new Float32Array(pool * 2);
  for (let i = 0; i < pool; i += 1) {
    base[i * 3] = rng.next();
    base[i * 3 + 1] = rng.next();
    base[i * 3 + 2] = rng.next();
    rand[i * 2] = rng.next();
    rand[i * 2 + 1] = rng.next();
  }
  geo.setAttribute("iBase", new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute("iRand", new THREE.InstancedBufferAttribute(rand, 2));
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return geo;
}

function buildSky(THREE, opts, cloudTex) {
  const uniforms = {
    uZenith: { value: new THREE.Color(0, 0, 0) },
    uHorizon: { value: new THREE.Color(0, 0, 0) },
    uGround: { value: new THREE.Color(0, 0, 0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColour: { value: new THREE.Color(1, 1, 1) },
    uSunIntensity: { value: 1 },
    uSunSize: { value: 0.0093 },
    uHalo: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonColour: { value: new THREE.Color(0.5, 0.6, 0.9) },
    uMoonIntensity: { value: 0 },
    uMoonPhase: { value: 0.5 },
    uStars: { value: 0 },
    uCloudTex: { value: cloudTex },
    uCloudMix: { value: new THREE.Vector4(0.8, 0.2, 0.3, 0.1) },
    uCloudLit: { value: new THREE.Color(1, 1, 1) },
    uCloudDark: { value: new THREE.Color(0.3, 0.3, 0.35) },
    uCloudCover: { value: 0.2 },
    uCloudOpacity: { value: 0.8 },
    uCloudSharp: { value: 2 },
    uCloudGlow: { value: 0 },
    uCloudAlt: { value: 2000 },
    uCloudScale: { value: 0.0003 },
    uCloudScroll: { value: new THREE.Vector2(0, 0) },
    uCamPos: { value: new THREE.Vector3() },
    uFlash: { value: 0 },
    uFogColour: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uHaze: { value: 0.2 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    // Tone mapped like every other surface in the scene: with the post chain on
    // the renderer's own curve is off and the composite does it, with the post
    // chain off the renderer does it here. Either way the sky and the terrain go
    // through exactly one, identical curve, which is what makes them meet.
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(opts.skyRadius, 48, 32), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = false;
  mesh.name = "weather.sky";
  return { mesh, material, uniforms };
}

function buildRain(THREE, opts, rng) {
  const geometry = makePrecipGeometry(THREE, opts.rainPool, rng, 1, 1);
  const uniforms = {
    uCamPos: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(opts.rainBox, opts.rainBoxHeight, opts.rainBox) },
    uDrift: { value: new THREE.Vector3() },
    uStreakVel: { value: new THREE.Vector3(0, -8, 0) },
    uLength: { value: 0.9 },
    uWidth: { value: 0.012 },
    uOpacity: { value: 0.55 },
    uNearFade: { value: 1.2 },
    uColour: { value: new THREE.Color(0.7, 0.75, 0.82) },
    uGlint: { value: new THREE.Color(1, 1, 1) },
    uGlintAmount: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 900;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.name = "weather.rain";
  return { mesh, geometry, material, uniforms, pool: opts.rainPool, count: 0 };
}

function buildSnow(THREE, opts, rng) {
  const geometry = makePrecipGeometry(THREE, opts.snowPool, rng, 1, 1);
  const uniforms = {
    uCamPos: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(opts.snowBox, opts.snowBoxHeight, opts.snowBox) },
    uDrift: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uWobble: { value: 0.35 },
    uSize: { value: 0.05 },
    uOpacity: { value: 0.85 },
    uNearFade: { value: 0.9 },
    uWindDir: { value: new THREE.Vector3(1, 0, 0) },
    uColour: { value: new THREE.Color(1, 1, 1) },
    uSkyColour: { value: new THREE.Color(0.7, 0.78, 0.9) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SNOW_VERT,
    fragmentShader: SNOW_FRAG,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 901;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.name = "weather.snow";
  return { mesh, geometry, material, uniforms, pool: opts.snowPool, count: 0 };
}

function buildLights(THREE, opts) {
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
  const r = opts.shadowRange;
  key.shadow.camera.left = -r;
  key.shadow.camera.right = r;
  key.shadow.camera.top = r;
  key.shadow.camera.bottom = -r;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = r * 6;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.03;
  key.name = "weather.key";

  const moon = new THREE.DirectionalLight(0x8899cc, 0);
  moon.castShadow = false;
  moon.name = "weather.moon";

  const fill = new THREE.HemisphereLight(0x88aacc, 0x33322c, 1);
  fill.name = "weather.fill";

  // A dim light from below the horizon standing in for the ground bounce that a
  // single hemisphere term cannot shape — it is what stops a car's sills going
  // solid black on a bright gravel road.
  const bounce = new THREE.DirectionalLight(0x998877, 0.2);
  bounce.castShadow = false;
  bounce.name = "weather.bounce";

  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  ambient.name = "weather.ambient";

  return { key, moon, fill, bounce, ambient };
}

export function createWeather(THREE, scene, preset, options) {
  const three = THREE || THREE_DEFAULT;
  let presetArg = preset;
  let optsArg = options;
  if (preset && typeof preset === "object" && !preset.id && !preset.sunElevation) {
    optsArg = preset;
    presetArg = preset.preset;
  }
  const opts = { ...DEFAULTS, ...(optsArg || {}) };
  const start = resolvePreset(presetArg) || WEATHER_PRESETS[0];
  const rng = makeRng(opts.seed);

  const cloudTex = buildCloudTexture(three, opts.cloudTextureSize, rng.fork("cloud").seed);

  const root = new three.Group();
  root.name = "weather";
  root.matrixAutoUpdate = false;

  const sky = buildSky(three, opts, cloudTex);
  const rain = buildRain(three, opts, rng.fork("rain"));
  const snow = buildSnow(three, opts, rng.fork("snow"));
  const lights = buildLights(three, opts);

  root.add(sky.mesh, rain.mesh, snow.mesh,
    lights.key, lights.key.target, lights.moon, lights.moon.target,
    lights.fill, lights.bounce, lights.bounce.target, lights.ambient);
  if (scene) scene.add(root);

  const fog = new three.Fog(0x808080, 100, 2000);
  if (scene) scene.fog = fog;

  const w = {
    THREE: three,
    scene: scene || null,
    opts,
    rng,
    root,
    sky,
    rain,
    snow,
    lights,
    fog,
    cloudTexture: cloudTex,

    // Blend state: A -> B over blendTime, plus an optional stage timeline.
    from: copyPreset(start, makePresetState()),
    to: copyPreset(start, makePresetState()),
    current: copyPreset(start, makePresetState()),
    blend: 1,
    blendTime: 0,
    timeline: null,
    timelineMode: "time",
    progress: 0,

    time: 0,
    timeOfDay: 9,
    useClock: false,
    clockRate: 0,
    latitude: opts.latitude,
    dayOfYear: opts.dayOfYear,

    // Derived, read by render/hud/physics.
    metrics: {
      sunElevation: 0,
      sunAzimuth: 0,
      lightLevel: 1,
      headlightDemand: 1,
      keyIntensity: 0,
      skyLuminance: 0,
      headlights: false,
      wet: 0,
      standingWater: 0,
      snowCover: 0,
      flash: 0,
      isNight: false,
    },
    headlightState: { on: false, smoothed: 1, dwell: 0, changes: 0 },
    lens: {
      chaseDrops: 0,
      glassDrops: 0,
      streakBias: 0,
      wiperMode: 0,
      wiperPhase: 0,
      wiperSweep: 0,
      demand: 0,
      glassFog: 0,
      sprayFilm: 0,
      autoWipers: true,
    },
    spray: { leadDistance: Infinity, leadSpeed: 0, density: 0, plume: 0 },
    wet: { film: 0, standing: 0, snowCover: 0 },
    lightning: { timer: 0, flash: 0, rng: rng.fork("lightning") },
    motion: { x: 0, y: 0, z: 0, speed: 0, has: false, override: false },
    windPhase: 0,

    // Scratch, allocated once. Everything below is reused every frame.
    _sunDir: new three.Vector3(0, 1, 0),
    _moonDir: new three.Vector3(0, -1, 0),
    _camPos: new three.Vector3(),
    _prevCam: new three.Vector3(),
    _hasPrevCam: false,
    _tmp: new three.Vector3(),
    _sunTint: [0, 0, 0],
    _zenith: [0, 0, 0],
    _horizon: [0, 0, 0],
    _groundCol: [0, 0, 0],
    _hazeCol: [0, 0, 0],
    _solar: { elevation: 0, azimuth: 0 },
    _surfaceMod: { wetness: 0, gripScale: 1, visibility: 1000, aquaplaneRisk: 0, snowCover: 0, standingWater: 0 },
    _lensOut: {
      dropletCoverage: 0, glassCoverage: 0, streakBias: 0,
      wiperSweep: 0, wiperArc: 0, wiperMode: 0, glassFog: 0, sprayFilm: 0,
    },
    _summary: {
      id: "", name: "", precip: "none", precipRate: 0, temperature: 0,
      windSpeed: 0, windDirection: 0, visibility: 0, wetness: 0, headlights: false,
    },
  };

  applyState(w, 0);
  // Seed the headlight filter from the conditions rather than from daylight, or
  // a night stage would start with the lights off and switch them on in view.
  w.headlightState.smoothed = w.metrics.headlightDemand;
  w.headlightState.on = w.metrics.headlightDemand < opts.headlightOn;
  w.metrics.headlights = w.headlightState.on;
  return w;
}

// presetById throws on an unknown id, which is right for a programming error but
// wrong at the point a stage loads: one mistyped datum in the stage book would
// otherwise take the whole game down rather than costing that stage its sky.
// Eleven of the twelve book entries once carried human labels ("sea fog",
// "squalls") instead of ids, and every one of those stages failed to start.
export const FALLBACK_PRESET_ID = "overcast";

function resolvePreset(p) {
  if (!p) return null;
  if (typeof p !== "string") return p;
  const known = PRESET_BY_ID.get(p);
  if (known) return known;
  console.warn(`weather: unknown preset "${p}", falling back to ${FALLBACK_PRESET_ID}`);
  return presetById(FALLBACK_PRESET_ID);
}

// Every stage builds a rig and nothing but this hands it back. Detaching the
// root stops the lights compounding but frees no GPU memory: the dome geometry,
// three shader programs, the cloud texture, both precipitation pools and — much
// the largest of them — the key light's shadow map all stay resident until this
// runs. Safe to call twice, and safe to call on a rig that was never added to a
// scene, because the caller that has just lost a stage should never have to
// reason about which of those it is.
export function disposeWeather(w) {
  if (!w || w.disposed) return w;
  w.disposed = true;
  if (w.scene) {
    w.scene.remove(w.root);
    if (w.scene.fog === w.fog) w.scene.fog = null;
  }
  w.sky.mesh.geometry.dispose();
  w.sky.material.dispose();
  w.rain.geometry.dispose();
  w.rain.material.dispose();
  w.snow.geometry.dispose();
  w.snow.material.dispose();
  w.cloudTexture.dispose();
  // A shadow map is a depth target the size of opts.shadowMapSize squared —
  // four megatexels at the default — and removing its light from the scene does
  // not release it.
  const L = w.lights;
  for (const light of [L.key, L.moon, L.bounce]) {
    if (light.shadow) light.shadow.dispose();
  }
  // Drop the rig's own child references too: a caller that keeps the handle for
  // its last metrics should not thereby keep the whole scene graph alive.
  w.root.clear();
  w.scene = null;
  return w;
}

// ---- driving the conditions

export function setWeather(w, preset, blendSeconds) {
  const target = resolvePreset(preset);
  if (!target) return w;
  copyPreset(w.current, w.from);
  copyPreset(target, w.to);
  w.blendTime = Math.max(0, blendSeconds || 0);
  w.blend = w.blendTime > 0 ? 0 : 1;
  w.timeline = null;
  if (w.blend >= 1) copyPreset(w.to, w.current);
  applyState(w, 0);
  return w;
}

// A stage timeline: [{ at, preset, ease }] with `at` in seconds, or in 0..1 of
// stage progress when mode is "progress". Between keys every numeric field is
// interpolated and every colour crosses in Oklab, so rain arriving is a
// continuous change in light, grip and sight-line rather than a cut.
export function setWeatherTimeline(w, keys, mode) {
  if (!keys || keys.length === 0) {
    w.timeline = null;
    return w;
  }
  const built = keys
    .map((k) => ({ at: k.at ?? 0, preset: resolvePreset(k.preset), ease: k.ease || "smooth" }))
    .filter((k) => k.preset)
    .sort((a, b) => a.at - b.at);
  w.timeline = built.length ? built : null;
  w.timelineMode = mode === "progress" ? "progress" : "time";
  if (w.timeline) {
    copyPreset(w.timeline[0].preset, w.from);
    copyPreset(w.timeline[0].preset, w.to);
    w.blend = 1;
    evaluateTimeline(w);
    applyState(w, 0);
  }
  return w;
}

export function setStageProgress(w, p) {
  w.progress = saturate(p);
  return w;
}

export function setTimeOfDay(w, hours, opts) {
  w.timeOfDay = ((hours % 24) + 24) % 24;
  w.useClock = true;
  if (opts) {
    if (typeof opts.latitude === "number") w.latitude = opts.latitude;
    if (typeof opts.dayOfYear === "number") w.dayOfYear = opts.dayOfYear;
    if (typeof opts.rate === "number") w.clockRate = opts.rate;
  }
  solarPosition(w.timeOfDay, w.latitude, w.dayOfYear, w._solar);
  w.current.sunElevation = w._solar.elevation;
  w.current.sunAzimuth = w._solar.azimuth;
  applyState(w, 0);
  return w;
}

// Force the sun to an explicit elevation, bypassing the clock. Used by the
// lighting tests and by stage authors who want a fixed look.
export function setSunElevation(w, elevation, azimuth) {
  w.useClock = false;
  w.current.sunElevation = elevation;
  if (typeof azimuth === "number") w.current.sunAzimuth = azimuth;
  applyState(w, 0);
  return w;
}

export function setWeatherMotion(w, vx, vy, vz) {
  w.motion.x = vx;
  w.motion.y = vy;
  w.motion.z = vz;
  w.motion.speed = Math.hypot(vx, vy, vz);
  w.motion.override = true;
  return w;
}

export function setSprayLead(w, distance, speed) {
  w.spray.leadDistance = distance;
  w.spray.leadSpeed = speed;
  return w;
}

// 0 off, 1 intermittent, 2 slow, 3 fast; anything negative hands them back to
// the automatic rain sensor.
export function setWiperMode(w, mode) {
  if (mode < 0) {
    w.lens.autoWipers = true;
    return w;
  }
  w.lens.wiperMode = clamp(mode | 0, 0, 3);
  w.lens.autoWipers = false;
  return w;
}

function easeKey(kind, t) {
  if (kind === "linear") return t;
  if (kind === "late") return t * t;
  if (kind === "early") return 1 - (1 - t) * (1 - t);
  return t * t * (3 - 2 * t);
}

function evaluateTimeline(w) {
  const keys = w.timeline;
  const at = w.timelineMode === "progress" ? w.progress : w.time;
  if (at <= keys[0].at) {
    copyPreset(keys[0].preset, w.current);
    return;
  }
  const last = keys[keys.length - 1];
  if (at >= last.at) {
    copyPreset(last.preset, w.current);
    return;
  }
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].at <= at) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.at - a.at;
  const t = span > 1e-9 ? (at - a.at) / span : 1;
  lerpPreset(a.preset, b.preset, easeKey(b.ease, saturate(t)), w.current);
}

// ---- headlights
//
// A Schmitt trigger on a damped light level, plus a minimum dwell. Raw light
// level flickers hard — a lightning flash, a break in the cloud, the sun coming
// out from behind a ridge — and headlights that strobe would be intolerable.

export function stepHeadlights(state, lightLevel, dt, onAt, offAt, dwell) {
  const lo = onAt ?? DEFAULTS.headlightOn;
  const hi = offAt ?? DEFAULTS.headlightOff;
  const hold = dwell ?? DEFAULTS.headlightDwell;
  state.smoothed = damp(state.smoothed, saturate(lightLevel), 1.6, dt);
  state.dwell += dt;
  if (state.dwell < hold) return state.on;
  if (!state.on && state.smoothed < lo) {
    state.on = true;
    state.dwell = 0;
    state.changes += 1;
  } else if (state.on && state.smoothed > hi) {
    state.on = false;
    state.dwell = 0;
    state.changes += 1;
  }
  return state.on;
}

// ---- per-frame update

function applyState(w, dt) {
  const c = w.current;
  const m = w.metrics;

  const elev = c.sunElevation;
  const sinE = Math.sin(elev);
  m.sunElevation = elev;
  m.sunAzimuth = c.sunAzimuth;

  sunDirection(elev, c.sunAzimuth, w._sunDir);
  // The moon runs the anti-solar arc with a slow drift, so at night it is
  // reliably somewhere useful rather than always dead behind the sun.
  sunDirection(-elev * 0.82 + 0.28, wrapAngle(c.sunAzimuth + Math.PI + 0.4), w._moonDir);

  const gate = dayGate(sinE);
  const scatter = skyScatter(sinE);
  sunlightColour(elev, c.turbidity, w._sunTint);

  const cloudBlock = 1 - c.cloudCover * (0.30 + 0.62 * c.cloudOpacity);
  const sunLum = 0.2126 * w._sunTint[0] + 0.7152 * w._sunTint[1] + 0.0722 * w._sunTint[2];
  const keyIntensity = c.sunIntensity * gate * sunLum * cloudBlock;

  // Sky gradient: a physical Rayleigh base scaled by scatter, then pulled toward
  // the preset's authored stops. The tints carry no brightness of their own, so
  // the dome's luminance stays a monotonic function of elevation whatever the
  // preset asks for.
  const bright = c.skyBrightness;
  const wt = c.skyTintWeight;
  const zk = scatter * bright * 0.55;
  const hk = scatter * bright * 1.25;
  const gk = scatter * bright * 0.22;
  for (let i = 0; i < 3; i += 1) {
    const zBase = ZENITH_TINT[i] * zk;
    const hBase = HORIZON_TINT[i] * hk;
    const gBase = GROUND_TINT[i] * gk;
    w._zenith[i] = zBase + (c.skyZenith[i] - zBase) * wt;
    w._horizon[i] = hBase + (c.skyHorizon[i] - hBase) * wt;
    w._groundCol[i] = gBase + (c.skyGround[i] - gBase) * wt;
  }
  m.skyLuminance = luminance(w._zenith);

  // Lights: repointed and recoloured, never rebuilt.
  const L = w.lights;
  const keyDist = w.opts.shadowRange * 2.2;
  L.key.position.set(w._sunDir.x * keyDist, Math.max(w._sunDir.y, 0.05) * keyDist, w._sunDir.z * keyDist);
  L.key.target.position.set(0, 0, 0);
  L.key.color.setRGB(
    c.sunColour[0] * w._sunTint[0],
    c.sunColour[1] * w._sunTint[1],
    c.sunColour[2] * w._sunTint[2],
  );
  L.key.intensity = keyIntensity;
  // Whether this light is worth a shadow pass is weather's call; whether the
  // machine can afford one is the renderer's. Writing castShadow outright here
  // ran every frame and so silently overrode the quality setting a frame after
  // it was made — the low preset rendered a full depth pass anyway.
  L.key.userData.weatherWantsShadow = c.shadowStrength > 0.12 && keyIntensity > 0.05;
  L.key.castShadow = L.key.userData.weatherWantsShadow && w.shadowGate !== false;

  const moonUp = saturate(w._moonDir.y * 4);
  const moonI = c.moonIntensity * moonUp * (1 - gate) * cloudBlock;
  L.moon.position.set(w._moonDir.x * keyDist, Math.max(w._moonDir.y, 0.05) * keyDist, w._moonDir.z * keyDist);
  L.moon.target.position.set(0, 0, 0);
  L.moon.color.setRGB(c.moonColour[0], c.moonColour[1], c.moonColour[2]);
  L.moon.intensity = moonI;

  L.fill.color.setRGB(c.hemiSky[0], c.hemiSky[1], c.hemiSky[2]);
  L.fill.groundColor.setRGB(c.hemiGround[0], c.hemiGround[1], c.hemiGround[2]);
  L.fill.intensity = c.hemiIntensity * (0.28 + 0.72 * Math.max(scatter, moonI * 0.5)) + w.lightning.flash * 0.8;

  // Above the ground, not below it. At y = -12 every up-facing surface had
  // N.L < 0, so the bounce term lit nothing at all on the road or the terrain —
  // on overcast that was 17% of the rig doing no work where it mattered. It is
  // opposite the sun and low, which is where a ground bounce comes from.
  L.bounce.position.set(-w._sunDir.x * 40, 9, -w._sunDir.z * 40);
  L.bounce.target.position.set(0, 0, 0);
  L.bounce.color.setRGB(c.bounceColour[0], c.bounceColour[1], c.bounceColour[2]);
  L.bounce.intensity = c.bounceIntensity * (0.2 + 0.8 * scatter);

  L.ambient.color.setRGB(c.hemiSky[0], c.hemiSky[1], c.hemiSky[2]);
  L.ambient.intensity = c.ambientIntensity + w.lightning.flash * 0.6;

  // Fog. Linear fog derived from visibility keeps one object alive for the whole
  // race; the authored near/far only shape where inside that range it starts.
  //
  // Aerial perspective, not a draw-distance cutoff. Visibility is the range at
  // which contrast is down to a twentieth — optical depth three — so extinction
  // is 1 - exp(-3d/vis) and is three fifths built at three tenths of the
  // sight-line. Fitting the straight ramp there ends it at about half. Ending it
  // *past* the visibility, as it did, left a two-kilometre ridge at nearly full
  // albedo: measured 81,89,76 one pixel under a 204,203,210 horizon, a step of
  // 123 levels, which is the hard line the fog exists to hide. The floor is for
  // the two white-out presets, where the fit falls inside the road ahead and
  // neither has a horizon to give away.
  const vis = c.visibility;
  const nearFrac = clamp(c.fogNear / Math.max(c.fogFar, 1), 0.002, 0.6);
  // Half the sight-line was still too far to make a hill recede: a ridge a
  // kilometre out on an eight-kilometre day came back only a quarter hazed and
  // stood at a hard edge against the dome. A third of it puts that same ridge
  // past a third of the ramp, which is where a hill starts to read as distant
  // rather than as a nearby hill painted darker.
  w.fog.far = Math.max(vis * 0.34, FOG_FLOOR);
  // The best fit puts near at zero; it is held off the camera only so the car
  // does not drive inside its own haze, which is why it is a fraction of a
  // fraction rather than the authored distance.
  w.fog.near = w.fog.far * nearFrac * 0.4;

  // One colour for both sides of the horizon: the terrain fades to it and the
  // dome arrives at it, so there is no line to see. Hue comes from the preset,
  // level from the sky — an authored fog colour is a daylight value, and taken
  // literally it leaves a bright band lying along the ground at dusk under a
  // dome that has already gone dark.
  const horL = luminance(w._horizon);
  for (let i = 0; i < 3; i += 1) {
    w._hazeCol[i] = c.fogColour[i] + (w._horizon[i] - c.fogColour[i]) * 0.35;
  }
  const hazeL = luminance(w._hazeCol);
  const level = luminance(c.fogColour) * 0.15 + horL * 0.85;
  const hazeK = hazeL > 1e-6 ? level / hazeL : 0;
  for (let i = 0; i < 3; i += 1) w._hazeCol[i] *= hazeK;
  w.fog.color.setRGB(w._hazeCol[0], w._hazeCol[1], w._hazeCol[2]);

  // Sky uniforms.
  const su = w.sky.uniforms;
  su.uZenith.value.setRGB(w._zenith[0], w._zenith[1], w._zenith[2]);
  su.uHorizon.value.setRGB(w._horizon[0], w._horizon[1], w._horizon[2]);
  su.uGround.value.setRGB(w._groundCol[0], w._groundCol[1], w._groundCol[2]);
  su.uSunDir.value.copy(w._sunDir);
  su.uSunColour.value.setRGB(
    c.sunColour[0] * w._sunTint[0],
    c.sunColour[1] * w._sunTint[1],
    c.sunColour[2] * w._sunTint[2],
  );
  su.uSunIntensity.value = c.sunIntensity * gate * cloudBlock * 0.42;
  su.uSunSize.value = c.sunAngularSize;
  su.uHalo.value = c.haloStrength;
  su.uMoonDir.value.copy(w._moonDir);
  su.uMoonColour.value.setRGB(c.moonColour[0], c.moonColour[1], c.moonColour[2]);
  su.uMoonIntensity.value = c.moonIntensity * moonUp * (1 - gate);
  su.uMoonPhase.value = c.moonPhase;
  su.uStars.value = c.starIntensity * (1 - gate) * (1 - c.cloudCover * 0.85);
  const cw = cloudWeights(c.cloudType);
  su.uCloudMix.value.set(cw[0], cw[1], cw[2], cw[3]);
  su.uCloudLit.value.setRGB(c.cloudLit[0], c.cloudLit[1], c.cloudLit[2]);
  su.uCloudDark.value.setRGB(c.cloudDark[0], c.cloudDark[1], c.cloudDark[2]);
  su.uCloudCover.value = c.cloudCover;
  su.uCloudOpacity.value = c.cloudOpacity;
  su.uCloudSharp.value = c.cloudSharpness;
  // Sunlight transmitted through the deck. Deliberately not scaled by the same
  // cloudBlock that kills the key light: a lid stops the beam and still passes a
  // bright patch, and taking both away with one factor is what left the overcast
  // presets with no sun anywhere in the sky. It rides on the deck's own lit
  // colour so the patch always reads as that cloud lit from behind.
  su.uCloudGlow.value = gate * luminance(c.cloudLit) * (1.05 + 0.60 * (1 - c.cloudOpacity));
  su.uCloudAlt.value = c.cloudAltitude;
  su.uCloudScale.value = c.cloudScale;
  su.uFlash.value = w.lightning.flash;
  su.uFogColour.value.setRGB(w._hazeCol[0], w._hazeCol[1], w._hazeCol[2]);
  su.uHaze.value = saturate(0.12 + 0.6 * (1 - smoothstep(300, 12000, vis)));

  // Light level for the headlight decision. Deliberately sun and sky only: no
  // moon is ever bright enough to drive a stage by, and folding a setting moon
  // in would make the measure fall as the sun rises.
  const lightLevel = saturate(
    keyIntensity * 0.30
    + luminance(w._zenith) * 1.5
    + w.lightning.flash * 0.5,
  );
  m.lightLevel = lightLevel;
  m.keyIntensity = keyIntensity;
  m.isNight = gate < 0.02;

  // You run lights when you cannot be seen as well as when you cannot see: a
  // white-out and a hill fog are both blinding and both bright, so visibility
  // caps the demand independently of how much light is falling.
  m.headlightDemand = Math.min(lightLevel, saturate(vis / 8000));

  if (dt > 0) {
    m.headlights = stepHeadlights(
      w.headlightState, m.headlightDemand, dt,
      w.opts.headlightOn, w.opts.headlightOff, w.opts.headlightDwell,
    );
  }
}

const PRECIP_SCRATCH = { rain: 0, snow: 0 };

function updatePrecipitation(w, dt) {
  const c = w.current;
  const su = w.sky.uniforms;

  // Wind vector, with a slow gust modulation that both precipitation systems and
  // the cloud scroll share so they never disagree about which way the air moves.
  w.windPhase += dt * (0.35 + c.gustiness * 1.4);
  const gust = 1 + c.gustiness * 0.55 * Math.sin(w.windPhase) * Math.sin(w.windPhase * 0.37 + 1.1);
  const windSpeed = c.windSpeed * gust;
  const wx = Math.sin(c.windDirection) * windSpeed;
  const wz = Math.cos(c.windDirection) * windSpeed;

  su.uCloudScroll.value.x += dt * wx * c.cloudScale * c.cloudSpeed * 12;
  su.uCloudScroll.value.y += dt * wz * c.cloudScale * c.cloudSpeed * 12;
  su.uCamPos.value.copy(w._camPos);

  const rateNorm = saturate(c.precipRate / 55);
  // Precipitation has no colour of its own — a drop is a lens on the sky and a
  // flake is ice returning whatever light is falling — so both take their level
  // from the scene's own haze rather than from a literal grey. A fixed value is
  // a grey smear at noon and a white line at night, which is what both were.
  const skyLevel = luminance(w._hazeCol);

  // Rain. Density follows the rate and the speed both: a car at 160 sweeps
  // through far more air per second than one standing still, and the screen
  // should fill up accordingly.
  const R = w.rain;
  const rainRate = rateNorm * c.precipRainMix;
  const sweep = 1 + 0.45 * saturate(w.motion.speed / 45);
  R.count = Math.min(R.pool, Math.floor(R.pool * rainRate * sweep));
  R.geometry.instanceCount = R.count;
  R.mesh.visible = R.count > 0;
  if (R.count > 0) {
    const ru = R.uniforms;
    const fall = -c.fallSpeed * (0.7 + 0.6 * c.dropSize);
    ru.uDrift.value.x += wx * dt;
    ru.uDrift.value.y += fall * dt;
    ru.uDrift.value.z += wz * dt;
    // Apparent velocity is what the camera sees: fall plus wind minus the car's
    // own motion. That difference is what makes rain streak backwards past you
    // instead of sitting still on the screen, and it is the whole trick.
    const vx = wx - w.motion.x;
    const vy = fall - w.motion.y;
    const vz = wz - w.motion.z;
    ru.uStreakVel.value.set(vx, vy, vz);
    const rel = Math.hypot(vx, vy, vz);
    ru.uLength.value = clamp(rel * w.opts.shutter * (0.6 + 0.5 * c.dropSize), 0.10, 3.2);
    ru.uWidth.value = 0.010 + 0.022 * c.dropSize;
    ru.uOpacity.value = 0.20 + 0.40 * rainRate;
    const dropLit = clamp(0.10 + 2.0 * skyLevel, 0.06, 0.75);
    ru.uColour.value.setRGB(
      c.precipColour[0] * dropLit, c.precipColour[1] * dropLit, c.precipColour[2] * dropLit,
    );
    ru.uGlint.value.setRGB(
      c.sunColour[0] * w._sunTint[0], c.sunColour[1] * w._sunTint[1], c.sunColour[2] * w._sunTint[2],
    );
    ru.uGlintAmount.value = 0.35 * saturate(w.metrics.keyIntensity);
    ru.uCamPos.value.copy(w._camPos);
  }

  // Snow
  const S = w.snow;
  const snowRate = rateNorm * c.precipSnowMix;
  S.count = Math.floor(S.pool * snowRate);
  S.geometry.instanceCount = S.count;
  S.mesh.visible = S.count > 0;
  if (S.count > 0) {
    const nu = S.uniforms;
    const fall = -c.fallSpeed * (0.5 + 0.4 * c.dropSize);
    // Flakes are light enough that the wind carries them almost completely, and
    // they are slow enough that the car's own motion dominates near the screen.
    nu.uDrift.value.x += (wx * 1.15 - w.motion.x * 0.12) * dt;
    nu.uDrift.value.y += fall * dt;
    nu.uDrift.value.z += (wz * 1.15 - w.motion.z * 0.12) * dt;
    nu.uTime.value += dt;
    nu.uWobble.value = 0.15 + 0.55 * (1 - saturate(windSpeed / 22));
    // uSize is the largest a flake gets, not the typical one: the vertex shader
    // grades the pool from a fifth of this to twice it, so the mean lands near
    // three quarters.
    nu.uSize.value = 0.012 + 0.028 * c.dropSize;
    nu.uOpacity.value = 0.20 + 0.40 * snowRate;
    const wl = Math.hypot(wx, wz) || 1;
    nu.uWindDir.value.set(wx / wl, 0, wz / wl);
    const flakeLit = clamp(0.06 + 1.9 * skyLevel, 0.05, 1.0);
    nu.uColour.value.setRGB(
      c.precipColour[0] * flakeLit, c.precipColour[1] * flakeLit, c.precipColour[2] * flakeLit,
    );
    nu.uSkyColour.value.setRGB(
      w._hazeCol[0] * 1.6, w._hazeCol[1] * 1.6, w._hazeCol[2] * 1.6,
    );
    nu.uCamPos.value.copy(w._camPos);
  }

  PRECIP_SCRATCH.rain = rainRate;
  PRECIP_SCRATCH.snow = snowRate;
  return PRECIP_SCRATCH;
}

function updateWater(w, dt, rainRate, snowRate) {
  const c = w.current;
  const wet = w.wet;
  const speed = w.motion.speed;

  // Wetting is fast, drying is slow and depends on sun, wind and air temperature
  // — which is why a shower early on a long stage still costs you at the finish.
  const wetTarget = c.roadWetness;
  const wetRate = rainRate > 0.01 ? 0.22 + 1.2 * rainRate : 0;
  // Roughly a minute and a half to dry out under a hard sun, several minutes in
  // dull air — slow enough that an early shower still costs you at the finish.
  const dryRate = (0.0015
    + 0.0080 * saturate(w.metrics.keyIntensity * 0.5)
    + 0.0015 * saturate(c.windSpeed / 20)
    + 0.0030 * saturate((c.temperature - 4) / 26));
  if (wet.film < wetTarget) wet.film = Math.min(wetTarget, wet.film + (wetRate + 0.05) * dt);
  else wet.film = Math.max(wetTarget * 0.35, wet.film - dryRate * dt);
  wet.film = saturate(wet.film);

  // Standing water needs sustained rain: puddles fill behind the film.
  const standTarget = saturate(c.puddleChance * (0.3 + 0.7 * wet.film));
  wet.standing = damp(wet.standing, standTarget, rainRate > 0.01 ? 0.35 : 0.06, dt);

  const melt = saturate((c.temperature - 0.5) / 6);
  const snowTarget = saturate(snowRate * 1.4) * (1 - melt);
  wet.snowCover = damp(wet.snowCover, snowTarget, snowRate > 0.01 ? 0.28 : 0.09, dt);

  w.metrics.wet = wet.film;
  w.metrics.standingWater = wet.standing;
  w.metrics.snowCover = wet.snowCover;

  // Spray from a car ahead: a wall of water that arrives inside about 60 m and
  // is worst when it is wettest and they are quickest.
  const d = w.spray.leadDistance;
  const near = Number.isFinite(d) ? saturate(1 - d / 60) : 0;
  w.spray.density = near * saturate(wet.film * 1.2) * saturate(w.spray.leadSpeed / 25);
  // The car's own plume, which the chase camera sits directly behind.
  w.spray.plume = saturate(wet.film * 1.1) * saturate(speed / 30);
}

function updateLens(w, dt, rainRate) {
  const c = w.current;
  const lens = w.lens;
  const speed = w.motion.speed;

  // Airflow strips water off an exposed chase lens, so a car at speed keeps a
  // usable view and a car stopped in a downpour does not. The windscreen keeps
  // everything it catches until a blade takes it away.
  const hit = rainRate * (0.9 + 0.9 * saturate(speed / 35)) + w.spray.density * 0.7 + w.spray.plume * 0.25;
  const airflow = 0.6 + 2.4 * saturate(speed / 40);
  lens.chaseDrops = saturate(lens.chaseDrops + (hit * 0.9 - lens.chaseDrops * airflow) * dt);
  lens.glassDrops = saturate(lens.glassDrops + (hit - lens.glassDrops * 0.09) * dt);
  lens.streakBias = damp(lens.streakBias, saturate(speed / 45), 1.2, dt);

  // Auto-wipers follow the rate of arrival, not the instantaneous coverage: a
  // blade that has just cleared the glass would otherwise switch itself off.
  lens.demand = damp(lens.demand, saturate(hit * 1.6), 0.6, dt);
  if (lens.autoWipers) {
    const need = lens.demand;
    lens.wiperMode = need > 0.55 ? 3 : need > 0.28 ? 2 : need > 0.06 ? 1 : 0;
  }
  const period = lens.wiperMode === 3 ? 0.55 : lens.wiperMode === 2 ? 0.9 : lens.wiperMode === 1 ? 2.6 : 0;
  if (period > 0) {
    const prev = lens.wiperPhase;
    lens.wiperPhase = (lens.wiperPhase + dt / period) % 1;
    // Intermittent parks the blade for most of its period; the sweep itself is
    // always the same speed, which is what makes the wipe read as mechanical.
    const sweepFrac = lens.wiperMode === 1 ? 0.34 : 1;
    const p = saturate(lens.wiperPhase / sweepFrac);
    lens.wiperSweep = p < 1 ? Math.sin(p * Math.PI) : 0;
    if (lens.wiperPhase < prev || (prev < 0.5 * sweepFrac && lens.wiperPhase >= 0.5 * sweepFrac)) {
      lens.glassDrops = Math.max(0, lens.glassDrops - 0.55);
    }
  } else {
    lens.wiperPhase = 0;
    lens.wiperSweep = 0;
  }

  // Misting is worst when it is cold outside and wet inside and you are slow.
  const mistTarget = saturate(c.glassFogging * (1 - saturate(speed / 30)) * saturate((14 - c.temperature) / 22 + 0.35));
  lens.glassFog = damp(lens.glassFog, mistTarget, 0.25, dt);
  lens.sprayFilm = damp(lens.sprayFilm, w.spray.density, 2.5, dt);
}

function updateLightning(w, dt) {
  const lg = w.lightning;
  const rate = w.current.lightningRate;
  lg.flash = Math.max(0, lg.flash - dt * 7.5);
  if (rate <= 0) {
    lg.timer = 0;
    return;
  }
  lg.timer -= dt;
  if (lg.timer <= 0) {
    // Deterministic strikes: same seed, same storm, so a replay lights up on the
    // same corner as the run it recorded.
    lg.timer = lg.rng.range(0.4, 2.2) / rate;
    lg.flash = lg.rng.range(0.35, 1.15) * saturate(rate * 2);
  }
}

export function stepWeather(w, camera, dt) {
  const step = clamp(dt || 0, 0, 0.25);
  w.time += step;

  if (camera) {
    if (camera.parent && camera.matrixWorld) w._camPos.setFromMatrixPosition(camera.matrixWorld);
    else if (camera.position) w._camPos.copy(camera.position);
    if (!w.motion.override && step > 1e-5 && w._hasPrevCam) {
      const inv = 1 / step;
      // Lightly damped: a chase camera's own spring would otherwise show up as
      // rain jitter every time the car lands.
      w.motion.x = damp(w.motion.x, (w._camPos.x - w._prevCam.x) * inv, 12, step);
      w.motion.y = damp(w.motion.y, (w._camPos.y - w._prevCam.y) * inv, 12, step);
      w.motion.z = damp(w.motion.z, (w._camPos.z - w._prevCam.z) * inv, 12, step);
      w.motion.speed = Math.hypot(w.motion.x, w.motion.y, w.motion.z);
    }
    // Always track the previous position, even on an overridden frame, or the
    // frame after an override would derive velocity from a stale sample.
    w._prevCam.copy(w._camPos);
    w._hasPrevCam = true;
    w.sky.mesh.position.copy(w._camPos);
    w.sky.mesh.updateMatrix();
  }
  w.motion.override = false;

  if (w.useClock && w.clockRate !== 0) {
    w.timeOfDay = ((w.timeOfDay + w.clockRate * step / 3600) % 24 + 24) % 24;
  }

  if (w.timeline) {
    evaluateTimeline(w);
  } else if (w.blend < 1) {
    w.blend = w.blendTime > 0 ? saturate(w.blend + step / w.blendTime) : 1;
    lerpPreset(w.from, w.to, smoothstep(0, 1, w.blend), w.current);
  }

  if (w.useClock) {
    solarPosition(w.timeOfDay, w.latitude, w.dayOfYear, w._solar);
    w.current.sunElevation = w._solar.elevation;
    w.current.sunAzimuth = w._solar.azimuth;
  }

  updateLightning(w, step);
  applyState(w, step);
  const p = updatePrecipitation(w, step);
  updateWater(w, step, p.rain, p.snow);
  updateLens(w, step, p.rain);
  return w;
}

// ---- what the rest of the game reads

export function weatherSurfaceModifier(w) {
  const out = w._surfaceMod;
  const c = w.current;
  const wet = w.wet;
  out.wetness = wet.film;
  out.standingWater = wet.standing;
  out.snowCover = wet.snowCover;
  // A global multiplier on top of whatever the surface itself says. surfaces.js
  // owns how a given material loses grip when wet; this is the part that is
  // about the weather rather than the road.
  const coolBonus = 1 + 0.03 * saturate((22 - c.temperature) / 26);
  out.gripScale = clamp(
    (1 - 0.20 * wet.film) * (1 - 0.28 * wet.standing) * (1 - 0.34 * wet.snowCover) * coolBonus,
    0.22, 1.05,
  );
  out.visibility = c.visibility * (1 - 0.35 * saturate(w.spray.density));
  // The road-state half of aquaplaning; physics multiplies by v^2 and tyre load.
  out.aquaplaneRisk = saturate(wet.standing * (0.45 + 0.55 * saturate(c.precipRate / 40)));
  return out;
}

export function weatherLensState(w) {
  const out = w._lensOut;
  const lens = w.lens;
  out.dropletCoverage = lens.chaseDrops;
  out.glassCoverage = lens.glassDrops;
  out.streakBias = lens.streakBias;
  out.wiperSweep = lens.wiperSweep;
  out.wiperArc = lens.wiperSweep * 1.35;
  out.wiperMode = lens.wiperMode;
  out.glassFog = lens.glassFog;
  out.sprayFilm = lens.sprayFilm;
  return out;
}

export function weatherLightLevel(w) {
  return w.metrics.lightLevel;
}

export function headlightsRequired(w) {
  return w.metrics.headlights;
}

export function weatherSummary(w) {
  const out = w._summary;
  const c = w.current;
  out.id = c.id;
  out.name = c.name;
  out.precip = c.precipType;
  out.precipRate = c.precipRate;
  out.temperature = c.temperature;
  out.windSpeed = c.windSpeed;
  out.windDirection = c.windDirection;
  out.visibility = c.visibility;
  out.wetness = w.wet.film;
  out.headlights = w.metrics.headlights;
  return out;
}
