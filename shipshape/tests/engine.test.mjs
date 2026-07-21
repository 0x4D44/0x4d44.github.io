import assert from "node:assert/strict";
import {
  calculateStats,
  createInitialState,
  ensurePlanForDate,
  findExercise,
  generateDailyPlan,
  logDuty,
  readinessScore,
  setLowEnergyMode,
  switchLocationMode,
  updateProgression,
  validateImportData,
  serialiseState
} from "../engine.js";

const date = "2026-07-06";
let state = createInitialState(new Date(`${date}T09:00:00`));
state = ensurePlanForDate(state, date);
const plan = state.plans[date];
assert.equal(plan.date, date, "plan uses requested date");
assert.equal(plan.locationMode, "home", "default plan is home mode");
assert.ok(plan.duties.length >= 4, "normal day has several micro-duties");
assert.deepEqual(plan.duties.map((d) => d.period), ["morning", "midday", "afternoon", "evening"], "duties are spread across the day");
assert.ok(plan.duties.every((d) => findExercise(d.exerciseId)), "all duties reference authored exercises");

const firstDuty = plan.duties[0];
state = logDuty(state, date, firstDuty.id, { status: "partial", actualSeconds: 3, actualReps: 0, actualSets: 1, feedback: "about_right" }, new Date(`${date}T09:05:00`));
assert.equal(state.plans[date].maintained, true, "doing anything maintains the day");
assert.equal(calculateStats(state, date).maintainedDays, 1, "maintained day is counted");
assert.equal(readinessScore(state, date).label.length > 0, true, "readiness label is present");

const easier = findExercise("ring-dead-hang");
let prog = { exerciseId: easier.id, currentLevel: 0, recentFeedback: ["too_easy", "too_easy"], recentStatuses: ["done", "done"] };
prog = updateProgression(prog, easier, { exerciseId: easier.id, status: "done", actualSeconds: 25 }, { status: "done", actualSeconds: 25, feedback: "too_easy" }, `${date}T10:00:00`);
assert.equal(prog.currentLevel, 1, "three easy completions nudge progression up");
prog = updateProgression(prog, easier, { exerciseId: easier.id, status: "done", actualSeconds: 5 }, { status: "done", actualSeconds: 5, feedback: "pain_or_discomfort" }, `${date}T11:00:00`);
assert.equal(prog.currentLevel, 0, "pain/discomfort reduces progression");

state = switchLocationMode(state, date, "hotel_gym");
assert.equal(state.plans[date].locationMode, "hotel_gym", "location mode switches to hotel gym");
assert.ok(state.plans[date].duties.some((d) => findExercise(d.exerciseId).locationModes.includes("hotel_gym")), "hotel plan contains hotel exercises");
state = setLowEnergyMode(state, date, true);
assert.equal(state.plans[date].lowEnergyMode, true, "low energy mode is recorded");
assert.ok(state.plans[date].duties.filter((d) => d.status === "pending").length <= 2, "low energy keeps pending duties tiny");

const gymPlan = generateDailyPlan("2026-07-07", { ...state.settings, locationModeDefault: "hotel_gym" }, state.progression);
assert.ok(gymPlan.duties.length >= 4, "hotel plan generates a full set of duties");
assert.ok(gymPlan.duties.every((d) => findExercise(d.exerciseId).locationModes.includes("hotel_gym")), "hotel plan uses gym-compatible duties");

// ALM-BUG-KILN-00031: difficulty must move on a sustained RUN, not a single session.
// every() is vacuously true on a short slice, so with empty history one feedback must not
// adjust the level; and feedback/status must stay aligned per duty.
let p31 = updateProgression({ exerciseId: easier.id, currentLevel: 0, recentLog: [] }, easier, {}, { status: "done", feedback: "too_easy" }, `${date}T10:00:00`);
assert.equal(p31.currentLevel, 0, "a single too_easy on empty history must not bump the level (KILN-31)");
let p31b = updateProgression({ exerciseId: easier.id, currentLevel: 3, recentLog: [] }, easier, {}, { status: "done", feedback: "too_hard" }, `${date}T10:00:00`);
assert.equal(p31b.currentLevel, 3, "a single too_hard on empty history must not drop the level (KILN-31)");
const p31align = updateProgression({ exerciseId: easier.id, currentLevel: 0, recentLog: [] }, easier, {}, { status: "skipped" }, `${date}T10:00:00`);
assert.deepEqual(p31align.recentLog, [{ feedback: undefined, status: "skipped" }], "a status-only duty is recorded aligned in recentLog (KILN-31)");
// three genuine easy completions still progress (regression of the intended behaviour).
let p31run = { exerciseId: easier.id, currentLevel: 0, recentLog: [] };
for (let i = 0; i < 3; i += 1) p31run = updateProgression(p31run, easier, {}, { status: "done", feedback: "too_easy" }, `${date}T1${i}:00:00`);
assert.equal(p31run.currentLevel, 1, "three easy completions still nudge progression up (KILN-31)");

const exported = serialiseState(state);
const imported = validateImportData(exported);
assert.equal(imported.ok, true, "exported state validates for import");
assert.deepEqual(imported.value.logs.map((l) => l.dutyId), state.logs.map((l) => l.dutyId), "log survives export/import validation");
assert.equal(validateImportData("not json").ok, false, "invalid JSON is rejected");
assert.equal(validateImportData({ version: 1, settings: {}, plans: {}, progression: {}, logs: [{ date, exerciseId: "missing", status: "done" }] }).ok, false, "unknown exercise import is rejected");

console.log("shipshape engine tests passed");
