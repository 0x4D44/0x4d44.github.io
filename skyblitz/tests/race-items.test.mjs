// Item and weapon unit tests (race agent): drop tables, orbs, missile counterplay, shield/invulnerability rules,
// storm targeting, mine, EMP, smoke, drone and the cannon (heat, overheat, combo). Each test builds a tiny arena.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/race-items.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFakeGame, loadCourseHeadless, makeRace, stepRace, recordEvents, SIM_DT } from './helpers/fake-game.mjs';
import { createControls } from '../src/controls.js';
import { WEAPONS as W, ITEMS, ITEM_ORDER, rollItem } from '../src/race/balance.js';
import { applyHit } from '../src/race/damage.js';
import { FLIGHT } from '../src/flight/flight.js';
import { RNG } from '../src/util.js';
import { basisQuat } from '../src/world/layout.js';

const base = createFakeGame({ seed: 5 });
const course = await loadCourseHeadless(base, 'sunrise');
const f = {};
function place(race, r, s, lateral = 0, vertical = 0, speed = 100) {
  course.frameAt(s, f);
  r.flight.pos.copy(f.pos).addScaledVector(f.right, lateral).addScaledVector(f.up, vertical);
  r.flight.quat.copy(basisQuat(f)); r.flight.speed = speed; r.flight.vel.copy(f.tangent).multiplyScalar(speed);
  r.flight.forward.copy(f.tangent); r.flight.up.copy(f.up); r.flight.right.copy(f.right);     // the derived axes too: a missile fired before the next flight step uses forward
  r.prev.pos.copy(r.flight.pos); r.prev.quat.copy(r.flight.quat);
  race.onTeleport(r);
}
const neutralAI = (r) => { r.ai.think = (dt, out) => { out.pitch = 0; out.roll = 0; out.yaw = 0; out.boost = false; out.fire = false; out.item = false; out.itemBack = false; out.barrel = 0; out.airbrake = 0; return out; }; };

/** A racing arena: player (manual, idle) + `bots` idle AI. Everyone is parked far apart; tests then place who they need. */
function arena(seed, { bots = 3, mode = 'quick' } = {}) {
  const game = createFakeGame({ seed });
  const rec = recordEvents(game);
  const race = makeRace(game, course, { seed, bots, mode, laps: 3 });
  stepRace(race, { seconds: 6, until: (x) => x.state === 'racing' });
  assert.equal(race.state, 'racing');
  race.autopilot = false;
  race.racers.forEach((r, i) => { neutralAI(r); place(race, r, 2500 + i * 500, 0, 0, 100); r.invuln = 0; r.shield = 0; r.item = null; });
  return { game, race, rec, items: race.items, [Symbol.iterator]: null };
}
const types = (rec, t) => rec.log.filter((e) => e.type === t);
const idle = () => createControls();
const tick = (race, seconds, controls = idle()) => stepRace(race, { seconds, controls });

test('drop table: the leader never rolls storm; the back of the field is favoured', () => {
  const rng = new RNG(99), n = 8, N = 6000, tally = (place) => { const c = {}; for (let i = 0; i < N; i++) { const t = rollItem(rng, place, n).type; c[t] = (c[t] || 0) + 1; } return c; };
  const first = tally(1), last = tally(n);
  assert.equal(first.storm || 0, 0, 'leader never rolls storm');
  assert.ok((last.storm || 0) > 0.03 * N, 'last place sees storm, got ' + (last.storm || 0));
  const strong = (c) => (c.storm || 0) + (c.triple || 0) + (c.turbo3 || 0);
  assert.ok(strong(last) > strong(first) * 1.5, `last ${strong(last)} vs leader ${strong(first)}`);
  for (const t of Object.keys({ ...first, ...last })) assert.ok(ITEM_ORDER.includes(t) && ITEMS[t], 'known item ' + t);
  for (const t of ITEM_ORDER) assert.ok((first[t] || 0) + (last[t] || 0) > 0 || t === 'storm' && last.storm, 'item ' + t + ' can drop');
});

test('orbs: pickup gives an item, the orb respawns in 6 s, trial mode has no orbs', () => {
  const { race, rec, items } = arena(21);
  const p = race.player, orb = items.orbs[3];
  assert.ok(orb && orb.active);
  p.flight.pos.copy(orb.pos); p.prev.pos.copy(orb.pos); race.onTeleport(p);
  stepRace(race, { steps: 1, controls: idle() });
  assert.ok(p.item && p.item.count > 0, 'item rolled');
  assert.equal(types(rec, 'pickup:orb').length, 1);
  assert.equal(orb.active, false);
  place(race, p, 2500);
  tick(race, 5.5); assert.equal(orb.active, false, 'not back yet at 5.5 s');
  tick(race, 1); assert.equal(orb.active, true, 'back after 6 s');
  const trial = arena(22, { bots: 0, mode: 'trial' });
  assert.equal(trial.items.orbs.length, 0, 'no orbs in time trial');
});

test('shield absorbs exactly one hit, then a landed hit tumbles and grants invulnerability', () => {
  const { race, rec } = arena(23);
  const v = race.player; v.shield = 5;
  assert.equal(applyHit(race, v, null, 'mine', { tumble: 1.4, loss: 0.3 }), false, 'absorbed');
  assert.equal(v.shield, 0); assert.equal(v.tumble, 0);
  assert.equal(types(rec, 'shield:block').length, 1);
  assert.ok(v.invuln > 0, 'short grace after a block');
  assert.equal(applyHit(race, v, null, 'mine', { tumble: 1.4, loss: 0.3 }), false, 'invulnerable: ignored');
  v.invuln = 0;
  const before = v.flight.speed;
  assert.equal(applyHit(race, v, null, 'mine', { tumble: 1.4, loss: 0.3 }), true, 'second hit lands');
  assert.ok(v.tumble > 0 && v.flight.speed < before);
  assert.ok(v.invuln >= v.tumble, 'invulnerable for at least the tumble: no chain-stun');
  const t0 = v.tumble;
  assert.equal(applyHit(race, v, null, 'mine', { tumble: 1.4 }), false, 'no re-hit while tumbling');
  assert.equal(v.tumble, t0);
});

test('storm: strikes the best-placed unshielded racer, never a shielded one, and keeps the item when nobody qualifies', () => {
  const { race, items } = arena(24, { bots: 3 });
  const [a, b, c, d] = race.order; // a leads
  const set = (arr) => { race.order.length = 0; race.order.push(...arr); arr.forEach((r, i) => { r.place = i + 1; }); };
  set([a, b, c, d]);
  for (const o of [b, c, d]) o.shield = 4;
  items.give(a, 'storm', 1);
  assert.equal(items.useItem(a), false, 'every rival is shielded: nobody to strike');
  assert.ok(a.item && a.item.type === 'storm' && a.item.count === 1, 'item kept');
  for (const o of [b, c, d]) o.shield = 0;
  items.give(d, 'storm', 1);
  assert.equal(items.useItem(d), true);
  assert.ok(a.tumble > 0 && a.stats.hitsTaken === 1, 'the race leader is struck');
  assert.equal(b.tumble + c.tumble, 0);
  assert.equal(d.item, null);
  a.invuln = 0; a.tumble = 0; a.flight.tumble.t = 0; a.shield = 4;
  items.give(d, 'storm', 1); assert.equal(items.useItem(d), true);
  assert.equal(a.shield, 4, 'a shielded racer is skipped, not wasted on');
  assert.ok(a.tumble === 0 && b.tumble > 0, 'the next racer ahead takes it');
});

function missileArena(seed, gap = 80) {
  const ar = arena(seed, { bots: 2 });
  const { race, items } = ar;
  const owner = race.player, target = race.racers.find((r) => r.isAI);
  place(race, owner, 800, 0, 0, 100); place(race, target, 800 + gap, 0, 0, 100);
  items.give(owner, 'missile', 1); owner.lock.target = target; owner.lock.progress = 1;
  assert.equal(items.useItem(owner), true);
  assert.equal(items.missiles.length, 1);
  assert.equal(items.missiles[0].target, target);
  target._ts = 800 + gap;
  return { ...ar, owner, target };
}
// the idle target is carried down the centreline at 100 m/s (a neutral aircraft would otherwise fly into the first bend and tumble)
const run = (race, until, seconds = 6) => stepRace(race, { seconds, controls: idle(), until: (x) => { const t = x.racers.find((r) => r._ts); if (t) { t._ts += 100 / 60; place(x, t, t._ts, 0, 0, 100); } return until(x); } });

test('missile: a locked missile hits a plain target and tumbles it', () => {
  const { race, rec, target, items } = missileArena(25);
  const thr = items.threatOf(target); assert.ok(thr && thr.tti > 0 && thr.dist > 50, 'threatOf reports the incoming missile');
  run(race, () => types(rec, 'missile:hit').length > 0);
  assert.equal(types(rec, 'missile:hit').length, 1);
  assert.ok(target.tumble > 0);
  assert.equal(items.missiles.length, 0);
});

test('missile counterplay: shield eats it, barrel roll dodges it, an obstacle stops it, flying away outruns it', () => {
  {
    const { race, rec, target } = missileArena(26); target.shield = 5;
    run(race, () => types(rec, 'missile:evaded').length > 0);
    const e = types(rec, 'missile:evaded')[0]; assert.ok(e && e.payload.by === 'shield', 'shield, got ' + e?.payload.by);
    assert.equal(target.tumble, 0); assert.equal(target.shield, 0, 'the shield is spent');
  }
  {
    const { race, rec, target } = missileArena(27);
    run(race, () => { target.flight.barrel.t = 0.4; return types(rec, 'missile:evaded').length > 0; });
    const e = types(rec, 'missile:evaded')[0]; assert.ok(e && e.payload.by === 'barrel', 'barrel, got ' + e?.payload.by);
    assert.equal(target.tumble, 0);
  }
  {
    const { race, rec, items, target } = missileArena(28);
    // the real course (project, frameAt, ground) with only the obstacle query replaced: the guidance and its projection hints keep working
    const stub = Object.create(course);
    stub.collide = (pos, r, _x, out) => { out.kind = 'hazard'; out.depth = 1; out.soft = false; return pos.distanceTo(target.flight.pos) > 40; };
    items.course = stub;
    run(race, () => types(rec, 'missile:evaded').length > 0);
    const e = types(rec, 'missile:evaded')[0]; assert.ok(e && e.payload.by === 'obstacle', 'obstacle, got ' + e?.payload.by);
    assert.equal(target.tumble, 0);
  }
  {
    const { race, rec, target } = missileArena(29);
    let k = 0;
    // the target jumps 1 km up the course while the missile is still well short of it (it now steers from launch and reaches an 80 m gap in about a second)
    run(race, () => { if (++k === 30) { target._ts = 1800; place(race, target, 1800, 0, 0, 100); } return types(rec, 'missile:evaded').length > 0; }, 8);
    const e = types(rec, 'missile:evaded')[0]; assert.ok(e && e.payload.by === 'outrun', 'outrun, got ' + e?.payload.by);
    assert.equal(target.tumble, 0);
  }
});

test('mine: arms, ignores its owner at first, then tumbles whoever flies into it', () => {
  const { race, rec, items } = arena(30, { bots: 2 });
  const clearS = [900, 1300, 1700, 2100, 2900, 3300, 3700].find((q) => !course.hazards.some((h) => h.s > q - 160 && h.s < q + 900)) ?? 900;
  const owner = race.player, victim = race.racers.find((r) => r.isAI);
  place(race, owner, clearS); items.give(owner, 'mine', 1); assert.equal(items.useItem(owner), true);
  const mine = items.mines[0]; assert.ok(mine);
  // armed, but the owner is inside the grace window
  place(race, victim, clearS + 400);
  const pin = (r) => { r.flight.pos.copy(mine.pos); r.prev.pos.copy(mine.pos); race.onTeleport(r); };
  for (let k = 0; mine.t < W.mine.ownerGrace - 0.1 && k < 400; k++) { pin(owner); stepRace(race, { steps: 1, controls: idle() }); }
  assert.ok(mine.t > W.mine.arm, 'armed');
  assert.equal(types(rec, 'mine:hit').length, 0, 'owner is safe inside the grace window');
  for (let k = 0; !mine.dead && k < 400; k++) { pin(owner); stepRace(race, { steps: 1, controls: idle() }); }
  assert.equal(types(rec, 'mine:hit').length, 1, 'after the grace window even the owner is hit');
  owner.invuln = 0; owner.tumble = 0; owner.flight.tumble.t = 0;
  items.give(owner, 'mine', 1); place(race, owner, clearS); items.useItem(owner);
  // a stranger on the mine
  place(race, owner, clearS + 700);
  victim.invuln = 0;
  const m = items.mines[0];
  for (let k = 0; !m.dead && k < 200; k++) { victim.flight.pos.copy(m.pos); victim.prev.pos.copy(m.pos); race.onTeleport(victim); stepRace(race, { steps: 1, controls: idle() }); }
  assert.equal(types(rec, 'mine:hit').length, 2);
  assert.ok(victim.tumble > 0 && victim.stats.hitsTaken >= 1, 'kinds ' + types(rec, 'racer:hit').map((e) => e.payload.kind + ':' + e.payload.racer.name).join() + ' tumble ' + victim.tumble + ' hits ' + victim.stats.hitsTaken);
  assert.equal(items.mines.length, 0, 'mine consumed');
});

test('emp: stuns and slows every racer in range, not the caster and not far-away racers', () => {
  const { race, rec, items } = arena(31, { bots: 3 });
  const [caster, near, far] = [race.player, ...race.racers.filter((r) => r.isAI)];
  place(race, caster, 900); place(race, near, 930); place(race, far, 900 + W.emp.radius + 400);
  items.give(caster, 'emp', 1); assert.equal(items.useItem(caster), true);
  assert.equal(types(rec, 'emp:fire').length, 1);
  assert.ok(near.empT > 0, 'in range is stunned');
  assert.equal(caster.empT, 0); assert.equal(far.empT, 0);
});

test('smoke: blinds a racer in the cloud, never its owner', () => {
  const { race, items } = arena(32, { bots: 2 });
  const owner = race.player, other = race.racers.find((r) => r.isAI);
  place(race, owner, 900); items.give(owner, 'smoke', 1); assert.equal(items.useItem(owner), true);
  const c = items.clouds[0]; assert.ok(c);
  other.flight.pos.copy(c.pos); other.prev.pos.copy(c.pos); race.onTeleport(other);
  owner.flight.pos.copy(c.pos); owner.prev.pos.copy(c.pos);
  stepRace(race, { steps: 2, controls: idle() });
  assert.ok(other.blind > 0, 'victim blinded');
  assert.equal(owner.blind, 0, 'owner unaffected');
});

test('drone: follows, fires and expires on schedule', () => {
  const { race, rec, items } = arena(33, { bots: 3 });
  const owner = race.player; place(race, owner, 900);
  items.give(owner, 'drone', 1); assert.equal(items.useItem(owner), true);
  assert.equal(items.drones.length, 1);
  // the real course (the drone flies its frame) with only the obstacle query switched off: this test is about the schedule
  const stub = Object.create(course); stub.collide = () => false; items.course = stub;
  place(race, race.racers.find((r) => r.isAI), 1000);
  tick(race, W.drone.life + 0.5);
  assert.equal(items.drones.length, 0, 'gone after its life');
  assert.equal(types(rec, 'drone:expire').length, 1);
});

test('cannon: heat builds, overheat stops fire until it cools, bolts hit, a burst combos into a tumble', () => {
  const { race, rec, items } = arena(34, { bots: 2 });
  const shooter = race.player, target = race.racers.find((r) => r.isAI);
  place(race, shooter, 900, 0, 0, 105); place(race, target, 1010, 0, 0, 100);
  const fire = createControls(); fire.fire = true;
  let overheatedAt = -1, shotsAtOverheat = 0;
  for (let i = 0; i < 60 * 8; i++) {
    stepRace(race, { steps: 1, controls: fire });
    if (shooter.overheated && overheatedAt < 0) { overheatedAt = i; shotsAtOverheat = types(rec, 'cannon:fire').length; }
  }
  assert.ok(overheatedAt > 0, 'sustained fire overheats');
  assert.ok(shotsAtOverheat >= 14 && shotsAtOverheat <= 60, 'shots until overheat: ' + shotsAtOverheat);
  const hits = types(rec, 'cannon:hit');
  assert.ok(hits.length >= 3, 'bolts connect, got ' + hits.length);
  assert.ok(target.stats.hitsTaken >= 3);
  // cooling: no new shots while locked out
  const n0 = types(rec, 'cannon:fire').length;
  shooter.overheated = true; shooter.heat = 1;
  stepRace(race, { steps: 10, controls: fire });
  assert.equal(types(rec, 'cannon:fire').length, n0, 'locked out while overheated');
  // let it cool fully: the gun works again
  tick(race, 6);
  assert.equal(shooter.overheated, false); assert.ok(shooter.heat < 0.2);
  stepRace(race, { steps: 12, controls: fire });
  assert.ok(types(rec, 'cannon:fire').length > n0, 'fires again after cooling');
});

test('cannon combo: five landed bolts in the window tumble the target', () => {
  const { race, rec, items } = arena(35, { bots: 1 });
  const shooter = race.player, target = race.racers.find((r) => r.isAI);
  place(race, target, 1000);
  for (let i = 0; i < W.cannon.comboHits; i++) {
    target.invuln = 0;
    const b = items.fireBolt(shooter, false, target.flight.pos.clone().addScaledVector(target.flight.forward, 3), target.flight.forward.clone().negate());
    assert.ok(b.active);
    stepRace(race, { steps: 1, controls: idle() });
  }
  assert.ok(types(rec, 'cannon:hit').length >= W.cannon.comboHits);
  assert.ok(target.tumble > 0, 'combo tumble');
});

// ---------------------------------------------------------------- round-1 item fixes (P-05, P-09, P-14, P-15, E-17, E-32), items agent
const _yq = new THREE.Quaternion(), _nose = new THREE.Vector3(), _dv = new THREE.Vector3();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** Carry racers down the course at their own lateral offset (`_cl`) and at a fixed speed `_v`, or, without one, at their CURRENT speed (so a slow-down
 *  sticks); `_yaw` turns the nose off the course direction (rad, about the course up). A neutral aircraft would otherwise leave the course at the first bend. */
function carry(race, rs) {
  for (const r of rs) {
    const v = r._v ?? r.flight.speed;
    r._cs += v * SIM_DT; place(race, r, r._cs, r._cl || 0, 0, v);
    if (r._yaw) { _yq.setFromAxisAngle(f.up, r._yaw); r.flight.quat.premultiply(_yq); r.flight.forward.applyQuaternion(_yq); r.flight.right.applyQuaternion(_yq); r.prev.quat.copy(r.flight.quat); }
  }
}
/** Step `seconds` with idle player controls, carrying `rs` after each step; stops early when each(stepIndex) returns true. Returns steps run. */
function drive(race, seconds, rs, each = () => false) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) { stepRace(race, { steps: 1, controls: idle() }); carry(race, rs); if (each(i)) return i + 1; }
  return n;
}
const settled = (rec) => types(rec, 'missile:hit').length + types(rec, 'missile:evaded').length > 0;
const outcome = (rec) => (types(rec, 'missile:hit').length ? 'hit' : types(rec, 'missile:evaded')[0]?.payload.by);

test('lock (P-05, E-17): the racer ahead ON THE COURSE in the course-frame cone is locked (not the one nearest the nose), over lockTime, named in the event', () => {
  const { race, rec, items } = arena(40, { bots: 3 });
  const owner = race.player, [ace, dutch] = race.racers.filter((r) => r.isAI);
  Object.assign(owner, { _cs: 1500, _yaw: 0.3 }); Object.assign(ace, { _cs: 1610 });
  carry(race, [owner, ace]);
  // dutch sits straight down the owner's (yawed) nose, 380 m out: the smallest nose angle of anyone, which is what the old lock picked
  const nose = () => _nose.set(0, 0, -1).applyQuaternion(owner.flight.quat);
  const putDutch = () => { dutch.flight.pos.copy(owner.flight.pos).addScaledVector(nose(), 380); dutch.prev.pos.copy(dutch.flight.pos); race.onTeleport(dutch); };
  const noseAng = (o) => Math.acos(clamp(_dv.copy(o.flight.pos).sub(owner.flight.pos).normalize().dot(nose()), -1, 1));
  putDutch();
  assert.ok(dutch.flight.pos.y > course.groundHeight(dutch.flight.pos.x, dutch.flight.pos.z) + 20, 'dutch is in clear air');
  assert.ok(noseAng(dutch) < noseAng(ace) - 0.15, `dutch is nearer the nose (${noseAng(dutch).toFixed(2)} vs ${noseAng(ace).toFixed(2)} rad)`);
  assert.ok(dutch.s - owner.s > ace.s - owner.s + 100, 'ace is the nearest racer ahead on the course');
  items.give(owner, 'missile', 1);
  let full = -1, wrong = 0;
  drive(race, 2, [owner, ace], (i) => { putDutch(); if (owner.lock.target && owner.lock.target !== ace) wrong++; if (full < 0 && owner.lock.progress >= 1) full = i + 1; return full > 0; });
  assert.equal(wrong, 0, 'never locks the racer nearest the nose');
  assert.equal(owner.lock.target, ace);
  const t = full * SIM_DT;
  assert.ok(full > 0 && Math.abs(t - W.missile.lockTime) <= 2.5 * SIM_DT, `full lock after ${t.toFixed(3)} s (lockTime ${W.missile.lockTime} s)`);
  const locks = types(rec, 'missile:lock').filter((e) => e.payload.owner === owner);
  assert.ok(locks.filter((e) => e.payload.progress > 0 && e.payload.progress < 1).length >= 5, 'the lock builds in steps (HUD ring), got ' + locks.length);
  assert.ok(locks.every((e) => e.payload.target === ace && e.payload.targetId === ace.id && e.payload.targetName === ace.name), 'the events name the target');
  assert.equal(locks.at(-1).payload.progress, 1);
  // smoke breaks a lock at once (P-15)
  ace.blind = W.smoke.blind;
  drive(race, SIM_DT * 2, [owner, ace]);
  const un = types(rec, 'missile:unlock').filter((e) => e.payload.owner === owner);
  assert.equal(un.at(-1)?.payload.reason, 'blind'); assert.equal(un.at(-1).payload.targetId, ace.id);
  assert.notEqual(owner.lock.target, ace, 'a blind racer cannot be locked');
});

test('triple (P-05): while the first missile flies, the next lock goes to the next racer ahead instead of into the tumble the first will cause', () => {
  const { race, items } = arena(41, { bots: 3 });
  const owner = race.player, [a, b] = race.racers.filter((r) => r.isAI);
  Object.assign(owner, { _cs: 1500 }); Object.assign(a, { _cs: 1640 }); Object.assign(b, { _cs: 1830 });
  const rs = [owner, a, b]; carry(race, rs);
  items.give(owner, 'triple', 3);
  drive(race, 2, rs, () => owner.lock.progress >= 1);
  assert.equal(owner.lock.target, a, 'the nearest racer ahead first');
  assert.equal(items.useItem(owner), true);
  const m1 = items.missiles[0]; assert.equal(m1.target, a);
  drive(race, 0.6, rs, () => owner.lock.target === b);
  assert.ok(!m1.dead, 'the first missile is still in the air');
  assert.equal(owner.lock.target, b, 'the second lock is the next racer ahead');
});

test('missile seeker (P-05): a missile whose quarry is tumbled by someone else takes the next racer ahead instead of spending itself on the grace', () => {
  const { race, rec, items } = arena(42, { bots: 3 });
  const owner = race.player, [a, b] = race.racers.filter((r) => r.isAI);
  Object.assign(owner, { _cs: 1500 }); Object.assign(a, { _cs: 1700 }); Object.assign(b, { _cs: 1850 });
  const rs = [owner, a, b]; carry(race, rs);
  items.give(owner, 'missile', 1); owner.lock.target = a; owner.lock.progress = 1;
  assert.equal(items.useItem(owner), true);
  const m = items.missiles[0];
  drive(race, 0.3, rs);
  assert.equal(applyHit(race, a, null, 'mine', { tumble: 1.4, loss: 0.3 }), true, 'a is tumbled by something else');
  drive(race, 6, rs, () => settled(rec));
  assert.equal(m.target, b, 'retargeted');
  assert.ok(types(rec, 'missile:warn').some((e) => e.payload.target === b), 'b is warned');
  assert.equal(outcome(rec), 'hit'); assert.equal(types(rec, 'missile:hit')[0].payload.target, b);
});

test('barrel roll is a timing window (P-05, P-14): a roll begun on the evade cue dodges; one begun too early or too late does not', () => {
  const trial = (seed, when) => {
    const { race, rec, items, target } = missileArena(seed, 160);
    let rolled = false;
    target.ai.think = (dt, out) => {
      out.pitch = 0; out.roll = 0; out.yaw = 0; out.boost = false; out.fire = false; out.item = false; out.itemBack = false; out.airbrake = 0; out.barrel = 0;
      const th = items.threatOf(target);
      if (!rolled && th && when(th, target)) { rolled = true; out.barrel = 1; }      // the real roll: the flight model starts it this step
      return out;
    };
    run(race, () => settled(rec));
    return { out: outcome(rec), rolled, rec, target };
  };
  const cue = trial(43, (th) => th.evade);
  assert.ok(cue.rolled, 'the cue came'); assert.equal(cue.out, 'barrel', 'rolled on the cue: evaded');
  const warns = types(cue.rec, 'missile:warn').filter((e) => e.payload.target === cue.target);
  const T = FLIGHT.barrelTime, M = W.missile;
  assert.ok(warns.some((e) => e.payload.evade), 'a warning says ROLL');
  for (const e of warns) if (e.payload.evade) assert.ok(e.payload.tti >= M.evadeFrom * T + M.cue[0] - 1e-9 && e.payload.tti <= M.evadeTo * T - M.cue[1] + 1e-9, 'evade only inside the window, tti ' + e.payload.tti);
  const early = trial(44, (th) => th.tti < 1.3 && th.tti > 0.9);
  assert.ok(early.rolled); assert.equal(early.out, 'hit', 'a roll that is over before the missile arrives does not dodge it');
  const late = trial(45, (th, tg) => th.dist - tg.radius - W.missile.hitPad < th.closing * 0.035);
  assert.ok(late.rolled); assert.equal(late.out, 'hit', 'a roll begun two steps before impact does not dodge it yet');
});

test('missile warning (P-14): pings speed up as tti falls, tti runs smoothly through a bend, evade only in the window', () => {
  const { race, rec, items } = arena(46, { bots: 2 });
  const owner = race.player, target = race.racers.find((r) => r.isAI);
  Object.assign(owner, { _cs: 2150, _v: 100 }); Object.assign(target, { _cs: 2420, _v: 100 });       // the missile has to follow the 50 degree dive at s 2250-2550
  carry(race, [owner, target]);
  items.give(owner, 'missile', 1); owner.lock.target = target; owner.lock.progress = 1;
  assert.equal(items.useItem(owner), true);
  drive(race, 7, [owner, target], () => settled(rec));
  const warns = types(rec, 'missile:warn').filter((e) => e.payload.target === target), M = W.missile;
  assert.ok(warns.length >= 6, 'warnings: ' + warns.length);
  for (const e of warns) assert.ok(Math.abs(e.payload.interval - clamp(M.ping[0] + M.ping[1] * e.payload.tti, M.ping[2], M.ping[3])) < 1e-9, 'interval follows tti');
  assert.ok(warns[0].payload.interval > warns.at(-1).payload.interval + 0.15, `pings speed up: ${warns[0].payload.interval.toFixed(2)} -> ${warns.at(-1).payload.interval.toFixed(2)} s`);
  for (let k = 1; k < warns.length; k++) {
    const a = warns[k - 1], b = warns[k], dt = b.t - a.t;
    assert.ok(Math.abs(b.payload.tti - (a.payload.tti - dt)) < 0.3, `tti ${a.payload.tti.toFixed(2)} -> ${b.payload.tti.toFixed(2)} in ${dt.toFixed(2)} s`);
  }
  const end = (types(rec, 'missile:hit')[0] || types(rec, 'missile:evaded')[0]).t, w1 = warns.reduce((x, e) => (Math.abs(e.payload.tti - 1) < Math.abs(x.payload.tti - 1) ? e : x));
  assert.ok(Math.abs(end - w1.t - w1.payload.tti) < 0.25, `predicted ${w1.payload.tti.toFixed(2)} s, arrived after ${(end - w1.t).toFixed(2)} s`);
});

test('smoke (P-15): dropped on the follower\'s line; a follower at 110 m/s is blinded ~1.2 s, loses real speed and cannot be locked', () => {
  const { race, rec, items } = arena(47, { bots: 2 });
  const owner = race.player, fol = race.racers.find((r) => r.isAI);
  course.frameAt(850, f); const lat = Math.min(60, 0.6 * f.halfWidth);
  Object.assign(owner, { _cs: 1000, _v: 100 }); Object.assign(fol, { _cs: 850, _cl: lat, _v: 110 });       // the follower holds 110 m/s up to the cloud
  carry(race, [owner, fol]);
  items.give(owner, 'smoke', 1); assert.equal(items.useItem(owner), true);
  const dep = types(rec, 'smoke:deploy')[0].payload, c = items.clouds[0];
  assert.equal(dep.target, fol, 'placed for the follower');
  const cp = course.project(c.pos, owner.s, {});
  assert.ok(Math.abs(cp.lateral - fol.lateral) < 10, `on the follower's line (cloud lateral ${cp.lateral.toFixed(1)}, follower ${fol.lateral.toFixed(1)})`);
  let entry = -1, exit = -1, last = fol.flight.speed, spdIn = 0, spdOut = 0, blindAfter = 0, lockable = 0;
  drive(race, 6, [owner, fol], (i) => {
    const inside = fol.flight.pos.distanceTo(c.pos) < W.smoke.radius;
    if (inside && entry < 0) { entry = i; spdIn = last; fol._v = undefined; }      // from here its own speed (drag, then thrust) carries it
    if (!inside && entry >= 0 && exit < 0) { exit = i; spdOut = fol.flight.speed; }
    if (exit >= 0 && fol.blind > 0) { blindAfter += SIM_DT; if (items.bestCandidate(owner, true, W.missile.lockCone) === fol) lockable++; }
    last = fol.flight.speed;
    return exit >= 0 && fol.blind <= 0;
  });
  assert.ok(entry >= 0 && exit > entry, 'the follower flew through the cloud');
  const bl = types(rec, 'smoke:blind').filter((e) => e.payload.racer === fol);
  assert.equal(bl.length, 1); assert.equal(bl[0].payload.owner, owner); assert.equal(bl[0].payload.duration, W.smoke.blind);
  assert.ok(blindAfter >= W.smoke.blind - 3 * SIM_DT && blindAfter <= W.smoke.blind + 2 * SIM_DT, `blind for ${blindAfter.toFixed(2)} s after leaving the cloud`);
  assert.ok(spdOut <= spdIn * 0.85, `speed ${spdIn.toFixed(0)} -> ${spdOut.toFixed(0)} m/s across the cloud`);
  assert.equal(lockable, 0, 'a blind racer cannot be locked');
  assert.equal(owner.blind, 0, 'the owner is never blinded by its own smoke');
});

test('drone (P-09, E-17): flies the course, survives brushing the ground, fires at the racer ahead, lands hits, is spent by maxHits landed bolts', () => {
  const { race, rec, items } = arena(48, { bots: 3 });
  const owner = race.player, tgt = race.racers.find((r) => r.isAI);
  Object.assign(owner, { _cs: 900 }); Object.assign(tgt, { _cs: 1000 });
  const rs = [owner, tgt]; carry(race, rs);
  // a teleport keeps race distance, so set the ranking the placement means: tgt leads, the owner is next, the parked racers trail
  for (const o of race.racers) o.dist = o === tgt ? 1100 : o === owner ? 1000 : 0;
  let shots = 0; const fb = items.fireBolt.bind(items);
  items.fireBolt = (r, byDrone, from, dir) => { if (byDrone) shots++; return fb(r, byDrone, from, dir); };
  items.give(owner, 'drone', 1); assert.equal(items.useItem(owner), true);
  const d = items.drones[0];
  drive(race, 1, rs);
  d.pos.y = course.groundHeight(d.pos.x, d.pos.z) + 0.5;                       // push it into the ground once
  drive(race, 0.2, rs);
  assert.ok(!d.dead, 'the drone survives a brush with the ground');
  assert.ok(d.pos.y > course.groundHeight(d.pos.x, d.pos.z) + 1, 'and is lifted clear');
  drive(race, W.drone.life, rs, () => d.dead);
  const hits = types(rec, 'cannon:hit').filter((e) => e.payload.racer === owner && e.payload.target === tgt).length;
  assert.ok(shots >= 3, 'drone bolts fired: ' + shots);
  assert.ok(hits >= 1 && d.hits >= 1, 'drone bolts land: ' + hits);
  assert.ok(d.hits <= W.drone.maxHits, 'never more than maxHits landed bolts');
  const exp = types(rec, 'drone:expire');
  assert.equal(exp.length, 1); assert.equal(exp[0].payload.reason, d.hits >= W.drone.maxHits ? 'spent' : 'time');
  assert.equal(items.drones.length, 0);
});

test('shield item (E-17): lasts WEAPONS.shield.time, then drops with shield:down', () => {
  const { race, rec, items } = arena(49, { bots: 1 });
  const v = race.player; Object.assign(v, { _cs: 1500 }); carry(race, [v]);
  items.give(v, 'shield', 1); assert.equal(items.useItem(v), true);
  assert.equal(v.shield, W.shield.time); assert.equal(types(rec, 'shield:up').length, 1);
  drive(race, W.shield.time - 0.5, [v]);
  assert.ok(v.shield > 0.3 && v.shield < 0.7, 'still up 0.5 s before the end: ' + v.shield.toFixed(2));
  assert.equal(types(rec, 'shield:down').length, 0);
  drive(race, 0.6, [v]);
  assert.equal(v.shield, 0); assert.equal(types(rec, 'shield:down').length, 1);
});

test('emp (E-17): reaches a racer 200 m away, not one just beyond its radius, never the caster', () => {
  const { race, rec, items } = arena(50, { bots: 3 });
  const [caster, near, far] = [race.player, ...race.racers.filter((r) => r.isAI)];
  place(race, caster, 1500);
  const at = (r, m) => { r.flight.pos.copy(caster.flight.pos).addScaledVector(f.tangent, m); r.prev.pos.copy(r.flight.pos); race.onTeleport(r); };
  course.frameAt(1500, f); at(near, 200); at(far, W.emp.radius + 30);
  assert.ok(Math.abs(near.flight.pos.distanceTo(caster.flight.pos) - 200) < 0.01);
  items.give(caster, 'emp', 1); assert.equal(items.useItem(caster), true);
  assert.equal(types(rec, 'emp:fire')[0].payload.radius, W.emp.radius);
  assert.ok(near.empT > 0, 'stunned at 200 m');
  assert.equal(far.empT, 0); assert.equal(caster.empT, 0);
});

test('projectiles keep their own projection hint (E-32): no full projection scan per missile or drone step', () => {
  const { race, items } = arena(51, { bots: 3 });
  const owner = race.player, [a, b] = race.racers.filter((r) => r.isAI);
  Object.assign(owner, { _cs: 1500 }); Object.assign(a, { _cs: 1750 }); Object.assign(b, { _cs: 1900 });
  const rs = [owner, a, b]; carry(race, rs);
  let calls = 0, scans = 0, noProj = 0;
  const spy = Object.create(course);
  spy.project = function (pos, hint, out) { calls++; if (hint == null || !Number.isFinite(hint)) scans++; return course.project.call(this, pos, hint, out); };
  spy.collide = function (pos, r, proj, out) { if (!proj) noProj++; return course.collide.call(this, pos, r, proj, out); };
  items.course = spy;
  items.give(owner, 'missile', 1); owner.lock.target = a; owner.lock.progress = 1; assert.equal(items.useItem(owner), true);
  items.give(owner, 'drone', 1); assert.equal(items.useItem(owner), true);
  drive(race, 2, rs);
  assert.ok(calls >= 120, 'projectiles projected every step: ' + calls);
  assert.equal(scans, 0, 'no un-hinted (whole-course) projection');
  assert.equal(noProj, 0, 'collide always gets the projectile\'s own projection');
});
