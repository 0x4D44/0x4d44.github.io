// INTERIORS shop goods: the shelves, counters, crates and stands of the shops hold stock made of the goods library's 58 little models (assets/models/goods, js/interiors/goods*.js) instead of
// the boxes and balls the furniture drew. Held to: the goods are hidden catalogue entries (the furniture pipeline never sees them), they load apart from the furniture and a missing file
// or atlas leaves every shop as it was, only rooms fitted as shops are stocked and only on the pieces the assortment names, every article stands inside its piece, clear of what lies on
// the piece and of everything else in the room, and ON the geometry the page really draws for the piece (the model, or the carcass stand-in of a piece that opens: measured, not assumed),
// a stocked piece is drawn WITHOUT the stock baked into its model or its stand-in (no duplicates), a piece drawn some other way keeps its own stock, one missing article leaves its
// piece untouched (never half-stocked), and the planning changes nothing else (layout, containers, colliders).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-goods.test.mjs
//   A3_LIST=40 shows more of a failing list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { furnishedBatch, obbOf, penetration } from './interiors-lib.mjs';
import { CATALOG } from '../js/interiors/catalog.js';
import { layoutOf } from '../js/interiors/carcass.js';
import { GOODS_CATALOG } from '../js/interiors/goods-catalog.js';
import { GOODS_FIXTURES, GOODS_ASSORTMENTS } from '../js/interiors/goods-assortments.js';
import { planShopGoods, planGoodsForFixture } from '../js/interiors/goods.js';
import { loadGoodsAssets } from '../js/interiors/goods-render.js';
import { buildInterior, loadInteriorAssets, glbParts } from '../js/interiors/build.js';
import { loadInteriorAssets as pageLoad } from '../js/interiors/index.js';
import { drawStandin } from '../js/interiors/standins.js';
import { MeshBuilder } from '../js/core/mesh.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(ROOT, 'assets', 'models');
const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const KEYS = Object.keys(GOODS_CATALOG);
const INTERIOR_CAP = 100000;                                                                     // the brief's cap on one interior's triangles (tests/interiors-garments.test.mjs)

const real = await furnishedBatch({ real: true });
const { ctx, bps } = real;
const shops = bps.filter((b) => b.goods?.length);

// ---------------------------------------------------------------- loading the models the way the page does
const gltfs = new GLTFLoader();
const stub = new Map();
ctx.mat = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
const requested = [];                                                                            // every file the last boot() asked the asset loader for
/** `steps`: 'furniture' (build.js), 'goods' (goods-render.js), 'page' (index.js's own entry: the furniture's, the clothes', the inspect things' and the goods' loads). `goodsFiles: false` answers the goods file with a 404. */
async function boot({ steps = ['furniture', 'goods'], goodsFiles = true } = {}) {
  ctx.assets.entries.clear(); ctx.assets.loaded.clear(); requested.length = 0;
  ctx.interiorGlb = ctx.garmentGlb = ctx.goodsAssets = undefined;                                // a context nothing has loaded into yet
  await ctx.assets.init((p) => JSON.parse(readFileSync(join(MODELS, p), 'utf8')));
  ctx.assets.load = (path) => new Promise((ok, no) => {
    requested.push(path);
    if (!goodsFiles && path.startsWith('goods/')) return no(new Error('404 ' + path));          // the file is not there: what the page's fetch would say
    const b = readFileSync(join(MODELS, path));
    gltfs.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', (g) => { g.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, g); ok(g); }, no);
  });
  const before = (ctx.errors ?? []).length, warn = console.warn;
  console.warn = () => {};                                                                       // (assets.preload logs each file it could not load)
  const loads = { furniture: loadInteriorAssets, goods: loadGoodsAssets, page: pageLoad };
  try { for (const s of steps) await loads[s](ctx); } finally { console.warn = warn; }
  // Node has no image decoder: the label atlas is checked in the browser (tests/interiors-page.test.mjs, tests/goods-shots.mjs). Here it counts as decoded when the models are there.
  if (ctx.goodsAssets?.keys?.length) ctx.goodsAssets.atlasReady = true;
  return (ctx.errors ?? []).slice(before);
}
const trisOf = (id) => (ctx.batch.groups.get(id)?.meshes ?? []).reduce((n, m) => n + m.geometry.index.count / 3, 0);
const geoTris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const drop = (id) => { const g = ctx.batch.groups.get(id); if (!g) return; g.obj.traverse((m) => { if (m.isMesh) m.geometry?.dispose?.(); }); g.obj.removeFromParent?.(); ctx.batch.groups.delete(id); };     // (a hundred big interiors would stay in memory)
let seq = 0;
/** Build a building's interior as it is (a copy under a fresh id: a batch group keeps every mesh ever built into it). */
function built(bp) {
  const copy = { ...bp, id: `${bp.id}-g${seq++}` };
  buildInterior(ctx, copy);
  const group = ctx.batch.groups.get(`${copy.id}.int`);
  return { id: copy.id, st: { ...bp.interior.stats }, own: trisOf(`${copy.id}.int`), lods: group.obj.children.filter((o) => o.isLOD) };
}
const stockTris = (name) => glbParts(ctx, name).filter((p) => p.stock).reduce((n, p) => n + geoTris(p.geometry), 0);
const byParentName = (bp, g) => bp.furniture.find((f) => f.id === g.parent).name;

// ---------------------------------------------------------------- the catalogue
test('the goods are hidden catalogue entries: not among the keys or the hash the furniture pipeline reads, sized as their models, and a shelf keeps its own `goods` stock type', () => {
  const keys = Object.keys(CATALOG), man = JSON.parse(readFileSync(join(MODELS, 'manifest.furniture.json'), 'utf8'));
  assert.equal(createHash('sha256').update(JSON.stringify(CATALOG)).digest('hex'), man.generator.catalogSha256, 'the catalogue the furniture pipeline hashes is not the one its models were made from: something the goods add shows in Object.keys or JSON.stringify');
  const gm = JSON.parse(readFileSync(join(MODELS, 'manifest.goods.json'), 'utf8')), assets = gm.files.flatMap((f) => Object.entries(f.assets));
  assert.equal(assets.length, KEYS.length, `${assets.length} assets in the goods manifest, ${KEYS.length} keys in the data module`);
  const problems = [];
  for (const [key, a] of assets) {
    const c = CATALOG[key];
    if (!c) { problems.push(`${key}: not reachable as CATALOG[key]`); continue; }
    if (keys.includes(key)) problems.push(`${key}: enumerable (the furniture pipeline would ask for a furniture model for it)`);
    if (c.ware !== true || c.garment || c.block !== false || c.mat !== 'goods_surface') problems.push(`${key}: flags ware ${c.ware} garment ${c.garment} block ${c.block} mat ${c.mat}`);
    if (c.size.some((v, i) => Math.abs(v - a.size[i]) > 1e-9)) problems.push(`${key}: catalogue size ${c.size}, the manifest's ${a.size}`);
  }
  report(problems, 'catalogue problems');
  assert.ok(!keys.some((k) => CATALOG[k].ware), 'a goods piece among the keys');
  assert.equal(CATALOG.shelf_tienda.goods, 'tienda', 'the stock type of a shelf piece (the stand-in\'s) was overwritten: the goods marker must not be `goods`');
});

// ---------------------------------------------------------------- what is baked into the models
// What is left of a model once the stock parts are out: its structure. A model rebuilt with other part numbers or new baked stock shows here, and its author decides which part is stock.
const REST = {
  shelf_tienda: 'wood_pine,wood_pine', shelf_ferre: 'metal_painted,metal_painted', shelf_pharma: 'wood_painted,wood_painted', shelf_papel: 'wood_pine,wood_pine', shelf_shoes: 'wood_pine,wood_pine',
  shelf_fabric: 'wood_painted,wood_painted', shelf_cafe: 'wood_dark,wood_dark', chips_rack: 'metal_dark,metal_dark', bread_rack: 'metal_steel,metal_painted', rack_fabric: 'wood_pine',
  spinner_rack: 'metal_dark,metal_chrome', parts_shelf: 'metal_painted,metal_painted', bread_case_glass: 'metal_dark,metal_chrome,glass,wood_pine', fridge_meat: 'metal_dark,enamel_white,metal_chrome,glass',
  butcher_block: 'wood_old,wood_pine,wood_dark,metal_steel', dough_table: 'paper,wood_pine,wood_pine', cutting_table: 'wood_pine', cobbler_bench: 'wood_old,metal_dark,metal_chrome,metal_steel,wood_old',
  workbench_metal: 'metal_painted,wood_old,metal_dark,metal_steel,metal_painted', table_cafe_round: 'metal_dark,metal_painted', fruit_stand: 'wood_pine', crate_stack_mango: 'wood_pine',
  crate_stack_lulo: 'wood_pine', crate_stack_tomato: 'wood_pine', crate_stack_veg: 'wood_pine', fruit_crate_small: 'wood_pine',
};
test('the stock baked into a model is named exactly (part number and material), and what is left of each model is its structure; a piece that opens is never drawn from its model', async () => {
  const errors = await boot({ steps: ['furniture'] });
  report(errors.map((e) => e.message), 'errors while loading the furniture');
  const problems = [];
  for (const [name, spec] of Object.entries(GOODS_FIXTURES)) {
    const c = CATALOG[name];
    if (!c) { problems.push(`${name}: not a catalogue piece`); continue; }
    if (layoutOf(c)) { if (spec.stockParts) problems.push(`${name}: opens (drawn by carcass.js, never from its model) but lists stockParts`); continue; }
    if (!ctx.interiorGlb.has(name)) { problems.push(`${name}: no model loaded, and it does not open: nothing would stock it`); continue; }
    const parts = glbParts(ctx, name), listed = Object.keys(spec.stockParts ?? {}).length, got = parts.filter((p) => p.stock).length;
    if (got !== listed) problems.push(`${name}: ${got} parts of the model match stockParts (${JSON.stringify(spec.stockParts)}), ${listed} listed`);
    const rest = parts.filter((p) => !p.stock).map((p) => p.matKey).join(',');
    if (rest !== REST[name]) problems.push(`${name}: what is left of the model is [${rest}], the snapshot says [${REST[name]}]`);
  }
  report(problems, 'baked-stock problems');
  const unlisted = Object.keys(REST).filter((n) => !GOODS_FIXTURES[n] || layoutOf(CATALOG[n]));
  assert.deepEqual(unlisted, [], 'snapshot entries for pieces that are not stocked from a model');
});

// ---------------------------------------------------------------- the loads
test('the loads are apart: the furniture load asks for no goods file and keeps no goods key; the page entry loads the library once, into ctx.goodsAssets; without the file the page still boots and nothing is stocked', async () => {
  const goodsFiles = () => requested.filter((p) => p.startsWith('goods/'));
  report((await boot({ steps: ['furniture'] })).map((e) => e.message), 'errors while loading the furniture');
  assert.deepEqual(goodsFiles(), [], 'the furniture load asked for a goods file');
  assert.equal(ctx.goodsAssets, undefined, 'the furniture load filled ctx.goodsAssets');
  assert.equal(KEYS.filter((k) => ctx.interiorGlb.has(k)).length, 0, 'a goods key in the furniture set');
  report((await boot({ steps: ['page'] })).map((e) => e.message), 'errors while loading the page set');
  assert.deepEqual(goodsFiles(), ['goods/goods.glb'], 'the page entry asks for the one goods file, once');
  assert.deepEqual([ctx.goodsAssets.keys.length, ctx.goodsAssets.missing.length], [KEYS.length, 0], 'every article loads and is usable');
  assert.equal(KEYS.filter((k) => ctx.interiorGlb.has(k)).length, 0, 'the page entry put a goods key in the furniture set');
  assert.ok(ctx.interiorGlb.has('shelf_tienda') && ctx.interiorGlb.size > 20, 'the furniture models should load too');
  report((await boot({ steps: ['page'], goodsFiles: false })).map((e) => e.message), 'errors while loading without the goods file (a missing model is a stand-in, not an error)');
  assert.deepEqual([ctx.goodsAssets.keys.length, ctx.goodsAssets.missing.length, ctx.goodsAssets.atlasReady], [0, KEYS.length, false], 'a goods key loaded although its file is absent');
  assert.ok(ctx.interiorGlb.has('shelf_tienda'), 'the furniture models should still load');
  await boot({ steps: ['page'] });                                                              // a load after a failed one starts from nothing
  assert.equal(ctx.goodsAssets.keys.length, KEYS.length, 'a retry did not load the library');
});

// ---------------------------------------------------------------- the plan, over the real world
test('the plan: stock only in the rooms fitted as shops, on the pieces the assortment names, inside the piece, clear of everything else; the same plan twice; the layout is not touched', () => {
  const problems = [];
  let total = 0, rooms = 0;
  for (const bp of bps) {
    const goods = bp.goods ?? [], byId = new Map(bp.furniture.map((f) => [f.id, f])), ids = new Set(goods.map((g) => g.id));
    const furniture = JSON.stringify(bp.furniture), again = JSON.stringify(goods);
    planShopGoods(bp);
    if (JSON.stringify(bp.furniture) !== furniture) problems.push(`${bp.id}: planning the stock changed the furniture records`);
    if (JSON.stringify(bp.goods) !== again) problems.push(`${bp.id}: planning twice gives two different stocks`);
    if (ids.size !== goods.length) problems.push(`${bp.id}: duplicate goods ids`);
    rooms += new Set(goods.map((g) => g.room)).size;
    for (const [rid, info] of Object.entries(bp.interior.rooms)) {                  // every room fitted as a shop is stocked, whatever the building's own shop type says (a workshop has none: L44)
      if (info.shopType && bp.furniture.some((f) => f.room === rid && GOODS_ASSORTMENTS[info.shopType]?.[f.name]) && !goods.some((g) => g.room === rid)) problems.push(`${bp.id}: room ${rid} is fitted as a ${info.shopType} and holds pieces of its assortment, but has no stock`);
    }
    for (const [i, g] of goods.entries()) {
      total++;
      const f = byId.get(g.parent), info = bp.interior.rooms[g.room];
      if (!f || f.room !== g.room) { problems.push(`${bp.id} ${g.id}: its piece ${g.parent} is not in room ${g.room}`); continue; }
      if (!info?.shopType) { problems.push(`${bp.id} ${g.id}: stock in ${g.room}, a ${info?.type} that was not fitted as a shop`); continue; }
      if (!GOODS_ASSORTMENTS[info.shopType]?.[f.name]?.includes(g.name)) problems.push(`${bp.id} ${g.id}: ${g.name} is not in the ${info.shopType}'s stock of a ${f.name}`);
      if (g.kind !== 'stock' || g.block !== false || !GOODS_CATALOG[g.name] || byId.has(g.id)) problems.push(`${bp.id} ${g.id}: not a plain stock record (${g.kind}, block ${g.block}, ${g.name})`);
      // where it is: the local position inside the piece, the world position that follows from it, and the record's own size the catalogue's
      const [lx, ly, lz] = g.local, a = f.ry ?? 0, cs = Math.cos(a), sn = Math.sin(a), [W, , D] = CATALOG[f.name].size, [sw, sh, sd] = GOODS_CATALOG[g.name].size;
      const turned = Math.abs(g.localRotation) > 1e-9, ew = turned ? sd : sw, ed = turned ? sw : sd;
      if (Math.abs(g.w - ew) > 1e-6 || Math.abs(g.d - ed) > 1e-6 || Math.abs(g.h - sh) > 1e-6) problems.push(`${bp.id} ${g.id}: ${g.w}x${g.h}x${g.d} is not the model's ${sw}x${sh}x${sd}${turned ? ' turned' : ''}`);
      if (Math.abs(g.x - (f.x + lx * cs + lz * sn)) > 2e-5 || Math.abs(g.z - (f.z - lx * sn + lz * cs)) > 2e-5 || Math.abs(g.y - (f.y + ly)) > 2e-5 || Math.abs(g.ry - (a + g.localRotation)) > 1e-9) problems.push(`${bp.id} ${g.id}: the world position is not the local one carried by its piece`);
      if (Math.abs(lx) + g.w / 2 > W / 2 + 1e-6 || Math.abs(lz) + g.d / 2 > D / 2 + 1e-6 || ly < -1e-9) problems.push(`${bp.id} ${g.id}: ${g.name} at local (${lx.toFixed(3)}, ${ly.toFixed(3)}, ${lz.toFixed(3)}) is outside its ${f.name} (${W}x${D})`);
      // clear of the other articles and of every other piece of the room (the till and the telephone on a counter, a chair, a wall shelf)
      const box = obbOf({ x: g.x, z: g.z, w: g.w, d: g.d, ry: a }), y0 = g.y, y1 = g.y + g.h;
      for (const h of goods.slice(i + 1)) {
        if (h.parent !== g.parent || h.y >= y1 - 1e-6 || h.y + h.h <= y0 + 1e-6) continue;
        if (penetration(box, obbOf({ x: h.x, z: h.z, w: h.w, d: h.d, ry: h.ry - h.localRotation })) > 1e-6) problems.push(`${bp.id} ${g.id} and ${h.id} overlap`);
      }
      for (const o of bp.furniture) {
        if (o.id === f.id || o.room !== g.room || o.y >= y1 - 1e-6 || o.y + o.h <= y0 + 1e-6) continue;
        const pen = penetration(box, obbOf(o));
        if (pen > 0.004) problems.push(`${bp.id} ${g.id} (${g.name} on ${f.name}) is ${(pen * 1000).toFixed(0)} mm into ${o.name} ${o.id}`);
      }
    }
  }
  const types = new Set(shops.flatMap((b) => Object.values(b.interior.rooms).map((r) => r.shopType).filter(Boolean)));
  console.log(`# goods: ${total} articles in ${rooms} rooms of ${shops.length} buildings (${types.size} shop types)`);
  report(problems, 'planning problems');
  assert.ok(shops.length >= 20 && total >= 1000, `${shops.length} stocked buildings with ${total} articles: the shops are not stocked`);
  const kinds = new Set(shops.flatMap((b) => b.goods.map((g) => g.name)));
  assert.ok(kinds.size >= 50, `${kinds.size} of the ${KEYS.length} articles in use`);
});

// ---------------------------------------------------------------- the geometry: do the planned articles stand on what the page draws?
/** The local triangles of what the page draws for a piece, its baked stock left out: from the model, or the stand-in of a piece that opens. */
function drawn(name) {
  const c = CATALOG[name], out = [];
  if (!layoutOf(c)) {
    const e = ctx.assets.meta(name), node = ctx.assets.loaded.get(e.glb).scene.getObjectByName(e.node), M = new THREE.Matrix4();
    node.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    node.traverse((o) => {
      if (!o.isMesh) return;
      const bits = o.name.split('-'), flags = bits.slice(1, -1), mat = (Array.isArray(o.material) ? o.material[0] : o.material).name;
      if (!flags.length && GOODS_FIXTURES[name]?.stockParts?.[bits[bits.length - 1]] === mat) return;
      const g = o.geometry.clone().applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld)), p = g.attributes.position, ix = g.index, n = ix ? ix.count : p.count;
      for (let i = 0; i < n; i += 3) {
        const v = [0, 1, 2].map((k) => { const j = ix ? ix.getX(i + k) : i + k; return [p.getX(j), p.getY(j), p.getZ(j)]; });
        out.push({ a: v[0], b: v[1], c: v[2], part: `${o.name}:${mat}` });
      }
    });
    return out;
  }
  const rec = { id: 'scratch', name, room: 'r', kind: 'floor', x: 0, y: 0, z: 0, ry: 0, w: c.size[0], d: c.size[2], h: c.size[1], tint: null, flags: { stockReplaced: true }, parent: null, decal: null, tags: c.tags, block: true };
  const b = new MeshBuilder();
  drawStandin(b, rec, c);
  for (const [mat, acc] of b.accs) for (let i = 0; i < acc.idx.length; i += 3) {
    const v = [0, 1, 2].map((k) => { const j = acc.idx[i + k]; return [acc.pos[3 * j], acc.pos[3 * j + 1], acc.pos[3 * j + 2]]; });
    out.push({ a: v[0], b: v[1], c: v[2], part: `stand-in:${mat}` });
  }
  return out;
}
/** Triangle against box (separating axes, Akenine-Moller): the box is given by centre and half sizes. */
function triBox(cx, cy, cz, hx, hy, hz, t) {
  const v = [t.a, t.b, t.c].map((p) => [p[0] - cx, p[1] - cy, p[2] - cz]), h = [hx, hy, hz];
  const e = [[v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], [v[2][0] - v[1][0], v[2][1] - v[1][1], v[2][2] - v[1][2]], [v[0][0] - v[2][0], v[0][1] - v[2][1], v[0][2] - v[2][2]]];
  for (let k = 0; k < 3; k++) { const lo = Math.min(v[0][k], v[1][k], v[2][k]), hi = Math.max(v[0][k], v[1][k], v[2][k]); if (lo > h[k] || hi < -h[k]) return false; }
  for (const ed of e) for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    const n = [ed[1] * ax[2] - ed[2] * ax[1], ed[2] * ax[0] - ed[0] * ax[2], ed[0] * ax[1] - ed[1] * ax[0]];
    if (!n[0] && !n[1] && !n[2]) continue;
    const p = v.map((q) => q[0] * n[0] + q[1] * n[1] + q[2] * n[2]), r = h[0] * Math.abs(n[0]) + h[1] * Math.abs(n[1]) + h[2] * Math.abs(n[2]);
    if (Math.min(...p) > r || Math.max(...p) < -r) return false;
  }
  const n = [e[0][1] * e[1][2] - e[0][2] * e[1][1], e[0][2] * e[1][0] - e[0][0] * e[1][2], e[0][0] * e[1][1] - e[0][1] * e[1][0]];
  const d = n[0] * v[0][0] + n[1] * v[0][1] + n[2] * v[0][2], r = h[0] * Math.abs(n[0]) + h[1] * Math.abs(n[1]) + h[2] * Math.abs(n[2]);
  return Math.abs(d) <= r;
}
/** The highest triangle surface under (x, z) at or below yMax: { y, part } or null. */
function floorUnder(tris, x, z, yMax) {
  let best = null;
  for (const t of tris) {
    const [a, b, c] = [t.a, t.b, t.c], d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
    if (y <= yMax + 1e-9 && (best === null || y > best.y)) best = { y, part: t.part };
  }
  return best;
}

const SIDE = 0.003, SINK = 0.010, FLOAT = 0.006;      // an article may sink 10 mm into the piece (a sheet of paper, a rim) or float 6 mm over it, and touch its sides by 3 mm
test('every planned article stands on the geometry the page draws for its piece (the model, or the stand-in of a piece that opens) and is clear of it', async () => {
  report((await boot({ steps: ['furniture'] })).map((e) => e.message), 'errors while loading the furniture');
  const problems = [];
  let total = 0, pieces = 0;
  for (const name of Object.keys(GOODS_FIXTURES)) {
    const tris = drawn(name), fx = { id: 'f', name, room: 'r', x: 0, y: 0, z: 0, ry: 0 };
    assert.ok(tris.length > 20, `${name}: ${tris.length} triangles drawn`);
    const shopsOf = Object.entries(GOODS_ASSORTMENTS).filter(([, m]) => m[name]).map(([s]) => s);
    assert.ok(shopsOf.length, `${name}: no shop stocks it`);
    pieces++;
    const seen = new Set();
    for (const shop of shopsOf) for (const r of planGoodsForFixture(fx, shop)) {
      total++;
      const [x, y, z] = r.local, key = [r.name, x, y, z].join(), hits = new Set();
      if (seen.has(key)) continue;
      seen.add(key);
      const top = y + r.h - SIDE, bottom = y + SINK;
      for (const t of tris) if (triBox(x, (top + bottom) / 2, z, r.w / 2 - SIDE, (top - bottom) / 2, r.d / 2 - SIDE, t)) hits.add(t.part);
      const under = [[0, 0], [-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([u, w]) => floorUnder(tris, x + u * r.w / 2, z + w * r.d / 2, y + 0.02));
      const gap = under[0] ? y - under[0].y : null;
      if (gap === null || gap > FLOAT || gap < -SINK) hits.add(`no support (${gap === null ? 'nothing under it' : (gap * 1000).toFixed(1) + ' mm over ' + under[0].part})`);
      if (hits.size) problems.push(`${shop}/${name}/${r.name} at (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}): ${[...hits].sort().join(' | ')}`);
    }
  }
  console.log(`# goods: ${total} planned articles on ${pieces} pieces checked against the drawn geometry`);
  report(problems, 'articles floating, sunk or inside their piece');
});

// ---------------------------------------------------------------- the stand-ins of the pieces that open
test('the counters that open are drawn by their stand-in, which leaves out the stock the goods library stocks: the glass cases and the barber\'s stand lose their boxes, the others have none to lose', () => {
  const problems = [], tris = (name, flags) => {
    const c = CATALOG[name], b = new MeshBuilder();
    drawStandin(b, { id: 'scratch', name, room: 'r', kind: 'floor', x: 0, y: 0, z: 0, ry: 0, w: c.size[0], d: c.size[2], h: c.size[1], tint: null, flags, parent: null, decal: null, tags: c.tags, block: true }, c);
    return b.tris;
  };
  const opening = Object.keys(GOODS_FIXTURES).filter((n) => layoutOf(CATALOG[n]));
  assert.ok(opening.length >= 6, `${opening.length} pieces that open are stocked`);
  for (const name of opening) {
    const plain = tris(name, undefined), bare = tris(name, { stockReplaced: true }), has = ['shop_counter_glass', 'pharmacy_counter', 'barber_station'].includes(name);
    if (has && !(bare < plain)) problems.push(`${name}: ${plain} triangles, ${bare} with its stock left out: the stand-in still draws its own stock`);
    if (!has && bare !== plain) problems.push(`${name}: ${plain} triangles, ${bare} with its stock left out: a stand-in that has stock must be listed here`);
  }
  report(problems, 'stand-in problems');
});

// ---------------------------------------------------------------- through buildInterior
test('through buildInterior: a stocked piece is drawn without its baked stock and the goods stand in a LOD of their own; without the library or its atlas nothing changes; the containers do not notice', async () => {
  report((await boot()).map((e) => e.message), 'errors while loading');
  const problems = [];
  let planned = 0, drawnN = 0, near = 0, far = 0, maxNear = 0, maxCalls = 0, maxTotal = 0, saved = 0;
  for (const bp of shops) {
    const furniture = JSON.stringify(bp.furniture);
    ctx.goodsAssets.atlasReady = false;
    const plain = built(bp);
    ctx.goodsAssets.atlasReady = true;
    const full = built(bp), g = full.st.goods, byId = new Map(bp.furniture.map((f) => [f.id, f])), stocked = new Set(bp.goods.map((x) => x.parent));
    if (JSON.stringify(bp.furniture) !== furniture) problems.push(`${bp.id}: building the interior changed the furniture records`);
    if (plain.st.goods.drawn !== 0 || plain.lods.length) problems.push(`${bp.id}: without the atlas ${plain.st.goods.drawn} goods drawn, ${plain.lods.length} LODs`);
    if (plain.st.failed || full.st.failed) problems.push(`${bp.id}: ${plain.st.failed} / ${full.st.failed} records failed to draw`);
    if (g.drawn !== bp.goods.length || g.fixtures !== stocked.size) problems.push(`${bp.id}: ${g.drawn} of ${bp.goods.length} articles drawn, ${g.fixtures} of ${stocked.size} pieces stocked`);
    if (JSON.stringify(plain.st.fronts) !== JSON.stringify(full.st.fronts) || plain.st.glb - full.st.glb || plain.st.standin - full.st.standin) problems.push(`${bp.id}: the goods change what is drawn as a model, as a stand-in or as an openable front`);
    // the baked stock is gone, all of it: the interior's own triangles fall by (at least) the stock parts of the pieces that were stocked
    const gone = [...stocked].reduce((n, id) => n + (layoutOf(CATALOG[byId.get(id).name]) ? 0 : stockTris(byId.get(id).name)), 0);
    if (plain.own - full.own < gone) problems.push(`${bp.id}: its own triangles fall by ${plain.own - full.own}, the stock parts of its stocked pieces are ${gone}`);
    saved += plain.own - full.own;
    // the goods: one LOD per stocked room, two draw calls at most per level, the library's own triangle counts
    const rooms = new Set(bp.goods.map((x) => x.room));
    if (full.lods.length !== rooms.size) problems.push(`${bp.id}: ${full.lods.length} goods LODs for ${rooms.size} stocked rooms`);
    for (const lod of full.lods) {
      const u = lod.userData.goods, n = bp.goods.filter((x) => x.room === u.room).length;
      if (u.records !== n || lod.levels.length !== 3 || u.nearCalls > 2 || u.farCalls > 2 || u.farTriangles >= u.nearTriangles) problems.push(`${bp.id} ${u.room}: ${u.records}/${n} records, ${lod.levels.length} levels, ${u.nearCalls}/${u.farCalls} calls, ${u.nearTriangles}/${u.farTriangles} triangles`);
    }
    const want = bp.goods.reduce((n, x) => n + ctx.assets.meta(x.name).triangles, 0);
    if (g.nearTriangles !== want) problems.push(`${bp.id}: ${g.nearTriangles} goods triangles drawn, the library counts ${want}`);
    if (full.own + g.nearTriangles > INTERIOR_CAP && plain.own <= INTERIOR_CAP) problems.push(`${bp.id}: ${full.own} triangles and ${g.nearTriangles} of goods (the cap is ${INTERIOR_CAP})`);
    planned += bp.goods.length; drawnN += g.drawn; near += g.nearTriangles; far += g.farTriangles;
    maxNear = Math.max(maxNear, g.nearTriangles); maxCalls = Math.max(maxCalls, g.nearCalls); maxTotal = Math.max(maxTotal, full.own + g.nearTriangles);
    drop(plain.id); drop(full.id);
  }
  console.log(`# goods: ${drawnN}/${planned} articles drawn in ${shops.length} interiors, ${near} triangles near (${far} far); the busiest shop has ${maxNear} (${maxCalls} calls per room) and ${maxTotal} with its furniture; the interiors lose ${saved} triangles of baked stock`);
  report(problems, 'build problems');
  report((ctx.errors ?? []).filter((e) => e.stage === 'goods' || (e.stage === 'interiors' && !/^atlas/.test(e.message))).map((e) => `${e.stage} ${e.building ?? ''} ${e.name ?? ''}: ${e.message}`), 'goods or interior build errors');
  assert.equal(drawnN, planned, 'not every planned article was drawn');
});

test('a piece is stocked whole or not at all: a piece drawn some other way, or with one article that did not load, keeps its own stock while the pieces around it are restocked', async () => {
  await boot();
  const bp = shops.filter((b) => b.furniture.filter((f) => b.goods.some((g) => g.parent === f.id)).length >= 3).find((b) => b.goods.some((g) => g.name === 'goods_milk_bottle') && b.goods.some((g) => g.name !== 'goods_milk_bottle'));
  assert.ok(bp, 'no shop with a few stocked pieces and a milk bottle');
  const pieces = (b) => b.furniture.filter((f) => b.goods.some((g) => g.parent === f.id));
  const stocked = (b) => { const r = built(b); drop(r.id); return r.st.goods; };
  const all = stocked(bp);
  assert.equal(all.fixtures, pieces(bp).length, 'the shop is not stocked as a whole to begin with');
  // 1. the model of one piece did not load: that piece is drawn by its stand-in, keeps the stand-in's own stock; the others do not care
  const lone = pieces(bp).find((f) => !layoutOf(CATALOG[f.name])), same = pieces(bp).filter((f) => f.name === lone.name).length;
  ctx.interiorGlb.delete(lone.name);
  const noModel = stocked(bp);
  ctx.interiorGlb.add(lone.name);
  assert.equal(noModel.fixtures, pieces(bp).length - same, `${lone.name} has no model: its ${same} pieces keep their own stock, the other ${pieces(bp).length - same} are stocked`);
  assert.equal(noModel.drawn, bp.goods.filter((g) => byParentName(bp, g) !== lone.name).length);
  // 2. one article did not load: every piece whose plan holds it keeps its own stock
  ctx.goodsAssets.checked.delete('goods_milk_bottle');
  const noMilk = stocked(bp), holdingMilk = new Set(bp.goods.filter((g) => g.name === 'goods_milk_bottle').map((g) => g.parent));
  ctx.goodsAssets.checked.add('goods_milk_bottle');
  assert.equal(noMilk.fixtures, pieces(bp).length - holdingMilk.size, `${holdingMilk.size} pieces hold a milk bottle: they keep their stock, the others are stocked`);
  assert.equal(noMilk.drawn, bp.goods.filter((g) => !holdingMilk.has(g.parent)).length);
  assert.equal(stocked(bp).fixtures, all.fixtures, 'a retry with everything there stocks the whole shop again');
});
