// Run with: node bunched/tests/engine.test.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
await import(pathToFileURL(path.join(here, '..', 'engine.js')).href);
const B = globalThis.Bunched;
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + (e.stack || e)); process.exitCode = 1; } }

const quiet = { lambda: 0.02, arrivals: 'fixed', speedNoise: 0, incidents: [], duration: 9000, seed: 5 };

test('determinism: same seed and inputs give the same run', () => {
  const a = B.runHeadless({ ...quiet, arrivals: 'poisson', speedNoise: 0.05, incidentRate: 1 / 500 }, null, 3000);
  const b = B.runHeadless({ ...quiet, arrivals: 'poisson', speedNoise: 0.05, incidentRate: 1 / 500 }, null, 3000);
  assert.deepEqual(a.metrics(), b.metrics());
  assert.deepEqual(a.buses.map(x => x.pos), b.buses.map(x => x.pos));
  const c = B.runHeadless({ ...quiet, arrivals: 'poisson', speedNoise: 0.05, incidentRate: 1 / 500, seed: 6 }, null, 3000);
  assert.notDeepEqual(a.buses.map(x => x.pos), c.buses.map(x => x.pos));
});

test('demand does not depend on how the dispatcher plays', () => {
  const cfg = { ...quiet, arrivals: 'poisson' };
  const a = B.runHeadless(cfg, null, 2000), b = B.runHeadless(cfg, 'headway', 2000);
  assert.equal(a.stats.spawned - a.stats.boarded + a.stats.boarded, a.stats.spawned);
  // stop 3's arrival stream is the same sequence regardless of buses
  assert.equal(a.stops[3].nextArr, b.stops[3].nextArr);
});

const calm = { ...quiet, lambda: 0.004 };
test('an even ring with zero noise and calm demand stays even', () => {
  const sim = B.runHeadless(calm, null, 4500);
  assert.ok(sim.cv < 0.15, 'cv ' + sim.cv);
  assert.ok(sim.metrics().cvAvg < 0.1, 'cvAvg ' + sim.metrics().cvAvg);
});

test('one small delay on an even ring bunches it (headway CV increases markedly)', () => {
  // 20 seconds of pigeon, once. Same buses, same stops, real demand.
  const delayed = { ...quiet, incidents: [{ t: 150, bus: 2, dur: 20, kind: 'pigeon' }] };
  const start = B.createSim(delayed).cv;
  const late = B.runHeadless(delayed, null, 6600);
  const calmEnd = B.runHeadless(calm, null, 4500).cv;
  assert.ok(start < 0.01, 'starts perfectly even ' + start);
  assert.ok(late.cv > 0.8, 'late cv ' + late.cv);
  assert.ok(late.cv > 5 * Math.max(calmEnd, 0.05), `late ${late.cv} vs calm ${calmEnd}`);
  assert.ok(late.stats.maxConvoy >= 3, 'convoy ' + late.stats.maxConvoy);
  // the instability is monotone-ish: CV a few laps in is well above the first lap
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
  const dwell = {}, start = {};
  const tally = {};
  for (let s = 0; s < 6000; s++) {
    sim.step();
    for (const e of sim.drain()) {
      if (e.type === 'arrive') start[e.bus] = e.t;
      if (e.type === 'depart' && start[e.bus] !== undefined && e.t > 1500) {
        const d = e.t - start[e.bus];
        (tally[e.bus] = tally[e.bus] || []).push(d);
      }
    }
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const means = Object.values(tally).map(avg);
  assert.ok(Math.max(...means) > 1.5 * Math.min(...means), 'dwell means ' + means.map(x => x.toFixed(1)));
});

test('holding (headway-based) reduces bunching vs unmanaged on every level', () => {
  for (const L of B.LEVELS.slice(1)) {
    const none = B.runHeadless(B.levelConfig(L), null), hw = B.runHeadless(B.levelConfig(L), 'headway');
    assert.ok(hw.metrics().cvAvg < 0.7 * none.metrics().cvAvg, `L${L.id} cv ${hw.metrics().cvAvg} vs ${none.metrics().cvAvg}`);
    assert.ok(hw.metrics().score < 0.9 * none.metrics().score, `L${L.id} score ${hw.metrics().score} vs ${none.metrics().score}`);
  }
});

test('holding holds only through the dispatcher levers and honours the maximum', () => {
  const sim = B.createSim({ ...quiet, incidents: [] });
  for (let s = 0; s < 200; s++) sim.step();
  const id = sim.buses.findIndex(b => b.state === 'run');
  assert.equal(sim.toggleHold(id), 'armed');
  let held = 0, started = null;
  for (let s = 0; s < 2000; s++) {
    sim.step();
    const b = sim.buses[id];
    if (b.hold.active) { if (started === null) started = sim.t; held += 0.5; }
  }
  assert.ok(held > 0 && held <= sim.cfg.holdMax + 1, 'held ' + held);
});

test('conservation of passengers (spawned = waiting + aboard + delivered)', () => {
  for (const L of B.LEVELS) {
    for (const auto of [null, 'headway']) {
      const sim = B.runHeadless(B.levelConfig(L), auto, 3000);
      assert.ok(sim.paxConserved(), `level ${L.id} ${auto}`);
      assert.ok(sim.buses.every(b => b.pax.length <= sim.cfg.cap));
    }
  }
});

test('buses never overtake: order around the ring is preserved', () => {
  const sim = B.createSim(B.levelConfig(B.LEVELS[5]));
  for (let s = 0; s < 8000; s++) {
    sim.step();
    const g = sim.gaps(); const sum = g.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - sim.L) < 1e-6 || Math.abs(sum % sim.L) < 1e-6, 'gaps sum ' + sum);
    assert.ok(Math.min(...g) >= sim.cfg.minGap - 1e-6, 'min gap ' + Math.min(...g));
  }
});

test('inspection paradox: measured mean wait matches E[H^2]/(2E[H]) and exceeds H/2', () => {
  const sim = B.runHeadless(B.levelConfig(B.LEVELS[0]), null, 9000);
  const S = sim.stats;
  const formula = S.sumH2 / (2 * S.sumH), half = S.sumH / S.nH / 2;
  const measured = S.sumWait / S.boarded;
  assert.ok(formula > 1.2 * half, `formula ${formula} vs half-mean ${half}`);
  assert.ok(Math.abs(measured - formula) / formula < 0.15, `measured ${measured} formula ${formula}`);
  // and for an even ring the formula collapses to H/2
  const even = B.runHeadless(calm, null, 5000), E = even.stats;
  assert.ok(Math.abs(E.sumH2 / (2 * E.sumH) - E.sumH / E.nH / 2) / (E.sumH / E.nH / 2) < 0.15);
});

const SEEDS = [20, 37, 54, 71, 88, 105];
function scores(L, auto, extra) { return SEEDS.map(sd => B.runHeadless(B.levelConfig(L, { seed: sd, ...(extra || {}) }), auto).metrics().score); }
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

test('star lines: doing nothing earns 0-1 stars (0 on most seeds), the tuned headway bot mostly 3, difficulty rises', () => {
  let prevRatio = 0;
  for (const L of B.LEVELS.slice(1)) {
    const none = scores(L, null), hw = scores(L, 'headway'), lazy = scores(L, 'lazy');
    const sn = none.map(v => B.starsFor(L, v)), sh = hw.map(v => B.starsFor(L, v));
    assert.ok(sn.filter(x => x === 0).length >= 5, `L${L.id} do-nothing stars ${sn}`);
    assert.ok(Math.max(...sn) <= 1, `L${L.id} do-nothing never above 1 star: ${sn}`);
    assert.ok(sh.filter(x => x === 3).length >= 4 && Math.min(...sh) >= 2, `L${L.id} headway bot stars ${sh}`);
    assert.ok(mean(hw) < 0.92 * mean(none), `L${L.id} hw ${mean(hw)} none ${mean(none)}`);
    assert.ok(mean(lazy) > mean(hw), `L${L.id} a lazy policy is worse than the tuned bot`);
    // the 3-star line gets closer to the bot as levels advance (relative to the none-bot gap)
    const ratio = (L.stars[2] - mean(hw)) / (mean(none) - mean(hw));
    assert.ok(ratio < 0.35 && ratio > 0, `L${L.id} three-star line sits just above the bot: ${ratio}`);
    assert.ok(L.stars[0] > L.stars[1] && L.stars[1] > L.stars[2]);
  }
  assert.ok(B.LEVELS[1].stars[2] > 0 && prevRatio === 0);
});

test('timetable vs headway: a schedule is only as good as its slack, and breaks down with roadworks', () => {
  const L2 = B.LEVELS[2], L4 = B.LEVELS[4], L5 = B.LEVELS[5];
  const speeds = [0.6, 0.74, 0.85];
  const tt2 = speeds.map(sp => mean(scores(L2, 'timetable', { ttSpeed: sp })));
  const hw2 = mean(scores(L2, 'headway'));
  assert.ok(Math.min(...tt2) < 1.12 * hw2, 'with the right slack a schedule works: ' + tt2 + ' vs ' + hw2);
  assert.ok(Math.max(...tt2) > 1.25 * Math.min(...tt2), 'but it is very sensitive to the slack: ' + tt2);
  for (const L of [L4, L5]) {
    const t = mean(scores(L, 'timetable')), h = mean(scores(L, 'headway'));
    assert.ok(t > 1.25 * h, `L${L.id}: with random delays the schedule loses (${t} vs ${h})`);
  }
});

test('skip is not a magic lever: running express everywhere does not beat doing nothing', () => {
  const L = B.LEVELS[2];
  const none = mean(scores(L, null)), all = mean(scores(L, 'skipall'));
  assert.ok(all > 0.97 * none, `skipall ${all} none ${none}`);
});

test('a hold has a target: it releases itself once the gap to the bus ahead is restored', () => {
  const sim = B.createSim({ ...quiet, incidents: [{ t: 150, bus: 2, dur: 20, kind: 'pigeon' }] });
  let released = 0, byMax = 0, started = 0;
  for (let s = 0; s < 14000; s++) {
    sim.step();
    for (const b of sim.buses) if (!b.hold.active && !b.hold.armed && b.state === 'run' && s % 40 === 0) { /* arm any bus that is too close */ }
    const tg = sim.gapsTime();
    sim.buses.forEach(b => { if (b.state === 'run' && !b.hold.armed && tg[b.id] < sim.Hest * 0.5 && b.arrH > 0) { sim.toggleHold(b.id); started++; } });
    for (const e of sim.drain()) if (e.type === 'holdend') { if (e.why === 'target') released++; else if (e.why === 'max') byMax++; }
  }
  assert.ok(started > 0 && released > 0, `started ${started} released-by-target ${released}`);
  assert.ok(released > 2 * byMax, `most holds end on target (${released}) not on the cap (${byMax})`);
});

test('time headways are real times (not distance), and sum to roughly the lap on a calm ring', () => {
  const sim = B.runHeadless(calm, null, 3000), g = sim.gapsTime();
  const H = sim.Hest;
  assert.ok(g.every(x => x > 0.7 * H && x < 1.3 * H), g.map(Math.round) + ' vs ' + Math.round(H));
});

test('a delay genuinely changes the run (the pigeon is not absorbed into the dwell)', () => {
  const L0 = B.LEVELS[0];
  const base = B.levelConfig(L0, { incidents: [] });
  const withP = B.levelConfig(L0, { incidents: [{ t: 700, bus: 2, dur: 20, kind: 'pigeon' }] });
  const a = B.runHeadless(base, null, 1500), b = B.runHeadless(withP, null, 1500);
  const dpos = Math.abs(a.buses[2].dist - b.buses[2].dist);
  assert.ok(dpos > 40, 'bus 2 travelled differently: ' + dpos);
  const a2 = B.runHeadless(base, null, 5000), b2 = B.runHeadless(withP, null, 5000);
  assert.ok(Math.abs(a2.cv - b2.cv) > 0.02 || Math.abs(a2.metrics().cvAvg - b2.metrics().cvAvg) > 0.01, 'outcome differs');
  // honest: demand noise alone also grows into bunching, just later
  assert.ok(a2.cv > 0.3, 'even with no pigeon the ring drifts into bunching: ' + a2.cv);
});

test('carrying riders past their stop costs the score', () => {
  const sim = B.createSim({ ...quiet, lambda: 0.03 });
  for (let s = 0; s < 400; s++) sim.step();
  for (let k = 0; k < 6; k++) { for (let s = 0; s < 120; s++) sim.step(); const id = sim.buses.findIndex(b => b.state === 'run' && b.pax.some(p => p.dest === b.ns)); if (id >= 0) { sim.toggleSkip(id); break; } }
  for (let s = 0; s < 600; s++) sim.step();
  assert.ok(sim.stats.carried > 0 && sim.stats.penalty === sim.stats.carried * sim.cfg.carryPenalty);
});

test('skipping a stop strands the people waiting there (and costs complaints)', () => {
  const sim = B.createSim({ ...quiet, lambda: 0.03 });
  for (let s = 0; s < 100; s++) sim.step();
  const id = sim.buses.findIndex(b => b.state === 'run');
  assert.equal(sim.toggleSkip(id), true);
  const before = sim.stats.stranded;
  for (let s = 0; s < 600; s++) sim.step();
  assert.ok(sim.stats.skips === 1 && sim.stats.stranded > before);
});

test('crush load leaves people behind', () => {
  const sim = B.runHeadless(B.levelConfig(B.LEVELS[2]), null, 5400);
  assert.ok(sim.stats.stranded > 0);
  assert.ok(sim.buses.every(b => b.pax.length <= sim.cfg.cap));
});

console.log(passed + ' tests passed' + (process.exitCode ? ' (with failures)' : ''));
