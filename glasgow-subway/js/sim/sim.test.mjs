import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture } from './fixture.mjs';
import { Track } from './track.js';
import { Train, stockFrom, notchToCmd } from './dynamics.js';
import { Service, baselineRunTimes } from './service.js';
import { doorPermission, berthingScore, punctualityScore, buildSchedule, platformInterval, platformSide, DIFFICULTY, paxExchange } from './rules.js';
import { KMH } from './util.js';

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
