// A2: the bedrooms of a private floor (round 6, R4-301 / R1-101 follow-up). The chain fix made a bedroom a leaf of the door tree and the rest column beside the stair the one hub of the floor
// (layouts.js `privateFloor`); the first cut of it kept only the front band for sleeping and cut that into two bedrooms only where both halves had 5 m2 and 1.9 m, so 14 rowhouses were left
// with ONE bedroom a floor, the family's, and the home's other household (every room without an occupant: the living room, the kitchen, the rooms of the second family) with none. This pins
// what the plan owes a private floor of a home (house, rowhouse, shophouse, cornerstore, unfinished):
//  * a front band that can be cut is cut: its two halves are each 1.8 m wide (a door, 0.8 m of wall clear beside it for the head of a bed, the 0.1 m margins) and 4.8 m2; a floor with ONE
//    bedroom is a band that cannot give two of them (the rest column is under 1.8 m wide or a half is under 4.8 m2);
//  * every bedroom of a private floor keeps those sizes;
//  * the barrio's two-storey houses and rowhouses give the household that has no occupant a bedroom (the family's is the first bedroom of every floor), but for the narrowest rowhouses.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-bedrooms.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { T_INT } from '../js/arch/geom.js';

const real = await buildData({ furnish: false });
const synth = planAll(testLots(), undefined, true, 0.4, 0);
const ALL = [['real', real.buildings], ['test', synth.bps]].flatMap(([tag, bps]) => bps.map((bp) => ({ tag, bp })));
const HOMES = new Set(['house', 'rowhouse', 'shophouse', 'cornerstore', 'unfinished']);
const MIN_W = 1.8, MIN_AREA = 4.8;                                       // layouts.js PRIV_BED_W, PRIV_BED_AREA

const wd = (r) => r.rect.x1 - r.rect.x0, dp = (r) => r.rect.z1 - r.rect.z0, area = (r) => wd(r) * dp(r);
const tail = (id) => id.split('.').slice(1).join('.');
const fits = (w, d) => w >= MIN_W - 1e-9 && w * d >= MIN_AREA - 1e-9;

/** The private floors of a home: the storeys above the ground that hold the family's bedroom, with their bedrooms and the stair's landing. */
function privateFloors(bp) {
  if (!HOMES.has(bp.lot.kind)) return [];
  const ks = [...new Set(bp.rooms.filter((r) => r.type === 'bedroom' && r.occupant === 'family' && r.floor >= 1).map((r) => r.floor))].sort();
  return ks.map((k) => ({ k, beds: bp.rooms.filter((r) => r.floor === k && r.type === 'bedroom'), land: bp.rooms.find((r) => r.floor === k && r.core) })).filter((f) => f.land);
}

/** What a private floor owes: a band that can be cut into two bedrooms is, and no bedroom of the floor is under MIN_W or MIN_AREA. Returns the problems. */
function problems(bp, tag = bp.id) {
  const out = [];
  for (const { k, beds, land } of privateFloors(bp)) {
    for (const r of beds) if (!fits(Math.min(wd(r), dp(r)), Math.max(wd(r), dp(r)))) out.push(`${tag} ${tail(r.id)} bedroom ${wd(r).toFixed(2)} x ${dp(r).toFixed(2)} (under ${MIN_W} m or ${MIN_AREA} m2)`);
    if (beds.length !== 1) continue;
    // one bedroom: the whole front band. The band is cut along the stair column's wall, so the half over the stair is as wide as the landing and the half over the rest column is what is left
    const band = beds[0], stairW = wd(land), restW = wd(band) - stairW - T_INT, depth = dp(band);
    if (fits(stairW, depth) && fits(restW, depth)) out.push(`${tag} floor ${k}: ONE bedroom ${wd(band).toFixed(2)} x ${depth.toFixed(2)}, but the band cuts into ${stairW.toFixed(2)} and ${restW.toFixed(2)} m wide halves of ${(stairW * depth).toFixed(1)} and ${(restW * depth).toFixed(1)} m2`);
  }
  return out;
}

test('a front band that can be cut into two bedrooms is, and every bedroom of a private floor is 1.8 m wide and 4.8 m2 at least (barrio and test lots)', () => {
  let floors = 0, one = 0, two = 0;
  for (const { bp } of ALL) for (const f of privateFloors(bp)) { floors++; if (f.beds.length === 1) one++; else two++; }
  assert.ok(floors > 80 && two > 60, `private floors to look at: ${floors} (${one} with one bedroom, ${two} with more)`);
  assert.deepEqual(ALL.flatMap(({ tag, bp }) => problems(bp, tag)), []);
});

test('the barrio\'s two-storey houses and rowhouses give the household with no occupant a bedroom, but for the narrowest rowhouses (a rest column of 1.63 m)', () => {
  const without = [], lone = [];
  let homes = 0;
  for (const bp of real.buildings) {
    const pf = privateFloors(bp);
    if (!pf.length || !['house', 'rowhouse'].includes(bp.lot.kind)) continue;
    homes++;
    if (!bp.rooms.some((r) => r.type === 'bedroom' && r.floor >= 1 && !r.occupant)) { without.push(bp.id); if (pf.every((f) => f.beds.length === 1)) lone.push(bp.id); }
  }
  assert.ok(homes >= 30, `${homes} two-storey houses and rowhouses`);
  // (a home whose every private floor has one bedroom: the band is too narrow to cut, problems() above says so; the others are a fault)
  assert.deepEqual(without, lone, 'every home without a second household bedroom has only one-bedroom floors');
  assert.ok(without.length <= 2, `${without.length} homes leave their second household without a bedroom: ${without.join(', ')}`);
});

test('TEETH: the checks find a band left whole, a bedroom that is too narrow and one that is too small, planted in copies of real plans (which are clean)', () => {
  const cut = real.buildings.find((bp) => bp.lot.kind === 'rowhouse' && privateFloors(bp).some((f) => f.beds.length === 2));
  assert.ok(cut, 'a rowhouse of the barrio whose private floor is cut into two bedrooms');
  assert.deepEqual(problems(cut), []);
  const { k, beds, land } = privateFloors(cut).find((f) => f.beds.length === 2);
  const [a, b] = beds, whole = { x0: Math.min(a.rect.x0, b.rect.x0), x1: Math.max(a.rect.x1, b.rect.x1), z0: a.rect.z0, z1: a.rect.z1 };
  // the two halves put back into one bedroom (the first cut of the round-6 plan): the band could be cut and is not
  const merged = { ...cut, rooms: cut.rooms.filter((r) => r.id !== b.id).map((r) => (r.id === a.id ? { ...r, rect: whole } : r)) };
  const m = problems(merged);
  assert.ok(m.length === 1 && m[0].includes(`floor ${k}: ONE bedroom`) && m[0].includes('cuts into'), m.join('; '));
  // a bedroom 1.6 m wide (the rest column of the narrowest rowhouse): a bed, a door and 0.8 m of wall beside it do not fit
  const narrow = { ...cut, rooms: cut.rooms.map((r) => (r.id === b.id ? { ...r, rect: { ...r.rect, x1: r.rect.x0 + 1.6 } } : r)) };
  assert.ok(problems(narrow).some((s) => s.includes(`${tail(b.id)} bedroom 1.60`)), problems(narrow).join('; '));
  // a bedroom 1.9 m wide and 2.4 m deep (4.6 m2)
  const small = { ...cut, rooms: cut.rooms.map((r) => (r.id === a.id ? { ...r, rect: { ...r.rect, x1: r.rect.x0 + 1.9, z0: r.rect.z1 - 2.4 } } : r)) };
  assert.ok(problems(small).some((s) => s.includes(`${tail(a.id)} bedroom 1.90 x 2.40`)), problems(small).join('; '));
  // and the plan checks see a home with a landing and bedrooms on the barrio
  assert.ok(land && area(a) >= MIN_AREA && area(b) >= MIN_AREA);
});
