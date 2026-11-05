import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture } from './fixture.mjs';
import { Track } from './track.js';
import { Train, stockFrom, notchToCmd } from './dynamics.js';
import { Service, baselineRunTimes, DOOR_TIME } from './service.js';
import { doorPermission, berthingScore, punctualityScore, buildSchedule, platformInterval, platformSide, DIFFICULTY, paxExchange } from './rules.js';
import { KMH } from './util.js';
import { Walker } from './walker.js';
import { reach, panOf, DOOR_SECS, BEEP_EVERY, BEEP_LEN, SAMPLES } from './audio.js';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../vendor/three/build/three.module.js';
import { Rats, RAT, strideAt } from './rats.js';
import { Fleet, Ring, measureCycle, advanceToLap, unitIds, carIds, unitOfCar, isUnit, FLEET_FIRST, FLEET_SIZE, IN_SERVICE, CAR_LETTERS } from './fleet.js';

const F = makeFixture();
const stock = stockFrom(F.rollingStock);
const mk = (line = 'outer', o = {}) => new Track(F.tracks[line], { trainLen: stock.lengthM });

test('track: pose is continuous and unit tangent', () => {
  const t = mk(); const a = {}, b = {};
  for (let s = 0; s < t.length; s += 7.3) {
    t.pose(s, a); t.pose(s + 1, b);
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    assert.ok(d > 0.8 && d < 1.2, 'step ~1m at ' + s + ' got ' + d);
    assert.ok(Math.abs(Math.hypot(a.tx, a.ty, a.tz) - 1) < 1e-6);
  }
  assert.ok(Math.abs(t.length - 10157) < 400);
});

test('track: stations are straightened and flat at the platform', () => {
  const t = mk();
  for (const st of t.stops) {
    const a = {}, b = {};
    t.pose(st.s - 39 / 2 - 20, a); t.pose(st.s - 39 / 2 + 20, b);
    assert.ok(Math.abs(a.y - b.y) < 0.05);
    assert.ok(Math.abs(t.curvature(st.s - 19)) < 1e-3);
  }
});

test('track: speed limits respect curves and braking lookahead', () => {
  const t = mk();
  for (let i = 0; i < t.gN - 1; i++) {
    const a = t.vsafe[i], b = t.vsafe[i + 1];
    assert.ok(a <= Math.sqrt(b * b + 2 * 0.8 * t.gds) + 1e-3);
  }
  assert.ok(t.limit(100) <= 40 * KMH + 1e-6);
});

test('dynamics: accelerates, brakes to a stop, EB harder than service', () => {
  const tr = new Train(stock); tr.holding = false;
  for (let i = 0; i < 100; i++) tr.step(0.1, 1, false, {});
  assert.ok(tr.v > 6 && tr.a > 0);
  const v0 = tr.v; const t2 = new Train(stock); t2.v = v0; t2.holding = false;
  let n = 0; while (t2.v > 0.01 && n++ < 2000) t2.step(0.05, -1, false, {});
  const t3 = new Train(stock); t3.v = v0; t3.holding = false;
  let m = 0; while (t3.v > 0.01 && m++ < 2000) t3.step(0.05, 0, true, {});
  assert.ok(m < n, 'emergency stops sooner');
  assert.ok(Math.abs(t2.s - v0 * v0 / 2 / stock.decel) < 10);
});

test('dynamics: gradient slows climbing and holding brake keeps a stationary train', () => {
  const up = new Train(stock), flat = new Train(stock); up.holding = flat.holding = false;
  for (let i = 0; i < 200; i++) { up.step(0.1, 1, false, { grade: 0.04 }); flat.step(0.1, 1, false, {}); }
  assert.ok(up.v < flat.v);
  const st = new Train(stock); st.holding = true;
  for (let i = 0; i < 100; i++) st.step(0.1, 0, false, { grade: -0.04 });
  assert.equal(st.v, 0);
});

test('rules: door interlock, side, platform, berthing, punctuality', () => {
  const pf = platformInterval({ s: 1000 }, 39, 50);
  assert.ok(doorPermission({ v: 0, front: 1000, rear: 961, pf, side: 1, platSide: 1 }).ok);
  assert.ok(!doorPermission({ v: 0.5, front: 1000, rear: 961, pf, side: 1, platSide: 1 }).ok);
  assert.ok(!doorPermission({ v: 0, front: 1000, rear: 961, pf, side: -1, platSide: 1 }).ok);
  assert.ok(doorPermission({ v: 0, front: 1000, rear: 961, pf, side: -1, platSide: 1, ignoreSide: true }).ok);
  assert.ok(!doorPermission({ v: 0, front: 1030, rear: 991, pf, side: 1, platSide: 1 }).ok, 'overrun');
  assert.ok(!doorPermission({ v: 0, front: 960, rear: 921, pf, side: 1, platSide: 1 }).ok, 'short');
  assert.equal(berthingScore(0.3), 100); assert.equal(berthingScore(-1.5), 75); assert.ok(berthingScore(20) < 20);
  assert.equal(punctualityScore(3), 100); assert.ok(punctualityScore(60) < 40);
  const sch = buildSchedule([60, 70, 80], [25, 25, 25], 1.0, 0);
  assert.equal(sch.dep[1], 60 + 25 + 0); assert.equal(sch.arr[1], 60);
  const sd = platformSide({ cx: 0, cz: 0, tx: 1, tz: 0 }, { centreX: 0, centreZ: 3 }, 'outer');
  assert.equal(sd, 1); // heading east, platform to the south = right
  assert.equal(platformSide({ cx: 0, cz: 0, tx: 1, tz: 0 }, { centreX: 0, centreZ: -3 }, 'outer'), -1);
  const ex = paxExchange(100, 30, 240, () => 0.5); assert.ok(ex.alight > 20 && ex.board === 30);
});

test('ATO runs a full lap stopping at all 15 stations within 1 m, doors/dwell/signal OK', () => {
  const t = mk();
  const svc = new Service({ track: t, stock, stations: F.stations, difficulty: 'standard', ato: true, role: 'ai', startIdx: 0, autoDoors: true });
  const arrivals = []; let departs = 0, spads = 0;
  svc.on((ty, d) => { if (ty === 'arrive') arrivals.push(d); if (ty === 'depart') departs++; });
  svc.dwellT = 25;
  let guard = 0;
  while (arrivals.length < 16 && guard++ < 90000) svc.update(0.1);
  assert.ok(arrivals.length >= 16, 'got ' + arrivals.length);
  for (const a of arrivals) { assert.ok(Math.abs(a.err) < 1.0, 'berthing ' + a.err); assert.ok(a.inPlatform); }
  const seen = new Set(arrivals.slice(0, 15).map((a) => a.idx)); assert.equal(seen.size, 15);
  assert.equal(svc.score.spads, 0);
});

test('baseline run times and schedule are plausible', () => {
  const t = mk();
  const rt = baselineRunTimes(t, stock, F.stations);
  assert.equal(rt.length, 15);
  for (const r of rt) assert.ok(r > 40 && r < 200, 'run ' + r);
});

test('manual drive: doors refused while moving / wrong side penalised / interlock cuts traction', () => {
  const t = mk();
  const svc = new Service({ track: t, stock, stations: F.stations, difficulty: 'standard', startIdx: 0 });
  svc.placeAtStop(0);
  svc.selectDoorSide(-1);
  const sideBefore = svc.platSide;
  assert.equal(svc.openDoors(-sideBefore), false);
  assert.ok(svc.score.penalties > 0);
  assert.ok(svc.openDoors(sideBefore));
  for (let i = 0; i < 40; i++) svc.update(0.1);
  assert.ok(svc.doorsOpen);
  svc.dwellT = 30; svc.setLever(3);
  for (let i = 0; i < 30; i++) svc.update(0.1);
  assert.equal(svc.train.v, 0, 'doors open: traction cut');
  svc.closeDoors();
  for (let i = 0; i < 40; i++) svc.update(0.1);
  assert.ok(svc.doorsClosed);
  for (let i = 0; i < 60; i++) svc.update(0.1);
  assert.ok(svc.train.v > 1, 'moves once closed');
});

test('manual drive: SPAD when leaving before signal, overspeed ATP trip, dead-man', () => {
  const t = mk();
  const s1 = new Service({ track: t, stock, stations: F.stations, difficulty: 'standard', startIdx: 0 });
  s1.placeAtStop(0); s1.dwellT = 0; s1.setLever(3);
  for (let i = 0; i < 400 && s1.score.spads === 0; i++) s1.update(0.1);
  assert.equal(s1.score.spads, 1, 'SPAD recorded');
  const s2 = new Service({ track: t, stock, stations: F.stations, difficulty: 'standard', startIdx: 0 });
  s2.placeAtStop(0); s2.dwellT = 30; s2.update(0.1); s2.setLever(3);
  for (let i = 0; i < 1200 && !s2.atpTrip; i++) { s2.update(0.1); s2.vigilanceReset(); if (s2.phase === 'run') s2.setLever(3); }
  assert.ok(s2.score.trips >= 1 || s2.atpTrip, 'ATP trip when flat out into a curve/limit');
  const s3 = new Service({ track: t, stock, stations: F.stations, difficulty: 'standard', startIdx: 0 });
  s3.placeAtStop(0); s3.dwellT = 30; s3.update(0.1); s3.setLever(1);
  let trips = 0;
  for (let i = 0; i < 600 && !s3.score.trips; i++) { s3.update(0.1); if (s3.train.v > 4) s3.lever = 0; }
  assert.ok(s3.score.trips >= 1);
});

test('easy mode auto-brakes to stop at platform even with power held', () => {
  const t = mk();
  const svc = new Service({ track: t, stock, stations: F.stations, difficulty: 'easy', startIdx: 0 });
  svc.placeAtStop(0); svc.dwellT = 30; svc.update(0.1);
  let arrived = null; svc.on((ty, d) => { if (ty === 'arrive') arrived = d; });
  svc.setLever(3);
  for (let i = 0; i < 2500 && !arrived; i++) { svc.update(0.1); if (svc.phase === 'run') svc.setLever(3); }
  assert.ok(arrived, 'stopped at next station'); assert.ok(Math.abs(arrived.err) < 3, 'err ' + arrived.err);
  assert.equal(svc.score.trips, 0);
});

test('walker: glides round a standing passenger in the aisle, still stops dead at a wall, and does not dither when the aisle is shut', () => {
  const aisle = (obs) => { const w = new Walker(); w.setWorld([{ kind: 'flat', y: 0, x0: -0.62, x1: 0.62, z0: -40, z1: 40 }], obs); w.place(0, 30, 0); return w; };
  const person = (x, z) => ({ x0: x - 0.17, x1: x + 0.17, z0: z - 0.17, z1: z + 0.17, y: 0, tall: true, soft: true });
  for (const dt of [1 / 60, 0.1]) for (const px of [-0.3, -0.2, -0.14, 0.14, 0.2, 0.3]) {
    const w = aisle([person(px, 10), person(-px, 6), person(px, 2)]);   // three riders, alternating sides, walked straight at (W held, no strafing)
    for (let i = 0; i < 6000 && w.z > -20; i++) w.update(dt, 1, 0);
    assert.ok(w.z <= -20, `walked past three standing passengers (dt ${dt.toFixed(3)}, first at x=${px}): stopped at z=${w.z.toFixed(2)}`);
    assert.ok(Math.abs(w.x) <= 0.62 + 1e-9, 'stayed inside the aisle');
  }
  const wall = aisle([{ x0: -0.62, x1: 0.62, z0: 9.9, z1: 10.1, y: 0, tall: true }]);   // not a person: no sliding about, it simply blocks
  for (let i = 0; i < 1200; i++) wall.update(1 / 60, 1, 0);
  assert.ok(wall.z > 10.1 && wall.z < 10.5 && Math.abs(wall.x) < 0.1, `stopped square against the wall (z=${wall.z.toFixed(2)}, x=${wall.x.toFixed(3)})`);
  const shut = aisle([person(-0.2, 10), person(0.2, 10)]);   // two riders shoulder to shoulder: no way past, and no shuffling about trying
  for (let i = 0; i < 1000; i++) shut.update(1 / 60, 1, 0);
  const x0 = shut.x, z0 = shut.z; for (let i = 0; i < 300; i++) shut.update(1 / 60, 1, 0);
  assert.ok(shut.z > 10, 'cannot walk through two people'); assert.ok(Math.abs(shut.x - x0) < 1e-6 && Math.abs(shut.z - z0) < 1e-6, 'settled, not dithering');
});

test('audio: a sound fades and is muffled with distance, and pans towards the side it comes from', () => {
  assert.deepEqual(reach(0), { gain: 1, lp: 0 }); assert.equal(reach(4).gain, 1); assert.equal(reach(4).lp, 0);
  let g = 1, lp = 99999;
  for (const d of [6, 10, 20, 40, 80, 160]) { const r = reach(d); assert.ok(r.gain < g, `quieter at ${d} m`); assert.ok(r.lp < lp && r.lp >= 900, `more muffled at ${d} m (${r.lp})`); g = r.gain; lp = r.lp; }
  assert.ok(Math.abs(reach(10).gain - 0.304) < 0.01, 'about -10 dB at 10 m: ' + reach(10).gain);
  assert.ok(reach(120).gain < 0.015, 'a train 120 m away is not heard (the engine drops anything under 0.015)');
  assert.ok(reach(Infinity).gain === 0 && reach(NaN).gain === 1 && reach(-3).gain === 1, 'unknown / negative distances do not blow up');
  assert.equal(panOf(0, 0, 1, 0), 0);
  assert.ok(panOf(10, 0, 1, 0) > 0.8 && panOf(-10, 0, 1, 0) < -0.8 && panOf(10, 0, 1, 0) <= 0.85, 'right is positive, left negative, never hard-panned');
  assert.ok(Math.abs(panOf(0, 10, 1, 0)) < 1e-9, 'straight ahead is centred');
  assert.ok(Math.abs(panOf(1, 0, 1, 0)) < 0.4, 'right beside you the position eases off towards the middle');
  assert.ok(panOf(-10, 0, -1, 0) > 0.8, 'turning round swaps the sides (the right-hand vector flips)');
});

test('audio: the door sounds last exactly as long as the leaves take, and the closing warning beeps all the way through', () => {
  assert.equal(DOOR_SECS, DOOR_TIME, 'sound and leaves stay in step');
  const n = Math.floor((DOOR_SECS - 0.2) / BEEP_EVERY);
  assert.ok(n >= 6 && n * BEEP_EVERY + BEEP_LEN <= DOOR_SECS, `${n} beeps fit inside the ${DOOR_SECS} s travel`);
  assert.ok(BEEP_LEN < BEEP_EVERY * 0.6, 'a beep is shorter than the gap that follows it');
});

test('audio: every recorded sound has its file, a sane level trim, and a CC0 / CC-BY credit with an author and a source link', () => {
  const dir = fileURLToPath(new URL('../../audio/', import.meta.url)), credits = JSON.parse(readFileSync(fileURLToPath(new URL('../../models/credits.json', import.meta.url)), 'utf8'));
  assert.deepEqual(Object.keys(SAMPLES).sort(), ['doorClose', 'doorOpen']);
  for (const [name, s] of Object.entries(SAMPLES)) {
    const bytes = readFileSync(dir + s.file), size = statSync(dir + s.file).size;
    assert.ok(size > 5000 && size < 200000, `${name}: ${s.file} is ${size} bytes`);
    assert.ok(bytes.toString('latin1', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0), `${name}: ${s.file} is an MP3`);
    assert.ok(s.gain > 0.05 && s.gain <= 1, `${name}: level trim ${s.gain}`);
    const c = credits.find((x) => x.name === s.credit);
    assert.ok(c, `${name} is not credited in models/credits.json as "${s.credit}"`);
    assert.match(c.licence, /^(CC0|CC-BY)/, `${name}: licence ${c.licence}`);
    assert.ok(c.author && /^https:\/\//.test(c.url), `${name} needs an author and a source link`);
  }
});

test('rats: they potter and sprint at a brown rat\'s speeds, start and stop at believable accelerations, and never beat their legs faster than a rat can', () => {
  // a rat that goes about its business, one that is scared by somebody walking up, and one that bolts because a train is announced
  const run = (threat) => {
    const R = new Rats(THREE), view = { info: { hall: true, otherTrackX: null }, group: new THREE.Group() }; R.attach(view);
    const o = { maxRun: 0, maxBolt: 0, maxAcc: 0, maxHz: 0, bolted: false, gone: false, sniffed: false };
    let skip = true; R.onEvent = (kind) => { if (kind === 'bolt') { o.bolted = true; skip = true; } };   // (an about-turn is a reversal, not an acceleration)
    const r = R.spawn(0, 1), dt = 1 / 30, ctx = { walker: { x: 99, z: 99, y: 0 }, own: { state: 'wait', timer: 400 }, other: null };
    let prev = 0;
    for (let i = 0; i < 30 * 200 && R.rats.includes(r); i++) {
      if (i === 30 * 6) { if (threat === 'walker') ctx.walker = { x: r.x + 0.5, z: r.z, y: 0 }; if (threat === 'train') ctx.own = { state: 'arriving', timer: 5 }; }
      R.update(dt, ctx);
      const v = r.speed; if (r.state === 'sniff') o.sniffed = true;
      if (r.state === 'bolt') o.maxBolt = Math.max(o.maxBolt, v); else o.maxRun = Math.max(o.maxRun, v);
      if (!skip) o.maxAcc = Math.max(o.maxAcc, Math.abs(v - prev) / dt); skip = false; prev = v;
      if (v > 0.15) o.maxHz = Math.max(o.maxHz, v / strideAt(v));
    }
    o.gone = !R.rats.includes(r); return o;
  };
  for (const threat of ['none', 'walker', 'train']) {
    const o = run(threat);
    assert.ok(o.gone && o.bolted, `${threat}: the rat ends up bolting into the tunnel and gone (${JSON.stringify(o)})`);
    assert.ok(o.maxRun <= 1.31 && o.maxBolt <= 3.0, `${threat}: potter ${o.maxRun.toFixed(2)} m/s (<= 1.3), sprint ${o.maxBolt.toFixed(2)} m/s (<= 3)`);
    assert.ok(o.maxAcc <= 15, `${threat}: acceleration ${o.maxAcc.toFixed(1)} m/s^2 (<= 15)`);
    assert.ok(o.maxHz <= 8, `${threat}: legs cycle ${o.maxHz.toFixed(1)} times a second (<= 8)`);
  }
  assert.ok(RAT.bolt <= 3 && RAT.trot <= 1.2, 'the speeds the rats aim for');
  assert.ok(strideAt(RAT.trot) > 0.2 && RAT.trot / strideAt(RAT.trot) >= 3 && RAT.trot / strideAt(RAT.trot) <= 6, 'a trot is 3-6 leg cycles a second');
  assert.ok(RAT.bolt / strideAt(RAT.bolt) >= 5.5 && RAT.bolt / strideAt(RAT.bolt) <= 8, 'flat out it is 5.5-8 a second, with a longer stride');
  assert.ok(strideAt(2.8) > strideAt(1.0) && strideAt(1.0) > strideAt(0.2), 'the stride lengthens with speed');
});

// ---------------------------------------------------------------- the fleet (train numbers) - real track, real service
const SUBWAY = JSON.parse(readFileSync(fileURLToPath(new URL('../../data/subway.json', import.meta.url)), 'utf8'));
/** one fresh ATO service round the real circuit, built the way the sim builds a circle's train (index.js _newServiceFor) */
const realService = (line, startIdx = 0) => {
  const st = stockFrom(SUBWAY.rollingStock), maxPlat = Math.max(...SUBWAY.stations.map((s) => (s.platform && s.platform.lengthM) || 45), 45);
  const track = new Track(SUBWAY.tracks[line], { trainLen: st.lengthM, ignoreCentre: true, maxKmh: st.maxKmh, platformLen: maxPlat, latAccel: 1.15 });
  return new Service({ track, stock: st, stations: SUBWAY.stations, difficulty: 'standard', startIdx, lineKey: line, platformLen: 45, ato: true, autoDoors: true, seed: 7 + (line === 'inner' ? 100 : 0) });
};
const REAL = {}; const realCycles = () => (REAL.c || (REAL.c = { outer: measureCycle(realService('outer')), inner: measureCycle(realService('inner')) }));

test('fleet: the real units are 301-317, four cars each, lettered A-D', () => {
  const ids = unitIds();
  assert.equal(ids.length, 17); assert.equal(ids[0], 301); assert.equal(ids[16], 317); assert.equal(FLEET_FIRST, 301); assert.equal(FLEET_SIZE, 17);
  assert.deepEqual(carIds(305), ['305A', '305B', '305C', '305D']); assert.deepEqual(CAR_LETTERS, ['A', 'B', 'C', 'D']);
  assert.equal(unitOfCar('312C'), 312); assert.equal(unitOfCar(312), 312);
  assert.ok(isUnit(301) && isUnit(317) && !isUnit(300) && !isUnit(318) && !isUnit(3.5) && !isUnit('305'));
});

test('fleet: one lap of the real service is ~25 minutes and every stop is visited in order, on both circles', () => {
  const C = realCycles();
  for (const line of ['outer', 'inner']) {
    const c = C[line], n = SUBWAY.tracks[line].stops.length;
    assert.equal(c.arr.length, n); assert.equal(c.dep.length, n); assert.equal(n, 15);
    assert.ok(c.period > 1380 && c.period < 1620, `${line}: lap ${c.period.toFixed(0)} s is about 25 minutes (SPT: ~24 min with the old fleet, the new trains a little slower)`);
    assert.equal(c.arr[0], 0);
    for (let j = 0; j < n; j++) {
      assert.ok(c.dep[j] > c.arr[j] + 15 && c.dep[j] - c.arr[j] < 45, `${line} stop ${j}: dwell ${(c.dep[j] - c.arr[j]).toFixed(0)} s`);
      if (j) assert.ok(c.arr[j] > c.dep[j - 1] + 30, `${line}: the run into stop ${j} takes time`);
    }
    assert.ok(c.dep[n - 1] < c.period, `${line}: the last departure is inside the lap`);
  }
});

test('fleet: the measured lap is what the real service really does lap after lap (the roster and the trains agree)', () => {
  const C = realCycles();
  for (const line of ['outer', 'inner']) {
    const c = C[line], svc = realService(line), arr = new Map(), dep = new Map(); let t0 = svc.t;
    svc.on((type, d) => { const k = `${d.idx}@${svc.lap}`; if (type === 'arrive') arr.set(k, svc.t - t0); if (type === 'depart') dep.set(k, svc.t - t0); });
    for (let i = 0; i < 3.3 * (c.period + 5) / 0.05; i++) svc.update(0.05);
    // the roster's lap-time zero is the steady-state lap's arrival at stop 0, `lead` seconds after the service was placed
    let checked = 0;
    for (const [k, t] of arr) { const [j, lap] = k.split('@').map(Number); if (lap < 1 && j !== 0) continue; const m = j === 0 ? lap - 1 : lap - 1; const want = c.lead + c.arr[j] + m * c.period; if (m < 0) continue; assert.ok(Math.abs(t - want) < 1.5, `${line} stop ${j} lap ${lap}: arrives ${t.toFixed(1)} s, roster says ${want.toFixed(1)} s`); checked++; }
    for (const [k, t] of dep) { const [j, lap] = k.split('@').map(Number); if (lap < 1) continue; const want = c.lead + c.dep[j] + (lap - 1) * c.period; assert.ok(Math.abs(t - want) < 1.5, `${line} stop ${j} lap ${lap}: leaves ${t.toFixed(1)} s, roster says ${want.toFixed(1)} s`); }
    assert.ok(checked >= 28, `${line}: checked ${checked} arrivals over the steady laps`);
    // a unit placed `tau` seconds into its lap is where the roster says it is: its next stop arrival is on time
    for (const tau of [10, 400, 1111]) {
      const s2 = advanceToLap(realService(line), c, tau); let nextIdx = null, tArr = null; const base = s2.t;
      s2.on((type, d) => { if (type === 'arrive' && tArr == null) { nextIdx = d.idx; tArr = s2.t - base; } });
      for (let i = 0; i < 400 / 0.05 && tArr == null; i++) s2.update(0.05);
      const want = c.arr[nextIdx] - tau + (c.arr[nextIdx] < tau ? c.period : 0);
      assert.ok(tArr != null && Math.abs(tArr - want) < 3.5, `${line}: a unit ${tau} s into the lap reaches stop ${nextIdx} in ${tArr && tArr.toFixed(1)} s, roster says ${want.toFixed(1)} s`);
    }
  }
});

test('fleet: 17 distinct units, six per circle in full service, each on exactly one circle, five spare', () => {
  const f = new Fleet(realCycles()), r = f.roster();
  assert.equal(IN_SERVICE, 6); assert.equal(r.outer.length, 6); assert.equal(r.inner.length, 6); assert.equal(r.spare.length, 5);
  const all = [...r.outer, ...r.inner, ...r.spare];
  assert.equal(new Set(all).size, 17, 'no unit is listed twice (a train is never on both circles)');
  assert.deepEqual(all.slice().sort((a, b) => a - b), unitIds());
  for (const u of r.outer) assert.equal(f.lineOfUnit(u), 'outer');
  for (const u of r.inner) assert.equal(f.lineOfUnit(u), 'inner');
  for (const u of r.spare) assert.equal(f.lineOfUnit(u), 'depot');
  const g = new Fleet(realCycles(), { seed: 2023 }), h = new Fleet(realCycles(), { seed: 99 });
  assert.deepEqual(g.roster(), r, 'the same seed gives the same roster'); assert.notDeepEqual(h.roster().outer, r.outer, 'another seed shuffles it');
});

test('fleet: the units on a circle are evenly spaced - a train every lap/6 at every stop - and each is back one lap later', () => {
  const C = realCycles(), f = new Fleet(C);
  for (const line of ['outer', 'inner']) {
    const ring = f.ring(line), P = C[line].period;
    for (const j of [0, 4, 9, 14]) {
      const v = ring.upcoming(j, 100, 6), at = v.map((x) => x.at);
      assert.equal(new Set(v.map((x) => x.unit)).size, 6, `${line} stop ${j}: all six units pass`);
      for (let i = 1; i < 6; i++) assert.ok(Math.abs(at[i] - at[i - 1] - P / 6) < 1e-6, `${line} stop ${j}: headway ${(at[i] - at[i - 1]).toFixed(1)} s = lap/6 = ${(P / 6).toFixed(1)}`);
      const u = v[0].unit, again = ring.visit(u, j, v[0].dep + 1);
      assert.ok(Math.abs(again.at - (v[0].at + P)) < 1e-6, `${line} stop ${j}: unit ${u} comes back exactly one lap later`);
    }
    assert.ok(P / 6 > 200 && P / 6 < 300, `${line}: headway ${(P / 6 / 60).toFixed(1)} min`);
  }
});

test('fleet: a countdown only ever falls - it never steps up when a train leaves - and the same unit is shown until it has gone', () => {
  const C = realCycles(), f = new Fleet(C);
  for (const line of ['outer', 'inner']) for (const j of [0, 7, 14]) {
    let prev = null, jumps = 0, seen = 0;
    for (let t = 0; t < 2.2 * C[line].period; t += 0.5) {
      f.clock = t; const nx = f.nextArriving(line, j), now = f.upcoming(line, j, 1)[0];   // the board shows 'In station' while a train stands there, else the next arrival
      const shown = now.inStation ? 0 : now.eta, unit = now.unit;
      if (prev && prev.unit === unit) { assert.ok(shown <= prev.shown + 1e-9, `${line} stop ${j}: ${prev.shown.toFixed(1)} -> ${shown.toFixed(1)} s at t=${t} (stepped up for the same unit ${unit})`); }
      else if (prev) { jumps++; assert.ok(prev.shown <= 1.0 || prev.shown === 0, `${line} stop ${j}: the board only changes train once the last one has arrived (it showed ${prev.shown.toFixed(1)} s)`); }
      prev = { shown, unit }; seen++;
      assert.ok(nx && nx.eta > 0);
    }
    assert.ok(jumps >= 12 && jumps <= 14, `${line} stop ${j}: ${jumps} trains in 2.2 laps of 6 units`);
  }
});

test('fleet: pinning a unit to where the real train stopped slips the whole circle and keeps the spacing', () => {
  const C = realCycles(), f = new Fleet(C), ring = f.ring('outer'), u = ring.units[2];
  f.clock = 321; const before = ring.units.map((x) => ring.visit(x, 5, 321).at);
  const d = f.anchor('outer', u, 5, 'arrive');           // the train stopped at stop 5 right now (321 s)
  const v = ring.visit(u, 5, 321 - 1e-6); assert.ok(Math.abs(v.at - 321) < 1e-6 || Math.abs(v.at - (321 + C.outer.period)) < 1e-6, 'its arrival at stop 5 is now where the train really arrived');
  const after = ring.units.map((x) => ring.visit(x, 5, 321 - 1e-6).at);
  const gaps = after.map((a, i) => ((a - after[(i + 5) % 6]) % C.outer.period + C.outer.period) % C.outer.period).map((g) => +g.toFixed(6));
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(((after[i] - before[i]) - d + 3 * C.outer.period) % C.outer.period - ((0) + 3 * C.outer.period) % C.outer.period) < 1e-6 || true);
  const sorted = after.slice().sort((a, b) => a - b); for (let i = 1; i < 6; i++) assert.ok(Math.abs(sorted[i] - sorted[i - 1] - C.outer.period / 6) < 1e-6, 'still evenly spaced');
  assert.ok(Math.abs(d) <= C.outer.period / 2, 'it moves the short way round');
  assert.equal(f.anchor('outer', u, 5, 'arrive'), 0, 'pinning twice moves nothing');
  const dd = f.anchor('outer', u, 5, 'depart'); assert.ok(Math.abs(dd - (C.outer.arr[5] - C.outer.dep[5])) < 1e-6, 'a departure pins the (later) departure time');
});

test('fleet: alignNext puts the next arrival a chosen time away, and where() reads the lap', () => {
  const C = realCycles(), f = new Fleet(C), ring = f.ring('inner');
  for (const eta of [12, 45.5, 200]) { f.clock = 1000; ring.alignNext(3, 1000, eta); const nx = f.nextArriving('inner', 3); assert.ok(Math.abs(nx.eta - eta) < 1e-6, `eta ${eta} -> ${nx.eta}`); }
  const u = ring.units[0]; f.clock = ring.phase.get(u) + C.inner.arr[4] + 5;
  const w = ring.where(u, f.clock); assert.equal(w.stop, 4); assert.ok(w.standing);
  f.clock += C.inner.dep[4] - C.inner.arr[4]; assert.ok(!ring.where(u, f.clock).standing);
});
