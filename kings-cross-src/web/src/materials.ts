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
//
// The mesh builder every station module uses is `Batch` below (one per material, merged into one draw call;
// `part` and `mergeParts` keep one per material across buildings). Nothing else builds flat-shaded meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const IN = 0.0254; // metres per inch

export type TextureName = 'brick' | 'stone' | 'slate' | 'asphalt' | 'platformEdge' | 'ballast' | 'roofGlass' | 'window' | 'windowArch' | 'floorSlab' | 'lining' | 'shedGlass';

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
  // The underside of the shed roof between the ribs: painted tongue-and-groove boarding, boards running
  // along the shed (UV v) and 150 mm wide across it (UV u). Neither the board width nor the pale cream
  // paint has a source (the 2012 restoration's paint scheme was not found): both ASSUMED.
  lining: { tile: [1.2, 1.2], px: [192, 192], density: [140, 180], average: 0xe0dccf, repeat: true,
    source: 'ASSUMED: painted boarding 150 mm wide, butt joints every 1.2 m at most' },
  // The shed's own roof glazing: the same panes as roofGlass, but a milky sky-blue that reads as daylight
  // from inside (the Barlow shed keeps the darker roofGlass) and light-painted astragal bars.
  shedGlass: { tile: [0.9, 1.8], px: [90, 180], density: [80, 120], average: 0xaec3d3, repeat: true,
    source: 'ASSUMED pane size 0.9 x 1.8 m; bar colour ASSUMED' },
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

/** Painted boarding: 8 boards of 150 mm across the tile, a vee-joint between boards, grain along them, a butt joint in each. */
function paintLining(g: Ctx, w: number, h: number): void {
  const r = rng(83);
  const boards = 8;
  const bw = w / boards;
  g.fillStyle = '#d9d5c8';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < boards; i++) {
    const x = i * bw;
    g.fillStyle = tone(0xf2eee3, 0xe6e1d3, r(), 0.98 + r() * 0.04);
    g.fillRect(x + 1.5, 0, bw - 3, h);
    for (let s = 0; s < 10; s++) { // grain: faint streaks along the board
      g.fillStyle = r() < 0.5 ? 'rgba(120,104,76,0.05)' : 'rgba(255,252,240,0.10)';
      g.fillRect(x + 2 + r() * (bw - 5), r() * h, 1, 8 + r() * 40);
    }
    const jy = r() * h; // the butt joint of this board (staggered from its neighbours)
    g.fillStyle = 'rgba(80,68,50,0.22)';
    g.fillRect(x + 1.5, jy, bw - 3, 1.2);
  }
  g.fillStyle = 'rgba(70,60,44,0.32)'; // the vee-joints between boards
  for (let i = 0; i < boards; i++) g.fillRect(i * bw - 0.75, 0, 1.5, h);
  g.fillRect(w - 0.75, 0, 0.75, h);
}

/** The shed's glazing: a milky sky-blue pane (mostly opaque, the material's opacity does the see-through) between pale painted bars. */
function paintShedGlass(g: Ctx, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(178,208,230,0.88)';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(244,250,255,0.28)'; // a sheen across each pane
  g.fillRect(0, 0, w, h * 0.35);
  g.fillStyle = 'rgba(226,230,232,1)'; // astragal bars, painted light like the ribs
  g.fillRect(0, 0, 3, h);
  g.fillRect(0, 0, w, 4);
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
  lining: paintLining,
  shedGlass: paintShedGlass,
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
  | 'concrete' | 'steel' | 'whiteSteel' | 'ribPaint' | 'lining' | 'valleyLining' | 'shedGlass' | 'panel' | 'concourseFloor'
  | 'brickRed' | 'slateBothSides' | 'sash' | 'sashArch' | 'pane' | 'platformEdgeStrip';

function tiled(name: TextureName, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const t = texture(name);
  return new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : TEXTURES[name].average, ...extra });
}

/** Flat things stood a few centimetres off a wall: pulled toward the camera so they never z-fight at range. */
function nearer<T extends THREE.Material>(m: T): T {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  return m;
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
  // The restored shed's ironwork: slender ribs and bars painted light. The colour is ASSUMED (a pale
  // grey-white); the 2012 paint scheme was not found. The emissive term lifts the undersides the same
  // way as for the lining, below.
  ribPaint: () => new THREE.MeshLambertMaterial({ color: 0xdadee1, emissive: 0x555b61 }),
  // The underside of a roof seen from inside: pale painted boarding (the 'lining' texture). The scene's
  // lights shine from above, so an underside would come out black; the emissive term (which takes the
  // texture too, so the boards still show) stands in for the light that really comes down through the
  // glazing and off the platforms.
  lining: () => tiled('lining', { side: THREE.BackSide, emissive: 0x8d897f, emissiveMap: texture('lining') }),
  // The same boarding on the valley's vertical faces, seen from the front.
  valleyLining: () => tiled('lining', { emissive: 0x8d897f, emissiveMap: texture('lining') }),
  // The shed's roof glazing. It glows a little (emissive) so it reads as daylight from inside; shed.ts clones
  // it and sets the opacity by camera distance (see glazingOpacity there).
  shedGlass: () => tiled('shedGlass', { transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x73879a, emissiveMap: texture('shedGlass') }),
  // Solid pale roof panels (the outer part of the Western Concourse roof), slightly see-through.
  panel: () => new THREE.MeshLambertMaterial({ color: 0xe3e8ee, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }),
  concourseFloor: () => tiled('floorSlab'),
  // The Midland Grand's red brick. The shared brick is London stock, yellow-buff (average 0xa0895a); this
  // colour multiplies it to a deep brick red (about 0x8e3c2c once mip-mapped). The shade is ASSUMED.
  brickRed: () => tiled('brick', { color: 0xe3707d }),
  // The slate seen from inside the shed: the shared slate culls back faces, so this is a two-sided one.
  slateBothSides: () => tiled('slate', { side: THREE.DoubleSide }),
  // Window decals: flat quads stood a hair off a wall, so they are pulled toward the camera (see `nearer`).
  sash: () => nearer(tiled('window', { transparent: true, alphaTest: 0.05 })),
  sashArch: () => nearer(tiled('windowArch', { transparent: true, alphaTest: 0.05 })),
  // A dark pane set in a bar or a frame (the Barlow shed's roof lights, tower openings).
  pane: () => nearer(new THREE.MeshLambertMaterial({ color: 0x232c38 })),
  // The coping / tactile / white-line strip laid on a platform's surface: the platform-edge texture with the
  // polygon offset that keeps it clear of the surface at any range.
  platformEdgeStrip: () => nearer(tiled('platformEdge')),
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
/** A colour as the linear r, g, b triple a vertex colour attribute wants. */
export type Rgb = [number, number, number];

/** A 0xRRGGBB colour as the linear triple a vertex colour wants. */
export const rgb = (hex: number): Rgb => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

export interface FaceOptions {
  /** The normal to store; the winding is turned to face along it. Default: the normal the winding gives. */
  normal?: V3;
  /** A normal for each corner (smooth shading, as round a cylinder); the winding is turned to face their sum. */
  normals?: readonly V3[];
  /** The side that must face the viewer: the winding, and the stored normal with it, is turned to suit. */
  facing?: V3;
  /** A vertex colour for every corner (white if left out); only a batch made `colored` keeps it. */
  color?: Rgb;
}

export interface BatchOptions {
  /** Keep a colour per vertex and build a `color` attribute (for materials with `vertexColors`). */
  colored?: boolean;
  /** Keep UVs (the default); `false` for geometry that wears no texture, so the attribute is not even built. */
  uv?: boolean;
}

const WHITE: Rgb = [1, 1, 1];

/**
 * THE mesh builder of the station modules: a growing indexed mesh with flat-shaded faces, UVs in
 * metres and, if asked, a colour per vertex, so thousands of boxes become one draw call. Faces are
 * counter-clockwise seen from the front; each face carries one normal (hard edges), taken from its
 * winding unless the caller says which way it must look.
 *
 *   const b = new Batch();
 *   b.box([x, y, z], [sx, sy, sz]);                  // an axis-aligned box centred on (x, y, z)
 *   b.quad(p0, p1, p2, p3, uv0, uv1, uv2, uv3);      // a quad, the winding as given
 *   b.quadUV(p0, p1, p2, p3, uvs, facing);           // a quad turned to face `facing`
 *   b.poly(pts, uvs, { normal, color });             // any convex polygon
 *   mesh.geometry = b.build();
 *
 * The buildings keep one Batch per material (`part`) and merge them across buildings (`mergeParts`).
 */
export class Batch {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];
  /** one r, g, b per vertex; empty unless the batch is `colored` */
  readonly colors: number[] = [];
  readonly colored: boolean;
  readonly textured: boolean;

  constructor(opts: BatchOptions = {}) {
    this.colored = opts.colored ?? false;
    this.textured = opts.uv ?? true;
  }

  /** Vertices added so far. */
  get count(): number {
    return this.positions.length / 3;
  }

  /** Triangles added so far. */
  get triangles(): number {
    return this.indices.length / 3;
  }

  /**
   * A flat convex polygon as a fan from its first corner, all corners sharing one normal. The normal is
   * the one the winding gives (Newell's sum, so a quad with a repeated corner is fine), or `opts.normal`;
   * `opts.normal` and `opts.facing` turn the winding to look that way (the fan then still starts at the
   * first corner). UVs default to (0, 0).
   */
  poly(pts: readonly V3[], uv?: readonly V2[], opts: FaceOptions = {}): void {
    const n = pts.length;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i] as V3;
      const q = pts[(i + 1) % n] as V3;
      gx += (p[1] - q[1]) * (p[2] + q[2]);
      gy += (p[2] - q[2]) * (p[0] + q[0]);
      gz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const l = Math.hypot(gx, gy, gz) || 1;
    let normal: V3 = [gx / l, gy / l, gz / l];
    let order = pts.map((_, i) => i);
    const smooth = opts.normals;
    const want = opts.normal ?? opts.facing ?? (smooth ? (smooth.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]) as V3) : undefined);
    if (want && gx * want[0] + gy * want[1] + gz * want[2] < 0) {
      order = [0, ...order.slice(1).reverse()];
      normal = [-normal[0], -normal[1], -normal[2]];
    }
    if (opts.normal) normal = opts.normal;
    const color = opts.color ?? WHITE;
    const base = this.count;
    for (const k of order) {
      const p = pts[k] as V3;
      const q = smooth ? (smooth[k] as V3) : normal;
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(q[0], q[1], q[2]);
      if (this.textured) {
        const t = uv?.[k];
        this.uvs.push(t ? t[0] : 0, t ? t[1] : 0);
      }
      if (this.colored) this.colors.push(color[0], color[1], color[2]);
    }
    for (let i = 1; i + 1 < n; i++) this.indices.push(base, base + i, base + i + 1);
  }

  /** A quad a-b-c-d with a UV for each corner, the winding as given. */
  quad(a: V3, b: V3, c: V3, d: V3, ua: V2, ub: V2, uc: V2, ud: V2, opts: FaceOptions = {}): void {
    this.poly([a, b, c, d], [ua, ub, uc, ud], opts);
  }

  /** A quad a-b-c-d with its four UVs in one array; `facing` is the side that must face the viewer (the winding is flipped to suit). */
  quadUV(a: V3, b: V3, c: V3, d: V3, uvs?: readonly [V2, V2, V2, V2], facing?: V3): void {
    this.poly([a, b, c, d], uvs, facing ? { facing } : {});
  }

  /** A triangle; a sliver with no area is left out. `facing` as for `quadUV`. */
  tri(a: V3, b: V3, c: V3, uvs?: readonly [V2, V2, V2], facing?: V3): void {
    const x = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const y = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const z = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.hypot(x, y, z) < 1e-12) return;
    this.poly([a, b, c], uvs, facing ? { facing } : {});
  }

  /** A convex polygon as triangles from its first corner, each with its own normal; `uvOf` gives each corner's UV. `facing` as for `quadUV`. */
  fan(points: readonly V3[], facing?: V3, uvOf?: (p: V3) => V2): void {
    for (let i = 1; i + 1 < points.length; i++) {
      const a = points[0] as V3;
      const b = points[i] as V3;
      const c = points[i + 1] as V3;
      this.tri(a, b, c, uvOf ? [uvOf(a), uvOf(b), uvOf(c)] : undefined, facing);
    }
  }

  /**
   * An oriented box centred on `c` with full sizes `s` (x, y, z before turning), turned about
   * z by `rotZ` and then about y by `rotY` (radians). UVs are metres on each face, from the
   * face's own corner. `skip` lists faces to leave out: '+x' '-x' '+y' '-y' '+z' '-z'. `color` paints every face.
   */
  box(c: V3, s: V3, opts: { rotY?: number; rotZ?: number; skip?: string[]; color?: Rgb } = {}): void {
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
    const face = opts.color ? { color: opts.color } : {};
    for (const [name, a, b, cc, d, ua, ub, uc, ud] of faces) if (!opts.skip?.includes(name)) this.quad(a, b, cc, d, ua, ub, uc, ud, face);
  }

  /** An axis-aligned box from corner (x0, y0, z0) to (x1, y1, z1), in either order; `skipBottom` leaves its underside out. */
  aabb(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color?: Rgb, skipBottom = false): void {
    this.box([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], { ...(color ? { color } : {}), ...(skipBottom ? { skip: ['-y'] } : {}) });
  }

  /** Add everything another batch holds (a loop, not a spread: these arrays can be long). Colour and UVs follow this batch's own settings. */
  append(other: Batch): void {
    const base = this.count;
    const copy = (from: readonly number[], to: number[]): void => {
      for (let i = 0; i < from.length; i++) to.push(from[i] as number);
    };
    copy(other.positions, this.positions);
    copy(other.normals, this.normals);
    if (this.textured) {
      if (other.textured) copy(other.uvs, this.uvs);
      else for (let i = 0; i < other.count; i++) this.uvs.push(0, 0);
    }
    if (this.colored) {
      if (other.colored) copy(other.colors, this.colors);
      else for (let i = 0; i < other.count; i++) this.colors.push(1, 1, 1);
    }
    for (let i = 0; i < other.indices.length; i++) this.indices.push((other.indices[i] as number) + base);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    if (this.textured) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.colored) g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    return g;
  }
}

/** The parts of one building: one Batch per material. */
export type PartMap<K extends string> = Partial<Record<K, Batch>>;
export function part<K extends string>(parts: PartMap<K>, key: K): Batch {
  return (parts[key] ??= new Batch());
}

/** Merge the parts that share a material, across buildings, into one mesh each: fewer draw calls. */
export function mergeParts<K extends string>(sets: readonly PartMap<K>[], materials: Record<K, THREE.Material>, name: string, renderOrder: Partial<Record<K, number>> = {}): { group: THREE.Group; triangles: number } {
  const group = new THREE.Group();
  group.name = name;
  let triangles = 0;
  for (const key of Object.keys(materials) as K[]) {
    const geos = sets.map((s) => s[key]).filter((m): m is Batch => !!m && m.triangles > 0).map((m) => m.build());
    if (!geos.length) continue;
    let merged: THREE.BufferGeometry;
    if (geos.length === 1) merged = geos[0] as THREE.BufferGeometry;
    else {
      merged = mergeGeometries(geos, false) as THREE.BufferGeometry;
      for (const g of geos) g.dispose();
    }
    const mesh = new THREE.Mesh(merged, materials[key]);
    mesh.name = `${name}-${key}`;
    const order = renderOrder[key];
    if (order !== undefined) mesh.renderOrder = order;
    triangles += (merged.index as THREE.BufferAttribute).count / 3;
    group.add(mesh);
  }
  return { group, triangles };
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

// =============================================================================================
// CITY BLOCK (worker S4 "city"). Everything below belongs to web/src/city.ts: the six facade textures,
// grass and water, and the city's materials. It only adds to this file; nothing above is changed. The tile
// sizes come from core/city.ts (FACADE), so the rules that fit windows to walls and the textures that draw
// them cannot drift apart; web/tests/city.test.ts holds every texture to its texel density.
import { FACADE, FACADE_TEXELS_PER_M } from '../../core/city.ts';
import type { FacadeKey } from '../../core/city.ts';

export type CityTextureName = FacadeKey | 'grass' | 'water';

const facadeSpec = (key: FacadeKey, average: number, source: string): TextureSpec => {
  const tile = FACADE[key].tile;
  return { tile: [tile[0], tile[1]], px: [Math.round(tile[0] * FACADE_TEXELS_PER_M), Math.round(tile[1] * FACADE_TEXELS_PER_M)], density: [FACADE_TEXELS_PER_M * 0.95, FACADE_TEXELS_PER_M * 1.05], average, repeat: true, source };
};

export const CITY_TEXTURES: Readonly<Record<CityTextureName, TextureSpec>> = {
  // 12 stretchers of 225 mm (215 mm brick + 10 mm joint) across, 44 courses of 75 mm up: metric brick. The
  // colours are London stock yellow-buff, the window a six-over-six sash; sizes and colours ASSUMED.
  stock: facadeSpec('stock', 0xa8946a, 'metric brick 215 x 65 mm with 10 mm joints; window 1.05 x 1.75 m, sill 0.85 m: ASSUMED'),
  red: facadeSpec('red', 0x93503a, 'brick as stock; round-headed window 1.2 x 2.15 m, sill 0.9 m, stone string course 0.15 m: ASSUMED'),
  stone: facadeSpec('stone', 0xd2c9b0, 'ashlar blocks 0.6 x 0.3 m; window 1.1 x 2.3 m with surround: ASSUMED'),
  panel: facadeSpec('panel', 0xb4afa2, 'cladding panels 1.5 m square; casement 1.9 x 1.45 m, sill 0.85 m: ASSUMED'),
  glass: facadeSpec('glass', 0x56778b, 'curtain wall on a 1.5 m module, spandrel 0.9 m, floor to floor 3.9 m: ASSUMED'),
  shop: facadeSpec('shop', 0x6d6a60, 'stall riser 0.55 m, plate glass to 3.15 m, fascia 0.7 m, cornice 0.15 m: ASSUMED'),
  grass: { tile: [4, 4], px: [128, 128], density: [28, 36], average: 0x59753f, repeat: true, source: 'ASSUMED: mown grass drawn at 32 texels per metre' },
  water: { tile: [8, 8], px: [128, 128], density: [14, 18], average: 0x2f4d55, repeat: true, source: 'ASSUMED: canal water, ripples drawn at 16 texels per metre' },
};

type CityCtx = CanvasRenderingContext2D;
const cityPx = (m: number): number => m * FACADE_TEXELS_PER_M;
const cityChan = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Mix two 0xRRGGBB colours (t = 0 gives a) and scale the lightness by k, as a CSS colour. */
function cityMix(a: number, b: number, t: number, k = 1): string {
  const [ar, ag, ab] = cityChan(a);
  const [br, bg, bb] = cityChan(b);
  const f = (x: number): number => Math.max(0, Math.min(255, Math.round(x)));
  return `rgb(${f((ar + (br - ar) * t) * k)},${f((ag + (bg - ag) * t) * k)},${f((ab + (bb - ab) * t) * k)})`;
}

/**
 * Brick in stretcher bond: courses of 75 mm, bricks 225 mm long with a joint, every other course shifted
 * half a brick. The tile holds a whole number of courses and bricks, so it repeats without a seam.
 */
function cityCourses(g: CityCtx, w: number, h: number, seed: number, light: number, dark: number, mortar: string): void {
  const r = rng(seed);
  const across = Math.max(1, Math.round(w / cityPx(0.225)));
  const bw = w / across;
  const rows = Math.max(1, Math.round(h / cityPx(0.075)));
  const ch = h / rows;
  const joint = Math.max(1, ch * 0.18);
  g.fillStyle = mortar;
  g.fillRect(0, 0, w, h);
  for (let row = 0; row < rows; row++) {
    const y = row * ch;
    const shift = (row % 2) * (bw / 2);
    for (let k = -1; k <= across; k++) {
      const x = k * bw + shift;
      g.fillStyle = r() < 0.04 ? cityMix(0x4c4540, 0x5e5650, r()) : cityMix(light, dark, r(), 0.92 + r() * 0.16);
      g.fillRect(x + joint / 2, y + joint / 2, bw - joint, ch - joint);
      g.fillStyle = 'rgba(0,0,0,0.10)';
      g.fillRect(x + joint / 2, y + ch - joint / 2 - 1, bw - joint, 1);
    }
  }
}

interface SashOptions {
  ww: number;
  wh: number;
  sill: number;
  cols: number;
  rows: number;
  surround: string;
  frame: string;
  hood?: number;
}

/** A rectangular sash window with a lintel (or hood) and cill, sill metres above the tile's bottom edge. All sizes in texels. */
function citySash(g: CityCtx, cx: number, h: number, o: SashOptions): void {
  const x0 = cx - o.ww / 2;
  const yb = h - o.sill;
  const yt = yb - o.wh;
  g.fillStyle = '#23272c'; // the reveal
  g.fillRect(x0 - 4, yt - 4, o.ww + 8, o.wh + 8);
  const lg = g.createLinearGradient(0, yt, 0, yb);
  lg.addColorStop(0, '#8aa3b6');
  lg.addColorStop(1, '#3a4856');
  g.fillStyle = lg;
  g.fillRect(x0, yt, o.ww, o.wh);
  g.fillStyle = 'rgba(0,0,0,0.30)'; // depth: the reveal shades the glass at the left and top
  g.fillRect(x0, yt, 5, o.wh);
  g.fillRect(x0, yt, o.ww, 5);
  g.fillStyle = o.frame;
  const bar = 2.4;
  for (let i = 1; i < o.cols; i++) g.fillRect(x0 + (o.ww * i) / o.cols - bar / 2, yt, bar, o.wh);
  for (let i = 1; i < o.rows; i++) g.fillRect(x0, yt + (o.wh * i) / o.rows - bar / 2, o.ww, bar);
  g.fillRect(x0, yt + o.wh / 2 - 2.2, o.ww, 4.4); // the meeting rail of the two sashes
  g.strokeStyle = o.frame;
  g.lineWidth = 3;
  g.strokeRect(x0 + 1.5, yt + 1.5, o.ww - 3, o.wh - 3);
  g.fillStyle = o.surround;
  const hood = o.hood ?? 10;
  g.fillRect(x0 - 11, yt - hood - 3, o.ww + 22, hood); // lintel or hood
  g.fillRect(x0 - 11, yb + 3, o.ww + 22, 8); // cill
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(x0 - 11, yb + 11, o.ww + 22, 2);
  g.fillRect(x0 - 11, yt - 3, o.ww + 22, 2); // the lintel's shadow on the glass
}

function paintCityStock(g: CityCtx, w: number, h: number): void {
  cityCourses(g, w, h, 101, 0xbfa874, 0x9b8760, '#9a978a');
  citySash(g, w / 2, h, { ww: 105, wh: 175, sill: 85, cols: 2, rows: 6, surround: '#d2cab4', frame: '#e8e5da' });
  g.fillStyle = 'rgba(0,0,0,0.10)'; // the floor line
  g.fillRect(0, h - 3, w, 3);
}

function paintCityRed(g: CityCtx, w: number, h: number): void {
  cityCourses(g, w, h, 113, 0xa9573f, 0x873f2f, '#8c867a');
  g.fillStyle = '#cfc7b3'; // a stone string course at the floor line
  g.fillRect(0, h - 15, w, 15);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, h - 17, w, 2);
  const cx = w / 2;
  const ww = 120;
  const wh = 215;
  const yb = h - 90;
  const yt = yb - wh;
  const rise = ww * 0.2;
  const arch = (inset: number): void => {
    g.beginPath();
    g.moveTo(cx - ww / 2 + inset, yb - inset);
    g.lineTo(cx - ww / 2 + inset, yt + rise);
    g.quadraticCurveTo(cx, yt - rise + inset * 2, cx + ww / 2 - inset, yt + rise);
    g.lineTo(cx + ww / 2 - inset, yb - inset);
    g.closePath();
  };
  g.fillStyle = '#d4cbb5'; // a stone arch ring and cill
  arch(-9);
  g.fill();
  g.fillRect(cx - ww / 2 - 12, yb, ww + 24, 8);
  g.fillStyle = '#1f2327';
  arch(0);
  g.fill();
  const lg = g.createLinearGradient(0, yt, 0, yb);
  lg.addColorStop(0, '#7f98ab');
  lg.addColorStop(1, '#36424e');
  g.save();
  arch(3);
  g.clip();
  g.fillStyle = lg;
  g.fillRect(cx - ww / 2, yt - rise, ww, wh + rise);
  g.fillStyle = '#1d2226'; // steel glazing bars: two panes across, five rows up
  g.fillRect(cx - 1.2, yt - rise, 2.4, wh + rise);
  for (let i = 1; i < 6; i++) g.fillRect(cx - ww / 2, yt + (wh * i) / 6, ww, 2.2);
  g.restore();
}

function paintCityStone(g: CityCtx, w: number, h: number): void {
  const r = rng(127);
  g.fillStyle = '#a8a392';
  g.fillRect(0, 0, w, h);
  const bw = w / 5;
  const bh = h / 12;
  for (let row = 0; row < 12; row++) {
    for (let k = -1; k <= 5; k++) {
      const x = k * bw + (row % 2) * (bw / 2);
      g.fillStyle = cityMix(0xdcd4bd, 0xc9c0a6, r(), 0.95 + r() * 0.08);
      g.fillRect(x + 1, row * bh + 1, bw - 2, bh - 2);
    }
  }
  citySash(g, w / 2, h, { ww: 110, wh: 230, sill: 90, cols: 2, rows: 6, surround: '#efe9d8', frame: '#f1eee4', hood: 16 });
  g.fillStyle = 'rgba(0,0,0,0.10)';
  g.fillRect(0, h - 3, w, 3);
}

function paintCityPanel(g: CityCtx, w: number, h: number): void {
  const r = rng(131);
  g.fillStyle = '#8e8a80'; // panel joints
  g.fillRect(0, 0, w, h);
  const p = cityPx(1.5);
  for (let y = 0; y < h; y += p) {
    for (let x = 0; x < w; x += p) {
      g.fillStyle = cityMix(0xbdb8aa, 0xaaa597, r(), 0.96 + r() * 0.07);
      g.fillRect(x + 1, y + 1, p - 2, p - 2);
    }
  }
  const cx = w / 2;
  const ww = 190;
  const wh = 145;
  const yb = h - 85;
  const yt = yb - wh;
  g.fillStyle = '#2d3338'; // dark aluminium frame
  g.fillRect(cx - ww / 2 - 5, yt - 5, ww + 10, wh + 10);
  const lg = g.createLinearGradient(0, yt, 0, yb);
  lg.addColorStop(0, '#7e9bb0');
  lg.addColorStop(1, '#34495a');
  g.fillStyle = lg;
  g.fillRect(cx - ww / 2, yt, ww, wh);
  g.fillStyle = '#2d3338';
  g.fillRect(cx - 2, yt, 4, wh);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(cx - ww / 2, yt, ww, wh * 0.3);
  g.fillStyle = '#d6d2c6'; // the floor slab's edge
  g.fillRect(0, h - 11, w, 11);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, h - 13, w, 2);
}

function paintCityGlass(g: CityCtx, w: number, h: number): void {
  g.fillStyle = '#46525c'; // the spandrel
  g.fillRect(0, 0, w, h);
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, '#8fb4c8');
  lg.addColorStop(1, '#3d6074');
  g.fillStyle = lg;
  g.fillRect(2, 10, w - 4, h - 100); // vision glass above the spandrel, which is at the bottom of the tile
  g.fillStyle = 'rgba(255,255,255,0.12)'; // a sky reflection streak
  g.beginPath();
  g.moveTo(w * 0.15, 10);
  g.lineTo(w * 0.65, 10);
  g.lineTo(w * 0.35, h - 90);
  g.lineTo(w * -0.15, h - 90);
  g.closePath();
  g.fill();
  g.fillStyle = '#2b3238'; // mullions and the transom
  g.fillRect(0, 0, 3, h);
  g.fillRect(w - 3, 0, 3, h);
  g.fillRect(0, 0, w, 10);
  g.fillStyle = '#6b7a85'; // a lighter edge on the spandrel
  g.fillRect(0, h - 92, w, 3);
}

function paintCityShop(g: CityCtx, w: number, h: number): void {
  g.fillStyle = '#6d6a60'; // pilasters and the wall behind
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d3ccb8'; // the cornice
  g.fillRect(0, 0, w, 15);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 15, w, 3);
  g.fillStyle = '#3a4a43'; // the fascia board with a pale lettering strip
  g.fillRect(14, 18, w - 28, 66);
  g.fillStyle = '#d8d4c4';
  g.fillRect(w * 0.22, 40, w * 0.56, 22);
  const lg = g.createLinearGradient(0, 90, 0, h - 55);
  lg.addColorStop(0, '#a9b9c4'); // sky reflected in the plate glass, then the lit shop behind
  lg.addColorStop(0.45, '#b8a77c');
  lg.addColorStop(1, '#6b5a3c');
  g.fillStyle = lg;
  g.fillRect(14, 90, w - 28, h - 90 - 55);
  g.fillStyle = '#25292d'; // frames and the door
  g.fillRect(14, 86, w - 28, 5);
  g.fillRect(14 + (w - 28) * 0.62, 90, 4, h - 145);
  g.fillRect(w - 14 - 3, 90, 3, h - 145);
  g.fillRect(14, 90, 3, h - 145);
  g.fillStyle = '#33383d'; // the stall riser
  g.fillRect(14, h - 55, w - 28, 55);
  g.fillStyle = '#4d535a';
  g.fillRect(14, h - 55, w - 28, 3);
}

function paintCityGrass(g: CityCtx, w: number, h: number): void {
  const r = rng(137);
  g.fillStyle = '#587843';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const x = r() * w;
    const y = r() * h;
    g.fillStyle = r() < 0.5 ? `rgba(${40 + r() * 30},${70 + r() * 40},${30 + r() * 20},0.45)` : `rgba(${110 + r() * 40},${140 + r() * 40},${70 + r() * 30},0.35)`;
    for (const dx of x > w - 4 ? [-w, 0] : [0]) for (const dy of y > h - 4 ? [-h, 0] : [0]) g.fillRect(x + dx, y + dy, 1 + r() * 2, 1 + r() * 3);
  }
}

function paintCityWater(g: CityCtx, w: number, h: number): void {
  const r = rng(139);
  g.fillStyle = '#2d4c54';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 6 + r() * 18;
    g.fillStyle = r() < 0.6 ? 'rgba(170,200,205,0.10)' : 'rgba(10,25,30,0.18)';
    for (const dx of x > w - len ? [-w, 0] : [0]) for (const dy of y > h - 2 ? [-h, 0] : [0]) g.fillRect(x + dx, y + dy, len, 1);
  }
}

export const CITY_PAINTERS: Readonly<Record<CityTextureName, (g: CityCtx, w: number, h: number) => void>> = {
  stock: paintCityStock,
  red: paintCityRed,
  stone: paintCityStone,
  panel: paintCityPanel,
  glass: paintCityGlass,
  shop: paintCityShop,
  grass: paintCityGrass,
  water: paintCityWater,
};

const cityTextures = new Map<CityTextureName, THREE.CanvasTexture | null>();

/** The canvas texture for a city surface, or null where there is no document (Node). Cached. */
export function cityTexture(name: CityTextureName): THREE.CanvasTexture | null {
  if (cityTextures.has(name)) return cityTextures.get(name) as THREE.CanvasTexture | null;
  let t: THREE.CanvasTexture | null = null;
  if (typeof document !== 'undefined') {
    const spec = CITY_TEXTURES[name];
    const c = document.createElement('canvas');
    [c.width, c.height] = spec.px;
    const g = c.getContext('2d');
    if (g) {
      CITY_PAINTERS[name](g, c.width, c.height);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / spec.tile[0], 1 / spec.tile[1]);
    }
  }
  cityTextures.set(name, t);
  return t;
}

export type CityMaterialName = CityTextureName | 'roof' | 'paint' | 'asphalt' | 'pavement' | 'plaza';

/** Polygon offset per flat layer, lowest first, so the flat layers never z-fight (see LAYER_LIFT in core/city.ts). */
const CITY_LAYER_OFFSET: Partial<Record<CityMaterialName, number>> = { grass: -1, water: -2, plaza: -3, pavement: -4, asphalt: -5, paint: -6 };

const cityMakers: Readonly<Record<CityMaterialName, () => THREE.Material>> = {
  stock: () => cityFacade('stock'),
  red: () => cityFacade('red'),
  stone: () => cityFacade('stone'),
  panel: () => cityFacade('panel'),
  shop: () => cityFacade('shop'),
  // curtain walling catches the sun: a Phong sheen on top of the drawn glass
  glass: () => {
    const t = cityTexture('glass');
    return new THREE.MeshPhongMaterial({ map: t, color: t ? 0xffffff : CITY_TEXTURES.glass.average, vertexColors: true, specular: 0x6f7f8c, shininess: 55 });
  },
  roof: () => new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }),
  paint: () => new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }),
  grass: () => {
    const t = cityTexture('grass');
    return new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : CITY_TEXTURES.grass.average, vertexColors: true });
  },
  water: () => {
    const t = cityTexture('water');
    return new THREE.MeshPhongMaterial({ map: t, color: t ? 0xffffff : CITY_TEXTURES.water.average, vertexColors: true, specular: 0x27343a, shininess: 25 });
  },
  // roads and paving reuse the station's asphalt and slab textures (shared, not copied)
  asphalt: () => cityFlat('asphalt', 0xffffff),
  pavement: () => cityFlat('concourseFloor', 0xd2d0cb),
  plaza: () => cityFlat('concourseFloor', 0xf3f0e8),
};

function cityFacade(key: FacadeKey): THREE.Material {
  const t = cityTexture(key);
  return new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : CITY_TEXTURES[key].average, vertexColors: true });
}

function cityFlat(from: 'asphalt' | 'concourseFloor', color: number): THREE.Material {
  const m = (material(from) as THREE.MeshLambertMaterial).clone();
  m.vertexColors = true;
  m.color.setHex(color);
  return m;
}

const cityMaterials = new Map<CityMaterialName, THREE.Material>();

/** A shared material for one city surface. Vertex colours tint every one of them; never mutate, clone first. */
export function cityMaterial(name: CityMaterialName): THREE.Material {
  let m = cityMaterials.get(name);
  if (!m) {
    m = cityMakers[name]();
    m.name = `city-${name}`;
    const offset = CITY_LAYER_OFFSET[name];
    if (offset !== undefined) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = offset;
      m.polygonOffsetUnits = offset;
    }
    cityMaterials.set(name, m);
  }
  return m;
}
// ===== end of the city block =====
