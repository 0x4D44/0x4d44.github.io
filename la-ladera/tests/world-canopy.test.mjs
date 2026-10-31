// Tree canopies are photographed sprays on assets/textures/foliage_cards.png (4 x 2 cells of 512 px, cell = row * 4 + col): the eucalyptus HANGS by the tip of its twig (top left of cell 0),
// the cypress and the broadleaf almendro GROW from a foot at the bottom of cells 1 and 4. The painted atlas (world/sprites.js) stays as the fallback when the sheet is missing. Every claim below
// is measured against the PIXELS of the sheet (decoded here with zlib), not against the numbers in js/world/cards.js, so a wrong box, anchor or cell order fails.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-canopy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createContext } from '../js/core/ctx.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { broadTree, eucalyptus, cypress } from '../js/world/flora.js';
import MATDEFS from '../js/world/matdefs.js';
import { TILE } from '../js/world/sprites.js';

const C = await import('../js/world/cards.js').catch((e) => { if (e.code === 'ERR_MODULE_NOT_FOUND') return null; throw e; });
const MANIFEST = JSON.parse(readFileSync(new URL('../assets/textures/manifest.json', import.meta.url), 'utf8'));
const SHEET = MANIFEST.textures.foliage_cards;
const A = createContext({ seed: 20261029, headless: true });
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

// ---------------------------------------------------------------------------------------------------- the sheet, decoded
/** 8-bit RGBA PNG, no interlace (what the texture pipeline writes): { w, h, px } with px a Uint8Array of RGBA rows. */
function readPng(url) {
  const f = readFileSync(url), idat = [];
  let o = 8, w = 0, h = 0;
  while (o < f.length) {
    const len = f.readUInt32BE(o), type = f.toString('latin1', o + 4, o + 8);
    if (type === 'IHDR') { w = f.readUInt32BE(o + 8); h = f.readUInt32BE(o + 12); assert.deepEqual([f[o + 16], f[o + 17], f[o + 20]], [8, 6, 0], 'the sheet is an 8-bit RGBA PNG without interlace'); }
    if (type === 'IDAT') idat.push(f.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * 4, px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[dst + x - 4] : 0, up = y ? px[dst - stride + x] : 0, c = x >= 4 && y ? px[dst - stride + x - 4] : 0;
      let v = raw[src + x];
      if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += (a + up) >> 1;
      else if (ft === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[dst + x] = v & 255;
    }
  }
  return { w, h, px };
}
const PNG = readPng(new URL('../assets/textures/foliage_cards.png', import.meta.url));

/** The art of cell `i` as the pixels have it: the alpha > 0.5 bounding box, the mean x of its top 6 rows (a hanging spray's twig tip) and of its bottom 6 rows (a growing sprig's foot). */
function measure(i) {
  const cx = (i % 4) * 512, cy = Math.floor(i / 4) * 512, alpha = (x, y) => PNG.px[((cy + y) * PNG.w + cx + x) * 4 + 3];
  let x0 = 512, x1 = -1, y0 = 512, y1 = -1;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) if (alpha(x, y) > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const meanX = (ya, yb) => { let s = 0, n = 0; for (let y = ya; y <= yb; y++) for (let x = 0; x < 512; x++) if (alpha(x, y) > 128) { s += x; n++; } return s / n; };
  return { x0, x1, y0, y1, tip: [meanX(y0, y0 + 5), y0], foot: [meanX(y1 - 5, y1), y1] };
}
const ART = { 0: measure(0), 1: measure(1), 4: measure(4) };
/** the uv rect of a whole cell, from first principles */
const rect = (i) => [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 2, (i % 4 + 1) / 4, 1 - Math.floor(i / 4) / 2];

// ---------------------------------------------------------------------------------------------------- reading cards back out of a builder
const sub = (p, q) => p.map((x, k) => x - q[k]), add = (p, q) => p.map((x, k) => x + q[k]), mul = (p, s) => p.map((x) => x * s), len = (p) => Math.hypot(...p), dot = (p, q) => p.reduce((s, x, k) => s + x * q[k], 0);
const nrm = (p) => mul(p, 1 / len(p));
/** Every card of a material, as card() wrote it: 4 vertices bl, br, tr, tl, each with its uv. */
function cardsOf(b, mat) {
  const acc = b.accs.get(mat), out = [];
  if (!acc) return out;
  for (let k = 0; k < acc.pos.length / 12; k++) {
    const P = (j) => [0, 1, 2].map((a) => acc.pos[12 * k + 3 * j + a]), U = (j) => [acc.uv[8 * k + 2 * j], acc.uv[8 * k + 2 * j + 1]];
    const c = { bl: P(0), br: P(1), tr: P(2), tl: P(3), uv: [U(0), U(1), U(2), U(3)] };
    c.height = len(sub(c.tl, c.bl)); c.width = len(sub(c.br, c.bl)); c.up = nrm(sub(c.tl, c.bl)); c.right = nrm(sub(c.br, c.bl));
    c.mid = mul(add(add(c.bl, c.br), add(c.tr, c.tl)), 0.25); c.mirrored = c.uv[0][0] > c.uv[1][0];
    out.push(c);
  }
  return out;
}
/** Where a point of the sheet (cell `i`, pixel `px` from the cell's top left) lies in the world on card `c`, found through the card's own uvs (so a mirrored card works). */
function texel(c, i, px) {
  const u = ((i % 4) * 512 + px[0]) / 2048, v = 1 - (Math.floor(i / 4) * 512 + px[1]) / 1024;
  const s = (u - c.uv[0][0]) / (c.uv[1][0] - c.uv[0][0]), t = (v - c.uv[0][1]) / (c.uv[3][1] - c.uv[0][1]);
  return add(c.bl, add(mul(sub(c.br, c.bl), s), mul(sub(c.tl, c.bl), t)));
}
const inRect = (c, r) => c.uv.every(([u, v]) => u >= r[0] - 1e-9 && u <= r[2] + 1e-9 && v >= r[1] - 1e-9 && v <= r[3] + 1e-9);

/** One tree on its own into a MeshBuilder, with or without the sheet. */
function grow(tree, salt, o = {}, leafCards = true) {
  const b = new MeshBuilder(), K = { b: () => b, H: () => 0, post() {}, occ: { take() {} }, atlas: null, leafCards };
  tree(K, 0, 0, { rng: A.rng.fork('canopy-test:' + salt), ...o });
  return b;
}
const same = (p, q) => p.length === q.length && p.every((x, k) => x === q[k]);

// ---------------------------------------------------------------------------------------------------- the material and the sheet
test('foliage_cards is a material def on the sheet: unit uvs, a 0.5 cut-out, two-sided, and no brief for the texture factory', () => {
  const d = MATDEFS.foliage_cards;
  assert.ok(d, 'world/matdefs.js defines foliage_cards');
  assert.equal(d.tex, 'foliage_cards', 'it wears the sheet by name');
  assert.equal(d.uv, 'unit', 'unit uvs: the sheet is clamped, never repeated');
  assert.equal(d.alphaTest, 0.5, 'the cut-out threshold');
  assert.equal(d.side, 'double', 'a leaf is seen from both sides');
  assert.equal(d.desc, undefined, 'no desc: the texture factory must not paint over the sheet');
});

test('the sheet is 2048 x 1024 with its cells in the documented order, and the PNG is on disk', () => {
  assert.ok(SHEET, 'manifest.json lists foliage_cards');
  assert.deepEqual([SHEET.w, SHEET.h, SHEET.alpha], [2048, 1024, true]);
  assert.ok(existsSync(new URL('../assets/textures/' + SHEET.map, import.meta.url)), `${SHEET.map} exists`);
  assert.deepEqual([PNG.w, PNG.h], [2048, 1024], 'the pixels are the size the manifest says');
  assert.match(SHEET.cells[0], /eucalypt/); assert.match(SHEET.cells[1], /cypress/); assert.match(SHEET.cells[4], /broadleaf/);
  assert.ok(C, 'js/world/cards.js exists');
  assert.deepEqual(C.CELL_NAMES, SHEET.cells, 'cards.js lists the cells as the manifest does');
  assert.deepEqual([C.CELL.EUCA, C.CELL.CYPRESS, C.CELL.BROADLEAF], [0, 1, 4]);
});

test('cards.js knows the art: cell uvs, the cut-out boxes and the pins (twig tip, stem feet) agree with the pixels of the sheet', () => {
  assert.ok(C, 'js/world/cards.js exists');
  for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) assert.ok(Math.abs(C.cellUV(i)[k] - rect(i)[k]) < 1e-12, `cell ${i} uv[${k}]`);
  for (const [i, kind] of [[0, 'tip'], [1, 'foot'], [4, 'foot']]) {
    const m = ART[i], { box, pin, hangs } = C.ART[i];
    assert.equal(hangs, kind === 'tip', `cell ${i}: ${kind === 'tip' ? 'hangs by its tip' : 'grows from its foot'}`);
    for (const [name, have, want, lo] of [['left', box[0], m.x0, true], ['top', box[1], m.y0, true], ['right', box[2] - 1, m.x1, false], ['bottom', box[3] - 1, m.y1, false]]) {
      const rim = lo ? want - have : have - want;
      assert.ok(rim >= 1 && rim <= 8, `cell ${i}: the box's ${name} edge is ${rim} px outside the art (1..8: the whole cut-out, no wasted margin)`);
    }
    const want = m[kind];
    assert.ok(Math.abs(pin[0] - want[0]) <= 3 && Math.abs(pin[1] - want[1]) <= 3, `cell ${i}: the pin ${pin} is the ${kind} of the art, ${want.map((x) => x.toFixed(0))}`);
  }
});

test('hasSheet: true for the shipped manifest; false when the sheet is missing, unlisted, or its cells are in another order', () => {
  assert.ok(C, 'js/world/cards.js exists');
  const ctxOf = (t) => ({ matlib: { manifest: t === undefined ? {} : { foliage_cards: t } } });
  assert.equal(C.hasSheet(ctxOf(SHEET)), true);
  assert.equal(C.hasSheet(ctxOf(undefined)), false, 'no foliage_cards in the manifest');
  assert.equal(C.hasSheet({}), false, 'no material library');
  assert.equal(C.hasSheet(null), false);
  assert.equal(C.hasSheet(ctxOf({ ...SHEET, map: undefined })), false, 'no image');
  assert.equal(C.hasSheet(ctxOf({ ...SHEET, cells: undefined })), false, 'no cell list: the order cannot be trusted');
  const swapped = SHEET.cells.slice(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.equal(C.hasSheet(ctxOf({ ...SHEET, cells: swapped })), false, 'eucalyptus and cypress swapped');
  const moved = SHEET.cells.slice(); [moved[4], moved[6]] = [moved[6], moved[4]];
  assert.equal(C.hasSheet(ctxOf({ ...SHEET, cells: moved })), false, 'the broadleaf moved');
});

test('sprig: the pin of the art lands on the point it is given (upright or mirrored), the card is cut to the art, and a squash narrows it', () => {
  assert.ok(C, 'js/world/cards.js exists');
  for (const cell of [0, 1, 4]) for (const mirror of [false, true]) for (const squash of [1, 0.7]) {
    const b = new MeshBuilder(), at = [3, 5, -2], up = nrm([0.1, 1, 0.2]), right = nrm([1, 0, -0.1]);
    C.sprig(b, 'm', cell, at, up, right, 2, [1, 1, 1], [0, 1, 0], { mirror, squash });
    const [c] = cardsOf(b, 'm'), m = ART[cell], pin = cell === 0 ? m.tip : m.foot, label = `cell ${cell}${mirror ? ' mirrored' : ''} squash ${squash}`;
    assert.ok(len(sub(texel(c, cell, pin), at)) < 0.01, `${label}: the ${cell === 0 ? 'twig tip' : 'foot'} is on the point (off by ${len(sub(texel(c, cell, pin), at)).toFixed(3)} m)`);
    assert.ok(Math.abs(c.height - 2) < 1e-9 && dot(c.up, up) > 0.999999 && dot(c.right, right) > 0.999999, `${label}: height and axes as given`);
    const want = (m.x1 - m.x0 + 1 + 6) / (m.y1 - m.y0 + 1 + 6) * squash;
    assert.ok(Math.abs(c.width / c.height / want - 1) < 0.03, `${label}: the card is the art's box wide (${(c.width / c.height).toFixed(3)} of its height, want ${want.toFixed(3)})`);
    assert.equal(c.mirrored, mirror, `${label}: mirror flips the uvs`);
    assert.ok(inRect(c, rect(cell)), `${label}: the card samples only its own cell`);
    for (const [px, py] of [[m.x0, m.y0], [m.x1, m.y1]]) {                       // the whole cut-out lies on the card
      const u = ((cell % 4) * 512 + px) / 2048, v = 1 - (Math.floor(cell / 4) * 512 + py) / 1024;
      const s = (u - c.uv[0][0]) / (c.uv[1][0] - c.uv[0][0]), t = (v - c.uv[0][1]) / (c.uv[3][1] - c.uv[0][1]);
      assert.ok(s > 0 && s < 1 && t > 0 && t < 1, `${label}: the art corner (${px}, ${py}) is on the card`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------- the three canopies
test('eucalyptus: sprays hang by their twig tips from the crown, the leaves droop below, and nothing of the painted canopy is left', () => {
  assert.ok(C, 'js/world/cards.js exists');
  let mirrored = 0, total = 0;
  for (const seed of SEEDS) {
    const b = grow(eucalyptus, 'euca' + seed, { h: 14 }), cs = cardsOf(b, 'foliage_cards'), yaws = [];
    assert.ok(cs.length >= 20 && cs.length <= 34, `seed ${seed}: ${cs.length} sprays (a crown of them, no more cards than the 34 it replaces)`);
    assert.equal(b.accs.has('foliage'), false, `seed ${seed}: no painted-atlas canopy as well`);
    for (const c of cs) {
      assert.ok(inRect(c, rect(0)), `seed ${seed}: a eucalyptus card samples cell 0 only`);
      const tip = texel(c, 0, ART[0].tip), hang = (tip[1] - c.mid[1]) / c.height;
      assert.ok(hang > 0.4, `seed ${seed}: the twig tip is at the TOP of its card, the spray hangs from it (tip is ${hang.toFixed(2)} of a card height above the middle, want > 0.4)`);
      assert.ok(c.up[1] > 0.86, `seed ${seed}: the spray hangs plumb, within 30 degrees (up.y ${c.up[1].toFixed(2)})`);
      assert.ok(tip[1] > 0.55 * 14 && tip[1] < 14 + 3.5, `seed ${seed}: the tips are in the crown, not on the trunk or in the sky (y ${tip[1].toFixed(1)} of a 14 m tree)`);
      assert.ok(Math.hypot(tip[0], tip[2]) < 5.5, `seed ${seed}: the tips are within 5.5 m of the trunk (${Math.hypot(tip[0], tip[2]).toFixed(1)})`);
      assert.ok(c.height > 1.4 && c.height < 4, `seed ${seed}: a spray is ${c.height.toFixed(1)} m tall (1.4..4)`);
      yaws.push(Math.atan2(c.right[2], c.right[0]));
      total++; if (c.mirrored) mirrored++;
    }
    const spread = yaws.map((a) => Math.abs(Math.sin(2 * a))).reduce((s, v) => s + v, 0) / yaws.length;
    assert.ok(spread > 0.25, `seed ${seed}: the sprays face every way, not one (mean |sin 2 yaw| ${spread.toFixed(2)})`);
  }
  assert.ok(mirrored / total > 0.25 && mirrored / total < 0.75, `about half the sprays are mirrored (${mirrored} of ${total})`);
});

test('broadleaf: branches grow outward from inside the crown on the broadleaf cell, as many as the painted crown had', () => {
  assert.ok(C, 'js/world/cards.js exists');
  for (const cards of [24, 30]) for (const seed of SEEDS) {
    const h = 7, cr = 3, b = grow(broadTree, `broad${cards}-${seed}`, { h, crown: cr, cards }), cs = cardsOf(b, 'foliage_cards');
    const ctr = [0, h * 0.78, 0], rad = [cr, cr * 0.62, cr * 0.92], ell = (p) => Math.hypot(...p.map((x, k) => (x - ctr[k]) / rad[k]));   // 1 = on the crown's ellipsoid
    assert.equal(cs.length, cards, `seed ${seed}: ${cs.length} branch cards, want ${cards}`);
    assert.equal(b.accs.has('foliage'), false, `seed ${seed}: no painted-atlas canopy as well`);
    let outward = 0;
    for (const c of cs) {
      assert.ok(inRect(c, rect(4)), `seed ${seed}: a broadleaf card samples cell 4 only`);
      const foot = texel(c, 4, ART[4].foot), f = ell(foot);
      assert.ok(f < 0.85, `seed ${seed}: the foot of a branch is inside the crown (${f.toFixed(2)} of its radius, want < 0.85)`);
      const d = nrm(sub(foot, ctr).map((x, k) => x / rad[k]));
      if (dot(c.up, d) > 0.3) outward++;
      assert.ok(c.height > 1.2 && c.height < 5, `seed ${seed}: a branch is ${c.height.toFixed(1)} m tall (1.2..5)`);
      for (const p of [c.tl, c.tr]) assert.ok(len(sub(p, ctr)) < 1.7 * cr, `seed ${seed}: the tip of a branch stays near the crown (${(len(sub(p, ctr)) / cr).toFixed(2)} crown radii from its middle, want < 1.7)`);
    }
    assert.ok(outward / cs.length > 0.9, `seed ${seed}: ${outward} of ${cs.length} branches point out of the crown (want > 90%)`);
  }
});

test('a broadleaf asked for a tile of its own (a flowering tree) keeps the painted atlas card, sheet or no sheet', () => {
  const b = grow(broadTree, 'tile', { tile: TILE.FLOWERING }, true);
  assert.equal(b.accs.has('foliage_cards'), false, 'no card of the sheet on a tree that named its own tile');
  assert.equal(cardsOf(b, 'foliage').length, 24, 'the painted crown, as before');
});

test('a broadleaf with a leaf green of its own (the hillside trees) wears it as a tint on the sheet: same boughs, colour in proportion to its green', () => {
  const usual = [0x6f, 0x9a, 0x44], paler = [0x7f, 0xa8, 0x4a], darker = [0x5f, 0x8f, 0x3b], hex = (c) => (c[0] << 16) | (c[1] << 8) | c[2], rgb = (c) => c.map((x) => x / 255);
  const colours = (leaf) => { const b = grow(broadTree, 'tint', leaf ? { leaf: rgb(leaf) } : {}, true), a = b.accs.get('foliage_cards'); return { pos: a.pos, col: a.col }; };
  const base = colours(null);
  for (const leaf of [paler, darker]) {
    const t = colours(leaf);
    assert.ok(same(t.pos, base.pos), `${hex(leaf).toString(16)}: the same boughs in the same places`);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(t.col[k] / base.col[k] / (leaf[k] / usual[k]) - 1) < 1e-6, `${hex(leaf).toString(16)}: channel ${k} follows the leaf green`);
  }
});

test('cypress: three crossed plumes standing on the ground, slim, on the cypress cell', () => {
  assert.ok(C, 'js/world/cards.js exists');
  for (const seed of SEEDS) {
    const h = 8, b = grow(cypress, 'cypress' + seed, { h }), cs = cardsOf(b, 'foliage_cards');
    assert.equal(cs.length, 3, `seed ${seed}: three cards`);
    assert.equal(b.accs.has('foliage_low'), false, `seed ${seed}: no painted-atlas canopy as well`);
    const angles = [];
    for (const c of cs) {
      assert.ok(inRect(c, rect(1)), `seed ${seed}: a cypress card samples cell 1 only`);
      const foot = texel(c, 1, ART[1].foot);
      assert.ok(Math.hypot(foot[0], foot[2]) < 0.02 && Math.abs(foot[1] + 0.1) < 0.02, `seed ${seed}: the foot of the plume is on the trunk, just under the ground (${foot.map((x) => x.toFixed(2))})`);
      assert.ok(Math.abs(c.height - h) < 1e-6 && c.up[1] > 0.9999, `seed ${seed}: it stands ${h} m tall and plumb`);
      assert.ok(c.width / c.height > 0.35 && c.width / c.height < 0.55, `seed ${seed}: a cypress is slim (${(c.width / c.height).toFixed(2)} wide per tall, want 0.35..0.55)`);
      angles.push(((Math.atan2(c.right[2], c.right[0]) % Math.PI) + Math.PI) % Math.PI);        // a card looks the same turned half a circle
    }
    angles.sort((p, q) => p - q);
    const gaps = [angles[1] - angles[0], angles[2] - angles[1], angles[0] + Math.PI - angles[2]];
    for (const g of gaps) assert.ok(Math.abs(g - Math.PI / 3) < 0.05, `seed ${seed}: the three cards cross at 60 degrees (gaps ${gaps.map((x) => x.toFixed(2))})`);
  }
});

// ---------------------------------------------------------------------------------------------------- what must not change
test('cards cost no more triangles than the painted canopies they replace; the trunks and limbs are the same bytes', () => {
  assert.ok(C, 'js/world/cards.js exists');
  const trees = [['eucalyptus', eucalyptus, {}, ['bark_euca']], ['broadleaf', broadTree, {}, ['bark_trunk']], ['broadleaf in a plaza', broadTree, { cards: 30, crown: 3.6 }, ['bark_trunk']], ['cypress', cypress, {}, ['bark_trunk']]];
  for (const [name, tree, o, barks] of trees) for (const seed of SEEDS) {
    const on = grow(tree, name + seed, o, true), off = grow(tree, name + seed, o, false);
    assert.ok(on.tris > 0 && on.tris <= off.tris, `${name} ${seed}: ${on.tris} triangles with the sheet, ${off.tris} without (no net rise)`);
    assert.ok(cardsOf(on, 'foliage_cards').length > 0, `${name} ${seed}: and the sheet is in use`);
    for (const m of barks) assert.ok(on.accs.has(m) && same(on.accs.get(m).pos, off.accs.get(m).pos) && same(on.accs.get(m).uv, off.accs.get(m).uv), `${name} ${seed}: the ${m} geometry is untouched`);
  }
});

test('without the sheet the canopies are the painted atlas, exactly as before', () => {
  for (const [name, tree, o, mat, cards] of [['eucalyptus', eucalyptus, {}, 'foliage', 34], ['broadleaf', broadTree, {}, 'foliage', 24], ['broadleaf in a plaza', broadTree, { cards: 30 }, 'foliage', 30], ['cypress', cypress, {}, 'foliage_low', 3]]) {
    const b = grow(tree, name, o, false);
    assert.equal(b.accs.has('foliage_cards'), false, `${name}: no card of the sheet`);
    assert.equal(cardsOf(b, mat).length, cards, `${name}: ${cards} painted cards on ${mat}`);
  }
  const bare = new MeshBuilder();                                                                 // a kit that never heard of the sheet (the older tests') is the painted atlas too
  eucalyptus({ b: () => bare, H: () => 0, post() {}, occ: { take() {} }, atlas: null }, 0, 0, { rng: A.rng.fork('canopy-test:bare'), h: 14 });
  assert.equal(bare.accs.has('foliage_cards'), false);
  assert.equal(cardsOf(bare, 'foliage').length, 34);
});

// ---------------------------------------------------------------------------------------------------- the whole world
async function world(withSheet) {
  const ctx = createContext({ seed: 20261029, headless: true });
  if (withSheet) { ctx.matlib.manifest = { foliage_cards: SHEET }; ctx.matlib.loader = { load: () => new ctx.THREE.Texture() }; }   // no image loader under node: an empty texture stands in
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  await buildWorld(ctx);
  await buildProps(ctx);
  ctx.batch.flushAll();
  return ctx;
}
/** triangles per material key over the whole scene, and the uv range of the sheet's meshes */
function census(ctx) {
  const tris = {}, uvs = { n: 0, outside: 0 };
  const cells = [0, 1, 4].map(rect), ok = (u, v) => cells.some((r) => u >= r[0] - 1e-6 && u <= r[2] + 1e-6 && v >= r[1] - 1e-6 && v <= r[3] + 1e-6);
  ctx.scene.traverse((o) => {
    if (!o.isMesh) return;
    const k = o.material.name, n = (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
    tris[k] = (tris[k] ?? 0) + n;
    if (k === 'foliage_cards') { const uv = o.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) { uvs.n++; if (!ok(uv.getX(i), uv.getY(i))) uvs.outside++; } }
  });
  return { tris, uvs };
}

test('the built world: with the sheet the trees wear it and the world is otherwise the same; without it nothing changes', async () => {
  assert.ok(C, 'js/world/cards.js exists');
  const on = await world(true), off = await world(false), a = census(on), z = census(off);
  assert.deepEqual(on.errors, [], 'no build error with the sheet');
  assert.deepEqual(off.errors, [], 'no build error without it');
  assert.ok((a.tris.foliage_cards ?? 0) > 1000, `the sheet has cards in the world (${a.tris.foliage_cards ?? 0} triangles)`);
  assert.equal(on.mat('foliage_cards').alphaToCoverage, true, 'the sheet\'s cut-out is also coverage (anti-aliased under MSAA)');
  assert.equal(z.tris.foliage_cards ?? 0, 0, 'no sheet, no sheet cards');
  assert.equal(a.uvs.outside, 0, `the sheet's cards sample only cells 0, 1 and 4 (${a.uvs.outside} of ${a.uvs.n} vertices outside)`);
  assert.deepEqual(on.world.flora, off.world.flora, 'the same trees in the same places (species counts)');
  assert.deepEqual(on.physics.stats(), off.physics.stats(), 'and the same trunks to walk into');
  const canopy = (t) => (t.foliage ?? 0) + (t.foliage_low ?? 0) + (t.foliage_cards ?? 0);
  assert.ok(canopy(a.tris) <= canopy(z.tris), `no net triangles: ${canopy(a.tris)} with the sheet, ${canopy(z.tris)} without`);
  assert.ok((a.tris.foliage ?? 0) < (z.tris.foliage ?? 0) && (a.tris.foliage_low ?? 0) < (z.tris.foliage_low ?? 0), 'the painted cards of the three species are gone (palms, shrubs, bananas keep theirs)');
  for (const k of Object.keys(z.tris)) if (!k.startsWith('foliage')) assert.equal(a.tris[k], z.tris[k], `${k}: untouched`);
});
