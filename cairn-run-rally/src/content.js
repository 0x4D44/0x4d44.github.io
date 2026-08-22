import {
  validateCarSpec,
  validateChampionshipSpec,
  validateRivalSpec,
  validateRegionSpec,
  validateStageSpec,
  validateWeatherSpec
} from './contracts.js';
import {
  EXPANSION_CARS,
  EXPANSION_REGIONS,
  EXPANSION_STAGES,
  EXPANSION_SURFACES,
  EXPANSION_WEATHER
} from './content-expansion.js';

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
  expectedDurationSeconds: [280, 450],
  landmarkIds: ['stone-wall', 'quarry', 'moor', 'bridge', 'pine', 'finish-gate'],
  hazardPlan: {
    seed: 17,
    sampleStart: 18,
    sampleEndMargin: 18,
    sampleStep: 7,
    skipSeed: 92821,
    skipThreshold: 0.42,
    sideSeed: 31337,
    sideSalt: 9,
    offsetSeed: 7717,
    offsetSalt: 3,
    typeSeed: 17713,
    typeSalt: 31,
    minOffsetM: 3.2,
    offsetJitterM: 8.5,
    rockThreshold: 0.87,
    treeThreshold: 0.62,
    exclusions: [[0, 95], [1760, 1980], [4020, 4255], [5280, 5410]]
  },
  barrierPlan: [
    { type: 'wall', startM: 1640, endM: 1800, stepM: 5, side: -1, offsetM: 2.15, radiusM: 0.62, yOffsetM: 0.12 },
    { type: 'barrier', centerM: 1815, count: 9, spacingM: 12, side: -1, offsetM: 2.6, radiusM: 0.72, yOffsetM: 0.12 },
    { type: 'barrier', centerM: 4110, count: 9, spacingM: 12, side: 1, offsetM: 2.6, radiusM: 0.72, yOffsetM: 0.12 },
    { type: 'bridge-rail', startM: 3950, endM: 4075, stepM: 7, bothSides: true, offsetM: 0.45, radiusM: 0.48, yOffsetM: 0.12 }
  ],
  routeIdentity: {
    tags: ['moorland', 'stone', 'bridge', 'damp-gravel'],
    opening: 'A damp moor launch climbs from the stone wall toward the first ridge crest.',
    signatures: ['quarry hairpin', 'bridge hairpin', 'ridge crest']
  },
  signatureSequences: [
    { id: 'quarry-hairpin', name: 'Quarry hairpin', startM: 1640, endM: 2140, tags: ['quarry', 'hairpin'] },
    { id: 'moor-crest', name: 'Loose moor crest', startM: 2460, endM: 3100, tags: ['moor', 'crest'] },
    { id: 'bridge-hairpin', name: 'Bridge and hairpin', startM: 3950, endM: 4425, tags: ['bridge', 'hairpin'] }
  ],
  difficultyArc: [
    { startM: 0, endM: 1320, label: 'learn the rhythm', level: 1 },
    { startM: 1320, endM: 3770, label: 'commit over crests', level: 2 },
    { startM: 3770, endM: 5405, label: 'protect the finish', level: 3 }
  ],
  finishRun: { startM: 4845, endM: 5405 }
};

const auroraWeather = {
  id: 'aurora-clear',
  name: 'Aurora clear',
  visibilityM: 1450,
  gripScale: 1,
  precipitation: 'none',
  roadWetness: 0.04,
  wind: 0.16,
  timeOfDay: 'day'
};

const auroraRegion = {
  id: 'aurora-forest',
  name: 'Aurora Forest',
  country: 'Finland',
  stageIds: ['aurora-forest'],
  palette: { sky: '#1b3b52', terrain: '#304e3c', road: '#a88b68' },
  sceneryKit: [
    'spruce',
    'lake',
    'narrow-forest',
    'granite-outcrop',
    'jump-board',
    'timber-fence',
    'finish-gate'
  ],
  weatherIds: ['aurora-clear'],
  identityTags: ['lakeside', 'narrow-forest', 'compact-gravel', 'dense-conifers'],
  identity: {
    biome: 'lakeside narrow forest',
    terrain: 'fast compact gravel',
    foliage: 'dense spruce with birch clearings',
    routeCharacter: 'long sightlines that close into narrow commitment crests'
  }
};

const auroraSegments = [
  { name: 'Lakeside opening launch', lengthM: 240, curve: [0.0001, 0.0001], riseM: 2, widthM: 7.8, surface: 'compact', feature: 'opening' },
  { name: 'Lake mirror straight', lengthM: 280, curve: [0.0008, -0.0004], riseM: 3, widthM: 7.7, surface: 'compact', feature: 'lakeside' },
  { name: 'Spruce right six', lengthM: 320, curve: [0.0012, 0.0021], riseM: 7, widthM: 7.5, surface: 'compact', feature: null },
  { name: 'Long crest jump', lengthM: 240, curve: [-0.0002, 0.0005], riseM: 21, widthM: 7.4, surface: 'compact', feature: 'jump' },
  { name: 'Landing compression', lengthM: 200, curve: [-0.0018, -0.0025], riseM: -14, widthM: 7.2, surface: 'compact', feature: 'dip' },
  { name: 'Narrow spruce corridor', lengthM: 250, curve: [-0.0042, -0.0022], riseM: 4, widthM: 6.5, surface: 'compact', feature: 'narrow' },
  { name: 'Lakeside right five', lengthM: 300, curve: [0.0038, 0.0027], riseM: 1, widthM: 7.1, surface: 'compact', feature: 'lakeside' },
  { name: 'Commitment straight', lengthM: 360, curve: [0.0003, -0.0003], riseM: 9, widthM: 7.6, surface: 'compact', feature: 'straight' },
  { name: 'Pine crest jump', lengthM: 320, curve: [-0.0008, 0.0011], riseM: 23, widthM: 7.2, surface: 'compact', feature: 'jump' },
  { name: 'Kallio sweep left five', lengthM: 340, curve: [-0.0022, -0.003], riseM: -11, widthM: 7, surface: 'compact', feature: null },
  { name: 'Narrow forest flick', lengthM: 180, curve: [0.0064, 0.0039], riseM: 0, widthM: 6.4, surface: 'compact', feature: 'narrow' },
  { name: 'Rock cut braking zone', lengthM: 130, curve: [-0.001, 0.0008], riseM: -2, widthM: 6.8, surface: 'compact', feature: 'braking' },
  { name: 'Lake hairpin right', lengthM: 150, curve: [0.019, 0.018], riseM: -4, widthM: 7.4, surface: 'compact', feature: 'hairpin' },
  { name: 'Spruce climb crest', lengthM: 280, curve: [0.0004, 0.0017], riseM: 18, widthM: 7, surface: 'compact', feature: 'crest' },
  { name: 'Blind crest left six', lengthM: 320, curve: [-0.0013, -0.0007], riseM: 24, widthM: 7.1, surface: 'compact', feature: 'jump' },
  { name: 'Landing chute dip', lengthM: 230, curve: [0.0009, -0.0012], riseM: -21, widthM: 6.9, surface: 'compact', feature: 'dip' },
  { name: 'Lakeside sprint', lengthM: 380, curve: [0.0001, 0.0002], riseM: -4, widthM: 7.7, surface: 'compact', feature: 'lakeside' },
  { name: 'Right six into left five', lengthM: 300, curve: [0.0034, 0.0012], riseM: 5, widthM: 7.2, surface: 'compact', feature: 'sequence' },
  { name: 'Culvert jump', lengthM: 260, curve: [-0.0005, 0.0008], riseM: 18, widthM: 7, surface: 'compact', feature: 'jump' },
  { name: 'Forest shadow bend', lengthM: 320, curve: [-0.0036, -0.002], riseM: -9, widthM: 6.8, surface: 'compact', feature: 'narrow' },
  { name: 'Long lake straight', lengthM: 450, curve: [0.0001, -0.0002], riseM: -2, widthM: 7.8, surface: 'compact', feature: 'lakeside' },
  { name: 'Last crest', lengthM: 250, curve: [-0.002, -0.0004], riseM: 20, widthM: 7.3, surface: 'compact', feature: 'crest' },
  { name: 'Finish approach', lengthM: 300, curve: [0.0031, 0.0015], riseM: -5, widthM: 7.4, surface: 'compact', feature: null },
  { name: 'Finish run', lengthM: 360, curve: [0, 0], riseM: -7, widthM: 8, surface: 'compact', feature: 'finish' }
];

const auroraNotes = [
  { atM: 240, icon: 'R6', main: 'RIGHT SIX', detail: 'LAKESIDE', phrase: 'right six, lakeside, two hundred and eighty', id: 0 },
  { atM: 560, icon: 'R6', main: 'RIGHT SIX', detail: 'INTO CREST', phrase: 'right six, into long crest', id: 1 },
  { atM: 820, icon: '▲', main: 'LONG CREST', detail: 'JUMP', phrase: 'long crest, jump, keep it straight', id: 2 },
  { atM: 1080, icon: '▽', main: 'LANDING', detail: 'NARROW', phrase: 'landing, narrow forest, eighty', id: 3 },
  { atM: 1390, icon: 'L5', main: 'LEFT FIVE', detail: 'LAKE EDGE', phrase: 'left five, lake edge, three hundred', id: 4 },
  { atM: 1770, icon: 'R5', main: 'RIGHT FIVE', detail: 'OVER CREST', phrase: 'right five, over crest, four hundred', id: 5 },
  { atM: 2190, icon: '▲', main: 'FLAT CREST', detail: 'INTO JUMP', phrase: 'flat crest, into jump', id: 6 },
  { atM: 2510, icon: 'L5', main: 'LEFT FIVE', detail: 'KALLIO SWEEP', phrase: 'left five, Kallio sweep, long', id: 7 },
  { atM: 2860, icon: 'L3', main: 'LEFT THREE', detail: 'NARROWS', phrase: 'left three, narrows in the forest', id: 8 },
  { atM: 3160, icon: '!', main: 'CAUTION', detail: 'ROCK CUT BRAKING', phrase: 'caution, rock cut, heavy braking', id: 9 },
  { atM: 3310, icon: 'HR', main: 'HAIRPIN RIGHT', detail: 'LAKESIDE', phrase: 'hairpin right, lakeside, do not cut', id: 10 },
  { atM: 3590, icon: '▲', main: 'CREST', detail: 'BLIND', phrase: 'crest, blind, into left six', id: 11 },
  { atM: 3910, icon: '▲', main: 'LEFT SIX', detail: 'JUMP', phrase: 'left six, jump, commit', id: 12 },
  { atM: 4140, icon: '▽', main: 'DIP', detail: 'NARROW EXIT', phrase: 'dip, narrow exit, keep left', id: 13 },
  { atM: 4520, icon: 'R6', main: 'RIGHT SIX', detail: 'LAKE STRAIGHT', phrase: 'right six, lake straight, four hundred', id: 14 },
  { atM: 4820, icon: 'L5', main: 'LEFT FIVE', detail: 'INTO JUMP', phrase: 'left five, into culvert jump', id: 15 },
  { atM: 5080, icon: '▲', main: 'JUMP', detail: 'FOREST SHADOW', phrase: 'jump, forest shadow, do not cut', id: 16 },
  { atM: 5400, icon: 'L4', main: 'LEFT FOUR', detail: 'NARROW', phrase: 'left four, narrow trees', id: 17 },
  { atM: 5850, icon: '▲', main: 'LAST CREST', detail: 'INTO FINISH', phrase: 'last crest, into finish approach', id: 18 },
  { atM: 6400, icon: 'R5', main: 'RIGHT FIVE', detail: 'TO FINISH', phrase: 'right five, three hundred to finish', id: 19 },
  { atM: 6760, icon: '🏁', main: 'FINISH', detail: 'LAKE GATE', phrase: 'finish, through the lake gate', id: 20 }
];

const auroraStage = {
  id: 'aurora-forest',
  regionId: 'aurora-forest',
  name: 'Aurora Forest',
  segments: auroraSegments,
  notes: auroraNotes,
  splits: [2200, 4400, 6760],
  expectedDurationSeconds: [290, 450],
  landmarkIds: ['lake', 'narrow-forest', 'granite-outcrop', 'jump-board', 'timber-fence', 'finish-gate'],
  hazardPlan: {
    seed: 811,
    sampleStart: 18,
    sampleEndMargin: 18,
    sampleStep: 6,
    skipSeed: 48317,
    skipThreshold: 0.48,
    sideSeed: 67123,
    sideSalt: 41,
    offsetSeed: 11939,
    offsetSalt: 7,
    typeSeed: 29791,
    typeSalt: 53,
    minOffsetM: 3.8,
    offsetJitterM: 6.8,
    rockThreshold: 0.78,
    treeThreshold: 0.44,
    exclusions: [[0, 120], [760, 930], [2450, 2640], [3260, 3450], [4970, 5180], [6400, 6760]]
  },
  barrierPlan: [
    { type: 'timber-fence', startM: 1360, endM: 1530, stepM: 6, side: 1, offsetM: 1.9, radiusM: 0.55, yOffsetM: 0.1 },
    { type: 'lake-fence', centerM: 1770, count: 11, spacingM: 10, side: -1, offsetM: 2.1, radiusM: 0.55, yOffsetM: 0.1 },
    { type: 'spruce-rail', startM: 3150, endM: 3330, stepM: 9, bothSides: true, offsetM: 2.6, radiusM: 0.44, yOffsetM: 0.1 }
  ],
  routeIdentity: {
    tags: ['lakeside', 'narrow-forest', 'compact-gravel', 'dense-conifers'],
    opening: 'The opening runs beside a cold lake before the spruce walls close in.',
    signatures: ['long crest jump', 'Kallio lake sweep', 'culvert jump and shadow bend']
  },
  identityTags: ['lakeside', 'narrow-forest', 'compact-gravel'],
  signatureSequences: [
    { id: 'lake-crest-jump', name: 'Lake to long crest jump', startM: 520, endM: 1530, tags: ['lakeside', 'crest', 'jump'] },
    { id: 'kallio-commitment', name: 'Kallio sweep and narrow forest', startM: 2190, endM: 3160, tags: ['fast', 'narrow-forest', 'commitment'] },
    { id: 'lake-hairpin-landing', name: 'Lake hairpin to blind landing', startM: 3310, endM: 4520, tags: ['lakeside', 'hairpin', 'jump'] },
    { id: 'culvert-finish', name: 'Culvert jump to last crest', startM: 4820, endM: 6400, tags: ['jump', 'narrow-forest', 'finish'] }
  ],
  difficultyArc: [
    { startM: 0, endM: 1280, label: 'learn the lake rhythm', level: 1 },
    { startM: 1280, endM: 3160, label: 'commit between the trees', level: 2 },
    { startM: 3160, endM: 5080, label: 'protect the landings', level: 3 },
    { startM: 5080, endM: 6760, label: 'hold nerve to the gate', level: 4 }
  ],
  finishRun: { startM: 5850, endM: 6760 }
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
  silhouette: 'rally-hatch',
  benchmarkScale: 1
};

const lumenF2 = {
  id: 'lumen-f2',
  name: 'Lumen F2',
  era: 1996,
  drive: 'fwd',
  massKg: 925,
  yawInertiaKgM2: 1090,
  wheelbaseM: 2.38,
  trackM: 1.47,
  frontWeightFraction: 0.63,
  rideHeightM: 0.48,
  dragCoefficient: 0.39,
  torqueCurve: [[1800, 122], [3200, 156], [5200, 149], [6800, 116]],
  gearRatios: [3.54, 2.12, 1.46, 1.11, 0.89],
  finalDrive: 4.35,
  wheelRadiusM: 0.31,
  brakeForceN: 8600,
  brakeBiasFront: 0.68,
  steeringLockRad: 0.68,
  tyreGrip: { front: 1.05, rear: 0.89 },
  suspension: { travelM: 0.2, springHz: 2.1, dampingRatio: 0.66 },
  durability: { engine: 0.66, steering: 0.68, suspension: 0.7, brakes: 0.58, body: 0.74 },
  assists: ['automatic', 'stability', 'braking', 'paceNotes'],
  powerBhp: 152,
  silhouette: 'compact-hatch',
  benchmarkScale: 1.14
};

const difficulties = [
  { id: 'easy', name: 'Sunday drive', rivalPace: 1.08 },
  { id: 'normal', name: 'Club pace', rivalPace: 1 },
  { id: 'hard', name: 'Works attack', rivalPace: 0.94 }
];

const rivals = [
  {
    id: 'mara-vale',
    name: 'Mara Vale',
    seed: 1701,
    skill: 0.86,
    consistency: 0.94,
    damageRisk: 0.025,
    surfaceBias: { compact: 0.04, loose: -0.01 }
  },
  {
    id: 'orin-shaw',
    name: 'Orin Shaw',
    seed: 1702,
    skill: 0.73,
    consistency: 0.81,
    damageRisk: 0.06,
    surfaceBias: { compact: -0.01, loose: 0.05 }
  },
  {
    id: 'vesper-kade',
    name: 'Vesper Kade',
    seed: 1703,
    skill: 0.64,
    consistency: 0.72,
    damageRisk: 0.12,
    surfaceBias: { compact: 0.02, loose: -0.06 }
  },
  {
    id: 'tomas-rune',
    name: 'Tomas Rune',
    seed: 1704,
    skill: 0.56,
    consistency: 0.89,
    damageRisk: 0.085,
    surfaceBias: { compact: -0.05, loose: 0.08 }
  },
  {
    id: 'elise-north',
    name: 'Elise North',
    seed: 1705,
    skill: 0.47,
    consistency: 0.63,
    damageRisk: 0.18,
    surfaceBias: { compact: 0.07, loose: -0.09 }
  }
];

const worldChampionship = {
  id: 'cairn-world-championship',
  name: 'Cairn World Championship',
  points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  rivalIds: rivals.map(rival => rival.id),
  events: [
    {
      id: 'kestrel-ridge-round',
      stageId: kestrelStage.id,
      weatherId: ridgeWeather.id,
      serviceMinutes: 60,
      durationSeconds: kestrelStage.expectedDurationSeconds,
      referenceTimeSeconds: 322.61
    },
    {
      id: 'aurora-forest-round',
      stageId: auroraStage.id,
      weatherId: auroraWeather.id,
      serviceMinutes: 60,
      durationSeconds: auroraStage.expectedDurationSeconds,
      referenceTimeSeconds: 330
    },
    ...EXPANSION_STAGES.map((stage, index) => ({
      id: `${stage.id}-round`,
      stageId: stage.id,
      weatherId: EXPANSION_WEATHER[index].id,
      serviceMinutes: 60,
      durationSeconds: stage.expectedDurationSeconds,
      referenceTimeSeconds: [450, 480, 420, 500][index]
    }))
  ]
};

export const SURFACES = deepFreeze([...surfaces, ...EXPANSION_SURFACES]);
export const WEATHER = deepFreeze([ridgeWeather, auroraWeather, ...EXPANSION_WEATHER]);
export const REGIONS = deepFreeze([kestrelRegion, auroraRegion, ...EXPANSION_REGIONS]);
export const STAGES = deepFreeze([kestrelStage, auroraStage, ...EXPANSION_STAGES]);
export const CARS = deepFreeze([cairnR4, lumenF2, ...EXPANSION_CARS]);

export const RIDGE_WEATHER = WEATHER[0];
export const KESTREL_RIDGE = REGIONS[0];
export const KESTREL_REGION = KESTREL_RIDGE;
export const KESTREL_STAGE = STAGES[0];
export const CAIRN_R4 = CARS[0];
export const AURORA_WEATHER = WEATHER[1];
export const AURORA_FOREST = REGIONS[1];
export const AURORA_REGION = AURORA_FOREST;
export const AURORA_STAGE = STAGES[1];
export const LUMEN_F2 = CARS[1];
export const DIFFICULTIES = deepFreeze(difficulties);
export const RIVALS = deepFreeze(rivals);
export const WORLD_CHAMPIONSHIP = deepFreeze(worldChampionship);
export const CHAMPIONSHIPS = deepFreeze([WORLD_CHAMPIONSHIP]);

export const CATALOG = deepFreeze({
  surfaces: SURFACES,
  weather: WEATHER,
  regions: REGIONS,
  stages: STAGES,
  cars: CARS,
  difficulties: DIFFICULTIES,
  rivals: RIVALS,
  championships: CHAMPIONSHIPS
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
  const difficulties = list(catalog, 'difficulties');
  const rivals = list(catalog, 'rivals');
  const championships = list(catalog, 'championships');
  for (const [key, entries] of [['surfaces', surfaces], ['weather', weather], ['regions', regions], ['stages', stages], ['cars', cars], ['difficulties', difficulties], ['rivals', rivals], ['championships', championships]]) {
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
  const difficultyIds = collectIds(difficulties, 'difficulties');
  const rivalIds = collectIds(rivals, 'rivals');
  collectIds(championships, 'championships');

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
  difficulties.forEach((entry, index) => {
    if (typeof entry?.name !== 'string' || entry.name.trim() === '') errors.push(`difficulties[${index}].name must be a non-empty string`);
    if (!Number.isFinite(entry?.rivalPace) || entry.rivalPace <= 0) errors.push(`difficulties[${index}].rivalPace must be positive and finite`);
  });
  rivals.forEach((entry, index) => {
    for (const error of validateRivalSpec(entry)) errors.push(`rivals[${index}]: ${error}`);
  });
  championships.forEach((entry, index) => {
    for (const error of validateChampionshipSpec(entry)) errors.push(`championships[${index}]: ${error}`);
    for (const rivalId of entry?.rivalIds || []) if (!rivalIds.has(rivalId)) errors.push(`championship ${entry.id || index} references missing rival ${rivalId}`);
    if (!Array.isArray(entry?.rivalIds) || entry.rivalIds.length < 1) errors.push(`championship ${entry.id || index} must reference at least one rival`);
    for (const [eventIndex, event] of (entry?.events || []).entries()) {
      if (!stageIds.has(event?.stageId)) errors.push(`championship ${entry.id || index} event ${eventIndex} references missing stage ${event?.stageId}`);
      if (!weatherIds.has(event?.weatherId)) errors.push(`championship ${entry.id || index} event ${eventIndex} references missing weather ${event?.weatherId}`);
      if (event?.serviceMinutes !== 60) errors.push(`championship ${entry.id || index} event ${eventIndex} must allow 60 service minutes`);
      for (const rivalId of event?.rivalIds || []) if (!rivalIds.has(rivalId)) errors.push(`championship ${entry.id || index} event ${eventIndex} references missing rival ${rivalId}`);
    }
  });
  if (difficulties.length && !difficultyIds.has('normal')) errors.push('difficulties must include normal');
  return errors;
}
