import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const app = await readFile(new URL("../app.jsx", import.meta.url), "utf8");
const geo = await readFile(new URL("../geo.js", import.meta.url), "utf8");
const browser = { window: {} };
vm.runInNewContext(geo, browser);
const L = browser.window.RunLib;

test("lap controls stay above the growing lap history", () => {
  const lapButton = app.indexOf('className={"mr-lap-btn"');
  const finishButton = app.indexOf('className="mr-btn mr-btn-stop mr-wide"');
  const lapHistory = app.indexOf('className="mr-laplist"');

  assert.notEqual(lapButton, -1, "LAP button is present");
  assert.notEqual(finishButton, -1, "finish button is present");
  assert.notEqual(lapHistory, -1, "lap history is present");
  assert.ok(lapButton < lapHistory, "LAP button precedes lap history");
  assert.ok(finishButton < lapHistory, "finish button precedes lap history");
});

test("automatic lap counting is opt-in", () => {
  assert.equal(L.cruiseDefaults().autoCount, false);
  assert.notEqual(
    L.cruiseDefaults(),
    L.cruiseDefaults(),
    "callers receive independent defaults"
  );
});

test("average lap cards show elapsed lap time", () => {
  assert.equal(L.formatAverageLap([]), "—");
  assert.equal(L.formatAverageLap([{ ms: 240000 }]), "4:00");
  assert.equal(
    L.formatAverageLap([{ ms: 240000 }, { ms: 250000 }, { ms: 245000 }]),
    "4:05"
  );
});

test("average lap arithmetic preserves four-minute lap times", () => {
  const average = L.meanMs([240000, 250000, 245000]);

  assert.equal(average, 245000);
  assert.equal(L.fmtDuration(average / 1000), "4:05");
  assert.equal(L.meanMs([]), 0);
});
