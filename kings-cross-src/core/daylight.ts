// The look of the sky and the light for a given sun elevation and weather. Pure numbers (colours are sRGB triples, 0..1),
// no three.js: web/src/atmosphere.ts applies the result to the scene, and tests/daylight.test.ts holds the rules.
//
// THE REFERENCE RIG. The page has one rig (web/src/world.ts LIGHTS: a cool sky hemisphere over a warm paving bounce, a warm key
// and two weak fills along the railway). `skyRig` scales that rig, it does not replace it: at a high sun in a clear sky the numbers
// are the reference's own; toward dusk the key dims and reddens and the sky goes through gold and mauve to blue-black; under cloud
// the key all but goes and the sky greys; in rain it darkens; in fog the sky, the horizon and the scene fog become one colour.
// The rig is the daylight one (a bright sun against a softer sky, so a shadow is a third as bright as the lit ground beside it, as in
// the daylight references); the dusk rows keep the absolute light the page had before, so evening and night look as they did.
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
  /** the camera's exposure for the filmic tone map: a darker scene is exposed up (night, cloud), as an eye or an auto-exposing camera does */
  exposure: number;
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
 * zenith (0x0b1322): the dusk the page used to be, now one moment of the evening. From +6 degrees down the K's hold the light the page
 * had when its reference sun was 1.7, its hemisphere 1.25 and its fills 0.8 and 0.3 (the reference is now 3.0, 1.0, 0.6 and 0.25: a
 * bright key over a softer sky, which is what puts a shadow a third as bright as the ground beside it), so evening and night keep
 * their light. Above +12 the paving bounce under the hemisphere is warm and light, not the old dark blue-grey (0x3a3f48): sunlit
 * paving throws about a third of the sun back on to the walls and the underside of every canopy (ASSUMED: albedo 0.35, daylight
 * references R-a and R-d show the shaded sides of buildings lit warm-grey, not dark blue).
 */
const ROWS: readonly Row[] = [
  { e: -18, zenith: 0x050a16, horizon: 0x0f1624, sun: 0xff5a30, sunK: 0, hemiSky: 0x3a4f84, hemiGround: 0x0c0f14, hemiK: 0.625, fillK: 0.24, fillTint: 0x7088c8 },
  { e: -12, zenith: 0x08101f, horizon: 0x18233a, sun: 0xff5a30, sunK: 0, hemiSky: 0x40578f, hemiGround: 0x10141b, hemiK: 0.65, fillK: 0.27, fillTint: 0x7088c8 },
  { e: -8, zenith: 0x0d1830, horizon: 0x35465e, sun: 0xff5a30, sunK: 0, hemiSky: 0x4d629a, hemiGround: 0x181c24, hemiK: 0.69, fillK: 0.35, fillTint: 0x8096d0 },
  { e: -4, zenith: 0x1b2c52, horizon: 0x6a5f78, sun: 0xff6a3a, sunK: 0, hemiSky: 0x6e7eae, hemiGround: 0x24272f, hemiK: 0.75, fillK: 0.56, fillTint: 0xc0a8a0 },
  { e: -1, zenith: 0x2b4272, horizon: 0xc08a6c, sun: 0xff7a40, sunK: 0.07, hemiSky: 0x909dc6, hemiGround: 0x2e323b, hemiK: 0.93, fillK: 0.77, fillTint: 0xffc89a },
  { e: 2, zenith: 0x365a94, horizon: 0xe8b58a, sun: 0xff9a52, sunK: 0.215, hemiSky: 0xa6b6e0, hemiGround: 0x343842, hemiK: 1.05, fillK: 0.96, fillTint: 0xffd5a8 },
  { e: 6, zenith: 0x3f69a8, horizon: 0xd2cdc8, sun: 0xffb878, sunK: 0.36, hemiSky: 0xb4c6f0, hemiGround: 0x383c46, hemiK: 1.12, fillK: 1.14, fillTint: 0xffe0bc },
  { e: 12, zenith: 0x4674b4, horizon: 0xbccde2, sun: 0xffd9a8, sunK: 0.8, hemiSky: 0xbdd0fa, hemiGround: 0x625d57, hemiK: 1.08, fillK: 1.1, fillTint: 0xfff0d8 },
  { e: 25, zenith: 0x4678bc, horizon: 0xbccfe6, sun: 0xffe8c2, sunK: 1, hemiSky: 0xc4d6ff, hemiGround: 0x6e6860, hemiK: 1, fillK: 1, fillTint: 0xfff0d8 },
  { e: 45, zenith: 0x4678c0, horizon: 0xb4cde8, sun: 0xfff4e0, sunK: 1.08, hemiSky: 0xc4d6ff, hemiGround: 0x6e6860, hemiK: 1.02, fillK: 1, fillTint: 0xfff0d8 },
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
 * The haze of clear air, as aerial perspective: it starts at the camera's feet (80 m) and thickens evenly, so the city 400 m off is
 * a sixth of the way to the horizon's colour, a kilometre off nearly half, and the far ground and the dome's edge meet at 2 km. A
 * high view (the overview looks 480 to 1160 m down the ground in its top two thirds) then shows the far blocks lighter, greyer and bluer
 * than the near ones, as the daylight references do, while a street-level view (everything within 150 m) is untouched. ASSUMED amounts,
 * judged by eye: the references (R-lighting-materials-a, -d) are close-ups with no far skyline to measure. The first fog here began at
 * 1100 m and ended at 3600; the second began at 450 m, which left the lower half of the overview with no haze at all; the third ended
 * at 2.8 km, which left the far third of the overview (480 to 1160 m: 19% to 40% of the way) nearly as contrasty as the foreground.
 */
export const CLEAR_FOG = { near: 80, far: 2000 } as const;

/**
 * The haze of a visibility of exactly 10 km, and the cap on every thinner one (mist, rain, drizzle, fog): the weather's own fog, which
 * the clear-air haze above does not change.
 */
const HAZE_CAP = { near: 450, far: 2800 } as const;

/**
 * Scene fog distances for a visibility, metres. At 20 km or more (the clear state, and the weather feed's 24 km) it is the clear-air
 * haze (`CLEAR_FOG`); from 10 to 20 km it eases in from the weather's own haze (`HAZE_CAP`), so a visibility that drifts past 10 km
 * never steps. Below 10 km the far plane comes in with the visibility: a camera low in the fog sees only about the visibility; a camera
 * high above it looks down through a fog layer that is shallow (a few hundred metres), so its effective visibility grows with its height.
 */
export function fogRange(visibilityM: number, cameraHeightM = 0): { near: number; far: number } {
  if (!(visibilityM < 10_000)) {
    const t = Number.isNaN(visibilityM) ? 1 : smoothstep(10_000, 20_000, visibilityM);
    return { near: lerp(HAZE_CAP.near, CLEAR_FOG.near, t), far: lerp(HAZE_CAP.far, CLEAR_FOG.far, t) };
  }
  const effective = visibilityM * (1 + Math.max(0, cameraHeightM) / 250);
  const far = Math.min(HAZE_CAP.far, Math.max(60, 1.25 * effective));
  return { near: Math.min(HAZE_CAP.near, 0.2 * far), far };
}

/** A smooth 0..1 value noise at the integer lattice point (ix, iy): fixed numbers, no random state. */
function lattice(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(lattice(ix, iy), lattice(ix + 1, iy), sx), lerp(lattice(ix, iy + 1), lattice(ix + 1, iy + 1), sx), sy);
}

/**
 * The structure of a cloud deck seen from below, 0..1 and about 0.5 on average, for a unit direction on the sky dome (x east, y up,
 * z south). The deck is a flat layer: the direction is projected onto it (so the billows are large overhead and crowd together toward
 * the horizon, as a real deck does), and three octaves of value noise give billows about 20 degrees across with edges of 5 to 10.
 * atmosphere.ts multiplies the overcast dome by `1 + k (deck - 0.6)`, so a grey sky has darker and paler cloud rather than one flat
 * tone (a deck of 0.6, a little above the average, leaves the sky's colour as it was, so the average cloud is a little darker than the
 * plain dome). Fixed numbers: the same sky every time, so a capture can be repeated.
 */
export function cloudDeck(x: number, y: number, z: number): number {
  const h = 1 / (Math.max(y, 0) + 0.35);
  const u = x * h * 2.4, v = z * h * 2.4;
  const n = 0.55 * valueNoise(u + 17.3, v + 4.1) + 0.3 * valueNoise(2 * u + 3.7, 2 * v + 91.9) + 0.15 * valueNoise(4 * u + 55.5, 4 * v + 12.2);
  return n;
}

/** Lamp level from elevation alone: 0 at +2 degrees or higher, 1 at -6 degrees or lower, a smooth ease between. */
export const lampLevelFor = (elevationDeg: number): number => 1 - smoothstep(-6, 2, elevationDeg);

/** The sun's state in a few words for the status line: "sun 23° up (day)", "sun 8° below the horizon (civil twilight)". */
export function describeSun(elevationDeg: number): string {
  const rounded = Math.round(Math.abs(elevationDeg));
  const phase = elevationDeg >= 0 ? 'day' : elevationDeg >= -6 ? 'civil twilight' : elevationDeg >= -12 ? 'nautical twilight' : 'night';
  return elevationDeg >= 0 ? `sun ${rounded}° up (${phase})` : `sun ${rounded}° below the horizon (${phase})`;
}

/**
 * The camera's exposure for the filmic tone map (three's ACES): the light's numbers are physical, so a bright day and a dark night are
 * far apart, and a camera or an eye closes down in the one and opens in the other. At night it opens a little over a stop (the toe of
 * ACES is steeper than a straight sRGB curve, so the dim light needs it to read as well): 2.3 puts the mean brightness of a close night
 * view (the south front, the Edinburgh street) within 5% of what the page showed before the tone map, and of a high one (the overview,
 * mostly dark ground) a fifth lower, with the lit windows and lamps brighter than before and the deep shade darker; the dusk comes out
 * a tenth brighter (ASSUMED: judged by the mean luma of fixed captures against the old page, not against a night reference). In a clear
 * day it takes a quarter off (the sun is then 3.0, so the sunlit ground sits about 0.76 of the way up the curve and every shade below
 * it keeps its detail); under full cloud, when the sun is 12% of itself, it opens a further 90% as a camera does.
 */
export const NIGHT_EXPOSURE = 2.3;
export const DAY_EXPOSURE = 1.25;
export const CLOUD_EXPOSURE = 0.9;
/**
 * What a dry overcast day opens a further, as a multiple of the clear day's exposure (round four, lighting-materials E3): with the sun at 12% of itself and the whole of the
 * light the sky's, the stock tower of the south front drew L 48 where R-d's overcast one is L 58, the Midland's brick L 41 against R-c's 57 and the road L 15 (the sky dome is not
 * tone-mapped, so it does not move). 0.75 puts them at about L 58, 56 and 42. The sky's lift goes in rain (gone by a rain amount of 0.5) and this goes with it, so a rainy day's
 * exposure is what it was.
 */
export const CLOUD_EXPOSURE_DRY = 0.75;

/** The share of the daylight stand-ins (the shed's sky-lit lining and glazing) kept at night, so they never go quite dead. */
export const DAYLIGHT_FLOOR = 0.12;
/** The stylised moon's strength on a clear night (the key light's intensity; the reference sun is 1.7). */
export const MOON_INTENSITY = 0.55;

/** How far a cloud sky's colour is pulled toward its own grey (1 is a neutral grey): a bright overcast keeps a little of the blue, a pale cool white. */
const CLOUD_SKY_GREY = 0.9;
/** What the day adds to the grey of a cloud sky's zenith and horizon, as a multiple of it (at full day; none at dusk). */
const CLOUD_LIFT = { zenith: 1.05, horizon: 0.2 } as const;

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
  // snow's bounce is about two and a half times the paving's (an albedo near 0.8 against 0.3), and cool: it lights the underside of everything
  const hemiGround = mixRgb(k.hemiGround, [0.74, 0.76, 0.8], 0.7 * snow * dayAmount);
  const hemiIntensity = reference.hemisphere.intensity * k.hemiK * (1 - 0.08 * cloud) * (1 - 0.1 * rain) * (1 - 0.12 * fog) * (1 + 0.08 * snow);

  // The dome: clear colours, then toward the cloud's pale cool white (zenith darker, horizon paler), darkened by rain, then into the fog colour.
  // A bright overcast is the brightest thing in the sky, not a dark grey one: in the day the cloud colour is the clear colour's own grey
  // lifted by `CLOUD_LIFT` (R-lighting-materials-d: about (212, 219, 235) high up, (228, 233, 245) at the horizon, a little blue left in it),
  // and at dusk, when the lift is not wanted, it is the old dim grey. Rain takes the lift away again (gone by a rain amount of 0.5),
  // so a rainy sky is as dull as it always was. The lift is ASSUMED, matched by eye to that one photograph.
  const lift = dayAmount * (1 - smoothstep(0, 0.5, rain));
  let zenith = mixRgb(k.zenith, scaleRgb(desaturate(k.zenith, CLOUD_SKY_GREY), 0.82 + CLOUD_LIFT.zenith * lift), 0.9 * cloud);
  let horizon = mixRgb(k.horizon, scaleRgb(desaturate(k.horizon, CLOUD_SKY_GREY), 0.96 + CLOUD_LIFT.horizon * lift), 0.85 * cloud);
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
    exposure: lerp(NIGHT_EXPOSURE, DAY_EXPOSURE, dayAmount) * (1 + (CLOUD_EXPOSURE + CLOUD_EXPOSURE_DRY * lift) * cloud * dayAmount),
  };
}
