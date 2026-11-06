// node --test js/sim/motion.test.mjs
// The people-motion rubric (research/people-motion-rubric.md, js/sim/motion_metrics.mjs) and the procedural gait (js/sim/gait.js), tested without a browser: the gait drives the real
// rig of four of the people through js/sim/gait_emu.mjs. Two kinds of test: the gait does what it should, and the metrics notice it when a walk does not - a good walk is spoiled in
// ways the rubric exists to catch (skating, hovering, no bob, arms in phase with the legs, locked arms, a nodding head, jitter, one arm lazier than the other) and the category
// that should notice has to drop.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { steady, record, bodyOf, PEOPLE, FIXTURE, M, G } from './gait_emu.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tolerance ${tol})`);
const catsOf = (a) => { const sc = M.scoreSteady(a), o = {}; for (const c of Object.keys(sc)) if (sc[c].length) o[c] = M.catScore(sc[c]); return o; };
const SPEEDS = [0.8, 1.2, 1.6];

// ------------------------------------------------------------------------------------------------------------------------ the rubric itself
test('the rubric table in research/people-motion-rubric.md is the one the code prints', () => {
  const doc = fs.readFileSync(new URL('../../research/people-motion-rubric.md', import.meta.url), 'utf8').replace(/\r/g, '');
  const m = doc.match(/<!--RUBRIC_TABLE-->\n([\s\S]*?)\n<!--\/RUBRIC_TABLE-->/);
  assert.ok(m, 'the table markers are in the document');
  assert.equal(m[1].trim(), M.rubricTable().trim());
});
test('category weights sum to 100 and every item belongs to a category', () => {
  assert.equal(Object.values(M.CATS).reduce((s, w) => s + w, 0), 100);
  for (const it of [...M.ITEMS, ...M.TRN_ITEMS, ...M.RNG_ITEMS]) assert.ok(M.CATS[it.id.split('.')[0]], it.id);
  assert.equal(new Set([...M.ITEMS, ...M.TRN_ITEMS, ...M.RNG_ITEMS].map((i) => i.id)).size, M.ITEMS.length + M.TRN_ITEMS.length + M.RNG_ITEMS.length, 'ids are unique');
});
test('the scoring ramps: full marks inside, none outside, nothing for a missing number', () => {
  assert.equal(M.fall(1, 2, 10), 10); assert.equal(M.fall(10, 2, 10), 0); near(M.fall(6, 2, 10), 5, 1e-9); assert.equal(M.fall(NaN, 2, 10), 0);
  assert.equal(M.rise(0.9, 0.2, 0.8), 10); assert.equal(M.rise(0.1, 0.2, 0.8), 0); near(M.rise(0.5, 0.2, 0.8), 5, 1e-9);
  assert.equal(M.band(5, 4, 6, 0, 10), 10); assert.equal(M.band(0, 4, 6, 0, 10), 0); assert.equal(M.band(10, 4, 6, 0, 10), 0); near(M.band(2, 4, 6, 0, 10), 5, 1e-9); assert.equal(M.band(NaN, 4, 6, 0, 10), 0);
});
test('a category is 0.6 x the weighted mean + 0.4 x its worst item: one broken item cannot hide in an average', () => {
  const items = [{ w: 1, score: 10 }, { w: 1, score: 10 }, { w: 1, score: 10 }, { w: 1, score: 0 }];
  near(M.catScore(items), 0.6 * 7.5 + 0.4 * 0, 1e-9);
  assert.ok(Number.isNaN(M.catScore([])));
});
test('what a healthy adult does scales with speed and leg length (dynamic similarity)', () => {
  const a = M.expected(1.2, 0.92), b = M.expected(1.6, 0.92), c = M.expected(1.2, 0.70);
  assert.ok(b.cadence > a.cadence && b.stepLen > a.stepLen && b.kneeSwing > a.kneeSwing && b.armRange > a.armRange, 'faster: quicker, longer, bendier, swingier');
  assert.ok(c.cadence > a.cadence && c.stepLen < a.stepLen, 'shorter legs: quicker steps, shorter');
  near(a.cadence * a.stepLen, 1.2 * 60, 1e-6, 'cadence x step length = speed');
});

// ------------------------------------------------------------------------------------------------------------------------ the gait
test('the fixture carries the rig and the four bodies the gait is tested on', () => {
  assert.equal(FIXTURE.bones.length, FIXTURE.parent.length);
  for (const nm of G.CONTROLLED) assert.ok(FIXTURE.bones.includes(nm), nm);
  assert.deepEqual(PEOPLE.slice().sort(), ['boy', 'man_commuter', 'man_elder', 'woman_midi']);
  for (const id of PEOPLE) { const B = bodyOf(id); near(B.legLen, B.leg[0].l1 + B.leg[0].l2, 1e-9); assert.ok(B.hipY > 0.6 && B.hipY < 1.05, id); near(B.leg[0].l1 + B.leg[0].l2 + B.leg[0].ankleH, B.hipY, 0.03, id + ': leg + ankle = hip height'); }
});
test('the two-bone IK puts the ankle where the gait asks, for every body, through starts, walks, stops and turns', () => {
  for (const id of PEOPLE) {
    const B = bodyOf(id), g = G.newGait(B, {}); let x = 0, z = 0, yaw = 0, worst = 0, bad = 0, n = 0;
    for (let k = 0; k < 60 * 14; k++) {
      const t = k / 60, walking = t > 1 && t < 10, v = walking ? 1.3 : 0; if (t > 6 && t < 6.5) yaw += 0.02;
      x += -Math.sin(yaw) * v / 60; z += -Math.cos(yaw) * v / 60;
      G.gaitUpdate(g, 1 / 60, { x, z, yaw, v, walking });
      const T = G.gaitTargets(g), S = G.gaitSolve(g, T), fk = G.gaitFK(B, S);
      for (let s = 0; s < 2; s++) {
        const f = T.feet[s], dx = f.A[0] - x, dz = f.A[2] - z, c = Math.cos(yaw), sn = Math.sin(yaw), want = [dx * c - dz * sn, f.A[1], dx * sn + dz * c], got = fk.P[B.ix['foot_' + 'lr'[s]]];
        const e = G.len(G.sub(want, got)); worst = Math.max(worst, e); n++; if (e > 0.003) bad++;
      }
    }
    assert.ok(bad / n < 0.01, `${id}: ${bad} of ${n} ankle placements more than 3 mm off (worst ${(worst * 1000).toFixed(1)} mm)`);
  }
});
test('the solved rotations are unit quaternions and finite, whatever the input does (jumps in speed, heading and position, stop-start)', () => {
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (const id of PEOPLE) {
    const B = bodyOf(id), g = G.newGait(B, { armOut: [4, 10] }); let x = 0, z = 0, yaw = 0, v = 0, walking = false;
    for (let k = 0; k < 2400; k++) {
      if (k % 25 === 0) { v = [0, 0.05, 0.12, 0.3, 0.8, 1.4, 2.5, 4][Math.floor(rnd() * 8)]; walking = rnd() < 0.7; }
      if (k % 90 === 0 && rnd() < 0.5) yaw += (rnd() - 0.5) * 6;
      if (k % 400 === 399) { x += (rnd() - 0.5) * 20; z += (rnd() - 0.5) * 20; }
      x += -Math.sin(yaw) * v / 60; z += -Math.cos(yaw) * v / 60;
      G.gaitUpdate(g, 1 / 60, { x, z, yaw, v, walking });
      const T = G.gaitTargets(g), S = G.gaitSolve(g, T);
      for (const [nm, q] of Object.entries(S.q)) { assert.ok(q.every(Number.isFinite), `${id} ${nm} frame ${k}`); near(Math.hypot(...q), 1, 1e-6, `${id} ${nm} |q|`); }
      assert.ok(S.pelvisPos.every(Number.isFinite));
    }
  }
});
test('a full solve answers for exactly the controlled bones; a legs-only solve for the leg chain, and puts the feet where it is told', () => {
  const B = bodyOf('man_commuter'), g = G.newGait(B, {});
  G.gaitUpdate(g, 1 / 60, { x: 0, z: 0, yaw: 0, v: 0, walking: false });
  const T = G.gaitTargets(g), S = G.gaitSolve(g, T);
  assert.deepEqual(Object.keys(S.q).sort(), G.CONTROLLED.slice().sort());
  const L = G.gaitSolve(g, T, { legsOnly: true, pelvis: { pos: B.P0[B.ix.pelvis], q: B.Q0[B.ix.pelvis] } });
  assert.deepEqual(Object.keys(L.q).sort(), ['ball_l', 'ball_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'thigh_l', 'thigh_r']);
  const fk = G.gaitFK(B, L);
  for (let s = 0; s < 2; s++) { const f = T.feet[s], want = [f.A[0], f.A[1], f.A[2]], got = fk.P[B.ix['foot_' + 'lr'[s]]]; assert.ok(G.len(G.sub(want, got)) < 0.02, 'ankle ' + s + ' ' + want + ' vs ' + got); }
});
test('a steady walk is planted, grounded and well timed for every body at 0.8, 1.2 and 1.6 m/s', () => {
  for (const id of PEOPLE) for (const v of SPEEDS) {
    const { a } = steady(id, v); assert.ok(a.ok, `${id}@${v}: ${a.reason}`);
    // (the worst is woman_midi at 1.6 m/s, 5.0 cm/s with a metronome or any seed alike: it is the planted ankle's hinge against the rolling sole, not the variability - see the rolling-contact item in the rubric notes)
    assert.ok(a.slip < 5.5, `${id}@${v} slip ${a.slip.toFixed(2)} cm/s`);
    assert.ok(a.sinkMm < 1 && a.floatMm < 1 && a.noContactPct < 1, `${id}@${v} sink ${a.sinkMm} float ${a.floatMm} flight ${a.noContactPct}`);
    near(a.cadence / a.ex.cadence, 1, 0.08, `${id}@${v} cadence`); near(a.stepLen / a.ex.stepLen, 1, 0.08, `${id}@${v} step length`);
    assert.ok(a.symStepTime < 3 && a.symStepLen < 4, `${id}@${v} symmetry`);
    assert.ok(a.pelvis.bobPP > 10 && a.pelvis.swayPP > 20 && a.pelvis.yawPP > 4, `${id}@${v}: the pelvis moves (bob ${a.pelvis.bobPP.toFixed(0)} mm, sway ${a.pelvis.swayPP.toFixed(0)} mm, yaw ${a.pelvis.yawPP.toFixed(1)} deg)`);
    assert.ok(a.arm.corr < -0.8 && a.arm.range > 15, `${id}@${v}: arms swing against the legs (r ${a.arm.corr.toFixed(2)}, range ${a.arm.range.toFixed(0)} deg)`);
  }
});
test('the steady-walk categories score well: none below 7 at 0.8 and 1.2 m/s, mean over everything above 9', () => {
  const all = [];
  for (const id of PEOPLE) for (const v of SPEEDS) {
    const c = catsOf(steady(id, v).a);
    for (const k of Object.keys(c)) { all.push(c[k]); if (v < 1.5) assert.ok(c[k] >= 7, `${id}@${v} ${k} ${c[k].toFixed(1)}`); }
  }
  const mean = all.reduce((s, x) => s + x, 0) / all.length; assert.ok(mean > 9, 'mean steady category ' + mean.toFixed(2));
});
// Revision 9 found the gait a metronome (stride-time CV 0.01-0.3 %, against a healthy 1-3 %) and TIM sat near 4 for everybody. The gait now varies from stride to stride (a seeded, per-person
// random process: timing that drifts and comes back, step length and width that differ from step to step, the foot's turn-out), so TIM reads 10 - and the same walk with the variation switched off
// (var.vary = 0) must still be caught, or the items have stopped asking for it.
test('timing and symmetry: every TIM item scores 8 or more for every body at 0.8, 1.2 and 1.6 m/s, and a metronome is caught by the variability items', () => {
  for (const id of PEOPLE) for (const v of SPEEDS) {
    for (const it of M.scoreSteady(steady(id, v).a).TIM) assert.ok(it.score >= 8, `${id}@${v} ${it.id} ${it.value} -> ${it.score.toFixed(1)}`);
    const items = M.scoreSteady(steady(id, v, { var: { vary: 0 } }).a).TIM;
    assert.ok(items.some((it) => /^TIM\.cv[TL]$/.test(it.id) && it.score < 6), `${id}@${v}: the variability items see the metronome`);
  }
});
test('stride-to-stride variability: the same seed gives the same walk, another seed another; stride time varies 1 - 3.5 % and step length 1.5 - 4 % (CV)', () => {
  for (const id of PEOPLE) {
    const A = steady(id, 1.2), B = steady(id, 1.2), C = steady(id, 1.2, { seed: 99 });
    assert.deepEqual(A.rec.pos, B.rec.pos, id + ': the same seed must give the same walk every run');
    assert.ok(C.rec.pos.some((x, i) => x !== A.rec.pos[i]), id + ': another seed must give another walk');
    const cv = Object.fromEntries(M.scoreSteady(A.a).TIM.filter((it) => /^TIM\.cv[TL]$/.test(it.id)).map((it) => [it.id, it.value]));
    assert.ok(cv['TIM.cvT'] > 1 && cv['TIM.cvT'] < 3.5 && cv['TIM.cvL'] > 1.5 && cv['TIM.cvL'] < 4, `${id}: CV of stride time ${cv['TIM.cvT']} %, of step length ${cv['TIM.cvL']} %`);
  }
  assert.equal(G.seedOf('boy'), G.seedOf('boy')); assert.notEqual(G.seedOf('boy'), G.seedOf('man_commuter'));
  for (const id of PEOPLE) assert.ok(Number.isInteger(G.seedOf(id)) && G.seedOf(id) >= 0 && G.seedOf(id) < 2 ** 32, id);
});
// The vertical acceleration of the pelvis. A walker's moves at a few m/s^2; the gait's used to stomp at every step (p99 15 - 59 m/s^2) because the pelvis was held to the legs' reach so hard it
// rode it. The bob is now fitted under the reach the legs have, so it is smooth - and at the price of a little height.
test('the pelvis accelerates smoothly: 99th percentile under 12 m/s^2 for every body at 0.8, 1.2 and 1.6 m/s, and SMO.pelAcc scores 7 or more', () => {
  for (const id of PEOPLE) for (const v of SPEEDS) {
    const { a } = steady(id, v), it = M.scoreSteady(a).SMO.find((x) => x.id === 'SMO.pelAcc');
    assert.ok(a.smooth.pelAcc < 12, `${id}@${v}: p99 |a_y| ${a.smooth.pelAcc.toFixed(1)} m/s^2`);
    assert.ok(it && it.score >= 7, `${id}@${v}: SMO.pelAcc ${a.smooth.pelAcc.toFixed(1)} -> ${it && it.score.toFixed(1)}`);
  }
});
test('the pelvis acceleration item sees a stomp: a 3 cm notch, 6 frames wide, at every step scores under 3 (the unspoiled walk is over 8)', () => {
  const { a, rec } = steady('man_commuter', 1.2), y = Float64Array.from(rec.s('pelvis').y), w = 6, k0 = Math.round(7 / rec.dt);
  for (let k = 1; k < rec.n; k++) if (Math.floor(rec.phase[k] * 2) !== Math.floor(rec.phase[k - 1] * 2)) for (let j = 0; j < w && k + j < rec.n; j++) y[k + j] -= 0.015 * (1 - Math.cos(2 * Math.PI * j / w));
  const acc = []; for (let i = k0; i < rec.n - 1; i++) acc.push(Math.abs(y[i + 1] - 2 * y[i] + y[i - 1]) / (rec.dt * rec.dt)); acc.sort((p, q) => p - q);
  const spoiled = acc[Math.floor(0.99 * acc.length)], score = (pel) => M.scoreSteady({ ...a, smooth: { ...a.smooth, pelAcc: pel } }).SMO.find((x) => x.id === 'SMO.pelAcc').score;
  assert.ok(score(spoiled) < 3, `p99 ${spoiled.toFixed(1)} m/s^2 -> ${score(spoiled).toFixed(1)}`);
  assert.ok(score(a.smooth.pelAcc) > 8, `the unspoiled walk: p99 ${a.smooth.pelAcc.toFixed(1)} -> ${score(a.smooth.pelAcc).toFixed(1)}`);
});
test('the pelvis acceleration is judged at 60 Hz for any faster recording (and as recorded for a slower one): the second difference taken at 144 Hz read the same walk 1.5 - 3 times as rough (round-2 review, 5.1); the resampled item still reads 10 - 23 % below its native value (round-3 review), which this emulator test, with its 0.6 - 1.5 tolerance, cannot see', () => {
  // the resampler: the series itself (the very array) at 60 Hz and slower, exact on a straight line at any faster rate, and one sample per 1/60 s
  const ramp = (dt, n) => Float64Array.from({ length: n }, (_, i) => 0.9 + 0.35 * i * dt);
  for (const dt of [1 / 60, 1 / 30]) { const y = ramp(dt, 50); assert.strictEqual(M.atAnalysisRate(y, dt), y, `1/${Math.round(1 / dt)} s is read as recorded`); }
  for (const dt of [1 / 90, 1 / 120, 1 / 144]) {
    const y = ramp(dt, 300), r = M.atAnalysisRate(y, dt);
    assert.equal(r.length, Math.floor(299 * dt * 60 + 1e-9) + 1, `1/${Math.round(1 / dt)} s: one sample per 1/60 s`);
    for (let j = 0; j < r.length; j++) near(r[j], 0.9 + 0.35 * j / 60, 1e-9, `1/${Math.round(1 / dt)} s sample ${j}`);
  }
  // a kink in a series (a heel strike) is a second difference of (slope change) / dt, so a series with one at every step reads 2.4 times as large at 144 Hz as at 60 Hz when it is not resampled
  const kinked = (dt) => { const n = Math.round(6 / dt), y = new Float64Array(n); for (let i = 0; i < n; i++) { const f = (i * dt / 0.5) % 1; y[i] = 0.03 * (f < 0.5 ? f * 2 : 2 - f * 2); } return y; };
  const p99 = (y, dt) => { const a = []; for (let i = 1; i < y.length - 1; i++) a.push(Math.abs(y[i + 1] - 2 * y[i] + y[i - 1]) / (dt * dt)); a.sort((p, q) => p - q); return a[Math.floor(0.99 * a.length)]; };
  const raw144 = p99(kinked(1 / 144), 1 / 144), at60 = p99(kinked(1 / 60), 1 / 60), via60 = p99(M.atAnalysisRate(kinked(1 / 144), 1 / 144), 1 / 60);
  assert.ok(raw144 / at60 > 1.8, `a kinked series at 144 Hz reads ${(raw144 / at60).toFixed(2)} times the 60 Hz value when its second difference is taken at the recording rate (the control: this is the artefact)`);
  assert.ok(via60 / at60 > 0.6 && via60 / at60 < 1.4, `... and ${(via60 / at60).toFixed(2)} times it when it is read at 60 Hz`);
  // the real gait through the real item: the same walk recorded at 144 Hz scores within a factor of 1.5 of itself at 60 Hz (the gait's own step is the frame time, so it is not identical), and the raw second difference does not
  let worstRaw = 0;
  for (const id of PEOPLE) for (const v of [1.2, 1.6]) {
    const sc = M.SCEN.steady(v), a60 = steady(id, v).a.smooth.pelAcc, { rec, a } = steady(id, v, { dt: 1 / 144 }), yw = rec.s('pelvis').y, k0 = Math.round(sc.win[0] / rec.dt), k1 = Math.min(rec.n, Math.round(sc.win[1] / rec.dt));
    const ratio = a.smooth.pelAcc / a60, rawRatio = p99(Float64Array.from(yw).subarray(k0, k1), rec.dt) / a.smooth.pelAcc; worstRaw = Math.max(worstRaw, rawRatio);
    assert.ok(ratio > 0.6 && ratio < 1.5, `${id}@${v}: 144 Hz ${a.smooth.pelAcc.toFixed(1)} vs 60 Hz ${a60.toFixed(1)} m/s^2 (ratio ${ratio.toFixed(2)})`);
  }
  assert.ok(worstRaw > 2, `the raw second difference at 144 Hz reads up to ${worstRaw.toFixed(2)} times what the item reads (it must be over 2 for the test to be able to tell the old item from the new)`);
});
test('faster is quicker and longer; shorter legs step quicker', () => {
  const by = {}; for (const id of PEOPLE) { by[id] = SPEEDS.map((v) => steady(id, v).a); for (let i = 1; i < SPEEDS.length; i++) assert.ok(by[id][i].cadence > by[id][i - 1].cadence && by[id][i].stepLen > by[id][i - 1].stepLen, id); }
  assert.ok(by.boy[1].cadence > by.man_commuter[1].cadence && by.boy[1].stepLen < by.man_commuter[1].stepLen, 'boy vs man at 1.2 m/s');
});
test('the pelvis does not pop when the trailing foot leaves the floor (a short foot at a fast walk used to jump 6 cm in a frame)', () => {
  for (const id of PEOPLE) for (const v of [1.2, 1.9]) {
    const { rec } = steady(id, v), y = rec.s('pelvis').y; let jump = 0; for (let k = Math.round(7 / rec.dt) + 1; k < rec.n; k++) jump = Math.max(jump, Math.abs(y[k] - y[k - 1]));
    assert.ok(jump < 0.022, `${id}@${v}: the pelvis moves ${(jump * 1000).toFixed(1)} mm in one frame`);
  }
});
// Setting off. The root speeds up from rest to 1.2 - 1.6 m/s in about a second, and the first foot used to be put down short of where the body would be (placed for the speed of the first frame):
// the stance foot then trailed 15 cm farther than a step's reach at its toe-off and the pelvis sagged 10 cm and more (102 mm on average over four bodies at 1.2 and 1.6 m/s, up to 158) for the first
// seconds of every walk. Feet are now placed for the speed the body will have (the smoothed acceleration, to the end of the swing). The deepest sag below the walk's own standing height, in the first 6 s:
test('setting off: the pelvis sags under 95 mm below its walking height in the first 6 s (it was 102 mm on average, up to 158, when the first foot was put down for the speed of the first frame)', () => {
  for (const id of PEOPLE) for (const v of [1.2, 1.6]) {
    let sag = 0, t0 = null; const sc = M.SCEN.steady(v);
    record(id, sc.plan, { onFrame: (k, g, T) => { if (!g.walking) return; if (t0 == null) t0 = k; if ((k - t0) / 60 < 6) sag = Math.max(sag, g.P.hPeak - T.pelvisPos[1]); } });
    assert.ok(sag < 0.095, `${id}@${v}: the pelvis sags ${(sag * 1000).toFixed(0)} mm`);
  }
});
test('a frame of no time, or a long one, does not poison the gait (the acceleration estimate divides by dt)', () => {
  const B = bodyOf('man_commuter'), g = G.newGait(B, { armOut: [6, 6], seed: 3 });
  let x = 0, z = 0, bad = 0;
  for (let k = 0; k < 600; k++) {
    const dt = k % 37 === 5 ? 0 : k === 300 ? 1.5 : 1 / 60, v = Math.min(1.3, k / 60 * 1.4);
    z -= v * dt; G.gaitUpdate(g, dt, { x, z, yaw: 0, v, walking: true, stopD: null });
    const T = G.gaitTargets(g); if (![g.acc, ...T.pelvisPos, ...T.feet[0].A, ...T.feet[1].A].every(Number.isFinite)) bad++;
  }
  assert.equal(bad, 0, 'frames with a non-finite acceleration, pelvis or ankle');
});
test('the head is held nearly still and level, but not rigid', () => {
  const a = steady('man_commuter', 1.2).a;
  assert.ok(a.head.pitchPP > 0.5 && a.head.pitchPP < 4 && a.head.yawPP > 0.5 && a.head.yawPP < 6 && a.head.rollPP < 3, JSON.stringify(a.head));
});
test('standing: a stop brings the feet to rest within a second and the pelvis to its standing height, and nothing creeps afterwards', () => {
  for (const id of PEOPLE) {
    const rec = new M.Rec(record(id, [{ dur: 2, v: 0, state: 'stand' }, { dur: 4, v: 1.2, state: 'walk' }, { dur: 4, v: 0, state: 'stand' }])), n = rec.n, hip = rec.info.hipY, k1 = n - 1, k0 = n - 1 - 120;
    for (const nm of ['heel_l', 'heel_r', 'bs_l', 'bs_r', 'toe_l', 'toe_r']) { const S = rec.s(nm); assert.ok(Math.hypot(S.x[k1] - S.x[k0], S.y[k1] - S.y[k0], S.z[k1] - S.z[k0]) < 0.004, `${id} ${nm} creeps while standing`); }
    near(rec.s('thigh_l').y[k1], hip, 0.025, id + ' hip height when standing');
  }
});
test('turning on the spot and in the stride drags no foot far', () => {
  for (const id of PEOPLE) {
    const sp = M.SCEN.spin(120), rs = new M.Rec(record(id, sp.plan)), spin = M.analyseSpin(rs, sp.win); assert.ok(spin.slipPath < 8, `${id} spin drag ${spin.slipPath.toFixed(1)} cm`);
    for (const d of [90, -90]) { const sc = M.SCEN.turn(d), t = M.analyseTurn(new M.Rec(record(id, sc.plan)), sc.win); assert.ok(t.slip < 15, `${id} turn ${d} slip ${t.slip.toFixed(1)} cm/s`); }
  }
});
test('setting off: the first heel strike follows the command within 0.8 s and no distance is covered on planted feet', () => {
  for (const id of PEOPLE) { const rec = new M.Rec(record(id, M.SCEN.startstop().plan)), st = M.analyseStart(rec), sp = M.analyseStop(rec); assert.ok(st.ok && sp.ok);
    assert.ok(st.latency < 0.8 && st.glide < 0.12, `${id} latency ${st.latency} glide ${st.glide}`); assert.ok(sp.slideCm < 1 && sp.finalStagger < 0.05 && sp.settle < 1.3, `${id} stop ${JSON.stringify(sp)}`); }
});
test('a planned stop lands the feet where the person will stand: no foot is walked back, the last step is quick, and it is the knowledge of the distance that does it', () => {
  const backstep = (rec, kS) => { let back = 0; for (const nm of ['heel_l', 'heel_r']) { const S = rec.s(nm); for (let k = kS; k < rec.n; k++) back = Math.max(back, S.z[k] - S.z[kS]); } return back; };   // heading is -z: a heel that gains z is going backwards
  for (const id of PEOPLE) {
    const plan = M.SCEN.startstop().plan, told = new M.Rec(record(id, plan)), blind = new M.Rec(record(id, plan, { noStopD: true })), a = M.analyseStop(told), b = M.analyseStop(blind);
    assert.ok(a.settle < 0.7 && a.finalStagger < 0.04 && a.slideCm < 1, `${id}: ${JSON.stringify(a)}`);
    assert.ok(backstep(told, a.kStop) < 0.02, `${id}: a foot is walked back ${(backstep(told, a.kStop) * 100).toFixed(1)} cm once the person has arrived`);
    assert.ok(backstep(blind, b.kStop) > 0.04 || b.settle > a.settle + 0.2, `${id}: without the distance the stop is no better (control): back ${(backstep(blind, b.kStop) * 100).toFixed(1)} cm, settle ${b.settle} vs ${a.settle}`);
  }
});
test('setting off and stopping do not pop the body: no hand moves more in a frame, relative to the pelvis, than it does in the steadiest part of the swing', () => {
  const step = (rec, k0, k1) => { const P = rec.s('pelvis'); let m = 0; for (const nm of ['hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r']) { const S = rec.s(nm); for (let k = Math.max(1, k0); k < Math.min(rec.n, k1); k++) m = Math.max(m, Math.hypot(S.x[k] - P.x[k] - (S.x[k - 1] - P.x[k - 1]), S.y[k] - P.y[k] - (S.y[k - 1] - P.y[k - 1]), S.z[k] - P.z[k] - (S.z[k - 1] - P.z[k - 1]))); } return m; };
  for (const id of PEOPLE) {
    const rec = new M.Rec(record(id, M.SCEN.startstop().plan)), sp = M.analyseStop(rec), mid = step(rec, Math.round(3.5 / rec.dt), Math.round(6 / rec.dt)), edge = Math.max(step(rec, 0, Math.round(3 / rec.dt)), step(rec, sp.kStop - 30, rec.n));
    assert.ok(edge < 1.1 * mid, `${id}: the biggest one-frame hand move at the start / stop is ${(edge * 100).toFixed(2)} cm; in the steady swing ${(mid * 100).toFixed(2)} cm`);
  }
});

// ------------------------------------------------------------------------------------------------------------------------ the metrics notice flaws
// a good walk (man_commuter, 1.2 m/s, walking along -z) is spoiled in the recording itself, the way a bad animator or a bad clip would spoil it
const LC = M.LM.length, li = (nm) => M.LM.indexOf(nm), idx = (k, nm) => (k * LC + li(nm)) * 3;
const WIN = M.SCEN.steady(1.2).win, SCORE = (raw) => catsOf(M.analyseSteady(new M.Rec(raw), WIN));
const RAW = record('man_commuter', M.SCEN.steady(1.2).plan), BASE = (() => SCORE(RAW))();
const edit = (fn) => { const raw = Object.assign({}, RAW); raw.pos = RAW.pos.slice(); for (let k = 0; k < raw.n; k++) fn(raw.pos, k, k * raw.dt); return raw; };
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
// perturbation helpers: the walker faces -z, so +x is its right, +y up and forward is -z. They edit one frame of a copied position array in place.
const FEET_L = ['foot_l', 'ball_l', 'heel_l', 'toe_l', 'bs_l'], FEET_R = FEET_L.map((n) => n.replace('_l', '_r')), HANDS_L = ['hand_l', 'lowerarm_l'], HANDS_R = ['hand_r', 'lowerarm_r'];
const UPPER = ['spine_01', 'spine_03', 'neck_01', 'head', 'nose', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r'], TRUNK = ['pelvis', 'spine_01', 'spine_03', 'neck_01', 'head', 'nose', 'upperarm_l', 'upperarm_r'];
const shift = (p, k, names, dx, dy, dz) => { for (const nm of names) { const o = idx(k, nm); p[o] += dx; p[o + 1] += dy; p[o + 2] += dz; } };
const tilt = (p, k, deg, names) => {   // lean `names` forward by `deg` about the pelvis (in the vertical plane of travel)
  const th = deg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), o0 = idx(k, 'pelvis'), py = p[o0 + 1], pz = p[o0 + 2];
  for (const nm of names) { const o = idx(k, nm), u = p[o + 1] - py, f = -(p[o + 2] - pz); p[o + 1] = py + u * c - f * s; p[o + 2] = pz - (f * c + u * s); }
};
// the head's offset from the neck bone, and the nose's from the head, averaged over the recording: what a head that is simply carried (never turned) would keep
const HEAD_OFF = (() => { const m = { head: [0, 0, 0], nose: [0, 0, 0] }; for (let k = 0; k < RAW.n; k++) for (let c = 0; c < 3; c++) { m.head[c] += (RAW.pos[idx(k, 'head') + c] - RAW.pos[idx(k, 'neck_01') + c]) / RAW.n; m.nose[c] += (RAW.pos[idx(k, 'nose') + c] - RAW.pos[idx(k, 'neck_01') + c]) / RAW.n; } return m; })();
const FLAWS = {
  'feet skate (the planted feet slide across the floor)': { cat: 'GRD', raw: () => record('man_commuter', M.SCEN.steady(1.2).plan, { feed: { pos: 0.6 } }) },
  'the body hovers 6 cm above the floor': { cat: 'GRD', raw: () => edit((p, k) => { for (let j = 0; j < LC; j++) p[(k * LC + j) * 3 + 1] += 0.06; }) },
  'the gait is told half the speed (a cadence far too slow for the speed)': { cat: 'STR', raw: () => record('man_commuter', M.SCEN.steady(1.2).plan, { feed: { speed: 0.5 } }) },
  'no pelvis bob': { cat: 'PEL', raw: () => { const m = []; for (let k = Math.round(7 / RAW.dt); k < RAW.n; k++) m.push(RAW.pos[idx(k, 'pelvis') + 1]); const mu = m.reduce((s, x) => s + x, 0) / m.length; return edit((p, k) => { p[idx(k, 'pelvis') + 1] = mu; }); } },
  'the arms swing with the same-side legs, not against them': { cat: 'ARM', raw: () => edit((p, k) => { const pz = p[idx(k, 'pelvis') + 2]; for (const nm of ['lowerarm', 'hand']) { const a = idx(k, nm + '_l') + 2, b = idx(k, nm + '_r') + 2, za = p[a] - pz, zb = p[b] - pz; p[a] = pz + zb; p[b] = pz + za; } }) },
  'the arms hang locked at the sides': { cat: 'ARM', raw: () => edit((p, k) => { const pz = p[idx(k, 'pelvis') + 2]; for (const nm of ['lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r']) p[idx(k, nm) + 2] = pz - 0.02; }) },
  'one arm swings a third as far as the other': { cat: 'ARM', raw: () => edit((p, k) => { const pz = p[idx(k, 'pelvis') + 2]; for (const nm of ['lowerarm_r', 'hand_r']) p[idx(k, nm) + 2] = pz + 0.3 * (p[idx(k, nm) + 2] - pz); }) },
  'the head nods 14 degrees twice a stride': { cat: 'HEA', raw: () => edit((p, k) => { p[idx(k, 'nose') + 1] += 0.03 * Math.sin(4 * Math.PI * RAW.phase[k]); }) },
  'every joint jitters by a centimetre a frame': { cat: 'SMO', raw: () => edit((p, k) => { for (const nm of M.LM) if (!/heel|toe|bs_/.test(nm)) for (let c = 0; c < 3; c++) p[idx(k, nm) + c] += 0.02 * rnd(); }) },
  // the blind spots the independent review found (REVIEW_1: "a stoop, a wide base, feet that cross, splayed hands, a poked head and a 5 Hz shake all score the same as the good walk"). Each is a
  // 'spoiled' walk the rubric of round 1 could not tell from the good one; each must now cost its category two and a half points and take it under 7.
  'the trunk stoops 35 degrees forward': { cat: 'PEL', raw: () => edit((p, k) => tilt(p, k, 35, UPPER)) },
  'the feet are 12 cm further apart (a wide base)': { cat: 'LEG', raw: () => edit((p, k) => { shift(p, k, FEET_L, -0.06, 0, 0); shift(p, k, FEET_R, 0.06, 0, 0); }) },
  'the feet cross over: each lands 7.5 cm inside the line (a step width of minus 6 cm)': { cat: 'LEG', raw: () => edit((p, k) => { shift(p, k, FEET_L, 0.075, 0, 0); shift(p, k, FEET_R, -0.075, 0, 0); }) },
  'the hands are held 15 cm out from the sides': { cat: 'ARM', raw: () => edit((p, k) => { shift(p, k, HANDS_L, -0.15, 0, 0); shift(p, k, HANDS_R, 0.15, 0, 0); }) },
  'the head is poked 15 cm forward of the neck': { cat: 'HEA', raw: () => edit((p, k) => shift(p, k, ['head', 'nose'], 0, 0, -0.15)) },
  'the head is held rigid (it does not nod, roll or turn at all)': { cat: 'HEA', raw: () => edit((p, k) => { const nk = (c) => p[idx(k, 'neck_01') + c], o = HEAD_OFF; for (let c = 0; c < 3; c++) { p[idx(k, 'head') + c] = nk(c) + o.head[c]; p[idx(k, 'nose') + c] = nk(c) + o.nose[c]; } }) },
  'a 5 Hz shake of 1.5 cm in both hands': { cat: 'SMO', raw: () => edit((p, k, t) => shift(p, k, ['hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r'], 0, 0.015 * Math.sin(2 * Math.PI * 5 * t), 0)) },
  'a 5 Hz shake of 8 mm in the whole trunk': { cat: 'SMO', raw: () => edit((p, k, t) => shift(p, k, TRUNK, 0, 0.008 * Math.sin(2 * Math.PI * 5 * t), 0)) },
};
// Every category starts from 8 or more, so that "spoiled by 2.5 points" has room to show - except LEG, which no flaw below reads and which this control is known to fall short on:
// its hip flexion-extension range is 30.7 deg against 41.6 expected (that item scores 6.1). The cause is the rig, not the metric: man_commuter's shoe is 0.325 m long (woman_midi's
// is 0.204 m) and rolling over the ball of it carries the trailing ankle forward at toe-off, so the knee takes up the reach and the hip does not extend (measured by swapping the
// two shoes: the same man reaches 37.3 deg in her shoe, and she drops from 45.5 to 35.9 deg in his). LEG is held at 7.5 so it cannot get worse unnoticed; it is not claimed to be good. (TIM had a second allowance here, 3, while the gait was a metronome; it varies now and the allowance is gone.)
const LOW_OK = { LEG: 7.5 };
test('the metrics score a good walk well (the control for the flaw tests)', () => { for (const c of Object.keys(BASE)) assert.ok(BASE[c] >= (LOW_OK[c] ?? 8), `${c} ${BASE[c].toFixed(1)}`); });
for (const [name, f] of Object.entries(FLAWS)) test(`the metrics notice: ${name}`, () => {
  const c = SCORE(f.raw()); assert.ok(c[f.cat] <= BASE[f.cat] - 2.5 && c[f.cat] < 7, `${f.cat}: good ${BASE[f.cat].toFixed(1)}, spoiled ${c[f.cat].toFixed(1)}`);
});

// ------------------------------------------------------------------------------------------------------------------------ the floor is judged on the rendered shoe
// A recording made in the browser also carries shoeY: the lowest skinned vertex of the rendered shoes, every frame (tools/people_motion.html). The gait plants its own foot landmarks,
// so it must not mark its own homework: when shoeY is there GRD.sink / float / flight read it, and the landmarks only when it is not. (The synthetic shoes below are the landmarks'
// own lowest point moved up or down, which is the cleanest way to ask "does the metric believe the shoe?")
const lowOf = (raw) => Array.from({ length: raw.n }, (_, k) => Math.min(...['heel_', 'bs_', 'toe_'].flatMap((p) => ['l', 'r'].map((s) => raw.pos[idx(k, p + s) + 1]))));
const withShoe = (fn) => { const low = lowOf(RAW), raw = Object.assign({}, RAW); raw.shoeY = low.map((y, k) => fn(y, k)); return raw; };
const FLOOR = (raw) => M.analyseSteady(new M.Rec(raw), WIN);
test('the floor items read the landmarks when a recording has no rendered shoe, and the shoe when it has', () => {
  const lm = FLOOR(RAW), same = FLOOR(withShoe((y) => y));
  assert.equal(lm.floorFrom, 'landmarks'); assert.equal(same.floorFrom, 'mesh');
  near(same.sinkMm, lm.sinkMm, 1e-6, 'sink'); near(same.floatMm, lm.floatMm, 1e-6, 'float'); near(same.noContactPct, lm.noContactPct, 1e-9, 'flight');
});
// Revision 10: stance and double support are read from the LOADED foot (the shoe within 2 mm of the floor), not the one that merely looks down (within 8 mm): the published figures are force-plate
// and foot-switch times, and a foot held 5 mm up is on the floor to the eye and carries no weight.
test('stance and double support read the loaded foot: a shoe held 5 mm up is down at 8 mm (stanceC) and not loaded at 2 mm (stance)', () => {
  const base = FLOOR(RAW), up = FLOOR(edit((p, k) => shift(p, k, ['heel_l', 'heel_r', 'bs_l', 'bs_r', 'toe_l', 'toe_r'], 0, 0.005, 0)));   // (the sole landmarks 5 mm up, every frame)
  assert.ok(base.stance > 45 && base.stance < 75, 'stance ' + base.stance);
  near(up.stanceC, base.stanceC, 2, 'the looks-down share does not see 5 mm');
  assert.ok(up.stance < base.stance - 25 && up.ds < base.ds - 5, `loaded stance ${base.stance.toFixed(1)} -> ${up.stance.toFixed(1)} %, double support ${base.ds.toFixed(1)} -> ${up.ds.toFixed(1)} %`);
});
test('a rendered shoe that dips 8 mm below the floor is a sink of 8 mm, whatever the landmarks say', () => {
  const lm = FLOOR(RAW), a = FLOOR(withShoe((y) => y - 0.008));
  assert.ok(a.sinkMm >= 8 && a.sinkMm <= lm.sinkMm + 8.01, `sink ${a.sinkMm.toFixed(2)} mm (landmarks ${lm.sinkMm.toFixed(2)})`);
  assert.ok(catsOf(a).GRD <= catsOf(lm).GRD - 1, `grounding ${catsOf(lm).GRD.toFixed(1)} -> ${catsOf(a).GRD.toFixed(1)}`);
});
test('a rendered shoe that hovers 10 mm above the floor is a float, and time in the air', () => {
  const lm = FLOOR(RAW), a = FLOOR(withShoe((y) => y + 0.010));
  assert.ok(a.floatMm >= 9 && a.floatMm <= 11, `float ${a.floatMm.toFixed(2)} mm`);
  assert.ok(a.noContactPct > 80 && lm.noContactPct < 30, `neither foot down: ${lm.noContactPct.toFixed(0)}% -> ${a.noContactPct.toFixed(0)}%`);
  assert.ok(catsOf(a).GRD <= catsOf(lm).GRD - 1, `grounding ${catsOf(lm).GRD.toFixed(1)} -> ${catsOf(a).GRD.toFixed(1)}`);
});

// ------------------------------------------------------------------------------------------------------------------------ slip and clearance are judged on the rendered shoe too
// rec.shoe, per foot: y = the height of the lowest vertex of that shoe, v = the horizontal speed (m/s) of that very vertex (tools/people_motion.html). Contact timing, swing clearance and
// planted-foot slip read it when it is there, because the three sole landmarks stopped being the sole when the gait began to stand the shoe itself on the floor (gait.footProfile): a
// rocker's landmarks hang under the floor in terminal stance, and drag across it, while the shoe is planted and still. The landmark figures remain, as slipLm and clearLm (not scored).
const lowFoot = (raw, s) => Array.from({ length: raw.n }, (_, k) => Math.min(...['heel_', 'bs_', 'toe_'].map((p) => raw.pos[idx(k, p + s) + 1])));
const withMesh = (base, yFn, vFn) => {
  const raw = Object.assign({}, base); raw.shoe = {};
  for (const s of ['l', 'r']) { const y = lowFoot(base, s).map(yFn); raw.shoe[s] = { y, v: y.map((h, k) => vFn(h, k)) }; }
  raw.shoeY = Array.from({ length: raw.n }, (_, k) => Math.min(raw.shoe.l.y[k], raw.shoe.r.y[k])); return raw;
};
test('slip is the speed of the part of the rendered shoe that is on the floor: a planted shoe over skating landmarks does not skate, and a skating shoe over still landmarks does', () => {
  const SK = record('man_commuter', M.SCEN.steady(1.2).plan, { feed: { pos: 0.6 } }), base = FLOOR(RAW);
  const still = FLOOR(withMesh(SK, (y) => y, () => 0)), skating = FLOOR(withMesh(RAW, (y) => y, (h) => (h < 0.008 ? 0.10 : 4)));
  assert.equal(still.contactFrom, 'mesh'); assert.equal(skating.contactFrom, 'mesh');
  assert.ok(still.slipLm > 6, `the control: the skating walk's landmarks do slide (${still.slipLm.toFixed(1)} cm/s)`);
  near(still.slip, 0, 1e-9, 'a planted shoe');
  near(skating.slip, 10, 1e-6, 'a shoe sliding at 10 cm/s while it is down (and 4 m/s while it is in the air, which must not count)');
  assert.ok(skating.slipLm < 3, `the landmarks of that walk are planted (${skating.slipLm.toFixed(1)} cm/s)`);
  assert.ok(catsOf(skating).GRD <= catsOf(base).GRD - 1, `grounding ${catsOf(base).GRD.toFixed(1)} -> ${catsOf(skating).GRD.toFixed(1)}`);
});
test('swing clearance follows the rendered shoe, and the landmark clearance is still reported beside it', () => {
  const lm = FLOOR(RAW), up = FLOOR(withMesh(RAW, (y) => y + 0.010, () => 0));
  near(up.clearMm, lm.clearMm + 10, 1e-6, 'a shoe 10 mm higher than the landmarks clears 10 mm more'); near(up.clearLm, lm.clearMm, 1e-6, 'the landmarks have not moved');
});
test('with no rendered shoe in the recording the landmarks are the witness, as before', () => {
  const a = FLOOR(RAW); assert.equal(a.contactFrom, 'landmarks'); assert.equal(a.slipLm, undefined); assert.equal(a.clearLm, undefined); assert.ok(Number.isFinite(a.slip) && Number.isFinite(a.clearMm));
});
test('contact timing (the first lift-off and landing after a walk command) is read from the rendered shoe', () => {
  const raw = record('man_commuter', M.SCEN.startstop().plan), lm = M.analyseStart(new M.Rec(raw)), mesh = M.analyseStart(new M.Rec(withMesh(raw, (y) => y, () => 0)));
  assert.ok(lm.ok && mesh.ok); near(mesh.latency, lm.latency, 1e-9, 'a shoe that is exactly the landmarks changes nothing');
  const late = M.analyseStart(new M.Rec(withMesh(raw, (y, k) => (k / 60 < lm.toLatency + 1.2 + 1.0 ? 0 : y), () => 0)));   // a shoe that stays down until a second later than the landmarks leave
  assert.ok(!(late.latency <= lm.latency), `the first landing moves with the shoe: ${lm.latency} -> ${late.latency}`);
});

// ------------------------------------------------------------------------------------------------------------------------ revision 9: an instrument that cannot be flattered
// REVIEW_1 found the rubric blind to eight perturbations (the FLAWS above, now all caught), too kind to a metronome, and scored on a mean that one failing person in five can hide inside.
// What follows tests the machinery of the answer: sub-frame events, the tremor measure, the basis tags, the walk-ratio reference, the 55-point subscore and the gate's clauses.
test('gait events are placed between frames: a peak that falls half-way between two samples is found there, not on a sample', () => {
  const dt = 1 / 30, T = 1.1, n = 300;
  for (const ph of [0, 0.13, 0.31, 0.5, 0.77]) {
    const g = Float64Array.from({ length: n }, (_, i) => Math.cos(2 * Math.PI * (i * dt - ph * dt) / T)), ev = M.zeniEvents(g, dt);
    assert.ok(ev.hsF.length >= 6, 'six strides found');
    let worstF = 0, worstI = 0;
    ev.hsF.forEach((x, i) => { const truth = (ph + Math.round((x - ph) / (T / dt)) * (T / dt)); worstF = Math.max(worstF, Math.abs(x - truth)); worstI = Math.max(worstI, Math.abs(ev.hs[i] - truth)); });
    assert.ok(worstF < 0.05, `phase ${ph}: the sub-frame heel strike is within 0.05 frames of the truth (${worstF.toFixed(3)})`);
    if (ph > 0.1 && ph < 0.9) assert.ok(worstI >= worstF, `phase ${ph}: the whole-frame event is no better than the sub-frame one`);
  }
  // and some phase makes the whole-frame event miss by a fifth of a frame or more - that is the error the sub-frame event removes
  let miss = 0; for (let k = 0; k < 20; k++) { const ph = 0.5 + k * 0.01, g = Float64Array.from({ length: n }, (_, i) => Math.cos(2 * Math.PI * (i * dt - ph * dt) / T)), ev = M.zeniEvents(g, dt); ev.hsF.forEach((x, i) => { miss = Math.max(miss, Math.abs(ev.hs[i] - x)); }); }
  assert.ok(miss > 0.2, `the whole-frame event is off by up to ${miss.toFixed(2)} frames`);
});
test('tremor: what a hand does at the stride rate and its harmonics is gait, not tremor; a 5 Hz shake is tremor and is read at its size', () => {
  const dt = 1 / 30, n = 600, T = 1.1, amp = 0.015;
  const cyc = []; for (let t = 1; t + T < n * dt - 1; t += T) cyc.push([t / dt, (t + T) / dt]);
  const mk = (shake) => { const x = new Float64Array(n); for (let i = 0; i < n; i++) { const t = i * dt; x[i] = 0.12 * Math.sin(2 * Math.PI * t / T) + 0.03 * Math.sin(4 * Math.PI * t / T + 0.7) + (shake ? amp * Math.sin(2 * Math.PI * 5 * t) : 0); } return x; };
  const P = (shake) => () => ({ f: mk(shake), r: new Float64Array(n), y: new Float64Array(n) });
  const still = M.tremorMm(P(false), ['hand_l'], cyc, n, dt), shaken = M.tremorMm(P(true), ['hand_l'], cyc, n, dt);
  assert.ok(still < 0.5, `a pure stride-locked hand reads ${still.toFixed(3)} mm`);
  assert.ok(shaken > 8 && shaken < 16, `a 15 mm 5 Hz shake has an RMS of 10.6 mm, read ${shaken.toFixed(2)} mm`);
  assert.ok(Number.isNaN(M.tremorMm(P(true), ['hand_l'], cyc.slice(0, 2), n, dt)), 'with fewer than three whole strides there is nothing to take an ensemble over: NaN, not a guess');
});
test('every item says what its band rests on: published numbers, derivation, textbook norm, physics or the author\'s judgement - and the table shows it', () => {
  const all = [...M.ITEMS, ...M.TRN_ITEMS, ...M.RNG_ITEMS];
  for (const it of all) assert.ok(M.BASIS.includes(it.src), `${it.id} has src ${it.src}`);
  const sh = M.basisShares(); near(Object.values(sh).reduce((s, x) => s + x, 0), 100, 1e-6, 'the shares make 100 points');
  assert.ok(sh.judge > 0 && sh.pub >= 0 && sh.text > 0, 'every kind that matters is counted');
  const rows = M.rubricTable().split('\n').slice(2); assert.equal(rows.length, all.length);
  for (const [i, r] of rows.entries()) assert.equal(r.split('|')[7].trim(), all[i].src, `the table's last column for ${all[i].id}`);
  assert.ok(M.rubricTable().split('\n')[0].trim().endsWith('| basis |'));
});
test('the stride reference is the walk ratio (step length / cadence about 0.006 m per step/min), and the gait\'s own cadence table agrees with it to within 4 % - so STR checks the gait against the literature, not against itself', () => {
  assert.equal(M.WALK_RATIO, 0.006);
  for (const id of PEOPLE) { const B = bodyOf(id); for (const v of [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8]) {
    const ex = M.expected(v, B.hipY), cad = G.gaitParams(B, v).fs * 60;
    assert.ok(Math.abs(ex.cadence / cad - 1) < 0.04, `${id}@${v}: reference ${ex.cadence.toFixed(1)} steps/min, gait ${cad.toFixed(1)}`);
    near(ex.stepLen * ex.cadence / 60, v, 1e-9, 'step length x step rate is the speed');
  } }
  // at the reference leg length (0.92 m) the reference IS the walk ratio, at every speed (for other legs it is scaled by the square root of the leg-length ratio, the dynamic-similarity rule)
  const r = (v) => { const e = M.expected(v, 0.92); return e.stepLen / e.cadence; };
  for (const v of [0.6, 0.9, 1.2, 1.5, 1.8]) near(r(v) / M.WALK_RATIO, 1, 1e-9, 'walk ratio at ' + v);
});
test('the discriminating subscore is the weighted mean of the five categories whose targets are not the gait\'s own design numbers: GRD, TIM, LEG, SMO and TRN (55 points)', () => {
  const st = {}; for (const id of PEOPLE) { st[id] = {}; for (const v of M.SPEEDS) st[id][v] = steady(id, v).a; }
  const S = M.scoreAll({ steady: st, trans: {}, people: PEOPLE, speeds: M.SPEEDS, rosterAll: true }), f = (x) => (Number.isFinite(x) ? x : 0);
  const want = (M.CATS.GRD * f(S.cats.GRD) + M.CATS.TIM * f(S.cats.TIM) + M.CATS.LEG * f(S.cats.LEG) + M.CATS.SMO * f(S.cats.SMO) + M.CATS.TRN * f(S.cats.TRN)) / (M.CATS.GRD + M.CATS.TIM + M.CATS.LEG + M.CATS.SMO + M.CATS.TRN);
  near(S.disc, want, 1e-9, 'disc'); assert.equal(M.CATS.GRD + M.CATS.TIM + M.CATS.LEG + M.CATS.SMO + M.CATS.TRN, 55);
  assert.ok(!S.gate && S.why.length > 0, 'with no transitions recorded and a metronome for a gait the gate is not met, and it says why');
});
test('a category that holds 8 on average still fails the gate on its tenth percentile when one person in five skates', () => {
  const st = {}, clean = {}; for (const id of PEOPLE) { clean[id] = {}; for (const v of M.SPEEDS) clean[id][v] = steady(id, v).a; }
  const roster = (nSkaters) => {
    const s = {}; for (const id of PEOPLE) for (let k = 0; k < 3; k++) s[id + '#' + k] = clean[id];
    for (let k = 0; k < nSkaters; k++) { const sk = {}; for (const v of M.SPEEDS) sk[v] = Object.assign({}, clean.man_commuter[v], { slip: 8 }); s['skater#' + k] = sk; }
    return { steady: s, trans: {}, rosterAll: true };
  };
  const base = M.scoreAll(roster(0)), mixed = M.scoreAll(roster(3));
  assert.ok(mixed.cats.GRD >= 8, `GRD mean ${mixed.cats.GRD.toFixed(2)} is still 8 or more`);
  assert.ok(base.cats.GRD - mixed.cats.GRD < 0.9, 'the mean hardly notices them: down ' + (base.cats.GRD - mixed.cats.GRD).toFixed(2));
  assert.ok(mixed.p10.GRD < 8 && mixed.p10.GRD < base.p10.GRD - 1, `their tenth percentile does: ${base.p10.GRD.toFixed(2)} -> ${mixed.p10.GRD.toFixed(2)}`);
  assert.ok(mixed.why.some((w) => /^GRD p10/.test(w)), 'and the gate names it: ' + mixed.why.join(' | '));
  assert.ok(!mixed.why.some((w) => /^GRD [0-9]/.test(w)), 'while saying nothing about the mean, which is fine');
});
test('the gate has one clause for each way of cheating, and names the one that fails', () => {
  const ok = { overall: 9.3, disc: 9.2, cats: Object.fromEntries(Object.keys(M.CATS).map((c) => [c, 9.2])), p10: Object.fromEntries(Object.keys(M.CATS).map((c) => [c, 8.6])), worst: { person: 'a', v: 1.2, score: 8.7 }, roster: true };
  assert.deepEqual(M.gateOf(ok), []);
  const one = (patch, re) => { const w = M.gateOf(Object.assign({}, ok, patch)); assert.equal(w.length, 1, JSON.stringify(w)); assert.match(w[0], re); };
  one({ overall: 9.0 }, /^overall 9\.0 <= 9/);                       // "> 9" means more than 9
  one({ disc: 8.91 }, /^discriminating 55 points 8\.9 <= 9/);        // the reviewer's 8.91: a 9.4 overall hid it
  one({ cats: Object.assign({}, ok.cats, { TIM: 7.9 }) }, /^TIM 7\.9 < 8/);
  one({ p10: Object.assign({}, ok.p10, { LEG: 7.95 }) }, /^LEG p10 8\.0 < 8|^LEG p10 7\.9 < 8/);
  one({ worst: { person: 'man_student', v: 1.9, score: 6.94 } }, /^worst recording man_student@1\.9 6\.9 < 8/);
  one({ roster: false }, /^not the whole roster/);
  one({ meshOk: false }, /^the floor was not judged on the rendered shoe/);
  assert.ok(M.gateOf(Object.assign({}, ok, { overall: NaN })).length >= 1, 'NaN passes nothing');
  assert.ok(M.gateOf(Object.assign({}, ok, { cats: Object.assign({}, ok.cats, { SMO: NaN }) })).some((w) => /^SMO/.test(w)), 'a category with no score fails');
});
