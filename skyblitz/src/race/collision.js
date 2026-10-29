// Racer-racer soft bumps, ground scrape/bounce, hazards, the soft corridor wall and near-miss detection.
// Everything is deliberately forgiving: bumps cost a little speed, scrapes cost a little speed, only a steep ground hit or a hazard
// tumbles (and the tumble is short, followed by invulnerability). See damage.js for the shared hit rules.
import * as THREE from 'three';
import { clamp } from '../util.js';
import { addBoostMeter, applyImpulse } from '../flight/flight.js';
import { applyHit, scaleSpeed } from './damage.js';

const _kick = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3(), _rv = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
const out = { kind: '', depth: 0, normal: new THREE.Vector3(), soft: false, surface: '' };
const probe = { kind: '', depth: 0, normal: new THREE.Vector3(), soft: false };

export const COLLISION = { crashSpeed: 30, steepRad: 0.6, nearMissGap: 7, nearMissClosing: 22, nearMissReward: 6, bumpLoss: 0.05, wallLoss: 0.35 };

/** Rotate the aircraft a little about the axis that turns its nose toward `dir` (a gentle assist, not a bounce). */
function nudgeToward(fs, dir, rate, dt) {
  const ang = Math.acos(clamp(fs.forward.dot(dir), -1, 1));
  if (ang < 1e-3) return;
  _ax.crossVectors(fs.forward, dir); const l = _ax.length(); if (l < 1e-6) return; _ax.divideScalar(l);
  _q.setFromAxisAngle(_ax, Math.min(ang, rate * dt)); fs.quat.premultiply(_q).normalize();
}

/** Contact accounting (race.stats.contactT = racer-seconds scraping wall / ground / water; contactBins = 100 m bin -> Set of racer:lap that scraped it). */
function trackContact(race, r, dt, kind) {
  if (r.finished) return;
  const st = race.stats; st.contactT += dt; r.contactT = (r.contactT || 0) + dt;
  st.contactKinds[kind] = (st.contactKinds[kind] || 0) + dt;
  const L = race.course.length, b = Math.floor((((r.s % L) + L) % L) / 100), key = r.id + ':' + r.lap;
  let set = st.contactBins.get(b); if (!set) st.contactBins.set(b, set = new Set()); set.add(key);
  st.contactBinT[b] = (st.contactBinT[b] || 0) + dt;
}

function environment(race, r, dt, frame) {
  const course = race.course, fs = r.flight, ev = race.game.events;
  r.grazeT = Math.max(0, r.grazeT - dt);
  let hit = course.collide(fs.pos, r.radius, r.proj, out);
  const wl = course.def?.waterLevel;                                  // groundHeight() is the sea FLOOR; the surface is what you actually hit
  if ((!hit || out.kind !== 'ground') && wl != null && fs.pos.y - r.radius < wl) {
    out.kind = 'ground'; out.depth = wl - (fs.pos.y - r.radius); out.normal.set(0, 1, 0); out.soft = false; out.surface = 'water'; hit = true;
  } else out.surface = '';
  if (!hit) { r.groundT = 0; r.contactRun = Math.max(0, (r.contactRun || 0) - dt * 2); return; }
  const depth = out.depth || 0;
  if (out.kind !== 'hazard') r.contactRun = (r.contactRun || 0) + dt;
  if (out.kind !== 'hazard') trackContact(race, r, dt, out.kind === 'wall' ? 'wall' : out.surface === 'water' ? 'water' : 'ground');
  if (out.kind === 'ground') {
    let into = -fs.vel.dot(out.normal);
    if (depth > 8 && out.surface !== 'water') {
      // The ground is a column field (city towers, cliffs): a deep overlap means the flank of a column, not a landing. Never eject the
      // aircraft up onto the roof (a 85 m teleport); slide it out sideways, away from the higher side, a few metres per step.
      const c = race.course, x = fs.pos.x, z = fs.pos.z, e = 6;
      _d.set(c.groundHeight(x - e, z) - c.groundHeight(x + e, z), 0, c.groundHeight(x, z - e) - c.groundHeight(x, z + e));
      if (_d.lengthSq() > 1e-3) { _d.normalize(); fs.pos.addScaledVector(_d, Math.min(2.5, depth)); into = Math.max(into, -fs.vel.dot(_d), fs.speed * 0.6); } else fs.pos.addScaledVector(out.normal, Math.min(depth, 2.5));
    } else fs.pos.addScaledVector(out.normal, depth);
    r.groundT += dt;
    if (into > COLLISION.crashSpeed && r.tumble <= 0 && fs.speed > 20) {
      applyHit(race, r, null, 'ground', { tumble: 1.4, loss: 0.45, severity: clamp(into / 60, 0.5, 1), pierce: true, pos: fs.pos });
    } else {
      scaleSpeed(fs, 1 - Math.min(0.5, 0.25 * dt + depth * 0.02));
      _d.copy(fs.forward).addScaledVector(out.normal, 0.35).normalize(); nudgeToward(fs, _d, 2.2, dt);   // glance off, do not stick
      if (r.grazeT <= 0 && r.tumble <= 0) { r.grazeT = 0.2; ev.emit('racer:graze', { racer: r, surface: out.surface === 'water' ? 'water' : 'ground', pos: fs.pos.clone(), intensity: clamp(0.3 + into / 40, 0, 1) }); }
    }
  } else if (out.kind === 'hazard') {
    applyHit(race, r, null, 'hazard', { tumble: 1.3, loss: 0.5, severity: 0.8, pos: fs.pos });
    if (out.normal.lengthSq() > 0) fs.pos.addScaledVector(out.normal, depth);
  } else if (out.kind === 'wall') {
    // soft corridor edge: push back in, bleed speed, steer the nose inward. No tumble; riding the wall is strictly slower.
    fs.pos.addScaledVector(out.normal, Math.min(depth * 6 * dt, 0.7));   // gentle: at most ~42 m/s inward
    scaleSpeed(fs, 1 - COLLISION.wallLoss * dt * clamp(0.4 + depth / 25, 0.4, 1.5));
    _d.copy(fs.forward).addScaledVector(out.normal, 0.6).normalize(); nudgeToward(fs, _d, 5, dt);
    r.wallT += dt;
    if (r.grazeT <= 0) { r.grazeT = 0.3; ev.emit('racer:graze', { racer: r, surface: 'wall', pos: fs.pos.clone(), intensity: clamp(depth / 30, 0.2, 1) }); }
  }
  void frame;
}

function nearMissHazard(race, r, frame) {
  if (r.nearMissT > 0 || r.tumble > 0 || (frame + r.id) % 3) return;
  const fs = r.flight;
  if (fs.speed < 40 || !race.course.collide(fs.pos, r.radius + COLLISION.nearMissGap + 2, r.proj, probe)) return;
  if (probe.kind !== 'hazard' || race.course.collide(fs.pos, r.radius, r.proj, probe)) return;
  reward(race, r);
}

function reward(race, r) {
  r.nearMissT = 1.4; r.stats.nearMisses++; r.stats.stunts++;
  addBoostMeter(r.flight, COLLISION.nearMissReward);
  race.game.events.emit('racer:stunt', { racer: r, kind: 'nearmiss', reward: COLLISION.nearMissReward });
}

/** One fixed step of all collision handling. frame = race step counter (for staggering). */
export function stepCollisions(race, dt, frame) {
  const rs = race.racers, ev = race.game.events;
  for (const r of rs) {
    r.nearMissT = Math.max(0, r.nearMissT - dt);
    if (r.finished && race.state === 'done') continue;
    environment(race, r, dt, frame);
    nearMissHazard(race, r, frame);
  }
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i], fa = a.flight;
    for (let j = i + 1; j < rs.length; j++) {
      const b = rs[j], fb = b.flight;
      _n.copy(fb.pos).sub(fa.pos); const d2 = _n.lengthSq(), rr = a.radius + b.radius;
      if (d2 > (rr + COLLISION.nearMissGap) * (rr + COLLISION.nearMissGap)) continue;
      const d = Math.sqrt(d2) || 1e-3; _n.divideScalar(d);
      _rv.copy(fb.vel).sub(fa.vel); const closing = -_rv.dot(_n);              // + when approaching
      if (d >= rr) {
        // close pass: near-miss reward for fast relative motion (head-on / fast overtakes), never for side-by-side cruising
        if (closing > COLLISION.nearMissClosing) { if (a.nearMissT <= 0 && !a.finished) reward(race, a); if (b.nearMissT <= 0 && !b.finished) reward(race, b); }
        continue;
      }
      // soft sphere contact: separate, trade a little speed, emit sparks. Never a tumble.
      const push = (rr - d) * 0.5 + 0.05;
      fa.pos.addScaledVector(_n, -push); fb.pos.addScaledVector(_n, push);
      applyImpulse(fa, _kick.copy(_n).multiplyScalar(-6)); applyImpulse(fb, _kick.multiplyScalar(-1));   // lateral shove, not a speed change
      if (closing > 0) {
        const behindA = fa.forward.dot(_n) > 0;                   // a is behind b when b lies in front of a
        const rear = behindA ? a : b, front = behindA ? b : a;
        scaleSpeed(rear.flight, 1 - COLLISION.bumpLoss - Math.min(0.06, closing * 0.0015));
        scaleSpeed(front.flight, 1 + 0.015);
      }
      const key = a.id * 16 + b.id;
      if (race.clock - (race.bumpAt.get(key) ?? -9) > 0.5) {
        race.bumpAt.set(key, race.clock);
        const pos = fa.pos.clone().lerp(fb.pos, 0.5), sev = clamp(closing / 40, 0.15, 0.7);
        ev.emit('racer:hit', { racer: a, by: b, kind: 'racer', pos, severity: sev });
        ev.emit('racer:hit', { racer: b, by: a, kind: 'racer', pos, severity: sev });
      }
    }
  }
}
