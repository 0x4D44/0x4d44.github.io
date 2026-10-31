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

// round 5: HUD text agrees with the spoken call; names are shared; the repeat guard is pinned; cave calls are spaced
import { buildPacenotes } from "../core/pacenotes.mjs";
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
for (const id of STAGE_IDS) {
  test(`${id}: HUD note text carries the same grades as the spoken call`, () => {
    const st = buildStage(id);
    let tight = 0;
    for (const n of st.pacenotes) {
      if (n.kind !== "corner" || n.chained || /,\s*into/.test(n.speak)) continue;
      const m = /^(?:Again, )?(left|right) (\w+)/i.exec(n.speak);
      const h = /^[LR](\d)/.exec(n.text);
      assert.ok(m && h, `${id} s=${n.s}: "${n.speak}" / "${n.text}"`);
      assert.equal(Number(h[1]), NUMW[m[2].toLowerCase()], `${id} s=${n.s}: "${n.speak}" vs HUD "${n.text}"`);
      if (/tightens to/.test(n.speak)) { tight++; assert.ok(n.text.endsWith(`tightens ${NUMW[/tightens to (\w+)/.exec(n.speak)[1]]}`), `${n.speak} vs ${n.text}`); }
    }
  });
}
test("surface names: pace notes and the HUD chip use one name", async () => {
  const { SURFACE_INFO } = await import("../core/surfaces.mjs");
  const names = new Set();
  for (const id of STAGE_IDS) for (const n of buildStage(id).pacenotes) if (n.kind === "surface") names.add(n.speak.toLowerCase());
  assert.ok([...names].every((s) => !s.includes("hard pack")), [...names].join("|"));
  assert.ok(SURFACE_INFO.find((q) => q.id === 1).name.toLowerCase() === "packed dirt");
});
test("the repeat guard: a repeated call within 100 m is voiced 'Again, ...'", () => {
  let again = 0;
  for (const sid of STAGE_IDS) again += buildStage(sid).pacenotes.filter((n) => n.speak.startsWith("Again, ")).length;
  assert.ok(again > 0, "no stage exercises the repeat guard");
});
test("a cave call is at least 30 m clear of the corner before it", () => {
  const st = buildStage("waitomo");
  const k = st.pacenotes.findIndex((n) => /cave/i.test(n.speak));
  assert.ok(k > 0);
  const p = st.pacenotes[k - 1];
  if (p.kind === "corner" || p.kind === "hairpin") assert.ok(st.pacenotes[k].s - (p.s + p.length) >= 29, `gap ${st.pacenotes[k].s - (p.s + p.length)}`);
});
test("a tightens call exists to pin the HUD numbers", () => {
  let n = 0;
  for (const id of STAGE_IDS) n += buildStage(id).pacenotes.filter((q) => /tightens to/.test(q.speak) && /tightens \d/.test(q.text)).length;
  assert.ok(n >= 2, `${n}`);
});
