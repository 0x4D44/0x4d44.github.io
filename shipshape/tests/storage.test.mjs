import assert from "node:assert/strict";
import { createInitialState, ensurePlanForDate, logDuty, validateImportData } from "../engine.js";
import { createMemoryStorage } from "../storage.js";

const date = "2026-07-06";
const storage = createMemoryStorage(createInitialState(new Date(`${date}T08:00:00`)));
let state = await storage.load();
state = ensurePlanForDate(state, date);
const duty = state.plans[date].duties[0];
state = logDuty(state, date, duty.id, { status: "done", feedback: "about_right" }, new Date(`${date}T08:10:00`));
await storage.save(state);
const loaded = await storage.load();
assert.equal(loaded.plans[date].maintained, true, "memory storage persists maintained plan");
assert.equal(loaded.logs.length, 1, "memory storage persists log entry");

const json = await storage.exportJson();
assert.equal(validateImportData(json).ok, true, "export JSON validates");
const fresh = createMemoryStorage();
const imported = await fresh.importJson(json);
assert.equal(imported.ok, true, "memory storage imports valid JSON");
assert.equal((await fresh.load()).logs.length, 1, "imported log can be loaded");
const rejected = await fresh.importJson("not json");
assert.equal(rejected.ok, false, "invalid import is rejected by storage layer");
await fresh.reset();
assert.equal((await fresh.load()).logs.length, 0, "reset clears local memory data");

console.log("shipshape storage tests passed");
