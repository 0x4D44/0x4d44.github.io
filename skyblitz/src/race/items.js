// Item system: orbs, the ten items, homing missiles with counterplay, mines, drones, smoke, EMP, storm, and the heat-limited cannon.
// Contract: new ItemSystem(race); fixedUpdate(dt); render(alpha, dt); useItem(racer, backward); dispose().
// It EMITS events on race.game.events (see the event catalogue) and never calls fx/audio/ui directly.
//
// Missiles follow the COURSE (a carrot up the centre line at their own lateral / vertical offset, blending onto the target's line as it gets near, then plain
// pursuit), so a canyon bend does not eat them. The lock is the nearest racer AHEAD ON THE COURSE inside a cone measured in the course frame. Projectiles keep a
// per-body projection hint (proj.s): one local window per step, never a scan of the whole course.
//
// Missile counterplay (all four are tested in tests/race-items.test.mjs):
//   barrel   a roll is a TIMING WINDOW: it protects between evadeFrom and evadeTo of the roll (WEAPONS.missile)  -> missile:evaded by 'barrel'
//   shield   target.shield > 0                                                                          -> shield:block + evaded 'shield'
//   outrun   missile burns out after ~4.5 s (speed decays below a boosting racer) / loses the target  -> evaded 'outrun'
//   obstacle missile flies into ground/hazard geometry                                                  -> evaded 'obstacle'
import * as THREE from 'three';
import { clamp } from '../util.js';
import { startBoost, FLIGHT } from '../flight/flight.js';
import { ITEMS, WEAPONS, rollItem } from './balance.js';
import { applyHit, scaleSpeed } from './damage.js';
import { ItemVisuals } from './items-vis.js';

const W = WEAPONS;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ax = new THREE.Vector3(), _q = new THREE.Quaternion(), _u = new THREE.Vector3(), _aim = new THREE.Vector3(), _lead = new THREE.Vector3();
const _fr = {}, _bp = {}, _off = { lat: 0, vert: 0 };
const INVULN_LOCK = 0.5;     // a racer with more grace than this (the long one after a landed hit) cannot be locked: a missile would only be spent on it

function dirTo(out, from, to) { return out.copy(to).sub(from); }
const wrapD = (d, L) => (d > L * 0.5 ? d - L : d < -L * 0.5 ? d + L : d);
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** A fresh course projection record (the shape CourseLayout.project fills). */
const newProj = () => ({ s: 0, lateral: 0, vertical: 0, dist: 0, branch: -1, u: 0 });
/** Drop the dead entries of a pool array in place (no per-step allocation). */
function compact(a) { let k = 0; for (let i = 0; i < a.length; i++) { const x = a[i]; if (!x.dead) a[k++] = x; } a.length = k; }

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
    this.nextId = 1; this.boltCursor = 0; this._droneNow = null;
    for (let i = 0; i < 160; i++) this.bolts.push({ active: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, life: 0, owner: null, byDrone: false, drone: null, scale: new THREE.Vector3(1, 1, 1) });
    if (this.enabled) {
      let k = 0;
      for (const b of this.course.itemBoxes || []) this.orbs.push({ pos: b.pos.clone(), s: b.s, lateral: b.lateral ?? 0, active: true, t: 0, scale: 1, phase: k++ * 1.7 });
    }
    this.vis = race.game.headless ? null : new ItemVisuals(race.game, this.orbs.length);
    this.out = { kind: '', depth: 0, normal: new THREE.Vector3(), soft: false };
    // main-path hazards in course coordinates (where the guidance steers round them): s, lateral / vertical offset of the home position, radius, pillar or ball
    this.hz = [];
    for (const h of this.course.hazards || []) {
      if (h.branch >= 0 || !h.pos || !this.course.frameAt) continue;
      this.course.frameAt(h.s, _fr); _v.copy(h.home || h.pos).sub(_fr.pos);
      this.hz.push({ s: h.s, lat: _v.dot(_fr.right), vert: _v.dot(_fr.up), r: h.radius, column: !!h.column });
    }
  }

  // ------------------------------------------------------------------ public API
  give(racer, type, count) { racer.item = { type, count: count ?? ITEMS[type].count }; }

  /**
   * The nearest missile currently tracking `racer`: { missile, dist, tti, evade, closing } or null (used by the AI and the HUD).
   * tti is seconds until the missile reaches the hit radius, from a smoothed closing speed (no jumps). `evade` is true while a barrel roll started
   * NOW would protect the racer when the missile arrives (roll ready, and inside the timing window). The object is reused: read it, do not keep it.
   */
  threatOf(racer) {
    let best = null;
    for (const m of this.missiles) {
      if (m.target !== racer || m.dead) continue;
      if (!best || m.threat.dist < best.dist) best = m.threat;
    }
    return best;
  }

  /** Is `o` in the protected part of a barrel roll right now? (evadeFrom..evadeTo of the roll after it started.) */
  rollProtects(o) {
    const T = FLIGHT.barrelTime, b = o.flight.barrel.t;
    if (!(b > 0)) return false;
    const e = T - b;
    return e >= W.missile.evadeFrom * T && e <= W.missile.evadeTo * T;
  }
  /** Could `o` start a barrel roll this instant? */
  canRoll(o) {
    const fs = o.flight;
    return fs.barrel.cooldown <= 0 && fs.barrel.t <= 0 && o.tumble <= 0 && !fs.stall.active && o.empT <= 0 && !o.finished;
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
  /**
   * First course projection of a missile or drone launched by `r`: it starts in the owner's frame (hint = the owner's s, and the owner's shortcut tube when it
   * is inside one: a tube lies hundreds of metres from the main line, so a main-line projection of a point in it is garbage), and from then on only ever
   * searches a local window round its own previous s.
   */
  startProj(body, r) {
    body.proj.branch = r.proj.branch >= 0 ? r.proj.branch : -1; body.proj.u = r.proj.u ?? 0;
    this.course.project(body.pos, r.proj.s, body.proj);
  }

  launchMissile(r, backward) {
    const fs = r.flight, lock = r.lock, ev = this.game.events;
    const dir = (backward ? _ax.copy(fs.forward).negate() : _ax.copy(fs.forward)).clone();
    let target = null, turn = 0;
    if (lock.target && lock.progress >= 1) { target = lock.target; turn = W.missile.turn; }
    else if (lock.target && lock.progress >= 0.35) { target = lock.target; turn = W.missile.turnWeak; }
    else { target = this.bestCandidate(r, backward, W.missile.lockCone * 1.5); if (target) turn = W.missile.turnDumb; }
    const m = {
      id: this.nextId++, owner: r, target, pos: fs.pos.clone().addScaledVector(dir, r.radius + 4), prev: new THREE.Vector3(), dir, sign: backward ? -1 : 1,
      speed: backward ? W.missile.speed * 0.8 : Math.max(W.missile.speed * 0.75, fs.speed + 35), turn, t: 0, warnT: 0, mesh: null, locked: lock.progress >= 1,
      passT: 0, proj: newProj(), dist: 0, closing: 0, evadeSent: false, seekT: 0,
      threat: { missile: null, dist: 0, tti: 99, evade: false, closing: 0 },
    };
    m.threat.missile = m; m.prev.copy(m.pos);
    this.startProj(m, r);
    if (target) this.trackThreat(m, target, 0);
    if (this.vis) { m.mesh = this.vis.missiles.acquire(); if (m.mesh) { m.mesh.position.copy(m.pos); m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), m.dir); } }
    this.missiles.push(m);
    ev.emit('missile:launch', { id: m.id, owner: r, target, pos: m.pos.clone(), locked: m.locked, targetId: target ? target.id : null, targetName: target ? target.name : null });
    this.dropLock(r, 'fired');
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

  /**
   * Smoke screen: dropped `back` m behind the owner on the PREDICTED LINE of the nearest follower (the follower's own lateral / vertical offset on the course
   * frame), so the racer chasing you flies into it; with nobody within `reach` m it sits on the owner's own line.
   */
  deploySmoke(r) {
    const fs = r.flight, S = W.smoke, course = this.course, pos = new THREE.Vector3();
    let f = null, bg = S.reach;
    for (const o of this.race.racers) {
      if (o === r || o.finished || o.onBranch !== r.onBranch) continue;
      const g = wrapD(r.s - o.s, course.length);
      if (g > 0 && g < bg) { bg = g; f = o; }
    }
    if (f) {
      const br = r.onBranch >= 0 ? course.branches[r.onBranch] : null;
      const fr = br ? br.frameAt(r.proj.u - S.back, _fr) : course.frameAt(r.s - S.back, _fr);
      let lat = f.lateral, vert = f.vertical;
      const e = Math.hypot(lat / fr.halfWidth, vert / fr.halfHeight);
      if (e > 0.7) { lat *= 0.7 / e; vert *= 0.7 / e; }
      pos.copy(fr.pos).addScaledVector(fr.right, lat).addScaledVector(fr.up, vert);
    } else pos.copy(fs.pos).addScaledVector(fs.forward, -S.back);
    this.clouds.push({ owner: r, pos, t: 0 });
    this.game.events.emit('smoke:deploy', { owner: r, pos: pos.clone(), radius: S.radius, life: S.life, target: f });
  }

  launchDrone(r) {
    const fs = r.flight, pos = fs.pos.clone().addScaledVector(fs.forward, 12).addScaledVector(fs.up, 5);
    const d = { owner: r, pos, prev: pos.clone(), dir: fs.forward.clone(), speed: fs.speed * 1.05, t: 0, fireT: 0.8, target: null, retargetT: 0, hits: 0, shots: 0, proj: newProj(), mesh: this.vis ? this.vis.drones.acquire() : null, id: this.nextId++ };
    this.startProj(d, r);
    this.drones.push(d);
    this.game.events.emit('drone:launch', { owner: r, drone: d });
  }

  // ------------------------------------------------------------------ cannon
  fireBolt(r, byDrone, from, dirIn) {
    const b = this.bolts[this.boltCursor]; this.boltCursor = (this.boltCursor + 1) % this.bolts.length;
    b.active = true; b.owner = r; b.byDrone = byDrone; b.life = W.cannon.life; b.speed = W.cannon.speed + (byDrone ? 70 : r.flight.speed);
    b.drone = byDrone ? this._droneNow : null;                       // the drone being stepped: its landed bolts count against its maxHits
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
          if (b.drone) b.drone.hits++;                                     // a drone is spent by LANDED bolts (not by a shield or a grace soaking them up)
          o.cannonCombo.n++; o.cannonCombo.t = W.cannon.comboWindow;
          if (o.cannonCombo.n >= W.cannon.comboHits) { o.cannonCombo.n = 0; applyHit(this.race, o, b.owner, 'cannon', { tumble: W.cannon.comboTumble, loss: 0.2, severity: 0.6, pierce: true, pos: hitPos }); }
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ locks
  /**
   * The racer a missile fired by `r` should lock: the NEAREST racer ahead on the course (behind it, when `backward`) inside a cone measured in the course frame
   * (angle of the target's lateral / vertical offset against the along-course gap), not whoever sits closest to the nose. `keep` is the current lock: it is
   * preferred and survives a wider cone, so the reticle does not flip between two rivals. Blind racers cannot be locked, and neither can a racer one of `r`'s
   * own missiles is already chasing (the next shot of a triple goes to the next racer instead of into the tumble the first one causes).
   */
  bestCandidate(r, backward, cone, keep = null) {
    const L = this.course.length, sign = backward ? -1 : 1, M = W.missile, fs = r.flight;
    let best = null, bs = Infinity;
    for (const o of this.race.racers) {
      if (o === r || o.finished || o.blind > 0 || o.invuln > INVULN_LOCK || this.chasedBy(o, r)) continue;
      let gap, ang;
      if (o.onBranch === r.onBranch) {
        gap = sign * wrapD(o.s - r.s, L);
        if (gap < M.lockMin || gap > M.lockMax) continue;
        ang = Math.atan2(Math.hypot(o.lateral - r.lateral, o.vertical - r.vertical), gap);
      } else {                                            // a shortcut vs the main line: the two course frames are not comparable, use the nose
        dirTo(_u, fs.pos, o.flight.pos); gap = _u.length();
        if (gap < M.lockMin || gap > M.lockMax) continue;
        ang = Math.acos(clamp(sign * _u.divideScalar(gap).dot(fs.forward), -1, 1));
      }
      if (ang > (o === keep ? cone * M.lockStick : cone)) continue;
      const score = o === keep ? gap * 0.5 : gap;
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }
  /** Is a live missile fired by `owner` chasing `o`? */
  chasedBy(o, owner) {
    for (const m of this.missiles) if (!m.dead && m.target === o && m.owner === owner) return true;
    return false;
  }

  /**
   * In-flight seeker: the nearest racer ahead of missile `m` ON THE COURSE (gap 15..seekRange m, same path, inside 1.5 x the lock cone in the course frame) that it
   * can still hurt, or null. Used when a missile flies without a quarry (fired with no lock) or its quarry cannot be hit any more (finished, or tumbling in the grace of
   * another hit): the shot is not thrown away.
   */
  seek(m) {
    const L = this.course.length, M = W.missile, p = m.proj;
    let best = null, bg = M.seekRange;
    for (const o of this.race.racers) {
      if (o === m.owner || o === m.target || o.finished || o.blind > 0 || o.invuln > INVULN_LOCK || o.onBranch !== p.branch) continue;
      const gap = m.sign * wrapD(o.s - p.s, L);
      if (gap < 15 || gap > bg) continue;
      if (Math.atan2(Math.hypot(o.lateral - p.lateral, o.vertical - p.vertical), gap) > M.lockCone * 1.5) continue;
      bg = gap; best = o;
    }
    return best;
  }

  /** Clear `r`'s lock and tell the HUD (missile:unlock). reason: 'lost' | 'blind' | 'item' | 'fired'. */
  dropLock(r, reason) {
    const lock = r.lock, t = lock.target;
    if (t) this.game.events.emit('missile:unlock', { owner: r, target: t, targetId: t.id, targetName: t.name, reason });
    lock.target = null; lock.progress = 0; lock.emitT = 0;
  }

  stepLocks(dt) {
    const ev = this.game.events;
    for (const r of this.race.racers) {
      const it = r.item, lock = r.lock;
      if (!it || (it.type !== 'missile' && it.type !== 'triple') || r.tumble > 0 || r.finished || r.blind > 0) { this.dropLock(r, r.blind > 0 ? 'blind' : 'item'); continue; }
      const lt = lock.target;
      if (lt && (lt.blind > 0 || lt.finished || lt.invuln > INVULN_LOCK)) this.dropLock(r, lt.blind > 0 ? 'blind' : lt.finished ? 'lost' : 'invuln');      // smoke, or a hit's grace, breaks a lock at once
      const cand = this.bestCandidate(r, r.controls.itemBack, W.missile.lockCone, lock.target);
      lock.emitT -= dt;
      if (cand && cand === lock.target) {
        const before = lock.progress; lock.progress = Math.min(1, lock.progress + dt / W.missile.lockTime);
        if (lock.emitT <= 0 || (before < 1 && lock.progress >= 1)) { lock.emitT = 0.12; ev.emit('missile:lock', { owner: r, target: lock.target, progress: lock.progress, targetId: lock.target.id, targetName: lock.target.name }); }
      } else if (cand) { this.dropLock(r, 'lost'); lock.target = cand; lock.progress = 0; lock.emitT = 0; }
      else if (lock.target) { lock.progress -= dt * 2; if (lock.progress <= 0) this.dropLock(r, 'lost'); }
    }
  }

  // ------------------------------------------------------------------ projectiles
  endMissile(m, by, target) {
    this.game.events.emit('missile:evaded', { missile: m, target: target || m.target || null, by });
    this.removeMissile(m);
  }
  removeMissile(m) {
    m.dead = true;
    if (m.mesh) { this.vis.missiles.release(m.mesh); m.mesh = null; }
  }

  /** Is the straight line a -> b buried in the ground? (three samples; used to keep a missile on the course instead of cutting a corner through terrain.) */
  blocked(a, b) {
    for (let k = 1; k <= 3; k++) {
      const t = k * 0.25, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
      if (this.course.groundHeight(x, z) > y - 3) return true;
    }
    return false;
  }

  /** Push the carrot offset (_off) out of any pillar or ball the body is about to pass (`reach` m ahead of course position sBody). */
  avoidHazards(sBody, sign, reach, hw) {
    const L = this.course.length, margin = W.missile.hazardMargin, lim = 0.75 * hw;
    for (const h of this.hz) {
      const ds = sign * wrapD(h.s - sBody, L);
      if (ds < -h.r || ds > reach + h.r + 30) continue;
      const need = h.r + margin;
      if (Math.hypot(_off.lat - h.lat, h.column ? 0 : _off.vert - h.vert) >= need) continue;
      const a = h.lat + need, b = h.lat - need, okA = Math.abs(a) <= lim, okB = Math.abs(b) <= lim;
      _off.lat = okA && okB ? (Math.abs(a - _off.lat) < Math.abs(b - _off.lat) ? a : b) : okA ? a : okB ? b : (Math.abs(a) < Math.abs(b) ? a : b);
    }
  }

  /**
   * Course-following pursuit. Leaves the point `body` (missile or drone) should steer at in `out` and returns the weight of the direct term (0 = pure course
   * following, 1 = pure pursuit of `direct`). Far from the target the aim is a carrot `look` m up the course (down it for sign -1) on the body's OWN lateral /
   * vertical offset, held inside the airway and steered round hazards; as the along-course gap closes the offset blends onto the target's line; within
   * `far3d`..`near3d` metres of `direct` it blends into plain pursuit unless terrain is in the way. `pursue`: a target no longer ahead is chased directly (missile);
   * a drone keeps flying up the course instead. `body.proj` is the body's projection for this step. tgt / direct may be null (follow the course on its own line).
   */
  courseAim(body, tgt, sign, look, direct, near3d, far3d, pursue, out) {
    const course = this.course, p = body.proj, L = course.length, M = W.missile;
    let br = null, c0 = p.s, lat = p.lateral, vert = p.vertical;
    if (p.branch >= 0) { br = course.branches[p.branch]; c0 = p.u; }          // inside a shortcut tube: stay in it
    else if (tgt && tgt.onBranch >= 0) {                                      // the target flies a shortcut: join it at its mouth
      const b = course.branches[tgt.onBranch], du = wrapD(p.s - b.fromS, L);
      // hint: at the mouth the branch IS the main line (u = s - fromS), so a local window finds it; no scan of the whole tube
      if (Math.abs(du) < 160) { b.path.project(body.pos, clamp(du, 0, b.length), _bp); if (_bp.dist < 90) { br = b; c0 = _bp.s; lat = _bp.lateral; vert = _bp.vertical; } }
    }
    let gap = Infinity, tLat = lat, tVert = vert;
    if (tgt) {
      if (br) {
        if (tgt.onBranch === br.index) { gap = sign * (tgt.proj.u - c0); tLat = tgt.lateral; tVert = tgt.vertical; }
        else gap = sign * (br.length + wrapD(tgt.s - br.toS, L) - c0);
      } else {
        gap = sign * wrapD(tgt.s - p.s, L);
        if (tgt.onBranch < 0) { tLat = tgt.lateral; tVert = tgt.vertical; }
      }
    }
    const f0 = br ? br.frameAt(c0, _fr) : course.frameAt(c0, _fr), e0 = Math.hypot(lat / f0.halfWidth, vert / f0.halfHeight);
    if (e0 > M.airway) look *= clamp(1 - 2.5 * (e0 - M.airway), 0.4, 1);     // outside the airway (a launch from a banked turn): a nearer carrot turns it back in before the terrain at the edge
    const c = c0 + sign * look, f = br ? br.frameAt(c, _fr) : course.frameAt(c, _fr);
    const e = Math.hypot(lat / f.halfWidth, vert / f.halfHeight);
    if (e > M.airway) { const k = M.airway / e; lat *= k; vert *= k; }          // never aim outside the airway: its inner ellipse is clear of terrain
    if (tgt) {
      const w = smooth01((M.courseBlend[1] - gap) / (M.courseBlend[1] - M.courseBlend[0]));
      if (w > 0) { lat += (tLat - lat) * w; vert += (tVert - vert) * w; }
    }
    _off.lat = lat; _off.vert = vert;
    if (!br) this.avoidHazards(p.s, sign, look, f.halfWidth);
    out.copy(f.pos).addScaledVector(f.right, _off.lat).addScaledVector(f.up, _off.vert);
    if (!tgt || !direct) return 0;
    const d = body.pos.distanceTo(direct);
    let wd = pursue && gap < 20 ? 1 : smooth01((far3d - d) / (far3d - near3d));
    if (wd > 0 && !(pursue && gap < 20) && d > near3d && this.blocked(body.pos, direct)) wd = 0;
    if (wd > 0) out.lerp(direct, wd);
    return wd;
  }

  /** Course metres from missile `m` to `tgt` in its direction of travel (0 once level with or past it). */
  courseGap(m, tgt) {
    const p = m.proj;
    const g = p.branch >= 0 && tgt.onBranch === p.branch ? m.sign * (tgt.proj.u - p.u) : m.sign * wrapD(tgt.s - p.s, this.course.length);
    return g > 0 ? g : 0;
  }

  /** Rotate `dir` toward `aim` (seen from `pos`) by at most rate * dt radians. */
  steer(dir, pos, aim, rate, dt) {
    dirTo(_u, pos, aim).normalize();
    const ang = Math.acos(clamp(dir.dot(_u), -1, 1));
    if (ang <= 1e-4) return;
    _ax.crossVectors(dir, _u); const l = _ax.length();
    if (l < 1e-6) _ax.set(0, 1, 0); else _ax.divideScalar(l);
    _q.setFromAxisAngle(_ax, Math.min(ang, rate * dt)); dir.applyQuaternion(_q).normalize();
  }

  /** Seconds until a body at speed `sp` leaving `from` meets a target at `p` flying straight at `v` (0..cap); the lead point is p + v * t. */
  interceptT(from, sp, p, v, cap) {
    _u.copy(p).sub(from);
    const a = v.lengthSq() - sp * sp, b = 2 * _u.dot(v), c = _u.lengthSq();
    const t = a < -1e-6 ? (-b - Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a) : Math.sqrt(c) / 30;      // a target as fast as the body: lead it by the gap
    return clamp(t, 0, cap);
  }

  steerMissile(m, tgt, dt) {
    const M = W.missile;
    if (tgt) _lead.copy(tgt.flight.pos).addScaledVector(tgt.flight.vel, this.interceptT(m.pos, Math.max(m.speed, 1), tgt.flight.pos, tgt.flight.vel, M.leadMax));
    const wd = this.courseAim(m, tgt, m.sign, clamp(m.speed * 0.4, M.look[0], M.look[1]), tgt ? _lead : null, M.direct[1], M.direct[0], true, _aim);
    let turn = M.turnCourse + (m.turn - M.turnCourse) * wd;
    if (tgt && tgt.blind > 0) turn *= 0.4;                                   // a missile loses its eyes in smoke
    this.steer(m.dir, m.pos, _aim, turn, dt);
  }

  /**
   * Distance, smoothed closing speed and time-to-impact of missile `m` against `tgt`, the "a barrel roll would work now" flag, and the warning pings (dt = 0 at launch).
   * The distance still to fly is the larger of the straight line and the along-course gap (round a bend the missile follows the course, so the straight line
   * understates it and its rate swings); tti is that distance to the hit radius over the closing rate, so it does not jump; pings speed up as it falls.
   */
  trackThreat(m, tgt, dt) {
    const M = W.missile, th = m.threat, d = m.pos.distanceTo(tgt.flight.pos), togo = Math.max(d, this.courseGap(m, tgt));
    if (dt > 0) m.closing += ((m.togo - togo) / dt - m.closing) * Math.min(1, dt / M.closeTau);
    else { dirTo(_u, m.pos, tgt.flight.pos).normalize(); m.closing = clamp(m.dir.dot(_u) * m.speed - tgt.flight.vel.dot(_u), 25, 400); }
    m.dist = d; m.togo = togo;
    // closing: the measured rate, but never below the path model (the missile's own speed against the target's speed along the course), which the measured
    // rate undershoots badly in bends
    const tf = tgt.onBranch >= 0 ? this.course.branches[tgt.onBranch].frameAt(tgt.proj.u, _fr) : this.course.frameAt(tgt.s, _fr);
    const model = (m.t < M.burn ? M.speed : m.speed) - m.sign * tgt.flight.vel.dot(tf.tangent);      // cruise speed while the motor burns (the launch run-up lasts 0.2 s)
    // even so the estimate swings in bends, so tti runs as a clock (it falls by dt each step) pulled toward the raw estimate: gently while far off (pings only need
    // to speed up smoothly), within a few steps once it is close (the roll cue must be on time)
    const raw = Math.max(0, togo - tgt.radius - M.hitPad) / Math.max(m.closing, model, 25), T = FLIGHT.barrelTime;
    if (dt > 0) { const pred = Math.max(0, m.tti - dt); m.tti = pred + (raw - pred) * Math.min(1, dt / clamp(M.ttiTau * Math.min(raw, pred), 0.05, 0.6)); }
    else m.tti = raw;
    const tti = m.tti;
    const evade = this.canRoll(tgt) && tti >= M.evadeFrom * T + M.cue[0] && tti <= M.evadeTo * T - M.cue[1];      // the cue sits inside the window by tti's error margin
    th.dist = d; th.tti = tti; th.evade = evade; th.closing = m.closing;
    if (dt <= 0) return;
    m.warnT -= dt;
    if (m.warnT <= 0 || (evade && !m.evadeSent)) {
      const interval = clamp(M.ping[0] + M.ping[1] * tti, M.ping[2], M.ping[3]);
      m.warnT = interval; m.evadeSent = evade;
      this.game.events.emit('missile:warn', { target: tgt, missile: m, dist: d, tti, evade, interval, closing: m.closing });
    } else if (!evade) m.evadeSent = false;
  }

  stepMissiles(dt) {
    const racers = this.race.racers, ev = this.game.events, course = this.course, M = W.missile;
    for (const m of this.missiles) {
      if (m.dead) continue;
      m.prev.copy(m.pos); m.t += dt;
      let tgt = m.target;
      // no quarry, or one it can no longer hurt (finished, or tumbling in the grace of another hit): look for the next racer ahead every 0.2 s
      if (!tgt || tgt.finished || (tgt.tumble > 0 && tgt.invuln > INVULN_LOCK)) {
        m.seekT -= dt;
        if (m.seekT <= 0) {
          m.seekT = 0.2;
          const nt = this.seek(m);
          if (nt) { tgt = m.target = nt; m.turn = Math.max(m.turn, M.turnWeak); m.passT = 0; m.warnT = 0; m.evadeSent = false; this.trackThreat(m, nt, 0); }
          else if (tgt && tgt.finished) tgt = m.target = null;
        }
      }
      if (m.t > M.armT) this.steerMissile(m, tgt, dt);
      // speed profile: boost to cruise, burn out after `burn` s (a boosting racer outruns it)
      if (m.t < M.burn) m.speed = Math.min(M.speed, m.speed + M.accel * dt); else m.speed = Math.max(M.floor, m.speed - M.decay * dt);
      m.pos.addScaledVector(m.dir, m.speed * dt);
      course.project(m.pos, m.proj.s, m.proj);                                  // hint = last s: a local window, not a scan of the whole course
      if (tgt) this.trackThreat(m, tgt, dt);
      // racers on the flight path (target first)
      let resolved = false;
      for (const o of racers) {
        if (o === m.owner || o.finished && o.flight.speed < 1) continue;
        const d = segDist(m.prev, m.pos, o.flight.pos), isT = o === tgt;
        if (d > o.radius + M.hitPad) continue;
        if (!isT && m.t < 0.4) continue;
        if (this.rollProtects(o)) { this.endMissile(m, 'barrel', o); resolved = true; break; }
        if (o.invuln > 0 && o.shield <= 0) {                                                // still in its grace after a hit
          if (isT) { this.endMissile(m, 'invuln', o); resolved = true; break; }             // the missile meant for it is spent on the grace (flying on without a target it would only waste its whole life)
          continue;                                                                         // a bystander: pass through, never stuck
        }
        const hadShield = o.shield > 0, pos = m.pos.clone();
        const landed = applyHit(this.race, o, m.owner, 'missile', { tumble: M.tumble, loss: M.loss, severity: 0.9, pos });
        if (landed) { ev.emit('missile:hit', { missile: m, target: o, owner: m.owner, pos }); this.removeMissile(m); }
        else this.endMissile(m, hadShield ? 'shield' : 'outrun', o);
        resolved = true; break;
      }
      if (resolved) continue;
      // obstacles (the corridor wall is soft and ignored)
      if (course.collide(m.pos, 1.5, m.proj, this.out) && this.out.kind !== 'wall') { this.endMissile(m, 'obstacle', tgt); continue; }
      // overshot the quarry: it is behind the missile and falling away. A corridor has no room for the U-turn, so the missile is lost; a target that has just rolled gets the credit
      if (tgt && m.t > M.armT + 0.15) {
        const ahead = m.sign * wrapD(tgt.s - m.proj.s, course.length);        // course metres to the target (negative: behind it); the course frame, because a hairpin puts a target that is still ahead behind the nose
        if (ahead < -M.passMargin && dirTo(_u, m.pos, tgt.flight.pos).dot(m.dir) < 0) m.passT += dt; else m.passT = 0;
        if (m.passT > M.passTime) { this.endMissile(m, tgt.flight.barrel.cooldown > FLIGHT.barrelCooldown - FLIGHT.barrelTime ? 'barrel' : 'outrun', tgt); continue; }
      }
      // lost the quarry
      if (m.t > M.life || (tgt && m.t > 1.5 && m.dist > M.loseDist)) { this.endMissile(m, 'outrun', tgt); continue; }
    }
    compact(this.missiles);
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
    compact(this.mines);
  }
  removeMine(m) { m.dead = true; if (m.mesh) { this.vis.mines.release(m.mesh); m.mesh = null; } }

  /** Smoke: a racer inside a cloud is blind for `blind` s after it leaves (no lock-ons, no sight for the AI), and loses speed at `drag` per second. */
  stepClouds(dt) {
    const S = W.smoke, r2 = S.radius * S.radius, ev = this.game.events;
    for (const c of this.clouds) {
      c.t += dt;
      if (c.t >= S.life) { c.dead = true; continue; }
      for (const o of this.race.racers) {
        if (o === c.owner || o.finished) continue;
        if (o.flight.pos.distanceToSquared(c.pos) >= r2) continue;
        if (o.blind <= 0) ev.emit('smoke:blind', { racer: o, owner: c.owner, duration: S.blind });
        o.blind = S.blind;
        const fs = o.flight, floor = fs.params.minSpeed * 1.1;
        if (fs.speed > floor) scaleSpeed(fs, Math.max(floor / fs.speed, Math.exp(-S.drag * dt)));
      }
    }
    compact(this.clouds);
  }

  /** The racer a drone hunts: the nearest unfinished racer ahead of its owner; the leader's drone guards its back (the chaser behind). */
  droneTarget(d) {
    const order = this.race.order, i = order.indexOf(d.owner);
    d.guard = false;
    for (let k = i - 1; k >= 0; k--) if (!order[k].finished) return order[k];
    for (let k = i + 1; k < order.length; k++) if (!order[k].finished) { d.guard = true; return order[k]; }
    return null;
  }

  /**
   * Drones fly the course like missiles do (never into terrain: they slide off the ground and pillars instead of dying) and hold `station` m behind the racer ahead,
   * or 30 m behind their owner when they guard its back. They shoot a target inside a wide cone and are spent after `maxHits` landed bolts.
   */
  stepDrones(dt) {
    const ev = this.game.events, course = this.course, D = W.drone, L = course.length;
    for (const d of this.drones) {
      if (d.dead) continue;
      d.prev.copy(d.pos); d.t += dt;
      const spent = d.hits >= D.maxHits;
      if (d.t > D.life || d.owner.finished || spent) { this.removeDrone(d); ev.emit('drone:expire', { owner: d.owner, drone: d, reason: spent ? 'spent' : d.owner.finished ? 'owner' : 'time' }); continue; }
      d.retargetT -= dt;
      if (d.retargetT <= 0 || !d.target || d.target.finished) { d.retargetT = 0.6; d.target = this.droneTarget(d); }
      const tgt = d.target, ref = tgt && !d.guard ? tgt : d.owner;               // who the drone keeps station on
      const back = tgt && !d.guard ? D.station : 30;
      _lead.copy(ref.flight.pos).addScaledVector(ref.flight.forward, -back).addScaledVector(ref.flight.up, tgt && !d.guard ? 4 : 0);
      const look = clamp(d.speed * 0.35, 25, 70);
      this.courseAim(d, ref, 1, look, tgt && !d.guard ? _lead : null, 40, 90, false, _aim);
      this.steer(d.dir, d.pos, _aim, D.turn, dt);
      const along = wrapD(ref.s - back - d.proj.s, L);                          // course metres to the station (+ = ahead of the drone)
      const base = ref.flight.speed * (tgt && !d.guard ? D.speedMul : 1);
      d.speed += (clamp(base + clamp(along, -45, 70), 50, 230) - d.speed) * Math.min(1, dt * 3);
      d.pos.addScaledVector(d.dir, d.speed * dt);
      course.project(d.pos, d.proj.s, d.proj);
      if (course.collide(d.pos, 2, d.proj, this.out) && this.out.kind !== 'wall') {         // brushed the ground or a pillar: slide off, never die
        const n = this.out.normal, into = d.dir.dot(n);
        d.pos.addScaledVector(n, this.out.depth + 0.5);
        if (into < 0) d.dir.addScaledVector(n, -into).normalize();
      }
      d.fireT -= dt;
      // holds fire while the target tumbles or sits in a hit's grace: those bolts would be wasted, and maxHits (6) is below two cannon combos, so the drone cannot chain-stun
      if (tgt && d.fireT <= 0 && d.t > 1 && tgt.tumble <= 0 && tgt.invuln <= 0.2) {
        dirTo(_u, d.pos, tgt.flight.pos); const range = _u.length(); _u.divideScalar(range);
        if (range < D.range && range > 20 && (d.guard ? -d.dir.dot(_u) : d.dir.dot(_u)) > D.cone) {
          d.fireT = D.fireEvery; d.shots++;
          const flightT = range / (W.cannon.speed + 70);
          _u.copy(tgt.flight.pos).addScaledVector(tgt.flight.vel, flightT).sub(d.pos).normalize();
          this._droneNow = d;
          this.fireBolt(d.owner, true, d.pos, _u);
          this._droneNow = null;
        }
      }
    }
    compact(this.drones);
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
