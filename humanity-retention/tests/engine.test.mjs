import assert from "node:assert/strict";
import {
  advanceTurn,
  applyAction,
  averagePressure,
  canApplyAction,
  completeRun,
  createRun,
  exportSave,
  importSave,
  scoreRun,
} from "../engine.js";

const first = createRun({ seed: "fixed-seed", difficulty: "standard" });
const second = createRun({ seed: "fixed-seed", difficulty: "standard" });
assert.deepEqual(first, second, "same seed should produce the same starting run");

const target = first.regions[0].id;
assert.equal(canApplyAction(first, "field-audit", target).ok, true, "field audit should be available");
const audited = applyAction(first, "field-audit", target);
assert.equal(audited.ok, true, "field audit should apply");
assert.ok(audited.state.regions[0].infection < first.regions[0].infection, "field audit lowers local pressure");
assert.ok(audited.state.meters.economy < first.meters.economy, "field audit spends economy");

const turnA = advanceTurn(audited.state);
const turnB = advanceTurn(audited.state);
assert.deepEqual(turnA, turnB, "turn resolution should be deterministic from state and seed");
assert.ok(averagePressure(turnA) >= 0 && averagePressure(turnA) <= 100, "pressure stays bounded");
assert.ok(scoreRun(turnA) >= 0, "score is non-negative");

const complete = { ...turnA, over: true, ending: { id: "retained", title: "Humanity Retained", text: "ok" }, meters: { ...turnA.meters, ethics: 90, trust: 90, ai: 85 } };
complete.regions = complete.regions.map((region) => ({ ...region, infection: 5, misinformation: 5, cooperation: 90 }));
const progress = completeRun(undefined, complete);
assert.equal(progress.runs, 1, "completeRun increments run count");
assert.ok(progress.achievements.includes("first-shift"), "first completion grants first-shift");
assert.ok(progress.bestScore > 0, "best score is recorded");

const save = exportSave(progress);
const imported = importSave(save);
assert.equal(imported.ok, true, "exported save imports cleanly");
assert.deepEqual(imported.value.achievements.sort(), progress.achievements.sort(), "achievements survive save roundtrip");
assert.equal(importSave("not json").ok, false, "invalid JSON is rejected");

console.log("engine tests passed");
