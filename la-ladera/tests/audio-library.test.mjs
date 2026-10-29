// The procedural sound library (js/audio/{library,foley,beds}.js, owner: A1): every sample is rendered under Node and judged by measurement, since
// nothing may be played on the test box. Sane levels, no clicks at the ends, loops that close without a seam, byte-identical on a second render, and
// the spectral character each sound is supposed to have (wind is low, crickets are high, a bell is a bell).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/audio-library.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as L from '../js/audio/library.js';
import * as F from '../js/audio/foley.js';
import { BEDS } from '../js/audio/beds.js';
import { SR, peak, rms, mean, finite } from '../js/audio/dsp.js';
import { bandShare, centroid, peakFreq, stepStats, windowRms } from './audio-lib.mjs';

const KEYS = L.keys(), cache = new Map();
const get = (k) => { let x = cache.get(k); if (!x) cache.set(k, x = L.render(k)); return x; };
const pad = (x, n = 4096) => { if (x.length >= n) return x; const y = new Float32Array(n); y.set(x); return y; };
const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'audio');
const code = (f) => readFileSync(join(AUDIO_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('the key list: unique, complete, and every bed, surface and event has its samples', () => {
  assert.equal(new Set(KEYS).size, KEYS.length, 'unique');
  assert.ok(KEYS.length >= 90 && KEYS.length <= 140, 'count ' + KEYS.length);
  for (const b of BEDS) assert.ok(KEYS.includes('bed:' + b), 'bed ' + b);
  for (const s of F.SURFACES) for (const v of [0, 1, 2, 3]) assert.ok(KEYS.includes(`step:${s}:${v}`) && (v > 1 || KEYS.includes(`land:${s}:${v}`)), `${s} ${v}`);
  for (const k of ['tick', 'chime', 'bell', 'shutter:open', 'shutter:close', 'door:open:0', 'door:close:1', 'rustle:0', 'paper:1', 'dog:0', 'horn:1', 'bird:5:1']) assert.ok(KEYS.includes(k), k);
  assert.deepEqual(KEYS.filter(L.isLoop), BEDS.map((b) => 'bed:' + b), 'only the beds loop');
  assert.throws(() => L.render('nothing:here'), /unknown sound/);
  assert.throws(() => L.render('bed:nothing'), /unknown bed/);
});

test('every sample is finite, not silent, not clipping, and has no DC offset', () => {
  let total = 0;
  for (const k of KEYS) {
    const x = get(k); total += x.length;
    assert.ok(x instanceof Float32Array && x.length > 100, `${k}: length ${x.length}`);
    assert.ok(finite(x), `${k}: NaN or Infinity`);
    const p = peak(x); assert.ok(p >= 0.12 && p <= 0.96, `${k}: peak ${p.toFixed(3)} outside 0.12..0.96`);
    assert.ok(Math.abs(mean(x)) < 0.01, `${k}: DC ${mean(x).toFixed(4)}`);
  }
  assert.ok(total < 5.5e6, `the whole library is ${(total * 4 / 1048576).toFixed(1)} MB as float32: keep it small`);
});

test('loudness: the loops sit at one level so a gain of 1 means the same everywhere; one-shots are not whispers', () => {
  for (const b of BEDS) { const r = rms(get('bed:' + b)); assert.ok(r > 0.03 && r < 0.075, `bed ${b}: rms ${r.toFixed(4)}`); }
  for (const k of KEYS.filter((x) => !L.isLoop(x))) { const p = peak(get(k)); assert.ok(p >= 0.25, `${k}: peak ${p.toFixed(2)} is too quiet to be the loudest thing in its own recording`); }
  for (const b of BEDS) { const x = get('bed:' + b); assert.ok(x.length / SR >= 8 && x.length / SR <= 30, `bed ${b}: ${(x.length / SR).toFixed(1)} s`); }
});

test('one-shots begin and end at exactly zero (no click on start or stop)', () => {
  for (const k of KEYS.filter((x) => !L.isLoop(x))) { const x = get(k); assert.ok(Math.abs(x[0]) < 1e-3 && Math.abs(x[x.length - 1]) < 1e-3, `${k}: ${x[0]} .. ${x[x.length - 1]}`); }
});

test('loops close without a seam: the wrap is no bigger a step than the waveform makes anywhere else', () => {
  const noisy = new Set(['sizzle']);                                      // a frying pan is made of pops: the wrap can land on one like any other sample
  for (const b of BEDS) {
    const s = stepStats(get('bed:' + b)), ratio = s.seam / s.p999;
    assert.ok(ratio <= (noisy.has(b) ? 1.5 : 0.5), `bed ${b}: seam ${s.seam.toFixed(4)} is ${ratio.toFixed(2)} x the 99.9th percentile step ${s.p999.toFixed(4)}`);
  }
});

test('deterministic: a second render of every sample is identical (seeded, no Math.random)', () => {
  for (const k of KEYS) { const a = get(k), b = L.render(k); assert.ok(a.length === b.length && a.every((v, i) => v === b[i]), `${k} differs between renders`); }
  assert.ok(!/Math\.random\s*\(/.test(['dsp', 'foley', 'beds', 'library', 'mix', 'engine', 'selftest', 'index', 'worker'].map((f) => code(f + '.js')).join('\n')), 'Math.random in the audio sources');
});

test('the generation modules are pure: no DOM, no WebAudio, so they run in a worker and under Node', () => {
  for (const f of ['dsp', 'foley', 'beds', 'library', 'mix', 'worker']) {
    const m = code(f + '.js').match(/\b(window|document|navigator|AudioContext|OfflineAudioContext|AudioBuffer|localStorage)\b/);
    assert.equal(m, null, `${f}.js touches ${m?.[0]}`);
  }
});

test('beds have the character of what they are', () => {
  const c = (b) => centroid(get('bed:' + b));
  assert.ok(c('wind') < 900, 'wind is low: ' + c('wind'));
  assert.ok(bandShare(get('bed:traffic'), 0, 500) > 0.8, 'traffic is a rumble');
  assert.ok(bandShare(get('bed:crickets'), 3000, 7500) > 0.9, 'crickets are a high chirr');
  assert.ok(bandShare(get('bed:murmur'), 100, 3000) > 0.9 && c('murmur') > 300 && c('murmur') < 900, 'murmur is voices: ' + c('murmur'));
  assert.ok(c('children') > 500 && c('children') < 1400, 'children are higher than adults: ' + c('children'));
  assert.ok(c('children') > c('murmur'), 'and brighter than the neighbours');
  assert.ok(c('court') > 500 && c('court') < 1600, 'court: ' + c('court'));
  assert.ok(c('tv') > 400 && c('tv') < 1100, 'tv: ' + c('tv'));
  assert.ok(bandShare(get('bed:radio'), 250, 3500) > 0.9 && c('radio') > 700 && c('radio') < 1500, 'a small radio has no lows and no highs: ' + c('radio'));
  assert.ok(c('sizzle') > 3500, 'a frying pan hisses: ' + c('sizzle'));
  assert.ok(c('workshop') > 1500 && c('workshop') < 4500, 'metal: ' + c('workshop'));
  assert.ok(c('room') < 450, 'room tone is a hum: ' + c('room'));
  assert.ok(c('crickets') > 3 * c('wind') && c('sizzle') > c('murmur') * 4, 'ordering holds');
});

test('footsteps: every surface reads on small speakers, variants differ, hard surfaces are brighter than soft ones', () => {
  const cent = (s, v = 0) => centroid(pad(get(`step:${s}:${v}`)));
  for (const s of F.SURFACES) {
    for (const v of [0, 1, 2, 3]) {
      const x = pad(get(`step:${s}:${v}`)), sub = bandShare(x, 0, 150);
      assert.ok(sub < (s === 'carpet' ? 0.85 : 0.6), `${s} #${v}: ${(sub * 100).toFixed(0)} % of the power is below 150 Hz (inaudible on a laptop)`);
      assert.ok(centroid(x) > 150 && centroid(x) < 4000, `${s} #${v}: centroid ${centroid(x).toFixed(0)}`);
    }
    const a = get(`step:${s}:0`), b = get(`step:${s}:1`);
    assert.ok(a.length !== b.length || a.some((v, i) => v !== b[i]), `${s}: variants 0 and 1 are the same sound`);
    assert.ok(a.length / SR >= 0.15 && a.length / SR <= 0.4, `${s}: ${a.length / SR} s`);
    assert.ok(get(`land:${s}:0`).length > a.length, `${s}: a landing is longer than a step`);
  }
  const hard = ['concrete', 'tile', 'cobble', 'stairs', 'asphalt'].map((s) => cent(s)), soft = ['dirt', 'carpet', 'wood'].map((s) => cent(s));
  assert.ok(hard.reduce((a, v) => a + v, 0) / hard.length > 2 * (soft.reduce((a, v) => a + v, 0) / soft.length), `hard ${hard.map(Math.round)} vs soft ${soft.map(Math.round)}`);
  assert.ok(peak(get('step:carpet:0')) < peak(get('step:stairs:0')) && peak(get('step:grass:0')) < peak(get('step:tile:0')), 'soft surfaces are quieter');
});

test('doors: the latch clicks as it opens, the thud lands as it closes; shutters rattle for a second', () => {
  const o = get('door:open:0'), c = get('door:close:0');
  assert.ok(windowRms(o, 0, 0.04) > 3 * windowRms(o, 0.4, 0.5), 'open starts with the latch');
  assert.ok(windowRms(c, 0.2, 0.3) > 3 * windowRms(c, 0, 0.1), 'close ends with the thud and the latch');
  assert.ok(o.length / SR >= 0.6 && o.length / SR <= 1, 'door open ' + o.length / SR);
  const so = get('shutter:open'), sc = get('shutter:close');
  assert.ok(so.length / SR >= 1 && so.length / SR <= 1.5 && so.some((v, i) => v !== sc[i]), 'shutters differ between opening and closing');
  assert.ok(windowRms(so, 0, 0.1) > 2.5 * windowRms(so, 0.4, 0.6), 'opening: the catch lets go with a bang, then the slats rattle up');
  assert.ok(windowRms(sc, 0.75, 0.95) > 3 * windowRms(sc, 0, 0.1), 'closing: the slats rattle down and bang on the sill at the end');
});

test('the chapel bell: a G4 strike with a hum an octave down, a long inharmonic ring and a quiet end', () => {
  const b = get('bell');
  assert.ok(Math.abs(peakFreq(b, 300, 500, SR, 32768) - 392) < 4, 'strike note ' + peakFreq(b, 300, 500, SR, 32768));
  assert.ok(Math.abs(peakFreq(b, 150, 250, SR, 32768) - 196) < 4, 'hum');
  assert.ok(b.length / SR >= 6 && b.length / SR <= 8, 'seven seconds');
  assert.ok(windowRms(b, 6, 7) < 0.5 * windowRms(b, 0, 1) && windowRms(b, 6, 7) > 0.001, 'it rings on but is dying away');
  assert.ok(bandShare(b, 440, 480) > 0.02 && bandShare(b, 575, 605) > 0.01, 'minor-third and fifth partials (inharmonic: 1.183 and 1.506 x f0)');
  assert.ok(windowRms(b, 0, 0.02) > 0 && peak(b.subarray(0, 40)) < 0.5, 'a short soft attack, not a click');
});

test('chime, tick, birds, dogs and horns sit where their pitch should', () => {
  const ch = get('chime');
  assert.ok(Math.abs(peakFreq(ch, 600, 720, SR, 32768) - 659.3) < 6 && Math.abs(peakFreq(ch, 940, 1040, SR, 32768) - 987.8) < 8, 'E5 then B5');
  assert.ok(Math.abs(peakFreq(get('tick'), 500, 4000, SR, 1024) - 1250) < 70 && get('tick').length / SR < 0.1, 'a short tick');
  for (let i = 0; i < F.BIRD_COUNT; i++) {
    const f = peakFreq(get(`bird:${i}:0`), 300, 8000, SR, 1024);
    if (i === 4) assert.ok(f > 400 && f < 650, `the dove coos low: ${f}`); else assert.ok(f > 2000 && f < 5500, `bird ${i}: ${f}`);
  }
  assert.ok(get('bird:0:0').some((v, i) => v !== get('bird:0:1')[i]) || get('bird:0:0').length !== get('bird:0:1').length, 'takes differ');
  for (const i of [0, 1]) { const f = peakFreq(get(`dog:${i}`), 100, 3000, SR, 2048); assert.ok(f > 450 && f < 900, `dog ${i}: ${f}`); }
  assert.ok(peakFreq(get('horn:0'), 100, 3000, SR, 2048) > 600 && peakFreq(get('horn:0'), 100, 3000, SR, 2048) < 900, 'motorbike pip');
  assert.ok(peakFreq(get('horn:1'), 100, 3000, SR, 2048) > 350 && peakFreq(get('horn:1'), 100, 3000, SR, 2048) < 600, 'car horn');
});
