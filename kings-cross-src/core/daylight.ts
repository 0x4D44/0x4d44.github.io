// The look of the sky and the light for a given sun elevation and weather. Pure numbers (colours are sRGB triples, 0..1),
// no three.js: web/src/atmosphere.ts applies the result to the scene, and tests/daylight.test.ts holds the rules.
//
// THE REFERENCE RIG. The page has always had one rig (web/src/world.ts LIGHTS: a cool hemisphere, a warm key in the south-west and two
// weak fills along the railway). `skyRig` scales that rig, it does not replace it: at a high sun in a clear sky the numbers are the
// reference's own; toward dusk the key dims and reddens and the sky goes through gold and mauve to blue-black; under cloud the key
// all but goes and the sky greys; in rain it darkens; in fog the sky, the horizon and the scene fog become one colour.
//
// TWILIGHT. Elevation is the geometric elevation of the sun's centre (core/solar.ts). Civil twilight ends at -6 degrees, nautical at
// -12, astronomical at -18. The station, platform and train lights are fully on by -6 and fully off by +2, and ease between.
// At night the key light is a stylised moon (a fixed cool light, not an ephemeris), which takes over from the sun when it is
// well below the horizon, so the single directional key never has to swing across the sky while it is bright.
import { sunDirection } from './solar.ts';

export type Rgb = [number, number, number];

export interface ReferenceRig {
  sun: { colour: number; intensity: number };
  hemisphere: { sky: number; ground: number; intensity: number };
  fills: readonly { colour: number; intensity: number }[];
}

/** What the sky is doing besides the sun: all 0..1 except the visibility. */
export interface SkyWeather {
  cloud: number;
  rain: number;
  snow: number;
  /** meteorological visibility, metres (Infinity: unlimited) */
  visibilityM: number;
}

export const CLEAR: SkyWeather = { cloud: 0, rain: 0, snow: 0, visibilityM: Infinity };

export interface SkyRig {
  /** 0 at night to 1 in full day: how much of the daylight stand-ins (sky-lit emissive surfaces) to keep */
  daylight: number;
  /** 0 to 1: station, platform and train lights */
  lampLevel: number;
  /** 0 to 1: stars (clear nights only) */
  stars: number;
  sun: { direction: [number, number, number]; colour: Rgb; intensity: number };
  /** the stylised night key: a fixed direction, a cool colour, an intensity that is 0 by day */
  moon: { direction: [number, number, number]; colour: Rgb; intensity: number };
  hemisphere: { sky: Rgb; ground: Rgb; intensity: number };
  fills: { colour: Rgb; intensity: number }[];
  dome: { zenith: Rgb; horizon: Rgb };
  /** the glow round the sun on the dome: colour and 0..1 strength */
  glow: { colour: Rgb; strength: number };
  /** the colour fog fades into, which is the dome's horizon colour */
  fog: Rgb;
  /** 0 (clear) to 1 (dense fog): how foggy the visibility is */
  fogAmount: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const hexRgb = (hex: number): Rgb => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scaleRgb = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const luma = (a: Rgb): number => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
/** Pull a colour toward its own grey by `amount`. */
const desaturate = (a: Rgb, amount: number): Rgb => {
  const l = luma(a);
  return mixRgb(a, [l, l, l], amount);
};

interface Row {
  e: number;
  zenith: number;
  horizon: number;
  sun: number;
  sunK: number;
  hemiSky: number;
  hemiGround: number;
  hemiK: number;
  fillK: number;
  fillTint: number;
}

/**
 * Clear-sky keyframes by sun elevation (degrees). Colours are sRGB hex; `sunK` and `hemiK` and `fillK` multiply the reference rig's
 * intensities. The -8 degree row's horizon is the colour the page's old fixed sky had (0x35465e), and its zenith nearly the old
 * zenith (0x0b1322): the dusk the page used to be, now one moment of the evening.
 */
const ROWS: readonly Row[] = [
  { e: -18, zenith: 0x050a16, horizon: 0x0f1624, sun: 0xff5a30, sunK: 0, hemiSky: 0x3a4f84, hemiGround: 0x0c0f14, hemiK: 0.5, fillK: 0.18, fillTint: 0x7088c8 },
  { e: -12, zenith: 0x08101f, horizon: 0x18233a, sun: 0xff5a30, sunK: 0, hemiSky: 0x40578f, hemiGround: 0x10141b, hemiK: 0.52, fillK: 0.2, fillTint: 0x7088c8 },
  { e: -8, zenith: 0x0d1830, horizon: 0x35465e, sun: 0xff5a30, sunK: 0, hemiSky: 0x4d629a, hemiGround: 0x181c24, hemiK: 0.55, fillK: 0.26, fillTint: 0x8096d0 },
  { e: -4, zenith: 0x1b2c52, horizon: 0x6a5f78, sun: 0xff6a3a, sunK: 0, hemiSky: 0x6e7eae, hemiGround: 0x24272f, hemiK: 0.6, fillK: 0.42, fillTint: 0xc0a8a0 },
  { e: -1, zenith: 0x2b4272, horizon: 0xc08a6c, sun: 0xff7a40, sunK: 0.12, hemiSky: 0x909dc6, hemiGround: 0x2e323b, hemiK: 0.74, fillK: 0.58, fillTint: 0xffc89a },
  { e: 2, zenith: 0x365a94, horizon: 0xe8b58a, sun: 0xff9a52, sunK: 0.38, hemiSky: 0xa6b6e0, hemiGround: 0x343842, hemiK: 0.84, fillK: 0.72, fillTint: 0xffd5a8 },
  { e: 6, zenith: 0x3f69a8, horizon: 0xd2cdc8, sun: 0xffb878, sunK: 0.64, hemiSky: 0xb4c6f0, hemiGround: 0x383c46, hemiK: 0.9, fillK: 0.86, fillTint: 0xffe0bc },
  { e: 12, zenith: 0x4674b4, horizon: 0xbccde2, sun: 0xffd9a8, sunK: 0.86, hemiSky: 0xbdd0fa, hemiGround: 0x3a3f48, hemiK: 0.97, fillK: 0.95, fillTint: 0xfff0d8 },
  { e: 25, zenith: 0x4a7dc0, horizon: 0xb0cae6, sun: 0xffe8c2, sunK: 1, hemiSky: 0xc4d6ff, hemiGround: 0x3a3f48, hemiK: 1, fillK: 1, fillTint: 0xfff0d8 },
  { e: 45, zenith: 0x4a80c6, horizon: 0xa8c8e8, sun: 0xfff0d6, sunK: 1.08, hemiSky: 0xc4d6ff, hemiGround: 0x3a3f48, hemiK: 1.02, fillK: 1, fillTint: 0xfff0d8 },
];

interface Sampled {
  zenith: Rgb;
  horizon: Rgb;
  sun: Rgb;
  sunK: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiK: number;
  fillK: number;
  fillTint: Rgb;
}
const TABLE = ROWS.map((r) => ({ e: r.e, zenith: hexRgb(r.zenith), horizon: hexRgb(r.horizon), sun: hexRgb(r.sun), sunK: r.sunK,
  hemiSky: hexRgb(r.hemiSky), hemiGround: hexRgb(r.hemiGround), hemiK: r.hemiK, fillK: r.fillK, fillTint: hexRgb(r.fillTint) }));

/** The keyframes at elevation `e`, linearly between the two rows either side (clamped at the ends). */
function sample(e: number): Sampled {
  const first = TABLE[0]!;
  const last = TABLE[TABLE.length - 1]!;
  if (e <= first.e) return first;
  if (e >= last.e) return last;
  let i = 0;
  while (e > TABLE[i + 1]!.e) i++;
  const a = TABLE[i]!;
  const b = TABLE[i + 1]!;
  const t = (e - a.e) / (b.e - a.e);
  return { zenith: mixRgb(a.zenith, b.zenith, t), horizon: mixRgb(a.horizon, b.horizon, t), sun: mixRgb(a.sun, b.sun, t), sunK: lerp(a.sunK, b.sunK, t),
    hemiSky: mixRgb(a.hemiSky, b.hemiSky, t), hemiGround: mixRgb(a.hemiGround, b.hemiGround, t), hemiK: lerp(a.hemiK, b.hemiK, t),
    fillK: lerp(a.fillK, b.fillK, t), fillTint: mixRgb(a.fillTint, b.fillTint, t) };
}

/** How foggy a visibility is: 0 at 10 km or more, 1 at 200 m or less, by the log of the distance in between. */
export function fogAmount(visibilityM: number): number {
  if (!(visibilityM < 10_000)) return 0;
  return clamp01(1 - (Math.log(Math.max(visibilityM, 1)) - Math.log(200)) / (Math.log(10_000) - Math.log(200)));
}

/**
 * Scene fog distances for a visibility, metres. At 10 km or more it is the page's long-standing fog (1100 to 3600). Below that the
 * far plane comes in with the visibility: a camera low in the fog sees only about the visibility; a camera high above it looks down
 * through a fog layer that is shallow (a few hundred metres), so its effective visibility grows with its height.
 */
export function fogRange(visibilityM: number, cameraHeightM = 0): { near: number; far: number } {
  const clear = { near: 1100, far: 3600 };
  if (!(visibilityM < 10_000)) return clear;
  const effective = visibilityM * (1 + Math.max(0, cameraHeightM) / 250);
  const far = Math.min(clear.far, Math.max(60, 1.25 * effective));
  return { near: Math.min(clear.near, 0.2 * far), far };
}

/** Lamp level from elevation alone: 0 at +2 degrees or higher, 1 at -6 degrees or lower, a smooth ease between. */
export const lampLevelFor = (elevationDeg: number): number => 1 - smoothstep(-6, 2, elevationDeg);

/** The sun's state in a few words for the status line: "sun 23° up (day)", "sun 8° below the horizon (civil twilight)". */
export function describeSun(elevationDeg: number): string {
  const rounded = Math.round(Math.abs(elevationDeg));
  const phase = elevationDeg >= 0 ? 'day' : elevationDeg >= -6 ? 'civil twilight' : elevationDeg >= -12 ? 'nautical twilight' : 'night';
  return elevationDeg >= 0 ? `sun ${rounded}° up (${phase})` : `sun ${rounded}° below the horizon (${phase})`;
}

/** The share of the daylight stand-ins (the shed's sky-lit lining and glazing) kept at night, so they never go quite dead. */
export const DAYLIGHT_FLOOR = 0.12;
/** The stylised moon's strength on a clear night (the key light's intensity; the reference sun is 1.7). */
export const MOON_INTENSITY = 0.55;

/** The moon: a fixed, stylised cool key from the south-west, 42 degrees up (not an ephemeris). */
const MOON_DIRECTION = sunDirection(42, 215);
const MOON_COLOUR = hexRgb(0x7f95c8);

export function skyRig(elevationDeg: number, azimuthDeg: number, weather: SkyWeather, reference: ReferenceRig): SkyRig {
  const cloud = clamp01(weather.cloud);
  const rain = clamp01(weather.rain);
  const snow = clamp01(weather.snow);
  const fog = fogAmount(weather.visibilityM);
  const k = sample(elevationDeg);
  const dayAmount = smoothstep(-6, 8, elevationDeg);

  // The sun: blocked by cloud, a little by rain, half by dense fog.
  const sunDim = (1 - 0.88 * cloud) * (1 - 0.15 * rain) * (1 - 0.55 * fog);
  const sunIntensity = reference.sun.intensity * k.sunK * sunDim;
  const sunColour = desaturate(k.sun, 0.35 * cloud);

  // The moon takes over from -5 degrees (the sun's key is 0 below -4) and is full by -10; cloud takes most of it away.
  const moonIntensity = MOON_INTENSITY * smoothstep(-5, -10, elevationDeg) * (1 - 0.7 * cloud) * (1 - 0.3 * fog);

  // The sky ambient: under cloud it greys and loses a little; rain darkens it; fog flattens it; snow cover brightens it.
  const hemiColour = desaturate(k.hemiSky, 0.55 * cloud + 0.2 * fog);
  const hemiGround = mixRgb(k.hemiGround, [0.56, 0.58, 0.62], 0.7 * snow * dayAmount);
  const hemiIntensity = reference.hemisphere.intensity * k.hemiK * (1 - 0.08 * cloud) * (1 - 0.1 * rain) * (1 - 0.12 * fog) * (1 + 0.08 * snow);

  // The dome: clear colours, then toward cloud grey (zenith darker, horizon paler), darkened by rain, then into the fog colour.
  let zenith = mixRgb(k.zenith, scaleRgb(desaturate(k.zenith, 1), 0.82), 0.9 * cloud);
  let horizon = mixRgb(k.horizon, scaleRgb(desaturate(k.horizon, 1), 0.96), 0.85 * cloud);
  const darker = 1 - 0.14 * rain;
  zenith = scaleRgb(zenith, darker);
  horizon = scaleRgb(horizon, darker);
  const fogColour = mixRgb(horizon, scaleRgb(desaturate(horizon, 1), 1.06), 0.5 * fog);
  zenith = mixRgb(zenith, scaleRgb(fogColour, 0.88), 0.85 * fog);
  horizon = mixRgb(horizon, fogColour, 0.9 * fog);

  // Gloom brings the lamps on in the day: heavy cloud, rain and fog make a dark afternoon.
  const gloom = clamp01(0.35 * cloud + 0.45 * rain + 0.55 * fog) * dayAmount;
  const lampLevel = Math.max(lampLevelFor(elevationDeg), 0.55 * gloom);

  const glowStrength = 0.6 * smoothstep(-5, 0, elevationDeg) * (1 - smoothstep(8, 30, elevationDeg)) * (1 - cloud) * (1 - fog);

  return {
    daylight: clamp01((DAYLIGHT_FLOOR + (1 - DAYLIGHT_FLOOR) * dayAmount) * (1 - 0.35 * cloud) * (1 - 0.2 * fog)),
    lampLevel,
    stars: smoothstep(-8, -16, elevationDeg) * (1 - clamp01(1.4 * cloud)) * (1 - fog) * (1 - rain),
    sun: { direction: sunDirection(elevationDeg, azimuthDeg), colour: sunColour, intensity: sunIntensity },
    moon: { direction: MOON_DIRECTION, colour: MOON_COLOUR, intensity: moonIntensity },
    hemisphere: { sky: hemiColour, ground: hemiGround, intensity: hemiIntensity },
    fills: reference.fills.map((f) => ({ colour: mixRgb(hexRgb(f.colour), k.fillTint, 0.8), intensity: f.intensity * k.fillK * (1 - 0.3 * cloud) * (1 - 0.3 * fog) })),
    dome: { zenith, horizon },
    glow: { colour: mixRgb(k.sun, [1, 0.9, 0.7], 0.25), strength: glowStrength },
    fog: fogColour,
    fogAmount: fog,
  };
}
