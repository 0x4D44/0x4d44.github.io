// Round 5 MACHINES: the HUD shows a stuck hint while state.stuck is true (names the player's own keys), and R is labelled for what it does.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stuckHintFor, stuckHintText } from "../ui/stuck.mjs";
import { DEFAULT_BINDINGS, ACTION_LABELS } from "../core/input.mjs";

test("stuck true shows the hint with the default brake and reset keys; stuck false shows nothing", () => {
  assert.equal(stuckHintFor({ stuck: true }, DEFAULT_BINDINGS), "Stuck? Hold brake (Z) to reverse, or press R");
  assert.equal(stuckHintFor({ stuck: false }, DEFAULT_BINDINGS), "");
  assert.equal(stuckHintFor({}, DEFAULT_BINDINGS), "");
  assert.equal(stuckHintFor(null, DEFAULT_BINDINGS), "");
});

test("the hint follows rebinding", () => {
  assert.equal(stuckHintText({ brake: ["ArrowDown"], reset: ["KeyX"] }), "Stuck? Hold brake (Down) to reverse, or press X");
  assert.match(stuckHintText(null), /^Stuck\? Hold brake to reverse, or press reset$/);
});

test("the HUD update path drives the hint from state.stuck, and the reset action says what it does", () => {
  const hud = readFileSync(new URL("../ui/hud.mjs", import.meta.url), "utf8");
  assert.match(hud, /set\("stuck", el\.stuck, !!state\.stuck/);
  assert.match(hud, /stuckHintFor\(state/);
  assert.equal(ACTION_LABELS.reset, "Respawn on road");
  assert.ok(!/Back to checkpoint/.test(readFileSync(new URL("../ui/screens.mjs", import.meta.url), "utf8")));
  const css = readFileSync(new URL("../ui/ar.css", import.meta.url), "utf8");
  assert.match(css, /\.h-stuck \{[^}]*position: absolute/, "out of flow: no layout shift");
});
