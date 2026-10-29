// One inhabitant: logic only (no THREE, no DOM). The World (world.js) owns views, ticking, tiers and interaction.
//
// Coordinates/units: metres, y up, x east, z south. Facing `ry` follows the project convention: front = (sin ry, cos ry).
// An NPC is always in exactly one `mode`:
//   idle     standing/doing `act` (a logical animation name) until `until` (world time), then asks the brain for the next task
//   walk     following `path` (waypoints) with physics, steering around people
//   talk     in conversation with the player: stopped, facing them
//   sleep    parked (hidden) - used for people inside buildings that nobody can see
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const BODY = { radius: 0.25, height: 1.7, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 };

export class Npc {
  constructor(o) {
    Object.assign(this, {
      id: '', name: null, persona: 'vecina', bank: 'vecina', role: '', age: 'adult', gender: 'm', charId: '', voice: null, rng: null, meta: null,
      home: null, speedBase: 1.3, lane: 0,
    }, o);
    this.st = { x: 0, y: 0, z: 0, vy: 0, onGround: true, blocked: false };
    this.ry = 0; this.targetRy = 0; this.mode = 'idle'; this.act = 'idle'; this.actArg = null; this.until = 0;
    this.path = null; this.pi = 0; this.speed = 0; this.moving = false; this.arrive = null;
    this.mem = { met: 0, lastHour: null, used: {}, heard: new Set() };
    this.tier = 2; this.dist = 1e9; this.visible = false; this.accum = 0;
    this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.checkT = 0; this.sidestep = 0; this.sideDir = 1; this.stuckTotal = 0; this.maxStuck = 0;
    this.talkWith = null; this.prevMode = null; this.item = null; this.view = null; this.clipName = null;
    this.fx = 0; this.fz = 0;           // steering force accumulator (reused)
    // daily life (brain.js): where they are, what they hold, what happens when the current task ends
    this.then = null;                    // continuation run when an idle task expires (null: ask the brain what next)
    this.sitH = null;                    // seat height above the floor while seated (the view lowers the root)
    this.prop = null;                    // 'broom' | 'bundle' | 'basket' | null: what they hold
    this.carry = false;                  // walking with a load (walk_carry)
    this.away = false; this.awayWhy = null; this.inLot = null;   // hidden inside a building: 'sleep' | 'school' | 'work'
    this.spot = null; this.block = null; this.activity = null; this.convo = null; this.talkVariant = 0;
  }

  get x() { return this.st.x; } get y() { return this.st.y; } get z() { return this.st.z; }
  get display() { return this.name.display; }

  place(x, y, z, ry = 0) { const s = this.st; s.x = x; s.y = y; s.z = z; s.vy = 0; s.onGround = true; this.ry = this.targetRy = ry; this.lastX = x; this.lastZ = z; }

  /** Stand and play logical animation `act` for `secs` of world time, then run `then(npc, w)` or (without one) ask the brain what next. */
  stand(w, act = 'idle', secs = 5, face = null, then = null) {
    this.mode = 'idle'; this.act = act; this.until = w.t + secs; this.path = null; this.moving = false; this.speed = 0; this.then = then;
    if (face != null) this.targetRy = face;
  }

  /** Walk a list of waypoints [{x,z,y?}] then call `arrive(npc, w)`. */
  walk(w, pts, arrive = null, speed = null) {
    if (!pts?.length) { this.stand(w, 'idle', 1); return false; }
    this.path = pts; this.pi = 0; this.mode = 'walk'; this.arrive = arrive; this.speed = speed ?? this.speedBase * (0.92 + this.rng.next() * 0.16); this.then = null;
    this.stuckT = 0; this.checkT = 0; this.lastX = this.st.x; this.lastZ = this.st.z; this.moving = true; this.act = 'walk';
    return true;
  }

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
    const s = this.st; w.physics.move(s, 0, 0, dt, BODY);
  }

  _walk(dt, w) {
    const s = this.st, pt = this.path?.[this.pi];
    if (!pt) { this._arrived(w); return; }
    let dx = pt.x - s.x, dz = pt.z - s.z, d = Math.hypot(dx, dz);
    const last = this.pi === this.path.length - 1, reach = last ? 0.28 : 0.55;
    if (d < reach) { this.pi++; if (this.pi >= this.path.length) { this._arrived(w); return; } return; }
    let ux = dx / d, uz = dz / d, sp = this.speed;
    // steering: separate from others and from the player
    let fx = 0, fz = 0, slow = 1;
    const nb = w.near(this, 1.25);
    for (let i = 0; i < nb.length; i++) {
      const o = nb[i], ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz) || 0.01, R = o.isPlayer ? 1.15 : 0.95;
      if (od < R) {
        const k = (R - od) / R; fx += (ox / od) * k * 1.9; fz += (oz / od) * k * 1.9;
        const ahead = ux * (-ox) + uz * (-oz);                             // other is in front of me
        if (ahead > 0) { slow = Math.min(slow, 0.35 + 0.65 * (od / R)); fx += -uz * k * 0.9 * this.sideDir; fz += ux * k * 0.9 * this.sideDir; }   // slip to one side
      }
    }
    let vx = ux * sp * slow + fx, vz = uz * sp * slow + fz;
    if (this.sidestep > 0) { this.sidestep -= dt; vx += -uz * this.sideDir * 0.9; vz += ux * this.sideDir * 0.9; }
    const vl = Math.hypot(vx, vz); if (vl > sp * 1.15) { vx *= sp * 1.15 / vl; vz *= sp * 1.15 / vl; }
    this.targetRy = Math.atan2(vx, vz);
    const turn = Math.abs(angDiff(this.ry, this.targetRy));
    const go = turn > 1.3 ? 0.25 : 1;                                       // pivot before striding off
    s.blocked = false;
    w.physics.move(s, vx * go * dt, vz * go * dt, dt, BODY);
    this.moving = true; this.curSpeed = vl * go;
    // stuck detection: little net progress for a while
    this.checkT += dt;
    if (this.checkT >= 0.5) {
      const moved = Math.hypot(s.x - this.lastX, s.z - this.lastZ); this.lastX = s.x; this.lastZ = s.z; this.checkT = 0;
      if (moved < this.speed * 0.5 * 0.35) {
        this.stuckT += 0.5; this.stuckTotal += 0.5; this.maxStuck = Math.max(this.maxStuck, this.stuckT);
        if (this.stuckT >= 1) { this.sidestep = 0.8; this.sideDir = this.rng.chance(0.5) ? 1 : -1; }
        if (this.stuckT >= 4) w.brain.unstick(this, w);
      } else this.stuckT = Math.max(0, this.stuckT - 1);
    }
  }

  _arrived(w) {
    this.moving = false; this.speed = 0; this.path = null;
    const cb = this.arrive; this.arrive = null; this.mode = 'idle'; this.act = 'idle'; this.until = w.t + 0.1; this.then = null; this.carry = false;
    if (cb) cb(this, w);
  }
}
