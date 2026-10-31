// INTERIORS: a school is furnished as a school, whatever plan A2 gives it (js/interiors/special.js, routed by index.js `pickFurnisher`):
//   - every classroom has a board on a wall and a class of desks facing it, with the teacher's desk,
//   - every lavatory has toilets, a basin and a mirror and no shower or towel rail,
//   - the staff room has a table to sit at and chairs round it,
//   - the entrance hall and the galleries are a school's (a bench, a notice, the flag), not a household's (shoe rack, shoes, wedding and family photographs),
//   - nothing a home has (a bed, sofa, stove, fridge, television, washing machine) stands anywhere in the building.
// Sampled over every school A2's planner can make: the barrio's own (L00) and A2's five test schools (tests/arch-lib.mjs `testLots`: other sizes, floors, party walls and doors),
// so a replan of the school is covered as soon as it lands.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-school.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch, catalogOf } from './interiors-lib.mjs';

const real = (await furnishedBatch({ real: true, lots: false })).bps.filter((b) => b.lot?.kind === 'school');
const lots = (await furnishedBatch({ lots: 'only', kinds: ['school'] })).bps;
const schools = [...real, ...lots].filter((bp) => bp.rooms.some((rm) => rm.type === 'classroom'));          // (a lot too narrow for the school plan is planned as a house: A2's fallback, not a school to judge)
const synth = (await furnishedBatch({ n: 160, real: false, lots: false })).bps.filter((b) => b.lot?.kind === 'school');          // my own plans (whatever A3_PLANS says): small, odd classrooms with windows and doors anywhere

const recs = (bp, rm) => bp.furniture.filter((r) => r.room === rm.id);
const count = (rs, ...names) => rs.filter((r) => names.includes(r.name)).length;
const area = (rm) => (rm.rect.x1 - rm.rect.x0) * (rm.rect.z1 - rm.rect.z0);
const where = (bp, rm) => `${bp.id} ${rm.id} ${rm.type}${rm.name ? ` "${rm.name}"` : ''} ${area(rm).toFixed(1)} m2`;
const inBuildings = (bps, pred) => bps.flatMap((bp) => bp.rooms.filter((rm) => !rm.core && pred(rm, bp)).map((rm) => ({ bp, rm, rs: recs(bp, rm) })));
const inSchools = (pred) => inBuildings(schools, pred);
const staffRoom = (rm) => rm.type === 'office' && /profesor|docente|maestr/i.test(rm.name ?? '');
const facing = (r) => [Math.sin(r.ry), Math.cos(r.ry)];
const HOME = /^(bed_|sofa_|armchair_|wardrobe_|mattress_|stove_gas|fridge|tv_|washing_machine|shower_|towel_rail|shoe_rack|shoes_pair|clothesline|drying_rack|cage_canary|altar_home|rocking_chair|pot_rack_wall|kitchen_upper|sink_kitchen|sink_small|counter_base|gas_cylinder)/;
const FAMILY = /^decal:photo_(fam|family|wedding)/;

test('there are schools to look at, and rooms of every kind in them', () => {
  assert.ok(real.length >= 1, 'the barrio has no school');
  assert.ok(schools.length >= 5, `only ${schools.length} schools with a school plan`);
  const n = (pred) => inSchools(pred).length;
  assert.ok(n((rm) => rm.type === 'classroom') >= 12, 'too few classrooms to say anything');
  assert.ok(n((rm) => rm.type === 'bathroom') >= 6, 'too few lavatories');
  assert.ok(n(staffRoom) >= 4, 'too few staff rooms');
  assert.ok(n((rm) => rm.type === 'hall' || rm.type === 'entry') >= 4, 'too few entrance halls');
  assert.ok(n((rm) => rm.type === 'corridor') >= 8, 'too few galleries');
});

test('every classroom has a board, its desks face it, and the teacher\'s desk; a school\'s classroom seats a class', () => {
  const bad = [];
  let desks = 0, rooms = 0, odd = 0, oddSeated = 0;
  for (const [bps, a2] of [[schools, true], [synth, false]]) for (const { bp, rm, rs } of inBuildings(bps, (rm) => rm.type === 'classroom')) {
    const board = rs.find((r) => r.name === 'decal:chalkboard'), ds = rs.filter((r) => r.name === 'desk_school');
    rooms++; desks += ds.length;
    if (!a2) { odd++; if (ds.length) oddSeated++; }
    if (!board) { bad.push(`${where(bp, rm)}: no board`); continue; }
    const need = a2 ? Math.min(6, Math.floor(area(rm) / 3)) : 0;                 // 6 desks make a class (people/classroom.js MIN_DESKS); my own odd 2.5 m rooms need no more than their board
    if (ds.length < need) bad.push(`${where(bp, rm)}: ${ds.length} desks, wanted ${need}`);
    const [bx, bz] = facing(board);
    const away = ds.filter((d) => { const [dx, dz] = facing(d); return dx * bx + dz * bz > -0.9; });
    if (away.length) bad.push(`${where(bp, rm)}: ${away.length} of ${ds.length} desks do not face the board`);
    if (a2 && !count(rs, 'desk_teacher')) bad.push(`${where(bp, rm)}: no teacher's desk`);
  }
  assert.ok(rooms >= 30 && desks >= 200, `only ${rooms} classrooms with ${desks} desks to look at`);
  assert.deepEqual(bad, []);
  assert.ok(odd >= 20 && oddSeated / odd >= 0.75, `${oddSeated} of ${odd} small odd classrooms seat anybody (a shallow room starts its rows just past the teacher's desk)`);
});

test('every lavatory has toilets, a basin and a mirror, and no shower or towel rail', () => {
  const bad = [];
  for (const { bp, rm, rs } of inSchools((rm) => rm.type === 'bathroom')) {
    const wc = count(rs, 'toilet'), basins = count(rs, 'basin_pedestal', 'basin_vanity'), mirrors = count(rs, 'mirror_bath', 'mirror_wall'), wet = count(rs, 'shower_tray', 'shower_small', 'shower_head_electric', 'towel_rail');
    if (wc < (area(rm) >= 5 ? 2 : 1)) bad.push(`${where(bp, rm)}: ${wc} toilets`);
    if (!basins) bad.push(`${where(bp, rm)}: no basin`);
    if (!mirrors) bad.push(`${where(bp, rm)}: no mirror`);
    if (wet) bad.push(`${where(bp, rm)}: ${wet} shower fittings or towel rails in a school lavatory`);
  }
  assert.deepEqual(bad, []);
});

test('the staff room has a table to sit at, chairs round it and the school\'s notices', () => {
  const bad = [];
  for (const { bp, rm, rs } of inSchools(staffRoom)) {
    const tables = rs.filter((r) => /^(table_|folding_table|desk_)/.test(r.name)), seats = rs.reduce((n, r) => n + (catalogOf(r)?.seat?.[1] ?? 0), 0);
    if (!tables.length) bad.push(`${where(bp, rm)}: no table`);
    if (seats < 4) bad.push(`${where(bp, rm)}: ${seats} seats`);
    if (!rs.some((r) => /^decal:(schedule|notice_)/.test(r.name))) bad.push(`${where(bp, rm)}: no timetable or notice on the wall`);
  }
  assert.deepEqual(bad, []);
});

const named = (re) => (rm) => rm.type === 'office' && re.test(rm.name ?? '');
const seatsOf = (rs) => rs.reduce((n, r) => n + (catalogOf(r)?.seat?.[1] ?? 0), 0);
test('the library, the computer room, the music room and the secretary\'s office are what their names say (A2 names the rooms upstairs from a list of three)', () => {
  const bad = [], seen = { library: 0, computer: 0, music: 0, secretary: 0 };
  for (const { bp, rm, rs } of inSchools(named(/bibliot/i))) {
    seen.library++;
    if (count(rs, 'bookshelf', 'bookshelf_low') < 2) bad.push(`${where(bp, rm)}: ${count(rs, 'bookshelf', 'bookshelf_low')} shelves of books`);
    if (!rs.some((r) => /^table_/.test(r.name)) || seatsOf(rs) < 2) bad.push(`${where(bp, rm)}: nowhere to read (${seatsOf(rs)} seats)`);
  }
  for (const { bp, rm, rs } of inSchools(named(/computaci|inform[aá]tica|sistemas/i))) {
    seen.computer++;
    if (count(rs, 'pc_set') < 3) bad.push(`${where(bp, rm)}: ${count(rs, 'pc_set')} computers`);
    if (seatsOf(rs) < 3) bad.push(`${where(bp, rm)}: ${seatsOf(rs)} seats at the computers`);
  }
  for (const { bp, rm, rs } of inSchools(named(/m[uú]sica/i))) {
    seen.music++;
    const board = rs.find((r) => r.name === 'decal:chalkboard'), chairs = rs.filter((r) => /^chair_/.test(r.name));
    if (!board) bad.push(`${where(bp, rm)}: no board`);
    if (chairs.length < 4) bad.push(`${where(bp, rm)}: ${chairs.length} chairs for a class`);
    else if (board) {
      const [bx, bz] = facing(board), away = chairs.filter((c) => { const [dx, dz] = facing(c); return dx * bx + dz * bz > -0.9; });
      if (away.length) bad.push(`${where(bp, rm)}: ${away.length} of ${chairs.length} chairs do not face the board`);
    }
    if (!count(rs, 'guitar_lean')) bad.push(`${where(bp, rm)}: no instrument`);
    if (!count(rs, 'speaker', 'radio_boombox')) bad.push(`${where(bp, rm)}: nothing to play music on`);
    const office = count(rs, 'pc_set', 'phone_landline', 'filing_cabinet', 'desk_office');
    if (office) bad.push(`${where(bp, rm)}: ${office} things of an office (a computer, a telephone, files) in a music room`);
  }
  for (const { bp, rm, rs } of inSchools(named(/secretar/i))) {
    seen.secretary++;
    for (const [what, n] of [['desk', count(rs, 'desk_office', 'desk_wood')], ['computer', count(rs, 'pc_set')], ['telephone', count(rs, 'phone_landline')], ['files', count(rs, 'filing_cabinet')]]) if (!n) bad.push(`${where(bp, rm)}: no ${what} in the secretary's office`);
  }
  assert.ok(seen.library >= 5 && seen.computer >= 4 && seen.music >= 1 && seen.secretary >= 1, `rooms to look at: ${JSON.stringify(seen)}`);
  assert.deepEqual(bad, []);
});

test('every desk in a school office has a chair in front of it (the chair stands in the desk\'s own front zone); a library under 12 m2 gives its floor to the reading table first', () => {
  const bad = []; let desks = 0;
  for (const { bp, rm, rs } of inSchools((rm) => rm.type === 'office')) {
    if (/bibliot/i.test(rm.name ?? '') && area(rm) < 12) continue;
    for (const d of rs.filter((r) => /^desk_/.test(r.name))) {
      desks++;
      const [fx, fz] = facing(d);
      const seated = rs.some((c) => c.kind !== 'wall' && /^(chair_|office_chair|stool_)/.test(c.name) && (() => {
        const dx = c.x - d.x, dz = c.z - d.z, along = dx * fx + dz * fz, across = dx * fz - dz * fx;                 // the chair's place in the desk's frame: in front of it, within a body's reach, about its width
        return along > d.d / 2 - 0.2 && along < d.d / 2 + 0.95 && Math.abs(across) < d.w / 2 + 0.3;
      })());
      if (!seated) bad.push(`${where(bp, rm)}: a ${d.name} with no chair in front of it`);
    }
  }
  assert.ok(desks >= 30, `${desks} desks to look at`);
  assert.deepEqual(bad, []);
});

test('the entrance hall and the galleries are a school\'s, not a household\'s', () => {
  const bad = [];
  for (const { bp, rm, rs } of inSchools((rm) => rm.type === 'hall' || rm.type === 'entry')) {
    if (area(rm) >= 6 && !count(rs, 'bench_wood')) bad.push(`${where(bp, rm)}: nowhere to sit`);
    if (!rs.some((r) => /^decal:(flag_co|schedule|notice_|photo_grad|diploma)/.test(r.name))) bad.push(`${where(bp, rm)}: no flag, notice or timetable on the wall`);
  }
  for (const { bp, rm, rs } of inSchools((rm) => rm.type === 'hall' || rm.type === 'entry' || rm.type === 'corridor')) {
    for (const r of rs) if (/^(shoe_rack|shoes_pair|side_table)$/.test(r.name) || FAMILY.test(r.name)) bad.push(`${where(bp, rm)}: ${r.name}`);
  }
  assert.deepEqual(bad, []);
});

test('nothing a home has stands anywhere in a school', () => {
  const bad = [];
  for (const { bp, rm, rs } of inSchools((rm) => rm.type !== 'kitchen' && rm.type !== 'terrace')) for (const r of rs) if (HOME.test(r.name)) bad.push(`${where(bp, rm)}: ${r.name}`);        // (a canteen kitchen has its stove, a roof terrace its caretaker's washing line)
  assert.deepEqual(bad, []);
});
