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
