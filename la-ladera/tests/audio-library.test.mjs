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
import { acPitch, bandShare, centroid, peakFreq, stepStats, windowRms } from './audio-lib.mjs';

const KEYS = L.keys(), cache = new Map();
const get = (k) => { let x = cache.get(k); if (!x) cache.set(k, x = L.render(k)); return x; };
const pad = (x, n = 4096) => { if (x.length >= n) return x; const y = new Float32Array(n); y.set(x); return y; };
const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'audio');
const code = (f) => readFileSync(join(AUDIO_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('the key list: unique, complete, and every bed, surface and event has its samples', () => {
  assert.equal(new Set(KEYS).size, KEYS.length, 'unique');
  assert.ok(KEYS.length >= 90 && KEYS.length <= 170, 'count ' + KEYS.length);          // (140 until the beach: its five surfaces are 30 more samples, 4 steps and 2 landings each)
  for (const s of ['sand', 'wetsand', 'shallow', 'wade', 'jetty']) assert.ok(F.SURFACES.includes(s), `the beach's ${s} is a footstep surface`);
  for (const b of BEDS) assert.ok(KEYS.includes('bed:' + b), 'bed ' + b);
  for (const s of F.SURFACES) for (const v of [0, 1, 2, 3]) assert.ok(KEYS.includes(`step:${s}:${v}`) && (v > 1 || KEYS.includes(`land:${s}:${v}`)), `${s} ${v}`);
  for (const k of ['tick', 'chime', 'bell', 'shutter:open', 'shutter:close', 'door:open:0', 'door:close:1', 'rustle:0', 'paper:1', 'dog:0', 'horn:1', 'bird:5:1', 'sheet:1', 'furn:wardrobe:close:1', 'furn:till:open:0', 'find:coins', 'find:oddities']) assert.ok(KEYS.includes(k), k);
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
  assert.ok(total < 6.0e6, `the whole library is ${(total * 4 / 1048576).toFixed(1)} MB as float32: keep it small`);   // (5.5e6 until the beach: its 30 steps and landings are 280 000 of the 5.59 million)
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

test('cloth and paper: short swishes that swell and die away, with no thump in them, a different one each time', () => {
  for (const [k, len, lo, hi, share] of [['rustle', 0.2, 600, 3200, 0.65], ['paper', 0.16, 1800, 7000, 0.7]]) {
    const a = get(`${k}:0`), b = get(`${k}:1`), t = a.length / SR;
    assert.ok(Math.abs(t - len) < 0.01, `${k}: ${t.toFixed(3)} s`);
    assert.ok(bandShare(a, lo, hi) > share, `${k}: its energy sits between ${lo} and ${hi} Hz (${(bandShare(a, lo, hi) * 100).toFixed(0)} %)`);
    assert.ok(bandShare(a, 0, 300) < 0.02, `${k}: nothing below 300 Hz (a swish, not a thump)`);
    const head = windowRms(a, 0, t * 0.1), mid = windowRms(a, t * 0.2, t * 0.8), tail = windowRms(a, t * 0.9, t);
    assert.ok(mid > 3 * head && mid > 3 * tail, `${k}: swells in and dies away (${head.toFixed(3)} .. ${mid.toFixed(3)} .. ${tail.toFixed(3)})`);
    assert.ok(a.some((v, i) => v !== b[i]), `${k}: the two variants are different sounds`);
  }
  assert.ok(centroid(get('paper:0')) > 1.4 * centroid(get('rustle:0')), 'paper is brighter than cloth');
});

// ---- the drawers feature (dev/FEATURE-DRAWERS.md): a sheet out of a drawer, the furniture itself, the ting of a find ------------------------------------------
/** Start (s) of the loudest 25 ms of x: where the bang of a shut lands. */
const loudAt = (x, w = 0.025) => { let best = -1, at = 0; for (let t = 0; t + w <= x.length / SR; t += 0.005) { const v = windowRms(x, t, t + w); if (v > best) { best = v; at = t; } } return at; };
const FURN = F.FURN_KINDS.flatMap((k) => ['open', 'close'].map((d) => [k, d]));

test('the furniture and find sounds are in the library, bad names throw, and every container kind of the interiors maps to a sample', () => {
  for (const [k, d] of FURN) for (const v of [0, 1]) assert.ok(KEYS.includes(`furn:${k}:${d}:${v}`), `furn:${k}:${d}:${v}`);
  for (const c of ['coins', 'watches', 'jewels', 'oddities']) assert.ok(KEYS.includes(`find:${c}`) && F.FIND_SOUNDS.includes(c), c);
  assert.deepEqual([...F.FIND_SOUNDS].sort(), ['coins', 'jewels', 'oddities', 'watches'], 'one sound for each collection shelf');
  assert.ok(KEYS.includes('sheet:0') && KEYS.includes('sheet:1'));
  for (const bad of ['furn:nothing:open:0', 'furn:drawer:sideways:0', 'furn:drawer', 'find:nothing', 'find']) assert.throws(() => L.render(bad), /unknown sound/, bad);
  // interiors/containers.js: kind = the part that moved, group = the furniture
  const want = { 'drawer nightstand': 'drawer', 'drawer dresser': 'drawer', 'drawer desk': 'drawer', 'drawer kitchen': 'drawer', 'drawer counter': 'till', 'drawer locker': 'drawerm', 'drawer toolcab': 'drawerm', 'drawer filing': 'drawerm',
    'drawer medcab': 'drawerm', 'door wardrobe': 'wardrobe', 'door pantry': 'cupboard', 'door kitchen': 'cupboard', 'door wallunit': 'cupboard', 'door tvstand': 'cupboard', 'door vitrine': 'cupboard', 'door nightstand': 'cupboard',
    'door locker': 'locker', 'door medcab': 'locker', 'door toolcab': 'locker', 'lid chest': 'lid', 'lid dresser': 'lid', 'drawer chest': 'lid', 'door chest': 'lid', 'fridge fridge': 'fridge', 'door fridge': 'fridge' };
  for (const [pair, sample] of Object.entries(want)) { const [kind, group] = pair.split(' '); assert.equal(L.furnKind(kind, group), sample, pair); }
  for (const kind of ['drawer', 'door', 'lid', 'fridge']) for (const group of ['nightstand', 'dresser', 'wardrobe', 'chest', 'tvstand', 'wallunit', 'vitrine', 'pantry', 'kitchen', 'fridge', 'desk', 'counter', 'locker', 'medcab', 'toolcab', 'filing', undefined]) {
    const s = L.furnKind(kind, group); assert.ok(F.FURN_KINDS.includes(s), `${kind} ${group} -> ${s}`); assert.ok(KEYS.includes(`furn:${s}:open:0`), s);
  }
});

test('furniture reads on small speakers, two takes differ, an opening differs from a closing, and every close lands its bang as the 0.3 s move ends', () => {
  for (const [k, d] of FURN) {
    const a = get(`furn:${k}:${d}:0`), b = get(`furn:${k}:${d}:1`), t = a.length / SR;
    assert.ok(t >= 0.45 && t <= 1.0, `${k} ${d}: ${t.toFixed(2)} s`);
    assert.ok(bandShare(a, 0, 150) < 0.55, `${k} ${d}: ${(bandShare(a, 0, 150) * 100).toFixed(0)} % of the power is below 150 Hz (a laptop plays none of it)`);
    assert.ok(centroid(a) > 400 && centroid(a) < 4500, `${k} ${d}: centroid ${centroid(a).toFixed(0)}`);
    assert.ok(a.length !== b.length || a.some((v, i) => v !== b[i]), `${k} ${d}: both takes are the same sound`);
    if (d === 'close') {
      const at = loudAt(a); assert.ok(at >= 0.22 && at <= 0.34, `${k} close: the loudest moment is at ${at.toFixed(3)} s, not where the piece shuts (0.26 s)`);
      assert.ok(windowRms(a, 0.24, 0.34) > 3 * windowRms(a, 0, 0.15), `${k} close: the shut (${windowRms(a, 0.24, 0.34).toFixed(3)}) must stand out from the swing before it (${windowRms(a, 0, 0.15).toFixed(3)})`);
    }
  }
  for (const k of F.FURN_KINDS) { const o = get(`furn:${k}:open:0`), c = get(`furn:${k}:close:0`); assert.ok(o.length !== c.length || o.some((v, i) => v !== c[i]), `${k}: open and close are the same sound`); }
});

test('each kind of furniture sounds like itself: wooden or metal runners, a deep hinge or a light latch, a till that rings', () => {
  const o = (k) => get(`furn:${k}:open:0`), c = (k) => get(`furn:${k}:close:0`);
  assert.ok(centroid(o('drawerm')) > 2 * centroid(o('drawer')), `metal runners are brighter than wood: ${centroid(o('drawerm')).toFixed(0)} vs ${centroid(o('drawer')).toFixed(0)}`);
  assert.ok(centroid(c('drawerm')) > 2 * centroid(c('drawer')), 'and so are the shuts');
  assert.ok(windowRms(o('drawer'), 0.24, 0.32) > 1.5 * windowRms(o('drawer'), 0.03, 0.2), 'a drawer pulled out ends with a knock at its stop, louder than the runners');
  assert.ok(windowRms(c('drawer'), 0.24, 0.32) > 3 * windowRms(c('drawer'), 0.03, 0.2), 'and one pushed in with a thump');
  assert.ok(windowRms(o('wardrobe'), 0.25, 0.55) > 5 * windowRms(o('cupboard'), 0.25, 0.55), 'a wardrobe hinge keeps creaking, a cupboard latch lets go and is done');
  assert.ok(windowRms(o('wardrobe'), 0.4, 0.55) > 0.15 * windowRms(o('wardrobe'), 0, 0.04), 'the wardrobe is still creaking half a second in, well after its latch (' + windowRms(o('wardrobe'), 0.4, 0.55).toFixed(3) + ')');
  assert.ok(centroid(o('wardrobe')) < 0.6 * centroid(o('cupboard')), `the wardrobe is the deeper voice: ${centroid(o('wardrobe')).toFixed(0)} vs ${centroid(o('cupboard')).toFixed(0)}`);
  assert.ok(windowRms(o('locker'), 0, 0.04) > 5 * windowRms(o('locker'), 0.1, 0.2), 'a metal door opens with one clack');
  assert.ok(centroid(c('locker')) > 1.8 * centroid(c('cupboard')), 'and shuts with a clang, not a thump');
  assert.ok(windowRms(o('lid'), 0.28, 0.4) > 2 * windowRms(o('lid'), 0.1, 0.25), 'a chest lid creaks up and knocks against its stop');
  assert.ok(centroid(o('lid')) < centroid(o('fridge')) && centroid(o('lid')) < centroid(o('cupboard')), 'a chest is the dullest of all');
  assert.ok(bandShare(o('fridge'), 3000, 11025) > 0.2 && windowRms(o('fridge'), 0, 0.03) > 5 * windowRms(o('fridge'), 0.45, 0.55), 'a fridge door breaks its seal with a pop and a breath of cold air');
  assert.ok(Math.abs(peakFreq(o('till'), 2300, 3000, SR, 4096) - 2637) < 120, 'a shop till rings its small bell (E7) as it opens: ' + peakFreq(o('till'), 2300, 3000, SR, 4096));
  assert.ok(bandShare(o('till'), 2500, 2800) > 5 * bandShare(c('till'), 2500, 2800), 'and shuts without the bell');
  assert.ok(windowRms(o('till'), 0.45, 0.7) > 0.03 && windowRms(c('till'), 0.45, 0.7) < 0.005, `the bell is still ringing after the clack (${windowRms(o('till'), 0.45, 0.7).toFixed(3)}), the shut leaves silence (${windowRms(c('till'), 0.45, 0.7).toFixed(4)})`);
});

test('the sheet of a reader: longer and crinklier than a menu swish, nothing below 300 Hz', () => {
  for (const v of [0, 1]) {
    const x = get(`sheet:${v}`), t = x.length / SR;
    assert.ok(t >= 0.35 && t <= 0.6 && t > 2.5 * get('paper:0').length / SR, `sheet ${v}: ${t.toFixed(2)} s`);
    assert.ok(bandShare(x, 0, 300) < 0.02 && bandShare(x, 1000, 7000) > 0.9, `sheet ${v}: ${(bandShare(x, 0, 300) * 100).toFixed(1)} % below 300 Hz, ${(bandShare(x, 1000, 7000) * 100).toFixed(0)} % between 1 and 7 kHz`);
    const head = windowRms(x, 0, t * 0.1), mid = windowRms(x, t * 0.3, t * 0.7), tail = windowRms(x, t * 0.92, t);
    assert.ok(mid > 3 * head && mid > 3 * tail, `sheet ${v}: swells in and dies away (${head.toFixed(3)} .. ${mid.toFixed(3)} .. ${tail.toFixed(3)})`);
  }
  assert.ok(get('sheet:0').some((v, i) => v !== get('sheet:1')[i]), 'the two takes differ');
  const [s0, s1] = [get('sheet:0'), get('sheet:1')]; let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < Math.min(s0.length, s1.length); i++) { sab += s0[i] * s1[i]; saa += s0[i] * s0[i]; sbb += s1[i] * s1[i]; }
  assert.ok(Math.abs(sab / Math.sqrt(saa * sbb)) < 0.3, `the two takes are two recordings, not one noise under two envelopes (correlation ${(sab / Math.sqrt(saa * sbb)).toFixed(2)})`);
  assert.ok(get('sheet:0').some((v, i) => v !== get('paper:0')[i]) && centroid(get('sheet:0')) > 2000, 'a sheet is not a paper swish');
});

test('the four finds have a voice each: a coin rings at 2.2 kHz, a watch ticks four times and rings a bell, a jewel sparkles high, an oddity bloops low', () => {
  const coins = get('find:coins'), watch = get('find:watches'), jewel = get('find:jewels'), odd = get('find:oddities');
  for (const k of F.FIND_SOUNDS) { const t = get(`find:${k}`).length / SR; assert.ok(t >= 0.9 && t <= 1.8, `${k}: ${t.toFixed(2)} s`); }
  const pf = (x, a, b, lo = 300, hi = 9000, n = 1024) => peakFreq(x.subarray(Math.round(a * SR), Math.round(b * SR)), lo, hi, SR, n);
  assert.ok(Math.abs(peakFreq(coins, 1500, 4000, SR, 8192) - 2150) < 120 && bandShare(coins, 2000, 2800) > 0.7, `a gold coin rings near 2.2 kHz: ${peakFreq(coins, 1500, 4000, SR, 8192).toFixed(0)}`);
  assert.ok(windowRms(coins, 0.5, 0.7) < 0.3 * windowRms(coins, 0, 0.2) && windowRms(coins, 0.5, 0.7) > 0.002, 'and settles');
  // watch: tick (1350 Hz) tock (1000 Hz) tick tock, 0.16 s apart with silence between, then the bell at A6
  for (const [i, f] of [1350, 1000, 1350, 1000].entries()) {
    const t = 0.08 + 0.16 * i;
    assert.ok(windowRms(watch, t, t + 0.02) > 0.03 && windowRms(watch, t + 0.07, t + 0.14) < 0.005, `tick ${i + 1}: loud at ${t.toFixed(2)} s and quiet right after`);
    assert.ok(Math.abs(pf(watch, t, t + 0.045, 700, 1700) - f) < 80, `tick ${i + 1} at ${f} Hz: ${pf(watch, t, t + 0.045, 700, 1700).toFixed(0)}`);
  }
  assert.ok(Math.abs(peakFreq(watch.subarray(Math.round(0.8 * SR)), 1400, 2200, SR, 8192) - 1760) < 50 && windowRms(watch, 0.8, 0.82) > 2 * windowRms(watch, 0.08, 0.1), 'the little alarm bell (A6), louder than the ticks');
  assert.ok(bandShare(jewel, 3000, 11025) > 0.7 && Math.abs(peakFreq(jewel, 2500, 4000, SR, 8192) - 3136) < 40, `a jewel sparkles above 3 kHz (G7): ${(bandShare(jewel, 3000, 11025) * 100).toFixed(0)} %`);
  assert.ok(centroid(odd) < 1500 && bandShare(odd, 0, 1000) > 0.85, `an oddity stays low and round: centroid ${centroid(odd).toFixed(0)}`);
  assert.ok(Math.abs(pf(odd, 0, 0.12, 300, 1200, 2048) - 523) < 25 && Math.abs(pf(odd, 0.14, 0.24, 300, 1200, 2048) - 784) < 40 && Math.abs(pf(odd, 0.27, 0.38, 300, 1200, 2048) - 659) < 40, 'three notes: C5, G5, E5');
  const cents = F.FIND_SOUNDS.map((k) => [k, centroid(get(`find:${k}`))]);
  for (let i = 0; i < cents.length; i++) for (let j = i + 1; j < cents.length; j++) {
    const hi = Math.max(cents[i][1], cents[j][1]), lo = Math.min(cents[i][1], cents[j][1]);
    assert.ok(hi / lo > 1.15, `${cents[i][0]} (${cents[i][1].toFixed(0)} Hz) and ${cents[j][0]} (${cents[j][1].toFixed(0)} Hz) sound too alike`);
  }
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
  // the spectrum above shows the throat (formants at 500 and 1200 Hz); the bark's own pitch is what tells a small dog from a mastiff
  for (const i of [0, 1]) { const p = acPitch(get(`dog:${i}`), 0.01, 0.04, 90, 700); assert.ok(p.f > 250 && p.f < 440 && p.strength > 0.5, `dog ${i}: its voice is ${p.f.toFixed(0)} Hz (strength ${p.strength.toFixed(2)}): a small dog's 300-400, not a big one's 120`); }
  assert.ok(peakFreq(get('horn:0'), 100, 3000, SR, 2048) > 600 && peakFreq(get('horn:0'), 100, 3000, SR, 2048) < 900, 'motorbike pip');
  assert.ok(peakFreq(get('horn:1'), 100, 3000, SR, 2048) > 350 && peakFreq(get('horn:1'), 100, 3000, SR, 2048) < 600, 'car horn');
});
