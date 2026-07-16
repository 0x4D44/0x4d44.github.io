// Deterministic playthrough bot. Consumes ONLY player-visible data:
// state selectors + the event interventions that render as the Manual's
// procedure checklists. Shared by playthrough tests; no test assertions here.

import { EVENTS, LEVELS, SHIPS } from "../content.js";
import { spinningReserve, totalDemandMw, currentLeg, projectedFuelMargin } from "../engine.js";

const ship = (state) => SHIPS[LEVELS.find((l) => l.id === state.levelId).ship];
const level = (state) => LEVELS.find((l) => l.id === state.levelId);

function propAt(state, kn, weather) {
  const s = ship(state);
  const factor = { calm: 0, moderate: 0.08, rough: 0.18, storm: 0.3 }[weather] ?? 0;
  return s.propMw * Math.pow(kn / s.serviceKn, 3) * (1 + factor);
}

function demandTarget(state) {
  const s = ship(state);
  const leg = level(state).route[state.legIndex];
  if (!leg) return 0;
  const hotel = s.hotelMw * (level(state).climateFactor ?? 1);
  return hotel + s.auxMw + propAt(state, leg.orderKn, leg.weather) + (s.thrusterMw ?? 0) * 0.3;
}

function liveBoardIds(state) {
  return new Set(state.boards.filter((b) => b.online).map((b) => b.id));
}

// One decision pass; returns a list of actions for this tick.
export function botStep(state) {
  const actions = [];
  const lv = level(state);
  const s = ship(state);
  const leg = currentLeg(state);

  // 0. acknowledge everything (UX habit; never scored)
  if (state.alarms.some((a) => a.active && !a.acked)) actions.push({ type: "alarm.ackAll" });

  // 1. events: run each active instance's current-phase checklist in order,
  //    starting >= 2 ticks into the phase (human-feasible margins).
  for (const inst of state.events) {
    const ev = EVENTS[inst.eventId];
    const ph = ev.phases[inst.phaseIndex];
    const age = ph.min - inst.ticksLeft;
    if (age < 2) continue;
    for (const iv of ph.interventions ?? []) {
      if (!inst.doneInterventions.includes(iv.id)) {
        actions.push({ type: "event.intervene", instanceId: inst.id, interventionId: iv.id });
        break;
      }
    }
  }

  // 2. blackout recovery has priority: start anything startable, close ready.
  if (state.blackout) {
    const ready = state.dgs.find((d) => d.state === "ready");
    const starting = state.dgs.some((d) => d.state === "starting");
    const startable = state.dgs.find((d) => d.state === "stopped" || d.state === "tripped");
    if (ready) actions.push({ type: "breaker.close", id: ready.id });
    else if (!starting && startable) actions.push({ type: "dg.start", id: startable.id });
    return actions;
  }

  // 3. lineup management
  const live = liveBoardIds(state);
  const online = state.dgs.filter((d) => d.state === "online");
  const capacity = online.reduce((sum, d) => sum + d.mw, 0);
  const largest = online.reduce((m, d) => Math.max(m, d.mw), 0);
  const need = Math.max(totalDemandMw(state), state.inPort || state.telegraphAcked === false ? demandTarget(state) : 0);
  const ready = state.dgs.find((d) => d.state === "ready" && live.has(d.board));
  if (ready) actions.push({ type: "breaker.close", id: ready.id });
  const wantCapacity = need + largest + 0.3;
  if (capacity < wantCapacity) {
    const starting = state.dgs.some((d) => d.state === "starting");
    const standby = state.dgs.find((d) => (d.state === "stopped" || d.state === "tripped") && live.has(d.board));
    if (!starting && standby) actions.push({ type: "dg.start", id: standby.id });
  } else if (online.length > 1) {
    // drop the smallest if the rest still hold N+1 against need
    const smallest = online.reduce((m, d) => (d.mw < m.mw ? d : m));
    const rest = online.filter((d) => d !== smallest);
    const restCap = rest.reduce((sum, d) => sum + d.mw, 0);
    const restLargest = Math.max(...rest.map((d) => d.mw));
    if (restCap >= need + restLargest + 0.5) actions.push({ type: "breaker.open", id: smallest.id });
  }
  // stop opened-but-spinning machines
  for (const d of state.dgs) {
    if (d.state === "ready" && !actions.some((a) => a.type === "breaker.close" && a.id === d.id)) {
      // leave at most one ready as hot standby; stop extras
      const readies = state.dgs.filter((x) => x.state === "ready");
      if (readies.length > 1 && readies[readies.length - 1].id === d.id) actions.push({ type: "dg.stop", id: d.id });
    }
  }

  // 4. objectives that ask for tie gymnastics (visible checklist)
  const pending = state.objectives.filter((o) => !o.done);
  if (pending.some((o) => o.check === "tieOpen")) {
    if (state.tieClosed) actions.push({ type: "tie.open" });
  } else if (state.boards.length > 1 && !state.tieClosed) {
    const anyLostBoard = state.boards.some((b) => !b.online);
    if (!anyLostBoard) actions.push({ type: "tie.close" });
  }

  // 5. telegraph & speed: answer once the plant carries the hotel with margin —
  //    the engine power-caps actual speed, so acking never overloads the bus.
  if (!state.telegraphAcked && !state.inPort) {
    const nonProp = s.hotelMw * (level(state).climateFactor ?? 1) + s.auxMw;
    if (capacity >= nonProp * 1.1 + 1) actions.push({ type: "telegraph.ack" });
  }

  // 6. fuel strategy
  const scrubberOk = s.scrubber && !state.scrubberFault;
  const inEca = !!leg?.eca && !state.inPort;
  const nextLeg = lv.route[state.legIndex + (state.inPort ? 0 : 1)];
  const minsLeftInLeg = leg && !state.inPort && state.actualKn > 0.5
    ? ((leg.distanceNm - state.legDistNm) / state.actualKn) * 60 : Infinity;
  if (s.scrubber && !state.scrubberOn && !state.scrubberFault) actions.push({ type: "scrubber.start" });
  if (!state.switchover) {
    if (inEca && state.fleetFuel === "HFO" && !(state.scrubberOn && scrubberOk)) {
      actions.push({ type: "fuel.switchover", grade: "MGO" });
    } else if (state.inPort && lv.route[state.legIndex]?.eca && state.fleetFuel === "HFO" && !scrubberOk) {
      actions.push({ type: "fuel.switchover", grade: "MGO" });
    } else if (!inEca && nextLeg?.eca && !scrubberOk && state.fleetFuel === "HFO" && minsLeftInLeg < 70) {
      actions.push({ type: "fuel.switchover", grade: "MGO" });
    } else if (state.fleetFuel === "MGO" && state.tanks.HFO > 100 &&
               (scrubberOk || (!inEca && !(nextLeg?.eca && minsLeftInLeg < 140)))) {
      // burn the cheap oil when compliant to do so
      if (!(lv.route[state.legIndex]?.eca && state.inPort && !scrubberOk)) {
        actions.push({ type: "fuel.switchover", grade: "HFO" });
      }
    }
  }

  // 7. weather preparation (current or next leg rough/storm)
  const weatherAhead = ["rough", "storm"].includes(leg?.weather) ||
    (["rough", "storm"].includes(nextLeg?.weather) && minsLeftInLeg < 240);
  if (weatherAhead) {
    if (!state.stabilizersOut && state.systems.stabilizers !== "down") actions.push({ type: "stabilizers.set", out: true });
    if (!state.securedForWeather) actions.push({ type: "weather.secure" });
  }

  // 8. jobs: keep the teams busy, critical/due first, storm-prep top-ups early
  if (state.teamsBusy < state.teams) {
    const open = state.jobs.filter((j) => j.status === "open");
    const anyStormAhead = lv.route.slice(state.legIndex).some((l) => l.weather === "storm" || l.weather === "rough");
    open.sort((a, b) => jobPriority(b, anyStormAhead, state) - jobPriority(a, anyStormAhead, state));
    if (open.length) actions.push({ type: "job.start", jobId: open[0].id });
  }

  // 9. bunkering: in a priced port, fill up (owner's account; burn is scored)
  if (state.inPort && lv.route[state.legIndex]?.bunkerPrices) {
    const spaceH = state.tankCap.HFO - state.tanks.HFO;
    const spaceM = state.tankCap.MGO - state.tanks.MGO;
    if (spaceH + spaceM > 40) actions.push({ type: "bunker.plan", hfo: spaceH, mgo: spaceM });
  }

  // 10. restore shed hotel stages when the plant is comfortable
  const stage = Math.max(...state.boards.map((b) => b.shedStage));
  if (stage > 0 && spinningReserve(state) > 0.5) actions.push({ type: "shed.set", stage: stage - 1 });

  return actions;
}

function jobPriority(j, stormAhead, state) {
  let p = 0;
  if (j.critical) p += 100;
  if (j.dueTick != null && state.tick > j.dueTick) p += 50;
  if (j.kind === "lo-topup" && stormAhead) p += 80;
  if (j.kind === "emgen-test") p += 60;
  if (j.kind === "repair") p += 90;
  return p;
}

export function runVoyage(levelId, seed, { maxTicks = 30000, applyAction, tick, createVoyage, onTick } = {}) {
  const state = createVoyage(levelId, seed);
  for (let i = 0; i < maxTicks && state.phase === "voyage"; i++) {
    for (const a of botStep(state)) applyAction(state, a);
    tick(state);
    if (onTick) onTick(state);
  }
  return state;
}
