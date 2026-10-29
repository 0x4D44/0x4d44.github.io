// Co-driver timing on every stage at 90 / 120 / 150 km/h: no call may still be speaking when its feature starts,
// and the average lead must stay in a usable window.
import test from "node:test";
import assert from "node:assert/strict";
import { buildStage } from "../core/stage.mjs";
import { simulateCalls } from "../audio/codriver.mjs";

const IDS = ["coromandel", "waitomo", "whakarewarewa", "otago", "remarkables", "fiordland"];
for (const id of IDS) {
  test(`co-driver: ${id} at 90 / 120 / 150 km/h has no late calls and a 2.5-4.5 s mean lead`, () => {
    const stage = buildStage(id);
    for (const kmh of [90, 120, 150]) {
      const v = kmh / 3.6, rows = simulateCalls(stage.pacenotes, () => v);
      assert.ok(rows.length >= 10, `${id} ${kmh}: only ${rows.length} calls spoken`);
      const late = rows.filter((r) => r.endBeforeM < 0);
      assert.equal(late.length, 0, `${id} ${kmh} km/h: late calls ${JSON.stringify(late.slice(0, 3).map((r) => [r.text, r.endBeforeM.toFixed(1)]))}`);
      const mean = rows.reduce((a, r) => a + r.leadS, 0) / rows.length;
      assert.ok(mean >= 2.5 && mean <= 4.5, `${id} ${kmh} km/h: mean lead ${mean.toFixed(2)} s`);
    }
  });
}
