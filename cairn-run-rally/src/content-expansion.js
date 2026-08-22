const deepFreeze = value => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const surface = (id, name, values) => ({ id, name, ...values });

// These surfaces intentionally stay in the same data shape as content.js. The
// parent catalog can append them without teaching the renderer about a new type.
const surfaces = [
  surface('tarmac', 'Mountain tarmac', {
    grip: 1.04, friction: 1.04, rollingResistance: 92, roughness: 0.08, sink: 0.01,
    particle: 'rubber-dust', audio: 'tarmac'
  }),
  surface('wet-tarmac', 'Storm-wet tarmac', {
    grip: 0.78, friction: 0.78, rollingResistance: 118, roughness: 0.13, sink: 0.03,
    particle: 'spray', audio: 'wet-tarmac'
  }),
  surface('snow', 'Packed snow', {
    grip: 0.52, friction: 0.52, rollingResistance: 360, roughness: 0.46, sink: 0.22,
    particle: 'snow', audio: 'snow'
  }),
  surface('ice', 'Polished ice', {
    grip: 0.27, friction: 0.27, rollingResistance: 86, roughness: 0.05, sink: 0.01,
    particle: 'ice-chips', audio: 'ice'
  }),
  surface('mud', 'Coastal mud', {
    grip: 0.42, friction: 0.42, rollingResistance: 620, roughness: 0.62, sink: 0.4,
    particle: 'mud', audio: 'mud'
  }),
  surface('desert-gravel', 'Sun-baked desert gravel', {
    grip: 0.73, friction: 0.73, rollingResistance: 205, roughness: 0.43, sink: 0.2,
    particle: 'sand', audio: 'desert-gravel'
  })
];

const weather = [
  {
    id: 'rift-valley-dry',
    name: 'Rift Valley dry heat',
    visibilityM: 2100,
    gripScale: 1.02,
    precipitation: 'none',
    roadWetness: 0.01,
    wind: 0.52,
    timeOfDay: 'day'
  },
  {
    id: 'kurotake-rain',
    name: 'Kurotake dusk rain',
    visibilityM: 620,
    gripScale: 0.83,
    precipitation: 'storm',
    roadWetness: 0.88,
    wind: 0.91,
    timeOfDay: 'dusk'
  },
  {
    id: 'costa-brava-clear',
    name: 'Costa Brava clear air',
    visibilityM: 760,
    gripScale: 1.01,
    precipitation: 'none',
    roadWetness: 0.02,
    wind: 0.32,
    timeOfDay: 'day'
  },
  {
    id: 'wattle-creek-storm',
    name: 'Wattle Creek late storm',
    visibilityM: 1750,
    gripScale: 0.91,
    precipitation: 'storm',
    roadWetness: 0.18,
    wind: 0.8,
    timeOfDay: 'dusk'
  }
];

const segment = (name, lengthM, curve, riseM, widthM, surfaceId, feature = null) => ({
  name,
  lengthM,
  curve,
  riseM,
  widthM,
  surface: surfaceId,
  feature
});

const notes = (stageId, rows) => rows.map(([atM, icon, main, detail, phrase], index) => ({
  atM,
  icon,
  main,
  detail,
  phrase,
  id: `${stageId}-note-${String(index + 1).padStart(2, '0')}`
}));

const stage = ({ id, regionId, name, segments, noteRows, splitA, splitB, expectedDurationSeconds, landmarkIds, hazardPlan, barrierPlan, routeIdentity, identityTags, signatureSequences, difficultyArc, finishRun }) => {
  const lengthM = segments.reduce((sum, item) => sum + item.lengthM, 0);
  return {
    id,
    regionId,
    name,
    segments,
    notes: notes(id, noteRows),
    splits: [splitA, splitB, lengthM],
    expectedDurationSeconds,
    landmarkIds,
    hazardPlan,
    barrierPlan,
    routeIdentity,
    identityTags,
    signatureSequences,
    difficultyArc,
    finishRun
  };
};

const sunspireSegments = [
  segment('Savannah launch straight', 320, [0, 0.0002], 35, 7.4, 'desert-gravel', 'opening'),
  segment('Right six acacia shelf', 380, [0.0012, 0.0016], 18, 7.1, 'desert-gravel'),
  segment('Washboard crest into left five', 270, [-0.0004, -0.0012], 27, 6.9, 'desert-gravel', 'crest'),
  segment('Left five over the Rift', 330, [-0.002, -0.0028], -8, 6.8, 'desert-gravel'),
  segment('Water splash descent', 290, [0, 0.0005], -31, 7.2, 'mud', 'dip'),
  segment('Rough gravel right four', 260, [0.004, 0.0055], -5, 6.7, 'desert-gravel'),
  segment('Washboard switchback approach', 340, [-0.0005, 0.0001], 14, 6.9, 'desert-gravel'),
  segment('Cattle track hairpin left', 280, [-0.021, -0.019], 4, 7.5, 'desert-gravel', 'hairpin'),
  segment('Savannah exit climb', 310, [0, -0.0003], 39, 7.1, 'desert-gravel'),
  segment('Right three tightens', 260, [0.006, 0.008], 12, 6.6, 'tarmac'),
  segment('Savannah straight', 350, [0.0001, -0.0002], 2, 7.3, 'desert-gravel', 'straight'),
  segment('Left four over washboard', 300, [-0.0032, -0.0045], -10, 6.8, 'desert-gravel'),
  segment('Water splash braking zone', 330, [0, 0.0004], -17, 6.6, 'mud', 'braking'),
  segment('Right five crests the escarpment', 290, [0.0024, 0.0031], 29, 6.9, 'desert-gravel', 'crest'),
  segment('Creek dip', 310, [-0.0003, 0.0004], -25, 6.7, 'mud', 'dip'),
  segment('Left three Rift wall', 280, [-0.006, -0.0068], 6, 6.5, 'desert-gravel'),
  segment('Washboard commitment run', 340, [0.0002, 0.0001], 3, 7.2, 'desert-gravel', 'straight'),
  segment('Final right four', 320, [0.0034, 0.0041], -9, 6.9, 'desert-gravel'),
  segment('Acacia left five', 360, [-0.0021, -0.0026], -21, 7.1, 'desert-gravel'),
  segment('Finish through the savannah', 380, [0, 0], -16, 7.6, 'desert-gravel', 'finish')
];

const sunspireStage = stage({
  id: 'rift-valley-run',
  regionId: 'rift-valley-run',
  name: 'Rift Valley Run',
  segments: sunspireSegments,
  noteRows: [
    [320, 'R6', 'RIGHT SIX', 'ACACIA SHELF', 'right six, acacia shelf, three hundred and eighty'],
    [700, '▲', 'WASHBOARD CREST', 'INTO LEFT FIVE', 'washboard crest, into left five, do not cut'],
    [970, 'L5', 'LEFT FIVE', 'RIFT EDGE', 'left five, Rift edge outside, eighty'],
    [1300, '▽', 'WATER SPLASH', 'DRY CREEK', 'water splash, dry creek, keep the car straight'],
    [1590, 'R4', 'RIGHT FOUR', 'ROUGH GRAVEL', 'right four, rough gravel, one hundred'],
    [1850, 'L4', 'LEFT FOUR', 'CLIMB', 'left four, savannah climb, stay tight'],
    [2190, 'HR', 'HAIRPIN LEFT', 'CATTLE TRACK', 'hairpin left, cattle track, dont cut'],
    [2470, '▲', 'CREST', 'INTO RIGHT THREE', 'crest, into right three, thirty'],
    [2780, 'R3', 'RIGHT THREE', 'TIGHTENS', 'right three, tightens, late apex'],
    [3040, '!', 'CAUTION', 'WASHBOARD', 'caution, washboard, heavy braking'],
    [3390, 'L4', 'LEFT FOUR', 'OVER WATER', 'left four, over water splash, keep momentum'],
    [3690, 'R5', 'RIGHT FIVE', 'ESCARPMENT CREST', 'right five, escarpment crest, flat if clear'],
    [4020, '▽', 'DIP', 'CREEK CROSSING', 'dip, creek crossing, brake before the shade'],
    [4310, 'L3', 'LEFT THREE', 'RIFT WALL', 'left three, Rift wall, dont cut'],
    [4620, '▲', 'CREST', 'LONG RUN', 'crest, long run, hold the line'],
    [4900, 'R4', 'RIGHT FOUR', 'ROUGH GRAVEL', 'right four, rough gravel, two hundred'],
    [5240, 'L5', 'LEFT FIVE', 'ACACIA', 'left five, acacia, opens on exit'],
    [5560, 'R4', 'RIGHT FOUR', 'DOWNHILL', 'right four, downhill, brake in a straight line'],
    [5920, 'L5', 'LEFT FIVE', 'TO SAVANNAH', 'left five, to savannah, three hundred and eighty'],
    [6280, '🏁', 'FINISH', 'RIFT GATE', 'finish, Rift gate, through the acacias']
  ],
  splitA: 1850,
  splitB: 4020,
  expectedDurationSeconds: [370, 590],
  landmarkIds: ['savannah', 'acacia', 'water-splash', 'washboard', 'rift-escarpment', 'finish-gate'],
  hazardPlan: {
    seed: 2301, sampleStart: 22, sampleEndMargin: 20, sampleStep: 8, skipSeed: 41011, skipThreshold: 0.4,
    sideSeed: 51221, sideSalt: 17, offsetSeed: 72131, offsetSalt: 5, typeSeed: 91273, typeSalt: 23,
    minOffsetM: 3.4, offsetJitterM: 7.2, rockThreshold: 0.64, treeThreshold: 0.08,
    exclusions: [[0, 120], [2000, 2290], [4000, 4200], [6150, 6300]]
  },
  barrierPlan: [
    { type: 'washboard-marker', startM: 1120, endM: 1280, stepM: 10, side: -1, offsetM: 2.1, radiusM: 0.58, yOffsetM: 0.12 },
    { type: 'water-post', centerM: 2165, count: 9, spacingM: 11, side: 1, offsetM: 2.3, radiusM: 0.44, yOffsetM: 0.1 },
    { type: 'rift-gate-post', distancesM: [4010, 4030, 4050], bothSides: true, offsetM: 2.05, radiusM: 0.46, yOffsetM: 0.12 }
  ],
  routeIdentity: {
    tags: ['rough-gravel', 'savannah', 'water-splash', 'washboard'],
    opening: 'A dry gravel launch cuts across open savannah toward the Rift escarpment.',
    signatures: ['cattle-track hairpin', 'washboard water crossing', 'acacia descent to the gate']
  },
  identityTags: ['rough-gravel', 'savannah', 'water-splash', 'washboard'],
  signatureSequences: [
    { id: 'rift-cattle-track', name: 'Water splash to cattle-track hairpin', startM: 1300, endM: 2470, tags: ['splash', 'washboard', 'hairpin'] },
    { id: 'rift-escarpment', name: 'Washboard crossing to Rift crest', startM: 3040, endM: 4310, tags: ['braking', 'crest', 'savannah'] },
    { id: 'rift-acacia-gate', name: 'Acacia run to the Rift gate', startM: 4900, endM: 6300, tags: ['gravel', 'downhill', 'finish'] }
  ],
  difficultyArc: [
    { startM: 0, endM: 1300, label: 'read the open savannah', level: 1 },
    { startM: 1300, endM: 3040, label: 'place the car through water', level: 2 },
    { startM: 3040, endM: 4900, label: 'protect the washboard line', level: 3 },
    { startM: 4900, endM: 6300, label: 'carry speed to the acacias', level: 4 }
  ],
  finishRun: { startM: 5920, endM: 6300 }
});

const blackwaterSegments = [
  segment('Kurotake launch', 260, [0, 0.0002], 6, 7.8, 'wet-tarmac', 'opening'),
  segment('Right five retaining wall', 300, [0.002, 0.0028], 4, 7.2, 'wet-tarmac'),
  segment('Autumn spray crest', 340, [0, 0.0006], 18, 7, 'wet-tarmac', 'crest'),
  segment('Left four tunnel dip', 280, [-0.0036, -0.0045], -14, 6.8, 'wet-tarmac', 'dip'),
  segment('Cedar tunnel straight', 320, [0, 0], -2, 7.4, 'wet-tarmac', 'straight'),
  segment('Right three tightens', 250, [0.0055, 0.0071], 8, 6.6, 'wet-tarmac'),
  segment('Rain channel descent', 300, [-0.0005, 0.0002], -22, 6.9, 'wet-tarmac'),
  segment('Hairpin right mountain shrine', 330, [0.020, 0.018], -3, 7.4, 'wet-tarmac', 'hairpin'),
  segment('Shrine exit climb', 280, [0, 0.0004], 24, 7.1, 'wet-tarmac'),
  segment('Left five maple tunnel', 300, [-0.0021, -0.0028], 12, 7, 'wet-tarmac'),
  segment('Cattle grid braking', 270, [0, 0], -11, 6.7, 'mud', 'braking'),
  segment('Right four narrows', 320, [0.0038, 0.005], 5, 6.5, 'wet-tarmac'),
  segment('Kurotake tunnel straight', 260, [0.0001, -0.0002], 1, 7.6, 'wet-tarmac', 'straight'),
  segment('Left three retaining wall', 350, [-0.006, -0.0068], -18, 6.5, 'wet-tarmac'),
  segment('Dusk rain crest', 290, [0.0002, -0.0003], 25, 6.8, 'wet-tarmac', 'crest'),
  segment('Mud verge chute', 310, [0.001, 0.0004], -29, 6.7, 'mud', 'dip'),
  segment('Right six opens', 280, [0.0015, 0.001], -3, 7.2, 'wet-tarmac'),
  segment('Left four retaining wall', 330, [-0.0032, -0.004], 7, 6.8, 'wet-tarmac'),
  segment('Pass gate sprint', 250, [0, 0.0001], -4, 7.5, 'wet-tarmac'),
  segment('Finish under the maples', 340, [0, 0], -8, 7.8, 'wet-tarmac', 'finish')
];

const blackwaterStage = stage({
  id: 'kurotake-pass',
  regionId: 'kurotake-pass',
  name: 'Kurotake Pass',
  segments: blackwaterSegments,
  noteRows: [
    [260, 'R5', 'RIGHT FIVE', 'RETAINING WALL', 'right five, retaining wall, wet tarmac'],
    [560, '▲', 'CREST', 'AUTUMN SPRAY', 'crest, autumn spray, keep the wheels straight'],
    [900, 'L4', 'LEFT FOUR', 'TUNNEL DIP', 'left four, tunnel dip, eighty'],
    [1180, '!', 'CAUTION', 'CEDAR TUNNEL', 'caution, cedar tunnel, keep tarmac'],
    [1500, 'R3', 'RIGHT THREE', 'TIGHTENS', 'right three, tightens, late brake'],
    [1750, '▽', 'DIP', 'RAIN CHANNEL', 'dip, rain channel, car goes light'],
    [2050, 'HR', 'HAIRPIN RIGHT', 'MOUNTAIN SHRINE', 'hairpin right, mountain shrine wall, dont cut'],
    [2380, 'L5', 'LEFT FIVE', 'MAPLE TUNNEL', 'left five, maple tunnel, opens'],
    [2660, '!', 'CAUTION', 'CATTLE GRID', 'caution, cattle grid, brake early'],
    [2960, 'R4', 'RIGHT FOUR', 'NARROWS', 'right four, narrows, hold the middle'],
    [3230, 'R6', 'RIGHT SIX', 'KUROTAKE TUNNEL', 'right six, Kurotake tunnel, flat'],
    [3550, 'L3', 'LEFT THREE', 'RETAINING WALL', 'left three, retaining wall, no cut'],
    [3810, '▲', 'CREST', 'DUSK RAIN', 'crest, dusk rain, settle the car'],
    [4160, '▽', 'DIP', 'MUD VERGE', 'dip, mud verge, traction limited'],
    [4450, 'R6', 'RIGHT SIX', 'OPENS', 'right six, opens, spray on exit'],
    [4760, 'L4', 'LEFT FOUR', 'WALL APPROACH', 'left four, wall approach, brake straight'],
    [5040, 'R5', 'RIGHT FIVE', 'PASS GATE', 'right five, pass gate, dont cut'],
    [5370, 'L4', 'LEFT FOUR', 'PAPER LANTERN', 'left four, paper lantern, hold line'],
    [5620, 'R6', 'RIGHT SIX', 'FINISH RUN', 'right six, finish run, three hundred'],
    [5925, '🏁', 'FINISH', 'KUROTAKE GATE', 'finish, Kurotake gate, through the spray']
  ],
  splitA: 1500,
  splitB: 3230,
  expectedDurationSeconds: [350, 650],
  landmarkIds: ['cedar-tunnel', 'retaining-wall', 'autumn-maple', 'mountain-stream', 'paper-lantern', 'pass-gate'],
  hazardPlan: {
    seed: 3407, sampleStart: 20, sampleEndMargin: 22, sampleStep: 7, skipSeed: 53017, skipThreshold: 0.35,
    sideSeed: 63127, sideSalt: 29, offsetSeed: 74137, offsetSalt: 11, typeSeed: 85147, typeSalt: 37,
    minOffsetM: 3.1, offsetJitterM: 7.8, rockThreshold: 0.9, treeThreshold: 0.2,
    exclusions: [[0, 100], [1900, 2200], [3150, 3370], [5700, 5960]]
  },
  barrierPlan: [
    { type: 'retaining-wall', startM: 430, endM: 700, stepM: 12, side: -1, offsetM: 2.05, radiusM: 0.56, yOffsetM: 0.1 },
    { type: 'shrine-post', centerM: 2050, count: 11, spacingM: 10, side: 1, offsetM: 2.25, radiusM: 0.42, yOffsetM: 0.12 },
    { type: 'tunnel-rail', anchorsM: [4460, 4510, 4560], bothSides: true, offsetM: 2.35, radiusM: 0.4, yOffsetM: 0.1 }
  ],
  routeIdentity: {
    tags: ['wet-tarmac', 'cedar-tunnels', 'retaining-walls', 'autumn-dusk'],
    opening: 'Dusk rain turns the narrow Kurotake tarmac glossy beneath cedar tunnels.',
    signatures: ['shrine hairpin', 'retaining wall and tunnel turn', 'maple spray run']
  },
  identityTags: ['wet-tarmac', 'cedar-tunnels', 'retaining-walls', 'autumn-dusk'],
  signatureSequences: [
    { id: 'kurotake-shrine', name: 'Rain channel to shrine hairpin', startM: 1180, endM: 2380, tags: ['wet', 'descent', 'hairpin'] },
    { id: 'kurotake-tunnel', name: 'Cattle grid to cedar tunnel', startM: 2660, endM: 4160, tags: ['braking', 'tunnel', 'wall'] },
    { id: 'kurotake-maple', name: 'Mud verge to maple gate', startM: 4160, endM: 5960, tags: ['mud', 'spray', 'finish'] }
  ],
  difficultyArc: [
    { startM: 0, endM: 1180, label: 'learn the wet retaining wall', level: 1 },
    { startM: 1180, endM: 2660, label: 'keep traction through the shrine', level: 2 },
    { startM: 2660, endM: 4160, label: 'read the tunnel and autumn camber', level: 3 },
    { startM: 4160, endM: 5960, label: 'survive dusk rain to the pass', level: 4 }
  ],
  finishRun: { startM: 5620, endM: 5960 }
});

const frostholmSegments = [
  segment('Coastal village launch', 300, [0, 0.0002], 14, 7.6, 'tarmac', 'opening'),
  segment('Right six sea cliff', 360, [0.001, 0.0015], 22, 7.2, 'tarmac'),
  segment('Cambered crest', 280, [-0.0004, 0.0005], 28, 7, 'tarmac', 'crest'),
  segment('Left five village landing', 340, [-0.0024, -0.0032], -26, 6.8, 'tarmac', 'dip'),
  segment('Costa straight', 320, [0, 0], -4, 7.5, 'tarmac', 'straight'),
  segment('Right four cliff lip', 300, [0.0032, 0.004], 8, 6.9, 'tarmac'),
  segment('Narrow village chute', 360, [0.0005, -0.0004], -36, 6.7, 'tarmac'),
  segment('Hairpin left above the sea', 340, [-0.020, -0.018], -12, 7.3, 'tarmac', 'hairpin'),
  segment('Village exit climb', 280, [0, 0.0002], 41, 7, 'tarmac'),
  segment('Left three stone wall', 320, [-0.0055, -0.0068], 9, 6.6, 'tarmac'),
  segment('Cliff road approach', 360, [0.0002, -0.0001], 2, 7.4, 'tarmac', 'straight'),
  segment('Right five sea edge', 300, [0.0021, 0.0029], -7, 6.9, 'tarmac'),
  segment('Village crowd braking', 380, [0, -0.0003], -18, 6.7, 'tarmac', 'braking'),
  segment('Left four village exit', 340, [-0.0035, -0.0045], 18, 6.8, 'tarmac'),
  segment('Blind crest over camber', 300, [0.0004, 0.0009], 32, 7.1, 'tarmac', 'jump'),
  segment('Camber landing dip', 360, [-0.0005, 0.0002], -34, 6.8, 'tarmac', 'dip'),
  segment('Right six cliff run', 320, [0.0014, 0.001], -8, 7.3, 'tarmac'),
  segment('Left five retaining wall', 340, [-0.0022, -0.003], 6, 6.9, 'tarmac'),
  segment('Final coastal crest', 360, [0.0002, 0.0003], 24, 7.2, 'tarmac', 'crest'),
  segment('Heights finish chute', 420, [0, 0], -28, 7.8, 'tarmac', 'finish')
];

const frostholmStage = stage({
  id: 'costa-brava-heights',
  regionId: 'costa-brava-heights',
  name: 'Costa Brava Heights',
  segments: frostholmSegments,
  noteRows: [
    [300, 'R6', 'RIGHT SIX', 'SEA CLIFF', 'right six, sea cliff, three hundred and sixty'],
    [660, '▲', 'CAMBER CREST', 'LONG', 'camber crest, long, keep it tidy'],
    [940, 'L5', 'LEFT FIVE', 'VILLAGE LANDING', 'left five, village landing, no throttle'],
    [1280, '▽', 'DIP', 'NARROW ROAD', 'dip, narrow road, wheels straight'],
    [1600, 'R4', 'RIGHT FOUR', 'CLIFF LIP', 'right four, cliff lip, brake early'],
    [1900, '!', 'CAUTION', 'VILLAGE CHUTE', 'caution, village chute, trust the note'],
    [2260, 'HR', 'HAIRPIN LEFT', 'SEA VIEW', 'hairpin left, sea view, dont cut'],
    [2600, 'L3', 'LEFT THREE', 'STONE WALL', 'left three, stone wall, gentle hands'],
    [2920, 'R5', 'RIGHT FIVE', 'COAST ROAD', 'right five, coast road, opens'],
    [3280, '!', 'CAUTION', 'CROWD LINE', 'caution, crowd line, stay inside the safe barrier'],
    [3560, 'L4', 'LEFT FOUR', 'VILLAGE EXIT', 'left four, village exit, stay central'],
    [3900, '▲', 'BLIND CREST', 'CAMBER', 'blind crest, camber, land straight'],
    [4240, '▽', 'DIP', 'CAMBER LANDING', 'dip, camber landing, wait for grip'],
    [4580, 'R6', 'RIGHT SIX', 'CLIFF RUN', 'right six, cliff run, flat if clean'],
    [4920, 'L5', 'LEFT FIVE', 'RETAINING WALL', 'left five, retaining wall, dont cut'],
    [5260, 'R4', 'RIGHT FOUR', 'ABRASIVE TARMAC', 'right four, abrasive tarmac, late apex'],
    [5560, '▲', 'CREST', 'FINAL HEIGHTS', 'crest, final heights, hold the line'],
    [5900, 'L5', 'LEFT FIVE', 'DESCENT', 'left five, descent, three hundred'],
    [6260, 'R6', 'RIGHT SIX', 'COASTAL GATE', 'right six, coastal gate, opens'],
    [6680, '🏁', 'FINISH', 'BRAVA HEIGHTS', 'finish, Brava Heights, through the crowd line']
  ],
  splitA: 1900,
  splitB: 3860,
  expectedDurationSeconds: [345, 530],
  landmarkIds: ['sea-cliff', 'village-square', 'stone-retaining-wall', 'olive-grove', 'safe-crowd-line', 'coastal-gate'],
  hazardPlan: {
    seed: 4513, sampleStart: 24, sampleEndMargin: 24, sampleStep: 8, skipSeed: 64007, skipThreshold: 0.39,
    sideSeed: 75017, sideSalt: 43, offsetSeed: 86027, offsetSalt: 13, typeSeed: 97037, typeSalt: 47,
    minOffsetM: 3.5, offsetJitterM: 6.4, rockThreshold: 0.53, treeThreshold: 0.18,
    exclusions: [[0, 125], [2150, 2430], [3200, 3700], [6430, 6680]]
  },
  barrierPlan: [
    { type: 'crowd-rail', startM: 740, endM: 1100, stepM: 14, side: 1, offsetM: 2.2, radiusM: 0.33, yOffsetM: 0.14 },
    { type: 'village-post', centerM: 2260, count: 11, spacingM: 9, bothSides: true, offsetM: 2.4, radiusM: 0.36, yOffsetM: 0.1 },
    { type: 'retaining-rail', anchorsM: [3260, 3320, 3380], side: -1, offsetM: 2.1, radiusM: 0.48, yOffsetM: 0.12 }
  ],
  routeIdentity: {
    tags: ['abrasive-tarmac', 'sea-cliffs', 'village-camber', 'safe-crowds'],
    opening: 'Dry abrasive tarmac climbs above the Costa Brava sea, with camber changing at every village.',
    signatures: ['sea-view hairpin', 'village crowd line and camber jump', 'coastal heights finish']
  },
  identityTags: ['abrasive-tarmac', 'sea-cliffs', 'village-camber', 'safe-crowds'],
  signatureSequences: [
    { id: 'brava-village', name: 'Village chute to sea-view hairpin', startM: 1600, endM: 2920, tags: ['camber', 'village', 'hairpin'] },
    { id: 'brava-crowd-line', name: 'Coast road to safe crowd line', startM: 2920, endM: 4240, tags: ['coast', 'braking', 'crowds'] },
    { id: 'brava-heights', name: 'Cliff run to coastal gate', startM: 4580, endM: 6680, tags: ['tarmac', 'crest', 'finish'] }
  ],
  difficultyArc: [
    { startM: 0, endM: 1280, label: 'read the dry coastal camber', level: 1 },
    { startM: 1280, endM: 2920, label: 'rotate cleanly through the village', level: 2 },
    { startM: 2920, endM: 4580, label: 'place the car by the safe crowd line', level: 3 },
    { startM: 4580, endM: 6680, label: 'carry height speed to the coast', level: 4 }
  ],
  finishRun: { startM: 6260, endM: 6680 }
});

const redstoneSegments = [
  segment('Eucalyptus creek launch', 380, [0, 0.0002], 12, 7.8, 'desert-gravel', 'opening'),
  segment('Right six red verge', 420, [0.001, 0.0014], 19, 7.4, 'desert-gravel'),
  segment('Wattle crest', 300, [-0.0002, 0.0005], 26, 7.1, 'desert-gravel', 'crest'),
  segment('Left five wash entry', 390, [-0.0025, -0.0033], -20, 7, 'desert-gravel', 'dip'),
  segment('Loose red straight', 360, [0, 0], -5, 7.6, 'desert-gravel', 'straight'),
  segment('Right four rough verge', 340, [0.0032, 0.0044], 7, 6.9, 'desert-gravel'),
  segment('Dust bowl descent', 400, [-0.0004, 0.0002], -34, 6.8, 'desert-gravel'),
  segment('Hairpin right cattle grid', 320, [0.019, 0.021], -4, 7.5, 'desert-gravel', 'hairpin'),
  segment('Cattle grid exit climb', 380, [0, 0.0002], 42, 7.2, 'desert-gravel'),
  segment('Left three eucalyptus narrows', 340, [-0.006, -0.007], 11, 6.6, 'desert-gravel'),
  segment('Creek crossing commitment', 400, [0.0002, -0.0002], 2, 7.7, 'mud', 'straight'),
  segment('Right five over red wash', 360, [0.0021, 0.0029], -12, 7, 'desert-gravel'),
  segment('Cattle grid braking', 300, [0, 0.0004], -18, 6.7, 'desert-gravel', 'braking'),
  segment('Left four rough verge', 420, [-0.0036, -0.0044], 15, 6.8, 'desert-gravel'),
  segment('Blind jump table', 340, [0.0003, 0.0007], 30, 7.1, 'desert-gravel', 'jump'),
  segment('Late storm landing trough', 390, [-0.0005, 0.0003], -32, 6.9, 'mud', 'dip'),
  segment('Right six eucalyptus exit', 360, [0.0014, 0.001], -8, 7.4, 'desert-gravel'),
  segment('Left five red creek wall', 400, [-0.0023, -0.003], 9, 7, 'desert-gravel'),
  segment('Final wattle crest', 330, [0.0001, 0.0004], 25, 7.3, 'desert-gravel', 'crest'),
  segment('Finish run through dust', 420, [0, 0], -24, 7.9, 'desert-gravel', 'finish')
];

const redstoneStage = stage({
  id: 'wattle-creek',
  regionId: 'wattle-creek',
  name: 'Wattle Creek',
  segments: redstoneSegments,
  noteRows: [
    [380, 'R6', 'RIGHT SIX', 'RED VERGE', 'right six, red verge, three hundred'],
    [800, '▲', 'WATTLE CREST', 'EUCALYPTUS', 'wattle crest, eucalyptus, stay committed'],
    [1100, 'L5', 'LEFT FIVE', 'WASH ENTRY', 'left five, wash entry, brake late'],
    [1490, '▽', 'DIP', 'DRY WASH', 'dip, dry wash, keep it straight'],
    [1850, 'R4', 'RIGHT FOUR', 'SAND SHELF', 'right four, sand shelf, opens'],
    [2190, '!', 'CAUTION', 'DUST BOWL', 'caution, dust bowl, rocks inside'],
    [2590, 'HR', 'HAIRPIN RIGHT', 'CATTLE GRID', 'hairpin right, cattle grid, dont cut'],
    [2910, 'L3', 'LEFT THREE', 'EUCALYPTUS', 'left three, eucalyptus, hold the wall'],
    [3290, 'R5', 'RIGHT FIVE', 'CREEK CROSSING', 'right five, creek crossing, flat if clean'],
    [3650, '!', 'CAUTION', 'CATTLE GRID', 'caution, cattle grid, heavy braking'],
    [3950, 'L4', 'LEFT FOUR', 'ROUGH VERGE', 'left four, rough verge, late apex'],
    [4370, '▲', 'BLIND JUMP', 'TABLE', 'blind jump, table, land straight'],
    [4710, '▽', 'DIP', 'LATE STORM', 'dip, late storm landing, wait for grip'],
    [5100, 'R6', 'RIGHT SIX', 'EUCALYPTUS EXIT', 'right six, eucalyptus exit, flat'],
    [5460, 'L5', 'LEFT FIVE', 'RED CREEK WALL', 'left five, red creek wall, dont cut'],
    [5860, 'R4', 'RIGHT FOUR', 'LOOSE GRAVEL', 'right four, loose gravel, one hundred'],
    [6190, '▲', 'CREST', 'WATTLE FINISH', 'crest, wattle finish, hold the line'],
    [6520, 'L5', 'LEFT FIVE', 'DESCENT', 'left five, descent, three hundred'],
    [6850, 'R6', 'RIGHT SIX', 'STORM GATE', 'right six, storm gate, opens'],
    [7290, '🏁', 'FINISH', 'WATTLE CREEK', 'finish, Wattle Creek, through the storm gate']
  ],
  splitA: 1850,
  splitB: 3990,
  expectedDurationSeconds: [375, 660],
  landmarkIds: ['eucalyptus', 'red-gravel', 'cattle-grid', 'rough-verge', 'dust-bowl', 'storm-gate'],
  hazardPlan: {
    seed: 5629, sampleStart: 23, sampleEndMargin: 22, sampleStep: 9, skipSeed: 68011, skipThreshold: 0.37,
    sideSeed: 79021, sideSalt: 31, offsetSeed: 90031, offsetSalt: 19, typeSeed: 101041, typeSalt: 59,
    minOffsetM: 3.6, offsetJitterM: 8.1, rockThreshold: 0.7, treeThreshold: 0.04,
    exclusions: [[0, 130], [2450, 2720], [3900, 4200], [7380, 7710]]
  },
  barrierPlan: [
    { type: 'eucalyptus-post', startM: 720, endM: 980, stepM: 13, side: -1, offsetM: 2.3, radiusM: 0.4, yOffsetM: 0.12 },
    { type: 'cattle-rail', centerM: 2580, count: 9, spacingM: 12, side: 1, offsetM: 2.15, radiusM: 0.46, yOffsetM: 0.1 },
    { type: 'storm-marker', anchorsM: [6170, 6240, 6310], bothSides: true, offsetM: 2.4, radiusM: 0.35, yOffsetM: 0.12 }
  ],
  routeIdentity: {
    tags: ['loose-red-gravel', 'eucalyptus', 'cattle-grids', 'late-storm'],
    opening: 'Loose red gravel winds through eucalyptus and rough verges before a late storm breaks.',
    signatures: ['cattle-grid hairpin', 'dust bowl jump table', 'storm descent to creek']
  },
  identityTags: ['loose-red-gravel', 'eucalyptus', 'cattle-grids', 'late-storm'],
  signatureSequences: [
    { id: 'wattle-cattle-grid', name: 'Red wash to cattle-grid hairpin', startM: 1100, endM: 2910, tags: ['wash', 'dust', 'hairpin'] },
    { id: 'wattle-jump-table', name: 'Creek crossing to jump table', startM: 3290, endM: 4710, tags: ['straight', 'braking', 'jump'] },
    { id: 'wattle-storm-creek', name: 'Eucalyptus exit to storm creek', startM: 5100, endM: 7350, tags: ['gravel', 'rough-verge', 'finish'] }
  ],
  difficultyArc: [
    { startM: 0, endM: 1100, label: 'read the loose red gravel', level: 1 },
    { startM: 1100, endM: 3290, label: 'rotate through the cattle grids', level: 2 },
    { startM: 3290, endM: 5100, label: 'place the jump table landing', level: 3 },
    { startM: 5100, endM: 7350, label: 'hold the rough verge in the storm', level: 4 }
  ],
  finishRun: { startM: 6850, endM: 7350 }
});

const regions = [
  {
    id: 'rift-valley-run', name: 'Rift Valley Run', country: 'Kenya', stageIds: ['rift-valley-run'],
    palette: { sky: '#e5a36f', terrain: '#657044', road: '#9c6c4c' },
    sceneryKit: ['savannah', 'acacia', 'water-splash', 'washboard', 'rift-escarpment', 'finish-gate'],
    weatherIds: ['rift-valley-dry'],
    identityTags: ['rough-gravel', 'savannah', 'water-splash', 'washboard'],
    identity: { biome: 'Kenyan Rift savannah', terrain: 'rough dry gravel and washboard', foliage: 'acacia, grass, and dust', routeCharacter: 'water splashes between open savannah and escarpment shelves' }
  },
  {
    id: 'kurotake-pass', name: 'Kurotake Pass', country: 'Japan', stageIds: ['kurotake-pass'],
    palette: { sky: '#333c4b', terrain: '#4b4f3f', road: '#465056' },
    sceneryKit: ['cedar-tunnel', 'retaining-wall', 'autumn-maple', 'mountain-stream', 'paper-lantern', 'pass-gate'],
    weatherIds: ['kurotake-rain'],
    identityTags: ['wet-tarmac', 'cedar-tunnels', 'retaining-walls', 'autumn-dusk'],
    identity: { biome: 'Japanese mountain forest', terrain: 'narrow wet mountain tarmac', foliage: 'cedar tunnels and autumn maple', routeCharacter: 'retaining walls and dark tunnel mouths in dusk rain' }
  },
  {
    id: 'costa-brava-heights', name: 'Costa Brava Heights', country: 'Spain', stageIds: ['costa-brava-heights'],
    palette: { sky: '#80b9d1', terrain: '#8d704f', road: '#b08b70' },
    sceneryKit: ['sea-cliff', 'village-square', 'stone-retaining-wall', 'olive-grove', 'safe-crowd-line', 'coastal-gate'],
    weatherIds: ['costa-brava-clear'],
    identityTags: ['abrasive-tarmac', 'sea-cliffs', 'village', 'camber'],
    identity: { biome: 'Spanish Mediterranean heights', terrain: 'dry abrasive tarmac with changing camber', foliage: 'olive groves and scrub above the sea', routeCharacter: 'cliff edges, village streets, and safely placed crowds' }
  },
  {
    id: 'wattle-creek', name: 'Wattle Creek', country: 'Australia', stageIds: ['wattle-creek'],
    palette: { sky: '#d88c57', terrain: '#6f4a35', road: '#a75939' },
    sceneryKit: ['eucalyptus', 'red-gravel', 'cattle-grid', 'rough-verge', 'dust-bowl', 'storm-gate'],
    weatherIds: ['wattle-creek-storm'],
    identityTags: ['loose-red-gravel', 'eucalyptus', 'cattle-grids', 'dust'],
    identity: { biome: 'Australian outback creek country', terrain: 'loose red gravel and rough verges', foliage: 'eucalyptus, spinifex, and dust', routeCharacter: 'cattle grids and washboard that turn slick under a late storm' }
  }
];

const cars = [
  {
    id: 'varga-r6', name: 'Varga R6', era: 1987, drive: 'awd', massKg: 1010, yawInertiaKgM2: 1320,
    wheelbaseM: 2.28, trackM: 1.48, frontWeightFraction: 0.52, rideHeightM: 0.5, dragCoefficient: 0.44,
    torqueCurve: [[1400, 210], [3000, 330], [6000, 300], [7200, 235]],
    gearRatios: [3.55, 2.24, 1.53, 1.13, 0.87], finalDrive: 4.35, wheelRadiusM: 0.34, brakeForceN: 10400,
    brakeBiasFront: 0.61, steeringLockRad: 0.62, tyreGrip: { front: 0.98, rear: 0.99 },
    suspension: { travelM: 0.23, springHz: 1.65, dampingRatio: 0.74 },
    durability: { engine: 0.68, steering: 0.71, suspension: 0.73, brakes: 0.64, body: 0.82 },
    assists: ['automatic', 'stability', 'braking', 'paceNotes'], powerBhp: 245, silhouette: 'short-coupe', benchmarkScale: 0.97
  },
  {
    id: 'nord-gt', name: 'Nord GT', era: 2018, drive: 'awd', massKg: 1420, yawInertiaKgM2: 2260,
    wheelbaseM: 2.84, trackM: 1.6, frontWeightFraction: 0.54, rideHeightM: 0.43, dragCoefficient: 0.29,
    torqueCurve: [[1600, 220], [2800, 390], [4800, 470], [6700, 410]],
    gearRatios: [3.1, 2.0, 1.4, 1.07, 0.84, 0.67], finalDrive: 3.7, wheelRadiusM: 0.36, brakeForceN: 14300,
    brakeBiasFront: 0.63, steeringLockRad: 0.56, tyreGrip: { front: 1.12, rear: 1.1 },
    suspension: { travelM: 0.2, springHz: 2.4, dampingRatio: 0.8 },
    durability: { engine: 0.84, steering: 0.86, suspension: 0.82, brakes: 0.84, body: 0.88 },
    assists: ['automatic', 'stability', 'braking', 'paceNotes'], powerBhp: 385, silhouette: 'long-sedan', benchmarkScale: 0.94
  },
  {
    id: 'sirocco-b1', name: 'Sirocco B1', era: 1979, drive: 'rwd', massKg: 930, yawInertiaKgM2: 1240,
    wheelbaseM: 2.34, trackM: 1.44, frontWeightFraction: 0.48, rideHeightM: 0.46, dragCoefficient: 0.41,
    torqueCurve: [[1500, 130], [3000, 190], [5200, 175], [6800, 140]],
    gearRatios: [3.8, 2.35, 1.58, 1.2, 0.94], finalDrive: 4.6, wheelRadiusM: 0.3, brakeForceN: 8300,
    brakeBiasFront: 0.59, steeringLockRad: 0.7, tyreGrip: { front: 0.95, rear: 1.02 },
    suspension: { travelM: 0.25, springHz: 1.55, dampingRatio: 0.68 },
    durability: { engine: 0.62, steering: 0.66, suspension: 0.71, brakes: 0.58, body: 0.7 },
    assists: ['automatic', 'stability', 'braking', 'paceNotes'], powerBhp: 150, silhouette: 'classic-coupe', benchmarkScale: 1.12
  },
  {
    id: 'atlas-xr', name: 'Atlas XR', era: 2022, drive: 'rwd', massKg: 1190, yawInertiaKgM2: 2180,
    wheelbaseM: 2.52, trackM: 1.57, frontWeightFraction: 0.49, rideHeightM: 0.45, dragCoefficient: 0.39,
    torqueCurve: [[1300, 280], [2600, 470], [4300, 500], [6100, 390]],
    gearRatios: [3.0, 1.95, 1.36, 1.04, 0.8, 0.62], finalDrive: 3.55, wheelRadiusM: 0.38, brakeForceN: 16000,
    brakeBiasFront: 0.6, steeringLockRad: 0.55, tyreGrip: { front: 1.1, rear: 1.32 },
    suspension: { travelM: 0.21, springHz: 2.55, dampingRatio: 0.78 },
    durability: { engine: 0.76, steering: 0.72, suspension: 0.7, brakes: 0.8, body: 0.78 },
    assists: ['automatic', 'stability', 'braking', 'paceNotes'], powerBhp: 430, silhouette: 'widebody-special', benchmarkScale: 1.08
  }
];

export const EXPANSION_SURFACES = deepFreeze(surfaces);
export const EXPANSION_WEATHER = deepFreeze(weather);
export const EXPANSION_REGIONS = deepFreeze(regions);
export const EXPANSION_STAGES = deepFreeze([sunspireStage, blackwaterStage, frostholmStage, redstoneStage]);
export const EXPANSION_CARS = deepFreeze(cars);
