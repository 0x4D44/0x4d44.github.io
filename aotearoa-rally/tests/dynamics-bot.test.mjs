// DYNAMICS lane: the bot completes every stage with every car. Run: node --test tests/dynamics-bot.test.mjs
// One test per stage (the runner executes files in parallel; stages here run sequentially, ~10-25 s each).
import test from "node:test";
import assert from "node:assert/strict";
import { CAR_IDS } from "../core/cars.mjs";
import { STAGE_IDS, buildStage } from "../core/stage.mjs";
import { botLap } from "./dynamics-botrun.mjs";
import { PAR_TIMES } from "../core/partimes.mjs";

for (const sid of STAGE_IDS) {
  test(`bot (skill 1.0) finishes ${sid} with every car, <= 2 s off-road, undamaged enough to continue`, { timeout: 600000 }, () => {
    const st = buildStage(sid);
    for (const id of CAR_IDS) {
      const r = botLap(sid, id, 1, st);
      assert.ok(r.finished, `${sid}/${id} did not finish (stopped at t=${r.time.toFixed(0)})`);
      assert.ok(r.offRoad <= 2, `${sid}/${id} off-road ${r.offRoad.toFixed(2)} s`);
      assert.equal(r.flips, 0, `${sid}/${id} flipped`);
      assert.ok(r.damage < 0.5, `${sid}/${id} damage ${r.damage.toFixed(2)}`);
      const par = PAR_TIMES[sid][id];
      assert.ok(Math.abs(r.time - par) < 0.6, `${sid}/${id} lap ${r.time.toFixed(1)} s differs from PAR_TIMES ${par} s (rerun tests/calibrate-par.mjs)`);
    }
  });
}

test("a slower bot (skill 0.6) is slower than skill 1.0 and still finishes", { timeout: 300000 }, () => {
  const st = buildStage(STAGE_IDS[0]);
  const fast = botLap(STAGE_IDS[0], "kea", 1, st);
  const slow = botLap(STAGE_IDS[0], "kea", 0.6, st);
  assert.ok(slow.finished, "skill 0.6 did not finish");
  assert.ok(slow.time > fast.time * 1.03, `slow ${slow.time.toFixed(1)} vs fast ${fast.time.toFixed(1)}`);
});

test("bot lap is deterministic", { timeout: 300000 }, () => {
  const st = buildStage(STAGE_IDS[1]);
  const a = botLap(STAGE_IDS[1], "takahe", 1, st), b = botLap(STAGE_IDS[1], "takahe", 1, st);
  assert.equal(a.time, b.time);
  assert.equal(a.maxLat, b.maxLat);
});
