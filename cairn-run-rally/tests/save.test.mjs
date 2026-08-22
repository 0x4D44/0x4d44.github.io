import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_BEST_KEY,
  SAVE_KEY,
  createBlankSave,
  loadSave,
  normaliseSave,
  persistSave,
  resetSave
} from '../src/save.js';
import { ASSIST_IDS, SAVE_SCHEMA_VERSION, validateSaveData } from '../src/contracts.js';

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const readJson = (storage, key) => JSON.parse(storage.getItem(key));
const validChampionship = {
  contentVersion: 1,
  championshipId: 'world-six',
  carId: 'cairn-r4',
  difficultyId: 'normal',
  seed: 42,
  phase: 'service',
  eventIndex: 0,
  attempt: 0,
  runId: null,
  damage: { engine: 0, steering: 0, suspension: 0, brakes: 0, body: 0 },
  tuning: { brakeBias: 0, steeringRatio: 0, rideHeight: 0, damping: 0, tyreId: 'gravel' },
  results: []
};

test('blank saves are versioned, complete, and independent', () => {
  const first = createBlankSave();
  const second = createBlankSave();

  assert.equal(first.version, SAVE_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(first.profile.assists).sort(), [...ASSIST_IDS].sort());
  assert.deepEqual(first.profile.bindings, {});
  assert.deepEqual(first.profile.gamepadBindings, {});
  assert.deepEqual(first.bests, {});
  assert.equal(first.championship, null);
  assert.deepEqual(validateSaveData(first), []);

  first.profile.assists.automatic = false;
  assert.notEqual(first.profile.assists.automatic, second.profile.assists.automatic);
});

test('a valid save round trips through storage', () => {
  const storage = new MemoryStorage();
  const save = {
    version: 1,
    profile: {
      assists: { automatic: false, stability: 0.25, braking: 1, paceNotes: true, ignored: true },
      bindings: { throttle: 'KeyW', steerLeft: 'KeyA', shiftUp: 'KeyE', shiftDown: 'KeyQ', ignored: 'Nope' },
      gamepadBindings: { accelerate: 8, brake: 10, handbrake: 2, shiftUp: 11, shiftDown: 5, ignored: 99 }
    },
    bests: {
      'kestrel-ridge:cairn-r4:ridge-weather': { timeSeconds: 238.5, splits: [80, 160, 238.5] }
    },
    championship: validChampionship
  };

  assert.equal(persistSave(storage, save), true);
  assert.deepEqual(loadSave(storage), normaliseSave(save));
  assert.deepEqual(readJson(storage, SAVE_KEY), normaliseSave(save));
  assert.deepEqual(loadSave(storage).profile.bindings, { throttle:'KeyW', steerLeft:'KeyA', shiftUp:'KeyE', shiftDown:'KeyQ' });
  assert.deepEqual(loadSave(storage).profile.gamepadBindings, { accelerate:8, brake:10, handbrake:2, shiftUp:11, shiftDown:5 });
});

test('corrupt and future saves recover to blank without overwriting unknown data', () => {
  const corrupt = new MemoryStorage({ [SAVE_KEY]: '{not-json' });
  assert.deepEqual(loadSave(corrupt), createBlankSave());

  const futureRaw = JSON.stringify({ version: SAVE_SCHEMA_VERSION + 1, profile: { future: true } });
  const future = new MemoryStorage({ [SAVE_KEY]: futureRaw });
  assert.deepEqual(loadSave(future), createBlankSave());
  assert.equal(future.getItem(SAVE_KEY), futureRaw);
});

test('legacy best migrates into the namespaced default record', () => {
  const storage = new MemoryStorage({
    [LEGACY_BEST_KEY]: JSON.stringify({ time: 244.2, splits: [82, 164, 244.2] })
  });

  const save = loadSave(storage);
  assert.deepEqual(save.bests['kestrel-ridge:cairn-r4:ridge-mist'], {
    timeSeconds: 244.2,
    splits: [82, 164, 244.2]
  });
  assert.ok(storage.getItem(SAVE_KEY));
  assert.equal(storage.getItem(LEGACY_BEST_KEY), null);
});

test('normalisation drops unknown fields and bounds non-finite or extreme data', () => {
  const save = normaliseSave({
    version: 1,
    profile: {
      assists: {
        automatic: 8,
        stability: -2,
        braking: Number.NaN,
        paceNotes: false,
        exploit: true
      },
      bindings: {
        throttle: 'KeyW',
        steerLeft: 'x'.repeat(200),
        exploit: { value: 'rm -rf' }
      },
      gamepadBindings: { accelerate: 0, brake: 2, handbrake: 2, shiftUp: 12, shiftDown: 'RB' },
      exploit: true
    },
    bests: {
      'kestrel-ridge:cairn-r4:ridge-weather': {
        timeSeconds: 999999999,
        splits: [20, Number.POSITIVE_INFINITY, 10, 999999999]
      },
      'not a safe key': { timeSeconds: 20, splits: [20] },
      broken: { timeSeconds: Number.NaN, splits: [1] }
    },
    championship: { ...validChampionship, eventIndex: 999, damage: { engine: 4, steering: -1, suspension: Number.NaN, brakes: 0.4, body: 0.5 }, exploit: 'discard me' }
  });

  assert.deepEqual(validateSaveData(save), []);
  assert.deepEqual(Object.keys(save.profile.assists).sort(), [...ASSIST_IDS].sort());
  assert.equal(save.profile.assists.automatic, 1);
  assert.equal(save.profile.assists.stability, 0);
  assert.equal(save.profile.assists.braking, createBlankSave().profile.assists.braking);
  assert.equal(save.profile.bindings.steerLeft, undefined);
  assert.equal(save.profile.bindings.exploit, undefined);
  assert.deepEqual(save.profile.gamepadBindings, {});
  assert.equal(save.bests.broken, undefined);
  assert.equal(save.bests['not a safe key'], undefined);
  assert.ok(save.bests['kestrel-ridge:cairn-r4:ridge-weather'].timeSeconds <= 86400);
  assert.deepEqual(save.bests['kestrel-ridge:cairn-r4:ridge-weather'].splits, [20, 86400]);
  assert.equal(save.championship, null);
});

test('the authoritative championship snapshot survives storage exactly', () => {
  const storage = new MemoryStorage();
  const save = createBlankSave();
  save.championship = {
    ...validChampionship,
    phase: 'driving',
    attempt: 3,
    runId: 'run:42:0:3'
  };
  assert.equal(persistSave(storage, save), true);
  assert.deepEqual(loadSave(storage).championship, save.championship);
});

test('an invalid championship is discarded without losing valid profile or bests', () => {
  const save = createBlankSave();
  save.profile.assists.automatic = false;
  save.bests['kestrel-ridge:cairn-r4:ridge-weather'] = { timeSeconds: 240, splits: [80, 160, 240] };
  save.championship = { ...validChampionship, phase: 'driving', runId: null };
  const normalised = normaliseSave(save);
  assert.equal(normalised.championship, null);
  assert.equal(normalised.profile.assists.automatic, false);
  assert.deepEqual(normalised.bests, save.bests);
});

test('throwing and read-only storage never crashes or loses legacy data', () => {
  const throwing = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  assert.doesNotThrow(() => loadSave(throwing));
  assert.equal(persistSave(throwing, createBlankSave()), false);
  assert.equal(resetSave(throwing), false);

  const legacyRaw = JSON.stringify({ time: 250, splits: [100, 250] });
  const readOnly = {
    values: new Map([[LEGACY_BEST_KEY, legacyRaw]]),
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
    setItem() {},
    removeItem() {}
  };
  assert.equal(persistSave(readOnly, createBlankSave()), false);
  assert.equal(readOnly.getItem(LEGACY_BEST_KEY), legacyRaw);
  assert.deepEqual(loadSave(readOnly).bests['kestrel-ridge:cairn-r4:ridge-mist'], {
    timeSeconds: 250,
    splits: [100, 250]
  });
  assert.equal(readOnly.getItem(LEGACY_BEST_KEY), legacyRaw);
});

test('failed writes preserve legacy data, while reset removes both keys', () => {
  const legacyRaw = JSON.stringify({ time: 250, splits: [100, 250] });
  const failing = new MemoryStorage({ [LEGACY_BEST_KEY]: legacyRaw });
  failing.setItem = () => { throw new Error('quota'); };
  assert.equal(persistSave(failing, createBlankSave()), false);
  assert.equal(failing.getItem(LEGACY_BEST_KEY), legacyRaw);

  const storage = new MemoryStorage({ [SAVE_KEY]: JSON.stringify(createBlankSave()), [LEGACY_BEST_KEY]: legacyRaw });
  assert.equal(resetSave(storage), true);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.equal(storage.getItem(LEGACY_BEST_KEY), null);
});
