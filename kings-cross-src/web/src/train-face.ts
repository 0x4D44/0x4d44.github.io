// The furniture of a flat cab face, as data: the shapes laid on the face's own plane, in the cab's own frame (x across to the cab's right, y metres above the rail
// head), each with the layer it stands on (how far in front of the plane, metres). The Electrostar's face is the first; the Desiro City's follow. train.ts clips every
// shape to the face's outline and lays it on the face; nothing here knows about the loft.
//
// Why shapes on a plane and not a windscreen on the nose's roof: a Class 387's, 717's or 700's face is a tall, nearly upright wall (the glass raked a few degrees, not
// the 45 degrees of a bullet nose), with its windscreens, door, panels and lamp housings in one plane (gn387_01_387114_ely, gn387_02_387121_ely head on; gn387_03_387123_cambridge
// from the side). Laid on a roof height field the glass would have to climb a steep slope and the face under it would be an egg.
//
// The numbers are read off the photographs against the published height (3.77 m) and width (2.80 m), not published themselves: ASSUMED, good to a few centimetres.
import { ellipse, roundedRect } from './train-geom.ts';

/** One shape on a flat face. */
export interface FaceShape {
  /** what it is, for the tests and for whoever reads the table */
  name: string;
  /** a convex outline in the cab's own frame (x to the cab's right, y above the rail head); wound either way */
  outline: readonly (readonly [number, number])[];
  /** the colour of an opaque shape (a lens takes its colour from the lamp state, glass from the cab glass's material: neither has one) */
  colour?: number;
  /** metres in front of the face's plane. Shapes that overlap stand at least a millimetre and a half apart; the highest is a lens, one millimetre inside the face's own setback */
  lift: number;
  /** also drawn mirrored across the middle of the face */
  mirror?: boolean;
  /** kept this far inside the face's own outline, metres (the face's corners are rounded: a shape that would stand over the edge follows it instead) */
  inset?: number;
  /** reflective glass: drawn into the cab-glass mesh */
  glass?: boolean;
  /** a lamp lens: its role (its colour and glow follow the lamp state) */
  lens?: 'head' | 'tail';
  /** only at the end of a train, not where two units couple (the coupling's own recess and cables are drawn there) */
  trainEnd?: boolean;
}

/** A cab front drawn as shapes on its flat face (see the header). */
export interface FaceSpec {
  /** the shapes, in the order they are drawn (the order is not the stacking: each has its own lift) */
  shapes: readonly FaceShape[];
  /**
   * How far the face's plane stands behind the end of the train, metres. The shapes stand in front of it by up to this less a millimetre (the lenses, the highest), so that
   * nothing is drawn beyond the car's end, and the car's drawn length is its plan length to a millimetre.
   */
  setback: number;
  /** the top of the bumper where the amber panels begin: the coupling's recess, and the sockets a coupled unit's jumper cables hang from, are measured from it */
  coverTop: number;
  /** the coupler's recess in the bumper, drawn at both kinds of end: half its width, its bottom and top edges */
  recess: { half: number; y0: number; y1: number };
  /** the glass's one shading normal leans this much up (the y of its unit normal before it is normalised; negative: down, so it reflects the dark ground), see PANE_DOWN in train.ts */
  glassLean: number;
}

/** The near-black of a lamp's housing and of a front door's outline. */
export const BEZEL = 0x15171a;
/** The parked wiper arms' colour: a dark grey, a shade off the glass's black so they still read against it. */
export const WIPER = 0x3b4048;
/**
 * The cab side window, as a pane of glass rather than a black cut-out (the round-4 scorer's finding on coach-lner9-3m and coach-lumo5-3m: "a flat black
 * polygon", with a white specular blob where the pane's normals turned to the sun). Three layers, from the photographs lner-800-doncaster-2026,
 * hull-802-doncaster-2024 and LUMO-04-Lumo-803003-at-Edinburgh-Waverley, whose side windows are glossy dark panes in a thin black seal with a soft pale
 * sky reflection across their upper part:
 *   the seal    a near-black patch a hand's breadth bigger than the pane, under it (PANE_SEAL, a shade off every other near-black the nose uses);
 *   the pane    the reflective glass, shaded with one normal across it (tilted down, so it reflects the dark ground: no blob), and
 *   the sky     two matte bands over the pane's upper rows, a pale one along the top edge and a fainter one under it.
 * The shades are approximate (read off those photographs, not published). A flat face's panes are the same three layers.
 */
export const PANE_SEAL = 0x0b0c0e;
export const PANE_SKY_HI = 0x4b5b73;
export const PANE_SKY_MID = 0x1d2733;

/** A rectangle as a polygon, corners rounded by `r` (0: square). */
export const boxOutline = (x0: number, x1: number, y0: number, y1: number, r = 0, seg = 3): [number, number][] => (r > 0 ? roundedRect(x0, x1, y0, y1, r, seg) : [[x1, y1], [x0, y1], [x0, y0], [x1, y0]]);
/** A round lens: a polygon of `n` points. */
export const discOutline = (cx: number, cy: number, r: number, n = 14): [number, number][] => ellipse(cx, cy, r, r, n);
/** A bar from `a` to `b`, `w` wide, as a four-point polygon. */
export function barOutline(a: readonly [number, number], b: readonly [number, number], w: number): [number, number][] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / l) * (w / 2);
  const ny = ((b[0] - a[0]) / l) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

// --- the Class 387's face ------------------------------------------------------------------------------

/**
 * The Great Northern 387's amber: the panels under the screens, the brow over them, and the door leaf a shade deeper. An orange-leaning yellow, warmer than a warning-panel
 * yellow (photographs gn387_01_387114_ely, gn387_02_387121_ely, gn387_03_387123_cambridge: hue about 31 to 36 degrees in the evening light they were taken in, where a
 * warning yellow's is 48). Approximate: it sits at about 40 degrees.
 */
export const AMBER = 0xeaa615;
export const AMBER_DOOR = 0xe49c14;
/** The bumper under the panels: a pale grey, a shade off the body's white (it is road-dirty in every photograph: luma 0.4 to 0.6 against the body's 0.8). Approximate. */
export const BUMPER = 0xc4c6c4;
/** The dark frame round the gangway door, a shade lighter than the glass's seal (it is dark grey in the photographs, not black), and the thin lighter rim inside it. */
const DOOR_FRAME = 0x1f2024;
const DOOR_RIM = 0x4a4c50;
/** The coupler's recess in the bumper, near black, and how far in front of the face it stands (train.ts draws it at both kinds of end, under the coupler's head). */
export const RECESS = 0x0d0e10;
export const RECESS_LIFT = 0.003;
const COUPLER_BODY = 0x8a8f96;
const COUPLER_PORT = 0x16181c;
const ROOF_LAMP = 0xdcdcd4;
const DISPLAY_PANEL = 0x0d0e10;
const DISPLAY_TEXT = 0xffa000;

/**
 * The 387's face, from gn387_01_387114_ely and gn387_02_387121_ely (head on, 270 px to the metre against the 3.77 m height), top to bottom:
 *   the brow         amber, over the screens, running back over the roof's front (train.ts paints that part with the loft's own colours); a small round lamp at its middle;
 *   the screens      two panes, 0.9 m wide and 1.1 m tall (2.06 to 3.16 m), in black frames that run out to the face's edge; the cab's right one carries the lit destination
 *                    display at its inner upper corner (the viewer's left in the photographs), and each a wiper parked slantwise from its inner foot;
 *   the door         between them, a dark frame 1.08 m wide from 1.12 m up to the top of the face, round a thin lighter rim and the amber leaf (0.70 m wide, 1.22 to 3.17 m)
 *                    with two small handle recesses at 2.2 m;
 *   the panels       amber, under the screens, down to the bumper's top edge at 1.36 m, each with a lamp housing (a dark rounded box 0.54 x 0.32 m) in its lower outer corner:
 *                    the headlight (0.23 m across) outboard, a smaller lamp (0.17 m) inboard of it, as both photographs have them on both sides;
 *   the bumper       a pale grey, with the coupler's recess (dark, 0.94 m wide) under the door and the Dellner head sitting in it (a grey box with two ports).
 * The glass and what stands on it (the sky's two bands, the wipers, the display) are laid 6 mm or more above it: the glass material's polygon offset pulls it toward the eye.
 */
export const ELECTROSTAR_FACE: FaceSpec = {
  setback: 0.02,
  coverTop: 1.33,
  recess: { half: 0.47, y0: 0.52, y1: 1.1 },
  glassLean: -0.2,
  shapes: [
    // amber over the whole upper face and the grey bumper under it, under everything else
    { name: 'panel', outline: boxOutline(-1.5, 1.5, 1.36, 3.7), colour: AMBER, lift: 0.0015 },
    { name: 'bumper', outline: boxOutline(-1.5, 1.5, 0, 1.36), colour: BUMPER, lift: 0.0015 },
    // the black frames round the screens, out to the face's edge; the brow strip above them stays amber
    { name: 'screen-frame', outline: boxOutline(0.54, 1.5, 2.0, 3.2), colour: PANE_SEAL, lift: 0.003, mirror: true, inset: 0.012 },
    // the gangway door: its dark frame (up to the face's top), the lighter rim, the leaf and two handle recesses
    { name: 'door-frame', outline: boxOutline(-0.54, 0.54, 1.12, 3.7), colour: DOOR_FRAME, lift: 0.003, inset: 0.012 },
    { name: 'door-rim', outline: boxOutline(-0.37, 0.37, 1.2, 3.19, 0.015), colour: DOOR_RIM, lift: 0.0045 },
    { name: 'door-leaf', outline: boxOutline(-0.35, 0.35, 1.22, 3.17, 0.012), colour: AMBER_DOOR, lift: 0.006 },
    { name: 'door-handle', outline: boxOutline(0.11, 0.16, 2.17, 2.25), colour: DOOR_FRAME, lift: 0.0075, mirror: true },
    // the glass, and the two bands of sky over its upper rows
    { name: 'pane', outline: boxOutline(0.6, 1.5, 2.06, 3.16), glass: true, lift: 0.0045, mirror: true, inset: 0.05 },
    { name: 'pane-sky-high', outline: boxOutline(0.6, 1.5, 3.03, 3.16), colour: PANE_SKY_HI, lift: 0.0105, mirror: true, inset: 0.05 },
    { name: 'pane-sky-mid', outline: boxOutline(0.6, 1.5, 2.86, 3.03), colour: PANE_SKY_MID, lift: 0.0105, mirror: true, inset: 0.05 },
    // the destination display, behind the glass of the cab's right-hand screen, its corner under the brow; and the wipers, parked slantwise from each screen's inner foot
    { name: 'display', outline: boxOutline(0.66, 1.1, 2.84, 3.08, 0.01), colour: DISPLAY_PANEL, lift: 0.0135 },
    { name: 'display-text', outline: boxOutline(0.72, 1.04, 2.94, 3.0), colour: DISPLAY_TEXT, lift: 0.0165 },
    { name: 'wiper', outline: barOutline([0.66, 2.1], [1.0, 2.46], 0.035), colour: WIPER, lift: 0.0105, mirror: true },
    // a small lamp at the brow's middle (gn387_01_387114_ely: a round white lens under the roof's front)
    { name: 'roof-lamp', outline: discOutline(0, 3.4, 0.045), colour: ROOF_LAMP, lift: 0.0045 },
    // the lamp housings in the panels' lower outer corners, and their lenses: the headlight outboard, the smaller lamp inboard
    { name: 'lamp-housing', outline: boxOutline(0.61, 1.15, 1.40, 1.72, 0.1), colour: BEZEL, lift: 0.0165, mirror: true },
    { name: 'headlight', outline: discOutline(1.02, 1.56, 0.115), lens: 'head', lift: 0.019, mirror: true },
    { name: 'tail-lamp', outline: discOutline(0.77, 1.56, 0.085), lens: 'tail', lift: 0.019, mirror: true },
    // the coupler's head in its recess (the recess itself is train.ts's: it is drawn at a coupled unit's end too, where the head is the 3D coupler out in the gap)
    { name: 'coupler-head', outline: boxOutline(-0.22, 0.22, 0.76, 1.04, 0.02), colour: COUPLER_BODY, lift: 0.0045, trainEnd: true },
    { name: 'coupler-port', outline: discOutline(0.095, 0.9, 0.065), colour: COUPLER_PORT, lift: 0.006, mirror: true, trainEnd: true },
  ],
};
