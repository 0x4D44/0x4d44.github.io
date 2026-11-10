// The regular intercity diesels at Edinburgh Waverley as three.js models: the CrossCountry Voyagers (Class 220, 221) and the ScotRail
// Inter7City HST (Class 43 power cars and Mk3 coaches). A builder of their own, as the EMR kinds have (web/src/train-emr.ts), from the figures
// in core/train-intercity.ts; it reuses the King's Cross loft (train-nose.ts), bogies, couplers, bellows and underfloor masses (train-parts.ts).
//
// Local frame, as every train: x across, y up from the rail head, the front nose at z = 0 and the train running to +z. Every car group
// spans its own [start, end] and holds its geometry in the train's frame, so the Waverley layer poses it as it poses the others.
//
// Structure (the tests rely on these names): car-<i>; in it body-shell (the lofted body, painted by vertex colour), body-detail (doors,
// windows, face furniture, lenses, underframe, roof fittings, bellows, couplers), cab-glass (windscreen and cab side windows, reflective),
// and the markers door, crew-door, headlight, gangway, coupler, nose-coupler; bogie-<i>-<k> at z = car.bogies[k].
//
// Every size here that is not in core/train-intercity.ts is read off the review photographs by eye and is ASSUMED (named per value below):
// Voyager xc220-02, xc220-03, xc220-04, xc221-01, xc221-02 and the Bombardier driving-car drawing; HST scotrail-hst-02, -03, -04 (power car)
// and scotrail-hst-06 (Inter7City coach). Roofs follow overbridge views (voyager-roof-01/-02, hst-roof-01/-02) and the Voyager bogie follows
// voyager-bogie-01 (221134 side on), all Commons photographs with receipts in the round-3 and round-4 packs; their sizes are still ASSUMED. No
// photograph shows a gangway close; it is ASSUMED throughout.
import * as THREE from 'three';
import { HST, INTERCITY_END_GAP, INTERCITY_SPECS, intercityLayout, VOYAGER } from '../../core/train-intercity.ts';
import type { IntercityBody, IntercityCar, IntercityKind, IntercityLayout } from '../../core/train-intercity.ts';
import { add, clipConvex, col, cross, ellipse, glassMaterial, gridNormals, lerp, plain, roundedRect, scale, Soup, sub, unit } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, rakeLean, rakeSet, ringAt, ringStations, xAtY, yAtX } from './train-nose.ts';
import type { NoseSpec, Section } from './train-nose.ts';
import { bellowsRings, bogieParts, buildBogie, couplerHalf, podHanger, underfloorPod } from './train-parts.ts';
import type { BogieStyle, CouplerStyle, PodBox, PodForm } from './train-parts.ts';
import type { CaptureFormation } from './edinburgh-fleet.ts';
import { lensLook } from './train.ts';
import type { LensRole, TrainLampMode } from './train.ts';

const GAP = INTERCITY_END_GAP;
const GLASS = -1;
/** The rail gauge, metres (core/train.ts FIGURES.gauge). */
const TRACK = 1.435;

// --- colours (approximate, read off the photographs named; not published) ---------------------------------------------------

/** CrossCountry: plum cab and roof, silver body, golden-yellow nose, red-pink doors (xc220-02, xc220-03, xc221-02). */
export const XC = { plum: 0x45202c, plumDark: 0x2e1a20, silver: 0xa7a9ae, yellow: 0xf2b400, door: 0xc6213f, roof: 0x3b2229, pin: 0xe0782a, under: 0x2a2a2d } as const;
/** ScotRail Inter7City: navy power car with a yellow front, pale grey coaches with a navy window band and foot, an orange cantrail line (scotrail-hst-03, -04, -06). */
export const SR = { navy: 0x1d2944, navyBand: 0x1f2a42, grey: 0xc2c7ce, yellow: 0xf3c200, orange: 0xe0702c, roof: 0x45484d, louvre: 0x24272c, louvrePanel: 0x8c9299, cabRoof: 0x2a2c31, under: 0x2b2c2f } as const;
const FRAME = 0x0e0f11;
const GASKET = 0x0d0e10;
const PANE = 0x2a3a48;
const SKY = 0x5d6e83;
const POD_GLASS = 0x2f343c;

// --- one body: what differs between a Voyager car, a power car and a coach -------------------------------------------------

interface FaceShapeDef {
  name: string;
  outline: [number, number][];
  lift: number;
  colour?: number;
  lens?: LensRole;
  mirror?: boolean;
  /** a smoked pod standing proud of the face: a half-ellipsoid of this centre, these radii and this height (the outline is then not drawn) */
  dome?: { cx: number; cy: number; rx: number; ry: number; h: number };
}
/** A line the paint changes along: a function of (s, y, x) that is zero on the line and linear in them. Every loft quad a line crosses is cut along it, so a livery edge is exact, not stepped. */
type Cut = (s: number, y: number, x: number) => number;
/** A silhouette laid on each side wall over the paint, from s0 to s1 (from the cab tip, or the car's front end), from `base` up to base + height(s). */
interface Skyline { s0: number; s1: number; base: number; height: (s: number) => number; colour: number }
interface UnderItem { name: string; form: PodForm; length: number; half: number; bottom: number; colour: number }
interface BodyDef {
  half: number;
  floor: number;
  wallTop: number;
  crown: number;
  /** extra heights for the section's wall points, so livery edges and windows fall on a row of the loft */
  rows: number[];
  nose: NoseSpec;
  /** the face stands this far behind the car's end (an uncovered coupler needs the whole gap) */
  faceSetback: number;
  /** the face's colour bands, bottom up: [top of band, colour] */
  faceBands: [number, number][];
  face: FaceShapeDef[];
  noseCoupler: CouplerStyle | null;
  /** the colour of a quad of the loft: `s` from the cab tip (cab car) or from the car's front end, y above the rail, ax = |x|, rh the ring's half-width; GLASS for glass */
  paint(car: IntercityCar, s: number, y: number, ax: number, rh: number): number;
  cuts(car: IntercityCar): Cut[];
  skyline?(car: IntercityCar): Skyline | null;
  /** wiper arms parked on the screen: each from (s, x) to (s, x) on the nose's top surface, s from the tip */
  wipers?: [[number, number], [number, number]][];
  /** the coupler at each inner end */
  innerCoupler: CouplerStyle | 'buckeye';
  /** cab side windows laid on the nose's flank: an ellipse (centre s, y; semi-axes a, b) or a box (s0..s1, y0..y1), both sides */
  cabWindow?: { kind: 'ellipse'; s: number; y: number; a: number; b: number } | { kind: 'box'; s0: number; s1: number; y0: number; y1: number };
  doors(car: IntercityCar): { s: number; width: number; crew?: boolean; colour: number }[];
  windows(car: IntercityCar): [number, number][];
  windowY: [number, number];
  doorY: [number, number];
  gangway: boolean;
  bogie: { style: BogieStyle; radius: number; wheelbase: number };
  underfloor: UnderItem[];
  underColour: number;
  roof?(car: IntercityCar, add: (x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, colour: number) => void): void;
  /**
   * louvre runs on the shoulder, both sides: panels `panel` long from s0 to s1 with `gap` between them, each crossed by dark slots `slot` wide at
   * `pitch`, from y0 to y1 up the shoulder's curve (the band under them is painted by `paint`)
   */
  cantLouvres?(car: IntercityCar): { s0: number; s1: number; y0: number; y1: number; panel: number; gap: number; pitch: number; slot: number; colour: number }[];
  /** flat fittings laid on the side wall (grilles), each drawn on both sides: s0..s1 along, y0..y1 */
  sideFittings?(car: IntercityCar): { s0: number; s1: number; y0: number; y1: number; colour: number; ribs?: number }[];
}

/** The body's right half-section: corners at the floor, an upright wall with a point at every given row, a quarter-ellipse shoulder, a nearly flat crown. */
export function intercitySection(b: Pick<BodyDef, 'half' | 'floor' | 'wallTop' | 'crown' | 'rows'>): Section {
  const W = b.half - 0.02;
  const half: [number, number][] = [[W - 0.15, b.floor], [W - 0.03, b.floor + 0.07]];
  const walls = [...new Set([b.floor + 0.25, ...b.rows.filter((y) => y > b.floor + 0.25 && y < b.wallTop), b.wallTop].map((y) => Math.round(y * 1000) / 1000))].sort((p, q) => p - q);
  for (const y of walls) half.push([W, y]);
  const rx = 0.55;
  const ry = b.crown - b.wallTop - 0.04;
  for (let j = 1; j <= 8; j++) {
    const phi = (j / 8) * (Math.PI / 2);
    half.push([W - rx + rx * Math.cos(phi), b.wallTop + ry * Math.sin(phi)]);
  }
  for (const f of [0.75, 0.5, 0.25]) half.push([(W - rx) * f, b.crown - 0.04 + 0.04 * (1 - f * f)]);
  half.push([0, b.crown]);
  return { half, width: W, floor: b.floor, crown: b.crown };
}

// --- the Voyager ---------------------------------------------------------------------------------------------------------------

const V_FLOOR = VOYAGER.floorHeight.value;
const V_CROWN = VOYAGER.height.value;
const V_WALL = 3.02;
/** ASSUMED window band and door heights (the drawing's window labels give widths, not heights; xc221-02 by eye). */
const V_WINDOW_Y: [number, number] = [1.84, 2.66];
/** The Voyager's nose, read off xc220-03 (side 3/4) and xc220-02 against the drawn 3.77 m: a face about 1.65 m tall, its top the screen's foot at
 * about 2.2 m, the glass raked to about 3.3 m over 1.3 m, then the cab roof easing into the crown by 3.0 m. The face leans back about 20 degrees. ASSUMED. */
const VOYAGER_NOSE: NoseSpec = {
  length: 3.0,
  knots: [
    { s: 0, top: 2.2, ws: 0.95, bottom: 0.55 },
    { s: 0.12, top: 2.25, ws: 0.965, bottom: 0.6 },
    { s: 0.5, top: 2.52, ws: 0.98, bottom: 0.72 },
    { s: 0.9, top: 2.84, ws: 0.99, bottom: 0.84 },
    { s: 1.3, top: 3.15, ws: 0.995, bottom: 0.95 },
    { s: 1.9, top: 3.5, ws: 1, bottom: 1.06 },
    { s: 2.5, top: 3.7, ws: 1, bottom: V_FLOOR - 0.02 },
    { s: 3.0, top: V_CROWN, ws: 1, bottom: V_FLOOR },
  ],
  fillet: 0.3,
  filletLoss: 0.15,
  filletSteps: 9,
  roundLen: 2.7,
  widest: 0.45,
  boxiness: 4,
  rake: { lean: 0.36, from: 0.6, reach: 1.6 },
};

/** The Voyager driving car's doors, from the drawing (s from the nose): the crew door just behind the cab, a passenger door ahead of the saloon, one at the inner end. */
const V_CREW_DOOR = { s: 3.65, width: 0.7 };
const V_FRONT_DOOR = 7.1;
const V_DOOR_FROM_END = 1.55;

function voyagerDoors(car: IntercityCar): { s: number; width: number; crew?: boolean; colour: number }[] {
  const w = VOYAGER.doorWidth.value;
  if (car.cab) return [{ ...V_CREW_DOOR, crew: true, colour: XC.plum }, { s: V_FRONT_DOOR, width: w, colour: XC.door }, { s: car.length - V_DOOR_FROM_END, width: w, colour: XC.door }];
  return [{ s: V_DOOR_FROM_END, width: w, colour: XC.door }, { s: car.length - V_DOOR_FROM_END, width: w, colour: XC.door }];
}

/** Windows of the drawing's 1.53 m between the doors, about 2.1 m apart (ASSUMED pitch; the drawing's five on the driving car's side). */
function windowsBetween(a: number, b: number, width: number, pitch: number): [number, number][] {
  const n = Math.max(1, Math.floor((b - a + (pitch - width)) / pitch));
  const used = n * width + (n - 1) * (pitch - width);
  const from = (a + b - used) / 2;
  return Array.from({ length: n }, (_, k): [number, number] => [from + k * pitch, from + k * pitch + width]);
}

/** The Voyager's screen on the nose's roof (s from the tip): a trapezoid, straight sided, its half-width falling from 1.12 m at its foot to 0.98 m at its head
 * (xc220-02 head on: about 0.85 of the cab's width at the foot, 0.7 at the head; xc220-03). ASSUMED. */
const V_SCREEN = { s0: 0.16, s1: 1.4, foot: 1.12, head: 0.98, frame: 0.07 };
const vScreenHalf = (s: number): number => lerp(V_SCREEN.foot, V_SCREEN.head, (s - V_SCREEN.s0) / (V_SCREEN.s1 - V_SCREEN.s0));
/** The yellow's edge on the cab side: from just behind the lamp pod at the valance's top (s 0.75 m at 0.95 m) back to the cantrail at about 2.3 m (xc220-03, xc220-02). ASSUMED. */
const vYellowEdge = (y: number): number => 0.75 + (y - 0.95) * 0.75;
/** The orange line: along the cantrail of every car, and over the screen's head on the cab (xc220-03). ASSUMED heights. */
const V_PIN: [number, number] = [V_WALL + 0.04, V_WALL + 0.11];
const V_PIN_TOP: [number, number] = [V_SCREEN.s1 + 0.1, V_SCREEN.s1 + 0.17];
/** The yellow runs over the screen's head to the cab roof this far behind the screen (xc220-03: a band about 0.3 m deep). ASSUMED. */
const V_YELLOW_ROOF = V_SCREEN.s1 + 0.3;
const V_PLUM_END = 6.45;

function voyagerPaint(car: IntercityCar, s: number, y: number, ax: number): number {
  const top = y > V_PIN[1];
  if (car.cab) {
    const f = V_SCREEN.frame;
    if (y > 2.0 && s > V_SCREEN.s0 - f && s < V_SCREEN.s1 + f) {
      const h = vScreenHalf(s);
      if (ax < h && s > V_SCREEN.s0 && s < V_SCREEN.s1) return GLASS;
      if (ax < h + f) return FRAME;
    }
    if (y > 2.6 && s > V_PIN_TOP[0] && s < V_PIN_TOP[1]) return XC.pin;
    if (y > V_PIN[0] && y < V_PIN[1]) return XC.pin;
    if (top ? y > 0.95 && s < V_YELLOW_ROOF : y > 0.95 && s < vYellowEdge(y)) return XC.yellow;
    if (s < V_PLUM_END) return top ? XC.roof : XC.plum;
  }
  if (y > V_PIN[0] && y < V_PIN[1]) return XC.pin;
  if (top) return XC.roof;
  if (y < 1.32) return XC.plumDark;
  return XC.silver;
}

function voyagerCuts(car: IntercityCar): Cut[] {
  const cuts: Cut[] = [(_s, y) => y - V_PIN[0], (_s, y) => y - V_PIN[1], (_s, y) => y - 1.32];
  if (!car.cab) return cuts;
  const f = V_SCREEN.frame;
  return [
    ...cuts,
    (_s, y) => y - 0.95,
    (_s, y) => y - 2.0,
    (s, y) => s - vYellowEdge(y),
    (s) => s - V_YELLOW_ROOF,
    (s) => s - V_PIN_TOP[0],
    (s) => s - V_PIN_TOP[1],
    (s) => s - V_PLUM_END,
    (s) => s - V_SCREEN.s0,
    (s) => s - V_SCREEN.s1,
    (s) => s - (V_SCREEN.s0 - f),
    (s) => s - (V_SCREEN.s1 + f),
    (s, _y, x) => x - vScreenHalf(s),
    (s, _y, x) => x + vScreenHalf(s),
    (s, _y, x) => x - vScreenHalf(s) - f,
    (s, _y, x) => x + vScreenHalf(s) + f,
  ];
}

const VOYAGER_BODY: BodyDef = {
  half: VOYAGER.bodyWidth.value / 2,
  floor: V_FLOOR,
  wallTop: V_WALL,
  crown: V_CROWN,
  rows: [1.32, 1.6, 1.84, 2.0, 2.2, 2.4, 2.55, 2.66, 2.8],
  nose: VOYAGER_NOSE,
  faceSetback: GAP,
  // the plum valance round the coupler, then the yellow face (xc220-02, xc220-03)
  faceBands: [[0.98, XC.plum], [9, XC.yellow]],
  face: [
    // the coupler's dark recess in the valance, and the smoked-glass lamp pods at the face's lower corners, a big headlight low in each and a smaller lamp above
    // and inboard (xc220-02, xc220-03, xc221-01: the pods are rounded, about 0.45 m across and 0.5 m tall). ASSUMED sizes.
    { name: 'coupler-recess', outline: roundedRect(-0.42, 0.42, 0.56, 0.96, 0.04, 2), lift: 0.003, colour: 0x111214 },
    // the pods stand proud of the face, smoked domes about 0.1 m deep (xc220-03); each lens lies on the dome's skin
    { name: 'lamp-pod', outline: [], lift: 0, colour: POD_GLASS, mirror: true, dome: { cx: 0.95, cy: 1.3, rx: 0.24, ry: 0.29, h: 0.1 } },
    { name: 'headlight', outline: ellipse(0.97, 1.21, 0.1, 0.1, 16), lift: 0, lens: 'head', mirror: true },
    { name: 'tail-lamp', outline: ellipse(0.86, 1.45, 0.055, 0.055, 14), lift: 0, lens: 'tail', mirror: true },
    { name: 'marker', outline: ellipse(1.0, 1.43, 0.035, 0.035, 12), lift: 0, lens: 'marker', mirror: true },
    // a pale grab rail under the screen (xc220-03)
    { name: 'grab-rail', outline: roundedRect(-0.42, 0.42, 2.02, 2.06, 0.015, 2), lift: 0.004, colour: 0xa9adb3 },
  ],
  noseCoupler: 'dellner',
  innerCoupler: 'dellner',
  paint: voyagerPaint,
  cuts: voyagerCuts,
  // two pantograph wipers parked leaning across the screen, both the same way (xc220-03, xc220-02): ASSUMED lengths
  wipers: [[[0.3, -0.55], [1.15, -0.1]], [[0.3, 0.05], [1.15, 0.5]]],
  // the oval cab side window behind the screen (xc220-02, xc220-03): ASSUMED 0.96 m by 0.72 m
  cabWindow: { kind: 'ellipse', s: 2.15, y: 2.55, a: 0.48, b: 0.36 },
  doors: voyagerDoors,
  windows(car) {
    const w = VOYAGER.windowWidth.value;
    const d = voyagerDoors(car).filter((x) => !x.crew).map((x) => x.s);
    const a = (d[0] as number) + VOYAGER.doorWidth.value / 2 + 0.75;
    const b = (d[d.length - 1] as number) - VOYAGER.doorWidth.value / 2 - 0.75;
    return windowsBetween(a, b, w, 2.15);
  },
  windowY: V_WINDOW_Y,
  doorY: [V_FLOOR + 0.02, 2.98],
  gangway: true,
  // inside-frame bogies on both classes (xc220-05 shows bare wheel faces; Bombardier on the 221: "internally supported bogies"); see voyagerBogie
  bogie: { style: 'alstom', radius: VOYAGER.wheelDiameter.value / 2, wheelbase: VOYAGER.wheelbase.value },
  // ASSUMED masses: the engine and alternator raft, its cooler (the louvred grilles under each car in xc221-02), the fuel tank and batteries
  underfloor: [
    { name: 'fuel-tank', form: 'tank', length: 2.4, half: 0.95, bottom: 0.42, colour: 0x403c3e },
    { name: 'cooler', form: 'cooler', length: 2.2, half: 0.9, bottom: 0.45, colour: 0x48474a },
    { name: 'engine', form: 'engine', length: 3.0, half: 0.95, bottom: 0.4, colour: 0x3e3d40 },
    { name: 'alternator', form: 'transmission', length: 1.3, half: 0.8, bottom: 0.46, colour: 0x38373a },
    { name: 'battery-box', form: 'battery', length: 1.2, half: 0.75, bottom: 0.52, colour: 0x3a393c },
  ],
  underColour: XC.under,
  roof(car, add) {
    // after voyager-roof-01 and -02 (overbridge views): at each end of a car a low raised cooler hatch in the roof's colour, nearly the crown's
    // width, with a pair of dark grilles let into it; about a third of the way along, a dark slatted exhaust box on the centre line. ASSUMED sizes.
    const hatch = (s: number): void => {
      add(-0.78, 0.78, V_CROWN - 0.06, V_CROWN + 0.035, s, s + 2.3, XC.roof);
      for (const x of [-0.42, 0.42]) add(x - 0.27, x + 0.27, V_CROWN + 0.035, V_CROWN + 0.042, s + 0.35, s + 1.95, 0x17141a);
    };
    hatch(car.cab ? 4.2 : 0.9);
    hatch(car.length - 3.2);
    const e = car.length * 0.42;
    add(-0.42, 0.42, V_CROWN - 0.05, V_CROWN + 0.03, e, e + 1.7, 0x201d22);
    for (let k = 0; k < 9; k++) add(-0.4, 0.4, V_CROWN + 0.03, V_CROWN + 0.06, e + 0.08 + k * 0.18, e + 0.16 + k * 0.18, 0x34303a);
  },
};


// --- the HST: Class 43 power car ------------------------------------------------------------------------------------------------

const H_FLOOR = HST.floorHeight.value;
const H_CROWN = HST.height.value - 0.02;
const H_WALL = 3.0;

/**
 * The Class 43's nose, read off scotrail-hst-03 (side 3/4) and scotrail-hst-04 (head on) against the published 3.90 m: a low, blunt navy wedge about 1.2 m tall
 * leaning back, the lamps and the grille along its top at about 1.5 m; over it the yellow panel, flat and steep (about 55 degrees), from 1.72 m at the tip to the
 * cab roof's edge at 3.3 m 1.3 m back, the screen in its upper half; then the cab roof easing into the crown by 3.0 m. ASSUMED to about 0.1 m.
 */
const CLASS43_NOSE: NoseSpec = {
  length: 3.0,
  knots: [
    { s: 0, top: 1.72, ws: 0.9, bottom: 0.55 },
    { s: 0.25, top: 1.95, ws: 0.95, bottom: 0.56 },
    { s: 0.6, top: 2.38, ws: 0.98, bottom: 0.62 },
    { s: 0.95, top: 2.82, ws: 1, bottom: 0.72 },
    { s: 1.3, top: 3.3, ws: 1, bottom: 0.85 },
    { s: 1.7, top: 3.62, ws: 1, bottom: 1.0 },
    { s: 2.3, top: 3.82, ws: 1, bottom: H_FLOOR - 0.02 },
    { s: 3.0, top: H_CROWN, ws: 1, bottom: H_FLOOR },
  ],
  fillet: 0.32,
  filletLoss: 0.2,
  filletSteps: 9,
  roundLen: 2.7,
  widest: 0.42,
  boxiness: 3.2,
  rake: { lean: 0.42, from: 0.52, reach: 1.25 },
};

/** The Class 43's screen in the upper half of the yellow panel (s from the tip): from about 2.55 m to 3.3 m, with about as much yellow below it as its own
 * height (scotrail-hst-04 head on), about 0.7 of the cab's width at its foot, a little less at its head. ASSUMED. */
const H_SCREEN = { s0: 0.74, s1: 1.28, foot: 0.95, head: 0.86, frame: 0.07 };
const hScreenHalf = (s: number): number => lerp(H_SCREEN.foot, H_SCREEN.head, (s - H_SCREEN.s0) / (H_SCREEN.s1 - H_SCREEN.s0));
/** Navy below this height all round the nose, the lamps and grille in it; yellow above (scotrail-hst-04: a near-horizontal edge just over the lamps). */
const H_NAVY_TOP = 1.72;
/** The yellow wraps the cab side back to here, short of the cab side window; over the roof it runs this far behind the screen. ASSUMED. */
const H_YELLOW_SIDE = 1.95;
const H_YELLOW_ROOF = H_SCREEN.s1 + 0.18;
const H_ROOF = H_WALL + 0.32;
/** Where the charcoal cab roof gives way to the grey roof, under the exhaust hatch's front edge. ASSUMED. */
const H_CAB_ROOF = 3.4;
/** The navy foot under the grey, on the power car's rear and every coach (scotrail-hst-06). ASSUMED height. */
const SR_FOOT = 1.42;
/** Where the power car's navy front half ends in the skyline, and where the louvres run (scotrail-hst-03, -04). ASSUMED. */
const H_SKY: [number, number] = [8.6, 13.3];
const H_LOUVRE: [number, number] = [4.55, 13.3];

/**
 * A skyline of Edinburgh and Glasgow landmarks over t in [0, 1], heights in metres above its base (scotrail-hst-06, scotrail-hst-04): roofs and spires,
 * the Scott Monument, the castle on its rock, a statue on horseback, a clock tower, the Finnieston crane and a bridge's arch. ASSUMED shapes, drawn by eye.
 */
const SKYLINE: { t0: number; t1: number; h: number; form: 'box' | 'spike' | 'dome' }[] = [
  { t0: 0.0, t1: 0.06, h: 0.12, form: 'box' }, { t0: 0.05, t1: 0.08, h: 0.32, form: 'spike' }, { t0: 0.08, t1: 0.14, h: 0.2, form: 'box' },
  { t0: 0.135, t1: 0.165, h: 0.46, form: 'spike' }, { t0: 0.16, t1: 0.22, h: 0.24, form: 'box' }, { t0: 0.2, t1: 0.48, h: 0.36, form: 'dome' },
  { t0: 0.29, t1: 0.42, h: 0.56, form: 'box' }, { t0: 0.32, t1: 0.35, h: 0.66, form: 'box' }, { t0: 0.38, t1: 0.4, h: 0.62, form: 'box' },
  { t0: 0.48, t1: 0.55, h: 0.16, form: 'box' }, { t0: 0.545, t1: 0.575, h: 0.48, form: 'box' }, { t0: 0.575, t1: 0.67, h: 0.14, form: 'box' },
  { t0: 0.67, t1: 0.695, h: 0.52, form: 'box' }, { t0: 0.69, t1: 0.8, h: 0.1, form: 'box' }, { t0: 0.8, t1: 0.815, h: 0.44, form: 'box' },
  { t0: 0.8, t1: 0.87, h: 0.44, form: 'spike' }, { t0: 0.87, t1: 0.92, h: 0.06, form: 'box' }, { t0: 0.92, t1: 0.99, h: 0.18, form: 'dome' },
];
export function skylineHeight(t: number): number {
  let h = 0;
  for (const p of SKYLINE) {
    if (t < p.t0 || t > p.t1) continue;
    const u = (2 * (t - p.t0)) / (p.t1 - p.t0) - 1;
    h = Math.max(h, p.form === 'box' ? p.h : p.form === 'spike' ? p.h * (1 - Math.abs(u)) : p.h * Math.sqrt(Math.max(0, 1 - u * u)));
  }
  return h;
}

function class43Paint(_car: IntercityCar, s: number, y: number, ax: number): number {
  const f = H_SCREEN.frame;
  if (y > 2.1 && s > H_SCREEN.s0 - f && s < H_SCREEN.s1 + f) {
    const h = hScreenHalf(s);
    if (ax < h && s > H_SCREEN.s0 && s < H_SCREEN.s1) return GLASS;
    if (ax < h + f) return FRAME;
  }
  const roof = y > H_ROOF;
  // the cab roof behind the yellow is dark charcoal back to the hatch (hst-roof-01, scotrail-hst-03)
  if (roof) return s < H_YELLOW_ROOF ? SR.yellow : s < H_CAB_ROOF ? SR.cabRoof : SR.roof;
  if (y > H_NAVY_TOP && s < H_YELLOW_SIDE) return SR.yellow;
  // the engine room's louvre panels along the shoulder: grey, the dark slots laid over them (hst-roof-01, -02; scotrail-hst-03)
  if (s > H_LOUVRE[0] && s < H_LOUVRE[1] && y > H_WALL - 0.02 && y < H_WALL + 0.3) return SR.louvrePanel;
  // the navy front half; behind it grey over a navy foot, the skyline laid on the wall over both
  if (s < H_SKY[0] || y < SR_FOOT) return SR.navy;
  return SR.grey;
}

const class43Cuts = (car: IntercityCar): Cut[] => {
  const f = H_SCREEN.frame;
  const cuts: Cut[] = [
    (_s, y) => y - SR_FOOT, (s) => s - H_SKY[0], (s) => s - H_LOUVRE[0], (s) => s - H_LOUVRE[1], (_s, y) => y - (H_WALL - 0.02), (_s, y) => y - (H_WALL + 0.3), (_s, y) => y - H_ROOF,
  ];
  if (!car.cab) return cuts;
  return [
    ...cuts,
    (_s, y) => y - H_NAVY_TOP, (_s, y) => y - 2.1, (s) => s - H_YELLOW_SIDE, (s) => s - H_YELLOW_ROOF, (s) => s - H_CAB_ROOF,
    (s) => s - H_SCREEN.s0, (s) => s - H_SCREEN.s1, (s) => s - (H_SCREEN.s0 - f), (s) => s - (H_SCREEN.s1 + f),
    (s, _y, x) => x - hScreenHalf(s), (s, _y, x) => x + hScreenHalf(s), (s, _y, x) => x - hScreenHalf(s) - f, (s, _y, x) => x + hScreenHalf(s) + f,
  ];
};

const CLASS43_BODY: BodyDef = {
  half: HST.bodyWidth.value / 2,
  floor: H_FLOOR,
  wallTop: H_WALL,
  crown: H_CROWN,
  rows: [1.35, 1.6, 1.85, 2.1, 2.35, 2.6, 2.85],
  nose: CLASS43_NOSE,
  faceSetback: 0.02,
  // the lower front is navy, with the lamps and grille in it; the yellow starts just over them (scotrail-hst-04)
  faceBands: [[1.72, SR.navy], [9, SR.yellow]],
  face: [
    // ASSUMED, from scotrail-hst-04 head on: the dark air grille between the lamps, and each side two round lamps side by side in dark bezels, the headlight
    // outboard, a small marker over the pair
    { name: 'grille', outline: roundedRect(-0.3, 0.3, 1.34, 1.53, 0.02, 2), lift: 0.003, colour: 0x121316 },
    { name: 'lamp-bezel', outline: ellipse(0.66, 1.43, 0.1, 0.1, 18), lift: 0.004, colour: 0x15171b, mirror: true },
    { name: 'lamp-bezel', outline: ellipse(0.45, 1.43, 0.1, 0.1, 18), lift: 0.004, colour: 0x15171b, mirror: true },
    { name: 'headlight', outline: ellipse(0.66, 1.43, 0.08, 0.08, 16), lift: 0.008, lens: 'head', mirror: true },
    { name: 'tail-lamp', outline: ellipse(0.45, 1.43, 0.08, 0.08, 16), lift: 0.008, lens: 'tail', mirror: true },
    { name: 'marker', outline: ellipse(0.555, 1.27, 0.032, 0.032, 12), lift: 0.006, lens: 'marker', mirror: true },
  ],
  noseCoupler: null,
  // the HST's buckeye couplers (not a Dellner head) between its vehicles: ASSUMED proportions
  innerCoupler: 'buckeye',
  paint: class43Paint,
  cuts: class43Cuts,
  // the power car's skyline: the navy front half's trailing edge, falling from the cantrail to the foot as the landmarks pass (scotrail-hst-04, -03)
  skyline: (car) => (car.cab ? { s0: H_SKY[0], s1: H_SKY[1], base: SR_FOOT, colour: SR.navy, height: (s) => {
    const t = (s - H_SKY[0]) / (H_SKY[1] - H_SKY[0]);
    return Math.max((1 - t) * (H_WALL - 0.02 - SR_FOOT), 1.6 * skylineHeight(t));
  } } : null),
  // one wiper parked across the screen's foot (scotrail-hst-04): ASSUMED length
  wipers: [[[0.8, 0.12], [1.18, 0.62]]],
  // the cab side window behind the screen's corner (scotrail-hst-03): ASSUMED 0.67 m by 0.58 m
  cabWindow: { kind: 'box', s0: 2.06, s1: 2.7, y0: 2.4, y1: 2.98 },
  // the cab door just behind the yellow, navy with a tall window (scotrail-hst-03); no passenger doors
  doors: () => [{ s: 3.2, width: 0.68, crew: true, colour: SR.navy }],
  windows: () => [],
  windowY: [2.0, 2.7],
  doorY: [H_FLOOR + 0.02, 2.98],
  gangway: false,
  bogie: { style: 'electrostar', radius: HST.powerWheelDiameter.value / 2, wheelbase: HST.wheelbase.value },
  // ASSUMED: the fuel tank slung between the bogies (scotrail-hst-03), battery and air tanks either side
  underfloor: [
    { name: 'battery-box', form: 'battery', length: 1.0, half: 0.8, bottom: 0.55, colour: 0x2f3034 },
    { name: 'fuel-tank', form: 'tank', length: 3.4, half: 1.05, bottom: 0.4, colour: 0x2a2b2f },
    { name: 'air-tanks', form: 'transmission', length: 1.0, half: 0.8, bottom: 0.55, colour: 0x303135 },
  ],
  underColour: SR.under,
  roof(car, add) {
    // after hst-roof-01 and -02 (overbridge views): behind the cab roof a dark raised hatch with the exhaust's square outlet on it; over the rear
    // (radiator) end the cooler group's fan housing. ASSUMED sizes.
    add(-0.85, 0.85, H_CROWN - 0.06, H_CROWN + 0.02, 3.4, 5.6, 0x26282c);
    add(-0.3, 0.3, H_CROWN + 0.02, H_CROWN + 0.04, 4.2, 4.8, 0x141518);
    add(-0.9, 0.9, H_CROWN - 0.06, H_CROWN + 0.04, car.length - 4.3, car.length - 2.1, 0x2b2d31);
  },
  // the engine room's louvres along both shoulders (hst-roof-01: panels of upright slots from behind the cab to the radiator end). ASSUMED pitch.
  cantLouvres: (car) => (car.cab ? [{ s0: H_LOUVRE[0], s1: H_LOUVRE[1], y0: H_WALL - 0.01, y1: H_WALL + 0.29, panel: 1.0, gap: 0.12, pitch: 0.1, slot: 0.045, colour: SR.louvre }] : []),
  sideFittings: (car) => [
    // the radiator grille on the grey rear of the side (scotrail-hst-03), ribbed
    { s0: car.length - 4.15, s1: car.length - 2.55, y0: 1.42, y1: 2.92, colour: 0x3a3d43, ribs: 16 },
  ],
};

// --- the HST: Mk3 coach ---------------------------------------------------------------------------------------------------------

/** Inter7City coach (scotrail-hst-06): a navy foot, pale grey sides with the skyline rising from the foot mid-car, a navy window band, pale grey over it to an orange line at the cantrail, a grey roof. ASSUMED heights. */
const MK3_BAND: [number, number] = [1.78, 2.84];
const MK3_PIN: [number, number] = [H_WALL + 0.1, H_WALL + 0.17];
const MK3_DOOR_FROM_END = 0.95;

function mk3Paint(_car: IntercityCar, _s: number, y: number): number {
  if (y > H_ROOF) return SR.roof;
  if (y > MK3_PIN[0] && y < MK3_PIN[1]) return SR.orange;
  if (y >= MK3_BAND[0] && y <= MK3_BAND[1]) return SR.navyBand;
  if (y < SR_FOOT) return SR.navy;
  return SR.grey;
}

const MK3_BODY: BodyDef = {
  ...CLASS43_BODY,
  rows: [SR_FOOT, 1.6, MK3_BAND[0], 2.0, 2.3, 2.6, MK3_BAND[1]],
  paint: (car, s, y) => mk3Paint(car, s, y),
  cuts: () => [(_s, y) => y - MK3_PIN[0], (_s, y) => y - MK3_PIN[1], (_s, y) => y - H_ROOF],
  // the skyline from the foot, over the middle half of the side (scotrail-hst-06): ASSUMED span
  skyline: (car) => ({ s0: 0.32 * car.length, s1: 0.92 * car.length, base: SR_FOOT, colour: SR.navy, height: (s) => 0.55 * skylineHeight((s - 0.32 * car.length) / (0.6 * car.length)) }),
  wipers: undefined,
  doors: (car) => [MK3_DOOR_FROM_END, car.length - MK3_DOOR_FROM_END].map((s) => ({ s, width: HST.coachDoorWidth.value, colour: SR.grey })),
  // ASSUMED: eight wide windows a side, 1.9 m with 0.35 m piers, filling most of the navy band (scotrail-hst-06; the first-class coach's narrower ones are not drawn apart)
  windows: (car) => windowsBetween(MK3_DOOR_FROM_END + 1.15, car.length - MK3_DOOR_FROM_END - 1.15, 1.9, 2.25),
  windowY: [1.88, 2.76],
  gangway: true,
  bogie: { style: 'electrostar', radius: HST.coachWheelDiameter.value / 2, wheelbase: HST.wheelbase.value },
  underfloor: [
    { name: 'battery-box', form: 'battery', length: 1.3, half: 0.75, bottom: 0.6, colour: 0x303135 },
    { name: 'air-con', form: 'cooler', length: 1.8, half: 0.85, bottom: 0.58, colour: 0x35363a },
    { name: 'water-tank', form: 'tank', length: 2.2, half: 0.85, bottom: 0.55, colour: 0x2d2e32 },
  ],
  roof(car, add) {
    // ASSUMED, after scotrail-hst-05's elevated view: small vents along the roof's middle
    for (const f of [0.22, 0.5, 0.78]) add(-0.2, 0.2, H_CROWN - 0.03, H_CROWN + 0.05, car.length * f - 0.3, car.length * f + 0.3, 0x34363a);
  },
  sideFittings: undefined,
  cabWindow: undefined,
};

export const INTERCITY_BODIES: Readonly<Record<IntercityBody, BodyDef>> = { voyager: VOYAGER_BODY, class43: CLASS43_BODY, mk3: MK3_BODY };
/** The 221 shares the 220's body: the photographs show the same nose, doors and windows, and both ride on inside-frame bogies. Its tilt gear is not drawn. */
const bodyFor = (_layout: IntercityLayout, car: IntercityCar): BodyDef => INTERCITY_BODIES[car.body];

// --- one car ---------------------------------------------------------------------------------------------------------------------

interface LampLens { role: LensRole; v0: number; v1: number }
/** A vertex of the loft: where it is (car frame, before the car's own turn), its normal (turned), and its s along the car. */
interface LoftVertex { p: V3; n: V3; s: number }

/** Cut a convex polygon of the loft along the line where `cut` is zero: one piece each side (an edge the line crosses gets the same point from both its quads). */
export function splitPolygon(poly: LoftVertex[], cut: Cut): LoftVertex[][] {
  const f = poly.map((v) => cut(v.s, v.p[1], v.p[0]));
  const eps = 1e-9;
  if (f.every((x) => x >= -eps) || f.every((x) => x <= eps)) return [poly];
  const pos: LoftVertex[] = [];
  const neg: LoftVertex[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as LoftVertex;
    const bv = poly[(i + 1) % poly.length] as LoftVertex;
    const fa = f[i] as number;
    const fb = f[(i + 1) % poly.length] as number;
    if (fa >= -eps) pos.push(a);
    if (fa <= eps) neg.push(a);
    if ((fa > eps && fb < -eps) || (fa < -eps && fb > eps)) {
      const t = fa / (fa - fb);
      const v: LoftVertex = { p: [lerp(a.p[0], bv.p[0], t), lerp(a.p[1], bv.p[1], t), lerp(a.p[2], bv.p[2], t)], n: unit([lerp(a.n[0], bv.n[0], t), lerp(a.n[1], bv.n[1], t), lerp(a.n[2], bv.n[2], t)]), s: lerp(a.s, bv.s, t) };
      pos.push(v);
      neg.push(v);
    }
  }
  return [pos, neg].filter((piece) => piece.length >= 3);
}

function buildCar(car: IntercityCar, layout: IntercityLayout): THREE.Group {
  const b = bodyFor(layout, car);
  const group = new THREE.Group();
  group.name = `car-${car.index}`;
  group.userData = { index: car.index, type: car.type, body: car.body, start: car.start, end: car.end, length: car.length, cab: car.cab, bogies: car.bogies, allocation: 'assumed fleet', geometryBasis: 'assumed', source: layout.spec.source };
  const sec = intercitySection(b);
  const W = sec.width;
  const norm = normalised(sec);
  const egg = eggSection(norm, b.nose.widest, b.nose.boxiness);
  const dir = car.cab === 'rear' ? -1 : 1;
  const base = car.cab === 'rear' ? car.end : car.start;
  const Z = (s: number): number => base + dir * s;
  const world = (p: V3): V3 => [p[0], p[1], Z(p[2])];
  const wn = (n: V3): V3 => [n[0], n[1], n[2] * dir];
  const tip = car.cab ? b.faceSetback : GAP;
  const bodyEnd = car.length - GAP;
  const shell = new Soup();
  const detail = new Soup();
  const glass = new Soup();
  const lenses: LampLens[] = [];

  // rings: the nose's (a cab car), then about every half metre to the far end, so the paint's edges along the car fall within a quarter metre
  const rings: { s: number; pts: [number, number][]; rh: number }[] = [];
  let from = tip;
  if (car.cab) {
    for (const sn of ringStations(b.nose)) {
      const r = ringAt(b.nose, sn);
      rings.push({ s: tip + sn, pts: loopFromHalf(halfAt(sec, norm, egg, r)), rh: r.ws * W });
    }
    from = tip + b.nose.length;
  }
  const body = loopFromHalf(sec.half);
  const n = Math.max(1, Math.ceil((bodyEnd - from) / 0.5));
  for (let k = car.cab ? 1 : 0; k <= n; k++) rings.push({ s: lerp(from, bodyEnd, k / n), pts: body, rh: W });
  const setBack = (s: number, y: number): number => (car.cab ? rakeSet(b.nose, s - tip, y) : 0);
  const P: V3[][] = rings.map((r) => r.pts.map(([x, y]): V3 => [x, y, r.s + setBack(r.s, y)]));
  const N = gridNormals(P, true, (i) => {
    const r = rings[i] as { s: number; pts: [number, number][] };
    const ys = r.pts.map((p) => p[1]);
    const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
    return [0, mid, r.s + setBack(r.s, mid)];
  });
  const M = (rings[0] as { pts: unknown[] }).pts.length;
  const cuts = b.cuts(car);
  const sOf = (i: number): number => (rings[i] as { s: number }).s - (car.cab ? tip : 0);
  for (let i = 0; i + 1 < rings.length; i++) {
    const r0 = rings[i] as { s: number; rh: number };
    const r1 = rings[i + 1] as { s: number; rh: number };
    const rh = (r0.rh + r1.rh) / 2;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const idx: [number, number][] = [[i, j], [i, j1], [i + 1, j1], [i + 1, j]];
      const quad: LoftVertex[] = idx.map(([a, c]) => ({ p: (P[a] as V3[])[c] as V3, n: wn((N[a] as V3[])[c] as V3), s: sOf(a) }));
      let pieces = [quad];
      for (const cut of cuts) pieces = pieces.flatMap((piece) => splitPolygon(piece, cut));
      for (const piece of pieces) {
        const k = piece.length;
        const colour = b.paint(car, piece.reduce((a, v) => a + v.s, 0) / k, piece.reduce((a, v) => a + v.p[1], 0) / k, piece.reduce((a, v) => a + Math.abs(v.p[0]), 0) / k, rh);
        const into = colour === GLASS ? glass : shell;
        const c = colour === GLASS ? null : col(colour);
        if (k === 4) into.quad(piece.map((v) => world(v.p)) as [V3, V3, V3, V3], piece.map((v) => v.n) as [V3, V3, V3, V3], c);
        else for (let m = 1; m + 1 < k; m++) {
          const tri = [piece[0], piece[m], piece[m + 1]] as [LoftVertex, LoftVertex, LoftVertex];
          into.tri(tri.map((v) => world(v.p)) as [V3, V3, V3], tri.map((v) => v.n) as [V3, V3, V3], c);
        }
      }
    }
  }

  // the end walls: a dark cap at each inner end of the body
  const cap = (i: number, outward: 1 | -1): void => {
    const r = rings[i] as { s: number; pts: [number, number][] };
    detail.fan(r.pts.map(([x, y]): V3 => world([x, y, r.s])), [0, 0, outward * dir], col(0x2d3035));
  };
  const lampMode: TrainLampMode = car.cab === 'rear' ? 'tail' : 'head';
  if (car.cab) {
    // the face: the tip ring, in its colour bands, leaning back with the rake; and the shapes laid on it
    const r0 = ringAt(b.nose, 0);
    const outline = loopFromHalf(halfAt(sec, norm, egg, r0));
    const lean = rakeLean(b.nose, 0);
    const faceN: V3 = wn(unit([0, lean, -1]));
    const run = Math.hypot(1, lean);
    const onFace = (poly: [number, number][], lift: number): V3[] => poly.map(([x, y]): V3 => world([x * dir, y, tip + setBack(tip, y) - lift * run]));
    // how far a dome on the face stands out at (x, y), so a shape laid over a dome rides 6 mm off its skin at every vertex
    const domes = b.face.flatMap((f) => (f.dome ? (f.mirror ? [f.dome, { ...f.dome, cx: -f.dome.cx }] : [f.dome]) : []));
    const domeAt = (x: number, y: number): number => Math.max(0, ...domes.map((d) => {
      const r = ((x - d.cx) / d.rx) ** 2 + ((y - d.cy) / d.ry) ** 2;
      return r < 1 ? d.h * Math.sqrt(1 - r) : 0;
    }));
    const onFaceOver = (poly: [number, number][], lift: number): V3[] => poly.map(([x, y]): V3 => {
      const l = Math.max(lift, domeAt(x, y) > 0 ? domeAt(x, y) + 0.006 : 0);
      return world([x * dir, y, tip + setBack(tip, y) - l * run]);
    });
    // a shape fanned from its own centre, lifted there too (the mean of a lifted rim lies under a dome's crown, and the dome showed through it)
    const fanOver = (poly: [number, number][], lift: number, c: THREE.Color): void => {
      const centre: [number, number] = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
      const [C] = onFaceOver([centre], lift) as [V3];
      const rim = onFaceOver(poly, lift);
      for (let k = 0; k < rim.length; k++) detail.tri([C, rim[k] as V3, rim[(k + 1) % rim.length] as V3], [faceN, faceN, faceN], c);
    };
    let below = -Infinity;
    for (const [topY, colour] of b.faceBands) {
      const band = clipConvex(outline, [[-9, below === -Infinity ? -9 : below], [9, below === -Infinity ? -9 : below], [9, topY], [-9, topY]]);
      if (band.length >= 3) detail.fan(onFace(band, 0), faceN, col(colour));
      below = topY;
    }
    for (const shape of b.face) {
      for (const mirrored of shape.mirror ? [false, true] : [false]) {
        if (shape.dome) {
          // a half-ellipsoid standing out of the face: rings of falling radius, lifted along the face's normal, the normals the ellipsoid's
          const d = shape.dome;
          const cx = mirrored ? -d.cx : d.cx;
          const R = 6;
          const S = 22;
          const at = (k: number, j: number): [V3, V3] => {
            const phi = (Math.min(k, R - 0.02) / R) * (Math.PI / 2);
            const th = (j / S) * Math.PI * 2;
            const c = Math.cos(phi);
            const sn = Math.sin(phi);
            const p = onFace([[cx + d.rx * c * Math.cos(th), d.cy + d.ry * c * Math.sin(th)]], d.h * sn)[0] as V3;
            const g: V3 = [(c * Math.cos(th)) / d.rx, (c * Math.sin(th)) / d.ry, sn / d.h];
            return [p, unit(add(add(scale([dir, 0, 0], g[0]), scale([0, 1, 0], g[1])), scale(faceN, g[2])))];
          };
          for (let k = 0; k < R; k++) for (let j = 0; j < S; j++) {
            const q = [at(k, j), at(k, j + 1), at(k + 1, j + 1), at(k + 1, j)];
            detail.quad(q.map((v) => v[0]) as [V3, V3, V3, V3], q.map((v) => v[1]) as [V3, V3, V3, V3], col(shape.colour ?? POD_GLASS));
          }
          continue;
        }
        const poly = clipConvex(shape.outline.map(([x, y]): [number, number] => [mirrored ? -x : x, y]), outline, 0.01);
        if (poly.length < 3) continue;
        if (shape.lens) {
          const look = lensLook(shape.lens, lampMode);
          const v0 = detail.glow.length;
          detail.emit = look.glow;
          fanOver(poly, shape.lift, col(look.hex));
          detail.emit = 0;
          lenses.push({ role: shape.lens, v0, v1: detail.glow.length });
          if (shape.lens === 'head') {
            const m = new THREE.Object3D();
            m.name = 'headlight';
            const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
            const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
            m.position.set(cx * dir, cy, Z(tip + setBack(tip, cy)));
            m.userData = { side: cx * dir > 0 ? 'right' : 'left' };
            group.add(m);
          }
        } else fanOver(poly, shape.lift, col(shape.colour ?? 0));
      }
    }
    if (b.noseCoupler) {
      const y = 0.8;
      const wall = tip + setBack(tip, y);
      dellnerNose(detail, Z(wall), (-dir) as 1 | -1, wall, y);
      const m = new THREE.Object3D();
      m.name = 'nose-coupler';
      m.position.set(0, y, Z(wall / 2));
      m.userData = { end: car.cab, style: b.noseCoupler, reach: wall };
      group.add(m);
      // the plum valance blocks either side of the coupler (xc220-02, xc220-03): ASSUMED 0.32 m wide, standing to the face's foot
      for (const sx of [-1, 1]) {
        const z0 = Z(tip + 0.02);
        const z1 = Z(tip + 0.45);
        detail.box(sx * 0.62 - 0.17, sx * 0.62 + 0.17, 0.42, 0.98, Math.min(z0, z1), Math.max(z0, z1), col(XC.plumDark));
      }
    }
    // the cab side windows: a dark seal and the glass over it, laid on the flank (each point on the loft's own surface, lifted off it sideways)
    const cw = b.cabWindow;
    if (cw) {
      const surface = (side: number, s: number, y: number, lift: number): V3 => {
        const h = s < b.nose.length ? halfAt(sec, norm, egg, ringAt(b.nose, s)) : sec.half;
        return world([side * (xAtY(h, y) + lift), y, tip + s + setBack(tip + s, y)]);
      };
      const rows = 8;
      const cols = 10;
      const patch = (side: number, grow: number, lift: number, target: Soup, colour: THREE.Color | null): void => {
        const at = (i: number, j: number): V3 => {
          const v = i / rows;
          const u = j / cols;
          if (cw.kind === 'box') return surface(side, lerp(cw.s0 - grow, cw.s1 + grow, u), lerp(cw.y0 - grow, cw.y1 + grow, v), lift);
          const y = cw.y + (cw.b + grow) * Math.sin(Math.PI * (v - 0.5));
          const hs = (cw.a + grow) * Math.cos(Math.PI * (v - 0.5));
          return surface(side, cw.s + hs * (2 * u - 1), y, lift);
        };
        const n = wn([side, 0, 0]);
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) target.quad([at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)], [n, n, n, n], colour);
      };
      for (const side of [-1, 1]) {
        patch(side, 0.035, 0.008, detail, col(GASKET));
        patch(side, 0, 0.012, glass, null);
      }
    }
    // the wipers: each a pantograph pair of thin dark arms lying on the screen, a little off the glass
    for (const [[sa, xa], [sb, xb]] of b.wipers ?? []) {
      // a point of the nose's top surface, then lifted 25 mm off it along its normal (a lift in y alone slides along the raked glass, not off it)
      const surfaceAt = (s: number, x: number): V3 => {
        const y = yAtX(halfAt(sec, norm, egg, ringAt(b.nose, s)), Math.abs(x));
        return [x, y, tip + s + setBack(tip + s, y)];
      };
      const onTop = (s: number, x: number): V3 => {
        const p = surfaceAt(s, x);
        const ds = sub(surfaceAt(s + 0.02, x), surfaceAt(s - 0.02, x));
        const dx = sub(surfaceAt(s, x + 0.02), surfaceAt(s, x - 0.02));
        let nrm = unit(cross(ds, dx));
        if (nrm[1] < 0) nrm = scale(nrm, -1);
        return world(add(p, scale(nrm, 0.025)));
      };
      const len = Math.hypot(sb - sa, xb - xa);
      const [ps, px] = [-(xb - xa) / len, (sb - sa) / len];
      for (const off of [-0.03, 0.03]) {
        const w = 0.012;
        const q = [onTop(sa + ps * (off - w), xa + px * (off - w)), onTop(sb + ps * (off - w), xb + px * (off - w)), onTop(sb + ps * (off + w), xb + px * (off + w)), onTop(sa + ps * (off + w), xa + px * (off + w))];
        const up: V3 = [0, 1, 0];
        detail.quad(q as [V3, V3, V3, V3], [up, up, up, up], col(0x0c0d0f));
      }
    }
  } else cap(0, -1);
  cap(rings.length - 1, 1);

  // gangway bellows and a coupler at every inner end; a power car has no gangway (its inner end is a plain wall)
  const ends: { s: number; sign: 1 | -1 }[] = [{ s: bodyEnd, sign: 1 }];
  if (!car.cab) ends.push({ s: tip, sign: -1 });
  for (const e of ends) {
    const zWall = Z(e.s);
    const zOut = Z(e.s + e.sign * GAP);
    if (b.gangway) {
      const g = { width: 1.9, height: 2.1, bottom: b.floor + 0.05 };
      const outlineAt = (k: number): [number, number][] => roundedRect((-g.width / 2) * k, (g.width / 2) * k, g.bottom + (g.height * (1 - k)) / 2, g.bottom + g.height - (g.height * (1 - k)) / 2, 0.3, 3);
      const rs = bellowsRings(outlineAt, 0, GAP, 1, 0.05);
      const zSeat = zWall + Math.sign(zOut - zWall) * 0.002;
      const pts3: V3[][] = rs.map((r) => r.pts.map(([x, y]): V3 => [x, y, zSeat + (zOut - zSeat) * (r.z / GAP)]));
      const Nb = gridNormals(pts3, true, (i) => [0, g.bottom + g.height / 2, ((pts3[i] as V3[])[0] as V3)[2]]);
      for (let i = 0; i + 1 < pts3.length; i++) {
        const row = pts3[i] as V3[];
        for (let j = 0; j < row.length; j++) {
          const j1 = (j + 1) % row.length;
          const q = [[i, j], [i, j1], [i + 1, j1], [i + 1, j]] as [number, number][];
          detail.quad(q.map(([a, c]) => (pts3[a] as V3[])[c] as V3) as [V3, V3, V3, V3], q.map(([a, c]) => (Nb[a] as V3[])[c] as V3) as [V3, V3, V3, V3], col(0x2a2c31));
        }
      }
      const m = new THREE.Object3D();
      m.name = 'gangway';
      m.position.set(0, g.bottom + g.height / 2, (zWall + zOut) / 2);
      m.userData = { width: g.width, height: g.height, depth: GAP };
      group.add(m);
    }
    // each car's body ends GAP short of the car's end, so its half of the coupling reaches GAP, to the car's end, where it meets its neighbour's half
    const out = (Math.sign(zOut - zWall) || 1) as 1 | -1;
    if (b.innerCoupler === 'buckeye') buckeyeHalf(detail, zWall, out, GAP, 0.95);
    else couplerHalf(detail, zWall, out, GAP, 0.85, b.innerCoupler);
    const cm = new THREE.Object3D();
    cm.name = 'coupler';
    cm.position.set(0, b.innerCoupler === 'buckeye' ? 0.95 : 0.85, (zWall + zOut) / 2);
    cm.userData = { style: b.innerCoupler, headZ: zWall + out * GAP };
    group.add(cm);
  }

  // the underframe: a dark solebar under the body's foot, from end to end (the nose's own underside stops at its knots)
  const sole0 = car.cab ? tip + b.nose.length * 0.6 : tip + 0.1;
  {
    const za = Z(sole0);
    const zb = Z(bodyEnd - 0.1);
    detail.box(-(W - 0.08), W - 0.08, b.floor - 0.16, b.floor + 0.03, Math.min(za, zb), Math.max(za, zb), col(b.underColour), '+y');
  }
  // the masses under the floor, spread between the bogies clear of the wheels (as underfloorBlocks does for the Class 180)
  {
    const reach = b.bogie.wheelbase / 2 + b.bogie.radius + 0.3;
    const lo = Math.min(...car.bogies) + reach;
    const hi = Math.max(...car.bogies) - reach;
    const total = b.underfloor.reduce((a, item) => a + item.length, 0);
    const k = Math.min(1, Math.max(0, hi - lo - 0.12 * (b.underfloor.length + 1)) / total);
    const gap = (hi - lo - total * k) / (b.underfloor.length + 1);
    let z = lo + gap;
    const pods: PodBox[] = b.underfloor.map((item) => {
      const p: PodBox = { form: item.form, colour: item.colour, x0: -item.half, x1: item.half, y0: item.bottom, y1: b.floor - 0.1, z0: z, z1: z + item.length * k };
      z += item.length * k + gap;
      return p;
    });
    for (const p of pods) underfloorPod(detail, p);
    pods.forEach((p, i) => {
      const next = pods[i + 1];
      if (next) podHanger(detail, p, next);
    });
  }

  // doors: a dark frame, the leaf and its window, one marker per opening and side
  const half = b.half;
  const [dy0, dy1] = b.doorY;
  for (const [di, d] of b.doors(car).entries()) {
    const z = Z(d.s);
    for (const sx of [-1, 1]) {
      const lo = (p: number, q: number): [number, number] => [Math.min(sx * p, sx * q), Math.max(sx * p, sx * q)];
      const [fx0, fx1] = lo(W - 0.005, half - 0.01);
      detail.box(fx0, fx1, dy0 - 0.04, dy1 + 0.04, z - d.width / 2 - 0.045, z + d.width / 2 + 0.045, col(0x1c1e21));
      const [lx0, lx1] = lo(W - 0.005, half - 0.004);
      detail.box(lx0, lx1, dy0, dy1, z - d.width / 2, z + d.width / 2, col(d.colour));
      const [px0, px1] = lo(W - 0.005, half);
      const pw = d.crew ? 0.13 : Math.min(0.3, d.width * 0.3);
      detail.box(px0, px1, dy1 - 0.88, dy1 - 0.2, z - pw, z + pw, col(PANE));
      const m = new THREE.Object3D();
      m.name = d.crew ? 'crew-door' : 'door';
      m.position.set(sx * half, (dy0 + dy1) / 2, z);
      m.userData = { side: sx > 0 ? 'right' : 'left', index: di, width: d.width, height: dy1 - dy0 };
      group.add(m);
    }
  }
  // passenger windows: a dark gasket, the glass (lit warm after dark), a pale reflection along its top
  const [wy0, wy1] = b.windowY;
  for (const [s0, s1] of b.windows(car)) {
    const za = Math.min(Z(s0), Z(s1));
    const zb = Math.max(Z(s0), Z(s1));
    for (const sx of [-1, 1]) {
      const out = (rel: number): number => sx * (half - rel);
      detail.prismX(roundedRect(za - 0.04, zb + 0.04, wy0 - 0.04, wy1 + 0.04, 0.12, 2), sx * (W - 0.005), out(0.016), col(GASKET));
      detail.emit = 1;
      detail.prismX(roundedRect(za, zb, wy0, wy1, 0.1, 2), sx * (W - 0.005), out(0.012), col(PANE), false);
      detail.emit = 0;
      detail.prismX(roundedRect(za + 0.05, zb - 0.05, wy1 - 0.24, wy1 - 0.04, 0.06, 2), out(0.0125), out(0.0115), col(SKY), false);
    }
  }
  // the skyline: columns of navy laid on each side wall over the paint, from the foot up to the silhouette
  const sky = b.skyline?.(car);
  if (sky) {
    const step = 0.06;
    const n = Math.ceil((sky.s1 - sky.s0) / step);
    for (let k = 0; k < n; k++) {
      const s0 = sky.s0 + (k * (sky.s1 - sky.s0)) / n;
      const s1 = sky.s0 + ((k + 1) * (sky.s1 - sky.s0)) / n;
      const top = Math.min(b.wallTop - 0.02, sky.base + sky.height((s0 + s1) / 2));
      if (top <= sky.base + 0.005) continue;
      const za = Math.min(Z(s0), Z(s1));
      const zb = Math.max(Z(s0), Z(s1));
      for (const sx of [-1, 1]) {
        const x = sx * (W + 0.003);
        const nrm: V3 = [sx, 0, 0];
        detail.quad([[x, sky.base, za], [x, sky.base, zb], [x, top, zb], [x, top, za]], [nrm, nrm, nrm, nrm], col(sky.colour));
      }
    }
  }
  // side fittings (the power car's radiator grille): a dark panel standing just proud of the wall, with ribs across it
  for (const f of b.sideFittings?.(car) ?? []) {
    const za = Math.min(Z(f.s0), Z(f.s1));
    const zb = Math.max(Z(f.s0), Z(f.s1));
    for (const sx of [-1, 1]) {
      detail.prismX(roundedRect(za, zb, f.y0, f.y1, 0.03, 1), sx * (W - 0.005), sx * (half - 0.012), col(f.colour));
      const ribs = f.ribs ?? 0;
      for (let k = 1; k < ribs; k++) {
        const y = lerp(f.y0, f.y1, k / ribs);
        detail.prismX(roundedRect(za + 0.03, zb - 0.03, y - 0.012, y + 0.012, 0, 1), sx * (half - 0.012), sx * (half - 0.006), col(0x55595f), false);
      }
    }
  }
  // louvres on the shoulder: dark slots on the section's quarter-ellipse (intercitySection: centre (W - 0.55, wallTop), semi-axes 0.55 and
  // crown - wallTop - 0.04), each 5 mm out along the curve's normal, in three steps up the curve
  for (const l of b.cantLouvres?.(car) ?? []) {
    const rx = 0.55;
    const ry = b.crown - b.wallTop - 0.04;
    const at = (y: number): [number, number, number, number] => {
      const phi = Math.asin(Math.min(1, Math.max(0, (y - b.wallTop) / ry)));
      const nx = Math.cos(phi) / rx;
      const ny = Math.sin(phi) / ry;
      const n = Math.hypot(nx, ny);
      const x = y <= b.wallTop ? W : W - rx + rx * Math.cos(phi);
      return [x + (0.005 * nx) / n, y + (0.005 * ny) / n, nx / n, ny / n];
    };
    const rungs = [0, 1, 2, 3].map((k) => at(lerp(l.y0, l.y1, k / 3)));
    const c = col(l.colour);
    for (let p0 = l.s0; p0 + l.panel <= l.s1 + 1e-9; p0 += l.panel + l.gap) {
      for (let s = p0 + (l.pitch - l.slot) / 2; s + l.slot <= p0 + l.panel + 1e-9; s += l.pitch) {
        const za = Z(s);
        const zb = Z(s + l.slot);
        for (const sx of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const [xa, ya, nxa, nya] = rungs[k] as [number, number, number, number];
            const [xb, yb, nxb, nyb] = rungs[k + 1] as [number, number, number, number];
            const na: V3 = [sx * nxa, nya, 0];
            const nb: V3 = [sx * nxb, nyb, 0];
            detail.quad([[sx * xa, ya, za], [sx * xa, ya, zb], [sx * xb, yb, zb], [sx * xb, yb, za]], [na, na, nb, nb], c);
          }
        }
      }
    }
  }
  // roof fittings
  b.roof?.(car, (x0, x1, y0, y1, s0, s1, colour) => {
    const za = Z(s0);
    const zb = Z(s1);
    detail.box(x0, x1, y0, y1, Math.min(za, zb), Math.max(za, zb), col(colour), '-y');
  });

  // bogies: every powered bogie carries its traction motor (both Voyager and Class 43 are diesel-electric); the Mk3's are trailers
  car.bogies.forEach((z, k) => {
    // a Voyager bogie drives its inner axle only (1A'A1': the axle toward the car's middle); the bogies are in z order, so the first's inner axle is its +z one
    const bogie = car.body === 'voyager'
      ? voyagerBogie(b.bogie.radius, b.bogie.wheelbase, z < (car.start + car.end) / 2 ? 1 : -1)
      : buildBogie({ radius: b.bogie.radius, wheelbase: b.bogie.wheelbase, track: TRACK, motor: car.motor[k] as boolean, style: b.bogie.style });
    bogie.name = `bogie-${car.index}-${k}`;
    bogie.position.set(0, 0, z);
    group.add(bogie);
  });

  const shellMesh = new THREE.Mesh(shell.build(), plain());
  shellMesh.name = 'body-shell';
  const detailMesh = new THREE.Mesh(detail.build(), plain());
  detailMesh.name = 'body-detail';
  // the lamps, as train.ts records them, so its setTrainLampState sets these lenses too
  if (car.cab) detailMesh.userData.lamps = { end: car.cab, interior: false, lenses };
  group.add(shellMesh, detailMesh);
  if (glass.pos.length) {
    const m = new THREE.Mesh(glass.build(), glassMaterial());
    m.name = 'cab-glass';
    group.add(m);
  }
  return group;
}

/**
 * The Voyager's nose coupler, a Dellner automatic head (xc220-03, xc220-02): a dark draft-gear housing at the face, a steel shank, and at the car's end the
 * square head with its face plate, the cone and the funnel; a yellow-painted tube lying across the top of the head and a yellow block beside it, two air
 * hoses and the electrical box under the head. Everything stops at the car's end. ASSUMED sizes.
 */
function dellnerNose(soup: Soup, zFace: number, out: 1 | -1, reach: number, y: number): void {
  const dark = col(0x24272b);
  const steel = col(0x4c5056);
  const plate = col(0x60646b);
  const yellow = col(0xe8b812);
  const hose = col(0x111214);

  const span = (a: number, b: number): [number, number] => {
    const p = zFace + out * a;
    const q = zFace + out * b;
    return [Math.min(p, q), Math.max(p, q)];
  };
  const box = (x0: number, x1: number, y0: number, y1: number, a: number, b: number, c: THREE.Color): void => {
    const [z0, z1] = span(a, b);
    soup.box(x0, x1, y0, y1, z0, z1, c);
  };
  box(-0.13, 0.13, y - 0.11, y + 0.11, 0, 0.14, dark);
  box(-0.07, 0.07, y - 0.07, y + 0.07, 0.14, reach - 0.14, steel);
  box(-0.19, 0.19, y - 0.17, y + 0.17, reach - 0.14, reach - 0.012, dark);
  box(-0.19, 0.19, y - 0.17, y + 0.17, reach - 0.012, reach - 0.004, plate);
  // the funnel (a dark square in the plate) and the cone's boss beside it, both within the plate
  box(-0.15, -0.03, y - 0.06, y + 0.06, reach - 0.006, reach, hose);
  box(0.04, 0.15, y - 0.05, y + 0.05, reach - 0.05, reach, steel);
  // the yellow tube across the head's top, and the yellow block on its far side
  const [tz0, tz1] = span(reach - 0.2, reach - 0.06);
  const tube = ellipse((tz0 + tz1) / 2, y + 0.25, (tz1 - tz0) / 2, 0.07, 12);
  soup.prismX(tube, 0.06, -0.46, yellow);
  soup.prismX(tube, -0.46, 0.06, yellow, false);
  box(0.08, 0.3, y + 0.17, y + 0.31, reach - 0.18, reach - 0.04, yellow);
  // the air hoses and the electrical box under the head
  for (const x of [-0.12, 0.12]) box(x - 0.025, x + 0.025, y - 0.42, y - 0.17, reach - 0.1, reach - 0.05, hose);
  box(-0.17, 0.17, y - 0.33, y - 0.18, reach - 0.3, reach - 0.12, dark);

}

/** The HST's buckeye coupler, one car's half: a round shank from the headstock and, at the gap's middle, the knuckle head, taller than wide, its jaw to one side. ASSUMED sizes. */
function buckeyeHalf(soup: Soup, zWall: number, out: 1 | -1, reach: number, y: number): void {
  const steel = col(0x3f4247);
  const dark = col(0x24262a);
  const zEnd = zWall + out * reach;
  const lo = Math.min(zWall, zEnd);
  const hi = Math.max(zWall, zEnd);
  soup.box(-0.065, 0.065, y - 0.065, y + 0.065, lo, hi, steel);
  const h0 = out > 0 ? hi - 0.17 : lo;
  soup.box(-0.17, 0.08, y - 0.18, y + 0.18, h0, h0 + 0.17, dark);
  soup.box(0.08, 0.19, y - 0.13, y + 0.13, out > 0 ? hi - 0.1 : lo, (out > 0 ? hi - 0.1 : lo) + 0.1, steel);
}

/** The Voyager bogie's geometry, by its driven axle's side: shared between the cars like every bogie's (named `bogie-mesh`, never disposed with a train). */
const voyagerBogieGeometry = new Map<string, THREE.BufferGeometry>();

/** The Voyager bogie's frame colours, after voyager-bogie-01 (221134's front bogie): a dusty brown-grey frame, darker boxes and springs. ASSUMED shades. */
const VB = { frame: 0x5e544a, box: 0x4c443c, cover: 0x6c6258, coil: 0x3a332d, spring: 0x544a41, tube: 0x6e6152, grille: 0x26221f } as const;

/** A closed cylinder from `a` to `b`, `n` sided: side quads with outward normals and a fan on each end. */
function cylinder(soup: Soup, a: V3, b: V3, rho: number, n: number, colour: number): void {
  const axis = unit(sub(b, a));
  const helper: V3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = unit(cross(axis, helper));
  const v = cross(axis, u);
  const c = col(colour);
  const ring = (o: V3): V3[] => Array.from({ length: n }, (_, k): V3 => {
    const th = (2 * Math.PI * k) / n;
    return add(o, add(scale(u, rho * Math.cos(th)), scale(v, rho * Math.sin(th))));
  });
  const ra = ring(a);
  const rb = ring(b);
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    const na = unit(sub(ra[k] as V3, a));
    const nb = unit(sub(ra[k1] as V3, a));
    soup.quad([ra[k] as V3, ra[k1] as V3, rb[k1] as V3, rb[k] as V3], [na, nb, nb, na], c);
  }
  const back = scale(axis, -1);
  soup.fan(ra, back, c);
  soup.fan(rb, axis, c);
}

/**
 * The Voyager's frame, both sides, after voyager-bogie-01 (Geof Sheppard, CC BY-SA 4.0: CrossCountry 221134's front bogie side on). The frame stands
 * outboard of the wheels. Over each axle is an axle box with a round end cover on the axle's line. An arm runs out from the box past the wheel to a coil
 * spring at the bogie's end, under a flat top plate. Between the axles the side beam dips under the axle line. A long tube lies along the upper middle,
 * and a dark grilled box stands by one axle. ASSUMED sizes, scaled from the photograph's wheel spacing.
 */
function voyagerFrame(soup: Soup, r: number, wheelbase: number): void {
  const w = wheelbase / 2;
  for (const sx of [-1, 1] as const) {
    const xs = (a: number, b: number): [number, number] => (sx > 0 ? [a, b] : [-b, -a]);
    const [fx0, fx1] = xs(0.95, 1.05);
    for (const az of [-w, w]) {
      const out = Math.sign(az);
      const zo = (d: number): number => az + out * d;
      // the axle box over the journal, and its round end cover on the axle's line
      const [bx0, bx1] = xs(0.92, 1.07);
      soup.box(bx0, bx1, r - 0.14, r + 0.12, az - 0.19, az + 0.19, col(VB.box));
      cylinder(soup, [sx * 1.07, r, az], [sx * 1.11, r, az], 0.13, 14, VB.cover);
      // the arm out past the wheel to the spring, the spring, and the flat top plate over both
      soup.box(fx0, fx1, r - 0.02, r + 0.1, Math.min(az, zo(0.55)), Math.max(az, zo(0.55)), col(VB.frame));
      for (let k = 0; k < 5; k++) {
        const y0 = r + 0.1 + k * 0.04;
        cylinder(soup, [sx * 1.0, y0, zo(0.42)], [sx * 1.0, y0 + 0.04, zo(0.42)], k % 2 ? 0.105 : 0.125, 12, k % 2 ? VB.coil : VB.spring);
      }
      soup.box(fx0, fx1, r + 0.3, r + 0.38, Math.min(zo(-0.18), zo(0.6)), Math.max(zo(-0.18), zo(0.6)), col(VB.frame));
      // the beam from the top plate down into the dip, a convex piece in (z, y)
      const zin = az - out * 0.18;
      const zmid = out * 0.55;
      soup.prismX([[zin, r - 0.06], [zin, r + 0.3], [zmid, r + 0.12], [zmid, r - 0.18]] as [number, number][], sx * 0.95, sx * 1.05, col(VB.frame));
    }
    // the dip between the axles, under the axle line
    soup.prismX([[-0.55, r - 0.18], [0.55, r - 0.18], [0.55, r + 0.12], [-0.55, r + 0.12]], sx * 0.95, sx * 1.05, col(VB.frame));
    // the long tube along the upper middle, outside the beam, from the middle toward the +z axle
    cylinder(soup, [sx * 1.09, r + 0.2, -0.15], [sx * 1.09, r + 0.2, 0.85], 0.05, 10, VB.tube);
    // the dark grilled box by the +z axle
    const [gx0, gx1] = xs(1.0, 1.1);
    soup.box(gx0, gx1, r - 0.06, r + 0.28, w - 0.62, w - 0.3, col(VB.grille));
  }
  // the transom between the side beams
  soup.box(-0.95, 0.95, r + 0.04, r + 0.2, -0.1, 0.1, col(VB.box));
}

/**
 * A Voyager bogie (1A'A1'): the shared kit's outside-frame bogie for its wheel markers and its bare far level, with the near level's frame and springs
 * replaced by the Voyager's own (voyagerFrame), and a traction motor on the inner axle only. Its wheels, axles, discs and motor are the kit's.
 * (Round 2 drew an inside frame on a scorer's inference; the lead ruled for the photograph in round 4.)
 */
function voyagerBogie(radius: number, wheelbase: number, inner: 1 | -1): THREE.Group {
  const spec = { radius, wheelbase, track: TRACK, motor: true, style: 'alstom' as const };
  const group = buildBogie(spec);
  const key = `${radius}/${wheelbase}/${inner}`;
  let geometry = voyagerBogieGeometry.get(key);
  if (!geometry) {
    const soup = new Soup();
    for (const [name, part] of Object.entries(bogieParts(spec))) {
      if (name === 'frame' || name === 'springs') continue;
      for (let v = 0; v < part.pos.length / 3; v += 3) {
        if (name === 'drive' && Math.sign((part.pos[v * 3 + 2]! + part.pos[v * 3 + 5]! + part.pos[v * 3 + 8]!) / 3) !== inner) continue;
        for (let m = v; m < v + 3; m++) {
          soup.pos.push(part.pos[m * 3]!, part.pos[m * 3 + 1]!, part.pos[m * 3 + 2]!);
          soup.nrm.push(part.nrm[m * 3]!, part.nrm[m * 3 + 1]!, part.nrm[m * 3 + 2]!);
          soup.clr.push(part.clr[m * 3]!, part.clr[m * 3 + 1]!, part.clr[m * 3 + 2]!);
          soup.glow.push(0);
        }
      }
    }
    voyagerFrame(soup, radius, wheelbase);
    geometry = soup.build();
    voyagerBogieGeometry.set(key, geometry);
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.lod === 'near') o.geometry = geometry;
  });
  group.userData.driven = inner > 0 ? 'axle +z' : 'axle -z';
  return group;
}

/** Build an intercity kind. It never stands in for a service whose fleet is unknown: the Waverley layer picks it only on evidence. */
export function buildIntercityTrain(kind: IntercityKind): THREE.Group {
  const layout = intercityLayout(kind);
  const spec = INTERCITY_SPECS[kind];
  const root = new THREE.Group();
  root.name = `train-${kind}`;
  root.userData = { kind, family: spec.family, operator: spec.operator, label: spec.label, length: layout.length, cars: layout.cars.length, allocation: 'assumed fleet', lampState: { front: 'head', rear: 'tail' }, source: spec.source,
    assumptions: 'ASSUMED: noses, faces, lamp places, windscreen and window sizes, door and window places beyond the Voyager drawing, floor heights, wheels, wheelbases, HST bogie centres, underfloor masses, roof fittings, coach codes and their order; see core/train-intercity.ts and web/src/train-intercity.ts' };
  for (const car of layout.cars) root.add(buildCar(car, layout));
  return root;
}

/** How far the highest roof fitting of each body stands over its crown (the roof hatch, fan housing or vents drawn above). */
const ROOF_FITTING: Readonly<Record<IntercityBody, number>> = { voyager: 0.06, class43: 0.04, mk3: 0.05 };

/** What the rubric's capture tool plans its cameras from (web/src/edinburgh-fleet.ts CaptureFormation). */
export function intercityFormation(kind: IntercityKind): CaptureFormation {
  const layout = intercityLayout(kind);
  const spec = INTERCITY_SPECS[kind];
  const hst = spec.family === 'hst';
  const crown = hst ? H_CROWN : V_CROWN;
  const cover = Math.max(...layout.cars.map((c) => ROOF_FITTING[c.body]));
  const lengthFigures = hst ? ['HST.powerCarLength', 'HST.coachLength'] : ['VOYAGER.drivingCarLength', 'VOYAGER.intermediateCarLength'];
  return {
    family: spec.family,
    classes: spec.classes,
    classNote: hst ? 'Class 43 power cars at both ends; Mk3 coaches between' : spec.family === 'voyager221' ? 'five-car 221; four-car 221s also exist' : null,
    length: layout.length,
    half: (hst ? HST.bodyWidth.value : VOYAGER.bodyWidth.value) / 2,
    crown,
    coverHeight: cover,
    roofTop: crown + cover,
    doorWidth: hst ? HST.coachDoorWidth.value : VOYAGER.doorWidth.value,
    cars: layout.cars.map((c) => ({
      index: c.index, type: c.type, length: c.length, start: c.start, end: c.end, cab: c.cab, bogies: [...c.bogies], motor: [...c.motor], pantograph: null,
      // door centres from the front nose (a rear cab car's are counted from its own cab, so turned about)
      doors: bodyFor(layout, c).doors(c).filter((d) => !d.crew).map((d) => (c.cab === 'rear' ? c.end - d.s : c.start + d.s)).sort((p, q) => p - q),
    })),
    dimensions: {
      lengthM: { value: layout.length, basis: hst ? 'published' : 'published+drawn', figures: lengthFigures },
      widthM: hst ? { value: HST.bodyWidth.value, basis: 'published', figures: ['HST.bodyWidth'] } : { value: VOYAGER.bodyWidth.value, basis: 'published', figures: ['VOYAGER.bodyWidth'] },
      roofTopM: hst
        ? { value: crown + cover, basis: 'published+assumed', figures: ['HST.height'], figureM: HST.height.value }
        : { value: crown + cover, basis: 'drawn+assumed', figures: ['VOYAGER.height'], figureM: VOYAGER.height.value },
    },
  };
}

/** Release this builder's geometry, keeping the shared bogie geometry and the shared materials alive. */
export function disposeIntercityTrain(root: THREE.Group): void {
  const owned = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') owned.add(o.geometry);
  });
  for (const geometry of owned) geometry.dispose();
}
