// Kids in class (R3-011): the school is a hidden block, so a visitor at 10:00 found empty classrooms. While the player is inside the school during class the pupils are drawn,
// seated at the desks of the floor the player is on, with a teacher at each class; when the player leaves or the class ends they are hidden again and the day goes on.
// Every check here has a mutant that turns it red (.scratch/a4/mutations_school.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-school.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim } from '../js/people/sim.js';
import { BANK } from '../js/people/lines/index.js';

const { ctx, plan } = await buildData({ furnish: true, colliders: true });
const META = await readAssetJson('people/people_meta.json');
const METAS = new Map(META.people.map((m) => [m.id, m]));
const ph = ctx.physics;
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d <= -Math.PI) d += 2 * Math.PI; return d; };

function fresh(hour) {
  for (const [id] of ph.doors) ph.setDoor(id, false);
  ctx.hour = hour; ctx.errors = [];
  const sim = new PeopleSim(ctx);
  assert.ok(sim.build(METAS), 'the cast is built');
  const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0);
  return sim;
}
const run = (sim, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) sim.step(dt); };
const pupilsOf = (sim) => sim.npcs.filter((n) => n.routine === 'kid' || n.routine === 'teen');
const inClass = (sim) => sim.npcs.filter((n) => n.inClass);
const enter = (sim) => { const e = sim.spots.entrance(sim.lots.school, ['main', 'shop']); sim.setPlayer(e.inside.x, e.inside.y, e.inside.z, 0); return e; };
const leave = (sim) => { const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0); };

test('class at 10:00: nobody is drawn while the player is outside; walking in seats the pupils at the desks, a teacher facing each class', () => {
  const sim = fresh(10), school = sim.lots.school, kids = pupilsOf(sim);
  assert.ok(school, 'the barrio has a school');
  run(sim, 2);
  assert.ok(kids.length >= 12 && kids.every((n) => n.away && n.awayWhy === 'school'), `${kids.length} pupils are in school, hidden`);
  assert.equal(inClass(sim).length, 0, 'nobody is seated while nobody is looking');
  assert.ok(sim.npcs.every((n) => n.away || sim.lotAt(n.x, n.z) !== school), 'and nobody is drawn inside the school');
  enter(sim); run(sim, 1);
  const seated = inClass(sim), pupils = seated.filter((n) => n.routine === 'kid' || n.routine === 'teen'), teachers = seated.filter((n) => n.routine === 'teacher');
  assert.ok(pupils.length >= Math.min(kids.length, 12), `${pupils.length} of ${kids.length} pupils are in class`);
  assert.ok(teachers.length >= 1, 'with a teacher');
  const desks = new Set();
  for (const n of pupils) {
    assert.equal(n.away, false, `${n.id} is drawn`); assert.ok(n.sitH != null && n.act === 'class', `${n.id} sits in class`);
    assert.ok(n.spot.kind === 'work' && n.spot.tagSet.has('school'), `${n.id} is on a school desk (${n.spot.id})`);
    assert.ok(Math.hypot(n.x - n.spot.x, n.z - n.spot.z) < 0.05 && sim.lotAt(n.x, n.z) === school, `${n.id} is at the desk, inside the school`);
    assert.ok(!desks.has(n.spot), `${n.id} shares a desk`); desks.add(n.spot);
  }
  const floors = new Set(seated.map((n) => n.spot.y.toFixed(1))); assert.equal(floors.size, 1, `one floor: ${[...floors]}`);
  for (const t of teachers) {
    const room = sim.classroom.rooms().find((r) => r.room === t.spot.room), kidsIn = pupils.filter((n) => n.spot.room === t.spot.room);
    assert.ok(room && room.chair === t.spot && kidsIn.length >= 4, `${t.id} sits at the chair of a class with ${kidsIn.length} pupils`);
    assert.ok(Math.abs(Math.abs(angDiff(t.ry, kidsIn[0].ry)) - Math.PI) < 0.1, `${t.id} faces the class: the pupils face the board, the teacher the other way (${t.ry.toFixed(2)} vs ${kidsIn[0].ry.toFixed(2)})`);
  }
  assert.deepEqual(ctx.errors, [], 'ctx.errors is empty'); assert.equal(sim.faults.length, 0, 'no faults');
});

test('leaving the school hides the class again; the pupils are away for school, free of their desks, and the day goes on', () => {
  const sim = fresh(10); enter(sim); run(sim, 1);
  const seated = inClass(sim); assert.ok(seated.length >= 8);
  leave(sim); run(sim, 1);
  assert.equal(inClass(sim).length, 0, 'nobody is left in class');
  for (const n of seated) { assert.ok(n.away && n.awayWhy === 'school', `${n.id} is hidden in the school again`); assert.equal(sim.spots.claimOf(n), null, `${n.id} holds no desk`); assert.equal(n.sitH, null, `${n.id} is not seated`); }
  run(sim, 60); assert.equal(sim.faults.length, 0, 'a minute later: no faults');
});

test('the end of the school day ends the class: they leave the desks and are on their way out, not seated again', () => {
  const sim = fresh(10); enter(sim); run(sim, 1);
  const seated = inClass(sim); assert.ok(seated.length >= 8);
  ctx.hour = 13.9; run(sim, 3);
  assert.equal(inClass(sim).length, 0, 'after school nobody is in class, though the player is still inside');
  assert.ok(seated.every((n) => n.sitH == null && n.spot?.tagSet?.has?.('school') !== true), 'nobody keeps a desk');
  run(sim, 40); assert.equal(sim.faults.length, 0, 'no faults while they leave');
  assert.ok(seated.some((n) => !n.away), 'and they come out of the school into the afternoon');
});

test('a pupil the player is talking to is not hidden until the talk is over', () => {
  const sim = fresh(10); enter(sim); run(sim, 1);
  const seated = inClass(sim), talker = seated.find((n) => n.routine === 'kid') ?? seated[0];
  talker.beginTalk({ t: sim.t }, sim.player);
  leave(sim); run(sim, 1);
  assert.deepEqual(inClass(sim).map((n) => n.id), [talker.id], 'the others went, the one in conversation stays');
  talker.endTalk({ t: sim.t }); run(sim, 1);
  assert.equal(inClass(sim).length, 0, 'and goes when the talk ends');
});

test('on the first floor the class is on the first floor: the classrooms of the player\'s floor, and no pop-ins when the player only walks about', () => {
  const sim = fresh(10), rooms = sim.classroom.rooms(), up = rooms.find((r) => r.y > 2), down = rooms.find((r) => r.y < 1);
  assert.ok(up && down, 'the school has classrooms on two floors');
  sim.setPlayer(up.desks[0].x, up.desks[0].y, up.desks[0].z, 0); run(sim, 1);
  const first = inClass(sim); assert.ok(first.length >= 8, `${first.length} in class upstairs`);
  assert.ok(first.every((n) => Math.abs(n.spot.y - up.y) < 0.5), 'all of them on the player\'s floor');
  const ids = first.map((n) => n.id).sort().join();
  sim.setPlayer(up.desks[1].x + 0.5, up.desks[1].y, up.desks[1].z, 0); run(sim, 2);
  assert.equal(inClass(sim).map((n) => n.id).sort().join(), ids, 'walking about on the same floor changes nothing');
  sim.setPlayer(down.desks[0].x, down.desks[0].y, down.desks[0].z, 0); run(sim, 1);
  const second = inClass(sim); assert.ok(second.length >= 8 && second.every((n) => Math.abs(n.spot.y - down.y) < 0.5), 'back on the ground floor the class is down here');
});

test('in class they say so: the opening line of a pupil and of a teacher at the desk is about the class', () => {
  assert.ok(BANK.shared.act_class?.length >= 3, 'the pupils have their opening lines');
  assert.ok(BANK.personas.maestra.act_class?.length >= 2, 'and the teacher hers');
  for (const [es] of [...BANK.shared.act_class, ...BANK.personas.maestra.act_class]) assert.ok(/clase|profe|tablero|prueba/i.test(es), `a line about the class: ${es}`);
});
