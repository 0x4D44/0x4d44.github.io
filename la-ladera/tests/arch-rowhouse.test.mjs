// A2: rowhouse plans (js/arch/layouts.js `rowhouseGeo`, review R4-007: "the rowhouses share one plan: 4 m2 kitchens, the same tiny second bedroom").
//  * a kitchen of at least 5 m2 beside a dining room, a bathroom in a strip behind the stair on every storey, bedrooms with room for a real bed (a single bed is 0.9 x 1.9 m
//    with 0.5 m beside it): the front band is cut along the stair wall into two where both halves keep 4.8 m2 and 1.8 m, else it is one bedroom; the rest column is the one hub room
//    (landing -> hub -> bath), so a bedroom is a leaf of the door tree and the bath is never behind one (round 6 R4-301 / R1-101);
//  * the lots differ: the stair against the party wall or on either side, a bathroom strip and a front room of different depths, one or two bedrooms on a floor.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-rowhouse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from './headless.mjs';
import { makeCtx } from './arch-lib.mjs';
import { planBuilding } from '../js/arch/index.js';
import { CASETA_T } from '../js/arch/roof.js';

const real = await buildData({ furnish: false });
const rows = real.buildings.filter((bp) => bp.lot.kind === 'rowhouse');
const area = (r) => (r.rect.x1 - r.rect.x0) * (r.rect.z1 - r.rect.z0);
const sides = (r) => [r.rect.x1 - r.rect.x0, r.rect.z1 - r.rect.z0].sort((a, b) => a - b);        // [short, long]
const of = (bp, type, floor) => bp.rooms.filter((r) => r.type === type && (floor == null || r.floor === floor));
const stairwell = (bp) => of(bp, 'stairwell', 0)[0];
const bathOf = (bp, floor) => of(bp, 'bathroom', floor)[0];
const coreLeftOf = (bp) => { const c = stairwell(bp).rect; return (c.x0 + c.x1) / 2 < 0; };
const oneUp = (bp) => of(bp, 'bedroom', 1).length === 1;                                  // upstairs: the front band is ONE bedroom (it cannot be cut in two at 4.8 m2 and 1.8 m)

/** What a plan has to give, whatever the lot: the problems of one rowhouse plan with at least two storeys. */
function problems(bp, tag = bp.id) {
  const out = [], need = (ok, msg) => { if (!ok) out.push(`${tag}: ${msg}`); };
  const kitchens = of(bp, 'kitchen', 0), core = stairwell(bp), bath0 = bathOf(bp, 0), bath1 = bathOf(bp, 1);
  need(kitchens.length === 1, `${kitchens.length} kitchens on the ground floor`);
  if (kitchens.length === 1) need(area(kitchens[0]) >= 5.0 && sides(kitchens[0])[0] >= 1.55, `kitchen ${area(kitchens[0]).toFixed(2)} m2, ${sides(kitchens[0])[0].toFixed(2)} m wide`);
  need(of(bp, 'dining', 0).length === 1, `${of(bp, 'dining', 0).length} dining rooms on the ground floor`);
  for (const dn of of(bp, 'dining', 0)) need(area(dn) >= 3.5 && sides(dn)[1] >= 2.1, `dining room ${sides(dn)[0].toFixed(2)} x ${sides(dn)[1].toFixed(2)}`);
  for (const lv of of(bp, 'living', 0)) need(area(lv) >= 9.3 && sides(lv)[0] >= 2.49, `living room ${sides(lv)[0].toFixed(2)} x ${sides(lv)[1].toFixed(2)} (a 4.2 x 8.5 m lot leaves 3.76 x 2.5 m at the very least)`);
  for (const [k, b] of [[0, bath0], [1, bath1]]) {
    need(!!b, `no bathroom on floor ${k}`);
    if (!b || !core) continue;
    const [short, long] = sides(b);
    need(area(b) >= 2.75 && short >= 1.39 && long >= 1.95, `bathroom ${short.toFixed(2)} x ${long.toFixed(2)} on floor ${k}`);
    // behind the stair: the column of the stairwell, north of it
    need(Math.abs(b.rect.x0 - core.rect.x0) < 1e-6 && Math.abs(b.rect.x1 - core.rect.x1) < 1e-6 && b.rect.z1 <= core.rect.z0 + 1e-6, `the bathroom on floor ${k} is not in the strip behind the stair`);
  }
  for (const r of of(bp, 'bedroom')) { const [short, long] = sides(r); need(area(r) >= 4.8 - 1e-9 && short >= 1.55 && long >= 2.5, `bedroom ${r.id} ${short.toFixed(2)} x ${long.toFixed(2)}`); }       // 4.8 m2 (layouts.js PRIV_BED_AREA): what the narrowest bands give the half over the hall; the bed rule is the 1.55 x 2.5 m, with 0.8 m of wall clear beside the door below
  need(of(bp, 'bedroom', 1).length >= 1 && of(bp, 'bedroom', 1).length <= 3, `${of(bp, 'bedroom', 1).length} bedrooms upstairs`);
  // the household of a private floor: interiors/household.js keys a home's households on the occupants of its rooms, so a floor whose first bedroom is not the family's drops the family from the
  // barrio's roster and moves the name of every household after it (the first cut of the round-6 plan lost it in 14 rowhouses: 50 of the 86 residents changed home)
  for (const k of [...new Set(of(bp, 'bedroom').filter((r) => r.floor >= 1).map((r) => r.floor))]) {
    const fam = of(bp, 'bedroom', k).filter((r) => r.occupant === 'family').length;
    need(fam === 1, `floor ${k} has ${fam} bedrooms of the family household (the family's is the first bedroom of the floor)`);
  }
  // a bedroom is a leaf (round 6, R4-301 and R1-101): ONE door to another room, never onto another bedroom, and 0.8 m or more of the wall that door is in stays clear beside it for the head of a bed (R4-103)
  for (const r of of(bp, 'bedroom')) {
    if (r.floor < 1) continue;
    const ds = bp.doors.filter((d) => !d.ext && d.rooms.includes(r.id) && d.rooms[0] && d.rooms[1]);
    need(ds.length === 1, `bedroom ${r.id} has ${ds.length} doors to other rooms`);
    for (const d of ds) {
      const other = bp.rooms.find((q) => q.id === d.rooms.find((id) => id !== r.id)), x = d.wall.dir === 'x', lo = x ? r.rect.x0 : r.rect.z0, hi = x ? r.rect.x1 : r.rect.z1, at = x ? d.x : d.z;
      const free = Math.max(at - d.w / 2 - lo, hi - at - d.w / 2);
      need(other.type !== 'bedroom', `bedroom ${r.id} opens onto the bedroom ${other.id}`);
      need(free >= 0.8 - 1e-9, `bedroom ${r.id}: its door leaves ${free.toFixed(2)} m of the wall clear`);
    }
  }
  // the hub: on every upstairs floor the landing opens onto the hall (a sitting room when it is big) and the bathroom hangs off the hall, never off a bedroom
  for (const b of of(bp, 'bathroom')) {
    if (b.floor < 1) continue;
    const bd = bp.doors.filter((d) => d.rooms.includes(b.id) && d.rooms[0] && d.rooms[1]), hub = bd.length === 1 ? bp.rooms.find((q) => q.id === bd[0].rooms.find((id) => id !== b.id)) : null, land = bp.rooms.find((q) => q.core && q.floor === b.floor);
    need(!!hub && ['living', 'hall'].includes(hub.type), `the bathroom on floor ${b.floor} opens onto ${hub ? `a ${hub.type}` : 'no single room'}, not onto the hall`);
    need(!hub || !land || bp.doors.some((d) => d.rooms.includes(land.id) && d.rooms.includes(hub.id)), `the hall of floor ${b.floor} has no door onto the landing`);
  }
  // the roof round the stair head: no sliver of terrace (a loft, a clothes line and a chair need a room to stand in)
  for (const t of of(bp, 'terrace')) need(area(t) >= 3.95 && sides(t)[0] >= 1.2, `terrace ${t.id} ${sides(t)[0].toFixed(2)} x ${sides(t)[1].toFixed(2)}`);
  return out;
}

test('every rowhouse of the barrio has a kitchen of at least 5 m2, a bathroom behind the stair on both storeys and bedrooms with room for a bed', () => {
  assert.ok(rows.length >= 20, `${rows.length} rowhouses`);
  const bad = rows.flatMap((bp) => problems(bp));
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} problems`);
});

test('the rowhouses of the barrio do not share one plan: one or two bedrooms on a floor, the stair on either side, bathroom strips and front rooms of different depths', () => {
  const sigs = new Map(), bd = [], df = [];
  for (const bp of rows) {
    const b = bathOf(bp, 0), l = of(bp, 'living', 0)[0], key = `${oneUp(bp) ? 'one-bedroom' : 'two-bedrooms'} ${coreLeftOf(bp) ? 'stair-left' : 'stair-right'} strip${Math.round((b.rect.z1 - b.rect.z0) * 4)}`;
    sigs.set(key, (sigs.get(key) ?? 0) + 1); bd.push(b.rect.z1 - b.rect.z0); df.push(l.rect.z1 - l.rect.z0);
  }
  const show = [...sigs].map(([k, n]) => `${k}:${n}`).join(', ');
  assert.ok(sigs.size >= 4, `${sigs.size} distinct plans: ${show}`);
  // (the one-bedroom floor is the plan of a band too narrow to cut, a rest column under 1.8 m: two lots of the barrio are left with it, and the sweep below keeps both variants)
  for (const w of ['two-bedrooms', 'stair-left', 'stair-right']) assert.ok([...sigs].filter(([k]) => k.includes(w)).reduce((a, [, n]) => a + n, 0) >= 4, `fewer than four ${w} plans: ${show}`);
  assert.ok(Math.max(...bd) - Math.min(...bd) >= 0.3, `bathroom strips ${Math.min(...bd).toFixed(2)}..${Math.max(...bd).toFixed(2)} m deep`);
  assert.ok(Math.max(...df) - Math.min(...df) >= 0.25, `front rooms ${Math.min(...df).toFixed(2)}..${Math.max(...df).toFixed(2)} m deep`);
});

test('the roof terrace round a stair head that stands mid-depth is cut into bands across the plot, not into a sliver behind the stair, and it all still joins up', () => {
  const walkable = rows.filter((bp) => bp.roof?.walkable);
  assert.ok(walkable.length >= 15, `${walkable.length} rowhouses with a walkable roof`);
  for (const bp of walkable) {
    const ts = of(bp, 'terrace'), core = stairwell(bp).rect;
    assert.ok(ts.length >= 2 && ts.length <= 4, `${bp.id}: ${ts.length} terrace rooms`);
    // together they cover the footprint but the caseta (the stair core and its walls), once and without overlap
    const total = ts.reduce((a, r) => a + area(r), 0), g0 = bp.rooms.filter((r) => r.floor === 0);
    const box = { x0: Math.min(...g0.map((r) => r.rect.x0)), x1: Math.max(...g0.map((r) => r.rect.x1)), z0: Math.min(...g0.map((r) => r.rect.z0)), z1: Math.max(...g0.map((r) => r.rect.z1)) };
    const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const foot = (box.x1 - box.x0) * (box.z1 - box.z0), caseta = ov(core.x0 - CASETA_T, core.x1 + CASETA_T, box.x0, box.x1) * ov(core.z0 - CASETA_T, core.z1 + CASETA_T, box.z0, box.z1);
    assert.ok(Math.abs(total - (foot - caseta)) < 0.05, `${bp.id}: terraces ${total.toFixed(2)} m2, footprint ${foot.toFixed(2)} less caseta ${caseta.toFixed(2)}`);
    // every terrace shares an edge with another one (no island), and one of them is reached from the stair head
    for (const t of ts) assert.ok(ts.some((o) => o !== t && (Math.min(o.rect.x1, t.rect.x1) - Math.max(o.rect.x0, t.rect.x0) > 0.5 && (Math.abs(o.rect.z0 - t.rect.z1) < 0.02 || Math.abs(o.rect.z1 - t.rect.z0) < 0.02) || Math.min(o.rect.z1, t.rect.z1) - Math.max(o.rect.z0, t.rect.z0) > 0.5 && (Math.abs(o.rect.x0 - t.rect.x1) < 0.02 || Math.abs(o.rect.x1 - t.rect.x0) < 0.02))), `${bp.id}: ${t.id} is an island`);
    assert.ok(bp.doors.some((d) => d.roof && d.rooms.some((r) => ts.some((t) => t.id === r))), `${bp.id}: no door from the stair head onto a terrace`);
  }
});

test('the stair stands against the party wall when only one side has one, and a lot with none or both gets either side', () => {
  let left = 0, right = 0;
  for (const bp of rows) {
    const p = bp.lot.party;
    if (p.left && !p.right) assert.equal(coreLeftOf(bp), true, `${bp.id}: party wall on the left only`);
    else if (p.right && !p.left) assert.equal(coreLeftOf(bp), false, `${bp.id}: party wall on the right only`);
    else if (coreLeftOf(bp)) left++; else right++;
  }
  assert.ok(left >= 2 && right >= 2, `free choice: ${left} left, ${right} right`);
});

test('sweep: from 8.5 m deep and 4.2 m wide up, every rowhouse plan keeps its kitchen at 5 m2, its bedrooms at 4.8 m2, its bathroom behind the stair, and is deterministic', () => {
  const ctx = makeCtx([]), base = { id: 'S', name: 'sweep', kind: 'rowhouse', x: 0, y: 0, z: 0, rotY: 0, fh: 2.8, front: 'S0', entrance: { side: 'front', u: 0 }, style: {} };
  const parties = [{ left: false, right: false, back: false }, { left: true, right: false, back: false }, { left: false, right: true, back: false }, { left: true, right: true, back: true }];
  const bad = []; let n = 0, one = 0, two = 0, left = 0, right = 0;
  for (const floors of [2, 3]) for (const w of [4.2, 4.4, 4.5, 4.8, 5.2, 5.6]) for (let d = 8.5; d <= 12.0001; d += 0.1) for (const party of parties) {
    const lot = { ...base, w, d: Math.round(d * 10) / 10, floors, party, roofAccess: n % 2 === 0, seed: ++n };
    const tag = `${w}x${lot.d} F${floors} party ${+party.left}${+party.right}`, bp = planBuilding(ctx, lot);
    bad.push(...problems(bp, tag));
    if (oneUp(bp)) one++; else two++;
    if (coreLeftOf(bp)) left++; else right++;
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} problems in ${n} plans`);
  assert.ok(one > 100 && two > 100 && left > 100 && right > 100, `variants: one bedroom ${one}, two ${two}, stair left ${left}, right ${right}`);
  const lot = { ...base, w: 4.5, d: 9, floors: 2, party: parties[3], seed: 7 };
  assert.equal(JSON.stringify(planBuilding(makeCtx([]), lot).rooms), JSON.stringify(planBuilding(makeCtx([]), lot).rooms), 'the same lot plans the same twice');
});

test('TEETH: the plan checks find a bedroom that opens onto another, a bathroom behind a bedroom and a door in the middle of a narrow bedroom, planted in copies of a real rowhouse (which is clean) (R4-103, R4-301)', () => {
  const split = rows.find((bp) => of(bp, 'bedroom', 1).length === 2 && Math.min(...of(bp, 'bedroom', 1).map((r) => sides(r)[0])) < 2.3);
  assert.ok(split, 'a rowhouse of the barrio whose floor is cut into two bedrooms, one of them under 2.3 m wide');
  assert.deepEqual(problems(split), []);
  const [a, b] = of(split, 'bedroom', 1), narrow = sides(a)[0] < sides(b)[0] ? a : b, bath = bathOf(split, 1);
  const copy = (f) => ({ ...split, doors: f(split.doors.map((d) => ({ ...d }))) });
  const templ = split.doors.find((d) => !d.ext && d.rooms[0] && d.rooms[1] && d.rooms.includes(a.id));
  // a door between the two bedrooms of the floor: neither is a leaf any more, and one opens onto the other
  const joined = problems(copy((ds) => [...ds, { ...templ, id: 'X.d99', rooms: [a.id, b.id] }]));
  assert.ok(joined.some((s) => s.includes(`bedroom ${a.id} has 2 doors`)) && joined.some((s) => s.includes(`opens onto the bedroom`)), joined.join('; '));
  // the bathroom's door onto a bedroom instead of the hall: the owner's complaint, landing - bedroom - bath
  const behind = problems(copy((ds) => ds.map((d) => (d.rooms.includes(bath.id) ? { ...d, rooms: [a.id, bath.id] } : d))));
  assert.ok(behind.some((s) => s.includes('opens onto a bedroom, not onto the hall')), behind.join('; '));
  // the narrow bedroom's door in the middle of its wall: two 0.5 m strips, no room for the head of a bed
  const centred = problems(copy((ds) => ds.map((d) => {
    if (!d.rooms.includes(narrow.id)) return d;
    const x = d.wall.dir === 'x';
    return { ...d, [x ? 'x' : 'z']: x ? (narrow.rect.x0 + narrow.rect.x1) / 2 : (narrow.rect.z0 + narrow.rect.z1) / 2 };
  })));
  assert.ok(centred.some((s) => s.includes(`bedroom ${narrow.id}: its door leaves`)), centred.join('; '));
  // the family's bedroom of the floor losing its household (the roster of the barrio's households hangs on it)
  const lost = problems({ ...split, rooms: split.rooms.map((r) => (r.type === 'bedroom' && r.floor === 1 && r.occupant === 'family' ? { ...r, occupant: undefined } : r)) });
  assert.ok(lost.some((s) => s.includes('floor 1 has 0 bedrooms of the family household')), lost.join('; '));
  // and the real barrio has bedrooms to be checked
  assert.ok(rows.reduce((n, bp) => n + of(bp, 'bedroom').filter((r) => r.floor >= 1).length, 0) >= 30, 'bedrooms upstairs in the rowhouses of the barrio');
});

test('a lot too small for the strip keeps the plain house plan: a rowhouse under 8.2 m deep or narrower than 4.1 m still plans, rooms reachable, as before', () => {
  const ctx = makeCtx([]), base = { id: 'S', name: 'small', kind: 'rowhouse', x: 0, y: 0, z: 0, rotY: 0, fh: 2.8, front: 'S0', entrance: { side: 'front', u: 0 }, style: {}, party: { left: true, right: true, back: false } };
  for (const [w, d] of [[4.5, 8.0], [4.5, 7.5], [3.8, 9], [4.0, 10]]) {
    const bp = planBuilding(ctx, { ...base, w, d, floors: 2, seed: 3, roofAccess: false });
    assert.ok(bp.rooms.length >= 3 && bp.doors.some((dr) => dr.ext), `${w}x${d}: a plan with a front door`);
    assert.ok(of(bp, 'kitchen').length >= 1, `${w}x${d}: a kitchen`);
  }
});
