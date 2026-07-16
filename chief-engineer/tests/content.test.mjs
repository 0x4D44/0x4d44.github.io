import assert from "node:assert/strict";
import { SHIPS, LEVELS, EVENTS, MANUAL, TUNING } from "../content.js";

const manualIds = new Set(MANUAL.map((p) => p.id));
const eventIds = new Set(Object.keys(EVENTS));

// ---- events: structure, manual refs, intervention ordering -------------------
for (const [id, ev] of Object.entries(EVENTS)) {
  assert.ok(ev.title && ev.tile, `${id} has title+tile`);
  assert.ok(manualIds.has(ev.manual), `${id} manual page '${ev.manual}' exists`);
  assert.ok(ev.phases.length >= 1, `${id} has phases`);
  for (const ph of ev.phases) {
    assert.ok(Number.isInteger(ph.min) && ph.min >= 1, `${id}/${ph.id} min >= 1 tick`);
    const seen = new Set();
    for (const iv of ph.interventions ?? []) {
      for (const r of iv.requires ?? []) {
        assert.ok(seen.has(r), `${id}/${ph.id}/${iv.id} requires '${r}' declared earlier in order`);
      }
      seen.add(iv.id);
    }
    if (ph.effects?.spawn) assert.ok(eventIds.has(ph.effects.spawn.eventId), `${id} spawn target exists`);
    for (const iv of ph.interventions ?? []) {
      if (iv.effects?.spawn) assert.ok(eventIds.has(iv.effects.spawn.eventId), `${id} iv spawn target exists`);
    }
  }
  const last = ev.phases[ev.phases.length - 1];
  assert.ok(last.terminal || (last.interventions ?? []).length === 0 || last.interventions.some((iv) => iv.resolve),
    `${id} final phase terminates, expires, or is resolvable`);
}

// ---- levels: refs, arithmetic closure (X1), route sanity ----------------------
for (const lv of LEVELS) {
  const ship = SHIPS[lv.ship];
  assert.ok(ship, `${lv.id} ship exists`);
  const dgIds = new Set(ship.dgs.map((d) => d.id));
  const boardIds = new Set(ship.boards.map((b) => b.id));
  for (const d of ship.dgs) assert.ok(boardIds.has(d.board), `${lv.id} ${d.id} board exists`);
  const split = Object.entries(ship.propSplit ?? {});
  const splitSum = split.reduce((s, [, v]) => s + v, 0);
  assert.ok(Math.abs(splitSum - 1) < 1e-9, `${lv.id} propSplit sums to 1`);
  for (const [b] of split) assert.ok(boardIds.has(b), `${lv.id} propSplit board exists`);
  for (const id of lv.startOnline ?? []) assert.ok(dgIds.has(id), `${lv.id} startOnline ${id} exists`);
  assert.ok(lv.startFuel.HFO <= ship.tankCap.HFO && lv.startFuel.MGO <= ship.tankCap.MGO,
    `${lv.id} start fuel fits tanks`);
  assert.ok((lv.startFuel[lv.startGrade] ?? 0) > 0, `${lv.id} starts with usable fuel`);

  // N+1 closure at service speed (nominal); weather variants covered by margin
  const installed = ship.dgs.reduce((s, d) => s + d.mw, 0);
  const largest = Math.max(...ship.dgs.map((d) => d.mw));
  const svcDemand = ship.hotelMw * (lv.climateFactor ?? 1) + ship.propMw + ship.auxMw;
  assert.ok(installed - largest >= svcDemand, `${lv.id} N+1 lineup exists at service speed`);

  // bunker capacity >= nominal route burn x 1.2 (X1)
  let burnT = 0;
  for (const leg of lv.route) {
    const hrsSail = leg.distanceNm / leg.orderKn;
    const wf = { calm: 0, moderate: 0.08, rough: 0.18, storm: 0.3 }[leg.weather] ?? 0;
    const sailMw = ship.hotelMw * (lv.climateFactor ?? 1) + ship.auxMw +
      ship.propMw * Math.pow(leg.orderKn / ship.serviceKn, 3) * (1 + wf);
    burnT += (sailMw * TUNING.sfocBase * hrsSail) / 1000;
    const hrsPort = (leg.dwellMin ?? 0) / 60;
    burnT += ((ship.hotelMw * 0.9 + ship.auxMw) * TUNING.sfocBase * hrsPort) / 1000;
  }
  const capOrBunkerable = ship.tankCap.HFO + ship.tankCap.MGO;
  assert.ok(capOrBunkerable >= burnT * 1.2,
    `${lv.id} tanks (${capOrBunkerable}t) cover route burn ${burnT.toFixed(0)}t x1.2`);

  // route/deadline sanity: ideal arrival beats every deadline
  let t = 0;
  for (const leg of lv.route) {
    t += (leg.dwellMin ?? 0) + (leg.distanceNm / leg.orderKn) * 60;
    if (leg.deadlineMin != null) {
      assert.ok(t < leg.deadlineMin, `${lv.id} ${leg.toPort} ideal arrival ${Math.round(t)} beats deadline ${leg.deadlineMin}`);
    }
  }

  // objectives & script referential integrity
  const jobIds = new Set(lv.jobs.map((j) => j.id));
  const objIds = new Set(lv.objectives.map((o) => o.id));
  const checks = new Set(["dgOnline", "reserveHeld", "underway", "telegraphAcked", "arrived", "ackAll",
    "switchoverDone", "blackoutRecovered", "jobDone", "bunkered", "eventResolved", "tieOpen", "tieClosed",
    "sumpsTopped", "scrubberOn"]);
  for (const o of lv.objectives) {
    assert.ok(checks.has(o.check), `${lv.id}/${o.id} valid check`);
    if (o.check === "jobDone") assert.ok(jobIds.has(o.jobId), `${lv.id}/${o.id} job exists`);
    if (o.check === "arrived") assert.ok(o.n <= lv.route.length, `${lv.id}/${o.id} arrival leg in range`);
  }
  for (const row of lv.script ?? []) {
    if (row.event) assert.ok(eventIds.has(row.event), `${lv.id} script event ${row.event} exists`);
    if (row.componentId) assert.ok(dgIds.has(row.componentId), `${lv.id} script component ${row.componentId} exists`);
    if (row.whenObjective) assert.ok(objIds.has(row.whenObjective), `${lv.id} script objective ${row.whenObjective} exists`);
    if (row.atLeg != null) assert.ok(row.atLeg < lv.route.length, `${lv.id} script leg in range`);
  }
  for (const pool of lv.pool ?? []) {
    assert.ok(eventIds.has(pool.eventId), `${lv.id} pool event ${pool.eventId} exists`);
    assert.ok(pool.perHour > 0 && pool.perHour < 0.05, `${lv.id} pool rate sane`);
  }
  // tie objectives only on multi-board ships; scrubber objectives need a scrubber
  for (const o of lv.objectives) {
    if (o.check === "tieOpen" || o.check === "tieClosed") assert.ok(ship.boards.length > 1, `${lv.id} tie needs 2 boards`);
    if (o.check === "scrubberOn") assert.ok(ship.scrubber, `${lv.id} scrubber objective needs a scrubber`);
  }
}

// ---- level gating: ships grow, systems accumulate ------------------------------
{
  let prevPax = 0;
  for (const lv of LEVELS) {
    const ship = SHIPS[lv.ship];
    assert.ok(ship.pax > prevPax, `${lv.id} ship bigger than the last`);
    prevPax = ship.pax;
  }
}

// ---- manual: every page short and titled ---------------------------------------
for (const p of MANUAL) {
  assert.ok(p.title && p.body.length >= 2, `manual ${p.id} has content`);
  for (const para of p.body) assert.ok(para.length < 600, `manual ${p.id} paragraphs stay readable`);
}

console.log("chief-engineer content tests passed");
