import {
  validateCarSpec,
  validateRegionSpec,
  validateStageSpec,
  validateWeatherSpec
} from './contracts.js';

const deepFreeze = value => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const surfaces = [
  {
    id: 'compact',
    name: 'Compact gravel',
    grip: 0.91,
    friction: 0.91,
    rollingResistance: 145,
    roughness: 0.22,
    sink: 0.08,
    particle: 'dust',
    audio: 'gravel'
  },
  {
    id: 'loose',
    name: 'Loose gravel',
    grip: 0.69,
    friction: 0.69,
    rollingResistance: 180,
    roughness: 0.4,
    sink: 0.18,
    particle: 'gravel',
    audio: 'loose-gravel'
  },
  {
    id: 'grass',
    name: 'Grass verge',
    grip: 0.43,
    friction: 0.43,
    rollingResistance: 510,
    roughness: 0.56,
    sink: 0.34,
    particle: 'grass',
    audio: 'grass'
  }
];

const ridgeWeather = {
  id: 'ridge-mist',
  name: 'Ridge mist',
  visibilityM: 850,
  gripScale: 0.94,
  precipitation: 'rain',
  roadWetness: 0.28,
  wind: 0.36,
  timeOfDay: 'dusk'
};

const kestrelRegion = {
  id: 'kestrel-ridge',
  name: 'Kestrel Ridge',
  country: 'Scotland',
  stageIds: ['kestrel-ridge'],
  palette: { sky: '#15241e', terrain: '#536347', road: '#817563' },
  sceneryKit: [
    'pine',
    'birch',
    'moor',
    'stone-wall',
    'quarry',
    'bridge',
    'finish-gate'
  ],
  weatherIds: ['ridge-mist']
};

const kestrelSegments = [
  { name: 'Launch straight', lengthM: 220, curve: [0, 0], riseM: 4, widthM: 7.5, surface: 'compact', feature: null },
  { name: 'Right six long', lengthM: 300, curve: [0.00155, 0.00155], riseM: 8, widthM: 7.4, surface: 'compact', feature: null },
  { name: 'First crest', lengthM: 190, curve: [0, 0], riseM: 13, widthM: 7.2, surface: 'compact', feature: 'crest' },
  { name: 'Left five', lengthM: 240, curve: [-0.0031, -0.0031], riseM: -3, widthM: 7, surface: 'compact', feature: null },
  { name: 'Downhill chute', lengthM: 170, curve: [0, 0], riseM: -14, widthM: 7.1, surface: 'compact', feature: 'dip' },
  { name: 'Right four', lengthM: 210, curve: [0.0045, 0.0045], riseM: -3, widthM: 6.9, surface: 'compact', feature: null },
  { name: 'Birch straight', lengthM: 130, curve: [0, 0], riseM: 2, widthM: 7.2, surface: 'loose', feature: null },
  { name: 'Left three tightens', lengthM: 180, curve: [-0.0037, -0.0065], riseM: 4, widthM: 6.8, surface: 'loose', feature: null },
  { name: 'Stone wall braking zone', lengthM: 160, curve: [0, 0], riseM: 6, widthM: 7, surface: 'compact', feature: null },
  { name: 'Quarry hairpin right', lengthM: 140, curve: [0.0192, 0.0192], riseM: 1, widthM: 7.8, surface: 'compact', feature: 'hairpin' },
  { name: 'Quarry exit climb', lengthM: 200, curve: [0, 0], riseM: 14, widthM: 7, surface: 'compact', feature: null },
  { name: 'Left six long', lengthM: 320, curve: [-0.00165, -0.00165], riseM: 1, widthM: 7.4, surface: 'compact', feature: null },
  { name: 'Loose moor straight', lengthM: 220, curve: [0.0002, 0.0002], riseM: 1, widthM: 7.4, surface: 'loose', feature: null },
  { name: 'Right five over crest', lengthM: 250, curve: [0.00265, 0.00265], riseM: 14, widthM: 7, surface: 'compact', feature: 'crest' },
  { name: 'Blind dip', lengthM: 170, curve: [0, 0], riseM: -18, widthM: 6.9, surface: 'compact', feature: 'dip' },
  { name: 'Left four', lengthM: 220, curve: [-0.0044, -0.0044], riseM: 4, widthM: 6.9, surface: 'compact', feature: null },
  { name: 'Commitment straight', lengthM: 280, curve: [0, 0], riseM: 7, widthM: 7.3, surface: 'compact', feature: null },
  { name: 'Right three', lengthM: 170, curve: [0.0059, 0.0059], riseM: -1, widthM: 6.8, surface: 'compact', feature: null },
  { name: 'Into left three', lengthM: 160, curve: [-0.0062, -0.0062], riseM: -2, widthM: 6.7, surface: 'compact', feature: null },
  { name: 'Bridge approach', lengthM: 140, curve: [0, 0], riseM: -6, widthM: 6.6, surface: 'compact', feature: null },
  { name: 'Bridge hairpin left', lengthM: 135, curve: [-0.0199, -0.0199], riseM: 1, widthM: 7.7, surface: 'compact', feature: 'hairpin' },
  { name: 'Pine climb', lengthM: 220, curve: [0, 0], riseM: 17, widthM: 6.9, surface: 'compact', feature: null },
  { name: 'Right four tightens', lengthM: 200, curve: [0.0037, 0.0061], riseM: 3, widthM: 6.7, surface: 'loose', feature: null },
  { name: 'Ridge straight', lengthM: 220, curve: [0, 0], riseM: 2, widthM: 7.3, surface: 'compact', feature: null },
  { name: 'Left five long', lengthM: 300, curve: [-0.0029, -0.0029], riseM: -3, widthM: 7.1, surface: 'compact', feature: null },
  { name: 'Finish run', lengthM: 260, curve: [0, 0], riseM: -9, widthM: 7.6, surface: 'compact', feature: null }
];

const kestrelNotes = [
  { atM: 220, icon: 'R6', main: 'RIGHT SIX LONG', detail: '80', phrase: 'right six long, eighty', id: 0 },
  { atM: 520, icon: '▲', main: 'OVER CREST', detail: 'INTO LEFT FIVE', phrase: 'over crest, into left five', id: 1 },
  { atM: 710, icon: 'L5', main: 'LEFT FIVE', detail: "DON'T CUT", phrase: "left five, don't cut", id: 2 },
  { atM: 1120, icon: 'R4', main: 'RIGHT FOUR', detail: '130', phrase: 'right four, one hundred and thirty', id: 3 },
  { atM: 1330, icon: '!', main: 'CAUTION — LOOSE', detail: 'LEFT THREE TIGHTENS', phrase: 'caution, loose gravel, left three tightens', id: 4 },
  { atM: 1460, icon: 'L3', main: 'LEFT THREE', detail: 'TIGHTENS TWO', phrase: 'left three, tightens two', id: 5 },
  { atM: 1800, icon: 'HR', main: 'HAIRPIN RIGHT', detail: "DON'T CUT", phrase: "hairpin right, don't cut", id: 6 },
  { atM: 2140, icon: 'L6', main: 'LEFT SIX LONG', detail: '320', phrase: 'left six long, three hundred and twenty', id: 7 },
  { atM: 2460, icon: '!', main: 'LOOSE GRAVEL', detail: 'RIGHT FIVE OVER CREST', phrase: 'caution, loose gravel, right five over crest', id: 8 },
  { atM: 2680, icon: 'R5', main: 'RIGHT FIVE', detail: 'OVER CREST', phrase: 'right five, over crest', id: 9 },
  { atM: 2930, icon: '▽', main: 'DIP', detail: 'INTO LEFT FOUR', phrase: 'dip, into left four', id: 10 },
  { atM: 3320, icon: '▲', main: 'FLAT OVER CREST', detail: '280', phrase: 'flat over crest, two hundred and eighty', id: 11 },
  { atM: 3600, icon: 'R3', main: 'RIGHT THREE', detail: 'INTO LEFT THREE', phrase: 'right three, into left three', id: 12 },
  { atM: 3770, icon: 'L3', main: 'LEFT THREE', detail: '140', phrase: 'left three, one hundred and forty', id: 13 },
  { atM: 4070, icon: '!', main: 'NARROW BRIDGE', detail: 'INTO HAIRPIN LEFT', phrase: 'narrow bridge, into hairpin left', id: 14 },
  { atM: 4425, icon: 'R4', main: 'RIGHT FOUR', detail: 'TIGHTENS THREE', phrase: 'right four, tightens three', id: 15 },
  { atM: 4845, icon: 'L5', main: 'LEFT FIVE LONG', detail: '260 TO FINISH', phrase: 'left five long, two hundred and sixty, to finish', id: 16 },
  { atM: 5320, icon: '🏁', main: 'FINISH', detail: 'THROUGH GATE', phrase: 'finish, through gate', id: 17 }
];

const kestrelStage = {
  id: 'kestrel-ridge',
  regionId: 'kestrel-ridge',
  name: 'Kestrel Ridge',
  segments: kestrelSegments,
  notes: kestrelNotes,
  splits: [1800, 3600, 5405],
  expectedDurationSeconds: [205, 310],
  landmarkIds: ['stone-wall', 'quarry', 'moor', 'bridge', 'pine', 'finish-gate']
};

const cairnR4 = {
  id: 'cairn-r4',
  name: 'Cairn R4',
  era: 1998,
  drive: 'awd',
  massKg: 1180,
  yawInertiaKgM2: 1780,
  wheelbaseM: 2.5,
  trackM: 1.5,
  frontWeightFraction: 0.528,
  rideHeightM: 0.54,
  dragCoefficient: 0.43,
  torqueCurve: [[1500, 250], [3500, 390], [6500, 330], [7600, 260]],
  gearRatios: [3.25, 2.14, 1.48, 1.12, 0.89, 0.72],
  finalDrive: 4.1,
  wheelRadiusM: 0.39,
  brakeForceN: 11900,
  brakeBiasFront: 0.64,
  steeringLockRad: 0.6,
  tyreGrip: { front: 1, rear: 0.96 },
  suspension: { travelM: 0.24, springHz: 1.8, dampingRatio: 0.72 },
  durability: { engine: 0.72, steering: 0.75, suspension: 0.78, brakes: 0.62, body: 0.9 },
  assists: ['automatic', 'stability', 'braking', 'paceNotes'],
  powerBhp: 310,
  silhouette: 'rally-hatch'
};

export const SURFACES = deepFreeze(surfaces);
export const WEATHER = deepFreeze([ridgeWeather]);
export const REGIONS = deepFreeze([kestrelRegion]);
export const STAGES = deepFreeze([kestrelStage]);
export const CARS = deepFreeze([cairnR4]);

export const RIDGE_WEATHER = WEATHER[0];
export const KESTREL_RIDGE = REGIONS[0];
export const KESTREL_REGION = KESTREL_RIDGE;
export const KESTREL_STAGE = STAGES[0];
export const CAIRN_R4 = CARS[0];

export const CATALOG = deepFreeze({
  surfaces: SURFACES,
  weather: WEATHER,
  regions: REGIONS,
  stages: STAGES,
  cars: CARS
});

export const CONTENT = CATALOG;

const isCatalogObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const list = (catalog, key) => Array.isArray(catalog?.[key]) ? catalog[key] : [];

export function validateCatalog(catalog) {
  if (!isCatalogObject(catalog)) return ['catalog must be an object'];
  const errors = [];
  const surfaces = list(catalog, 'surfaces');
  const weather = list(catalog, 'weather');
  const regions = list(catalog, 'regions');
  const stages = list(catalog, 'stages');
  const cars = list(catalog, 'cars');
  for (const [key, entries] of [['surfaces', surfaces], ['weather', weather], ['regions', regions], ['stages', stages], ['cars', cars]]) {
    if (!Array.isArray(catalog[key]) || entries.length === 0) errors.push(`catalog.${key} must be a non-empty array`);
  }

  const collectIds = (entries, label) => {
    const ids = new Set();
    entries.forEach((entry, index) => {
      if (!idPattern.test(entry?.id || '')) errors.push(`${label}[${index}].id must be a kebab-case id`);
      else if (ids.has(entry.id)) errors.push(`${label} contains duplicate id ${entry.id}`);
      else ids.add(entry.id);
    });
    return ids;
  };
  const surfaceIds = collectIds(surfaces, 'surfaces');
  const weatherIds = collectIds(weather, 'weather');
  const regionIds = collectIds(regions, 'regions');
  const stageIds = collectIds(stages, 'stages');
  collectIds(cars, 'cars');

  weather.forEach((entry, index) => {
    for (const error of validateWeatherSpec(entry)) errors.push(`weather[${index}]: ${error}`);
  });
  regions.forEach((entry, index) => {
    for (const error of validateRegionSpec(entry)) errors.push(`regions[${index}]: ${error}`);
    for (const stageId of entry?.stageIds || []) if (!stageIds.has(stageId)) errors.push(`region ${entry.id || index} references missing stage ${stageId}`);
    for (const weatherId of entry?.weatherIds || []) if (!weatherIds.has(weatherId)) errors.push(`region ${entry.id || index} references missing weather ${weatherId}`);
  });
  stages.forEach((entry, index) => {
    for (const error of validateStageSpec(entry, surfaceIds)) errors.push(`stages[${index}]: ${error}`);
    if (!regionIds.has(entry?.regionId)) errors.push(`stage ${entry.id || index} references missing region ${entry?.regionId}`);
    for (const surface of entry?.segments || []) if (!surfaceIds.has(surface.surface)) errors.push(`stage ${entry.id || index} references missing surface ${surface.surface}`);
    const region = regions.find(candidate => candidate.id === entry?.regionId);
    if (region) for (const landmarkId of entry.landmarkIds || []) if (!region.sceneryKit.includes(landmarkId)) errors.push(`stage ${entry.id || index} references missing landmark ${landmarkId} in region ${region.id}`);
  });
  stages.forEach(stage => {
    for (const region of regions) if (region.stageIds.includes(stage.id) && region.id !== stage.regionId) errors.push(`stage ${stage.id} is assigned to the wrong region ${region.id}`);
  });
  cars.forEach((entry, index) => {
    for (const error of validateCarSpec(entry)) errors.push(`cars[${index}]: ${error}`);
  });
  return errors;
}
