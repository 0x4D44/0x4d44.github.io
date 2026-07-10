import test from "node:test";
import assert from "node:assert/strict";

import { DIFFICULTIES, FEATURES, FOCUSES, MARKETS } from "./content.mjs";
import {
  advanceQuarter,
  assignRoute,
  createNewGame,
  enterpriseValue,
  forecastQuarter,
  levelForState,
  orderShip,
  quoteShipDesign,
  refitShip,
  repairShip,
  serialisableState,
  setMarketPrice,
  setMarketing,
  setOperation,
  validateShipDesign,
  validateState,
} from "./engine.mjs";

function assertFiniteReport(report) {
  for (const key of ["revenue", "costs", "operatingProfit", "passengers", "capacity", "averageOccupancy", "satisfaction", "marketShare"]) {
    assert.ok(Number.isFinite(report[key]), `${key} should be finite`);
  }
  assert.ok(report.averageOccupancy >= 0 && report.averageOccupancy <= 1.001);
  assert.ok(report.marketShare >= 0 && report.marketShare <= 1.001);
}

test("every opening strategy and difficulty produces a valid finite forecast", () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    for (const focusId of Object.keys(FOCUSES)) {
      const state = createNewGame({ difficulty, focusId, seed: `${difficulty}-${focusId}` });
      assert.deepEqual(validateState(state), []);
      assertFiniteReport(forecastQuarter(state));
      assert.equal(state.rivals.length, 4);
      assert.equal(state.company.fleet.length, 1);
    }
  }
});

test("a seeded campaign is deterministic", () => {
  const left = createNewGame({ companyName: "Deterministic Voyages", focusId: "premium", seed: 0x4d44 });
  const right = createNewGame({ companyName: "Deterministic Voyages", focusId: "premium", seed: 0x4d44 });
  for (let quarter = 0; quarter < 8; quarter += 1) {
    setMarketPrice(left, "med", 1.04 + quarter * .01);
    setMarketPrice(right, "med", 1.04 + quarter * .01);
    setMarketing(left, "loyalty", 1 + quarter * .2);
    setMarketing(right, "loyalty", 1 + quarter * .2);
    const resultLeft = advanceQuarter(left);
    const resultRight = advanceQuarter(right);
    assert.equal(resultLeft.ok, resultRight.ok);
    assert.deepEqual(serialisableState(left), serialisableState(right));
    if (left.status !== "planning") break;
  }
});

test("ship design choices change capacity, cost, appeal and efficiency", () => {
  const efficient = quoteShipDesign({ name: "MV Test", hullId: "boutique", cabinPlanId: "suites", speedId: "economy", features: ["spa", "observation", "shorePower"] });
  const dense = quoteShipDesign({ name: "MV Test", hullId: "boutique", cabinPlanId: "dense", speedId: "fast", features: ["theatre"] });
  assert.ok(dense.pax > efficient.pax);
  assert.ok(efficient.eco > dense.eco);
  assert.ok(efficient.appeal.luxury > dense.appeal.luxury);
  assert.notEqual(efficient.cost, dense.cost);
});

test("locked and incompatible ship designs are rejected", () => {
  const state = createNewGame({ seed: 17 });
  const errors = validateShipDesign(state, { name: "MV Too Soon", hullId: "mega", cabinPlanId: "balanced", speedId: "balanced", features: ["waterpark"] });
  assert.ok(errors.some((message) => message.includes("not unlocked")));
  const blocked = validateShipDesign(state, { name: "MV Slide", hullId: "boutique", cabinPlanId: "balanced", speedId: "balanced", features: ["waterpark"] });
  assert.ok(blocked.some((message) => message.includes("does not fit")) || blocked.some((message) => message.includes("not unlocked")));
});

test("commercial and operating controls clamp to their safe ranges", () => {
  const state = createNewGame({ seed: 18 });
  setMarketPrice(state, "med", 99);
  setMarketing(state, "digital", -10);
  setOperation(state, "crewPay", 5);
  setOperation(state, "serviceSpend", 0);
  assert.equal(state.company.prices.med, 1.45);
  assert.equal(state.company.marketing.digital, 0);
  assert.equal(state.company.crewPay, 1.28);
  assert.equal(state.company.serviceSpend, 90);
  assertFiniteReport(forecastQuarter(state));
});

test("an affordable newbuild is financed, constructed and delivered", () => {
  const state = createNewGame({ seed: 19 });
  const beforeDebt = state.company.debt;
  const result = orderShip(state, { name: "MV Second Light", hullId: "boutique", cabinPlanId: "balanced", speedId: "economy", features: ["theatre"], livery: "#22aacc" }, "loan");
  assert.equal(result.ok, true);
  assert.equal(state.company.orders.length, 1);
  assert.ok(state.company.debt > beforeDebt);
  const turn = advanceQuarter(state);
  assert.equal(turn.ok, true);
  assert.equal(state.company.orders.length, 0);
  assert.equal(state.company.fleet.length, 2);
  assert.ok(turn.report.deliveries.some((ship) => ship.name === "MV Second Light"));
});

test("routes respect progression locks", () => {
  const state = createNewGame({ seed: 20 });
  const ship = state.company.fleet[0];
  assert.equal(assignRoute(state, ship.id, "short").ok, true);
  assert.equal(ship.routeId, "short");
  assert.equal(assignRoute(state, ship.id, "asia").ok, false);
  assert.equal(ship.routeId, "short");
  assert.ok(MARKETS.asia.unlockLevel > levelForState(state).id);
});

test("refits and repairs consume cash and put a ship into the yard", () => {
  const state = createNewGame({ focusId: "premium", seed: 21 });
  const ship = state.company.fleet[0];
  const cashBeforeRefit = state.company.cash;
  const refit = refitShip(state, ship.id, "theatre");
  assert.equal(refit.ok, true);
  assert.ok(ship.features.includes("theatre"));
  assert.equal(ship.refitQuarters, 1);
  assert.ok(state.company.cash < cashBeforeRefit);
  advanceQuarter(state);
  assert.equal(ship.refitQuarters, 0);
  ship.condition = 62;
  const cashBeforeRepair = state.company.cash;
  const repair = repairShip(state, ship.id);
  assert.equal(repair.ok, true);
  assert.ok(ship.condition > 62);
  assert.equal(ship.refitQuarters, 1);
  assert.ok(state.company.cash < cashBeforeRepair);
});

test("long campaigns remain numerically stable as rival AI expands", () => {
  const state = createNewGame({ difficulty: "hard", focusId: "adventure", seed: 22 });
  for (let turn = 0; turn < 24 && state.status === "planning"; turn += 1) {
    // A modest defensive plan gives the simulation changing inputs without cheating progression.
    setMarketPrice(state, state.company.fleet[0].routeId, 1.08);
    setMarketing(state, "loyalty", Math.min(6, 1 + turn * .2));
    setOperation(state, "maintenance", 1.08);
    const result = advanceQuarter(state);
    assert.equal(result.ok, true);
    assertFiniteReport(result.report);
    assert.deepEqual(validateState(state), []);
    assert.ok(Number.isFinite(enterpriseValue(state)));
    for (const rival of state.rivals) {
      assert.ok(Number.isFinite(rival.cash));
      assert.ok(Number.isFinite(rival.debt));
      assert.ok(rival.fleet.every((ship) => Number.isFinite(ship.condition)));
    }
  }
  assert.ok(state.quarter > 0);
});

test("save-state serialisation preserves a valid playable state", () => {
  const state = createNewGame({ seed: 23 });
  advanceQuarter(state);
  const saved = serialisableState(state);
  const restored = JSON.parse(JSON.stringify(saved));
  assert.deepEqual(validateState(restored), []);
  assertFiniteReport(forecastQuarter(restored));
});
