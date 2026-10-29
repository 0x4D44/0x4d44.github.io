// The championship field: seven fictional drivers, their stage times and the time sheet.
// Pure and deterministic (all randomness from core/rng.mjs).

import { makeRng, hashString } from "./rng.mjs";
import { STAGE_IDS } from "./stagedefs.mjs";

// PAR_TIMES is written later by the DYNAMICS lane (core/partimes.mjs); until it exists, callers fall
// back to stage.parTime (our own speed-profile estimate).
let PAR_TIMES = null;
try {
  PAR_TIMES = (await import("./partimes.mjs")).PAR_TIMES ?? null;
} catch {
  PAR_TIMES = null;
}

/** Expert par for a stage: the calibrated bot time for `carId` when available, else stage.parTime. */
export function parTimeFor(stageId, carId, fallbackStageParTime) {
  const t = PAR_TIMES && PAR_TIMES[stageId] && PAR_TIMES[stageId][carId];
  return Number.isFinite(t) && t > 0 ? t : fallbackStageParTime;
}

export const RIVAL_POINTS = Object.freeze([10, 8, 6, 5, 4, 3, 2, 1]);

/** name, nationality code (ISO-3), car id, skill 0..1, consistency 0..1 (higher = fewer bad stages) */
export const RIVALS = Object.freeze([
  Object.freeze({ id: "tane", name: "Tane Rangihuna", nationality: "NZL", car: "huia", skill: 0.93, consistency: 0.92, flavour: "Local hero, relentless on gravel" }),
  Object.freeze({ id: "mere", name: "Mere Kowhai", nationality: "NZL", car: "kea", skill: 0.9, consistency: 0.9, flavour: "Fearless in the wet" }),
  Object.freeze({ id: "hamish", name: "Hamish Strathearn", nationality: "NZL", car: "takahe", skill: 0.86, consistency: 0.88, flavour: "Smooth, momentum merchant" }),
  Object.freeze({ id: "aroha", name: "Aroha Pomare", nationality: "NZL", car: "piwakawaka", skill: 0.84, consistency: 0.78, flavour: "Fast, loose and occasionally in a hedge" }),
  Object.freeze({ id: "callum", name: "Callum Treloar", nationality: "AUS", car: "huia", skill: 0.8, consistency: 0.84, flavour: "Tarmac specialist from Tasmania" }),
  Object.freeze({ id: "sione", name: "Sione Tuilagi", nationality: "SAM", car: "kea", skill: 0.77, consistency: 0.8, flavour: "Bold, loves a jump" }),
  Object.freeze({ id: "ingrid", name: "Ingrid Haugland", nationality: "NOR", car: "takahe", skill: 0.72, consistency: 0.9, flavour: "Careful, never off the pace" }),
]);

const BASE = { rookie: 1.16, pro: 1.075, expert: 1.02 };
const SPREAD = { rookie: 0.55, pro: 0.42, expert: 0.34 };
export const DIFFICULTIES = Object.freeze(["rookie", "pro", "expert"]);

/**
 * Stage time (s) for a rival.  parTime is the expert-pace reference for the stage and the chosen car
 * class; the result is deterministic for equal arguments.
 */
export function rivalStageTime({ stageId, rivalIndex, parTime, difficulty = "pro", seed = 1 }) {
  const rv = RIVALS[rivalIndex];
  if (!rv) throw new Error("bad rival index " + rivalIndex);
  const diff = BASE[difficulty] !== undefined ? difficulty : "pro";
  const stageNo = Math.max(0, STAGE_IDS.indexOf(stageId));
  const rng = makeRng(hashString(`${seed}|${stageId}|${rivalIndex}|${diff}`));
  const pace = BASE[diff] + (1 - rv.skill) * SPREAD[diff];
  // stage affinity: a fixed per-driver / per-stage bias of up to about +-1.2 %
  const bias = (makeRng(hashString(`affinity|${rv.id}|${stageNo}`)).next() - 0.5) * 0.024;
  // day-to-day variation, narrower for consistent drivers
  const sigma = (1 - rv.consistency) * 0.045 + 0.003;
  let f = pace + bias + rng.normal() * sigma;
  let t = parTime * Math.max(1.0, f);
  // an occasional mistake: bigger penalty for inconsistent drivers
  if (rng.chance((1 - rv.consistency) * 0.35)) t += 4 + rng.next() * 14;
  return Math.round(t * 1000) / 1000;
}

/** All seven rival times for a stage. */
export function rivalStageTimes(args) {
  return RIVALS.map((_, i) => rivalStageTime({ ...args, rivalIndex: i }));
}

/**
 * buildTimeSheet(playerTime, rivalTimes) -> ordered results.
 * rivalTimes: array of seconds (index = rival index), or array of { index?, name?, time }.
 * A non-finite time (DNF) sorts last and scores no points.
 */
export function buildTimeSheet(playerTime, rivalTimes) {
  const rows = [{ key: "player", name: "You", nationality: "", car: "", isPlayer: true, rivalIndex: -1, time: playerTime }];
  rivalTimes.forEach((rt, i) => {
    const time = typeof rt === "number" ? rt : rt.time;
    const rivalIndex = typeof rt === "number" || rt.index === undefined ? i : rt.index;
    const rv = RIVALS[rivalIndex];
    rows.push({
      key: rv ? rv.id : `r${i}`, name: (typeof rt === "object" && rt.name) || (rv ? rv.name : `Rival ${i + 1}`),
      nationality: rv ? rv.nationality : "", car: rv ? rv.car : "", isPlayer: false, rivalIndex, time,
    });
  });
  const fin = (r) => (Number.isFinite(r.time) ? r.time : Infinity);
  rows.sort((a, b) => fin(a) - fin(b) || (a.isPlayer ? -1 : b.isPlayer ? 1 : a.rivalIndex - b.rivalIndex));
  const leader = fin(rows[0]);
  return rows.map((r, k) => ({
    ...r,
    position: k + 1,
    dnf: !Number.isFinite(r.time),
    gap: Number.isFinite(r.time) ? r.time - leader : null,
    gapToPrev: k > 0 && Number.isFinite(r.time) && Number.isFinite(rows[k - 1].time) ? r.time - rows[k - 1].time : null,
    points: Number.isFinite(r.time) ? RIVAL_POINTS[k] ?? 0 : 0,
  }));
}
