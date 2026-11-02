// Round-6 fit-out (R4-304, R4-305, R4-307, R4-312): a table has a chair drawn up to it, a barber's chairs stand a barber's width apart each before its own mirror, nothing tall hides the board of a
// classroom, and the workshop whose name says welding is fitted for welding (a metal bench, two gas bottles, bar stock, its own sign and price list), not for motorbikes.
// Before round 6: 45 of the 144 tables of the barrio had no chair (25 dining rooms, a 6-seat table in L08's living room), L05's barber chairs stood 5 cm apart, a pair of lockers stood in front of
// the chalkboard of L00.f0.r4, and 'Taller de Soldadura El Chispa' had two motorbikes, a stack of tyres and a sign that read TALLER DE MOTOS.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-fitout.test.mjs
//   A3_SABOTAGE=bare|crowd|board|motorbike   corrupts the furnished plan on purpose, so the matching test must FAIL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { CATALOG } from '../js/interiors/catalog.js';

const SAB = process.env.A3_SABOTAGE;
const { bps } = await furnishedBatch({ real: true });
const EATING = /^table_(formica_4|formica_6|wood_6|round_small)$/, SITS = new Set(['chair', 'stool', 'bench']);
const floorOf = (bp, rid) => bp.furniture.filter((f) => f.room === rid && f.kind === 'floor' && !f.parent);
const span = (f) => { const c = Math.abs(Math.cos(f.ry)), s = Math.abs(Math.sin(f.ry)); return { hx: (c * f.w + s * f.d) / 2, hz: (s * f.w + c * f.d) / 2 }; };
if (SAB === 'bare') for (const bp of bps) bp.furniture = bp.furniture.filter((f) => !SITS.has(CATALOG[f.name]?.arch));                                // every chair gone
if (SAB === 'crowd') for (const bp of bps) for (const t of bp.furniture.filter((f) => EATING.test(f.name))) { t.x += 0.3; bp.furniture = bp.furniture.filter((f) => !(SITS.has(CATALOG[f.name]?.arch) && f.room === t.room && Math.hypot(f.x - t.x, f.z - t.z) < 1.2)); }
if (SAB === 'board') for (const bp of bps) for (const b of bp.furniture.filter((f) => f.name === 'decal:chalkboard')) bp.furniture.push({ ...b, id: b.id + '.cab', name: 'locker_pair', kind: 'floor', parent: null, h: 1.8, w: b.w * 0.6, d: 0.5, y: b.y - 0.95, z: b.z, x: b.x });
if (SAB === 'motorbike') for (const bp of bps) if (/solda/i.test(bp.lot?.name ?? '')) for (const f of bp.furniture) if (f.name === 'decal:sign_soldadura') f.name = 'decal:sign_taller';

// ---------------------------------------------------------------- tables and their chairs (R4-304)
/** Every table that people eat at, with the chairs, stools and benches within a hand's breadth of its edge (in its own frame). */
const tables = [];
for (const bp of bps) {
  for (const r of bp.rooms) {
    const fl = floorOf(bp, r.id);
    for (const t of fl.filter((f) => EATING.test(f.name))) {
      const c = Math.cos(t.ry), s = Math.sin(t.ry);
      const seats = fl.filter((f) => f !== t && SITS.has(CATALOG[f.name]?.arch) && Math.abs((f.x - t.x) * c - (f.z - t.z) * s) <= t.w / 2 + 0.55 && Math.abs((f.x - t.x) * s + (f.z - t.z) * c) <= t.d / 2 + 0.55).length;
      tables.push({ id: `${r.id} ${t.name}`, room: r.id, type: r.type, seats });
    }
  }
}
test('no table stands without a chair: a table nobody can sit at is taken out or given its chairs', () => {
  assert.ok(tables.length >= 100, `${tables.length} tables to look at`);
  const bare = tables.filter((t) => t.seats === 0);
  console.log(`# tables: ${tables.length}, ${bare.length} without a chair, ${tables.filter((t) => t.seats >= 2).length} with two or more`);
  assert.equal(bare.length, 0, `${bare.length} tables without a chair: ${bare.slice(0, 10).map((t) => t.id).join(', ')}`);
});
test('most tables seat two or more (a 1 m table, two on a side), and every dining room has a chair or a stool', () => {
  const two = tables.filter((t) => t.seats >= 2).length / tables.length;
  assert.ok(two >= 0.6, `${(two * 100).toFixed(0)}% of ${tables.length} tables seat two or more (30% before round 6)`);
  const dining = bps.flatMap((bp) => bp.rooms.filter((r) => r.type === 'dining').map((r) => ({ id: r.id, chairs: floorOf(bp, r.id).filter((f) => SITS.has(CATALOG[f.name]?.arch)).length, tables: floorOf(bp, r.id).filter((f) => EATING.test(f.name)).length })));
  const empty = dining.filter((d) => d.tables && !d.chairs);
  assert.ok(dining.length >= 20, `${dining.length} dining rooms to look at`);
  assert.equal(empty.length, 0, `${empty.length} dining rooms with a table and no chair or stool: ${empty.slice(0, 10).map((d) => d.id).join(', ')}`);
});

// ---------------------------------------------------------------- the barber's chairs (R4-312)
test('the chairs of a barber shop stand 0.4 m or more apart, each in front of its own mirror', () => {
  const shops = bps.flatMap((bp) => bp.rooms.filter((r) => r.type === 'shop' && bp.interior?.rooms?.[r.id]?.shopType === 'peluqueria').map((r) => ({ bp, r })));
  let pairs = 0;
  for (const { bp, r } of shops) {
    const chairs = bp.furniture.filter((f) => f.room === r.id && f.name === 'barber_chair'), mirrors = bp.furniture.filter((f) => f.room === r.id && f.name === 'mirror_barber');
    if (chairs.length < 2) continue;
    const along = Math.abs(Math.sin(chairs[0].ry)) > 0.7 ? 'z' : 'x';                      // the chairs stand at a wall: the gap is measured along it
    const us = chairs.map((c) => c[along]).sort((p, q) => p - q);
    us.slice(1).forEach((u, i) => { pairs++; assert.ok(u - us[i] - chairs[0].w >= 0.4, `${r.id}: two barber chairs ${(u - us[i] - chairs[0].w).toFixed(2)} m apart`); });
    for (const c of chairs) {
      const off = Math.min(...mirrors.map((m) => Math.abs(m[along] - c[along])));
      assert.ok(off <= 0.25, `${r.id}: a barber chair stands ${off.toFixed(2)} m off the middle of its mirror`);
    }
  }
  assert.ok(pairs >= 1, `${pairs} pairs of barber chairs to look at`);
});

// ---------------------------------------------------------------- the board of a classroom (R4-305)
test('nothing tall stands in front of the chalkboard of a classroom (a pair of lockers hid the end of it in L00.f0.r4)', () => {
  const hidden = [];
  let boards = 0;
  for (const bp of bps) {
    for (const b of bp.furniture.filter((f) => f.name === 'decal:chalkboard')) {
      boards++;
      const nx = b.wallSide === '-x' || b.wallSide === '+x' ? 1 : 0;
      for (const f of floorOf(bp, b.room)) {
        if (f.h < 0.9) continue;
        const { hx, hz } = span(f);
        const along = nx ? Math.min(b.z + b.w / 2, f.z + hz) - Math.max(b.z - b.w / 2, f.z - hz) : Math.min(b.x + b.w / 2, f.x + hx) - Math.max(b.x - b.w / 2, f.x - hx);
        const dist = nx ? Math.abs(f.x - b.x) - hx : Math.abs(f.z - b.z) - hz;
        if (along > 0.3 && dist < 0.35) hidden.push(`${b.room}: ${f.name} (${f.h} m) hides ${along.toFixed(2)} m of the board`);
      }
    }
  }
  assert.ok(boards >= 4, `${boards} chalkboards to look at`);
  assert.equal(hidden.length, 0, hidden.join('; '));
});

// ---------------------------------------------------------------- a welder's workshop (R4-307)
const workshops = bps.filter((bp) => bp.lot?.kind === 'workshop').map((bp) => ({ bp, name: bp.lot.name ?? '', room: bp.rooms.find((r) => r.type === 'workshop') })).filter((w) => w.room);
const kit = (w) => { const names = w.bp.furniture.filter((f) => f.room === w.room.id).map((f) => f.name); const has = (re) => names.filter((n) => re.test(n)).length; return { names, has }; };
test("'Taller de Soldadura' is fitted for welding: a metal bench, two gas bottles, bar stock, its own sign and price list and no motorbike", () => {
  const welders = workshops.filter((w) => /solda/i.test(w.name));
  assert.ok(welders.length >= 1, `${workshops.length} workshops, ${welders.length} of them welders`);
  for (const w of welders) {
    const { names, has } = kit(w), where = `${w.bp.id} ${w.name}`;
    assert.ok(has(/^workbench_metal$/) >= 1, `${where}: a welding bench`);
    assert.ok(has(/^gas_cylinder$/) >= 2, `${where}: two gas bottles`);
    assert.ok(has(/^pipes_bundle$/) >= 1, `${where}: bar stock`);
    assert.ok(names.includes('decal:sign_soldadura'), `${where}: its own sign, not the mechanic's`);
    assert.ok(names.includes('decal:price_solda'), `${where}: its own price list, not the mechanic's`);
    assert.equal(has(/^(motorbike|tire_stack)$|^decal:(sign|price)_taller$/), 0, `${where}: a motorbike, tyres or the mechanic's sign in a welder's shop: ${names.filter((n) => /motorbike|tire|_taller/.test(n)).join(', ')}`);
  }
});
test("a mechanic's workshop keeps its motorbikes and its sign: the welder's fit-out is chosen by the name over the door", () => {
  const mechanics = workshops.filter((w) => !/solda/i.test(w.name));
  assert.ok(mechanics.length >= 1, `${workshops.length} workshops, ${mechanics.length} of them mechanics`);
  for (const w of mechanics) {
    const { names, has } = kit(w);
    assert.ok(has(/^motorbike$/) >= 1 && names.includes('decal:sign_taller'), `${w.bp.id} ${w.name}: motorbikes and the sign TALLER DE MOTOS`);
    assert.equal(has(/^(gas_cylinder|pipes_bundle)$|^decal:(sign|price)_solda(dura)?$/), 0, `${w.bp.id} ${w.name}: a welder's gas bottles, bar stock or lettering in a motorbike shop`);
  }
});
test('the bench of a workshop carries tools and tins, not a row of identical coils of rope', () => {
  for (const w of workshops) {
    const bench = w.bp.furniture.filter((f) => f.room === w.room.id && f.name === 'workbench_metal').map((f) => f.id);
    const stock = (w.bp.goods ?? []).filter((g) => bench.includes(g.parent));
    assert.ok(!stock.some((g) => g.name === 'goods_rope_coil'), `${w.bp.id} ${w.name}: rope on the bench`);
  }
});
