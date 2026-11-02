// One inhabitant: logic only (no THREE, no DOM). The World (world.js) owns views, ticking, tiers and interaction.
//
// Coordinates/units: metres, y up, x east, z south. Facing `ry` follows the project convention: front = (sin ry, cos ry).
// An NPC is always in exactly one `mode`:
//   idle     standing/doing `act` (a logical animation name) until `until` (world time), then asks the brain for the next task
//   walk     following `path` (waypoints) with physics, steering around people
//   talk     in conversation with the player: stopped, facing them
//   sleep    parked (hidden) - used for people inside buildings that nobody can see
import { tailsTwin, TAIL_R, TAIL_SLOW } from './twins.js';
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const BODY = { radius: 0.25, height: 1.7, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 };

export class Npc {
  constructor(o) {
    Object.assign(this, {
      id: '', name: null, persona: 'vecina', bank: 'vecina', role: '', age: 'adult', gender: 'm', charId: '', voice: null, rng: null, meta: null,
      home: null, speedBase: 1.3, lane: 0, body: BODY,
    }, o);
    this.st = { x: 0, y: 0, z: 0, vy: 0, onGround: true, blocked: false };
    this.ry = 0; this.targetRy = 0; this.mode = 'idle'; this.act = 'idle'; this.actArg = null; this.until = 0;
    this.path = null; this.pi = 0; this.speed = 0; this.moving = false; this.arrive = null;
    this.mem = { met: 0, lastHour: null, used: {}, heard: new Set() };
    this.tier = 2; this.dist = 1e9; this.visible = false; this.accum = 0;
    this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.checkT = 0; this.sidestep = 0; this.sideDir = 1; this.stuckTotal = 0; this.maxStuck = 0;
    this.detour = null; this.backs = 0; this.fromX = 0; this.fromZ = 0;   // _backOut: the way back to the last waypoint {x, z, t} while it is on, how often this walk has used it, where the walk began
    this.talkWith = null; this.prevMode = null; this.item = null; this.view = null; this.clipName = null;
    this.fx = 0; this.fz = 0;           // steering force accumulator (reused)
    // daily life (brain.js): where they are, what they hold, what happens when the current task ends
    this.then = null;                    // continuation run when an idle task expires (null: ask the brain what next)
    this.sitH = null;                    // seat height above the floor while seated (the view lowers the root)
    this.prop = null;                    // 'broom' | 'bundle' | 'basket' | null: what they hold
    this.carry = false;                  // walking with a load (walk_carry)
    this.away = false; this.awayWhy = null; this.inLot = null;   // hidden inside a building: 'sleep' | 'school' | 'work' | 'home' (a stay at home) | 'visit' (the clinic, the hall)
    this.stayUntil = 0;                  // a 'home' or 'visit' stay ends at this world time
    this.justIn = -1e9;                  // world time of the last step through a door into a building (homelife.js: somebody who has just come in walks on to their place when the player is looking)
    this.downAt = 0;                     // world time before which somebody whose stay is over is still on the stairs: the brain lets them out of the door after it (homelife.js dismiss)
    this.scene = null;                   // homelife.js: the place and the doing of somebody drawn inside a building (null: hidden, or outdoors)
    this.lieH = null;                    // height of the bed under somebody lying on it (the view lays the body down); null: not lying
    this.spot = null; this.block = null; this.activity = null; this.convo = null; this.talkVariant = 0;
    this.gate = null;                    // the inner door (indoor.js waypoint `door`) this walker is holding open
  }

  get x() { return this.st.x; } get y() { return this.st.y; } get z() { return this.st.z; }
  get display() { return this.name.display; }

  place(x, y, z, ry = 0) { const s = this.st; s.x = x; s.y = y; s.z = z; s.vy = 0; s.onGround = true; this.ry = this.targetRy = ry; this.lastX = x; this.lastZ = z; this.detour = null; }

  /** Stand and play logical animation `act` for `secs` of world time, then run `then(npc, w)` or (without one) ask the brain what next. */
  stand(w, act = 'idle', secs = 5, face = null, then = null) {
    this.dropGate(w); this.mode = 'idle'; this.act = act; this.until = w.t + secs; this.path = null; this.detour = null; this.moving = false; this.speed = 0; this.then = then;
    if (face != null) this.targetRy = face;
  }

  /** Walk a list of waypoints [{x,z,y?}] then call `arrive(npc, w)`. */
  walk(w, pts, arrive = null, speed = null) {
    if (!pts?.length) { this.stand(w, 'idle', 1); return false; }
    this.dropGate(w); this.path = pts; this.pi = 0; this.mode = 'walk'; this.arrive = arrive; this.speed = speed ?? this.speedBase * (0.92 + this.rng.next() * 0.16); this.then = null;
    this.stuckT = 0; this.checkT = 0; this.lastX = this.st.x; this.lastZ = this.st.z; this.moving = true; this.act = 'walk';
    this.detour = null; this.backs = 0; this.fromX = this.st.x; this.fromZ = this.st.z;
    return true;
  }

  /** Let go of the inner door this walker was holding open (it closes a moment later unless somebody else needs it). */
  dropGate(w) { if (this.gate) { const g = this.gate; this.gate = null; w?.doors?.release?.(g, this.id); } }

  /** Called by the World when the player starts/stops talking to this NPC. */
  beginTalk(w, who) {
    if (this.mode === 'talk') return;
    this.prevMode = { mode: this.mode, path: this.path, pi: this.pi, arrive: this.arrive, act: this.act, until: this.until - w.t };
    this.mode = 'talk'; this.talkWith = who; this.moving = false; this.speed = 0; this.act = 'talk';
  }
  endTalk(w) {
    if (this.mode !== 'talk') return;
    const p = this.prevMode; this.talkWith = null; this.prevMode = null;
    if (p?.mode === 'walk' && p.path) { this.mode = 'walk'; this.path = p.path; this.pi = p.pi; this.arrive = p.arrive; this.moving = true; this.act = 'walk'; this.speed = this.speedBase; }
    else if (p?.mode === 'idle') { this.mode = 'idle'; this.act = p.act === 'talk' ? 'idle' : p.act; this.until = w.t + Math.max(2, p.until); }   // go on with what they were doing (still seated, still sweeping)
    else this.stand(w, 'idle', 1.5 + this.rng.next() * 3);
  }

  /** Advance one logic step. `w` = world services: { t, physics, player:{x,z}, near(npc,r), brain, rng }. */
  step(dt, w) {
    switch (this.mode) {
      case 'walk': this._walk(dt, w); break;
      case 'talk': this._talk(dt, w); break;
      case 'idle': default: this._idle(dt, w);
    }
    // smooth heading (all modes)
    const d = angDiff(this.ry, this.targetRy);
    if (Math.abs(d) > 1e-3) this.ry += clamp(d, -dt * (this.mode === 'talk' ? 4.5 : 5.5), dt * (this.mode === 'talk' ? 4.5 : 5.5));
  }

  _idle(dt, w) {
    // settle on the ground (stairs / slopes may have changed it)
    this._ground(dt, w);
    if (w.t >= this.until) {
      const cb = this.then;
      if (cb) { this.then = null; cb(this, w); } else w.brain.next(this, w);
    }
  }

  _talk(dt, w) {
    const p = this.talkWith; if (!p) return;
    this.targetRy = Math.atan2(p.x - this.st.x, p.z - this.st.z);
    this._ground(dt, w);
  }

  _ground(dt, w) {
    const s = this.st; w.physics.move(s, 0, 0, dt, this.body);
  }

  _walk(dt, w) {
    const s = this.st;
    if (this.detour && (this.detour.t -= dt) <= 0) this.detour = null;                                           // (_backOut: on its way back to the last waypoint, which is the one place it is sure to be free)
    const pt = this.detour ?? this.path?.[this.pi];
    if (!pt) { this._arrived(w); return; }
    let dx = pt.x - s.x, dz = pt.z - s.z, d = Math.hypot(dx, dz);
    const last = !this.detour && this.pi === this.path.length - 1, reach = this.detour ? 0.32 : last ? 0.28 : pt.tight ? 0.32 : 0.55;           // indoor routes (indoor.js) hug the furniture: no corner cutting
    const dp = pt.door ? pt : this.path[this.pi + 1]?.door ? this.path[this.pi + 1] : null;                   // an inner door is the next point, or the one after it (the step before the door)
    if (dp && this.gate !== dp.door && Math.hypot(dp.x - s.x, dp.z - s.z) < 2.6) { this.dropGate(w); this.gate = dp.door; w.doors?.hold?.(dp.door, this.id); }       // open it as we come near
    if (d < reach) { if (this.detour) { this.detour = null; return; } if (pt.door) this.dropGate(w); this.pi++; if (this.pi >= this.path.length) { this._arrived(w); return; } return; }
    let ux = dx / d, uz = dz / d, sp = this.speed;
    // steering: separate from others and from the player; hold back for a twin who walks my way in front of me (twins.js: two of one character do not walk side by side, R3-006)
    let fx = 0, fz = 0, slow = 1;
    const nb = w.near(this, TAIL_R);
    for (let i = 0; i < nb.length; i++) {
      const o = nb[i], ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz) || 0.01, R = o.isPlayer ? 1.15 : 0.95;
      if (tailsTwin(this, o, ux, uz)) slow = Math.min(slow, TAIL_SLOW);
      if (od < R) {
        const k = (R - od) / R; fx += (ox / od) * k * 1.9; fz += (oz / od) * k * 1.9;
        const ahead = ux * (-ox) + uz * (-oz);                             // other is in front of me
        if (ahead > 0) { slow = Math.min(slow, 0.35 + 0.65 * (od / R)); fx += -uz * k * 0.9 * this.sideDir; fz += ux * k * 0.9 * this.sideDir; }   // slip to one side
      }
    }
    let vx = ux * sp * slow + fx, vz = uz * sp * slow + fz;
    if (this.sidestep > 0) { this.sidestep -= dt; if (!this.detour) { vx += -uz * this.sideDir * 0.9; vz += ux * this.sideDir * 0.9; } }          // (a walker going back out of a slot does not also wander sideways)
    const vl = Math.hypot(vx, vz); if (vl > sp * 1.15) { vx *= sp * 1.15 / vl; vz *= sp * 1.15 / vl; }
    this.targetRy = Math.atan2(vx, vz);
    const turn = Math.abs(angDiff(this.ry, this.targetRy));
    const go = turn > 1.3 ? 0.25 : 1;                                       // pivot before striding off
    s.blocked = false;
    w.physics.move(s, vx * go * dt, vz * go * dt, dt, this.body);
    this.moving = true; this.curSpeed = vl * go;
    // stuck detection: little net progress for a while
    this.checkT += dt;
    if (this.checkT >= 0.5) {
      const moved = Math.hypot(s.x - this.lastX, s.z - this.lastZ); this.lastX = s.x; this.lastZ = s.z; this.checkT = 0;
      if (moved < this.speed * 0.5 * 0.35) {
        this.stuckT += 0.5; this.stuckTotal += 0.5; this.maxStuck = Math.max(this.maxStuck, this.stuckT);
        if (this.stuckT >= 1) {
          this.sidestep = 0.8; this.sideDir = this.rng.chance(0.5) ? 1 : -1;
          // a waypoint under somebody who stands there is out of reach (the stander's push holds the walker 0.35 m off it, and the point is only reached within 0.55): a second of that and near enough is there (the soak: n85
          // against n49 on the phone in the road, three runs at him in 4 s and an unstick). Not a door, a tight point (furniture) or the goal: those are reached or `unstick`ed
          if (!this.detour && this.pi < this.path.length - 1 && !pt.door && !pt.tight && d < 1.2) { this.pi++; this.stuckT = 0; }
        }
        if (this.detour && (this.detour.stall = (this.detour.stall ?? 0) + 0.5) >= 1) this.detour = null;       // (a way back that is held up too, by somebody who stands on it, is given up after a second: the walker is out of the trap by then)
        if (this.stuckT >= 1.5) this._backOut(w);
        if (this.stuckT >= 4) w.brain.unstick(this, w);
      } else { this.stuckT = Math.max(0, this.stuckT - 1); if (this.detour) this.detour.stall = 0; }
    }
  }

  /**
   * Stalled for a second and a half (the sidestep, at one second, has had its chance) with nobody walking within steering range: against a wall, not in a crowd, and waiting will not help. A passer-by's
   * separation push can shove a walker past the end of a stair rail into the slot behind it (L40's stair head, (-21.1, 1.43, y16.04): 0.35 m wide, closed at the far end, its mouth behind the walker);
   * there the straight line to the next waypoint runs through the rail and the sidestep has no room. The way out is the way in: back to the last waypoint (or where the walk began), a place the walk
   * has already proved free, and on from there. Twice a walk at most; after that `unstick` (4 s) is what is left. Somebody who stands on that waypoint holds the walker off it too: the way back is given up
   * after a second without progress (15.7 h of the 12:00 soak: n51 went back into a seller on the stair landing; the 16:00 one: n75 on S1 went back from a wall corner towards n52 and was out of the corner).
   */
  _backOut(w) {
    if (this.detour || this.backs >= 2 || this.gate || !this.path) return;
    const b = this.pi > 0 ? this.path[this.pi - 1] : { x: this.fromX, z: this.fromZ };
    if (!b || Math.hypot(b.x - this.st.x, b.z - this.st.z) < 0.5 || w.near(this, TAIL_R).some((o) => o.mode === 'walk')) return;       // (somebody walking will move on; somebody standing there will not)
    this.detour = { x: b.x, z: b.z, t: 2 + 2 * Math.hypot(b.x - this.st.x, b.z - this.st.z) / (this.speed || 1) }; this.backs++;       // (time enough to get there: a walker who gave up half way would be back in the slot at once)
  }

  _arrived(w) {
    this.moving = false; this.speed = 0; this.path = null; this.detour = null;
    const cb = this.arrive; this.arrive = null; this.mode = 'idle'; this.act = 'idle'; this.until = w.t + 0.1; this.then = null; this.carry = false;
    if (cb) cb(this, w);
  }
}
