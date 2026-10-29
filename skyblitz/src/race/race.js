// STUB race director: one racer, countdown, lap counting, events. The race agent REPLACES this with the real thing
// (8-racer grid, AI, items, collisions, rubber-banding, standings, results) and keeps the public API and the Racer shape.
//
// Racer shape (fields other modules rely on; keep names): id, slot, isPlayer, isAI, name, pilot, spec, livery, flight, controls, model,
//   prev{pos,quat}, render{pos,quat}, lap, s, dist, lateral, vertical, onBranch, nextSector, place, lapTimes[], bestLap, finishTime, finished,
//   item{type,count}|null, shield, invuln, tumble, heat, stats{...}, ai, proj.
import { GRID_SIZE } from '../config.js';
import { createControls, copyControls } from '../controls.js';
import { createFlightState, resetFlightState, stepFlight } from '../flight/flight.js';
import { buildAircraft, updateAircraft } from '../craft/aircraft.js';
import { getAircraft, getPilot, PILOTS } from '../craft/roster.js';
import { createAI } from './ai.js';
import { ItemSystem } from './items.js';
import { DIFFICULTY } from './balance.js';

export function makeRacer(game, id, spec, livery, isPlayer, pilot, slot) {
  const flight = createFlightState(spec);
  resetFlightState(flight, slot.pos, slot.quat, 0);
  const model = buildAircraft(spec, livery, game);
  game.scene.add(model);
  return {
    id, slot: slot.slot, isPlayer, isAI: !isPlayer, name: isPlayer ? 'You' : pilot.name, pilot, spec, livery,
    flight, controls: createControls(), model,
    prev: { pos: flight.pos.clone(), quat: flight.quat.clone() }, render: { pos: flight.pos.clone(), quat: flight.quat.clone() },
    lap: 1, s: 0, dist: 0, lateral: 0, vertical: 0, onBranch: -1, nextSector: 1, place: id + 1, lapTimes: [], bestLap: null, finishTime: null, finished: false, lapStart: 0, crossed: false,
    item: null, shield: 0, invuln: 0, tumble: 0, heat: 0, stats: { hitsTaken: 0, hitsDealt: 0, stunts: 0, perfectGates: 0, shortcuts: 0 },
    ai: null, proj: { s: 0, lateral: 0, vertical: 0, dist: 0, branch: -1 },
  };
}

export class Race {
  constructor(game, cfg) {
    this.game = game; this.cfg = cfg; this.course = cfg.course; this.laps = cfg.laps; this.mode = cfg.mode || 'quick'; this.demo = !!cfg.demo;
    this.difficulty = DIFFICULTY[cfg.difficulty] || DIFFICULTY.normal;
    this.state = 'grid'; this.clock = 0; this.cd = 3.999; this.lastCount = 4; this.autopilot = false; this.endTimer = null;
    this.items = new ItemSystem(this);
    this.racers = []; this.player = null;
    const grid = this.course.startGrid(GRID_SIZE);
    if (this.demo) {
      const p = PILOTS[0]; this.racers.push(makeRacer(game, 0, getAircraft(p.craft), 0, false, p, grid[0]));
    } else {
      const r = makeRacer(game, 0, getAircraft(cfg.craftId), cfg.livery || 0, true, null, grid[0]);
      this.racers.push(r); this.player = r;
    }
    for (const r of this.racers) { r.ai = createAI(this, r, r.pilot, this.difficulty); this.syncProgress(r, true); r.prev.pos.copy(r.flight.pos); }
    game.events.emit('race:ready', { race: this });
  }

  /** Begin the countdown (called by game.startRace once everything is built). */
  start() { this.state = this.demo ? 'racing' : 'countdown'; if (this.demo) for (const r of this.racers) r.flight.speed = 60; }
  setAutopilot(on) { this.autopilot = !!on; }
  onTeleport(racer) { this.syncProgress(racer, true); }

  syncProgress(r, hard = false) {
    const L = this.course.length, p = r.proj;
    this.course.project(r.flight.pos, hard ? null : r.s, p);
    let s = p.s; if (!r.crossed && s > L * 0.5) s -= L;        // behind the start line before the first crossing
    r.s = s; r.lateral = p.lateral; r.vertical = p.vertical; r.dist = (r.lap - 1) * L + s;
  }

  fixedUpdate(dt, playerControls) {
    const ev = this.game.events, L = this.course.length;
    for (const r of this.racers) { r.prev.pos.copy(r.flight.pos); r.prev.quat.copy(r.flight.quat); }
    if (this.state === 'countdown') {
      this.cd -= dt; const n = Math.ceil(this.cd);
      if (n !== this.lastCount && n >= 1) { this.lastCount = n; ev.emit('race:countdown', { n }); }
      if (this.cd <= 0) { this.state = 'racing'; this.clock = 0; for (const r of this.racers) r.flight.speed = 60; ev.emit('race:go', {}); }
      return;
    }
    if (this.state !== 'racing' && this.state !== 'finishing') return;
    this.clock += dt;
    for (const r of this.racers) {
      const useAI = r.isAI || this.autopilot || r.finished;
      if (useAI) r.ai.think(dt, r.controls); else if (playerControls) copyControls(r.controls, playerControls);
      stepFlight(r.flight, r.controls, dt, { assist: this.game.settings.assist });
      const prevS = r.s; this.syncProgress(r);
      if (!r.crossed && prevS < 0 && r.s >= 0) r.crossed = true;
      else if (r.crossed && prevS > L * 0.75 && r.s < L * 0.25 && !r.finished) this.completeLap(r);
    }
    this.racers.slice().sort((a, b) => b.dist - a.dist).forEach((r, i) => { r.place = i + 1; });
    if (this.endTimer != null && (this.endTimer -= dt) <= 0) { this.endTimer = null; this.state = 'done'; ev.emit('race:end', { standings: this.standings() }); }
  }

  completeLap(r) {
    const lapTime = this.clock - r.lapStart; r.lapStart = this.clock; r.lapTimes.push(lapTime);
    r.bestLap = r.bestLap == null ? lapTime : Math.min(r.bestLap, lapTime); r.lap++;
    this.game.events.emit('race:lap', { racer: r, lap: r.lap, lapTime, best: r.bestLap === lapTime });
    if (r.lap > this.laps) {
      r.finished = true; r.finishTime = this.clock; r.lap = this.laps;
      this.game.events.emit('race:finish', { racer: r, place: r.place, time: r.finishTime });
      if (r === this.player) { this.state = 'finishing'; this.endTimer = 5; }
    } else if (r.lap === this.laps) this.game.events.emit('race:finalLap', { racer: r });
  }

  standings() { return this.racers.slice().sort((a, b) => (a.finished && b.finished ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : b.dist - a.dist)); }
  results() { return { standings: this.standings().map((r, i) => ({ racer: r, place: i + 1, time: r.finishTime, bestLap: r.bestLap, points: [10, 8, 6, 5, 4, 3, 2, 1][i] ?? 0 })) }; }

  /** Per rendered frame: interpolate transforms, animate models, update item visuals. */
  render(alpha, dt) {
    for (const r of this.racers) {
      r.render.pos.lerpVectors(r.prev.pos, r.flight.pos, alpha); r.render.quat.slerpQuaternions(r.prev.quat, r.flight.quat, alpha);
      r.model.position.copy(r.render.pos); r.model.quaternion.copy(r.render.quat);
      updateAircraft(r.model, r, dt);
    }
    this.items.render(alpha, dt);
  }

  dispose() {
    for (const r of this.racers) { this.game.fx.detachRacer?.(r); r.model.parent?.remove(r.model); r.model.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }
    this.items.dispose(); this.racers.length = 0;
  }
}
