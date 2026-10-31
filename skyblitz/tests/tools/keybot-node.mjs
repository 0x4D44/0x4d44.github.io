// Node key-bot: the real fake-game race, the real guide, input.js's key ramps and its handsOffT, with a scripted person on the keys. No browser; ~10-60 s per 3-lap race.
//   node --import ./skyblitz/tests/register.mjs skyblitz/tests/tools/keybot-node.mjs --course sunrise,redrock,neon,frost --craft falcon --diff normal --seeds 7,1 --laps 3 --bots 7 --modes tap,track,hands,assist
// One JSON row per race (place, time, tumbles, graze, hits, ...) on stdout, then a summary row per (mode, diff): mean place, podiums, tumbles per race.
// Modes (the AI brain `p.ai.think` supplies what a good pilot would do; the bot presses keys for it, one frame late like a person at 0.12 s):
//   tap     roll / pitch keys pressed in short taps (0.1 s PWM, 0.12 s reaction, 0.12 dead zone) + boost / fire / item / barrel keys from the brain
//   track   roll / pitch keys held exactly as long as it takes the ramp to reach the brain's value (an ideal, frame-perfect key pilot) + button keys
//   hands   no key at all (the guide flies; handsOffT grows)
//   assist  no roll / pitch keys, but boost / fire / item / barrel from the brain (no airbrake): the Standard-assist player who only manages boost and items
// handsOffT is emulated as input.js does: seconds the guide has flown with no key (any key, latched tap, or non-zero key ramp) -> game.input.handsOffT.
import { createFakeGame, loadCourseHeadless, makeRace } from '../helpers/fake-game.mjs';
import { createGuide, GUIDE } from '../../src/flight/guide.js';
import { createControls } from '../../src/controls.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d; };
const courses = arg('course', 'sunrise,redrock,neon,frost').split(','), crafts = arg('craft', 'falcon').split(','), diffs = arg('diff', 'normal').split(',');
const seeds = arg('seeds', '7').split(',').map(Number), laps = +arg('laps', 3), nBots = +arg('bots', 7), modes = arg('modes', 'tap,track,hands,assist').split(',');
Object.assign(GUIDE, JSON.parse(arg('guide', '{}')));      // --guide '{"netLo":0.7,"residual":0.3}': GUIDE overrides for tuning sweeps
const OFF = new Set(arg('off', '').split(',').filter(Boolean));   // --off boost,brake,barrel,fireitem: disable a button class for the buttoned modes (decomposition)
const DT = 1 / 60, KEY_ROLL_MAX = +arg('rollmax', 0.98);
const approach = (cur, target, rate, dt) => { const d = target - cur, m = rate * dt; return Math.abs(d) <= m ? target : cur + Math.sign(d) * m; };
const CFG = { tap: { pwm: 'tap', buttons: true, interval: 0.1, delay: 0.12, dead: 0.12 }, track: { pwm: 'track', buttons: true, interval: 1 / 60, delay: 0, dead: 0.02 }, hands: { pwm: 'none', buttons: false }, assist: { pwm: 'none', buttons: true, brake: false } };   // assist: no airbrake (the brain brakes for corners the guide flies anyway: ~27 s per race, see the flight handoff); tap / track keep it

const cache = {}, rows = [];
for (const id of courses) {
  const course = cache[id] ||= await loadCourseHeadless(createFakeGame({ seed: 1 }), id);
  for (const craft of crafts) for (const diff of diffs) for (const seed of seeds) for (const mode of modes) {
    const cfg = CFG[mode]; if (!cfg) throw new Error('unknown mode ' + mode);
    const game = createFakeGame({ seed, settings: { assist: 'standard', keyGuide: true } }); game.course = course; game.input = { handsOffT: 0 };
    const race = makeRace(game, course, { difficulty: diff, craftId: craft, laps, bots: nBots, seed });
    const p = race.player, c = createControls(), g = createGuide(), gout = { roll: 0, pitch: 0 };
    const o = { pitch: 0, roll: 0, yaw: 0, boost: false, fire: false, item: false, itemBack: false, barrel: 0, airbrake: 0, throttle: 1 };
    const cnt = { graze: 0, tumble: 0, stall: 0, hit: 0, wrong: 0, respawn: 0 };
    for (const [t, k] of [['racer:graze', 'graze'], ['racer:tumble', 'tumble'], ['racer:stall', 'stall'], ['racer:hit', 'hit'], ['race:wrongway', 'wrong'], ['race:respawn', 'respawn']]) game.events.on(t, (d) => { if (d && (d.racer || d.target || d.victim) === p) cnt[k]++; });
    const ring = [], keys = new Set(); const st = { roll: 0, pitch: 0 }; let latchItem = false, latchBarrel = 0, handsOff = 0;
    const sample = () => {
      const kr = (keys.has('D') ? 1 : 0) - (keys.has('A') ? 1 : 0), kp = (keys.has('S') ? 1 : 0) - (keys.has('W') ? 1 : 0);
      st.pitch = approach(st.pitch, kp, kp === 0 ? 9 : 4.5, DT); st.roll = approach(st.roll, kr * KEY_ROLL_MAX, kr === 0 ? 12 : 8, DT);
      const anyKey = keys.size > 0 || latchItem || latchBarrel !== 0 || st.roll !== 0 || st.pitch !== 0;
      const w = g.blend(game, p.flight, st.roll, st.pitch, gout);
      handsOff = w > 0 && !anyKey ? handsOff + DT : 0; game.input.handsOffT = handsOff;
      c.roll = gout.roll; c.pitch = gout.pitch; c.yaw = 0; c.boost = keys.has('B'); c.airbrake = keys.has('X') ? 1 : 0; c.fire = keys.has('F'); c.barrel = latchBarrel; c.item = latchItem;
      latchItem = false; latchBarrel = 0;
    };
    const stepOne = (think) => {
      if (think) { p.ai.think(DT, o); ring.push({ p: o.pitch, r: o.roll, boost: !!o.boost, fire: !!o.fire, item: !!o.item, barrel: o.barrel | 0, brake: o.airbrake > 0.3 }); if (ring.length > 90) ring.shift(); }
      sample(); race.fixedUpdate(DT, c); game.simTime += DT;
    };
    let guard = 0;
    while (race.state !== 'racing' && guard++ < 5000) { if (cfg.buttons && race.state === 'countdown' && race.cd - 1.2 <= 0.3) keys.add('B'); stepOne(false); }
    keys.clear();
    const interval = cfg.interval || 0.1, nStep = Math.max(1, Math.round(interval * 60)), delaySteps = Math.round((cfg.delay || 0) * 60), dead = cfg.dead ?? 0.12;
    const maxClock = Math.max(240, 200 * laps), t0 = Date.now();
    while (!p.finished && race.state !== 'done' && race.clock < maxClock) {
      if (cfg.pwm === 'none' && !cfg.buttons) { stepOne(false); continue; }
      const a = ring[Math.max(0, ring.length - 1 - delaySteps)] || { p: 0, r: 0 };
      const want = new Set(), part = [];
      if (cfg.pwm === 'track') {
        const trk = (v, x, neg, pos) => { if (v > dead) { if (x < v) want.add(pos); } else if (v < -dead) { if (x > v) want.add(neg); } };
        trk(a.r, st.roll, 'A', 'D'); trk(a.p, st.pitch, 'W', 'S');
      } else if (cfg.pwm === 'tap') {
        const axis = (v, neg, pos) => { const m = Math.abs(v); if (m < dead) return; const key = v > 0 ? pos : neg; want.add(key); if (m < 0.85) part.push([key, Math.max(1, Math.round(m * nStep))]); };
        axis(a.r, 'A', 'D'); axis(a.p, 'W', 'S');
      }
      if (cfg.buttons) { if (a.boost && !OFF.has('boost')) want.add('B'); if (a.fire && !OFF.has('fireitem')) want.add('F'); if (a.brake && cfg.brake !== false && !OFF.has('brake')) want.add('X'); }
      for (const k of [...keys]) if (!want.has(k)) keys.delete(k);
      for (const k of want) keys.add(k);
      if (cfg.buttons && a.item && !OFF.has('fireitem')) { latchItem = true; stepOne(true); stepOne(true); }
      if (cfg.buttons && a.barrel && !OFF.has('barrel')) { latchBarrel = a.barrel < 0 ? -1 : 1; stepOne(true); stepOne(true); }
      let done = 0;
      for (const [key, hold] of part.sort((x, y) => x[1] - y[1])) { while (done < hold) { stepOne(true); done++; } keys.delete(key); }
      while (done < nStep) { stepOne(true); done++; }
    }
    const row = { course: id, craft, diff, seed, mode, place: p.place, fin: !!p.finished, t: +(p.finishTime || race.clock).toFixed(1), tum: cnt.tumble, graze: cnt.graze, hit: cnt.hit, wrong: cnt.wrong, respawn: cnt.respawn, wall: Math.round((Date.now() - t0) / 1000) };
    rows.push(row); console.log(JSON.stringify(row));
  }
}
console.log(JSON.stringify({ guide: arg('guide', '{}') }));
const groups = {};
for (const r of rows) (groups[`${r.mode} ${r.diff} ${r.craft}`] ||= []).push(r);
for (const [k, v] of Object.entries(groups)) {
  const mean = (f) => +(v.reduce((a, r) => a + f(r), 0) / v.length).toFixed(2);
  console.log(JSON.stringify({ summary: k, races: v.length, meanPlace: mean((r) => r.place), podiums: v.filter((r) => r.place <= 3).length, wins: v.filter((r) => r.place === 1).length, tumblesPerRace: mean((r) => r.tum), unfinished: v.filter((r) => !r.fin).length }));
}
