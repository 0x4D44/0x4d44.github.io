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

// --- Malformed-save hardening (ALM-REQ-KILN-00001) ---
// A corrupted same-version localStorage payload must be rejected by validateState so it
// never reaches the render path: app.mjs indexes FEATURES/CABIN_PLANS/HULLS and reads
// order.ship / rival.fleet directly, and throws on an unknown id or missing structure.
function malformedBase() {
  return JSON.parse(JSON.stringify(serialisableState(createNewGame({ seed: "malformed" }))));
}

test("validateState accepts a well-formed save carrying a build order", () => {
  const saved = malformedBase();
  const orderShipCopy = JSON.parse(JSON.stringify(saved.company.fleet[0]));
  orderShipCopy.id = "order-ship-test";
  saved.company.orders.push({
    id: "order-test",
    ship: orderShipCopy,
    quartersRemaining: 3,
    finance: "cash",
    cashPaid: 0,
    debtRaised: 0,
  });
  assert.deepEqual(validateState(saved), []);
});

test("validateState rejects an unknown ship feature id", () => {
  const saved = malformedBase();
  saved.company.fleet[0].features = ["not-a-real-feature"];
  const errors = validateState(saved);
  assert.ok(errors.some((m) => m.includes("not-a-real-feature")), errors.join(" | "));
});

test("validateState rejects unknown cabin-plan and speed ids", () => {
  const badCabin = malformedBase();
  badCabin.company.fleet[0].cabinPlanId = "penthouse";
  assert.ok(validateState(badCabin).some((m) => m.includes("penthouse")));

  const badSpeed = malformedBase();
  badSpeed.company.fleet[0].speedId = "warp";
  assert.ok(validateState(badSpeed).some((m) => m.includes("warp")));
});

test("validateState rejects a malformed ship livery", () => {
  const saved = malformedBase();
  saved.company.fleet[0].livery = "royal-blue";
  assert.ok(validateState(saved).some((m) => m.includes("livery") && m.includes("royal-blue")));
});

test("validateState rejects malformed build orders", () => {
  const noShip = malformedBase();
  noShip.company.orders.push({ id: "o1", quartersRemaining: 2 });
  assert.ok(validateState(noShip).some((m) => m.includes("Order o1")), "order with no ship");

  const badHull = malformedBase();
  const badHullShip = JSON.parse(JSON.stringify(badHull.company.fleet[0]));
  badHullShip.hullId = "starship";
  badHull.company.orders.push({ id: "o2", ship: badHullShip, quartersRemaining: 2 });
  assert.ok(validateState(badHull).some((m) => m.includes("hull")));

  const badQuarters = malformedBase();
  badQuarters.company.orders.push({ id: "o3", ship: JSON.parse(JSON.stringify(badQuarters.company.fleet[0])), quartersRemaining: "soon" });
  assert.ok(validateState(badQuarters).some((m) => m.includes("quartersRemaining")));

  const ordersNotArray = malformedBase();
  ordersNotArray.company.orders = "nope";
  assert.ok(validateState(ordersNotArray).some((m) => m.includes("orders")));
});

test("validateState rejects malformed rival structure", () => {
  const rivalsNotArray = malformedBase();
  rivalsNotArray.rivals = {};
  assert.ok(validateState(rivalsNotArray).some((m) => m.includes("Rivals")));

  const rivalNoFleet = malformedBase();
  delete rivalNoFleet.rivals[0].fleet;
  assert.ok(validateState(rivalNoFleet).some((m) => m.includes("fleet")));

  const rivalOrdersNotArray = malformedBase();
  rivalOrdersNotArray.rivals[0].orders = "nope";
  assert.ok(validateState(rivalOrdersNotArray).some((m) => m.includes("Rival") && m.includes("orders")));

  const rivalNullOrder = malformedBase();
  rivalNullOrder.rivals[0].orders = [null];
  assert.ok(validateState(rivalNullOrder).some((m) => m.includes("Rival") && m.includes("non-object order")));

  const rivalBadShip = malformedBase();
  rivalBadShip.rivals[0].fleet[0].hullId = "starship";
  assert.ok(validateState(rivalBadShip).some((m) => m.includes("Rival") && m.includes("hull")));
});

test("validateState rejects an unknown campaign status", () => {
  const saved = malformedBase();
  saved.status = "victory-lap";
  assert.ok(validateState(saved).some((m) => m.includes("victory-lap")));
});

test("validateState rejects other structural corruptions (defensive depth)", () => {
  const featuresNotArray = malformedBase();
  featuresNotArray.company.fleet[0].features = "none";
  assert.ok(validateState(featuresNotArray).some((m) => m.includes("features is not an array")));

  const nonObjectOrder = malformedBase();
  nonObjectOrder.company.orders.push(null);
  assert.ok(validateState(nonObjectOrder).some((m) => m.includes("An order is not an object")));

  const nonObjectRival = malformedBase();
  nonObjectRival.rivals.push(null);
  assert.ok(validateState(nonObjectRival).some((m) => m.includes("A rival is not an object")));

  const newsNotArray = malformedBase();
  newsNotArray.news = null;
  assert.ok(validateState(newsNotArray).some((m) => m.includes("News is not an array")));
});

test("a corrupt feature id passes the forecast gate but validateState still catches it", () => {
  // Proves WHY the id checks are needed: forecastQuarter reads the precomputed ship.appeal
  // snapshot, never FEATURES, so a bogus feature id yields a finite forecast and slips past
  // the old numeric/forecast gate — only the explicit id check rejects it before render.
  const saved = malformedBase();
  saved.company.fleet[0].features = ["ghost-feature"];
  assertFiniteReport(forecastQuarter(saved));
  assert.ok(validateState(saved).some((m) => m.includes("ghost-feature")));
});
