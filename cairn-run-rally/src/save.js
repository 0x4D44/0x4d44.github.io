import { ASSIST_IDS, SAVE_SCHEMA_VERSION, validateSaveData } from './contracts.js';

export const SAVE_KEY = 'cairn-run:save:v1';
export const LEGACY_BEST_KEY = 'cairn-run:best';

const DEFAULT_BEST_KEY = 'kestrel-ridge:cairn-r4:ridge-weather';
const MAX_TIME_SECONDS = 24 * 60 * 60;
const MAX_SPLITS = 32;
const MAX_BESTS = 128;
const MAX_BINDING_LENGTH = 32;
const MAX_CHAMPIONSHIP_EVENTS = 6;
const MAX_CHAMPIONSHIP_POINTS = 1000;
const MAX_SERVICE_MINUTES = 180;
const MAX_STANDING_ENTRIES = 32;

const BINDING_IDS = Object.freeze([
  'throttle', 'accelerate', 'brake', 'steer', 'steerLeft', 'steerRight', 'left', 'right',
  'handbrake', 'restart', 'pause', 'confirm', 'back', 'menuUp', 'menuDown', 'menuLeft', 'menuRight'
]);
const DAMAGE_IDS = Object.freeze(['engine', 'steering', 'suspension', 'brakes', 'body']);
const TUNING_IDS = Object.freeze(['brakeBias', 'steeringRatio', 'rideHeight', 'damping']);
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

function safeId(value) {
  return typeof value === 'string' && value.length <= 64 && SAFE_ID.test(value) ? value : null;
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

function normaliseUnitObject(value, keys, defaults = {}) {
  const result = {};
  for (const key of keys) {
    const raw = get(value, key);
    result[key] = finite(raw) ? clamp(raw, 0, 1) : (defaults[key] ?? 0);
  }
  return result;
}

function normaliseTuning(value) {
  if (!isObject(value)) return null;
  const result = {};
  for (const key of TUNING_IDS) {
    const raw = get(value, key);
    if (finite(raw)) result[key] = clamp(raw, -1, 1);
  }
  const tyreId = safeId(get(value, 'tyreId'));
  if (tyreId) result.tyreId = tyreId;
  return Object.keys(result).length ? result : null;
}

function normaliseStanding(value) {
  if (!isObject(value)) return null;
  const result = {};
  for (const key of ['carId', 'rivalId', 'driverId']) {
    const id = safeId(get(value, key));
    if (id) result[key] = id;
  }
  for (const key of ['points', 'position', 'wins', 'starts']) {
    const raw = get(value, key);
    if (finite(raw)) result[key] = Math.round(clamp(raw, 0, key === 'points' ? MAX_CHAMPIONSHIP_POINTS : 99));
  }
  return Object.keys(result).length ? result : null;
}

function normaliseStandings(value) {
  if (!Array.isArray(value)) return null;
  const result = [];
  for (const entry of value.slice(0, MAX_STANDING_ENTRIES)) {
    const standing = normaliseStanding(entry);
    if (standing) result.push(standing);
  }
  return result;
}

function normaliseResult(value) {
  if (!isObject(value)) return null;
  const result = {};
  for (const key of ['eventId', 'stageId', 'carId', 'weatherId']) {
    const id = safeId(get(value, key));
    if (id) result[key] = id;
  }
  const best = normaliseBest(value);
  if (best) Object.assign(result, best);
  for (const key of ['penaltySeconds', 'serviceMinutes']) {
    const raw = get(value, key);
    if (finite(raw) && raw >= 0) result[key] = clamp(raw, 0, key === 'serviceMinutes' ? MAX_SERVICE_MINUTES : MAX_TIME_SECONDS);
  }
  for (const key of ['position', 'points']) {
    const raw = get(value, key);
    if (finite(raw)) result[key] = Math.round(clamp(raw, 0, key === 'points' ? MAX_CHAMPIONSHIP_POINTS : 99));
  }
  if (typeof get(value, 'retired') === 'boolean') result.retired = get(value, 'retired');
  const damage = get(value, 'damage');
  if (isObject(damage)) result.damage = normaliseUnitObject(damage, DAMAGE_IDS);
  return Object.keys(result).length ? result : null;
}

function normaliseResults(value) {
  if (!Array.isArray(value)) return null;
  const result = [];
  for (const entry of value.slice(0, MAX_CHAMPIONSHIP_EVENTS)) {
    const item = normaliseResult(entry);
    if (item) result.push(item);
  }
  return result;
}

function normaliseChampionship(value) {
  if (!isObject(value)) return null;
  const result = {};
  const id = safeId(get(value, 'id'));
  if (id) result.id = id;
  for (const key of ['eventIndex', 'currentEvent', 'position']) {
    const raw = get(value, key);
    if (finite(raw)) result[key] = Math.round(clamp(raw, 0, key === 'position' ? 99 : MAX_CHAMPIONSHIP_EVENTS));
  }
  for (const key of ['points']) {
    const raw = get(value, key);
    if (finite(raw)) result[key] = Math.round(clamp(raw, 0, MAX_CHAMPIONSHIP_POINTS));
  }
  const serviceMinutes = get(value, 'serviceMinutes');
  if (finite(serviceMinutes) && serviceMinutes >= 0) result.serviceMinutes = clamp(serviceMinutes, 0, MAX_SERVICE_MINUTES);
  for (const key of ['completed', 'retired', 'finished']) {
    const raw = get(value, key);
    if (typeof raw === 'boolean') result[key] = raw;
  }
  for (const key of ['tyreId', 'stageId', 'carId', 'weatherId']) {
    const item = safeId(get(value, key));
    if (item) result[key] = item;
  }
  const damage = get(value, 'damage');
  if (isObject(damage)) result.damage = normaliseUnitObject(damage, DAMAGE_IDS);
  const tuning = normaliseTuning(get(value, 'tuning'));
  if (tuning) result.tuning = tuning;
  const setup = normaliseTuning(get(value, 'setup'));
  if (setup) result.setup = setup;
  const standings = normaliseStandings(get(value, 'standings'));
  if (standings) result.standings = standings;
  const results = normaliseResults(get(value, 'results'));
  if (results) result.results = results;
  const history = normaliseResults(get(value, 'history'));
  if (history) result.history = history;
  return Object.keys(result).length ? result : null;
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

export function normaliseSave(value) {
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
      championship: normaliseChampionship(get(value, 'championship'))
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

export function loadSave(storage) {
  const current = readStorage(storage, SAVE_KEY);
  if (!current.ok) return createBlankSave();
  if (current.value !== null && current.value !== undefined) {
    const parsed = parseJSON(current.value);
    if (parsed && get(parsed, 'version') > SAVE_SCHEMA_VERSION) return createBlankSave();
    if (parsed && get(parsed, 'version') === SAVE_SCHEMA_VERSION) return normaliseSave(parsed);
  }
  const legacy = readStorage(storage, LEGACY_BEST_KEY);
  if (!legacy.ok) return createBlankSave();
  const migrated = migrateLegacy(legacy.value);
  if (!migrated) return createBlankSave();
  persistSave(storage, migrated);
  return migrated;
}

export function persistSave(storage, save) {
  try {
    if (isObject(save) && finite(get(save, 'version')) && get(save, 'version') > SAVE_SCHEMA_VERSION) return false;
    const normalised = normaliseSave(save);
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
