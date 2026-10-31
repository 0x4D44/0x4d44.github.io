// Camera rig: chase / far / bumper / bonnet / cinematic / replay.
// Pure maths helpers are exported (no THREE) so they can be unit-tested in Node.
import { clamp, damp, lerp, wrapPi, smoothstep } from "../core/mathx.mjs";
import { makeRng } from "../core/rng.mjs";
import { eyePoints } from "./cars/profiles.mjs";

export const CAMERA_MODES = ["chase", "far", "bumper", "bonnet", "cockpit", "cinematic", "replay"];

/** Critically-ish damped spring. Mutates and returns [x, v] through `out` ({x,v}). Sub-steps for stability. */
export function springStep(out, target, omega, zeta, dt) {
  if (!(dt > 0)) return out;
  let n = Math.max(1, Math.ceil((dt * omega) / 0.35));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -2 * zeta * omega * out.v - omega * omega * (out.x - target);
    out.v += a * h;
    out.x += out.v * h;
  }
  return out;
}

/** Speed-dependent field of view (degrees). */
export function speedFov(baseFov, speedKmh, boost = 0) {
  return baseFov + clamp(speedKmh, 0, 260) * 0.085 + boost;
}

/** Chase distance / height as the car speeds up (the camera pulls back and rises a touch). */
export function chaseArm(speedKmh, far = false, aspect = 1.78) {
  const t = clamp(speedKmh / 200, 0, 1), p = portraitK(aspect);
  const a = far ? { dist: lerp(11, 15, t), height: lerp(4.4, 5.6, t) } : { dist: lerp(6.4, 6.9, t), height: lerp(2.0, 2.2, t) };
  return { dist: a.dist * (1 + 0.1 * p), height: a.height * (1 + 0.35 * p) };
}

/** 0 for landscape / desktop, rising to 1 for tall portrait phones (aspect <= ~0.5): drives the portrait framing. */
export function portraitK(aspect) { return Number.isFinite(aspect) ? clamp((0.85 - aspect) / 0.37, 0, 1) : 0; }

/** Heading the chase camera wants: blend between body yaw and velocity direction (more lag on slides). */
export function chaseHeadingTarget(yaw, velDir, speed, slideBlend = 0.55) {
  if (speed < 4) return yaw;
  const k = slideBlend * smoothstep(4, 12, speed);
  return yaw + wrapPi(velDir - yaw) * k;
}

/** Minimum fraction of the chase arm that terrain avoidance may use. Below this the camera is lifted instead. */
export const MIN_ARM_FRAC = 0.75;
export const CAM_GROUND_CLEAR = 0.45;
export const CAM_BODY_MARGIN = 0.4;

/**
 * Pull a desired camera position toward the target until it clears the terrain, but never below MIN_ARM_FRAC of the
 * arm; the remaining clearance comes from lifting the camera. `out` holds the desired position on entry and the
 * corrected one on exit. Returns the arm fraction used (1 = untouched).
 */
export function avoidTerrain(heightAt, tx, ty, tz, out, minClear = 0.6, samples = 6) {
  let frac = 1;
  const cx = out.x, cy = out.y, cz = out.z;
  for (let i = samples; i >= 1; i--) {
    const f = i / samples;
    const x = tx + (cx - tx) * f, z = tz + (cz - tz) * f, y = ty + (cy - ty) * f;
    if (y < heightAt(x, z) + minClear * (0.4 + 0.6 * f)) frac = Math.min(frac, (i - 1) / samples);
  }
  frac = Math.max(frac, MIN_ARM_FRAC);
  out.x = tx + (cx - tx) * frac;
  out.z = tz + (cz - tz) * frac;
  out.y = ty + (cy - ty) * frac;
  // lift so the straight line camera->target stays above the ground
  let lift = 0;
  for (let i = 1; i <= samples; i++) {
    const t = i / (samples + 1); // 0 at target .. 1 at camera
    const x = tx + (out.x - tx) * t, z = tz + (out.z - tz) * t;
    const need = ty + (heightAt(x, z) + CAM_GROUND_CLEAR - ty) / Math.max(t, 0.3);
    if (need - out.y > lift) lift = need - out.y;
  }
  out.y += Math.min(lift, 6);
  const floor = heightAt(out.x, out.z) + minClear;
  if (out.y < floor) out.y = floor;
  return frac;
}

/**
 * Hard constraints on a camera position (pure; applied to the desired point AND the sprung point, so spring lag never
 * lets the lens into rock, ground or the car): above terrain, outside rock volumes, outside the car box + margin.
 * car = { x, y (ground under the car), z, yaw, hl, hw, top }. Mutates and returns `p` ({x,y,z}).
 */
export function enforceCameraClear(p, heightAt, obstaclesNear, car, scratch = []) {
  for (let pass = 0; pass < 8; pass++) {
    if (obstaclesNear) {
      const list = obstaclesNear(p.x, p.z, 0.8, scratch);
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        const y0 = o.y0 ?? -Infinity, y1 = o.y1 ?? Infinity;
        if (p.y < y0 - 0.3 || p.y > y1 + 0.5) continue;
        const dx = p.x - o.x, dz = p.z - o.z, rr = o.r + 0.7;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr) {
          let ux, uz;
          const d = Math.sqrt(d2);
          if (d > 1e-4) { ux = dx / d; uz = dz / d; } else { ux = car.x - o.x; uz = car.z - o.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; }
          p.x = o.x + ux * rr; p.z = o.z + uz * rr;
        }
      }
    }
    const h = heightAt(p.x, p.z) + CAM_GROUND_CLEAR;
    if (p.y < h) p.y = h;
    if (car) {
      const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
      const dx = p.x - car.x, dz = p.z - car.z;
      const lf = dx * -sy + dz * -cy; // along forward
      const lr = dx * cy + dz * -sy; // along right
      const hl = car.hl + CAM_BODY_MARGIN, hw = car.hw + CAM_BODY_MARGIN;
      const top = car.y + car.top + CAM_BODY_MARGIN;
      if (Math.abs(lf) < hl && Math.abs(lr) < hw && p.y < top && p.y > car.y - 0.5) {
        const pushF = hl - Math.abs(lf), pushR = hw - Math.abs(lr), pushUp = top - p.y;
        if (pushUp <= Math.min(pushF, pushR) * 0.9 + 0.2) p.y = top;
        else if (pushF <= pushR) {
          const nf = (lf >= 0 ? hl : -hl) + 0.02;
          p.x = car.x + nf * -sy + lr * cy; p.z = car.z + nf * -cy + lr * -sy;
        } else {
          const nr = (lr >= 0 ? hw : -hw) + 0.02;
          p.x = car.x + lf * -sy + nr * cy; p.z = car.z + lf * -cy + nr * -sy;
        }
      }
    }
  }
  return p;
}

/** Distance (m) from point p to the car's (unexpanded) box; used to fade the car when the lens is nearly inside it. */
export function distToCarBox(p, car) {
  const sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
  const dx = p.x - car.x, dz = p.z - car.z;
  const lf = Math.abs(dx * -sy + dz * -cy), lr = Math.abs(dx * cy + dz * -sy);
  const ex = Math.max(0, lr - car.hw), ez = Math.max(0, lf - car.hl);
  const ey = Math.max(0, p.y - (car.y + car.top), car.y - 0.2 - p.y);
  return Math.hypot(ex, ez, ey);
}

/** Car visibility (0..1) for a lens at distance d from the car box: fades out inside ~1.2 m. */
export function carFadeForDistance(d) { return smoothstep(0.35, 1.2, d); }

/**
 * Pure chase / far camera placement. o: { heightAt, obstaclesNear?, car {x,y,z,yaw,hl,hw,top}, head, kmh, far, pitch }.
 * Writes the desired position into `out` ({x,y,z}) and returns it.
 */
export function placeChaseCamera(o, out = { x: 0, y: 0, z: 0 }) {
  const arm = chaseArm(o.kmh, !!o.far, o.aspect);
  const fx = -Math.sin(o.head), fz = -Math.cos(o.head);
  const tx = o.car.x, tz = o.car.z, ty = o.car.y + 0.9;
  out.x = tx - fx * arm.dist;
  out.z = tz - fz * arm.dist;
  out.y = ty + arm.height - (o.pitch || 0) * 1.5;
  if (o.heightAt) {
    avoidTerrain(o.heightAt, tx, ty, tz, out, 0.7);
    enforceCameraClear(out, o.heightAt, o.obstaclesNear || null, o.car);
  }
  return out;
}

/**
 * Keep the chase lens at least max(4.8 m, 90 % of the arm) from the car horizontally, so the wing never fills the frame
 * at low speed, after a respawn or while the spring catches up. Pushes straight out from the car (or straight back along
 * the heading when the lens is on top of it). Mutates and returns `p` ({x,y,z}).
 */
export function enforceMinChaseDistance(p, cx, cz, armDist, fx, fz) {
  const minD = Math.max(4.8, armDist * 0.9), px = p.x - cx, pz = p.z - cz, hd = Math.hypot(px, pz);
  if (hd < minD) {
    const ux = hd > 0.05 ? px / hd : -fx, uz = hd > 0.05 ? pz / hd : -fz;
    p.x = cx + ux * minD; p.z = cz + uz * minD;
  }
  return p;
}

/** Crash / landing shake amplitude (0..1) from the events array; updates and returns the new decayed value. */
export function shakeFromEvents(current, events, dt) {
  let s = current * Math.exp(-3.2 * dt);
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.t === "impact") s = Math.max(s, 0.25 + 0.75 * clamp(e.strength, 0, 1));
    else if (e.t === "landing") s = Math.max(s, 0.15 + 0.45 * clamp(e.strength, 0, 1));
    else if (e.t === "bottomout") s = Math.max(s, 0.1 + 0.3 * clamp(e.strength, 0, 1));
  }
  return clamp(s, 0, 1);
}

/** Cinematic shot scheduler (pure). Picks the next shot type and duration. */
export function nextShot(rng, replay, prev) {
  const types = replay ? ["chase", "trackside", "heli", "trackside", "far", "chase"] : ["trackside", "heli", "trackside", "chase", "cabin", "far"];
  let t = rng.pick(types);
  if (t === prev) t = rng.pick(types);
  if (t === "cabin" && !prev) t = "trackside"; // never open on a cockpit view
  return { type: t, dur: rng.range(3.2, 6.5), side: rng.sign() };
}

const BODY = { CABIN: 0, BUMPER: 1, BONNET: 2 };

export function createCameraRig(THREE, camera) {
  const rng = makeRng("camera-rig");
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, "YXZ");
  const Qc = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  let mode = "chase";
  let spec = null;
  let chasePrev = null;
  const sx = { x: 0, v: 0 }, sy = { x: 0, v: 0 }, sz = { x: 0, v: 0 };
  let head = 0, lookBias = 0, fov = 62, shake = 0, thump = { x: 0, v: 0 }, roll = 0, time = 0;
  let baseOff = null, lastGroundY = 0, headInit = false, inited = false;
  const look = { x: 0, y: 0, z: 0 };
  const des = { x: 0, y: 0, z: 0 }, cp = { x: 0, y: 0, z: 0 };
  const carBox = { x: 0, y: 0, z: 0, yaw: 0, hl: 2.3, hw: 1.0, top: 1.5 };
  let carFade = 1;
  const shot = { type: "chase", t: 0, dur: 4, ax: 0, ay: 0, az: 0, orbit: 0, side: 1, prev: "" };
  let fpQ = new THREE.Quaternion(), fpInit = false;
  let eye = { bumper: [0, 0.55, -2.35], bonnet: [0, 1.15, -0.3], cockpit: [0.34, 1.12, -0.05], chaseAnchor: 0 };
  const api = {
    get mode() { return mode; },
    get fov() { return fov; },
    /** 0..1 car visibility the renderer should apply (fades the car when the lens is within ~1.2 m of it). */
    get carFade() { return carFade; },
    modes: CAMERA_MODES,
    setCarSpec(s) {
      spec = s;
      if (!s) return;
      carBox.hl = (s.length || 4.2) * 0.6; carBox.hw = (s.width || 1.75) / 2; carBox.top = (s.height || 1.4) + 0.1;
      const e = eyePoints(s);
      eye.bumper = e.bumper;
      eye.bonnet = e.bonnet; eye.cockpit = e.cockpit;
      baseOff = baseOff ?? (s.cgHeight || 0.5);
    },
    setMode(m) {
      if (!CAMERA_MODES.includes(m)) return;
      mode = m;
      shot.t = 99;
      fpInit = false; inited = false; headInit = false; chasePrev = null;
    },
    cycle() {
      api.setMode(CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length]);
      return mode;
    },
    /** Which view mode the car visual should use for the current camera mode. */
    carViewMode() {
      const m = mode === "cinematic" || mode === "replay" ? (shot.type === "cabin" ? "cockpit" : "exterior") : mode;
      return m === "bumper" ? "bumper" : m === "bonnet" ? "bonnet" : m === "cockpit" ? "cockpit" : "exterior";
    },
    snap(state, stage) { run(1 / 60, state, stage || lastStage, {}, true); },
    update(dt, state, stage, opts = {}) { run(dt, state, stage, opts, false); },
  };
  let lastStage = null;

  function groundRef(st) {
    const w = st.wheels;
    let sum = 0, n = 0;
    if (w) for (let i = 0; i < 4; i++) if (w[i] && w[i].grounded && Number.isFinite(w[i].contactY)) { sum += w[i].contactY; n++; }
    if (n >= 3) {
      const d = st.y - sum / n;
      // Ignore stale contact data (the frame after a teleport / respawn the wheels still hold the old place: d can be tens of
      // metres) and never let it drag the first-person eye off the car. Accept only a believable CoM-to-ground height.
      const ref = baseOff ?? (spec && spec.cgHeight) ?? 0.5;
      if (Math.abs(d - ref) < 0.4) baseOff = baseOff === null ? d : lerp(baseOff, d, 0.1);
      else if (baseOff === null && d > 0.15 && d < 1.2) baseOff = d;
    }
    return st.y - (baseOff ?? 0);
  }

  function run(dt, st, stage, opts, snapNow) {
    if (!st) return;
    lastStage = stage || lastStage;
    if (!inited) { inited = true; snapNow = true; }
    dt = clamp(dt, 0, 0.1);
    time += dt;
    const heightAt = stage && stage.heightAt ? (x, z) => stage.heightAt(x, z) : null;
    const obstaclesNear = stage && stage.obstaclesNear ? stage.obstaclesNear : null;
    const spd = Math.abs(st.speed || 0), kmh = st.speedKmh ?? spd * 3.6;
    shake = Math.max(shakeFromEvents(shake, st.events || [], dt), opts.shake || 0);
    // landing thump: kick the vertical offset spring
    if (st.events) for (let i = 0; i < st.events.length; i++) {
      const e = st.events[i];
      if (e.t === "landing") thump.v -= 1.4 * clamp(e.strength, 0, 1);
      else if (e.t === "impact") thump.v -= 0.6 * clamp(e.strength, 0, 1);
    }
    springStep(thump, 0, 14, 0.35, dt);
    const gy = groundRef(st);
    lastGroundY = gy;
    const velDir = Math.atan2(-(st.vx || 0), -(st.vz || 0));
    const yaw = st.yaw || 0;
    let eff = mode;
    if (mode === "cinematic" || mode === "replay") {
      shot.t += dt;
      const cabinGone = false;
      const carVsAnchor = (shot.type === "trackside") ? ((st.x - shot.ax) * -Math.sin(velDir) + (st.z - shot.az) * -Math.cos(velDir)) : 0;
      if (shot.t > shot.dur || carVsAnchor > 28 || snapNow && shot.t > 90) {
        const n = nextShot(rng, mode === "replay", shot.prev);
        shot.prev = shot.type; shot.type = n.type; shot.dur = n.dur; shot.side = n.side; shot.t = 0;
        const fx = -Math.sin(velDir), fz = -Math.cos(velDir);
        const ahead = 35 + spd * 1.4;
        const lat = shot.side * rng.range(6, 11);
        shot.ax = st.x + fx * ahead - fz * lat;
        shot.az = st.z + fz * ahead + fx * lat;
        shot.ay = (heightAt ? heightAt(shot.ax, shot.az) : gy) + rng.range(1.1, 2.6);
        shot.orbit = rng.range(0, 6.28);
        snapNow = snapNow || shot.type === "heli" || shot.type === "trackside";
      }
      eff = shot.type === "cabin" ? "cockpit" : shot.type === "chase" ? "chase" : shot.type === "far" ? "far" : shot.type;
    }
    const lowShake = shake * shake;
    let tFov = 0;

    if (eff === "chase" || eff === "far") {
      const aspect = camera.aspect || 1.78, pk = portraitK(aspect);
      const arm = chaseArm(kmh, eff === "far", aspect);
      const ht = chaseHeadingTarget(yaw, velDir, spd);
      if (snapNow || !headInit) { head = ht; headInit = true; }
      else head = head + wrapPi(ht - head) * (1 - Math.exp(-4.2 * dt));
      const fx = -Math.sin(head), fz = -Math.cos(head);
      const lookAhead = (eff === "far" ? 5 : 7 + spd * 0.12) * (1 + 1.5 * pk);
      const tx = st.x, tz = st.z;
      const bias = clamp((st.yawRate || 0) * 0.55, -0.8, 0.8);
      lookBias = damp(lookBias, bias, 3, dt);
      carBox.x = st.x; carBox.y = gy; carBox.z = st.z; carBox.yaw = yaw;
      placeChaseCamera({ heightAt, obstaclesNear, car: carBox, head, kmh, far: eff === "far", pitch: st.pitch, aspect }, des);
      if (snapNow) { sx.x = des.x; sy.x = des.y; sz.x = des.z; sx.v = sy.v = sz.v = 0; }
      else {
        // Springs smooth the pose RELATIVE to the car: moving the spring state with the car removes the speed-proportional
        // lag (0.2 s x speed = 12 m at 216 km/h) that made the lens trail far behind at speed and sit close at a standstill.
        if (chasePrev) { sx.x += st.x - chasePrev.x; sz.x += st.z - chasePrev.z; }
        springStep(sx, des.x, 10, 1, dt); springStep(sz, des.z, 10, 1, dt); springStep(sy, des.y, 7, 1, dt);
      }
      if (!chasePrev) chasePrev = { x: 0, z: 0 };
      chasePrev.x = st.x; chasePrev.z = st.z;
      camera.position.set(sx.x, sy.x + thump.x * 0.3 + shakeN(0) * lowShake * 0.35, sz.x);
      // Keep a minimum horizontal distance (low speed, respawn, slow spring catch-up) so the wing never fills the frame.
      enforceMinChaseDistance(camera.position, st.x, st.z, arm.dist, fx, fz);
      if (heightAt) {
        cp.x = camera.position.x; cp.y = camera.position.y; cp.z = camera.position.z;
        enforceCameraClear(cp, heightAt, obstaclesNear, carBox);
        camera.position.set(cp.x, cp.y, cp.z);
      }
      carFade = damp(carFade, carFadeForDistance(distToCarBox(camera.position, carBox)), 12, dt);
      const rx = Math.cos(head), rz = -Math.sin(head);
      look.x = tx + fx * lookAhead + rx * lookBias * lookAhead * 0.5;
      look.z = tz + fz * lookAhead + rz * lookBias * lookAhead * 0.5;
      look.y = gy + 1.1;
      if (pk > 0) {
        // Portrait: seat the car in the lower third (ndc y about -0.45) so the road ahead fills the upper two thirds. The optical
        // axis is pitched to the car's own depression angle minus the angle that lifts it to that frame position.
        const cdx = st.x - camera.position.x, cdz = st.z - camera.position.z, D = Math.max(1, Math.hypot(cdx, cdz));
        const thC = Math.atan2(camera.position.y - (gy + 0.8), D);
        const halfT = Math.tan(((eff === "far" ? 50 : 62) + 26 * pk) * Math.PI / 360);
        const phi = thC - Math.atan(0.32 * halfT * pk);
        const D2 = Math.max(1, Math.hypot(look.x - camera.position.x, look.z - camera.position.z));
        look.y = camera.position.y - Math.tan(phi) * D2;
      }
      camera.up.set(0, 1, 0);
      camera.lookAt(look.x, look.y, look.z);
      roll = damp(roll, clamp(-(st.yawRate || 0) * 0.025 * Math.min(1, spd / 20), -0.08, 0.08), 3, dt);
      camera.rotateZ(roll + shakeN(1) * lowShake * 0.03);
      tFov = (eff === "far" ? speedFov(50, kmh, opts.fovBoost || 0) : speedFov(62, kmh * 0.4, opts.fovBoost || 0)) + 26 * pk; // portrait: taller vertical FOV keeps the horizontal field from becoming a telephoto slit // chase: gentle widening so the car's size stays steady
    } else if (eff === "bumper" || eff === "bonnet" || eff === "cockpit") {
      E.set(st.pitch || 0, yaw, -(st.roll || 0), "YXZ");
      Q.setFromEuler(E);
      if (!fpInit || snapNow) { fpQ.copy(Q); fpInit = true; } else fpQ.slerp(Q, 1 - Math.exp(-30 * dt));
      const o = eye[eff];
      const bobA = eff === "bumper" ? 0.5 : 1;
      const rough = roughness(st);
      const bobY = (Math.sin(time * 17 + 1.3) * 0.0035 + Math.sin(time * 41) * 0.0018) * Math.min(1, spd / 25) * (0.5 + rough * 2.5) * bobA;
      const bobX = Math.sin(time * 13.1) * 0.0025 * Math.min(1, spd / 25) * (0.5 + rough * 2) * bobA;
      V.set(o[0] + bobX + shakeN(2) * lowShake * 0.03, o[1] - (baseOff ?? 0.5) + bobY + thump.x * 0.05 + shakeN(3) * lowShake * 0.03, o[2]);
      V.applyQuaternion(fpQ);
      camera.position.set(st.x + V.x, st.y + V.y, st.z + V.z);
      Qc.copy(fpQ);
      // steering-wheel lean and look-into-corner
      dummy.quaternion.identity();
      E.set(0.0, -(st.steerAngle || 0) * (eff === "cockpit" ? 0.22 : eff === "bonnet" ? 0.12 : 0.1), (st.steerAngle || 0) * 0.025 + shakeN(4) * lowShake * 0.02, "YXZ");
      Q.setFromEuler(E);
      Qc.multiply(Q);
      camera.quaternion.copy(Qc);
      tFov = (eff === "bumper" ? 76 : eff === "bonnet" ? 72 : 70) + clamp(kmh, 0, 240) * 0.05 + (opts.fovBoost || 0);
      head = yaw;
    } else if (eff === "trackside") {
      V2.set(shot.ax, shot.ay, shot.az);
      camera.position.copy(V2);
      const dx = st.x - shot.ax, dz = st.z - shot.az, dy = gy + 0.8 - shot.ay;
      look.x = damp(look.x, st.x + (st.vx || 0) * 0.15, 8, dt); look.y = gy + 0.8; look.z = damp(look.z, st.z + (st.vz || 0) * 0.15, 8, dt);
      if (snapNow) { look.x = st.x; look.z = st.z; }
      camera.up.set(0, 1, 0);
      camera.lookAt(look.x, look.y, look.z);
      const dist = Math.hypot(dx, dz, dy);
      tFov = clamp(2 * Math.atan(6 / Math.max(dist, 8)) * 57.3, 18, 55) + (opts.fovBoost || 0);
      camera.rotateZ(shakeN(5) * lowShake * 0.02);
      head = yaw;
    } else if (eff === "heli") {
      shot.orbit += dt * 0.22 * shot.side;
      des.x = st.x + Math.sin(shot.orbit) * 26 + (st.vx || 0) * 0.3;
      des.z = st.z + Math.cos(shot.orbit) * 26 + (st.vz || 0) * 0.3;
      des.y = gy + 15 + Math.sin(shot.orbit * 0.7) * 3;
      if (heightAt) { const hh = heightAt(des.x, des.z) + 8; if (des.y < hh) des.y = hh; }
      if (snapNow) { sx.x = des.x; sy.x = des.y; sz.x = des.z; sx.v = sy.v = sz.v = 0; }
      else { springStep(sx, des.x, 3, 1, dt); springStep(sy, des.y, 2, 1, dt); springStep(sz, des.z, 3, 1, dt); }
      camera.position.set(sx.x, sy.x, sz.x);
      camera.up.set(0, 1, 0);
      camera.lookAt(st.x, gy + 0.8, st.z);
      tFov = 36 + (opts.fovBoost || 0);
      head = yaw;
    }
    fov = snapNow ? tFov : damp(fov, tFov, 6, dt);
    // First-person lenses sit inside the car: the default 0.2 m near plane slices the steering wheel, dash and bonnet lip.
    const wantNear = eff === "bumper" || eff === "bonnet" || eff === "cockpit" ? 0.06 : 0.2;
    if (Math.abs(camera.fov - fov) > 0.01 || camera.near !== wantNear) { camera.fov = fov; camera.near = wantNear; camera.updateProjectionMatrix(); }
  }

  // cheap deterministic noise (no alloc)
  function shakeN(k) { return Math.sin(time * (31 + k * 7.3) + k * 12.9) * 0.6 + Math.sin(time * (57 + k * 3.1) + k * 4.1) * 0.4; }
  function roughness(st) {
    const w = st.wheels;
    if (!w) return 0;
    let r = 0;
    for (let i = 0; i < 4; i++) r += Math.abs(w[i].compression - 0.5);
    return clamp(r * 0.5, 0, 1);
  }
  return api;
}
