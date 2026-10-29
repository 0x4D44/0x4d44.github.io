import test from "node:test";
import assert from "node:assert/strict";
import {
  createCareer, POINTS, STAGE_ORDER, SAVE_KEY, DIFFICULTY, partDamage, vehicleOptionsFor, encodeGhost, decodeGhost,
  sanitiseOptions, DEFAULT_OPTIONS, fallbackRivals, REPAIR_COST, GHOST_KEY,
} from "../core/career.mjs";
import { createStorage, createMemoryStorage } from "../core/storage.mjs";

const mkCareer = (store = createStorage(createMemoryStorage())) => ({ store, c: createCareer({ storage: store, parTime: () => 200 }) });
const finished = (total, penaltyTotal = 0) => ({ status: "finished", total, penaltyTotal, time: total - penaltyTotal, splits: [], penalties: [] });
const dmg = (o = {}) => ({ engine: 0, gearbox: 0, steering: 0, radiator: 0, suspension: [0, 0, 0, 0], tyres: [0, 0, 0, 0], body: { front: 0, rear: 0, left: 0, right: 0 }, total: 0, ...o });

test("points table is 10-8-6-5-4-3-2-1 and stages are the six in order", () => {
  assert.deepEqual([...POINTS], [10, 8, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual([...STAGE_ORDER], ["waitomo", "whakarewarewa", "coromandel", "otago", "remarkables", "fiordland"]);
});

test("fallback rivals are deterministic and seven strong", () => {
  const a = fallbackRivals("otago", { parTime: 200 }), b = fallbackRivals("otago", { parTime: 200 });
  assert.equal(a.length, 7);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((r) => r.time), fallbackRivals("waitomo", { parTime: 200 }).map((r) => r.time));
});

test("a stage win scores 10 points, last place scores 1, DNF scores 0", () => {
  const { c } = mkCareer();
  c.newChampionship({ difficulty: "pro", carId: "huia" });
  const sheet = c.completeStage(finished(1), dmg());
  assert.equal(sheet.length, 8);
  const me = sheet.find((r) => r.player);
  assert.equal(me.position, 1);
  assert.equal(me.points, 10);
  const { c: c2 } = mkCareer();
  c2.newChampionship({ difficulty: "pro", carId: "huia" });
  const s2 = c2.completeStage(finished(9999), dmg());
  assert.equal(s2.find((r) => r.player).position, 8);
  assert.equal(s2.find((r) => r.player).points, 1);
  const { c: c3 } = mkCareer();
  c3.newChampionship({ difficulty: "pro", carId: "huia" });
  const s3 = c3.completeStage({ status: "dnf", total: Infinity, penaltyTotal: 0 }, dmg({ total: 1 }));
  const m3 = s3.find((r) => r.player);
  assert.equal(m3.dnf, true);
  assert.equal(m3.points, 0);
  assert.equal(m3.position, 8);
  assert.equal(m3.time, null);
});

test("penalties are part of the player's total time and can cost positions", () => {
  const { c } = mkCareer();
  c.newChampionship({ difficulty: "pro" });
  const fast = fallbackRivals("waitomo", { parTime: 200, pace: 1 }).map((r) => r.time).sort((a, b) => a - b);
  const raw = fast[0] - 0.5;
  const clean = c.buildSheet("waitomo", finished(raw, 0));
  const penalised = c.buildSheet("waitomo", finished(raw + 30, 30));
  assert.equal(clean.find((r) => r.player).position, 1);
  assert.ok(penalised.find((r) => r.player).position > 1);
  assert.equal(penalised.find((r) => r.player).penalty, 30);
});

test("championship runs six stages, standings accumulate, finished flag flips, then no more stages", () => {
  const { c } = mkCareer();
  c.newChampionship({ difficulty: "expert", carId: "kea" });
  for (let i = 0; i < 6; i++) {
    assert.equal(c.currentStageId, STAGE_ORDER[i]);
    assert.equal(c.finished, false);
    c.completeStage(finished(150 + i), dmg());
    if (i < 5) assert.equal(c.championship.service.budget, DIFFICULTY.expert.repairMinutes);
  }
  assert.equal(c.finished, true);
  assert.equal(c.currentStageId, null);
  assert.equal(c.completeStage(finished(100), dmg()), null);
  const st = c.standings();
  assert.equal(st.length, 8);
  assert.equal(st[0].position, 1);
  assert.equal(st[0].player, true, "a car that wins every stage is champion");
  assert.equal(st[0].points, 60);
  assert.equal(st[0].wins, 6);
  assert.equal(st.reduce((a, r) => a + r.points, 0), 6 * POINTS.reduce((a, b) => a + b, 0));
  for (let i = 1; i < st.length; i++) assert.ok(st[i - 1].points >= st[i].points);
  assert.equal(c.profile.stats.championships, 1);
});

test("standings order ties on points by cumulative time", () => {
  const { c } = mkCareer();
  c.newChampionship({ difficulty: "pro" });
  c.completeStage(finished(1), dmg());
  c.completeStage(finished(99999), dmg());
  const st = c.standings();
  for (let i = 1; i < st.length; i++) assert.ok(st[i - 1].points > st[i].points || (st[i - 1].points === st[i].points && st[i - 1].total <= st[i].total));
});

test("difficulty changes rival pace and the service budget", () => {
  const per = (d) => { const { c } = mkCareer(); c.newChampionship({ difficulty: d }); const sheet = c.buildSheet("waitomo", finished(1)); return sheet.filter((r) => !r.player).reduce((a, r) => a + r.time, 0); };
  assert.ok(per("expert") < per("pro") && per("pro") < per("rookie"));
  assert.ok(DIFFICULTY.rookie.repairMinutes > DIFFICULTY.pro.repairMinutes && DIFFICULTY.pro.repairMinutes > DIFFICULTY.expert.repairMinutes);
});

test("partDamage collapses the physics record into six parts", () => {
  const p = partDamage(dmg({ engine: 0.2, radiator: 0.5, suspension: [0.4, 0, 0, 0], tyres: [1, 1, 0, 0], body: { front: 0.8, rear: 0, left: 0, right: 0 } }));
  assert.equal(p.engine, 0.4);
  assert.equal(p.suspension, 0.1);
  assert.equal(p.tyres, 0.5);
  assert.equal(p.body, 0.2);
  assert.deepEqual(partDamage(null), { engine: 0, gearbox: 0, steering: 0, suspension: 0, tyres: 0, body: 0 });
});

test("repair budget: spending is capped at the minutes available and commit applies the plan", () => {
  const { c } = mkCareer();
  c.newChampionship({ difficulty: "pro" }); // 45 min
  c.completeStage(finished(200), dmg({ engine: 1, gearbox: 1, body: { front: 1, rear: 1, left: 1, right: 1 } }));
  assert.equal(c.championship.service.budget, 45);
  assert.equal(c.setRepair("engine", 1), 1); // 30 min
  assert.ok(Math.abs(c.serviceSpent() - REPAIR_COST.engine) < 1e-9);
  assert.ok(Math.abs(c.serviceLeft() - 15) < 1e-9);
  const got = c.setRepair("body", 1); // would cost 36, only 15 left
  assert.ok(Math.abs(got - 15 / 36) < 1e-9, "capped to the remaining budget, got " + got);
  assert.ok(c.serviceLeft() < 1e-9);
  assert.equal(c.setRepair("gearbox", 1), 0, "no minutes left");
  c.setRepair("engine", 0.5); // frees 15 min
  assert.ok(c.serviceLeft() > 14.9);
  const plan = c.commitService();
  assert.ok(plan.engine === 0.5);
  assert.ok(Math.abs(c.championship.damage.engine - 0.5) < 1e-9);
  assert.equal(c.championship.damage.gearbox, 1, "unrepaired part stays broken");
  assert.equal(c.championship.service.budget, 0);
  assert.ok(Math.abs(c.championship.damage.body.front - (1 - 15 / 36 * 1)) < 1e-6 || c.championship.damage.body.front < 1);
});

test("repair on an undamaged part does nothing", () => {
  const { c } = mkCareer();
  c.newChampionship({});
  c.completeStage(finished(200), dmg());
  assert.equal(c.setRepair("engine", 1), 0);
  assert.equal(c.serviceSpent(), 0);
});

test("save / load round trip restores championship, best times and options", () => {
  const { store, c } = mkCareer();
  c.newChampionship({ difficulty: "expert", carId: "takahe", livery: 2, setup: { tyre: "snow", gear: 0.4, susp: -0.2, brake: 0.05 } });
  c.completeStage(finished(180.123, 10), dmg({ engine: 0.3 }));
  c.recordBest("waitomo", "takahe", 180.123, [0, 60, 120, 180.123]);
  c.setOption("fov", 90); c.setOption("units", "mph");
  assert.equal(c.save(), true);
  assert.ok(store.get(SAVE_KEY));
  const { c: d } = mkCareer(store);
  assert.equal(d.load(), true);
  assert.deepEqual(d.championship, c.championship);
  assert.equal(d.bestTime("waitomo", "takahe"), 180.123);
  assert.deepEqual(d.bestSplits("waitomo", "takahe"), [0, 60, 120, 180.123]);
  assert.equal(d.options.fov, 90);
  assert.equal(d.options.units, "mph");
  assert.deepEqual(d.standings(), c.standings());
});

test("corrupt, unknown-version and hostile saves never crash and start fresh", () => {
  const bad = [
    "{not json", "", "null", "[]", "42", '{"v":99,"profile":{},"championship":null}', '{"v":1}',
    '{"v":1,"profile":{"best":{"waitomo":{"huia":"fast","kea":-3}},"options":{"fov":"x","quality":"nope"}},"championship":{"difficulty":"insane"}}',
    '{"v":1,"profile":null,"championship":{"difficulty":"pro","stageIndex":99,"results":[]}}',
    '{"v":1,"profile":{},"championship":{"difficulty":"pro","stageIndex":1,"results":[{"stageId":"x","sheet":"bad"}]}}',
  ];
  for (const raw of bad) {
    const store = createStorage(createMemoryStorage({ [SAVE_KEY]: raw }));
    const c = createCareer({ storage: store });
    assert.doesNotThrow(() => c.load(), raw);
    assert.doesNotThrow(() => c.standings());
    assert.equal(c.championship, null, raw);
    assert.doesNotThrow(() => c.bestTime("waitomo", "huia"));
    assert.deepEqual(c.options, sanitiseOptions(null));
  }
  // partially valid profile is kept, bad entries dropped
  const s2 = createStorage(createMemoryStorage({ [SAVE_KEY]: '{"v":1,"profile":{"best":{"waitomo":{"huia":200,"kea":"x"}}},"championship":null}' }));
  const c2 = createCareer({ storage: s2 });
  assert.equal(c2.load(), true);
  assert.equal(c2.bestTime("waitomo", "huia"), 200);
  assert.equal(c2.bestTime("waitomo", "kea"), null);
});

test("storage that throws never crashes the career", () => {
  const evil = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("denied"); } };
  const c = createCareer({ storage: createStorage(evil) });
  assert.equal(c.load(), false);
  c.newChampionship({});
  assert.equal(c.save(), false);
  assert.doesNotThrow(() => c.wipe());
});

test("recordBest keeps the faster time and ignores bad values", () => {
  const { c } = mkCareer();
  assert.deepEqual(c.recordBest("otago", "kea", 200, [0, 100, 200]), { isBest: true, previous: null });
  assert.deepEqual(c.recordBest("otago", "kea", 210), { isBest: false, previous: 200 });
  assert.equal(c.recordBest("otago", "kea", 190, [0, 90, 190]).isBest, true);
  assert.deepEqual(c.bestSplits("otago", "kea"), [0, 90, 190]);
  assert.equal(c.recordBest("otago", "kea", NaN).isBest, false);
  assert.equal(c.recordBest("otago", "kea", -5).isBest, false);
  assert.equal(c.bestTime("otago", "kea"), 190);
  assert.equal(c.bestTime("otago", "huia"), null);
  assert.equal(c.bestTimeAnyCar("otago"), 190);
});

test("ghost frames survive an encode/decode round trip and corrupt ghosts decode to null", () => {
  const frames = Array.from({ length: 50 }, (_, i) => ({ x: i * 1.234 - 3, y: 10 + Math.sin(i), z: -i * 4.5, yaw: 0.01 * i, pitch: 0.02, roll: -0.03 }));
  const back = decodeGhost(JSON.parse(JSON.stringify(encodeGhost(frames))));
  assert.equal(back.length, 50);
  for (let i = 0; i < 50; i++) { assert.ok(Math.abs(back[i].x - frames[i].x) < 0.006); assert.ok(Math.abs(back[i].yaw - frames[i].yaw) < 0.001); }
  assert.equal(decodeGhost({ n: 3, d: [1, 2] }), null);
  assert.equal(decodeGhost(null), null);
  assert.equal(decodeGhost({ n: 1, d: [1, 2, 3, 4, 5, "x"] }), null);
  const { store, c } = mkCareer();
  c.saveGhost("waitomo", "huia", frames);
  assert.ok(store.get(GHOST_KEY("waitomo", "huia")));
  assert.equal(c.loadGhost("waitomo", "huia").length, 50);
  store.set(GHOST_KEY("waitomo", "kea"), "garbage");
  assert.equal(c.loadGhost("waitomo", "kea"), null);
});

test("options are clamped and unknown keys dropped", () => {
  const o = sanitiseOptions({ fov: 500, hudScale: -1, units: "furlongs", master: 3, quality: "ultra", evil: 1, camera: "bonnet" });
  assert.equal(o.fov, 110); assert.equal(o.hudScale, 0.7); assert.equal(o.units, "kmh"); assert.equal(o.master, 1);
  assert.equal(o.quality, "ultra"); assert.equal(o.camera, "bonnet"); assert.ok(!("evil" in o));
  assert.deepEqual(Object.keys(o).sort(), Object.keys(DEFAULT_OPTIONS).sort());
});

test("vehicleOptionsFor maps setup onto Vehicle.configure arguments", () => {
  const spec = { brakeBias: 0.62 };
  const o = vehicleOptionsFor(spec, { tyre: "snow", gear: 1, susp: -1, brake: 0.05 }, { gearbox: "manual", steerAssist: 1 });
  assert.equal(o.tyre, "snow");
  assert.ok(Math.abs(o.setup.gearRatioScale - 1.1) < 1e-9);
  assert.ok(Math.abs(o.setup.suspensionStiffness - 0.75) < 1e-9);
  assert.ok(Math.abs(o.setup.brakeBias - 0.67) < 1e-9);
  assert.equal(o.auto, false);
  assert.ok(Math.abs(o.assist - 0.7) < 1e-9);
  assert.equal(vehicleOptionsFor(spec, { tyre: "bogus" }).tyre, "gravel");
});
