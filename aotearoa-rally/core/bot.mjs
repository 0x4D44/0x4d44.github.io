// Driver bot (DYNAMICS lane): pure pursuit on a pre-computed racing line, friction-circle speed profile,
// crest / jump / ford limits, ABS-style brake modulation, automatic recovery. Pure module (no DOM/THREE).
//
//   const bot = createBot(stage, vehicle, { skill: 1 });   // skill 0.6 .. 1.0
//   input = bot.control(dt);                               // returns a reused input object
//   bot.reset();
//
// Also exports bestTyreFor(stage) -> "gravel"|"tarmac"|"snow" (used by calibration and rivals).

import { SURFACE_INFO } from "./surfaces.mjs";
import { TYRE_GRIP } from "./tyre.mjs";
import { steerFactor } from "./physics.mjs";

const G = 9.81;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The tyre compound that gives the most grip over the stage's road surface mix. */
export function bestTyreFor(stage) {
  const names = ["gravel", "tarmac", "snow"];
  let best = "gravel", bestScore = -1;
  for (const nm of names) {
    const tab = TYRE_GRIP[nm];
    let score = 0;
    for (let i = 0; i < stage.N; i += 4) {
      const sf = stage.surf[i];
      const mu = SURFACE_INFO[sf].mu * tab[sf];
      // grip below ~0.55 is painful: weight it so it dominates the average
      score += mu < 0.55 ? mu * 0.6 : mu;
    }
    score /= Math.ceil(stage.N / 4);
    if (score > bestScore + 1e-9) { bestScore = score; best = nm; }
  }
  return best;
}

export function createBot(stage, vehicle, opts = {}) {
  const skill = clamp(opts.skill === undefined ? 1 : opts.skill, 0.6, 1);
  const spec = vehicle.spec;
  const tyre = (vehicle.options && vehicle.options.tyre) || "gravel";
  const tab = TYRE_GRIP[tyre] || TYRE_GRIP.gravel;
  const N = stage.N, ds = stage.ds;
  const margin = opts.margin === undefined ? 2.3 : opts.margin;
  const gripAvg = (spec.handling.gripFront + spec.handling.gripRear) * 0.5;
  const aMul = (0.5 + 0.5 * skill) * (opts.planFactor === undefined ? 0.6 : opts.planFactor);
  const vTop = opts.vTop || 75;

  // ---------- racing line ----------
  const limR = new Float64Array(N), limL = new Float64Array(N);
  const halfCar = (spec.width || 1.76) * 0.5 + 0.35;
  const obsTmp = [];
  for (let i = 0; i < N; i++) {
    let r = Math.max(0, stage.width[i] * 0.5 - margin), l = r;
    if (stage.obstaclesNear) {
      obsTmp.length = 0;
      const rad = stage.width[i] * 0.5 + 5;
      stage.obstaclesNear(stage.px[i], stage.pz[i], rad, obsTmp);
      const nx = -stage.tz[i], nz = stage.tx[i];
      for (let k = 0; k < obsTmp.length; k++) {
        const o = obsTmp[k];
        if ((o.hardness === undefined ? 0.6 : o.hardness) < 0.3 || o.r < 0.12) continue;
        const dx = o.x - stage.px[i], dz = o.z - stage.pz[i];
        const along = dx * stage.tx[i] + dz * stage.tz[i];
        if (Math.abs(along) > o.r + 2.4) continue; // only props abreast of this station
        const lo = dx * nx + dz * nz; // + : right of the centreline
        if (lo > 0) r = Math.min(r, Math.max(0, lo - o.r - halfCar));
        else l = Math.min(l, Math.max(0, -lo - o.r - halfCar));
      }
    }
    limR[i] = r; limL[i] = l;
  }
  limR[0] = 0; limL[0] = 0; limR[N - 1] = 0; limL[N - 1] = 0;
  const lat = new Float64Array(N);
  const LX = new Float64Array(N), LZ = new Float64Array(N);
  for (let i = 0; i < N; i++) { LX[i] = stage.px[i]; LZ[i] = stage.pz[i]; }
  for (let it = 0; it < 220; it++) {
    for (let i = 1; i < N - 1; i++) {
      const nx = -stage.tz[i], nz = stage.tx[i];
      const mx = 0.5 * (LX[i - 1] + LX[i + 1]), mz = 0.5 * (LZ[i - 1] + LZ[i + 1]);
      const target = (mx - stage.px[i]) * nx + (mz - stage.pz[i]) * nz;
      let l = lat[i] + 0.6 * (target - lat[i]);
      l = clamp(l, -limL[i], limR[i]);
      lat[i] = l;
      LX[i] = stage.px[i] + nx * l;
      LZ[i] = stage.pz[i] + nz * l;
    }
  }
  // curvature of the line (positive = right) from headings
  const head = new Float64Array(N);
  for (let i = 0; i < N - 1; i++) head[i] = Math.atan2(-(LX[i + 1] - LX[i]), -(LZ[i + 1] - LZ[i]));
  head[N - 1] = head[N - 2];
  const kappa = new Float64Array(N);
  for (let i = 1; i < N - 1; i++) {
    let d = head[i] - head[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const seg = Math.hypot(LX[i + 1] - LX[i - 1], LZ[i + 1] - LZ[i - 1]) * 0.5;
    kappa[i] = -d / Math.max(0.5, seg);
  }
  kappa[0] = kappa[1]; kappa[N - 1] = kappa[N - 2];
  // windowed max |kappa| (anticipate apex)
  const kabs = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(N - 1, i + 2); j++) m = Math.max(m, Math.abs(kappa[j]));
    kabs[i] = m;
  }

  // ---------- speed profile ----------
  const hLine = new Float64Array(N);
  for (let i = 0; i < N; i++) hLine[i] = stage.heightAt(LX[i], LZ[i]);
  const vmax = new Float64Array(N);
  const muAt = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const sf = stage.surf[i];
    const mu = SURFACE_INFO[sf].mu * tab[sf] * gripAvg;
    muAt[i] = mu;
    const bankEff = stage.bank ? Math.sin(stage.bank[i] * Math.sign(kappa[i] || 1)) * G : 0;
    const aLat = mu * G * aMul + bankEff * 0.6;
    let v = Math.sqrt(Math.max(1, aLat) / Math.max(kabs[i], 1e-4));
    if (v > vTop) v = vTop;
    // crest (negative vertical curvature) from the real ground under the racing line
    if (i > 0 && i < N - 1) {
      const kv = -(hLine[i + 1] - 2 * hLine[i] + hLine[i - 1]) / (ds * ds);
      if (kv > 0.002) v = Math.min(v, Math.sqrt((0.42 * G) / kv));
      // rough road: heavy small-scale roughness limits speed
      const rough = Math.abs(hLine[i + 1] - 2 * hLine[i] + hLine[i - 1]) / (ds * ds);
      if (rough > 0.006) v = Math.min(v, 36 - Math.min(rough, 0.05) * 400);
    }
    vmax[i] = v;
  }
  if (stage.hazards) {
    for (const h of stage.hazards) {
      let cap = 0, pre = 0, post = 0;
      if (h.kind === "jump") { cap = 34; pre = 12; post = 20; }
      else if (h.kind === "ford") { cap = 20; pre = 6; post = 10; }
      else if (h.kind === "cattlegrid") { cap = 24; pre = 4; post = 6; }
      else if (h.kind === "bridge") { cap = 30; pre = 4; post = 4; }
      else if (h.kind === "crest") { cap = 40; pre = 8; post = 10; }
      if (!cap) continue;
      const a = Math.max(0, Math.floor((h.s - pre) / ds)), b = Math.min(N - 1, Math.ceil((h.s + post) / ds));
      for (let i = a; i <= b; i++) vmax[i] = Math.min(vmax[i], cap * (0.8 + 0.2 * skill));
    }
  }
  const vprof = new Float64Array(N);
  vprof[N - 1] = vmax[N - 1];
  const brakeG = Math.min(1.0, 0.9) ;
  for (let i = N - 2; i >= 0; i--) {
    const vn = vprof[i + 1];
    const mu = muAt[i] * aMul;
    const lat2 = vn * vn * kabs[i];
    const avail = Math.sqrt(Math.max(0, (mu * G) * (mu * G) - lat2 * lat2));
    const aB = Math.max(0.12 * mu * G, avail) * 0.92 * brakeG;
    const vb = Math.sqrt(vn * vn + 2 * aB * ds);
    vprof[i] = Math.min(vmax[i], vb);
  }

  const dtp = spec.drivetrain;
  const drivenW = dtp === "AWD" ? [true, true, true, true] : dtp === "FWD" ? [true, true, false, false] : [false, false, true, true];

  // ---------- runtime ----------
  const input = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
  const prj = {};
  let mode = 0; // 0 drive, 1 reverse
  let stuckT = 0, revT = 0, offT = 0, cool = 0, lastSteer = 0;

  function lineAt(s, out) {
    s = clamp(s, 0, (N - 1) * ds);
    const f = s / ds, i = Math.min(N - 2, Math.floor(f)), t = f - i;
    out.x = LX[i] + (LX[i + 1] - LX[i]) * t;
    out.z = LZ[i] + (LZ[i + 1] - LZ[i]) * t;
    out.v = vprof[i] + (vprof[i + 1] - vprof[i]) * t;
  }
  const tgt = { x: 0, z: 0, v: 0 }, ahead = { x: 0, z: 0, v: 0 };

  function reset() {
    mode = 0; stuckT = 0; revT = 0; offT = 0; cool = 0; lastSteer = 0;
    input.steer = 0; input.throttle = 0; input.brake = 0; input.handbrake = 0;
  }

  function control(dt) {
    const st = vehicle.state;
    const v = st.speed;
    stage.project(st.x, st.z, st.s, prj);
    const s = prj.s;
    const yaw = st.yaw;
    const fxv = -Math.sin(yaw), fzv = -Math.cos(yaw);
    const rxv = Math.cos(yaw), rzv = -Math.sin(yaw);
    const wi = stage.width[Math.min(N - 1, Math.max(0, Math.round(s / ds)))];
    const off = Math.abs(prj.lat) > wi * 0.5 + 0.5;

    // heading error vs the road tangent (positive = tangent to the left of the car)
    const tdot = prj.tx * fxv + prj.tz * fzv;
    const tcross = prj.tx * rxv + prj.tz * rzv; // + : tangent to the right
    const headErr = Math.atan2(-tcross, tdot);

    // ---------- recovery ----------
    cool -= dt;
    if (mode === 0) {
      const wantMove = true;
      if (Math.abs(v) < 1.2 && st.s > 5 || (Math.abs(v) < 1.2 && st.distance > 20)) stuckT += dt; else stuckT = 0;
      const wrong = Math.abs(headErr) > 1.9 && Math.abs(v) < 6;
      if ((stuckT > 1.6 || wrong) && cool <= 0 && wantMove) {
        mode = 1; revT = 1.3 + (wrong ? 0.6 : 0); stuckT = 0;
      }
    }
    if (mode === 1) {
      revT -= dt;
      let rb = 1;
      for (let i = 0; i < 4; i++) if (drivenW[i] && Math.abs(st.wheels[i].slipRatio) > 0.3 && Math.abs(v) > 0.8) rb = 0.4;
      input.throttle = 0; input.brake = rb; input.handbrake = 0;
      input.steer = clamp(headErr * 1.6, -1, 1) * (Math.abs(headErr) > 1.9 ? -1 : 1) * 0.999;
      if (revT <= 0) { mode = 0; cool = 2.5; }
      return input;
    }

    // ---------- pure pursuit ----------
    const Ld = clamp(5 + (opts.ldk || 0.7) * Math.max(0, v), 6, 50);
    lineAt(s + Ld, tgt);
    const dx = tgt.x - st.x, dz = tgt.z - st.z;
    const fw = dx * fxv + dz * fzv, rt = dx * rxv + dz * rzv;
    const alpha = Math.atan2(rt, Math.max(0.1, fw));
    const dist = Math.max(3, Math.hypot(dx, dz));
    let delta = Math.atan2(2 * spec.wheelbase * Math.sin(alpha), dist);
    // cross-track correction toward the racing line (Stanley term)
    {
      const fi = clamp(s / ds, 0, N - 1.001), i0 = Math.floor(fi);
      const lineL = lat[i0] + (lat[i0 + 1] - lat[i0]) * (fi - i0);
      const e = prj.lat - lineL; // + : car right of the line
      delta -= Math.atan((opts.cte === undefined ? 0 : opts.cte) * e / (Math.abs(v) + 3));
    }
    // yaw-rate damping: the car lags the kinematic steer, which excites a slow weave
    if (v > 6) {
      const yrDes = -v * Math.tan(delta) / spec.wheelbase;
      delta += clamp((st.yawRate - yrDes) * spec.wheelbase / v * (opts.kyaw === undefined ? 1.0 : opts.kyaw), -0.12, 0.12);
    }
    // damp slides: steer toward the velocity direction when the car is rotating past it
    const sl = st.slideAngle;
    if (Math.abs(sl) > 0.1 && v > 4) delta += clamp(sl * 0.8, -0.25, 0.25);
    const maxAng = spec.steeringLockDeg * (Math.PI / 180) * steerFactor(Math.abs(v));
    let sc = clamp(delta / maxAng, -1, 1);
    // light smoothing so the model's analogue path is exercised
    sc = lastSteer + (sc - lastSteer) * Math.min(1, dt * 25);
    lastSteer = sc;
    input.steer = clamp(sc, -0.995, 0.995);

    // ---------- speed ----------
    lineAt(s + Math.max(0, v) * 0.18, ahead);
    let vt = ahead.v;
    // also respect the braking profile a little further out when fast (latency)
    if (off) vt = Math.min(vt, 12);
    const err = vt - v;
    let thr = 0, brk = 0;
    if (err > -0.4) thr = clamp(0.18 + err * 0.45, 0, 1);
    if (err < -0.6) brk = clamp((-err - 0.4) * 0.16, 0, 1);
    if (v < 3 && vt > 3) thr = 1;
    // ABS-style modulation
    if (brk > 0) {
      let minSlip = 0;
      for (let i = 0; i < 4; i++) if (st.wheels[i].slipRatio < minSlip) minSlip = st.wheels[i].slipRatio;
      if (minSlip < -0.3) brk *= 0.35; else if (minSlip < -0.2) brk *= 0.7;
    }
    // friction circle: lateral use leaves less for the engine; tail-slide cuts the throttle
    if (thr > 0 && v > 3) {
      const mu = muAt[Math.min(N - 1, Math.max(0, Math.round(s / ds)))];
      const u = Math.min(1, Math.abs(st.yawRate * v) / (mu * G * 0.95));
      thr = Math.min(thr, Math.max(0.12, 1 - u * u * 1.2));
      const sa = Math.abs(sl);
      if (sa > 0.12) thr *= clamp(1 - (sa - 0.12) * 3.5, 0, 1);
    }
    // traction limiting: keep driven wheels near their peak slip for the surface they are on
    if (thr > 0 && Math.abs(v) > 2.5) {
      let over = 0;
      for (let i = 0; i < 4; i++) {
        if (!drivenW[i]) continue;
        const w = st.wheels[i];
        const pk = SURFACE_INFO[w.surf].peakSlip;
        const o = w.slipRatio - pk * 0.95;
        if (o > over) over = o;
      }
      if (over > 0) thr *= clamp(1 - over * 3.2, 0.3, 1);
    }
    input.throttle = thr; input.brake = brk; input.handbrake = 0;
    return input;
  }

  return { control, reset, input, lineLat: lat, speedProfile: vprof, lineX: LX, lineZ: LZ, skill };
}
