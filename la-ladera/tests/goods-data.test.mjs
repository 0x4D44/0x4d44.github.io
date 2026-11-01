// Shelf placement and failure behavior. Run with the same importmap/quiet wrapper as all interiors tests:
// node --import ./la-ladera/tests/register.mjs --test --test-reporter=tap la-ladera/tests/goods-data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CATALOG } from '../js/interiors/catalog.js';
import { GOODS_CATALOG } from '../js/interiors/goods-catalog.js';
import { GOODS_ASSORTMENTS, GOODS_FIXTURES } from '../js/interiors/goods-assortments.js';
import { GOODS_LOD, planGoodsForFixture, planShopGoods, resolveGoodsSurfaces, goodsAssetReady, stockedFixtureIds } from '../js/interiors/goods.js';
import { REQUIRED_CATEGORIES, REQUIRED_FIXTURES } from '../tools/blender/goods_validate.mjs';
import { SHOP_TYPES } from '../js/core/vocab.js';

const EPS = 2e-6;
const fixture = (name, id = name, ry = 0) => ({ id, name, room: 'shop.0', kind: 'floor', x: 3.25, y: 2.8, z: -4.5, ry, w: CATALOG[name].size[0], d: CATALOG[name].size[2] });
const intersects = (a, b) => Math.abs(a.local[0] - b.local[0]) < (a.w + b.w) / 2 - EPS &&
  Math.abs(a.local[2] - b.local[2]) < (a.d + b.d) / 2 - EPS &&
  a.local[1] < b.local[1] + b.h - EPS && a.local[1] + a.h > b.local[1] + EPS;
const inSupport = (p, s) => Math.abs(p.local[0] - s.x) + p.w / 2 <= s.w / 2 + EPS &&
  Math.abs(p.local[2] - s.z) + p.d / 2 <= s.d / 2 + EPS && Math.abs(p.local[1] - s.y) < EPS && p.h <= s.h + EPS;

test('assortment data covers every shop, requested fixture and goods family', () => {
  const keys = new Set(), fixtures = new Set();
  assert.deepEqual(Object.keys(GOODS_ASSORTMENTS).sort(), [...SHOP_TYPES].sort());
  for (const [shop, mapping] of Object.entries(GOODS_ASSORTMENTS)) for (const [name, goods] of Object.entries(mapping)) {
    assert.ok(CATALOG[name] && GOODS_FIXTURES[name], `${shop}/${name}: unknown fixture`);
    assert.ok(goods.length, `${shop}/${name}: empty assortment`); fixtures.add(name);
    for (const key of goods) { assert.ok(GOODS_CATALOG[key] && CATALOG[key], `${shop}/${name}: unknown catalogue key ${key}`); keys.add(key); }
  }
  for (const name of REQUIRED_FIXTURES) assert.ok(fixtures.has(name), `${name}: no assortment`);
  for (const key of Object.keys(GOODS_CATALOG)) assert.ok(keys.has(key), `${key}: never stocked`);
  const families = new Set([...keys].map((key) => GOODS_CATALOG[key].category));
  for (const family of REQUIRED_CATEGORIES) assert.ok(families.has(family), `${family}: missing family`);
  assert.ok(GOODS_LOD.near > 0 && GOODS_LOD.cull > GOODS_LOD.near && GOODS_LOD.cull <= 22, 'bounded near/far/cull distances');
});

test('all assortments fit their shelves at metre scale, without overlaps, at arbitrary fixture rotations', () => {
  let tested = 0, placed = 0;
  for (const [shop, mapping] of Object.entries(GOODS_ASSORTMENTS)) for (const name of Object.keys(mapping)) for (const ry of [0, 0.73, Math.PI / 2]) {
    const f = fixture(name, shop + ':' + name, ry), records = planGoodsForFixture(f, shop), surfaces = resolveGoodsSurfaces(f);
    assert.ok(records.length > 0, `${shop}/${name}: no article fits`);
    assert.ok(records.length <= GOODS_FIXTURES[name].maxItems, `${shop}/${name}: fixture item cap`);
    assert.deepEqual(records, planGoodsForFixture(f, shop), `${shop}/${name}: nondeterministic`);
    for (const p of records) {
      const c = GOODS_CATALOG[p.name], rotated = Math.abs(p.localRotation ?? 0) > EPS;
      assert.equal(p.parent, f.id); assert.equal(p.room, f.room); assert.equal(p.block, false);
      assert.equal(p.w, c.footprint[rotated ? 1 : 0]); assert.equal(p.d, c.footprint[rotated ? 0 : 1]); assert.equal(p.h, c.size[1]);
      assert.ok(inSupport(p, surfaces[p.surface]), `${shop}/${name}/${p.name}: floats, overhangs or exceeds headroom`);
      const s = surfaces[p.surface];
      if (s.radius) assert.ok(Math.hypot(Math.abs(p.local[0] - s.x) + p.w / 2, Math.abs(p.local[2] - s.z) + p.d / 2) <= s.radius + EPS, `${p.name}: overhangs round tabletop`);
      for (const q of GOODS_FIXTURES[name].obstacles ?? []) assert.ok(!intersects(p, { ...q, local: [q.x ?? 0, q.y ?? 0, q.z ?? 0] }), `${shop}/${name}/${p.name}: overlaps the fixture's built-in work surface object`);
      const [x, y, z] = p.local, cs = Math.cos(ry), sn = Math.sin(ry);
      assert.ok(Math.abs(p.x - (f.x + x * cs + z * sn)) < EPS && Math.abs(p.z - (f.z - x * sn + z * cs)) < EPS && Math.abs(p.y - f.y - y) < EPS, `${p.name}: incorrect fixture/world transform`);
    }
    for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) assert.ok(!intersects(records[i], records[j]), `${shop}/${name}: ${records[i].name} overlaps ${records[j].name}`);
    tested++; placed += records.length;
  }
  assert.ok(tested >= SHOP_TYPES.length * 3 && placed > 1000, 'exercise all shop fittings and many real stock placements');
});

test('shallow and multirow shelves turn deep articles without shrinking them', () => {
  const bread = planGoodsForFixture(fixture('shelf_cafe'), 'panaderia', [], GOODS_CATALOG, { panaderia: { shelf_cafe: ['goods_baguette'] } });
  assert.ok(bread.length); assert.ok(bread.every((p) => p.localRotation === Math.PI / 2));
  const shoes = planGoodsForFixture(fixture('shop_counter_short'), 'zapateria');
  assert.ok(shoes.length, 'shoes rotate to fit a shallow counter row');
  assert.ok(shoes.every((p) => p.localRotation === Math.PI / 2));
});

test('a till or other top prop reserves its full volume, including on a rotated counter', () => {
  for (const ry of [0, 0.64, Math.PI / 2]) {
    const f = fixture('shop_counter_wood', 'counter', ry), s = resolveGoodsSurfaces(f)[0];
    const occupied = { id: 'till', name: 'pc_set', parent: f.id, x: f.x, y: f.y + s.y, z: f.z, ry, w: f.w, d: f.d, h: 0.7 };
    assert.ok(planGoodsForFixture(f, 'ferreteria').length);
    assert.deepEqual(planGoodsForFixture(f, 'ferreteria', [occupied]), [], 'no stock inside the existing full-width prop');
    assert.ok(planGoodsForFixture(f, 'ferreteria', [{ ...occupied, parent: 'different-counter' }]).length, 'another fixture does not steal this support plane');
  }
});

test('editing data changes stock; missing, oversized and too-tall goods are safely omitted', () => {
  const f = fixture('shelf_tienda'), one = { tienda: { shelf_tienda: ['goods_apple'] } };
  const result = planGoodsForFixture(f, 'tienda', [], GOODS_CATALOG, one);
  assert.ok(result.length && result.every((p) => p.name === 'goods_apple'));
  const oversized = { size: [5, 5, 5], footprint: [5, 5] };
  assert.deepEqual(planGoodsForFixture(f, 'tienda', [], { goods_apple: oversized }, one), []);
  assert.deepEqual(planGoodsForFixture(f, 'tienda', [], { goods_apple: { ...GOODS_CATALOG.goods_apple, size: [0.095, 4, 0.095] } }, one), []);
  assert.deepEqual(planGoodsForFixture(f, 'tienda', [], {}, one), []);
  assert.deepEqual(planGoodsForFixture(f, 'unknown-shop'), []);
});

test('every catalogue article can actually fit at least one fixture in its declared assortment', () => {
  const fitting = new Set();
  for (const [shop, mapping] of Object.entries(GOODS_ASSORTMENTS)) for (const [name, goods] of Object.entries(mapping)) for (const key of goods) {
    if (planGoodsForFixture(fixture(name), shop, [], GOODS_CATALOG, { [shop]: { [name]: [key] } }).length) fitting.add(key);
  }
  assert.deepEqual(Object.keys(GOODS_CATALOG).filter((key) => !fitting.has(key)), [], 'an advertised product must have a usable shelf/counter placement');
});

test('post-layout stock planning leaves furniture and collisions unchanged and respects room shop type', () => {
  const f = fixture('shelf_cafe'), furniture = [f], collisions = [{ kind: 'test-wall' }];
  const bp = { furniture, colliders: collisions, lot: { shop: 'cafe' }, interior: { rooms: { [f.room]: { shopType: 'panaderia' } } } };
  const before = JSON.stringify(bp.furniture), planned = planShopGoods(bp);
  assert.equal(JSON.stringify(bp.furniture), before); assert.equal(bp.colliders, collisions); assert.equal(bp.goods, planned);
  assert.ok(planned.length && planned.some((p) => GOODS_CATALOG[p.name].category === 'bread'));
  const again = JSON.stringify(planShopGoods(bp)); assert.equal(again, JSON.stringify(planned));
});

function loadedContext(keys = ['goods_apple']) {
  const scene = new THREE.Group(), metas = new Map();
  for (const key of keys) {
    metas.set(key, { name: key, glb: 'goods/test.glb', node: key, lodNode: key + '__lod1' });
    for (const name of [key, key + '__lod1']) {
      const root = new THREE.Group(); root.name = name;
      const material = new THREE.MeshBasicMaterial(); material.name = 'goods_surface';
      root.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), material)); scene.add(root);
    }
  }
  return { goodsAssets: { atlasReady: true }, assets: { meta: (key) => metas.get(key), loaded: new Map([['goods/test.glb', { scene }]]) }, scene, metas };
}

test('a manifest entry without its loaded file, near node or far node never replaces procedural stock', () => {
  for (const failure of ['manifest', 'file', 'near', 'far', 'empty']) {
    const ctx = loadedContext(), key = 'goods_apple';
    if (failure === 'manifest') ctx.metas.clear();
    if (failure === 'file') ctx.assets.loaded.clear();
    if (failure === 'near' || failure === 'far') ctx.scene.remove(ctx.scene.getObjectByName(key + (failure === 'far' ? '__lod1' : '')));
    if (failure === 'empty') ctx.scene.getObjectByName(key).clear();
    assert.equal(goodsAssetReady(ctx, key), false, failure);
    assert.equal(stockedFixtureIds(ctx, [{ name: key, parent: 'shelf' }]).size, 0, failure);
  }
});

test('malformed mesh data falls back instead of inserting corrupt goods into a building', () => {
  for (const failure of ['nan', 'short-position', 'bad-index', 'partial-triangle', 'material']) {
    const ctx = loadedContext(), mesh = ctx.scene.getObjectByName('goods_apple').children[0];
    if (failure === 'nan') mesh.geometry.attributes.position.array[0] = NaN;
    if (failure === 'short-position') mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
    if (failure === 'bad-index') mesh.geometry.index.array[0] = mesh.geometry.attributes.position.count + 1;
    if (failure === 'partial-triangle') mesh.geometry.setIndex([0, 1, 2, 3]);
    if (failure === 'material') mesh.material.name = 'not_a_library_material';
    assert.equal(goodsAssetReady(ctx, 'goods_apple'), false, failure);
  }
});

test('a partially loaded assortment falls back atomically per fixture, and a failed atlas keeps procedural stock', () => {
  const ctx = loadedContext(['goods_apple', 'goods_orange']);
  const records = [{ name: 'goods_apple', parent: 'A' }, { name: 'goods_orange', parent: 'A' }, { name: 'goods_apple', parent: 'B' }];
  assert.deepEqual([...stockedFixtureIds(ctx, records)].sort(), ['A', 'B']);
  ctx.scene.remove(ctx.scene.getObjectByName('goods_orange__lod1'));
  assert.deepEqual([...stockedFixtureIds(ctx, records)], ['B'], 'one missing product restores the whole affected fixture');
  ctx.goodsAssets.atlasReady = false;
  assert.equal(stockedFixtureIds(ctx, records).size, 0);
});
