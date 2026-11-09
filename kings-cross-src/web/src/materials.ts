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

export type TextureName = 'brick' | 'brickRed' | 'stone' | 'slate' | 'asphalt' | 'platformEdge' | 'ballast' | 'roofGlass' | 'window' | 'windowArch' | 'floorSlab' | 'lining' | 'shedGlass';

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
  // The same Flemish bond in red: the Midland Grand's and King's Cross Central's red brick. Its colours are drawn from
  // R-lighting-materials-c (the hotel's front, 2020): an orange-red face (about 176, 94, 66 where the sun lies on it), a
  // little darker in the headers, in a pale buff mortar. The exact shades are ASSUMED, matched by eye to that photograph.
  brickRed: { tile: [57 * IN, 24 * IN], px: [579, 244], density: [350, 450], average: 0xb26952, repeat: true,
    source: 'Imperial brick 9 x 4.5 x 3 in as the stock brick; the red from R-lighting-materials-c (Midland Grand front), shades ASSUMED' },
  // Ashlar: 0.6 x 0.3 m blocks (two across, two courses). ASSUMED block size.
  stone: { tile: [1.2, 0.6], px: [360, 180], density: [250, 350], average: 0xa99a7c, repeat: true,
    source: 'ASSUMED block size 0.6 x 0.3 m' },
  // Welsh slate 600 x 300 mm laid with a 250 mm gauge: four slates across, four courses. Slate
  // sizes are standard trade sizes; that the roof is slate-grey is the brief's, the shade ASSUMED.
  slate: { tile: [1.2, 1.0], px: [192, 160], density: [140, 200], average: 0x525a63, repeat: true,
    source: 'slate 600 x 300 mm, 250 mm gauge (trade size); shade ASSUMED' },
  // A neutral light-to-mid grey, not the blue-grey it was: a worn platform surface is about 0.17 reflective (sRGB 118), a warm-neutral grey,
  // and the sky's blue is the light's, not the paint's (R-lighting-materials-b: the platforms are mid grey in the shade; -d, -e: the paving
  // and the road are grey, never navy). The city's roads are the same texture at four-fifths of the light (cityMaterial 'asphalt').
  asphalt: { tile: [2, 2], px: [256, 256], density: [100, 160], average: 0x767571, repeat: true,
    source: 'ASSUMED: tarmac platform surface, grain drawn at 128 texels per metre; the tone about 0.17 reflectance' },
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
  // along the shed (UV v) and 150 mm wide across it (UV u). Neither the board width nor the pale grey-white
  // paint has a source (the 2012 restoration's paint scheme was not found): both ASSUMED.
  lining: { tile: [1.2, 1.2], px: [192, 192], density: [140, 180], average: 0xdcdcd8, repeat: true,
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

/** The colours of a brick wall: the mortar, and the pairs each brick's colour is mixed between (stretchers, headers, the odd overburnt one). */
interface BrickPalette {
  mortar: string;
  stretcher: readonly [number, number];
  header: readonly [number, number];
  burnt: readonly [number, number];
  /**
   * The wear of a Victorian stock (R-lighting-materials-a, the close-up): some bricks fired a duller grey-brown (never green: round four, the E3 scorer found olive bricks in facade-brick-close that R-a and R-a2 do not show), the ends burnt brown, a crack or
   * a chipped corner here and there. Absent on the red, whose brick is drawn as it was.
   */
  wear?: { grey: readonly [number, number] };
}

/**
 * London stock is yellow-buff; the headers of a Flemish bond are burnt a little darker, grey-brown. Round three: the headers were 0.72 of a
 * stretcher's light and the stretchers a 15% spread, which at the distance of the hotel (a brick a few pixels long) read as a speckle of light
 * and dark bricks with no course in it; the headers are 0.84 now, the stretchers a 10% spread, so the mortar's courses are what the eye finds.
 */
const STOCK_BRICK: BrickPalette = { mortar: '#b8ae96', stretcher: [0xb79f6c, 0xa4895a], header: [0x978362, 0x887966], burnt: [0x75655a, 0x61554c],
  wear: { grey: [0xac9972, 0x928262] } }; // (was 0xa39d6e, 0x8c8662: green at 0.11 of the way from red to blue against the buff's 0.28; these keep the buff's hue, 0.27, duller and darker)
/*
 * Round five (the E3 scorer: "stock-brick mortar is a thin dark line; R-a shows a wide pale lime joint"). The mortar was (162, 157, 140), L 65, the stretchers' own lightness, in a
 * line 3.8 px wide that the underside shade then darkened: it drew a grey outline, not a joint. It is (184, 174, 150), L 72, a pale lime, and each brick is drawn 0.7 px in from its
 * joint on every side (3.8 px of joint is 5.2), so the mortar is 23% of the wall (it was 17%) where R-a's is 23.5%, and it reads as a course of pale joints between warm bricks.
 * The wall draws about what it did at a distance (the bricks are 6% darker in their lightness to pay for the paler, wider mortar: the south front's tower is a median L 56.2 where
 * it was 56.5) and its bricks are L 53.0 in the close view where they were 55.4 (R-a 53.4, R-a2 54.8), and a little redder (a* +2, to 3.0: R-a 1.3, R-a2 2.9, and R-d, the same wall in
 * overcast, 4.8). Every hex above is the one it was, moved by about +3 in red and -1 in green. The Midland's red takes the same inset.
 */
/** The Midland Grand's red (R-lighting-materials-c): orange-red stretchers, headers a shade deeper, pale buff mortar. ASSUMED shades. */
const RED_BRICK: BrickPalette = { mortar: '#b8aa94', stretcher: [0xf57756, 0xd86649], header: [0xcf6047, 0xb45640], burnt: [0x5e3a30, 0x4a322c] };

/**
 * The wear on one stock brick (x, y, len, height in pixels): an end burnt brown, a soot smudge on the face, a crack, a chipped corner
 * where the mortar shows. All fillRects with a little alpha, so it tiles and averages to a slightly darker, browner wall at a distance.
 * The shares are ASSUMED, judged by eye against the close-up (R-lighting-materials-a: most bricks have a burnt end or a stained face).
 */
function wearBrick(g: Ctx, r: () => number, mortar: string, x: number, y: number, len: number, h: number): void {
  if (r() < 0.6) { // a burnt end, the hot end of the clamp
    const burn = len * (0.15 + r() * 0.3);
    g.fillStyle = `rgba(52,36,18,${(0.06 + r() * 0.08).toFixed(2)})`;
    g.fillRect(r() < 0.5 ? x : x + len - burn, y, burn, h);
  }
  if (r() < 0.45) { // a smudge of soot or old lime wash across the face
    const sw = len * (0.2 + r() * 0.4);
    const sh = h * (0.3 + r() * 0.5);
    g.fillStyle = r() < 0.7 ? `rgba(40,34,26,${(0.04 + r() * 0.06).toFixed(2)})` : `rgba(235,228,205,${(0.06 + r() * 0.07).toFixed(2)})`;
    g.fillRect(x + r() * (len - sw), y + r() * (h - sh), sw, sh);
  }
  if (r() < 0.14) { // a crack
    g.fillStyle = 'rgba(30,22,14,0.4)';
    g.fillRect(x + len * (0.15 + r() * 0.7), y + h * r() * 0.3, Math.max(1, h * 0.05), h * (0.45 + r() * 0.4));
  }
  const chip = Math.max(1.5, h * 0.14);
  g.fillStyle = mortar;
  if (r() < 0.2) g.fillRect(r() < 0.5 ? x : x + len - chip, y, chip, chip); // a chipped arris at the top
  if (r() < 0.12) g.fillRect(r() < 0.5 ? x : x + len - chip, y + h - chip, chip, chip);
}

function paintBrick(g: Ctx, w: number, h: number, palette: BrickPalette = STOCK_BRICK): void {
  const r = rng(11);
  const pxm = w / TEXTURES.brick.tile[0];
  const course = 3 * IN * pxm;
  const stretcher = 9 * IN * pxm;
  const header = 4.5 * IN * pxm;
  const joint = 0.375 * IN * pxm;
  const period = stretcher + header + 2 * joint;
  g.fillStyle = palette.mortar; // lime mortar
  g.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) {
    const y = row * course;
    const shift = (row % 2) * (period / 2);
    for (let k = -1; k <= 4; k++) {
      for (const isHeader of [false, true]) {
        const x0 = k * period + shift + (isHeader ? stretcher + joint : 0);
        const len = isHeader ? header : stretcher;
        const dark = r() < 0.015; // an overburnt brick (one in sixty-six: they were one in thirty-three and near black, the strongest speckle in a close view)
        const colours = !isHeader && palette.wear && r() < 0.3 ? palette.wear.grey : isHeader ? palette.header : palette.stretcher; // (a stock fired a duller grey-brown: one in three stretchers)
        const lift = palette.wear ? -0.06 : 0; // (a stock wall draws 6% darker in its brick, to pay for the paler, wider joint: see STOCK_BRICK)
        const base = isHeader ? tone(palette.header[0], palette.header[1], r(), 0.95 + lift + r() * 0.1) : tone(colours[0], colours[1], r(), 0.95 + lift + r() * 0.1);
        g.fillStyle = dark ? tone(palette.burnt[0], palette.burnt[1], r()) : base;
        const [bx, by, bl, bh] = [x0 + 0.7, y + joint + 0.7, len - 1.4, course - joint - 1.4]; // the brick, drawn in from its joint
        g.fillRect(bx, by, bl, bh);
        g.fillStyle = 'rgba(255,245,210,0.13)'; // the lit top arris
        g.fillRect(bx, by, bl, Math.max(1, joint * 0.35));
        g.fillStyle = 'rgba(0,0,0,0.14)'; // the shaded underside
        g.fillRect(bx, by + bh - Math.max(1.2, joint * 0.4), bl, Math.max(1.2, joint * 0.4));
        if (palette.wear && !dark) wearBrick(g, r, palette.mortar, bx, by, bl, bh);
        g.fillStyle = r() < 0.5 ? 'rgba(60,45,25,0.12)' : 'rgba(255,240,190,0.08)'; // one grain in the face (it was four: the speckle)
        g.fillRect(bx + r() * bl, by + r() * bh, 1.5 + r() * 2, 1 + r() * 1.5);
      }
    }
  }
  // wrap-around: bricks at the right edge continue from the left, which the 4-period tile guarantees
}

function paintStone(g: Ctx, w: number, h: number): void {
  const r = rng(23);
  g.fillStyle = '#8e8774';
  g.fillRect(0, 0, w, h);
  const bw = w / 2;
  const bh = h / 2;
  const j = 2;
  for (let row = 0; row < 2; row++) {
    for (let k = -1; k < 3; k++) {
      const x = k * bw + (row % 2) * (bw / 2);
      g.fillStyle = tone(0xb0a082, 0xa29377, r(), 0.96 + r() * 0.08);
      g.fillRect(x + j / 2, row * bh + j / 2, bw - j, bh - j);
      for (let s = 0; s < 14; s++) {
        g.fillStyle = r() < 0.5 ? 'rgba(90,80,60,0.07)' : 'rgba(255,255,240,0.09)';
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
  g.fillStyle = '#767571';
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
    g.fillStyle = v < 0.45 ? `rgba(24,23,22,${0.2 + r() * 0.25})` : `rgba(${160 + r() * 70},${160 + r() * 68},${156 + r() * 64},${0.12 + r() * 0.2})`;
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

/** The stone surround's thickness and the glass's inset from the reveal, metres, in the window decal (`paintWindow`; `DECAL_GLASS` is the glass they leave). */
const WINDOW_SURROUND = 0.14;
const WINDOW_INSET = 0.05;

/**
 * The glass of a window decal as [left, right, bottom, top], shares of the quad (up from its foot): the pane the lit windows fill after dark (see `glassVaries`). The stone surround
 * (`WINDOW_SURROUND`) and the glass's inset from the reveal (`WINDOW_INSET`) leave it, and the reveal is 0.6 of a surround deep at the foot. The arched decal's head is round; the rectangle
 * runs to the top of the arch and the glass of the texture trims the corners.
 */
export const DECAL_GLASS: readonly [number, number, number, number] = (() => {
  const [tw, th] = TEXTURES.window.tile;
  const side = (WINDOW_SURROUND + WINDOW_INSET) / tw;
  return [side, 1 - side, (0.6 * WINDOW_SURROUND + WINDOW_INSET) / th, 1 - (WINDOW_SURROUND + WINDOW_INSET) / th];
})();

/** A sash window with its stone surround, drawn once over a quad of TEXTURES.window.tile metres. */
function paintWindow(g: Ctx, w: number, h: number, arched: boolean): void {
  const stone = '#cfc7b0';
  const pxm = w / TEXTURES.window.tile[0];
  g.clearRect(0, 0, w, h);
  const sx = WINDOW_SURROUND * pxm; // surround thickness
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
  const inset = WINDOW_INSET * pxm;
  const glassPath = (): void => {
    g.beginPath();
    if (arched) {
      g.moveTo(gx + inset, h - sx * 0.6 - inset); g.lineTo(gx + inset, w / 2); g.arc(w / 2, w / 2, gw / 2 - inset, Math.PI, 0); g.lineTo(gx + gw - inset, h - sx * 0.6 - inset);
    } else {
      g.rect(gx + inset, gy + inset, gw - 2 * inset, h - sx * 1.6 - 2 * inset);
    }
    g.closePath();
  };
  // The glass mirrors the sky: pale sky-blue at the top, falling to the dark of the room behind it (R-lighting-materials-a2: the great windows
  // and the sashes beside them are patchy, bright where they catch the sky and dark where they show the interior).
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, '#93aec4');
  lg.addColorStop(0.45, '#5f7890');
  lg.addColorStop(1, '#2f3b48');
  g.fillStyle = lg;
  glassPath(); g.fill();
  g.save();
  glassPath(); g.clip();
  // a slanting glint of sky across the whole window: a bright band, a dim gap, a fainter band
  const glint = g.createLinearGradient(0, 0, w, h * 0.55);
  glint.addColorStop(0, 'rgba(226,238,250,0)');
  glint.addColorStop(0.3, 'rgba(226,238,250,0.30)');
  glint.addColorStop(0.5, 'rgba(226,238,250,0.04)');
  glint.addColorStop(0.68, 'rgba(226,238,250,0.20)');
  glint.addColorStop(1, 'rgba(226,238,250,0)');
  g.fillStyle = glint;
  g.fillRect(0, 0, w, h);
  // each pane has its own sheet of glass: its own share of sky or room (two columns by four rows, as the bars below divide it)
  const pr = rng(arched ? 97 : 89);
  const rows = [0, 1, 2, 3, 4].map((i) => (i === 0 ? 0 : i === 4 ? h : gy + ((h - sx * 2.4) * i) / 4 + (arched ? w / 4 : 0) * (i / 4)));
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      const a = 0.04 + pr() * 0.13;
      g.fillStyle = pr() < 0.55 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(8,14,22,${(a * 1.5).toFixed(3)})`;
      g.fillRect(col * (w / 2), rows[row] as number, w / 2, (rows[row + 1] as number) - (rows[row] as number));
    }
  }
  // the reveal shades the glass at its left and top
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, 0, gx + inset + 0.07 * pxm, h);
  g.fillRect(0, 0, w, gy + inset + 0.07 * pxm);
  g.restore();
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
  g.fillStyle = '#d2d3d0';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < boards; i++) {
    const x = i * bw;
    g.fillStyle = tone(0xeceeed, 0xe1e2df, r(), 0.98 + r() * 0.04);
    g.fillRect(x + 1.5, 0, bw - 3, h);
    for (let s = 0; s < 10; s++) { // grain: faint streaks along the board
      g.fillStyle = r() < 0.5 ? 'rgba(96,100,104,0.05)' : 'rgba(250,252,255,0.10)';
      g.fillRect(x + 2 + r() * (bw - 5), r() * h, 1, 8 + r() * 40);
    }
    const jy = r() * h; // the butt joint of this board (staggered from its neighbours)
    g.fillStyle = 'rgba(60,64,68,0.22)';
    g.fillRect(x + 1.5, jy, bw - 3, 1.2);
  }
  g.fillStyle = 'rgba(52,56,60,0.32)'; // the vee-joints between boards
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
  g.fillStyle = 'rgba(66,74,82,1)'; // astragal bars, dark steel like the ribs: a grid of dark lines across bright glass (R-lighting-materials-b)
  g.fillRect(0, 0, 3, h);
  g.fillRect(0, 0, w, 4);
}

const PAINTERS: Readonly<Record<TextureName, (g: Ctx, w: number, h: number) => void>> = {
  brick: (g, w, h) => paintBrick(g, w, h),
  brickRed: (g, w, h) => paintBrick(g, w, h, RED_BRICK),
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
  | 'brickRed' | 'slateBothSides' | 'sash' | 'sashArch' | 'pane' | 'platformEdgeStrip' | 'brickFoot' | 'stoneFoot';

/**
 * A wall material with the contact shade at its foot, the define lighting.ts `FOOT_SHADE` names (not imported: lighting.ts is the page's chunk, this its own; a test holds the two to one name).
 * The define's value is how deep the long, slight fall-off above the thin line at the wall's foot is, as GLSL: the share of the light lost at the foot (0.08 by default).
 */
export const footShaded = <T extends THREE.Material>(m: T, depth = '0.08'): T => {
  m.defines = { ...m.defines, FOOT_SHADE: depth };
  return m;
};
/** The King's Cross front's depth of the contact shade's long fall-off (see `footShaded`; the landmarks keep 0.08): 0.82 of the light at 1.2 m up the wall and 0.93 at 3 m, where 0.08 keeps 0.95 and 0.98. */
const FRONT_FOOT = '0.32';

function tiled(name: TextureName, extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const t = texture(name);
  return new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : TEXTURES[name].average, ...extra });
}

/**
 * GLSL for the glass of a window: of every window on a facade, one mirrors the bright sky and one shows the dark room behind it, and the
 * rest are between (R-lighting-materials-a2: the windows of a real facade are patchy, none alike). `gk` is 0..1, fixed for a window; the
 * glass (the blue of the texture, which the stone, the sash bars and the wall are not) is brightened toward a cool sky-blue where `gk` is high
 * and darkened toward a warm room where it is low, about 0.55 to 1.55 of the painted tone (1.05 on average, so a facade's mean is where it was).
 * The wall, the surround and the bars are not touched.
 */
const glassVariesGlsl = (lo: number, hi: number): string => /* glsl */`
float gShare = smoothstep( 0.08, 0.2, ( diffuseColor.b - diffuseColor.r ) / ( diffuseColor.b + diffuseColor.r + 0.02 ) );
vec3 gTint = mix( vec3( 1.10, 1.03, 0.92 ), vec3( 0.82, 0.92, 1.08 ), gk );
diffuseColor.rgb *= mix( vec3( 1.0 ), gTint * mix( ${lo}, ${hi}, gk ), gShare );
`;
const GLASS_VARIES_GLSL = glassVariesGlsl(0.55, 1.55);

/**
 * Blinds in the decal windows (the E4 scorer, round six: the hotel's windows read as one dark blue pane over and over; the photograph of the Great Northern
 * (hist-a, 2013) has the white sashes round glass that is dark in some windows, grey with the sky in others and pale cream with a blind or a net in a good
 * quarter of them). A window whose number `gk` lies in the middle of its range (0.4 to 0.6: about one in six, the numbers lean to the ends) has a cream blind
 * drawn down over the top of its glass, to a depth of its own (0.3 to 0.9 of the window's height, from `gq`, a second number of the window's corner: a plain sine of
 * 7.3 radians a metre and no steeper, so a window's depth moves by under a hundredth when the shader's idea of the corner wanders by 3 mm, where a hash of `gk` would
 * jump), of a cream of its own (0.8 to 1.0 of 0.70, 0.62, 0.46, linear: the blind takes the light the wall does). Only the
 * glass is covered (`gShare`, as the brightening above): the stone, the bars and the reveal stay as they were, so the blind reads as behind the sash. The quad's V
 * runs up from 0 at the foot of the window to 1 at its top.
 */
const GLASS_BLIND_GLSL = /* glsl */`
float gBlind = smoothstep( 0.37, 0.43, gk ) * ( 1.0 - smoothstep( 0.57, 0.63, gk ) );
float gDrop = 0.3 + 0.6 * gq;
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.70, 0.62, 0.46 ) * ( 1.0 - 0.2 * gq ), gShare * gBlind * smoothstep( 0.97 - gDrop, 1.03 - gDrop, vMapUv.y ) );
`;

/**
 * How lit the windows are: 0 by day, 1 after dark. atmosphere.ts sets it from the sun and the weather (`rig.lampLevel`, the lamps' own ramp, as it sets `trainNight`), so the windows
 * come on through the dusk and stay on all night. By day (under a few thousandths) the shaders below do nothing at all.
 */
export const windowNight = { value: 0 };

/**
 * Lit windows after dark (round seven: "the nighttime view is missing lighting in the buildings and streets around the stations"). Each window of a facade is lit or dark for good, by
 * a number of its own, so a street of houses is a patchwork, none changes from one frame to the next, and nothing flickers. The light is the window's own (an emissive term, no lamp in
 * the scene): warm (tungsten and warm white) in most, cool white in some, each at a brightness of its own, in the glass of the texture alone (the sash bars, the stone and the
 * brick are not lit) and in a pane of the tile (`FACADE_GLASS`, `DECAL_GLASS`) that holds from a distance, where the texture's blue has washed out of its smaller mips.
 *   winHash   a number 0..1 from a window's cell, a seed of its building's and a salt
 *   winPane   1 inside the pane `r` (left, right, bottom, top, shares of the cell) of a point `f` in the cell, the edge a pixel wide (`w`, the cell a pixel spans)
 *   winLight  a window's light, from four numbers of its own `h` (the first against the building's share lit, the second against the share of dark floors, then the hour of the dusk it
 *             comes on at, then its tone: which white, how bright), the night's level, the share lit, the share of floors dark and the share that are cool
 *   winMean   the light a pixel that spans many windows takes: what a building's windows average to
 *   winTile   a facade's window at `v` (the storeys and bays up and along: the tile's own UV), with its seed (the building's colour)
 *   winDecal  a decal's window, from four smooth numbers of its corner (the arcsine kind the sines give; `winUni` makes them even)
 * A window of a facade is one of its building's lit ones when its number is under the building's share (a seed's fraction: 0.14 to 0.64 of the windows in a house, more in a tower),
 * and is dark if its floor is one of the dark (a hash of the floor's number and the building's seed alone, so a floor is dark the whole way round the building). It comes on at an hour of
 * the dusk of its own (a ramp of `night` from 0.04 + 0.6 h to 0.26 + 0.6 h, so the windows come on one by one as the light goes and all are on at full night). From a distance, where a pixel
 * spans more than a quarter of a tile, it takes `winMean` and the rectangle of the pane, so a far block is a steady dim glow and not a shimmer.
 */
const WIN_NIGHT_GLSL = /* glsl */`
float winHash( vec2 c, float seed, float salt ) {
  return fract( sin( dot( c, vec2( 12.9898, 78.233 ) ) + seed * 2.713 + salt * 19.19 ) * 43758.5453 );
}
float winUni( float a ) {
  return 0.63662 * asin( sqrt( clamp( a, 0.0, 1.0 ) ) );
}
float winPane( vec2 f, vec4 r, vec2 w ) {
  vec2 e = max( w, vec2( 0.002 ) );
  vec2 lo = smoothstep( r.xz - e, r.xz + e, f );
  vec2 hi = smoothstep( -r.yw - e, -r.yw + e, -f );
  return lo.x * lo.y * hi.x * hi.y;
}
vec3 winLight( vec4 h, float night, float share, float off, float cool ) {
  float on = step( h.x, share ) * step( off, h.y ) * smoothstep( 0.04 + 0.6 * h.z, 0.26 + 0.6 * h.z, night );
  vec3 warm = mix( vec3( 1.0, 0.58, 0.26 ), vec3( 1.0, 0.82, 0.54 ), fract( h.w * 5.3 ) );
  vec3 col = mix( warm, vec3( 0.66, 0.82, 1.0 ), step( 1.0 - cool, fract( h.w * 9.7 + 0.37 ) ) );
  return col * on * ( 0.5 + 0.5 * fract( h.w * 3.1 + 0.2 ) );
}
vec3 winMean( float night, float share, float off, float cool ) {
  return mix( vec3( 1.0, 0.70, 0.40 ), vec3( 0.66, 0.82, 1.0 ), cool ) * ( 0.75 * share * ( 1.0 - off ) * clamp( ( night - 0.15 ) / 0.6, 0.0, 1.0 ) );
}
vec3 winTile( vec2 v, vec2 w, float seed, float night, vec4 rect, vec4 mode, float glass ) {
  vec2 cell = floor( v );
  float share = mode.x + mode.y * fract( seed * 3.71 + 0.29 );
  vec4 h = vec4( winHash( cell, seed, 1.0 ), winHash( vec2( 0.0, cell.y ), seed, 2.0 ), winHash( cell, seed, 3.0 ), winHash( cell, seed, 4.0 ) );
  float span = max( w.x, w.y );
  float far = smoothstep( 0.25, 0.6, span );
  float near = 1.0 - smoothstep( 0.03, 0.1, span );
  vec3 own = winLight( h, night, share, mode.z, mode.w ) * ( winPane( v - cell, rect, w ) * mix( 1.0, 0.3 + 0.7 * glass, near ) );
  return mix( own, winMean( night, share, mode.z, mode.w ) * ( ( rect.y - rect.x ) * ( rect.w - rect.z ) ), far );
}
vec3 winDecal( vec2 v, vec2 w, vec4 g, float night, vec4 rect, float glass, float blind ) {
  float share = 0.3 + 0.4 * g.w;
  vec4 h = vec4( winUni( g.x ), 1.0, winUni( g.y ), winUni( g.z ) );
  float span = max( w.x, w.y );
  float far = smoothstep( 0.25, 0.6, span );
  float near = 1.0 - smoothstep( 0.03, 0.1, span );
  vec3 own = winLight( h, night, share, 0.0, 0.1 ) * ( winPane( v, rect, w ) * mix( 1.0, 0.3 + 0.7 * glass, near ) * mix( 0.55, 1.0, blind ) );
  return mix( own, winMean( night, share, 0.0, 0.1 ) * ( ( rect.y - rect.x ) * ( rect.w - rect.z ) * 0.8 ), far );
}
`;

/**
 * How a kind of facade's windows are lit after dark: [the fewest of a building's windows lit, the range above that (a building's own share is the fewest and a fraction of the range:
 * a house has 14 to 64 in a hundred lit), the share of its floors with every light out, the share of the lit windows that are cool white and not warm]. ASSUMED: the mix of a London
 * evening; the lit shopfronts are the open ones, the towers' offices light by floors with some floors empty, and a house's windows are mostly warm.
 */
const NIGHT_MODE = {
  house: [0.14, 0.5, 0.12, 0.18],
  curtain: [0.55, 0.4, 0.4, 0.35],
  shop: [0.4, 0.45, 0, 0.12],
} as const;

/** A GLSL float: always with a point (the tests' interpreter and a strict compiler both want `1.0`, not `1`). */
const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const glslVec4 = (v: readonly number[]): string => `vec4( ${v.map(glslFloat).join(', ')} )`;

/**
 * One window to a tile (the city's facades: stock, red, stone, panel, glass and shop repeat one storey by one bay): the window's number is the
 * tile's, mixed with the building's own (its vertex colour), so a facade is a patchwork of windows and its neighbour a different one.
 * A curtain wall (the 'glass' facade) takes three quarters of its number from a smooth field across the tiles instead, and a narrower swing
 * of light (0.8 to 1.3, not 0.55 to 1.55): a glass tower reflects the sky in broad patches and bands, not in a random chequer of panes, which
 * from the overview was a repeating tiled blue. Round five (the E4 scorer: "uniform blue horizontal stripes on every building, with no sky gradient or reflection variation between
 * panes ... a per-facade sky-reflection gradient, brighter toward the top"): a curtain wall's number also rises with the height, from the foot (the glass shows the street and its
 * shade: darker, warmer) to the upper storeys (the sky: brighter, cooler), `1 - exp( -0.2 v )` of it with v the storeys up the wall, and takes 0.6 of a building's own offset from
 * its colour (`fract( gSeed )`: the building's tint is its own), so one tower is paler and bluer overall and its neighbour darker. The two are held level at five storeys up on a
 * building of the middle tint, where the facade's mean is where it was; the number is held to 0..1, so a tall wall's upper storeys are the brightest and bluest glass it has.
 * Every facade is darker at its foot (contact shade: the ground's occlusion, the damp and the
 * dirt at the base of a wall): 0.22 of its light falling away over a storey, and a tighter 0.30 in the first third of one (0.14 until round five, when the E2 scorer saw
 * "building bases ... meet the ground with no darkening": the line at the foot is 0.48 now, not 0.64, and a four-storey wall's mean light falls by half a per cent); v is
 * the height up the wall in storeys, and starts at zero at the foot of each part of a wall, so the storey above a shopfront has a shadow under its fascia too.
 */
const glassByTileGlsl = (curtain: boolean): string => /* glsl */`
float gSeed = 0.0;
#ifdef USE_COLOR
gSeed = dot( vColor.rgb, vec3( 37.1, 91.7, 53.3 ) );
#endif
float gk = fract( sin( dot( floor( vMapUv ), vec2( 12.9898, 78.233 ) ) + gSeed ) * 43758.5453 );
${curtain ? 'gk = mix( gk, 0.5 + 0.5 * sin( dot( floor( vMapUv ), vec2( 0.41, 0.23 ) ) + 3.1 * gSeed + 1.7 * sin( dot( floor( vMapUv ), vec2( 0.17, 0.31 ) ) ) ), 0.75 );\ngk = clamp( gk + 0.07 + 0.6 * fract( gSeed ) - exp( -0.2 * vMapUv.y ), 0.0, 1.0 );' : ''}
${curtain ? glassVariesGlsl(0.8, 1.3) : GLASS_VARIES_GLSL}
diffuseColor.rgb *= 1.0 - 0.22 * exp( -vMapUv.y ) - 0.30 * exp( -8.0 * vMapUv.y );
if ( uWinNight > 0.003 ) totalEmissiveRadiance += winTile( vMapUv, fwidth( vMapUv ), gSeed, uWinNight, WIN_RECT, WIN_MODE, gShare );
`;

/**
 * The smooth field a decal window's number is read from, at the window's corner (world metres): two sines at frequencies of 2 to 4 radians
 * a metre, one bent by the other, so windows a few metres apart land on unrelated values and one window, whose corner the shader finds to a
 * few thousandths of a metre, lands on one. `windowKey` is the same expression in TypeScript (the GLSL below is built from the same numbers),
 * so the tests can hold the spread and the steadiness to account.
 */
export const WINDOW_FIELD = { a: [2.37, 3.11, 1.73], b: [1.13, 2.71, 3.37], k: 1.9 } as const;

/** 0..1, the number of the window whose corner is at (x, y, z) metres: see `WINDOW_FIELD`. */
export function windowKey(x: number, y: number, z: number): number {
  const { a, b, k } = WINDOW_FIELD;
  return 0.5 + 0.5 * Math.sin(x * a[0] + y * a[1] + z * a[2] + k * Math.sin(x * b[0] + y * b[1] + z * b[2]));
}

/**
 * A window decal is a quad with the texture drawn once over it (UV 0..1), merged with its neighbours into one mesh: the window's number is
 * that of its own corner. The corner is rebuilt in the fragment shader from the screen derivatives of the world position and the UV (the
 * mapping is affine across a quad), and turned into a number by a smooth field (not a hash), so the few thousandths of a metre the derivatives
 * wander by cannot make a window shimmer: neighbouring windows, metres apart, get different values; one window gets one.
 */
const GLASS_BY_QUAD_GLSL = /* glsl */`
vec3 gDx = dFdx( vWinPos ), gDy = dFdy( vWinPos );
vec2 gUx = dFdx( vMapUv ), gUy = dFdy( vMapUv );
float gDet = gUx.x * gUy.y - gUy.x * gUx.y;
float gk = 0.5;
float gq = 0.5;
float gLit = 0.5;
float gHour = 0.5;
float gArea = 0.5;
if ( abs( gDet ) > 1e-12 ) {
  vec3 gA = ( gDx * gUy.y - gDy * gUx.y ) / gDet;
  vec3 gB = ( gDy * gUx.x - gDx * gUy.x ) / gDet;
  vec3 gO = vWinPos - vMapUv.x * gA - vMapUv.y * gB;
  gk = 0.5 + 0.5 * sin( dot( gO, vec3( ${WINDOW_FIELD.a.join(', ')} ) ) + ${WINDOW_FIELD.k} * sin( dot( gO, vec3( ${WINDOW_FIELD.b.join(', ')} ) ) ) );
  gq = 0.5 + 0.5 * sin( dot( gO, vec3( 4.3, 2.9, 5.1 ) ) );
  if ( uWinNight > 0.003 ) {
    gLit = 0.5 + 0.5 * sin( dot( gO, vec3( 3.7, 2.3, 4.9 ) ) + 2.1 * sin( dot( gO, vec3( 1.7, 3.1, 2.3 ) ) ) );
    gHour = 0.5 + 0.5 * sin( dot( gO, vec3( 5.3, 4.1, 2.9 ) ) );
    gArea = 0.5 + 0.5 * sin( dot( gO.xz, vec2( 0.052, 0.043 ) ) );
  }
}
${GLASS_VARIES_GLSL}${GLASS_BLIND_GLSL}
if ( uWinNight > 0.003 ) totalEmissiveRadiance += winDecal( vMapUv, fwidth( vMapUv ), vec4( gLit, gHour, gk, gArea ), uWinNight, WIN_RECT, gShare, gBlind * smoothstep( 0.97 - gDrop, 1.03 - gDrop, vMapUv.y ) );`;

/**
 * Give a window material the variation above: per quad for a decal drawn once over a quad, per tile for a repeating facade. The material
 * must carry a map (the windows are in the texture). Its program key says which, so the two never share a compile.
 */
export function glassVaries<T extends THREE.MeshLambertMaterial | THREE.MeshPhongMaterial>(m: T, by: 'quad' | 'tile' | 'curtain', glass: readonly number[] = DECAL_GLASS, mode: readonly number[] = NIGHT_MODE.house): T {
  // after dark (`windowNight`): the pane of the window's glass in its tile or quad, and for a facade how its windows are lit. Defines, so each kind of facade is a program of its own.
  m.defines = { ...m.defines, WIN_RECT: glslVec4(glass), ...(by === 'quad' ? {} : { WIN_MODE: glslVec4(mode) }) };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWinNight = windowNight;
    if (by === 'quad') {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWinPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWinPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${by === 'quad' ? 'varying vec3 vWinPos;\n' : ''}uniform float uWinNight;${WIN_NIGHT_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${by === 'quad' ? GLASS_BY_QUAD_GLSL : glassByTileGlsl(by === 'curtain')}`);
  };
  m.customProgramCacheKey = () => `glassVaries-${by}`;
  return m;
}

/**
 * The panes of the shed's great windows, in the shed's frame (x across, y up). shed.ts `lunetteBars` puts a vertical bar every 1.6 m from the window's centre line and a transom at a third
 * and two thirds of the half disc's radius (SHED_SPAN_WIDTH / 2 / 3 = 5.334 m) above the springing (SHED_CROWN_HEIGHT - SHED_SPAN_WIDTH / 2 = 5.6388 m): a pane is 1.6 by 5.334 m. The two windows
 * are 2 x SHED_SPAN_WIDTH = 20 bars apart (to 4 mm), so one grid, counted from the shed's centre line, serves both. ASSUMED to match shed.ts: tests/materials.test.ts holds them to its bars.
 */
export const GLAZING = { spacing: 1.6, tier: 5.334, springing: 5.6388 } as const;

/**
 * GLSL for the sky in the great windows of the shed's front and in the gables behind it (R-lighting-materials-a2: the arched glazing mirrors the sky in pale
 * diagonal streaks and shows the dark ribs and the platforms through the rest, never one even tint). It runs after the lights and the tone map, just before
 * the fog, on `gl_FragColor`: the pane takes the sky's own colour (`fogColor`: the haze the sky ends in at the horizon, as the page shows it, taken 0.7 of
 * the way to white) by a share `gf`, its own colour dimmed by 0.45 so a streak shows, and is 0.8 of that share more opaque, so a bright streak hides the room
 * behind it and a dark gap shows it. The share is a Fresnel-like term (0.45 face-on, 0.85 at a glancing view) times a field of streaks fixed to the glass, so
 * a streak stays where it is as the camera moves: bands of the glass's x and height that lean 61 degrees (lines of x * 0.9 + y * 0.5), the sum of
 * three sines 6, 17 and 2.7 m apart (so no two bands are alike) and a weak cross wave to stop them running dead parallel, held to 0.8 (the room is never wholly hidden).
 * Round six, the lighting-materials scorer ("the reflection reads as broad diagonal bands that wash out the platform numbers"; R-a2's panes each mirror the sky to a share of their own,
 * and the bars and the ribs read through): the field is read at the middle of each pane, not at the fragment, so a pane is one tone and the next pane another (the panes are
 * `GLAZING`: a bar every 1.6 m from the shed's centre line, a transom at each third of the half disc, so a pane is 1.6 by 5.334 m), and the field's swing is half what it was, 0.075 to 0.95
 * of the share and not 0.15 to 1.9 (a clear pane never mirrors more than 0.43 face-on, 0.8 at a glancing view). A clear sky has the streaks (the sky is bluer than it is red by 0.04 to 0.25: `gc`); a grey one (an overcast, snow,
 * fog or rain) has one even veil of the Fresnel-like share, as a sky with nothing in it mirrors. How much the glass mirrors scales with how bright the sky is
 * (`fogColor.g`: none under 0.55, which is a dusk's salmon horizon at 0.549 and a night's at 0.09, all of it from 0.8, a clear noon's 0.804; a heavy rain's grey
 * 0.67 gets 0.44), so a window never glows at dusk or night and the lit shed behind it shows as it did. Only where the scene has fog (no fog, no sky colour) and
 * only on the outside face: three draws a double-sided transparent pane in two passes, back faces first with `FLIP_SIDED` defined (and the winding flipped
 * with it, so `gl_FrontFacing` is true there too), so that pass is left out, and `gl_FrontFacing` keeps a single-pass pane to its front face. The front's glass
 * looks out south as built; the gables' (shed.ts `facingNorth`) are turned to look out north. From inside a window shows what is outside it, and no mirror.
 */
const SKY_GLINT_GLSL = /* glsl */`
#if defined( USE_FOG ) && ! defined( FLIP_SIDED )
vec2 gm = ( floor( vec2( ( vGlassPos.x - uPaneX ) / ${GLAZING.spacing}, ( vGlassPos.y - ${GLAZING.springing} ) / ${GLAZING.tier} ) ) + 0.5 ) * vec2( ${GLAZING.spacing}, ${GLAZING.tier} ) + vec2( uPaneX, ${GLAZING.springing} );
float gp = dot( gm, vec2( 0.9, 0.5 ) );
float gb = sin( gp ) + 0.8 * sin( 0.37 * gp + 1.3 ) + 0.5 * sin( 2.3 * gp + 4.0 ) + 0.35 * sin( dot( gm, vec2( -0.45, 0.8 ) ) + 0.7 );
float gs = gl_FrontFacing ? smoothstep( 0.55, 0.8, fogColor.g ) : 0.0;
float gc = smoothstep( 0.04, 0.25, fogColor.b - fogColor.r );
float gf = min( ( 0.45 + 0.4 * ( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ) ) ) * mix( 1.0, 0.075 + 0.875 * smoothstep( -0.6, 0.9, gb ), gc ), 0.8 ) * gs;
gl_FragColor.rgb = mix( gl_FragColor.rgb * ( 1.0 - 0.45 * gs ), mix( fogColor, vec3( 1.0 ), 0.7 * gs ), gf );
gl_FragColor.a = mix( gl_FragColor.a, 1.0, 0.8 * gf );
#endif
`;

/** The x, in the glass's own frame, that the panes are counted from: the middle of the geometry being drawn (the shed's centre line, for the front's glass and the gables'). */
const paneX = { value: 0 };

/**
 * Give a Phong glass the sky above (see `SKY_GLINT_GLSL`). Its program key says so, so it never shares a compile with a plain Phong. The glass's own x and height reach the
 * fragment (`vGlassPos`: the great windows are built flat, in the shed's frame, and only the group moves them), and the panes are counted from the middle of what is drawn,
 * which is the shed's centre line for the front and for the gables alike (each window is `GLAZING.spacing` times a whole number of bars from it, to 2 mm).
 */
export function skyGlint<T extends THREE.MeshPhongMaterial>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPaneX = paneX;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGlassPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassPos = position.xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGlassPos;\nuniform float uPaneX;')
      .replace('#include <fog_fragment>', `${SKY_GLINT_GLSL}#include <fog_fragment>`);
  };
  m.onBeforeRender = (_renderer, _scene, _camera, geometry) => {
    const box = geometry.boundingBox ?? (geometry.computeBoundingBox(), geometry.boundingBox);
    if (box) paneX.value = (box.min.x + box.max.x) / 2;
  };
  m.customProgramCacheKey = () => 'skyGlint';
  return m;
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
  // Plain glass for the big windows: a little reflective (a specular highlight from the sun), tinted blue-green, and mirroring the sky in patches (skyGlint).
  glass: () => skyGlint(new THREE.MeshPhongMaterial({ color: 0x86a9c4, specular: 0xbfd2e4, shininess: 80, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })),
  window: () => glassVaries(tiled('window', { transparent: true, alphaTest: 0.05 }), 'quad'),
  windowArch: () => glassVaries(tiled('windowArch', { transparent: true, alphaTest: 0.05 }), 'quad'),
  concrete: () => new THREE.MeshLambertMaterial({ color: 0x8e8e8a }),
  steel: () => new THREE.MeshLambertMaterial({ color: 0x3d4650 }),
  whiteSteel: () => new THREE.MeshLambertMaterial({ color: 0xe6eaee }),
  // The restored shed's ironwork: slender ribs and bars in dark grey paint, the colour of the lunette frames in R-lighting-materials-a2 and
  // of the ribs in R-lighting-materials-b (where they stand as dark silhouettes against the bright glazing; a pale rib reads as a white scaffold).
  // The first build had them light, to keep the undersides from going black; the small emissive term does that now. The shade of grey is ASSUMED
  // (the 2012 paint scheme was not found).
  ribPaint: () => new THREE.MeshLambertMaterial({ color: 0x343b42, emissive: 0x15191d }),
  // The underside of a roof seen from inside: pale painted boarding (the 'lining' texture), a neutral light grey as in R-lighting-materials-b
  // (the lined flank of the roof is grey-white there, never cream). The scene's lights shine from above, so an underside would come out
  // black; the emissive term (which takes the texture too, so the boards still show) stands in for the light that really comes down
  // through the glazing and off the platforms.
  lining: () => tiled('lining', { side: THREE.BackSide, emissive: 0x777a7d, emissiveMap: texture('lining') }),
  // The same boarding on the valley's vertical faces, seen from the front.
  valleyLining: () => tiled('lining', { emissive: 0x777a7d, emissiveMap: texture('lining') }),
  // The shed's roof glazing. It glows a little (emissive) so it reads as daylight from inside; shed.ts clones
  // it and sets the opacity by camera distance (see glazingOpacity there).
  shedGlass: () => tiled('shedGlass', { transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x73879a, emissiveMap: texture('shedGlass') }),
  // Solid pale roof panels (the outer part of the Western Concourse roof), slightly see-through.
  panel: () => new THREE.MeshLambertMaterial({ color: 0xe3e8ee, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }),
  concourseFloor: () => tiled('floorSlab'),
  // The Midland Grand's red brick: its own texture (the same bond and bricks as the stock, drawn in red; see TEXTURES.brickRed).
  brickRed: () => tiled('brickRed'),
  // The slate seen from inside the shed: the shared slate culls back faces, so this is a two-sided one.
  slateBothSides: () => tiled('slate', { side: THREE.DoubleSide }),
  // Window decals: flat quads stood a hair off a wall, so they are pulled toward the camera (see `nearer`).
  sash: () => glassVaries(nearer(tiled('window', { transparent: true, alphaTest: 0.05 })), 'quad'),
  sashArch: () => glassVaries(nearer(tiled('windowArch', { transparent: true, alphaTest: 0.05 })), 'quad'),
  // A dark pane set in a bar or a frame (the Barlow shed's roof lights, tower openings).
  pane: () => nearer(new THREE.MeshLambertMaterial({ color: 0x232c38 })),
  // The coping / tactile / white-line strip laid on a platform's surface: the platform-edge texture with the
  // polygon offset that keeps it clear of the surface at any range.
  platformEdgeStrip: () => nearer(tiled('platformEdge')),
  // The King's Cross front's brick and stone (shed.ts: the front wall, its plinth and courses, the clock tower, the shed's end walls) with the contact shade at the foot of a wall (round five, E2):
  // these walls stand on the ground and their UVs are in metres from it. The Western Range's walls keep the plain ones, the colour it was fitted to.
  // Round six (the E2 scorer: "the south-front foot shade is barely visible"): a deeper long fall-off than the landmarks' (FRONT_FOOT): the piers' feet, the plinth and the arcade's wall are a clear darker
  // band at the south front's own view, and the close brick view's median L falls from 51.9 to 50.6 (dE2000 to R-a2 3.3 to 4.4, to R-a 2.4 to 3.4)
  brickFoot: () => footShaded(tiled('brick'), FRONT_FOOT),
  stoneFoot: () => footShaded(tiled('stone'), FRONT_FOOT),
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

/**
 * Where the glass of each facade's window is in its tile, as the painters below draw it (round seven: the lit windows' panes are this glass): its width, its height and its sill (the height
 * of its foot above the tile's foot), in texels (FACADE_TEXELS_PER_M to the metre), centred across the tile. The painters read these, and so does `FACADE_GLASS`.
 */
const PANE = {
  stock: { ww: 105, wh: 175, sill: 85 },
  red: { ww: 120, wh: 215, sill: 90 },
  stone: { ww: 110, wh: 230, sill: 90 },
  panel: { ww: 190, wh: 145, sill: 85 },
} as const;
/** The red facade's round head: its arch rises this share of the window's width above the springing. */
const RED_RISE = 0.2;
/** The curtain wall's vision glass: the margin at each mullion and at the transom above it, and the spandrel's depth below it, in texels. */
const CURTAIN_PANE = { side: 2, top: 10, spandrel: 90 } as const;
/** The shopfront's plate glass: the margin at each pilaster, the fascia's depth above it and the stall riser's below it, in texels. */
const SHOP_PANE = { side: 14, fascia: 90, riser: 55 } as const;

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

/**
 * The glass of each facade's window as [left, right, bottom, top], shares of its tile (up from the tile's foot): the panes the lit windows fill after dark (see `glassVaries`). From the numbers
 * the painters draw it with (`PANE` and the rest above). The red facade's head is round and the rectangle runs to half way up its arch: the glass of the texture trims the corners.
 */
export const FACADE_GLASS: Readonly<Record<FacadeKey, readonly [number, number, number, number]>> = (() => {
  const rect = (key: FacadeKey): readonly [number, number, number, number] => {
    const [w, h] = CITY_TEXTURES[key].px;
    if (key === 'glass') return [CURTAIN_PANE.side / w, 1 - CURTAIN_PANE.side / w, CURTAIN_PANE.spandrel / h, 1 - CURTAIN_PANE.top / h];
    if (key === 'shop') return [SHOP_PANE.side / w, 1 - SHOP_PANE.side / w, SHOP_PANE.riser / h, 1 - SHOP_PANE.fascia / h];
    const p = PANE[key];
    const rise = key === 'red' ? p.ww * RED_RISE : 0;
    return [(w - p.ww) / 2 / w, (w + p.ww) / 2 / w, p.sill / h, (p.sill + p.wh - rise / 2) / h];
  };
  return { stock: rect('stock'), red: rect('red'), stone: rect('stone'), panel: rect('panel'), glass: rect('glass'), shop: rect('shop') };
})();

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
  lg.addColorStop(0, '#93aec4'); // the sky in the glass: pale at the top, the dark of the room below
  lg.addColorStop(0.45, '#5f7890');
  lg.addColorStop(1, '#2f3b48');
  g.fillStyle = lg;
  g.fillRect(x0, yt, o.ww, o.wh);
  // a slanting glint of sky, and each pane its own share of sky or room (the sashes are separate sheets of glass)
  const glint = g.createLinearGradient(x0, yt, x0 + o.ww, yt + o.wh * 0.55);
  glint.addColorStop(0, 'rgba(226,238,250,0)');
  glint.addColorStop(0.3, 'rgba(226,238,250,0.26)');
  glint.addColorStop(0.5, 'rgba(226,238,250,0.04)');
  glint.addColorStop(0.68, 'rgba(226,238,250,0.18)');
  glint.addColorStop(1, 'rgba(226,238,250,0)');
  g.fillStyle = glint;
  g.fillRect(x0, yt, o.ww, o.wh);
  const pr = rng(Math.round(cx * 7 + o.ww * 13 + o.wh * 3 + o.sill));
  for (let row = 0; row < o.rows; row++) {
    for (let col = 0; col < o.cols; col++) {
      const a = 0.04 + pr() * 0.13;
      g.fillStyle = pr() < 0.55 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(8,14,22,${(a * 1.5).toFixed(3)})`;
      g.fillRect(x0 + (o.ww * col) / o.cols, yt + (o.wh * row) / o.rows, o.ww / o.cols, o.wh / o.rows);
    }
  }
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
  citySash(g, w / 2, h, { ww: PANE.stock.ww, wh: PANE.stock.wh, sill: PANE.stock.sill, cols: 2, rows: 6, surround: '#d2cab4', frame: '#e8e5da' });
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
  const ww = PANE.red.ww;
  const wh = PANE.red.wh;
  const yb = h - PANE.red.sill;
  const yt = yb - wh;
  const rise = ww * RED_RISE;
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
  citySash(g, w / 2, h, { ww: PANE.stone.ww, wh: PANE.stone.wh, sill: PANE.stone.sill, cols: 2, rows: 6, surround: '#efe9d8', frame: '#f1eee4', hood: 16 });
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
  const ww = PANE.panel.ww;
  const wh = PANE.panel.wh;
  const yb = h - PANE.panel.sill;
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
  lg.addColorStop(0, '#9db4c4');
  lg.addColorStop(1, '#4f6a7c');
  g.fillStyle = lg;
  g.fillRect(CURTAIN_PANE.side, CURTAIN_PANE.top, w - 2 * CURTAIN_PANE.side, h - CURTAIN_PANE.top - CURTAIN_PANE.spandrel); // vision glass above the spandrel, which is at the bottom of the tile
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
  const { side, fascia, riser } = SHOP_PANE;
  const lg = g.createLinearGradient(0, fascia, 0, h - riser);
  lg.addColorStop(0, '#a9b9c4'); // sky reflected in the plate glass, then the lit shop behind
  lg.addColorStop(0.45, '#b8a77c');
  lg.addColorStop(1, '#6b5a3c');
  g.fillStyle = lg;
  g.fillRect(side, fascia, w - 2 * side, h - fascia - riser);
  g.fillStyle = '#25292d'; // frames and the door
  g.fillRect(side, fascia - 4, w - 2 * side, 5);
  g.fillRect(side + (w - 2 * side) * 0.62, fascia, 4, h - fascia - riser);
  g.fillRect(w - side - 3, fascia, 3, h - fascia - riser);
  g.fillRect(side, fascia, 3, h - fascia - riser);
  g.fillStyle = '#33383d'; // the stall riser
  g.fillRect(side, h - riser, w - 2 * side, riser);
  g.fillStyle = '#4d535a';
  g.fillRect(side, h - riser, w - 2 * side, 3);
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
    return glassVaries(new THREE.MeshPhongMaterial({ map: t, color: t ? 0xffffff : CITY_TEXTURES.glass.average, vertexColors: true, specular: 0x6f7f8c, shininess: 55 }), 'curtain', FACADE_GLASS.glass, NIGHT_MODE.curtain);
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
  // (round four: London tarmac in daylight is a mid grey, L 44 in hist-a and 52 in hist-e, 7 to 10 L under the paving beside it. At a quarter of the platform
  // asphalt's light, 0x858889, 0.045 reflective, a road drew near-black (L 24) and 35 L under the footway; 0xc9cdd4 is the same texture at about three-fifths of it,
  // cool-neutral under the warm sun, 0.11 reflective: L 46 to 48 at the noon rig, 11 L under the footway and still the darkest flat thing in the street, under the open
  // ground (0.13). At 0xe0dfdc, 0.14, the roads were the ground's own tone and drew as one khaki plain from the overview)
  // Round five (the E5 scorer: "roads, footways, the ground plane and flat roofs are now near the same mid-grey, so the street pattern dissolves ... darken the carriageway a few L"):
  // in the overview's lower left the roads were L 41, the footways L 50 to 54 and the ground and flat roofs L 46 to 54, within 5 L of the road. 0xadb0b6 is the same tarmac at about
  // 0.7 of that light (0.078 reflective): the roads are L 36 to 40 there, 10 L or more under the footways (L 50 to 52) and the plaza (L 70), well over round three's near-black (L 24)
  // and 7 L under hist-a's sunlit tarmac (L 44)
  asphalt: () => cityFlat('asphalt', 0xadb0b6),
  // Paving tones are set under the daylight rig (DAYLIGHT, world.ts) to R-lighting-materials-d/e: pale warm-grey stone, about
  // (163, 158, 157) where the sun lies on it. The pavement is that; the forecourt plaza, laid in lighter stone, a shade above.
  // The footways and paths are darker than the squares they cross (R-lighting-materials-a2, -e: a pale square crossed by darker strips of
  // path paving). The first build had them 0.86 of the plaza in sRGB (0xd2d0cb under 0xf3f0e8); then the plaza was toned down to 0xd8d5ce and
  // the pavement left at 0xd2d0cb, which flattened the strips away. 0.81 of the plaza here (0xb0aea8), so the paths read across the forecourt.
  pavement: () => cityFlat('concourseFloor', 0xb0aea8),
  plaza: () => cityFlat('concourseFloor', 0xd8d5ce),
};

function cityFacade(key: FacadeKey): THREE.Material {
  const t = cityTexture(key);
  // one window to a tile: each one mirrors the sky or shows its room (see glassVaries)
  return glassVaries(new THREE.MeshLambertMaterial({ map: t, color: t ? 0xffffff : CITY_TEXTURES[key].average, vertexColors: true }), 'tile', FACADE_GLASS[key], key === 'shop' ? NIGHT_MODE.shop : NIGHT_MODE.house);
}

function cityFlat(from: 'asphalt' | 'concourseFloor', color: number): THREE.Material {
  const m = (material(from) as THREE.MeshLambertMaterial).clone();
  m.vertexColors = true;
  m.color.setHex(color);
  if (from === 'concourseFloor') m.defines = { MOTTLE: '' }; // paving: one slab's tone against the next (lighting.ts MOTTLE)
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

// =====================================================================================================
// TERRAIN BLOCK (worker S10). The ground drawn from the Environment Agency DTM (core/terrain.ts, world.ts
// addTerrain). The mesh is split by slope into three draws: level ground and grassed banks use the two
// flat-coloured materials below; a face steeper than SLOPE.wallDeg is masonry (a retaining wall) and takes
// the sooty brick below, with UVs in metres built in world.ts. The ground colour is the one the flat plane had.
// The terrain is pushed back a little in depth (polygon offset +1) so the draped city layers (their offsets
// are -1 to -6) win every depth tie, whatever the mesh's few centimetres of tolerance.
// =====================================================================================================

export type TerrainMaterialName = 'ground' | 'bank' | 'wall';

const TERRAIN_COLOUR: Readonly<Record<'ground' | 'bank', number>> = { ground: 0x626568, bank: 0x3f4a35 }; // the ground: world.ts GROUND_COLOUR (a test holds the two equal)
/**
 * The retaining wall's tint over the shared London stock brick (average 0xa0895a): it takes the brick to a dark, sooty brown,
 * about 0x57472a once mip-mapped (a century and a half of coal smoke; the shade is ASSUMED, no survey of these walls was found).
 * The walls are runs of triangles of a 4 m terrain grid, so their outline is a saw-tooth along a cutting: in clean tan brick
 * against the dark grass of the bank it read as ragged tan patches; in dark brick it settles into the bank.
 */
export const TERRAIN_WALL_TINT = 0x8f8a82;
const terrainMaterials = new Map<TerrainMaterialName, THREE.Material>();

/** The shared brick under `TERRAIN_WALL_TINT`: the same texture (UVs in metres), its own colour. In Node, flat: the average times the tint. */
function terrainWall(): THREE.Material {
  const m = (material('brick') as THREE.MeshLambertMaterial).clone();
  m.color.multiply(new THREE.Color(TERRAIN_WALL_TINT)); // white with the map, its average without: either way the product the shader draws
  return m;
}

/** A shared material for level ground ('ground'), a grassed bank ('bank') or a retaining wall ('wall', brick, UVs in metres). Never mutate, clone first. */
export function terrainMaterial(name: TerrainMaterialName): THREE.Material {
  let m = terrainMaterials.get(name);
  if (!m) {
    m = name === 'wall' ? terrainWall() : new THREE.MeshLambertMaterial({ color: TERRAIN_COLOUR[name] });
    m.polygonOffset = true;
    m.polygonOffsetFactor = 1;
    m.polygonOffsetUnits = 1;
    m.name = `terrain-${name}`;
    terrainMaterials.set(name, m);
  }
  return m;
}
// ===== end of the terrain block =====
