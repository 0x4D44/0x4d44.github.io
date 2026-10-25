// Apex Karts - bot drivers (owner: C). Writes kart.input each frame.
import { blankInput, makeRng, clamp, lerp } from "./roster.js";

// ---- tuning --------------------------------------------------------------------------------
const DIFF = {
  //        base top-speed scale, mistakes per second, steer slew /s, corner grip (lateral m/s^2), drift prob, rubber strength, item delay
  easy:   { scale: 0.88, mistake: 1 / 7,  slew: 5.0, grip: 30, drift: 0.15, rubber: 1.25, itemDelay: [1.5, 5.0], rocket: 0.15 },
  normal: { scale: 0.96, mistake: 1 / 22, slew: 7.0, grip: 38, drift: 0.7,  rubber: 1.0,  itemDelay: [0.8, 3.0], rocket: 0.4 },
  hard:   { scale: 1.03, mistake: 1 / 80, slew: 9.5, grip: 46, drift: 1.0,  rubber: 0.6,  itemDelay: [0.3, 1.6], rocket: 0.7 },
};
const BRAKE_DECEL = 24;           // m/s^2 assumed braking capability
const LOOK = [10, 24, 42, 66, 95]; // curvature probe distances (m)
const DRIFT_K_ON = 0.028;         // |curvature| to start a drift
const DRIFT_K_OFF = 0.012;
const STUCK_SPEED = 2.5;

export function rubberBand(kart, leaderProgress, playerProgress, difficulty = "normal") {
  const d = DIFF[difficulty] || DIFF.normal;
  const skill = kart.aiSkill ?? 0.5;
  const base = d.scale * (0.985 + 0.03 * skill);
  const mine = kart.race ? kart.race.progress : 0;
  // metres ahead of the human (+ve: bot is ahead -> ease off, -ve: behind -> catch up)
  const gap = mine - (playerProgress ?? mine);
  let band = 0;
  if (gap > 30) band = -Math.min(0.06, (gap - 30) / 4000);
  else if (gap < -30) band = Math.min(0.08, (-gap - 30) / 3000);
  band *= d.rubber;
  // the overall leader never gets help
  if (kart.race && leaderProgress != null && mine >= leaderProgress - 1 && band > 0) band = 0;
  return base * (1 + clamp(band, -0.08, 0.08));
}

export class AIDriver {
  constructor(kart, track, { difficulty = "normal", skill = 0.5, seed = 1 } = {}) {
    this.kart = kart;
    this.track = track;
    this.difficulty = DIFF[difficulty] ? difficulty : "normal";
    this.cfg = DIFF[this.difficulty];
    this.skill = clamp(skill, 0, 1);
    this.rng = makeRng((seed * 2654435761) >>> 0 || 1);
    kart.aiSkill = this.skill;
    kart.speedScale = this.cfg.scale * (0.985 + 0.03 * this.skill);

    this.hintS = undefined;
    this.steer = 0;
    this.lane = (this.rng() * 2 - 1) * 2.4;       // personal lateral preference
    this.laneT = 0;
    this.laneGoal = this.lane;
    this.avoid = 0;                                // smoothed avoidance lateral offset
    this.mistakeT = 2 + this.rng() * 6;
    this.mistake = null;                           // {t, steer, lift}
    this.stuckT = 0;
    this.reverseT = 0;
    this.reverseSteer = 0;
    this.hardStuckT = 0;
    this.drifting = false;
    this.driftCool = 0;
    this.driftT = 0;
    this.driftDir = 0;
    this.itemT = 0;                                // time current item has been held
    this.itemWait = 0;
    this.itemSeen = null;
    this.tripleGap = 0;
    this.rocket = this.rng() < this.cfg.rocket * (0.6 + 0.8 * this.skill);
    this.rocketAt = 0.12 + this.rng() * 0.25;
    this.reaction = 0.1 + this.rng() * 0.35;       // delay after GO
    this.goT = 0;
    this.wantUse = false;
    this.debug = { s: 0, lat: 0, vSafe: 0, mode: "init" };
  }

  update(dt, ctx = {}) {
    const k = this.kart, tr = this.track, cfg = this.cfg;
    const inp = k.input || (k.input = blankInput());
    inp.useItem = this.wantUse; this.wantUse = false;
    inp.lookBack = false;

    // ---- grid / countdown ----
    if (k.locked) {
      inp.steer = 0; inp.brake = 0; inp.drift = false;
      const cd = ctx.race ? ctx.race.countdown : null;
      inp.throttle = (this.rocket && cd != null && cd <= this.rocketAt && cd > 0) ? 1 : 0;
      this.goT = 0;
      return;
    }
    this.goT += dt;

    const loc = tr.locate(k.position, this.hintS);
    this.hintS = loc.s;
    const s = loc.s;
    const speed = k.speed;
    const fx = Math.sin(k.heading), fz = Math.cos(k.heading);
    const rx = -Math.cos(k.heading), rz = Math.sin(k.heading);

    if (k.spinTime > 0) {                       // out of control: just hold the wheel straight
      inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.drift = false;
      this.drifting = false;
      return;
    }

    // ---- personality: lane drift and mistakes ----
    this.laneT -= dt;
    if (this.laneT <= 0) {
      this.laneT = 6 + this.rng() * 8;
      this.laneGoal = (this.rng() * 2 - 1) * (1.6 + 1.6 * (1 - this.skill));
    }
    this.lane += (this.laneGoal - this.lane) * Math.min(1, dt * 0.5);

    this.mistakeT -= dt;
    if (this.mistake) {
      this.mistake.t -= dt;
      if (this.mistake.t <= 0) this.mistake = null;
    } else if (this.mistakeT <= 0 && this.goT > 3) {
      const rate = cfg.mistake * (1.4 - this.skill * 0.8);
      this.mistakeT = (0.5 + this.rng()) / Math.max(rate, 1e-4);
      this.mistake = { t: 0.35 + this.rng() * 0.5, steer: (this.rng() < 0.5 ? -1 : 1) * (0.25 + this.rng() * 0.35), lift: this.rng() < 0.5 };
    }

    // ---- recovery (stuck / reversing) ----
    const racing = this.goT > this.reaction;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      inp.throttle = 0; inp.brake = 1; inp.steer = this.reverseSteer; inp.drift = false;
      this.drifting = false;
      this.debug.mode = "reverse";
      if (this.reverseT <= 0) { this.stuckT = 0; }
      return;
    }
    if (racing && Math.abs(speed) < STUCK_SPEED) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (racing && Math.abs(speed) < 6) this.hardStuckT += dt; else this.hardStuckT = 0;
    if (this.stuckT > 1.1) {
      // back out, steering so the nose swings toward the track direction
      const sm = tr.sample(s);
      const dotR = fx * sm.tangent.x + fz * sm.tangent.z;       // alignment with the track
      const side = (rx * sm.tangent.x + rz * sm.tangent.z);      // +ve: track direction is to our right
      this.reverseSteer = clamp(-(side >= 0 ? 1 : -1) * (dotR > 0.85 ? 0 : 1), -1, 1);
      this.reverseT = 0.9 + this.rng() * 0.5;
      this.stuckT = 0;
      this.stuckCount = (this.stuckCount || 0) + 1;
      if (this.stuckCount % 3 === 0 && typeof k.respawn === "function") { k.respawn(tr); this.reverseT = 0; this.hintS = undefined; }
      return;
    }
    if (this.hardStuckT > 7 && typeof k.respawn === "function") { k.respawn(tr); this.hardStuckT = 0; this.hintS = undefined; }

    // ---- target point ----
    const hw = loc.halfWidth;
    const v = Math.max(speed, 8);
    const L = clamp(7 + v * 0.5, 9, 34);
    const sT = s + L;
    let lat = tr.aiLine(sT) + this.lane * clamp((hw - 3) / 6, 0.2, 1);

    // avoidance of karts and hazards
    let avoidGoal = 0;
    let sepSteer = 0;
    const karts = ctx.karts || [];
    let nearAhead = 1e9;
    for (let i = 0; i < karts.length; i++) {
      const o = karts[i];
      if (o === k) continue;
      const dx = o.position.x - k.position.x, dz = o.position.z - k.position.z;
      const z = dx * fx + dz * fz, x = dx * rx + dz * rz;
      if (z > 1 && z < 22 && Math.abs(x) < 3.0 && o.speed < speed + 6) {
        const sign = x > 0.4 ? -1 : x < -0.4 ? 1 : (loc.lateral > 0 ? -1 : 1);
        const w = (1 - z / 22);
        if (Math.abs(avoidGoal) < 3.4 * w) avoidGoal = sign * 3.4 * Math.min(1, 0.4 + w);
        if (z < nearAhead) nearAhead = z;
      }
      if (Math.abs(z) < 3.2 && Math.abs(x) < 3.0) sepSteer += (x > 0 ? -1 : 1) * 0.25;
    }
    const haz = ctx.items && ctx.items.hazards;
    if (haz) {
      for (let i = 0; i < haz.length; i++) {
        const h = haz[i];
        const dx = h.position.x - k.position.x, dz = h.position.z - k.position.z;
        const z = dx * fx + dz * fz, x = dx * rx + dz * rz;
        if (z > 2 && z < 30 && Math.abs(x) < 2.6) {
          avoidGoal = (x > 0.3 ? -1 : x < -0.3 ? 1 : (loc.lateral > 0 ? -1 : 1)) * 3.4;
          if (this.skill < 0.3 && this.difficulty === "easy" && this.rng() < 0.01) avoidGoal = 0; // sometimes oblivious
        }
      }
    }
    // keep the avoidance from pushing us off the tarmac
    const maxLat = Math.max(1, hw - 2.4);
    if (Math.abs(lat + avoidGoal) > maxLat) avoidGoal = -avoidGoal * (Math.abs(lat - avoidGoal) <= maxLat ? 1 : 0);
    this.avoid += (avoidGoal - this.avoid) * Math.min(1, dt * 4);
    lat = clamp(lat + this.avoid, -maxLat, maxLat);

    const smp = tr.sample(sT);
    const tx = smp.pos.x + smp.right.x * lat, tz = smp.pos.z + smp.right.z * lat;
    const dx = tx - k.position.x, dz = tz - k.position.z;
    const zf = dx * fx + dz * fz, xr = dx * rx + dz * rz;
    const ang = Math.atan2(xr, zf);
    let want = clamp(ang * 1.9, -1, 1) + sepSteer;
    if (this.mistake) want += this.mistake.steer;
    if (loc.surface === "grass" || loc.onRoad === false) want = clamp(want * 1.3, -1, 1);
    want = clamp(want, -1, 1);

    // ---- speed plan ----
    const grip = cfg.grip * (0.9 + 0.2 * this.skill);
    let vSafe = 999;
    for (let i = 0; i < LOOK.length; i++) {
      const d = LOOK[i];
      const kk = Math.abs(tr.curvature(s + d));
      if (kk < 1e-4) continue;
      const vc = Math.max(15, Math.sqrt(grip / kk));
      // speed allowed now so that we can still brake down to vc by distance d
      const vNow = Math.sqrt(vc * vc + 2 * BRAKE_DECEL * d * 0.8);
      if (vNow < vSafe) vSafe = vNow;
    }
    const kNear = Math.abs(tr.curvature(s + 8));
    if (kNear > 1e-4) vSafe = Math.min(vSafe, Math.max(15, Math.sqrt(grip / kNear) * 1.05));
    // look-up for drift planning
    const kSigned = tr.curvature(s + 14);

    let throttle = 1, brake = 0;
    const over = speed - vSafe;
    if (over > 1.5) { brake = clamp(over / 8, 0.3, 1); throttle = 0; }
    else if (over > -1) { throttle = 0.35; }
    if (Math.abs(ang) > 1.0 && speed > 14) { throttle = Math.min(throttle, 0.4); if (Math.abs(ang) > 1.5) brake = Math.max(brake, 0.5); }
    if (nearAhead < 7 && speed > 20) throttle = Math.min(throttle, 0.6);
    if (this.mistake && this.mistake.lift) throttle = 0.2;
    if (loc.surface === "grass" && speed > 20) throttle = Math.min(throttle, 0.7);
    if (!racing) { throttle = 0; brake = 0; }

    // ---- drift ----
    let drift = false;
    if (this.cfg.drift > 0.01 && racing) {
      if (this.drifting) {
        this.driftT += dt;
        const kk = Math.abs(tr.curvature(s + 18));
        const wrong = Math.sign(want) === -this.driftDir && Math.abs(want) > 0.6;
        if (kk < DRIFT_K_OFF || this.driftT > 4 || speed < 18 || brake > 0.5 || Math.abs(ang) > 1.0 || wrong || Math.abs(loc.lateral - lat) > 4.5) {
          this.drifting = false;
          this.driftCool = 1.5;
        } else {
          drift = true;
        }
      } else if (this.driftCool > 0) {
        this.driftCool -= dt;
      } else if (Math.abs(kSigned) > DRIFT_K_ON && speed > 27 && brake < 0.2 && Math.abs(want) > 0.25 && Math.sign(want) === Math.sign(kSigned) && Math.abs(ang) < 0.8) {
        if (this.rng() < this.cfg.drift * (0.4 + 0.6 * this.skill)) {
          this.drifting = true; this.driftT = 0; this.driftDir = Math.sign(kSigned); drift = true;
        } else this.driftCool = 2;
      }
    }

    // ---- steering output (rate limited) ----
    const slew = cfg.slew * (this.drifting ? 1.6 : 1);
    this.steer += clamp(want - this.steer, -slew * dt, slew * dt);
    inp.steer = this.steer;
    inp.throttle = throttle;
    inp.brake = brake;
    inp.drift = drift;

    // ---- items ----
    if (k.item) this._items(dt, ctx, loc, kSigned, nearAhead, fx, fz, rx, rz);
    else this.itemSeen = null;

    const d = this.debug;
    d.s = s; d.lat = loc.lateral; d.vSafe = vSafe; d.mode = this.drifting ? "drift" : brake > 0 ? "brake" : "drive";
  }

  // ---- item use heuristics ----
  _items(dt, ctx, loc, kSigned, nearAhead, fx, fz, rx, rz) {
    const k = this.kart;
    if (this.itemSeen !== k.item) {
      this.itemSeen = k.item; this.itemT = 0; this.tripleGap = 0;
      const [a, b] = this.cfg.itemDelay;
      this.itemWait = a + this.rng() * (b - a);
    }
    this.itemT += dt;
    this.tripleGap -= dt;
    if (this.itemT < this.itemWait || ctx.items?.isRolling?.(k)) return;
    const karts = ctx.karts || [];
    const straight = Math.abs(this.track.curvature(loc.s + 25)) < 0.007 && Math.abs(this.track.curvature(loc.s + 55)) < 0.007;
    let ahead = null, aheadZ = 1e9, behind = null, behindZ = 1e9, aheadCount = 0;
    for (let i = 0; i < karts.length; i++) {
      const o = karts[i];
      if (o === k) continue;
      const dx = o.position.x - k.position.x, dz = o.position.z - k.position.z;
      const z = dx * fx + dz * fz, x = dx * rx + dz * rz;
      if (z > 0) {
        if (z < aheadZ && Math.abs(x) < Math.max(2.2, z * 0.18)) { aheadZ = z; ahead = o; }
      } else if (-z < behindZ && Math.abs(x) < 5) { behindZ = -z; behind = o; }
      if (o.race && k.race && o.race.place < k.race.place) aheadCount++;
    }
    const place = k.race ? k.race.place : 4;
    let use = false;
    switch (k.item) {
      case "boost": use = straight || this.itemT > 12; break;
      case "triple": use = (straight && this.tripleGap <= 0) || this.itemT > 18; if (use) this.tripleGap = 1.6; break;
      case "banana": use = (behind && behindZ < 20 && behindZ > 3) || this.itemT > 14; break;
      case "green": use = (ahead && aheadZ > 6 && aheadZ < 48) || this.itemT > 15; break;
      case "homing": use = (place > 1 && this.itemT > this.itemWait + 0.2) || this.itemT > 9; break;
      case "shield": {
        let threat = this.itemT > 9;
        const pr = ctx.items && ctx.items.projectiles;
        if (pr) for (const p of pr) {
          if (p.owner === k) continue;
          const dx = k.position.x - p.position.x, dz = k.position.z - p.position.z;
          if (dx * dx + dz * dz < 35 * 35 && (p.type === "homing" ? p.target === k : true)) { threat = true; break; }
        }
        if (behind && behindZ < 14 && place < 8 && this.itemT > 3) threat = true;
        use = threat; break;
      }
      case "shock": use = aheadCount >= 2 || this.itemT > 20; break;
      default: use = true;
    }
    if (use) this.wantUse = true;
  }
}
