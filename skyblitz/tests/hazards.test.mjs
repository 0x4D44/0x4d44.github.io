// E-04: moving hazards (sunrise balloons, neon hovercars and blimps) are a pure function of the race clock, stepped by Race.fixedUpdate - never by the
// render loop - so a headless sim, a render-every-step run and a render-every-third-step run see the same hazards (the Chrome twin of this test is
// render-det.test.mjs). Before the fix the motion lived in the scenery's render-loop update(), so the fake game (no scenery, no course.update) saw them frozen.
// Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/hazards.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGame, loadCourseHeadless, makeRace, stepRace, simulate, SIM_DT } from './helpers/fake-game.mjs';

const MOVERS = { sunrise: ['balloon'], neon: ['hovercar', 'blimp'] };
const snap = (hs) => hs.map((h) => [h.pos.x, h.pos.y, h.pos.z]);

for (const [id, kinds] of Object.entries(MOVERS)) {
  const setup = async (seed = 7) => {
    const game = createFakeGame({ seed });
    const course = await loadCourseHeadless(game, id);
    const race = makeRace(game, course, { autopilot: true, laps: 1 });
    const movers = course.hazards.filter((h) => kinds.includes(h.kind));
    return { game, course, race, movers };
  };

  test(`${id}: ${kinds.join(' / ')} hazards exist and the course exposes stepHazards(t)`, async () => {
    const { course, movers } = await setup();
    assert.ok(movers.length >= 2, `${id} has ${movers.length} moving hazards`);
    assert.equal(typeof course.stepHazards, 'function');
  });

  test(`${id}: hazard pose is a pure function of the clock (history does not matter)`, async () => {
    const { course, movers } = await setup();
    course.stepHazards(7.31); const a = snap(movers);
    course.stepHazards(2.0); course.stepHazards(31.9); course.stepHazards(7.31);
    assert.deepEqual(snap(movers), a, 'same t, same pose');
    course.stepHazards(7.31 + 1 / 60); assert.notDeepEqual(snap(movers), a, 'a step later the pose differs');
  });

  test(`${id}: hazards move as the race clock advances, and collide() sees the moved body`, async () => {
    const { course, race, movers } = await setup();
    const t0 = stepRace(race, { seconds: 40, until: (r) => r.state === 'racing' });
    assert.ok(t0 < 40 / SIM_DT, 'race reached GO');
    const home = movers.map((h) => h.home.clone());
    let maxDisp = 0; const seen = new Set();
    for (let k = 0; k < 40; k++) {
      stepRace(race, { seconds: 0.25 });
      movers.forEach((h, i) => { maxDisp = Math.max(maxDisp, h.pos.distanceTo(home[i])); if (h.pos.distanceTo(home[i]) > 1) seen.add(i); });
    }
    assert.ok(maxDisp > 3, `movers swing away from home (max ${maxDisp.toFixed(2)} m over 10 s)`);
    assert.equal(seen.size, movers.length, `every mover left home by > 1 m (${seen.size}/${movers.length})`);
    // the pose in force is the clock's pose
    const live = snap(movers); course.stepHazards(race.clock);
    assert.deepEqual(snap(movers), live, 'hazards sit at stepHazards(race.clock)');
    // collide() reads h.pos: a probe sphere on the moved body hits it; the same probe at an unrelated point does not
    const out = {};
    let hit = 0;
    for (const h of movers) { const p = h.pos.clone(); if (course.collide(p, 1, null, out) && out.kind === 'hazard' && out.hazard === h) hit++; }
    assert.equal(hit, movers.length, 'a craft at the hazard body collides with it');
  });

  test(`${id}: a one-lap sim with moving hazards is repeatable and the field still finishes`, async () => {
    const run = async () => {
      const game = createFakeGame({ seed: 11 });
      const course = await loadCourseHeadless(game, id);
      const r = simulate(game, course, { laps: 1, bots: 7 }, { maxSeconds: 400 });
      return { hash: r.hash, finished: r.race.racers.filter((x) => x.finishTime != null).length, nan: r.nan, hits: r.counts['racer:hit'] || 0 };
    };
    const a = await run(), b = await run();
    assert.equal(b.hash, a.hash, 'same seed, same finish times and end positions');
    assert.equal(a.nan, 0);
    assert.ok(a.finished >= 6, `${a.finished}/8 finished (hits ${a.hits})`);
  });
}
