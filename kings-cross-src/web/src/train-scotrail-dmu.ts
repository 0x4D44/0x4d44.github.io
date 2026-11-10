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
const FRAME = 0x14161a;
const RECESS = 0x0d0e10;
const UNDERFRAME = 0x2f2a25;
const VALANCE_DARK = 0x1c1d20;
const DISPLAY = 0x0d0e10;
const DISPLAY_TEXT = 0xffa000;
const CHROME = 0xb8bcc2;
const GANGWAY_RUBBER = 0x1b1c1f;

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
}

/** One mass hung under a car's floor between the bogies. */
interface PodItem { form: PodForm; length: number; half: number; bottom: number; colour: number }

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
  /** dark roof housings: from the cab end (a cab car) or the car's start; `cabOnly` only on a driving car */
  roofKit: readonly { name: string; s0: number; s1: number; half: number; height: number; colour: number; cabOnly?: boolean; fromEnd?: boolean; /** centre off the middle line (default 0) */ x?: number; /** one at +x and one at -x */ pair?: boolean }[];
}

const box = (x0: number, x1: number, y0: number, y1: number, r = 0): [number, number][] => (r > 0 ? roundedRect(x0, x1, y0, y1, r, 3) : [[x1, y1], [x0, y1], [x0, y0], [x1, y0]]);
const disc = (cx: number, cy: number, r: number, n = 16): [number, number][] => ellipse(cx, cy, r, r, n);
const oval = (cx: number, cy: number, rx: number, ry: number, n = 20): [number, number][] => ellipse(cx, cy, rx, ry, n);
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
    // the yellow brow over the screen, on the face only: its foot the screen's top, its top a smooth arch well inside the face's edge,
    // so navy shows round it and the dome above stays navy (scotrail170-01, -02); then its orange foot line
    { name: 'brow', outline: arch(1.02, 3.08, 3.44, 2.2), colour: SR_YELLOW, lift: 0.0015, inset: 0.03 },
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
    // the lamp pods: a chrome oval ring, its dark inside, a headlight outboard and a tail lamp inboard
    { name: 'lamp-ring', outline: oval(0.98, 1.4, 0.25, 0.15), colour: CHROME, lift: 0.006, mirror: true, inset: 0.015 },
    { name: 'lamp-pod', outline: oval(0.98, 1.4, 0.215, 0.12), colour: 0x2a2d33, lift: 0.0075, mirror: true, inset: 0.03 },
    { name: 'headlight', outline: disc(1.07, 1.41, 0.085), lens: 'head', lift: 0.0105, mirror: true, inset: 0.04 },
    { name: 'tail-lamp', outline: disc(0.87, 1.4, 0.06), lens: 'tail', lift: 0.0105, mirror: true },
    // the coupler's recess in the valance
    { name: 'recess', outline: box(-0.42, 0.42, 0.48, 1.0, 0.04), colour: RECESS, lift: 0.0015 },
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
  // one MTU engine and a Voith transmission under every car (the 170's equipment, widely documented; the masses' sizes and order ASSUMED)
  underfloor: [
    { form: 'tank', length: 2.2, half: 0.95, bottom: 0.4, colour: 0x4a4238 },
    { form: 'engine', length: 2.6, half: 0.9, bottom: 0.36, colour: 0x433b31 },
    { form: 'transmission', length: 1.3, half: 0.8, bottom: 0.42, colour: 0x3f382f },
    { form: 'cooler', length: 1.9, half: 0.88, bottom: 0.46, colour: 0x4a4339 },
    { form: 'battery', length: 1.2, half: 0.72, bottom: 0.5, colour: 0x433d35 },
  ],
  // a low dark housing on the roof just behind the cab (scotrail170-01: a dark raised box behind the yellow brow); an exhaust outlet
  // near the inner end of every car (glimpsed on the roof line in scotrail170-01; identity and size ASSUMED)
  roofKit: [
    { name: 'cab-roof-unit', s0: 1.55, s1: 2.75, half: 0.55, height: 0.1, colour: 0x1d2028, cabOnly: true },
    { name: 'exhaust', s0: 2.2, s1: 2.75, half: 0.22, height: 0.12, colour: 0x1a1b1e, fromEnd: true },
  ],
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
    { name: 'display', outline: box(-1.16, -0.66, 2.94, 3.12, 0.01), colour: DISPLAY, lift: 0.0105 },
    { name: 'display-text', outline: box(-1.1, -0.72, 3.0, 3.06), colour: DISPLAY_TEXT, lift: 0.012 },
    { name: 'wiper', outline: bar([0.7, 3.06], [0.82, 2.25], 0.03), colour: 0x3b4048, lift: 0.012, mirror: true },
    // the gangway door's leaf (its rubber frame stands out of the face in 3D, see gangwayFrame) and its handle
    { name: 'door-leaf', outline: box(-0.34, 0.34, 0.92, 3.14, 0.02), colour: 0xe9b21a, lift: 0.0015 },
    // (scotrail158-01: a short upright grab handle in a dark recess)
    { name: 'door-handle-recess', outline: box(0.15, 0.26, 1.98, 2.2, 0.02), colour: FRAME, lift: 0.003 },
    { name: 'door-handle', outline: box(0.19, 0.22, 2.0, 2.18), colour: 0x9a9fa6, lift: 0.0045 },
    // the lamp housing under each screen, a white headlight outboard and a red tail lamp inboard, each lens in a chrome rim on the
    // housing's yellow panel inside its dark seal (scotrail158-01)
    { name: 'lamp-housing', outline: box(0.66, 1.2, 1.36, 1.72, 0.1), colour: 0x2a2b2e, lift: 0.003, mirror: true },
    { name: 'lamp-bezel', outline: box(0.7, 1.16, 1.4, 1.68, 0.08), colour: 0xd9a514, lift: 0.0045, mirror: true },
    { name: 'lamp-rim', outline: disc(1.03, 1.54, 0.105), colour: CHROME, lift: 0.006, mirror: true },
    { name: 'lamp-rim', outline: disc(0.84, 1.54, 0.1), colour: CHROME, lift: 0.006, mirror: true },
    { name: 'headlight', outline: disc(1.03, 1.54, 0.085), lens: 'head', lift: 0.0075, mirror: true },
    { name: 'tail-lamp', outline: disc(0.84, 1.54, 0.08), lens: 'tail', lift: 0.0075, mirror: true },
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
  // a door at each end of every car (scotrail158-05: the cab side window, then the door; the inner door by the gangway)
  doors: (car) => [2.75, car.length - 1.4],
  doorY: [1.08, 2.92],
  doorGlass: { y0: 1.62, y1: 2.75, r: 0.1, inset: 0.12 },
  cabWindow: { s0: 1.12, s1: 1.82, y0: 1.82, y1: 2.78 },
  coupler: { y: 0.68 },
  bogie: 'brel-p4',
  buffers: false,
  gangwayFrame: true,
  // one Cummins engine and its transmission under each car (widely documented for the class; sizes and order ASSUMED)
  underfloor: [
    { form: 'tank', length: 2.0, half: 0.95, bottom: 0.42, colour: 0x4a4238 },
    { form: 'cooler', length: 1.7, half: 0.85, bottom: 0.46, colour: 0x4a4339 },
    { form: 'engine', length: 2.4, half: 0.9, bottom: 0.38, colour: 0x433b31 },
    { form: 'transmission', length: 1.2, half: 0.8, bottom: 0.44, colour: 0x3f382f },
    { form: 'battery', length: 1.1, half: 0.72, bottom: 0.52, colour: 0x433d35 },
  ],
  // a low dark louvred housing at the roof's edge just behind the cab, one each side (scotrail158-05 shows the cab-left one, -01 the
  // cab-right one: about a metre long and a hand high; identity, likely the cab's ventilation, ASSUMED), and an exhaust outlet near
  // the inner end (ASSUMED). Nothing else on the cab roof: the round-1 slab across it is gone.
  roofKit: [
    { name: 'cab-roof-unit', s0: 1.15, s1: 2.15, half: 0.2, height: 0.08, colour: 0x1d1f23, cabOnly: true, x: 0.62, pair: true },
    { name: 'exhaust', s0: 2.1, s1: 2.6, half: 0.2, height: 0.12, colour: 0x1a1b1e, fromEnd: true },
  ],
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
          detail.fan(onFace(poly, shape.lift), faceN, col(lens.hex));
          detail.emit = 0;
          lampLenses.push({ role: shape.lens, v0, v1: detail.glow.length });
          if (shape.lens === 'head') {
            const cx = poly.reduce((acc, p) => acc + p[0], 0) / poly.length;
            const cy = poly.reduce((acc, p) => acc + p[1], 0) / poly.length;
            marker('headlight', cx, cy, tip, { lit, role: 'head' });
          }
          continue;
        }
        detail.fan(onFace(poly, shape.lift), faceN, col(shape.colour ?? FRAME));
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
    couplerHalf(detail, Z(wall), (-dir) as 1 | -1, wall, look.coupler.y, style);
    marker('nose-coupler', 0, look.coupler.y, wall / 2, { end: car.cab, style });
    if (look.buffers) {
      // two small round buffers low at the valance's outer corners (scotrail170-01, -02), out to 2 cm inside the car's end
      for (const x of [-0.86, 0.86]) {
        cylinderZ(detail, x, 0.6, 0.07, Z(tip), Z(0.12), col(0x2a2c30));
        cylinderZ(detail, x, 0.6, 0.11, Z(0.12), Z(0.02), col(0x7e8288));
        marker('buffer', x, 0.6, 0.02);
      }
    }
    if (look.gangwayFrame) {
      // the 158's gangway frame: heavy black rubber, standing 0.14 m out of the face round the door (scotrail158-01)
      const z0 = tip; const z1 = tip - 0.14;
      boxS(detail, -0.56, -0.38, 0.86, 3.38, z1, z0, GANGWAY_RUBBER);
      boxS(detail, 0.38, 0.56, 0.86, 3.38, z1, z0, GANGWAY_RUBBER);
      boxS(detail, -0.56, 0.56, 3.18, 3.38, z1, z0, GANGWAY_RUBBER);
      boxS(detail, -0.56, 0.56, 0.84, 0.92, z1, z0, GANGWAY_RUBBER);
      marker('gangway', 0, 2.1, z1, { front: true, closed: true });
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
  const windowFrame = (s0: number, s1: number, y0: number, y1: number, r: number): void => {
    for (const side of [-1, 1]) {
      detail.prismX(roundedRect(Math.min(Z(s0), Z(s1)) - 0.04, Math.max(Z(s0), Z(s1)) + 0.04, y0 - 0.04, y1 + 0.04, r + 0.04, 3), side * W, side * (W + 0.004), col(FRAME), false);
      glass.prismX(roundedRect(Math.min(Z(s0), Z(s1)), Math.max(Z(s0), Z(s1)), y0, y1, r, 3), side * W, side * (W + 0.008), col(0x000000));
    }
    holes.push([s0 - 0.1, s1 + 0.1, y0 - 0.1, y1 + 0.1]);
  };
  for (const [s0, s1] of plan.windows) windowFrame(s0, s1, look.windowY[0], look.windowY[1], look.windowRadius);
  if (car.cab) windowFrame(look.cabWindow.s0, look.cabWindow.s1, look.cabWindow.y0, look.cabWindow.y1, 0.06);
  // the thin orange line along the cantrail
  for (const side of [-1, 1]) {
    const x0 = side * W; const x1 = side * (W + 0.003);
    boxS(detail, Math.min(x0, x1), Math.max(x0, x1), 2.93, 2.955, car.cab ? noseLen : 0.05, car.length - END_GAP - 0.05, PINSTRIPE);
  }
  // The lettering (web/src/livery.ts atlas): the ScotRail wordmark in white low on each side of every car, a little behind the first
  // door, in the blue dot field, which keeps clear of it (scotrail170-01, scotrail158-05). Size and place ASSUMED from the photographs.
  {
    const em = 0.2;
    const s0 = (plan.doors[0] ?? 3) + dw / 2 + 0.55;
    const s1 = s0 + textEms(WORDMARK) * em;
    const y0 = 1.3;
    for (const sx of [-1, 1]) {
      // (laid on the drawn-in side below the waist: each corner at the side's half-width at its height)
      const verts = ([[s0, y0], [s1, y0], [s1, y0 + em], [s0, y0 + em]] as const).map(([s, y]): V3 => [sx * (sideX(y) + 0.006), y, Z(s)]);
      // u runs with the lettering, toward the viewer's right: +z on the left side (x < 0), -z on the right
      const forward = (Z(s1) > Z(s0)) === (sx < 0);
      textQuad(decals, verts, WORDMARK, forward, [sx, 0, 0], 0xffffff);
    }
    holes.push([s0 - 0.1, s1 + 0.1, y0 - 0.06, y0 + em + 0.04]);
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
  saltireDots(detail, car, plan, look, sideX, Z, holes, noseSide);
  // the yellow line over the first-class windows of the 170's DMCL, from behind the cab to the first door (scotrail170-02)
  if (car.type === 'DMCL') {
    const from = look.cabWindow.s1 + 0.2; const to = (plan.doors[0] ?? 3) - dw / 2 - 0.12;
    for (const side of [-1, 1]) {
      const x0 = side * W; const x1 = side * (W + 0.0045);
      boxS(detail, Math.min(x0, x1), Math.max(x0, x1), look.windowY[1] + 0.07, look.windowY[1] + 0.1, from, to, SR_YELLOW);
    }
    marker('first-class-line', W, look.windowY[1] + 0.085, (from + to) / 2, { colour: 'yellow', assumed: 'height and ends read off scotrail170-02' });
  }

  // --- the roof: no pantograph (diesel units); dark housings where the photographs show them ----------------------------------------
  for (const k of look.roofKit) {
    if (k.cabOnly && !car.cab) continue;
    const s0 = k.fromEnd ? car.length - k.s1 : k.s0;
    const s1 = k.fromEnd ? car.length - k.s0 : k.s1;
    // (the roof is flat at the crown inside the shoulder, carSection: |x| under W - 0.55)
    for (const x of k.pair ? [k.x ?? 0, -(k.x ?? 0)] : [k.x ?? 0]) {
      boxS(detail, x - k.half, x + k.half, crown - 0.1, crown + k.height, s0, s1, k.colour);
      marker('roof-equipment', x, crown + k.height, (s0 + s1) / 2, { name: k.name, assumed: true });
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
  for (const it of look.underfloor) {
    const len = it.length * k;
    const za = Z(at); const zb = Z(at + len);
    underfloorPod(detail, { form: it.form, colour: it.colour, x0: -it.half, x1: it.half, y0: it.bottom, y1: floor - 0.08, z0: Math.min(za, zb), z1: Math.max(za, zb) });
    marker('underfloor', 0, it.bottom, at + len / 2, { form: it.form });
    at += len + gap;
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
    boxS(detail, -0.55, 0.55, 1.08, 3.0, Math.min(s, e), Math.max(s, e), GANGWAY_RUBBER);
    const zWall = Z(s);
    couplerHalf(detail, zWall, (out * dir) as 1 | -1, END_GAP, 0.85, 'plain');
    marker('gangway', 0, 2.0, s);
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
    const at = onNose ? nose(s, y) : { x: sideX(y), s };
    for (const side of [-1, 1]) {
      const x = side * (at.x + 0.005);
      soup.fan(ellipse(Z(at.s), y, r, r, 10).map(([z, yy]): V3 => [x, yy, z]), [side, 0, 0], col(colour));
    }
  };
  const dw = SCOTRAIL_DMU_FIGURES[look.family].doorWidth.value;
  const d0 = plan.doors[0] ?? 3;
  // the field's rear edge: up to the first door (the 158's door is just behind its cab, and the field wraps round it: scotrail158-05)
  const fieldEnd = look.family === 'sprinter158' ? d0 + dw / 2 + 1.1 : d0 - dw / 2 - 0.05;
  if (car.cab) {
    // The white field over the whole cab side, from the cab corner (the 170: from round its nose's front corner) back to the first door,
    // cantrail to solebar, its dots largest at the front and shrinking toward the saloon (scotrail170-01, -02; scotrail158-01, -05).
    const pitch = 0.118;
    // (from the cab end: the face stands END_GAP back; the 158's yellow wraps the first 0.32 m of its nose)
    const s0 = END_GAP + (look.family === 'turbostar' ? 0.3 : 0.38);
    const s1 = Math.min(fieldEnd, look.family === 'turbostar' ? look.cabWindow.s1 + 1.25 : fieldEnd);
    for (let s = s0, col_ = 0; s < s1; s += pitch * 0.87, col_++) {
      for (let y = 1.1 + (col_ % 2) * pitch / 2; y < look.wallTop - 0.06; y += pitch) {
        const t = (s - s0) / (s1 - s0);
        dot(s, y, 0.05 * (1 - 0.72 * t), DOT_WHITE, s < END_GAP + look.nose.length);
      }
    }
  }
  // The light blue field under the windows: from the white field (or the car's start) past the first door and on along the car, its
  // dots swelling to the middle of the field and fading at both ends (scotrail170-01, -02; scotrail158-05).
  const pitch = 0.1;
  const a = car.cab ? (look.family === 'turbostar' ? look.cabWindow.s1 + 1.25 : fieldEnd) : END_GAP + 0.4;
  const b = Math.max(a + 2, Math.min(car.length - 1.5, d0 + dw / 2 + 7.5));
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
  const kit = Math.max(0, ...look.roofKit.map((k) => k.height));
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
      roofTopM: { value: f.height.value + kit, basis: f.height.basis === 'assumed' ? 'assumed' : `${f.height.basis}+assumed`, figures: [`${name}.height`, 'roofKit (web/src/train-scotrail-dmu.ts, ASSUMED)'], figureM: f.height.value },
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
