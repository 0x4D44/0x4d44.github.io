// The DSP kit under the procedural sound library (js/audio/dsp.js, owner: A1): seeded noise, filters, shaping, loops, voices, room responses.
// Everything is checked on plain Float32Arrays by measurement (spectra, levels, continuity): nothing is played, no AudioContext exists.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/audio-dsp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/audio/dsp.js';
import { bandShare, centroid, settledRms, sine, stepStats } from './audio-lib.mjs';

const { SR } = D;
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ---- seeds ----------------------------------------------------------------------------------------------------------------------------------
test('rng: same seed, same stream; other seed, other stream; always in [0, 1)', () => {
  const a = D.rng(42), b = D.rng(42), c = D.rng(43), xs = [], ys = [], zs = [];
  for (let i = 0; i < 200; i++) { xs.push(a()); ys.push(b()); zs.push(c()); }
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  assert.ok(xs.every((v) => v >= 0 && v < 1));
  assert.ok(new Set(xs).size > 190, 'no short cycle');
});

test('rng helpers: range / int inclusive bounds, pick, chance, gauss, fork', () => {
  const r = D.rng(7);
  for (let i = 0; i < 500; i++) {
    const v = r.range(2, 5), k = r.int(3, 6);
    assert.ok(v >= 2 && v < 5, 'range ' + v);
    assert.ok(Number.isInteger(k) && k >= 3 && k <= 6, 'int ' + k);
  }
  const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(r.int(3, 6));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6], 'int reaches both ends');
  assert.ok(['a', 'b', 'c'].includes(r.pick(['a', 'b', 'c'])));
  let hits = 0; for (let i = 0; i < 4000; i++) if (r.chance(0.25)) hits++;
  assert.ok(hits > 850 && hits < 1150, 'chance(0.25) ~ 1000 of 4000, got ' + hits);
  let s = 0, s2 = 0; const N = 20000; for (let i = 0; i < N; i++) { const g = r.gauss(); s += g; s2 += g * g; }
  assert.ok(Math.abs(s / N) < 0.03, 'gauss mean ' + s / N);
  assert.ok(Math.abs(s2 / N - 1) < 0.08, 'gauss variance ' + s2 / N);
  const f1 = D.rng(9).fork('x'), f2 = D.rng(9).fork('x'), f3 = D.rng(9).fork('y');
  assert.equal(f1(), f2(), 'a fork is deterministic');
  assert.notEqual(D.rng(9).fork('x')(), f3(), 'the label matters');
});

test('hashSeed is FNV-1a (32 bit): pinned, because every recipe seed comes from it', () => {
  assert.equal(D.hashSeed(''), 2166136261);
  assert.equal(D.hashSeed('a'), 0xE40C292C);
  assert.equal(D.hashSeed('foobar'), 0xBF9CF968);
  assert.notEqual(D.hashSeed('bed:wind'), D.hashSeed('bed:traffic'));
});

// ---- noise ------------------------------------------------------------------------------------------------------------------------------------
test('noise colours: white is flat, pink leans low, brown is mostly rumble; all zero-mean, bounded and seeded', () => {
  const N = SR * 3, w = D.whiteNoise(N, D.rng(1)), p = D.pinkNoise(N, D.rng(1)), b = D.brownNoise(N, D.rng(1));
  assert.ok(same(w, D.whiteNoise(N, D.rng(1))) && !same(w, D.whiteNoise(N, D.rng(2))), 'seeded');
  for (const [name, x] of [['white', w], ['pink', p], ['brown', b]]) { assert.ok(D.finite(x), name); assert.ok(Math.abs(D.mean(x)) < 0.05, name + ' mean ' + D.mean(x)); assert.ok(D.peak(x) < 2.5, name + ' peak ' + D.peak(x)); }
  assert.ok(D.peak(w) <= 1);
  assert.ok(Math.abs(bandShare(w, 0, 5000) - 5000 / (SR / 2)) < 0.06, 'white: power follows bandwidth');
  assert.ok(bandShare(p, 0, 1000) > 2 * bandShare(w, 0, 1000), 'pink has more low end than white');
  assert.ok(bandShare(b, 0, 500) > 0.85, 'brown: ' + bandShare(b, 0, 500));
});

// ---- filters ----------------------------------------------------------------------------------------------------------------------------------
const gainAt = (filter, f) => settledRms(filter(sine(f))) / settledRms(sine(f));

test('lowpass passes below the cutoff and removes what is above it (-12 dB per octave)', () => {
  const lp = (x) => D.lowpass(x, 1000);
  assert.ok(gainAt(lp, 200) > 0.97, 'passband ' + gainAt(lp, 200));
  assert.ok(gainAt(lp, 1000) > 0.6 && gainAt(lp, 1000) < 0.8, 'cutoff is -3 dB: ' + gainAt(lp, 1000));
  assert.ok(gainAt(lp, 4000) < 0.09, 'two octaves up: ' + gainAt(lp, 4000));
});
test('highpass is the mirror image', () => {
  const hp = (x) => D.highpass(x, 1000);
  assert.ok(gainAt(hp, 5000) > 0.97, 'passband ' + gainAt(hp, 5000));
  assert.ok(gainAt(hp, 1000) > 0.6 && gainAt(hp, 1000) < 0.8);
  assert.ok(gainAt(hp, 250) < 0.09, 'two octaves down: ' + gainAt(hp, 250));
});
test('bandpass peaks at its centre with constant 0 dB gain, and narrower Q is narrower', () => {
  const bp4 = (x) => D.bandpass(x, 1000, 4), bp1 = (x) => D.bandpass(x, 1000, 1);
  assert.ok(Math.abs(gainAt(bp4, 1000) - 1) < 0.04, 'centre ' + gainAt(bp4, 1000));
  assert.ok(gainAt(bp4, 500) < 0.4 && gainAt(bp4, 2000) < 0.4, 'sides');
  assert.ok(gainAt(bp1, 500) > gainAt(bp4, 500) + 0.2, 'Q 1 is wider than Q 4');
});
test('notch removes its centre and peak boosts it by the stated dB; unknown types throw', () => {
  assert.ok(gainAt((x) => D.applyBiquad(x, D.biquad('notch', 1000, 4)), 1000) < 0.02);
  assert.ok(gainAt((x) => D.applyBiquad(x, D.biquad('notch', 1000, 4)), 3000) > 0.95);
  const g = gainAt((x) => D.applyBiquad(x, D.biquad('peak', 1000, 1, 6)), 1000);
  assert.ok(Math.abs(20 * Math.log10(g) - 6) < 0.3, '+6 dB at the centre: ' + 20 * Math.log10(g));
  assert.throws(() => D.biquad('wobble', 100), /biquad type/);
});
test('filters are stable at awkward settings (cutoff near Nyquist, tiny Q, low cutoff)', () => {
  for (const [type, f, q] of [['lp', 11000, 0.7], ['lp', 20, 0.7], ['hp', 10500, 12], ['bp', 50, 0.01], ['bp', 9000, 30]]) {
    const y = D.applyBiquad(D.whiteNoise(SR, D.rng(5)), D.biquad(type, f, q));
    assert.ok(D.finite(y) && D.peak(y) < 100, `${type} ${f} Hz Q ${q}`);
  }
});
test('sweepBandpass follows a moving centre and stays finite', () => {
  const x = D.whiteNoise(SR * 2, D.rng(3)), y = D.sweepBandpass(x, (t) => (t < 1 ? 600 : 3000), 6);
  assert.ok(D.finite(y));
  const first = y.subarray(0, SR - 2000), second = y.subarray(SR + 2000);
  assert.ok(bandShare(first, 450, 800) > 0.6, 'first second near 600 Hz: ' + bandShare(first, 450, 800));
  assert.ok(bandShare(second, 2300, 4000) > 0.6, 'second second near 3 kHz: ' + bandShare(second, 2300, 4000));
});

// ---- shaping ----------------------------------------------------------------------------------------------------------------------------------
test('normalize sets the peak, leaves silence alone; gain / removeDC / softclip behave', () => {
  const x = Float32Array.from([0.1, -0.4, 0.2]);
  assert.ok(Math.abs(D.peak(D.normalize(x, 0.8)) - 0.8) < 1e-6);
  assert.deepEqual([...D.normalize(new Float32Array(4), 0.9)], [0, 0, 0, 0]);
  assert.ok(Math.abs(D.gain(Float32Array.from([1, -2]), 0.5)[1] + 1) < 1e-9);
  const dc = D.removeDC(Float32Array.from([1.2, 1.4, 1.6])); assert.ok(Math.abs(D.mean(dc)) < 1e-6);
  const sc = D.softclip(Float32Array.from([-9, -1, -0.1, 0, 0.1, 1, 9]), 1.5), lim = 1 / Math.tanh(1.5);
  assert.ok(sc[0] >= -lim - 1e-6 && sc[6] <= lim + 1e-6 && sc[6] > 1, 'bounded by 1 / tanh(drive), approached for huge input');
  assert.ok(Math.abs(sc[5] - 1) < 1e-6, 'full scale in, full scale out');
  assert.ok(Math.abs(sc[4] + sc[2]) < 1e-6 && Math.abs(sc[5] + sc[1]) < 1e-6, 'odd symmetric'); assert.ok(sc[4] > 0.1, 'small signals get a little gain');
});
test('normalizeRms: hits the loudness unless the peak cap binds, then respects the cap', () => {
  const x = D.whiteNoise(SR, D.rng(2)); D.normalizeRms(x, 0.07, 0.95);
  assert.ok(Math.abs(D.rms(x) - 0.07) < 1e-4);
  const spiky = new Float32Array(SR); spiky[100] = 1; D.normalizeRms(spiky, 0.07, 0.5);
  assert.ok(D.peak(spiky) <= 0.5 + 1e-6 && D.rms(spiky) < 0.07, 'a spike cannot be made 0.07 RMS under a 0.5 peak');
  assert.deepEqual([...D.normalizeRms(new Float32Array(3), 0.1)], [0, 0, 0]);
});
test('fade: starts and ends at exactly zero, and leaves the middle untouched', () => {
  const x = new Float32Array(SR).fill(1); D.fade(x, 5, 20);
  assert.equal(x[0], 0); assert.equal(x[x.length - 1], 0);
  assert.ok(x[Math.round(0.005 * SR)] > 0.99 && x[SR >> 1] === 1);
  assert.ok(x[1] > 0 && x[1] < x[10], 'a smooth ramp, not a step');
  const tiny = new Float32Array(10).fill(1); D.fade(tiny, 50, 50); assert.ok(D.finite(tiny) && tiny[9] === 0, 'fades longer than the sound are clamped');
});
test('addTo mixes with an offset, clips at both ends and applies the gain', () => {
  const d = new Float32Array(10); D.addTo(d, Float32Array.from([1, 1, 1, 1, 1]), 8, 0.5);
  assert.deepEqual([...d.subarray(7)], [0, 0.5, 0.5]);
  const e = new Float32Array(4); D.addTo(e, Float32Array.from([1, 2, 3, 4, 5]), -2);
  assert.deepEqual([...e], [3, 4, 5, 0]);
});

// ---- loops ------------------------------------------------------------------------------------------------------------------------------------
test('loopify: the wrap is an ordinary step, the cross-fade keeps the level, the result is the stated length', () => {
  const N = SR * 4, f = Math.round(0.5 * SR), tone = Float32Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 313.7 * i / SR));
  const y = D.loopify(tone, 0.5), n = N - f;
  assert.equal(y.length, n);
  assert.equal(y[0], tone[n], 'the loop restarts exactly where the original left off');
  assert.equal(y[n - 1], tone[n - 1]);
  assert.ok(Math.abs(Math.abs(y[0] - y[n - 1]) - Math.abs(tone[n] - tone[n - 1])) < 1e-9, 'seam = one ordinary step');
  const noise = D.whiteNoise(N, D.rng(8)), z = D.loopify(noise, 0.5), r0 = D.rms(noise);
  const mid = D.rms(z.subarray(Math.round(f * 0.45), Math.round(f * 0.55)));
  assert.ok(Math.abs(mid / r0 - 1) < 0.18, 'equal-power cross-fade keeps the level of uncorrelated noise: ' + mid / r0);
  assert.equal(D.loopify(new Float32Array(100), 5).length, 75, 'the fade is capped at a quarter of the sound');
});
test('lfo: smooth, bounded, seeded, and it really moves', () => {
  const x = D.lfo(SR * 20, D.rng(4), 1), y = D.lfo(SR * 20, D.rng(4), 1);
  assert.ok(same(x, y) && !same(x, D.lfo(SR * 20, D.rng(5), 1)));
  assert.ok(D.peak(x) <= 1.0001 && D.finite(x));
  let maxStep = 0; for (let i = 1; i < x.length; i++) maxStep = Math.max(maxStep, Math.abs(x[i] - x[i - 1]));
  assert.ok(maxStep < 2e-4, 'a 1 Hz control signal moves slowly: ' + maxStep);
  assert.ok(D.rms(x) > 0.2, 'it is not stuck near zero: ' + D.rms(x));
});

// ---- voices -----------------------------------------------------------------------------------------------------------------------------------
test('babble: seeded, finite, speech-band, syllabic; breath adds sibilance', () => {
  const o = { sec: 3, voices: 3, f0: [110, 200], seed: 11 }, a = D.babble(o), b = D.babble(o), c = D.babble({ ...o, seed: 12 });
  assert.ok(same(a, b), 'same seed, same bytes'); assert.ok(!same(a, c)); assert.equal(a.length, 3 * SR);
  assert.ok(D.finite(a) && D.rms(a) > 1e-3, 'rms ' + D.rms(a));
  assert.ok(bandShare(a, 150, 3500) > 0.85, 'formant region: ' + bandShare(a, 150, 3500));
  const env = []; for (let i = 0; i + 1102 <= a.length; i += 1102) env.push(D.rms(a.subarray(i, i + 1102)));
  const m = env.reduce((s, v) => s + v, 0) / env.length, sd = Math.sqrt(env.reduce((s, v) => s + (v - m) ** 2, 0) / env.length);
  assert.ok(sd / m > 0.25, 'speech rises and falls in syllables (50 ms blocks vary): ' + sd / m);
  assert.ok(bandShare(D.babble({ ...o, breath: 0.6 }), 2500, 11000) > bandShare(a, 2500, 11000) * 1.5, 'breath puffs add highs');
  const low = D.babble({ ...o, f0: [90, 100], voices: 1 }), high = D.babble({ ...o, f0: [380, 420], voices: 1 });
  assert.ok(centroid(high) > centroid(low), 'a higher voice has a higher centroid');
});

// ---- spaces -----------------------------------------------------------------------------------------------------------------------------------
test('reverbIR: two decorrelated channels, decaying tail, early reflections where asked, finite, at the requested rate', () => {
  const [l, r] = D.reverbIR({ sec: 1, tau: 0.25, early: [[0.05, 1]], seed: 3 }, 44100);
  assert.equal(l.length, 44100); assert.equal(r.length, 44100); assert.ok(D.finite(l) && D.finite(r));
  const head = (x) => D.rms(x.subarray(2000, 10000)), tail = (x) => D.rms(x.subarray(34000, 44100));
  assert.ok(tail(l) < 0.1 * head(l) && tail(r) < 0.1 * head(r), `decay: head ${head(l).toFixed(4)} tail ${tail(l).toFixed(4)}`);
  let dot = 0; for (let i = 0; i < l.length; i++) dot += l[i] * r[i];
  assert.ok(Math.abs(dot / (D.rms(l) * D.rms(r) * l.length)) < 0.25, 'channels differ (a wide space)');
  assert.ok(Math.abs(l[Math.round(0.05 * 44100)]) > 0.8, 'the early reflection is there');
  assert.ok(same(D.reverbIR({ seed: 3 })[0], D.reverbIR({ seed: 3 })[0]) && !same(D.reverbIR({ seed: 3 })[0], D.reverbIR({ seed: 4 })[0]), 'seeded');
  const dark = D.reverbIR({ sec: 1.5, tau: 0.5, dark: 1, seed: 1 })[0], bright = D.reverbIR({ sec: 1.5, tau: 0.5, dark: 0, seed: 1 })[0];
  assert.ok(centroid(dark.subarray(SR >> 1)) < centroid(bright.subarray(SR >> 1)), 'a darker room loses its highs as it decays');
});

test('stepStats helper itself: a pure tone has smooth steps', () => {
  const s = stepStats(sine(100, 1)); assert.ok(s.max < 0.05 && s.seam < 0.06);
});
