import { CONTENT_SCHEMA_VERSION, validateChampionshipSpec } from './contracts.js';
import { clamp, hash01 } from './math.js';

// This module deliberately knows nothing about the browser or StageRun.  The game
// boundary turns StageRun's split objects into numbers before calling submitResult.

export const PHASES = Object.freeze(['service', 'ready', 'driving', 'classified', 'abandoned']);
export const DAMAGE_COMPONENTS = Object.freeze(['engine', 'steering', 'suspension', 'brakes', 'body']);
export const REPAIR_MINUTES = Object.freeze({ engine: 40, suspension: 25, steering: 20, brakes: 15, body: 10 });
export const DEFAULT_POINTS = Object.freeze([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);

const COMPONENT_SET = new Set(DAMAGE_COMPONENTS);
const TUNING_KEYS = Object.freeze(['brakeBias', 'steeringRatio', 'rideHeight', 'damping']);
const DEFAULT_TUNING = Object.freeze({ brakeBias: 0, steeringRatio: 0, rideHeight: 0, damping: 0, tyreId: 'standard' });
const DEFAULT_WEATHER = Object.freeze({ gripScale: 1, visibilityM: 10000, precipitation: 'none', roadWetness: 0, wind: 0, timeOfDay: 'day' });
const DEFAULT_DIFFICULTY = Object.freeze({ id: 'normal', rivalPace: 1 });

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => Number.isFinite(value);
const unit = value => finite(value) && value >= 0 && value <= 1;
const idLike = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sortedKeys(value) {
  return isObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  return sortedKeys(value).join('|') === [...keys].sort().join('|');
}

function copyDamage(value = {}) {
  const damage = {};
  for (const key of DAMAGE_COMPONENTS) damage[key] = Number(value?.[key] ?? 0);
  return damage;
}

function copyTuning(value = {}) {
  return {
    brakeBias: Number(value.brakeBias ?? 0),
    steeringRatio: Number(value.steeringRatio ?? 0),
    rideHeight: Number(value.rideHeight ?? 0),
    damping: Number(value.damping ?? 0),
    tyreId: value.tyreId ?? 'standard'
  };
}

function error(code, message, details = {}) {
  const failure = new Error(message || code);
  failure.name = 'ChampionshipError';
  failure.code = code;
  Object.assign(failure, details);
  return failure;
}

export class ChampionshipError extends Error {
  constructor(code, message, details = {}) {
    super(message || code);
    this.name = 'ChampionshipError';
    this.code = code;
    Object.assign(this, details);
  }
}

function fail(code, message, details) {
  throw new ChampionshipError(code, message, details);
}

function ensureFiniteInt32(seed) {
  if (!Number.isInteger(seed) || seed < -2147483648 || seed > 2147483647) fail('invalid-seed', 'seed must be a signed 32-bit integer');
  return seed;
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function mixSeed(...parts) {
  let seed = 0x6d2b79f5;
  for (const part of parts) {
    const value = typeof part === 'number' ? part | 0 : hashString(part);
    seed = Math.imul(seed ^ value, 0x45d9f3b);
    seed ^= seed >>> 16;
  }
  return seed | 0;
}

function random01(seed, ...parts) {
  return hash01(mixSeed(seed, ...parts));
}

function asArray(value, key) {
  if (Array.isArray(value)) return value;
  if (isObject(value)) return Object.values(value);
  return key && Array.isArray(value?.[key]) ? value[key] : [];
}

function asCatalog(value) {
  if (!isObject(value)) return null;
  const nested = isObject(value.content) ? value.content : isObject(value.catalog) ? value.catalog : null;
  if (nested) {
    const extras = {};
    for (const key of ['championship', 'championships', 'events', 'rivals', 'difficulties']) if (value[key] !== undefined) extras[key] = value[key];
    return Object.keys(extras).length ? { ...nested, ...extras } : nested;
  }
  return value;
}

function pickById(collection, id) {
  if (Array.isArray(collection)) return collection.find(entry => entry?.id === id) || null;
  if (isObject(collection)) return collection[id] || null;
  return null;
}

function catalogList(catalog, key) {
  if (!catalog) return [];
  return asArray(catalog[key]);
}

function championshipFromCatalog(catalog, id) {
  if (!catalog) return null;
  const values = catalogList(catalog, 'championships');
  if (values.length) return pickById(values, id);
  if (catalog.championship?.id === id) return catalog.championship;
  if (Array.isArray(catalog.events)) return { id, name: id, points: catalog.points || DEFAULT_POINTS, events: catalog.events };
  return null;
}

function eventFrom(catalog, championship, index, state = null) {
  const events = championship?.events || catalogList(catalog, 'events');
  return events?.[index] || null;
}

function stageFrom(catalog, event) {
  if (!event) return null;
  if (isObject(event.stage) && event.stage.id) return event.stage;
  return pickById(catalogList(catalog, 'stages'), event.stageId) || null;
}

function weatherFrom(catalog, event) {
  if (!event) return null;
  if (isObject(event.weather) && event.weather.id) return event.weather;
  return pickById(catalogList(catalog, 'weather'), event.weatherId) || null;
}

function carFrom(catalog, state, explicitCar = null) {
  if (explicitCar?.id) return explicitCar;
  return pickById(catalogList(catalog, 'cars'), state?.carId) || null;
}

function difficultyFrom(catalog, state, explicitDifficulty = null) {
  if (isObject(explicitDifficulty)) return explicitDifficulty;
  if (typeof explicitDifficulty === 'string') return pickById(catalogList(catalog, 'difficulties'), explicitDifficulty) || { ...DEFAULT_DIFFICULTY, id: explicitDifficulty };
  return pickById(catalogList(catalog, 'difficulties'), state?.difficultyId) || { ...DEFAULT_DIFFICULTY, id: state?.difficultyId || 'normal' };
}

function normalizeInput(args) {
  const values = [...args];
  const first = values.shift();
  const options = isObject(first) ? first : {};
  const baseContent = asCatalog(options.content || options.catalog || values.at(-1));
  const content = baseContent && options.championship && !championshipFromCatalog(baseContent, options.championship.id)
    ? { ...baseContent, championship: options.championship }
    : baseContent;
  const directSpec = isObject(first) && Array.isArray(first.events) ? first : null;
  const spec = directSpec || options.championship || options.spec || championshipFromCatalog(content, options.championshipId);
  const car = options.car || (isObject(values[0]) && !Array.isArray(values[0]) && values[0].id ? values[0] : null);
  const difficulty = options.difficulty || (isObject(values[1]) && values[1].id ? values[1] : null);
  const seed = options.seed ?? (Number.isInteger(values[2]) ? values[2] : 0);
  return {
    options,
    content,
    spec,
    car,
    difficulty,
    seed,
    championshipId: options.championshipId || spec?.id,
    carId: options.carId || car?.id,
    difficultyId: options.difficultyId || difficulty?.id || 'normal'
  };
}

function durationBand(event, stage) {
  const candidate = event?.durationSeconds || event?.durationBandSeconds || event?.durationBand || stage?.expectedDurationSeconds;
  if (!Array.isArray(candidate) || candidate.length !== 2 || !candidate.every(finite) || candidate.some(value => value <= 0)) return null;
  const first = Math.min(candidate[0], candidate[1]);
  const second = Math.max(candidate[0], candidate[1]);
  return [first, second];
}

function splitCount(stage, event, fallback = null) {
  if (Array.isArray(stage?.splits)) return stage.splits.length;
  if (Number.isInteger(event?.splitCount) && event.splitCount > 0) return event.splitCount;
  if (Number.isInteger(fallback) && fallback > 0) return fallback;
  return null;
}

function surfaceMix(stage, event) {
  if (isObject(event?.surfaceMix)) {
    const entries = Object.entries(event.surfaceMix).filter(([, value]) => finite(value) && value >= 0);
    const total = entries.reduce((sum, [, value]) => sum + value, 0);
    if (total > 0) return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
  }
  const counts = {};
  for (const segment of stage?.segments || []) {
    const weight = finite(segment.lengthM) && segment.lengthM > 0 ? segment.lengthM : 1;
    counts[segment.surface || 'unknown'] = (counts[segment.surface || 'unknown'] || 0) + weight;
  }
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return total ? Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / total])) : {};
}

function rivalList(catalog, championship, event) {
  const global = catalogList(catalog, 'rivals');
  const ids = event?.rivalIds || championship?.rivalIds;
  if (Array.isArray(event?.rivals)) return event.rivals;
  if (Array.isArray(ids)) return ids.map(id => pickById(global, id)).filter(Boolean);
  if (Array.isArray(championship?.rivals)) return championship.rivals;
  return global;
}

function normalizeRival(rival, index) {
  const source = isObject(rival) ? rival : {};
  return {
    id: source.id || `rival-${index + 1}`,
    name: source.name || source.id || `Rival ${index + 1}`,
    seed: Number.isInteger(source.seed) ? source.seed : index + 1,
    skill: clamp(Number(source.skill ?? 0.5), 0, 1),
    consistency: clamp(Number(source.consistency ?? 0.7), 0, 1),
    damageRisk: clamp(Number(source.damageRisk ?? 0), 0, 1),
    surfaceBias: isObject(source.surfaceBias) ? source.surfaceBias : {},
    benchmarkScale: source.benchmarkScale ?? source.carBenchmarkScale ?? 1
  };
}

function assertContentForCreate(input) {
  if (!input.spec || !isObject(input.spec)) fail('unknown-content', 'championship content is required');
  const specErrors = validateChampionshipSpec(input.spec);
  if (specErrors.length) fail('invalid-content', 'championship content is invalid', { errors: specErrors });
  if (!idLike(input.championshipId || '')) fail('unknown-content', 'championship id is required');
  if (input.content) {
    const championship = championshipFromCatalog(input.content, input.championshipId);
    if (!championship) fail('unknown-content', `unknown championship ${input.championshipId}`);
    if (input.carId && catalogList(input.content, 'cars').length && !pickById(catalogList(input.content, 'cars'), input.carId)) fail('unknown-content', `unknown car ${input.carId}`);
    for (const [index, event] of input.spec.events.entries()) {
      if (catalogList(input.content, 'stages').length && !stageFrom(input.content, event)) fail('unknown-content', `unknown stage ${event.stageId}`, { eventIndex: index });
      if (catalogList(input.content, 'weather').length && !weatherFrom(input.content, event)) fail('unknown-content', `unknown weather ${event.weatherId}`, { eventIndex: index });
      const stage = stageFrom(input.content, event);
      const band = durationBand(event, stage);
      if (!band) fail('invalid-content', `event ${index} has no authored duration band`, { eventIndex: index });
      if (band[1] / band[0] < 1.15) fail('invalid-content', `event ${index} duration band is narrower than 1.15`, { eventIndex: index });
      const reference = event.referenceTimeSeconds ?? event.benchmarkTimeSeconds ?? stage?.referenceTimeSeconds;
      if (reference !== undefined && (!finite(reference) || reference < band[0] || reference > band[1])) fail('invalid-content', `event ${index} reference time is outside its duration band`, { eventIndex: index });
    }
  } else {
    input.spec.events.forEach((event, index) => {
      const band = durationBand(event, null);
      if (band && band[1] / band[0] < 1.15) fail('invalid-content', `event ${index} duration band is narrower than 1.15`, { eventIndex: index });
      const reference = event.referenceTimeSeconds ?? event.benchmarkTimeSeconds;
      if (band && reference !== undefined && (!finite(reference) || reference < band[0] || reference > band[1])) fail('invalid-content', `event ${index} reference time is outside its duration band`, { eventIndex: index });
    });
  }
}

function contextFor(state, provided) {
  const catalog = asCatalog(provided);
  const championship = championshipFromCatalog(catalog, state?.championshipId);
  return { catalog, championship };
}

function assertState(state, catalog = null) {
  const errors = validateChampionshipState(state, catalog);
  if (errors.length) fail('invalid-state', 'championship state is invalid', { errors });
}

function eventForState(state, catalog, index = state.eventIndex) {
  const championship = championshipFromCatalog(catalog, state.championshipId);
  const event = eventFrom(catalog, championship, index, state);
  if (!event) fail('unknown-content', `event ${index} is not available`, { eventIndex: index });
  return { championship, event, stage: stageFrom(catalog, event), weather: weatherFrom(catalog, event) };
}

function pointsFor(state, catalog) {
  return championshipFromCatalog(catalog, state.championshipId)?.points || DEFAULT_POINTS;
}

export function createChampionship(...args) {
  const input = normalizeInput(args);
  assertContentForCreate(input);
  const seed = ensureFiniteInt32(Number(input.seed));
  const damage = copyDamage(input.options.initialDamage || input.options.damage);
  if (!sameKeys(input.options.initialDamage || input.options.damage || copyDamage(), DAMAGE_COMPONENTS)) fail('invalid-damage', 'initial damage must contain exactly five components');
  if (Object.values(damage).some(value => !unit(value))) fail('invalid-damage', 'initial damage must be bounded between 0 and 1');
  const tuning = copyTuning(input.options.tuning);
  if (TUNING_KEYS.some(key => !finite(tuning[key]) || tuning[key] < -1 || tuning[key] > 1) || !idLike(tuning.tyreId)) fail('invalid-tuning', 'tuning is invalid');
  const state = {
    contentVersion: CONTENT_SCHEMA_VERSION,
    championshipId: input.championshipId,
    carId: input.carId || input.car?.id || null,
    difficultyId: input.difficultyId,
    seed,
    phase: 'service',
    eventIndex: 0,
    attempt: 0,
    runId: null,
    damage,
    tuning,
    results: []
  };
  return deepFreeze(state);
}

function validateDamage(value, path, errors) {
  if (!isObject(value) || !sameKeys(value, DAMAGE_COMPONENTS)) {
    errors.push(`${path} must contain exactly engine, steering, suspension, brakes, and body`);
    return;
  }
  for (const key of DAMAGE_COMPONENTS) if (!unit(value[key])) errors.push(`${path}.${key} must be between 0 and 1`);
}

function validateTuning(value, path, errors) {
  if (!isObject(value) || !sameKeys(value, [...TUNING_KEYS, 'tyreId'])) {
    errors.push(`${path} must define brakeBias, steeringRatio, rideHeight, damping, and tyreId`);
    return;
  }
  for (const key of TUNING_KEYS) if (!finite(value[key]) || value[key] < -1 || value[key] > 1) errors.push(`${path}.${key} must be between -1 and 1`);
  if (!idLike(value.tyreId)) errors.push(`${path}.tyreId must be a kebab-case id`);
}

export function validateChampionshipState(state, provided = null) {
  const errors = [];
  const catalog = asCatalog(provided);
  if (!isObject(state)) return ['championship state must be an object'];
  if (state.contentVersion !== CONTENT_SCHEMA_VERSION) errors.push(`contentVersion must equal ${CONTENT_SCHEMA_VERSION}`);
  if (!idLike(state.championshipId)) errors.push('championshipId must be a kebab-case id');
  if (state.carId !== null && !idLike(state.carId)) errors.push('carId must be null or a kebab-case id');
  if (!idLike(state.difficultyId)) errors.push('difficultyId must be a kebab-case id');
  if (!Number.isInteger(state.seed) || state.seed < -2147483648 || state.seed > 2147483647) errors.push('seed must be a signed 32-bit integer');
  if (!PHASES.includes(state.phase)) errors.push(`phase must be one of ${PHASES.join(', ')}`);
  if (!Number.isInteger(state.eventIndex) || state.eventIndex < 0) errors.push('eventIndex must be a non-negative integer');
  if (!Number.isInteger(state.attempt) || state.attempt < 0) errors.push('attempt must be a non-negative integer');
  if (state.phase === 'driving') {
    if (typeof state.runId !== 'string' || state.runId.length === 0) errors.push('driving state must have a runId');
    else if (state.runId !== `run:${state.seed}:${state.eventIndex}:${state.attempt}`) errors.push('runId must include seed, event index, and attempt');
  } else if (state.runId !== null) errors.push('non-driving state must not have a runId');
  validateDamage(state.damage, 'damage', errors);
  validateTuning(state.tuning, 'tuning', errors);
  if (!Array.isArray(state.results)) errors.push('results must be an array');
  if (Array.isArray(state.results) && state.results.length !== state.eventIndex) errors.push('results.length must equal eventIndex');
  const championship = championshipFromCatalog(catalog, state.championshipId);
  if (championship) {
    if (state.eventIndex > championship.events.length) errors.push('eventIndex exceeds championship length');
    if (state.phase === 'classified' && state.eventIndex !== championship.events.length) errors.push('classified state must contain every event result');
    if (state.phase !== 'classified' && state.eventIndex === championship.events.length) errors.push('complete championship must be classified');
  }
  if (catalogList(catalog, 'cars').length && !pickById(catalogList(catalog, 'cars'), state.carId)) errors.push('carId does not resolve in content');
  if (catalogList(catalog, 'difficulties').length && !pickById(catalogList(catalog, 'difficulties'), state.difficultyId)) errors.push('difficultyId does not resolve in content');
  if (Array.isArray(state.results)) {
    state.results.forEach((result, index) => {
      if (!isObject(result)) {
        errors.push(`results[${index}] must be an object`);
        return;
      }
      const event = eventFrom(catalog, championship, index, state);
      if (result.eventIndex !== index) errors.push(`results[${index}].eventIndex must equal its index`);
      if (!idLike(result.eventId)) errors.push(`results[${index}].eventId must be a kebab-case id`);
      if (event && result.eventId !== event.id) errors.push(`results[${index}].eventId does not match event ${index}`);
      if (event && result.stageId !== event.stageId) errors.push(`results[${index}].stageId does not match event ${index}`);
      if (event && result.weatherId !== event.weatherId) errors.push(`results[${index}].weatherId does not match event ${index}`);
      if (!idLike(result.stageId)) errors.push(`results[${index}].stageId must be a kebab-case id`);
      if (!idLike(result.weatherId)) errors.push(`results[${index}].weatherId must be a kebab-case id`);
      if (result.carId !== null && !idLike(result.carId)) errors.push(`results[${index}].carId must be null or a kebab-case id`);
      if (!Number.isInteger(result.attempt) || result.attempt < 1) errors.push(`results[${index}].attempt must be a positive integer`);
      if (typeof result.runId !== 'string' || result.runId !== `run:${state.seed}:${index}:${result.attempt}`) errors.push(`results[${index}].runId must identify its attempt`);
      if (!['finished', 'retired'].includes(result.status)) errors.push(`results[${index}].status is unsupported`);
      if (result.status === 'finished') {
        if (!Number.isInteger(result.timeMs) || result.timeMs <= 0) errors.push(`results[${index}].timeMs must be a positive integer`);
        if (!Array.isArray(result.splitsMs) || result.splitsMs.length < 1 || result.splitsMs.length !== (splitCount(stageFrom(catalog, event), event, result.splitsMs?.length) || 0)) errors.push(`results[${index}].splitsMs has the wrong count`);
        if (Array.isArray(result.splitsMs) && (result.splitsMs.some(value => !Number.isInteger(value) || value <= 0) || result.splitsMs.some((value, splitIndex, values) => splitIndex > 0 && value <= values[splitIndex - 1]))) errors.push(`results[${index}].splitsMs must be positive and ascending`);
        if (Array.isArray(result.splitsMs) && result.splitsMs.length && result.timeMs !== result.splitsMs.at(-1)) errors.push(`results[${index}].splitsMs must end at timeMs`);
      } else if (result.timeMs !== null || (Array.isArray(result.splitsMs) && result.splitsMs.length)) errors.push(`results[${index}] retirement must not have a finish time`);
      if (!finite(result.penaltyMs) || result.penaltyMs < 0 || !Number.isInteger(result.penaltyMs)) errors.push(`results[${index}].penaltyMs must be a non-negative integer`);
      validateDamage(result.damage, `results[${index}].damage`, errors);
      if (!Array.isArray(result.rivalResults)) errors.push(`results[${index}].rivalResults must be an array`);
      else {
        const expectedRivals = event ? rivalList(catalog, championship, event).map((rival, rivalIndex) => normalizeRival(rival, rivalIndex).id) : [];
        const seen = new Set();
        result.rivalResults.forEach((rival, rivalIndex) => {
          const path = `results[${index}].rivalResults[${rivalIndex}]`;
          if (!isObject(rival)) {
            errors.push(`${path} must be an object`);
            return;
          }
          if (!idLike(rival.id)) errors.push(`${path}.id must be a kebab-case id`);
          if (seen.has(rival.id)) errors.push(`${path}.id must be unique`);
          seen.add(rival.id);
          if (expectedRivals.length && rival.id !== expectedRivals[rivalIndex]) errors.push(`${path}.id does not match event rivals`);
          if (typeof rival.name !== 'string' || rival.name.trim() === '') errors.push(`${path}.name must be non-empty`);
          if (!['finished', 'retired'].includes(rival.status)) errors.push(`${path}.status is unsupported`);
          if (!Number.isInteger(rival.penaltyMs) || rival.penaltyMs < 0) errors.push(`${path}.penaltyMs must be a non-negative integer`);
          if (rival.status === 'finished' && (!Number.isInteger(rival.timeMs) || rival.timeMs <= 0)) errors.push(`${path}.timeMs must be a positive integer`);
          if (rival.status === 'retired' && rival.timeMs !== null) errors.push(`${path}.timeMs must be null for retirement`);
        });
        if (expectedRivals.length && result.rivalResults.length !== expectedRivals.length) errors.push(`results[${index}].rivalResults has the wrong count`);
      }
    });
  }
  if (state.phase === 'driving' && state.eventIndex >= (championship?.events?.length ?? Infinity)) errors.push('driving eventIndex must identify an event');
  return errors;
}

function requirePhase(state, phases) {
  if (!phases.includes(state.phase)) fail('illegal-phase', `action is not legal in ${state.phase}`, { phase: state.phase });
}

export function availableActions(state) {
  if (!isObject(state) || !PHASES.includes(state.phase)) return [];
  if (state.phase === 'service') return ['applyService', 'abandon'];
  if (state.phase === 'ready') return ['startStage', 'abandon'];
  if (state.phase === 'driving') return ['submitResult', 'retire', 'abortRun', 'abandon'];
  return [];
}

function repairInput(plan) {
  if (!isObject(plan)) fail('invalid-service', 'service plan must be an object');
  const source = isObject(plan.repair) ? plan.repair : plan;
  const allowedNonRepair = new Set(['tuning', 'tyreId', ...TUNING_KEYS, 'budgetMinutes']);
  const unknown = Object.keys(source).filter(key => !COMPONENT_SET.has(key) && !allowedNonRepair.has(key));
  if (unknown.length) fail('unknown-service-component', `unknown service component ${unknown[0]}`, { component: unknown[0] });
  const minutes = {};
  for (const key of DAMAGE_COMPONENTS) {
    const value = source[key] ?? 0;
    if (!finite(value)) fail('invalid-service', `${key} service minutes must be finite`, { component: key });
    if (value < 0) fail('negative-service', `${key} service minutes cannot be negative`, { component: key });
    minutes[key] = value;
  }
  return minutes;
}

function tuningFromPlan(state, plan) {
  const candidate = plan.tuning || plan;
  const tyreId = plan.tyreId ?? candidate.tyreId ?? state.tuning.tyreId;
  const values = {
    brakeBias: candidate.brakeBias ?? state.tuning.brakeBias,
    steeringRatio: candidate.steeringRatio ?? state.tuning.steeringRatio,
    rideHeight: candidate.rideHeight ?? state.tuning.rideHeight,
    damping: candidate.damping ?? state.tuning.damping,
    tyreId
  };
  if (TUNING_KEYS.some(key => !finite(values[key]) || values[key] < -1 || values[key] > 1) || !idLike(values.tyreId)) fail('invalid-tuning', 'service tuning is invalid');
  return values;
}

function serviceBudget(event) {
  const budget = Number(event?.serviceMinutes ?? 0);
  if (!finite(budget) || budget < 0) fail('invalid-content', 'event service budget is invalid');
  return budget;
}

export function planService(state, plan = {}, provided = null) {
  const catalog = asCatalog(provided);
  assertState(state, catalog);
  requirePhase(state, ['service']);
  const { event } = eventForState(state, catalog);
  const budgetMinutes = serviceBudget(event);
  const requested = repairInput(plan);
  const requestedMinutes = DAMAGE_COMPONENTS.reduce((sum, key) => sum + requested[key], 0);
  if (requestedMinutes > budgetMinutes + 1e-9) fail('over-budget', `service plan needs ${requestedMinutes} minutes but only ${budgetMinutes} are available`, { budgetMinutes, requestedMinutes });
  const before = copyDamage(state.damage);
  const after = {};
  const repairMinutes = {};
  const wastedMinutes = {};
  for (const key of DAMAGE_COMPONENTS) {
    const usable = Math.min(requested[key], before[key] * REPAIR_MINUTES[key]);
    repairMinutes[key] = usable;
    wastedMinutes[key] = requested[key] - usable;
    after[key] = clamp(before[key] - usable / REPAIR_MINUTES[key], 0, 1);
  }
  const usedMinutes = Object.values(repairMinutes).reduce((sum, value) => sum + value, 0);
  const report = {
    budgetMinutes,
    requestedMinutes,
    usedMinutes,
    remainingMinutes: budgetMinutes - usedMinutes,
    before,
    after,
    repairMinutes,
    wastedMinutes,
    wastedTotalMinutes: Object.values(wastedMinutes).reduce((sum, value) => sum + value, 0),
    tuning: tuningFromPlan(state, plan),
    tyreId: tuningFromPlan(state, plan).tyreId
  };
  return deepFreeze(report);
}

export function autoServicePlan(state, provided = null) {
  const catalog = asCatalog(provided);
  assertState(state, catalog);
  requirePhase(state, ['service']);
  const { event } = eventForState(state, catalog);
  const budget = serviceBudget(event);
  const ranking = DAMAGE_COMPONENTS
    .map((key, index) => ({ key, need: state.damage[key] * REPAIR_MINUTES[key], weight: ({ engine: 5, suspension: 4, steering: 3, brakes: 2, body: 1 })[key], index }))
    .filter(item => item.need > 0)
    .sort((a, b) => (b.need * b.weight - a.need * a.weight) || (a.index - b.index));
  const repair = Object.fromEntries(DAMAGE_COMPONENTS.map(key => [key, 0]));
  let remaining = budget;
  for (const item of ranking) {
    if (remaining <= 1e-9) break;
    const spend = Math.min(item.need, remaining);
    repair[item.key] = spend;
    remaining -= spend;
  }
  return deepFreeze({ repair, tuning: deepClone(state.tuning), budgetMinutes: budget });
}

export function applyService(state, plan = {}, provided = null) {
  const catalog = asCatalog(provided);
  assertState(state, catalog);
  requirePhase(state, ['service']);
  const report = planService(state, plan, catalog);
  const next = {
    ...state,
    phase: 'ready',
    damage: report.after,
    tuning: report.tuning
  };
  return deepFreeze(next);
}

function liveRunId(state) {
  return `run:${state.seed}:${state.eventIndex}:${state.attempt}`;
}

export function startStage(state, provided = null) {
  const catalog = asCatalog(provided);
  assertState(state, catalog);
  requirePhase(state, ['ready']);
  eventForState(state, catalog);
  const attempt = state.attempt + 1;
  const next = { ...state, phase: 'driving', attempt, runId: liveRunId({ ...state, attempt }) };
  return deepFreeze(next);
}

export function abortRun(state, provided = null) {
  const catalog = asCatalog(provided);
  assertState(state, catalog);
  if (state.phase !== 'driving') return state;
  return deepFreeze({ ...state, phase: 'ready', runId: null });
}

function parseRunArgs(state, runOrResult, maybeResult, maybeCatalog) {
  if (typeof runOrResult === 'string') {
    const payload = isObject(maybeResult) && !maybeResult.championships && !maybeResult.stages && !maybeResult.catalog && !maybeResult.content ? maybeResult : typeof maybeResult === 'string' ? { reason: maybeResult } : {};
    return { runId: runOrResult, payload, catalog: asCatalog(maybeCatalog) || asCatalog(maybeResult) };
  }
  const payload = isObject(runOrResult) ? runOrResult : {};
  return { runId: payload.runId || state.runId, payload, catalog: asCatalog(maybeResult) };
}

function findRecordedRun(state, runId) {
  return Array.isArray(state.results) && state.results.some(result => result.runId === runId);
}

function validateRunId(state, runId) {
  if (findRecordedRun(state, runId)) return 'recorded';
  if (state.phase !== 'driving' || runId !== state.runId) fail('stale-run', 'run ID is not the live attempt', { runId });
  return 'live';
}

function numberMs(payload, msKey, secondsKey, label, positive = false) {
  let value;
  let unitName;
  if (own(payload, msKey)) {
    value = payload[msKey];
    unitName = 'ms';
  } else if (own(payload, secondsKey)) {
    value = payload[secondsKey];
    unitName = 'seconds';
  } else return null;
  if (!finite(value)) fail('invalid-result', `${label} must be finite`, { field: label });
  const ms = Math.round(unitName === 'ms' ? value : value * 1000);
  if (positive && ms <= 0) fail('invalid-result', `${label} must be positive`, { field: label });
  if (!positive && ms < 0) fail('invalid-result', `${label} must be non-negative`, { field: label });
  return ms;
}

function numericSplit(value, index) {
  if (finite(value)) return Math.round(value * 1000);
  if (!isObject(value)) fail('invalid-result', `split ${index} must be numeric`);
  if (own(value, 'timeMs')) return numberMs(value, 'timeMs', 'timeSeconds', `splits[${index}]`, true);
  if (own(value, 'ms')) return numberMs(value, 'ms', 'seconds', `splits[${index}]`, true);
  if (own(value, 'time')) return numberMs(value, 'timeMs', 'time', `splits[${index}]`, true);
  fail('invalid-result', `split ${index} must contain a numeric time`);
}

function normalizedSplits(payload, expectedCount) {
  const values = payload.splitsMs || payload.splits;
  if (!Array.isArray(values) || values.length !== expectedCount) fail('invalid-result', `result needs exactly ${expectedCount} numeric splits`, { expectedCount });
  const useMs = own(payload, 'splitsMs');
  const splitsMs = values.map((value, index) => {
    if (useMs && finite(value)) return Math.round(value);
    return numericSplit(value, index);
  });
  if (splitsMs.some(value => !Number.isInteger(value) || value <= 0) || splitsMs.some((value, index) => index > 0 && value <= splitsMs[index - 1])) fail('invalid-result', 'splits must be positive and strictly ascending');
  return splitsMs;
}

function normalizedDamage(payload, current) {
  const value = payload.damage === undefined ? current : payload.damage;
  if (!isObject(value) || !sameKeys(value, DAMAGE_COMPONENTS) || DAMAGE_COMPONENTS.some(key => !unit(value[key]))) fail('invalid-result', 'result damage must contain exactly five bounded components');
  const damage = copyDamage(value);
  if (DAMAGE_COMPONENTS.some(key => damage[key] < current[key])) fail('damage-healed', 'a stage result cannot heal carry-over damage');
  return damage;
}

function normalizedPenalty(payload) {
  return numberMs(payload, 'penaltyMs', 'penaltySeconds', 'penalty', false) ?? 0;
}

function expectedResultIds(event, state) {
  return { stageId: event.stageId, weatherId: event.weatherId, carId: state.carId };
}

function ensureResultIds(payload, expected) {
  for (const key of ['stageId', 'weatherId', 'carId']) {
    if (payload[key] !== undefined && payload[key] !== expected[key]) fail('invalid-result', `${key} does not match the event`, { field: key });
  }
}

function finishResult(state, runId, payload, catalog, status) {
  const { championship, event, stage, weather } = eventForState(state, catalog);
  const ids = expectedResultIds(event, state);
  ensureResultIds(payload, ids);
  const expectedCount = splitCount(stage, event, payload.splitsMs?.length || payload.splits?.length);
  if (expectedCount === null && status === 'finished') fail('unknown-content', 'stage split count is unavailable');
  const damage = normalizedDamage(payload, state.damage);
  const penaltyMs = normalizedPenalty(payload);
  let timeMs = null;
  let splitsMs = [];
  if (status === 'finished') {
    timeMs = numberMs(payload, 'timeMs', 'timeSeconds', 'time', true);
    splitsMs = normalizedSplits(payload, expectedCount);
    if (splitsMs.at(-1) !== timeMs) fail('invalid-result', 'final split must equal rounded finish time');
  }
  const rivals = rivalOutcome({
    state,
    eventIndex: state.eventIndex,
    catalog,
    event,
    stage,
    weather,
    championship,
    playerTimeMs: timeMs
  });
  return {
    eventIndex: state.eventIndex,
    eventId: event.id,
    stageId: ids.stageId,
    carId: ids.carId,
    weatherId: ids.weatherId,
    runId,
    attempt: state.attempt,
    status,
    timeMs,
    splitsMs,
    penaltyMs,
    damage,
    rivalResults: rivals,
    reason: status === 'retired' ? String(payload.reason || 'retired') : null
  };
}

function nextAfterResult(state, result) {
  const eventIndex = state.eventIndex + 1;
  const phase = eventIndex >= state.results.length + 1 && eventIndex === state.eventIndex + 1 ? 'service' : 'service';
  // The final event has no next service park; all other events begin there.
  const next = { ...state, phase, eventIndex, runId: null, results: [...state.results, result], damage: result.damage };
  return next;
}

export function submitResult(state, runOrResult, maybeResult, maybeCatalog = null) {
  const parsed = parseRunArgs(state, runOrResult, maybeResult, maybeCatalog);
  const catalog = parsed.catalog;
  assertState(state, catalog);
  const runStatus = validateRunId(state, parsed.runId);
  if (runStatus === 'recorded') return state;
  const result = finishResult(state, parsed.runId, parsed.payload, catalog, 'finished');
  const { championship } = contextFor(state, catalog);
  const final = championship && state.eventIndex + 1 >= championship.events.length;
  return deepFreeze({ ...nextAfterResult(state, result), phase: final ? 'classified' : 'service' });
}

export function retire(state, runOrPayload, maybePayload, maybeCatalog = null) {
  const parsed = parseRunArgs(state, runOrPayload, maybePayload, maybeCatalog);
  const catalog = parsed.catalog;
  assertState(state, catalog);
  const runStatus = validateRunId(state, parsed.runId);
  if (runStatus === 'recorded') return state;
  const result = finishResult(state, parsed.runId, parsed.payload, catalog, 'retired');
  const { championship } = contextFor(state, catalog);
  const final = championship && state.eventIndex + 1 >= championship.events.length;
  return deepFreeze({ ...nextAfterResult(state, result), phase: final ? 'classified' : 'service' });
}

export function abandon(state, provided = null) {
  const catalog = asCatalog(provided);
  assertState(state, catalog);
  if (state.phase === 'abandoned') return state;
  requirePhase(state, ['service', 'ready', 'driving']);
  return deepFreeze({ ...state, phase: 'abandoned', runId: null });
}

function normalizeRivalInput(first, second, third, fourth, fifth) {
  if (isObject(first) && (first.state || first.event || first.catalog || first.seed !== undefined)) {
    const state = first.state || null;
    const secondCatalog = isObject(second) && (second.content || second.catalog || second.championships || second.stages || second.events) ? second : null;
    const thirdCatalog = isObject(third) && (third.content || third.catalog || third.championships || third.stages || third.events) ? third : null;
    const catalog = asCatalog(first.catalog || first.content || secondCatalog || thirdCatalog);
    const sourceState = state || first;
    const championship = first.championship || championshipFromCatalog(catalog, sourceState.championshipId);
    const eventIndex = Number.isInteger(first.eventIndex) ? first.eventIndex : Number.isInteger(third) ? third : sourceState.eventIndex || 0;
    const event = first.event || (isObject(second) && second.id && second.stageId ? second : eventFrom(catalog, championship, eventIndex, sourceState));
    return {
      state: sourceState,
      catalog,
      championship,
      eventIndex,
      event,
      stage: first.stage || stageFrom(catalog, event),
      weather: first.weather || weatherFrom(catalog, event),
      car: first.car || carFrom(catalog, sourceState),
      difficulty: first.difficulty || difficultyFrom(catalog, sourceState),
      seed: Number(first.seed ?? sourceState.seed ?? 0),
      rivals: first.rivals,
      playerTimeMs: first.playerTimeMs
    };
  }
  const seed = Number(first || 0);
  const event = isObject(second) ? second : {};
  const rivals = Array.isArray(third) ? third : [];
  const difficulty = isObject(fourth) ? fourth : DEFAULT_DIFFICULTY;
  const car = isObject(fifth) ? fifth : null;
  return { state: { seed, carId: car?.id || null, difficultyId: difficulty.id || 'normal' }, catalog: null, championship: null, eventIndex: 0, event, stage: event.stage || null, weather: event.weather || null, car, difficulty, seed, rivals };
}

export function rivalOutcome(first, second = null, third = null, fourth = null, fifth = null) {
  const input = normalizeRivalInput(first, second, third, fourth, fifth);
  const { catalog, championship, event, stage, weather, state } = input;
  if (!event) fail('unknown-content', 'rival event is unavailable');
  const rivals = input.rivals || rivalList(catalog, championship, event);
  const band = durationBand(event, stage);
  if (!band) fail('invalid-content', 'rival event has no authored duration band');
  if (band[1] / band[0] < 1.15) fail('invalid-content', 'rival duration band is narrower than 1.15');
  const mix = surfaceMix(stage, event);
  const weatherData = { ...DEFAULT_WEATHER, ...(weather || {}) };
  const difficulty = { ...DEFAULT_DIFFICULTY, ...(input.difficulty || {}) };
  const paceScale = Number(difficulty.rivalPace ?? difficulty.rivalScale ?? difficulty.paceScale ?? 1);
  if (!finite(paceScale) || paceScale <= 0) fail('invalid-content', 'difficulty rival pace is invalid');
  const eventScale = isObject(event?.benchmarkScales) && input.car?.id ? event.benchmarkScales[input.car.id] : undefined;
  const carScale = Number(input.car?.benchmarkScale ?? input.car?.benchmark?.scale ?? eventScale ?? event.carBenchmarkScale ?? 1);
  if (!finite(carScale) || carScale < 0.8 || carScale > 1.3) fail('invalid-content', 'car benchmark scale must be between 0.8 and 1.3');
  const surfaceGrip = Object.entries(mix).reduce((sum, [surface, share]) => sum + share * (Number(surfaceData(catalog, surface)?.grip ?? surfaceData(catalog, surface)?.friction ?? 1)), 0) || 1;
  const weatherFactor = 1 + clamp(1 - Number(weatherData.gripScale || 1), -0.2, 0.4) * 0.18 + clamp(Number(weatherData.roadWetness || 0), 0, 1) * 0.04;
  const visibilityFactor = 1 + clamp(1000 / (Number(weatherData.visibilityM) + 1000), 0, 1) * 0.045;
  const timeOfDayFactor = weatherData.timeOfDay === 'night' ? 1.025 : weatherData.timeOfDay === 'dusk' ? 1.012 : 1;
  return rivals.map((raw, index) => {
    const rival = normalizeRival(raw, index);
    const skillTime = band[1] - (band[1] - band[0]) * rival.skill;
    const bias = Object.entries(mix).reduce((sum, [surface, share]) => {
      const value = Number(rival.surfaceBias?.[surface] || 0);
      return sum + share * (finite(value) ? clamp(value, -0.5, 0.5) : 0);
    }, 0);
    const consistencyNoise = (random01(input.seed, 'consistency', input.eventIndex, rival.seed, rival.id) * 2 - 1) * (1 - rival.consistency) * 0.025;
    const pace = skillTime * (1 + bias * 0.08 + consistencyNoise) * weatherFactor * visibilityFactor * timeOfDayFactor * surfaceGrip ** -0.08 * paceScale * carScale;
    const dnfRoll = random01(input.seed, 'retirement', input.eventIndex, rival.seed, rival.id);
    const retireThreshold = clamp(rival.damageRisk * 0.12, 0, 0.12);
    if (dnfRoll < retireThreshold) return { id: rival.id, name: rival.name, status: 'retired', timeMs: null, penaltyMs: 0, reason: 'mechanical' };
    return { id: rival.id, name: rival.name, status: 'finished', timeMs: Math.max(1, Math.round(pace * 1000)), penaltyMs: 0, reason: null };
  });
}

function surfaceData(catalog, id) {
  return pickById(catalogList(catalog, 'surfaces'), id) || null;
}

function asMs(value, secondsKey = null) {
  if (finite(value)) return Math.round(value);
  if (isObject(value) && finite(value.timeMs)) return Math.round(value.timeMs);
  if (isObject(value) && secondsKey && finite(value[secondsKey])) return Math.round(value[secondsKey] * 1000);
  return null;
}

function standingsInput(first, second, third) {
  if (isObject(first) && Array.isArray(first.results)) {
    const state = first;
    const catalog = asCatalog(second);
    const eventIndex = Number.isInteger(third) ? third : Math.max(0, state.results.length - 1);
    return { state, catalog, result: state.results[eventIndex], eventIndex };
  }
  return { state: null, catalog: asCatalog(second), result: first, eventIndex: Number.isInteger(third) ? third : 0 };
}

function standingRow(entry, isPlayer = false) {
  const status = entry.status || (entry.retired || entry.dnf ? 'retired' : 'finished');
  const timeMs = status === 'finished'
    ? (finite(entry.timeMs) ? Math.round(entry.timeMs) : finite(entry.timeSeconds) ? Math.round(entry.timeSeconds * 1000) : finite(entry.time) ? Math.round(entry.time * 1000) : null)
    : null;
  const penaltyMs = finite(entry.penaltyMs) ? Math.round(entry.penaltyMs) : finite(entry.penaltySeconds) ? Math.round(entry.penaltySeconds * 1000) : finite(entry.penalty) ? Math.round(entry.penalty * 1000) : 0;
  return {
    id: entry.id || (isPlayer ? 'player' : 'unknown'),
    name: entry.name || (isPlayer ? 'Player' : entry.id || 'Unknown'),
    isPlayer,
    status,
    timeMs,
    penaltyMs,
    totalMs: timeMs === null ? null : timeMs + penaltyMs,
    points: 0
  };
}

export function stageStandings(first, second = null, third = null) {
  const input = standingsInput(first, second, third);
  const result = input.result;
  if (!isObject(result)) return [];
  const rows = [];
  rows.push(standingRow({ id: 'player', name: 'Player', status: result.status, timeMs: result.timeMs, penaltyMs: result.penaltyMs }, true));
  for (const rival of result.rivalResults || []) rows.push(standingRow(rival));
  const points = input.state ? pointsFor(input.state, input.catalog) : (input.result.pointsTable || DEFAULT_POINTS);
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'finished' ? -1 : 1;
    if (a.totalMs !== null && b.totalMs !== null && a.totalMs !== b.totalMs) return a.totalMs - b.totalMs;
    return a.id.localeCompare(b.id);
  });
  rows.forEach((row, index) => { row.position = index + 1; row.points = row.status === 'finished' ? Number(points[index] || 0) : 0; });
  return rows;
}

export function overallStandings(state, provided = null) {
  const catalog = asCatalog(provided);
  assertState(state, catalog);
  const totals = new Map();
  const ensure = row => {
    if (!totals.has(row.id)) totals.set(row.id, { id: row.id, name: row.name, points: 0, wins: 0, podiums: 0, finishes: 0, totalMs: 0, stages: 0, retirements: 0 });
    return totals.get(row.id);
  };
  state.results.forEach((result, index) => {
    for (const row of stageStandings(state, catalog, index)) {
      const total = ensure(row);
      total.points += row.points;
      total.stages += 1;
      if (row.status === 'finished') {
        total.finishes += 1;
        total.totalMs += row.totalMs;
        if (row.position === 1) total.wins += 1;
        if (row.position <= 3) total.podiums += 1;
      } else total.retirements += 1;
    }
  });
  const rows = [...totals.values()];
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || b.finishes - a.finishes || a.totalMs - b.totalMs || a.id.localeCompare(b.id));
  rows.forEach((row, index) => { row.position = index + 1; row.status = row.retirements ? (row.finishes ? 'classified' : 'retired') : 'classified'; });
  return rows;
}

export function projectedSplits(stageOrDistances, totalTime, maybeUnit = null) {
  const distances = Array.isArray(stageOrDistances) ? stageOrDistances : (stageOrDistances?.splits || stageOrDistances?.splitDistances || []);
  if (!Array.isArray(distances) || distances.length === 0 || !finite(totalTime) || totalTime <= 0) return [];
  const routeLength = Array.isArray(stageOrDistances?.segments) ? stageOrDistances.segments.reduce((sum, segment) => sum + Number(segment.lengthM || 0), 0) : Number(distances.at(-1));
  if (!finite(routeLength) || routeLength <= 0) return [];
  const values = distances.map(distance => totalTime * Number(distance) / routeLength);
  if (maybeUnit === 'ms' || (maybeUnit === undefined && totalTime >= 1000)) return values.map(Math.round);
  return values;
}
