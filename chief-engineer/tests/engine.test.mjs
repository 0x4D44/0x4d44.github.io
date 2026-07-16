import assert from "node:assert/strict";
import {
  createVoyage, tick, applyAction, sfoc, spinningReserve, totalDemandMw,
  stars, debrief, spawnEvent, activeAlarms, ENGINE_SCHEMA,
} from "../engine.js";
import { LEVELS, SHIPS, TUNING } from "../content.js";
import { botStep } from "./bot.mjs";

// ---- SFOC & burn arithmetic -------------------------------------------------

assert.equal(sfoc(80), TUNING.sfocBase, "SFOC optimum at 80% load");
assert.ok(sfoc(30) > sfoc(80) + 10, "SFOC worse at low load");

// L6 at service speed burns ~315 t/day (HLD X1 pin, ±20%)
{
  const s = createVoyage("L6", 7);
  for (const d of s.dgs) { d.state = "online"; }
  s.inPort = false; s.portTicksLeft = 0; s.gateOpen = true;
  s.telegraphAcked = true; s.orderedKn = 22; s.commandedKn = 22;
  const before = s.tanks.HFO + s.tanks.MGO;
  for (let i = 0; i < 120; i++) tick(s);
  const burnPerDay = ((before - (s.tanks.HFO + s.tanks.MGO)) / 120) * 1440;
  assert.ok(burnPerDay > 250 && burnPerDay < 420, `L6 burn ~315 t/day, got ${burnPerDay.toFixed(0)}`);
}

// ---- demand closure: every level holds N+1 at service speed (X1) -----------
for (const lv of LEVELS) {
  const ship = SHIPS[lv.ship];
  const installed = ship.dgs.reduce((sum, d) => sum + d.mw, 0);
  const largest = Math.max(...ship.dgs.map((d) => d.mw));
  const demand = ship.hotelMw * (lv.climateFactor ?? 1) + ship.propMw + ship.auxMw;
  assert.ok(installed - largest >= demand,
    `${lv.id}: N-1 capacity ${(installed - largest).toFixed(1)} >= service demand ${demand.toFixed(1)}`);
}

// ---- spinning reserve & overload ladder ------------------------------------
{
  const s = createVoyage("L1", 1);
  // DG1 online in port; reserve = cap - demand - largest < 0 with one machine
  assert.ok(spinningReserve(s) < 0, "single DG holds no reserve");
  applyAction(s, { type: "dg.start", id: "DG2" });
  for (let i = 0; i < 5; i++) tick(s);
  applyAction(s, { type: "breaker.close", id: "DG2" });
  tick(s);
  assert.equal(s.dgs[1].state, "online");
  assert.ok(spinningReserve(s) >= 0, "two DGs in port hold N+1");
}

// ---- blackout & recovery ----------------------------------------------------
{
  const s = createVoyage("L1", 2);
  applyAction(s, { type: "dg.stop", id: "DG1" }); // kill the only source
  tick(s);
  assert.ok(s.blackout, "dead bus with hotel demand = blackout");
  tick(s);
  assert.ok(s.emergencyGenOnline, "emergency generator picks up within a minute");
  applyAction(s, { type: "dg.start", id: "DG2" });
  for (let i = 0; i < 5; i++) tick(s);
  applyAction(s, { type: "breaker.close", id: "DG2" });
  tick(s);
  assert.equal(s.blackout, null, "closing onto dead board restores power");
  assert.ok(s.unscriptedBlackout, "unscripted blackout recorded for stars");
}

// ---- switchover -------------------------------------------------------------
{
  const s = createVoyage("L3", 3);
  assert.equal(s.fleetFuel, "HFO");
  applyAction(s, { type: "fuel.switchover", grade: "MGO" });
  assert.ok(s.switchover);
  for (let i = 0; i < TUNING.switchoverTicks + 1; i++) tick(s);
  assert.equal(s.fleetFuel, "MGO", "switchover completes after its duration");
}

// ---- ECA violation is deterministic and assessed at arrival ------------------
{
  const s = createVoyage("L3", 4);
  s.portTicksLeft = 0; // depart immediately (gateStart true)
  tick(s);
  applyAction(s, { type: "telegraph.ack" });
  for (let i = 0; i < 120; i++) tick(s); // sail the ECA leg on HFO
  assert.ok(s.ecaViolationMin > 100, "violation minutes accumulate on HFO in ECA");
}

// ---- event procedure order enforced (CO2 refused before evacuation) ---------
{
  const s = createVoyage("L5", 5);
  const inst = spawnEvent(s, "er-fire", "DG52");
  applyAction(s, { type: "event.intervene", instanceId: inst.id, interventionId: "co2" });
  assert.ok(!inst.doneInterventions.includes("co2"), "CO2 refused before the procedure");
  for (const id of ["quickclose", "vents", "dampers", "evacuate", "co2"]) {
    applyAction(s, { type: "event.intervene", instanceId: inst.id, interventionId: id });
  }
  assert.ok(s.doneEvents.some((e) => e.eventId === "er-fire" && e.outcome === "degraded"),
    "full procedure resolves the fire");
  assert.equal(s.playerFaultCasualties, 0, "a beaten fire is not a casualty");
}

// ---- scripted damage never denies the safety star (X8) -----------------------
{
  const s = createVoyage("L2", 6);
  // run the scripted drill path via effects
  spawnEvent(s, "rogue-wave", "DG1", { scripted: true });
  tick(s); tick(s); tick(s); tick(s);
  assert.equal(s.playerFaultCasualties, 0, "scripted rogue wave is not player fault");
}

// ---- alarms: raise, ack, clear ----------------------------------------------
{
  const s = createVoyage("L1", 8);
  const inst = spawnEvent(s, "seachest", "DG1");
  assert.ok(activeAlarms(s).length > 0, "event raises its annunciator tile");
  applyAction(s, { type: "alarm.ackAll" });
  assert.ok(s.alarms.every((a) => a.acked), "ACK acknowledges");
  applyAction(s, { type: "event.intervene", instanceId: inst.id, interventionId: "swap" });
  assert.ok(activeAlarms(s).every((a) => !a.tileId.startsWith("cool")), "resolved event clears its tile");
}

// ---- save/load equivalence: tick N, save, load, tick M == tick N+M (B6) ------
{
  const seed = 42;
  const a = createVoyage("L2", seed);
  for (let i = 0; i < 400; i++) { for (const act of botStep(a)) applyAction(a, act); tick(a); }
  const b = JSON.parse(JSON.stringify(a)); // snapshot round-trip
  for (let i = 0; i < 400; i++) {
    for (const act of botStep(a)) applyAction(a, act); tick(a);
    for (const act of botStep(b)) applyAction(b, act); tick(b);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)),
    "resume from snapshot is tick-exact (PRNG cursor lives in state)");
}

// ---- schema marker present ----------------------------------------------------
assert.equal(createVoyage("L1", 1).schema, ENGINE_SCHEMA);

// ---- debrief shape -------------------------------------------------------------
{
  const s = createVoyage("L1", 9);
  const d = debrief(s);
  assert.ok(d.stars && Array.isArray(d.timeline) && Array.isArray(d.chains));
}

console.log("chief-engineer engine tests passed");
