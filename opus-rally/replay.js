// A run is an input stream, not a movie: the same bytes through the same
// deterministic step reproduce the same drive. Keyframes exist to bound
// divergence when the replaying build is not byte-identical to the recording
// one, and to make seeking O(1) instead of O(stage).
//
// Three tracks are kept, each on its own fixed grid:
//   inputs    — every 1/inputHz second, quantised to a byte per channel
//   keyframes — every 1/keyframeHz second, full state, for correction and seek
//   ghost     — every ghostStepM metres, pose + elapsed time
// The ghost track is indexed by DISTANCE rather than time on purpose. A ghost
// sampled by time tells you where a faster car was; a ghost sampled by distance
// tells you how much time you have lost by the point you are standing at, which
// is the only version that teaches you anything.

import { clamp, lerp, wrapAngle } from "./mathx.js";

export const RUN_TAG = "OR1.";
export const RUN_VERSION = 1;

const ANGLE_SCALE = 32767 / Math.PI;
const SPEED_SCALE = 100;          // cm/s in a Uint16 → 0..655 m/s
const KEY_STRIDE = 16;
const GHOST_CEILING = 400000;     // 2000 km at the default 5 m step

const KEY_TIME = 0;
const KEY_X = 1;
const KEY_VX = 4;
const KEY_YAW = 7;
const KEY_PITCH = 8;
const KEY_ROLL = 9;
const KEY_YAWRATE = 10;
const KEY_DIST = 11;
const KEY_SPEED = 12;
const KEY_RPM = 13;
const KEY_GEAR = 14;
const KEY_FLAGS = 15;

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });

const FLAG_SHIFT_UP = 1;
const FLAG_SHIFT_DOWN = 2;
const FLAG_AIRBORNE = 4;

export function makeReplayInput() {
  return {
    steer: 0, throttle: 0, brake: 0, handbrake: 0, clutch: 0,
    shiftUp: false, shiftDown: false, gear: 0,
  };
}

export function makeReplayState() {
  return {
    timeS: 0,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, roll: 0, yawRate: 0,
    distance: 0, speed: 0, engineRpm: 0, gear: 0, airborne: false,
  };
}

function quantSteer(v) {
  return Math.round(clamp(v, -1, 1) * 127);
}

function quantUnit(v) {
  return Math.round(clamp(v, 0, 1) * 255);
}

function quantAngle(a) {
  return Math.round(clamp(wrapAngle(a) * ANGLE_SCALE, -32767, 32767));
}

function ensure(arr, need) {
  if (arr.length >= need) return arr;
  let n = arr.length || 256;
  while (n < need) n *= 2;
  const out = new arr.constructor(n);
  out.set(arr);
  return out;
}

// Shortest-arc interpolation; a replay that crosses the ±π seam must not spin
// the car through a whole revolution to get back.
function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function createRecorder(opts = {}) {
  const inputHz = Math.max(10, Math.round(opts.inputHz ?? 60));
  const keyframeHz = Math.max(0.2, opts.keyframeHz ?? 1);
  const ghostStepM = Math.max(0.5, opts.ghostStepM ?? 5);
  const keyStride = Math.max(1, Math.round(inputHz / keyframeHz));
  const seconds = Math.max(10, opts.capacitySeconds ?? 420);
  const tickCap = Math.ceil(seconds * inputHz);
  const ghostCap = Math.ceil((opts.capacityMetres ?? 20000) / ghostStepM) + 4;
  const tickCeiling = 4 * 60 * 60 * inputHz;

  let steer = new Int8Array(tickCap);
  let throttle = new Uint8Array(tickCap);
  let brake = new Uint8Array(tickCap);
  let handbrake = new Uint8Array(tickCap);
  let clutch = new Uint8Array(tickCap);
  let flags = new Uint8Array(tickCap);
  let gear = new Int8Array(tickCap);
  let keys = new Float32Array(Math.ceil(tickCap / keyStride + 2) * KEY_STRIDE);
  let gx = new Float32Array(ghostCap);
  let gy = new Float32Array(ghostCap);
  let gz = new Float32Array(ghostCap);
  let gyaw = new Int16Array(ghostCap);
  let gpitch = new Int16Array(ghostCap);
  let groll = new Int16Array(ghostCap);
  let gt = new Uint32Array(ghostCap);
  let gv = new Uint16Array(ghostCap);

  // Scratch held across frames so a frame that spans several input ticks can
  // fill the gap with the input that was actually live at the time.
  const held = makeReplayInput();
  const prev = makeReplayState();
  const blend = makeReplayState();

  const rec = {
    inputHz, keyframeHz, ghostStepM, keyStride,
    meta: Object.assign({}, opts.meta),
    tickCount: 0,
    keyCount: 0,
    ghostCount: 0,
    durationS: 0,
    distanceM: 0,
    started: false,
    overflowed: false,
  };

  let cursor = 0;       // next unwritten tick
  let nextGhostM = 0;

  // The ceiling is tested before the length, not after. `ensure` rounds up to a
  // power of two, so a guard that only ran when a grow was needed would let the
  // recorder settle anywhere inside that overshoot — up to twice the limit it
  // claims — and would leave `overflowed` false the whole way there.
  function growTicks(need) {
    if (need > tickCeiling) { rec.overflowed = true; return false; }
    if (need <= steer.length) return true;
    steer = ensure(steer, need);
    throttle = ensure(throttle, need);
    brake = ensure(brake, need);
    handbrake = ensure(handbrake, need);
    clutch = ensure(clutch, need);
    flags = ensure(flags, need);
    gear = ensure(gear, need);
    keys = ensure(keys, Math.ceil(need / keyStride + 2) * KEY_STRIDE);
    return true;
  }

  function growGhost(need) {
    if (need > GHOST_CEILING) { rec.overflowed = true; return false; }
    if (need <= gx.length) return true;
    gx = ensure(gx, need); gy = ensure(gy, need); gz = ensure(gz, need);
    gyaw = ensure(gyaw, need); gpitch = ensure(gpitch, need); groll = ensure(groll, need);
    gt = ensure(gt, need); gv = ensure(gv, need);
    return true;
  }

  function writeTick(tick, inp) {
    if (!growTicks(tick + 1)) return;
    steer[tick] = quantSteer(inp.steer);
    throttle[tick] = quantUnit(inp.throttle);
    brake[tick] = quantUnit(inp.brake);
    handbrake[tick] = quantUnit(inp.handbrake);
    clutch[tick] = quantUnit(inp.clutch);
    let f = 0;
    if (inp.shiftUp) f |= FLAG_SHIFT_UP;
    if (inp.shiftDown) f |= FLAG_SHIFT_DOWN;
    flags[tick] = f;
    gear[tick] = clamp(Math.round(inp.gear || 0), -1, 12);
    if (tick + 1 > rec.tickCount) rec.tickCount = tick + 1;
  }

  function writeKeyframe(tick, st) {
    const slot = tick / keyStride;
    if (!Number.isInteger(slot)) return;
    // Past the tick ceiling there is no tick for a keyframe to correct, and this
    // track has no growth guard of its own — without this it would keep
    // allocating for as long as the caller kept sampling.
    if (tick > tickCeiling) return;
    const o = slot * KEY_STRIDE;
    if (o + KEY_STRIDE > keys.length) keys = ensure(keys, o + KEY_STRIDE);
    keys[o + KEY_TIME] = tick / inputHz;
    const v = st.vel || ZERO;
    keys[o + KEY_X] = st.pos.x; keys[o + KEY_X + 1] = st.pos.y; keys[o + KEY_X + 2] = st.pos.z;
    keys[o + KEY_VX] = v.x; keys[o + KEY_VX + 1] = v.y; keys[o + KEY_VX + 2] = v.z;
    keys[o + KEY_YAW] = st.yaw;
    keys[o + KEY_PITCH] = st.pitch;
    keys[o + KEY_ROLL] = st.roll;
    keys[o + KEY_YAWRATE] = st.yawRate;
    keys[o + KEY_DIST] = st.distance;
    keys[o + KEY_SPEED] = st.speed;
    keys[o + KEY_RPM] = st.engineRpm;
    keys[o + KEY_GEAR] = st.gear;
    keys[o + KEY_FLAGS] = st.airborne ? FLAG_AIRBORNE : 0;
    if (slot + 1 > rec.keyCount) rec.keyCount = slot + 1;
  }

  function copyState(dst, src) {
    dst.timeS = src.timeS ?? 0;
    dst.pos.x = src.pos.x; dst.pos.y = src.pos.y; dst.pos.z = src.pos.z;
    if (src.vel) { dst.vel.x = src.vel.x; dst.vel.y = src.vel.y; dst.vel.z = src.vel.z; }
    dst.yaw = src.yaw ?? 0; dst.pitch = src.pitch ?? 0; dst.roll = src.roll ?? 0;
    dst.yawRate = src.yawRate ?? 0;
    dst.distance = src.distance ?? 0;
    dst.speed = src.speed ?? 0;
    dst.engineRpm = src.engineRpm ?? 0;
    dst.gear = src.gear ?? 0;
    dst.airborne = !!src.airborne;
  }

  function blendState(a, b, t) {
    const av = a.vel || ZERO;
    const bv = b.vel || ZERO;
    blend.pos.x = lerp(a.pos.x, b.pos.x, t);
    blend.pos.y = lerp(a.pos.y, b.pos.y, t);
    blend.pos.z = lerp(a.pos.z, b.pos.z, t);
    blend.vel.x = lerp(av.x, bv.x, t);
    blend.vel.y = lerp(av.y, bv.y, t);
    blend.vel.z = lerp(av.z, bv.z, t);
    blend.yaw = lerpAngle(a.yaw ?? 0, b.yaw ?? 0, t);
    blend.pitch = lerpAngle(a.pitch ?? 0, b.pitch ?? 0, t);
    blend.roll = lerpAngle(a.roll ?? 0, b.roll ?? 0, t);
    blend.yawRate = lerp(a.yawRate ?? 0, b.yawRate ?? 0, t);
    blend.distance = lerp(a.distance ?? 0, b.distance ?? 0, t);
    blend.speed = lerp(a.speed ?? 0, b.speed ?? 0, t);
    blend.engineRpm = lerp(a.engineRpm ?? 0, b.engineRpm ?? 0, t);
    blend.gear = t < 0.5 ? a.gear : b.gear;
    blend.airborne = t < 0.5 ? a.airborne : b.airborne;
    return blend;
  }

  // Fills every ghost slot the car passed since the last sample, interpolating
  // between the two frames so slot i really is the pose at i * ghostStepM.
  function writeGhost(a, b, timeA, timeB) {
    const da = a.distance;
    const db = b.distance;
    if (!(db > da)) return;
    while (nextGhostM <= db) {
      const idx = Math.round(nextGhostM / ghostStepM);
      if (!growGhost(idx + 1)) return;
      const t = db > da ? clamp((nextGhostM - da) / (db - da), 0, 1) : 1;
      gx[idx] = lerp(a.pos.x, b.pos.x, t);
      gy[idx] = lerp(a.pos.y, b.pos.y, t);
      gz[idx] = lerp(a.pos.z, b.pos.z, t);
      gyaw[idx] = quantAngle(lerpAngle(a.yaw ?? 0, b.yaw ?? 0, t));
      gpitch[idx] = quantAngle(lerpAngle(a.pitch ?? 0, b.pitch ?? 0, t));
      groll[idx] = quantAngle(lerpAngle(a.roll ?? 0, b.roll ?? 0, t));
      // distanceAtTime bisects this track, so it has to be non-decreasing. A
      // paused or rewound frame — a stalled tab, a clock the caller reset — can
      // hand back a smaller time at a greater distance, and the bisect would
      // then answer with the wrong distance rather than merely an odd one.
      const ms = Math.max(0, Math.round(lerp(timeA, timeB, t) * 1000));
      gt[idx] = idx > 0 ? Math.max(gt[idx - 1], ms) : ms;
      gv[idx] = clamp(Math.round(lerp(a.speed ?? 0, b.speed ?? 0, t) * SPEED_SCALE), 0, 65535);
      if (idx + 1 > rec.ghostCount) rec.ghostCount = idx + 1;
      nextGhostM += ghostStepM;
    }
  }

  rec.reset = function reset(meta) {
    rec.meta = Object.assign({}, meta || opts.meta);
    rec.tickCount = 0;
    rec.keyCount = 0;
    rec.ghostCount = 0;
    rec.durationS = 0;
    rec.distanceM = 0;
    rec.started = false;
    rec.overflowed = false;
    cursor = 0;
    nextGhostM = 0;
  };

  // `state` is the car AT timeS, `input` is what is about to be applied over the
  // step that follows it. Playback relies on that ordering.
  rec.sample = function sample(timeS, input, state) {
    // The epsilon is load-bearing: 49/60*60 is 48.999999999999993, and without
    // it every so often a frame lands on the previous tick and the whole input
    // stream shifts by one against the state it was recorded with.
    const idx = Math.floor(timeS * inputHz + 1e-6);
    if (idx < 0) return;
    if (!rec.started) {
      rec.started = true;
      cursor = 0;
      copyState(prev, state);
      prev.timeS = timeS;
      writeKeyframe(0, state);
      // Slot 0 is the start line whether or not the car has moved.
      if (rec.ghostCount === 0 && growGhost(1)) {
        gx[0] = state.pos.x; gy[0] = state.pos.y; gz[0] = state.pos.z;
        gyaw[0] = quantAngle(state.yaw ?? 0);
        gpitch[0] = quantAngle(state.pitch ?? 0);
        groll[0] = quantAngle(state.roll ?? 0);
        gt[0] = Math.max(0, Math.round(timeS * 1000));
        gv[0] = clamp(Math.round((state.speed ?? 0) * SPEED_SCALE), 0, 65535);
        rec.ghostCount = 1;
        nextGhostM = ghostStepM;
      }
    }

    const span = Math.max(1e-6, timeS - prev.timeS);
    while (cursor < idx) {
      writeTick(cursor, held);
      const at = clamp(((cursor + 1) / inputHz - prev.timeS) / span, 0, 1);
      if ((cursor + 1) % keyStride === 0) writeKeyframe(cursor + 1, blendState(prev, state, at));
      cursor += 1;
    }
    writeTick(idx, input);
    if (idx % keyStride === 0) writeKeyframe(idx, state);
    cursor = idx + 1;

    writeGhost(prev, state, prev.timeS, timeS);

    copyState(prev, state);
    prev.timeS = timeS;
    rec.durationS = Math.max(rec.durationS, timeS);
    rec.distanceM = Math.max(rec.distanceM, state.distance ?? 0);
    // Field by field, not for-in: this runs every frame and a key enumeration
    // allocates.
    held.steer = input.steer;
    held.throttle = input.throttle;
    held.brake = input.brake;
    held.handbrake = input.handbrake;
    held.clutch = input.clutch;
    held.shiftUp = input.shiftUp;
    held.shiftDown = input.shiftDown;
    held.gear = input.gear;
  };

  rec.finish = function finish(finalTimeS, finalState) {
    if (finalState) {
      writeGhost(prev, finalState, prev.timeS, finalTimeS ?? prev.timeS);
      rec.distanceM = Math.max(rec.distanceM, finalState.distance ?? 0);
    }
    if (typeof finalTimeS === "number") rec.durationS = Math.max(rec.durationS, finalTimeS);
    return {
      version: RUN_VERSION,
      meta: Object.assign({}, rec.meta),
      inputHz, keyframeHz, ghostStepM, keyStride,
      tickCount: rec.tickCount,
      keyCount: rec.keyCount,
      ghostCount: rec.ghostCount,
      durationS: rec.durationS,
      distanceM: rec.distanceM,
      truncated: rec.overflowed,
      steer: steer.subarray(0, rec.tickCount),
      throttle: throttle.subarray(0, rec.tickCount),
      brake: brake.subarray(0, rec.tickCount),
      handbrake: handbrake.subarray(0, rec.tickCount),
      clutch: clutch.subarray(0, rec.tickCount),
      flags: flags.subarray(0, rec.tickCount),
      gear: gear.subarray(0, rec.tickCount),
      keys: keys.subarray(0, rec.keyCount * KEY_STRIDE),
      gx: gx.subarray(0, rec.ghostCount),
      gy: gy.subarray(0, rec.ghostCount),
      gz: gz.subarray(0, rec.ghostCount),
      gyaw: gyaw.subarray(0, rec.ghostCount),
      gpitch: gpitch.subarray(0, rec.ghostCount),
      groll: groll.subarray(0, rec.ghostCount),
      gt: gt.subarray(0, rec.ghostCount),
      gv: gv.subarray(0, rec.ghostCount),
    };
  };

  return rec;
}

export function inputAt(run, tick, out) {
  const o = out || makeReplayInput();
  const i = clamp(tick | 0, 0, Math.max(0, run.tickCount - 1));
  if (run.tickCount === 0) {
    o.steer = 0; o.throttle = 0; o.brake = 0; o.handbrake = 0; o.clutch = 0;
    o.shiftUp = false; o.shiftDown = false; o.gear = 0;
    return o;
  }
  o.steer = run.steer[i] / 127;
  o.throttle = run.throttle[i] / 255;
  o.brake = run.brake[i] / 255;
  o.handbrake = run.handbrake[i] / 255;
  o.clutch = run.clutch[i] / 255;
  o.shiftUp = (run.flags[i] & FLAG_SHIFT_UP) !== 0;
  o.shiftDown = (run.flags[i] & FLAG_SHIFT_DOWN) !== 0;
  o.gear = run.gear[i];
  return o;
}

export function keyframeAt(run, slot, out) {
  const o = out || makeReplayState();
  if (run.keyCount === 0) return o;
  const i = clamp(slot | 0, 0, run.keyCount - 1);
  const b = i * KEY_STRIDE;
  o.timeS = run.keys[b + KEY_TIME];
  o.pos.x = run.keys[b + KEY_X]; o.pos.y = run.keys[b + KEY_X + 1]; o.pos.z = run.keys[b + KEY_X + 2];
  o.vel.x = run.keys[b + KEY_VX]; o.vel.y = run.keys[b + KEY_VX + 1]; o.vel.z = run.keys[b + KEY_VX + 2];
  o.yaw = run.keys[b + KEY_YAW];
  o.pitch = run.keys[b + KEY_PITCH];
  o.roll = run.keys[b + KEY_ROLL];
  o.yawRate = run.keys[b + KEY_YAWRATE];
  o.distance = run.keys[b + KEY_DIST];
  o.speed = run.keys[b + KEY_SPEED];
  o.engineRpm = run.keys[b + KEY_RPM];
  o.gear = run.keys[b + KEY_GEAR];
  o.airborne = (run.keys[b + KEY_FLAGS] & FLAG_AIRBORNE) !== 0;
  return o;
}

// The adapter is how a replay stays free of physics.js: anything that can be
// stepped with an input, read into a state and written back from one can be
// replayed, which is also what lets the tests use a two-line stub car.
export function createPlayback(run, adapter, opts = {}) {
  const dt = 1 / run.inputHz;
  const tolerance = opts.tolerance ?? 0.25;
  const correct = opts.correct !== false;
  const input = makeReplayInput();
  const kf = makeReplayState();
  const live = makeReplayState();

  const player = {
    tick: 0,
    timeS: 0,
    done: run.tickCount === 0,
    maxDrift: 0,
    lastDrift: 0,
    corrections: 0,
    input,
  };

  function driftFrom(state, ref) {
    const dx = state.pos.x - ref.pos.x;
    const dy = state.pos.y - ref.pos.y;
    const dz = state.pos.z - ref.pos.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  player.reset = function reset() {
    player.tick = 0;
    player.timeS = 0;
    player.maxDrift = 0;
    player.lastDrift = 0;
    player.corrections = 0;
    player.done = run.tickCount === 0;
    if (run.keyCount > 0 && adapter.setState) adapter.setState(keyframeAt(run, 0, kf));
  };

  // One tick: check against the keyframe grid *before* applying this tick's
  // input, because that is the instant the keyframe was captured at.
  player.step = function step() {
    if (player.done) return false;
    const slot = player.tick / run.keyStride;
    if (Number.isInteger(slot) && slot < run.keyCount && adapter.getState) {
      keyframeAt(run, slot, kf);
      adapter.getState(live);
      const drift = driftFrom(live, kf);
      player.lastDrift = drift;
      if (drift > player.maxDrift) player.maxDrift = drift;
      if (correct && drift > tolerance && adapter.setState) {
        adapter.setState(kf);
        player.corrections += 1;
      }
    }
    inputAt(run, player.tick, input);
    adapter.step(input, dt);
    player.tick += 1;
    player.timeS = player.tick * dt;
    if (player.tick >= run.tickCount) player.done = true;
    return true;
  };

  player.runTo = function runTo(tick) {
    const target = Math.min(tick, run.tickCount);
    while (player.tick < target && player.step());
    return player.tick;
  };

  player.playAll = function playAll() {
    return player.runTo(run.tickCount);
  };

  // Seek is a keyframe restore plus a short re-sim, so scrubbing a replay costs
  // at most one keyframe interval of simulation.
  player.seek = function seek(timeS) {
    const tick = clamp(Math.round(timeS * run.inputHz), 0, run.tickCount);
    const slot = clamp(Math.floor(tick / run.keyStride), 0, Math.max(0, run.keyCount - 1));
    if (run.keyCount > 0 && adapter.setState) adapter.setState(keyframeAt(run, slot, kf));
    player.tick = slot * run.keyStride;
    player.timeS = player.tick / run.inputHz;
    player.done = player.tick >= run.tickCount;
    return player.runTo(tick);
  };

  player.reset();
  return player;
}

export function createGhost(source, opts = {}) {
  const run = typeof source === "string" ? decodeRun(source) : source;
  const stepM = run && run.ghostStepM ? run.ghostStepM : 5;
  const count = run ? run.ghostCount : 0;
  const scale = 1 / ANGLE_SCALE;

  const ghost = {
    run,
    valid: !!run && count > 1,
    stepM,
    count,
    label: opts.label ?? (run && run.meta ? run.meta.label : "") ?? "",
    totalMs: count > 0 ? run.gt[count - 1] : 0,
    totalM: count > 0 ? (count - 1) * stepM : 0,
    distance: 0,
    timeMs: 0,
    deltaMs: 0,
    gapM: 0,
    speed: 0,
    finished: false,
    pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
  };

  ghost.timeAtDistance = function timeAtDistance(m) {
    if (!ghost.valid) return 0;
    if (m <= 0) return run.gt[0];
    if (m >= ghost.totalM) return run.gt[count - 1];
    const u = m / stepM;
    const i = Math.min(count - 2, Math.floor(u));
    return lerp(run.gt[i], run.gt[i + 1], u - i);
  };

  ghost.speedAtDistance = function speedAtDistance(m) {
    if (!ghost.valid) return 0;
    const u = clamp(m / stepM, 0, count - 1);
    const i = Math.min(count - 2, Math.floor(u));
    return lerp(run.gv[i], run.gv[i + 1], u - i) / SPEED_SCALE;
  };

  ghost.poseAtDistance = function poseAtDistance(m, out) {
    const o = out || ghost.pose;
    if (!ghost.valid) return o;
    const u = clamp(m / stepM, 0, count - 1);
    const i = Math.min(count - 2, Math.floor(u));
    const t = u - i;
    o.x = lerp(run.gx[i], run.gx[i + 1], t);
    o.y = lerp(run.gy[i], run.gy[i + 1], t);
    o.z = lerp(run.gz[i], run.gz[i + 1], t);
    o.yaw = lerpAngle(run.gyaw[i] * scale, run.gyaw[i + 1] * scale, t);
    o.pitch = lerpAngle(run.gpitch[i] * scale, run.gpitch[i + 1] * scale, t);
    o.roll = lerpAngle(run.groll[i] * scale, run.groll[i + 1] * scale, t);
    return o;
  };

  // Inverse lookup for the on-road gap. gt is monotone because it is elapsed
  // time along a monotone distance axis, so a bisect is safe.
  ghost.distanceAtTime = function distanceAtTime(ms) {
    if (!ghost.valid) return 0;
    if (ms <= run.gt[0]) return 0;
    if (ms >= run.gt[count - 1]) return ghost.totalM;
    let lo = 0;
    let hi = count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (run.gt[mid] <= ms) lo = mid; else hi = mid;
    }
    const span = run.gt[hi] - run.gt[lo];
    const t = span > 0 ? (ms - run.gt[lo]) / span : 0;
    return (lo + t) * stepM;
  };

  ghost.reset = function reset() {
    ghost.distance = 0;
    ghost.timeMs = ghost.valid ? run.gt[0] : 0;
    ghost.deltaMs = 0;
    ghost.gapM = 0;
    ghost.speed = 0;
    ghost.finished = false;
    ghost.poseAtDistance(0, ghost.pose);
  };

  // Positive delta = the player is behind. Positive gap = the ghost is further
  // up the road right now.
  ghost.update = function update(playerDistance, playerTimeMs) {
    if (!ghost.valid) return ghost;
    const d = clamp(playerDistance, 0, ghost.totalM);
    ghost.distance = d;
    ghost.timeMs = ghost.timeAtDistance(d);
    ghost.deltaMs = playerTimeMs - ghost.timeMs;
    ghost.gapM = ghost.distanceAtTime(playerTimeMs) - playerDistance;
    ghost.speed = ghost.speedAtDistance(d);
    ghost.finished = playerTimeMs >= ghost.totalMs;
    ghost.poseAtDistance(d, ghost.pose);
    return ghost;
  };

  ghost.reset();
  return ghost;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INV = (() => {
  const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i += 1) m[B64.charCodeAt(i)] = i;
  m["+".charCodeAt(0)] = 62;
  m["/".charCodeAt(0)] = 63;
  return m;
})();

function base64Encode(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
  }
  return out;
}

function base64Decode(text) {
  const n = text.length;
  const full = n >> 2;
  const rest = n & 3;
  if (rest === 1) return null;
  const size = full * 3 + (rest === 2 ? 1 : rest === 3 ? 2 : 0);
  const out = new Uint8Array(size);
  let o = 0;
  let i = 0;
  const at = (k) => {
    const c = text.charCodeAt(k);
    return c < 128 ? B64_INV[c] : -1;
  };
  for (; i + 3 < n; i += 4) {
    const a = at(i); const b = at(i + 1); const c = at(i + 2); const d = at(i + 3);
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (v >> 16) & 255; out[o++] = (v >> 8) & 255; out[o++] = v & 255;
  }
  if (rest === 2) {
    const a = at(i); const b = at(i + 1);
    if (a < 0 || b < 0) return null;
    out[o++] = ((a << 2) | (b >> 4)) & 255;
  } else if (rest === 3) {
    const a = at(i); const b = at(i + 1); const c = at(i + 2);
    if (a < 0 || b < 0 || c < 0) return null;
    out[o++] = ((a << 2) | (b >> 4)) & 255;
    out[o++] = (((b & 15) << 4) | (c >> 2)) & 255;
  }
  return out;
}

// PackBits: control < 128 means (c+1) literals, otherwise (c-125) copies of the
// next byte. A pinned throttle channel is nearly all runs, which is where the
// ten-minute stage stops being too big to keep.
function rleEncode(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    let run = 1;
    while (run < 130 && i + run < src.length && src[i + run] === src[i]) run += 1;
    if (run >= 3) {
      out.push(128 + (run - 3), src[i]);
      i += run;
      continue;
    }
    const start = i;
    while (i < src.length && i - start < 128) {
      const a = src[i];
      if (i + 2 < src.length && src[i + 1] === a && src[i + 2] === a) break;
      i += 1;
    }
    const len = i - start;
    out.push(len - 1);
    for (let k = 0; k < len; k += 1) out.push(src[start + k]);
  }
  return Uint8Array.from(out);
}

function rleDecode(src, expected) {
  const out = new Uint8Array(expected);
  let o = 0;
  let i = 0;
  while (i < src.length && o < expected) {
    const c = src[i++];
    if (c < 128) {
      const len = c + 1;
      if (i + len > src.length || o + len > expected) return null;
      for (let k = 0; k < len; k += 1) out[o++] = src[i++];
    } else {
      const len = c - 125;
      if (i >= src.length || o + len > expected) return null;
      const v = src[i++];
      for (let k = 0; k < len; k += 1) out[o++] = v;
    }
  }
  return o === expected ? out : null;
}

// Explicit little-endian so a time shared between machines decodes the same
// everywhere, rather than inheriting the exporting host's byte order.
function toBytes(arr) {
  const bpe = arr.BYTES_PER_ELEMENT;
  const out = new Uint8Array(arr.length * bpe);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < arr.length; i += 1) {
    const o = i * bpe;
    if (arr instanceof Float32Array) dv.setFloat32(o, arr[i], true);
    else if (arr instanceof Uint32Array) dv.setUint32(o, arr[i], true);
    else if (arr instanceof Int16Array) dv.setInt16(o, arr[i], true);
    else if (arr instanceof Uint16Array) dv.setUint16(o, arr[i], true);
    else if (arr instanceof Int8Array) dv.setInt8(o, arr[i]);
    else dv.setUint8(o, arr[i]);
  }
  return out;
}

function fromBytes(bytes, Ctor, count) {
  const out = new Ctor(count);
  const bpe = out.BYTES_PER_ELEMENT;
  if (bytes.length < count * bpe) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i += 1) {
    const o = i * bpe;
    if (out instanceof Float32Array) out[i] = dv.getFloat32(o, true);
    else if (out instanceof Uint32Array) out[i] = dv.getUint32(o, true);
    else if (out instanceof Int16Array) out[i] = dv.getInt16(o, true);
    else if (out instanceof Uint16Array) out[i] = dv.getUint16(o, true);
    else if (out instanceof Int8Array) out[i] = dv.getInt8(o);
    else out[i] = dv.getUint8(o);
  }
  return out;
}

const PLANES = [
  ["steer", Int8Array, "tickCount"],
  ["throttle", Uint8Array, "tickCount"],
  ["brake", Uint8Array, "tickCount"],
  ["handbrake", Uint8Array, "tickCount"],
  ["clutch", Uint8Array, "tickCount"],
  ["flags", Uint8Array, "tickCount"],
  ["gear", Int8Array, "tickCount"],
  ["keys", Float32Array, "keyFloats"],
  ["gx", Float32Array, "ghostCount"],
  ["gy", Float32Array, "ghostCount"],
  ["gz", Float32Array, "ghostCount"],
  ["gyaw", Int16Array, "ghostCount"],
  ["gpitch", Int16Array, "ghostCount"],
  ["groll", Int16Array, "ghostCount"],
  ["gt", Uint32Array, "ghostCount"],
  ["gv", Uint16Array, "ghostCount"],
];

function fnv1a(bytes) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function utf8Encode(text) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const out = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
    else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return Uint8Array.from(out);
}

function utf8Decode(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
}

export function encodeRun(run) {
  if (!run) return "";
  const header = {
    v: RUN_VERSION,
    ih: run.inputHz,
    kh: run.keyframeHz,
    ks: run.keyStride,
    gs: run.ghostStepM,
    tc: run.tickCount,
    kc: run.keyCount,
    gc: run.ghostCount,
    d: Math.round(run.durationS * 1000),
    m: Math.round(run.distanceM * 100),
    meta: run.meta || {},
  };
  const headerBytes = utf8Encode(JSON.stringify(header));
  const chunks = [];
  let total = 6 + headerBytes.length;
  for (const [key] of PLANES) {
    const arr = run[key];
    const packed = arr && arr.length ? rleEncode(toBytes(arr)) : new Uint8Array(0);
    chunks.push(packed);
    total += 4 + packed.length;
  }
  const body = new Uint8Array(total);
  const dv = new DataView(body.buffer);
  dv.setUint16(0, RUN_VERSION, true);
  dv.setUint32(2, headerBytes.length, true);
  body.set(headerBytes, 6);
  let o = 6 + headerBytes.length;
  for (const packed of chunks) {
    dv.setUint32(o, packed.length, true);
    o += 4;
    body.set(packed, o);
    o += packed.length;
  }
  const out = new Uint8Array(body.length + 4);
  new DataView(out.buffer).setUint32(0, fnv1a(body), true);
  out.set(body, 4);
  return RUN_TAG + base64Encode(out);
}

// Never throws: a pasted time is untrusted text, and a mangled paste must read
// as "no run" rather than take the menu down with it.
export function decodeRun(text) {
  try {
    if (typeof text !== "string" || !text.startsWith(RUN_TAG)) return null;
    const raw = base64Decode(text.slice(RUN_TAG.length));
    if (!raw || raw.length < 12) return null;
    const dv0 = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const checksum = dv0.getUint32(0, true);
    const body = raw.subarray(4);
    if (fnv1a(body) !== checksum) return null;
    const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    if (dv.getUint16(0, true) !== RUN_VERSION) return null;
    const hlen = dv.getUint32(2, true);
    if (6 + hlen > body.length) return null;
    const header = JSON.parse(utf8Decode(body.subarray(6, 6 + hlen)));
    // The counts drive every allocation below, and a pasted run is a stranger's
    // bytes: a header claiming a billion ticks must be rejected, not honoured.
    const sane = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
    if (!sane(header.tc, 2000000) || !sane(header.kc, 200000) || !sane(header.gc, 400000)) return null;
    if (!(header.ih >= 10 && header.ih <= 480) || !(header.ks >= 1 && header.ks <= 100000)) return null;
    if (!(header.gs > 0 && header.gs <= 1000)) return null;
    const run = {
      version: header.v,
      meta: header.meta || {},
      inputHz: header.ih,
      keyframeHz: header.kh,
      keyStride: header.ks,
      ghostStepM: header.gs,
      tickCount: header.tc,
      keyCount: header.kc,
      ghostCount: header.gc,
      durationS: header.d / 1000,
      distanceM: header.m / 100,
      truncated: false,
    };
    const counts = {
      tickCount: run.tickCount,
      keyFloats: run.keyCount * KEY_STRIDE,
      ghostCount: run.ghostCount,
    };
    let o = 6 + hlen;
    for (const [key, Ctor, countKey] of PLANES) {
      if (o + 4 > body.length) return null;
      const len = dv.getUint32(o, true);
      o += 4;
      if (o + len > body.length) return null;
      const count = counts[countKey] | 0;
      const packed = body.subarray(o, o + len);
      o += len;
      const bytes = count > 0 ? rleDecode(packed, count * Ctor.BYTES_PER_ELEMENT) : new Uint8Array(0);
      if (count > 0 && !bytes) return null;
      run[key] = count > 0 ? fromBytes(bytes, Ctor, count) : new Ctor(0);
      if (count > 0 && !run[key]) return null;
    }
    return run;
  } catch (err) {
    return null;
  }
}

export function runByteSize(run) {
  if (!run) return 0;
  let n = 0;
  for (const [key] of PLANES) {
    const arr = run[key];
    if (arr) n += arr.byteLength;
  }
  return n;
}
