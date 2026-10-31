// P-01: the keyboard guide (src/flight/guide.js) with the real stepFlight and the real course. Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/guide.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGame, loadCourseHeadless, makeRace } from './helpers/fake-game.mjs';
import { createControls } from '../src/controls.js';
import { createGuide } from '../src/flight/guide.js';

const DT = 1 / 60;
async function idleFlight(id, settings, secs, keys = {}) {
  const course = await loadCourseHeadless(createFakeGame({ seed: 1 }), id);
  const game = createFakeGame({ seed: 1, settings: { assist: 'standard', ...settings } }); game.course = course;
  const race = makeRace(game, course, { difficulty: 'normal', craftId: 'falcon', laps: 1, bots: 0, mode: 'quick', seed: 1 });
  const p = race.player, c = createControls(), guide = createGuide(), out = { roll: 0, pitch: 0 };
  let tum = 0, wMax = 0; game.events.on('racer:tumble', () => tum++);
  let n = 0; while (race.state !== 'racing' && n < 1000) { race.fixedUpdate(DT, c); game.simTime += DT; n++; }
  const t0 = race.clock;
  while (race.clock - t0 < secs && !p.finished) {
    wMax = Math.max(wMax, guide.blend(game, p.flight, keys.roll || 0, keys.pitch || 0, out)); c.roll = out.roll; c.pitch = out.pitch;
    race.fixedUpdate(DT, c); game.simTime += DT;
  }
  return { s: p.s, lat: p.lateral, tum, w: wMax, p, out };
}

test('P-01: with the keys idle the guide flies the craft down the course; without it the craft drifts off the line', async () => {
  for (const id of ['redrock', 'neon']) {
    const on = await idleFlight(id, { keyGuide: true }, 25), off = await idleFlight(id, { keyGuide: false }, 25);
    // R2b: +300 m was set when the unguided craft started 1-2 m over the deck; the 8 m grid lift lets it fly farther (redrock +658 m, neon +274 m measured), so +200 m
    assert.ok(on.s > off.s + 200, `${id}: guided ${on.s.toFixed(0)} m vs unguided ${off.s.toFixed(0)} m in 25 s`);
    assert.ok(on.tum === 0 && Math.abs(on.lat) < 45, `${id}: guided flight stays clean (tumbles ${on.tum}, lateral ${on.lat.toFixed(0)})`);
    assert.ok(on.w > 0.5 && off.w === 0);
  }
});

test('P-01: Pro assist and the off switch leave the keys alone (R2-P-02: a held key under Standard keeps a residual, see the residual test)', async () => {
  const pro = await idleFlight('sunrise', { keyGuide: true, assist: 'pro' }, 0.5, { roll: 0.2 });
  assert.equal(pro.out.roll, 0.2); assert.equal(pro.w, 0, 'Pro assist: the guide is out');
  const off = await idleFlight('sunrise', { keyGuide: false }, 0.5, { roll: 0.2 });
  assert.equal(off.out.roll, 0.2); assert.equal(off.w, 0);
});

// ---------------- round 2 (R2-P-01 deck crash, R2-P-01 single-key hand-back, R2-E-10 mutation holes) ----------------
import { GUIDE } from '../src/flight/guide.js';
const CRAFTS = ['falcon', 'wasp', 'manta', 'bulldog', 'comet', 'sprite'], COURSES = ['sunrise', 'redrock', 'neon', 'frost'];
async function rig(id, craft, settings = {}) {
  const course = await loadCourseHeadless(createFakeGame({ seed: 1 }), id);
  const game = createFakeGame({ seed: 1, settings: { assist: 'standard', keyGuide: true, ...settings } }); game.course = course;
  const race = makeRace(game, course, { difficulty: 'normal', craftId: craft, laps: 1, bots: 0, mode: 'quick', seed: 1 });
  const c = createControls(); let n = 0;
  while (race.state !== 'racing' && n < 1000) { race.fixedUpdate(DT, c); game.simTime += DT; n++; }
  return { course, game, race, c, p: race.player, guide: createGuide(), out: { roll: 0, pitch: 0 } };
}
const step = (r, roll = 0, pitch = 0, cfg) => { const w = r.guide.blend(r.game, r.p.flight, roll, pitch, r.out, cfg); r.c.roll = r.out.roll; r.c.pitch = r.out.pitch; r.race.fixedUpdate(DT, r.c); r.game.simTime += DT; return w; };
const heading = (fs) => Math.atan2(fs.forward.x, fs.forward.z) * 180 / Math.PI;

test('R2-P-01 deck: an idle keyboard player with the guide ON never sinks into the grid deck, any craft, any course (first 6 s)', async () => {
  for (const id of COURSES) for (const cr of CRAFTS) {
    const r = await rig(id, cr); let hits = 0; r.game.events.on('racer:hit:ground', () => hits++);
    const fs = r.p.flight, clr = () => fs.pos.y - r.course.groundHeight(fs.pos.x, fs.pos.z) - r.p.radius;
    const go = clr(); let mn = go;
    for (let i = 0; i < 360; i++) { step(r); mn = Math.min(mn, clr()); }
    assert.equal(hits, 0, `${id}/${cr}: ground hit`);
    assert.ok(mn >= Math.min(2, go) - 0.05, `${id}/${cr}: clearance over contact ${mn.toFixed(2)} m (at GO ${go.toFixed(2)} m)`);
  }
});

test('R2-P-01 deck: whatever the grid altitude, a craft 1.5 m over contact with the keys idle holds or gains height (the guide never sinks it)', async () => {
  for (const id of COURSES) for (const cr of CRAFTS) {
    const r = await rig(id, cr); let hits = 0; r.game.events.on('racer:hit:ground', () => hits++);
    const fs = r.p.flight, g = () => r.course.groundHeight(fs.pos.x, fs.pos.z);
    fs.pos.y = g() + r.p.radius + 1.5; r.p.prev.pos.copy(fs.pos); r.race.onTeleport(r.p); r.guide.reset();
    const clr = () => fs.pos.y - g() - r.p.radius; let mn = clr();
    for (let i = 0; i < 360; i++) { step(r); mn = Math.min(mn, clr()); }
    assert.equal(hits, 0, `${id}/${cr}: ground hit`);
    assert.ok(mn >= 1.5 - 0.05, `${id}/${cr}: clearance fell to ${mn.toFixed(2)} m from 1.5 m`);
  }
});

const NONET = { ...GUIDE, netStrength: 0 }, NORES = { ...GUIDE, residual: 0 };
async function turn(cr, kg, roll, pitch, cfg, lift = 0, id = 'frost') {
  const r = await rig(id, cr, { keyGuide: kg }), fs = r.p.flight;
  if (lift) { fs.pos.y += lift; r.p.prev.pos.copy(fs.pos); r.race.onTeleport(r.p); r.guide.reset(); }
  const h0 = heading(fs), y0 = fs.pos.y; let maxRoll = 0;
  for (let i = 0; i < 90; i++) { step(r, roll, pitch, cfg); maxRoll = Math.max(maxRoll, Math.abs(r.out.roll)); }
  return { d: Math.abs(heading(fs) - h0), dy: fs.pos.y - y0, maxRoll };
}
test('R2-P-02 hand-back: ONE shared fade over both axes; the residual alone (net off) keeps >= 0.6 x the guide-off turn and the nose does not drop (all 6 craft, frost, 50 m up)', async () => {
  // measured (net off, residual 0.25, D 0.98 for 1.5 s): turn / guide-off = 0.68 (sprite) .. 0.80; altitude change within 3.5 m of guide-off
  for (const cr of CRAFTS) {
    const on = await turn(cr, true, 0.98, 0, NONET, 50), off = await turn(cr, false, 0.98, 0, GUIDE, 50);
    assert.ok(off.d > 60 && on.d >= 0.6 * off.d, `${cr}: D held 1.5 s turns ${on.d.toFixed(1)} deg with the residual guide, ${off.d.toFixed(1)} without`);
    assert.ok(on.dy >= off.dy - 6, `${cr}: the nose does not drop (${on.dy.toFixed(1)} m vs ${off.dy.toFixed(1)} m without)`);
    const w = await turn(cr, true, 0, -0.98, NONET, 50); assert.ok(w.maxRoll < 0.5, `${cr}: W alone does not roll the craft (${w.maxRoll.toFixed(2)})`);
  }
});

test('R2-P-02 hand-back: with the safety net on, a hard 1.5 s D still turns >= 0.25 x the guide-off turn at height; on the grid deck the craft does not sink', async () => {
  // measured with the net: 0.33 (sprite) .. 0.50 of the guide-off turn (the net takes the stick once the held line leaves the tube); on the 8 m grid deck the ground term owns the stick (turn ~15 deg, dy -0.1 m)
  for (const cr of CRAFTS) {
    const on = await turn(cr, true, 0.98, 0, GUIDE, 50), off = await turn(cr, false, 0.98, 0, GUIDE, 50);
    assert.ok(on.d >= 0.25 * off.d, `${cr}: net on turns ${on.d.toFixed(1)} deg vs ${off.d.toFixed(1)} without`);
    const deck = await turn(cr, true, 0.98, 0, GUIDE, 0); assert.ok(deck.dy >= -4, `${cr}: no sinking on the deck (${deck.dy.toFixed(1)} m)`);
  }
});

test('R2-P-02 residual: a held key still receives >= 0.15 x of the guide\'s own command (killed by residual 0)', async () => {
  const w = async (key, cfg) => { const r = await rig('redrock', 'falcon'), fs = r.p.flight; const fr = {}; r.course.frameAt(r.p.s, fr);
    fs.pos.addScaledVector(fr.right, 30); fs.pos.y += 40; r.p.prev.pos.copy(fs.pos); r.race.onTeleport(r.p); r.guide.reset();
    const wt = r.guide.blend(r.game, fs, key, 0, r.out, cfg); return { w: wt, roll: r.out.roll }; };
  const idle = await w(0, NONET), held = await w(0.98, NONET);
  assert.ok(idle.w > 0.3, `idle guide weight ${idle.w}`);
  assert.ok(held.w >= 0.15 * idle.w, `held-key weight ${held.w.toFixed(3)} vs idle ${idle.w.toFixed(3)}`);
  const cmd = idle.roll / idle.w; assert.ok(Math.abs(cmd) > 0.05, `the guide has a roll command here (${cmd.toFixed(2)})`);
  assert.ok(Math.abs(held.roll - 0.98) >= 0.15 * Math.abs(cmd - 0.98) - 1e-9, `the output moved towards the guide's command: ${held.roll.toFixed(3)}`);
});

test('R2-P-02 safety net: a held key flying at the ground / a canyon wall is overridden when the line is about to hit (guide-off tumbles; net on tumbles at most 0.4 x as often; net off does not)', async () => {
  // 18 runs per variant (redrock + frost x falcon / bulldog / sprite x nose-down / D / A held 8 s from 50 m up), tumbles summed: off 32, net on 6, net off 24 (measured)
  const sum = async (kg, cfg) => { let t = 0;
    for (const id of ['redrock', 'frost']) for (const cr of ['falcon', 'bulldog', 'sprite']) for (const [roll, pitch] of [[0, -0.9], [0.98, 0], [-0.98, 0]]) {
      const r = await rig(id, cr, { keyGuide: kg }), fs = r.p.flight; let tum = 0; r.game.events.on('racer:tumble', () => tum++);
      fs.pos.y += 50; r.p.prev.pos.copy(fs.pos); r.race.onTeleport(r.p); r.guide.reset();
      for (let i = 0; i < 480; i++) step(r, roll, pitch, cfg); t += tum; }
    return t; };
  const off = await sum(false, GUIDE), on = await sum(true, GUIDE), noNet = await sum(true, NONET);
  assert.ok(off >= 20, `the unguided held keys make contact (${off})`);
  assert.ok(on <= 0.4 * off, `net on: ${on} tumbles vs ${off} without the guide`);
  assert.ok(noNet > 0.4 * off, `net off no longer protects (${noNet} vs ${off}): the safety net is what is under test`);
});

test('R2-E-10 GD3: the hand-over fade is continuous: a half key leaves part of the guide, and the guide weight falls as the key grows (roll and pitch)', async () => {
  for (const axis of ['roll', 'pitch']) {
    const w = [];
    // net off: with it on, the grid-deck ground term saturates the weight at every key value; the residual floor (0.21) now ends the fall
    for (const key of [0, 0.3, 0.5, 0.7, 0.98]) { const r = await rig('redrock', 'falcon'); w.push(step(r, axis === 'roll' ? key : 0, axis === 'pitch' ? key : 0, NONET)); }
    for (let i = 1; i < w.length; i++) assert.ok(w[i] <= w[i - 1], `${axis}: guide weight must fall with the key: ${w.map((x) => x.toFixed(2))}`);
    assert.ok(w[1] > w[2] && w[2] > w[4] - 1e-9 && w[1] < w[0], `${axis}: the fade is gradual: ${w.map((x) => x.toFixed(2))}`);
    assert.ok(w[4] >= 0.15 * w[0], `${axis}: the residual stays on at a full key (${w[4].toFixed(2)})`);
    assert.ok(w[2] > 0.05 && w[2] < 0.6 * w[0], `${axis}: a half key blends (${w[2].toFixed(2)} of ${w[0].toFixed(2)})`);
  }
});

test('R2-E-10 GD1: the guide plans round a hazard on the line', async () => {
  const miss = async (kg) => {
    const r = await rig('redrock', 'falcon', { keyGuide: kg }), fs = r.p.flight, pr = { s: 0, lateral: 0, vertical: 0, dist: 0, branch: -1, u: 0 };
    const pos = fs.pos.clone().addScaledVector(fs.vel.clone().normalize(), 330); r.course.project(pos, r.p.s + 330, pr);   // dead ahead of the craft
    const hz = { s: pr.s, pos, radius: 18, branch: -1, column: false }; r.course.hazards.push(hz);
    let dmin = 1e9; for (let i = 0; i < 60 * 8; i++) { step(r); dmin = Math.min(dmin, r.p.flight.pos.distanceTo(hz.pos)); } return dmin;
  };
  const on = await miss(true), off = await miss(false);
  assert.ok(on > 18 + 8 && on > off + 8, `guided craft clears the hazard by ${on.toFixed(1)} m, unguided ${off.toFixed(1)} m`);
});

test('R2-P-07 G9: a stalled craft gets no guide output', async () => {
  const r = await rig('redrock', 'falcon'); r.p.flight.stall.active = true;
  assert.equal(r.guide.blend(r.game, r.p.flight, 0.2, -0.1, r.out), 0); assert.equal(r.out.roll, 0.2); assert.equal(r.out.pitch, -0.1);
});
