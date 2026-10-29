import test from "node:test";
import assert from "node:assert/strict";
import { createScheduler, speechSeconds, MAX_LEAD_S } from "../audio/codriver.mjs";

test("a call (merged or not) is spoken to its end before the first feature, at any speed, with a lead of at most 4.5 s", () => {
  const mk = (s, speak) => ({ s, speak, text: speak, kind: "corner", length: 20, severity: 3 });
  for (const v of [8, 12, 18, 25, 35, 50]) {
    const notes = [mk(1000, "Left four"), mk(1030, "Right three"), mk(1060, "Left four"), mk(1090, "Right two"), mk(1120, "Left three")];
    const sc = createScheduler();
    let got = null, at = 0;
    for (let s = 700; s < 1100 && !got; s += 0.25) { const u = sc.update(notes, s, v, false); if (u) { got = u; at = s; } }
    assert.ok(got, `no call at ${v} m/s`);
    const lead = (1000 - at) / v;
    assert.ok(lead <= MAX_LEAD_S + 0.1, `lead ${lead.toFixed(2)} s at ${v} m/s`);
    const over = at + speechSeconds(got.text, got.rate) * v - 1000;
    assert.ok(over <= 1, `"${got.text}" at ${v} m/s ends ${over.toFixed(1)} m after the feature`);
  }
});

import { simulateCalls } from "../audio/codriver.mjs";
test("simulateCalls: one row per call, queued calls never overlap in time, leads within the cap", () => {
  const mk = (s, speak) => ({ s, speak, text: speak, kind: "corner", length: 20, severity: 3 });
  const notes = [mk(800, "Left four"), mk(1500, "Right three"), mk(2200, "Left two")];
  const rows = simulateCalls(notes, () => 25);
  assert.equal(rows.length, 3);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].startT >= rows[i - 1].endT);
  for (const r of rows) { assert.ok(r.leadS <= MAX_LEAD_S + 0.2 && r.leadS > 0.5); assert.ok(r.endBeforeM > -1); }
});
