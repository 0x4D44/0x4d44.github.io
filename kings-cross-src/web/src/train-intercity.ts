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
// and scotrail-hst-06 (Inter7City coach). No photograph shows a roof plan, a gangway or a bogie close; those parts are ASSUMED throughout.
import * as THREE from 'three';
import { HST, INTERCITY_END_GAP, INTERCITY_SPECS, intercityLayout, VOYAGER } from '../../core/train-intercity.ts';
import type { IntercityBody, IntercityCar, IntercityKind, IntercityLayout } from '../../core/train-intercity.ts';
import { clipConvex, col, ellipse, glassMaterial, gridNormals, lerp, plain, roundedRect, Soup, unit } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, rakeLean, rakeSet, ringAt, ringStations, xAtY } from './train-nose.ts';
import type { NoseSpec, Section } from './train-nose.ts';
import { bellowsRings, buildBogie, couplerHalf, podHanger, underfloorPod } from './train-parts.ts';
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
export const SR = { navy: 0x1d2944, navyBand: 0x1f2a42, grey: 0xc2c7ce, yellow: 0xf3c200, orange: 0xe0702c, roof: 0x45484d, louvre: 0x24272c, under: 0x2b2c2f } as const;
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
}
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
  /** windscreen on the nose's roof: from s0 to s1 (from the tip), a fraction of the ring's half-width, above `above` metres */
  screen: { s0: number; s1: number; fraction: number; fractionTop: number; above: number; frame: number };
  /** the face's colour bands, bottom up: [top of band, colour] */
  faceBands: [number, number][];
  face: FaceShapeDef[];
  noseCoupler: CouplerStyle | null;
  /** the colour of a quad of the loft: `s` from the cab tip (cab car) or from the car's front end, y above the rail, ax = |x|, rh the ring's half-width; GLASS for glass */
  paint(car: IntercityCar, s: number, y: number, ax: number, rh: number, row: number): number;
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

function voyagerPaint(car: IntercityCar, s: number, y: number, ax: number, rh: number, row: number): number {
  const top = y > V_WALL + 0.3;
  if (car.cab) {
    const b = VOYAGER_BODY.screen;
    // the windscreen and its black frame on the nose's roof
    if (s > b.s0 - b.frame && s < b.s1 + b.frame && y > b.above) {
      const f = lerp(b.fraction, b.fractionTop, (s - b.s0) / (b.s1 - b.s0)) * rh;
      if (ax < f && s > b.s0 && s < b.s1) return GLASS;
      if (ax < f + b.frame) return FRAME;
    }
    // the yellow front: over the face and up the cheek, its edge sloping back to the cantrail at about 3.1 m (xc220-03)
    // (the edge follows the loft's columns, `row` the height each column has on the body, so it runs smooth over the nose's curves)
    if (row > 0.95 && row < V_WALL + 0.25 && s < 0.45 + Math.max(0, row - 1.35) * 1.55) return XC.yellow;
    if (y > 0.95 && s < b.s1 + 0.25 && y >= V_WALL + 0.25 && ax > rh * 0.55) return XC.yellow;
    // a thin orange line along the cantrail from the yellow back (xc220-03)
    if (y > V_WALL + 0.05 && y < V_WALL + 0.14 && s < 6.6) return XC.pin;
    // the plum cab end, back to the first passenger door
    if (s < 6.45) return top ? XC.roof : XC.plum;
  }
  if (top) return XC.roof;
  if (y < 1.32) return XC.plumDark;
  return XC.silver;
}

const VOYAGER_BODY: BodyDef = {
  half: VOYAGER.bodyWidth.value / 2,
  floor: V_FLOOR,
  wallTop: V_WALL,
  crown: V_CROWN,
  rows: [1.32, 1.6, 1.84, 2.0, 2.2, 2.4, 2.55, 2.66, 2.8],
  nose: VOYAGER_NOSE,
  faceSetback: GAP,
  // ASSUMED: the screen wraps close to the cab's width (xc220-02 head on: about 0.85 of it at the foot)
  screen: { s0: 0.16, s1: 1.4, fraction: 0.86, fractionTop: 0.74, above: 2.15, frame: 0.07 },
  // the plum valance round the coupler, then the yellow face (xc220-02, xc220-03)
  faceBands: [[0.98, XC.plum], [9, XC.yellow]],
  face: [
    // the coupler's dark recess in the valance, and the smoked-glass lamp pods at the face's lower corners, a big headlight low in each and a smaller lamp above
    // and inboard (xc220-02, xc220-03, xc221-01: the pods are rounded, about 0.45 m across and 0.5 m tall). ASSUMED sizes.
    { name: 'coupler-recess', outline: roundedRect(-0.42, 0.42, 0.56, 0.96, 0.04, 2), lift: 0.003, colour: 0x111214 },
    { name: 'lamp-pod', outline: ellipse(0.98, 1.3, 0.25, 0.28, 18), lift: 0.004, colour: POD_GLASS, mirror: true },
    { name: 'headlight', outline: ellipse(1.0, 1.22, 0.1, 0.1, 16), lift: 0.008, lens: 'head', mirror: true },
    { name: 'tail-lamp', outline: ellipse(0.92, 1.45, 0.06, 0.06, 14), lift: 0.008, lens: 'tail', mirror: true },
    { name: 'marker', outline: ellipse(1.08, 1.43, 0.045, 0.045, 12), lift: 0.008, lens: 'marker', mirror: true },
    // a pale grab rail under the screen (xc220-03)
    { name: 'grab-rail', outline: roundedRect(-0.42, 0.42, 2.02, 2.06, 0.015, 2), lift: 0.004, colour: 0xa9adb3 },
  ],
  noseCoupler: 'dellner',
  paint: voyagerPaint,
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
  bogie: { style: 'electrostar', radius: VOYAGER.wheelDiameter.value / 2, wheelbase: VOYAGER.wheelbase.value },
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
    // ASSUMED (no roof photograph close enough): the engine's exhaust and cooler hatch near the inner end of each car, dark and low
    const s = car.cab ? car.length - 5.5 : car.length / 2 + 4;
    add(-0.6, 0.6, V_CROWN - 0.05, V_CROWN + 0.06, s, s + 2.2, 0x26222a);
  },
};

/** The 221 shares the 220's body (the photographs show the same nose, doors and windows); its bogies differ (Bombardier: "internally supported"). */
const VOYAGER221_BODY: BodyDef = { ...VOYAGER_BODY, bogie: { ...VOYAGER_BODY.bogie, style: 'siemens' } };

// --- the HST: Class 43 power car ------------------------------------------------------------------------------------------------

const H_FLOOR = HST.floorHeight.value;
const H_CROWN = HST.height.value - 0.02;
const H_WALL = 3.0;

/**
 * The Class 43's nose, read off scotrail-hst-03 (side 3/4) and scotrail-hst-04 against the published 3.90 m: a low, blunt lower front about 1.25 m tall leaning back,
 * the lamps and the grille along its top at about 1.55 m; the long bonnet rising from 1.75 m to the windscreen's foot (2.85 m, 2.1 m back), the glass raked to 3.45 m
 * at 2.95 m, and the cab roof easing into the crown by 4.2 m. ASSUMED to about 0.1 m.
 */
const CLASS43_NOSE: NoseSpec = {
  length: 4.2,
  knots: [
    { s: 0, top: 1.78, ws: 0.88, bottom: 0.52 },
    { s: 0.3, top: 1.98, ws: 0.93, bottom: 0.52 },
    { s: 0.9, top: 2.32, ws: 0.97, bottom: 0.56 },
    { s: 1.6, top: 2.64, ws: 0.99, bottom: 0.66 },
    { s: 2.1, top: 2.86, ws: 1, bottom: 0.76 },
    { s: 2.95, top: 3.45, ws: 1, bottom: 0.92 },
    { s: 3.55, top: 3.74, ws: 1, bottom: H_FLOOR - 0.02 },
    { s: 4.2, top: H_CROWN, ws: 1, bottom: H_FLOOR },
  ],
  fillet: 0.32,
  filletLoss: 0.2,
  filletSteps: 9,
  roundLen: 3.8,
  widest: 0.42,
  boxiness: 3.2,
  rake: { lean: 0.42, from: 0.52, reach: 1.25 },
};

/** The power car's skyline: the edge between the navy front half and the grey rear, a stepped run of Edinburgh roofs (scotrail-hst-03, -04). ASSUMED steps. */
export function hstSkyline(s: number): number {
  if (s < 8.6) return 9;
  if (s > 13.2) return 0;
  const fall = 3.05 - (s - 8.6) * 0.38;
  const step = Math.floor(s / 0.45) % 3 === 0 ? 0.32 : Math.floor(s / 0.45) % 3 === 1 ? 0.1 : 0;
  return fall + step;
}

function class43Paint(car: IntercityCar, s: number, y: number, ax: number, rh: number, row: number): number {
  const b = CLASS43_BODY.screen;
  if (s > b.s0 - b.frame && s < b.s1 + b.frame && y > b.above) {
    const f = lerp(b.fraction, b.fractionTop, (s - b.s0) / (b.s1 - b.s0)) * rh;
    if (ax < f && s > b.s0 && s < b.s1) return GLASS;
    if (ax < f + b.frame) return FRAME;
  }
  const roof = y > H_WALL + 0.32;
  // the yellow front: above the lamps over the bonnet and round the screen, back along the cab side to the cab door, its lower edge rising (scotrail-hst-03)
  // (the edge follows the loft's columns: `row` is the height each column has on the body)
  if (s < 3.55 && row >= 1.85 && !(roof && s > b.s1 + 0.08)) return SR.yellow;
  if (roof) return SR.roof;
  // the black louvres along the top of the engine room's sides (scotrail-hst-03)
  if (s > 4.55 && s < 13.3 && y > H_WALL - 0.02 && y < H_WALL + 0.3) return SR.louvre;
  if (y < hstSkyline(s) && s < 13.3) return SR.navy;
  return SR.grey;
}

const CLASS43_BODY: BodyDef = {
  half: HST.bodyWidth.value / 2,
  floor: H_FLOOR,
  wallTop: H_WALL,
  crown: H_CROWN,
  rows: [1.35, 1.6, 1.85, 2.1, 2.35, 2.6, 2.85],
  nose: CLASS43_NOSE,
  faceSetback: 0.02,
  screen: { s0: 2.12, s1: 2.93, fraction: 0.66, fractionTop: 0.6, above: 2.6, frame: 0.06 },
  // the lower front is navy, with the lamps and grille in it; the yellow starts just over them (scotrail-hst-04)
  faceBands: [[1.72, SR.navy], [9, SR.yellow]],
  face: [
    // ASSUMED, from scotrail-hst-04 head on: the dark air grille between the lamps, and each side a dark housing with two round lenses, the headlight outboard
    { name: 'grille', outline: roundedRect(-0.25, 0.25, 1.46, 1.64, 0.02, 2), lift: 0.003, colour: 0x121316 },
    { name: 'lamp-housing', outline: roundedRect(0.31, 0.76, 1.45, 1.67, 0.09, 3), lift: 0.003, colour: 0x15171b, mirror: true },
    { name: 'headlight', outline: ellipse(0.645, 1.56, 0.08, 0.08, 16), lift: 0.007, lens: 'head', mirror: true },
    { name: 'tail-lamp', outline: ellipse(0.42, 1.56, 0.07, 0.07, 14), lift: 0.007, lens: 'tail', mirror: true },
    { name: 'marker', outline: ellipse(0.53, 1.56, 0.035, 0.035, 10), lift: 0.007, lens: 'marker', mirror: true },
  ],
  noseCoupler: null,
  paint: class43Paint,
  // the cab side window behind the screen's corner (scotrail-hst-03): ASSUMED 0.67 m by 0.58 m
  cabWindow: { kind: 'box', s0: 2.78, s1: 3.42, y0: 2.4, y1: 2.98 },
  // the cab door just behind the yellow, navy with a tall window (scotrail-hst-03); no passenger doors
  doors: () => [{ s: 3.95, width: 0.68, crew: true, colour: SR.navy }],
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
    // ASSUMED: the cooler group's roof fan housing over the rear (radiator) end
    add(-0.9, 0.9, H_CROWN - 0.06, H_CROWN + 0.04, car.length - 4.3, car.length - 2.1, 0x2b2d31);
  },
  sideFittings: (car) => [
    // the radiator grille on the grey rear of the side (scotrail-hst-03), ribbed
    { s0: car.length - 4.15, s1: car.length - 2.55, y0: 1.42, y1: 2.92, colour: 0x3a3d43, ribs: 16 },
  ],
};

// --- the HST: Mk3 coach ---------------------------------------------------------------------------------------------------------

/** Inter7City coach (scotrail-hst-06): navy foot to about 1.45 m with a skyline rising from it mid-car, grey sides, a navy window band, an orange line at the cantrail. ASSUMED heights. */
const MK3_BAND: [number, number] = [1.76, 2.84];
const MK3_DOOR_FROM_END = 0.95;

function mk3Paint(car: IntercityCar, s: number, y: number): number {
  if (y > H_WALL + 0.32) return SR.roof;
  if (y > H_WALL + 0.12 && y < H_WALL + 0.22) return SR.orange;
  if (y >= MK3_BAND[0] && y <= MK3_BAND[1]) return SR.navyBand;
  const L = car.length;
  // the skyline of Edinburgh landmarks along the middle of the side, a navy silhouette rising from the foot (scotrail-hst-06): ASSUMED steps
  const t = (s - 0.3 * L) / (0.45 * L);
  const sky = t > 0 && t < 1 ? 1.45 + 0.28 * Math.sin(Math.PI * t) + (Math.floor(s / 0.5) % 4 === 1 ? 0.22 : 0) : 1.45;
  if (y < sky) return SR.navy;
  return SR.grey;
}

const MK3_BODY: BodyDef = {
  ...CLASS43_BODY,
  rows: [1.45, 1.62, MK3_BAND[0], 2.0, 2.3, 2.6, MK3_BAND[1]],
  paint: (car, s, y) => mk3Paint(car, s, y),
  doors: (car) => [MK3_DOOR_FROM_END, car.length - MK3_DOOR_FROM_END].map((s) => ({ s, width: HST.coachDoorWidth.value, colour: SR.grey })),
  // ASSUMED: eight windows of 1.45 m a side between the vestibules (scotrail-hst-06 shows long windows; the first-class coach's narrower ones are not drawn apart)
  windows: (car) => windowsBetween(MK3_DOOR_FROM_END + 1.15, car.length - MK3_DOOR_FROM_END - 1.15, 1.45, 2.32),
  windowY: [1.84, 2.74],
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
const bodyFor = (layout: IntercityLayout, car: IntercityCar): BodyDef => (layout.spec.family === 'voyager221' ? VOYAGER221_BODY : INTERCITY_BODIES[car.body]);

// --- one car ---------------------------------------------------------------------------------------------------------------------

interface LampLens { role: LensRole; v0: number; v1: number }

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
  const K = sec.half.length;
  const kOf = (m: number): number => (m < K ? m : M - 1 - m);
  for (let i = 0; i + 1 < rings.length; i++) {
    const r0 = rings[i] as { s: number; rh: number };
    const r1 = rings[i + 1] as { s: number; rh: number };
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const idx: [number, number][] = [[i, j], [i, j1], [i + 1, j1], [i + 1, j]];
      const ps = idx.map(([a, c]) => (P[a] as V3[])[c] as V3) as [V3, V3, V3, V3];
      const ns = idx.map(([a, c]) => wn((N[a] as V3[])[c] as V3)) as [V3, V3, V3, V3];
      const sMid = (r0.s + r1.s) / 2 - (car.cab ? tip : 0);
      const yMid = ps.reduce((a, p) => a + p[1], 0) / 4;
      const axMid = ps.reduce((a, p) => a + Math.abs(p[0]), 0) / 4;
      const kmin = Math.min(kOf(j), kOf(j1));
      const colour = b.paint(car, sMid, yMid, axMid, (r0.rh + r1.rh) / 2, (sec.half[kmin] as [number, number])[1]);
      if (colour === GLASS) glass.quad(ps.map(world) as [V3, V3, V3, V3], ns, null);
      else shell.quad(ps.map(world) as [V3, V3, V3, V3], ns, col(colour));
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
    let below = -Infinity;
    for (const [topY, colour] of b.faceBands) {
      const band = clipConvex(outline, [[-9, below === -Infinity ? -9 : below], [9, below === -Infinity ? -9 : below], [9, topY], [-9, topY]]);
      if (band.length >= 3) detail.fan(onFace(band, 0), faceN, col(colour));
      below = topY;
    }
    for (const shape of b.face) {
      for (const mirrored of shape.mirror ? [false, true] : [false]) {
        const poly = clipConvex(shape.outline.map(([x, y]): [number, number] => [mirrored ? -x : x, y]), outline, 0.01);
        if (poly.length < 3) continue;
        if (shape.lens) {
          const look = lensLook(shape.lens, lampMode);
          const v0 = detail.glow.length;
          detail.emit = look.glow;
          detail.fan(onFace(poly, shape.lift), faceN, col(look.hex));
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
        } else detail.fan(onFace(poly, shape.lift), faceN, col(shape.colour ?? 0));
      }
    }
    if (b.noseCoupler) {
      const y = 0.8;
      const wall = tip + setBack(tip, y);
      couplerHalf(detail, Z(wall), (-dir) as 1 | -1, wall, y, b.noseCoupler);
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
    couplerHalf(detail, zWall, (Math.sign(zOut - zWall) || 1) as 1 | -1, GAP, 0.85);
    const cm = new THREE.Object3D();
    cm.name = 'coupler';
    cm.position.set(0, 0.85, (zWall + zOut) / 2);
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
  // roof fittings
  b.roof?.(car, (x0, x1, y0, y1, s0, s1, colour) => {
    const za = Z(s0);
    const zb = Z(s1);
    detail.box(x0, x1, y0, y1, Math.min(za, zb), Math.max(za, zb), col(colour), '-y');
  });

  // bogies: every powered bogie carries its traction motor (both Voyager and Class 43 are diesel-electric); the Mk3's are trailers
  car.bogies.forEach((z, k) => {
    const bogie = buildBogie({ radius: b.bogie.radius, wheelbase: b.bogie.wheelbase, track: TRACK, motor: car.motor[k] as boolean, style: b.bogie.style });
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
