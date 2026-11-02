// INTERIORS shop stock (round 6, R4-308): what a trade's cases and shelves hold is what the trade sells. The butchers' cases held one row of meat while the two butchers carried 112 bottles of drink, the
// bakery case held three round loaves and two cheese wedges, the pharmacies stocked 51 jars labelled AZÚCAR and 33 bottles of milk. Held to: a butcher stocks meat only, in two rows, and has no drinks cooler;
// a bakery's case holds breads (two rows, no cheese); a pharmacy's shelves and counter hold medicine boxes, bandages and syrup, nothing from the grocery; a barber's station holds hair tonic.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-stock.test.mjs
//   A3_LIST=40 shows more of a failing list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { GOODS_CATALOG } from '../js/interiors/goods-catalog.js';
import { GOODS_ASSORTMENTS } from '../js/interiors/goods-assortments.js';

const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const { bps } = await furnishedBatch({ real: true });
const tagsOf = (name) => GOODS_CATALOG[name]?.tags ?? [];
const kind = (name) => name.replace(/^goods_/, '');

/** What each fixture of a trade may hold: the goods tags it is stocked from. Anything else on it is wrong stock (a jar of sugar in a pharmacy). */
const MAY = {
  'carniceria/fridge_meat': ['meat'], 'carniceria/butcher_block': ['meat'],
  'panaderia/bread_case_glass': ['bread'], 'panaderia/bread_rack': ['bread'],
  'drogueria/shelf_pharma': ['pharmacy'], 'drogueria/pharmacy_counter': ['pharmacy'],
  'peluqueria/barber_station': ['pharmacy'],
};
/** The trades' goods in the world: [{ bp, room, trade, fixture (the record), goods: [records] }] for every stocked fixture. */
const stocked = [];
for (const bp of bps) {
  const byId = new Map(bp.furniture.map((f) => [f.id, f]));
  const per = new Map();
  for (const g of bp.goods ?? []) (per.get(g.parent) ?? per.set(g.parent, []).get(g.parent)).push(g);
  for (const [id, goods] of per) {
    const f = byId.get(id), info = bp.interior.rooms?.[f.room], trade = info ? info.shopType : bp.interior.shopType ?? bp.lot?.shop;
    stocked.push({ bp, room: f.room, trade, fixture: f, goods });
  }
}
const of = (trade, name) => stocked.filter((s) => s.trade === trade && s.fixture.name === name);
const rowsOf = (goods) => new Set(goods.map((g) => g.local[2].toFixed(3))).size;
const kindsOf = (goods) => [...new Set(goods.map((g) => kind(g.name)))].sort();

test('the assortments: a butcher has no drinks, a baker\'s case no cheese, a pharmacy no grocery, a barber no sugar: every article of these fixtures is of the trade', () => {
  const problems = [];
  for (const [path, may] of Object.entries(MAY)) {
    const [trade, fixture] = path.split('/'), pool = GOODS_ASSORTMENTS[trade]?.[fixture];
    if (!pool?.length) { problems.push(`${path}: no assortment`); continue; }
    for (const key of pool) if (!may.some((t) => tagsOf(key).includes(t))) problems.push(`${path}: ${key} (${tagsOf(key).join(',')}) is not ${may.join(' or ')}`);
  }
  assert.equal(GOODS_ASSORTMENTS.carniceria.fridge_drinks, undefined, 'a butcher\'s shop has no drinks cooler to stock');
  report(problems, 'assortment problems');
});

test('the butchers\' cases: two rows of meat, a case full (one row of eight was left), and no cooler of drinks in the shop (112 bottles between two butchers)', () => {
  const cases = of('carniceria', 'fridge_meat');
  assert.ok(cases.length >= 2, `${cases.length} butchers' cases stocked`);
  const problems = [];
  for (const c of cases) {
    if (rowsOf(c.goods) < 2) problems.push(`${c.bp.id}: ${c.goods.length} articles in ${rowsOf(c.goods)} row`);
    if (c.goods.length < 12) problems.push(`${c.bp.id}: only ${c.goods.length} articles in the case (${kindsOf(c.goods)})`);
    if (kindsOf(c.goods).length < 2) problems.push(`${c.bp.id}: one kind of meat (${kindsOf(c.goods)})`);
  }
  for (const s of stocked.filter((q) => q.trade === 'carniceria')) for (const g of s.goods) if (!tagsOf(g.name).includes('meat')) problems.push(`${s.bp.id}: ${g.name} on a ${s.fixture.name}`);
  for (const bp of bps) for (const f of bp.furniture) {
    const info = bp.interior.rooms?.[f.room];
    if (info?.shopType === 'carniceria' && f.name === 'fridge_drinks') problems.push(`${bp.id}: a drinks cooler in a butcher's shop (${f.room})`);
  }
  report(problems, 'butcher problems');
});

test('the bakeries\' glass cases: breads in two rows, no cheese, at least two kinds in a case and three across them (a case held 3 round loaves and 2 cheese wedges)', () => {
  const cases = of('panaderia', 'bread_case_glass');
  assert.ok(cases.length >= 2, `${cases.length} bakery cases stocked`);
  const problems = [];
  for (const c of cases) {
    if (rowsOf(c.goods) < 2) problems.push(`${c.bp.id}: ${c.goods.length} articles in ${rowsOf(c.goods)} row`);
    if (c.goods.length < 10) problems.push(`${c.bp.id}: only ${c.goods.length} articles (${kindsOf(c.goods)})`);
    if (kindsOf(c.goods).length < 2) problems.push(`${c.bp.id}: only ${kindsOf(c.goods).length} kind of bread (${kindsOf(c.goods)})`);
    for (const g of c.goods) if (!tagsOf(g.name).includes('bread')) problems.push(`${c.bp.id}: ${g.name} in the bread case`);
  }
  const all = kindsOf(cases.flatMap((c) => c.goods));
  if (all.length < 3) problems.push(`${all.length} kinds of bread across the bakeries' cases (${all})`);
  report(problems, 'bakery case problems');
});

test('the hardware store sells brooms and mops besides its four hardware articles (nails, bulbs and padlocks have no model in the goods library)', () => {
  const shops = bps.flatMap((bp) => [...bp.interior.layouts].filter(([rid]) => bp.interior.rooms?.[rid]?.shopType === 'ferreteria').map(([rid, L]) => ({ bp, rid, L })))
    .filter(({ L }) => L.items.some((i) => i.name === 'shelf_ferre'));
  assert.ok(shops.length >= 1, 'a hardware store in the barrio');
  report(shops.filter(({ L }) => !['broom', 'mop_bucket'].every((n) => L.items.some((i) => i.name === n))).map(({ bp, rid }) => `${bp.id} ${rid}: no broom or no mop bucket`), 'hardware shops without brooms and mops');
});

test('the pharmacies: boxes, bandages and syrup on the shelves and the counter, and not one jar of sugar or bottle of milk (51 and 33 were)', () => {
  const shelves = of('drogueria', 'shelf_pharma'), counters = of('drogueria', 'pharmacy_counter');
  assert.ok(shelves.length >= 4 && counters.length >= 2, `${shelves.length} pharmacy shelves and ${counters.length} counters stocked`);
  const problems = [];
  for (const s of [...shelves, ...counters]) for (const g of s.goods) if (!tagsOf(g.name).includes('pharmacy')) problems.push(`${s.bp.id}: ${g.name} on a ${s.fixture.name}`);
  for (const bp of bps.filter((b) => stocked.some((s) => s.bp === b && s.trade === 'drogueria'))) {
    const all = stocked.filter((s) => s.bp === bp && s.trade === 'drogueria' && ['shelf_pharma', 'pharmacy_counter'].includes(s.fixture.name)).flatMap((s) => s.goods);
    if (kindsOf(all).length < 3) problems.push(`${bp.id}: only ${kindsOf(all).length} kinds of medicine goods (${kindsOf(all)})`);
  }
  report(problems, 'pharmacy problems');
});
