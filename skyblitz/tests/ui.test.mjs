// UI pure-logic tests: time/ordinal formatting and the persistent save (no DOM needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtTime, ordinal, mod, clamp } from '../src/ui/dom.js';
import { loadSave, writeSave, recordResult, bestFor } from '../src/ui/save.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

test('fmtTime formats m:ss.mmm and placeholders', () => {
  assert.equal(fmtTime(65.4321), '1:05.432');
  assert.equal(fmtTime(0), '0:00.000');
  assert.equal(fmtTime(null), '--:--.---');
  assert.equal(fmtTime(NaN), '--:--.---');
  assert.equal(fmtTime(Infinity), '--:--.---');
});

test('ordinal handles teens and units', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
});

test('mod and clamp', () => {
  assert.equal(mod(-1, 6), 5); assert.equal(mod(7, 6), 1);
  assert.equal(clamp(5, 0, 3), 3); assert.equal(clamp(-5, 0, 3), 0);
});

test('save round trip and corrupt data fallback', () => {
  mem.clear();
  const s = loadSave(); assert.equal(s.hintsSeen, false); assert.equal(s.last.course, 'sunrise');
  s.hintsSeen = true; writeSave(s);
  assert.equal(loadSave().hintsSeen, true);
  for (const k of mem.keys()) mem.set(k, '{not json');
  assert.equal(loadSave().hintsSeen, false, 'corrupt save must fall back to defaults');
});

test('recordResult keeps the best and reports records', () => {
  mem.clear();
  const s = loadSave();
  let r = recordResult(s, 'sunrise', 'falcon', { lap: 60, race: 190 });
  assert.equal(r.newLap, true); assert.equal(r.newRace, true); assert.equal(r.prevLap, null);
  r = recordResult(s, 'sunrise', 'falcon', { lap: 61, race: 195 });
  assert.equal(r.newLap, false); assert.equal(r.newRace, false); assert.equal(r.prevLap, 60);
  r = recordResult(s, 'sunrise', 'falcon', { lap: 58.5, race: 189 });
  assert.equal(r.newLap, true); assert.equal(r.newRace, true);
  recordResult(s, 'sunrise', 'wasp', { lap: 57, race: 200 });
  const b = bestFor(s, 'sunrise');
  assert.equal(b.lap, 57); assert.equal(b.race, 189);
  assert.deepEqual(bestFor(s, 'neon'), { lap: null, race: null });
  assert.equal(loadSave().best['sunrise|falcon'].lap, 58.5, 'persisted');
});
