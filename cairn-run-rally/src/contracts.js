export const CONTENT_SCHEMA_VERSION = 1;
export const SAVE_SCHEMA_VERSION = 1;

export const DRIVE_LAYOUTS = Object.freeze(['fwd', 'rwd', 'awd']);
export const ASSIST_IDS = Object.freeze(['automatic', 'stability', 'braking', 'paceNotes']);
export const PRECIPITATION_TYPES = Object.freeze(['none', 'rain', 'storm', 'snow']);
export const TIME_OF_DAY_TYPES = Object.freeze(['day', 'dusk', 'night']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = value => Number.isFinite(value);
const isUnit = value => isFiniteNumber(value) && value >= 0 && value <= 1;
const isId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const positive = value => isFiniteNumber(value) && value > 0;
const ascending = values => values.every((value, index) => index === 0 || value > values[index - 1]);

function requireId(errors, value, path) {
  if (!isId(value)) errors.push(`${path} must be a kebab-case id`);
}

function requireString(errors, value, path) {
  if (!isNonEmptyString(value)) errors.push(`${path} must be a non-empty string`);
}

function requirePositive(errors, value, path) {
  if (!positive(value)) errors.push(`${path} must be a positive finite number`);
}

export function validateCarSpec(car) {
  const errors = [];
  if (!isObject(car)) return ['car must be an object'];
  requireId(errors, car.id, 'car.id');
  requireString(errors, car.name, 'car.name');
  if (!Number.isInteger(car.era) || car.era < 1960 || car.era > 2035) errors.push('car.era must be a plausible year');
  if (!DRIVE_LAYOUTS.includes(car.drive)) errors.push(`car.drive must be one of ${DRIVE_LAYOUTS.join(', ')}`);
  if (!isFiniteNumber(car.benchmarkScale) || car.benchmarkScale < 0.8 || car.benchmarkScale > 1.3) errors.push('car.benchmarkScale must be between 0.8 and 1.3');
  for (const key of ['massKg', 'yawInertiaKgM2', 'wheelbaseM', 'trackM', 'rideHeightM', 'dragCoefficient', 'finalDrive', 'wheelRadiusM', 'brakeForceN', 'steeringLockRad']) {
    requirePositive(errors, car[key], `car.${key}`);
  }
  if (!isUnit(car.frontWeightFraction) || car.frontWeightFraction < 0.35 || car.frontWeightFraction > 0.75) errors.push('car.frontWeightFraction must be between 0.35 and 0.75');
  if (!isUnit(car.brakeBiasFront)) errors.push('car.brakeBiasFront must be between 0 and 1');
  if (!Array.isArray(car.torqueCurve) || car.torqueCurve.length < 2 || car.torqueCurve.some(point => !Array.isArray(point) || point.length !== 2 || !positive(point[0]) || !positive(point[1])) || !ascending(car.torqueCurve.map(point => point[0]))) {
    errors.push('car.torqueCurve must contain at least two ascending [rpm, newtonMetres] points');
  }
  if (!Array.isArray(car.gearRatios) || car.gearRatios.length < 3 || car.gearRatios.some(ratio => !positive(ratio))) errors.push('car.gearRatios must contain at least three positive ratios');
  if (!isObject(car.tyreGrip) || !positive(car.tyreGrip.front) || !positive(car.tyreGrip.rear)) errors.push('car.tyreGrip must define positive front and rear values');
  if (!isObject(car.suspension) || !positive(car.suspension.travelM) || !positive(car.suspension.springHz) || !isUnit(car.suspension.dampingRatio)) errors.push('car.suspension must define travelM, springHz, and dampingRatio');
  if (!isObject(car.durability) || ['engine', 'steering', 'suspension', 'brakes', 'body'].some(key => !isUnit(car.durability[key]))) errors.push('car.durability must define bounded component limits');
  if (!Array.isArray(car.assists) || car.assists.some(assist => !ASSIST_IDS.includes(assist))) errors.push('car.assists contains an unsupported assist');
  return errors;
}

export function validateStageSpec(stage, surfaceIds = new Set()) {
  const errors = [];
  if (!isObject(stage)) return ['stage must be an object'];
  requireId(errors, stage.id, 'stage.id');
  requireId(errors, stage.regionId, 'stage.regionId');
  requireString(errors, stage.name, 'stage.name');
  if (!Array.isArray(stage.segments) || stage.segments.length < 2) {
    errors.push('stage.segments must contain at least two authored segments');
  }
  let lengthM = 0;
  (Array.isArray(stage.segments) ? stage.segments : []).forEach((segment, index) => {
    const path = `stage.segments[${index}]`;
    requireString(errors, segment?.name, `${path}.name`);
    requirePositive(errors, segment?.lengthM, `${path}.lengthM`);
    if (positive(segment?.lengthM)) lengthM += segment.lengthM;
    if (!Array.isArray(segment?.curve) || segment.curve.length !== 2 || segment.curve.some(value => !isFiniteNumber(value))) errors.push(`${path}.curve must contain two finite values`);
    if (!isFiniteNumber(segment?.riseM)) errors.push(`${path}.riseM must be finite`);
    requirePositive(errors, segment?.widthM, `${path}.widthM`);
    if (!surfaceIds.has(segment?.surface)) errors.push(`${path}.surface is not registered`);
  });
  if (!Array.isArray(stage.notes) || stage.notes.some((note, index) => !isObject(note) || !isFiniteNumber(note.atM) || note.atM < 0 || note.atM > lengthM || (index > 0 && note.atM <= stage.notes[index - 1].atM) || !isNonEmptyString(note.phrase))) errors.push('stage.notes must be ordered, in route bounds, and speakable');
  if (!Array.isArray(stage.splits) || stage.splits.length < 1 || !ascending(stage.splits) || stage.splits.some(split => !positive(split) || split > lengthM) || Math.abs(stage.splits.at(-1) - lengthM) > 0.01) errors.push('stage.splits must be ordered and end at the exact route length');
  if (!Array.isArray(stage.expectedDurationSeconds) || stage.expectedDurationSeconds.length !== 2 || !positive(stage.expectedDurationSeconds[0]) || stage.expectedDurationSeconds[1] <= stage.expectedDurationSeconds[0]) errors.push('stage.expectedDurationSeconds must be an increasing positive range');
  if (!Array.isArray(stage.landmarkIds) || stage.landmarkIds.some(id => !isId(id))) errors.push('stage.landmarkIds must contain valid ids');
  return errors;
}

export function validateRegionSpec(region) {
  const errors = [];
  if (!isObject(region)) return ['region must be an object'];
  requireId(errors, region.id, 'region.id');
  requireString(errors, region.name, 'region.name');
  requireString(errors, region.country, 'region.country');
  if (!Array.isArray(region.stageIds) || region.stageIds.length < 1 || region.stageIds.some(id => !isId(id))) errors.push('region.stageIds must contain valid ids');
  if (!isObject(region.palette) || ['sky', 'terrain', 'road'].some(key => !/^#[0-9a-f]{6}$/i.test(region.palette[key] || ''))) errors.push('region.palette must define sky, terrain, and road hex colours');
  if (!Array.isArray(region.sceneryKit) || region.sceneryKit.length < 3 || region.sceneryKit.some(item => !isId(item))) errors.push('region.sceneryKit must contain at least three valid landmark or scenery ids');
  if (!Array.isArray(region.weatherIds) || region.weatherIds.length < 1 || region.weatherIds.some(id => !isId(id))) errors.push('region.weatherIds must contain valid ids');
  return errors;
}

export function validateWeatherSpec(weather) {
  const errors = [];
  if (!isObject(weather)) return ['weather must be an object'];
  requireId(errors, weather.id, 'weather.id');
  requireString(errors, weather.name, 'weather.name');
  requirePositive(errors, weather.visibilityM, 'weather.visibilityM');
  if (!positive(weather.gripScale) || weather.gripScale > 1.2) errors.push('weather.gripScale must be positive and no greater than 1.2');
  if (!PRECIPITATION_TYPES.includes(weather.precipitation)) errors.push('weather.precipitation is unsupported');
  if (!isUnit(weather.roadWetness)) errors.push('weather.roadWetness must be between 0 and 1');
  if (!isUnit(weather.wind)) errors.push('weather.wind must be between 0 and 1');
  if (!TIME_OF_DAY_TYPES.includes(weather.timeOfDay)) errors.push('weather.timeOfDay is unsupported');
  return errors;
}

export function validateRivalSpec(rival) {
  const errors = [];
  if (!isObject(rival)) return ['rival must be an object'];
  requireId(errors, rival.id, 'rival.id');
  requireString(errors, rival.name, 'rival.name');
  if (!Number.isInteger(rival.seed)) errors.push('rival.seed must be an integer');
  for (const key of ['skill', 'consistency', 'damageRisk']) if (!isUnit(rival[key])) errors.push(`rival.${key} must be between 0 and 1`);
  if (!isObject(rival.surfaceBias) || Object.values(rival.surfaceBias).some(value => !isFiniteNumber(value) || Math.abs(value) > 0.5)) errors.push('rival.surfaceBias must contain bounded finite values');
  return errors;
}

export function validateChampionshipSpec(championship) {
  const errors = [];
  if (!isObject(championship)) return ['championship must be an object'];
  requireId(errors, championship.id, 'championship.id');
  requireString(errors, championship.name, 'championship.name');
  if (!Array.isArray(championship.points) || championship.points.length < 3 || championship.points.some(value => !Number.isInteger(value) || value < 0) || !championship.points.every((value, index, values) => index === 0 || value <= values[index - 1])) errors.push('championship.points must be a descending non-negative table');
  if (!Array.isArray(championship.events) || championship.events.length < 1) errors.push('championship.events must not be empty');
  else championship.events.forEach((event, index) => {
    requireId(errors, event?.id, `championship.events[${index}].id`);
    requireId(errors, event?.stageId, `championship.events[${index}].stageId`);
    requireId(errors, event?.weatherId, `championship.events[${index}].weatherId`);
    if (!isFiniteNumber(event?.serviceMinutes) || event.serviceMinutes < 0) errors.push(`championship.events[${index}].serviceMinutes must be non-negative`);
  });
  return errors;
}

export function validateTuningSpec(tuning) {
  const errors = [];
  if (!isObject(tuning)) return ['tuning must be an object'];
  for (const key of ['brakeBias', 'steeringRatio', 'rideHeight', 'damping']) if (!isFiniteNumber(tuning[key]) || tuning[key] < -1 || tuning[key] > 1) errors.push(`tuning.${key} must be between -1 and 1`);
  requireId(errors, tuning.tyreId, 'tuning.tyreId');
  return errors;
}

export function validateResultData(result) {
  const errors = [];
  if (!isObject(result)) return ['result must be an object'];
  for (const key of ['stageId', 'carId', 'weatherId']) requireId(errors, result[key], `result.${key}`);
  requirePositive(errors, result.timeSeconds, 'result.timeSeconds');
  if (!Array.isArray(result.splits) || result.splits.some(value => !positive(value)) || !ascending(result.splits)) errors.push('result.splits must be positive and ascending');
  if (!isFiniteNumber(result.penaltySeconds) || result.penaltySeconds < 0) errors.push('result.penaltySeconds must be non-negative');
  if (!isObject(result.damage) || Object.values(result.damage).some(value => !isUnit(value))) errors.push('result.damage must contain bounded values');
  return errors;
}

export function validateSaveData(save) {
  const errors = [];
  if (!isObject(save)) return ['save must be an object'];
  if (save.version !== SAVE_SCHEMA_VERSION) errors.push(`save.version must equal ${SAVE_SCHEMA_VERSION}`);
  if (!isObject(save.profile) || !isObject(save.profile.assists) || !isObject(save.profile.bindings) || !isObject(save.profile.gamepadBindings)) errors.push('save.profile must contain assists, bindings, and gamepadBindings');
  if (!isObject(save.bests)) errors.push('save.bests must be an object');
  else for (const [key, best] of Object.entries(save.bests)) {
    if (!isObject(best) || !positive(best.timeSeconds)) errors.push(`save.bests.${key}.timeSeconds must be positive and finite`);
    if (!Array.isArray(best?.splits) || best.splits.some(value => !positive(value)) || !ascending(best.splits)) errors.push(`save.bests.${key}.splits must be positive and ascending`);
  }
  if (save.championship !== null && !isObject(save.championship)) errors.push('save.championship must be an object or null');
  return errors;
}
