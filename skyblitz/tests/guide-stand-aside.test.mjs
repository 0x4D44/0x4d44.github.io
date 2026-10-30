// P-01: the keyboard guide stands aside for shortcuts and loops. Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/guide-stand-aside.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGame, loadCourseHeadless, makeRace } from './helpers/fake-game.mjs';
import { createControls } from '../src/controls.js';
import { createGuide } from '../src/flight/guide.js';
import { basisQuat } from '../src/world/layout.js';

const DT = 1 / 60;
async function rig(id = 'sunrise') {
  const course = await loadCourseHeadless(createFakeGame({ seed: 1 }), id);
  const game = createFakeGame({ seed: 1, settings: { assist: 'standard', keyGuide: true } }); game.course = course;
  const race = makeRace(game, course, { difficulty: 'normal', craftId: 'falcon', laps: 1, bots: 0, mode: 'quick', seed: 1 });
  const c = createControls(); let n = 0;
  while (race.state !== 'racing' && n < 1000) { race.fixedUpdate(DT, c); game.simTime += DT; n++; }
  return { course, game, race, c, p: race.player, guide: createGuide(), out: { roll: 0, pitch: 0 } };
}
function put(r, fr, lateral = 0, vertical = 0, speed = 95, lift = 0) {
  const fs = r.p.flight;
  fs.pos.copy(fr.pos).addScaledVector(fr.right, lateral).addScaledVector(fr.up, vertical); fs.pos.y += lift;
  fs.quat.copy(basisQuat(fr)); fs.speed = speed; fs.vel.copy(fr.tangent).multiplyScalar(speed);
  r.p.prev.pos.copy(fs.pos); r.p.prev.quat.copy(fs.quat); r.race.onTeleport(r.p); r.guide.reset();
}

test('P-01: on a shortcut the guide keeps the racer on the branch', async () => {
  const r = await rig('sunrise'), b = r.course.branches[0], fr = {};
  b.frameAt(300, fr); put(r, fr, 10, 0);
  let wMax = 0, onBranch = 0, steps = 0;
  for (let i = 0; i < 60 * 4; i++) {
    r.guide.blend(r.game, r.p.flight, 0, 0, r.out); wMax = Math.max(wMax, r.guide.active); r.c.roll = r.out.roll; r.c.pitch = r.out.pitch;
    r.race.fixedUpdate(DT, r.c); r.game.simTime += DT; steps++; if (r.p.proj.branch === b.index) onBranch++;
  }
  assert.ok(onBranch > steps * 0.95, `stayed on the branch ${onBranch}/${steps} steps`);
  assert.ok(wMax < 0.3, `on a branch the guide yields (peak weight ${wMax.toFixed(2)})`);
});

test('P-01: heading for a shortcut mouth the guide stands aside; well before the mouth it steers as usual', async () => {
  const r = await rig('sunrise'), b = r.course.branches[0], fr = {};
  const w = (s) => { r.course.frameAt(s, fr); put(r, fr, 0, 0); r.p.s = s; r.guide.blend(r.game, r.p.flight, 0, 0, r.out); return r.guide.active; };
  const near = w(b.fromS - 60), far = w(b.fromS - 600);
  assert.ok(near < 0.2, `at the mouth the guide weight is ${near.toFixed(2)}`);
  assert.ok(far > 0.35, `far from the mouth it is ${far.toFixed(2)}`);
});

test('P-01: a keyboard loop (pitch held from level flight, guide on) completes and pays the loop stunt', async () => {
  const r = await rig('sunrise'); let loops = 0, tum = 0;
  r.game.events.on('racer:stunt', (d) => { if (d.kind === 'loop' && d.racer === r.p) loops++; });
  r.game.events.on('racer:tumble', () => tum++);
  const fr = {}; r.course.frameAt(2000, fr); put(r, fr, 0, 0, 100, 120);
  for (let i = 0; i < 60 * 6; i++) {
    r.guide.blend(r.game, r.p.flight, 0, 1, r.out); r.c.roll = r.out.roll; r.c.pitch = r.out.pitch;
    r.race.fixedUpdate(DT, r.c); r.game.simTime += DT;
  }
  assert.ok(loops >= 1, `loop stunts ${loops}, tumbles ${tum}`);
});
