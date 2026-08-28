import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

import {
  createRecorder, createPlayback, createGhost, inputAt, keyframeAt,
  encodeRun, decodeRun, runByteSize, makeReplayInput, makeReplayState,
} from "../replay.js";

import {
  createCareer, rivalStageTime, estimateStageTime, conditionsFor, selectField,
  stageById, rallyById, tierById, RALLIES, TIERS, RIVALS, CARS, POINTS,
  POWER_STAGE_POINTS, PENALTIES, SCHEMA_VERSION, STORAGE_KEY, CONDITIONS,
} from "../career.js";

import { SURFACE } from "../surfaces.js";
import { STAGE_BOOK, stageBookEntry, stageFromBook } from "../stage.js";
import { presetById } from "../weather.js";

// A two-line car: enough state to have a trajectory, no physics to depend on.
function stubCar() {
  const car = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, dist: 0 };
  return {
    car,
    step(input, dt) {
      const drive = input.throttle * 9 - input.brake * 14 - input.handbrake * 6;
      car.speed = Math.max(0, car.speed + (drive - 0.03 * car.speed * car.speed * 0.1) * dt);
      const agility = car.speed / (car.speed + 9);
      car.yaw += input.steer * 0.9 * agility * dt;
      car.x += Math.sin(car.yaw) * car.speed * dt;
      car.z += Math.cos(car.yaw) * car.speed * dt;
      car.dist += car.speed * dt;
    },
    getState(out) {
      out.pos.x = car.x; out.pos.y = car.y; out.pos.z = car.z;
      out.vel.x = Math.sin(car.yaw) * car.speed;
      out.vel.y = 0;
      out.vel.z = Math.cos(car.yaw) * car.speed;
      out.yaw = car.yaw; out.pitch = 0; out.roll = 0; out.yawRate = 0;
      out.speed = car.speed; out.distance = car.dist; out.engineRpm = 0; out.gear = 3;
      return out;
    },
    setState(kf) {
      car.x = kf.pos.x; car.y = kf.pos.y; car.z = kf.pos.z;
      car.yaw = kf.yaw; car.speed = kf.speed; car.dist = kf.distance;
    },
    reset() {
      car.x = 0; car.y = 0; car.z = 0; car.yaw = 0; car.speed = 0; car.dist = 0;
    },
  };
}

// A scripted drive: smooth enough to be a real lap, varied enough that a bug in
// the input stream shows up as a different shape rather than a different scale.
function driverInput(t, out) {
  out.steer = Math.sin(t * 0.7) * 0.62 + Math.sin(t * 2.3) * 0.18;
  out.throttle = 0.55 + 0.45 * Math.sin(t * 0.31 + 0.4);
  out.brake = t % 17 < 1.2 ? 0.7 : 0;
  out.handbrake = t % 29 < 0.4 ? 1 : 0;
  out.clutch = 0;
  out.shiftUp = Math.floor(t * 2) % 13 === 0;
  out.shiftDown = false;
  out.gear = 3;
  return out;
}

const HZ = 60;
const DURATION = 90;

function recordStubRun(opts = {}) {
  const rig = stubCar();
  const rec = createRecorder(Object.assign({
    inputHz: HZ, keyframeHz: 2, ghostStepM: 5, capacitySeconds: DURATION + 5,
    meta: { stageId: "kal-hovden", carId: "vantorgt", label: "test" },
  }, opts));
  const input = makeReplayInput();
  const state = makeReplayState();
  const ticks = DURATION * HZ;
  for (let i = 0; i < ticks; i += 1) {
    const t = i / HZ;
    driverInput(t, input);
    rig.getState(state);
    rec.sample(t, input, state);
    rig.step(input, 1 / HZ);
  }
  rig.getState(state);
  const run = rec.finish(ticks / HZ, state);
  return { run, finalState: { x: rig.car.x, z: rig.car.z, yaw: rig.car.yaw, dist: rig.car.dist } };
}

test("replay: the decoded input stream reproduces the trajectory exactly", () => {
  const { run } = recordStubRun();
  assert.equal(run.tickCount, DURATION * HZ);

  const a = stubCar();
  const b = stubCar();
  const playA = createPlayback(run, a, { correct: false });
  const playB = createPlayback(run, b, { correct: false });
  playA.playAll();
  playB.playAll();

  assert.equal(a.car.x, b.car.x);
  assert.equal(a.car.z, b.car.z);
  assert.equal(a.car.yaw, b.car.yaw);
  assert.equal(a.car.dist, b.car.dist);
  assert.ok(a.car.dist > 100, `stub car should have travelled, got ${a.car.dist}`);
});

test("replay: uncorrected drift is input quantisation and nothing else", () => {
  const { run, finalState } = recordStubRun();
  const rig = stubCar();
  const play = createPlayback(run, rig, { correct: false });
  play.playAll();
  assert.equal(play.corrections, 0);
  // Steer is a byte, so a 90 s re-sim walks off by a fraction of a percent of
  // the distance covered. This is exactly why the keyframe track exists.
  assert.ok(play.maxDrift / finalState.dist < 0.005,
    `uncorrected drift ${play.maxDrift.toFixed(3)} m over ${finalState.dist.toFixed(0)} m`);
  assert.ok(play.maxDrift > 0, "the stub car really did move");
});

test("replay: keyframe correction makes the replay exact", () => {
  const { run } = recordStubRun();
  const forced = stubCar();
  const play = createPlayback(run, forced, { correct: true, tolerance: -1 });
  play.playAll();
  // Corrected at every keyframe, the only error left is one keyframe interval
  // of quantised re-simulation: under a centimetre.
  assert.equal(play.corrections, run.keyCount);
  assert.ok(play.maxDrift < 0.01, `corrected drift ${play.maxDrift.toFixed(5)} m`);

  const loose = createPlayback(run, stubCar(), { correct: true, tolerance: 0.05 });
  loose.playAll();
  assert.ok(loose.maxDrift < 0.1, `tolerance was not respected: ${loose.maxDrift.toFixed(4)} m`);
  assert.ok(loose.corrections < run.keyCount, "a tolerance should skip some corrections");
});

test("replay: seek lands where a full re-sim would, to keyframe precision", () => {
  const { run } = recordStubRun();
  // Deliberately off the keyframe grid, so seek has to restore and re-simulate.
  const target = 61.7;
  const tick = Math.round(target * HZ);
  assert.notEqual(tick % run.keyStride, 0);

  const straight = stubCar();
  createPlayback(run, straight, { correct: true, tolerance: -1 }).runTo(tick);

  const seeker = stubCar();
  const play2 = createPlayback(run, seeker, { correct: true, tolerance: -1 });
  play2.seek(target);

  assert.equal(play2.tick, tick);
  // The residual is the Float32 keyframe the seek restored from, nothing more.
  assert.ok(Math.abs(seeker.car.x - straight.car.x) < 1e-3, `x ${seeker.car.x} vs ${straight.car.x}`);
  assert.ok(Math.abs(seeker.car.z - straight.car.z) < 1e-3, `z ${seeker.car.z} vs ${straight.car.z}`);
  assert.ok(Math.abs(seeker.car.yaw - straight.car.yaw) < 1e-5);

  // Seeking backwards is the same cost as seeking forwards.
  const scrub = createPlayback(run, stubCar(), { correct: true, tolerance: -1 });
  scrub.seek(80);
  scrub.seek(12);
  assert.equal(scrub.tick, 12 * HZ);
  scrub.seek(0);
  assert.equal(scrub.tick, 0);
  scrub.seek(1e6);
  assert.equal(scrub.tick, run.tickCount);
  assert.equal(scrub.done, true);
});

test("replay: input quantisation stays inside its declared bound", () => {
  const { run } = recordStubRun();
  const raw = makeReplayInput();
  const got = makeReplayInput();
  let maxSteer = 0;
  let maxPedal = 0;
  for (let i = 0; i < run.tickCount; i += 1) {
    driverInput(i / HZ, raw);
    inputAt(run, i, got);
    maxSteer = Math.max(maxSteer, Math.abs(got.steer - Math.max(-1, Math.min(1, raw.steer))));
    maxPedal = Math.max(maxPedal, Math.abs(got.throttle - raw.throttle), Math.abs(got.brake - raw.brake));
    assert.equal(got.handbrake > 0.5, raw.handbrake > 0.5);
    assert.equal(got.shiftUp, raw.shiftUp);
    assert.equal(got.gear, raw.gear);
  }
  assert.ok(maxSteer <= 1 / 254 + 1e-9, `steer error ${maxSteer}`);
  assert.ok(maxPedal <= 1 / 510 + 1e-9, `pedal error ${maxPedal}`);
});

test("replay: keyframe quantisation is tight in position and angle", () => {
  const { run } = recordStubRun();
  const rig = stubCar();
  const live = makeReplayState();
  const kf = makeReplayState();
  let maxPos = 0;
  let maxYaw = 0;
  const input = makeReplayInput();
  for (let i = 0; i < run.tickCount; i += 1) {
    if (i % run.keyStride === 0) {
      const slot = i / run.keyStride;
      if (slot < run.keyCount) {
        rig.getState(live);
        keyframeAt(run, slot, kf);
        maxPos = Math.max(maxPos,
          Math.abs(live.pos.x - kf.pos.x), Math.abs(live.pos.z - kf.pos.z));
        maxYaw = Math.max(maxYaw, Math.abs(live.yaw - kf.yaw));
      }
    }
    driverInput(i / HZ, input);
    rig.step(input, 1 / HZ);
  }
  // Float32 keyframes over a stage-sized coordinate range.
  assert.ok(maxPos < 1e-3, `keyframe position error ${maxPos}`);
  assert.ok(maxYaw < 1e-5, `keyframe yaw error ${maxYaw}`);
});

test("replay: export/import round-trips a run byte for byte", () => {
  const { run } = recordStubRun();
  const text = encodeRun(run);
  assert.ok(text.startsWith("OR1."));
  const back = decodeRun(text);
  assert.ok(back, "run should decode");
  assert.equal(back.tickCount, run.tickCount);
  assert.equal(back.keyCount, run.keyCount);
  assert.equal(back.ghostCount, run.ghostCount);
  assert.equal(back.inputHz, run.inputHz);
  assert.equal(back.meta.stageId, "kal-hovden");
  for (const plane of ["steer", "throttle", "brake", "handbrake", "clutch", "flags", "gear", "keys", "gx", "gy", "gz", "gyaw", "gpitch", "groll", "gt", "gv"]) {
    assert.deepEqual(Array.from(back[plane]), Array.from(run[plane]), `plane ${plane}`);
  }
});

test("replay: a corrupt or foreign export decodes to null instead of throwing", () => {
  const { run } = recordStubRun();
  const text = encodeRun(run);
  assert.equal(decodeRun("not a run"), null);
  assert.equal(decodeRun(""), null);
  assert.equal(decodeRun(null), null);
  assert.equal(decodeRun(undefined), null);
  assert.equal(decodeRun("OR1.####"), null);
  const flipped = `${text.slice(0, 40)}${text[40] === "A" ? "B" : "A"}${text.slice(41)}`;
  assert.equal(decodeRun(flipped), null, "checksum should reject a mangled paste");
});

test("replay: a ten-minute stage fits in localStorage", () => {
  const rig = stubCar();
  const rec = createRecorder({ inputHz: 60, keyframeHz: 1, ghostStepM: 5, capacitySeconds: 620 });
  const input = makeReplayInput();
  const state = makeReplayState();
  const ticks = 600 * 60;
  for (let i = 0; i < ticks; i += 1) {
    const t = i / 60;
    driverInput(t, input);
    rig.getState(state);
    rec.sample(t, input, state);
    rig.step(input, 1 / 60);
  }
  const run = rec.finish(ticks / 60);
  const text = encodeRun(run);
  assert.ok(runByteSize(run) > 100000, "sanity: the raw run really is large");
  assert.ok(text.length < 900000, `encoded run ${text.length} chars`);
  assert.ok(decodeRun(text), "the big run still decodes");
});

test("ghost: delta and pose are correct at a known distance", () => {
  const { run } = recordStubRun();
  const ghost = createGhost(run);
  assert.ok(ghost.valid);
  assert.ok(ghost.count > 20);

  // Re-run the same drive and check the ghost against the truth at a marker.
  const marker = Math.floor((ghost.totalM * 0.5) / ghost.stepM) * ghost.stepM;
  const rig = stubCar();
  const input = makeReplayInput();
  let trueTimeS = 0;
  let trueX = 0;
  let trueZ = 0;
  let trueYaw = 0;
  for (let i = 0; i < run.tickCount; i += 1) {
    const t = i / HZ;
    const before = rig.car.dist;
    driverInput(t, input);
    rig.step(input, 1 / HZ);
    if (before <= marker && rig.car.dist >= marker) {
      const f = (marker - before) / Math.max(1e-9, rig.car.dist - before);
      trueTimeS = t + f / HZ;
      trueX = rig.car.x;
      trueZ = rig.car.z;
      trueYaw = rig.car.yaw;
      break;
    }
  }
  assert.ok(trueTimeS > 0, "marker should be reached");

  ghost.update(marker, trueTimeS * 1000);
  assert.ok(Math.abs(ghost.deltaMs) < 40, `ghost delta at the marker was ${ghost.deltaMs} ms`);
  assert.ok(Math.abs(ghost.pose.x - trueX) < 1.5, `ghost x ${ghost.pose.x} vs ${trueX}`);
  assert.ok(Math.abs(ghost.pose.z - trueZ) < 1.5, `ghost z ${ghost.pose.z} vs ${trueZ}`);
  assert.ok(Math.abs(ghost.pose.yaw - trueYaw) < 0.05);

  // A driver a full two seconds late at the same point is two seconds down.
  ghost.update(marker, (trueTimeS + 2) * 1000);
  assert.ok(Math.abs(ghost.deltaMs - 2000) < 60, `late delta ${ghost.deltaMs}`);
  assert.ok(ghost.gapM > 0, "the ghost should be up the road");

  // And one that is early is up on the ghost.
  ghost.update(marker, (trueTimeS - 1.5) * 1000);
  assert.ok(ghost.deltaMs < -1400 && ghost.deltaMs > -1600, `early delta ${ghost.deltaMs}`);
  assert.ok(ghost.gapM < 0);
});

test("ghost: distance sampling is monotone and clamps outside the stage", () => {
  const { run } = recordStubRun();
  const ghost = createGhost(encodeRun(run));
  assert.ok(ghost.valid, "a ghost can be built straight from an exported string");
  let last = -1;
  for (let m = 0; m <= ghost.totalM; m += ghost.stepM) {
    const t = ghost.timeAtDistance(m);
    assert.ok(t >= last, `time went backwards at ${m} m`);
    last = t;
  }
  assert.equal(ghost.timeAtDistance(-50), ghost.timeAtDistance(0));
  assert.equal(ghost.timeAtDistance(ghost.totalM + 500), ghost.timeAtDistance(ghost.totalM));
});

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

test("career: absent, corrupt and refusing storage are all survived", () => {
  const noStorage = createCareer(null);
  assert.ok(noStorage.state.profile);
  assert.equal(noStorage.save(), false);
  assert.ok(noStorage.newSeason({ seed: "s", tierId: "clubman" }));
  assert.equal(noStorage.summary().storageOk, false);

  const garbage = fakeStorage({ [`${STORAGE_KEY}.v${SCHEMA_VERSION}`]: "{not json at all" });
  const fromGarbage = createCareer(garbage);
  assert.equal(fromGarbage.state.profile.credits, 30000);
  assert.ok(fromGarbage.lastError);

  const wrongShape = fakeStorage({ [`${STORAGE_KEY}.v${SCHEMA_VERSION}`]: JSON.stringify([1, 2, 3]) });
  assert.ok(createCareer(wrongShape).state.profile);

  const halfShape = fakeStorage({
    [`${STORAGE_KEY}.v${SCHEMA_VERSION}`]: JSON.stringify({ v: 3, profile: "nope", records: 7, season: 4 }),
  });
  const half = createCareer(halfShape);
  assert.equal(typeof half.state.profile.credits, "number");
  assert.deepEqual(half.state.records, {});

  const throwing = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() { throw new Error("nope"); },
  };
  const hostile = createCareer(throwing);
  assert.equal(hostile.save(), false);
  hostile.newSeason({ seed: "hostile", tierId: "national" });
  hostile.submitStage({ timeMs: 600000 });
  assert.equal(hostile.summary().storageOk, false);
  assert.doesNotThrow(() => hostile.reset());

  const readOnly = createCareer({ getItem() { return null; }, setItem() { throw new Error("full"); } });
  readOnly.newSeason({ seed: "ro", tierId: "clubman" });
  const res = readOnly.submitStage({ timeMs: 500000, run: recordStubRun().run });
  assert.ok(res, "a stage still completes when the disk is full");
  assert.equal(readOnly.lastSaveOk, false);
});

test("career: a v1 save migrates to the current schema", () => {
  const legacy = {
    v: 1,
    credits: 12345,
    car: "auroras",
    unlocked: ["vantore16", "auroras", "not-a-car"],
    best: { "kal-hovden": 742100, "van-costiera": 601500, "bogus-stage": "nonsense" },
  };
  const storage = fakeStorage({ [`${STORAGE_KEY}.v1`]: JSON.stringify(legacy) });
  const career = createCareer(storage);

  assert.equal(career.state.v, SCHEMA_VERSION);
  assert.equal(career.state.profile.credits, 12345);
  assert.ok(career.state.profile.carsOwned.includes("auroras"));
  assert.ok(!career.state.profile.carsOwned.includes("not-a-car"));

  const rec = career.bestFor("kal-hovden", "auroras", "clear");
  assert.ok(rec, "the v1 personal best survived the migration");
  assert.equal(rec.timeMs, 742100);
  assert.equal(career.bestFor("bogus-stage", "auroras", "clear"), null);

  // And it is written back under the current key.
  career.save();
  const written = JSON.parse(storage.getItem(`${STORAGE_KEY}.v${SCHEMA_VERSION}`));
  assert.equal(written.v, SCHEMA_VERSION);
  assert.equal(written.records["kal-hovden"].auroras.clear.timeMs, 742100);
});

test("career: records keep personal bests, split bests and a ghost", () => {
  const career = createCareer(fakeStorage());
  const { run } = recordStubRun();
  const encoded = encodeRun(run);

  const first = career.recordStage({ stageId: "kal-hovden", carId: "vantorgt", weatherKey: "clear", timeMs: 700000, splits: [220000, 460000], run: encoded });
  assert.equal(first.isPb, true);
  assert.equal(first.previousMs, null);
  assert.deepEqual(first.splitPbs.map((s) => s.index), [0, 1]);

  const slower = career.recordStage({ stageId: "kal-hovden", carId: "vantorgt", weatherKey: "clear", timeMs: 715000, splits: [218000, 470000] });
  assert.equal(slower.isPb, false);
  assert.equal(career.bestFor("kal-hovden", "vantorgt", "clear").timeMs, 700000);
  // A better split inside a worse run is still a split record.
  assert.deepEqual(slower.splitPbs.map((s) => s.index), [0]);
  assert.equal(career.bestFor("kal-hovden", "vantorgt", "clear").bestSplits[0], 218000);

  const faster = career.recordStage({ stageId: "kal-hovden", carId: "vantorgt", weatherKey: "clear", timeMs: 688500, splits: [217000, 455000] });
  assert.equal(faster.isPb, true);
  assert.equal(faster.improvedMs, 11500);
  assert.equal(career.bestFor("kal-hovden", "vantorgt", "clear").runs, 3);

  // Different weather and different car are different records.
  assert.equal(career.bestFor("kal-hovden", "vantorgt", "rain"), null);
  assert.equal(career.bestFor("kal-hovden", "kobolt", "clear"), null);

  const ghost = career.ghostFor("kal-hovden", { carId: "vantorgt", weatherKey: "clear" });
  assert.ok(ghost, "the personal best carries a ghost");
  assert.equal(ghost.run.tickCount, run.tickCount);
  assert.equal(createGhost(ghost.run).valid, true);
});

test("career: rival times are deterministic in the season seed", () => {
  const stage = stageById("kloft-bjornhalt");
  const tier = tierById("continental");
  const cond = conditionsFor("alpha", "vasterkloft", "kloft-bjornhalt");
  const ctx = { seed: "alpha", eventId: "vasterkloft", stage, tier, conditions: cond };

  for (const r of RIVALS.slice(0, 8)) {
    const a = rivalStageTime(r.id, ctx);
    const b = rivalStageTime(r.id, ctx);
    assert.deepEqual(a, b, `${r.id} must be reproducible`);
  }

  // A different seed moves the field; the same seed never does.
  const other = { seed: "beta", eventId: "vasterkloft", stage, tier, conditions: cond };
  let differences = 0;
  for (const r of RIVALS) {
    if (rivalStageTime(r.id, ctx).timeMs !== rivalStageTime(r.id, other).timeMs) differences += 1;
  }
  assert.ok(differences > RIVALS.length * 0.8, `only ${differences} rivals changed with the seed`);

  // Conditions are deterministic too, and a field selection is stable.
  assert.deepEqual(conditionsFor("alpha", "vasterkloft", "kloft-bjornhalt"), cond);
  assert.deepEqual(selectField("alpha", "continental"), selectField("alpha", "continental"));
});

test("career: rival times are plausible, ordered by skill, and tightly spread", () => {
  const tier = tierById("continental");
  const field = selectField("spread", "continental");
  let stages = 0;
  let worstCleanSpread = 0;
  let retirements = 0;
  let mistakes = 0;
  let totalEntries = 0;

  for (const ev of RALLIES) {
    for (const lg of ev.legs) {
      for (const stage of lg.stages) {
        const cond = conditionsFor("spread", ev.id, stage.id);
        const base = estimateStageTime(stage, { pace: tier.pace, conditions: cond });
        const clean = [];
        for (const id of field) {
          const res = rivalStageTime(id, { seed: "spread", eventId: ev.id, stage, tier, conditions: cond });
          totalEntries += 1;
          if (res.status === "retired") { retirements += 1; continue; }
          if (res.note) mistakes += 1;
          if (!res.note) clean.push(res.timeMs);
          // A stage time must be within touching distance of the reference.
          assert.ok(res.timeMs > base * 0.95 && res.timeMs < base * 1.35,
            `${stage.id} ${id}: ${res.timeMs} vs base ${Math.round(base)}`);
        }
        assert.ok(clean.length >= 3, `${stage.id}: too few clean runs`);
        clean.sort((a, b) => a - b);
        worstCleanSpread = Math.max(worstCleanSpread, clean[clean.length - 1] / clean[0] - 1);
        stages += 1;
      }
    }
  }

  assert.equal(stages, RALLIES.reduce((n, ev) => n + ev.legs.reduce((m, l) => m + l.stages.length, 0), 0),
    "the sweep must cover every stage on the calendar");
  // The field, mistakes excluded, is covered by a few percent — not tens.
  assert.ok(worstCleanSpread < 0.09, `worst clean spread ${(worstCleanSpread * 100).toFixed(2)}%`);
  assert.ok(worstCleanSpread > 0.005, `spread ${(worstCleanSpread * 100).toFixed(2)}% is implausibly tight`);

  const retireRate = retirements / totalEntries;
  assert.ok(retireRate > 0.001 && retireRate < 0.09, `retirement rate ${(retireRate * 100).toFixed(2)}%`);
  const mistakeRate = mistakes / totalEntries;
  assert.ok(mistakeRate > 0.01 && mistakeRate < 0.30, `mistake rate ${(mistakeRate * 100).toFixed(2)}%`);
});

test("career: pace tracks skill across the whole rival pool", () => {
  const tier = tierById("continental");
  const deficits = new Map(RIVALS.map((r) => [r.id, []]));
  // Three seasons, not one. The calendar is now the stage book's twenty-four
  // runs where it used to be fifty-one invented stages, and one season of that is
  // too thin a sample for a median: at one seed each rival has 24 clean times and
  // the pair concordance below reads 89.2%, at three seeds 70 times and 93.3%,
  // for a field whose pace model did not change between the two.
  for (const seed of ["pace-a", "pace-b", "pace-c"]) {
    for (const ev of RALLIES) {
      for (const lg of ev.legs) {
        for (const stage of lg.stages) {
          const cond = conditionsFor(seed, ev.id, stage.id);
          const base = estimateStageTime(stage, { pace: tier.pace, conditions: cond });
          for (const r of RIVALS) {
            const res = rivalStageTime(r.id, { seed, eventId: ev.id, stage, tier, conditions: cond });
            if (res.status !== "ok") continue;
            deficits.get(r.id).push(res.timeMs / base - 1);
          }
        }
      }
    }
  }
  // Median, not mean: a mistake is a driver's luck on one stage, not their pace,
  // and a championship ranking that a single off-road decides is noise.
  const median = (xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const ranked = RIVALS.map((r) => ({ id: r.id, skill: r.skill, d: median(deficits.get(r.id)) }))
    .sort((a, b) => a.d - b.d);

  assert.ok(ranked[0].skill > 0.85, `fastest rival had skill ${ranked[0].skill}`);
  assert.ok(ranked[ranked.length - 1].skill < 0.45, `slowest rival had skill ${ranked[ranked.length - 1].skill}`);

  let concordant = 0;
  let pairs = 0;
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      pairs += 1;
      if (ranked[i].skill >= ranked[j].skill) concordant += 1;
    }
  }
  assert.ok(concordant / pairs > 0.9, `only ${(concordant / pairs * 100).toFixed(0)}% of pairs ordered by skill`);

  // Surface preference is worth about a percent, and shows up where it should.
  // No road in the stage book declares a SNOW or ICE surface, so the pairing that
  // still discriminates is gravel against tarmac: kirvala is +0.4 gravel / -0.3
  // tarmac, bellucco -0.1 / +0.9.
  //
  // One seed cannot answer this and the old single-seed form only looked like it
  // could: on seed "pace" bellucco retires on the gravel stage, which scores him
  // a swing of -1.01 and inverts the comparison. Both stages are driven in the
  // same fixed dry conditions so wet skill cannot leak in, and mistakes and
  // retirements are dropped because they are a driver's luck, not their pace.
  // Measured over eight seeds: kirvala -0.00865, bellucco +0.00764.
  const gravelStage = stageById("kloft-bjornhalt");
  const tarmacStage = stageById("alvenda-calderas");
  assert.equal(gravelStage.surface, SURFACE.GRAVEL, "the gravel half of the swing must be gravel");
  assert.equal(tarmacStage.surface, SURFACE.TARMAC, "the tarmac half of the swing must be tarmac");
  const dry = Object.assign({ night: false, preset: "midday-hard", key: "midday-hard", tempC: 18 }, CONDITIONS.clear);
  const swing = (id) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 8; i += 1) {
      const seed = `swing-${i}`;
      const a = rivalStageTime(id, { seed, eventId: "vasterkloft", stage: gravelStage, tier, conditions: dry });
      const b = rivalStageTime(id, { seed, eventId: "alvenda", stage: tarmacStage, tier, conditions: dry });
      if (a.status !== "ok" || b.status !== "ok" || a.note || b.note) continue;
      sum += a.timeMs / estimateStageTime(gravelStage, { pace: tier.pace, conditions: dry })
        - b.timeMs / estimateStageTime(tarmacStage, { pace: tier.pace, conditions: dry });
      n += 1;
    }
    assert.ok(n >= 5, `${id} had only ${n} clean pairs to average`);
    return sum / n;
  };
  assert.ok(swing("kirvala") < swing("bellucco") - 0.005,
    `the gravel specialist should gain on gravel: kirvala ${swing("kirvala").toFixed(5)}`
    + ` vs bellucco ${swing("bellucco").toFixed(5)}`);
});

test("career: penalties are added to the stage time", () => {
  const career = createCareer(fakeStorage());
  career.newSeason({ seed: "pen", tierId: "national", rounds: 4 });
  const ctx = career.currentStage();
  const res = career.submitStage({
    timeMs: 600000,
    penalties: ["falseStart", { kind: "cutCorner", count: 2 }, { kind: "missedControl" }],
  });
  const me = res.entries.find((e) => e.isPlayer);
  const expected = PENALTIES.falseStart.ms + PENALTIES.cutCorner.ms * 2 + PENALTIES.missedControl.ms;
  assert.equal(me.penaltyMs, expected);
  assert.equal(me.totalMs, 600000 + expected);
  assert.ok(ctx.stage, "a stage was in play");
});

test("career: a retirement costs the leg but not the event", () => {
  const career = createCareer(fakeStorage());
  career.newSeason({ seed: "sr", tierId: "national", rounds: 4 });
  const first = career.currentStage();
  const legStages = first.leg.stages.length;

  const out = career.submitStage({ timeMs: 0, retired: true, reason: "into a ditch" });
  const meStage = out.entries.find((e) => e.isPlayer);
  assert.equal(meStage.status, "retired");
  const meOverall = out.overall.find((e) => e.driverId === "player");
  assert.ok(meOverall.penaltyMs >= 300000, "a retirement carries the super-rally penalty");

  // Still in the rally for the remaining stages of the leg, then back out on it.
  for (let i = 1; i < legStages; i += 1) career.submitStage({ timeMs: 700000 });
  const next = career.currentStage();
  assert.equal(next.legIndex, 1, "the next leg starts after service");
  const back = career.submitStage({ timeMs: 690000 });
  assert.equal(back.entries.find((e) => e.isPlayer).status, "ok", "the player rejoins under super rally");
});

test("career: retiring is never faster than driving the stage", () => {
  // The super-rally penalty must be charged ON TOP of a notional stage time.
  // Charged alone it is less than a long stage takes, so a retirement would
  // improve your classification and the rally would go to whoever crashed.
  const drive = createCareer(fakeStorage());
  drive.newSeason({ seed: "sr-cost", tierId: "national", rounds: 4 });
  const ctx = drive.currentStage();
  const honest = Math.round(ctx.referenceMs * 1.02);
  const driven = drive.submitStage({ timeMs: honest });
  const drivenTotal = driven.overall.find((e) => e.driverId === "player").totalMs;

  const quit = createCareer(fakeStorage());
  quit.newSeason({ seed: "sr-cost", tierId: "national", rounds: 4 });
  const quitRes = quit.submitStage({ timeMs: 0, retired: true });
  const quitTotal = quitRes.overall.find((e) => e.driverId === "player").totalMs;

  assert.ok(quitTotal > drivenTotal + 250000,
    `retiring cost ${quitTotal} but driving cost ${drivenTotal}`);
  assert.ok(quitRes.overall.find((e) => e.driverId === "player").position
    > driven.overall.find((e) => e.driverId === "player").position,
    "retiring must not improve your position");
});

test("career: service repairs against a time budget and overruns cost time", () => {
  const career = createCareer(fakeStorage());
  career.newSeason({ seed: "svc", tierId: "national", rounds: 4 });
  const first = career.currentStage();
  const stagesInLeg = first.leg.stages.length;
  for (let i = 0; i < stagesInLeg - 1; i += 1) career.submitStage({ timeMs: 700000 });
  const last = career.submitStage({
    timeMs: 700000,
    damage: { engine: 0.2, suspension: 0.1, bodywork: 0.5 },
  });
  assert.ok(last.service, "service is offered between legs");
  assert.ok(last.service.neededMinutes > last.service.budgetMinutes * 0.2);

  const before = last.service.items.find((i) => i.id === "engine");
  assert.ok(before.critical, "a 20% engine is critical");

  const applied = career.applyService(["engine", "suspension", "bodywork"]);
  assert.ok(applied.spentMinutes > 0);
  assert.ok(applied.condition.engine > 0.99, "a full repair restores the component");
  const carriedSoFar = career.state.season.penaltyCarryMs;

  const nothingLeft = career.applyService([{ id: "engine", minutes: 5 }]);
  assert.equal(nothingLeft.spentMinutes, 0, "nothing left to repair costs nothing");
  assert.equal(nothingLeft.penaltyMs, 0);

  // Force an overrun and check it lands on the next stage.
  const s = career.state.season;
  s.condition.engine = 0;
  s.condition.gearbox = 0;
  s.condition.suspension = 0;
  s.condition.steering = 0;
  s.condition.cooling = 0;
  s.condition.electrics = 0;
  s.condition.bodywork = 0;
  const big = career.applyService(["engine", "gearbox", "suspension", "steering", "cooling", "electrics", "bodywork"]);
  assert.ok(big.overrunMinutes > 0, `expected an overrun, spent ${big.spentMinutes} of ${big.budgetMinutes}`);
  assert.ok(big.penaltyMs >= Math.floor(big.overrunMinutes) * PENALTIES.serviceOverrun.ms);
  assert.ok(big.penaltyMs <= Math.ceil(big.overrunMinutes + 0.1) * PENALTIES.serviceOverrun.ms);
  // Overruns accumulate across the halt and land on the next stage's clock.
  const nextStage = career.currentStage();
  assert.equal(nextStage.carryPenaltyMs, carriedSoFar + big.penaltyMs);
  const after = career.submitStage({ timeMs: 700000 });
  assert.equal(after.entries.find((e) => e.isPlayer).penaltyMs, carriedSoFar + big.penaltyMs);
  assert.equal(career.state.season.penaltyCarryMs, 0, "the carry is spent, not sticky");
});

test("career: a full season's standings arithmetic adds up", () => {
  const storage = fakeStorage();
  const career = createCareer(storage);
  career.setDriver("Ash Vellory", "Opus Rally Team");
  career.newSeason({ seed: "season-arith", tierId: "continental", rounds: RALLIES.length });
  const season = career.state.season;
  assert.equal(season.calendar.length, RALLIES.length);

  const tier = tierById("continental");
  const driverIds = new Set(career.drivers().map((d) => d.id));
  let stagesDriven = 0;
  let final = null;

  // Drive the whole season at a pace that should win it: a shade under the
  // reference time for the field.
  while (career.currentStage()) {
    const ctx = career.currentStage();
    const target = estimateStageTime(ctx.stage, { pace: tier.pace, conditions: ctx.conditions });
    const res = career.submitStage({ timeMs: Math.round(target * 0.995) });
    assert.ok(res, "every stage returns a result");
    assert.equal(res.entries.length, driverIds.size);
    for (const e of res.entries) assert.ok(driverIds.has(e.driverId));
    stagesDriven += 1;
    if (res.service) career.applyService(res.service.items.filter((i) => i.health < 1).map((i) => i.id));
    if (res.seasonFinished) final = res.summary;
    assert.ok(stagesDriven < 200, "the season must terminate");
  }

  let expectedStages = 0;
  for (const id of season.calendar) {
    for (const lg of rallyById(id).legs) expectedStages += lg.stages.length;
  }
  assert.equal(stagesDriven, expectedStages);
  assert.ok(final && final.season, "the season closed out");

  // Every event awarded exactly the points table plus the power-stage bonus.
  const pointsTotal = POINTS.reduce((a, b) => a + b, 0);
  const powerTotal = POWER_STAGE_POINTS.reduce((a, b) => a + b, 0);
  const perDriver = new Map();
  for (const evState of season.events) {
    assert.equal(evState.done, true, `${evState.id} should be closed`);
    let sum = 0;
    for (const id of Object.keys(evState.awards)) {
      sum += evState.awards[id];
      perDriver.set(id, (perDriver.get(id) || 0) + evState.awards[id]);
    }
    const classified = evState.classification.filter((c) => c.status === "ok").length;
    const expected = POINTS.slice(0, Math.min(POINTS.length, classified)).reduce((a, b) => a + b, 0)
      + POWER_STAGE_POINTS.slice(0, Math.min(POWER_STAGE_POINTS.length, classified)).reduce((a, b) => a + b, 0);
    assert.equal(sum, expected, `${evState.id} awarded ${sum}, expected ${expected}`);
    assert.ok(sum <= pointsTotal + powerTotal);
    // Positions are a clean 1..n with no gaps or repeats.
    const positions = evState.classification.map((c) => c.position).sort((a, b) => a - b);
    assert.deepEqual(positions, positions.map((_, i) => i + 1));
  }

  const table = career.standings();
  assert.equal(table.length, driverIds.size);
  for (const row of table) {
    assert.equal(row.points, perDriver.get(row.driverId) || 0,
      `${row.driverId} standings points disagree with the event awards`);
  }
  for (let i = 1; i < table.length; i += 1) {
    assert.ok(table[i - 1].points >= table[i].points, "standings must be sorted");
    assert.equal(table[i].position, i + 1);
  }
  const totalPoints = table.reduce((a, r) => a + r.points, 0);
  const awarded = season.events.reduce((a, e) => a + Object.values(e.awards).reduce((x, y) => x + y, 0), 0);
  assert.equal(totalPoints, awarded, "no points invented or lost between events and the table");

  const me = table.find((r) => r.isPlayer);
  assert.ok(me.points > 0, "the player scored");
  assert.equal(me.starts, RALLIES.length);
  assert.equal(final.season.position, me.position);
  assert.equal(career.state.profile.seasonsCompleted, 1);
  assert.ok(career.state.profile.credits > 30000, "a season pays");

  // Promotion is earned, not given.
  if (me.position <= tier.promotePosition) {
    assert.ok(career.state.profile.tiersUnlocked.includes("masters"));
  }

  // And all of it survives a reload from the same storage.
  const reloaded = createCareer(storage);
  assert.equal(reloaded.state.profile.seasonsCompleted, 1);
  assert.equal(reloaded.state.profile.credits, career.state.profile.credits);
  assert.deepEqual(reloaded.standings().map((r) => r.points), table.map((r) => r.points));
});

test("career: progression is earned — upgrades and cars cost credits", () => {
  const career = createCareer(fakeStorage());
  const start = career.state.profile.credits;
  const paceBefore = career.carSetup().pace;

  const cost = career.upgradeCost("engine");
  assert.ok(cost > 0);
  const bought = career.buyUpgrade("engine");
  assert.equal(bought.ok, true);
  assert.equal(career.state.profile.credits, start - cost);
  assert.ok(career.carSetup().pace > paceBefore, "an upgrade is worth pace");

  career.state.profile.credits = 0;
  assert.equal(career.buyUpgrade("engine").ok, false);
  assert.equal(career.buyCar("vortex1").reason, "tier locked");

  career.state.profile.credits = 10 ** 7;
  assert.equal(career.buyCar("vortex1").reason, "tier locked", "credits do not buy a locked tier");
  const affordable = CARS.find((c) => c.tier === 0 && c.price > 0);
  assert.equal(career.buyCar(affordable.id).ok, true);
  assert.equal(career.buyCar(affordable.id).reason, "owned");
  assert.equal(career.selectCar(affordable.id), true);
  assert.equal(career.selectCar("kobolt"), false, "you cannot drive what you do not own");

  // Every upgrade tops out, and the level is capped there.
  for (let i = 0; i < 20; i += 1) career.buyUpgrade("aero");
  assert.equal(career.upgradeCost("aero"), null);
  assert.equal(career.state.profile.upgrades.aero, 3);
});

test("career: the calendar and the field are well-formed", () => {
  assert.ok(RALLIES.length >= 4, "newSeason clamps rounds to [4, RALLIES.length], so four is the floor");
  const seen = new Set();
  for (const ev of RALLIES) {
    assert.ok(ev.legs.length >= 2 && ev.legs.length <= 3, `${ev.id} legs`);
    let n = 0;
    for (const lg of ev.legs) {
      assert.ok(lg.serviceMinutes > 0);
      for (const stage of lg.stages) {
        assert.ok(!seen.has(stage.id), `duplicate stage id ${stage.id}`);
        seen.add(stage.id);
        assert.ok(stage.km > 3 && stage.km < 40, `${stage.id} length`);
        assert.ok(stage.flow > 0.5 && stage.flow < 1.5);
        n += 1;
      }
    }
    assert.ok(n >= 4 && n <= 8, `${ev.id} has ${n} stages`);
    const power = ev.legs.flatMap((l) => l.stages).filter((s) => s.powerStage);
    assert.equal(power.length, 1, `${ev.id} needs exactly one power stage`);
  }
  for (const tier of TIERS) {
    const field = selectField("wellformed", tier.id);
    assert.equal(new Set(field).size, field.length, `${tier.id} field has duplicates`);
    assert.equal(field.length, Math.min(tier.fieldSize, RIVALS.length));
  }
});

test("career: difficulty shifts the whole field's pace", () => {
  const career = createCareer(fakeStorage());
  career.newSeason({ seed: "diff", tierId: "national", rounds: 6 });
  const level = career.currentStage();
  assert.ok(level.winnerTargetMs > 0);
  assert.ok(level.winnerTargetMs > level.referenceMs,
    "nobody beats the theoretical reference time");
  assert.ok(level.expectedWinner, "the stage screen names the car to beat");

  assert.equal(career.setDifficulty(0.04), 0.04);
  const easy = career.currentStage();
  assert.ok(easy.winnerTargetMs > level.winnerTargetMs, "a positive bias slows the field");

  assert.equal(career.setDifficulty(-0.03), -0.03);
  const hard = career.currentStage();
  assert.ok(hard.winnerTargetMs < level.winnerTargetMs, "a negative bias speeds it up");

  assert.equal(career.setDifficulty(99), 0.05, "the bias is clamped");
  assert.equal(career.setDifficulty("nonsense"), 0);

  // The bias is a stage-time input, so it must reach the results too.
  career.setDifficulty(0.05);
  const slowField = career.submitStage({ timeMs: level.referenceMs }).entries.filter((e) => !e.isPlayer && e.status === "ok");
  assert.ok(slowField.length > 3);
  assert.ok(Math.min(...slowField.map((e) => e.timeMs)) > level.winnerTargetMs);
});

test("career: the stage leaderboard previews the field before it is driven", () => {
  const career = createCareer(fakeStorage());
  career.newSeason({ seed: "board", tierId: "masters", rounds: 6 });
  const ctx = career.currentStage();
  const preview = career.leaderboard(ctx.stage.id, { includePlayerTarget: true });
  assert.ok(preview.length > 5);
  assert.equal(preview[0].position, 1);
  for (let i = 1; i < preview.length; i += 1) {
    if (preview[i].status === "ok" && preview[i - 1].status === "ok") {
      assert.ok(preview[i].totalMs >= preview[i - 1].totalMs);
      assert.ok(preview[i].gapLeaderMs >= 0);
    }
  }
  career.submitStage({ timeMs: 1 });
  const real = career.leaderboard(ctx.stage.id);
  assert.equal(real[0].driverId, "player", "a one-millisecond stage wins it");
  assert.equal(real[0].gapLeaderMs, 0);
});


test("career: every stage on the calendar is a road stage.js can actually build", () => {
  // The bridge test. career.js used to schedule kal-hovden and van-costiera and
  // thirty more names stage.js has never heard of, so a season could be created
  // and never started. `stage.book` is what closes that, and this is what stops
  // it opening again — the oracle is stage.js's own generator, not career's
  // arithmetic about it.
  const onCalendar = new Set();
  let stages = 0;
  for (const ev of RALLIES) {
    for (const lg of ev.legs) {
      for (const stage of lg.stages) {
        assert.ok(stage.book, `${stage.id} names no book road`);
        const entry = stageBookEntry(stage.book);
        assert.ok(entry, `${stage.id} points at ${stage.book}, which is not in STAGE_BOOK`);
        onCalendar.add(stage.book);
        stages += 1;
      }
    }
  }
  assert.equal(onCalendar.size, STAGE_BOOK.length,
    "every road in the book should be on the calendar and nothing else");
  assert.equal(stages, STAGE_BOOK.length * 2, "each road is run twice");

  // Generating all twenty-four costs about seven seconds, so three roads carry
  // the proof that `book` really is a stageFromBook() id and that the km the
  // championship prices its stage times with is the road the player drives.
  //
  // On these three the generator overshoots by 168 to 272 m, and by 1.87% to
  // 3.68% — and each range has a different road at its floor, which is the trap
  // this comment has now fallen into twice. The smallest overshoot in METRES is
  // havnvik's 168 over its own 6600 m, and that is 2.55%; the smallest FRACTION
  // is bjornhalt's 226 over 12100 m. (An earlier "1.4%" here was havnvik's
  // metres over bjornhalt's length, which is neither road.) Across the whole
  // book it runs from 118 m SHORT on northmarch-kestrel to 382 m long on
  // vardhal-stormgate, i.e. -1.26% to +3.86%, which is why the bound is a
  // fraction rather than a metre count and why it is taken on the absolute
  // value. The 5% is headroom rather than a measurement: 4% would pass on
  // today's book, but by 0.14 of a point, which is not enough to call margin.
  const sampled = ["kloft-bjornhalt", "vardhal-havnvik", "alvenda-ondas"];
  for (const bookId of sampled) {
    const stage = RALLIES.flatMap((ev) => ev.legs.flatMap((l) => l.stages)).find((s) => s.book === bookId);
    assert.ok(stage, `${bookId} is not on the calendar`);
    const road = stageFromBook(stage.book);
    assert.equal(road.id, stage.book);
    const declared = stage.km * 1000;
    assert.ok(Math.abs(road.length - declared) / declared < 0.05,
      `${stage.id}: the calendar prices ${declared} m, the generator built ${road.length.toFixed(0)} m`);
  }
});

test("career: every condition a season can draw is a preset the renderer has", () => {
  // The other half of the same bridge, and the one that has broken before: the
  // stage book named its weather in prose while weather.js keys presets by id,
  // and eleven of twelve stages could not start. presetById throws on an unknown
  // id, so this test is that throw.
  const drawn = new Set();
  for (const ev of RALLIES) {
    for (const lg of ev.legs) {
      for (const stage of lg.stages) {
        for (let i = 0; i < 8; i += 1) {
          const cond = conditionsFor(`wx-${i}`, ev.id, stage.id);
          const preset = presetById(cond.preset);
          assert.equal(preset.id, cond.preset, `${stage.id} drew ${cond.preset}`);
          assert.equal(cond.key, cond.preset, `${stage.id}: the record key must be the preset`);
          drawn.add(cond.preset);
          // A night stage may only draw weather the renderer can light at night.
          if (stage.night) {
            assert.match(cond.preset, /^night-/, `${stage.id} is a night stage but drew ${cond.preset}`);
          } else {
            assert.doesNotMatch(cond.preset, /^night-/, `${stage.id} is a day stage but drew ${cond.preset}`);
          }
        }
      }
    }
  }
  // Not a token draw: eleven of weather.js's twelve presets appear across the
  // calendar. Only "blizzard" does not, because no road in the book is authored
  // for one.
  assert.ok(drawn.size >= 10, `a whole season drew only ${drawn.size} distinct skies`);
});

test("career: a championship can be entered, driven in order, and finished", () => {
  const storage = fakeStorage();
  const career = createCareer(storage);
  assert.equal(career.championship(), null, "there is no championship until one is started");

  career.newSeason({ seed: "playthrough", tierId: "clubman" });
  const opening = career.championship();
  assert.equal(opening.rounds, RALLIES.length);
  assert.equal(opening.round, 1);
  assert.equal(opening.events.filter((e) => e.status === "next").length, 1);
  assert.equal(opening.events.filter((e) => e.status === "locked").length, RALLIES.length - 1);

  // The order the player is actually sent round, read off the calendar rather
  // than off the thing under test.
  const expected = [];
  for (const id of career.state.season.calendar) {
    for (const lg of rallyById(id).legs) for (const s of lg.stages) expected.push(s.id);
  }

  const driven = [];
  let services = 0;
  let finalSummary = null;
  let guard = 0;
  for (let ctx = career.currentStage(); ctx; ctx = career.currentStage()) {
    assert.ok(guard += 1, "loop guard");
    assert.ok(guard < 200, "the championship must terminate");
    // Every stage the player is offered is a road that exists.
    assert.ok(stageBookEntry(ctx.stage.book), `${ctx.stage.id} offered an unbuildable road`);
    assert.equal(career.championship().round, ctx.round);
    driven.push(ctx.stage.id);
    const res = career.submitStage({ timeMs: Math.round(ctx.referenceMs * 0.97) });
    assert.ok(res.entries.length > 1);
    if (res.service) {
      services += 1;
      assert.ok(res.service.budgetMinutes > 0);
      career.applyService(res.service.items.filter((i) => i.health < 1).map((i) => i.id));
    }
    if (res.seasonFinished) finalSummary = res.summary;
  }

  assert.deepEqual(driven, expected, "the season was not driven in calendar order");
  // A service between every pair of legs, and none after the last one.
  const legs = career.state.season.calendar.reduce((n, id) => n + rallyById(id).legs.length, 0);
  assert.equal(services, legs - career.state.season.calendar.length);

  const closed = career.championship();
  assert.equal(closed.finished, true);
  assert.equal(closed.events.filter((e) => e.status === "done").length, RALLIES.length);
  for (const e of closed.events) assert.ok(e.position >= 1, e.id + " has no result");
  assert.ok(finalSummary && finalSummary.season, "the season closed out");

  // A result carried between events: the player's points are the sum of what
  // each round awarded, and they came from more than one round.
  const me = closed.standings.find((r) => r.isPlayer);
  const awarded = career.state.season.events.map((e) => e.awards.player || 0);
  assert.equal(me.points, awarded.reduce((a, b) => a + b, 0));
  assert.ok(awarded.filter((p) => p > 0).length > 1, "only one round scored");

  // And it is still there after a reload, which is what makes it a championship
  // rather than a session.
  const reloaded = createCareer(storage);
  assert.equal(reloaded.championship().finished, true);
  assert.equal(reloaded.championship().standings.find((r) => r.isPlayer).points, me.points);
});

// The calendar ladder, measured rather than eyeballed.
//
// career.championship() hands ui.js FRACTIONS of a plate, so which pair of
// labels is closest is settled by the plate's pixel height and by how tall a
// label wraps — never by the shuffle, which only moves names between pins. The
// note that shipped with this ladder measured season-1 at one viewport, found
// 16 px of vertical clearance and stopped. season-2 is 6.9 px on the same
// viewport; over every shuffle of the book, 390 px got the closest pair
// overlapping 3.2 px vertically, and a 320 px window overlapped outright.
//
// So this walks real labels in a real browser, in the real font, over every
// distinct calendar the seeds below draw, at six plate shapes and at every point
// in a season (a pin that is a button used to draw larger than a locked one).
// Pinning it to one seed is exactly how the bug shipped, so the sweep asserts it
// saw more than one calendar.
//
// It asks four separate questions of every layout, because the first fix for
// the overlap passed three of them while making the fourth worse: no two label
// BOXES touch, no label hangs off the plate, no pin is taller than the box the
// plate reserves for it, and — the one the overlap fix broke — NOTHING IS
// CLIPPED. Bounding a label box with -webkit-line-clamp buys clearance by
// hiding text, so a clearance-only test rewards exactly the wrong repair.
test("championship: no two calendar labels touch, whatever the season drew", async () => {
  const { openHarness } = await import("./drive.mjs");
  // ui.js is deliberately NOT imported for its constants. CALENDAR_PIN is what
  // plateMinHeight sizes the plate from, so a bar read out of it moves with the
  // thing it is meant to judge; every number this test compares against is
  // written out below.
  const root = resolve(import.meta.dirname, "../..");

  // Every seed the game itself draws, plus enough others that the sweep reaches
  // every shuffle of the book — all 120 of them for a five-rally season — keyed
  // by the calendar so a repeated draw costs nothing.
  const calendars = new Map();
  for (let i = 1; i <= 800; i += 1) {
    const seed = i <= 8 ? `season-${i}` : `sweep-${i}`;
    const c = createCareer(null);
    c.newSeason({ seed, tierId: "clubman" });
    const key = c.state.season.calendar.join(",");
    if (!calendars.has(key)) calendars.set(key, seed);
  }
  assert.ok(calendars.size >= 100,
    `${calendars.size} distinct calendars over 800 seeds: this sweep would prove little`);

  // Every point in a season, not two of them: a driven round becomes a
  // <button>, and the round that is NEXT walks down the ladder as the season is
  // played. Which pin carries the "Next" badge decides whether that badge is on
  // the wide side of the plate or the narrow one, so a sweep that fixes the
  // cursor at nought and three cannot see a badge that is only cut at round two.
  const models = [];
  for (const [key, seed] of calendars) {
    for (const done of [0, 1, 2, 3, 4]) {
      const c = createCareer(null);
      c.newSeason({ seed, tierId: "clubman" });
      const s = c.state.season;
      for (let i = 0; i < done; i += 1) {
        s.events[i].done = true;
        s.events[i].classification = [{ driverId: "player", position: 1 + i }];
      }
      s.cursor = { event: done, leg: 0, stage: 0 };
      models.push({ seed, key, done, championship: c.championship() });
    }
  }

  const page = await openHarness({ root, width: 390, height: 844, quiet: true });
  try {
    // A licence file, because this is a layout question and not a boot question:
    // it gives the shell a same-origin document to be built in without starting
    // a game, a WebGL context or a stage behind the measurement.
    await page.navigate("/opus-rally/THREE-LICENSE.txt");
    await page.waitFor("the page to load", () => page.evaluate(
      "document.readyState === 'complete' || null"), 60_000);

    // index.html gives the shell a full-viewport fixed root over a zero-margin
    // page; that is the whole of the host it needs, so the host is stated here
    // rather than scraped, and ui.js is asked for its stylesheet by name.
    //
    // The viewport meta is not decoration. Without one, a page under Chrome's
    // mobile emulation lays out at the 980 px fallback and scales the result
    // down, so a 320 px phone drew a 528 px plate, missed the max-width:520px
    // rules entirely and reported clearances that belong to no real device.
    const ready = await page.evaluate(`(async () => {
      document.head.innerHTML = "<meta charset=utf-8>"
        + "<meta name=viewport content='width=device-width, initial-scale=1'>";
      document.body.innerHTML = "";
      document.documentElement.setAttribute("style", "margin:0;padding:0;height:100%");
      document.body.setAttribute("style", "margin:0;padding:0;height:100%;overflow:hidden");
      const host = document.createElement("div");
      host.setAttribute("style", "position:fixed;inset:0");
      document.body.appendChild(host);
      const UI = await import("/opus-rally/ui.js");
      const sheet = document.createElement("style");
      sheet.textContent = UI.styleText();
      document.head.appendChild(sheet);
      window.__ui = UI.createUi(host, {});
      window.__pins = (championship) => {
        window.__ui.show("championship", { championship });
        const map = document.querySelector(".or-map");
        const plate = map.getBoundingClientRect();
        const pins = [...map.querySelectorAll(".or-node")].map((n) => {
          const r = n.getBoundingClientRect();
          // A -webkit-line-clamp'd box keeps its FULL content height in
          // scrollHeight and its clamped height in clientHeight, so the
          // difference is exactly the text the reader was never shown. Both
          // halves are read: the title clamp and the detail clamp fail
          // independently, and it is the detail line that carries the badge.
          //
          // Width as well as height. The clamp is what clips today, so height is
          // where the live regression showed; but a single unbreakable token wider
          // than the cap would be cut horizontally with scrollHeight unmoved, and
          // this assertion's own comment promises no letter is hidden. Reading one
          // axis and claiming both is how the last three of these went wrong.
          const clip = (e) => ({
            text: e.textContent,
            lost: Math.max(e.scrollHeight - e.clientHeight, e.scrollWidth - e.clientWidth),
          });
          return {
            label: n.querySelector("span").textContent,
            x: r.left, y: r.top, right: r.right, bottom: r.bottom, height: r.height,
            parts: [clip(n.querySelector("span")), clip(n.querySelector("small"))],
          };
        });
        return { plate: { x: plate.left, y: plate.top, right: plate.right, bottom: plate.bottom }, pins };
      };
      return "ok";
    })()`);
    assert.equal(ready, "ok", ready);

    // 320 px is the narrowest phone this game supports, 521 px is one pixel
    // clear of the max-width:520px block, and 900 px is where the desktop
    // columns arrive. 360 px is here because it is the commonest small-Android
    // width and because it was the second viewport the clamps truncated at.
    const VIEWPORTS = [[320, 844], [360, 844], [390, 844], [521, 844], [900, 800], [1280, 800]];

    let tightest = { gap: Infinity };
    let closest = { apart: Infinity };
    let worstSpill = { over: -Infinity };
    let worstClip = { lost: -Infinity };
    let tallest = { height: -Infinity };
    let measured = 0;
    for (const [width, height] of VIEWPORTS) {
      await page.setViewport(width, height);
      for (const model of models) {
        const { plate, pins } = await page.evaluate(
          `window.__pins(${JSON.stringify(model.championship)})`);
        assert.equal(pins.length, model.championship.events.length,
          `${width}px ${model.seed}: the plate drew ${pins.length} pins for `
          + `${model.championship.events.length} rounds`);
        measured += 1;
        for (let a = 0; a < pins.length; a += 1) {
          // Bounding the label box and READING the label are different jobs,
          // and the clamps that do the first can quietly stop the second: the
          // detail line ends in the badge, so "Northmarch · Gravel · Next"
          // loses the one word telling the player which round is theirs. The
          // clearance and spill checks below cannot see this at all — a
          // truncated pin is a SMALLER box, so it clears its neighbours better.
          for (const part of pins[a].parts) {
            if (part.lost > worstClip.lost) {
              worstClip = { ...part, width, ...model, label: pins[a].label };
            }
          }
          // What a pin actually costs in height, against the budget the plate
          // reserves for it. Nothing sizes the pin from CALENDAR_PIN.box, so
          // this is the one measurement that can tell whether the clamps still
          // buy what the box claims.
          if (pins[a].height > tallest.height) {
            tallest = { height: pins[a].height, width, ...model, label: pins[a].label };
          }
          // A label that hangs off the plate is the same bug seen from the
          // other side: the plate was too short for the ladder standing on it.
          const over = Math.max(plate.x - pins[a].x, pins[a].right - plate.right,
            plate.y - pins[a].y, pins[a].bottom - plate.bottom);
          if (over > worstSpill.over) worstSpill = { over, width, ...model, label: pins[a].label };
          for (let b = a + 1; b < pins.length; b += 1) {
            // Two boxes are apart if they are apart on EITHER axis, so the gap
            // that matters is the larger of the two.
            const gap = Math.max(
              Math.max(pins[a].y, pins[b].y) - Math.min(pins[a].bottom, pins[b].bottom),
              Math.max(pins[a].x, pins[b].x) - Math.min(pins[a].right, pins[b].right));
            if (gap < tightest.gap) {
              tightest = { gap, width, ...model, pair: [pins[a].label, pins[b].label] };
            }
            // How far apart the plate put the two pins' ANCHORS, which is the
            // only thing plateMinHeight actually controls: it multiplies the
            // plate's height by the closest pair of y fractions and reserves a
            // label box plus a clearance there. Measuring the drawn label boxes
            // cannot check that — five short rally names clear each other on a
            // plate reserving nothing, and the whole ladder is then one longer
            // name away from touching.
            const apart = Math.abs((pins[a].y + pins[a].bottom) / 2
              - (pins[b].y + pins[b].bottom) / 2);
            if (apart < closest.apart) {
              closest = { apart, width, ...model, pair: [pins[a].label, pins[b].label] };
            }
          }
        }
      }
    }

    assert.equal(measured, models.length * VIEWPORTS.length,
      `${measured} layouts were measured, not the ${models.length * VIEWPORTS.length} asked for`);

    // Not one letter of a pin may be hidden. This is asserted BEFORE the
    // clearance bar because truncation is how a layout passes a clearance bar
    // it should have failed: over exactly this sweep, the first version of the
    // clamps that bounded the label box hid text on 768 of the 3000 pins at
    // 320 px and cut the "Next" badge off 96 of the 600 next-round pins, taking
    // 32 px off "Vardhal · Tarmac / Gravel · Locked" at worst — while the
    // clearance and spill numbers stayed green throughout.
    assert.ok(worstClip.lost <= 0,
      `at ${worstClip.width}px, seed ${worstClip.seed} (${worstClip.done} rounds driven) hides `
      + `${worstClip.lost.toFixed(0)} px of "${worstClip.text}" on the "${worstClip.label}" pin `
      + `— calendar ${worstClip.key}`);

    // 10 px and 88 px are written out rather than read from CALENDAR_PIN,
    // because plateMinHeight sizes the plate from BOTH of them: a test that
    // divides by the same constants the layout multiplied by can only agree
    // with itself, and this one did — `>= CALENDAR_PIN.clear` passes for every
    // value of clear, including zero.
    // 10 px is a gap a reader can see between two labels; 88 px is what two
    // lines of title over two of detail, plus padding and border, come to.
    const CLEAR = 10;
    const BOX = 88;

    // The reservation itself, and the assertion that actually holds
    // plateMinHeight honest. Measuring only the drawn label boxes cannot: the
    // five rally names in the book are short enough that they still clear each
    // other by 11.63 px on a plate reserving nothing at all. Anchors 98 px
    // apart is the promise — a full label box for each pin plus the gap between
    // them — and it holds whatever the pins are called. Half a pixel of slack
    // because the plate height is rounded up to a whole pixel and the pin tops
    // are percentages written to two decimals.
    assert.ok(closest.apart >= BOX + CLEAR - 0.5,
      `at ${closest.width}px, seed ${closest.seed} (${closest.done} rounds driven) anchors `
      + `"${closest.pair?.[0]}" and "${closest.pair?.[1]}" ${closest.apart.toFixed(2)} px apart, `
      + `under the ${BOX + CLEAR} px the plate is meant to reserve — a ${BOX} px label box `
      + `for each and ${CLEAR} px between them — calendar ${closest.key}`);

    assert.ok(tightest.gap >= CLEAR,
      `at ${tightest.width}px, seed ${tightest.seed} (${tightest.done} rounds driven) puts `
      + `"${tightest.pair?.[0]}" and "${tightest.pair?.[1]}" ${tightest.gap.toFixed(2)} px apart, `
      + `under the ${CLEAR} px two labels need — calendar ${tightest.key}`);
    assert.ok(tallest.height <= BOX,
      `at ${tallest.width}px, seed ${tallest.seed} draws "${tallest.label}" `
      + `${tallest.height.toFixed(2)} px tall, over the ${BOX} px label box the clamps are `
      + "meant to buy — the plate reserves that box and no more");
    assert.ok(worstSpill.over <= 0.5,
      `at ${worstSpill.width}px, seed ${worstSpill.seed} hangs "${worstSpill.label}" `
      + `${worstSpill.over.toFixed(2)} px outside the plate`);
  } finally {
    page.close();
  }
});
