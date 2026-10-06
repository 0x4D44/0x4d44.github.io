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

test('star thresholds are calibrated: headway auto earns 3, unmanaged earns 1, timetable no better than headway', () => {
  for (const L of B.LEVELS.slice(1)) {
    const none = B.runHeadless(B.levelConfig(L), null).metrics().score;
    const hw = B.runHeadless(B.levelConfig(L), 'headway').metrics().score;
    const tt = B.runHeadless(B.levelConfig(L, { ttSpeed: 0.7 }), 'timetable').metrics().score;
    assert.equal(B.starsFor(L, none), 1, `L${L.id} none ${none}`);
    assert.equal(B.starsFor(L, hw), 3, `L${L.id} hw ${hw} vs ${L.stars}`);
    assert.ok(tt >= 0.97 * hw, `L${L.id} timetable ${tt} should not beat headway ${hw}`);
    assert.ok(hw < none);
    // thresholds sit where the calibration rule puts them (within 6%)
    const t3 = hw + 0.25 * (none - hw), t2 = hw + 0.6 * (none - hw);
    assert.ok(Math.abs(L.stars[1] - t3) / t3 < 0.06, `L${L.id} three-star ${L.stars[1]} vs ${t3.toFixed(1)}`);
    assert.ok(Math.abs(L.stars[0] - t2) / t2 < 0.06, `L${L.id} two-star ${L.stars[0]} vs ${t2.toFixed(1)}`);
  }
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
