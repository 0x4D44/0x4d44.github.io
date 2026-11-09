// The trains as three.js models: the Hitachi AT300 family (LNER Azuma 800/801, Hull Trains 802, Lumo 803),
// the Great Northern commuter units (Class 387 Electrostar, Class 717 Desiro City), the Thameslink Class 700
// (a Desiro City) and Grand Central's Class 180 Adelante diesel unit, built only from the figures in
// core/train.ts and the assumptions named below. Procedural: no image assets.
//
// Local frame of a train: x across, y up with y = 0 at the rail head, the FRONT nose at z = 0 and
// the train running to z = +length. Forward travel is -z, which is north in the world (see
// core/geo.ts), so the group is turned by (PI - heading) to stand along the shed's tracks.
//
// Structure (the test relies on these names):
//   car-<i>           one per car
//     body-shell      the sides and lower shoulders, textured with the livery (the cab-end texture)
//     body-detail     roof, covers, nose, gangway bellows, skirts, doors, windows (vertex colours)
//     livery-decals   lettering and solid patches, one atlas, laid per side so the words read the right way
//     cab-glass       a cab car's windscreen and cab side windows: dark, tinted, reflective
//     door            a marker per door leaf (4 per car: 2 per side)
//     headlight       a marker per front lamp cluster (cab cars)
//     coupler-cover   a marker for the cover over the nose coupler (the train's two ends, where the family has a cover)
//     nose-coupler    a marker for the coupler standing out of the nose at a train end (the families with no cover: Classes 700, 717)
//     coupler         a marker for each coupler at an inner end (hidden nose couplers are not drawn)
//     gangway         a marker for each gangway bellows (inner ends of a through car)
//     bogie-<i>-<k>   a group at z = car.bogies[k]: one shared merged mesh and four `wheel` markers
//     pantograph      a group over the pantograph base
//
// Each body stops END_GAP short of its car's end, so two bodies stand 0.7 m apart; the gangway bellows
// and the couplers fill the gap and reach to the car boundary, so every car group still spans exactly its
// own [start, end].
import * as THREE from 'three';
import { standingTrainPose } from '../../core/station.ts';
import type { ShedLayout } from '../../core/station.ts';
import { EMU_FIGURES, FIGURES, trainLayout } from '../../core/train.ts';
import type { Car, EmuFamily, Family, TrainKind, TrainLayout } from '../../core/train.ts';
import { atlasRect, BAND_Y, decalMaterial, TEX_Y0, TEX_Y1, texU, textEms, WINDOW_Y } from './livery.ts';
import type { DecalItem } from './livery.ts';
import { HULL_BEAK, liveryFor, LNER_YELLOW, shellMaterialFor } from './train-livery.ts';
import type { TrainLivery } from './train-livery.ts';
import { col, ellipse, glassMaterial, gridNormals, lerp, plain, roundedRect, Soup, unit } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, ringAt, ringStations, xAtY, yAtX } from './train-nose.ts';
import type { NoseSpec, Section } from './train-nose.ts';
import { bellowsRings, buildBogie, buildPantograph, couplerHalf, WHEEL_WIDTH } from './train-parts.ts';
import type { BogieStyle, CouplerStyle } from './train-parts.ts';

/**
 * Everything the published figures do not give. Each is a guess chosen so the model reads as the train it is,
 * to be replaced when a drawing turns up. They are kept here, apart from FIGURES, so the difference stays
 * visible. (The commuter EMUs' own guesses are in EMU_FIGURES in core/train.ts, marked 'assumed', and in
 * the specs below.)
 */
export const ASSUMED = {
  /** Underside of the body (floor level). Nobody publishes it; chosen so the roof edge sits about 2.7 m above it. */
  floorHeight: 1.0,
  /** Bottom edge of the side skirts. Assumed: low enough to hide the underframe, high enough to clear a platform edge and show the wheels' lower half in the bogie cut-outs. */
  skirtBottom: 0.45,
  /** Length of the raked nose, tip to where the body goes full width. Not published; the cab bogie (4.455 m from the nose) sits under it. */
  noseLength: 5.4,
  /** Door leaf width. Assumed. */
  doorWidth: 0.95,
  /** Distance from the inner car end to the centre of the end door, and from the nose end of a driving car. Assumed. */
  doorFromEnd: 3.0,
  doorFromNose: 2.6,
  /**
   * The AT300's crew (driver's access) door, a narrow door just behind the nose on a driving car's side: its centre this far behind the nose's end, and
   * its width. Read off photographs, not published: lner-800-doncaster-2026 (a narrow door with a thin window between the cab window and the passenger
   * door), hull-802-paragon-2025 and LUMO-04-Lumo-803003-at-Edinburgh-Waverley (the same). The positions are estimates from oblique views.
   */
  crewDoorFromNose: 0.65,
  crewDoorWidth: 0.7,
  /** Half-length of the skirt cut-out round each bogie. Assumed. */
  bogieCutout: 1.95,
  /** Wheel tread width. Assumed. */
  wheelWidth: WHEEL_WIDTH,
  /** Each body ends this far inside its car's end, so two bodies stand twice this far apart (the lead's COUPLING_CLEARANCE, 0.35 m). Assumed. */
  endGap: 0.35,
  /** Height of the centre of an inner coupler above the rail head. Assumed. */
  couplerHeight: 0.85,
  /** Size of the gangway bellows opening (the frame the bellows hang from): width, height, and the height of its underside. Assumed: a rounded rectangle a little narrower than the body, as on every British EMU. */
  gangwayWidth: 2.3,
  gangwayHeight: 2.0,
  gangwayBottom: 1.15,
} as const;

/** Half the gap between two bodies, metres. */
export const END_GAP = ASSUMED.endGap;

/**
 * The maker's bogie each family runs on, each drawn in train-parts.ts from its own photographs: the Hitachi AT300's (lner-gwr800-bogie-detail-2017),
 * the Electrostar's (no usable photograph: a generic outside-frame bogie), the Desiro City's, which the 700 shares (tl700_03_gatwick_bogie_28898326470:
 * an inside frame) and the Class 180's Alstom (GC180-01-180-101-Kings-Cross).
 */
export const BOGIE_STYLE: Readonly<Record<Family, BogieStyle>> = { at300: 'hitachi', electrostar: 'electrostar', desiro: 'siemens', desiro700: 'siemens', adelante: 'alstom' };

/** How far the doors stand proud of the shell, so they, not the shell, set the body width. */
const DOOR_RELIEF = 0.02;
/** The gangway bellows start this far outside the end wall. */
const BELLOWS_SEAT = 0.002;
/** The nose face stands this far behind the train's end, so the details laid on it stay inside the car's length. */
export const NOSE_RECESS = 0.01;
/** The colour of the nose: the front panel wraps this far back from the tip, and the crescent below the windscreen ends this far back. Both snap to the next ring. */
const FRONT_ZONE = 0.5;
const CRESCENT_ZONE = 1.25;
/** The windscreen's frame reaches no further across than this fraction of the nose's half-width at its own place (see screenHalfWidth). */
const FRAME_REACH = 0.91;
/** The near-black of a lamp's bezel and of a front door's outline. */
const BEZEL = 0x15171a;
/** The dark swoosh round the cab side window of the Hull Trains and Lumo cabs: near black, a shade off the glass's own so the pane still reads in it. */
export const CAB_SWOOSH = 0x101215;
/** The parked wiper arms' colour: a dark grey, a shade off the glass's black so they still read against it. */
const WIPER = 0x3b4048;
/**
 * The lenses of a cab's lamps, lit and dark. A train in service shows white headlights at its leading end and red tail lamps at its trailing end,
 * and the other lenses unlit (an unlit headlamp is a pale reflector, an unlit tail lens a dark red); the cab ends of two coupled units show none
 * of the four. Car 0 is the leading car and the last car the trailing one (trains-live.ts walks the cars back from the leading end), so the
 * model needs no state switch: each end is built in the state it has in service. Shades approximate.
 */
export const LENS = { headOn: 0xfff3c4, headOff: 0x70767e, tailOn: 0xd02020, tailOff: 0x4a1317 } as const;
/** The yellow of a warning panel: the shade is approximate (the LNER livery's nose front is about the same). */
const YELLOW = 0xf2c100;
/** The 387's gangway door leaf: a duller, orange-leaning yellow than the panels beside it (gn387_02_387121_ely, gn387_03_387123_cambridge). Approximate. */
const DOOR_YELLOW = 0xe3a50f;
/** Columns of the car section (counted from the bottom, 0..12) that carry the livery texture: the wall and the lower shoulder. Above them, and below, vertex colours. */
const SHELL_K0 = 1;
const SHELL_K1 = 7;

/** What a car needs to tell the painter and the decals about itself, all in metres from its cab end (cab cars) or from its start. */
export interface CarPlan {
  length: number;
  /** length of the raked nose, 0 for a car with no cab */
  nose: number;
  doors: number[];
  /** [from, to] of each passenger window */
  windows: [number, number][];
  /** narrow crew doors (the AT300's driver's access door), each a centre and a width in the same measure as `doors`; none where absent */
  crewDoors?: { s: number; width: number }[];
}

// --- one family's body -----------------------------------------------------------------------------

/** The cab glass: a windscreen patch on the nose's roof, and a cab side window on each side. All in distances from the nose tip. */
interface GlassSpec {
  /**
   * windscreen: from `s0` (the bonnet end) to `s1` (the roof end), half-width as a fraction of the ring's, corner radii at the top and bottom edges;
   * `pillar` (metres, 0 or absent: none) is a centre post that divides the glass into two panes, as the Class 180's has
   */
  screen: { s0: number; s1: number; fraction: number; topRadius: number; bottomRadius: number; pillar?: number };
  /** cab side window: the back edge `sBack`, the front edge slanting from `sFront0` at the bottom to `sFront1` at the top, between the heights `v0` and `v1` (fractions of the ring's height) */
  side: { sBack: number; sFront0: number; sFront1: number; v0: number; v1: number; surround?: { sBack: number; sFront0: number; sFront1: number; v0: number; v1: number } };
}

/**
 * A cab front's lamp cluster, one each side of the face. ASSUMED in every family: no drawing or readable photograph of any of
 * these fronts was found, so the shapes follow only what the types are generally said to have (an LED headlight over a tail
 * lamp in the lower corners), and are meant to be replaced.
 */
interface LampSpec {
  /** the lenses are rounded rectangles ('rect') or circles ('round') */
  shape: 'rect' | 'round';
  /** the cluster's centre: a fraction of the face's height above its underside, and of the face's half-width at that height */
  y: number;
  x: number;
  /** the headlight's width and height, metres */
  head: [number, number];
  /** the tail lamp's width and height, and where its centre is relative to the headlight's: outboard, up (metres) */
  tail: [number, number];
  tailAt: [number, number];
  /** the dark bezel round the two, metres of margin (0: none), and its colour (default BEZEL: near black; a lamp pod on a black front needs a lighter smoked grey to show) */
  bezel: number;
  bezelColour?: number;
}

/** How a cab front is finished. See LampSpec: all of it ASSUMED unless a comment on a family says otherwise. */
interface FrontSpec {
  lamps: LampSpec;
  /** the black frame round the windscreen glass: its width beyond the glass, all round */
  frame: number;
  /** parked wiper arms along the foot of the windscreen, and the lit destination display at its top edge */
  wipers: boolean;
  display: boolean;
  /** a front (evacuation) door outlined on the upper face, between the lamps: its width and the most height it may take (null: none) */
  door: { width: number; height: number } | null;
  /** the colour of the yellow warning panel on the front (the upper face and the first half metre of the nose behind it); null: the livery's own front */
  warning: number | null;
  /**
   * How far the panel runs back over the nose from the face, metres (default FRONT_ZONE; it ends at the next ring), and how wide it is, as a
   * fraction of the face's half-width at the top of the cover (default 1: the whole face; less leaves the livery's own colour to each side of it,
   * as on a Class 700, whose panel is a patch under the glass with white cheeks).
   */
  warningWrap?: number;
  warningWidth?: number;
  /** the nose coupler's style, and whether a cover hides it at a train end (else the coupler stands out of the face, and the face stands END_GAP back) */
  coupler: { style: CouplerStyle; covered: boolean };
  /**
   * A full-height door between the two windscreens (the Class 387's gangway door): its leaf runs from above the cover up the face and along the
   * nose to the glass's top edge, in the gap the screen's `pillar` leaves; `leaf` is its colour and `width` the leaf's, a little less than the
   * pillar's (the screen's black frame is the door's outline).
   */
  centreDoor?: { width: number; leaf: number };
  /** the colour of the dark swoosh round the cab side window, where the livery has one (the glass spec's `side.surround` is its shape); absent: none */
  cabSideSurround?: number;
}

/** One piece of a diesel unit's underframe: its length along the car, half-width, and the height of its underside above the rail head. */
interface UnderfloorItem {
  name: string;
  length: number;
  half: number;
  bottom: number;
  colour: number;
}

interface UnderfloorSpec {
  /** engine, transmission, cooler and tank, in order from the car's start; spaced evenly between the bogies */
  items: readonly UnderfloorItem[];
  /** the clear stretch kept beyond each bogie's wheels, metres */
  clearance: number;
}

interface BodySpec {
  family: Family;
  /** half the body width: the door panes are the widest points */
  half: number;
  floor: number;
  /** top of the vertical side wall */
  wallTop: number;
  /** the roof's centre line */
  crown: number;
  /** the roof fairings stand this far above the crown (0: none) */
  coverHeight: number;
  coverBw: number;
  coverTw: number;
  skirtBottom: number;
  cutout: number;
  doorWidth: number;
  doorY: [number, number];
  doorLeaves: 1 | 2;
  windowY: [number, number];
  nose: NoseSpec;
  glass: GlassSpec;
  /** the two seams of the gangway bellows */
  gangway: { width: number; height: number; bottom: number };
  /** distance from the rail head of the folded pantograph's top */
  pantographTop: number;
  /** half-width of the underframe slab */
  underframe: number;
  /** the cab front's lamps, frame, coupler and warning panel */
  front: FrontSpec;
  /** a diesel unit's engine, transmission, cooler and tank hanging under the floor (null: an electric unit's underframe is hidden behind its skirts) */
  underfloor: UnderfloorSpec | null;
  plan(car: Car, interior: boolean): CarPlan;
}

const BW = FIGURES.bodyWidth.value;
const ROOF_EDGE = FIGURES.roofEdgeHeight.value;
const FLOOR = ASSUMED.floorHeight;
/**
 * The roof and nose profiles below were drawn against a roof edge of 3.725 m, the first reading,
 * which put the top of the covers at nearly 4 m. They are scaled into the roof edge now in use
 * (FIGURES.roofEdgeHeight), so the shape holds while the height follows the figure.
 */
const DRAWN_ROOF_EDGE = 3.725;
/** Top of the vertical side wall: the doors, windows and livery bands all sit below it and are not scaled. */
const WALL_TOP = 2.9;
/** A height above the floor, scaled with the roof edge (the nose rings). */
const noseY = (drawn: number): number => FLOOR + (drawn - FLOOR) * ((ROOF_EDGE - FLOOR) / (DRAWN_ROOF_EDGE - FLOOR));

/** Split the cars' intervals: remove [a, b] from each of them. */
function without(spans: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [s, e] of spans) {
    if (b <= s || a >= e) out.push([s, e]);
    else {
      if (a > s) out.push([s, a]);
      if (b < e) out.push([b, e]);
    }
  }
  return out;
}

/** `n` windows evenly spaced in [from, to], pier `pier` between neighbours. */
function windowsIn(from: number, to: number, pitch: number, pier: number, atLeast = 0): [number, number][] {
  const n = Math.max(atLeast, Math.round((to - from) / pitch));
  if (n === 0 || to - from < 0.8) return [];
  const p = (to - from) / n;
  return Array.from({ length: n }, (_, k): [number, number] => [from + k * p + pier / 2, from + (k + 1) * p - pier / 2]);
}

const AT300: BodySpec = {
  family: 'at300',
  half: BW / 2,
  floor: FLOOR,
  wallTop: WALL_TOP,
  crown: ROOF_EDGE,
  coverHeight: FIGURES.roofCoverHeight.value,
  coverBw: 0.85,
  coverTw: 0.62,
  skirtBottom: ASSUMED.skirtBottom,
  cutout: ASSUMED.bogieCutout,
  doorWidth: ASSUMED.doorWidth,
  doorY: [1.15, 2.86],
  doorLeaves: 1,
  windowY: WINDOW_Y,
  // the raked nose: a long low bonnet, a windscreen rising at about 30 degrees, then the roof
  nose: {
    length: ASSUMED.noseLength,
    knots: [
      { s: 0, top: noseY(1.9), ws: 0.5, bottom: 0.8 },
      { s: 0.5, top: noseY(1.95), ws: 0.56, bottom: 0.8 },
      { s: 1.0, top: noseY(2.15), ws: 0.64, bottom: 0.82 },
      { s: 1.6, top: noseY(2.62), ws: 0.74, bottom: 0.85 },
      { s: 2.2, top: noseY(3.1), ws: 0.83, bottom: 0.88 },
      { s: 2.8, top: noseY(3.42), ws: 0.9, bottom: 0.9 },
      { s: 3.5, top: noseY(3.55), ws: 0.95, bottom: 0.93 },
      { s: 4.4, top: noseY(3.65), ws: 0.98, bottom: 0.95 },
      { s: ASSUMED.noseLength, top: ROOF_EDGE, ws: 1, bottom: FLOOR },
    ],
    fillet: 0.32,
    filletLoss: 0.26,
    roundLen: 4.3,
    widest: 0.42,
    boxiness: 2.6,
  },
  glass: {
    screen: { s0: 1.2, s1: 3.35, fraction: 0.8, topRadius: 0.32, bottomRadius: 0.12 },
    // A wedge, low at the front and tall at the back, against the nose's end: a short dark window whose raked top edge climbs from a point low on the
    // cheek to the cab door's side (photographs lner-800-doncaster-2026, hull-802-paragon-2025, hull-802-doncaster-2024, LUMO-04-Lumo-803003-at-Edinburgh-Waverley:
    // a teardrop pane behind the windscreen's pillar, its rear edge upright beside the crew door). Hull Trains and Lumo have a dark swoosh round it
    // (`surround`, drawn where the kind's front gives a `cabSideSurround` colour). The numbers are read off those photographs, not published.
    side: { sBack: 5.3, sFront0: 3.0, sFront1: 4.5, v0: 0.52, v1: 0.8, surround: { sBack: 5.38, sFront0: 2.3, sFront1: 4.15, v0: 0.45, v1: 0.87 } },
  },
  gangway: { width: ASSUMED.gangwayWidth, height: ASSUMED.gangwayHeight, bottom: ASSUMED.gangwayBottom },
  pantographTop: FIGURES.pantographFoldedHeight.value,
  underframe: 0.95,
  // the Azuma's front is as S3 drew it: plain lamps on the face, a cover over the coupler, a livery-coloured front (LNER's is yellow in the livery)
  front: {
    // headlamp pods in the upper outer corners of the face, under the windscreen's corners (lner-800-113-newcastle-2025, hull-802-doncaster-2024): a dark housing with the lamp, the tail lamp beneath it
    lamps: { shape: 'rect', y: 0.6, x: 0.6, head: [0.26, 0.12], tail: [0.12, 0.06], tailAt: [0, -0.15], bezel: 0.04 },
    frame: 0.07,
    wipers: false,
    display: false,
    door: null,
    warning: null,
    coupler: { style: 'plain', covered: true },
  },
  underfloor: null,
  plan: (car) => at300Plan(car),
};

/** Doors at 3 m from the inner end and 2.6 m behind the nose of a driving car, and a crew door just behind its nose; windows (six on a driving car, nine on a through car) between the passenger doors. */
export function at300Plan(car: Car): CarPlan {
  const L = car.length;
  const nose = car.cab ? ASSUMED.noseLength : 0;
  const doors = [car.cab ? nose + ASSUMED.doorFromNose : ASSUMED.doorFromEnd, L - ASSUMED.doorFromEnd];
  const from = (doors[0] as number) + ASSUMED.doorWidth / 2 + 0.5;
  const to = (doors[1] as number) - ASSUMED.doorWidth / 2 - 0.5;
  const n = Math.max(1, Math.round((to - from) / 2.0));
  const pitch = (to - from) / n;
  const windows: [number, number][] = [];
  for (let k = 0; k < n; k++) windows.push([from + k * pitch + 0.2, from + (k + 1) * pitch - 0.2]);
  // a driving car has the narrow crew door just behind its nose, as well as its two passenger doors
  const crewDoors = car.cab ? [{ s: nose + ASSUMED.crewDoorFromNose, width: ASSUMED.crewDoorWidth }] : [];
  return { length: L, nose, doors, windows, crewDoors };
}

/** A commuter EMU's two doors a side at `doorFromEnd` from each car end (from the nose tip on a cab car); windows between and beyond them. */
function emuPlan(f: EmuFamily, noseLength: number): (car: Car) => CarPlan {
  const fig = EMU_FIGURES[f];
  return (car) => {
    const L = car.length;
    const dw = fig.doorWidth.value;
    const d = fig.doorFromEnd.value;
    const doors = [d, L - d];
    const windows: [number, number][] = [];
    // beyond the inner door, between the doors, and (through cars only) beyond the other door; a cab car's nose end is the cab
    const innerZone: [number, number] = [(doors[1] as number) + dw / 2 + 0.35, L - END_GAP - 0.45];
    windows.push(...windowsIn((doors[0] as number) + dw / 2 + 0.35, (doors[1] as number) - dw / 2 - 0.35, 2.0, 0.4, 1));
    windows.push(...windowsIn(innerZone[0], innerZone[1], 2.0, 0.4));
    if (!car.cab) windows.unshift(...windowsIn(END_GAP + 0.45, (doors[0] as number) - dw / 2 - 0.35, 2.0, 0.4));
    return { length: L, nose: car.cab ? noseLength : 0, doors, windows };
  };
}

const ELECTROSTAR_BODY = ((): BodySpec => {
  const fig = EMU_FIGURES.electrostar;
  const floor = fig.floorHeight.value - 0.12;
  const cover = 0.14;
  const crown = fig.height.value - cover;
  const length = 1.9;
  return {
    family: 'electrostar',
    half: fig.bodyWidth.value / 2,
    floor,
    wallTop: 3.02,
    crown,
    coverHeight: cover,
    coverBw: 0.95,
    coverTw: 0.75,
    skirtBottom: 0.55,
    cutout: 1.9,
    doorWidth: fig.doorWidth.value,
    doorY: [fig.floorHeight.value + 0.02, 2.95],
    doorLeaves: 2,
    windowY: [1.62, 2.72],
    nose: {
      length,
      knots: [
        // a steeply raked windscreen over a near-vertical front: the lower edge of the glass is about 2 m up, the roof reached 1.4 m back (ASSUMED: from photographs, not drawn).
        // The face is nearly as broad as the body, as the Desiro's is (Wikimedia Commons: "Class 387 at Luton": a wide front with the lamps at its corners)
        { s: 0, top: 2.0, ws: 0.88, bottom: 0.55 },
        { s: 0.25, top: 2.12, ws: 0.9, bottom: 0.62 },
        { s: 0.6, top: 2.7, ws: 0.935, bottom: 0.78 },
        { s: 1.0, top: 3.2, ws: 0.965, bottom: 0.9 },
        { s: 1.4, top: 3.48, ws: 0.99, bottom: floor - 0.02 },
        { s: length, top: crown, ws: 1, bottom: floor },
      ],
      fillet: 0.26,
      filletLoss: 0.18,
      roundLen: 1.7,
      widest: 0.45,
      boxiness: 3.5,
    },
    glass: {
      // two windscreens either side of the gangway door: the door's gap is the centre post (gn387_02_387121_ely, gn387_01_387114_ely: a tall door
      // between the two panes, in a dark frame, its leaf the warning yellow)
      screen: { s0: 0.2, s1: 1.5, fraction: 0.88, topRadius: 0.3, bottomRadius: 0.14, pillar: 0.8 },
      side: { sBack: 1.85, sFront0: 1.3, sFront1: 0.95, v0: 0.55, v1: 0.8 },
    },
    gangway: { width: 1.9, height: 2.15, bottom: 1.15 },
    // folded, level with the roof covers, so the highest point stays the published 3.77 m
    pantographTop: 0.14,
    underframe: 1.0,
    // ASSUMED, all of it: an LED headlight bar over a tail-lamp bar in a dark bezel at each lower corner; a Dellner coupler under a cover; a
    // yellow warning panel (no source says the Great Northern 387s have one: the 2010s Electrostars' fronts were photographed with and without it)
    front: {
      lamps: { shape: 'rect', y: 0.58, x: 0.62, head: [0.3, 0.075], tail: [0.3, 0.045], tailAt: [0, -0.11], bezel: 0.035 },
      frame: 0.08,
      wipers: true,
      display: false,
      door: null,
      warning: YELLOW,
      coupler: { style: 'dellner', covered: true },
      centreDoor: { width: 0.62, leaf: DOOR_YELLOW },
    },
    underfloor: null,
    plan: emuPlan('electrostar', length),
  };
})();

const DESIRO_BODY = ((): BodySpec => {
  const fig = EMU_FIGURES.desiro;
  const floor = fig.floorHeight.value - 0.12;
  const cover = 0.14;
  const crown = fig.height.value - cover;
  const length = 1.7;
  return {
    family: 'desiro',
    half: fig.bodyWidth.value / 2,
    floor,
    wallTop: 3.02,
    crown,
    coverHeight: cover,
    coverBw: 0.95,
    coverTw: 0.75,
    skirtBottom: 0.55,
    cutout: 1.85,
    doorWidth: fig.doorWidth.value,
    doorY: [fig.floorHeight.value + 0.02, 2.95],
    doorLeaves: 2,
    windowY: [1.62, 2.72],
    nose: {
      length,
      knots: [
        // ASSUMED: a rounder, deeper front than the Electrostar's; from photographs, not drawn. The face is nearly as broad as the body
        // (Wikimedia Commons: "Great Northern Class 717 Desiro City at Palmers Green June 2019", "20220519 Thameslink 700032": a wide flat
        // front with small corner radii; the lamps sit at its very corners), so the tip is wide and boxy, not an egg
        { s: 0, top: 2.1, ws: 0.92, bottom: 0.6 },
        { s: 0.22, top: 2.22, ws: 0.935, bottom: 0.66 },
        { s: 0.55, top: 2.75, ws: 0.95, bottom: 0.8 },
        { s: 0.9, top: 3.22, ws: 0.978, bottom: 0.9 },
        { s: 1.25, top: 3.5, ws: 0.992, bottom: floor - 0.02 },
        { s: length, top: crown, ws: 1, bottom: floor },
      ],
      fillet: 0.24,
      filletLoss: 0.18,
      roundLen: 1.5,
      widest: 0.45,
      boxiness: 3.6,
    },
    glass: {
      // the 717's emergency door stands between its two windscreens, a black panel in the black glass (GN717-03-717005-Potters-Bar, GN717-05-25.06.26-Welwyn-Garden-City-717014)
      screen: { s0: 0.2, s1: 1.35, fraction: 0.87, topRadius: 0.28, bottomRadius: 0.14, pillar: 0.7 },
      side: { sBack: 1.65, sFront0: 1.15, sFront1: 0.9, v0: 0.55, v1: 0.8 },
    },
    // the Desiro City's gangways are open and "full width"
    gangway: { width: 2.45, height: 2.2, bottom: 1.12 },
    // folded, level with the roof covers, so the highest point stays the published 3.77 m
    pantographTop: 0.14,
    underframe: 1.0,
    // ASSUMED, all of it: round headlights over round tail lamps in a dark bezel; a front evacuation door between them (the 717 works the
    // Moorgate tunnels); the coupler stands out of the face, uncovered; and no warning panel (a 2018 train with compliant lights)
    front: {
      lamps: { shape: 'round', y: 0.55, x: 0.62, head: [0.17, 0.17], tail: [0.09, 0.09], tailAt: [0, -0.17], bezel: 0.03 },
      frame: 0.07,
      wipers: true,
      display: true,
      door: { width: 0.6, height: 0.62 },
      warning: null,
      coupler: { style: 'dellner', covered: false },
    },
    underfloor: null,
    plan: emuPlan('desiro', length),
  };
})();

/**
 * The Class 700 is the same Siemens Desiro City as the 717: the body, nose, windows, doors and bogies are the 717's, from its own
 * figures (the width, height, floor and wheels are alike). Its front differs: no front door, slim LED headlight strips with a tail lamp
 * at the outer end, and a yellow warning panel (a forum post says the 700s "still have a yellow panel"). In photographs (Wikimedia Commons:
 * "20220519 Thameslink 700032", "Siemens Class 700 mock up") the panel is a patch under the glass, about two thirds of the face's width,
 * with white cheeks to each side of it, where the lamps sit; ASSUMED sizes. The cars' lengths are the 700's own (core/train.ts: DESIRO_700).
 */
const DESIRO700_BODY: BodySpec = {
  ...DESIRO_BODY,
  family: 'desiro700',
  // one broad windscreen, with no emergency door between two panes (tl700_01_gatwick_front)
  glass: { screen: { s0: 0.2, s1: 1.35, fraction: 0.87, topRadius: 0.28, bottomRadius: 0.14 }, side: DESIRO_BODY.glass.side },
  front: {
    lamps: { shape: 'rect', y: 0.55, x: 0.77, head: [0.2, 0.06], tail: [0.07, 0.07], tailAt: [0.14, 0], bezel: 0.03 },
    frame: 0.07,
    wipers: true,
    display: true,
    door: null,
    warning: YELLOW,
    warningWrap: 0.2,
    warningWidth: 0.7,
    coupler: { style: 'dellner', covered: false },
  },
  plan: emuPlan('desiro700', DESIRO_BODY.nose.length),
};

/**
 * Grand Central's Class 180 Adelante (an Alstom Coradia 1000 diesel-hydraulic unit). Built on the commuter units' recipe from its own
 * figures: 2.73 m wide, cars of 23.71 m (driving) and 23.03 m, one single-leaf door a side near each end. The cab's shape is read from
 * photographs (Wikimedia Commons: "GC 180 at Kings Cross", "180106 London Kings Cross September 29th 2022", "Class 180 approaching
 * Peterborough", "Class 180 Adelante DMU", and "Spare BR Class 180 Cab", a bare glass-fibre cab shell), not from a drawing, so every
 * dimension below is ASSUMED: a tall, wide face nearly as broad as the body, under a large windscreen in two panes divided by a
 * centre post, raked about 33 degrees and wrapping the corners, into a smooth dome of a roof. The face is a broad flat yellow panel
 * between two big dark lamp pods, one at each lower corner, each holding a round headlight and a smaller marker/tail lamp. Under it
 * a black valance, and out of it the Scharfenberg coupler, uncovered (the head stands in the open at a train's end). There is no lit
 * destination display on the glass in any photograph. The yellow warning panel is seen in the photographs (the Grand Central
 * livery's own text does not mention it). The underframe is not hidden: a shallow valance, then the engine, cooler, tank and batteries
 * hanging under the floor between the bogies (Wikipedia: one Cummins QSK19 engine and Voith transmission to each car).
 */
const ADELANTE_BODY = ((): BodySpec => {
  const fig = EMU_FIGURES.adelante;
  const floor = fig.floorHeight.value - 0.12;
  const cover = 0.14;
  const crown = fig.height.value - cover;
  const length = 2.6;
  return {
    family: 'adelante',
    half: fig.bodyWidth.value / 2,
    floor,
    wallTop: 3.02,
    crown,
    coverHeight: cover,
    coverBw: 0.9,
    coverTw: 0.7,
    skirtBottom: 0.8,
    cutout: 2.0,
    doorWidth: fig.doorWidth.value,
    doorY: [fig.floorHeight.value + 0.02, 2.95],
    doorLeaves: 1,
    windowY: [1.62, 2.72],
    nose: {
      length,
      knots: [
        // ASSUMED: a tall wide face (nearly the body's width), a short bonnet, then a windscreen raked about 33 degrees that flattens
        // into the dome of the roof; longer and shallower than the 700's, whose glass is raked about 55 degrees
        { s: 0, top: 2.4, ws: 0.92, bottom: 0.55 },
        { s: 0.3, top: 2.5, ws: 0.95, bottom: 0.66 },
        { s: 0.9, top: 2.95, ws: 0.975, bottom: 0.82 },
        { s: 1.6, top: 3.33, ws: 0.99, bottom: 0.95 },
        { s: 2.15, top: 3.55, ws: 0.998, bottom: floor - 0.02 },
        { s: length, top: crown, ws: 1, bottom: floor },
      ],
      fillet: 0.28,
      filletLoss: 0.18,
      roundLen: 2.3,
      widest: 0.42,
      boxiness: 3.4,
    },
    glass: {
      // two panes, a 10 cm post between them; the glass wraps close to the corners (ASSUMED sizes, from the photographs)
      screen: { s0: 0.32, s1: 2.05, fraction: 0.88, topRadius: 0.35, bottomRadius: 0.2, pillar: 0.1 },
      side: { sBack: 2.35, sFront0: 1.8, sFront1: 1.25, v0: 0.55, v1: 0.8 },
    },
    gangway: { width: 1.9, height: 2.1, bottom: 1.15 },
    // no pantograph: this value is never used
    pantographTop: 0.14,
    underframe: 0.95,
    // ASSUMED: a big dark pod at each lower corner (a round headlight, with a smaller lamp above it), the yellow panel running across the whole face and
    // only just over the bonnet, no display on the glass, and the Scharfenberg coupler out in the open
    front: {
      lamps: { shape: 'round', y: 0.45, x: 0.8, head: [0.17, 0.17], tail: [0.1, 0.1], tailAt: [0, 0.2], bezel: 0.1, bezelColour: 0x3c4149 },
      frame: 0.07,
      wipers: true,
      display: false,
      door: null,
      warning: YELLOW,
      warningWrap: 0.3,
      coupler: { style: 'scharfenberg', covered: false },
    },
    // ASSUMED: sizes and order of the pods (a Cummins QSK19 is about 2 m long; the rest are guesses), laid between the bogies
    underfloor: {
      clearance: 0.35,
      items: [
        { name: 'cooler', length: 1.7, half: 0.8, bottom: 0.6, colour: 0x3b3f46 },
        { name: 'engine', length: 3.3, half: 0.88, bottom: 0.5, colour: 0x2c2f35 },
        { name: 'fuel-tank', length: 2.6, half: 0.95, bottom: 0.48, colour: 0x353940 },
        { name: 'battery-box', length: 1.1, half: 0.7, bottom: 0.62, colour: 0x42464d },
      ],
    },
    plan: emuPlan('adelante', length),
  };
})();

const BODIES: Readonly<Record<Family, BodySpec>> = { at300: AT300, electrostar: ELECTROSTAR_BODY, desiro: DESIRO_BODY, desiro700: DESIRO700_BODY, adelante: ADELANTE_BODY };

/**
 * What differs between kinds that share a body. The AT300 front is the Azuma's by default (a livery-coloured nose); LNER's
 * has the yellow mask under the windscreen, with the red cheeks either side of it (photographs lner-801-214-2025,
 * lner-800-113-newcastle-2025: the mask is about four fifths of the face's width and runs back to the windscreen's lower edge).
 */
const FRONT_OVERRIDES: Readonly<Partial<Record<TrainKind, Partial<FrontSpec>>>> = {
  lner5: { warning: LNER_YELLOW, warningWrap: 1.2, warningWidth: 0.8 },
  lner9: { warning: LNER_YELLOW, warningWrap: 1.2, warningWidth: 0.8 },
  // Hull Trains: the grey beak is the same shape of panel, over blue cheeks (hull-802-doncaster-2024: a grey bullet between the lamp pods, the cheeks the body's blue)
  hull5: { warning: HULL_BEAK, warningWrap: 1.2, warningWidth: 0.8, cabSideSurround: CAB_SWOOSH },
  // Lumo: the same dark swoosh round the cab side window (LUMO-04-Lumo-803003-at-Edinburgh-Waverley, LUMO-02-803-001-Lumo-Trains-at-Offord-Cluny)
  lumo5: { cabSideSurround: CAB_SWOOSH },
};

/**
 * How far a cab front's face stands behind the end of the train. A front with its coupler under a cover leaves the face almost at the
 * end (NOSE_RECESS); a front whose coupler stands out of it holds the face a whole END_GAP back, so the coupler's head reaches the end
 * of the car and the car still spans exactly its own [start, end].
 */
export const faceSetback = (family: Family): number => (BODIES[family].front.coupler.covered ? NOSE_RECESS : END_GAP);

/** One box of a diesel car's underfloor equipment, in the train's own frame (x across, y above the rail head, z along the train). */
export interface UnderfloorBlock {
  name: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  colour: number;
}

/** The least gap kept between two pieces of underfloor equipment, and between one and a bogie's wheels, metres. */
const UNDERFLOOR_GAP = 0.12;

/**
 * A diesel car's underfloor equipment: the spec's items, in order from the car's start, spaced evenly along the clear stretch between the
 * two bogies (beyond each bogie's wheels and the spec's clearance). Where the stretch is too short for the items' lengths they shrink together, so
 * nothing ever reaches a wheel. Each hangs from the floor down to its own bottom, and stands inside the body's width. An electric unit has none.
 */
export function underfloorBlocks(car: Car, spec: Pick<BodySpec, 'family' | 'underfloor' | 'floor'>): UnderfloorBlock[] {
  const u = spec.underfloor;
  if (!u) return [];
  const fig = EMU_FIGURES[spec.family as EmuFamily];
  const reach = Math.max(fig.wheelbaseMotor.value, fig.wheelbaseTrailer.value) / 2 + fig.wheelDiameter.value / 2 + u.clearance;
  const from = car.bogies[0] + reach;
  const to = car.bogies[1] - reach;
  const total = u.items.reduce((a, item) => a + item.length, 0);
  const gaps = u.items.length + 1;
  const k = Math.min(1, Math.max(0, to - from - UNDERFLOOR_GAP * gaps) / total);
  const gap = (to - from - total * k) / gaps;
  let z = from + gap;
  return u.items.map((item): UnderfloorBlock => {
    const length = item.length * k;
    const block = { name: item.name, x0: -item.half, x1: item.half, y0: item.bottom, y1: spec.floor + 0.02, z0: z, z1: z + length, colour: item.colour };
    z += length + gap;
    return block;
  });
}

/** The plan (doors and windows) of a car of any family. The Azuma's is the one the tests pin. */
export function carPlan(car: Car, family: Family = 'at300'): CarPlan {
  return BODIES[family].plan(car, false);
}

// --- the car section -----------------------------------------------------------------------------

/** Right half of the section, from the bottom corner up to the roof centre: slight corners, a vertical wall, a quarter-ellipse shoulder, a nearly flat crown. */
export function carSection(b: Pick<BodySpec, 'floor' | 'wallTop' | 'crown'> & { half: number }): Section {
  const W = b.half - DOOR_RELIEF;
  const half: [number, number][] = [[W - 0.15, b.floor], [W - 0.03, b.floor + 0.07]];
  const w0 = b.floor + 0.25;
  for (let i = 0; i < 4; i++) half.push([W, lerp(w0, b.wallTop, i / 3)]);
  const rx = 0.55;
  const ry = b.crown - b.wallTop - 0.012;
  const n = 5;
  for (let j = 1; j <= n; j++) {
    const phi = (j / n) * (Math.PI / 2);
    half.push([W - rx + rx * Math.cos(phi), b.wallTop + ry * Math.sin(phi)]);
  }
  half.push([(W - rx) * 0.5, b.crown - 0.004], [0, b.crown]);
  return { half, width: W, floor: b.floor, crown: b.crown };
}

// --- one car -----------------------------------------------------------------------------------

interface CarContext {
  spec: BodySpec;
  /** the cab front's finish for this kind: the family's own, with the kind's overrides (FRONT_OVERRIDES) laid over it */
  front: FrontSpec;
  def: TrainLivery;
  kind: TrainKind;
  layout: TrainLayout;
}

/** Is the cab end of this car at an inner coupling (two coupled units meet there), rather than the train's end? */
function cabIsInterior(car: Car, layout: TrainLayout): boolean {
  if (car.cab === 'front') return car.start > 1e-9;
  if (car.cab === 'rear') return car.end < layout.length - 1e-9;
  return false;
}

function buildCar(car: Car, ctx: CarContext): THREE.Group {
  const { spec, def, layout } = ctx;
  const group = new THREE.Group();
  group.name = `car-${car.index}`;
  const L = car.length;
  const sec = carSection(spec);
  const W = sec.width;
  const half = spec.half;
  const norm = normalised(sec);
  const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
  const M = sec.half.length * 2 - 1;
  const plan = spec.plan(car, false);
  // distance along the car (s) to z: from the cab end for a driving car, from the start otherwise
  const dir = car.cab === 'rear' ? -1 : 1;
  const base = car.cab === 'rear' ? car.end : car.start;
  const Z = (s: number): number => base + dir * s;
  const interiorCab = cabIsInterior(car, layout);
  // where the body begins and ends along the car: a train-end nose starts NOSE_RECESS behind the car end (so the lamps and
  // the seam, laid a few millimetres proud of the face, stay inside the car) or, where its coupler stands out of the face,
  // END_GAP behind it (so the coupler's head can reach the end); anything else stands END_GAP in
  const front = ctx.front;
  const tip = car.cab ? (interiorCab ? END_GAP : faceSetback(spec.family)) : END_GAP;
  const bodyEnd = L - END_GAP;
  const noseLen = car.cab ? spec.nose.length : 0;
  // what the livery needs to know about this car: its decals, and (for Grand Central) the colour of its doors
  const carInfo = { index: car.index, count: layout.cars.length, type: car.type as string, cab: car.cab !== null, length: L, nose: noseLen, doors: plan.doors };

  const shell = new Soup();
  const detail = new Soup();
  const decals = new Soup();
  const glass = new Soup();
  const vUv = (y: number): number => (y - TEX_Y0) / (TEX_Y1 - TEX_Y0);
  const world = (p: V3): V3 => [p[0], p[1], Z(p[2])];
  const wn = (n: V3): V3 => [n[0], n[1], n[2] * dir];

  // rings of the lofted body, in the car's own frame (x, y, s). A through car is two rings; a cab car is the nose rings and the far end.
  const rings: { s: number; pts: [number, number][]; round: number }[] = [];
  if (car.cab) {
    for (const sn of ringStations(spec.nose)) {
      const r = ringAt(spec.nose, sn);
      rings.push({ s: tip + sn, pts: loopFromHalf(halfAt(sec, norm, egg, r)), round: r.round });
    }
  } else {
    rings.push({ s: tip, pts: loopFromHalf(sec.half as [number, number][]), round: 0 });
  }
  rings.push({ s: bodyEnd, pts: loopFromHalf(sec.half as [number, number][]), round: 0 });
  const P: V3[][] = rings.map((r) => r.pts.map(([x, y]): V3 => [x, y, r.s]));
  const centre = (i: number): V3 => {
    const ys = (rings[i] as { pts: [number, number][] }).pts.map((p) => p[1]);
    return [0, (Math.max(...ys) + Math.min(...ys)) / 2, (rings[i] as { s: number }).s];
  };
  const N = gridNormals(P, true, centre);
  const R = rings.length - 1;
  const colourOf = (c: number): THREE.Color => col(c);
  const glassHalf = (s: number): [number, number][] => halfAt(sec, norm, egg, ringAt(spec.nose, s));
  const screen = spec.glass.screen;
  // the windscreen outline, a rounded rectangle laid on the nose: half-width at nose distance s, for the glass (margin 0) or a frame
  // `margin` wider all round (its corners concentric with the glass's)
  const screenHalfWidth = (s: number, margin: number): number => {
    const s0 = screen.s0 - margin;
    const s1 = screen.s1 + margin;
    const ringHalf = ringAt(spec.nose, s).ws * W;
    const hw0 = screen.fraction * ringHalf + margin;
    const inset = (d: number, r: number): number => (d >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))));
    // a frame never reaches past FRAME_REACH of the ring's half-width (so no glass is wider than that: its `fraction` stays under it): out there the
    // nose falls away so steeply that the frame, a few centimetres wider than the glass, would hang a long way down the cheek as a black wedge
    const reach = FRAME_REACH * ringHalf;
    return Math.max(0.01, Math.min(reach, hw0 - Math.max(inset(s1 - s, screen.topRadius + margin), inset(s - s0, screen.bottomRadius + margin))));
  };
  // The loft's columns: the loop goes up the right side (columns 0..K-1, the last the crown), then down the left. A quad's colour and
  // material follow its columns, not its normal, so every colour boundary runs along a column or a ring: a clean curve, not a stair.
  const K = sec.half.length;
  const kOf = (m: number): number => (m < K ? m : M - 1 - m);
  // the cab's front panel is the face above column J0 (below it is the coupler cover): the split runs along that one column
  let J0 = 1;
  let yCut = 0;
  // the warning panel's side edge, likewise a column: J0 (the whole face) unless the spec narrows the panel to a fraction of the face's width
  let kW = 1;
  const stations = car.cab ? ringStations(spec.nose) : [];
  if (car.cab) {
    const r0 = ringAt(spec.nose, 0);
    const h0 = halfAt(sec, norm, egg, r0);
    const target = r0.bottom + 0.4 * (r0.top - r0.bottom);
    let best = Infinity;
    for (let k = 1; k < K - 1; k++) {
      const d = Math.abs((h0[k] as [number, number])[1] - target);
      if (d < best) {
        best = d;
        J0 = k;
      }
    }
    yCut = (h0[J0] as [number, number])[1];
    kW = J0;
    const widest = Math.max(...h0.slice(J0).map((p) => p[0]));
    while (kW < K - 1 && (h0[kW] as [number, number])[0] > (front.warningWidth ?? 1) * widest + 1e-9) kW++;
  }
  const snap = (s: number): number => stations.find((x) => x >= s - 1e-9) ?? spec.nose.length;
  const frontEnd = snap(FRONT_ZONE);
  const warnEnd = snap(front.warningWrap ?? FRONT_ZONE);
  const crescentEnd = snap(CRESCENT_ZONE);
  for (let i = 0; i < R; i++) {
    const nearS = (rings[i] as { s: number }).s - tip;
    const farS = (rings[i + 1] as { s: number }).s - tip;
    const onNose = car.cab !== null && nearS < noseLen - 1e-9;
    // the front panel and the cover below it are vertex colours; everything else on the side carries the texture
    const inFront = onNose && farS <= frontEnd + 1e-9;
    const inWarning = onNose && farS <= warnEnd + 1e-9;
    const frontBand = inFront && def.noseCone === null;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const kmin = Math.min(kOf(j), kOf(j1));
      const kmax = Math.max(kOf(j), kOf(j1));
      const idx: [number, number][] = [[i, j], [i, j1], [i + 1, j1], [i + 1, j]];
      const ps = idx.map(([a, b]) => (P[a] as V3[])[b] as V3) as [V3, V3, V3, V3];
      const ns = idx.map(([a, b]) => (N[a] as V3[])[b] as V3) as [V3, V3, V3, V3];
      if (!frontBand && kmin >= SHELL_K0 && kmax <= SHELL_K1) {
        // the side: the livery texture, projected along x. A through car reads the texture's last column.
        const uv = ps.map((p): [number, number] => [car.cab ? texU(p[2]) : 1, vUv(p[1])]) as [[number, number], [number, number], [number, number], [number, number]];
        shell.quad(ps.map(world) as [V3, V3, V3, V3], ns.map(wn) as [V3, V3, V3, V3], null, uv);
        continue;
      }
      let colour = def.roof;
      if (kmax <= 1) colour = def.skirt;
      // a warning panel wraps the nose above the cover (to ring `warnEnd`, and as far across as column kW), over whatever colour the livery gives the nose
      else if (front.warning !== null && inWarning && kmin >= kW) colour = front.warning;
      else if (frontBand) colour = kmin >= J0 ? def.noseFront : (front.coupler.covered ? (def.swoosh ?? def.noseFront) : def.skirt);
      // the nose's roof: a livery's own top colour from `noseTopFrom` back (the LNER's black dome over the windscreen), else the crescent, else the roof
      else if (onNose) colour = def.noseCone ?? (def.noseTop !== null && kmax > SHELL_K1 && nearS >= def.noseTopFrom - 1e-9 ? def.noseTop : kmax > SHELL_K1 && farS <= crescentEnd + 1e-9 ? def.noseBand : def.roof);
      detail.quad(ps.map(world) as [V3, V3, V3, V3], ns.map(wn) as [V3, V3, V3, V3], colourOf(colour));
    }
  }

  // the end walls: a flat dark cap where the body stops short of the car's end (the gangway hangs from it)
  const wallColour = col(0x2d3035);
  const capLoop = (ringIndex: number, outward: 1 | -1): void => {
    const pts = (rings[ringIndex] as { pts: [number, number][] }).pts;
    const s = (rings[ringIndex] as { s: number }).s;
    const poly = pts.map(([x, y]): V3 => world([x, y, s]));
    detail.fan(poly, [0, 0, outward * dir], wallColour);
  };
  if (car.cab) {
    // the nose's front face
    const r0 = ringAt(spec.nose, 0);
    const tipHalf = halfAt(sec, norm, egg, r0);
    const face = loopFromHalf(tipHalf).map(([x, y]): V3 => world([x, y, tip]));
    // the face splits where the loft's column J0 meets it (yCut), so the panel's edge continues, unbroken, round the fillet
    const coverTop = yCut - 0.03;
    const covered = front.coupler.covered;
    // under the cover: the livery's lower nose; with no cover, the dark underframe colour (a valance round the coupler); over it, the warning panel where there is one
    const lowerColour = covered ? (def.noseCone ?? def.swoosh ?? def.noseFront) : def.skirt;
    const upperColour = front.warning ?? def.noseCone ?? def.noseFront;
    // the face is cut by a line across it (axis 0: x = value, axis 1: y = value), keeping the side `above` it
    const clip = (poly: V3[], axis: 0 | 1, value: number, above: boolean): V3[] => {
      const out: V3[] = [];
      const inside = (p: V3): boolean => (above ? p[axis] >= value : p[axis] <= value);
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k] as V3;
        const b = poly[(k + 1) % poly.length] as V3;
        if (inside(a)) out.push(a);
        // where the cut passes exactly through a vertex, that vertex is already in the polygon: a second copy would be a zero-area triangle
        if (inside(a) !== inside(b) && a[axis] !== value && b[axis] !== value) {
          const t = (value - a[axis]) / (b[axis] - a[axis]);
          const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
          p[axis] = value;
          out.push(p);
        }
      }
      return out;
    };
    const faceN: V3 = [0, 0, -dir];
    // two flat caps, split at yCut; where the warning panel is narrower than the face, its upper cap is split again, the panel between two cheeks in the livery's own colour
    detail.fan(clip(face, 1, yCut, false), faceN, colourOf(lowerColour));
    const upper = clip(face, 1, yCut, true);
    if (front.warning !== null && kW > J0) {
      const edge = (tipHalf[kW] as [number, number])[0];
      detail.fan(clip(clip(upper, 0, -edge, true), 0, edge, false), faceN, colourOf(front.warning));
      for (const side of [true, false]) detail.fan(clip(upper, 0, side ? edge : -edge, side), faceN, colourOf(def.noseCone ?? def.noseFront));
    } else {
      detail.fan(upper, faceN, colourOf(upperColour));
    }
    // flat details laid on the face, `depth` metres in front of it (so the lens stands proud of its bezel, and the bezel of the face)
    const onFace = (poly: [number, number][], depth: number): V3[] => poly.map(([x, y]): V3 => world([x, y, tip - depth]));
    // the cover's seam and latches: near black, or a mid grey where the face under the cover is itself dark (the Hull Trains nose cone, luma 0.19)
    const faceLuma = (hex: number): number => (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255;
    const seam = col(faceLuma(lowerColour) < 0.2 ? 0x484c53 : 0x1b1d21);
    const a = xAtY(tipHalf, coverTop);
    const outward = (dir * -1) as 1 | -1;
    if (interiorCab) {
      // Two units coupled, cab to cab. The cover is open: a dark recess where it was, and in it the Dellner coupler, out to the middle of the
      // gap to meet the other unit's (the two heads touch). A jumper cable, sagging, is slung from a socket on the face to the other unit's.
      const hw = Math.min(a * 0.8, xAtY(tipHalf, r0.bottom + 0.12) * 0.9);
      detail.fan(onFace(roundedRect(-hw, hw, r0.bottom + 0.08, coverTop - 0.05, 0.06, 2), 0.004), faceN, col(0x0d0e10));
      const socketY = coverTop - 0.14;
      for (const sx of [-1, 1]) {
        const x = sx * Math.min(a * 0.62, hw * 0.9);
        // (the cable ends a hair short of the middle of the gap: its square end, cut across a slanting bar, would otherwise poke past the car's end)
        const [z0, z1] = [Z(tip), Z(tip) + outward * (END_GAP - 0.008)];
        detail.box(x - 0.05, x + 0.05, socketY - 0.05, socketY + 0.05, Math.min(z0, z0 + outward * 0.04), Math.max(z0, z0 + outward * 0.04), col(0x1d1f23));
        // half the cable: down to the middle of the gap (where the other half meets it at the same height) from the socket
        detail.bar([socketY, z0 + outward * 0.04], [socketY - 0.14, z1], 0.035, 0.035, col(0x111214), x);
      }
    } else if (covered) {
      // the coupler cover: the lower part of the face, a dark seam across its top, and two latches
      detail.fan(onFace(roundedRect(-a * 0.92, a * 0.92, coverTop - 0.012, coverTop + 0.012, 0.01, 1), 0.004), faceN, seam);
      for (const sx of [-1, 1]) detail.fan(onFace(roundedRect(sx * a * 0.45 - 0.05, sx * a * 0.45 + 0.05, coverTop - 0.1, coverTop - 0.03, 0.01, 1), 0.004), faceN, seam);
      const cover = new THREE.Object3D();
      cover.name = 'coupler-cover';
      cover.position.set(0, (r0.bottom + coverTop) / 2, Z(tip));
      cover.userData = { y0: r0.bottom, y1: coverTop, hidesCoupler: true };
      group.add(cover);
    }
    if (interiorCab || !covered) {
      // the coupler out of the face: to the middle of the gap between two coupled noses, or to the end of the car at the end of a train
      couplerHalf(detail, Z(tip), outward, tip, ASSUMED.couplerHeight, front.coupler.style);
      const m = new THREE.Object3D();
      m.name = interiorCab ? 'coupler' : 'nose-coupler';
      m.position.set(0, ASSUMED.couplerHeight, interiorCab ? Z(tip) : Z(tip / 2));
      m.userData = interiorCab ? { end: car.cab, nose: true } : { end: car.cab, style: front.coupler.style, reach: tip };
      group.add(m);
    }
    // lamps: a cluster at each lower corner of the face, a headlight and a tail lamp, in a dark bezel where the family has one
    const lamps = front.lamps;
    const lens = (cx: number, cy: number, w: number, h: number, depth: number, colour: THREE.Color): void => {
      const outline = lamps.shape === 'round' ? ellipse(cx, cy, w / 2, h / 2) : roundedRect(cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2, Math.min(w, h) * 0.25, 2);
      detail.emit = 2; // a lamp lens glows in its own colour after dark
      detail.fan(onFace(outline, depth), faceN, colour);
      detail.emit = 0;
    };
    for (const sx of [-1, 1]) {
      const yh = r0.bottom + lamps.y * (r0.top - r0.bottom);
      const xh = xAtY(tipHalf, yh) * lamps.x;
      const cx = sx * xh;
      const tx = cx + sx * lamps.tailAt[0];
      const ty = yh + lamps.tailAt[1];
      if (lamps.bezel > 0) {
        const xs = [cx - lamps.head[0] / 2, cx + lamps.head[0] / 2, tx - lamps.tail[0] / 2, tx + lamps.tail[0] / 2];
        const ys = [yh - lamps.head[1] / 2, yh + lamps.head[1] / 2, ty - lamps.tail[1] / 2, ty + lamps.tail[1] / 2];
        const b = lamps.bezel;
        detail.fan(onFace(roundedRect(Math.min(...xs) - b, Math.max(...xs) + b, Math.min(...ys) - b, Math.max(...ys) + b, lamps.shape === 'round' ? 0.1 : 0.05, 3), 0.005), faceN, col(lamps.bezelColour ?? BEZEL));
      }
      lens(cx, yh, lamps.head[0], lamps.head[1], 0.009, col(car.cab === 'front' && !interiorCab ? LENS.headOn : LENS.headOff));
      lens(tx, ty, lamps.tail[0], lamps.tail[1], 0.009, col(car.cab === 'rear' && !interiorCab ? LENS.tailOn : LENS.tailOff));
      const m = new THREE.Object3D();
      m.name = 'headlight';
      m.position.set(sx * xh, yh, Z(tip));
      m.userData = { side: sx > 0 ? 'right' : 'left' };
      group.add(m);
    }
    // a front door outlined on the upper face, with a window and a handle: as tall as the face allows above the cut, and always inside the face's outline
    if (front.door) {
      const hw = front.door.width / 2;
      const y0 = yCut + 0.07;
      let y1 = Math.min(y0 + front.door.height, r0.top - 0.06);
      while (y1 > y0 + 0.3 && xAtY(tipHalf, y1) < hw + 0.08) y1 -= 0.02;
      detail.fan(onFace(roundedRect(-hw - 0.02, hw + 0.02, y0 - 0.02, y1 + 0.02, 0.05, 2), 0.005), faceN, col(0x15171a));
      detail.fan(onFace(roundedRect(-hw, hw, y0, y1, 0.04, 2), 0.007), faceN, colourOf(upperColour));
      detail.fan(onFace(roundedRect(-hw * 0.55, hw * 0.55, y1 - 0.27, y1 - 0.1, 0.03, 2), 0.009), faceN, colourOf(def.glass));
      detail.fan(onFace(roundedRect(hw * 0.62, hw * 0.62 + 0.04, y0 + 0.14, y0 + 0.26, 0.01, 1), 0.009), faceN, col(0x9aa0a8));
      const m = new THREE.Object3D();
      m.name = 'front-door';
      m.position.set(0, (y0 + y1) / 2, Z(tip));
      m.userData = { width: 2 * hw, height: y1 - y0 };
      group.add(m);
    }
    // A patch laid on the nose's surface, `lift` metres off it along its normal: rows x cols quads over the (x, s) points `at(v, u)` gives
    // (v runs along the rows, u across them, both 0..1). The windscreen, its frame, the wipers and the destination display are such patches.
    const nosePatch = (rows: number, cols: number, at: (v: number, u: number) => [number, number], target: Soup, colour: THREE.Color | null, lift: number): void => {
      const grid: V3[][] = [];
      for (let p = 0; p <= rows; p++) {
        const row: V3[] = [];
        let h: [number, number][] | null = null;
        let hAt = NaN;
        for (let q = 0; q <= cols; q++) {
          const [x, s] = at(p / rows, q / cols);
          // a row of a patch usually stands at one s: the section there is worked out once
          if (h === null || s !== hAt) {
            h = glassHalf(s);
            hAt = s;
          }
          row.push([x, yAtX(h, Math.abs(x)), tip + s]);
        }
        grid.push(row);
      }
      // The nose's own normal at each point, from its height field y(x, s), pointing up and forward. (The grid's differences do not give it:
      // at the two lower corners of the outline both the rows and the columns run along x, and the normal they give is noise, with its
      // z component of either sign.) The steps are wide enough to smooth the polyline of the section, narrow enough to follow the rake.
      const hx = 0.06;
      const hs = 0.04;
      const heightAt = (x: number, s: number): number => yAtX(glassHalf(Math.max(0, s)), Math.abs(x));
      const Ng = grid.map((row) => row.map((p): V3 => {
        const s = p[2] - tip;
        return unit([-(heightAt(p[0] + hx, s) - heightAt(p[0] - hx, s)) / (2 * hx), 1, -(heightAt(p[0], s + hs) - heightAt(p[0], s - hs)) / (2 * hs)]);
      }));
      const lifted = grid.map((row, i) => row.map((p, j): V3 => [p[0] + (Ng[i] as V3[])[j]![0] * lift, p[1] + (Ng[i] as V3[])[j]![1] * lift, p[2] + (Ng[i] as V3[])[j]![2] * lift]));
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const at = (a: number, b: number): V3 => (lifted[a] as V3[])[b] as V3;
          const nn = (a: number, b: number): V3 => (Ng[a] as V3[])[b] as V3;
          target.quad([world(at(i, j)), world(at(i, j + 1)), world(at(i + 1, j + 1)), world(at(i + 1, j))], [wn(nn(i, j)), wn(nn(i, j + 1)), wn(nn(i + 1, j + 1)), wn(nn(i + 1, j))], colour);
        }
      }
    };
    // the windscreen: a curved patch on the nose's roof, glass over a black frame; rows crowd toward the two edges, where the corners curve
    const patch = (margin: number, target: Soup, colour: THREE.Color | null, lift: number, post = 0): void => {
      // with a centre post the glass is two panes (each its own patch, 10 columns across), and the frame's black shows between them
      for (const pane of post > 0 ? [-1, 1] : [0]) {
        nosePatch(30, post > 0 ? 10 : 20, (v, u) => {
          const s = lerp(screen.s0 - margin, screen.s1 + margin, 0.5 - 0.5 * Math.cos(Math.PI * v));
          const hw = screenHalfWidth(s, margin);
          if (pane === 0) return [hw * (2 * u - 1), s];
          const inner = Math.min(post / 2, hw * 0.5);
          return [pane > 0 ? lerp(inner, hw, u) : lerp(-hw, -inner, u), s];
        }, target, colour, lift);
      }
    };
    // the frame and the glass stand clear of the loft by more than its facets sag between rings (a few mm, up to a centimetre on the steep shoulder), so neither shows through the other
    patch(front.frame, detail, colourOf(def.glass), 0.014);
    patch(0, glass, null, 0.02, screen.pillar ?? 0);
    if (front.centreDoor) {
      // the gangway door between the two panes: its leaf up the face (from the cover's seam to the face's top edge, which it follows) and along the
      // nose to the glass's top; the screen's black frame, 4 mm under it, is its outline
      const hw = front.centreDoor.width / 2;
      const leaf = colourOf(front.centreDoor.leaf);
      const yb = coverTop + 0.04;
      const topEdge: [number, number][] = [-1, -0.5, 0, 0.5, 1].map((t): [number, number] => [t * hw, yAtX(tipHalf, Math.abs(t) * hw)]);
      detail.fan(onFace([[-hw, yb], [hw, yb], ...topEdge.reverse()], 0.007), faceN, leaf);
      // (it starts 3 cm back, so its lift stays behind the face's plane: no detail stands out in front of the train's end)
      // (and 27 mm off the nose, well clear of the black frame's own facets under it: at 18 mm the two interleave in a jagged black seam)
      nosePatch(14, 1, (v, u) => [(2 * u - 1) * hw, lerp(0.03, screen.s1 + front.frame, v)], detail, leaf, 0.027);
    }
    if (front.wipers) {
      // two wiper arms parked along the foot of the windscreen, from a pivot each side of the middle out toward the corners: dark, as the blades are, lying
      // in the glass's lower edge (a pale arm higher up reads as an eyebrow)
      const arm = col(WIPER);
      const pivot = (screen.pillar ?? 0) / 2 + 0.1;
      for (const sx of [-1, 1]) {
        const a: [number, number] = [sx * pivot, screen.s0 + 0.045];
        const b: [number, number] = [sx * Math.min(0.8, screenHalfWidth(screen.s0 + 0.08, 0) - 0.2), screen.s0 + 0.08];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const perp: [number, number] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
        nosePatch(6, 1, (v, u) => [a[0] + (b[0] - a[0]) * v + perp[0] * (u - 0.5) * 0.028, a[1] + (b[1] - a[1]) * v + perp[1] * (u - 0.5) * 0.028], detail, arm, 0.032);
      }
    }
    if (front.display) {
      // the destination display: a lit amber panel in a dark bezel, across the top of the glass, over the middle half of its width
      const top = screen.s1 - 0.12;
      const hwDisplay = Math.min(0.5, screenHalfWidth(screen.s1 - 0.3, 0) - 0.3);
      // (a lit strip of text in a dark panel, as the photographs show it, gn387_02_387121_ely and tl700_01_gatwick_front: not an amber slab across the glass)
      nosePatch(2, 8, (v, u) => [lerp(-hwDisplay - 0.03, hwDisplay + 0.03, u), lerp(top - 0.25, top + 0.02, v)], detail, col(0x0d0e10), 0.03);
      nosePatch(2, 4, (v, u) => [lerp(-hwDisplay * 0.45, hwDisplay * 0.45, u), lerp(top - 0.15, top - 0.08, v)], detail, col(0xffa000), 0.034);
    }
    // the cab side windows, one each side, following the nose's slope: the pane (glass), and where the kind has one the dark swoosh round it (a
    // matte patch a little under the glass)
    type SideWindow = { sBack: number; sFront0: number; sFront1: number; v0: number; v1: number };
    const sideWindow = (side: number, sw: SideWindow, target: Soup, colour: THREE.Color | null, liftBy: number): void => {
      const rows = 8;
      const cols = 12;
      const grid: V3[][] = [];
      for (let q = 0; q <= rows; q++) {
        const v = lerp(sw.v0, sw.v1, q / rows);
        const sF = lerp(sw.sFront0, sw.sFront1, q / rows);
        const row: V3[] = [];
        for (let p = 0; p <= cols; p++) {
          const s = lerp(sF, sw.sBack, p / cols);
          const rr = ringAt(spec.nose, s);
          const hh = halfAt(sec, norm, egg, rr);
          const y = rr.bottom + v * (rr.top - rr.bottom);
          row.push([side * xAtY(hh, y), y, tip + s]);
        }
        grid.push(row);
      }
      const inside = (i: number): V3 => [0, ((grid[i] as V3[])[0] as V3)[1], tip + sw.sFront1];
      const Ng = gridNormals(grid, false, inside);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const lift = (a: number, b: number): V3 => {
            const p = (grid[a] as V3[])[b] as V3;
            const n = (Ng[a] as V3[])[b] as V3;
            return [p[0] + n[0] * liftBy, p[1] + n[1] * liftBy, p[2] + n[2] * liftBy];
          };
          const nn = (a: number, b: number): V3 => (Ng[a] as V3[])[b] as V3;
          target.quad([world(lift(i, j)), world(lift(i, j + 1)), world(lift(i + 1, j + 1)), world(lift(i + 1, j))], [wn(nn(i, j)), wn(nn(i, j + 1)), wn(nn(i + 1, j + 1)), wn(nn(i + 1, j))], colour);
        }
      }
    };
    for (const side of [-1, 1]) {
      // (the shoulder's facets sag a centimetre between rings, so the swoosh stands 12 mm off the loft, and the pane 4 mm proud of it)
      if (front.cabSideSurround !== undefined && spec.glass.side.surround) sideWindow(side, spec.glass.side.surround, detail, col(front.cabSideSurround), 0.012);
      sideWindow(side, spec.glass.side, glass, null, 0.016);
    }
  }
  // an end wall at every inner end of the body, and the gangway bellows and coupler in the gap beyond it
  const innerEnds: { ring: number; s: number; sign: 1 | -1 }[] = [];
  if (!car.cab) innerEnds.push({ ring: 0, s: tip, sign: -1 });
  innerEnds.push({ ring: R, s: bodyEnd, sign: 1 });
  for (const e of innerEnds) {
    capLoop(e.ring, e.sign);
    const zWall = Z(e.s);
    const zOut = Z(e.s + e.sign * END_GAP);
    const g = spec.gangway;
    const outline = (k: number): [number, number][] => roundedRect(-g.width / 2 * k, (g.width / 2) * k, g.bottom + (g.height * (1 - k)) / 2, g.bottom + g.height - (g.height * (1 - k)) / 2, 0.3, 3);
    const rs = bellowsRings(outline, 0, END_GAP, 1, 0.05);
    // the bellows are seated a hair outside the end wall, so no vertex of theirs lies in the wall's plane (the section of the body is that plane's)
    const zSeat = zWall + Math.sign(zOut - zWall) * BELLOWS_SEAT;
    const pts3: V3[][] = rs.map((r) => r.pts.map(([x, y]): V3 => [x, y, zSeat + (zOut - zSeat) * (r.z / END_GAP)]));
    const mid = (i: number): V3 => [0, g.bottom + g.height / 2, (pts3[i] as V3[])[0]![2]];
    const Nb = gridNormals(pts3, true, mid);
    const bellows = col(0x2a2c31);
    for (let i = 0; i + 1 < pts3.length; i++) {
      const row = pts3[i] as V3[];
      for (let j = 0; j < row.length; j++) {
        const j1 = (j + 1) % row.length;
        const a = row[j] as V3;
        const b = row[j1] as V3;
        const c2 = (pts3[i + 1] as V3[])[j1] as V3;
        const d = (pts3[i + 1] as V3[])[j] as V3;
        detail.quad([a, b, c2, d], [(Nb[i] as V3[])[j] as V3, (Nb[i] as V3[])[j1] as V3, (Nb[i + 1] as V3[])[j1] as V3, (Nb[i + 1] as V3[])[j] as V3], bellows);
      }
    }
    const marker = new THREE.Object3D();
    marker.name = 'gangway';
    marker.position.set(0, g.bottom + g.height / 2, (zWall + zOut) / 2);
    marker.userData = { end: e.sign > 0 ? (car.cab === 'rear' ? 'front' : 'rear') : 'front', width: g.width, height: g.height, depth: END_GAP };
    group.add(marker);
    // the coupler: a barrel and head from the end wall, meeting its neighbour's in the middle of the gap
    couplerHalf(detail, zWall, (Math.sign(zOut - zWall) || 1) as 1 | -1, END_GAP, ASSUMED.couplerHeight);
    const cm = new THREE.Object3D();
    cm.name = 'coupler';
    cm.position.set(0, ASSUMED.couplerHeight, (zWall + zOut) / 2);
    cm.userData = { end: marker.userData.end, nose: false };
    group.add(cm);
  }

  // roof covers: grey fairings along the roof, split in short runs, left off over the pantograph
  const carFrom = car.cab === 'front' ? car.start + tip + noseLen + 0.4 : car.start + END_GAP + 0.6;
  const carTo = car.cab === 'rear' ? car.end - tip - noseLen - 0.4 : car.end - END_GAP - 0.6;
  const runs = Math.max(1, Math.ceil((carTo - carFrom) / 7.5));
  const gap = 0.8;
  const runLen = (carTo - carFrom - gap * (runs - 1)) / runs;
  let covers: [number, number][] = [];
  for (let k = 0; k < runs; k++) covers.push([carFrom + k * (runLen + gap), carFrom + k * (runLen + gap) + runLen]);
  if (car.pantograph) covers = without(covers, car.pantograph[0] - 0.35, car.pantograph[1] + 0.35);
  const coverColour = col(0xb4b8be);
  for (const [z0, z1] of covers) {
    if (z1 - z0 < 0.8) continue;
    const yb = spec.crown - 0.04;
    const yt = spec.crown + spec.coverHeight;
    const bw = spec.coverBw;
    const tw = spec.coverTw;
    const ez = 0.3;
    const lo: V3[] = [[-bw, yb, z0], [bw, yb, z0], [bw, yb, z1], [-bw, yb, z1]];
    const hi: V3[] = [[-tw, yt, z0 + ez], [tw, yt, z0 + ez], [tw, yt, z1 - ez], [-tw, yt, z1 - ez]];
    const mean8: V3 = [0, (yb + yt) / 2, (z0 + z1) / 2];
    const f = (a: V3, b: V3, c3: V3, d: V3): void => detail.face([a, b, c3, d], mean8, coverColour);
    f(hi[0] as V3, hi[1] as V3, hi[2] as V3, hi[3] as V3);
    for (let k = 0; k < 4; k++) f(lo[k] as V3, lo[(k + 1) % 4] as V3, hi[(k + 1) % 4] as V3, hi[k] as V3);
  }

  // skirts between the bogie cut-outs, and the dark underframe seen through the cut-outs
  const noseZone: [number, number] | null = car.cab === 'front' ? [car.start, car.start + tip + noseLen] : car.cab === 'rear' ? [car.end - tip - noseLen, car.end] : null;
  let free: [number, number][] = [[car.start + END_GAP + 0.1, car.end - END_GAP - 0.1]];
  if (noseZone) free = without(free, noseZone[0], noseZone[1]);
  const underframe = free.map((s) => [...s] as [number, number]);
  for (const z of car.bogies) free = without(free, z - spec.cutout, z + spec.cutout);
  // (a shallow valance, as a diesel unit has, leaves less than 0.17 m between its foot and the floor: the slab then stops at the floor)
  const slabBottom = Math.min(spec.skirtBottom + 0.17, spec.floor - 0.01);
  for (const [z0, z1] of underframe) detail.box(-spec.underframe, spec.underframe, slabBottom, spec.floor + 0.05, z0, z1, col(def.skirt), '+y');
  for (const [z0, z1] of free) for (const sx of [-1, 1]) detail.box(sx > 0 ? W - 0.06 : -(W - 0.03), sx > 0 ? W - 0.03 : -(W - 0.06), spec.skirtBottom, spec.floor + 0.1, z0, z1, col(def.skirt));
  // a diesel unit's engine, cooler, tank and batteries hang under the floor between the bogies, in plain sight below the valance
  for (const b of underfloorBlocks(car, spec)) detail.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, col(b.colour), '+y');

  // doors: a dark frame, the leaf (or two leaves), and a window in each leaf; one marker per opening
  const frameC = col(0x24272b);
  const leafC = col(def.doorFor ? def.doorFor(carInfo) : def.door);
  const paneC = col(def.window);
  const [dy0, dy1] = spec.doorY;
  // the passenger doors, then the narrow crew doors (a single leaf with a small window, whatever the passenger doors have)
  const openings = [
    ...plan.doors.map((s, di) => ({ s, di, dw: spec.doorWidth, crew: false })),
    ...(plan.crewDoors ?? []).map((d, di) => ({ s: d.s, di, dw: d.width, crew: true })),
  ];
  openings.forEach(({ s, di, dw, crew }) => {
    const z = Z(s);
    for (const sx of [-1, 1]) {
      const side = sx > 0 ? 'right' : 'left';
      const x = (a: number): number => sx * a;
      const lo = (a: number, b: number): [number, number] => [Math.min(x(a), x(b)), Math.max(x(a), x(b))];
      const [fx0, fx1] = lo(W - 0.005, half - DOOR_RELIEF / 2);
      detail.box(fx0, fx1, dy0 - 0.05, dy1 + 0.04, z - dw / 2 - 0.05, z + dw / 2 + 0.05, frameC);
      const [lx0, lx1] = lo(W - 0.005, half - 0.004);
      const [px0, px1] = lo(W - 0.005, half);
      if (crew) {
        detail.box(lx0, lx1, dy0, dy1, z - dw / 2, z + dw / 2, leafC);
        detail.box(px0, px1, dy1 - 0.85, dy1 - 0.25, z - 0.12, z + 0.12, paneC);
      } else if (spec.doorLeaves === 1) {
        detail.box(lx0, lx1, dy0, dy1, z - dw / 2, z + dw / 2, leafC);
        detail.box(px0, px1, dy1 - 0.91, dy1 - 0.21, z - 0.27, z + 0.27, paneC);
      } else {
        // two sliding leaves with a seam between them, each with its own window
        const leaf = (dw - 0.04) / 2;
        for (const k of [-1, 1]) {
          const zc = z + (k * (leaf + 0.04)) / 2;
          detail.box(lx0, lx1, dy0, dy1, zc - leaf / 2, zc + leaf / 2, leafC);
          detail.box(px0, px1, dy1 - 0.95, dy1 - 0.18, zc - leaf * 0.34, zc + leaf * 0.34, paneC);
        }
      }
      const marker = new THREE.Object3D();
      marker.name = crew ? 'crew-door' : 'door';
      marker.position.set(x(half), (dy0 + dy1) / 2, z);
      marker.userData = { side, index: di, width: dw, height: dy1 - dy0 };
      group.add(marker);
    }
  });

  // passenger windows: a dark gasket, the glass, and a pale reflection along its top
  const [wy0, wy1] = spec.windowY;
  const gasket = col(0x0d0e10);
  const sky = col(blend(def.window, 0xa9bdd6, 0.3));
  for (const [s0, s1] of plan.windows) {
    const za = Math.min(Z(s0), Z(s1));
    const zb = Math.max(Z(s0), Z(s1));
    for (const sx of [-1, 1]) {
      const outer = (rel: number): number => sx * (half - rel);
      detail.prismX(roundedRect(za - 0.03, zb + 0.03, wy0 - 0.03, wy1 + 0.03, 0.1, 2), sx * (W - 0.005), outer(0.016), gasket);
      detail.emit = 1; // the glass of a passenger window is lit warm after dark (train-geom.ts `trainNight`)
      detail.prismX(roundedRect(za, zb, wy0, wy1, 0.08, 2), sx * (W - 0.005), outer(0.012), paneC, false);
      detail.emit = 0;
      detail.prismX(roundedRect(za + 0.04, zb - 0.04, wy1 - 0.26, wy1 - 0.03, 0.05, 2), outer(0.0125), outer(0.0115), sky, false);
    }
  }

  // decals: lettering and solid patches, laid on each side so the words read left to right from outside
  for (const item of def.decals(carInfo)) pushDecal(decals, item, W, Z, dir, plan);
  // `plan` is only used to keep the door list in one place
  void BAND_Y;

  // one shell material per livery and family: a through car reads only the texture's last column, so the nose length does not matter to it
  const shellMesh = new THREE.Mesh(shell.build(), shellMaterialFor(ctx.kind, spec.nose.length));
  shellMesh.name = 'body-shell';
  const detailMesh = new THREE.Mesh(detail.build(), plain());
  detailMesh.name = 'body-detail';
  group.add(shellMesh, detailMesh);
  if (decals.pos.length) {
    const m = new THREE.Mesh(decals.build(), decalMaterial());
    m.name = 'livery-decals';
    group.add(m);
  }
  if (glass.pos.length) {
    const m = new THREE.Mesh(glass.build(), glassMaterial());
    m.name = 'cab-glass';
    group.add(m);
  }

  const fig = spec.family === 'at300' ? null : EMU_FIGURES[spec.family as EmuFamily];
  car.bogies.forEach((z, k) => {
    const radius = fig ? fig.wheelDiameter.value / 2 : FIGURES.wheelDiameter.value / 2;
    const motor = (car.motor as readonly boolean[])[k] as boolean;
    const wheelbase = fig ? (motor ? fig.wheelbaseMotor.value : fig.wheelbaseTrailer.value) : FIGURES.bogieWheelbase.value;
    const b = buildBogie({ radius, wheelbase, track: FIGURES.gauge.value, motor, diesel: spec.family === 'adelante', style: BOGIE_STYLE[spec.family] });
    b.name = `bogie-${car.index}-${k}`;
    b.position.set(0, 0, z);
    group.add(b);
  });
  if (car.pantograph) {
    const len = fig?.pantographLength?.value ?? FIGURES.pantographLength.value;
    const p = buildPantograph(len, spec.pantographTop);
    p.position.set(0, spec.crown, (car.pantograph[0] + car.pantograph[1]) / 2);
    group.add(p);
  }
  return group;
}

/** Mix two colours, `t` of the second. */
function blend(a: number, b: number, t: number): number {
  const ch = (n: number, sh: number): number => (n >> sh) & 255;
  const m = (sh: number): number => Math.round(lerp(ch(a, sh), ch(b, sh), t));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/**
 * One decal on both sides of the car. `s` is along the car from its cab end (cab car) or start; the shell stands at
 * x = +-W, and the decal a few millimetres out from it. Words are laid so they read left to right from outside:
 * on the left side (x < 0) the viewer's right is +z, on the right side it is -z.
 */
function pushDecal(soup: Soup, item: DecalItem, W: number, Z: (s: number) => number, dir: number, _plan: CarPlan): void {
  const [s0, y0, s1raw, y1] = item.rect;
  const em = y1 - y0;
  const s1 = item.text ? s0 + textEms(item.text) * em : s1raw;
  const skew = item.skew ?? 0;
  const a = atlasRect(item.text);
  const c = col(item.colour);
  for (const sx of [-1, 1]) {
    const x = sx * (W + 0.004);
    // corners in car-s, bottom then top; the top row is shifted by the skew
    const pts: [number, number, number][] = [[s0, y0, 0], [s1, y0, 1], [s1 + skew, y1, 1], [s0 + skew, y1, 0]];
    const verts = pts.map(([s, y]): V3 => [x, y, Z(s)]);
    // texture u runs with the lettering; it increases toward the viewer's right
    const rightIsPlusZ = sx < 0;
    const uvs = pts.map(([, y, t], k): [number, number] => {
      const alongZ = (dir > 0 ? t : 1 - t) * (rightIsPlusZ ? 1 : -1) + (rightIsPlusZ ? 0 : 1);
      void k;
      return [lerp(a.u0, a.u1, alongZ), y === y0 ? a.v0 : a.v1];
    }) as [[number, number], [number, number], [number, number], [number, number]];
    const n: V3 = [sx, 0, 0];
    soup.quad(verts as [V3, V3, V3, V3], [n, n, n, n], c, uvs);
  }
}

// --- the train ---------------------------------------------------------------------------------

export function buildTrain(kind: TrainKind): THREE.Group {
  const layout = trainLayout(kind);
  const spec = BODIES[layout.spec.family];
  const def = liveryFor(kind);
  const front: FrontSpec = { ...spec.front, ...FRONT_OVERRIDES[kind] };
  const root = new THREE.Group();
  root.name = `train-${kind}`;
  root.userData = { kind, length: layout.length, cars: layout.cars.length, family: layout.spec.family };
  for (const car of layout.cars) root.add(buildCar(car, { spec, front, def, kind, layout }));
  return root;
}

/** Stand a built train nose-in at a buffer stop, body along the shed's tracks to the north. Returns the nose in world metres. */
export function standTrain(group: THREE.Group, shed: Pick<ShedLayout, 'heading'>, stop: { x: number; z: number }, noseGap: number): [number, number, number] {
  const pose = standingTrainPose(shed, stop, noseGap);
  group.position.set(pose.nose[0], 0, pose.nose[1]);
  group.rotation.y = pose.rotationY;
  group.updateMatrixWorld(true);
  return [pose.nose[0], 0, pose.nose[1]];
}

/** The body spec of a family, for tests and the dev page. */
export const bodySpec = (family: Family): Readonly<BodySpec> => BODIES[family];
