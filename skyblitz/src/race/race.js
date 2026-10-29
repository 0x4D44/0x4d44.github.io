// Race director: 8-racer grid, countdown + rocket start, exploit-proof laps/sectors, ranking with overtake hysteresis, wrong-way,
// finish / DNF timeout, results + points, respawn, rubber-banding, drafting, stunt reward routing, gates and boost rings.
//
// Racer shape (fields other modules rely on; keep names): id, slot, isPlayer, isAI, name, pilot, spec, livery, flight, controls, model,
//   prev{pos,quat}, render{pos,quat}, lap, s, dist, lateral, vertical, onBranch, nextSector, place, lapTimes[], bestLap, finishTime, finished,
//   item{type,count}|null, shield, invuln, tumble, heat, stats{...}, ai, proj.
// Additions (race agent): radius, lock{target,progress}, empT, blind, overheated, wrongWay, draft{on,target,t}, rb (rubber factor), lastS.
import * as THREE from 'three';
import { GRID_SIZE } from '../config.js';
import { clamp } from '../util.js';
import { createControls, copyControls } from '../controls.js';
import { createFlightState, resetFlightState, stepFlight, startBoost, addBoostMeter } from '../flight/flight.js';
import { buildAircraft, updateAircraft, disposeAircraft } from '../craft/aircraft.js';
import { AIRCRAFT, getAircraft, PILOTS } from '../craft/roster.js';
import { createAI } from './ai.js';
import { ItemSystem } from './items.js';
import { DIFFICULTY, RACE, GP_POINTS } from './balance.js';
import { syncProgress, reanchor, stepProgress, updateWrongWay } from './progress.js';
import { stepCollisions } from './collision.js';
import { applyHit } from './damage.js';

const AUTO_PILOT = { id: 'auto', name: 'Autopilot', tag: 'AUT', personality: { skill: 0.9, aggression: 0.3, itemSense: 0.7, stunts: 0.3, shortcuts: 0.6, consistency: 0.95 } };
const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = {};

export function makeRacer(game, id, spec, livery, isPlayer, pilot, slot) {
  const flight = createFlightState(spec);
  resetFlightState(flight, slot.pos, slot.quat, 0);
  const model = game.headless ? new THREE.Group() : buildAircraft(spec, livery, game);
  if (game.headless) model.userData = { radius: Math.max(spec.visual.length, spec.visual.wingspan) * 0.5 };
  game.scene.add(model);
  const radius = clamp((model.userData?.radius ?? 5) * 0.55, 2.5, 7);
  return {
    id, slot: slot.slot, isPlayer, isAI: !isPlayer, name: isPlayer ? 'You' : pilot.name, pilot, spec, livery,
    flight, controls: createControls(), model, radius,
    prev: { pos: flight.pos.clone(), quat: flight.quat.clone() }, render: { pos: flight.pos.clone(), quat: flight.quat.clone() },
    lap: 1, s: 0, dist: 0, lateral: 0, vertical: 0, onBranch: -1, nextSector: 1, place: id + 1, lapTimes: [], bestLap: null, finishTime: null, finished: false, lapStart: 0,
    item: null, shield: 0, invuln: 0, tumble: 0, heat: 0, stats: { hitsTaken: 0, hitsDealt: 0, stunts: 0, perfectGates: 0, shortcuts: 0, nearMisses: 0, overtakes: 0, rings: 0 },
    ai: null, proj: { s: 0, lateral: 0, vertical: 0, dist: 0, branch: -1 },
    // race-agent state
    lastS: 0, lastBranch: -1, lastGoodS: 0, lastGoodDist: 0, lastGoodBranch: -1, lastGoodU: 0, lastGoodDebt: 0, glitchT: 0, progSpeed: 0, gateIdx: 0, ringIdx: 0, wrongT: 0, rightT: 0, wrongWay: false, branchT: 0, shortcut: -1, lastU: 0, debt: 0, sinceTumble: 9,
    lock: { target: null, progress: 0, emitT: 0 }, empT: 0, blind: 0, overheated: false, fireT: 0, gun: 1, cannonCombo: { n: 0, t: 0 }, grazeT: 0, groundT: 0, wallT: 0, contactRun: 0, nearMissT: 0,
    draft: { on: false, target: null, t: 0 }, draftBonus: 0, rb: 1, launchLock: 0, stuckT: 0, lostT: 0, startPlan: 'none', boostHeld: false, early: false, rocket: null, finishIndex: -1,
  };
}

export class Race {
  constructor(game, cfg) {
    this.game = game; this.cfg = cfg; this.course = cfg.course; this.mode = cfg.mode || 'quick'; this.demo = !!cfg.demo;
    this.laps = cfg.laps ?? this.course.laps ?? 3;
    this.difficulty = DIFFICULTY[cfg.difficulty] || DIFFICULTY.normal;
    this.rng = game.rng.fork(0x5ace);
    this.state = 'grid'; this.clock = 0; this.cd = RACE.countdown + 1.2; this.lastCount = 4; this.autopilot = false; this.endTimer = null;
    this.frame = 0; this.finishedCount = 0; this.bumpAt = new Map();
    this.stats = { glitches: 0, relocks: 0, overtakes: 0, respawns: 0, contactT: 0, racerT: 0, contactBins: new Map(), contactBinT: {}, contactKinds: {} };
    this.ctx = { speedMul: 1, assist: 'standard', gravityScale: 1 };
    this.gates = (this.course.gates || []).slice().sort((x, y) => x.s - y.s);
    this.rings = (this.course.boostRings || []).slice().sort((x, y) => x.s - y.s);
    this.racers = []; this.player = null;
    this.buildGrid(cfg);
    this.order = this.racers.slice().sort((x, y) => x.slot - y.slot);
    this.order.forEach((r, i) => { r.place = i + 1; });
    this.meanCruise = this.racers.reduce((a, x) => a + x.flight.params.cruise, 0) / this.racers.length;
    this.items = new ItemSystem(this);
    for (const r of this.racers) { r.ai = createAI(this, r, r.pilot || AUTO_PILOT, this.difficulty); syncProgress(this, r); r.prev.pos.copy(r.flight.pos); }
    game.events.emit('race:ready', { race: this });
  }

  buildGrid(cfg) {
    const game = this.game, rng = this.rng, nAI = this.mode === 'trial' ? 0 : clamp(cfg.bots ?? 7, 0, Math.min(PILOTS.length, GRID_SIZE - (this.demo ? 0 : 1)));
    const total = nAI + (this.demo ? 0 : 1), grid = this.course.startGrid(GRID_SIZE);
    const pilots = PILOTS.slice(); rng.shuffle(pilots); pilots.length = Math.min(nAI, pilots.length);
    // the better pilots qualify nearer the front (skill plus noise)
    // one noisy key per pilot, then a plain sort by key (a comparator that draws random numbers makes the grid depend on the JS engine's sort)
    const keyed = pilots.map((p) => ({ p, k: p.personality.skill + rng.range(-0.15, 0.15) }));
    keyed.sort((x, y) => y.k - x.k);
    pilots.length = 0; for (const e of keyed) pilots.push(e.p);
    let playerSlot = this.demo ? -1 : cfg.playerSlot ?? (this.mode === 'trial' ? 0 : Math.min(total - 1, 6));
    playerSlot = Math.min(playerSlot, total - 1);
    const playerCraft = this.demo ? null : getAircraft(cfg.craftId).id, used = new Set(playerCraft ? [playerCraft] : []), count = {};
    let id = 0, ai = 0;
    for (let slot = 0; slot < total; slot++) {
      if (slot === playerSlot) {
        const r = makeRacer(game, id++, getAircraft(cfg.craftId), cfg.livery || 0, true, null, grid[slot]);
        this.racers.push(r); this.player = r; continue;
      }
      const pilot = pilots[ai++];
      let craft = pilot.craft;
      if (used.has(craft)) craft = (AIRCRAFT.find((a) => !used.has(a.id)) || getAircraft(craft)).id;
      used.add(craft); const n = (count[craft] = (count[craft] || 0) + 1) - 1;
      let livery = (n + PILOTS.indexOf(pilot)) % 3; if (craft === playerCraft && livery === (cfg.livery || 0) % 3) livery = (livery + 1) % 3;
      this.racers.push(makeRacer(game, id++, getAircraft(craft), livery, false, pilot, grid[slot]));
    }
  }

  /** Begin the countdown (called by game.startRace once everything is built). */
  start() {
    if (this.demo) { this.state = 'racing'; this.launchAll(); return; }
    this.state = 'countdown';
    for (const r of this.racers) if (!r.isPlayer || this.autopilot) this.planStart(r);
  }
  setAutopilot(on) {
    this.autopilot = !!on;
    if (on && this.state === 'countdown' && this.player) this.planStart(this.player);
  }
  onTeleport(racer) { reanchor(this, racer); }                 // grants nothing: dist, sectors and laps are untouched

  planStart(r) {
    const P = (r.pilot || AUTO_PILOT).personality, q = P.skill * P.consistency * (0.6 + 0.4 * this.difficulty.aiSkill), x = this.rng.float();
    const early = clamp((1 - P.consistency) * 0.25 * this.difficulty.mistakes, 0, 0.3), perfect = 0.08 + 0.5 * q, good = 0.35;
    r.startPlan = x < early ? 'early' : x < early + perfect ? 'perfect' : x < early + perfect + good ? 'good' : 'none';
  }

  launchAll() {
    for (const r of this.racers) {
      const fs = r.flight;
      resetFlightState(fs, fs.pos, fs.quat, fs.params.cruise * RACE.launchSpeedFrac);
      r.prev.pos.copy(fs.pos); r.prev.quat.copy(fs.quat);
    }
  }

  // ------------------------------------------------------------------ countdown / GO
  tickCountdown(dt, pc) {
    const ev = this.game.events;
    this.cd -= dt;
    const t = this.cd - 1.2, n = Math.ceil(t);
    if (n !== this.lastCount && n >= 1 && n <= RACE.countdown) { this.lastCount = n; ev.emit('race:countdown', { n }); }
    const p = this.player;
    if (p && !this.autopilot) {                           // human rocket-start detection
      const held = !!(pc && pc.boost);
      if (held && t > RACE.rocketWindow) p.early = true;             // any boost before the window opens (held or tapped) is a jump start
      if (t <= RACE.rocketWindow && t > 0) {
        if (!p.windowSeen) { p.windowSeen = true; if (held) p.early = true; }   // already holding when the window opens = jumped the gun
        if (held && !p.boostHeld && !p.early && !p.rocket) p.rocket = { perfect: t <= RACE.perfectWindow };
      }
      p.boostHeld = held;
    }
    if (t <= 0) this.go();
  }

  go() {
    const ev = this.game.events;
    this.state = 'racing'; this.clock = 0;
    this.launchAll();
    for (const r of this.racers) {
      const human = r === this.player && !this.autopilot;
      const plan = human ? (r.early ? 'early' : r.rocket ? (r.rocket.perfect ? 'perfect' : 'good') : 'none') : r.startPlan;
      if (plan === 'perfect' || plan === 'good') {
        const perfect = plan === 'perfect', dur = perfect ? 2.4 : 1.4, pow = perfect ? 1.7 : 1.45;
        startBoost(r.flight, dur, pow);
        ev.emit('race:rocketStart', { racer: r, perfect });
        ev.emit('racer:boost', { racer: r, kind: 'start', duration: dur, power: pow });
      } else if (plan === 'early') {
        r.launchLock = 1.3; ev.emit('racer:stall', { racer: r });
      }
    }
    ev.emit('race:go', {});
  }

  // ------------------------------------------------------------------ rubber band
  speedMulFor(r, dt) {
    const d = this.difficulty;
    let ref;
    if (this.player && !this.player.finished) ref = this.player.dist;
    else { let sum = 0; for (const o of this.racers) sum += o.dist; ref = sum / this.racers.length; }
    const f = clamp((ref - r.dist) / d.rubberRange, -1, 1);              // + when behind the reference
    let target = 1;
    if (r.isAI) {
      // pace AIs toward the human's craft (or the field average) so a manta and a sprite race each other, keeping 60 % of the craft identity
      const cruise = r.flight.params.cruise || RACE.cruiseRef;
      const refC = this.player ? this.player.flight.params.cruise : this.meanCruise;
      const norm = (cruise + (refC - cruise) * RACE.cruiseNorm) / cruise;
      target = d.aiSpeed * norm * (f > 0 ? 1 + d.rubber * f : 1 + d.rubber * 0.6 * f);
    } else if (r.place >= 5) {
      // catch-up for the human: measured against the best AI (never against the player's own distance, which is always 0 away)
      let lead = -Infinity; for (const o of this.racers) if (o !== r && o.dist > lead) lead = o.dist;
      const g = clamp((lead - r.dist) / d.rubberRange, 0, 1);
      if (g > 0) target = 1 + d.playerHelp * g;
    }
    r.rb += (target - r.rb) * Math.min(1, dt * 1.2);                      // smoothed: never a visible jump
    let m = r.rb + r.draftBonus;
    if (r.empT > 0) m *= 0.8;
    if (r.launchLock > 0) m *= 0.55 + 0.45 * (1 - r.launchLock / 1.3);
    return m;
  }

  // ------------------------------------------------------------------ main step
  fixedUpdate(dt, playerControls) {
    for (const r of this.racers) { r.prev.pos.copy(r.flight.pos); r.prev.quat.copy(r.flight.quat); }
    if (this.state === 'grid') return;
    if (this.state === 'countdown') { this.tickCountdown(dt, playerControls); return; }
    this.clock += dt; this.frame++;
    this.course.stepHazards?.(this.clock);                       // E-04: moving hazards are a pure function of the race clock, advanced here and nowhere else
    if (this.state !== 'done') { let flying = 0; for (const x of this.racers) if (!x.finished) flying++; this.stats.racerT += dt * flying; }
    const racing = this.state !== 'done';
    for (const r of this.racers) this.stepRacer(r, dt, playerControls);
    if (racing) for (const r of this.racers) { stepProgress(this, r, dt); updateWrongWay(this, r, dt); }
    this.flushFinishers();
    this.updateDrafting(dt);
    stepCollisions(this, dt, this.frame);
    this.items.fixedUpdate(dt);
    for (const r of this.racers) this.tickTimers(r, dt);
    if (racing) { this.checkRespawns(dt); this.updateRanking(); this.checkEnd(dt); }
  }

  stepRacer(r, dt, pc) {
    const fs = r.flight, c = r.controls, human = r === this.player && !this.autopilot && !r.finished && this.state !== 'done';
    if (human) { if (pc) copyControls(c, pc); } else r.ai.think(dt, c);
    if (r.empT > 0) { c.boost = false; c.pitch *= 0.35; c.roll *= 0.35; c.barrel = 0; }
    if (r.launchLock > 0) c.boost = false;
    if (c.item) { if (r.tumble <= 0) this.items.useItem(r, c.itemBack); c.item = false; }
    this.ctx.speedMul = this.speedMulFor(r, dt); this.ctx.assist = human ? this.game.settings.assist : 'pro';
    stepFlight(fs, c, dt, this.ctx);
    const ev = fs.events;
    if (ev.length) {
      for (const e of ev) {
        if (e.type === 'stunt') {
          addBoostMeter(fs, e.reward || 0); r.stats.stunts++;
          this.game.events.emit('racer:stunt', { racer: r, kind: e.kind, reward: e.reward || 0 });
        } else if (e.type === 'stall') this.game.events.emit('racer:stall', { racer: r });
      }
      ev.length = 0;
    }
    if (!(fs.pos.x === fs.pos.x && fs.pos.y === fs.pos.y && fs.pos.z === fs.pos.z)) this.respawn(r, 'nan');
  }

  tickTimers(r, dt) {
    const ev = this.game.events, fs = r.flight;
    r.invuln = Math.max(0, r.invuln - dt); r.blind = Math.max(0, r.blind - dt); r.empT = Math.max(0, r.empT - dt); r.launchLock = Math.max(0, r.launchLock - dt);
    if (r.shield > 0) { r.shield -= dt; if (r.shield <= 0) { r.shield = 0; ev.emit('shield:down', { racer: r }); } }
    const was = r.tumble; r.tumble = fs.tumble.t > 0 ? fs.tumble.t : 0;
    if (was > 0 && r.tumble <= 0) ev.emit('racer:recover', { racer: r });
    r.sinceTumble = r.tumble > 0 ? 0 : r.sinceTumble + dt;
    if (r.shortcut >= 0) r.branchT += dt;
  }

  shortcutEnter(r, branch) {
    r.shortcut = branch; r.branchT = 0;
    this.game.events.emit('shortcut:enter', { racer: r, branch });
  }
  shortcutExit(r, branch, completed) {
    r.shortcut = -1;
    this.game.events.emit('shortcut:exit', { racer: r, branch, completed });
    if (completed) { r.stats.shortcuts++; addBoostMeter(r.flight, 10); this.game.events.emit('racer:stunt', { racer: r, kind: 'shortcut', reward: 10 }); }
  }

  passGate(r, g) {
    if (r.finished) return;
    const tan = _a.set(0, 0, -1).applyQuaternion(g.quat || _f.q || (_f.q = new THREE.Quaternion()));
    const d = _b.copy(r.flight.pos).sub(g.pos); d.addScaledVector(tan, -d.dot(tan));
    const off = d.length() / (g.radius || 40);
    if (off > 1) return;
    const perfect = off <= 0.25;
    if (perfect) { r.stats.perfectGates++; addBoostMeter(r.flight, 5); }
    this.game.events.emit('gate:pass', { racer: r, gate: g, offset: off, perfect });
  }

  passRing(r, g) {
    if (r.finished) return;
    const tan = _a.set(0, 0, -1).applyQuaternion(g.quat || (_f.q || (_f.q = new THREE.Quaternion())));
    const d = _b.copy(r.flight.pos).sub(g.pos); d.addScaledVector(tan, -d.dot(tan));
    if (d.length() > (g.radius || 30)) return;
    const dur = g.duration || 1.2, pow = g.power || 1.45;
    startBoost(r.flight, dur, pow); r.stats.rings++;
    this.game.events.emit('racer:boost', { racer: r, kind: 'ring', duration: dur, power: pow });
  }

  // ------------------------------------------------------------------ laps / finish
  completeLap(r, t) {
    const ev = this.game.events;
    const lapTime = t - r.lapStart; r.lapStart = t; r.lapTimes.push(lapTime);
    const best = r.bestLap == null || lapTime < r.bestLap; if (best) r.bestLap = lapTime;
    r.lap++; r.nextSector = 1; r.gateIdx = 0; r.ringIdx = 0;
    const done = r.lap > this.laps;
    ev.emit('race:lap', { racer: r, lap: r.lap, lapTime, best, finished: done });
    if (done) this.finishRacer(r, t);
    else if (r.lap === this.laps) ev.emit('race:finalLap', { racer: r });
  }

  /** Marks the racer finished now; its place is decided in flushFinishers() once the whole step is known (photo finish: by finishTime, not array order). */
  finishRacer(r, t) {
    r.finished = true; r.finishTime = t; r.lap = this.laps;
    (this.finishQ ||= []).push(r);
  }

  flushFinishers() {
    const q = this.finishQ; if (!q || !q.length) return;
    q.sort((a, b) => a.finishTime - b.finishTime || b.dist - a.dist || a.id - b.id);
    for (const r of q) {
      r.finishIndex = this.finishedCount++;
      // finishers lock in at the front in finishing order
      const i = this.order.indexOf(r); this.order.splice(i, 1); this.order.splice(r.finishIndex, 0, r);
      this.assignPlaces(true);
      this.game.events.emit('race:finish', { racer: r, place: r.finishIndex + 1, time: r.finishTime });
      if (r.item && r.item.type) r.item = null;
      if (r === this.player && this.state === 'racing') { this.state = 'finishing'; this.endTimer = this.mode === 'trial' ? 3 : RACE.finishTimeout + (this.difficulty.finishExtra || 0); }
    }
    q.length = 0;
  }

  checkEnd(dt) {
    if (this.demo) return;
    const ev = this.game.events;
    if (this.endTimer != null) {
      if (this.racers.every((r) => r.finished)) this.endTimer = Math.min(this.endTimer, 2.5);
      if ((this.endTimer -= dt) <= 0) this.end();
    } else if (this.clock > RACE.maxClock) this.end();
    void ev;
  }

  end() {
    this.endTimer = null; this.state = 'done';
    this.game.events.emit('race:end', { standings: this.standings() });
  }

  // ------------------------------------------------------------------ ranking
  assignPlaces(emit) {
    const ev = this.game.events;
    for (let i = 0; i < this.order.length; i++) {
      const r = this.order[i], prev = r.place;
      if (prev !== i + 1) { r.place = i + 1; if (emit && this.state !== 'grid') ev.emit('race:position', { racer: r, place: r.place, prev }); }
    }
  }

  updateRanking() {
    const o = this.order, ev = this.game.events, H = RACE.overtakeHyst;
    let changed = false;
    for (let pass = 0; pass < o.length; pass++) {
      let swapped = false;
      for (let i = 0; i < o.length - 1; i++) {
        const a = o[i], b = o[i + 1];
        if (a.finished || b.finished) continue;
        if (b.dist > a.dist + H) {
          o[i] = b; o[i + 1] = a; swapped = changed = true;
          this.stats.overtakes++; b.stats.overtakes++;
          if (this.state === 'racing' || this.state === 'finishing') ev.emit('race:overtake', { racer: b, passed: a });
        }
      }
      if (!swapped) break;
    }
    if (changed) this.assignPlaces(true);
  }

  // ------------------------------------------------------------------ drafting
  updateDrafting(dt) {
    const ev = this.game.events;
    for (const r of this.racers) {
      const fs = r.flight, d = r.draft;
      let cand = null, bd = RACE.draftRange;
      if (!r.finished && r.tumble <= 0 && fs.speed > 30) {
        for (const o of this.racers) {
          if (o === r || o.finished) continue;
          _a.copy(o.flight.pos).sub(fs.pos); const dist = _a.length();
          if (dist > bd || dist < 8) continue;
          // inside the leader's wake: behind it, close to its flight line, flying the same way
          const along = _a.dot(o.flight.forward);
          if (along < 8 || fs.forward.dot(o.flight.forward) < 0.9) continue;
          _b.copy(_a).addScaledVector(o.flight.forward, -along);
          if (_b.length() > 6 + RACE.draftCone * along) continue;
          if (o.flight.speed < fs.speed * 0.7) continue;
          cand = o; bd = dist;
        }
      }
      if (cand) {
        d.t += dt; d.target = cand;
        if (!d.on && d.t > 0.5) { d.on = true; ev.emit('racer:draft', { racer: r, target: cand, on: true }); }
        if (d.on) {
          r.draftBonus += (0.05 - r.draftBonus) * Math.min(1, dt * 2); addBoostMeter(fs, 3 * dt);
          if (d.t >= RACE.draftTime) {
            d.t = -2; startBoost(fs, 1.0, 1.35);
            ev.emit('racer:boost', { racer: r, kind: 'draft', duration: 1.0, power: 1.35 });
          }
        }
      } else {
        d.t = d.t > 0 ? Math.max(0, d.t - dt * 2) : Math.min(0, d.t + dt);
        r.draftBonus += (0 - r.draftBonus) * Math.min(1, dt * 3);
        if (d.on) { d.on = false; ev.emit('racer:draft', { racer: r, target: d.target, on: false }); d.target = null; }
      }
    }
  }

  // ------------------------------------------------------------------ respawn
  checkRespawns(dt) {
    const course = this.course;
    for (const r of this.racers) {
      if (r.finished) continue;
      const fs = r.flight;
      r.stuckT = fs.speed < 12 && this.clock > 2 && r.tumble <= 0 ? r.stuckT + dt : 0;
      if (r.stuckT > RACE.respawnStuckT) { this.respawn(r, 'stuck'); continue; }
      if (r.contactRun > RACE.respawnScrapeT) { this.respawn(r, 'scrape'); continue; }                    // riding a wall / rooftop for seconds: put it back on the line
      if ((this.frame + r.id) % 6 === 0 && r.onBranch < 0) {
        course.frameAt(r.s, _f);
        const e = Math.hypot(r.lateral / (_f.halfWidth || 90), r.vertical / (_f.halfHeight || 70));
        if (e > 3) r.lostT += dt * 6; else { r.lostT = 0; if (e < 1.5 && r.glitchT === 0) this.markGood(r, -1); }
        // safety net (redrock seed 2 roof throw): far above the corridor for ~1 s is never a legitimate line, whatever the projection says
        r.highT = r.vertical > Math.max(RACE.respawnHighM, 2.2 * (_f.halfHeight || 70)) ? (r.highT || 0) + dt * 6 : 0;
        if (r.highT > RACE.respawnHighT) { this.respawn(r, 'high'); continue; }
        if (r.lostT > RACE.respawnLostT) this.respawn(r, 'lost');
      } else if ((this.frame + r.id) % 6 === 0 && r.onBranch >= 0 && r.glitchT === 0) {
        const b = course.branches[r.onBranch];
        if (b) { b.frameAt(r.proj.u, _f); if (Math.hypot(r.lateral / (_f.halfWidth || 40), r.vertical / (_f.halfHeight || 30)) < 0.9) this.markGood(r, r.onBranch); }
      }
    }
  }

  /** Remember a known-good (position, distance) pair; a respawn restores exactly this pair, so dist - s is never changed by a respawn. */
  markGood(r, branch) {
    r.lastGoodS = r.s; r.lastGoodDist = r.dist; r.lastGoodBranch = branch; r.lastGoodU = r.proj.u ?? 0; r.lastGoodDebt = r.debt || 0;
  }

  respawn(r, reason) {
    const course = this.course, fs = r.flight, L = course.length;
    // branch-aware anchor: a racer last good inside a shortcut comes back on that shortcut's centreline, not at the mouth
    const gb = r.lastGoodBranch >= 0 ? course.branches[r.lastGoodBranch] : null;
    if (gb) gb.frameAt(Math.max(0, r.lastGoodU - 10), _f); else course.frameAt(r.lastGoodS - 10, _f);
    const pos = _f.pos.clone(), quat = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(_f.right, _f.up, _a.copy(_f.tangent).negate()));
    const meter = fs.boost.meter;
    resetFlightState(fs, pos, quat, fs.params.cruise * 0.6);
    fs.boost.meter = meter;
    r.tumble = 0; r.invuln = 3; r.stuckT = 0; r.highT = 0; r.contactRun = 0; r.lostT = 0; r.wrongWay = false; r.wrongT = 0; r.progSpeed = 0;
    r.prev.pos.copy(pos); r.prev.quat.copy(quat); r.render.pos.copy(pos); r.render.quat.copy(quat);
    reanchor(this, r, gb ? { branch: gb.index, u: Math.max(0, r.lastGoodU - 10), s: r.lastGoodS } : null);
    let back = r.s - r.lastGoodS; if (back > L / 2) back -= L; else if (back < -L / 2) back += L;
    r.dist = r.lastGoodDist + back;                                     // the same (dist - s) as at the last good moment, wherever it happens
    r.debt = gb && r.onBranch === r.lastGoodBranch ? r.lastGoodDebt : 0;
    this.stats.respawns++;
    this.game.events.emit('race:respawn', { racer: r, reason });
  }

  // ------------------------------------------------------------------ results
  standings() {
    return this.racers.slice().sort((a, b) => (a.finished && b.finished ? a.finishIndex - b.finishIndex : a.finished ? -1 : b.finished ? 1 : b.dist - a.dist));
  }
  results() {
    return { standings: this.standings().map((r, i) => ({ racer: r, place: i + 1, time: r.finishTime, bestLap: r.bestLap, points: GP_POINTS[i] ?? 0 })) };
  }

  /** Convenience for tests / debug: resolve a hit through the shared rules. */
  hit(victim, by, kind, opts) { return applyHit(this, victim, by, kind, opts); }

  /** Per rendered frame: interpolate transforms, animate models, update item visuals. */
  render(alpha, dt) {
    const headless = this.game.headless;
    for (const r of this.racers) {
      r.render.pos.lerpVectors(r.prev.pos, r.flight.pos, alpha); r.render.quat.slerpQuaternions(r.prev.quat, r.flight.quat, alpha);
      r.model.position.copy(r.render.pos); r.model.quaternion.copy(r.render.quat);
      if (!headless) updateAircraft(r.model, r, dt);
    }
    this.items.render(alpha, dt);
  }

  dispose() {
    for (const r of this.racers) {
      if (!this.game.headless) { this.game.fx?.detachRacer?.(r); this.game.audio?.detachRacer?.(r); }
      r.model.parent?.remove(r.model);
      disposeAircraft(r.model);                                    // the geometry is a shared module cache (select turntable, title demo): materials only
    }
    this.items.dispose(); this.racers.length = 0; this.order.length = 0;
  }
}
