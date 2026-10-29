// Race director tests: grid, countdown/rocket start, laps/sectors (exploit resistance), ranking hysteresis, wrong-way, finish/results,
// respawn, rubber-band bounds, drafting, stunt routing, modes, determinism. Fast (a few seconds): item behaviour lives in race-items.test.mjs.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/race.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFakeGame, loadCourseHeadless, makeRace, stepRace, recordEvents, simulate, SIM_DT } from './helpers/fake-game.mjs';
import { createControls } from '../src/controls.js';
import { RACE, DIFFICULTY } from '../src/race/balance.js';
import { basisQuat } from '../src/world/layout.js';
import { stepProgress } from '../src/race/progress.js';
import { PILOTS } from '../src/craft/roster.js';
import { Race } from '../src/race/race.js';

const base = createFakeGame({ seed: 11 });
const course = await loadCourseHeadless(base, 'sunrise');
const fresh = (seed = 11, cfg = {}, opts = {}) => {
  const game = createFakeGame({ seed });
  const rec = recordEvents(game);
  const race = makeRace(game, course, { seed, ...cfg });
  return { game, race, rec, ...opts };
};
const f = {};
function place(race, r, s, lateral = 0, vertical = 0, speed = 95) {
  course.frameAt(s, f);
  r.flight.pos.copy(f.pos).addScaledVector(f.right, lateral).addScaledVector(f.up, vertical);
  r.flight.quat.copy(basisQuat(f)); r.flight.speed = speed; r.flight.vel.copy(f.tangent).multiplyScalar(speed);
  r.prev.pos.copy(r.flight.pos); r.prev.quat.copy(r.flight.quat);
  race.onTeleport(r);
}
const go = (race, controls) => { stepRace(race, { seconds: 5, controls, until: (x) => x.state === 'racing' }); assert.equal(race.state, 'racing'); };
const neutralAI = (r) => { r.ai.think = (dt, out) => { out.pitch = 0; out.roll = 0; out.yaw = 0; out.boost = false; out.fire = false; out.item = false; out.itemBack = false; out.barrel = 0; out.airbrake = 0; return out; }; };

test('grid: player + 7 unique AI pilots, unique places, AI avoid the player craft', () => {
  const { race } = fresh(3, { craftId: 'comet', livery: 1 });
  assert.equal(race.racers.length, 8);
  assert.ok(race.player && race.player.isPlayer);
  const pilots = race.racers.filter((r) => r.isAI).map((r) => r.pilot.id);
  assert.equal(new Set(pilots).size, 7);
  assert.equal(new Set(race.racers.map((r) => r.place)).size, 8);
  assert.deepEqual(race.racers.map((r) => r.place).sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (const r of race.racers.filter((x) => x.isAI)) assert.notEqual(r.spec.id, 'comet', 'AI must not share the player craft');
  assert.equal(new Set(race.racers.map((r) => r.slot)).size, 8);
  assert.notEqual(race.player.slot, 0, 'the human starts in the pack, not on pole');
  for (const r of race.racers) assert.ok(r.dist < 0, 'grid is behind the line');
});

test('countdown emits 3,2,1 then GO and holds the grid still', () => {
  const { race, rec, game } = fresh();
  const p0 = race.racers.map((r) => r.flight.pos.clone());
  stepRace(race, { seconds: 2 });
  assert.equal(race.state, 'countdown');
  race.racers.forEach((r, i) => assert.ok(r.flight.pos.distanceTo(p0[i]) < 1e-6));
  stepRace(race, { seconds: 4, until: (x) => x.state === 'racing' });
  assert.deepEqual(rec.log.filter((e) => e.type === 'race:countdown').map((e) => e.payload.n), [3, 2, 1]);
  assert.equal(rec.counts['race:go'], 1);
  assert.ok(race.racers.every((r) => r.flight.speed > 50), 'launched at GO');
  void game;
});

test('rocket start: boost pressed in the last 0.4 s is perfect/good; holding early stalls', () => {
  // perfect: press at ~0.1 s before GO
  let { race, rec } = fresh(5);
  const c = createControls();
  while (race.state === 'countdown') {
    const t = race.cd - 1.2;
    c.boost = t <= 0.12 && t > 0;
    stepRace(race, { steps: 1, controls: c });
  }
  const rs = rec.log.find((e) => e.type === 'race:rocketStart' && e.payload.racer === race.player);
  assert.ok(rs, 'player got a rocket start'); assert.equal(rs.payload.perfect, true);
  assert.ok(race.player.flight.boost.timer > 1.5, 'boost running');
  // good: press at 0.35 s before GO
  ({ race, rec } = fresh(5));
  while (race.state === 'countdown') { const t = race.cd - 1.2; c.boost = t <= 0.35 && t > 0; stepRace(race, { steps: 1, controls: c }); }
  const g = rec.log.find((e) => e.type === 'race:rocketStart' && e.payload.racer === race.player);
  assert.ok(g && g.payload.perfect === false);
  // early: held through the window opening
  ({ race, rec } = fresh(5));
  while (race.state === 'countdown') { c.boost = true; stepRace(race, { steps: 1, controls: c }); }
  assert.ok(!rec.log.some((e) => e.type === 'race:rocketStart' && e.payload.racer === race.player));
  assert.ok(rec.log.some((e) => e.type === 'racer:stall' && e.payload.racer === race.player), 'jumped the gun: stall');
  assert.ok(race.player.launchLock > 0);
});

test('progress: dist advances smoothly, sectors fire in order, laps count once per lap', () => {
  const { race, rec } = fresh(7, { autopilot: true, laps: 2, bots: 3 });
  let maxJump = 0, maxBranchJump = 0, last = race.racers.map((r) => r.dist), lastB = race.racers.map((r) => r.lastBranch), lastS = race.racers.map((r) => r.shortcut), laps = [];
  while (race.state !== 'done' && race.clock < 300) {
    stepRace(race, { steps: 1 });
    race.racers.forEach((r, i) => {
      const j = Math.abs(r.dist - last[i]);
      if (r.lastBranch !== lastB[i] || r.shortcut !== lastS[i]) maxBranchJump = Math.max(maxBranchJump, j); else maxJump = Math.max(maxJump, j);
      last[i] = r.dist; lastB[i] = r.lastBranch; lastS[i] = r.shortcut;
      if (r.lapTimes.length > (laps[i] || 0)) assert.ok(r.dist >= r.lapTimes.length * course.length - 1, `lap ${r.lapTimes.length} credited ${(r.lapTimes.length * course.length - r.dist).toFixed(0)} m early`);
      laps[i] = r.lapTimes.length;
    });
  }
  assert.ok(Math.max(maxJump, maxBranchJump) < 150, `no distance teleports, max step ${Math.max(maxJump, maxBranchJump)}`);
  assert.ok(maxJump < 100, `junction remap is bounded, ${maxBranchJump}`);
  assert.equal(race.stats.glitches, 0);
  const secs = course.sectors.length - 1;
  for (const r of race.racers.filter((x) => x.finished)) {
    assert.equal(r.lapTimes.length, 2);
    const mine = rec.log.filter((e) => e.type === 'sector:pass' && e.payload.racer === r).map((e) => e.payload.sector);
    assert.equal(mine.length, secs * 2, 'every sector every lap');
    for (let i = 0; i < mine.length; i++) assert.equal(mine[i], (i % secs) + 1, 'sectors strictly in order');
  }
  assert.ok(race.racers.some((r) => r.finished));
});

test('exploit: teleporting past the sectors and crossing the line gives no lap', () => {
  const { race, rec } = fresh(8);
  go(race, null);
  const p = race.player; neutralAI(p); race.autopilot = true;
  place(race, p, course.length - 120, 0, 0, 100);
  stepRace(race, { seconds: 4 });
  assert.ok(p.s < 400 || p.s > course.length - 50, 'player really crossed the line');
  assert.equal(p.lap, 1, 'no lap credit for a teleport');
  assert.equal(rec.log.filter((e) => e.type === 'race:lap' && e.payload.racer === p).length, 0);
  assert.equal(p.lapTimes.length, 0);
});

test('exploit: a projection glitch is rejected, not turned into distance', () => {
  const { race } = fresh(9, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = true;
  stepRace(race, { seconds: 2 });
  const d0 = p.dist;
  // move the aircraft 1.5 km ahead for 20 steps, then back
  const keep = p.flight.pos.clone();
  // the course projection is hint-local, so script it to report a point 1.5 km ahead (as a bad projection would)
  const far = (p.s + 1500) % course.length, real = course.project;
  course.project = (pos, hint, out) => { out.s = far; out.branch = -1; out.u = far; out.lateral = 0; out.vertical = 0; out.dist = 1; return out; };
  try { for (let i = 0; i < 50; i++) stepRace(race, { steps: 1 }); } finally { course.project = real; }    // held 0.83 s: past the 0.5 s relock
  assert.ok(race.stats.relocks >= 1, 'the projection relocked onto the far point');
  assert.ok(p.dist - d0 < 400, `a relock gives no credit for the jump, got ${p.dist - d0}`);
  p.flight.pos.copy(keep);
  stepRace(race, { seconds: 1 });
  assert.ok(p.dist - d0 < 400, `distance only from real flight (no credit for the 1.5 km jump), got ${p.dist - d0}`);
  assert.ok(race.stats.glitches > 0);
});

test('ranking: 5 m hysteresis, overtake + position events, finishers lock in', () => {
  const { race, rec } = fresh(10, { bots: 3 });
  go(race, null);
  for (const r of race.racers) neutralAI(r);
  const [a, b] = race.order;
  a.dist = 100; b.dist = 103; stepRace(race, { steps: 0 });
  race.updateRanking();
  assert.equal(race.order[0], a, 'within hysteresis: no swap');
  b.dist = 110; race.updateRanking();
  assert.equal(race.order[0], b); assert.equal(b.place, 1); assert.equal(a.place, 2);
  assert.ok(rec.log.some((e) => e.type === 'race:overtake' && e.payload.racer === b && e.payload.passed === a));
  assert.ok(rec.log.some((e) => e.type === 'race:position' && e.payload.racer === b && e.payload.place === 1));
  // a finisher goes to the front regardless of distance
  const last = race.order[race.order.length - 1];
  race.finishRacer(last, race.clock); race.flushFinishers();
  assert.equal(race.order[0], last); assert.equal(last.place, 1);
});

test('wrong way: flying against the course raises race:wrongway on, then off', () => {
  const { race, rec } = fresh(12, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = true; neutralAI(p);
  place(race, p, 900, 0, 0, 100);
  p.flight.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));   // face backwards
  p.flight.vel.negate();
  stepRace(race, { seconds: 3 });
  assert.ok(rec.log.some((e) => e.type === 'race:wrongway' && e.payload.on === true && e.payload.racer === p), 'wrongway on');
  // turn around again
  p.flight.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  stepRace(race, { seconds: 3 });
  assert.ok(rec.log.some((e) => e.type === 'race:wrongway' && e.payload.on === false && e.payload.racer === p), 'wrongway off');
});

test('finish: results are ordered, points follow 10-8-6-5-4-3-2-1, race:end fires', () => {
  const { race, rec } = fresh(13, { autopilot: true, laps: 1 });
  while (race.state !== 'done' && race.clock < 300) stepRace(race, { steps: 30 });
  assert.equal(race.state, 'done');
  assert.equal(rec.counts['race:end'], 1);
  const res = race.results().standings;
  assert.equal(res.length, 8);
  assert.deepEqual(res.map((x) => x.points), [10, 8, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(res.map((x) => x.place), [1, 2, 3, 4, 5, 6, 7, 8]);
  const fin = res.filter((x) => x.time != null);
  for (let i = 1; i < fin.length; i++) assert.ok(fin[i].time >= fin[i - 1].time, 'finish times ascending');
  assert.ok(fin.length >= 3);
  assert.ok(res.slice(0, fin.length).every((x) => x.racer.finished));
});

test('respawn: a racer far off the course is put back (race:respawn) with invulnerability', () => {
  const { race, rec } = fresh(14, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = false; neutralAI(p);
  stepRace(race, { seconds: 2 });
  p.flight.pos.y += 900; p.flight.pos.x += 700;           // way outside the corridor
  stepRace(race, { seconds: 6, until: () => rec.counts['race:respawn'] > 0 });
  assert.equal(rec.counts['race:respawn'], 1);
  assert.equal(rec.log.find((e) => e.type === 'race:respawn').payload.reason, 'lost');
  assert.ok(p.proj.dist < 120, 'back on course: ' + p.proj.dist);
  assert.ok(p.invuln > 1);
});

test('rubber band: AI speedMul stays inside [aiSpeed*(1-0.6*rubber)-eps, aiSpeed*(1+rubber)+eps] and never jumps', () => {
  for (const diff of ['easy', 'expert']) {
    const D = DIFFICULTY[diff];
    const { race } = fresh(15, { autopilot: true, difficulty: diff });
    go(race, null);
    let lo = 9, hi = 0, maxStep = 0; const prev = new Map();
    for (let i = 0; i < 60 * 40; i++) {
      stepRace(race, { steps: 1 });
      for (const r of race.racers.filter((x) => x.isAI)) {
        lo = Math.min(lo, r.rb); hi = Math.max(hi, r.rb);
        if (prev.has(r)) maxStep = Math.max(maxStep, Math.abs(r.rb - prev.get(r)));
        prev.set(r, r.rb);
      }
    }
    const norm = 1.25;    // craft pull toward the human's craft is bounded well within +-25 %
    assert.ok(hi <= D.aiSpeed * norm * (1 + D.rubber) + 1e-3, `${diff}: hi ${hi}`);
    assert.ok(lo >= D.aiSpeed / norm * (1 - 0.6 * D.rubber) - 1e-3, `${diff}: lo ${lo}`);
    assert.ok(maxStep < 0.004, `${diff}: smooth, max per-step change ${maxStep}`);
  }
});

test('drafting: tailing a faster-or-equal racer charges a slingshot and emits racer:draft', () => {
  const { race, rec } = fresh(16, { bots: 1 });
  go(race, null);
  const [lead, chase] = [race.racers.find((r) => r.isAI), race.player];
  neutralAI(lead); race.autopilot = false; neutralAI(chase);
  place(race, lead, 700, 0, 0, 110); place(race, chase, 700, 0, 0, 108);
  course.frameAt(700, f); chase.flight.pos.copy(lead.flight.pos).addScaledVector(f.tangent, -45); chase.flight.quat.copy(lead.flight.quat); chase.prev.pos.copy(chase.flight.pos); race.onTeleport(chase);
  chase.flight.boost.meter = 0; lead.flight.boost.timer = 30; chase.flight.boost.timer = 30;      // both boosting: a steady gap
  let peak = 0;
  const rel = new THREE.Vector3();
  for (let i = 0; i < 132; i++) {
    stepRace(race, { steps: 1, controls: createControls() }); peak = Math.max(peak, chase.draftBonus);
    // hold the formation: neutral flight drifts apart, so keep the chaser in the leader's wake (same heading, 45 m behind)
    chase.flight.quat.copy(lead.flight.quat); chase.flight.vel.copy(lead.flight.vel).setLength(chase.flight.speed);
    rel.copy(lead.flight.forward).multiplyScalar(-45); chase.flight.pos.copy(lead.flight.pos).add(rel); chase.prev.pos.copy(chase.flight.pos);
  }
  assert.ok(rec.log.some((e) => e.type === 'racer:draft' && e.payload.on && e.payload.racer === chase), 'draft on');
  assert.ok(peak > 0.01, 'speed bonus ramping, peak ' + peak);
  assert.ok(rec.log.some((e) => e.type === 'racer:boost' && e.payload.kind === 'draft' && e.payload.racer === chase), 'slingshot boost');
});

test('stunt routing: flight stunt events become racer:stunt and boost meter', () => {
  const { race, rec } = fresh(17, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = true; p.flight.boost.meter = 0;
  p.flight.events.push({ type: 'stunt', kind: 'loop', reward: 25 }, { type: 'stall' });
  stepRace(race, { steps: 1 });
  const ev = rec.log.find((e) => e.type === 'racer:stunt');
  assert.ok(ev && ev.payload.kind === 'loop' && ev.payload.reward === 25);
  assert.ok(p.flight.boost.meter >= 24);
  assert.ok(rec.log.some((e) => e.type === 'racer:stall'));
  assert.equal(p.flight.events.length, 0, 'drained');
});

test('gates: flying through the centre of a gate is perfect, a boost ring gives a boost', () => {
  const { race, rec } = fresh(18, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = false; neutralAI(p);
  const g = course.gates.find((x) => !x.shortcut);
  place(race, p, g.s - 40, 0, 0, 100);
  // put the aircraft exactly on the gate centre line
  p.flight.pos.copy(g.pos).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(g.quat), -40);
  p.flight.quat.copy(g.quat); p.flight.vel.set(0, 0, -100).applyQuaternion(g.quat); p.prev.pos.copy(p.flight.pos);
  race.onTeleport(p); p.dist = g.s - 30; p.gateIdx = race.gates.indexOf(g);     // teleports grant no progress, so set the race distance by hand
  stepRace(race, { seconds: 1 });
  const ev = rec.log.find((e) => e.type === 'gate:pass' && e.payload.racer === p);
  assert.ok(ev, 'gate:pass emitted'); assert.ok(ev.payload.offset < 0.25 && ev.payload.perfect);
  assert.equal(p.stats.perfectGates, 1);
  const ring = course.boostRings[0];
  place(race, p, ring.s - 40, 0, 0, 100);
  p.flight.pos.copy(ring.pos).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(ring.quat), -40); p.flight.quat.copy(ring.quat);
  p.flight.vel.set(0, 0, -100).applyQuaternion(ring.quat); race.onTeleport(p);
  p.dist = ring.s - 30; p.ringIdx = race.rings.indexOf(ring);
  stepRace(race, { seconds: 1 });
  assert.ok(rec.log.some((e) => e.type === 'racer:boost' && e.payload.kind === 'ring' && e.payload.racer === p), 'ring boost');
});

test('collision: ground scrape glances (no tumble), steep ground hit tumbles, hazard tumbles, wall pushes in', () => {
  const { race, rec } = fresh(19, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = false; neutralAI(p);
  // wall: far to the side but still above the ground
  place(race, p, 800, 0, 0, 100); course.frameAt(800, f);
  p.flight.pos.addScaledVector(f.right, f.halfWidth * 1.15);
  stepRace(race, { seconds: 0.5 });
  assert.ok(rec.log.some((e) => e.type === 'racer:graze' && e.payload.surface === 'wall'));
  assert.equal(p.tumble, 0);
  // hazard
  const hz = course.hazards[0];
  place(race, p, hz.s - 120, 0, 0, 100); p.flight.pos.copy(hz.pos); p.prev.pos.copy(hz.pos); p.invuln = 0;
  stepRace(race, { steps: 2 });
  assert.ok(p.tumble > 0, 'hazard tumbles'); assert.ok(rec.log.some((e) => e.type === 'racer:hit' && e.payload.kind === 'hazard'));
  // steep ground crash
  p.invuln = 0; p.flight.tumble.t = 0; p.tumble = 0;
  place(race, p, 800, 0, 0, 100); course.frameAt(800, f);
  const gh = course.groundHeight(p.flight.pos.x, p.flight.pos.z);
  p.flight.pos.y = gh + 3; p.flight.vel.set(0, -60, -80);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.7); p.flight.quat.multiply(q);
  stepRace(race, { steps: 3 });
  assert.ok(rec.log.some((e) => e.type === 'racer:hit' && (e.payload.kind === 'ground' || e.payload.kind === 'hazard')));
});

test('racers bump softly: separate, lose a little speed, never tumble', () => {
  const { race, rec } = fresh(20, { bots: 1 });
  go(race, null);
  const a = race.player, b = race.racers.find((r) => r.isAI); race.autopilot = false; neutralAI(a); neutralAI(b);
  place(race, a, 1000, 0, 0, 100); place(race, b, 1000, 0, 0, 100);
  b.flight.pos.copy(a.flight.pos).addScaledVector(a.flight.right, 3).addScaledVector(a.flight.forward, 4);
  stepRace(race, { steps: 2 });
  assert.ok(a.flight.pos.distanceTo(b.flight.pos) >= a.radius + b.radius - 0.5, 'separated');
  assert.ok(rec.log.some((e) => e.type === 'racer:hit' && e.payload.kind === 'racer'));
  assert.equal(a.tumble, 0); assert.equal(b.tumble, 0);
});

test('modes: trial = solo without items; demo = 7 AI, no player, never ends; bots count honoured', () => {
  let { race } = fresh(21, { mode: 'trial' });
  assert.equal(race.racers.length, 1); assert.equal(race.items.enabled, false); assert.equal(race.items.orbs.length, 0);
  ({ race } = fresh(21, { demo: true, mode: 'demo', laps: 99 }));
  assert.equal(race.player, null); assert.equal(race.racers.length, 7); assert.equal(race.state, 'racing');
  stepRace(race, { seconds: 8 });
  assert.ok(race.racers.every((r) => r.flight.speed > 50 && isFinite(r.flight.pos.x)));
  assert.notEqual(race.state, 'done');
  ({ race } = fresh(21, { bots: 3 }));
  assert.equal(race.racers.length, 4);
});

test('autopilot flies the player: setAutopilot(true) makes the human racer follow the AI', () => {
  const { race } = fresh(22, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; const c = createControls(); c.roll = 1;                  // would roll off if flown by input
  race.setAutopilot(false); stepRace(race, { seconds: 3, controls: c });
  const off = Math.abs(p.lateral) + Math.abs(p.vertical);
  const { race: r2 } = fresh(22, { bots: 0, mode: 'trial', autopilot: true });
  go(r2, null); stepRace(r2, { seconds: 3, controls: c });
  assert.ok(Math.abs(r2.player.lateral) + Math.abs(r2.player.vertical) < off, 'autopilot ignores the stick and stays on the line');
});

test('determinism: same seed -> identical race; different seed -> different race', () => {
  const run = (seed) => { const g = createFakeGame({ seed }); return simulate(g, course, { laps: 1, seed, bots: 5 }, { maxSeconds: 120 }).hash; };
  const a = run(31), b = run(31), c = run(32);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('SIM_DT is 1/60 and the race never reads wall-clock time', () => {
  assert.equal(SIM_DT, 1 / 60);
  const { race } = fresh(23);
  const t0 = Date.now(); stepRace(race, { seconds: 1 }); assert.ok(Date.now() - t0 < 2000);
  assert.ok(RACE.countdown === 3);
});

test('shortcut entry: a deep 70 m remap is credited in capped steps and repaid, never in one jump; the exit settles the debt', () => {
  const { race } = fresh(40, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = false; neutralAI(p);
  place(race, p, 1000); p.proj.branch = -1; p.lastBranch = -1; p.lastS = 1000; p.dist = 1000; p.debt = 0;
  const real = course.project; const script = [];
  course.project = (pos, hint, out) => { const x = script.shift(); out.s = x.s; out.branch = x.branch; out.u = x.u ?? 0; out.lateral = 0; out.vertical = 0; out.dist = 1; return out; };
  try {
    const steps = []; const run = (s, branch, u) => { script.push({ s, branch, u }); const d0 = p.dist; stepProgress(race, p, SIM_DT); steps.push(p.dist - d0); };
    run(1003, -1, 0);
    run(1076, 0, 100);                                // the deep-entry jump: 73 m of mapped arc in one step
    assert.ok(steps[1] <= 40.5, 'entry credit capped, got ' + steps[1]);
    assert.ok(p.debt > 30, 'remainder banked, debt ' + p.debt);
    let s = 1076; for (let i = 0; i < 30; i++) { s += 3; run(s, 0, 100 + i * 3); }
    assert.ok(Math.max(...steps.slice(2)) < 5, 'repayment is smooth: max forward step ' + Math.max(...steps.slice(2)));
    run(s + 3, -1, 0);                                // exit: settle in full
    assert.ok(Math.abs(p.dist - (s + 3)) < 1e-6, `dist ${p.dist} equals the mapped s ${s + 3}`);
    assert.equal(p.debt, 0);
  } finally { course.project = real; }
});

test('column flank: clipping the side of a tall column slides the racer out sideways, never up onto the roof (neon regression, 85 m ejection)', () => {
  const { race, rec } = fresh(41, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = false; neutralAI(p);
  place(race, p, 1500, 0, 0, 100);
  const wall = p.flight.pos.x + 1;
  const real = course.groundHeight;
  course.groundHeight = (x) => (x > wall ? 190 : 0);                 // a 190 m column whose flank is at x = wall
  try {
    p.flight.pos.y = 100;
    const y0 = p.flight.pos.y, x0 = p.flight.pos.x;
    stepRace(race, { steps: 1, controls: createControls() });
    assert.ok(p.flight.pos.y - y0 < 10, 'not ejected upward: dy ' + (p.flight.pos.y - y0));
    assert.ok(p.flight.pos.x < x0 + 0.5, 'pushed away from the column, dx ' + (p.flight.pos.x - x0));
    assert.ok(rec.log.some((e) => e.type === 'racer:hit' && e.payload.kind === 'ground'), 'it is a crash, not a free pass');
  } finally { course.groundHeight = real; }
});

test('scrape respawn: riding geometry for seconds (not just standing still) puts the racer back on the line', () => {
  const { race, rec } = fresh(42, { bots: 0, mode: 'trial' });
  go(race, null);
  const p = race.player; race.autopilot = false; neutralAI(p);
  place(race, p, 2000, 0, 0, 100);
  const real = course.collide;
  course.collide = (pos, r, proj, out) => { out.kind = 'wall'; out.depth = 0.5; out.soft = true; (out.normal ||= new THREE.Vector3()).set(0, 1, 0); return true; };
  try { stepRace(race, { seconds: 4.5, controls: createControls() }); } finally { course.collide = real; }
  assert.ok(rec.log.some((e) => e.type === 'race:respawn' && e.payload.racer === p), 'respawned after ' + RACE.respawnScrapeT + ' s of continuous contact');
});

// ---------------------------------------------------------------- round 1 fixes (E-01, E-02, E-07, E-08, E-09, P-13)
const wrapMod = (x, L) => ((x % L) + L) % L;
const offset = (r, L) => { const o = wrapMod(r.dist - r.s, L); return o > L / 2 ? o - L : o; };

test('E-01 respawn keeps (dist - s): inside every shortcut at 20/50/80% on all four courses, and after a relock', async () => {
  for (const id of ['sunrise', 'redrock', 'neon', 'frost']) {
    const game = createFakeGame({ seed: 50 });
    const c = await loadCourseHeadless(game, id);
    const race = makeRace(game, c, { seed: 50, bots: 0, mode: 'trial' });
    stepRace(race, { seconds: 8, until: (x) => x.state === 'racing' });
    const p = race.player; race.autopilot = false; neutralAI(p);
    const L = c.length;
    for (const br of c.branches) for (const frac of [0.2, 0.5, 0.8]) {
      const fr = {}; br.frameAt(frac * br.length, fr);
      const putOn = (u) => {                                                      // as if flown there: branch state set by hand (an unhinted teleport only captures the first 40%)
        br.frameAt(u, fr); p.flight.pos.copy(fr.pos); p.flight.quat.copy(basisQuat(fr)); p.flight.vel.copy(fr.tangent).multiplyScalar(90); p.flight.speed = 90; p.prev.pos.copy(fr.pos);
        p.proj.branch = br.index; p.proj.u = u; p.proj.s = br.sOf(u); p.proj.lateral = 0; p.proj.vertical = 0;
        p.s = p.lastS = p.proj.s; p.lateral = 0; p.vertical = 0; p.onBranch = p.lastBranch = br.index; p.dist = p.s; p.debt = 0; p.glitchT = 0;
      };
      putOn(frac * br.length);
      race.markGood(p, br.index);
      putOn(Math.min(br.length - 5, frac * br.length + 150));                     // fly on a little, then fail
      const before = offset(p, L);
      race.respawn(p, 'scrape');
      assert.ok(Math.abs(offset(p, L) - before) < 5, `${id} branch ${br.index} @${frac}: dist-s ${before.toFixed(1)} -> ${offset(p, L).toFixed(1)}`);
      assert.equal(p.onBranch, br.index, `${id}: respawned inside the shortcut, not at the mouth`);
    }
    // a 'lost' respawn after the projection relocked onto another stretch
    const onMain = (s) => { c.frameAt(s, f); p.flight.pos.copy(f.pos); p.flight.quat.copy(basisQuat(f)); p.flight.vel.copy(f.tangent).multiplyScalar(90); p.flight.speed = 90; p.prev.pos.copy(f.pos); race.onTeleport(p); };
    onMain(900); p.dist = p.s; p.lastGoodS = p.s; p.lastGoodDist = p.dist; p.lastGoodBranch = -1;
    stepRace(race, { seconds: 1, controls: createControls() });
    const base = offset(p, L), seen = race.stats.respawns;
    c.frameAt(wrapMod(p.s + 1700, L), f); p.flight.pos.copy(f.pos).addScaledVector(f.right, 500);
    for (let i = 0; i < 400 && race.stats.respawns === seen; i++) { p.flight.pos.copy(f.pos).addScaledVector(f.right, 500); stepRace(race, { steps: 1, controls: createControls() }); }
    assert.ok(race.stats.relocks >= 1, id + ': relocked first');
    assert.equal(race.stats.respawns, seen + 1, id + ': lost respawn fired');
    assert.ok(Math.abs(offset(p, L) - base) < 5, `${id} lost after relock: dist-s ${base.toFixed(1)} -> ${offset(p, L).toFixed(1)}`);
  }
});

test('E-02 rocket start rule: any boost in the last 0.5 s = rocket (good, perfect inside 0.18 s); boost before the window or held from it = early', () => {
  const press = (tPress, tRelease = 0) => {
    const { race, rec } = fresh(5); const c = createControls();
    while (race.state === 'countdown') { const t = race.cd - 1.2; c.boost = t <= tPress && t > tRelease; stepRace(race, { steps: 1, controls: c }); }
    return { race, rec, rs: rec.log.find((e) => e.type === 'race:rocketStart' && e.payload.racer === race.player), stall: rec.log.some((e) => e.type === 'racer:stall' && e.payload.racer === race.player) };
  };
  for (const t of [0.47, 0.28]) { const r = press(t); assert.ok(r.rs && r.rs.payload.perfect === false && !r.stall, `-${t} s is a good start`); }
  { const r = press(0.08); assert.ok(r.rs && r.rs.payload.perfect === true, '-0.08 s is perfect'); }
  { const r = press(2.0); assert.ok(!r.rs && r.stall, 'held from -2.0 s is early'); }
  { const r = press(1.0, 0.7); assert.ok(!r.rs && r.stall, 'a tap at -1.0 s (before the window) is early even if released'); }
  assert.equal(RACE.rocketWindow, 0.5);
});

test('E-07 photo finish: two racers finishing in one step are placed by finishTime, not array order', () => {
  const { race, rec } = fresh(51, { bots: 1 });
  go(race, null);
  const [a, b] = race.racers;                       // a before b in the array
  race.finishRacer(a, 100.016); race.finishRacer(b, 100.004);
  race.flushFinishers();
  assert.equal(b.finishIndex, 0, 'the earlier finishTime wins'); assert.equal(a.finishIndex, 1);
  const fin = rec.log.filter((e) => e.type === 'race:finish');
  assert.deepEqual(fin.map((e) => e.payload.racer.id), [b.id, a.id]);
  assert.deepEqual(fin.map((e) => e.payload.place), [1, 2]);
  assert.equal(race.standings()[0], b);
});

test('E-09 grid order = sort by one precomputed noisy key per pilot (exactly one draw each, engine independent)', () => {
  const game = createFakeGame({ seed: 77 });
  let draws = 0; const fork = game.rng.fork.bind(game.rng);
  game.rng.fork = (salt) => { const r = fork(salt); if (salt === 0x5ace) { const range = r.range.bind(r); r.range = (...a) => { draws++; return range(...a); }; } return r; };
  const race = new Race(game, { courseId: course.id, craftId: 'falcon', livery: 0, difficulty: 'normal', laps: 3, bots: 7, mode: 'quick', seed: 77, course });
  assert.equal(draws, 7, 'one noisy key per pilot, not one per comparison');
  const rng = createFakeGame({ seed: 77 }).rng.fork(0x5ace);
  const pilots = PILOTS.slice(); rng.shuffle(pilots); pilots.length = 7;
  const keys = pilots.map((p) => p.personality.skill + rng.range(-0.15, 0.15));
  const expected = pilots.map((p, i) => ({ p, k: keys[i], i })).sort((x, y) => y.k - x.k || x.i - y.i).map((e) => e.p.id);
  const got = race.racers.filter((r) => r.isAI).sort((x, y) => x.slot - y.slot).map((r) => r.pilot.id);
  assert.deepEqual(got, expected);
});

test('P-13 player catch-up is measured against the leader: far-behind player gets a bonus on easy/normal, the leader none', () => {
  for (const d of ['easy', 'normal']) {
    const { race } = fresh(52, { difficulty: d });
    go(race, null);
    const p = race.player, lead = race.racers.find((r) => r.isAI);
    race.autopilot = false;
    lead.dist = 1000; for (const o of race.racers) if (o !== lead && o !== p) o.dist = 900; p.dist = 300; p.place = 8;
    for (let i = 0; i < 200; i++) race.speedMulFor(p, 1 / 60);
    assert.ok(p.rb > 1.005, `${d}: far-behind player boosted, rb ${p.rb}`);
    assert.ok(p.rb <= 1 + DIFFICULTY[d].playerHelp + 1e-9);
    p.dist = 1200; p.place = 1; p.rb = 1;
    for (let i = 0; i < 200; i++) race.speedMulFor(p, 1 / 60);
    assert.equal(p.rb, 1, `${d}: the leader gets no help`);
  }
});

test('E-08 a relock that jumps over a vertical loop emits race:missed (no credit)', async () => {
  const game = createFakeGame({ seed: 53 });
  const c = await loadCourseHeadless(game, 'sunrise');
  const loops = Object.keys(c.marks).filter((k) => k.endsWith('Entry') && c.marks[k.slice(0, -5) + 'Exit'] != null);
  assert.ok(loops.length > 0, 'sunrise has a loop');
  const nm = loops[0].slice(0, -5), entry = c.marks[nm + 'Entry'], exit = c.marks[nm + 'Exit'];
  const rec = recordEvents(game);
  const race = makeRace(game, c, { seed: 53, bots: 0, mode: 'trial' });
  stepRace(race, { seconds: 8, until: (x) => x.state === 'racing' });
  const p = race.player; race.autopilot = false; neutralAI(p);
  const fr = {}; c.frameAt(entry - 60, fr);
  p.flight.pos.copy(fr.pos); p.flight.quat.copy(basisQuat(fr)); p.flight.vel.copy(fr.tangent).multiplyScalar(90); p.flight.speed = 90; p.prev.pos.copy(fr.pos); race.onTeleport(p);
  const d0 = p.dist;
  const real = c.project;                                  // under the loop the nearest-point projection snaps to the exit side: script that
  c.project = (pos, hint, out) => { out.s = exit + 60; out.branch = -1; out.u = exit + 60; out.lateral = 0; out.vertical = 0; out.dist = 1; return out; };
  try { stepRace(race, { steps: 45, controls: createControls() }); } finally { c.project = real; }
  assert.ok(rec.log.some((e) => e.type === 'race:missed' && e.payload.what === 'loop' && e.payload.racer === p), 'missed-loop event');
  assert.ok(p.dist - d0 < 200, 'no credit for the skipped loop: ' + (p.dist - d0));
});
