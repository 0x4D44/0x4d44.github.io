// Replay recorder / player. Pure (no DOM, no THREE).
// Records the render-relevant part of Vehicle.state at ~20 Hz into compact Float32 frames
// (pose, wheels, drivetrain read-outs, damage) and plays it back by interpolating into a target
// state object of the same shape (a spare Vehicle's state). Ghosts reuse the pose part.

export const REC_HZ = 20;
const WHEEL_KEYS = ["x", "y", "z", "contactX", "contactY", "contactZ", "steer", "spin", "compression", "susp", "skid", "surf", "load", "slipRatio", "slipAngle"];
const BODY_KEYS = ["x", "y", "z", "yaw", "pitch", "roll", "vx", "vy", "vz", "speed", "speedKmh", "lateralSpeed", "yawRate", "slideAngle", "rpm", "gear", "clutch", "boost", "throttle", "brake", "steerAngle", "s", "lat"];
const FLAG_KEYS = ["airborne", "onRoad", "flipped"];
const DMG_LEN = 17;
const WL = WHEEL_KEYS.length + 1; // + grounded flag
export const FRAME_LEN = 1 + BODY_KEYS.length + FLAG_KEYS.length + 4 * WL + DMG_LEN;
const O_BODY = 1, O_FLAG = O_BODY + BODY_KEYS.length, O_WHEEL = O_FLAG + FLAG_KEYS.length, O_DMG = O_WHEEL + 4 * WL;
const YAW = BODY_KEYS.indexOf("yaw");
const DISCRETE = new Set([BODY_KEYS.indexOf("gear")]);

export function packFrame(out, t, st) {
  out[0] = t;
  for (let i = 0; i < BODY_KEYS.length; i++) out[O_BODY + i] = st[BODY_KEYS[i]] || 0;
  for (let i = 0; i < FLAG_KEYS.length; i++) out[O_FLAG + i] = st[FLAG_KEYS[i]] ? 1 : 0;
  for (let w = 0; w < 4; w++) {
    const wh = st.wheels ? st.wheels[w] : null;
    const o = O_WHEEL + w * WL;
    for (let k = 0; k < WHEEL_KEYS.length; k++) out[o + k] = wh ? wh[WHEEL_KEYS[k]] || 0 : 0;
    out[o + WHEEL_KEYS.length] = wh && wh.grounded ? 1 : 0;
  }
  const d = st.damage;
  if (d) {
    let k = O_DMG;
    out[k++] = d.engine; out[k++] = d.gearbox; out[k++] = d.steering; out[k++] = d.radiator || 0; out[k++] = d.total;
    for (let i = 0; i < 4; i++) out[k++] = d.suspension[i];
    for (let i = 0; i < 4; i++) out[k++] = d.tyres[i];
    out[k++] = d.body.front; out[k++] = d.body.rear; out[k++] = d.body.left; out[k++] = d.body.right;
  }
  return out;
}

const wrapDelta = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** Write frame data (interpolated between A and B by f) into a vehicle-shaped `st`. */
export function unpackFrame(st, A, B, f) {
  const L = (i) => A[i] + (B[i] - A[i]) * f;
  for (let i = 0; i < BODY_KEYS.length; i++) {
    const idx = O_BODY + i;
    st[BODY_KEYS[i]] = DISCRETE.has(i) ? A[idx] : i === YAW ? A[idx] + wrapDelta(A[idx], B[idx]) * f : L(idx);
  }
  for (let i = 0; i < FLAG_KEYS.length; i++) st[FLAG_KEYS[i]] = A[O_FLAG + i] > 0.5;
  for (let w = 0; w < 4; w++) {
    const wh = st.wheels[w];
    const o = O_WHEEL + w * WL;
    for (let k = 0; k < WHEEL_KEYS.length; k++) wh[WHEEL_KEYS[k]] = WHEEL_KEYS[k] === "surf" ? A[o + k] : L(o + k);
    wh.grounded = A[o + WHEEL_KEYS.length] > 0.5;
  }
  const d = st.damage;
  if (d) {
    let k = O_DMG;
    d.engine = A[k++]; d.gearbox = A[k++]; d.steering = A[k++]; d.radiator = A[k++]; d.total = A[k++];
    for (let i = 0; i < 4; i++) d.suspension[i] = A[k++];
    for (let i = 0; i < 4; i++) d.tyres[i] = A[k++];
    d.body.front = A[k++]; d.body.rear = A[k++]; d.body.left = A[k++]; d.body.right = A[k++];
  }
  if (st.events) st.events.length = 0;
  return st;
}

export function createRecorder(maxSeconds = 900) {
  const cap = Math.ceil(maxSeconds * REC_HZ) + 4;
  let buf = new Float32Array(FRAME_LEN * 256);
  let n = 0, acc = 0, t0 = 0;
  const api = {
    get frames() { return n; },
    get duration() { return n > 1 ? (n - 1) / REC_HZ : 0; },
    reset() { n = 0; acc = 0; t0 = 0; },
    /** call once per fixed step with the step dt; samples at REC_HZ */
    step(dt, st, force = false) {
      acc += dt;
      if (n > 0 && acc < 1 / REC_HZ - 1e-9 && !force) return;
      if (n >= cap) return;
      acc = n > 0 ? Math.max(0, acc - 1 / REC_HZ) : 0;
      if ((n + 1) * FRAME_LEN > buf.length) {
        const nb = new Float32Array(buf.length * 2);
        nb.set(buf);
        buf = nb;
      }
      packFrame(buf.subarray(n * FRAME_LEN, (n + 1) * FRAME_LEN), t0, st);
      t0 += 1 / REC_HZ;
      n++;
    },
    finish() { return { n, hz: REC_HZ, data: buf.slice(0, n * FRAME_LEN) }; },
  };
  return api;
}

export function createPlayer(rec, target) {
  const { n, data } = rec;
  const A = new Float32Array(FRAME_LEN), B = new Float32Array(FRAME_LEN);
  const dur = n > 1 ? (n - 1) / REC_HZ : 0;
  return {
    duration: dur,
    /** Pose the target state at time t (seconds). */
    seek(t) {
      if (n === 0) return target;
      t = Math.max(0, Math.min(dur, t));
      const f = t * REC_HZ;
      const i = Math.min(n - 1, Math.floor(f));
      const j = Math.min(n - 1, i + 1);
      A.set(data.subarray(i * FRAME_LEN, (i + 1) * FRAME_LEN));
      B.set(data.subarray(j * FRAME_LEN, (j + 1) * FRAME_LEN));
      return unpackFrame(target, A, B, f - i);
    },
  };
}

// ---- ghost: pose only (x,y,z,yaw,pitch,roll) -------------------------------------------------
export const GHOST_STEP = REC_HZ / 10; // keep every 2nd recorder frame (10 Hz)
export function ghostFramesFromRecording(rec) {
  const out = [];
  const px = O_BODY + BODY_KEYS.indexOf("x"), py = O_BODY + BODY_KEYS.indexOf("y"), pz = O_BODY + BODY_KEYS.indexOf("z");
  const pyaw = O_BODY + YAW, ppit = O_BODY + BODY_KEYS.indexOf("pitch"), prol = O_BODY + BODY_KEYS.indexOf("roll");
  for (let i = 0; i < rec.n; i += GHOST_STEP) {
    const o = i * FRAME_LEN;
    out.push({ x: rec.data[o + px], y: rec.data[o + py], z: rec.data[o + pz], yaw: rec.data[o + pyaw], pitch: rec.data[o + ppit], roll: rec.data[o + prol] });
  }
  return out;
}
/** Pose of a ghost at time t into `out` (fields x,y,z,yaw,pitch,roll). Returns false past the end. */
export function ghostPose(frames, hz, t, out) {
  const f = t * hz;
  const i = Math.floor(f);
  if (!frames.length || i < 0) return false;
  const a = frames[Math.min(i, frames.length - 1)], b = frames[Math.min(i + 1, frames.length - 1)];
  const k = Math.min(1, f - i);
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k;
  out.yaw = a.yaw + wrapDelta(a.yaw, b.yaw) * k; out.pitch = a.pitch + (b.pitch - a.pitch) * k; out.roll = a.roll + (b.roll - a.roll) * k;
  return i < frames.length - 1;
}
