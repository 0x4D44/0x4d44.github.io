// Round 4 S2: the co-driver never repeats itself back to back and never rambles.
// STAGES_BREAK=dup-speak duplicates one call so the check can be seen to fail (self-test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStage, STAGE_IDS } from "../core/stage.mjs";

const BREAK = process.env.STAGES_BREAK || "";

for (const id of STAGE_IDS) {
  test(`${id}: no adjacent identical calls within 100 m, none over 8 words, cave calls stand alone`, () => {
    const st = buildStage(id);
    const notes = st.pacenotes;
    if (BREAK === "dup-speak") { const q = notes.findIndex((n) => n.kind === "corner"); notes.splice(q + 1, 0, { ...notes[q], s: notes[q].s + 40 }); }
    const spoken = notes.filter((n) => n.speak && !n.chained);
    for (let i = 0; i < spoken.length; i++) {
      const n = spoken[i];
      assert.ok(n.speak.trim().split(/\s+/).length <= 8, `${id} s=${n.s.toFixed(0)}: "${n.speak}" is over 8 words`);
      if (n.kind === "caution" && /cave/i.test(n.speak)) assert.ok(!/hairpin|into/i.test(n.speak), `${id}: cave call glued into another: "${n.speak}"`);
      if (i > 0) {
        const p = spoken[i - 1];
        if (n.speak === p.speak && n.s - p.s < 100 + p.length) assert.fail(`${id}: "${n.speak}" at s=${p.s.toFixed(0)} and again at s=${n.s.toFixed(0)}`);
      }
    }
    // a chained follower never repeats its predecessor's grade and direction ("into left five, into left five")
    for (let i = 1; i < notes.length; i++) {
      const p = notes[i - 1], n = notes[i];
      if (p.modifiers.includes("into") && p.kind === "corner" && n.kind === "corner") assert.ok(!(p.dir === n.dir && p.severity === n.severity), `${id}: chained same call ${p.dir} ${p.severity} at s=${p.s.toFixed(0)}`);
    }
  });
}
