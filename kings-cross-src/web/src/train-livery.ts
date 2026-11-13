// Per-kind paint for the model trains: what livery.ts's one-livery-per-operator table cannot say. The Great Northern
// Class 387 and Class 717 are different paint (a dark green door and an orange pinstripe on one, a black-topped front on
// the other), and the LNER Azuma's red is the window band that sweeps down the cab side, not a band under the windows.
//
// How the paint is carried is livery.ts's design, kept: the side texture (2560 x 768, the first TEX_SPAN metres of a
// cab-end car, its last column on any other car) is projected along x onto the body's side and the nose's flank, so what is
// painted here is the SIDE ELEVATION of the livery, read off a side photograph: s metres from the nose tip (along the car)
// and y metres above the rail head. A scheme is a list of coloured polygons in that frame (`sideShapes`), painted in
// order over the body colour. The list is plain data, so the tests read the colour at any point without a canvas.
//
// Every shape cites the photograph it was read from (the review set lives outside the repository and is never shipped;
// the file names are those of the Wikimedia Commons originals). Where a photograph does not settle a position the shape
// says so. Nothing here is an image asset.
import * as THREE from 'three';
import { TRAIN_SPECS } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { LIGHT_GAIN, LIVERIES, shellMaterial, TEX_H, TEX_SPAN, TEX_W, TEX_Y0, TEX_Y1, textEms } from './livery.ts';
import type { DecalCar, DecalItem, LiveryDef } from './livery.ts';
import { MASK_700, MASK_717 } from './train-face.ts';

/** A coloured polygon of the side elevation: points are [s metres from the nose tip, y metres above the rail head]. */
export interface Shape {
  colour: number;
  pts: [number, number][];
}

export type Scheme = 'base' | 'lner' | 'grandcentral' | 'gn387' | 'gn717' | 'tl700' | 'hull';

/** A livery with the extra things this module knows: which painter draws its side, and the colour of the nose's top. */
export interface TrainLivery extends LiveryDef {
  scheme: Scheme;
  /** Colour of the nose's roof from `noseTopFrom` (metres from the tip) back to the end of the nose, over the roof's columns; null: the roof colour. */
  noseTop: number | null;
  noseTopFrom: number;
}

// --- shape helpers -----------------------------------------------------------------------------

const rect = (s0: number, s1: number, y0: number, y1: number): [number, number][] => [[s0, y0], [s1, y0], [s1, y1], [s0, y1]];

/**
 * A smooth curve through `knots` (s increasing), sampled `n` times: a monotone cubic (Fritsch-Carlson), so it never
 * overshoots a knot the way a spline can, and a livery edge drawn through a few photograph readings stays between them.
 */
export function smoothCurve(knots: readonly [number, number][], n = 48): [number, number][] {
  const m = knots.length;
  if (m < 2) return knots.map((k) => [...k] as [number, number]);
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < m - 1; i++) {
    const a = knots[i] as [number, number];
    const b = knots[i + 1] as [number, number];
    dx.push(b[0] - a[0]);
    slope.push((b[1] - a[1]) / (b[0] - a[0]));
  }
  const tan: number[] = [slope[0] as number];
  for (let i = 1; i < m - 1; i++) {
    const p = slope[i - 1] as number;
    const q = slope[i] as number;
    tan.push(p * q <= 0 ? 0 : (2 * p * q) / (p + q));
  }
  tan.push(slope[m - 2] as number);
  const out: [number, number][] = [];
  const first = knots[0] as [number, number];
  const last = knots[m - 1] as [number, number];
  for (let k = 0; k <= n; k++) {
    const s = first[0] + ((last[0] - first[0]) * k) / n;
    let i = 0;
    while (i < m - 2 && s > (knots[i + 1] as [number, number])[0]) i++;
    const a = knots[i] as [number, number];
    const b = knots[i + 1] as [number, number];
    const h = dx[i] as number;
    const t = (s - a[0]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * h * (tan[i] as number) + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * h * (tan[i + 1] as number);
    out.push([s, y]);
  }
  return out;
}

/** The y of a curve of `smoothCurve` points at s (linear between samples; held flat beyond the ends). */
export function curveY(c: readonly [number, number][], s: number): number {
  const first = c[0] as [number, number];
  const last = c[c.length - 1] as [number, number];
  if (s <= first[0]) return first[1];
  if (s >= last[0]) return last[1];
  for (let i = 0; i + 1 < c.length; i++) {
    const a = c[i] as [number, number];
    const b = c[i + 1] as [number, number];
    if (s <= b[0]) return a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0] || 1);
  }
  return last[1];
}

/** The band between two curves over the same s range: `top` and `bottom` are sampled alike (from `smoothCurve`). */
function between(top: readonly [number, number][], bottom: readonly [number, number][]): [number, number][] {
  return [...top.map((p) => [...p] as [number, number]), ...[...bottom].reverse().map((p) => [...p] as [number, number])];
}

// --- the colours -----------------------------------------------------------------------------------

/** LNER's red (the vinyl wraps the windows' band and the cab's sweep). The shade is approximate: photographed in sun it reads from 0xb0102a to 0xd0142e. */
export const LNER_RED = 0xc8102e;
/** The Azuma's nose mask. Photographs (lner-801-214-2025, lner-800-113-newcastle-2025) show a saturated golden yellow. */
export const LNER_YELLOW = 0xf2b705;
/** The orange of Grand Central's band and pinstripe (photographs GC180-01 and GC180-05: a saturated deep orange). */
export const GC_ORANGE = 0xee6a12;
/** The dark green of the Great Northern 387/1's doors (gn387_03_387123_cambridge, gn387_02_387121_ely: a deep blue-green, "Southern green"). */
export const GN387_GREEN = 0x1b5e4a;
/** The thin orange line along the cantrail of the 387 and 717 (gn387_04_kings_cross_2023, GN717-05-25.06.26-Welwyn-Garden-City-717014). */
export const GN_PINSTRIPE = 0xe8731c;
/** The navy of the Great Northern name panel (gn387_04_kings_cross_2023: a dark blue, near-black in shade). */
export const GN_NAVY = 0x1d2c5e;
/** Hull Trains' body: a dark royal blue, navy in shade (hull-802-paragon-2025 in sun reads about 0x213f93, hull-802-home-2023 under a roof about 0x14224a). The shade is approximate. */
export const HULL_BLUE = 0x1a3772;
/** The dull grey of the Hull Trains beak (busandtrainuser.com: "a rather dull grey/black front nose cone"; hull-802-doncaster-2024 shows it mid-grey in sun). Kept dark so the coupler cover's seam reads against it. */
export const HULL_BEAK = 0x2d3138;
/** The cyan the wrap's band starts with at the cab (hull-802-paragon-2025, hull-802-doncaster-2024: a bright cyan sweep along the cab side). */
export const HULL_CYAN = 0x23b5e6;
/** The doors of the Hull Trains 802s: a crimson that reads red in hull-802-home-2023 and pink-red at the edges in hull-802-paragon-2025 (the earlier "magenta" came from one unopened snippet). */
export const HULL_DOOR = 0xc41e46;

// --- LNER ---------------------------------------------------------------------------------------

/**
 * Top and bottom of the LNER red band beside the windows (metres above the rail head): the band holds the whole window row and a hand's breadth round it, and is
 * about 39% of the body's height between the dark foot and the roof edge, with white-silver above it and below it. Read again off lner-801-214-2025 (a close crop of its first car,
 * measured against the pinstripe at the cantrail, 3.05 m, and the equipment cover's top, 1.0 m: the band from 2.70 m down to 1.84 m, the window row 2.55 to 1.93 m) and
 * lner-800-doncaster-2026 (2.94 m down to 1.90 m, the windows 2.63 to 1.95 m): the two disagree over the band's top by a quarter of a metre (the 800 photograph is a silver car in
 * hard sun, its band's upper edge soft), so it is set between them. It was [1.83, 2.97]: a band 48% of the side, reaching the top of the wall, so that a side view read red above and
 * white below, which the round 3 score called inverted; the photographs show white-silver all round it, over a third of the side white above the windows' band.
 */
export const LNER_BAND: [number, number] = [1.85, 2.76];

/**
 * The Azuma's side. lner-801-214-2025 (a 5-car 801 at Doncaster-area track; a close crop of its first car) and lner-800-doncaster-2026: white-silver car sides, one
 * unbroken RED band holding the whole row of windows (not a band under them: the white-silver lower body is about a third of the side's height), a thin
 * light-orange pinstripe at the cantrail, a thin pale line under the band's foot. At the cab the band's front end rises a little at the crew door and swings
 * forward and down in a red WING round the cab side window, its lower edge a pale crescent that falls from the band's foot to the top of the cheek; in front of and
 * above the wing the nose's shoulder is white, and below the crescent the whole lower flank is white-silver. The red returns only as a CHEEK, a strip beside the
 * face from the foot of the nose to the lamp window, its back edge rounded. The numbers are readings off those photographs, not a drawing.
 */
function lnerShapes(nose: number): Shape[] {
  const bandTop = LNER_BAND[1];
  const bandBottom = LNER_BAND[0];
  // where the band reaches its full height: a little behind the crew door
  const sA = nose + 1.2;
  // the wing's upper edge: above the lamp window's back corner, climbing back past the cab side window to a little over the band at the crew door, then down to the band's top
  const top = smoothCurve([[0.9, 1.95], [1.5, 2.15], [2.2, 2.55], [2.9, 3.0], [nose, 3.14], [nose + 0.4, 3.14], [sA, bandTop], [TEX_SPAN, bandTop]], 64);
  // its lower edge, the crescent: from the cheek's top back to the band's foot at the crew door
  const bottom = smoothCurve([[0.7, 1.42], [1.4, 1.58], [2.3, 1.7], [nose, 1.78], [nose + 0.5, bandBottom], [TEX_SPAN, bandBottom]], 64);
  const wing = between(top, bottom);
  // the pale crescent just under the wing's lower edge (a broader one at the cab, a thin line along the band's foot behind it)
  const under = bottom.map((p): [number, number] => [p[0], p[1] - (p[0] <= nose + 0.5 ? 0.12 : 0.04)]);
  const crescent = between(bottom, under);
  // the cheek: the red strip beside the face, from the nose's foot up under the lamp window, its back edge rounded (a smooth curve through the readings, s as a function of y:
  // drawn through the same five points as a polygon it showed its facets on the nose's flank, a stair where a photograph has one curve)
  const cheekBack = smoothCurve([[TEX_Y0, 0.5], [0.75, 0.8], [1.05, 0.92], [1.3, 0.85], [1.5, 0.7]], 32).map(([y, s]): [number, number] => [s, y]);
  const cheek: [number, number][] = [[0, TEX_Y0], ...cheekBack, [0, 1.5]];
  return [
    // the dark underframe, from just behind the crew door (the nose's own lower flank is white-silver)
    { colour: 0x2d3036, pts: rect(nose + 0.2, TEX_SPAN, TEX_Y0, 1.0) },
    { colour: LNER_RED, pts: wing },
    { colour: 0xb5bbc2, pts: crescent },
    { colour: LNER_RED, pts: cheek },
    // the pinstripe: a line a few millimetres' thick along the cantrail behind the cab (it is only a hint at scale)
    { colour: 0xe8683a, pts: rect(sA, TEX_SPAN, 3.03, 3.07) },
  ];
}

// --- Grand Central ------------------------------------------------------------------------------

/**
 * The front edge of a Class 180 driving car's cab-end door leaf, metres from the car's end (the side texture's s): train.ts ADELANTE_SIDE.cabDoor (4.8 m) less half the
 * 1.2 m leaf (core/train.ts EMU_FIGURES.adelante.doorWidth). A plain number because train.ts imports this module; web/tests/train-livery.test.ts ties it to the plan.
 */
export const GC_CAB_DOOR_FRONT = 4.2;
/** how far the dark door frame stands out round a leaf (train.ts's door builder: 0.05 m) */
const GC_DOOR_FRAME = 0.05;

/**
 * The Class 180's side. GC180-01-180-101-Kings-Cross (a 180 at Kings Cross, 2012?) and GC180-05-Grand-Central-at-Halifax (180112):
 * black body, a broad orange band at the waist, and at the cab the band swings down the cab side in a sweep that widens
 * downward and ends under the lamp pod at the nose's lower corner; a thin orange pinstripe runs along the cantrail. The band
 * edges are livery.ts's `stripeY`; the sweep is read from the two photographs. CHANGED (round 9): the band stands 1.37 to 1.67 m (was 1.04 to 1.5 m) and
 * the pinstripe 3.37 to 3.41 m (was 3.02 to 3.06 m), both measured on the private York photograph (train.ts ADELANTE_HEIGHTS). There the band's top falls
 * slowly where the sweep begins and its foot falls fast, so the knots at the nose's end now stand 0.12 m (top) and 0.42 m (foot) under the band, where they
 * stood 0.12 m and 0.26 m; the knots nearer the tip are unchanged.
 * CHANGED (round 10): round 9's sweep only reached the band's full height at `nose + 1.2` m, behind the cab-end door's front edge, so just ahead of that door the orange
 * stood about 0.08 m under the band on the door and ran down to the sill (round 9's score). The York photograph (private, viewed only; 132.9 px to the metre, ADELANTE_HEIGHTS)
 * reads, ahead of the leaf's front edge: the band's foot level for about 0.4 m, then 1.18 m at 0.85 m, 1.0 m at 1.3 m and 0.77 m at 1.9 m ahead; its top level for about
 * 1.2 m, then 1.57 m at 1.6 m ahead, after which it falls fast to the tip. The knots behind 1.5 m from the car's end are now those readings, measured from the door
 * (GC_CAB_DOOR_FRONT), so the band runs level 1.37 to 1.67 m from the door forward and only then sweeps down. The knots nearer the tip are unchanged.
 * The cantrail line starts square over the door frame's front edge (it started 0.25 m further forward, on the nose's loft, where the wall's top is still under the
 * line's top and the line bent over the shoulder: the kink round 9's score saw at 3/4). That it does not run further forward over the nose is ASSUMED.
 */
function grandCentralShapes(_nose: number): Shape[] {
  const [bandBottom, bandTop] = LIVERIES.grandcentral.stripeY ?? [1.37, 1.67];
  const dF = GC_CAB_DOOR_FRONT;
  const top = smoothCurve([[0.1, 0.78], [0.7, 1.0], [1.5, 1.2], [dF - 1.6, bandTop - 0.1], [dF - 1.2, bandTop], [TEX_SPAN, bandTop]], 96);
  const bottom = smoothCurve([[0.1, TEX_Y0], [0.7, 0.5], [1.5, 0.62], [dF - 1.9, 0.77], [dF - 1.3, 1.0], [dF - 0.85, 1.18], [dF - 0.4, bandBottom], [TEX_SPAN, bandBottom]], 96);
  return [
    { colour: GC_ORANGE, pts: between(top, bottom) },
    { colour: GC_ORANGE, pts: rect(dF - GC_DOOR_FRAME, TEX_SPAN, 3.37, 3.41) },
  ];
}

// --- the Great Northern 387 ---------------------------------------------------------------------

/**
 * The Class 387's side. gn387_03_387123_cambridge, gn387_02_387121_ely, gn387_04_kings_cross_2023 (387/1, 2020-2023): a white-cream
 * body, a thin orange pinstripe along the cantrail above the windows, dark green doors. The windows' black recesses are geometry.
 */
function gn387Shapes(nose: number): Shape[] {
  return [
    { colour: 0x30343a, pts: rect(0, TEX_SPAN, TEX_Y0, 1.0) },
    { colour: GN_PINSTRIPE, pts: rect(nose, TEX_SPAN, 3.0, 3.04) },
  ];
}

// --- Hull Trains ---------------------------------------------------------------------------------

/**
 * The 802's side. hull-802-doncaster-2024 and hull-802-paragon-2025: a dark blue body, the dark foot under it, and at the cab a cyan sweep
 * that rises from the nose's lower flank along the cab side to the wrap's band (the band itself, behind the cab door, is the decals'). The
 * numbers are readings off the two photographs: the sweep leaves the tip's flank 0.6 m up, thins to a sliver by 1.5 m back and reaches the
 * band's height at the cab door.
 */
function hullShapes(nose: number): Shape[] {
  const top = smoothCurve([[0.15, 0.66], [1.0, 0.86], [2.2, 1.12], [nose, 1.4], [nose + 0.9, HULL_BAND[1]]], 40);
  const bottom = smoothCurve([[0.15, 0.62], [1.4, 0.7], [3.0, 0.84], [nose, 0.98], [nose + 0.9, HULL_BAND[0]]], 40);
  return [
    { colour: 0x23262b, pts: rect(0, TEX_SPAN, TEX_Y0, 0.95) },
    { colour: HULL_CYAN, pts: between(top, bottom) },
  ];
}
/** Top and bottom of the wrap's band along the car (metres above the rail head): under the window row, over the dark foot (hull-802-paragon-2025). */
export const HULL_BAND: [number, number] = [1.0, 1.45];

/**
 * The colour stops of the wrap's band, car by car from the front of the train, as [t along the car's band, colour]: t is 0 at a driving car's cab end (the rear car's cab end is the rear end of the
 * train) or a through car's front end, and 1 at the other end, as the decals measure along a car. CHANGED (round 6): read off hull-802-paragon-2025 (unit 802 304, taken 2025-06-02: the whole train
 * side-on in sun, nose to the right, so its right side), where the band is a photographic wrap graded through the spectrum a car at a time, one run carrying on into the next car's start:
 *   car 0 (lead):  cyan, turquoise, green (t 0 to 0.6), a dull blue-indigo stretch, violet at the car's end (0.85 to 1)
 *   car 1:         a violet end panel (0 to 0.09), then, past the door, gold, orange, red and crimson (the old stops had the order the other way about)
 *   car 2:         pink, crimson, magenta, purple, blue, violet, blue-violet and magenta-pink at its end
 *   car 3:         rose, a salmon blend to orange, amber
 *   car 4 (rear):  from the rear end of the train: cyan-teal, teal, green, grey-blue, violet to the car's front end
 * The numbers are that photograph's readings (web/tests/hull-band-readings.ts: 21 a car, where each was read, and the ones it skips), and web/tests/train-livery.test.ts ties every stop to them. The
 * cars in shade (2, 3 and above all 4, the far one) read duller than the paint is: they are kept as the photograph has them. One more dated photograph shows the front car of 802 302
 * (hull-802-doncaster-2024, 2024-03-27): azure by the cab, cyan behind the door, then teal, then green, the order of car 0's first 60 per cent. 802 302's rear car (hull-802-home-2023, 2023-02-25)
 * reads cyan to its rear door where 802 304's rear car runs teal, green and violet: other units wear other wraps, so this is one unit's band and not every 802's. The photographs read no colour off the left side (hull-802-304-werrington-2021 shows it, but the glossy band there only
 * mirrors the trees): the left side is ASSUMED to carry the same colours at the same place along the car. Two stops a hair apart are a cut; the colours between stops are blended.
 */
export const HULL_BAND_STOPS: readonly (readonly (readonly [number, number])[])[] = [
  [[0, 0x2eb3eb], [0.1, 0x40b7d4], [0.15, 0x5be0ef], [0.3, 0x38eae1], [0.4, 0x48c7b0], [0.5, 0x56e28a], [0.6, 0x71e263], [0.65, 0x478d8c], [0.7, 0x43749b], [0.75, 0x385696], [0.8, 0x4c489e], [0.85, 0x7c4dbc], [1, 0x785bb0]],
  [[0, 0x8b65ad], [0.09, 0x8b65ad], [0.1, 0xe1a523], [0.3, 0xe1a523], [0.35, 0xebba23], [0.4, 0xefb223], [0.5, 0xeb952f], [0.6, 0xe68338], [0.7, 0xe45f2d], [0.8, 0xe82927], [0.9, 0xea2037], [1, 0xe0305a]],
  [[0, 0xd94167], [0.1, 0xe53b6d], [0.2, 0xd52751], [0.3, 0xb72b56], [0.4, 0x953a6f], [0.45, 0x7b4a81], [0.5, 0x585c8e], [0.55, 0x3d5b99], [0.65, 0x445087], [0.7, 0x6f5184], [0.75, 0x6b538e], [0.8, 0x5062a4], [0.85, 0x77639d], [0.9, 0xa4538a], [1, 0xa64975]],
  [[0, 0xc53e5c], [0.1, 0xe83a57], [0.25, 0xe84a69], [0.4, 0xe95167], [0.6, 0xc05f42], [0.65, 0xe37748], [0.75, 0xea8146], [0.8, 0xed914b], [0.9, 0xe4a557], [1, 0xcb9854]],
  [[0, 0x53828b], [0.1, 0x579b9f], [0.2, 0x558d83], [0.3, 0x5e9279], [0.4, 0x5d7e6e], [0.5, 0x676b80], [0.55, 0x6b5d8a], [0.7, 0x715295], [0.8, 0x65509d], [1, 0x645880]],
];
/** The number of flat steps a car's band is drawn in (a decal is one flat colour). */
export const HULL_BAND_STEPS = 40;

const mix = (a: number, b: number, t: number): number => {
  const ch = (shift: number): number => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
/** The colour of car `index`'s band at fraction t (0 at its first end, 1 at its last): the stops, blended. */
export function hullBandColour(index: number, t: number): number {
  const stops = HULL_BAND_STOPS[index % HULL_BAND_STOPS.length] as readonly (readonly [number, number])[];
  const first = stops[0] as readonly [number, number];
  const last = stops[stops.length - 1] as readonly [number, number];
  if (t <= first[0]) return first[1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i] as readonly [number, number];
    const b = stops[i + 1] as readonly [number, number];
    if (t <= b[0]) return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
  }
  return last[1];
}

// --- the Great Northern 717 and the Thameslink 700 ---------------------------------------------------

/** The Desiro City's side. GN717-03-717005-Potters-Bar, GN717-05-25.06.26-Welwyn-Garden-City-717014: a pale body, the orange pinstripe only over the windscreen (see noseTop), nothing on the side beyond the flash. */
function desiroShapes(): Shape[] {
  return [{ colour: 0x41464e, pts: rect(0, TEX_SPAN, TEX_Y0, 1.0) }];
}

/** The shapes of a scheme for a cab car whose nose is `nose` metres long (a through car reads the last column, s = TEX_SPAN). */
export function sideShapes(scheme: Scheme, nose: number): Shape[] {
  switch (scheme) {
    case 'lner':
      return lnerShapes(nose);
    case 'grandcentral':
      return grandCentralShapes(nose);
    case 'gn387':
      return gn387Shapes(nose);
    case 'hull':
      return hullShapes(nose);
    case 'gn717':
    case 'tl700':
      return desiroShapes();
    default:
      return [];
  }
}

/** The colour of the side elevation at (s, y) for a livery: the last shape that holds the point, else the body colour. */
export function sideColourAt(livery: Pick<TrainLivery, 'scheme' | 'body'>, nose: number, s: number, y: number): number {
  const shapes = sideShapes(livery.scheme, nose);
  for (let i = shapes.length - 1; i >= 0; i--) if (inside((shapes[i] as Shape).pts, s, y)) return (shapes[i] as Shape).colour;
  return livery.body;
}

/** Point in polygon (even-odd). */
function inside(pts: readonly [number, number][], s: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [si, yi] = pts[i] as [number, number];
    const [sj, yj] = pts[j] as [number, number];
    if (yi > y !== yj > y && s < ((sj - si) * (y - yi)) / (yj - yi) + si) c = !c;
  }
  return c;
}

// --- the kinds -----------------------------------------------------------------------------------

const bayEnds = (c: DecalCar): [number, number] => {
  const d = c.doors.length >= 2 ? c.doors : [3.0, c.length - 3.0];
  return [(d[0] as number) + 0.8, (d[d.length - 1] as number) - 0.8];
};
const bay = (c: DecalCar): number => {
  const [a, b] = bayEnds(c);
  return (a + b) / 2;
};

const asTrainLivery = (def: LiveryDef, over: Partial<TrainLivery> & Pick<TrainLivery, 'scheme'>): TrainLivery => ({ noseTop: null, noseTopFrom: 0, ...def, ...over });

// LNER: the red is the band round the windows and the cab's sweep (above); the nose's flank is the texture, so its cheeks are red;
// the mask is yellow (the warning panel, see FRONT_OVERRIDES in train.ts), the cover beneath the mask red, the nose's top over the windscreen black.
const LNER: TrainLivery = asTrainLivery(LIVERIES.lner, {
  scheme: 'lner',
  basis: 'colour names sourced (Kato, Hornby, gbtrains.uk); the band round the windows, the cab sweep, the yellow mask with red cheeks and the black nose top read from photographs lner-801-214-2025, lner-800-113-newcastle-2025 and lner-800-doncaster-2026; shades approximate',
  sources: [
    ...LIVERIES.lner.sources,
    'photographs (private review set, never shipped): lner-801-214-2025, lner-800-doncaster-2026, lner-800-113-newcastle-2025, lner-801-103-228-york-2026 (Wikimedia Commons)',
  ],
  roof: 0xe4e5e6,
  noseFront: LNER_RED,
  noseBand: 0xe4e5e6,
  swoosh: LNER_RED,
  surround: null,
  foot: 0x2d3036,
  noseTop: 0x1a1c21,
  noseTopFrom: 2.5,
  // small red lettering on the white lower body, between the doors (photographs show the Azuma name and the LNER mark small, at the car ends)
  decals: (c) => [{ text: 'LNER', colour: LNER_RED, rect: [bay(c) - 0.5 * 2.722 * 0.26, 1.12, 0, 1.38] }],
});

const GN387: TrainLivery = asTrainLivery(LIVERIES.greatnorthern, {
  scheme: 'gn387',
  basis: 'the Great Northern 387/1 as photographed 2020-2023 (gn387_01_387114_ely, gn387_02_387121_ely, gn387_03_387123_cambridge, gn387_04_kings_cross_2023): white-cream body, dark green doors, an orange pinstripe, a yellow front; shades approximate',
  sources: [
    ...LIVERIES.greatnorthern.sources,
    'photographs (private review set): gn387_02_387121_ely and gn387_03_387123_cambridge show dark green doors with yellow edges and a white-cream body on the 387/1; gn387_04_kings_cross_2023 the navy "Great Northern" panel and the orange cantrail pinstripe',
  ],
  body: 0xe6e6e1,
  roof: 0xc9ccd0,
  door: GN387_GREEN,
  noseFront: 0xe6e6e1,
  noseBand: 0xe6e6e1,
  foot: 0x41464e,
  noseTop: 0xc9ccd0,
  noseTopFrom: 99,
  decals: (c) => {
    const items: DecalItem[] = [];
    // the navy panel with the white name on it, below the window row between the doors (gn387_04_kings_cross_2023: the panel is about
    // one window-pitch wide and a third as tall, the name one line of small white capitals-and-lower-case across it; ABOUT 1.1 x 0.34 m,
    // read against the window beside it, not a published size; the small teal triangle under it is not drawn: a decal is a rectangle)
    const em = 0.12;
    const tw = textEms('Great Northern') * em;
    const pad = 0.12;
    const x0 = bay(c) - 0.5 * (tw + 2 * pad);
    items.push({ text: null, colour: GN_NAVY, rect: [x0, 1.1, x0 + tw + 2 * pad, 1.1 + 0.34] });
    items.push({ text: 'Great Northern', colour: 0xffffff, rect: [x0 + pad, 1.1 + (0.34 - em) / 2, 0, 1.1 + (0.34 + em) / 2] });
    return items;
  },
});

const GN717: TrainLivery = asTrainLivery(LIVERIES.greatnorthern, {
  scheme: 'gn717',
  basis: LIVERIES.greatnorthern.basis,
  sources: LIVERIES.greatnorthern.sources,
  body: 0xdde0e4,
  noseFront: 0xdde0e4,
  noseBand: 0xdde0e4,
  // GN717-03-717005-Potters-Bar and GN717-05-25.06.26-Welwyn-Garden-City-717014: the upper half of the front, the windscreens and the
  // door between them, is black, over a white lower front; a black dome continues over the roof's front (the face's mask, train-face.ts, is the same black)
  noseTop: MASK_717,
  noseTopFrom: 0,
});

// (tl700_05_0146_farringdon, tl700_01_gatwick_front_29079928802: the dark dome over the roof's front runs on from the face's mask, a blue-black, so it begins at the face)
const TL700: TrainLivery = asTrainLivery(LIVERIES.thameslink, {
  scheme: 'tl700',
  noseTop: MASK_700,
  noseTopFrom: 0,
});

// Hull Trains: a blue body with a cyan sweep at the cab, a spectrum band along the cars (stepped in decals) with the town's name on it, red doors, a
// grey beak over blue cheeks (the front's warning-panel machinery draws the beak, see FRONT_OVERRIDES in train.ts); the lettering is livery.ts's own.
const HULL: TrainLivery = asTrainLivery(LIVERIES.hulltrains, {
  scheme: 'hull',
  basis: 'dark blue body and grey/black beak sourced (two articles); the cyan cab sweep, the spectrum band, the red doors and the grey beak on blue cheeks read from photographs hull-802-doncaster-2024, hull-802-paragon-2025 and hull-802-home-2023; shades approximate; the town on each car is a guess',
  sources: [
    ...LIVERIES.hulltrains.sources,
    'photographs (private review set, never shipped): hull-802-doncaster-2024, hull-802-paragon-2025 (802 304, 2025), hull-802-home-2023 (802 302) and hull-802-grantham-2020 (Wikimedia Commons)',
  ],
  body: HULL_BLUE,
  door: HULL_DOOR,
  roof: 0x9aa2ad,
  noseCone: null,
  noseFront: HULL_BLUE,
  noseBand: HULL_BLUE,
  swoosh: HULL_BEAK,
  // the dome over the windscreen is the body's blue (hull-802-doncaster-2024)
  noseTop: HULL_BLUE,
  noseTopFrom: 0,
  decals: (c) => {
    // the band: flat steps of a blend between the car's stops, from just behind the cab's door (or the car's first metre) to its last, the town's name over it
    const a = c.cab ? c.nose + 0.9 : 1.0;
    const b = c.length - 1.0;
    const items: DecalItem[] = [];
    for (let k = 0; k < HULL_BAND_STEPS; k++) {
      const t0 = k / HULL_BAND_STEPS;
      const t1 = (k + 1) / HULL_BAND_STEPS;
      items.push({ text: null, colour: hullBandColour(c.index, (t0 + t1) / 2), rect: [a + (b - a) * t0, HULL_BAND[0], a + (b - a) * t1, HULL_BAND[1]] });
    }
    // the town's name, in white over the band, as livery.ts's row has it (the first item of its decals is the old flat band, which this replaces)
    const rest = LIVERIES.hulltrains.decals(c).slice(1);
    return [...items, ...rest];
  },
});

// Grand Central: the sweep and the pinstripe are this module's; the black body, the doors and the lettering are livery.ts's.
const GC: TrainLivery = asTrainLivery(LIVERIES.grandcentral, {
  scheme: 'grandcentral',
  stripe: null,
  // the nose's roof is the same black as the body from the face back (GC180-05: a black dome with its vents; the cars' roofs behind it are lighter)
  noseTop: LIVERIES.grandcentral.body,
  noseTopFrom: 0,
  sources: [...LIVERIES.grandcentral.sources, 'photographs (private review set): GC180-01-180-101-Kings-Cross and GC180-05-Grand-Central-at-Halifax show the orange band sweeping down the cab side and a thin orange pinstripe'],
});

// Lumo: livery.ts's row unchanged, and over the windscreen a dark grey dome (LUMO-03-Lumo-803004-passes-York-301023, LUMO-05-Lumo-803005-at-King-s-Cross-Platform-10:
// the cab's top is a smooth dark cap from the glass's upper edge back, the shoulders beside the glass the body's blue; the shade approximate).
const LUMO: TrainLivery = asTrainLivery(LIVERIES.lumo, { scheme: 'base', noseTop: 0x2a2d33, noseTopFrom: 2.5 });

const BY_KIND: Partial<Record<TrainKind, TrainLivery>> = {
  lner5: LNER,
  lner9: LNER,
  hull5: HULL,
  lumo5: LUMO,
  gn387x4: GN387,
  gn387x8: GN387,
  gn387x12: GN387,
  gn717x6: GN717,
  gc180x5: GC,
  tl700x8: TL700,
  tl700x12: TL700,
};

/** The livery a kind wears. Kinds without an entry wear their operator's livery.ts row unchanged. */
export function liveryFor(kind: TrainKind): TrainLivery {
  return BY_KIND[kind] ?? asTrainLivery(LIVERIES[TRAIN_SPECS[kind].livery], { scheme: 'base' });
}

// --- the canvas ----------------------------------------------------------------------------------

/** The slice of the 2D context the painter uses (so a test can record the calls). */
export interface Paint2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Draw a livery's side texture onto a context: the body colour, then the scheme's shapes in order. */
export function paintSide(g: Paint2D, livery: TrainLivery, nose: number): void {
  const X = (s: number): number => (s / TEX_SPAN) * TEX_W;
  const Y = (y: number): number => (1 - (y - TEX_Y0) / (TEX_Y1 - TEX_Y0)) * TEX_H;
  g.fillStyle = hex(livery.body);
  g.fillRect(0, 0, TEX_W, TEX_H);
  for (const shape of sideShapes(livery.scheme, nose)) {
    g.fillStyle = hex(shape.colour);
    g.beginPath();
    shape.pts.forEach(([s, y], i) => (i === 0 ? g.moveTo(X(s), Y(y)) : g.lineTo(X(s), Y(y))));
    g.closePath();
    g.fill();
  }
}

const textures = new Map<string, THREE.CanvasTexture>();
const shells = new Map<string, THREE.MeshLambertMaterial>();

/** The side shell's material for a kind: livery.ts's own where the scheme is 'base', else this module's texture (painted on first use; plain white without a document). */
export function shellMaterialFor(kind: TrainKind, nose: number): THREE.MeshLambertMaterial {
  const livery = liveryFor(kind);
  if (livery.scheme === 'base') return shellMaterial(TRAIN_SPECS[kind].livery, nose);
  const key = `${livery.scheme}/${nose.toFixed(2)}`;
  let m = shells.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(LIGHT_GAIN) });
    if (typeof document !== 'undefined') {
      let t = textures.get(key);
      if (!t) {
        const c = document.createElement('canvas');
        c.width = TEX_W;
        c.height = TEX_H;
        paintSide(c.getContext('2d') as CanvasRenderingContext2D, livery, nose);
        t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        textures.set(key, t);
      }
      m.map = t;
    }
    shells.set(key, m);
  }
  return m;
}
