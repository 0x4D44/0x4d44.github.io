// Kart: arcade physics + procedural kart model.
// Heading θ: forward = (sinθ,0,cosθ), right = (-cosθ,0,sinθ). Steering right => θ DEcreases.
import * as THREE from "three";
import { blankInput, clamp } from "./roster.js";

// ---------------------------------------------------------------- tuning
const T = {
  topBase: 34, topPerSpeed: 12,        // maxSpeed = topBase + speed*topPerSpeed  (m/s)
  accelBase: 15, accelPerStat: 12,     // m/s^2 at standstill
  brakeDecel: 36, coastDecel: 3.5, coastDrag: 0.10,
  reverseFrac: 0.33, reverseAccel: 12,
  turnBase: 1.7, turnPerHandling: 1.0, // rad/s
  turnHighSpeedFactor: 0.62,           // fraction of turn rate left at top speed
  steerRise: 9, steerFall: 12,         // steering smoothing (1/s)
  gripBase: 10, gripPerHandling: 4,    // lateral velocity decay (1/s)
  gripConvert: 0.85,                   // part of scrubbed lateral speed converted to forward speed
  grassTop: 0.55, grassDrag: 2.6, grassGrip: 0.75, kerbTop: 0.93,
  boostTopGain: 0.45, boostAccel: 34,
  // drift
  driftMinSpeed: 14, driftEndSpeed: 8, driftArmTime: 0.45,
  driftGrip: 4.5, driftTurn: 0.72, driftTurnIn: 0.43, driftTurnOut: 0.42,
  driftChargeRate: 1.05,               // levels per second (scaled by steer alignment)
  driftBoost: [null, [0.55, 0.8], [0.8, 1.3], [1.0, 1.9]],   // level -> [strength, seconds]
  driftTopMul: 0.97,
  // walls / collisions
  wallRestitution: 0.25, wallScrub: 0.012, wallFriction: 0.3, wallTop: 0.8, wallAlign: 4.5,
  kartRestitution: 0.4, massBase: 0.8, massPerWeight: 1.4,
  // misc
  spinSpeedKeep: 0.35, spinDecay: 2.0, spinTurns: 2,
  stuckRespawn: 4.5,
  gravity: 32, airEps: 0.05, maxAir: 4, slopeSpeed: 0.5, slopeMin: 0.95, slopeMax: 1.04, snapJump: 1.5,
};

const TWO_PI = Math.PI * 2;
const wrapPi = (a) => { a %= TWO_PI; if (a > Math.PI) a -= TWO_PI; else if (a < -Math.PI) a += TWO_PI; return a; };

// ---------------------------------------------------------------- mesh
const geoCache = new Map();
const matCache = new Map();
function geo(key, make) { let g = geoCache.get(key); if (!g) { g = make(); geoCache.set(key, g); } return g; }
function mat(color, opts = {}) {
  const key = color + "|" + (opts.rough ?? 0.45) + "|" + (opts.metal ?? 0.1) + "|" + (opts.emissive ?? 0);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.45, metalness: opts.metal ?? 0.1, emissive: opts.emissive ?? 0x000000 });
    matCache.set(key, m);
  }
  return m;
}
let blobTex = null;
function shadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  grd.addColorStop(0, "rgba(0,0,0,0.55)"); grd.addColorStop(0.6, "rgba(0,0,0,0.3)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

function add(parent, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildKartMesh(color = 0xe63946, accent = 0xffffff) {
  const root = new THREE.Group();
  root.name = "kart";
  const body = new THREE.Group(); body.name = "body";
  root.add(body);

  const paint = mat(color, { rough: 0.3, metal: 0.25 });
  const trim = mat(accent, { rough: 0.4 });
  const dark = mat(0x1b1d24, { rough: 0.6, metal: 0.3 });
  const steel = mat(0x9aa0aa, { rough: 0.25, metal: 0.8 });
  const rubber = mat(0x15161a, { rough: 0.9, metal: 0 });
  const box = geo("box", () => new THREE.BoxGeometry(1, 1, 1));
  const cyl8 = geo("cyl8", () => new THREE.CylinderGeometry(1, 1, 1, 10));
  const sph = geo("sph", () => new THREE.SphereGeometry(1, 14, 10));

  // tub + floor
  add(body, box, dark, 0, 0.26, 0, 1.2, 0.14, 2.5);                       // floor pan
  add(body, box, paint, 0, 0.48, -0.15, 1.35, 0.4, 1.7);                  // main tub
  add(body, box, paint, 0, 0.64, -0.55, 1.2, 0.18, 0.9);                  // engine cover
  // nose cone (cylinder along z, narrow end forward)
  const nose = add(body, geo("nose", () => new THREE.CylinderGeometry(0.3, 0.62, 1.2, 10)), paint, 0, 0.47, 1.25, 1, 1, 0.65);
  nose.rotation.x = Math.PI / 2;
  add(body, box, trim, 0, 0.67, 1.2, 0.22, 0.04, 1.0);                    // nose stripe
  add(body, box, trim, 0, 0.7, 0.2, 0.22, 0.04, 0.9);                     // cockpit stripe
  // side pods with accent
  for (const sx of [-1, 1]) {
    add(body, box, paint, sx * 0.86, 0.42, -0.05, 0.38, 0.32, 1.35);
    add(body, box, trim, sx * 1.06, 0.45, -0.05, 0.04, 0.12, 1.1);
    add(body, box, dark, sx * 0.55, 0.3, 1.25, 0.1, 0.1, 0.5);
  }
  // front wing
  add(body, box, trim, 0, 0.26, 1.95, 1.9, 0.07, 0.38);
  for (const sx of [-1, 1]) add(body, box, paint, sx * 0.95, 0.34, 1.95, 0.06, 0.24, 0.42);
  // rear wing
  add(body, box, trim, 0, 1.18, -1.25, 1.7, 0.07, 0.42);
  for (const sx of [-1, 1]) {
    add(body, box, dark, sx * 0.4, 0.92, -1.2, 0.07, 0.5, 0.1);
    add(body, box, paint, sx * 0.86, 1.1, -1.25, 0.05, 0.3, 0.46);
  }
  // exhausts
  for (const sx of [-1, 1]) {
    const e = add(body, geo("exh", () => new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8)), steel, sx * 0.32, 0.55, -1.45);
    e.rotation.x = Math.PI / 2;
  }
  // seat + driver
  add(body, box, dark, 0, 0.78, -0.35, 0.8, 0.5, 0.2);
  const driver = new THREE.Group(); driver.name = "driver"; body.add(driver);
  add(driver, box, trim, 0, 0.88, -0.05, 0.6, 0.5, 0.42);                 // torso (suit in accent)
  for (const sx of [-1, 1]) {
    const arm = add(driver, geo("arm", () => new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6)), trim, sx * 0.34, 0.98, 0.28);
    arm.rotation.x = Math.PI / 2 - 0.35;
  }
  const helmet = add(driver, sph, paint, 0, 1.36, -0.05, 0.31, 0.31, 0.33); helmet.name = "helmet";
  add(driver, box, mat(0x0b1020, { rough: 0.1, metal: 0.6 }), 0, 1.38, 0.2, 0.46, 0.15, 0.2);       // visor
  add(driver, box, trim, 0, 1.64, -0.05, 0.07, 0.04, 0.5);                                           // helmet stripe
  const wheelCol = new THREE.Group(); wheelCol.name = "steerwheel"; wheelCol.position.set(0, 0.95, 0.38); wheelCol.rotation.x = -0.9; body.add(wheelCol);
  const rim = new THREE.Mesh(geo("rim", () => new THREE.TorusGeometry(0.17, 0.035, 6, 14)), dark); wheelCol.add(rim);
  // lights
  for (const sx of [-1, 1]) {
    add(body, box, mat(0xfff6c8, { emissive: 0xffe9a0, rough: 0.2 }), sx * 0.42, 0.5, 1.62, 0.22, 0.1, 0.06);
    add(body, box, mat(0xff2a2a, { emissive: 0x991111, rough: 0.3 }), sx * 0.5, 0.62, -1.05, 0.2, 0.08, 0.05);
  }

  // wheels: pivot (named "wheel", steers if front) -> spin group -> tyre + hub
  const wheels = [];
  const defs = [[-1, 0.92, true], [1, 0.92, true], [-1, -0.9, false], [1, -0.9, false]];
  for (const [sx, z, front] of defs) {
    const r = front ? 0.36 : 0.4, w = front ? 0.34 : 0.46;
    const pivot = new THREE.Group(); pivot.name = "wheel";
    pivot.position.set(sx * (front ? 0.86 : 0.9), r, z);
    const spin = new THREE.Group(); spin.name = "spin"; pivot.add(spin);
    const tyre = add(spin, geo(`tyre${front}`, () => new THREE.CylinderGeometry(r, r, w, 16)), rubber, 0, 0, 0);
    tyre.rotation.z = Math.PI / 2;
    const hub = add(spin, geo(`hub${front}`, () => new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.03, 8)), trim, 0, 0, 0);
    hub.rotation.z = Math.PI / 2;
    const bolt = add(spin, box, steel, sx * (w / 2 + 0.02), r * 0.3, 0, 0.03, 0.1, 0.1);   // spoke mark so rotation reads
    void bolt;
    pivot.userData.front = front; pivot.userData.radius = r; pivot.userData.spin = spin;
    body.add(pivot); wheels.push(pivot);
  }

  // blob shadow (on root so it stays flat while the body rolls)
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.6), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.name = "shadow"; sh.renderOrder = 1;
  root.add(sh);

  root.userData = { body, wheels, steerwheel: wheelCol, driver, shadow: sh };
  return root;
}

// ---------------------------------------------------------------- kart
export class Kart {
  constructor({ id, name, color, accent, stats = {}, isPlayer = false } = {}) {
    this.id = id; this.name = name; this.color = color; this.accent = accent; this.isPlayer = isPlayer;
    const st = { speed: 0.5, accel: 0.5, handling: 0.5, weight: 0.5, ...stats };
    this.stats = st;
    this.maxSpeed = T.topBase + st.speed * T.topPerSpeed;
    this.accelBase = T.accelBase + st.accel * T.accelPerStat;
    this.turnRate = T.turnBase + st.handling * T.turnPerHandling;
    this.grip = T.gripBase + st.handling * T.gripPerHandling;
    this.mass = T.massBase + st.weight * T.massPerWeight;
    this.radius = 1.3;

    this.mesh = buildKartMesh(color, accent);
    this._body = this.mesh.userData.body; this._wheels = this.mesh.userData.wheels;
    this._steerWheel = this.mesh.userData.steerwheel; this._shadow = this.mesh.userData.shadow;

    this.position = new THREE.Vector3(); this.velocity = new THREE.Vector3();
    this.heading = 0; this.speed = 0;
    this.input = blankInput();
    this.locked = false; this.speedScale = 1;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0;
    this.boostTime = 0; this.boostStrength = 0;
    this.spinTime = 0; this.shield = 0;
    this.offRoad = false; this.surface = "road"; this.onWall = false;
    this.item = null; this.itemCount = 0; this.race = null;
    // extras (additive, read-only for others)
    this.steerAmount = 0;  // smoothed steering -1..1 (+ = right)
    this.slip = 0;         // lateral slip velocity m/s (for skid sounds / smoke)
    this.rev = 0;          // smoothed throttle while locked (grid rev / rocket start)
    this.stuckTime = 0;    // seconds stuck against something while trying to drive
    this.ghost = false;    // true: skipped by Kart.collide
    this.s = 0; this.lateral = 0;   // last known track coordinates

    this.mesh.rotation.order = "YXZ";
    this.grounded = true; this.airTime = 0;
    this._by = 0; this._vyb = 0; this._prevGround = 0; this._snapY = true; this._sp = 0; this._sr = 0; this._fwdSlope = 0;
    this._listeners = new Map();
    this._loc = null; this._hint = undefined; this._lastGoodS = 0;
    this._driftArm = 0; this._prevDrift = false; this._driftVis = 0; this._level = 0;
    this._hop = -1; this._padLatch = false; this._wallCool = 0; this._wallTimer = 0;
    this._spinDur = 1; this._spinVis = 0; this._wheelRot = 0; this._roll = 0; this._pitch = 0; this._prevVf = 0;
    this.placeAt(this.position, 0);
  }

  // ------------------------------------------------ events
  on(name, fn) { let a = this._listeners.get(name); if (!a) this._listeners.set(name, a = []); a.push(fn); return this; }
  off(name, fn) { const a = this._listeners.get(name); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } return this; }
  _emit(name, a, b) { const l = this._listeners.get(name); if (l) for (let i = 0; i < l.length; i++) l[i](a, b); }

  // ------------------------------------------------ actions
  placeAt(pos, heading, hintS) {
    this.position.set(pos.x, pos.y || 0, pos.z); this._snapY = true; this._by = this.position.y; this._vyb = 0; this.grounded = true; this.airTime = 0;
    this._sp = 0; this._sr = 0; this._fwdSlope = 0; this.heading = heading;
    this.velocity.set(0, 0, 0); this.speed = 0; this.slip = 0;
    this.drifting = false; this.driftDir = 0; this.driftCharge = 0; this._level = 0; this._driftVis = 0; this._hop = -1;
    this.boostTime = 0; this.boostStrength = 0; this.spinTime = 0; this._spinVis = 0;
    this.steerAmount = 0; this.rev = 0; this.stuckTime = 0; this.onWall = false;
    this._loc = null; this._hint = hintS; this._padLatch = false; this._roll = 0; this._pitch = 0;
    this._syncMesh(0);
  }

  boost(strength = 1, duration = 1.5) {
    if (this.boostTime > 0) this.boostStrength = Math.max(this.boostStrength, strength);
    else this.boostStrength = strength;
    this.boostTime = Math.max(this.boostTime, duration);
    this._emit("boost", strength);
  }

  spinOut(duration = 1.4) {
    if (this.spinTime > 0) { this.spinTime = Math.max(this.spinTime, duration * 0.6); return; }
    this._cancelDrift(false);
    this.spinTime = duration; this._spinDur = duration; this._spinVis = 0;
    this.boostTime = 0; this.boostStrength = 0;
    this.velocity.multiplyScalar(T.spinSpeedKeep);
    this._hop = 0;
    this._emit("spin");
  }

  addShield(seconds) { this.shield = Math.max(this.shield, seconds); }

  respawn(track) {
    const s = this._lastGoodS;
    const sm = track.sample(s);
    const half = sm.halfWidth * 0.5;
    const lat = clamp(this.lateral || 0, -half, half);
    const px = sm.pos.x + sm.right.x * lat, pz = sm.pos.z + sm.right.z * lat;
    const h = Math.atan2(sm.tangent.x, sm.tangent.z);
    this.placeAt({ x: px, y: sm.pos.y || 0, z: pz }, h, s);
  }

  _cancelDrift(award) {
    if (!this.drifting) return;
    const lvl = Math.min(3, Math.floor(this.driftCharge));
    this.drifting = false; this.driftDir = 0;
    if (award && lvl >= 1) {
      const [str, dur] = T.driftBoost[lvl];
      this.boost(str, dur);
      this._emit("driftboost", lvl);
    }
    this.driftCharge = 0; this._level = 0;
  }

  // ------------------------------------------------ physics step
  update(dt, track) {
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;
    const inp = this.input || blankInput();
    const v = this.velocity;
    const spinning = this.spinTime > 0;
    const live = !this.locked && !spinning;

    // timers
    if (this.boostTime > 0) { this.boostTime -= dt; if (this.boostTime <= 0) { this.boostTime = 0; this.boostStrength = 0; } }
    if (this.shield > 0) this.shield = Math.max(0, this.shield - dt);
    if (this._driftArm > 0) this._driftArm -= dt;
    if (this._wallCool > 0) this._wallCool -= dt;
    if (this._wallTimer > 0) { this._wallTimer -= dt; if (this._wallTimer <= 0) this.onWall = false; }
    if (spinning) {
      this.spinTime -= dt;
      this._spinVis = clamp(1 - this.spinTime / this._spinDur, 0, 1);
      if (this.spinTime <= 0) { this.spinTime = 0; this._spinVis = 0; this._emit("land"); }
    }

    // first-time surface lookup
    if (!this._loc) {
      this._loc = track.locate(this.position, this._hint);
      this._hint = this._loc.s;
    }
    if (this._snapY) { this._snapY = false; this._groundY(this._loc, 0, true); }
    const loc = this._loc;
    this.surface = loc.surface; this.offRoad = loc.surface === "grass";
    this.s = loc.s; this.lateral = loc.lateral;
    if (loc.onRoad && Math.abs(loc.lateral) < loc.halfWidth * 0.95) this._lastGoodS = loc.s;

    // boost pad (edge-triggered)
    if (loc.boost) { if (!this._padLatch) { this._padLatch = true; this.boost(1.0, 1.4); this._emit("pad"); } }
    else this._padLatch = false;

    // decompose velocity
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    let vf = v.x * fx + v.z * fz;
    let vl = v.x * rx + v.z * rz;

    // controls
    const throttle = live ? clamp(inp.throttle, 0, 1) : 0;
    const brake = live ? clamp(inp.brake, 0, 1) : 0;
    const steerIn = live ? clamp(inp.steer, -1, 1) : 0;
    const driftIn = live && !!inp.drift;
    if (this.locked) this.rev += (clamp(inp.throttle, 0, 1) - this.rev) * Math.min(1, 8 * dt); else this.rev = 0;

    // steering smoothing
    const rate = (Math.abs(steerIn) > Math.abs(this.steerAmount) && Math.sign(steerIn) === Math.sign(this.steerAmount || steerIn)) ? T.steerRise : T.steerFall;
    this.steerAmount += (steerIn - this.steerAmount) * Math.min(1, rate * dt);
    const steer = this.steerAmount;

    // ---- drift state machine
    if (driftIn && !this._prevDrift) this._driftArm = T.driftArmTime;
    if (!this.drifting) {
      if (driftIn && this._driftArm > 0 && Math.abs(steer) > 0.2 && vf > T.driftMinSpeed) {
        this.drifting = true; this.driftDir = Math.sign(steer); this.driftCharge = 0; this._level = 0;
        this._hop = 0; this._driftArm = 0;
      }
    } else if (!driftIn || vf < T.driftEndSpeed || spinning) {
      this._cancelDrift(!spinning);
    }
    this._prevDrift = driftIn;

    // ---- longitudinal
    let mult = this.surface === "grass" ? T.grassTop : (this.surface === "kerb" ? T.kerbTop : 1);
    const boosting = this.boostTime > 0;
    if (this.onWall) mult *= T.wallTop;
    if (boosting) mult = Math.max(mult, 0.9);
    let top = this.maxSpeed * this.speedScale * mult * (1 + T.boostTopGain * this.boostStrength);
    if (this.drifting && !boosting) top *= T.driftTopMul;
    top *= clamp(1 - this._fwdSlope * T.slopeSpeed, T.slopeMin, T.slopeMax);
    const A = this.accelBase * this.speedScale;
    const thr = boosting && live ? 1 : throttle;

    if (spinning) {
      vf *= Math.exp(-T.spinDecay * dt);
    } else if (brake > 0.1 && vf > 1) {
      vf = Math.max(0, vf - T.brakeDecel * brake * dt);
    } else if (brake > 0.1) {
      const rtop = -this.maxSpeed * T.reverseFrac;
      vf = Math.max(rtop, vf - T.reverseAccel * brake * dt);
    } else if (thr > 0.05) {
      if (vf < 0) vf = Math.min(0, vf + T.brakeDecel * dt);
      else {
        const target = top * thr;
        if (vf < target) {
          const q = vf / target;
          let a = A * (1 - 0.8 * q * q) * (this.surface === "grass" ? 0.7 : 1);
          if (boosting) a += T.boostAccel * this.boostStrength;
          vf = Math.min(target, vf + a * dt);
        }
      }
    } else {
      const d = (T.coastDecel + T.coastDrag * Math.abs(vf)) * dt;
      vf = Math.abs(vf) <= d ? 0 : vf - Math.sign(vf) * d;
    }
    if (vf > top) vf = Math.max(top, vf - (vf - top) * (this.offRoad ? T.grassDrag : (boosting ? 0.5 : 1.3)) * dt - 0.5 * dt);

    // ---- steering / yaw
    const aspd = Math.abs(vf);
    const lowF = Math.pow(clamp(aspd / 5, 0, 1), 0.7);
    const hiF = 1 - (1 - T.turnHighSpeedFactor) * clamp(aspd / this.maxSpeed, 0, 1);
    let yaw = 0;  // + = turn right
    if (this.drifting) {
      const align = steer * this.driftDir;   // -1..1
      const k = T.driftTurn + (align >= 0 ? T.driftTurnIn : T.driftTurnOut) * align;
      yaw = this.driftDir * (this.turnRate * 1.05) * k * Math.min(1, aspd / 18);
      // charge
      const prevLvl = Math.floor(this.driftCharge);
      this.driftCharge = Math.min(3.0, this.driftCharge + T.driftChargeRate * (0.65 + 0.35 * Math.max(0, align)) * dt);
      const lvl = Math.floor(this.driftCharge);
      if (lvl > prevLvl && lvl >= 1) { this._level = lvl; this._emit("driftlevel", lvl); }
    } else {
      yaw = steer * this.turnRate * lowF * hiF * (vf < 0 ? -1 : 1);
    }
    if (this.offRoad) yaw *= 0.95;
    this.heading -= yaw * dt;
    if (this.heading > Math.PI || this.heading < -Math.PI) this.heading = wrapPi(this.heading);

    // re-decompose in the new heading frame (rotates the velocity relative to the body)
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    const nrx = -nfz, nrz = nfx;
    // velocity vector keeps its world direction: recompute components from the old vector with new basis,
    // but apply the longitudinal change computed above
    const oldF = v.x * nfx + v.z * nfz;
    const dvf = vf - (v.x * fx + v.z * fz);
    let nvf = oldF + dvf;
    let nvl = v.x * nrx + v.z * nrz;

    // ---- lateral grip
    let grip = this.drifting ? T.driftGrip : this.grip;
    if (this.offRoad) grip *= T.grassGrip;
    if (spinning) grip = 3;
    const before = nvl;
    nvl *= Math.exp(-grip * dt);
    if (!spinning && Math.abs(nvf) > 0.5) {
      // grip rotates velocity toward the heading (mostly conserves speed)
      const e = (this.drifting ? 1 : T.gripConvert) * (before * before - nvl * nvl);
      nvf = Math.sign(nvf) * Math.sqrt(nvf * nvf + e);
    }
    this.slip = nvl;

    v.x = nfx * nvf + nrx * nvl;
    v.z = nfz * nvf + nrz * nvl;
    this.speed = nvf;

    // ---- integrate
    this.position.x += v.x * dt; this.position.z += v.z * dt;

    // ---- track query + walls
    const nl = track.locate(this.position, this._hint);
    this._loc = nl; this._hint = nl.s;
    this.s = nl.s; this.lateral = nl.lateral;
    const wd = nl.wallDist - this.radius;
    if (Math.abs(nl.lateral) > wd) this._wall(track, nl, wd, dt);
    this._vertical(dt, nl, track);

    // ---- stuck detection
    if (!this.locked && !spinning && (inp.throttle > 0.5 || inp.brake > 0.5) && Math.abs(this.speed) < 1.5) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt * 2);
    if (this.stuckTime > T.stuckRespawn) this.respawn(track);

    this._syncMesh(dt);
  }

  _groundY(loc, dt, snap) {
    const gy = loc.y || 0;
    if (snap || Math.abs(gy - this._prevGround) > T.snapJump) {
      this._prevGround = gy; this.position.y = gy; this._by = gy; this._vyb = 0; this.grounded = true; this.airTime = 0;
      return gy;
    }
    return gy;
  }

  // Height: ground-locked, with ballistic airtime when the road falls away faster than gravity.
  _vertical(dt, loc, track) {
    const gy = this._groundY(loc, dt, false);
    const gvy = clamp((gy - this._prevGround) / dt, -25, 25);
    this._prevGround = gy;
    this._vyb -= T.gravity * dt; this._by += this._vyb * dt;
    if (this._by <= gy) {
      if (this.airTime > 0.12) this._emit("land", this.airTime);
      this.airTime = 0; this.grounded = true;
      this._by = gy; this._vyb = gvy;
    } else {
      if (this._by - gy > T.maxAir) { this._by = gy + T.maxAir; this._vyb = Math.min(this._vyb, 0); }
      if (this._by - gy > T.airEps) { this.grounded = false; this.airTime += dt; }
    }
    this.position.y = this._by;
    // surface orientation
    let tp = 0, tr = 0;
    const sm = track.sample(loc.s), n = sm.normal;
    if (n && n.y > 0.2) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const fs = -(n.x * fx + n.z * fz) / n.y, rs = -(n.x * -fz + n.z * fx) / n.y;
      this._fwdSlope = fs;
      tp = -Math.atan(fs); tr = -Math.atan(rs);
    } else this._fwdSlope = 0;
    if (!this.grounded) { tp = -Math.atan(this._vyb / Math.max(8, Math.abs(this.speed))) * 0.8; tr *= 0.3; }
    const k = Math.min(1, 14 * dt);
    this._sp += (tp - this._sp) * k; this._sr += (tr - this._sr) * k;
  }

  _wall(track, loc, wd, dt) {
    const side = loc.lateral > 0 ? 1 : -1;
    const sm = track.sample(loc.s);
    const rx = sm.right.x, rz = sm.right.z, tx = sm.tangent.x, tz = sm.tangent.z;
    const depth = Math.abs(loc.lateral) - wd;
    this.position.x -= rx * side * depth; this.position.z -= rz * side * depth;
    loc.lateral = side * wd;
    const nx = -side * rx, nz = -side * rz;       // inward normal
    const v = this.velocity;
    const vn = v.x * nx + v.z * nz;
    if (vn < 0) {
      const impact = -vn;
      v.x -= (1 + T.wallRestitution) * vn * nx; v.z -= (1 + T.wallRestitution) * vn * nz;
      const keep = Math.max(0.7, 1 - impact * T.wallScrub);
      const nn = v.x * nx + v.z * nz;
      v.x = nx * nn + (v.x - nx * nn) * keep; v.z = nz * nn + (v.z - nz * nn) * keep;
      if (impact > 2.5 && this._wallCool <= 0) { this._wallCool = 0.25; this._emit("wall", impact); }
      if (this.drifting && impact > 6) this._cancelDrift(false);
    }
    // sliding friction + steer nose along the wall so we never pin
    const f = Math.exp(-T.wallFriction * dt);
    const dn = v.x * nx + v.z * nz;
    v.x = nx * dn + (v.x - nx * dn) * f; v.z = nz * dn + (v.z - nz * dn) * f;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    if (fx * nx + fz * nz < 0.2) {
      // steer the nose along the wall, preferring the track's forward direction
      let ty = Math.atan2(tx, tz);
      if (fx * tx + fz * tz < -0.35) ty += Math.PI;
      const diff = wrapPi(ty - this.heading);
      this.heading = wrapPi(this.heading + diff * Math.min(1, T.wallAlign * dt));
    }
    this.onWall = true; this._wallTimer = 0.15;
    this.speed = v.x * Math.sin(this.heading) + v.z * Math.cos(this.heading);
  }

  // ------------------------------------------------ visuals
  _syncMesh(dt) {
    const m = this.mesh, body = this._body;
    m.position.copy(this.position);
    m.rotation.set(this._sp, this.heading, this._sr);
    const sf = clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1.2);
    this._driftVis += ((this.drifting ? 1 : 0) - this._driftVis) * Math.min(1, 10 * Math.max(dt, 0.001));
    let yawOff = -this.driftDir * 0.32 * this._driftVis;
    let y = 0;
    if (this.spinTime > 0 || this._spinVis > 0) {
      const p = this._spinVis, e = 1 - (1 - p) * (1 - p);
      yawOff += e * TWO_PI * T.spinTurns;
      y += 0.5 * Math.sin(Math.PI * Math.min(1, p * 1.6));
    }
    if (this._hop >= 0) {
      this._hop += dt / 0.3;
      if (this._hop >= 1) { this._hop = -1; this._emit("land"); }
      else y += 0.38 * 4 * this._hop * (1 - this._hop);
    }
    // roll outward of the turn, pitch with accel
    const rollT = -(this.drifting ? this.driftDir * 0.6 + this.steerAmount * 0.4 : this.steerAmount) * 0.09 * sf;
    this._roll += (rollT - this._roll) * Math.min(1, 8 * Math.max(dt, 0.001));
    const acc = dt > 0 ? (this.speed - this._prevVf) / dt : 0;
    this._prevVf = this.speed;
    const pitchT = clamp(-acc * 0.003, -0.05, 0.05) + (this.onWall ? 0 : 0);
    this._pitch += (pitchT - this._pitch) * Math.min(1, 6 * Math.max(dt, 0.001));
    body.rotation.set(this._pitch, yawOff, this._roll);
    body.position.y = y;
    if (this._shadow) { const s = 1 - Math.min(0.4, y * 0.6); this._shadow.scale.set(s, s, 1); }

    // wheels
    this._wheelRot += this.speed * dt / 0.38;
    const st = -this.steerAmount * 0.45;
    for (const w of this._wheels) {
      if (w.userData.front) w.rotation.y = st;
      w.userData.spin.rotation.x = this._wheelRot;
    }
    this._steerWheel.rotation.z = this.steerAmount * 1.2;
  }

  // ------------------------------------------------ kart-kart collisions
  static collide(karts) {
    const n = karts.length;
    for (let i = 0; i < n; i++) {
      const a = karts[i]; if (a.ghost) continue;
      for (let j = i + 1; j < n; j++) {
        const b = karts[j]; if (b.ghost || Math.abs(a.position.y - b.position.y) > 2.5) continue;
        let dx = a.position.x - b.position.x, dz = a.position.z - b.position.z;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { dx = Math.sin(a.heading + 1.3); dz = Math.cos(a.heading + 1.3); d = 1; }
        const nx = dx / d, nz = dz / d;       // from b to a
        const overlap = rr - d;
        const ma = a.mass, mb = b.mass, tm = ma + mb;
        const pa = mb / tm, pb = ma / tm;
        a.position.x += nx * overlap * pa; a.position.z += nz * overlap * pa;
        b.position.x -= nx * overlap * pb; b.position.z -= nz * overlap * pb;
        const rvn = (a.velocity.x - b.velocity.x) * nx + (a.velocity.z - b.velocity.z) * nz;
        let impact = 0;
        if (rvn < 0) {
          impact = -rvn;
          const jimp = -(1 + T.kartRestitution) * rvn / (1 / ma + 1 / mb);
          a.velocity.x += nx * jimp / ma; a.velocity.z += nz * jimp / ma;
          b.velocity.x -= nx * jimp / mb; b.velocity.z -= nz * jimp / mb;
        } else {
          // already separating but still overlapping: gentle extra push so nobody stays glued
          const push = overlap * 4;
          a.velocity.x += nx * push * pa; a.velocity.z += nz * push * pa;
          b.velocity.x -= nx * push * pb; b.velocity.z -= nz * push * pb;
        }
        a.speed = a.velocity.x * Math.sin(a.heading) + a.velocity.z * Math.cos(a.heading);
        b.speed = b.velocity.x * Math.sin(b.heading) + b.velocity.z * Math.cos(b.heading);
        if (impact > 1.5) {
          if (a.drifting && impact > 7) a._cancelDrift(false);
          if (b.drifting && impact > 7) b._cancelDrift(false);
          a._emit("bump", b, impact); b._emit("bump", a, impact);
        }
      }
    }
  }
}
