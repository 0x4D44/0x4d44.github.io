// The canopy sprites: assets/textures/foliage_cards.png, a 2048 x 1024 RGBA sheet of 4 x 2 cells of 512 px (cell index = row * 4 + col, row 0 on top), each a photographed spray cut out on a
// transparent ground (tools/textures/veg.mjs). The matdef `foliage_cards` (world/matdefs.js) binds the whole sheet with unit uvs; this file knows where each spray sits in its cell and stands
// a card on it. flora.js uses three of the cells for tree crowns (eucalyptus, cypress, broadleaf almendro) and keeps its painted atlas (world/sprites.js) as the fallback when the sheet is missing.
import { card, V } from './mk.js';

export const MAT = 'foliage_cards';
export const SHEET = { w: 2048, h: 1024, cols: 4, rows: 2, cell: 512 };
/** The cell of each sprite, in the order the manifest lists them (manifest.foliage_cards.cells). */
export const CELL = { EUCA: 0, CYPRESS: 1, BANANA: 2, AGAVE: 3, BROADLEAF: 4, BOUGAIN: 5, FLOWERBED: 6, TUFT: 7 };
export const CELL_NAMES = ['eucalyptus', 'cypress', 'banana leaf', 'agave', 'broadleaf almendro', 'bougainvillea', 'flower bed', 'wildflower tuft'];

/** uv rect [u0, v0, u1, v1] of the pixel box [x0, y0, x1, y1] of cell `i` (px from the cell's top-left, y down; the whole cell by default). The image is flipped on upload, so v runs up. */
export function cellUV(i, box = [0, 0, SHEET.cell, SHEET.cell]) {
  const x = (i % SHEET.cols) * SHEET.cell, y = Math.floor(i / SHEET.cols) * SHEET.cell;
  return [(x + box[0]) / SHEET.w, 1 - (y + box[3]) / SHEET.h, (x + box[2]) / SHEET.w, 1 - (y + box[1]) / SHEET.h];
}

/**
 * Where the art sits in its cell (px from the cell's top-left, y down). `box` = the cut-out's bounding box (alpha > 0.5) plus a 3 px rim for the filter: a card is cut to it, so the
 * transparent margin of the cell is never drawn. `pin` = the point of the art that lands on the crown: the eucalyptus hangs by the tip of its twig (top left of its cell, the leaves
 * droop below it), the cypress and the broadleaf branch grow from their foot (bottom of the cell; the broadleaf's stem starts left of centre and leans right).
 */
export const ART = {
  [CELL.EUCA]: { box: [79, 7, 433, 509], pin: [149, 10], hangs: true },
  [CELL.CYPRESS]: { box: [96, 7, 416, 509], pin: [258, 505], hangs: false },
  [CELL.BROADLEAF]: { box: [67, 7, 444, 509], pin: [167, 505], hangs: false },
};

/**
 * Whether the sheet is there and in the order this file assumes: the manifest names it (the texture pipeline ran) and its cell list puts the eucalyptus, the cypress and the
 * broadleaf where ART expects them. A sheet re-cut in another order falls back to the painted atlas rather than hang a flower bed in a eucalyptus.
 */
export function hasSheet(ctx) {
  const t = ctx?.matlib?.manifest?.foliage_cards, cells = t?.cells;
  return !!(t?.map && Array.isArray(cells) && /eucalypt/i.test(cells[CELL.EUCA]) && /cypress/i.test(cells[CELL.CYPRESS]) && /broadleaf|almendro/i.test(cells[CELL.BROADLEAF]));
}

/**
 * One card of `cell`'s spray, its pin on `at`. `up` is the unit vector from the foot of the art to its top, `right` the unit vector across it; `height` is the metres the art box is tall.
 * o: { mirror: flip the spray left to right, squash: width factor (the art keeps its height) }. Returns nothing: the card goes into the builder `b` (material `mat`).
 */
export function sprig(b, mat, cell, at, up, right, height, col, n, o = {}) {
  const { box, pin } = ART[cell], bw = box[2] - box[0], bh = box[3] - box[1], w = height * (bw / bh) * (o.squash ?? 1);
  let fx = (pin[0] - box[0]) / bw, uv = cellUV(cell, box);                 // fx: the pin's place across the box, from its left edge
  const fy = (pin[1] - box[1]) / bh;                                       // fy: and down it, from its top
  if (o.mirror) { uv = [uv[2], uv[1], uv[0], uv[3]]; fx = 1 - fx; }
  const foot = V.sub(V.sub(at, V.mul(right, (fx - 0.5) * w)), V.mul(up, (1 - fy) * height));   // the bottom centre of the card, which is where card() anchors it
  card(b, mat, foot, right, up, w, height, uv, col, n);
}
