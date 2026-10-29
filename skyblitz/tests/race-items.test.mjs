// Item and weapon unit tests (race agent): drop tables, orbs, missile counterplay, shield/invulnerability rules,
// storm targeting, mine, EMP, smoke, drone and the cannon (heat, overheat, combo). Each test builds a tiny arena.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/race-items.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGame, loadCourseHeadless, makeRace, stepRace, recordEvents } from './helpers/fake-game.mjs';
import { createControls } from '../src/controls.js';
import { WEAPONS as W, ITEMS, ITEM_ORDER, rollItem } from '../src/race/balance.js';
import { applyHit } from '../src/race/damage.js';
import { RNG } from '../src/util.js';
import { basisQuat } from '../src/world/layout.js';

const base = createFakeGame({ seed: 5 });
const course = await loadCourseHeadless(base, 'sunrise');
const f = {};
function place(race, r, s, lateral = 0, vertical = 0, speed = 100) {
  course.frameAt(s, f);
  r.flight.pos.copy(f.pos).addScaledVector(f.right, lateral).addScaledVector(f.up, vertical);
  r.flight.quat.copy(basisQuat(f)); r.flight.speed = speed; r.flight.vel.copy(f.tangent).multiplyScalar(speed);
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

function missileArena(seed) {
  const ar = arena(seed, { bots: 2 });
  const { race, items } = ar;
  const owner = race.player, target = race.racers.find((r) => r.isAI);
  place(race, owner, 800, 0, 0, 100); place(race, target, 880, 0, 0, 100);
  items.give(owner, 'missile', 1); owner.lock.target = target; owner.lock.progress = 1;
  assert.equal(items.useItem(owner), true);
  assert.equal(items.missiles.length, 1);
  assert.equal(items.missiles[0].target, target);
  return { ...ar, owner, target };
}
const run = (race, until, seconds = 6) => stepRace(race, { seconds, controls: idle(), until });

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
    items.course = { collide(pos, r, _x, out) { out.kind = 'hazard'; out.depth = 1; out.soft = false; return pos.distanceTo(target.flight.pos) > 40; } };
    run(race, () => types(rec, 'missile:evaded').length > 0);
    const e = types(rec, 'missile:evaded')[0]; assert.ok(e && e.payload.by === 'obstacle', 'obstacle, got ' + e?.payload.by);
    assert.equal(target.tumble, 0);
  }
  {
    const { race, rec, target } = missileArena(29);
    let k = 0;
    run(race, () => { if (++k === 100) { place(race, target, 1800, 0, 0, 100); } return types(rec, 'missile:evaded').length > 0; }, 8);
    const e = types(rec, 'missile:evaded')[0]; assert.ok(e && e.payload.by === 'outrun', 'outrun, got ' + e?.payload.by);
    assert.equal(target.tumble, 0);
  }
});

test('mine: arms, ignores its owner at first, then tumbles whoever flies into it', () => {
  const { race, rec, items } = arena(30, { bots: 2 });
  const owner = race.player, victim = race.racers.find((r) => r.isAI);
  place(race, owner, 900); items.give(owner, 'mine', 1); assert.equal(items.useItem(owner), true);
  const mine = items.mines[0]; assert.ok(mine);
  // armed, but the owner is inside the grace window
  place(race, victim, 3000);
  const pin = (r) => { r.flight.pos.copy(mine.pos); r.prev.pos.copy(mine.pos); race.onTeleport(r); };
  for (let k = 0; mine.t < W.mine.ownerGrace - 0.1 && k < 400; k++) { pin(owner); stepRace(race, { steps: 1, controls: idle() }); }
  assert.ok(mine.t > W.mine.arm, 'armed');
  assert.equal(types(rec, 'mine:hit').length, 0, 'owner is safe inside the grace window');
  for (let k = 0; !mine.dead && k < 400; k++) { pin(owner); stepRace(race, { steps: 1, controls: idle() }); }
  assert.equal(types(rec, 'mine:hit').length, 1, 'after the grace window even the owner is hit');
  owner.invuln = 0; owner.tumble = 0; owner.flight.tumble.t = 0;
  items.give(owner, 'mine', 1); place(race, owner, 900); items.useItem(owner);
  // a stranger on the mine
  place(race, owner, 3500);
  const m = items.mines[0];
  for (let k = 0; !m.dead && k < 200; k++) { victim.flight.pos.copy(m.pos); victim.prev.pos.copy(m.pos); race.onTeleport(victim); stepRace(race, { steps: 1, controls: idle() }); }
  assert.equal(types(rec, 'mine:hit').length, 2);
  assert.ok(victim.tumble > 0 && victim.stats.hitsTaken === 1);
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
  items.course = { collide: () => false };
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
