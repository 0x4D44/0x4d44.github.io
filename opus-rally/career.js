// The season is what turns a stage into a reason to drive. Everything here is a
// pure function of the season seed plus what the player actually did, so a
// championship can be re-derived, shared or verified — a rival's time is never
// rolled live, it is looked up from (seed, event, stage, driver).
//
// Nothing in this file may throw at the caller. A career that dies because the
// browser refused a write has taken the game down with it, so every storage
// path degrades to "in memory only" instead.

import { clamp, lerp } from "./mathx.js";
import { makeRng, stringSeed } from "./rng.js";
import { SURFACE, surfaceProps } from "./surfaces.js";
import { encodeRun, decodeRun, runByteSize } from "./replay.js";
import { STAGE_BOOK } from "./stage.js";

export const STORAGE_KEY = "opusrally.career";
export const SCHEMA_VERSION = 3;

const MAX_GHOST_CHARS = 180000;

export const POINTS = Object.freeze([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
export const POWER_STAGE_POINTS = Object.freeze([5, 4, 3, 2, 1]);

// Rally-style super rally: a retirement costs you the leg, not the event.
const SUPER_RALLY_PENALTY_MS = 300000;

export const PENALTIES = Object.freeze({
  falseStart: { id: "falseStart", name: "False start", ms: 10000 },
  jumpStart: { id: "jumpStart", name: "Jump start", ms: 5000 },
  cutCorner: { id: "cutCorner", name: "Cut corner", ms: 5000 },
  missedControl: { id: "missedControl", name: "Missed control", ms: 60000 },
  wrongWay: { id: "wrongWay", name: "Wrong direction", ms: 10000 },
  serviceOverrun: { id: "serviceOverrun", name: "Service overrun", ms: 10000 },
  lateToTimeControl: { id: "lateToTimeControl", name: "Late to time control", ms: 10000 },
});

// `presets` are weather.js preset ids: the condition is what the championship
// models and the preset is what the renderer draws, and naming both here is what
// stops a season promising weather the game cannot show. A condition with no
// `nightPreset` cannot be drawn on a night stage.
export const CONDITIONS = Object.freeze({
  clear: { id: "clear", name: "Clear", wetness: 0.00, visibility: 1.00, grip: 1.00, presets: ["clear-dawn", "midday-hard", "golden-hour"], nightPreset: "night-clear" },
  overcast: { id: "overcast", name: "Overcast", wetness: 0.06, visibility: 0.92, grip: 0.99, presets: ["overcast"], nightPreset: "night-clear" },
  damp: { id: "damp", name: "Damp", wetness: 0.38, visibility: 0.84, grip: 0.94, presets: ["light-rain"], nightPreset: "night-rain" },
  rain: { id: "rain", name: "Rain", wetness: 0.72, visibility: 0.64, grip: 0.88, presets: ["heavy-rain"], nightPreset: "night-rain" },
  downpour: { id: "downpour", name: "Downpour", wetness: 1.00, visibility: 0.40, grip: 0.80, presets: ["thunderstorm"], nightPreset: "night-rain" },
  fog: { id: "fog", name: "Fog", wetness: 0.44, visibility: 0.26, grip: 0.92, presets: ["hill-fog"], nightPreset: null },
  snowfall: { id: "snowfall", name: "Snowfall", wetness: 0.54, visibility: 0.54, grip: 0.86, presets: ["light-snow"], nightPreset: null },
  blizzard: { id: "blizzard", name: "Blizzard", wetness: 0.80, visibility: 0.20, grip: 0.74, presets: ["blizzard"], nightPreset: null },
});

export const TIERS = Object.freeze([
  {
    id: "clubman", name: "Clubman Cup", order: 0,
    baseDeficit: 0.030, skillRange: 0.070, skillBias: -0.12,
    pace: 0.88, fieldSize: 12, targetSkill: 0.42,
    mistakeScale: 1.35, payout: 1.0, promotePosition: 3,
    blurb: "Borrowed cars, gravel club rounds, a co-driver who reads too late.",
  },
  {
    id: "national", name: "National Series", order: 1,
    baseDeficit: 0.022, skillRange: 0.055, skillBias: -0.04,
    pace: 0.94, fieldSize: 14, targetSkill: 0.56,
    mistakeScale: 1.15, payout: 1.4, promotePosition: 3,
    blurb: "Real entry lists, real pressure, and the first stage you cannot lift on.",
  },
  {
    id: "continental", name: "Continental Challenge", order: 2,
    baseDeficit: 0.014, skillRange: 0.042, skillBias: 0.04,
    pace: 1.00, fieldSize: 16, targetSkill: 0.68,
    mistakeScale: 1.0, payout: 2.0, promotePosition: 3,
    blurb: "Four surfaces, three continents, one set of tyres too few.",
  },
  {
    id: "masters", name: "Masters Championship", order: 3,
    baseDeficit: 0.008, skillRange: 0.030, skillBias: 0.10,
    pace: 1.05, fieldSize: 16, targetSkill: 0.80,
    mistakeScale: 0.85, payout: 2.8, promotePosition: 2,
    blurb: "Factory machinery. Nobody here makes the mistake you are waiting for.",
  },
  {
    id: "legends", name: "Legends Invitational", order: 4,
    baseDeficit: 0.004, skillRange: 0.020, skillBias: 0.16,
    pace: 1.09, fieldSize: 12, targetSkill: 0.92,
    mistakeScale: 0.7, payout: 4.0, promotePosition: 1,
    blurb: "Twelve cars, six events, and two tenths a kilometre between first and last.",
  },
]);

export const CARS = Object.freeze([
  { id: "vantore16", name: "Vantore Cadence 1.6", class: "Cup", drive: "FWD", pace: 0.86, price: 0, tier: 0 },
  { id: "sprintr", name: "Kestrel Sprint R", class: "Cup", drive: "RWD", pace: 0.89, price: 26000, tier: 0 },
  { id: "auroras", name: "Norlys Aurora S", class: "National", drive: "4WD", pace: 0.94, price: 48000, tier: 1 },
  { id: "taiga4x", name: "Sever Taiga 4X", class: "National", drive: "4WD", pace: 0.96, price: 62000, tier: 1 },
  { id: "vantorgt", name: "Ibera Vantor GT", class: "Continental", drive: "4WD", pace: 1.00, price: 96000, tier: 2 },
  { id: "kazegt4", name: "Tsurumi Kaze GT4", class: "Continental", drive: "4WD", pace: 1.02, price: 118000, tier: 2 },
  { id: "kobolt", name: "Vulkan Kobolt RS", class: "Masters", drive: "4WD", pace: 1.05, price: 168000, tier: 3 },
  { id: "mistral", name: "Brière Mistral R", class: "Masters", drive: "4WD", pace: 1.06, price: 192000, tier: 3 },
  { id: "vortex1", name: "Aurora Vortex 1", class: "Legends", drive: "4WD", pace: 1.09, price: 275000, tier: 4 },
  { id: "simoom", name: "Marhoun Simoom H", class: "Legends", drive: "RWD", pace: 1.07, price: 240000, tier: 4 },
]);

// Upgrades buy pace and reliability, never both cheaply. `pace` is a multiplier
// added to the car's pace index; `service` shortens repairs at the park.
export const UPGRADES = Object.freeze([
  { id: "engine", name: "Engine Programme", levels: 5, pace: 0.0060, reliability: -0.010, service: 0, cost: [4000, 7500, 12000, 19000, 30000] },
  { id: "gearbox", name: "Transmission", levels: 5, pace: 0.0035, reliability: 0.004, service: 0, cost: [3200, 6000, 9500, 15000, 24000] },
  { id: "suspension", name: "Damper Development", levels: 5, pace: 0.0050, reliability: 0.010, service: 0, cost: [3600, 6800, 11000, 17000, 27000] },
  { id: "tyres", name: "Tyre Programme", levels: 4, pace: 0.0045, reliability: 0.006, service: 0, cost: [5000, 9000, 15000, 24000] },
  { id: "aero", name: "Aero Package", levels: 3, pace: 0.0040, reliability: 0, service: 0, cost: [8000, 15000, 26000] },
  { id: "weight", name: "Weight Reduction", levels: 3, pace: 0.0055, reliability: -0.016, service: 0, cost: [9000, 17000, 30000] },
  { id: "crew", name: "Service Crew", levels: 4, pace: 0, reliability: 0.020, service: 0.15, cost: [4500, 8500, 14000, 22000] },
]);

export const COMPONENTS = Object.freeze([
  { id: "engine", name: "Engine", repairMinutesFull: 22 },
  { id: "gearbox", name: "Gearbox", repairMinutesFull: 16 },
  { id: "suspension", name: "Suspension", repairMinutesFull: 12 },
  { id: "steering", name: "Steering", repairMinutesFull: 14 },
  { id: "cooling", name: "Cooling", repairMinutesFull: 9 },
  { id: "electrics", name: "Electrics", repairMinutesFull: 7 },
  { id: "bodywork", name: "Bodywork", repairMinutesFull: 10 },
]);

function rival(id, name, team, nat, skill, consistency, wetSkill, aggression, reliability, pref) {
  return Object.freeze({ id, name, team, nat, skill, consistency, wetSkill, aggression, reliability, pref: Object.freeze(pref) });
}

// Surface preference is a -1..+1 tilt on a rival's deficit, worth 1.2% of stage
// time at the extremes. The calendar reaches three of the eight keys below:
// fourteen gravel stages, eight tarmac and two dirt. Nothing the book ships is
// snow or ice, so five of the eight keys in every row are currently unread —
// kept because the book is what changes, not this table.
//
// What it buys is a field that reorders rather than one that only spreads. A
// field is 12 to 16 cars picked by nearness to the tier's target skill, so the
// question is what the tilt does to THAT dozen and not to this table of thirty
// — and the two ends of the ladder answer it differently. In Clubman the spread
// in raw pace still carries the order, and going from gravel to tarmac moves 6
// of the 12 places. In Legends the tier's +0.16 skill bias clamps nine of the
// twelve entries to skill 1, so raw pace separates nobody at the front and the
// tilt is the whole of the ordering: the quickest car is Bellucco on the eight
// tarmac stages (worth +1.08% to him), Beltrán-Cea and Yrjönen dead level on
// the fourteen gravel ones (+0.72% each, split by the per-stage roll and by
// nothing else), and Halloway on the two dirt ones (+0.96%) — and 10 to 12 of
// the 12 places move between one surface and another. Deterministic part only:
// the weather terms, the per-stage roll and the mistakes all land on top.
export const RIVALS = Object.freeze([
  rival("kirvala", "Teo Kirvala", "Norlys Motorsport", "Norvale", 0.94, 0.88, 0.72, 0.55, 0.90, { snow: 0.9, ice: 0.8, gravel: 0.4, tarmac: -0.3, sand: -0.4, mud: 0.2, rock: 0.0, dirt: 0.3 }),
  rival("sallin", "Maret Sallin", "Norlys Motorsport", "Norvale", 0.81, 0.83, 0.66, 0.42, 0.92, { snow: 0.7, ice: 0.6, gravel: 0.3, tarmac: -0.2, sand: -0.3, mud: 0.1, rock: 0.0, dirt: 0.2 }),
  rival("bellucco", "Dario Bellucco", "Scuderia Vantore", "Ferravia", 0.96, 0.86, 0.80, 0.68, 0.84, { tarmac: 0.9, rock: 0.4, gravel: -0.1, snow: -0.5, ice: -0.4, sand: -0.3, mud: -0.2, dirt: 0.0 }),
  rival("marentti", "Enzo Marentti", "Scuderia Vantore", "Ferravia", 0.78, 0.72, 0.58, 0.74, 0.80, { tarmac: 0.7, rock: 0.3, gravel: -0.2, snow: -0.4, ice: -0.4, sand: -0.2, mud: -0.3, dirt: 0.0 }),
  rival("yrjonen", "Kaisa Yrjönen", "Aurora Works", "Norvale", 0.92, 0.94, 0.86, 0.38, 0.94, { gravel: 0.6, dirt: 0.5, snow: 0.4, tarmac: 0.1, mud: 0.3, rock: 0.2, sand: 0.0, ice: 0.2 }),
  rival("halden", "Petter Halden", "Aurora Works", "Norvale", 0.86, 0.79, 0.62, 0.60, 0.88, { gravel: 0.5, dirt: 0.4, snow: 0.5, tarmac: -0.1, mud: 0.2, rock: 0.1, sand: -0.1, ice: 0.3 }),
  rival("quillic", "Ronan Quillic", "Brière Rallye Team", "Aubrac", 0.89, 0.81, 0.90, 0.52, 0.86, { tarmac: 0.5, mud: 0.6, gravel: 0.2, dirt: 0.3, snow: 0.0, ice: 0.0, sand: -0.4, rock: 0.1 }),
  rival("devrec", "Mathis Devrec", "Brière Rallye Team", "Aubrac", 0.74, 0.68, 0.70, 0.70, 0.78, { tarmac: 0.4, mud: 0.4, gravel: 0.1, dirt: 0.2, snow: -0.1, ice: -0.2, sand: -0.3, rock: 0.0 }),
  rival("merrow", "Sian Merrow", "Kestrel Racing", "Cairnmoor", 0.83, 0.90, 0.88, 0.34, 0.91, { gravel: 0.5, mud: 0.7, dirt: 0.3, tarmac: 0.0, rock: 0.3, snow: 0.1, ice: 0.0, sand: -0.3 }),
  rival("pendrell", "Gareth Pendrell", "Kestrel Racing", "Cairnmoor", 0.69, 0.74, 0.76, 0.48, 0.85, { gravel: 0.4, mud: 0.5, dirt: 0.2, tarmac: 0.1, rock: 0.2, snow: 0.0, ice: -0.1, sand: -0.2 }),
  rival("brandhof", "Ilse Brandhof", "Vulkan Sport", "Rhenweit", 0.91, 0.87, 0.74, 0.46, 0.93, { tarmac: 0.6, gravel: 0.3, rock: 0.5, dirt: 0.2, snow: 0.1, ice: 0.0, mud: 0.0, sand: -0.2 }),
  rival("ehrlich", "Jonas Ehrlich", "Vulkan Sport", "Rhenweit", 0.76, 0.80, 0.60, 0.44, 0.90, { tarmac: 0.5, gravel: 0.2, rock: 0.4, dirt: 0.1, snow: 0.0, ice: -0.1, mud: -0.1, sand: -0.2 }),
  rival("beltran", "Tomás Beltrán-Cea", "Ibera Rally Sport", "Serrania", 0.88, 0.76, 0.64, 0.72, 0.82, { gravel: 0.6, rock: 0.6, dirt: 0.5, sand: 0.3, tarmac: 0.2, mud: -0.1, snow: -0.4, ice: -0.4 }),
  rival("salcedo", "Nuria Salcedo", "Ibera Rally Sport", "Serrania", 0.72, 0.85, 0.68, 0.36, 0.89, { gravel: 0.5, rock: 0.5, dirt: 0.4, sand: 0.3, tarmac: 0.1, mud: 0.0, snow: -0.3, ice: -0.3 }),
  rival("turgan", "Aleksei Turgan", "Sever Rally Works", "Kolvara", 0.85, 0.71, 0.56, 0.78, 0.76, { snow: 0.8, ice: 0.7, gravel: 0.3, dirt: 0.3, mud: 0.2, rock: 0.0, tarmac: -0.4, sand: -0.5 }),
  rival("zolnik", "Vera Zolnik", "Sever Rally Works", "Kolvara", 0.79, 0.88, 0.72, 0.40, 0.90, { snow: 0.6, ice: 0.6, gravel: 0.3, dirt: 0.2, mud: 0.2, rock: 0.1, tarmac: -0.2, sand: -0.3 }),
  rival("okuraya", "Hana Okuraya", "Tsurumi Rally Project", "Kaido", 0.90, 0.92, 0.84, 0.44, 0.95, { tarmac: 0.5, gravel: 0.4, dirt: 0.4, mud: 0.3, rock: 0.2, snow: 0.2, ice: 0.1, sand: -0.1 }),
  rival("sadamichi", "Riku Sadamichi", "Tsurumi Rally Project", "Kaido", 0.77, 0.78, 0.66, 0.58, 0.88, { tarmac: 0.4, gravel: 0.3, dirt: 0.3, mud: 0.2, rock: 0.1, snow: 0.1, ice: 0.0, sand: 0.0 }),
  rival("halloway", "Bruce Halloway", "Southern Cross Rally Squad", "Wattlegate", 0.82, 0.70, 0.52, 0.80, 0.74, { dirt: 0.8, gravel: 0.5, sand: 0.6, rock: 0.3, tarmac: -0.1, mud: 0.0, snow: -0.5, ice: -0.6 }),
  rival("wrenford", "Talia Wrenford", "Southern Cross Rally Squad", "Wattlegate", 0.71, 0.82, 0.60, 0.50, 0.86, { dirt: 0.6, gravel: 0.4, sand: 0.5, rock: 0.2, tarmac: 0.0, mud: 0.0, snow: -0.4, ice: -0.4 }),
  rival("adisa", "Kwame Adisa", "Savanna Rally Union", "Bahari", 0.80, 0.75, 0.58, 0.62, 0.83, { sand: 0.9, dirt: 0.5, gravel: 0.3, rock: 0.3, tarmac: 0.0, mud: -0.1, snow: -0.6, ice: -0.6 }),
  rival("mbanze", "Lerato Mbanze", "Savanna Rally Union", "Bahari", 0.67, 0.86, 0.62, 0.32, 0.92, { sand: 0.7, dirt: 0.4, gravel: 0.3, rock: 0.2, tarmac: 0.0, mud: 0.0, snow: -0.5, ice: -0.5 }),
  rival("zawrocki", "Marek Zawrocki", "Bialy Rally Team", "Wislaw", 0.75, 0.69, 0.70, 0.66, 0.79, { gravel: 0.5, mud: 0.5, snow: 0.4, dirt: 0.3, tarmac: 0.0, rock: 0.1, ice: 0.2, sand: -0.3 }),
  rival("latoszek", "Ewa Latoszek", "Bialy Rally Team", "Wislaw", 0.63, 0.84, 0.74, 0.30, 0.90, { gravel: 0.4, mud: 0.4, snow: 0.3, dirt: 0.3, tarmac: 0.1, rock: 0.1, ice: 0.1, sand: -0.2 }),
  rival("orcades", "Fenn Orcades", "Privateer", "Cairnmoor", 0.58, 0.62, 0.50, 0.66, 0.70, { gravel: 0.3, mud: 0.3, dirt: 0.2, tarmac: 0.0, rock: 0.0, snow: 0.0, ice: 0.0, sand: -0.2 }),
  rival("vasquel", "Ines Vasquel", "Privateer", "Serrania", 0.52, 0.66, 0.48, 0.54, 0.72, { gravel: 0.2, dirt: 0.2, rock: 0.2, sand: 0.2, tarmac: 0.0, mud: 0.0, snow: -0.2, ice: -0.2 }),
  rival("kaldbeck", "Owen Kaldbeck", "Privateer", "Norvale", 0.46, 0.58, 0.44, 0.58, 0.68, { snow: 0.4, ice: 0.3, gravel: 0.2, dirt: 0.1, tarmac: -0.1, mud: 0.0, rock: 0.0, sand: -0.3 }),
  rival("threlfall", "Amara Threlfall", "Privateer", "Wattlegate", 0.39, 0.55, 0.40, 0.60, 0.66, { dirt: 0.4, sand: 0.3, gravel: 0.2, tarmac: 0.0, rock: 0.0, mud: -0.1, snow: -0.3, ice: -0.3 }),
  rival("dunmarrow", "Cliff Dunmarrow", "Privateer", "Cairnmoor", 0.33, 0.50, 0.46, 0.52, 0.64, { mud: 0.4, gravel: 0.2, dirt: 0.1, tarmac: 0.0, rock: 0.0, snow: -0.1, ice: -0.2, sand: -0.3 }),
  rival("penholt", "Rue Penholt", "Privateer", "Rhenweit", 0.28, 0.48, 0.38, 0.48, 0.62, { tarmac: 0.3, gravel: 0.1, rock: 0.1, dirt: 0.0, mud: -0.1, snow: -0.2, ice: -0.3, sand: -0.3 }),
]);

// Reference average speeds, km/h, for a pace index of 1.0 on a stage of flow 1.0.
const SURFACE_SPEED = Object.freeze({
  [SURFACE.TARMAC]: 102, [SURFACE.GRAVEL]: 98, [SURFACE.DIRT]: 94,
  [SURFACE.SNOW]: 86, [SURFACE.ICE]: 74, [SURFACE.GRASS]: 70,
  [SURFACE.MUD]: 78, [SURFACE.SAND]: 82, [SURFACE.ROCK]: 84, [SURFACE.WATER]: 50,
});

function st(id, name, km, surface, flow, weatherBias, extra) {
  return Object.freeze(Object.assign({ id, name, km, surface, flow, weatherBias: weatherBias || 0 }, extra));
}

function leg(name, serviceMinutes, stages) {
  return Object.freeze({ name, serviceMinutes, stages: Object.freeze(stages) });
}

// A road's character is one word in the stage book and a speed multiplier here,
// and this table is the whole of the translation between them.
const FLOW_BY_PERSONALITY = Object.freeze({
  fast: 1.12, open: 1.08, flowing: 1.00, mixed: 0.94, twisty: 0.88, technical: 0.84,
});

// Which career condition each weather.js preset counts as, so an event's climate
// can be read off the roads it is run on rather than invented beside them.
const CONDITION_OF_PRESET = Object.freeze({
  "clear-dawn": "clear", "midday-hard": "clear", "golden-hour": "clear",
  overcast: "overcast", "light-rain": "damp", "heavy-rain": "rain",
  thunderstorm: "downpour", "hill-fog": "fog", "light-snow": "snowfall",
  blizzard: "blizzard", "night-clear": "clear", "night-rain": "rain",
});

const NIGHT_TIME_OF_DAY = /dusk|evening|sunset|night/i;

// The calendar is derived from STAGE_BOOK, and that is the point of it. It used
// to be fifty-one hand-written stage names — kal-hovden, van-costiera — none of
// which stage.js can build, so a season scheduled roads the renderer had never
// heard of and the championship could not be entered at all. A career stage is
// now a book road plus which pass of it this is; `stage.book` is the id
// stageFromBook() wants, and there is one stage universe instead of two.
//
// The choice was between deriving the calendar from the book and generating a
// road per invented stage. The book wins on evidence: its twelve roads are the
// only ones tests/drivable.test.mjs has autopiloted to a finish, and a
// championship over fifty unproven roads is fifty chances to strand a player.
function bookStage(entry, pass, powerStage) {
  return st(
    pass === 1 ? entry.id : `${entry.id}-${pass}`,
    pass === 1 ? entry.name : `${entry.name} (second pass)`,
    entry.params.length / 1000,
    entry.params.surface,
    FLOW_BY_PERSONALITY[entry.personality] ?? 1,
    // A second pass runs later in the day, and later in the day is wetter.
    pass === 1 ? 0 : 0.2,
    {
      book: entry.id,
      night: NIGHT_TIME_OF_DAY.test(String(entry.timeOfDay ?? "")),
      label: entry.surfaceLabel,
      notes: entry.notes,
      powerStage: !!powerStage,
    },
  );
}

// A rally runs each of its roads twice, which is where the leg structure comes
// from: two roads make a four-stage event over two legs, three make six over
// three. Pass one of everything, then pass two of everything, cut into legs.
function eventFromBook(roads) {
  const runs = [];
  for (const r of roads) runs.push([r, 1]);
  for (const r of roads) runs.push([r, 2]);
  const legCount = clamp(Math.round(runs.length / 2), 2, 3);
  const legs = [];
  let taken = 0;
  for (let i = 0; i < legCount; i += 1) {
    const size = Math.ceil((runs.length - taken) / (legCount - i));
    const slice = runs.slice(taken, taken + size);
    taken += size;
    const last = i === legCount - 1;
    legs.push(leg(`Leg ${i + 1}`, i === 0 ? 20 : 30, slice.map(([entry, pass], j) => (
      bookStage(entry, pass, last && j === slice.length - 1)
    ))));
  }
  const first = roads[0];
  // Every rally can be overcast, and a climate table with one entry in it is not
  // weather — Tamarosa's two roads are both authored clear.
  const weather = roads.map((r) => CONDITION_OF_PRESET[r.weather] || "clear").concat("overcast");
  return Object.freeze({
    id: String(first.country).toLowerCase().replace(/[^a-z0-9]+/g, ""),
    name: first.rally,
    country: first.country,
    hq: first.region,
    weather: Object.freeze(weather),
    surfaces: Object.freeze([...new Set(roads.map((r) => r.params.surface))]),
    blurb: `${roads.length} roads in the ${first.region}, each run twice: ${roads.map((r) => r.surfaceLabel.toLowerCase()).join(", ")}.`,
    legs: Object.freeze(legs),
  });
}

export const RALLIES = Object.freeze((() => {
  const byRally = new Map();
  for (const entry of STAGE_BOOK) {
    if (!byRally.has(entry.rally)) byRally.set(entry.rally, []);
    byRally.get(entry.rally).push(entry);
  }
  const out = [];
  // A one-road rally cannot make a leg structure, so it is not an event.
  for (const roads of byRally.values()) if (roads.length >= 2) out.push(eventFromBook(roads));
  return out;
})());

const RALLY_BY_ID = new Map(RALLIES.map((r) => [r.id, r]));
const CAR_BY_ID = new Map(CARS.map((c) => [c.id, c]));
const RIVAL_BY_ID = new Map(RIVALS.map((r) => [r.id, r]));
const TIER_BY_ID = new Map(TIERS.map((t) => [t.id, t]));
const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

const STAGE_INDEX = (() => {
  const m = new Map();
  for (const ev of RALLIES) {
    let n = 0;
    for (let li = 0; li < ev.legs.length; li += 1) {
      for (const stage of ev.legs[li].stages) {
        m.set(stage.id, { stage, event: ev, leg: ev.legs[li], legIndex: li, order: n });
        n += 1;
      }
    }
  }
  return m;
})();

export function rallyById(id) { return RALLY_BY_ID.get(id) || null; }
export function stageById(id) { const e = STAGE_INDEX.get(id); return e ? e.stage : null; }
export function stageContext(id) { return STAGE_INDEX.get(id) || null; }
export function carById(id) { return CAR_BY_ID.get(id) || null; }
export function tierById(id) { return TIER_BY_ID.get(id) || TIERS[0]; }
export function eventStageCount(ev) {
  let n = 0;
  for (const l of ev.legs) n += l.stages.length;
  return n;
}

function surfaceKey(id) {
  return surfaceProps(id).name.toLowerCase();
}

export function conditionsFor(seed, eventId, stageId) {
  const ev = RALLY_BY_ID.get(eventId);
  const ctx = STAGE_INDEX.get(stageId);
  if (!ev || !ctx) return Object.assign({ night: false, preset: "clear-dawn", key: "clear-dawn" }, CONDITIONS.clear);
  const rng = makeRng(stringSeed(`${seed}|wx|${eventId}|${stageId}`));
  const night = !!ctx.stage.night;
  // A night stage may only draw a condition weather.js can actually light at
  // night. Without the filter a night fog draw resolves to a preset with no fog
  // in it, and the stage card promises a sky the renderer never shows.
  const table = night ? ev.weather.filter((k) => (CONDITIONS[k] || {}).nightPreset) : ev.weather;
  const draw = table.length ? table : ["clear"];
  let pick = draw[rng.int(0, draw.length - 1)];
  // The stage's own bias pulls a dry draw towards a wet one without ever
  // overriding the event's climate.
  if (ctx.stage.weatherBias > 0 && rng.chance(ctx.stage.weatherBias)) {
    const wetter = draw.filter((k) => (CONDITIONS[k] || CONDITIONS.clear).wetness > (CONDITIONS[pick] || CONDITIONS.clear).wetness);
    if (wetter.length) pick = wetter[rng.int(0, wetter.length - 1)];
  }
  const base = CONDITIONS[pick] || CONDITIONS.clear;
  const preset = night ? base.nightPreset : base.presets[rng.int(0, base.presets.length - 1)];
  // Cold comes from the climate, not from the road: no entry in the stage book
  // declares a SNOW or ICE surface, so reading it off ev.surfaces reported a
  // summer afternoon for a rally that draws snowfall two stages in three.
  const cold = ev.weather.includes("snowfall") || ev.weather.includes("blizzard");
  return {
    id: base.id,
    name: night ? `${base.name}, night` : base.name,
    preset,
    night,
    wetness: base.wetness,
    visibility: night ? base.visibility * 0.55 : base.visibility,
    grip: base.grip,
    tempC: Math.round(cold ? lerp(-16, 3, rng.next()) : lerp(4, 34, rng.next())) - (night ? 5 : 0),
    // The record key IS the preset the renderer will use, so a personal best set
    // in these conditions is the one the stage card reads back.
    key: preset,
  };
}

function conditionPace(cond) {
  return 1 + (1 - cond.grip) * 0.90 + (1 - cond.visibility) * 0.12;
}

export function estimateStageTime(stage, opts = {}) {
  if (!stage) return 0;
  const pace = Math.max(0.4, opts.pace ?? 1);
  const cond = opts.conditions;
  const speed = (SURFACE_SPEED[stage.surface] ?? 90) * stage.flow * pace;
  const seconds = (stage.km / speed) * 3600 * (cond ? conditionPace(cond) : 1);
  return seconds * 1000;
}

// A rival's stage time. Deterministic in (seed, event, stage, driver), so adding
// or dropping a rival never shifts anyone else's number.
export function rivalStageTime(rivalId, ctx) {
  const r = RIVAL_BY_ID.get(rivalId);
  const stage = ctx.stage;
  const tier = ctx.tier;
  if (!r || !stage || !tier) return { timeMs: 0, penaltyMs: 0, status: "retired", note: "no entry" };

  const rng = makeRng(stringSeed(`${ctx.seed}|${ctx.eventId}|${stage.id}|${r.id}`));
  const cond = ctx.conditions || CONDITIONS.clear;
  const base = estimateStageTime(stage, { pace: tier.pace, conditions: cond });

  const skill = clamp(r.skill + tier.skillBias, 0, 1);
  // `bias` is the one number that cannot be known until the car physics is
  // calibrated: it shifts the whole field's pace against the player's.
  let deficit = tier.baseDeficit + (1 - skill) * tier.skillRange + (ctx.bias || 0);
  deficit -= (r.pref[surfaceKey(stage.surface)] ?? 0) * 0.012;
  deficit += (1 - r.wetSkill) * cond.wetness * 0.022;
  deficit += (1 - r.consistency) * (1 - cond.visibility) * 0.018;

  const sigma = 0.0035 + (1 - r.consistency) * 0.011;
  deficit += clamp(rng.gauss(0, sigma), -3 * sigma, 3 * sigma);

  let timeMs = base * (1 + Math.max(deficit, -0.02));
  let note = "";
  let lostMs = 0;

  const mistakeP = clamp((0.018 + (1 - r.consistency) * 0.055 + r.aggression * 0.030
    + cond.wetness * 0.025) * tier.mistakeScale, 0, 0.35);
  if (rng.chance(mistakeP)) {
    // Squared roll: most mistakes are a couple of seconds, a few are a minute.
    const u = rng.next();
    lostMs = (1.5 + u * u * 58) * 1000;
    timeMs += lostMs;
    note = lostMs > 25000 ? "off the road" : lostMs > 8000 ? "spun it" : "moment";
  }

  const bigOne = lostMs > 30000;
  const retireP = clamp(0.0035 + (1 - r.reliability) * 0.014 + r.aggression * 0.006
    + (bigOne ? 0.22 : 0), 0, 0.30);
  if (rng.chance(retireP)) {
    return {
      timeMs: 0, penaltyMs: 0, status: "retired",
      note: bigOne ? "retired, accident damage" : "retired, mechanical",
    };
  }

  return { timeMs: Math.round(timeMs), penaltyMs: 0, status: "ok", note };
}

export function selectField(seed, tierId, size) {
  const tier = tierById(tierId);
  const want = size ?? tier.fieldSize;
  const ranked = RIVALS.slice().sort((a, b) => {
    const da = Math.abs(a.skill - tier.targetSkill);
    const db = Math.abs(b.skill - tier.targetSkill);
    return da === db ? (a.id < b.id ? -1 : 1) : da - db;
  }).slice(0, Math.min(want, RIVALS.length));
  const rng = makeRng(stringSeed(`${seed}|field|${tier.id}`));
  return rng.shuffle(ranked.map((r) => r.id));
}

function safeStorage(storage) {
  const has = !!storage && typeof storage === "object";
  return {
    ok: has,
    get(key) {
      try {
        if (!has || typeof storage.getItem !== "function") return null;
        const v = storage.getItem(key);
        return typeof v === "string" ? v : null;
      } catch (err) { return null; }
    },
    set(key, value) {
      try {
        if (!has || typeof storage.setItem !== "function") return false;
        storage.setItem(key, value);
        return true;
      } catch (err) { return false; }
    },
    remove(key) {
      try {
        if (has && typeof storage.removeItem === "function") storage.removeItem(key);
      } catch (err) { /* a storage that cannot forget is still usable */ }
    },
  };
}

function blankProfile() {
  const upgrades = {};
  for (const u of UPGRADES) upgrades[u.id] = 0;
  return {
    name: "Privateer",
    team: "Independent",
    credits: 30000,
    carId: CARS[0].id,
    carsOwned: [CARS[0].id],
    tiersUnlocked: [TIERS[0].id],
    upgrades,
    difficultyBias: 0,
    seasonsCompleted: 0,
    titles: [],
    bestSeasonPosition: null,
  };
}

function blankState() {
  return {
    v: SCHEMA_VERSION,
    profile: blankProfile(),
    season: null,
    records: {},
    history: [],
  };
}

// v1 kept a flat best-time map and nothing else; v2 added per-car records but no
// season. Both still load — a saved personal best outlives every schema.
function migrate(raw) {
  if (!raw || typeof raw !== "object") return null;
  let data = raw;
  let v = Number(data.v) || 1;

  if (v === 1) {
    const next = blankState();
    next.profile.credits = Number(data.credits) || next.profile.credits;
    if (Array.isArray(data.unlocked)) {
      for (const id of data.unlocked) if (CAR_BY_ID.has(id) && !next.profile.carsOwned.includes(id)) next.profile.carsOwned.push(id);
    }
    const legacyCar = CAR_BY_ID.has(data.car) ? data.car : CARS[0].id;
    if (data.best && typeof data.best === "object") {
      for (const stageId of Object.keys(data.best)) {
        const ms = Number(data.best[stageId]);
        if (!Number.isFinite(ms) || ms <= 0) continue;
        next.records[stageId] = { [legacyCar]: { clear: { timeMs: Math.round(ms), splits: [], bestSplits: [], carId: legacyCar, weatherKey: "clear", tierId: TIERS[0].id, runs: 1, ghost: null } } };
      }
    }
    data = next;
    v = 2;
  }

  if (v === 2) {
    const next = blankState();
    Object.assign(next.profile, data.profile || {});
    for (const u of UPGRADES) {
      const lvl = Number((data.profile && data.profile.upgrades || {})[u.id]) || 0;
      next.profile.upgrades[u.id] = clamp(Math.round(lvl), 0, u.levels);
    }
    next.records = data.records && typeof data.records === "object" ? data.records : {};
    next.history = Array.isArray(data.history) ? data.history : [];
    next.season = data.season || null;
    data = next;
    v = 3;
  }

  if (v !== SCHEMA_VERSION) return null;
  return data;
}

function normalise(state) {
  const out = blankState();
  if (!state || typeof state !== "object") return out;
  const p = state.profile && typeof state.profile === "object" ? state.profile : {};
  out.profile.name = typeof p.name === "string" && p.name ? p.name.slice(0, 40) : out.profile.name;
  out.profile.team = typeof p.team === "string" && p.team ? p.team.slice(0, 40) : out.profile.team;
  out.profile.credits = Number.isFinite(Number(p.credits)) ? Math.max(0, Math.round(Number(p.credits))) : out.profile.credits;
  out.profile.carId = CAR_BY_ID.has(p.carId) ? p.carId : out.profile.carId;
  if (Array.isArray(p.carsOwned)) {
    for (const id of p.carsOwned) if (CAR_BY_ID.has(id) && !out.profile.carsOwned.includes(id)) out.profile.carsOwned.push(id);
  }
  if (Array.isArray(p.tiersUnlocked)) {
    for (const id of p.tiersUnlocked) if (TIER_BY_ID.has(id) && !out.profile.tiersUnlocked.includes(id)) out.profile.tiersUnlocked.push(id);
  }
  if (p.upgrades && typeof p.upgrades === "object") {
    for (const u of UPGRADES) {
      const lvl = Number(p.upgrades[u.id]);
      out.profile.upgrades[u.id] = Number.isFinite(lvl) ? clamp(Math.round(lvl), 0, u.levels) : 0;
    }
  }
  out.profile.difficultyBias = Number.isFinite(Number(p.difficultyBias))
    ? clamp(Number(p.difficultyBias), -0.05, 0.05) : 0;
  out.profile.seasonsCompleted = Math.max(0, Math.round(Number(p.seasonsCompleted) || 0));
  out.profile.titles = Array.isArray(p.titles) ? p.titles.slice(0, 64) : [];
  out.profile.bestSeasonPosition = Number.isFinite(Number(p.bestSeasonPosition)) ? Number(p.bestSeasonPosition) : null;
  if (!out.profile.carsOwned.includes(out.profile.carId)) out.profile.carId = out.profile.carsOwned[0];
  out.records = state.records && typeof state.records === "object" ? state.records : {};
  out.history = Array.isArray(state.history) ? state.history : [];
  out.season = state.season && typeof state.season === "object" ? state.season : null;
  return out;
}

function driverEntry(id, name, team, isPlayer) {
  return { id, name, team, isPlayer: !!isPlayer };
}

function comparePosition(a, b) {
  if (a.status === "ok" && b.status !== "ok") return -1;
  if (b.status === "ok" && a.status !== "ok") return 1;
  if (a.totalMs !== b.totalMs) return a.totalMs - b.totalMs;
  return a.driverId < b.driverId ? -1 : 1;
}

// Positions, gap to leader and gap to the car in front — the three numbers a
// results screen is actually made of.
function classify(entries) {
  const list = entries.slice().sort(comparePosition);
  let leader = null;
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    e.position = i + 1;
    if (e.status === "ok" && leader === null) leader = e.totalMs;
    e.gapLeaderMs = e.status === "ok" && leader !== null ? e.totalMs - leader : null;
    const prev = i > 0 ? list[i - 1] : null;
    e.gapAheadMs = e.status === "ok" && prev && prev.status === "ok" ? e.totalMs - prev.totalMs : null;
  }
  return list;
}

export function createCareer(storage, opts = {}) {
  const store = safeStorage(storage !== undefined ? storage
    : (typeof globalThis !== "undefined" ? globalThis.localStorage : null));
  const key = opts.key || `${STORAGE_KEY}.v${SCHEMA_VERSION}`;
  const legacyKeys = opts.legacyKeys || [`${STORAGE_KEY}.v1`, `${STORAGE_KEY}.v2`, STORAGE_KEY];
  const now = typeof opts.now === "function" ? opts.now : () => 0;

  const career = {
    key,
    state: blankState(),
    storageOk: store.ok,
    lastSaveOk: true,
    lastError: null,
  };

  function readRaw() {
    const candidates = [key].concat(legacyKeys);
    for (const k of candidates) {
      const text = store.get(k);
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        const migrated = migrate(parsed);
        if (migrated) return { data: migrated, from: k };
        career.lastError = `unreadable save at ${k}`;
      } catch (err) {
        career.lastError = `corrupt save at ${k}`;
      }
    }
    return null;
  }

  career.load = function load() {
    let found = null;
    try {
      found = readRaw();
    } catch (err) {
      career.lastError = "load failed";
    }
    career.state = normalise(found ? found.data : null);
    career.loadedFrom = found ? found.from : null;
    return career.state;
  };

  career.save = function save() {
    let text = "";
    try {
      text = JSON.stringify(career.state);
    } catch (err) {
      career.lastSaveOk = false;
      career.lastError = "serialise failed";
      return false;
    }
    let ok = store.set(key, text);
    if (!ok) {
      // Almost always the quota: shed the ghosts, which are the only thing in
      // here big enough to matter, and keep the times.
      career.lastError = "storage write refused";
      dropGhosts();
      try { ok = store.set(key, JSON.stringify(career.state)); } catch (err) { ok = false; }
    }
    career.lastSaveOk = ok;
    return ok;
  };

  function dropGhosts() {
    const recs = career.state.records;
    for (const stageId of Object.keys(recs)) {
      const byCar = recs[stageId];
      if (!byCar || typeof byCar !== "object") continue;
      for (const carId of Object.keys(byCar)) {
        const byWeather = byCar[carId];
        if (!byWeather || typeof byWeather !== "object") continue;
        for (const wk of Object.keys(byWeather)) {
          if (byWeather[wk] && byWeather[wk].ghost) byWeather[wk].ghost = null;
        }
      }
    }
  }

  career.reset = function reset() {
    career.state = blankState();
    store.remove(key);
    return career.state;
  };

  career.carSetup = function carSetup(carId) {
    const id = carId || career.state.profile.carId;
    const car = CAR_BY_ID.get(id) || CARS[0];
    const up = career.state.profile.upgrades;
    let pace = car.pace;
    let reliability = 1;
    let service = 0;
    for (const u of UPGRADES) {
      const lvl = clamp(Math.round(up[u.id] || 0), 0, u.levels);
      pace += u.pace * lvl;
      reliability += u.reliability * lvl;
      service += u.service * lvl;
    }
    return {
      carId: car.id, car, pace,
      reliability: clamp(reliability, 0.6, 1.4),
      serviceSpeed: 1 + service,
    };
  };

  career.upgradeCost = function upgradeCost(upgradeId) {
    const u = UPGRADE_BY_ID.get(upgradeId);
    if (!u) return null;
    const lvl = clamp(Math.round(career.state.profile.upgrades[u.id] || 0), 0, u.levels);
    if (lvl >= u.levels) return null;
    return u.cost[lvl];
  };

  career.buyUpgrade = function buyUpgrade(upgradeId) {
    const cost = career.upgradeCost(upgradeId);
    if (cost === null) return { ok: false, reason: "maxed" };
    if (career.state.profile.credits < cost) return { ok: false, reason: "credits", short: cost - career.state.profile.credits };
    career.state.profile.credits -= cost;
    career.state.profile.upgrades[upgradeId] += 1;
    career.save();
    return { ok: true, level: career.state.profile.upgrades[upgradeId], spent: cost };
  };

  career.buyCar = function buyCar(carId) {
    const car = CAR_BY_ID.get(carId);
    if (!car) return { ok: false, reason: "unknown car" };
    const p = career.state.profile;
    if (p.carsOwned.includes(carId)) return { ok: false, reason: "owned" };
    const tier = TIERS[car.tier];
    if (tier && !p.tiersUnlocked.includes(tier.id)) return { ok: false, reason: "tier locked", tier: tier.id };
    if (p.credits < car.price) return { ok: false, reason: "credits", short: car.price - p.credits };
    p.credits -= car.price;
    p.carsOwned.push(carId);
    career.save();
    return { ok: true, carId, spent: car.price };
  };

  career.selectCar = function selectCar(carId) {
    if (!career.state.profile.carsOwned.includes(carId)) return false;
    career.state.profile.carId = carId;
    career.save();
    return true;
  };

  career.availableTiers = function availableTiers() {
    return TIERS.filter((t) => career.state.profile.tiersUnlocked.includes(t.id));
  };

  career.newSeason = function newSeason(options = {}) {
    const tier = tierById(options.tierId || career.state.profile.tiersUnlocked[career.state.profile.tiersUnlocked.length - 1]);
    const seed = options.seed !== undefined ? options.seed : `season-${career.state.profile.seasonsCompleted + 1}`;
    const carId = career.state.profile.carsOwned.includes(options.carId) ? options.carId : career.state.profile.carId;
    const rounds = clamp(Math.round(options.rounds ?? 6), 4, RALLIES.length);
    const order = makeRng(stringSeed(`${seed}|calendar`)).shuffle(RALLIES.map((r) => r.id)).slice(0, rounds);

    const condition = {};
    for (const c of COMPONENTS) condition[c.id] = 1;

    career.state.season = {
      seed: String(seed),
      tierId: tier.id,
      carId,
      driverId: "player",
      driverName: career.state.profile.name,
      teamName: career.state.profile.team,
      calendar: order,
      field: selectField(seed, tier.id),
      cursor: { event: 0, leg: 0, stage: 0 },
      events: order.map((id) => ({ id, results: {}, retired: {}, awards: {}, done: false })),
      condition,
      creditsEarned: 0,
      penaltyCarryMs: 0,
      finished: false,
      position: null,
      startedAt: now(),
    };
    career.save();
    return career.state.season;
  };

  function season() { return career.state.season; }

  career.hasSeason = function hasSeason() { return !!season(); };

  career.drivers = function drivers() {
    const s = season();
    if (!s) return [];
    const list = [driverEntry("player", s.driverName, s.teamName, true)];
    for (const id of s.field) {
      const r = RIVAL_BY_ID.get(id);
      if (r) list.push(driverEntry(r.id, r.name, r.team, false));
    }
    return list;
  };

  career.currentStage = function currentStage() {
    const s = season();
    if (!s || s.finished) return null;
    const ev = RALLY_BY_ID.get(s.calendar[s.cursor.event]);
    if (!ev) return null;
    const lg = ev.legs[s.cursor.leg];
    if (!lg) return null;
    const stage = lg.stages[s.cursor.stage];
    if (!stage) return null;
    const cond = conditionsFor(s.seed, ev.id, stage.id);
    const setup = career.carSetup(s.carId);
    const tier = tierById(s.tierId);
    const predicted = predictField(ev.id, stage, cond);
    const winner = predicted.length ? predicted[0] : null;
    return {
      event: ev, leg: lg, legIndex: s.cursor.leg, stage,
      stageIndex: s.cursor.stage,
      round: s.cursor.event + 1,
      rounds: s.calendar.length,
      conditions: cond,
      tier,
      car: setup.car,
      // The ideal time your car is theoretically capable of…
      targetMs: Math.round(estimateStageTime(stage, { pace: setup.pace, conditions: cond })),
      referenceMs: Math.round(estimateStageTime(stage, { pace: tier.pace, conditions: cond })),
      // …and the one that actually wins the stage, which is the useful number.
      winnerTargetMs: winner ? winner.timeMs : null,
      expectedWinner: winner ? winner.name : null,
      carEligible: setup.pace >= tier.pace - 0.06,
      carryPenaltyMs: s.penaltyCarryMs,
      isPowerStage: !!stage.powerStage,
      recordMs: (career.bestFor(stage.id, s.carId, cond.key) || {}).timeMs ?? null,
    };
  };

  function predictField(eventId, stage, cond) {
    const s = season();
    const tier = tierById(s.tierId);
    const bias = career.state.profile.difficultyBias;
    const rows = [];
    for (const id of s.field) {
      const r = RIVAL_BY_ID.get(id);
      if (!r) continue;
      const res = rivalStageTime(id, { seed: s.seed, eventId, stage, tier, conditions: cond, bias });
      if (res.status === "ok") rows.push({ driverId: id, name: r.name, team: r.team, timeMs: res.timeMs, note: res.note });
    }
    rows.sort((a, b) => (a.timeMs - b.timeMs) || (a.driverId < b.driverId ? -1 : 1));
    return rows;
  }

  // The pace calibration knob. Positive slows the field, negative speeds it up;
  // ±5% covers everything between "first rally" and "unwinnable".
  career.setDifficulty = function setDifficulty(bias) {
    const v = Number(bias);
    career.state.profile.difficultyBias = Number.isFinite(v) ? clamp(v, -0.05, 0.05) : 0;
    career.save();
    return career.state.profile.difficultyBias;
  };

  career.eligibleCars = function eligibleCars(tierId) {
    const tier = tierById(tierId || (season() ? season().tierId : TIERS[0].id));
    return CARS.filter((c) => c.pace >= tier.pace - 0.06 && career.state.profile.carsOwned.includes(c.id));
  };

  function eventState(eventId) {
    const s = season();
    if (!s) return null;
    return s.events.find((e) => e.id === eventId) || null;
  }

  function generateStageResults(ev, stage, cond, playerEntry) {
    const s = season();
    const tier = tierById(s.tierId);
    const evState = eventState(ev.id);
    const entries = [playerEntry];
    for (const id of s.field) {
      const r = RIVAL_BY_ID.get(id);
      if (!r) continue;
      const out = evState.retired[id];
      // Out for this leg: super rally puts them back at the next one.
      if (out && out.legIndex === STAGE_INDEX.get(stage.id).legIndex) {
        entries.push({
          driverId: id, name: r.name, team: r.team, isPlayer: false,
          timeMs: 0, penaltyMs: 0, totalMs: 0, status: "out", note: "super rally",
        });
        continue;
      }
      const res = rivalStageTime(id, {
        seed: s.seed, eventId: ev.id, stage, tier, conditions: cond,
        bias: career.state.profile.difficultyBias,
      });
      entries.push({
        driverId: id, name: r.name, team: r.team, isPlayer: false,
        timeMs: res.timeMs, penaltyMs: res.penaltyMs,
        totalMs: res.timeMs + res.penaltyMs,
        status: res.status, note: res.note,
      });
      if (res.status === "retired") {
        evState.retired[id] = { legIndex: STAGE_INDEX.get(stage.id).legIndex, stageId: stage.id, note: res.note };
      }
    }
    return entries;
  }

  function penaltyTotal(penalties) {
    if (!Array.isArray(penalties)) return 0;
    let ms = 0;
    for (const p of penalties) {
      if (!p) continue;
      const def = typeof p === "string" ? PENALTIES[p] : PENALTIES[p.kind || p.id];
      const count = typeof p === "string" ? 1 : Math.max(1, Math.round(p.count || 1));
      if (def) ms += def.ms * count;
      else if (typeof p.ms === "number") ms += p.ms * count;
    }
    return ms;
  }

  // Everything the player did on one stage, in one call: time, penalties,
  // damage, the recorded run, and what it did to the event and the season.
  career.submitStage = function submitStage(result = {}) {
    const s = season();
    const ctx = career.currentStage();
    if (!s || !ctx) return null;
    const { event: ev, stage } = ctx;
    const evState = eventState(ev.id);
    const cond = ctx.conditions;

    const retired = !!result.retired;
    const rawMs = Math.max(0, Math.round(Number(result.timeMs) || 0));
    const penaltyMs = penaltyTotal(result.penalties) + (s.penaltyCarryMs || 0);
    s.penaltyCarryMs = 0;

    const playerEntry = {
      driverId: "player", name: s.driverName, team: s.teamName, isPlayer: true,
      timeMs: retired ? 0 : rawMs,
      penaltyMs: retired ? 0 : penaltyMs,
      totalMs: retired ? 0 : rawMs + penaltyMs,
      status: retired ? "retired" : "ok",
      note: retired ? (result.reason || "retired") : "",
    };
    if (retired) {
      evState.retired.player = { legIndex: ctx.legIndex, stageId: stage.id, note: playerEntry.note };
    }

    const entries = classify(generateStageResults(ev, stage, cond, playerEntry));
    evState.results[stage.id] = {
      stageId: stage.id,
      legIndex: ctx.legIndex,
      conditionKey: cond.key,
      entries: entries.map((e) => ({
        driverId: e.driverId, timeMs: e.timeMs, penaltyMs: e.penaltyMs,
        totalMs: e.totalMs, status: e.status, note: e.note,
      })),
    };

    if (result.damage && typeof result.damage === "object") {
      for (const c of COMPONENTS) {
        const v = Number(result.damage[c.id]);
        if (Number.isFinite(v)) s.condition[c.id] = clamp(Math.min(s.condition[c.id], v), 0, 1);
      }
    }

    let record = null;
    if (!retired && rawMs > 0) {
      record = career.recordStage({
        stageId: stage.id, carId: s.carId, weatherKey: cond.key,
        timeMs: rawMs, splits: result.splits, run: result.run, tierId: s.tierId,
      });
    }

    const overall = career.eventClassification(ev.id);
    const playerRow = entries.find((e) => e.isPlayer);
    const overallRow = overall.find((e) => e.driverId === "player");

    const advanced = advanceCursor();
    let eventSummary = null;
    if (advanced.eventFinished) eventSummary = finishEvent(ev.id);
    if (advanced.seasonFinished) eventSummary = Object.assign(eventSummary || {}, { season: finishSeason() });

    career.save();
    return {
      stage, event: ev, conditions: cond,
      entries,
      stagePosition: playerRow ? playerRow.position : null,
      stageGapMs: playerRow ? playerRow.gapLeaderMs : null,
      stageWin: !!playerRow && playerRow.position === 1 && playerRow.status === "ok",
      overall,
      eventPosition: overallRow ? overallRow.position : null,
      eventGapMs: overallRow ? overallRow.gapLeaderMs : null,
      record,
      service: advanced.serviceDue ? career.serviceOptions() : null,
      legFinished: advanced.legFinished,
      eventFinished: advanced.eventFinished,
      seasonFinished: advanced.seasonFinished,
      summary: eventSummary,
    };
  };

  function advanceCursor() {
    const s = season();
    const ev = RALLY_BY_ID.get(s.calendar[s.cursor.event]);
    const lg = ev.legs[s.cursor.leg];
    const out = { legFinished: false, eventFinished: false, seasonFinished: false, serviceDue: false };
    s.cursor.stage += 1;
    if (s.cursor.stage < lg.stages.length) return out;
    s.cursor.stage = 0;
    s.cursor.leg += 1;
    out.legFinished = true;
    if (s.cursor.leg < ev.legs.length) {
      out.serviceDue = true;
      // Super rally: whoever went out in the last leg restarts here.
      const evState = eventState(ev.id);
      for (const id of Object.keys(evState.retired)) {
        if (evState.retired[id].legIndex === s.cursor.leg - 1) evState.retired[id].rejoinedAt = s.cursor.leg;
      }
      return out;
    }
    s.cursor.leg = 0;
    out.eventFinished = true;
    s.cursor.event += 1;
    if (s.cursor.event >= s.calendar.length) {
      out.seasonFinished = true;
      s.cursor.event = s.calendar.length - 1;
    }
    return out;
  }

  // A driver who is out for a leg is not gone: they carry a fixed penalty for
  // each stage they miss and rejoin at the next service.
  career.eventClassification = function eventClassification(eventId) {
    const s = season();
    const ev = RALLY_BY_ID.get(eventId);
    const evState = eventState(eventId);
    if (!s || !ev || !evState) return [];
    const rows = new Map();
    for (const d of career.drivers()) {
      rows.set(d.id, {
        driverId: d.id, name: d.name, team: d.team, isPlayer: d.isPlayer,
        timeMs: 0, penaltyMs: 0, totalMs: 0, stagesDone: 0, missed: 0,
        status: "ok", note: "", stageWins: 0,
      });
    }
    let anyStage = false;
    for (const lg of ev.legs) {
      for (const stage of lg.stages) {
        const sr = evState.results[stage.id];
        if (!sr) continue;
        anyStage = true;
        let winner = null;
        let slowest = 0;
        for (const e of sr.entries) {
          if (e.status !== "ok") continue;
          if (winner === null || e.totalMs < winner.totalMs) winner = e;
          if (e.totalMs > slowest) slowest = e.totalMs;
        }
        // A missed stage is charged the slowest time set on it PLUS the penalty.
        // Charging the penalty alone would make retiring from a 30 km stage
        // faster than driving it, and hand the rally to whoever crashed.
        const notional = slowest || (winner ? winner.totalMs : 0);
        for (const e of sr.entries) {
          const row = rows.get(e.driverId);
          if (!row) continue;
          if (e.status === "ok") {
            row.timeMs += e.timeMs;
            row.penaltyMs += e.penaltyMs;
            row.totalMs += e.totalMs;
            row.stagesDone += 1;
          } else {
            row.missed += 1;
            row.timeMs += notional;
            row.penaltyMs += SUPER_RALLY_PENALTY_MS;
            row.totalMs += notional + SUPER_RALLY_PENALTY_MS;
            row.note = e.status === "retired" ? (e.note || "retired") : "super rally";
          }
        }
        if (winner) {
          const w = rows.get(winner.driverId);
          if (w) w.stageWins += 1;
        }
      }
    }
    const list = [];
    for (const row of rows.values()) {
      if (!anyStage) { row.status = "ok"; list.push(row); continue; }
      // Out with no stage completed at all is a genuine non-classification.
      row.status = row.stagesDone === 0 ? "retired" : "ok";
      list.push(row);
    }
    return classify(list);
  };

  function finishEvent(eventId) {
    const s = season();
    const ev = RALLY_BY_ID.get(eventId);
    const evState = eventState(eventId);
    if (!evState || evState.done) return null;
    const overall = career.eventClassification(eventId);
    const awards = {};
    for (const row of overall) {
      if (row.status !== "ok") continue;
      const pts = row.position <= POINTS.length ? POINTS[row.position - 1] : 0;
      if (pts > 0) awards[row.driverId] = (awards[row.driverId] || 0) + pts;
    }
    // Power stage: the final stage of the event pays a separate top-five bonus.
    const powerStage = powerStageOf(ev);
    let powerOrder = [];
    if (powerStage && evState.results[powerStage.id]) {
      powerOrder = evState.results[powerStage.id].entries
        .filter((e) => e.status === "ok")
        .slice()
        .sort((a, b) => (a.totalMs - b.totalMs) || (a.driverId < b.driverId ? -1 : 1));
      for (let i = 0; i < Math.min(POWER_STAGE_POINTS.length, powerOrder.length); i += 1) {
        awards[powerOrder[i].driverId] = (awards[powerOrder[i].driverId] || 0) + POWER_STAGE_POINTS[i];
      }
    }
    evState.awards = awards;
    evState.done = true;
    evState.classification = overall.map((r) => ({
      driverId: r.driverId, position: r.position, totalMs: r.totalMs,
      status: r.status, stageWins: r.stageWins, missed: r.missed,
    }));
    evState.powerStageId = powerStage ? powerStage.id : null;

    const playerRow = overall.find((r) => r.driverId === "player");
    const pos = playerRow ? playerRow.position : null;
    const tier = tierById(s.tierId);
    const points = awards.player || 0;
    // Tuned so a dominant season in one tier just about buys into the next, and
    // a mid-field one does not.
    const credits = Math.round((points * 340 + (playerRow ? playerRow.stageWins * 180 : 0)
      + (pos === 1 ? 3000 : pos && pos <= 3 ? 1200 : 400)) * tier.payout);
    career.state.profile.credits += credits;
    s.creditsEarned += credits;

    // The car goes back out fresh for the next event, but the season keeps the
    // memory of how battered it got.
    for (const c of COMPONENTS) s.condition[c.id] = 1;

    return { eventId, position: pos, points, credits, classification: overall, powerStage: powerOrder.slice(0, 5) };
  }

  function powerStageOf(ev) {
    let last = null;
    for (const lg of ev.legs) for (const stage of lg.stages) { last = stage; if (stage.powerStage) return stage; }
    return last;
  }

  career.standings = function standings() {
    const s = season();
    if (!s) return [];
    const rows = new Map();
    for (const d of career.drivers()) {
      rows.set(d.id, {
        driverId: d.id, name: d.name, team: d.team, isPlayer: d.isPlayer,
        points: 0, wins: 0, podiums: 0, stageWins: 0, starts: 0,
        // `retirements` is failing to classify at all; `stagesMissed` is the
        // far commoner case of going out and rejoining under super rally.
        retirements: 0, stagesMissed: 0,
      });
    }
    for (const evState of s.events) {
      if (!evState.done) continue;
      for (const id of Object.keys(evState.awards)) {
        const row = rows.get(id);
        if (row) row.points += evState.awards[id];
      }
      for (const c of evState.classification || []) {
        const row = rows.get(c.driverId);
        if (!row) continue;
        row.starts += 1;
        row.stageWins += c.stageWins || 0;
        row.stagesMissed += c.missed || 0;
        if (c.status !== "ok") { row.retirements += 1; continue; }
        if (c.position === 1) row.wins += 1;
        if (c.position <= 3) row.podiums += 1;
      }
    }
    const list = Array.from(rows.values());
    list.sort((a, b) => (b.points - a.points) || (b.wins - a.wins) || (b.podiums - a.podiums)
      || (b.stageWins - a.stageWins) || (a.name < b.name ? -1 : 1));
    list.forEach((r, i) => { r.position = i + 1; });
    return list;
  };

  // The whole season on one card, in the shape the championship screen reads.
  // It lives here rather than in game.js because everything on it — which round
  // is next, what each finished round cost you, who leads — is season state, and
  // a copy of that logic in the shell is a copy that goes stale.
  career.championship = function championship() {
    const s = season();
    if (!s) return null;
    const tier = tierById(s.tierId);
    const table = career.standings();
    const events = s.calendar.map((id, i) => {
      const ev = RALLY_BY_ID.get(id);
      const evState = s.events[i] || {};
      const row = (evState.classification || []).find((c) => c.driverId === "player");
      // The stage book carries no coordinates, so the calendar pin is a ladder
      // rather than a geography the game does not have: alternating sides,
      // stepping down the plate in calendar order.
      //
      // These are FRACTIONS of the plate. Nothing here decides how far apart two
      // labels land — the plate's pixel height does — and the shuffle above
      // decides only which name sits at which pin. An earlier note measured
      // season-1 at a 390 px viewport (366x439 plate, tightest pair clearing
      // 16.3 px vertically and 7.3 px horizontally, both of which still
      // reproduce) and concluded the risk was a sixth round or a longer name.
      // It was neither. Over all 120 shuffles of the five-rally book, at five
      // points in a season, that same 390 px viewport got down to 7.3 px of
      // separation with the closest pair already overlapping 3.2 px vertically,
      // and a 320 px window overlapped outright by 3.7 px — on the calendar that
      // ships, with no extra round and no longer name.
      //
      // ui.js sizes the plate from these fractions now rather than from a fixed
      // ratio (see plateMinHeight and CALENDAR_PIN there): each pin is given a
      // label box plus a clearance. Measured after that, the tightest pair over
      // 23,760 layouts — every four- and five-round shuffle, at every point in a
      // season, at eighteen viewport widths from 320 to 1600 — clears by 12.0 px,
      // and no label hangs off the plate. Change the y spread here and that
      // number moves; the plate follows it, but re-measure.
      const t = s.calendar.length > 1 ? i / (s.calendar.length - 1) : 0.5;
      return {
        id,
        name: ev ? ev.name : id,
        country: ev ? ev.country : "",
        surface: ev ? ev.surfaces.slice() : [],
        stages: ev ? eventStageCount(ev) : 0,
        status: evState.done ? "done" : (i === s.cursor.event && !s.finished) ? "next" : "locked",
        position: row ? row.position : null,
        x: i % 2 === 0 ? 0.28 : 0.70,
        y: 0.12 + 0.76 * t,
      };
    });
    return {
      name: tier.name,
      tierId: tier.id,
      seed: s.seed,
      round: Math.min(s.cursor.event + 1, s.calendar.length),
      rounds: s.calendar.length,
      finished: !!s.finished,
      events,
      standings: table.map((r) => ({
        driverId: r.driverId, name: r.name, team: r.team,
        points: r.points, position: r.position, isPlayer: r.isPlayer,
      })),
    };
  };

  function finishSeason() {
    const s = season();
    if (!s || s.finished) return null;
    s.finished = true;
    const table = career.standings();
    const playerRow = table.find((r) => r.driverId === "player");
    s.position = playerRow ? playerRow.position : null;
    const tier = tierById(s.tierId);
    const p = career.state.profile;
    p.seasonsCompleted += 1;
    if (s.position !== null && (p.bestSeasonPosition === null || s.position < p.bestSeasonPosition)) {
      p.bestSeasonPosition = s.position;
    }
    if (s.position === 1) p.titles.push({ tierId: tier.id, seed: s.seed });
    const nextTier = TIERS[tier.order + 1];
    let promoted = false;
    if (nextTier && s.position !== null && s.position <= tier.promotePosition
      && !p.tiersUnlocked.includes(nextTier.id)) {
      p.tiersUnlocked.push(nextTier.id);
      promoted = true;
    }
    const bonus = Math.round((s.position === 1 ? 22000 : s.position <= 3 ? 9000 : 3000) * tier.payout);
    p.credits += bonus;
    s.creditsEarned += bonus;
    career.state.history.push({
      seed: s.seed, tierId: tier.id, position: s.position,
      points: playerRow ? playerRow.points : 0, credits: s.creditsEarned, at: now(),
    });
    return { position: s.position, standings: table, promoted, nextTier: promoted ? nextTier.id : null, bonus };
  }

  career.serviceOptions = function serviceOptions() {
    const s = season();
    if (!s) return null;
    const ev = RALLY_BY_ID.get(s.calendar[s.cursor.event]);
    const lg = ev ? ev.legs[s.cursor.leg] : null;
    const setup = career.carSetup(s.carId);
    const budget = lg ? lg.serviceMinutes : 20;
    const items = COMPONENTS.map((c) => {
      const health = clamp(s.condition[c.id] ?? 1, 0, 1);
      const minutes = (1 - health) * c.repairMinutesFull / setup.serviceSpeed;
      return {
        id: c.id, name: c.name, health,
        minutes: Math.round(minutes * 10) / 10,
        critical: health < 0.4,
      };
    });
    const needed = items.reduce((n, i) => n + i.minutes, 0);
    return {
      budgetMinutes: budget,
      neededMinutes: Math.round(needed * 10) / 10,
      overrunPenaltyMsPerMinute: PENALTIES.serviceOverrun.ms,
      items,
      legName: lg ? lg.name : "",
    };
  };

  // Repairs are a time budget, not a shopping list: overrun and the next stage
  // starts with the clock already running against you.
  career.applyService = function applyService(choices = []) {
    const s = season();
    const opts2 = career.serviceOptions();
    if (!s || !opts2) return null;
    const setup = career.carSetup(s.carId);
    const byId = new Map(COMPONENTS.map((c) => [c.id, c]));
    let spent = 0;
    const done = [];
    for (const choice of choices) {
      const id = typeof choice === "string" ? choice : choice && choice.id;
      const comp = byId.get(id);
      if (!comp) continue;
      const health = clamp(s.condition[id] ?? 1, 0, 1);
      const fullMinutes = (1 - health) * comp.repairMinutesFull / setup.serviceSpeed;
      const askMinutes = typeof choice === "object" && Number.isFinite(Number(choice.minutes))
        ? clamp(Number(choice.minutes), 0, fullMinutes) : fullMinutes;
      if (askMinutes <= 0) continue;
      const frac = fullMinutes > 0 ? askMinutes / fullMinutes : 0;
      s.condition[id] = clamp(health + (1 - health) * frac, 0, 1);
      spent += askMinutes;
      done.push({ id, minutes: Math.round(askMinutes * 10) / 10, health: s.condition[id] });
    }
    const over = Math.max(0, spent - opts2.budgetMinutes);
    const penaltyMs = Math.ceil(over) * PENALTIES.serviceOverrun.ms;
    s.penaltyCarryMs = (s.penaltyCarryMs || 0) + penaltyMs;
    career.save();
    return {
      spentMinutes: Math.round(spent * 10) / 10,
      budgetMinutes: opts2.budgetMinutes,
      overrunMinutes: Math.round(over * 10) / 10,
      penaltyMs,
      repaired: done,
      condition: Object.assign({}, s.condition),
    };
  };

  career.bestFor = function bestFor(stageId, carId, weatherKey) {
    const byCar = career.state.records[stageId];
    if (!byCar) return null;
    const byWeather = byCar[carId];
    if (!byWeather) return null;
    return byWeather[weatherKey] || null;
  };

  career.bestAnyFor = function bestAnyFor(stageId) {
    const byCar = career.state.records[stageId];
    if (!byCar) return null;
    let best = null;
    for (const carId of Object.keys(byCar)) {
      for (const wk of Object.keys(byCar[carId] || {})) {
        const rec = byCar[carId][wk];
        if (rec && (!best || rec.timeMs < best.timeMs)) best = rec;
      }
    }
    return best;
  };

  career.recordStage = function recordStage(entry = {}) {
    const { stageId, carId, weatherKey } = entry;
    const timeMs = Math.round(Number(entry.timeMs) || 0);
    if (!stageId || !carId || !weatherKey || timeMs <= 0) return null;
    const records = career.state.records;
    if (!records[stageId] || typeof records[stageId] !== "object") records[stageId] = {};
    if (!records[stageId][carId] || typeof records[stageId][carId] !== "object") records[stageId][carId] = {};
    const slot = records[stageId][carId];
    const prev = slot[weatherKey] || null;
    const splits = Array.isArray(entry.splits)
      ? entry.splits.map((v) => Math.round(Number(v) || 0)).filter((v) => v > 0) : [];

    const bestSplits = (prev && Array.isArray(prev.bestSplits) ? prev.bestSplits.slice() : []);
    const splitPbs = [];
    for (let i = 0; i < splits.length; i += 1) {
      if (bestSplits[i] === undefined || splits[i] < bestSplits[i]) {
        splitPbs.push({ index: i, timeMs: splits[i], previousMs: bestSplits[i] ?? null });
        bestSplits[i] = splits[i];
      }
    }

    const isPb = !prev || timeMs < prev.timeMs;
    let ghost = prev ? prev.ghost : null;
    if (isPb && entry.run) {
      const encoded = typeof entry.run === "string" ? entry.run : encodeRun(entry.run);
      ghost = encoded && encoded.length <= MAX_GHOST_CHARS ? encoded : null;
    }

    slot[weatherKey] = {
      timeMs: isPb ? timeMs : prev.timeMs,
      splits: isPb ? splits : prev.splits,
      bestSplits,
      carId, weatherKey,
      tierId: entry.tierId || (prev ? prev.tierId : null),
      runs: (prev ? prev.runs || 0 : 0) + 1,
      ghost,
      at: now(),
    };
    career.save();
    return {
      isPb,
      timeMs,
      previousMs: prev ? prev.timeMs : null,
      improvedMs: prev && isPb ? prev.timeMs - timeMs : 0,
      splitPbs,
      theoreticalMs: bestSplits.length ? bestSplits[bestSplits.length - 1] : null,
    };
  };

  // The reference lap: the player's own personal best where there is one, and
  // the best time on any car for the stage where there is not.
  career.ghostFor = function ghostFor(stageId, options = {}) {
    const carId = options.carId || career.state.profile.carId;
    const weatherKey = options.weatherKey || "clear";
    const rec = career.bestFor(stageId, carId, weatherKey)
      || (options.strict ? null : career.bestAnyFor(stageId));
    if (!rec || !rec.ghost) return null;
    const run = decodeRun(rec.ghost);
    if (!run) return null;
    return { run, record: rec, timeMs: rec.timeMs, bytes: runByteSize(run) };
  };

  career.ghostStringFor = function ghostStringFor(stageId, options = {}) {
    const carId = options.carId || career.state.profile.carId;
    const weatherKey = options.weatherKey || "clear";
    const rec = career.bestFor(stageId, carId, weatherKey) || career.bestAnyFor(stageId);
    return rec && rec.ghost ? rec.ghost : null;
  };

  career.importGhost = function importGhost(stageId, carId, weatherKey, encoded) {
    const run = decodeRun(encoded);
    if (!run) return { ok: false, reason: "unreadable" };
    const timeMs = Math.round(run.durationS * 1000);
    if (timeMs <= 0) return { ok: false, reason: "empty" };
    const res = career.recordStage({ stageId, carId, weatherKey, timeMs, run: encoded });
    return { ok: true, record: res, timeMs };
  };

  career.leaderboard = function leaderboard(stageId, options = {}) {
    const s = season();
    const ctxs = STAGE_INDEX.get(stageId);
    if (!s || !ctxs) return [];
    const evState = eventState(ctxs.event.id);
    const stored = evState && evState.results[stageId];
    if (stored) {
      const byId = new Map(career.drivers().map((d) => [d.id, d]));
      return classify(stored.entries.map((e) => Object.assign({
        name: (byId.get(e.driverId) || {}).name || e.driverId,
        team: (byId.get(e.driverId) || {}).team || "",
        isPlayer: e.driverId === "player",
      }, e)));
    }
    // Not driven yet — a preview of the times the field is expected to set.
    const cond = conditionsFor(s.seed, ctxs.event.id, stageId);
    const tier = tierById(s.tierId);
    const bias = career.state.profile.difficultyBias;
    const rows = [];
    for (const id of s.field) {
      const r = RIVAL_BY_ID.get(id);
      if (!r) continue;
      const res = rivalStageTime(id, { seed: s.seed, eventId: ctxs.event.id, stage: ctxs.stage, tier, conditions: cond, bias });
      rows.push({
        driverId: id, name: r.name, team: r.team, isPlayer: false,
        timeMs: res.timeMs, penaltyMs: 0, totalMs: res.timeMs, status: res.status, note: res.note,
      });
    }
    if (options.includePlayerTarget) {
      const setup = career.carSetup(s.carId);
      const t = Math.round(estimateStageTime(ctxs.stage, { pace: setup.pace, conditions: cond }));
      rows.push({
        driverId: "player", name: s.driverName, team: s.teamName, isPlayer: true,
        timeMs: t, penaltyMs: 0, totalMs: t, status: "ok", note: "estimate",
      });
    }
    return classify(rows);
  };

  career.setDriver = function setDriver(name, team) {
    if (typeof name === "string" && name.trim()) career.state.profile.name = name.trim().slice(0, 40);
    if (typeof team === "string" && team.trim()) career.state.profile.team = team.trim().slice(0, 40);
    const s = season();
    if (s) {
      s.driverName = career.state.profile.name;
      s.teamName = career.state.profile.team;
    }
    career.save();
    return career.state.profile;
  };

  career.summary = function summary() {
    const s = season();
    const p = career.state.profile;
    return {
      name: p.name, team: p.team, credits: p.credits,
      carId: p.carId, carsOwned: p.carsOwned.slice(),
      tiersUnlocked: p.tiersUnlocked.slice(),
      seasonsCompleted: p.seasonsCompleted,
      titles: p.titles.length,
      season: s ? {
        seed: s.seed, tierId: s.tierId, round: s.cursor.event + 1,
        rounds: s.calendar.length, finished: s.finished, position: s.position,
        creditsEarned: s.creditsEarned,
      } : null,
      storageOk: career.storageOk && career.lastSaveOk,
    };
  };

  career.load();
  return career;
}
