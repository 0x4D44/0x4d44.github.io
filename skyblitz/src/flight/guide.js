// Keyboard flight guide (Standard assist only). Owner: flight agent.
// A keyboard has no half stick, so a human on keys cannot hold a line round a tube-shaped course. The guide flies a gentle line towards the
// middle of the course ahead whenever the keys are idle or only tapped. A held key hands most of the craft back (one shared fade over both axes) but never all:
// a residual quarter of the guide stays on, plus a safety net that grows with the predicted risk (terrain, tube wall, hazard):
//   input.js sample() -> guide.blend(game, fs, roll, pitch, out) -> out.roll / out.pitch   (the keyboard's own values in, the blended values out)
// Gamepad and touch input, Pro assist and the AI never go through here. Pure logic (no DOM / WebGL), uses pilotSteer for the actual steering.
import * as THREE from 'three';
import { clamp, smoothstep } from '../util.js';
import { pilotSteer, pilotAvoid } from './pilot.js';

export const GUIDE = {
  strength: 0.85,           // 0..1 weight of the guide when the keys are idle
  lookT: 0.85,              // seconds of flight ahead the guide aims at
  lookMin: 55, lookMax: 130,
  keep: 0.45,               // share of the current lateral / vertical offset the guide keeps (0 = pull to the centre line, 1 = hold the line)
  fadeLo: 0.15, fadeHi: 0.7,   // |key value| over which the guide hands over to the player
  aggr: 0.8,
  predT: 1.3,               // s: where the craft will be if the player does nothing; the guide acts on that point, not on where the craft is now
  eLo: 0.55, eHi: 0.95,     // tube fraction (at the predicted point) where the guide starts to act / acts fully
  mouth: 140,               // m ahead of a shortcut mouth where the guide stands aside
  groundMargin: 8,          // m over the craft radius under the craft's own track below which the guide never descends and climbs
  netStrength: 1, netLo: 0.45,   // safety net: weight floor under held keys = netStrength * smoothstep(netLo, 1, risk)
  closeLo: 4, closeHi: 24,  // m of clearance the predicted track loses against the ground under it now: the net sees terrain only when this closes (0 level, 1 a plunge)
  intentPitch: 0.7, intentT: 0.2,   // pitch held past this for this long while the track is not closing on the ground = a loop: netStrength and residual stand down
  residual: 0.35,         // share of the normal guide weight that stays on under held keys (a person who steers keeps most of the authority)
  floor: 0.5,              // guide weight in plain safe flight (a gentle drift back to the middle)
  avoidLook: 1.6, avoidMargin: 6, avoidGap: 12, avoidAim: 0.45, avoidColMargin: 6,   // R3-F1 hazard push: looks this many seconds ahead; fully on when the lane runs into the (padded) sphere, zero when it clears it by margin m
};

const _t = new THREE.Vector3(), _f = {}, _hf = {}, _o = { pitch: 0, roll: 0, yaw: 0 }, _a = new THREE.Vector3(), _hd = new THREE.Vector3();
const _bt = new THREE.Vector3(), avoidList = [], avoidPool = [], colList = [], colPool = [];
const _pp = new THREE.Vector3(), pproj = { s: 0, lateral: 0, vertical: 0, dist: 0, branch: -1, u: 0 }, _pf = {};
const hz = [], plan = { lat: 0, vert: 0 };
const terr = new Float32Array(17);

/** Lateral / vertical offset (m from the centre line) at the look-ahead point that clears hazards and terrain reaching into the tube. The same idea as the AI's
 *  hazard planner: score the lanes by terrain, hazards and distance from the wanted line, take the cheapest. */
function planLane(course, s, v, lat0, vert0, hw, hh, look, latNow) {
  plan.lat = lat0; plan.vert = vert0; hz.length = 0;
  const L = course.length, horizon = look * 1.6 + 50;
  for (const h of course.hazards || []) {
    if (h.branch >= 0 || !h.pos) continue;
    let ds = h.s - s; ds -= Math.round(ds / L) * L;
    if (ds < -12 || ds > horizon) continue;
    course.frameAt(h.s, _hf); _hd.copy(h.pos).sub(_hf.pos);
    hz.push({ ds, l: _hd.dot(_hf.right), v: _hd.dot(_hf.up), r: (h.radius || 15) + 11, column: !!h.column });
  }
  terr.fill(0); let anyT = false;
  for (let st = 0; st < 4; st++) {
    course.frameAt(s + look * (0.35 + st * 0.4), _hf);
    for (let k = -8; k <= 8; k++) {
      const cl = k * hw * 0.1; _a.copy(_hf.pos).addScaledVector(_hf.right, cl).addScaledVector(_hf.up, vert0);
      const over = course.groundHeight(_a.x, _a.z) + 16 - _a.y;
      if (over > 0) { terr[k + 8] += over * 14; anyT = true; }
    }
  }
  if (!hz.length && !anyT) return plan;
  let nearest = 1e9; for (const h of hz) if (h.ds > -4) nearest = Math.min(nearest, h.ds);
  const tn = Math.max(0.05, nearest / Math.max(v, 40)), reach = 0.5 * 45 * tn * tn + 6;
  const vcs = hz.some((h) => !h.column) ? [vert0, vert0 - 0.4 * hh, vert0 + 0.4 * hh] : [vert0];
  let bc = Infinity;
  for (let k = -8; k <= 8; k++) {
    const cl = k * hw * 0.1; if (Math.abs(cl) > hw * 0.78) continue;
    for (const cv of vcs) {
      if (Math.abs(cv) > hh * 0.5) continue;
      let cost = terr[k + 8] + Math.abs(cl - lat0) * 0.6 + Math.abs(cv - vert0) * 0.4 + Math.abs(cl - latNow) * 0.12 + Math.max(0, Math.abs(cl - latNow) - reach) * 3;
      for (const h of hz) {
        const d = Math.hypot(cl - h.l, h.column ? 0 : cv - h.v) - h.r, w = h.ds < look ? 1 : 0.5;
        if (d < 0) cost += (1500 - d * 80) * w; else if (d < 14) cost += (14 - d) * 4 * w;
      }
      if (cost < bc) { bc = cost; plan.lat = cl; plan.vert = cv; }
    }
  }
  return plan;
}

const _pa = new THREE.Vector3(), _ps = new THREE.Vector3();
/** R3-F1: continuous hazard push, in the lane space of the track (lateral / vertical metres from the centre line, as planLane sees it). Each hazard near the
 *  lane gets a weight w 0..1: 0 when the craft's lane clears the padded sphere by cfg.avoidMargin, 1 when it runs into it, smooth in between (the old binary
 *  test flipped at the edge and the craft chattered into the sphere), also fading in over the last stretch before the hazard and out behind it. Each pulls the
 *  aim to the lane that passes it, taken where the hazard is (not at the far look-ahead point: the craft turns late at speed). The side is the cheaper
 *  feasible lane (nearest to where the craft is, room in the tube, a lean to the centre for the dead-centre tie), so there is no switch to chatter at the
 *  edge, and it is chosen in lane space, not from which side of the flight line the hazard lies: on a bend that sent the craft into the wall (sunrise s 1450).
 *  Several hazards blend by weight, so passing one and meeting the next moves the aim smoothly. Writes the aim into `out`, returns the total weight (0 = none).
 *  Spheres only: columns still go through pilotAvoid's switch (softening its edge made the redrock / frost slaloms fail more often, see the round-3 flight handoff).
 *  `list` entries are { ds (m ahead along the course), lat, vert, radius (padded) }. */
function hazardPush(course, list, s0, latNow, vertNow, vert, hw, speed, look, cfg, out) {
  const H = cfg.avoidLook * speed, lim = hw * 0.78;
  let wsum = 0, wnone = 1; _ps.set(0, 0, 0);
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    if (h.ds > H + h.radius) continue;
    const dv = h.vert - vertNow, miss = Math.hypot(h.lat - latNow, dv), need = h.radius + cfg.avoidMargin;
    const w = (1 - smoothstep(h.radius, need, miss)) * (1 - smoothstep(0.7 * H, H, h.ds)) * smoothstep(-(h.radius + 14), -4, h.ds);
    if (w <= 0.001) continue;
    const gp = h.radius + cfg.avoidGap, gap = Math.sqrt(Math.max(gp * gp - dv * dv, 0)) + 2;
    const lr = h.lat + gap, ll = h.lat - gap;
    const cr = Math.abs(lr - latNow) + (lr > lim ? 1000 : 0) + 0.05 * Math.abs(lr), cl = Math.abs(ll - latNow) + (ll < -lim ? 1000 : 0) + 0.05 * Math.abs(ll);
    const fa = course.frameAt(s0 + clamp(h.ds * cfg.avoidAim, 30, look), _hf);
    _pa.copy(fa.pos).addScaledVector(fa.right, cr < cl ? lr : ll).addScaledVector(fa.up, vert);
    _ps.addScaledVector(_pa, w); wsum += w; wnone *= 1 - w;
  }
  if (wsum <= 0) return 0;
  out.copy(_ps).divideScalar(wsum);
  return 1 - wnone;
}

const SIM_STEP = 1 / 60, PLAN_EVERY = 4;
/** 0..1: how badly the line the craft is on (straight along its velocity, GUIDE.predT ahead) leaves the tube, nears the ground or meets a hazard. */
function predictRisk(course, fs, proj, br, cfg, rk) {
  let risk = 0; rk.net = 0; rk.ground = 0;
  const clr0 = fs.pos.y - course.groundHeight(fs.pos.x, fs.pos.z);
  for (let i = 1; i <= 3; i++) {
    const t = cfg.predT * (i / 3);
    _pp.copy(fs.pos).addScaledVector(fs.vel, t);
    const gh = course.groundHeight(_pp.x, _pp.z), clr = _pp.y - gh;
    const gr = 1 - smoothstep(10, 38, clr);
    risk = Math.max(risk, gr);
    // the safety net sees terrain only when the track CLOSES on it (a descent, or ground rising ahead): level flight low over the ground is the player's own
    const gc = gr * smoothstep(cfg.closeLo, cfg.closeHi, clr0 - clr); rk.net = Math.max(rk.net, gc); rk.ground = Math.max(rk.ground, gc);
    if (i === 3) {
      pproj.branch = proj.branch; pproj.u = proj.u;
      course.project(_pp, proj.s + fs.speed * t, pproj);
      const f = br && pproj.branch === proj.branch ? br.frameAt(pproj.u, _pf) : course.frameAt(pproj.s, _pf);
      const e = Math.hypot(pproj.lateral / (f.halfWidth || 80), pproj.vertical / (f.halfHeight || 60));
      const te = smoothstep(cfg.eLo, cfg.eHi, e); risk = Math.max(risk, te); rk.net = Math.max(rk.net, te);
    }
    if (!br) for (const h of course.hazards || []) {
      if (h.branch >= 0 || !h.pos) continue;
      const dx = _pp.x - h.pos.x, dz = _pp.z - h.pos.z, r = (h.radius || 15) + 30;
      if (h.column ? (_pp.y > h.bottom - 30 && _pp.y < h.top + 30 && dx * dx + dz * dz < r * r) : (dx * dx + dz * dz + (_pp.y - h.pos.y) ** 2 < r * r)) risk = rk.net = 1;
    }
  }
  return risk;
}

export function createGuide() {
  const proj = { s: 0, lateral: 0, vertical: 0, dist: 0, branch: -1, u: 0 };
  const g = { proj, active: 0, risk: 0, netRisk: 0, have: false }, rk = { net: 0, ground: 0 };
  const cachePl = { lat: 0, vert: 0 }; let cacheAge = 99, holdT = 0;

  /** Blend the keyboard's roll / pitch with the guide's. Returns the guide weight (0 when it did nothing). */
  g.blend = (game, fs, roll, pitch, out, cfg = GUIDE) => {
    out.roll = roll; out.pitch = pitch; g.active = 0;
    const race = game.race, course = game.course, racer = game.player;
    if (!race || !course || !racer || race.state !== 'racing' || racer.finished || racer.tumble > 0 || fs.tumble.t > 0 || fs.barrel.t > 0 || fs.stall.active) { g.have = false; return 0; }
    const s = game.settings;
    if (!s || s.assist === 'pro' || s.keyGuide === false) return 0;
    if (fs.stunt.loop > 0 || Math.abs(fs.forward.y) > 0.6 || fs.up.y < -0.2) { g.have = false; return 0; }    // a loop (or any steep / inverted attitude) is the player's own
    course.project(fs.pos, g.have ? proj.s : racer.s, proj);
    if (!g.have || proj.dist > 400) { g.have = true; course.project(fs.pos, null, proj); }
    const br = proj.branch >= 0 ? course.branches[proj.branch] : null;
    const look = clamp(fs.speed * cfg.lookT, cfg.lookMin, cfg.lookMax);
    const fr = br ? br.frameAt(Math.min(proj.u + look, br.length), _f) : course.frameAt(proj.s + look, _f);
    const hw = fr.halfWidth || 80, hh = fr.halfHeight || 60;
    const lat0 = clamp(proj.lateral * cfg.keep, -hw * 0.5, hw * 0.5), vert0 = clamp(proj.vertical * cfg.keep, -hh * 0.5, hh * 0.5);
    // T7: the lane plan (17 x 4 terrain probes) is recomputed every 4th step and reused in between (the lane moves slowly)
    if (br) { cachePl.lat = lat0; cachePl.vert = vert0; cacheAge = 99; }
    else if (cacheAge >= PLAN_EVERY) { const r = planLane(course, proj.s, fs.speed, lat0, vert0, hw, hh, look, proj.lateral); cachePl.lat = r.lat; cachePl.vert = r.vert; cacheAge = 1; }
    else cacheAge++;
    const pl = cachePl;
    _t.copy(fr.pos).addScaledVector(fr.right, pl.lat).addScaledVector(fr.up, pl.vert);
    // hazards on the course ahead bend the aim away: columns by pilotAvoid (as before), spheres by hazardPush (continuous, in lane space)
    let avoiding = 0;
    if (!br) {
      avoidList.length = 0; colList.length = 0;
      for (const h of course.hazards || []) {
        if (h.branch >= 0 || !h.pos) continue;
        if (h.column) {
          if (h.pos.distanceToSquared(fs.pos) > (look + 150) * (look + 150)) continue;
          const e = colPool[colList.length] ||= { pos: new THREE.Vector3(), radius: 0 };
          e.pos.copy(h.pos); e.pos.y = fs.pos.y; e.radius = (h.radius || 15) + 6; colList.push(e); continue;
        }
        let ds = h.s - proj.s; ds -= Math.round(ds / course.length) * course.length;
        if (ds < -60 || ds > look + 300) continue;
        const e = avoidPool[avoidList.length] ||= { ds: 0, lat: 0, vert: 0, radius: 0 };
        course.frameAt(h.s, _hf); _hd.copy(h.pos).sub(_hf.pos);
        e.ds = ds; e.lat = _hd.dot(_hf.right); e.vert = _hd.dot(_hf.up); e.radius = (h.radius || 15) + 6; avoidList.push(e);
      }
      // columns keep the old geometry and its switch: measured, softening the edge (a 5 or 10 m fade) made the slaloms on redrock / frost worse for 6 to 11 of the 24 craft x course runs
      if (colList.length && pilotAvoid(fs, _t, colList, _bt, { lookAhead: cfg.avoidLook, margin: cfg.avoidColMargin, tight: 0.4 })) { avoiding = 1; _t.copy(_bt); }
      if (avoidList.length) {
        const wp = hazardPush(course, avoidList, proj.s, proj.lateral, proj.vertical, pl.vert, hw, fs.speed, look, cfg, _a);
        if (wp > 0) {   // the aim blends towards the passing lanes by the total weight; a nearer aim keeps the base aim's climb angle (same height error over a shorter run would pitch the nose hard)
          const hb = Math.hypot(_t.x - fs.pos.x, _t.z - fs.pos.z), ha = Math.hypot(_a.x - fs.pos.x, _a.z - fs.pos.z);
          _a.y = fs.pos.y + (_t.y - fs.pos.y) * ha / Math.max(hb, 1); _t.lerp(_a, wp); avoiding = Math.max(avoiding, wp);
        }
      }
    }
    pilotSteer(fs, _t, _o, { aggressiveness: cfg.aggr });
    // how bad is the player's own line? predicted tube position, terrain and hazards a moment ahead; fine lines (shortcut mouths, loops, corner cutting) cost nothing
    const pr = predictRisk(course, fs, proj, br, cfg, rk);
    const risk = g.risk = Math.max(avoiding, pr, g.risk - 0.5 * SIM_STEP * 1.0);
    const netRisk = g.netRisk = Math.max(avoiding, rk.net, g.netRisk - 0.5 * SIM_STEP * 1.0);
    let mouth = br ? 1 : 0;
    if (!br) for (const b of course.branches) { let d = b.fromS - proj.s; d -= Math.round(d / course.length) * course.length; if (d > -40 && d < cfg.mouth + look) mouth = 1; }
    const k = (cfg.floor + (1 - cfg.floor) * risk) * (mouth ? 0.15 + 0.85 * risk : 1);
    // R2-P-01 (T3): ONE fade for both axes, from the larger key. A held roll key must hand pitch back too, or the idle pitch axis pulls the nose out of the bank.
    // R2-P-02 (T8): two floors that stay on while keys are held. The safety net (a line about to meet terrain, a wall or a hazard belongs to the guide, keys or not;
    // eased at shortcut mouths) and a residual quarter of the guide's own command (keeps a person who steers alive without taking the wheel).
    const fade = cfg.strength * k * (1 - smoothstep(cfg.fadeLo, cfg.fadeHi, Math.max(Math.abs(roll), Math.abs(pitch))));
    // a deliberate hard pull (pitch held past intentPitch for intentT s while the track is not closing on the ground) is a loop being flown: the floors stand down; they stay for descents
    holdT = pitch > cfg.intentPitch ? holdT + SIM_STEP : 0;
    const intent = holdT > cfg.intentT && rk.ground < 0.5;
    const ws = intent ? 0 : cfg.netStrength * smoothstep(cfg.netLo, 1, netRisk) * (mouth ? 0.15 + 0.85 * netRisk : 1), res = intent ? 0 : cfg.strength * k * cfg.residual;
    const wR = Math.max(fade, ws, res), wP = wR;
    out.roll = roll + wR * (clamp(_o.roll, -1, 1) - roll);
    out.pitch = pitch + wP * (clamp(_o.pitch, -1, 1) - pitch);
    // R2-P-01 (T1): never sink towards the ground. The craft's own track (now, +0.35 s, +0.7 s along its velocity) must clear the ground under it by the
    // craft's radius plus a margin; below that the guide holds level (no descent) and climbs in proportion to the shortfall. A player's own push-down is left alone.
    if (pitch > -cfg.fadeLo) {
      let clr = Infinity;
      for (let i = 0; i < 3; i++) { const t = i * 0.35; clr = Math.min(clr, fs.pos.y + fs.vel.y * t - course.groundHeight(fs.pos.x + fs.vel.x * t, fs.pos.z + fs.vel.z * t) - (racer.radius || 4)); }
      if (clr < cfg.groundMargin) out.pitch = Math.max(out.pitch, clamp((cfg.groundMargin - clr) / cfg.groundMargin, 0, 1) * 0.6);
    }
    g.active = Math.max(wR, wP);
    return g.active;
  };
  g.reset = () => { cacheAge = 99; holdT = 0; g.have = false; g.active = 0; g.risk = 0; g.netRisk = 0; };
  return g;
}
