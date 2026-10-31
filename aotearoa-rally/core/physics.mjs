// Rally car simulation (DYNAMICS lane). Pure Node-22 module: no DOM, no THREE. Deterministic, fixed step 1/120.
//
// 6-DOF rigid body (quaternion, world velocity/angular velocity, diagonal body inertia). Four corners with
// spring/damper/bump-stop suspension sampled from stage.heightAt/normalAt/surfaceAt, anti-roll bars, a
// combined-slip tyre (tyre.mjs), a real drivetrain (engine inertia, turbo, clutch, gearbox, diffs), and
// impulse collisions (obstacles, terrain walls, soft boundary walls). Damage lives in damage.mjs.
//
// Body axes (local): +x right, +y up, +z back (car faces -z). Yaw 0 faces world -Z. See CONTRACTS.md.

import { SURFACE_INFO, SURFACE } from "./surfaces.mjs";
import { surfGripTable } from "./cars.mjs";
import { tyreForce, TYRE_GRIP, TYRE_ROLL } from "./tyre.mjs";
import { makeDamageState, createDamage } from "./damage.mjs";

const G = 9.81;
const RHO = 1.2;
const TWO_PI = Math.PI * 2;
const RAD_RPM = 60 / TWO_PI;
const RPM_RAD = TWO_PI / 60;
const ETA = 0.9; // driveline efficiency
const IW = 1.5; // wheel + tyre + brake + shaft rotational inertia (kg m^2)
const L0 = 0.4; // suspension: hub distance from mount at full droop (m)
const POOL = 64;
const MAX_EVENTS = 48;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function curveTable(points, step = 100, max = 12000) {
  const n = Math.floor(max / step) + 1;
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = i * step;
    let v;
    if (r <= points[0][0]) v = points[0][1] * (r / points[0][0]);
    else if (r >= points[points.length - 1][0]) v = points[points.length - 1][1] * Math.max(0, 1 - (r - points[points.length - 1][0]) / 1500);
    else {
      let k = 0;
      while (k < points.length - 2 && r > points[k + 1][0]) k++;
      const a = points[k], b = points[k + 1];
      v = a[1] + ((b[1] - a[1]) * (r - a[0])) / (b[0] - a[0]);
    }
    t[i] = v;
  }
  return { t, step, n };
}
function sampleTable(tb, rpm) {
  if (rpm <= 0) return tb.t[0];
  const f = rpm / tb.step;
  const i = Math.floor(f);
  if (i >= tb.n - 1) return tb.t[tb.n - 1];
  const w = f - i;
  return tb.t[i] + (tb.t[i + 1] - tb.t[i]) * w;
}

/** Speed-sensitive steering lock factor (0.17..1). The bot uses the same curve to map angle -> input. */
export function steerFactor(v) {
  const vv = v / 12;
  const lf = 1 / (1 + 0.55 * vv * vv);
  return lf < 0.17 ? 0.17 : lf;
}

function makeWheelState() {
  return {
    x: 0, y: 0, z: 0, contactX: 0, contactY: 0, contactZ: 0, steer: 0, spin: 0, load: 0,
    slipRatio: 0, slipAngle: 0, grounded: true, compression: 0, susp: 0, surf: 0, skid: 0, temp: 0.2, punctured: false,
  };
}

function makeState() {
  return {
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
    vx: 0, vy: 0, vz: 0, speed: 0, speedKmh: 0, lateralSpeed: 0, yawRate: 0, slideAngle: 0,
    rpm: 0, gear: 1, clutch: 1, boost: 0, throttle: 0, brake: 0, steerAngle: 0,
    airborne: false, onRoad: true, lat: 0, s: 0,
    wheels: [makeWheelState(), makeWheelState(), makeWheelState(), makeWheelState()],
    damage: makeDamageState(),
    events: [],
    flipped: false, collided: 99, distance: 0,
    // additive extras
    gLat: 0, gLong: 0, handbrake: 0, shifting: false, engineTorque: 0, wheelspin: 0, slide: 0, upY: 1, stuck: false, surfaceKey: "gravel",
  };
}

const DYN_SCALARS = [
  "px", "py", "pz", "qw", "qx", "qy", "qz", "vx", "vy", "vz", "wx", "wy", "wz",
  "rpm", "gear", "boost", "thr", "brk", "hb", "steerIn", "steerAng", "analogT", "shiftT", "shiftLock", "cutT", "prevThr",
  "prevUp", "prevDown", "airT", "airMinVy", "flipT", "collided", "distance", "wgCool", "limCool", "impCool", "boCool", "splashCool",
  "needAlign", "hbHold", "lastAx", "lastAz", "lastAy", "hintS", "fresh", "wasAir", "axLP", "holdT", "kick", "kickCool", "pinT", "cnx", "cnz", "cnAge",
];

// Longitudinal load transfer, exaggerated on purpose (see the wheel loop): fast filter, a slow reference that turns a
// lift or brake stab into a transient kick, and a small sustained part so long braking keeps a little rotation.
const LAND_SOAK = 3.5;
// walls (banks, verges): a little bounce and a slippery face so a hit leaves the car free to steer out; a pinned car is helped out
const WALL_E = 0.22, WALL_MUT = 0.08;
const PIN_SPEED = 1.5, PIN_AFTER = 1.0, PIN_THR = 0.25, PIN_PUSH = 8, PIN_SEP = 4;
const FRONT_LOOSE = 1.08;
const LOOSE_SURF = [1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]; // by SURFACE id: gravel, dirt, (tarmac), mud, snow, pumice
const LT_TAU = 0.1, LT_SUS = 0.03, LT_KICK = 24, LT_KCAP = 0.25, LT_SURF = 3;
const SA0 = 0.12, SA1 = 0.3; // throttle feathering starts at a 7 deg body slip (it was 17 deg): a digital throttle cannot hold a power slide
const TA0 = 0.12, TA1 = 0.08; // RWD traction aid: slip ratio where the throttle starts to close, and the band to full cut
const LT_ARM_THR = 0.6, LT_ARM_T = 0.3, LT_FIRE_THR = 0.35, LT_COOL = 0.6, LT_KICK_TAU = 0.3;
const LT_GAIN_FWD = 2.5, LT_GAIN_AWD = 1.6, LT_GAIN_RWD = 5;

export function createVehicle(spec, options = {}) {
  const opts = {
    auto: options.auto !== false,
    tyre: options.tyre || "gravel",
    setup: options.setup || {},
    assist: options.assist === undefined ? 0.35 : options.assist,
    damageScale: options.damageScale === undefined ? 1 : options.damageScale,
  };
  const sgTab = surfGripTable(spec);
  const state = makeState();
  const dmgFx = {};
  const pool = [];
  for (let i = 0; i < POOL; i++) pool.push({ t: "", strength: 0, zone: "", x: 0, z: 0, kind: "", from: 0, to: 0, wheel: 0 });
  let poolI = 0;
  function ev(t) {
    if (state.events.length >= MAX_EVENTS) return null;
    const e = pool[poolI];
    poolI = (poolI + 1) % POOL;
    e.t = t; e.strength = 0; e.zone = ""; e.x = 0; e.z = 0; e.kind = ""; e.from = 0; e.to = 0; e.wheel = 0;
    state.events.push(e);
    return e;
  }
  const dmg = createDamage(spec, state.damage, (type, a) => {
    const e = ev(type);
    if (e && type === "puncture") e.wheel = a;
  });
  const fxD = dmg.fx;

  // ---------- derived constants ----------
  const m = spec.mass;
  const wb = spec.wheelbase;
  const wf = spec.weightFront;
  const aF = wb * (1 - wf); // CG -> front axle
  const bR = wb * wf; // CG -> rear axle
  const cg = spec.cgHeight;
  const Rw = spec.wheelRadius;
  const Lc = spec.length || wb + 1.8;
  const Wc = spec.width || 1.75;
  const Hc = spec.height || 1.4;
  const Ipitch = (m / 12) * (Lc * Lc + Hc * Hc) * 0.85;
  const Iyaw = (m / 12) * (Lc * Lc + Wc * Wc) * 0.85;
  const Iroll = (m / 12) * (Wc * Wc + Hc * Hc) * 0.9;
  const T = spec.suspension.travel;
  const eng = spec.engine;
  const tq = curveTable(eng.torqueCurve);
  const nGears = spec.gears.length;
  const dt0 = 1 / 120;

  // lift-off rotation gain by drivetrain (FWD mild, AWD moderate, RWD strongest); spec.handling.liftRotate overrides
  // front-axle grip on loose ground only (gravel, dirt, mud, snow, pumice): keeps the nose biting for a keyboard driver; fades in with the steering angle so straight-line braking is unchanged; tarmac untouched
  const frontLoose = spec.handling && spec.handling.frontLoose !== undefined ? spec.handling.frontLoose : FRONT_LOOSE;
  const ltGain = spec.handling && spec.handling.liftRotate !== undefined ? spec.handling.liftRotate : (spec.drivetrain === "AWD" ? LT_GAIN_AWD : spec.drivetrain === "FWD" ? LT_GAIN_FWD : LT_GAIN_RWD);

  // box (for obstacle/wall collisions): z positive = back
  const zFront = -(aF + 0.95);
  const zRear = bR + 0.9;
  const boxCz = (zFront + zRear) * 0.5;
  const boxHl = (zRear - zFront) * 0.5;
  const boxHw = Wc * 0.5;
  const reach = Math.sqrt(boxHl * boxHl + boxHw * boxHw) + 1;

  // drivetrain
  const dtype = spec.drivetrain;
  const driven = dtype === "AWD" ? [true, true, true, true] : dtype === "FWD" ? [true, true, false, false] : [false, false, true, true];
  const nDriven = driven.filter(Boolean).length;
  const diffF = spec.diff ? spec.diff.front : 0;
  const diffC = spec.diff ? spec.diff.centre : 0;
  const diffR = spec.diff ? spec.diff.rear : 0;
  const splitF = dtype === "AWD" ? (spec.diff && spec.diff.split !== undefined ? spec.diff.split : 0.4) : dtype === "FWD" ? 1 : 0;

  // wheels
  const W = [];
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    const left = (i & 1) === 0;
    const track = front ? spec.trackFront : spec.trackRear;
    W.push({
      front,
      lx: (left ? -1 : 1) * track * 0.5,
      lz: front ? -aF : bR,
      ly: 0, kS: 0, cD: 0, kArb: 0, xs: 0, loadRef: 0,
      omega: 0, xc: 0, xcPrev: 0, rate: 0, grounded: false, fz: 0,
      cx: 0, cy: 0, cz: 0, nx: 0, ny: 1, nz: 0, mx: 0, my: 0, mz: 0, hx: 0, hz: 0,
      surf: 0, steer: 0, tq: 0, brake: 0, skidS: 0, fx: 0, fy: 0, fxTyre: 0, dFx: 0, rollc: 0, splashed: false,
    });
  }

  // setup-dependent values (recomputed by configure())
  let gearScale = 1, stiffScale = 1, brakeBias = spec.brakeBias, lockScale = 1, tyreKind = opts.tyre;
  let ratios = [];
  let tyreGrip = TYRE_GRIP.gravel;
  let tyreRoll = 1;
  function configure(o = {}) {
    if (o.auto !== undefined) opts.auto = !!o.auto;
    if (o.assist !== undefined) opts.assist = o.assist;
    if (o.tyre) opts.tyre = o.tyre;
    if (o.damageScale !== undefined) opts.damageScale = o.damageScale;
    dmg.setScale(opts.damageScale);
    if (o.setup) opts.setup = { ...opts.setup, ...o.setup };
    const su = opts.setup;
    gearScale = su.gearRatioScale || 1;
    stiffScale = su.suspensionStiffness || 1;
    brakeBias = su.brakeBias !== undefined ? su.brakeBias : spec.brakeBias;
    lockScale = su.steeringLock || 1;
    tyreKind = TYRE_GRIP[opts.tyre] ? opts.tyre : "gravel";
    tyreGrip = TYRE_GRIP[tyreKind];
    tyreRoll = TYRE_ROLL[tyreKind];
    ratios = spec.gears.map((g) => g * spec.finalDrive * gearScale);
    const k = spec.suspension.spring * stiffScale;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const share = w.front ? wf : 1 - wf; // axle weight share
      w.kS = k * 2 * share;
      w.cD = spec.suspension.damper * 2 * share * Math.sqrt(stiffScale);
      w.kArb = (w.front ? spec.suspension.antiRollFront : spec.suspension.antiRollRear) * stiffScale;
      w.loadRef = m * G * share * 0.5;
      w.xs = w.loadRef / w.kS;
      w.ly = L0 - w.xs + Rw - cg;
    }
  }
  configure();

  // ---------- dynamic state ----------
  const D = {};
  for (const k of DYN_SCALARS) D[k] = 0;
  D.qw = 1; D.gear = 1; D.collided = 99; D.fresh = 1;
  const Wom = [0, 0, 0, 0];
  const Wxc = [0, 0, 0, 0];
  const Wspin = [0, 0, 0, 0];
  const Wtemp = [0.2, 0.2, 0.2, 0.2];

  // axes scratch
  let rx = 1, ry = 0, rz = 0, ux = 0, uy = 1, uz = 0, kx = 0, ky = 0, kz = 1;
  function axes() {
    const w = D.qw, x = D.qx, y = D.qy, z = D.qz;
    rx = 1 - 2 * (y * y + z * z); ry = 2 * (x * y + w * z); rz = 2 * (x * z - w * y);
    ux = 2 * (x * y - w * z); uy = 1 - 2 * (x * x + z * z); uz = 2 * (y * z + w * x);
    kx = 2 * (x * z + w * y); ky = 2 * (y * z - w * x); kz = 1 - 2 * (x * x + y * y);
  }
  function qFromEuler(yaw, pitch, rollz) {
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
    const cx = Math.cos(pitch / 2), sx = Math.sin(pitch / 2);
    const cz = Math.cos(rollz / 2), sz = Math.sin(rollz / 2);
    // qy * qx
    const aw = cy * cx, ax = cy * sx, ay = sy * cx, az = -sy * sx;
    // (a) * qz  with qz = (cz,0,0,sz)
    D.qw = aw * cz - az * sz;
    D.qx = ax * cz + ay * sz;
    D.qy = ay * cz - ax * sz;
    D.qz = az * cz + aw * sz;
  }

  // collision / scratch
  const obsBuf = [];
  const projOut = {};
  const bndOut = { left: 99, right: 99 };
  const nrmOut = { x: 0, y: 1, z: 0 };
  const sampleOut = {};

  // ---------- engine helpers ----------
  const idle = eng.idleRpm;
  const redline = eng.redline;
  const fricK = eng.friction || 1;
  function engineTorque(rpm, thr, boost) {
    const base = sampleTable(tq, rpm);
    const gain = eng.turbo ? 1 + eng.turbo.boostTorqueGain * boost : 1;
    const fric = fricK * (16 + 0.0085 * rpm);
    return base * gain * thr * fxD.powerMul - fric * (1 - thr);
  }

  // ---------- collisions ----------
  let impDiss = 0;
  // soft props (signs, posts, bales) are knocked once per pass: obstacle -> time it was hit
  const softHit = new Map();
  let softClock = 0;
  /** 3-D impulse at world offset r from CG along unit normal n (pointing out of the obstacle into the car). */
  function impulse(nx, ny, nz, rxw, ryw, rzw, e, muT, scale) {
    // velocity of contact point
    const cvx = D.vx + (D.wy * rzw - D.wz * ryw);
    const cvy = D.vy + (D.wz * rxw - D.wx * rzw);
    const cvz = D.vz + (D.wx * ryw - D.wy * rxw);
    const vn = cvx * nx + cvy * ny + cvz * nz;
    if (vn >= 0) return 0;
    // r x n
    const cxn = ryw * nz - rzw * ny, cyn = rzw * nx - rxw * nz, czn = rxw * ny - ryw * nx;
    const cbx = cxn * rx + cyn * ry + czn * rz;
    const cby = cxn * ux + cyn * uy + czn * uz;
    const cbz = cxn * kx + cyn * ky + czn * kz;
    // rotational response is deliberately damped (x2.2 effective inertia): arcade-friendly, no wild spins
    const invM = 1 / m + (cbx * cbx / Ipitch + cby * cby / Iyaw + cbz * cbz / Iroll) * 0.45;
    let J = (-(1 + e) * vn) / invM;
    J *= scale;
    const dvMax = 45;
    if (J / m > dvMax) J = m * dvMax;
    D.vx += (J * nx) / m; D.vy += (J * ny) / m; D.vz += (J * nz) / m;
    let dwb_x = (J * cbx * 0.45) / Ipitch, dwb_y = (J * cby * 0.45) / Iyaw, dwb_z = (J * cbz * 0.45) / Iroll;
    if (dwb_y > 2.2) dwb_y = 2.2; else if (dwb_y < -2.2) dwb_y = -2.2;
    if (dwb_x > 1.5) dwb_x = 1.5; else if (dwb_x < -1.5) dwb_x = -1.5;
    if (dwb_z > 1.5) dwb_z = 1.5; else if (dwb_z < -1.5) dwb_z = -1.5;
    D.wx += rx * dwb_x + ux * dwb_y + kx * dwb_z;
    D.wy += ry * dwb_x + uy * dwb_y + ky * dwb_z;
    D.wz += rz * dwb_x + uz * dwb_y + kz * dwb_z;
    // tangential friction
    let tvx = cvx - vn * nx, tvy = cvy - vn * ny, tvz = cvz - vn * nz;
    const tl = Math.sqrt(tvx * tvx + tvy * tvy + tvz * tvz);
    if (tl > 1e-4 && muT > 0) {
      const jt = Math.min(muT * J, m * tl * 0.5);
      const f = jt / (m * tl);
      D.vx -= tvx * f; D.vy -= tvy * f; D.vz -= tvz * f;
    }
    impDiss += 0.5 * J * -vn * (1 - e);
    return -vn;
  }

  function zoneOf(lx, lz) {
    const au = Math.abs(lx) / boxHw;
    const aw = Math.abs(lz - boxCz) / boxHl;
    if (aw > au) return lz < boxCz ? "front" : "rear";
    return lx < 0 ? "left" : "right";
  }

  /** Impact bookkeeping after a collision impulse. closing = approach speed (m/s). */
  function registerImpact(closing, cwx, cwz, kind, zoneForce) {
    const rwx = cwx - D.px, rwz = cwz - D.pz;
    const lx = rwx * rx + rwz * rz, lz = rwx * kx + rwz * kz;
    const zone = zoneForce || zoneOf(lx, lz);
    const strength = clamp01(closing / 22);
    const energy = impDiss;
    impDiss = 0;
    if (energy > 0) dmg.impact(zone, energy, lx, lz);
    if (strength > 0.04 && D.impCool <= 0) {
      const e = ev("impact");
      if (e) { e.strength = strength; e.zone = zone; e.x = cwx; e.z = cwz; e.kind = kind; }
      D.impCool = 0.12;
      state.collided = 0; D.collided = 0;
    }
  }

  function obstaclePass(stage, spdH) {
    if (!stage.obstaclesNear) return;
    // vertical extent of the body
    const yBot = D.py - cg + 0.12, yTop = D.py - cg + Hc;
    let fx2 = -kx, fz2 = -kz;
    const fl = Math.sqrt(fx2 * fx2 + fz2 * fz2) || 1;
    fx2 /= fl; fz2 /= fl;
    const rx2 = -fz2, rz2 = fx2;
    const cxw = D.px - fx2 * boxCz, czw = D.pz - fz2 * boxCz; // box centre (back is +z local => minus forward)
    for (let oi = 0; oi < obsBuf.length; oi++) {
      const o = obsBuf[oi];
      if (o.y1 !== undefined && o.y0 !== undefined && (yBot > o.y1 || yTop < o.y0)) continue;
      const dx = o.x - cxw, dz = o.z - czw;
      const u = dx * rx2 + dz * rz2;
      const w = dx * fx2 + dz * fz2;
      const cu = clamp(u, -boxHw, boxHw), cw = clamp(w, -boxHl, boxHl);
      const du = u - cu, dw = w - cw;
      const d2 = du * du + dw * dw;
      if (d2 >= o.r * o.r) continue;
      let nu, nw, pen, cuu = cu, cww = cw;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nu = -du / d; nw = -dw / d; // from obstacle toward car (in box coords)
        pen = o.r - d;
      } else {
        const pu = boxHw - Math.abs(u), pw = boxHl - Math.abs(w);
        if (pu < pw) { nu = u > 0 ? -1 : 1; nw = 0; pen = pu + o.r; cuu = u > 0 ? boxHw : -boxHw; cww = w; }
        else { nu = 0; nw = w > 0 ? -1 : 1; pen = pw + o.r; cww = w > 0 ? boxHl : -boxHl; cuu = u; }
      }
      const hard0 = o.hardness === undefined ? 0.6 : o.hardness;
      if (hard0 < 0.6) {
        // a soft prop is struck once: it gives way and the car rolls past instead of being pinned and hit 20 times
        const th = softHit.get(o);
        if (th !== undefined && softClock - th < 0.8) continue;
        softHit.set(o, softClock);
        if (softHit.size > 64) for (const [k, t] of softHit) if (softClock - t > 0.8) softHit.delete(k);
      }
      const nxw = nu * rx2 + nw * fx2, nzw = nu * rz2 + nw * fz2;
      const cwx = cxw + cuu * rx2 + cww * fx2, cwz = czw + cuu * rz2 + cww * fz2;
      const hard = o.hardness === undefined ? 0.6 : o.hardness;
      const scale = hard >= 0.6 ? 1 : Math.max(0.05, hard * 1.1); // signs, posts, bales, tyre stacks give way: they shed a fraction of the closing speed
      const e = 0.01 + 0.1 * hard
      const corr = (0.15 + 0.8 * scale) * pen;
      const cap = corr > 0.3 ? 0.3 : corr;
      D.px += nxw * cap; D.pz += nzw * cap;
      const closing = impulse(nxw, 0, nzw, cwx - D.px, (D.py - cg * 0.4 + 0.3) - D.py, cwz - D.pz, e, 0.25 + 0.2 * hard, scale);
      if (hard >= 0.6) { D.cnx = nxw; D.cnz = nzw; D.cnAge = 0; }
      if (closing > 0.15) registerImpact(closing, cwx, cwz, o.kind || "obstacle", null);
      else impDiss = 0;
    }
  }

  // body contact points (terrain): local x,y,z (z back)
  const BP = [
    [-boxHw * 0.9, -cg + 0.2, zFront], [boxHw * 0.9, -cg + 0.2, zFront], [0, -cg + 0.2, zFront],
    [-boxHw * 0.9, -cg + 0.2, zRear], [boxHw * 0.9, -cg + 0.2, zRear], [0, -cg + 0.2, zRear],
    [-boxHw, -cg + 0.3, 0], [boxHw, -cg + 0.3, 0], [0, -cg + 0.1, (zFront + zRear) * 0.25],
    // roof corners
    [-boxHw * 0.8, -cg + Hc - 0.05, -0.5], [boxHw * 0.8, -cg + Hc - 0.05, -0.5], [-boxHw * 0.8, -cg + Hc - 0.05, 0.8], [boxHw * 0.8, -cg + Hc - 0.05, 0.8],
  ];
  const NB_LOW = 9;

  function terrainPass(stage, dt) {
    const nPts = uy < 0.65 ? BP.length : NB_LOW;
    let fxs = 0, fys = 0, fzs = 0, txs = 0, tys = 0, tzs = 0;
    for (let i = 0; i < nPts; i++) {
      const b = BP[i];
      const wx = D.px + rx * b[0] + ux * b[1] + kx * b[2];
      const wy = D.py + ry * b[0] + uy * b[1] + ky * b[2];
      const wz = D.pz + rz * b[0] + uz * b[1] + kz * b[2];
      const h = stage.heightAt(wx, wz);
      const pen = h - wy;
      if (pen <= 0) continue;
      const n = stage.normalAt(wx, wz, nrmOut);
      const rxw = wx - D.px, ryw = wy - D.py, rzw = wz - D.pz;
      // velocity at the point
      const cvx = D.vx + (D.wy * rzw - D.wz * ryw);
      const cvy = D.vy + (D.wz * rxw - D.wx * rzw);
      const cvz = D.vz + (D.wx * ryw - D.wy * rxw);
      if (n.y < 0.77 || pen > 0.5) {
        // wall-like: impulse + positional correction
        let nx = n.x, ny = n.y, nz = n.z;
        if (pen > 0.5 && n.y >= 0.77) { /* deep burial: push up */ }
        const corr = Math.min(0.35, pen * 0.8);
        D.px += nx * corr * 0.6; D.py += ny * corr * 0.6; D.pz += nz * corr * 0.6;
        const closing = impulse(nx, ny, nz, rxw, ryw, rzw, WALL_E, WALL_MUT, 1);
        { const hl = Math.hypot(nx, nz); if (hl > 0.2) { D.cnx = nx / hl; D.cnz = nz / hl; D.cnAge = 0; } }
        // a bank soaks the car's energy, it is not a ramp: what the face deflects upward is mostly lost, so a hit at speed
        // scrubs along and up a little instead of launching off the top
        if (D.vy > 2.5 && ny < 0.77) D.vy = 2.5 + (D.vy - 2.5) * 0.25;
        if (closing > 0.2) registerImpact(closing, wx, wz, "terrain", null);
        else impDiss = 0;
      } else {
        // floor-like: spring/damper with scrape friction
        const vn = cvx * n.x + cvy * n.y + cvz * n.z;
        let fn = 70000 * pen - 2500 * vn;
        if (fn < 0) fn = 0;
        if (fn > 30000) fn = 30000;
        let tvx = cvx - vn * n.x, tvy = cvy - vn * n.y, tvz = cvz - vn * n.z;
        const tl = Math.sqrt(tvx * tvx + tvy * tvy + tvz * tvz);
        let ff = 0.45 * fn;
        if (tl < 1e-3) ff = 0; else ff = Math.min(ff, (m * tl) / (dt * 6));
        const fx = n.x * fn - (tvx / (tl + 1e-9)) * ff;
        const fy = n.y * fn - (tvy / (tl + 1e-9)) * ff;
        const fz = n.z * fn - (tvz / (tl + 1e-9)) * ff;
        fxs += fx; fys += fy; fzs += fz;
        txs += ryw * fz - rzw * fy; tys += rzw * fx - rxw * fz; tzs += rxw * fy - ryw * fx;
        if (i < NB_LOW && vn < -3.5 && D.boCool <= 0 && ((i === 8) || (i < 6))) {
          const e = ev("impact");
          if (e) { e.strength = clamp01(-vn / 16); e.zone = "under"; e.x = wx; e.z = wz; e.kind = "terrain"; }
          dmg.impact("under", 0.5 * m * vn * vn * (uy > 0.8 ? 0.05 : 0.12), b[0], b[2]); // a flat landing that bottoms the car out is cheap; a nose or side landing is not
          D.boCool = 0.25; D.collided = 0;
        }
        if (tl > 4 && fn > 3000) {
          dmg.scrape(i < 6 && b[2] < 0 ? "front" : "rear", 0.0000035 * tl * fn * dt * (uy > 0.8 ? 0.2 : 1)); // an upright car skimming its sump over a crest or landing is a scuff, not a wreck
        }
      }
    }
    if (fxs !== 0 || fys !== 0 || fzs !== 0) {
      D.vx += (fxs / m) * dt; D.vy += (fys / m) * dt; D.vz += (fzs / m) * dt;
      // torque to body frame
      const tbx = txs * rx + tys * ry + tzs * rz, tby = txs * ux + tys * uy + tzs * uz, tbz = txs * kx + tys * ky + tzs * kz;
      const ax = (tbx / Ipitch) * dt, ay = (tby / Iyaw) * dt, az = (tbz / Iroll) * dt;
      D.wx += rx * ax + ux * ay + kx * az; D.wy += ry * ax + uy * ay + ky * az; D.wz += rz * ax + uz * ay + kz * az;
    }
  }

  function wallPass(stage) {
    // soft boundary walls from the stage
    if (!stage.boundaryAt || !stage.project) return;
    const pr = projOut;
    const b = stage.boundaryAt(pr.s, bndOut);
    const lat = pr.lat;
    const rnx = -pr.tz, rnz = pr.tx; // right normal
    let fx2 = -kx, fz2 = -kz;
    const fl = Math.sqrt(fx2 * fx2 + fz2 * fz2) || 1;
    fx2 /= fl; fz2 /= fl;
    const rx2 = -fz2, rz2 = fx2;
    // four corners
    for (let c = 0; c < 4; c++) {
      const cu = (c & 1) === 0 ? -boxHw : boxHw;
      const cwl = c < 2 ? zFront : zRear; // local z (back +)
      const ox = rx2 * cu - fx2 * cwl, oz = rz2 * cu - fz2 * cwl;
      const cl = lat + ox * rnx + oz * rnz;
      let pen = 0, sgn = 0;
      if (cl > b.right) { pen = cl - b.right; sgn = -1; }
      else if (cl < -b.left) { pen = -b.left - cl; sgn = 1; }
      if (pen <= 0) continue;
      const nxw = sgn * rnx, nzw = sgn * rnz;
      const cwx = D.px + ox, cwz = D.pz + oz;
      const corr = Math.min(0.12, pen * 0.35);
      D.px += nxw * corr; D.pz += nzw * corr;
      const closing = impulse(nxw, 0, nzw, ox, -cg * 0.4 + 0.3, oz, 0.1, 0.14, 1);
      if (closing > 0.15) registerImpact(closing, cwx, cwz, "terrain", null);
      else {
        // scraping along: a little wear
        const wearZone = zoneOf(ox * rx + oz * rz, ox * kx + oz * kz);
        if (impDiss > 0) impDiss = 0;
        const sp = Math.sqrt(D.vx * D.vx + D.vz * D.vz);
        if (sp > 6) dmg.scrape(wearZone === "front" || wearZone === "rear" ? wearZone : wearZone, 0.00002 * sp * dt0);
      }
    }
  }

  // ---------- gearbox ----------
  function ratioOf(g) {
    if (g > 0) return ratios[g - 1];
    if (g < 0) return -spec.reverse * spec.finalDrive * gearScale;
    return 0;
  }
  function doShift(to) {
    const e = ev("shift");
    if (e) { e.from = D.gear; e.to = to; }
    D.gear = to;
    D.shiftT = 0.14 + fxD.shiftExtra;
    D.shiftLock = 0.45;
  }

  // ---------- input handling ----------
  let thrEff = 0, brkEff = 0, hbEff = 0;
  function processInput(dt, input, fs, stage) {
    const inThr = clamp01(input.throttle || 0), inBrk = clamp01(input.brake || 0), inHb = clamp01(input.handbrake || 0);
    // gear logic
    const upEdge = !!input.gearUp && !D.prevUp, dnEdge = !!input.gearDown && !D.prevDown;
    D.prevUp = input.gearUp ? 1 : 0; D.prevDown = input.gearDown ? 1 : 0;
    let tThr = inThr, tBrk = inBrk;
    if (opts.auto) {
      if (D.gear <= 0) { if (D.gear === 0) doShift(1); }
      if (D.gear === -1) {
        tThr = inBrk; tBrk = inThr;
        if (inThr > 0.1 && inBrk < 0.1 && fs > -1.5 && D.shiftT <= 0) doShift(1);
      } else if (inBrk > 0.1 && inThr < 0.1 && fs < 1.0 && D.gear === 1 && D.shiftT <= 0) {
        doShift(-1);
        tThr = inBrk; tBrk = inThr;
      }
    } else {
      if (upEdge) { if (D.gear < nGears) doShift(D.gear + 1); }
      else if (dnEdge) { if (D.gear > -1) doShift(D.gear - 1); }
    }
    // pedal ramps (digital friendly)
    D.thr += clamp(tThr - D.thr, -12 * dt, 6 * dt);
    D.brk += clamp(tBrk - D.brk, -14 * dt, 10 * dt);
    D.hb += clamp(inHb - D.hb, -10 * dt, 14 * dt);
    if (tThr === 0 && D.thr < 0.003) D.thr = 0;
    thrEff = D.thr; brkEff = D.brk; hbEff = D.hb;
    if (D.pinT > PIN_AFTER && thrEff > PIN_THR) thrEff = PIN_THR;
    // traction / stability assist: feather the throttle when driven wheels spin or the tail steps out
    if (opts.assist > 0 && thrEff > 0.05 && D.gear !== 0) {
      // mean slip of the driven wheels (not the worst one): a single unloaded or damaged wheel stuck spinning after
      // a hit must not hold the whole throttle closed ("crawl at 20 km/h in 1st on full throttle")
      let ms = 0, nd = 0;
      for (let i = 0; i < 4; i++) if (driven[i]) { ms += state.wheels[i].slipRatio; nd++; }
      ms = nd ? ms / nd : 0;
      let cut = clamp((ms - 0.16) / 0.35, 0, 1);
      // slide angle is meaningless at crawl speed (a car spun round by an impact): ease the cut in with speed
      const sa = Math.abs(state.slideAngle);
      if (sa > SA0) cut = Math.max(cut, clamp((sa - SA0) / SA1, 0, 1) * 0.8 * clamp((state.speed - 4) / 6, 0, 1));
      cut *= Math.min(0.85, opts.assist * 2.2);
      // keyboard traction aid: a digital pedal is all-or-nothing, so a rear-drive car sits at 40% slip on full throttle.
      // Close the throttle on the driven-wheel slip ratio (a hard, narrow band) so it settles near the peak of the tyre curve
      if (dtype === "RWD") cut = Math.max(cut, clamp((ms - TA0) / TA1, 0, 1) * 0.95 * Math.min(1, opts.assist / 0.35) * clamp((state.speed - 2) / 3, 0, 1)); // slip ratio means nothing from a standstill: launch stays free
      thrEff *= 1 - cut;
    }
  }

  function autoShift(dt, rpmKin, ratioNow) {
    if (!opts.auto || D.shiftT > 0 || D.shiftLock > 0) return;
    const g = D.gear;
    if (g < 1) return;
    const thr = thrEff;
    const upRpm = redline * (0.86 + 0.09 * thr);
    if (g < nGears && rpmKin > upRpm) {
      const nextRpm = rpmKin * (ratios[g] / ratios[g - 1]);
      if (nextRpm > idle + 0.28 * (redline - idle)) { doShift(g + 1); return; }
    }
    const downBase = brkEff > 0.5 ? 0.46 : thr > 0.85 ? 0.42 : 0.3 + 0.1 * thr;
    if (g > 1 && rpmKin < redline * downBase) {
      const nextRpm = rpmKin * (ratios[g - 2] / ratios[g - 1]);
      if (nextRpm < redline * 0.88) doShift(g - 1);
    }
  }

  // ---------- reset / placement ----------
  function placeAt(pose, speed, stage) {
    const yaw = pose.yaw || 0;
    let pitch = 0, rollA = 0, gy = pose.y;
    if (stage) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      // wheel ground heights
      let hF = 0, hR = 0, hL = 0, hRt = 0;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        // local (x right, z back) -> world: right = (c, -s), back = (s, c)
        const wx = pose.x + c * w.lx + s * w.lz;
        const wz = pose.z - s * w.lx + c * w.lz;
        const h = stage.heightAt(wx, wz);
        if (w.front) hF += h * 0.5; else hR += h * 0.5;
        if ((i & 1) === 0) hL += h * 0.5; else hRt += h * 0.5;
      }
      pitch = Math.atan2(hF - hR, wb);
      rollA = -Math.atan2(hRt - hL, (spec.trackFront + spec.trackRear) * 0.5);
      gy = (hF + hR) * 0.5;
    }
    qFromEuler(yaw, pitch, -rollA);
    axes();
    D.px = pose.x; D.pz = pose.z; D.py = gy + cg + (stage ? 0.02 : 0);
    const fx2 = -Math.sin(yaw), fz2 = -Math.cos(yaw);
    D.vx = fx2 * speed; D.vz = fz2 * speed; D.vy = 0;
    D.wx = D.wy = D.wz = 0;
    for (let i = 0; i < 4; i++) {
      W[i].omega = speed / Rw; W[i].xc = W[i].xs; W[i].xcPrev = W[i].xs; W[i].rate = 0;
      Wspin[i] = 0; Wtemp[i] = 0.2;
    }
    D.thr = 0; D.brk = 0; D.hb = 0; D.steerIn = 0; D.steerAng = 0; D.analogT = 0; D.shiftT = 0; D.shiftLock = 0; D.cutT = 0;
    D.boost = 0; D.prevThr = 0; D.airT = 0; D.airMinVy = 0; D.flipT = 0; D.wgCool = 0; D.limCool = 0; D.impCool = 0; D.boCool = 0;
    D.pinT = 0; D.cnx = 0; D.cnz = 0; D.cnAge = 9; D.axLP = 0; D.holdT = 0; D.kick = 0; D.kickCool = 0; D.splashCool = 0; D.wasAir = 0; D.hintS = pose.hintS || 0; softHit.clear();
    D.gear = 1;
    if (opts.auto) {
      let g = 1;
      const wr = Math.abs(speed) / Rw;
      while (g < nGears && wr * ratios[g - 1] * RAD_RPM > redline * 0.82) g++;
      D.gear = g;
    }
    D.rpm = Math.max(idle, Math.abs(speed) / Rw * Math.abs(ratioOf(D.gear)) * RAD_RPM);
    D.fresh = stage ? 0 : 1;
    D.collided = 99;
    state.collided = 99;
    state.flipped = false;
    state.events.length = 0;
    wasGrounded = true;
    syncState(null, 0);
  }

  let wasGrounded = true;

  // ---------- state sync ----------
  function syncState(stage, dt) {
    axes();
    const s = state;
    s.x = D.px; s.y = D.py; s.z = D.pz;
    // Euler YXZ
    const by = ky;
    const sp = clamp(-by, -1, 1);
    s.pitch = Math.asin(sp);
    if (Math.abs(by) < 0.9999999) {
      s.yaw = Math.atan2(kx, kz);
      s.roll = -Math.atan2(ry, uy);
    } else {
      s.yaw = Math.atan2(-rz, rx);
      s.roll = 0;
    }
    s.vx = D.vx; s.vy = D.vy; s.vz = D.vz;
    const fx2 = -kx, fz2 = -kz;
    const fl = Math.sqrt(fx2 * fx2 + fz2 * fz2) || 1;
    const fnx = fx2 / fl, fnz = fz2 / fl;
    s.speed = D.vx * fnx + D.vz * fnz;
    s.speedKmh = s.speed * 3.6;
    s.lateralSpeed = D.vx * -fnz + D.vz * fnx; // right axis (-fz, fx)
    s.yawRate = D.wy;
    const spd = Math.sqrt(D.vx * D.vx + D.vz * D.vz);
    s.slideAngle = spd > 1.5 ? Math.atan2(s.lateralSpeed, Math.abs(s.speed) + 0.001) * (s.speed >= 0 ? 1 : -1) : 0;
    s.rpm = D.rpm; s.gear = D.gear; s.boost = D.boost;
    s.throttle = D.thr; s.brake = D.brk; s.handbrake = D.hb; s.steerAngle = D.steerAng;
    s.clutch = D.shiftT > 0 ? 0 : (D.clutchSlip ? 0.5 : 1);
    s.shifting = D.shiftT > 0;
    s.upY = uy;
    s.stuck = D.pinT > PIN_AFTER;
    s.distance = D.distance;
    s.collided = D.collided;
    for (let i = 0; i < 4; i++) {
      const w = W[i], ws = s.wheels[i];
      ws.spin = Wspin[i];
      ws.steer = w.steer;
      ws.load = w.fz;
      ws.grounded = w.grounded;
      ws.compression = clamp01(w.xc / T);
      ws.susp = w.xc;
      ws.surf = w.surf;
      ws.punctured = fxD.punctured[i];
      ws.temp = Wtemp[i];
      const hx = w.mx - ux * (L0 - w.xc), hy = w.my - uy * (L0 - w.xc), hz = w.mz - uz * (L0 - w.xc);
      ws.x = hx; ws.y = hy; ws.z = hz;
      ws.contactX = w.cx; ws.contactY = w.cy; ws.contactZ = w.cz;
    }
  }

  // ---------- main step ----------
  function step(dt, input, stage) {
    if (D.fresh) { placeAt({ x: D.px, y: D.py - cg, z: D.pz, yaw: state.yaw }, Math.hypot(D.vx, D.vz), stage); D.fresh = 0; }
    const s = state;
    axes();
    const fx2 = -kx, fz2 = -kz;
    const fl = Math.sqrt(fx2 * fx2 + fz2 * fz2) || 1;
    const fnx = fx2 / fl, fnz = fz2 / fl;
    const rnx = -fnz, rnz = fnx;
    const fs = D.vx * fnx + D.vz * fnz; // forward speed
    const ls = D.vx * rnx + D.vz * rnz;
    const spd = Math.sqrt(D.vx * D.vx + D.vz * D.vz);

    D.impCool -= dt; D.boCool -= dt; D.wgCool -= dt; D.limCool -= dt; D.splashCool -= dt; D.shiftLock -= dt; D.cutT -= dt;
    if (D.shiftT > 0) D.shiftT -= dt;
    D.collided += dt; if (D.collided > 99) D.collided = 99;
    softClock += dt;

    // low-passed longitudinal tyre force per mass (drive, engine braking, brakes; not cornering scrub) feeding the
    // tyre-load transfer below, so a lift or a brake stab shifts weight forward and the tail lets go
    {
      const fxSum = W[0].fx + W[1].fx + W[2].fx + W[3].fx;
      D.axLP += (fxSum / m - D.axLP) * Math.min(1, dt / LT_TAU);
      // One-shot lift-off kick: only a genuine corner-entry lift fires it (throttle was held high for a while, the wheel is
      // turned, the last kick is over). A digital throttle chattering on and off never re-arms it.
      D.kickCool -= dt;
      D.kick *= Math.exp(-dt / LT_KICK_TAU);
      if (D.thr > LT_ARM_THR) D.holdT += dt;
      else if (D.thr < LT_FIRE_THR) {
        if (D.holdT > LT_ARM_T && D.kickCool <= 0 && spd > 8) {
          D.kick = clamp((Math.abs(D.steerIn) - 0.05) / 0.15, 0, 1);
          if (D.kick > 0) D.kickCool = LT_COOL;
        }
        D.holdT = 0;
      }
    }

    processInput(dt, input, fs, stage);

    // ----- steering -----
    {
      const target = clamp(input.steer || 0, -1, 1);
      const ta = Math.abs(target);
      if (ta > 0.02 && ta < 0.98) D.analogT = 1.0; else D.analogT = Math.max(0, D.analogT - dt);
      if (D.analogT > 0) {
        D.steerIn += (target - D.steerIn) * Math.min(1, dt * 30);
      } else {
        let rate;
        if (target === 0) rate = 5.5;
        else if (D.steerIn * target < 0) rate = 8;
        else rate = 2.6;
        const dd = target - D.steerIn;
        D.steerIn += clamp(dd, -rate * dt, rate * dt);
      }
      const lock = spec.steeringLockDeg * (Math.PI / 180) * lockScale * fxD.lockMul;
      const lf = steerFactor(Math.abs(fs));
      let delta = D.steerIn * lock * lf + fxD.pull;
      // self-aligning torque (caster): released wheels turn toward the direction the front axle is moving
      if (spd > 3) {
        const vyF = ls - D.wy * aF;
        const dFree = Math.atan2(vyF, Math.abs(fs) + 1.0) * (fs >= 0 ? 1 : 0);
        const hold = clamp(1 - 2.5 * Math.abs(D.steerIn), 0, 1);
        const sb = Math.abs(Math.atan2(ls, Math.abs(fs) + 0.5));
        const big = clamp((sb - 0.1) / 0.2, 0, 1); // only a real slide wakes the caster up
        delta += 0.8 * hold * hold * big * (clamp(dFree, -lock, lock) - delta);
      }
      // stability assist (ESC-like): counter-steers a developing slide and stops the driver winding on more
      // steering once the yaw rate passes what the surface can sustain. Strength follows opts.assist (0..1)
      // and speed; a held handbrake mostly switches it off so deliberate slides stay possible.
      if (opts.assist > 0 && spd > 4) {
        const E = Math.min(1, opts.assist * 3.0) * clamp((spd - 6) / 10, 0, 1) * (hbEff > 0.2 ? 0.25 : 1);
        const beta = Math.atan2(ls, Math.abs(fs) + 0.5) * (fs >= 0 ? 1 : -1);
        const ab = Math.abs(beta);
        if (ab > 0.08 && fs >= 0) {
          const k = clamp((ab - 0.08) / 0.2, 0, 1);
          delta += E * 0.75 * clamp(beta, -0.55, 0.55) * k;
        }
        // yaw-rate governor: sustainable rate ~ mu g / v
        let muE = 0;
        for (let i = 0; i < 4; i++) muE += SURFACE_INFO[W[i].surf].mu;
        const rMax = (0.35 + 0.65 * (muE * 0.25)) * 1.05 * G / Math.max(spd, 8);
        const ar = Math.abs(D.wy);
        if (ar > rMax && delta * D.wy < 0) delta *= 1 - clamp((ar - rMax) / (0.3 * rMax), 0, 1) * E;
      }
      const maxD = lock * 1.5;
      delta = clamp(delta, -maxD, maxD);
      D.steerAng += clamp(delta - D.steerAng, -4.5 * dt, 4.5 * dt);
    }
    const cd = Math.cos(D.steerAng), sd = Math.sin(D.steerAng);

    // ----- ground sampling and suspension (pass 1) -----
    let groundedCount = 0;
    const hasStage = !!stage;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const mx = D.px + rx * w.lx + ux * w.ly + kx * w.lz;
      const my = D.py + ry * w.lx + uy * w.ly + ky * w.lz;
      const mz = D.pz + rz * w.lx + uz * w.ly + kz * w.lz;
      w.mx = mx; w.my = my; w.mz = mz;
      const hh = L0 - w.xcPrev;
      const hx = mx - ux * hh, hz = mz - uz * hh;
      w.hx = hx; w.hz = hz;
      const gy = stage.heightAt(hx, hz);
      const n = stage.normalAt(hx, hz, nrmOut);
      let nx = n.x, ny = n.y, nz = n.z;
      w.nx = nx; w.ny = ny; w.nz = nz;
      w.cx = hx; w.cy = gy; w.cz = hz;
      const dn = (mx - hx) * nx + (my - gy) * ny + (mz - hz) * nz;
      let un = ux * nx + uy * ny + uz * nz;
      if (un < 0.35) un = 0.35;
      const dAxis = dn / un;
      let xc = L0 - (dAxis - Rw);
      if (xc > T + 0.12) xc = T + 0.12;
      w.grounded = xc > 0;
      if (xc < 0) xc = 0;
      w.xc = xc;
      if (w.grounded) groundedCount++;
      const sf = hasStage ? stage.surfaceAt(hx, hz) : 0;
      w.surf = sf;
    }
    // ----- suspension forces (pass 2) + tyre forces -----
    let Fx = 0, Fy = -m * G, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
    const rho = RHO;
    // aero
    {
      const v2 = D.vx * D.vx + D.vy * D.vy + D.vz * D.vz;
      const vl = Math.sqrt(v2);
      if (vl > 0.1) {
        const kd = 0.5 * rho * spec.aero.cd * spec.aero.area * vl;
        Fx -= kd * D.vx; Fy -= kd * D.vy; Fz -= kd * D.vz;
      }
      // downforce along body down at the axles (40/60)
      const down = 0.5 * rho * spec.aero.downforce * v2 * 0.35 * Math.max(0, uy);
      if (down > 0) {
        Fx -= ux * down; Fy -= uy * down; Fz -= uz * down;
        // torque from front/rear split (front share 0.42 at z=-aF, rear 0.58 at z=+bR): pitch torque about right axis
        const tp = down * (0.42 * (-aF) + 0.58 * bR); // force along -up at local z: torque = r x F, r = z*k, F = -u*down
        // r x F = (z k) x (-down u) = -z*down (k x u) = -z*down*(-r)?  k x u = -r  (right-handed x,y,z) -> +z*down*r
        Tx += rx * tp; Ty += ry * tp; Tz += rz * tp;
      }
    }
    // surface drag + rolling per wheel computed below
    let totalLoad = 0;
    let powerSkid = 0;
    // the extra transfer fades out as the body slip angle passes ~7 deg: it starts a rotation, it never winds one up
    const ltFade = clamp(1 - (Math.abs(Math.atan2(ls, Math.abs(fs) + 0.5)) - 0.12) / 0.25, 0, 1);
    // ground velocity of each wheel is needed; compute forces
    const dmgSusp = state.damage.suspension;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const ws = s.wheels[i];
      let fz = 0;
      if (w.grounded) {
        // anti-roll from partner on same axle
        const partner = W[i ^ 1];
        const arb = w.kArb * (w.xc - partner.xc);
        let rate = (w.xc - w.xcPrev) / dt;
        rate = clamp(rate, -6, 6);
        w.rate += (rate - w.rate) * 0.6;
        const cmul = fxD.damperMul[i];
        const c = w.cD * cmul * (w.rate > 0 ? 0.75 : 1.3);
        const kk = w.kS * fxD.springMul[i];
        fz = kk * w.xc + c * w.rate + arb;
        const bs = w.xc - (T - 0.03);
        if (bs > 0) {
          fz += 300000 * bs + 6000 * Math.max(0, w.rate);
          if (w.rate > 0.8 && D.boCool <= 0) {
            const e = ev("bottomout");
            if (e) e.strength = clamp01(w.rate / 5);
            dmg.bottomout(clamp01(w.rate / 5), i);
            D.boCool = 0.3;
          }
        }
        if (fz < 0) fz = 0;
        if (fz > 60000) fz = 60000;
        const ny = w.ny;
        // steep ground: fade out load (acts like wall elsewhere)
        if (ny < 0.7) fz *= clamp((ny - 0.4) / 0.3, 0, 1);
      } else {
        w.rate = 0;
      }
      w.fz = fz;
      totalLoad += fz;
      // tyre load only (body forces keep fz): exaggerated longitudinal load transfer. Under braking or a lift the front
      // axle gains and the rear axle loses load, so the rear lets go and the car rotates; stronger on loose surfaces.
      let fzT = fz;
      if (fz > 1) {
        const lm = Math.min(2, 1 + LT_SURF * (1 - clamp(SURFACE_INFO[w.surf].mu, 0.4, 1)));
        const dLT = clamp(-(Math.min(0, D.axLP * LT_SUS) - LT_KICK * LT_KCAP * D.kick) * m * cg / wb * 0.5 * ltGain * lm * ltFade, -0.5 * w.loadRef, 0.5 * w.loadRef);
        fzT = fz + (w.front ? dLT : -dLT);
        if (fzT < 1) fzT = 1;
      }
      // contact point velocity
      const cx = w.cx, cy = w.cy, cz = w.cz;
      const rxw = cx - D.px, ryw = cy - D.py, rzw = cz - D.pz;
      const cvx = D.vx + (D.wy * rzw - D.wz * ryw);
      const cvy = D.vy + (D.wz * rxw - D.wx * rzw);
      const cvz = D.vz + (D.wx * ryw - D.wy * rxw);
      // wheel heading
      let hdx, hdy, hdz;
      if (w.front) {
        // steered forward: f*cd + r*sd (f = -k)
        hdx = -kx * cd + rx * sd; hdy = -ky * cd + ry * sd; hdz = -kz * cd + rz * sd;
        w.steer = D.steerAng;
      } else {
        hdx = -kx; hdy = -ky; hdz = -kz; w.steer = 0;
      }
      const nx = w.nx, ny = w.ny, nz = w.nz;
      const dpn = hdx * nx + hdy * ny + hdz * nz;
      let fwx = hdx - nx * dpn, fwy = hdy - ny * dpn, fwz = hdz - nz * dpn;
      const fwl = Math.sqrt(fwx * fwx + fwy * fwy + fwz * fwz) || 1;
      fwx /= fwl; fwy /= fwl; fwz /= fwl;
      // right = fwd x n
      const wrx = fwy * nz - fwz * ny, wry = fwz * nx - fwx * nz, wrz = fwx * ny - fwy * nx;
      const vxw = cvx * fwx + cvy * fwy + cvz * fwz;
      const vyw = cvx * wrx + cvy * wry + cvz * wrz;
      w.vxw = vxw;
      let fxT = 0, fyT = 0;
      w.dFx = 0; w.fxTyre = 0;
      if (fz > 1) {
        const grip = tyreGrip[w.surf] * sgTab[w.surf] * (w.front ? spec.handling.gripFront * (LOOSE_SURF[w.surf] ? 1 + (frontLoose - 1) * clamp(Math.abs(D.steerAng) / 0.06, 0, 1) : 1) : spec.handling.gripRear) * fxD.gripMul[i] * (0.97 + 0.06 * Wtemp[i]);
        const o = tyreForce(fzT, vxw, vyw, Wom[i] * Rw, w.surf, grip, w.loadRef, Rw);
        fxT = o.fx; fyT = o.fy;
        // stiction safety: forces must not overshoot the slip velocity in one step
        const lim = (m * 0.125) / dt;
        const mfy = lim * Math.abs(vyw);
        if (fyT > mfy) fyT = mfy; else if (fyT < -mfy) fyT = -mfy;
        if (Math.abs(Wom[i] * Rw) < 0.3) {
          const mfx = lim * Math.abs(vxw);
          if (fxT > mfx) fxT = mfx; else if (fxT < -mfx) fxT = -mfx;
        }
        w.fxTyre = fxT;
        // rolling resistance and ploughing (act on the body, not the wheel spin)
        const si = SURFACE_INFO[w.surf];
        const roll = (si.rolling * tyreRoll + fxD.rollExtra[i]) * fz;
        const th = Math.tanh(vxw * 2);
        fxT -= roll * th;
        const plough = si.drag * fz / G;
        const sp2 = Math.sqrt(vxw * vxw + vyw * vyw);
        if (plough > 0 && sp2 > 0.01) { fxT -= plough * vxw; fyT -= plough * vyw; }
        w.dFx = o.dFxdw;
        ws.slipRatio = o.kappa; ws.slipAngle = o.alpha; ws.skid = o.skid;
        w.skidS = o.skid;
        if (o.skid > 0.3 && spd > 2) powerSkid += o.skid * 0.25;
        Wtemp[i] += ((0.2 + 0.7 * o.skid) - Wtemp[i]) * Math.min(1, dt * 0.8);
        // splash
        if (w.surf === SURFACE.WATER && spd > 5 && D.splashCool <= 0) {
          const e = ev("splash");
          if (e) e.strength = clamp01(spd / 30);
          D.splashCool = 0.18;
        }
      } else {
        ws.slipRatio = 0; ws.slipAngle = 0; ws.skid = 0; w.skidS = 0;
        Wtemp[i] += (0.15 - Wtemp[i]) * Math.min(1, dt * 0.5);
      }
      w.fx = fxT; w.fy = fyT;
      // total force at contact
      const fxw = nx * fz + fwx * fxT + wrx * fyT;
      const fyw = ny * fz + fwy * fxT + wry * fyT;
      const fzw = nz * fz + fwz * fxT + wrz * fyT;
      Fx += fxw; Fy += fyw; Fz += fzw;
      Tx += ryw * fzw - rzw * fyw;
      Ty += rzw * fxw - rxw * fzw;
      Tz += rxw * fyw - ryw * fxw;
      w.xcPrev = w.xc;
    }

    // ----- drivetrain -----
    let sumW = 0, nW = 0, wF = 0, wRr = 0;
    for (let i = 0; i < 4; i++) if (driven[i]) { sumW += Wom[i]; nW++; }
    if (dtype === "AWD") { wF = (Wom[0] + Wom[1]) * 0.5; wRr = (Wom[2] + Wom[3]) * 0.5; }
    const avgW = nW ? sumW / nW : 0;
    const gearRatio = ratioOf(D.gear);
    const absRatio = Math.abs(gearRatio);
    const rpmKinS = avgW * gearRatio * RAD_RPM; // signed, positive when wheels turn the way the gear drives
    const rpmKin = rpmKinS > 0 ? rpmKinS : 0;
    // shift decision
    {
      const rpmGround = (Math.abs(fs) / Rw) * absRatio * RAD_RPM;
      const rk = Math.abs(rpmKinS);
      autoShift(dt, rk < rpmGround * 1.25 + 400 ? rk : rpmGround * 1.25 + 400, gearRatio);
    }
    const thr = thrEff;
    // turbo
    if (eng.turbo) {
      const bt = thr * clamp((D.rpm - 1800) / 2000, 0, 1);
      const rate = bt > D.boost ? eng.turbo.spoolUp : eng.turbo.spoolDown;
      D.boost += (bt - D.boost) * Math.min(1, rate * dt);
      if (D.prevThr > 0.6 && thr < 0.3 && D.boost > 0.5 && D.wgCool <= 0) {
        ev("wastegate");
        D.wgCool = 0.5;
      }
      D.prevThr = thr;
    } else {
      D.boost = 0;
    }
    // engine rpm and transmitted torque
    let driveT = 0; // torque at the driveshaft ahead of the diffs (after gearing)
    let lockedInertia = false;
    D.clutchSlip = 0;
    const launchMax = 0.45 * redline;
    if (D.gear !== 0 && D.shiftT <= 0 && nW > 0) {
      const target = idle + thr * (launchMax - idle);
      if (rpmKinS >= Math.max(target, idle * 1.02)) {
        D.rpm = rpmKinS;
        lockedInertia = true;
      } else {
        D.clutchSlip = 1;
        D.rpm += (target - D.rpm) * Math.min(1, 14 * dt);
        if (D.rpm < idle) D.rpm = idle;
      }
    } else if (D.shiftT > 0 && D.gear !== 0) {
      D.rpm += (Math.max(idle, rpmKinS) - D.rpm) * Math.min(1, 14 * dt);
    } else {
      // neutral: free revving
      const te = engineTorque(D.rpm, thr, D.boost);
      D.rpm += (te / eng.inertia) * dt * RAD_RPM;
      if (D.rpm < idle) D.rpm = idle;
    }
    if (D.rpm > redline * 1.04) D.rpm = redline * 1.04;
    // limiter
    let cut = false;
    if (D.rpm >= redline) {
      if (D.cutT <= 0) {
        D.cutT = 0.06;
        if (D.limCool <= 0) { ev("limiter"); D.limCool = 0.15; }
      }
    }
    if (D.cutT > 0) cut = true;
    let te = engineTorque(D.rpm, cut ? 0 : thr, D.boost);
    if (cut) te = -0.4 * fricK * (16 + 0.0085 * D.rpm);
    if (fxD.engineDead && te > 0) te *= 0.15;
    s.engineTorque = te;
    let torqueMulSlip = 1;
    if (D.gear !== 0 && D.shiftT <= 0 && nW > 0) {
      let tcl = te;
      if (D.clutchSlip) {
        const cap = spec.clutchTorque || 900;
        if (tcl > cap) tcl = cap; else if (tcl < -cap) tcl = -cap;
        if (thr < 0.02) tcl = 0; // no creep
        torqueMulSlip = 1;
      }
      if (D.gear === -1 && D.clutchSlip && thr < 0.02) tcl = 0;
      driveT = tcl * gearRatio * ETA * fxD.torqueMul;
    }
    // split to wheels
    for (let i = 0; i < 4; i++) W[i].tq = 0;
    if (driveT !== 0) {
      let fShare = splitF;
      if (dtype === "AWD") {
        const sat = clamp((wF - wRr) / 6, -1, 1);
        fShare = clamp(splitF - diffC * 0.45 * sat, 0.05, 0.95);
      }
      if (fShare > 0) axleSplit(0, 1, driveT * fShare, diffF);
      if (fShare < 1) axleSplit(2, 3, driveT * (1 - fShare), diffR);
    }
    // inertia reflected onto the driven wheels while the clutch is locked
    const reflect = lockedInertia ? (eng.inertia * absRatio * absRatio) / Math.max(1, nW) : 0;

    // ----- wheel spin integration -----
    const hold = fs < 0.5 && fs > -0.5 && spd < 0.8 && thr < 0.03 ? 1 : 0;
    const bF = brakeBias * 0.5 * spec.brakeTorque, bR2 = (1 - brakeBias) * 0.5 * spec.brakeTorque;
    // moving against the engaged gear with the pedal up: driveline drag (engine braking) stops the roll-back
    const against = thr < 0.05 && ((D.gear > 0 && fs < -0.5) || (D.gear < 0 && fs > 0.5)) ? 0.1 * spec.brakeTorque * 0.5 : 0;
    let spinSum = 0;
    for (let i = 0; i < 4; i++) {
      const w = W[i];
      const front = w.front;
      let bkT = brkEff * (front ? bF : bR2);
      // ABS-like modulation (assist): ease the brake on a wheel that is locking so it keeps steering and gripping
      if (opts.assist > 0 && bkT > 0 && spd > 3 && Math.abs(D.steerIn) > 0.12) { // only while turning: straight-line stops keep their natural lock-up distance
        const kk = s.wheels[i].slipRatio;
        if (kk < -0.16) bkT *= clamp(1 - (-kk - 0.16) * 4.5 * Math.min(1, opts.assist * 3), 0.3, 1);
      }
      let bt = bkT + against;
      if (!front) bt += hbEff * 3200;
      if (hold) bt += 600;
      const I = IW + (driven[i] ? reflect : 0);
      const wom = Wom[i];
      const tnet = w.tq - Rw * w.fxTyre;
      let wn = wom + (dt * tnet) / (I + dt * Rw * w.dFx);
      // brake (never reverses the wheel)
      if (bt > 0) {
        const dw = (dt * bt) / I;
        if (wn > dw) wn -= dw; else if (wn < -dw) wn += dw; else wn = 0;
      }
      Wom[i] = wn;
      Wspin[i] += wn * dt;
      spinSum += Math.abs(s.wheels[i].slipRatio) * (w.grounded ? 1 : 0);
    }
    s.wheelspin = spinSum * 0.25;
    s.slide = powerSkid;

    // ----- stability control: a braking-yaw-moment stand-in (ESC) that kills runaway rotation -----
    if (opts.assist > 0 && groundedCount >= 3 && spd > 7 && fs > 3) {
      if (hbEff > 0.2) D.hbHold = 1.1; else if (D.hbHold > 0) D.hbHold -= dt;
      const E = Math.min(1, opts.assist * 3.0) * clamp((spd - 7) / 10, 0, 1) * (D.hbHold > 0 ? 0 : 1);
      const wup = D.wx * ux + D.wy * uy + D.wz * uz;
      // yaw rate the driver is asking for (kinematic), limited to what the surface can sustain
      let muE = 0;
      for (let i = 0; i < 4; i++) muE += SURFACE_INFO[W[i].surf].mu;
      const rLim = (0.35 + 0.65 * muE * 0.25) * 1.05 * G / Math.max(spd, 8);
      let rDes = -(fs / wb) * Math.tan(D.steerAng);
      rDes = clamp(rDes, -rLim, rLim);
      const ex = wup - rDes;
      const gate = clamp((Math.abs(ex) - 0.3) / 0.3, 0, 1);
      if (gate > 0) {
        const beta = Math.abs(Math.atan2(ls, fs + 0.5));
        const g2 = gate * clamp((beta - 0.05) / 0.15 + 0.35, 0, 1);
        let T = -E * g2 * 4.0 * Iyaw * ex;
        const Tmax = E * 2400;
        if (T > Tmax) T = Tmax; else if (T < -Tmax) T = -Tmax;
        Tx += ux * T; Ty += uy * T; Tz += uz * T;
      }
    }
    // ----- angular & linear integration -----
    // gravity already in Fy
    D.vx += (Fx / m) * dt; D.vy += (Fy / m) * dt; D.vz += (Fz / m) * dt;
    {
      // body frame torque and gyroscopic term
      let wbx = D.wx * rx + D.wy * ry + D.wz * rz;
      let wby = D.wx * ux + D.wy * uy + D.wz * uz;
      let wbz = D.wx * kx + D.wy * ky + D.wz * kz;
      const tbx = Tx * rx + Ty * ry + Tz * rz;
      const tby = Tx * ux + Ty * uy + Tz * uz;
      const tbz = Tx * kx + Ty * ky + Tz * kz;
      const gx = (Iyaw - Iroll) * wby * wbz;
      const gy2 = (Iroll - Ipitch) * wbz * wbx;
      const gz = (Ipitch - Iyaw) * wbx * wby;
      wbx += ((tbx + gx) / Ipitch) * dt;
      wby += ((tby + gy2) / Iyaw) * dt;
      wbz += ((tbz + gz) / Iroll) * dt;
      // air attitude control: a flying rally car noses over with the trajectory instead of tumbling
      if (groundedCount === 0 && D.airT > 0.06 && uy > 0.3 && Math.abs(state.pitch) < 1.25) {
        const vh = Math.sqrt(D.vx * D.vx + D.vz * D.vz) + 2;
        const tgt = Math.atan2(D.vy, vh) * 0.85;
        const accP = clamp(5 * (tgt - state.pitch) - 3.2 * wbx, -9, 9);
        wbx += accP * dt;
        wbz -= wbz * Math.min(1, 2.5 * dt);
      }
      // light angular damping (air/viscous) to stay tame
      D.wx = rx * wbx + ux * wby + kx * wbz;
      D.wy = ry * wbx + uy * wby + ky * wbz;
      D.wz = rz * wbx + uz * wby + kz * wbz;
    }
    // clamp
    {
      const wl = Math.sqrt(D.wx * D.wx + D.wy * D.wy + D.wz * D.wz);
      if (wl > 25) { const f = 25 / wl; D.wx *= f; D.wy *= f; D.wz *= f; }
      const vl = Math.sqrt(D.vx * D.vx + D.vy * D.vy + D.vz * D.vz);
      if (vl > 110) { const f = 110 / vl; D.vx *= f; D.vy *= f; D.vz *= f; }
    }
    // orientation
    {
      const w = D.qw, x = D.qx, y = D.qy, z = D.qz;
      const h = 0.5 * dt;
      const dw = -h * (D.wx * x + D.wy * y + D.wz * z);
      const dx = h * (D.wx * w + D.wy * z - D.wz * y);
      const dy = h * (D.wy * w + D.wz * x - D.wx * z);
      const dz = h * (D.wz * w + D.wx * y - D.wy * x);
      let nw = w + dw, nx2 = x + dx, ny2 = y + dy, nz2 = z + dz;
      const nl = 1 / Math.sqrt(nw * nw + nx2 * nx2 + ny2 * ny2 + nz2 * nz2);
      D.qw = nw * nl; D.qx = nx2 * nl; D.qy = ny2 * nl; D.qz = nz2 * nl;
    }

    // ----- position integration with swept obstacle collision -----
    const dispLen = Math.sqrt(D.vx * D.vx + D.vy * D.vy + D.vz * D.vz) * dt;
    const nMicro = Math.max(1, Math.min(6, Math.ceil(dispLen / 0.3)));
    const dtm = dt / nMicro;
    let haveObs = false;
    if (stage.obstaclesNear) {
      obsBuf.length = 0;
      stage.obstaclesNear(D.px + D.vx * dt * 0.5, D.pz + D.vz * dt * 0.5, reach + dispLen + 1.5, obsBuf);
      haveObs = obsBuf.length > 0;
    }
    axes();
    impDiss = 0;
    for (let mi = 0; mi < nMicro; mi++) {
      D.px += D.vx * dtm; D.py += D.vy * dtm; D.pz += D.vz * dtm;
      if (haveObs) obstaclePass(stage, spd);
    }
    D.distance += dispLen;

    // ----- stage position, terrain contact, walls -----
    const prj = stage.project(D.px, D.pz, D.hintS, projOut);
    D.hintS = prj.s;
    s.s = prj.s; s.lat = prj.lat;
    axes();
    terrainPass(stage, dt);
    wallPass(stage);
    {
      // pinned-car aid: throttle held, nearly stopped, touching a wall for a while -> cap the drive (no digging in) and ease the car off along the contact normal
      D.cnAge += dt;
      if (D.thr > 0.5 && Math.abs(s.speed) < PIN_SPEED && D.cnAge < 1.0) D.pinT += dt; else D.pinT = Math.max(0, D.pinT - 0.5 * dt);
      if (D.pinT > PIN_AFTER && D.vx * D.cnx + D.vz * D.cnz < PIN_SEP) { D.vx += D.cnx * PIN_PUSH * dt; D.vz += D.cnz * PIN_PUSH * dt; } // ease off the wall to ~2 m/s, no more
    }
    // road width test
    {
      const wi = stage.width ? stage.width[Math.min(stage.N - 1, Math.max(0, Math.round(prj.s / stage.ds)))] : 6;
      s.onRoad = Math.abs(prj.lat) <= wi * 0.5 + 0.2;
    }

    // ----- air / landing -----
    if (groundedCount === 0) {
      D.airT += dt;
      if (D.vy < D.airMinVy) D.airMinVy = D.vy;
    } else {
      if (D.airT > 0.22 && D.wasAir) {
        const st = clamp01(-D.airMinVy / 11);
        if (st > 0.05) {
          const e = ev("landing");
          if (e) e.strength = st;
          // damage follows the speed the suspension could not absorb (its travel soaks up ~3.5 m/s) and how flat the car
          // lands; a clean wheels-down landing at 100-140 km/h is cheap, a nose or side landing is not
          const flat = clamp01((uy - 0.55) / 0.4);
          const eff = clamp01((-D.airMinVy - LAND_SOAK) / (11 - LAND_SOAK)) * (1 + 2.5 * (1 - flat));
          dmg.landing(Math.min(1, eff));
          s.collided = 0; D.collided = 0;
        }
      }
      D.airT = 0; D.airMinVy = 0;
    }
    D.wasAir = D.airT > 0.22 ? 1 : 0;
    s.airborne = D.airT > 0.08;

    // flipped detection and roll event
    if (uy < 0.35) {
      D.flipT += dt;
      if (D.flipT > 0.5) s.flipped = true;
    } else {
      D.flipT = 0; s.flipped = false;
    }
    if (uy < 0.05 && !wasRoll) { ev("roll"); wasRoll = true; }
    if (uy > 0.6) wasRoll = false;

    // ----- sleep (parked car does not drift) -----
    if (groundedCount === 4 && uy > 0.9 && thrEff < 0.04) {
      const v2 = D.vx * D.vx + D.vy * D.vy + D.vz * D.vz;
      const w2 = D.wx * D.wx + D.wy * D.wy + D.wz * D.wz;
      if (v2 < 0.0064 && w2 < 0.01 && W[0].ny > 0.9 && (brkEff > 0.02 || hold || hbEff > 0.02 || D.gear === 0 || true)) {
        // gentle settle: bleed velocity quickly instead of an abrupt freeze
        D.vx = 0; D.vy = 0; D.vz = 0; D.wx = D.wy = D.wz = 0;
        for (let i = 0; i < 4; i++) if (Math.abs(Wom[i]) < 0.8) Wom[i] = 0;
      }
    }

    // ----- g-force readouts -----
    {
      const lastAx = D.lastAx, lastAz = D.lastAz;
      const ax = (D.vx - lastAx) / dt, az = (D.vz - lastAz) / dt;
      D.lastAx = D.vx; D.lastAz = D.vz;
      const gl = (ax * fnx + az * fnz) / G, gt = (ax * rnx + az * rnz) / G;
      s.gLong += (gl - s.gLong) * 0.1;
      s.gLat += (gt - s.gLat) * 0.1;
    }

    // NaN guard
    if (!(D.px + D.py + D.pz + D.vx + D.vy + D.vz + D.wx + D.wy + D.wz + D.qw === D.px + D.py + D.pz + D.vx + D.vy + D.vz + D.wx + D.wy + D.wz + D.qw) ||
        Math.abs(D.px) > 1e6 || Math.abs(D.py) > 1e5) {
      placeAt({ x: lastGood.x, y: lastGood.y, z: lastGood.z, yaw: lastGood.yaw, hintS: D.hintS }, 0, stage);
    } else if (uy > 0.5 && spd < 90 && ((s.pitch === s.pitch))) {
      lastGoodTimer -= dt;
      if (lastGoodTimer <= 0 && groundedCount >= 3) {
        lastGoodTimer = 0.5;
        lastGood.x = D.px; lastGood.y = D.py - cg; lastGood.z = D.pz; lastGood.yaw = s.yaw;
      }
    }

    syncState(stage, dt);
    // surfaceKey for audio/fx convenience
    s.surfaceKey = SURFACE_INFO[W[2].surf].key;
  }
  let wasRoll = false;
  let lastGoodTimer = 0;
  const lastGood = { x: 0, y: 0, z: 0, yaw: 0 };

  function axleSplit(a, b, T_axle, lock) {
    const wa = Wom[a], wb2 = Wom[b];
    const sat = clamp((wa - wb2) / 6, -1, 1); // + : a faster than b
    const slowBias = 0.5 * lock * Math.abs(sat) * (T_axle < 0 ? 0.3 : 1);
    // the slower wheel gets the bias torque
    if (sat >= 0) { W[a].tq += T_axle * (0.5 - slowBias); W[b].tq += T_axle * (0.5 + slowBias); }
    else { W[a].tq += T_axle * (0.5 + slowBias); W[b].tq += T_axle * (0.5 - slowBias); }
  }

  // ---------- snapshot / restore ----------
  function snapshot() {
    const o = { D: {}, om: Wom.slice(), spin: Wspin.slice(), temp: Wtemp.slice(), xc: [], xcPrev: [], rate: [], dmg: JSON.parse(JSON.stringify(state.damage)), dmgI: dmg.snapshot(), flags: { flipped: state.flipped, airborne: state.airborne, wasRoll }, glat: state.gLat, glong: state.gLong, ex: [state.engineTorque, state.wheelspin, state.slide], ws: [], opts: { auto: opts.auto, tyre: opts.tyre, assist: opts.assist, damageScale: opts.damageScale, setup: { ...opts.setup } } };
    for (const k of DYN_SCALARS) o.D[k] = D[k];
    o.D.clutchSlip = D.clutchSlip || 0;
    for (let i = 0; i < 4; i++) o.ws.push(state.wheels[i].slipRatio, state.wheels[i].slipAngle, state.wheels[i].skid);
    for (let i = 0; i < 4; i++) { o.xc.push(W[i].xc); o.xcPrev.push(W[i].xcPrev); o.rate.push(W[i].rate); }
    return JSON.parse(JSON.stringify(o));
  }
  function restore(o) {
    for (const k of DYN_SCALARS) if (o.D[k] !== undefined) D[k] = o.D[k];
    D.clutchSlip = o.D.clutchSlip || 0;
    for (let i = 0; i < 4; i++) {
      Wom[i] = o.om[i]; Wspin[i] = o.spin[i]; Wtemp[i] = o.temp[i];
      W[i].xc = o.xc[i]; W[i].xcPrev = o.xcPrev[i]; W[i].rate = o.rate[i];
    }
    const d = state.damage;
    d.engine = o.dmg.engine; d.gearbox = o.dmg.gearbox; d.steering = o.dmg.steering; d.radiator = o.dmg.radiator; d.total = o.dmg.total;
    for (let i = 0; i < 4; i++) { d.suspension[i] = o.dmg.suspension[i]; d.tyres[i] = o.dmg.tyres[i]; }
    d.body.front = o.dmg.body.front; d.body.rear = o.dmg.body.rear; d.body.left = o.dmg.body.left; d.body.right = o.dmg.body.right;
    dmg.restore(o.dmgI);
    state.flipped = o.flags.flipped; state.airborne = o.flags.airborne; wasRoll = !!o.flags.wasRoll;
    state.gLat = o.glat; state.gLong = o.glong;
    if (o.opts) configure({ auto: o.opts.auto, tyre: o.opts.tyre, assist: o.opts.assist, damageScale: o.opts.damageScale, setup: o.opts.setup });
    state.events.length = 0;
    for (let i = 0; i < 4; i++) {
      const w = state.wheels[i];
      w.slipRatio = o.ws ? o.ws[i * 3] : 0; w.slipAngle = o.ws ? o.ws[i * 3 + 1] : 0; w.skid = o.ws ? o.ws[i * 3 + 2] : 0;
    }
    if (o.ex) { state.engineTorque = o.ex[0]; state.wheelspin = o.ex[1]; state.slide = o.ex[2]; }
    syncState(null, 0);
  }

  const vehicle = {
    spec, state,
    options: opts,
    configure,
    reset(pose, speed = 0, stage) {
      placeAt(pose, speed, stage);
      state.damage.total = state.damage.total; // damage persists across reset (use repair())
      lastGood.x = pose.x; lastGood.y = pose.y; lastGood.z = pose.z; lastGood.yaw = pose.yaw || 0;
      lastGoodTimer = 0.5;
      D.lastAx = D.vx; D.lastAz = D.vz;
      state.gLat = 0; state.gLong = 0;
      wasRoll = false;
    },
    step,
    snapshot,
    restore,
    repair(partial) { dmg.repair(partial); },
    /** fully new car: damage cleared and placed */
    resetAll(pose, speed = 0, stage) { dmg.reset(); vehicle.reset(pose, speed, stage); },
  };
  placeAt({ x: 0, y: 0, z: 0, yaw: 0 }, 0, null);
  return vehicle;
}
