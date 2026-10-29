// Literal pins for career constants and clamps (found by a x10 / /10 mutation sweep: each of these was a survivor).
import test from "node:test";
import assert from "node:assert/strict";
import {
  createCareer, DIFFICULTY, REPAIR_COST, SETUP_RANGE, DEFAULT_OPTIONS, sanitiseOptions, partDamage, vehicleOptionsFor,
  encodeGhost, decodeGhost, GHOST_HZ, fallbackRivals, recommendedTyre, SAVE_KEY,
} from "../core/career.mjs";
import { createStorage, createMemoryStorage } from "../core/storage.mjs";

test("difficulty table and repair costs", () => {
  const num = (d) => ({ rivalPace: d.rivalPace, repairMinutes: d.repairMinutes, damageScale: d.damageScale, respawnPenalty: d.respawnPenalty });
  assert.deepEqual(num(DIFFICULTY.rookie), { rivalPace: 1.12, repairMinutes: 60, damageScale: 0.6, respawnPenalty: 8 });
  assert.deepEqual(num(DIFFICULTY.pro), { rivalPace: 1.0, repairMinutes: 45, damageScale: 1.0, respawnPenalty: 10 });
  assert.deepEqual(num(DIFFICULTY.expert), { rivalPace: 0.965, repairMinutes: 30, damageScale: 1.35, respawnPenalty: 15 });
  assert.deepEqual({ ...REPAIR_COST }, { engine: 30, gearbox: 24, steering: 12, suspension: 28, tyres: 16, body: 36 });
  assert.deepEqual(JSON.parse(JSON.stringify(SETUP_RANGE)), { gear: [-1, 1], susp: [-1, 1], brake: [-0.1, 0.1] });
  assert.deepEqual({ ...DEFAULT_OPTIONS }, {
    units: "kmh", fov: 75, quality: "auto", fps: false, reducedMotion: false, colourSafe: false, hudScale: 1,
    gearbox: "auto", steerAssist: 0.5, camera: "chase", tilt: false, touch: "auto",
    master: 0.8, engine: 1, effects: 1, voice: 1, ambience: 0.7, mute: false, codriver: true, voiceName: "",
  });
});

test("option clamps and defaults", () => {
  const s = (o) => sanitiseOptions(o);
  assert.equal(s({ fov: 10 }).fov, 55); assert.equal(s({ fov: 500 }).fov, 110); assert.equal(s({ fov: "x" }).fov, 75);
  assert.equal(s({ hudScale: 0.1 }).hudScale, 0.7); assert.equal(s({ hudScale: 9 }).hudScale, 1.4); assert.equal(s({ hudScale: "x" }).hudScale, 1);
  for (const k of ["steerAssist", "master", "engine", "effects", "voice", "ambience"]) {
    assert.equal(s({ [k]: 5 })[k], 1, k + " max"); assert.equal(s({ [k]: -3 })[k], 0, k + " min");
    assert.equal(s({ [k]: "x" })[k], DEFAULT_OPTIONS[k], k + " default");
  }
  assert.equal(s({ camera: "bonnet" }).camera, "bonnet"); assert.equal(s({ camera: "tv" }).camera, "chase");
  assert.equal(s({ voiceName: "Microsoft Libby" }).voiceName, "Microsoft Libby");
  for (const bad of [7, {}, [], null, "__proto__", "constructor", "x".repeat(5000)]) assert.equal(s({ voiceName: bad }).voiceName, "", String(bad).slice(0, 12));
  assert.equal(DEFAULT_OPTIONS.voiceName, "");
});

test("partDamage: collapse, radiator weight 0.8, clamps", () => {
  assert.deepEqual(partDamage(null), { engine: 0, gearbox: 0, steering: 0, suspension: 0, tyres: 0, body: 0 });
  const p = partDamage({ engine: 0.1, radiator: 0.5, gearbox: 3, steering: -2, suspension: [1, 0, 0, 0], tyres: [5, 5, 5, 5], body: { front: 1, rear: 0, left: 0, right: 0 } });
  assert.equal(p.engine, 0.4); assert.equal(p.gearbox, 1); assert.equal(p.steering, 0);
  assert.equal(p.suspension, 0.25); assert.equal(p.tyres, 1); assert.equal(p.body, 0.25);
  assert.equal(partDamage({ engine: 9, radiator: 0 }).engine, 1);
  assert.equal(partDamage({ suspension: [9, 9, 9, 9] }).suspension, 1);
  assert.equal(partDamage({ body: { front: 9, rear: 9, left: 9, right: 9 } }).body, 1);
});

test("vehicleOptionsFor: setup scaling and clamps", () => {
  const v = (setup, spec, options) => vehicleOptionsFor(spec || {}, setup, options);
  assert.equal(v({ gear: 1 }).setup.gearRatioScale, 1.1); assert.equal(v({ gear: -1 }).setup.gearRatioScale, 0.9);
  assert.equal(v({ gear: 9 }).setup.gearRatioScale, 1.1); assert.equal(v({}).setup.gearRatioScale, 1);
  assert.equal(v({ susp: 1 }).setup.suspensionStiffness, 1.25); assert.equal(v({ susp: -9 }).setup.suspensionStiffness, 0.75);
  assert.equal(v({}).setup.brakeBias, 0.6);
  assert.equal(v({ brake: 0.1 }).setup.brakeBias, 0.7); assert.equal(v({ brake: 5 }).setup.brakeBias, 0.7); assert.equal(v({ brake: -5 }).setup.brakeBias, 0.5);
  assert.equal(v({ brake: 0.1 }, { brakeBias: 0.79 }).setup.brakeBias, 0.8);
  assert.equal(v({ brake: -0.1 }, { brakeBias: 0.41 }).setup.brakeBias, 0.4);
  assert.equal(v({ brake: 0 }, { brakeBias: 0.1 }).setup.brakeBias, 0.4);
  assert.equal(v({ brake: 0 }, { brakeBias: 0.95 }).setup.brakeBias, 0.8);
  assert.equal(v({}, null, { steerAssist: 1 }).assist, 0.7); assert.equal(v({}, null, { steerAssist: 5 }).assist, 0.7);
  assert.equal(v({}, null, { steerAssist: -1 }).assist, 0);
  assert.equal(v({}, null, { difficulty: "expert" }).damageScale, 1.35);
  assert.equal(v({}, null, { gearbox: "manual" }).auto, false); assert.equal(v({}, null, { gearbox: "auto" }).auto, true);
  assert.equal(v({ tyre: "snow" }).tyre, "snow"); assert.equal(v({ tyre: "ice" }).tyre, "gravel");
});

test("ghost codec: 10 Hz, centimetre and milliradian quantisation, delta coded", () => {
  assert.equal(GHOST_HZ, 10);
  const g = encodeGhost([{ x: 1.234, y: 2.345, z: -3.456, yaw: 1.2345, pitch: 0.0123, roll: -0.0456 }, { x: 2, y: 2, z: -3, yaw: 1.3, pitch: 0, roll: 0 }]);
  assert.equal(g.hz, 10); assert.equal(g.n, 2);
  assert.deepEqual(g.d.slice(0, 6), [123, 235, -346, 1235, 12, -46]);
  assert.deepEqual(g.d.slice(6), [77, -35, 46, 65, -12, 46]);
  const back = decodeGhost(g);
  assert.deepEqual(back[0], { x: 1.23, y: 2.35, z: -3.46, yaw: 1.235, pitch: 0.012, roll: -0.046 });
  assert.deepEqual(back[1], { x: 2, y: 2, z: -3, yaw: 1.3, pitch: 0, roll: 0 });
  assert.equal(decodeGhost({ n: 1, d: [1, 2, 3] }), null);
});

test("fallback rivals: default par 240 and pace multiply, spread grows about 1.2 % per place", () => {
  const a = fallbackRivals("waitomo"), b = fallbackRivals("waitomo", { parTime: 240, pace: 1 }), c = fallbackRivals("waitomo", { parTime: 100, pace: 2 });
  assert.deepEqual(a, b);
  for (let i = 0; i < 7; i++) {
    assert.ok(a[i].time > 240 * (1 + 0.012 * i - 0.012) - 1e-9 && a[i].time < 240 * (1 + 0.012 * i + 0.018) + 1e-9, "rival " + i + " " + a[i].time);
    assert.ok(Math.abs(c[i].time / (100 * 2) - a[i].time / 240) < 1e-9, "scales with par*pace");
  }
});

test("recommended tyre: snow beats tarmac beats gravel", () => {
  assert.equal(recommendedTyre({ roadSurfaces: [0, 4] }), "snow");
  assert.equal(recommendedTyre({ roadSurfaces: [2, 2] }), "tarmac");
  assert.equal(recommendedTyre({ roadSurfaces: [2, 0] }), "gravel");
  assert.equal(recommendedTyre({ roadSurfaces: [] }), "gravel");
  assert.equal(recommendedTyre(null), "gravel");
});

const save = (champ, profile = {}) => JSON.stringify({ v: 1, profile, championship: champ });
const mkChamp = (o = {}) => ({ difficulty: "pro", carId: "huia", livery: 0, stageIndex: 0, results: [], setup: {}, damage: null, ...o });
const load = (text) => { const c = createCareer({ storage: createStorage(createMemoryStorage({ [SAVE_KEY]: text })) }); assert.equal(c.load(), true); return c; };

test("save sanitiser: damage is clamped to 0..1 per part, total capped below 1, four wheels kept", () => {
  const c = load(save(mkChamp({ damage: { engine: 9, gearbox: -1, steering: 0.5, radiator: 3, suspension: [0.1, 0.2, 0.3, 0.4, 0.5], tyres: [9, 9, 9, 9], body: { front: 9, rear: 0.2, left: 0, right: 0 }, total: 5 } })));
  const d = c.championship.damage;
  assert.equal(d.engine, 1); assert.equal(d.gearbox, 0); assert.equal(d.steering, 0.5); assert.equal(d.radiator, 1);
  assert.deepEqual(d.suspension, [0.1, 0.2, 0.3, 0.4]); assert.deepEqual(d.tyres, [1, 1, 1, 1]);
  assert.equal(d.body.front, 1); assert.equal(d.total, 0.999);
});

test("save sanitiser: sheet rows, name/id lengths, penalty/gap/points/position clamps, splits length", () => {
  const row = (o = {}) => ({ id: "x".repeat(40), name: "n".repeat(80), player: true, dnf: false, time: 100, penalty: 99999, gap: 999999, position: 99, points: 99, ...o });
  const c = load(save(mkChamp({ stageIndex: 1, results: [{ stageId: "waitomo", sheet: [row()] }] }), { best: { waitomo: { huia: 100 } }, splits: { waitomo: { huia: Array.from({ length: 39 }, (_, i) => i) } } }));
  const e = c.championship.results[0].sheet[0];
  assert.equal(e.id.length, 24); assert.equal(e.name.length, 40); assert.equal(e.penalty, 1e4); assert.equal(e.gap, 1e5);
  assert.equal(e.position, 8); assert.equal(e.points, 10);
  assert.equal(c.bestSplits("waitomo", "huia").length, 39);
  const c2 = load(save(mkChamp({ stageIndex: 1, results: [{ stageId: "waitomo", sheet: [row({ position: -5, points: -3, penalty: -1, gap: -2 })] }] }), { splits: { waitomo: { huia: Array.from({ length: 40 }, (_, i) => i) } } }));
  const e2 = c2.championship.results[0].sheet[0];
  assert.equal(e2.position, 1); assert.equal(e2.points, 0); assert.equal(e2.penalty, 0); assert.equal(e2.gap, 0);
  assert.equal(c2.bestSplits("waitomo", "huia"), null, "40 splits is not a stage");
  const sheets = (n) => ({ stageIndex: 1, results: [{ stageId: "waitomo", sheet: Array.from({ length: n }, () => row()) }] });
  assert.equal(load(save(mkChamp(sheets(0)))).championship, null);
  assert.notEqual(load(save(mkChamp(sheets(1)))).championship, null);
  assert.notEqual(load(save(mkChamp(sheets(8)))).championship, null);
  assert.equal(load(save(mkChamp(sheets(9)))).championship, null);
});

test("recordBest keeps at most 39 split times; the rival field is 7 plus the player", () => {
  const c = createCareer({ storage: createStorage(createMemoryStorage()), rivals: () => Array.from({ length: 12 }, (_, i) => ({ id: "r" + i, name: "R" + i, time: 100 + i })) });
  c.recordBest("waitomo", "huia", 50, Array.from({ length: 80 }, (_, i) => i));
  assert.equal(c.bestSplits("waitomo", "huia").length, 39);
  c.newChampionship({ difficulty: "pro" });
  assert.equal(c.buildSheet("waitomo", { status: "finished", total: 90, penaltyTotal: 0 }).length, 8);
});

test("standings: a DNF counts as the stage's slowest time plus 25 %", () => {
  const c = createCareer({ storage: createStorage(createMemoryStorage()), rivals: () => [{ id: "r1", name: "R1", time: 100 }, { id: "r2", name: "R2", time: 120 }], parTime: () => 100 });
  c.newChampionship({ difficulty: "pro" });
  c.completeStage({ status: "dnf", total: Infinity, penaltyTotal: 0 }, { engine: 0, gearbox: 0, steering: 0, radiator: 0, suspension: [0, 0, 0, 0], tyres: [0, 0, 0, 0], body: { front: 0, rear: 0, left: 0, right: 0 }, total: 1 });
  const me = c.standings().find((r) => r.player);
  assert.equal(me.total, 150);
  assert.equal(me.dnfs, 1);
  assert.equal(c.timeStandings().at(-1).id, "player");
});

test("service: repair cost is cost x damage x fraction, fractions clamp to 0..1", () => {
  const c = createCareer({ storage: createStorage(createMemoryStorage()) });
  c.newChampionship({ difficulty: "rookie" });
  c.championship.damage = { engine: 0.5, gearbox: 0, steering: 0, radiator: 0, suspension: [0, 0, 0, 0], tyres: [0, 0, 0, 0], body: { front: 0, rear: 0, left: 0, right: 0 }, total: 0.5 };
  c.championship.service = { budget: 60, plan: {} };
  assert.equal(c.repairCost("engine"), 15);
  assert.equal(c.repairCost("engine", 0.5), 7.5);
  assert.equal(c.setRepair("engine", 7), 1);
  assert.equal(c.setRepair("engine", -3), 0);
  assert.equal(c.setRepair("gearbox", 1), 0, "an undamaged part has nothing to repair");
  c.championship.service.budget = 6;
  assert.equal(c.setRepair("engine", 1), 6 / 15, "budget limits the fraction");
  c.championship.service.budget = 60;
  c.setRepair("engine", 0.5);
  c.commitService();
  assert.equal(c.championship.damage.engine, 0.25);
});

test("stage count, default par and id length limit", () => {
  const c = createCareer({ storage: createStorage(createMemoryStorage()) });
  c.newChampionship({ difficulty: "pro" });
  const zero = { engine: 0, gearbox: 0, steering: 0, radiator: 0, suspension: [0, 0, 0, 0], tyres: [0, 0, 0, 0], body: { front: 0, rear: 0, left: 0, right: 0 }, total: 0 };
  c.completeStage({ status: "finished", total: 1, penaltyTotal: 0 }, zero);
  assert.equal(c.profile.stats.stagesFinished, 1);
  const rivals = c.buildSheet("waitomo", { status: "finished", total: 1, penaltyTotal: 0 }).filter((r) => !r.player);
  assert.ok(rivals.every((r) => r.time > 200 && r.time < 290), "default par is about 240 s: " + rivals.map((r) => r.time));
  assert.equal(c.recordBest("a".repeat(39), "huia", 5).isBest, true);
  assert.equal(c.recordBest("a".repeat(40), "huia", 5).isBest, false);
});
