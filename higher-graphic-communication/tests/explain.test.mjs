// Marker tests for the typed explain builder (dtp-explain.js, on dtp.html #w-explain).
// Run with: node --test higher-graphic-communication/tests/explain.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["papers-engine.js", "dtp-explain.js"])
  vm.runInContext(await readFile(resolve(PROJECT, f), "utf8"), sandbox, { filename: f });
const { HGX } = sandbox.window;
const one = (qk, text) => HGX.mark(qk, [text]).rows[0];
const sample = (p) => p.sample.join(" ");

test("every hidden sample earns its mark, and two different ones earn both", () => {
  for (const qk of HGX.KEYS) {
    const pts = HGX.Q[qk].points;
    assert.ok(pts.length >= 2, `${qk}: at least two causes, so two marks are possible`);
    for (const p of pts) {
      const r = one(qk, sample(p));
      assert.ok(r.ok, `${qk}/${p.id}: sample should score: ${r.why}`);
      assert.equal(r.cause, p.id, `${qk}/${p.id}: credited to its own cause`);
    }
    const m = HGX.mark(qk, [sample(pts[0]), sample(pts[1])]);
    assert.equal(m.got, 2, `${qk}: two different samples score 2/2`);
  }
});

test("students' own wordings of a cause and effect earn the mark", () => {
  const ok = {
    emphasis: [
      "The date is bold and on a yellow box which makes it catch your eye.",
      "The title is in big white letters on the dark band so you notice it first.",
      "The red dotted line leads the viewer's eye down to the date.",
    ],
    depth: [
      "The small ship photo overlaps the big photo so it looks like it is in front.",
      "The ship picture has a drop shadow which makes it look raised off the page.",
      "The ship photo has a warm orange frame which advances against the cool blue sky.",
    ],
    unity: [
      "The same red, yellow and blue colours are used throughout the poster so it all looks like one planned design.",
      "The caption is placed right under the ship photo so you can tell they go together.",
    ],
  };
  for (const [qk, list] of Object.entries(ok))
    for (const t of list) { const r = one(qk, t); assert.ok(r.ok, `${qk}: "${t}" should score: ${r.why}`); }
});

test("half an answer earns nothing, and says which half is missing", () => {
  const cases = [
    ["emphasis", "", /nothing written/],
    ["emphasis", "It makes it stand out and draws the viewer's attention.", /effect with no cause/],
    ["emphasis", "The date is in navy bold text on a yellow accent panel.", /not its effect/],
    ["emphasis", "Yellow is used to create emphasis.", /names the design principle/],
    ["depth", "The ship photo overlaps the main photo.", /not its effect/],
    ["unity", "The caption sits directly beneath the ship photo.", /not its effect/],
  ];
  for (const [qk, t, why] of cases) {
    const r = one(qk, t);
    assert.ok(!r.ok, `${qk}: "${t}" should not score`);
    assert.match(r.why, why, `${qk}: "${t}" feedback`);
  }
});

test("a cause that fits another principle earns nothing", () => {
  const cases = [
    ["emphasis", "The aircraft photo is far larger than anything else, so the eye goes to it first.", /dominance/],
    ["unity", "The pennants are repeated at equal spacing along the top, so they look like they belong together.", /rhythm/],
    ["emphasis", "The ship photo overlaps the main photo so it seems to come forward.", /creates depth, not emphasis/],
  ];
  for (const [qk, t, why] of cases) {
    const r = one(qk, t);
    assert.ok(!r.ok, `${qk}: "${t}" should not score`);
    assert.match(r.why, why, `${qk}: "${t}" feedback`);
  }
});

test("the same cause twice earns one mark, not two", () => {
  const p = HGX.Q.emphasis.points.find((x) => x.id === "date");
  const m = HGX.mark("emphasis", [sample(p), "The date is on a bright yellow panel so it is noticed first."]);
  assert.equal(m.got, 1);
  assert.match(m.rows[1].why, /same cause/);
});

test("a key-word list, or a negated claim, earns nothing", () => {
  for (const qk of HGX.KEYS) {
    const p = HGX.Q[qk].points[0];
    const keywords = sample(p).toLowerCase().match(/[a-z]+/g).filter((w) => w.length > 4).join(" ");
    assert.ok(!one(qk, keywords).ok, `${qk}: key words only ("${keywords}") should not score`);
  }
  assert.ok(!one("emphasis", "The date is not on a yellow panel, so it does not stand out.").ok, "negated claim should not score");
});
