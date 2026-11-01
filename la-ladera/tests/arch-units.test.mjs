// A2: dwelling units. A home is a unit: its front door opens onto a shared hall or corridor (or the street, for a house), it holds a bedroom of its own on its floor (or up its own stair), and a stair that serves
// several units is communal. The units are read from the plan alone: the rooms that are not circulation (stairwell, landing, hall, corridor, entry) joined by doors form one cluster each, a block of flats' clusters
// are its flats, a tenement's are its cuartos, and a house is one cluster per storey around its own stair.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-units.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, shopHomeLots, planAll } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { householdForRoom, furnishRng } from '../js/interiors/household.js';
import { rw, rd, T_INT } from '../js/arch/geom.js';
import { coreDims } from '../js/arch/stairs.js';

const lots = testLots();
const { ctx, bps } = planAll(lots);
const CIRC = new Set(['stairwell', 'landing', 'hall', 'corridor', 'entry']);

/** The plan as a graph of rooms joined by doors: clusters of dwelling rooms, and what each one opens onto. */
function units(bp) {
  const rooms = bp.rooms.filter((r) => !r.outdoor), byId = new Map(rooms.map((r) => [r.id, r]));
  const nb = new Map(rooms.map((r) => [r.id, new Set()])), circDoors = new Map(rooms.map((r) => [r.id, []])), ext = new Map(rooms.map((r) => [r.id, []]));
  for (const d of bp.doors) {
    if (d.ext) { for (const id of d.rooms) if (byId.has(id)) ext.get(id).push(d); continue; }
    const [a, b] = d.rooms;
    if (!byId.has(a) || !byId.has(b)) continue;
    nb.get(a).add(b); nb.get(b).add(a);
    if (CIRC.has(byId.get(a).type) !== CIRC.has(byId.get(b).type)) { const cell = CIRC.has(byId.get(a).type) ? b : a; circDoors.get(cell).push(d); }
  }
  const flood = (seed, ok) => { const seen = new Set([seed]), q = [seed]; while (q.length) { const x = q.pop(); for (const y of nb.get(x)) if (!seen.has(y) && ok(byId.get(y))) { seen.add(y); q.push(y); } } return seen; };
  const clusters = [], at = new Map();
  for (const r of rooms) {
    if (CIRC.has(r.type) || at.has(r.id)) continue;
    const ids = flood(r.id, (y) => !CIRC.has(y.type)), c = { id: clusters.length, rooms: [...ids].map((id) => byId.get(id)) };
    c.types = c.rooms.map((x) => x.type);
    c.floors = [...new Set(c.rooms.map((x) => x.floor))];
    c.circDoors = c.rooms.flatMap((x) => circDoors.get(x.id));
    c.ext = c.rooms.flatMap((x) => ext.get(x.id));
    c.dwelling = c.types.includes('bedroom') || c.types.includes('living');
    for (const id of ids) at.set(id, c.id);
    clusters.push(c);
  }
  // the circulation joined to the stair: every core room of every floor is one stair
  const cores = rooms.filter((r) => r.core), onStair = new Set();
  for (const r of cores) for (const id of flood(r.id, (y) => CIRC.has(y.type))) onStair.add(id);
  for (const r of cores) onStair.add(r.id);
  for (const c of clusters) c.onStair = c.circDoors.some((d) => d.rooms.some((id) => onStair.has(id)));
  return { rooms, byId, nb, clusters, dwellings: clusters.filter((c) => c.dwelling), onStair };
}

const cdOf = (bp) => coreDims(bp.shell.fh);
/** Does the lot take a flat at all (the planner's thresholds: under them it plans a house)? And two a floor? */
function flatKind(bp) {
  const I = bp.shell.inner, Wi = rw(I), Di = rd(I), cd = cdOf(bp), cw = cd.across;
  const room = bp.shell.F >= 2 && Di >= cd.along + T_INT + 3 && Di >= 3.0 + 2.8 + 2.4 + 2 * T_INT;
  return room && Wi >= cw + 2 * T_INT + 5.6 ? 2 : room && Wi >= cw + T_INT + 3.4 ? 1 : 0;
}
const apartments = bps.filter((bp) => bp.lot.kind === 'apartments');
const flats = apartments.filter((bp) => flatKind(bp) > 0), narrow = apartments.filter((bp) => flatKind(bp) === 1), wide = apartments.filter((bp) => flatKind(bp) === 2);

test('the lots have blocks of flats of both widths, and one too narrow for a flat', () => {
  assert.ok(narrow.length >= 4, `${narrow.length} blocks with one flat a floor`);
  assert.ok(wide.length >= 4, `${wide.length} blocks with two flats a floor`);
  assert.ok(apartments.some((bp) => flatKind(bp) === 0), 'a block planned as a house');
  assert.ok(apartments.some((bp) => bp.id === 'T60'), 'the barrio\'s 7 x 10 block (L23)');
});

test('a block of flats is flats: each flat has its living room, bedroom, kitchen and bathroom on its own floor and ONE door onto the hall, and opens onto nothing else', () => {
  for (const bp of flats) {
    // (a door from one flat into another would join them into one cluster: the count of flats is the check that none opens into its neighbour)
    const U = units(bp), want = flatKind(bp), floors = bp.shell.F;
    assert.equal(U.dwellings.length, want * floors, `${bp.id}: ${U.dwellings.length} flats for ${floors} floors of ${want}`);
    for (const c of U.dwellings) {
      const name = `${bp.id} flat of floor ${c.floors.join('/')} (${c.types.join('+')})`;
      assert.equal(c.floors.length, 1, `${name}: spread over floors ${c.floors}`);
      for (const t of ['living', 'bedroom', 'kitchen', 'bathroom']) assert.ok(c.types.includes(t), `${name}: no ${t} in the same flat`);
      assert.equal(c.circDoors.length, 1, `${name}: ${c.circDoors.length} doors onto the circulation, not 1`);
      const hall = c.circDoors[0].rooms.map((id) => U.byId.get(id)).find((r) => CIRC.has(r.type));
      assert.ok(hall.type === 'hall' || hall.type === 'entry', `${name}: its door opens onto a ${hall.type}, not the hall`);
      assert.equal(c.ext.length, 0, `${name}: an outside door of its own`);
    }
  }
});

test('the stair of a block of flats is communal: it serves every flat of every floor, and the street door opens onto the hall, not into a flat', () => {
  for (const bp of flats) {
    const U = units(bp), upper = U.dwellings.filter((c) => c.floors[0] > 0);
    assert.ok(bp.shell.core, `${bp.id} has a stair`);
    assert.ok(U.dwellings.every((c) => c.onStair), `${bp.id}: ${U.dwellings.filter((c) => !c.onStair).length} flats are not on the stair`);
    assert.equal(upper.length, flatKind(bp) * (bp.shell.F - 1), `${bp.id}: ${upper.length} flats upstairs`);
    const street = bp.doors.filter((d) => d.ext), into = U.byId.get(street[0]?.rooms.find(Boolean));
    assert.equal(street.length, 1, `${bp.id}: ${street.length} outside doors`);
    assert.equal(into.type, 'entry', `${bp.id}: the street door opens into a ${into.type}`);
  }
});

test('a flat is one household for the interiors: every room of it carries the same unit and occupant, two flats of a floor differ, and the hall and stair are in a flat\'s household too (no household without a bedroom)', () => {
  for (const bp of flats) {
    const U = units(bp), rng = furnishRng(ctx, bp), hhs = new Map();
    const keyOf = (r) => householdForRoom(rng, bp, r, hhs, null).id;
    const seen = new Map();
    for (const c of U.dwellings) {
      const ids = new Set(c.rooms.map(keyOf)), units_ = new Set(c.rooms.map((r) => `${r.unit}/${r.occupant}`));
      assert.equal(ids.size, 1, `${bp.id} flat of floor ${c.floors[0]}: its rooms are in ${ids.size} households (${[...ids].join(', ')})`);
      assert.equal(units_.size, 1, `${bp.id} flat of floor ${c.floors[0]}: unit/occupant ${[...units_].join(' and ')}`);
      assert.ok(c.rooms.every((r) => r.unit && r.occupant), `${bp.id}: a room of a flat without its unit or occupant`);
      const [id] = ids;
      assert.ok(!seen.has(id), `${bp.id}: the flats of floors ${seen.get(id)} and ${c.floors[0]} share the household ${id}`);
      seen.set(id, c.floors[0]);
      assert.ok(c.types.includes('bedroom'), `${bp.id}: the household ${id} has no bedroom`);
    }
    // (the hall and the stair are nobody's home, but household.js keys every room: left untagged they would be a household of their own, a "resident" with no bed, and a cast place.
    // The roof is the one exception the key cannot avoid: it names the room's own floor, so the roof terraces and the caseta are ONE household, tagged like the top floor's flats)
    const flatOfId = new Map(U.dwellings.map((c) => [keyOf(c.rooms[0]), c])), roof = new Set(), F = bp.shell.F;
    for (const r of bp.rooms) {
      const id = keyOf(r);
      if (r.floor >= F) { roof.add(id); assert.ok(U.dwellings.some((c) => c.floors[0] === F - 1 && c.rooms[0].unit === r.unit && c.rooms[0].occupant === r.occupant), `${bp.id}: the ${r.type} on the roof is tagged ${r.unit}/${r.occupant}, like no flat of the floor below`); }
      else assert.ok(flatOfId.has(id), `${bp.id}: the ${r.type} on floor ${r.floor} is in the household ${id}, which is no flat`);
    }
    assert.ok(roof.size <= 1, `${bp.id}: the roof is in ${roof.size} households (${[...roof].join(', ')})`);
    assert.equal(hhs.size, U.dwellings.length + roof.size, `${bp.id}: ${hhs.size} households for ${U.dwellings.length} flats and ${roof.size} roofs`);
  }
});

test('a lot too narrow for a flat is planned as a house, whole: one dwelling with its own stair', () => {
  for (const bp of apartments.filter((b) => flatKind(b) === 0)) {
    const U = units(bp);
    assert.ok(!bp.rooms.some((r) => r.type === 'hall' || r.type === 'entry'), `${bp.id}: a hall in a block that is a house`);
    assert.ok(U.dwellings.some((c) => c.types.includes('bedroom')), `${bp.id}: no bedroom`);
  }
});

test('a tenement is a row of cuartos off one pasillo a floor: one room each, one door each onto the corridor, a communal stair, a bath on every floor and a kitchen', () => {
  const tens = bps.filter((bp) => bp.lot.kind === 'tenement' && bp.shell.core);
  assert.ok(tens.length >= 4, `${tens.length} tenements with a stair`);
  for (const bp of tens) {
    const U = units(bp), cuartos = U.dwellings;
    assert.ok(cuartos.length >= 2 * bp.shell.F, `${bp.id}: ${cuartos.length} cuartos in ${bp.shell.F} floors`);
    for (const c of cuartos) {
      assert.deepEqual(c.types, ['bedroom'], `${bp.id}: a cuarto of ${c.types}`);
      assert.equal(c.circDoors.length, 1, `${bp.id}: a cuarto with ${c.circDoors.length} doors`);
      assert.ok(c.circDoors[0].rooms.some((id) => U.byId.get(id).type === 'corridor'), `${bp.id}: a cuarto that does not open onto the pasillo`);
      assert.equal(c.ext.length, 0, `${bp.id}: a cuarto with its own street door`);
      assert.ok(c.onStair, `${bp.id}: a cuarto off the stair's pasillo`);
    }
    for (let k = 0; k < bp.shell.F; k++) assert.ok(bp.rooms.some((r) => r.floor === k && r.type === 'bathroom'), `${bp.id}: no bathroom on floor ${k}`);
    assert.ok(bp.rooms.some((r) => r.type === 'kitchen'), `${bp.id}: no shared kitchen`);
  }
});

test('a house, rowhouse, patio house or unfinished house is one home: a bedroom in it, up its own stair if it is not on the street floor, and one street door', () => {
  // (the world only ever builds an unfinished house three storeys high: a bedroom floor between the ground floor and the open deck; a two-storey one would have no bedroom to show)
  const homes = bps.filter((bp) => ['house', 'rowhouse', 'courtyard'].includes(bp.lot.kind) || (bp.lot.kind === 'unfinished' && bp.shell.F >= 3));
  assert.ok(homes.length >= 15, `${homes.length} homes`);
  for (const bp of homes) {
    const U = units(bp), beds = U.rooms.filter((r) => r.type === 'bedroom' && !r.outdoor);
    assert.ok(beds.length >= 1, `${bp.id} (${bp.lot.kind} ${bp.lot.w} x ${bp.lot.d}, ${bp.shell.F} floors): no bedroom`);
    const street = bp.doors.filter((d) => d.ext && d.entrance === 'main');
    assert.equal(street.length, 1, `${bp.id}: ${street.length} street doors`);
    assert.equal(bp.doors.filter((d) => d.ext).length, 1, `${bp.id}: outside doors besides the street door`);
    // (a bedroom upstairs is up the building's one stair, which is this home's own: one street door, and no second home to share it with. That every room is reachable from that door is arch-plan's sweep.)
    assert.ok(U.dwellings.length >= 1 && U.dwellings.every((c) => c.types.some((t) => t === 'living' || t === 'bedroom' || t === 'kitchen')), `${bp.id}: no dwelling rooms`);
  }
});

// ---- the homes above a shop: the barrio's own lots (the world's plan), the shop lots of arch-lib's testLots, and its shopHomeLots (T67-T79: one storey above the shop, by plan)
const barrio = await buildData({ furnish: false, colliders: false });
const homeSet = planAll(shopHomeLots());
const SHOP_KINDS = ['shophouse', 'cornerstore', 'workshop'];
const shopHomes = [...bps.map((bp) => ({ bp, ctx })), ...homeSet.bps.map((bp) => ({ bp, ctx: homeSet.ctx })), ...barrio.buildings.map((bp) => ({ bp, ctx: barrio.ctx }))].filter(({ bp }) => SHOP_KINDS.includes(bp.lot.kind) && bp.shell.F >= 2 && bp.shell.core);
const FLAT_BED_AREA = 5.5, FLAT_BED_W = 1.9, FLAT_LIVING_AREA = 6.0;

test('a flat\'s kitchen is at least as large as its bathroom (R4-209: 3.2 x 1.41 m galleys beside 3.2 x 1.7 m baths), with the living room 3.0 m and the bedroom 2.8 m deep at least, on the test lots and on the barrio', () => {
  const problems = [], area = (r) => rw(r.rect) * rd(r.rect), fmt = (r) => `${rw(r.rect).toFixed(2)} x ${rd(r.rect).toFixed(2)}`;
  let n = 0, across = 0;
  for (const [set, list] of [['test', flats], ['barrio', barrio.buildings.filter((bp) => bp.lot.kind === 'apartments' && flatKind(bp) > 0)]]) {
    for (const bp of list) for (const c of units(bp).dwellings) {
      const g = (t) => c.rooms.find((r) => r.type === t), liv = g('living'), bed = g('bedroom'), kit = g('kitchen'), bath = g('bathroom'), name = `${set} ${bp.id} flat of floor ${c.floors[0]}`;
      n++;
      if (area(kit) < area(bath) - 1e-6) problems.push(`${name}: the kitchen (${fmt(kit)}) is smaller than the bath (${fmt(bath)})`);
      if (rd(liv.rect) < 3.0 - 1e-6) problems.push(`${name}: a living room ${rd(liv.rect).toFixed(2)} m deep`);
      if (rd(bed.rect) < 2.8 - 1e-6) problems.push(`${name}: a bedroom ${rd(bed.rect).toFixed(2)} m deep`);
      if (Math.abs(rw(kit.rect) - rw(bath.rect)) < 1e-6) {                                  // the bath cut across the back of the kitchen band: the kitchen is the deeper of the two
        across++;
        if (rd(kit.rect) < 1.7 - 1e-6 || rd(kit.rect) <= rd(bath.rect)) problems.push(`${name}: a ${fmt(kit)} kitchen behind a ${fmt(bath)} bath is a galley`);
      }
    }
  }
  assert.ok(n >= 20 && across >= 8, `${n} flats, ${across} with the bath across the kitchen band: the lots no longer exercise the case (the barrio's L06 and L71)`);
  assert.deepEqual(problems, []);
});

test('a home above a shop has a bedroom: a living room (or the bedroom is the studio), a kitchen, a bedroom and a bathroom upstairs, whatever the storeys, and the barrio has no shop home without one', () => {
  assert.ok(shopHomes.length >= 40, `${shopHomes.length} homes above a shop`);
  for (const { bp } of shopHomes) {
    const name = `${bp.id} (${bp.lot.kind} ${bp.lot.w} x ${bp.lot.d}, ${bp.shell.F} floors)`, up = bp.rooms.filter((r) => r.floor >= 1 && !r.outdoor && !r.core);
    for (const t of ['kitchen', 'bathroom', 'bedroom']) assert.ok(up.some((r) => r.type === t), `${name}: no ${t} upstairs`);
    assert.ok(up.some((r) => r.type === 'living') || up.filter((r) => r.type === 'bedroom').some((r) => r.floor === 1 && r.rect.x1 - r.rect.x0 > 3.5), `${name}: no living room and no studio`);
  }
});

const oneStorey = shopHomes.filter(({ bp }) => bp.shell.F === 2);        // the shop, ONE home floor, the roof: planned as a flat

test('the one home floor over a shop is a flat: its bedroom is at least 1.9 m wide and 5.5 m2, has a window and a door of its own (no arch), and is in the shop\'s household', () => {
  assert.ok(oneStorey.length >= 25, `${oneStorey.length} one-storey shop homes`);
  for (const { bp, ctx: c } of oneStorey) {
    const U = units(bp), name = `${bp.id} (${bp.lot.kind} ${bp.lot.w} x ${bp.lot.d})`, beds = U.rooms.filter((r) => r.type === 'bedroom' && r.floor === 1);
    assert.equal(beds.length, 1, `${name}: ${beds.length} bedrooms`);
    const [bed] = beds, w = Math.min(rw(bed.rect), rd(bed.rect)), a = rw(bed.rect) * rd(bed.rect);
    assert.ok(w >= FLAT_BED_W - 1e-6 && a >= FLAT_BED_AREA - 1e-6, `${name}: the bedroom is ${rw(bed.rect).toFixed(2)} x ${rd(bed.rect).toFixed(2)} (${a.toFixed(1)} m2)`);
    assert.ok(bp.windows.some((x) => x.room === bed.id), `${name}: the bedroom has no window`);
    assert.ok(bp.doors.filter((d) => d.rooms.includes(bed.id)).every((d) => d.kind !== 'arch'), `${name}: an arch into the bedroom`);
    // the shopkeeper sleeps in the bed their own household owns
    const rng = furnishRng(c, bp), hhs = new Map(), shop = bp.rooms.find((r) => r.floor === 0 && (r.type === 'shop' || r.type === 'workshop'));
    assert.equal(householdForRoom(rng, bp, bed, hhs, null).id, householdForRoom(rng, bp, shop, hhs, null).id, `${name}: the bedroom is not in the shop's household`);
  }
});

test('the flat over a shop: the way from the landing to the kitchen, the dining room and the living room does not cross the bedroom, a living room beside the bedroom is 6 m2 at least, and the lots show all four plans', () => {
  const kinds = new Set();
  for (const { bp } of oneStorey) {
    const U = units(bp), name = `${bp.id} (${bp.lot.kind} ${bp.lot.w} x ${bp.lot.d})`, bed = U.rooms.find((r) => r.type === 'bedroom' && r.floor === 1);
    // from the landing, every living room, dining room and kitchen is reached without crossing the bedroom (the bath may be off it)
    const landing = U.rooms.find((r) => r.floor === 1 && r.core), seen = new Set([landing.id]), q = [landing.id];
    while (q.length) for (const id of U.nb.get(q.pop())) if (id !== bed.id && !seen.has(id) && U.byId.get(id).floor === 1) { seen.add(id); q.push(id); }
    for (const r of U.rooms) if (r.floor === 1 && ['living', 'dining', 'kitchen'].includes(r.type)) assert.ok(seen.has(r.id), `${name}: the ${r.type} is reached only through the bedroom`);
    // which plan: [living | bedroom] side by side in the front band (split); the front band is the living room and the bedroom is behind the kitchen (stack); the front band is the bedroom,
    // with a living room beside the stair (band) or none (studio)
    const living = U.rooms.find((r) => r.floor === 1 && r.type === 'living'), kit = U.rooms.find((r) => r.floor === 1 && r.type === 'kitchen');
    const plan = !living ? 'studio' : Math.abs(living.rect.z0 - bed.rect.z0) < 0.02 && Math.abs(living.rect.z1 - bed.rect.z1) < 0.02 ? 'split' : kit.rect.z1 < bed.rect.z0 ? 'band' : 'stack';
    if (plan === 'split') assert.ok(rw(living.rect) * rd(living.rect) >= FLAT_LIVING_AREA - 1e-6, `${name}: the living room beside the bedroom is ${rw(living.rect).toFixed(2)} x ${rd(living.rect).toFixed(2)} (under ${FLAT_LIVING_AREA} m2)`);
    kinds.add(plan);
  }
  assert.deepEqual([...kinds].sort(), ['band', 'split', 'stack', 'studio'], 'the lots exercise all four plans of a flat');
});
