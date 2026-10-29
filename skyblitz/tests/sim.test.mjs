// Full-race simulations (race agent): every course x several difficulties and seeds, all 8 racers on autopilot.
// Asserts the race is alive (overtakes, items, hits), sane (finish window, speeds, no NaN, no skipped lap), fair (rubber-band keeps the pack
// together), and deterministic per seed.   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/sim.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGame, loadCourseHeadless, simulate } from './helpers/fake-game.mjs';
import { DIFFICULTY, GP_POINTS } from '../src/race/balance.js';

const COURSES = ['sunrise', 'redrock', 'neon', 'frost'];
const courses = {};
for (const id of COURSES) courses[id] = await loadCourseHeadless(createFakeGame({ seed: 1 }), id);

const run = (id, { seed = 7, difficulty = 'normal', laps = 2, ...cfg } = {}) => {
  const game = createFakeGame({ seed });
  return simulate(game, courses[id], { seed, difficulty, laps, bots: 7, ...cfg }, { maxSeconds: 700 });
};

for (const id of COURSES) {
  test(`sim ${id}: a full 8-racer race finishes sanely, with overtakes, items and hits`, () => {
    const L = courses[id].length, laps = 2;
    const out = run(id, { laps });
    const { race, counts } = out;
    assert.equal(out.nan, 0, 'no NaN positions or speeds');
    assert.equal(race.state, 'done', 'race ended, clock ' + out.clock.toFixed(0));
    assert.equal(race.racers.length, 8);
    const fin = race.racers.filter((r) => r.finished && r.finishTime != null);
    assert.ok(fin.length >= 6, 'most of the field finishes, got ' + fin.length);
    for (const r of fin) {
      const avg = (L * laps) / r.finishTime;
      assert.ok(avg > 35 && avg < 330, `${r.name} average speed ${avg.toFixed(0)} m/s over ${r.finishTime.toFixed(0)} s`);
      assert.ok(r.dist >= L * laps - 1, `${r.name} really covered ${laps} laps: ${r.dist.toFixed(0)} of ${L * laps}`);
    }
    const times = fin.map((r) => r.finishTime).sort((a, b) => a - b);
    assert.ok(times[0] > (L * laps) / 330, 'winner is not impossibly fast');
    assert.ok(times[times.length - 1] - times[0] < 0.35 * times[0], `field stays together: ${times[0].toFixed(0)}..${times[times.length - 1].toFixed(0)} s`);
    assert.ok(race.stats.overtakes >= 20, 'racing happens: overtakes ' + race.stats.overtakes);
    assert.ok((counts['item:use'] || 0) >= 8, 'items are used: ' + (counts['item:use'] || 0));
    assert.ok((counts['pickup:orb'] || 0) >= 8, 'orbs are picked up: ' + (counts['pickup:orb'] || 0));
    assert.ok((counts['racer:hit'] || 0) >= 3, 'hits happen: ' + (counts['racer:hit'] || 0));
    assert.equal(race.stats.respawns <= 1, true, 'respawns are rare: ' + race.stats.respawns);
    assert.equal(race.stats.glitches <= 2, true, 'progress glitches: ' + race.stats.glitches);
    const st = race.results().standings;
    assert.deepEqual(st.map((x) => x.place), [1, 2, 3, 4, 5, 6, 7, 8], 'places are unique and contiguous');
    const ft = st.filter((x) => x.time != null).map((x) => x.time);
    assert.deepEqual(ft, [...ft].sort((x, y) => x - y), 'finishers are listed in finishing order');
  });
}

test('sim: every difficulty produces racing; harder AI is not slower', () => {
  const r = {};
  for (const d of Object.keys(DIFFICULTY)) {
    const out = run('sunrise', { difficulty: d, seed: 9 });
    assert.equal(out.race.state, 'done', d + ' finishes');
    assert.equal(out.nan, 0);
    assert.ok(out.race.stats.overtakes >= 15, `${d}: overtakes ${out.race.stats.overtakes}`);
    const aiBest = Math.min(...out.race.racers.filter((x) => x.isAI && x.finishTime != null).map((x) => x.finishTime));
    r[d] = aiBest;
  }
  assert.ok(r.expert < r.easy, `expert AI beats easy AI: ${r.expert.toFixed(1)} vs ${r.easy.toFixed(1)}`);
});

test('sim: the same seed replays exactly; different seeds differ', () => {
  const a = run('sunrise', { seed: 31 }), b = run('sunrise', { seed: 31 }), c = run('sunrise', { seed: 32 });
  assert.equal(a.hash, b.hash, 'identical hash for identical seed');
  assert.equal(a.steps, b.steps);
  assert.notEqual(a.hash, c.hash, 'a different seed gives a different race');
});

test('sim: different seeds produce different winners over a handful of races', () => {
  const winners = new Set();
  for (const seed of [41, 42, 43, 44, 45, 46]) {
    const out = run('sunrise', { seed });
    assert.equal(out.race.state, 'done');
    winners.add(out.race.results().standings[0].racer.id);
  }
  assert.ok(winners.size >= 2, 'more than one winner across seeds: ' + [...winners].join(','));
});

test('sim: rubber-banding keeps the gap bounded on the longest course, with no one lapped', () => {
  const out = run('frost', { laps: 3, seed: 12, difficulty: 'hard' });
  const { race } = out;
  assert.equal(race.state, 'done');
  const L = courses.frost.length;
  const dists = race.racers.map((r) => r.dist).sort((a, b) => b - a);
  assert.ok(dists[0] - dists[dists.length - 1] < L * 0.9, 'nobody is a full lap behind at the end');
});

test('sim: points follow the GP table down the finishing order', () => {
  const out = run('sunrise', { seed: 15, mode: 'gp' });
  const st = out.race.results().standings;
  assert.equal(st.length, 8);
  st.forEach((x, i) => assert.equal(x.points, GP_POINTS[i], 'place ' + (i + 1)));
});

test('sim: AI contact time stays low on every course (share of racer-seconds in wall / ground / water contact) and no 100 m bin is a hotspot', () => {
  for (const id of COURSES) {
    let ct = 0, rt = 0, laps = 0; const binRL = {};
    for (const seed of [1, 2, 7]) {
      const out = run(id, { seed, laps: 3 });
      const st = out.race.stats; ct += st.contactT; rt += st.racerT; laps += 3;
      for (const [b, set] of st.contactBins) binRL[b] = (binRL[b] || 0) + set.size;
    }
    const pct = 100 * ct / rt, worst = Math.max(...Object.values(binRL)) / laps;
    assert.ok(pct <= 1.2, `${id}: contact ${pct.toFixed(2)}% of racer-time (limit 1.2)`);
    assert.ok(worst <= 2.6, `${id}: worst 100 m bin has ${worst.toFixed(2)} scraping racers per lap (limit 2.6)`);
  }
});
