import { ACTIONS, ACHIEVEMENTS, DIFFICULTIES, EVENTS, REGIONS } from "./content.js";

export const SAVE_VERSION = 1;

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));
const clone = (value) => JSON.parse(JSON.stringify(value));

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand(seed, salt) {
  let x = hashString(`${seed}:${salt}`) || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 10000) / 10000;
}

export function defaultProgress() {
  return {
    version: SAVE_VERSION,
    runs: 0,
    bestScore: 0,
    achievements: [],
    codexRead: [],
    settings: { mute: false, volume: 0.55, music: true, sfx: true },
    lastRun: null,
  };
}

export function migrateSave(value) {
  const base = defaultProgress();
  if (!value || typeof value !== "object") return base;
  return {
    ...base,
    ...value,
    version: SAVE_VERSION,
    achievements: Array.isArray(value.achievements) ? [...new Set(value.achievements)] : [],
    codexRead: Array.isArray(value.codexRead) ? [...new Set(value.codexRead)] : [],
    settings: { ...base.settings, ...(value.settings || {}) },
  };
}

export function exportSave(progress) {
  return JSON.stringify(migrateSave(progress));
}

export function importSave(text) {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Save is not an object");
    return { ok: true, value: migrateSave(parsed) };
  } catch (err) {
    return { ok: false, error: err.message || "Invalid save" };
  }
}

function initialRegions(seed, difficulty) {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.standard;
  return REGIONS.map((region, index) => {
    const jitter = Math.round((rand(seed, `region-${index}`) - 0.5) * 12 * config.pressure);
    return {
      id: region.id,
      name: region.name,
      trait: region.trait,
      infection: clamp(region.infection + jitter),
      cooperation: clamp(region.cooperation + Math.round(jitter / 2)),
      labs: clamp(region.labs - Math.round(jitter / 3)),
      economy: clamp(region.economy),
      misinformation: clamp(22 + Math.round(rand(seed, `misinfo-${index}`) * 22)),
      shield: 0,
    };
  });
}

export function createRun(options = {}) {
  const difficulty = options.difficulty || "standard";
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.standard;
  const seed = String(options.seed || `hrp-${Date.now()}`);
  return {
    version: SAVE_VERSION,
    mode: options.mode || difficulty,
    difficulty,
    seed,
    turn: 1,
    maxTurns: config.turns,
    actionsTaken: 0,
    over: false,
    ending: null,
    meters: {
      research: config.startingResearch,
      trust: config.startingTrust,
      economy: config.startingEconomy,
      ethics: config.startingEthics,
      ai: config.startingAi,
    },
    cooldowns: {},
    regions: initialRegions(seed, difficulty),
    log: [`Shift opened under ${config.label} protocol.`],
  };
}

export function averagePressure(state) {
  const total = state.regions.reduce((sum, region) => sum + region.infection + region.misinformation * 0.35 - region.cooperation * 0.2, 0);
  return clamp(total / state.regions.length);
}

export function actionById(id) {
  return ACTIONS.find((action) => action.id === id) || null;
}

export function canAfford(state, action) {
  return Object.entries(action.cost || {}).every(([key, cost]) => (state.meters[key] || 0) >= cost);
}

export function canApplyAction(state, actionId, regionId) {
  const action = actionById(actionId);
  if (!action) return { ok: false, reason: "Unknown action" };
  if (state.over) return { ok: false, reason: "Run already ended" };
  if ((state.cooldowns[action.id] || 0) > 0) return { ok: false, reason: "Action cooling down" };
  if (!canAfford(state, action)) return { ok: false, reason: "Not enough resources" };
  if (action.scope === "region" && !state.regions.some((region) => region.id === regionId)) {
    return { ok: false, reason: "Select a region" };
  }
  return { ok: true, action };
}

function applyMeterEffect(meters, key, value) {
  if (key in meters) meters[key] = clamp(meters[key] + value);
}

export function applyAction(input, actionId, regionId) {
  const state = clone(input);
  const check = canApplyAction(state, actionId, regionId);
  if (!check.ok) return { state, ok: false, message: check.reason };
  const action = check.action;
  Object.entries(action.cost || {}).forEach(([key, cost]) => {
    state.meters[key] = clamp((state.meters[key] || 0) - cost);
  });
  Object.entries(action.effect || {}).forEach(([key, value]) => {
    if (["infection", "cooperation", "labs", "misinformation", "shield"].includes(key)) return;
    applyMeterEffect(state.meters, key, value);
  });
  if (action.scope === "region") {
    const region = state.regions.find((item) => item.id === regionId);
    Object.entries(action.effect || {}).forEach(([key, value]) => {
      if (key in region) region[key] = clamp(region[key] + value);
    });
    region.shield = clamp(region.shield + (action.id === "ai-delegate" ? 12 : 4));
    state.log.unshift(`${action.name}: ${region.name}.`);
  } else {
    state.log.unshift(`${action.name}: global dashboard updated.`);
  }
  state.cooldowns[action.id] = action.cooldown || 1;
  state.actionsTaken += 1;
  return { state, ok: true, message: `${action.name} applied` };
}

function eventForTurn(state) {
  if (state.turn % 2 !== 0) return null;
  const index = Math.floor(rand(state.seed, `event-${state.turn}`) * EVENTS.length) % EVENTS.length;
  return EVENTS[index];
}

function applyEvent(state, event) {
  if (!event) return;
  Object.entries(event.effect).forEach(([key, value]) => {
    if (key in state.meters) applyMeterEffect(state.meters, key, value);
    if (["infection", "cooperation", "labs", "misinformation"].includes(key)) {
      state.regions.forEach((region) => { region[key] = clamp(region[key] + value); });
    }
  });
  state.log.unshift(`${event.title}: ${event.text}`);
}

export function advanceTurn(input) {
  const state = clone(input);
  if (state.over) return state;
  const config = DIFFICULTIES[state.difficulty] || DIFFICULTIES.standard;
  state.regions.forEach((region, index) => {
    const noise = Math.round((rand(state.seed, `${state.turn}-${region.id}`) - 0.35) * 10);
    const growth = 7 * config.pressure + region.misinformation * 0.09 - region.cooperation * 0.05 - region.labs * 0.035 - state.meters.research * 0.035 - region.shield * 0.08 + noise;
    region.infection = clamp(region.infection + growth);
    region.misinformation = clamp(region.misinformation + 3 * config.pressure - state.meters.trust * 0.035 + noise / 2);
    region.cooperation = clamp(region.cooperation + state.meters.trust * 0.025 - region.infection * 0.035);
    region.economy = clamp(region.economy - region.infection * 0.025 + state.meters.economy * 0.015);
    region.shield = clamp(region.shield - 9);
    if (index === 0) state.meters.economy = clamp(state.meters.economy - averagePressure(state) * 0.018);
  });
  Object.keys(state.cooldowns).forEach((key) => { state.cooldowns[key] = Math.max(0, state.cooldowns[key] - 1); });
  state.meters.ai = clamp(state.meters.ai + 1 - Math.max(0, averagePressure(state) - 60) * 0.04);
  state.meters.ethics = clamp(state.meters.ethics - Math.max(0, state.meters.ai - 78) * 0.03);
  applyEvent(state, eventForTurn(state));
  const ending = evaluateEnding(state);
  if (ending) {
    state.over = true;
    state.ending = ending;
    state.log.unshift(ending.text);
  } else {
    state.turn += 1;
    state.log.unshift(`Turn ${state.turn} begins.`);
  }
  state.log = state.log.slice(0, 18);
  return state;
}

export function evaluateEnding(state) {
  const pressure = averagePressure(state);
  if (pressure >= 92) return { id: "overwhelmed", title: "Dashboard Overwhelmed", text: "The fictional crisis outruns civic capacity." };
  if (state.meters.trust <= 4) return { id: "trust-collapse", title: "Trust Collapse", text: "People stop believing the dashboard deserves attention." };
  if (state.meters.economy <= 4) return { id: "empty-shelves", title: "Empty Shelves", text: "Supply confidence fails before the model does." };
  if (state.meters.ethics <= 4) return { id: "hollow-victory", title: "Hollow Victory", text: "The graphs improve, but the programme forgets who it serves." };
  if (state.turn >= state.maxTurns) {
    if (pressure <= 35 && state.meters.trust >= 45 && state.meters.ethics >= 45) {
      return { id: "retained", title: "Humanity Retained", text: "The crisis recedes and the dashboard is politely unplugged." };
    }
    return { id: "managed", title: "Barely Managed", text: "Civilisation remains mostly upright, which is a kind of win." };
  }
  return null;
}

export function scoreRun(state) {
  const pressure = averagePressure(state);
  return Math.max(0, Math.round(
    1000 - pressure * 7 + state.meters.trust * 3 + state.meters.ethics * 3 + state.meters.research * 2 + state.meters.economy * 1.5 + state.meters.ai,
  ));
}

export function achievementsForRun(state) {
  const awards = ["first-shift"];
  if (state.meters.ethics >= 75) awards.push("kindly-dashboard");
  if (state.meters.trust >= 75) awards.push("model-citizen");
  if (averagePressure(state) < 30) awards.push("quiet-week");
  if (state.meters.ai >= 80) awards.push("aac-whisperer");
  return awards.filter((id) => ACHIEVEMENTS.some((achievement) => achievement.id === id));
}

export function completeRun(progress, run) {
  const migrated = migrateSave(progress);
  const score = scoreRun(run);
  const achievements = new Set([...migrated.achievements, ...achievementsForRun(run)]);
  return {
    ...migrated,
    runs: migrated.runs + 1,
    bestScore: Math.max(migrated.bestScore, score),
    achievements: [...achievements],
    lastRun: { score, ending: run.ending?.id || null, seed: run.seed, turn: run.turn },
  };
}

export function summary(state) {
  return {
    pressure: averagePressure(state),
    score: scoreRun(state),
    worstRegion: state.regions.slice().sort((a, b) => b.infection - a.infection)[0],
  };
}
