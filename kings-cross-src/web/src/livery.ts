// Liveries for the model trains: the colours, the side texture the cab-end car wears, and the lettering.
// Nothing here is an image asset: the texture and the lettering atlas are drawn on a canvas, lazily,
// and only where there is a document (so the module also loads in Node, where the train test builds the
// geometry without any texture).
//
// How the paint is carried (it replaced one 2048 x 512 canvas per car, which was soft at three metres):
//   - the side texture covers only the first TEX_SPAN metres of a cab-end car, counted from its nose,
//     at about 160 texels a metre along and 240 up; a car with no cab (or the rest of a cab car)
//     samples its last column, so it carries only the bands that run the whole length;
//   - windows, doors, the cab glass and the roof are geometry, so they are crisp at any distance;
//   - lettering and the solid decals (a station band, a flash) are quads of a small canvas atlas, laid
//     per side so the words read the right way round on both sides of the train.
//
// How good is each colour? Three grades, stated per livery below:
//   sourced:     the colour is named in a source and the hue is a sensible reading of it;
//   approximate: the colour name is sourced, the exact shade is eyeballed;
//   placeholder: NO source; stands in until someone reads it from a photograph.
import * as THREE from 'three';
import { FIGURES, type Livery } from '../../core/train.ts';

/** One lettering or solid-colour decal, in the car's own frame: `s` is metres along the car, y metres above the rail head. */
export interface DecalItem {
  /** Text from the atlas, or null for a solid patch (coloured by `colour`). */
  text: string | null;
  colour: number;
  /** [s0, y0, s1, y1]. For text the width is set by the lettering's aspect, so s1 is ignored. */
  rect: [number, number, number, number];
  /** A solid patch's top edge is shifted this far along the car relative to its bottom edge (a diagonal flash). */
  skew?: number;
}

/** What a livery needs to know about a car to place its lettering. `s` runs from the cab end of a cab car, from the start of any other. */
export interface DecalCar {
  index: number;
  count: number;
  /** the car's code (DMSL, MFL, ...), for a livery that dresses one kind of car differently; absent where the livery does not care */
  type?: string;
  cab: boolean;
  length: number;
  /** length of the raked nose, 0 for a car with no cab */
  nose: number;
  /** door centres, in the same measure as `s` */
  doors: readonly number[];
}

export interface LiveryDef {
  /** The grade of each colour, for the reader of this file. */
  basis: string;
  /** What each source says; a reader can check a colour against these. */
  sources: readonly string[];
  body: number;
  /** roof, above the side texture */
  roof: number;
  /** the skirts and the underframe */
  skirt: number;
  /** door leaf */
  door: number;
  /** the panel across the very front of the nose */
  noseFront: number;
  /** the band across the nose below the windscreen (the LNER silver crescent) */
  noseBand: number;
  /** the whole nose cone in one colour, over the sweep and the front (null: the sweep and the front panels decide) */
  noseCone: number | null;
  /** how far back from the tip the cone's colour covers the nose's sides, metres (default: the whole nose; the roof and face stay the cone's colour): beyond it the body shows */
  noseConeLength?: number;
  /** the body colour under the windscreen glass */
  glass: number;
  /** the black window surround (null: the windows stand alone on the body) */
  surround: number | null;
  /** window glass */
  window: number;
  /** the sweep up the nose and side (null: none) */
  swoosh: number | null;
  /** a plain stripe below the windows (null: none) */
  stripe: number | null;
  /** where the stripe sits on the side, metres above the rail head (default STRIPE_Y): the Grand Central band is broad, the Thameslink one thin */
  stripeY?: [number, number];
  /** the door leaf's colour for one car, where it differs from `door` (Grand Central: gold on the first-class car, silver on the rest) */
  doorFor?(car: DecalCar): number;
  /** the dark band along the foot of the body, above the skirts (null: the body colour runs down) */
  foot: number | null;
  /** Lettering and solid decals for one car. */
  decals(car: DecalCar): DecalItem[];
}

const RED = 0xc8102e;

/** The stretch of the car between its two doors, for lettering: its two ends (door edges and a pier), and its middle. */
const bayEnds = (c: DecalCar): [number, number] => {
  const d = c.doors.length >= 2 ? c.doors : [3.0, c.length - 3.0];
  return [(d[0] as number) + 0.8, (d[d.length - 1] as number) - 0.8];
};
const bay = (c: DecalCar): number => {
  const [a, b] = bayEnds(c);
  return (a + b) / 2;
};

export const LIVERIES: Readonly<Record<Livery, LiveryDef>> = {
  // LNER: Kato and Hornby model descriptions say "red, white and black"; gbtrains.uk lists a red
  // sweep, the window surround, a silver crescent, a red lower nose and a yellow nose front. The
  // lower dark band and the "LNER" lettering follow the brief for this model. The colour names are
  // sourced; every shade, and where the lettering sits, is approximate.
  lner: {
    basis: 'colour names sourced (Kato, Hornby, gbtrains.uk); shades and the lettering position approximate',
    sources: [
      'Kato and Hornby product descriptions of the Class 800 (LNER): "red, white and black"',
      'gbtrains.uk/stock/800: a red sweep, a black window surround, a silver crescent, a red lower nose and a yellow nose front',
    ],
    body: 0xf2f2ee,
    roof: 0xe4e5e6,
    skirt: 0x3a3d42,
    door: 0xf2f2ee,
    noseFront: 0xf0c000,
    noseBand: 0xb5bbc2,
    noseCone: null,
    glass: 0x0e1014,
    surround: 0x131417,
    window: 0x3a4c60,
    swoosh: RED,
    stripe: null,
    foot: 0x2d3036,
    // white "LNER" on the red band, centred in the bay between the car's two doors
    decals: (c) => [{ text: 'LNER', colour: 0xffffff, rect: [bay(c) - 0.5 * textEms('LNER') * 0.42, 1.07, 0, 1.49] }],
  },
  // Lumo: every source that describes the 803 says blue ("overall blue livery, only broken up by the
  // white branding"; Hornby: "vivid blue"). The shade is a vivid blue by eye; the lowercase white
  // wordmark's size and position are a guess.
  lumo: {
    basis: 'blue sourced; the shade, and the size and position of the white wordmark, are approximate',
    sources: [
      'Railways Illustrated review of the Class 803 (2021), as quoted in a search snippet: "eye-catching in their overall blue livery, which is only broken up by the white branding on the exterior of the train"',
      'Hornby R30102 product page: "resplendent in a vivid blue Lumo \'Net-Zero Champion\' livery"',
    ],
    body: 0x1b4fd8,
    roof: 0xcfd3d8,
    skirt: 0x23262b,
    door: 0x1b4fd8,
    noseFront: 0x1b4fd8,
    noseBand: 0x1b4fd8,
    noseCone: null,
    glass: 0x0e1014,
    surround: null,
    window: 0x2a3a4c,
    swoosh: null,
    stripe: null,
    foot: null,
    decals: (c) => [{ text: 'lumo', colour: 0xffffff, rect: [bay(c) - 0.5 * textEms('lumo') * 0.7, 1.0, 0, 1.7] }],
  },
  // Hull Trains: "a smart dark blue colour scheme but with a rather dull grey/black front nose cone"
  // (Bus and Train User, 2020); "Hull Trains blue with a colourful vinyl stripe stating where Hull
  // Trains carries passengers, varying from Hull to Retford and London Kings Cross" and "non-yellow
  // fronts" (RailAdvent, 2019); doors "magenta" from one search snippet of the Railway Magazine
  // (2021) that could not be opened, so the door colour stays flagged. The shade of blue is
  // approximate, and which town is on which car, and the band colours, are guesses.
  hulltrains: {
    basis: 'dark blue body and dark grey/black nose cone sourced (two articles); door colour (magenta) from a single unopened snippet; shades, band colours and town order approximate',
    sources: [
      'busandtrainuser.com, "A paragon of a ride?" (2020-03-03): "The trains have been painted in a smart dark blue colour scheme but with a rather dull grey/black front nose cone"; each carriage has "a different coloured band below the windows" naming towns on the route',
      'railadvent.co.uk (2019), "A look at Hull Trains brand new fleet of Class 802 Paragon trains": "Hull Trains blue with a colourful vinyl stripe stating where Hull Trains carries passengers"; "non-yellow fronts"',
      'The Railway Magazine, "Final Paragon unit launched into traffic" (2021-11-01), seen only as a search snippet: "First Group dark blue livery with magenta-coloured doors"',
    ],
    body: 0x16305e,
    roof: 0xcfd3d8,
    skirt: 0x23262b,
    door: 0xb0147e,
    noseFront: 0x2d3138,
    noseBand: 0x2d3138,
    noseCone: 0x2d3138,
    // ASSUMED: in photographs (Wikimedia Commons, "802303 at Doncaster") the dull grey cone is only the beak, a bullet from the tip to about
    // a third of the way along the nose; the cheeks behind it are the body's blue. The face and the roof round the glass stay dark.
    noseConeLength: 1.6,
    glass: 0x0e1014,
    surround: null,
    window: 0x2a3a4c,
    swoosh: null,
    stripe: null,
    foot: null,
    decals: (c) => {
      const towns = ['Hull', 'Selby', 'Doncaster', 'Retford', 'Grantham', 'London'];
      const bands = [0x00a6d6, 0xf29400, 0x6cb33f, 0xe6007e, 0xffd100];
      const [a, b] = bayEnds(c);
      const em = 0.24;
      const name = towns[c.index % towns.length] as string;
      // a coloured band below the windows, a different colour on each car, with the town in white on it
      return [
        { text: null, colour: bands[c.index % bands.length] as number, rect: [a, 1.2, b, 1.5] },
        { text: name, colour: 0xffffff, rect: [(a + b) / 2 - 0.5 * textEms(name) * em, 1.23, 0, 1.23 + em] },
      ];
    },
  },
  // Great Northern: the Class 717 is "the same light grey livery with pastel blue doors and a white
  // diagonal flash at the carriage ends" as the Thameslink units (a 2018 article, seen as a search
  // snippet); the 387s came "in a white livery, with Southern green doors" (Wikipedia) and the 387/3s
  // later had dark blue doors. One scheme is used for both, on the 717's description. The cab front
  // is read from photographs, not from a text: pale like the body, with a dark top and glass surround
  // (Wikimedia Commons, "Great Northern Class 717 Desiro City at Palmers Green June 2019" and "Class 387 at Luton");
  // the first version drew it dark all over, a guess. The shades are approximate.
  greatnorthern: {
    basis: 'light grey body, pastel blue doors and white end flash from one 2018 article seen as a snippet (Class 717) and Wikipedia (Class 387: white, coloured doors); the pale cab front with a dark top and glass surround from two photographs; every shade approximate',
    sources: [
      'GTR Class 717 article, 2018, as a search snippet: "the same light grey livery with pastel blue doors and a white diagonal flash at the carriage ends"',
      'Wikipedia, British Rail Class 387: "delivered in a white livery, with Southern green doors"; a mirror of the page: the Great Northern 387/3s "very similar, but with dark-blue coloured doors instead of green"',
      'Wikimedia Commons photographs, "Great Northern Class 717 Desiro City at Palmers Green June 2019" (a white face under a black windscreen with a dark top) and "Class 387 at Luton" (a white front with a yellow panel)',
    ],
    body: 0xc9cdd3,
    roof: 0xb4b9c0,
    skirt: 0x30343a,
    door: 0x9cc3ee,
    noseFront: 0xd9dce1,
    noseBand: 0x2f3844,
    noseCone: null,
    glass: 0x0e1014,
    surround: null,
    window: 0x26364a,
    swoosh: null,
    stripe: null,
    foot: 0x41464e,
    decals: (c) => {
      const items: DecalItem[] = [];
      // a white diagonal flash across each end of the car: on a car with a cab, only its inner end
      const w = 0.55;
      for (const atStart of c.cab ? [false] : [true, false]) {
        const x0 = atStart ? 0.4 : c.length - 0.4 - w;
        items.push({ text: null, colour: 0xffffff, rect: [x0, 0.95, x0 + w, 3.0], skew: atStart ? 0.9 : -0.9 });
      }
      // "Great Northern" in dark blue, centred in the bay between the doors
      items.push({ text: 'Great Northern', colour: 0x24307a, rect: [bay(c) - 0.5 * textEms('Great Northern') * 0.4, 1.15, 0, 1.55] });
      return items;
    },
  },
  // Grand Central's Class 180: Wikipedia (Grand Central): "Initially, Grand Central adopted an all black livery with doors
  // painted gold (first class) and silver (standard class)" and "When the Class 180 was introduced, an orange band was
  // introduced"; a Class 180 article and a Wikipedia mirror call it a broad orange stripe at the waist. The band's exact
  // width and orange, the wordmark and its place on the band, and the grey roof are guesses; so is the yellow warning panel
  // on the front, which no source mentions (a train built for 125 mph in 2000 carried one; ASSUMED).
  grandcentral: {
    basis: 'all-black body, an orange band at the waist, gold and silver doors sourced (Wikipedia, "initially"); the band width, every shade, the lettering and the yellow warning panel on the front approximate',
    sources: [
      'Wikipedia, Grand Central (train operating company), Livery: "Initially, Grand Central adopted an all black livery with doors painted gold (first class) and silver (standard class)." and "When the Class 180 was introduced, an orange band was introduced."',
      'Wikipedia, British Rail Class 180: 180112 "was the first train to carry Grand Central\'s new logo and orange stripe livery"; a Class 180 fleet article (paulbigland.blog, 2023): "the standard stripe is orange", 180112\'s converted to green; a Wikipedia mirror: "a broad orange waistline stripe"',
    ],
    body: 0x17181c,
    roof: 0x4a4d53,
    skirt: 0x101114,
    door: 0xb9bec6,
    noseFront: 0x17181c,
    noseBand: 0x17181c,
    noseCone: null,
    glass: 0x0b0d10,
    surround: null,
    window: 0x222c38,
    swoosh: null,
    stripe: 0xf27a1a,
    stripeY: [1.04, 1.5],
    foot: null,
    // gold doors on the first-class car (MFL), silver on the others
    doorFor: (c) => (c.type === 'MFL' ? 0xc9a227 : 0xb9bec6),
    // the wordmark in black on the orange band, centred in the bay between the doors
    decals: (c) => [{ text: 'Grand Central', colour: 0x17181c, rect: [bay(c) - 0.5 * textEms('Grand Central') * 0.28, 1.13, 0, 1.41] }],
  },
  // Thameslink's Class 700: the 2013 First Capital Connect and Siemens announcement, repeated by Wikipedia: "light grey with
  // pastel blue doors and a white diagonal flash at the carriage ends". Forum posts (seen as search snippets; the threads
  // would not open) call the doors "bright cyan" and the stripe "a rather uninspiring little pink stripe", and say the 700s
  // "still have a yellow panel" on the cab front. The shades, the stripe, the lettering colour and where it sits are guesses.
  thameslink: {
    basis: 'light grey body, pastel blue doors and a white diagonal flash sourced (a 2013 announcement, Wikipedia); the thin pink stripe, the cyan of the doors and the yellow warning panel from forum snippets; every shade and the lettering approximate',
    sources: [
      'Wikipedia, British Rail Class 700: "light grey with pastel blue doors and a white diagonal flash at the carriage ends" (the livery announced by First Capital Connect and Siemens in 2013)',
      'RailForums threads on the Class 700 (search snippets only; the threads would not open): the doors "bright cyan", "Thameslink\'s Class 700s still have a yellow panel"; an RMweb post: the white 700s were redone as "the current rather uninspiring little pink stripe version"; Railway Magazine: the first unit with branding other than its "white base livery"',
    ],
    body: 0xd9dce1,
    roof: 0xb4b9c0,
    skirt: 0x30343a,
    door: 0x34a9e1,
    noseFront: 0xd9dce1,
    noseBand: 0xd9dce1,
    noseCone: null,
    glass: 0x0e1014,
    surround: null,
    window: 0x26364a,
    swoosh: null,
    stripe: 0xd2257c,
    stripeY: [1.12, 1.24],
    foot: 0x41464e,
    decals: (c) => {
      const items: DecalItem[] = [];
      // the same white diagonal flash across each end of the car as the Great Northern units (on a cab car, its inner end only)
      const w = 0.55;
      for (const atStart of c.cab ? [false] : [true, false]) {
        const x0 = atStart ? 0.4 : c.length - 0.4 - w;
        items.push({ text: null, colour: 0xffffff, rect: [x0, 0.95, x0 + w, 3.0], skew: atStart ? 0.9 : -0.9 });
      }
      // "Thameslink" in the pink of the stripe, centred in the bay between the doors
      items.push({ text: 'Thameslink', colour: 0xd2257c, rect: [bay(c) - 0.5 * textEms('Thameslink') * 0.32, 1.27, 0, 1.59] });
      return items;
    },
  },
};

/**
 * The scene's lights are set for the open air, and a shed interior under them renders every livery
 * about a third too dark (white reads as slate, LNER red as maroon). The trains' colours are
 * multiplied by this gain, in the vertices and in the side texture's material, so the liveries
 * read as themselves. A fudge for this scene's lighting, not a property of the paint.
 */
export const LIGHT_GAIN = 1.5;

// --- the side texture ----------------------------------------------------------------------------

/** The texture covers the side of the body from TEX_Y0 to TEX_Y1 (metres above the rail head). It spans both families: the Azuma's roof edge is 3.35 m, the EMUs' 3.6 m. */
export const TEX_Y0 = 0.45;
export const TEX_Y1 = 3.7;
/** ... and the first TEX_SPAN metres of a cab-end car, from the nose; beyond that (and on any other car) its last column is used. */
export const TEX_SPAN = 16;
export const TEX_W = 2560;
export const TEX_H = 768;
/** Texels a metre along the car and up it. */
export const texelsPerMetre = (): { along: number; up: number } => ({ along: TEX_W / TEX_SPAN, up: TEX_H / (TEX_Y1 - TEX_Y0) });
/** Texture u of a point `s` metres along a car from its cab end (clamped, so a through car reads the last column). */
export const texU = (s: number): number => Math.min(1, Math.max(0, s / TEX_SPAN));

/** Window glass top and bottom, and the black surround's. Read off photographs; not published. */
export const WINDOW_Y: [number, number] = [1.72, 2.72];
export const SURROUND_Y: [number, number] = [1.6, 2.86];
/** Lower red/stripe band on the side. */
export const BAND_Y: [number, number] = [1.0, 1.5];
/** Where a livery's plain stripe sits unless it says (LiveryDef.stripeY). */
export const STRIPE_Y: [number, number] = [1.2, 1.5];
/** Top of the dark foot band. */
export const FOOT_TOP = 1.0;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function paint(def: LiveryDef, nose: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const X = (s: number): number => (s / TEX_SPAN) * TEX_W;
  const Y = (y: number): number => (1 - (y - TEX_Y0) / (TEX_Y1 - TEX_Y0)) * TEX_H;
  const rect = (s0: number, s1: number, y0: number, y1: number): void => {
    g.fillRect(X(s0), Y(y1), X(s1) - X(s0), Y(y0) - Y(y1));
  };
  g.fillStyle = hex(def.body);
  g.fillRect(0, 0, TEX_W, TEX_H);

  if (def.foot !== null) {
    g.fillStyle = hex(def.foot);
    rect(0, TEX_SPAN, TEX_Y0, FOOT_TOP);
  }
  if (def.stripe !== null) {
    g.fillStyle = hex(def.stripe);
    const [y0, y1] = def.stripeY ?? STRIPE_Y;
    rect(nose > 0 ? nose : 0.3, TEX_SPAN, y0, y1);
  }
  if (def.swoosh !== null) {
    g.fillStyle = hex(def.swoosh);
    // a lower red band the length of the car, rising into a sweep over the first 13 m behind the nose
    rect(0, TEX_SPAN, BAND_Y[0], BAND_Y[1]);
    const reach = 13;
    g.beginPath();
    g.moveTo(X(0), Y(FOOT_TOP));
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const s = (reach * i) / steps;
      const top = BAND_Y[1] + 1.4 * (1 - s / reach) ** 2;
      g.lineTo(X(s), Y(top));
    }
    g.lineTo(X(reach), Y(FOOT_TOP));
    g.closePath();
    g.fill();
  }
  if (def.surround !== null) {
    g.fillStyle = hex(def.surround);
    // behind the cab: from the first door frame (2 m behind the nose) on. The cab side window is glass on the livery, not in the band.
    rect(nose > 0 ? nose + 2.0 : 0, TEX_SPAN, SURROUND_Y[0], SURROUND_Y[1]);
  }
  if (def.noseCone !== null && nose > 0) {
    g.fillStyle = hex(def.noseCone);
    rect(0, Math.min(nose, def.noseConeLength ?? nose), TEX_Y0, TEX_Y1);
  }
  return c;
}

const textures = new Map<string, THREE.CanvasTexture>();
const shells = new Map<string, THREE.MeshLambertMaterial>();

/**
 * The material for the side shell of a livery's cars. In a browser it carries the livery texture, painted
 * on first use and shared by every car of that livery and nose length; where there is no document (the
 * Node test) it is plain white, and the geometry is unchanged.
 */
export function shellMaterial(livery: Livery, nose: number): THREE.MeshLambertMaterial {
  const key = `${livery}/${nose.toFixed(2)}`;
  let m = shells.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(LIGHT_GAIN) });
    if (typeof document !== 'undefined') {
      let t = textures.get(key);
      if (!t) {
        t = new THREE.CanvasTexture(paint(LIVERIES[livery], nose));
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

// --- the lettering atlas --------------------------------------------------------------------------

/** Advance widths of Helvetica Bold, in thousandths of an em (the AFM file's figures). Used to size lettering the same way in a browser and in Node. */
const ADVANCE: Record<string, number> = {
  ' ': 278, "'": 238, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
};
/** Width of a text in ems (its advance widths summed, less a hair of side bearing). */
export const textEms = (text: string): number => [...text].reduce((a, ch) => a + (ADVANCE[ch] ?? 600), 0) / 1000;
/** The lettering's baseline sits this far up the quad, as a fraction of the em box, leaving room under it for descenders. */
export const BASELINE = 0.2;
/** Pixels an em of lettering is drawn at in the atlas (so, for lettering `em` metres tall, ROW_H / em texels a metre), and the atlas's size. */
export const ROW_H = 128;
const ATLAS_W = 2048;
/** The atlas is a row tall for every text and one more for the solid patch, so a livery's lettering never runs into it. */
const atlasH = (): number => (atlasTexts().length + 1) * ROW_H;

let texts: string[] | null = null;
/** Every text any livery uses, sorted, so the atlas is drawn once and a text always has the same row. */
export function atlasTexts(): string[] {
  if (texts) return texts;
  const set = new Set<string>();
  for (const def of Object.values(LIVERIES)) {
    for (const cab of [true, false]) {
      for (let index = 0; index < 6; index++) {
        for (const item of def.decals({ index, count: 6, cab, length: 25, nose: cab ? 5 : 0, doors: [] })) if (item.text) set.add(item.text);
      }
    }
  }
  texts = [...set].sort();
  return texts;
}

export interface AtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}
/** Where a text sits in the atlas. Texts come first, one per row, and a solid white patch is the last row. */
export function atlasRect(text: string | null): AtlasRect {
  // the solid patch: the bottom-left corner of the sheet, inset from its edges (see atlasTexture)
  const H = atlasH();
  if (text === null) return { u0: 8 / ATLAS_W, v0: 8 / H, u1: 24 / ATLAS_W, v1: 24 / H };
  const row = atlasTexts().indexOf(text);
  const width = Math.min(ATLAS_W, Math.ceil(textEms(text) * ROW_H) + 8);
  return { u0: 4 / ATLAS_W, u1: (4 + width - 8) / ATLAS_W, v0: 1 - ((row + 1) * ROW_H) / H, v1: 1 - (row * ROW_H) / H };
}

let atlas: THREE.CanvasTexture | null = null;
function atlasTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  const H = atlasH();
  c.width = ATLAS_W;
  c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, ATLAS_W, H);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'alphabetic';
  atlasTexts().forEach((text, row) => {
    g.save();
    g.font = `bold ${ROW_H}px Helvetica, Arial, "Liberation Sans", sans-serif`;
    // fit the text to the width the geometry will give it, so a different font cannot stretch it
    const want = textEms(text) * ROW_H;
    const have = g.measureText(text).width || want;
    g.translate(4, (row + 1) * ROW_H - BASELINE * ROW_H);
    g.scale(want / have, 1);
    g.fillText(text, 0, 0);
    g.restore();
  });
  // a solid patch in the bottom-left corner of the sheet for the plain decals, under the last text row
  g.fillRect(0, H - 32, 32, 32);
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  atlas.generateMipmaps = true;
  return atlas;
}

let decalMat: THREE.MeshLambertMaterial | null = null;
/**
 * The one material for every decal of every train: lettering and plain patches from the atlas, tinted by
 * the vertex colours. It is pulled toward the camera a little so a decal laid on the shell never z-fights
 * with it, near or far. Without a document (Node) it has no map.
 */
export function decalMaterial(): THREE.MeshLambertMaterial {
  if (!decalMat) {
    decalMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: false, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    decalMat.alphaToCoverage = true;
    const t = atlasTexture();
    if (t) decalMat.map = t;
  }
  return decalMat;
}
