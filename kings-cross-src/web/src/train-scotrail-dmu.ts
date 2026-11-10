// The ScotRail diesel units as three.js models: the Class 170/4 Turbostar (sr170x3) and the Class 158 Express Sprinter (sr158x2),
// built from core/train-scotrail-dmu.ts and the photographs in the private review set (refs/scotrail170/scotrail170-01..05,
// refs/scotrail158/scotrail158-01..05; never shipped). Procedural: no image assets. A standalone builder (the EMR pattern), so
// nothing here touches the King's Cross kinds.
//
// Every size below that is not in core/train-scotrail-dmu.ts is ASSUMED: read by eye off those photographs against the published
// widths and the 170's published 3.77 m height, good to a few centimetres at best. Where a comment says "photo", the reading names
// the image. Nothing here claims a drawing.
//
// Frame: x across, y up from the rail head, the train's front nose at z = 0 and the train running to +z (as web/src/train.ts).
// Names the tests and the Edinburgh table rely on: car-<i> groups; body-shell, body-detail, cab-glass meshes; bogie-<i>-<k>
// groups; door, headlight, nose-coupler, gangway and roof-equipment markers.
import * as THREE from 'three';
import { SCOTRAIL_DMU_END_GAP, SCOTRAIL_DMU_FIGURES, scotrailDmuLayout } from '../../core/train-scotrail-dmu.ts';
import type { ScotrailDmuCar, ScotrailDmuFamily, ScotrailDmuKind, ScotrailDmuLayout } from '../../core/train-scotrail-dmu.ts';
import { clipConvex, col, ellipse, glassMaterial, gridNormals, plain, roundedRect, Soup } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, rakeSet, ringAt, ringStations } from './train-nose.ts';
import type { NoseSpec } from './train-nose.ts';
import { atlasRect, decalMaterial, registerAtlasTexts, textEms } from './livery.ts';
import { carSection, lensLook, SERVICE_LAMPS } from './train.ts';
import type { LensRole } from './train.ts';
import { couplerHalf, underfloorPod } from './train-parts.ts';
import { buildDmuBogie } from './train-scotrail-dmu-bogie.ts';
import type { DmuBogieStyle } from './train-scotrail-dmu-bogie.ts';
import type { CouplerStyle, PodForm } from './train-parts.ts';
import type { CaptureFormation } from './edinburgh-fleet.ts';

// --- the Saltire livery (photos: scotrail170-01/02, scotrail158-05; approximate shades, sampled in sun and shade) -------------
/** Saltire blue: the body. scotrail170-02 in sun samples about #263663; a shade darker is used, as the shade side reads near black. */
export const SALTIRE_BLUE = 0x22305e;
/** The warning yellow of both fronts (scotrail170-02 samples #fcc227 in sun). */
export const SR_YELLOW = 0xf4be1e;
/** The doors' grey (scotrail158-05, scotrail170-01: unpainted-looking silver grey). */
export const SR_DOOR = 0x8d8f8c;
/** The white and the light blue of the Saltire dot pattern. */
export const DOT_WHITE = 0xe6e9ee;
export const DOT_BLUE = 0x3d86c8;
/** The thin orange line at the cantrail and over the 170's windscreen (scotrail170-01). */
const PINSTRIPE = 0xd8642a;
export const FRAME = 0x14161a;
const RECESS = 0x0d0e10;
const UNDERFRAME = 0x2f2a25;
const VALANCE_DARK = 0x1c1d20;
const DISPLAY = 0x0d0e10;
const DISPLAY_TEXT = 0xffa000;
export const CHROME = 0xb8bcc2;
export const GANGWAY_RUBBER = 0x1b1c1f;
/**
 * The 158's front gangway surround, in the cab's frame (metres): the opening `inner` either side of the middle, the rubber out to
 * `outer`, from the sill up to the head (the opening's top) and on to its round-cornered top; `depth` out of the face, the inner lip
 * `lip` wide and stepped 4 cm back. ASSUMED, read off scotrail158-05 at about 375 px to the metre.
 */
export const GANGWAY_158 = { inner: 0.4, outer: 0.56, sill: 0.92, head: 3.12, top: 3.38, radius: 0.12, depth: 0.14, lip: 0.03 } as const;

const END_GAP = SCOTRAIL_DMU_END_GAP.value;
/** The first loft column of the roof's shoulder (web/src/train.ts carSection: two bottom-corner points, four up the wall, then the shoulder). */
const ROOF_COLUMN = 6;

/** One shape on a flat cab face, in the cab's own frame (x to the cab's right, y up), `lift` metres in front of the face's plane. */
interface FaceShape {
  name: string;
  outline: readonly (readonly [number, number])[];
  lift: number;
  colour?: number;
  glass?: boolean;
  lens?: 'head' | 'tail';
  mirror?: boolean;
  inset?: number;
  /** a solid: the outline stands this far out of its `lift` plane, with walls (a lens keeps every vertex of it in its range) */
  proud?: number;
  /** a solid's front face scaled about its middle by this (under 1: a domed lens), default 1 */
  crown?: number;
}

/**
 * Convex pieces covering the rectangle x0..x1, y0..y1 except a stadium (a pill: centre cx, cy, half-length hw, half-height hh, round
 * ends), so a raised panel built of them leaves the pill as a true recess. Each round end is followed by `n` strips.
 */
function aroundPill(x0: number, x1: number, y0: number, y1: number, cx: number, cy: number, hw: number, hh: number, n = 6): [number, number][][] {
  const out: [number, number][][] = [
    [[x0, cy + hh], [x1, cy + hh], [x1, y1], [x0, y1]],
    [[x0, y0], [x1, y0], [x1, cy - hh], [x0, cy - hh]],
  ];
  const end = (y: number): number => (hw - hh) + Math.sqrt(Math.max(0, hh * hh - (y - cy) * (y - cy)));
  for (let i = 0; i < n; i++) {
    const ya = cy - hh + (2 * hh * i) / n; const yb = cy - hh + (2 * hh * (i + 1)) / n;
    out.push([[x0, ya], [cx - end(ya), ya], [cx - end(yb), yb], [x0, yb]]);
    out.push([[cx + end(ya), ya], [x1, ya], [x1, yb], [cx + end(yb), yb]]);
  }
  return out;
}

/** The convex hull (counter-clockwise) of some points in a plane. */
function hull2(pts: readonly (readonly [number, number])[]): [number, number][] {
  const p = [...pts].map(([x, y]): [number, number] => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = []; const upper: [number, number][] = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** What one mass under the floor is: the shared pod forms, and the round ones the 158's underside shows (bogie-158-a2). */
export type DmuPodForm = PodForm | 'air-cleaner' | 'silencer' | 'reservoir';
/**
 * One mass hung under a car's floor between the bogies, its length along the car. Its shape: a box with its lower long edges cut back
 * (the shared pod, the default); `sloped`, that box with its ends raked in toward the bottom by `rake`; `drum-x`, a drum lying across the
 * car `half` either side of the middle, as tall as from `bottom` to the raft, its ends capped in `cap`; `drum-z`, a drum along the car of
 * radius `half` with its top at the raft, its middle `x` off the centre line, and a dark tail pipe out of its rear end.
 */
interface PodItem { form: DmuPodForm; length: number; half: number; bottom: number; colour: number; shape?: 'sloped' | 'drum-x' | 'drum-z'; rake?: number; cap?: number; x?: number }

/** Everything a family's look needs beyond the figures. All ASSUMED (see the header). */
interface Look {
  family: ScotrailDmuFamily;
  nose: NoseSpec;
  wallTop: number;
  /** the face's own colour under its shapes, and the loft's colour over the nose's front edge */
  faceColour: number;
  shapes: readonly FaceShape[];
  /** the colour of a quad on the nose, by its distance from the tip and its loft column k (0 the bottom corner; ROOF_COLUMN up is roof) (null: the body's own) */
  noseColour(s: number, k: number): number | null;
  /** a lamp on the nose's dome at height y over the middle (a headlight role: lit at the leading end) */
  domeLamp?: { y: number; rx: number; ry: number };
  roof: number;
  windowY: readonly [number, number];
  windowPitch: number;
  windowPier: number;
  windowRadius: number;
  /**
   * How the side windows are glazed. `band`: each run of panes between doors is one flush dark band (its corners at windowRadius), a
   * thin rubber `edge` round it and a dark `pillar` wide pillar standing on the glass where two panes meet. `framed`: every pane in its
   * own `frame`-wide surround, and the panes counted in `hoppers` (from the car's inner end, per side) carrying a hopper top-light: a
   * transom bar `drop` below the pane's top, the light above it standing a little proud.
   */
  glazing: { kind: 'band'; edge: number; pillar: number; pillarColour: number } | { kind: 'framed'; frame: number; frameColour: number; hoppers: readonly number[]; drop: number };
  /** door centres, metres from the cab end (a cab car) or from the car's start */
  doors(car: ScotrailDmuCar): number[];
  doorY: readonly [number, number];
  /** the window in each door leaf: its height range and corner radius */
  doorGlass: { y0: number; y1: number; r: number; inset: number };
  /** the cab's side window, metres from the tip */
  cabWindow: { s0: number; s1: number; y0: number; y1: number };
  coupler: { y: number };
  /** whose bogie is under it (train-scotrail-dmu-bogie) */
  bogie: DmuBogieStyle;
  buffers: boolean;
  gangwayFrame: boolean;
  underfloor: readonly PodItem[];
  /** Two raft rails under the floor over the underfloor masses (bogie-158-a2). */
  raft: boolean;
  /** The white dot field on a cab's flank: the dots' pitch up the side (the columns are 0.87 of it apart), their radius at the front, and the share of it they lose by the field's rear. */
  whiteDots: { pitch: number; r0: number; shrink: number };
  /** The roof's equipment, each piece placed from the roof photographs (see RoofGear). */
  roofGear: readonly RoofGear[];
  /** The roof's panel seams across it, `pitch` apart, and a rain strip along each shoulder; both a shade darker than the roof. */
  roofSeams: { pitch: number; colour: number };
}

/**
 * One piece of roof equipment. Stations s0..s1 are metres from the cab end (the car's start on a car with no cab), or from the inner
 * end with `fromEnd`; `cab` puts it only on driving cars. Across, x0..x1 are metres from the middle line with +x on the driver's right
 * at the cab end (so a one-sided piece keeps its side of the real car when the rear car is turned round). Heights are over the crown.
 *   - housing: a box with chamfered top edges along the car; `cap` a low round dome on it at station `at`
 *   - scoop: a housing whose face toward the cab end is a dark open mouth
 *   - louvred: a box whose inner-end face slopes, crossed by `slats` dark louvres, a dark mesh at its foot
 *   - plate: a thin flat plate (a riveted base under a group)
 *   - vents: a panel on one roof shoulder (`side` +1 or -1, `phi` radians up the shoulder from the wall top, `across` wide), `slots` dark openings along it
 */
type RoofGear = { name: string; s0: number; s1: number; colour: number; cab?: boolean; fromEnd?: boolean } & (
  | { kind: 'housing' | 'scoop' | 'louvred' | 'plate'; x0: number; x1: number; h: number; chamfer?: number; dark?: number; slats?: number; cap?: { at: number; x: number; r: number; h: number }; topVents?: { n: number; size: number; dark: number }; grille?: { slats: number; dark: number } }
  | { kind: 'vents'; side: 1 | -1; phi: number; across: number; slots: number; dark: number }
);

const box = (x0: number, x1: number, y0: number, y1: number, r = 0): [number, number][] => (r > 0 ? roundedRect(x0, x1, y0, y1, r, 3) : [[x1, y1], [x0, y1], [x0, y0], [x1, y0]]);
const disc = (cx: number, cy: number, r: number, n = 16): [number, number][] => ellipse(cx, cy, r, r, n);
/** A stadium (a pill): centre (cx, cy), half-length hw, half-height hh, round ends of radius hh; counter-clockwise. */
const pill = (cx: number, cy: number, hw: number, hh: number, n = 10): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; out.push([cx + (hw - hh) + hh * Math.cos(a), cy + hh * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI * i) / n; out.push([cx - (hw - hh) + hh * Math.cos(a), cy + hh * Math.sin(a)]); }
  return out;
};
/** A flat-footed arch: from y0 up to y1 at the middle, its top a superellipse of half-width `hw` and exponent `p` (larger is squarer). */
const arch = (hw: number, y0: number, y1: number, p: number, n = 48): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = hw * Math.cos((Math.PI * i) / n); // +hw to -hw: counter-clockwise over the top
    out.push([x, y0 + (y1 - y0) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / hw, p)), 1 / p)]);
  }
  return out;
};
const bar = (a: readonly [number, number], b: readonly [number, number], w: number): [number, number][] => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / l) * (w / 2);
  const ny = ((b[0] - a[0]) / l) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
};

// --- the Class 170/4 Turbostar ----------------------------------------------------------------------------------------------
//
// The front, from scotrail170-01 (nearly head-on from the left, about 188 px to the metre at the face against the published 3.77 m)
// and scotrail170-02/-03/-05: a blue face that leans back a little; a yellow band over the windscreen running back over the roof's
// front edge with a thin orange line along its foot; one broad screen in a black frame, divided by a centre post, the amber
// destination display behind its upper part on the cab's right; a yellow panel under the glass whose lower corners round off; an
// oval chrome-ringed lamp pod at each lower corner of the panel (the headlight outboard, the tail lamp inboard); a blue valance
// under it with the coupler (a BSI head, Porterbrook) in a dark recess and two small round buffers low at its outer corners.
// No gangway door and no front gangway: the 170/4 front is closed.
const T = SCOTRAIL_DMU_FIGURES.turbostar;
/** The 170's round lamp lenses on the face (cab's right; mirrored): centre and radius. ASSUMED, from scotrail170-01. */
export const LAMP_170 = { head: { x: 0.93, y: 1.43, r: 0.11 }, tail: { x: 0.71, y: 1.35, r: 0.072 } } as const;
/** The 170's silver lamp housing on the face (cab's right; mirrored): the convex hull of a round 35 mm wider than the headlight and one 28 mm wider than the tail lamp. ASSUMED. */
export const LAMP_170_HOUSING = hull2([...disc(LAMP_170.head.x, LAMP_170.head.y, LAMP_170.head.r + 0.035, 24), ...disc(LAMP_170.tail.x, LAMP_170.tail.y, LAMP_170.tail.r + 0.028, 24)]);
/** How far the housing stands out of the face (metres). ASSUMED, read off scotrail170-01's shadowed edge. */
export const LAMP_170_PROUD = 0.03;
/** The 170's valance box beside the coupler on the face (cab's right; mirrored), and how far it stands out. ASSUMED (Inverness 170624). */
export const VALANCE_170 = box(0.55, 1.13, 0.6, 0.98, 0.05);
export const VALANCE_170_PROUD = 0.08;
/** The 170's buffers' height, under the valance boxes (scotrail170-01). ASSUMED. */
export const BUFFER_170_Y = 0.48;
const TURBOSTAR: Look = {
  family: 'turbostar',
  nose: {
    length: 1.4,
    knots: [
      { s: 0, top: 3.64, ws: 0.95, bottom: 0.46 },
      { s: 0.35, top: 3.72, ws: 0.985, bottom: 0.5 },
      { s: 0.8, top: 3.76, ws: 1, bottom: 0.62 },
      { s: 1.4, top: T.height.value, ws: 1, bottom: T.floor.value },
    ],
    fillet: 0.22,
    filletLoss: 0.07,
    filletSteps: 9,
    roundLen: 1.2,
    widest: 0.45,
    boxiness: 4,
    // the face leans back about 7 degrees above the valance (scotrail170-01, -02: the screen's top stands behind its foot)
    rake: { lean: 0.12, from: 1.0, reach: 1.3 },
  },
  wallTop: 2.98,
  faceColour: SALTIRE_BLUE,
  shapes: [
    // the yellow brow over the screen, on the face only: an even band over the orange foot line, about 0.2 m deep right across (its top
    // a flat arch), its ends turning down with the face's own edge a navy margin inside it, so navy shows round it and the dome above
    // stays navy (scotrail170-01, -02); then its orange foot line. (Round 2's arch was a lens, thin at its ends.)
    { name: 'brow', outline: arch(1.25, 3.08, 3.45, 6), colour: SR_YELLOW, lift: 0.0015, inset: 0.03 },
    { name: 'brow-line', outline: box(-1.5, 1.5, 3.18, 3.215), colour: PINSTRIPE, lift: 0.003 },
    // the screen: a black frame, the glass, a centre post, the display behind the cab-right pane, two wipers parked in a V
    { name: 'screen-frame', outline: box(-1.12, 1.12, 1.9, 3.18, 0.16), colour: FRAME, lift: 0.003, inset: 0.03 },
    { name: 'screen', outline: box(-1.06, 1.06, 1.96, 3.12, 0.13), glass: true, lift: 0.0045, inset: 0.06 },
    { name: 'screen-post', outline: box(-0.035, 0.035, 1.96, 3.12), colour: FRAME, lift: 0.009 },
    { name: 'display', outline: box(0.08, 0.86, 2.92, 3.08, 0.01), colour: DISPLAY, lift: 0.0105 },
    { name: 'display-text', outline: box(0.14, 0.8, 2.97, 3.03), colour: DISPLAY_TEXT, lift: 0.012 },
    { name: 'wiper', outline: bar([0.58, 2.02], [0.08, 2.55], 0.03), colour: 0x3b4048, lift: 0.012, mirror: true },
    // the yellow panel under the glass, its lower corners rounded off
    { name: 'warning-panel', outline: box(-1.02, 1.02, 1.14, 1.92, 0.24), colour: SR_YELLOW, lift: 0.0015 },
    // each lamp cluster (scotrail170-01): a silver bezel of two overlapping rounds, a big round headlight outboard and a smaller round tail
    // lamp inboard and a little lower, wholly on the face (round 2's headlight ran off the face's edge and was cut to a D). Sizes and
    // places ASSUMED, read off the photograph's two clusters (near and far) against the 188 px/m face scale.
    // one shaped silver housing round both lamps, standing out of the face (scotrail170-01; roof-170-cowd shows it from above: the hull
    // of the two rounds), the lenses standing a little out of its front
    { name: 'lamp-housing', outline: LAMP_170_HOUSING, colour: CHROME, lift: 0.006, proud: LAMP_170_PROUD, mirror: true },
    { name: 'headlight', outline: disc(LAMP_170.head.x, LAMP_170.head.y, LAMP_170.head.r, 24), lens: 'head', lift: 0.006 + LAMP_170_PROUD + 0.001, proud: 0.008, mirror: true },
    { name: 'tail-lamp', outline: disc(LAMP_170.tail.x, LAMP_170.tail.y, LAMP_170.tail.r, 24), lens: 'tail', lift: 0.006 + LAMP_170_PROUD + 0.001, proud: 0.008, mirror: true },
    // the coupler's recess in the valance
    { name: 'recess', outline: box(-0.42, 0.42, 0.48, 1.0, 0.04), colour: RECESS, lift: 0.0015 },
    // round 6a: a large navy valance box either side of the coupler, standing out of the face (Inverness 170624, 170430 face-on,
    // CC BY-SA 2.0: from 0.55 m out to the face's edge, 0.38 m tall, read at about 290 px to the metre against the published 2.69 m
    // width). ASSUMED to that.
    { name: 'valance-box', outline: VALANCE_170, colour: SALTIRE_BLUE, lift: 0.002, proud: VALANCE_170_PROUD, mirror: true },
  ],
  // the dome over the face is Saltire navy, as the body (scotrail170-01, -02); the yellow is the face's brow only
  noseColour: (_s, k) => (k >= ROOF_COLUMN ? SALTIRE_BLUE : null),
  // the small white marker lamp on the dome over the brow's middle (scotrail170-01, -02), lit with the headlights
  domeLamp: { y: 3.6, rx: 0.075, ry: 0.045 },
  roof: 0x2b3554,
  windowY: [1.72, 2.78],
  // a near-continuous glazing band of panes about 1.4 m long with thin black pillars (scotrail170-01, -02): four panes between the
  // doors, as the photographs show (round 1 drew two 2.06 m panes there with wide piers); pane length ASSUMED
  windowPitch: 1.5,
  windowPier: 0.1,
  windowRadius: 0.06,
  // flush glazing: between the doors one dark band with thin pillars, no frame standing round each pane (t3c/a-inner, 170396 at
  // Inverkeithing, CC BY-SA; scotrail170-01, -02). Widths ASSUMED.
  glazing: { kind: 'band', edge: 0.012, pillar: 0.04, pillarColour: 0x1b1f27 },
  // two twin-leaf doors a side at about the thirds of every car (scotrail170-01: a single window and the cab ahead of the first door,
  // four bays between the doors, two behind the second on the driving car)
  doors: (car) => [car.length / 3, (2 * car.length) / 3],
  doorY: [1.06, 2.92],
  doorGlass: { y0: 1.72, y1: 2.72, r: 0.05, inset: 0.1 },
  cabWindow: { s0: 1.55, s1: 2.05, y0: 1.85, y1: 2.82 },
  coupler: { y: 0.72 },
  bogie: 'b5000',
  buffers: true,
  gangwayFrame: false,
  raft: false,
  // one MTU engine and a Voith transmission under every car (the 170's equipment, widely documented). Round 6a: the order, shapes and
  // depths from bogie-170-tyt (Tyseley Turbostars, CC BY-SA 2.0: a 170 broadside, its underside read at about 155 px to the metre
  // against the 2.6 m wheelbase), from the cab end: a deep dark fuel tank with square ends; a round air reservoir lying across the car
  // at its rear; the engine in a tall labelled case; the transmission's lower box; the cooler group, ending in a drum seen end-on.
  // Dark grey to near black, as the photograph shows. Sizes ASSUMED to that reading.
  underfloor: [
    { form: 'tank', length: 1.75, half: 0.95, bottom: 0.38, colour: 0x2c2d2f },
    { form: 'reservoir', length: 0.34, half: 0.62, bottom: 0.62, colour: 0x37393c, shape: 'drum-x', cap: 0x4b4e52 },
    { form: 'engine', length: 2.3, half: 0.9, bottom: 0.4, colour: 0x303235 },
    { form: 'transmission', length: 1.2, half: 0.8, bottom: 0.46, colour: 0x2a2b2e },
    { form: 'cooler', length: 1.5, half: 0.88, bottom: 0.44, colour: 0x333538 },
    { form: 'air-cleaner', length: 0.36, half: 0.7, bottom: 0.6, colour: 0x3a3c40, shape: 'drum-x', cap: 0x55585d },
    { form: 'battery', length: 1.0, half: 0.72, bottom: 0.5, colour: 0x2f3033 },
  ],
  whiteDots: { pitch: 0.118, r0: 0.05, shrink: 0.72 },
  // The roof, from two overhead photographs of 170/4 cab cars (roof-170-cowd: 170473 from Cowdenbeath's footbridge; roof-170-nott:
  // 170103 from Nottingham's car-park deck) with scotrail170-01's side view. Behind the dome: a small scoop open toward the cab, just to
  // the driver's right of the middle, and a long slatted grille on the driver's-left shoulder; then a broad, low, flat-topped housing a
  // little to the right of the middle with a small round cap at its rear, and beside it on the right shoulder a panel of small square
  // vents; further panels of square vents on the right shoulder near each car's ends and at its middle. Stations read through the
  // footbridge view's perspective (the spacing of the repeated vent panels against the 70.85 m unit); widths against the roof's width
  // at each station. Every size and place ASSUMED to that reading.
  roofGear: [
    { name: 'cab-scoop', kind: 'scoop', cab: true, s0: 1.85, s1: 2.3, x0: 0.2, x1: 0.58, h: 0.12, chamfer: 0.03, colour: 0x2a2e38, dark: 0x0b0c0e },
    { name: 'cab-grille', kind: 'vents', cab: true, s0: 1.9, s1: 3.6, side: -1, phi: (3 / 5) * (Math.PI / 2), across: 0.16, slots: 15, colour: 0x2a2d35, dark: 0x111216 },
    // round 6a, the scorer's reading of roof-170-cowd: a raised housing with a row of square vents along its top, beside it the long low
    // unit with a grille band along its top (its round cap at the rear), and further vent panels on both shoulders of every car
    { name: 'cab-vent-housing', kind: 'housing', cab: true, s0: 2.5, s1: 3.6, x0: 0.12, x1: 0.62, h: 0.11, chamfer: 0.03, colour: 0x303644, topVents: { n: 5, size: 0.11, dark: 0x0c0d10 } },
    { name: 'cab-roof-unit', kind: 'housing', cab: true, s0: 2.9, s1: 6.4, x0: -0.56, x1: 0.02, h: 0.08, chamfer: 0.03, colour: 0x2a2e38, cap: { at: 6.0, x: -0.27, r: 0.13, h: 0.05 }, grille: { slats: 18, dark: 0x101114 } },
    { name: 'cab-vents', kind: 'vents', cab: true, s0: 2.6, s1: 3.6, side: 1, phi: (3 / 5) * (Math.PI / 2), across: 0.18, slots: 6, colour: 0x2a2d35, dark: 0x111216 },
    { name: 'vents-front', kind: 'vents', s0: 5.4, s1: 6.4, side: -1, phi: (3 / 5) * (Math.PI / 2), across: 0.18, slots: 6, colour: 0x2a2d35, dark: 0x111216 },
    { name: 'vents-middle', kind: 'vents', s0: 11.3, s1: 12.3, side: 1, phi: (3 / 5) * (Math.PI / 2), across: 0.18, slots: 6, colour: 0x2a2d35, dark: 0x111216 },
    { name: 'vents-middle-left', kind: 'vents', s0: 11.3, s1: 12.3, side: -1, phi: (3 / 5) * (Math.PI / 2), across: 0.18, slots: 6, colour: 0x2a2d35, dark: 0x111216 },
    { name: 'vents-rear', kind: 'vents', fromEnd: true, s0: 5.4, s1: 6.4, side: -1, phi: (3 / 5) * (Math.PI / 2), across: 0.18, slots: 6, colour: 0x2a2d35, dark: 0x111216 },
    { name: 'vents-inner', kind: 'vents', fromEnd: true, s0: 0.9, s1: 1.9, side: 1, phi: (3 / 5) * (Math.PI / 2), across: 0.18, slots: 6, colour: 0x2a2d35, dark: 0x111216 },
  ],
  roofSeams: { pitch: 2.0, colour: 0x232c47 },
};

// --- the Class 158 Express Sprinter -----------------------------------------------------------------------------------------
//
// The front, from scotrail158-01 (nearly head on, about 260 px to the metre at the face) and scotrail158-02/-05: an upright yellow
// face, the roof's front a dark dome; at its middle the gangway door, a yellow leaf in a heavy black rubber frame that stands out of
// the face from the valance to the roof; either side a tall screen with rounded corners, a wiper hanging from its inner top corner,
// the destination display behind the top of the cab's left screen; under each screen a lamp housing (a white headlight outboard, a red
// tail lamp inboard), then a black horizontal recess, then the yellow valance down to the coupler (BSI, uncovered). The yellow wraps
// a hand's breadth round the cab corners; the Saltire blue begins behind it.
const S = SCOTRAIL_DMU_FIGURES.sprinter158;
const SPRINTER: Look = {
  family: 'sprinter158',
  nose: {
    length: 1.0,
    knots: [
      { s: 0, top: 3.5, ws: 0.96, bottom: 0.5 },
      { s: 0.3, top: 3.62, ws: 0.99, bottom: 0.56 },
      { s: 0.7, top: 3.7, ws: 1, bottom: 0.75 },
      { s: 1.0, top: S.height.value, ws: 1, bottom: S.floor.value },
    ],
    fillet: 0.2,
    filletLoss: 0.06,
    filletSteps: 9,
    roundLen: 0.9,
    widest: 0.45,
    boxiness: 4,
  },
  wallTop: 3.0,
  faceColour: SR_YELLOW,
  shapes: [
    // the screens: a black seal, the glass, the display behind the cab-left screen's top, a wiper from each inner top corner
    // (scotrail158-01, -05: each screen a rectangle with small rounded corners in a raised yellow surround and a black seal, its top a
    // hand's breadth under the face's top, so a yellow band runs across the face above both screens and the gangway frame)
    { name: 'screen-surround', outline: box(0.55, 1.27, 1.74, 3.24, 0.1), colour: 0xe0ac16, lift: 0.0015, mirror: true, inset: 0.03 },
    { name: 'screen-frame', outline: box(0.6, 1.22, 1.79, 3.19, 0.07), colour: FRAME, lift: 0.003, mirror: true, inset: 0.04 },
    { name: 'screen', outline: box(0.63, 1.19, 1.82, 3.16, 0.05), glass: true, lift: 0.0045, mirror: true, inset: 0.06 },
    // each screen split by a yellow transom about 1 m above its foot: the destination display fills the upper pane of the cab-left
    // screen (scotrail158-05: the orange dot-matrix in its own pane over the bar); the wiper pivots on the transom, its arm down and in
    { name: 'screen-transom', outline: box(0.6, 1.22, 2.8, 2.86), colour: 0xe0ac16, lift: 0.006, mirror: true },
    { name: 'display', outline: box(-1.16, -0.66, 2.9, 3.13, 0.01), colour: DISPLAY, lift: 0.0105 },
    { name: 'display-text', outline: box(-1.1, -0.72, 2.99, 3.05), colour: DISPLAY_TEXT, lift: 0.012 },
    { name: 'wiper', outline: bar([0.98, 2.79], [0.74, 2.24], 0.03), colour: 0x3b4048, lift: 0.012, mirror: true },
    // the gangway door's leaf (its rubber frame stands out of the face in 3D, see gangwayFrame) and its handle
    { name: 'door-leaf', outline: box(-0.34, 0.34, 0.92, 3.14, 0.02), colour: 0xe9b21a, lift: 0.0015 },
    // (scotrail158-01: a short upright grab handle in a dark recess)
    { name: 'door-handle-recess', outline: box(0.15, 0.26, 1.98, 2.2, 0.02), colour: FRAME, lift: 0.003 },
    { name: 'door-handle', outline: box(0.19, 0.22, 2.0, 2.18), colour: 0x9a9fa6, lift: 0.0045 },
    // under each screen a raised yellow lamp panel with a black pill-shaped recess let into it, and in the recess, standing out of its
    // floor, a domed round headlight outboard and a flatter round tail-and-marker cluster inboard (scotrail158-05, about 375 px to the
    // metre across the cab-left screen: the pill about 0.34 m by 0.17 m, the lenses about 0.14 m and 0.13 m across). ASSUMED to that reading.
    ...aroundPill(0.62, 1.2, 1.48, 1.76, 0.875, 1.615, 0.17, 0.085).map((outline): FaceShape => ({ name: 'lamp-panel', outline, colour: 0xd9a514, lift: 0.0045, proud: 0.035, mirror: true, inset: 0.0 })),
    { name: 'lamp-housing', outline: pill(0.875, 1.615, 0.17, 0.085), colour: 0x0c0d0e, lift: 0.0045, mirror: true },
    { name: 'headlight', outline: disc(0.96, 1.615, 0.07, 20), lens: 'head', lift: 0.005, proud: 0.03, crown: 0.8, mirror: true },
    { name: 'tail-lamp', outline: disc(0.785, 1.615, 0.065, 20), lens: 'tail', lift: 0.005, proud: 0.02, crown: 0.92, mirror: true },
    // the black horizontal recess under each lamp housing (jumper and pipe sockets behind it)
    { name: 'socket-recess', outline: box(0.62, 1.22, 0.8, 1.1, 0.06), colour: RECESS, lift: 0.0015, mirror: true },
    // the coupler's recess under the door
    { name: 'recess', outline: box(-0.4, 0.4, 0.5, 0.88, 0.03), colour: RECESS, lift: 0.0015 },
  ],
  // the yellow wraps a hand's breadth round the cab corners and just over the face's top edge, where a thin orange line meets the grey
  // roof (scotrail158-01, -05); no dark dome
  noseColour: (s, k) => (k >= ROOF_COLUMN ? (s < 0.1 ? SR_YELLOW : s < 0.13 ? PINSTRIPE : null) : s < 0.32 ? SR_YELLOW : null),  roof: 0x75787e,
  windowY: [1.75, 2.7],
  windowPitch: 1.62,
  windowPier: 0.3,
  windowRadius: 0.1,
  // separate panes in thin frames, the second and sixth from the inner end with a hopper top-light (t3c/e-inner, 158725 at
  // Dingwall, CC BY-SA 2.0). Frame width, transom drop and which panes ASSUMED from that photograph.
  glazing: { kind: 'framed', frame: 0.015, frameColour: 0x24262a, hoppers: [1, 5], drop: 0.26 },
  // a door at each end of every car (scotrail158-05: the cab side window, then the door; the inner door by the gangway)
  doors: (car) => [2.75, car.length - 1.4],
  doorY: [1.08, 2.92],
  doorGlass: { y0: 1.62, y1: 2.75, r: 0.1, inset: 0.12 },
  cabWindow: { s0: 1.12, s1: 1.82, y0: 1.82, y1: 2.78 },
  coupler: { y: 0.68 },
  bogie: 'brel-p4',
  // measured on scotrail158-05 against the cab side window (0.96 m tall here, about 120 px there): the big dots low in the field are about
  // 0.15 m across on a 0.17-0.18 m pitch, nearly touching, and those at the field's rear and top about 0.11 m (vertical sizes, which the
  // photograph's oblique view does not foreshorten). ASSUMED to within that reading.
  whiteDots: { pitch: 0.17, r0: 0.074, shrink: 0.4 },
  buffers: false,
  gangwayFrame: true,
  // one Cummins engine and its transmission under each car (widely documented for the class). The order and shapes from bogie-158-a2
  // (158890 on a low-loader, its underside in low sun, CC BY-SA 2.0), from the cab end: the fuel tank, its ends raked in toward the
  // bottom; a labelled equipment case; the engine's air cleaner, a drum lying across the car with a bright end cap; the engine with its
  // yellow fittings; the silencer, a long drum along the car off the centre line; the transmission; a reservoir drum across; a battery
  // box; all hung from a raft of two rails under the floor. Sizes ASSUMED, read off that photograph against the 2.6 m bogie wheelbase.
  underfloor: [
    { form: 'tank', length: 2.2, half: 0.95, bottom: 0.42, colour: 0x4a4238, shape: 'sloped', rake: 0.3 },
    { form: 'cooler', length: 1.4, half: 0.85, bottom: 0.46, colour: 0x4a4339 },
    { form: 'air-cleaner', length: 0.55, half: 0.72, bottom: 0.5, colour: 0x4f4a42, shape: 'drum-x', cap: 0xc9cdd2 },
    { form: 'engine', length: 2.2, half: 0.9, bottom: 0.38, colour: 0x433b31 },
    { form: 'silencer', length: 1.8, half: 0.17, bottom: 0.6, colour: 0x5e4a3a, shape: 'drum-z', x: 0.4 },
    { form: 'transmission', length: 1.1, half: 0.8, bottom: 0.44, colour: 0x3f382f },
    { form: 'reservoir', length: 0.5, half: 0.6, bottom: 0.55, colour: 0x3a3936, shape: 'drum-x', cap: 0x55534f },
    { form: 'battery', length: 1.0, half: 0.72, bottom: 0.52, colour: 0x433d35 },
  ],
  raft: true,
  // The roof, from roof-158-filton (158956's roof from above: a riveted base plate carrying a flat square cover and a louvred exhaust
  // box, its sloped face crossed by louvres over a mesh, and beside it toward the shoulder a low dark hump on its own base) and
  // roof-158-pil (158767 side-on from slightly below: those humps near each car's inner end, smoke rising there, and a low dark unit at
  // the roof's edge just behind the cab; scotrail158-05 and -01 show that unit on each side). Plain grey otherwise, with panel seams
  // across and a rain strip along each shoulder (roof-158-filton). Every size and place ASSUMED, read off those photographs against the
  // roof's width.
  roofGear: [
    { name: 'cab-roof-unit', kind: 'housing', cab: true, s0: 1.15, s1: 2.15, x0: 0.42, x1: 0.82, h: 0.08, chamfer: 0.03, colour: 0x1d1f23 },
    { name: 'cab-roof-unit', kind: 'housing', cab: true, s0: 1.15, s1: 2.15, x0: -0.82, x1: -0.42, h: 0.08, chamfer: 0.03, colour: 0x1d1f23 },
    { name: 'exhaust-plate', kind: 'plate', fromEnd: true, s0: 1.5, s1: 3.0, x0: -0.5, x1: 0.3, h: 0.012, colour: 0x4e5257 },
    { name: 'exhaust-cover', kind: 'housing', fromEnd: true, s0: 2.45, s1: 2.85, x0: -0.42, x1: -0.06, h: 0.07, chamfer: 0.02, colour: 0x3a3d41 },
    { name: 'exhaust', kind: 'louvred', fromEnd: true, s0: 1.65, s1: 2.3, x0: -0.25, x1: 0.22, h: 0.14, slats: 5, colour: 0x2a2c2f, dark: 0x0e0f10 },
    { name: 'roof-hump', kind: 'housing', fromEnd: true, s0: 2.2, s1: 3.0, x0: 0.4, x1: 0.74, h: 0.1, chamfer: 0.04, colour: 0x2a2c2f },
  ],
  roofSeams: { pitch: 2.2, colour: 0x686b71 },
};

const LOOKS: Readonly<Record<ScotrailDmuFamily, Look>> = { turbostar: TURBOSTAR, sprinter158: SPRINTER };
export const scotrailDmuLook = (family: ScotrailDmuFamily): Readonly<Look> => LOOKS[family];

/** A round bar along z: `n` flat sides, radius r, centred on (x, y), from z0 to z1, with both ends capped. */
function cylinderZ(soup: Soup, x: number, y: number, r: number, z0: number, z1: number, c: THREE.Color, n = 12): void {
  const ring = (z: number): V3[] => Array.from({ length: n }, (_, k): V3 => [x + r * Math.cos((2 * Math.PI * k) / n), y + r * Math.sin((2 * Math.PI * k) / n), z]);
  const a = ring(z0); const b = ring(z1);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    const mid = (2 * k + 1) * Math.PI / n;
    const nn: V3 = [Math.cos(mid), Math.sin(mid), 0];
    soup.quad([a[k]!, a[k1]!, b[k1]!, b[k]!], [nn, nn, nn, nn], c);
  }
  soup.fan(a, [0, 0, Math.sign(z0 - z1)], c);
  soup.fan(b, [0, 0, Math.sign(z1 - z0)], c);
}

/** A round bar across the car (along x): `n` flat sides, radius r, centred on (y, z), from x0 to x1, with both ends capped. */
function cylinderX(soup: Soup, x0: number, x1: number, y: number, z: number, r: number, c: THREE.Color, n = 12): void {
  const ring = (x: number): V3[] => Array.from({ length: n }, (_, k): V3 => [x, y + r * Math.cos((2 * Math.PI * k) / n), z + r * Math.sin((2 * Math.PI * k) / n)]);
  const a = ring(x0); const b = ring(x1);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    const mid = (2 * k + 1) * Math.PI / n;
    const nn: V3 = [0, Math.cos(mid), Math.sin(mid)];
    soup.quad([a[k]!, a[k1]!, b[k1]!, b[k]!], [nn, nn, nn, nn], c);
  }
  soup.fan(a, [Math.sign(x0 - x1), 0, 0], c);
  soup.fan(b, [Math.sign(x1 - x0), 0, 0], c);
}

/** A convex outline in (x, y), counter-clockwise, stood along z from z0 to z1: walls, and caps at both ends. */
function prismZ(soup: Soup, outline: readonly (readonly [number, number])[], z0: number, z1: number, c: THREE.Color): void {
  const m = outline.length;
  for (let k = 0; k < m; k++) {
    const [ax, ay] = outline[k]!; const [bx, by] = outline[(k + 1) % m]!;
    const l = Math.hypot(bx - ax, by - ay) || 1;
    const nn: V3 = [(by - ay) / l, -(bx - ax) / l, 0];
    soup.quad([[ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1]], [nn, nn, nn, nn], c);
  }
  soup.fan(outline.map(([x, y]): V3 => [x, y, z0]), [0, 0, Math.sign(z0 - z1)], c);
  soup.fan(outline.map(([x, y]): V3 => [x, y, z1]), [0, 0, Math.sign(z1 - z0)], c);
}

/** A box from y0 up to y1, `half` either side of the middle, its top corners rounded at radius r: counter-clockwise from the bottom left. */
export function roundTop(half: number, y0: number, y1: number, r: number, n = 6): [number, number][] {
  const pts: [number, number][] = [[-half, y0], [half, y0]];
  for (let i = 0; i <= n; i++) { const a = (i / n) * (Math.PI / 2); pts.push([half - r + r * Math.cos(a), y1 - r + r * Math.sin(a)]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (i / n) * (Math.PI / 2); pts.push([-half + r + r * Math.cos(a), y1 - r + r * Math.sin(a)]); }
  return pts;
}

/**
 * The BSI coupler at a cab end, out from the wall at z0 (dir the way out) to `reach`, its middle at height y, as the Inverness 170624
 * photograph shows it on 170430 and 158707 (CC BY-SA 2.0): ribbed draft-gear pads either side of the shank at the wall; the head with a
 * wide flat top plate and its round boss; a round tongue standing out sideways on the head's left as you face it, the dark pocket that
 * takes the other coupler's tongue right of the middle, a wedge under the pocket; a pneumatic port each side; and the electrical head, a grey drum
 * across under the coupler with its yellow warning triangle. Sizes ASSUMED, read off that photograph at about 260 px to the metre.
 */
export function bsiCoupler(soup: Soup, z0: number, dir: 1 | -1, reach: number, y: number): void {
  const zr = (u0: number, u1: number): [number, number] => (dir > 0 ? [z0 + u0, z0 + u1] : [z0 - u1, z0 - u0]);
  const zu = (u: number): number => z0 + dir * u;
  const steel = col(0x4d5157); const casing = col(0x5b6068); const plate = col(0x686d74); const face = col(0x17191c);
  const pocket = col(0x0b0c0d); const rubber = col(0x1d1e21); const pin = col(0x9aa0a8);
  // the side on the left of someone facing the coupler (+x when it points -z): the tongue's; the pocket is on the other, so two
  // couplers facing each other meet tongue to pocket, and a coupler at the other end is this one turned round
  const L = -dir;
  const xs = (a: number, b: number): [number, number] => [Math.min(L * a, L * b), Math.max(L * a, L * b)];
  // the draft gear: rubber pads and steel plates stacked out from the wall either side of the shank
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) soup.box(Math.min(sx * 0.2, sx * 0.3), Math.max(sx * 0.2, sx * 0.3), y - 0.13, y + 0.13, ...zr(k * 0.035, k * 0.035 + 0.035), k % 2 ? steel : rubber);
  soup.box(-0.08, 0.08, y - 0.08, y + 0.08, ...zr(0, reach - 0.3), steel);
  // the head, and its top plate standing wider than it, with the round boss on the plate's front
  soup.box(-0.16, 0.16, y - 0.12, y + 0.1, ...zr(reach - 0.3, reach - 0.012), casing);
  soup.box(-0.21, 0.21, y + 0.1, y + 0.17, ...zr(reach - 0.3, reach - 0.02), plate);
  cylinderZ(soup, 0, y + 0.135, 0.022, zu(reach - 0.02), zu(reach - 0.008), pin, 10);
  // the coupling face, the pocket (the head's front) and the wedge under it
  soup.box(-0.15, 0.15, y - 0.11, y + 0.09, ...zr(reach - 0.012, reach - 0.003), face);
  soup.box(...xs(-0.02, -0.13), y - 0.07, y + 0.06, ...zr(reach - 0.006, reach), pocket);
  soup.box(...xs(-0.03, -0.15), y - 0.2, y - 0.12, ...zr(reach - 0.14, reach - 0.02), casing);
  // the tongue, standing out sideways on the left
  cylinderX(soup, L * 0.27, L * 0.1, y - 0.01, zu(reach - 0.07), 0.035, pin);
  // the pneumatic ports
  for (const sx of [-1, 1]) soup.box(sx * 0.19 - 0.02, sx * 0.19 + 0.02, y - 0.1, y - 0.05, ...zr(reach - 0.12, reach - 0.03), pin);
  // the electrical head: a hanger, the drum across under the coupler, and the warning triangle on the drum's front
  soup.box(-0.04, 0.04, y - 0.2, y - 0.12, ...zr(reach - 0.18, reach - 0.08), steel);
  cylinderX(soup, -0.13, 0.13, y - 0.26, zu(reach - 0.13), 0.06, casing);
  const zl = zu(reach - 0.13 + 0.061); const nl: V3 = [0, 0, dir];
  soup.tri([[0, y - 0.225, zl], [-0.025, y - 0.27, zl], [0.025, y - 0.27, zl]], [nl, nl, nl], col(0xf2c21c));
}

/**
 * The gangway at a car's inner end (both classes), in metres: a rubber surround standing `frame` out of the end wall round the opening
 * (`inner` either side of the middle, posts out to `half`, from `sill` to its round-cornered head at `top`), then the pleated bellows on
 * to the car's end, meeting the next car's. Sizes ASSUMED: the surround as the 158's front one (scotrail158-05), the bellows from the
 * gaps between cars in scotrail170-01 and roof-170-cowd (a dark, rounded-topped connection a little narrower than the surround).
 */
export const GANGWAY_INNER = { inner: 0.42, half: 0.56, sill: 1.0, top: 2.98, radius: 0.18, frame: 0.07, bellows: { half: 0.5, sill: 1.06, top: 2.9, radius: 0.16 }, pleat: 0.07 } as const;

/** Window spans [from, to] of `pitch` with `pier` between, centred in the stretch (none where it is shorter than one window). */
function windowsIn(from: number, to: number, pitch: number, pier: number): [number, number][] {
  const n = Math.floor((to - from + pier) / pitch);
  if (n < 1) return [];
  const used = n * pitch - pier;
  const a = from + (to - from - used) / 2;
  return Array.from({ length: n }, (_, k): [number, number] => [a + k * pitch, a + k * pitch + pitch - pier]);
}

export interface CarPlanDmu { doors: number[]; windows: [number, number][]; nose: number }

/** Doors and windows of a car, metres from its cab end (a cab car) or its start. */
export function dmuCarPlan(car: ScotrailDmuCar, look: Look): CarPlanDmu {
  const f = SCOTRAIL_DMU_FIGURES[look.family];
  const dw = f.doorWidth.value;
  const doors = look.doors(car);
  const nose = car.cab ? look.nose.length : 0;
  const first = car.cab ? look.cabWindow.s1 + 0.3 : END_GAP + 0.35;
  const last = car.length - END_GAP - 0.35;
  const edges = [first, ...doors.flatMap((d) => [d - dw / 2 - 0.25, d + dw / 2 + 0.25]), last];
  const windows: [number, number][] = [];
  for (let i = 0; i + 1 < edges.length; i += 2) windows.push(...windowsIn(edges[i]!, edges[i + 1]!, look.windowPitch, look.windowPier));
  return { doors, windows, nose };
}

function carModel(car: ScotrailDmuCar, layout: ScotrailDmuLayout, look: Look): THREE.Group {
  const f = SCOTRAIL_DMU_FIGURES[look.family];
  const half = f.width.value / 2;
  const floor = f.floor.value;
  const crown = f.height.value;
  const sec = dmuSection(carSection({ half, floor, wallTop: look.wallTop, crown }), look);
  const W = sec.width;
  /** The side's half-width at height y (the tumblehome below the waist; W above it). */
  const sideX = (y: number): number => profileX(sec, y);
  const norm = normalised(sec);
  const egg = eggSection(norm, look.nose.widest, look.nose.boxiness);
  const plan = dmuCarPlan(car, look);
  const dir = car.cab === 'rear' ? -1 : 1;
  const base = car.cab === 'rear' ? car.end : car.start;
  const Z = (s: number): number => base + dir * s;
  const world = (p: V3): V3 => [p[0], p[1], Z(p[2])];
  const wn = (n: V3): V3 => [n[0], n[1], n[2] * dir];
  // a train-end face stands END_GAP back so the coupler (and the 170's buffers) reach the car's end; every body stops END_GAP short of an inner end
  const tip = END_GAP;
  const bodyEnd = car.length - END_GAP;
  const noseLen = car.cab ? look.nose.length : 0;

  const shell = new Soup();
  const detail = new Soup();
  const glass = new Soup();
  const decals = new Soup();
  /** The lamp lenses in `detail`, by the vertices each covers (web/src/train.ts LampLens: plain numbers, as userData is copied through JSON on a clone). */
  const lampLenses: { role: LensRole; v0: number; v1: number }[] = [];
  const group = new THREE.Group();
  group.name = `car-${car.index}`;
  group.userData = { ...car, kind: layout.spec.kind, family: look.family, allocation: 'assumed fleet', source: layout.spec.source };
  const marker = (name: string, x: number, y: number, s: number, data: Record<string, unknown> = {}): void => {
    const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, Z(s)); o.userData = data; group.add(o);
  };
  const boxS = (soup: Soup, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, colour: number): void => {
    const a = Z(s0); const b = Z(s1);
    soup.box(x0, x1, y0, y1, Math.min(a, b), Math.max(a, b), col(colour));
  };

  // --- the body: a loft of rings (the nose's, then the far end), its quads coloured by place -----------------------------------
  const rings: { s: number; pts: [number, number][] }[] = [];
  if (car.cab) for (const sn of ringStations(look.nose)) rings.push({ s: tip + sn, pts: loopFromHalf(halfAt(sec, norm, egg, ringAt(look.nose, sn))) });
  else rings.push({ s: tip, pts: loopFromHalf(sec.half as [number, number][]) });
  rings.push({ s: bodyEnd, pts: loopFromHalf(sec.half as [number, number][]) });
  const setBack = (sn: number, y: number): number => (car.cab ? rakeSet(look.nose, sn, y) : 0);
  const P = rings.map((r) => r.pts.map(([x, y]): V3 => [x, y, r.s + setBack(r.s - tip, y)]));
  // Colours follow the loft's columns (k: 0 at the bottom corner, K - 1 at the crown) and rings, so every colour edge runs along a
  // column or a ring: a clean curve, not the saw-tooth a height test cuts across the nose's sloping rings.
  const K = sec.half.length;
  const M = 2 * K - 1;
  const kOf = (m: number): number => (m < K ? m : M - 1 - m);
  // smooth shading across the loft (normals from the grid, pointing away from each ring's middle)
  const N = gridNormals(P, true, (i) => [0, (floor + crown) / 2, P[i]![0]![2]]);
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i]!; const b = P[i + 1]!;
    const sNear = rings[i]!.s - tip;
    const onNose = car.cab !== null && sNear < noseLen - 1e-9;
    for (let j = 0; j < a.length; j++) {
      const j1 = (j + 1) % a.length;
      const kmin = Math.min(kOf(j), kOf(j1));
      const kmax = Math.max(kOf(j), kOf(j1));
      const pts = [a[j]!, a[j1]!, b[j1]!, b[j]!] as [V3, V3, V3, V3];
      const ns = [N[i]![j]!, N[i]![j1]!, N[i + 1]![j1]!, N[i + 1]![j]!] as [V3, V3, V3, V3];
      let colour = kmin >= ROOF_COLUMN ? look.roof : SALTIRE_BLUE;
      if (kmax <= 1) colour = onNose ? (look.noseColour(sNear, kmin) ?? SALTIRE_BLUE) : UNDERFRAME;
      else if (onNose) colour = look.noseColour(sNear, kmin) ?? colour;
      shell.quad(pts.map(world) as [V3, V3, V3, V3], ns.map(wn) as [V3, V3, V3, V3], col(colour));
    }
  }
  // the inner end walls (dark), and the cab's face
  const endWall = (k: number, out: 1 | -1, colour: number): void => shell.fan(P[k]!.map(world), wn([0, 0, out]), col(colour));
  if (!car.cab) endWall(0, -1, 0x2d3035);
  endWall(P.length - 1, 1, 0x2d3035);

  if (car.cab) {
    const r0 = ringAt(look.nose, 0);
    const faceOutline = loopFromHalf(halfAt(sec, norm, egg, r0));
    // the loop runs up the right and down the left: make it counter-clockwise in (x, y) for the clip
    const area = faceOutline.reduce((acc, p, k) => { const q = faceOutline[(k + 1) % faceOutline.length]!; return acc + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ccw = area > 0 ? faceOutline : [...faceOutline].reverse();
    const lean = look.nose.rake ? look.nose.rake.lean : 0;
    const faceN: V3 = wn(normaliseV([0, lean, -1]));
    const onFace = (poly: readonly (readonly [number, number])[], lift: number): V3[] => poly.map(([x, y]): V3 => world([x, y, tip + setBack(0, y) - lift * Math.hypot(1, lean)]));
    shell.fan(onFace(ccw, 0), faceN, col(look.faceColour));
    // The train-end lamps, built in the state the cab end has in service (SERVICE_LAMPS) in the shared lens looks (web/src/train.ts
    // lensLook). Each lens records the vertices it covers in the detail mesh (userData.lamps, set below), which is how
    // setTrainLampState finds it again to show head, tail or off at either end.
    const lampMode = SERVICE_LAMPS[car.cab];
    /** A shape on the face: flat at its lift, or a solid standing `proud` out of it with walls (its front scaled by `crown`). */
    const drawShape = (poly: [number, number][], shape: FaceShape, colour: THREE.Color): void => {
      if (!shape.proud) { detail.fan(onFace(poly, shape.lift), faceN, colour); return; }
      const k = shape.crown ?? 1;
      const cx = poly.reduce((acc, p) => acc + p[0], 0) / poly.length;
      const cy = poly.reduce((acc, p) => acc + p[1], 0) / poly.length;
      const back = onFace(poly, shape.lift);
      const front = onFace(poly.map(([x, y]): [number, number] => [cx + (x - cx) * k, cy + (y - cy) * k]), shape.lift + shape.proud);
      detail.fan(front, faceN, colour);
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        // the wall's normal: out of the outline in the face's plane, leaning forward as the front narrows
        const ex = poly[j]![0] - poly[i]![0]; const ey = poly[j]![1] - poly[i]![1];
        const mx = (poly[i]![0] + poly[j]![0]) / 2 - cx; const my = (poly[i]![1] + poly[j]![1]) / 2 - cy;
        let nx = ey; let ny = -ex;
        if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
        const l = Math.hypot(nx, ny) || 1;
        // (the outline is already in the train's x, y; faceN is already turned for a rear cab)
        const n = normaliseV([nx / l + faceN[0] * (1 - k), ny / l + faceN[1] * (1 - k), faceN[2] * (1 - k)]);
        detail.quad([back[i]!, back[j]!, front[j]!, front[i]!], [n, n, n, n], colour);
      }
    };
    for (const shape of look.shapes) {
      for (const m of shape.mirror ? [1, -1] : [1]) {
        // the cab's own right (x > 0) is the train's +x at a front cab (it looks along -z) and -x at a rear one
        const cabX = (x: number): number => (car.cab === 'front' ? x : -x) * m;
        const poly = clipConvex(shape.outline.map(([x, y]): [number, number] => [cabX(x), y]), ccw, shape.inset ?? 0.01);
        if (poly.length < 3) continue;
        if (shape.glass) { glass.fan(onFace(poly, shape.lift), faceN, col(0x000000)); continue; }
        if (shape.lens) {
          const lens = lensLook(shape.lens, lampMode);
          const lit = lens.glow > 0;
          const v0 = detail.glow.length;
          detail.emit = lens.glow; // a lit lens glows in its own colour after dark; an unlit one does not
          drawShape(poly, shape, col(lens.hex));
          detail.emit = 0;
          lampLenses.push({ role: shape.lens, v0, v1: detail.glow.length });
          if (shape.lens === 'head') {
            const cx = poly.reduce((acc, p) => acc + p[0], 0) / poly.length;
            const cy = poly.reduce((acc, p) => acc + p[1], 0) / poly.length;
            marker('headlight', cx, cy, tip, { lit, role: 'head', proud: shape.proud ?? 0 });
          }
          continue;
        }
        drawShape(poly, shape, col(shape.colour ?? FRAME));
      }
    }
    if (look.domeLamp) {
      // on the dome: where the loft's crown line (column K - 1) passes the lamp's height, the lens laid on the surface's slope there
      const L = look.domeLamp;
      const crownAt = P.map((ring) => ring[K - 1]!);
      const i = crownAt.findIndex((p, n) => n + 1 < crownAt.length && p[1] <= L.y && crownAt[n + 1]![1] >= L.y);
      if (i >= 0) {
        const a = crownAt[i]!; const b = crownAt[i + 1]!;
        const t = (L.y - a[1]) / (b[1] - a[1] || 1);
        const zc = a[2] + t * (b[2] - a[2]);
        const tan = normaliseV([0, b[1] - a[1], b[2] - a[2]]); // up the dome
        const nrm: V3 = [0, tan[2], -tan[1]]; // out of it, forward and up
        const pts = ellipse(0, 0, L.rx, L.ry, 16).map(([u, v]): V3 => world([u, L.y + v * tan[1] + 0.012 * nrm[1], zc + v * tan[2] + 0.012 * nrm[2]]));
        const ring = ellipse(0, 0, L.rx + 0.02, L.ry + 0.02, 16).map(([u, v]): V3 => world([u, L.y + v * tan[1] + 0.006 * nrm[1], zc + v * tan[2] + 0.006 * nrm[2]]));
        detail.fan(ring, wn(nrm), col(CHROME));
        const lens = lensLook('head', lampMode);
        const v0 = detail.glow.length;
        detail.emit = lens.glow;
        detail.fan(pts, wn(nrm), col(lens.hex));
        detail.emit = 0;
        lampLenses.push({ role: 'head', v0, v1: detail.glow.length });
        marker('dome-lamp', 0, L.y, zc, { role: 'head', assumed: 'size and place read off scotrail170-01, -02' });
      }
    }
    // the coupler out of the face to the car's end: a BSI head on both classes (Porterbrook; scotrail158-01, scotrail170-01)
    const wall = tip + setBack(0, look.coupler.y);
    const style: CouplerStyle = 'bsi';
    bsiCoupler(detail, Z(wall), (-dir) as 1 | -1, wall, look.coupler.y);
    marker('nose-coupler', 0, look.coupler.y, wall / 2, { end: car.cab, style });
    if (look.buffers) {
      // two small round buffers low at the valance's outer corners, under the navy valance boxes (scotrail170-01, -02), out to 2 cm
      // inside the car's end
      for (const x of [-0.86, 0.86]) {
        cylinderZ(detail, x, BUFFER_170_Y, 0.07, Z(tip), Z(0.12), col(0x2a2c30));
        cylinderZ(detail, x, BUFFER_170_Y, 0.1, Z(0.12), Z(0.02), col(0x7e8288));
        marker('buffer', x, BUFFER_170_Y, 0.02);
      }
    }
    if (look.gangwayFrame) {
      // the 158's gangway surround (scotrail158-01, -05): heavy black rubber standing 0.14 m out of the face round the door, its posts
      // about 0.16 m wide, its head deeper (about 0.26 m) with round outer corners, a narrower lip stepped back round the opening, and
      // a line of light fasteners down each post and across the head. Sizes ASSUMED, read off -05 at about 375 px to the metre.
      const g = GANGWAY_158;
      const rubber = col(GANGWAY_RUBBER);
      const solid = (outline: [number, number][], lift: number, proud: number, c: THREE.Color): void => drawShape(outline, { name: 'gangway', outline, lift, proud }, c);
      for (const sx of [-1, 1]) solid(box(sx * g.inner, sx * g.outer, g.sill, g.head).map(([x, y]): [number, number] => [x, y]), 0, g.depth, rubber);
      const corner = (cx: number, a0: number): [number, number][] => Array.from({ length: 7 }, (_, i): [number, number] => [cx + g.radius * Math.cos(a0 + (i * Math.PI) / 12), g.top - g.radius + g.radius * Math.sin(a0 + (i * Math.PI) / 12)]);
      solid([[-g.outer, g.head], [g.outer, g.head], ...corner(g.outer - g.radius, 0), ...corner(-g.outer + g.radius, Math.PI / 2)], 0, g.depth, rubber);
      solid(box(-g.outer, g.outer, g.sill - 0.08, g.sill), 0, g.depth, rubber);
      // the lip, stepped back 4 cm round the opening, a shade lighter
      const lip = col(0x2c2d30);
      for (const sx of [-1, 1]) solid(box(sx * (g.inner - g.lip), sx * g.inner, g.sill, g.head), 0, g.depth - 0.04, lip);
      solid(box(-g.inner, g.inner, g.head - g.lip, g.head), 0, g.depth - 0.04, lip);
      // the fasteners on its front
      const dot = col(0x8a8d90);
      for (const sx of [-1, 1]) for (let y = g.sill + 0.1; y < g.head; y += 0.12) solid(disc(sx * (g.inner + g.outer) / 2, y, 0.009, 6), g.depth, 0.002, dot);
      for (let x = -g.inner; x <= g.inner + 1e-9; x += 0.1) solid(disc(x, (g.head + g.top) / 2 + 0.03, 0.009, 6), g.depth, 0.002, dot);
      marker('gangway', 0, 2.1, tip - g.depth, { front: true, closed: true, depth: g.depth, lip: g.lip, top: g.top, radius: g.radius });
    }
    if (look.family === 'sprinter158') {
      // the 158's plough (scotrail158-01, -05): two deep yellow plates either side of the coupler, from the valance's foot down to a hand
      // above the rail head, their lower edge standing forward of the upper and their outer ends swept back; the bottom edge worn dark.
      // Sizes ASSUMED from the photographs.
      for (const side of [-1, 1]) {
        const at = (x: number, y: number, s: number): V3 => world([side * x, y, s]);
        const topIn = at(0.3, 0.62, tip + 0.06); const topOut = at(1.16, 0.62, tip + 0.3);
        const lowIn = at(0.3, 0.2, tip - 0.14); const lowOut = at(1.08, 0.2, tip + 0.1);
        const edgeIn = at(0.3, 0.13, tip - 0.17); const edgeOut = at(1.06, 0.13, tip + 0.07);
        plate(detail, [topIn, topOut, lowOut, lowIn], SR_YELLOW);
        plate(detail, [lowIn, lowOut, edgeOut, edgeIn], 0x4a3a28);
      }
      // the valance's foot behind the plough, so no daylight shows over it
      boxS(detail, -1.12, 1.12, 0.52, 0.64, tip + 0.02, tip + 0.6, SR_YELLOW);
      marker('plough', 0, 0.4, tip, { sloped: true, assumed: true });
    } else {
      // the 170's valance foot under the face (dark), so the face does not float over the rails
      boxS(detail, -1.12, 1.12, 0.4, 0.52, tip + 0.02, tip + 0.6, VALANCE_DARK);
    }
  }

  // --- the sides: doors, windows, the cab side window, the cantrail line, the Saltire dots ------------------------------------------
  const holes: [number, number, number, number][] = [];
  const dw = f.doorWidth.value;
  // the waist: the side is upright above it and draws in below it (dmuSection), and the doors' lower parts follow it
  const waist = sec.half[4]![1];
  const lowYs = [look.doorY[0], ...sec.half.slice(2, 4).map(([, y]) => y).filter((y) => y > look.doorY[0] && y < waist), waist];
  for (const s of plan.doors) for (const side of [-1, 1]) {
    const x0 = side * W; const x1 = side * (W + 0.02);
    boxS(detail, Math.min(x0, x1), Math.max(x0, x1), waist, look.doorY[1], s - dw / 2, s + dw / 2, SR_DOOR);
    // the leaves' lower part, 2 cm proud of the drawn-in side, and its front and back edges
    for (let i = 0; i + 1 < lowYs.length; i++) {
      const ya = lowYs[i]!; const yb = lowYs[i + 1]!;
      const xa = side * (sideX(ya) + 0.02); const xb = side * (sideX(yb) + 0.02);
      plate(detail, [[xa, ya, Z(s - dw / 2)], [xa, ya, Z(s + dw / 2)], [xb, yb, Z(s + dw / 2)], [xb, yb, Z(s - dw / 2)]], SR_DOOR);
      const ia = side * sideX(ya); const ib = side * sideX(yb);
      for (const e of [s - dw / 2, s + dw / 2]) plate(detail, [[ia, ya, Z(e)], [xa, ya, Z(e)], [xb, yb, Z(e)], [ib, yb, Z(e)]], SR_DOOR);
      const sa = side * (sideX(ya) + 0.022); const sb = side * (sideX(yb) + 0.022);
      plate(detail, [[sa, ya, Z(s - 0.012)], [sa, ya, Z(s + 0.012)], [sb, yb, Z(s + 0.012)], [sb, yb, Z(s - 0.012)]], 0x3a3c3f);
    }
    // two leaves, the seam between them, a window in each
    boxS(detail, Math.min(x0, x1) - 0.002, Math.max(x0, x1) + 0.002, waist, look.doorY[1], s - 0.012, s + 0.012, 0x3a3c3f);
    for (const leaf of [-1, 1]) {
      const c = s + (leaf * dw) / 4;
      const w = dw / 2 - 2 * look.doorGlass.inset;
      glass.prismX(roundedRect(Z(c) - w / 2, Z(c) + w / 2, look.doorGlass.y0, look.doorGlass.y1, look.doorGlass.r, 3), side * (W + 0.02), side * (W + 0.026), col(0x000000));
    }
    marker('door', side * W, (look.doorY[0] + look.doorY[1]) / 2, s, { side: side < 0 ? 'left' : 'right', width: dw, leaves: 2 });
  }
  for (const s of plan.doors) holes.push([s - dw / 2 - 0.12, s + dw / 2 + 0.12, 0, 9]);
  const gz = look.glazing;
  const frameW = gz.kind === 'framed' ? gz.frame : gz.edge;
  const frameC = gz.kind === 'framed' ? gz.frameColour : FRAME;
  const windowFrame = (s0: number, s1: number, y0: number, y1: number, r: number): void => {
    for (const side of [-1, 1]) {
      detail.prismX(roundedRect(Math.min(Z(s0), Z(s1)) - frameW, Math.max(Z(s0), Z(s1)) + frameW, y0 - frameW, y1 + frameW, r + frameW, 3), side * W, side * (W + 0.004), col(frameC), false);
      glass.prismX(roundedRect(Math.min(Z(s0), Z(s1)), Math.max(Z(s0), Z(s1)), y0, y1, r, 3), side * W, side * (W + 0.008), col(0x000000));
    }
    holes.push([s0 - 0.1, s1 + 0.1, y0 - 0.1, y1 + 0.1]);
  };
  const [wy0, wy1] = look.windowY;
  if (gz.kind === 'band') {
    // runs of panes no more than a pier apart become one band; a pillar stands on the glass where each pair met
    const runs: [number, number][][] = [];
    for (const w of plan.windows) {
      const last = runs[runs.length - 1];
      if (last && w[0] - last[last.length - 1]![1] <= look.windowPier + 1e-6) last.push(w); else runs.push([w]);
    }
    for (const run of runs) {
      const a = run[0]![0]; const b = run[run.length - 1]![1];
      windowFrame(a, b, wy0, wy1, look.windowRadius);
      const pillars: number[] = [];
      for (let i = 0; i + 1 < run.length; i++) pillars.push((run[i]![1] + run[i + 1]![0]) / 2);
      for (const side of [-1, 1]) for (const s of pillars) {
        const x0 = side * (W + 0.008); const x1 = side * (W + 0.011);
        boxS(detail, Math.min(x0, x1), Math.max(x0, x1), wy0, wy1, s - gz.pillar / 2, s + gz.pillar / 2, gz.pillarColour);
      }
      marker('glazing', W, (wy0 + wy1) / 2, (a + b) / 2, { kind: 'band', s: [a, b], panes: run.length, pillars });
    }
  } else {
    // the panes counted from the car's inner end (the end without a cab; on a car with no cab, from its far end)
    const n = plan.windows.length;
    plan.windows.forEach(([s0, s1], i) => {
      windowFrame(s0, s1, wy0, wy1, look.windowRadius);
      const fromInner = n - 1 - i;
      const hopper = gz.hoppers.includes(fromInner);
      if (hopper) {
        const yb = wy1 - gz.drop;
        for (const side of [-1, 1]) {
          // the transom bar across the pane, and the top-light standing proud of the pane below it
          const x0 = side * (W + 0.008); const x1 = side * (W + 0.012);
          boxS(detail, Math.min(x0, x1), Math.max(x0, x1), yb - 0.0125, yb + 0.0125, s0, s1, gz.frameColour);
          const lo = Math.min(Z(s0), Z(s1)) + 0.01; const hi = Math.max(Z(s0), Z(s1)) - 0.01;
          glass.prismX(roundedRect(lo, hi, yb + 0.0125, wy1 - 0.01, Math.min(look.windowRadius, 0.05), 3), side * (W + 0.008), side * (W + 0.02), col(0x000000));
        }
      }
      marker('glazing', W, (wy0 + wy1) / 2, (s0 + s1) / 2, { kind: 'framed', s: [s0, s1], frame: gz.frame, hopper, hopperY: hopper ? wy1 - gz.drop : null });
    });
  }
  if (car.cab) windowFrame(look.cabWindow.s0, look.cabWindow.s1, look.cabWindow.y0, look.cabWindow.y1, 0.06);
  // the thin orange line along the cantrail
  for (const side of [-1, 1]) {
    const x0 = side * W; const x1 = side * (W + 0.003);
    boxS(detail, Math.min(x0, x1), Math.max(x0, x1), 2.93, 2.955, car.cab ? noseLen : 0.05, car.length - END_GAP - 0.05, PINSTRIPE);
  }
  // The lettering (web/src/livery.ts atlas): the ScotRail wordmark in white low on each side of every car, no plate behind it. On the
  // 170 a little behind the first door and the white field's end, over the blue dot field, which runs on under it (scotrail170-01);
  // on the 158 just after the blue field's rear end, over the navy (scotrail158-05). Size and place ASSUMED from the photographs.
  {
    const em = 0.2;
    // (the 158's sits at the blue field's rear end, over the navy, as scotrail158-05 shows; the 170's over the blue field, as -01 shows)
    const s0 = look.family === 'sprinter158'
      ? blueField(car, look, plan)[1] + 0.12
      : Math.max((plan.doors[0] ?? 3) + dw / 2 + 0.55, car.cab ? whiteFieldEnd(look, plan) + 0.15 : 0);
    const s1 = s0 + textEms(WORDMARK) * em;
    const y0 = 1.3;
    // (laid on the drawn-in side below the waist, a flat quad: its chord sags inside the side where it spans the section's knee, so each
    // corner stands out by that sag plus 8 mm, clear of the dots under it, which stand 5 mm proud)
    const chord = (y: number): number => sideX(y0) + ((y - y0) / em) * (sideX(y0 + em) - sideX(y0));
    let sag = 0;
    for (let i = 1; i < 20; i++) sag = Math.max(sag, sideX(y0 + (i * em) / 20) - chord(y0 + (i * em) / 20));
    for (const sx of [-1, 1]) {
      const verts = ([[s0, y0], [s1, y0], [s1, y0 + em], [s0, y0 + em]] as const).map(([s, y]): V3 => [sx * (sideX(y) + sag + 0.008), y, Z(s)]);
      // u runs with the lettering, toward the viewer's right: +z on the left side (x < 0), -z on the right
      const forward = (Z(s1) > Z(s0)) === (sx < 0);
      textQuad(decals, verts, WORDMARK, forward, [sx, 0, 0], 0xffffff);
    }
    marker('lettering', W, y0 + em / 2, (s0 + s1) / 2, { text: WORDMARK, em });
  }
  // where the nose's loft is at (s from the cab end, height y): its half-width, from the ring's outline at that height, and the rake's set-back
  const noseSide = (s: number, y: number): { x: number; s: number } => {
    const sn = Math.min(Math.max(s - tip, 0), noseLen);
    const h = halfAt(sec, norm, egg, ringAt(look.nose, sn));
    let x = W;
    for (let k = 0; k + 1 < h.length; k++) {
      const [x0, y0] = h[k]!; const [x1, y1] = h[k + 1]!;
      if ((y - y0) * (y - y1) <= 0 && y1 !== y0) { x = x0 + ((y - y0) / (y1 - y0)) * (x1 - x0); break; }
    }
    return { x, s: s + setBack(sn, y) };
  };
  // the yellow line over the first-class windows of the 170's DMCL, from behind the cab to the first door (scotrail170-02); the white
  // dot field, which runs on 1.25 m past the cab side window, stops 2 cm short of it (a lone dot sat on the line's start)
  const firstClass = car.type === 'DMCL' ? { from: look.cabWindow.s1 + 0.2, to: (plan.doors[0] ?? 3) - dw / 2 - 0.12 } : null;
  if (firstClass) holes.push([firstClass.from - 0.02, firstClass.to + 0.02, look.windowY[1] + 0.05, look.windowY[1] + 0.12]);
  saltireDots(detail, car, plan, look, sideX, Z, holes, noseSide);
  if (firstClass) {
    const { from, to } = firstClass;
    for (const side of [-1, 1]) {
      const x0 = side * W; const x1 = side * (W + 0.0045);
      boxS(detail, Math.min(x0, x1), Math.max(x0, x1), look.windowY[1] + 0.07, look.windowY[1] + 0.1, from, to, SR_YELLOW);
    }
    marker('first-class-line', W, look.windowY[1] + 0.085, (from + to) / 2, { colour: 'yellow', assumed: 'height and ends read off scotrail170-02' });
  }

  // --- the roof: no pantograph (diesel units); its equipment, seams and rain strips as the roof photographs show (see roofGear) ---------
  {
    // the roof's half-profile from the wall top over the shoulder to the middle (carSection: an elliptic quarter, then a near-flat crown)
    const prof = (sec.half as [number, number][]).filter(([, y]) => y >= look.wallTop - 1e-6);
    const rx = 0.55; const ry = crown - look.wallTop - 0.012;
    /** A point on the shoulder's ellipse at angle phi (radians up from the wall top), `a` along its tangent and `lift` out along its normal, on side `side`. */
    const onShoulder = (side: number, phi: number, a: number, lift: number): { p: (s: number) => V3; n: V3 } => {
      const cx = W - rx + rx * Math.cos(phi); const cy = look.wallTop + ry * Math.sin(phi);
      const nrm = new THREE.Vector3(Math.cos(phi) / rx, Math.sin(phi) / ry, 0).normalize();
      const tan = new THREE.Vector3(-rx * Math.sin(phi), ry * Math.cos(phi), 0).normalize();
      return { p: (s) => [side * (cx + tan.x * a + nrm.x * lift), cy + tan.y * a + nrm.y * lift, Z(s)], n: [side * nrm.x, nrm.y, 0] };
    };
    const shoulderQuad = (side: number, phi: number, s0: number, s1: number, a0: number, a1: number, lift: number, c: number): void => {
      const A = onShoulder(side, phi, a0, lift); const B = onShoulder(side, phi, a1, lift);
      detail.quad([A.p(s0), B.p(s0), B.p(s1), A.p(s1)], [A.n, A.n, A.n, A.n], col(c));
    };
    const roofFrom = car.cab ? tip + noseLen : tip;
    // the seams across the roof, from shoulder to shoulder over the crown, 2 cm wide and 2 mm proud
    const seam = (s: number): void => {
      for (const side of [-1, 1]) {
        for (let k = 0; k + 1 < prof.length; k++) {
          const [xa, ya] = prof[k]!; const [xb, yb] = prof[k + 1]!;
          const e = Math.hypot(xb - xa, yb - ya) || 1;
          const n: V3 = [side * ((yb - ya) / e), -(xb - xa) / e, 0];
          const at = (x: number, y: number, ss: number): V3 => [side * x + n[0] * 0.002, y + n[1] * 0.002, Z(ss)];
          detail.quad([at(xa, ya, s - 0.01), at(xb, yb, s - 0.01), at(xb, yb, s + 0.01), at(xa, ya, s + 0.01)], [n, n, n, n], col(look.roofSeams.colour));
        }
      }
    };
    const seams: number[] = [];
    for (let s = roofFrom + look.roofSeams.pitch / 2; s < bodyEnd - 0.2; s += look.roofSeams.pitch) { seam(s); seams.push(s); }
    // a rain strip along each shoulder, low on it
    for (const side of [-1, 1]) shoulderQuad(side, (1 / 5) * (Math.PI / 2), roofFrom, bodyEnd - 0.05, -0.012, 0.012, 0.004, look.roofSeams.colour);
    marker('roof-seams', 0, crown, (roofFrom + bodyEnd) / 2, { at: seams, rainStrips: 2 });

    const base0 = crown - 0.04;
    for (const g of look.roofGear) {
      if (g.cab && !car.cab) continue;
      const s0 = g.fromEnd ? car.length - g.s1 : g.s0;
      const s1 = g.fromEnd ? car.length - g.s0 : g.s1;
      const lo = Math.min(s0, s1); const hi = Math.max(s0, s1);
      if (g.kind === 'vents') {
        // a panel on the shoulder, its slots along the car (the photographs' rows of small square openings, or a long grille)
        const side = g.side * dir;
        shoulderQuad(side, g.phi, lo, hi, -g.across / 2, g.across / 2, 0.005, g.colour);
        const pitch = (hi - lo) / g.slots;
        for (let k = 0; k < g.slots; k++) {
          const a = lo + k * pitch + pitch * 0.2;
          shoulderQuad(side, g.phi, a, a + pitch * 0.55, -g.across / 2 + 0.025, g.across / 2 - 0.025, 0.009, g.dark);
        }
        const c = onShoulder(side, g.phi, 0, 0.005).p((lo + hi) / 2);
        marker('roof-equipment', c[0], c[1], (lo + hi) / 2, { name: g.name, kind: g.kind, s: [lo, hi], side, slots: g.slots, assumed: true });
        continue;
      }
      // (x0..x1 on the driver's right at the cab end: turned round with a rear car, so a one-sided piece stays on its side of the real car)
      const xa = Math.min(g.x0 * dir, g.x1 * dir); const xb = Math.max(g.x0 * dir, g.x1 * dir);
      const top = crown + g.h;
      const ch = Math.min(g.chamfer ?? 0, g.h / 2, (hi - lo) / 3);
      // toward the inner end is +s on a car with no cab or a front cab car, as Z runs; the profile is built in s, then mapped
      const towardInner = g.fromEnd ? 1 : -1;
      let outline: [number, number][];
      if (g.kind === 'plate') {
        outline = [[lo, base0], [lo, top], [hi, top], [hi, base0]];
      } else if (g.kind === 'louvred') {
        // the face toward the car's inner end slopes down over the box's rear 45 per cent
        const run = 0.45 * (hi - lo);
        const foot = crown + 0.02;
        outline = towardInner > 0
          ? [[lo, base0], [lo, top], [hi - run, top], [hi, foot], [hi, base0]]
          : [[hi, base0], [hi, top], [lo + run, top], [lo, foot], [lo, base0]];
      } else {
        outline = [[lo, base0], [lo, top - ch], [lo + ch, top], [hi - ch, top], [hi, top - ch], [hi, base0]];
      }
      const zy = outline.map(([s, y]): [number, number] => [Z(s), y]);
      detail.prismX(zy, xa, xb, col(g.colour));
      detail.prismX(zy, xb, xa, col(g.colour), false);
      if (g.kind === 'louvred') {
        // the louvres on the slope, each a dark band 3 mm proud of it, and a dark mesh along its foot
        const run = 0.45 * (hi - lo);
        const sTop = towardInner > 0 ? hi - run : lo + run; const sFoot = towardInner > 0 ? hi : lo;
        const foot = crown + 0.02;
        const slope = new THREE.Vector3(0, foot - top, Z(sFoot) - Z(sTop));
        const nrm = new THREE.Vector3(0, Math.abs(slope.z), 0).add(new THREE.Vector3(0, 0, Math.sign(Z(sFoot) - Z(sTop)) * Math.abs(slope.y))).normalize();
        const n: V3 = [0, nrm.y, nrm.z];
        const along = (t: number, lift: number, x: number): V3 => [x, top + (foot - top) * t + nrm.y * lift, Z(sTop) + (Z(sFoot) - Z(sTop)) * t + nrm.z * lift];
        const slats = g.slats ?? 4;
        for (let k = 0; k < slats; k++) {
          const t0 = (k + 0.25) / (slats + 1); const t1 = (k + 0.75) / (slats + 1);
          detail.quad([along(t0, 0.003, xa + 0.02), along(t0, 0.003, xb - 0.02), along(t1, 0.003, xb - 0.02), along(t1, 0.003, xa + 0.02)], [n, n, n, n], col(g.dark ?? 0x000000));
        }
        const m0 = slats / (slats + 1);
        detail.quad([along(m0, 0.003, xa + 0.02), along(m0, 0.003, xb - 0.02), along(0.97, 0.003, xb - 0.02), along(0.97, 0.003, xa + 0.02)], [n, n, n, n], col(0x55585c));
      }
      if (g.kind === 'scoop') {
        // its mouth: the face toward the cab end, dark, 3 mm before it
        const zf = Z(lo - 0.003);
        const n: V3 = [0, 0, -dir];
        detail.quad([[xa + 0.03, crown + 0.012, zf], [xb - 0.03, crown + 0.012, zf], [xb - 0.03, top - ch - 0.01, zf], [xa + 0.03, top - ch - 0.01, zf]], [n, n, n, n], col(g.dark ?? 0x000000));
      }
      if (g.kind === 'housing' && (g.topVents || g.grille)) {
        // on its top, 2 mm proud: a row of square vents down its middle, or a grille band of slats across it, inside the chamfers
        const n: V3 = [0, 1, 0]; const y = top + 0.002;
        const xm = (xa + xb) / 2; const sa = lo + ch + 0.04; const sb = hi - ch - 0.04;
        if (g.topVents) {
          const v = g.topVents; const pitch = (sb - sa) / v.n;
          for (let k = 0; k < v.n; k++) {
            const sc = sa + (k + 0.5) * pitch; const hs = Math.min(v.size, pitch * 0.8) / 2;
            detail.quad([[xm - hs, y, Z(sc - hs)], [xm + hs, y, Z(sc - hs)], [xm + hs, y, Z(sc + hs)], [xm - hs, y, Z(sc + hs)]], [n, n, n, n], col(v.dark));
          }
        }
        if (g.grille) {
          const gr = g.grille; const pitch = (sb - sa) / gr.slats; const x0 = xa + ch + 0.05; const x1 = xb - ch - 0.05;
          for (let k = 0; k < gr.slats; k++) {
            const a = sa + k * pitch + pitch * 0.25; const b = a + pitch * 0.5;
            detail.quad([[x0, y, Z(a)], [x1, y, Z(a)], [x1, y, Z(b)], [x0, y, Z(b)]], [n, n, n, n], col(gr.dark));
          }
        }
      }
      if (g.cap) {
        // a low round cap on the housing: a 12-sided frustum, its top 0.55 of its foot
        const cx = g.cap.x * dir; const cz = Z(g.cap.at); const r0 = g.cap.r; const r1 = g.cap.r * 0.55; const y0 = top - 0.005; const y1 = top + g.cap.h;
        const ring = (r: number, y: number): V3[] => Array.from({ length: 12 }, (_, k): V3 => [cx + r * Math.cos((2 * Math.PI * k) / 12), y, cz + r * Math.sin((2 * Math.PI * k) / 12)]);
        const a = ring(r0, y0); const b = ring(r1, y1);
        for (let k = 0; k < 12; k++) {
          const k1 = (k + 1) % 12; const mid = ((2 * k + 1) * Math.PI) / 12;
          const nn: V3 = [Math.cos(mid), (r0 - r1) / g.cap.h, Math.sin(mid)];
          detail.quad([a[k]!, a[k1]!, b[k1]!, b[k]!], [nn, nn, nn, nn], col(g.colour));
        }
        detail.fan(b, [0, 1, 0], col(g.colour));
      }
      marker('roof-equipment', (xa + xb) / 2, top + (g.cap?.h ?? 0), (lo + hi) / 2, { name: g.name, kind: g.kind, s: [lo, hi], x: [xa, xb], h: g.h, assumed: true });
    }
  }

  // --- the underframe: a dark solebar, the engine raft's masses between the bogies, the bogies themselves --------------------------
  boxS(detail, -W * 0.92, W * 0.92, floor - 0.1, floor + 0.02, car.cab ? tip + 0.6 : END_GAP + 0.05, bodyEnd - 0.05, UNDERFRAME);
  const local = (z: number): number => (z - base) * dir;
  const [b0, b1] = car.bogies.map(local).sort((p, q) => p - q) as [number, number];
  const reach = f.wheelbase.value / 2 + f.wheelDiameter.value / 2 + 0.3;
  const from = b0 + reach; const to = b1 - reach;
  const total = look.underfloor.reduce((acc, it) => acc + it.length, 0);
  const k = Math.min(1, Math.max(0, to - from - 0.12 * (look.underfloor.length + 1)) / total);
  const gap = (to - from - total * k) / (look.underfloor.length + 1);
  let at = from + gap;
  const raftY = floor - 0.08;
  for (const it of look.underfloor) {
    const len = it.length * k;
    const za = Z(at); const zb = Z(at + len);
    const [z0, z1] = [Math.min(za, zb), Math.max(za, zb)];
    if (it.shape === 'drum-x') {
      // a drum lying across the car, from the raft down to its bottom, its ends capped
      const r = Math.min((raftY - it.bottom) / 2, len / 2); const yc = raftY - r; const zc = (z0 + z1) / 2;
      cylinderX(detail, -it.half, it.half, yc, zc, r, col(it.colour), 16);
      for (const sx of [-1, 1]) cylinderX(detail, sx * it.half, sx * (it.half + 0.02), yc, zc, r * 0.82, col(it.cap ?? it.colour), 16);
    } else if (it.shape === 'drum-z') {
      // a drum along the car hung from the raft, off the centre line, and its tail pipe out of the end toward the car's inner end
      const r = it.half; const yc = raftY - r; const x = it.x ?? 0;
      cylinderZ(detail, x, yc, r, z0, z1, col(it.colour), 14);
      const zt = Z(at + len); const zt1 = Z(at + len + Math.min(0.5, gap * 0.8));
      cylinderZ(detail, x, yc, 0.05, Math.min(zt, zt1), Math.max(zt, zt1), col(0x1d1c1b), 10);
    } else if (it.shape === 'sloped') {
      // the box's side profile a trapezium: its ends raked in by `rake` toward the bottom (the bevelled lower edges as the shared pod's)
      const rk = Math.min(it.rake ?? 0, len / 3);
      const sA = at; const sB = at + len;
      const prof: [number, number][] = [[sA, raftY], [sA + rk, it.bottom], [sB - rk, it.bottom], [sB, raftY]];
      const P3 = (x: number, [s, y]: [number, number]): V3 => [x, y, Z(s)];
      const c = col(it.colour);
      for (let q = 0; q < prof.length - 1; q++) {
        const a = prof[q]!; const b = prof[q + 1]!;
        const ds = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(ds, dy) || 1;
        // outward in the (s, y) plane: the profile runs top-front, down, along the bottom, up to top-rear, so out is (dy, -ds); z is s by dir
        const nn: V3 = [0, -ds / l, (dy / l) * dir];
        detail.quad([P3(-it.half, a), P3(it.half, a), P3(it.half, b), P3(-it.half, b)], [nn, nn, nn, nn], c);
      }
      for (const sx of [-1, 1]) detail.fan(prof.map((pp) => P3(sx * it.half, pp)), [sx, 0, 0], c);
    } else {
      underfloorPod(detail, { form: it.form as PodForm, colour: it.colour, x0: -it.half, x1: it.half, y0: it.bottom, y1: raftY, z0, z1 });
    }
    marker('underfloor', it.x ?? 0, it.bottom, at + len / 2, { form: it.form, shape: it.shape ?? 'box', s: [at, at + len], half: it.half });
    at += len + gap;
  }
  if (look.raft) {
    // the raft: two rails under the floor from the first mass to the last, a cross member at each end (bogie-158-a2)
    for (const sx of [-1, 1]) boxS(detail, sx * 0.78 - 0.06, sx * 0.78 + 0.06, raftY - 0.12, raftY, from, to, UNDERFRAME);
    for (const s of [from, to - 0.12]) boxS(detail, -0.84, 0.84, raftY - 0.12, raftY, s, s + 0.12, UNDERFRAME);
    marker('raft', 0, raftY - 0.06, (from + to) / 2, { s: [from, to], rails: 2 });
  }
  for (const [index, z] of car.bogies.entries()) {
    const bogie = buildDmuBogie({ radius: f.wheelDiameter.value / 2, wheelbase: f.wheelbase.value, track: 1.435, motor: car.motor[index] ?? false, style: look.bogie });
    bogie.name = `bogie-${car.index}-${index}`;
    bogie.position.z = z;
    bogie.userData = { motor: car.motor[index] ?? false, style: look.bogie };
    group.add(bogie);
  }

  // --- inner ends: the gangway bellows and the bar coupler, out to the car's end -----------------------------------------------------
  const innerEnds = car.cab ? [car.length - END_GAP] : [END_GAP, car.length - END_GAP];
  for (const s of innerEnds) {
    const out = s > car.length / 2 ? 1 : -1;
    const e = out > 0 ? car.length : 0;
    // the rubber surround (posts, sill, and the head with its outer corners rounded), standing out of the end wall
    const g = GANGWAY_INNER; const b = g.bellows;
    const rubber = col(GANGWAY_RUBBER);
    const zf = Z(s + out * g.frame);
    for (const sx of [-1, 1]) prismZ(detail, box(Math.min(sx * g.inner, sx * g.half), Math.max(sx * g.inner, sx * g.half), g.sill, g.top - g.radius), Z(s), zf, rubber);
    prismZ(detail, box(-g.inner, g.inner, g.sill, g.sill + 0.08), Z(s), zf, rubber);
    prismZ(detail, roundTop(g.half, g.top - g.radius, g.top, g.radius), Z(s), zf, rubber);
    // the bellows, on to the car's end, a pleat standing out round it every `pleat`
    const bel = roundTop(b.half, b.sill, b.top, b.radius);
    prismZ(detail, bel, zf, Z(e), col(0x222327));
    let pleats = 0;
    for (let u = g.frame + g.pleat / 2; u < END_GAP - 0.01; u += g.pleat, pleats++) {
      prismZ(detail, roundTop(b.half + 0.02, b.sill - 0.02, b.top + 0.02, b.radius + 0.02), Z(s + out * (u - 0.01)), Z(s + out * (u + 0.01)), rubber);
    }
    const zWall = Z(s);
    couplerHalf(detail, zWall, (out * dir) as 1 | -1, END_GAP, 0.85, 'plain');
    marker('gangway', 0, 2.0, s, { front: false, frame: g.frame, top: g.top, radius: g.radius, bellowsTop: b.top, pleats });
  }

  const shellMesh = new THREE.Mesh(shell.build(), plain()); shellMesh.name = 'body-shell';
  const detailMesh = new THREE.Mesh(detail.build(), plain()); detailMesh.name = 'body-detail';
  // what setTrainLampState reads (web/src/train.ts LampRecord): which end of the train this cab is, and its lenses. A DMU unit runs
  // alone here, so no cab is a coupled unit's inner end.
  if (car.cab) detailMesh.userData.lamps = { end: car.cab, interior: false, lenses: lampLenses };
  const glassMesh = new THREE.Mesh(glass.build(), glassMaterial()); glassMesh.name = 'cab-glass';
  group.add(shellMesh, detailMesh, glassMesh);
  const decalMesh = new THREE.Mesh(decals.build(), decalMaterial()); decalMesh.name = 'livery-decals';
  group.add(decalMesh);
  return group;
}

/** How far the side draws in at the floor below the waist (the tumblehome), each side. ASSUMED: read by eye off scotrail170-01 and scotrail158-05. */
export const TUMBLEHOME = 0.06;

/**
 * The DMUs' car section: web/src/train.ts carSection's thirteen points (so the loft's columns keep their meaning), its wall no longer
 * vertical: upright from the cantrail down to the waist (just under the windows and the door glass), then drawing in by TUMBLEHOME to
 * the bottom corner, the middle wall point two thirds of the way out (a gentle curve, not a crease).
 */
function dmuSection(base: ReturnType<typeof carSection>, look: Look): ReturnType<typeof carSection> {
  const W = base.width;
  const t = TUMBLEHOME;
  const waist = Math.min(look.windowY[0], look.doorGlass.y0) - 0.06;
  const h = base.half.map(([x, y]): [number, number] => [x, y]);
  const w0 = h[2]![1];
  h[0] = [h[0]![0] - t, h[0]![1]];
  h[1] = [h[1]![0] - t, h[1]![1]];
  h[2] = [W - t, w0];
  h[3] = [W - 0.35 * t, w0 + 0.45 * (waist - w0)];
  h[4] = [W, waist];
  return { ...base, half: h };
}

/** The section's half-width at height y, on the wall (between the bottom corner and the cantrail); W above the wall. */
function profileX(sec: ReturnType<typeof carSection>, y: number): number {
  const h = sec.half;
  for (let k = 1; k < 5; k++) {
    const [x0, y0] = h[k]!; const [x1, y1] = h[k + 1]!;
    if (y >= y0 && y <= y1) return x0 + ((y - y0) / (y1 - y0 || 1)) * (x1 - x0);
  }
  return y < h[1]![1] ? h[1]![0] : sec.width;
}

/** The operator's wordmark on the sides, registered in the shared lettering atlas at this module's load. */
const WORDMARK = 'ScotRail';
registerAtlasTexts([WORDMARK]);
// No unit number is drawn: the builder is given a class and a unit length, not an allocated unit, and a number from a photograph
// would present an assumed identity as a real one. A number waits for the allocated unit (PTAC or a diagram) to reach the builder.

/**
 * A text from the lettering atlas on a quad: `verts` bottom-start, bottom-end, top-end, top-start along the lettering's length;
 * `forward` says the atlas's u runs from the start to the end (the viewer's left to right), else the other way.
 */
function textQuad(soup: Soup, verts: readonly V3[], text: string, forward: boolean, n: V3, colour: number): void {
  const a = atlasRect(text);
  const [uA, uB] = forward ? [a.u0, a.u1] : [a.u1, a.u0];
  soup.quad([verts[0]!, verts[1]!, verts[2]!, verts[3]!], [n, n, n, n], col(colour), [[uA, a.v0], [uB, a.v0], [uB, a.v1], [uA, a.v1]]);
}

/** A thin plate seen from both sides: the quad `p` (any winding) and its back, each with its flat normal. */
function plate(soup: Soup, p: readonly [V3, V3, V3, V3], colour: number): void {
  const u: V3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const v: V3 = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
  const n = normaliseV([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
  const m: V3 = [-n[0], -n[1], -n[2]];
  soup.quad([p[0], p[1], p[2], p[3]], [n, n, n, n], col(colour));
  soup.quad([p[3], p[2], p[1], p[0]], [m, m, m, m], col(colour));
}

function normaliseV(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** The white field's rear limit, metres from the cab end: up to the first door (the 158's door is just behind its cab, and the field wraps round it: scotrail158-05). */
function whiteFieldRear(look: Look, plan: CarPlanDmu): number {
  const dw = SCOTRAIL_DMU_FIGURES[look.family].doorWidth.value;
  const d0 = plan.doors[0] ?? 3;
  return look.family === 'sprinter158' ? d0 + dw / 2 + 1.1 : d0 - dw / 2 - 0.05;
}
/** The light blue dot field's stretch along a car, metres from the cab end (or the car's start): from the white field's end (the 170's: 1.25 m behind the cab side window; on a car with no cab, from its start) past the first door and on for 7.5 m. */
function blueField(car: ScotrailDmuCar, look: Look, plan: CarPlanDmu): [number, number] {
  const dw = SCOTRAIL_DMU_FIGURES[look.family].doorWidth.value;
  const d0 = plan.doors[0] ?? 3;
  const a = car.cab ? (look.family === 'turbostar' ? look.cabWindow.s1 + 1.25 : whiteFieldRear(look, plan)) : END_GAP + 0.4;
  return [a, Math.max(a + 2, Math.min(car.length - 1.5, d0 + dw / 2 + 7.5))];
}
/** Where a cab car's white dot field ends (the 170's stops 1.25 m behind the cab side window). */
function whiteFieldEnd(look: Look, plan: CarPlanDmu): number {
  const rear = whiteFieldRear(look, plan);
  return Math.min(rear, look.family === 'turbostar' ? look.cabWindow.s1 + 1.25 : rear);
}

/**
 * The Saltire dot pattern as round dots laid a few millimetres proud of the side: a field of white dots on the cab's flank behind the
 * front and round the cab side window, shrinking toward the passenger saloon (scotrail170-01, -02; scotrail158-05), and a band of light
 * blue dots under the windows behind the first door, shrinking along the car (both classes). On a car with no cab, only the blue band.
 * Never over a window, a door or the cab window. Placement and sizes ASSUMED from the photographs; no artwork is copied.
 */
function saltireDots(soup: Soup, car: ScotrailDmuCar, plan: CarPlanDmu, look: Look, sideX: (y: number) => number, Z: (s: number) => number, holes: readonly [number, number, number, number][], nose: (s: number, y: number) => { x: number; s: number }): void {
  const free = (s: number, y: number, r: number): boolean => !holes.some(([s0, s1, y0, y1]) => s + r > s0 && s - r < s1 && y + r > y0 && y - r < y1);
  /** A dot centred (s, y) on the side; on the nose it is laid on the loft (its half-width and rake there), a few mm proud. */
  const dot = (s: number, y: number, r: number, colour: number, onNose: boolean): void => {
    if (r < 0.012 || !free(s, y, r)) return;
    // each rim point stands out from the body at its own height and place along the car: below the waist the side draws in and on the
    // nose the loft narrows, so a disc set at its centre's half-width stood ~1 cm proud low on the side (through the wordmark) and sank
    // into the loft on the nose (clipped dots). The rim stays a true circle seen side-on, round the centre's place; the fan's centre is
    // the body's point there, not the rim's mean, which a dot over the section's lower knee pulls inside the body.
    const at = onNose ? nose(s, y) : { x: sideX(y), s };
    const xAt = (ds: number, yy: number): number => (onNose ? nose(s + ds, yy).x : sideX(yy));
    const rim = ellipse(0, y, r, r, 10).map(([ds, yy]) => ({ ds, yy, x: xAt(ds, yy) }));
    for (const side of [-1, 1]) {
      const n: V3 = [side, 0, 0];
      const c0: V3 = [side * (at.x + 0.005), y, Z(at.s)];
      const pts = rim.map(({ ds, yy, x }): V3 => [side * (x + 0.005), yy, Z(at.s + ds)]);
      for (let k = 0; k < pts.length; k++) soup.tri([c0, pts[k]!, pts[(k + 1) % pts.length]!], [n, n, n], col(colour));
    }
  };
  const dw = SCOTRAIL_DMU_FIGURES[look.family].doorWidth.value;
  const d0 = plan.doors[0] ?? 3;
  const fieldEnd = whiteFieldRear(look, plan);
  if (car.cab) {
    // The white field over the whole cab side, from the cab corner (the 170: from round its nose's front corner) back to the first door,
    // cantrail to solebar, its dots largest at the front and shrinking toward the saloon (scotrail170-01, -02; scotrail158-01, -05).
    const { pitch, r0, shrink } = look.whiteDots;
    // (from the cab end: the face stands END_GAP back; the 158's yellow wraps the first 0.32 m of its nose)
    const s0 = END_GAP + (look.family === 'turbostar' ? 0.3 : 0.38);
    const s1 = whiteFieldEnd(look, plan);
    for (let s = s0, col_ = 0; s < s1; s += pitch * 0.87, col_++) {
      for (let y = 1.1 + (col_ % 2) * pitch / 2; y < look.wallTop - 0.06; y += pitch) {
        const t = (s - s0) / (s1 - s0);
        dot(s, y, r0 * (1 - shrink * t), DOT_WHITE, s < END_GAP + look.nose.length);
      }
    }
  }
  // The light blue field under the windows: from the white field (or the car's start) past the first door and on along the car, its
  // dots swelling to the middle of the field and fading at both ends (scotrail170-01, -02; scotrail158-05).
  const pitch = 0.1;
  const [a, b] = blueField(car, look, plan);
  for (let s = a, col_ = 0; s < b; s += pitch * 0.87, col_++) {
    for (let y = 1.12 + (col_ % 2) * pitch / 2; y < look.windowY[0] - 0.07; y += pitch) {
      const t = (s - a) / (b - a);
      dot(s, y, 0.016 + 0.03 * Math.sqrt(Math.max(0, Math.sin(Math.PI * t))), DOT_BLUE, false);
    }
  }
}

/** Build a ScotRail DMU kind. Allocation is the caller's: this only draws the named class and unit length. */
export function buildScotrailDmu(kind: ScotrailDmuKind): THREE.Group {
  const layout = scotrailDmuLayout(kind);
  const look = LOOKS[layout.spec.family];
  const root = new THREE.Group();
  root.name = `train-${kind}`;
  root.userData = {
    kind, length: layout.length, cars: layout.cars.length, family: layout.spec.family, operator: layout.spec.operatorName, label: layout.spec.label,
    allocation: 'assumed fleet', source: layout.spec.source, diesel: true, pantographs: 0, lampState: { ...SERVICE_LAMPS },
    assumptions: 'ASSUMED: floor, wheel, wheelbase, bogie centres, door width and positions, window layout, nose and face shapes, lamp, buffer and coupler places, roof housings, underfloor masses, bogie frame sizes (shapes from bogie-158-a2 and bogie-170-tyt); the 158 height (Class 159 comparator). Lengths and widths published, endpoints unspecified.',
  };
  for (const car of layout.cars) root.add(carModel(car, layout, look));
  return root;
}

/** Release this builder's geometry, keeping the shared bogie geometry and the shared materials. */
export function disposeScotrailDmu(root: THREE.Group): void {
  const owned = new Set<THREE.BufferGeometry>();
  root.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') owned.add(o.geometry); });
  for (const g of owned) g.dispose();
}

/**
 * What tools/train-capture.mjs needs to photograph a kind (web/src/edinburgh-fleet.ts CaptureFormation): positions from the front nose,
 * doors by their centres. `crown` is the roof's centre line (the published or assumed height), `coverHeight` the tallest roof housing.
 */
export function scotrailDmuFormation(kind: ScotrailDmuKind): CaptureFormation {
  const layout = scotrailDmuLayout(kind);
  const look = LOOKS[layout.spec.family];
  const f = SCOTRAIL_DMU_FIGURES[layout.spec.family];
  const kit = Math.max(0, ...look.roofGear.map((g) => (g.kind === 'vents' ? 0 : g.h + (g.cap?.h ?? 0))));
  const name = `SCOTRAIL_DMU_FIGURES.${layout.spec.family}`;
  const lengthBasis = [...new Set(layout.cars.map((c) => (c.cab ? f.drivingLength : f.intermediateLength).basis))].join('+');
  return {
    family: layout.spec.family, classes: layout.spec.classes, classNote: null, length: layout.length,
    half: f.width.value / 2, crown: f.height.value, coverHeight: kit, roofTop: f.height.value + kit, doorWidth: f.doorWidth.value,
    cars: layout.cars.map((car) => {
      const dir = car.cab === 'rear' ? -1 : 1;
      const base = car.cab === 'rear' ? car.end : car.start;
      return { index: car.index, type: car.type, length: car.length, start: car.start, end: car.end, cab: car.cab, bogies: [...car.bogies], motor: [...car.motor], pantograph: null, doors: dmuCarPlan(car, look).doors.map((s) => base + dir * s) };
    }),
    dimensions: {
      lengthM: { value: layout.length, basis: lengthBasis, figures: [`${name}.drivingLength`, ...(layout.cars.length > 2 ? [`${name}.intermediateLength`] : [])] },
      widthM: { value: f.width.value, basis: f.width.basis, figures: [`${name}.width`], figureM: f.width.value },
      // (the roof housings' heights are ASSUMED, so the highest point joins the height figure's basis with 'assumed')
      roofTopM: { value: f.height.value + kit, basis: f.height.basis === 'assumed' ? 'assumed' : `${f.height.basis}+assumed`, figures: [`${name}.height`, 'roofGear (web/src/train-scotrail-dmu.ts, ASSUMED)'], figureM: f.height.value },
    },
  };
}
export const formation170 = (): CaptureFormation => scotrailDmuFormation('sr170x3');
export const formation158 = (): CaptureFormation => scotrailDmuFormation('sr158x2');

/** The Edinburgh table's per-class entry points (see the hand-in for the rows). */
export const layout170 = (kind: 'sr170x3'): ScotrailDmuLayout => scotrailDmuLayout(kind);
export const build170 = (kind: 'sr170x3'): THREE.Group => buildScotrailDmu(kind);
export const dispose170 = disposeScotrailDmu;
export const layout158 = (kind: 'sr158x2'): ScotrailDmuLayout => scotrailDmuLayout(kind);
export const build158 = (kind: 'sr158x2'): THREE.Group => buildScotrailDmu(kind);
export const dispose158 = disposeScotrailDmu;
