// DYNAMICS: the four cars must differ in measurable bot lap times (PAR_TIMES) and in feel.
// Parametric: lineupProblems() takes any PAR_TIMES-shaped table so the test can prove it fails on a flat one.
import test from "node:test";
import assert from "node:assert/strict";
import { PAR_TIMES } from "../core/partimes.mjs";
import { CAR_IDS } from "../core/cars.mjs";
import { STAGE_IDS, buildStage } from "../core/stage.mjs";
import { botLap } from "./dynamics-botrun.mjs";

export function lineupProblems(P) {
  const out = [];
  const rank = (sid) => CAR_IDS.slice().sort((a, b) => P[sid][a] - P[sid][b]);
  const T = (sid, c) => P[sid][c];
  for (const sid of Object.keys(P)) {
    const ts = CAR_IDS.map((c) => T(sid, c));
    const spread = Math.max(...ts) / Math.min(...ts) - 1;
    if (spread < 0.03 || spread > 0.09) out.push(`${sid}: spread ${(spread * 100).toFixed(1)}% outside 3-9%`);
  }
  const r = (sid) => rank(sid);
  const best = (sid, cars) => Math.min(...cars.map((c) => T(sid, c)));
  const heavy = ["huia", "kea"], light = ["takahe", "piwakawaka"];
  if (!light.includes(r("coromandel")[0])) out.push("coromandel winner is " + r("coromandel")[0]);
  if (best("coromandel", heavy) / best("coromandel", light) < 1.02) out.push("coromandel: takahe/piwakawaka not >= 2% ahead of huia/kea");
  if (r("whakarewarewa")[0] !== "kea") out.push("whakarewarewa winner is " + r("whakarewarewa")[0]);
  for (const sid of ["waitomo", "otago"]) if (r(sid)[0] !== "huia" || r(sid)[1] !== "kea") out.push(`${sid}: order ${r(sid).join(">")}`);
  for (const sid of ["remarkables", "fiordland"]) {
    if (best(sid, light) / Math.max(...heavy.map((c) => T(sid, c))) < 1.05) out.push(`${sid}: AWD not >= 5% faster than FWD/RWD`);
  }
  return out;
}

test("PAR_TIMES lineup: winner table and 3-9% spread on every stage", () => {
  assert.deepEqual(lineupProblems(PAR_TIMES), []);
});

test("the lineup check fails on a flattened lineup", () => {
  const flat = {};
  for (const s of Object.keys(PAR_TIMES)) { flat[s] = {}; for (const c of CAR_IDS) flat[s][c] = PAR_TIMES[s].huia; }
  assert.ok(lineupProblems(flat).length >= 6);
});

test("skill calibration: skill 0.9 is about +4% and 0.75 about +8% of skill 1.0 on every stage", { timeout: 600000 }, () => {
  for (const sid of STAGE_IDS) {
    const st = buildStage(sid);
    const t1 = botLap(sid, "huia", 1, st), t9 = botLap(sid, "huia", 0.9, st), t75 = botLap(sid, "huia", 0.75, st);
    assert.ok(t9.finished && t75.finished && t9.offRoad <= 3 && t75.offRoad <= 3, sid + " slow bot left the road");
    const r9 = t9.time / t1.time - 1, r75 = t75.time / t1.time - 1;
    assert.ok(Math.abs(r9 - 0.04) <= 0.015, `${sid} skill 0.9 ratio +${(r9 * 100).toFixed(1)}%`);
    assert.ok(Math.abs(r75 - 0.08) <= 0.025, `${sid} skill 0.75 ratio +${(r75 * 100).toFixed(1)}%`);
  }
});
