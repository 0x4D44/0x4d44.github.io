import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../app.jsx", import.meta.url), "utf8");

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
