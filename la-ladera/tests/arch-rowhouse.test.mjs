// A2: rowhouse plans (js/arch/layouts.js `rowhouseGeo`, review R4-007: "the rowhouses share one plan: 4 m2 kitchens, the same tiny second bedroom").
//  * a kitchen of at least 5 m2 beside a dining room, a bathroom in a strip behind the stair on every storey, bedrooms with room for a real bed (a single bed is 0.9 x 1.9 m
//    with 0.5 m beside it): two beside the stair, or one long one where the second would fall under 5 m2;
//  * the lots differ: the stair against the party wall or on either side, a bathroom strip and a front room of different depths, one or two bedrooms beside the stair.
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
const oneUp = (bp) => of(bp, 'bedroom', 1).length === 2;                                  // upstairs: the front bedroom and ONE long one beside the stair

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
  for (const r of of(bp, 'bedroom')) { const [short, long] = sides(r); need(area(r) >= 5.0 - 1e-9 && short >= 1.55 && long >= 2.5, `bedroom ${r.id} ${short.toFixed(2)} x ${long.toFixed(2)}`); }
  need(of(bp, 'bedroom', 1).length >= 2 && of(bp, 'bedroom', 1).length <= 3, `${of(bp, 'bedroom', 1).length} bedrooms upstairs`);
  // the roof round the stair head: no sliver of terrace (a loft, a clothes line and a chair need a room to stand in)
  for (const t of of(bp, 'terrace')) need(area(t) >= 3.95 && sides(t)[0] >= 1.2, `terrace ${t.id} ${sides(t)[0].toFixed(2)} x ${sides(t)[1].toFixed(2)}`);
  return out;
}

test('every rowhouse of the barrio has a kitchen of at least 5 m2, a bathroom behind the stair on both storeys and bedrooms with room for a bed', () => {
  assert.ok(rows.length >= 20, `${rows.length} rowhouses`);
  const bad = rows.flatMap((bp) => problems(bp));
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} problems`);
});

test('the rowhouses of the barrio do not share one plan: one or two bedrooms beside the stair, the stair on either side, bathroom strips and front rooms of different depths', () => {
  const sigs = new Map(), bd = [], df = [];
  for (const bp of rows) {
    const b = bathOf(bp, 0), l = of(bp, 'living', 0)[0], key = `${oneUp(bp) ? 'one-long-bedroom' : 'two-bedrooms'} ${coreLeftOf(bp) ? 'stair-left' : 'stair-right'} strip${Math.round((b.rect.z1 - b.rect.z0) * 4)}`;
    sigs.set(key, (sigs.get(key) ?? 0) + 1); bd.push(b.rect.z1 - b.rect.z0); df.push(l.rect.z1 - l.rect.z0);
  }
  const show = [...sigs].map(([k, n]) => `${k}:${n}`).join(', ');
  assert.ok(sigs.size >= 4, `${sigs.size} distinct plans: ${show}`);
  for (const w of ['one-long-bedroom', 'two-bedrooms', 'stair-left', 'stair-right']) assert.ok([...sigs].filter(([k]) => k.includes(w)).reduce((a, [, n]) => a + n, 0) >= 4, `fewer than four ${w} plans: ${show}`);
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

test('sweep: from 8.5 m deep and 4.2 m wide up, every rowhouse plan keeps its kitchen at 5 m2, its bedrooms at 5 m2, its bathroom behind the stair, and is deterministic', () => {
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
  assert.ok(one > 100 && two > 100 && left > 100 && right > 100, `variants: one long bedroom ${one}, two ${two}, stair left ${left}, right ${right}`);
  const lot = { ...base, w: 4.5, d: 9, floors: 2, party: parties[3], seed: 7 };
  assert.equal(JSON.stringify(planBuilding(makeCtx([]), lot).rooms), JSON.stringify(planBuilding(makeCtx([]), lot).rooms), 'the same lot plans the same twice');
});

test('the middle bedroom of a rowhouse floor keeps a free strip for a bed: both its short-wall doors sit at the stair end and 0.8 m or more of wall is clear beyond them (R4-103)', () => {
  const problems = [];
  let n = 0;
  for (const bp of rows) for (const r of bp.rooms) {
    if (r.type !== 'bedroom' || r.floor < 1) continue;
    const ds = bp.doors.filter((d) => !d.ext && d.rooms.includes(r.id) && d.wall.dir === 'x');   // doors in the short walls (between rooms one behind the other)
    if (ds.length !== 2 || Math.abs(ds[0].z - ds[1].z) < 1) continue;                           // the middle bedroom has one in the wall to the front room and one in the wall to the back room (the front bedroom's two are on one wall)
    const core = bp.rooms.find((q) => q.core && q.floor === r.floor);
    if (!core) { problems.push(`${r.id}: no stair on its floor`); continue; }
    n++;
    const low = (core.rect.x0 + core.rect.x1) / 2 < (r.rect.x0 + r.rect.x1) / 2;                // the stair is on the low-x side of the room
    const free = low ? r.rect.x1 - Math.max(...ds.map((d) => d.x + d.w / 2)) : Math.min(...ds.map((d) => d.x - d.w / 2)) - r.rect.x0;
    if (free < 0.8) problems.push(`${r.id}: ${free.toFixed(2)} m of free wall beyond its doors (stair on the ${low ? 'low' : 'high'} side, room ${(r.rect.x1 - r.rect.x0).toFixed(2)} m wide)`);
  }
  assert.ok(n >= 10, `${n} middle bedrooms with two short-wall doors on the real barrio`);
  assert.deepEqual(problems, []);
});

test('a lot too small for the strip keeps the plain house plan: a rowhouse under 8.2 m deep or narrower than 4.1 m still plans, rooms reachable, as before', () => {
  const ctx = makeCtx([]), base = { id: 'S', name: 'small', kind: 'rowhouse', x: 0, y: 0, z: 0, rotY: 0, fh: 2.8, front: 'S0', entrance: { side: 'front', u: 0 }, style: {}, party: { left: true, right: true, back: false } };
  for (const [w, d] of [[4.5, 8.0], [4.5, 7.5], [3.8, 9], [4.0, 10]]) {
    const bp = planBuilding(ctx, { ...base, w, d, floors: 2, seed: 3, roofAccess: false });
    assert.ok(bp.rooms.length >= 3 && bp.doors.some((dr) => dr.ext), `${w}x${d}: a plan with a front door`);
    assert.ok(of(bp, 'kitchen').length >= 1, `${w}x${d}: a kitchen`);
  }
});
