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

const exported = serialiseState(state);
const imported = validateImportData(exported);
assert.equal(imported.ok, true, "exported state validates for import");
assert.deepEqual(imported.value.logs.map((l) => l.dutyId), state.logs.map((l) => l.dutyId), "log survives export/import validation");
assert.equal(validateImportData("not json").ok, false, "invalid JSON is rejected");
assert.equal(validateImportData({ version: 1, settings: {}, plans: {}, progression: {}, logs: [{ date, exerciseId: "missing", status: "done" }] }).ok, false, "unknown exercise import is rejected");

console.log("shipshape engine tests passed");
