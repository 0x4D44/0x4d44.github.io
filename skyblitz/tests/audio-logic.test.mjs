// Pure-logic audio tests (no browser): music layer rules, SFX registry vs the event wiring, graceful no-op under ?mute=1.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/audio-logic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layerTargets } from '../src/audio/music.js';
import { SFX_NAMES } from '../src/audio/sfx.js';
import { AudioEngine } from '../src/audio/audio.js';
import { EventBus } from '../src/events.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '..', 'src', 'audio', 'audio.js'), 'utf8');
const MUSIC_SRC = fs.readFileSync(path.join(HERE, '..', 'src', 'audio', 'music.js'), 'utf8');
const SRC_ROOT = path.join(HERE, '..', 'src');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'audio') walk(p, out); } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('layerTargets: grid is base-only, the hook is loudest for the leader, urgency layers for the pack', () => {
  const pre = layerTargets({ phase: 'pre', place: 4, n: 8 });
  assert.equal(pre.lead, 0); assert.equal(pre.drive, 0); assert.equal(pre.final, 0); assert.ok(pre.base > 0.5);
  const first = layerTargets({ phase: 'race', place: 1, n: 8, boost: 0 }), last = layerTargets({ phase: 'race', place: 8, n: 8, boost: 0 });
  assert.ok(first.lead > last.lead, 'lead louder when leading');
  assert.ok(last.drive > first.drive, 'drive louder when chasing');
  assert.ok(layerTargets({ phase: 'race', place: 1, n: 8, boost: 1 }).drive > first.drive + 0.4, 'boost raises drive');
  assert.equal(layerTargets({ phase: 'race', place: 4, n: 8, finalLap: true }).final, 1);
  assert.equal(layerTargets({ phase: 'race', place: 4, n: 8, finalLap: false }).final, 0);
  assert.ok(layerTargets({ phase: 'race', place: 1, n: 8, tumble: true }).lead < first.lead, 'hook ducks while tumbling');
  for (const p of ['menu', 'results', 'finish']) { const t = layerTargets({ phase: p }); assert.ok(t.base > 0 && t.lead > 0 && t.drive > 0, p); }
  for (const t of [first, last, pre]) for (const v of Object.values(t)) assert.ok(v >= 0 && v <= 1);
});

test('every sound the event wiring plays exists in the SFX registry', () => {
  const used = new Set([...SRC.matchAll(/(?:this\.play|this\.at)\('([A-Za-z]+)'/g)].map((m) => m[1]));
  for (const line of SRC.split('\n')) if (/this\.(play|at)\(/.test(line)) for (const m of line.matchAll(/\? '([A-Za-z]+)' : '([A-Za-z]+)'/g)) { used.add(m[1]); used.add(m[2]); }
  assert.ok(used.size > 30, `found only ${used.size} play sites`);
  const missing = [...used].filter((n) => !SFX_NAMES.includes(n));
  assert.deepEqual(missing, []);
});

test('the engine listens to the whole event catalogue it should', () => {
  const need = ['ui:click', 'ui:hover', 'ui:back', 'ui:confirm', 'ui:error', 'race:ready', 'race:end', 'race:countdown', 'race:go', 'race:rocketStart', 'race:lap', 'race:finalLap', 'race:finish', 'race:overtake', 'race:wrongway',
    'race:respawn', 'gate:pass', 'shortcut:enter', 'pickup:orb', 'missile:launch', 'missile:lock', 'missile:warn', 'missile:evaded', 'missile:hit', 'mine:drop', 'mine:hit', 'emp:fire', 'lightning:strike', 'smoke:deploy',
    'drone:launch', 'shield:up', 'shield:block', 'shield:down', 'cannon:fire', 'cannon:hit', 'racer:hit', 'racer:tumble', 'racer:recover', 'racer:boost', 'racer:stunt', 'racer:graze', 'racer:draft', 'racer:stall',
    'settings:change', 'game:pause', 'game:resume'];
  const missing = need.filter((e) => !SRC.includes(`'${e}'`));
  assert.deepEqual(missing, []);
});

test('?mute=1: no AudioContext is ever created and every call is a safe no-op', () => {
  const game = { params: new URLSearchParams('mute=1'), events: new EventBus(), settings: {}, state: 'race' };
  const a = new AudioEngine(game);
  assert.equal(a.muted, true);
  a.init(); a.resume(); a.attachRacer({}); a.detachRacer({}); a.setVolumes?.call;
  assert.equal(a.play('uiClick'), false);
  a.update(0.016, game);
  assert.equal(a.ctx, null);
  game.events.emit('ui:click', {}); game.events.emit('race:go', {});
  assert.equal(a.stats().state, 'muted');
  const on = new AudioEngine({ params: new URLSearchParams('mute=0'), events: new EventBus(), settings: {} });
  assert.equal(on.muted, false);
  assert.equal(new AudioEngine({ params: new URLSearchParams(''), events: new EventBus(), settings: {} }).muted, false);
});

// Events the game emits that deliberately make no sound (each with the reason). Anything else the game emits MUST have a handler
// in audio.js / music.js: a new gameplay event without a sound (or a removed handler, mutation A1) fails here.
const NO_SOUND = {
  'game:loading': 'loading screen: UI only', 'game:error': 'error toast: UI plays ui:error itself', 'game:resize': 'layout only', 'game:loadProgress': 'loading bar only',
  'race:missed': 'ticker text only', 'sector:pass': 'internal progress marker', 'race:position': 'HUD number only (overtake has the sound)', 'shortcut:exit': 'entering is the cue',
  'game:autoquality': 'quality governor notice: UI only', 'game:contextlost': 'GL context loss: the overlay explains it, audio keeps running', 'game:contextrestored': 'GL context back: UI only',
  'smoke:blind': 'a rival lost its lock in smoke: the smoke:deploy cue already played, HUD text only',
  'drone:expire': 'drone has no end cue', 'input:pause': 'the pause UI plays its own ui:* sound', 'game:state': 'handled indirectly (resets + music routing)',
};

test('every gameplay event the game emits has an audio handler or a documented "no sound" reason', () => {
  const emitted = new Set();
  for (const f of walk(SRC_ROOT)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bemit\('([a-zA-Z]+:[a-zA-Z]+)'/g)) emitted.add(m[1]);
  assert.ok(emitted.size > 40, `scan found only ${emitted.size} emitted events`);
  const handled = new Set([...SRC.matchAll(/\bon\('([a-zA-Z]+:[a-zA-Z]+)'/g), ...MUSIC_SRC.matchAll(/\bon\('([a-zA-Z]+:[a-zA-Z]+)'/g)].map((m) => m[1]));
  const missing = [...emitted].filter((e) => !handled.has(e) && !(e in NO_SOUND)).sort();
  assert.deepEqual(missing, [], 'emitted events with neither an audio handler nor a NO_SOUND entry');
  const stale = Object.keys(NO_SOUND).filter((e) => !emitted.has(e));
  assert.deepEqual(stale, [], 'NO_SOUND entries that nothing emits any more');
  const both = Object.keys(NO_SOUND).filter((e) => handled.has(e) && e !== 'game:state');
  assert.deepEqual(both, [], 'NO_SOUND events that do have a handler: remove from the list');
});

test('new feedback cues exist: storm cast, distant thunder, being-locked, roll-now, camera tick', () => {
  for (const n of ['stormCast', 'thunderFar', 'beingLocked', 'rollNow', 'camTick']) assert.ok(SFX_NAMES.includes(n), n);
  for (const e of ['input:camera', 'input:lookback']) assert.ok(SRC.includes(`'${e}'`), e);
  assert.match(SRC, /type === 'storm' && me\(racer\)/);
  assert.match(SRC, /me\(owner\)\) this\.play\('thunderFar'/);
  assert.match(SRC, /w\.evade/);
});
