// Run with: node bunched/tests/engine.test.mjs   (the long star-rate test takes a few minutes)
import assert from 'node:assert/strict';
import { B, BOTS, runBot, replaySeed } from './bots.mjs';
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } }
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

const quiet = { lambda: 0.02, arrivals: 'fixed', speedNoise: 0, incidents: [], duration: 9000, seed: 5 };
const calm = { ...quiet, lambda: 0.004 };

test('determinism: same seed and inputs give the same run', () => {
  const cfg = { ...quiet, arrivals: 'poisson', speedNoise: 0.05, incidentRate: 1 / 500 };
  const a = B.runHeadless(cfg, null, 3000), b = B.runHeadless(cfg, null, 3000);
  assert.deepEqual(a.metrics(), b.metrics());
  assert.deepEqual(a.buses.map(x => x.pos), b.buses.map(x => x.pos));
  const c = B.runHeadless({ ...cfg, seed: 6 }, null, 3000);
  assert.notDeepEqual(a.buses.map(x => x.pos), c.buses.map(x => x.pos));
});

test('demand does not depend on how the dispatcher plays', () => {
  const cfg = { ...quiet, arrivals: 'poisson' };
  const a = B.runHeadless(cfg, null, 2000), b = B.runHeadless(cfg, 'headway', 2000);
  assert.equal(a.stops[3].nextArr, b.stops[3].nextArr);
});

test('an even ring with zero noise and calm demand stays even', () => {
  const sim = B.runHeadless(calm, null, 4500);
  assert.ok(sim.cv < 0.15, 'cv ' + sim.cv);
  assert.ok(sim.metrics().cvAvg < 0.1, 'cvAvg ' + sim.metrics().cvAvg);
});

test('one small delay on an even ring bunches it (headway CV increases markedly)', () => {
  const delayed = { ...quiet, incidents: [{ t: 150, bus: 2, dur: 20, kind: 'pigeon' }] };
  const start = B.createSim(delayed).cv;
  const late = B.runHeadless(delayed, null, 6600);
  const calmEnd = B.runHeadless(calm, null, 4500).cv;
  assert.ok(start < 0.01, 'starts perfectly even ' + start);
  assert.ok(late.cv > 0.8, 'late cv ' + late.cv);
  assert.ok(late.cv > 5 * Math.max(calmEnd, 0.05), `late ${late.cv} vs calm ${calmEnd}`);
  assert.ok(late.stats.maxConvoy >= 2, 'convoy ' + late.stats.maxConvoy);
  const h = late.hist; assert.ok(h[h.length - 1].cv > 6 * h[Math.floor(h.length * 0.1)].cv + 0.2);
});

test('Level 0 collapses into convoys by its end, from evenly spaced', () => {
  const L0 = B.LEVELS[0], sim = B.createSim(B.levelConfig(L0));
  assert.ok(sim.cv < 0.01);
  for (let s = 0; s < L0.duration / 0.5; s++) sim.step();
  assert.ok(sim.cv > 0.8, 'cv ' + sim.cv);
  assert.ok(sim.stats.maxConvoy >= 3, 'convoy ' + sim.stats.maxConvoy);
});

test('positive feedback: the late bus dwells longer than the bus behind it', () => {
  const sim = B.createSim({ ...quiet, incidents: [{ t: 150, bus: 2, dur: 40, kind: 'haggis' }] });
  const start = {}, tally = {};
  for (let s = 0; s < 6000; s++) {
    sim.step();
    for (const e of sim.drain()) {
      if (e.type === 'arrive') start[e.bus] = e.t;
      if (e.type === 'depart' && start[e.bus] !== undefined && e.t > 1500) (tally[e.bus] = tally[e.bus] || []).push(e.t - start[e.bus]);
    }
  }
  const means = Object.values(tally).map(mean);
  assert.ok(Math.max(...means) > 1.5 * Math.min(...means), 'dwell means ' + means.map(x => x.toFixed(1)));
});

test('a delay genuinely changes the run (the pigeon is not absorbed into the dwell)', () => {
  const base = B.levelConfig(B.LEVELS[0], { incidents: [] });
  const withP = B.levelConfig(B.LEVELS[0], { incidents: [{ t: 700, bus: 2, dur: 50, kind: 'pigeon' }] });
  const a = B.runHeadless(base, null, 1500), b = B.runHeadless(withP, null, 1500);
  assert.ok(Math.abs(a.buses[2].dist - b.buses[2].dist) > 40, 'bus 2 travelled differently');
  const a2 = B.runHeadless(base, null, 5000);
  assert.ok(a2.cv > 0.3, 'even with no pigeon the ring drifts into bunching: ' + a2.cv);
});

test('honest causality: one pigeon is a nudge, but a few on the same bus reliably bring the collapse forward', () => {
  function t50(inc, seed) { const sim = B.createSim(B.levelConfig(B.LEVELS[0], { seed, incidents: inc })); for (let s = 0; s < 12000; s++) { sim.step(); if (sim.cv > 0.5) return sim.t; } return 6000; }
  let earlier = 0;
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
    const none = t50([], seed), many = t50([{ t: 700, bus: 2, dur: 50 }, { t: 800, bus: 2, dur: 50 }, { t: 900, bus: 2, dur: 50 }], seed);
    if (many < none) earlier++;
  }
  assert.ok(earlier >= 7, 'earlier on ' + earlier + '/8 seeds');
});

test('holding (headway robot) reduces bunching vs unmanaged on every level', () => {
  for (const L of B.LEVELS.slice(1)) {
    const none = B.runHeadless(B.levelConfig(L), null), hw = B.runHeadless(B.levelConfig(L), 'headway');
    assert.ok(hw.metrics().cvAvg < 0.8 * none.metrics().cvAvg, `L${L.id} cv ${hw.metrics().cvAvg} vs ${none.metrics().cvAvg}`);
    assert.ok(hw.metrics().score < 0.95 * none.metrics().score, `L${L.id} score`);
  }
});

test('holds are scarce: radio budget, per-bus cooldown, hold cap, and a target that releases itself', () => {
  const sim = B.createSim({ ...quiet });
  for (let s = 0; s < 200; s++) sim.step();
  const runs = sim.buses.filter(b => b.state === 'run').map(b => b.id);
  assert.equal(sim.toggleHold(runs[0]), 'armed');
  assert.equal(sim.toggleHold(runs[1]), 'armed');
  assert.equal(sim.toggleHold(runs[2]), 'busy', 'a third hold is refused (radio busy)');
  assert.equal(sim.toggleHold(runs[1]), 'disarmed');
  // run until bus runs[0] has been held and released; then it cools down
  let ended = null, held = 0;
  for (let s = 0; s < 3000 && !ended; s++) {
    sim.step();
    if (sim.buses[runs[0]].hold.active) held += 0.5;
    for (const e of sim.drain()) if (e.type === 'holdend' && e.bus === runs[0]) ended = e;
  }
  assert.ok(ended && held <= sim.cfg.holdMax + 1, 'hold ended within the cap, held ' + held);
  assert.ok(sim.buses[runs[0]].coolUntil > sim.t, 'bus is cooling down');
  assert.equal(sim.toggleHold(runs[0]), 'cooling');
});

test('a hold releases itself on the gap target (most holds end on target, not on the cap)', () => {
  const sim = B.createSim({ ...quiet, incidents: [{ t: 150, bus: 2, dur: 20, kind: 'pigeon' }], cooldown: 100 });
  let target = 0, max = 0;
  for (let s = 0; s < 14000; s++) {
    BOTS.think(sim); sim.step();
    for (const e of sim.drain()) if (e.type === 'holdend') { if (e.why === 'target') target++; else if (e.why === 'max') max++; }
  }
  assert.ok(target > 3 && target > 3 * max, `target ${target} max ${max}`);
});

test('first-lap hold with no leader record releases at once (does not wait the full cap)', () => {
  const sim = B.createSim({ ...quiet });
  const id = 0; sim.toggleHold(id);
  let started = -1, ended = -1;
  for (let s = 0; s < 2000 && ended < 0; s++) { sim.step(); for (const e of sim.drain()) { if (e.type === 'holdstart') started = e.t; if (e.type === 'holdend') ended = e.t; } }
  assert.ok(ended >= 0 && ended - started < sim.cfg.holdMax, `held ${ended - started}`);
});

test('conservation of passengers; capacity respected', () => {
  for (const L of B.LEVELS) for (const auto of [null, 'headway']) {
    const sim = B.runHeadless(B.levelConfig(L), auto, 3000);
    assert.ok(sim.paxConserved(), `level ${L.id} ${auto}`);
    assert.ok(sim.buses.every(b => b.pax.length <= sim.cfg.cap));
  }
});

test('buses never overtake: order preserved, minimum gap kept', () => {
  const sim = B.createSim(B.levelConfig(B.LEVELS[5]));
  for (let s = 0; s < 8000; s++) {
    sim.step();
    const g = sim.gaps(), sum = g.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - sim.L) < 1e-6 || Math.abs(sum % sim.L) < 1e-6, 'gaps sum ' + sum);
    assert.ok(Math.min(...g) >= sim.cfg.minGap - 1e-6);
  }
});

test('inspection paradox: measured mean wait matches E[H^2]/(2E[H]) and exceeds H/2', () => {
  const sim = B.runHeadless(B.levelConfig(B.LEVELS[0]), null, 9000), S = sim.stats;
  const formula = S.sumH2 / (2 * S.sumH), half = S.sumH / S.nH / 2, measured = S.sumWait / S.boarded;
  assert.ok(formula > 1.2 * half, `formula ${formula} vs half-mean ${half}`);
  assert.ok(measured < formula && measured > 0.78 * formula, `measured ${measured} should sit a little under the formula ${formula}`);
  const even = B.runHeadless(calm, null, 5000), E = even.stats;
  assert.ok(Math.abs(E.sumH2 / (2 * E.sumH) - E.sumH / E.nH / 2) / (E.sumH / E.nH / 2) < 0.15);
});

test('H is the true mean headway (lap / buses), not biased by ignoring short gaps', () => {
  for (const lid of [1, 2]) {
    const sim = B.runHeadless(B.levelConfig(B.LEVELS[lid]), null, 4000), S = sim.stats;
    const trueMean = S.sumH / S.nH;
    assert.ok(Math.abs(sim.Hest - trueMean) / trueMean < 0.2, `L${lid}: Hest ${sim.Hest} vs mean headway ${trueMean}`);
  }
});

test('time headways are real times (not distance), near H on a calm ring', () => {
  const sim = B.runHeadless(calm, null, 3000), g = sim.gapsTime(), H = sim.Hest;
  assert.ok(g.every(x => x > 0.7 * H && x < 1.3 * H), g.map(Math.round) + ' vs ' + Math.round(H));
});

test('a crowd letting out is a long dwell: the next bus there loads for a minute or more', () => {
  const cfg = { ...quiet, lambda: 0.01, bursts: [{ t: 500, stop: 6, n: 24, label: 'x' }] };
  const sim = B.createSim(cfg); let start = {}, best = 0;
  for (let s = 0; s < 4000; s++) { sim.step(); for (const e of sim.drain()) { if (e.type === 'arrive' && e.stop === 6) start[e.bus] = e.t; if (e.type === 'depart' && e.stop === 6 && start[e.bus] !== undefined && e.t > 500) best = Math.max(best, e.t - start[e.bus]); } }
  assert.ok(best >= 45, 'longest dwell at the burst stop ' + best);
});

test('timetable holding: depends strongly on its slack (running times), and with the default slack fails under roadworks', () => {
  const tt = (L, sp) => mean([1, 2, 3].map(r => B.runHeadless(B.levelConfig(L, { seed: replaySeed(L, r), ttSpeed: sp }), 'timetable').metrics().score));
  const hw = L => mean([1, 2, 3].map(r => B.runHeadless(B.levelConfig(L, { seed: replaySeed(L, r) }), 'headway').metrics().score));
  const L2 = B.LEVELS[2], L4 = B.LEVELS[4];
  const spread = [0.6, 0.74, 0.85].map(sp => tt(L2, sp));
  assert.ok(Math.max(...spread) > 1.3 * Math.min(...spread), 'sensitive to slack: ' + spread);
  assert.ok(Math.min(...spread) < 1.1 * hw(L2), 'with the right slack it works: ' + spread + ' vs ' + hw(L2));
  assert.ok(tt(L4, 0.74) > 1.25 * hw(L4), 'default timetable loses on roadworks');
});

// ---- the long one: strategy tables over 60 replay seeds ----------------------------------
const NSEED = 60;
test('stars over 60 replay seeds: random/spam/wrong-bus/do-nothing get nothing much; thinking earns stars; Inspector autopilot is capped', () => {
  const table = [];
  for (const L of B.LEVELS.slice(1)) {
    const bots = ['none', 'random', 'spam', 'think', 'wrong', 'inspect', 'holdall'];
    const rows = Object.fromEntries(bots.map(k => [k, []]));
    for (let r = 1; r <= NSEED; r++) {
      const cfg = B.levelConfig(L, { seed: replaySeed(L, r) });
      const base = runBot(cfg, null);
      rows.none.push(B.starsFor(L, B.ratioOf(base, base)));
      for (const bot of ['random', 'spam', 'think', 'wrong', 'inspect']) rows[bot].push(B.starsFor(L, B.ratioOf(runBot(cfg, bot), base)));
      rows.holdall.push(B.starsFor(L, B.ratioOf(runBot(cfg, null, 'holdall'), base)));
    }
    const rate = (a, k) => a.filter(x => x === k).length / a.length, atLeast = (a, k) => a.filter(x => x >= k).length / a.length;
    table.push(`L${L.id}: ` + bots.map(k => `${k} [0:${(100 * rate(rows[k], 0)).toFixed(0)} 1:${(100 * rate(rows[k], 1)).toFixed(0)} 2:${(100 * rate(rows[k], 2)).toFixed(0)} 3:${(100 * rate(rows[k], 3)).toFixed(0)}]`).join(' '));
    assert.equal(Math.max(...rows.none), 0, `L${L.id} do-nothing earns no stars`);
    assert.ok(atLeast(rows.random, 2) <= 0.1, `L${L.id} random holds: 2+ stars ${atLeast(rows.random, 2)}`);
    assert.ok(atLeast(rows.spam, 2) <= 0.15 && rate(rows.spam, 3) <= 0.03, `L${L.id} spam 2+ ${atLeast(rows.spam, 2)} 3 ${rate(rows.spam, 3)}`);
    assert.ok(atLeast(rows.wrong, 2) <= 0.05, `L${L.id} holding the bus in front earns nothing: ${atLeast(rows.wrong, 2)}`);
    assert.ok(atLeast(rows.think, 2) >= 0.55, `L${L.id} thinking 2+ stars ${atLeast(rows.think, 2)}`);
    assert.ok(rate(rows.think, 3) >= 0.08 && rate(rows.think, 3) <= 0.27, `L${L.id} thinking 3 stars ${rate(rows.think, 3)}`);
    assert.ok(atLeast(rows.inspect, 2) < atLeast(rows.think, 2) + 0.05, `L${L.id} Inspector autopilot no better than thinking`);
    assert.ok(rate(rows.inspect, 3) <= 0.25 && atLeast(rows.holdall, 2) <= 0.35, `L${L.id} autopilot / hold-all capped`);
  }
  console.log('     ' + table.join('\n     '));
});

test('mean delay ordering on replay seeds: thinking < doing nothing <= random and spam (careless holding does not pay)', () => {
  for (const L of B.LEVELS.slice(1)) {
    const s = { none: [], random: [], spam: [], think: [], wrong: [] };
    for (let r = 1; r <= 20; r++) { const cfg = B.levelConfig(L, { seed: replaySeed(L, r) }); for (const k of Object.keys(s)) s[k].push(runBot(cfg, k === 'none' ? null : k).metrics().score); }
    assert.ok(mean(s.think) < 0.8 * mean(s.none), `L${L.id} think ${mean(s.think)} none ${mean(s.none)}`);
    assert.ok(mean(s.random) > 0.88 * mean(s.none) && mean(s.spam) > 0.88 * mean(s.none), `L${L.id} careless ${mean(s.random)} ${mean(s.spam)} none ${mean(s.none)}`);
    assert.ok(mean(s.wrong) > mean(s.none), `L${L.id} holding the chased bus makes things worse`);
  }
});

test('hold quality is recorded and charged: holding the bus in front is a "leader" hold with a penalty', () => {
  const cfg = B.levelConfig(B.LEVELS[2], { seed: replaySeed(B.LEVELS[2], 1) });
  const w = runBot(cfg, 'wrong'), t = runBot(cfg, 'think');
  assert.ok(w.stats.hq.leader + w.stats.hq.loose > 3 * (t.stats.hq.leader + t.stats.hq.loose + 1), JSON.stringify([w.stats.hq, t.stats.hq]));
  assert.ok(t.stats.hq.good > 5, 'think makes good holds ' + JSON.stringify(t.stats.hq));
  assert.ok(w.stats.penaltySec > 0);
});

test('the radio binds: spam and think both hit refusals or cooldowns, and holds are never above two at once', () => {
  const cfg = B.levelConfig(B.LEVELS[3], { seed: replaySeed(B.LEVELS[3], 2) });
  const sim = B.createSim(cfg); let maxBusy = 0, denied = 0;
  for (let s = 0; s < 8000; s++) { BOTS.spam(sim); sim.step(); maxBusy = Math.max(maxBusy, sim.radioBusy()); }
  assert.ok(maxBusy <= 2 && sim.stats.denied >= 0);
  const m = runBot(cfg, 'think').metrics();
  assert.ok(m.holds <= 30, 'cooldown caps how often a thoughtful player can hold: ' + m.holds);
});

console.log(passed + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
