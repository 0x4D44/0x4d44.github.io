// Static stage metadata (cheap, no build) and the authored road designs.
// A "design" is the hand-written rhythm of a stage: corners, straights, crests, jumps, fords, a
// bridge, a cattle grid, surface changes. core/spline.mjs compiles it into a centreline.
// Compass bearings: 0 = -Z, 90 = +X, clockwise.  TO(b, r) = "turn to bearing b with radius r".

import { SURFACE as SF } from "./surfaces.mjs";
import {
  S, L, R, TO, W, H, FILL, SURF, VERGE, WIDTH, mark, crest, jump, dip, ford, bridge, grid, nocut, culvert,
  waterfall, hut, ess, camber, tunnel,
} from "./spline.mjs";

export const STAGE_IDS = Object.freeze(["waitomo", "whakarewarewa", "coromandel", "otago", "remarkables", "fiordland"]);

const hex = (v) => v;

export const STAGE_DEFS = {
  waitomo: {
    id: "waitomo", number: 1, name: "Waitomo Ridge", region: "Waikato", island: "North",
    blurb: "Fast rolling pasture above the glowworm caves, where long crests hide the next corner and limestone bluffs crowd the road. Early mist lingers in the hollows as you chase the morning light across the farmland.",
    lengthTarget: 3800, difficulty: 2, biome: "pasture",
    environment: {
      timeOfDay: 8.5, sunAzimuth: 1.75, sunElevation: 0.46, sunColor: hex(0xfff0d0), sunIntensity: 2.6,
      skyTop: hex(0x5f94d8), skyHorizon: hex(0xcfe3f0), fogColor: hex(0xd5e2e8),
      fogNear: 80, fogFar: 1150, fogDensity: 0.0011, ambient: hex(0x8fa8c0),
      weather: { type: "mist", intensity: 0.25, wetness: 0.05 },
      windStrength: 0.35, cloudCover: 0.25, stars: 0, headlights: false,
    },
    palette: { grass: hex(0x7fa04a), grass2: hex(0x9bb35e), dirtEdge: hex(0xa68a62), rock: hex(0xcfc8b4), foliage: hex(0x4f7a3a), foliage2: hex(0x6f9448), trunk: hex(0x5a4430), accent: hex(0xe8e0d0) },
    roadSurfaces: [SF.GRAVEL, SF.PACKED_DIRT],
    landmarks: ["Waitomo limestone bluffs", "Shelterbelt avenue", "Hilltop sheep paddocks", "Cattle grid crest"],
  },
  whakarewarewa: {
    id: "whakarewarewa", number: 2, name: "Whakarewarewa Redwoods", region: "Rotorua", island: "North",
    blurb: "A tight, twisting ribbon of pumice beneath towering redwoods, with steam drifting across the road from the thermal vents. The surface changes without warning and the forest swallows every sightline.",
    lengthTarget: 3400, difficulty: 3, biome: "redwood",
    environment: {
      timeOfDay: 14, sunAzimuth: 0.4, sunElevation: 0.66, sunColor: hex(0xffe8c8), sunIntensity: 1.1,
      skyTop: hex(0x7d8a92), skyHorizon: hex(0xb4bcbc), fogColor: hex(0xaab4b0),
      fogNear: 40, fogFar: 560, fogDensity: 0.0028, ambient: hex(0x7a8a80),
      weather: { type: "cloud", intensity: 0.5, wetness: 0.35 },
      windStrength: 0.12, cloudCover: 0.8, stars: 0, headlights: false,
    },
    palette: { grass: hex(0x4f6a35), grass2: hex(0x6a7d3f), dirtEdge: hex(0x8b6a4a), rock: hex(0x8a7a68), foliage: hex(0x2f5a30), foliage2: hex(0x46703a), trunk: hex(0x7a3f28), accent: hex(0xd8cdb4) },
    roadSurfaces: [SF.PUMICE, SF.GRAVEL, SF.MUD],
    landmarks: ["Giant redwood avenue", "Geothermal steam vents", "Fern gully", "Mud pool corner"],
  },
  coromandel: {
    id: "coromandel", number: 3, name: "Coromandel Coast", region: "Coromandel", island: "North",
    blurb: "A clifftop road above the Pacific at golden hour, tarmac giving way to gravel on the headland before the hairpins drop to the beach. Pōhutukawa lean over the edge and the sea glares in your eyes.",
    lengthTarget: 4200, difficulty: 3, biome: "coast",
    environment: {
      timeOfDay: 18.5, sunAzimuth: 4.71, sunElevation: 0.11, sunColor: hex(0xffb060), sunIntensity: 3.0,
      skyTop: hex(0x4a6fb0), skyHorizon: hex(0xf6b878), fogColor: hex(0xe9b890),
      fogNear: 120, fogFar: 1700, fogDensity: 0.0007, ambient: hex(0xb08a78),
      weather: { type: "clear", intensity: 0, wetness: 0 },
      windStrength: 0.5, cloudCover: 0.3, stars: 0, headlights: false,
    },
    palette: { grass: hex(0x8a9a4a), grass2: hex(0xa8a85a), dirtEdge: hex(0xb59a6a), rock: hex(0x8a7e72), foliage: hex(0x2f5f3a), foliage2: hex(0x4a7a44), trunk: hex(0x4a3a2c), accent: hex(0xc23a2a) },
    roadSurfaces: [SF.TARMAC, SF.GRAVEL, SF.PACKED_DIRT],
    landmarks: ["Pōhutukawa headland", "Cathedral hairpins", "Driftwood beach finish", "Sea-glare straight"],
  },
  otago: {
    id: "otago", number: 4, name: "Central Otago Tussock", region: "Central Otago", island: "South",
    blurb: "Vast golden tussock country under a huge sky, with schist tors on the skyline and hardpack that rewards commitment. Big fast sweepers and bigger crests leave you flat out and airborne.",
    lengthTarget: 5000, difficulty: 4, biome: "tussock",
    environment: {
      timeOfDay: 13, sunAzimuth: 0.17, sunElevation: 1.08, sunColor: hex(0xfff4e0), sunIntensity: 3.4,
      skyTop: hex(0x3a7bd5), skyHorizon: hex(0xbcd6ee), fogColor: hex(0xd6dfe6),
      fogNear: 200, fogFar: 2800, fogDensity: 0.0004, ambient: hex(0xa8b8c8),
      weather: { type: "clear", intensity: 0, wetness: 0 },
      windStrength: 0.85, cloudCover: 0.15, stars: 0, headlights: false,
    },
    palette: { grass: hex(0xb09a55), grass2: hex(0xc4ae6a), dirtEdge: hex(0xb59a78), rock: hex(0x8c8a82), foliage: hex(0x6b7a45), foliage2: hex(0x8a8a50), trunk: hex(0x6a5a48), accent: hex(0xe0c070) },
    roadSurfaces: [SF.PACKED_DIRT, SF.GRAVEL],
    landmarks: ["Schist tor skyline", "Dust-trail straight", "Windswept crest series", "Old gold-diggings ford"],
  },
  remarkables: {
    id: "remarkables", number: 5, name: "Remarkables Pass", region: "Queenstown", island: "South",
    blurb: "A relentless switchback climb up bare rock walls with the valley falling away beside your wheels. Gravel turns to snow and ice near the summit, and the cloud closes in.",
    lengthTarget: 4400, difficulty: 5, biome: "alpine",
    environment: {
      timeOfDay: 10, sunAzimuth: 0.35, sunElevation: 0.26, sunColor: hex(0xdfe8f5), sunIntensity: 1.0,
      skyTop: hex(0x7f95ad), skyHorizon: hex(0xc4ced8), fogColor: hex(0xc6d0da),
      fogNear: 30, fogFar: 520, fogDensity: 0.0035, ambient: hex(0x9aa8b8),
      weather: { type: "snow", intensity: 0.55, wetness: 0.5 },
      windStrength: 0.6, cloudCover: 0.9, stars: 0, headlights: false,
    },
    palette: { grass: hex(0x8a8f78), grass2: hex(0xa0a58c), dirtEdge: hex(0x8c8478), rock: hex(0x6e7078), foliage: hex(0x5c6a58), foliage2: hex(0x7a8a78), trunk: hex(0x4a4038), accent: hex(0xf0f4f8) },
    roadSurfaces: [SF.GRAVEL, SF.SNOW],
    landmarks: ["Switchback ladder", "Rock-wall gallery", "Summit snow line", "Lake-view drop-off"],
  },
  fiordland: {
    id: "fiordland", number: 6, name: "Fiordland Rain", region: "Milford", island: "South",
    blurb: "Beech rainforest closes over a narrow, greasy road at dusk, with waterfalls pouring off the valley walls and fords crossing the track. Headlights cut the rain as you thread a one-lane bridge in the dark.",
    lengthTarget: 5300, difficulty: 5, biome: "rainforest",
    environment: {
      timeOfDay: 20.75, sunAzimuth: 4.89, sunElevation: -0.07, sunColor: hex(0x6a7aa8), sunIntensity: 0.35,
      skyTop: hex(0x0b1220), skyHorizon: hex(0x2a3646), fogColor: hex(0x1a2430),
      fogNear: 20, fogFar: 400, fogDensity: 0.0045, ambient: hex(0x28344a),
      weather: { type: "rain", intensity: 0.85, wetness: 1 },
      windStrength: 0.55, cloudCover: 1, stars: 0.15, headlights: true,
    },
    palette: { grass: hex(0x2f4a2a), grass2: hex(0x3d5a32), dirtEdge: hex(0x4a3a2a), rock: hex(0x4a5058), foliage: hex(0x1f4a30), foliage2: hex(0x2f6040), trunk: hex(0x3a3326), accent: hex(0x7ad0c0) },
    roadSurfaces: [SF.MUD, SF.GRAVEL],
    landmarks: ["Beech-canopy tunnel", "Twin waterfalls", "One-lane bridge", "Mossy ford"],
  },
};

export function getStageDef(id) {
  const d = STAGE_DEFS[id];
  if (!d) throw new Error("unknown stage " + id);
  return d;
}

// Default RNG seeds: every player sees the same stage.
export const DEFAULT_SEEDS = { waitomo: 1101, whakarewarewa: 2202, coromandel: 3303, otago: 4404, remarkables: 5505, fiordland: 6606 };

// ---------------------------------------------------------------------------------------------
// Authored designs.  `shape` rules sculpt the terrain beside the road (sea / drop / wall); `edges`
// override the invisible soft wall distance from the centreline (m).
// ---------------------------------------------------------------------------------------------

export const STAGE_DESIGNS = {};
/** tighten radii of TO rows by factor f (min 24 m) */
const VARY = [0.8, 1.35, 0.62, 1.7, 0.95, 2.0, 0.72, 1.15];
let vk = 0;
const TWF = (rows) => W(rows.map((r) => (typeof r[0] === "number" && r[1] >= 20 ? [r[0], Math.max(20, r[1] * 0.33 * VARY[vk++ % VARY.length]), r[2], r[3]] : (typeof r[0] === "number" ? r : r))));
const TWR = (rows) => TW(rows, 0.72);
const TW = (rows, f = 0.55) => W(rows.map((r) => (typeof r[0] === "number" ? [r[0], r[1] < 20 ? r[1] : Math.max(f > 0.5 ? 24 : 20, r[1] * f), r[2], r[3]] : r)));

// --- 1. Waitomo Ridge: fast, rolling, long crests, a few medium corners to keep you honest ---------
STAGE_DESIGNS.waitomo = {
  maxSlope: 0.09,
  bearing0: 80, surf0: SF.GRAVEL, verge0: SF.GRASS, width: 7.2, length: 3800, roll: [3.2, 170],
  items: [
    H(96), mark("start"), S(110), camber(90, 2.4),
    ...W([
      [100, 105, 40],
      crest(1.1, 22), S(60),
      [62, 115, 40],
      [40, 100, 40],
      [85, 40, 40],
      [60, 22, 20],
      S(90), jump(2.4, 10), S(100),
      [210, 17, 40, "R"],
      tunnel(120), S(150), [250, 90, 30],
    ]),
    H(150), camber(70, 2.6), R(75, 60, 48), S(30), nocut(), L(32, 95), S(40),
    ...W([[75, 100, 100]]),
    mark("mid1"), SURF(SF.PACKED_DIRT), H(112),
    ...W([
      [50, 150, 100],
      crest(1.3, 26), S(70),
      [85, 95, 60],
      [60, 85, 25], [95, 85, 25], [65, 85, 60],
    ]),
    H(90), camber(60, -1.4), R(60, 70, 40), S(80),
    ...W([[100, 100, 40]]),
    grid(), S(60),
    ...W([
      [75, 100, 80],
      jump(2.4, 10), S(100),
      [105, 90, 50],
      [70, 36, 40],
      [115, 45, 60],
      [85, 105, 80],
      crest(1.2, 24), S(80),
      [110, 130, 60],
      [75, 70, 50],
      S(40), crest(1.0, 20), S(60),
      [105, 90, 40], [70, 50, 30], nocut(), [110, 24, 40], [85, 100, 60], [100, 150, 40],
    ]),
    H(96), FILL(),
  ],
  shape: [],
  edges: [],
};

// --- 2. Whakarewarewa: tight, twisty, up and down; pumice, gravel and mud ----------------------
STAGE_DESIGNS.whakarewarewa = {
  maxSlope: 0.12,
  bearing0: 95, surf0: SF.PUMICE, verge0: SF.LEAF_LITTER, width: 6.4, length: 3400, roll: [3.0, 90], bankGain: 2.2,
  items: [
    H(340), mark("start"), S(100), camber(70, 2.2),
    ...W([
      [65, 55, 20], [120, 42, 25], [80, 36, 40], [135, 60, 60],
      crest(0.9, 14), S(30),
      [70, 22, 15], [195, 14, 25], [60, 14, 25], [125, 24, 35],
    ]),
    H(318), SURF(SF.GRAVEL),
    ...W([
      [85, 80, 60], [50, 48, 30], [100, 40, 40],
      dip(0.7, 12), S(20),
      [130, 38, 25], [75, 34, 30], [115, 55, 70],
    ]),
    H(350), mark("mud"), SURF(SF.MUD),
    ...W([
      [70, 60, 40], [105, 45, 30], [60, 40, 50], [100, 70, 60],
    ]),
    SURF(SF.PUMICE), H(332),
    ...W([
      [135, 120, 80], crest(1.0, 16), S(40),
      [80, 34, 20], [125, 28, 20], [70, 26, 25], [110, 26, 40],
      [55, 21, 20], [105, 22, 30],
    ]),
    R(14, 125), S(30), H(360), L(36, 70), S(40),
    ...W([
      [90, 90, 60], [60, 50, 30], [115, 50, 40],
      nocut(), [75, 36, 25], [120, 40, 60],
    ]),
    SURF(SF.GRAVEL), H(335), mark("late"), camber(60, -1.3),
    ...W([
      [85, 100, 80],
      jump(2.4, 10), S(50),
      [55, 60, 35], [100, 55, 30], [65, 42, 25], [110, 42, 30], [80, 36, 40],
      [125, 70, 90],
      [95, 120, 50],
    ]),
    H(345), FILL(),
  ],
  shape: [],
  edges: [],
};

// --- 3. Coromandel: coast road, headland gravel, hairpins to the beach ----------------------------
STAGE_DESIGNS.coromandel = {
  maxSlope: 0.14,
  bearing0: 90, surf0: SF.TARMAC, verge0: SF.GRASS, width: 6.5, length: 4200, roll: [2.0, 200], bankGain: 2.4,
  items: [
    H(38), mark("start"), S(110),
    ...W([
      [112, 110, 30], [70, 60, 20], [105, 48, 40],
      [78, 150, 60],
      [118, 70, 30], [85, 30, 25], [60, 28, 50],
      [95, 100, 80],
      crest(1.0, 18), S(60),
      [115, 180, 70], [80, 75, 30],
      [105, 28, 30], [70, 30, 40],
      [110, 60, 60],
    ]),
    mark("headland"), H(62), SURF(SF.GRAVEL), VERGE(SF.SCREE),
    ...W([
      [85, 120, 60], [55, 70, 30], [100, 65, 40], [70, 90, 80],
      jump(2.4, 10), S(90),
      [110, 150, 60], [75, 110, 50], [95, 130, 150],
    ]),
    SURF(SF.TARMAC), VERGE(SF.GRASS), mark("hp0"), H(58),
    ...W([[110, 90, 120]]),
    // cathedral hairpins: V-geometry so successive legs diverge
    mark("hp1"), R(10, 150), mark("legB"), H(34), S(60),
    ...W([[250, 110, 60]]),
    S(60), mark("hp2"), L(10, 150), mark("legC"), H(12), S(50),
    ...W([[100, 100, 80], [118, 70, 40]]),
    mark("beach"), SURF(SF.PACKED_DIRT), VERGE(SF.SAND), H(3.5),
    ...W([
      [88, 90, 60], [112, 80, 30], [75, 75, 60],
    ]),
    H(3), culvert(), S(40),
    ...W([
      [100, 120, 70], [85, 160, 50], [60, 55, 30], [110, 50, 30], [75, 60, 40], [105, 80, 50],
      [85, 140, 60], crest(0.8, 16), S(50), [110, 70, 40], [70, 60, 30], [100, 120, 60],
    ]),
    FILL(),
  ],
  shape: [
    { kind: "sea", side: 1, s0: 0, s1: "hp0-100", fade: 160, start: 5, ramp: 55, amount: 1 },
    { kind: "drop", side: 1, s0: "hp1", s1: "legB", fade: 60, start: 4, ramp: 25, farFade: [18, 34], amount: 5 },
    { kind: "drop", side: -1, s0: "legB", s1: "hp2", fade: 60, start: 4, ramp: 25, farFade: [18, 34], amount: 5 },
    { kind: "sea", side: 1, s0: "hp2", s1: "end", fade: 60, start: 8, ramp: 50, amount: 1 },
    { kind: "wall", side: -1, s0: "headland", s1: "hp0", fade: 60, start: 3, ramp: 14, amount: 9 },
  ],
  edges: [],
};

// --- 4. Central Otago: huge fast sweepers, big crests and jumps ---------------------------------
STAGE_DESIGNS.otago = {
  maxSlope: 0.08,
  bearing0: 85, surf0: SF.PACKED_DIRT, verge0: SF.TUSSOCK, width: 7.4, length: 5000, roll: [4.0, 260],
  items: [
    H(420), mark("start"), S(90), camber(90, 2.0),
    ...W([
      [114, 78, 60],
      crest(1.5, 28), S(80),
      [70, 82, 36],
      S(70), jump(1.6, 16), S(100),
      [121, 66, 41],
      [75, 62, 24], [114, 58, 24],
      [42, 40, 17], [100, 38, 29],
    ]),
    H(450), mark("q1"), SURF(SF.GRAVEL),
    ...W([
      [49, 78, 60],
      crest(1.6, 30), S(70), crest(1.3, 26), S(80),
      [100, 72, 36], [143, 62, 24],
      [85, 56, 14], [136, 50, 14], [70, 60, 29],
      [107, 101, 36],
    ]),
    SURF(SF.PACKED_DIRT), H(432), mark("q2"), camber(80, -1.4),
    ...W([
      [70, 85, 36],
      S(60), jump(1.6, 16), S(70),
      [121, 69, 48], [92, 85, 60],
      nocut(), [42, 66, 24],
      [107, 70, 24], [158, 80, 24], [107, 72, 29],
    ]),
    grid(), S(60), H(470), camber(80, 2.4),
    ...W([
      [63, 78, 60],
      crest(1.4, 28), S(70),
      [114, 85, 36],
    ]),
    H(462), mark("q3"), S(60),
    ...W([
      [75, 79, 36],
      [114, 70, 17], [56, 66, 17], [107, 70, 24],
      [92, 92, 12],
    ]),
    // long gravel descent down the valley, finishing through the ford
    mark("descent"), SURF(SF.GRAVEL), H(470),
    ...W([
      [62, 150, 70], [108, 130, 60], [76, 110, 80], [118, 180, 40],
      crest(1.3, 28), S(50), [88, 95, 70], [60, 72, 50], [104, 140, 90], [84, 90, 40], [112, 160, 80],
    ]),
    H(404), S(60), mark("ford"), ford(14, 0.5), S(90),
    ...W([[95, 260, 0]]),
    FILL(),
  ],
  shape: [
    { kind: "wall", side: -1, s0: "q2", s1: "q3", fade: 100, start: 6, ramp: 40, amount: 14, farFade: [90, 220] },
  ],
  edges: [],
};

// --- 5. Remarkables Pass: switchback climb, rock walls, drop-offs, gravel into snow ---------------
STAGE_DESIGNS.remarkables = {
  maxSlope: 0.18,
  bearing0: 20, surf0: SF.GRAVEL, verge0: SF.SCREE, width: 6.6, length: 4400, roll: [2.0, 120], bankGain: 2.2,
  items: [
    H(620), mark("start"), S(100),
    // leg 0: approach
    ...TWR([[70, 110, 90], crest(0.9, 16), S(40), [50, 100, 100]]),
    // switchback ladder: alternating east / west legs with tight hairpins between
    mark("L1"), H(650), nocut(), ...TWR([[305, 10, 0]]), mark("L2"),
    ...TWR([[285, 120, 90], [310, 130, 60], [290, 100, 70], [310, 110, 30]]),
    H(690), nocut(), ...TWR([[60, 10, 0]]), mark("L3"),
    ...TWR([[75, 120, 80], [95, 100, 40], [55, 90, 100], [70, 130, 60], [50, 120, 30]]),
    H(790), ...TWR([[300, 10, 0]]), mark("L4"),
    ...TWR([[280, 100, 70], [310, 90, 40], [285, 110, 60], [310, 110, 30]]),
    H(815), mark("snowline"), SURF(SF.SNOW), VERGE(SF.SNOW_DEEP),
    ...TWR([[60, 10, 0]]), mark("L5"),
    ...TWR([[80, 110, 70], [50, 90, 40], [75, 100, 70], [50, 120, 30]]),
    H(840), ...TWR([[305, 10, 0]]), mark("L6"),
    ...TWR([[285, 120, 70], [315, 90, 30], [290, 100, 70], [310, 110, 30]]),
    H(870), ...TWR([[55, 10, 0]]), mark("L7"),
    ...TWR([[75, 100, 50], [95, 90, 40], [55, 80, 40], [75, 120, 50], [50, 100, 30]]),
    H(880), ...TWR([[305, 10, 0]]), mark("L8"),
    ...TWR([[280, 90, 60], [310, 85, 50], [290, 120, 60], [305, 100, 30]]),
    H(915), ...TWR([[60, 10, 0]]), mark("L9"),
    ...TWR([[75, 110, 60], [45, 100, 60], [85, 100, 90]]),
    mark("summit"), H(940),
    ...TWR([[60, 150, 100], jump(2.4, 10), S(60), [100, 140, 100], [75, 160, 100]]),
    mark("ridge"), H(950),
    ...TW([
      [110, 100, 40], [60, 80, 30], [100, 70, 30], [55, 70, 40], [105, 100, 60], [65, 90, 40],
      crest(0.9, 16), S(50), [80, 90, 40], [45, 75, 30],
    ]),
    H(900), FILL(),
  ],
  shape: [], // filled below (legs generate boundary rules)
  edges: [],
};

// --- 6. Fiordland Rain: narrow, wet, twisty; fords and a one-lane bridge ---------------------------
STAGE_DESIGNS.fiordland = {
  maxSlope: 0.11,
  bearing0: 100, surf0: SF.MUD, verge0: SF.LEAF_LITTER, width: 6.0, length: 5300, roll: [3.2, 110], bankGain: 2.2,
  items: [
    H(210), mark("start"), S(100), camber(80, 2.2),
    ...TWF([
      [75, 90, 40], [115, 70, 30], [85, 55, 30], [120, 80, 50],
      waterfall(-1, 34, 5), S(10),
      [70, 100, 60], [100, 60, 30], [60, 56, 40],
    ]),
    SURF(SF.GRAVEL), H(232),
    ...TWF([
      [105, 120, 80], [80, 140, 60],
      S(40), ford(18, 0.7), S(50),
      [120, 70, 40], [75, 60, 30], [110, 62, 40],
    ]),
    mark("bridge0"), SURF(SF.GRAVEL), S(60), bridge(18), S(80),
    ...TWF([
      [70, 80, 30], [115, 70, 30], [65, 60, 40], [100, 100, 80],
      crest(0.9, 14), S(40),
      [130, 90, 50], [85, 60, 30], [120, 55, 30], [70, 52, 25], [105, 55, 45],
    ]),
    SURF(SF.MUD), H(205), mark("mud"),
    ...TWF([
      [330, 14, 60], [315, 70, 50], [340, 60, 50], [95, 14, 50],
    ]),
    ...TWF([
      [75, 100, 40], [125, 80, 40], [90, 70, 50],
      waterfall(1, 42, 7), S(10),
      [55, 60, 30], [100, 55, 35],
    ]),
    culvert(), S(30), SURF(SF.GRAVEL), H(240),
    ...TWF([
      [70, 130, 80], [110, 90, 50], [60, 80, 40],
      S(50), ford(16, 0.6), S(60),
      [100, 90, 40], [135, 70, 30], [90, 60, 30], [120, 60, 40],
      dip(0.6, 12), S(30),
      [75, 70, 30], [105, 70, 35],
    ]),
    camber(70, -1.4),
    SURF(SF.MUD), H(215), mark("late"),
    ...TWF([
      [60, 85, 40], [115, 50, 25], [75, 50, 25], [120, 50, 25], [85, 55, 40],
      waterfall(-1, 28, 4), S(10),
      [110, 110, 70], [65, 85, 40], [105, 75, 30],
      S(80), jump(2.4, 10), S(50),
      [80, 130, 80], [115, 100, 60], [85, 120, 90],
    ]),
    H(228), mark("gorge"), camber(90, 2.4),
    ...TWF([
      [335, 14, 60], [320, 60, 50], [350, 55, 50], [100, 14, 40],
    ]),
    ...TWF([
      [60, 80, 30], [110, 70, 25], [70, 70, 20], [125, 90, 40],
      culvert(), [90, 60, 20], [45, 60, 25], [100, 70, 30], [65, 60, 35],
      [120, 90, 40], [80, 70, 25],
      S(30), ford(14, 0.55), S(40),
      [105, 90, 40], [60, 70, 25], [100, 60, 30],
      [65, 90, 40], [115, 70, 30], [75, 60, 30], [110, 80, 40], [55, 70, 30], [100, 65, 30],
    ]),
    H(200), FILL(),
  ],
  shape: [
    { kind: "wall", side: -1, s0: 0, s1: 1500, fade: 120, start: 5, ramp: 22, amount: 26, farFade: [34, 76] },
    { kind: "wall", side: 1, s0: 1500, s1: 3200, fade: 120, start: 5, ramp: 22, amount: 28, farFade: [34, 76] },
    { kind: "wall", side: -1, s0: 3200, s1: "end", fade: 120, start: 5, ramp: 22, amount: 26, farFade: [34, 76] },
    { kind: "drop", side: 1, s0: 0, s1: 1500, fade: 100, start: 4, ramp: 25, farFade: [18, 34], amount: 5 },
  ],
  edges: [],
};

// Remarkables: each leg between hairpins gets a drop-off edge on the downhill side and a rock wall on the uphill side
// (soft-wall rules only; the terrain itself is carved by the offset field between legs).
{
  const d = STAGE_DESIGNS.remarkables;
  for (let k = 2; k <= 9; k++) {
    const west = k % 2 === 0; // legs after L2, L4... run west: uphill (north) is on the right
    const s0 = `L${k}+10`, s1 = k < 9 ? `L${k + 1}-34` : "summit";
    d.shape.push({ kind: "edge", guard: true, side: west ? -1 : 1, s0, s1, fade: 50, start: 2.6 });
    d.shape.push({ kind: "edge", side: west ? 1 : -1, s0, s1, fade: 50, start: 3.4 });
  }
}
