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
    assert.ok(a.slip < 5, `${id}@${v} slip ${a.slip.toFixed(2)} cm/s`);
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
};
// Every category starts from 8 or more, so that "spoiled by 2.5 points" has room to show - except LEG, which no flaw below reads and which this control is known to fall short on:
// its hip flexion-extension range is 30.7 deg against 41.6 expected (that item scores 6.1). The cause is the rig, not the metric: man_commuter's shoe is 0.325 m long (woman_midi's
// is 0.204 m) and rolling over the ball of it carries the trailing ankle forward at toe-off, so the knee takes up the reach and the hip does not extend (measured by swapping the
// two shoes: the same man reaches 37.3 deg in her shoe, and she drops from 45.5 to 35.9 deg in his). LEG is held at 7.5 so it cannot get worse unnoticed; it is not claimed to be good.
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
