// AI pilot. Factory signature (frozen): createAI(race, racer, pilot, difficulty) -> { think(dt, outControls) -> outControls }
//
// Flies with pilotSteer toward a lookahead point on the racing line (course.aiHints lateral + a personal lane), manages speed from
// corner caps (boost on straights, airbrake into corners), weaves for item orbs, avoids hazards / mines / rivals, takes shortcuts by
// personality, uses items by itemSense, barrel-rolls away from missiles, makes seeded human mistakes (consistency) and does stunts.
// All randomness comes from game.rng.fork(...) so a seed reproduces the race exactly.
import * as THREE from 'three';
import { clamp, lerp } from '../util.js';
import { pilotSteer } from '../flight/pilot.js';
import { WEAPONS } from './balance.js';

const DEFAULT_P = { skill: 0.8, aggression: 0.4, itemSense: 0.6, stunts: 0.3, shortcuts: 0.5, consistency: 0.8 };
const A_LAT = 30;           // m/s^2 lateral acceleration budget used when the course gives no corner cap
const A_BRAKE = 34;         // m/s^2 effective deceleration with the airbrake

const _tgt = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function wrapDelta(d, L) { if (d > L * 0.5) d -= L; else if (d < -L * 0.5) d += L; return d; }

export function createAI(race, racer, pilot, difficulty) {
  const course = race.course, L = course.length, P = { ...DEFAULT_P, ...(pilot && pilot.personality) };
  const rng = race.game.rng.fork(0xa100 + racer.id * 131);
  const sk = clamp(P.skill * (0.55 + 0.45 * difficulty.aiSkill), 0.25, 1);
  const cons = P.consistency, aggro = P.aggression * difficulty.aggro;
  const f = {}, g = {}, bf = {}, lookF = {}, hzF = {}, hzD = new THREE.Vector3(), hzList = [];
  const S = {
    lane: rng.range(-0.45, 0.45), avoidSide: 0, avoidT: 0,
    mist: { t: 0, kind: '', mag: 0 }, nextMist: rng.range(8, 40),
    br: null, brDec: new Map(), brUnit: new Map(),
    heldType: null, heldT: 0, react: 0, itemTimer: 0, backT: 0,
    rolled: new Set(), threatId: 0, threatT: 0, willReact: true, evTti: 0.35,
    stunt: { t: 0, dir: 1, kind: '' }, stuntCd: rng.range(6, 18), fireHold: 0, boostHold: 0, wobble: rng.range(0, 6.28),
  };
  const branches = course.branches || [];

  const expo = (mean) => -Math.log(1 - rng.float() * 0.999) * mean;

  // ---- branch frame helper (u in metres 0..length; auto-detects a normalised-u implementation)
  function branchPoint(b, u, out) {
    let k = S.brUnit.get(b);
    if (k === undefined) {
      k = 1;
      try {
        b.frameAt(b.length, bf); const m = course.frameAt(b.toS, lookF);
        const d1 = bf.pos.distanceTo(m.pos);
        b.frameAt(1, bf); const d2 = bf.pos.distanceTo(m.pos);
        if (d1 > 80 && d2 < d1 * 0.5) k = 1 / b.length;
      } catch { k = 1; }
      S.brUnit.set(b, k);
    }
    return b.frameAt(u * k, out);
  }

  function cornerCap(s) {
    const h = course.aiHints(s);
    course.frameAt(s, lookF);
    const kappa = Math.abs(lookF.curvature || 0), own = kappa < 1e-4 ? 400 : Math.sqrt(A_LAT / kappa);     // never trust the hint alone: bank/curvature of the path itself
    return h && isFinite(h.speedCap) ? Math.min(h.speedCap, own) : own;
  }

  function decideBranch(b) {
    const risk = b.risk ?? 0.5;
    let p = 0.15 + 0.8 * P.shortcuts - risk * 0.45 * (1 - sk * 0.8);
    p += racer.place >= 5 ? 0.15 : racer.place === 1 ? -0.12 : 0;
    p *= 0.55 + 0.45 * difficulty.aiSkill;
    return rng.float() < clamp(p, 0.03, 0.97);
  }

  function nearestAhead(maxD, minCos) {
    const fs = racer.flight; let best = null, bd = maxD;
    for (const o of race.racers) {
      if (o === racer || o.finished) continue;
      _a.copy(o.flight.pos).sub(fs.pos); const d = _a.length(); if (d > bd || d < 1) continue;
      if (_a.dot(fs.forward) / d < minCos) continue;
      best = o; bd = d;
    }
    return best ? { o: best, d: bd } : null;
  }
  function nearestBehind(maxD, minCos) {
    const fs = racer.flight; let best = null, bd = maxD;
    for (const o of race.racers) {
      if (o === racer || o.finished) continue;
      _a.copy(o.flight.pos).sub(fs.pos); const d = _a.length(); if (d > bd || d < 1) continue;
      if (-_a.dot(fs.forward) / d < minCos) continue;
      best = o; bd = d;
    }
    return best ? { o: best, d: bd } : null;
  }
  function rivalsWithin(r) {
    let n = 0; for (const o of race.racers) if (o !== racer && !o.finished && o.flight.pos.distanceToSquared(racer.flight.pos) < r * r) n++;
    return n;
  }

  // ---------------------------------------------------------------- item logic
  function itemLogic(dt, out, straight, threat) {
    const it = racer.item, fs = racer.flight;
    if (!it || racer.finished) { S.heldType = null; return; }
    if (S.heldType !== it.type) {
      S.heldType = it.type; S.heldT = 0; S.itemTimer = 0;
      S.react = (0.25 + (1 - P.itemSense) * 1.6) * (0.7 + rng.float() * 0.6) * (difficulty.reaction / 0.35);
    }
    S.heldT += dt;
    if (S.backT > 0) { S.backT -= dt; out.itemBack = true; }
    if (S.heldT < S.react) return;
    S.itemTimer -= dt; if (S.itemTimer > 0) return;
    S.itemTimer = 0.1 + rng.float() * 0.1;
    const patience = 12 + P.itemSense * 14;
    const fire = () => { out.item = true; S.backT = 0; };
    switch (it.type) {
      case 'missile': case 'triple': {
        const lock = racer.lock;
        if (lock.target && lock.progress >= 1) return fire();
        if (lock.target && P.itemSense < 0.5 && lock.progress > 0.45) return fire();
        if (!lock.target) {
          const ahead = nearestAhead(700, 0.9), behind = nearestBehind(450, 0.9);
          if (!ahead && behind && P.itemSense > 0.45 && S.backT <= 0) S.backT = 1.8;
          else if (ahead && aggro > 0.75 && S.heldT > S.react + 2.5) return fire();
        }
        if (S.heldT > patience + 8) return fire();
        return;
      }
      case 'mine': {
        const behind = nearestBehind(200, 0.8);
        if (behind && behind.d > 25) return fire();
        if (P.itemSense > 0.65 && straight && S.heldT > S.react + 1.5) return fire();
        if (S.heldT > patience) return fire();
        return;
      }
      case 'turbo': case 'turbo3':
        if (straight && fs.boost.timer <= 0 && !racer.wrongWay && (it.type === 'turbo' || S.heldT > 0.4)) { S.heldT = S.react + 0.01 - 1.0; return fire(); }
        if (S.heldT > patience + 6 && fs.boost.timer <= 0) return fire();
        return;
      case 'shield':
        if (threat && threat.tti < 2.6) return fire();
        if (race.racers.some((o) => o !== racer && o.lock.target === racer && o.lock.progress > 0.6)) return fire();      // someone is locking on: raise it before the shot
        if (P.itemSense < 0.5 || S.heldT > patience + 10) return fire();
        return;
      case 'emp': {
        const need = P.itemSense > 0.7 ? 2 : 1;
        if (rivalsWithin(WEAPONS.emp.radius * 0.8) >= need) return fire();
        if (S.heldT > patience + 6) return fire();
        return;
      }
      case 'storm':
        if (racer.place > 1) { S.itemTimer = 0.8; return fire(); }
        return;
      case 'smoke': {
        const behind = nearestBehind(150, 0.75);
        if (behind) return fire();
        if (S.heldT > patience + 6) return fire();
        return;
      }
      case 'drone': return fire();
      default: return;
    }
  }


  // ---- hazard planner: pick the lateral/vertical offset (at the look-ahead point) that clears every hazard in the look-ahead window.
  // Candidates are scored on clearance (craft radius + 11 m), deviation from the wanted line, and whether the swerve is reachable in time.
  const plan = { lat: 0, vert: 0, near: false, clear: 99 };
  function planHazards(s, v, lat0, vert0, hw, hh, look) {
    plan.lat = lat0; plan.vert = vert0; plan.near = false; plan.clear = 99;
    hzList.length = 0;
    const horizon = look * 1.6 + 50;
    for (const h of course.hazards || []) {
      if (h.branch >= 0 || !h.pos) continue;
      const ds = wrapDelta(h.s - s, L);
      if (ds < -12 || ds > horizon) continue;
      course.frameAt(h.s, hzF); hzD.copy(h.pos).sub(hzF.pos);
      hzList.push({ ds, l: hzD.dot(hzF.right), v: hzD.dot(hzF.up), r: (h.radius || 15) + 11, column: !!h.column });
      if (ds < v * 2.2 && ds > 0) plan.near = true;
    }
    // terrain that reaches into the corridor (mesas, rooftops): per-lane terrain penalty at four stations ahead
    let terr = null;
    for (let st = 0; st < 4; st++) {
      course.frameAt(s + look * (0.35 + st * 0.4), hzF);
      for (let k = -8; k <= 8; k++) {
        const cl = k * hw * 0.1; _a.copy(hzF.pos).addScaledVector(hzF.right, cl).addScaledVector(hzF.up, vert0);
        const over = course.groundHeight(_a.x, _a.z) + 16 - _a.y;
        if (over > 0) { terr ||= new Float32Array(17); terr[k + 8] += over * 14; }
      }
    }
    if (!hzList.length && !terr) return plan;
    let nearest = 1e9; for (const h of hzList) if (h.ds > -4) nearest = Math.min(nearest, h.ds);
    const tn = Math.max(0.05, nearest / Math.max(v, 40)), reach = 0.5 * 45 * tn * tn + 6;
    const vcs = hzList.some((h) => !h.column) ? [vert0, vert0 - 0.4 * hh, vert0 + 0.4 * hh] : [vert0];
    let bc = Infinity;
    for (let k = -8; k <= 8; k++) {
      const cl = k * hw * 0.1; if (Math.abs(cl) > hw * 0.78) continue;
      for (const cv of vcs) {
        if (Math.abs(cv) > hh * 0.5) continue;
        let cost = (terr ? terr[k + 8] : 0) + Math.abs(cl - lat0) * 0.6 + Math.abs(cv - vert0) * 0.4 + Math.abs(cl - racer.lateral) * 0.12 + Math.max(0, Math.abs(cl - racer.lateral) - reach) * 3;
        let mc = 99;
        for (const h of hzList) {
          const d = Math.hypot(cl - h.l, h.column ? 0 : cv - h.v) - h.r, w = h.ds < look ? 1 : 0.5;
          if (d < 0) cost += (1500 - d * 80) * w; else if (d < 14) cost += (14 - d) * 4 * w;
          if (d < mc) mc = d;
        }
        if (cost < bc) { bc = cost; plan.lat = cl; plan.vert = cv; plan.clear = mc; }
      }
    }
    return plan;
  }

  // ---------------------------------------------------------------- think
  return {
    state: S,
    think(dt, out) {
      const fs = racer.flight;
      out.boost = false; out.fire = false; out.item = false; out.itemBack = false; out.barrel = 0; out.airbrake = 0;
      if (racer.tumble > 0 || fs.tumble.t > 0) { out.pitch = 0; out.roll = 0; out.yaw = 0; S.stunt.t = 0; return out; }

      const s = racer.s, v = fs.speed, finished = racer.finished;
      const look = clamp(v * (0.7 + (1 - sk) * 0.5), 55, 170);

      // ---- mistakes (seeded, scaled by consistency and difficulty)
      let mistakeLat = 0, capMul = 0.8 + 0.2 * sk + (difficulty.aiSkill - 0.75) * 0.1, steerGain = 0.85 + 0.3 * sk;
      if (S.mist.t > 0) {
        S.mist.t -= dt;
        if (S.mist.kind === 'wide') mistakeLat = S.mist.mag; else if (S.mist.kind === 'late') capMul *= 1.22; else if (S.mist.kind === 'lazy') steerGain *= 0.4;
      } else if (!finished) {
        S.nextMist -= dt;
        if (S.nextMist <= 0) {
          const mean = 35 / ((1 - cons) * 2.2 + 0.12) / Math.max(0.2, difficulty.mistakes);
          S.nextMist = expo(mean) + 6;
          const x = rng.float(); S.mist.kind = x < 0.4 ? 'wide' : x < 0.75 ? 'late' : 'lazy';
          S.mist.t = rng.range(0.6, 1.4); S.mist.mag = rng.chance(0.5) ? 1 : -1; S.mist.mag *= rng.range(0.35, 0.65);
        }
      }
      if (racer.blind > 0) { S.wobble += dt * 3; mistakeLat += Math.sin(S.wobble) * 0.3; steerGain *= 0.7; }

      // ---- shortcut state machine
      let br = S.br; S.brApproach = -1;
      if (!br && branches.length && racer.onBranch < 0 && !finished) {
        for (let i = 0; i < branches.length; i++) {
          const b = branches[i], ds = wrapDelta(b.fromS - s, L);
          if (ds > -10 && ds < 300) {
            const key = i + ':' + racer.lap;
            let take = S.brDec.get(key); if (take === undefined) { take = decideBranch(b); S.brDec.set(key, take); }
            if (take && ds < 55) { S.br = br = { b, i, u: 0 }; break; }
            if (take) { S.brApproach = ds; S.brApproachB = b; }
          }
        }
      }
      if (!br && racer.onBranch >= 0 && !finished && branches[racer.onBranch] && racer.proj.u > 5) S.br = br = { b: branches[racer.onBranch], i: racer.onBranch, u: racer.proj.u };   // carried into a tube anyway: fly it properly
      if (br) {
        for (let k = 0; k < 2; k++) { branchPoint(br.b, br.u, bf); br.u = clamp(br.u + (_a.copy(fs.pos).sub(bf.pos).dot(bf.tangent)), 0, br.b.length); }
        branchPoint(br.b, br.u, bf);
        const off = fs.pos.distanceTo(bf.pos);
        if (br.u >= br.b.length - 8 || (off > 160 && racer.onBranch !== br.i)) { S.br = br = null; }
      }

      // ---- target point
      let cornerAhead = 400, tgtCap, hazNear = false;
      if (br) {
        // inside a narrow shortcut follow the BRANCH frame closely: a short look-ahead (long ones cut the bends into the wall), early braking
        const lookB = clamp(v * 0.75, 50, 130), lu = br.u + lookB;
        if (lu < br.b.length) { branchPoint(br.b, lu, f); _tgt.copy(f.pos); }
        else { course.frameAt(br.b.toS + (lu - br.b.length), f); _tgt.copy(f.pos); }
        const horizon = Math.min(450, v * v / (2 * A_BRAKE) + 90);
        let allowed = Infinity;
        for (let d = 0; d <= horizon; d += 30) {
          const u = Math.min(br.b.length, br.u + d + 10); branchPoint(br.b, u, g);
          const k = Math.abs(g.curvature || 0), size = Math.min(g.halfWidth || 60, (g.halfHeight || 45) * 1.3), c = Math.min(k < 1e-4 ? 400 : Math.sqrt(A_LAT * 0.7 / k), 40 + size * 1.7) * capMul;   // the narrower the tube, the slower
          allowed = Math.min(allowed, c + Math.sqrt(2 * A_BRAKE * d));
        }
        tgtCap = allowed;
        // recover to the centreline when drifting toward the wall
        branchPoint(br.b, br.u, bf); _a.copy(fs.pos).sub(bf.pos); const off = Math.hypot(_a.dot(bf.right) / (bf.halfWidth || 40), _a.dot(bf.up) / (bf.halfHeight || 40));
        if (off > 0.5) tgtCap = Math.min(tgtCap, v * 0.9);
        cornerAhead = tgtCap;
      } else {
        const st = s + look;
        course.frameAt(st, f);
        const hw = f.halfWidth || 90, hh = f.halfHeight || 70;
        const h = course.aiHints(s + look * 0.6);
        // speed cap preview: minimum cap in the braking horizon
        let allowed = Infinity, minCap = Infinity;
        const horizon = Math.min(700, v * v / (2 * A_BRAKE) + 120);
        for (let d = 0; d <= horizon; d += 45) {
          const c = cornerCap(s + d + 10) * capMul; minCap = Math.min(minCap, d <= 300 ? c : Infinity);
          allowed = Math.min(allowed, c + Math.sqrt(2 * A_BRAKE * d));
        }
        // a chosen shortcut: brake for ITS bends before reaching the mouth (the first ~150 m turn hard), not after
        if (S.brApproach >= 0 && S.brApproachB) {
          const b = S.brApproachB;
          for (let u = 0; u <= 260; u += 15) {
            branchPoint(b, Math.min(u, b.length), g);
            const k = Math.abs(g.curvature || 0), size = Math.min(g.halfWidth || 60, (g.halfHeight || 45) * 1.3);
            const c = Math.min(k < 1e-4 ? 400 : Math.sqrt(A_LAT * 0.7 / k), 40 + size * 1.7) * capMul;
            allowed = Math.min(allowed, c + Math.sqrt(2 * A_BRAKE * (S.brApproach + u)));
            if (u <= 150) minCap = Math.min(minCap, S.brApproach + u < 300 ? c : Infinity);
          }
        }
        cornerAhead = minCap; tgtCap = allowed;
        const straightness = clamp((minCap - 70) / 70, 0, 1);
        let lat = (h && isFinite(h.lateral) ? h.lateral : 0) * (0.6 + 0.4 * sk) + S.lane * hw * 0.45 * straightness + mistakeLat * hw;
        let vert = 0;
        // item orb weave
        if (!racer.item && race.items.enabled && !finished && P.itemSense > 0.15) {
          let best = null, bc = 1e9;
          for (const o of race.items.orbs) {
            if (!o.active) continue;
            const ds = wrapDelta(o.s - s, L);
            if (ds < look * 0.7 || ds > look * 1.6 + 120) continue;
            const cost = Math.abs(o.lateral - lat); if (cost > 55 || cost >= bc) continue;
            best = o; bc = cost;
          }
          if (best) { const w = 0.45 + 0.55 * P.itemSense; course.frameAt(best.s, g); _b.copy(best.pos).sub(g.pos); lat = lerp(lat, best.lateral, w); vert = _b.dot(g.up) * w; }
        }
        // avoid rivals dead ahead
        if (S.avoidT > 0) S.avoidT -= dt;
        for (const o of race.racers) {
          if (o === racer) continue;
          _a.copy(o.flight.pos).sub(fs.pos); const fwd = _a.dot(fs.forward);
          if (fwd < 4 || fwd > 70 + v * 0.18) continue;
          const dl = o.lateral - racer.lateral, dv = o.vertical - racer.vertical;
          if (Math.abs(dl) > 17 || Math.abs(dv) > 15) continue;
          if (S.avoidT <= 0) { let side = dl > 0 ? -1 : 1; if (Math.abs(racer.lateral + side * 25) > hw * 0.8) side = -side; S.avoidSide = side; S.avoidT = 1.1 + rng.float() * 0.5; }
        }
        if (S.avoidT > 0) lat += S.avoidSide * 22;
        if (S.brApproach >= 0) { const w = clamp(1 - S.brApproach / 280, 0, 1); lat = lerp(lat, 0, w); vert = lerp(vert, 0, w); }   // line up with the narrow shortcut mouth
        lat = clamp(lat, -hw * 0.78, hw * 0.78); vert = clamp(vert, -hh * 0.7, hh * 0.7);
        const pl = planHazards(s, v, lat, vert, hw, hh, look); lat = pl.lat; vert = pl.vert; hazNear = pl.near;
        if (pl.clear < 7) tgtCap = Math.min(tgtCap, v * 0.88);
        // wall-aware recovery: past ~70% of the corridor ellipse, aim back toward the middle and shave speed
        const we = Math.hypot(racer.lateral / hw, racer.vertical / hh);
        if (we > 0.7) { const w = clamp((we - 0.7) / 0.3, 0, 1); lat = lerp(lat, 0, 0.85 * w); vert = lerp(vert, 0, 0.85 * w); tgtCap = Math.min(tgtCap, v * (1 - 0.18 * w)); }
        if (pl.near && pl.clear < 14) tgtCap = Math.min(tgtCap, Math.max(70, 40 + (hw + hh) * 0.9));   // slalom: slow to what the craft can turn at
        _tgt.copy(f.pos).addScaledVector(f.right, lat).addScaledVector(f.up, vert);
      }

      // ---- hazards and mines bend the target (segment based, so a line through a hazard is repaired)
      const margin = 22 + v * 0.08;
      for (const hz of br ? (course.hazards || []) : []) {
        if (!hz.pos || hz.pos.distanceToSquared(fs.pos) > 500 * 500) continue;
        steerAround(fs.pos, hz.pos, (hz.radius || 20) + margin);
      }
      for (const m of race.items.mines) steerAround(fs.pos, m.pos, 30);
      function steerAround(from, c, r) {
        _a.copy(_tgt).sub(from); const l2 = _a.lengthSq(); if (l2 < 1) return;
        const t = clamp(_b.copy(c).sub(from).dot(_a) / l2, 0, 1);
        _c.copy(from).addScaledVector(_a, t).sub(c); const d = _c.length();
        if (d < r) { if (d < 1e-3) _c.copy(fs.right); else _c.divideScalar(d); _tgt.addScaledVector(_c, (r - d) * 1.4); }
      }
      // ground clearance
      const gh = course.groundHeight(_tgt.x, _tgt.z);
      if (br) { const wl = course.def?.waterLevel; if (wl != null && _tgt.y < wl + 20) _tgt.y = wl + 20; }      // inside a low tube: keep off the sea (the ellipse clamp below keeps it in the tube)
      if (!br) {
        // terrain starts abruptly (mesas, cliffs): look at the ground along the whole braking window, at our own lateral offset, not only at the target
        let gmax = gh;
        for (let k = 0.3; k <= 1.61; k += 0.45) {
          course.frameAt(s + look * k, lookF); _a.copy(lookF.pos).addScaledVector(lookF.right, racer.lateral);
          gmax = Math.max(gmax, course.groundHeight(_a.x, _a.z), course.groundHeight(lookF.pos.x, lookF.pos.z));
        }
        if (_tgt.y < gmax + 30) _tgt.y = gmax + 30;
      }

      // keep the (bent) target inside the corridor of the frame we are aiming along: a narrow shortcut is only ~34 m half-width, so an
      // unclamped hazard / mine detour drags the racer out of the branch (where the projection then falls back to a distant main-line point)
      {
        const hw0 = f.halfWidth || 90, hh0 = f.halfHeight || 70;           // the corridor is an ellipse: lateral and vertical offsets share one budget
        _a.copy(_tgt).sub(f.pos); const dl = _a.dot(f.right), dv = _a.dot(f.up);
        const e = Math.hypot(dl / hw0, dv / hh0);
        if (e > 0.62) { const k = 0.62 / e; _tgt.addScaledVector(f.right, dl * k - dl).addScaledVector(f.up, dv * k - dv); }
      }
      // ---- stunts: manual roll or barrel on a clear straight (never in a fight)
      const st = S.stunt;
      if (st.t > 0) {
        st.t -= dt;
        if (st.kind === 'roll') { out.roll = st.dir; out.pitch = 0; out.yaw = 0; }
      }
      const threat = race.items.threatOf(racer);
      const straight = cornerAhead > Math.max(v * 1.35, 140);
      if (st.t <= 0) {
        S.stuntCd -= dt;
        if (S.stuntCd <= 0 && !threat && straight && !finished && v > 55 && !nearestAhead(120, 0.5) && !nearestBehind(60, 0.5) && racer.lateral === racer.lateral) {
          S.stuntCd = rng.range(7, 20) / (0.2 + P.stunts);
          if (rng.chance(P.stunts * 0.9)) {
            st.dir = rng.chance(0.5) ? 1 : -1;
            if (rng.chance(0.5) && Math.abs(racer.lateral) < (f.halfWidth || 90) * 0.5) { st.kind = 'roll'; st.t = 1.9; } else out.barrel = st.dir;
          }
        }
      }
      if (st.t <= 0 || st.kind !== 'roll') pilotSteer(fs, _tgt, out, { aggressiveness: steerGain });

      // ---- speed management
      const capNow = Math.max(tgtCap, fs.params.minSpeed * 1.22);      // below ~minSpeed the control authority fades (and it stalls): never brake into that
      if (v > capNow * 1.02) out.airbrake = clamp((v - capNow) / 28, 0, 1);
      else if (straight && !hazNear && fs.boost.meter > 12 && !racer.wrongWay && !finished) out.boost = true;
      if (finished) out.boost = false;

      // ---- missile evasion
      if (threat) {
        const m = threat.missile;
        if (S.threatId !== m.id) {
          S.threatId = m.id; S.threatT = 0;
          const react = clamp(0.2 + 0.8 * sk * (0.4 + 0.6 * cons), 0, 1) * (1.15 - difficulty.reaction);
          S.willReact = rng.float() < react; S.evTti = 0.38 + rng.gauss() * (1 - sk * cons) * 0.3;
          S.rollDir = rng.chance(0.5) ? 1 : -1;
        }
        S.threatT += dt;
        if (S.willReact && S.threatT > difficulty.reaction * 0.6) {
          if (racer.item && racer.item.type === 'shield' && threat.tti < 2.6) out.item = true;
          else if (threat.tti < S.evTti + 0.15 && fs.barrel.cooldown <= 0 && fs.barrel.t <= 0 && !S.rolled.has(m.id)) { S.rolled.add(m.id); out.barrel = S.rollDir; }
          else if (threat.tti > 1.0 && fs.boost.meter > 10 && threat.dist > 130) out.boost = true;
        }
      } else S.threatId = 0;

      // ---- items, cannon
      if (!finished && race.items.enabled) {
        itemLogic(dt, out, straight, threat);
        if (aggro > 0.3 && !racer.overheated && racer.heat < 0.72) {
          if (S.fireHold > 0) { S.fireHold -= dt; out.fire = true; }
          else {
            const tgt = nearestAhead(260, 0.995);
            if (tgt && tgt.d > 45 && tgt.o.invuln <= 0 && tgt.o.tumble <= 0 && rng.float() < aggro * 0.007) S.fireHold = 0.3 + rng.float() * 0.5;
          }
        }
      }
      return out;
    },
  };
}
