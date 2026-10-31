// Co-driver timing on every stage at 90 / 120 / 150 km/h: no call may still be speaking when its feature starts,
// and the average lead must stay in a usable window.
import test from "node:test";
import assert from "node:assert/strict";
import { buildStage } from "../core/stage.mjs";
import { simulateCalls, dedupeClauses, joinClauses } from "../audio/codriver.mjs";

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

  test(`co-driver: ${id} no spoken call repeats a clause or says "into caution" (round 4, M6)`, () => {
    const stage = buildStage(id);
    for (const kmh of [60, 90, 120, 150]) {
      const v = kmh / 3.6, rows = simulateCalls(stage.pacenotes, () => v);
      for (const r of rows) {
        const clauses = r.text.split(/\s*[,.]\s*/).map((c) => c.replace(/^into\s+/i, "").trim().toLowerCase()).filter(Boolean);
        for (let i = 1; i < clauses.length; i++) assert.notEqual(clauses[i], clauses[i - 1], `${id} ${kmh}: repeated clause in "${r.text}"`);
        assert.ok(!/\binto\s+caution\b/i.test(r.text), `${id} ${kmh}: "${r.text}"`);
      }
    }
  });
}

test("co-driver: dedupeClauses / joinClauses units", () => {
  assert.equal(dedupeClauses("Left five, into left five"), "Left five");
  assert.equal(dedupeClauses("Left five, into right four, into right four, into straight"), "Left five, into right four, into straight");
  assert.equal(joinClauses("Hairpin right", "Caution, cave mouth, trees close in"), "Hairpin right. Caution, cave mouth, trees close in");
  assert.equal(joinClauses("Left three", "right four"), "Left three, into right four");
});
