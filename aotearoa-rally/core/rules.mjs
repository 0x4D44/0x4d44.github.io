// Stage rules: countdown, false start, checkpoints/splits, wrong-way and off-road warnings,
// stuck/flipped respawn with penalty, DNF. Pure (no DOM, no THREE); drives the vehicle only
// through vehicle.reset(pose, speed) when it respawns the car.

import { yawOfDir, clamp } from "./mathx.mjs";

export const RULES = Object.freeze({
  countdownSeconds: 3,
  falseStartSpeed: 1.2, // m/s before GO
  falseStartMove: 1.0, // metres moved before GO
  falseStartPenalty: 5,
  stuckSpeed: 0.9, // m/s
  stuckSeconds: 6,
  stuckGrace: 4, // run seconds before stuck detection arms
  flippedSeconds: 0.4, // on top of the physics flag (which already waits 0.5 s)
  respawnCooldown: 4,
  noProgressMetres: 40,
  noProgressSeconds: 25,
  timeCapFactor: 3,
  timeCapExtra: 480,
  wrongWayDot: -0.25,
  wrongWaySeconds: 1.2,
  offRoadSeconds: 0.6,
  corridorFraction: 0.82,
  dnfDamage: 1,
  respawnPenalty: { rookie: 8, pro: 10, expert: 15 },
});

const mkOut = () => ({ s: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1, left: 0, right: 0, width: 8 });

/**
 * @param {{stage:object, vehicle:object, difficulty?:"rookie"|"pro"|"expert"}} o
 */
/**
 * @param {{stage:object, vehicle:object, difficulty?:string, par?:number, countdown?:number}} o
 * `par` (expert-human par in seconds) sets the stage time cap: min(3 x par, par + 8 min) -> DNF.
 */
export function createRun({ stage, vehicle, difficulty = "pro", par = null, countdown = RULES.countdownSeconds }) {
  const cdSeconds = Math.max(0, countdown);
  const timeCap = Number.isFinite(par) && par > 0 ? Math.min(RULES.timeCapFactor * par, par + RULES.timeCapExtra) : Infinity;
  const cps = stage.checkpoints && stage.checkpoints.length ? stage.checkpoints : [{ s: 0, name: "Start" }, { s: stage.lengthM, name: "Finish" }];
  const respawnPenalty = RULES.respawnPenalty[difficulty] ?? RULES.respawnPenalty.pro;
  const tmp = { sample: mkOut(), bound: { left: 20, right: 20 } };
  const run = {
    stageId: stage.id,
    difficulty,
    status: "ready", // ready | countdown | running | finished | dnf
    time: 0, // stage clock (seconds since GO), penalties excluded
    timeCap,
    countdown: cdSeconds, // seconds left until GO
    splits: [], // { index, name, s, time } time = clock + penalties at crossing
    penalties: [], // { kind, seconds, at }
    penaltyTotal: 0,
    nextCheckpoint: 1,
    lastCheckpointS: 0,
    respawns: 0,
    assisted: false, // set by the test API (teleport, finishRun): the run is not a real drive, so no record, ghost or deltas
    falseStart: false,
    dnfReason: null,
    finishTime: null,
    warnings: { wrongWay: false, offRoad: false, corridor: false },
    events: [], // drained by the game: { t, ... }
    get total() {
      return run.time + run.penaltyTotal;
    },
    start() {
      run.status = "countdown";
      run.countdown = cdSeconds;
      run._lastBeep = Math.ceil(cdSeconds); // the "3" is announced by start() itself
      run._startS = vehicle.state ? vehicle.state.s || 0 : 0;
      run._startX = vehicle.state ? vehicle.state.x : 0;
      run._startZ = vehicle.state ? vehicle.state.z : 0;
      run.events.push({ t: "countdown", n: Math.ceil(cdSeconds) });
    },
    /** Test/tooling helper: go straight to the running state (no countdown, no false-start check). */
    skipCountdown(state) {
      if (run.status === "ready") run.start();
      run.countdown = 0;
      run.falseStart = true; // no false-start penalty when the countdown is skipped
      run.events.length = 0;
      run.status = "running";
      run.time = 0;
      run._lastS = state ? state.s : 0;
      run._respawnCool = 0; run._stuck = 0; run._flip = 0; run._wrong = 0; run._off = 0;
      run._progS = state ? state.s : 0; run._progT = 0;
    },
    addPenalty(kind, seconds) {
      run.penalties.push({ kind, seconds, at: run.time });
      run.penaltyTotal += seconds;
      run.events.push({ t: "penalty", kind, seconds });
    },
    /** Advance by dt (seconds of sim time). `state` is vehicle.state. */
    update(dt, state) {
      if (run.status === "countdown") {
        run.countdown -= dt;
        const n = Math.ceil(run.countdown);
        if (n < run._lastBeep && n >= 1) {
          run._lastBeep = n;
          run.events.push({ t: "countdown", n });
        }
        if (!run.falseStart) {
          const moved = Math.hypot(state.x - run._startX, state.z - run._startZ);
          if (Math.abs(state.speed) > RULES.falseStartSpeed || moved > RULES.falseStartMove) {
            run.falseStart = true;
            run.addPenalty("false_start", RULES.falseStartPenalty);
            run.events.push({ t: "falseStart" });
          }
        }
        if (run.countdown <= 0) {
          run.status = "running";
          run.time = 0;
          run._lastS = state.s;
          run._respawnCool = 0;
          run._stuck = 0;
          run._flip = 0;
          run._wrong = 0;
          run._off = 0;
          run._progS = state.s;
          run._progT = 0;
          run.events.push({ t: "go" });
        }
        return run.status;
      }
      if (run.status !== "running") return run.status;

      run.time += dt;
      run._curS = state.s;
      run._respawnCool = Math.max(0, run._respawnCool - dt);

      // checkpoints / finish
      while (run.nextCheckpoint < cps.length) {
        const cp = cps[run.nextCheckpoint];
        if (state.s + 1e-6 < cp.s) break;
        const isFinish = run.nextCheckpoint === cps.length - 1;
        const split = { index: run.nextCheckpoint, name: cp.name, s: cp.s, time: run.time + run.penaltyTotal };
        run.splits.push(split);
        run.lastCheckpointS = cp.s;
        run.nextCheckpoint++;
        if (isFinish) {
          run.status = "finished";
          run.finishTime = run.time + run.penaltyTotal;
          run.events.push({ t: "finish", time: run.finishTime });
          return run.status;
        }
        run.events.push({ t: "checkpoint", index: split.index, name: cp.name, time: split.time });
      }

      // DNF
      const dmg = state.damage ? state.damage.total : 0;
      if (dmg >= RULES.dnfDamage) {
        run.status = "dnf";
        run.dnfReason = "damage";
        run.events.push({ t: "dnf", reason: "damage" });
        return run.status;
      }

      // wrong way: car heading versus the road tangent
      const sm = stage.sample(clamp(state.s, 0, stage.lengthM), tmp.sample);
      const fx = -Math.sin(state.yaw);
      const fz = -Math.cos(state.yaw);
      const dot = fx * sm.tx + fz * sm.tz;
      const movingAgainst = state.speed < -3;
      if ((dot < RULES.wrongWayDot && Math.abs(state.speed) > 2.5) || movingAgainst) run._wrong += dt;
      else run._wrong = Math.max(0, run._wrong - dt * 2);
      const ww = run._wrong > RULES.wrongWaySeconds;
      if (ww && !run.warnings.wrongWay) run.events.push({ t: "wrongWay" });
      run.warnings.wrongWay = ww;

      // off road + corridor
      const halfW = (sm.width || 8) / 2;
      const off = state.onRoad === false || Math.abs(state.lat) > halfW + 0.8;
      run._off = off ? run._off + dt : 0;
      const wasOff = run.warnings.offRoad;
      run.warnings.offRoad = run._off > RULES.offRoadSeconds;
      if (run.warnings.offRoad && !wasOff) run.events.push({ t: "offRoad" });
      if (stage.boundaryAt) {
        const b = stage.boundaryAt(clamp(state.s, 0, stage.lengthM), tmp.bound);
        const lim = state.lat >= 0 ? b.right : b.left;
        run.warnings.corridor = Math.abs(state.lat) > lim * RULES.corridorFraction && lim > 0;
      }

      // time cap: a stage that has run far past par is abandoned
      if (run.time > run.timeCap) {
        run.status = "dnf";
        run.dnfReason = "timeout";
        run.events.push({ t: "dnf", reason: "timeout" });
        return run.status;
      }
      // no progress: throttle applied but < 40 m gained in 25 s
      if (state.throttle > 0.1) {
        run._progT += dt;
        if (state.s - run._progS >= RULES.noProgressMetres) { run._progS = state.s; run._progT = 0; }
        else if (run._progT >= RULES.noProgressSeconds) {
          run._progT = 0; run._progS = state.s;
          if (run._respawnCool <= 0) { run.respawn("no_progress"); return run.status; }
        }
      } else if (state.s - run._progS >= RULES.noProgressMetres) { run._progS = state.s; run._progT = 0; }
      // stuck
      if (run.time > RULES.stuckGrace && Math.abs(state.speed) < RULES.stuckSpeed && !state.airborne) run._stuck += dt;
      else run._stuck = 0;
      // flipped
      const flipped = !!state.flipped;
      run._flip = flipped ? run._flip + dt : 0;
      let reason = null;
      if (run._stuck > RULES.stuckSeconds) reason = "stuck";
      else if (run._flip > RULES.flippedSeconds) reason = "flipped";
      if (reason && run._respawnCool <= 0) run.respawn(reason);
      return run.status;
    },
    /** Put the car back on the centreline close to where it left the road (never behind the last checkpoint), with a time penalty.
     *  A second respawn within 20 s and 40 m of the previous one steps back a further 30 m, so a bank cannot trap the car in a loop. */
    respawn(reason = "manual") {
      const floorS = run.lastCheckpointS + (run.lastCheckpointS > 0 ? 3 : 0);
      const here = Number.isFinite(run._curS) ? run._curS : floorS;
      let target = Math.max(floorS, here - 15);
      const prev = run._lastRespawn;
      if (prev && run.time - prev.t < 20 && Math.abs(here - prev.s) < 40) target = Math.max(floorS, Math.min(target, prev.s - 30));
      const s = clamp(target, 0, stage.lengthM);
      run._lastRespawn = { t: run.time, s };
      const sm = stage.sample(s, {});
      const pose = s <= 0 && stage.startPose ? { ...stage.startPose } : { x: sm.x, y: sm.y + 0.3, z: sm.z, yaw: yawOfDir(sm.tx, sm.tz) };
      vehicle.reset(pose, 0, stage);
      run.respawns++;
      run._stuck = 0;
      run._flip = 0;
      run._wrong = 0;
      run._progT = 0;
      run._progS = s;
      run._respawnCool = RULES.respawnCooldown;
      run.addPenalty(reason === "manual" ? "reset" : reason, respawnPenalty);
      run.events.push({ t: "respawn", reason, s });
    },
    /** The driver gives up: a DNF with reason "retired" (championship Retire, or a stage left mid-run). */
    retire() {
      if (run.status === "finished" || run.status === "dnf") return;
      run.status = "dnf";
      run.dnfReason = "retired";
      run.events.push({ t: "dnf", reason: "retired" });
    },
    /** Final summary, valid for finished and dnf. */
    result() {
      return {
        stageId: stage.id,
        status: run.status,
        time: run.time,
        penaltyTotal: run.penaltyTotal,
        total: run.status === "dnf" ? Infinity : run.time + run.penaltyTotal,
        splits: run.splits.map((s) => ({ ...s })),
        penalties: run.penalties.map((p) => ({ ...p })),
        respawns: run.respawns,
        assisted: run.assisted,
        falseStart: run.falseStart,
        dnfReason: run.dnfReason,
      };
    },
    drainEvents() {
      if (!run.events.length) return run.events;
      const e = run.events.slice();
      run.events.length = 0;
      return e;
    },
  };
  return run;
}
