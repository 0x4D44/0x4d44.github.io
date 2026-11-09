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

/** A coloured polygon of the side elevation: points are [s metres from the nose tip, y metres above the rail head]. */
export interface Shape {
  colour: number;
  pts: [number, number][];
}

export type Scheme = 'base' | 'lner' | 'grandcentral' | 'gn387' | 'gn717' | 'tl700';

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

// --- LNER ---------------------------------------------------------------------------------------

/** Top and bottom of the LNER red band beside the windows (metres above the rail head): the band holds the whole window row. Read off lner-801-214-2025 against its door height (the leaf is 1.15 to 2.86 m). */
export const LNER_BAND: [number, number] = [1.52, 2.97];

/**
 * The Azuma's side. lner-801-214-2025 (a 5-car 801 at Doncaster-area track) and lner-800-doncaster-2026: white car sides, one
 * unbroken RED band holding the whole row of windows (not a band under them), a white lower body below it down to the underframe,
 * a thin light-orange pinstripe at the cantrail. At the cab the red leaves the band, swings down the cab side in a sweep and
 * wraps the nose's flank round to the cheeks beside the yellow mask; a pale silver crescent edges the sweep's top. The numbers
 * are readings off those two photographs, not a drawing: the sweep's top edge climbs from the cheek (0 m, the top of the face)
 * to the band's top by about 1.6 m behind the cab door, and the white lower body ends in a tongue just behind the door.
 */
function lnerShapes(nose: number): Shape[] {
  const bandTop = LNER_BAND[1];
  const bandBottom = LNER_BAND[0];
  const sA = nose + 1.6;
  const top = smoothCurve([[0, 1.8], [1.0, 1.95], [2.0, 2.15], [3.5, 2.35], [5.0, 2.6], [sA, bandTop], [TEX_SPAN, bandTop]], 64);
  // the white lower body's front end: a tongue, level at the band's bottom edge and falling away to the floor just behind the cab door
  const tongue = smoothCurve([[nose + 0.8, TEX_Y0], [nose + 1.8, 1.0], [nose + 2.6, 1.32], [nose + 3.4, bandBottom], [TEX_SPAN, bandBottom]], 48);
  // the polygon: along the top edge to the car's end, back along the white lower body's edge, then along the bottom of the texture to the nose
  const red: [number, number][] = [...between(top, tongue), [0, TEX_Y0]];
  const crescentTop = top.filter((p) => p[0] <= sA).map((p): [number, number] => [p[0], p[1] + 0.1]);
  const crescent = between(crescentTop, top.filter((p) => p[0] <= sA));
  return [
    { colour: 0x2d3036, pts: rect(0, TEX_SPAN, TEX_Y0, 1.0) },
    { colour: LNER_RED, pts: red },
    { colour: 0xb5bbc2, pts: crescent },
    // the pinstripe: a line a few millimetres' thick along the cantrail behind the cab (it is only a hint at scale)
    { colour: 0xe8683a, pts: rect(sA, TEX_SPAN, 3.03, 3.07) },
  ];
}

// --- Grand Central ------------------------------------------------------------------------------

/**
 * The Class 180's side. GC180-01-180-101-Kings-Cross (a 180 at Kings Cross, 2012?) and GC180-05-Grand-Central-at-Halifax (180112):
 * black body, a broad orange band at the waist, and at the cab the band swings down the cab side in a sweep that widens
 * downward and ends under the lamp pod at the nose's lower corner; a thin orange pinstripe runs along the cantrail. The band
 * edges (1.04 to 1.5 m) are livery.ts's; the sweep is read from the two photographs.
 */
function grandCentralShapes(nose: number): Shape[] {
  const bandTop = 1.5;
  const bandBottom = 1.04;
  const sD = nose + 1.2;
  const top = smoothCurve([[0.1, 0.78], [0.7, 1.0], [1.5, 1.2], [nose, 1.38], [sD, bandTop], [TEX_SPAN, bandTop]], 48);
  const bottom = smoothCurve([[0.1, TEX_Y0], [0.7, 0.5], [1.5, 0.62], [nose, 0.78], [sD, bandBottom], [TEX_SPAN, bandBottom]], 48);
  return [
    { colour: GC_ORANGE, pts: between(top, bottom) },
    { colour: GC_ORANGE, pts: rect(nose, TEX_SPAN, 3.02, 3.06) },
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
  noseTopFrom: 3.2,
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
  // door between them, is black, over a white lower front; a black dome continues over the roof's front
  noseTop: 0x1a1c21,
  noseTopFrom: 0,
});

const TL700: TrainLivery = asTrainLivery(LIVERIES.thameslink, {
  scheme: 'tl700',
  noseTop: 0x1a2030,
  noseTopFrom: 0.9,
});

// Grand Central: the sweep and the pinstripe are this module's; the black body, the doors and the lettering are livery.ts's.
const GC: TrainLivery = asTrainLivery(LIVERIES.grandcentral, {
  scheme: 'grandcentral',
  stripe: null,
  sources: [...LIVERIES.grandcentral.sources, 'photographs (private review set): GC180-01-180-101-Kings-Cross and GC180-05-Grand-Central-at-Halifax show the orange band sweeping down the cab side and a thin orange pinstripe'],
});

const BY_KIND: Partial<Record<TrainKind, TrainLivery>> = {
  lner5: LNER,
  lner9: LNER,
  gn387x4: GN387,
  gn387x8: GN387,
  gn387x12: GN387,
  gn717x6: GN717,
  gc180x5: GC,
  tl700x8: TL700,
  tl700x12: TL700,
};

/** The livery a kind wears. Kinds without an entry (Hull Trains, Lumo) wear their operator's livery.ts row unchanged. */
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
