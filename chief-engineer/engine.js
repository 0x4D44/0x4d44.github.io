// Chief Engineer — pure simulation core. No DOM. All randomness through the
// seeded PRNG whose cursor lives in state; all inputs through applyAction().
// 1 tick = 1 game-minute. See wrk_docs/2026.07.16 - HLD - chief-engineer-game.md.

import { SHIPS, LEVELS, EVENTS, TUNING } from "./content.js";

export const ENGINE_SCHEMA = 1;

// ---------------------------------------------------------------- PRNG ----
// mulberry32; the cursor lives in state.rng so saves resume deterministically.

function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------- helpers ----

const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));
export function levelById(id) {
  const level = LEVEL_BY_ID.get(id);
  if (!level) throw new Error(`unknown level ${id}`);
  return level;
}

export function shipFor(level) {
  const ship = SHIPS[level.ship];
  if (!ship) throw new Error(`unknown ship ${level.ship}`);
  return ship;
}

export function eventById(id) {
  const ev = EVENTS[id];
  if (!ev) throw new Error(`unknown event ${id}`);
  return ev;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// -------------------------------------------------------- voyage setup ----

export function createVoyage(levelId, seed) {
  const level = levelById(levelId);
  const ship = shipFor(level);
  const state = {
    schema: ENGINE_SCHEMA,
    levelId,
    seed,
    rng: seed | 0,
    tick: 0,
    clockMin: level.startClockMin ?? 8 * 60, // time of day, minutes
    day: 1,
    phase: "voyage", // voyage | complete | failed
    failReason: null,
    // position
    legIndex: 0,
    legDistNm: 0,
    inPort: true,
    portTicksLeft: level.route[0].dwellMin ?? 0,
    // orders & speed
    orderedKn: 0,
    commandedKn: 0,
    actualKn: 0,
    telegraphAcked: true,
    telegraphAnswers: 0,
    slowdownGranted: false,
    pmsAuto: false,
    // electrical
    boards: ship.boards.map((b) => ({
      id: b.id,
      online: true, // bus alive
      overloadTicks: 0,
      shedStage: 0, // 0 = nothing shed
    })),
    tieClosed: ship.boards.length > 1,
    dgs: ship.dgs.map((d) => ({
      id: d.id,
      board: d.board,
      mw: d.mw,
      state: (level.startOnline ?? []).includes(d.id) ? "online" : "stopped",
      startTicksLeft: 0,
      loadPct: 0,
      hours: d.initialHours ?? 0,
      condition: d.initialCondition ?? 100,
      sumpPct: d.initialSump ?? 80,
      fuel: level.startGrade ?? "HFO",
    })),
    emergencyGenOnline: false,
    emergencyGenTestedThisVoyage: false,
    blackout: null, // {sinceTick, restored:[sections], cause, scripted}
    blackoutCount: 0,
    unscriptedBlackout: false,
    driftTimer: null, // {ticksLeft, label} — scripted lee-shore geometry
    // fuel
    tanks: { HFO: level.startFuel.HFO, MGO: level.startFuel.MGO },
    tankCap: ship.tankCap,
    switchover: null, // {target, ticksLeft}
    fleetFuel: level.startGrade ?? "HFO", // current grade DGs burn
    scrubberOn: false,
    scrubberFault: false,
    catFinesExposure: 0, // 0-100 visible meter
    ecaViolationMin: 0,
    finesEUR: 0,
    // maintenance
    jobs: level.jobs.map((j) => ({ ...j, status: "open", ticksLeft: j.durationMin })),
    teams: ship.teams,
    teamsBusy: 0,
    // aux systems: id -> ok|degraded|down
    systems: Object.fromEntries((ship.systems ?? []).map((s) => [s, "ok"])),
    stabilizersOut: false,
    securedForWeather: false,
    // events
    nextInstanceId: 1,
    events: [], // active instances
    doneEvents: [], // {id,eventId,componentId,outcome,tick,causedBy,scripted}
    hazardCooldown: {}, // componentId -> tick after which it may roll again
    scriptCursor: 0,
    gateOpen: level.gateStart ?? true, // voyage-script gates (L1-2)
    poolArmed: false, // commissioning rule
    // alarms
    alarms: [], // {id,tileId,text,severity,tick,acked,active}
    alarmSeq: 0,
    newAlarmThisTick: false,
    // score inputs
    comfort: 100,
    comfortSum: 0,
    comfortSamples: 0,
    lateMin: 0,
    budget: level.budget,
    spentFuel: 0,
    spentParts: 0,
    playerFaultCasualties: 0,
    log: [], // {tick,clock,text,kind}
    timeline: [], // compact debrief moments
    objectives: level.objectives.map((o) => ({ ...o, done: false })),
  };
  logLine(state, `Signed on as Chief Engineer, ${ship.name}.`, "info");
  return state;
}

// ----------------------------------------------------------- log/alarm ----

export function fmtClock(state) {
  const m = state.clockMin % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `D${state.day} ${hh}:${mm}`;
}

function logLine(state, text, kind = "info") {
  state.log.push({ tick: state.tick, clock: fmtClock(state), text, kind });
  if (state.log.length > 1500) state.log.splice(0, 500); // UI shows a window; saves stay bounded
}

function timelineMark(state, text) {
  if (state.timeline.length < 400) state.timeline.push({ tick: state.tick, clock: fmtClock(state), text });
}

function raiseAlarm(state, tileId, text, severity, component = null) {
  // one active alarm per tile+component+text; component is structured data,
  // never parsed back out of a string (review: regex-routing contract smell)
  const existing = state.alarms.find((a) => a.tileId === tileId && a.component === component && a.text === text && a.active);
  if (existing) return existing;
  const alarm = { id: ++state.alarmSeq, tileId, component, text, severity, tick: state.tick, acked: false, active: true };
  state.alarms.push(alarm);
  state.newAlarmThisTick = true;
  logLine(state, `${severity === "red" ? "ALARM" : "WARN"}: ${text}`, severity === "red" ? "alarm" : "warn");
  return alarm;
}

function clearAlarm(state, tileId, text, component) {
  for (const a of state.alarms) {
    if (a.tileId === tileId && a.active &&
        (text === undefined || a.text === text) &&
        (component === undefined || a.component === component)) a.active = false;
  }
}

// ------------------------------------------------------------ electrical --

// Boards joined by a closed tie act as one island. Returns array of islands,
// each { boards:[boardObj], dgs:[dg], capacityMw }.
export function islands(state) {
  const groups = [];
  if (state.boards.length === 1 || state.tieClosed) {
    groups.push(state.boards.filter((b) => b.online));
  } else {
    for (const b of state.boards) if (b.online) groups.push([b]);
  }
  return groups
    .filter((g) => g.length)
    .map((g) => {
      const ids = new Set(g.map((b) => b.id));
      const dgs = state.dgs.filter((d) => ids.has(d.board) && d.state === "online");
      return { boards: g, boardIds: ids, dgs, capacityMw: dgs.reduce((s, d) => s + d.mw, 0) };
    });
}

export function hotelDemandMw(state) {
  const level = levelById(state.levelId);
  const ship = shipFor(level);
  // day/night sine: peak 10:00-22:00, trough at night
  const t = (state.clockMin % 1440) / 1440;
  const diurnal = 0.85 + 0.15 * Math.sin((t - 0.29) * 2 * Math.PI);
  let mw = ship.hotelMw * diurnal * (level.climateFactor ?? 1);
  // shed stages reduce hotel demand (max stage over boards feeding hotel)
  const stage = Math.max(...state.boards.map((b) => b.shedStage));
  mw *= [1, 0.85, 0.65, 0.45][clamp(stage, 0, 3)];
  if (state.systems.chillers === "down") mw *= 0.88; // chillers offline draw nothing
  return mw;
}

// The cube law, in ONE place — the engine, the bot and the content oracle all
// use this (a re-typed copy would silently stop testing the real sim).
export function propDemandMw(ship, kn, weather) {
  const frac = kn / ship.serviceKn;
  return ship.propMw * frac * frac * frac * (1 + (TUNING.weatherPropFactor[weather] ?? 0));
}

export function propulsionDemandMw(state) {
  if (state.inPort || state.actualKn <= 0) return 0;
  const leg = currentLeg(state);
  return propDemandMw(shipFor(levelById(state.levelId)), state.actualKn, leg?.weather);
}

export function auxDemandMw(state) {
  const ship = shipFor(levelById(state.levelId));
  let mw = ship.auxMw;
  if (state.scrubberOn) mw += ship.propMw * 0.015 + ship.hotelMw * 0.01;
  if (state.inPort === false && state.legDistNm < 2) mw += ship.thrusterMw ?? 0; // manoeuvring
  return mw;
}

export function totalDemandMw(state) {
  return hotelDemandMw(state) + propulsionDemandMw(state) + auxDemandMw(state);
}

// Hotel + aux load carried by an island (split evenly across live boards).
function hotelAuxShareMw(state, island) {
  const liveBoards = state.boards.filter((b) => b.online).length || 1;
  return (hotelDemandMw(state) + auxDemandMw(state)) / liveBoards * island.boards.length;
}

// Demand assigned to an island: propulsion splits across LIVE boards
// (renormalized — pods cross-feed when a board is lost), hotel/aux split
// evenly across live boards.
function islandDemandMw(state, island) {
  const ship = shipFor(levelById(state.levelId));
  const live = state.boards.filter((b) => b.online);
  const prop = propulsionDemandMw(state);
  const share = (b) => ship.propSplit?.[b.id] ?? 1 / state.boards.length;
  const liveTotal = live.reduce((s, b) => s + share(b), 0) || 1;
  let propShare = 0;
  for (const b of island.boards) propShare += (share(b) / liveTotal) * prop;
  return hotelAuxShareMw(state, island) + propShare;
}

export function spinningReserve(state) {
  // worst island: capacity - demand - largest unit
  let worst = Infinity;
  for (const isl of islands(state)) {
    const demand = islandDemandMw(state, isl);
    const largest = isl.dgs.reduce((m, d) => Math.max(m, d.mw), 0);
    worst = Math.min(worst, isl.capacityMw - demand - largest);
  }
  return worst === Infinity ? 0 : worst;
}

function stepElectrical(state) {
  const ship = shipFor(levelById(state.levelId));
  let anyBlackout = false;
  let anyOverloaded = false;
  for (const isl of islands(state)) {
    const demand = islandDemandMw(state, isl);
    const cap = isl.capacityMw;
    const boards = isl.boards;
    if (cap <= 0 && demand > 0.05) {
      // island dead with load required
      for (const b of boards) triggerBoardBlackout(state, b, "no generation online");
      anyBlackout = true;
      continue;
    }
    const loadPct = cap > 0 ? (demand / cap) * 100 : 0;
    for (const d of isl.dgs) d.loadPct = loadPct;
    if (loadPct > 100) {
      anyOverloaded = true;
      for (const b of boards) b.overloadTicks += 1;
      const over = Math.max(...boards.map((b) => b.overloadTicks));
      raiseAlarm(state, "bus-overload", `MAIN BUS OVERLOAD ${boards.map((b) => b.id).join("+")}`, "red");
      // preferential tripping ladder: shed a stage automatically each 2 ticks
      if (over % TUNING.shedEveryTicks === 0) {
        const b = boards.find((x) => x.shedStage < 3);
        if (b) {
          for (const bb of boards) bb.shedStage = Math.min(3, Math.max(bb.shedStage, b.shedStage + 1));
          logLine(state, `Preferential trip: hotel shed stage ${boards[0].shedStage}`, "warn");
        }
      }
      if (over >= TUNING.overloadTripTicks) {
        for (const b of boards) triggerBoardBlackout(state, b, "sustained overload");
        anyBlackout = true;
      }
    } else if (loadPct > 97) {
      anyOverloaded = true; // still hot: keep the alarm latched
      for (const b of boards) b.overloadTicks = 0;
    } else {
      for (const b of boards) b.overloadTicks = 0;
    }
  }
  // clear the shared tile only when EVERY island is healthy (a healthy island
  // must not wipe the alarm an overloaded island just raised)
  if (!anyOverloaded) clearAlarm(state, "bus-overload");
  const reserve = spinningReserve(state);
  if (!state.inPort && reserve < 0 && !state.blackout) {
    raiseAlarm(state, "reserve", "SPINNING RESERVE LOST (N+1 NOT HELD)", "amber");
  } else {
    clearAlarm(state, "reserve");
  }
  if (anyBlackout && !state.blackout) beginBlackout(state);
}

function triggerBoardBlackout(state, board, cause) {
  if (!board.online) return;
  board.online = false;
  for (const d of state.dgs) {
    if (d.board === board.id && d.state === "online") {
      d.state = "tripped";
      d.loadPct = 0;
    }
  }
  raiseAlarm(state, "board", `SWITCHBOARD ${board.id} BLACKOUT — ${cause.toUpperCase()}`, "red", board.id);
  timelineMark(state, `Board ${board.id} lost: ${cause}`);
}

function beginBlackout(state, { scripted = false, cause = "bus collapse" } = {}) {
  const allDead = state.boards.every((b) => !b.online);
  if (!allDead) return; // partial: healthy board carries on
  state.blackout = { sinceTick: state.tick, cause, scripted };
  state.blackoutCount += 1;
  if (!scripted) state.unscriptedBlackout = true;
  state.actualKn = 0;
  raiseAlarm(state, "blackout", "DEAD SHIP — TOTAL LOSS OF POWER", "red");
  timelineMark(state, `BLACKOUT — ${cause}`);
  const leg = currentLeg(state);
  if (leg?.drift && !state.inPort) {
    state.driftTimer = { ticksLeft: leg.drift.min, label: leg.drift.label };
    logLine(state, `Ship drifting — ${leg.drift.label}`, "alarm");
  }
}

function stepBlackout(state) {
  const bo = state.blackout;
  if (!bo) return;
  if (!state.emergencyGenOnline && state.tick - bo.sinceTick >= 1) {
    state.emergencyGenOnline = true;
    logLine(state, "Emergency generator started and on load (essential bus).", "info");
  }
  // recovery: any board back online with a DG ends the blackout
  const alive = state.boards.some((b) => b.online) && state.dgs.some((d) => d.state === "online");
  if (alive) {
    state.blackout = null;
    state.emergencyGenOnline = false;
    clearAlarm(state, "blackout");
    state.driftTimer = null;
    logLine(state, "Power restored. Blackout over.", "info");
    timelineMark(state, "Power restored");
    return;
  }
  if (state.driftTimer) {
    state.driftTimer.ticksLeft -= 1;
    if (state.driftTimer.ticksLeft <= 0) {
      failVoyage(state, `Drifted aground — ${state.driftTimer.label}`);
    }
  }
  state.comfort = clamp(state.comfort - 0.4, 0, 100);
}

function failVoyage(state, reason) {
  if (state.phase !== "voyage") return;
  state.phase = "failed";
  state.failReason = reason;
  timelineMark(state, `VOYAGE LOST — ${reason}`);
}

// ------------------------------------------------------------------ fuel --

export function sfoc(loadPct) {
  const l = clamp(loadPct / 100, 0.05, 1.1);
  return TUNING.sfocBase + TUNING.sfocCurve * (l - 0.8) * (l - 0.8) * 100; // g/kWh
}

function stepFuel(state) {
  let burnT = 0;
  for (const d of state.dgs) {
    if (d.state !== "online" || d.loadPct <= 0) continue;
    const kw = d.mw * 1000 * (d.loadPct / 100);
    burnT += (kw * sfoc(d.loadPct)) / 60e6; // tonnes this minute
    d.hours += 1 / 60;
    // condition wear: base + cat fines + overdue
    let wear = TUNING.baseWearPerHour / 60;
    if (d.fuel === "HFO" && state.catFinesExposure > 40) wear *= 3;
    d.condition = clamp(d.condition - wear, 0, 100);
    // sump slowly falls
    d.sumpPct = clamp(d.sumpPct - TUNING.sumpFallPerHour / 60, 0, 100);
  }
  const grade = state.fleetFuel;
  state.tanks[grade] = Math.max(0, state.tanks[grade] - burnT);
  state.spentFuel += burnT * (grade === "HFO" ? TUNING.priceHFO : TUNING.priceMGO) / 1000;
  if (state.tanks[grade] <= 0 && burnT > 0) {
    raiseAlarm(state, "fuel", `${grade} SERVICE TANKS EMPTY`, "red");
    // fuel starvation: trip everything on that grade
    for (const d of state.dgs) {
      if (d.state === "online" && d.fuel === grade) {
        d.state = "tripped";
        logLine(state, `${d.id} stopped — fuel starvation.`, "alarm");
      }
    }
  } else if (state.tanks[grade] > 1) {
    clearAlarm(state, "fuel", `${grade} SERVICE TANKS EMPTY`);
  }
  // low-fuel warning at < 15% of remaining route need
  // switchover progress
  if (state.switchover) {
    state.switchover.ticksLeft -= 1;
    if (state.switchover.ticksLeft <= 0) {
      state.fleetFuel = state.switchover.target;
      for (const d of state.dgs) d.fuel = state.switchover.target;
      logLine(state, `Fuel switchover complete — plant now on ${state.fleetFuel}.`, "info");
      state.switchover = null;
    }
  }
  // ECA compliance (deterministic)
  const leg = currentLeg(state);
  if (leg?.eca && !state.inPort) {
    const compliant = state.fleetFuel === "MGO" || (state.scrubberOn && !state.scrubberFault);
    if (!compliant) {
      state.ecaViolationMin += 1;
      if (state.ecaViolationMin === 1) raiseAlarm(state, "eca", "ECA NON-COMPLIANT — HFO WITHOUT SCRUBBER", "amber");
    } else {
      clearAlarm(state, "eca");
    }
  } else {
    clearAlarm(state, "eca");
  }
  // purifier & cat fines
  if (state.fleetFuel === "HFO") {
    const purOk = state.systems.purifier === "ok";
    state.catFinesExposure = clamp(state.catFinesExposure + (purOk ? -TUNING.catFinesRecover : TUNING.catFinesRise) / 60, 0, 100);
    if (state.catFinesExposure > 70) raiseAlarm(state, "catfines", "FUEL QUALITY — CAT FINES AT ENGINE INLET HIGH", "amber");
    else clearAlarm(state, "catfines");
  } else {
    state.catFinesExposure = clamp(state.catFinesExposure - TUNING.catFinesRecover / 60, 0, 100);
    clearAlarm(state, "catfines");
  }
}

// Projected fuel margin at arrival (tonnes), the live economy needle.
// Counts ONLY the grade the plant is burning — the other tank is unusable
// until a switchover, and blending them hides an empty service tank.
export function projectedFuelMargin(state) {
  const level = levelById(state.levelId);
  const remainingNm = level.route.slice(state.legIndex).reduce((s, l) => s + l.distanceNm, 0) - state.legDistNm;
  const kn = Math.max(state.actualKn, 8);
  const hoursLeft = remainingNm / kn;
  const demand = totalDemandMw(state);
  const tPerH = (demand * 1000 * sfoc(80)) / 1e6;
  const need = tPerH * hoursLeft;
  return (state.tanks[state.fleetFuel] ?? 0) - need;
}

// ------------------------------------------------------------- position --

export function currentLeg(state) {
  return levelById(state.levelId).route[state.legIndex] ?? null;
}

function stepPosition(state) {
  const level = levelById(state.levelId);
  const leg = currentLeg(state);
  if (!leg) return;
  if (state.inPort) {
    if (state.portTicksLeft > 0) {
      state.portTicksLeft -= 1;
      return;
    }
    if (!state.gateOpen) return; // L1-2 tutorial gate holds departure
    // depart
    state.inPort = false;
    state.orderedKn = leg.orderKn;
    state.telegraphAcked = false;
    logLine(state, `Bridge: "${leg.fromPort}" departure — telegraph ${leg.orderKn} knots to ${leg.toPort}.`, "bridge");
    return;
  }
  // at sea: actual speed = min(commanded, power-limited). The inversion must
  // include the weather factor or the chosen speed demands more MW than the
  // bus can give (overload/shed oscillation).
  const ship = shipFor(levelById(state.levelId));
  const target = state.telegraphAcked ? state.commandedKn : 0;
  const wf = 1 + (TUNING.weatherPropFactor[leg.weather] ?? 0);
  const propBoards = state.boards.filter((b) => b.online);
  let maxKn = propBoards.length === 0 ? 0
    : ship.serviceKn * Math.cbrt(availablePropMw(state) / (ship.propMw * wf));
  if (state.blackout) maxKn = 0;
  state.actualKn = clamp(Math.min(target, maxKn), 0, ship.maxKn ?? ship.serviceKn + 2);
  state.legDistNm += state.actualKn / 60;
  if (state.legDistNm >= leg.distanceNm) {
    // arrive
    if (leg.deadlineMin != null) {
      const late = state.tick - leg.deadlineMin;
      if (late > 0) state.lateMin += late;
    }
    state.legIndex += 1;
    state.legDistNm = 0;
    state.actualKn = 0;
    state.commandedKn = 0;
    state.orderedKn = 0;
    if (leg.psc) runPortInspection(state, leg);
    else assessEcaFines(state, leg);
    if (state.legIndex >= level.route.length) {
      state.phase = "complete";
      timelineMark(state, `All fast at ${leg.toPort}. Voyage complete.`);
      logLine(state, `Arrived ${leg.toPort}. Finished with engines.`, "info");
    } else {
      state.inPort = true;
      state.portTicksLeft = level.route[state.legIndex].dwellMin ?? 0;
      logLine(state, `Alongside in ${leg.toPort}.`, "info");
      timelineMark(state, `Arrived ${leg.toPort}`);
    }
  }
}

function availablePropMw(state) {
  // MW left for propulsion after hotel+aux, across live islands
  let avail = 0;
  for (const isl of islands(state)) {
    avail += Math.max(0, isl.capacityMw * 0.98 - hotelAuxShareMw(state, isl));
  }
  return Math.min(avail, shipFor(levelById(state.levelId)).propMw);
}

// ECA violation-hours are deterministic and assessed at EVERY arrival — the
// manual promises "logged and fined at the next port", PSC leg or not.
function assessEcaFines(state, leg) {
  if (state.ecaViolationMin <= 0) return;
  const fine = state.ecaViolationMin * TUNING.ecaFinePerMin;
  state.finesEUR += fine;
  logLine(state, `Flag state notice (${leg.toPort}): ${(state.ecaViolationMin / 60).toFixed(1)}h ECA non-compliance logged — fine €${fine.toLocaleString()}.`, "warn");
  timelineMark(state, `ECA fine €${fine.toLocaleString()} at ${leg.toPort}`);
  state.ecaViolationMin = 0;
}

// PSC inspection (L5/L6): checklist audit of existing state at arrival of a
// leg flagged psc (inspection port = leg.toPort).
function runPortInspection(state, leg) {
  const deficiencies = [];
  if (!state.emergencyGenTestedThisVoyage) deficiencies.push("Emergency generator not tested this voyage");
  const overdue = state.jobs.filter((j) => j.status === "open" && j.critical && state.tick > (j.dueTick ?? Infinity));
  if (overdue.length) deficiencies.push(`${overdue.length} overdue critical maintenance job(s)`);
  if (state.ecaViolationMin > 0) deficiencies.push(`${Math.round(state.ecaViolationMin / 60)}h ECA non-compliance recorded`);
  if (state.catFinesExposure > 70) deficiencies.push("Fuel treatment plant in poor order");
  const fine = deficiencies.length * TUNING.pscFinePerDeficiency;
  state.finesEUR += fine + state.ecaViolationMin * TUNING.ecaFinePerMin;
  state.ecaViolationMin = 0; // assessed
  if (deficiencies.length === 0) {
    logLine(state, `Port State Control (${leg.toPort}): no deficiencies. Clean report.`, "info");
  } else {
    logLine(state, `Port State Control (${leg.toPort}): ${deficiencies.length} deficiencies — ${deficiencies.join("; ")}. Fine €${fine.toLocaleString()}.`, "warn");
    timelineMark(state, `PSC: ${deficiencies.length} deficiencies`);
    if (leg.pscDetains && deficiencies.length >= 3) {
      state.lateMin += 24 * 60;
      logLine(state, "Ship DETAINED 24h pending rectification.", "alarm");
    }
  }
}

// -------------------------------------------------------------- weather --

function stepWeather(state) {
  const leg = currentLeg(state);
  if (!leg || state.inPort) return;
  const w = leg.weather;
  const heavyRolling = w === "storm" || (w === "rough" && !state.stabilizersOut);
  if (w === "rough" || w === "storm") {
    const finsWork = state.stabilizersOut && state.systems.stabilizers !== "down" && state.actualKn >= 8;
    const protection = (finsWork ? 0.5 : 1) * (state.securedForWeather ? 0.7 : 1);
    state.comfort = clamp(state.comfort - TUNING.weatherComfortDrain[w] * protection, 0, 100);
  }
  // Viking-Sky sloshing: low sumps in heavy rolling trip DGs
  for (const d of state.dgs) {
    const exposed = heavyRolling && d.state === "online" && d.sumpPct < TUNING.sumpSloshThreshold;
    if (exposed) {
      raiseAlarm(state, "dg", `${d.id} LO PRESS FLUCTUATING — SUMP LOW IN HEAVY ROLLING`, "amber", d.id);
      if (rand(state) < TUNING.sloshTripChancePerMin) {
        d.state = "tripped";
        d.loadPct = 0;
        raiseAlarm(state, "dg", `${d.id} LO PRESS LOW — AUTO SHUTDOWN`, "red", d.id);
        timelineMark(state, `${d.id} tripped: LO suction lost rolling (sump ${Math.round(d.sumpPct)}%)`);
      }
    } else if (d.state === "online") {
      // condition passed (topped up, weather eased, fins out): clear the warning
      clearAlarm(state, "dg", `${d.id} LO PRESS FLUCTUATING — SUMP LOW IN HEAVY ROLLING`, d.id);
    }
  }
}

// ---------------------------------------------------------------- events --

function activeInstance(state, eventId, componentId) {
  return state.events.find((e) => e.eventId === eventId && e.componentId === componentId);
}

export function spawnEvent(state, eventId, componentId = null, { scripted = false, causedBy = null } = {}) {
  if (activeInstance(state, eventId, componentId)) return null;
  const ev = eventById(eventId);
  const inst = {
    id: state.nextInstanceId++,
    eventId,
    componentId,
    phaseIndex: 0,
    ticksLeft: ev.phases[0].min,
    scripted,
    causedBy,
    doneInterventions: [],
  };
  state.events.push(inst);
  applyPhaseEntry(state, inst);
  return inst;
}

function phaseOf(inst) {
  return eventById(inst.eventId).phases[inst.phaseIndex];
}

function applyPhaseEntry(state, inst) {
  const ev = eventById(inst.eventId);
  const ph = phaseOf(inst);
  const label = (ph.text ?? ev.title).replaceAll("{c}", inst.componentId ?? "");
  if (ph.severity && ph.severity !== "none") {
    raiseAlarm(state, ev.tile, label, ph.severity, inst.componentId);
  } else {
    logLine(state, label, "info");
  }
  if (ph.effects) applyEffects(state, inst, ph.effects);
  if (ph.terminal) {
    // casualty phase reached
    if (!inst.scripted) state.playerFaultCasualties += 1;
    timelineMark(state, `${ev.title}${inst.componentId ? ` (${inst.componentId})` : ""} → ${ph.id}`);
  }
}

function boardOfComponent(state, c) {
  const d = state.dgs.find((x) => x.id === c);
  if (d) return state.boards.find((b) => b.id === d.board);
  return state.boards.find((b) => b.id === c) ?? state.boards[0];
}

function applyEffects(state, inst, fx) {
  const c = inst.componentId;
  if (fx.tripDg && c) {
    const d = state.dgs.find((x) => x.id === c);
    if (d && (d.state === "online" || d.state === "ready" || d.state === "starting")) {
      d.state = "tripped"; d.loadPct = 0;
    }
  }
  if (fx.damageDg && c) {
    const d = state.dgs.find((x) => x.id === c);
    if (d) { d.state = "repair"; d.loadPct = 0; d.condition = Math.min(d.condition, fx.damageDg); }
  }
  if (fx.system) state.systems[fx.system.id] = fx.system.to;
  if (fx.addJob) {
    const spec = fx.addJob;
    state.jobs.push({
      id: `evjob-${inst.id}-${state.jobs.length}`,
      title: spec.title.replaceAll("{c}", c ?? ""),
      kind: spec.kind, component: spec.component ?? c, system: spec.system,
      scrubber: spec.scrubber, conditionGain: spec.conditionGain,
      durationMin: spec.durationMin, partsCost: spec.partsCost ?? 0,
      critical: spec.critical ?? false, status: "open", ticksLeft: spec.durationMin,
    });
  }
  if (fx.scrubberFault) { state.scrubberFault = true; state.scrubberOn = false; }
  if (fx.fireOut) {
    // fire beaten in time: the affected board's machines trip and need checks,
    // but cables survive.
    const b = boardOfComponent(state, c);
    for (const d of state.dgs) {
      if (d.board === b.id && (d.state === "online" || d.state === "ready")) {
        d.state = "stopped"; d.loadPct = 0;
        d.condition = clamp(d.condition - 8, 0, 100);
      }
    }
    state.spentParts += 10;
  }
  // loseBoard: true derives the board from the component; a string names it
  if (fx.loseBoard) doLoseBoard(state, inst, fx.loseBoard === true ? boardOfComponent(state, c).id : fx.loseBoard);
  if (fx.blackout) induceBlackout(state, { scripted: inst.scripted, cause: fx.blackout });
  if (fx.rogue) {
    const prepared = state.securedForWeather && state.stabilizersOut && state.systems.stabilizers !== "down";
    state.comfort = clamp(state.comfort - (prepared ? 8 : 18), 0, 100);
    if (c) {
      const d = state.dgs.find((x) => x.id === c);
      if (d && d.state === "online") { d.state = "tripped"; d.loadPct = 0; }
    }
    logLine(state, prepared
      ? "Rogue sea taken on the bow — secured plant held; one machine tripped on the roll."
      : "Rogue sea — unsecured gear flew, alarms across the board.", "alarm");
    if (!prepared) spawnEvent(state, "bilge-leak", null, { scripted: false, causedBy: inst.id });
    timelineMark(state, prepared ? "Rogue wave — plant secured, minor upset" : "Rogue wave — plant unsecured, damage below");
  }
  if (fx.playerFault) state.playerFaultCasualties += 1;
  if (fx.comfort) state.comfort = clamp(state.comfort + fx.comfort, 0, 100);
  if (fx.parts) { state.spentParts += fx.parts; }
  if (fx.fuelLossT) state.tanks.HFO = Math.max(0, state.tanks.HFO - fx.fuelLossT);
  if (fx.fine) state.finesEUR += fx.fine;
  if (fx.catFines) state.catFinesExposure = clamp(state.catFinesExposure + fx.catFines, 0, 100);
  if (fx.spawn) spawnEvent(state, fx.spawn.eventId, fx.spawn.componentId ?? c, { scripted: inst.scripted, causedBy: inst.id });
  if (fx.failVoyage) failVoyage(state, fx.failVoyage);
  if (fx.log) logLine(state, fx.log.replaceAll("{c}", c ?? ""), "warn");
}

// Trip every board and machine — the drill and the fx.blackout effect share this.
function induceBlackout(state, { scripted, cause }) {
  for (const b of state.boards) triggerBoardBlackout(state, b, cause);
  for (const d of state.dgs) if (d.state === "online") { d.state = "tripped"; }
  beginBlackout(state, { scripted, cause });
}

function doLoseBoard(state, inst, boardId) {
  state.tieClosed = false;
  const b = state.boards.find((x) => x.id === boardId);
  if (b) triggerBoardBlackout(state, b, "engine room fire — cable runs destroyed");
  for (const d of state.dgs) {
    if (d.board === boardId) { d.state = "repair"; d.loadPct = 0; }
  }
  if (state.boards.every((x) => !x.online)) {
    beginBlackout(state, { scripted: inst.scripted, cause: "fire took the last switchboard" });
  }
}

function resolveInstance(state, inst, outcome) {
  state.events = state.events.filter((e) => e !== inst);
  state.doneEvents.push({
    id: inst.id, eventId: inst.eventId, componentId: inst.componentId,
    outcome, tick: state.tick, causedBy: inst.causedBy, scripted: inst.scripted,
  });
  const ev = eventById(inst.eventId);
  clearAlarm(state, ev.tile, undefined, inst.componentId);
}

function stepEvents(state) {
  for (const inst of [...state.events]) {
    const ev = eventById(inst.eventId);
    inst.ticksLeft -= 1;
    if (inst.ticksLeft > 0) continue;
    // phase expires: escalate or resolve
    const ph = phaseOf(inst);
    if (ph.terminal || inst.phaseIndex >= ev.phases.length - 1) {
      resolveInstance(state, inst, ph.terminal ? "casualty" : "expired");
      continue;
    }
    inst.phaseIndex += 1;
    inst.ticksLeft = phaseOf(inst).min;
    applyPhaseEntry(state, inst);
  }
}

function stepHazards(state) {
  const level = levelById(state.levelId);
  if (!state.poolArmed || state.blackout) return;
  const cap = level.maxConcurrent ?? 1;
  const unscripted = state.events.filter((e) => !e.scripted).length;
  if (unscripted >= cap) return;
  for (const pool of level.pool ?? []) {
    const compIds = poolComponents(state, pool);
    for (const comp of compIds) {
      const key = `${pool.eventId}:${comp ?? "-"}`;
      if ((state.hazardCooldown[key] ?? 0) > state.tick) continue;
      state.hazardCooldown[key] = state.tick + 60; // roll at most hourly
      let p = pool.perHour; // rolls happen at most hourly, so this IS the per-roll rate
      p *= hazardMultiplier(state, pool, comp);
      if (rand(state) < p) {
        spawnEvent(state, pool.eventId, comp);
        return; // at most one new unscripted event per tick
      }
    }
  }
}

function poolComponents(state, pool) {
  if (pool.per === "dg") return state.dgs.filter((d) => d.state === "online").map((d) => d.id);
  if (pool.per === "system") return [pool.componentId];
  return [null];
}

function hazardMultiplier(state, pool, comp) {
  let m = 1;
  const level = levelById(state.levelId);
  if (pool.per === "dg") {
    const d = state.dgs.find((x) => x.id === comp);
    if (d) {
      if (d.condition < 50) m *= 3; else if (d.condition < 75) m *= 1.6;
      const overdue = state.jobs.some((j) => j.status === "open" && j.component === comp && state.tick > (j.dueTick ?? Infinity));
      if (overdue) m *= 2.5;
    }
  }
  const leg = currentLeg(state);
  if (leg && (leg.weather === "rough" || leg.weather === "storm")) m *= 1.5;
  if (state.catFinesExposure > 70 && pool.catFinesSensitive) m *= 3;
  return m;
}

// ------------------------------------------------------------ jobs/teams --

function stepJobs(state) {
  for (const j of state.jobs) {
    if (j.status !== "running") continue;
    j.ticksLeft -= 1;
    if (j.ticksLeft <= 0) {
      j.status = "done";
      state.teamsBusy -= 1;
      applyJobEffects(state, j);
      logLine(state, `Job complete: ${j.title}.`, "info");
    }
  }
}

function applyJobEffects(state, j) {
  if (j.kind === "lo-topup") {
    const d = state.dgs.find((x) => x.id === j.component);
    if (d) d.sumpPct = 90;
  } else if (j.kind === "emgen-test") {
    state.emergencyGenTestedThisVoyage = true;
  } else if (j.kind === "service") {
    const d = state.dgs.find((x) => x.id === j.component);
    if (d) d.condition = clamp(d.condition + (j.conditionGain ?? 25), 0, 100);
    if (j.system) state.systems[j.system] = "ok";
  } else if (j.kind === "repair") {
    const d = state.dgs.find((x) => x.id === j.component);
    if (d && d.state === "repair") { d.state = "stopped"; d.condition = Math.max(d.condition, 60); }
    if (j.system) state.systems[j.system] = "ok";
    if (j.scrubber) state.scrubberFault = false;
  }
  state.spentParts += j.partsCost ?? 0;
}

// --------------------------------------------------------------- comfort --

function stepComfort(state) {
  let drain = 0;
  const stage = Math.max(...state.boards.map((b) => b.shedStage));
  drain += [0, 0.03, 0.1, 0.25][clamp(stage, 0, 3)];
  if (state.systems.chillers === "down") drain += levelById(state.levelId).tropical ? 0.5 : 0.15;
  if (state.systems.sewage === "down") drain += 0.6;
  if (state.systems.freshwater === "down") drain += 0.25;
  if (drain === 0 && !state.blackout) state.comfort = clamp(state.comfort + 0.05, 0, 100);
  else state.comfort = clamp(state.comfort - drain, 0, 100);
  state.comfortSum += state.comfort;
  state.comfortSamples += 1;
}

// ---------------------------------------------------------- voyage script --

function stepScript(state) {
  const level = levelById(state.levelId);
  const script = level.script ?? [];
  while (state.scriptCursor < script.length) {
    const row = script[state.scriptCursor];
    if (!scriptRowReady(state, row)) break;
    state.scriptCursor += 1;
    runScriptRow(state, row);
  }
  latchObjectives(state);
  if (!(level.script ?? []).some((r) => r.armsPool) && !state.objectives.some((o) => o.armsPool)) {
    state.poolArmed = true; // no commissioning gate declared → pool armed
  }
}

function latchObjectives(state) {
  for (const o of state.objectives) {
    if (o.done) continue;
    // ordered objectives: don't latch (even vacuously) before the predecessor
    if (o.after && !state.objectives.find((x) => x.id === o.after)?.done) continue;
    if (objectiveMet(state, o)) {
      o.done = true;
      logLine(state, `Objective complete: ${o.text}`, "objective");
      if (o.opensGate) state.gateOpen = true;
      if (o.armsPool) state.poolArmed = true;
    }
  }
}

function scriptRowReady(state, row) {
  if (row.atTick != null) return state.tick >= row.atTick;
  if (row.atLeg != null) return state.legIndex > row.atLeg || (state.legIndex === row.atLeg && state.legDistNm >= (row.atNm ?? 0) && !state.inPort);
  if (row.whenObjective != null) return state.objectives.find((o) => o.id === row.whenObjective)?.done;
  if (row.whenInPort != null) return state.inPort && state.legIndex === row.whenInPort;
  return true;
}

function runScriptRow(state, row) {
  if (row.mentor) logLine(state, `Voss: ${row.mentor}`, "mentor");
  if (row.bridge) logLine(state, `Bridge: ${row.bridge}`, "bridge");
  if (row.event) spawnEvent(state, row.event, row.componentId ?? null, { scripted: true });
  if (row.closeGate) state.gateOpen = false;
  if (row.armsPool) state.poolArmed = true;
  if (row.weatherWarn) logLine(state, `Weather routing: ${row.weatherWarn}`, "bridge");
  if (row.drill) induceBlackout(state, { scripted: true, cause: "scheduled blackout drill" });
}

function objectiveMet(state, o) {
  switch (o.check) {
    case "dgOnline": return state.dgs.filter((d) => d.state === "online").length >= o.n;
    case "reserveHeld": return spinningReserve(state) >= 0 && state.dgs.filter((d) => d.state === "online").length >= (o.n ?? 2);
    case "underway": return !state.inPort && state.actualKn > 1;
    case "telegraphAcked": return state.telegraphAnswers > 0;
    case "arrived": return state.legIndex >= o.n;
    case "ackAll": return state.alarms.length > 0 && state.alarms.every((a) => !a.active || a.acked);
    case "switchoverDone": return state.fleetFuel === o.grade;
    case "blackoutRecovered": return state.blackoutCount > 0 && !state.blackout;
    case "jobDone": return state.jobs.some((j) => j.id === o.jobId && j.status === "done");
    case "bunkered": return state.tanks.HFO + state.tanks.MGO >= o.tonnes;
    case "eventResolved": return state.doneEvents.some((e) => e.eventId === o.eventId && e.outcome !== "casualty");
    case "tieOpen": return !state.tieClosed;
    case "tieClosed": return state.tieClosed;
    case "sumpsTopped": return state.dgs.every((d) => d.sumpPct >= 60 || d.state === "repair");
    case "scrubberOn": return state.scrubberOn;
    default: return false;
  }
}

// ---------------------------------------------------------------- actions --

export function applyAction(state, action) {
  if (state.phase !== "voyage") return state;
  const a = action;
  const ship = shipFor(levelById(state.levelId));
  switch (a.type) {
    case "dg.start": {
      const d = state.dgs.find((x) => x.id === a.id);
      if (!d || (d.state !== "stopped" && d.state !== "tripped")) break;
      d.state = "starting";
      d.startTicksLeft = TUNING.dgStartTicks;
      d.fuel = state.fleetFuel;
      clearAlarm(state, "dg", undefined, d.id);
      logLine(state, `${d.id} starting…`, "info");
      break;
    }
    case "dg.stop": {
      const d = state.dgs.find((x) => x.id === a.id);
      if (!d || (d.state !== "online" && d.state !== "starting" && d.state !== "ready")) break;
      d.state = "stopped";
      d.loadPct = 0;
      logLine(state, `${d.id} stopped.`, "info");
      break;
    }
    case "breaker.close": {
      const d = state.dgs.find((x) => x.id === a.id);
      if (!d || d.state !== "ready") break;
      d.state = "online";
      const b = state.boards.find((x) => x.id === d.board);
      if (b && !b.online) {
        b.online = true; // black-start: energize dead board
        b.shedStage = 3; // restore loads progressively
        clearAlarm(state, "board", undefined, b.id);
        logLine(state, `Switchboard ${b.id} energized from ${d.id}.`, "info");
      }
      break;
    }
    case "breaker.open": {
      const d = state.dgs.find((x) => x.id === a.id);
      if (!d || d.state !== "online") break;
      d.state = "ready";
      d.loadPct = 0;
      break;
    }
    case "tie.open": state.tieClosed = false; break;
    case "tie.close": {
      if (state.boards.every((b) => b.online) || state.boards.some((b) => b.online)) state.tieClosed = true;
      break;
    }
    case "shed.set": {
      for (const b of state.boards) b.shedStage = clamp(a.stage, 0, 3);
      logLine(state, a.stage > 0 ? `Hotel load shed to stage ${a.stage}.` : "Hotel load fully restored.", "info");
      break;
    }
    case "pms.auto": state.pmsAuto = !!a.on; break;
    case "telegraph.ack": {
      if (state.telegraphAcked) break;
      state.telegraphAcked = true;
      state.telegraphAnswers += 1;
      state.commandedKn = state.orderedKn;
      logLine(state, `Telegraph answered: ${state.orderedKn} knots.`, "info");
      break;
    }
    case "speed.set": state.commandedKn = clamp(a.kn, 0, state.orderedKn || ship.serviceKn); break;
    case "bridge.requestSlowdown": {
      if (!state.slowdownGranted) {
        state.slowdownGranted = true;
        state.orderedKn = Math.max(6, Math.round(state.orderedKn * 0.7));
        state.commandedKn = Math.min(state.commandedKn, state.orderedKn);
        logLine(state, `Bridge agrees to reduce to ${state.orderedKn} knots. "Make your repairs, Chief."`, "bridge");
      }
      break;
    }
    case "bridge.requestResume": {
      if (state.slowdownGranted) {
        state.slowdownGranted = false;
        const leg = currentLeg(state);
        state.orderedKn = leg?.orderKn ?? state.orderedKn;
        logLine(state, `Bridge: resuming ${state.orderedKn} knots.`, "bridge");
      }
      break;
    }
    case "fuel.switchover": {
      if (state.switchover || state.fleetFuel === a.grade) break;
      if ((state.tanks[a.grade] ?? 0) <= 0) break;
      state.switchover = { target: a.grade, ticksLeft: TUNING.switchoverTicks };
      logLine(state, `Fuel switchover to ${a.grade} started (${TUNING.switchoverTicks} min).`, "info");
      break;
    }
    case "bunker.plan": {
      if (!state.inPort) break;
      const level = levelById(state.levelId);
      const port = level.route[state.legIndex];
      if (!port?.bunkerPrices) break;
      const hfo = clamp(a.hfo ?? 0, 0, state.tankCap.HFO - state.tanks.HFO);
      const mgo = clamp(a.mgo ?? 0, 0, state.tankCap.MGO - state.tanks.MGO);
      const cost = hfo * port.bunkerPrices.HFO + mgo * port.bunkerPrices.MGO;
      state.tanks.HFO += hfo;
      state.tanks.MGO += mgo;
      // Bunkers are owner's account; the voyage budget scores BURN + parts + fines.
      logLine(state, `Bunkered ${Math.round(hfo)}t HFO + ${Math.round(mgo)}t MGO (k€${(cost / 1000).toFixed(0)}, owner's account). Samples drawn and sealed.`, "info");
      break;
    }
    case "scrubber.start": if (shipFor(levelById(state.levelId)).scrubber && !state.scrubberFault) state.scrubberOn = true; break;
    case "scrubber.stop": state.scrubberOn = false; break;
    case "job.start": {
      const j = state.jobs.find((x) => x.id === a.jobId);
      if (!j || j.status !== "open") break;
      if (state.teamsBusy >= state.teams) break;
      if (j.portOnly && !state.inPort) break;
      j.status = "running";
      j.ticksLeft = j.durationMin;
      state.teamsBusy += 1;
      logLine(state, `Team on job: ${j.title} (~${Math.round(j.durationMin / 60)}h).`, "info");
      break;
    }
    case "job.cancel": {
      const j = state.jobs.find((x) => x.id === a.jobId);
      if (!j || j.status !== "running") break;
      j.status = "open";
      j.ticksLeft = j.durationMin;
      state.teamsBusy -= 1;
      break;
    }
    case "event.intervene": {
      const inst = state.events.find((e) => e.id === a.instanceId);
      if (!inst) break;
      const ph = phaseOf(inst);
      const iv = (ph.interventions ?? []).find((x) => x.id === a.interventionId);
      if (!iv) break;
      // ordered prerequisites
      if (iv.requires && !iv.requires.every((r) => inst.doneInterventions.includes(r))) {
        logLine(state, iv.refuseText ?? "Not yet — follow the procedure.", "warn");
        break;
      }
      if (iv.needsTeam && state.teamsBusy >= state.teams) break;
      inst.doneInterventions.push(iv.id);
      if (iv.log) logLine(state, iv.log.replaceAll("{c}", inst.componentId ?? ""), "info");
      if (iv.effects) applyEffects(state, inst, iv.effects);
      if (iv.resolve) {
        resolveInstance(state, inst, iv.resolve); // 'resolved' | 'degraded'
      } else if (iv.gotoPhase != null) {
        inst.phaseIndex = eventById(inst.eventId).phases.findIndex((p) => p.id === iv.gotoPhase);
        inst.ticksLeft = phaseOf(inst).min;
        applyPhaseEntry(state, inst);
      } else if (iv.extend) {
        inst.ticksLeft += iv.extend;
      }
      break;
    }
    case "weather.secure": {
      state.securedForWeather = true;
      logLine(state, "Engine room secured for heavy weather.", "info");
      break;
    }
    case "stabilizers.set": state.stabilizersOut = !!a.out; break;
    case "alarm.ack": {
      const al = state.alarms.find((x) => x.id === a.id);
      if (al) al.acked = true;
      break;
    }
    case "alarm.ackAll": for (const al of state.alarms) al.acked = true; break;
    default: break;
  }
  return state;
}

// ------------------------------------------------------------------ tick --

export function tick(state) {
  if (state.phase !== "voyage") return state;
  state.newAlarmThisTick = false;
  state.tick += 1;
  state.clockMin += 1;
  if (state.clockMin % 1440 === 0) state.day += 1;

  // (1) position/time
  stepPosition(state);
  if (state.phase !== "voyage") { latchObjectives(state); return state; }
  // (2) jobs (effects land before escalation checks)
  stepJobs(state);
  // DG start sequences
  for (const d of state.dgs) {
    if (d.state === "starting") {
      d.startTicksLeft -= 1;
      if (d.startTicksLeft <= 0) {
        d.state = "ready";
        logLine(state, `${d.id} up to speed — ready to close breaker.`, "info");
      }
    }
  }
  // PMS auto-assist
  if (state.pmsAuto) stepPmsAuto(state);
  // (3+4) electrical balance
  stepElectrical(state);
  stepBlackout(state);
  // (5) fuel
  stepFuel(state);
  // (6) events
  stepEvents(state);
  // (7) hazards
  stepHazards(state);
  // weather effects
  stepWeather(state);
  // (8) comfort etc.
  stepComfort(state);
  // (9) script/objectives
  stepScript(state);
  // aux alarms
  if (projectedFuelMargin(state) < 0 && !state.inPort) {
    raiseAlarm(state, "fuel", "PROJECTED FUEL SHORT OF DESTINATION", "amber");
  } else {
    clearAlarm(state, "fuel", "PROJECTED FUEL SHORT OF DESTINATION");
  }
  // housekeeping: drop long-cleared alarms (the UI never shows them again,
  // and scans/saves stay bounded)
  if (state.alarms.length > 150) {
    state.alarms = state.alarms.filter((a) => a.active || state.tick - a.tick < 180);
  }
  return state;
}

function stepPmsAuto(state) {
  // keep N+1: start next standby when reserve < 0, stop surplus when > largest*1.2
  const reserve = spinningReserve(state);
  if (reserve < 0) {
    const standby = state.dgs.find((d) => d.state === "stopped");
    if (standby) applyAction(state, { type: "dg.start", id: standby.id });
    const ready = state.dgs.find((d) => d.state === "ready");
    if (ready) applyAction(state, { type: "breaker.close", id: ready.id });
  } else {
    const online = state.dgs.filter((d) => d.state === "online");
    if (online.length > 1) {
      const smallest = online.reduce((m, d) => (d.mw < m.mw ? d : m));
      const capWithout = online.filter((d) => d !== smallest).reduce((s, d) => s + d.mw, 0);
      const largest = Math.max(...online.filter((d) => d !== smallest).map((d) => d.mw));
      if (capWithout - totalDemandMw(state) - largest > 0.5) {
        applyAction(state, { type: "breaker.open", id: smallest.id });
        applyAction(state, { type: "dg.stop", id: smallest.id });
      }
    }
  }
}

// ----------------------------------------------------------------- stars --

export function stars(state) {
  const level = levelById(state.levelId);
  const safety = !state.unscriptedBlackout && state.playerFaultCasualties === 0;
  const comfortAvg = state.comfortSamples ? state.comfortSum / state.comfortSamples : 100;
  const service = comfortAvg >= level.comfortTarget && state.lateMin <= level.lateToleranceMin;
  const spent = voyageSpendK(state);
  const efficiency = spent <= state.budget && state.finesEUR === 0;
  return { safety, service, efficiency, comfortAvg, spent };
}

export function debrief(state) {
  const s = stars(state);
  return {
    phase: state.phase,
    failReason: state.failReason,
    stars: s,
    timeline: state.timeline,
    chains: buildChains(state),
    fuelUsedT: Object.entries(state.tanks).map(([g, t]) => ({ grade: g, left: t })),
    finesEUR: state.finesEUR,
    lateMin: state.lateMin,
  };
}

function buildChains(state) {
  // causal chains from doneEvents' causedBy links
  const byId = new Map(state.doneEvents.map((e) => [e.id, e]));
  return state.doneEvents
    .filter((e) => e.outcome === "casualty")
    .map((e) => {
      const chain = [];
      let cur = e;
      while (cur) {
        chain.unshift(`${eventById(cur.eventId).title}${cur.componentId ? ` (${cur.componentId})` : ""}`);
        cur = cur.causedBy ? byId.get(cur.causedBy) : null;
      }
      return chain.join(" ← ");
    });
}

// Current burn rate in tonnes/hour (the same arithmetic stepFuel integrates).
export function burnRateTph(state) {
  return state.dgs.filter((d) => d.state === "online")
    .reduce((sum, d) => sum + (d.mw * 1000 * (d.loadPct / 100) * sfoc(d.loadPct)) / 1e6, 0);
}

// Voyage spend in k€ — the exact quantity the Efficiency star scores.
export function voyageSpendK(state) {
  return state.spentFuel + state.spentParts + state.finesEUR / 1000;
}

// ------------------------------------------------------------ selectors --

export function activeAlarms(state) {
  return state.alarms.filter((a) => a.active);
}

export function unackedCritical(state) {
  return state.alarms.some((a) => a.active && !a.acked && a.severity === "red");
}
