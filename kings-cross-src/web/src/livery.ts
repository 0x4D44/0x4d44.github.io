// Liveries for the Hitachi AT300 trains: the colour constants, and the side texture each car body
// wears. Nothing here is an image asset: the texture is drawn on a canvas, lazily, and only where
// there is a document (so the module also loads in Node, where the train test builds the geometry
// without any texture).
//
// How good is each colour? Three grades, stated per livery below:
//   sourced:     the colour is named in a source and the hue is a sensible reading of it;
//   approximate: the colour name is sourced, the exact shade is eyeballed;
//   placeholder: NO source; stands in until someone reads it from a photograph.
import * as THREE from 'three';
import { FIGURES, type Livery } from '../../core/train.ts';

/** What a car needs to tell the painter about itself. All distances in metres along the car from
 * its cab end (driving cars) or from its start (the rest). */
export interface CarPlan {
  length: number;
  /** length of the raked nose, 0 for a car with no cab */
  nose: number;
  doors: number[];
  /** [from, to] of each passenger window */
  windows: [number, number][];
}

export interface LiveryDef {
  /** The grade of each colour, for the reader of this file. */
  basis: string;
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
  /** windscreen glass */
  glass: number;
  /** the black window surround (null: the windows stand alone on the body) */
  surround: number | null;
  /** window glass */
  window: number;
  /** the sweep up the nose and side (null: none) */
  swoosh: number | null;
  /** a plain stripe below the windows (null: none) */
  stripe: number | null;
}

export const LIVERIES: Readonly<Record<Livery, LiveryDef>> = {
  // LNER: Kato and Hornby model descriptions say "red, white and black"; gbtrains.uk lists a red
  // sweep, the window surround, a silver crescent, a red lower nose and a yellow nose front.
  // The colour names are sourced; every shade is approximate.
  lner: {
    basis: 'colour names sourced (Kato, Hornby, gbtrains.uk); shades approximate',
    body: 0xf2f2ee,
    roof: 0xe4e5e6,
    skirt: 0x3a3d42,
    door: 0xf2f2ee,
    noseFront: 0xf0c000,
    noseBand: 0xb5bbc2,
    glass: 0x0e1014,
    surround: 0x131417,
    window: 0x3a4c60,
    swoosh: 0xc8102e,
    stripe: null,
  },
  // Lumo: every source that describes the 803 says blue. The shade is a vivid blue by eye;
  // the white stripe is the optional lettering band, with no source. Approximate.
  lumo: {
    basis: 'blue sourced; the shade and the white stripe are approximate',
    body: 0x1b4fd8,
    roof: 0xcfd3d8,
    skirt: 0x23262b,
    door: 0x1b4fd8,
    noseFront: 0x1b4fd8,
    noseBand: 0x1b4fd8,
    glass: 0x0e1014,
    surround: null,
    window: 0x2a3a4c,
    swoosh: null,
    stripe: 0xf4f6f8,
  },
  // Hull Trains: NO source for the colours. This is an unsourced PLACEHOLDER (a dark blue-grey
  // body with a light band) to be replaced from a photograph of a 802.
  hulltrains: {
    basis: 'PLACEHOLDER: no source for any colour; replace from a photograph',
    body: 0x3b4658,
    roof: 0xcfd3d8,
    skirt: 0x23262b,
    door: 0x3b4658,
    noseFront: 0x3b4658,
    noseBand: 0x3b4658,
    glass: 0x0e1014,
    surround: null,
    window: 0x2a3a4c,
    swoosh: null,
    stripe: 0xc8d2dc,
  },
};

/**
 * The scene's lights are set for the open air, and a shed interior under them renders every livery
 * about a third too dark (white reads as slate, LNER red as maroon). The trains' colours are
 * multiplied by this gain, in the vertices and in the side texture's material, so the liveries
 * read as themselves. A fudge for this scene's lighting, not a property of the paint.
 */
export const LIGHT_GAIN = 1.5;

/** The texture covers the side of the body from TEX_Y0 to TEX_Y1 (metres above the rail head). */
export const TEX_Y0 = 0.7;
export const TEX_Y1 = FIGURES.roofEdgeHeight.value;
const TEX_W = 2048;
const TEX_H = 512;

/** Window glass top and bottom, and the black surround's. Read off photographs; not published. */
export const WINDOW_Y: [number, number] = [1.72, 2.72];
const SURROUND_Y: [number, number] = [1.6, 2.86];
/** Lower red/stripe band on the side. */
const BAND_Y: [number, number] = [1.0, 1.5];

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function paint(def: LiveryDef, plan: CarPlan): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const X = (s: number): number => (s / plan.length) * TEX_W;
  const Y = (y: number): number => (1 - (y - TEX_Y0) / (TEX_Y1 - TEX_Y0)) * TEX_H;
  const rect = (s0: number, s1: number, y0: number, y1: number): void => {
    g.fillRect(X(s0), Y(y1), X(s1) - X(s0), Y(y0) - Y(y1));
  };
  g.fillStyle = hex(def.body);
  g.fillRect(0, 0, TEX_W, TEX_H);

  const bandFrom = plan.nose > 0 ? plan.nose - 2.2 : 0.3;
  if (def.stripe !== null) {
    g.fillStyle = hex(def.stripe);
    rect(plan.nose > 0 ? plan.nose : 0.3, plan.length - 0.3, 1.2, 1.5);
  }
  if (def.swoosh !== null) {
    g.fillStyle = hex(def.swoosh);
    // a lower red band the length of the car, rising into a sweep over the first 13 m behind the nose
    rect(0, plan.length, BAND_Y[0], BAND_Y[1]);
    if (plan.nose > 0) {
      const reach = 13;
      g.beginPath();
      g.moveTo(X(0), Y(BAND_Y[0]));
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const s = (reach * i) / steps;
        const top = BAND_Y[1] + 1.4 * (1 - s / reach) ** 2;
        g.lineTo(X(s), Y(top));
      }
      g.lineTo(X(reach), Y(BAND_Y[0]));
      g.closePath();
      g.fill();
    }
  }
  if (def.surround !== null) {
    g.fillStyle = hex(def.surround);
    rect(bandFrom, plan.length - 0.3, SURROUND_Y[0], SURROUND_Y[1]);
  }
  g.fillStyle = hex(def.window);
  for (const [a, b] of plan.windows) {
    const r = 10;
    const x = X(a);
    const y = Y(WINDOW_Y[1]);
    const w = X(b) - X(a);
    const h = Y(WINDOW_Y[0]) - Y(WINDOW_Y[1]);
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
    // a pale sky-reflection along the top of the glass, so it reads as glass
    g.fillStyle = 'rgba(190,210,230,0.16)';
    g.fillRect(x + 4, y + 3, w - 8, h * 0.28);
    g.fillStyle = hex(def.window);
  }
  // the cab's side window, on the nose
  if (plan.nose > 0) {
    g.fillStyle = hex(def.glass);
    g.beginPath();
    g.moveTo(X(plan.nose - 2.6), Y(2.72));
    g.lineTo(X(plan.nose - 0.5), Y(2.72));
    g.lineTo(X(plan.nose - 0.5), Y(2.0));
    g.lineTo(X(plan.nose - 2.0), Y(2.0));
    g.closePath();
    g.fill();
  }
  // the gap between cars: a dark line at each end
  g.fillStyle = 'rgba(15,16,18,0.9)';
  rect(0, 0.04, TEX_Y0, TEX_Y1);
  rect(plan.length - 0.04, plan.length, TEX_Y0, TEX_Y1);
  return c;
}

const textures = new Map<string, THREE.CanvasTexture>();
const shells = new Map<string, THREE.MeshLambertMaterial>();

/**
 * The material for a car's side shell. In a browser it carries the livery texture, painted on first
 * use and shared by every car of the same role; where there is no document (the Node test) it is
 * plain white, and the geometry is unchanged.
 */
export function shellMaterial(livery: Livery, role: string, plan: CarPlan): THREE.MeshLambertMaterial {
  const key = `${livery}/${role}`;
  let m = shells.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(LIGHT_GAIN) });
    if (typeof document !== 'undefined') {
      let t = textures.get(key);
      if (!t) {
        t = new THREE.CanvasTexture(paint(LIVERIES[livery], plan));
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        textures.set(key, t);
      }
      m.map = t;
    }
    shells.set(key, m);
  }
  return m;
}
