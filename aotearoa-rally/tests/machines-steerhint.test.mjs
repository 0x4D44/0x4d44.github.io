import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("steering assist hint no longer claims it reduces steering lock", () => {
  const s = readFileSync(new URL("../ui/screens.mjs", import.meta.url), "utf8");
  assert.ok(!s.includes("Reduces steering lock") && s.includes("Full strength by about a third of the way up."));
});
