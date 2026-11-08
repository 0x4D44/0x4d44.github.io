// Shared procedural materials for the station: brick, stone, slate, platform surfaces, ballast,
// glazing, windows. No image assets: every texture is drawn on a canvas the first time a material
// is asked for, and only where there is a document (so this module also loads in Node, where
// the materials come back flat-coloured with the texture's average colour and the tests run).
//
// THE CONTRACT. A tiled material expects the geometry's UVs in METRES, and sets
// `texture.repeat = 1 / tile` so one texture tile covers `tile` metres of the real thing. So a wall
// that is 12 m long and 6 m tall carries UVs running 0..12 and 0..6, whatever its triangles
// look like, and the bricks come out the size of bricks. `boxProjectUV` puts that on any
// axis-aligned geometry; `wallUV` does it for one vertical quad in any direction. The sheet
// textures (windows) are drawn once over a quad of `tile` metres and clamp at the edges.
//
// TEXTURES records, for each texture, the metres one tile covers, the canvas size, and the range of
// texels per metre it is allowed (tests/materials.test.ts holds every texture to its range and to
// square texels, so none is stretched).
//
// Using it:
//   import { material } from './materials.ts';
//   mesh.material = material('brick');   // shared, cached; never mutate it, clone first
import * as THREE from 'three';

export const IN = 0.0254; // metres per inch

export type TextureName = 'brick' | 'stone' | 'slate' | 'asphalt' | 'platformEdge' | 'ballast' | 'roofGlass' | 'window' | 'windowArch' | 'floorSlab';

export interface TextureSpec {
  /** metres one tile covers: [along u, along v] */
  tile: [number, number];
  /** canvas size, pixels */
  px: [number, number];
  /** allowed texels per metre on both axes (the stretch guard in the tests) */
  density: [number, number];
  /** the average colour: the Node fallback and the tint a distant surface settles to */
  average: number;
  /** tiles over a surface (true) or is drawn once over a quad (false) */
  repeat: boolean;
  /** where the real-world dimensions come from; anything guessed says ASSUMED */
  source: string;
}

export const TEXTURES: Readonly<Record<TextureName, TextureSpec>> = {
  // Flemish bond, 8 courses by 4 header-and-stretcher periods. The brick is the standard Imperial
  // 9 x 4.5 x 3 in with a 3/8 in joint, four courses to the foot; so a course is 3 in, a period
  // (stretcher + header + two joints) 14.25 in, and a tile 57 x 24 in. The joint width is ASSUMED.
  brick: { tile: [57 * IN, 24 * IN], px: [579, 244], density: [350, 450], average: 0xa0895a, repeat: true,
    source: 'Imperial brick 9 x 4.5 x 3 in, four courses to the foot; joint 3/8 in ASSUMED' },
  // Ashlar: 0.6 x 0.3 m blocks (two across, two courses). ASSUMED block size.
  stone: { tile: [1.2, 0.6], px: [360, 180], density: [250, 350], average: 0xc8c0aa, repeat: true,
    source: 'ASSUMED block size 0.6 x 0.3 m' },
  // Welsh slate 600 x 300 mm laid with a 250 mm gauge: four slates across, four courses. Slate
  // sizes are standard trade sizes; that the roof is slate-grey is the brief's, the shade ASSUMED.
  slate: { tile: [1.2, 1.0], px: [192, 160], density: [140, 200], average: 0x525a63, repeat: true,
    source: 'slate 600 x 300 mm, 250 mm gauge (trade size); shade ASSUMED' },
  asphalt: { tile: [2, 2], px: [256, 256], density: [100, 160], average: 0x4b4e53, repeat: true,
    source: 'ASSUMED: tarmac platform surface, grain drawn at 128 texels per metre' },
  // Platform edge, drawn across the strip (u, 0..1.6 m from the edge inboard) and tiled along it
  // (v, 0.5 m). ASSUMED widths: coping 0.2 m, yellow tactile warning strip 0.2-0.6 m (the UK strip
  // is about 0.4 m wide: DfT, Guidance on the use of tactile paving surfaces), white line 1.05-1.15 m.
  platformEdge: { tile: [1.6, 0.5], px: [320, 100], density: [150, 250], average: 0x6f6a55, repeat: true,
    source: 'tactile strip about 0.4 m wide (DfT tactile paving guidance); offsets ASSUMED' },
  ballast: { tile: [2, 2], px: [256, 256], density: [100, 160], average: 0x5f5b54, repeat: true,
    source: 'ASSUMED: crushed stone drawn at 128 texels per metre' },
  // Roof glazing: panes 0.9 m across the strip, 1.8 m along it between astragal bars. ASSUMED pane size.
  roofGlass: { tile: [0.9, 1.8], px: [90, 180], density: [80, 120], average: 0x7d95a8, repeat: true,
    source: 'ASSUMED pane size 0.9 x 1.8 m' },
  // A sash window with a stone surround on a 1.4 x 2.6 m quad. ASSUMED size and sash pattern.
  window: { tile: [1.4, 2.6], px: [224, 416], density: [140, 180], average: 0x4d5a68, repeat: false,
    source: 'ASSUMED: 1.4 x 2.6 m window with surround' },
  windowArch: { tile: [1.4, 2.6], px: [224, 416], density: [140, 180], average: 0x4d5a68, repeat: false,
    source: 'ASSUMED: 1.4 x 2.6 m round-headed window with surround' },
  // The concourse floor: pale grey stone paving in slabs 1.2 m square (two by two to a tile). ASSUMED slab size.
  floorSlab: { tile: [2.4, 2.4], px: [288, 288], density: [100, 140], average: 0x9ea2a8, repeat: true,
    source: 'ASSUMED: 1.2 m square paving slabs' },
};

/** Texels per metre on each axis. */
export function texelsPerMetre(spec: Pick<TextureSpec, 'tile' | 'px'>): [number, number] {
  return [spec.px[0] / spec.tile[0], spec.px[1] / spec.tile[1]];
}

// ---------------------------------------------------------------------------------------------
// drawing helpers

type Ctx = CanvasRenderingContext2D;

/** Deterministic random numbers in [0, 1): the same textures every load, so screenshots compare. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const chan = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const clamp8 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
/** Mix two 0xRRGGBB colours (t = 0 gives a), then scale the lightness by `k`. */
function tone(a: number, b: number, t: number, k = 1): string {
  const [ar, ag, ab] = chan(a);
  const [br, bg, bb] = chan(b);
  return `rgb(${clamp8((ar + (br - ar) * t) * k)},${clamp8((ag + (bg - ag) * t) * k)},${clamp8((ab + (bb - ab) * t) * k)})`;
}

/** Draw `fn` at (x, y) and at its wrapped copies, so a mark near an edge tiles seamlessly. */
function wrapped(w: number, h: number, x: number, y: number, size: number, fn: (x: number, y: number) => void): void {
  for (const dx of x < size ? [0, w] : x > w - size ? [-w, 0] : [0]) for (const dy of y < size ? [0, h] : y > h - size ? [-h, 0] : [0]) fn(x + dx, y + dy);
}

// ---------------------------------------------------------------------------------------------
// painters

function paintBrick(g: Ctx, w: number, h: number): void {
  const r = rng(11);
  const pxm = w / TEXTURES.brick.tile[0];
  const course = 3 * IN * pxm;
  const stretcher = 9 * IN * pxm;
  const header = 4.5 * IN * pxm;
  const joint = 0.375 * IN * pxm;
  const period = stretcher + header + 2 * joint;
  g.fillStyle = '#a29d8c'; // lime mortar
  g.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) {
    const y = row * course;
    const shift = (row % 2) * (period / 2);
    for (let k = -1; k <= 4; k++) {
      for (const isHeader of [false, true]) {
        const x0 = k * period + shift + (isHeader ? stretcher + joint : 0);
        const len = isHeader ? header : stretcher;
        const dark = r() < 0.03; // an overburnt brick
        // London stock is yellow-buff; the headers of a Flemish bond are burnt darker, blue-grey to brown.
        const base = isHeader ? tone(0x7c6e58, 0x6b6660, r(), 0.9 + r() * 0.2) : tone(0xb9a26c, 0x9d8656, r(), 0.9 + r() * 0.18);
        g.fillStyle = dark ? tone(0x5e5448, 0x4a4540, r()) : base;
        g.fillRect(x0, y + joint, len, course - joint);
        g.fillStyle = 'rgba(255,245,210,0.13)'; // the lit top arris
        g.fillRect(x0, y + joint, len, Math.max(1, joint * 0.35));
        g.fillStyle = 'rgba(0,0,0,0.14)'; // the shaded underside
        g.fillRect(x0, y + course - Math.max(1.2, joint * 0.4), len, Math.max(1.2, joint * 0.4));
        for (let s = 0; s < 4; s++) {
          g.fillStyle = r() < 0.5 ? 'rgba(60,45,25,0.16)' : 'rgba(255,240,190,0.10)';
          g.fillRect(x0 + r() * len, y + joint + r() * (course - joint), 1.5 + r() * 2, 1 + r() * 1.5);
        }
      }
    }
  }
  // wrap-around: bricks at the right edge continue from the left, which the 4-period tile guarantees
}

function paintStone(g: Ctx, w: number, h: number): void {
  const r = rng(23);
  g.fillStyle = '#a8a392';
  g.fillRect(0, 0, w, h);
  const bw = w / 2;
  const bh = h / 2;
  const j = 2;
  for (let row = 0; row < 2; row++) {
    for (let k = -1; k < 3; k++) {
      const x = k * bw + (row % 2) * (bw / 2);
      g.fillStyle = tone(0xd4ccb6, 0xc2baa2, r(), 0.94 + r() * 0.1);
      g.fillRect(x + j / 2, row * bh + j / 2, bw - j, bh - j);
      for (let s = 0; s < 40; s++) {
        g.fillStyle = r() < 0.5 ? 'rgba(90,80,60,0.10)' : 'rgba(255,255,240,0.14)';
        g.fillRect(x + r() * bw, row * bh + r() * bh, 1 + r() * 2.5, 1 + r() * 1.5);
      }
    }
  }
}

function paintSlate(g: Ctx, w: number, h: number): void {
  const r = rng(37);
  g.fillStyle = '#343a41';
  g.fillRect(0, 0, w, h);
  const sw = w / 4;
  const sh = h / 4;
  for (let row = 0; row < 4; row++) {
    for (let k = -1; k < 5; k++) {
      const x = k * sw + (row % 2) * (sw / 2);
      g.fillStyle = tone(0x606a75, 0x4d5560, r(), 0.88 + r() * 0.22);
      g.fillRect(x + 0.5, row * sh, sw - 1, sh - 1);
      g.fillStyle = 'rgba(0,0,0,0.28)'; // shadow under the course above
      g.fillRect(x + 0.5, row * sh, sw - 1, 2);
      g.fillStyle = 'rgba(255,255,255,0.07)'; // lit lower edge
      g.fillRect(x + 0.5, (row + 1) * sh - 2, sw - 1, 1);
    }
  }
}

function paintAsphalt(g: Ctx, w: number, h: number): void {
  const r = rng(41);
  g.fillStyle = '#4a4d52';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) { // faint patches of re-laid surface
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.03)';
    const x = r() * w;
    const y = r() * h;
    const pw = 30 + r() * 80;
    const ph = 20 + r() * 60;
    wrapped(w, h, x, y, 100, (px, py) => g.fillRect(px, py, pw, ph));
  }
  for (let i = 0; i < 5200; i++) {
    const x = r() * w;
    const y = r() * h;
    const v = r();
    g.fillStyle = v < 0.45 ? `rgba(20,22,26,${0.2 + r() * 0.25})` : `rgba(${150 + r() * 70},${150 + r() * 70},${150 + r() * 60},${0.12 + r() * 0.2})`;
    wrapped(w, h, x, y, 4, (px, py) => g.fillRect(px, py, 1 + (r() < 0.2 ? 1 : 0), 1 + (r() < 0.2 ? 1 : 0)));
  }
}

function paintBallast(g: Ctx, w: number, h: number): void {
  const r = rng(53);
  g.fillStyle = '#3b3a37';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 3600; i++) {
    const x = r() * w;
    const y = r() * h;
    const s = 3 + r() * 5;
    const grey = 70 + r() * 90;
    const warm = r() * 14;
    wrapped(w, h, x, y, s + 2, (px, py) => {
      g.fillStyle = `rgb(${clamp8(grey + warm)},${clamp8(grey + warm * 0.6)},${clamp8(grey)})`;
      g.beginPath();
      g.moveTo(px, py + s * 0.4);
      g.lineTo(px + s * 0.5, py);
      g.lineTo(px + s, py + s * 0.35);
      g.lineTo(px + s * 0.8, py + s * 0.95);
      g.lineTo(px + s * 0.1, py + s * 0.8);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(px + s * 0.2, py + s * 0.78, s * 0.7, 1.2);
    });
  }
}

function paintPlatformEdge(g: Ctx, w: number, h: number): void {
  const pxm = w / TEXTURES.platformEdge.tile[0];
  const r = rng(61);
  const band = (a: number, b: number, fill: string): void => {
    g.fillStyle = fill;
    g.fillRect(a * pxm, 0, (b - a) * pxm, h);
  };
  band(0, 0.2, '#a6a6a0'); // coping stones
  band(0.2, 0.6, '#d9b21a'); // yellow tactile strip
  band(0.6, 1.6, '#4a4d52'); // tarmac
  band(1.05, 1.15, '#e6e6de'); // white line
  g.fillStyle = 'rgba(0,0,0,0.35)'; // the joint between coping and strip, and the coping's own joints
  g.fillRect(0.2 * pxm - 1, 0, 2, h);
  for (let y = 0; y < h; y += 0.25 * pxm) g.fillRect(0, y, 0.2 * pxm, 1.5);
  // truncated domes on a 0.06 m pitch, two flat rows of dots per 0.12 m, drawn lit on top and shaded under
  const pitch = 0.0625 * pxm;
  for (let ix = 0; ix < 6; ix++) {
    for (let iy = 0; iy < 8; iy++) {
      const cx = 0.23 * pxm + (ix + 0.5) * pitch + ((iy % 2) * pitch) / 2;
      const cy = (iy + 0.5) * pitch;
      if (cx > 0.58 * pxm) continue;
      g.fillStyle = 'rgba(120,90,0,0.55)';
      g.beginPath(); g.arc(cx + 0.7, cy + 0.9, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2cf3c';
      g.beginPath(); g.arc(cx, cy, 2.3, 0, Math.PI * 2); g.fill();
    }
  }
  for (let i = 0; i < 500; i++) { // wear
    g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.1})`;
    g.fillRect(r() * w, r() * h, 1.5, 1.5);
  }
}

function paintRoofGlass(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(150,190,215,0.30)'; // tinted glass
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(235,245,255,0.18)'; // a sheen across each pane
  g.fillRect(0, 0, w, h * 0.35);
  g.fillStyle = 'rgba(48,56,64,0.95)'; // astragal bars
  g.fillRect(0, 0, 3, h); // across the pane edge
  g.fillRect(0, 0, w, 4);
}

/** A sash window with its stone surround, drawn once over a quad of TEXTURES.window.tile metres. */
function paintWindow(g: Ctx, w: number, h: number, arched: boolean): void {
  const stone = '#cfc7b0';
  const pxm = w / TEXTURES.window.tile[0];
  g.clearRect(0, 0, w, h);
  const sx = 0.14 * pxm; // surround thickness
  // surround
  g.fillStyle = stone;
  g.beginPath();
  if (arched) {
    g.moveTo(0, h); g.lineTo(0, w / 2); g.arc(w / 2, w / 2, w / 2, Math.PI, 0); g.lineTo(w, h);
  } else {
    g.rect(0, 0, w, h);
  }
  g.closePath(); g.fill();
  // reveal (the dark recess) then glass
  const gx = sx;
  const gw = w - 2 * sx;
  const gy = sx;
  g.fillStyle = '#22262c';
  g.beginPath();
  if (arched) {
    g.moveTo(gx, h - sx * 0.6); g.lineTo(gx, w / 2); g.arc(w / 2, w / 2, gw / 2, Math.PI, 0); g.lineTo(gx + gw, h - sx * 0.6);
  } else {
    g.rect(gx, gy, gw, h - sx * 1.6);
  }
  g.closePath(); g.fill();
  const inset = 0.05 * pxm;
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, '#7f98ad');
  lg.addColorStop(1, '#3b4856');
  g.fillStyle = lg;
  g.beginPath();
  if (arched) {
    g.moveTo(gx + inset, h - sx * 0.6 - inset); g.lineTo(gx + inset, w / 2); g.arc(w / 2, w / 2, gw / 2 - inset, Math.PI, 0); g.lineTo(gx + gw - inset, h - sx * 0.6 - inset);
  } else {
    g.rect(gx + inset, gy + inset, gw - 2 * inset, h - sx * 1.6 - 2 * inset);
  }
  g.closePath(); g.fill();
  // sash bars: two columns by four rows
  g.strokeStyle = '#e9e6dc';
  g.lineWidth = Math.max(2, 0.03 * pxm);
  g.beginPath();
  g.moveTo(w / 2, gy); g.lineTo(w / 2, h - sx * 1.2);
  for (let i = 1; i < 4; i++) { const y = gy + ((h - sx * 2.4) * i) / 4 + (arched ? w / 4 : 0) * (i / 4); g.moveTo(gx, y); g.lineTo(gx + gw, y); }
  g.stroke();
  // cill
  g.fillStyle = '#b9b19b';
  g.fillRect(0, h - sx, w, sx);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, h - sx, w, 2);
}

function paintFloorSlab(g: Ctx, w: number, h: number): void {
  const r = rng(71);
  g.fillStyle = '#767a81'; // the joints
  g.fillRect(0, 0, w, h);
  const sw = w / 2;
  const sh = h / 2;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      g.fillStyle = tone(0xb2b6bc, 0xa2a6ad, r(), 0.94 + r() * 0.08);
      g.fillRect(col * sw + 1.5, row * sh + 1.5, sw - 3, sh - 3);
      for (let s = 0; s < 70; s++) { // stone grain
        g.fillStyle = r() < 0.5 ? 'rgba(60,64,72,0.10)' : 'rgba(255,255,255,0.13)';
        g.fillRect(col * sw + 2 + r() * (sw - 5), row * sh + 2 + r() * (sh - 5), 1 + r() * 2.5, 1 + r() * 2);
      }
    }
  }
}

const PAINTERS: Readonly<Record<TextureName, (g: Ctx, w: number, h: number) => void>> = {
  brick: paintBrick,
  stone: paintStone,
  slate: paintSlate,
  asphalt: paintAsphalt,
  platformEdge: paintPlatformEdge,
  ballast: paintBallast,
  roofGlass: paintRoofGlass,
  window: (g, w, h) => paintWindow(g, w, h, false),
  windowArch: (g, w, h) => paintWindow(g, w, h, true),
  floorSlab: paintFloorSlab,
};
export { PAINTERS };

// ---------------------------------------------------------------------------------------------
// textures and materials

const textures = new Map<TextureName, THREE.CanvasTexture | null>();

/** The canvas texture for `name`, or null where there is no document (Node). Cached. */
export function texture(name: TextureName): THREE.CanvasTexture | null {
  if (textures.has(name)) return textures.get(name) as THREE.CanvasTexture | null;
  let t: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const spec = TEXTURES[name];
    const c = document.createElement('canvas');
    [c.width, c.height] = spec.px;
    const g = c.getContext('2d');
    if (g) {
      PAINTERS[name](g, c.width, c.height);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8; // three clamps this to what the GPU offers
      if (spec.repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(1 / spec.tile[0], 1 / spec.tile[1]);
      } else {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.repeat.set(1 / spec.tile[0], 1 / spec.tile[1]);
      }
    }
  }
  textures.set(name, t);
  return t;
}

export type MaterialName =
  | 'brick' | 'stone' | 'slate' | 'asphalt' | 'platformEdge' | 'ballast'
  | 'roofGlass' | 'glass' | 'window' | 'windowArch'
  | 'concrete' | 'steel' | 'whiteSteel' | 'lining' | 'panel' | 'concourseFloor';

function tiled(name: TextureName, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const t = texture(name);
  return new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : TEXTURES[name].average, ...extra });
}

const makers: Readonly<Record<MaterialName, () => THREE.Material>> = {
  brick: () => tiled('brick'),
  stone: () => tiled('stone'),
  slate: () => tiled('slate'),
  asphalt: () => tiled('asphalt'),
  platformEdge: () => tiled('platformEdge'),
  ballast: () => tiled('ballast'),
  // The glazing of the shed roof: tinted, see-through, with astragal bars. Never writes depth, so
  // what is behind it shows.
  roofGlass: () => tiled('roofGlass', { transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  // Plain glass for the big windows: a little reflective (a specular highlight from the sun), tinted blue-green.
  glass: () => new THREE.MeshPhongMaterial({ color: 0x86a9c4, specular: 0xbfd2e4, shininess: 80, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }),
  window: () => tiled('window', { transparent: true, alphaTest: 0.05 }),
  windowArch: () => tiled('windowArch', { transparent: true, alphaTest: 0.05 }),
  concrete: () => new THREE.MeshLambertMaterial({ color: 0x8e8e8a }),
  steel: () => new THREE.MeshLambertMaterial({ color: 0x3d4650 }),
  whiteSteel: () => new THREE.MeshLambertMaterial({ color: 0xe6eaee }),
  // The underside of a roof seen from inside: pale painted boarding. The scene's lights shine from
  // above, so an underside would come out black; the emissive term stands in for the light that
  // really comes down through the glazing and off the platforms.
  lining: () => new THREE.MeshLambertMaterial({ color: 0xb8bec6, emissive: 0x424850, side: THREE.BackSide }),
  // Solid pale roof panels (the outer part of the Western Concourse roof), slightly see-through.
  panel: () => new THREE.MeshLambertMaterial({ color: 0xe3e8ee, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }),
  concourseFloor: () => tiled('floorSlab'),
};

const materials = new Map<MaterialName, THREE.Material>();

/** A shared material by name. Created on first use and reused; clone it before changing anything. */
export function material(name: MaterialName): THREE.Material {
  let m = materials.get(name);
  if (!m) {
    m = makers[name]();
    m.name = name;
    materials.set(name, m);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// UVs in metres

/**
 * Overwrite the UVs of a geometry with box-projected metres: each triangle takes the two axes
 * across its dominant normal (x and y for a face turned north or south, z and y for east or west,
 * x and z for a floor or a roof). Exact for axis-aligned geometry, which is everything in the
 * shed's own frame; on a face at an angle it stretches, so use `wallUV` for those. Returns a
 * non-indexed copy (each triangle needs its own vertices) and disposes the original.
 */
export function boxProjectUV(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u: number;
      let w: number;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; }
      else if (az >= ax) { u = v.x; w = v.y; }
      else { u = v.z; w = v.y; }
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = w;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export type V3 = [number, number, number];
export type V2 = [number, number];

/**
 * A growing indexed mesh with UVs in metres: the tool the station modules build their static
 * geometry with, so thousands of boxes become one draw call. Faces are counter-clockwise seen
 * from the front; normals come from the winding (flat shading, hard edges).
 *
 *   const b = new Batch();
 *   b.box([x, y, z], [sx, sy, sz]);       // an axis-aligned box centred on (x, y, z)
 *   b.quad(p0, p1, p2, p3, uv0, uv1, uv2, uv3);
 *   mesh.geometry = b.build();
 */
export class Batch {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  /** Vertices added so far. */
  get count(): number {
    return this.positions.length / 3;
  }

  /** A flat polygon (a fan from its first corner), all corners sharing one normal taken from the first three. */
  poly(pts: V3[], uv: V2[]): void {
    const [a, b, c] = pts as [V3, V3, V3];
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.count;
    pts.forEach((p, i) => {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      const t = uv[i] as V2;
      this.uvs.push(t[0], t[1]);
    });
    for (let i = 1; i + 1 < pts.length; i++) this.indices.push(base, base + i, base + i + 1);
  }

  quad(a: V3, b: V3, c: V3, d: V3, ua: V2, ub: V2, uc: V2, ud: V2): void {
    this.poly([a, b, c, d], [ua, ub, uc, ud]);
  }

  /**
   * An oriented box centred on `c` with full sizes `s` (x, y, z before turning), turned about
   * z by `rotZ` and then about y by `rotY` (radians). UVs are metres on each face, from the
   * face's own corner. `skip` lists faces to leave out: '+x' '-x' '+y' '-y' '+z' '-z'.
   */
  box(c: V3, s: V3, opts: { rotY?: number; rotZ?: number; skip?: string[] } = {}): void {
    const hx = s[0] / 2;
    const hy = s[1] / 2;
    const hz = s[2] / 2;
    const cz = Math.cos(opts.rotZ ?? 0);
    const sz = Math.sin(opts.rotZ ?? 0);
    const cy = Math.cos(opts.rotY ?? 0);
    const sy = Math.sin(opts.rotY ?? 0);
    const at = (x: number, y: number, z: number): V3 => {
      const x1 = x * cz - y * sz;
      const y1 = x * sz + y * cz;
      return [c[0] + x1 * cy + z * sy, c[1] + y1, c[2] - x1 * sy + z * cy];
    };
    const faces: [string, V3, V3, V3, V3, V2, V2, V2, V2][] = [
      ['+z', at(-hx, -hy, hz), at(hx, -hy, hz), at(hx, hy, hz), at(-hx, hy, hz), [0, 0], [s[0], 0], [s[0], s[1]], [0, s[1]]],
      ['-z', at(hx, -hy, -hz), at(-hx, -hy, -hz), at(-hx, hy, -hz), at(hx, hy, -hz), [0, 0], [s[0], 0], [s[0], s[1]], [0, s[1]]],
      ['+x', at(hx, -hy, hz), at(hx, -hy, -hz), at(hx, hy, -hz), at(hx, hy, hz), [0, 0], [s[2], 0], [s[2], s[1]], [0, s[1]]],
      ['-x', at(-hx, -hy, -hz), at(-hx, -hy, hz), at(-hx, hy, hz), at(-hx, hy, -hz), [0, 0], [s[2], 0], [s[2], s[1]], [0, s[1]]],
      ['+y', at(-hx, hy, hz), at(hx, hy, hz), at(hx, hy, -hz), at(-hx, hy, -hz), [0, 0], [s[0], 0], [s[0], s[2]], [0, s[2]]],
      ['-y', at(-hx, -hy, -hz), at(hx, -hy, -hz), at(hx, -hy, hz), at(-hx, -hy, hz), [0, 0], [s[0], 0], [s[0], s[2]], [0, s[2]]],
    ];
    for (const [name, a, b, cc, d, ua, ub, uc, ud] of faces) if (!opts.skip?.includes(name)) this.quad(a, b, cc, d, ua, ub, uc, ud);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    return g;
  }
}

/**
 * A vertical quad from (x0, z0) to (x1, z1) in plan and y0 to y1 up. It faces the RIGHT of the
 * direction of travel on a map with north up (x east, z south): walking east (+x) it faces south
 * (+z). u runs along the wall in metres from `u0` (carry a pattern round a corner), v is the height
 * in metres, so brick courses stay level on a wall at any angle. Returns the u at the far end.
 */
export function wallQuad(b: Batch, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, u0 = 0): number {
  const len = Math.hypot(x1 - x0, z1 - z0);
  b.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [u0, y0], [u0 + len, y0], [u0 + len, y1], [u0, y1]);
  return u0 + len;
}
