import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState, ensurePlanForDate, logDuty, setLowEnergyMode, switchLocationMode, validateImportData, serialiseState } from "../engine.js";
import { EXERCISES } from "../content.js";

const date = "2026-07-06";
let state = createInitialState(new Date(`${date}T08:00:00`));
assert.equal(state.initialized, false, "first launch starts uninitialised for welcome flow");
state.initialized = true;
state = ensurePlanForDate(state, date);
const duty = state.plans[date].duties[0];
state = logDuty(state, date, duty.id, { status: "done", feedback: "about_right" }, new Date(`${date}T08:10:00`));
assert.equal(state.plans[date].maintained, true, "done flow maintains day");
const second = state.plans[date].duties.find((d) => d.status === "pending");
state = logDuty(state, date, second.id, { status: "partial", actualReps: 1, actualSets: 1, feedback: "too_hard" }, new Date(`${date}T12:10:00`));
assert.equal(state.logs.find((l) => l.dutyId === second.id).status, "partial", "partial flow logs status");
const third = state.plans[date].duties.find((d) => d.status === "pending");
state = logDuty(state, date, third.id, { status: "skipped", feedback: "too_hard" }, new Date(`${date}T15:10:00`));
assert.equal(state.logs.find((l) => l.dutyId === third.id).status, "skipped", "skip flow logs status");
state = setLowEnergyMode(state, date, true);
assert.equal(state.plans[date].lowEnergyMode, true, "low-energy flow toggles");
state = switchLocationMode(state, date, "hotel_gym");
assert.equal(state.plans[date].locationMode, "hotel_gym", "hotel flow toggles");
assert.equal(validateImportData(serialiseState(state)).ok, true, "import/export flow validates");

for (const exercise of EXERCISES) {
  assert.ok(exercise.instructions.length >= 3, `${exercise.id} has usable instructions`);
  assert.ok(exercise.diagramType, `${exercise.id} has a diagram type`);
}
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
for (const phrase of ["Bridge", "Engine Room", "Ship's Log", "Chart Room", "Settings", "Export JSON backup", "Import JSON backup", "Reset local data", "Low-energy day", "hotel gym today"]) {
  assert.ok(app.includes(phrase), `UI includes ${phrase}`);
}
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(sw.includes("caches.open") && sw.includes("fetch"), "offline reload has cache-first service worker");
console.log("manual smoke verification passed");
