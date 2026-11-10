// The Edinburgh Waverley electric units as three.js models: ScotRail's Class 334 Juniper and TransPennine Express's Class 397 Nova 2.
// Their own builder (the EMR pattern): they are not King's Cross kinds and share none of train.ts's body specs, only its parts (bogies,
// pantograph, coupler, bellows), its geometry helpers and its lamp-state convention, so setTrainLampState switches their lamps too.
//
// How a car is made: a lofted shell (rings along the car through a section with a fine wall), each quad coloured by where it stands
// (`paint`: the livery in metres from the cab tip and above the rail head), then doors, windows, the cab's face or lamps, the gangways,
// roof and running gear. Every size not in core/train-wv-emu.ts is read off a named photograph (ASSUMED unless a comment says how it was
// measured); the review photographs are private and never shipped.
import * as THREE from 'three';
import { WV_EMU_FIGURES, WV_EMU_SPECS, wvEmuLayout } from '../../core/train-wv-emu.ts';
import type { WvEmuCar, WvEmuFamily, WvEmuKind, WvEmuLayout } from '../../core/train-wv-emu.ts';
import type { CaptureFormation } from './edinburgh-fleet.ts';
import { lensLook, SERVICE_LAMPS } from './train.ts';
import type { LensRole } from './train.ts';
import { BEZEL, boxOutline, discOutline, barOutline, PANE_SEAL, PANE_SKY_HI, PANE_SKY_MID, RECESS, WIPER } from './train-face.ts';
import { clipConvex, col, cross, glassMaterial, gridNormals, lerp, plain, roundedRect, Soup, sub, unit } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, ringAt, ringStations, xAtY, yAtX } from './train-nose.ts';
import type { NoseSpec, Section } from './train-nose.ts';
import { couplerHalf, roofKit, roofKitSpan } from './train-parts.ts';
import { buildCafBogie, buildJuniperBogie, buildWvPantograph, CLUSTER_SPAN, juniperCoupler, ribbedBellows, roofEndCluster, splitTri, starOutline } from './train-wv-emu-parts.ts';
import type { Look } from './train-wv-emu-parts.ts';
import type { CouplerStyle } from './train-parts.ts';

/** Half the gap between two bodies, metres: the same 0.35 m as the King's Cross kinds (ASSUMED there too). */
export const WV_END_GAP = 0.35;
/** A passenger door stands this far proud of the body's wall, so the doors set the body's width. */
const DOOR_RELIEF = 0.02;
const COUPLER_Y = 0.85;
/** The Nova 2's door window: half its width, how far above the door's foot it starts and below its head it stops (tpe397-02; ASSUMED). */
const DOOR_GLASS = { half: 0.3, foot: 0.62, head: 0.16 } as const;
/** The 334's hopper pane: its depth from the window's head (scotrail334_01, _02; ASSUMED). */
const HOPPER = 0.32;

// --- colours (read off the photographs; shades approximate) -------------------------------------------------

/** ScotRail's saltire blue (scotrail334_05 and _06 under the Waverley roof, _02 in sun): a deep blue-violet. */
export const SR_BLUE = 0x232f6c;
/** The slate cap over a 334's cab (scotrail334_05, _06: a lighter grey-blue than the body, round the horn disc and the two grilles). */
export const SR_CAP = 0x6a7590;
export const SR_ROOF = 0x3d4354;
export const SR_YELLOW = 0xf0c21a;
/** The thin orange line along the cantrail and across the top of the screens (scotrail334_05, _06). */
export const SR_ORANGE = 0xe0682c;
/** The halftone dots of the saltire on the cab side (scotrail334_05, _06): white. */
export const SR_DOT = 0xe6eaef;
/** The 334's sliding door leaves: a light silver-grey (scotrail334_02, _06). */
export const SR_DOOR = 0xaeb3ba;
/** TPE's Nova 2: a silver body, the cab's bright cyan, a navy swoosh and a purple foot (tpe397-01, -04, -05). */
export const TPE_SILVER = 0xc2c6cb;
export const TPE_CYAN = 0x1aa6db;
export const TPE_NAVY = 0x1b2b62;
export const TPE_PURPLE = 0x6a2c72;
/** The near-black mask round the Nova 2's screen and down its face (tpe397-01, -05, -06). */
export const TPE_MASK = 0x24272d;
export const TPE_ROOF = 0xaeb2b7;
export const TPE_DOOR = 0x5b6067;
const UNDER = 0x26282c;
const WALL = 0x2d3035;

// --- the two bodies ---------------------------------------------------------------------------------------

interface CarPlan {
  doors: number[];
  windows: [number, number][];
  crewDoor: number | null;
}

interface Body {
  family: WvEmuFamily;
  half: number;
  floor: number;
  wallTop: number;
  crown: number;
  coverHeight: number;
  nose: NoseSpec;
  /** the face stands this far behind the car's end (an uncovered coupler reaches the end from it) */
  tip: number;
  coupler: { style: CouplerStyle; covered: boolean };
  doorWidth: number;
  doorLeaves: 1 | 2;
  doorY: [number, number];
  windowY: [number, number];
  door: number;
  window: number;
  roof: number;
  cover: number;
  /** the family's own bogie, from train-wv-emu-parts */
  bogie: 'caf' | 'juniper';
  /**
   * the gangway: its opening (width, height, foot), and its ribbed bellows (train-wv-emu-parts ribbedBellows): how far inside the end's outline and under the
   * crown it keeps, its ribs on each car's half of the gap, and how far each rib stands proud
   */
  gangway: { width: number; height: number; bottom: number; inset: number; topGap: number; ribs: number; depth: number };
  /** the nose's ring spacing behind its rounded front edge, where it differs from train-nose's 0.07 m (round 5: the 397's, to pay for its bogie) */
  noseStep?: number;
  /** the shell's ring spacing along the car where the livery changes along it (0: none needed) */
  liveryStep: (car: WvEmuCar) => { until: number; step: number };
  /** heights where a thin horizontal band of the livery begins or ends: the section gets a point at each */
  cuts: readonly number[];
  plan: (car: WvEmuCar) => CarPlan;
}

/** `n` windows spaced in [from, to] with piers `pier` between them, n chosen from the pitch. */
function windowsIn(from: number, to: number, pitch: number, pier: number): [number, number][] {
  const n = Math.max(1, Math.round((to - from) / pitch));
  const p = (to - from) / n;
  return Array.from({ length: n }, (_, k): [number, number] => [from + k * p + pier / 2, from + (k + 1) * p - pier / 2]);
}

const JF = WV_EMU_FIGURES.juniper;
const CF = WV_EMU_FIGURES.civity;

/**
 * The Class 334. A near-upright face (scotrail334_05 head on, _06 and _04 three-quarter): two screens either side of a slim pillar under a slate cap, a yellow panel under them
 * between two black lamp pods that wrap the corners, a blue bumper with the coupler standing out of a recess, two dark blocks under it. The cab's flank is short: the crew door
 * sits about 2 m behind the face. All face sizes ASSUMED, read off _05 against the assumed 2.80 m width.
 */
const JUNIPER_BODY: Body = {
  family: 'juniper',
  half: JF.bodyWidth.value / 2,
  floor: JF.floorHeight.value - 0.12,
  wallTop: 3.05,
  crown: JF.height.value - 0.12,
  coverHeight: 0.12,
  nose: {
    length: 1.5,
    knots: [
      { s: 0, top: 3.48, ws: 0.9, bottom: 0.5 },
      { s: 0.15, top: 3.56, ws: 0.95, bottom: 0.55 },
      { s: 0.5, top: 3.62, ws: 0.99, bottom: 0.75 },
      { s: 1.0, top: 3.64, ws: 1, bottom: 0.9 },
      { s: 1.5, top: JF.height.value - 0.12, ws: 1, bottom: JF.floorHeight.value - 0.12 },
    ],
    fillet: 0.22,
    filletLoss: 0.07,
    filletSteps: 9,
    roundLen: 1.1,
    widest: 0.45,
    boxiness: 3.4,
  },
  tip: WV_END_GAP,
  coupler: { style: 'scharfenberg', covered: false },
  doorWidth: 1.3,
  doorLeaves: 2,
  doorY: [1.12, 2.98],
  // ASSUMED, read off scotrail334_01 and _02: tall windows with a hopper pane across the top (see HOPPER), the sill about 1.5 m up
  windowY: [1.5, 2.72],
  door: SR_DOOR,
  window: 0x222b3a,
  roof: SR_ROOF,
  cover: 0x4a5062,
  // the 334's own outside-frame bogie, built from scotrail334_07 (train-wv-emu-parts buildJuniperBogie)
  bogie: 'juniper',
  // a narrow bellows, kept 0.12 m inside the end's outline and 0.3 m under the crown, so it sits within the roof line (scotrail334_01, _02; sizes ASSUMED).
  // (round 4: four deeper ribs a car, eight across the gap, so they read from the side)
  gangway: { width: 1.9, height: 2.2, bottom: 1.15, inset: 0.12, topGap: 0.3, ribs: 4, depth: 0.05 },
  liveryStep: (car) => ({ until: car.length, step: 0.5 }),
  cuts: [3.29, 3.33],
  // ASSUMED, read off scotrail334_01 and _02 (window and door counts; spacings scaled along the car): a driving car has the crew door 2.25 m behind the face, three windows,
  // a door at 9 m, five windows, a door 3.8 m from the inner end and two windows; the middle car a door 3.8 m in from each end, eight windows between, two beyond each
  plan: (car) => {
    const L = car.length;
    const dw = 1.3;
    const gap = WV_END_GAP;
    if (car.cab) {
      const d1 = 9.0;
      const d2 = L - 3.8;
      // (scotrail334_01, _02: two tall windows between the Saltire and the first door, five between the doors, two beyond the second)
      return {
        crewDoor: 2.25,
        doors: [d1, d2],
        windows: [...windowsIn(4.6, d1 - dw / 2 - 0.3, 1.45, 0.4), ...windowsIn(d1 + dw / 2 + 0.3, d2 - dw / 2 - 0.3, 1.25, 0.4), ...windowsIn(d2 + dw / 2 + 0.3, L - gap - 0.95, 1.05, 0.35)],
      };
    }
    const d1 = 3.8;
    const d2 = L - 3.8;
    // the PTOS's front end carries the Saltire, not windows (scotrail334_01)
    return {
      crewDoor: null,
      doors: [d1, d2],
      windows: [...windowsIn(d1 + dw / 2 + 0.3, d2 - dw / 2 - 0.3, 1.3, 0.42), ...windowsIn(d2 + dw / 2 + 0.3, L - gap - 0.95, 1.05, 0.35)],
    };
  },
};

/**
 * The Nova 2's face, by height above the rail head and by u (the fraction of the ring's half-width out from the middle), read off tpe397-01 (head on) and -05 (three-quarter),
 * against the assumed 3.80 m height and 2.75 m width; all ASSUMED:
 *   hood     a dark cap over the display, from 3.36 m up, with the marker lamp in its peaked surround at its middle;
 *   display  black, 3.15 to 3.33 m, the destination lit amber across its middle;
 *   line     a thin orange line over the screen;
 *   screen   one broad pane, 2.15 to 3.08 m, out to u 0.7, in a dark frame;
 * (round 4: the screen's head, the display and the marker were lowered 0.12 m so all three stand on the cap's upright face; see the nose's knots)
 *   band     the dark mask below the screen, narrowing down to the white star at 1.5 m;
 *   lamps    an angular dark housing each side, 1.62 to 2.04 m, the round headlight outboard and a block of LEDs (the tail lamp) inboard;
 *   mouth    the dark coupler cover low on the front, 0.72 to 1.38 m, in a cyan bumper over a navy foot.
 */
const NOVA = {
  hood: 3.375, display: [3.14, 3.34], screen: [2.15, 3.08], screenU: 0.7, frameU: 0.78,
  band: [1.45, 2.08], lamps: [1.62, 2.04], mouth: [0.72, 1.38], mouthHalf: 0.62, navy: 0.6, star: 1.55,
} as const;
/** The 397 cab side's cyan: where its back edge meets the sill (metres from the tip) and how far back it leans per metre up (tpe397-05: past the first passenger door). */
export const CAB_CYAN = { foot: 8.0, lean: 1.6 } as const;
/** The two navy diagonals on the 397's cab side, (s, y) end points and half-thickness: both rise back across the crew door (4.1 m) and the first door (7 m). */
export const CAB_DIAGONALS = [
  { from: [1.2, 0.9], to: [9.4, 2.85], half: 0.1 },
  { from: [3.6, 1.1], to: [11.2, 3.0], half: 0.075 },
] as const satisfies readonly { from: readonly [number, number]; to: readonly [number, number]; half: number }[];
/**
 * The destination display, a wide band across the cap in a mid-grey frame (tpe397-01, close to): nearly the screen's width at its foot, narrowing to its head
 * (its ends lean in), the lit text across its middle. Half-widths as u at the foot and the head, the text's, the frame's width. ASSUMED, read off -01.
 */
const DISPLAY = { foot: 0.69, head: 0.6, text: 0.34, frame: 0.025, colour: 0x4b5058 } as const;
/** The coupler cover: a flush dark-grey panel in the bumper (tpe397-01, -05), and the slightly lighter seam round it. */
const MUZZLE = { colour: 0x3e434a, seam: 0x5f656d } as const;
/**
 * The marker lamp's housing on the cap over the display (tpe397-01, close to): a dark panel standing on the display's frame, its sides leaning in to a
 * narrower top, a pale rim along the top and down both sides, the round lamp in it. Half-widths in metres at its foot and its top. ASSUMED, read off -01.
 * (Round 4 drew a downward point; the photograph shows the housing widest at its foot.)
 */
export const MARKER = { foot: 3.365, top: 3.54, footHalf: 0.3, topHalf: 0.13, rim: 0.028, colour: 0xaab0b7, lampY: 3.45, lampR: 0.055 } as const;
/** A lamp housing ("eye"): from u0 to u1 across the face, its foot rising outboard by `rise` (tpe397-01: the outer end stands higher), `height` tall. ASSUMED sizes. */
const EYE = { u0: 0.36, u1: 0.88, foot: 1.62, rise: 0.24, height: 0.3 } as const;
const eyeFoot = (u: number): number => EYE.foot + (EYE.rise * (u - EYE.u0)) / (EYE.u1 - EYE.u0);

/**
 * The Class 397. A rounded, fairly upright face (tpe397-01, -04, -05, -06): the bumper stands furthest forward, the face leans back above it, steepest over the screen, and meets
 * the roof about 3 m behind the bumper (read off -05's side-on profile; ASSUMED). The cab side window is a dark slanted pane behind the screen, the crew door behind it.
 */
const CIVITY_BODY: Body = {
  family: 'civity',
  half: CF.bodyWidth.value / 2,
  floor: CF.floorHeight.value - 0.15,
  wallTop: 3.0,
  crown: CF.height.value - 0.16,
  coverHeight: 0.16,
  nose: {
    length: 3.4,
    knots: [
      { s: 0, top: 1.38, ws: 0.74, bottom: 0.42 },
      { s: 0.25, top: 1.62, ws: 0.83, bottom: 0.38 },
      { s: 0.5, top: 1.86, ws: 0.89, bottom: 0.38 },
      { s: 0.85, top: 2.2, ws: 0.935, bottom: 0.42 },
      { s: 1.4, top: 2.72, ws: 0.968, bottom: 0.5 },
      { s: 1.9, top: 3.16, ws: 0.987, bottom: 0.6 },
      // (round 4: the cap over the screen stands upright, as tpe397-01 shows it: it climbs from the screen's head to the marker's top in about 0.3 m, so
      // the framed display and the marker's peaked surround stand on a face, not on the crest; then it rounds over into the roof)
      { s: 2.0, top: 3.36, ws: 0.99, bottom: 0.63 },
      { s: 2.1, top: 3.5, ws: 0.992, bottom: 0.65 },
      { s: 2.2, top: 3.585, ws: 0.994, bottom: 0.67 },
      { s: 2.45, top: 3.632, ws: 0.996, bottom: 0.72 },
      { s: 2.8, top: 3.64, ws: 0.999, bottom: 0.8 },
      { s: 3.4, top: CF.height.value - 0.16, ws: 1, bottom: CF.floorHeight.value - 0.15 },
    ],
    fillet: 0.22,
    filletLoss: 0.1,
    roundLen: 2.8,
    widest: 0.45,
    boxiness: 3.0,
  },
  tip: 0.01,
  noseStep: 0.1,
  coupler: { style: 'dellner', covered: true },
  doorWidth: 1.0,
  doorLeaves: 1,
  doorY: [1.17, 2.98],
  // DRAWN from tpe397-02 (side on) against the assumed 3.80 m roof: the sill about 1.0 m, the windows 1.82 to 2.72 m, the cantrail about 3.0 m
  windowY: [1.82, 2.72],
  door: TPE_DOOR,
  window: 0x26313c,
  roof: TPE_ROOF,
  cover: 0x9ea3a9,
  // CAF's inside-frame bogie, built from tpe397-03 (train-wv-emu-parts buildCafBogie)
  bogie: 'caf',
  // the Civity's wide bellows: nearly the body's width, from below the floor to just under the roof, deep rounded ribs standing proud (tpe397-02; sizes ASSUMED)
  // (round 4: five ribs a car, ten across the gap as -02 shows about ten, each 9 cm proud; the half-width kept 0.1 m inside the body so the crests stay within it)
  gangway: { width: 2.52, height: 2.59, bottom: 0.95, inset: 0.03, topGap: 0.12, ribs: 5, depth: 0.09 },
  // (0.6 m rings on every car: the livery is cut along its edges, so the rings no longer have to be fine where it changes; the cab car's 0.4 m rings
  // put it over the triangle budget once its diagonals ran back past the first door)
  // (round 4: on a cab car the rings are fine only as far back as the livery changes along the car, the cyan's raked edge and the diagonals ending about
  // 11.2 m from the tip; behind that the side is silver with horizontal lines, which are points of the section, so coarse rings draw it exactly)
  liveryStep: (car) => ({ until: car.cab ? 12.5 : car.length, step: 0.6 }),
  cuts: [1.07, 3.04, 3.08],
  // ASSUMED, from window and door counts in tpe397-01, -02, -04, -05: single-leaf plug doors at both ends of every car (about 1.55 m in); a driving car has the crew door 4.1 m
  // from the tip, its first door at 7 m and six large windows; an intermediate car a blank panel (the "COACH" display) of about 2 m at one end and ten windows
  plan: (car) => {
    const L = car.length;
    const dw = 1.0;
    if (car.cab) {
      const d1 = 7.0;
      const d2 = L - 1.55;
      // the two cab cars differ (ASSUMED layouts; the role codes are Eversholt's): the DMFLW's first-class saloon has six large windows, as on the leading car in
      // tpe397-05; the DMSL's standard saloon has the intermediate cars' narrower pitch, and a windowless toilet bay by its inner door
      if (car.type === 'DMFLW') return { crewDoor: 4.1, doors: [d1, d2], windows: windowsIn(d1 + dw / 2 + 0.35, d2 - dw / 2 - 0.45, 2.3, 0.42) };
      return { crewDoor: 4.1, doors: [d1, d2], windows: windowsIn(d1 + dw / 2 + 0.4, d2 - dw / 2 - 2.2, 1.65, 0.38) };
    }
    const d1 = 1.55;
    const d2 = L - 1.55;
    // the blank panel is at the pantograph's end (tpe397-02); on a car with no pantograph, at its front
    const blankAtEnd = car.pantograph !== null && (car.pantograph[0] + car.pantograph[1]) / 2 > (car.start + car.end) / 2;
    const from = blankAtEnd ? d1 + dw / 2 + 0.4 : d1 + dw / 2 + 2.4;
    const to = blankAtEnd ? d2 - dw / 2 - 2.4 : d2 - dw / 2 - 0.4;
    return { crewDoor: null, doors: [d1, d2], windows: windowsIn(from, to, 1.65, 0.38) };
  },
};

const BODIES: Readonly<Record<WvEmuFamily, Body>> = { juniper: JUNIPER_BODY, civity: CIVITY_BODY };
export const wvEmuBody = (kind: WvEmuKind): Readonly<Body> => BODIES[WV_EMU_SPECS[kind].family];
/** The plan of one car of a kind: door and window positions in metres from its cab end (a cab car) or its start. */
export const wvEmuPlan = (kind: WvEmuKind, car: WvEmuCar): CarPlan => wvEmuBody(kind).plan(car);

/** A section with a fine wall and crown, so the livery's edges (quads coloured by where they stand) are drawn finely across the side and the roof. */
export function wvSection(b: Pick<Body, 'half' | 'floor' | 'wallTop' | 'crown' | 'cuts'>): Section {
  const sec = baseSection(b);
  // a point of the outline at each livery height the body names (where a thin horizontal band begins or ends), so the band is an edge of the shell
  const half = [...sec.half];
  for (const y of b.cuts) {
    for (let k = 0; k + 1 < half.length; k++) {
      const a = half[k] as [number, number];
      const c = half[k + 1] as [number, number];
      if (Math.abs(a[1] - y) < 0.004 || Math.abs(c[1] - y) < 0.004) break;
      if (a[1] < y && c[1] > y) {
        const t = (y - a[1]) / (c[1] - a[1]);
        half.splice(k + 1, 0, [lerp(a[0], c[0], t), y]);
        break;
      }
    }
  }
  return { ...sec, half };
}

function baseSection(b: Pick<Body, 'half' | 'floor' | 'wallTop' | 'crown'>): Section {
  const W = b.half - DOOR_RELIEF;
  const half: [number, number][] = [[W - 0.15, b.floor], [W - 0.03, b.floor + 0.07]];
  const w0 = b.floor + 0.2;
  const nWall = Math.ceil((b.wallTop - w0) / 0.1);
  for (let i = 0; i <= nWall; i++) half.push([W, lerp(w0, b.wallTop, i / nWall)]);
  const rx = 0.55;
  const ry = b.crown - b.wallTop - 0.012;
  for (let j = 1; j <= 8; j++) {
    const phi = (j / 8) * (Math.PI / 2);
    half.push([W - rx + rx * Math.cos(phi), b.wallTop + ry * Math.sin(phi)]);
  }
  const x0 = W - rx;
  const n = Math.ceil(x0 / 0.12);
  for (let i = 1; i <= n; i++) {
    const x = x0 * (1 - i / n);
    half.push([x, b.crown - 0.012 * (x / x0) ** 2]);
  }
  return { half, width: W, floor: b.floor, crown: b.crown };
}

// --- the livery: the colour of the shell at a point -------------------------------------------------------

/** What `paint` knows of the point: s from the cab tip (cab car) or the car's start, height, |x|, and its place across the nose's ring (u: 0 at the middle, 1 at the widest). */
interface Spot { s: number; y: number; ax: number; u: number; top: boolean; car: WvEmuCar; L: number }
type Paint = { colour: number } | { glass: true };

/** A line between two (s, y) points, as y at s. */
const lineY = (a: readonly [number, number], b: readonly [number, number], s: number): number => a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0]);

function paintJuniper(p: Spot, b: Body): Paint {
  const nose = b.nose.length;
  if (p.y < b.floor + 0.02) return { colour: UNDER };
  // the orange line along the cantrail, 4 cm (its edges are points of the section: JUNIPER_BODY.cuts); the cap's slate over it round the cab's top, the roof's grey behind
  if (p.y >= 3.29 && p.y <= 3.33) return { colour: SR_ORANGE };
  if (p.y > 3.33) return { colour: p.car.cab && p.s < nose + 0.6 ? SR_CAP : SR_ROOF };
  return { colour: SR_BLUE };
}

/**
 * The Saltire X of the 2014-2025 ScotRail scheme as scotrail334_01 (2016) shows it: a pale X the height of the side, standing clear of the windows (drawn as
 * two flat bars on the wall, buildCar). ASSUMED: its size and place, read off that photograph's perspective; on the PTOS between its front end and its first
 * door, on a driving car between the crew door's dots and its first windows.
 */
export const SALTIRE = { y0: 1.2, y1: 3.0, half: 0.5, bar: 0.13 } as const;
export const SR_SALTIRE = 0xb7c0de;
/** Where the X is centred along a car: from the cab tip on a driving car, from the start on the PTOS. */
export const saltireAt = (car: WvEmuCar): number => (car.cab ? 3.85 : 2.4);

function paintCivity(p: Spot, b: Body): Paint {
  const nose = b.nose.length;
  if (p.car.cab) {
    const s = p.s;
    const { y, u } = p;
    // the face (the front of the nose, not its flanks; see NOVA)
    if (s < nose && u < 0.9 && (p.top || y > NOVA.mouth[0])) {
      // the marker lamp's housing over the display (see MARKER): painted on the cap, so it follows the surface
      if (y <= MARKER.top && y >= MARKER.foot && s < nose - 0.4) {
        const w = MARKER.footHalf + ((MARKER.topHalf - MARKER.footHalf) * (y - MARKER.foot)) / (MARKER.top - MARKER.foot);
        if (p.ax <= w) return { colour: y < MARKER.top - MARKER.rim && p.ax <= w - MARKER.rim ? 0x1a1c20 : MARKER.colour };
      }
      if (y > NOVA.hood) return { colour: u < 0.8 && s < nose - 0.4 ? TPE_MASK : TPE_ROOF };
      // over the screen (tpe397-01): the dark hood up to the roof, in it the destination display in a frame of its own, under the marker's housing. (The
      // thin orange line along the screen frame's top is a strip laid on the face, below: painted, a 2 cm band fell between the shell's points at the cap's
      // corners and broke into dashes.)
      if (y > NOVA.screen[1] + 0.035 && u < 0.8) {
        const [d0, d1] = NOVA.display;
        const du = (yy: number): number => DISPLAY.foot + ((DISPLAY.head - DISPLAY.foot) * (Math.min(d1, Math.max(d0, yy)) - d0)) / (d1 - d0);
        if (y > d0 && y < d1 && u < du(y)) return { colour: u < DISPLAY.text && y > d0 + 0.05 && y < d1 - 0.05 ? 0xe39a1c : 0x111317 };
        if (y > d0 - DISPLAY.frame && y < d1 + DISPLAY.frame && u < du(y) + DISPLAY.frame) return { colour: DISPLAY.colour };
        return { colour: TPE_MASK };
      }
      if (y > NOVA.screen[0] && y <= NOVA.screen[1] && u < NOVA.screenU) return { glass: true };
      if (y > NOVA.screen[0] - 0.07 && y <= NOVA.screen[1] + 0.035 && u < NOVA.frameU) return { colour: TPE_MASK };
      // the V: the mask narrowing from the screen's foot to the star
      if (y > NOVA.band[0] && u < 0.16 + 0.55 * (y - NOVA.band[0])) return { colour: TPE_MASK };
      // the lamps' housings: angled eyes, rising outboard (tpe397-01, -05)
      if (u > EYE.u0 && u < EYE.u1) {
        const lo = eyeFoot(u);
        if (y > lo && y < lo + EYE.height) return { colour: TPE_MASK };
      }
      return { colour: y < NOVA.navy ? TPE_NAVY : TPE_CYAN };
    }
    if (p.y > b.wallTop + 0.25 && s > nose - 0.4) return { colour: TPE_ROOF };
    if (p.y < b.floor + 0.02) return { colour: UNDER };
    // the cab side window: a dark pane behind the screen, leaning back with the face (tpe397-05: its top edge further back than its foot), in a navy surround
    const front = 2.0 + (p.y - 2.0) * 0.6;
    if (p.y > 2.0 && p.y < 2.95 && s > front && s < front + 1.15) return { colour: 0x141921 };
    if (p.y > 1.93 && p.y < 3.02 && s > front - 0.08 && s < front + 1.23) return { colour: TPE_NAVY };
    // the purple foot; the cyan of the cab running back past the first passenger door, its back edge leaning back toward the top; two navy diagonals rising
    // back across the crew door and the first passenger door to the cyan's edge (tpe397-05; positions ASSUMED, read off its perspective). Silver behind.
    if (s > 0.6 && s < 9.6 && p.y < 0.62 + 0.42 * Math.sin((Math.PI * Math.min(1, (s - 0.6) / 9.0)))) return { colour: TPE_PURPLE };
    const cyanEdge = CAB_CYAN.foot + (p.y - 1.07) * CAB_CYAN.lean;
    if (s > 0.6 && s < cyanEdge) {
      for (const d of CAB_DIAGONALS) if (Math.abs(p.y - lineY(d.from, d.to, s)) < d.half) return { colour: TPE_NAVY };
    }
    if (s < 0.6 && p.y < 0.75) return { colour: TPE_NAVY };
    if (s < cyanEdge) return { colour: TPE_CYAN };
    if (p.y > 3.04 && p.y < 3.08) return { colour: 0xd0603a };
    if (p.y < 1.07) return { colour: 0x878c93 };
    return { colour: TPE_SILVER };
  }
  // an intermediate car (tpe397-02): silver, a purple triangle low between the doors, cyan streaks over and under the windows toward one end, the thin cantrail line and grey sill
  const t = p.s / p.L;
  if (p.y > b.wallTop + 0.25) return { colour: TPE_ROOF };
  if (p.y < b.floor + 0.02) return { colour: UNDER };
  if (p.y < 1.07) return { colour: 0x878c93 };
  const apex = 0.56;
  const rise = t < apex ? (t - 0.36) / (apex - 0.36) : (0.82 - t) / (0.82 - apex);
  // (tpe397-05: the triangle's peak about at the windows' foot)
  if (rise > 0 && p.y < 1.07 + 0.72 * rise) return { colour: TPE_PURPLE };
  if (p.y > 2.76 && p.y < 3.0 && t > 0.6 && t < 0.62 + 0.26 * (1 - (p.y - 2.76) / 0.24)) return { colour: TPE_CYAN };
  if (p.y > 1.12 && p.y < 1.42 && t > 0.72 + 0.1 * ((p.y - 1.12) / 0.3) && t < 0.95) return { colour: TPE_CYAN };
  if (p.y > 3.04 && p.y < 3.08) return { colour: 0xd0603a };
  return { colour: TPE_SILVER };
}

const PAINT: Readonly<Record<WvEmuFamily, (p: Spot, b: Body) => Paint>> = { juniper: paintJuniper, civity: paintCivity };

// --- the 334's flat face -----------------------------------------------------------------------------------

interface FaceShape {
  name: string;
  outline: readonly (readonly [number, number])[];
  lift: number;
  mirror?: boolean;
  inset?: number;
  colour?: number;
  glass?: true;
  lens?: LensRole;
}

/**
 * The 334's face, cab frame (x to the cab's right, y above the rail head), read off scotrail334_05 (head on, Waverley) and _04, _06; ASSUMED sizes:
 *   the cap       slate over the screens, the orange line along its foot;
 *   the screens   two panes 0.98 m wide, 2.36 to 3.26 m, a dark pillar between; the destination display under the top of the cab's right-hand pane; a wiper parked up each pane toward the pillar;
 *   the panel     yellow from the screens down to 1.42 m between the pods (a narrower strip to 1.3 m under it), a hatch outlined in it;
 *   the pods      black, wrapping the face's corners, each with three lenses one over another: the tail lamp, a marker, the headlight;
 *   the recess    the coupler's, dark, in the blue bumper.
 */
/**
 * A 334 lamp pod, the cab's right-hand one (mirrored for the left): flat across its top under the screen's corner, its inner edge bowing in toward the
 * middle, its foot rounded up into the outer corner, so it reads as the curved housing of scotrail334_05 and _07, not a box. The outer edge runs off the face
 * (the face's outline clips it). ASSUMED sizes, read off _05.
 */
function podOutline(): [number, number][] {
  const out: [number, number][] = [[1.7, 2.3], [0.98, 2.3]];
  for (let k = 1; k < 8; k++) {
    const t = k / 8;
    out.push([0.99 - 0.15 * Math.sin(Math.PI * t * 0.85), 2.3 - 0.75 * t]);
  }
  // the foot: a quarter ellipse from the inner edge's foot round to the outer edge
  const [cx, cy, rx, ry] = [1.3, 1.55, 0.4, 0.27];
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k / 6) * (Math.PI / 2);
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  out.push([1.7, 1.28]);
  return out;
}

/** The coupler's arched opening in the bumper (scotrail334_05, _07): straight sides from `foot` (the face's outline cuts it) up to `spring`, a round-topped arch `rise` over that. */
function archOutline(half: number, foot: number, spring: number, rise: number): [number, number][] {
  const out: [number, number][] = [[-half, foot], [half, foot]];
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * Math.PI;
    out.push([half * Math.cos(a), spring + rise * Math.sin(a)]);
  }
  return out;
}

const JUNIPER_FACE: readonly FaceShape[] = [
  { name: 'cap', outline: boxOutline(-1.5, 1.5, 3.33, 3.8), colour: SR_CAP, lift: 0.0015 },
  { name: 'brow-line', outline: boxOutline(-1.5, 1.5, 3.29, 3.33), colour: SR_ORANGE, lift: 0.0015 },
  { name: 'yellow-panel', outline: boxOutline(-1.02, 1.02, 1.42, 2.3), colour: SR_YELLOW, lift: 0.0015 },
  { name: 'yellow-foot', outline: boxOutline(-0.76, 0.76, 1.3, 1.43), colour: SR_YELLOW, lift: 0.0015 },
  { name: 'screen-frame', outline: boxOutline(-1.1, 1.1, 2.3, 3.29, 0.06), colour: PANE_SEAL, lift: 0.003, inset: 0.02 },
  { name: 'pane', outline: boxOutline(0.075, 1.05, 2.36, 3.25, 0.05), glass: true, lift: 0.0045, mirror: true, inset: 0.05 },
  { name: 'pillar', outline: boxOutline(-0.06, 0.06, 2.3, 3.29), colour: 0x2b2e35, lift: 0.0045 },
  { name: 'pane-sky-high', outline: boxOutline(0.075, 1.05, 3.12, 3.25), colour: PANE_SKY_HI, lift: 0.0075, mirror: true, inset: 0.05 },
  { name: 'pane-sky-mid', outline: boxOutline(0.075, 1.05, 2.96, 3.12), colour: PANE_SKY_MID, lift: 0.0075, mirror: true, inset: 0.05 },
  { name: 'display', outline: boxOutline(0.14, 0.86, 3.03, 3.2, 0.01), colour: 0x0d0e10, lift: 0.009 },
  { name: 'display-text', outline: boxOutline(0.2, 0.8, 3.09, 3.15), colour: 0xffa000, lift: 0.0105 },
  { name: 'wiper', outline: barOutline([0.66, 2.42], [0.18, 3.16], 0.035), colour: WIPER, lift: 0.0105, mirror: true },
  { name: 'hatch-seam-side', outline: boxOutline(0.6, 0.615, 1.78, 2.3), colour: 0x6b5a1a, lift: 0.003, mirror: true },
  { name: 'hatch-seam-foot', outline: boxOutline(-0.615, 0.615, 1.78, 1.795), colour: 0x6b5a1a, lift: 0.003 },
  { name: 'hatch-seam-mid', outline: boxOutline(-0.0075, 0.0075, 1.79, 2.3), colour: 0x6b5a1a, lift: 0.003 },
  { name: 'lamp-pod', outline: podOutline(), colour: BEZEL, lift: 0.006, mirror: true },
  // each lens in a bright metal ring (scotrail334_05)
  { name: 'tail-bezel', outline: discOutline(1.06, 2.1, 0.085), colour: 0x8d939b, lift: 0.0075, mirror: true },
  { name: 'marker-bezel', outline: discOutline(1.06, 1.87, 0.068), colour: 0x8d939b, lift: 0.0075, mirror: true },
  { name: 'head-bezel', outline: discOutline(1.05, 1.58, 0.118), colour: 0x8d939b, lift: 0.0075, mirror: true },
  { name: 'tail-lamp', outline: discOutline(1.06, 2.1, 0.065), lens: 'tail', lift: 0.009, mirror: true },
  { name: 'marker-lamp', outline: discOutline(1.06, 1.87, 0.05), lens: 'head', lift: 0.009, mirror: true },
  { name: 'headlight', outline: discOutline(1.05, 1.58, 0.095), lens: 'head', lift: 0.009, mirror: true },
  { name: 'coupler-recess', outline: archOutline(0.46, 0.2, 1.02, 0.3), colour: RECESS, lift: 0.003 },
];

// --- one car ---------------------------------------------------------------------------------------------

interface LampLens { role: LensRole; v0: number; v1: number }

function buildCar(car: WvEmuCar, layout: WvEmuLayout, b: Body): THREE.Group {
  const kind = layout.spec.kind;
  const family = layout.spec.family;
  const fig = WV_EMU_FIGURES[family];
  const group = new THREE.Group();
  group.name = `car-${car.index}`;
  group.userData = { index: car.index, type: car.type, start: car.start, end: car.end, length: car.length, bogies: [...car.bogies], cab: car.cab, kind, allocation: 'assumed fleet', source: layout.spec.source };
  const L = car.length;
  const sec = wvSection(b);
  const W = sec.width;
  const half = b.half;
  const norm = normalised(sec);
  const egg = eggSection(norm, b.nose.widest, b.nose.boxiness);
  const dir = car.cab === 'rear' ? -1 : 1;
  const base = car.cab === 'rear' ? car.end : car.start;
  const Z = (s: number): number => base + dir * s;
  // a rear cab's right hand is the train's left: the face's shapes are flipped with it
  const world = (p: V3): V3 => [p[0], p[1], Z(p[2])];
  const wn = (n: V3): V3 => [n[0], n[1], n[2] * dir];
  const tip = car.cab ? b.tip : WV_END_GAP;
  const bodyEnd = L - WV_END_GAP;
  const noseLen = car.cab ? b.nose.length : 0;
  const shell = new Soup();
  const detail = new Soup();
  const glass = new Soup();
  const lenses: LampLens[] = [];
  const plan = b.plan(car);
  const paint = PAINT[family];
  const ringHalf = (sn: number): [number, number][] => halfAt(sec, norm, egg, ringAt(b.nose, sn));

  // the rings: the nose's (cab cars), then finely through the stretch where the livery changes along the car, then coarsely to the far end
  // (the nose's rings as train-nose spaces them, about 0.07 m apart; a body with a `noseStep` keeps the fillet's rings and spaces the rest that far)
  const noseRings = (): number[] => {
    const all = ringStations(b.nose);
    if (!b.noseStep) return all;
    const fillet = all.filter((sn) => sn <= b.nose.fillet + 1e-9);
    const n = Math.max(1, Math.ceil((b.nose.length - b.nose.fillet) / b.noseStep));
    return [...fillet, ...Array.from({ length: n }, (_, k) => lerp(b.nose.fillet, b.nose.length, (k + 1) / n))];
  };
  const stations: number[] = car.cab ? noseRings().map((sn) => tip + sn) : [tip];
  const fine = b.liveryStep(car);
  let s = stations[stations.length - 1] as number;
  while (s < bodyEnd - 1e-6) {
    const step = s < fine.until ? fine.step : 1.5;
    s = Math.min(bodyEnd, s + step);
    stations.push(s);
  }
  const rings = stations.map((st) => {
    const sn = st - tip;
    const h = car.cab && sn < noseLen ? ringHalf(sn) : (sec.half as [number, number][]);
    return { s: st, pts: loopFromHalf(h) };
  });
  const P: V3[][] = rings.map((r) => r.pts.map(([x, y]): V3 => [x, y, r.s]));
  const N = gridNormals(P, true, (i) => {
    const ys = (rings[i] as { pts: [number, number][] }).pts.map((p) => p[1]);
    return [0, (Math.max(...ys) + Math.min(...ys)) / 2, (rings[i] as { s: number }).s];
  });
  const M = (rings[0] as { pts: [number, number][] }).pts.length;
  // the livery at any point of the shell (car frame: x, y, distance along the car from its base), and the shell cut along its edges (splitTri)
  const ringMemo = new Map<number, ReturnType<typeof ringAt>>();
  const ringNear = (sn: number): ReturnType<typeof ringAt> => {
    const key = Math.round(Math.max(0, sn) * 500);
    let r = ringMemo.get(key);
    if (!r) {
      r = ringAt(b.nose, key / 500);
      ringMemo.set(key, r);
    }
    return r;
  };
  const lookAt = (q: V3): Look => {
    const cs = q[2] - (car.cab ? tip : 0);
    const r = car.cab && cs < noseLen ? ringNear(cs) : null;
    const ringW = r ? r.ws * W : W;
    const mid = r ? (r.top + r.bottom) / 2 : (sec.floor + sec.crown) / 2;
    const ax = Math.abs(q[0]);
    const look = paint({ s: cs, y: q[1], ax, u: ax / ringW, top: q[1] > mid, car, L }, b);
    return 'glass' in look ? 'glass' : look.colour;
  };
  const colours = new Map<number, THREE.Color>();
  const colourOf = (hex: number): THREE.Color => {
    let c = colours.get(hex);
    if (!c) {
      c = col(hex);
      colours.set(hex, c);
    }
    return c;
  };
  const emit = (tp: [V3, V3, V3], tn: [V3, V3, V3], l: Look): void => {
    const pw = tp.map(world) as [V3, V3, V3];
    const nw = tn.map(wn) as [V3, V3, V3];
    if (l === 'glass') glass.tri(pw, nw, null);
    else shell.tri(pw, nw, colourOf(l));
  };
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const idx: [number, number][] = [[i, j], [i, j1], [i + 1, j1], [i + 1, j]];
      const ps = idx.map(([a, c]) => (P[a] as V3[])[c] as V3) as [V3, V3, V3, V3];
      const ns = idx.map(([a, c]) => (N[a] as V3[])[c] as V3) as [V3, V3, V3, V3];
      splitTri([ps[0], ps[1], ps[2]], [ns[0], ns[1], ns[2]], lookAt, emit);
      splitTri([ps[0], ps[2], ps[3]], [ns[0], ns[2], ns[3]], lookAt, emit);
    }
  }
  // the ends: the cab's face (a flat cap at the tip) and a dark end wall at every inner end
  const capAt = (st: number, outward: 1 | -1, colour: number): void => {
    const ring = rings.find((r) => Math.abs(r.s - st) < 1e-9) as { s: number; pts: [number, number][] };
    detail.fan(ring.pts.map(([x, y]) => world([x, y, st])), [0, 0, outward * dir], col(colour));
  };
  if (!car.cab) capAt(tip, -1, WALL);
  capAt(bodyEnd, 1, WALL);
  const lensFan = (role: LensRole, poly: V3[], n: V3, mode: 'head' | 'tail' | 'off'): void => {
    const look = lensLook(role, mode);
    const v0 = detail.glow.length;
    detail.emit = look.glow;
    detail.fan(poly, n, col(look.hex));
    detail.emit = 0;
    lenses.push({ role, v0, v1: detail.glow.length });
  };
  const marker = (name: string, x: number, y: number, sAlong: number, data: Record<string, unknown> = {}): void => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, Z(sAlong));
    o.userData = data;
    group.add(o);
  };

  if (car.cab) {
    const mode = SERVICE_LAMPS[car.cab === 'rear' ? 'rear' : 'front'];
    const faceN: V3 = [0, 0, -dir];
    const tipHalf = ringHalf(0);
    const outline = loopFromHalf(tipHalf);
    const faceColour = family === 'juniper' ? SR_BLUE : 0x2e3239;
    detail.fan(outline.map(([x, y]) => world([x, y, tip])), faceN, col(faceColour));
    if (family === 'juniper') {
      for (const shape of JUNIPER_FACE) {
        for (const m of shape.mirror ? [1, -1] : [1]) {
          const flip = m * dir;
          const clipped = clipConvex(shape.outline.map(([x, y]): [number, number] => [x * flip, y]), outline, shape.inset ?? 0);
          if (clipped.length < 3) continue;
          const poly = clipped.map(([x, y]) => world([x, y, tip - shape.lift]));
          if (shape.glass) glass.fan(poly, unit([0, -0.2, -dir]), null);
          else if (shape.lens) {
            lensFan(shape.lens, poly, faceN, mode);
            if (shape.name === 'headlight') marker('headlight', clipped.reduce((a, p) => a + p[0], 0) / clipped.length, 1.6, tip, { side: m * dir > 0 ? 'right' : 'left' });
          } else detail.fan(poly, faceN, col(shape.colour as number));
        }
      }
      // the coupler out of the recess to the car's end, and the bumper's two corners carried down as blue skirts either side of it (scotrail334_05)
      juniperCoupler(detail, Z(tip), (-dir) as 1 | -1, tip, COUPLER_Y);
      marker('nose-coupler', 0, COUPLER_Y, tip / 2, { end: car.cab, style: b.coupler.style, reach: tip });
      for (const sx of [-1, 1]) {
        const za = Z(tip + 0.05);
        const zb = Z(tip + 0.45);
        detail.box(sx * 0.72 - 0.26, sx * 0.72 + 0.26, 0.24, 0.56, Math.min(za, zb), Math.max(za, zb), col(0x1e2756));
      }
      // the roof cap's fittings (scotrail334_05, _06): a round horn cover at the middle and a grille each side of it, just behind the face's top
      for (const [x, sAt, kindOf] of [[0, 0.32, 'disc'], [0.78, 0.3, 'grille'], [-0.78, 0.3, 'grille']] as const) {
        const h = ringHalf(sAt);
        const y = yAtX(h, Math.abs(x)) + 0.012;
        const pts = kindOf === 'disc' ? discOutline(x, sAt, 0.17, 16) : boxOutline(x - 0.17, x + 0.17, sAt - 0.08, sAt + 0.08);
        detail.fan(pts.map(([px, ps]) => world([px * dir, y, tip + ps])), [0, 1, 0], col(kindOf === 'disc' ? 0x7b8396 : 0x22252b));
      }
      // the saltire's halftone dots on the cab side: a band of white dots falling back from the face's top corner to the sill, largest along its middle (scotrail334_05, _06)
      haltone(detail, (sAt, y, side) => surfacePoint(ringHalf, sAt, y, side, noseLen, W), world, wn, tip);
    } else {
      // the tip's flat cap is the bumper: cyan, the dark coupler cover (the "mouth") in it with a lighter seam round it, the navy foot under it (tpe397-01, -05; see NOVA)
      const capShape = (pts: readonly (readonly [number, number])[], lift: number, colour: number): void => {
        const c = clipConvex(pts.map(([x, y]): [number, number] => [x, y]), outline, 0.01);
        if (c.length >= 3) detail.fan(c.map(([x, y]) => world([x, y, tip - lift])), faceN, col(colour));
      };
      capShape(boxOutline(-2, 2, 0, NOVA.navy), 0.002, TPE_NAVY);
      capShape(boxOutline(-2, 2, NOVA.navy, 2), 0.002, TPE_CYAN);
      // the muzzle: flush dark grey, not a black hole (tpe397-01, -05)
      capShape(roundedRect(-NOVA.mouthHalf - 0.02, NOVA.mouthHalf + 0.02, NOVA.mouth[0] - 0.02, NOVA.mouth[1] + 0.2, 0.22, 4), 0.003, MUZZLE.seam);
      capShape(roundedRect(-NOVA.mouthHalf, NOVA.mouthHalf, NOVA.mouth[0], NOVA.mouth[1] + 0.2, 0.2, 4), 0.004, MUZZLE.colour);
      const cover = new THREE.Object3D();
      cover.name = 'coupler-cover';
      cover.position.set(0, (NOVA.mouth[0] + NOVA.mouth[1]) / 2, Z(tip));
      cover.userData = { y0: NOVA.mouth[0], y1: NOVA.mouth[1], hidesCoupler: true };
      group.add(cover);
      // a point on the face at (x, y): how far back from the tip the face stands there (the ring whose roof line passes through it), so shapes drawn in the
      // face's own (x, y) frame land on the leaning surface
      // (the nose's rings sampled every 2 cm once, and the face's roof line searched among them: the face rises monotonically from the tip)
      const ds = 0.02;
      const halves = Array.from({ length: Math.ceil(noseLen / ds) + 1 }, (_, i) => ringHalf(Math.min(noseLen, i * ds)));
      const sAtY = (x: number, y: number): number => {
        const h = (i: number): number => yAtX(halves[i] as [number, number][], Math.abs(x));
        if (h(0) >= y) return 0;
        let lo = 0;
        let hi = halves.length - 1;
        if (h(hi) < y) return noseLen;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (h(mid) < y) lo = mid;
          else hi = mid;
        }
        const a = h(lo);
        const c = h(hi);
        return Math.min(noseLen, (lo + (c > a ? (y - a) / (c - a) : 0)) * ds);
      };
      const onFace = (x: number, y: number): V3 => [x, y, tip + sAtY(x, y)];
      const faceNormal = (x: number, y: number): V3 => {
        const d = 0.03;
        const n = unit(cross(sub(onFace(x + d, y), onFace(x - d, y)), sub(onFace(x, y + d), onFace(x, y - d))));
        return n[2] > 0 ? [-n[0], -n[1], -n[2]] : n;
      };
      const onSurface = (pts: readonly (readonly [number, number])[], lift: number): { poly: V3[]; n: V3 } => {
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const n = faceNormal(cx, cy);
        return {
          poly: pts.map(([x, y]) => {
            const q = onFace(x, y);
            return world([q[0] + n[0] * lift, q[1] + n[1] * lift, q[2] + n[2] * lift]);
          }),
          n: wn(n),
        };
      };
      // the face's regions (NOVA, EYE) are painted on the shell, cut along their edges. In each eye, the round headlight outboard and the block of LEDs
      // inboard, which shows white leading and red trailing (tpe397-01 shows it lit at the leading end): a `marker` lens. x on the face for a place u across it
      const xAtU = (u: number, y: number): number => {
        let x = u * W;
        for (let k = 0; k < 3; k++) x = u * ringAt(b.nose, sAtY(x, y)).ws * W;
        return x;
      };
      for (const side of [-1, 1]) {
        const xs = side * dir;
        const uh = 0.76;
        const yh = eyeFoot(uh) + EYE.height / 2;
        const xh = xAtU(uh, yh) * xs;
        const head = onSurface(discOutline(xh, yh, 0.075, 16), 0.012);
        lensFan('head', head.poly, head.n, mode);
        const um = 0.5;
        const ym = eyeFoot(um) + EYE.height / 2;
        const xm0 = xAtU(um - 0.06, ym);
        const xm1 = xAtU(um + 0.07, ym);
        // the block leans with the eye: its outer edge stands as much higher as the eye's foot rises over its width
        const lean = (EYE.rise * 0.13) / (EYE.u1 - EYE.u0);
        const block: [number, number][] = [[xm0 * xs, ym - 0.07], [xm1 * xs, ym - 0.07 + lean], [xm1 * xs, ym + 0.07 + lean], [xm0 * xs, ym + 0.07]];
        const led = onSurface(block, 0.012);
        lensFan('marker', led.poly, led.n, mode);
        const at = onFace(xh, yh);
        marker('headlight', at[0], at[1], at[2], { side: xs > 0 ? 'right' : 'left' });
      }
      // TPE's star badge at the foot of the V: a five-pointed star, not a disc, so it does not read as a lamp (tpe397-01)
      const star = onSurface(starOutline(0, NOVA.star, 0.085), 0.008);
      detail.fan(star.poly, star.n, col(0xf2f4f6));
      // the marker lamp at the top of the hood, in its pale peaked surround over the display (tpe397-01, -05). It is a lens like the others: a top marker,
      // white when its end leads, dark when it trails (the `head` role)
      // (its surround is painted on the shell: paintCivity)
      const roofLamp = onSurface(discOutline(0, MARKER.lampY, MARKER.lampR, 6), 0.012);
      lensFan('head', roofLamp.poly, roofLamp.n, mode);
      // a strip laid along the face through (x, y) points, `half` wide each side, `lift` proud of the surface: cut into pieces of at most 4 cm, each laid
      // on the surface at its own place, so a long strip follows the curving face instead of sinking into it as one flat bar does (round 4's wiper broke
      // in two that way)
      const ribbon = (pts: readonly (readonly [number, number])[], halfW: number, lift: number, colour: THREE.Color): void => {
        for (let k = 0; k + 1 < pts.length; k++) {
          const [xa, ya] = pts[k] as readonly [number, number];
          const [xb, yb] = pts[k + 1] as readonly [number, number];
          const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / 0.04));
          for (let i = 0; i < n; i++) {
            const at = (t: number): [number, number] => [lerp(xa, xb, t), lerp(ya, yb, t)];
            const [x0, y0] = at(i / n);
            const [x1, y1] = at((i + 1) / n);
            const nm = faceNormal((x0 + x1) / 2, (y0 + y1) / 2);
            const q0 = onFace(x0, y0);
            const q1 = onFace(x1, y1);
            const side = unit(cross(nm, sub(q1, q0)));
            const corner = (q: V3, sgn: number): V3 => world([q[0] + nm[0] * lift + side[0] * halfW * sgn, q[1] + nm[1] * lift + side[1] * halfW * sgn, q[2] + nm[2] * lift + side[2] * halfW * sgn]);
            detail.quad([corner(q0, -1), corner(q1, -1), corner(q1, 1), corner(q0, 1)], [wn(nm), wn(nm), wn(nm), wn(nm)], colour);
          }
        }
      };
      // the orange line along the screen frame's top, out to the frame's corners (tpe397-01)
      const lineY = NOVA.screen[1] + 0.045;
      const lineX = xAtU(NOVA.frameU, lineY);
      ribbon(Array.from({ length: 9 }, (_, k): [number, number] => [lerp(-lineX, lineX, k / 8), lineY]), 0.011, 0.004, col(0xd0603a));
      // a single wiper parked up the screen, from its foot near the middle toward the cab's left (tpe397-01, -05)
      ribbon([[0.08 * dir, NOVA.screen[0] + 0.05], [-0.38 * dir, NOVA.screen[0] + 0.78]], 0.03, 0.012, col(WIPER));
    }
    if (plan.crewDoor !== null) for (const sx of [-1, 1]) marker('crew-door', sx * half, (b.doorY[0] + b.doorY[1]) / 2, plan.crewDoor, { side: sx > 0 ? 'right' : 'left', width: 0.7 });
  }

  // the gangway bellows and the coupler at every inner end
  const innerEnds: { s: number; sign: 1 | -1 }[] = [];
  if (!car.cab) innerEnds.push({ s: tip, sign: -1 });
  innerEnds.push({ s: bodyEnd, sign: 1 });
  for (const e of innerEnds) {
    const zWall = Z(e.s);
    const zOut = Z(e.s + e.sign * WV_END_GAP);
    const g = b.gangway;
    // each car draws its own share of the space between bodies (WV_END_GAP), so the two halves meet at the face frame in the middle and nothing is drawn twice
    const zSeat = zWall + Math.sign(zOut - zWall) * 0.002;
    ribbedBellows(detail, { half: sec.half, bottom: g.bottom, halfWidth: g.width / 2, inset: g.inset, topGap: g.topGap, ribs: g.ribs, depth: g.depth }, zSeat, zOut, { crest: col(0x4a4d54), valley: col(0x111215), frame: col(0x17181b) });
    const end = e.sign > 0 ? (car.cab === 'rear' ? 'front' : 'rear') : 'front';
    marker('gangway', 0, g.bottom + g.height / 2, e.s + (e.sign * WV_END_GAP) / 2, { end, width: g.width, height: g.height, depth: WV_END_GAP });
    couplerHalf(detail, zWall, (Math.sign(zOut - zWall) || 1) as 1 | -1, WV_END_GAP, COUPLER_Y);
    marker('coupler', 0, COUPLER_Y, e.s + (e.sign * WV_END_GAP) / 2, { end, nose: false });
  }

  // doors: a dark frame, the leaf or leaves, a window in each; the crew door a narrow single leaf with a tall slim window
  const [dy0, dy1] = b.doorY;
  const frameC = col(0x24272b);
  const leafC = col(b.door);
  const paneC = col(b.window);
  const openings = [...plan.doors.map((d) => ({ d, w: b.doorWidth, crew: false })), ...(plan.crewDoor !== null ? [{ d: plan.crewDoor, w: 0.7, crew: true }] : [])];
  openings.forEach(({ d, w, crew }, di) => {
    const z = Z(d);
    for (const sx of [-1, 1]) {
      const lo = (a: number, c: number): [number, number] => [Math.min(sx * a, sx * c), Math.max(sx * a, sx * c)];
      const [fx0, fx1] = lo(W - 0.005, half - DOOR_RELIEF / 2);
      if (!(family === 'civity' && car.cab && (crew || di === 0))) detail.box(fx0, fx1, dy0 - 0.05, dy1 + 0.04, z - w / 2 - 0.05, z + w / 2 + 0.05, frameC);
      const [lx0, lx1] = lo(W - 0.005, half - 0.004);
      const [px0, px1] = lo(W - 0.005, half);
      const leaf = crew ? (family === 'civity' ? col(TPE_CYAN) : col(SR_BLUE)) : leafC;
      if (family === 'civity' && car.cab && (crew || di === 0)) {
        // the 397 cab car's crew door and first passenger door are flush plug doors in the livery: the cyan and the navy diagonals run across them (tpe397-05),
        // so only their seams and glass are drawn and the painted shell is the leaf
        const [sx0, sx1] = lo(W - 0.005, W + 0.004);
        const seam = 0.025;
        detail.box(sx0, sx1, dy0, dy1, z - w / 2 - seam, z - w / 2, frameC);
        detail.box(sx0, sx1, dy0, dy1, z + w / 2, z + w / 2 + seam, frameC);
        detail.box(sx0, sx1, dy1, dy1 + seam, z - w / 2 - seam, z + w / 2 + seam, frameC);
        detail.box(sx0, sx1, dy0 - seam, dy0, z - w / 2 - seam, z + w / 2 + seam, frameC);
        const xIn = sx * (W - 0.005);
        const g = crew ? { half: 0.17, foot: 1.0, head: 0.2, r: 0.08 } : { half: DOOR_GLASS.half, foot: DOOR_GLASS.foot, head: DOOR_GLASS.head, r: 0.11 };
        detail.prismX(roundedRect(z - g.half - 0.025, z + g.half + 0.025, dy0 + g.foot - 0.025, dy1 - g.head + 0.025, g.r + 0.02, 3), xIn, sx * (W + 0.005), col(0x0d0e10));
        detail.emit = 1;
        detail.prismX(roundedRect(z - g.half, z + g.half, dy0 + g.foot, dy1 - g.head, g.r, 3), xIn, sx * (W + 0.007), paneC, false);
        detail.emit = 0;
      } else if (crew) {
        detail.box(lx0, lx1, dy0, dy1, z - w / 2, z + w / 2, leaf);
        detail.box(px0, px1, dy1 - 1.15, dy1 - 0.22, z - 0.1, z + 0.1, paneC);
      } else if (b.doorLeaves === 1) {
        // the Nova 2's plug door: a tall rounded window filling most of the leaf (tpe397-02; ASSUMED size, read against the assumed height)
        detail.box(lx0, lx1, dy0, dy1, z - w / 2, z + w / 2, leaf);
        const xIn = sx * (W - 0.005);
        detail.prismX(roundedRect(z - DOOR_GLASS.half - 0.025, z + DOOR_GLASS.half + 0.025, dy0 + DOOR_GLASS.foot - 0.025, dy1 - DOOR_GLASS.head + 0.025, 0.13, 3), xIn, sx * (half + 0.002), col(0x0d0e10));
        detail.emit = 1;
        detail.prismX(roundedRect(z - DOOR_GLASS.half, z + DOOR_GLASS.half, dy0 + DOOR_GLASS.foot, dy1 - DOOR_GLASS.head, 0.11, 3), xIn, sx * (half + 0.004), paneC, false);
        detail.emit = 0;
      } else {
        const lw = (w - 0.04) / 2;
        for (const k of [-1, 1]) {
          const zc = z + (k * (lw + 0.04)) / 2;
          detail.box(lx0, lx1, dy0, dy1, zc - lw / 2, zc + lw / 2, leafC);
          detail.box(px0, px1, dy1 - 1.05, dy1 - 0.2, zc - lw * 0.32, zc + lw * 0.32, paneC);
        }
      }
      if (!crew) marker('door', sx * half, (dy0 + dy1) / 2, d, { side: sx > 0 ? 'right' : 'left', index: di, width: w, height: dy1 - dy0 });
    }
  });

  // passenger windows: a dark gasket, the glass (lit warm after dark) and a pale reflection along its top
  const [wy0, wy1] = b.windowY;
  for (const [s0, s1] of plan.windows) {
    const za = Math.min(Z(s0), Z(s1));
    const zb = Math.max(Z(s0), Z(s1));
    for (const sx of [-1, 1]) {
      const outer = (rel: number): number => sx * (half - rel);
      detail.prismX(roundedRect(za - 0.03, zb + 0.03, wy0 - 0.03, wy1 + 0.03, 0.1, 2), sx * (W - 0.005), outer(0.016), col(0x0d0e10));
      detail.emit = 1;
      detail.prismX(roundedRect(za, zb, wy0, wy1, 0.08, 2), sx * (W - 0.005), outer(0.012), paneC, false);
      detail.emit = 0;
      detail.prismX(roundedRect(za + 0.04, zb - 0.04, wy1 - 0.24, wy1 - 0.03, 0.05, 2), outer(0.0125), outer(0.0115), col(0x4b5b73), false);
      // the 334's hopper: a frame bar across the window, the small pane over it opening inward (scotrail334_01, _02)
      if (family === 'juniper') detail.box(Math.min(outer(0.011), outer(0.0085)), Math.max(outer(0.011), outer(0.0085)), wy1 - HOPPER - 0.025, wy1 - HOPPER + 0.025, za, zb, col(0x15171b));
    }
  }

  // roof: the fairings in short runs, left off round the pantograph and its insulators; the pantograph folded on its car
  const from = car.cab === 'front' ? car.start + tip + noseLen + 0.4 : car.start + WV_END_GAP + 0.6;
  const to = car.cab === 'rear' ? car.end - tip - noseLen - 0.4 : car.end - WV_END_GAP - 0.6;
  const runs = Math.max(1, Math.ceil((to - from) / 6));
  const runLen = (to - from - 0.8 * (runs - 1)) / runs;
  let covers: [number, number][] = Array.from({ length: runs }, (_, k): [number, number] => [from + k * (runLen + 0.8), from + k * (runLen + 0.8) + runLen]);
  if (car.pantograph) {
    const kitDir: 1 | -1 = (car.pantograph[0] + car.pantograph[1]) / 2 < (car.start + car.end) / 2 ? 1 : -1;
    const [k0, k1] = roofKitSpan('emu', car.pantograph[0], car.pantograph[1], kitDir);
    covers = covers.flatMap(([a, c]): [number, number][] => (c <= k0 || a >= k1 ? [[a, c]] : [...(a < k0 ? [[a, k0] as [number, number]] : []), ...(c > k1 ? [[k1, c] as [number, number]] : [])]));
    roofKit(detail, { style: 'emu', p0: car.pantograph[0], p1: car.pantograph[1], dir: kitDir, crown: b.crown, height: b.coverHeight - 0.01 });
    const p = buildWvPantograph(fig.pantographLength.value, b.coverHeight);
    p.position.set(0, b.crown, (car.pantograph[0] + car.pantograph[1]) / 2);
    group.add(p);
  }
  // the Civity's high-voltage gear at a car end (tpe397-02): only where the photographs show it, at the pantograph's end of a pantograph car, between the
  // car's end and the pantograph's base (tpe397-02 shows it there beside the folded pantograph, -05 and -06 the same end of car 2; no photograph shows it on
  // the MSL or at a pantograph car's other end, so neither carries it). It stops short of the pantograph's base.
  if (family === 'civity' && car.pantograph) {
    const nearStart = (car.pantograph[0] + car.pantograph[1]) / 2 < (car.start + car.end) / 2;
    const zEnd = nearStart ? car.start + WV_END_GAP + 0.05 : car.end - WV_END_GAP - 0.05;
    const dir: 1 | -1 = nearStart ? 1 : -1;
    const reach = Math.max(0.6, (nearStart ? car.pantograph[0] - zEnd : zEnd - car.pantograph[1]) - 0.15);
    {
      roofEndCluster(detail, zEnd, dir, b.crown, fig.height.value - b.crown + 0.04, Math.min(CLUSTER_SPAN, reach));
      const span = Math.min(CLUSTER_SPAN, reach) + 0.3;
      const [c0, c1] = [Math.min(zEnd, zEnd + dir * span), Math.max(zEnd, zEnd + dir * span)];
      covers = covers.flatMap(([a, c]): [number, number][] => (c <= c0 || a >= c1 ? [[a, c]] : [...(a < c0 ? [[a, c0] as [number, number]] : []), ...(c > c1 ? [[c1, c] as [number, number]] : [])]));
    }
  }
  for (const [z0, z1] of covers) {
    if (z1 - z0 < 0.8) continue;
    const yb = b.crown - 0.04;
    const yt = b.crown + b.coverHeight;
    const lo: V3[] = [[-0.9, yb, z0], [0.9, yb, z0], [0.9, yb, z1], [-0.9, yb, z1]];
    const hi: V3[] = [[-0.7, yt, z0 + 0.3], [0.7, yt, z0 + 0.3], [0.7, yt, z1 - 0.3], [-0.7, yt, z1 - 0.3]];
    const c8: V3 = [0, (yb + yt) / 2, (z0 + z1) / 2];
    detail.face(hi[0] as V3 && [hi[0] as V3, hi[1] as V3, hi[2] as V3, hi[3] as V3], c8, col(b.cover));
    for (let k = 0; k < 4; k++) detail.face([lo[k] as V3, lo[(k + 1) % 4] as V3, hi[(k + 1) % 4] as V3, hi[k] as V3], c8, col(b.cover));
    // the 334's cooling units carry a louvred grille along their top (scotrail334_02: dark slats across the long roof box; their number and pitch ASSUMED)
    if (family === 'juniper' && z1 - z0 > 2.5) {
      const zc = (z0 + z1) / 2;
      for (let k = -4; k <= 4; k++) detail.box(-0.5, 0.5, yt, yt + 0.004, zc + k * 0.16 - 0.04, zc + k * 0.16 + 0.04, col(0x1d1f25), '-y');
    }
  }

  // underframe: a dark slab, and a row of equipment cases hung between the bogies (both units run with the cases in view: scotrail334_02, tpe397-02)
  const zA = car.start + WV_END_GAP + (car.cab === 'front' ? tip + noseLen * 0.4 : 0.1);
  const zB = car.end - WV_END_GAP - (car.cab === 'rear' ? tip + noseLen * 0.4 : 0.1);
  detail.box(-0.95, 0.95, b.floor - 0.18, b.floor + 0.04, zA, zB, col(UNDER), '+y');
  const reach = fig.wheelbase.value / 2 + fig.wheelDiameter.value / 2 + 0.3;
  const caseC = col(family === 'civity' ? 0x6c7178 : 0x33363c);
  const [b0, b1] = [Math.min(...car.bogies), Math.max(...car.bogies)];
  for (let z = b0 + reach; z + 1.0 < b1 - reach; z += 1.75) {
    const len = Math.min(1.45, b1 - reach - z);
    detail.box(-1.05, 1.05, b.floor - 0.62, b.floor - 0.18, z, z + len, caseC);
  }

  // the bogies
  // the 334's halftone bands at its inner ends, and its Saltire X: two flat bars on each side's wall
  if (family === 'juniper') {
    if (!car.cab) endDots(detail, tip, 1, W, world);
    endDots(detail, bodyEnd, -1, W, world);
    const c = saltireAt(car);
    const { y0, y1, half: h, bar } = SALTIRE;
    for (const sx of [-1, 1] as const) {
      for (const [k, lift] of [[1, 0.005], [-1, 0.0065]] as const) {
        const x = sx * (W + lift);
        const quad: V3[] = [[x, y0, c - k * h - bar / 2], [x, y0, c - k * h + bar / 2], [x, y1, c + k * h + bar / 2], [x, y1, c + k * h - bar / 2]];
        detail.fan(quad.map(world), [sx, 0, 0], col(SR_SALTIRE));
      }
    }
  }

  // the bogies: the 397's own CAF bogie (tpe397-03), the 334's from the shared parts
  car.bogies.forEach((z, k) => {
    const spec = { radius: fig.wheelDiameter.value / 2, wheelbase: fig.wheelbase.value, track: 1.435, motor: car.motor[k] as boolean };
    const bg = b.bogie === 'caf' ? buildCafBogie(spec) : buildJuniperBogie(spec);
    bg.name = `bogie-${car.index}-${k}`;
    bg.position.set(0, 0, z);
    group.add(bg);
  });

  const shellMesh = new THREE.Mesh(shell.build(), plain());
  shellMesh.name = 'body-shell';
  const detailMesh = new THREE.Mesh(detail.build(), plain());
  detailMesh.name = 'body-detail';
  if (car.cab) detailMesh.userData.lamps = { end: car.cab, interior: false, lenses };
  group.add(shellMesh, detailMesh);
  if (glass.pos.length) {
    const m = new THREE.Mesh(glass.build(), glassMaterial());
    m.name = 'cab-glass';
    group.add(m);
  }
  return group;
}

/** A point on the cab's flank at `s` from the tip and height `y`, on side `side`, and the surface's outward normal there (the car's own frame, s along). */
function surfacePoint(ringHalf: (sn: number) => [number, number][], sAt: number, y: number, side: number, noseLen: number, W: number): { p: V3; n: V3 } {
  const xAt = (sn: number, yy: number): number => (sn < noseLen ? xAtY(ringHalf(Math.max(0, sn)), yy) : W);
  const d = 0.02;
  const p: V3 = [side * xAt(sAt, y), y, sAt];
  const ts: V3 = [side * (xAt(sAt + d, y) - xAt(Math.max(0, sAt - d), y)), 0, sAt + d - Math.max(0, sAt - d)];
  const ty: V3 = [side * (xAt(sAt, y + d) - xAt(sAt, y - d)), 2 * d, 0];
  let n = unit(cross(ty, ts));
  if (n[0] * side < 0) n = [-n[0], -n[1], -n[2]];
  return { p, n };
}

/** The 334's halftone dots (see the caller): a lattice of discs on both flanks, each laid on the surface a centimetre proud of it. */
function haltone(soup: Soup, at: (s: number, y: number, side: number) => { p: V3; n: V3 }, world: (p: V3) => V3, wn: (n: V3) => V3, tip: number): void {
  const pitch = 0.155;
  const white = col(SR_DOT);
  for (let row = 0; ; row++) {
    const y = 3.24 - row * pitch;
    if (y < 1.05) break;
    // the band's middle falls back about a metre for every metre down; it is about 1.4 m wide along the car (ASSUMED, read off scotrail334_06)
    // (it starts at the face's corner beside the screens: scotrail334_05)
    // (round 4: it begins on the face's rounded corner beside the screen, as _05 and _07 show the top rows wrapping onto the front)
    const centre = 0.1 + (3.24 - y) * 1.0;
    const offset = (row % 2) * pitch * 0.5;
    for (let k = -6; k <= 6; k++) {
      const sAt = centre + k * pitch + offset;
      const d = Math.abs(sAt - centre) / 0.75;
      const r = 0.066 * (1 - d * d);
      if (r < 0.02 || sAt < 0.012) continue;
      for (const side of [-1, 1]) {
        const { p, n } = at(sAt, y, side);
        // a disc in the tangent plane: e1 along the surface (s mostly), e2 up
        const e2: V3 = unit([n[1] * 0 - n[2] * 0, 1 - n[1] * n[1], -n[1] * n[2]]);
        const e1 = unit(cross(n, e2));
        const lift = 0.012;
        const c: V3 = [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift + tip];
        const poly: V3[] = Array.from({ length: 10 }, (_, q): V3 => {
          const t = (2 * Math.PI * q) / 10;
          const a = Math.cos(t) * r;
          const bb = Math.sin(t) * r;
          return world([c[0] + e1[0] * a + e2[0] * bb, c[1] + e1[1] * a + e2[1] * bb, c[2] + e1[2] * a + e2[2] * bb]);
        });
        soup.fan(poly, wn(n), white);
      }
    }
  }
}

/**
 * The 334's halftone band at an inner car end (scotrail334_01, _02: at every gangway, on both cars, both sides): white dots in staggered rows up the flat wall,
 * largest along the band's middle, which leans toward the gangway at the top. `sEnd` is the body's end, `inward` the direction into the car (both in the
 * car's own s), `W` the wall's half-width. ASSUMED sizes, as the cab's band.
 */
function endDots(soup: Soup, sEnd: number, inward: 1 | -1, W: number, world: (p: V3) => V3): void {
  const pitch = 0.155;
  const white = col(SR_DOT);
  for (let row = 0; ; row++) {
    const y = 2.98 - row * pitch;
    if (y < 1.1) break;
    const centre = 0.42 + (2.98 - y) * 0.22;
    const offset = (row % 2) * pitch * 0.5;
    for (let k = -4; k <= 4; k++) {
      const d0 = centre + k * pitch + offset;
      const d = Math.abs(d0 - centre) / 0.5;
      const r = 0.06 * (1 - d * d);
      if (r < 0.018 || d0 < 0.08) continue;
      const s = sEnd + inward * d0;
      for (const sx of [-1, 1]) {
        const x = sx * (W + 0.008);
        const poly: V3[] = Array.from({ length: 10 }, (_, q): V3 => {
          const t = (2 * Math.PI * q) / 10;
          return world([x, y + Math.sin(t) * r, s + Math.cos(t) * r]);
        });
        soup.fan(poly, [sx, 0, 0], white);
      }
    }
  }
}

/** Build a Waverley EMU: children car-<index>, bogies bogie-<index>-<k>, its lamps in the service state (white at the front, red at the rear). */
export function buildWvEmuTrain(kind: WvEmuKind): THREE.Group {
  const layout = wvEmuLayout(kind);
  const b = BODIES[layout.spec.family];
  const root = new THREE.Group();
  root.name = `train-${kind}`;
  root.userData = { kind, length: layout.length, cars: layout.cars.length, family: layout.spec.family, operator: layout.spec.operator, label: layout.spec.label, allocation: 'assumed fleet', lampState: { ...SERVICE_LAMPS }, source: layout.spec.source };
  for (const car of layout.cars) root.add(buildCar(car, layout, b));
  return root;
}

/** Release this builder's geometry, keeping the shared bogie geometry and the shared materials. */
export function disposeWvEmuTrain(root: THREE.Group): void {
  const owned = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') owned.add(o.geometry);
  });
  for (const g of owned) g.dispose();
}

/** What the rubric capture needs to plan its views of a kind (edinburgh-fleet.ts CaptureFormation). */
export function wvEmuFormation(kind: WvEmuKind): CaptureFormation {
  const layout = wvEmuLayout(kind);
  const b = BODIES[layout.spec.family];
  const f = WV_EMU_FIGURES[layout.spec.family];
  const key = layout.spec.family === 'juniper' ? 'JUNIPER' : 'CIVITY';
  const cars = layout.cars.map((car) => {
    const base = car.cab === 'rear' ? car.end : car.start;
    const dir = car.cab === 'rear' ? -1 : 1;
    return { index: car.index, type: car.type, length: car.length, start: car.start, end: car.end, cab: car.cab, bogies: [...car.bogies], motor: [...car.motor], pantograph: car.pantograph ? [...car.pantograph] : null, doors: b.plan(car).doors.map((d) => base + dir * d) };
  });
  const roofTop = b.crown + b.coverHeight;
  const lengthBasis = [...new Set([f.drivingCarLength.basis, f.carLength.basis])].join('+');
  return {
    family: layout.spec.family, classes: layout.spec.classes, classNote: null, length: layout.length, half: b.half, crown: b.crown, coverHeight: b.coverHeight, roofTop, doorWidth: b.doorWidth, cars,
    dimensions: {
      lengthM: { value: layout.length, basis: lengthBasis, figures: [`${key}.drivingCarLength`, `${key}.carLength`] },
      widthM: { value: 2 * b.half, basis: f.bodyWidth.basis, figures: [`${key}.bodyWidth`], figureM: f.bodyWidth.value },
      roofTopM: { value: roofTop, basis: f.height.basis, figures: [`${key}.height`], figureM: f.height.value },
    },
  };
}
