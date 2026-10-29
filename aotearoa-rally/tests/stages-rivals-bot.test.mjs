// S5: rival difficulty is calibrated against real bot laps.  A skill-0.9 bot should win on Rookie, win or nearly win on
// Pro, and be in the fight (about 2nd-4th) on Expert.  Bot laps are measured here, as a ratio to the skill-1.0 lap,
// and applied to the (possibly not yet recalibrated) PAR_TIMES entry, so the check holds across recalibration.
// STAGES_BREAK=slow-rivals pushes every rival 30 % slower so the check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { STAGE_IDS, buildStage } from "../core/stage.mjs";
import { RIVALS, rivalStageTime, buildTimeSheet, botPar } from "../core/rivals.mjs";
import { botLap } from "./dynamics-botrun.mjs";

const BREAK = process.env.STAGES_BREAK || "";

function positionOf(stageId, playerTime, difficulty, seed) {
  const times = RIVALS.map((_, i) => {
    const t = rivalStageTime({ stageId, rivalIndex: i, parTime: 100, difficulty, seed });
    return BREAK === "slow-rivals" ? t * 1.3 : t;
  });
  return buildTimeSheet(playerTime, times).find((r) => r.isPlayer).position;
}

test("a skill-0.9 bot wins Rookie, wins or nearly wins Pro and is in the fight on Expert", () => {
  const sums = { rookie: 0, pro: 0, expert: 0 };
  let n = 0;
  for (const id of STAGE_IDS) {
    const st = buildStage(id);
    const lap1 = botLap(id, "huia", 1, st), lap9 = botLap(id, "huia", 0.9, st);
    assert.ok(lap1.finished && lap9.finished, `${id}: bot did not finish`);
    const ratio = lap9.time / lap1.time;
    assert.ok(ratio > 1.0 && ratio < 1.08, `${id}: skill-0.9 bot is ${ratio.toFixed(3)} x the skill-1.0 lap`);
    const t = botPar(id, "huia") * ratio;
    for (const d of ["rookie", "pro", "expert"]) {
      let p = 0;
      for (let seed = 1; seed <= 9; seed++) p += positionOf(id, t, d, seed);
      sums[d] += p / 9;
    }
    n++;
    console.log(`# ${id}: skill-0.9 ratio ${ratio.toFixed(3)}`);
  }
  const mean = (d) => sums[d] / n;
  console.log(`# mean finishing position of a skill-0.9 bot: rookie ${mean("rookie").toFixed(2)}, pro ${mean("pro").toFixed(2)}, expert ${mean("expert").toFixed(2)}`);
  // round 3: the field is beatable. A near-perfect (skill 0.9) driver wins Rookie and Pro, and is in the fight on Expert.
  assert.ok(mean("rookie") <= 1.2, `rookie ${mean("rookie")}`);
  assert.ok(mean("pro") <= 1.8, `pro ${mean("pro")}`);
  assert.ok(mean("expert") >= 1.5 && mean("expert") <= 4.5 && mean("expert") > mean("pro"), `expert ${mean("expert")}`);
});
