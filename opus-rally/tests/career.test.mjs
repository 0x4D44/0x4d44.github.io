import test from "node:test";
import assert from "node:assert/strict";

import {
  createRecorder, createPlayback, createGhost, inputAt, keyframeAt,
  encodeRun, decodeRun, runByteSize, makeReplayInput, makeReplayState,
} from "../replay.js";

import {
  createCareer, rivalStageTime, estimateStageTime, conditionsFor, selectField,
  stageById, rallyById, tierById, RALLIES, TIERS, RIVALS, CARS, POINTS,
  POWER_STAGE_POINTS, PENALTIES, SCHEMA_VERSION, STORAGE_KEY,
} from "../career.js";

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
    meta: { stageId: "kal-hovden", carId: "lanzaevo", label: "test" },
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
    unlocked: ["corsa16", "auroras", "not-a-car"],
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

  const first = career.recordStage({ stageId: "kal-hovden", carId: "lanzaevo", weatherKey: "clear", timeMs: 700000, splits: [220000, 460000], run: encoded });
  assert.equal(first.isPb, true);
  assert.equal(first.previousMs, null);
  assert.deepEqual(first.splitPbs.map((s) => s.index), [0, 1]);

  const slower = career.recordStage({ stageId: "kal-hovden", carId: "lanzaevo", weatherKey: "clear", timeMs: 715000, splits: [218000, 470000] });
  assert.equal(slower.isPb, false);
  assert.equal(career.bestFor("kal-hovden", "lanzaevo", "clear").timeMs, 700000);
  // A better split inside a worse run is still a split record.
  assert.deepEqual(slower.splitPbs.map((s) => s.index), [0]);
  assert.equal(career.bestFor("kal-hovden", "lanzaevo", "clear").bestSplits[0], 218000);

  const faster = career.recordStage({ stageId: "kal-hovden", carId: "lanzaevo", weatherKey: "clear", timeMs: 688500, splits: [217000, 455000] });
  assert.equal(faster.isPb, true);
  assert.equal(faster.improvedMs, 11500);
  assert.equal(career.bestFor("kal-hovden", "lanzaevo", "clear").runs, 3);

  // Different weather and different car are different records.
  assert.equal(career.bestFor("kal-hovden", "lanzaevo", "rain"), null);
  assert.equal(career.bestFor("kal-hovden", "kobolt", "clear"), null);

  const ghost = career.ghostFor("kal-hovden", { carId: "lanzaevo", weatherKey: "clear" });
  assert.ok(ghost, "the personal best carries a ghost");
  assert.equal(ghost.run.tickCount, run.tickCount);
  assert.equal(createGhost(ghost.run).valid, true);
});

test("career: rival times are deterministic in the season seed", () => {
  const stage = stageById("ocr-serra");
  const tier = tierById("continental");
  const cond = conditionsFor("alpha", "terraocra", "ocr-serra");
  const ctx = { seed: "alpha", eventId: "terraocra", stage, tier, conditions: cond };

  for (const r of RIVALS.slice(0, 8)) {
    const a = rivalStageTime(r.id, ctx);
    const b = rivalStageTime(r.id, ctx);
    assert.deepEqual(a, b, `${r.id} must be reproducible`);
  }

  // A different seed moves the field; the same seed never does.
  const other = { seed: "beta", eventId: "terraocra", stage, tier, conditions: cond };
  let differences = 0;
  for (const r of RIVALS) {
    if (rivalStageTime(r.id, ctx).timeMs !== rivalStageTime(r.id, other).timeMs) differences += 1;
  }
  assert.ok(differences > RIVALS.length * 0.8, `only ${differences} rivals changed with the seed`);

  // Conditions are deterministic too, and a field selection is stable.
  assert.deepEqual(conditionsFor("alpha", "terraocra", "ocr-serra"), cond);
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

  assert.ok(stages > 40, `expected a full book of stages, got ${stages}`);
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
  for (const ev of RALLIES) {
    for (const lg of ev.legs) {
      for (const stage of lg.stages) {
        const cond = conditionsFor("pace", ev.id, stage.id);
        const base = estimateStageTime(stage, { pace: tier.pace, conditions: cond });
        for (const r of RIVALS) {
          const res = rivalStageTime(r.id, { seed: "pace", eventId: ev.id, stage, tier, conditions: cond });
          if (res.status !== "ok") continue;
          deficits.get(r.id).push(res.timeMs / base - 1);
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
  const snowStage = stageById("kal-fjellrand");
  const tarmacStage = stageById("van-costiera");
  const swing = (id) => {
    const snowCond = conditionsFor("pace", "kaldvik", snowStage.id);
    const tarCond = conditionsFor("pace", "vantore", tarmacStage.id);
    const a = rivalStageTime(id, { seed: "pace", eventId: "kaldvik", stage: snowStage, tier, conditions: snowCond });
    const b = rivalStageTime(id, { seed: "pace", eventId: "vantore", stage: tarmacStage, tier, conditions: tarCond });
    return (a.timeMs / estimateStageTime(snowStage, { pace: tier.pace, conditions: snowCond }))
      - (b.timeMs / estimateStageTime(tarmacStage, { pace: tier.pace, conditions: tarCond }));
  };
  assert.ok(swing("kirvala") < swing("bellucco"),
    "the snow specialist should gain on snow relative to the tarmac specialist");
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
  career.newSeason({ seed: "season-arith", tierId: "continental", rounds: 6 });
  const season = career.state.season;
  assert.equal(season.calendar.length, 6);

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
  assert.equal(me.starts, 6);
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
  assert.ok(RALLIES.length >= 6, "a season needs a calendar to draw from");
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
