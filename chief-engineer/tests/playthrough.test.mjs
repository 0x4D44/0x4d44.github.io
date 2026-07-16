import assert from "node:assert/strict";
import { createVoyage, tick, applyAction, stars } from "../engine.js";
import { LEVELS } from "../content.js";
import { botStep } from "./bot.mjs";

// The winnability oracle (HLD §3/X8): the bot — using only player-visible
// data — must complete every level across a seed sweep, and every level must
// have at least one deterministic 3-star witness seed.

const SEEDS = [1, 2, 3, 4, 5];
const MAX_TICKS = 20000;

function scanNaN(obj, path = "state") {
  if (typeof obj === "number") {
    assert.ok(Number.isFinite(obj), `NaN/Infinity at ${path}`);
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanNaN(v, `${path}[${i}]`));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) scanNaN(v, `${path}.${k}`);
  }
}

const summary = [];
for (const lv of LEVELS) {
  let witness = null;
  for (const seed of SEEDS) {
    const s = createVoyage(lv.id, seed);
    let ticks = 0;
    while (s.phase === "voyage" && ticks < MAX_TICKS) {
      for (const a of botStep(s)) applyAction(s, a);
      tick(s);
      ticks++;
      if (ticks % 1000 === 0) {
        scanNaN(s);
        assert.ok(s.tanks.HFO >= 0 && s.tanks.MGO >= 0, `${lv.id}#${seed} fuel never negative`);
      }
    }
    assert.equal(s.phase, "complete",
      `${lv.id} seed ${seed} completes (got ${s.phase}${s.failReason ? `: ${s.failReason}` : ""} after ${ticks} ticks)`);
    scanNaN(s);
    const st = stars(s);
    if (st.safety && st.service && st.efficiency && witness == null) witness = { seed, st, s };
    if (seed === SEEDS[0]) {
      summary.push(`${lv.id}: ${ticks} ticks, comfort ${st.comfortAvg.toFixed(1)}, spent ${st.spent.toFixed(0)}/${s.budget}k, late ${s.lateMin}m, fines €${s.finesEUR}, casualties ${s.playerFaultCasualties}, blackout ${s.unscriptedBlackout}`);
    }
  }
  assert.ok(witness, `${lv.id} has a 3-star witness seed (X8)`);
  // objectives all satisfiable: the witness run finished them
  const undone = witness.s.objectives.filter((o) => !o.done);
  assert.equal(undone.length, 0, `${lv.id} witness completes all objectives (undone: ${undone.map((o) => o.id).join(",")})`);
}

console.log(summary.join("\n"));
console.log("chief-engineer playthrough tests passed");
