// Championship + profile: pure logic with an injected storage adapter and injected rivals.
// Eight-car field (player + seven rivals), points 10-8-6-5-4-3-2-1, cumulative time + penalties,
// service budget between stages, setup tweaks, best times and compact ghosts.

import { makeRng, hashString } from "./rng.mjs";
import { clamp } from "./mathx.mjs";

export const SAVE_KEY = "aotearoa-rally.save.v1";
export const GHOST_KEY = (stageId, carId) => `aotearoa-rally.ghost.v1.${stageId}.${carId}`;
export const SAVE_VERSION = 1;
export const POINTS = Object.freeze([10, 8, 6, 5, 4, 3, 2, 1]);
export const STAGE_ORDER = Object.freeze(["waitomo", "whakarewarewa", "coromandel", "otago", "remarkables", "fiordland"]);

export const DIFFICULTY = Object.freeze({
  rookie: { id: "rookie", label: "Rookie", blurb: "Forgiving rivals, generous service, light damage.", rivalPace: 1.12, repairMinutes: 60, damageScale: 0.6, respawnPenalty: 8 },
  pro: { id: "pro", label: "Pro", blurb: "A fair fight. Rivals run close to par.", rivalPace: 1.0, repairMinutes: 45, damageScale: 1.0, respawnPenalty: 10 },
  expert: { id: "expert", label: "Expert", blurb: "Sharp rivals, tight service, every dent hurts.", rivalPace: 0.965, repairMinutes: 30, damageScale: 1.35, respawnPenalty: 15 },
});
export const DIFFICULTY_IDS = Object.keys(DIFFICULTY);

/** Service: minutes to repair a part from fully destroyed (damage 1) to new. */
export const REPAIR_COST = Object.freeze({ engine: 30, gearbox: 24, steering: 12, suspension: 28, tyres: 16, body: 36 });
export const PARTS = Object.freeze(Object.keys(REPAIR_COST));
export const PART_LABELS = Object.freeze({ engine: "Engine", gearbox: "Gearbox", steering: "Steering", suspension: "Suspension", tyres: "Tyres", body: "Bodywork" });

export const TYRES = Object.freeze(["gravel", "tarmac", "snow"]);
export const DEFAULT_SETUP = Object.freeze({ tyre: "gravel", gear: 0, susp: 0, brake: 0 });
export const SETUP_RANGE = Object.freeze({ gear: [-1, 1], susp: [-1, 1], brake: [-0.1, 0.1] });

export const DEFAULT_OPTIONS = Object.freeze({
  units: "kmh", fov: 75, quality: "auto", fps: false, reducedMotion: false, colourSafe: false, hudScale: 1,
  gearbox: "auto", steerAssist: 0.5, camera: "chase", tilt: false, touch: "auto",
  master: 0.8, engine: 1, effects: 1, voice: 1, ambience: 0.7, mute: false, codriver: true, voiceName: "",
});
const OPTION_RULES = {
  units: (v) => (v === "mph" ? "mph" : "kmh"),
  fov: (v) => clamp(num(v, 75), 55, 110),
  quality: (v) => (["auto", "low", "medium", "high", "ultra"].includes(v) ? v : "auto"),
  fps: (v) => !!v, reducedMotion: (v) => !!v, colourSafe: (v) => !!v, tilt: (v) => !!v, mute: (v) => !!v, codriver: (v) => v !== false,
  hudScale: (v) => clamp(num(v, 1), 0.7, 1.4),
  gearbox: (v) => (v === "manual" ? "manual" : "auto"),
  steerAssist: (v) => clamp(num(v, 0.5), 0, 1),
  camera: (v) => (["chase", "far", "bumper", "bonnet"].includes(v) ? v : "chase"),
  touch: (v) => (["auto", "on", "off"].includes(v) ? v : "auto"),
  master: (v) => clamp(num(v, 0.8), 0, 1), engine: (v) => clamp(num(v, 1), 0, 1), effects: (v) => clamp(num(v, 1), 0, 1),
  voice: (v) => clamp(num(v, 1), 0, 1), ambience: (v) => clamp(num(v, 0.7), 0, 1),
  voiceName: (v) => (typeof v === "string" ? v.slice(0, 120) : ""),
};
/** Fill defaults and clamp every known option; unknown keys are dropped. */
export function sanitiseOptions(o) {
  const out = {};
  for (const k of Object.keys(DEFAULT_OPTIONS)) out[k] = OPTION_RULES[k](o && k in o ? o[k] : DEFAULT_OPTIONS[k]);
  return out;
}

const avg = (a) => (Array.isArray(a) && a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** Collapse a physics damage record into the six service parts (0..1). */
export function partDamage(d) {
  if (!d) return { engine: 0, gearbox: 0, steering: 0, suspension: 0, tyres: 0, body: 0 };
  const b = d.body || {};
  return {
    engine: clamp(Math.max(num(d.engine), num(d.radiator) * 0.8), 0, 1),
    gearbox: clamp(num(d.gearbox), 0, 1),
    steering: clamp(num(d.steering), 0, 1),
    suspension: clamp(avg(d.suspension), 0, 1),
    tyres: clamp(avg(d.tyres), 0, 1),
    body: clamp(avg([num(b.front), num(b.rear), num(b.left), num(b.right)]), 0, 1),
  };
}

/** Deterministic stand-in field used when no rivals module is injected (tests, fallback). */
export function fallbackRivals(stageId, { parTime = 240, pace = 1 } = {}) {
  const rng = makeRng(hashString("rivals:" + stageId));
  const names = ["Ngaio Pere", "Hemi Tane", "Aroha West", "Tama Rua", "Kiri Banks", "Rewi Cole", "Mere Hart"];
  return names.map((name, i) => ({ id: "r" + (i + 1), name, time: parTime * pace * (1 + 0.012 * i + rng.range(-0.012, 0.018)), dnf: false }));
}

export function recommendedTyre(def) {
  const surfs = (def && def.roadSurfaces) || [];
  if (surfs.includes(4)) return "snow";
  if (surfs.length && surfs.every((s) => s === 2)) return "tarmac";
  return "gravel";
}

/**
 * Translate career setup + options into Vehicle.configure() arguments:
 * { tyre, setup: { gearRatioScale, suspensionStiffness, brakeBias }, auto, assist }.
 * gear > 0 = shorter gearing (more acceleration, lower top speed).
 */
export function vehicleOptionsFor(spec, setup, options) {
  const s = { ...DEFAULT_SETUP, ...(setup || {}) };
  const o = options || {};
  const out = {
    tyre: TYRES.includes(s.tyre) ? s.tyre : "gravel",
    setup: {
      gearRatioScale: 1 + clamp(num(s.gear), -1, 1) * 0.1,
      suspensionStiffness: 1 + clamp(num(s.susp), -1, 1) * 0.25,
      brakeBias: clamp((spec && spec.brakeBias != null ? spec.brakeBias : 0.6) + clamp(num(s.brake), -0.1, 0.1), 0.4, 0.8),
    },
  };
  if (o.difficulty && DIFFICULTY[o.difficulty]) out.damageScale = DIFFICULTY[o.difficulty].damageScale;
  if (o.gearbox) out.auto = o.gearbox !== "manual";
  if (o.steerAssist != null) out.assist = clamp(num(o.steerAssist), 0, 1) * 0.7;
  return out;
}

// ---- ghosts (compact, delta-coded ints) -----------------------------------------------------
export const GHOST_HZ = 10;
/** frames: [{x,y,z,yaw,pitch,roll}] sampled at GHOST_HZ. */
export function encodeGhost(frames) {
  const d = [];
  let p = [0, 0, 0, 0, 0, 0];
  for (const f of frames) {
    const q = [Math.round(f.x * 100), Math.round(f.y * 100), Math.round(f.z * 100), Math.round(f.yaw * 1000), Math.round((f.pitch || 0) * 1000), Math.round((f.roll || 0) * 1000)];
    for (let i = 0; i < 6; i++) d.push(q[i] - p[i]);
    p = q;
  }
  return { hz: GHOST_HZ, n: frames.length, d };
}
export function decodeGhost(g) {
  if (!g || !Array.isArray(g.d) || !(g.n > 0) || g.d.length !== g.n * 6 || !g.d.every(Number.isFinite)) return null;
  const out = [];
  let p = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < g.n; i++) {
    const q = p.map((v, k) => v + g.d[i * 6 + k]);
    out.push({ x: q[0] / 100, y: q[1] / 100, z: q[2] / 100, yaw: q[3] / 1000, pitch: q[4] / 1000, roll: q[5] / 1000 });
    p = q;
  }
  return out;
}

export function emptyProfile() {
  return { best: {}, splits: {}, options: sanitiseOptions(null), stats: { stagesFinished: 0, championships: 0 } };
}

function sanitiseProfile(p) {
  const out = emptyProfile();
  if (!p || typeof p !== "object") return out;
  if (p.best && typeof p.best === "object")
    for (const [sid, cars] of Object.entries(p.best)) {
      if (!cars || typeof cars !== "object") continue;
      for (const [cid, t] of Object.entries(cars)) if (Number.isFinite(t) && t > 0) (out.best[sid] ||= {})[cid] = t;
    }
  if (p.splits && typeof p.splits === "object")
    for (const [sid, cars] of Object.entries(p.splits)) {
      if (!cars || typeof cars !== "object") continue;
      for (const [cid, arr] of Object.entries(cars)) if (Array.isArray(arr) && arr.length < 40 && arr.every((v) => Number.isFinite(v))) (out.splits[sid] ||= {})[cid] = arr;
    }
  out.options = sanitiseOptions(p.options);
  if (p.stats && typeof p.stats === "object") {
    out.stats.stagesFinished = num(p.stats.stagesFinished);
    out.stats.championships = num(p.stats.championships);
  }
  return out;
}

const CAR_IDS_DEFAULT = ["huia", "kea", "takahe", "piwakawaka"];
const unit = (v) => clamp(num(v), 0, 1);
function sanitiseDamage(d) {
  if (!d || typeof d !== "object") return null;
  const arr4 = (a) => [0, 1, 2, 3].map((i) => unit(Array.isArray(a) ? a[i] : 0));
  const b = d.body && typeof d.body === "object" ? d.body : {};
  const out = {
    engine: unit(d.engine), gearbox: unit(d.gearbox), steering: unit(d.steering), radiator: unit(d.radiator),
    suspension: arr4(d.suspension), tyres: arr4(d.tyres),
    body: { front: unit(b.front), rear: unit(b.rear), left: unit(b.left), right: unit(b.right) },
    total: 0,
  };
  out.total = Math.min(0.999, unit(d.total)); // a championship car never carries a destroyed state across stages
  return out;
}
function sanitiseChampionship(c, carIds) {
  if (!c || typeof c !== "object") return null;
  if (!DIFFICULTY[c.difficulty]) return null;
  if (typeof c.carId !== "string" || !carIds.includes(c.carId)) return null;
  if (!Number.isInteger(c.stageIndex) || c.stageIndex < 0 || c.stageIndex > STAGE_ORDER.length) return null;
  if (!Array.isArray(c.results) || c.results.length !== c.stageIndex) return null;
  const results = [];
  for (let k = 0; k < c.results.length; k++) {
    const r = c.results[k];
    if (!r || typeof r !== "object" || !Array.isArray(r.sheet) || r.sheet.length < 1 || r.sheet.length > 8 || r.stageId !== STAGE_ORDER[k]) return null;
    const sheet = [];
    for (const e of r.sheet) {
      if (!e || typeof e !== "object") return null;
      const dnf = !!e.dnf;
      const time = dnf ? null : e.time;
      if (!dnf && !(Number.isFinite(time) && time > 0 && time < 1e5)) return null;
      sheet.push({
        id: String(e.id).slice(0, 24), name: String(e.name).slice(0, 40), player: !!e.player, dnf, time,
        penalty: clamp(num(e.penalty), 0, 1e4), gap: dnf || !Number.isFinite(e.gap) ? null : clamp(e.gap, 0, 1e5), position: clamp(Math.round(num(e.position, 1)), 1, 8), points: clamp(Math.round(num(e.points)), 0, 10),
      });
    }
    results.push({ stageId: r.stageId, sheet });
  }
  const su = c.setup && typeof c.setup === "object" ? c.setup : {};
  const setup = { tyre: TYRES.includes(su.tyre) ? su.tyre : "gravel", gear: clamp(num(su.gear), ...SETUP_RANGE.gear), susp: clamp(num(su.susp), ...SETUP_RANGE.susp), brake: clamp(num(su.brake), ...SETUP_RANGE.brake) };
  const plan = {};
  const rawPlan = c.service && typeof c.service.plan === "object" && c.service.plan ? c.service.plan : {};
  for (const p of PARTS) if (p in rawPlan) plan[p] = unit(rawPlan[p]);
  return {
    difficulty: c.difficulty,
    carId: c.carId,
    livery: clamp(Math.round(num(c.livery)), 0, 9),
    setup,
    stageIndex: c.stageIndex,
    results,
    damage: sanitiseDamage(c.damage),
    service: { budget: clamp(num(c.service && c.service.budget), 0, 300), plan },
    inStage: !!c.inStage && c.stageIndex < STAGE_ORDER.length,
  };
}

/**
 * @param {{storage:{getJSON,setJSON,remove}, rivals?:(stageId:string, ctx:object)=>Array, parTime?:(stageId:string, carId:string)=>number}} o
 */
export function createCareer({ storage, rivals = fallbackRivals, parTime = () => 240, carIds = CAR_IDS_DEFAULT } = {}) {
  let profile = emptyProfile();
  let champ = null;

  const c = {
    get profile() {
      return profile;
    },
    get championship() {
      return champ;
    },
    get difficulty() {
      return champ ? DIFFICULTY[champ.difficulty] : DIFFICULTY.pro;
    },
    get finished() {
      return !!champ && champ.stageIndex >= STAGE_ORDER.length;
    },
    get currentStageId() {
      return champ && champ.stageIndex < STAGE_ORDER.length ? STAGE_ORDER[champ.stageIndex] : null;
    },

    // ---- persistence ------------------------------------------------------------------------
    serialize() {
      return JSON.stringify({ v: SAVE_VERSION, profile, championship: champ });
    },
    /** Never throws. Returns true when a valid save was applied. */
    deserialize(text) {
      try {
        const o = typeof text === "string" ? JSON.parse(text) : text;
        if (!o || typeof o !== "object" || o.v !== SAVE_VERSION) return false;
        profile = sanitiseProfile(o.profile);
        champ = sanitiseChampionship(o.championship, carIds);
        return true;
      } catch {
        return false;
      }
    },
    save() {
      return storage ? storage.set(SAVE_KEY, c.serialize()) : false;
    },
    load() {
      if (!storage) return false;
      const raw = storage.get(SAVE_KEY);
      if (raw == null) return false;
      return c.deserialize(raw);
    },
    wipe() {
      profile = emptyProfile();
      champ = null;
      storage && storage.remove(SAVE_KEY);
    },

    // ---- best times + ghost -----------------------------------------------------------------
    bestTime(stageId, carId) {
      return (profile.best[stageId] && profile.best[stageId][carId]) || null;
    },
    bestTimeAnyCar(stageId) {
      const m = profile.best[stageId];
      return m ? Math.min(...Object.values(m)) : null;
    },
    /** Returns { isBest, previous }. Does not persist ghost frames (see saveGhost). */
    recordBest(stageId, carId, time, splitTimes) {
      const prev = c.bestTime(stageId, carId);
      if (!Number.isFinite(time) || time <= 0) return { isBest: false, previous: prev };
      const isBest = prev == null || time < prev;
      if (isBest) {
        (profile.best[stageId] ||= {})[carId] = time;
        if (Array.isArray(splitTimes)) (profile.splits[stageId] ||= {})[carId] = splitTimes.slice(0, 39);
      }
      return { isBest, previous: prev };
    },
    bestSplits(stageId, carId) {
      return (profile.splits[stageId] && profile.splits[stageId][carId]) || null;
    },
    get options() {
      return profile.options;
    },
    setOption(key, value) {
      if (!(key in DEFAULT_OPTIONS)) return false;
      profile.options = sanitiseOptions({ ...profile.options, [key]: value });
      return true;
    },
    saveGhost(stageId, carId, frames) {
      return storage ? storage.setJSON(GHOST_KEY(stageId, carId), encodeGhost(frames)) : false;
    },
    loadGhost(stageId, carId) {
      return storage ? decodeGhost(storage.getJSON(GHOST_KEY(stageId, carId), null)) : null;
    },

    // ---- championship -----------------------------------------------------------------------
    newChampionship({ difficulty = "pro", carId = "huia", livery = 0, setup } = {}) {
      champ = {
        difficulty: DIFFICULTY[difficulty] ? difficulty : "pro",
        carId,
        livery,
        setup: { ...DEFAULT_SETUP, ...(setup || {}) },
        stageIndex: 0,
        results: [],
        damage: null,
        service: { budget: 0, plan: {} },
        inStage: false,
      };
      return champ;
    },
    abandon() {
      champ = null;
    },
    setSetup(patch) {
      if (!champ) return;
      const s = { ...champ.setup, ...patch };
      if (!TYRES.includes(s.tyre)) s.tyre = "gravel";
      s.gear = clamp(num(s.gear), ...SETUP_RANGE.gear);
      s.susp = clamp(num(s.susp), ...SETUP_RANGE.susp);
      s.brake = clamp(num(s.brake), ...SETUP_RANGE.brake);
      champ.setup = s;
    },
    setCar(carId, livery = 0) {
      if (champ) {
        champ.carId = carId;
        champ.livery = livery;
      }
    },

    /** Build the sorted time sheet of a stage (player + rivals), without mutating anything. */
    buildSheet(stageId, playerResult, ctx = {}) {
      const diff = ctx.difficulty && DIFFICULTY[ctx.difficulty] ? DIFFICULTY[ctx.difficulty] : c.difficulty;
      const carId = ctx.carId || (champ ? champ.carId : "huia");
      const par = ctx.parTime ?? parTime(stageId, carId);
      const field = rivals(stageId, { parTime: par, pace: diff.rivalPace, difficulty: diff.id, carId }) || [];
      const rows = field.slice(0, 7).map((r) => ({ id: String(r.id), name: String(r.name), player: false, dnf: !!r.dnf, time: r.dnf ? null : num(r.time, par), penalty: 0 }));
      const dnf = !playerResult || playerResult.status === "dnf" || !Number.isFinite(playerResult.total);
      rows.push({
        id: "player", name: ctx.playerName || "You", player: true, dnf,
        time: dnf ? null : playerResult.total, penalty: dnf ? 0 : playerResult.penaltyTotal || 0,
      });
      rows.sort((a, b) => (a.dnf !== b.dnf ? (a.dnf ? 1 : -1) : a.dnf ? 0 : a.time - b.time));
      const lead = rows.length && !rows[0].dnf ? rows[0].time : null;
      rows.forEach((r, i) => {
        r.gap = lead != null && !r.dnf ? r.time - lead : null;
        r.position = i + 1;
        r.points = r.dnf ? 0 : POINTS[i] || 0;
      });
      return rows;
    },

    /** Record a finished/DNF stage in the championship, advance, open the service budget. */
    completeStage(playerResult, damage, ctx = {}) {
      if (!champ || champ.stageIndex >= STAGE_ORDER.length) return null;
      const stageId = STAGE_ORDER[champ.stageIndex];
      const sheet = c.buildSheet(stageId, playerResult, ctx);
      champ.results.push({ stageId, sheet });
      champ.stageIndex++;
      champ.inStage = false;
      champ.damage = sanitiseDamage(damage);
      champ.service = { budget: c.difficulty.repairMinutes, plan: {} };
      if (c.finished) {
        profile.stats.championships++;
        champ.service = { budget: 0, plan: {} };
      }
      profile.stats.stagesFinished += playerResult && playerResult.status !== "dnf" ? 1 : 0;
      return sheet;
    },

    /** Mark the current championship stage as started: leaving it unfinished later counts as a DNF. */
    markStageStarted() {
      if (champ && champ.stageIndex < STAGE_ORDER.length) champ.inStage = true;
    },
    /** Overall-time classification (total time asc, DNFs counted at slowest +25 %). */
    timeStandings() {
      const rows = c.standings().slice().sort((a, b) => a.total - b.total);
      rows.forEach((r, i) => (r.timePosition = i + 1));
      const lead = rows.length ? rows[0].total : 0;
      for (const r of rows) r.timeGap = r.total - lead;
      return rows;
    },

    /** Cumulative standings: points desc, then total time asc. */
    standings() {
      const m = new Map();
      if (!champ) return [];
      for (const r of champ.results) {
        for (const e of r.sheet) {
          const row = m.get(e.id) || { id: e.id, name: e.name, player: e.player, points: 0, total: 0, wins: 0, stages: 0, dnfs: 0 };
          row.points += e.points;
          row.stages++;
          if (e.dnf) {
            row.dnfs++;
            row.total += (c._slowest(r) || 0) * 1.25; // a DNF counts as the slowest time +25 % in the cumulative
          } else row.total += e.time;
          if (e.position === 1) row.wins++;
          m.set(e.id, row);
        }
      }
      const rows = [...m.values()].sort((a, b) => b.points - a.points || a.total - b.total);
      rows.forEach((r, i) => (r.position = i + 1));
      return rows;
    },
    _slowest(result) {
      let w = 0;
      for (const e of result.sheet) if (!e.dnf && e.time > w) w = e.time;
      return w;
    },
    playerPosition() {
      const s = c.standings().find((r) => r.player);
      return s ? s.position : null;
    },

    // ---- service ----------------------------------------------------------------------------
    partDamage: () => partDamage(champ && champ.damage),
    /** Minutes to repair `frac` (0..1) of a part's current damage. */
    repairCost(part, frac = 1) {
      const d = partDamage(champ && champ.damage)[part] || 0;
      return REPAIR_COST[part] * d * frac;
    },
    serviceSpent() {
      if (!champ) return 0;
      return PARTS.reduce((t, p) => t + c.repairCost(p, champ.service.plan[p] || 0), 0);
    },
    serviceLeft() {
      return champ ? Math.max(0, champ.service.budget - c.serviceSpent()) : 0;
    },
    /** Set the repair fraction for a part, clamped so the total never exceeds the budget. Returns the fraction applied. */
    setRepair(part, frac) {
      if (!champ || !(part in REPAIR_COST)) return 0;
      frac = clamp(num(frac), 0, 1);
      const full = REPAIR_COST[part] * (partDamage(champ.damage)[part] || 0);
      if (full <= 0) {
        champ.service.plan[part] = 0;
        return 0;
      }
      const others = c.serviceSpent() - c.repairCost(part, champ.service.plan[part] || 0);
      const room = Math.max(0, champ.service.budget - others);
      frac = Math.min(frac, room / full);
      champ.service.plan[part] = frac;
      return frac;
    },
    /** Apply the plan to the stored damage and clear it. Returns the plan used ({part: fraction}). */
    commitService() {
      if (!champ) return {};
      const plan = { ...champ.service.plan };
      const d = champ.damage;
      if (d) {
        const f = (v, p) => clamp(num(v) * (1 - (plan[p] || 0)), 0, 1);
        d.engine = f(d.engine, "engine");
        if (d.radiator != null) d.radiator = f(d.radiator, "engine");
        d.gearbox = f(d.gearbox, "gearbox");
        d.steering = f(d.steering, "steering");
        if (Array.isArray(d.suspension)) d.suspension = d.suspension.map((v) => f(v, "suspension"));
        if (Array.isArray(d.tyres)) d.tyres = d.tyres.map((v) => f(v, "tyres"));
        if (d.body) for (const k of Object.keys(d.body)) d.body[k] = f(d.body[k], "body");
        const parts = [d.engine, d.gearbox, d.steering, ...(d.suspension || []), ...(d.tyres || []), ...Object.values(d.body || {})];
        d.total = Math.max(0, ...parts);
      }
      champ.service = { budget: 0, plan: {} };
      return plan;
    },
  };
  return c;
}
