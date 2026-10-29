// Surface vocabulary shared by stages (what is where), physics (grip), renderer (look),
// FX (dust/spray/skids) and audio (tyre noise). Ids are stable and stored in Uint8Arrays.
// Lead-owned. The DYNAMICS agent owns the numeric tuning of mu / muSlide / rolling / drag / deform;
// nobody may renumber or remove an id. Add new ids at the end.

export const SURFACE = Object.freeze({
  // --- road surfaces (0-5): what the road itself is made of
  GRAVEL: 0, //       classic loose-over-hardpack rally gravel
  PACKED_DIRT: 1, //  hard clay / farm track
  TARMAC: 2, //       sealed chip-seal road
  MUD: 3, //          wet clay, churned
  SNOW: 4, //         packed snow / ice
  PUMICE: 5, //       volcanic pumice sand (Rotorua / central plateau)
  // --- off-road / verge surfaces (6-12): outside the road edge
  GRASS: 6,
  LEAF_LITTER: 7, //  forest floor
  TUSSOCK: 8,
  SCREE: 9, //        loose rock / shingle
  SAND: 10,
  SNOW_DEEP: 11,
  WATER: 12, //       ford / stream crossing (shallow)
});

export const SURFACE_COUNT = 13;

/**
 * mu         peak friction multiplier relative to dry tarmac (1.0)
 * muSlide    kinetic friction as a fraction of peak (lower = snappier loss of grip)
 * peakSlip   tyre slip angle (rad) at peak force; looser surfaces peak later
 * rolling    rolling resistance coefficient
 * drag       extra velocity-proportional drag (1/s) from ploughing through it
 * deform     0..1 how much the surface rutting / throws material
 * dust       0..1 dust/spray plume amount when a tyre slides or spins
 * dustColor  default plume colour (renderer may tint per stage)
 * spray      true when the plume is water rather than dust
 * noise      key for tyre-noise synthesis in audio
 * offroad    true when this is a verge surface
 */
export const SURFACE_INFO = Object.freeze([
  { id: 0, key: "gravel", name: "Gravel", mu: 0.72, muSlide: 0.86, peakSlip: 0.16, rolling: 0.020, drag: 0.0, deform: 0.5, dust: 0.8, dustColor: 0xb9a888, spray: false, noise: "gravel", offroad: false },
  { id: 1, key: "dirt", name: "Packed dirt", mu: 0.80, muSlide: 0.88, peakSlip: 0.14, rolling: 0.016, drag: 0.0, deform: 0.3, dust: 0.9, dustColor: 0xa58a63, spray: false, noise: "dirt", offroad: false },
  { id: 2, key: "tarmac", name: "Tarmac", mu: 1.00, muSlide: 0.92, peakSlip: 0.10, rolling: 0.012, drag: 0.0, deform: 0.0, dust: 0.0, dustColor: 0x9a9a9a, spray: false, noise: "tarmac", offroad: false },
  { id: 3, key: "mud", name: "Mud", mu: 0.52, muSlide: 0.80, peakSlip: 0.20, rolling: 0.045, drag: 0.10, deform: 1.0, dust: 0.5, dustColor: 0x5a4632, spray: true, noise: "mud", offroad: false },
  { id: 4, key: "snow", name: "Snow", mu: 0.40, muSlide: 0.78, peakSlip: 0.22, rolling: 0.030, drag: 0.05, deform: 0.7, dust: 0.7, dustColor: 0xeef3f8, spray: false, noise: "snow", offroad: false },
  { id: 5, key: "pumice", name: "Pumice", mu: 0.64, muSlide: 0.84, peakSlip: 0.17, rolling: 0.028, drag: 0.02, deform: 0.6, dust: 1.0, dustColor: 0xd8cdb4, spray: false, noise: "gravel", offroad: false },
  { id: 6, key: "grass", name: "Grass", mu: 0.55, muSlide: 0.80, peakSlip: 0.20, rolling: 0.060, drag: 0.15, deform: 0.4, dust: 0.1, dustColor: 0x6b7a45, spray: false, noise: "grass", offroad: true },
  { id: 7, key: "leaf", name: "Leaf litter", mu: 0.50, muSlide: 0.80, peakSlip: 0.20, rolling: 0.070, drag: 0.20, deform: 0.5, dust: 0.2, dustColor: 0x6e5a3a, spray: false, noise: "grass", offroad: true },
  { id: 8, key: "tussock", name: "Tussock", mu: 0.58, muSlide: 0.82, peakSlip: 0.19, rolling: 0.080, drag: 0.25, deform: 0.3, dust: 0.2, dustColor: 0xb8a468, spray: false, noise: "grass", offroad: true },
  { id: 9, key: "scree", name: "Scree", mu: 0.45, muSlide: 0.80, peakSlip: 0.20, rolling: 0.090, drag: 0.30, deform: 0.4, dust: 0.5, dustColor: 0x8a8a84, spray: false, noise: "gravel", offroad: true },
  { id: 10, key: "sand", name: "Sand", mu: 0.50, muSlide: 0.80, peakSlip: 0.20, rolling: 0.110, drag: 0.40, deform: 0.8, dust: 0.8, dustColor: 0xd9c9a0, spray: false, noise: "sand", offroad: true },
  { id: 11, key: "snow_deep", name: "Deep snow", mu: 0.35, muSlide: 0.75, peakSlip: 0.24, rolling: 0.150, drag: 0.60, deform: 1.0, dust: 0.9, dustColor: 0xf2f6fa, spray: false, noise: "snow", offroad: true },
  { id: 12, key: "water", name: "Water", mu: 0.40, muSlide: 0.70, peakSlip: 0.22, rolling: 0.100, drag: 0.50, deform: 0.0, dust: 1.0, dustColor: 0xdbe8f0, spray: true, noise: "water", offroad: false },
]);

export const isRoadSurface = (id) => id >= 0 && id <= 5;
