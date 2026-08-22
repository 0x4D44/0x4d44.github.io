import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/content.js';
import { RallySession } from '../src/session.js';
import { createBlankSave, normaliseSave } from '../src/save.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('schema v1 safely migrates missing gamepad bindings and preserves valid maps', () => {
  const blank = createBlankSave();
  assert.deepEqual(blank.profile.gamepadBindings, {});
  const migrated = normaliseSave({ ...blank, profile: { ...blank.profile, gamepadBindings: undefined } });
  assert.deepEqual(migrated.profile.gamepadBindings, {});
  const custom = normaliseSave({ ...blank, profile: { ...blank.profile, gamepadBindings: { accelerate: 8, brake: 10, handbrake: 2, shiftUp: 11, shiftDown: 5 } } });
  assert.deepEqual(custom.profile.gamepadBindings, { accelerate: 8, brake: 10, handbrake: 2, shiftUp: 11, shiftDown: 5 });
});

test('session profile updates persist keyboard and gamepad maps independently', () => {
  const storage = new MemoryStorage();
  const session = new RallySession(CATALOG, storage);
  session.updateProfile({
    bindings: { accelerate: 'KeyW' },
    gamepadBindings: { accelerate: 8, brake: 10, handbrake: 2, shiftUp: 11, shiftDown: 5 }
  });
  const resumed = new RallySession(CATALOG, storage);
  assert.equal(resumed.save.profile.bindings.accelerate, 'KeyW');
  assert.equal(resumed.save.profile.gamepadBindings.accelerate, 8);
  assert.equal(resumed.save.profile.gamepadBindings.brake, 10);
});
