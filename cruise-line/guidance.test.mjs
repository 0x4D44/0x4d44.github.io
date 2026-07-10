import test from "node:test";
import assert from "node:assert/strict";

import { COMPANY_NAMES } from "./content.mjs";
import { createNewGame, forecastQuarter } from "./engine.mjs";
import { ADVISERS, TOUR_TABS, guidanceFor } from "./guidance.mjs";

test("generated company names are varied, unique and input-safe", () => {
  assert.ok(COMPANY_NAMES.length >= 24);
  assert.equal(new Set(COMPANY_NAMES).size, COMPANY_NAMES.length);
  assert.ok(COMPANY_NAMES.every((name) => name.length <= 36));
  assert.ok(COMPANY_NAMES.some((name) => /Bureau|Ministry|Laborator|Committee/.test(name)));
});

test("the guided tour covers the core decision loop", () => {
  assert.deepEqual(TOUR_TABS, ["bridge", "fleet", "markets", "brand", "finance"]);
  const state = createNewGame({ seed: 0x4d44 });
  const forecast = forecastQuarter(state);
  for (const [index, tab] of TOUR_TABS.entries()) {
    const guidance = guidanceFor({ state, forecast, tab });
    assert.ok(Object.values(ADVISERS).includes(guidance.adviser));
    assert.ok(guidance.title.length > 8);
    assert.ok(guidance.body.length > 40);
    assert.equal(guidance.tourStep, index + 1);
    assert.equal(guidance.action.tab, TOUR_TABS[(index + 1) % TOUR_TABS.length]);
  }
});

test("guidance reacts to a loss and neglected operations", () => {
  const state = createNewGame({ seed: 17 });
  const forecast = forecastQuarter(state);
  const loss = guidanceFor({ state, forecast: { ...forecast, operatingProfit: -9 }, tab: "bridge" });
  assert.equal(loss.adviser, ADVISERS.finance);
  assert.equal(loss.action.tab, "fleet");

  state.company.maintenance = 0.74;
  const neglect = guidanceFor({ state, forecast, tab: "brand" });
  assert.equal(neglect.adviser, ADVISERS.operations);
  assert.match(neglect.title, /maintenance/i);
});
