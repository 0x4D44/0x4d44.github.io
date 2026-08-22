import { ASSIST_IDS, SAVE_SCHEMA_VERSION, validateSaveData } from './contracts.js';
import { validateChampionshipState } from './championship.js';

export const SAVE_KEY = 'cairn-run:save:v1';
export const LEGACY_BEST_KEY = 'cairn-run:best';

const DEFAULT_BEST_KEY = 'kestrel-ridge:cairn-r4:ridge-mist';
const MAX_TIME_SECONDS = 24 * 60 * 60;
const MAX_SPLITS = 32;
const MAX_BESTS = 128;
const MAX_BINDING_LENGTH = 32;
const MAX_CHAMPIONSHIP_EVENTS = 6;
const MAX_RIVALS = 32;

const BINDING_IDS = Object.freeze([
  'throttle', 'accelerate', 'brake', 'steer', 'steerLeft', 'steerRight', 'left', 'right',
  'handbrake', 'shiftUp', 'shiftDown', 'restart', 'pause', 'confirm', 'back', 'menuUp', 'menuDown', 'menuLeft', 'menuRight'
]);
const DAMAGE_IDS = Object.freeze(['engine', 'steering', 'suspension', 'brakes', 'body']);
const SAFE_BEST_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*){1,5}$/;
const SAFE_BINDING = /^[A-Za-z][A-Za-z0-9_-]*$/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function get(value, key) {
  try {
    return own(value, key) ? value[key] : undefined;
  } catch {
    return undefined;
  }
}

function safeBestKey(value) {
  return typeof value === 'string' && value.length <= 160 && !RESERVED_KEYS.has(value) && SAFE_BEST_KEY.test(value) ? value : null;
}

function safeBinding(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_BINDING_LENGTH && SAFE_BINDING.test(trimmed) ? trimmed : null;
}

function normaliseAssist(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (finite(value)) return clamp(value, 0, 1);
  return fallback;
}

function normaliseAssists(value, defaults) {
  const result = {};
  for (const id of ASSIST_IDS) result[id] = normaliseAssist(get(value, id), defaults[id]);
  return result;
}

function normaliseBindings(value) {
  const result = {};
  if (!isObject(value)) return result;
  for (const id of BINDING_IDS) {
    const binding = safeBinding(get(value, id));
    if (binding !== null) result[id] = binding;
  }
  return result;
}

function normaliseSplits(value, timeSeconds) {
  if (!Array.isArray(value)) return [];
  const result = [];
  let previous = 0;
  for (const raw of value) {
    if (result.length >= MAX_SPLITS || !finite(raw) || raw <= 0) continue;
    const split = clamp(raw, Number.MIN_VALUE, timeSeconds);
    if (split > previous) {
      result.push(split);
      previous = split;
    }
  }
  return result;
}

function normaliseBest(value) {
  if (!isObject(value)) return null;
  const rawTime = get(value, 'timeSeconds');
  if (!finite(rawTime) || rawTime <= 0) return null;
  const timeSeconds = clamp(rawTime, Number.MIN_VALUE, MAX_TIME_SECONDS);
  return { timeSeconds, splits: normaliseSplits(get(value, 'splits'), timeSeconds) };
}

function normaliseBests(value) {
  const result = {};
  if (!isObject(value)) return result;
  for (const key of Object.keys(value).slice(0, MAX_BESTS)) {
    const safeKey = safeBestKey(key);
    if (!safeKey) continue;
    const best = normaliseBest(get(value, key));
    if (best) result[safeKey] = best;
  }
  return result;
}

function exactDamage(value) {
  return Object.fromEntries(DAMAGE_IDS.map(key => [key, get(value, key)]));
}

function exactTuning(value) {
  return {
    brakeBias: get(value, 'brakeBias'),
    steeringRatio: get(value, 'steeringRatio'),
    rideHeight: get(value, 'rideHeight'),
    damping: get(value, 'damping'),
    tyreId: get(value, 'tyreId')
  };
}

function exactRivalResult(value) {
  return {
    id: get(value, 'id'),
    name: get(value, 'name'),
    status: get(value, 'status'),
    timeMs: get(value, 'timeMs'),
    penaltyMs: get(value, 'penaltyMs'),
    reason: get(value, 'reason')
  };
}

function exactResult(value) {
  return {
    eventIndex: get(value, 'eventIndex'),
    eventId: get(value, 'eventId'),
    stageId: get(value, 'stageId'),
    carId: get(value, 'carId'),
    weatherId: get(value, 'weatherId'),
    runId: get(value, 'runId'),
    attempt: get(value, 'attempt'),
    status: get(value, 'status'),
    timeMs: get(value, 'timeMs'),
    splitsMs: Array.isArray(get(value, 'splitsMs')) ? get(value, 'splitsMs').slice(0, MAX_SPLITS) : get(value, 'splitsMs'),
    penaltyMs: get(value, 'penaltyMs'),
    damage: exactDamage(get(value, 'damage')),
    rivalResults: Array.isArray(get(value, 'rivalResults')) ? get(value, 'rivalResults').slice(0, MAX_RIVALS).map(exactRivalResult) : get(value, 'rivalResults'),
    reason: get(value, 'reason')
  };
}

function normaliseChampionship(value, content = null) {
  if (!isObject(value)) return null;
  const results = get(value, 'results');
  const snapshot = {
    contentVersion: get(value, 'contentVersion'),
    championshipId: get(value, 'championshipId'),
    carId: get(value, 'carId'),
    difficultyId: get(value, 'difficultyId'),
    seed: get(value, 'seed'),
    phase: get(value, 'phase'),
    eventIndex: get(value, 'eventIndex'),
    attempt: get(value, 'attempt'),
    runId: get(value, 'runId'),
    damage: exactDamage(get(value, 'damage')),
    tuning: exactTuning(get(value, 'tuning')),
    results: Array.isArray(results) ? results.slice(0, MAX_CHAMPIONSHIP_EVENTS).map(exactResult) : results
  };
  return validateChampionshipState(snapshot, content).length === 0 ? snapshot : null;
}

function blankAssists() {
  return { automatic: true, stability: true, braking: true, paceNotes: true };
}

export function createBlankSave() {
  return {
    version: SAVE_SCHEMA_VERSION,
    profile: { assists: blankAssists(), bindings: {} },
    bests: {},
    championship: null
  };
}

export function normaliseSave(value, content = null) {
  try {
    if (!isObject(value) || get(value, 'version') !== SAVE_SCHEMA_VERSION) return createBlankSave();
    const blank = createBlankSave();
    const profile = get(value, 'profile');
    const save = {
      version: SAVE_SCHEMA_VERSION,
      profile: {
        assists: normaliseAssists(get(profile, 'assists'), blank.profile.assists),
        bindings: normaliseBindings(get(profile, 'bindings'))
      },
      bests: normaliseBests(get(value, 'bests')),
      championship: normaliseChampionship(get(value, 'championship'), content)
    };
    return validateSaveData(save).length === 0 ? save : blank;
  } catch {
    return createBlankSave();
  }
}

function parseJSON(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const value = JSON.parse(raw);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function readStorage(storage, key) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return { ok: false, value: null };
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

function migrateLegacy(raw) {
  const legacy = parseJSON(raw);
  if (!legacy) return null;
  const time = get(legacy, 'time');
  if (!finite(time) || time <= 0) return null;
  return normaliseSave({
    version: SAVE_SCHEMA_VERSION,
    profile: { assists: blankAssists(), bindings: {} },
    bests: { [DEFAULT_BEST_KEY]: { timeSeconds: time, splits: get(legacy, 'splits') } },
    championship: null
  });
}

export function loadSave(storage, content = null) {
  const current = readStorage(storage, SAVE_KEY);
  if (!current.ok) return createBlankSave();
  if (current.value !== null && current.value !== undefined) {
    const parsed = parseJSON(current.value);
    if (parsed && get(parsed, 'version') > SAVE_SCHEMA_VERSION) return createBlankSave();
    if (parsed && get(parsed, 'version') === SAVE_SCHEMA_VERSION) return normaliseSave(parsed, content);
  }
  const legacy = readStorage(storage, LEGACY_BEST_KEY);
  if (!legacy.ok) return createBlankSave();
  const migrated = migrateLegacy(legacy.value);
  if (!migrated) return createBlankSave();
  persistSave(storage, migrated);
  return migrated;
}

export function persistSave(storage, save, content = null) {
  try {
    if (isObject(save) && finite(get(save, 'version')) && get(save, 'version') > SAVE_SCHEMA_VERSION) return false;
    const normalised = normaliseSave(save, content);
    if (validateSaveData(normalised).length) return false;
    const encoded = JSON.stringify(normalised);
    if (!storage || typeof storage.setItem !== 'function' || typeof storage.getItem !== 'function') return false;
    storage.setItem(SAVE_KEY, encoded);
    if (storage.getItem(SAVE_KEY) !== encoded) return false;
    const written = parseJSON(storage.getItem(SAVE_KEY));
    if (!written || get(written, 'version') !== SAVE_SCHEMA_VERSION || validateSaveData(written).length) return false;
    try { if (typeof storage.removeItem === 'function') storage.removeItem(LEGACY_BEST_KEY); } catch { /* legacy remains recoverable */ }
    return true;
  } catch {
    return false;
  }
}

export function resetSave(storage) {
  let success = true;
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(SAVE_KEY);
  } catch {
    success = false;
  }
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(LEGACY_BEST_KEY);
  } catch {
    success = false;
  }
  for (const key of [SAVE_KEY, LEGACY_BEST_KEY]) {
    const current = readStorage(storage, key);
    if (!current.ok || current.value !== null && current.value !== undefined) success = false;
  }
  return success;
}
