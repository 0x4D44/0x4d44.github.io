// Footsteps (js/audio/foley.js footstep and landing, FOOT_GAIN in js/audio/engine.js), judged by measurement: nothing may be played on the test box.
// R2c, Arthur: "my footsteps sound like someone hitting a tin, they are very loud". What the old recipe measured: every step peak-normalised to 0.30-0.72 and played at 0.5; on tile a
// 3 kHz ring standing 15-20 dB over its own spectrum; on six surfaces 7-33 % of the power above 4 kHz (centroids up to 3.3 kHz); 0.3-4.6 % of a step's energy in its first millisecond;
// no second contact, only a fading tail. Each limit below sits between those old figures (kept here, since the old recipe is gone) and the new ones, and names the thing it guards.
// What this cannot say is whether a step sounds like a step: that is Arthur's ear, on real speakers.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/audio-steps.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/audio/foley.js';
import * as E from '../js/audio/engine.js';
import { SR, rms, rng, whiteNoise, lowpass } from '../js/audio/dsp.js';
import { bandShare, centroid, heelToe, narrowPeak } from './audio-lib.mjs';

const STEPS = [0, 1, 2, 3], LANDS = [0, 1], HARD = ['asphalt', 'concrete', 'cobble', 'stairs', 'tile', 'wood'];
const db = (v) => 20 * Math.log10(v), mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const step = (s, v) => F.footstep(s, v), land = (s, v) => F.landing(s, v);
const samples = () => F.SURFACES.flatMap((s) => [...STEPS.map((v) => [`${s} step #${v}`, step(s, v)]), ...LANDS.map((v) => [`${s} landing #${v}`, land(s, v)])]);

// The engine plays a sample at FOOT_GAIN times a stance factor. Before R2c it kept them inline (0.5, and 1 / 1.25 / 0.5): the fallbacks keep this file readable against that engine.
const FOOT_GAIN = E.FOOT_GAIN ?? 0.5, STANCE = E.FOOT_STANCE ?? { walk: 1, sprint: 1.25, crouch: 0.5 }, OLD_GAIN = 0.5;
// RMS of the old samples, dBFS over the whole sample: the mean RMS of step variants 0-3 and of landing variants 0-1 ([step, landing]), foley.js as of 3bd7918 (STEP peak levels
// 0.30-0.72), measured by rendering them. The engine then played them at 0.5.
const OLD = {
  asphalt: [-22.04, -21.23], concrete: [-21.98, -21.70], cobble: [-20.88, -20.53], dirt: [-21.78, -20.64], grass: [-23.37, -22.65],
  stairs: [-22.98, -21.17], tile: [-24.16, -23.93], wood: [-20.03, -19.47], carpet: [-25.29, -24.10],
};

test('the engine exports its footstep gain and plays a step and a landing at it (walk, sprint, crouch; the speed and the hardness scale it)', () => {
  assert.equal(typeof E.FOOT_GAIN, 'number', 'FOOT_GAIN is exported, so this file cannot drift from the engine');
  const calls = [], eng = Object.assign(Object.create(E.AudioEngine.prototype), { stats: { steps: 0, lands: 0 }, stepN: 0, rnd: () => 0.5, play: (key, o) => calls.push([key, o]) });
  eng.onStep({ surface: 'concrete', speed: 2.8 }); eng.onStep({ surface: 'concrete', speed: 2.8, sprint: true }); eng.onStep({ surface: 'concrete', speed: 2.8, crouch: true });
  eng.onStep({ surface: 'concrete', speed: 1.0 }); eng.onLand({ surface: 'concrete', speed: 7 }); eng.onLand({ surface: 'concrete', speed: 1 });
  const g = calls.map(([, o]) => o.gain), near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
  near(g[0], FOOT_GAIN * STANCE.walk, 'a walking step at 2.8 m/s'); near(g[1], FOOT_GAIN * STANCE.sprint, 'a sprinting step'); near(g[2], FOOT_GAIN * STANCE.crouch, 'a crouching step');
  near(g[3], FOOT_GAIN * STANCE.walk * 0.7, 'a slow step is a little quieter, never silent'); near(g[4], FOOT_GAIN * 1.1, 'a landing at 7 m/s'); assert.ok(g[5] < g[4] && g[5] > 0, 'a soft landing is quieter than a hard one');
  assert.ok(calls[0][0].startsWith('step:concrete:') && calls[4][0].startsWith('land:concrete:'), 'the right samples: ' + calls.map((c) => c[0]));
});

test('a walking step is 8 to 14 dB quieter than the one that was too loud: every surface, RMS of the whole sample times the engine gain', () => {
  for (const s of F.SURFACES) {
    const now = db(mean(STEPS.map((v) => rms(step(s, v)))) * FOOT_GAIN * STANCE.walk), was = OLD[s][0] + db(OLD_GAIN), drop = was - now;
    assert.ok(drop >= 8 && drop <= 14, `${s}: ${drop.toFixed(1)} dB under the old step (${now.toFixed(1)} dBFS now, ${was.toFixed(1)} then); 8 to 14 is the aim, not silence`);
  }
});

test('landings came down with the steps: 7 to 14 dB under the old ones, so a landing is still heavier than a step', () => {
  for (const s of F.SURFACES) {
    const now = db(mean(LANDS.map((v) => rms(land(s, v)))) * FOOT_GAIN), drop = OLD[s][1] + db(OLD_GAIN) - now;
    assert.ok(drop >= 7 && drop <= 14, `${s}: a landing is ${drop.toFixed(1)} dB under the old one`);
    assert.ok(mean(LANDS.map((v) => rms(land(s, v)))) > mean(STEPS.map((v) => rms(step(s, v)))) * 0.9, `${s}: a landing is not lighter than a step`);
  }
});

test('stance: a sprint is a little louder than a walk, a crouch is much softer', () => {
  assert.ok(STANCE.sprint / STANCE.walk >= 1.1 && STANCE.sprint / STANCE.walk <= 1.6, `sprint is x${(STANCE.sprint / STANCE.walk).toFixed(2)} a walk`);
  assert.ok(STANCE.crouch / STANCE.walk <= 0.45, `a crouch is x${(STANCE.crouch / STANCE.walk).toFixed(2)} a walk: it should be under 0.45`);
});

test('nothing rings: no narrow line above 1.5 kHz stands more than 12 dB over the spectrum around it (steps and landings, every variant)', () => {
  for (const [what, x] of samples()) { const n = narrowPeak(x); assert.ok(n.db <= 12, `${what}: a line at ${Math.round(n.at)} Hz stands ${n.db.toFixed(1)} dB over its neighbours (noise alone reaches 5-10, a tin 15 and more)`); }
});

test('the ring detector hears a ring (a control, whatever the recipe): a 3.1 kHz tile ring of 30 ms laid over a decaying scuff of noise is far over the limit, the scuff alone is not', () => {
  const r = rng(7), noise = lowpass(whiteNoise(Math.round(0.3 * SR), r), 3000), scuff = Float32Array.from(noise, (v, i) => v * Math.exp(-i / SR / 0.04));
  const peak = Math.max(...scuff.map(Math.abs)), tin = Float32Array.from(scuff, (v, i) => v + 0.6 * peak * Math.sin(2 * Math.PI * 3100 * i / SR) * Math.exp(-i / SR / 0.03));
  assert.ok(narrowPeak(scuff).db < 10, 'the scuff alone: ' + narrowPeak(scuff).db.toFixed(1));
  const n = narrowPeak(tin); assert.ok(n.db > 15 && Math.abs(n.at - 3100) < 100, `the ring: ${n.db.toFixed(1)} dB at ${Math.round(n.at)} Hz`);
});

test('nothing bright: under 3 % of the power above 4 kHz and a centroid under 2 kHz, every step and landing (they were 7-33 % and up to 3.3 kHz)', () => {
  for (const [what, x] of samples()) {
    const hi = bandShare(x, 4000, SR / 2), c = centroid(x);
    assert.ok(hi < 0.03, `${what}: ${(hi * 100).toFixed(1)} % of the power is above 4 kHz`);
    assert.ok(c < 2000, `${what}: centroid ${Math.round(c)} Hz`);
  }
});

test('the scuff swells instead of snapping: under 0.1 % of a step or a landing is in its first millisecond (a click puts whole percents there)', () => {
  const share = (x, ms) => { const n = Math.round(ms / 1000 * SR); let a = 0, t = 0; for (let i = 0; i < x.length; i++) { t += x[i] * x[i]; if (i < n) a += x[i] * x[i]; } return 100 * a / t; };
  for (const [what, x] of samples()) assert.ok(share(x, 1) < 0.1, `${what}: ${share(x, 1).toFixed(2)} % of its energy is in the first millisecond`);
});

test('a step is a heel and a toe: a second, softer lobe 55 to 100 ms after the first, standing clear of the valley between them (the hard surfaces, every variant)', () => {
  for (const s of HARD) for (const v of STEPS) {
    const h = heelToe(step(s, v));
    assert.ok(h.gapMs >= 55 && h.gapMs <= 100, `${s} #${v}: the second lobe is ${h.gapMs.toFixed(0)} ms after the first`);
    assert.ok(h.toeDb <= -1 && h.toeDb >= -12, `${s} #${v}: the toe is ${h.toeDb.toFixed(1)} dB re the heel (softer, but there)`);
    assert.ok(h.bump >= 2, `${s} #${v}: the toe stands ${h.bump.toFixed(1)}x over the valley before it (1 is a heel that just fades away)`);
  }
});

test('the variants are different sounds, not one sample and its echo: no two steps (or landings) of a surface correlate by more than 0.75 (a copy is 1; carpet, a low rumble, reaches 0.6)', () => {
  const corr = (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb); };
  for (const s of F.SURFACES) for (const [fn, vs] of [[step, STEPS], [land, LANDS]]) for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
    const c = Math.abs(corr(fn(s, vs[i]), fn(s, vs[j]))); assert.ok(c < 0.75, `${s} ${fn === step ? 'step' : 'landing'} #${vs[i]} and #${vs[j]} correlate by ${c.toFixed(2)}`);
  }
});
