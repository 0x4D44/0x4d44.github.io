// P-01: the keyboard guide (src/flight/guide.js) with the real stepFlight and the real course. Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/guide.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGame, loadCourseHeadless, makeRace } from './helpers/fake-game.mjs';
import { createControls } from '../src/controls.js';
import { createGuide } from '../src/flight/guide.js';

const DT = 1 / 60;
async function idleFlight(id, settings, secs, keys = {}) {
  const course = await loadCourseHeadless(createFakeGame({ seed: 1 }), id);
  const game = createFakeGame({ seed: 1, settings: { assist: 'standard', ...settings } }); game.course = course;
  const race = makeRace(game, course, { difficulty: 'normal', craftId: 'falcon', laps: 1, bots: 0, mode: 'quick', seed: 1 });
  const p = race.player, c = createControls(), guide = createGuide(), out = { roll: 0, pitch: 0 };
  let tum = 0, wMax = 0; game.events.on('racer:tumble', () => tum++);
  let n = 0; while (race.state !== 'racing' && n < 1000) { race.fixedUpdate(DT, c); game.simTime += DT; n++; }
  const t0 = race.clock;
  while (race.clock - t0 < secs && !p.finished) {
    wMax = Math.max(wMax, guide.blend(game, p.flight, keys.roll || 0, keys.pitch || 0, out)); c.roll = out.roll; c.pitch = out.pitch;
    race.fixedUpdate(DT, c); game.simTime += DT;
  }
  return { s: p.s, lat: p.lateral, tum, w: wMax, p, out };
}

test('P-01: with the keys idle the guide flies the craft down the course; without it the craft drifts off the line', async () => {
  for (const id of ['redrock', 'neon']) {
    const on = await idleFlight(id, { keyGuide: true }, 25), off = await idleFlight(id, { keyGuide: false }, 25);
    assert.ok(on.s > off.s + 300, `${id}: guided ${on.s.toFixed(0)} m vs unguided ${off.s.toFixed(0)} m in 25 s`);
    assert.ok(on.tum === 0 && Math.abs(on.lat) < 45, `${id}: guided flight stays clean (tumbles ${on.tum}, lateral ${on.lat.toFixed(0)})`);
    assert.ok(on.w > 0.5 && off.w === 0);
  }
});

test('P-01: a held key hands the craft back to the player; Pro assist and the off switch leave the keys alone', async () => {
  const held = await idleFlight('sunrise', { keyGuide: true }, 0.5, { roll: 0.98, pitch: 0.8 });
  assert.ok(Math.abs(held.out.roll - 0.98) < 0.1 && Math.abs(held.out.pitch - 0.8) < 0.1, `held keys pass through: ${held.out.roll}, ${held.out.pitch}`);
  const pro = await idleFlight('sunrise', { keyGuide: true, assist: 'pro' }, 0.5, { roll: 0.2 });
  assert.equal(pro.out.roll, 0.2); assert.equal(pro.w, 0, 'Pro assist: the guide is out');
  const off = await idleFlight('sunrise', { keyGuide: false }, 0.5, { roll: 0.2 });
  assert.equal(off.out.roll, 0.2); assert.equal(off.w, 0);
});
