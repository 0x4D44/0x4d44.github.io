// Item system: orbs, the ten items, homing missiles with counterplay, mines, drones, smoke, EMP, storm, and the heat-limited cannon.
// Contract: new ItemSystem(race); fixedUpdate(dt); render(alpha, dt); useItem(racer, backward); dispose().
// It EMITS events on race.game.events (see the event catalogue) and never calls fx/audio/ui directly.
//
// Missile counterplay (all four are tested in tests/race.test.mjs):
//   barrel   target.flight.barrel.t > 0 when the missile is within WEAPONS.missile.barrelRange        -> missile:evaded by 'barrel'
//   shield   target.shield > 0                                                                          -> shield:block + evaded 'shield'
//   outrun   missile burns out after ~4.5 s (speed decays below a boosting racer) / loses the target  -> evaded 'outrun'
//   obstacle missile flies into ground/hazard geometry                                                  -> evaded 'obstacle'
import * as THREE from 'three';
import { clamp } from '../util.js';
import { startBoost } from '../flight/flight.js';
import { ITEMS, WEAPONS, rollItem } from './balance.js';
import { applyHit, scaleSpeed } from './damage.js';
import { ItemVisuals } from './items-vis.js';

const W = WEAPONS;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ax = new THREE.Vector3(), _q = new THREE.Quaternion(), _u = new THREE.Vector3();

function dirTo(out, from, to) { return out.copy(to).sub(from); }

/** closest distance from point p to segment a-b. */
function segDist(a, b, p) {
  _v.copy(b).sub(a); const l2 = _v.lengthSq();
  const t = l2 > 1e-9 ? clamp(_w.copy(p).sub(a).dot(_v) / l2, 0, 1) : 0;
  return _w.copy(a).addScaledVector(_v, t).distanceTo(p);
}

export class ItemSystem {
  constructor(race) {
    this.race = race; this.game = race.game; this.course = race.course;
    this.rng = race.game.rng.fork(0x17e5);
    this.enabled = race.mode !== 'trial';
    this.orbs = []; this.missiles = []; this.mines = []; this.drones = []; this.clouds = []; this.bolts = [];
    this.nextId = 1; this.boltCursor = 0;
    for (let i = 0; i < 160; i++) this.bolts.push({ active: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, life: 0, owner: null, byDrone: false, scale: new THREE.Vector3(1, 1, 1) });
    if (this.enabled) {
      let k = 0;
      for (const b of this.course.itemBoxes || []) this.orbs.push({ pos: b.pos.clone(), s: b.s, lateral: b.lateral ?? 0, active: true, t: 0, scale: 1, phase: k++ * 1.7 });
    }
    this.vis = race.game.headless ? null : new ItemVisuals(race.game, this.orbs.length);
    this.out = { kind: '', depth: 0, normal: new THREE.Vector3(), soft: false };
  }

  // ------------------------------------------------------------------ public API
  give(racer, type, count) { racer.item = { type, count: count ?? ITEMS[type].count }; }

  /** The nearest missile currently tracking `racer`: { missile, dist, tti } or null (used by the AI and the HUD). */
  threatOf(racer) {
    let best = null;
    for (const m of this.missiles) {
      if (m.target !== racer) continue;
      const d = m.pos.distanceTo(racer.flight.pos);
      if (!best || d < best.dist) best = { missile: m, dist: d, tti: 0 };
    }
    if (best) {
      const m = best.missile; dirTo(_u, m.pos, racer.flight.pos).normalize();
      const closing = m.dir.dot(_u) * m.speed - racer.flight.vel.dot(_u);
      best.tti = best.dist / Math.max(closing, 25);
    }
    return best;
  }

  useItem(racer, backward = false) {
    const it = racer.item;
    if (!it || it.count <= 0 || racer.finished || racer.tumble > 0 || this.race.state !== 'racing' && this.race.state !== 'finishing') return false;
    const ok = this.apply(racer, it.type, backward);
    if (!ok) return false;
    this.game.events.emit('item:use', { racer, type: it.type, backward: !!backward });
    if (--it.count <= 0) racer.item = null;
    return true;
  }

  apply(r, type, backward) {
    const fs = r.flight;
    switch (type) {
      case 'missile': case 'triple': this.launchMissile(r, backward); return true;
      case 'mine': this.dropMine(r); return true;
      case 'turbo': case 'turbo3': {
        const c = W[type]; startBoost(fs, c.time, c.power);
        this.game.events.emit('racer:boost', { racer: r, kind: 'item', duration: c.time, power: c.power }); return true;
      }
      case 'shield': r.shield = W.shield.time; this.game.events.emit('shield:up', { racer: r }); return true;
      case 'emp': this.fireEmp(r); return true;
      case 'storm': return this.castStorm(r);
      case 'smoke': this.deploySmoke(r); return true;
      case 'drone': this.launchDrone(r); return true;
      default: return false;
    }
  }

  // ------------------------------------------------------------------ item behaviours
  launchMissile(r, backward) {
    const fs = r.flight, lock = r.lock, ev = this.game.events;
    const dir = (backward ? _ax.copy(fs.forward).negate() : _ax.copy(fs.forward)).clone();
    let target = null, turn = 0;
    if (lock.target && lock.progress >= 1) { target = lock.target; turn = W.missile.turn; }
    else if (lock.target && lock.progress >= 0.35) { target = lock.target; turn = W.missile.turnWeak; }
    else { target = this.bestCandidate(r, backward, W.missile.lockCone * 1.5); if (target) turn = W.missile.turnDumb; }
    const m = {
      id: this.nextId++, owner: r, target, pos: fs.pos.clone().addScaledVector(dir, r.radius + 4), prev: new THREE.Vector3(), dir,
      speed: backward ? W.missile.speed * 0.8 : Math.max(W.missile.speed * 0.75, fs.speed + 35), turn, t: 0, warnT: 0, mesh: null, locked: lock.progress >= 1,
      pass: false,
    };
    m.prev.copy(m.pos);
    if (this.vis) { m.mesh = this.vis.missiles.acquire(); if (m.mesh) { m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), m.dir); } }
    this.missiles.push(m);
    ev.emit('missile:launch', { id: m.id, owner: r, target, pos: m.pos.clone() });
    lock.target = null; lock.progress = 0;
  }

  dropMine(r) {
    const fs = r.flight, pos = fs.pos.clone().addScaledVector(fs.forward, -(r.radius + 12));
    const m = { owner: r, pos, t: 0, mesh: this.vis ? this.vis.mines.acquire() : null };
    if (m.mesh) m.mesh.position.copy(pos);
    this.mines.push(m);
    this.game.events.emit('mine:drop', { owner: r, pos: pos.clone() });
  }

  fireEmp(r) {
    const ev = this.game.events, pos = r.flight.pos.clone();
    ev.emit('emp:fire', { owner: r, pos, radius: W.emp.radius });
    for (const o of this.race.racers) {
      if (o === r || o.finished) continue;
      if (o.flight.pos.distanceTo(pos) > W.emp.radius) continue;
      if (applyHit(this.race, o, r, 'emp', { loss: W.emp.loss, severity: 0.5, noInvuln: true, invuln: 0.3 })) o.empT = W.emp.stun;
    }
  }

  /** Lightning on the best-placed unshielded racer ahead of the caster (never a shielded one). Returns false if there is nobody to hit. */
  castStorm(r) {
    let tgt = null;
    for (const o of this.race.order) {
      if (o === r || o.finished || o.shield > 0 || o.invuln > 0) continue;
      if (o.place < r.place || (r.place === 1 && !tgt)) { tgt = o; break; }
    }
    if (!tgt) return false;
    const pos = tgt.flight.pos.clone();
    this.game.events.emit('lightning:strike', { owner: r, target: tgt, pos });
    applyHit(this.race, tgt, r, 'lightning', { tumble: W.storm.tumble, loss: W.storm.loss, severity: 1, pos });
    return true;
  }

  deploySmoke(r) {
    const fs = r.flight, pos = fs.pos.clone().addScaledVector(fs.forward, -30);
    this.clouds.push({ owner: r, pos, t: 0 });
    this.game.events.emit('smoke:deploy', { owner: r, pos: pos.clone() });
  }

  launchDrone(r) {
    const fs = r.flight, pos = fs.pos.clone().addScaledVector(fs.forward, 12).addScaledVector(fs.up, 5);
    const d = { owner: r, pos, prev: pos.clone(), dir: fs.forward.clone(), speed: fs.speed * 1.05, t: 0, fireT: 0.8, target: null, retargetT: 0, mesh: this.vis ? this.vis.drones.acquire() : null, id: this.nextId++ };
    this.drones.push(d);
    this.game.events.emit('drone:launch', { owner: r, drone: d });
  }

  // ------------------------------------------------------------------ cannon
  fireBolt(r, byDrone, from, dirIn) {
    const b = this.bolts[this.boltCursor]; this.boltCursor = (this.boltCursor + 1) % this.bolts.length;
    b.active = true; b.owner = r; b.byDrone = byDrone; b.life = W.cannon.life; b.speed = W.cannon.speed + (byDrone ? 70 : r.flight.speed);
    b.pos.copy(from); b.prev.copy(from); b.dir.copy(dirIn);
    return b;
  }

  /** Aim direction with soft assist toward the best target near the nose (also used by AI so humans and AI share accuracy rules). */
  aimDir(r, out) {
    const fs = r.flight; out.copy(fs.forward);
    let best = null, bd = W.cannon.aimCone;
    for (const o of this.race.racers) {
      if (o === r || o.finished) continue;
      dirTo(_u, fs.pos, o.flight.pos); const d = _u.length(); if (d < 30 || d > 420) continue;
      _u.divideScalar(d); const ang = Math.acos(clamp(_u.dot(fs.forward), -1, 1));
      if (ang < bd) { bd = ang; best = o; }
    }
    if (best) {
      const t = dirTo(_u, fs.pos, best.flight.pos).length() / (W.cannon.speed + fs.speed);
      _u.copy(best.flight.pos).addScaledVector(best.flight.vel, t).sub(fs.pos).normalize();
      out.lerp(_u, W.cannon.aimAssist).normalize();
    }
    return out;
  }

  stepCannon(r, dt) {
    const c = W.cannon;
    r.fireT = Math.max(0, r.fireT - dt);
    if (r.heat > 0) r.heat = Math.max(0, r.heat - (r.overheated ? c.coolLocked : c.cool) * dt);
    if (r.overheated && r.heat <= c.resume) r.overheated = false;
    if (r.cannonCombo.t > 0) { r.cannonCombo.t -= dt; if (r.cannonCombo.t <= 0) r.cannonCombo.n = 0; }
    if (!this.enabled || !r.controls.fire || r.overheated || r.tumble > 0 || r.finished || r.empT > 0 || r.fireT > 0) return;
    r.fireT = c.interval; r.heat += c.heatPerShot; r.gun = -r.gun;
    if (r.heat >= 1) { r.heat = 1; r.overheated = true; }
    const fs = r.flight, dir = this.aimDir(r, _ax);
    dir.x += this.rng.range(-0.004, 0.004); dir.y += this.rng.range(-0.004, 0.004); dir.normalize();
    _w.copy(fs.pos).addScaledVector(fs.forward, r.radius + 2).addScaledVector(fs.right, r.gun * r.radius * 0.45);
    this.fireBolt(r, false, _w, dir);
    this.game.events.emit('cannon:fire', { racer: r, pos: _w.clone(), dir: dir.clone() });
  }

  stepBolts(dt) {
    const racers = this.race.racers, ev = this.game.events;
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.prev.copy(b.pos); b.pos.addScaledVector(b.dir, b.speed * dt); b.life -= dt;
      if (b.life <= 0) { b.active = false; continue; }
      for (const o of racers) {
        if (o === b.owner || o.finished) continue;
        if (segDist(b.prev, b.pos, o.flight.pos) > o.radius + W.cannon.hitPad) continue;
        b.active = false;
        const hitPos = o.flight.pos.clone();
        ev.emit('cannon:hit', { racer: b.owner, target: o, pos: hitPos });
        if (applyHit(this.race, o, b.owner, 'cannon', { loss: 1 - W.cannon.stagger, severity: 0.25, shieldCost: 1.2, noInvuln: true, pos: hitPos })) {
          o.cannonCombo.n++; o.cannonCombo.t = W.cannon.comboWindow;
          if (o.cannonCombo.n >= W.cannon.comboHits) { o.cannonCombo.n = 0; applyHit(this.race, o, b.owner, 'cannon', { tumble: W.cannon.comboTumble, loss: 0.2, severity: 0.6, pierce: true, pos: hitPos }); }
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ locks
  bestCandidate(r, backward, cone) {
    const fs = r.flight; let best = null, bd = cone;
    for (const o of this.race.racers) {
      if (o === r || o.finished || o.blind > 0) continue;
      dirTo(_u, fs.pos, o.flight.pos); const d = _u.length();
      if (d < W.missile.lockMin || d > W.missile.lockMax) continue;
      _u.divideScalar(d);
      const dot = backward ? -_u.dot(fs.forward) : _u.dot(fs.forward);
      const ang = Math.acos(clamp(dot, -1, 1));
      if (ang < bd) { bd = ang; best = o; }
    }
    return best;
  }

  stepLocks(dt) {
    const ev = this.game.events;
    for (const r of this.race.racers) {
      const it = r.item, lock = r.lock;
      if (!it || (it.type !== 'missile' && it.type !== 'triple') || r.tumble > 0 || r.finished) { lock.target = null; lock.progress = 0; continue; }
      const cand = this.bestCandidate(r, r.controls.itemBack, W.missile.lockCone);
      lock.emitT -= dt;
      if (cand && cand === lock.target) {
        const before = lock.progress; lock.progress = Math.min(1, lock.progress + dt / W.missile.lockTime);
        if (lock.emitT <= 0 || (before < 1 && lock.progress >= 1)) { lock.emitT = 0.12; ev.emit('missile:lock', { owner: r, target: lock.target, progress: lock.progress }); }
      } else if (cand) { lock.target = cand; lock.progress = 0; lock.emitT = 0; }
      else if (lock.target) { lock.progress -= dt * 2; if (lock.progress <= 0) { lock.target = null; lock.progress = 0; } }
    }
  }

  // ------------------------------------------------------------------ projectiles
  inSmoke(r) { for (const c of this.clouds) if (c.owner !== r && c.pos.distanceToSquared(r.flight.pos) < W.smoke.radius * W.smoke.radius) return true; return false; }

  endMissile(m, by, target) {
    this.game.events.emit('missile:evaded', { missile: m, target: target || m.target || null, by });
    this.removeMissile(m);
  }
  removeMissile(m) {
    m.dead = true;
    if (m.mesh) { this.vis.missiles.release(m.mesh); m.mesh = null; }
  }

  stepMissiles(dt) {
    const racers = this.race.racers, ev = this.game.events, course = this.course;
    for (const m of this.missiles) {
      if (m.dead) continue;
      m.prev.copy(m.pos); m.t += dt;
      let tgt = m.target;
      if (tgt && (tgt.finished && tgt.flight.speed < 1)) tgt = m.target = null;
      // guidance
      if (tgt && m.t > W.missile.armT) {
        const dist = tgt.flight.pos.distanceTo(m.pos);
        const lead = Math.min(dist / Math.max(m.speed, 1), 0.8) * 0.7;
        _w.copy(tgt.flight.pos).addScaledVector(tgt.flight.vel, lead).sub(m.pos).normalize();
        let turn = m.turn; if (this.inSmoke(tgt)) turn *= 0.4;
        const ang = Math.acos(clamp(m.dir.dot(_w), -1, 1));
        if (ang > 1e-4) {
          _ax.crossVectors(m.dir, _w); const l = _ax.length();
          if (l < 1e-6) _ax.set(0, 1, 0); else _ax.divideScalar(l);
          _q.setFromAxisAngle(_ax, Math.min(ang, turn * dt)); m.dir.applyQuaternion(_q).normalize();
        }
      }
      // speed profile: boost to cruise, burn out after 4.5 s (a boosting racer outruns it)
      if (m.t < 4.5) m.speed = Math.min(W.missile.speed, m.speed + 240 * dt); else m.speed = Math.max(100, m.speed - 32 * dt);
      m.pos.addScaledVector(m.dir, m.speed * dt);
      // warnings
      if (tgt) { m.warnT -= dt; if (m.warnT <= 0) { m.warnT = 0.5; ev.emit('missile:warn', { target: tgt, missile: m, dist: tgt.flight.pos.distanceTo(m.pos) }); } }
      // racers on the flight path (target first)
      let resolved = false;
      for (const o of racers) {
        if (o === m.owner || o.finished && o.flight.speed < 1) continue;
        const d = segDist(m.prev, m.pos, o.flight.pos), isT = o === tgt;
        if (isT && m.t > W.missile.armT && o.flight.barrel.t > 0 && d < W.missile.barrelRange) { this.endMissile(m, 'barrel', o); resolved = true; break; }
        if (d > o.radius + W.missile.hitPad) continue;
        if (!isT && m.t < 0.4) continue;
        if (o.flight.barrel.t > 0) { this.endMissile(m, 'barrel', o); resolved = true; break; }
        if (o.invuln > 0 && o.shield <= 0) { if (isT) m.target = null; continue; }          // pass through an invulnerable racer, never stuck
        const hadShield = o.shield > 0, pos = m.pos.clone();
        const landed = applyHit(this.race, o, m.owner, 'missile', { tumble: W.missile.tumble, loss: W.missile.loss, severity: 0.9, pos });
        if (landed) { ev.emit('missile:hit', { missile: m, target: o, owner: m.owner, pos }); this.removeMissile(m); }
        else this.endMissile(m, hadShield ? 'shield' : 'outrun', o);
        resolved = true; break;
      }
      if (resolved) continue;
      // obstacles
      if (course.collide(m.pos, 1.5, null, this.out) && this.out.kind !== 'wall') { this.endMissile(m, 'obstacle', tgt); continue; }
      // lost the quarry
      if (m.t > W.missile.life || (tgt && m.t > 1.5 && tgt.flight.pos.distanceTo(m.pos) > 480)) { this.endMissile(m, 'outrun', tgt); continue; }
    }
    this.missiles = this.missiles.filter((m) => !m.dead);
  }

  stepMines(dt) {
    const ev = this.game.events;
    for (const m of this.mines) {
      m.t += dt;
      if (m.t > W.mine.life) { this.removeMine(m); continue; }
      if (m.t < W.mine.arm) continue;
      let boom = false;
      for (const o of this.race.racers) {
        if (o.finished) continue;
        if (o === m.owner && m.t < W.mine.ownerGrace) continue;
        if (o.flight.pos.distanceTo(m.pos) > W.mine.radius + o.radius * 0.4) continue;
        boom = true;
        ev.emit('mine:hit', { victim: o, pos: m.pos.clone() });
        applyHit(this.race, o, m.owner, 'mine', { tumble: W.mine.tumble, loss: W.mine.loss, severity: 0.85, pos: m.pos });
      }
      if (boom) this.removeMine(m);
    }
    this.mines = this.mines.filter((m) => !m.dead);
  }
  removeMine(m) { m.dead = true; if (m.mesh) { this.vis.mines.release(m.mesh); m.mesh = null; } }

  stepClouds(dt) {
    for (const c of this.clouds) {
      c.t += dt;
      for (const o of this.race.racers) {
        if (o === c.owner || o.finished) continue;
        if (o.flight.pos.distanceToSquared(c.pos) < W.smoke.radius * W.smoke.radius) { o.blind = 0.5; scaleSpeed(o.flight, 1 - 0.1 * dt); }
      }
    }
    this.clouds = this.clouds.filter((c) => c.t < W.smoke.life);
  }

  stepDrones(dt) {
    const racers = this.race.order, ev = this.game.events;
    for (const d of this.drones) {
      if (d.dead) continue;
      d.prev.copy(d.pos); d.t += dt;
      if (d.t > W.drone.life || d.owner.finished) { this.removeDrone(d); ev.emit('drone:expire', { owner: d.owner, drone: d }); continue; }
      d.retargetT -= dt;
      if (d.retargetT <= 0 || !d.target || d.target.finished) {
        d.retargetT = 0.6; const i = racers.indexOf(d.owner);
        d.target = (i > 0 ? racers[i - 1] : racers[i + 1]) || null;
        if (d.target && d.target.finished) d.target = null;
      }
      const tgt = d.target;
      if (tgt) _w.copy(tgt.flight.pos).addScaledVector(tgt.flight.forward, -22).addScaledVector(tgt.flight.up, 4);
      else _w.copy(d.owner.flight.pos).addScaledVector(d.owner.flight.forward, 40);
      const dist = _w.distanceTo(d.pos);
      dirTo(_u, d.pos, _w).normalize();
      const ang = Math.acos(clamp(d.dir.dot(_u), -1, 1));
      if (ang > 1e-4) { _ax.crossVectors(d.dir, _u); const l = _ax.length(); if (l < 1e-6) _ax.set(0, 1, 0); else _ax.divideScalar(l); _q.setFromAxisAngle(_ax, Math.min(ang, 2.8 * dt)); d.dir.applyQuaternion(_q).normalize(); }
      const base = (tgt ? tgt.flight.speed : d.owner.flight.speed) * W.drone.speedMul;
      d.speed += (clamp(base + clamp(dist - 25, -25, 70), 50, 230) - d.speed) * Math.min(1, dt * 3);
      d.pos.addScaledVector(d.dir, d.speed * dt);
      if (this.course.collide(d.pos, 2, null, this.out) && this.out.kind !== 'wall') { this.removeDrone(d); continue; }
      d.fireT -= dt;
      if (tgt && d.fireT <= 0 && d.t > 1) {
        dirTo(_u, d.pos, tgt.flight.pos); const range = _u.length(); _u.divideScalar(range);
        if (range < W.drone.range && range > 20 && d.dir.dot(_u) > 0.97) {
          d.fireT = W.drone.fireEvery;
          const flightT = range / (W.cannon.speed + 70);
          _u.copy(tgt.flight.pos).addScaledVector(tgt.flight.vel, flightT).sub(d.pos).normalize();
          this.fireBolt(d.owner, true, d.pos, _u);
        }
      }
    }
    this.drones = this.drones.filter((d) => !d.dead);
  }
  removeDrone(d) { d.dead = true; if (d.mesh) { this.vis.drones.release(d.mesh); d.mesh = null; } }

  // ------------------------------------------------------------------ orbs
  stepOrbs(dt) {
    const ev = this.game.events;
    for (const o of this.orbs) {
      if (!o.active) { o.t -= dt; o.scale = Math.min(1, Math.max(0, 1 - o.t / 0.5)); if (o.t <= 0) { o.active = true; } continue; }
      o.scale = Math.min(1, o.scale + dt * 3);
      for (const r of this.race.racers) {
        if (r.item || r.finished || r.tumble > 0) continue;
        if (r.flight.pos.distanceToSquared(o.pos) > (9 + r.radius * 0.5) ** 2) continue;
        const item = rollItem(this.rng, r.place, this.race.racers.length);
        r.item = item; o.active = false; o.t = 6; o.scale = 0;
        ev.emit('pickup:orb', { racer: r, item: item.type, pos: o.pos.clone() });
        break;
      }
    }
  }

  // ------------------------------------------------------------------ step / render
  fixedUpdate(dt) {
    for (const r of this.race.racers) this.stepCannon(r, dt);
    if (this.enabled) { this.stepOrbs(dt); this.stepLocks(dt); }
    this.stepBolts(dt); this.stepMissiles(dt); this.stepMines(dt); this.stepClouds(dt); this.stepDrones(dt);
  }

  render(alpha, dt) {
    const v = this.vis; if (!v) return;
    v.updateOrbs(dt, this.orbs);
    for (const m of this.missiles) if (m.mesh) {
      v.place(m.mesh, m.prev, m.pos, alpha, m.dir);
      const f = m.mesh.userData.flame; if (f) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    }
    for (const m of this.mines) if (m.mesh) {
      const k = 0.6 + 0.4 * Math.sin(m.t * 9); m.mesh.userData.light.scale.setScalar(k + 0.4); m.mesh.rotation.y += dt * 0.8; m.mesh.userData.halo.scale.setScalar(0.9 + 0.15 * k);
    }
    for (const d of this.drones) if (d.mesh) { v.place(d.mesh, d.prev, d.pos, alpha, d.dir); d.mesh.userData.rotor.rotation.z += dt * 18; }
    v.updateBolts(alpha, this.bolts, this.bolts.length);
  }

  dispose() {
    this.vis?.dispose(); this.vis = null;
    this.missiles.length = 0; this.mines.length = 0; this.drones.length = 0; this.clouds.length = 0; this.orbs.length = 0;
  }
}
